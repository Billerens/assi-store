'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const { HUB } = require(path.join(process.env.ASSI_ROOT || path.resolve(__dirname, '../../../Assi'), 'scripts/games/harness.js'));
const Rng = require(path.join(HUB, 'engine/rng.js'));
const Core = require(path.join(HUB, 'engine/core.js'));
const source = fs.readFileSync(path.join(__dirname, '../logic/board.js'), 'utf8');
const sandbox = { Rng };
vm.createContext(sandbox);
vm.runInContext(source, sandbox);
const board = sandbox.MineBoard;

test('shared subset and browser/CommonJS exports agree', () => {
  assert.deepEqual(Core.lint(source, true), []);
  assert.equal(sandbox.MinesBoard, board);
  const common = { exports: {}, require: file => {
    assert.equal(file, '../../engine/rng.js');
    return Rng;
  } };
  vm.createContext(common);
  vm.runInContext(source, common);
  assert.equal(JSON.stringify(common.exports.generate({ w: 7, h: 9, mines: 10 }, 98, 15)),
    JSON.stringify(board.generate({ w: 7, h: 9, mines: 10 }, 98, 15)));
});

test('neighbours, weighted clues, holes and deaf flood follow the actual rules', () => {
  assert.equal(board.around(3, 3)[0].length, 3);
  assert.equal(board.around(3, 3)[4].length, 8);
  const B = board.model(3, 1, '.2.', '...');
  const K = board.knowledge(B, 'o--');
  board.deduce(B, K);
  assert.equal(B.sum[0], 2);
  assert.equal(K.mask[1], 4);
  assert.equal(K.mask[2], 1);
  const quiet = board.model(3, 1, '...', 'd..');
  const deaf = board.blank(quiet);
  assert.equal(board.reveal(quiet, deaf, 0), 1);
  assert.equal(board.constraints(quiet, deaf).length, 0);
  const holes = board.model(3, 1, '.h.', '...');
  const holeKnowledge = board.blank(holes);
  board.reveal(holes, holeKnowledge, 0);
  assert.equal(holeKnowledge.open[1], 2);
  assert.equal(holeKnowledge.opened, 1);
  assert.equal(holes.safe, 2);
});

test('ordinary flags are beliefs, earth marks and explicit probes are facts', () => {
  const B = board.model(3, 1, '..1', '.e.');
  const K = board.knowledge(B, 'f--', { 2: 2 });
  assert.equal(K.mask[0], 3);
  assert.equal(K.mask[1], 1);
  assert.equal(K.mask[2], 2);
});

test('subset difference proves safety without consulting the layout', () => {
  const K = { mask: [3, 3, 3] };
  assert.equal(board.pairs(K, [
    { cells: [0, 1], t: 1, mode: 'sum' },
    { cells: [0, 1, 2], t: 1, mode: 'sum' }
  ]), 1);
  assert.equal(K.mask[2], 1);
});

test('complete boundary search proves a non-subset deduction and enforces the 24-cell limit', () => {
  const result = board.enumerate({ mask: [3, 3, 3] }, {
    cells: [0, 1, 2], cons: [
      { cells: [0, 1], t: 1, mode: 'sum' },
      { cells: [1, 2], t: 1, mode: 'sum' },
      { cells: [0, 2], t: 2, mode: 'sum' }
    ]
  }, 24, { nodes: 0, limit: 50000 });
  assert.equal(result.count, 1);
  assert.deepEqual(Array.from(result.keys[4096]), [2, 1, 2]);
  const cells = Array.from({ length: 24 }, (_, i) => i);
  const zero = board.enumerate({ mask: cells.map(() => 7) }, {
    cells, cons: [{ cells, t: 0, mode: 'sum' }]
  }, 24, { nodes: 0, limit: 50000 });
  assert.equal(zero.count, 1);
  assert.equal(board.enumerate({ mask: [] }, { cells: cells.concat(24) }, 24, { nodes: 0 }).big, true);
});

test('global totals work even with no visible boundary and can identify double mines', () => {
  const B = board.model(3, 1, '2..', 'ddd');
  const K = board.knowledge(B, '---', { 0: 6, 1: 1 });
  const result = board.think(B, K);
  assert.equal(result.rule, 'simple'); // the pre-existing safe fact is returned first
  board.deduce(B, K);
  assert.equal(K.mask[0], 4);
  assert.equal(K.mask[2], 1);
});

