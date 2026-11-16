'use strict';
require('../tools/hub.js');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test, done, engine } = require(path.join(process.env.ASSI_ROOT || path.resolve(__dirname, '../../../Assi'), 'scripts/games/harness.js'));
const sim = require('../sim.js');
const B = require('../board.js');
const Bot = require('../bot.js');
const Core = engine('core.js');
const Big = engine('big.js');
const Rng = engine('rng.js');
const game = JSON.parse(fs.readFileSync(path.join(__dirname, '../game.json'), 'utf8'));
const cfg = Core.config(Core.schema(JSON.parse(fs.readFileSync(path.join(__dirname, '../config.json'), 'utf8')), game), {}, null);
const ctx = (seed = 1) => ({ now: 1700000000000, config: cfg, rng: Rng.make(seed), mult: 1 });
const fresh = () => Core.newState(game, sim, ctx());
const copy = x => JSON.parse(JSON.stringify(x));

test('rows and columns burn together; crossing cell counted once', () => {
  const cells = B.empty(8);
  for (let i = 0; i < 8; i++) { cells[i] = 1; cells[i * 8] = 1; }
  const burnt = B.burn(cells);
  assert.equal(burnt.lines, 2);
  assert.equal(burnt.cells, 15);
  assert.equal(B.filled(cells), 0);
});

test('specials: cracked survives one line; crossing hits twice; adjacent lock unlocks', () => {
  const cells = B.empty(8);
  for (let i = 0; i < 8; i++) cells[i] = 1;
  cells[0] = B.make(1, B.CRACKED);
  cells[1] = B.make(1, B.GOLD);
  cells[8] = B.LOCK_CELL;
  const report = B.burn(cells);
  assert.equal(report.gold, 1);
  assert.equal(cells[0], 1);
  assert.equal(cells[8], 0);
  for (let i = 0; i < 8; i++) { cells[i] = 1; cells[i * 8] = 1; }
  cells[0] = B.make(1, B.CRACKED);
  assert.equal(B.burn(cells).cells, 15);
});

test('piece catalogue and four rotations conserve cells and specials', () => {
  assert.equal(B.TYPES.length, 14);
  for (const t of B.TYPES) for (let i = 0; i < t.shapes.length; i++) {
    const p = B.piece(t, i);
    p.s = p.c.map((_, j) => j % 3);
    let r = p;
    for (let turn = 0; turn < 4; turn++) r = B.rotatePiece(r);
    assert.deepEqual(r, p);
    if (p.c.length > 1) {
      const parts = B.cut(p);
      assert.ok(parts);
      assert.equal(parts[0].c.length + parts[1].c.length, p.c.length);
      assert.ok(parts.every(x => B.connected(x.c)));
    }
  }
});

test('scoring table, placement and whole-deal streak', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6].map(n => B.linePoints(n, cfg)), [0, 10, 30, 60, 100, 150, 200]);
  const state = fresh();
  const g = sim.newGame(state, cfg, 'classic', { seed: 7 });
  g.tray = [B.piece('dot', 0), B.piece('dot', 0)];
  for (let i = 0; i < 7; i++) g.b[0][i] = 1;
  assert.equal(sim.place(state, cfg, 0, 0, 0, 7).points, 11);
  assert.equal(g.streak, 0);
  sim.place(state, cfg, 1, 0, 7, 7);
  assert.equal(g.streak, 1);
  assert.equal(sim.streakMult(state, cfg, 1), 1.5);
  assert.equal(sim.streakMult(state, cfg, 100), 4);
});

test('invalid actions cannot mutate or spend a charge', () => {
  const state = fresh();
  state.run.up.eraser = 1;
  const g = sim.newGame(state, cfg, 'classic', { seed: 8 });
  g.b[0][7] = 1;
  const before = copy(state);
  assert.equal(sim.place(state, cfg, 0, 0, -1, 0).ok, false);
  assert.equal(sim.useTool(state, cfg, 'eraser', { r: 1, c: -1 }).ok, false);
  assert.equal(sim.buyUpgrade(state, cfg, 'invented'), false);
  assert.deepEqual(copy(state), before);
});

