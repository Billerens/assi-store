'use strict';
const assert = require('assert');
const { open, ctx, test, done } = require('./env');
const x = open();
const { Core, Big, Rng, sim, game, cfg, N } = x;
const START = Date.UTC(2026, 10, 14, 6);
const HOUR = 3600000;
const metrics = {};
function fresh() { return Core.newState(game, sim, ctx(x, START)); }
function context(now, extra) { return ctx(x, now, extra); }
function points(st, value) { st.run.points = N.str(value); sim.syncOut(st, cfg); }
function currencySet(st, id, value) { return sim.setCurrency(st, id, value, cfg); }
function eq(actual, expected, message) { assert.ok(N.eq(actual, expected), (message || '') + ': ' + N.str(actual) + ' != ' + N.str(expected)); }
function near(actual, expected, message) { assert.ok(Math.abs(N.toNumber(N.div(actual, expected)) - 1) < 1e-9, message || N.str(actual)); }
function play(st, now) { return sim.buyAll(st, cfg); }
function valid(st) {
  assert.strictEqual(Core.validate(st, game), null);
  assert.strictEqual(sim.validate(st), null);
  assert.ok(!/NaN|Infinity/.test(JSON.stringify(st)));
}
function runBot(seconds, prestige) {
  const st = fresh();
  const rng = Rng.make(1929);
  let firstBuy = null, firstCompression = null, firstFold = null;
  const at = {};
  for (let elapsed = 0; elapsed < seconds; elapsed += 0.5) {
    const now = START + elapsed * 1000;
    if (play(st, now) && firstBuy === null) firstBuy = elapsed;
    sim.tick(st, 0.5, context(now + 500, { rng }));
    if (N.gte(sim.rawGain(st, 'compression', cfg), 1) && firstCompression === null) firstCompression = elapsed + 0.5;
    if (N.gte(sim.rawGain(st, 'fold', cfg), 1)) { firstFold = elapsed + 0.5; if (prestige) break; }
    if (prestige && N.gte(sim.rawGain(st, 'compression', cfg), N.max(1, N.mul(sim.currency(st, 'compression'), 2)))) {
      assert.ok(sim.reset(st, 'compression', context(now + 500)));
    }
    if ([300, 600, 1200, 1800, 3600, 7200].includes(elapsed + 0.5)) at[(elapsed + 0.5) / 60] = N.str(st.run.points);
  }
  return { st, firstBuy, firstCompression, firstFold, at };
}

test('новая игра: 10 Очков, четыре ступени, первая покупка сразу', () => {
  const st = fresh();
  eq(st.run.points, 10);
  assert.strictEqual(sim.unlocked(st, cfg), 4);
  assert.strictEqual(st.run.tiers.length, 9);
  assert.ok(sim.buy(st, 0, 'one', cfg));
  eq(st.run.points, 0);
  assert.strictEqual(st.run.tiers[0].bought, 1);
  eq(st.run.tiers[0].amount, 1);
  assert.ok(!sim.buy(st, 4, 'one', cfg));
  valid(st);
});

test('десяток: постоянная цена внутри, новый множитель и цена после десятого', () => {
  const st = fresh();
  points(st, 100);
  for (let i = 0; i < 9; i++) { eq(sim.cost(st, 0, cfg), 10); assert.ok(sim.buy(st, 0, 'one', cfg)); }
  eq(sim.multiplier(st, 0, cfg), 1);
  assert.ok(sim.buy(st, 0, 'one', cfg));
  eq(st.run.points, 0);
  eq(sim.cost(st, 0, cfg), 10000);
  eq(sim.multiplier(st, 0, cfg), 2);
  points(st, 30000);
  assert.ok(sim.buy(st, 0, 'ten', cfg));
  assert.strictEqual(st.run.tiers[0].bought, 13, 'доступна неполная покупка десятка');
  eq(st.run.points, 0);
});

test('произведённые ступени не считаются покупками и не повышают цену', () => {
  const st = fresh();
  st.run.tiers[1].amount = '10';
  sim.tick(st, 10, context(START + 10000));
  eq(st.run.tiers[0].amount, 20);
  eq(sim.cost(st, 0, cfg), 10);
  assert.strictEqual(st.run.tiers[0].bought, 0);
  assert.ok(N.gt(st.run.points, 10));
});

test('цепь: один шаг совпадает с малыми шагами при неизменных множителях', () => {
  const a = fresh();
  for (let i = 0; i < 4; i++) a.run.tiers[i].amount = String(5 - i);
  const b = Core.clone(a);
  sim.tick(a, 10, context(START + 10000));
  for (let i = 1; i <= 100; i++) sim.tick(b, 0.1, context(START + i * 100));
  near(a.run.points, b.run.points);
  for (let i = 0; i < 4; i++) near(a.run.tiers[i].amount, b.run.tiers[i].amount);
});

