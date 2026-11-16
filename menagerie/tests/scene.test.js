'use strict';
const assert = require('assert/strict');
const { H, open, ctx } = require('./env');
const { x } = open();
const Scene = require('../ui/scene');
const NOW = Date.UTC(2026, 10, 15, 12);
function fresh() { const c = ctx(x, NOW, x.Rng.make(341)); return { s: x.Core.newState(x.game, x.sim, c), c }; }
H.test('питомник показывает настоящие гены, скрывает будущий фенотип яйца и отражает покупку', () => {
  const { s, c } = fresh();
  const first = Scene.model(s);
  assert.equal(first.beasts.length, 4); assert.equal(first.eggCount, 0); assert.equal(first.incubator, false);
  assert.deepEqual(first.beasts[0].parts, s.run.beasts[0].parts);
  assert.ok(x.sim.breed(s, s.run.beasts[0].id, s.run.beasts[1].id, c).ok);
  const egg = Scene.model(s).eggs[0];
  assert.ok(egg); assert.equal(egg.beast, undefined); assert.equal(egg.progress, 0);
  s.run.coins = '1e99'; assert.ok(x.sim.buy(s, 'incubator', x.cfg));
  assert.equal(Scene.model(s).incubator, true);
  const duration = s.run.eggs[0].remaining;
  c.now += (duration + 1) * 1000; x.sim.tick(s, duration + 1, c);
  const after = Scene.model(s);
  assert.equal(after.population, 5); assert.equal(after.eggCount, 0);
  const before = JSON.stringify(s); after.beasts[0].name = 'test'; Scene.model(s);
  assert.equal(JSON.stringify(s), before, 'derived art never writes save');
});
H.test('арена повторяет реальные HP каждого шага, включая четвёртого бойца; конец не проигрывает бой заново', () => {
  const { s, c } = fresh();
  s.run.upgrades.arena = 1;
  s.run.upgrades.bench = 1;
  x.sim.setTeam(s, s.run.beasts.map(b => b.id), x.cfg);
  assert.ok(x.sim.fight(s, c, true).ok);
  const battle = s.run.lastBattle, before = JSON.stringify(s);
  const expected = Object.fromEntries(battle.result.fighters.map(f => [f.id, f.maxHp]));
  for (let i = 0; i <= battle.result.log.length; i++) {
    if (i) { const event = battle.result.log[i - 1]; expected[event.target] = event.hp; }
    const m = Scene.model(s, { tab: 'tournament', replayStep: i });
    for (const entry of m.teams.flat()) {
      const hp = i === battle.result.log.length ? battle.result.fighters.find(f => f.id === entry.beast.id).hp : expected[entry.beast.id];
      assert.equal(entry.health.hp, hp);
    }
  }
  const end = Scene.model(s, { tab: 'tournament', replayStep: Infinity });
  assert.equal(end.done, true); assert.equal(end.steps, battle.result.log.length);
  assert.equal(JSON.stringify(s), before);
});
H.test('поздний вольер ограничен, выбранные родители видимы; новый цикл убирает сброшенные постройки', () => {
  const { s, c } = fresh();
  for (let i = 0; i < 1000; i++) s.run.beasts.push(Object.assign({}, s.run.beasts[0], { id: 'late-' + i, bornAt: NOW + i }));
  const m = Scene.model(s, { selected: 'late-4', pair: ['late-2', 'late-3'] });
  assert.equal(m.beasts.length, 6); assert.equal(m.population, 1004);
  for (const id of ['late-2', 'late-3', 'late-4', 'late-999']) assert.ok(m.beasts.some(b => b.id === id));
  const old = x.Core.clone(s); old.run.founders = old.run.beasts.slice(0, 3).map(b => b.id);
  const reset = fresh().s; x.sim.onPrestige(reset, x.sim.LAYER, old, c);
  const next = Scene.model(reset);
  assert.equal(next.population, 3); assert.equal(next.continent, 2); assert.equal(next.incubator, false);
  assert.deepEqual(next.beasts.map(b => b.parts), old.run.beasts.slice(0, 3).map(b => b.parts));
});
H.done('menagerie visual model');
