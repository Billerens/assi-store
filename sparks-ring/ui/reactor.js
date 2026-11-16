/* The same annulus and spark positions as the simulation, dressed as a working reactor.
 * This module owns no simulation clock, RNG or save data. */
(function (root, make) {
  var api = make();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SparksReactor = api;
})(typeof window === 'object' ? window : this, function () {
  'use strict';
  var TAU = Math.PI * 2;
  function number(n, fallback) { n = Number(n); return isFinite(n) ? n : fallback; }
  function clamp(n, low, high) { return Math.max(low, Math.min(high, n)); }
  function model(state, config, reduced) {
    var run = state.run || {}, cfg = config || {};
    var elapsed = Math.max(0, number(run.elapsedMs, 0));
    return {
      live: !!run.live, over: !!run.over, reduced: !!reduced, elapsed: elapsed,
      level: Math.max(1, number(run.level, 1)), combo: Math.max(0, number(run.combo, 0)),
      score: Math.max(0, number(run.score, 0)), reflected: Math.max(0, number(run.reflected, 0)),
      lives: Math.max(0, number(run.lives, 0)), maxLives: Math.max(1, number(cfg['lives.start'], 3)),
      heat: clamp(Math.max(number(run.cooldownMs, 0), number(run.cooldownUntil, 0) - elapsed) / Math.max(1, number(cfg['tap.cooldownMs'], 380)), 0, 1),
      hurt: number(run.hurtMs, 0) > 0,
      outer: clamp(number(cfg['spark.zoneOuter'], .92), .01, 1.2),
      inner: clamp(number(cfg['spark.zoneInner'], .45), 0, 1.1),
      sparks: (run.sparks || []).slice(0, 40).map(function (s) {
        return { a: number(s.a, 0) * Math.PI / 180, f: clamp(number(s.f, 0), 0, 1.3), up: !!s.up, hit: !!s.hit };
      }),
      rings: (run.rings || []).slice(-8).map(function (r) { return { kind: String(r.kind || ''), age: elapsed - number(r.at, elapsed) }; }).filter(function (r) { return r.age >= 0 && r.age <= 380; })
    };
  }
  function circle(c,x,y,r,fill,stroke,width) { c.beginPath(); c.arc(x,y,Math.max(0,r),0,TAU); if(fill){c.fillStyle=fill;c.fill();} if(stroke){c.strokeStyle=stroke;c.lineWidth=width||1;c.stroke();} }
  function rect(c,x,y,w,h,fill,r) { c.fillStyle=fill;c.beginPath();c.roundRect(x,y,w,h,r||0);c.fill(); }
  function line(c,x,y,xx,yy,color,width) { c.beginPath();c.moveTo(x,y);c.lineTo(xx,yy);c.strokeStyle=color;c.lineWidth=width||1;c.stroke(); }
  function poly(c,points,fill,stroke,width){c.beginPath();points.forEach(function(p,i){if(i)c.lineTo(p[0],p[1]);else c.moveTo(p[0],p[1]);});c.closePath();if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.lineWidth=width||1;c.stroke();}}
  function glow(c,x,y,r,color){var g=c.createRadialGradient(x,y,0,x,y,Math.max(1,r));g.addColorStop(0,color);g.addColorStop(1,'transparent');circle(c,x,y,r,g);}
  function arc(c,x,y,r,a,b,color,width){c.beginPath();c.arc(x,y,Math.max(0,r),a,b);c.strokeStyle=color;c.lineWidth=width||1;c.stroke();}
  function bolt(c,x,y,r){circle(c,x,y,r,'#243c42','#a1b09b',1);line(c,x-r*.45,y,x+r*.45,y,'#9faf9b',1);}
  function pipe(c,points,width){c.lineJoin='round';c.lineCap='round';c.beginPath();points.forEach(function(p,i){if(i)c.lineTo(p[0],p[1]);else c.moveTo(p[0],p[1]);});c.lineWidth=width+4;c.strokeStyle='#10292f';c.stroke();c.lineWidth=width;c.strokeStyle='#aa8156';c.stroke();c.lineWidth=1;c.strokeStyle='#e4c68b';c.stroke();c.lineCap='butt';}
  function crystal(c,x,y,r,t,hot){c.save();c.translate(x,y);c.rotate(Math.sin(t*.4)*.08);var a=hot?'#ba594b':'#6baa91',b=hot?'#ffb27e':'#c3f1b4';poly(c,[[0,-r],[-r*.6,-r*.1],[-r*.35,r*.65],[0,r],[r*.6,r*.1],[r*.32,-r*.65]],a,b,1.5);poly(c,[[0,-r],[0,r],[-r*.6,-r*.1]],b);poly(c,[[0,-r],[r*.32,-r*.65],[r*.6,r*.1],[0,0]],hot?'#ffcf92':'#edf8c7');c.restore();}
  function draw(c,m,w,h){
    var cx=w/2,cy=h/2,R=Math.max(28,Math.min(w,h)*.385),size=Math.min(w,h)/500;
    var t=m.reduced||!m.live?0:m.elapsed/1000;
    c.save();
    var wall=c.createLinearGradient(0,0,0,h);wall.addColorStop(0,'#28464c');wall.addColorStop(1,'#102a32');rect(c,0,0,w,h,wall);
    var step=Math.max(65,w/6);
    for(var i=0;i<7;i++){var x=i*step;line(c,x,0,x,h,'#3d5b5b',1);bolt(c,x+step*.8,18,2.5);bolt(c,x+step*.8,h-18,2.5);}
    pipe(c,[[0,cy-R*.78],[cx-R*.8,cy-R*.78],[cx-R*.8,cy-R*.34]],Math.max(4,size*10));
    pipe(c,[[w,cy+R*.72],[cx+R*.83,cy+R*.72],[cx+R*.83,cy+R*.2]],Math.max(4,size*10));
    // The upper instrument bank is a combo indicator, not an invented permanent unlock.
    var bankWidth=R*1.4,bankX=cx-bankWidth/2,bankY=Math.max(12,cy-R*1.18-22*size);
    rect(c,bankX,bankY,bankWidth,14*size+5,'#0f282f',3);
    var comboLamps=Math.min(12,Math.floor(m.combo));
    for(i=0;i<12;i++){var lampWidth=bankWidth/16;rect(c,bankX+bankWidth*.06+i*bankWidth*.075,bankY+4,lampWidth,Math.max(4,9*size),i<comboLamps?'#c7e4a3':'#395454',1);}
    if(h>w*1.1){
      var gy=cy+R*1.34;
      for(i=0;i<3;i++){
        var gx=cx+(i-1)*R*.62;
        circle(c,gx,gy,R*.2,'#bec1a2','#244148',Math.max(3,size*5));
        for(var j=0;j<5;j++){var aa=Math.PI+j*Math.PI/4;line(c,gx+Math.cos(aa)*R*.12,gy+Math.sin(aa)*R*.12,gx+Math.cos(aa)*R*.16,gy+Math.sin(aa)*R*.16,'#52706b',1);}
        var reading=i===0?Math.min(1,m.combo/20):i===1?Math.min(1,Math.log(1+m.level)/5):m.lives/m.maxLives;
        var ang=Math.PI+reading*Math.PI;line(c,gx,gy,gx+Math.cos(ang)*R*.13,gy+Math.sin(ang)*R*.13,i===2&&m.lives<=1?'#b34f3a':'#385d56',Math.max(1.5,size*2));circle(c,gx,gy,2,'#36554e');
      }
      c.fillStyle='#b5c9bc';c.font='500 '+Math.max(9,Math.min(12,R*.075))+'px sans-serif';c.textAlign='center';
      ['СЕРИЯ','ТЕМП','ЗАЩИТА'].forEach(function(label,index){c.fillText(label,cx+(index-1)*R*.62,gy+R*.31);});
    }
    circle(c,cx,cy,R*1.11,'#152f37','#829582',2);
    circle(c,cx,cy,R*1.05,'#4c6c67','#19383f',Math.max(5,size*10));
    circle(c,cx,cy,R*.99,'#102b34','#c4a46d',Math.max(2,size*4));
    for(i=0;i<12;i++){var a=i*TAU/12;bolt(c,cx+Math.cos(a)*R*1.07,cy+Math.sin(a)*R*1.07,Math.max(2,R*.022));}
    var lens=c.createRadialGradient(cx-R*.22,cy-R*.25,0,cx,cy,R);lens.addColorStop(0,'#1d4147');lens.addColorStop(1,'#081f29');circle(c,cx,cy,R*.97,lens);
    // Exact hit-zone bounds: the art never narrows or shifts the simulation's window.
    c.beginPath();c.arc(cx,cy,R*m.outer,0,TAU);c.arc(cx,cy,R*m.inner,0,TAU,true);c.fillStyle=m.hurt?'#b85a4938':'#719c761c';c.fill();
    circle(c,cx,cy,R*m.outer,null,m.hurt?'#e78a6a':'#c0b77e',Math.max(1.2,size*1.6));
    circle(c,cx,cy,R*m.inner,null,m.heat?'#ef957b':'#79b8ac',Math.max(1.2,size*1.6));
    for(i=0;i<48;i++){a=i*TAU/48;line(c,cx+Math.cos(a)*R*m.outer,cy+Math.sin(a)*R*m.outer,cx+Math.cos(a)*R*(m.outer-.02),cy+Math.sin(a)*R*(m.outer-.02),'#96b5a173',1);}
    var core=R*Math.min(.2,m.inner*.55),bright=m.heat?'#d8765635':m.live?'#8bdeb12a':'#557b6b18';
    glow(c,cx,cy,core*2.1,bright);crystal(c,cx,cy,core*(m.live?1:0.82),t,m.heat>0);
    if(m.heat){arc(c,cx,cy,core*1.34,-Math.PI/2,-Math.PI/2+TAU*m.heat,'#ed9a73',Math.max(2,size*3));}
    if(m.live&&!m.reduced){for(i=0;i<4;i++){a=i*TAU/4+t*.12;arc(c,cx,cy,core*1.65,a,a+.38,'#6d9f84',1);}}
    // Spark markers retain opposite direction cues and contrasting silhouettes.
    m.sparks.forEach(function(sp){
      var rr=R*sp.f,x=cx+Math.cos(sp.a)*rr,y=cy+Math.sin(sp.a)*rr;
      var inRange=sp.up&&!sp.hit&&sp.f>=m.inner&&sp.f<=m.outer;
      if(sp.hit){c.save();c.globalAlpha=.65;arc(c,cx,cy,rr,sp.a-.05,sp.a+.05,'#d8f2ad',Math.max(2,size*3));c.restore();return;}
      var radius=Math.max(3,Math.min(6,R*.03));
      if(sp.up){
        var tailR=Math.min(R*1.1,rr+R*.16),tailX=cx+Math.cos(sp.a)*tailR,tailY=cy+Math.sin(sp.a)*tailR;
        var trail=c.createLinearGradient(x,y,tailX,tailY);trail.addColorStop(0,'#ffd398');trail.addColorStop(1,'#ffca7900');line(c,x,y,tailX,tailY,trail,radius*.8);
        if(inRange)circle(c,x,y,radius*1.8,null,'#f5d793',1);
        c.save();c.translate(x,y);c.rotate(sp.a);poly(c,[[-radius*1.3,0],[radius*.2,-radius*.7],[radius,0],[radius*.2,radius*.7]],'#ffe3a5');c.restore();
      }else{
        line(c,cx+Math.cos(sp.a)*(rr-R*.08),cy+Math.sin(sp.a)*(rr-R*.08),x,y,'#9aafb8',1);
        c.save();c.translate(x,y);c.rotate(sp.a);poly(c,[[radius*1.3,0],[0,-radius*.85],[-radius*.7,0],[0,radius*.85]],'#122e38','#9db9c3',1.4);c.restore();
      }
    });
    m.rings.forEach(function(r){
      var p=r.age/380,ok=r.kind==='perfect'||r.kind==='ok';c.save();
      c.globalAlpha=1-p;c.strokeStyle=ok?'#d6efb3':'#e68b6c';c.lineWidth=ok?Math.max(2,size*3):Math.max(2,size*4);
      c.beginPath();c.arc(cx,cy,m.reduced?R*m.outer:core+(R*m.outer-core)*p,0,TAU);c.stroke();c.restore();
    });
    // Glass reflections stay away from the central play area.
    arc(c,cx,cy,R*.95,3.65,4.7,'#c8e2cc2c',Math.max(2,size*3));
    if(!m.live&&!m.over){c.fillStyle='#d2dfc9';c.font='600 '+Math.max(11,Math.min(16,R*.1))+'px sans-serif';c.textAlign='center';c.fillText('НАЧАТЬ',cx,cy+core*2.1);}
    c.restore();
  }
  return { model:model, draw:draw };
});
