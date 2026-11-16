// Checks of «Выживание в волнах» on the phone (module_check('games/wave-survival')): the engine's
// standard ones and the game's own — the run is the same from the same seed, a snapshot goes on
// as if nothing happened, the caps hold, the shards and the workshop count right, the stock is
// checked. The pace of the meta is not the idle bot's: tests/ under node play whole runs by the bot.
var kit = require('../engine/checks-kit.js');
var Big = require('../engine/big.js');
var Rng = require('../engine/rng.js');
var Core = require('../engine/core.js');

function play(state, ctx, sim, taps) {
  var bought = 0;
  while (bought < 20 && sim.buy(state, ctx.config)) bought++;
  return bought;
}

var checks = kit.standard(__dirname, { pace: false, zeroOffline: true, play: play, setupSec: 5 });
for (var name in checks) exports[name] = checks[name];

function load() {
  var id = kit.idOf(__dirname);
  var assi = require('lib/assi');
  var game = JSON.parse(assi.files.read('modules/games/' + id + '/game.json'));
  game.id = id;
  var sim = require('modules/games/' + id + '/sim.js');
  return { game: game, sim: sim, W: sim.World, cfg: kit.configOf(game, 'modules/games/' + id) };
}

/** A scripted thumb: circles, changing direction every few seconds. */
function steer(w, i) {
  var a = Math.floor(i / 150) * 1.3 + i * 0.01;
  return [Math.cos(a), Math.sin(a)];
}

function drive(x, w, steps, from) {
  for (var i = 0; i < steps && !w.s.over; i++) {
    if (w.s.choice) x.W.pick(w, (from + i) % w.s.choice.cards.length);
    var m = steer(w, from + i);
    x.W.step(w, m[0], m[1]);
  }
}

exports['забег одинаков от одного зерна'] = function (t) {
  var x = load();
  var a = x.W.create(x.cfg, { seed: 42, hero: 'wanderer', mode: 'normal' });
  var b = x.W.create(x.cfg, { seed: 42, hero: 'wanderer', mode: 'normal' });
  drive(x, a, 900, 0);
  drive(x, b, 900, 0);
  t.equal(x.W.hash(a), x.W.hash(b), 'отпечаток после 15 секунд');
  t.ok(a.s.kills > 0, 'за 15 секунд никто не убит');
};

exports['снимок забега продолжается с той же секунды'] = function (t) {
  var x = load();
  var a = x.W.create(x.cfg, { seed: 7, hero: 'keeper', mode: 'normal', storm: 2 });
  drive(x, a, 1200, 0);
  var data = JSON.parse(JSON.stringify(x.W.save(a)));
  var b = x.W.load(x.cfg, data);
  t.ok(b, 'снимок не читается');
  t.equal(x.W.hash(b), x.W.hash(a), 'отпечаток сразу после чтения');
  drive(x, a, 600, 1200);
  drive(x, b, 600, 1200);
  t.equal(x.W.hash(b), x.W.hash(a), 'отпечаток через 10 секунд');
};

exports['пределы врагов, снарядов и кристаллов'] = function (t) {
  var x = load();
  var ws = {};
  x.sim.WORKSHOP.forEach(function (id) { ws[id] = x.sim.maxOf(id, x.cfg); });
  var w = x.W.create(x.cfg, { seed: 3, hero: 'mechanic', mode: 'sprint', storm: 15, ws: ws });
  var b = x.W.brain(3);
  for (var i = 0; i < 1800 && !w.s.over; i++) {
    if (w.s.choice) x.W.botPick(w, b);
    x.W.botMove(w, b);
    x.W.step(w, b.mx, b.my);
    if (w.s.ecount > w.c.capE || w.s.pcount > w.c.capP || w.s.gcount > w.c.capG) break;
  }
  t.equal(x.W.check(w), null, 'числа и счётчики забега');
  t.ok(w.s.ecount <= w.c.capE && w.s.pcount <= w.c.capP && w.s.gcount <= w.c.capG, 'сверх предела');
};

