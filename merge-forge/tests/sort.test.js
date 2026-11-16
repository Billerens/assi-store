'use strict';
const assert = require('assert');
const { open, ctxOf, test, done } = require('./env');

const x = open();
const NOW = Date.UTC(2026, 10, 16, 12);
function fresh() {
  return x.Core.newState(x.game, x.sim, ctxOf(x, NOW, x.Rng.make(319)));
}
function withoutGrid(state) {
  const copy = JSON.parse(JSON.stringify(state));
  delete copy.run.grid;
  return JSON.stringify(copy);
}
function values(state, cfg) {
  return Array.from(x.sim.openCells(state, cfg), (cell) => state.run.grid[cell]);
}
function put(state, cfg, numbers) {
  x.sim.openCells(state, cfg).forEach((cell, i) => { state.run.grid[cell] = numbers[i] || 0; });
}
function sameContents(a, b) {
  assert.deepStrictEqual(a.slice().sort((p, q) => p - q), b.slice().sort((p, q) => p - q));
}

test('20 клеток: уровни убывают в порядке открытия, одинаковые клинки не сливаются', () => {
  const state = fresh();
  put(state, x.cfg, [0, 4, 2, 4, 10, 1, 0, 3]);
  state.run.pending = [30, 31];
  const before = values(state, x.cfg);
  const other = withoutGrid(state);
  const grid = state.run.grid;
  assert.strictEqual(x.sim.sortGrid(state, x.cfg), true);
  assert.strictEqual(state.run.grid, grid, 'сохраняется сам массив поля');
  assert.deepStrictEqual(values(state, x.cfg), [10, 4, 4, 3, 2, 1].concat(Array(14).fill(0)));
  sameContents(before, values(state, x.cfg));
  assert.strictEqual(withoutGrid(state), other);
  assert.strictEqual(x.sim.sortGrid(state, x.cfg), false);
  assert.strictEqual(withoutGrid(state), other);
});

test('35 клеток: дополнительные столбец и ряды используют ORDER, без потери клинков', () => {
  const state = fresh();
  state.run.up.wide = 100;
  const numbers = Array.from({ length: 35 }, (_, i) => i % 6 === 0 ? 0 : (i * 7) % 12 + 1);
  put(state, x.cfg, numbers);
  const other = withoutGrid(state);
  assert.strictEqual(x.sim.openCells(state, x.cfg).length, 35);
  assert.strictEqual(x.sim.sortGrid(state, x.cfg), true);
  assert.deepStrictEqual(values(state, x.cfg), numbers.slice().sort((a, b) => b - a));
  sameContents(numbers, values(state, x.cfg));
  assert.strictEqual(withoutGrid(state), other);
  const once = JSON.stringify(state);
  assert.strictEqual(x.sim.sortGrid(state, x.cfg), false);
  assert.strictEqual(JSON.stringify(state), once);
});

test('открытые пустое и занятое гнёзда рун остаются на своих местах', () => {
  const state = fresh();
  state.run.maxWave = x.cfg['rune.fromWave'];
  state.run.up.runeMason = 4;
  state.run.runes = ['greed', 'ice', 'fire'];
  x.sim.ensure(state);
  const sockets = Array.from(x.sim.sockets(state, x.cfg));
  assert.ok(sockets.length >= 2);
  put(state, x.cfg, [1, 9, 0, 8, 2, 0, 5, 5]);
  sockets.forEach((s, i) => { state.run.grid[s.cell] = i % 2 ? 0 : 3; });
  const protectedValues = sockets.map((s) => [s.cell, state.run.grid[s.cell]]);
  const before = values(state, x.cfg);
  const other = withoutGrid(state);
  assert.strictEqual(x.sim.sortGrid(state, x.cfg), true);
  protectedValues.forEach(([cell, level]) => assert.strictEqual(state.run.grid[cell], level));
  const protectedCells = new Set(sockets.map((s) => s.cell));
  const moving = Array.from(x.sim.openCells(state, x.cfg)).filter((cell) => !protectedCells.has(cell)).map((cell) => state.run.grid[cell]);
  assert.deepStrictEqual(moving, moving.slice().sort((a, b) => b - a));
  sameContents(before, values(state, x.cfg));
  assert.strictEqual(withoutGrid(state), other);
  assert.strictEqual(x.sim.sortGrid(state, x.cfg), false);
});

test('до открытия рун будущие гнёзда сортируются как обычные клетки', () => {
  const state = fresh();
  state.run.maxWave = x.cfg['rune.fromWave'] - 1;
  put(state, x.cfg, []);
  state.run.grid[x.sim.SOCKETS[0]] = 9;
  assert.strictEqual(x.sim.sortGrid(state, x.cfg), true);
  assert.strictEqual(state.run.grid[x.sim.openCells(state, x.cfg)[0]], 9);
  assert.strictEqual(state.run.grid[x.sim.SOCKETS[0]], 0);
});

test('закрытая клетка со старым содержимым и неизвестные поля сохранения не меняются', () => {
  const state = fresh();
  put(state, x.cfg, [1, 4]);
  const closed = Array.from({ length: 35 }, (_, i) => i).find((cell) => !x.sim.isOpen(state, x.cfg, cell));
  state.run.grid[closed] = 777;
  state.run.pending = [60];
  state.run.futureField = { order: [3, 2, 1] };
  state.meta.futureField = 'keep';
  const other = withoutGrid(state);
  assert.strictEqual(x.sim.sortGrid(state, x.cfg), true);
  assert.strictEqual(state.run.grid[closed], 777);
  assert.strictEqual(withoutGrid(state), other);
});

test('частичное старое сохранение: сортировка не создаёт отсутствующий слой мастера', () => {
  const state = fresh();
  state.run.maxWave = x.cfg['rune.fromWave'];
  delete state.layers.forge;
  put(state, x.cfg, [1, 6, 2]);
  const other = withoutGrid(state);
  assert.strictEqual(x.sim.sortGrid(state, x.cfg), true);
  assert.strictEqual(withoutGrid(state), other);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(state.layers, 'forge'), false);
});

test('пустое поле и поле только с защищённой клеткой не требуют перестановок', () => {
  const state = fresh();
  put(state, x.cfg, []);
  assert.strictEqual(x.sim.sortGrid(state, x.cfg), false);
  const cfg = { ...x.cfg, 'grid.start': 1, 'rune.base': 1 };
  state.run.maxWave = cfg['rune.fromWave'];
  state.run.grid[0] = 9;
  const originalSockets = Array.from(x.sim.SOCKETS);
  const before = JSON.stringify(state);
  try {
    x.sim.SOCKETS.splice(0, x.sim.SOCKETS.length, 0);
    assert.strictEqual(x.sim.sortGrid(state, cfg), false);
    assert.strictEqual(JSON.stringify(state), before);
  } finally {
    x.sim.SOCKETS.splice(0, x.sim.SOCKETS.length, ...originalSockets);
  }
});

test('результат сортировки переживает JSON-перезагрузку и остаётся идемпотентным', () => {
  const state = fresh();
  put(state, x.cfg, [2, 5, 0, 2, 7]);
  x.sim.sortGrid(state, x.cfg);
  const serialized = JSON.stringify(state);
  const reloaded = JSON.parse(serialized);
  assert.strictEqual(x.sim.validate(reloaded), null);
  assert.strictEqual(x.sim.sortGrid(reloaded, x.cfg), false);
  assert.strictEqual(JSON.stringify(reloaded), serialized);
});

done('sort');
