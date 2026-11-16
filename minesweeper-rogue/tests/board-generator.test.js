'use strict';
// Full acceptance run: $env:BOARD_FIELDS='10000'; node --test tests/board-generator.test.js
// The normal regression run samples 250 fields of each campaign size.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const { HUB } = require(path.join(process.env.ASSI_ROOT || path.resolve(__dirname, '../../../Assi'), 'scripts/games/harness.js'));
const Rng = require(path.join(HUB, 'engine/rng.js'));
const sandbox = { Rng };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../logic/board.js'), 'utf8'), sandbox);
const board = sandbox.MineBoard;
const count = Math.max(1, Number(process.env.BOARD_FIELDS || 250));
const specs = [
  { w: 7, h: 9, mines: 10 },
  { w: 8, h: 11, mines: 14 },
  { w: 8, h: 12, mines: 18, doubles: 4, deaf: 3 },
  { w: 9, h: 13, mines: 22, doubles: 4, deaf: 3 },
  { w: 9, h: 14, mines: 26, doubles: 5, deaf: 3, holes: 3, roamers: 2, clocks: 2 },
  { w: 9, h: 16, mines: 30, doubles: 6, deaf: 3, holes: 3, roamers: 2, clocks: 2 },
  { w: 9, h: 16, mines: 28, doubles: 6, deaf: 3, holes: 3, roamers: 2, clocks: 2, boss: true }
];

for (const template of specs) {
  test(`${count} deterministic, first-safe, solvable ${template.w}x${template.h}/${template.mines}${template.boss ? ' all bosses' : ''}`, () => {
    let hinted = 0, hints = 0, repairs = 0, maximumWork = 0;
    const timings = [];
    const byBoss = {};
    for (let seed = 0; seed < count; seed++) {
      const spec = Object.assign({ caches: 3, findShare: 0.2, fakes: 1 }, template);
      if (spec.boss) {
        if (seed % 4 === 0) spec.inverse = true;
        if (seed % 4 === 1) spec.roamers = 5;
        if (seed % 4 === 2) spec.doubles = 14;
        if (seed % 4 === 3) spec.fog = true;
      }
      const start = (seed * 37 + 17) % (spec.w * spec.h);
      const began = performance.now();
      const field = board.generate(spec, seed, start);
      timings.push(performance.now() - began);
      if (spec.boss) {
        const name = ['inverse', 'swarm', 'double', 'fog'][seed % 4];
        if (!byBoss[name]) byBoss[name] = { timings: [], hints: 0 };
        byBoss[name].timings.push(timings[timings.length - 1]);
        byBoss[name].hints += field.hints ? 1 : 0;
      }
      hinted += field.hints > 0 ? 1 : 0;
      hints += field.hints;
      repairs += field.repairs;
      maximumWork = Math.max(maximumWork, field.work);
      assert.equal(field.ok, true, `generation ${seed}`);
      assert.equal(field.mines, spec.mines, `mine count ${seed}`);
      assert.equal(field.doubles, spec.doubles || 0, `double count ${seed}`);
      assert.equal(field.m[start], '.', `first cell ${seed}`);
      for (const neighbor of board.around(spec.w, spec.h)[start]) assert.equal(board.mined(field.m[neighbor]), false, `3x3 ${seed}`);
      assert.equal(board.solve(field).ok, true, `independent replay ${seed}`);
      if (seed % 100 === 0) assert.equal(JSON.stringify(field), JSON.stringify(board.generate(spec, seed, start)), `determinism ${seed}`);
      if (count >= 10000 && (seed + 1) % 2500 === 0) console.log(`progress ${spec.w}x${spec.h}/${spec.mines}: ${seed + 1}/${count}`);
    }
    timings.sort((a, b) => a - b);
    const totalMs = timings.reduce((a, b) => a + b, 0);
    const report = {
      size: `${template.w}x${template.h}/${template.mines}`, bosses: !!template.boss,
      fields: count, solved: count, hintedFields: hinted, hintRatePercent: +(100 * hinted / count).toFixed(4),
      totalHints: hints, meanRepairs: +(repairs / count).toFixed(3),
      meanMs: +(totalMs / count).toFixed(3), p95Ms: +timings[Math.min(count - 1, Math.floor(count * 0.95))].toFixed(3),
      maxMs: +timings[count - 1].toFixed(3), maximumWork
    };
    console.log('BOARD_REPORT ' + JSON.stringify(report));
    for (const name of Object.keys(byBoss)) {
      const group = byBoss[name];
      group.timings.sort((a, b) => a - b);
      console.log('BOSS_REPORT ' + JSON.stringify({
        boss: name, fields: group.timings.length, solved: group.timings.length, hintedFields: group.hints,
        hintRatePercent: +(100 * group.hints / group.timings.length).toFixed(4),
        p95Ms: +group.timings[Math.floor(group.timings.length * 0.95)].toFixed(3),
        meanMs: +(group.timings.reduce((a, b) => a + b, 0) / group.timings.length).toFixed(3)
      }));
    }
    assert.ok(hinted / count < 0.01, `earth hints on ${hinted}/${count} fields`);
  });
}

test('worker interleaves both queued fields and cancellation discards old starts', () => {
  const messages = [], ticks = [];
  const worker = {
    MineBoard: board, importScripts() {},
    self: { postMessage(message) { messages.push(message); } },
    setTimeout(fn) { ticks.push(fn); }
  };
  vm.createContext(worker);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../logic/worker.js'), 'utf8'), worker);
  const spec = { w: 7, h: 9, mines: 10 };
  worker.self.onmessage({ data: { type: 'prepare', jobs: [
    { key: 'first', spec, seed: 1, starts: [0, 1] },
    { key: 'second', spec, seed: 2, starts: [2, 3] }
  ] } });
  ticks.shift()();
  ticks.shift()();
  assert.deepEqual(messages.map(m => m.key), ['first', 'second']);
  worker.self.onmessage({ data: { type: 'prepare', jobs: [{ key: 'latest', spec, seed: 3, starts: [4] }] } });
  while (ticks.length) ticks.shift()();
  assert.deepEqual(messages.map(m => m.key), ['first', 'second', 'latest', 'latest']);
  assert.equal(messages[2].start, 4);
  assert.equal(messages[3].type, 'done');
  assert.equal(JSON.stringify(messages[2].field), JSON.stringify(board.generate(spec, 3, 4)));
});
