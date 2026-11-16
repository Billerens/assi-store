// The shared setup of the tests of «Подземка»: a temporary workspace of Assi (the engine as the
// phone has it) with this game copied in as modules/games/subway, and the pace bot.
'use strict';
const fs = require('fs');
const path = require('path');
const harness = require(path.join(process.env.ASSI_ROOT || path.resolve(__dirname, '../../../Assi'), 'scripts/games/harness.js'));

const GAME = path.resolve(__dirname, '..');

function setup() {
  const env = harness.workspace({ fixture: false });
  process.on('exit', () => env.close());
  fs.cpSync(GAME, path.join(env.root, 'modules', 'games', 'subway'), {
    recursive: true,
    filter: (p) => !/[\\/](tests|README\.md)$/.test(p)
  });
  const x = harness.gameOf(env, 'subway');
  return Object.assign({ env: env }, x);
}

function ctxOf(cfg, rng, now, offline) {
  return { now: now, config: cfg, rng: rng, mult: 1, links: {}, stock: {}, offline: !!offline, capBonusHours: 0 };
}

/**
 * The greedy bot of «Темп» (active play, two taps a second in the first five minutes) for `minutes`;
 * marks: minutes to report. Returns {rows: {min: {lines, income, oi}}, hintMin, state}.
 */
function pace(x, minutes, marks, setupState) {
  const { Core, Big, Rng, sim, game } = x;
  const cfg = x.cfg;
  const rng = Rng.make(7);
  let now = Date.UTC(2026, 10, 2, 12, 0, 0);
  const state = Core.newState(game, sim, ctxOf(cfg, rng, now));
  if (setupState) setupState(state);
  const rows = {};
  let hintMin = null;
  for (let s = 0; s < minutes * 60; s++) {
    sim.botStep(state, cfg, now, s < cfg['bot.tapSec'] ? cfg['bot.taps'] : 0, 1);
    now += 1000;
    sim.tick(state, 1, ctxOf(cfg, rng, now));
    if (hintMin === null && sim.moveHint(state, cfg)) hintMin = (s + 1) / 60;
    const min = (s + 1) / 60;
    if (marks.indexOf(min) >= 0) {
      rows[min] = { lines: state.run.lines.length, income: Big.toNumber(sim.income(state, cfg, now, true)), oi: Big.toNumber(sim.cityGain(state, cfg)) };
    }
  }
  return { rows: rows, hintMin: hintMin, state: state };
}

/**
 * Days of two 25-minute trips with offline between (9 h and 15 h − 50 min, as the engine's bot):
 * the bot moves to a new city at the game's mark «выгодно», takes the Бюро and the patents in
 * order. Returns {moves: [{trip, playMin, city, gain}], days: [{city, oi, patents}], state}.
 */
function trips(x, days) {
  const { Core, Big, Rng, sim, game } = x;
  const cfg = x.cfg;
  const HOUR = 3600000;
  const rng = Rng.make(12345);
  let now = Date.UTC(2026, 10, 2, 5, 0, 0);
  const state = Core.newState(game, sim, ctxOf(cfg, rng, now));
  const gaps = [9 * HOUR, 15 * HOUR - 50 * 60000];
  const moves = [];
  const out = [];
  let trip = 0;
  let played = 0;
  for (let d = 0; d < days; d++) {
    for (let k = 0; k < 2; k++) {
      trip++;
      for (let s = 0; s < 25 * 60; s++) {
        sim.botStep(state, cfg, now, played < cfg['bot.tapSec'] ? cfg['bot.taps'] : 0, 1);
        now += 1000;
        played++;
        sim.tick(state, 1, ctxOf(cfg, rng, now));
        if (s % 30 !== 29) continue;
        sim.botMeta(state, cfg);
        const gi = Core.prestigeInfo(sim, game, state, 'general', cfg);
        if (gi.can && gi.hint) {
          const r = Core.prestige(sim, game, state, 'general', ctxOf(cfg, rng, now));
          moves.push({ trip: trip, playMin: played / 60, layer: 'general', gain: Big.str(r.gain) });
        } else if (sim.moveHint(state, cfg)) {
          const r = Core.prestige(sim, game, state, 'city', ctxOf(cfg, rng, now));
          moves.push({ trip: trip, playMin: played / 60, layer: 'city', city: state.layers.city.state.city, gain: Big.str(r.gain) });
        }
      }
      state.lastTick = now;
      const p = Core.plan(now, now + gaps[k], cfg, sim.capBonusHours(state));
      now = p.to;
      Core.runOffline(sim, state, game, p, null, (seg) => ctxOf(cfg, rng, seg.to, true), cfg);
      state.lastTick = now;
    }
    out.push({ day: d + 1, city: state.layers.city.state.city, oi: Big.str(state.layers.city.currency), patents: Big.str(state.layers.general.currency), generals: state.layers.general.count || 0 });
  }
  return { moves: moves, days: out, state: state };
}

module.exports = { setup, pace, trips, ctxOf, harness, GAME };
