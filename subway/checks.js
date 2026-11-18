// The checks of «Подземка» (module_check with 'games/subway'): the engine's standard ones with the
// game's own bot, then the game's own from «Как проверить» of docs/games/subway.md. Rhino: ES5 only.
var kit = require('../engine/checks-kit.js');
var Big = require('../engine/big.js');
var Rng = require('../engine/rng.js');
var Core = require('../engine/core.js');

var HOUR = 3600000;

/** One second of the bot of «Темп»: taps of the turnstile, dispatchers, the best purchase. */
function play(state, ctx, sim, taps) {
  return sim.botStep(state, ctx.config, ctx.now, Math.min(taps, ctx.config['bot.taps']), ctx.mult || 1);
}

// The pace is the game's own check below: the first move by the game's mark «выгодно» (not the
// engine's), and the spec's table of the greedy bot.
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

function ctxOf(cfg, now, offline) {
  return { now: now, config: cfg, rng: Rng.make(3), mult: 1, links: {}, stock: {}, offline: !!offline, capBonusHours: 0 };
}

/** A state of «an hour of play» without the bot (fast on the phone): 6 lines, dispatchers, transfers. */
function hourState(x, now) {
  var state = Core.newState(x.game, x.sim, ctxOf(x.cfg, now));
  var shape = [[1, 100, 34, 3], [2, 100, 34, 2], [3, 67, 23, 2], [4, 60, 20, 1], [5, 33, 11, 1], [6, 25, 9, 0]];
  state.run.lines = shape.map(function (s) {
    return { tier: s[0], stations: s[1], trains: s[2], cars: s[3], dispatcher: true, express: false, duty: false, recon: false, bonus: 0, mallAt: [] };
  });
  state.run.transfers = [[1, 2], [1, 3], [2, 3], [3, 4], [2, 4], [1, 4]];
  state.run.tariffs = 3;
  state.run.money = '1e6';
  return state;
}

exports['темп: бот из «Темпа», 5–60 минут против таблицы'] = function (t) {
  var x = load();
  var cfg = x.cfg;
  var now = Date.UTC(2026, 10, 2, 12, 0, 0);
  var state = Core.newState(x.game, x.sim, ctxOf(cfg, now));
  var target = { 5: 60, 15: 2.6e3, 30: 2.4e5, 60: 1e7 };
  var lines = { 5: 2, 15: 3, 30: 4, 60: 6 };
  var hint = null;
  var bad = [];
  for (var s = 0; s < 70 * 60; s++) {
    x.sim.botStep(state, cfg, now, s < cfg['bot.tapSec'] ? cfg['bot.taps'] : 0, 1);
    now += 1000;
    x.sim.tick(state, 1, ctxOf(cfg, now));
    if (hint === null && x.sim.moveHint(state, cfg)) hint = (s + 1) / 60;
    var min = (s + 1) / 60;
    if (target[min]) {
      var inc = Big.toNumber(x.sim.income(state, cfg, now, true));
      var ratio = inc / target[min];
      if (ratio > 1.5 || ratio < 1 / 1.5) bad.push(min + ' мин: ' + Math.round(inc) + '/с, нужно ~' + target[min]);
      if (state.run.lines.length !== lines[min]) bad.push(min + ' мин: линий ' + state.run.lines.length + ', нужно ' + lines[min]);
    }
  }
  t.ok(!bad.length, bad.join('; '));
  t.ok(hint !== null && hint >= 50 && hint <= 70, 'метка «выгодно» на ' + hint + ' мин, нужно 50–70');
};

exports['офлайн 8 ч из «часа игры» = доход × 28 800 × 0,5'] = function (t) {
  var x = load();
  var now = Date.UTC(2026, 10, 2, 12, 0, 0);
  var state = hourState(x, now);
  var rate = x.sim.income(state, x.cfg, now, false);
  var want = Big.mul(rate, 8 * 3600 * x.cfg['offline.efficiency']);
  var before = Big.of(state.run.money);
  state.lastTick = now;
  var p = Core.plan(now, now + 8 * HOUR, x.cfg, 0);
  var r = Core.runOffline(x.sim, state, x.game, p, null, function (seg) { return ctxOf(x.cfg, seg.to); }, x.cfg);
  var got = Big.sub(state.run.money, before);
  var diff = Big.toNumber(Big.div(Big.abs(Big.sub(got, want)), want));
  t.ok(diff < 1e-6, 'заработано ' + Big.str(got) + ', ожидалось ' + Big.str(want));
  t.equal(Big.str(r.gains.money), Big.str(got), 'сводка показывает то же число');
};

