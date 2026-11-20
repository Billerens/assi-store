'use strict';
const assert=require('node:assert/strict');
const S=require('../sim.js'),F=require('../ui/flight.js');
const clamp=n=>Math.max(-1,Math.min(1,n));
function fly(p,mode,dest){
  const stats=S.stats(p),f=F.create(p,mode,dest,stats);p.flight=f;
  for(let i=0;i<60*190&&!f.finish;i++){
    const g=F.guide(f),dx=g.x-f.x,dy=g.y-f.y,dz=g.z-f.z;
    const input={x:0,y:0,action:true,brake:false,boost:false};
    if(f.phase==='surface'){
      const d=Math.hypot(dx,dz);if(d>0.8){input.x=dx/d;input.y=dz/d;}
    }else{
      const yaw=Math.atan2(dx,-dz);
      input.x=clamp(Math.atan2(Math.sin(yaw-f.yaw),Math.cos(yaw-f.yaw))*3);
      input.y=clamp((f.pitch-Math.atan2(dy,Math.hypot(dx,dz)))*3);
      input.brake=mode===1&&f.hits<3&&F.gap(f,g)<44;
    }
    F.step(f,1/60,input,stats);
  }
  assert.equal(f.finish,'success','mission '+mode);
  assert.ok(S.settle(p,f,false));assert.equal(S.settle(p,f,false),false);
  assert.equal(S.validate({meta:p}),null);
  return f;
}
const p=S.fresh();
const before=p.credits;
assert.ok(S.trade(p,0,true));
const quote=S.quote(p,0,1);
const freight=fly(p,0,1);
assert.equal(p.credits,before+quote+freight.rings*12);
assert.deepEqual(p.cargo,[0,0,0]);
assert.ok(freight.rings>0);
assert.equal(fly(p,1,2).hits,3);
assert.equal(fly(p,2,0).samples,3);
assert.equal(p.trips,3);
assert.equal(p.points,S.level(p.xp)-1);
assert.ok(S.equip(p,'skill',1));
assert.ok(S.equip(p,'module',0));
assert.equal(S.stats(p).hold,10);
assert.ok(S.equip(p,'module',0));
assert.equal(S.stats(p).hold,6);
assert.ok(S.equip(p,'crew',0));assert.ok(S.stats(p).regen>5);
assert.equal(S.equip(p,'crew',0),false);
const saved=S.clone(p);
assert.equal(S.validate({meta:saved}),null);
assert.ok(S.trade(p,0,true));
const goods=p.cargo.slice(),wallet=p.credits;
const f=F.create(p,1,2,S.stats(p));p.flight=f;
assert.ok(S.settle(p,f,'recall'));
assert.equal(p.credits,wallet);assert.deepEqual(p.cargo,goods);assert.equal(p.port,0);
p.flight=F.create(p,1,2,S.stats(p));assert.ok(S.settle(p,p.flight,true));
assert.equal(p.credits,wallet+40);assert.deepEqual(p.cargo,goods);
console.log('Three flown contracts, manifests, ranks, fitting, crew, insurance and idempotent settlement passed.');
