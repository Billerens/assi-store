import {Harbour} from './scene.js';
import {loadProfile,saveProfile,record,ranked,courseRecords,weekStart,weekSeed} from './profile.js';

const R=window.TideRace, $=id=>document.getElementById(id);
const root=$('game'), screen=$('screen'), hud=$('hud'), cue=$('cue');
const TICK=1000/60, weeklyChallenges=[43117,83009];
const districts=['harbour','drydock','yard','locks'];
let words={}, en={}, lang='ru', hub=null,profile,viewer, mode='boot', returning='home';
let run,track,events=[],tail=[],kind='open',attemptId='',result=null,practicePoint=null;
let ghost=null, ghostEvents=[],ghostIndex=0, replayEvents=[],replayIndex=0,watchRow=null;
let raf=0,lastTime=0,lag=0,deadline=0,overlayMode='home',previousBest=0,weekOffset=0,selectedCourse=weeklyChallenges[0];
let saveIssue=false,lastSaveTick=0,heard=-1,guideTab='stats',historyPage='open',metric='meters',soundCtx=null;
let ghostRecord=null,wardrobeClose=null,cleanWardrobe=null;
const t=id=>{const text=words[id]||id; return lang==='en'?(en[text]||text):text;};
const number=n=>Math.floor(n||0).toLocaleString(lang==='en'?'en-GB':'ru-RU');
const unit=n=>number(n)+' '+t('meter');
const tideCode=n=>'#'+String(n).padStart(5,'0');
const trDate=d=>d.toLocaleDateString(lang==='ru'?'ru-RU':'en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'});
function el(tag,cls,text) {const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;}
function btn(id,fn,style='secondary',suffix='') {
  const b=el('button',style,t(id)+(suffix?' '+suffix:''));b.type='button';b.dataset.action=id;b.onclick=fn;return b;
}
function icon(symbol,label,fn){const b=el('button','iconBtn',symbol);b.type='button';b.dataset.action=label;b.setAttribute('aria-label',t(label));b.title=t(label);b.onclick=fn;return b;}
function mainButton(id,fn){const b=btn(id,fn,'big');b.append(el('i','','→'));return b;}
function row(...items){const n=el('div','row');n.append(...items);return n;}
function numbers(items){const n=el('div','recordsLine');for(const [label,value] of items){const d=el('div');d.append(el('span','statLabel',t(label)),el('strong','',value));n.append(d);}return n;}
function scene(){if(viewer&&run) viewer.render(run,track,{skin:run.skin??profile?.skin??0,outfit:run.outfit??profile?.outfit??0,marker:previousBest,
  ghost:profile?.ghost?ghost:null,ghostSkin:ghostRecord?.skin||0,ghostOutfit:ghostRecord?.outfit||0,view:mode==='home'?'home':'race'});}
