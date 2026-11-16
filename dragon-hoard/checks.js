// The checks of «Сокровищница дракона» (module_check with 'games/dragon-hoard'): the engine's
// standard ones with the game's own bot (it holds the power at 80 % against the next knight, buys
// servants, flies short raids), then the game's own rules.
var kit = require('../engine/checks-kit.js');
var Big = require('../engine/big.js');
var Rng = require('../engine/rng.js');
var Core = require('../engine/core.js');

function play(state, ctx, sim, taps) {
  return sim.botPlay(state, ctx.config, ctx.now, ctx.rng, {});
}

// The first sleep comes on the first day (spec «Темп»): with the nine hours between the trips the
// pile reaches 1e8 at the start of the second trip or in the third.
var checks = kit.standard(__dirname, { play: play, firstBuySec: 10, prestigeTrips: [2, 3], setupSec: 900 });
for (var name in checks) exports[name] = checks[name];

var HOUR = 3600000;

function load() {
  var id = kit.idOf(__dirname);
  var assi = require('lib/assi');
  var game = JSON.parse(assi.files.read('modules/games/' + id + '/game.json'));
  game.id = id;
  game.currencies = game.currencies || [];
  game.prestige = game.prestige || [];
  game.achievements = game.achievements || [];
  var sim = require('modules/games/' + id + '/sim.js');
  return { game: game, sim: sim, cfg: kit.configOf(game, 'modules/games/' + id) };
}

function ctxOf(x, now, rng, offline) {
  return { now: now, config: x.cfg, rng: rng || Rng.make(1), mult: 1, links: {}, stock: {}, offline: !!offline, capBonusHours: 0 };
}

exports['сон на век: Древность по самой большой куче'] = function (t) {
  var x = load();
  var now = Date.UTC(2026, 10, 2, 8, 0, 0);
  var state = Core.newState(x.game, x.sim, ctxOf(x, now, Rng.make(5)));
  t.equal(Big.str(x.sim.prestigeGain(state, 'sleep', x.cfg)), Big.str(Big.ZERO), 'без кучи 1e8 сна нет');
  state.run.hmax = Big.str(Big.of('1e10'));
  state.run.gold = Big.str(Big.of('1e3'));
  state.run.servants[0] = 12;
  state.layers.sleep.state.halls.nest = 3;
  t.equal(Big.str(x.sim.prestigeGain(state, 'sleep', x.cfg)), Big.str(Big.of(4)), '1e10 даёт 4 Древности');
  var r = Core.prestige(x.sim, x.game, state, 'sleep', ctxOf(x, now, Rng.make(6)));
  t.ok(r.ok, 'сон не прошёл');
  t.equal(Big.str(state.layers.sleep.currency), Big.str(Big.of(4)), 'Древность после сна');
  t.equal(state.run.servants[0], 0, 'слуги после сна');
  t.equal(state.layers.sleep.state.sleeps, 1, 'счёт снов');
  t.equal(state.layers.sleep.state.halls.nest, 1, 'залы наполовину');
  t.equal(x.sim.ageIndex(state, x.cfg), 1, 'возраст «Взрослый» после первого сна');
  t.equal(state.meta.chronicle.length, 1, 'запись хроники');
};

exports['новая кладка: Кровь и вид дракона'] = function (t) {
  var x = load();
  var now = Date.UTC(2026, 10, 2, 8, 0, 0);
  var state = Core.newState(x.game, x.sim, ctxOf(x, now, Rng.make(7)));
  state.layers.sleep.state.sleeps = x.cfg['age.legend'];
  state.layers.sleep.currency = Big.str(Big.of(400));
  state.meta.trophies = { helm: 2 };
  t.equal(Big.str(x.sim.prestigeGain(state, 'clutch', x.cfg)), Big.str(Big.of(4)), 'sqrt(400 / 25) = 4');
  var r = Core.prestige(x.sim, x.game, state, 'clutch', ctxOf(x, now, Rng.make(8)));
  t.ok(r.ok, 'кладка не прошла');
  t.equal(Big.str(state.layers.sleep.currency), Big.str(Big.ZERO), 'Древность сброшена');
  t.equal(x.sim.ageIndex(state, x.cfg), 0, 'снова молодой');
  t.equal(state.meta.trophies.helm, 2, 'трофеи остались');
  t.ok(x.sim.speciesOpen(state, x.cfg).indexOf('sand') >= 0, 'песчаный открыт с 3 Крови');
};

