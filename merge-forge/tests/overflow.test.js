'use strict';
const assert = require('assert');
// The numbers of these tests (how many blades a double forging makes) were chosen with these
// milestone settings; what is tested here is the overflow, not the milestones.
const MILESTONES = { 'milestone.per10': 0.02, 'milestone.per50': 0.025, 'milestone.per100': 0.05, 'milestone.cap': 0.5 };
const { open, ctxOf, test, done } = require('./env');

const x = open();
Object.assign(x.cfg, MILESTONES);
const NOW = Date.UTC(2026, 10, 16, 9);
function fresh(seed) {
  const rng = x.Rng.make(seed || 512);
  const state = x.Core.newState(x.game, x.sim, ctxOf(x, NOW, rng));
  x.sim.ensure(state);
  return { state, rng };
}
function fill(state, level) {
  x.sim.openCells(state, x.cfg).forEach((cell) => { state.run.grid[cell] = level || 7; });
}
function sameNumber(actual, expected, message) {
  assert.strictEqual(x.Big.str(x.Big.of(actual)), x.Big.str(x.Big.of(expected)), message);
}

test('полное поле: ручная поковка продаёт только новый клинок, награды ждут места', () => {
  const { state, rng } = fresh();
  const r = state.run;
  fill(state);
  r.pending = [40, 41];
  r.forgeT = x.cfg['forge.tapSec'];
  const grid = JSON.stringify(r.grid);
  const pending = JSON.stringify(r.pending);
  const gold = r.gold;
  const earned = r.earned;
  const price = x.sim.sellPrice(state, x.cfg, x.sim.forgeLevel(state, x.cfg));
  assert.strictEqual(x.sim.tap(state, x.cfg, rng, NOW), true);
  assert.strictEqual(JSON.stringify(r.grid), grid);
  assert.strictEqual(JSON.stringify(r.pending), pending);
  sameNumber(r.gold, x.Big.add(gold, price));
  sameNumber(r.earned, x.Big.add(earned, price));
  assert.strictEqual(r.stats.forged, 1);
  assert.strictEqual(r.stats.sold, 1);
  assert.ok(r.forgeT > 0, 'следующая поковка требует новый цикл');
  assert.strictEqual(x.sim.validate(state), null);
});

test('двойная поковка: одно место занимает один клинок, остальная партия продаётся', () => {
  const { state, rng } = fresh();
  rng.chance = () => false; // This case fixes the optional fifth blade from the level-100 milestone.
  const r = state.run;
  fill(state);
  const cell = x.sim.openCells(state, x.cfg)[0];
  r.grid[cell] = 0;
  r.up.twin = 100;
  r.forgeT = 0;
  const grid = JSON.parse(JSON.stringify(r.grid));
  const gold = r.gold;
  const level = x.sim.forgeLevel(state, x.cfg);
  const price = x.sim.sellPrice(state, x.cfg, level);
  assert.strictEqual(x.sim.tap(state, x.cfg, rng, NOW), true);
  grid[cell] = level;
  assert.strictEqual(JSON.stringify(r.grid), JSON.stringify(grid));
  assert.strictEqual(r.stats.forged, 4);
  assert.strictEqual(r.stats.sold, 3);
  sameNumber(r.gold, x.Big.add(gold, x.Big.mul(price, 3)));
});

test('награда из сундука получает последнее место раньше ручной поковки', () => {
  const { state, rng } = fresh();
  const r = state.run;
  fill(state);
  const cell = x.sim.openCells(state, x.cfg)[0];
  r.grid[cell] = 0;
  r.pending = [40, 41];
  r.forgeT = 0;
  assert.strictEqual(x.sim.tap(state, x.cfg, rng, NOW), true);
  assert.strictEqual(r.grid[cell], 40);
  assert.strictEqual(JSON.stringify(r.pending), JSON.stringify([41]));
  assert.strictEqual(r.stats.forged, 1);
  assert.strictEqual(r.stats.sold, 1);
});

