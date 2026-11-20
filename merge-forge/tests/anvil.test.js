// The anvil a run starts with: 4×3 cells by default, more for a run saved when it started at 4×5.
// node tests/anvil.test.js
'use strict';
const assert = require('assert');
const { open, ctxOf, test, done } = require('./env');

const x = open();
const S = x.sim, cfg = x.cfg;
const NOW = Date.UTC(2026, 10, 19, 12);
function fresh(seed) {
  const state = x.Core.newState(x.game, S, ctxOf(x, NOW, x.Rng.make(seed || 401)));
  S.ensure(state);
  return state;
}
/** A run saved by a version from before the smaller start: it has no keptStart. */
function older(state) {
  delete state.run.keptStart;
  S.ensure(state);
  return state;
}

test('новый забег: 12 клеток, 4×3, первые клинки в начале', () => {
  assert.strictEqual(cfg['grid.start'], 12);
  const state = fresh();
  assert.strictEqual(S.openCells(state, cfg).length, 12);
  assert.deepStrictEqual(S.shape(state, cfg), { cols: 4, rows: 3 });
  assert.deepStrictEqual(S.openCells(state, cfg), [0, 1, 2, 3, 5, 6, 7, 8, 10, 11, 12, 13]);
  const blades = S.openCells(state, cfg).filter(cell => state.run.grid[cell] > 0);
  assert.strictEqual(blades.length, cfg['grid.startBlades']);
  // «Шире наковальня» растит её построчно до 4×5, затем пятый столбец и два ряда: до 35.
  // Past the 35th cell the levels go on as «Резонанс».
  assert.strictEqual(S.room(S.startCells(state, cfg), S.CELLS, cfg['up.wide.step']), (S.CELLS - 12) / cfg['up.wide.step']);
  assert.ok(S.upMax(state, cfg, 'wide') > S.CELLS);
  state.run.up.wide = 8;
  assert.deepStrictEqual(S.shape(state, cfg), { cols: 4, rows: 5 });
});

test('забег, сохранённый до уменьшения, сохраняет свои 20 клеток и клинки на них', () => {
  const state = fresh();
  state.run.grid[21] = 7;
  state.run.grid[23] = 5;
  older(state);
  assert.strictEqual(state.run.keptStart, S.LEGACY_START);
  assert.strictEqual(S.openCells(state, cfg).length, 20);
  assert.ok(S.isOpen(state, cfg, 21) && S.isOpen(state, cfg, 23), 'клинки в рядах 4 и 5 по-прежнему на наковальне');
  assert.strictEqual(S.room(S.startCells(state, cfg), S.CELLS, cfg['up.wide.step']), (S.CELLS - 20) / cfg['up.wide.step']);
  // Сохранение и чтение не возвращают его к меньшей наковальне.
  const again = JSON.parse(JSON.stringify(state));
  S.ensure(again);
  assert.strictEqual(S.openCells(again, cfg).length, 20);
});

test('гнёзда рун: первое — в нижнем ряду начальной наковальни, у старого забега — прежний порядок', () => {
  const state = fresh();
  state.run.maxWave = cfg['rune.fromWave'];
  assert.deepStrictEqual(S.socketCells(state, cfg), [10, 7, 1, 18, 21, 28, 31]);
  assert.strictEqual(S.socketCount(state, cfg), cfg['rune.base']);
  assert.strictEqual(S.sockets(state, cfg)[0].cell, 10, 'руна доступна с самого начала, без «Шире наковальни»');
  const old = older(fresh());
  old.run.maxWave = cfg['rune.fromWave'];
  assert.deepStrictEqual(S.socketCells(old, cfg), [21, 18, 10, 7, 1, 28, 31], 'руны старого забега на своих местах');
  assert.strictEqual(S.sockets(old, cfg)[0].cell, 21);
});

test('перековка начинает новый забег с наковальни из настроек', () => {
  const state = older(fresh());
  assert.strictEqual(S.openCells(state, cfg).length, 20);
  const next = fresh(402);
  assert.strictEqual(next.run.keptStart, 0);
  assert.strictEqual(S.openCells(next, cfg).length, 12);
  // Владелец задаёт размер в настройках: он действует сразу, и не меньше, чем был у старого забега.
  const bigger = Object.assign({}, cfg, { 'grid.start': 24 });
  assert.strictEqual(S.openCells(next, bigger).length, 24);
  assert.strictEqual(S.openCells(state, bigger).length, 24);
});

test('гнездо переносится на другую клетку вместе с руной, занятое меняется местами', () => {
  const state = fresh();
  state.run.maxWave = cfg['rune.fromWave'];
  state.run.up.runeMason = 2;
  const before = S.sockets(state, cfg).map((s) => s.cell);
  assert.ok(before.length >= 2);
  S.setRune(state, cfg, 0, 'greed');
  assert.ok(S.moveSocket(state, cfg, 0, 12), 'на открытую клетку');
  assert.strictEqual(S.sockets(state, cfg)[0].cell, 12);
  assert.strictEqual(S.sockets(state, cfg)[0].rune, 'greed', 'руна едет с гнездом');
  assert.ok(S.runeAt(state, cfg, 12));
  assert.ok(!S.runeAt(state, cfg, before[0]), 'старое место свободно');
  // На клетку другого гнезда: они меняются местами.
  assert.ok(S.moveSocket(state, cfg, 0, before[1]));
  assert.strictEqual(S.sockets(state, cfg)[0].cell, before[1]);
  assert.strictEqual(S.sockets(state, cfg)[1].cell, 12);
  // Закрытая клетка и чужие номера — нет.
  assert.strictEqual(S.moveSocket(state, cfg, 0, 34), false);
  assert.strictEqual(S.moveSocket(state, cfg, 99, 0), false);
  // Сохранение и чтение держат места; испорченные места откатываются к порядку.
  const again = JSON.parse(JSON.stringify(state));
  S.ensure(again);
  assert.deepStrictEqual(S.sockets(again, cfg).map((s) => s.cell), S.sockets(state, cfg).map((s) => s.cell));
  again.run.socketAt = [5, 5];
  assert.deepStrictEqual(S.socketCells(again, cfg), S.baseSocketCells(again, cfg));
});

test('руны: во все гнёзда сразу и «Авто» — лёд на боссе, жадность в остальных', () => {
  const state = fresh();
  state.run.maxWave = cfg['rune.fromWave'];
  state.run.up.runeMason = 2;
  assert.ok(S.setRuneAll(state, cfg, 'ice'));
  assert.ok(S.sockets(state, cfg).every((s) => s.rune === 'ice'));
  assert.ok(S.setRuneAuto(state, cfg, true));
  state.run.wave = cfg['boss.every'];
  state.run.farm = false;
  assert.ok(S.sockets(state, cfg).every((s) => s.rune === 'ice'), 'на боссе');
  state.run.wave = cfg['boss.every'] + 1;
  assert.ok(S.sockets(state, cfg).every((s) => s.rune === 'greed'), 'в обычной волне');
  // Руна, выбранная рукой, выключает «Авто».
  S.setRune(state, cfg, 0, 'fire');
  assert.strictEqual(state.run.runeAuto, false);
  assert.strictEqual(S.sockets(state, cfg)[0].rune, 'fire');
});

done('anvil');
