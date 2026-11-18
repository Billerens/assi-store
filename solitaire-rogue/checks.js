// The checks of «Пасьянс-рогалик» for module_check('games/solitaire-rogue'): the standard ones of
// the engine (the pace is a run of solitaire, not a clicker: the bots of tests/balance.test.js
// measure it) and its own — the solver, a whole run of the bot, the night, the chest, the stock.
var kit = require('../engine/checks-kit.js');
var Core = require('../engine/core.js');
var Rng = require('../engine/rng.js');
var Big = require('../engine/big.js');
var bot = require('./bot.js');

/** One step of plain play per tap: the first column that fits, else the deck, else giving up. */
function play(state, ctx, sim, taps) {
  var cfg = ctx.config;
  for (var i = 0; i < taps; i++) {
    var run = state.run;
    if (!run || run.phase === 'hub') sim.newRun(state, cfg, { seed: ctx.rng.int(1, 1000000000), deck: 'normal', night: 0 });
    else if (run.phase === 'pick') sim.pickStart(state, cfg, 0);
    else if (run.phase === 'shop') {
      sim.buyCandle(state, cfg);
      sim.nextDeal(state, cfg);
    } else if (run.phase === 'won') sim.finish(state, cfg);
    else if (run.phase === 'over') {
      sim.settle(state, cfg, 1);
      sim.toHub(state);
    } else if (run.phase === 'play') {
      var moved = false;
      for (var c = 0; c < run.deal.cols.length && !moved; c++) moved = sim.play(state, cfg, c).ok;
      if (!moved && !sim.draw(state, cfg).ok) sim.giveUp(state, cfg);
    }
  }
  return 0;
}

var checks = kit.standard(__dirname, { pace: false, zeroOffline: true, setupSec: 30, play: play });
for (var checkName in checks) exports[checkName] = checks[checkName];

function load() {
  var id = kit.idOf(__dirname);
  var axiko = require('lib/axiko');
  var game = JSON.parse(axiko.files.read('modules/games/' + id + '/game.json'));
  game.id = id;
  var sim = require('modules/games/' + id + '/sim.js');
  var cfg = kit.configOf(game, 'modules/games/' + id);
  // Fewer tries of the generator: the checks run on the phone.
  var quick = {};
  for (var k in cfg) quick[k] = cfg[k];
  quick['solver.nodes'] = 4000;
  quick['solver.tries'] = 4;
  var ctx = { now: Date.UTC(2026, 10, 14, 19, 0, 0), config: quick, rng: Rng.make(31), mult: 1, links: {}, stock: {} };
  return { game: game, sim: sim, cfg: quick, ctx: ctx, state: Core.newState(game, sim, ctx) };
}

function card(i, r, open) { return { i: i, r: r, s: i % 4, u: open ? 1 : 0 }; }

exports['решатель: решаемый и нерешаемый стол'] = function (t) {
  var x = load();
  var run = { deck: 'normal', relics: [], custom: [], night: 0, mode: 'run' };
  var m = x.sim.mods(run, x.cfg, [], null);
  // 5 on 4, then 6 on 5, then the 7 under it: the whole table goes.
  var good = x.sim.solve([[card(1, 7, false), card(2, 6, true)], [card(3, 5, true)]], [], card(4, 4, true), m, x.cfg, 2000);
  t.equal(good.ok, true, 'решаемый стол');
  // A nine with nothing near it and no deck.
  var bad = x.sim.solve([[card(5, 9, true)]], [], card(6, 4, true), m, x.cfg, 2000);
  t.equal(bad.ok, false, 'нерешаемый стол');
  // The deck helps: the 8 comes from the deck and the nine goes on it.
  var deck = x.sim.solve([[card(7, 9, true)]], [card(8, 8, false)], card(9, 4, true), m, x.cfg, 2000);
  t.equal(deck.ok, true, 'стол решается через колоду');
};

