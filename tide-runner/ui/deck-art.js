import * as T from '../vendor/three.module.js';

// A repeatable hand-cut deck with nail heads, end joints, bleached grain and painted lane dashes.
export function deckTexture(){
  const c=document.createElement('canvas');c.width=768;c.height=400;const g=c.getContext('2d');
  let seed=107357;
  const rnd=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  g.fillStyle='#756958';g.fillRect(0,0,c.width,c.height);
  const woods=['#cfa780','#d1aa82','#d7b58d','#cfaa80','#d3b58d','#cba781','#ddbb92','#d5b48e'];
  for(let j=0;j<8;j++){
    const y=j*50,joint=Math.floor(105+rnd()*558);
    g.fillStyle=woods[j];g.fillRect(0,y+1,768,48);
    g.fillStyle='#e2c59a';g.fillRect(0,y+2,768,1);
    g.strokeStyle='#aa8768';g.lineWidth=1;g.beginPath();g.moveTo(joint,y+2);g.lineTo(joint-2,y+47);g.stroke();
    for(let k=0;k<30;k++){
      const x=rnd()*768,ly=y+4+rnd()*42,len=10+rnd()*125;
      g.strokeStyle=k%3?'rgba(112,84,57,.12)':'rgba(255,230,186,.22)';g.lineWidth=.6+rnd()*.8;
      g.beginPath();g.moveTo(x,ly);g.bezierCurveTo(x+len*.24,ly-2.4,x+len*.59,ly+1.5,x+len,ly-.7);g.stroke();
    }
    if(j%2===0){
      const x=58+rnd()*650,ey=y+13+rnd()*23;
      for(let r=1;r<=3;r++){g.beginPath();g.ellipse(x,ey,r*5.5,r*1.13,-.04,0,Math.PI*2);g.strokeStyle='rgba(106,76,54,.28)';g.stroke();}
    }
    for(const x of [22,joint-8,joint+8,746]){g.fillStyle='#84715d';g.beginPath();g.ellipse(x,y+14,1.8,2.2,0,0,Math.PI*2);g.fill();}
  }
  for(const x of [278,484]){
    g.fillStyle='#ece1bf';g.fillRect(x,47,7,97);g.fillRect(x,253,7,42);
    for(let j=0;j<75;j++){g.fillStyle='rgba(190,162,127,.55)';g.fillRect(x+rnd()*7,47+rnd()*249,.7+rnd()*1.4,1+rnd()*3);}
  }
  const tex=new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace;tex.anisotropy=4;return tex;
}
export function paintSky(w,h){
  const sky=document.getElementById('sky');if(!sky)return;
  let c=sky.querySelector('canvas');
  if(!c){c=document.createElement('canvas');c.setAttribute('aria-hidden','true');c.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none';sky.prepend(c);}
  c.width=Math.min(1500,w);c.height=Math.round(h*c.width/w);
  const g=c.getContext('2d'),W=c.width,H=c.height;
  function cloud(x,y,size,alpha,phase){
    g.save();g.translate(x,y);g.scale(size,size*.42);g.globalAlpha=alpha;
    const gradient=g.createLinearGradient(0,-18,0,8);gradient.addColorStop(0,'#fff3d8');gradient.addColorStop(.56,'#f6eee0');gradient.addColorStop(1,'#a8cdca');
    g.fillStyle=gradient;g.beginPath();g.moveTo(-64,1);
    g.bezierCurveTo(-58,-4,-51,-4,-43,-6);g.bezierCurveTo(-38,-16,-25,-17,-19,-13);
    g.bezierCurveTo(-10,-31,3,-29,14,-19+phase);g.bezierCurveTo(22,-21,31,-15,34,-10);
    g.bezierCurveTo(45,-14,52,-9,55,-6);g.bezierCurveTo(61,-6,69,-2,81,2);
    g.bezierCurveTo(44,5,4,4,-12,4);g.bezierCurveTo(-29,5,-54,4,-64,1);g.fill();
    g.fillStyle='#e3e8d9';g.globalAlpha=alpha*.5;g.beginPath();g.ellipse(42,5,52,1.2,0,0,2*Math.PI);g.fill();g.restore();
  }
  const s=Math.min(W/390,2.1);
  cloud(W*.04,H*.23,1.16*s,.65,3);cloud(W*.33,H*.20,.80*s,.55,-2);
  cloud(W*.91,H*.133,.98*s,.67,-1);cloud(W*.72,H*.305,1.28*s,.48,4);
  cloud(W*.32,H*.33,.63*s,.36,3);
}
