'use strict';
const assert=require('node:assert/strict');
const fs=require('fs'),path=require('path');
const {make,ctxOf}=require('./setup');
const scene=require('../ui/scene');
function fixtures(){
  const w=make(),x=w.x,now=Date.UTC(2026,10,15,12);process.on('exit',()=>w.env.close());
  const content=Object.assign({},x.sim.tree(),{palette:JSON.parse(fs.readFileSync(path.join(__dirname,'../content/palette.json'),'utf8'))});
  const start=x.Core.newState(x.game,x.sim,ctxOf(x,now)),first=x.Core.clone(start),rec=x.sim.frontier(first)[0];
  assert.ok(rec);const result=x.sim.mix(first,x.cfg,rec.ins,{now,mult:1});assert.ok(result.discovery);
  const duplicate=x.sim.mix(first,x.cfg,rec.ins,{now:now+1,mult:1});assert.equal(duplicate.result,'recipe');assert.ok(!duplicate.discovery);
  const late=x.Core.clone(first);Object.keys(content.els).forEach(k=>{late.meta.book[k]=now;late.run.store[k]=1000000;});late.meta.bookN=Object.keys(late.meta.book).length;late.run.cubes=Array.from({length:20},()=>({k:rec.k,p:.4,fire:0}));late.run.lv.coil=100;late.run.bought=1000;
  const reset=x.Core.clone(late);reset.run.earned='6.4e7';assert.ok(x.Core.prestige(x.sim,x.game,reset,'stone',ctxOf(x,now)).ok);
  return{x,content,states:{start,first,late,reset},facts:{capacity:2000000,slots:rec.ins,stones:0},rec};
}
function run(){const f=fixtures(),project=(s,facts=f.facts)=>scene.model(s,f.x.cfg,f.content,facts);
  const start=project(f.states.start);assert.equal(start.known,4);assert.equal(start.crystals.length,0);assert.equal(start.workers.length,0);assert.equal(start.elements.length,4);
  const first=project(f.states.first);assert.ok(first.known>4);assert.ok(first.crystals.length>0);
  const late=project(f.states.late);assert.ok(late.elements.length<=14);assert.ok(late.crystals.length<=9);assert.equal(late.workers.length,12);assert.ok(late.workers.every(w=>w.working));
  const missing=f.x.Core.clone(f.states.late);missing.run.store[f.rec.ins[0]]=0;assert.ok(project(missing).workers.every(w=>!w.working&&w.waiting==='Сырьё'));
  const full=project(f.states.late,{capacity:10});assert.ok(full.workers.every(w=>!w.working&&w.waiting==='Склад'));
  const fire=f.x.Core.clone(f.states.late);fire.run.cubes[0].fire=3;assert.equal(project(fire).workers[0].working,false);
  const reset=project(f.states.reset);assert.equal(reset.known,late.known);assert.equal(reset.crystals.length,0);assert.equal(reset.workers.length,2);assert.ok(reset.workers.every(w=>!w.working));
  for(const s of Object.values(f.states)){const before=JSON.stringify(s);assert.deepEqual(project(s),project(s));assert.equal(JSON.stringify(s),before);}
  console.log('alchemist scene: discovery/duplicate, known/owned, empty/fed/full/burning cubes, late, reset, purity PASS');
}
if(require.main===module)run();module.exports={fixtures,run};