test('upgrade charges consumed before supplies; both survive save, charges refill', () => {
  const state = fresh();
  state.run.up.bomb = 1;
  sim.mine(state).supply.bomb = 2;
  const g = sim.newGame(state, cfg, 'classic', { seed: 9 });
  g.b[0][9] = 1;
  assert.equal(sim.useTool(state, cfg, 'bomb', { r: 1, c: 1 }).from, 'charge');
  g.b[0][9] = 1;
  assert.equal(sim.useTool(state, cfg, 'bomb', { r: 1, c: 1 }).from, 'supply');
  assert.equal(sim.mine(state).supply.bomb, 1);
  sim.endGame(state, cfg, 1);
  assert.equal(sim.newGame(state, cfg, 'classic', { seed: 10 }).ch.bomb, 1);
  assert.equal(sim.mine(state).supply.bomb, 1);
});

test('all eight tools, reserve and invalid cutter', () => {
  const state = fresh();
  for (const t of sim.TOOLS) state.run.up[t] = 3;
  state.run.up.slot = 1;
  const g = sim.newGame(state, cfg, 'classic', { seed: 11 });
  g.tray = [B.piece('line3', 0), B.piece('dot', 0), B.piece('sq2', 0)];
  assert.equal(sim.useTool(state, cfg, 'rotate', { ti: 0 }).ok, true);
  assert.equal(B.bounds(g.tray[0].c).h, 3);
  assert.equal(sim.useTool(state, cfg, 'cutter', { ti: 1 }).ok, false);
  assert.equal(sim.useTool(state, cfg, 'cutter', { ti: 0 }).ok, true);
  assert.equal(g.tray.length, 4);
  assert.equal(sim.hold(state, cfg, 2), true);
  assert.equal(g.hold.t, 'sq2');
  for (const tool of ['bomb', 'eraser', 'hammer', 'ruler']) {
    g.b[0][27] = 1;
    assert.equal(sim.useTool(state, cfg, tool, { f: 0, r: 3, c: 3 }).ok, true);
    assert.equal(g.b[0][27], 0);
  }
  const previous = copy(g.tray);
  assert.equal(sim.useTool(state, cfg, 'reroll').ok, true);
  assert.equal(g.tray.length, 3);
  assert.equal(sim.useTool(state, cfg, 'undo').ok, true);
  assert.deepEqual(g.tray, previous);
  assert.equal(g.ch.undo, 2);
});

test('save in mid-game resumes the exact board, tray, combo, charges and RNG', () => {
  const state = fresh();
  state.run.up.bomb = 2;
  state.run.up.preview = 1;
  const g = sim.newGame(state, cfg, 'classic', { seed: 12 });
  for (let i = 0; i < 13; i++) {
    const move = Bot.best(g);
    assert.ok(move);
    sim.place(state, cfg, move.ti, move.f, move.r, move.c);
  }
  const saved = copy(state);
  assert.equal(Core.validate(saved, game), null);
  assert.equal(sim.validate(saved), null);
  assert.deepEqual(Bot.play(sim, state, cfg), Bot.play(sim, saved, cfg));
  assert.deepEqual(copy(state), copy(saved));
});

test('workshop 12-hour formula agrees exactly with 43200 one-second ticks; no passive coins', () => {
  const one = fresh();
  one.run.up.workshop = 1;
  one.run.ws = 3600;
  const steps = copy(one);
  const report = sim.offline(one, 43200, ctx());
  for (let i = 0; i < 43200; i++) sim.tick(steps, 1, ctx());
  assert.deepEqual(copy(one), copy(steps));
  assert.equal(sim.supplyCount(one), cfg['up.workshop.cap']);
  assert.equal(Big.toNumber(one.run.coins), 0);
  assert.match(report.events[0], /Мастерская сделала:/);
  assert.equal(sim.next(one, ctx().now, cfg).length, 0);
});

test('without workshop offline does not change active game or give coins', () => {
  const state = fresh();
  sim.newGame(state, cfg, 'classic', { seed: 13 });
  const before = copy(state);
  sim.offline(state, 43200, ctx());
  assert.deepEqual(copy(state), before);
});

