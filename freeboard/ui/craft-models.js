import * as T from '../vendor/three-0.160.0/three.module.js';
import {finish,coat,lamp,mesh,box,sph,rod,band,pathTube,loft,foil,fairing,surface} from './model-kit.js';

const schemes=[
  {base:'#e3e3d7',shade:'#c6d1c9',accent:'#bf4b30',dark:'#344d52',name:'SWIFT',mark:'SW 07'},
  {base:'#78948a',shade:'#5a7976',accent:'#d5a344',dark:'#283d41',name:'MANTA',mark:'MC 18'},
  {base:'#344355',shade:'#485669',accent:'#eb9155',dark:'#182a3b',name:'KESTREL',mark:'KS 31'}
];
function paintedSkin(frame){
  const scheme=schemes[frame],{ctx:c,texture}=surface('Hull markings / '+scheme.name,1024);
  const unit=102.4;const px=x=>(.5+x/10)*1024,pz=z=>(.5+z/11)*1024;
  c.fillStyle=scheme.base;c.fillRect(0,0,1024,1024);
  const fill=(coords,col)=>{c.fillStyle=col;c.beginPath();coords.forEach(([x,z],i)=>i?c.lineTo(px(x),pz(z)):c.moveTo(px(x),pz(z)));c.closePath();c.fill();};
  const stroke=(coords,col,w)=>{c.strokeStyle=col;c.lineWidth=w;c.beginPath();coords.forEach(([x,z],i)=>i?c.lineTo(px(x),pz(z)):c.moveTo(px(x),pz(z)));c.stroke();};
  let seed=74+frame;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  // Baked enamel variation, access doors and deliberately large livery visible from the chase camera.
  for(let i=0;i<16000;i++){c.fillStyle=i%3?'rgba(25,36,39,.035)':'rgba(255,248,212,.12)';c.fillRect(rand()*1024,rand()*1024,1+rand()*2,1);}
  for(const side of [-1,1]){
    const mirror=list=>list.map(([x,z])=>[x*side,z]);
    if(frame===0){
      fill(mirror([[1.08,-1.74],[1.45,-1.38],[3.52,1.0],[3.52,1.66],[1.0,-.84]]),scheme.accent);
      fill(mirror([[.0,-4.8],[.23,-4.8],[.21,-2.11],[0,-1.71]]),scheme.accent);
      fill(mirror([[2.85,1.7],[3.65,1.31],[3.68,2.24],[2.70,2.34]]),scheme.dark);
    } else if(frame===1){
      fill(mirror([[1.30,-3.5],[1.65,-3.5],[1.65,3.7],[1.30,3.7]]),scheme.accent);
      fill(mirror([[2.55,-3.6],[3.88,-3.6],[3.88,-1.55],[2.55,-1.08]]),scheme.accent);
      fill(mirror([[.0,-3.72],[.18,-3.72],[.18,-1.82],[0,-1.82]]),scheme.dark);
    }else{
      fill(mirror([[.34,-4.9],[.50,-4.4],[.99,.05],[.71,-.19]]),scheme.accent);
      fill(mirror([[1.02,-1.8],[1.32,-1.5],[3.56,2.17],[3.28,2.05]]),scheme.accent);
      fill(mirror([[2.58,1.38],[3.70,1.80],[3.48,3.10],[2.53,2.52]]),'#687984');
    }
    const seams=[
      [[.10,-3.10],[.29,-2.89],[.66,-2.68]],[[.18,-2.53],[.64,-2.27],[.79,-2.20]],
      [[.53,-1.43],[.87,-1.17],[1.19,-.91]],[[.51,-.48],[.91,-.21],[1.20,-.13]],
      [[.10,1.04],[.43,.88],[.83,.89],[1.05,1.12]],[[.05,2.10],[.51,2.10],[.8,1.94]],
      [[.92,-.21],[1.89,.49],[2.59,1.29],[3.47,1.73]],
      [[1.23,1.70],[1.57,1.28],[2.15,1.49],[2.42,1.98]],
      [[1.15,.81],[1.63,.73],[2.12,1.1]],[[2.06,2.31],[2.41,1.98],[3.17,2.22]]
    ];
    for(const path of seams){
      stroke(mirror(path),'rgba(21,35,40,.55)',1.9);
      stroke(mirror(path.map(([x,z])=>[x,z+.018])),'rgba(255,255,238,.61)',1.1);
    }
    for(const [x,z] of [[.60,-2.12],[.75,.35],[1.68,1.36],[2.71,1.80]]){
      c.save();c.translate(px(side*x),pz(z));c.strokeStyle=scheme.dark;c.lineWidth=1.7;c.strokeRect(-9,-5,18,10);
      c.fillStyle=scheme.dark;c.fillRect(-8,-4,4,3);c.fillRect(4,1,4,3);c.restore();
    }
    c.fillStyle=frame===2?'#dfdfca':scheme.dark;c.textAlign='center';c.font='800 26px Arial';c.save();c.translate(px(side*2.12),pz(1.53));c.rotate(side*.40);c.fillText(frame===0?'07':frame===1?'18':'31',0,0);c.restore();
    c.save();c.translate(px(side*.73),pz(1.52));c.rotate(Math.PI/2);c.font='bold 10px monospace';c.fillText(scheme.name,0,0);c.restore();
    for(let i=0;i<5;i++) fill(mirror([[.93+i*.055,.75],[.955+i*.055,.75],[1.02+i*.055,.92],[.995+i*.055,.92]]),scheme.accent);
    for(let i=0;i<40;i++){
      const x=px(side*(.3+rand()*3.3)),y=pz(-2.7+rand()*5.6);
      c.fillStyle='rgba(28,39,43,.40)';c.beginPath();c.arc(x,y,1.25,0,Math.PI*2);c.fill();
    }
  }
  c.fillStyle=frame===2?'#eee3cf':scheme.dark;c.textAlign='center';c.font='bold 15px monospace';c.fillText(scheme.mark,px(0),pz(1.4));
  texture.needsUpdate=true;
  const mat=coat(0xffffff,.44,.31,{map:texture});mat.userData.paintProjection=true;return mat;
}
function palette(frame){
  const scheme=schemes[frame],signal=frame===1?0xfcc36c:0xa1ffff;
  return {paint:paintedSkin(frame),trim:coat(scheme.accent,.38,.38),light:coat(scheme.base,.42,.34),
    dark:coat(0x22323b,.42,.60),carbon:coat(0x161f29,.78,.20),metal:coat(0x929b99,.34,.79),
    alloy:coat(0x54666d,.29,.77),gasket:coat(0x182830,.72,.12),glass:coat(frame===2?0x2e597c:0x285962,.15,.79),
    glow:lamp(signal),amber:lamp(0xffb578),red:lamp(0xfa7858),cargo:coat(0xc28845,.57,.40)};
}
function cockpit(g,m,{z,w,h,base,length}){
  const sections=[[-.5,.05,.03],[-.43,.49,.23],[-.25,.90,.76],[.06,1,1],[.32,.83,.85],[.5,.34,.20]];
  const curve=(scale,drop)=>sections.map(([f,r,k])=>[z+f*length,w*r*scale,h*k*scale,base+drop+h*k*.16]);
  loft(g,curve(1.13,-.07),m.gasket,26,.86);
  loft(g,curve(1,0),m.glass,28,.85);
  for(const index of [2,4]){
    const [f,r,k]=sections[index],y=base+h*k*.16;
    const points=[];
    for(let n=0;n<=12;n++){const a=Math.PI*n/12;points.push([w*r*Math.cos(a),y+h*k*Math.sin(a)+.012,z+f*length]);}
    pathTube(g,points,.027,m.alloy);
  }
  for(const s of [-1,1]){
    const rail=sections.map(([f,r,k])=>[s*w*r*1.04,base+h*k*.16+.02,z+f*length]);
    pathTube(g,rail,.037,m.light);
  }
}
function nozzle(g,x,y,z,r,m){
  const metal=m.alloy,axisZ=(from,to,a,b,mat)=>rod(g,[x,y,from],[x,y,to],a,mat,b,32);
  axisZ(z-.40*r,z-.21*r,r*.82,r*1.05,metal);
  axisZ(z-.21*r,z+.07*r,r*1.05,r*.96,m.dark);
  band(g,x,y,z-.16*r,r*1.01,r*.058,m.metal);
  for(let i=0;i<16;i++){
    const a=i*Math.PI/8;
    const cheek=box(g,r*.16,r*.13,r*.43,metal,x+Math.sin(a)*r*.90,y+Math.cos(a)*r*.90,z+.04*r);
    cheek.rotation.z=-a;
  }
  // Inset iris, lip and bright inner throat retain depth even at flight distance.
  axisZ(z+.07*r,z+.10*r,r*.79,r*.79,m.gasket);
  band(g,x,y,z+.11*r,r*.69,r*.075,m.trim);
  axisZ(z+.11*r,z+.13*r,r*.59,r*.59,m.dark);
  band(g,x,y,z+.15*r,r*.47,r*.087,m.glow);
  axisZ(z+.16*r,z+.18*r,r*.28,r*.28,m.glow);
  for(let i=0;i<7;i++){
    const a=i*Math.PI*2/7;
    rod(g,[x+Math.cos(a)*r*.2,y+Math.sin(a)*r*.2,z+.19*r],
      [x+Math.cos(a+.20)*r*.51,y+Math.sin(a+.20)*r*.51,z+.18*r],r*.029,m.dark);
  }
}
function nacelle(g,x,y,front,back,r,m,slab=false){
  const len=back-front;
  loft(g,[[front,r*.81,r*.72,y],[front+.13,r,r*.90,y],[front+len*.23,r*1.07,r,y+.035],
    [front+len*.63,r,r*.96,y+.04],[back-.28,r*.79,r*.83,y],[back-.11,r*.72,r*.72,y]],m.paint,24,slab?.55:.86,x);
  rod(g,[x,y,front-.035],[x,y,front+.018],r*.76,m.carbon,r*.76,24);
  band(g,x,y,front-.04,r*.70,r*.049,m.alloy,28);
  for(let i=0;i<5;i++)rod(g,[x-r*.58,y+(i-2)*r*.20,front-.065],[x+r*.58,y+(i-2)*r*.20,front-.065],.022,m.alloy);
  const nose=sph(g,x,y,front-.08,r*.18,r*.18,r*.16,m.trim);
  for(let j=0;j<6;j++){
    const rad=r*(.94-j*.025),zz=back-.49-j*.098;
    const part=box(g,rad*.87,.048,.073,m.carbon,x,y+rad*.98,zz);part.rotation.x=-.08;
  }
  for(const side of [-1,1])pathTube(g,[[x+side*r*.75,y-r*.21,back-.70],[x+side*r*.89,y-r*.30,back-.28],[x+side*r*.70,y-r*.48,back-.11]],.041,m.metal);
  nozzle(g,x,y,back,r*.85,m);
}
function fin(g,x,y,z,height,length,side,m,sweep=.48){
  const o=new T.Group();g.add(o);o.position.set(x,y,z);
  foil(o,[[0,-length*.54,length*.50,0,.14],[height*.36,-length*.36,length*.45,0,.108],
    [height*.90,length*sweep,length*.65,0,.065],[height,length*.60,length*.69,0,.035]],m.paint,1);
  o.rotation.z=side===1?1.22:1.92;
  const cap=box(o,height*.25,.055,.095,m.trim,height*.81,.047,length*.53);
  cap.rotation.y=-.28;
}
function landingGear(g,x,z,y,m){
  if(!g.userData.landed)return;
  const foot=y-.76;
  rod(g,[x,y,z],[x*1.12,foot+.20,z+.16],.060,m.metal,.078);
  rod(g,[x*.93,y+.02,z+.4],[x*1.12,foot+.20,z+.16],.044,m.dark);
  fairing(g,x*1.12,foot+.11,z+.18,.31,.19,.54,m.carbon);
}
function swift(g,m){
  loft(g,[[-4.35,.045,.035,-.13],[-4.02,.23,.14,-.13],[-3.40,.43,.25,-.11],[-2.43,.65,.36,-.08],
    [-1.23,.86,.43,-.04],[-.10,1.03,.54,-.025],[1.10,1.00,.48,-.03],[2.03,.75,.35,-.01],[2.53,.43,.23,.02]],m.paint,32,.76);
  loft(g,[[-3.60,.10,.05,-.22],[-2.40,.47,.19,-.28],[-.62,.83,.28,-.31],[1.42,.83,.22,-.3],[2.37,.30,.14,-.20]],m.dark,24,.64);
  cockpit(g,m,{z:-1.63,w:.54,h:.47,base:.22,length:2.02});
  for(const s of [-1,1]){
    foil(g,[[.48,-1.93,1.70,-.12,.30],[1.10,-1.56,2.0,-.07,.38],[1.71,-.86,1.82,-.02,.27],
      [2.92,.65,1.83,.02,.16],[3.56,1.13,1.66,.10,.065],[3.70,1.43,1.58,.13,.02]],m.paint,s);
    foil(g,[[.38,-2.96,-1.80,-.06,.10],[.88,-2.36,-1.78,-.09,.08],[1.19,-1.98,-1.80,-.03,.02]],m.light,s);
    nacelle(g,s*1.26,.13,-.97,2.58,.49,m);
    fin(g,s*1.21,.46,1.45,1.12,1.65,s,m,.43);
    rod(g,[s*.82,.39,.22],[s*.73,.41,1.71],.042,m.metal);
    sph(g,s*3.51,.16,1.47,.125,.06,.22,s>0?m.glow:m.red);
    landingGear(g,s*.88,1.00,-.38,m);
  }
  landingGear(g,0,-2.0,-.28,m);
}
function canister(g,x,y,z,m,length=1.72){
  fairing(g,x,y,z,.86,.68,length,m.cargo);
  for(const off of [-.35,.36]){
    const pos=z+off*length;
    fairing(g,x,y,pos,.88,.707,.11,m.dark);
    rod(g,[x-.28,y+.38,pos],[x+.28,y+.38,pos],.030,m.metal);
  }
  box(g,.36,.022,.27,m.carbon,x,y+.35,z);
  for(const s of [-1,1])box(g,.03,.29,length*.39,m.trim,x+s*.431,y,z);
}
function manta(g,m){
  loft(g,[[-3.71,.49,.25,-.08],[-3.47,.91,.42,-.01],[-2.88,1.15,.57,.07],
    [-2.16,1.22,.67,.10],[-1.41,1.11,.60,.10],[.16,.92,.45,.02],[2.33,.89,.45,.01],[3.0,.60,.35,.03]],m.paint,24,.48);
  loft(g,[[-3.76,.42,.12,-.20],[-3.27,1.06,.25,-.25],[-1.95,1.17,.27,-.29],[1.8,.84,.30,-.31],[2.80,.61,.21,-.22]],m.dark,20,.43);
  cockpit(g,m,{z:-2.85,w:.90,h:.43,base:.31,length:1.38});
  for(const s of [-1,1]){
    // Two full-size cargo gondolas are suspended between fore and aft bridges.
    foil(g,[[.65,-2.07,-.78,-.05,.30],[1.68,-1.95,-1.17,-.02,.29],[2.72,-1.59,-1.01,.02,.18],[3.08,-1.38,-1.12,.04,.08]],m.paint,s);
    foil(g,[[.61,1.31,2.84,-.11,.31],[2.0,1.47,2.75,-.07,.32],[2.79,1.62,2.58,.01,.18],[3.11,1.82,2.22,.05,.07]],m.paint,s);
    nacelle(g,s*2.48,-.01,-1.68,2.68,.58,m,true);
    for(const pos of [-.64,1.00])canister(g,s*1.48,.13,pos,m,1.42);
    rod(g,[s*1.01,.56,-1.42],[s*1.05,.56,2.12],.073,m.metal);
    for(let j=0;j<4;j++)rod(g,[s*1.02,.50,-1.02+j*.75],[s*1.99,.49,-.77+j*.75],.050,m.dark,.050);
    fin(g,s*2.47,.47,1.95,.76,1.28,s,m,.36);
    landingGear(g,s*2.05,-1.19,-.30,m);landingGear(g,s*2.05,1.54,-.30,m);
  }
  fairing(g,0,.64,.40,1.17,.48,2.57,m.dark);
  for(let i=0;i<9;i++)box(g,1.15,.086,.095,m.alloy,0,.91,-.58+i*.238);
  fairing(g,0,.73,2.02,1.32,.43,.66,m.paint);
}
function kestrel(g,m){
  loft(g,[[-4.72,.033,.025,-.15],[-4.12,.23,.13,-.12],[-2.76,.48,.27,-.10],[-1.54,.72,.35,-.08],
    [-.51,.93,.44,-.04],[.48,1.06,.52,0],[1.50,.87,.58,.03],[2.61,.59,.46,.01]],m.paint,28,.56);
  loft(g,[[-3.82,.13,.045,-.18],[-1.61,.63,.18,-.30],[.65,1.01,.25,-.28],[2.77,.55,.21,-.22]],m.dark,22,.52);
  cockpit(g,m,{z:-1.3,w:.47,h:.42,base:.18,length:2.1});
  nozzle(g,0,.03,2.85,.66,m);
  for(const s of [-1,1]){
    foil(g,[[.45,-2.12,1.63,-.11,.28],[.91,-1.57,2.12,-.08,.30],[1.60,-.34,2.46,-.02,.23],
      [2.30,.70,2.66,.04,.15],[3.24,2.24,2.98,.13,.10],[3.43,2.62,2.90,.18,.03]],m.paint,s);
    // Forward pincer with a strip of open space between blade and lifting body.
    foil(g,[[.58,-1.46,-.20,-.17,.13],[1.05,-2.33,-.45,-.12,.19],[1.44,-3.07,-.75,-.08,.11],
      [1.55,-3.52,-2.27,-.02,.036]],m.paint,s);
    nacelle(g,s*1.10,.23,.06,2.43,.37,m);
    fin(g,s*.77,.43,1.39,1.32,1.62,s,m,.47);
    for(let i=0;i<5;i++)box(g,.26,.052,.11,m.metal,s*1.60,.19,.79+i*.17);
    sph(g,s*1.50,.055,-3.08,.067,.048,.18,m.glow);
    landingGear(g,s*.77,1.05,-.39,m);
  }
  landingGear(g,0,-2.05,-.26,m);
}
function attachments(g,p,m){
  const placement=p.frame===1?{x:2.38,z:0,y:.58}:{x:1.50,z:.15,y:.25};
  for(const id of p.fit){
    if(id===0)for(const s of [-1,1]){
      const x=s*(p.frame===1?2.60:1.78);
      canister(g,x,-.31,.04,m,p.frame===1?2.30:1.64);
      for(const dz of [-.51,.52])rod(g,[x*.78,.13,dz],[x,-.40,dz],.065,m.alloy);
    }
    if(id===1)for(const s of [-1,1]){
      const x=s*(p.frame===1?2.48:1.57),y=placement.y+.19;
      fairing(g,x,y,placement.z,.39,.37,.95,m.dark);
      rod(g,[x,y,-.22],[x,y,-1.65],.13,m.alloy,.095,12);
      band(g,x,y,-1.62,.1,.027,m.glow,16);
      box(g,.22,.06,.36,m.trim,x,y+.19,.14);
    }
    if(id===2)for(const s of [-1,1]){
      const x=s*(p.frame===1?2.99:2.16);
      nacelle(g,x,.13,.75,1.94,.24,m);
    }
    if(id===3){
      fairing(g,0,.54,1.67,.87,.34,.98,m.dark);
      for(let j=0;j<3;j++){
        rod(g,[-.32,.77,1.42+j*.22],[.32,.77,1.42+j*.22],.085,m.glow,.085,12);
        for(const x of [-.33,.33])sph(g,x,.77,1.42+j*.22,.09,.105,.095,m.metal);
      }
    }
    if(id===4){
      const pos=p.frame===1?1.75:1.36;
      rod(g,[0,.42,pos],[0,1.06,pos],.113,m.dark,.085);
      const dish=new T.Group();g.add(dish);dish.position.set(0,1.12,pos);dish.rotation.x=-.58;dish.rotation.y=.34;
      const geo=new T.LatheGeometry([new T.Vector2(.03,-.18),new T.Vector2(.22,-.13),new T.Vector2(.44,-.04),new T.Vector2(.62,.12)],24);
      const parabola=mesh(dish,geo,m.alloy);m.alloy.side=T.DoubleSide;
      const lip=band(dish,0,.12,0,.62,.028,m.light);lip.rotation.x=Math.PI/2;
      for(let i=0;i<3;i++){const a=i*2.094;rod(dish,[Math.sin(a)*.57,.09,Math.cos(a)*.57],[0,.42,0],.021,m.metal);}
      sph(dish,0,.44,0,.06,.085,.06,m.glow);
    }
  }
}
export function vessel(p,landed=false){
  const g=new T.Group(),m=palette(p.frame);
  g.userData.landed=landed;
  [swift,manta,kestrel][p.frame](g,m);attachments(g,p,m);return finish(g);
}
export function sentry(){
  const g=new T.Group(),dark=coat(0x332a40,.39,.62),armor=coat(0x944434,.40,.52),edge=coat(0xe19b71,.33,.68),
    eye=lamp(0xff7060),iris=lamp(0xffd7a1),shadow=coat(0x1b1e2b,.48,.43);
  sph(g,0,0,0,.65,.55,.72,dark);
  for(const front of [-1,1]){
    const z=front*.63;band(g,0,0,z,.31,.10,armor,24);band(g,0,0,z+front*.07,.22,.065,eye,24);
    sph(g,0,0,z+front*.10,.13,.13,.075,iris);
  }
  for(let i=0;i<3;i++){
    const arm=new T.Group();g.add(arm);arm.rotation.z=i*2*Math.PI/3+.2;
    pathTube(arm,[[.36,0,.20],[.88,.17,.07],[1.18,.31,-.10]],.095,edge);
    loft(arm,[[-1.25,.03,.04,.29],[-.93,.17,.16,.31],[-.36,.30,.23,.30],[.31,.35,.22,.22],[.66,.22,.18,.19],[.90,.06,.06,.14]],armor,14,.63,1.17);
    band(arm,1.17,.20,.68,.17,.043,eye,18);
    box(arm,.14,.25,.36,shadow,1.16,.46,-.28);
    rod(arm,[1.17,.29,-1.25],[1.17,.29,-1.39],.044,eye);
  }
  g.scale.setScalar(1.12);return finish(g);
}
