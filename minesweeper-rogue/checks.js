var kit = require('../engine/checks-kit.js');
var Core = require('../engine/core.js');
var Rng = require('../engine/rng.js');
var Big = require('../engine/big.js');
var checks = kit.standard(__dirname, {pace: false, zeroOffline: true, setupSec: 0});
for (var checkName in checks) exports[checkName] = checks[checkName];

function load() {
  var id = kit.idOf(__dirname);
  var axiko = require('lib/axiko');
  var game = JSON.parse(axiko.files.read('modules/games/' + id + '/game.json'));
  var sim = require('modules/games/' + id + '/sim.js');
  var cfg = kit.configOf(game, 'modules/games/' + id);
  var ctx = {now: 1794657600000, config: cfg, rng: Rng.make(73), mult: 1, links: {}, stock: {}};
  return {game: game, sim: sim, cfg: cfg, ctx: ctx, state: Core.newState(game, sim, ctx)};
}

exports['первое касание: вся область 3 на 3 безопасна'] = function (t) {
  var x = load();
  x.sim.startRun(x.state, x.cfg, {seed: 73, mode: 'rogue', sapper: 'sapper', depth: 0}, x.ctx);
  x.sim.tap(x.state, 31, x.cfg, 1);
  var f = x.state.run.field;
  for (var dy = -1; dy <= 1; dy++) {
    for (var dx = -1; dx <= 1; dx++) {
      var cell = 31 + dy * f.w + dx;
      t.equal(f.m.charAt(cell), '.', 'первая область: ' + cell);
    }
  }
  t.equal(x.state.run.hearts, x.cfg['start.hearts'], 'первый ход не стоит сердца');
  t.equal(x.sim.validate(x.state), null, 'валидное поле');
};

exports['12 часов отсутствия: поле, отсчёты и валюта не меняются'] = function (t) {
  var x = load();
  x.sim.startRun(x.state, x.cfg, {seed: 5}, x.ctx);
  x.sim.tap(x.state, 31, x.cfg, 1);
  var before = JSON.stringify({run: x.state.run, layers: x.state.layers, meta: x.state.meta});
  x.sim.offline(x.state, 43200, x.ctx);
  for (var i = 0; i < 43200; i++) x.sim.tick(x.state, 1, x.ctx);
  t.equal(JSON.stringify({run: x.state.run, layers: x.state.layers, meta: x.state.meta}), before, 'нулевой офлайн');
};

exports['сохранение после хода: то же поле и те же флаги'] = function (t) {
  var x = load();
  x.sim.startRun(x.state, x.cfg, {seed: 7}, x.ctx);
  x.sim.tap(x.state, 31, x.cfg, 1);
  var field = x.state.run.field;
  var cell = field.vis.indexOf('-');
  if (cell >= 0) x.sim.flag(x.state, cell, x.cfg);
  var json = JSON.stringify(x.state);
  var restored = Core.pick([{json: json, seq: x.state.seq, source: 'check'}], x.game, x.sim);
  t.ok(restored.state, 'сохранение принято движком');
  t.equal(JSON.stringify(restored.state.run), JSON.stringify(JSON.parse(json).run), 'весь забег сохраняется');
};

exports['мастерская: цена растёт в 1,4 раза, предел соблюдается, мешочек без предела'] = function (t) {
  var x = load();
  x.state.meta.ore = '1e9';
  var max = x.cfg['workshop.discount.max'];
  var spent = Big.ZERO;
  for (var n = 0; n < max; n++) {
    var before = x.state.meta.ore;
    t.ok(x.sim.buyWorkshop(x.state, 'discount', x.cfg), 'покупка ' + n);
    var price = Math.ceil(x.cfg['workshop.discount.base'] * Math.pow(x.cfg['workshop.growth'], n));
    t.ok(Math.abs(Big.toNumber(Big.sub(before, x.state.meta.ore)) - price) < 0.000001, 'цена уровня ' + n);
    spent = Big.add(spent, price);
  }
  t.ok(!x.sim.buyWorkshop(x.state, 'discount', x.cfg), 'покупка выше максимума запрещена');
  t.equal(x.state.meta.workshop.discount, max, 'максимум');
  for (var k = 0; k < 20; k++) t.ok(x.sim.buyWorkshop(x.state, 'pouch', x.cfg), 'мешочек, уровень ' + (k + 1));
  t.equal(x.state.meta.workshop.pouch, 20, 'мешочек растёт без предела');
};
