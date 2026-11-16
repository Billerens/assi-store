// The bot of «Словоплёт» for the checks (checks.js, Rhino) and the tests (node): it plays words of the
// dictionary like a person in the metro — one word every `every` seconds of play (the first at once),
// a rare one now and then — closes sets, opens the next, and buys the cheapest building it can.
// ES5 and the shared subset: no class, no arrows, no let/const.
//   var bot = require('./bot.js').make(lex, {every: 10});
//   bot.play(state, ctx, sim, taps)   // the kit's contract: one second, returns how many it bought
(function (root, make) {
  var api = make();
  if (typeof exports !== 'undefined') { for (var k in api) exports[k] = api[k]; } else { root.WWBot = api; }
})(this, function () {
  'use strict';

  function make(lex, o) {
    o = o || {};
    var every = o.every || 10;
    var rareShare = o.rare === undefined ? 0.15 : o.rare;
    var seen = null;
    var clock = 0;
    var stats = { words: 0, wrong: 0 };

    function word(state, ctx, sim) {
      var cfg = ctx.config;
      var set = sim.current(state);
      if (!set) {
        if (state.run.sets.length) sim.choose(state, state.run.sets[state.run.sets.length - 1].id);
        else sim.openNext(state, cfg, lex, ctx.rng, ctx.now);
        set = sim.current(state);
        if (!set) return null;
      }
      var w = sim.setWords(state, cfg, lex, set);
      var found = {};
      set.found.forEach(function (k) { found[k] = true; });
      var common = w.common.filter(function (k) { return !found[k]; });
      var rare = w.rare.filter(function (k) { return !found[k]; });
      var pick = null;
      if (rare.length && ctx.rng.chance(rareShare)) pick = rare[ctx.rng.int(rare.length)];
      else if (common.length) pick = common[ctx.rng.int(common.length)];
      if (!pick) {
        sim.openNext(state, cfg, lex, ctx.rng, ctx.now);
        return null;
      }
      var out = sim.submit(state, cfg, lex, pick, ctx.now, ctx.mult);
      if (out.ok) stats.words++;
      else stats.wrong++;
      if (out.closed) {
        sim.closeSet(state, cfg, lex, ctx.rng, ctx.now, ctx.mult);
        sim.openNext(state, cfg, lex, ctx.rng, ctx.now);
      }
      return out;
    }

    function play(state, ctx, sim, taps) {
      if (seen !== state) {
        seen = state;
        clock = every - 1;
      }
      var n = 0;
      if (taps >= 10) n = taps;
      else {
        clock++;
        if (clock >= every) {
          clock = 0;
          n = 1;
        }
      }
      for (var i = 0; i < n; i++) word(state, ctx, sim);
      var bought = 0;
      while (bought < 50 && sim.buy(state, ctx.config)) bought++;
      return bought;
    }

    return { play: play, word: word, stats: stats };
  }

  return { make: make };
});
