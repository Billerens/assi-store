// The checks of «Алхимик» (module_check with 'games/alchemist'): the engine's standard ones with
// the game's bot, then the tree, the checks of the model's answers, the prestige layers.
var kit = require('../engine/checks-kit.js');
var Big = require('../engine/big.js');
var Rng = require('../engine/rng.js');
var Core = require('../engine/core.js');

function play(state, ctx, sim, taps) { return sim.bot(state, ctx); }

var OPTIONS = { play: play, firstBuySec: 10, prestigeTrips: [3, 6], setupSec: 600 };
var checks = kit.standard(__dirname, OPTIONS);
for (var name in checks) exports[name] = checks[name];

/**
 * The pace on two trees. The engine's mark (the first stone in trips 3–6) is for the hand-made
 * set, which does not change. The tree on the phone grows every day: the model's elements are
 * new cheap finds, the Book reaches its 40 sooner, and the first stone may come a trip earlier
 * (never in the first one, the week stays as the spec has it — tests/economy.test.js).
 */
exports['темп: три дня по две поездки'] = function (t) {
  var x = load();
  var live = x.sim.graph();
  var hand;
  var grown;
  try {
    x.sim.setGraph({ elements: [], recipes: [] });
    hand = kit.bot(x.game, x.sim, x.cfg, OPTIONS);
    x.sim.setGraph(live);
    grown = kit.bot(x.game, x.sim, x.cfg, OPTIONS);
  } finally {
    x.sim.setGraph(live);
  }
  t.ok(hand.firstBuySec !== null && hand.firstBuySec <= OPTIONS.firstBuySec, 'первая покупка на ' + hand.firstBuySec + ' с, нужно не позже ' + OPTIONS.firstBuySec);
  t.ok(hand.prestiges.length > 0, 'ручное дерево: за ' + hand.trips + ' поездок ни одного камня');
  var first = hand.prestiges[0].trip;
  t.ok(first >= OPTIONS.prestigeTrips[0] && first <= OPTIONS.prestigeTrips[1], 'ручное дерево: первый камень в поездке ' + first + ', нужно 3–6');
  var model = live && live.elements ? live.elements.length : 0;
  t.ok(grown.prestiges.length > 0, 'дерево с ' + model + ' элементами модели: ни одного камня');
  var early = grown.prestiges[0].trip;
  t.ok(early >= 2 && early <= OPTIONS.prestigeTrips[1], 'дерево с ' + model + ' элементами модели: первый камень в поездке ' + early + ', нужно 2–6');
};

function load() {
  var id = kit.idOf(__dirname);
  var axiko = require('lib/axiko');
  var game = JSON.parse(axiko.files.read('modules/games/' + id + '/game.json'));
  game.id = id;
  var sim = require('modules/games/' + id + '/sim.js');
  return { game: game, sim: sim, cfg: kit.configOf(game, 'modules/games/' + id) };
}

function fresh(x, seed) {
  var ctx = { now: Date.UTC(2026, 10, 2, 8), config: x.cfg, rng: Rng.make(seed || 3), mult: 1 };
  return { ctx: ctx, state: Core.newState(x.game, x.sim, ctx) };
}

exports['дерево: ацикличное, достижимое, ступени по формуле'] = function (t) {
  var x = load();
  var r = x.sim.checkTree(x.sim.content(), x.sim.graph(), x.cfg);
  t.ok(r.ok, 'ошибки дерева: ' + r.problems.slice(0, 5).join('; '));
  t.ok(r.counts.elements >= 122, 'элементов ' + r.counts.elements);
};

exports['ручной набор: 92 элемента и 91 рецепт'] = function (t) {
  var x = load();
  var c = x.sim.content();
  var base = c.elements.filter(function (e) { return e.src === 'base'; });
  var recipes = c.recipes.filter(function (r) { return r.src === 'base'; });
  t.equal(base.length, 92, 'элементов ручного набора');
  t.equal(recipes.length, 91, 'рецептов ручного набора');
};

