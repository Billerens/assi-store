'use strict';
require('../tools/hub.js');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { test, done, engine } = require(path.join(process.env.AXIKO_ROOT || path.resolve(__dirname, '../../../Axiko'), 'scripts/games/harness.js'));
const B = require('../board.js');
const L = require('../levels.js');
const catalog = require('../content/challenges.json');
const Rng = engine('rng.js');

function exhaustive(level) {
  function visit(board, index) {
    if (index === level.queue.length) return B.filled(board) === 0 ? 1 : 0;
    let total = 0;
    for (const move of B.places(board, level.queue[index])) {
      const next = board.slice();
      B.put(next, level.queue[index], move[0], move[1]);
      total += visit(next, index + 1);
    }
    return total;
  }
  return visit(level.board, 0);
}

test('DFS agrees with unpruned full board rules for every 2×2 board and small queue', () => {
  const queues = [[], [B.piece('dot', 0)], [B.piece('dot', 0), B.piece('dot', 0)], [B.piece('line2', 0), B.piece('dot', 0)]];
  for (let mask = 0; mask < 16; mask++) {
    for (const queue of queues) {
      const level = { n: 2, board: Array.from({ length: 4 }, (_, at) => mask & (1 << at) ? 1 : 0), queue };
      const answer = L.solve(level, { limit: 100000, budget: 100000 });
      assert.equal(answer.complete, true);
      assert.equal(answer.solutions, exhaustive(level), 'mask ' + mask + ', queue ' + queue.length);
      if (answer.solutions) assert.equal(L.check(level, answer.first), true);
    }
  }
});

test('A solution cap is explicitly a lower bound, and a node budget is not a proof', () => {
  const level = { n: 2, board: [1, 0, 0, 1], queue: [B.piece('dot', 0)] };
  const exact = L.solve(level, { limit: 100 });
  assert.equal(exact.solutions, 2);
  assert.equal(exact.complete, true);
  const capped = L.solve(level, { limit: 1 });
  assert.equal(capped.solutions, 1);
  assert.equal(capped.capped, true);
  assert.equal(capped.complete, false);
  const tooShort = L.solve({ n: 2, board: [1, 0, 0, 0], queue: [B.piece('dot', 0), B.piece('line2', 0)] }, { limit: 100, budget: 1 });
  assert.equal(tooShort.aborted, true);
  assert.equal(tooShort.complete, false);
});

test('DFS counts match an independent exhaustive traversal on 100 seeded 3×3 boards', () => {
  const rng = Rng.make(1729);
  for (let index = 0; index < 100; index++) {
    const level = { n: 3, board: Array.from({ length: 9 }, () => rng.chance(0.45) ? 1 : 0),
      queue: [B.piece(rng.pick(['dot', 'line2', 'corner3']), rng.int(4)), B.piece('dot', 0), B.piece('line2', rng.int(2))] };
    const answer = L.solve(level, { limit: 100000, budget: 100000 });
    assert.equal(answer.complete, true);
    assert.equal(answer.solutions, exhaustive(level), 'sample ' + index);
  }
});

test('Stored 60 seeds regenerate deterministically and have exact independently counted solutions', () => {
  assert.equal(catalog.levels.length, 60);
  const seeds = new Set();
  let previous = Infinity;
  let difficulty = -Infinity;
  for (let index = 0; index < catalog.levels.length; index++) {
    const entry = catalog.levels[index];
    assert.equal(entry.id, index + 1);
    assert.ok(!seeds.has(entry.seed));
    seeds.add(entry.seed);
    const level = L.generate(entry.seed, entry);
    assert.ok(level);
    assert.deepEqual(level, L.generate(entry.seed, entry));
    assert.equal(B.fullLines(level.board).rows.length + B.fullLines(level.board).cols.length, 0);
    assert.equal(L.check(level, level.moves), true);
    delete level.moves;
    const result = L.solve(level, { limit: catalog.limits.solveLimit, budget: catalog.limits.budget });
    assert.equal(result.complete, true);
    assert.equal(result.solutions, entry.solutions);
    assert.equal(L.check(level, result.first), true);
    assert.ok(entry.solutions <= previous, 'Harder levels must not have more solutions');
    assert.ok(entry.difficulty >= difficulty);
    previous = entry.solutions;
    difficulty = entry.difficulty;
  }
});

test('Checking a witness rejects absent, truncated, oversized and illegal move lists', () => {
  const level = L.generate(catalog.levels[0].seed, catalog.levels[0]);
  assert.equal(L.check(level, null), false);
  assert.equal(L.check(level, []), false);
  assert.equal(L.check(level, level.moves.concat([[0, 0]])), false);
  assert.equal(L.check(level, level.moves.map(() => [-1, -1])), false);
});

test('The day seed gives the same offline board and target, with gold and locks', () => {
  const own = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config.json'), 'utf8'));
  const cfg = Object.fromEntries(Object.entries(own).map(([key, item]) => [key, item.value]));
  const seeds = new Set();
  for (let day = 1; day <= 30; day++) {
    const seed = Rng.hash('blocks-daily:2026-11-' + String(day).padStart(2, '0'));
    const a = B.dailyBoard(Rng.make(seed), cfg, 8);
    const b = B.dailyBoard(Rng.make(seed), cfg, 8);
    assert.deepEqual(a, b);
    assert.ok(a.cells.some((cell) => B.kindOf(cell) === B.LOCK));
    assert.ok(a.cells.some((cell) => B.kindOf(cell) === B.GOLD));
    assert.ok(a.target >= cfg['daily.target'] && a.target <= cfg['daily.target'] + cfg['daily.spread']);
    assert.equal(B.fullLines(a.cells).rows.length + B.fullLines(a.cells).cols.length, 0);
    seeds.add(JSON.stringify(a));
  }
  assert.ok(seeds.size > 1);
});

test('1000 reverse-generated puzzles have independently found and exactly counted solutions', () => {
  const report = require('../tools/verify-levels.js').verify(1000, false);
  assert.equal(report.levels, 1000);
  assert.equal(report.searchedWithoutWitness, true);
  assert.ok(report.solutionCount.min > 0);
  console.log('  DFS 1000: решения ' + report.solutionCount.min + '–' + report.solutionCount.max +
    ', первое решение p95 ' + report.firstSolutionMs.p95 + ' мс, максимум ' + report.firstSolutionMs.max + ' мс');
});

done('Блоки: испытания и задача дня');