exports['офлайн 8 ч: рыцари бьются, потери не больше 15 %'] = function (t) {
  var x = load();
  var now = Date.UTC(2026, 10, 2, 8, 0, 0);
  var rng = Rng.make(11);
  var state = Core.newState(x.game, x.sim, ctxOf(x, now, rng));
  // The age of peace does not change the interval: 8 hours by 12 minutes.
  state.run.world = { id: 'peace' };
  for (var s = 0; s < 1500; s++) {
    x.sim.botPlay(state, x.cfg, now, rng, { raids: false });
    x.sim.tick(state, 1, ctxOf(x, now + 1000, rng));
    now += 1000;
  }
  var gold0 = Big.of(state.run.gold);
  state.lastTick = now;
  var p = Core.plan(now, now + 8 * HOUR, x.cfg, 0);
  Core.runOffline(x.sim, state, x.game, p, null, function (seg) { return ctxOf(x, seg.to, Rng.make(1), true); }, x.cfg);
  var a = state.run.away;
  t.ok(a && a.knights >= 36 && a.knights <= 44, 'рыцарей за 8 ч: ' + (a && a.knights));
  t.ok(Big.lte(a.lost, Big.mul(gold0, x.cfg['knights.offlineLossCap'] + 1e-9)), 'унесли ' + a.lost + ' из ' + Big.str(gold0));
  t.ok(Big.gt(state.run.gold, gold0), 'куча не выросла');
};

exports['сундук «дань с дороги» даёт золото'] = function (t) {
  var x = load();
  var state = Core.newState(x.game, x.sim, ctxOf(x, Date.now(), Rng.make(9)));
  state.run.servants[0] = 10;
  var before = Big.of(state.run.gold);
  var c = x.sim.chest(state, Rng.make(3), x.cfg);
  t.ok(c.items.length && Big.gt(c.items[0].amount, 0), 'пустой сундук');
  t.ok(Big.gt(state.run.gold, before), 'золото не прибавилось');
};

exports['набеги: крылья и возраст'] = function (t) {
  var x = load();
  var now = Date.now();
  var state = Core.newState(x.game, x.sim, ctxOf(x, now, Rng.make(4)));
  t.ok(x.sim.raidAllowed(state, x.cfg, 1, now).ok, 'хутор доступен сразу');
  t.ok(x.sim.raidAllowed(state, x.cfg, 4, now).age, 'монастырь закрыт возрастом');
  state.layers.sleep.state.sleeps = 1;
  t.ok(x.sim.raidAllowed(state, x.cfg, 4, now).wings, 'монастырю нужны крылья');
  state.run.q.wings = 2;
  t.ok(x.sim.raidAllowed(state, x.cfg, 4, now).ok, 'с двумя крыльями монастырь открыт');
  t.ok(x.sim.startRaid(state, x.cfg, 4, now), 'набег не начался');
  t.ok(!x.sim.setCurl(state, true), 'в набеге свернуться нельзя');
};

exports['все события без NaN'] = function (t) {
  var x = load();
  var now = Date.now();
  var state = Core.newState(x.game, x.sim, ctxOf(x, now, Rng.make(4)));
  state.run.gold = Big.str(Big.of('1e6'));
  state.run.servants[0] = 20;
  state.layers.sleep.state.sleeps = 10;
  x.sim.tick(state, 1, ctxOf(x, now, Rng.make(4)));
  x.sim.EVENTS.forEach(function (ev) {
    var choices = ev.choices || [[null]];
    choices.forEach(function (c) {
      x.sim.applyEvent(state, x.cfg, ev.id, c[0], now, Rng.make(ev.id.length));
      t.equal(Core.validate(state, x.game), null, ev.id + ' ' + c[0]);
      t.ok(Big.valid(state.run.gold), ev.id + ': куча ' + state.run.gold);
    });
  });
};