test('Резонанс и вехи 100/200/500 покупок дают заявленные множители', () => {
  const st = fresh();
  points(st, '1e10');
  assert.ok(sim.buyResonance(st, cfg));
  assert.strictEqual(st.run.resonance, 1);
  near(sim.multiplier(st, 0, cfg), 1.12);
  for (const [bought, milestones] of [[99, 0], [100, 1], [199, 1], [200, 2], [500, 3]]) {
    st.run.tiers[0].bought = bought;
    near(sim.multiplier(st, 0, cfg), N.mul(N.mul(N.pow(2, Math.floor(bought / 10)), 1.12), N.pow(3, milestones)));
  }
});

test('прибыль Сжатия, Свёртки, Коллапса соответствует формулам и порогам', () => {
  const st = fresh();
  for (const [p, gain] of [['1e14', 0], ['1e15', 1], ['1e20', 2], ['1e30', 8], ['1e50', 128]]) {
    points(st, p); eq(sim.rawGain(st, 'compression', cfg), gain, p);
  }
  for (const [p, gain] of [['1e79', 0], ['1e80', 1], ['1e100', 2], ['1e120', 4]]) {
    points(st, p); eq(sim.rawGain(st, 'fold', cfg), gain, p);
  }
  for (const [p, gain] of [['1e299', 0], ['1e300', 1], ['1e400', 2], ['1e500', 4]]) {
    points(st, p); eq(sim.rawGain(st, 'collapse', cfg), gain, p);
  }
  points(st, '1e20'); currencySet(st, 'fold', 3); eq(sim.rawGain(st, 'compression', cfg), 16);
  points(st, '1e80'); currencySet(st, 'collapse', 2); eq(sim.rawGain(st, 'fold', cfg), 9);
});

test('первые четыре Сжатия открывают ступени 5–8; Свёртка сбрасывает Плотность и счётчик', () => {
  const st = fresh();
  for (let n = 1; n <= 4; n++) {
    points(st, '1e15');
    assert.ok(Core.prestige(sim, game, st, 'compression', context(START + n * 1000)).ok);
    assert.strictEqual(sim.unlocked(st, cfg), 4 + n);
    eq(st.run.points, 10);
    assert.strictEqual(st.run.resonance, 0);
    assert.strictEqual(st.run.tiers[0].bought, 0);
    eq(sim.currency(st, 'compression'), n);
  }
  points(st, '1e80');
  assert.ok(Core.prestige(sim, game, st, 'fold', context(START + 5000)).ok);
  eq(sim.currency(st, 'compression'), 0);
  assert.strictEqual(st.layers.compression.count, 0);
  eq(sim.currency(st, 'fold'), 1);
  valid(st);
});

test('узлы с уровнями: без потолка, цена растёт, сила складывается, старое сохранение true = уровень 1', () => {
  const st = fresh();
  st.layers.fold.count = 1; st.meta.foldUnlocked = true; st.meta.collapseUnlocked = true;
  currencySet(st, 'fold', 1e9); currencySet(st, 'collapse', 1e9);
  const base = cfg['upgrade.echo.cost'], growth = cfg['upgrade.echo.growth'];
  for (let n = 0; n < 6; n++) {
    eq(sim.upgradeCost(st, 'echo', cfg, 'fold'), base * Math.pow(growth, n));
    const before = N.toNumber(sim.currency(st, 'fold'));
    assert.ok(sim.buyUpgrade(st, 'echo', cfg, 'fold'), 'уровень ' + (n + 1));
    near(sim.currency(st, 'fold'), before - base * Math.pow(growth, n));
    assert.strictEqual(sim.upgradeLevel(st, 'echo', 'fold'), n + 1);
  }
  st.run.tiers[0].bought = 10;
  const step = cfg['tier.echoMult'] - cfg['tier.mult'];
  assert.ok(Math.abs(N.toNumber(sim.multiplier(st, 0, cfg)) - (cfg['tier.mult'] + 6 * step)) < 1e-9);
  for (let n = 0; n < 3; n++) assert.ok(sim.buyUpgrade(st, 'singularPower', cfg, 'collapse'));
  assert.ok(Math.abs(N.toNumber(sim.multiplier(st, 0, cfg)) - (cfg['tier.mult'] + 6 * step) * Math.pow(cfg['collapse.powerMult'], 3)) < 1e-6);
  for (let n = 0; n < 4; n++) assert.ok(sim.buyUpgrade(st, 'extraFold', cfg, 'fold'));
  for (let n = 0; n < 2; n++) assert.ok(sim.buyUpgrade(st, 'foldMemory', cfg, 'collapse'));
  const plain = fresh(); points(plain, cfg['fold.threshold']); points(st, cfg['fold.threshold']);
  currencySet(st, 'collapse', 0);
  eq(sim.rawGain(st, 'fold', cfg), N.add(sim.rawGain(plain, 'fold', cfg), 4));
  // Разовые узлы остаются разовыми, а уровень не теряется при проверке сохранения.
  assert.ok(sim.buyUpgrade(st, 'memory', cfg, 'fold')); assert.ok(!sim.buyUpgrade(st, 'memory', cfg, 'fold'));
  assert.ok(!sim.repeatable('memory', cfg, 'fold') && sim.repeatable('night', cfg, 'fold'));
  valid(st);
  const old = fresh(); old.meta.foldUnlocked = true; old.meta.foldTree.echo = true; currencySet(old, 'fold', 1000);
  assert.strictEqual(sim.upgradeLevel(old, 'echo', 'fold'), 1);
  eq(sim.upgradeCost(old, 'echo', cfg, 'fold'), base * growth);
  assert.ok(sim.buyUpgrade(old, 'echo', cfg, 'fold')); assert.strictEqual(old.meta.foldTree.echo, 2);
  valid(old);
});

