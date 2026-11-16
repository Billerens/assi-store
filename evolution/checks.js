var kit = require('../engine/checks-kit.js');
var Big = require('../engine/big.js');
var Rng = require('../engine/rng.js');
var Core = require('../engine/core.js');

// The generic bot resets at the first possible gain in stage 4. This game's
// target is the deliberate first reset after Land, so pace is checked below.
var standard = kit.standard(__dirname, {
  pace: false,
  setupSec: 180,
  play: function (state, ctx, sim) { return sim.botPlay(state, ctx); }
});
for (var checkName in standard) exports[checkName] = standard[checkName];

function load() {
  var id = kit.idOf(__dirname);
  var assi = require('lib/assi');
  var game = JSON.parse(assi.files.read('modules/games/' + id + '/game.json'));
  game.id = id;
  return { game: game, sim: require('modules/games/' + id + '/sim.js'), cfg: kit.configOf(game, 'modules/games/' + id) };
}

function context(x, now, rng, offline) {
  return { now: now, config: x.cfg, rng: rng, mult: 1, links: {}, stock: {}, offline: !!offline, capBonusHours: 0 };
}

exports['темп: первые пять этапов и первая покупка'] = function (t) {
  var x = load();
  var rng = Rng.make(12345);
  var now = 1000000;
  var state = Core.newState(x.game, x.sim, context(x, now, rng));
  // Compare the base economy before a physical constant changes its intended pace.
  state.run.universeChoices = [];
  state.run.constant = 'balanced';
  var elapsed = 0;
  var firstBuy = null;
  var starts = [0];
  var durations = [];
  while (state.run.stage <= 5 && elapsed < 4 * 3600) {
    var bought = x.sim.botPlay(state, context(x, now, rng));
    if (bought && firstBuy === null) firstBuy = elapsed;
    now += 1000;
    elapsed++;
    x.sim.tick(state, 1, context(x, now, rng));
    if (x.sim.canAdvance(state, x.cfg)) {
      durations.push(elapsed - starts[starts.length - 1]);
      starts.push(elapsed);
      t.ok(x.sim.advance(state, context(x, now, rng)), 'переход этапа');
    }
  }
  t.ok(firstBuy !== null && firstBuy <= 10, 'первая покупка: ' + firstBuy + ' с');
  t.ok(durations.length >= 5, 'бот дошёл только до этапа ' + state.run.stage);
  var ranges = [[360, 480], [1200, 1500], [1500, 1800], [1800, 2400], [2400, 3600]];
  for (var i = 0; i < ranges.length; i++) t.ok(durations[i] >= ranges[i][0] && durations[i] <= ranges[i][1], 'этап ' + (i + 1) + ': ' + durations[i] + ' с');
  t.ok(elapsed >= 2.5 * 3600 && elapsed <= 3.5 * 3600, 'конец Суши: ' + elapsed + ' с');
  t.ok(Big.gte(x.sim.prestigeGain(state, 'universe', x.cfg), 1), 'нет Искр к первой вселенной');
};

exports['офлайн 8 ч не меняет этап и очередь мутаций ограничена'] = function (t) {
  var x = load();
  for (var stage = 1; stage <= 8; stage++) {
    var rng = Rng.make(100 + stage);
    var now = 1000000;
    var state = Core.newState(x.game, x.sim, context(x, now, rng));
    state.run.universeChoices = [];
    state.run.constant = 'balanced';
    x.sim.enterStage(state, context(x, now, rng), stage);
    var before = Big.of(state.run.resource);
    x.sim.offline(state, 8 * 3600, context(x, now + 8 * 3600000, rng, true));
    t.equal(state.run.stage, stage, 'офлайн перескочил этап ' + stage);
    t.ok(Big.gte(state.run.resource, before), 'ресурс уменьшился на этапе ' + stage);
    t.ok(state.run.pendingMutations.length <= 3, 'очередь мутаций больше 3');
    t.equal(Core.validate(state, x.game), null, 'невалидное состояние этапа ' + stage);
    if (x.sim.validate) t.equal(x.sim.validate(state), null, 'sim.validate этапа ' + stage);
  }
};

exports['сохранение воспроизводит детерминированное продолжение'] = function (t) {
  var x = load();
  var now = 1000000;
  var original = Core.newState(x.game, x.sim, context(x, now, Rng.make(55)));
  x.sim.enterStage(original, context(x, now, Rng.make(55)), 3);
  var restored = JSON.parse(JSON.stringify(original));
  var rngA = Rng.make(778);
  var rngB = Rng.make(778);
  for (var second = 1; second <= 240; second++) {
    x.sim.botPlay(original, context(x, now + second * 1000, rngA));
    x.sim.botPlay(restored, context(x, now + second * 1000, rngB));
    x.sim.tick(original, 1, context(x, now + second * 1000, rngA));
    x.sim.tick(restored, 1, context(x, now + second * 1000, rngB));
  }
  t.equal(JSON.stringify(original), JSON.stringify(restored), 'продолжение сохранения различается');
};

