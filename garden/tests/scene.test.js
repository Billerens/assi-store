'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const E = require('./env');
const w = E.open(), x = w.x || w;
const { Core, sim, game, cfg, Rng } = x;
const Scene = require('../ui/scene');
const T0 = Date.UTC(2026, 10, 15, 12);
function fresh() { return Core.newState(game, sim, { now: T0, config: cfg, rng: Rng.make(42), mult: 1, links: {}, stock: {}, offline: false }); }
function content(extra) { return Object.assign({ now: T0, sim, halls: sim.HALLS, night: false }, extra); }
function freeze(o) { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.values(o).forEach(freeze); Object.freeze(o); } return o; }
function rendered(model) {
  let calls = 0, depth = 0;
  const gradient = { addColorStop(p, color) { assert.ok(Number.isFinite(p)); assert.equal(typeof color, 'string'); } };
  const ctx = new Proxy({ globalAlpha: 1 }, { get(o, key) {
    if (key in o) return o[key];
    if (key === 'createLinearGradient' || key === 'createRadialGradient') return (...args) => { args.forEach(n => assert.ok(Number.isFinite(n))); return gradient; };
    return (...args) => { calls++; if (key === 'save') depth++; if (key === 'restore') depth--; assert.ok(depth >= 0); args.forEach(a => { if (typeof a === 'number') assert.ok(Number.isFinite(a), String(key) + ' non-finite argument'); }); };
  }, set(o, key, value) { if (typeof value === 'number') assert.ok(Number.isFinite(value), String(key)); o[key] = value; return true; } });
  Scene.draw(ctx, freeze(model), 2.25, [{ kind: 'build', age: .8, duration: 2.2, payload: null }]);
  assert.equal(depth, 0); assert.ok(calls > 100); assert.ok(calls < 25000, 'bounded drawing: ' + calls);
  return calls;
}

function put(s,i,f='moon',g='RYsbpq+-+---nn12',mut='') { s.run.beds[i].p={id:'p'+i,f,g,m:mut,ch:'blue',gr:0,bl:100,win:200,seen:true,pod:null,at:T0}; return s.run.beds[i].p; }
test('empty beds and automation toggle do not fabricate plants or purchased hive', () => {
  const s=fresh(),m=Scene.model(s,cfg,content()); assert.equal(m.planted,0); assert.equal(m.beds.length,s.run.beds.length); assert.equal(m.hive,0); assert.equal(m.greenhouse,0); assert.equal(m.mode,'plot'); rendered(m);
});
test('growth stages, genotype, chimera, water and slugs come from simulation state', () => {
  const s=fresh(),p=put(s,0,'moon','RYsbpq+-+---nn12','GCN'); const before=Scene.model(s,cfg,content()); assert.equal(before.beds[0].plant.stage,0);
  for (const seconds of [cfg['moon.budMin']*60*.5,cfg['moon.budMin']*60,(cfg['moon.budMin']+cfg['moon.bloomMin'])*60]) { p.gr=seconds; const m=Scene.model(s,cfg,content()); assert.equal(m.beds[0].plant.stage,sim.stageOf(p,cfg)); rendered(m); }
  s.run.beds[0].w=T0+60000; s.run.beds[0].slug=1; const m=Scene.model(s,cfg,content({night:true})),ph=sim.phenotype(p.f,p.g,p.m,p.ch);
  assert.equal(m.beds[0].plant.color,ph.color); assert.equal(m.beds[0].plant.color2,ph.color2); assert.equal(m.beds[0].plant.giant,true); assert.equal(m.beds[0].plant.night,true); assert.equal(m.beds[0].water,true); assert.equal(m.beds[0].slug,true);
  p.dead=true; assert.equal(Scene.model(s,cfg,content()).beds[0].plant.stage,4); rendered(Scene.model(s,cfg,content()));
});
test('greenhouse and equipment appear only after purchase; many beds and all families remain bounded', () => {
  const s=fresh(); s.run.up={greenhouse:2,hive:1,barrel:1,lamp:1,meteo:1}; s.run.beds=Array.from({length:48},()=>({p:null,w:0,slug:0}));
  for(let i=0;i<48;i++){const f=['moon','sun','fan'][i%3],p=put(s,i,f,f==='fan'?'Kkacvvnn12':'RYsbpq+-+---nn12');p.gr=1e9;}
  let m=Scene.model(s,cfg,content({night:true}));assert.equal(m.mode,'greenhouse');assert.equal(m.hive,1);assert.equal(m.beds.length,48);rendered(m);
  m=Scene.model(s,cfg,content()); assert.equal(m.mode,'plot');rendered(m);
});
test('move preserves album separately while returning to actual empty beds', () => {
  const old=fresh();put(old,0);const next=fresh();next.layers.move.count=2;next.meta.album={'moon/red/round/plain':1};
  const m=Scene.model(next,cfg,content());assert.equal(m.archive,1);assert.equal(m.planted,0);assert.deepEqual(Scene.changes(Scene.model(old,cfg,content()),m),['prestige']);
});

test('visual model and rendering never mutate the save, retain save references, or consume RNG', () => {
  const state = fresh(), before = JSON.stringify(state); freeze(state);
  const a = Scene.model(state, cfg, content()); const b = Scene.model(state, cfg, content());
  assert.deepEqual(a, b); rendered(a); assert.equal(JSON.stringify(state), before);
  const refs = new Set(); function collect(o, set) { if (o && typeof o === 'object') { set.add(o); Object.values(o).forEach(v => collect(v, set)); } }
  collect(state, refs); const modelRefs = new Set(); collect(b, modelRefs); modelRefs.forEach(v => assert.equal(refs.has(v), false));
  assert.deepEqual(Scene.changes(null, b), []); assert.deepEqual(Scene.changes(b, b), []);
});
