// The bot of «Шахта вглубь» for the checks (checks.js on the phone, tests/ in node): days of two
// trips by seconds, the nights and days between them by the engine's offline count. Its play is
// the rule of «Темп» (sim.play). A new well when the engine says «выгодно» and the well is spent:
// the drill stays slower than bot.prestigeSpeed for bot.slowChecks checks in a row (30 s each);
// the first well also lasts at least bot.firstWellMin minutes of play, as the spec times it
// (60–90 minutes): offline nights drill on, so «spent» alone would come a trip early.
// Engine side: strict ES5 (Rhino).
var Big = require('../engine/big.js');
var Rng = require('../engine/rng.js');
var Core = require('../engine/core.js');

var HOUR = 3600000;
var MIN = 60000;

function ctxOf(cfg, rng, now) {
  return { now: now, config: cfg, rng: rng, mult: 1, links: {}, stock: {}, offline: false, capBonusHours: 0 };
}

/**
 * o: {days: 3, tripMin: 25, gaps: [ms, ms], core: Керн at the start, slowChecks: 10, prestige: true,
 *     step: seconds a bot move (1; the phone's check takes 10 — the drill is integrated exactly, so
 *     a coarser step changes only how often the bot buys), offlineStep: seconds of an offline step
 *     (config's offline.stepSec; the phone's check takes 300)}.
 * Returns {firstBuySec, prestiges: [{trip, gain, activeMin, depth}], depthAt: {trip: depth at its end}, state}.
 */
function trips(game, sim, cfg, o) {
  o = o || {};
  var days = o.days || 3;
  var tripMin = o.tripMin || 25;
  var gaps = o.gaps || [9 * HOUR, 15 * HOUR - 2 * tripMin * MIN];
  var slowChecks = o.slowChecks || cfg['bot.slowChecks'];
  var firstMin = o.firstWellMin === undefined ? cfg['bot.firstWellMin'] : o.firstWellMin;
  var rng = Rng.make(o.seed || 12345);
  var now = Date.UTC(2026, 10, 2, 5, 0, 0);
  var state = Core.newState(game, sim, ctxOf(cfg, rng, now));
  if (o.core) state.layers.core.currency = String(o.core);
  var firstBuySec = null;
  var prestiges = [];
  var ends = [];
  var trip = 0;
  var active = 0;
  var inWell = 0;
  var slow = 0;
  var step = o.step || 1;
  var ocfg = cfg;
  if (o.offlineStep) {
    ocfg = {};
    for (var key in cfg) ocfg[key] = cfg[key];
    ocfg['offline.stepSec'] = o.offlineStep;
  }
  for (var d = 0; d < days; d++) {
    for (var k = 0; k < 2; k++) {
      trip++;
      for (var s = 0; s < tripMin * 60; s += step) {
        var bought = sim.play(state, ctxOf(cfg, rng, now), 3);
        sim.tick(state, step, ctxOf(cfg, rng, now + step * 1000));
        now += step * 1000;
        active += step;
        inWell += step;
        if (firstBuySec === null && trip === 1 && bought) firstBuySec = s + step;
        if (Math.floor((s + step) / 30) > Math.floor(s / 30) && o.prestige !== false) {
          slow = sim.speed(state, cfg, 1, now) < cfg['bot.prestigeSpeed'] ? slow + 1 : 0;
          var info = Core.prestigeInfo(sim, game, state, 'core', cfg);
          var old = prestiges.length || inWell >= firstMin * 60;
          if (info.can && info.hint && old && slow >= slowChecks) {
            var depth = state.run.depth;
            var r = Core.prestige(sim, game, state, 'core', ctxOf(cfg, rng, now));
            if (r.ok) {
              prestiges.push({ trip: trip, gain: Big.str(r.gain), activeMin: Math.round(active / 6) / 10, depth: Math.round(depth) });
              sim.playWorkshop(state, cfg);
            }
            slow = 0;
            inWell = 0;
          }
        }
      }
      ends.push(Math.round(state.run.depth));
      state.lastTick = now;
      var p = Core.plan(now, now + gaps[k % gaps.length], cfg, sim.capBonusHours(state));
      now = p.to;
      Core.runOffline(sim, state, game, p, null, function (seg) { return ctxOf(cfg, rng, seg.to); }, ocfg);
      state.lastTick = now;
    }
  }
  return { firstBuySec: firstBuySec, prestiges: prestiges, ends: ends, trips: trip, state: state };
}

/** Plays `minutes` online by seconds from a fresh well (with `core` Керн): depth by minute marks. */
function well(game, sim, cfg, minutes, core, marks) {
  var rng = Rng.make(7);
  var now = Date.UTC(2026, 10, 2, 5, 0, 0);
  var state = Core.newState(game, sim, ctxOf(cfg, rng, now));
  if (core) state.layers.core.currency = String(core);
  var out = { at: {}, firstBuySec: null, thousandMin: null, slowMin: null, state: state };
  for (var s = 0; s < minutes * 60; s++) {
    var b = sim.play(state, ctxOf(cfg, rng, now), 3);
    sim.tick(state, 1, ctxOf(cfg, rng, now + 1000));
    now += 1000;
    if (out.firstBuySec === null && b) out.firstBuySec = s + 1;
    if (out.thousandMin === null && state.run.depth >= 1000) out.thousandMin = (s + 1) / 60;
    if (out.slowMin === null && state.run.depth >= 1000 && s % 60 === 59) {
      // Slow: the speed of the last 10 minutes on average is below the mark.
      if (!out.last) out.last = [];
      out.last.push(state.run.depth);
      var n = out.last.length;
      if (n > 10 && (out.last[n - 1] - out.last[n - 11]) / 600 < cfg['bot.prestigeSpeed']) out.slowMin = (s + 1) / 60;
    }
    if (marks && marks.indexOf((s + 1) / 60) >= 0) out.at[(s + 1) / 60] = Math.round(state.run.depth);
  }
  out.now = now;
  return out;
}

exports.trips = trips;
exports.well = well;
exports.ctxOf = ctxOf;
