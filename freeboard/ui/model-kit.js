// A small hard-surface authoring kit. Local -Z is the bow and +Y is the roof.
import * as T from '../vendor/three-0.160.0/three.module.js';

export function finish(group) {
  // Static fittings sharing a material become one draw call. Expand UVs into the
  // common ship paint sheet before merging so lettering follows the built hull.
  group.updateMatrixWorld(true);
  const inverse=group.matrixWorld.clone().invert(), sets=new Map(), sources=new Set();
  group.traverse(mesh=>{
    if(!mesh.isMesh)return;
    const mat=mesh.material,src=mesh.geometry,matrix=new T.Matrix4().multiplyMatrices(inverse,mesh.matrixWorld);
    const v=new T.Vector3(),n=new T.Vector3(),normalMatrix=new T.Matrix3().getNormalMatrix(matrix);
    const pos=src.getAttribute('position'),normal=src.getAttribute('normal'),uv=src.getAttribute('uv');
    if(!sets.has(mat))sets.set(mat,{p:[],n:[],uv:[],idx:[]});
    const set=sets.get(mat),base=set.p.length/3;
    for(let i=0;i<pos.count;i++){
      v.fromBufferAttribute(pos,i).applyMatrix4(matrix);set.p.push(v.x,v.y,v.z);
      n.fromBufferAttribute(normal,i).applyNormalMatrix(normalMatrix);set.n.push(n.x,n.y,n.z);
      if(mat.userData.tileSize){
        const size=mat.userData.tileSize,ax=Math.abs(n.x),ay=Math.abs(n.y),az=Math.abs(n.z);
        if(ay>=ax&&ay>=az)set.uv.push(v.x/size,v.z/size);
        else if(ax>az)set.uv.push(v.z/size,v.y/size);else set.uv.push(v.x/size,v.y/size);
      }
      else if(mat.userData.paintProjection) set.uv.push(.5+v.x/10,.5-v.z/11);
      else set.uv.push(uv?uv.getX(i):0,uv?uv.getY(i):0);
    }
    if(src.index)for(let i=0;i<src.index.count;i++)set.idx.push(base+src.index.getX(i));
    else for(let i=0;i<pos.count;i++)set.idx.push(base+i);
    sources.add(src);
  });
  group.clear();sources.forEach(g=>g.dispose());
  for(const [material,s] of sets){
    const g=new T.BufferGeometry();
    g.setAttribute('position',new T.Float32BufferAttribute(s.p,3));
    g.setAttribute('normal',new T.Float32BufferAttribute(s.n,3));
    g.setAttribute('uv',new T.Float32BufferAttribute(s.uv,2));g.setIndex(s.idx);g.computeBoundingSphere();
    group.add(new T.Mesh(g,material));
  }
  return group;
}
export function coat(color,roughness=.50,metalness=.30,extra={}){
  return new T.MeshStandardMaterial({color,metalness,roughness,...extra});
}
export function lamp(color){return new T.MeshBasicMaterial({color});}
export function mesh(group,geometry,material,x=0,y=0,z=0){
  const item=new T.Mesh(geometry,material);item.position.set(x,y,z);group.add(item);return item;
}
export function box(g,w,h,d,m,x=0,y=0,z=0){return mesh(g,new T.BoxGeometry(w,h,d),m,x,y,z);}
export function sph(g,x,y,z,rx,ry,rz,m){
  const s=mesh(g,new T.SphereGeometry(1,20,12),m,x,y,z);s.scale.set(rx,ry,rz);return s;
}
export function rod(g,a,b,r,m,r2=r,segments=8){
  const u=new T.Vector3(...a),v=new T.Vector3(...b),d=v.clone().sub(u);
  const o=mesh(g,new T.CylinderGeometry(r2,r,d.length(),segments),m);
  o.position.copy(u.add(v).multiplyScalar(.5));
  o.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),d.normalize());return o;
}
export function band(g,x,y,z,r,t,m,sides=32){
  return mesh(g,new T.TorusGeometry(r,t,6,sides),m,x,y,z);
}
export function pathTube(g,points,r,mat){
  return mesh(g,new T.TubeGeometry(new T.CatmullRomCurve3(points.map(v=>new T.Vector3(...v))),Math.max(7,points.length*3),r,6,false),mat);
}
// Elliptical and soft-cornered loft through authored cross sections [z, radiusX, radiusY, centerY].
export function loft(g,sections,mat,segments=24,roundness=1,x=0){
  const p=[],indices=[];
  const power=v=>Math.sign(v)*Math.pow(Math.abs(v),roundness);
  for(const [z,rx,ry,y] of sections)for(let i=0;i<segments;i++){
    const a=i*2*Math.PI/segments;p.push(x+rx*power(Math.cos(a)),y+ry*power(Math.sin(a)),z);
  }
  for(let j=0;j<sections.length-1;j++)for(let i=0;i<segments;i++){
    const a=j*segments+i,b=j*segments+(i+1)%segments;indices.push(a,b,a+segments,b,b+segments,a+segments);
  }
  for(let i=1;i<segments-1;i++){
    indices.push(0,i+1,i);
    const a=(sections.length-1)*segments;indices.push(a,a+i,a+i+1);
  }
  const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(p,3));geo.setIndex(indices);geo.computeVertexNormals();
  return mesh(g,geo,mat);
}
// Airfoil cross-sections [x, leadingZ, trailingZ, y, thickness], increasing x.
// The curved airfoil, raised leading edge and tapered tip read at gameplay scale.
export function foil(g,sections,mat,side){
  const cross=[[0,0],[.042,.68],[.17,1],[.40,.81],[.72,.40],[1,.04],[.88,-.19],[.46,-.38],[.13,-.31],[.022,-.13]];
  const p=[],idx=[],k=cross.length;
  for(const [x,front,rear,y,thick] of sections)for(const [t,height] of cross)p.push(side*x,y+height*thick,front+(rear-front)*t);
  const tri=(a,b,c)=>side===1?idx.push(a,b,c):idx.push(a,c,b);
  for(let s=0;s<sections.length-1;s++)for(let j=0;j<k;j++){
    const a=s*k+j,b=s*k+(j+1)%k;tri(a,b,a+k);tri(b,b+k,a+k);
  }
  for(let i=1;i<k-1;i++){tri(0,i+1,i);const a=(sections.length-1)*k;tri(a,a+i,a+i+1);}
  const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(p,3));geo.setIndex(idx);geo.computeVertexNormals();return mesh(g,geo,mat);
}
export function fairing(g,x,y,z,w,h,d,mat){
  // Box-like pressure vessel with smoothly rounded corners and chamfered ends.
  return loft(g,[
    [z-d*.5,w*.39,h*.39,y],[z-d*.46,w*.485,h*.485,y],[z-d*.38,w*.50,h*.50,y],
    [z+d*.38,w*.50,h*.50,y],[z+d*.46,w*.485,h*.485,y],[z+d*.50,w*.39,h*.39,y]
  ],mat,16,.40,x);
}
export function surface(label,size=512){
  const canvas=document.createElement('canvas');canvas.width=size;canvas.height=size;
  const ctx=canvas.getContext('2d');const texture=new T.CanvasTexture(canvas);
  texture.colorSpace=T.SRGBColorSpace;texture.anisotropy=4;texture.name=label;return {canvas,ctx,texture};
}
export function dockShadow(){
  const {ctx,texture}=surface('contact-shadow',128),grad=ctx.createRadialGradient(64,64,5,64,64,63);
  grad.addColorStop(0,'rgba(4,11,18,.66)');grad.addColorStop(.46,'rgba(4,11,18,.42)');grad.addColorStop(1,'rgba(4,11,18,0)');
  ctx.fillStyle=grad;ctx.fillRect(0,0,128,128);
  const m=new T.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false});
  const mesh=new T.Mesh(new T.PlaneGeometry(6.5,8.7),m);mesh.rotation.x=-Math.PI/2;return mesh;
}
export function studioReflection(){
  const canvas=document.createElement('canvas');canvas.width=384;canvas.height=192;const c=canvas.getContext('2d');
  const g=c.createLinearGradient(0,0,0,192);
  g.addColorStop(0,'#c8dbde');g.addColorStop(.29,'#526f8b');g.addColorStop(.47,'#a9c2c7');g.addColorStop(.52,'#101a2b');g.addColorStop(.81,'#262a3b');g.addColorStop(1,'#7f6054');
  c.fillStyle=g;c.fillRect(0,0,384,192);
  c.fillStyle='#fff3d6';c.fillRect(19,34,55,18);c.fillStyle='#aee2ff';c.fillRect(209,29,63,11);
  c.fillStyle='#daa989';c.fillRect(311,115,54,5);
  const tex=new T.CanvasTexture(canvas);tex.colorSpace=T.SRGBColorSpace;tex.mapping=T.EquirectangularReflectionMapping;return tex;
}