test('дерево: затраты, защита от повторной покупки, память и сохранение после Коллапса', () => {
  const st = fresh();
  st.layers.fold.count = 1; st.meta.foldUnlocked = true;
  currencySet(st, 'fold', 100);
  for (const id of ['auto1', 'auto2', 'autoResonance', 'memory', 'autoCompression', 'denseStart', 'echo', 'rhythm', 'night', 'extraFold']) assert.ok(sim.buyUpgrade(st, id, cfg, 'fold'), id);
  const remaining = N.str(sim.currency(st, 'fold'));
  assert.ok(!sim.buyUpgrade(st, 'memory', cfg, 'fold'));
  eq(sim.currency(st, 'fold'), remaining);
  points(st, '1e15'); assert.ok(sim.reset(st, 'compression', context(START + 1000)));
  for (let i = 0; i < sim.unlocked(st, cfg); i++) eq(st.run.tiers[i].amount, 10);
  assert.ok(sim.unlocked(st, cfg) >= 5);
  points(st, '1e300'); assert.ok(Core.prestige(sim, game, st, 'collapse', context(START + 2000)).ok);
  assert.ok(st.meta.foldTree.memory && st.meta.foldTree.echo);
  eq(sim.currency(st, 'fold'), 0);
  valid(st);
});

test('испытания 1–3 и 8 запрещают Резонанс, ограничивают ступени и усиливают рост цен', () => {
  const st = fresh();
  st.layers.collapse.count = 1; st.meta.collapseUnlocked = true;
  for (const id of [1, 2, 3, 8]) {
    assert.ok(sim.startChallenge(st, id, context(START + id * 1000)));
    points(st, '1e50');
    if (id === 1 || id === 8) assert.ok(!sim.buyResonance(st, cfg));
    if (id === 2 || id === 8) assert.strictEqual(sim.unlocked(st, cfg), 4);
    if (id === 3 || id === 8) { st.run.tiers[0].bought = 10; eq(sim.cost(st, 0, cfg), '1e7'); }
    sim.exitChallenge(st, context(START + id * 1000 + 500));
  }
});

test('испытания 4/5/6/7: цепь отключена, Плотность отключена, потеря раз в минуту, лимит 100', () => {
  const st = fresh(); st.layers.collapse.count = 1; st.meta.collapseUnlocked = true;
  sim.startChallenge(st, 4, context(START));
  st.run.tiers[1].amount = '5';
  const tier1 = N.str(st.run.tiers[0].amount);
  sim.tick(st, 10, context(START + 10000));
  eq(st.run.tiers[0].amount, tier1); assert.ok(N.gt(st.run.points, 10));
  sim.startChallenge(st, 5, context(START)); currencySet(st, 'compression', '1e20');
  eq(sim.multiplier(st, 0, cfg), 1);
  sim.startChallenge(st, 6, context(START)); points(st, '1e10');
  sim.tick(st, 120, context(START + 120000)); eq(st.run.points, '1e8');
  sim.startChallenge(st, 7, context(START)); points(st, '1e200');
  for (let i = 0; i < 120; i++) sim.buy(st, 0, 'one', cfg);
  assert.strictEqual(st.run.totalBought, 100);
  assert.strictEqual(st.run.tiers[0].bought, 100);
  assert.ok(!sim.buy(st, 1, 'one', cfg));
  valid(st);
});