exports['бот доигрывает забег до конца'] = function (t) {
  var x = load();
  var r = bot.playRun(x.state, x.sim, x.cfg, { smart: false, seed: 77 });
  t.ok(r.deals >= 1, 'сыграно раскладов: ' + r.deals);
  t.ok(r.moves > 0 && r.moves < 9 * x.cfg.maxMovesPerDeal, 'ходов: ' + r.moves);
  t.ok(r.wax >= 0 && r.wax === r.wax, 'воск за забег: ' + r.wax);
  t.equal(x.sim.validate(x.state), null, 'sim.validate после забега');
  t.equal(Core.validate(x.state, x.game), null, 'validate после забега');
  t.ok(JSON.stringify(x.state).indexOf('NaN') < 0, 'NaN в сохранении');
};

exports['ход сохраняется: тот же стол после чтения'] = function (t) {
  var x = load();
  x.sim.newRun(x.state, x.cfg, { seed: 5, deck: 'normal', night: 0 });
  for (var i = 0; i < 4; i++) play(x.state, x.ctx, x.sim, 1);
  var json = JSON.stringify(x.state);
  var picked = Core.pick([{ json: json, seq: x.state.seq, source: 'check' }], x.game, x.sim);
  t.ok(picked.state, 'сохранение принято движком');
  t.equal(JSON.stringify(picked.state.run), JSON.stringify(JSON.parse(json).run), 'стол, стопка и колода те же');
};

exports['следующая ночь: +1 ночь, воск и мастерская остаются'] = function (t) {
  var x = load();
  x.state.meta.wax = 120;
  x.state.meta.shop = { wick: 2 };
  x.state.meta.ascend = true;
  var info = Core.prestigeInfo(x.sim, x.game, x.state, 'night', x.cfg);
  t.ok(info.can, 'ночь доступна после победы');
  var r = Core.prestige(x.sim, x.game, x.state, 'night', x.ctx);
  t.ok(r.ok, 'престиж прошёл');
  t.equal(x.sim.nightsOf(x.state), 1, 'ночей');
  t.equal(x.sim.waxOf(x.state.meta), 120, 'воск на месте');
  t.equal(x.state.meta.shop.wick, 2, 'мастерская на месте');
  t.ok(!Core.prestigeInfo(x.sim, x.game, x.state, 'night', x.cfg).can, 'вторая ночь только после новой победы');
};

exports['сундук «Пассажира» даёт воск'] = function (t) {
  var x = load();
  var before = x.sim.waxOf(x.state.meta);
  var r = x.sim.chest(x.state, Rng.make(9), x.cfg);
  var got = x.sim.waxOf(x.state.meta) - before;
  t.ok(got >= x.cfg['chest.min'] && got <= x.cfg['chest.max'], 'воска из сундука: ' + got);
  t.equal(r.items[0].amount, got, 'в сундуке написано столько же');
  t.ok(Big.valid(x.state.meta.wax), 'воск — число');
};

exports['запас: правило из кирпичика проверяется'] = function (t) {
  var x = load();
  t.equal(x.sim.validateStock('rules', { title: 'Медный напёрсток', text: 'Видны две следующие карты колоды', kind: 'relic', brick: 'see.deck', n: 2 }), null, 'хорошая реликвия');
  t.ok(x.sim.validateStock('rules', { title: 'Ключница', text: 'Колода короче', kind: 'host', brick: 'nope', n: 2 }), 'нет такого кирпичика');
  t.ok(x.sim.validateStock('rules', { title: 'Ключница', text: 'Тузы спят долго', kind: 'host', brick: 'aces.guard', n: 9 }), 'n вне диапазона');
  t.ok(x.sim.validateStock('rules', { title: 'Звонарь', text: 'Золото за карты вдвое меньше', kind: 'relic', brick: 'gold.half', n: 0 }), 'кирпичик хозяина в реликвии');
  var rule = x.sim.procedural('rules', Rng.make(4));
  t.equal(x.sim.validateRule(rule), null, 'правило без модели проходит проверку');
};