exports['ночь и час пик: формула и шаги совпадают'] = function (t) {
  var x = load();
  var now = Date.UTC(2026, 10, 2, 18, 0, 0);
  var state = hourState(x, now);
  state.meta.unlocks = { night: 1, districts: 1 };
  state.run.lines[0].duty = true;
  var steps = {};
  for (var k in x.sim) if (k !== 'offline') steps[k] = x.sim[k];
  var a = Core.clone(state);
  var b = Core.clone(state);
  a.lastTick = b.lastTick = now;
  var p = Core.plan(now, now + 12 * HOUR, x.cfg, 0);
  var mk = function (seg) { return ctxOf(x.cfg, seg.to); };
  Core.runOffline(x.sim, a, x.game, p, null, mk, x.cfg);
  Core.runOffline(steps, b, x.game, p, null, mk, x.cfg);
  var va = Big.of(a.run.money);
  var vb = Big.of(b.run.money);
  var diff = Big.toNumber(Big.div(Big.abs(Big.sub(va, vb)), Big.max(va, vb)));
  t.ok(diff <= 0.01, 'формула ' + Big.str(va) + ', шаги ' + Big.str(vb));
};

exports['офлайн 30 суток: засчитаны последние 12 ч'] = function (t) {
  var x = load();
  var now = Date.UTC(2026, 10, 2, 12, 0, 0);
  var state = hourState(x, now);
  var rate = x.sim.offlineRate(state, x.cfg, now);
  var before = Big.of(state.run.money);
  state.lastTick = now - 30 * 24 * HOUR;
  var p = Core.plan(state.lastTick, now, x.cfg, x.sim.capBonusHours(state));
  t.ok(p.capped, 'потолок не сработал');
  Core.runOffline(x.sim, state, x.game, p, null, function (seg) { return ctxOf(x.cfg, seg.to); }, x.cfg);
  var got = Big.toNumber(Big.div(Big.sub(state.run.money, before), rate));
  t.ok(Math.abs(got - 12 * 3600) < 1, 'засчитано ' + got + ' с вместо 43 200');
  t.equal(Core.validate(state, x.game), null, 'состояние после 30 суток');
};

exports['большие числа: деньги 1e400, доход 1e350'] = function (t) {
  var x = load();
  var now = Date.UTC(2026, 10, 2, 12, 0, 0);
  var state = hourState(x, now);
  state.run.money = '1e400';
  state.layers.city.currency = '5e341';
  var inc = x.sim.income(state, x.cfg, now, true);
  t.ok(Big.gt(inc, '1e340') && Big.lt(inc, '1e360'), 'доход ' + Big.str(inc));
  var json = JSON.stringify(state);
  var picked = Core.pick([{ json: json, seq: 1, source: 'check' }], x.game, x.sim);
  t.ok(picked.state, 'сохранение не читается');
  var s = picked.state;
  t.ok(x.sim.buyPlan(s, x.cfg, 1, 'station', 'max'), 'покупка «макс» не прошла');
  t.ok(x.sim.buyPlan(s, x.cfg, 2, 'train', 10), 'покупка поездов не прошла');
  t.ok(x.sim.buyTariff(s, x.cfg), 'тариф не купился');
  x.sim.tick(s, 1, ctxOf(x.cfg, now + 1000));
  t.equal(Core.validate(s, x.game), null, 'validate');
  var text = require('../engine/fmt.js').num(s.run.money);
  t.ok(!/Infinity|NaN/.test(text), 'формат: ' + text);
};

exports['переезд: ОИ, следующий город, Бюро открылось'] = function (t) {
  var x = load();
  var now = Date.UTC(2026, 10, 2, 12, 0, 0);
  var ctx = ctxOf(x.cfg, now);
  var state = hourState(x, now);
  state.run.earned = Big.mul(x.cfg['oi.div'], 400);
  var r = Core.prestige(x.sim, x.game, state, 'city', ctx);
  t.ok(r.ok, 'переезд не прошёл');
  t.equal(Big.str(state.layers.city.currency), Big.str(Big.of(20)), 'ОИ после переезда');
  t.equal(state.layers.city.state.city, 2, 'номер города');
  t.ok(state.meta.unlocks.bureau && state.meta.unlocks.express, 'Бюро и экспрессы не открылись');
  t.equal(state.run.lines.length, 1, 'линии после переезда');
  t.equal(x.sim.prestigeGain(state, 'city', x.cfg).toString(), Big.str(Big.ZERO), 'второй раз за те же деньги');
};

exports['сундук «Пассажира»: вагон с выручкой'] = function (t) {
  var x = load();
  var state = hourState(x, Date.now());
  var before = Big.of(state.run.money);
  var c = x.sim.chest(state, Rng.make(9), x.cfg);
  t.ok(c.items.length && Big.gt(c.items[0].amount, 0), 'пустой сундук');
  t.ok(Big.gt(state.run.money, before), 'деньги не прибавились');
};