test('восемь испытаний закрываются Свёрткой, дают награды и открывают Переход 4', () => {
  const st = fresh(); st.layers.collapse.count = 1; st.meta.collapseUnlocked = true;
  for (let id = 1; id <= 8; id++) {
    assert.ok(sim.startChallenge(st, id, context(START + id * 1000)));
    points(st, '1e80');
    assert.ok(sim.completeChallenge(st, context(START + id * 1000 + 500)));
    assert.ok(st.meta.completed[id], 'награда испытания ' + id);
    assert.strictEqual(st.meta.challenge, 0);
  }
  currencySet(st, 'collapse', 1000);
  assert.ok(sim.transition(st, 4, context(START + 10000)));
  eq(sim.currency(st, 'layer4'), 1);
  assert.strictEqual(st.meta.highestLayer, 4);
  // «Ступень 9 Полотно»: the ladder is one stage per Compression, now up to nine.
  assert.strictEqual(sim.unlocked(st, cfg), 4);
  for (let n = 1; n <= 5; n++) {
    points(st, '1e15');
    assert.ok(sim.reset(st, 'compression', context(START + 20000 + n * 1000)));
    assert.strictEqual(sim.unlocked(st, cfg), 4 + n, 'Сжатие ' + n);
  }
  points(st, '1e15');
  assert.ok(sim.reset(st, 'compression', context(START + 30000)));
  assert.strictEqual(sim.unlocked(st, cfg), 9, 'больше девяти ступеней нет');
  valid(st);
});

test('Переходы продолжаются общим шаблоном и сбрасывают только нижние слои', () => {
  const st = fresh(); st.meta.completed[8] = true;
  currencySet(st, 'collapse', 999);
  assert.ok(!sim.transition(st, 4, context(START)));
  for (let n = 4; n <= 20; n++) {
    const lower = n === 4 ? 'collapse' : 'layer' + (n - 1);
    currencySet(st, lower, 8000);
    assert.ok(sim.transition(st, n, context(START + n * 1000)), 'Переход ' + n);
    eq(sim.currency(st, 'layer' + n), 2);
    eq(sim.currency(st, lower), 0);
    assert.strictEqual(st.meta.highestLayer, n);
    valid(st);
  }
});

test('сохранения 1e1500, ступени 1e900 и t1 читаются движком без потери', () => {
  const st = fresh(); points(st, '1e1500'); st.run.tiers[0].amount = '1e900';
  assert.strictEqual(N.fmt(st.run.points), 'e1,50e3');
  let picked = Core.pick([{ json: JSON.stringify(st), seq: 1 }], game, sim);
  assert.ok(picked.state, JSON.stringify(picked.broken));
  eq(picked.state.run.points, '1e1500');
  points(st, 't1:2.5e17'); st.run.tiers[0].amount = 't1:1e16';
  picked = Core.pick([{ json: JSON.stringify(st), seq: 2 }], game, sim);
  assert.ok(picked.state, JSON.stringify(picked.broken));
  eq(picked.state.run.points, 't1:2.5e17');
  assert.ok(!/NaN|Infinity/.test(N.fmt(picked.state.run.points)));
  valid(picked.state);
});

test('связки: множитель поездки, усиление шагов и сундук с 30 минутами производства', () => {
  const st = fresh(); st.run.tiers[0].amount = '5';
  const base = Core.clone(st), trip = Core.clone(st);
  sim.tick(base, 10, context(START + 10000));
  sim.tick(trip, 10, context(START + 10000, { mult: 2 }));
  near(N.sub(trip.run.points, 10), N.mul(N.sub(base.run.points, 10), 2));
  sim.boost(st, START, cfg);
  sim.tick(st, 10, context(START + 10000));
  near(N.sub(st.run.points, 10), N.mul(N.sub(base.run.points, 10), 3));
  const chest = fresh(); chest.run.tiers[0].amount = '2';
  const loot = sim.chest(chest, Rng.make(3), cfg);
  assert.ok(loot.items.length);
  near(N.sub(chest.run.points, 10), 3600);
});

test('ставка Плотностью проходит через ящик один раз', () => {
  const st = fresh(); currencySet(st, 'compression', 100);
  const entries = [{ id: 'take-test', at: START, op: 'take', currency: 'density', amount: '10' }, { id: 'win-test', at: START + 1, op: 'add', currency: 'density', ofTake: 'take-test', mult: 2 }];
  Core.applyInbox(st, game, sim, entries, context(START + 1000));
  eq(sim.currency(st, 'compression'), 110);
  Core.applyInbox(st, game, sim, entries, context(START + 2000));
  eq(sim.currency(st, 'compression'), 110);
});

