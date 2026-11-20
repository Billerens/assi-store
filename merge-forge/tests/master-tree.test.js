// The nodes of «Горн мастера» that once opened a thing once and have no last level now:
// «Ускоренный ранний ход», «Память наковальни», «Командный строй».  node tests/master-tree.test.js
'use strict';
const assert = require('assert');
const { open, ctxOf, test, done } = require('./env');

const x = open();
const S = x.sim, cfg = x.cfg, O = S.outpost;
const NOW = Date.UTC(2026, 10, 21, 20);
function fresh(seed) {
  const rng = x.Rng.make(seed || 81);
  const state = x.Core.newState(x.game, S, ctxOf(x, NOW, rng));
  S.ensure(state);
  state.layers.forge.currency = '1e9';
  return { state, rng };
}

test('Ускоренный ранний ход: больше волн с золотом ×3 на каждом уровне', () => {
  const { state } = fresh();
  assert.strictEqual(S.rushWaves(state, cfg), 0);
  assert.ok(S.buyMf(state, cfg, 'rush'));
  assert.strictEqual(S.rushWaves(state, cfg), cfg['mf.rush.waves']);
  assert.ok(S.mfOpen(state, cfg, 'rush'), 'у узла нет последнего уровня');
  assert.ok(S.buyMf(state, cfg, 'rush'));
  assert.strictEqual(S.rushWaves(state, cfg), cfg['mf.rush.waves'] + cfg['mf.rush.wavesStep']);
  const w = S.rushWaves(state, cfg);
  const inside = S.goldMult(state, cfg, w), outside = S.goldMult(state, cfg, w + 1);
  assert.ok(Math.abs(inside / outside - cfg['mf.rush.mult']) < 1e-9);
});

test('Память наковальни: каждый уровень поднимает предел сохраняемого клинка', () => {
  const { state, rng } = fresh();
  state.layers.forge.state.mf.auto = 1;
  state.layers.forge.state.mf.rush = 1;
  for (let i = 0; i < 3; i++) assert.ok(S.buyMf(state, cfg, 'memory'));
  const cap = cfg['mf.memory.maxLevel'] + 2 * cfg['mf.memory.step'];
  assert.strictEqual(S.memoryCap(state, cfg), cap);
  state.run.grid.fill(0);
  state.run.grid[0] = cap + 5;
  state.run.maxWave = 80;
  assert.ok(x.Core.prestige(S, x.game, state, 'forge', ctxOf(x, NOW, rng)).ok);
  assert.ok(state.run.grid.indexOf(cap) >= 0, 'остался клинок уровня ' + cap);
});

test('Командный строй: третье и четвёртое место, дальше — сила всех героев', () => {
  const { state } = fresh();
  state.run.maxWave = 60;
  const mf = state.layers.forge.state.mf;
  const slots = () => O.model(state, cfg).slots;
  mf.team = 1;
  assert.strictEqual(slots(), 2);
  mf.command = 1;
  assert.strictEqual(slots(), 3);
  mf.command = 2;
  assert.strictEqual(slots(), 4);
  mf.command = 5;
  assert.strictEqual(slots(), 4, 'героев всего четыре');
  assert.ok(S.mfOpen(state, cfg, 'command'), 'у узла нет последнего уровня');
  // Past the last place the heroes grow stronger.
  assert.ok(O.recruit(state, cfg, 'bran').ok);
  state.run.grid.fill(0);
  state.run.grid[0] = 12;
  assert.ok(O.equip(state, cfg, 0, 'bran', S.openCells(state, cfg)).ok);
  mf.command = 2;
  const base = x.Big.toNumber(O.heroPower(state, cfg, 'bran'));
  mf.command = 5;
  const more = x.Big.toNumber(O.heroPower(state, cfg, 'bran'));
  assert.ok(Math.abs(more / base - (1 + 3 * cfg['mf.command.power'])) < 1e-9);
});

test('Бережливость: каждое улучшение за золото дешевле в 1 + шаг × уровень раз, без последнего уровня', () => {
  const { state } = fresh();
  const plain = x.Big.toNumber(S.upCost(state, cfg, 'sharp'));
  assert.ok(!S.mfOpen(state, cfg, 'thrift'), 'сначала «Стартовое золото»');
  assert.ok(S.buyMf(state, cfg, 'startGold'));
  for (let i = 0; i < 4; i++) assert.ok(S.buyMf(state, cfg, 'thrift'));
  const k = 1 + 4 * cfg['mf.thrift.step'];
  assert.ok(Math.abs(x.Big.toNumber(S.upCost(state, cfg, 'sharp')) * k / plain - 1) < 1e-9);
  assert.ok(S.mfOpen(state, cfg, 'thrift'), 'у узла нет последнего уровня');
  // Buying spends exactly the cheaper price.
  const price = x.Big.toNumber(S.upCost(state, cfg, 'sharp'));
  state.run.gold = x.Big.str(S.upCost(state, cfg, 'sharp'));
  assert.ok(S.buyUp(state, cfg, 'sharp'));
  assert.ok(x.Big.toNumber(x.Big.of(state.run.gold)) <= price * 1e-9, 'осталось ' + state.run.gold + ' из ' + price);
  // The first level's price the screen counts bulk purchases from.
  assert.ok(Math.abs(x.Big.toNumber(S.upBase(state, cfg, 'eye')) * k / Number(cfg['up.eye.base']) - 1) < 1e-9);
});

test('Глубокая топка: углей за перековку больше на шаг за уровень, и перековка даёт ровно обещанное', () => {
  const { state, rng } = fresh();
  state.run.maxWave = 120;
  const plain = S.coalsGain(state, cfg, 120);
  assert.ok(plain > 0);
  assert.ok(!S.mfOpen(state, cfg, 'kiln'), 'сначала «Ускоренный ранний ход»');
  assert.ok(S.buyMf(state, cfg, 'rush'));
  for (let i = 0; i < 3; i++) assert.ok(S.buyMf(state, cfg, 'kiln'));
  const want = S.coalsGain(state, cfg, 120);
  assert.strictEqual(want, Math.floor(S.coalsPay(cfg, S.coalsFor(cfg, 120), S.forgeLayer(state).state.paid) * (1 + 3 * cfg['mf.kiln.step']) + 1e-9));
  assert.ok(want > plain);
  const before = x.Big.toNumber(x.Big.of(S.forgeLayer(state).currency));
  assert.ok(x.Core.prestige(S, x.game, state, 'forge', ctxOf(x, NOW, rng)).ok);
  assert.strictEqual(x.Big.toNumber(x.Big.of(S.forgeLayer(state).currency)) - before, want, 'перековка дала не то, что обещал экран');
});

done('master tree');
