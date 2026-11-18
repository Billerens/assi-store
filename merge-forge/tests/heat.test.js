// The heat of the forge: taps heat it, a hot forge makes the blades strike more often, it cools when
// left alone; «Жаркие угли» make full heat stronger, «Негаснущий огонь» keeps a part of it for good.
// node tests/heat.test.js
'use strict';
const assert = require('assert');
const { open, ctxOf, test, done } = require('./env');

const x = open(), S = x.sim, c = x.cfg, NOW = Date.UTC(2026, 10, 18, 9);
function fresh(seed) {
  const rng = x.Rng.make(seed || 77), state = x.Core.newState(x.game, S, ctxOf(x, NOW, rng));
  S.ensure(state);
  // A monster that outlives the test stands at the gate already: only the volleys are counted.
  state.run.walkT = 0; state.run.hp = '1e300'; state.run.hpMax = '1e300'; state.run.farm = true;
  return { state, rng };
}
function close(a, b, message) { assert.ok(Math.abs(a - b) < 1e-9 * Math.max(1, Math.abs(b)), message || a + ' != ' + b); }
/** Volleys struck in `seconds` of play on screen, a frame at a time; `taps` a second are made by hand. */
function volleys(state, rng, seconds, taps) {
  const before = state.run.volleys, frame = 0.05;
  let owed = 0;
  for (let t = 0; t < seconds - 1e-9; t += frame) {
    owed += (taps || 0) * frame;
    while (owed >= 1) { S.tap(state, c, rng, NOW + t * 1000); owed -= 1; }
    S.tick(state, frame, ctxOf(x, NOW + (t + frame) * 1000, rng));
  }
  return state.run.volleys - before;
}

test('тап раздувает жар, полный жар ускоряет залпы на heat.speed', () => {
  const { state, rng } = fresh();
  assert.strictEqual(S.heat(state, c), 0); close(S.volleySpeed(state, c, false), 1); close(S.volleySec(state, c, false), c['combat.hitSec']);
  assert.strictEqual(S.tap(state, c, rng, NOW), true);
  close(S.heat(state, c), c['heat.perTap']); close(S.volleySpeed(state, c, false), 1 + c['heat.perTap'] * c['heat.speed']);
  state.run.heat = 0.99; state.run.tapBudget = 4; S.tap(state, c, rng, NOW);
  assert.strictEqual(S.heat(state, c), 1, 'жар не выше полного');
  close(S.volleySec(state, c, false), c['combat.hitSec'] / (1 + c['heat.speed']));
  // A tap the forge does not count (more than forge.tapsPerSec) fans nothing.
  state.run.heat = 0.5; state.run.tapBudget = 0;
  assert.strictEqual(S.tap(state, c, rng, NOW), false); assert.strictEqual(S.heat(state, c), 0.5);
});

test('пока стучишь, клинки бьют чаще; без тапов горн остывает за heat.coolSec', () => {
  const cold = fresh(), hot = fresh();
  const quiet = volleys(cold.state, cold.rng, 20, 0), busy = volleys(hot.state, hot.rng, 20, 4);
  assert.strictEqual(quiet, Math.round(20 / c['combat.hitSec']));
  assert.ok(busy >= quiet * 1.3, 'с тапами залпов заметно больше: ' + busy + ' против ' + quiet);
  assert.ok(busy <= Math.ceil(quiet * (1 + c['heat.speed'])) + 1, 'но не больше, чем даёт полный жар: ' + busy);
  assert.ok(S.heat(hot.state, c) > 0.9);
  // Left alone it cools: from full to cold in heat.coolSec, and the volleys go back to their pace.
  volleys(hot.state, hot.rng, c['heat.coolSec'] / 2, 0);
  assert.ok(S.heat(hot.state, c) > 0.3 && S.heat(hot.state, c) < 0.7, 'на полпути жар около половины: ' + S.heat(hot.state, c));
  volleys(hot.state, hot.rng, c['heat.coolSec'], 0);
  assert.strictEqual(S.heat(hot.state, c), 0);
  assert.strictEqual(volleys(hot.state, hot.rng, 10, 0), Math.round(10 / c['combat.hitSec']));
});