let economy = null;
test('бот 0,5 с: покупка до 10 с, Сжатие 20–30 мин, без сброса к 2 ч не выше 1e22', () => {
  economy = runBot(7200, false);
  metrics.firstBuySec = economy.firstBuy;
  metrics.firstCompressionMin = economy.firstCompression / 60;
  metrics.noCompression2h = N.str(economy.st.run.points);
  console.log('  Темп: ' + JSON.stringify({ ...metrics, atMinutes: economy.at }));
  assert.ok(economy.firstBuy !== null && economy.firstBuy <= 10);
  assert.ok(economy.firstCompression >= 1200 && economy.firstCompression <= 1800, 'Сжатие: ' + economy.firstCompression / 60 + ' мин');
  assert.ok(N.lte(economy.st.run.points, '1e22'), N.str(economy.st.run.points));
  valid(economy.st);
});

function agreement(automated) {
  const setup = runBot(600, false).st;
  if (automated) {
    setup.layers.fold.count = 1; setup.meta.foldUnlocked = true;
    setup.layers.compression.count = 4;
    currencySet(setup, 'fold', 100);
    for (let i = 1; i <= 8; i++) assert.ok(sim.buyUpgrade(setup, 'auto' + i, cfg, 'fold'));
    assert.ok(sim.buyUpgrade(setup, 'autoResonance', cfg, 'fold'));
  }
  const bought = setup.run.tiers.map((v) => v.bought);
  const offline = Core.clone(setup), online = Core.clone(setup);
  const from = START + 600000, to = from + 8 * HOUR;
  const plan = Core.plan(from, to, cfg, 0);
  const report = Core.runOffline(sim, offline, game, plan, null, (seg) => context(seg.to), cfg);
  const rng = Rng.make(1977);
  for (let second = 1; second <= 28800; second++) sim.tick(online, 1, context(from + second * 1000, { rng }));
  const a = N.log10(offline.run.points), b = N.log10(online.run.points);
  const difference = Math.abs(a - b) / Math.max(1, Math.abs(b));
  if (automated) assert.ok(offline.run.tiers.some((v, i) => v.bought > bought[i]), 'автопокупки не сработали');
  else assert.deepStrictEqual(offline.run.tiers.map((v) => v.bought), bought, 'покупка до автоматизации');
  assert.ok(N.gt(offline.run.points, setup.run.points));
  assert.ok(difference <= 0.01, 'порядки отличаются: ' + a + ' против ' + b);
  assert.ok(report.events.length, 'нет сводки');
  valid(offline); valid(online);
  return { offline: N.str(offline.run.points), online: N.str(online.run.points), orderErrorPct: difference * 100 };
}

test('8 часов до Свёртки: без автопокупок, онлайн и офлайн в пределах 1% порядка', () => {
  metrics.offlineBefore = agreement(false);
  console.log('  Офлайн до Свёртки: ' + JSON.stringify(metrics.offlineBefore));
});

test('8 часов после автопокупок: ступени покупаются, онлайн и офлайн в пределах 1% порядка', () => {
  metrics.offlineAfter = agreement(true);
  console.log('  Офлайн с автоматизацией: ' + JSON.stringify(metrics.offlineAfter));
});

test('потолок офлайна — 24 часа, часы назад не дают производство', () => {
  const day = Core.plan(START, START + 48 * HOUR, cfg, 0);
  assert.strictEqual(day.creditedMs, 24 * HOUR);
  const back = Core.plan(START, START - HOUR, cfg, 0);
  assert.strictEqual(back.creditedMs, 0);
});

test('награды испытаний меняют Резонанс, ранние ступени, цены, Плотность и сотую покупку', () => {
  const st = fresh();
  st.meta.completed[1] = true; st.run.resonance = 1;
  near(sim.multiplier(st, 0, cfg), 1.15);
  st.meta.completed[2] = true; near(sim.multiplier(st, 0, cfg), 11.5);
  st.meta.completed[3] = true; st.run.tiers[0].bought = 10;
  eq(sim.cost(st, 0, cfg), 9000);
  st.run.tiers[0].bought = 0; st.run.resonance = 0; st.meta.completed = { 5: true };
  currencySet(st, 'compression', 5); eq(sim.multiplier(st, 0, cfg), 6);
  st.meta.completed = { 7: true }; st.run.totalBought = 99; points(st, 0);
  assert.ok(sim.buy(st, 0, 'one', cfg)); eq(st.run.points, 0);
  assert.strictEqual(st.run.totalBought, 100);
  assert.ok(!sim.buy(st, 0, 'one', cfg));
});

