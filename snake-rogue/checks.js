// The checks of «Змейка-рогалик» for module_check('games/snake-rogue'): the standard ones of the
// engine (the pace is a real-time run, not a clicker: tests/balance.test.js measures it with the
// bot) and its own — the rules that matter most (a blow, a bite, the end, the buffer of turns), a
// short run of the bot, the molt, the chest and the stock. Strict ES5: the engine runs it in Rhino.
var kit = require('../engine/checks-kit.js');
var Core = require('../engine/core.js');
var Rng = require('../engine/rng.js');
var Big = require('../engine/big.js');

/** A second of play for the standard checks: start a run, steer with the bot, go on after a pick. */
function play(state, ctx, sim, taps) {
  var cfg = ctx.config;
  var run = state.run;
  if (!run || run.phase === 'hub') sim.newRun(state, cfg, { seed: ctx.rng.int(1, 1000000000) });
  else if (run.phase === 'pick') sim.choose(state, cfg, 0);
  else if (run.phase === 'shop') sim.shopLeave(state, cfg);
  else if (run.phase === 'over') sim.toHub(state);
  else if (run.phase === 'play') {
    var d = sim.botThink(run, cfg, 0.15, 0, null);
    if (d >= 0) sim.turn(state, cfg, d);
  }
  return 0;
}

var checks = kit.standard(__dirname, { pace: false, zeroOffline: true, setupSec: 60, play: play });
for (var checkName in checks) exports[checkName] = checks[checkName];

function load() {
  var id = kit.idOf(__dirname);
  var axiko = require('lib/axiko');
  var game = JSON.parse(axiko.files.read('modules/games/' + id + '/game.json'));
  game.id = id;
  var sim = require('modules/games/' + id + '/sim.js');
  var cfg = kit.configOf(game, 'modules/games/' + id);
  var ctx = { now: Date.UTC(2026, 10, 14, 19, 0, 0), config: cfg, rng: Rng.make(31), mult: 1, links: {}, stock: {}, offline: false };
  return { game: game, sim: sim, cfg: cfg, ctx: ctx, state: Core.newState(game, sim, ctx) };
}

/** A run on an empty glade with the snake laid on the given cells [[x, y], …], head first. */
function laid(x, cells, dir) {
  x.sim.newRun(x.state, x.cfg, { seed: 7 });
  var run = x.state.run;
  var g = run.g;
  var empty = '';
  for (var i = 0; i < g.w * g.h; i++) empty += '.';
  g.grid = empty;
  g.food = [];
  g.curioAt = [];
  g.beetles = [];
  g.mice = [];
  g.holes = [];
  g.vines = [];
  g.rival = null;
  g.hawkOn = false;
  g.rockOn = false;
  g.exit = g.w * g.h - 1;
  run.body = cells.map(function (p) { return p[1] * g.w + p[0]; });
  run.pend = 0;
  run.dir = dir;
  run.count = 0;
  run.acc = 0;
  return run;
}

function step(x) { x.sim.tick(x.state, x.sim.period(x.state.run, x.cfg) + 0.001, x.ctx); }

exports['удар о стену: −3 звена и остановка'] = function (t) {
  var x = load();
  var run = laid(x, [[7, 0], [7, 1], [7, 2], [7, 3], [7, 4], [7, 5], [7, 6]], 0);
  step(x);
  t.equal(x.sim.length(run), 7 - x.cfg['hit.damage'], 'длина после удара');
  t.ok(run.stun > 0 && run.wait, 'змея стоит и ждёт направления');
  t.equal(run.phase, 'play', 'забег идёт');
};

exports['укус себя отрезает хвост'] = function (t) {
  var x = load();
  var run = laid(x, [[5, 5], [5, 6], [6, 6], [6, 5], [6, 4], [6, 3], [6, 2]], 1);
  step(x);
  t.equal(run.bites, 1, 'укус засчитан');
  t.equal(x.sim.length(run), 3, 'остались голова и два звена');
  t.equal(run.body[0], 5 * run.g.w + 6, 'голова на месте укуса');
};

exports['короче трёх звеньев — забег окончен'] = function (t) {
  var x = load();
  var run = laid(x, [[7, 0], [7, 1], [7, 2], [7, 3]], 0);
  step(x);
  t.equal(run.phase, 'over', 'забег окончен');
  t.equal(run.result.reason, 'short', 'причина');
  t.ok(Core.validate(x.state, x.game) === null, 'состояние после конца проходит проверку');
};

exports['два поворота запоминаются наперёд'] = function (t) {
  var x = load();
  var run = laid(x, [[7, 10], [7, 11], [7, 12]], 0);
  t.ok(x.sim.turn(x.state, x.cfg, 1), 'первый поворот');
  t.ok(x.sim.turn(x.state, x.cfg, 2), 'второй поворот');
  t.ok(!x.sim.turn(x.state, x.cfg, 3), 'третий не помещается');
  step(x);
  step(x);
  t.equal(run.body[0], 11 * run.g.w + 8, 'вправо, потом вниз');
};

exports['бот играет минуту без поломок'] = function (t) {
  var x = load();
  x.sim.newRun(x.state, x.cfg, { seed: 7 });
  var r = x.sim.botPlay(x.state, x.cfg, { maxSec: 60, dt: 1 / 20 });
  t.ok(r.sec > 30, 'бот погиб за ' + r.sec + ' с');
  t.ok(r.glades >= 1, 'бот не прошёл ни одной поляны');
  t.ok(x.state.run.phase === 'over', 'забег закрыт');
  t.equal(Core.validate(x.state, x.game), null, 'validate после забега');
  t.ok(JSON.stringify(x.state).indexOf('NaN') < 0, 'нет NaN');
};

exports['победа на верхней линьке открывает следующую'] = function (t) {
  var x = load();
  var m = x.sim.meta(x.state);
  m.ascend = true;
  x.state.run = { phase: 'hub', fxN: 0, fx: [] };
  var r = Core.prestige(x.sim, x.game, x.state, x.sim.LAYER, x.ctx);
  t.ok(r.ok, 'линька не прошла');
  t.equal(x.sim.moltTop(x.state), 1, 'открыта линька 1');
  t.ok(!x.sim.meta(x.state).ascend, 'право на линьку израсходовано');
  t.ok(Big.isZero(x.sim.prestigeGain(x.state, x.sim.LAYER, x.cfg)), 'вторая подряд не даётся');
};

exports['сундук «Пассажира» даёт чешуйки'] = function (t) {
  var x = load();
  var before = x.sim.scales(x.state);
  var c = x.sim.chest(x.state, Rng.make(3), x.cfg);
  t.ok(c.items.length && c.items[0].amount >= x.cfg['chest.min'], 'пустой сундук');
  t.equal(x.sim.scales(x.state), before + c.items[0].amount, 'чешуйки прибавились');
};

exports['запас: раскладки и способности без сети проходят проверку'] = function (t) {
  var x = load();
  var rng = Rng.make(5);
  for (var i = 0; i < 20; i++) {
    var gl = x.sim.procedural('glades', rng);
    t.equal(x.sim.validateStock('glades', gl), null, 'раскладка ' + i);
    var ab = x.sim.procedural('abilities', rng);
    t.equal(x.sim.validateStock('abilities', ab), null, 'способность ' + i);
  }
  t.ok(x.sim.validateStock('abilities', { title: 'Слишком', bricks: [{ brick: 'speed', value: 9 }] }) !== null, 'чужое значение отклонено');
};
