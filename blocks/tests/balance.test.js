'use strict';
require('../tools/hub.js');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test, done, engine } = require(path.join(process.env.ASSI_ROOT || path.resolve(__dirname, '../../../Assi'), 'scripts/games/harness.js'));
const sim = require('../sim.js');
const Bot = require('../bot.js');
const Core = engine('core.js');
const Rng = engine('rng.js');
const Big = engine('big.js');
const game = JSON.parse(fs.readFileSync(path.join(__dirname, '../game.json'), 'utf8'));
const own = JSON.parse(fs.readFileSync(path.join(__dirname, '../config.json'), 'utf8'));
const cfg = Core.config(Core.schema(own, game), {}, null);
const baselines = [];
const samples = 10000;
const paired = 1000;
const ctx = seed => ({ config: cfg, now: 1700000000000, rng: Rng.make(seed), mult: 1 });
const mean = scores => scores.reduce((a, b) => a + b, 0) / scores.length;
const median = scores => scores.slice().sort((a, b) => a - b)[Math.floor(scores.length / 2)];
const report = {
  protocol: 'Fixed seeds 1..10000; greedy maximum-lines bot; all twenty upgrades once, no prestige or stock; three seconds per placement/tool/purchase.',
  configuration: Object.fromEntries(Object.keys(cfg).filter(key => key.startsWith('w.') || key.startsWith('deal.') || key.startsWith('event.')).map(key => [key, cfg[key]]))
};

// No tools, no mastery, no supplies, no hand rerolls outside the rules. The deterministic bot
// maximizes immediate cleared lines; ties preserve visible pieces and then prefer compactness.
test('10000 complete seed-fixed games: mean 1500–2500 and no finish before deal five', () => {
  let minimumDeal = Infinity;
  const early = [];
  let capped = 0;
  for (let seed = 1; seed <= samples; seed++) {
    const state = Core.newState(game, sim, ctx(seed));
    sim.newGame(state, cfg, 'classic', { seed });
    const result = Bot.play(sim, state, cfg, { tools: false });
    baselines.push(result.score);
    minimumDeal = Math.min(minimumDeal, result.deals);
    capped += Number(result.capped);
    if (result.deals < 5) early.push({ seed, deals: result.deals, score: result.score });
    assert.equal(result.used, 0);
    assert.equal(Core.validate(state, game), null);
    assert.equal(sim.validate(state), null);
    if (seed % 1000 === 0) console.log('  baseline ' + seed + ': mean=' + mean(baselines).toFixed(2) + ', minimum deal=' + minimumDeal);
  }
  const average = mean(baselines);
  report.baseline = { games: samples, mean: average, median: median(baselines), min: Math.min(...baselines), max: Math.max(...baselines), minimumDeal, early, capped };
  console.log('  BASELINE: ' + JSON.stringify(report.baseline));
  assert.equal(capped, 0, 'a turn cap is not a completed game');
  assert.ok(average >= 1500 && average <= 2500, 'unupgraded mean=' + average);
  assert.deepEqual(early, [], 'some deals ended too early');
});

// There is no maximum upgrade level in the specification. The reproducible comparison buys
// every one of the twenty upgrades once, with zero stock and zero prestige charges. We report
// both the same rank as baseline and master rank (special cells), without changing the sample.
test('all twenty upgrades once: paired mean improves 3–5 times; special-cell rank is reported', () => {
  const scores = [];
  const masterScores = [];
  for (let seed = 1; seed <= paired; seed++) {
    for (const rank of [1, 3]) {
      const state = Core.newState(game, sim, ctx(seed));
      state.layers.rank.count = rank - 1;
      for (const upgrade of sim.UPGRADES) state.run.up[upgrade.id] = 1;
      sim.newGame(state, cfg, 'classic', { seed });
      const result = Bot.play(sim, state, cfg, { tools: true });
      assert.equal(result.capped, false, 'upgraded game reached a turn cap; seed=' + seed);
      assert.equal(Core.validate(state, game), null);
      (rank === 1 ? scores : masterScores).push(result.score);
    }
    if (seed % 100 === 0) console.log('  upgrades ' + seed + ': mean=' + mean(scores).toFixed(2));
  }
  const base = mean(baselines.slice(0, paired));
  const ratio = mean(scores) / base;
  report.upgraded = { games: paired, baseMean: base, mean: mean(scores), median: median(scores), ratio, masterMean: mean(masterScores), masterRatio: mean(masterScores) / base };
  console.log('  UPGRADED: ' + JSON.stringify(report.upgraded));
  assert.ok(ratio >= 3 && ratio <= 5, 'same-rank upgrade ratio=' + ratio);
});

