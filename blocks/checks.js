// The episodic game uses its own bot balance tests, rather than the idle-game pace template.
var kit = require('../engine/checks-kit.js');
var Core = require('../engine/core.js');
var Big = require('../engine/big.js');
var Rng = require('../engine/rng.js');
var B = require('./board.js');
var L = require('./levels.js');
var standard = kit.standard(__dirname, { pace: false, zeroOffline: true, setupSec: 0 });
for (var name in standard) exports[name] = standard[name];

function load() {
  var id = kit.idOf(__dirname);
  var axiko = require('lib/axiko');
  var dir = 'modules/games/' + id;
  var game = JSON.parse(axiko.files.read(dir + '/game.json'));
  var sim = require(dir + '/sim.js');
  var cfg = kit.configOf(game, dir);
  var ctx = { now: Date.UTC(2026, 10, 14, 9), config: cfg, rng: Rng.make(42), mult: 1, links: {}, stock: {} };
  return { game: game, sim: sim, cfg: cfg, ctx: ctx, state: Core.newState(game, sim, ctx), axiko: axiko, dir: dir };
}

exports['мастерская: 12 часов формулой равны шагам, монеты не растут'] = function (t) {
  var x = load();
  x.state.run.up.workshop = 1;
  var a = Core.clone(x.state);
  var b = Core.clone(x.state);
  var result = x.sim.offline(a, 43200, x.ctx);
  for (var i = 0; i < 43200; i++) x.sim.tick(b, 1, x.ctx);
  t.equal(JSON.stringify(a.meta.blocks.supply), JSON.stringify(b.meta.blocks.supply), 'разовые запасы');
  t.equal(a.run.ws, b.run.ws, 'остаток производства');
  t.equal(x.sim.supplyCount(a), x.cfg['up.workshop.cap'], 'лимит мастерской');
  t.ok(Big.eq(a.run.coins, 0), 'пассивных монет нет');
  t.ok(result.events.length > 0, 'сводка производства');
};

exports['строка и столбец сгорают одновременно, пересечение одно'] = function (t) {
  var cells = B.empty(8);
  for (var i = 0; i < 8; i++) { cells[i] = 1; cells[i * 8] = 2; }
  var burned = B.burn(cells);
  t.equal(burned.lines, 2, 'две линии');
  t.equal(B.filled(cells), 0, 'очистка пересечения');
};

exports['ранг: 5 000 дают три мастерства, прогресс сохраняется'] = function (t) {
  var x = load();
  x.state.run.best = 4999;
  t.ok(Big.eq(x.sim.prestigeGain(x.state, 'rank', x.cfg), 0), 'слишком ранний ранг');
  x.state.run.best = 5000;
  x.state.run.coins = '1000';
  x.state.run.up.bomb = 3;
  x.state.meta.blocks.records.classic = 5000;
  x.state.meta.blocks.chal.done[1] = 1;
  var result = Core.prestige(x.sim, x.game, x.state, 'rank', x.ctx);
  t.ok(result.ok, 'престиж прошёл');
  t.ok(Big.eq(x.state.layers.rank.currency, 3), 'три мастерства');
  t.ok(Big.eq(x.state.run.coins, 0), 'монеты сброшены');
  t.equal(x.sim.level(x.state, 'bomb'), 0, 'улучшения сброшены');
  t.equal(x.state.meta.blocks.records.classic, 5000, 'рекорд сохранён');
  t.equal(x.state.meta.blocks.chal.done[1], 1, 'испытание сохранено');
};

exports['партия сохраняется с полем, лотком, серией и зарядами'] = function (t) {
  var x = load();
  x.state.run.up.rotate = 2;
  x.sim.newGame(x.state, x.cfg, 'classic', { seed: 91 });
  var p = x.state.run.game.tray[0];
  var at = B.places(x.state.run.game.b[0], p)[0];
  t.ok(x.sim.place(x.state, x.cfg, 0, 0, at[0], at[1]).ok, 'фигура поставлена');
  var saved = JSON.stringify(x.state);
  var loaded = Core.pick([{ json: saved, seq: 1, source: 'check' }], x.game, x.sim);
  t.ok(loaded.state, 'сохранение читается');
  t.equal(JSON.stringify(loaded.state.run.game), JSON.stringify(JSON.parse(saved).run.game), 'всё состояние партии');
};

exports['сундук: три разовых инструмента, без расхода зарядов'] = function (t) {
  var x = load();
  var chest = x.sim.chest(x.state, Rng.make(83), x.cfg);
  t.equal(x.sim.supplyCount(x.state), x.cfg['chest.tools'], 'количество инструментов');
  t.ok(chest.items.length > 0, 'содержимое сундука');
};

exports['60 испытаний воспроизводятся и решаются поиском'] = function (t) {
  var x = load();
  var data = JSON.parse(x.axiko.files.read(x.dir + '/content/challenges.json'));
  t.equal(data.levels.length, x.cfg['challenge.count'], 'число испытаний');
  data.levels.forEach(function (entry) {
    var level = L.generate(entry.seed, entry);
    t.ok(level, 'генерация испытания ' + entry.id);
    var proof = L.solve(level, { limit: 1, budget: x.cfg['challenge.searchBudget'] });
    t.ok(proof.solutions > 0 && !proof.aborted, 'решение испытания ' + entry.id);
  });
};
