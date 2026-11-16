'use strict';
const assert=require('node:assert/strict');
const scene=require('../ui/scene');
const {load}=require('./support');
function fixtures(){const x=load();process.on('exit',()=>x.env.close());const start=x.fresh(),first=x.Core.clone(start);assert.ok(x.sim.buyDrone(first,0,x.cfg,1));
  const late=x.Core.clone(first);x.sim.RESEARCH.forEach(r=>late.run.research[r.id]=true);x.sim.BUILDINGS.forEach(b=>late.run.b[b.id]=7);Object.assign(late.run,{ore:'1e20',ice:1e10,alloy:1e10,water:1e10,fuel:1e10,chip:1e10,data:1e10,panels:30,reactor:3,dome:2,colonists:15,hangar:2});late.run.auto.dispatch=false;late.run.auto.smelt=false;late.run.eventAt=x.now+1e10;x.sim.tick(late,1,x.ctx(x.now+1000));
  const reset=x.Core.clone(late);reset.run.engine=true;reset.run.mined='1e15';assert.ok(x.Core.prestige(x.sim,x.game,reset,'jump',x.ctx()).ok);
  function facts(s){return{star:x.sim.star(s),share:x.sim.energyShare(s,x.cfg,x.now,false),power:x.sim.energyProd(s,x.cfg,x.now,false),demand:x.sim.energyUse(s,x.cfg),oreRate:x.sim.oreRate(s,x.cfg,x.now),flare:true};}
  return{x,content:{},states:{start,first,late,reset},factsFor:facts};
}
function run(){const f=fixtures(),project=(s,extra)=>scene.model(s,f.x.cfg,f.content,Object.assign(f.factsFor(s),extra));
  assert.equal(project(f.states.start).buildings.length,0);assert.equal(project(f.states.start).drones.length,0);assert.equal(project(f.states.first).drones.length,1);assert.equal(project(f.states.first).drones[0].shown,1,'one purchased drone is drawn once');
  const late=project(f.states.late);assert.equal(late.buildings.length,5);assert.ok(late.buildings.every(b=>b.working));
  const off=f.x.Core.clone(f.states.late);off.run.off.smelter=true;assert.equal(project(off).buildings.find(b=>b.id==='smelter').working,false);
  assert.ok(project(f.states.late,{share:0}).buildings.every(b=>!b.working));assert.ok(project(f.states.late,{flare:false}).buildings.every(b=>!b.working));
  const empty=f.x.Core.clone(f.states.late);for(const k of ['ore','ice','alloy','water','fuel','chip','data'])empty.run[k]=0;empty.run.drones.fill(0);empty.run.drones2.fill(0);f.x.sim.tick(empty,2,f.x.ctx(f.x.now+3000));assert.ok(project(empty).buildings.every(b=>!b.working));
  const reset=project(f.states.reset);assert.ok(reset.buildings.length<late.buildings.length);assert.notEqual(reset.cycle,late.cycle);
  const huge=f.x.Core.clone(f.states.late);huge.run.drones.fill(1e100);huge.run.b.smelter=1e100;const bounded=scene.model(huge,f.x.cfg,{}, {share:1});assert.equal(bounded.drones.length,8);assert.ok(bounded.drones.every(d=>d.shown<=3&&d.shown<=d.count));assert.ok(bounded.buildings.every(b=>b.scale<=7&&Number.isFinite(b.scale)));
  for(const s of Object.values(f.states)){const facts=f.factsFor(s),before=JSON.stringify(s);assert.deepEqual(scene.model(s,f.x.cfg,{},facts),scene.model(s,f.x.cfg,{},facts));assert.equal(JSON.stringify(s),before);}
  console.log('colony scene: start/purchase, real flows, off/power/raw shortage/flare, jump, huge, purity PASS');
}
if(require.main===module)run();module.exports={fixtures,run};

