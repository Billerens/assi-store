import * as T from '../vendor/three.module.js';

// Vertex-coloured meshes are baked once. Repeated props share geometry and one instance batch.
const box=new T.BoxGeometry(1,1,1), ball=new T.SphereGeometry(1,12,7);
const up=new T.Vector3(0,1,0), point=new T.Vector3(), normal=new T.Vector3();
export class Model {
  constructor(){this.p=[];this.n=[];this.c=[];this.i=[];}
  add(geo,col,at=[0,0,0],size=[1,1,1],rot=[0,0,0]){
    const quaternion=rot.isQuaternion?rot:new T.Quaternion().setFromEuler(new T.Euler(...rot));
    const m=new T.Matrix4().compose(new T.Vector3(...at),quaternion,new T.Vector3(...size));
    const nm=new T.Matrix3().getNormalMatrix(m),pos=geo.getAttribute('position'),ns=geo.getAttribute('normal');
    const paint=new T.Color(col),painted=geo.getAttribute('color'),offset=this.p.length/3;
    for(let j=0;j<pos.count;j++){
      point.fromBufferAttribute(pos,j).applyMatrix4(m);normal.fromBufferAttribute(ns,j).applyMatrix3(nm).normalize();
      this.p.push(point.x,point.y,point.z);this.n.push(normal.x,normal.y,normal.z);
      this.c.push(paint.r*(painted?painted.getX(j):1),paint.g*(painted?painted.getY(j):1),paint.b*(painted?painted.getZ(j):1));
    }
    if(geo.index)for(const index of geo.index.array)this.i.push(offset+index);
    else for(let j=0;j<pos.count;j++)this.i.push(offset+j);
    return this;
  }
  box(at,size,col,rot){return this.add(box,col,at,size,rot);}
  oval(at,radii,col,rot){return this.add(ball,col,at,radii,rot);}
  rod(a,b,ra,rb,col,sides=8){
    const av=new T.Vector3(...a),bv=new T.Vector3(...b),v=bv.clone().sub(av);
    const q=new T.Quaternion().setFromUnitVectors(up,v.clone().normalize());
    return this.add(new T.CylinderGeometry(rb,ra,v.length(),sides),col,av.lerp(bv,.5).toArray(),[1,1,1],q);
  }
  ring(at,major,minor,col,rot=[0,0,0],size=[1,1,1],arc=Math.PI*2){
    return this.add(new T.TorusGeometry(major,minor,6,Math.ceil(26*arc/(2*Math.PI)),arc),col,at,size,rot);
  }
  tube(points,radius,col,sides=6){
    const line=new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p)));
    return this.add(new T.TubeGeometry(line,Math.max(3,(points.length-1)*3),radius,sides,false),col);
  }
  // Each horizontal ring specifies elevation, radii, and its optional centre and paint.
  loft(rows,col,segments=16,at=[0,0,0],rot=[0,0,0]){
    const p=[],ix=[],cs=[];
    for(let row=0;row<rows.length;row++){
      const [y,rx,rz,cx=0,cz=0,paint=col]=rows[row],c=new T.Color(paint);
      for(let i=0;i<segments;i++){
        const theta=2*Math.PI*i/segments;
        p.push(cx+rx*Math.cos(theta),y,cz+rz*Math.sin(theta));cs.push(c.r,c.g,c.b);
        if(row){
          const a=(row-1)*segments+i,b=(row-1)*segments+(i+1)%segments,k=a+segments,l=b+segments;
          ix.push(a,k,b,b,k,l);
        }
      }
    }
    for(let i=1;i<segments-1;i++){
      const o=(rows.length-1)*segments;ix.push(0,i,i+1,o,o+i+1,o+i);
    }
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p,3));
    g.setAttribute('color',new T.Float32BufferAttribute(cs,3));g.setIndex(ix);g.computeVertexNormals();
    return this.add(g,0xffffff,at,[1,1,1],rot);
  }
  face(points,col){
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(points.flat(),3));
    const ix=[];for(let i=1;i<points.length-1;i++)ix.push(0,i,i+1);
    g.setIndex(ix);g.computeVertexNormals();return this.add(g,col);
  }
  // Skin a sequence of transverse cross-sections. Adjacent strips can have different paint.
  skin(sections,paints,close=true) {
    for(let j=0;j<sections.length-1;j++){
      const a=sections[j],b=sections[j+1],last=close?a.length:a.length-1;
      for(let i=0;i<last;i++){
        const k=(i+1)%a.length;this.face([a[i],a[k],b[k],b[i]],paints[i%paints.length]);
      }
    }
    if(close){this.face(sections[0].slice().reverse(),paints[0]);this.face(sections.at(-1),paints[0]);}
    return this;
  }
  finish(){
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(this.p,3));
    g.setAttribute('normal',new T.Float32BufferAttribute(this.n,3));g.setAttribute('color',new T.Float32BufferAttribute(this.c,3));
    g.setIndex(this.i);g.computeBoundingSphere();g.computeBoundingBox();return g;
  }
}
export const PI=Math.PI;
