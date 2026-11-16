'use strict';
const assert = require('assert/strict');
const E = require('./env');
const { sim, cfg } = E.setup();
const Scene = require('../ui/scene');
E.test('лагерь показывает выбранного героя и только полученные дары, не будущую колоду', () => {
  const s = { run: { phase: 'hub' }, meta: sim.freshMeta() };
  const m = Scene.model(s);
  assert.equal(m.hero, s.meta.pref.hero); assert.deepEqual(m.grid, []); assert.deepEqual(m.gifts, []);
  s.meta.pref.hand = ['secret']; assert.deepEqual(Scene.model(s).gifts, []);
});
E.test('сцена — настоящие девять клеток: после хода герой и верх колоды занимают правильные места', () => {
  const s = { run: { phase: 'hub' }, meta: sim.freshMeta(), layers: {} };
  sim.startRun(s, cfg, { seed: 81 });
  s.run.grid = Array.from({ length: 9 }, (_, i) => i === 4 ? null : { k: 'gold', v: 1, u: i + 1 });
  s.run.pos = 4; s.run.deck = [{ k: 'potion', v: 3 }];
  const first = Scene.model(s, [1, 3], 344);
  assert.equal(first.grid.length, 9); assert.deepEqual(first.targets, [1, 3]);
  assert.ok(sim.move(s, cfg, 1).ok);
  const before = JSON.stringify(s), after = Scene.model(s, null, 480);
  assert.equal(after.pos, 1); assert.equal(after.grid[1], null); assert.equal(after.grid[4].k, 'potion');
  after.grid[4].k = 'foe'; assert.equal(JSON.stringify(s), before);
  for (const width of [240, 344, 480, 900]) {
    const m = Scene.model(s, null, width);
    for (let i = 0; i < 9; i++) { const p = Scene.center(i, m.gap); assert.ok(p.x > 0 && p.x < 1000 && p.y > 0 && p.y < 1000); }
  }
});
E.test('туман остаётся туманом, большие этажи не открывают будущих врагов', () => {
  const s = { run: { phase: 'play', hero: 'guard', floor: 1e9, depth: 1000, pos: 4, grid: [{ k: 'fog', u: 7 }] }, meta: {} };
  const m = Scene.model(s);
  assert.deepEqual(m.grid[0], { k: 'fog', u: 7 }); assert.equal(m.grid.length, 9); assert.equal(m.grid[8], null);
});
E.done('dungeon visual model');
