'use strict';
require('./hub.js');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const L = require('../levels.js');

function rounded(n) { return Math.round(n * 1000) / 1000; }
function stats(list) {
  const ordered = list.slice().sort((a, b) => a - b);
  return { mean: rounded(list.reduce((a, b) => a + b, 0) / list.length), p95: rounded(ordered[Math.floor(ordered.length * 0.95)]), max: rounded(ordered[ordered.length - 1]) };
}

function verify(count, writeReport) {
  const firstTimes = [];
  const countTimes = [];
  const generationTimes = [];
  const solutions = [];
  const nodes = [];
  const seeds = [];
  let rejected = 0;
  for (let seed = 10001; seeds.length < count && seed < 100000; seed++) {
    const started = performance.now();
    const level = L.generate(seed, { n: 8, k: 4, clear: 0.55, two: 0.25 });
    const generationMs = performance.now() - started;
    if (!level) { rejected++; continue; }
    // Deliberately remove the reverse construction's witness. The search only sees the puzzle.
    delete level.moves;
    const firstStarted = performance.now();
    const first = L.solve(level, { limit: 1, budget: 30000 });
    const firstMs = performance.now() - firstStarted;
    assert.ok(!first.aborted && first.solutions > 0 && L.check(level, first.first), 'DFS found no legal solution for seed ' + seed);
    const countStarted = performance.now();
    const all = L.solve(level, { limit: 100000, budget: 30000 });
    const countMs = performance.now() - countStarted;
    assert.ok(all.complete && all.solutions > 0 && L.check(level, all.first), 'Exact count failed for seed ' + seed);
    seeds.push(seed);
    firstTimes.push(firstMs);
    countTimes.push(countMs);
    generationTimes.push(generationMs);
    solutions.push(all.solutions);
    nodes.push(all.nodes);
  }
  assert.equal(seeds.length, count, 'Not enough generated puzzles');
  const report = {
    levels: count,
    firstSeed: seeds[0],
    lastSeed: seeds[seeds.length - 1],
    rejectedReverseConstructions: rejected,
    searchedWithoutWitness: true,
    solutionCount: { min: Math.min(...solutions), max: Math.max(...solutions), mean: rounded(solutions.reduce((a, b) => a + b, 0) / solutions.length) },
    firstSolutionMs: stats(firstTimes),
    exactCountMs: stats(countTimes),
    slowestCountSeed: seeds[countTimes.indexOf(Math.max(...countTimes))],
    reverseGenerationMs: stats(generationTimes),
    maxSearchNodes: Math.max(...nodes),
    environment: { platform: process.platform, arch: process.arch, node: process.version },
    phoneTimingVerified: false
  };
  if (writeReport !== false) fs.writeFileSync(path.join(__dirname, 'levels-report.json'), JSON.stringify(report, null, 2) + '\n');
  return report;
}

if (require.main === module) console.log(JSON.stringify(verify(Number(process.argv[2]) || 1000), null, 2));
module.exports = { verify };
