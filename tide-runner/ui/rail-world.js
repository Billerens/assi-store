import * as T from '../vendor/three.module.js';

export function ballastMaterial(){
  const c=document.createElement('canvas');c.width=512;c.height=320;
  const g=c.getContext('2d'),palette=['#5c5b59','#595658','#807367','#77746d','#686461','#736a64','#908276'];
  let seed=5351;
  function rand(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;}
  g.fillStyle='#57565a';g.fillRect(0,0,c.width,c.height);
  for(let i=0;i<7200;i++){
    const x=rand()*c.width,y=rand()*c.height,w=1+rand()*5.8,h=w*(.57+rand()*.41);
    g.fillStyle=palette[i%palette.length];g.beginPath();g.moveTo(x-w,y+.1*h);
    g.lineTo(x-w*.61,y-h*.74);g.lineTo(x+w*.22,y-h);g.lineTo(x+w,y-h*.19);
    g.lineTo(x+w*.52,y+h*.68);g.lineTo(x-w*.42,y+h*.71);g.closePath();g.fill();
  }
  const map=new T.CanvasTexture(c);map.colorSpace=T.SRGBColorSpace;map.anisotropy=4;
  return new T.MeshLambertMaterial({map});
}
export function ballastGeometry(){const g=new T.BoxGeometry(7.43,.46,4.028);g.translate(0,-.36,0);g.computeBoundingSphere();return g;}

export function vaultMaterial(){
  const c=document.createElement('canvas');c.width=1024;c.height=320;
  const g=c.getContext('2d');
  g.fillStyle='#545762';g.fillRect(0,0,c.width,c.height);
  const set=['#78767b','#79767a','#827b79','#726f76','#7f797b','#747179','#77747a'];
  for(let j=0;j<20;j++){
    const offset=j%2?16:0;
    for(let i=-1;i<33;i++){
      const x=i*32+offset, y=j*16, shade=(Math.imul(i+4,391)+Math.imul(j+1,271)+Math.imul(i*j,131))>>>0;
      g.fillStyle=set[shade%set.length];g.fillRect(x+.9,y+.8,30.9,14.6);
      g.fillStyle='rgba(234,219,195,.14)';g.fillRect(x+1,y+1,29,.8);
      g.fillStyle='rgba(51,48,56,.14)';g.fillRect(x+5+shade%12,y+4+shade%8,4+shade%10,1);
    }
  }
  for(const side of [0,1]){
    const x=side?c.width-98:0;
    g.fillStyle='#4e6a71';g.fillRect(x,0,98,c.height);
    for(let j=-1;j<16;j++)for(let i=0;i<4;i++){
      const tx=x+i*24.5,ty=j*21;
      g.fillStyle=(i+j)%3===0?'#75918e':'#708b88';g.fillRect(tx+1,ty+1,23,19.5);
    }
    g.fillStyle='#b39a69';g.fillRect(side?x:x+93,0,5,c.height);
  }
  const map=new T.CanvasTexture(c);map.colorSpace=T.SRGBColorSpace;map.anisotropy=4;
  return new T.MeshLambertMaterial({map,side:T.DoubleSide});
}
export function vaultGeometry(){
  const section=[[-3.97,-.15],[-3.97,2.03]];
  for(let i=1;i<=24;i++){
    const a=Math.PI*(1-i/24);
    section.push([Math.cos(a)*3.97,2.03+Math.sin(a)*3.97]);
  }
  section.push([3.97,-.15]);
  const lengths=[0],positions=[],uv=[],indices=[];
  for(let i=1;i<section.length;i++)lengths.push(lengths[i-1]+Math.hypot(section[i][0]-section[i-1][0],section[i][1]-section[i-1][1]));
  for(let i=0;i<section.length;i++){
    const [x,y]=section[i],u=lengths[i]/lengths.at(-1);
    positions.push(x,y,2.004,x,y,-2.004);uv.push(u,0,u,1);
    if(i){const a=(i-1)*2;indices.push(a,a+1,a+2,a+2,a+1,a+3);}
  }
  const geom=new T.BufferGeometry();geom.setAttribute('position',new T.Float32BufferAttribute(positions,3));geom.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
  geom.setIndex(indices);geom.computeVertexNormals();geom.computeBoundingSphere();return geom;
}

