// The chapters of «Ветки поездов»: node tools/gen-levels.js [chapter…]
//
// For each chapter of content/chapters.json: the hand-made tutorials (chapter 1), then candidates of
// the generator (rails.js — the same code the phone runs for the level of the day) by a fixed seed
// until the pool in the chapter's band of difficulty is full, then 15 levels picked evenly by d and
// sorted by d. Every level passed the brute force of rails.solve: a solution exists, the start is
// not one, no switch is useless, the share of solutions is under the chapter's threshold.
// Writes content/levels-NN.json (one level a line) and prints the numbers.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ENGINE = [
  path.resolve(ROOT, '..', '..', 'Axiko', 'app', 'src', 'main', 'assets', 'factory', 'modules', 'games', 'engine'),
  path.resolve(ROOT, '..', 'engine')
].find((d) => fs.existsSync(path.join(d, 'rng.js')));
const Rng = require(path.join(ENGINE, 'rng.js'));

/** rails.js as the phone loads it, with its ../engine/rng.js. */
function loadRails() {
  const src = fs.readFileSync(path.join(ROOT, 'rails.js'), 'utf8');
  const m = { exports: {} };
  new Function('exports', 'module', 'require', src)(m.exports, m, (p) => (/rng\.js$/.test(p) ? Rng : require(p)));
  return m.exports;
}
const Rails = loadRails();
const CH = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'chapters.json'), 'utf8'));
const NAMES = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'names.json'), 'utf8'));
const PER_CHAPTER = 15;

// ---- the tutorials of chapter 1, by hand ------------------------------------------------------------

/** A level from a sketch: nodes [x, y, t, [out…], extra], trains, the start of the switches. */
function sketch(id, title, nodes, trains, delay) {
  const lv = {
    w: 5, h: 8, delay: delay || 0,
    nodes: nodes.map((n) => {
      const o = { x: n[0], y: n[1], t: n[2], o: n[3] || [] };
      Object.assign(o, n[4] || {});
      if (o.t === 'W') {
        o.k = o.k || 'm';
        o.v = o.v === undefined ? 1 : o.v;
        o.p = o.p || 0;
      }
      return o;
    }),
    trains: trains.map((t) => ({ d: t[0], t: t[1], c: t[2], l: 1 }))
  };
  lv.title = title;
  lv.tutorial = true;
  return finish(lv, id);
}

function finish(lv, id) {
  const s = Rails.solve(lv, { cap: 16384 });
  if (!s.S || s.startWin || s.useless.length) throw new Error(id + ': учебный уровень не проходит проверку ' + JSON.stringify({ S: s.S, start: s.startWin, useless: s.useless }));
  lv.S = s.S;
  lv.V = s.V;
  lv.par = s.par;
  lv.dpar = s.dpar;
  lv.sol = s.best;
  lv.merges = lv.nodes.filter((n) => n.t === 'M').length;
  lv.bridges = lv.nodes.filter((n) => n.z).length;
  lv.shape = 'tree';
  lv.d = Rails.difficulty(s.V, s.S, lv.trains.length, lv.merges);
  lv.kinds = Rails.kindsOf(lv);
  return lv;
}

