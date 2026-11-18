// The checks of «Династия» (module_check with 'games/dynasty'): the engine's standard ones, then
// the game's own — succession, the share of the inheritance, the offline deathbed, Glory, the epoch.
// Strict ES5: the engine runs it in Rhino.
var kit = require('../engine/checks-kit.js');
var Big = require('../engine/big.js');
var Rng = require('../engine/rng.js');
var Core = require('../engine/core.js');

function play(state, ctx, sim) { return sim.botPlay(state, ctx.config, ctx.now); }

var checks = kit.standard(__dirname, { play: play, firstBuySec: 10, prestigeTrips: [2, 3] });
for (var name in checks) exports[name] = checks[name];

function load() {
  var id = kit.idOf(__dirname);
  var axiko = require('lib/axiko');
  var game = JSON.parse(axiko.files.read('modules/games/' + id + '/game.json'));
  game.id = id;
  var sim = require('modules/games/' + id + '/sim.js');
  return { game: game, sim: sim, cfg: kit.configOf(game, 'modules/games/' + id) };
}

function ctxOf(x, now, seed) {
  return { now: now, config: x.cfg, rng: Rng.make(seed || 1), mult: 1, links: {}, stock: {}, offline: false, capBonusHours: 0 };
}

/** A reign played by the bot for `sec` seconds online. */
function played(x, seed, sec) {
  var now = Date.UTC(2026, 10, 2, 8, 0, 0);
  var state = Core.newState(x.game, x.sim, ctxOf(x, now, seed));
  for (var s = 0; s < sec && !state.run.dead; s++) {
    now += 1000;
    x.sim.botPlay(state, x.cfg, now);
    x.sim.tick(state, 1, ctxOf(x, now, seed));
  }
  return { state: state, now: now };
}

exports['смерть правителя: наследник получает долю, Земли и место на древе'] = function (t) {
  var x = load();
  var p = played(x, 3, 3 * 3600);
  var state = p.state;
  t.ok(state.run.dead, 'правитель не умер за три часа игры');
  var gold = Big.of(state.run.gold);
  var h = state.run.h.slice();
  var lands = state.run.lands;
  var heir = x.sim.heirOf(state);
  var info = Core.prestigeInfo(x.sim, x.game, state, 'generation', x.cfg);
  t.ok(info.can, 'смена поколения недоступна после смерти');
  var r = Core.prestige(x.sim, x.game, state, 'generation', ctxOf(x, p.now, 3));
  t.ok(r.ok, 'смена поколения не прошла');
  t.ok(!state.run.dead, 'новый правитель мёртв');
  if (heir) t.equal(state.run.ruler.id, heir.id, 'на престоле не тот наследник');
  t.equal(state.run.lands, lands, 'Земли не перешли полностью');
  for (var i = 0; i < 8; i++) t.equal(state.run.h[i], Math.floor(h[i] * x.cfg['inherit.base']), 'доля владений тира ' + (i + 1));
  var want = Big.max(Big.floor(Big.mul(gold, x.cfg['inherit.base'])), x.cfg['start.gold']);
  t.ok(Math.abs(Big.toNumber(Big.div(state.run.gold, want)) - 1) < 1e-9, 'доля казны: ' + Big.str(state.run.gold) + ', нужно ' + Big.str(want));
  t.ok(state.run.ruler.age >= x.cfg['age.start'], 'наследник моложе ' + x.cfg['age.start']);
  t.ok(state.meta.tree.length >= 2, 'древо не выросло');
  t.equal(state.meta.chronicle.length, 1, 'нет записи в летописи');
  t.ok(state.meta.chronicle[0].lines.length >= 3, 'летопись короче трёх строк');
  t.ok(Big.gte(state.layers.generation.currency, 1), 'нет Славы');
};

exports['офлайн 8 ч: +24 года, золото = доход × 28 800 × 0.5'] = function (t) {
  var x = load();
  var now = Date.UTC(2026, 10, 2, 8, 0, 0);
  var state = Core.newState(x.game, x.sim, ctxOf(x, now, 4));
  state.run.h[0] = 10;
  state.run.h[1] = 5;
  var rate = x.sim.income(state, x.cfg);
  var before = Big.of(state.run.gold);
  var age = state.run.ruler.age;
  var c = ctxOf(x, now + 8 * 3600000, 4);
  c.offline = true;
  c.report = function () {};
  x.sim.offline(state, 8 * 3600, c);
  t.ok(Math.abs(state.run.ruler.age - age - 24) < 1e-6, 'постарел на ' + (state.run.ruler.age - age) + ' лет');
  var want = Big.add(before, Big.mul(rate, 28800 * 0.5));
  t.ok(Math.abs(Big.toNumber(Big.div(state.run.gold, want)) - 1) < 1e-6, 'золото ' + Big.str(state.run.gold) + ', нужно ' + Big.str(want));
};