test('все восемь флуктуаций применяют эффект; Разлом ждёт выбора, Штиль усиливает следующую', () => {
  for (let id = 1; id <= 8; id++) {
    const st = fresh();
    st.run.tiers[0].amount = '2'; st.run.tiers[1].amount = '1';
    st.run.event = { id, expires: START + 20000, power: 1 };
    if (id === 6) assert.ok(!sim.tapEvent(st, '', context(START + 1000)));
    assert.ok(sim.tapEvent(st, id === 6 ? 'density' : '', context(START + 1000)));
    assert.strictEqual(st.run.event, null);
    if (id === 1) { assert.strictEqual(st.run.eventBoost, 3); assert.strictEqual(st.run.eventBoostUntil, START + 31000); }
    if (id === 2) { assert.strictEqual(st.run.tiers[0].bought, 10); eq(st.run.points, 10); }
    if (id === 3) assert.ok(N.gt(st.run.points, 130));
    if (id === 4) assert.strictEqual(st.run.resonance, 1);
    if (id === 5) assert.strictEqual(st.run.eventPower, 2);
    if (id === 6) assert.strictEqual(st.run.densityFactor, 1.1);
    if (id === 7) eq(st.run.tiers[7].amount, 10);
    if (id === 8) assert.strictEqual(st.run.mirrorUntil, START + 61000);
    valid(st);
  }
  const st = fresh(); st.run.event = { id: 1, expires: START, power: 1 };
  assert.ok(!sim.tapEvent(st, '', context(START + 1)));
  st.run.event = { id: 4, expires: START + 20000, power: 1 };
  assert.ok(!sim.tapEvent(st, '', context(START + 1000, { offline: true })));
});

test('флуктуации генерируются через 2–4 минуты, только восемь ID и только онлайн', () => {
  const st = fresh(), rng = Rng.make(998);
  sim.tick(st, 0.1, context(START + 100, { rng }));
  assert.ok(st.run.nextEventAt >= START + 120100 && st.run.nextEventAt <= START + 240100);
  const seen = new Set();
  for (let i = 1; i <= 200; i++) {
    st.run.nextEventAt = START + i * 300000;
    sim.tick(st, 0.1, context(st.run.nextEventAt, { rng }));
    assert.ok(st.run.event && st.run.event.id >= 1 && st.run.event.id <= 8, JSON.stringify(st.run.event));
    seen.add(st.run.event.id); st.run.event = null;
  }
  assert.strictEqual(seen.size, 8);
  sim.tick(st, 300, context(START + 100000000, { rng, offline: true }));
  assert.strictEqual(st.run.event, null);
});

test('Ритм: 50 попаданий, одна бонусная Складка за слой, промах снимает серию', () => {
  const st = fresh(); st.meta.foldTree.rhythm = true;
  for (let beat = 0; beat < 50; beat++) assert.ok(sim.rhythmTap(st, START + beat * 1000, cfg));
  assert.strictEqual(st.run.rhythm.combo, 50); assert.ok(st.run.rhythm.bonus);
  points(st, '1e80'); eq(sim.rawGain(st, 'fold', cfg), 2);
  assert.ok(!sim.rhythmTap(st, START + 49500, cfg));
  assert.strictEqual(st.run.rhythm.combo, 0); assert.strictEqual(st.run.rhythm.until, 0);
  assert.ok(sim.reset(st, 'compression', context(START + 50000)));
  assert.ok(st.run.rhythm.bonus, 'бонус серии до Свёртки сохраняется через Сжатие');
  points(st, '1e80'); assert.ok(sim.reset(st, 'fold', context(START + 51000)));
  eq(sim.currency(st, 'fold'), 2); assert.ok(!st.run.rhythm.bonus);
});

test('авто-Сжатие соблюдает порог ×N и действует в офлайне', () => {
  const st = fresh(); st.meta.foldTree.autoCompression = true;
  st.meta.auto.compression = true; st.meta.auto.compressionRatio = 2;
  currencySet(st, 'compression', 8); points(st, '1e30');
  sim.tick(st, cfg['auto.intervalSec'], context(START + cfg['auto.intervalSec'] * 1000, { offline: true }));
  assert.strictEqual(st.layers.compression.count, 0, '8 < 8×2');
  points(st, '1e35');
  sim.tick(st, cfg['auto.intervalSec'], context(START + cfg['auto.intervalSec'] * 2000, { offline: true }));
  assert.strictEqual(st.layers.compression.count, 1); eq(sim.currency(st, 'compression'), 24);
});

test('Длинная ночь и награда испытания 6 дают коэффициенты 1,25 и 2', () => {
  const st = fresh(); st.run.tiers[0].amount = '2';
  const base = Core.clone(st), night = Core.clone(st), reward = Core.clone(st);
  night.meta.foldTree.night = true; reward.meta.completed[6] = true;
  sim.offline(base, 600, context(START + 600000));
  sim.offline(night, 600, context(START + 600000));
  sim.offline(reward, 600, context(START + 600000));
  near(N.sub(night.run.points, 10), N.mul(N.sub(base.run.points, 10), 1.25));
  near(N.sub(reward.run.points, 10), N.mul(N.sub(base.run.points, 10), 2));
});