exports['осколки за забег и мастерская'] = function (t) {
  var x = load();
  var state = Core.newState(x.game, x.sim, { now: Date.now(), config: x.cfg, rng: Rng.make(5) });
  var r = { won: false, mode: 'normal', time: 150, T: 150, kills: 400, elites: 1, bosses: 0, hives: 0, gold: 40, medkits: 1, storm: 0,
    level: 14, weapons: ['spark'], items: ['spark'], fusions: [], minutes: [[50, 4], [180, 9]], multi2: false, onlyPulse: false, noScratch: false, hero: 'wanderer' };
  var want = Math.floor(400 / x.cfg['shards.perKills'] + x.cfg['shards.perMinute'] * 2.5 + x.cfg['shards.elite'] + 40 / x.cfg['shards.goldPer']);
  var out = x.sim.finish(state, r, x.cfg, { now: Date.now(), mult: 1 });
  t.equal(out.shards, want, 'осколки по формуле');
  t.equal(Big.toNumber(Big.of(state.meta.shards)), want, 'осколки начислены');
  var price = x.sim.cost(state, 'vitality', x.cfg);
  t.equal(price, Math.ceil(x.cfg['ws.vitality.base']), 'цена первого уровня');
  t.ok(x.sim.buyUpgrade(state, 'vitality', x.cfg), 'покупка не прошла');
  t.equal(state.run.ws.vitality, 1, 'уровень мастерской');
  t.equal(Core.validate(state, x.game), null, 'состояние после забега');
  t.ok(Big.isZero(x.sim.prestigeGain(state, 'smelt', x.cfg)), 'переплавка без максимума');
};

exports['запас: свои элементы проходят проверку, чужие нет'] = function (t) {
  var x = load();
  var rng = Rng.make(11);
  x.sim.STOCK.forEach(function (kind) {
    for (var i = 0; i < 20; i++) t.equal(x.sim.validateStock(kind, x.sim.procedural(kind, rng)), null, kind + ' из procedural');
  });
  t.ok(x.sim.validateStock('daily', { title: 'Тест', rules: ['swarm', 'calm', 'rich'] }), 'рой и затишье вместе');
  t.ok(x.sim.validateStock('cards', { title: 'Сила всего', rarity: 'epic', max: 5, effects: [{ stat: 'damage', value: 0.5 }, { stat: 'hp', value: 40 }] }), 'слишком сильная карточка');
  t.ok(x.sim.validateStock('waves', { title: 'Боссы', waves: ['reaper:1', 'crawler:1', 'crawler:1', 'crawler:1', 'crawler:1', 'crawler:1', 'crawler:1', 'crawler:1', 'crawler:1', 'crawler:1'] }), 'босс в волне');
};

exports['облик врагов: у каждого вида свой, орда дня берётся из запаса'] = function (t) {
  var x = load();
  var Art = require('../engine/art.js');
  var assi = require('lib/assi');
  var world = JSON.parse(assi.files.read('modules/games/' + kit.idOf(__dirname) + '/content/world.json'));
  x.W.ENEMIES.forEach(function (id) {
    var look = world.enemies[id] && world.enemies[id].look;
    t.equal(Art.lookCheck(look), null, 'облик ' + id);
  });
  // The day's item with a horde look, through the engine's check of the stock and into the save.
  var md = assi.files.read('modules/games/' + kit.idOf(__dirname) + '/prompts/daily.md');
  var item = { title: 'Стеклянный рой', rules: ['swarm', 'glass', 'rich'], horde: { mask: 'bug', hue: 200, light: 'pale' } };
  t.equal(Core.stock.check(item, Core.stock.schema(md), {}, x.sim, 'daily'), null, 'день с ордой отвергнут');
  var state = Core.newState(x.game, x.sim, { now: Date.now(), config: x.cfg, rng: Rng.make(3) });
  var d = x.sim.daily(state, '2026-11-14', item);
  t.equal(d.horde, { mask: 'bug', hue: 200, light: 'pale' }, 'облик орды в сохранении');
  var odd = { title: 'Странный рой', rules: ['swarm', 'glass', 'rich'], horde: { mask: 'dragon', hue: 200 } };
  t.equal(Core.stock.check(odd, Core.stock.schema(md), {}, x.sim, 'daily'), null, 'день с плохим обликом отвергнут целиком');
  t.ok(odd.horde === undefined, 'плохой облик остался');
};