test('complete local equation subsets remain useful when an extra clue joins more than 24 cells', () => {
  const equations = [
    { cells: [0, 1, 2], t: 1 }, { cells: [0, 1, 3], t: 1 }, { cells: [2, 3, 4], t: 1 }
  ];
  for (let i = 4; i < 26; i++) equations.push({ cells: [i, i + 1], t: 1 });
  const n = 27 + equations.length;
  // Only visible equations are supplied; there is no actual hidden mine layout to consult.
  const B = { n, M: 27, D: 0, dom: 3, inverse: false, fog: false,
    all: Array.from({ length: n }, (_, i) => i), nb: [], sum: [], t: [] };
  const K = { open: [], mask: [], opened: equations.length, last: -1 };
  for (let i = 0; i < n; i++) {
    K.open.push(i < 27 ? 0 : 1);
    K.mask.push(i < 27 ? 3 : 1);
    B.nb.push(i < 27 ? [] : equations[i - 27].cells);
    B.sum.push(i < 27 ? 0 : equations[i - 27].t);
    B.t.push('.');
  }
  assert.equal(board.pieces(K, board.constraints(B, K))[0].cells.length, 27);
  const result = board.think(B, K, { skipTotals: true, enumLimit: 24 });
  assert.equal(result.rule, 'border');
  assert.equal(K.mask[2], 1);
  assert.equal(K.mask[3], 1);
  assert.equal(K.mask[4], 2);
  let valid = 0;
  for (let code = 0; code < 32; code++) {
    const values = Array.from({ length: 5 }, (_, i) => (code >> i) & 1);
    for (let i = 5; i < 27; i++) values.push(1 - values[i - 1]);
    if (!equations.every(eq => eq.cells.reduce((sum, i) => sum + values[i], 0) === eq.t)) continue;
    valid++;
    for (let i = 0; i < 27; i++) assert.ok(K.mask[i] & (1 << values[i]));
  }
  assert.equal(valid, 2);
});

test('global totals still solve the final border after all double mines have been identified', () => {
  const field = {
    w: 9, h: 13,
    m: '11..............1......1.......1..11.2..1..........1...........2.......1.....1..2.1..1..2................1.1...1...11',
    t: '..........................g.....g............................d.................z..........g.....d...........d........'
  };
  const B = board.model(field.w, field.h, field.m, field.t);
  const K = board.knowledge(B, 'ffoooooooooooooofoooooofooooooofooffofoofoooooooooofooooooooooofooooooofooooofoofofoofoofoooooooooooooooof-fooofooo-f');
  board.deduce(B, K);
  assert.equal(K.mask[106], 1);
  assert.equal(K.mask[107], 2);
  assert.equal(K.mask[115], 2);
  assert.equal(K.mask[116], 2);
  assert.equal(board.play(B, K).ok, true);
});

test('global mine and double totals exactly respect heterogeneous interior domains', () => {
  const rng = Rng.make(93751);
  for (let sample = 0; sample < 180; sample++) {
    const actual = Array.from({ length: 4 }, () => rng.int(3));
    const domains = actual.map(value => (1 << value) | (1 + rng.int(7)));
    const B = board.model(4, 1, actual.map(value => value ? String(value) : '.').join(''), 'dddd');
    const known = {};
    domains.forEach((mask, i) => { known[i] = mask; });
    const K = board.knowledge(B, '----', known);
    board.deduce(B, K);
    const support = [0, 0, 0, 0];
    for (let code = 0; code < 81; code++) {
      let remainder = code;
      const values = [];
      for (let i = 0; i < 4; i++) { values.push(remainder % 3); remainder = Math.floor(remainder / 3); }
      if (values.some((value, i) => !(domains[i] & (1 << value)))) continue;
      if (values.filter(value => value > 0).length !== B.M || values.filter(value => value === 2).length !== B.D) continue;
      values.forEach((value, i) => { support[i] |= 1 << value; });
    }
    assert.deepEqual(Array.from(K.mask), support, 'interior domains ' + domains.join(','));
  }
});