test('движковое удвоение офлайна синхронизирует Очки после сохранения и загрузки', () => {
  const st = fresh(); st.run.tiers[0].amount = '1';
  const plan = Core.plan(START, START + HOUR, cfg, 0);
  const report = Core.runOffline(sim, st, game, plan, null, (seg) => context(seg.to), cfg);
  const before = N.of(st.run.points);
  st.run.enginePoints = Big.add(st.run.enginePoints, report.gains.points);
  const loaded = Core.pick([{ json: JSON.stringify(st), seq: 1 }], game, sim);
  assert.ok(loaded.state, JSON.stringify(loaded.broken));
  sim.tick(loaded.state, 0, context(START + HOUR));
  eq(loaded.state.run.points, N.add(before, N.sub(before, 10)));
  valid(loaded.state);
});
test('расширенная Плотность: списание всей ставки и последующий выигрыш не делят на ноль', () => {
  const st = fresh(); currencySet(st, 'compression', 't1:2e17');
  Core.applyInbox(st, game, sim, [{ id: 'all', at: START, op: 'take', currency: 'density', percent: 1 }], context(START));
  eq(sim.currency(st, 'compression'), 0);
  Core.applyInbox(st, game, sim, [{ id: 'later', at: START + 1, op: 'add', currency: 'density', amount: '7' }], context(START + 1));
  eq(sim.currency(st, 'compression'), 7);
  valid(st);
});

test('достижения хранят время в формате движка и передаются в жизненные ачивки', () => {
  const st = fresh(); points(st, '1e1000');
  sim.tick(st, 0.1, context(START + 100));
  for (const id of ['googol', 'beyond', 'order-order']) {
    assert.strictEqual(typeof st.meta.achievements[id], 'number', id);
    assert.ok(st.meta.achievements[id] > 0);
  }
  assert.ok(Core.unreported(st, []).includes('googol'));
  valid(st);
});
test('восемь правил Переходов: цены, Резонанс, Ритм, остаток Очков, авто-Свёртка, награда и цепь', () => {
  const st = fresh(); st.meta.highestLayer = 5; st.run.tiers[0].bought = 10;
  eq(sim.cost(st, 0, cfg), 9000);
  st.meta.highestLayer = 13; near(sim.cost(st, 0, cfg), 8100);
  st.meta.highestLayer = 6; st.run.tiers[0].bought = 0; st.run.resonance = 2;
  currencySet(st, 'compression', 10);
  near(sim.multiplier(st, 0, cfg), N.mul(N.pow(1.12, 2), N.add(1, N.mul(5, N.pow(1.12, 2)))));
  st.meta.highestLayer = 7; st.meta.foldTree.rhythm = true;
  sim.rhythmTap(st, START, cfg); sim.rhythmTap(st, START + 1000, cfg);
  assert.strictEqual(st.run.rhythm.until - (START + 1000), 16000);
  st.meta.highestLayer = 8; points(st, '1e20');
  assert.ok(sim.reset(st, 'compression', context(START + 2000))); eq(st.run.points, '1e19');
  st.meta.highestLayer = 9; st.meta.auto.fold = true; points(st, '1e80');
  sim.tick(st, cfg['auto.intervalSec'], context(START + 2000 + cfg['auto.intervalSec'] * 1000));
  assert.strictEqual(st.layers.fold.count, 1); eq(sim.currency(st, 'fold'), 1);
  st.meta.auto.fold = false; st.meta.highestLayer = 10; currencySet(st, 'collapse', 3); points(st, '1e80');
  eq(sim.rawGain(st, 'fold', cfg), 30);
  const a = fresh(); a.meta.highestLayer = 10; a.run.tiers[2].amount = '100';
  const b = Core.clone(a); b.meta.highestLayer = 11;
  sim.tick(a, 1, context(START + 1000)); sim.tick(b, 1, context(START + 1000));
  eq(N.sub(b.run.tiers[0].amount, a.run.tiers[0].amount), 1);
  assert.strictEqual(sim.rule(b, 7), 1);
  b.meta.highestLayer = 19; assert.strictEqual(sim.rule(b, 7), 2);
});
test('повреждённые расширенные валюты и счётчики отвергаются при загрузке', () => {
  const corruptions = [
    (s) => { s.layers.compression.state.extCurrency = 'oops'; },
    (s) => { s.layers.compression.state.extCurrency = '-1'; },
    (s) => { s.layers.compression.state.engineSeen = 'oops'; },
    (s) => { s.run.tiers[0].bought = -1; },
    (s) => { s.run.tiers[0].bought = '1'; },
    (s) => { s.run.resonance = -1; },
    (s) => { s.run.resonance = 'abc'; },
    (s) => { s.run.totalBought = -1; },
    (s) => { s.run.totalBought = '2'; },
    (s) => { s.meta.highestLayer = -1; },
    (s) => { s.meta.highestLayer = '4'; },
    (s) => { s.meta.challenge = 9; }
  ];
  for (const damage of corruptions) {
    const st = fresh(); damage(st);
    const result = Core.pick([{ json: JSON.stringify(st), seq: 1 }], game, sim);
    assert.strictEqual(result.state, null, damage.toString());
    assert.ok(result.broken.length);
  }
});
test('Переход сбрасывает деревья и автоматизацию нижних слоёв, сохраняет испытания', () => {
  const st = fresh();
  st.meta.completed[1] = true; st.meta.completed[8] = true;
  st.meta.foldTree = { memory: true, echo: true, auto1: true, autoResonance: true, autoCompression: true };
  st.meta.collapseTree = { singularPower: true, challengeMemory: true };
  st.meta.auto.tiers[0] = true; st.meta.auto.resonance = true; st.meta.auto.compression = true;
  currencySet(st, 'collapse', 1000);
  assert.ok(sim.transition(st, 4, context(START + 1000)));
  assert.deepStrictEqual(st.meta.foldTree, {}); assert.deepStrictEqual(st.meta.collapseTree, {});
  assert.ok(st.meta.auto.tiers.every((v) => !v));
  assert.ok(!st.meta.auto.resonance && !st.meta.auto.compression && !st.meta.auto.fold);
  assert.ok(st.meta.completed[1] && st.meta.completed[8]);
  assert.ok(st.run.tiers.every((v) => N.isZero(v.amount) && v.bought === 0));
  valid(st);
});

