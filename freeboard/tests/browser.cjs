'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),http=require('node:http'),os=require('node:os'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_CORE||'playwright-core');
const folder=path.resolve(__dirname,'..');
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const server=http.createServer((req,res)=>{
  const requested=path.resolve(folder,'.'+new URL(req.url,'http://local').pathname);
  if(!requested.startsWith(folder+path.sep)||!fs.existsSync(requested)||!fs.statSync(requested).isFile()){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type',mime[path.extname(requested)]||'application/octet-stream');fs.createReadStream(requested).pipe(res);
});
const wait=(ms)=>new Promise(resolve=>setTimeout(resolve,ms));
let browser;
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{}),
    args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:860,height:520},locale:'en-US'});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/ui/play.html');await page.locator('#deck[data-view=walk] #station').waitFor();
  const click=(key,i)=>page.locator('[data-key="'+key+'"]'+(i===undefined?'':'[data-value="'+i+'"]')).click();
  async function capture(name){if(process.env.FREEBOARD_SHOTS)await page.screenshot({path:path.join(os.tmpdir(),'freeboard-'+name+'.png')});}
  async function walkUntil(label,key='w'){
    await page.keyboard.down(key);
    try{await page.locator('#station:visible').filter({hasText:label}).waitFor({timeout:30000});}
    finally{await page.keyboard.up(key);}
  }
  // Traverse the whole ship using normal input. A save/reload should restore
  // the actual walked position and the view at the chair.
  await page.keyboard.down('w');
  try{await page.locator('#deck-sign strong').filter({hasText:'Passage'}).waitFor({timeout:30000});}
  finally{await page.keyboard.up('w');}
  await page.keyboard.press('Escape');await page.reload();
  await page.locator('#deck-sign strong').filter({hasText:'Passage'}).waitFor();
  await walkUntil('Take the helm');await page.keyboard.press('f');
  await page.locator('#deck[data-view=pilot] #undock').waitFor();
  await capture('helm');await page.keyboard.press('f');
  await walkUntil('Open port terminal');await page.keyboard.press('f');
  await page.locator('#dock [data-key=launch]').waitFor();
  const portWindows=[];
  async function inspectHarbor(port){
    await click('tab','quarters');await click('board');
    await page.locator('#deck[data-view=walk]').waitFor();
    await page.waitForTimeout(450);
    const screen=page.viewportSize(),crop={x:Math.round(screen.width*.15),y:Math.round(screen.height*.25),
      width:Math.round(screen.width*.62),height:Math.round(screen.height*.39)};
    const first=await page.screenshot({clip:crop});
    if(portWindows.length)assert.ok(!portWindows[0].equals(first),'different orbital harbour');
    portWindows.push(first);await capture('window-'+port);
    await page.locator('#station:visible').filter({hasText:'Open port terminal'}).click();
    await click('tab','quarters');
  }
  await capture('updated-port');await click('tab','market');await click('buy',0);await click('tab','shipyard');await click('yard',1);await click('module',0);
  await click('tab','routes');await click('launch');
  await page.locator('#deck[data-view=pilot]').waitFor();
  // A manual throttle and turns change the simulated ship. Getting out of
  // the seat holds position and the same flight resumes when seated again.
  await page.keyboard.down('ArrowRight');await page.keyboard.down('w');
  await page.waitForFunction(()=>Number(document.querySelector('#readings').textContent.match(/Thrust (\d+)%/)?.[1])>=12);
  await page.keyboard.up('ArrowRight');await page.keyboard.up('w');await page.keyboard.press('f');
  await page.locator('#deck[data-view=walk]').waitFor();
  const readSave=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('freeboard.captain.v1')));
  const standing=await readSave();assert(standing.flight.yaw>0);assert(standing.flight.thrust>0);assert.equal(standing.flight.speed,0);
  await page.waitForTimeout(700);await page.keyboard.press('f');
  const reseated=await readSave();assert.equal(reseated.flight.seed,standing.flight.seed);assert.equal(reseated.flight.z,standing.flight.z);
  await page.waitForTimeout(400);await page.keyboard.press('Escape');await page.reload();await page.locator('[data-key=close]').waitFor();
  assert.equal(await page.locator('#overlay h2').innerText(),'Flight paused');await click('close');
  await page.keyboard.down('Shift');await page.keyboard.press('KeyE');
  await page.locator('[data-key=next]').waitFor({timeout:90000});await page.keyboard.up('Shift');
  await click('next');await inspectHarbor('pelagos');await click('crew',0);await click('crewtab',1);await click('cabin',2);
  await click('mount');await capture('cabin');
  await click('tab','routes');await click('mode',1);await click('launch');
  await page.keyboard.down('s');await page.keyboard.down('Space');
  const until=Date.now()+65000;
  while(Date.now()<until&&!/3\/3/.test(await page.locator('#readings').innerText())){
    await page.keyboard.press('KeyE');await wait(280);
  }
  assert.match(await page.locator('#readings').innerText(),/3\/3/);
  await page.keyboard.up('s');await page.keyboard.up('Space');await page.keyboard.press('KeyE');await page.keyboard.down('Shift');
  await page.locator('[data-key=next]').waitFor({timeout:90000});await page.keyboard.up('Shift');await click('next');await inspectHarbor('oriole');await click('tab','routes');
  await page.setViewportSize({width:390,height:780});await click('mode',2);await click('launch');
  await page.keyboard.press('KeyE');await page.keyboard.down('Shift');
  await page.waitForFunction(()=>document.querySelector('#mission').textContent==='Sample the crystals',{},{timeout:90000});
  await page.keyboard.up('Shift');await capture('surface');
  // Read the public simulation input boundary for the test navigator. All movement and
  // sampling still go through the actual keyboard bindings.
  await page.evaluate(()=>{const original=FreeFlight.step;FreeFlight.step=(f,...args)=>{window.lastFlight=f;return original(f,...args);};});
  await page.waitForFunction(()=>window.lastFlight);
  const down=new Set();const steer=async(next)=>{
    for(const key of down)if(!next.includes(key)){await page.keyboard.up(key);down.delete(key);}
    for(const key of next)if(!down.has(key)){await page.keyboard.down(key);down.add(key);}
  };
  const deadline=Date.now()+85000;
  while(Date.now()<deadline&&!await page.locator('[data-key=next]').count()){
    const next=await page.evaluate(()=>{const f=window.lastFlight,g=FreeFlight.guide(f),dx=g.x-f.x,dz=g.z-f.z;
      const keys=['Space'];if(Math.abs(dx)>1)keys.push(dx>0?'d':'a');if(Math.abs(dz)>1)keys.push(dz>0?'s':'w');return keys;});
    await steer(next);await wait(120);
  }
  await steer([]);await page.locator('[data-key=next]').waitFor({timeout:5000});await click('next');
  const state=await page.evaluate(()=>JSON.parse(localStorage.getItem('freeboard.captain.v1')));
  assert.equal(state.trips,3);assert.equal(state.stats.samples,3);assert.equal(state.stats.drones,3);assert.equal(state.cabin,2);assert.deepEqual(state.crew,[0]);assert.equal(state.cabinMount,'berth');
  await inspectHarbor('vesper');await click('tab','routes');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(errors,[]);
  await capture('portrait');console.log('Browser passed: market, loadout, insured flight save/reload, crew, three flown contracts and surface walking.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();server.close();});
