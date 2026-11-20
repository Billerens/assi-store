import * as THREE from '../vendor/three.module.js';
import {ModelPass} from './model-pass.js';
import {poseRider} from './rider-model.js';
import {paintSky} from './deck-art.js';

const R = window.TideRace;
const LANE = 2.06;
const colors = {
  ink: '#233743', steel: '#446479', pearl: '#fff2d7', teal: '#159e99', foam: '#b9ffe6',
  orange: '#f6804f', yellow: '#ffcb64', plank: '#c99e77', darkWood: '#815c52'
};
const districts = [
  ['#c86754','#e5ad73','#508a96','#edc995'], ['#546e80','#ca704f','#879989','#bd9c81'],
  ['#bf7959','#536f80','#d6a268','#c68e64'], ['#779f9b','#43768a','#d59b72','#c8ac86']
];
const clamp = (n, a, b) => Math.min(b, Math.max(a,n));
const mix = (a,b,t) => a+(b-a)*t;
const C = colors;

class GeometryPass {
  constructor(canvas, fallback) {
    this.canvas = canvas; this.fallback = fallback;
    this.camera = new THREE.PerspectiveCamera(57, 1, .25, 220);
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2('#acd4ce', .0081);
    this.transforms = new THREE.Object3D();
    this.tint = new THREE.Color();
    this.v = new THREE.Vector3();
    this.mats = {};
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
    } catch (error) {
      canvas.hidden = true; fallback.hidden = false;
      this.flat = fallback.getContext('2d'); this.shapes = [];
    }
    this.scene.add(new THREE.HemisphereLight('#fff3d5','#9bb3bd', 1.46));
    const sun = new THREE.DirectionalLight('#ffe6bd', 1.66); sun.position.set(-12,16,8); this.scene.add(sun);
    this.models=new ModelPass(this);
    if (!this.renderer) return;
    this.renderer.setClearColor(0x000000, 0);
    const stamp=document.createElement('canvas');stamp.width=stamp.height=64;
    const ctx=stamp.getContext('2d'),grad=ctx.createRadialGradient(32,32,1,32,32,31);
    grad.addColorStop(0,'rgba(49,38,26,0.47)');grad.addColorStop(.54,'rgba(53,40,30,0.30)');grad.addColorStop(1,'rgba(71,50,31,0)');
    ctx.fillStyle=grad;ctx.fillRect(0,0,64,64);
    this.shadow=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({
      map:new THREE.CanvasTexture(stamp),transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2
    }));
    this.shadow.rotation.x=-Math.PI/2;this.scene.add(this.shadow);
    const meshTypes = {box:new THREE.BoxGeometry(1,1,1), round:new THREE.CylinderGeometry(.5,.5,1,10),
      ball:new THREE.SphereGeometry(.5,9,6), roof:new THREE.ConeGeometry(.66,1,4)};
    for (const [kind,geometry] of Object.entries(meshTypes)) {
      for (const ghost of [false,true]) {
        const material = new THREE.MeshLambertMaterial({color:0xffffff, transparent:ghost, opacity:ghost?.41:1, depthWrite:!ghost});
        const mesh = new THREE.InstancedMesh(geometry,material,ghost?45:1900);
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.count = 0; mesh.frustumCulled = false; this.scene.add(mesh);
        this.mats[kind+(ghost?'g':'')] = mesh;
      }
    }
    const buffer = new THREE.BufferGeometry();
    this.wavePos = new Float32Array(12500*3);
    this.waveCol = new Float32Array(12500*3);
    buffer.setAttribute('position',new THREE.BufferAttribute(this.wavePos,3).setUsage(THREE.DynamicDrawUsage));
    buffer.setAttribute('color',new THREE.BufferAttribute(this.waveCol,3).setUsage(THREE.DynamicDrawUsage));
    const surface=new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.DoubleSide});
    this.ripple={clock:{value:0},station:{value:0}};
    surface.onBeforeCompile=shader=>{
      shader.uniforms.tideClock=this.ripple.clock;shader.uniforms.tideStation=this.ripple.station;
      shader.vertexShader='varying vec3 vSea;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvSea=position;');
      shader.fragmentShader='varying vec3 vSea;uniform float tideClock;uniform float tideStation;\n'+shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
        vec2 w=vec2(vSea.x,vSea.z-tideStation);
        float a=sin(w.y*2.1+w.x*.63+tideClock*1.52+1.3*sin(w.x*1.16+w.y*.32));
        float crossWave=sin(w.x*3.7-w.y*.41-tideClock*.96);
        float fleck=.55+.45*sin(w.x*2.65+w.y*4.1+1.8*sin(w.x*1.2-w.y*.7));
        float lace=smoothstep(.87,1.0,a)*smoothstep(-.12,.67,crossWave)*fleck;
        float haze=1.-smoothstep(18.,98.,-vSea.z);
        diffuseColor.rgb+=vec3(.012,.028,.026)*a*haze;
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.72,.90,.74),lace*(.10+.12*smoothstep(.1,3.,vSea.y))*haze);
      `);
    };
    this.water = new THREE.Mesh(buffer,surface);
    this.water.frustumCulled = false; this.scene.add(this.water);
  }
  resize(w,h) {
    this.w=w; this.h=h;
    this.camera.aspect=w/h;
    this.camera.fov=clamp(57 + (0.55-w/h)*35, 48, 67); this.camera.updateProjectionMatrix();
    const dpr=Math.min(window.devicePixelRatio||1,1.65);
    if(this.renderer) { this.renderer.setPixelRatio(dpr); this.renderer.setSize(w,h,false); }
    else {this.fallback.width=Math.round(w*dpr);this.fallback.height=Math.round(h*dpr);this.flat.setTransform(dpr,0,0,dpr,0,0);}
  }
  begin(px,py,wide,blend,view,d,time,r) {
    const camera=this.camera;
    // Centre the three riding lines on the wave as well as on the pier.
    const centre=6.95*blend;
    if(view==='home'){
      camera.position.set(wide?-3.05:-2.43,2.12,wide?4.18:4.52);camera.lookAt(.12,1.04,-.46);
    }else{
      const turn=r.lane-r.pos,step=R.stride(r)*Math.PI*2;
      const reduced=this.reduced??(this.reduced=matchMedia('(prefers-reduced-motion: reduce)').matches);
      const motion=reduced?0:1;
      const follow=(1-r.blend)*motion, pulse=r.surge>0?.25:0;
      camera.position.set(centre+(px-centre)*.54-.12*turn*motion+.026*Math.sin(step)*follow,
        4.03+py*.55+.025*Math.cos(step*2)*follow + R.height(r)*.085, (wide?7.52:7.79)+pulse);
      camera.lookAt(centre+(px-centre)*.28+.23*turn*motion, .98+py*.37, -14.8);
      camera.rotateZ(turn*.012*motion);
    }
    camera.updateMatrixWorld();
    if(this.renderer) {
      for(const mesh of Object.values(this.mats)) mesh.count=0;
      this.shadow.visible=false;
      this.vertex=0;
      this.ripple.clock.value=time;this.ripple.station.value=d;
    } else {this.shapes.length=0;this.flat.clearRect(0,0,this.w,this.h);}
    this.models.begin();
  }
  piece(kind,x,y,z,w,h,d,color,rx=0,ry=0,rz=0,ghost=false) {
    if(this.renderer) {
      const mesh=this.mats[kind+(ghost?'g':'')], index=mesh.count;
      if(index>=mesh.instanceMatrix.count) return;
      const obj=this.transforms;
      obj.position.set(x,y,z); obj.scale.set(w,h,d); obj.rotation.set(rx,ry,rz); obj.updateMatrix();
      mesh.setMatrixAt(index,obj.matrix); mesh.setColorAt(index,this.tint.set(color)); mesh.count++;
    } else this.shapes.push({kind,x,y,z,w,h,d,color,rx,ry,rz,ghost});
  }
  quad(a,b,c,d,color) {
    if(!this.renderer) {this.shapes.push({points:[a,b,c,d],z:(a[2]+b[2]+c[2]+d[2])/4,color:Array.isArray(color)?color[0]:color});return;}
    if(this.vertex+6>=this.wavePos.length/3) return;
    const points=[a,b,c,d],gradient=Array.isArray(color);
    if(!gradient)this.tint.set(color);
    for(const index of [0,1,2,0,2,3]) {
      const p=points[index],col=gradient?this.tint.set(color[index]):this.tint;
      const i=this.vertex++*3;
      this.wavePos.set(p,i);this.waveCol[i]=col.r;this.waveCol[i+1]=col.g;this.waveCol[i+2]=col.b;
    }
  }
  polygon(points,color,shade=1) {
    const ctx=this.flat, v=this.v;
    ctx.beginPath();
    for(let i=0;i<points.length;i++) {
      const p=points[i]; v.set(p[0],p[1],p[2]).project(this.camera);
      if(v.z>1||v.z< -1) return;
      const x=(v.x+1)*this.w/2,y=(1-v.y)*this.h/2;
      if(!i)ctx.moveTo(x,y);else ctx.lineTo(x,y);
    }
    ctx.closePath();ctx.fillStyle=shade===1?color:'#'+this.tint.set(color).multiplyScalar(shade).getHexString();ctx.fill();
  }
  end() {
    if(this.renderer) {
      for(const mesh of Object.values(this.mats)) {
        mesh.instanceMatrix.needsUpdate=true; if(mesh.instanceColor) mesh.instanceColor.needsUpdate=true;
      }
      this.water.geometry.attributes.position.needsUpdate=true;this.water.geometry.attributes.color.needsUpdate=true;
      this.water.geometry.setDrawRange(0,this.vertex);this.renderer.render(this.scene,this.camera);
      return;
    }
    this.shapes.sort((a,b)=>a.z-b.z);
    for(const s of this.shapes) {
      if(s.name){this.models.drawCanvas(s);continue;}
      if(s.points){this.polygon(s.points,s.color);continue;}
      const p=[];
      for(const z of [-.5,.5])for(const y of [-.5,.5])for(const x of [-.5,.5]) {
        const X=x*s.w,Y=y*s.h,Z=z*s.d, cy=Math.cos(s.ry),sy=Math.sin(s.ry);
        const u=X*cy+Z*sy, v=Y*Math.cos(s.rx)-(Z*cy-X*sy)*Math.sin(s.rx);
        p.push([s.x+u*Math.cos(s.rz)-v*Math.sin(s.rz),s.y+u*Math.sin(s.rz)+v*Math.cos(s.rz),s.z+Y*Math.sin(s.rx)+(Z*cy-X*sy)*Math.cos(s.rx)]);
      }
      this.flat.globalAlpha=s.ghost?.45:1;
      this.polygon([p[2],p[3],p[7],p[6]],s.color,1.08);
      this.polygon(this.camera.position.x<s.x?[p[0],p[4],p[6],p[2]]:[p[1],p[3],p[7],p[5]],s.color,.76);
      this.polygon([p[4],p[5],p[7],p[6]],s.color,.91);
      this.flat.globalAlpha=1;
    }
  }
}

export class Harbour {
  constructor(canvas,fallback) {this.g=new GeometryPass(canvas,fallback);this.resize();}
  resize(){this.g.resize(innerWidth,innerHeight);paintSky(innerWidth,innerHeight);}
  render(r,course,options={}) {
    this.r=r;this.c=course;this.d=r.d;this.far=117;this.seed=course.seed;this.preview=options.view==='home';
    this.palette=districts[R.district(r.d)];
    const pos=this.position(r);
    this.g.begin(pos.x,pos.y,innerWidth/innerHeight>.9,r.blend,options.view,r.d,r.tick/60,r);
    this.ocean();this.pier();this.harbour();
    for(let i=Math.max(0,Math.floor((this.d-15)/R.SPAN));i<=Math.floor((this.d+this.far)/R.SPAN);i++) {
      const block=R.block(course,i);
      for(const w of block.waves){
        if(w.end>this.d-12&&w.start<this.d+this.far)this.wave(w);
        if(w.linked&&w.start>this.d-7&&w.start-39<this.d+this.far)this.roofPath(w.start);
      }
      for(const e of block.events)if(e.z>this.d-7&&e.z<this.d+this.far)this.event(e);
    }
    if(options.marker>0&&options.marker-this.d<100&&options.marker>this.d-4)this.marker(options.marker);
    if(options.ghost&&!options.ghost.dead){
      const other=this.position(options.ghost);
      const separation=Math.hypot(other.x-pos.x,other.y+R.height(options.ghost)-pos.y-R.height(r),options.ghost.d-r.d);
      // Matching the replay exactly should leave the courier's own outfit legible.
      if(separation>.48)this.rider(options.ghost,true,options.ghostSkin||0,options.ghostOutfit||0);
    }
    this.rider(r,false,options.skin||0,options.outfit||0);
    this.g.end();
  }
  curve(at) {return 2.4*(Math.sin(at/83+(this.seed%7))-Math.sin(this.d/83+(this.seed%7)));}
  p(kind,x,y,at,w,h,d,col,rx=0,ry=0,rz=0,g=false) {
    this.g.piece(kind,x+this.curve(at),y,this.d-at,w,h,d,col,rx,ry,rz,g);
  }
  box(x,y,at,w,h,d,col,rx=0,ry=0,rz=0){this.p('box',x,y,at,w,h,d,col,rx,ry,rz);}
  asset(name,x,y,at,size=[1,1,1],yaw=0){
    this.g.models.add(name,x+this.curve(at),y,this.d-at,size,Array.isArray(yaw)?yaw:[0,yaw,0]);
  }
  world(x,y,at){return [x+this.curve(at),y,this.d-at];}
  quad(x1,y1,x2,y2,a,b,col) {
    this.g.quad(this.world(x1,y1,a),this.world(x2,y2,a),this.world(x2,y2,b),this.world(x1,y1,b),col);
  }
  ocean() {
    for(let i=Math.floor((this.d-10)/10);i<Math.ceil((this.d+153)/10);i++) {
      const z=i*10;
      this.quad(-105,-1.02,111,-1.02,z,z+10.06,'#539c9d');
      if(!this.g.renderer)for(let k=0;k<3;k++) {
        const x=11+(R.hash(this.seed,i*7+k)%36);
        this.box(x,-.98,z+2+k*2.8,1.6+(i+k)%3,.025,.13,'#a3dfcf');
      }
    }
  }
  pier() {
    for(let i=Math.floor((this.d-11)/4);i<Math.ceil((this.d+124)/4);i++) {
      const z=i*4;
      if(this.g.renderer)this.asset('pierDeck',0,0,z);
      else{
        this.box(0,-.18,z,7.65,.36,4.02,this.palette[3]);
        for(let j=0;j<5;j++)this.box(0,.007,z-1.65+j*.72,7.63,.025,.035,'#987459');
        for(const s of [-1,1])this.box(s*1.04,.027,z,.07,.014,1.2,C.pearl);
      }
      for(const side of [-1,1]) {
        this.box(side*3.58,-.42,z,.27,.39,4.04,'#806c58');
        this.box(side*3.33,-.68,z,.19,.25,4.04,'#625d52');
        if(i%3===0){
          this.box(side*3.64,-.1,z,.32,.43,.21,C.steel);
          this.box(side*3.70,.115,z,.23,.045,.24,'#b78858');
          this.p('round',side*3.47,-.81,z,.34,1.45,.34,'#695e51');
        }
      }
      if(i%4===0)this.asset('mooring',-3.47,-.008,z);
      if(i%5===2)this.asset('mooring',3.47,-.008,z);
    }
  }
  harbour(){
    for(let i=Math.floor((this.d-20)/13);i<Math.ceil((this.d+140)/13);i++){
      const z=i*13,roll=R.hash(this.seed,i+523),P=this.palette,h=3.4+(roll%45)/10;
      const wall=P[roll%3],x= -8.8-(roll%4)*.5;
      const zone=R.district(Math.max(0,z));
      if(zone===0||i%4===0){
        const style=roll%3, detail=z-this.d>46?'Far':'';
        this.asset('fishHall'+style+detail,-7.9-(roll%2)*.6,-.15,z,[1, .91+(roll%6)*.055,1.19],0);
        this.box(-5.47,-.26,z,3.24,.52,12.96,'#a78a61');
        if(i%2===0){
          this.p('round',-4.25,.26,z-3,.25,.65,.25,C.ink);
          this.p('round',-4.25,.58,z-3,.39,.11,.39,C.steel);
        }
      }else if(zone===1){
        // An empty slipway and a fishing hull resting on timber cradles.
        this.box(-9.7,-.01,z,9.4,.7,11.5,'#848a81');
        for(const dz of [-3.5,3.5]){
          this.box(-9.3,.67,z+dz,5.5,.26,.58,C.darkWood);
          for(const s of [-1,1])this.box(-9.3+s*1.9,1.24,z+dz,.18,1.43,.25,C.steel,0,0,s*.28);
        }
        this.asset('trawlerFar',-9.3,1.78,z,[.91,.88,.93],i%2?.10:-.13);
      }else if(zone===2){
        this.box(-9,-.13,z,9.7,.65,12.9,'#828b81');
        const stack=1+roll%3;
        for(let level=0;level<stack;level++){
          const col=[C.orange,'#428985','#8f6174'][(level+i)%3];
          this.box(-8.5,1.1+level*2.19,z,5.3,2.14,8.7,col);
          for(let j=-3.6;j<4;j+=1.2)this.box(-5.81,1.1+level*2.19,z+j,.10,1.93,.105,C.steel);
        }
        if(i%3===1){for(const s of [-1,1])this.box(s*4.5,3.3,z,.31,6.6,.43,C.orange);
          this.box(0,6.5,z,9.5,.42,.52,C.yellow);this.box(2,5.82,z,.08,.91,.08,C.ink);}
      }else{
        this.box(-8.3,.6,z,8.9,2.8,13,'#677e80');
        this.box(-8.3,2.13,z,9.25,.28,13,C.pearl);
        for(const dz of [-4.6,0,4.6])this.box(-4.28,1.06,z+dz,.4,3.4,.52,'#45646b');
        this.p('round',-5,3.17,z,1.42,1.9,1.42,C.teal);
        this.p('round',-5,4.18,z,1.83,.21,1.83,C.orange);
        if(i%3===1){this.box(0,5.1,z,9.3,.57,1.25,C.steel);this.box(0,5.47,z,9.4,.12,1.32,C.yellow);}
      }
      if(i%5===0)this.crane(-14,z+4);
      if(i%8===2)this.lighthouse(15.6,z);
      if(i%4===1)this.ferry(14.6+(roll%3)*.8,z);
      if(i%9===3)this.asset('lateen',14.25,-.64+.055*Math.sin(this.r.tick*.026),z+2,[1.10,1.12,1.10],.79);
      if(i%4===3)this.crane(24,z+6);
      if(i%7===0){this.box(27,-.43,z,10.3,1.2,13,'#899688');this.asset('fishHall2Far',27,.18,z,[1.2,1.05,1.26],Math.PI);}
      if(z>this.d-11&&z<this.d+91)this.life(i,z,zone,roll);
    }
    const horizon=Math.floor(this.d/65)*65+128;
    for(let k=0;k<5;k++){
      const side=k<2?-1:1,x=side*(19+(k%3)*10);
      this.asset('headland',x,-.89,horizon+11+(k%3)*9,[1.48,1.10+k*.08,1.6],side*.97+k*.15);
    }
    for(let k=0;k<4;k++){
      const phase=(this.r.tick*.003+k*2.04),x=13+k*8+Math.sin(phase)*2.3;
      this.asset('distantSail',x,-.83,horizon-15+k*5.5,[1+k*.10,1.05+k*.08,1+k*.1],.4+k*.41);
    }
    for(let j=0;j<10;j++){
      const side=j<5?-1:1, x=side*(12+(j%5)*6.4), h=2+(R.hash(this.seed,j+410)%6);
      this.box(x,h/2-1,horizon+7+(j%3)*4,4.2,h,6,'#9bb3a8');
      this.p('roof',x,h-.36,horizon+7+(j%3)*4,5.1,1.7,6.8,'#8aa19e',0,Math.PI/4);
    }
    for(let j=0;j<5;j++){
      const z=Math.floor(this.d/34)*34+45+j*10,x=3+j*2.1;
      const y=6.8+Math.sin(j*1.1)*1.2;
      for(const s of [-1,1])this.box(x+s*.26,y,z,.61,.07,.16,'#546f73',0,0,s*(.22+.12*Math.sin(this.d*.09+j)));
    }
    const flock=Math.floor((this.d+9)/35);
    for(let i=flock;i<=flock+1;i++)for(let k=0;k<3;k++){
      const perch=i*35+12+k*.89,t=clamp((this.d-perch+8-k*.7)/19,0,1);
      const side=i%2===0?-1:1,x=side*(3.91+k*.18+5.9*t),y=.29+(3.4+k*.39)*Math.pow(t,.76),at=perch+t*(5.4+k*.21);
      const yaw=side*(-.42-.38*t),angle=t>.01?.17+.74*Math.sin(this.r.tick*.16+k):.37;
      this.asset('tern',x,y,at,[1,1,1],yaw);
      for(const s of [-1,1])this.asset('ternWing',x+s*.045,y+.016,at,[1,1,1],[0,yaw+(s<0?Math.PI:0),angle]);
    }
  }
  person(x,at,role,side,variation){
    const time=this.r.tick/60,far=at-this.d>35,walk=role===3?Math.sin(time*.62+variation)*.72:0;
    const yaw=side*(2.13+.24*Math.sin(variation)+.045*Math.sin(time*1.3+variation));
    const z=at+walk,s=.91+(variation%4)*.035;
    const y=.036+(role===3?.023*Math.abs(Math.cos(time*2+variation)):.008*Math.sin(time*2+variation));
    if(!far)this.p('round',x+.11,.019,z-.07,.56*s,.012,.68*s,'#817862',0,yaw+.25);
    this.asset('worker'+role+(far?'Far':''),x,y,z,[s,s,s],yaw);
    if(role===1||role===2){
      const shoulder=.208*s,angle=(role===1?.33:.20)*Math.sin(time*(role===1?2.42:1.4)+variation);
      this.asset(role===1?'signalArm':'mateArm',x+shoulder*Math.cos(yaw),y+1.25*s,z+shoulder*Math.sin(yaw),[s,s,s],[0,yaw,angle]);
    }
  }
  life(i,z,zone,roll){
    const role=(roll+zone)%4,near=z-this.d<40;
    const leftAt=z+3.0+(roll%5)*.59;
    this.box(-4.9,-.20,z,2.12,.4,13.08,'#9e8969');
    this.person(-4.49,leftAt,role,-1,i+17);
    if(i%3===0)this.person(-5.23,leftAt+1.56,(role+1)%4,-1,i+6);
    if(i%4===1){
      this.asset(zone===0?'fishCart':'toolCart',-5.00,.025,z-.25,[.92,.90,.92],.34);
      this.person(-4.58,z-1.66,zone===0?0:3,-1,i+15);
    }
    if(zone===0||zone===1){
      if(i%3===1)this.asset(near?'netRack':'netRackFar',-4.98,.03,z-2.45,[.93,.93,.93],-1.48);
      else if(i%3===0){this.asset('lobsterPot',-4.82,.04,z-2.06);this.asset('lobsterPot',-4.80,.51,z-2.09,[.86,.86,.91],.17);}
      else this.asset('cargoHeap',-4.97,.036,z-2.21,[.85,.9,.85],.27);
    }else this.asset('cargoHeap',-5.12,.02,z-2.11,[1.14,1.1,1.12],.33);
    if(i%2===0){
      this.p('round',-5.28,1.87,z-4.8,.081,3.78,.081,C.ink);
      this.p('round',-5.28,1.87,z+4.8,.081,3.78,.081,C.ink);
      this.asset('pennants',-5.28,3.73,z,[1,1,1]);
    }
    // Separate side jetties stop before a rideable wave and resume past its landing.
    const block=R.block(this.c,Math.max(0,Math.floor(z/R.SPAN)));
    if(block.waves.some(w=>z+8>w.start-11&&z-8<w.end+8))return;
    this.box(5.22,-.27,z,2.8,.51,12.8,'#a28a6e');
    for(const dz of [-4.9,4.9])this.p('round',6.34,-.80,z+dz,.30,1.55,.30,'#756b56');
    this.person(4.91,z+.92,(role+2)%4,1,i+4);
    if(i%3===2){
      this.asset(zone===0?'fishCart':'toolCart',5.70,.015,z+3.47,[.96,1,.96],-.36);
      this.person(5.43,z+4.74,zone===0?0:3,1,i+22);
    }else if(i%2===0)this.asset('cargoHeap',5.73,.02,z+3.61,[.90,.9,.83],-.43);
    else this.asset('lobsterPot',5.44,.04,z-3.19,[1.11,.98,1.02],.49);
    if(zone===3||i%5===1)this.asset('gauge',6.27,-.02,z-4.3,[1,1,1],-.49);
  }
  crane(x,z){
    this.asset('derrick'+(z-this.d>48?'Far':''),x,-.17,z,[.92,.95,.92],x<0?Math.PI:0);
  }
  lighthouse(x,z){
    this.asset('beacon'+(z-this.d>51?'Far':''),x,-.64,z,[1.05,1.22,1.05],-.18);
  }
  ferry(x,z){
    const bob=Math.sin(this.r.tick*.024+z)*.065;
    this.asset('trawler'+(z-this.d>49?'Far':''),x-1,-.62+bob,z,[1.14,1.14,1.14],.76+Math.sin(z)*.13);
  }
  wave(w){
    const start=Math.max(w.start-9,this.d-10),end=Math.min(w.end+7,this.d+120);
    const bands=[3.68,4.55,5.28,6.50,7.40,8.35,9.22,9.59,9.55,9.25,9.00,9.29,9.99,10.74,12.40];
    const ys=[-.22,.14,.38,.91,1.54,2.32,3.05,3.51,3.80,3.89,3.77,4.04,4.10,3.07,-.97];
    const cols=['#a3d4bd','#68bfab','#51b3a5','#319c97','#168f90','#08838b','#208d97','#39a8a9','#96d9c7','#c5e8d4','#e6f2d8','#e1f4dc','#a1d8c9','#3eaba4','#3c999c'];
    const cut=1.18;
    for(let a=Math.floor(start/cut)*cut;a<end;a+=cut){
      const left=Math.max(start,a),b=Math.min(end,a+cut);
      const vert=(i,z)=>{
        const factor=clamp((z-w.start+9)/15,0,1)*clamp((w.end+7-z)/12,0,1);
        const crest=i>6?Math.min(1,(i-6)/3):0,time=this.r.tick/60;
        const swell=Math.sin(z*.25+i*.27-time*.64),ruffle=crest*Math.sin(z*.81-time*.94);
        return this.world(bands[i]+(.18*swell+.20*ruffle)*factor,-.42+(ys[i]+.42)*factor+(.14*swell+.15*ruffle)*factor,z);
      };
      for(let i=0;i<cols.length-1;i++)this.g.quad(vert(i,left),vert(i+1,left),vert(i+1,b),vert(i,b),[cols[i],cols[i+1],cols[i+1],cols[i]]);
      if(a>this.d-6&&a<this.d+42&&a>w.start+7&&a<w.end-5){
        // Broken streamers of foam follow the overhanging lip, revealing the curl from shore.
        const i=Math.floor(a/cut),base=vert(10,left+.2),tail=vert(9,b);
        if(i%3!==0)this.g.quad([base[0]-.03,base[1]+.015,base[2]],[base[0]-.075,base[1]-.025,base[2]-.035],
          [tail[0]-.17,tail[1]-.13-(i%4)*.04,tail[2]],[tail[0]-.105,tail[1]-.081,tail[2]],'#c5e6d5');
        if(R.hash(this.seed,i)%5===0)this.g.piece('ball',base[0]-.15,base[1]+.13,base[2]+.18,.055,.055,.12,'#c7e4dc',-.19,.27);
      }
    }
  }
  marker(z){
    this.box(-3.55,1.6,z,.12,3.15,.14,C.ink);this.box(-3.24,2.67,z,.76,.5,.12,C.yellow);
    this.box(0,.035,z,7.2,.05,.28,C.yellow);
  }
  roofPath(end){
    const start=end-39;
    for(let i=0;i<13;i++){
      const at=start+1.5+i*3, factor=Math.sin(Math.PI*(at-start)/39);
      const x=LANE+factor*2, y=factor*1.55;
      this.box(x,y-.10,at,1.78,.18,3.1,'#bc775d');
      this.box(x+.8,y+.02,at,.11,.08,3.07,C.yellow);
      if(i%3===1)this.box(x-.53,y*.45-.22,at,.26,y+.38,.3,C.steel);
    }
  }
  event(e) {
    const z=e.z;
    if(e.type==='token'||e.type==='magnet'||e.type==='boost'){
      if(this.preview||z<this.d-.10)return;
      const coin=e.type==='token',x=(e.lane-1)*LANE;
      const pull=coin&&this.r.magnet&&this.r.wave<0&&Math.abs(this.r.pos-e.lane)<=1.12?clamp(1-(z-this.d)/8,0,1)**2:0;
      const sway=Math.sin(z*.21+this.r.tick*.08),y=e.y+(coin?.045:.13)*sway;
      const rotation=coin?.39+.70*Math.sin(this.r.tick*.037+z*.19):.30*Math.sin(this.r.tick*.05+z);
      this.asset(coin?(z-this.d>14?'portTokenFar':'portToken'):e.type+'Pickup',mix(x,(this.r.pos-1)*LANE,pull),mix(y,R.height(this.r)+1.1,pull),z,[1,1,1],[coin?0:.07*sway,rotation,coin?.09:.12*sway]);
      if(!coin){this.p('round',x,.032,z,.68,.024,.68,'#5d7769');}
    }else if(e.type==='row'){
      for(let i=0;i<3;i++){
        const t=e.pattern[i],x=(i-1)*LANE;
        if(t==='C'){
          this.asset('cargo',x,0,z,[1,1,1],(i-1)*.054);
        }else if(t==='J'){
          this.asset('hurdle',x,0,z);
        }else if(t==='D'){
          this.asset('underSail',x,0,z);
        }else if(t==='G'){
          this.box(x,.033,z,1.92,.04,1.44,'#25485b');
          this.box(x,.06,z-.76,1.96,.055,.12,C.yellow);
          for(const a of [-.58,.33])this.box(x+a,.065,z+.58,.35,.065,.56,'#8f6d59',0,.17);
        }
      }
    }else if(e.type==='entry'){
      if(e.linked&&e.z-this.d<36&&this.r.roofUntil<e.z)return;
      this.box(2.5,.08,z,2.0,.12,5.0,C.teal);
      for(const dz of [-1.3,0,1.3])for(const sign of [-1,1])
        this.box(2.42+sign*.16,.16,z+dz+sign*.15,.61,.05,.12,C.foam,0,-.6,0);
      this.box(3.85,1.15,z,.13,2.4,.13,C.pearl);
      this.box(4.28,2.07,z,.84,.44,.1,C.teal);
    }else if(e.type==='gate'){
      for(let lane=0;lane<3;lane++){
        const x=5.27+lane*1.87,y=[.4,1.42,3.0][lane];
        if(e.mask & (1<<lane)){
          this.asset(['gateShore','gateMid','gateOuter'][lane],x,y,z);
        }else{this.box(x,y+.62,z,1.3,.085,.1,'#d75a47',0,0,.48);this.box(x,y+.62,z,1.3,.085,.1,'#d75a47',0,0,-.48);}
      }
    }else if(e.type==='exit'){
      this.box(4.18,.14,z,2.82,.21,3.1,C.yellow,0,0,.055);
      for(const a of [-.85,-.2,.45])this.box(4.13,.26,z+a,2.72,.04,.23,C.ink);
      for(const a of [-1.42,1.42])this.p('round',4.45,.8,z+a,.13,1.35,.13,C.pearl);
    }
  }
  position(r){
    const roof=r.wave<0&&r.roofUntil>r.d&&r.roofStart!==undefined?
      Math.sin(Math.PI*clamp((r.d-r.roofStart)/39,0,1)):0;
    const dry=(r.wave>=0?LANE:(r.pos-1)*LANE)+roof*2;
    const slot=r.wave>=0?r.pos:(r.exitSurf||0);
    return {x:mix(dry,5.27+slot*1.87,r.blend), y:mix(roof*1.55,.39+.73*slot+.28*slot*slot,r.blend)};
  }
  rider(r,ghost,skin,outfit){
    const pt=this.position(r),base=pt.y+R.height(r),x=pt.x+this.curve(r.d),z=this.d-r.d;
    if(!ghost&&r.blend<.35){
      const stretch=R.height(r)*.17;
      if(this.g.shadow){
        const blob=this.g.shadow;blob.visible=true;blob.position.set(x+.05,pt.y+.036,z+.06);
        blob.scale.set(.96+stretch,1.56+stretch,1);blob.material.opacity=1-.56*stretch;
      }else this.g.piece('round',x+.04,pt.y+.035,z+.06,.48+stretch,.015,.74+stretch,'#9e896d',0,-.13);
    }
    if(!ghost&&r.blend>.65&&R.height(r)<.18){
      for(const side of [-1,1]){
        const edge=(j,outer)=>{
          const t=j/6,width=.045+.070*Math.sin(t*Math.PI),spread=.14+.39*t+(outer?width:0);
          return [x+side*spread,base+side*spread*(.55+r.pos*.25)+.075+.022*Math.sin(t*4+r.tick*.115)+(outer?.035:0),z+.33+t*1.43];
        };
        for(let j=0;j<6;j++){
          const color=j<2?'#bdded0':j<4?'#9acfc2':'#68ada5';
          this.g.quad(edge(j,false),edge(j,true),edge(j+1,true),edge(j+1,false),
            [color,j<3?'#e1edde':'#a2d0bb',j<3?'#d1e8d7':'#8bc4b4',color]);
        }
      }
    }
    if(!ghost&&!this.preview&&r.tick-r.tokenTick<12){
      const t=(r.tick-r.tokenTick)/12;
      for(let i=0;i<5;i++){
        const a=i*2.40+r.tokenTick*.17,spread=.16+.49*t;
        this.g.piece('ball',x+Math.cos(a)*spread,base+.91+Math.sin(a)*spread+.3*t,z+.28,.08*(1-t),.16*(1-t),.08*(1-t),'#ffed83',0,0,-a);
      }
    }
    if(!this.g.renderer){this.g.models.addCanvasRider(x,base,z,r,skin,ghost,this.preview,outfit);return;}
    poseRider((name,at,scale,rot)=>this.g.models.add(name,x+at[0],base+at[1],z+at[2],scale,rot,ghost),r,skin,ghost,this.preview,outfit);
  }
}
