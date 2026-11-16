'use strict';
const assert=require('node:assert/strict');
const fs=require('fs');
const {open,ctx}=require('./env');
const scene=require('../ui/scene');
function fixtures(){
  const x=open(),now=Date.UTC(2026,10,15,12),content={tiers:JSON.parse(fs.readFileSync(require('path').join(__dirname,'../content/tiers.json'),'utf8'))};
  const start=x.Core.newState(x.game,x.sim,ctx(x,now)),first=x.Core.clone(start);
  assert.ok(x.sim.buy(first,0,'one',x.cfg));
  const produced=x.Core.clone(start);produced.run.tiers[1].amount='10';x.sim.tick(produced,10,ctx(x,now+10000));
  const late=x.Core.clone(first);late.meta.highestLayer=10003;late.meta.foldUnlocked=true;late.meta.collapseUnlocked=true;late.layers.compression.count=50;late.meta.foldTree.echo=50;
  late.run.tiers.forEach((tier,i)=>{tier.amount=i%2?'t1:1e200':'1e1000000';tier.bought=1000000+i;});
  const reset=x.Core.clone(first);reset.run.points='1e50';x.sim.syncOut(reset,x.cfg);assert.ok(x.sim.reset(reset,'compression',ctx(x,now+20000)));
  return {x,content,states:{start,first,produced,late,reset},facts:{now,income:'1e1000'}};
}
function run(){const f=fixtures(),project=s=>scene.model(s,f.x.cfg,f.content,f.facts);
  const start=project(f.states.start);assert.equal(start.opened,4);assert.equal(start.owned,0);assert.equal(start.depth,0);assert.ok(start.tiers.every(x=>!x.working));
  const first=project(f.states.first);assert.equal(first.owned,1);assert.equal(first.tiers[0].bought,1);
  const generated=project(f.states.produced);assert.equal(generated.tiers[0].bought,0);assert.equal(generated.tiers[0].owned,true);
  const late=project(f.states.late);assert.equal(late.tiers.length,9);assert.equal(late.depth,10003);assert.ok(late.tiers.every(x=>Number.isFinite(x.scale)&&x.scale<=7));
  const reset=project(f.states.reset);assert.equal(reset.owned,0);assert.equal(reset.opened,5);assert.equal(reset.depth,1);
  const legacy=f.x.Core.clone(f.states.start);legacy.meta.foldTree.echo=true;assert.equal(project(legacy).heirlooms,1,'old boolean upgrades are real inherited progress');
  const challenge=f.x.Core.clone(f.states.produced);challenge.meta.challenge=4;assert.deepEqual(project(challenge).tiers[1].targets,[-1]);challenge.meta.challenge=0;challenge.run.mirrorUntil=f.facts.now+10000;assert.deepEqual(project(challenge).tiers[0].targets,[]);
  for(const s of Object.values(f.states)){const before=JSON.stringify(s);assert.deepEqual(project(s),project(s));assert.equal(JSON.stringify(s),before);}
  console.log('infinity scene: start, purchase, produced-only, huge/endless, prestige, challenge, mirror, purity PASS');
}
if(require.main===module)run();module.exports={fixtures,run};
