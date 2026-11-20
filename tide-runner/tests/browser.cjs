'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os');
const {chromium}=require(process.env.AXIKO_PLAYWRIGHT_MODULE||'playwright');
const source=path.resolve(__dirname,'..');
const project=process.env.AXIKO_ROOT||path.resolve(__dirname,'../../../assi');
const harness=require(path.join(project,'scripts/games/harness.js'));
const bootScript="window.axiko={platform:'web',stage:async()=>true,back:()=>{},open:async()=>true,on:()=>()=>{},native:async()=>({}),call:async function(mod,fn,...args){const resp=await fetch('/__call',{method:'POST',body:JSON.stringify({fn,args})});const out=await resp.json();if(out.error)throw Error(out.error);return out.value;}};";
async function run(){
  const env=harness.workspace({fixture:false}), main=env.require('modules/games/main.js');
  const prefix='modules/games/tide-runner/',dest=path.join(env.root,prefix);
  fs.cpSync(source,dest,{recursive:true,filter:p=>!/(^|[/\\])(tests|store)([/\\]|$)/.test(path.relative(source,p))});
  fs.cpSync(path.join(harness.FACTORY,'ui/kit'),path.join(env.root,'ui/kit'),{recursive:true});
  const server=http.createServer(async(req,res)=>{
    try{
      if(req.url==='/__call'){let str='';for await(const c of req)str+=c;const {fn,args}=JSON.parse(str);
        const value=await main[fn](...args);res.setHeader('content-type','application/json');res.end(JSON.stringify({value}));return;}
      const u=new URL(req.url,'http://localhost');const direct=u.pathname.startsWith('/demo/');
      const root=direct?source:env.root,file=path.resolve(root,'.'+(direct?u.pathname.replace('/demo',''):u.pathname));
      if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
      const type={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'}[path.extname(file)];
      res.setHeader('content-type',(type||'application/octet-stream')+'; charset=utf-8');
      let body=fs.readFileSync(file);if(!direct&&file.endsWith('.html'))body=body.toString().replace('<body>','<body><script>'+bootScript+'</script>');res.end(body);
    }catch(err){res.writeHead(500);res.end(JSON.stringify({error:err.message}));}
  });
  await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
  const root='http://127.0.0.1:'+server.address().port,shots=process.env.TIDE_SHOTS||fs.mkdtempSync(path.join(os.tmpdir(),'crestline-shots-'));
  fs.mkdirSync(shots,{recursive:true});
  let browser;
  try{
    const chrome=process.env.AXIKO_CHROMIUM_EXECUTABLE||['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
    browser=await chromium.launch({headless:true,executablePath:chrome,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required']});
    await checkSteadyCamera(browser,root);
    const page=await browser.newPage({viewport:{width:390,height:820},deviceScaleFactor:1});const faults=[];
    page.on('pageerror',e=>faults.push(String(e)));
    await page.addInitScript(()=>{
      const request=window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame=function(fn){
        return request(function(stamp){
          const data=document.querySelector('#game')?.dataset;
          if(fn.name==='frame'&&window.stopOnApron&&data?.mode==='run'&&Number(data.distance)>=4)return;
          if(fn.name==='frame'&&window.holdWaveRamp&&data?.mode==='practice'&&Number(data.distance)>=window.takeoff){
            window.rampFrame=fn;return;
          }
          if(fn.name==='frame'&&window.holdWave&&data?.surface==='wave'){
            window.deferredFrame=fn;return;
          }
          fn(stamp);
        });
      };
    });
    page.setDefaultTimeout(20000);
    const action=id=>page.locator('[data-action="'+id+'"]').first().click();
    const mode=async name=>{
      try {await page.waitForSelector('#game[data-mode="'+name+'"]',{state:'attached'});}
      catch(err){throw new Error(err.message+' '+JSON.stringify(await page.evaluate(()=>({mode:document.querySelector('#game')?.dataset.mode,visible:document.visibilityState,text:document.body.innerText.slice(-340)}))));}
    };
    await page.goto(root+'/demo/ui/index.html');await mode('home');
    await page.screenshot({path:path.join(shots,'home.png')});
    await action('start');await mode('run');await page.keyboard.press('ArrowRight');
    await page.waitForFunction(()=>document.querySelector('#game').dataset.lane==='2');
    await page.keyboard.press('ArrowUp');await page.keyboard.press('ArrowDown');await page.keyboard.press('p');await mode('paused');
    await action('later');await mode('home');await page.reload();await mode('home');await action('resume');await mode('run');
    await page.keyboard.press('p');await action('leaveRun');await mode('over');
    await action('revenge');await mode('run');await page.keyboard.press('p');await action('leaveRun');await mode('over');
    await action('watch');await mode('over');await action('hangar');await action('challenges');
    await page.evaluate(()=>{
      window.holdWave=true;window.holdWaveRamp=true;
      window.takeoff=TideRace.block(TideRace.course(43117),0).waves[0].start-10;
    });await action('wavePractice');await mode('practice');
    await page.waitForFunction(()=>Boolean(window.rampFrame));await page.keyboard.press('ArrowUp');
    await page.evaluate(()=>{window.holdWaveRamp=false;window.rampFrame(performance.now());});
    await page.waitForFunction(()=>document.querySelector('#game').dataset.surface==='wave',null,{polling:40});
    await page.keyboard.press('ArrowRight');await page.waitForFunction(()=>Boolean(window.deferredFrame),null,{polling:40});
    await page.screenshot({path:path.join(shots,'wave.png')});
    await page.keyboard.press('p');await page.evaluate(()=>{window.holdWave=false;if(window.deferredFrame)window.deferredFrame(performance.now());});
    await action('leavePractice');await mode('home');
    const profile=await page.evaluate(()=>JSON.parse(localStorage.getItem('tide-runner:profile:1')));
    assert.equal(profile.runs,2);assert.equal(profile.rows.length,1);assert.equal(profile.fixed.length,1);
    await page.setViewportSize({width:760,height:500});await page.goto(root+'/demo/ui/index.html?lang=en');await mode('home');assert.equal(await page.title(),'Crestline');
    assert.equal(await page.evaluate(()=>document.body.scrollWidth>innerWidth),false);
    await page.goto(root+'/'+prefix+'ui/index.html');await mode('home');assert.ok(await page.locator('[data-action=menu]').isVisible());
    await page.evaluate(()=>{window.stopOnApron=true;});
    await action('start');await mode('run');await page.waitForFunction(()=>+document.querySelector('#game').dataset.distance>3);await page.keyboard.press('p');await mode('paused');await action('leaveRun');await mode('over');
    await page.reload();await mode('home');await action('hangar');assert.ok(await page.locator('.listrow').count()>0);
    const mobile=await browser.newContext({viewport:{width:344,height:680},hasTouch:true,isMobile:true});
    await mobile.addInitScript(()=>{
      const raf=window.requestAnimationFrame.bind(window);
      // Software rasterisation of the first frame of each running pose can span several
      // layout frames. Keep all four gestures on the starting apron, then release the clock.
      window.holdTouchRun=true;
      window.requestAnimationFrame=fn=>fn.name==='frame'&&window.holdTouchRun?(window.touchFrame=fn,1):raf(fn);
      const get=HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext=function(type,...other){
        if(type.includes('webgl'))return null;
        return get.call(this,type,...other);
      };
    });
    const touchPage=await mobile.newPage();touchPage.on('pageerror',e=>faults.push(String(e)));
    const cdp=await mobile.newCDPSession(touchPage);
    await touchPage.goto(root+'/demo/ui/index.html');await touchPage.locator('[data-action=start]').tap();
    await touchPage.locator('#game[data-mode=run]').waitFor();assert.ok(await touchPage.locator('#fallback').isVisible());
    async function swipe(x,y,endX,endY){
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:endX,y:endY}]});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    }
    await swipe(150,320,220,320);await touchPage.locator('#game[data-lane="2"]').waitFor();
    await swipe(180,320,120,320);await touchPage.locator('#game[data-lane="1"]').waitFor();
    await swipe(150,340,150,268);await touchPage.locator('#game[data-posture=jump]').waitFor();
    await swipe(150,300,150,370);await touchPage.locator('#game[data-posture=duck]').waitFor();
    await touchPage.evaluate(()=>{window.holdTouchRun=false;window.touchFrame(performance.now());});
    await touchPage.waitForFunction(()=>+document.querySelector('#game').dataset.distance>=2);
    await mobile.close();assert.deepEqual(faults,[]);
    console.log('Standalone, keyboard, four touch swipes, Canvas fallback, resume, fixed/replay, wave, English and live hub persistence passed. Screenshots: '+shots);
  } finally {await browser?.close();await new Promise(ok=>server.close(ok));env.close();}
}
async function checkSteadyCamera(browser,base){
  const p=await browser.newPage({viewport:{width:640,height:720}});
  try{
    await p.goto(base+'/demo/ui/index.html');await p.locator('[data-action=start]').waitFor();
    await p.evaluate(async()=>{
      const {PerspectiveCamera}=await import('../vendor/three.module.js');
      const update=PerspectiveCamera.prototype.updateMatrixWorld;
      window.cameraSamples=[];
      PerspectiveCamera.prototype.updateMatrixWorld=function(...args){
        const result=update.apply(this,args),game=document.querySelector('#game');
        if(game.dataset.mode==='run')cameraSamples.push({
          pose:game.dataset.posture,d:Number(game.dataset.distance),fov:this.fov,matrix:this.matrixWorld.elements.slice()
        });
        return result;
      };
    });
    await p.locator('[data-action=start]').click();
    await p.waitForFunction(()=>cameraSamples.some(s=>s.d>=2));
    await p.keyboard.press('ArrowUp');await p.waitForFunction(()=>cameraSamples.some(s=>s.pose==='jump'));
    await p.waitForFunction(()=>cameraSamples.some(s=>s.pose==='ride'&&s.d>=20));
    await p.keyboard.press('ArrowDown');await p.waitForFunction(()=>cameraSamples.some(s=>s.pose==='duck'));
    const samples=await p.evaluate(()=>cameraSamples);
    assert(samples.length>10);
    for(const sample of samples){
      assert.deepEqual(sample.matrix,samples[0].matrix,'flat-track camera must stay fixed through stride, jump, landing and slide');
      assert.equal(sample.fov,samples[0].fov);
    }
  }finally{await p.close();}
}
run().catch(err=>{console.error(err);process.exitCode=1;});
