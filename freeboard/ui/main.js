import { ShipControls } from './ship-controls.js';
import { createWalker, spawnAtHelm, advanceWalker, nearStation, canStand } from './ship-interior.js';
const S=window.GameSim,F=window.FreeFlight;
const by=id=>document.getElementById(id);
const deck=by('deck'),dock=by('dock'),flight=by('flight'),overlay=by('overlay');
const storeKey='freeboard.captain.v1';
let host=null,hostLang=null;
try{if(parent!==window){host=parent.__hub;hostLang=parent.__lang||(host?'ru':null);}}catch(_){}
function read(key){try{return localStorage.getItem(key);}catch(_){return null;}}
function write(key,value){try{localStorage.setItem(key,value);}catch(_){}}
const languageChoice=new URLSearchParams(location.search).get('lang');
let lang=languageChoice||read('freeboard.language')||hostLang||(navigator.language.startsWith('ru')?'ru':'en');
let dictionary={};
try{dictionary=await (await fetch('../i18n-ru.json')).json();}catch(_){}
const t=text=>lang==='ru'?(dictionary[text]||text):text;
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const tr=text=>escape(t(text));
const cr=n=>'¤'+String(n);
const fmt=(n)=>Math.round(n);
const defaults=S.fresh();
function load(){
  let saved=host&&host.state&&host.state.meta;
  if(!saved){try{saved=JSON.parse(read(storeKey));}catch(_){}}
  if(!saved || S.validate({meta:saved})) return S.fresh();
  const copy=S.fresh();
  Object.keys(copy).forEach(k=>{if(saved[k]!==undefined)copy[k]=S.clone(saved[k]);});
  return copy;
}
const p=load();
let tab='routes',mode=0,destination=(p.port+1)%3,yardTab='Hull',crewTab='Crew',dialog=null;
function restoreBridge(saved) {
  const bridge = { mode: p.flight ? 'pilot' : 'walk', walker: createWalker(), lookYaw: 0, lookPitch: 0, bank: 0 };
  if (saved && ['walk','pilot','external'].includes(saved.mode)) {
    bridge.mode = saved.mode;
    if (saved.walker && ['x','z','yaw','pitch'].every(key => Number.isFinite(saved.walker[key])) &&
        canStand(saved.walker.x,saved.walker.z,p)) {
      Object.assign(bridge.walker, { x: saved.walker.x, z: saved.walker.z, yaw: saved.walker.yaw,
        pitch: Math.max(-1.35, Math.min(1.35, saved.walker.pitch)) });
    }
  }
  if (p.finish || p.flight?.phase === 'surface') bridge.mode = 'external';
  else if (p.flight && bridge.mode === 'external') bridge.mode = 'pilot';
  return bridge;
}
const bridge = restoreBridge(p.onboard);
bridge.translate=t;
if (p.flight && !Number.isFinite(p.flight.thrust)) p.flight.thrust = .68;
if (Number.isInteger(p.onboard?.route) && S.modes[p.onboard.route]) mode=p.onboard.route;
if (Number.isInteger(p.onboard?.destination) && S.ports[p.onboard.destination] && p.onboard.destination!==p.port)
  destination=p.onboard.destination;