function arrange(name,card=false){
  if(cleanWardrobe){cleanWardrobe();cleanWardrobe=null;}
  mode=name;root.dataset.mode=name; screen.className=card?'sheetMode':'';screen.replaceChildren();
  hud.hidden=true;cue.hidden=true;lastTime=0;lag=0;
}
function sheet(tag,title,close) {
  const panel=el('section','sheet'),head=el('div','sheetHead');head.append(el('span','eyebrow',t(tag)));
  if(close)head.append(icon('×','back',close));panel.append(head,el('h2','',t(title)));screen.append(panel);return panel;
}
function genSeed() {const a=new Uint32Array(1);if(window.crypto?.getRandomValues)crypto.getRandomValues(a);else a[0]=Math.random()*0xffffffff;return a[0]||1;}
function persist() {
  try{saveProfile(profile,hub);saveIssue=false;}catch(err){saveIssue=true;console.warn('Crestline save',err);}
}
function snapshot(){
  if(!run||run.dead||!['run','paused','count'].includes(mode)||kind==='practice')return;
  profile.live={id:attemptId,kind,seed:track.seed,state:{...run},tape:R.encode(events),tail:tail.map(s=>({...s})),prior:previousBest};
  persist();lastSaveTick=run.tick;
}
function playTone(notice){
  if(!profile.sound||!soundCtx||soundCtx.state!=='running')return;
  const notes={bank:[638,880],gate:[420+run.gates*65],miss:[158],washed:[146],wave:[320,455],crash:[112,72],record:[690,960],
    token:[568+(run.collected||0)%5*72],magnet:[395,641],boost:[385,776],rescued:[305,420]};
  if(!notes[notice])return;
  notes[notice].forEach((hz,i)=>{const o=soundCtx.createOscillator(),g=soundCtx.createGain(),at=soundCtx.currentTime+i*.075;
    o.type=notice==='crash'?'triangle':'sine';o.frequency.setValueAtTime(hz,at);g.gain.setValueAtTime(0,at);g.gain.linearRampToValueAtTime(notice==='token'?.026:.047,at+.008);g.gain.exponentialRampToValueAtTime(.001,at+.14);
    o.connect(g);g.connect(soundCtx.destination);o.start(at);o.stop(at+.16);});
}
function audioStart(){if(!profile.sound)return;try{const Audio=window.AudioContext||window.webkitAudioContext;if(Audio&&!soundCtx)soundCtx=new Audio();if(soundCtx?.state==='suspended')soundCtx.resume().catch(()=>{});}catch(_){}}
function home(){
  arrange('home');returning='home';ghost=null;
  track=R.course(profile.last?.seed||weeklyChallenges[0]);run=R.fresh(track.seed);run.d=7;previousBest=profile.bestDistance;scene();
  const mast=el('div','mast'), brand=el('div','brandline');
  brand.innerHTML='<svg class="brandmark" viewBox="0 0 40 25" aria-hidden="true"><path fill="currentColor" d="M1 20C13 20 13 2 29 3c-5 2-7 8-3 11 4 3 9 0 12-3-2 9-11 14-20 8l-2-3C11 22 6 23 1 23Z"/></svg>';
  brand.append(document.createTextNode(t('homeTag')));mast.append(brand,el('h1','',t('title')));screen.append(mast);
  const dock=el('div','dock');
  if(profile.bestDistance||profile.bestScore)dock.append(numbers([['best',unit(profile.bestDistance)],['bestScore',number(profile.bestScore)]]));
  if(profile.live)dock.append(mainButton('resume',resumeSaved),btn('newRun',()=>start('open',genSeed())));
  else dock.append(mainButton('start',()=>start('open',genSeed())));
  dock.append(row(btn('wardrobe',()=>wardrobe(home)),btn('hangar',()=>hangar('stats')),btn('guide',()=>help('home'))));
  if(hub){const controls=row(btn('menu',()=>hub.ui.menu(),'flat'),btn('exit',()=>hub.el.exit.click(),'flat'));dock.append(controls);}
  if(saveIssue)dock.append(el('p','note',t('failSave')));screen.append(dock);
}
function help(from){
  arrange('help',true);const close=()=>from==='paused'?pausePanel():home(),p=sheet('guide','guide',close);
  p.append(el('p','',t('helpLead')));
  for(const [a,b] of [['helpLeft','helpLeftText'],['helpUp','helpUpText'],['helpDown','helpDownText'],['helpLoot','helpLootText'],['helpBank','helpBankText']]){
    p.append(el('h3','',t(a)),el('p','',t(b)));
  }
  p.append(btn('back',close));
}
function currentReference(seed,rules=R.RULES){
  return ranked(courseRecords(profile,seed).filter(rec=>rec.rules===rules),'meters')[0]||null;
}
function setGhost(reference,startTick=0) {
  ghost=null;ghostRecord=null;ghostEvents=[];ghostIndex=0;
  if(!reference||reference.seed!==track.seed||reference.rules!==track.rules)return;
  ghostRecord=reference;
  ghostEvents=R.decode(reference.tape);
  ghost=R.playback(track.seed,ghostEvents,startTick,reference.gear,reference.rules);ghost.limit=reference.ticks;
  while(ghostIndex<ghostEvents.length&&ghostEvents[ghostIndex][0]<startTick)ghostIndex++;
}
function start(nextKind,seed,state=null,reference=null) {
  audioStart();const training=nextKind==='practice';
  if(!training&&profile.live){profile.live=null;persist();}
  const rules=reference?.rules||state?.rules||(state?1:R.RULES);
  kind=nextKind;track=R.course(seed,rules);run=Object.assign(R.fresh(seed,profile.gear,rules),state||{});
  run.skin=run.skin??profile.skin;run.outfit=run.outfit??profile.outfit;
  events=[];tail=[{...run}];result=null;heard=run.noticeTick;lastSaveTick=run.tick;
  attemptId=String(Date.now())+'-'+genSeed();previousBest=kind==='open'?profile.bestDistance:(currentReference(seed,rules)?.meters||0);
  setGhost(kind==='fixed'?(reference||currentReference(seed,rules)):null,run.tick);
  beginRun();if(!training)snapshot();
}
function resumeSaved(){
  const live=profile.live;if(!live?.state||live.state.dead){profile.live=null;persist();home();return;}
  const rules=live.state.rules||1;
  kind=live.kind;track=R.course(live.seed,rules);run={...R.fresh(live.seed,profile.gear,rules),...live.state};
  events=R.decode(live.tape);tail=(live.tail||[]).map(s=>({...s}));
  if(!tail.length)tail=[{...run}];attemptId=live.id;previousBest=live.prior||0;lastSaveTick=run.tick;heard=run.noticeTick;
  setGhost(kind==='fixed'?currentReference(live.seed,rules):null,run.tick);audioStart();countdown();
}
function bankLine(){
  if(run.gates)return t('streak')+' ×'+(run.gates>=5?3:run.gates>=3?2:1)+' · '+number(R.value(run.raw,run.gates));
  if(run.wave<0&&run.roofUntil>run.d)return t('linked');
  return t(districts[R.district(run.d)]);
}
function buildHUD(){
  const left=el('div'),right=el('div','hudR'),score=el('div');
  const tag=el('small');tag.id='hudTag';const dist=el('strong');dist.id='hudDist';const detail=el('small','next');detail.id='hudDetail';
  left.append(tag,dist,detail);const value=el('div','subscore');value.id='hudScore';score.append(el('small','',t('score')),value);
  const wallet=el('div','pouch'),coin=el('b','coinIcon','⚓'),amount=el('span');amount.id='hudTokens';
  wallet.title=t('tokens');wallet.append(coin,amount);score.append(wallet);
  const effect=el('div','hudEffect');effect.id='hudEffect';left.append(effect);
  right.append(score,mode==='replay'?icon('×','replayExit',()=>endPanel(watchRow)):icon('Ⅱ','pause',pausePanel));
  hud.replaceChildren(left,right);hud.hidden=false;
}
function updateHUD(){
  const m=Math.floor(run.d);
  $('hudTag').textContent=(mode==='practice'?t('training'):mode==='replay'?t('replay'):t('tide'))+' '+tideCode(track.seed);
  $('hudDist').textContent=unit(m);$('hudScore').textContent=number(R.score(run));
  $('hudTokens').textContent=number(run.tokens||0);
  const active=[];if(run.magnet)active.push(t('magnetShort')+' '+Math.ceil(run.magnet/60)+t('second'));
  if(run.boost)active.push('×2 '+Math.ceil(run.boost/60)+t('second'));
  const effect=$('hudEffect');effect.hidden=!active.length;effect.textContent=active.join(' · ');
  $('hudDetail').textContent=bankLine()+(previousBest>m&&previousBest-m<100?' · '+t('toBest')+' '+unit(previousBest-m):'');
  let msg='',type='';
  if(run.tick-run.noticeTick<86&&run.notice){
    type=run.notice;
    if(type==='gate')msg=t('gate')+' '+run.gates+' · '+number(run.amount);
    else if(type==='bank')msg=t('banked')+' +'+number(run.amount);
    else if(type==='record')msg=t('distanceCue');
    else if(type!=='crash')msg=t(type);
  }else if(run.wave>=0&&run.gates>=2)msg=t('exitHint');
  else if(run.tick<135)msg=t(matchMedia('(pointer:coarse)').matches?'hintTouch':'hintStart');
  else if(run.d>49&&run.d<69)msg=t('entryHint');
  if(msg!==cue.textContent)cue.textContent=msg;cue.dataset.kind=type;cue.hidden=!msg;
  root.dataset.distance=String(m);root.dataset.lane=String(run.lane);root.dataset.surface=run.wave>=0?'wave':'quay';root.dataset.streak=String(run.gates);
  root.dataset.posture=run.air?'jump':run.slide?'duck':'ride';
  root.dataset.motion=run.wave>=0?'surf':run.surge?'boost':run.slide?'slide':run.air?'jump':'run';
  root.dataset.tokens=String(run.tokens||0);root.dataset.pickups=String(run.pickups||0);
}
function beginRun(){arrange(kind==='practice'?'practice':'run');buildHUD();updateHUD();scene();schedule();}
function accept(a){if(mode!=='run'&&mode!=='practice')return;if(R.input(run,a)){events.push([run.tick,a]);updateHUD();scene();}}
function replayInput(r,list,idx){while(idx<list.length&&list[idx][0]===r.tick)R.input(r,list[idx++][1]);return idx;}
function tick(){
  if(mode==='replay')replayIndex=replayInput(run,replayEvents,replayIndex);
  if(ghost&&!ghost.dead){
    if(ghost.tick>=ghost.limit)ghost=null;
    else {ghostIndex=replayInput(ghost,ghostEvents,ghostIndex);R.step(ghost,track);}
  }
  const before=Math.floor(run.d);R.step(run,track);
  if(run.tokenTick===run.tick)playTone('token');
  if(previousBest&&before<=previousBest&&Math.floor(run.d)>previousBest&&run.tick-run.noticeTick>65){
    run.notice='record';run.noticeTick=run.tick;
  }
  if(heard!==run.noticeTick){heard=run.noticeTick;playTone(run.notice);}
  if(mode==='replay'){
    if(run.dead||run.tick>=watchRow.ticks){endPanel(watchRow,true);return;}
  }else{
    if(run.tick%60===0){tail.push({...run});while(tail.length>8)tail.shift();}
    if(run.dead){finish();return;}
    if(mode==='run'&&run.tick-lastSaveTick>=480)snapshot();
  }
}
function frame(now){
  raf=0;if(document.hidden)return;
  if(mode==='count'){
    if(now>=deadline){beginRun();return;}
    screen.firstElementChild.textContent=String(Math.ceil((deadline-now)/1000));
  }else if(['run','practice','replay'].includes(mode)){
    if(lastTime)lag+=Math.min(now-lastTime,160);
    let steps=0;
    while(lag>=TICK&&steps++<10&&['run','practice','replay'].includes(mode)){lag-=TICK;tick();}
    if(['run','practice','replay'].includes(mode)){updateHUD();scene();}
  }else return;
  lastTime=now;schedule();
}
function schedule(){if(!raf&&!document.hidden)raf=requestAnimationFrame(frame);}
function countdown(){arrange('count');screen.append(el('div','center','2'));deadline=performance.now()+1700;scene();schedule();}
function pausePanel(){
  if(mode==='replay'){endPanel(watchRow);return;}
  if(!['run','practice','count','paused','help'].includes(mode))return;
  if(mode==='run')snapshot();arrange('paused',true);
  const p=sheet('pause','pause');p.append(numbers([['distance',unit(run.d)],['score',number(R.score(run))]]),
    mainButton('continue',()=>{audioStart();countdown();}),btn('guide',()=>help('paused')));
  if(kind==='practice')p.append(btn('again',()=>doPractice(practicePoint)),btn('leavePractice',home,'flat'));
  else p.append(row(btn('later',()=>{snapshot();home();},'flat'),btn('leaveRun',()=>finish(true),'flat')));
}
function finish(retired=false){
  const training=kind==='practice',old=profile.bestDistance;
  if(!training)profile.live=null;
  const checkpoint=tail.filter(s=>s.tick<=Math.max(0,run.tick-360)).at(-1)||tail[0]||R.fresh(track.seed);
  const rec={id:attemptId,seed:track.seed,mode:kind,rules:track.rules,ticks:run.tick,meters:Math.floor(run.d),
    gear:{...run.gear},tokens:run.tokens||0,pickups:run.pickups||0,skin:run.skin??profile.skin,outfit:run.outfit??profile.outfit,
    score:R.score(run),bestBank:run.bestBank,bestChain:run.bestChain,tape:R.encode(events),checkpoint:{...checkpoint},
    cause:retired?'retired':run.dead,at:Date.now()};
  if(!training){
    record(profile,rec);persist();
    if(hub&&!hub.readonly){
      if(run.banks)hub.achieve('first-bank');if(run.d>=1000)hub.achieve('kilometre');if(run.bestChain>=5)hub.achieve('full-wave');
    }
  }
  endPanel(rec,false,!training&&kind==='open'&&rec.meters>old);
}
function endPanel(rec,watched=false,newRecord=false){
  if(!rec){home();return;}
  arrange('over',true);result=rec;ghost=null;scene();
  const p=sheet('tide',watched?'finishReplay':rec.mode==='practice'?'trained':newRecord?'recordSet':'runOver');
  p.querySelector('.eyebrow').textContent=t('tide')+' '+tideCode(rec.seed);
  p.append(numbers([['distance',unit(rec.meters)],['score',number(rec.score)]]));
  p.append(el('p','',rec.cause==='retired'?t('retired'):t('crash'+rec.cause)));
  if(rec.mode==='practice'){p.append(mainButton('again',()=>doPractice(practicePoint)),btn('back',home));return;}
  p.append(el('p','earnings',t('tokens')+' +'+number(rec.tokens)+' · '+t('wallet')+' '+number(profile.wallet)));
  p.append(mainButton('newRun',()=>start('open',genSeed())),row(btn('revenge',()=>start('fixed',rec.seed,null,rec)),btn('practice',()=>doPractice(rec))),
    row(btn('watch',()=>watch(rec),'flat'),btn('wardrobe',()=>wardrobe(()=>endPanel(rec)),'flat'),btn('hangar',()=>hangar('stats'),'flat')));
}
function doPractice(rec){
  if(!rec)return;practicePoint=rec;
  start('practice',rec.seed,rec.checkpoint||R.fresh(rec.seed,rec.gear,rec.rules));
}
function practiseWave(){
  const seed=selectedCourse,r=R.fresh(seed,profile.gear);r.d=52;r.tick=340;r.lane=2;r.pos=2;
  doPractice({seed,checkpoint:r});
}
function watch(rec){
  if(!rec||![1,R.RULES].includes(rec.rules))return;
  audioStart();watchRow=rec;ghost=null;track=R.course(rec.seed,rec.rules);run=R.fresh(rec.seed,rec.gear,rec.rules);
  run.skin=rec.skin||0;run.outfit=rec.outfit||0;previousBest=0;
  replayEvents=R.decode(rec.tape);replayIndex=0;heard=-1;arrange('replay');buildHUD();updateHUD();scene();schedule();
}
function hangar(tab){
  guideTab=tab;arrange('hangar',true);
  const p=sheet('homeTag','hangar',home),tabs=el('div','tabbar');
  for(const nm of ['stats','challenges','room'])tabs.append(btn(nm,()=>hangar(nm),nm===tab?'active':''));
  p.append(tabs);
  if(tab==='stats'){
    p.append(row(btn('open',()=>{historyPage='open';hangar(tab);},historyPage==='open'?'secondary':'flat'),
      btn('fixed',()=>{historyPage='fixed';hangar(tab);},historyPage==='fixed'?'secondary':'flat')));
    if(historyPage==='fixed')p.append(el('p','',t('tide')+' '+tideCode(selectedCourse)));
    const list=historyPage==='fixed'?courseRecords(profile,selectedCourse):profile.rows;
    p.append(row(btn('topMeters',()=>{metric='meters';hangar(tab);},metric==='meters'?'secondary':'flat'),
      btn('topScores',()=>{metric='score';hangar(tab);},metric==='score'?'secondary':'flat')));
    if(!list.length)p.append(el('p','',t('noRecords')));
    let rank=0,prior=null;ranked(list,metric).forEach((entry,i)=>{
      if(prior!==entry[metric])rank=i+1;prior=entry[metric];
      const b=el('button','listrow');b.append(el('span','num',String(rank).padStart(2,'0')),
        el('span','val',metric==='meters'?unit(entry.meters):number(entry.score)),el('span','seed',tideCode(entry.seed)),el('span','','↗'));
      b.onclick=()=>{selectedCourse=entry.seed;endPanel(entry);};p.append(b);
    });
    if(profile.last)p.append(btn('previous',()=>endPanel(profile.last),'flat'));
  }else if(tab==='challenges'){
    p.append(el('h3','',t('week')));
    const week=weekStart(weekOffset),seed=weekSeed(week);
    const date=el('span','',trDate(week));date.style.textAlign='center';
    const next=icon('›','weekNext',()=>{weekOffset++;hangar(tab);});next.disabled=weekOffset>=0;
    p.append(row(icon('‹','weekPrev',()=>{weekOffset--;hangar(tab);}),date,next),mainButton('go',()=>{selectedCourse=seed;start('fixed',seed);}));
    p.append(el('h3','',t('fixed')),row(...weeklyChallenges.map((s,i)=>btn(i?'beacon':'reef',()=>{selectedCourse=s;start('fixed',s);},'flat'))));
    const f=el('form','controlField'),input=el('input');input.inputMode='numeric';input.setAttribute('aria-label',t('code'));input.placeholder=t('code');input.maxLength=10;
    const launch=btn('go',()=>{},'secondary');launch.type='submit';launch.onclick=null;
    f.onsubmit=e=>{e.preventDefault();const s=Number(input.value);if(!Number.isInteger(s)||s<=0||s>4294967295){input.setCustomValidity(t('invalidCode'));input.reportValidity();return;}selectedCourse=s;start('fixed',s);};
    input.oninput=()=>input.setCustomValidity('');f.append(input,launch);p.append(f,btn('wavePractice',practiseWave,'flat'));
  }else{
    p.append(numbers([['runs',number(profile.runs)],['comboBest',number(profile.bestBank)]]),mainButton('wardrobe',()=>wardrobe(()=>hangar('room'))));
    for(const pref of ['ghost','sound']){
      const b=btn(pref,()=>{profile[pref]=!profile[pref];persist();hangar(tab);},'flat',t(profile[pref]?'yes':'no'));p.append(b);
    }
  }
  p.append(btn('back',home,'flat'));
}
async function wardrobe(close){
  arrange('wardrobe');wardrobeClose=close;
  const {openWardrobe}=await import('./wardrobe.js');
  if(mode!=='wardrobe')return;
  const dispose=openWardrobe({mount:screen,profile,lang,translations:en,commit:next=>{
    if(hub?.readonly)return false;
    const old=profile;profile=next;persist();
    if(saveIssue)profile=old;
    return !saveIssue;
  },close});
  cleanWardrobe=typeof dispose==='function'?dispose:null;
}
function suspend(){
  if(mode==='run'||mode==='practice'||mode==='count'){pausePanel();}
  if(mode==='replay')endPanel(watchRow);
  if(raf)cancelAnimationFrame(raf);raf=0;lastTime=0;lag=0;
}
function bindInput(){
  let touch=null;
  for(const canvas of [$('world'),$('fallback')]){
    canvas.addEventListener('pointerdown',e=>{if(!['run','practice'].includes(mode)||touch)return;
      touch={id:e.pointerId,x:e.clientX,y:e.clientY};canvas.setPointerCapture?.(e.pointerId);e.preventDefault();});
    const swipe=e=>{
      if(!touch||e.pointerId!==touch.id)return;
      const dx=e.clientX-touch.x,dy=e.clientY-touch.y;
      if(Math.max(Math.abs(dx),Math.abs(dy))<Math.min(32,Math.max(19,innerWidth*.053)))return;
      accept(Math.abs(dx)>Math.abs(dy)?dx<0?'L':'R':dy<0?'U':'D');touch=null;e.preventDefault();
    };
    canvas.addEventListener('pointermove',swipe);canvas.addEventListener('pointerup',e=>{swipe(e);touch=null;});
    canvas.addEventListener('pointercancel',()=>{touch=null;});canvas.addEventListener('contextmenu',e=>e.preventDefault());
  }
  window.addEventListener('keydown',e=>{
    if(e.target instanceof HTMLInputElement||e.repeat)return;
    if(e.key==='Escape'||e.key.toLowerCase()==='p'){
      if(mode==='wardrobe')wardrobeClose?.();else if(mode==='paused')countdown();else if(['run','practice','replay'].includes(mode))pausePanel();else if(['hangar','help','over'].includes(mode))home();
      e.preventDefault();return;
    }
    const action={ArrowLeft:'L',ArrowRight:'R',ArrowUp:'U',ArrowDown:'D',KeyA:'L',KeyD:'R',KeyW:'U',KeyS:'D',Space:'U'}[e.code];
    if(action&&['run','practice'].includes(mode)){e.preventDefault();accept(action);}
  });
  document.addEventListener('visibilitychange',()=>{if(document.hidden)suspend();else {lastTime=0;scene();}});
  window.addEventListener('pagehide',suspend);
  window.addEventListener('resize',()=>{viewer?.resize();scene();});
  $('world').addEventListener('webglcontextlost',e=>{e.preventDefault();suspend();});
  $('world').addEventListener('webglcontextrestored',()=>{viewer.resize();scene();});
}
async function script(src){await new Promise((ok,fail)=>{const s=document.createElement('script');s.onload=ok;s.onerror=()=>fail(new Error(src));s.src=src;document.head.append(s);});}
async function hubBoot(){
  if(!window.axiko)return null;
  for(const href of ['/ui/kit/kit.css','/modules/games/engine/game.css']){
    const l=document.createElement('link');l.rel='stylesheet';l.href=href;document.head.prepend(l);
  }
  for(const src of ['/ui/kit/kit.js',...['big','fmt','rng','core','icons','sfx','game'].map(n=>'/modules/games/engine/'+n+'.js')])await script(src);
  const g=await window.Game.start({id:'tide-runner',sim:window.GameSim,root:$('engine'),render:function(){}});
  g.on('hidden',suspend);return g;
}
async function boot(){
  const loaded=await Promise.all([fetch('words.json').then(r=>r.json()),fetch('../i18n-en.json').then(r=>r.json()),hubBoot()]);
  [words,en,hub]=loaded;lang=new URLSearchParams(location.search).get('lang')||window.__lang||'ru';document.documentElement.lang=lang;document.title=t('title');
  profile=loadProfile(hub);viewer=new Harbour($('world'),$('fallback'));bindInput();home();
}
boot().catch(err=>{console.error('Crestline',err);screen.replaceChildren(el('div','sheet',words.engineError?t('engineError'):'Crestline — '+err.message));});
