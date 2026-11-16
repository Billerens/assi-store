// The checks of «Сад» (module_check runs them with 'games/garden'): the engine's standard ones
// (a new game, a save round trip, 12 hours of offline by the formula and by steps, no network,
// the screen) plus the game's own: the exact rules of inheritance, the mutation rate, what the
// start seeds reach, the album of 258, the pace of the first move (3–5 days of two trips).
var kit = require('../engine/checks-kit.js');
var Big = require('../engine/big.js');
var Rng = require('../engine/rng.js');
var Core = require('../engine/core.js');

function play(state, ctx, sim, taps) { return sim.botPlay(state, ctx, sim, taps); }

var checks = kit.standard(__dirname, { play: play, pace: false, setupSec: 300 });
for (var name in checks) exports[name] = checks[name];

function load() {
  var id = kit.idOf(__dirname);
  var assi = require('lib/assi');
  var game = JSON.parse(assi.files.read('modules/games/' + id + '/game.json'));
  game.id = id;
  var sim = require('modules/games/' + id + '/sim.js');
  return { game: game, sim: sim, cfg: kit.configOf(game, 'modules/games/' + id) };
}

/** A genotype of Луноцвет from its colour, shape and pattern pairs (the rest: the start tail). */
function moon(sim, color, shape, pattern) {
  return color + shape + pattern + '+-+---nn12';
}

exports['генетика: RY × RY дают 1 : 2 : 1'] = function (t) {
  var x = load();
  var rng = Rng.make(42);
  var g = moon(x.sim, 'RY', 'sb', 'pq');
  var c = { RR: 0, RY: 0, YY: 0 };
  var total = 10000;
  for (var i = 0; i < total; i++) {
    var child = x.sim.crossGenes('moon', g, g, rng, 0, x.cfg).g;
    var p = child.substr(0, 2).split('').sort().join('');
    if (p === 'RY') c.RY++;
    else c[p]++;
  }
  t.ok(Math.abs(c.RR / total - 0.25) < 0.02, 'RR ' + c.RR);
  t.ok(Math.abs(c.RY / total - 0.5) < 0.02, 'RY ' + c.RY);
  t.ok(Math.abs(c.YY / total - 0.25) < 0.02, 'YY ' + c.YY);
};

exports['генетика: облик по таблице'] = function (t) {
  var x = load();
  var s = x.sim;
  t.equal(s.colorOf('RY'), 'orange', 'RY');
  t.equal(s.colorOf('RB'), 'purple', 'RB');
  t.equal(s.colorOf('YB'), 'green', 'YB');
  t.equal(s.colorOf('RW'), 'red', 'RW');
  t.equal(s.colorOf('WW'), 'white', 'WW');
  t.equal(s.colorOf('LL'), 'glow', 'LL');
  t.equal(s.colorOf('LB'), 'blue', 'LB');
  t.equal(s.colorOf('LN'), 'white', 'LN');
  t.equal(s.shapeOf('sb'), 'star', 'sb');
  t.equal(s.shapeOf('br'), 'bell', 'br');
  t.equal(s.shapeOf('rr'), 'round', 'rr');
  t.equal(s.shapeOf('rk'), 'round', 'rk');
  t.equal(s.shapeOf('kk'), 'crystal', 'kk');
  t.equal(s.patternOf('pq'), 'solid', 'pq');
  t.equal(s.patternOf('qq'), 'stripes', 'qq');
  t.equal(s.patternOf('dd'), 'dots', 'dd');
  t.equal(s.patternOf('qd'), 'net', 'qd');
  t.equal(s.patternOf('gg'), 'gold', 'gg');
  t.equal(s.patternOf('gd'), 'dots', 'gd');
};

