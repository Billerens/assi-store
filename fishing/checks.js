// The checks of «Рыбалка» (module_check with 'games/fishing'): the engine's standard ones with the
// game's own bot (sim.play: cast, autopilot fight, aquarium, shop), then the game's own checks.
// Strict ES5: this file runs in Rhino on the phone.
var kit = require('../engine/checks-kit.js');
var Big = require('../engine/big.js');
var Rng = require('../engine/rng.js');
var Core = require('../engine/core.js');

function play(state, ctx, sim, taps) {
  return sim.play(state, ctx);
}

var checks = kit.standard(__dirname, { play: play, pace: false, hz: 4, setupSec: 600 });
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

exports['темп: первая покупка до 10 с, первый сезон за неделю'] = function (t) {
  var x = load();
  var r = kit.bot(x.game, x.sim, x.cfg, { play: play, days: 7, hz: 4 });
  t.ok(r.firstBuySec !== null && r.firstBuySec <= 10, 'первая покупка на ' + r.firstBuySec + ' с');
  t.ok(r.prestiges.length > 0, 'за ' + r.trips + ' поездок ни одного нового сезона');
  var first = r.prestiges[0].trip;
  t.ok(first >= 6 && first <= 14, 'первый сезон в поездке ' + first + ', нужно 6–14 (неделя)');
};

exports['вываживание: доля пойманных ботом «до 80, до 50»'] = function (t) {
  var x = load();
  var k = x.sim.content();
  var bad = [];
  k.src.species.forEach(function (sp) {
    var gear = sp.rarity === 'legend' ? 10 : k.water[sp.water].gear;
    var state = Core.newState(x.game, x.sim, ctxOf(x.cfg, Rng.make(1), Date.now()));
    ['rod', 'reel', 'line', 'hook', 'float'].forEach(function (u) { state.run.up[u] = gear; });
    state.run.water = sp.water;
    var d = x.sim.zoneDistance(state, x.cfg, x.sim.ZONES.indexOf(sp.zone));
    var rng = Rng.make(42);
    var n = 120;
    var ok = 0;
    for (var i = 0; i < n; i++) {
      var w = Math.max(sp.avg * x.cfg['weight.min'], Math.min(sp.max, sp.avg * (0.6 + 0.8 * rng.next())));
      var out = x.sim.simulateFight(state, x.cfg, sp.id, w, d, rng);
      if (out === 'landed' || out === 'sold') ok++;
    }
    var rate = ok / n;
    if (sp.rarity === 'legend' ? rate < 0.25 : rate < 0.6 || rate > 0.9) bad.push(sp.id + ' ' + Math.round(rate * 100) + ' %');
  });
  t.ok(!bad.length, 'вне 60–90 % (легенды — от 25 % на снастях 10): ' + bad.join(', '));
};

exports['закрыть игру во время вываживания: рыба сошла, наживка не списана дважды'] = function (t) {
  var x = load();
  var now = Date.UTC(2026, 10, 3, 6, 0, 0);
  var rng = Rng.make(3);
  var state = Core.newState(x.game, x.sim, ctxOf(x.cfg, rng, now));
  state.run.bait.bloodworm = 5;
  x.sim.setBait(state, 'bloodworm');
  x.sim.throwAt(state, x.cfg, now, rng, 0.5, true);
  t.equal(state.run.bait.bloodworm, 4, 'мотыль списан при забросе');
  for (var i = 0; i < 400 && state.run.cast.phase !== 'fight'; i++) x.sim.tick(state, 0.05, ctxOf(x.cfg, rng, now + i * 50));
  t.equal(state.run.cast.phase, 'fight', 'дошло до вываживания');
  var saved = Core.pick([{ json: JSON.stringify(state), seq: 1, source: 'check' }], x.game, x.sim).state;
  t.ok(saved, 'сохранение посреди вываживания читается');
  var p = Core.plan(now, now + 30000, x.cfg, 0);
  Core.runOffline(x.sim, saved, x.game, p, null, function (seg) { return ctxOf(x.cfg, Rng.make(1), seg.to); }, x.cfg);
  t.equal(saved.run.cast.phase, 'idle', 'заброс закончен');
  t.equal(saved.run.pending, null, 'рыба не на карточке');
  t.equal(saved.run.bait.bloodworm, 4, 'мотыль не списан второй раз');
  t.equal(saved.run.away.lost, 1, 'сход записан в сводку');
  Core.runOffline(x.sim, saved, x.game, Core.plan(now + 30000, now + 90000, x.cfg, 0), null, function (seg) { return ctxOf(x.cfg, Rng.make(1), seg.to); }, x.cfg);
  t.equal(saved.run.bait.bloodworm, 4, 'и после второго запуска тоже');
};

exports['новый сезон: мастерство, что сбрасывается и что остаётся'] = function (t) {
  var x = load();
  var now = Date.now();
  var ctx = ctxOf(x.cfg, Rng.make(5), now);
  var state = Core.newState(x.game, x.sim, ctx);
  state.run.released = x.cfg['mastery.threshold'] * 9;
  t.equal(Big.str(x.sim.prestigeGain(state, 'season', x.cfg)), Big.str(Big.ZERO), 'сезон закрыт, пока не открыты шесть водоёмов');
  state.run.waters = ['pond', 'river', 'lake', 'swamp', 'creek', 'bay'];
  state.meta.journal.karas = { n: 3, best: 0.9, first: now };
  t.equal(Big.str(x.sim.prestigeGain(state, 'season', x.cfg)), Big.str(Big.of(3)), 'floor(sqrt(45000 / 5000)) = 3');
  var r = Core.prestige(x.sim, x.game, state, 'season', ctx);
  t.ok(r.ok, 'сезон не начался');
  t.equal(state.run.waters.join(), 'pond', 'водоёмы с нуля');
  t.equal(state.meta.journal.karas.best, 0.9, 'рекорд остался');
  t.equal(x.sim.seasonOf(state), 2, 'второй сезон');
  t.equal(x.sim.waterLock(state, x.cfg, 'ice'), 'сначала «Морской залив»', 'подлёдное — после залива');
};

exports['сезонная легенда проверяется по пределам настроек'] = function (t) {
  var x = load();
  var item = x.sim.procedural('legends', Rng.make(7));
  t.equal(x.sim.validateStock('legends', item), null, 'своя легенда проходит');
  var heavy = JSON.parse(JSON.stringify(item));
  heavy.avg = x.cfg['legend.avgMax'] * 2;
  t.ok(x.sim.validateStock('legends', heavy) !== null, 'слишком тяжёлая не проходит');
  var strong = JSON.parse(JSON.stringify(item));
  strong.power = x.cfg['legend.powerMax'] + 1;
  t.ok(x.sim.validateStock('legends', strong) !== null, 'слишком сильная не проходит');
  t.ok(x.sim.validateStock('notes', { about: 'nobody', text: 'запись о ником из списка' }) !== null, 'запись не о виде не проходит');
};
