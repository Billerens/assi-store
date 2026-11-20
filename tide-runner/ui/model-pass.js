import * as T from '../vendor/three.module.js';
import {Model} from './model-kit.js';
import {portModels} from './port-models.js';
import {riderModels,poseRider,runCycle} from './rider-model.js';
import {deckTexture} from './deck-art.js';
import {quayModels} from './quay-life.js';
import {pickupModels} from './pickup-models.js';
import {railModels} from './rail-models.js';
import {ballastGeometry,ballastMaterial,vaultGeometry,vaultMaterial} from './rail-world.js';

export class ModelPass {
  constructor(renderer){
    this.view=renderer;this.models=Object.assign(portModels(),riderModels(),quayModels(),pickupModels(),railModels());this.batches=new Map();this.cache=new Map();
    this.models.railBed=ballastGeometry();
    this.models.railVault=vaultGeometry();
    this.ballast=renderer.renderer?ballastMaterial():null;
    this.vault=renderer.renderer?vaultMaterial():null;
    this.opaque=new T.MeshLambertMaterial({vertexColors:true,side:T.DoubleSide});
    this.timber=renderer.renderer?new T.MeshLambertMaterial({map:deckTexture(),vertexColors:true,side:T.DoubleSide}):null;
    this.ghost=new T.MeshBasicMaterial({color:0x8ee8ec,transparent:true,opacity:.42,depthWrite:false});
    this.euler=new T.Euler();
    this.frustum=new T.Frustum();this.projection=new T.Matrix4();this.sphere=new T.Sphere();this.rotation=new T.Quaternion();
  }
  begin(){
    const camera=this.view.camera;
    this.frustum.setFromProjectionMatrix(this.projection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
    for(const mesh of this.batches.values()){mesh.count=0;mesh.visible=false;}
  }
  add(name,x,y,z,scale=[1,1,1],rotation=[0,0,0],ghost=false){
    const bounds=this.models[name].boundingSphere,sphere=this.sphere;
    const q=rotation.isQuaternion?rotation:this.rotation.setFromEuler(this.euler.set(...rotation));
    sphere.center.copy(bounds.center);sphere.center.x*=scale[0];sphere.center.y*=scale[1];sphere.center.z*=scale[2];sphere.center.applyQuaternion(q);
    sphere.center.x+=x;sphere.center.y+=y;sphere.center.z+=z;sphere.radius=bounds.radius*Math.max(...scale);
    if(!this.frustum.intersectsSphere(sphere))return;
    if(!this.view.renderer){
      this.view.shapes.push({name,x,y,z,scale,rotation,ghost});return;
    }
    const key=name+(ghost?'*':'');let mesh=this.batches.get(key);
    if(!mesh){
      const limit=name.startsWith('ride')?4:64;
      const material=ghost?this.ghost:name==='pierDeck'?this.timber:name==='railBed'?this.ballast:name==='railVault'?this.vault:this.opaque;
      mesh=new T.InstancedMesh(this.models[name],material,limit);
      mesh.count=0;mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
      this.view.scene.add(mesh);this.batches.set(key,mesh);
    }
    if(mesh.count>=mesh.instanceMatrix.count)return;
    const t=this.view.transforms;t.position.set(x,y,z);t.scale.fromArray(scale);
    t.quaternion.copy(q);
    t.updateMatrix();mesh.visible=true;mesh.setMatrixAt(mesh.count++,t.matrix);mesh.instanceMatrix.needsUpdate=true;
  }
  addCanvasRider(x,y,z,r,skin,ghost,home=false,outfit=0){
    const surf=r.blend>.24||r.surge>0||r.rules===1;
    const pose=home?'home':surf?(r.blend>.24?'surf':'board'):r.slide?'duck':r.air||r.surface==='air'?'air':'run';
    const phase=pose==='run'?Math.floor(runCycle(r)*12):
      pose==='surf'||pose==='board'?Math.floor((r.tick/60*3.62/(2*Math.PI))%1*4):0;
    const name=['fallback',pose,skin,outfit,phase].join('-');
    if(!this.models[name]){
      const m=new Model();
      poseRider((part,at,size,rotation)=>m.add(this.models[part],0xffffff,at,size,rotation),
        {...r,lane:1,pos:1,tick:phase*60*2*Math.PI/(4*3.62),slide:pose==='duck'?20:0,air:pose==='air'?23:0,blend:pose==='surf'?1:0},skin,false,home,outfit,phase/12);
      this.models[name]=m.finish();
    }
    const turn=home?0:r.lane-r.pos;
    this.add(name,x,y,z,[1,1,1],[0,-turn*.19,-turn*.15],ghost);
  }
  sprite(name,yaw,pitch){
    const key=name+'|'+yaw+'|'+pitch;
    if(this.cache.has(key))return this.cache.get(key);
    const geo=this.models[name],pos=geo.getAttribute('position'),norm=geo.getAttribute('normal'),col=geo.getAttribute('color'),indices=geo.index.array;
    const sin=Math.sin(yaw),cos=Math.cos(yaw),sp=Math.sin(pitch),cp=Math.cos(pitch);
    const points=[],faces=[];let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
    for(let i=0;i<pos.count;i++){
      const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i),u=x*cos+z*sin,dep=z*cos-x*sin,v=y*cp-dep*sp;
      points.push([u,v,dep*cp+y*sp]);minX=Math.min(minX,u);minY=Math.min(minY,v);maxX=Math.max(maxX,u);maxY=Math.max(maxY,v);
    }
    const zoom=190/Math.max(maxX-minX,maxY-minY,.1),image=document.createElement('canvas');
    image.width=Math.ceil((maxX-minX)*zoom)+4;image.height=Math.ceil((maxY-minY)*zoom)+4;
    const ctx=image.getContext('2d');ctx.setTransform(zoom,0,0,-zoom,2-minX*zoom,2+maxY*zoom);
    for(let i=0;i<indices.length;i+=3){
      const ia=indices[i],ib=indices[i+1],ic=indices[i+2],a=points[ia],b=points[ib],c=points[ic];
      const nx=(norm.getX(ia)+norm.getX(ib)+norm.getX(ic))/3,ny=(norm.getY(ia)+norm.getY(ib)+norm.getY(ic))/3,nz=(norm.getZ(ia)+norm.getZ(ib)+norm.getZ(ic))/3;
      const shade=.71+.43*Math.max(0,-nx*.51+ny*.76+nz*.36);
      const rgb=new T.Color(col.getX(ia)*shade,col.getY(ia)*shade,col.getZ(ia)*shade).getHexString();
      faces.push([a,b,c,(a[2]+b[2]+c[2])/3,'#'+rgb]);
    }
    faces.sort((a,b)=>a[3]-b[3]);
    for(const [a,b,c,,color] of faces){ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);ctx.lineTo(c[0],c[1]);ctx.closePath();ctx.fill();}
    const frame={image,minX:minX-2/zoom,maxY:maxY+2/zoom,w:image.width/zoom,h:image.height/zoom};
    if(this.cache.size>280)this.cache.delete(this.cache.keys().next().value);
    this.cache.set(key,frame);return frame;
  }
  drawCanvas(s){
    const g=this.view,cam=g.camera,dep=cam.position.z-s.z;
    if(dep<.7)return;
    const center=g.v.set(s.x,s.y,s.z).project(cam);
    if(Math.abs(center.x)>2.8||center.z>1||center.z< -1)return;
    const dx=(center.x+1)*g.w/2,dy=(1-center.y)*g.h/2;
    const yaw=(s.rotation.isQuaternion?this.euler.setFromQuaternion(s.rotation).y:s.rotation[1])-Math.atan2(cam.position.x-s.x,dep);
    const pitch=clampPitch(Math.atan2(cam.position.y-s.y,Math.hypot(dep,cam.position.x-s.x)));
    const fr=this.sprite(s.name,Math.round(yaw*4)/4,pitch),unit=g.h/(2*Math.tan(cam.fov*Math.PI/360)*dep);
    g.flat.globalAlpha=s.ghost?.4:1;g.flat.drawImage(fr.image,dx+fr.minX*unit*s.scale[0],dy-fr.maxY*unit*s.scale[1],fr.w*unit*s.scale[0],fr.h*unit*s.scale[1]);g.flat.globalAlpha=1;
  }
}
function clampPitch(angle){return angle>.4?.51:angle>.18?.25:.07;}
