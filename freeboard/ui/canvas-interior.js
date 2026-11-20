import {HELM,berthLocations} from './ship-interior.js';

export function interiorLens(eye,w,h){
  const sy=Math.sin(eye.yaw||0),cy=Math.cos(eye.yaw||0),sp=Math.sin(eye.pitch||0),cp=Math.cos(eye.pitch||0);
  const fov=Math.max(71,Math.min(96,2*Math.atan(Math.tan(.46)*h/w)*180/Math.PI)), focal=h/(2*Math.tan(fov*Math.PI/360));
  function local(x,y,z){
    const dx=x-eye.x,dy=y-eye.y,dz=z-eye.z,depth=dx*sy-dz*cy;
    return [dx*cy+dz*sy,dy*cp-depth*sp,depth*cp+dy*sp];
  }
  function project(x,y,z){
    const [rx,ry,d]=local(x,y,z), q=Math.max(.05,d);
    return {x:.5+focal*rx/(w*q),y:.5-focal*ry/(h*q),depth:d,back:d<=.055};
  }
  return {eye,w,h,focal,local,project};
}
export function flightToCabin(o,f){
  const dx=o.x-f.x,dy=o.y-f.y,dz=o.z-f.z;
  const sy=Math.sin(f.yaw),cy=Math.cos(f.yaw),sp=Math.sin(f.pitch),cp=Math.cos(f.pitch),z=-sy*dx+cy*dz;
  return [HELM.x+cy*dx+sy*dz,HELM.y+cp*dy+sp*z,HELM.z-sp*dy+cp*z];
}
export function cabinGeometry(p) {
  const faces=[], trim=['#b67d54','#599a98','#a9789c'][p.cabin], wall='#899998', light='#edc994', steel='#3d535c', charcoal='#253842', brass='#ac8860';
  function quad(points,color,outline){faces.push({points,color,outline});}
  function box(x,y,z,w,h,d,top,side=top,front=side) {
    const l=x-w/2,r=x+w/2,b=y-h/2,t=y+h/2,f=z-d/2,a=z+d/2;
    const v=[[l,b,f],[r,b,f],[r,t,f],[l,t,f],[l,b,a],[r,b,a],[r,t,a],[l,t,a]];
    const parts=[[[0,1,2,3],front],[[4,5,6,7],front],[[0,4,7,3],side],[[1,5,6,2],side],[[3,2,6,7],top],[[0,1,5,4],side]];
    for(const [ids,col] of parts)quad(ids.map(i=>v[i]),col,'rgba(28,44,50,.18)');
  }
  function field(x0,x1,z0,z1,h,roof){
    const cols=Math.ceil((x1-x0)/1.23), rows=Math.ceil((z1-z0)/1.12), dx=(x1-x0)/cols,dz=(z1-z0)/rows;
    for(let i=0;i<cols;i++)for(let j=0;j<rows;j++){
      const x=x0+dx*i,z=z0+dz*j;
      quad([[x,h,z],[x+dx,h,z],[x+dx,h,z+dz],[x,h,z+dz]],roof?'#a2ada8':(i+j)%3?'#62777a':'#576b72',roof?'#85948f':'#34484f');
    }
  }
  function wallX(x,z0,z1,height){
    for(let z=z0;z<z1-.01;z+=.92){
      const end=Math.min(z1,z+.92);
      quad([[x,.1,z],[x,height,z],[x,height,end],[x,.1,end]],'#8e9d98','#697a7a');
    }
  }
  function wallZ(z,x0,x1,height){
    for(let x=x0;x<x1-.01;x+=.96){
      const end=Math.min(x1,x+.96);
      quad([[x,.1,z],[end,.1,z],[end,height,z],[x,height,z]],wall,'#6d7e7e');
    }
  }
  field(-4.10,4.10,-3.20,3.29,.08,false);field(-4.10,4.10,-3.20,3.29,3.12,true);
  wallX(-4.04,-3.2,3.3,3.13);wallX(4.04,-3.2,3.3,3.13);wallZ(3.28,-4.03,4.03,3.12);
  box(2.72,1.39,3.18,1.43,2.57,.12,steel);box(2.72,1.38,3.09,1.16,2.23,.04,'#768986');box(2.72,1.38,3.064,.03,2.23,.02,steel);
  box(-1.17,.43,-3.18,5.92,.69,.20,wall);box(-1.17,2.98,-3.18,5.92,.30,.21,steel);
  for(const x of [-4.05,-1.37,1.37]){box(x,1.79,-3.15,.12,2.23,.13,brass);}
  for(const x of [-2.74,0])box(x,2.78,-3.04,2.49,.035,.09,light);
  for(const x of [-3.89,3.89])box(x,2.75,0,.08,.07,6.20,light);
  for(const z of [-2.24,-.75,.75,2.08])box(3.96,1.45,z,.26,2.33,1.20,wall,steel);
  for(let i=0;i<p.bunks;i++){
    const [x,dy,z]=berthLocations[i];
    box(x,.39+dy,z,1.65,.55,2.43,steel);box(x,.72+dy,z,1.49,.22,2.28,'#ded9bc');
    box(x,.86+dy,z+.27,1.42,.16,1.50,trim);box(x,.90+dy,z-.73,1.03,.16,.43,'#e3ddc4');
    box(x,1.22+dy,z+1.17,1.61,1.09,.12,steel);box(x,1.68+dy,z+1.095,1.38,.052,.03,light);
  }
  box(0,.94,-1.72,3.38,.16,1.18,'#c2c7ae',wall);
  for(const x of [-.78,.78]){
    box(x,1.43,-1.96,1.04,.68,.12,charcoal);
    box(x,1.43,-1.884,.88,.52,.025,'#538e91');
    for(let i=0;i<4;i++)box(x-.10,1.26+i*.081,-1.86,(i%3+1)*.17,.022,.012,'#a1d9c7');
    box(x,.58,-.77,.65,.20,.62,trim);box(x,.80,-.49,.65,.57,.12,trim);
  }
  const mount=p.cabinMount==='berth'?[-2.55,1.79,2.77]:[1.56,1.03,-1.85];
  box(mount[0],mount[1],mount[2],.50,.09,.36,brass);
  box(mount[0],mount[1]+.17,mount[2],.15,.28,.15,p.stats.samples?'#85bfac':light);
  const people=[[-3.01,-.46],[-.79,-.74],[3.39,-.81]];
  for(const id of p.crew){
    const [x,z]=people[id],y=id===1?.91:1.11;
    box(x,y,z,.41,.63,.30,['#598489','#a18458','#718c75'][id]);box(x,y+.45,z,.29,.32,.25,'#b99577');
    for(const s of [-1,1])box(x+s*.12,y*.45,z,.16,y*.84,.18,charcoal);
  }
  const mid=HELM.x;
  field(1.74,3.70,-7.21,-3.12,.085,false);field(1.74,3.70,-7.21,-3.12,2.56,true);
  for(const s of [-1,1]){wallX(mid+s*.98,-7.2,-3.1,2.60);for(let i=0;i<6;i++)box(mid+s*.94,2.11,-3.47-i*.65,.065,.08,.38,light);}
  function rib(z){
    for(const s of [-1,1])box(mid+s*.92,1.36,z,.10,2.54,.17,steel);
    box(mid,2.56,z,1.96,.17,.21,steel);
  }
  for(const z of [-3.2,-5.18,-7.12])rib(z);
  const L=mid-2.39,R=mid+2.39;
  field(L,R,-12.23,-7.12,.09,false);field(L,R,-12.23,-7.12,2.78,true);
  wallZ(-7.12,L,mid-.99,2.79);wallZ(-7.12,mid+.99,R,2.79);
  for(const s of [-1,1]){
    const x=mid+s*2.38;
    wallX(x,-8.44,-7.12,2.79);box(x,.43,-10.30,.13,.67,3.90,wall);
    box(x,2.66,-10.30,.14,.17,3.90,steel);for(const z of [-8.44,-10.02,-12.23])box(x,1.72,z,.09,1.88,.09,steel);
    box(x-s*.32,.58,-10.24,.61,.89,1.99,wall,charcoal);
  }
  box(mid,.43,-12.23,4.82,.69,.15,steel);box(mid,2.70,-12.23,4.74,.16,.16,steel);
  for(const s of [-1,1])box(mid+s*1.78,1.7,-12.22,.065,2.03,.065,steel);
  box(mid,.5,-10.99,3.90,.80,.78,wall,charcoal);
  for(const s of [-1,0,1]){
    const x=mid+s*.94;
    box(x,.92,-10.76,.78,.40,.14,charcoal);
    box(x,.95,-10.675,.67,.29,.015,'#497b7d');
    for(let i=0;i<3;i++)box(x-.01,.86+i*.065,-10.659,.38+i*.054,.017,.012,i===0?light:'#a0d4c4');
  }
  box(mid,.67,-9.56,.84,.21,.82,trim);box(mid,1.08,-9.16,.80,.91,.13,trim);
  for(const s of [-1,1]){box(mid+s*.42,.91,-9.64,.14,.13,.39,steel);box(mid+s*.46,1.10,-10.18,.16,.22,.16,trim);}
  return faces;
}
export function drawInterior(c,lens,geometry){
  const drawn=[],near=.045;
  for(const face of geometry){
    const cam=face.points.map(v=>lens.local(...v));
    if(cam.every(v=>v[2]<near))continue;
    const clipped=[];
    for(let i=0;i<cam.length;i++){
      const a=cam[i],b=cam[(i+1)%cam.length],ia=a[2]>=near,ib=b[2]>=near;
      if(ia)clipped.push(a);
      if(ia!==ib){const u=(near-a[2])/(b[2]-a[2]);clipped.push([a[0]+(b[0]-a[0])*u,a[1]+(b[1]-a[1])*u,near]);}
    }
    if(clipped.length<3)continue;
    const points=clipped.map(([x,y,z])=>[lens.w*.5+lens.focal*x/z,lens.h*.5-lens.focal*y/z]);
    if(points.every(p=>p[0]<0)||points.every(p=>p[0]>lens.w)||points.every(p=>p[1]<0)||points.every(p=>p[1]>lens.h))continue;
    drawn.push({points,color:face.color,outline:face.outline,depth:clipped.reduce((s,a)=>s+a[2],0)/clipped.length});
  }
  drawn.sort((a,b)=>b.depth-a.depth);c.lineWidth=.7;
  for(const face of drawn){
    const pts=face.points;c.beginPath();c.moveTo(...pts[0]);for(let i=1;i<pts.length;i++)c.lineTo(...pts[i]);c.closePath();
    c.fillStyle=face.color;c.fill();c.strokeStyle=face.outline;c.stroke();
  }
}
