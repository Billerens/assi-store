'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const R=require('../race.js');
function ride(seed,seconds,bot){
  const c=R.course(seed,2),r=R.fresh(seed,null,2),inputs=[];
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
test('archived pier courses: seed, timing and replay are reproducible beyond twenty minutes',()=>{
  const seed=43117,a=ride(seed,1205,distanceBot);
  assert.equal(a.r.dead,'');assert.ok(a.r.d>15000);assert.ok(a.inputs.length>200);
  const tape=R.encode(a.inputs);assert.deepEqual(R.decode(tape),a.inputs);
  assert.deepEqual(R.playback(seed,R.decode(tape),a.r.tick,null,2),a.r);
  assert.notDeepEqual(R.block(R.course(7,2),5).rows,R.block(R.course(9,2),5).rows);
});
test('archived pier courses: 26+ minutes of generated geometry always afford a route and settling time',()=>{
  for(let seed=1;seed<10;seed++){
    const c=R.course(seed,2);let prior=-100;
    for(let i=0;i<85;i++){
      const b=R.block(c,i);
      for(const row of b.rows){assert.ok(row.pattern.includes('.'));assert.ok((row.z-prior)/R.speed(row.z,2)>.93);prior=row.z;}
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
  const c=R.course(9,2),r=R.fresh(9,null,2);r.d=67.95;r.lane=2;r.pos=2;
  while(r.d<119&&!r.dead){
    if(r.wave>=0&&r.lane<2)R.input(r,'R');R.step(r,c);
  }
  assert.equal(r.wave,-1);assert.equal(r.bank,0);assert.equal(r.gates,0);
});
test('one shift per jump, fast landing, and the brief’s example scores',()=>{
  const r=R.fresh(1,null,2);assert.ok(R.input(r,'U'));assert.ok(R.input(r,'R'));assert.equal(R.input(r,'L'),false);
  assert.ok(R.input(r,'D'));assert.equal(R.height(r),0);assert.ok(R.input(r,'L'));
  assert.equal(R.value(250,2),250);assert.equal(R.value(500,4),1000);assert.equal(R.value(650,5),1950);
});
test('fourth-gate landing opens the roof route and its second wave',()=>{
  const c=R.course(42,2),b=R.block(c,1),r=R.fresh(c.seed,null,2),w=b.waves[0],linked=b.waves[1];
  const landing=b.events.find(e=>e.type==='exit'&&e.roof);
  r.d=landing.z-.04;r.wave=w.key;r.pos=r.lane=0;r.raw=500;r.gates=4;r.blend=1;
  R.step(r,c);
  assert.equal(r.bank,1000);assert.equal(r.wave,-1);assert.ok(r.roofUntil>linked.start);
  while(r.d<linked.start&&!r.dead)R.step(r,c);
  assert.equal(r.dead,'');assert.equal(r.wave,linked.key);
  const late=R.fresh(c.seed,null,2);late.d=linked.start-.04;late.lane=late.pos=2;R.step(late,c);
  assert.equal(late.wave,-1);
});

test('a saved first-edition tape keeps its original collision, speed, gates and score',()=>{
  const r=R.playback(43117,[[348,'R'],[620,'R'],[648,'L']],1200,null,1);
  assert.equal(r.tick,822);assert.equal(r.dead,'D');assert.equal(r.bank,100);
  assert.equal(r.d,125.07425191482498);assert.equal(R.score(r),225);
  assert.equal(R.block(R.course(43117,1),0).events.some(e=>e.type==='token'),false);
});
test('physical pickups are deterministic, awarded once and honour their height and lane',()=>{
  const c=R.course(43117,2),b=R.block(c,0);
  const advance=(r,e)=>{r.d=e.z-.03;R.step(r,c);};
  const first=b.events.find(e=>e.type==='token');
  const p=R.fresh(43117,null,2);advance(p,first);R.step(p,c);assert.equal(p.tokens,1);
  const away=R.fresh(43117,null,2);away.pos=away.lane=0;advance(away,first);assert.equal(away.tokens,0);
  const jumping=R.fresh(43117,null,2);jumping.air=22;advance(jumping,first);assert.equal(jumping.tokens,0);
  const magnet=b.events.find(e=>e.type==='magnet');advance(p,magnet);assert.equal(p.magnet,270);
  away.lane=away.pos=1;advance(away,magnet);away.pos=away.lane=0;advance(away,first);assert.equal(away.tokens,1);
  const opposite=R.fresh(43117,null,2);opposite.magnet=10;opposite.pos=opposite.lane=2;
  const left=b.events.find(e=>e.type==='token'&&e.lane===0);advance(opposite,left);assert.equal(opposite.tokens,0);
  const boosted=R.fresh(43117,{magnet:3,boost:3},2);advance(boosted,magnet);assert.equal(boosted.magnet,540);
  const power=b.events.find(e=>e.type==='boost');boosted.pos=boosted.lane=power.lane;advance(boosted,power);
  assert.equal(boosted.surge,150);assert.equal(boosted.boost,540);assert.equal(boosted.shield,1);
  boosted.pos=boosted.lane=first.lane;advance(boosted,first);assert.equal(boosted.tokens,2);assert.equal(boosted.collected,1);
  const cargo=b.rows.find(e=>e.pattern.includes('C'));boosted.pos=boosted.lane=cargo.pattern.indexOf('C');advance(boosted,cargo);
  assert.equal(boosted.dead,'');assert.equal(boosted.shield,0);assert.equal(boosted.surge,0);
  boosted.grace=0;advance(boosted,cargo);assert.equal(boosted.dead,'C');
});
test('upgrades extend the economy effect while keeping the boost speed and armour identical',()=>{
  const c=R.course(43117,2),e=R.block(c,0).events.find(x=>x.type==='boost');
  const a=R.fresh(43117,null,2),b=R.fresh(43117,{magnet:3,boost:3},2);
  for(const r of [a,b]){r.d=e.z-.03;r.pos=r.lane=e.lane;r.grace=500;}
  for(let i=0;i<255;i++){R.step(a,c);R.step(b,c);assert.equal(R.score(a),R.score(b));assert.equal(a.d,b.d);assert.equal(a.surge,b.surge);}
  assert.equal(b.boost-a.boost,270);assert.equal(a.surge,0);
});

function railRun(stop, inputs=[], gear, seed=41) {
  const c=R.course(seed),r=R.fresh(seed,gear),tape=[],samples=[];
  let i=0;
  while(!r.dead&&r.d<stop){
    while(i<inputs.length&&r.d>=inputs[i][0]){
      const act=inputs[i++][1];
      if(R.input(r,act))tape.push([r.tick,act]);
    }
    R.step(r,c);
    if(samples.at(-1)?.surface!==r.surface)samples.push({surface:r.surface,d:r.d,y:r.deckY});
  }
  return {r,tape,samples};
}

test('moving fronts close against the rails and only a late change from their lane counts',()=>{
  const train=R.block(R.course(41),0).trains[0];
  assert.equal(R.trainFront(train,24),24);
  assert.ok(R.trainFront(train,22)-R.trainFront(train,24)>1);
  const headOn=railRun(35,[[1,'L']]).r;
  assert.equal(headOn.dead,'T');assert.ok(headOn.d>=24&&headOn.d<24.5);
  assert.equal(railRun(35).r.nearTally,0);
  assert.equal(railRun(35,[[1,'L'],[10,'R']]).r.nearTally,0);
  const dodged=railRun(38,[[1,'L'],[21,'R']]).r,paid=railRun(38,[[1,'L'],[21,'R']],{pass:3}).r;
  assert.equal(dodged.nearTally,1);assert.ok(dodged.nearTick>0);
  assert.equal(paid.tokens-dodged.tokens,3);assert.equal(R.score(paid),R.score(dodged));
});

test('boarding ramp, two distinct roofs, a jump over the coupling gap and a sloping exit use the same floor as collisions',()=>{
  const route=railRun(124,[[11,'R'],[87,'U']]),surfaces=route.samples.map(s=>s.surface);
  assert.equal(route.r.dead,'');assert.equal(route.r.roofTally,2);
  assert.deepEqual(surfaces.slice(0,7),['rail','ramp','roof','air','roof','ramp','rail']);
  assert.equal(surfaces.at(-1),'tunnel');assert.equal(route.r.deckY,0);
  assert.ok(route.samples.filter(s=>s.surface==='roof').every(s=>s.y===2.55));
  assert.equal(railRun(124,[[11,'R']]).r.dead,'T','running off the first roof misses the next roof');
  const open=railRun(124,[[11,'R'],[80,'L']]);
  assert.equal(open.r.dead,'');assert.equal(open.r.roofTally,1);assert.equal(open.r.deckY,0);
  assert.deepEqual(R.playback(41,route.tape,route.r.tick),route.r);
});

test('a ground hurdle and a tunnel beam demand different gestures, and the first minute speeds up',()=>{
  assert.equal(railRun(48).r.dead,'J');
  assert.equal(railRun(165,[[38,'U']]).r.dead,'D');
  assert.equal(railRun(165,[[38,'U'],[152,'D']]).r.dead,'');
  assert.equal(railRun(207,[[38,'U'],[152,'D']]).r.dead,'T');
  assert.equal(railRun(210,[[38,'U'],[152,'D'],[180,'L']]).r.dead,'');
  assert.ok(R.speed(0)>18);assert.ok(R.speed(100)>R.speed(0)+5);
  assert.ok(R.speed(600)>R.speed(100)+4);assert.ok(R.speed(2200)>R.speed(600));
});

test('all five railway levels have effects and older replays keep their own pace and equipment limits',()=>{
  const base=R.fresh(1),max=R.fresh(1,{magnet:12,boost:7,boots:9,pads:6,pass:6});
  assert.deepEqual(max.gear,{magnet:5,boost:5,boots:5,pads:5,pass:5});
  R.input(base,'U');R.input(max,'U');base.air=max.air=23;
  assert.ok(Math.abs(R.height(max)/R.height(base)-1.4)<1e-10);
  R.input(base,'D');R.input(max,'D');assert.equal(max.slide-base.slide,30);
  const c=R.course(1),mag=R.block(c,0).events.find(e=>e.type==='magnet');
  for(const r of [base,max]){r.d=mag.z-.05;R.step(r,c);}
  assert.equal(base.magnet,270);assert.equal(max.magnet,720);
  const power=R.block(c,0).events.find(e=>e.type==='boost');
  for(const r of [base,max]){r.d=power.z-.05;r.pos=r.lane=power.lane;R.step(r,c);}
  assert.equal(max.boost,720);assert.equal(base.surge,max.surge);assert.equal(base.shield,max.shield);
  const earlier=R.fresh(1,max.gear,2);assert.deepEqual(earlier.gear,{magnet:3,boost:3});
  const archived=R.playback(43117,[[80,'U'],[160,'D'],[255,'R']],900,{magnet:2,boost:1},2);
  assert.equal(archived.tick,211);assert.equal(archived.d,41.16201319020382);
  assert.equal(archived.dead,'D');assert.equal(archived.tokens,11);assert.equal(archived.pickups,1);
});

test('learnable railway patterns repeat in mirrored combinations and afford a ground route at full speed',()=>{
  const seed=17,c=R.course(seed),r=R.fresh(seed),tape=[],seen=new Map();
  function act(key){if(R.input(r,key))tape.push([r.tick,key]);}
  function sight(lane){
    for(let offset=0;offset<44;offset++){
      const d=r.d+offset,b=R.block(c,Math.floor(d/R.SPAN));
      if(b.trains.some(t=>{
        const dz=d-R.trainFront(t,d);
        return t.lane===lane&&dz>=-t.ramp-1&&dz<t.length+t.down+1;
      }))return offset;
    }
    return 44;
  }
  while(!r.dead&&r.tick<60*60*21){
    const b=R.block(c,Math.floor(r.d/R.SPAN)),l=r.lane;
    if(r.tick%5===0&&sight(l)<18){
      const options=[l-1,l+1].filter(i=>i>=0&&i<=2).sort((a,b)=>sight(b)-sight(a));
      if(sight(options[0])>sight(l)+1)act(options[0]>l?'R':'L');
    }
    const row=b.rows.find(e=>e.base===0&&e.z>r.d&&e.z-r.d<6);
    if(row){
      const hazard=row.pattern[Math.round(r.pos)];
      if((hazard==='J'||hazard==='G')&&!r.air)act('U');
      if(hazard==='D'&&!r.slide)act('D');
    }
    R.step(r,c);
    for(const tile of b.patterns)seen.set(tile.id+' '+tile.mirror,true);
  }
  assert.equal(r.dead,'');assert.ok(r.d>42000);assert.ok(seen.size>=11);assert.ok(tape.length>250);
  assert.deepEqual(R.playback(seed,R.decode(R.encode(tape)),r.tick),r);
  assert.ok(Object.keys(c.cache).length<=7);
});

test('the optional wave ramp keeps the railway lane open and banks a five-gate surf sequence',()=>{
  const c=R.course(17),b=R.block(c,2),wave=b.waves[0],r=R.fresh(17);
  r.d=wave.start-.06;r.pos=r.lane=2;
  const straight={...r};R.step(straight,c);assert.equal(straight.wave,-1);
  r.air=24;R.step(r,c);assert.equal(r.wave,wave.key);
  for(const gate of b.events.filter(e=>e.key===wave.key&&e.type==='gate')){
    r.d=gate.z-.05;r.pos=r.lane=[0,1,2].find(i=>gate.mask&(1<<i));R.step(r,c);
  }
  const last=b.events.find(e=>e.key===wave.key&&e.final);
  r.d=last.z-.05;r.pos=r.lane=0;R.step(r,c);
  assert.equal(r.wave,-1);assert.equal(r.bestChain,5);assert.ok(r.bank>=750);
});
