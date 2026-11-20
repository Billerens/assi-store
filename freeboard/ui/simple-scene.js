// Canvas rendering path for browsers that decline a WebGL context.
import {createWalker,HELM} from './ship-interior.js';
import {interiorLens,flightToCabin,cabinGeometry,drawInterior} from './canvas-interior.js';
const worlds = [
  { texture: 'vesper', color: '#c99774', sky: '#2e293e', x: .59, y: .40 },
  { texture: 'pelagos', color: '#64a9b8', sky: '#123a49', x: .41, y: .40 },
  { texture: 'oriole', color: '#b0866d', sky: '#352536', x: .65, y: .43 }
];

function image(path) {
  const img = new Image();
  img.src = new URL(path, import.meta.url).href;
  return img;
}
function oval(ctx, x, y, rx, ry, fill) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}
function poly(ctx, points, fill, stroke) {
  ctx.beginPath();
  for (let i=0; i<points.length; i+=2) {
    if (i===0) ctx.moveTo(points[i], points[i+1]);
    else ctx.lineTo(points[i], points[i+1]);
  }
  ctx.closePath();
  ctx.fillStyle=fill;ctx.fill();
  if (stroke) {ctx.strokeStyle=stroke; ctx.stroke();}
}
function sprite(ctx, img, x, y, width, flip=false) {
  if (!img.complete || !img.naturalWidth || width < 1) return;
  const height = width * img.naturalHeight / img.naturalWidth;
  ctx.save();ctx.translate(x,y);
  if (flip) ctx.scale(-1,1);
  ctx.drawImage(img,-width/2,-height/2,width,height);
  ctx.restore();
}
function circleWorld(ctx, port, img, x, y, r, t) {
  const angle=-.27;
  const ring=(front)=>{
    if (port!==0) return;
    ctx.save();ctx.translate(x,y);ctx.rotate(angle);
    for (let i=0;i<5;i++) {
      ctx.strokeStyle=['#a78272','#e0b398','#71615f','#cda991','#a68e81'][i];
      ctx.lineWidth=Math.max(.7,r*.030);
      ctx.beginPath();ctx.ellipse(0,0,r*(1.41+i*.085),r*(.19+i*.014),0,front?0:Math.PI,front?Math.PI:Math.PI*2);ctx.stroke();
    }
    ctx.restore();
  };
  ring(false);
  ctx.save();ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.clip();
  ctx.fillStyle=worlds[port].color;ctx.fillRect(x-r,y-r,2*r,2*r);
  if (img.complete && img.naturalWidth) {
    const width=r*4, offset=(t*r*.009+port*r*.68)%width;
    ctx.drawImage(img,x-r-offset,y-r,width,r*2);
    ctx.drawImage(img,x-r-offset+width,y-r,width,r*2);
  }
  const shadow=ctx.createRadialGradient(x-r*.47,y-r*.27,r*.14,x+r*.13,y-r*.04,r*1.06);
  shadow.addColorStop(0,'rgba(255,228,187,.12)');shadow.addColorStop(.57,'rgba(32,29,46,.10)');shadow.addColorStop(.97,'rgba(21,21,39,.82)');
  ctx.fillStyle=shadow;ctx.fillRect(x-r,y-r,2*r,2*r);ctx.restore();
  ctx.strokeStyle=worlds[port].color;ctx.lineWidth=Math.max(.7,r*.008);ctx.beginPath();ctx.arc(x,y,r,-2.6,-.36);ctx.stroke();ring(true);
}