test('mastery formula, reset boundaries, chosen permanent charges and rank modes', () => {
  const state = fresh();
  state.run.best = 4999;
  assert.equal(Big.toNumber(sim.prestigeGain(state, 'rank', cfg)), 0);
  state.run.best = 5000;
  state.run.coins = 1234;
  state.run.up.bomb = 4;
  const m = sim.mine(state);
  m.records.classic = 5000;
  m.chal.done[1] = 1;
  m.theme = 'slate';
  m.supply.bomb = 2;
  assert.equal(Core.prestige(sim, game, state, 'rank', ctx()).ok, true);
  assert.equal(sim.mastery(state), 3);
  assert.equal(sim.rank(state), 2);
  assert.equal(Big.toNumber(state.run.coins), 0);
  assert.deepEqual(state.run.up, {});
  assert.equal(sim.mine(state).records.classic, 5000);
  assert.equal(sim.mine(state).chal.done[1], 1);
  assert.equal(sim.mine(state).supply.bomb, 2);
  assert.throws(() => sim.newGame(state, cfg, 'big', { seed: 1 }));
  state.layers.rank.currency = 10;
  assert.equal(sim.picksFree(state, cfg), 2);
  assert.equal(sim.pick(state, cfg, 'bomb'), true);
  assert.equal(sim.newGame(state, cfg, 'classic', { seed: 1 }).ch.bomb, 1);
  state.layers.rank.count = 4;
  assert.equal(sim.newGame(state, cfg, 'twin', { seed: 1 }).b.length, 2);
});

test('daily board and queue are common for the date regardless of account upgrades', () => {
  const a = fresh();
  const b = fresh();
  b.layers.rank.count = 4;
  b.run.up.lucky = 9;
  b.run.up.preview = 1;
  b.run.up.clean = 1;
  const ga = sim.newGame(a, cfg, 'daily', { day: '2026-11-14', seed: 1 });
  const gb = sim.newGame(b, cfg, 'daily', { day: '2026-11-14', seed: 999 });
  assert.deepEqual(ga.b, gb.b);
  assert.deepEqual(ga.tray, gb.tray);
  assert.deepEqual(ga.next, gb.next);
  assert.equal(ga.target, gb.target);
  assert.equal(ga.streak, 0);
  assert.equal(gb.streak, 1);
  assert.equal(ga.deals, 20);
  assert.notDeepEqual(ga.b, sim.newGame(fresh(), cfg, 'daily', { day: '2026-11-15' }).b);
});

test('coin floor, mint, mastery, passenger double and chest three supplies', () => {
  const state = fresh();
  state.run.up.mint = 2;
  state.layers.rank.currency = 10;
  const g = sim.newGame(state, cfg, 'classic', { seed: 14 });
  g.score = 109;
  g.gold = 5;
  const expected = Math.floor(Math.floor(15 * 1.2 * 1.5) * 2);
  assert.equal(sim.endGame(state, cfg, 2).coins, expected);
  sim.chest(state, Rng.make(5), cfg);
  assert.equal(sim.supplyCount(state), 3);
  const fractional = fresh();
  fractional.run.up.mint = 1;
  sim.newGame(fractional, cfg, 'classic', { seed: 14 }).score = 190;
  assert.equal(sim.endGame(fractional, cfg, 1.5).coins, 31);
});

test('single-use tools can be bought; gold is paid for tool clears and undo reverses gold', () => {
  const state = fresh();
  state.run.coins = 1000;
  assert.equal(sim.buySupply(state, cfg, 'eraser'), true);
  assert.ok(Math.abs(Big.toNumber(state.run.coins) - 970) < 1e-10);
  assert.equal(sim.mine(state).supply.eraser, 1);
  state.run.up.undo = 1;
  const g = sim.newGame(state, cfg, 'classic', { seed: 1 });
  g.b[0][0] = B.make(1, B.GOLD);
  assert.equal(sim.useTool(state, cfg, 'eraser', { r: 0, c: 0 }).gold, 1);
  assert.equal(g.gold, 5);
  assert.equal(sim.useTool(state, cfg, 'undo').ok, true);
  assert.equal(g.gold, 0);
  assert.equal(g.b[0][0], B.make(1, B.GOLD));
  assert.equal(sim.mine(state).supply.eraser || 0, 0);
});