exports['ответ модели: латиница, стихия, цикл и чужая пара отвергнуты'] = function (t) {
  var x = load();
  var tree = x.sim.tree();
  var o = { config: x.cfg, asked: { 'вода+пар': true, 'ветер+гора': true }, banned: x.sim.content().banned };
  t.ok(x.sim.validateAnswer(tree, { pair: 'вода+пар', kind: 'new', result: 'Steam', desc: 'x', category: 'вещество', glyph: 'steam', colors: [1, 2] }, o).why, 'латиница прошла');
  t.ok(x.sim.validateAnswer(tree, { pair: 'вода+пар', kind: 'existing', result: 'Огонь' }, o).why, 'стихия прошла');
  t.ok(x.sim.validateAnswer(tree, { pair: 'ветер+гора', kind: 'existing', result: 'Камень' }, o).why, 'цикл прошёл');
  t.ok(x.sim.validateAnswer(tree, { pair: 'земля+пар', kind: 'none' }, o).why, 'чужая пара прошла');
  var v = x.sim.validateAnswer(tree, { pair: 'вода+пар', kind: 'new', result: 'облако', desc: 'x', category: 'погода', glyph: 'cloud', colors: [1, 2] }, o);
  t.equal(v.action, 'recipe', 'точный дубль — в «existing»');
  t.equal(v.r, 'облако', 'результат точного дубля');
};

exports['значок модели: чистый принят, чужой цвет отброшен, глиф остаётся'] = function (t) {
  var x = load();
  var tree = x.sim.tree();
  var keys = tree.list.filter(function (e) { return e.tier > 0; }).map(function (e) { return e.key; });
  var pair = null;
  for (var i = 0; i < keys.length && !pair; i++) {
    for (var j = i + 1; j < keys.length && !pair; j++) {
      var k = [keys[i], keys[j]].sort().join('+');
      if (!tree.recipes[k] && !tree.none[k]) pair = k;
    }
  }
  t.ok(pair, 'нет свободной пары');
  var asked = {};
  asked[pair] = true;
  var o = { config: x.cfg, asked: asked, banned: x.sim.content().banned };
  var icon = "<svg viewBox='0 0 64 64'><path d='M20 44 Q32 10 44 44 Z' fill='none' stroke='#4FC3C8' stroke-width='3.5'/></svg>";
  function answer(svg) {
    return { pair: pair, kind: 'new', result: 'Проверочный туман', desc: 'Облако, которое легло на землю', category: 'погода', glyph: 'cloud', colors: [5, 6], svg: svg };
  }
  var v = x.sim.validateAnswer(tree, answer(icon), o);
  t.ok(v.el, 'ответ со значком отвергнут: ' + v.why);
  t.ok(v.el.svg && v.el.svg.indexOf('<svg xmlns=') === 0, 'значок не сохранён очищенным');
  var bad = x.sim.validateAnswer(tree, answer(icon.replace('#4FC3C8', '#123456')), o);
  t.ok(bad.el && !bad.el.svg && bad.el.glyph === 'cloud', 'значок с чужим цветом не отброшен или элемент потерян');
  t.ok(x.sim.SCHEMA.fields.svg.palette.length === 16, 'палитра значка не из content/palette.json');
};

exports['камень: Книга остаётся, забег с нуля, слои открываются'] = function (t) {
  var x = load();
  var f = fresh(x, 5);
  var s = f.state;
  var keys = x.sim.tree().list.filter(function (e) { return e.src === 'base'; }).slice(0, 45).map(function (e) { return e.key; });
  keys.forEach(function (k) { if (!s.meta.book[k]) { s.meta.book[k] = 1; s.meta.bookN++; } });
  s.run.earned = '1e6';
  s.run.lv.fire = 30;
  var r = Core.prestige(x.sim, x.game, s, 'stone', f.ctx);
  t.ok(r.ok, 'камень не получен');
  t.equal(Big.str(s.layers.stone.currency), Big.str(Big.of(3)), 'камней за 10^6');
  t.equal(s.meta.bookN, 45, 'Книга после камня');
  t.equal(s.run.lv.fire || 0, 0, 'источники после камня');
  t.ok(s.meta.unlocks.transmute && s.meta.unlocks.cubes, 'слои 1 и 3 камней');
  t.equal(s.run.cubes.length, 2, 'два куба с начала цикла');
};

exports['сундук «Пассажира»: свитки и открытие'] = function (t) {
  var x = load();
  var f = fresh(x, 9);
  var before = f.state.meta.bookN;
  var c = x.sim.chest(f.state, Rng.make(4), x.cfg);
  t.ok(c.items.length >= 2, 'пустой сундук');
  t.equal(f.state.run.scroll.n, x.cfg['chest.scrolls'], 'свитков');
  t.equal(f.state.meta.bookN, before + 1, 'открытие из сундука');
};