test('урон в секунду растёт с жаром, а фарм и офлайн считают только жар, который держится сам', () => {
  const { state, rng } = fresh();
  const calm = S.dps(state, c, NOW), farm = S.farmRateNow(state, c);
  state.run.heat = 1;
  close(x.Big.toNumber(x.Big.div(S.dps(state, c, NOW), calm)), 1 + c['heat.speed']);
  close(x.Big.toNumber(x.Big.div(S.dps(state, c, 0), calm)), 1, 'расчёт без временных бонусов жар тапов не видит');
  assert.strictEqual(x.Big.str(S.farmRateNow(state, c)), x.Big.str(farm));
  // Away from the game nobody taps: the forge is cold when the owner comes back.
  S.tick(state, 3600, ctxOf(x, NOW + 3600000, rng, { offline: true }));
  assert.strictEqual(S.heat(state, c), 0);
});

test('«Жаркие угли» усиливают полный жар, «Негаснущий огонь» оставляет его часть навсегда', () => {
  const { state, rng } = fresh();
  for (const id of ['ember', 'pilot']) {
    state.run.maxWave = c['up.' + id + '.fromWave'] - 1; assert.strictEqual(S.upUnlocked(state, c, id), false);
    state.run.maxWave = c['up.' + id + '.fromWave']; assert.strictEqual(S.upUnlocked(state, c, id), true);
  }
  state.run.gold = '1e60';
  close(S.heatPower(state, c), c['heat.speed']);
  assert.strictEqual(S.buyUp(state, c, 'ember'), true); assert.strictEqual(S.buyUp(state, c, 'ember'), true);
  close(S.heatPower(state, c), c['heat.speed'] + 2 * c['up.ember.step']);
  // Past the knee a level of «Жаркие угли» still adds, only less.
  state.run.up.ember = c['up.ember.soft']; const knee = S.heatPower(state, c);
  state.run.up.ember = c['up.ember.soft'] + 1; const next = S.heatPower(state, c) - knee;
  assert.ok(next > 0 && next < c['up.ember.step']);

  assert.strictEqual(S.heatFloor(state, c), 0);
  const calm = S.dps(state, c, 0), farm = S.farmRateNow(state, c);
  while (S.buyUp(state, c, 'pilot')) { /* to the last level */ }
  close(S.heatFloor(state, c), c['heat.maxFloor']); assert.strictEqual(S.upOpen(state, c, 'pilot'), false);
  assert.strictEqual(S.lvl(state, 'pilot'), Math.ceil(c['heat.maxFloor'] / c['up.pilot.step'] - 1e-9));
  // The heat that stays counts everywhere, taps or no taps: on screen, in the farm rate, offline.
  assert.strictEqual(S.heat(state, c), c['heat.maxFloor']);
  close(x.Big.toNumber(x.Big.div(S.dps(state, c, 0), calm)), 1 + c['heat.maxFloor'] * S.heatPower(state, c));
  assert.ok(x.Big.gt(S.farmRateNow(state, c), farm));
  state.run.heat = 1; volleys(state, rng, c['heat.coolSec'] * 2, 0);
  close(S.heat(state, c), c['heat.maxFloor']);
  S.tick(state, 600, ctxOf(x, NOW + 600000, rng, { offline: true }));
  close(S.heat(state, c), c['heat.maxFloor']);
});

test('сохранение без жара читается как холодный горн', () => {
  const { state } = fresh();
  delete state.run.heat; S.ensure(state);
  assert.strictEqual(state.run.heat, 0);
  state.run.heat = 7; S.ensure(state); assert.strictEqual(state.run.heat, 1);
  state.run.heat = 'x'; S.ensure(state); assert.strictEqual(state.run.heat, 0);
});

done('heat');
