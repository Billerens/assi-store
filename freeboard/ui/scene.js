import * as T from '../vendor/three-0.160.0/three.module.js';
import * as Art from './art.js';
import {studioReflection,dockShadow} from './model-kit.js';
import {orbitalStation,serviceBerth,wake,harborShuttle} from './orbital-models.js';
import {bridgeDeck} from './bridge-model.js';
import {HELM,createWalker} from './ship-interior.js';

const harborYaw=.88, up=new T.Vector3(0,1,0);
const ports=[
  {planet:[18,5,-153,28],station:[-20,2,-45,.76],traffic:0},
  {planet:[-17,7,-155,32],station:[19,.8,-48,.75],traffic:1.8},
  {planet:[14,-3,-149,25],station:[-23,3,-51,.83],traffic:3.5}
];

function dispose(group){
  const geometries=new Set(),materials=new Set(),textures=new Set();
  group.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)for(const m of [].concat(o.material)){materials.add(m);if(m.map)textures.add(m.map);}});
  geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());
}
export class Scene {
  constructor(canvas){
    this.canvas=canvas;this.renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'low-power'});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.65));
    this.renderer.outputColorSpace=T.SRGBColorSpace;
    this.camera=new T.PerspectiveCamera(55,1,.15,1150);
    this.scene=new T.Scene();this.scene.background=new T.Color(0x111a2a);
    this.scene.environment=studioReflection();
    this.hemi=new T.HemisphereLight(0xdcecf9,0x725448,1.05);this.scene.add(this.hemi);
    const key=new T.DirectionalLight(0xffe6c8,2.65);key.position.set(-18,29,14);this.scene.add(key);
    const fill=new T.DirectionalLight(0x8dd3fb,1.25);fill.position.set(16,9,-21);this.scene.add(fill);
    this.stars=Art.firmament();this.scene.add(this.stars);this.sky=Art.deepSky();this.scene.add(this.sky);
    this.root=new T.Group();this.scene.add(this.root);this.signature='';
    this.vec=new T.Vector3();this.camAt=new T.Vector3();this.look=new T.Vector3();this.dynamic=new Map();
    this.offset=new T.Vector3();this.personUp=new T.Vector3();this.defaultWalker=createWalker();
    this.width=0;this.height=0;this.reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.snap=true;
  }
  reset(){
    this.scene.remove(this.root);dispose(this.root);this.root=new T.Group();this.scene.add(this.root);
    this.dynamic=new Map();this.ship=null;this.outpost=null;this.hero=null;this.exhaust=null;this.harbor=null;this.traffic=[];
    this.interior=null;this.bridge=null;this.cabin=null;
    this.nodeModels=[];this.enemies=[];this.gates=[];this.snap=true;
  }
  add(o,x=0,y=0,z=0,scale=1){
    o.position.set(x,y,z);o.scale.multiplyScalar(scale);this.root.add(o);return o;
  }
  buildHarbor(port){
    const layout=ports[port];
    this.harbor=new T.Group();this.harbor.rotation.y=harborYaw;this.root.add(this.harbor);
    const place=(o,v)=>{o.position.set(v[0],v[1],v[2]);o.scale.setScalar(v[3]||1);this.harbor.add(o);return o;};
    this.orb=place(Art.planet(port),layout.planet);
    this.outpost=place(orbitalStation(),layout.station);this.outpost.rotation.set(-.08,.47,.20);
    this.traffic=[0,1].map((k)=>place(harborShuttle((port+k)%3),[0,0,0,k?.61:.86]));
  }
  moveHarbor(port,t){
    const phase=ports[port].traffic;
    this.outpost.rotation.y=.48+Math.sin(t*.09+phase)*.14;
    this.traffic.forEach((ship,k)=>{
      const a=t*(k?.076:.122)+phase+(k?2.1:-.7);
      const dx=Math.cos(a)*(k?31:20),dz=Math.sin(a)*3.8;
      ship.position.set(Math.sin(a)*(k?31:20),k?4.8+Math.sin(a*.84):1.9+Math.cos(a*.80)*1.3,
        (k?-40:-24)-Math.cos(a)*3.8);
      ship.rotation.set(.03*Math.sin(a),Math.atan2(-dx,-dz),.08*Math.sin(a));
    });
  }
  ring(radius,color){
    const g=new T.Group(),m=Art.material(color,true);
    Art.solid(g,new T.TorusGeometry(radius,.14,5,42),m);
    for(let i=0;i<4;i++){const a=i*Math.PI/2;const b=Art.box(g,Math.sin(a)*radius,Math.cos(a)*radius,0,.9,.7,1,Art.material(0x8f9b96));b.rotation.z=-a;}
    return g;
  }
  build(p,view){
    this.reset();this.view=view;
    const f=p.flight,inside=view==='insideDock'||view==='insideSpace',space=view==='space'||view==='insideSpace',land=view==='surface',port=f?f.dest:p.port;
    const colors=[0x1d1a2f,0x102536,0x271e33];
    this.scene.background.setHex(land?[0x927b80,0x76a1ac,0xb29282][port]:colors[port]);
    this.scene.fog=land?new T.FogExp2(this.scene.background,.011):new T.FogExp2(this.scene.background,.001);
    this.stars.visible=!land;this.sky.visible=!land;
    if(space)this.orb=this.add(Art.planet(port),110,70,-365,74);
    else if(land)this.orb=this.add(Art.planet((port+1)%3),-64,49,-117,20);
    else this.buildHarbor(port);
    if(inside){
      this.interior=this.add(new T.Group());this.cabin=Art.cabin(p,true);this.bridge=bridgeDeck(p,this.translate);
      this.interior.add(this.cabin,this.bridge);this.interior.rotation.order='YXZ';
      if(!space){this.interior.rotation.y=harborYaw;return;}
    }
    if(view==='cabin'){this.cabin=this.add(Art.cabin(p));this.cabin.rotation.y=harborYaw;return;}
    if(view==='dock'){
      this.ship=this.add(Art.ship(p,true),0,1,0);
      this.ship.rotation.y=Math.PI+.07;
      this.add(serviceBerth(),0,-.16,0);
      this.add(dockShadow(),0,-.12,0);
      return;
    }
    if(land){
      this.add(Art.terrain(port));this.ship=this.add(Art.ship(p,true),0,.93,1.2,.85);
      this.hero=this.add(Art.walker());this.nodeModels=f.nodes.map(n=>this.add(Art.crystal(port),n.x,Art.terrainHeight(n.x,n.z,port),n.z));
      return;
    }
    if(!inside){this.ship=this.add(Art.ship(p));this.exhaust=wake(p);this.ship.add(this.exhaust);}
    this.outpost=this.add(orbitalStation(),f.goal.x,f.goal.y,f.goal.z-19,1.55);
    this.entry=this.add(this.ring(f.mode===2?12:15,0x9ce8e2),f.goal.x,f.goal.y,f.goal.z);
    this.gates=f.gates.map(g=>this.add(this.ring(8.5,0xe6ab77),g.x,g.y,g.z));
    this.enemies=f.enemies.map(()=>this.add(Art.sentry()));
    f.rocks.forEach((r,i)=>{const rock=this.add(Art.meteor(r.r,i+f.seed),r.x,r.y,r.z);rock.rotation.set(r.phase,r.phase*.4,.8);});
  }
  entities(f){
    const now=new Set();
    const update=(arr,fx)=>arr.forEach(o=>{
      now.add(o);
      let m=this.dynamic.get(o);
      if(!m){
        const tint=fx?(o.color==='enemy'?0xff8e7d:0x97efd7):(o.enemy?0xff8c83:0x9bf5ff);
        const geo=fx?new T.IcosahedronGeometry(1,0):new T.SphereGeometry(.25,6,4);
        const mat=Art.material(tint,true);if(fx){mat.transparent=true;mat.wireframe=true;}
        m=Art.solid(this.root,geo,mat);this.dynamic.set(o,m);
      }
      m.position.set(o.x,o.y+(f.phase==='surface'?1:0),o.z);
      if(fx){m.scale.setScalar(.3+(0.52-o.life)*12);m.material.opacity=Math.max(.03,o.life*1.8);}
      else{m.scale.set(1,1,5);m.lookAt(o.x+o.dx,o.y+o.dy,o.z+o.dz);}
    });
    update(f.bolts,false);update(f.flashes,true);
    this.dynamic.forEach((m,o)=>{if(!now.has(o)){this.root.remove(m);dispose(m);this.dynamic.delete(o);}});
  }
  spaceTraffic(f,time){
    this.entry.rotation.z=time*.12;this.outpost.rotation.y=.10*Math.sin(time*.12);
    this.gates.forEach((g,i)=>{g.visible=!f.gates[i].passed;});
    this.enemies.forEach((o,i)=>{const e=f.enemies[i];o.visible=e.hp>0;o.position.set(e.x,e.y,e.z);
      o.rotation.set(.07*Math.sin(time),Math.atan2(e.x-f.x,e.z-f.z),.25*Math.sin(time+e.phase));});
    this.entities(f);
  }
  firstPerson(view,f,time){
    const seated=view.mode==='pilot', eye=seated?HELM:(view.walker||this.defaultWalker),
      yaw=seated?(view.lookYaw||0):(eye.yaw||0),pitch=seated?(view.lookPitch||0):(eye.pitch||0);
    if(f){
      this.interior.rotation.set(f.pitch,-f.yaw,(view.bank||0)*-.068,'YXZ');
      this.offset.set(HELM.x,HELM.y,HELM.z).applyQuaternion(this.interior.quaternion);
      this.interior.position.set(f.x,f.y,f.z).sub(this.offset);
      this.spaceTraffic(f,time);
    }
    this.bridge.userData.updateAvionics(f,time);
    this.camAt.set(eye.x,eye.y,eye.z).applyQuaternion(this.interior.quaternion).add(this.interior.position);
    this.look.set(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch))
      .applyQuaternion(this.interior.quaternion).add(this.camAt);
    this.personUp.copy(up).applyQuaternion(this.interior.quaternion);this.camera.up.copy(this.personUp);
  }
  draw(p,tab,time,dt,cabinView={}){
    const f=p.flight;
    const inside=f?.phase!=='surface'&&(cabinView.mode==='walk'||cabinView.mode==='pilot');
    const view=inside?(f?'insideSpace':'insideDock'):(f?f.phase:tab==='quarters'?'cabin':'dock');
    this.translate=cabinView.translate;
    const signature=[view,p.port,f?f.seed:0,p.frame,p.fit.join('.'),p.bunks,p.cabin,p.cabinMount||'desk',Boolean(p.stats.samples),p.crew.join('.'),document.documentElement.lang].join(':');
    if(signature!==this.signature){this.signature=signature;this.build(p,view);}
    const w=this.canvas.clientWidth||1,h=this.canvas.clientHeight||1;
    if(w!==this.width||h!==this.height||inside!==this.inside){this.width=w;this.height=h;this.inside=inside;this.camera.aspect=w/h;
      this.camera.fov=inside?Math.max(71,Math.min(96,2*Math.atan(Math.tan(.46)/this.camera.aspect)*180/Math.PI)):Math.max(55,2*Math.atan(Math.tan(.32)/this.camera.aspect)*180/Math.PI);
      this.camera.near=inside?.05:.15;
      this.camera.updateProjectionMatrix();this.renderer.setSize(w,h,false);}
    const portrait=w<h,slim=w/h<.74;
    const sidePanel=view==='cabin'&&(!cabinView||cabinView.focus==='overview')&&w>=750&&h>=480;
    const lensKey=[w,h,sidePanel].join(':');
    if(lensKey!==this.lensKey){
      this.lensKey=lensKey;
      if(sidePanel)this.camera.setViewOffset(w,h,Math.round(w*.16),0,w,h);else this.camera.clearViewOffset();
    }
    if(Art.animatePlanet)Art.animatePlanet(this.orb,time);
    if(this.harbor)this.moveHarbor(p.port,time);
    this.camera.up.copy(up);
    if(inside){this.firstPerson(cabinView,f,time);}
    else if(view==='dock'){
      const a=this.reduced?.88:.88+Math.sin(time*.10)*.13;
      const distance=slim?13.9:11.9;
      this.camAt.set(Math.sin(a)*distance,5.5,Math.cos(a)*distance);
      this.look.set(0,portrait?-2.05:-.5,0);
    } else if(view==='cabin'){
      const v=cabinView||{}, key=v.focus||'overview';
      this.cabin.userData.aftWall.visible=key!=='overview';
      if(key==='window'){
        this.camAt.set(portrait?.05:.15,2.16,-.86);
        this.look.set(.08,2.13,-4.92);
      }else if(key==='berth'){
        this.camAt.set(.48,2.24,-.62);this.look.set(-2.38,1.06,1.68);
      }else if(key==='desk'){
        this.camAt.set(1.9,1.87,.55);this.look.set(-.27,1.28,-2.35);
      }else{
        this.camAt.set(portrait?.42:2.60,portrait?2.57:2.43,4.92);
        this.look.set(portrait?-.65:-.76,portrait?1.36:1.47,-2.63);
      }
      this.look.sub(this.camAt).applyAxisAngle(up,v.yaw||0);this.look.y+=v.pitch||0;this.look.add(this.camAt);
      this.camAt.applyAxisAngle(up,harborYaw);this.look.applyAxisAngle(up,harborYaw);
    } else if(view==='surface'){
      this.hero.position.set(f.x,Art.terrainHeight(f.x,f.z,f.dest),f.z);this.hero.rotation.y=-f.yaw;
      const descent=(f.landing||0)/1.35;
      this.camAt.set(f.x,5.1+descent*7.5,f.z+10+descent*5);
      this.look.set(f.x,1.4,f.z-3.3);
      this.nodeModels.forEach((n,i)=>{n.visible=!f.nodes[i].taken;n.rotation.y=i*1.7;});this.entities(f);
    } else {
      const d=window.FreeFlight.heading(f.yaw,f.pitch);
      this.ship.position.set(f.x,f.y,f.z);this.ship.rotation.order='YXZ';this.ship.rotation.set(f.pitch,-f.yaw,0,'YXZ');
      this.camAt.set(f.x-d.x*10.5,f.y-d.y*10.5+3.65,f.z-d.z*10.5);
      this.look.set(f.x+d.x*10,f.y+d.y*10+1.25,f.z+d.z*10);
      this.exhaust.children.forEach((jet,i)=>{jet.scale.z=jet.userData.radius*(1.5+Math.min(1.6,f.speed/26)*3+.12*Math.sin(time*22+i));});
      this.spaceTraffic(f,time);
    }
    const k=inside||this.snap||this.reduced?1:1-Math.exp(-dt*12);this.camera.position.lerp(this.camAt,k);
    if(this.snap)this.focus=this.look.clone();else this.focus.lerp(this.look,k);
    this.snap=false;this.camera.lookAt(this.focus);this.stars.position.copy(this.camera.position);this.sky.position.copy(this.camera.position);
    this.renderer.render(this.scene,this.camera);
  }
  project(target){
    this.vec.set(target.x,target.y+(this.view==='surface'?1.5:0),target.z).project(this.camera);
    const back=this.vec.z>1;
    return {x:back?.5+(this.vec.x>0?-.4:.4):this.vec.x*.5+.5,y:back?.5: .5-this.vec.y*.5,back};
  }
}
