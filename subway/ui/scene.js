/* Read-only scene projection. No saves, random draws or economic mutations. */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.SubwayScene=api;})(typeof window!=='undefined'?window:globalThis,function(root){
'use strict';
const ID="subway", TITLE="Подземка", VIEWS=["Город","Станция"];
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

function routePoint(points,p){return pointOn(points,Math.min(.9999999999,Math.max(0,p)));}
function sampled(n,cap){const k=Math.min(Math.floor(n),cap),a=[];for(let i=0;i<k;i++)a.push(k>1?Math.round(i*(n-1)/(k-1)):0);return a;}
function mapPoint(p){return[225+p[0]*.55,30+p[1]*.55];}
function model(state,config,content,facts){
  const r=state.run||{},f=facts||{},cfg=config||{},C=content||{},info=C.lines||{lines:[],paths:{}},cityState=((state.layers||{}).city||{}).state||{},stats=f.stats||[];
  const lines=(r.lines||[]).slice(0,32).map(line=>{
    const def=(info.lines||[]).find(d=>d.tier===line.tier)||{},st=stats.find(d=>d.tier===line.tier)||{},stations=finite(line.stations),trains=finite(line.trains),paths=((info.paths||{})[String(line.tier)]||[[100,100+line.tier*60],[900,100+line.tier*60]]).map(p=>[finite(p[0]),finite(p[1])]);
    const served=finite(st.served),working=trains>0&&positive(st.income)&&!(f.night&&!line.duty&&!f.museums),indices=sampled(stations,18);
    return {tier:line.tier,title:def.title||'Линия '+line.tier,color:/^#[\da-f]{6}$/i.test(def.color||'')?def.color:'#668f8b',stations,trains,served,crowd:Math.max(0,stations-served),working,dispatcher:!!line.dispatcher,ground:!!def.ground,express:!!line.express,paths,points:paths.map(mapPoint),stationSamples:indices.map((index,i)=>{const p=routePoint(paths,indices.length>1?i/(indices.length-1):0);return{index,x:225+p.x*.55,y:30+p.y*.55,crowded:index>=served};}),trainSamples:Math.min(4,trains),scale:scale(stations,7),cars:finite(line.cars),duty:!!line.duty};
  });
  const valid=new Set(lines.map(l=>l.tier)),selected=lines.find(l=>l.tier===f.selected)||lines[0]||null;
  const transfers=(r.transfers||[]).filter(p=>valid.has(p[0])&&valid.has(p[1])).map(p=>p.slice(0,2)),city=finite(cityState.city,1);
  return {lines,selected,transfers,ring:!!r.ring,ringCircle:(info.ringCircle||[500,500,265]).slice(),airport:!!r.airport,night:!!f.night,animate:f.animate!==false,city,title:f.cityTitle||'Город '+city,event:!!r.event,tariffs:finite(r.tariffs),
    heritage:Object.keys((state.meta||{}).bureau||{}).filter(k=>positive(state.meta.bureau[k])).length,
    cycle:[city,((state.layers||{}).city||{}).count||0,((state.layers||{}).general||{}).count||0].join(':'),purchases:lines.map(l=>[l.tier,l.stations,l.trains,l.cars,l.dispatcher,l.duty].join(':')).join('|')+'|'+transfers.map(p=>p.join('-')).join(',')+'|'+r.ring+'|'+r.airport+'|'+r.tariffs,
    summary:'Построено линий: '+lines.length+'. '+(selected?selected.title+': '+selected.stations+' станций, '+selected.trains+' поездов; '+(selected.working?'движение идёт.':'движение остановлено.'):'')+' На карте большие количества объединены, точные числа — в карточке линии.'};
}
function nearestPair(a,b){
  let best={a:a[0],b:b[0],d:Infinity};
  function offer(p,q){const d=Math.hypot(p[0]-q[0],p[1]-q[1]);if(d<best.d)best={a:p,b:q,d};}
  function projection(p,u,v){const dx=v[0]-u[0],dy=v[1]-u[1],den=dx*dx+dy*dy,t=den?clamp(((p[0]-u[0])*dx+(p[1]-u[1])*dy)/den,0,1):0;return[u[0]+dx*t,u[1]+dy*t];}
  for(let i=1;i<a.length;i++)for(let j=1;j<b.length;j++){
    const p=a[i-1],q=a[i],u=b[j-1],v=b[j],dx=q[0]-p[0],dy=q[1]-p[1],ex=v[0]-u[0],ey=v[1]-u[1],den=dx*ey-dy*ex;
    if(Math.abs(den)>1e-8){const tx=((u[0]-p[0])*ey-(u[1]-p[1])*ex)/den,ty=((u[0]-p[0])*dy-(u[1]-p[1])*dx)/den;if(tx>=0&&tx<=1&&ty>=0&&ty<=1){const at=[p[0]+dx*tx,p[1]+dy*tx];offer(at,at);}}
    offer(p,projection(p,u,v));offer(q,projection(q,u,v));offer(projection(u,p,q),u);offer(projection(v,p,q),v);
  }return best;
}
function hit(m,x,y){let best={tier:null,d:22};(m.lines||[]).forEach(l=>{const p=nearestPair(l.points,[[x,y],[x+.001,y+.001]]);if(p.d<best.d)best={tier:l.tier,d:p.d};});return best.tier;}
function smallTrain(c,x,y,a,color){c.save();c.translate(x,y);c.rotate(a);rect(c,-16,3,33,8,'#2c5c5429',4);rect(c,-17,-6,34,12,'#f5f0dc',4,color);rect(c,-11,-4,7,8,'#527f82',2);rect(c,1,-4,7,8,'#527f82',2);line(c,[[12,-3],[12,3]],color,2);c.restore();}
function subwayMap(c,m,t,fx){
  c.fillStyle=m.night?'#a9c0b3':'#dce8d7';c.fillRect(0,0,1000,620);
  // Same river and topology as the existing route map, in one uniform transform.
  c.beginPath();c.moveTo(214,148);c.bezierCurveTo(307,129,357,211,445,206);c.bezierCurveTo(577,197,577,124,660,148);c.bezierCurveTo(754,184,782,190,1000,194);c.strokeStyle='#b9d4c8';c.lineWidth=68;c.stroke();c.strokeStyle='#91bdb9';c.lineWidth=45;c.stroke();
  // Roads and buildings follow built stations. They do not reveal future lines.
  m.lines.forEach((l,li)=>{l.stationSamples.forEach((p,j)=>{
    for(let k=0;k<Math.min(4,Math.ceil(l.scale));k++){
      const a=(j*2.2+k*1.9+li),x=p.x+Math.cos(a)*(24+k*8),y=p.y+Math.sin(a)*(25+k*5),w=13+seed(j+k+li)*12,h=14+seed(k+j+6)*9;
      rect(c,x+4,y+4,w,h,'#79958120',2);rect(c,x,y-Math.min(l.scale,5)*2,w,h,['#b2c5b0','#bfc9b5','#c9c7ad'][k%3],2);line(c,[[x+3,y-h*.1],[x+w-3,y-h*.1]],'#eff0d333',1);
    }
  });});
  for(let i=0;i<20;i++){const x=30+seed(i+108)*180,y=75+seed(i+72)*450;ellipse(c,x,y,10+seed(i)*9,7+seed(i)*8,'#8caf8244');}
  for(let i=0;i<18;i++){const x=815+seed(i+154)*165,y=130+seed(i+3)*420;ellipse(c,x,y,8+seed(i)*11,7+seed(i)*6,'#8caf8244');}
  if(m.ring){const r=m.ringCircle;ellipse(c,225+r[0]*.55,30+r[1]*.55,r[2]*.55,r[2]*.55,null,'#f3efd9',9);ellipse(c,225+r[0]*.55,30+r[1]*.55,r[2]*.55,r[2]*.55,null,'#7d9188',4);}
  m.lines.forEach(l=>{
    const chosen=m.selected&&m.selected.tier===l.tier;line(c,l.points,'#f4f0db',chosen?11:8);line(c,l.points,l.color,chosen?6:4,l.ground?[7,3]:undefined);
    l.stationSamples.forEach(p=>{ellipse(c,p.x,p.y,chosen?6:4.5,chosen?6:4.5,'#f4f0df',l.color,2);if(p.crowded){for(let k=0;k<Math.min(3,1+Math.floor(l.crowd/Math.max(l.stations,1)*3));k++)ellipse(c,p.x+10+k*5,p.y-8,1.6,1.6,'#97634e');}});
    for(let i=0;i<l.trainSamples;i++){const phase=((m.animate&&l.working?t*.028:0)+i/Math.max(1,l.trainSamples)*1.8+l.tier*.17)%2,f=phase<=1?phase:2-phase,p=routePoint(l.points,f),a=p.a+(phase>1?Math.PI:0);smallTrain(c,p.x,p.y,a,l.color);}
    const p=l.points[0];ellipse(c,p[0],p[1],13,13,l.color);text(c,String(l.tier),p[0],p[1],12,'#fff6df','center',700);
  });
  m.transfers.forEach(pair=>{const a=m.lines.find(l=>l.tier===pair[0]),b=m.lines.find(l=>l.tier===pair[1]),p=nearestPair(a.points,b.points);line(c,[p.a,p.b],'#f6efd8',9);line(c,[p.a,p.b],'#526c61',3);ellipse(c,p.a[0],p.a[1],8,8,'#f5f0dc','#526c61',2);ellipse(c,p.b[0],p.b[1],4,4,'#f5f0dc',b.color,1);});
  if(m.airport){const airport=m.lines.find(l=>l.tier===10);if(airport){const p=airport.points[airport.points.length-1];rect(c,p[0]+17,p[1]-18,45,25,'#c5c7af',3);line(c,[[p[0]+39,p[1]-14],[p[0]+39,p[1]+2]],'#617b6b',2);line(c,[[p[0]+29,p[1]-1],[p[0]+39,p[1]-8],[p[0]+49,p[1]-1]],'#617b6b',2);}}
  text(c,m.title,38,36,20,'#3e6656','left',650);text(c,m.night?'Ночной режим':'Живая сеть города',38,62,12,'#5d7b69');
  if(m.selected){const p=m.selected.points[m.selected.points.length-1];text(c,m.selected.title,p[0]-14,p[1]+22,13,'#415f53','right',650);reaction(c,p[0],p[1],fx);}
  if(m.heritage)dots(c,40,87,m.heritage,'#6c8c71');
}
function sectionTrain(c,x,y,color,door){
  for(let i=0;i<3;i++){const xx=x+i*128;rect(c,xx,y,123,56,'#d8d8ba',9,'#efe5bf');rect(c,xx+2,y+35,119,15,color,1);rect(c,xx+10,y+11,29,18,'#2a4751',3);rect(c,xx+82,y+11,28,18,'#2a4751',3);rect(c,xx+49,y+10,23,41,'#294b52',2);rect(c,xx+49-door*9,y+10,10,39,'#c6cdb7',1);rect(c,xx+62+door*9,y+10,10,39,'#c6cdb7',1);ellipse(c,xx+20,y+55,5,5,'#24353c');ellipse(c,xx+101,y+55,5,5,'#24353c');if(i<2)rect(c,xx+123,y+20,5,30,'#3b5354',1);}
}
function subwaySection(c,m,t,fx){
  c.fillStyle=grad(c,0,0,0,620,[[0,m.night?'#7a9394':'#d5ded0'],[.27,'#b3c3b1'],[.28,'#655e53'],[1,'#343f41']]);c.fillRect(0,0,1000,620);
  const selected=m.selected;if(!selected){text(c,'Нет построенных линий',500,300,23,'#d5e0cc','center');return;}
  for(let i=0;i<Math.min(12,3+Math.ceil(selected.scale));i++){const x=50+i*89,h=35+seed(i+m.city)*80;rect(c,x,150-h,65,h,'#afc1ae',2);for(let y=162-h;y<143;y+=14)for(let xx=x+9;xx<x+57;xx+=15)rect(c,xx,y,5,7,m.night?'#dfd5aa66':'#7a9a8d33',1);}
  rect(c,0,150,1000,16,'#c7c4a6');rect(c,0,166,1000,10,'#84937e');for(let i=0;i<11;i++)tree(c,35+i*91,150,.6,'#6a8a70','#8ea77c');
  const transfer=m.transfers.find(p=>p.includes(selected.tier)),other=transfer?m.lines.find(l=>l.tier===transfer.find(x=>x!==selected.tier)):null;
  const shown=other?[selected,other]:[selected];
  for(let i=0;i<9;i++){c.beginPath();c.moveTo(0,194+i*47);for(let x=80;x<=1040;x+=80)c.lineTo(x,194+i*47+seed(i+x)*12);c.strokeStyle=i%2?'#a18e7226':'#1e303c44';c.lineWidth=5;c.stroke();}
  shown.forEach((l,j)=>{
    const y=other?230+j*202:l.ground?172:286;
    rect(c,41,y-15,918,137,'#233e46',30);rect(c,53,y,894,111,'#acb79d',17);
    for(let row=0;row<4;row++)line(c,[[62,y+9+row*14],[940,y+9+row*14]],'#dfdfb733',1);
    for(let xx=68;xx<940;xx+=30)line(c,[[xx,y+7],[xx,y+61]],'#718e7d22',1);
    for(let i=0;i<7;i++){const xx=95+i*131;rect(c,xx,y+10,61,35,'#65897e66',8);rect(c,xx+8,y+16,45,23,'#b7c6a5',3);line(c,[[xx+8,y],[xx+53,y]],'#ede1ad',3);glow(c,xx+30,y+6,38,'#f5e1a91c');}
    text(c,l.tier+' · '+l.title,476,y+34,15,'#365c57','center',650);
    rect(c,54,y+64,892,13,'#d5cdac');rect(c,54,y+77,892,35,'#2a424a');line(c,[[56,y+61],[944,y+61]],'#ead497',3,[6,5]);line(c,[[55,y+104],[946,y+104]],'#9aafa0',2);
    if(l.trains){const active=m.animate&&l.working,phase=active?(t*.055+j*.5)%1:.5,x=phase<.65?310+Math.sin(phase*5)*4:310+(phase-.65)*2200,door=active&&phase<.5?Math.sin(phase/.5*Math.PI):0;sectionTrain(c,x,y+57,l.color,door);}
    const people=Math.min(17,Math.ceil(scale(l.crowd,10))+(l.working?5:0));
    for(let i=0;i<people;i++){const x=82+((i*73+(m.animate&&l.working?t*(i%2?3:-3):0)+850)%850);person(c,x,y+54,.83,['#7c8c75','#ae8a65','#688c94'][i%3],m.animate&&l.working?t*3+i:0);}
    if(l.dispatcher){rect(c,822,y+10,95,45,'#7b9584',4);rect(c,830,y+18,78,23,'#d3d5af',2);text(c,'ДИСПЕТЧЕР',870,y+30,10,'#426b61','center',650);}
    text(c,l.stations+' станций · '+l.trains+' поездов · '+(l.working?'движение':'остановлено'),500,y+142,13,l.working?'#c8dac3':'#e1c09e','center');
  });
  // Only a purchased transfer opens a second level and the connector.
  if(other){poly(c,[[713,357],[767,357],[632,430],[578,430]],'#233c45');for(let i=0;i<15;i++){const k=(i+(m.animate?t*.6:0))%15;line(c,[[710-k*8.8,361+k*4.5],[753-k*8.8,361+k*4.5]],'#a5b7a0',2);}line(c,[[712,353],[578,426]],'#d2d8b1',3);line(c,[[767,353],[632,426]],'#d2d8b1',3);}
  const upperY=other?230:selected.ground?172:286;
  if(!selected.ground){poly(c,[[666,174],[728,174],[805,upperY],[743,upperY]],'#37535a');for(let i=0;i<11;i++){const f=i/10;line(c,[[mix(666,743,f),mix(175,upperY,f)],[mix(728,805,f),mix(175,upperY,f)]],'#a9b69d',3);}rect(c,650,132,105,10,selected.color,3);rect(c,689,107,25,22,selected.color,3);text(c,'М',701,118,14,'#f6ebc7','center',650);}
  text(c,m.title+' · '+(selected.ground?'наземная линия':'вид выбранной станции'),36,30,17,m.night?'#dce6cf':'#476b5c','left',650);reaction(c,495,upperY+65,fx);
}
function draw(c,m,t,effects){if(!m)return;c.save();(m.view?subwaySection:subwayMap)(c,m,t,effects);c.restore();}
return {model,draw,mount,hit};
});