test('preview carries the upcoming event and cannot be replaced by a later event roll', () => {
  const local = { ...cfg, 'event.fromDeal': 0, 'event.heavy': 1, 'event.gold': 0, 'event.gift': 0 };
  const state = fresh();
  state.run.up.preview = 1;
  const g = sim.newGame(state, local, 'classic', { seed: 18 });
  const expected = copy(g.next);
  assert.equal(g.nextEv, 'heavy');
  assert.ok(expected.every(p => p.c.length >= local['deal.bigFrom']));
  g.b = [B.empty(8)];
  g.tray = [B.piece('dot', 0)];
  sim.place(state, local, 0, 0, 0, 0);
  assert.deepEqual(g.tray, expected);
  assert.equal(g.ev, 'heavy');
});

test('undo cannot repeatedly claim a gift at the same deal boundary', () => {
  const local = { ...cfg, 'event.fromDeal': 0, 'event.heavy': 0, 'event.gold': 0, 'event.gift': 1 };
  const state = fresh();
  state.run.up.undo = 1;
  const g = sim.newGame(state, local, 'classic', { seed: 19 });
  g.tray = [B.piece('dot', 0)];
  sim.place(state, local, 0, 0, 0, 0);
  const amount = sim.mine(state).supply.bomb;
  assert.equal(sim.useTool(state, local, 'undo').ok, true);
  sim.place(state, local, 0, 0, 0, 0);
  assert.equal(sim.mine(state).supply.bomb, amount);
});

test('corrupt game values and duplicate piece cells are rejected', () => {
  const state = fresh();
  const g = sim.newGame(state, cfg, 'classic', { seed: 20 });
  g.score = NaN;
  assert.ok(sim.validate(state));
  g.score = 0;
  g.tray[0].c = [[0, 0], [0, 0]];
  assert.ok(sim.validate(state));
});

test('fresh game grants each tool, and achieved scores mark the correct badges', () => {
  const state = fresh();
  const g = sim.newGame(state, cfg, 'classic', { fresh: true, seed: 15 });
  for (const t of sim.TOOLS) assert.equal(g.ch[t], cfg['fresh.charges']);
  assert.equal(sim.has(state, 'slot'), true);
  g.score = 10000;
  const end = sim.endGame(state, cfg, 1);
  assert.ok(end.ach.includes('record-10k'));
  assert.ok(end.ach.includes('no-tools'));
});

test('challenge reward requires a solved board and is paid only once; free undo', () => {
  const state = fresh();
  assert.equal(sim.winChallenge(state, cfg, 1), 0);
  const board = B.empty(4);
  board[0] = 1; board[1] = 1; board[2] = 1;
  const g = sim.newGame(state, cfg, 'challenge', { index: 1, seed: 1, level: { n: 4, board, queue: [B.piece('dot', 0)] } });
  assert.equal(sim.place(state, cfg, 0, 0, 0, 3).won, true);
  assert.equal(sim.back(state), true);
  assert.equal(g.done, false);
  assert.equal(sim.place(state, cfg, 0, 0, 0, 3).won, true);
  assert.equal(sim.winChallenge(state, cfg, 1), cfg['challenge.reward']);
  assert.equal(sim.winChallenge(state, cfg, 1), 0);
  assert.equal(sim.challengeOpen(state, 60), 2);
});

test('help runs at high occupancy; large weights grow exactly as specified', () => {
  const board = B.empty(8);
  for (let i = 0; i < 48; i++) board[i] = 1;
  const d = B.deal(Rng.make(16), cfg, [board], { score: 0, rank: 1 });
  assert.equal(d.helped, true);
  assert.ok(d.pieces.some(p => B.anyFit(board, p)));
  const p = B.type('sq3');
  assert.equal(B.weight(p, cfg, 0), cfg['w.sq3']);
  assert.equal(B.weight(p, cfg, 3000), cfg['w.sq3'] * 2);
  assert.equal(B.weight(p, cfg, 30000), cfg['w.sq3'] * 2);
});