let paused=!!p.flight, lastSave=0,lastHud=0,lastTime=0,elapsed=0,toastTimer=0;
let view;
function save(now=false){
  p.onboard={mode:bridge.mode,route:mode,destination,walker:{x:bridge.walker.x,z:bridge.walker.z,yaw:bridge.walker.yaw,pitch:bridge.walker.pitch}};
  if(host){
    if(host.readonly||!host.state) return;
    const snapshot=S.clone(p);
    host.act(state=>{
      for(const k of Object.keys(defaults)){
        if(k==='stats') {for(const stat of Object.keys(defaults.stats)) state.meta.stats[stat]=snapshot.stats[stat];}
        else state.meta[k]=snapshot[k];
      }
    },now?{now:true,reason:'freeboard'}:undefined);
  }else write(storeKey,JSON.stringify(p));
  lastSave=performance.now();
}
function achievements(){
  if(!host||host.readonly)return;
  if(p.trips>0)host.achieve('voyage');
  if(p.stats.drones>=3)host.achieve('patrol');
  if(p.stats.samples>=3)host.achieve('survey');
  if(p.visited.length===3)host.achieve('ports');
}
function toast(text){
  const el=by('toast');el.textContent=text;el.classList.add('visible');
  clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('visible'),1350);
}
function btn(key,label,opt={}){
  const value=opt.value!==undefined?' data-value="'+escape(opt.value)+'"':'';
  const aria=opt.aria?' aria-label="'+escape(opt.aria)+'" title="'+escape(opt.aria)+'"':'';
  return '<button type="button" data-key="'+key+'"'+value+aria+(opt.cls?' class="'+opt.cls+'"':'')+(opt.disabled?' disabled':'')+'>'+escape(label)+'</button>';
}
function block(label,html){return '<div class="content"><span class="eyebrow">'+tr(label)+'</span>'+html+'</div>';}
function item(name,detail,actions){
  return '<div class="item"><div><b>'+escape(name)+'</b><small>'+escape(detail)+'</small></div><div class="row">'+actions+'</div></div>';
}
function tabs(key,values,current){return '<div class="tabs">'+values.map((v,i)=>btn(key,t(v),{value:i,cls:v===current?'on':''})).join('')+'</div>';}
function menuNav(){
  return '<nav class="nav">'+[['routes','⌁','Routes'],['market','⇄','Market'],['shipyard','◇','Shipyard'],['quarters','⌂','Quarters']].map(([id,icon,name])=>
    '<button data-key="tab" data-value="'+id+'" class="'+(tab===id?'on':'')+'"><i aria-hidden="true">'+icon+'</i>'+tr(name)+'</button>').join('')+'</nav>';
}
const routeText=['Fly the orbital approach. Gold rings add a bonus.','Clear three practice drones, then dock at the beacon.','Descend at the aqua beacon. Gather three samples on foot.'];
function routes(){
  const expected=S.quote(p,mode,destination);
  return block('Departure board','<div class="heading"><h1>'+tr(S.ports[p.port].name)+' <span aria-hidden="true">→</span> '+tr(S.ports[destination].name)+'</h1>'+btn('dest','⇄',{cls:'secondary',aria:t('Change destination')})+'</div>'+
    tabs('mode',S.modes,S.modes[mode])+'<p>'+tr(routeText[mode])+'</p><div class="launch"><div><small>'+tr('Expected profit')+'</small><strong>+'+cr(expected)+'</strong></div>'+btn('launch',t('Launch')+' ↗',{cls:'primary'})+'</div>'+
    (bridge.mode==='external'?btn('board',t('Board your ship'),{cls:'secondary board-link'}):''));
}
function market(){
  const capacity=S.stats(p).hold;
  return block('Exchange','<div class="heading"><h2>'+tr(S.ports[p.port].name)+'</h2><span class="minor">'+tr('Hold')+' '+S.total(p.cargo)+' / '+capacity+'</span></div><div class="scroll">'+S.goods.map((good,i)=>{
    const local=S.price(p,p.port,i),target=S.ports.map((_,n)=>S.price(p,n,i)).indexOf(Math.max(...S.ports.map((_,n)=>S.price(p,n,i))));
    return item(t(good)+' · '+cr(local),t('On board')+' '+p.cargo[i]+' · '+t(S.ports[target].name)+' '+cr(S.price(p,target,i)),
      btn('sell','−',{value:i,disabled:!p.cargo[i],aria:t('Sell')+' '+t(good)})+btn('buy','+',{value:i,disabled:S.room(p)<=0||local>p.credits||!p.stock[i],aria:t('Buy')+' '+t(good)}));
  }).join('')+'</div><p class="minor summary">'+tr('Profitable cargo sells on arrival. Other goods stay in your hold.')+'</p>');
}
function shipyard(){
  const stats=S.stats(p),list=yardTab==='Hull'?S.frames:yardTab==='Modules'?S.modules:S.skills;
  let items=list.map((entry,i)=>{
    if(yardTab==='Pilot')return item(t(entry)+' '+p.skills[i]+'/4',t(['More contract pay','Better turning and speed','Longer scan reach'][i]),
      btn('skill',t('Train'),{value:i,disabled:!p.points||p.skills[i]>=4}));
    const isFrame=yardTab==='Hull',owned=(isFrame?p.frames:p.modules).includes(i),active=isFrame?p.frame===i:p.fit.includes(i);
    const detail=isFrame?t('Hold')+' '+entry.hold+' · '+t('Speed')+' '+entry.speed+' · '+t('Shield')+' '+entry.shield:t(entry.desc);
    const full=!isFrame&&!active&&p.fit.length>=2;
    const cargoBlocks=isFrame?S.total(p.cargo)>entry.hold+(p.fit.includes(0)?4:0):i===0&&active&&S.total(p.cargo)>S.frames[p.frame].hold;
    return item(t(entry.name),detail,btn(isFrame?'frame':'module',active?(isFrame?t('Active'):t('Remove')):owned?t('Equip'):cr(entry.cost),
      {value:i,cls:active?'on':'',disabled:(isFrame&&active)||(!owned&&p.credits<entry.cost)||full||cargoBlocks}));
  }).join('');
  return block('Outfitting','<div class="section-head"><h2>'+tr(S.frames[p.frame].name)+'</h2><span class="minor">'+
    (yardTab==='Pilot'?tr('Skill points')+' '+p.points:tr('Modules')+' '+p.fit.length+'/2')+'</span></div>'+
    tabs('yard',['Hull','Modules','Pilot'],yardTab)+'<div class="scroll">'+items+'</div><p class="summary minor">'+
    tr('Shield')+' '+stats.shield+' · '+tr('Hold')+' '+stats.hold+' · '+tr('Rank')+' '+S.level(p.xp)+'</p>');
}
function quarters(){
  let list='';
  if(crewTab==='Crew'){
    list=S.roles.map((s,i)=>item(t(s.name),t(s.desc),btn('crew',p.crew.includes(i)?t('On board'):cr(s.cost),
      {value:i,disabled:p.crew.includes(i)||p.crew.length>=p.bunks||p.credits<s.cost}))).join('');
    if(p.bunks<3)list+=item(t('Extra berth'),t('One more specialist'),btn('bunks',cr(190),{value:0,disabled:p.credits<190}));
  }else {
    list=S.cabinColors.map((c,i)=>item(t(c),t('Cabin lighting and bedding'),btn('cabin',p.cabin===i?t('Active'):t('Apply'),{value:i,cls:p.cabin===i?'on':''}))).join('');
    list+=item(t(p.stats.samples?'Survey specimen':'Armillary globe'),t(p.cabinMount==='berth'?'Clamped by the berth':'Clamped to the desk'),btn('mount',t('Move')));
  }
  return block('Habitat','<div class="heading"><h2>'+tr('Crew quarters')+'</h2><span class="minor">'+tr('Berths')+' '+p.crew.length+'/'+p.bunks+'</span></div>'+
    btn('board',t('Board your ship')+' ↗',{cls:'inspect primary'})+tabs('crewtab',['Crew','Interior'],crewTab)+'<div class="scroll">'+list+'</div>');
}
function infoLine(title,value){return '<div class="data-line"><span>'+tr(title)+'</span><b>'+escape(value)+'</b></div>';}
function renderDialog(){
  overlay.hidden=!dialog;
  if(!dialog){overlay.innerHTML='';return;}
  let body='';
  if(dialog==='menu'){
    body='<span class="eyebrow">'+tr(p.flight?'Flight deck':'Port authority')+'</span><h2>'+tr(p.flight?'Flight paused':'Captain’s desk')+'</h2>'+
      '<p>'+tr(p.flight?'Your ship and cargo are covered.':'Your next departure is ready when you are.')+'</p>'+
      btn('close',t(p.flight?'Resume':'Back'),{cls:'primary'})+btn('journal',t('Flight log'),{cls:'secondary'})+
      btn('help',t('Controls'),{cls:'secondary'})+btn('lang',lang==='ru'?'English':(dictionary.Russian||'Russian'),{cls:'secondary'})+
      (p.flight?btn('recall',t('Return to port'),{cls:'secondary'}):'')+
      (host&&host.ui?btn('hub',t('Game library'),{cls:'secondary'}):'');
  }else if(dialog==='journal'){
    body='<span class="eyebrow">'+tr('Career')+'</span><h2>'+tr('Flight log')+'</h2>'+
      infoLine('Completed routes',p.trips)+infoLine('Drones cleared',p.stats.drones)+infoLine('Samples',p.stats.samples)+
      '<div class="scroll">'+p.ledger.map(l=>infoLine(l.tag,(l.value>0?'+':'')+cr(l.value))).join('')+'</div>'+btn('menu',t('Back'),{cls:'primary'});
  }else if(dialog==='orders'){
    body=routes()+btn('close',t('Back to helm'),{cls:'secondary'});
  }else if(dialog==='help'){
    body='<h2>'+tr('Controls')+'</h2><p>'+tr('Walk with WASD or the left pad. Drag to look, or turn with the arrow keys. Use F by the seat or the airlock.')+'</p><p>'+
      tr('At the helm, steer with the mouse or arrow keys. W adds thrust, S brakes, Shift boosts, and Space fires. F leaves the seat and holds position.')+'</p><p>'+
      tr('On the surface, walk with WASD and hold Space beside a crystal.')+'</p><p>'+
      tr('For a safe return, open the menu. Your modules and cargo stay with you.')+'</p>'+btn('menu',t('Back'),{cls:'primary'});
  }else if(dialog==='result'&&p.finish){
    const r=p.finish;
    body='<span class="eyebrow">'+tr(S.ports[p.port].name)+'</span><h2>'+tr(r.rescue?'Safe in port':'Docking complete')+'</h2><div class="big">+'+cr(r.base+r.extra+r.gain)+'</div>'+
      infoLine(r.rescue?'Recovery grant':'Contract',cr(r.base))+
      (r.extra?infoLine('Flight bonus',cr(r.extra)):'')+(r.gain?infoLine('Trade margin',cr(r.gain)):'')+
      '<p>'+tr(r.leveled?'New pilot rank. Spend a skill point at the shipyard.':'Repairs and supplies are included. Ready to fly.')+'</p>'+
      btn('stay',t('Back to helm'),{cls:'primary'})+btn('next',t('Back to port'),{cls:'secondary'});
  }
  overlay.innerHTML='<div class="dialog" role="dialog">'+body+'</div>';
}
let controls;
const touch = matchMedia('(pointer:coarse)').matches || navigator.maxTouchPoints > 0;
const clip = (value,min,max) => Math.max(min, Math.min(max,value));
function locationAction() {
  const station = nearStation(bridge.walker);
  return station === 'port' && p.flight ? null : station;
}
function walkHud() {
  const station = locationAction(), point = bridge.walker;
  const label = point.z < -7 ? 'Bridge' : point.z < -3.2 ? 'Passage' : 'Crew quarters';
  const heading = by('deck-sign').lastElementChild;
  if (heading.textContent !== t(label)) heading.textContent = t(label);
  const prompt = by('station');
  prompt.hidden = !station;
  if (station) {
    const text = (touch ? '' : 'F  ·  ') + t(station === 'helm' ? 'Take the helm' : 'Open port terminal');
    if (prompt.textContent !== text) prompt.textContent = text;
  }
}
function render(){
  const walk=bridge.mode==='walk', pilot=bridge.mode==='pilot';
  document.documentElement.lang=lang;
  deck.dataset.view=bridge.mode;
  by('brand').textContent=t('Freeboard').toLocaleUpperCase();
  by('place').textContent=t(S.ports[p.flight ? p.flight.dest : p.port].name)+' / '+t(p.flight?'In flight':'Orbital port');
  by('balance').textContent=cr(p.credits);by('menu').setAttribute('aria-label',t('Menu'));
  dock.hidden=!!p.flight||walk||pilot;
  flight.hidden=!p.flight||walk;
  by('aboard').hidden=!walk;
  by('helm').hidden=!pilot;
  by('joystick').hidden=(!walk&&!p.flight)||!!dialog;
  by('leave-seat').textContent=(touch?'':'F  ·  ')+t('Leave the seat');
  by('port-orders').hidden=!!p.flight;
  by('contract').textContent=t(S.modes[mode])+' · '+t(S.ports[destination].name)+' ▾';
  by('undock').textContent=t('Undock')+' ↗';
  by('deck-sign').firstElementChild.textContent=t(p.flight?'Position hold':'On board');
  by('walk-help').textContent=t(touch?'Left pad to walk · drag the view to look':'WASD to walk · drag or use arrows to look')+'  ·  '+t('Bridge forward');
  deck.classList.toggle('in-cabin',!p.flight && !walk && !pilot && tab==='quarters');
  if(dock.hidden) dock.replaceChildren();
  else dock.innerHTML='<div class="console">'+({routes,market,shipyard,quarters}[tab]||routes)()+menuNav()+'</div>';
  by('fire').textContent=t(p.flight?.phase==='surface'?'Sample':'Pulse');
  by('boost').textContent=t('Boost');by('brake').textContent=t('Brake');by('throttleUp').textContent=t('Thrust +');
  by('joystick').setAttribute('aria-label',t(walk?'Walk':'Steer'));
  by('space').setAttribute('aria-label',t(walk?'Ship interior':pilot?'Cockpit':'Space flight'));
  if(walk) walkHud();
  renderDialog();if(p.flight&&!walk)hud();
}
function release(){ controls?.clear(); }
function enterWalk(fromHelm=false) {
  bridge.mode='walk';bridge.walker=fromHelm?spawnAtHelm():createWalker();
  bridge.bank=bridge.lookPitch=bridge.lookYaw=0;
  if(p.flight){p.flight.speed=p.flight.vx=p.flight.vy=p.flight.vz=0;}
  dialog=null;paused=false;release();save(true);
}
function sit() {
  bridge.mode='pilot';bridge.lookYaw=bridge.lookPitch=bridge.bank=0;
  dialog=null;paused=false;release();save(true);
}
function interact(){
  if(bridge.mode==='pilot'){enterWalk(true);return;}
  if(bridge.mode!=='walk')return;
  const station=locationAction();
  if(station==='helm')sit();
  else if(station==='port'){bridge.mode='external';tab='routes';release();save(true);}
}
function pause(){
  paused=true;dialog='menu';release();save(true);render();
}
function result(rescue){
  const f=p.flight;
  if(!f || !S.settle(p,f,rescue))return;
  bridge.mode='pilot';bridge.lookYaw=bridge.lookPitch=bridge.bank=0;paused=false;dialog='result';tab='routes';destination=(p.port+1)%3;release();save(true);achievements();render();
}
function action(key,value){
  const i=Number(value);
  if(key==='tab'){tab=value;}
  else if(key==='board'&&!p.flight)enterWalk();
  else if(key==='interact')interact();
  else if(key==='stand'&&bridge.mode==='pilot')enterWalk(true);
  else if(key==='orders'&&!p.flight&&bridge.mode==='pilot'){release();dialog='orders';}
  else if(key==='mount'){p.cabinMount=p.cabinMount==='berth'?'desk':'berth';save(true);}
  else if(key==='mode')mode=i;
  else if(key==='dest')destination=[0,1,2].find(x=>x!==p.port&&x!==destination);
  else if(key==='yard')yardTab=['Hull','Modules','Pilot'][i];
  else if(key==='crewtab')crewTab=['Crew','Interior'][i];
  else if(key==='buy'||key==='sell'){if(S.trade(p,i,key==='buy'))save(true);}
  else if(['frame','module','crew','bunks','skill','cabin'].includes(key)){
    if(S.equip(p,key,i)){save(true);toast(t(key==='cabin'?'Interior updated':'Loadout updated'));}
  }else if((key==='launch'||key==='depart')&&!p.flight){
    p.finish=null;p.flight=F.create(p,mode,destination,S.stats(p));p.flight.thrust=0;sit();
    toast(t(touch?'Hold Thrust + to move. Drag to steer.':'W adds thrust · mouse or arrows steer'));
  }else if(key==='menu'){pause();return;}
  else if(key==='close'){paused=false;dialog=null;release();}
  else if(key==='journal'||key==='help')dialog=key;
  else if(key==='recall'){result('recall');return;}
  else if(key==='next'||key==='stay'){p.finish=null;dialog=null;bridge.mode=key==='stay'?'pilot':'external';save(true);}
  else if(key==='lang'){lang=lang==='ru'?'en':'ru';write('freeboard.language',lang);}
  else if(key==='hub'){if(host&&host.ui)host.ui.menu();}
  render();
}
deck.addEventListener('click',e=>{const b=e.target.closest('button[data-key]');if(b&&!b.disabled)action(b.dataset.key,b.dataset.value);});
by('menu').addEventListener('click',pause);
function align(){
  const f=p.flight;if(!f||paused||bridge.mode!=='pilot'||f.phase!=='space')return;
  const g=F.guide(f),dx=g.x-f.x,dy=g.y-f.y,dz=g.z-f.z;
  f.yaw=Math.atan2(dx,-dz);f.pitch=Math.atan2(dy,Math.hypot(dx,dz));
}
by('marker').style.pointerEvents='auto';by('marker').addEventListener('click',align);
addEventListener('keydown',e=>{
  if(e.ctrlKey||e.metaKey||e.altKey||e.repeat)return;
  if(e.code==='Escape'){
    e.preventDefault();
    if(dialog==='result')return;
    if(dialog)action('close');else pause();
  }else if(!dialog&&e.code==='KeyF'){
    e.preventDefault();interact();render();
  }else if(!dialog&&e.code==='KeyE'&&bridge.mode==='pilot'&&p.flight){
    e.preventDefault();align();
  }
});
function suspend(){
  release();
  if(!dialog&&(p.flight||bridge.mode==='walk'||bridge.mode==='pilot')) pause();
  else save(true);
}
document.addEventListener('visibilitychange',()=>{if(document.hidden)suspend();});
addEventListener('pagehide',()=>{release();save(true);});
addEventListener('blur',()=>{if(!document.hidden)suspend();});
if(host&&host.on)host.on('hidden',suspend);
function hud(){
  const f=p.flight;if(!f)return;
  const surface=f.phase==='surface';
  by('phase').textContent=t(S.modes[f.mode])+' / '+t(S.ports[f.dest].name);
  const label=surface?(f.samples>=3?'Return to the ship':'Sample the crystals'):f.mode===1&&f.hits<3?'Clear the drones':f.mode===2?'Enter the landing beacon':'Dock at the aqua beacon';
  by('mission').textContent=t(label);
  by('readings').textContent=surface?t('Samples')+' '+f.samples+'/3'+(f.harvest>0?' · '+Math.round(f.harvest/.55*100)+'%':''):
    fmt(f.speed)+' '+t('m/s')+'  ·  '+t('Thrust')+' '+Math.round(f.thrust*100)+'%  ·  '+t('Shield')+' '+fmt(f.shield)+'  ·  '+t('Hull')+' '+fmt(f.hull)+'  ·  '+(f.mode===1?t('Drones')+' '+f.hits+'/3':t('Rings')+' '+f.rings+'/3');
  const fireLabel=surface?(f.samples>=3?'Board ship':'Sample'):'Pulse';by('fire').textContent=t(fireLabel);
  by('boost').hidden=surface;by('brake').hidden=surface;by('throttleUp').hidden=surface;by('reticle').hidden=surface;
  const g=F.guide(f);if(!g||!view)return;
  const projected=view.project(g);const m=by('marker');
  const outside=projected.back||projected.x<.08||projected.x>.92||projected.y<.2||projected.y>.78;
  m.classList.toggle('edge',outside);m.style.left=(Math.max(.09,Math.min(.91,projected.x))*100)+'%';
  m.style.top=(Math.max(.24,Math.min(.75,projected.y))*100)+'%';m.firstElementChild.textContent=outside?(projected.x<.45?'◂':projected.x>.55?'▸':projected.y<.5?'▴':'▾'):'';
  m.lastElementChild.textContent=fmt(F.gap(f,g))+' '+t('m');
}
try{
  const module=await import('./scene.js');
  view=new module.Scene(by('space'));
}catch(error){
  console.warn('Freeboard compatibility renderer',error);
  const module=await import('./simple-scene.js');
  // An unsuccessful WebGL initialization can already own the previous canvas.
  const old=by('space'),fresh=old.cloneNode(false);old.replaceWith(fresh);
  view=new module.SimpleScene(fresh);
}
controls=new ShipControls(by('space'),by('joystick'),['fire','boost','brake','throttleUp'].map(by),
  ()=>!dialog&&(bridge.mode!=='external'||!!p.flight),()=>bridge.mode==='pilot'&&!!p.flight);

