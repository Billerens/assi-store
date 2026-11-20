'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const R=require('../race.js');
function ride(seed,seconds,bot){
  const c=R.course(seed),r=R.fresh(seed),inputs=[];
  for(let i=0;i<seconds*60&&!r.dead;i++){
    const act=bot(r,c);if(act&&R.input(r,act))inputs.push([r.tick,act]);R.step(r,c);
  }
  return {r,inputs};
}
function nextEvent(r,c) {
  const b=Math.floor(r.d/R.SPAN);
  const relevant=e=>e.z>r.d&&(r.wave>=0?e.key===r.wave:e.type==='row'||e.type==='entry');
  return R.block(c,b).events.find(relevant)||R.block(c,b+1).events.find(relevant);
}
function steer(r,target){return r.lane<target?'R':r.lane>target?'L':'';}
function distanceBot(r,c){
  const e=nextEvent(r,c);
  if(e.z-r.d>8)return;
  if(e.type==='entry')return steer(r,1);
  if(e.type==='row'){
    if(e.pattern[r.lane]==='.')return;
    const safe=[0,1,2].filter(l=>e.pattern[l]==='.').sort((a,b)=>Math.abs(a-r.pos)-Math.abs(b-r.pos))[0];
    return steer(r,safe);
  }
}
test('seed, timing and replay are reproducible beyond twenty minutes',()=>{
  const seed=43117,a=ride(seed,1205,distanceBot);
  assert.equal(a.r.dead,'');assert.ok(a.r.d>15000);assert.ok(a.inputs.length>200);
  const tape=R.encode(a.inputs);assert.deepEqual(R.decode(tape),a.inputs);
  assert.deepEqual(R.playback(seed,R.decode(tape),a.r.tick),a.r);
  assert.notDeepEqual(R.block(R.course(7),5).rows,R.block(R.course(9),5).rows);
});
test('26+ minutes of generated geometry always afford a route and settling time',()=>{
  for(let seed=1;seed<10;seed++){
    const c=R.course(seed);let prior=-100;
    for(let i=0;i<85;i++){
      const b=R.block(c,i);
      for(const row of b.rows){assert.ok(row.pattern.includes('.'));assert.ok((row.z-prior)/R.speed(row.z)>.93);prior=row.z;}
      const gates=b.events.filter(e=>e.type==='gate');for(const g of gates)assert.ok(g.mask>=1&&g.mask<=7);
    }
  }
});
test('short wave can be ridden and banked, once, on a physical landing',()=>{
  const {r}=ride(43117,16,(r,c)=>{
    const e=nextEvent(r,c);
    if(r.wave<0&&r.d<70&&r.d>53)return steer(r,2);
    if(r.wave>=0&&e.type==='gate'&&e.z-r.d<11)return steer(r,2);
    if(r.wave>=0&&e.type==='exit'&&e.z-r.d<9)return steer(r,0);
    return distanceBot(r,c);
  });
  assert.ok(r.banks>0);assert.ok(r.bank>=100);assert.equal(r.bestChain,2);
  assert.equal(R.score(r),Math.floor(r.d)+r.bank);
});
test('a missed landing loses the unbanked series',()=>{
  const c=R.course(9),r=R.fresh(9);r.d=67.95;r.lane=2;r.pos=2;
  while(r.d<119&&!r.dead){
    if(r.wave>=0&&r.lane<2)R.input(r,'R');R.step(r,c);
  }
  assert.equal(r.wave,-1);assert.equal(r.bank,0);assert.equal(r.gates,0);
});
test('one shift per jump, fast landing, and the brief’s example scores',()=>{
  const r=R.fresh(1);assert.ok(R.input(r,'U'));assert.ok(R.input(r,'R'));assert.equal(R.input(r,'L'),false);
  assert.ok(R.input(r,'D'));assert.equal(R.height(r),0);assert.ok(R.input(r,'L'));
  assert.equal(R.value(250,2),250);assert.equal(R.value(500,4),1000);assert.equal(R.value(650,5),1950);
});
test('fourth-gate landing opens the roof route and its second wave',()=>{
  const c=R.course(42),b=R.block(c,1),r=R.fresh(c.seed),w=b.waves[0],linked=b.waves[1];
  const landing=b.events.find(e=>e.type==='exit'&&e.roof);
  r.d=landing.z-.04;r.wave=w.key;r.pos=r.lane=0;r.raw=500;r.gates=4;r.blend=1;
  R.step(r,c);
  assert.equal(r.bank,1000);assert.equal(r.wave,-1);assert.ok(r.roofUntil>linked.start);
  while(r.d<linked.start&&!r.dead)R.step(r,c);
  assert.equal(r.dead,'');assert.equal(r.wave,linked.key);
  const late=R.fresh(c.seed);late.d=linked.start-.04;late.lane=late.pos=2;R.step(late,c);
  assert.equal(late.wave,-1);
});

