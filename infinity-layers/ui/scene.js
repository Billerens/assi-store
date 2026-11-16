/* Read-only scene projection. No saves, random draws or economic mutations. */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.InfinityScene=api;})(typeof window!=='undefined'?window:globalThis,function(root){
'use strict';
const ID="infinity-layers", TITLE="Слои бесконечности", VIEWS=["Каскад","Орбиты"];
  const TAU = Math.PI * 2;
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const seed = n => { const v = Math.sin(n * 127.1 + 19.73) * 43758.5453; return v - Math.floor(v); };
  const mix = (a, b, n) => a + (b - a) * n;
  function poly(c, pts, fill, stroke, width) {
    c.beginPath(); pts.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.closePath();
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = width || 1; c.stroke(); }
  }
  function ellipse(c, x, y, rx, ry, fill, stroke, width, angle) {
    c.beginPath(); c.ellipse(x, y, rx, ry, angle || 0, 0, TAU);
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = width || 1; c.stroke(); }
  }
  function rect(c, x, y, w, h, fill, radius, stroke) {
    c.beginPath(); c.roundRect(x, y, w, h, radius || 0);
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = 1; c.stroke(); }
  }
  function line(c, pts, color, width, dash) {
    c.beginPath(); pts.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]));
    c.strokeStyle = color; c.lineWidth = width || 1; c.lineJoin = c.lineCap = 'round';
    if (dash) c.setLineDash(dash); c.stroke(); if (dash) c.setLineDash([]);
  }
  function text(c, label, x, y, size, color, align, weight) {
    c.font = (weight || 500) + ' ' + size + 'px "Segoe UI", sans-serif';
    c.textAlign = align || 'left'; c.textBaseline = 'middle'; c.fillStyle = color; c.fillText(label, x, y);
  }
  function grad(c, x, y, x2, y2, stops) {
    const g = c.createLinearGradient(x, y, x2, y2); stops.forEach(s => g.addColorStop(s[0], s[1])); return g;
  }
  function glow(c, x, y, radius, color) {
    const g = c.createRadialGradient(x, y, 0, x, y, radius); g.addColorStop(0, color); g.addColorStop(1, 'transparent');
    c.fillStyle = g; c.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
  function stars(c, t, amount, color) {
    for (let i = 0; i < amount; i++) {
      c.globalAlpha = .2 + seed(i + 72) * .45 + Math.sin(t * .45 + i) * .12;
      ellipse(c, seed(i + 1) * 1000, seed(i + 331) * 620, .5 + seed(i + 711) * 1.1, .5 + seed(i + 711) * 1.1, color);
    }
    c.globalAlpha = 1;
  }
  function spark(c, x, y, r, color) {
    line(c, [[x-r, y], [x+r, y]], color, 1.2); line(c, [[x, y-r], [x, y+r]], color, 1.2);
  }
  function tree(c, x, y, scale, dark, light) {
    line(c, [[x,y],[x,y-19*scale]], dark, 2*scale);
    ellipse(c,x,y-23*scale,10*scale,16*scale,light); ellipse(c,x-5*scale,y-19*scale,6*scale,10*scale,dark);
  }
  function cube(c, x, y, w, d, h, top, left, right) {
    poly(c, [[x,y-h],[x+w,y+d-h],[x,y+2*d-h],[x-w,y+d-h]], top);
    poly(c, [[x-w,y+d-h],[x,y+2*d-h],[x,y+2*d],[x-w,y+d]], left);
    poly(c, [[x,y+2*d-h],[x+w,y+d-h],[x+w,y+d],[x,y+2*d]], right);
  }
  function person(c, x, y, scale, coat, phase) {
    ellipse(c,x,y-13*scale,3*scale,3.6*scale,'#dfb696');
    rect(c,x-3*scale,y-9*scale,6*scale,9*scale,coat,2*scale);
    const step = Math.sin(phase || 0) * 2.3 * scale;
    line(c, [[x-1.5*scale,y-1*scale],[x-2*scale+step,y+6*scale]], '#283b43', 2*scale);
    line(c, [[x+1.5*scale,y-1*scale],[x+2*scale-step,y+6*scale]], '#283b43', 2*scale);
  }
  function pointOn(points, p) {
    const lengths = []; let total = 0;
    for(let i=1;i<points.length;i++){const n=Math.hypot(points[i][0]-points[i-1][0],points[i][1]-points[i-1][1]);lengths.push(n);total+=n;}
    let at = ((p%1)+1)%1 * total;
    for(let i=0;i<lengths.length;i++){if(at<=lengths[i]){const n=at/lengths[i];return{x:mix(points[i][0],points[i+1][0],n),y:mix(points[i][1],points[i+1][1],n),a:Math.atan2(points[i+1][1]-points[i][1],points[i+1][0]-points[i][0])};}at-=lengths[i];}
    return {x:points[0][0],y:points[0][1],a:0};
  }

  function bottle(c,x,y,w,h,color,fillLevel){
    c.save();
    const neck=w*.35;
    c.beginPath();c.moveTo(x-neck/2,y-h);c.lineTo(x+neck/2,y-h);c.lineTo(x+neck/2,y-h*.72);c.quadraticCurveTo(x+w/2,y-h*.62,x+w/2,y-h*.4);c.lineTo(x+w/2,y-4);c.quadraticCurveTo(x+w/2,y,x+w*.3,y);c.lineTo(x-w*.3,y);c.quadraticCurveTo(x-w/2,y,x-w/2,y-4);c.lineTo(x-w/2,y-h*.4);c.quadraticCurveTo(x-w/2,y-h*.62,x-neck/2,y-h*.72);c.closePath();
    c.fillStyle='#badedb17';c.fill();c.strokeStyle='#b4d5cc77';c.lineWidth=1.3;c.stroke();c.clip();
    const ly=y-h*(fillLevel||.42);rect(c,x-w/2,ly,w,h,color,0);ellipse(c,x,ly,w/2,3,color);line(c,[[x-w*.28,y-h*.52],[x-w*.28,y-10]],'#ffffff55',2);
    c.restore();rect(c,x-neck*.7,y-h-5,neck*1.4,8,'#a48255',2);
  }

  const positive = v => v===true || (typeof v==='number' ? v>0 : v && typeof v==='object' ? v.m>0 : /^t1:/.test(String(v)) || parseFloat(String(v))>0);
  const finite = (v, fallback=0) => Number.isFinite(Number(v)) ? Math.max(0,Number(v)) : fallback;
  function scale(v,max=8){if(!positive(v))return 0;if(String(v).startsWith('t1:'))return max;const x=v&&typeof v==='object'?v:null;const e=x?x.e:Number((String(v).split(/e/i)[1]||0));const m=x?x.m:parseFloat(v);return clamp(1+Math.log10(1+Math.max(0,Number.isFinite(e)?e:1000))+Math.log10(1+Math.max(0,Number.isFinite(m)?m:1000))*.2,1,max);}
  function amountText(v){if(v&&typeof v==='object')return String(v.m)+'e'+String(v.e);return String(v||0).replace(/e0$/,'');}
  function dots(c,x,y,n,color){for(let i=0;i<Math.min(10,n);i++)ellipse(c,x+i*9,y,2,2,color);}
  function reaction(c,x,y,effects){(effects||[]).slice(-3).forEach(e=>{const q=clamp(e.age/Math.max(.1,e.duration),0,1),color=e.kind==='failure'?'#e2a78c':e.kind==='unknown'?'#b3b9df':e.kind==='prestige'?'#d6baf0':e.kind==='discovery'?'#f1d98e':'#b9e5d0';c.save();c.globalAlpha=(1-q)*.8;ellipse(c,x,y,15+q*100,8+q*49,null,color,2);for(let k=0;k<(e.kind==='failure'?4:12);k++){const a=k/12*TAU; spark(c,x+Math.cos(a)*(25+q*85),y+Math.sin(a)*(15+q*50),2,color);}c.restore();});}
  function mount(game,parent){
    if(!root.Game || typeof root.Game.scene!=='function')return null;
    const wrapper=document.createElement('section');wrapper.className='world-scene';
    const tabs=document.createElement('div');tabs.className='world-scene-tabs';tabs.setAttribute('role','group');tabs.setAttribute('aria-label','Вид мира');
    const stage=document.createElement('div');stage.className='world-scene-stage';
    const caption=document.createElement('p');caption.className='world-scene-caption';
    let selected=0,current=null,previous=null;
    try{selected=sessionStorage.getItem(ID+':scene-view')==='1'?1:0;}catch(_){}
    const buttons=VIEWS.map((title,i)=>{const b=document.createElement('button');b.type='button';b.textContent=title;b.setAttribute('aria-pressed',String(i===selected));b.addEventListener('click',()=>{selected=i;buttons.forEach((x,j)=>x.setAttribute('aria-pressed',String(j===i)));try{sessionStorage.setItem(ID+':scene-view',String(i));}catch(_){}if(current)runtime.update(Object.assign({},current,{view:selected}));});tabs.append(b);return b;});
    wrapper.append(tabs,stage,caption);parent.append(wrapper);
    const runtime=root.Game.scene({parent:stage,label:'Живой мир: '+TITLE,width:1000,height:620,game,draw});
    return {node:wrapper,canvas:runtime.canvas,getView:()=>selected,inspect:runtime.inspect,pulse:(kind,payload,duration)=>runtime.pulse(kind,payload,duration||2),dispose(){runtime.dispose();wrapper.remove();},update(m){
      if(previous){if(m.cycle!==previous.cycle)runtime.pulse('prestige',{},2.4);else if(m.purchases!==previous.purchases)runtime.pulse('build',{},1.7);}
      previous={cycle:m.cycle,purchases:m.purchases};current=m;caption.textContent=m.summary;runtime.canvas.setAttribute('aria-label',TITLE+'. '+m.summary);runtime.update(Object.assign({},m,{view:selected}));
    }};
  }

function model(state,config,content,facts){
  const r=state.run||{},meta=state.meta||{},layers=state.layers||{},cfg=config||{},f=facts||{};
  const compression=layers.compression||{},challenge=finite(meta.challenge);
  const start=meta.foldTree&&meta.foldTree.denseStart?finite(cfg['denseStart.tiers'],5):finite(cfg['start.tiers'],4);
  const highest=finite(meta.highestLayer,3),ninth=highest>=4;
  const opened=Math.min(ninth?9:8,challenge===2||challenge===8?finite(cfg['start.tiers'],4):start+finite(compression.count));
  const depth=highest>=4?highest:meta.collapseUnlocked?3:meta.foldUnlocked?2:finite(compression.count)>0?1:0;
  const mirror=finite(r.mirrorUntil)>finite(f.now),tiers=(r.tiers||[]).slice(0,Math.min(9,opened)).map((tier,i)=>{
    const definition=(content&&content.tiers||[])[i]||{};
    const targets=[];
    if(i===0){if(!mirror)targets.push(-1);}else if(challenge===4)targets.push(-1);else{targets.push(i-1);if(meta.completed&&meta.completed[4])targets.push(-1);if(highest>=11)targets.push(i-2);}
    if(i===1&&mirror&&!targets.includes(-1))targets.push(-1);
    return {id:i,title:definition.title||['Точка','Отрезок','Плоскость','Объём','Поток','Узел','Сеть','Ткань','Полотно'][i],amount:amountText(tier.amount),bought:finite(tier.bought),owned:positive(tier.amount),scale:scale(tier.amount,7),working:positive(tier.amount)&&targets.length>0,targets};
  });
  const owned=tiers.filter(x=>x.owned).length,working=tiers.filter(x=>x.working).length;
  const heirlooms=Object.keys(meta.foldTree||{}).filter(k=>positive(meta.foldTree[k])).length+Object.keys(meta.collapseTree||{}).filter(k=>positive(meta.collapseTree[k])).length;
  return {tiers,opened,owned,working,depth,heirlooms,resonance:finite(r.resonance),income:amountText(f.income||0),incomeOn:positive(f.income),event:!!r.event,challenge,
    cycle:[depth,compression.count||0,(layers.fold||{}).count||0,(layers.collapse||{}).count||0,challenge].join(':'),
    purchases:tiers.map(x=>x.bought).join(':')+'|'+String(r.resonance||0)+'|'+heirlooms,
    summary:owned?'Ступеней в работе: '+working+' из '+opened+'. Купленные и произведённые количества указаны в списке ниже. '+(depth?'Глубина: '+depth+'.':''):'Пока нет генераторов. Доступно '+opened+' ступени — купите первую в списке ниже.'};
}
const TONES=['#a9e2dc','#b3d3a2','#b8bddf','#d9ba9c','#83c7c6','#c0a9d3','#b7d69e','#cbb694','#a9cde8'];
function terrace(c,x,y,r,tier,t){
  const ink=TONES[tier.id],grown=tier.owned;
  if(!grown){ellipse(c,x,y,r*.62,r*.19,'#24434b66',ink+'55',1);ellipse(c,x,y,r*.43,r*.13,null,ink+'33',1);text(c,'Доступна',x,y+5,13,'#b9c8c6','center');return;}
  poly(c,[[x-r,y],[x-r*.7,y+35],[x-10,y+62],[x+r*.73,y+27],[x+r,y]],'#263b50');
  poly(c,[[x-r*.7,y+35],[x-10,y+62],[x-30,y+12]],'#3f5366');
  ellipse(c,x,y,r,r*.28,grad(c,0,y-40,0,y+30,[[0,'#567b7c'],[1,'#243f4b']]),ink+'99',1.5);
  ellipse(c,x,y-3,r*.9,r*.22,null,ink+'33',1);
  const n=Math.min(9,Math.ceil(tier.scale)+1);
  for(let k=0;k<n;k++){
    const px=x-r*.65+seed(k+tier.id*9)*r*1.3,py=y-5+seed(k+13)*13,h=19+seed(k+2)*25+tier.scale*2;
    if(tier.id%3===1)tree(c,px,py,.6+seed(k)*.4,'#3b6b60',ink);
    else if(tier.id%3===2)cube(c,px,py,9+seed(k)*6,5,h*.6,ink,'#648a8b','#4b707d');
    else {poly(c,[[px-9,py],[px-8,py-h*.65],[px,py-h],[px+10,py-h*.6],[px+8,py]],ink);poly(c,[[px,py-h],[px+10,py-h*.6],[px+8,py],[px,py+1]],'#548d9e');}
  }
  if(tier.working){glow(c,x,y,65,ink+'22');ellipse(c,x,y,20+Math.sin(t*.7+tier.id)*3,6,null,ink+'aa',1);}
}
function cascadeWorld(c,m,t,fx){
  c.fillStyle=grad(c,0,0,1000,620,[[0,'#0c2633'],[.6,'#182b3b'],[1,'#141429']]);c.fillRect(0,0,1000,620);stars(c,t,65,'#cee8df');glow(c,780,470,340,'#9e8bd022');
  c.save();c.globalAlpha=.055;poly(c,[[5,0],[140,0],[720,620],[560,620]],'#a3dfd1');c.restore();
  const positions=m.tiers.map((a,i)=>{const rank=m.tiers.length-1-i;return{x:220+(rank%3)*280,y:140+Math.floor(rank/3)*166};});
  const point={x:884,y:544};
  m.tiers.forEach((tier,i)=>{
    if(!tier.working)return;const a=positions[i];
    tier.targets.forEach(target=>{const b=target<0?point:positions[target];if(!b)return;
      c.beginPath();c.moveTo(a.x+35,a.y+25);c.bezierCurveTo(a.x+65,a.y+96,b.x-40,b.y-80,b.x,b.y-20);c.strokeStyle=TONES[i]+'33';c.lineWidth=8;c.stroke();c.lineWidth=1;c.strokeStyle=TONES[i]+'99';c.stroke();
      for(let k=0;k<5;k++){const p=(t*.18+k/5)%1,q=1-p,x=q*q*q*(a.x+35)+3*q*q*p*(a.x+65)+3*q*p*p*(b.x-40)+p*p*p*b.x,y=q*q*q*(a.y+25)+3*q*q*p*(a.y+96)+3*q*p*p*(b.y-80)+p*p*p*(b.y-20);ellipse(c,x,y,2,3,TONES[i]);}
    });
  });
  m.tiers.forEach((tier,i)=>{const a=positions[i];terrace(c,a.x,a.y,100,tier,t);text(c,tier.title,a.x,a.y+66,16,TONES[i],'center',650);text(c,tier.owned?'Куплено '+tier.bought+' · '+tier.amount:'Ещё не приобретена',a.x,a.y+86,11,'#b8c8cd','center');});
  glow(c,point.x,point.y,53,m.incomeOn?'#b8e6c733':'#b8e6c710');ellipse(c,point.x,point.y,12,12,m.incomeOn?'#d7efbb':'#536c70');text(c,'Очки',point.x,point.y+31,13,'#c7daca','center');
  text(c,m.depth?'ГЛУБИНА '+m.depth:'НАЧАЛО КАСКАДА',40,38,12,'#b6cec6','left',600);
  if(m.heirlooms)dots(c,40,61,m.heirlooms,'#ceb6e4');
  if(m.event){ellipse(c,930,80,17,17,null,'#d7b986',2);spark(c,930,80,9,'#d7b986');}
  if(!m.owned)text(c,'Ваш первый поток ещё впереди',500,516,19,'#b7d1cc','center');
  reaction(c,point.x,point.y,fx);
}
function orbitalWorld(c,m,t,fx){
  c.fillStyle=grad(c,0,0,1000,620,[[0,'#14152f'],[.6,'#142d3c'],[1,'#163c39']]);c.fillRect(0,0,1000,620);stars(c,t,90,'#dde8db');glow(c,500,308,230,m.incomeOn?'#9cd3ae33':'#9cd3ae12');
  const cx=500,cy=300;
  m.tiers.forEach((tier,i)=>{
    const rx=102+i*36,ry=56+i*20,angle=-.28,a=i*2.4+(tier.working?t*.03:0),x=Math.cos(a)*rx,y=Math.sin(a)*ry;
    c.save();c.translate(cx,cy);c.rotate(angle);ellipse(c,0,0,rx,ry,null,TONES[i]+(tier.owned?'40':'15'),1);
    c.translate(x,y);c.rotate(-angle);const r=tier.owned?16+tier.scale*2.3:9;
    if(tier.owned){glow(c,0,0,r*2.5,TONES[i]+'20');ellipse(c,0,0,r,r,grad(c,-r,-r,r,r,[[0,TONES[i]],[1,'#345361']]));if(i%2)ellipse(c,0,0,r*1.6,r*.3,null,TONES[i]+'99',2,-.25);else{for(let k=0;k<3;k++)ellipse(c,-r*.5+k*r*.5,Math.sin(k)*r*.2,r*.25,r*.2,'#49786c60');}}
    else ellipse(c,0,0,r,r,null,TONES[i]+'66',1);
    text(c,tier.title,0,r+17,12,tier.owned?'#dbead8':'#859c9f','center');c.restore();
  });
  for(let i=0;i<Math.min(7,m.depth);i++){c.save();c.translate(cx,cy);c.rotate(i/7*TAU+t*.035);ellipse(c,35,0,45,18,'#bdd7a744','#d5ebbc66',1);c.restore();}
  ellipse(c,cx,cy,m.incomeOn?24:12,m.incomeOn?24:12,m.incomeOn?'#f0edbd':'#819890');
  text(c,m.owned?'Работают '+m.working+' ступеней':'Первые орбиты доступны для покупки',500,543,17,'#c8dbce','center');
  text(c,m.depth?'Сохранившаяся глубина: '+m.depth+' · улучшений: '+m.heirlooms:'Генераторы появляются только после приобретения',500,571,12,'#9bb7b1','center');
  reaction(c,cx,cy,fx);
}
function draw(c,m,t,effects){if(!m)return;c.save();(m.view?orbitalWorld:cascadeWorld)(c,m,t,effects);c.restore();}
return {model,draw,mount};
});