function updateWalking(dt,mouse) {
  const w=bridge.walker;
  w.yaw=(w.yaw + mouse.x*.003 + controls.axis('ArrowRight','ArrowLeft')*1.65*dt) % (2*Math.PI);
  w.pitch=clip(w.pitch - mouse.y*.003 + controls.axis('ArrowUp','ArrowDown')*1.30*dt,-1.35,1.35);
  advanceWalker(w,{forward: controls.axis('KeyW','KeyS')-controls.y, right:controls.axis('KeyD','KeyA')+controls.x},dt,p);
}
function fly(f,dt,mouse) {
  const land=f.phase==='surface',before=f.phase;
  const lateral=controls.x + controls.axis('KeyD','KeyA') + controls.axis('ArrowRight','ArrowLeft');
  let vertical=controls.y-controls.axis('ArrowUp','ArrowDown');
  const boost=controls.held('boost','ShiftLeft')||controls.keys.has('ShiftRight');
  const brake=controls.held('brake','KeyS');
  const thrust=controls.held('throttleUp','KeyW');
  if(land) vertical-=controls.axis('KeyW','KeyS');
  else {
    f.yaw+=mouse.x*.003;
    f.pitch=clip(f.pitch-mouse.y*.003,-1.25,1.25);
    f.thrust=clip(f.thrust+(Number(thrust)-Number(brake))*dt*.75,0,1);
    const roll=clip(lateral+mouse.x*.06,-1,1);
    bridge.bank += (roll-bridge.bank)*(1-Math.exp(-7*dt));
  }
  const input={x:clip(lateral,-1,1),y:clip(vertical,-1,1),action:controls.held('fire','Space'),brake,boost};
  const count=Math.ceil(dt/.035),stats=S.stats(p);
  for(let i=0;i<count&&f.phase===before&&!f.finish;i++)F.step(f,dt/count,input,stats);
  if(f.finish)result(f.finish==='rescue');
  else if(f.phase!==before){bridge.mode='external';release();save(true);render();toast(t('Walk to the crystals and hold Sample.'));}
}
let walkPosition='';
function frame(now){
  const dt=clip((now-(lastTime||now))/1000,.001,.18);lastTime=now;
  if(!document.hidden){
    const mouse=controls.look();
    if(!paused&&!dialog){
      elapsed+=dt;
      if(bridge.mode==='walk')updateWalking(dt,mouse);
      else if(p.flight)fly(p.flight,dt,mouse);
      else if(bridge.mode==='pilot'){
        bridge.lookYaw=clip(bridge.lookYaw+mouse.x*.003+controls.axis('ArrowRight','ArrowLeft')*dt*1.5,-1.2,1.2);
        bridge.lookPitch=clip(bridge.lookPitch-mouse.y*.003+controls.axis('ArrowUp','ArrowDown')*dt,-.75,.75);
      }
      if(now-lastSave>2200){
        if(p.flight)save();
        else if(bridge.mode==='walk'){
          const here=[bridge.walker.x,bridge.walker.z,bridge.walker.yaw,bridge.walker.pitch].map(n=>n.toFixed(3)).join(',');
          if(walkPosition!==here){walkPosition=here;save();}
        }
      }
    }
    view.draw(p,tab,elapsed,dt,bridge);
    if(now-lastHud>100){if(bridge.mode==='walk')walkHud();else if(p.flight)hud();lastHud=now;}
  }
  requestAnimationFrame(frame);
}
if(p.finish&&!p.flight)dialog='result';else if(p.flight)dialog='menu';
render();requestAnimationFrame(frame);