function tutorials() {
  return [
    // 1. One switch: send the train to its colour.
    sketch('1-1', 'Первая стрелка', [
      [0, 1, 'D', [1]], [1, 1, 'R', [2]], [2, 1, 'W', [3, 5]], [3, 1, 'R', [4]], [4, 1, 'S', [], { c: 0 }],
      [2, 2, 'R', [6]], [2, 3, 'R', [7]], [2, 4, 'R', [8]], [2, 5, 'R', [9]], [2, 6, 'R', [10]], [2, 7, 'S', [], { c: 1 }]
    ], [[0, 0, 1]]),
    // 2. Two switches one after another.
    sketch('1-2', 'Две стрелки подряд', [
      [0, 1, 'D', [1]], [1, 1, 'W', [2, 5]], [2, 1, 'R', [3]], [3, 1, 'R', [4]], [4, 1, 'S', [], { c: 0 }],
      [1, 2, 'R', [6]], [1, 3, 'W', [7, 10]], [2, 3, 'R', [8]], [3, 3, 'R', [9]], [4, 3, 'S', [], { c: 1 }],
      [1, 4, 'R', [11]], [1, 5, 'R', [12]], [1, 6, 'R', [13]], [1, 7, 'S', [], { c: 2 }]
    ], [[0, 0, 2]]),
    // 3. Two depots, two trains.
    sketch('1-3', 'Два депо', [
      [0, 2, 'D', [1]], [1, 2, 'W', [2, 5]], [2, 2, 'R', [3]], [3, 2, 'R', [4]], [4, 2, 'S', [], { c: 0 }],
      [2, 3, 'R', [6]], [3, 4, 'R', [7]], [4, 5, 'S', [], { c: 1 }],
      [0, 5, 'D', [9]], [1, 5, 'W', [10, 13]], [2, 5, 'R', [11]], [3, 5, 'R', [12]], [4, 6, 'S', [], { c: 2 }],
      [1, 6, 'R', [14]], [1, 7, 'S', [], { c: 3 }]
    ], [[0, 0, 1], [8, 1, 3]]),
    // 4. Every train of a depot goes the same way while the switches stand still.
    sketch('1-4', 'Поезда по расписанию', [
      [0, 1, 'D', [1]], [1, 1, 'W', [2, 5]], [2, 1, 'R', [3]], [3, 1, 'R', [4]], [4, 1, 'S', [], { c: 0 }],
      [2, 2, 'R', [6]], [3, 3, 'W', [7, 8]], [4, 3, 'S', [], { c: 1 }],
      [3, 4, 'R', [9]], [3, 5, 'R', [10]], [3, 6, 'R', [11]], [3, 7, 'S', [], { c: 2 }]
    ], [[0, 0, 2], [0, 2, 2]]),
    // 5. Three depots, three switches.
    sketch('1-5', 'Три депо', [
      [0, 0, 'D', [1]], [1, 0, 'R', [2]], [2, 0, 'W', [3, 5]], [3, 0, 'R', [4]], [4, 0, 'S', [], { c: 0 }],
      [2, 1, 'R', [6]], [3, 2, 'R', [7]], [4, 2, 'S', [], { c: 1 }],
      [0, 3, 'D', [9]], [1, 3, 'W', [10, 13], { p: 1 }], [2, 3, 'R', [11]], [3, 3, 'R', [12]], [4, 3, 'S', [], { c: 2 }],
      [1, 4, 'R', [14]], [2, 5, 'R', [15]], [3, 5, 'R', [16]], [4, 5, 'S', [], { c: 3 }],
      [0, 6, 'D', [18]], [1, 6, 'W', [19, 22]], [2, 6, 'R', [20]], [3, 6, 'R', [21]], [4, 6, 'S', [], { c: 4 }],
      [1, 7, 'S', [], { c: 5 }]
    ], [[0, 0, 1], [8, 0, 2], [17, 1, 5]])
  ];
}

// ---- chapters ----------------------------------------------------------------------------------------

function signature(lv) {
  return lv.nodes.map((n) => n.x + ',' + n.y + n.t + (n.k || '')).join(';') + '|' + lv.trains.map((t) => t.d + ':' + t.t).join(',');
}

