'use strict';
// Local real-engine smoke of the four systems games. Does not access any device.
const fs=require('fs'),path=require('path'),http=require('http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright-core');
const {load}=require('./support');
const assiRoot=process.env.ASSI_ROOT||path.resolve(__dirname,'../../../Assi');
const {FACTORY}=require(path.join(assiRoot,'scripts/games/harness.js'));
const artifacts=path.resolve(process.env.ASSI_TEST_ARTIFACTS||path.join(__dirname,'../../build/artifacts'));
const ids=['infinity-layers','alchemist','asteroid-colony','subway'];
async function run(){
  fs.mkdirSync(artifacts,{recursive:true});
  const x=load(),scratch=fs.mkdtempSync(path.join(artifacts,'assi-systems-scenes-'));
  for(const id of ids)fs.cpSync(path.resolve(__dirname,'../../',id),path.join(x.env.root,'modules/games',id),{recursive:true,filter:p=>!/[\\/](tests|_data)([\\/]|$)/.test(p)});
  fs.cpSync(path.join(FACTORY,'ui/kit'),path.join(x.env.root,'ui/kit'),{recursive:true});
  const faults=[];
  const bridge=`<script>window.assi={call:async function(module,fn,...args){const r=await fetch('/__call',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({module,fn,args})});const o=await r.json();if(o.error)throw Error(o.error);return o.value;},native:async()=>({}),stage:async()=>true,on:()=>()=>{},back:()=>{},open:async()=>true};</script>`;
  const capture=`<script>window.__worlds=[];window.__pulses=[];const originalScene=Game.scene;if(location.search.includes('fallback=1'))Game.scene=undefined;else Game.scene=function(o){const v=originalScene(o),pulse=v.pulse;v.pulse=function(...args){__pulses.push(args[0]);return pulse.apply(v,args)};window.__worlds.push(v);return v};</script>`;
  const server=http.createServer(async(req,res)=>{
    try{
      if(req.url==='/__call'){let body='';for await(const data of req)body+=data;const q=JSON.parse(body),mod=x.env.require(q.module);if(typeof mod[q.fn]!=='function')throw Error('Unknown local bridge operation '+q.fn);const value=await mod[q.fn].apply(mod,q.args);res.setHeader('Content-Type','application/json');res.end(JSON.stringify({value}));return;}
      const relative=decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/,''),file=path.resolve(x.env.root,relative);
      if(!file.startsWith(x.env.root+path.sep)||!fs.existsSync(file)){res.statusCode=404;res.end('Missing');return;}
      const ext=path.extname(file);res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.svg':'image/svg+xml'})[ext]||'application/octet-stream');
      let value=fs.readFileSync(file);if(ext==='.html')value=value.toString().replace('<body>','<body>'+bridge).replace('<script src="game.js"></script>',capture+'<script src="game.js"></script>');res.end(value);
    }catch(e){res.statusCode=500;res.end(JSON.stringify({error:e.message}));}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const executable=process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
  const browser=await chromium.launch({headless:true,executablePath:executable});
  const report=[];
  try{
    for(const id of ids){
      const page=await browser.newPage({viewport:{width:760,height:900},reducedMotion:'reduce'});
      page.on('pageerror',e=>faults.push(id+': '+e.message));page.on('console',m=>{if(m.type()==='error'&&m.text().includes('Game.scene'))faults.push(id+': '+m.text());});
      await page.goto('http://127.0.0.1:'+server.address().port+'/modules/games/'+id+'/ui/index.html');
      await page.waitForSelector('.world-scene canvas',{timeout:20000});
      assert.equal(await page.evaluate(()=>window.__worlds.length),1);
      for(const width of [344,760]){
        await page.setViewportSize({width,height:900});
        for(let v=0;v<2;v++){
          await page.locator('.world-scene-tabs button').nth(v).click();await page.waitForTimeout(75);
          const status=await page.evaluate(()=>({bad:__worlds[0].inspect().failed,width:document.documentElement.scrollWidth,screen:innerWidth,canvas:document.querySelector('.world-scene canvas').width}));
          assert.equal(status.bad,false,id+' initial draw');assert.ok(status.width<=status.screen,id+' overflow '+width);assert.ok(status.canvas>0);
        }
      }
      await page.locator('.world-scene-tabs button').first().click();
      const initial=path.join(scratch,id+'-start.png');await page.locator('.world-scene').screenshot({path:initial});
      const result=await page.evaluate(id=>{
        const g=__game;
        if(id==='infinity-layers'){const before=g.state.run.tiers[0].bought;document.querySelector('[data-tier="0"]').click();return g.state.run.tiers[0].bought>before;}
        if(id==='asteroid-colony'){const before=g.state.run.drones[0];document.querySelector('.ac-buy').click();return g.state.run.drones[0]>before;}
        if(id==='subway'){g.act(s=>{s.run.money='1e8'});g.redraw();const before=g.state.run.lines[0].stations;document.querySelector('#buy-station').click();return g.state.run.lines[0].stations>before;}
        const rec=GameSim.frontier(g.state)[0],before=g.state.meta.bookN;
        rec.ins.forEach(key=>{[...document.querySelectorAll('.a-tile')].find(e=>e.dataset.key===key).click()});
        return g.state.meta.bookN>before;
      },id);
      assert.equal(result,true,id+' real UI action');
      // Close a discovery sheet before switching between all unchanged economy tabs.
      await page.evaluate(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Дальше');if(b)b.click()});
      if(id==='alchemist'){
        const fx=await page.evaluate(()=>__pulses);assert.ok(fx.includes('discovery'),'real discovery requests its own effect (hidden scenes suppress animation)');
        for(let i=0;i<5;i++){await page.locator('.a-tab').nth(i).click();await page.waitForTimeout(30);}await page.locator('.a-tab').first().click();
      }
      if(id==='asteroid-colony'){for(let i=0;i<5;i++){await page.locator('.ac-tab').nth(i).click();await page.waitForTimeout(30);}await page.locator('.ac-tab').first().click();}
      await page.evaluate(id=>{
        const g=__game,sim=GameSim;g.act(s=>{
          if(id==='infinity-layers'){s.meta.foldUnlocked=true;s.meta.collapseUnlocked=true;s.layers.compression.count=8;s.meta.highestLayer=4;s.run.tiers.forEach((a,i)=>{a.amount='1e50';a.bought=200+i});s.run.points='1e90';sim.syncOut(s,g.config);}
          if(id==='asteroid-colony'){sim.RESEARCH.forEach(r=>s.run.research[r.id]=true);sim.BUILDINGS.forEach(b=>s.run.b[b.id]=3);for(const k of ['ore','ice','alloy','water','fuel','chip','data'])s.run[k]=1000000;s.run.drones=[30,15,8,4,2,1,1,1];s.run.panels=20;s.run.reactor=3;s.run.dome=2;s.run.colonists=20;s.run.hangar=2;s.run.auto.dispatch=false;s.run.auto.smelt=false;sim.tick(s,1,{config:g.config,now:Date.now(),rng:g.rng,mult:1});}
          if(id==='alchemist'){sim.tree().list.slice(0,48).forEach(e=>{s.meta.book[e.key]=Date.now();s.run.store[e.key]=25});s.meta.bookN=Object.keys(s.meta.book).length;s.run.lv.coil=3;s.run.lv.mortar=1;const rec=Object.values(sim.tree().recipes).find(r=>r.ins.every(k=>s.meta.book[k])&&s.meta.book[r.r]);s.meta.opened[rec.k]=Date.now();s.run.cubes=[{k:rec.k,p:.45,fire:0},{k:rec.k,p:.7,fire:0}];}
          if(id==='subway'){s.run.money='1e50';for(let i=0;i<6;i++)sim.openLine(s,g.config);s.run.lines.forEach(l=>{l.stations=250;l.trains=35;l.dispatcher=true});s.run.transfers=[[1,2],[1,3]];s.run.ring=true;}
        });g.redraw();
      },id);
      for(let v=0;v<2;v++){await page.locator('.world-scene-tabs button').nth(v).click();await page.waitForTimeout(75);assert.equal(await page.evaluate(()=>__worlds[0].inspect().failed),false,id+' late draw');await page.locator('.world-scene').screenshot({path:path.join(scratch,id+'-late-'+v+'.png')});}
      const motion=await page.evaluate(()=>__worlds[0].inspect());assert.equal(motion.reducedMotion,true,'shared runtime follows reduced motion; state updates can still schedule one static frame');
      const reset=await page.evaluate(id=>{
        const g=__game,sim=GameSim,ctx={config:g.config,now:Date.now(),rng:g.rng,mult:1};
        const result=g.act(s=>{
          if(id==='infinity-layers'){s.run.points='1e80';sim.syncOut(s,g.config);return sim.reset(s,'compression',ctx);}
          if(id==='alchemist'){s.run.earned='6.4e7';return Core.prestige(sim,g.game,s,'stone',ctx).ok;}
          if(id==='asteroid-colony'){s.run.engine=true;s.run.mined='1e15';return Core.prestige(sim,g.game,s,'jump',ctx).ok;}
          s.run.earned='1e30';return Core.prestige(sim,g.game,s,'city',ctx).ok;
        });g.redraw();
        const s=g.state;return{ok:result,cleared:id==='infinity-layers'?s.run.tiers.every(x=>!Big.gt(x.amount,0)):id==='alchemist'?Object.keys(s.meta.book).length>=48&&s.run.bought===0:id==='asteroid-colony'?Object.values(s.run.b).every(x=>x===0):s.run.lines.length===1&&!s.run.ring&&s.run.transfers.length===0};
      },id);
      assert.equal(reset.ok,true,id+' actual prestige');assert.equal(reset.cleared,true,id+' current production reset');
      await page.locator('.world-scene-tabs button').first().click();await page.waitForTimeout(75);assert.equal(await page.evaluate(()=>__worlds[0].inspect().failed),false);
      await page.locator('.world-scene').screenshot({path:path.join(scratch,id+'-prestige.png')});
      await page.goto('http://127.0.0.1:'+server.address().port+'/modules/games/'+id+'/ui/index.html?fallback=1');await page.waitForFunction(()=>window.__game&&document.querySelector('.g-actions button'));
      assert.equal(await page.locator('.world-scene').count(),0,'old engine fallback');
      report.push({id,views:2,widths:[344,760],realPurchase:true,late:true,actualPrestige:true,fallback:true,reducedMotion:true,initial});await page.close();
    }
    assert.deepEqual(faults,[]);console.log(JSON.stringify({report,errors:faults,scratch},null,2));
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve));x.env.close();}
}
run().catch(e=>{console.error(e);process.exitCode=1});
