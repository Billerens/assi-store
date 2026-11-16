/* Read-only scene projection. No saves, random draws or economic mutations. */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.AlchemyScene=api;})(typeof window!=='undefined'?window:globalThis,function(root){
'use strict';
const ID="alchemist", TITLE="Алхимик", VIEWS=["Мастерская","Лаборатория"];
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
  const r=state.run||{},meta=state.meta||{},f=facts||{},catalog=content||{},els=catalog.els||Object.fromEntries((catalog.elements||[]).map(e=>[e.key,e])),palette=catalog.palette||[];
  const all=Object.keys(meta.book||{}).filter(key=>els[key]);
  function element(key){const e=els[key]||{},pc=palette[(e.colors||[])[0]],hex=typeof pc==='string'?pc:pc&&pc.hex;return{key,name:e.name||key,tier:finite(e.tier),category:e.cat||'',color:/^#[\da-f]{6}$/i.test(hex||'')?hex:'#a9c8b9',amount:amountText((r.store||{})[key]),owned:positive((r.store||{})[key]),scale:scale((r.store||{})[key],6)};}
  const elements=all.slice(-14).map(element),owned=all.filter(key=>positive((r.store||{})[key])),crystals=owned.filter(key=>finite(els[key].tier)>0).slice(-9).map(element);
  const slots=(f.slots||[]).slice(0,3).filter(key=>(meta.book||{})[key]!==undefined&&els[key]).map(element),recipes=catalog.recipes||{};
  const workers=(r.cubes||[]).slice(0,12).map(cube=>{const rec=recipes[cube.k],needs={};if(rec)(rec.ins||[]).forEach(k=>needs[k]=(needs[k]||0)+1);const fed=!!rec&&Object.keys(needs).every(k=>finite((r.store||{})[k])>=needs[k]);const room=!!rec&&finite((r.store||{})[rec.r])+1<=finite(f.capacity,Number.MAX_VALUE);return{recipe:!!rec,fire:!!cube.fire,working:!!rec&&!cube.fire&&fed&&room,waiting:rec&&!cube.fire?(!fed?'Сырьё':!room?'Склад':''):null,progress:clamp(finite(cube.p),0,1),result:rec&&els[rec.r]?element(rec.r):null};});
  const tools=Object.keys(r.lv||{}).filter(k=>positive(r.lv[k]));
  const stones=state.layers&&state.layers.stone||state.layers&&state.layers.philosopher||{};
  return{elements,crystals,slots,workers,tools,known:all.length,owned:owned.length,sourceWorking:!!f.sourceWorking,cycles:finite(meta.cycles),stones:finite(f.stones),tinctures:finite(f.tinctures),last:f.last||null,
    cycle:[meta.cycles||0,stones.count||0,(state.layers&&state.layers.tincture||{}).count||0].join(':'),purchases:String(r.bought||0)+'|'+tools.map(k=>k+':'+r.lv[k]).join(',')+'|'+workers.length,
    summary:'В книге '+all.length+' элементов; на складе есть '+owned.length+'. '+(workers.length?'Кубы работают: '+workers.filter(x=>x.working).length+' из '+(r.cubes||[]).length+'. ':'')+(slots.length?'В котле: '+slots.map(x=>x.name).join(' + ')+'.':'Выберите ингредиенты на полке.')};
}
function labReaction(c,m,t,fx,x,y){
  const e=(fx||[]).slice(-1)[0];if(!e)return;
  const q=clamp(e.age/e.duration,0,1),good=e.kind==='discovery'||e.kind==='duplicate';
  if(good){glow(c,x,y,110,(e.kind==='discovery'?'#eed290':'#9acfb7')+'33');for(let i=0;i<(e.kind==='discovery'?18:7);i++){const a=i*2.4+t,d=25+q*75;spark(c,x+Math.cos(a)*d,y-20-Math.sin(i)*30-q*60,2.5*(1-q),e.kind==='discovery'?'#f4df9c':'#bedfc8');}}
  else if(e.kind==='failure'||e.kind==='unknown'){c.save();c.globalAlpha=(1-q)*.55;for(let i=0;i<5;i++)ellipse(c,x-30+i*15,y-22-q*55,10+q*8,7+q*8,e.kind==='failure'?'#b6a48d':'#b9bfd3');c.restore();}
  reaction(c,x,y,fx);
}
function workshopWorld(c,m,t,fx){
  c.fillStyle=grad(c,0,0,0,620,[[0,'#1c282b'],[.64,'#363b32'],[1,'#282b28']]);c.fillRect(0,0,1000,620);
  for(let y=0;y<410;y+=60)for(let x=-50;x<1000;x+=120)rect(c,x+(y%120?55:0),y,112,53,'#80735e08',7,'#ab9b741a');
  c.save();c.beginPath();c.moveTo(65,350);c.lineTo(65,142);c.bezierCurveTo(65,18,294,18,294,142);c.lineTo(294,350);c.closePath();c.fillStyle='#294a58';c.fill();c.lineWidth=15;c.strokeStyle='#756047';c.stroke();c.clip();ellipse(c,217,116,25,25,'#e0e1ad');ellipse(c,228,108,24,24,'#294a58');poly(c,[[58,350],[58,291],[115,258],[163,310],[232,251],[310,300],[310,350]],'#1f3d40');c.restore();line(c,[[180,57],[180,350]],'#725d45',7);line(c,[[68,225],[291,225]],'#725d45',6);rect(c,55,348,250,15,'#927348',3);
  line(c,[[449,0],[449,99]],'#8e805f',2);ellipse(c,449,111,29,18,'#9e8856');ellipse(c,449,111,17,9,'#e7d6a0');glow(c,449,119,140,'#e0c77b21');
  const shelves=Math.max(1,Math.ceil(m.elements.length/7));
  for(let row=0;row<shelves;row++){rect(c,561,164+row*111,354,13,'#7c6245',3);rect(c,567,177+row*111,342,6,'#192c2a',0);}
  m.elements.forEach((e,i)=>{const x=588+i%7*48,y=162+Math.floor(i/7)*111;bottle(c,x,y,27,48+Math.min(5,e.tier)*7,e.owned?e.color+'bb':'#ffffff08',e.owned?.33+e.scale*.04:.03);text(c,e.name.slice(0,8),x,y+28,10,e.owned?'#d9ddbb':'#889d94','center');});
  // Familiar names survive prestige; empty vessels do not imply owned resources.
  if(m.stones>0){ellipse(c,343,322,16,21,'#bca1c5');spark(c,343,322,8,'#ead8d9');text(c,'Камни: '+m.stones,343,358,11,'#dac8d5','center');}
  poly(c,[[0,415],[1000,415],[1000,532],[0,532]],grad(c,0,415,0,532,[[0,'#94734b'],[1,'#5c4434']]));for(let i=0;i<8;i++)line(c,[[0,425+i*13],[1000,430+i*13]],'#d4ae7322',1);rect(c,0,532,1000,88,'#2c302a');
  for(let i=0;i<4;i++){rect(c,35+i*242,556,194,44,'#393b30',5,'#786e4544');ellipse(c,132+i*242,577,5,4,'#b29e65');}
  poly(c,[[61,455],[203,439],[241,497],[92,518]],'#bdaf83');poly(c,[[203,439],[316,450],[339,507],[241,497]],'#dfd2a8');
  for(let i=0;i<5;i++){line(c,[[85+i*4,465+i*9],[191+i*4,452+i*9]],'#6a765055',1);line(c,[[231+i*4,458+i*8],[300+i*5,463+i*8]],'#80704d66',1);}
  text(c,'КНИГА · '+m.known,194,472,12,'#4c624e','center',650);
  if(m.tools.includes('mortar')){ellipse(c,360,470,38,13,'#839080');poly(c,[[322,470],[336,491],[386,491],[398,470]],'#5d7267');line(c,[[363,465],[392,427]],'#9aa28b',11);}
  const liquid=m.slots.length?m.slots[0].color:'#83b6a0',busy=m.workers.some(x=>x.working);
  [487,570,639].forEach(x=>line(c,[[x,484],[x-3,516]],'#1a302a',11));ellipse(c,563,450,106,65,grad(c,455,390,663,490,[[0,'#4a6859'],[1,'#193c34']]),'#8b9465',2);ellipse(c,563,408,107,32,'#1b342c','#b6a16e',7);ellipse(c,563,408,97,25,liquid+'c0');ellipse(c,563,408,69,17,null,'#ddedbd55',1);
  if(m.slots.length||busy){for(let i=0;i<7;i++){const q=(t*.12+i/7)%1;c.globalAlpha=(1-q)*.35;ellipse(c,530+seed(i)*64+Math.sin(q*5+i)*9,400-q*69,3+q*8,3+q*6,'#c7e6bb');c.globalAlpha=1;}}
  m.slots.forEach((e,i)=>{ellipse(c,521+i*41,405,9,4,e.color);text(c,e.name.slice(0,8),485+i*82,367,11,'#e1e8cc','center');});
  // Purchased cubes are small working apparatuses, never a prefilled factory.
  m.workers.slice(0,6).forEach((w,i)=>{const x=747+i%3*70,y=445+Math.floor(i/3)*66;cube(c,x,y,25,11,38,w.fire?'#b88065':'#b5c4a6','#718f82','#4c7473');ellipse(c,x,y-17,11,13,w.working?'#a9ddba':w.fire?'#da9266':'#506d69');if(w.working)ellipse(c,x,y-17,3+Math.sin(t*2+i),5,'#e1f3c6');text(c,w.waiting|| (w.fire?'Пожар':w.working?'Работает':'Пусто'),x,y+30,9,'#d3dbc6','center');});
  m.crystals.slice(0,6).forEach((e,i)=>{const x=357+i*28,y=518,h=19+Math.min(e.tier,6)*4;poly(c,[[x-8,y],[x-9,y-h*.6],[x,y-h],[x+9,y-h*.6],[x+6,y]],e.color);line(c,[[x,y-h],[x,y]],'#ebefc866',1);});
  labReaction(c,m,t,fx,563,405);
}
function microWorld(c,m,t,fx){
  c.fillStyle=grad(c,0,0,1000,620,[[0,'#edf1e8'],[.6,'#dbe9e1'],[1,'#cadbd5']]);c.fillRect(0,0,1000,620);glow(c,790,100,340,'#ffffff99');
  for(let i=0;i<7;i++)line(c,[[70+i*145,0],[70+i*145,620]],'#426f6410',1);
  ellipse(c,500,510,320,32,'#507a7025');rect(c,415,498,190,15,'#7d9a8c',7);
  const liquid=m.slots[0]?m.slots[0].color:'#8cc5b4',cx=510,cy=324,rr=132;
  ellipse(c,cx,cy,rr,rr,'#f7fff32a','#759c8b99',2);c.save();c.beginPath();c.arc(cx,cy,rr-4,0,TAU);c.clip();rect(c,cx-rr,335,rr*2,140,liquid+'8c');ellipse(c,cx,335,128,20,liquid+'bb');
  for(let i=0;i<5;i++){c.beginPath();c.moveTo(cx-rr,355+i*18);c.bezierCurveTo(cx-45,338+i*18+Math.sin(t*.6+i)*7,cx+45,376+i*18,cx+rr,355+i*18);c.strokeStyle='#eaffdf55';c.lineWidth=2;c.stroke();}
  m.slots.forEach((e,i)=>{poly(c,[[cx-45+i*35,430],[cx-48+i*35,402],[cx-38+i*35,383],[cx-26+i*35,411],[cx-28+i*35,430]],e.color);});c.restore();
  c.beginPath();c.ellipse(cx,cy,rr-14,rr-14,0,3.3,4.7);c.strokeStyle='#ffffffaa';c.lineWidth=9;c.stroke();rect(c,488,173,44,52,'#ecf9e294',5,'#7fa48f');
  rect(c,500,75,20,67,'#83a799',8);rect(c,506,136,8,37,m.slots.length?liquid:'#b6cec1',2);if(m.slots.length){const dy=174+(t*.5%1)*131;ellipse(c,510,dy,3.5,5,liquid);}
  m.elements.slice(0,8).forEach((e,i)=>{const side=i<4,x=side?143+i%4*49:710+i%4*51,y=side?419:422;bottle(c,x,y,29,68+Math.min(e.tier,6)*8,e.owned?e.color+'99':'#ffffff11',e.owned?.35+e.scale*.04:.03);text(c,e.name.slice(0,9),x,447,10,'#446b5f','center');});
  const apparatus=m.tools.includes('coil')||m.workers.length;
  if(apparatus){line(c,[[644,316],[705,316],[705,211],[782,211]],'#9ac0b787',12);line(c,[[644,316],[705,316],[705,211],[782,211]],'#f7fff5aa',7);for(let i=0;i<4;i++){ellipse(c,782,213+i*25,45,17,null,'#7fa79a77',9);ellipse(c,782,213+i*25,45,17,null,'#efffeca0',5);}}
  m.workers.slice(0,5).forEach((w,i)=>{const x=119+i*51;rect(c,x,230,38,75,'#f5fff53a',5,'#91b4a4');rect(c,x+5,267,28,32,w.working?'#95cdb3':w.fire?'#dca28c':'#bbc9bc',3);if(w.working)ellipse(c,x+18,290-(t*12%30),2,3,'#eaffdf');line(c,[[x+3,310],[x+35,310]],'#698c7e',3);});
  ellipse(c,510,533,113,25,'#d4e3d3a0','#7da38d88',1);
  m.crystals.forEach((e,i)=>{const x=423+i*23,y=532+Math.sin(i)*7,h=23+Math.min(e.tier,8)*4;poly(c,[[x-8,y],[x-9,y-h*.6],[x,y-h],[x+10,y-h*.5],[x+6,y]],e.color);poly(c,[[x,y-h],[x+10,y-h*.5],[x+6,y],[x,y+2]],e.color+'bb');line(c,[[x,y-h],[x,y]],'#f3ffdfb0',1);});
  text(c,m.crystals.length?'ОБРАЗЦЫ ИЗ ТЕКУЩЕГО СКЛАДА':'ВЫБЕРИТЕ ПАРУ ИНГРЕДИЕНТОВ',510,585,12,'#476d60','center',650);
  labReaction(c,m,t,fx,cx,cy);
}
function draw(c,m,t,effects){if(!m)return;c.save();(m.view?microWorld:workshopWorld)(c,m,t,effects);c.restore();}
return {model,draw,mount};
});
