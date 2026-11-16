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

test('initial library has one real reading room, empty shelves and an idle desk', () => {
  const s=fresh(), m=Scene.model(s,cfg,content()); assert.equal(m.groups.length,0); assert.deepEqual(m.halls,['reading']); assert.equal(m.active,0); assert.equal(m.deskTotal,s.run.desks.length); rendered(m);
  s.run.coins='1e9'; assert.ok(sim.buySupply(s,cfg,0,1)); const next=Scene.model(s,cfg,content()); assert.equal(next.total,1); assert.ok(Scene.changes(m,next).includes('build'));
});
test('observatory is drawn only when purchased; desks reflect real reading progress', () => {
  const s=fresh(); s.run.tomes=['stars']; let m=Scene.model(s,cfg,content({mode:'observatory'})); assert.equal(m.mode,'house');
  s.run.halls.push('observatory'); s.run.desks[0]={id:'reader',b:2,k:0,p:15,w:30}; m=Scene.model(s,cfg,content({mode:'observatory'}));
  assert.equal(m.mode,'observatory'); assert.equal(m.active,1); assert.equal(m.desks[0].progress,.5); rendered(m);
});
test('large library is bounded; permanent archive does not refill a new building', () => {
  const s=fresh(); s.run.own=Array(48).fill(1e14); s.run.halls=sim.HALLS.map(h=>h.id); s.run.desks=Array(100).fill(null); s.run.tomes=Array.from({length:50},(_,i)=>'t'+i);
  const m=Scene.model(s,cfg,content()); assert.equal(m.groups.length,48); assert.ok(m.desks.length<=32); assert.ok(m.rooms.length<=12); rendered(m);
  const next=fresh(); next.layers.building.count=3; next.meta.vault=['atlas']; next.meta.catalog=['old'];
  const n=Scene.model(next,cfg,content()); assert.equal(n.total,0); assert.equal(n.active,0); assert.equal(n.vault.length,1); assert.deepEqual(n.halls,['reading']); assert.deepEqual(Scene.changes(m,n),['prestige']);
});

test('visual model and rendering never mutate the save, retain save references, or consume RNG', () => {
  const state = fresh(), before = JSON.stringify(state); freeze(state);
  const a = Scene.model(state, cfg, content()); const b = Scene.model(state, cfg, content());
  assert.deepEqual(a, b); rendered(a); assert.equal(JSON.stringify(state), before);
  const refs = new Set(); function collect(o, set) { if (o && typeof o === 'object') { set.add(o); Object.values(o).forEach(v => collect(v, set)); } }
  collect(state, refs); const modelRefs = new Set(); collect(b, modelRefs); modelRefs.forEach(v => assert.equal(refs.has(v), false));
  assert.deepEqual(Scene.changes(null, b), []); assert.deepEqual(Scene.changes(b, b), []);
});