exports['офлайн трое суток: правитель на смертном одре, но жив'] = function (t) {
  var x = load();
  var now = Date.UTC(2026, 10, 2, 8, 0, 0);
  var state = Core.newState(x.game, x.sim, ctxOf(x, now, 5));
  var c = ctxOf(x, now + 72 * 3600000, 5);
  c.offline = true;
  c.report = function () {};
  var r = x.sim.offline(state, 72 * 3600, c);
  t.ok(!state.run.dead, 'правитель умер офлайн');
  t.ok(x.sim.onDeathbed(state, x.cfg), 'правитель не на одре: ' + state.run.ruler.age + ' из ' + x.sim.life(state, x.cfg));
  t.ok(r.events.join(' ').indexOf('проститесь') >= 0, 'сводка не зовёт попрощаться: ' + r.events.join(' | '));
  t.ok(x.sim.summary(state, x.cfg).line.indexOf('одре') >= 0, 'строка игры не говорит об одре');
};

exports['Слава: 1e8 — 6, 1e12 — 14, 1e16 — 25'] = function (t) {
  var x = load();
  var state = Core.newState(x.game, x.sim, ctxOf(x, Date.now(), 6));
  var want = { '1e8': 6, '1e12': 14, '1e16': 25 };
  for (var z in want) {
    state.run.earned = Big.of(z);
    state.run.deeds = {};
    state.run.ruler.tr = [];
    state.run.ruler.st.war = 0;
    t.equal(x.sim.gloryOf(state, x.cfg), want[z], 'Слава за ' + z);
  }
};

exports['законы: доля наследства 10 → 20 → 30 %, по цепочке'] = function (t) {
  var x = load();
  var state = Core.newState(x.game, x.sim, ctxOf(x, Date.now(), 7));
  state.layers.generation.currency = Big.of(30);
  t.ok(!x.sim.buyLaw(state, x.cfg, 'majorat'), 'Майорат без Права старшего');
  t.ok(x.sim.buyLaw(state, x.cfg, 'elder'), 'Право старшего не куплено');
  t.equal(x.sim.share(state, x.cfg), x.cfg['law.elder.share'], 'доля с Правом старшего');
  t.ok(x.sim.buyLaw(state, x.cfg, 'majorat'), 'Майорат не куплен');
  t.equal(x.sim.share(state, x.cfg), x.cfg['law.majorat.share'], 'доля с Майоратом');
  t.equal(x.sim.glory(state), 30 - x.cfg['law.elder.cost'] - x.cfg['law.majorat.cost'], 'Слава после законов');
};

exports['смена эпохи после 10 поколений: Легенды, законы сброшены'] = function (t) {
  var x = load();
  var now = Date.UTC(2026, 10, 2, 8, 0, 0);
  var state = Core.newState(x.game, x.sim, ctxOf(x, now, 8));
  var gs = x.sim.genState(state);
  state.layers.generation.currency = Big.of(900);
  t.ok(!Core.prestigeInfo(x.sim, x.game, state, 'epoch', x.cfg).can, 'эпоха доступна раньше 10 поколений');
  gs.gens = x.cfg['epoch.minGens'];
  gs.laws.elder = true;
  var r = Core.prestige(x.sim, x.game, state, 'epoch', ctxOf(x, now, 8));
  t.ok(r.ok, 'смена эпохи не прошла');
  t.equal(Big.str(state.layers.epoch.currency), Big.str(Big.of(3)), 'Легенды: floor(sqrt(900 / 100))');
  t.ok(Big.isZero(state.layers.generation.currency), 'Величие не сброшено');
  t.ok(!x.sim.hasLaw(state, 'elder'), 'законы не сброшены');
  t.equal(x.sim.epochIndex(state), 1, 'номер эпохи');
  t.ok(state.meta.tree.length >= 1, 'древо потеряно');
};

exports['караван «Пассажира» даёт золото'] = function (t) {
  var x = load();
  var state = Core.newState(x.game, x.sim, ctxOf(x, Date.now(), 9));
  state.run.h[0] = 5;
  var before = Big.of(state.run.gold);
  var c = x.sim.chest(state, Rng.make(3), x.cfg);
  t.ok(c.items.length && Big.gt(c.items[0].amount, 0), 'пустой караван');
  t.ok(Big.gt(state.run.gold, before), 'золото не прибавилось');
};

exports['запас: строки летописи, карточки и имена проверяются'] = function (t) {
  var x = load();
  t.equal(x.sim.validateStock('chronicle', { fact: 'marriage', text: '{имя} взял в жёны {супруг}.' }), null, 'хорошая строка');
  t.ok(x.sim.validateStock('chronicle', { fact: 'marriage', text: '{имя} и {жена}' }) !== null, 'чужая подстановка');
  t.ok(x.sim.validateStock('cards', { title: 'Т', text: 'Т', a: 'А', b: 'Б', aEffect: 'fire', bEffect: 'nothing' }) !== null, 'чужое действие');
  t.equal(x.sim.validateStock('names', { name: 'Ведислав', gender: 'm' }), null, 'хорошее имя');
  t.ok(x.sim.validateStock('names', { name: 'John', gender: 'm' }) !== null, 'имя латиницей');
  t.ok(x.sim.procedural('chronicle', Rng.make(1)).text, 'запасная строка летописи');
};
