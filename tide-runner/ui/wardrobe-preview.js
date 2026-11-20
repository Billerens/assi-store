import * as T from '../vendor/three.module.js';
import {Model} from './model-kit.js';
import {ModelPass} from './model-pass.js';
import {poseRider,riderModels} from './rider-model.js';

let wardrobeModels, pickupGeometry;
const packed=new Map();
async function figure(tab, choice, outfit, skin) {
  if(tab==='gear'){
    if(choice!=='magnet' && choice!=='boost'){
      if(!packed.has(choice)){
        const {railGear}=await import('./rail-gear.js');
        packed.set(choice,railGear[choice]());
      }
      return packed.get(choice);
    }
    if(!pickupGeometry)pickupGeometry=(await import('./pickup-models.js')).pickupModels();
    return pickupGeometry[choice==='magnet'?'magnetPickup':'boostPickup'];
  }
  wardrobeModels??=riderModels();
  const key=[tab,outfit,skin].join('-');
  if(packed.has(key))return packed.get(key);
  const model=new Model(), riding=tab==='board';
  const state={tick:68,d:7.5,lane:1,pos:1,air:0,slide:0,blend:riding?1:0,wave:riding?1:-1};
  poseRider((part,at,size,rotation)=>model.add(wardrobeModels[part],0xffffff,at,size,rotation),state,skin,false,true,outfit);
  const result=model.finish();packed.set(key,result);return result;
}

export function mountPreview(host) {
  let canvas=document.createElement('canvas');
  canvas.setAttribute('aria-hidden','true');host.prepend(canvas);
  let renderer;
  try {renderer=new T.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'low-power'});}
  catch(_){const plain=canvas.cloneNode();canvas.replaceWith(plain);canvas=plain;}
  const scene=new T.Scene(),camera=new T.OrthographicCamera(-2,2,2,-2,.1,30);
  scene.add(new T.HemisphereLight('#fff0d6','#a6c0bd',1.76));
  const sun=new T.DirectionalLight('#ffdfba',2.12);sun.position.set(-4,7,4);scene.add(sun);
  const rim=new T.DirectionalLight('#e3faf6',.75);rim.position.set(3,2,-3);scene.add(rim);
  const matte=new T.MeshLambertMaterial({vertexColors:true,side:T.DoubleSide});
  const diskMat=new T.MeshLambertMaterial({color:'#467a76'}),goldMat=new T.MeshLambertMaterial({color:'#d9b976'});
  const ring=new T.CylinderGeometry(1.21,1.25,.09,48),trim=new T.CylinderGeometry(1.24,1.24,.025,48);
  const stand=new T.Mesh(ring,diskMat),band=new T.Mesh(trim,goldMat);stand.position.y=-.07;band.position.y=-.1;scene.add(stand,band);
  const pivot=new T.Group();scene.add(pivot);
  const sprites=Object.create(ModelPass.prototype);sprites.models={};sprites.cache=new Map();
  let mesh=null,rotation=0,start=null,lastX=0,gear=false,active=true,request=0,renderFrame=0;
  function draw(){
    renderFrame=0;
    if(!active||!mesh||!host.clientWidth||!host.clientHeight)return;
    const w=host.clientWidth,h=host.clientHeight,ratio=w/h;
    if(renderer){
      const half=Math.max(1.15,1.43/ratio);
      camera.left=-half*ratio;camera.right=half*ratio;camera.top=half;camera.bottom=-half;
      camera.position.set(2.65,2.15,4.45);camera.lookAt(0,.85,0);camera.updateProjectionMatrix();
      pivot.rotation.y=rotation;renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.8));renderer.setSize(w,h,false);renderer.render(scene,camera);
    }else{
      const c=canvas.getContext('2d'),dpr=Math.min(window.devicePixelRatio||1,1.5);
      canvas.width=w*dpr;canvas.height=h*dpr;c.scale(dpr,dpr);
      const fr=sprites.sprite('current',Math.round((rotation-.53)*6)/6,.25);
      const box=Math.min(w*.82,h*.84),scale=box/Math.max(fr.image.width,fr.image.height);
      const dw=fr.image.width*scale,dh=fr.image.height*scale;
      c.fillStyle='#698f83';c.beginPath();c.ellipse(w*.5,h*.85,Math.min(w*.32,h*.37),Math.min(15,h*.06),0,0,Math.PI*2);c.fill();
      c.drawImage(fr.image,(w-dw)/2,(h-dh)/2,dw,dh);
    }
  }
  function redraw(){if(!renderFrame&&active)renderFrame=requestAnimationFrame(draw);}
  async function select(tab,choice,outfit,skin){
    const token=++request;
    const g=await figure(tab,choice,outfit,skin);
    if(!active||request!==token)return;
    gear=tab==='gear';rotation=gear?.12:tab==='board'?1.24:.90;
    if(mesh)pivot.remove(mesh);
    mesh=new T.Mesh(g,matte);g.computeBoundingBox();
    if(gear){
      const size=g.boundingBox.getSize(new T.Vector3()),center=g.boundingBox.getCenter(new T.Vector3());
      const scale=1.34/Math.max(size.x,size.y,size.z);
      mesh.scale.setScalar(scale);mesh.position.copy(center).multiplyScalar(-scale);mesh.position.y+=.93;
    }else{mesh.position.y=-g.boundingBox.min.y;}
    pivot.add(mesh);sprites.cache.clear();sprites.models.current=g;redraw();
  }
  function rotate(amount){rotation+=amount;redraw();}
  function down(e){start=e.pointerId;lastX=e.clientX;host.setPointerCapture?.(e.pointerId);}
  function move(e){if(e.pointerId!==start)return;rotate((e.clientX-lastX)*.016);lastX=e.clientX;}
  function up(e){if(e.pointerId===start)start=null;}
  host.addEventListener('pointerdown',down);host.addEventListener('pointermove',move);host.addEventListener('pointerup',up);host.addEventListener('pointercancel',up);
  const observer=new ResizeObserver(redraw);observer.observe(host);
  function dispose(){
    if(!active)return;active=false;observer.disconnect();cancelAnimationFrame(renderFrame);
    host.removeEventListener('pointerdown',down);host.removeEventListener('pointermove',move);host.removeEventListener('pointerup',up);host.removeEventListener('pointercancel',up);
    matte.dispose();diskMat.dispose();goldMat.dispose();ring.dispose();trim.dispose();renderer?.dispose();renderer?.forceContextLoss();sprites.cache.clear();
  }
  return {select,rotate,dispose};
}