exports['мутации: частота около μ'] = function (t) {
  var x = load();
  var rng = Rng.make(7);
  var g = moon(x.sim, 'RW', 'sr', 'pq');
  var genes = 0;
  var hit = 0;
  for (var i = 0; i < 20000; i++) {
    var r = x.sim.crossGenes('moon', g, g, rng, 0.004, x.cfg);
    genes += 8;
    hit += r.mutated.length;
  }
  var rate = hit / genes;
  t.ok(Math.abs(rate - 0.004) < 0.0008, 'частота ' + rate);
};

exports['достижимость: из стартовых семян 7 цветов, 3 формы, 4 узора'] = function (t) {
  var x = load();
  var seeds = x.sim.startSeeds(x.cfg, 'moon');
  // Genes are inherited independently: the closure of each gene's allele pairs under crossing.
  function closure(gi) {
    var seen = {};
    var list = [];
    seeds.forEach(function (g) {
      var p = g.substr(gi * 2, 2);
      if (!seen[p]) { seen[p] = 1; list.push(p); }
    });
    for (var a = 0; a < list.length; a++) {
      for (var b = 0; b <= a; b++) {
        for (var i = 0; i < 2; i++) {
          for (var j = 0; j < 2; j++) {
            var c = list[a].charAt(i) + list[b].charAt(j);
            if (!seen[c]) { seen[c] = 1; list.push(c); }
          }
        }
      }
    }
    return list;
  }
  var colors = {};
  var shapes = {};
  var patterns = {};
  closure(0).forEach(function (p) { colors[x.sim.colorOf(p)] = 1; });
  closure(1).forEach(function (p) { shapes[x.sim.shapeOf(p)] = 1; });
  closure(2).forEach(function (p) { patterns[x.sim.patternOf(p)] = 1; });
  t.equal(Object.keys(colors).length, 7, 'цвета: ' + Object.keys(colors).join(', '));
  t.equal(Object.keys(shapes).length, 3, 'формы: ' + Object.keys(shapes).join(', '));
  t.equal(Object.keys(patterns).length, 4, 'узоры: ' + Object.keys(patterns).join(', '));
};

exports['альбом: 258 записей'] = function (t) {
  var x = load();
  var all = x.sim.albumKeys('moon').concat(x.sim.albumKeys('sun'), x.sim.albumKeys('fan'));
  t.equal(all.length, 258, 'записей');
  var uniq = {};
  all.forEach(function (k) { uniq[k] = 1; });
  t.equal(Object.keys(uniq).length, 258, 'без повторов');
};

exports['темп: первый переезд за 3–5 дней по две поездки'] = function (t) {
  var x = load();
  var r = kit.bot(x.game, x.sim, x.cfg, { play: play, days: 5 });
  t.ok(r.firstBuySec !== null && r.firstBuySec <= 10, 'первая покупка на ' + r.firstBuySec + ' с');
  t.ok(r.prestiges.length > 0, 'за ' + r.trips + ' поездок ни одного переезда');
  var first = r.prestiges[0].trip;
  t.ok(first >= 6 && first <= 10, 'первый переезд в поездке ' + first + ', нужно 6–10');
  t.equal(x.sim.validate(r.state), null, 'sim.validate после пяти дней');
  t.equal(Core.validate(r.state, x.game), null, 'validate после пяти дней');
};

exports['перевод часов назад: ноль, не минус'] = function (t) {
  var x = load();
  var now = Date.UTC(2026, 10, 2, 8, 0, 0);
  var p = Core.plan(now, now - 3600000, x.cfg, 0);
  t.equal(p.creditedMs, 0, 'засчитано при часах назад');
  var state = Core.newState(x.game, x.sim, { now: now, config: x.cfg, rng: Rng.make(3), mult: 1, links: {}, stock: {} });
  var before = JSON.stringify(state.run.beds);
  x.sim.tick(state, 0, { now: now, config: x.cfg, rng: Rng.make(3), mult: 1, links: {}, stock: {} });
  t.equal(JSON.stringify(state.run.beds), before, 'грядки при нулевом шаге');
  t.ok(Big.gte(state.run.coins, 0), 'монеты не меньше нуля');
};
