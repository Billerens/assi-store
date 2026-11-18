// Device checks use the engine's standard kit plus the game's own rules and pacing.
var kit = require('../engine/checks-kit.js');
var Core = require('../engine/core.js');
var Rng = require('../engine/rng.js');
var N = require('./numbers.js');
var checks = kit.standard(__dirname, {
  pace: false,
  firstBuySec: 10,
  play: function (state, ctx, sim) { return sim.buyAll(state, ctx.config); }
});
for (var name in checks) exports[name] = checks[name];
function load() {
  var id = kit.idOf(__dirname);
  var axiko = require('lib/axiko');
  var game = JSON.parse(axiko.files.read('modules/games/' + id + '/game.json'));
  game.id = id;
  return { game: game, sim: require('modules/games/' + id + '/sim.js'), cfg: kit.configOf(game, 'modules/games/' + id) };
}
function context(x, now, rng) { return { now: now, config: x.cfg, rng: rng || Rng.make(1977), mult: 1, links: {}, stock: {}, offline: false }; }
function fresh(x) { return Core.newState(x.game, x.sim, context(x, 1805176800000)); }
function points(x, state, value) { state.run.points = N.str(value); x.sim.syncOut(state, x.cfg); }
exports['темп 0,5 с: первая покупка сразу, Сжатие 20–30 мин, потолок к двум часам'] = function (t) {
  var x = load(), state = fresh(x), now = state.lastTick, first = null, bought = null;
  var rng = Rng.make(1929);
  for (var elapsed = 0; elapsed < 7200; elapsed += 0.5) {
    if (x.sim.buyAll(state, x.cfg) && bought === null) bought = elapsed;
    now += 500;
    x.sim.tick(state, 0.5, context(x, now, rng));
    if (first === null && N.gte(x.sim.rawGain(state, 'compression', x.cfg), 1)) first = elapsed + 0.5;
  }
  t.ok(bought !== null && bought <= 10, 'первая покупка ' + bought + ' с');
  t.ok(first >= 1200 && first <= 1800, 'Сжатие ' + first / 60 + ' мин');
  t.ok(N.lte(state.run.points, '1e22'), 'Очки к двум часам: ' + state.run.points);
  t.equal(x.sim.validate(state), null, 'состояние через два часа');
};
exports['Сжатие: награда, сброс, четыре открытия; Свёртка очищает Плотность'] = function (t) {
  var x = load(), state = fresh(x);
  for (var i = 1; i <= 4; i++) {
    points(x, state, '1e15');
    t.ok(Core.prestige(x.sim, x.game, state, 'compression', context(x, state.lastTick + i * 1000)).ok, 'Сжатие ' + i);
    t.equal(x.sim.unlocked(state, x.cfg), 4 + i, 'открыто ступеней');
    t.ok(N.eq(x.sim.currency(state, 'compression'), i), 'Плотность ' + i);
  }
  points(x, state, '1e80');
  t.ok(Core.prestige(x.sim, x.game, state, 'fold', context(x, state.lastTick + 5000)).ok, 'Свёртка');
  t.equal(state.layers.compression.count, 0, 'счётчик Сжатий');
  t.ok(N.isZero(x.sim.currency(state, 'compression')), 'Плотность не сброшена');
};
exports['числа 1e1500 и t1 проходят сохранение через движок'] = function (t) {
  var x = load(), state = fresh(x);
  points(x, state, '1e1500');
  state.run.tiers[0].amount = '1e900';
  t.equal(N.fmt(state.run.points), 'e1,50e3', 'вид порядка');
  var picked = Core.pick([{ json: JSON.stringify(state), seq: 1 }], x.game, x.sim);
  t.ok(picked.state, '1e1500: ' + JSON.stringify(picked.broken));
  points(x, state, 't1:2.5e17');
  picked = Core.pick([{ json: JSON.stringify(state), seq: 2 }], x.game, x.sim);
  t.ok(picked.state, 't1: ' + JSON.stringify(picked.broken));
  t.ok(N.eq(picked.state.run.points, state.run.points), 'изменилось расширенное число');
  t.ok(N.gt(N.sub('2e308', '1e308'), 0), 'вычитание на границе double');
};
exports['испытания: ограничения и постоянные награды, затем Переход 4'] = function (t) {
  var x = load(), state = fresh(x);
  state.meta.collapseUnlocked = true;
  for (var i = 1; i <= 8; i++) {
    t.ok(x.sim.startChallenge(state, i, context(x, state.lastTick)), 'начало ' + i);
    points(x, state, '1e80');
    if (i === 1 || i === 8) t.ok(!x.sim.buyResonance(state, x.cfg), 'Резонанс в испытании ' + i);
    if (i === 2 || i === 8) t.equal(x.sim.unlocked(state, x.cfg), 4, 'четыре ступени');
    t.ok(x.sim.completeChallenge(state, context(x, state.lastTick)), 'завершение ' + i);
    t.ok(state.meta.completed[i], 'награда ' + i);
  }
  x.sim.setCurrency(state, 'collapse', 1000, x.cfg);
  t.ok(x.sim.transition(state, 4, context(x, state.lastTick)), 'Переход 4');
  t.equal(x.sim.unlocked(state, x.cfg), 4, 'после Перехода ступени снова по одной за Сжатие');
  for (var n = 1; n <= 5; n++) {
    points(x, state, '1e15');
    t.ok(x.sim.reset(state, 'compression', context(x, state.lastTick)), 'Сжатие ' + n);
  }
  t.equal(x.sim.unlocked(state, x.cfg), 9, 'Полотно после пятого Сжатия');
  t.equal(x.sim.validate(state), null, 'состояние после Перехода');
};
