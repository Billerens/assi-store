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

test('initial dragon is young without servants or halls; first real purchase changes scene', () => {
  const s=fresh(),a=Scene.model(s,cfg,content()); assert.equal(a.age,0);assert.equal(a.servantTotal,0);assert.equal(a.halls.length,0);assert.ok(a.pile>0 && a.pile<4);rendered(a);
  s.run.gold='1e6';assert.ok(sim.buyServant(s,cfg,0,1));const b=Scene.model(s,cfg,content());assert.equal(b.servants[0],1);assert.ok(Scene.changes(a,b).includes('build'));
});
test('current gold alone builds the pile, record and permanent trophies cannot refill it', () => {
  const s=fresh();s.run.gold='0e0';s.run.hmax='1e1000';s.meta.trophies={crown:20};s.meta.gems='0e0';const m=Scene.model(s,cfg,content());
  assert.equal(m.pile,0);assert.equal(m.gold.positive,false);assert.equal(m.record.positive,true);assert.equal(m.archiveTrophies,1);rendered(m);
});
test('age/species/halls/raid/wound are real and extreme balances stay bounded', () => {
  const s=fresh();s.run.gold='9e100000';s.run.servants=Array(8).fill(1e12);s.layers.sleep.state.sleeps=cfg['age.legend'];s.layers.sleep.state.halls={grotto:1,nest:2,mirror:3,sanctum:1,cache:2,bones:1};s.layers.clutch.state.species='ice';s.run.woundedUntil=T0+60000;s.run.knight={type:'wanderer',at:T0+10000};
  let m=Scene.model(s,cfg,content());assert.equal(m.age,5);assert.equal(m.species,'ice');assert.equal(m.halls.length,6);assert.equal(m.pile,7);assert.equal(m.wounded,true);rendered(m);
  s.run.raid={n:1,end:T0+60000};m=Scene.model(s,cfg,content());assert.ok(m.raid);rendered(m);
});
test('new clutch resets current age/ownership while historical bestiary remains separate', () => {
  const s=fresh();s.layers.clutch.count=1;s.meta.chronicle=[{kind:'sleep',n:1,age:'Древний',hmax:'1e25',wins:23}];
  const m=Scene.model(s,cfg,content({mode:'chronicle'}));assert.equal(m.mode,'chronicle');assert.equal(m.age,0);assert.equal(m.servantTotal,0);assert.equal(m.halls.length,0);assert.ok(m.pile<4);rendered(m);
  assert.deepEqual(Scene.changes(Scene.model(fresh(),cfg,content()),m),['prestige']);
});

test('visual model and rendering never mutate the save, retain save references, or consume RNG', () => {
  const state = fresh(), before = JSON.stringify(state); freeze(state);
  const a = Scene.model(state, cfg, content()); const b = Scene.model(state, cfg, content());
  assert.deepEqual(a, b); rendered(a); assert.equal(JSON.stringify(state), before);
  const refs = new Set(); function collect(o, set) { if (o && typeof o === 'object') { set.add(o); Object.values(o).forEach(v => collect(v, set)); } }
  collect(state, refs); const modelRefs = new Set(); collect(b, modelRefs); modelRefs.forEach(v => assert.equal(refs.has(v), false));
  assert.deepEqual(Scene.changes(null, b), []); assert.deepEqual(Scene.changes(b, b), []);
});
