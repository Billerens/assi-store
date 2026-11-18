// The checks of «Словоплёт» (module_check with 'games/word-weaver'): the engine's standard ones with a
// bot that plays words of the dictionary, then the game's own. Strict ES5: this runs in Rhino.
// The pace of a week (the first new city) is checked on the computer (tests/economy.test.js); here
// the bot plays the first five minutes of the spec.
var kit = require('../engine/checks-kit.js');
var Big = require('../engine/big.js');
var Rng = require('../engine/rng.js');
var Core = require('../engine/core.js');
var Lex = require('./lexicon.js');
var Dictionary = require('./dictionary.js');

var DICT = 'data/games/word-weaver/assets/dict.txt';
var LEX = null;

function lexicon() {
  if (!LEX) LEX = Lex.parse(Dictionary.read(require('lib/axiko').files));
  return LEX;
}

// The bot (bot.js) types one word every 10 seconds of play, a rare one now and then — the pace of
// the spec: five minutes, two sets of six letters; a week, about 2 000 words.
var BOT = null;

function play(state, ctx, sim, taps) {
  if (!BOT) BOT = require('./bot.js').make(lexicon(), { every: 10 });
  return BOT.play(state, ctx, sim, taps);
}

var checks = kit.standard(__dirname, { play: play, pace: false, setupSec: 300 });
for (var name in checks) exports[name] = checks[name];

function load() {
  var id = kit.idOf(__dirname);
  var axiko = require('lib/axiko');
  var game = JSON.parse(axiko.files.read('modules/games/' + id + '/game.json'));
  game.id = id;
  var sim = require('modules/games/' + id + '/sim.js');
  return { game: game, sim: sim, cfg: kit.configOf(game, 'modules/games/' + id) };
}

function ctxOf(cfg, rng, now) {
  return { now: now, config: cfg, rng: rng, mult: 1, links: {}, stock: {}, offline: false, capBonusHours: 0 };
}

exports['словарь на месте и без имён из контрольного списка'] = function (t) {
  var lex = lexicon();
  t.ok(lex.size > 20000, 'слов в словаре: ' + lex.size);
  var axiko = require('lib/axiko');
  var list = [];
  try {
    list = axiko.files.read('modules/games/' + kit.idOf(__dirname) + '/tools/control.txt').split('\n');
  } catch (ignored) { list = ['иван', 'москва', 'россия', 'сбербанк']; }
  var leaked = list.map(function (w) { return Lex.key(w.replace(/#.*/, '').trim()); }).filter(function (k) { return k && Lex.has(lex, k); });
  t.equal(leaked.join(', '), '', 'имена и города в словаре');
};

exports['ё и е: «лён» и «лен» — одно слово, показывается с ё'] = function (t) {
  var lex = lexicon();
  t.ok(Lex.has(lex, 'лен'), 'нет «лён»');
  t.equal(Lex.shown(lex, Lex.key('лён')), 'лён', 'показ');
  t.equal(Lex.key('Ёлка'), 'елка', 'ключ');
};

exports['генератор: 50 наборов по 8–40 обычных слов'] = function (t) {
  var x = load();
  var lex = lexicon();
  var rng = Rng.make(4);
  var o = { top: x.cfg['dict.commonTop'], lenMin: 6, lenMax: 9, min: x.cfg['sets.min'], max: x.cfg['sets.max'], needLong: x.cfg['sets.needLong'], avoid: {}, tries: x.cfg['sets.tries'] };
  var t0 = Date.now();
  for (var i = 0; i < 50; i++) {
    var s = Lex.generate(lex, rng, o);
    t.ok(s, 'набор ' + i + ' не собрался');
    t.ok(s.common >= x.cfg['sets.min'] && s.common <= x.cfg['sets.max'], 'обычных слов ' + s.common);
    t.ok(s.letters.length >= 6 && s.letters.length <= 9 && s.letters.indexOf('ё') < 0, 'буквы ' + s.letters);
    o.avoid[s.seed] = true;
  }
  t.ok((Date.now() - t0) / 50 < 1000, 'набор дольше секунды');
};

exports['темп: первые пять минут'] = function (t) {
  var x = load();
  var rng = Rng.make(11);
  var now = Date.UTC(2026, 10, 2, 8, 0, 0);
  var state = Core.newState(x.game, x.sim, ctxOf(x.cfg, rng, now));
  var firstBuy = null;
  for (var s = 0; s < 300; s++) {
    var bought = play(state, ctxOf(x.cfg, rng, now), x.sim, 3);
    x.sim.tick(state, 1, ctxOf(x.cfg, rng, now));
    now += 1000;
    if (bought && firstBuy === null) firstBuy = s + 1;
  }
  t.ok(firstBuy !== null && firstBuy <= 10, 'первая изба на ' + firstBuy + ' с, нужно не позже 10');
  t.ok(state.run.closed >= 2, 'закрыто наборов: ' + state.run.closed);
  t.ok(x.sim.lvl(state, 'izba') >= 3, 'изб: ' + x.sim.lvl(state, 'izba'));
  t.ok(x.sim.lvl(state, 'workshop') >= 1, 'мастерских: ' + x.sim.lvl(state, 'workshop'));
  t.equal(Core.validate(state, x.game), null, 'состояние');
};

exports['Новый город: слава, альбом остаётся'] = function (t) {
  var x = load();
  var rng = Rng.make(5);
  var ctx = ctxOf(x.cfg, rng, Date.now());
  var state = Core.newState(x.game, x.sim, ctx);
  state.meta.album = { 'кот': [1, 0] };
  state.meta.albumCount = 1;
  state.run.quarters = ['sloboda', 'craft', 'trade', 'uni', 'quay', 'forms', 'old'];
  state.run.maxResidents = 2500;
  var r = Core.prestige(x.sim, x.game, state, 'city', ctx);
  t.ok(r.ok, 'новый город не начался');
  t.equal(Big.str(state.layers.city.currency), Big.str(Big.of(5)), 'слава');
  t.equal(state.meta.albumCount, 1, 'альбом');
  t.equal(state.run.quarters.length, 1, 'кварталы с начала');
  t.equal(state.run.cityPicked, false, 'вид города ждёт выбора');
};

exports['сундук «Пассажира»: налог и подсказка'] = function (t) {
  var x = load();
  var state = Core.newState(x.game, x.sim, ctxOf(x.cfg, Rng.make(9), Date.now()));
  state.run.b.izba = 3;
  var c = x.sim.chest(state, Rng.make(3), x.cfg);
  t.ok(c.items.length === 2 && Big.gt(c.items[0].amount, 0), 'пустой сундук');
  t.equal(state.run.hints.herald, x.cfg['chest.heralds'], 'подсказка Глашатая');
};
