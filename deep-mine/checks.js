// The checks of «Шахта вглубь» (module_check('games/deep-mine')): the engine's standard ones,
// then the game's own. The pace is checked by the game's bot (bot.js): the engine's bot resets at
// the first «выгодно», and with no Керн yet that is any gain — at 1 000 m, in the first trip —
// while the spec ends the first well when the drill is spent (below 0,2 м/с, 60–90 minutes).
var kit = require('../engine/checks-kit.js');
var Big = require('../engine/big.js');
var Rng = require('../engine/rng.js');
var Core = require('../engine/core.js');
var bot = require('./bot.js');

var checks = kit.standard(__dirname, {
  pace: false,
  setupSec: 600,
  play: function (state, ctx, sim, taps) { return sim.play(state, ctx, taps); }
});
for (var name in checks) exports[name] = checks[name];

function load() {
  var id = kit.idOf(__dirname);
  var axiko = require('lib/axiko');
  var game = JSON.parse(axiko.files.read('modules/games/' + id + '/game.json'));
  game.id = id;
  var sim = require('modules/games/' + id + '/sim.js');
  return { game: game, sim: sim, cfg: kit.configOf(game, 'modules/games/' + id) };
}

// On the phone the three days are played coarser so the check fits Rhino's time limit: a bot move
// every 30 s and offline steps of 10 minutes (the drill is integrated exactly, so only the bot's
// buying is rarer). The full run by seconds is tests/deep-mine.test.js in node.
exports['темп: три дня по две поездки, первая скважина в поездках 3–6'] = function (t) {
  var x = load();
  var r = bot.trips(x.game, x.sim, x.cfg, { step: 30, offlineStep: 600 });
  t.ok(r.prestiges.length > 0, 'за ' + r.trips + ' поездок ни одной новой скважины; глубина к концу поездок ' + r.ends.join(', '));
  var first = r.prestiges[0].trip;
  t.ok(first >= 3 && first <= 6, 'первая новая скважина в поездке ' + first + ', нужно 3–6');
  for (var i = 1; i < r.prestiges.length; i++) {
    t.ok(Big.gte(r.prestiges[i].gain, 1), 'скважина без Керна');
  }
};

exports['первая покупка за 10 секунд'] = function (t) {
  var x = load();
  var rng = Rng.make(12345);
  var now = Date.now();
  var state = Core.newState(x.game, x.sim, bot.ctxOf(x.cfg, rng, now));
  var at = null;
  for (var s = 0; s < 10 && at === null; s++) {
    if (x.sim.play(state, bot.ctxOf(x.cfg, rng, now), 3)) at = s + 1;
    x.sim.tick(state, 1, bot.ctxOf(x.cfg, rng, now + 1000));
    now += 1000;
  }
  t.ok(at !== null, 'за 10 секунд ничего не куплено');
};

exports['1 000 м к 15–25-й минуте, скорость ниже 0,2 м/с к 45–90-й'] = function (t) {
  var x = load();
  var w = bot.well(x.game, x.sim, x.cfg, 100, 0, []);
  t.ok(w.thousandMin !== null && w.thousandMin >= 15 && w.thousandMin <= 25, '1 000 м на ' + w.thousandMin + ' мин');
  t.ok(w.slowMin !== null && w.slowMin >= 45 && w.slowMin <= 90, 'медленнее 0,2 м/с с ' + w.slowMin + ' мин');
};

exports['Керн: скважина до 2 000 м даёт ровно 8'] = function (t) {
  var x = load();
  var state = Core.newState(x.game, x.sim, bot.ctxOf(x.cfg, Rng.make(3), Date.now()));
  state.run.depth = 2000;
  t.equal(Big.str(x.sim.prestigeGain(state, 'core', x.cfg)), Big.str(Big.of(8)), 'Керн с 2 000 м');
  state.run.depth = 999;
  t.ok(Big.isZero(x.sim.prestigeGain(state, 'core', x.cfg)), 'до 1 000 м скважина не даётся');
  state.run.depth = 1500;
  t.equal(Big.str(x.sim.prestigeGain(state, 'core', x.cfg)), Big.str(Big.of(4)), 'Керн с 1 500 м');
  state.run.depth = 3000;
  t.equal(Big.str(x.sim.prestigeGain(state, 'core', x.cfg)), Big.str(Big.of(18)), 'Керн с 3 000 м');
  state.run.depth = 5000;
  t.equal(Big.str(x.sim.prestigeGain(state, 'core', x.cfg)), Big.str(Big.of(50)), 'Керн с 5 000 м');
};

exports['новая скважина: глубина с нуля, Керн и Чертежи остаются'] = function (t) {
  var x = load();
  var ctx = bot.ctxOf(x.cfg, Rng.make(5), Date.now());
  var state = Core.newState(x.game, x.sim, ctx);
  x.sim.advance(state, 2000, x.cfg, Rng.make(5), Date.now());
  var bp = state.layers.core.state.bp;
  t.ok(bp === 8, 'Чертежей за рекорд 2 000 м: ' + bp);
  var r = Core.prestige(x.sim, x.game, state, 'core', ctx);
  t.ok(r.ok, 'новая скважина не прошла');
  t.equal(state.run.depth, 0, 'глубина после сброса');
  t.equal(Big.str(state.layers.core.currency), Big.str(Big.of(8)), 'Керн');
  t.equal(state.layers.core.state.bp, 8, 'Чертежи остались');
};

exports['офлайн 2 ч с 1 500 м: шаг 30 с и шаг 1 с расходятся меньше 1 %'] = function (t) {
  var x = load();
  var w = bot.well(x.game, x.sim, x.cfg, 60, 0, []);
  var base = w.state;
  base.lastTick = w.now;
  var p = Core.plan(w.now, w.now + 2 * 3600000, x.cfg, 0);
  var a = Core.clone(base);
  var b = Core.clone(base);
  var cfgA = {};
  var cfgB = {};
  for (var k in x.cfg) {
    cfgA[k] = x.cfg[k];
    cfgB[k] = x.cfg[k];
  }
  cfgA['offline.stepSec'] = 30;
  cfgB['offline.stepSec'] = 1;
  cfgB['offline.maxSteps'] = 100000;
  var mk = function (seg) { return bot.ctxOf(x.cfg, Rng.make(1), seg.to); };
  Core.runOffline(x.sim, a, x.game, p, null, mk, cfgA);
  Core.runOffline(x.sim, b, x.game, p, null, mk, cfgB);
  var da = a.run.depth - base.run.depth;
  var db = b.run.depth - base.run.depth;
  t.ok(da > 0, 'офлайн не прошёл ни метра');
  t.ok(Math.abs(da - db) / db < 0.01, 'метры: шаг 30 с ' + da.toFixed(2) + ', шаг 1 с ' + db.toFixed(2));
};

exports['керновый ящик «Пассажира»: +50 м и находка'] = function (t) {
  var x = load();
  var state = Core.newState(x.game, x.sim, bot.ctxOf(x.cfg, Rng.make(9), Date.now()));
  var c = x.sim.chest(state, Rng.make(4), x.cfg);
  t.equal(state.run.depth, x.cfg['chest.meters'], 'метры ящика');
  t.ok(state.run.finds.length === 1 && c.items.length === 2, 'находка ящика');
};
