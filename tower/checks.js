// Tower is turn based: the idle pace check is replaced by game-specific checks.
// No passive income is expected; twelve-hour offline agreement must be exact.
var kit = require('../engine/checks-kit.js');
var Big = require('../engine/big.js');
var Core = require('../engine/core.js');
var Rng = require('../engine/rng.js');

function play(state, ctx, sim) {
  if (state.run.phase === 'ended') return 0;
  var action = sim.botAction(state, ctx.config);
  if (!action) return 0;
  var result = sim.act(state, action, ctx);
  return result && result.ok && (action.type === 'buy' || action.type === 'workshop') ? 1 : 0;
}

var checks = kit.standard(__dirname, { pace: false, zeroOffline: true, setupSec: 20, play: play });
for (var name in checks) exports[name] = checks[name];

function load() {
  var id = kit.idOf(__dirname);
  var axiko = require('lib/axiko');
  var game = JSON.parse(axiko.files.read('modules/games/' + id + '/game.json'));
  game.id = id;
  return { game: game, sim: require('modules/games/' + id + '/sim.js'), cfg: kit.configOf(game, 'modules/games/' + id) };
}

function ctxOf(x, seed, now) {
  return { now: now || 1794636000000, config: x.cfg, rng: Rng.make(seed || 1), mult: 1, links: {}, stock: {}, offline: false, capBonusHours: 0 };
}

function fresh(x, seed) {
  var state = Core.newState(x.game, x.sim, ctxOf(x, seed));
  x.sim.act(state, { type: 'start', classId: 'guardian', height: 1, seed: seed || 1 }, ctxOf(x, seed));
  return state;
}

exports['после загрузки: те же двери, рука, бой и генератор'] = function (t) {
  var x = load();
  var state = fresh(x, 27);
  for (var i = 0; i < 12 && state.run.phase !== 'ended'; i++) play(state, ctxOf(x, 27), x.sim);
  var picked = Core.pick([{ json: JSON.stringify(state), seq: state.seq, source: 'tower-check' }], x.game, x.sim);
  t.ok(picked.state, 'сохранение не прочиталось');
  var clone = picked.state;
  for (var j = 0; j < 60 && state.run.phase !== 'ended'; j++) {
    var a = x.sim.botAction(state, x.cfg);
    var b = x.sim.botAction(clone, x.cfg);
    t.equal(JSON.stringify(a), JSON.stringify(b), 'выбор после загрузки на шаге ' + j);
    x.sim.act(state, a, ctxOf(x, 7, 1794636000000 + j * 5000));
    x.sim.act(clone, b, ctxOf(x, 999, 1794636000000 + j * 5000));
    t.equal(JSON.stringify(state.run), JSON.stringify(clone.run), 'забег после загрузки на шаге ' + j);
    t.equal(JSON.stringify(state.meta.tower), JSON.stringify(clone.meta.tower), 'мета-прогресс после загрузки');
  }
};

exports['12 часов офлайн не меняют этаж, здоровье, валюты и ход'] = function (t) {
  var x = load();
  var state = fresh(x, 19);
  for (var i = 0; i < 12 && state.run.phase !== 'combat' && state.run.phase !== 'ended'; i++) play(state, ctxOf(x, 19), x.sim);
  var before = JSON.stringify({ run: state.run, tower: state.meta.tower });
  x.sim.offline(state, 43200, ctxOf(x, 19, 1794679200000));
  t.equal(JSON.stringify({ run: state.run, tower: state.meta.tower }), before, 'формула офлайна');
  for (var j = 0; j < 1440; j++) x.sim.tick(state, 30, ctxOf(x, 19, 1794636000000 + j * 30000));
  t.equal(JSON.stringify({ run: state.run, tower: state.meta.tower }), before, 'шаги офлайна');
};

exports['мастерская: оплата осколками, рост цены, предел и улучшения без предела'] = function (t) {
  var x = load();
  var state = Core.newState(x.game, x.sim, ctxOf(x, 2));
  state.meta.tower.shards = '10000';
  var previous = Big.of(state.meta.tower.shards);
  var cost = Big.of(0);
  for (var i = 0; i < 10; i++) {
    var r = x.sim.act(state, { type: 'workshop', id: 'health' }, ctxOf(x, 2));
    t.ok(r && r.ok, 'Закалка ' + (i + 1));
    cost = Big.sub(previous, state.meta.tower.shards);
    t.ok(Big.gt(cost, 0), 'покупка не списала осколки');
    previous = Big.of(state.meta.tower.shards);
  }
  t.equal(state.meta.tower.workshop.health, 10, 'порог мастерства Закалки');
  var more = x.sim.act(state, { type: 'workshop', id: 'health' }, ctxOf(x, 2));
  t.ok(more && more.ok, 'одиннадцатая Закалка: улучшение без предела');
  t.ok(Big.gt(Big.sub(previous, state.meta.tower.shards), cost), 'цена после порога растёт');
  for (var k = 0; k < 3; k++) t.ok(x.sim.act(state, { type: 'workshop', id: 'will' }, ctxOf(x, 2)).ok, 'Запас воли ' + (k + 1));
  var before = Big.str(state.meta.tower.shards);
  var denied = x.sim.act(state, { type: 'workshop', id: 'will' }, ctxOf(x, 2));
  t.ok(!denied.ok, 'четвёртый Запас воли: предел');
  t.equal(Big.str(state.meta.tower.shards), before, 'отказ не тратит деньги');
};

exports['гибель даёт осколки; покупка не создаёт долг'] = function (t) {
  var x = load();
  var state = fresh(x, 1);
  var steps = 0;
  while (state.run.phase !== 'ended' && steps < 1500) {
    if (state.run.phase === 'fork' && state.run.floor >= 30) x.sim.act(state, { type: 'descend' }, ctxOf(x, 1));
    else play(state, ctxOf(x, 1), x.sim);
    steps++;
  }
  t.ok(steps < 1500, 'бот застрял');
  t.ok(Big.gt(state.meta.tower.shards, 0), 'забег не дал осколков');
  var affordable = Big.gte(state.meta.tower.shards, 10);
  var result = x.sim.act(state, { type: 'workshop', id: 'health' }, ctxOf(x, 1));
  t.equal(!!(result && result.ok), affordable, 'покупка соответствует запасу осколков');
  t.equal(state.meta.tower.workshop.health, affordable ? 1 : 0, 'уровень Закалки');
};