test('final replay includes earth hints and the map shard before any deduction', () => {
  const spec = { w: 9, h: 16, mines: 28, doubles: 6, deaf: 3, holes: 3,
    roamers: 2, clocks: 2, inverse: true, caches: 3, findShare: 0.2, fakes: 1 };
  const seed = 2196;
  const field = board.generate(spec, seed, (seed * 37 + 17) % 144);
  assert.equal(board.solve(field).ok, true);
  for (const fog of [false, true]) {
    for (let i = 0; i < 100; i++) {
      const withShard = board.generate(Object.assign({}, spec, { shard: true, fog }), i, i % 144);
      assert.equal(board.solve(withShard).ok, true, 'shard/fog replay ' + i + '/' + fog);
    }
  }
});

test('fog omits distant clues and an opened cell may be inspected again', () => {
  const B = board.model(7, 1, '..1....', '.......', { fog: true, last: 6 });
  const K = board.knowledge(B, 'oo-oooo');
  assert.ok(board.constraints(B, K).every(c => c.at >= 4));
  const before = K.opened;
  board.reveal(B, K, 1);
  assert.equal(K.opened, before);
  assert.equal(K.last, 1);
  assert.ok(board.constraints(B, K).some(c => c.at === 1));
});

test('inverse clues count neighbouring mined cells, not double weight', () => {
  const B = board.model(3, 1, '.2.', '...', { inverse: true });
  const K = board.knowledge(B, 'o--');
  const clues = board.constraints(B, K);
  assert.equal(clues[0].mode, 'cnt');
  assert.equal(clues[0].t, 1);
  board.deduce(B, K);
  assert.equal(K.mask[1], 4);
  assert.equal(K.mask[2], 1);
});

test('inverse occupancy enumeration preserves every double-count group exactly', () => {
  const rng = Rng.make(83157);
  for (let sample = 0; sample < 40; sample++) {
    const actual = Array.from({ length: 7 }, () => rng.int(3));
    const mask = actual.map(value => (1 << value) | (1 + rng.int(7)));
    const cells = Array.from({ length: 7 }, (_, i) => i);
    const cons = [];
    for (let i = 0; i < 5; i++) {
      const near = [i, i + 1, i + 2];
      cons.push({ cells: near, t: near.filter(at => actual[at] > 0).length, mode: 'cnt' });
    }
    const expected = {};
    let count = 0;
    for (let code = 0; code < 2187; code++) {
      let remainder = code;
      const values = [];
      for (let i = 0; i < 7; i++) { values.push(remainder % 3); remainder = Math.floor(remainder / 3); }
      if (values.some((value, i) => !(mask[i] & (1 << value)))) continue;
      if (cons.some(eq => eq.cells.filter(at => values[at] > 0).length !== eq.t)) continue;
      const key = values.filter(value => value > 0).length * 2048 + values.filter(value => value === 2).length;
      if (!expected[key]) expected[key] = cells.map(() => 0);
      values.forEach((value, i) => { expected[key][i] |= 1 << value; });
      count++;
    }
    const enumerated = board.enumerate({ mask }, { cells, cons }, 24, { nodes: 0, limit: 50000 });
    assert.equal(enumerated.count, count);
    assert.deepEqual(JSON.parse(JSON.stringify(enumerated.keys)), expected);
  }
});

test('all first-click positions are safe in their full 3x3 and wide-step opens at least 12', () => {
  for (let start = 0; start < 63; start++) {
    const field = board.generate({ w: 7, h: 9, mines: 10, minOpen: 12 }, 312, start);
    assert.ok(field.ok);
    assert.equal(board.mined(field.m[start]), false);
    for (const n of board.around(7, 9)[start]) assert.equal(board.mined(field.m[n]), false);
    const B = board.model(7, 9, field.m, field.t);
    const K = board.blank(B);
    board.reveal(B, K, start);
    assert.ok(K.opened >= 12);
    assert.ok(board.solve(field).ok);
  }
  assert.throws(() => board.generate({ w: 7, h: 9, mines: 10 }, 1, -1));
});

