// The bot of «Колония на астероиде» for the checks (checks.js on the phone, tests/ in node). Its
// play is sim.play: research by a fixed order, energy, the chain, icebreakers by need, drones by
// ore a second per ore. colony() plays one colony online by seconds and notes the marks of
// «Как проверить» (tiers by minute, the engine); trips() plays days of two trips with the nights
// and days offline and jumps when the engine is built, buying the meta after each jump.
// Engine side: strict ES5 (Rhino).
var Big = require('../engine/big.js');
var Rng = require('../engine/rng.js');
var Core = require('../engine/core.js');

var HOUR = 3600000;
var MIN = 60000;

function ctxOf(cfg, rng, now) {
  return { now: now, config: cfg, rng: rng, mult: 1, links: {}, stock: {}, offline: false, capBonusHours: 0 };
}

function tiers(sim, state) {
  var n = 0;
  for (var i = 0; i < sim.DRONES.length; i++) if (state.run.drones[i] > 0) n = i + 1;
  return n;
}

/**
 * One colony online, by seconds, for `minutes`; o.state — a state to go on with (after a jump).
 * Returns {tiers: {minute: n}, ore: {minute: ore/s}, firstBuySec, engineMin, tier3Min, tier8Min, state, now}.
 */
function colony(game, sim, cfg, minutes, o) {
  o = o || {};
  var rng = Rng.make(o.seed || 7);
  var now = o.now || Date.UTC(2026, 10, 2, 5, 0, 0);
  var state = o.state || Core.newState(game, sim, ctxOf(cfg, rng, now));
  var marks = o.marks || [5, 15, 30, 60, 90, 120];
  var out = { tiers: {}, ore: {}, data: {}, firstBuySec: null, firstSmelterMin: null, firstExpeditionMin: null, engineMin: null, tier3Min: null, tier8Min: null, state: state };
  for (var s = 0; s < minutes * 60; s++) {
    var b = sim.play(state, ctxOf(cfg, rng, now), 3);
    sim.tick(state, 1, ctxOf(cfg, rng, now + 1000));
    now += 1000;
    if (out.firstBuySec === null && b) out.firstBuySec = s + 1;
    if (out.firstSmelterMin === null && state.run.b.smelter > 0) out.firstSmelterMin = (s + 1) / 60;
    if (out.firstExpeditionMin === null && state.run.bought.expeditions > 0) out.firstExpeditionMin = (s + 1) / 60;
    var t = tiers(sim, state);
    if (out.tier3Min === null && t >= 3) out.tier3Min = (s + 1) / 60;
    if (out.tier8Min === null && t >= 8) out.tier8Min = (s + 1) / 60;
    if (out.engineMin === null && state.run.engine) out.engineMin = (s + 1) / 60;
    var m = (s + 1) / 60;
    if (marks.indexOf(m) >= 0) {
      out.tiers[m] = t;
      out.ore[m] = sim.oreRate(state, cfg, now);
      out.data[m] = Math.round(Big.toNumber(state.run.data));
    }
    if (o.stopAtEngine && state.run.engine) break;
  }
  out.now = now;
  return out;
}

/** Days of two trips; jumps when the engine is built and the engine hints. */
function trips(game, sim, cfg, o) {
  o = o || {};
  var days = o.days || 3;
  var tripMin = o.tripMin || 25;
  var gaps = o.gaps || [9 * HOUR, 15 * HOUR - 2 * tripMin * MIN];
  var rng = Rng.make(o.seed || 12345);
  var now = Date.UTC(2026, 10, 2, 5, 0, 0);
  var state = Core.newState(game, sim, ctxOf(cfg, rng, now));
  var firstBuySec = null;
  var jumps = [];
  var trip = 0;
  var active = 0;
  var inColony = 0;
  for (var d = 0; d < days; d++) {
    for (var k = 0; k < 2; k++) {
      trip++;
      for (var s = 0; s < tripMin * 60; s++) {
        var bought = sim.play(state, ctxOf(cfg, rng, now), 3);
        sim.tick(state, 1, ctxOf(cfg, rng, now + 1000));
        now += 1000;
        active++;
        inColony++;
        if (firstBuySec === null && trip === 1 && bought) firstBuySec = s + 1;
        if (s % 30 === 29) {
          var info = Core.prestigeInfo(sim, game, state, 'jump', cfg);
          if (info.can && info.hint) {
            var r = Core.prestige(sim, game, state, 'jump', ctxOf(cfg, rng, now));
            if (r.ok) {
              jumps.push({ trip: trip, gain: Big.str(r.gain), activeMin: Math.round(active / 6) / 10, colonyMin: Math.round(inColony / 6) / 10, star: sim.js(state).star });
              sim.playMeta(state, cfg);
              inColony = 0;
            }
          }
        }
      }
      state.lastTick = now;
      var p = Core.plan(now, now + gaps[k % gaps.length], cfg, sim.capBonusHours(state));
      now = p.to;
      Core.runOffline(sim, state, game, p, null, function (seg) { return ctxOf(cfg, rng, seg.to); }, cfg);
      state.lastTick = now;
    }
  }
  return { firstBuySec: firstBuySec, jumps: jumps, trips: trip, state: state };
}

exports.colony = colony;
exports.trips = trips;
exports.ctxOf = ctxOf;
exports.tiers = tiers;