test('a saved first-edition tape keeps its original collision, speed, gates and score',()=>{
  const r=R.playback(43117,[[348,'R'],[620,'R'],[648,'L']],1200,null,1);
  assert.equal(r.tick,822);assert.equal(r.dead,'D');assert.equal(r.bank,100);
  assert.equal(r.d,125.07425191482498);assert.equal(R.score(r),225);
  assert.equal(R.block(R.course(43117,1),0).events.some(e=>e.type==='token'),false);
});
test('physical pickups are deterministic, awarded once and honour their height and lane',()=>{
  const c=R.course(43117),b=R.block(c,0);
  const advance=(r,e)=>{r.d=e.z-.03;R.step(r,c);};
  const first=b.events.find(e=>e.type==='token');
  const p=R.fresh(43117);advance(p,first);R.step(p,c);assert.equal(p.tokens,1);
  const away=R.fresh(43117);away.pos=away.lane=0;advance(away,first);assert.equal(away.tokens,0);
  const jumping=R.fresh(43117);jumping.air=22;advance(jumping,first);assert.equal(jumping.tokens,0);
  const magnet=b.events.find(e=>e.type==='magnet');advance(p,magnet);assert.equal(p.magnet,270);
  away.lane=away.pos=1;advance(away,magnet);away.pos=away.lane=0;advance(away,first);assert.equal(away.tokens,1);
  const opposite=R.fresh(43117);opposite.magnet=10;opposite.pos=opposite.lane=2;
  const left=b.events.find(e=>e.type==='token'&&e.lane===0);advance(opposite,left);assert.equal(opposite.tokens,0);
  const boosted=R.fresh(43117,{magnet:3,boost:3});advance(boosted,magnet);assert.equal(boosted.magnet,540);
  const power=b.events.find(e=>e.type==='boost');boosted.pos=boosted.lane=power.lane;advance(boosted,power);
  assert.equal(boosted.surge,150);assert.equal(boosted.boost,540);assert.equal(boosted.shield,1);
  boosted.pos=boosted.lane=first.lane;advance(boosted,first);assert.equal(boosted.tokens,2);assert.equal(boosted.collected,1);
  const cargo=b.rows.find(e=>e.pattern.includes('C'));boosted.pos=boosted.lane=cargo.pattern.indexOf('C');advance(boosted,cargo);
  assert.equal(boosted.dead,'');assert.equal(boosted.shield,0);assert.equal(boosted.surge,0);
  boosted.grace=0;advance(boosted,cargo);assert.equal(boosted.dead,'C');
});
test('upgrades extend the economy effect while keeping the boost speed and armour identical',()=>{
  const c=R.course(43117),e=R.block(c,0).events.find(x=>x.type==='boost');
  const a=R.fresh(43117),b=R.fresh(43117,{magnet:3,boost:3});
  for(const r of [a,b]){r.d=e.z-.03;r.pos=r.lane=e.lane;r.grace=500;}
  for(let i=0;i<255;i++){R.step(a,c);R.step(b,c);assert.equal(R.score(a),R.score(b));assert.equal(a.d,b.d);assert.equal(a.surge,b.surge);}
  assert.equal(b.boost-a.boost,270);assert.equal(a.surge,0);
});
