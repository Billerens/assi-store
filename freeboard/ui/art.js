import * as T from '../vendor/three-0.160.0/three.module.js';


export function material(color, glow=false) {
  return glow ? new T.MeshBasicMaterial({color}) : new T.MeshStandardMaterial({color,roughness:0.72,metalness:0.24});
}
export function solid(g,geo,mat,x=0,y=0,z=0) {
  const mesh=new T.Mesh(geo,mat);mesh.position.set(x,y,z);g.add(mesh);return mesh;
}
export function box(g,x,y,z,w,h,d,mat){return solid(g,new T.BoxGeometry(w,h,d),mat,x,y,z);}

export { vessel as ship, sentry } from './craft-models.js';
export function deepSky(){
  const c=document.createElement('canvas');c.width=512;c.height=256;
  const ctx=c.getContext('2d'),img=ctx.createImageData(c.width,c.height);
  const random=rng(705),a=noiseGrid(random,8),b=noiseGrid(random,22),fine=noiseGrid(random,72);
  for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++){
    const u=x/c.width,v=y/c.height,n=a(u,v)*.56+b(u,v)*.31+fine(u,v)*.13;
    const band=Math.exp(-6*Math.abs(v-.51-.105*Math.sin(u*6.283)));
    const dust=clamp((n-.28)*2,0,1)*band, purple=Math.max(0,(n-.43)*1.6);
    const i=(y*c.width+x)*4;
    img.data[i]=11+dust*30+purple*23;img.data[i+1]=17+dust*42+purple*4;
    img.data[i+2]=31+dust*43+purple*15;img.data[i+3]=255;
  }
  ctx.putImageData(img,0,0);const map=new T.CanvasTexture(c);map.colorSpace=T.SRGBColorSpace;
  const mat=new T.MeshBasicMaterial({map,side:T.BackSide,depthWrite:false,depthTest:false,fog:false});
  const sphere=new T.Mesh(new T.SphereGeometry(850,28,18),mat);sphere.renderOrder=-5;return sphere;
}
function rng(seed){return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
function noiseGrid(random,n){const a=Array.from({length:n*n},random);return (x,y)=>{
  x=(x%1+1)%1*n;y=(y%1+1)%1*n;
  let a1=x|0,b=y|0,u=x-a1,v=y-b;u=u*u*(3-2*u);v=v*v*(3-2*v);
  const f=(i,j)=>a[(j%n)*n+(i%n)];
  return (1-v)*((1-u)*f(a1,b)+u*f(a1+1,b))+v*((1-u)*f(a1,b+1)+u*f(a1+1,b+1));
};}
export { planet, animatePlanet } from './planets.js';
function clamp(x,lo,hi){return Math.max(lo,Math.min(hi,x));}
export function firmament(){
  const g=new T.Group(),r=rng(220),a=[],colors=[];
  for(let i=0;i<2100;i++){const az=r()*6.283,el=Math.asin(r()*2-1),dist=600;
    a.push(Math.cos(az)*Math.cos(el)*dist,Math.sin(el)*dist,Math.sin(az)*Math.cos(el)*dist);
    const c=.45+r()*.55;colors.push(c,.81*c,.68+.32*c);}
  const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(a,3));geo.setAttribute('color',new T.Float32BufferAttribute(colors,3));
  g.add(new T.Points(geo,new T.PointsMaterial({size:1.05,sizeAttenuation:false,vertexColors:true,fog:false})));
  return g;
}
export function terrainHeight(x,z,index){return .32*Math.sin(x*.16+index)*Math.cos(z*.12)+.16*Math.sin(z*.22);}
export function meteor(radius,seed){
  const geo=new T.IcosahedronGeometry(radius,2);
  const pos=geo.attributes.position,colors=[],unit=new T.Vector3();
  const pits=[[.73,-.06,.67,.25],[-.32,.86,-.39,.41],[-.64,-.52,.56,.29],[.02,.31,.94,.32]];
  for(let i=0;i<pos.count;i++){
    unit.fromBufferAttribute(pos,i).normalize();const {x,y,z}=unit;
    let h=1+.095*Math.sin(x*6+seed)*Math.sin(y*7-z*4)+.043*Math.cos(z*13+x*9);
    let rim=0;
    for(const [px,py,pz,r] of pits){
      const d=Math.hypot(x-px,y-py,z-pz)/r;
      if(d<1.24){h-=.14*Math.max(0,1-d*d);rim+=.055*Math.exp(-55*(d-.98)*(d-.98));}
    }
    h+=rim;pos.setXYZ(i,x*h*radius*1.13,y*h*radius*.85,z*h*radius);
    const shade=.81+.12*Math.sin(x*28+y*14+seed)+rim*.9;
    const col=new T.Color(seed%2?0x897977:0x839094).multiplyScalar(shade);colors.push(col.r,col.g,col.b);
  }
  geo.setAttribute('color',new T.Float32BufferAttribute(colors,3));geo.computeVertexNormals();
  return new T.Mesh(geo,new T.MeshStandardMaterial({vertexColors:true,roughness:.93,metalness:.09}));
}
export function terrain(index){
  const g=new T.Group(),r=rng(95+index),ground=new T.PlaneGeometry(170,175,72,72);ground.rotateX(-Math.PI/2);
  const pos=ground.attributes.position,colors=[],baseColor=new T.Color([0xac7468,0x4b8e96,0xad8a67][index]);
  for(let i=0;i<pos.count;i++){
    const x=pos.getX(i),z=pos.getZ(i);const border=Math.max(0,Math.abs(x)-32,Math.abs(z)-43);
    const mass=.39+.13*Math.sin(x*.21+z*.055)+.18*Math.sin(x*.12-z*.13+index)+.13*Math.cos(x*.063+z*.081);
    const y=terrainHeight(x,z,index)+border*mass;pos.setY(i,y);
    const strata=Math.cos(y*.92+x*.045-z*.021)*.095;
    const col=baseColor.clone().multiplyScalar(.80+r()*.095+strata+border*.002);colors.push(col.r,col.g,col.b);
  }
  ground.setAttribute('color',new T.Float32BufferAttribute(colors,3));ground.computeVertexNormals();
  solid(g,ground,new T.MeshStandardMaterial({vertexColors:true,flatShading:true,roughness:1}));
  const stone=material([0x654c55,0x345761,0x765951][index]);
  const inst=new T.InstancedMesh(new T.DodecahedronGeometry(1,0),stone,86),obj=new T.Object3D();
  for(let i=0;i<86;i++){
    const x=(r()-.5)*104,z=(r()-.5)*120,s=.25+r()*1.65;
    obj.position.set(x,terrainHeight(x,z,index)+s*.24,z);obj.rotation.set(r(),r()*6,r());obj.scale.set(s,s*(.6+r()),s);obj.updateMatrix();inst.setMatrixAt(i,obj.matrix);
  }g.add(inst);
  const layers=new T.InstancedMesh(new T.CylinderGeometry(1.0,1.10,1,8),stone,42);
  for(let i=0;i<7;i++){
    const a=(i+index*.09)*Math.PI*2/7,x=Math.sin(a)*(29+i%3*4),z=-16+Math.cos(a)*39;
    const height=1.7+(i%4)*1.07,wide=3.2+(i%3)*.91;
    for(let j=0;j<6;j++){
      const s=1-j*.093;
      obj.position.set(x+Math.cos(j*.41)*j*.13,terrainHeight(x,z,index)+height*.17*j,z+j*.09);
      obj.scale.set(wide*s,height*(j===5?.15:.24),wide*s*.68);obj.rotation.set(0,i*.86+j*.018,.025);
      obj.updateMatrix();layers.setMatrixAt(i*6+j,obj.matrix);
      layers.setColorAt(i*6+j,new T.Color().setScalar(j%2?.93:1.22));
    }
  }
  g.add(layers);return g;
}
export { quarters as cabin, expeditionSuit as walker, mineral as crystal } from './habitat-models.js';