test('плавка, гроза, переплавка и заказ учитывают реальные уровни всей проданной партии', () => {
  const { state, rng } = fresh();
  rng.chance = () => false;
  const r = state.run;
  fill(state);
  r.up.steel = 2;
  r.up.twin = 100;
  r.up.melt = 100;
  r.up.remelt = 3;
  r.stormLeft = 2;
  r.event = { id: 'order', level: 6, reward: '137', done: false };
  r.forgeT = 0;
  const grid = JSON.stringify(r.grid);
  const gold = r.gold;
  const earned = r.earned;
  const proceeds = x.Big.add(x.Big.mul(x.sim.sellPrice(state, x.cfg, 6), 2), x.Big.mul(x.sim.sellPrice(state, x.cfg, 5), 2));
  assert.strictEqual(x.sim.tap(state, x.cfg, rng, NOW), true);
  assert.strictEqual(JSON.stringify(r.grid), grid);
  assert.strictEqual(r.stats.forged, 4);
  assert.strictEqual(r.stats.sold, 4);
  assert.strictEqual(r.stormLeft, 0);
  assert.strictEqual(r.event.done, true);
  assert.strictEqual(r.stats.orders, 1);
  assert.ok(state.meta.album[5] && state.meta.album[6]);
  assert.strictEqual(state.meta.bestLevel, 6);
  sameNumber(r.gold, x.Big.add(gold, x.Big.add(proceeds, 137)));
  sameNumber(r.earned, x.Big.add(earned, x.Big.add(proceeds, 137)));
  assert.strictEqual(r.lastForgeSale.count, 4);
  assert.strictEqual(r.lastForgeSale.at, NOW);
  sameNumber(r.lastForgeSale.gold, proceeds, 'квитанция не включает награду заказа');
});

test('лимит тапов и незавершённый цикл не выдают золото и не расходуют RNG', () => {
  const { state, rng } = fresh();
  const r = state.run;
  fill(state);
  r.forgeT = x.cfg['forge.interval'];
  r.tapBudget = 1;
  const gold = r.gold;
  const seed = rng.state();
  assert.strictEqual(x.sim.tap(state, x.cfg, rng, NOW), true);
  assert.strictEqual(r.forgeT, x.cfg['forge.interval'] - x.cfg['forge.tapSec']);
  assert.strictEqual(r.stats.forged, 0);
  sameNumber(r.gold, gold);
  assert.strictEqual(rng.state(), seed);
  const before = JSON.stringify(state);
  assert.strictEqual(x.sim.tap(state, x.cfg, rng, NOW), false);
  assert.strictEqual(JSON.stringify(state), before);
  assert.strictEqual(rng.state(), seed);
});

test('полное поле: пассивная ковка и офлайн продают каждый завершённый цикл без кликов', () => {
  const a = fresh();
  const b = fresh();
  [a, b].forEach(({ state }) => { fill(state); state.run.pending = [40, 41]; state.run.farmRate = '0e0'; });
  const gold = a.state.run.gold;
  const grid = JSON.stringify(a.state.run.grid);
  x.sim.tick(a.state, 3600, ctxOf(x, NOW + 3600000, a.rng, { offline: true }));
  const report = x.sim.offline(b.state, 3600, ctxOf(x, NOW + 3600000, b.rng, { offline: true }));
  const cycles = 3600 / x.cfg['forge.interval'];
  [a, b].forEach(({ state }) => {
    assert.strictEqual(state.run.stats.forged, cycles);
    assert.strictEqual(state.run.stats.sold, cycles);
    assert.strictEqual(state.run.taps, 0);
    sameNumber(state.run.gold, x.Big.add(gold, x.Big.mul(x.sim.sellPrice(state, x.cfg, 1), cycles)));
    assert.strictEqual(state.run.forgeT, x.cfg['forge.interval']);
    assert.strictEqual(JSON.stringify(state.run.grid), grid);
    assert.strictEqual(JSON.stringify(state.run.pending), JSON.stringify([40, 41]));
  });
  assert.strictEqual(a.rng.state(), b.rng.state());
  assert.ok(report.events.some(line => line === 'Новые излишки проданы: ' + cycles));
  assert.ok(report.events.every(line => !line.includes('горн ждёт')));
});

test('обычная и заполненная наковальня используют один таймер: клики только сокращают цикл', () => {
  const empty = fresh();
  const full = fresh();
  empty.state.run.grid.fill(0); fill(full.state);
  [empty, full].forEach(({ state }) => { state.run.farmRate = '0e0'; });
  for (let i = 0; i < 32; i++) {
    for (const { state, rng } of [empty, full]) {
      const now = NOW + i * 250;
      x.sim.tap(state, x.cfg, rng, now);
      x.sim.tick(state, 0.25, ctxOf(x, now + 250, rng, { offline: true }));
    }
    assert.strictEqual(full.state.run.forgeT, empty.state.run.forgeT);
    assert.strictEqual(full.state.run.stats.forged, empty.state.run.stats.forged);
  }
  assert.strictEqual(empty.state.run.stats.sold, 0);
  assert.strictEqual(full.state.run.stats.sold, full.state.run.stats.forged);
  const upperBound = Math.floor((8 + 32 * x.cfg['forge.tapSec']) / x.cfg['forge.interval']);
  assert.ok(full.state.run.stats.forged <= upperBound, 'тап не создаёт отдельную поковку');
  assert.ok(full.state.run.stats.forged >= upperBound - 1);
});

