'use strict';
const assert = require('assert/strict');
const { H, open, ctx } = require('./env');
const Bot = require('./bot');
const Scene = require('../ui/scene');
const { x } = open();
H.test('новая башня не раскрывает врагов или реликвии; комнаты следуют настоящим решениям', () => {
  const s = Bot.fresh(x, 87), c = ctx(x, Bot.T0, x.Rng.make(87));
  let m = Scene.model(x.sim.view(s, x.cfg), 'guardian');
  assert.equal(m.active, false); assert.equal(m.enemy, null); assert.deepEqual(m.relics, []);
  assert.ok(x.sim.act(s, { type: 'start', classId: 'guardian', height: 1, seed: 87 }, c).ok);
  m = Scene.model(x.sim.view(s, x.cfg));
  assert.equal(m.phase, 'doors'); assert.equal(m.doors.length, s.run.doors.length); assert.equal(m.enemy, null);
  const phases = new Set();
  for (let i = 0; i < 350 && s.run.phase !== 'ended'; i++) {
    const before = JSON.stringify(s), v = x.sim.view(s, x.cfg), visual = Scene.model(v);
    assert.equal(JSON.stringify(s), before);
    phases.add(visual.phase);
    if (s.run.phase === 'combat') assert.equal(JSON.stringify(visual.enemy), JSON.stringify(s.run.enemy));
    else assert.equal(visual.enemy, null);
    const result = x.sim.act(s, x.sim.botAction(s, x.cfg), c); assert.ok(result.ok);
  }
  assert.ok(phases.has('combat')); assert.ok(phases.has('reward'));
});
H.test('законченный забег не показывает сброшенные предметы; большие значения не размножают сцену', () => {
  const v = { phase: 'combat', floor: 1000000, flight: 100000, hero: { hp: 1e100, maxHp: 1e100 }, enemy: { id: 'rat', hp: 1e100 }, relics: Array.from({ length: 10000 }, (_, i) => ({ id: 'r' + i })), doors: [] };
  const before = JSON.stringify(v), m = Scene.model(v);
  assert.equal(m.relics.length, 6); assert.equal(m.floor, 1000000);
  m.enemy.hp = 0; assert.equal(JSON.stringify(v), before);
  const ended = Scene.model(Object.assign({}, v, { phase: 'ended' }), 'archer');
  assert.equal(ended.enemy, null); assert.equal(ended.hero, null); assert.deepEqual(ended.relics, []);
  assert.equal(ended.classId, 'archer');
});
H.done('tower visual model');