// Cabin coordinates follow the room, so the glass rims occlude the moving harbor outside.
function drawCabin(c,w,h,p,view) {
  const focus=view.focus||'overview', trim=['#b77d52','#599c97','#aa769a'][p.cabin];
  const width=1000, height=680;
  c.save();c.scale(w/width,h/height);
  const yaw=(view.yaw||0)*36, pitch=(view.pitch||0)*8;
  c.translate(yaw, pitch);
  const pane=focus==='window'?[25,40,975,575]:focus==='desk'?[125,50,940,392]:[195,85,805,330];
  const wall='#66767c', steel='#344859', seal='#182935', ceiling='#8b999b';
  c.fillStyle=ceiling;c.fillRect(-45,-35,1090,pane[1]+35);
  c.fillStyle=wall;c.fillRect(-45,pane[1],pane[0]+45,pane[3]-pane[1]);
  c.fillRect(pane[2],pane[1],1045-pane[2],pane[3]-pane[1]);
  c.fillStyle=steel;c.fillRect(-45,pane[3],1090,735-pane[3]);
  c.strokeStyle='#253641';c.lineWidth=17;c.strokeRect(pane[0],pane[1],pane[2]-pane[0],pane[3]-pane[1]);
  c.strokeStyle='#a5acab';c.lineWidth=6;c.strokeRect(pane[0]-7,pane[1]-7,pane[2]-pane[0]+14,pane[3]-pane[1]+14);
  for (const q of [.22,.79]) {
    const x=pane[0]+(pane[2]-pane[0])*q;
    poly(c,[x-5,pane[1],x+5,pane[1],x+18,pane[3],x+5,pane[3]],seal,'#7e9395');
  }
  if(focus==='window'){c.restore();return;}
  const berth=focus==='berth';
  if(berth){c.fillStyle=wall;c.fillRect(-40,-40,1080,760);}
  const bx=berth?110:30, by=berth?128:258, bw=berth?674:255, bh=berth?130:70;
  for(let i=0;i<p.bunks;i++){
    const y=by+i*(bh+11);
    c.fillStyle=seal;c.fillRect(bx-9,y-8,bw+18,bh+16);
    c.fillStyle='#364954';c.fillRect(bx,y,bw,bh);
    c.fillStyle='#b9c0b7';c.fillRect(bx+12,y+bh*.60,bw-24,bh*.28);
    c.fillStyle='#dee0c9';c.fillRect(bx+24,y+bh*.42,bw*.22,bh*.25);
    c.fillStyle=trim;c.fillRect(bx+bw*.34,y+bh*.48,bw*.59,bh*.36);
    c.fillStyle='#384758';for(let k=0;k<2;k++)c.fillRect(bx+bw*(.46+k*.32),y+bh*.48,5,bh*.4);
    c.fillStyle='#f5d194';c.fillRect(bx+15,y+7,bw*.23,4);
  }
  const desk = focus==='desk', dx=desk?169:526, dy=desk?348:335, dw=desk?700:390;
  if(!berth){
    poly(c,[dx,dy+48,dx+dw-60,dy+34,dx+dw,dy+78,dx+14,dy+99],'#a59a82',seal);
    for(let k=0;k<2;k++){
      const sx=dx+dw*(.19+k*.31), sy=dy-54;
      c.fillStyle=seal;c.fillRect(sx-4,sy-4,dw*.26+8,74);
      c.fillStyle='#247279';c.fillRect(sx,sy,dw*.26,64);
      for(let j=0;j<6;j++){c.fillStyle=j%2?'#9dd6c6':'#57a9a6';c.fillRect(sx+7,sy+8+j*8,dw*(.07+(j%3)*.045),2);}
    }
    for(const role of p.crew){
      const x=role===0?885:role===1?dx+dw*.27:388, y=role===1?dy+98:445;
      c.fillStyle='#243942';c.fillRect(x-8,y-7,7,46);c.fillRect(x+2,y-7,7,46);
      poly(c,[x-14,y-42,x+12,y-42,x+17,y-2,x-16,y-2],['#ba845c','#627b94','#729184'][role]);
      oval(c,x,y-54,9,13,'#bb967e');
    }
  }
  if((p.cabinMount==='berth')===berth || focus==='overview'){
    const atBerth=p.cabinMount==='berth';
    const x=atBerth?bx+bw*.82:dx+dw*.89, y=atBerth?by-6:dy+48;
    c.fillStyle='#273b46';c.fillRect(x-14,y,28,4);
    if(p.stats.samples)poly(c,[x-9,y,x-13,y-13,x-4,y-28,x+2,y-8,x+8,y-21,x+12,y],'#83bbad','#a4e3c9');
    else {c.strokeStyle='#c2a675';c.lineWidth=3;c.beginPath();c.ellipse(x,y-15,11,15,-.42,0,7);c.stroke();}
  }
  c.restore();
}

