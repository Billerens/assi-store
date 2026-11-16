'use strict';
const assert=require('assert');
const {load,harness}=require('./helpers');
const {play}=require('./bot');
const {test,done}=harness;
const x=load();
process.on('exit',()=>x.env.close());
test('логический бот проходит все семь полей с сохранениями после ходов',()=>{
  const report=[];
  for(let seed=1;seed<=12;seed++){
    const state=x.fresh(seed);
    const run=play(x,state,{seed,roundTrip:true,useTools:false});
    assert(!run.stalled,'solver stalled seed '+seed+' field '+state.run.fieldIndex);
    assert(run.won,'lost perfect run '+seed);
    assert.equal(state.run.completed,7);
    assert.equal(x.sim.validate(state),null);
    assert.equal(x.Core.validate(state,x.game),null);
    assert(state.meta.unlocked.geolog&&state.meta.unlocked.cartographer&&state.meta.unlocked.tidy);
    report.push({seed,seconds:run.seconds,firstBuy:run.firstBuy,actions:run.actions,boss:state.run.bosses});
  }
  console.log('PERFECT_RUNS '+JSON.stringify(report));
});
test('настоящий Core.prestige сохраняет мастерскую и открывает следующую глубину',()=>{
  const s=x.fresh(19);play(x,s,{seed:19,useTools:false});
  assert.equal(s.run.status,'won');
  x.sim.buyWorkshop(s,'pouch',x.cfg);
  const ore=x.Big.str(s.meta.ore),album=JSON.stringify(s.meta.album),cells=s.meta.stats.cells;
  assert.equal(x.Big.toNumber(x.sim.prestigeGain(s,'depth',x.cfg)),1);
  const result=x.Core.prestige(x.sim,x.game,s,'depth',x.ctx(19));
  assert(result.ok);
  assert.equal(s.meta.depthUnlocked,1);
  assert.equal(x.Big.toNumber(s.layers.depth.currency),1);
  assert.equal(s.meta.workshop.pouch,1);
  assert.equal(x.Big.str(s.meta.ore),ore);
  assert.equal(JSON.stringify(s.meta.album),album);
  assert.equal(s.meta.stats.cells,cells);
  assert.equal(s.run.status,'ready');
  assert(x.Big.isZero(x.sim.prestigeGain(s,'depth',x.cfg)));
  x.sim.startRun(s,x.cfg,{seed:20},x.ctx(20));
  assert.equal(s.run.depth,1);assert.equal(s.run.gold,15);
});
test('поражение на Глине даёт руду на первую покупку и не оплачивается дважды',()=>{
  const s=x.fresh(73);
  x.sim.startRun(s,x.cfg,{seed:73},x.ctx(73));x.sim.tap(s,31,x.cfg,1);
  let mine=s.run.field.m.split('').findIndex((ch,i)=>'12rc'.includes(ch)&&s.run.field.vis[i]==='-');
  x.sim.tap(s,mine,x.cfg,1);
  const run=play(x,s,{seed:73,maxFields:2,useTools:false});
  if(s.run.status==='choice')x.sim.choose(s,s.run.choices[0],x.cfg);
  if(s.run.status==='shop')x.sim.advance(s,x.cfg);
  x.sim.tap(s,30,x.cfg,1);
  while(s.run.status==='playing'){
    mine=s.run.field.m.split('').findIndex((ch,i)=>'12rc'.includes(ch)&&s.run.field.vis[i]==='-');
    assert(mine>=0);x.sim.tap(s,mine,x.cfg,1);
  }
  const ore=x.Big.toNumber(s.meta.ore);
  assert(ore>=15&&ore<=25,'first clay loss ore '+ore);
  assert(x.sim.buyWorkshop(s,'pouch',x.cfg));
  const after=x.Big.str(s.meta.ore);
  assert(!x.sim.endRun(s,x.cfg,1));assert.equal(x.Big.str(s.meta.ore),after);
  console.log('FIRST_WORKSHOP '+JSON.stringify({ore,seconds:run.seconds,price:10}));
});
test('12 часов офлайна: точное совпадение, в том числе случайность и запас полей',()=>{
  const s=x.fresh(101);x.sim.startRun(s,x.cfg,{seed:101},x.ctx(101));x.sim.tap(s,21,x.cfg,1);
  const a=x.Core.clone(s),b=x.Core.clone(s);
  x.sim.offline(a,43200,x.ctx(101));
  for(let i=0;i<43200;i++)x.sim.tick(b,1,x.ctx(101));
  assert.deepEqual(a,b);assert.deepEqual(a,s);
  console.log('OFFLINE_AGREEMENT 0% difference, 0 income');
});
done('integration minesweeper-rogue');
