// The checks of «Конвейеры» (module_check with 'games/conveyors'): the engine's standard ones with
// a bot that builds the starter line (drill → belt → furnace → belt → port) — the kit's bot cannot
// lay out a factory, so the pace is measured by the node tests (tests/pace.test.js) — then the
// game's own: the recipes of every planet, the reference line, the new planet, the chest, undo.
'use strict';
var kit = require('../engine/checks-kit.js');
var Big = require('../engine/big.js');
var Rng = require('../engine/rng.js');
var Core = require('../engine/core.js');

function play(state, ctx, sim) {
  var run = state.run;
  for (var i = 0; i < run.b.length; i++) if (run.b[i].t === 'port') return 0;
  var cfg = ctx.config;
  return sim.starterLine(state, cfg, 'iron-ore') || sim.starterLine(state, cfg, '') ? 5 : 0;
}

var checks = kit.standard(__dirname, { pace: false, play: play, setupSec: 360 });
for (var name in checks) exports[name] = checks[name];

function load() {
  var id = kit.idOf(__dirname);
  var assi = require('lib/assi');
  var game = JSON.parse(assi.files.read('modules/games/' + id + '/game.json'));
  game.id = id;
  var sim = require('modules/games/' + id + '/sim.js');
  return { game: game, sim: sim, cfg: kit.configOf(game, 'modules/games/' + id) };
}

function ctxOf(cfg, seed, now) {
  return { now: now, config: cfg, rng: Rng.make(seed), mult: 1, links: {}, stock: {}, offline: false, capBonusHours: 0 };
}

exports['рецепты каждой планеты сходятся'] = function (t) {
  var x = load();
  var data = x.sim.data();
  data.planets.forEach(function (p) {
    t.equal(x.sim.validatePlanet(p, data.items), null, 'планета ' + p.title);
  });
};

exports['эталонная линия: доход как по рецепту'] = function (t) {
  var x = load();
  var now = Date.UTC(2026, 10, 14, 8, 0, 0);
  var ctx = ctxOf(x.cfg, 3, now);
  var state = Core.newState(x.game, x.sim, ctx);
  t.ok(x.sim.starterLine(state, x.cfg, 'iron-ore'), 'линия не поставилась');
  state.run.evAt = now + 86400000;
  for (var s = 0; s < 400; s++) {
    now += 1000;
    x.sim.tick(state, 1, ctxOf(x.cfg, 3, now));
  }
  var r = x.sim.data().planets[0].recipes[0];
  var perSec = Math.min(x.cfg['drill.rate'] / r.in['iron-ore'], x.cfg['furnace.speed'] * r.n / r.sec);
  var expect = perSec * x.sim.data().items['iron-ingot'].price;
  var got = x.sim.windowRate(state.run, x.cfg);
  t.ok(Math.abs(got - expect) / expect <= 0.05, 'ставка ' + got + ', по рецепту ' + expect);
};

exports['новая планета: кредиты, следующая планета, магазин'] = function (t) {
  var x = load();
  var now = Date.UTC(2026, 10, 14, 8, 0, 0);
  var state = Core.newState(x.game, x.sim, ctxOf(x.cfg, 5, now));
  t.ok(Big.isZero(x.sim.prestigeGain(state, 'planet', x.cfg)), 'кредиты без дрона');
  var earned = Big.mul(x.cfg['planet.minEarned'], 4);
  state.run.earned = Big.str(earned);
  state.run.goalSold = 1;
  var r = Core.prestige(x.sim, x.game, state, 'planet', ctxOf(x.cfg, 5, now));
  t.ok(r.ok, 'переезд не прошёл');
  // floor(sqrt(earned / div)): four thresholds give twice the credits of one.
  var expect = Math.floor(Math.sqrt(Big.toNumber(earned) / Big.toNumber(Big.of(x.cfg['planet.div']))));
  t.equal(Big.str(state.layers.planet.currency), Big.str(Big.of(expect)), 'кредиты за 4 порога');
  t.equal(state.run.planet, 'icy', 'первый переезд — на Ледяную');
  t.equal(state.run.b.length, 0, 'здания сброшены');
  t.ok(x.sim.shopBuy(state, 'money', x.cfg).ok, 'магазин не продал стартовый капитал');
  t.equal(x.sim.planetOptions(state, 1, x.cfg).length, 2, 'после второго переезда — выбор из двух');
};

exports['сундук «Пассажира»: два здания даром и заказ ×3'] = function (t) {
  var x = load();
  var now = Date.UTC(2026, 10, 14, 8, 0, 0);
  var state = Core.newState(x.game, x.sim, ctxOf(x.cfg, 7, now));
  state.run.sold['iron-ingot'] = 50;
  var c = x.sim.chest(state, Rng.make(3), x.cfg);
  t.equal(state.run.free, x.cfg['chest.free'], 'бесплатные здания');
  t.ok(c.items.length === 2, 'в сундуке нет заказа');
  t.ok(state.run.orders.some(function (o) { return o.x3; }), 'заказа ×3 нет');
  var money = Big.str(state.run.money);
  var b = x.sim.build(state, 'furnace', 0, 0, 0, x.cfg);
  t.ok(b.ok && b.free, 'бесплатная печь не встала');
  t.equal(Big.str(state.run.money), money, 'бесплатная печь взяла деньги');
};

exports['отмена: двадцать последних действий'] = function (t) {
  var x = load();
  var now = Date.UTC(2026, 10, 14, 8, 0, 0);
  var state = Core.newState(x.game, x.sim, ctxOf(x.cfg, 9, now));
  state.run.money = Big.str(Big.of(1000));
  var placed = 0;
  for (var y = 0; y < state.run.h && placed < 25; y++) {
    for (var xx = 0; xx < state.run.w && placed < 25; xx++) {
      if (x.sim.build(state, 'belt', xx, y, 0, x.cfg).ok) placed++;
    }
  }
  t.equal(state.run.undo.length, x.cfg['undo.max'], 'хранится действий');
  var undone = 0;
  while (x.sim.undo(state, x.cfg).ok) undone++;
  t.equal(undone, x.cfg['undo.max'], 'отменено');
  t.equal(state.run.b.length, placed - x.cfg['undo.max'], 'лент осталось');
};
