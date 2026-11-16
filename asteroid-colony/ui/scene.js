/* Read-only scene projection. No saves, random draws or economic mutations. */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.ColonyScene=api;})(typeof window!=='undefined'?window:globalThis,function(root){
'use strict';
const ID="asteroid-colony", TITLE="Колония на астероиде", VIEWS=["Поселение","Разрез"];
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

const BUILDING_INFO=[['smelter','Плавильня','alloy','#d9ad7c'],['purifier','Водоочистка','water','#a0d4ce'],['electro','Электролиз','fuel','#d5cc8d'],['factory','Электроника','chip','#9ebaca'],['lab','Лаборатория','data','#b5a3d0']];
function model(state,config,content,facts){
  const r=state.run||{},meta=state.meta||{},f=facts||{},layers=state.layers||{},jump=(layers.jump||{}).state||{},cluster=(layers.cluster||{}).state||{},share=clamp(finite(f.share,(r.flow||{}).share===undefined?1:finite(r.flow.share)),0,1);
  const buildings=BUILDING_INFO.filter(x=>finite((r.b||{})[x[0]])>0).map((x,i)=>{const level=finite(r.b[x[0]]),rate=(r.flow||{})[x[2]]||0,off=!!(r.off||{})[x[0]],working=!off&&share>0&&f.flare!==false&&!!(r.work||{})[x[0]]&&positive(rate);return{id:x[0],name:x[1],resource:x[2],color:x[3],level,scale:scale(level,7),working,off,rate:amountText(rate),status:off?'Выключено':working?(share<.999?'Мало энергии':'Работает'):share<=0?'Нет энергии':'Простой'};});
  const drones=(r.drones||[]).slice(0,8).map((n,i)=>({tier:i,count:finite(n),scale:scale(n,6),shown:Math.min(3,Math.max(0,Math.floor(finite(n))),Math.ceil(scale(n,6)))})).filter(x=>x.count>0),drones2=(r.drones2||[]).slice(0,8).filter(positive).length;
  const researched=Object.keys(r.research||{}).filter(k=>r.research[k]),star=f.star||{n:finite(jump.star,1),id:jump.rule||'yellow',title:'Текущая звезда'};
  return {buildings,drones,drones2,star,share,power:finite(f.power),demand:finite(f.demand),panels:finite(r.panels),reactor:finite(r.reactor),dome:finite(r.dome),colonists:finite(r.colonists),hangar:finite(r.hangar),engine:!!r.engine,oreOn:positive(f.oreRate===undefined?(r.flow||{}).ore:f.oreRate),iceOn:positive((r.flow||{}).ice),expeditions:(r.exps||[]).slice(0,8).map(x=>({id:x.id||x.kind||'flight',until:finite(x.until)})),researched,
    heritage:Object.keys(meta.samples||{}).filter(k=>positive(meta.samples[k])).length+Object.keys(cluster.stations||{}).filter(k=>positive(cluster.stations[k])).length,
    cycle:[jump.star||1,meta.jumps||0,(layers.cluster||{}).count||0].join(':'),purchases:[(r.drones||[]).join(','),(r.drones2||[]).join(','),Object.keys(r.b||{}).map(k=>k+':'+r.b[k]).join(','),r.panels||0,r.reactor||0,r.dome||0,r.hangar||0,r.engine?1:0,researched.join(',')].join('|'),
    summary:buildings.length?'Работают '+buildings.filter(x=>x.working).length+' из '+buildings.length+' производств. '+(share<.999?'Дефицит энергии: '+Math.round(share*100)+'% мощности.':'Энергии хватает.'):'Производств ещё нет. Купите дронов; исследования откроют новые цепочки.'};
}
function colonySky(c,m,t){
  const warm=['red','yellow'].includes(m.star.id),ink=warm?'#c99e7b':'#a5bfc4';
  c.fillStyle=grad(c,0,0,1000,620,[[0,'#172b38'],[.6,'#1e2e36'],[1,'#10232d']]);c.fillRect(0,0,1000,620);stars(c,t,75,'#d6e2e3');glow(c,145,112,280,ink+'22');ellipse(c,145,112,86,86,grad(c,55,25,220,185,[[0,ink],[1,'#4b5261']]));
  if(m.star.id==='hole'){ellipse(c,145,112,76,76,'#0c1824');ellipse(c,145,112,111,24,null,'#d3b98966',5,-.3);}else{c.save();c.beginPath();c.arc(145,112,85,0,TAU);c.clip();for(let i=0;i<6;i++)ellipse(c,130,48+i*25,120,8,'#d8b9a222',null,0,-.2);c.restore();}
  for(let i=0;i<8;i++){const x=seed(i+80)*1000,y=seed(i+100)*620;c.save();c.translate(x,y);c.rotate(i);poly(c,[[-8,0],[-4,-9],[6,-7],[10,3],[3,9]],'#5e747944');c.restore();}
}
function machine(c,x,y,b,t){
  const h=30+b.scale*5;
  cube(c,x,y,39,17,h,b.color,b.off?'#626c6a':'#7a9992','#4f747a');
  poly(c,[[x-32,y+1-h],[x-3,y+14-h],[x-3,y+25-h],[x-32,y+12-h]],b.working?'#c7ddba':'#354f55');
  if(b.id==='smelter'){rect(c,x-18,y-h-14,12,20,'#9aa48d',2);if(b.working)for(let j=0;j<4;j++)ellipse(c,x-12+Math.sin(t+j)*3,y-h-20-((t*8+j*11)%44),5+j*2,4+j*2,'#e1cda626');}
  if(b.id==='purifier'||b.id==='electro'){ellipse(c,x+16,y-h+9,13,8,b.working?'#c5e6cf':'#78928e','#e0e5be66',1);line(c,[[x+15,y-h],[x+15,y-h-17]],'#adc8b0',4);}
  if(b.id==='lab'){line(c,[[x,y-h],[x,y-h-27]],'#ced5bc',2);ellipse(c,x,y-h-25,17,7,null,'#c7d8b5',2,-.3);}
  if(b.id==='factory'){for(let i=0;i<3;i++)rect(c,x-23+i*16,y-h+2,10,6,b.working?'#d4ecc6':'#3a5558',1);}
  if(b.working){const p=(t*.3)%1;ellipse(c,x-23+p*45,y+21,3,2,'#ddedb6');}
  if(!b.working){ellipse(c,x+31,y-8,5,5,b.off?'#919c96':'#dfa17d');}
  text(c,b.name,x,y+47,12,'#d8e0cb','center',600);text(c,'Ур. '+b.level+' · '+b.status,x,y+64,10,b.working?'#bdd2bf':'#c9b7a2','center');
}
function colonyTown(c,m,t,fx){
  colonySky(c,m,t);
  poly(c,[[154,326],[268,428],[469,476],[706,447],[854,367],[809,473],[662,545],[446,562],[251,488],[180,400]],'#4a5151');poly(c,[[268,428],[469,476],[446,562],[315,515]],'#776858');poly(c,[[469,476],[706,447],[662,545],[446,562]],'#39494c');
  poly(c,[[154,326],[249,231],[430,198],[645,214],[844,292],[854,367],[706,447],[469,476],[268,428]],grad(c,0,205,0,478,[[0,'#b4ae98'],[.7,'#8e937e'],[1,'#748176']]),'#d7c8a855',1);
  for(let i=0;i<23;i++)ellipse(c,270+seed(i+77)*480,271+seed(i+41)*140,6+seed(i)*12,3+seed(i+2)*4,'#52614e2b');
  const positions={smelter:[380,285],purifier:[527,289],electro:[676,296],factory:[414,383],lab:[585,381]};
  m.buildings.forEach(b=>{const p=positions[b.id];if(b.working)line(c,[[p[0]-30,p[1]+23],[p[0]+37,p[1]+43]],'#d4dfb177',2,[3,7]);machine(c,p[0],p[1],b,t);});
  if(m.panels){for(let i=0;i<Math.min(8,2+Math.ceil(scale(m.panels,6)));i++){const x=231+i%4*29,y=341+Math.floor(i/4)*26;line(c,[[x,y],[x,y+18]],'#4f6862',3);poly(c,[[x-15,y-11],[x+6,y-20],[x+22,y-10],[x,y]],'#2b5368','#8db5ab',1);line(c,[[x-5,y-15],[x+12,y-4]],'#aaccc066',1);}text(c,'Панели '+m.panels,265,414,11,'#d9e3c8','center');}
  if(m.reactor){cube(c,744,392,30,13,52,'#c5cbb1','#829d92','#567e83');ellipse(c,744,368,11,8,m.power>0?'#c5e4a7':'#697b78');}
  if(m.dome){ellipse(c,582,218,55,20,'#648b7d');c.beginPath();c.ellipse(582,212,51,43,0,Math.PI,TAU);c.lineTo(633,220);c.ellipse(582,220,51,18,0,0,Math.PI);c.closePath();c.fillStyle='#b4dfc45e';c.fill();c.strokeStyle='#d9e7bd';c.lineWidth=1.5;c.stroke();for(let i=0;i<Math.min(7,m.colonists);i++)person(c,553+i*9,218,.4,'#bed6a7',0);text(c,'Купол · '+m.colonists,582,257,11,'#d8e4c6','center');}
  if(m.hangar){ellipse(c,771,307,48,20,'#657e76','#b9cba9',2);line(c,[[751,302],[771,314],[791,302]],'#d7dfb4',2);text(c,'Ангар '+m.hangar,772,344,11,'#d8e4c6','center');}
  if(m.engine){poly(c,[[740,226],[755,184],[770,226]],'#d8d8bb');rect(c,748,207,14,32,'#8bacaa',3);line(c,[[743,237],[737,250]],'#d5d6b3',3);line(c,[[768,237],[777,248]],'#d5d6b3',3);}
  m.drones.forEach((group,j)=>{for(let i=0;i<group.shown;i++){const a=j*1.8+i*2.3+(m.oreOn?t*.08:0),x=500+Math.cos(a)*(278+i*12),y=348+Math.sin(a)*(115+i*8);ellipse(c,x,y+7,9,4,'#35545750');rect(c,x-9,y-5,18,10,j<4?'#cfca9e':'#a9c9bf',3);rect(c,x-4,y-10,8,6,'#4e7c87',2);if(m.oreOn)line(c,[[x-12,y],[x-18,y]],'#c6e4b388',1);}});
  if(m.star.id==='binary'){poly(c,[[800,493],[852,473],[906,499],[893,530],[837,542]],'#6e7d72');text(c,'Астероид Б · '+m.drones2+' типов',857,561,10,'#c6d8bf','center');}
  if(m.expeditions.length){const a=t*.12,x=800+Math.cos(a)*62,y=130+Math.sin(a)*24;poly(c,[[x-17,y+4],[x,y-8],[x+19,y+4],[x,y+11]],'#d9d5b8');line(c,[[x-17,y+4],[x-28,y+4]],'#b1d8d1',2);text(c,'В рейсе: '+m.expeditions.length,x,y+30,11,'#c6dbc8','center');}
  text(c,m.star.title||'Колония',37,39,16,'#d3dfd6','left',600);if(m.heritage)dots(c,37,66,m.heritage,'#c7b9dc');
  if(!m.buildings.length&&!m.drones.length)text(c,'Нет построек и дронов — первая покупка начнёт освоение',500,592,14,'#c6d9ca','center');
  reaction(c,500,350,fx);
}
function colonyCut(c,m,t,fx){
  colonySky(c,m,t);poly(c,[[63,172],[196,145],[317,163],[430,135],[569,152],[713,141],[923,176],[931,548],[821,588],[650,570],[491,590],[305,570],[107,556]],'#6a6056');
  for(let i=0;i<8;i++){c.beginPath();c.moveTo(77,199+i*47);for(let k=1;k<10;k++)c.lineTo(77+k*92,193+i*47+seed(i*10+k)*19);c.strokeStyle=i%2?'#bba07b26':'#22313a44';c.lineWidth=8;c.stroke();}
  if(m.panels)for(let i=0;i<Math.min(7,2+Math.ceil(scale(m.panels)));i++){const x=102+i*37;line(c,[[x,145],[x,122]],'#8b9d8b',3);poly(c,[[x-14,121],[x+9,110],[x+25,121],[x+2,131]],'#365a6b','#a2bca4',1);}
  if(m.dome){rect(c,443,99,187,49,'#a4b7a3',6);rect(c,453,110,166,22,'#365b60',4);for(let i=0;i<Math.min(9,m.colonists);i++)person(c,467+i*17,130,.6,'#d5d1a3',0);}
  if(m.reactor){rect(c,674,87,27,66,'#9db29b',3);ellipse(c,687,88,13,5,'#c5d6ae');if(m.power>0)glow(c,687,112,40,'#d5db9b25');}
  const positions={smelter:[113,212],purifier:[414,212],electro:[113,351],factory:[414,351],lab:[714,212]};
  m.buildings.forEach(b=>{
    const [x,y]=positions[b.id],w=b.id==='lab'?161:260;rect(c,x-6,y-8,w+12,117,'#253b43',9);rect(c,x,y,w,101,'#4a635d',4);line(c,[[x+10,y+5],[x+w-10,y+5]],b.working?'#e3ddb1':'#829588',3);rect(c,x,y+87,w,14,'#b4b89b',1);
    if(b.id==='smelter'||b.id==='factory'){
      rect(c,x+15,y+24,65,56,'#927d60',5);rect(c,x+25,y+37,45,28,b.working?'#dfae6a':'#3b5353',3);rect(c,x+89,y+75,w-100,6,'#243d43',2);for(let i=0;i<6;i++){const xx=x+94+(i*21+(b.working?t*16:0))%(w-110);poly(c,[[xx,y+73],[xx+6,y+63],[xx+15,y+69],[xx+11,y+75]],b.working?'#c9b783':'#748778');}
    }else if(b.id==='lab'){
      for(let i=0;i<4;i++){rect(c,x+13+i*34,y+27,25,49,'#a8bda1',4);rect(c,x+18+i*34,y+33,15,32,b.working?'#b5d7b5':'#526b65',2);}
    }else{
      for(let i=0;i<3;i++){rect(c,x+18+i*75,y+23,55,57,'#d3e2cb30',7,'#b2c6ab');rect(c,x+22+i*75,y+45,47,31,b.working?b.color+'aa':'#678a7c',3);if(b.working)ellipse(c,x+35+i*75,y+69-(t*11+i*8)%22,2,3,'#d8eed0');}
    }
    text(c,b.name+' · '+b.level,x+8,y-20,12,'#e0dec1','left',600);text(c,b.status,x+w-5,y+119,11,b.working?'#cbdac1':'#e4b99c','right');
  });
  if(m.drones.length){rect(c,109,489,548,62,'#293d44',8);line(c,[[123,537],[641,537]],'#829b8c',3);const x=137+(m.oreOn?t*22%440:0);rect(c,x,514,38,18,'#b2a47e',3);ellipse(c,x+8,536,4,4,'#192e35');ellipse(c,x+31,536,4,4,'#192e35');poly(c,[[x+2,515],[x+9,503],[x+20,508],[x+31,500],[x+36,515]],'#c9b382');text(c,'ДОБЫЧА · '+(m.oreOn?'работает':'остановлена'),119,478,12,'#d9dbbb','left',600);}
  if(m.hangar){rect(c,723,386,139,160,'#2a424b',12);rect(c,736,401,114,126,'#4f6d68',5);text(c,'АНГАР '+m.hangar,792,372,11,'#dbdec0','center',650);m.expeditions.slice(0,4).forEach((e,i)=>{const x=749+i%2*63,y=428+Math.floor(i/2)*66;poly(c,[[x,y],[x+20,y-14],[x+40,y],[x+20,y+15]],'#c8d1ad');});if(!m.expeditions.length)text(c,'Нет рейсов',792,466,12,'#afc6b2','center');}
  if(!m.buildings.length)text(c,'Здесь ещё нет производственных цехов',500,300,21,'#d1ceb5','center');
  text(c,m.star.title||'Колония',37,35,16,'#d3dfd6','left',600);text(c,'Доля мощности: '+Math.round(m.share*100)+'%',500,594,13,m.share<.999?'#e5b594':'#c4d6c4','center');reaction(c,500,300,fx);
}
function draw(c,m,t,effects){if(!m)return;c.save();(m.view?colonyCut:colonyTown)(c,m,t,effects);c.restore();}
return {model,draw,mount};
});

