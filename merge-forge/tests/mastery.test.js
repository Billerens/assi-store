// The upgrades past their old caps: «Сокрушительный удар», «Перегрев», «Резонанс»; «Лавка кузнеца» with «Переплавка».
// node tests/mastery.test.js
'use strict';
const assert = require('assert');
const { open, ctxOf, test, done } = require('./env');

const x = open();
const S = x.sim, cfg = x.cfg, B = x.Big;
const NOW = Date.UTC(2026, 10, 20, 12);
function fresh(seed) {
  const state = x.Core.newState(x.game, S, ctxOf(x, NOW, x.Rng.make(seed || 91)));
  S.ensure(state);
  return state;
}
const close = (a, b, m) => assert.ok(Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b)), m || a + ' != ' + b);

test('«Переплавка» стала частью «Лавки кузнеца»: её уровни переходят туда', () => {
  assert.ok(!S.UP.some((u) => u.id === 'remelt'));
  const state = fresh();
  state.run.up.remelt = 3;
  state.run.up.stall = 1;
  S.ensure(state);
  assert.strictEqual(state.run.up.remelt, undefined);
  assert.strictEqual(state.run.up.stall, 3);
  assert.strictEqual(S.sellShare(state, cfg), 1);
  state.run.up.stall = 1;
  close(S.sellShare(state, cfg), cfg['sell.share'] + cfg['up.stall.share']);
});

test('«Сокрушительный удар»: за пределом шанса крит может ударить ещё раз; в среднем — m·m^⌊o⌋·(1−f+f·m)', () => {
  const state = fresh();
  const cap = S.room(cfg['crit.chance'], cfg['crit.maxChance'], cfg['up.eye.step']);
  state.run.up.eye = cap;
  assert.strictEqual(S.overcrit(state, cfg), 0);
  state.run.up.eye = cap + 10;
  close(S.overcrit(state, cfg), 10 * cfg['up.eye.over']);
  const U = require('../upgrade-progress.js');
  close(U.critAverage(3, 0), 3);
  close(U.critAverage(3, 0.5), 3 * (0.5 + 0.5 * 3));
  close(U.critAverage(3, 1.5), 3 * 3 * (0.5 + 0.5 * 3));
  // In a volley: every crit strikes once more when the share is 1.
  state.run.up.eye = cap + Math.round(1 / cfg['up.eye.over']);
  state.run.grid.fill(0);
  state.run.grid[0] = 10;
  state.run.walkT = 0;
  state.run.hp = '1e300';
  state.run.hpMax = '1e300';
  const rng = { chance: (q) => q > 0, next: () => 0.5, int: () => 0, range: (a) => a, pick: (l) => l[0] };
  const m = S.critMult(state, cfg);
  const ctx = Object.assign(ctxOf(x, NOW, rng), { rng });
  state.run.encounter = null;
  S.tick(state, cfg['combat.hitSec'], ctx);
  assert.deepStrictEqual(state.run.smashes, [0]);
  const hit = B.toNumber(B.of(state.run.lastHit));
  close(hit / (S.cellDmg(state, cfg, 0) * B.toNumber(S.dmgMult(state, cfg, NOW))), m * m, 'крит в квадрате');
});

test('«Резонанс»: за 35-й клеткой клинок рядом с таким же бьёт сильнее', () => {
  const state = fresh();
  const room = S.room(S.startCells(state, cfg), S.CELLS, cfg['up.wide.step']);
  state.run.up.wide = room;
  state.run.grid.fill(0);
  state.run.grid[0] = 7;
  state.run.grid[1] = 7;
  state.run.grid[2] = 5;
  const alone = S.cellDmg(state, cfg, 2);
  const pair = S.cellDmg(state, cfg, 0);
  assert.strictEqual(S.resonance(state, cfg), 0);
  state.run.up.wide = room + 4;
  close(S.resonance(state, cfg), 4 * cfg['up.wide.res']);
  assert.ok(S.resonates(state, cfg, 0) && S.resonates(state, cfg, 1) && !S.resonates(state, cfg, 2));
  close(S.cellDmg(state, cfg, 0), pair * (1 + 4 * cfg['up.wide.res']));
  close(S.cellDmg(state, cfg, 2), alone, 'одиночный клинок без резонанса');
  // A neighbour across the row's edge does not count.
  state.run.grid.fill(0);
  state.run.grid[4] = 6;
  state.run.grid[5] = 6;
  assert.ok(!S.resonates(state, cfg, 4) && !S.resonates(state, cfg, 5));
});

test('«Перегрев»: жар тапов сверх полного копит вспышку, полная — следующий залп сильнее', () => {
  const state = fresh();
  const cap = S.room(0, cfg['heat.maxFloor'], cfg['up.pilot.step']);
  state.run.maxWave = 60;
  state.run.up.pilot = cap + 2;
  close(S.burstMult(state, cfg), 1 + 2 * cfg['up.pilot.burst']);
  state.run.heat = 1;
  state.run.tapBudget = 100;
  state.run.forgeT = 1e9;
  const taps = Math.ceil(cfg['heat.overCost'] / cfg['heat.perTap']);
  for (let i = 0; i < taps; i++) S.tap(state, cfg, null, NOW);
  assert.strictEqual(state.run.bursts, 1, 'вспышка готова');
  state.run.grid.fill(0);
  state.run.grid[0] = 10;
  state.run.walkT = 0;
  state.run.hp = '1e300';
  state.run.hpMax = '1e300';
  state.run.encounter = null;
  const rng = { chance: () => false, next: () => 0.5, int: () => 0, range: (a) => a, pick: (l) => l[0] };
  S.tick(state, cfg['combat.hitSec'], Object.assign(ctxOf(x, NOW, rng), { rng }));
  assert.strictEqual(state.run.bursts, 0);
  assert.ok(state.run.lastBurst && state.run.lastBurst.mult === S.burstMult(state, cfg));
  // Without the levels past the cap there is no overheat.
  const plain = fresh();
  plain.run.up.pilot = cap;
  plain.run.heat = 1;
  plain.run.tapBudget = 100;
  plain.run.forgeT = 1e9;
  for (let i = 0; i < taps * 2; i++) S.tap(plain, cfg, null, NOW);
  assert.strictEqual(plain.run.bursts, 0);
});

done('mastery');