test('opening fairness rejects an impossible triple even when each piece fits by itself', () => {
  // Reproduced from seed 295, deal three: the original one-of-three check accepted this hand.
  const fixture = require('./fixtures/early-hand-counterexample.json');
  const blockedHand = fixture.history.find(g => g.deal === 3);
  const board = blockedHand.b[0];
  const hand = blockedHand.tray;
  assert.ok(hand.every(p => B.anyFit(board, p)));
  assert.equal(B.handFits([board], hand, cfg['deal.openingBudget']), false);
  const before = board.slice();
  let draws = 0;
  const rng = { weighted: () => B.type(draws++ < 3 ? 'sq3' : 'dot'), int: () => 0, chance: () => false };
  const safe = B.deal(rng, { ...cfg, 'deal.openingMaxCells': 9 }, [board], { rank: 1, score: 0, opening: true });
  assert.equal(safe.tries, 1);
  assert.equal(safe.fair, true);
  assert.ok(B.handFits([board], safe.pieces, cfg['deal.openingBudget']));
  assert.deepEqual(board, before);
  assert.equal(B.handFits([B.empty(6), B.empty(6)], hand, cfg['deal.openingBudget']), true);
});

test('opening size limit applies to exactly four hands, including the preview boundary', () => {
  const local = { ...cfg };
  for (const t of B.TYPES) local['w.' + t.id] = 0;
  local['w.sq3'] = 1;
  const state = fresh();
  state.run.up.preview = 1;
  const g = sim.newGame(state, local, 'classic', { seed: 23 });
  while (g.deal < local['deal.openingDeals']) {
    assert.ok(g.tray.filter(Boolean).every(p => p.c.length <= local['deal.openingMaxCells']));
    const move = Bot.best(g);
    assert.ok(move);
    sim.place(state, local, move.ti, move.f, move.r, move.c);
  }
  assert.ok(g.tray.every(p => p.c.length <= local['deal.openingMaxCells']));
  assert.ok(g.next.every(p => p.t === 'sq3'));
});

test('lucky draws one Bernoulli per ordinary hand and never changes a heavy hand', () => {
  const probabilities = [];
  const rng = {
    weighted: list => list.find(t => t.id === 'line5'),
    int: n => n === 3 ? 1 : 0,
    chance: probability => { probabilities.push(probability); return true; }
  };
  const hand = B.draw(rng, cfg, { score: 0, rank: 1, dot: 0.03 });
  assert.deepEqual(probabilities, [0.03]);
  assert.equal(hand.filter(p => p.t === 'dot').length, 1);
  assert.equal(hand[1].t, 'dot');
  probabilities.length = 0;
  const heavy = B.draw(rng, cfg, { score: 0, rank: 1, dot: 0.9, heavy: true });
  assert.deepEqual(probabilities, []);
  assert.ok(heavy.every(p => p.c.length >= cfg['deal.bigFrom']));
});

test('event.fromDeal five starts on the fifth hand, with and without preview', () => {
  const local = { ...cfg, 'event.fromDeal': 5, 'event.heavy': 1, 'event.gold': 0, 'event.gift': 0 };
  for (const preview of [0, 1]) {
    const state = fresh();
    state.run.up.preview = preview;
    const g = sim.newGame(state, local, 'classic', { seed: 24 });
    let turns = 0;
    while (g.deal < 5 && turns++ < 20) {
      assert.equal(g.ev, null);
      if (preview && g.deal === 4) assert.equal(g.nextEv, 'heavy');
      const move = Bot.best(g);
      assert.ok(move);
      sim.place(state, local, move.ti, move.f, move.r, move.c);
    }
    assert.equal(g.deal, 5);
    assert.equal(g.ev, 'heavy');
    assert.ok(g.tray.every(p => p.c.length >= local['deal.bigFrom']));
  }
});

test('all weights may be disabled without an undefined piece or random crash', () => {
  const local = { ...cfg };
  for (const t of B.TYPES) local['w.' + t.id] = 0;
  const state = fresh();
  const g = sim.newGame(state, local, 'classic', { seed: 21 });
  assert.ok(g.tray.every(p => p && p.c.length));
  const occupied = B.empty(8);
  for (let i = 0; i < 48; i++) occupied[i] = 1;
  assert.equal(B.deal(Rng.make(21), local, [occupied], { rank: 1, score: 0 }).helped, true);
  const heavy = B.deal(Rng.make(21), local, [B.empty(8)], { rank: 1, score: 0, heavy: true });
  assert.ok(heavy.pieces.every(p => p.c.length >= local['deal.bigFrom']));
});

done('Блоки: правила, экономика, сохранение и офлайн');
