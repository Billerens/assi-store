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

done('master tree');