test('таймер автоматически размещает часть двойной партии и продаёт остаток', () => {
  const { state, rng } = fresh(); const r = state.run;
  rng.chance = () => false;
  fill(state); const cell = x.sim.openCells(state, x.cfg)[0]; r.grid[cell] = 0;
  r.up.twin = 100; r.forgeT = 1; r.farmRate = '0e0';
  const gold = r.gold, level = x.sim.forgeLevel(state, x.cfg), price = x.sim.sellPrice(state, x.cfg, level);
  x.sim.tick(state, 1, ctxOf(x, NOW + 1000, rng, { offline: true }));
  assert.strictEqual(r.grid[cell], level);
  assert.strictEqual(r.stats.forged, 4); assert.strictEqual(r.stats.sold, 3); assert.strictEqual(r.taps, 0);
  sameNumber(r.gold, x.Big.add(gold, x.Big.mul(price, 3)));
  assert.strictEqual(r.lastForgeSale.count, 3); sameNumber(r.lastForgeSale.gold, x.Big.mul(price, 3));
});

test('автопродажа и следующее нажатие не получают повторную оплату за тот же цикл', () => {
  const { state, rng } = fresh(); fill(state); state.run.farmRate = '0e0'; state.run.forgeT = 1;
  x.sim.tick(state, 1, ctxOf(x, NOW + 1000, rng, { offline: true }));
  const receipt = JSON.stringify(state.run.lastForgeSale), gold = state.run.gold;
  assert.strictEqual(x.sim.tap(state, x.cfg, rng, NOW + 1000), true);
  x.sim.tick(state, 0, ctxOf(x, NOW + 1000, rng, { offline: true }));
  assert.strictEqual(state.run.stats.sold, 1); sameNumber(state.run.gold, gold);
  assert.strictEqual(JSON.stringify(state.run.lastForgeSale), receipt);
  state.run.forgeT = 0;
  assert.strictEqual(x.sim.tap(state, x.cfg, rng, NOW + 1000), true);
  assert.strictEqual(state.run.lastForgeSale.serial, 2, 'квитанции различимы даже при одинаковом timestamp');
  assert.strictEqual(state.run.lastForgeSale.at, NOW + 1000);
  assert.strictEqual(state.run.stats.sold, 2);
});

test('автопоковка сохраняет приоритет сундука и не продаёт его очередь', () => {
  const { state, rng } = fresh(); const r = state.run;
  fill(state); const cell = x.sim.openCells(state, x.cfg)[0]; r.grid[cell] = 0;
  r.pending = [40, 41]; r.forgeT = 1; r.farmRate = '0e0';
  x.sim.tick(state, 1, ctxOf(x, NOW + 1000, rng, { offline: true }));
  assert.strictEqual(r.grid[cell], 40); assert.strictEqual(JSON.stringify(r.pending), '[41]');
  assert.strictEqual(r.stats.forged, 1); assert.strictEqual(r.stats.sold, 1);
  sameNumber(r.lastForgeSale.gold, x.sim.sellPrice(state, x.cfg, 1));
});

test('офлайн начисляет продажи один раз поверх отдельной ставки боя и её доли', () => {
  const a = fresh(), b = fresh();
  [a, b].forEach(({ state }) => { fill(state); state.run.farmRate = '7e0'; });
  const gold = a.state.run.gold, earned = a.state.run.earned;
  x.sim.offline(a.state, 80, ctxOf(x, NOW + 80000, a.rng, { offline: true, mult: 3 }));
  for (let i = 1; i <= 80; i++) x.sim.tick(b.state, 1, ctxOf(x, NOW + i * 1000, b.rng, { offline: true, mult: 3 }));
  const sales = x.Big.mul(x.sim.sellPrice(a.state, x.cfg, 1), 10);
  const battle = 7 * x.cfg['offline.share'] * 80 * 3;
  for (const { state } of [a, b]) {
    assert.strictEqual(state.run.stats.sold, 10);
    sameNumber(state.run.gold, x.Big.add(gold, x.Big.add(sales, battle)));
    sameNumber(state.run.earned, x.Big.add(earned, x.Big.add(sales, battle)));
  }
  assert.strictEqual(a.rng.state(), b.rng.state());
});

