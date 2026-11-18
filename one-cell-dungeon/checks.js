// The checks of «Подземелье в одну клетку» (module_check with 'games/one-cell-dungeon'): the engine's
// standard ones with the game's own bot, then the rules that matter most. Strict ES5 (Rhino).
var kit = require('../engine/checks-kit.js');
var Rng = require('../engine/rng.js');
var Core = require('../engine/core.js');

/** The standard checks' bot: a descent of its own, a few decisions a second. */
function play(state, ctx, sim, taps) {
  var cfg = {};
  for (var k in ctx.config) cfg[k] = ctx.config[k];
  cfg['fair.runs'] = 0;
  if (state.run.phase === 'hub' || state.run.phase === 'over') {
    sim.toHub(state);
    sim.startRun(state, cfg, { seed: ctx.rng.int(1, 2147483646) });
  }
  for (var i = 0; i < Math.min(taps, 3); i++) sim.botTurn(state, cfg, 'smart', ctx.rng, 1);
  return 0;
}

var checks = kit.standard(__dirname, { pace: false, zeroOffline: true, play: play, setupSec: 5 });
for (var name in checks) exports[name] = checks[name];

function load() {
  var id = kit.idOf(__dirname);
  var axiko = require('lib/axiko');
  var game = JSON.parse(axiko.files.read('modules/games/' + id + '/game.json'));
  game.id = id;
  var sim = require('modules/games/' + id + '/sim.js');
  var cfg = kit.configOf(game, 'modules/games/' + id);
  var quick = {};
  for (var k in cfg) quick[k] = cfg[k];
  quick['fair.runs'] = 0;
  return { game: game, sim: sim, cfg: cfg, quick: quick };
}

exports['бой: урон «сила минус оружие», оружие теряет заряд'] = function (t) {
  var x = load();
  var state = Core.newState(x.game, x.sim, { now: Date.now(), config: x.cfg, rng: Rng.make(3), mult: 1 });
  x.sim.startRun(state, x.quick, { seed: 5 });
  var run = state.run;
  run.grid = [null, { k: 'foe', e: 'mold', v: 5, v0: 5, u: 900 }, null, null, null, null, null, null, null];
  run.pos = 4;
  run.hp = 12;
  run.shield = 0;
  run.wpn = { s: 3, c: 2, n: 1 };
  x.sim.move(state, x.quick, 1, 1);
  t.equal(run.hp, 10, 'здоровье после боя');
  t.equal(run.wpn.c, 1, 'заряды оружия');
  t.equal(Core.validate(state, x.game), null, 'состояние после хода');
};

exports['короткий спуск бота: без NaN, сохранение читается'] = function (t) {
  var x = load();
  var state = Core.newState(x.game, x.sim, { now: Date.now(), config: x.cfg, rng: Rng.make(4), mult: 1 });
  var result = x.sim.botRun(state, x.quick, 'smart', 17, { mult: 1 });
  t.ok(result && result.floors >= 0, 'нет итога спуска');
  t.ok(result.embers.total >= 0, 'угли за спуск');
  t.equal(Core.validate(state, x.game), null, 'состояние после спуска');
  t.equal(x.sim.validate(state), null, 'sim.validate после спуска');
  var picked = Core.pick([{ json: JSON.stringify(state), seq: 1, source: 'check' }], x.game, x.sim);
  t.ok(picked.state, 'сохранение не читается');
};

exports['честность раздачи: проверка ботом на этаже'] = function (t) {
  var x = load();
  var cfg = {};
  for (var k in x.cfg) cfg[k] = x.cfg[k];
  cfg['fair.runs'] = 40;
  var state = { run: { phase: 'hub' }, layers: {}, meta: x.sim.freshMeta() };
  x.sim.startRun(state, cfg, { seed: 21 });
  t.ok(state.run.fair && state.run.fair.rate >= 0 && state.run.fair.rate <= 1, 'нет доли выживших');
};
