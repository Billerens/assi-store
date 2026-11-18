'use strict';
const path = require('node:path');
// A drawing fault must not strand an interactive game. Stress large saved values and every room.
const assert = require('assert/strict');
const H = require(path.join(process.env.AXIKO_ROOT || path.resolve(__dirname, '../../../Axiko'), 'scripts/games/harness.js'));
const Menagerie = require('../ui/scene');
const Tower = require('../../tower/ui/scene');
const Dungeon = require('../../one-cell-dungeon/ui/scene');
const Wave = require('../../wave-survival/ui/scene');
function canvas() {
  const calls = { count: 0, images: 0 };
  const context = new Proxy({}, {
    get(target, key) {
      if (key === 'calls') return calls;
      if (key === 'createLinearGradient' || key === 'createRadialGradient') return (...args) => { args.forEach(n => assert.ok(Number.isFinite(n))); return { addColorStop() {} }; };
      if (key in target) return target[key];
      return (...args) => {
        calls.count++;
        if (key === 'drawImage') calls.images++;
        args.forEach(value => { if (typeof value === 'number') assert.ok(Number.isFinite(value), key + ' finite coordinates'); });
        if (key === 'ellipse') assert.ok(args[2] >= 0 && args[3] >= 0, 'non-negative ellipse');
        if (key === 'arc') assert.ok(args[2] >= 0, 'non-negative arc');
      };
    },
    set(target, key, value) { if (typeof value === 'number') assert.ok(Number.isFinite(value), key); target[key] = value; return true; }
  });
  return context;
}
H.test('все комнаты и эффекты рисуются конечными координатами, не меняя модель', () => {
  const beasts = Array.from({ length: 4 }, (_, i) => ({ id: 'b-' + i, name: 'Зверь', parts: [], colors: [0, 1] }));
  const models = [
    [Menagerie, Menagerie.model({ run: { beasts, upgrades: { incubator: 1 }, eggs: [{ id: 'egg', duration: 20, remaining: 2 }] }, meta: { continent: 1000 } })],
    [Menagerie, { mode: 'arena', teams: [beasts, beasts].map(team => team.map(b => ({ beast: b, health: { hp: 1, maxHp: 1e100 } }))) }],
    [Dungeon, Dungeon.model({ run: { phase: 'hub' }, meta: { pref: { hero: 'guard' } } })],
    [Dungeon, Dungeon.model({ run: { phase: 'play', pos: 4, hero: 'guard', floor: 1e9, hp: 1, grid: ['foe','potion','stairs','altar',null,'fog','weapon','boss','gold'].map((k, i) => k ? { k, e: 'slime', u: i } : null) } })]
  ];
  for (const phase of ['home','ended','combat','doors','reward','shop','rest','event','fork']) models.push([Tower, Tower.model({ phase, floor: 1e9, flight: 1e8, classId: 'firestarter', hero: { hp: 1 }, enemy: { id: 'rat', hp: 1e99, shield: 1, burn: 1, plates: 1 }, doors: [{ type: 'rest' }, { type: 'combat' }], event: { id: 'forge' }, relics: [{id:'coin'}] })]);
  for (const [scene, model] of models) {
    const before = JSON.stringify(model);
    for (const age of [0, .3, 1, 2, 999]) scene.draw(canvas(), model, age, [
      { kind: 'action', age, duration: 1.6, payload: { type: 'play', id: 'block', heroDamage: 2, foeDamage: 3 } },
      { kind: 'step', age, duration: 1.5, payload: { from: 1, ev: { fight: 2 } } },
      { kind: 'battle', age, duration: .8, strength: .5, payload: { actor: 'b-0', target: 'b-1', damage: 2 } }
    ]);
    assert.equal(JSON.stringify(model), before);
  }
});
H.test('арена кэширует плитки и ограничивает работу даже на огромном обзоре, камера не пишет мир', () => {
  let created = 0;
  global.document = { createElement: () => { created++; return { getContext: () => canvas() }; } };
  try {
    for (const seed of [1, 2]) {
      const painter = Wave.make(), w = { s: { seed, hx: 600, hy: 600, vw: 420, vh: 700, t: 0, storm: 1e9 }, c: { camY: .4, arenaW: 1200, arenaH: 1800, edge: 48 } };
      const before = JSON.stringify(w), c = canvas(), previous = created;
      painter.draw(c, w, { width: 420, height: 700, px: 1, motion: false });
      painter.draw(c, w, { width: 420, height: 700, px: 1, motion: false });
      assert.equal(created - previous, 4, 'four terrain images, no per-frame canvas allocation');
      assert.equal(JSON.stringify(w), before);
      w.s.vw = 1e6; w.s.vh = 1e6;
      const large = canvas(); painter.draw(large, w, { width: 1000, height: 1000, px: .001, motion: true });
      assert.ok(large.calls.images < 100, 'bounded visible terrain');
      assert.ok(large.calls.count < 2000, 'bounded scenery/weather');
    }
  } finally { delete global.document; }
});
H.done('combat scene render');
