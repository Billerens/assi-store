// The checks of «Библиотека» (module_check with 'games/library'): the engine's standard ones with
// the game's own bot (sim.bot: an attentive player who keeps the desks busy and picks books by
// what is left of the trip), then the game's own.
var kit = require('../engine/checks-kit.js');
var Big = require('../engine/big.js');
var Rng = require('../engine/rng.js');
var Core = require('../engine/core.js');

var TRIP_SEC = 25 * 60;
var seen = { state: null, at: 0, from: 0 };

/** One second of the bot; the trip it is in starts when the clock jumped (a gap) or the state is new. */
function play(state, ctx, sim) {
  if (seen.state !== state || ctx.now - seen.at > 5000 || ctx.now < seen.at) seen.from = ctx.now;
  seen.state = state;
  seen.at = ctx.now;
  var left = TRIP_SEC - (ctx.now - seen.from) / 1000;
  return sim.bot(state, ctx, { tripLeftSec: left });
}

var checks = kit.standard(__dirname, { play: play, firstBuySec: 10, prestigeTrips: [4, 6] });
for (var name in checks) exports[name] = checks[name];

function load() {
  var id = kit.idOf(__dirname);
  var axiko = require('lib/axiko');
  var game = JSON.parse(axiko.files.read('modules/games/' + id + '/game.json'));
  game.id = id;
  var sim = require('modules/games/' + id + '/sim.js');
  return { game: game, sim: sim, cfg: kit.configOf(game, 'modules/games/' + id) };
}

function ctxOf(x, now, extra) {
  var c = { now: now, config: x.cfg, rng: Rng.make(7), mult: 1, links: {}, stock: {}, offline: false, capBonusHours: 0 };
  for (var k in extra || {}) c[k] = extra[k];
  return c;
}

function fresh(x, now) { return Core.newState(x.game, x.sim, ctxOf(x, now)); }

exports['чтение: вид 8 — 4 ч 16 мин, с тремя улучшениями — 2 ч 11 мин'] = function (t) {
  var x = load();
  var state = fresh(x, Date.now());
  t.equal(Math.round(x.sim.readTime(state, x.cfg, 7) / 60), 256, 'вид 8 со скоростью ×1, минут');
  t.equal(Math.round(x.sim.readTime(state, x.cfg, 0) / 60), 2, 'вид 1, минут');
  state.run.upgrades = { lamp: 1, glasses: 1, silence: 1 };
  t.equal(Math.floor(x.sim.readTime(state, x.cfg, 7) / 60), 131, 'вид 8 с Лампой, Очками и Тишиной, минут');
  t.equal(x.sim.knowledgeOf(state, x.cfg, 7, 0), 610, 'знаний за книгу вида 8');
  t.equal(x.sim.knowledgeOf(state, x.cfg, 0, 0), 1, 'знаний за книгу вида 1');
};

exports['новое здание: Экслибрисы по знаниям, Репутация, тома Хранилища'] = function (t) {
  var x = load();
  var now = Date.now();
  var state = fresh(x, now);
  state.run.knEarned = 5000;
  state.run.tomes = ['atlas', 'rain'];
  state.meta.vault = ['atlas'];
  state.meta.council = { desks: 1 };
  var r = Core.prestige(x.sim, x.game, state, 'building', ctxOf(x, now));
  t.ok(r.ok, 'переезд не прошёл');
  t.equal(Big.str(state.layers.building.currency), Big.str(Big.of(10)), 'Экслибрисы: floor(sqrt(5000 / 50))');
  t.equal(state.meta.reputation, 10, 'Репутация');
  t.equal(state.run.tomes.join(','), 'atlas', 'тома после переезда — только из Хранилища');
  t.equal(state.run.desks.length, 2, 'стартовые столы совета');
  t.equal(x.sim.building(state), 2, 'номер здания');
};

exports['сундук «Пассажира»: книга вида 5 на свободный стол'] = function (t) {
  var x = load();
  var state = fresh(x, Date.now());
  var c = x.sim.chest(state, Rng.make(3), x.cfg);
  t.ok(c.items.length === 1, 'пустой сундук');
  t.equal(x.sim.ownKind(state, 4), 1, 'книга вида 5 не прибавилась');
  t.ok(state.run.desks[0] && state.run.desks[0].k === 4 && state.run.desks[0].train, 'книга из поезда не на столе');
};

exports['офлайн 8 ч, 4 стола и Библиотекарь: ни одной книги дважды'] = function (t) {
  var x = load();
  var now = Date.UTC(2026, 10, 3, 22, 0, 0);
  var state = fresh(x, now);
  var r = state.run;
  r.desks = [null, null, null, null];
  r.halls.push('lending');
  for (var i = 0; i < 40; i++) r.own[x.sim.group(i % 4, i % 6)] += 1;
  for (var d = 0; d < 4; d++) x.sim.placeKind(state, x.cfg, d, d);
  state.lastTick = now;
  var p = Core.plan(now, now + 8 * 3600000, x.cfg, 0);
  Core.runOffline(x.sim, state, x.game, p, null, function (seg) { return ctxOf(x, seg.to); }, x.cfg);
  var read = 0;
  for (var gi = 0; gi < r.own.length; gi++) {
    t.ok(r.rd[gi] <= r.own[gi], 'прочитано больше, чем есть в группе ' + gi);
    read += r.rd[gi];
  }
  t.ok(read === r.readTotal, 'счётчик прочитанного ' + r.readTotal + ' против ' + read);
  t.ok(read === 40 || r.desks.every(function (x2) { return x2 !== null; }), 'книги остались, а столы пустуют');
  var ids = {};
  (state.meta.catalog || []).forEach(function (e) {
    t.ok(!ids[e.id], 'книга ' + e.id + ' прочитана дважды');
    ids[e.id] = 1;
  });
};

exports['запас пуст: шаблонная аннотация, а не пустота'] = function (t) {
  var x = load();
  var item = x.sim.procedural('annotations', Rng.make(4));
  t.ok(item && item.title && item.author && item.text && item.text.length > 20, 'шаблон пустой');
  t.equal(x.sim.validateStock('annotations', { title: 'Сад', author: 'А. Б.', branch: 'Естествознание', kind: 2, text: 'Одно. Два. Три.' }), null, 'годная аннотация отвергнута');
  t.ok(x.sim.validateStock('annotations', { title: 'Сад', author: 'А. Б.', branch: 'Кулинария', kind: 2, text: 'Одно. Два.' }) !== null, 'чужая ветвь принята');
};
