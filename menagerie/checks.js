// Strict ES5: these checks also run through module_check on the phone.
var kit = require('../engine/checks-kit.js');
var Big = require('../engine/big.js');
var Rng = require('../engine/rng.js');
var Core = require('../engine/core.js');

function play(state, ctx, sim) {
  return sim.buy(state, 'feed', ctx.config) ? 1 : 0;
}

// The game specification targets the first expedition in a week. Its pace is
// measured by tests/pace.test.js, not by the generic three-day idle-game bot.
var checks = kit.standard(__dirname, { play: play, pace: false, zeroOffline: true });
for (var name in checks) exports[name] = checks[name];

function load() {
  var id = kit.idOf(__dirname);
  var axiko = require('lib/axiko');
  var game = JSON.parse(axiko.files.read('modules/games/' + id + '/game.json'));
  game.id = id;
  return { game: game, sim: require('modules/games/' + id + '/sim.js'), cfg: kit.configOf(game, 'modules/games/' + id) };
}

function ctxOf(x, now, seed) {
  return { now: now, config: x.cfg, rng: Rng.make(seed || 1), mult: 1, links: {}, stock: {}, offline: false, capBonusHours: 0 };
}

exports['старт: четыре взрослых, первая покупка сразу, яйцо за пять минут'] = function (t) {
  var x = load();
  var ctx = ctxOf(x, 1800000000000, 1);
  var state = Core.newState(x.game, x.sim, ctx);
  t.equal(state.run.beasts.length, 4, 'стартовых зверей');
  t.ok(state.run.beasts.every(function (beast) { return beast.level >= 5; }), 'стартовая пара не взрослая');
  t.ok(x.sim.buy(state, 'feed', x.cfg), 'первая покупка недоступна');
  var laid = x.sim.breed(state, state.run.beasts[0].id, state.run.beasts[1].id, ctx);
  t.ok(laid.ok, laid.reason || 'не удалось получить первое яйцо');
  t.equal(state.run.eggs.length, 1, 'яйцо не появилось');
};

exports['яйцо: качества определены при кладке и не меняются офлайн'] = function (t) {
  var x = load();
  var ctx = ctxOf(x, 1800000000000, 2);
  var state = Core.newState(x.game, x.sim, ctx);
  var laid = x.sim.breed(state, state.run.beasts[0].id, state.run.beasts[1].id, ctx);
  t.ok(laid.ok, laid.reason || 'яйцо не отложено');
  var planned = Core.clone(state.run.eggs[0].beast);
  var future = ctxOf(x, ctx.now + 4 * 3600000, 400);
  future.offline = true;
  x.sim.offline(state, 4 * 3600, future);
  var born = state.run.beasts.filter(function (beast) { return beast.id === planned.id; })[0];
  t.ok(born, 'зверь не вылупился за четыре часа');
  t.equal(JSON.stringify(born.genes), JSON.stringify(planned.genes), 'качества переброшены при вылуплении');
  t.equal(JSON.stringify(born.parts), JSON.stringify(planned.parts), 'части переброшены при вылуплении');
  t.equal(JSON.stringify(born.colors), JSON.stringify(planned.colors), 'окрас переброшен при вылуплении');
};

exports['офлайн: монет и турнирных боёв нет'] = function (t) {
  var x = load();
  var ctx = ctxOf(x, 1800000000000, 3);
  var state = Core.newState(x.game, x.sim, ctx);
  var coins = Big.str(Big.of(state.run.coins));
  var fights = state.run.beasts.map(function (beast) { return beast.fights; });
  ctx.now += 12 * 3600000;
  ctx.offline = true;
  x.sim.offline(state, 12 * 3600, ctx);
  t.equal(Big.str(Big.of(state.run.coins)), coins, 'монеты появились офлайн');
  t.equal(JSON.stringify(state.run.beasts.map(function (beast) { return beast.fights; })), JSON.stringify(fights), 'турниры прошли офлайн');
  t.equal(x.sim.validate(state), null, 'невалидное состояние');
};

exports['экспедиция: три основателя и генофонд сохраняются, награды генофондом нет'] = function (t) {
  var x = load();
  var ctx = ctxOf(x, 1800000000000, 4);
  var state = Core.newState(x.game, x.sim, ctx);
  t.ok(!Core.prestigeInfo(x.sim, x.game, state, 'expedition', x.cfg).can, 'экспедиция доступна с нулевым генофондом');
  state.meta.genePool = 200;
  var selected = state.run.beasts.slice(0, 3).map(function (beast) { return beast.id; });
  x.sim.selectFounders(state, selected);
  var before = Core.clone(state.meta.album);
  var result = Core.prestige(x.sim, x.game, state, 'expedition', ctx);
  t.ok(result.ok, 'экспедиция недоступна при 200 очках');
  t.equal(state.meta.genePool, 200, 'сброс начислил или потратил генофонд');
  t.equal(state.meta.continent, 2, 'новый материк не открыт');
  t.equal(JSON.stringify(state.run.beasts.map(function (beast) { return beast.id; }).sort()), JSON.stringify(selected.sort()), 'потеряны основатели');
  t.equal(JSON.stringify(state.meta.album), JSON.stringify(before), 'альбом изменился при экспедиции');
  t.equal(state.run.league, 0, 'лига не сброшена');
};

exports['сундук: яйцо, повтор одного входящего сообщения без награды'] = function (t) {
  var x = load();
  var ctx = ctxOf(x, 1800000000000, 5);
  var state = Core.newState(x.game, x.sim, ctx);
  var entry = { id: 'menagerie-check-chest', at: ctx.now, from: 'passenger', op: 'chest' };
  var first = Core.applyInbox(state, x.game, x.sim, [entry], ctx);
  var eggs = state.run.eggs.length;
  var second = Core.applyInbox(state, x.game, x.sim, [entry], ctx);
  t.ok(first.changed, 'сундук не применился');
  t.ok(eggs > 0, 'сундук не выдал яйцо');
  t.ok(!second.changed, 'повторный сундук применился');
  t.equal(state.run.eggs.length, eggs, 'повторный сундук выдал второе яйцо');
};