const LANE=2.06;
const clip=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
function railbed(h){
  const near=Math.floor((h.d-11)/4),end=Math.ceil((h.d+124)/4);
  for(let i=near;i<=end;i++){
    const z=i*4;
    if(h.g.renderer){
      h.asset('railBed',0,0,z);
      h.asset('railSleepers',0,0,z);
    }else{
      h.quad(-3.68,-.13,3.68,-.13,z-2.03,z+2.03,'#746c66');
      for(const lane of [-LANE,0,LANE]){
        for(let s=0;s<4;s++)h.quad(lane-.90,-.064,lane+.90,-.064,z-1.5+s,z-1.32+s,'#564e4d');
        for(const side of [-1,1])h.quad(lane+side*.61-.049,.045,lane+side*.61+.049,.045,z-2.01,z+2.01,'#c4b9a5');
      }
    }
    for(const side of [-1,1]){
      h.box(side*3.67,-.066,z,.163,.21,4.027,'#9b9283');
      if(i%3===0){h.box(side*3.66,-.22,z,.236,.65,.32,'#6d726f');}
    }
  }
}
function furniture(h,z,i){
  // A cantilevered platform leaves the view forward open across all three tracks.
  const side=i%5<3?-1:1,x=side*5.7;
  h.box(x,.23,z,3.32,.61,13.96,'#a39a87');
  h.box(side*4.078,.55,z,.16,.10,13.89,'#eac16f');
  for(const dz of [-4.7,4.7]){
    h.box(side*6.03,2.16,z+dz,.155,3.28,.145,'#45616c');
    for(const s of [-1,1])h.box(side*6.03+s*.43,3.53,z+dz,.10,1.21,.14,'#486774',0,0,-s*.77);
  }
  h.box(x,3.92,z,3.72,.17,13.80,'#527883',0,0,side*.06);
  h.box(side*3.87,3.85,z,.095,.19,13.78,'#d9b379');
  for(const dz of [-3.8,2.3]){h.box(x,3.74,z+dz,.12,.055,1.23,'#ffdf9c');}
  h.box(side*5.36,1.07,z, .72,.13,2.10,'#ad7553');
  h.box(side*5.6,1.33,z,.13,.49,2.06,'#a66a4c');
  for(const dz of [-.7,.7])h.box(side*5.38,.76,z+dz,.36,.46,.11,'#4a6570');
}
function ramp(h,x,at,length,height,descending){
  const y0=descending?height:.06,y1=descending?.06:height;
  const world=(s,t,dy=0)=>h.world(x+s,y0+(y1-y0)*t+dy,at+length*t);
  h.g.quad(world(-.90,0),world(.90,0),world(.90,1),world(-.90,1),'#976540');
  for(const side of [-1,1]){
    h.g.quad(world(side*.88,0,.015),world(side*.75,0,.015),world(side*.75,1,.015),world(side*.88,1,.015),'#f5bb64');
    h.g.quad(world(side*.89,0,-.025),world(side*.89,1,-.025),h.world(x+side*.89,.03,at+length),h.world(x+side*.89,.03,at),'#785844');
  }
  const count=Math.max(4,Math.ceil(length/1.65));
  for(let i=1;i<count;i++){
    const t=i/count;
    h.g.quad(world(-.72,t,.018),world(.72,t,.018),world(.72,t+.018,.018),world(-.72,t+.018,.018),'#d4b287');
    if(i%2===1)for(const sign of [-1,1]){
      const a=t+.035,b=t+.080;
      h.g.quad(world(0,b,.023),world(sign*.32,a,.023),world(sign*.32,a+.017,.023),world(0,b+.018,.023),'#ffe6a5');
    }
  }
}
function simpleCar(h,x,z,length,height,type){
  // Split the body into short longitudinal pieces. Canvas painter ordering then keeps
  // the courier visible while crossing the near end and while running on the roof.
  const n=Math.ceil(length/1.55),start=z-length/2;
  const freight=type==='cargoWagon',body=freight?'#b66646':type==='metroCab'?'#bc5644':'#427984';
  for(let i=0;i<n;i++){
    const a=start+i*length/n,b=start+(i+1)*length/n,at=(a+b)/2,w=type==='metroCab'&&i===0?.80:.90;
    h.box(x,1.37*height,at,w*2,1.91*height,(b-a)+.018,body);
    h.box(x,2.42*height,at,w*1.89,.25*height,(b-a)+.018,freight?'#caa472':'#c0b9a6');
    for(const side of [-1,1]){
      if(!freight)h.box(x+side*(w+.006),1.78*height,at,.02,.58*height,(b-a)*.67,'#345661');
      h.box(x+side*(w+.007),.94*height,at,.026,.103*height,(b-a)+.019,freight?'#92573f':'#e9cd96');
    }
  }
  if(type==='metroCab'){
    h.box(x,1.89*height,start-.02,1.40,.71*height,.08,'#2d4956');
    h.box(x,1.9*height,start-.065,.055,.65*height,.015,'#ceaa83');
    for(const side of [-1,1])h.box(x+side*.46,1.13*height,start-.07,.19,.15*height,.028,'#fff1b2');
  }
}
function lamps(h,x,z,height){
  const d=z-h.d;if(d>90||d<-.25)return;
  for(const side of [-1,1]){
    h.g.glow(x+side*.57+h.curve(z),1.12*height,h.d-z+.060,.52,.40,'#ffe59d',.65);
    if(d<32)h.g.glow(x+side*.57+h.curve(z),1.12*height,h.d-z+.061,.19,.14,'#fff7d2',.9);
  }
}
function rollingStock(h,train){
  const R=window.TideRace,start=R.trainFront(train,h.d),tail=start+train.length;
  if(tail+(train.down||0)<h.d-9||start-(train.ramp||0)>h.d+h.far)return;
  const x=(train.lane-1)*LANE,H=train.height/2.55;
  if(train.ramp)ramp(h,x,start-train.ramp,train.ramp,train.height,false);
  if(train.down)ramp(h,x,tail,train.down,train.height,true);
  const count=Math.max(1,Math.round(train.length/10.0)),pitch=train.length/count;
  for(let i=0;i<count;i++){
    const z=start+(i+.5)*pitch;
    if(z+pitch*.5<h.d-8||z-pitch*.5>h.d+h.far)continue;
    const name=train.moving?(i===0?'metroCab':'metroCoach'):'cargoWagon';
    if(h.g.renderer)h.asset(name,x,0,z,[1,H,(pitch-.035)/10]);
    else simpleCar(h,x,z,pitch-.03,H,name);
    if(train.moving||train.ramp)h.g.trainShadow(x,z-h.d,pitch,1.95);
  }
  if(train.moving){
    lamps(h,x,start,H);
    if(!h.g.reduced&&start-h.d<14&&tail>h.d-6){
      for(let j=0;j<4;j++){
        const a=start+2.3+j*5.6+(h.r.tick*.105+j*.47)%1.9;
        if(a>tail||Math.abs(a-h.d)>12)continue;
        const y=.055+((h.r.tick+j*.29)%8)/64;
        h.box(x+(x>=0?-.73:.73),y,a,.024,.025,.35,'#ffe2a6',-.14);
      }
    }
  }
}
function tunnel(h,t){
  const start=t.z,end=t.end,centre=2.03,r=3.97;
  if(end<h.d-11||start>h.d+h.far)return;
  const near=Math.max(start,Math.floor((h.d-11-start)/4)*4+start);
  const far=Math.min(h.d+h.far,end);
  for(let z=near;z<far;z+=4){
    const back=Math.min(z+4.015,end),mid=(z+back)*.5;
    // A short curved vault mesh keeps the sky occluded in both renderers.
    if(h.g.renderer)h.asset('railVault',0,0,mid,[1,1,(back-z)/4]);
    else {
      h.box(-4.02,centre*.5,mid,.22,centre,back-z,'#4c6972');
      h.box(4.02,centre*.5,mid,.22,centre,back-z,'#4c6972');
      for(let j=0;j<10;j++){
        const a=j*Math.PI/10,b=(j+1)*Math.PI/10;
        h.quad(Math.cos(a)*r,centre+Math.sin(a)*r,Math.cos(b)*r,centre+Math.sin(b)*r,z,back,j%3===0?'#676977':'#646772');
      }
    }
    const i=Math.round((z-start)/4);
    for(const side of [-1,1]){
      h.box(side*3.72,2.85,mid,.082,.099,back-z,'#a79477');
      h.box(side*3.76,2.71,mid,.065,.066,back-z,'#495759');
      h.box(side*1.46,5.53,mid,.21,.13,back-z,'#59616a');
      if(i%3===1){
        h.box(side*1.46,5.44,mid,.23,.061,1.73,'#ffedb2');
        h.g.glow(side*1.46,5.32,h.d-mid,.69,.28,'#ffcf86',.57);
      }
      if(i%5===0){
        h.box(side*3.81,1.11,mid,.23,1.54,1.18,'#425a65');
        h.box(side*3.68,1.1,mid,.054,1.38,.99,'#639196');
        h.box(side*3.65,1.11,mid+.28,.04,.058,.18,brassPaint);
      }
    }
    if(i%2===0){
      if(h.g.renderer)h.asset('tunnelRib',0,0,z);
      for(const side of [-1,1]){
        h.box(side*3.85,1.27,mid,.082,.063,back-z,'#b98958');
        h.box(side*3.90,2.07,mid,.035,.43,.96,'#94785c');
        h.box(side*3.846,2.1,mid,.070,.155,.78,'#ffcb88');
        h.g.glow(side*3.82+h.curve(mid),2.10,h.d-mid,.59,.31,'#ffb96d',.48);
      }
    }
  }
  h.asset('railPortal',0,0,start);
  h.asset('railPortal',0,0,end,[1,1,1],PI);
}
const PI=Math.PI;
const brassPaint='#c79765';
export function drawRailway(h,blocks){
  railbed(h);
  const tunnels=blocks.flatMap(b=>b.tunnels);
  for(let i=Math.floor((h.d-9)/18);i<=Math.ceil((h.d+122)/18);i++){
    const z=i*18;
    if(tunnels.some(t=>z>t.z-8&&z<t.end+7))continue;
    if(i%2===0)h.asset('railGantry',0,0,z);
    if(h.g.renderer)for(const x of [-LANE,0,LANE]){
      h.box(x,4.935,z,.017,.018,18.06,'#49575a');
      h.box(x,5.06,z,.014,.014,18.06,'#64747a');
    }
    if((i%5+5)%5===1)h.asset('railSignal',3.30,0,z+.7);
    if((i%4+4)%4===0)furniture(h,z+6,i);
  }
  for(const b of blocks){
    for(const train of b.trains)rollingStock(h,train);
    for(const t of b.tunnels)tunnel(h,t);
  }
}
export function railwayImpact(h,r,x,y,z){
  if(h.g.reduced||h.preview||r.rules<3)return;
  if(r.wave<0&&!r.air){
    if(r.surge>0){
      for(const side of [-1,1]){
        for(let j=0;j<4;j++){
          const age=((r.tick+j*6)%24)/24,fade=1-age;
          h.g.piece('box',x+side*(.20+.16*age),y+.09+.046*Math.sin(age*PI),z+.25+2.45*age,
            .085*fade,.044*fade,.52*fade,j%2?'#bafbe7':'#4fdcc9',-.026,side*.04);
        }
        h.g.glow(x+side*.20,y+.13,z+.42,.35,.23,'#8af8df',.58);
      }
    } else {
      const slide=r.slide>0,cycle=window.TideRace.stride(r)*2;
      for(let j=0;j<(slide?8:4);j++){
        const phase=(cycle+j*.17)%1;
        if(!slide&&phase>.67)continue;
        const sign=(Math.floor(cycle+j*.17)+j)%2?1:-1;
        const fade=1-phase,size=(slide?.072:.052)*fade;
        const dx=sign*(.14+.16*phase),dy=(slide?.23:.14)*Math.sin(phase*PI)+.045;
        h.g.piece('box',x+dx,y+dy,z+.18+phase*(slide?1.68:.95),size,size*.66,size*(slide?2.35:1),slide?'#dfb480':'#bcab94',0,phase+j);
      }
    }
  }
  const near=(r.tick-r.nearTick)/32,land=(r.tick-r.roofTick)/26;
  if(near>=0&&near<1){
    for(const side of [-1,1])for(let i=0;i<3;i++){
      const at=z+.4+.65*i+1.8*near;
      h.g.piece('box',x+side*(.55+i*.21+near*.40),y+.42+i*.25,at,.018*(1-near),.025,(1-near)*1.12,'#a8dad5',0,side*.12);
    }
  }
  if(land>=0&&land<1){
    for(let i=0;i<9;i++){
      const angle=i*2.39996,spread=.18+land*.58,fade=1-land;
      h.g.piece('box',x+Math.cos(angle)*spread,y+.03+Math.sin(land*PI)*(.12+i%3*.04),z+Math.sin(angle)*spread,.07*fade,.065*fade,.13*fade,i%2?'#d7c3a6':'#b79572',0,angle);
    }
  }
}
