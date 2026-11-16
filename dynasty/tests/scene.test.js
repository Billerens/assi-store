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

test('first kingdom is unbuilt; actual first purchase adds only its holding', () => {
  const s = fresh(), a = Scene.model(s, cfg); assert.equal(a.tiles.length, 0); assert.equal(a.court, 0); assert.equal(a.spouse, false);
  s.run.gold = '1e9'; assert.ok(sim.buyHolding(s, cfg, 0, 1)); const b = Scene.model(s, cfg);
  assert.deepEqual(b.tiles.map(x => x.kind), [0]); assert.equal(b.tiles[0].count, 1); assert.ok(Scene.changes(a, b).includes('build')); rendered(b);
});
test('large holdings aggregate, factory requires its epoch; people are actual family', () => {
  const s = fresh(); s.run.h = Array(9).fill(1e12); s.run.court = 1e9; s.layers.epoch.count = 5;
  s.run.spouse = { id: 'spouse' }; s.run.children = Array.from({length:30}, (_,i) => ({ id: String(i), age: i }));
  const m = Scene.model(s, cfg); assert.equal(m.tiles.length, 9); assert.ok(m.tiles.every(x => x.density <= 5)); assert.equal(m.children.length, 8); assert.equal(m.familyTotal, 30); rendered(m); rendered(Scene.model(s, cfg, {mode:'court'}));
  s.layers.epoch.count = 0; assert.equal(Scene.model(s,cfg).tiles.some(x=>x.kind===8), false);
});
test('successor/new epoch removes reset current ownership, preserves historical identity', () => {
  const old = fresh(); old.run.h[5] = 30; const a = Scene.model(old,cfg);
  const next = fresh(); next.layers.generation.count = 4; next.layers.epoch.count = 1; next.meta.tree = [{id:'ancestor'}];
  const b = Scene.model(next,cfg); assert.equal(b.tiles.length,0); assert.equal(b.ancestors,1); assert.deepEqual(Scene.changes(a,b),['prestige']);
  next.run.dead=true; const dead=Scene.model(next,cfg); assert.equal(dead.ruler.dead,true); rendered(dead);
});

test('visual model and rendering never mutate the save, retain save references, or consume RNG', () => {
  const state = fresh(), before = JSON.stringify(state); freeze(state);
  const a = Scene.model(state, cfg, content()); const b = Scene.model(state, cfg, content());
  assert.deepEqual(a, b); rendered(a); assert.equal(JSON.stringify(state), before);
  const refs = new Set(); function collect(o, set) { if (o && typeof o === 'object') { set.add(o); Object.values(o).forEach(v => collect(v, set)); } }
  collect(state, refs); const modelRefs = new Set(); collect(b, modelRefs); modelRefs.forEach(v => assert.equal(refs.has(v), false));
  assert.deepEqual(Scene.changes(null, b), []); assert.deepEqual(Scene.changes(b, b), []);
});
