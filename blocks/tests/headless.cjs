'use strict';
const fs=require('fs'),path=require('path'),os=require('os'),assert=require('node:assert/strict');
const {spawn}=require('child_process');
const root=path.resolve(__dirname, '..');
const tmp=__dirname;
process.env.BLOCKS_PREVIEW_PORT='0';
const preview=require(root+'/tools/preview-server.js');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
class CDP {
 constructor(url){
  this.ws=new WebSocket(url);this.next=0;this.pending=new Map();this.events=[];
  this.open=new Promise((resolve,reject)=>{this.ws.addEventListener('open',resolve,{once:true});this.ws.addEventListener('error',e=>reject(new Error('CDP connection: '+(e.message||e.type))),{once:true})});
  this.ws.addEventListener('message',e=>{const x=JSON.parse(e.data);if(x.id){const p=this.pending.get(x.id);if(p){this.pending.delete(x.id);clearTimeout(p.timer);x.error?p.reject(new Error(JSON.stringify(x.error))):p.resolve(x.result)}}else this.events.push(x)});
 }
 async send(method,params={},sessionId){
  await this.open;const id=++this.next;
  return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error('CDP timeout '+method))},30000);this.pending.set(id,{resolve,reject,timer});this.ws.send(JSON.stringify({id,method,params,sessionId}))});
 }
 async eval(sessionId,expression){
  const r=await this.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},sessionId);
  if(r.exceptionDetails)throw new Error(r.exceptionDetails.text+': '+JSON.stringify(r.exceptionDetails.exception));
  return r.result.value;
 }
}
let chrome,cdp;
const report={browser:null,widths:[],errors:[],network:[],checks:[]};
async function run(){
 if(!preview.server.listening)await new Promise(r=>preview.server.once('listening',r));
 const origin='http'+':'+String.fromCharCode(47,47)+'127.0.0.1:'+preview.server.address().port;
 const profile=fs.mkdtempSync(path.join(tmp,'profile-'));
 chrome=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',[
  '--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-extensions',
  '--disable-background-networking','--disable-component-update','--disable-sync','--metrics-recording-only',
  '--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'
 ],{windowsHide:true,stdio:['ignore','ignore','pipe']});
 let stderr='';chrome.stderr.on('data',d=>{stderr+=d.toString()});
 let active='';
 for(let i=0;i<200;i++){if(fs.existsSync(path.join(profile,'DevToolsActivePort'))){active=fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8');break}if(chrome.exitCode!==null)throw new Error('Chrome exited '+chrome.exitCode+': '+stderr.slice(-1500));await delay(100)}
 assert.ok(active,'Chrome DevToolsActivePort absent: '+stderr.slice(-1500));
 const [port,route]=active.trim().split('\n');
 cdp=new CDP('ws'+':'+String.fromCharCode(47,47)+'127.0.0.1:'+port+route);
 report.browser=await cdp.send('Browser.getVersion');
 const artifact=path.join(root,'tests','artifacts');fs.mkdirSync(artifact,{recursive:true});
 for(const width of [344,760]){
  const {targetId}=await cdp.send('Target.createTarget',{url:'about:blank'});
  const {sessionId:s}=await cdp.send('Target.attachToTarget',{targetId,flatten:true});
  await cdp.send('Page.enable',{},s);await cdp.send('Runtime.enable',{},s);await cdp.send('Network.enable',{},s);await cdp.send('Log.enable',{},s);
  await cdp.send('Emulation.setDeviceMetricsOverride',{width,height:840,deviceScaleFactor:1,mobile:false},s);
  await cdp.send('Page.navigate',{url:origin+'/modules/games/blocks/ui/index.html?preview=1'},s);
  for(let i=0;i<150;i++){if(await cdp.eval(s,'Boolean(window.__game && document.querySelector(".b-play"))'))break;await delay(100)}
  assert.equal(await cdp.eval(s,'Boolean(window.__game && document.querySelector(".b-play"))'),true,'game boot '+width);
  await cdp.eval(s,'document.querySelector(".b-play").click()');
  assert.equal(await cdp.eval(s,'window.__game.state.run.game.mode'),'classic');
  let geometry=await cdp.eval(s,'(()=>{const b=document.querySelector(".b-board").getBoundingClientRect();return {viewport:innerWidth,scroll:document.documentElement.scrollWidth,board:{x:b.x,y:b.y,width:b.width,height:b.height,bottom:b.bottom},tools:Array.from(document.querySelectorAll(".b-tool")).map(x=>({w:x.getBoundingClientRect().width,h:x.getBoundingClientRect().height})),errors:window.__previewErrors}})()');
  assert.equal(geometry.viewport,width);assert.equal(geometry.scroll,width,'horizontal overflow '+width);
  assert.ok(geometry.board.width>250,'board readable '+width);
  assert.ok(geometry.tools.every(t=>t.w>=44&&t.h>=56),'tool tap targets');
  report.widths.push(geometry);
  await cdp.eval(s,'document.querySelector(".b-tray-piece:not([disabled])").click()');
  const tap=await cdp.eval(s,'(()=>{const g=__game;const i=Number(document.querySelector(".b-tray-piece.selected").dataset.piece);const at=BlocksBoard.places(g.state.run.game.b[0],g.state.run.game.tray[i])[0];const b=document.querySelector(".b-board").getBoundingClientRect(),cell=b.width/g.state.run.game.n;return {x:b.x+(at[1]+.5)*cell,y:b.y+(at[0]+.5)*cell}})()');
  await cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,x:tap.x,y:tap.y},s);
  await cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,x:tap.x,y:tap.y},s);
  assert.ok(await cdp.eval(s,'__game.state.run.game.score>0'),'tap places '+width);
  // A drag uses browser pointer events and the real canvas geometry.
  const drag=await cdp.eval(s,'(()=>{const g=__game,pidx=g.state.run.game.tray.findIndex(Boolean),p=g.state.run.game.tray[pidx],at=BlocksBoard.places(g.state.run.game.b[0],p)[0],shape=BlocksBoard.bounds(p.c),b=document.querySelector(".b-board").getBoundingClientRect(),cell=b.width/g.state.run.game.n,el=document.querySelectorAll(".b-tray-piece")[pidx],t=el.getBoundingClientRect();return {sx:t.x+t.width/2,sy:t.y+t.height/2,x:b.x+(at[1]+shape.w/2)*cell,y:b.y+(at[0]+shape.h)*cell+g.config["ui.dragLift"],score:g.state.run.game.score}})()');
  await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:drag.sx,y:drag.sy},s);
  await cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,clickCount:1,x:drag.sx,y:drag.sy},s);
  await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',button:'left',buttons:1,x:drag.x,y:drag.y},s);
  await cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,x:drag.x,y:drag.y},s);
  assert.ok(await cdp.eval(s,'__game.state.run.game.score')>drag.score,'drag places '+width);
  const touch=await cdp.eval(s,'(()=>{const g=__game,pidx=g.state.run.game.tray.findIndex(Boolean),p=g.state.run.game.tray[pidx],at=BlocksBoard.places(g.state.run.game.b[0],p)[0],shape=BlocksBoard.bounds(p.c),b=document.querySelector(".b-board").getBoundingClientRect(),cell=b.width/g.state.run.game.n,t=document.querySelectorAll(".b-tray-piece")[pidx].getBoundingClientRect();return {sx:t.x+t.width/2,sy:t.y+t.height/2,x:b.x+(at[1]+shape.w/2)*cell,y:b.y+(at[0]+shape.h)*cell+g.config["ui.dragLift"],score:g.state.run.game.score}})()');
  await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1},s);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:touch.sx,y:touch.sy,id:1}]},s);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:touch.x,y:touch.y,id:1}]},s);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]},s);
  assert.ok(await cdp.eval(s,'__game.state.run.game.score')>touch.score,'touch drag places '+width);
  await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:false},s);
  const png=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false},s);
  fs.writeFileSync(path.join(artifact,'blocks-'+width+'.png'),Buffer.from(png.data,'base64'));
  // Exercise every visible page using its actual control handler.
  await cdp.eval(s,'Array.from(document.querySelectorAll(".b-nav button")).find(x=>x.textContent.includes("Улучшения")).click()');
  assert.equal(await cdp.eval(s,'document.querySelectorAll(".b-upgrade").length'),20);
  assert.equal(await cdp.eval(s,'document.querySelectorAll(".b-supply").length'),8);
  await cdp.eval(s,'document.querySelector(".b-close").click()');
  await cdp.eval(s,'Array.from(document.querySelectorAll(".b-nav button")).find(x=>x.textContent.includes("Мастер")).click()');
  assert.ok(await cdp.eval(s,'document.querySelector(".b-master-title").textContent.includes("Ученик")'));
  await cdp.eval(s,'document.querySelector(".b-close").click()');
  // Seed a legitimate late-game fixture to exercise gated layouts, using g.act.
  await cdp.eval(s,'__game.act(st=>{GameSim.endGame(st,__game.config,1);st.layers.rank.count=4;GameSim.newGame(st,__game.config,"twin",{seed:91})})');
  assert.equal(await cdp.eval(s,'document.querySelectorAll(".b-board").length'),2);
  assert.equal(await cdp.eval(s,'document.documentElement.scrollWidth'),width);
  await cdp.eval(s,'__game.act(st=>{GameSim.endGame(st,__game.config,1);GameSim.newGame(st,__game.config,"big",{seed:92})})');
  assert.equal(await cdp.eval(s,'__game.state.run.game.n'),9);
  await cdp.eval(s,'__game.act(st=>{GameSim.endGame(st,__game.config,1);GameSim.newGame(st,__game.config,"daily",{day:"2026-11-14"})})');
  assert.equal(await cdp.eval(s,'__game.state.run.game.deals'),20);
  await cdp.eval(s,'__game.act(st=>GameSim.endGame(st,__game.config,1));Array.from(document.querySelectorAll(".b-lobby button")).find(x=>x.textContent.includes("Испытания")).click()');
  await cdp.eval(s,'document.querySelector(".b-challenges button:not([disabled])").click()');
  assert.equal(await cdp.eval(s,'__game.state.run.game.mode'),'challenge');
  const challengeShot=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false},s);
  fs.writeFileSync(path.join(artifact,'blocks-challenge-'+width+'.png'),Buffer.from(challengeShot.data,'base64'));
  report.checks.push({width,boot:true,tap:true,drag:true,touch:true,shop20:true,supplies8:true,master:true,twin:true,big:true,daily:true,challenge:true});
  report.errors.push(...(await cdp.eval(s,'window.__previewErrors')));
  await cdp.send('Target.closeTarget',{targetId});
 }
 report.errors.push(...cdp.events.filter(e=>e.method==='Runtime.exceptionThrown').map(e=>e.params.exceptionDetails));
 report.errors.push(...cdp.events.filter(e=>e.method==='Log.entryAdded'&&e.params.entry.level==='error').map(e=>e.params.entry.text));
 report.failedResponses=cdp.events.filter(e=>e.method==='Network.responseReceived'&&e.params.response.status>=400).map(e=>({url:e.params.response.url,status:e.params.response.status}));
 assert.deepEqual(report.failedResponses,[],'resource load errors');
 report.network=cdp.events.filter(e=>e.method==='Network.requestWillBeSent').map(e=>e.params.request.url).filter(url=>!url.startsWith(origin)&&!url.startsWith('data:'));
 assert.deepEqual(report.errors,[],'runtime errors');assert.deepEqual(report.network,[],'external requests');
 report.ok=true;
 fs.writeFileSync(path.join(root,'tests','browser-report.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report,null,2));
}
run().catch(error=>{report.ok=false;report.failure=error.stack||String(error);fs.writeFileSync(path.join(root,'tests','browser-report.json'),JSON.stringify(report,null,2)+'\n');console.error(report.failure);process.exitCode=1}).finally(async()=>{
 if(cdp){try{await cdp.send('Browser.close')}catch{}cdp.ws.close()}
 if(chrome&&chrome.exitCode===null)chrome.kill();
 preview.server.close();preview.env.close();
 setTimeout(()=>process.exit(process.exitCode||0),50);
});

