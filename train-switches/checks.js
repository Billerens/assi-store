// The checks of «Ветки поездов» (module_check with 'games/train-switches'): the engine's standard
// ones (no pace check — the game has no purchases by the second and no prestige; no offline income),
// then the game's own: the stored levels are solved by their solutions, the dispatcher of the
// endless run loses nothing when its plan is followed, tokens come only for new stars, the chest,
// the level of the day is the same for one seed.
var kit = require('../engine/checks-kit.js');
var Rng = require('../engine/rng.js');
var Core = require('../engine/core.js');

/** The bot's second: a solved level and an endless run that goes on (for the save round trip). */
function play(state, ctx, sim) {
  if (!state.run.stars['1-1']) sim.award(state, ctx.config, { id: '1-1', kinds: ['m'], mode: 'chapter' }, 3);
  if (!state.run.live && !state.run.result) sim.startEndless(state, ctx.config, ctx.rng, {});
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
  return {
    id: id, dir: dir, axiko: axiko, game: game, sim: require(dir + '/sim.js'), rails: require(dir + '/rails.js'),
    endless: require(dir + '/endless.js'), cfg: kit.configOf(game, dir)
  };
}

function pad(n) { return n < 10 ? '0' + n : String(n); }

exports['уровни глав решаются своим решением'] = function (t) {
  var x = load();
  var count = 0;
  for (var ch = 1; ch <= 10; ch++) {
    var list = JSON.parse(x.axiko.files.read(x.dir + '/content/levels-' + pad(ch) + '.json'));
    t.equal(list.length, 15, 'уровней в главе ' + ch);
    for (var i = 0; i < list.length; i++) {
      var lv = list[i];
      var r = x.rails.simulate(lv, lv.sol, { trace: false, paths: false });
      t.ok(r.win, 'уровень ' + lv.id + ' не решается своим решением: ' + r.reason);
      if (i > 0) t.ok(lv.d >= list[i - 1].d, 'сложность главы ' + ch + ' убывает на уровне ' + lv.id);
      count++;
    }
  }
  t.equal(count, 150, 'уровней всего');
};

exports['бесконечный: бот по плану диспетчера не теряет поездов'] = function (t) {
  var x = load();
  var live = x.endless.create(x.cfg, Rng.make(31), { signals: 50 });
  t.ok(live, 'сеть не собралась');
  var hr = Rng.make(7);
  var guard = 0;
  while (live.delivered < 300 && guard++ < 20000) {
    x.endless.botTurn(live);
    if (hr.chance(0.02) && live.trains.length) {
      x.endless.hold(live, x.cfg, live.trains[hr.int(live.trains.length)].id);
      x.endless.botTurn(live);
    }
    x.endless.step(live, x.cfg, {});
  }
  t.equal(live.crashes, 0, 'столкновения');
  t.equal(live.wrong, 0, 'чужие станции');
  t.ok(live.delivered >= 300, 'доставлено ' + live.delivered);
};

exports['жетоны только за новые звёзды'] = function (t) {
  var x = load();
  var state = Core.newState(x.game, x.sim, { now: Date.now(), config: x.cfg, rng: Rng.make(3), mult: 1 });
  var a = x.sim.award(state, x.cfg, { id: '2-3', kinds: ['m'], mode: 'chapter' }, 2);
  var b = x.sim.award(state, x.cfg, { id: '2-3', kinds: ['m'], mode: 'chapter' }, 2);
  var c = x.sim.award(state, x.cfg, { id: '2-3', kinds: ['m'], mode: 'chapter' }, 3);
  t.equal(a.tokens, 2 * x.cfg['tokens.perStar'], 'первые две звезды');
  t.equal(b.tokens, 0, 'те же звёзды второй раз');
  t.equal(c.tokens, x.cfg['tokens.perStar'], 'третья звезда');
  t.equal(x.sim.tokens(state), 3 * x.cfg['tokens.perStar'], 'всего жетонов');
};

exports['сундук пассажира: жетоны и подсказка'] = function (t) {
  var x = load();
  var state = Core.newState(x.game, x.sim, { now: Date.now(), config: x.cfg, rng: Rng.make(9), mult: 1 });
  var loot = x.sim.chest(state, Rng.make(4), x.cfg);
  t.equal(x.sim.tokens(state), x.cfg['chest.tokens'], 'жетоны сундука');
  t.equal(state.run.up.hint, x.cfg['chest.hints'], 'заряд подсказки');
  t.ok(loot.items.length === 2, 'строки сундука');
};

exports['уровень дня одинаков у одного зерна'] = function (t) {
  var x = load();
  var chapters = JSON.parse(x.axiko.files.read(x.dir + '/content/chapters.json'));
  var a = x.rails.seeded('daily:2026-11-14', chapters.daily, null, 120);
  var b = x.rails.seeded('daily:2026-11-14', chapters.daily, null, 120);
  t.ok(a && b, 'уровень дня не собрался');
  t.equal(JSON.stringify(a.nodes) + JSON.stringify(a.trains), JSON.stringify(b.nodes) + JSON.stringify(b.trains), 'два уровня одного дня');
};
