// Device checks use the same shared simulation and configuration as the browser and Node.
var kit = require('../engine/checks-kit.js');
var Big = require('../engine/big.js');
var Core = require('../engine/core.js');
var Rng = require('../engine/rng.js');
var bot = require('./bot.js');
var checks = kit.standard(__dirname, {
  pace: false,
  play: function (state, ctx, sim) { return sim.play(state, ctx, 3); }
});
for (var name in checks) exports[name] = checks[name];
function load() {
  var id = kit.idOf(__dirname);
  var assi = require('lib/assi');
  var game = JSON.parse(assi.files.read('modules/games/' + id + '/game.json'));
  return { game: game, cfg: kit.configOf(game, 'modules/games/' + id), sim: require('modules/games/' + id + '/sim.js') };
}
function ctx(x, now) { return bot.ctxOf(x.cfg, Rng.make(7), now || Date.UTC(2026, 10, 14, 8)); }
function fresh(x) { return Core.newState(x.game, x.sim, ctx(x)); }
exports['первая покупка, цена дрона и веха ×2'] = function (t) {
  var x = load();
  var s = fresh(x);
  t.equal(Big.str(x.sim.droneCost(s, 0, x.cfg)), Big.str(Big.of(10)), 'первый скребок стоит 10');
  t.ok(x.sim.buyDrone(s, 0, x.cfg, 1), 'первая покупка сразу');
  t.ok(Math.abs(x.sim.oreRate(s, x.cfg, 0) - 0.4) < 1e-8, 'добыча первого дрона');
  t.equal(x.sim.milestoneMult(10, x.cfg), 2, 'первая веха');
  t.equal(x.sim.milestoneMult(25, x.cfg), 4, 'вторая веха');
};
exports['фабрика и лаборатория доступны до первых данных'] = function (t) {
  var x = load();
  var s = fresh(x);
  s.run.ore = '1e7';
  t.ok(x.sim.research(s, 'smelt', x.cfg), 'плавка');
  t.ok(x.sim.research(s, 'ice', x.cfg), 'лёд');
  t.ok(x.sim.buildingOpen(s, 'factory') && x.sim.buildingOpen(s, 'lab'), 'нет тупика науки');
  t.ok(x.sim.buyBuilding(s, 'smelter', x.cfg), 'первая плавильня');
  t.equal(x.sim.throughput('smelter', 1, x.cfg), 2, '2 руды в секунду');
  t.equal(x.sim.consumption('smelter', 1, x.cfg), 5, '5 энергии');
};
exports['двигатель обязателен, ТМ за руду и работающие цепочки'] = function (t) {
  var x = load();
  var s = fresh(x);
  s.run.mined = '7e12';
  x.sim.BUILDINGS.forEach(function (b) { s.run.work[b.id] = true; });
  t.ok(Big.isZero(x.sim.prestigeGain(s, 'jump', x.cfg)), 'без двигателя нельзя прыгнуть');
  s.run.engine = true;
  t.equal(Big.str(x.sim.prestigeGain(s, 'jump', x.cfg)), Big.str(Big.of(18)), '8 ТМ за руду +10 за цепочки');
};
exports['прыжок сбрасывает колонию, сохраняет образцы, мету и память дронов'] = function (t) {
  var x = load();
  var s = fresh(x);
  s.run.engine = true;
  s.run.mined = '7e12';
  s.run.drones[0] = 100;
  s.meta.samples.chondrite = 1;
  x.sim.js(s).meta.memory = 1;
  var r = Core.prestige(x.sim, x.game, s, 'jump', ctx(x));
  t.ok(r.ok, 'прыжок');
  t.equal(x.sim.js(s).star, 2, 'красный карлик');
  t.equal(s.run.drones[0], 10, '10 % памяти');
  t.ok(!s.run.engine && !s.run.research.jump, 'колония сброшена');
  t.equal(s.meta.samples.chondrite, 1, 'образец остался');
  t.equal(x.sim.lvl(s, 'memory'), 1, 'мета осталась');
};
exports['Карта скопления сбрасывает ТМ и мету, станции остаются'] = function (t) {
  var x = load();
  var s = fresh(x);
  x.sim.js(s).star = 10;
  x.sim.js(s).total = 900;
  x.sim.js(s).meta.mine = 3;
  s.layers.jump.currency = '25';
  s.layers.cluster.state.stations.ore = 2;
  s.meta.samples.amber = 1;
  t.equal(Big.str(x.sim.prestigeGain(s, 'cluster', x.cfg)), Big.str(Big.of(3)), 'три маяка');
  t.ok(Core.prestige(x.sim, x.game, s, 'cluster', ctx(x)).ok, 'карта');
  t.ok(Big.isZero(s.layers.jump.currency), 'ТМ сброшена');
  t.equal(x.sim.lvl(s, 'mine'), 0, 'мета сброшена');
  t.equal(x.sim.station(s, 'ore'), 2, 'станция осталась');
  t.equal(s.meta.samples.amber, 1, 'коллекция осталась');
};
exports['экспедиция 4 ч возвращается по реальному времени после перезапуска'] = function (t) {
  var x = load();
  var s = fresh(x);
  var now = ctx(x).now;
  s.run.research.electro = true;
  s.run.research.far = true;
  s.run.hangar = 1;
  s.run.fuel = 100000;
  t.ok(x.sim.expedition(s, 3, x.cfg, now), 'отправлена');
  s = JSON.parse(JSON.stringify(s));
  var p = Core.plan(now, now + 4 * 3600000, x.cfg, 0);
  Core.runOffline(x.sim, s, x.game, p, null, function (seg) { return ctx(x, seg.to); }, x.cfg);
  t.equal(s.run.exps.length, 0, 'вернулась');
  t.equal(s.run.containers.length, 1, 'контейнер ждёт');
  t.ok(x.sim.takeContainer(s, 0), 'контейнер взят');
  t.ok(!x.sim.takeContainer(s, 0), 'второй раз не выдаётся');
};
exports['темп: три тира за 5 мин, восемь за 30 мин, двигатель за 90–120 мин'] = function (t) {
  var x = load();
  var r = bot.colony(x.game, x.sim, x.cfg, 120, { stopAtEngine: true });
  t.ok(r.firstBuySec !== null && r.firstBuySec <= 10, 'первая покупка: ' + r.firstBuySec);
  t.ok(r.tier3Min !== null && r.tier3Min <= 5, 'третий тир: ' + r.tier3Min);
  t.ok(r.tier8Min !== null && r.tier8Min <= 30, 'восьмой тир: ' + r.tier8Min);
  t.ok(r.engineMin !== null && r.engineMin >= 90 && r.engineMin <= 120, 'двигатель: ' + r.engineMin);
  t.equal(x.sim.validate(r.state), null, 'состояние бота');
};
