// The solver: hand-made deals it must clear or must call unclearable, its answer checked by
// replaying the line it finds, and what the generator gives per table size.
// node tests/solver.test.js
'use strict';
const assert = require('assert');
const E = require('./env.js');
const { sim, cfg, Rng, Core, game } = E.setup();

let id = 1;
const c = (r, open, extra) => Object.assign({ i: id++, r, s: id % 4, u: open ? 1 : 0 }, extra || {});
const plain = () => sim.mods({ deck: 'normal', relics: [], custom: [], night: 0, mode: 'run' }, cfg, [], null);

E.test('решаемые столы', () => {
  const m = plain();
  assert.strictEqual(sim.solve([[c(7), c(6, true)], [c(5, true)]], [], c(4, true), m, cfg, 5000).ok, true);
  // Needs the deck in the right moment: 9 is cleared only after the 8 from the deck.
  assert.strictEqual(sim.solve([[c(9, true)], [c(3, true)]], [c(8), c(2)], c(4, true), m, cfg, 5000).ok, true);
  // Order matters: taking 5 first strands 7; taking 3 then 4? the solver must find 5-6-7 then the deck.
  assert.strictEqual(sim.solve([[c(7, false), c(6, true)], [c(5, true)], [c(2, true)]], [c(1), c(3)], c(4, true), m, cfg, 5000).ok, true);
});

E.test('нерешаемые столы', () => {
  const m = plain();
  assert.strictEqual(sim.solve([[c(9, true)]], [], c(4, true), m, cfg, 5000).ok, false);
  // A king with no queen anywhere and no wrap.
  assert.strictEqual(sim.solve([[c(13, true)], [c(5, true)]], [c(4), c(6)], c(5, true), m, cfg, 5000).ok, false);
  // The moon makes the same king clearable from an ace.
  const moon = sim.mods({ deck: 'normal', relics: ['moon'], custom: [], night: 0, mode: 'run' }, cfg, [], null);
  assert.strictEqual(sim.solve([[c(13, true)]], [], c(1, true), moon, cfg, 5000).ok, true);
});

E.test('камень уходит, когда пуст соседний столбец; замок ждёт цепочку', () => {
  const m = plain();
  const stone = c(0, true, { c: 'stone', s: -1 });
  assert.strictEqual(sim.solve([[stone], [c(5, true)]], [], c(4, true), m, cfg, 5000).ok, true);
  const lock = c(9, true, { c: 'lock' });
  // The chain can never reach the lock's number here: 5 then the 9 would be the second card.
  assert.strictEqual(sim.solve([[lock], [c(8, true)]], [], c(7, true), m, cfg, 5000).ok, cfg['curse.lock.chain'] <= 2);
});

E.test('генератор: доля решаемых раздач по размерам стола (бюджет решателя)', () => {
  const run = { deck: 'normal', relics: [], custom: [], night: 0, mode: 'run', cards: [], nextId: 1 };
  for (let s = 0; s < 4; s++) for (let r = 1; r <= 13; r++) run.cards.push({ i: run.nextId++, r, s });
  const m = sim.mods(run, cfg, [], null);
  for (const [cols, rows] of [[6, 4], [6, 5], [7, 5]]) {
    let ok = 0, bad = 0, nul = 0, nodes = 0;
    const N = 120;
    const t0 = Date.now();
    for (let k = 0; k < N; k++) {
      const made = sim.layout(run, cfg, Rng.make(500 + k), m, { cols, rows });
      const v = sim.solve(made.cols, made.deck, made.pile[0], m, cfg, cfg['solver.nodes']);
      nodes += v.nodes;
      if (v.ok === true) ok++; else if (v.ok === false) bad++; else nul++;
    }
    const ms = (Date.now() - t0) / N;
    console.log('  ' + cols + '×' + rows + ': решаемых ' + Math.round(100 * ok / N) + '%, нерешаемых ' + Math.round(100 * bad / N) + '%, бюджет кончился ' + Math.round(100 * nul / N) + '%, узлов в среднем ' + Math.round(nodes / N) + ', ' + ms.toFixed(1) + ' мс');
    // With solver.tries layouts a deal, even 8% proven gives a proven-solvable deal 92% of the time.
    assert.ok(ok / N >= 0.08, 'решаемых слишком мало: ' + ok + ' из ' + N);
    assert.ok(ms < 200, 'решатель медленный: ' + ms + ' мс');
  }
});

E.test('раздача забега: из ' + cfg['solver.tries'] + ' попыток находится решаемая', () => {
  let solvable = 0;
  const N = 30;
  for (let k = 0; k < N; k++) {
    const st = Core.newState(game, sim, { now: 0, config: cfg, rng: Rng.make(k) });
    sim.newRun(st, cfg, { seed: 900 + k, deck: 'normal', night: 0 });
    if (st.run.deal.solvable === true) solvable++;
  }
  console.log('  первая раздача решаема: ' + solvable + ' из ' + N);
  assert.ok(solvable >= N * 0.9);
});

E.done('solver ' + E.ID);
