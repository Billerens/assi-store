'use strict';
const assert = require('assert/strict');
const L = require('./load');
const Scene = require('../ui/scene');
L.H.test('арена следует реальной камере и неизменному seed; чтение не двигает RNG и сейв', () => {
  for (const seed of [81, 82]) {
    const w = L.World.create(L.config(), { seed, hero: 'wanderer' });
    const before = JSON.stringify(L.World.save(w)), m = Scene.model(w);
    assert.equal(m.theme, seed % 2 ? 'rain' : 'garden');
    assert.equal(m.camX, w.s.hx - w.s.vw / 2); assert.equal(m.camY, w.s.hy - w.s.vh * w.c.camY);
    for (let i = 0; i < 200; i++) Scene.model(w);
    assert.equal(JSON.stringify(L.World.save(w)), before);
    const restored = L.World.load(L.config(), JSON.parse(before));
    assert.deepEqual(Scene.model(restored), m);
    L.World.step(w, 1, 0);
    const next = Scene.model(w);
    assert.equal(next.camX - m.camX, w.s.hx - (m.camX + w.s.vw / 2));
    assert.equal(next.theme, m.theme);
  }
});
L.H.test('буря/волна — фактические значения, декорация не придумывает врагов и улучшения', () => {
  const w = L.World.create(L.config(), { seed: 17, hero: 'wanderer', storm: 7 });
  w.s.wave = 100000; const m = Scene.model(w);
  assert.equal(m.storm, 7); assert.equal(m.wave, 100000);
  assert.equal(m.enemies, undefined); assert.equal(m.weapons, undefined);
});
L.H.done('wave visual model');