function chapter(ch) {
  const t0 = Date.now();
  // gen may be a list of parameter sets (chapter 10 mixes trees, rings and corridors).
  const sets = [].concat(ch.gen).map((g) => Object.assign({ cap: 16384 }, ch.gen.band ? {} : { band: ch.band }, g));
  const p = sets[0];
  const rng = Rng.make(Rng.hash('train-switches:chapter:' + ch.n + ':v1'));
  const fixed = ch.tutorials ? tutorials() : [];
  const need = PER_CHAPTER - fixed.length;
  const pool = [];
  const seen = {};
  let tried = 0;
  let accepted = 0;
  // Every parameter set fills its own share of the pool, so a mix stays a mix.
  const want = Math.ceil(need * 10 / sets.length);
  const count = sets.map(() => 0);
  while (count.some((c) => c < want) && tried < 60000) {
    const k = tried % sets.length;
    tried++;
    if (count[k] >= want) continue;
    const lv = Rails.candidate(sets[k], rng);
    if (!lv) continue;
    accepted++;
    if (lv.d < p.band[0] || lv.d > p.band[1]) continue;
    const sig = signature(lv);
    if (seen[sig]) continue;
    seen[sig] = 1;
    lv.set = k;
    count[k]++;
    pool.push(lv);
  }
  if (pool.length < need) throw new Error('Глава ' + ch.n + ': в коридоре сложности только ' + pool.length + ' уровней из ' + tried + ' попыток');
  // Evenly spaced targets of d across the band: the nearest level of the pool to each one.
  pool.sort((a, b) => a.d - b.d);
  const picked = [];
  const used = {};
  // delayShare: that part of the chapter needs a delay for three stars (the chapter of delays).
  const every = ch.delayShare ? Math.max(1, Math.round(1 / ch.delayShare)) : 0;
  for (let i = 0; i < need; i++) {
    const target = p.band[0] + (p.band[1] - p.band[0]) * i / Math.max(1, need - 1);
    const wantDelay = every && i % every === every - 1 && pool.some((lv, k) => !used[k] && lv.dpar > 0);
    // A mix takes its sets in turn.
    const set = sets.length > 1 && pool.some((lv, k) => !used[k] && lv.set === i % sets.length) ? i % sets.length : -1;
    let best = -1;
    pool.forEach((lv, k) => {
      if (used[k] || (wantDelay && !(lv.dpar > 0)) || (set >= 0 && lv.set !== set)) return;
      if (best < 0 || Math.abs(lv.d - target) < Math.abs(pool[best].d - target)) best = k;
    });
    used[best] = 1;
    picked.push(pool[best]);
  }
  const levels = fixed.concat(picked.sort((a, b) => a.d - b.d));
  const names = Rng.make(Rng.hash('train-switches:names:' + ch.n));
  levels.forEach((lv, i) => {
    lv.id = ch.n + '-' + (i + 1);
    lv.ch = ch.n;
    lv.i = i + 1;
    Rails.nameStations(lv, NAMES, names);
    lv.name = lv.title || lv.nodes.filter((n) => n.t === 'S')[0].nm;
    delete lv.title;
  });
  return { levels, tried, accepted, ms: Date.now() - t0 };
}

function line(lv) {
  const order = ['id', 'ch', 'i', 'name', 'tutorial', 'shape', 'w', 'h', 'delay', 'd', 'S', 'V', 'par', 'dpar', 'merges', 'bridges', 'kinds', 'sol', 'trains', 'nodes'];
  const o = {};
  order.forEach((k) => { if (lv[k] !== undefined) o[k] = lv[k]; });
  return JSON.stringify(o);
}

const only = process.argv.slice(2).map(Number).filter(Boolean);
const summary = [];
for (const ch of CH.chapters) {
  if (only.length && only.indexOf(ch.n) < 0) continue;
  const r = chapter(ch);
  const file = path.join(ROOT, 'content', 'levels-' + String(ch.n).padStart(2, '0') + '.json');
  fs.writeFileSync(file, '[\n' + r.levels.map(line).join(',\n') + '\n]\n');
  const ds = r.levels.map((l) => l.d);
  const ss = r.levels.map((l) => l.S + '/' + l.V);
  const mean = ds.reduce((a, b) => a + b, 0) / ds.length;
  summary.push({ ch: ch.n, d: ds[0] + '…' + ds[ds.length - 1], mean: Math.round(mean * 100) / 100, tried: r.tried, accepted: r.accepted, ms: r.ms });
  console.log('Глава ' + ch.n + ' «' + ch.title + '»: d ' + ds.join(' ') + '\n  решений ' + ss.join(' ') + '\n  кандидатов ' + r.tried + ', прошли проверку ' + r.accepted + ', ' + r.ms + ' мс');
}
console.log(JSON.stringify(summary));
