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
  delete state.run.socketsRandom;
  delete state.run.socketAt;
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

test('гнёзда рун: каждое — на случайной открытой клетке, на маленькой наковальне не теряются', () => {
  const state = fresh();
  state.run.maxWave = cfg['rune.fromWave'] - 1;
  assert.deepStrictEqual(S.socketCells(state, cfg), [], 'до волны рун гнёзд нет');
  state.run.maxWave = cfg['rune.fromWave'];
  assert.strictEqual(S.socketCount(state, cfg), cfg['rune.base']);
  assert.ok(S.isOpen(state, cfg, S.sockets(state, cfg)[0].cell), 'руна доступна с самого начала, без «Шире наковальни»');
  // Все семь гнёзд — на 12 открытых клетках начальной наковальни, каждое на своей.
  state.run.up.runeMason = 7;
  const cells = S.socketCells(state, cfg);
  assert.strictEqual(cells.length, 7);
  assert.strictEqual(new Set(cells).size, 7);
  assert.ok(cells.every((c) => S.isOpen(state, cfg, c)), 'ни одно не ушло в закрытый ряд: ' + cells);
  assert.strictEqual(S.socketCount(state, cfg), 7);
  // Случайно, но одинаково для того же забега; в другой игре — иначе.
  assert.deepStrictEqual(S.socketCells(JSON.parse(JSON.stringify(state)), cfg), cells);
  const other = fresh(77);
  other.meta.seed = (state.meta.seed || 0) + 12345;
  other.run.maxWave = cfg['rune.fromWave'];
  other.run.up.runeMason = 7;
  assert.notDeepStrictEqual(S.socketCells(other, cfg), cells);
  // Записанное место не меняется, когда наковальня растёт.
  S.placeSockets(state, cfg);
  assert.deepStrictEqual(state.run.socketAt, cells);
  state.run.up.wide = 20;
  assert.deepStrictEqual(S.socketCells(state, cfg), cells);
});

test('гнёзда рун старого забега: открытые остаются на местах с рунами, закрытые встают на открытые', () => {
  const old = older(fresh());
  old.run.maxWave = cfg['rune.fromWave'];
  old.run.up.runeMason = 6;
  old.run.runes = ['ice', 'greed', 'fire', 'ice', 'greed', 'ice', 'greed'];
  assert.deepStrictEqual(S.socketCells(old, cfg), [21, 18, 10, 7, 1, 28, 31], 'до первого шага — прежний порядок');
  assert.strictEqual(S.socketCount(old, cfg), 5, 'два гнезда в закрытых рядах');
  S.placeSockets(old, cfg);
  assert.strictEqual(old.run.socketsRandom, true);
  const cells = S.socketCells(old, cfg);
  assert.deepStrictEqual(cells.slice(0, 5), [21, 18, 10, 7, 1]);
  assert.strictEqual(cells.length, 7);
  assert.ok(cells.every((c) => S.isOpen(old, cfg, c)) && new Set(cells).size === 7);
  assert.deepStrictEqual(S.sockets(old, cfg).slice(0, 5).map((s) => s.rune), ['ice', 'greed', 'fire', 'ice', 'greed'], 'руны едут со своими гнёздами');
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
  // Испорченное место (два гнезда на одной клетке): второе встаёт на свободную открытую.
  again.run.socketAt = [5, 5];
  const fixed = S.socketCells(again, cfg);
  assert.strictEqual(fixed[0], 5);
  assert.notStrictEqual(fixed[1], 5);
  assert.ok(S.isOpen(again, cfg, fixed[1]));
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
