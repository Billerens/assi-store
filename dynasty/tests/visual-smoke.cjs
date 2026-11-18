// Local synthetic four-world integration smoke. No device, personal saves, or remote requests.
const fs=require('fs'),path=require('path'),http=require('http'),assert=require('node:assert/strict');
const storeRoot=path.resolve(__dirname,'../..');
const axikoRoot=process.env.AXIKO_ROOT||path.resolve(storeRoot,'../Axiko');
const H=require(path.join(axikoRoot,'scripts/games/harness.js'));
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright-core');
const ids=['dynasty','library','garden','dragon-hoard'];
const OUT=path.join(path.resolve(process.env.AXIKO_TEST_ARTIFACTS||path.join(storeRoot,'build/artifacts')),'worlds-visual-smoke'),env=H.workspace({fixture:false});fs.mkdirSync(OUT,{recursive:true});
for(const part of ['ui/kit','themes'])if(fs.existsSync(path.join(H.FACTORY,part)))fs.cpSync(path.join(H.FACTORY,part),path.join(env.root,part),{recursive:true});
for(const id of ids){const src=path.join(storeRoot,id),dest=path.join(env.root,'modules/games',id);for(const file of fs.readdirSync(src))if(!['tests','README.md','store.json','_data'].includes(file))fs.cpSync(path.join(src,file),path.join(dest,file),{recursive:true});if(fs.existsSync(path.join(src,'_data')))fs.cpSync(path.join(src,'_data'),path.join(env.root,'data/games',id),{recursive:true});}
const bridge=`<script>window.axiko={platform:'web',call:async function(module,fn,...args){let r=await fetch('/__call',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({module,fn,args})});let x=await r.json();if(x.error)throw Error(x.error);return x.value;},native:async()=>({}),stage:async()=>true,on:()=>()=>{},back:()=>{},open:()=>{},chat:()=>{}};</script>`;
const server=http.createServer(async(req,res)=>{try{
 if(req.url==='/__call'){let raw='';for await(const b of req)raw+=b;const x=JSON.parse(raw);if(!x.module.startsWith('modules/games/'))throw Error('Unexpected module');const m=env.require(x.module);const value=await m[x.fn](...x.args);res.setHeader('Content-Type','application/json');res.end(JSON.stringify({value:value===undefined?null:value}));return;}
 const rel=decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/,''),p=path.resolve(env.root,rel);if(!p.startsWith(env.root+path.sep)||!fs.existsSync(p)||fs.statSync(p).isDirectory()){res.statusCode=404;res.end();return;}
 res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'})[path.extname(p)]||'application/octet-stream');let body=fs.readFileSync(p);if(path.extname(p)==='.html')body=body.toString().replace(/(<body[^>]*>)/i,'$1'+bridge);res.end(body);
}catch(e){res.statusCode=500;res.end(JSON.stringify({error:e.message}));}});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE});const report=[];
try{for(const id of ids){const context=await browser.newContext({viewport:{width:760,height:850},deviceScaleFactor:1});await context.route('**/*',r=>r.request().url().startsWith(origin)||r.request().url().startsWith('data:')?r.continue():r.abort());const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('404'))errors.push(m.text());});
await page.goto(origin+'/modules/games/'+id+'/ui/index.html');await page.waitForFunction(()=>window.__game&&document.querySelector('.g-scene canvas'));await page.waitForTimeout(300);
for(const size of [344,760,1100]){await page.setViewportSize({width:size,height:850});await page.waitForTimeout(180);await page.screenshot({path:path.join(OUT,id+'-start-'+size+'.png')});const dim=await page.evaluate(()=>({sw:document.body.scrollWidth,w:innerWidth,canvas:document.querySelector('.g-scene canvas').getBoundingClientRect().toJSON()}));assert.ok(dim.sw<=dim.w+1,id+' horizontal overflow');assert.ok(dim.canvas.width>250 && dim.canvas.height>140,id+' collapsed scene');}
const action=await page.evaluate(id=>{const g=window.__game,s=g.state,sim=GameSim,c=g.config;let result;
if(id==='dynasty')result=g.act(s=>{s.run.gold='1e8';return sim.buyHolding(s,c,0,1);});
if(id==='library')result=g.act(s=>{s.run.coins='1e8';return sim.buySupply(s,c,0,1);});
if(id==='garden')result=g.act(s=>sim.plant(s,0,s.run.bank[0].id,g.rng,c,Date.now()));
if(id==='dragon-hoard')result=g.act(s=>{s.run.gold='1e8';return sim.buyServant(s,c,0,1);});
return !!result;},id);assert.ok(action,id+' real action failed');
await page.waitForTimeout(220);await page.setViewportSize({width:760,height:850});
await page.evaluate(id=>{const g=window.__game,c=g.config,now=Date.now();g.act(s=>{
if(id==='dynasty'){s.run.h=[10,8,4,3,2,2,1,1,0];s.run.court=5;s.run.spouse={id:'visual-partner',name:'Спутница',age:25,g:s.run.ruler.g,tr:[]};}
if(id==='library'){s.run.own[0]=35;s.run.own[7]=12;s.run.own[14]=10;s.run.halls=['reading','children','periodicals','maps','music','observatory'];s.run.desks=[{id:1,b:0,k:0,n:1,p:10,w:120},null,null];s.run.tomes=['atlas','stars'];}
if(id==='garden'){for(let i=0;i<s.run.beds.length;i++){s.run.beds[i].p={id:'visual-'+i,f:['moon','sun','fan'][i%3],g:i%3===2?'KkacVvnn12':'RYsbpq+-+---nn12',m:i===0?'GCN':'',ch:'blue',gr:1e6,bl:20000,win:20000,seen:true,pod:null,at:now};s.run.beds[i].w=now+60000;}s.run.up.hive=1;s.run.up.barrel=1;}
if(id==='dragon-hoard'){s.run.gold='1e14';s.run.servants=[30,12,8,4,2,1,0,0];s.layers.sleep.state.sleeps=c['age.old'];s.layers.sleep.state.halls={grotto:1,nest:1,mirror:1,cache:1};s.run.q.scale=15;s.run.knight={type:'wanderer',at:now+120000};s.meta.chronicle=[{n:1,kind:'sleep',age:'Взрослый',wins:12,hmax:'1e12'}];}
});},id);await page.waitForTimeout(250);await page.screenshot({path:path.join(OUT,id+'-developed.png')});
let contextShot=false;
if(id==='dynasty') {await page.locator('.d-tab[data-id="court"]').click();contextShot=true;}
if(id==='library') {await page.locator('.l-tabs [data-tab="vault"]').click();contextShot=true;}
if(id==='garden') {await page.evaluate(()=>__game.act(s=>{s.run.up.greenhouse=1;}));await page.evaluate(()=>{const node=document.querySelector('.g-scene canvas'),ctx=node.getContext('2d');ctx.setTransform(node.width/1000,0,0,node.height/620,0,0);GardenScene.draw(ctx,GardenScene.model(__game.state,__game.config,{sim:GameSim,now:Date.now(),night:true}),0,[]);});contextShot=true;}
if(id==='dragon-hoard') {await page.locator('[data-tab="chronicle"]').click();contextShot=true;}
if(contextShot){await page.waitForTimeout(id==='garden'?0:160);await page.screenshot({path:path.join(OUT,id+'-context.png')});}
assert.deepEqual(errors,[],id+' runtime errors');report.push({id,action,errors});console.log(JSON.stringify(report[report.length-1]));await context.close();}
for(const id of ids){const context=await browser.newContext({viewport:{width:344,height:780}});await context.addInitScript(()=>{let api;Object.defineProperty(window,'Game',{configurable:true,get:()=>api,set:value=>{api=value;delete api.scene;}});});await context.route('**/*',r=>r.request().url().startsWith(origin)||r.request().url().startsWith('data:')?r.continue():r.abort());const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(origin+'/modules/games/'+id+'/ui/index.html');await page.waitForFunction(()=>window.__game&&document.querySelector('.g-field'));await page.waitForTimeout(150);assert.equal(await page.locator('.g-scene').count(),0);assert.ok(await page.locator('button:visible').count()>3);assert.deepEqual(errors,[],id+' legacy fallback');if(id==='dragon-hoard')assert.ok(await page.locator('.dh-scene>svg').isVisible());console.log(JSON.stringify({id,legacyFallback:true,errors}));await context.close();}
const contact=await browser.newPage({viewport:{width:1600,height:1000},deviceScaleFactor:1});const pics=ids.map(id=>'<article><h2>'+id+'</h2><img src="data:image/png;base64,'+fs.readFileSync(path.join(OUT,id+'-developed.png')).toString('base64')+'"><img src="data:image/png;base64,'+fs.readFileSync(path.join(OUT,id+'-context.png')).toString('base64')+'"></article>').join('');await contact.setContent('<style>body{background:#202826;color:#eee;display:grid;grid-template-columns:repeat(4,1fr);gap:12px;font:14px sans-serif;margin:12px}img{display:block;width:100%}h2{font-size:16px}</style>'+pics);await contact.screenshot({path:path.join(OUT,'contact.png'),fullPage:true});fs.writeFileSync(path.join(OUT,'report.json'),JSON.stringify(report,null,2));
}finally{await browser.close();server.close();env.close();}})().catch(e=>{console.error(e.stack);server.close();env.close();process.exitCode=1;});