test('Память ступеней оставляет десятки только после Сжатия, не Свёртки и Коллапса', () => {
  const st = fresh(); st.meta.foldTree.memory = true;
  points(st, '1e15'); assert.ok(sim.reset(st, 'compression', context(START + 1000)));
  for (let i = 0; i < sim.unlocked(st, cfg); i++) {
    eq(st.run.tiers[i].amount, 10);
    assert.strictEqual(st.run.tiers[i].bought, 0, 'память — штуки, а не покупки: ни десятка ×2, ни цены выше');
    eq(sim.cost(st, i, cfg), cfg['tier.' + (i + 1) + '.cost']);
  }
  assert.strictEqual(st.run.totalBought, 0);
  points(st, '1e80'); assert.ok(sim.reset(st, 'fold', context(START + 2000)));
  assert.ok(st.run.tiers.every((v) => N.isZero(v.amount) && v.bought === 0));
  points(st, '1e300'); assert.ok(sim.reset(st, 'collapse', context(START + 3000)));
  assert.ok(st.run.tiers.every((v) => N.isZero(v.amount) && v.bought === 0));
  assert.ok(st.meta.foldTree.memory, 'сам узел переживает Коллапс');
  valid(st);
});
test('порционный офлайн экрана совпадает с движком, применяет бонусы и отдаёт управление', () => {
  const initial = fresh(); initial.meta.foldUnlocked = true; initial.layers.compression.count = 4;
  initial.run.tiers[0].amount = '1';
  initial.meta.foldTree.night = true; initial.meta.completed[6] = true;
  for (let i = 0; i < 8; i++) { initial.meta.foldTree['auto' + (i + 1)] = true; initial.meta.auto.tiers[i] = true; }
  sim.boost(initial, START, cfg);
  const direct = Core.clone(initial), stepped = Core.clone(initial);
  const plan = Core.plan(START, START + 8 * HOUR, cfg, 0);
  const makeCtx = (seg) => context(seg.to);
  Core.runOffline(sim, direct, game, plan, null, makeCtx, cfg);
  const screenSim = Object.assign({}, sim); delete screenSim.offline;
  const runner = Core.runner(screenSim, stepped, game, plan, null, makeCtx, cfg);
  assert.strictEqual(runner.step(0), false, 'первый кусок должен вернуть управление экрану');
  assert.ok(runner.progress() > 0 && runner.progress() < 1);
  runner.step(Number.MAX_VALUE);
  assert.strictEqual(runner.report().formula, false);
  near(stepped.run.points, direct.run.points);
  assert.deepStrictEqual(stepped.run.tiers.map(t => t.bought), direct.run.tiers.map(t => t.bought));
  assert.deepStrictEqual(sim.offlineEvents(stepped), sim.offlineEvents(direct));
  assert.strictEqual(stepped.meta.offlineSummary.before, '1e1');
  assert.ok(sim.offlineEvents(stepped).length >= 3);
  valid(stepped);
});

done('infinity-layers sim');









