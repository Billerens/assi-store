import * as T from '../vendor/three-0.160.0/three.module.js';
import {finish,coat,lamp,mesh,box,sph,rod,band,pathTube,loft,fairing,surface} from './model-kit.js';

function panelTexture(){
  const {ctx,texture}=surface('Photovoltaic cells',256);
  ctx.fillStyle='#3b536b';ctx.fillRect(0,0,256,256);
  for(let y=0;y<6;y++)for(let x=0;x<8;x++){
    const px=x*32+2,py=y*42+2;
    const g=ctx.createLinearGradient(px,py,px+30,py+38);
    g.addColorStop(0,(x+y)%3===0?'#356278':'#243951');g.addColorStop(1,'#606079');
    ctx.fillStyle=g;ctx.fillRect(px,py,28,38);
    ctx.strokeStyle='#9b8172';ctx.lineWidth=1;
    for(let i=1;i<5;i++){ctx.beginPath();ctx.moveTo(px,py+i*7.5);ctx.lineTo(px+27,py+i*7.5);ctx.stroke();}
    ctx.fillStyle='#c8a870';ctx.fillRect(px+13,py,.85,38);
  }
  return coat(0xffffff,.33,.62,{map:texture});
}
function truss(g,start,end,width,m){
  for(const [x,y] of [[-width,0],[width,0],[0,width*1.4]]){
    rod(g,[start[0]+x,start[1]+y,start[2]],[end[0]+x,end[1]+y,end[2]],width*.14,m);
  }
  for(let i=0;i<5;i++){
    const along=t=>start.map((n,axis)=>n+(end[axis]-n)*t);
    const a=along(i/5),b=along((i+1)/5);
    rod(g,[a[0]-width,a[1],a[2]],[b[0]+width,b[1],b[2]],width*.085,m);
    rod(g,[a[0]+width,a[1],a[2]],[b[0],b[1]+width*1.4,b[2]],width*.085,m);
  }
}
export function orbitalStation(){
  const g=new T.Group();
  const ivory=coat(0xc9c7b1,.49,.53),charcoal=coat(0x2b393f,.56,.57),silver=coat(0x85938e,.36,.71),
    bronze=coat(0xa96e39,.35,.68),solar=panelTexture(),amber=lamp(0xffcd83),aqua=lamp(0x9bece4);
  loft(g,[[-6.0,.68,.68,0],[-5.4,1.14,1.14,0],[-3.4,1.32,1.32,0],[-2.8,.90,.90,0],
    [.7,.90,.90,0],[1.5,1.20,1.20,0],[3.6,1.35,1.35,0],[4.3,.98,.98,0]],ivory,16,.84);
  for(const z of [-5.21,-4.77,-3.95,-2.76,-1.66,.37,1.40,2.83,3.43])band(g,0,0,z,z<-3?1.21:1.02,.10,charcoal,24);
  for(const a of [0,2.094,4.188]){
    const x=Math.sin(a),y=Math.cos(a);
    pathTube(g,[[x*.76,y*.76,-4.6],[x*1.40,y*1.40,-3.35],[x*1.11,y*1.11,-2.2],[x*1.11,y*1.11,.6]],.09,bronze);
  }
  // Segmented pressure ring. Gaps expose the inner truss, and each inhabited
  // section has its own window belt and thermal caps.
  band(g,0,0,-1.52,4.65,.13,bronze,70);band(g,0,0,-.56,4.65,.13,silver,70);
  const span=Math.PI*2/11;
  for(let i=0;i<11;i++){
    const a=i*span+.04,am=a+span*.43;
    const shell=mesh(g,new T.TorusGeometry(4.69,.64,6,8,span*.84),i%3===0?bronze:ivory,0,0,-1.12);shell.rotation.z=a;
    for(let w=0;w<5;w++){
      const theta=a+span*(.13+w*.14);
      const window=box(g,.13,.34,.065,(w+i)%4===0?charcoal:amber,Math.cos(theta)*4.72,Math.sin(theta)*4.72,-.54);
      window.rotation.z=theta;
    }
    if(i%2===0){
      const sx=Math.cos(am),sy=Math.sin(am);
      for(const z of [-1.60,-.59]){
        rod(g,[sx*.9,sy*.9,z],[sx*4.50,sy*4.50,z],.13,silver);
      }
      rod(g,[sx*1.25,sy*1.25,-1.58],[sx*4.35,sy*4.35,-.57],.086,bronze);
    }
  }
  // Visibly open forked berth at the end of the keel.
  for(const s of [-1,1]){
    fairing(g,s*1.26,-.18,4.74,.65,1.08,3.34,ivory);
    fairing(g,s*1.26,-.09,6.00,.69,.84,.55,bronze);
    box(g,.09,.09,2.56,aqua,s*.88,.14,4.90);
    truss(g,[s*1.28,-.44,3.53],[s*1.28,-.44,6.52],.23,charcoal);
  }
  // Two folding power wings, offset along the fore-and-aft spine.
  for(const s of [-1,1]){
    const wing=new T.Group();g.add(wing);wing.position.z=-4.35;wing.rotation.x=.64;wing.rotation.z=s*.08;
    rod(wing,[s*.86,0,0],[s*9.08,0,0],.095,silver);
    for(let k=0;k<3;k++){
      const base=s*(4.25+2.02*k);
      for(const row of [-1,1]){
        const z=row*1.19;
        box(wing,1.92,.13,2.19,charcoal,base,0,z);
        const sheet=mesh(wing,new T.PlaneGeometry(1.80,2.05),solar,base,.078,z);sheet.rotation.x=-Math.PI/2;
        box(wing,.047,.055,2.12,bronze,base,.102,z);
      }
    }
  }
  rod(g,[0,1.0,-4.2],[0,2.35,-4.2],.09,silver,.06);sph(g,0,2.41,-4.2,.17,.17,.17,aqua);
  const out=finish(g);out.rotation.x=-.18;out.rotation.y=.32;return out;
}
export function harborShuttle(index){
  const g=new T.Group(),paint=coat([0xe7ddbe,0x7faaa3,0xd59a68][index%3],.51,.39),
    steel=coat(0x34424a,.51,.56),cargo=coat(index%2?0xb98352:0xa8a598,.62,.3),
    engine=lamp(0x91e7ea),windows=lamp(0xffce90);
  loft(g,[[-2.16,.07,.05,0],[-1.82,.42,.23,.015],[-.92,.56,.33,.08],[.9,.49,.30,.03],[1.5,.36,.20,0]],paint,16,.66);
  fairing(g,0,.29,-1.15,.63,.21,.66,steel);
  for(const s of [-1,1]){
    fairing(g,s*.66,-.02,.15,.51,.52,1.92,cargo);
    for(const z of [-.50,.5])fairing(g,s*.66,-.02,z,.54,.55,.08,steel);
    for(let i=0;i<4;i++)box(g,.025,.072,.116,windows,s*.53,.17,-.66+i*.26);
    rod(g,[s*.39,-.06,.62],[s*.39,-.06,1.68],.17,steel,.19,14);
    band(g,s*.39,-.06,1.70,.14,.042,engine,16);
  }
  return finish(g);
}
function deckMap(){
  const {ctx:c,texture}=surface('Maintenance berth deck',640),size=640;
  c.fillStyle='#46545c';c.fillRect(0,0,size,size);
  for(let y=0;y<8;y++)for(let x=0;x<8;x++){
    const px=x*80,py=y*80;
    c.fillStyle=['#45535a','#4b575d','#505b5f','#414e56'][(x*37+y*13)%4];c.fillRect(px+1,py+1,78,78);
    c.strokeStyle='#334148';c.lineWidth=2;c.strokeRect(px+2,py+2,76,76);
    c.fillStyle='#788081';for(const xx of [7,70])for(const yy of [7,70])c.fillRect(px+xx,py+yy,2,2);
  }
  c.strokeStyle='#a2a38f';c.lineWidth=4;c.setLineDash([12,14]);c.beginPath();c.arc(320,320,216,0,Math.PI*2);c.stroke();c.setLineDash([]);
  c.strokeStyle='#d0aa69';c.lineWidth=6;c.beginPath();c.arc(320,320,230,.17,1.93);c.stroke();
  for(const x of [117,488]){
    c.fillStyle='#273b45';c.fillRect(x-5,145,39,348);
    for(let y=150;y<486;y+=11){c.fillStyle='#738084';c.fillRect(x,y,29,3);}
  }
  c.font='bold 51px monospace';c.textAlign='center';c.fillStyle='#c4bdaa';c.fillText('07',320,530);
  c.font='bold 10px monospace';c.fillText('ORBITAL SERVICE',320,547);
  c.strokeStyle='#c9a96d';c.lineWidth=4;for(let i=0;i<6;i++){c.beginPath();c.moveTo(93+i*17,112);c.lineTo(106+i*17,99);c.stroke();}
  return coat(0xffffff,.76,.27,{map:texture});
}
export function serviceBerth(){
  const g=new T.Group(),frame=coat(0x384852,.48,.69),stiffener=coat(0x65747a,.45,.66),warning=coat(0xbb8a53,.48,.45),lights=lamp(0xffc48c);
  const base=mesh(g,new T.CylinderGeometry(4.85,4.4,.54,12),frame,0,-.28,0);base.rotation.y=Math.PI/12;
  const floor=mesh(g,new T.CircleGeometry(4.80,12),deckMap(),0,.014,0);floor.rotation.x=-Math.PI/2;floor.rotation.z=Math.PI/12;
  for(let i=0;i<12;i++){
    const a=(i+.5)*Math.PI/6,x=Math.sin(a),z=Math.cos(a);
    const v=box(g,1.95,.25,.33,i%3?stiffener:warning,x*4.53,-.19,z*4.53);v.rotation.y=a;
    const line=box(g,1.55,.035,.09,lights,x*4.52,.015,z*4.52);line.rotation.y=a;
    rod(g,[x*4.48,-.34,z*4.48],[x*3.87,-.98,z*3.87],.10,frame);
  }
  return finish(g);
}
export function wake(p){
  const g=new T.Group();
  const positions=p.frame===2?[[0,.03,2.98,.53],[-1.1,.23,2.5,.25],[1.1,.23,2.5,.25]]:
    (p.frame===1?[[-2.48,-.01,2.8,.43],[2.48,-.01,2.8,.43]]:[[-1.26,.13,2.7,.36],[1.26,.13,2.7,.36]]);
  if(p.fit.includes(2)){
    const x=p.frame===1?2.99:2.16;
    positions.push([-x,.13,2.0,.13],[x,.13,2.0,.13]);
  }
  const color=p.frame===1?0xffbe7b:0x8ceaed;
  const mat=new T.ShaderMaterial({transparent:true,depthWrite:false,side:T.DoubleSide,blending:T.AdditiveBlending,
    uniforms:{tint:{value:new T.Color(color)}},
    vertexShader:'varying float v;void main(){v=uv.y;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:'varying float v;uniform vec3 tint;void main(){float a=pow(1.-v,1.5)*.52;gl_FragColor=vec4(tint,a);}'});
  for(const [x,y,z,r] of positions){
    const geo=new T.CylinderGeometry(.02,r,1,16,1,true);geo.translate(0,.5,0);geo.rotateX(Math.PI/2);
    const plume=mesh(g,geo,mat,x,y,z);plume.userData.radius=r;
  }
  return g;
}
