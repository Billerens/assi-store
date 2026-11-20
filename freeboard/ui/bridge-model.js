import * as T from '../vendor/three-0.160.0/three.module.js';
import {box,coat,fairing,finish,lamp,mesh,rod,sph,surface} from './model-kit.js';
import {HELM} from './ship-interior.js';

const mid=HELM.x;
function plate(g,points,material) {
  const geo=new T.BufferGeometry();
  geo.setAttribute('position',new T.Float32BufferAttribute(points.flat(),3));
  geo.setIndex([0,1,2,0,2,3]);geo.computeVertexNormals();
  return mesh(g,geo,material);
}
function plaque(g,x,y,z,label,color,w=.7,h=.16,rotate=0){
  const {ctx:c,texture}=surface('ship marking',256);
  c.fillStyle='#203039';c.fillRect(0,0,256,256);c.strokeStyle=color;c.lineWidth=6;c.strokeRect(4,4,248,248);
  c.save();c.scale(1,3.7);c.font='bold 32px sans-serif';c.textAlign='center';c.fillStyle='#e6e6cd';c.fillText(label.toLocaleUpperCase(),128,43,224);c.restore();
  const p=mesh(g,new T.PlaneGeometry(w,h),new T.MeshBasicMaterial({map:texture}),x,y,z);p.rotation.y=rotate;return p;
}
function instrument(){
  const {ctx,texture}=surface('live avionics',512);
  const material=new T.MeshBasicMaterial({map:texture});
  const radar=surface('proximity scope',256),power=surface('power distribution',256);
  const left=new T.MeshBasicMaterial({map:radar.texture}),right=new T.MeshBasicMaterial({map:power.texture});
  const text=(s,x,y,size,color='#a4eadb')=>{ctx.font='bold '+size+'px monospace';ctx.fillStyle=color;ctx.fillText(s,x,y);};
  function redraw(f,next){
    const speed=Math.round(f?.speed||0), shield=Math.round(f?.shield??100), hull=Math.round(f?.hull??100);
    const contactCell=(f?.enemies||[]).map(o=>o.hp>0?Math.round((o.x-f.x)*.13)+','+Math.round((o.z-f.z)*.13):'').join('/');
    const stamp=[speed,shield,hull,next,Math.round((f?.pitch||0)*12),Math.round((f?.yaw||0)*15),contactCell].join('/');
    if(stamp===redraw.last)return;
    redraw.last=stamp;
    ctx.fillStyle='#0d2029';ctx.fillRect(0,0,512,512);
    ctx.strokeStyle='#233c43';ctx.lineWidth=2;
    for(let k=0;k<512;k+=24){ctx.beginPath();ctx.moveTo(k,0);ctx.lineTo(k,512);ctx.moveTo(0,k);ctx.lineTo(512,k);ctx.stroke();}
    ctx.strokeStyle='#6ebbad';ctx.lineWidth=4;ctx.strokeRect(9,9,493,493);
    const px=169, py=244;
    ctx.save();ctx.translate(px,py);const pitch=f?.pitch||0,yaw=f?.yaw||0;
    ctx.fillStyle='#244854';ctx.beginPath();ctx.arc(0,0,108,0,Math.PI*2);ctx.fill();ctx.clip();
    ctx.translate(0,Math.sin(pitch)*63);
    ctx.fillStyle='#5e5344';ctx.fillRect(-115,0,230,160);ctx.strokeStyle='#d8d8a7';ctx.lineWidth=3;
    for(let i=-2;i<=2;i++){const len=i===0?103:28;ctx.beginPath();ctx.moveTo(-len,i*28);ctx.lineTo(len,i*28);ctx.stroke();}
    ctx.restore();
    ctx.strokeStyle='#dfaa68';ctx.lineWidth=7;ctx.beginPath();ctx.moveTo(px-46,py);ctx.lineTo(px-10,py);ctx.lineTo(px,py+9);ctx.lineTo(px+10,py);ctx.lineTo(px+46,py);ctx.stroke();
    text('NAV  /  01',26,61,30);text('VEL',326,122,25);text(String(speed).padStart(2,'0'),324,195,66,'#fcde9c');
    text('SHD '+shield,318,269,24);text('HUL '+hull,318,327,24);text('HDG  '+String((Math.round(yaw*180/Math.PI)+360)%360).padStart(3,'0'),30,435,32);
    ctx.fillStyle=next?'#d7a565':'#7bbba5';ctx.fillRect(318,386,120,9);ctx.fillRect(318,414,80,7);ctx.fillRect(318,437,103,7);
    texture.needsUpdate=true;
    const scope=radar.ctx;
    scope.fillStyle='#102932';scope.fillRect(0,0,256,256);scope.strokeStyle='#55968d';scope.lineWidth=2;
    for(let i=1;i<5;i++){scope.beginPath();scope.arc(128,135,i*24,0,Math.PI*2);scope.stroke();}
    scope.beginPath();scope.moveTo(24,135);scope.lineTo(232,135);scope.moveTo(128,30);scope.lineTo(128,240);scope.stroke();
    scope.fillStyle='#c7dcac';scope.beginPath();scope.moveTo(128,124);scope.lineTo(136,143);scope.lineTo(128,139);scope.lineTo(120,143);scope.closePath();scope.fill();
    for(const o of (f?.enemies||[])){if(o.hp<=0)continue;const x=o.x-f.x,z=o.z-f.z,sy=Math.sin(yaw),cy=Math.cos(yaw);
      const dx=(cy*x+sy*z)*.97,dy=(-sy*x+cy*z)*.97,k=Math.min(1,92/Math.max(1,Math.hypot(dx,dy)));
      scope.fillStyle='#e5a478';scope.fillRect(125+dx*k,132+dy*k,6,6);}
    scope.font='bold 16px monospace';scope.fillStyle='#b2d9c3';scope.fillText('SCAN  /  02',12,21);
    const ec=power.ctx;ec.fillStyle='#112932';ec.fillRect(0,0,256,256);ec.font='bold 17px monospace';ec.fillStyle='#c4ddc9';ec.fillText('BUS  /  03',13,24);
    for(const [i,n] of [speed/60,Math.min(1,shield/100),hull/100].entries()){
      const y=61+i*58;ec.font='bold 16px monospace';ec.fillStyle='#c9cfaf';ec.fillText(['DRV','SHD','HUL'][i],13,y+13);
      for(let j=0;j<12;j++){ec.fillStyle=j/12<n?(i===0?'#e0ad78':'#86c7b3'):'#2a4147';ec.fillRect(56+j*15,y,9,16);}
    }
    radar.texture.needsUpdate=true;power.texture.needsUpdate=true;
  }
  return {material,left,right,redraw};
}
export function bridgeDeck(p,translate=text=>text){
  const g=new T.Group(),frame=coat(0x344855,.54,.59),cream=coat(0xc5c5b2,.66,.30),wall=coat(0x83938f,.58,.43),
    deck=coat(0x4e6168,.71,.35),deep=coat(0x263944,.79,.27),brass=coat(0xab8355,.52,.62),
    trim=coat([0xb37b54,0x529391,0x9e7494][p.cabin],.84,.09),warm=lamp(0xffd294),cyan=lamp(0x98dbce);
  const windowMat=new T.MeshBasicMaterial({color:0x7caeb9,side:T.DoubleSide,transparent:true,opacity:.033,depthWrite:false});
  function bulkhead(z,x,h=2.52,opening=1.80){
    for(const s of [-1,1]){
      const xx=x+s*opening/2;
      box(g,.12,h,.22,frame,xx,h/2+.08,z);
      rod(g,[xx,.14,z+.13],[xx,.63,z+.13],.034,brass);
      rod(g,[xx,h-.55,z+.13],[xx,h-.11,z+.13],.036,warm);
      rod(g,[xx,h-.25,z],[xx-s*.19,h,z],.082,frame,.075);
    }
    box(g,opening+.23,.14,.23,frame,x,h+.03,z);
  }
  // The passage is open at both ends. The repeated ribs and deck arrows
  // give a readable sense of speed and direction when walking a few metres.
  for(let i=0;i<6;i++){
    const z=-3.52-i*.65;
    box(g,2.12,.16,.655,deck,mid,.015,z);
    box(g,2.18,.14,.655,wall,mid,2.64,z);
    for(const s of [-1,1]){
      box(g,.15,2.72,.665,cream,mid+s*1.03,1.35,z);
      fairing(g,mid+s*.953,1.38,z,.08,.75,.55,wall);
      box(g,.075,.08,.37,warm,mid+s*.894,2.15,z);
      box(g,.045,.075,.51,deep,mid+s*.935,.48,z);
      box(g,.09,.012,.27,brass,mid+s*.80,.102,z);
    }
    if(i%2===1){
      for(const s of [-1,1])rod(g,[mid+s*.16,.107,z+.085],[mid,.107,z-.026],.019,cyan);
    }
  }
  for(const z of [-3.23,-5.18,-7.12])bulkhead(z,mid);
  plaque(g,mid,2.66,-3.009,translate('Bridge'),'#d8b17f',.83,.19);
  plaque(g,mid,2.62,-7.245,translate('Quarters'),'#80bcae',.79,.19,Math.PI);
  plaque(g,mid,2.44,3.022,translate('Airlock'),'#d8b17f',.75,.165,Math.PI);

  const front=-12.23,aft=-7.13,L=mid-2.39,R=mid+2.39;
  box(g,4.88,.21,5.06,frame,mid,-.045,-9.69);
  for(let r=0;r<7;r++)for(let k=0;k<4;k++)box(g,1.18,.06,.70,(r+k)%4===0?frame:deck,L+.62+k*1.20,.087,aft-.36-r*.716);
  for(const s of [-1,1]){
    const bx=mid+s*1.68,side=mid+s*2.37;
    box(g,1.43,2.89,.17,cream,bx,1.46,aft);
    fairing(g,bx,1.43,aft-.14,1.17,1.97,.12,wall);
    box(g,.16,.60,4.91,cream,side,.39,-9.67);
    box(g,.16,1.35,1.30,wall,side,1.31,-7.79);
    box(g,.17,1.22,1.30,wall,side,2.29,-7.79);
    fairing(g,side-s*.17,1.15,-8.02,.19,.83,.95,deep);
    for(let k=0;k<5;k++)box(g,.055,.030,.56,k<2?brass:wall,side-s*.289,1.02+k*.096,-8.02);
    // A three-panel side glazing rises from the armored gunwale.
    const topX=side-s*.40;
    const sideGlass=[[side,.68,-8.45],[side,.68,front],[topX,2.68,front+.26],[topX,2.68,-8.45]];
    plate(g,sideGlass,windowMat);
    for(const z of [-8.44,-10.02,front]){
      rod(g,[side,.66,z],[topX,2.70,z+.19],.059,frame,.071,8);
      rod(g,[side-s*.016,.70,z+.06],[topX-s*.016,2.67,z+.23],.019,brass,.019);
    }
    rod(g,[side,.70,front],[side,.70,-8.42],.080,frame);
    rod(g,[topX,2.68,front+.22],[topX,2.68,-8.39],.107,frame);
    // Side consoles sit below the field of view with throttle levers to port.
    fairing(g,side-s*.29,.53,-10.27,.62,.82,2.14,deep);
    fairing(g,side-s*.29,.96,-10.28,.57,.10,2.01,wall);
    for(let j=0;j<5;j++)box(g,.22,.025,.047,j<2?cyan:brass,side-s*.26,1.026,-10.04-j*.19);
  }
  box(g,4.12,.15,4.88,cream,mid,2.84,-9.60);
  box(g,4.88,.18,1.62,cream,mid,2.79,-7.92);
  for(let i=0;i<5;i++){
    const z=-7.48-i*.87;
    box(g,3.88,.10,.09,frame,mid,2.70,z);
    for(const s of [-1,1])box(g,.67,.035,.14,warm,mid+s*1.44,2.71,z-.23);
  }
  box(g,4.9,.69,.23,frame,mid,.39,front);
  box(g,4.87,.28,.24,wall,mid,.66,front+.05);
  const corners=[[L,.72,front],[R,.72,front],[R-.40,2.69,front+.27],[L+.40,2.69,front+.27]];
  plate(g,corners,windowMat);
  for(let i=0;i<4;i++)rod(g,corners[i],corners[(i+1)%4],.064,frame,.064,10);
  for(const s of [-1,1]){
    rod(g,[mid+s*1.93,.73,front],[mid+s*1.41,2.68,front+.25],.036,frame,.040);
    rod(g,[mid+s*1.88,.73,front],[mid+s*1.36,2.68,front+.25],.012,brass);
  }
  // Central flight seat, restrained headrest and dual flight grips.
  const z=HELM.z;
  fairing(g,mid,.18,z,.86,.14,1.1,deep);
  rod(g,[mid,.18,z],[mid,.59,z],.13,wall,.19);
  fairing(g,mid,.67,z,.79,.23,.81,trim);
  fairing(g,mid,1.01,z+.35,.86,.79,.18,deep);
  fairing(g,mid,1.06,z+.23,.68,.64,.15,trim);
  fairing(g,mid,1.53,z+.36,.51,.21,.19,trim);
  for(const s of [-1,1]){
    rod(g,[mid+s*.34,.50,z+.06],[mid+s*.44,.81,z-.07],.048,brass);
    fairing(g,mid+s*.42,.89,z-.04,.15,.10,.47,deep);
    fairing(g,mid+s*.46,1.04,z-.61,.28,.09,.43,wall);
    rod(g,[mid+s*.46,1.07,z-.59],[mid+s*.45,1.22,z-.66],.055,deep,.042);
    sph(g,mid+s*.45,1.23,z-.67,.068,.053,.079,trim);
  }
  fairing(g,mid,.48,-10.97,3.94,.80,.74,deep);
  fairing(g,mid,.83,-10.97,3.92,.19,.78,wall);
  const av=instrument();
  function consoleScreen(x,z,w,h,ax,mat){
    const unit=new T.Group();g.add(unit);unit.position.set(x,.93,z);unit.rotation.x=ax;
    fairing(unit,0,0,0,w+.085,h+.07,.105,frame);
    mesh(unit,new T.PlaneGeometry(w,h),mat,0,0,.064);
    for(const s of [-1,1])box(unit,.026,.027,.026,warm,s*w*.47,-h*.51,.056);
  }
  consoleScreen(mid,-10.60,.69,.44,-.48,av.material);
  for(const s of [-1,1]){
    consoleScreen(mid+s*.91,-10.74,.74,.35,-.53,s===-1?av.left:av.right);
    for(let i=0;i<6;i++)box(g,.066,.04,.09,i%3===0?warm:cyan,mid+s*(1.45+i*.078),.958,-10.86);
  }
  const model=finish(g);
  model.userData.updateAvionics=(flight,time)=>{const tick=Math.floor(time*6);if(model.userData.tick===tick)return;model.userData.tick=tick;av.redraw(flight,!!flight?.nextShot&&flight.nextShot>0);};
  av.redraw(null,false);
  return model;
}