test('fallback earth hints are visible safe facts and the final field solves without guessing', () => {
  let field;
  for (let seed = 0; seed < 100; seed++) {
    field = board.generate({ w: 9, h: 16, mines: 35, doubles: 8, deaf: 8 }, seed, 0, { repairTries: 0 });
    if (field.hints) break;
  }
  assert.ok(field.hints > 0);
  assert.equal(field.unassisted, false);
  assert.equal(field.ok, true);
  assert.equal(field.hints, field.t.split('').filter(x => x === 'e').length);
  for (let i = 0; i < field.t.length; i++) if (field.t[i] === 'e') assert.equal(field.m[i], '.');
  assert.ok(board.solve(field).ok);
});

test('fog, inverse, doubles, roamers and clocks replay deterministically', () => {
  for (const special of [{ fog: true }, { inverse: true }, { doubles: 14 }, { roamers: 5, clocks: 2 }]) {
    const spec = Object.assign({ w: 9, h: 16, mines: 28 }, special);
    for (let seed = 0; seed < 20; seed++) {
      const a = board.generate(spec, seed, 67);
      const b = board.generate(spec, seed, 67);
      assert.equal(JSON.stringify(a), JSON.stringify(b));
      assert.ok(board.solve(a).ok, JSON.stringify({ special, seed }));
    }
  }
});

test('every deduction agrees with independent exhaustive 0/1/2 layouts on small boards', () => {
  const rng = Rng.make(873101);
  for (let sample = 0; sample < 36; sample++) {
    const actual = Array.from({ length: 9 }, () => rng.int(3));
    const m = actual.map(v => v ? String(v) : '.').join('');
    const t = actual.map(() => rng.chance(0.2) ? 'd' : '.').join('');
    const inverse = sample % 3 === 0;
    const B = board.model(3, 3, m, t, { inverse });
    const vis = actual.map(v => v === 0 && rng.chance(0.7) ? 'o' : '-').join('');
    const K = board.knowledge(B, vis);
    board.deduce(B, K);
    let accepted = 0;
    for (let code = 0; code < 19683; code++) {
      let rest = code;
      const values = [];
      let mines = 0, doubles = 0, matches = true;
      for (let i = 0; i < 9; i++) {
        const v = rest % 3;
        rest = Math.floor(rest / 3);
        values.push(v);
        mines += v > 0 ? 1 : 0;
        doubles += v === 2 ? 1 : 0;
        if (vis[i] === 'o' && v) matches = false;
      }
      if (!matches || mines !== B.M || doubles !== B.D) continue;
      for (let i = 0; i < 9 && matches; i++) {
        if (vis[i] !== 'o' || t[i] === 'd') continue;
        const sum = B.nb[i].reduce((s, j) => s + (inverse ? (values[j] > 0 ? 1 : 0) : values[j]), 0);
        if (sum !== (inverse ? B.cnt[i] : B.sum[i])) matches = false;
      }
      if (!matches) continue;
      accepted++;
      for (let i = 0; i < 9; i++) assert.ok(K.mask[i] & (1 << values[i]), `sample ${sample}, cell ${i}, layout ${code}`);
    }
    assert.ok(accepted > 0);
  }
});

test('roaming keeps known cells fixed and every accepted destination remains solvable', () => {
  let accepted = 0;
  for (let seed = 0; seed < 20; seed++) {
    const field = board.generate({ w: 9, h: 14, mines: 26, roamers: 3 }, seed, 4);
    const B = board.model(field.w, field.h, field.m, field.t);
    const K = board.blank(B);
    board.reveal(B, K, field.start);
    const before = JSON.stringify(K);
    for (let from = 0; from < B.n; from++) {
      if (B.m[from] !== 'r') continue;
      for (const to of B.nb[from]) {
        if (!board.canMove(B, K, from, to)) continue;
        accepted++;
        const moved = B.m.slice();
        moved[from] = '.';
        moved[to] = 'r';
        const next = board.model(B.w, B.h, moved.join(''), field.t);
        assert.ok(board.play(next, board.copy(K)).ok);
        const known = board.copy(K);
        known.mask[to] = 1;
        assert.equal(board.canMove(B, known, from, to), false);
      }
    }
    assert.equal(JSON.stringify(K), before);
  }
  assert.ok(accepted > 0);
});
