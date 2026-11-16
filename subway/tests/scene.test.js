'use strict';
const assert=require('node:assert/strict');
const fs=require('fs'),path=require('path');
const {setup,ctxOf}=require('./env');
const scene=require('../ui/scene');
function fixtures(){const x=setup(),now=Date.UTC(2026,10,15,12),ctx=()=>ctxOf(x.cfg,x.Rng.make(8),now),content={lines:JSON.parse(fs.readFileSync(path.join(__dirname,'../content/lines.json'),'utf8'))};
  const start=x.Core.newState(x.game,x.sim,ctx()),first=x.Core.clone(start);first.run.money='1e30';assert.ok(x.sim.buyStations(first,x.cfg,1,10));
  const late=x.Core.clone(first);for(let i=0;i<8;i++)assert.ok(x.sim.openLine(late,x.cfg));late.run.lines.forEach(l=>{l.stations=100000;l.trains=10000;l.dispatcher=true;});late.run.transfers=[[1,2],[1,3]];late.run.ring=true;
  const reset=x.Core.clone(late);reset.run.earned='1e30';assert.ok(x.Core.prestige(x.sim,x.game,reset,'city',ctx()).ok);
  function facts(s){const env=x.sim.envOf(s,x.cfg,now,true);return{stats:x.sim.lineStats(s,x.cfg,now),selected:1,night:env.night,museums:env.museums,cityTitle:'Тестовый город'};}
  return{x,content,states:{start,first,late,reset},factsFor:facts};
}
function run(){const f=fixtures(),project=(s,extra)=>scene.model(s,f.x.cfg,f.content,Object.assign(f.factsFor(s),extra));
  const start=project(f.states.start);assert.equal(start.lines.length,1);assert.equal(start.ring,false);assert.equal(start.airport,false);assert.deepEqual(start.lines[0].paths,f.content.lines.paths['1']);assert.equal(start.lines[0].stations,f.states.start.run.lines[0].stations);
  assert.ok(project(f.states.first).lines[0].stations>start.lines[0].stations);
  const late=project(f.states.late);assert.equal(late.lines.length,9);assert.equal(late.transfers.length,2);assert.ok(late.lines.every(l=>l.stationSamples.length<=18&&l.trainSamples<=4));assert.equal(late.lines[0].stations,100000);
  assert.ok(project(f.states.late,{night:true,museums:false}).lines.every(l=>!l.working));const duty=f.x.Core.clone(f.states.late);duty.run.lines[0].duty=true;assert.ok(project(duty,{night:true,museums:false}).lines[0].working);
  const reset=project(f.states.reset);assert.equal(reset.lines.length,1);assert.equal(reset.ring,false);assert.equal(reset.transfers.length,0);assert.notEqual(reset.cycle,late.cycle);
  assert.equal(scene.hit(start,500,300),1);
  for(const s of Object.values(f.states)){const facts=f.factsFor(s),before=JSON.stringify(s);assert.deepEqual(scene.model(s,f.x.cfg,f.content,facts),scene.model(s,f.x.cfg,f.content,facts));assert.equal(JSON.stringify(s),before);}
  console.log('subway scene: purchased topology/trains, late aggregation, transfers, night/duty, city reset, hit-test, purity PASS');
}
if(require.main===module)run();module.exports={fixtures,run};