test('автоклик мастера ускоряет обычный цикл и при заполнении; лимит событий сохранён', () => {
  const { state, rng } = fresh(); fill(state); state.run.farmRate = '0e0';
  x.sim.forgeLayer(state).state.mf.auto = 4;
  const speed = x.sim.forgeSpeed(state, x.cfg), period = x.sim.forgeInterval(state, x.cfg, NOW);
  x.sim.tick(state, 40, ctxOf(x, NOW + 40000, rng, { offline: true }));
  assert.strictEqual(state.run.stats.forged, Math.floor(40 * speed / period));
  assert.strictEqual(state.run.stats.sold, state.run.stats.forged);
  const capped = fresh(); fill(capped.state); capped.state.run.farmRate = '0e0';
  const cfg = Object.assign({}, x.cfg, { 'offline.maxEvents': 2 });
  x.sim.offline(capped.state, 3600, ctxOf(x, NOW + 3600000, capped.rng, { offline: true, config: cfg }));
  assert.strictEqual(capped.state.run.stats.forged, 2);
  assert.strictEqual(capped.state.run.stats.sold, 2);
  assert.strictEqual(x.sim.validate(capped.state), null);
});

test('саламандра ускоряет тот же полный горн; отклонённые клики не дают опыт и продажи', () => {
  const { state, rng } = fresh(); fill(state); state.run.maxWave = 40;
  assert.ok(x.sim.outpost.choosePet(state, x.cfg, 'salamander').ok);
  state.run.outpost.pet.heat = x.cfg['outpost.salamander.taps'] - 1;
  state.run.forgeT = x.cfg['forge.tapSec'] + x.cfg['outpost.salamander.seconds'];
  state.run.tapBudget = 1;
  assert.strictEqual(x.sim.tap(state, x.cfg, rng, NOW), true);
  assert.strictEqual(state.run.stats.forged, 1); assert.strictEqual(state.run.stats.sold, 1);
  assert.strictEqual(state.meta.outpost.petXp.salamander, 1);
  const before = JSON.stringify(state), seed = rng.state();
  assert.strictEqual(x.sim.tap(state, x.cfg, rng, NOW), false);
  assert.strictEqual(JSON.stringify(state), before); assert.strictEqual(rng.state(), seed);
});

test('серия активных кликов и перезагрузка сохраняют поле, очередь и учёт выручки', () => {
  const { state, rng } = fresh();
  fill(state);
  state.run.pending = [40, 41];
  state.run.farmRate = '0e0';
  const grid = JSON.stringify(state.run.grid);
  const pending = JSON.stringify(state.run.pending);
  const seq = state.seq;
  const gold = state.run.gold;
  const earned = state.run.earned;
  for (let i = 0; i < 240; i++) {
    const now = NOW + i * 250;
    x.sim.tap(state, x.cfg, rng, now);
    x.sim.tick(state, 0.25, ctxOf(x, now + 250, rng, { offline: true }));
  }
  assert.ok(state.run.stats.sold > 0);
  assert.ok(state.run.stats.sold < state.run.taps, 'монеты выдаются за цикл, а не за каждый тап');
  assert.strictEqual(state.run.stats.sold, state.run.stats.forged);
  assert.strictEqual(JSON.stringify(state.run.grid), grid);
  assert.strictEqual(JSON.stringify(state.run.pending), pending);
  assert.strictEqual(state.seq, seq);
  const proceeds = x.Big.mul(x.sim.sellPrice(state, x.cfg, 1), state.run.stats.sold);
  sameNumber(state.run.gold, x.Big.add(gold, proceeds));
  sameNumber(state.run.earned, x.Big.add(earned, proceeds));
  state.meta.seed = rng.state();
  const reloaded = JSON.parse(JSON.stringify(state));
  const cloneRng = x.Rng.make(reloaded.meta.seed);
  assert.strictEqual(x.sim.validate(reloaded), null);
  x.sim.tap(state, x.cfg, rng, NOW + 60000);
  x.sim.tap(reloaded, x.cfg, cloneRng, NOW + 60000);
  assert.strictEqual(JSON.stringify(reloaded), JSON.stringify(state));
  assert.strictEqual(cloneRng.state(), rng.state());
});

test('обычная ручная продажа клинка с поля работает по прежней цене', () => {
  const { state } = fresh();
  const r = state.run;
  const cell = x.sim.openCells(state, x.cfg)[0];
  r.grid[cell] = 5;
  const gold = r.gold;
  const price = x.sim.sellPrice(state, x.cfg, 5);
  sameNumber(x.sim.sell(state, x.cfg, cell), price);
  assert.strictEqual(r.grid[cell], 0);
  assert.strictEqual(r.stats.sold, 1);
  sameNumber(r.gold, x.Big.add(gold, price));
  assert.strictEqual(x.sim.sell(state, x.cfg, cell), null);
  assert.strictEqual(r.stats.sold, 1);
});

done('overflow');
