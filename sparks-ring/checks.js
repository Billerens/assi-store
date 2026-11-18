// Проверки «Искр в кольце»: стандартные проверки движка (без темпа покупок и престижа — их в игре
// нет) и свои: кольцо-ловушка, ложный тап, пропуск и жизни, рекорд после захода.
var kit = require('modules/games/engine/checks-kit.js');
var Rng = require('modules/games/engine/rng.js');
var Core = require('modules/games/engine/core.js');

/** Бот барабанит tap три раза в секунду: так и играет (tap — его удар). */
function play(state, ctx, sim) {
  if (!state.run.live) sim.begin(state, ctx.config, ctx.now);
  return 0;
}

var checks = kit.standard(__dirname, { pace: false, zeroOffline: true, play: play });
for (var name in checks) exports[name] = checks[name];

function load() {
  var id = kit.idOf(__dirname);
  var axiko = require('lib/axiko');
  var game = JSON.parse(axiko.files.read('modules/games/' + id + '/game.json'));
  game.id = id;
  var dir = 'modules/games/' + id;
  return { id: id, game: game, sim: require(dir + '/sim.js'), cfg: kit.configOf(game, dir), axiko: axiko };
}

exports['тап по встречной искре в полосе отражает её'] = function (t) {
  var x = load();
  var rng = Rng.make(3);
  var ctx = function (now) { return { now: now, config: x.cfg, rng: rng, mult: 1 }; };
  var now = 1000000;
  var state = Core.newState(x.game, x.sim, ctx(now));
  x.sim.begin(state, x.cfg, now);
  var sp = x.sim.spawn(state, x.cfg, true, rng);
  sp.f = (x.cfg['spark.zoneOuter'] + x.cfg['spark.zoneInner']) / 2;
  var r = x.sim.tap(state, x.cfg, now);
  t.equal(r.result, 'perfect', 'тап в середину полосы');
  t.equal(state.run.score, x.cfg['score.perfect'], 'очки за точный отскок');
  t.equal(state.run.reflected, 1, 'отражено');
  t.equal(state.run.combo, 1, 'комбо');
};

exports['искра вне полосы не отражается — перегрев'] = function (t) {
  var x = load();
  var rng = Rng.make(4);
  var ctx = function (now) { return { now: now, config: x.cfg, rng: rng, mult: 1 }; };
  var now = 2000000;
  var state = Core.newState(x.game, x.sim, ctx(now));
  x.sim.begin(state, x.cfg, now);
  var sp = x.sim.spawn(state, x.cfg, true, rng);
  sp.f = 1;
  var r = x.sim.tap(state, x.cfg, now);
  t.equal(r.result, 'empty', 'тап, когда искра ещё у края');
  t.ok(state.run.cooldownMs > 0, 'ядро перегрелось');
  t.equal(x.sim.tap(state, x.cfg, now).result, 'off', 'во время перегрева тап не считается');
};

exports['тап по улетающей искре снимает очко'] = function (t) {
  var x = load();
  var rng = Rng.make(5);
  var now = 3000000;
  var state = Core.newState(x.game, x.sim, { now: now, config: x.cfg, rng: rng, mult: 1 });
  x.sim.begin(state, x.cfg, now);
  state.run.score = 5;
  var sp = x.sim.spawn(state, x.cfg, false, rng);
  sp.f = 0.7;
  var r = x.sim.tap(state, x.cfg, now);
  t.equal(r.result, 'trap', 'ложный тап');
  t.equal(state.run.score, 5 - x.cfg['score.trap'], 'очки сняты');
  t.equal(state.run.wrong, 1, 'ложных тапов');
};

exports['пропущенная встречная искра отнимает жизнь, три — конец'] = function (t) {
  var x = load();
  var rng = Rng.make(6);
  var now = 4000000;
  var make = function (ms) { return { now: ms, config: x.cfg, rng: rng, mult: 1 }; };
  var state = Core.newState(x.game, x.sim, make(now));
  x.sim.begin(state, x.cfg, now);
  var i;
  for (i = 0; i < x.cfg['lives.start']; i++) {
    var sp = x.sim.spawn(state, x.cfg, true, rng);
    sp.f = 0.1;
    now += 100;
    x.sim.tick(state, 0.2, make(now));
  }
  t.equal(state.run.lives, 0, 'жизни кончились');
  t.ok(state.run.over, 'заход окончен');
  t.equal(state.run.missed, x.cfg['lives.start'], 'пропущено');
  t.equal(x.sim.tap(state, x.cfg, now).result, 'off', 'после конца тап не играет');
};

exports['рекорд остаётся после нового захода'] = function (t) {
  var x = load();
  var rng = Rng.make(8);
  var now = 5000000;
  var state = Core.newState(x.game, x.sim, { now: now, config: x.cfg, rng: rng, mult: 1 });
  x.sim.begin(state, x.cfg, now);
  state.run.score = 17;
  x.sim.finish(state, x.cfg, now, 'lives');
  t.equal(state.run.best, 17, 'рекорд записан');
  x.sim.begin(state, x.cfg, now);
  t.equal(state.run.score, 0, 'новый заход с нуля');
  t.equal(state.run.best, 17, 'рекорд на месте');
};

exports['темп растёт: искры летят чаще и быстрее'] = function (t) {
  var x = load();
  var rng = Rng.make(9);
  var now = 6000000;
  var state = Core.newState(x.game, x.sim, { now: now, config: x.cfg, rng: rng, mult: 1 });
  var slow = x.sim.travel(state.run, x.cfg);
  state.run.elapsedMs = 90000;
  var fast = x.sim.travel(state.run, x.cfg);
  t.ok(fast < slow, 'искра на 90-й секунде быстрее первой: ' + fast + ' против ' + slow);
  t.ok(fast >= x.cfg['spark.minTravelMs'], 'быстрее предела не летит');
};

exports['заход не копится, пока игра закрыта'] = function (t) {
  var x = load();
  var rng = Rng.make(10);
  var now = 7000000;
  var state = Core.newState(x.game, x.sim, { now: now, config: x.cfg, rng: rng, mult: 1 });
  x.sim.begin(state, x.cfg, now);
  var before = JSON.stringify(state.run);
  var r = x.sim.offline(state, 3600, { now: now + 3600000, config: x.cfg, rng: rng, mult: 1, offline: true });
  t.equal(JSON.stringify(state.run), before, 'офлайн ничего не меняет');
  t.ok(!(r && r.gains && r.gains.length), 'начислений нет');
};