test('natural first purchase and prestige: played moves, paid upgrades and honest 3-second action clock', () => {
  const state = Core.newState(game, sim, ctx(20261114));
  const rng = Rng.make(20261114);
  const actionSec = 3;
  let actions = 0;
  let completed = 0;
  let firstBuy = null;
  let firstPrestige = null;
  const trajectory = [];
  while (completed < 32 && !firstPrestige) {
    const current = sim.newGame(state, cfg, 'classic', { rng });
    let runMoves = 0;
    while (runMoves < 10000 && !current.done) {
      // The pace player cashes out when it reaches the announced prestige target.
      if (current.score >= cfg['rank.minRecord']) break;
      const move = Bot.best(current);
      if (move) sim.place(state, cfg, move.ti, move.f, move.r, move.c);
      else if (!Bot.rescue(sim, state, cfg)) break;
      actions++;
      runMoves++;
      sim.tick(state, actionSec, ctx(0));
    }
    assert.ok(runMoves < 10000, 'pace game did not finish');
    const outcome = sim.endGame(state, cfg, 1);
    completed++;
    trajectory.push({ game: completed, score: outcome.score, moves: runMoves, coins: outcome.coins });
    while (sim.buy(state, cfg)) {
      actions++;
      if (!firstBuy) firstBuy = { game: completed, actions, seconds: actions * actionSec };
    }
    if (Core.prestigeInfo(sim, game, state, 'rank', cfg).can) {
      const reset = Core.prestige(sim, game, state, 'rank', ctx(0));
      assert.equal(reset.ok, true);
      firstPrestige = { game: completed, actions, seconds: actions * actionSec, mastery: sim.mastery(state) };
    }
    assert.equal(Core.validate(state, game), null);
  }
  report.pace = { actionSec, firstBuy, firstPrestige, trajectory };
  console.log('  PACE: ' + JSON.stringify(report.pace));
  assert.ok(firstBuy, 'no earned purchase in 32 games');
  assert.ok(firstPrestige, 'no earned prestige in 32 games');
});

test('short first session banks earned coins for the cheapest upgrade, then progresses to prestige', () => {
  const state = Core.newState(game, sim, ctx(20261114));
  const rng = Rng.make(20261114);
  const actionSec = 3;
  let actions = 0;
  let completed = 0;
  let firstBuy = null;
  let firstPrestige = null;
  const trajectory = [];
  while (completed < 32 && !firstPrestige) {
    const current = sim.newGame(state, cfg, 'classic', { rng });
    const cheapest = Math.min(...sim.UPGRADES.map(up => sim.price(state, cfg, up.id)).filter(Boolean).map(price => Big.toNumber(price)));
    let runMoves = 0;
    while (runMoves < 10000 && !current.done) {
      if (!firstBuy && Big.gte(Big.add(state.run.coins, sim.coinsFor(state, cfg, current)), cheapest)) break;
      if (current.score >= cfg['rank.minRecord']) break;
      const move = Bot.best(current);
      if (move) sim.place(state, cfg, move.ti, move.f, move.r, move.c);
      else if (!Bot.rescue(sim, state, cfg)) break;
      actions++;
      runMoves++;
      sim.tick(state, actionSec, ctx(0));
    }
    assert.ok(runMoves < 10000, 'short-session game did not finish');
    const outcome = sim.endGame(state, cfg, 1);
    completed++;
    trajectory.push({ game: completed, score: outcome.score, moves: runMoves, coins: outcome.coins });
    while (sim.buy(state, cfg)) {
      actions++;
      if (!firstBuy) firstBuy = { game: completed, actions, seconds: actions * actionSec };
    }
    if (Core.prestigeInfo(sim, game, state, 'rank', cfg).can) {
      const reset = Core.prestige(sim, game, state, 'rank', ctx(0));
      assert.equal(reset.ok, true);
      firstPrestige = { game: completed, actions, seconds: actions * actionSec, mastery: sim.mastery(state) };
    }
    assert.equal(Core.validate(state, game), null);
  }
  report.shortSessions = { policy: 'Bank the first game once earned coins cover the cheapest upgrade; later bank at natural end or prestige threshold.', actionSec, firstBuy, firstPrestige, trajectory };
  console.log('  SHORT SESSIONS: ' + JSON.stringify(report.shortSessions));
  assert.ok(firstBuy, 'no earned purchase in 32 games');
  assert.ok(firstPrestige, 'no earned prestige in 32 games');
});

done('Блоки: баланс и естественный темп').then(result => {
  report.tests = result;
  report.sources = {};
  for (const file of ['board.js', 'sim.js', 'bot.js', 'config.json', 'tests/balance.test.js']) {
    report.sources[file] = require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(__dirname, '..', file))).digest('hex');
  }
  fs.writeFileSync(path.join(__dirname, '../tools/balance-report.json'), JSON.stringify(report, null, 2) + '\n');
});