export class SimpleScene {
  constructor(canvas){
    this.canvas=canvas;this.ctx=canvas.getContext('2d');this.view='dock';
    this.stars=Array.from({length:170},(_,i)=>[(i*.61803398875)%1,(i*.754877666)%1]);
    this.planets=worlds.map(o=>image('./orbits/'+o.texture+'.webp'));
    this.sprites={};
    for(const name of ['dock-0','dock-1','dock-2','flight-0','flight-1','flight-2','station','shuttle','drone']){
      this.sprites[name]=image('./fallback/'+name+'.webp');
    }
  }
  project(o){
    const f=this.f;if(!f)return {x:.5,y:.5,back:false};
    if(this.lens)return this.lens.project(...flightToCabin(o,f));
    if(f.phase==='surface')return {x:.5+(o.x-f.x)*.05,y:.57+(o.z-f.z)*.045,back:false};
    const x=o.x-f.x,y=o.y-f.y,z=o.z-f.z,s=Math.sin(f.yaw),c=Math.cos(f.yaw),p=Math.sin(f.pitch),q=Math.cos(f.pitch);
    const forward=x*s-z*c,right=x*c+z*s,depth=forward*q+y*p;
    return {x:.5+right/Math.max(1,depth+7)*.8,y:.5-(y*q-forward*p)/Math.max(1,depth+7)*.65,back:depth<0,depth};
  }
  draw(p,tab,t,dt,view={}){
    const c=this.ctx,w=this.canvas.clientWidth,h=this.canvas.clientHeight;
    if(!w||!h)return;
    if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h;}
    this.f=p.flight;const f=this.f,land=f&&f.phase==='surface',port=f?f.dest:p.port,world=worlds[port];
    const inside=!land&&(view.mode==='walk'||view.mode==='pilot');
    this.lens=inside?interiorLens(view.mode==='walk'?(view.walker||createWalker()):{...HELM,yaw:view.lookYaw||0,pitch:view.lookPitch||0},w,h):null;
    if(inside){
      const key=[p.bunks,p.cabin,p.cabinMount,p.crew.join(','),!!p.stats.samples].join(':');
      if(key!==this.interiorKey){this.interiorKey=key;this.geometry=cabinGeometry(p);}
    }
    const cabin=!f&&tab==='quarters', inspecting=cabin&&view.focus&&view.focus!=='overview';
    const bg=c.createLinearGradient(0,0,0,h);bg.addColorStop(0,land?'#9eaaaa':'#131525');bg.addColorStop(1,land?'#a98364':world.sky);c.fillStyle=bg;c.fillRect(0,0,w,h);
    const ox=inside?-(this.lens.eye.yaw+(f?.yaw||0))*w*.7:cabin?(view.yaw||0)*w*.35:f?f.yaw*30:0, oy=inside?(this.lens.eye.pitch+(f?.pitch||0))*h*.7:cabin?(view.pitch||0)*h*.11:0;
    if(!land)for(const [x,y] of this.stars){c.fillStyle=y>.74?'#d9d3bb':'#a4b2c7';c.fillRect((x*w+ox+w*30)%w,(y*h+oy+h*30)%h,1+y*.5,1+y*.5);}
    const px=cabin?w*world.x+ox:w*.76, py=cabin?h*(inspecting?world.y:.3)+oy:h*.22;
    if(inside){
      const [x,y,z,r]=[[18,5,-153,28],[-17,7,-155,32],[14,-3,-149,25]][port];
      const pix=f?this.project({x:110,y:70,z:-365}):this.lens.project(x,y,z);
      if(pix.depth>1)circleWorld(c,port,this.planets[port],pix.x*w,pix.y*h,(f?74:r)*this.lens.focal/pix.depth,t);
    }else circleWorld(c,port,this.planets[port],px,py,Math.min(w,h)*(inspecting?.24:.16),t);
    if(!f){
      const s=Math.min(w,h);
      if(inside){
        const station=this.lens.project(port===1?19:-20,2,-48);
        if(station.depth>1)sprite(c,this.sprites.station,station.x*w,station.y*h,17*this.lens.focal/station.depth);
        for(let i=0;i<2;i++){
          const a=t*(i?.073:.13)+port+i*2,ship=this.lens.project(Math.sin(a)*(i?31:20),i?4.8:2.3+Math.cos(a*.8),i?-40:-26);
          if(ship.depth>1)sprite(c,this.sprites.shuttle,ship.x*w,ship.y*h,3.2*this.lens.focal/ship.depth,Math.cos(a)>0);
        }
        drawInterior(c,this.lens,this.geometry);return;
      }
      const stationX=port===1?.82:.16;
      sprite(c,this.sprites.station,w*stationX+ox,h*(inspecting?.42:.26)+oy,s*(inspecting?.32:.22));
      for(let i=0;i<2;i++){
        const a=t*(i?.073:.13)+port+i*2, x=.5+Math.sin(a)*(i?.43:.37);
        sprite(c,this.sprites.shuttle,w*x+ox,h*(i?.23:.42)+oy+Math.cos(a*.8)*h*.026,s*(i?.043:.077),Math.cos(a)>0);
      }
      if(cabin)drawCabin(c,w,h,p,view);
      else{
        c.save();c.translate(w*.49,h*.44);c.scale(1,.25);
        oval(c,0,0,s*.45,s*.45,'#48575f');
        c.strokeStyle='#d3b48b';c.lineWidth=4;c.beginPath();c.ellipse(0,0,s*.37,s*.37,0,0,7);c.stroke();c.restore();
        sprite(c,this.sprites['dock-'+p.frame],w*.48,h*.36,s*.74);
      }
      return;
    }
    const point=o=>{const a=this.project(o);return [a.x*w,a.y*h,a];};
    if(land){
      for(const node of f.nodes){if(node.taken)continue;const [x,y]=point(node);poly(c,[x-5,y+5,x-7,y-7,x-2,y-16,x+5,y+1,x+7,y-9,x+10,y+5],'#8dc8ba','#c9e7d9');}
      const [x,y]=point({x:0,y:0,z:0});sprite(c,this.sprites['dock-'+p.frame],x,y,58);oval(c,w*.5,h*.57,6,9,'#ddd6b9');return;
    }
    for(const g of f.gates.concat([f.goal])){const [x,y,a]=point(g);if(g.passed||a.back)continue;
      c.strokeStyle=g===f.goal?'#8be5df':'#e4ad78';c.lineWidth=2;c.beginPath();c.arc(x,y,Math.max(4,Math.min(130,1700/Math.max(2,a.depth+7))),0,7);c.stroke();}
    for(const e of f.enemies){const [x,y,a]=point(e);if(e.hp>0&&!a.back)sprite(c,this.sprites.drone,x,y,Math.max(10,Math.min(93,2300/Math.max(2,a.depth))));}
    for(const b of f.bolts){const [x,y,a]=point(b);if(!a.back)oval(c,x,y,2,4,b.enemy?'#ff8e85':'#8df1ee');}
    if(inside)drawInterior(c,this.lens,this.geometry);
    else sprite(c,this.sprites['flight-'+p.frame],w*.5,h*.72,Math.min(w,h)*.52);
  }
}
