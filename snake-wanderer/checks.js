// Проверки игры в Игротеке: module_check('games/snake-wanderer').
// Стандартные проверки движка и свои. Темп и офлайн-доход не проверяются: игра идёт только
// пока в неё играют, покупок «в первые десять секунд» и престижа в ней нет.
var kit = require('../engine/checks-kit.js');
var Rng = require('../engine/rng.js');
var Core = require('../engine/core.js');

var checks = kit.standard(__dirname, { pace: false, zeroOffline: true, play: function () { return 0; } });
for (var name in checks) exports[name] = checks[name];

function load() {
  var id = kit.idOf(__dirname);
  var axiko = require('lib/axiko');
  var game = JSON.parse(axiko.files.read('modules/games/' + id + '/game.json'));
  game.id = id;
  var sim = require('modules/games/' + id + '/sim.js');
  return { game: game, sim: sim, cfg: kit.configOf(game, 'modules/games/' + id) };
}

exports['сундук «Пассажира» даёт осколки'] = function (t) {
  var x = load();
  var ctx = { now: Date.now(), config: x.cfg, rng: Rng.make(9), mult: 1 };
  var state = Core.newState(x.game, x.sim, ctx);
  var c = x.sim.chest(state, Rng.make(3), x.cfg);
  t.ok(c.items.length === 1 && c.items[0].amount >= x.cfg['chest.shards'], 'в сундуке мало осколков');
  t.equal(state.meta.shards, c.items[0].amount, 'осколки не прибавились');
  t.equal(x.sim.validate(state), null, 'состояние после сундука не проходит проверку');
};

exports['строка каталога меняется после забега'] = function (t) {
  var x = load();
  var ctx = { now: Date.now(), config: x.cfg, rng: Rng.make(1), mult: 1 };
  var state = Core.newState(x.game, x.sim, ctx);
  t.ok(/ждёт/.test(x.sim.summary(state, x.cfg).line), 'новая игра: в строке должно быть про ожидание');
  state.meta.shards = 120;
  state.meta.save = { shards: 120, circle: 1, stats: { runs: 3 } };
  var line = x.sim.summary(state, x.cfg).line;
  t.ok(/120/.test(line) && /забегов 3/.test(line) && /круг 2/.test(line), 'строка каталога: ' + line);
};

exports['на диске есть картинки и библиотека'] = function (t) {
  var axiko = require('lib/axiko');
  var id = kit.idOf(__dirname);
  t.ok(axiko.files.exists('modules/games/' + id + '/ui/img/items/fang.webp'), 'нет картинок предметов в modules/games/' + id + '/ui/img/items');
  t.ok(axiko.files.exists('modules/games/' + id + '/vendor/three-0.160.0/three.module.js'), 'нет библиотеки three в vendor/ игры');
};
