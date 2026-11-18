'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const H = require(path.join(process.env.AXIKO_ROOT || path.resolve(__dirname, '../../../Axiko'), 'scripts/games/harness.js'));
const art = require('../ui/reactor.js');
const root = path.resolve(__dirname,'..'), id = 'daily/2026-11-15';
const env = H.workspace({fixture:false});
fs.cpSync(root,path.join(env.root,'modules/games',id),{recursive:true,filter:p=>!/(?:^|[\\/])tests(?:[\\/]|$)/.test(path.relative(root,p))});
process.on('exit',()=>env.close());
const {Core,sim,game,cfg,Rng}=H.gameOf(env,id);
function fresh(){return Core.newState(game,sim,{now:1000000,config:cfg,rng:Rng.make(123),mult:1});}
function freeze(x){if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x);}return x;}

H.test('daily identity and save version are preserved in the store package',()=>{
  const meta=JSON.parse(fs.readFileSync(path.join(root,'store.json'),'utf8'));
  assert.equal(meta.target,'modules/games/'+id);assert.equal(game.id,id);assert.equal(game.saveVersion,1);
});
H.test('reactor starts empty and derives a read-only model from the real run',()=>{
  const state=fresh(),before=JSON.stringify(state);freeze(state);
  const picture=art.model(state,cfg,false);
  assert.equal(picture.live,false);assert.equal(picture.score,0);assert.equal(picture.combo,0);assert.equal(picture.sparks.length,0);
  assert.equal(picture.inner,cfg['spark.zoneInner']);assert.equal(picture.outer,cfg['spark.zoneOuter']);
  assert.equal(JSON.stringify(state),before);
});
H.test('real perfect hit, overheating and restart drive the same scene model',()=>{
  const state=fresh(),rng=Rng.make(42);sim.begin(state,cfg,1000000);
  const spark=sim.spawn(state,cfg,true,rng);spark.f=(cfg['spark.zoneInner']+cfg['spark.zoneOuter'])/2;
  assert.equal(sim.tap(state,cfg,1000000).result,'perfect');
  const hit=art.model(state,cfg,false);assert.equal(hit.combo,1);assert.equal(hit.score,cfg['score.perfect']);assert.ok(hit.sparks.some(s=>s.hit));
  state.run.sparks=[];state.run.cooldownUntil=0;
  assert.equal(sim.tap(state,cfg,1000100).result,'empty');assert.ok(art.model(state,cfg,false).heat>0);
  sim.begin(state,cfg,1000200);const restart=art.model(state,cfg,false);
  assert.equal(restart.combo,0);assert.equal(restart.score,0);assert.equal(restart.heat,0);assert.equal(restart.sparks.length,0);
});
H.test('rendering pools are bounded without truncating or mutating the save',()=>{
  const state=fresh();state.run.elapsedMs=1000;state.run.combo=1e30;
  state.run.sparks=Array.from({length:200},(_,i)=>({a:i*10,f:.5,up:i%2,hit:false}));
  state.run.rings=Array.from({length:100},()=>({kind:'perfect',at:900}));
  const before=JSON.stringify(state);const m=art.model(freeze(state),cfg,true);
  assert.equal(m.sparks.length,40);assert.equal(m.rings.length,8);assert.equal(m.reduced,true);assert.equal(m.combo,1e30);
  assert.equal(JSON.stringify(state),before);
});
H.test('ring boundaries and travel positions remain exact after save reload',()=>{
  const state=fresh();sim.begin(state,cfg,1000000);const rng=Rng.make(99);
  const spark=sim.spawn(state,cfg,true,rng);spark.f=cfg['spark.zoneInner'];spark.a=90;
  const restored=JSON.parse(JSON.stringify(state));const m=art.model(restored,cfg,false);
  assert.equal(m.sparks[0].f,cfg['spark.zoneInner']);assert.equal(m.sparks[0].a,Math.PI/2);
  assert.equal(sim.inZone(restored.run.sparks[0],cfg),true);
  restored.run.sparks[0].f=cfg['spark.zoneInner']-.001;
  assert.equal(sim.inZone(restored.run.sparks[0],cfg),false);
});
H.done('Искры: сохранения и визуальная модель');
