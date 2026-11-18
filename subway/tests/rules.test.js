// The rules of «Подземка» against docs/games/subway.md: prices and demand of the lines, trains and
// stations, milestones, transfers, tariffs, the cities and what they open, the Бюро, the events,
// the night and the rush hours, the automations offline, the tasks, the second layer. node tests/rules.test.js
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { setup, ctxOf, GAME } = require('./env');
const { test, done } = require(path.join(process.env.AXIKO_ROOT || path.resolve(__dirname, '../../../Axiko'), 'scripts/games/harness.js'));

const x = setup();
const { Core, Big, Rng, sim, game, cfg } = x;
const NOON = new Date(2026, 10, 3, 12, 0, 0).getTime();
const num = (v) => Big.toNumber(v);
const eq = (a, b, what) => assert.ok(Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b)), (what || '') + ' ' + a + ' ≠ ' + b);

function fresh(now) {
  const s = Core.newState(game, sim, ctxOf(cfg, Rng.make(1), now || NOON));
  sim.ensure(s);
  return s;
}

function withLines(s, n) {
  s.run.money = '1e300';
  for (let t = 2; t <= n; t++) assert.ok(sim.openLine(s, cfg), 'линия ' + t);
  s.run.money = '0e0';
  return s;
}

function cityState(c) {
  const s = fresh();
  s.layers.city.state.city = c;
  return s;
}

test('цены и спрос линий: B_i = 15·14^(i−1), P_i = 0,5·7^(i−1), открытие ×10', () => {
  const s = fresh();
  const R = sim.rules(s, cfg);
  assert.strictEqual(num(sim.baseCost(1, R, cfg)), 15);
  eq(num(sim.baseCost(2, R, cfg)), 210);
  eq(num(sim.openCost(s, cfg, 2)), 2100);
  eq(num(sim.openCost(s, cfg, 3)), 29400);
  assert.ok(Math.abs(num(sim.openCost(s, cfg, 10)) / (150 * Math.pow(14, 9)) - 1) < 1e-9);
  assert.strictEqual(num(sim.demand(1, R, cfg)), 0.5);
  eq(num(sim.demand(2, R, cfg)), 3.5);
  assert.ok(Math.abs(num(sim.demand(10, R, cfg)) / (0.5 * Math.pow(7, 9)) - 1) < 1e-9);
  const l1 = sim.lineOf(s, 1);
  // Stations 3 and 4 of line 1 (it starts with 2): 15·1.1² + 15·1.1³.
  assert.ok(Math.abs(num(sim.stationsCost(l1, 2, R, cfg)) - (15 * 1.21 + 15 * 1.331)) < 1e-9);
  // A train: 3·B_i, then ×1.331.
  assert.ok(Math.abs(num(sim.trainsCost(l1, 1, R, cfg)) - 45 * 1.331) < 1e-9);
});

test('диспетчер 100 ₽ на линии 1, дальше 30·B_i; Опытный диспетчер вдвое дешевле', () => {
  const s = withLines(fresh(), 2);
  assert.strictEqual(num(sim.dispatcherCost(s, cfg, sim.lineOf(s, 1))), 100);
  eq(num(sim.dispatcherCost(s, cfg, sim.lineOf(s, 2))), 6300);
  s.meta.unlocks.bureau = 1;
  s.layers.city.state.blueprints = 1;
  assert.ok(sim.bureauBuy(s, cfg, 'dispatch'));
  eq(num(sim.dispatcherCost(s, cfg, sim.lineOf(s, 1))), 50);
});

test('обслужено = min(станций, S·поездов); составы, экспресс, автоматические поезда', () => {
  const s = fresh();
  const l = sim.lineOf(s, 1);
  l.stations = 10;
  l.trains = 2;
  assert.strictEqual(sim.served(s, l, cfg), 6);
  assert.ok(sim.crowded(s, cfg), 'толпа при 10 станциях и 6 обслуженных');
  s.run.money = '1e9';
  assert.ok(sim.buyCars(s, cfg, 1));
  assert.strictEqual(sim.cars(s, l, cfg), 4);
  assert.strictEqual(sim.served(s, l, cfg), 8);
  eq(num(sim.carsCost(s, cfg, l)), 15 * 1e4, 'вторая ступень составов — 10^4·B');
  // No ceiling: past the listed steps every next one is cars.growth (×100) dearer and still adds a station.
  l.cars = 4;
  eq(num(sim.carsCost(s, cfg, l)), 15 * 1e10, 'пятая ступень — 10^8·100·B');
  l.cars = 6;
  eq(num(sim.carsCost(s, cfg, l)), 15 * 1e14, 'седьмая ступень — 10^8·100^3·B');
  s.run.money = '1e30';
  assert.ok(sim.buyCars(s, cfg, 1), 'ступень сверх списка покупается');
  assert.strictEqual(sim.cars(s, l, cfg), 10);
  assert.strictEqual(sim.carsCost(s, Object.assign({}, cfg, { 'cars.growth': 1 }), l), null, 'рост 1 — ступени только по списку');
  l.cars = 1;
  s.run.money = '1e9';
  s.meta.unlocks.express = 1;
  const before = sim.lineMult(s, l, cfg, sim.envOf(s, cfg, NOON, true));
  assert.ok(sim.toggleExpress(s, cfg, 1));
  assert.strictEqual(sim.cars(s, l, cfg), 3);
  assert.ok(Math.abs(sim.lineMult(s, l, cfg, sim.envOf(s, cfg, NOON, true)) / before - 1.6) < 1e-9);
  s.meta.unlocks.autoTrains = 1;
  assert.strictEqual(sim.cars(s, l, cfg), 4, 'S + 1 от автоматических поездов');
});

test('вехи 10/25/50/100/…/500, дальше каждые 100: каждая ×2 к спросу линии', () => {
  assert.deepStrictEqual([9, 10, 25, 49, 50, 100, 500, 599, 600, 1000].map((n) => sim.miles(n, cfg)), [0, 1, 2, 2, 3, 4, 10, 10, 11, 15]);
  assert.strictEqual(sim.nextMile(0, cfg), 10);
  assert.strictEqual(sim.nextMile(500, cfg), 600);
  const s = fresh();
  const l = sim.lineOf(s, 1);
  l.stations = 25;
  l.trains = 9;
  assert.strictEqual(sim.lineMult(s, l, cfg, sim.envOf(s, cfg, NOON, true)), 4);
  const plan = sim.stationPlan(s, cfg, 1, 'mile');
  assert.strictEqual(plan.stations, 25);
  assert.strictEqual(plan.trains, 17 - 9, 'до вехи 50 — и поезда под все станции');
});

test('тарифы: 10^4·300^k, каждый ×2 ко всему доходу', () => {
  const s = fresh();
  assert.strictEqual(num(sim.tariffCost(s, cfg)), 1e4);
  s.run.money = '1e12';
  const inc0 = num(sim.income(s, cfg, NOON, true));
  assert.ok(sim.buyTariff(s, cfg));
  eq(num(sim.tariffCost(s, cfg)), 3e6);
  assert.ok(sim.buyTariff(s, cfg));
  eq(num(sim.tariffCost(s, cfg)), 9e8);
  assert.ok(Math.abs(num(sim.income(s, cfg, NOON, true)) / inc0 - 4) < 1e-9);
});

test('пересадки: ×1,2 обеим линиям, предел 6, в Кольцовске 9, Бюро +3', () => {
  const s = withLines(fresh(), 5);
  s.run.money = '1e300';
  const pairs = [[1, 2], [1, 3], [1, 4], [1, 5], [2, 3], [2, 4], [2, 5]];
  pairs.forEach((p, i) => assert.strictEqual(sim.buyTransfer(s, cfg, p[0], p[1]), i < 6, 'пересадка ' + p));
  assert.strictEqual(sim.transferLimit(s, cfg), 6);
  const l1 = sim.lineOf(s, 1);
  l1.trains = 1;
  assert.ok(Math.abs(sim.lineMult(s, l1, cfg, sim.envOf(s, cfg, NOON, true)) - Math.pow(1.2, 4)) < 1e-9);
  assert.strictEqual(sim.transferLimit(cityState(3), cfg), 9);
  const b = fresh();
  b.meta.bureau.transfers = 1;
  assert.strictEqual(sim.transferLimit(b, cfg), 9);
  assert.ok(Math.abs(num(sim.transferCost(s, cfg, 1, 2)) - 150 * 210) < 1e-6);
});

test('правила городов 2–10 и что каждый открывает навсегда', () => {
  const R = (c) => sim.rules(cityState(c), cfg);
  const g = cfg['city.costGrowth'];
  assert.strictEqual(R(2).growth, 1.11);
  assert.strictEqual(R(2).demand, 1.5);
  assert.strictEqual(R(3).transfers, 9);
  assert.strictEqual(R(4).offline, 1.5);
  assert.strictEqual(R(4).online, 0.8);
  assert.strictEqual(R(5).open, 0.5);
  assert.ok(R(6).stilts && !R(5).stilts);
  assert.ok(R(7).historic);
  assert.strictEqual(R(8).train, 0.7);
  assert.strictEqual(R(9).events, 2);
  const r10 = R(10);
  assert.strictEqual(r10.demand, 4 * 1.5, 'Столица: спрос ×4 и правило Холмска');
  assert.ok(Math.abs(num(r10.cost) / (2 * Math.pow(g, 9)) - 1) < 1e-9, 'Столица: цены ×2');
  assert.ok(r10.stilts && r10.historic && r10.transfers === 9 && r10.open === 0.5);
  const r11 = R(11);
  assert.strictEqual(r11.round, 2);
  assert.strictEqual(r11.base, 1);
  assert.strictEqual(r11.demand, 2, 'круг 2: спрос ×2');
  assert.deepStrictEqual(sim.UNLOCKS[2], ['bureau', 'express']);
  // The real moves: each city opens its own thing.
  const s = fresh();
  const rng = Rng.make(3);
  const opened = [];
  for (let c = 2; c <= 10; c++) {
    s.run.earned = Big.str(Big.mul(Big.mul(1e4 * c * c, 1e4 * c * c), cfg['oi.div']));
    const r = Core.prestige(sim, game, s, 'city', ctxOf(cfg, rng, NOON + c * 1000));
    assert.ok(Big.gt(r.gain, 0), 'переезд в город ' + c);
    assert.strictEqual(s.layers.city.state.city, c);
    opened.push(c + ':' + s.run.unlocked.join(','));
  }
  assert.deepStrictEqual(opened, ['2:bureau,express', '3:ring', '4:night', '5:districts', '6:ground', '7:recon', '8:autoTrains', '9:airport', '10:general']);
  assert.strictEqual(sim.maxTier(s), 12, 'наземные линии 11–12');
});

test('кольцевая, экспресс в аэропорт, реконструкция', () => {
  const s = withLines(fresh(), 10);
  s.run.money = '1e300';
  Object.assign(s.meta.unlocks, { ring: 1, airport: 1, recon: 1 });
  const x0 = sim.envOf(s, cfg, NOON, true);
  const m10 = sim.lineMult(s, sim.lineOf(s, 10), cfg, x0);
  assert.ok(sim.buyRing(s, cfg));
  assert.ok(Math.abs(sim.lineMult(s, sim.lineOf(s, 10), cfg, x0) / m10 - 1.1) < 1e-9);
  assert.ok(sim.buyAirport(s, cfg));
  assert.ok(Math.abs(sim.lineMult(s, sim.lineOf(s, 10), cfg, x0) / m10 - 1.1 * 3) < 1e-9);
  const l3 = sim.lineOf(s, 3);
  l3.stations = 40;
  assert.ok(sim.reconstruct(s, cfg, 3));
  assert.strictEqual(l3.stations, 2);
  assert.ok(l3.recon);
  assert.ok(!sim.reconstruct(s, cfg, 4), 'одна реконструкция за город');
});

test('ночь и час пик по часам телефона', () => {
  const s = withLines(fresh(), 2);
  s.meta.unlocks.night = 1;
  s.meta.unlocks.districts = 1;
  s.run.lines.forEach((l) => { l.stations = 8; l.trains = 3; l.dispatcher = true; });
  const night = new Date(2026, 10, 3, 2, 0, 0).getTime();
  const day = new Date(2026, 10, 3, 13, 0, 0).getTime();
  assert.strictEqual(num(sim.income(s, cfg, night, true)), 0, 'ночью без дежурства линии стоят');
  s.run.money = '1e9';
  assert.ok(sim.buyDuty(s, cfg, 1));
  const l1 = sim.lineOf(s, 1);
  const xn = sim.envOf(s, cfg, night, true);
  const xd = sim.envOf(s, cfg, day, true);
  assert.ok(Math.abs(num(sim.lineIncome(s, l1, cfg, xn)) / num(sim.lineIncome(s, l1, cfg, xd)) - 1.5) < 1e-9);
  // 08:00 — the morning: the spare districts ×2 (station j of line t is district ((j + t) % 4) + 1).
  const morning = new Date(2026, 10, 3, 8, 0, 0).getTime();
  const xm = sim.envOf(s, cfg, morning, true);
  assert.strictEqual(xm.rush, 1);
  const spare = [0, 1, 2, 3, 4, 5, 6, 7].filter((j) => sim.district(j, 1) === 1).length;
  for (let t = 1; t <= 13; t++) {
    for (let n = 0; n <= 13; n++) {
      for (let d = 1; d <= 4; d++) {
        const want = Array.from({ length: n }, (_, j) => j).filter((j) => sim.district(j, t) === d).length;
        assert.strictEqual(sim.districtCount(n, t, d), want, 'районы: линия ' + t + ', ' + n + ' станций, район ' + d);
      }
    }
  }
  assert.ok(Math.abs(num(sim.lineIncome(s, l1, cfg, xm)) / num(sim.lineIncome(s, l1, cfg, xd)) - (8 + spare) / 8) < 1e-9);
  assert.strictEqual(sim.envOf(s, cfg, new Date(2026, 10, 3, 18, 0, 0).getTime(), true).rush, 2);
});

test('Бюро: смены, долгий сон, опыт впрок, узел, быстрый старт, бюджет, память', () => {
  const s = fresh();
  s.meta.unlocks.bureau = 1;
  s.layers.city.state.blueprints = 100;
  assert.strictEqual(sim.offlineEff(s, cfg), 0.5);
  assert.ok(!sim.bureauBuy(s, cfg, 'nightShift'), 'ночная смена только после длинной');
  assert.ok(sim.bureauBuy(s, cfg, 'longShift'));
  assert.strictEqual(sim.offlineEff(s, cfg), 0.75);
  assert.ok(sim.bureauBuy(s, cfg, 'nightShift'));
  assert.strictEqual(sim.offlineEff(s, cfg), 1);
  assert.strictEqual(sim.capBonusHours(s), 0);
  assert.ok(sim.bureauBuy(s, cfg, 'sleep'));
  assert.strictEqual(sim.capBonusHours(s), 12);
  assert.ok(sim.bureauBuy(s, cfg, 'experience'));
  assert.strictEqual(sim.oiRate(s, cfg), 0.025);
  assert.ok(sim.bureauBuy(s, cfg, 'hub'));
  assert.strictEqual(sim.transferMult(s, cfg), 1.25);
  for (let i = 0; i < 5; i++) assert.ok(sim.bureauBuy(s, cfg, 'budget'), 'бюджет ' + (i + 1));
  assert.ok(sim.bureauBuy(s, cfg, 'quickStart'));
  assert.ok(sim.bureauBuy(s, cfg, 'memory'));
  assert.strictEqual(sim.blueprints(s), 100 - (2 + 3 + 3 + 4 + 4 + 5 + 2 + 5));
  sim.lineOf(s, 1).dispatcher = true;
  s.run.earned = Big.str(Big.mul(400, cfg['oi.div']));
  Core.prestige(sim, game, s, 'city', ctxOf(cfg, Rng.make(2), NOON));
  eq(num(s.run.money), 500 * 1e4, 'стартовый бюджет 500 ₽ ×10 за уровень');
  assert.ok(sim.lineOf(s, 2), 'быстрый старт: линия 2 сразу');
  assert.ok(sim.lineOf(s, 1).dispatcher, 'память города: диспетчер линии 1 остался');
});

test('события: каждое по карточке даёт своё', () => {
  const rng = Rng.make(5);
  const got = {};
  sim.EVENTS.forEach((kind) => {
    const s = withLines(fresh(), 5);
    s.run.lines.forEach((l) => { l.stations = 20; l.trains = 7; });
    s.run.money = '1e12';
    s.run.transfers.push([1, 2]);
    s.meta.unlocks.night = 1;
    const choices = kind === 'mall' ? [{ t: 1, j: 4 }, { t: 3, j: 7 }, { t: 5, j: 0 }] : [1, 2, 3];
    s.run.event = { kind: kind, at: NOON, until: NOON + 30000, gap: 100000, tier: 2, retro: 3, choices: choices, q: 'stations', answer: 5 };
    const choice = kind === 'escalator' ? 'pay' : kind === 'inspector' ? 5 : kind === 'mall' ? 1 : undefined;
    const inc0 = num(sim.income(s, cfg, NOON + 1000, true));
    const r = sim.collect(s, cfg, choice, NOON + 1000, 1);
    assert.ok(r && r.ok !== false, kind + ': карточка не взялась');
    assert.strictEqual(s.run.event, null, kind + ': карточка осталась');
    const inc1 = num(sim.income(s, cfg, NOON + 2000, true));
    got[kind] = { r: r, k: inc1 / inc0, s: s };
  });
  const k = (kind) => got[kind].k;
  assert.ok(Math.abs(k('rain') - 2) < 1e-9, 'ливень ×2');
  assert.ok(Math.abs(k('graduation') - 2) < 1e-9, 'выпускной ×2');
  assert.ok(k('match') > 1 && k('fair') > k('match'), 'матч ×3 и ярмарка ×4 одной линии');
  assert.ok(Math.abs(k('rush') - 1.5) < 1e-9, 'утренний час пик ×1,5');
  assert.ok(k('snow') > 1, 'снегопад: подземные ×2');
  assert.ok(k('musician') > 1, 'музыкант: пересадки сильнее');
  ['suitcase', 'tourist', 'inspector'].forEach((kind) => assert.ok(Big.gt(got[kind].r.amount, 0), kind + ': деньги'));
  assert.ok(got.inspector.r.right);
  assert.deepStrictEqual(sim.lineOf(got.mall.s, 3).mallAt, [7], 'торговый центр: выбранная станция 7 линии 3');
  assert.strictEqual(got.mall.r.station, 7);
  {
    // The chosen station's demand +50 %: one station of 20 on line 3 → its income × (20 + 0,5) / 20.
    const m = got.mall.s;
    const x = sim.envOf(m, cfg, NOON + 2000, true);
    const with3 = num(sim.lineIncome(m, sim.lineOf(m, 3), cfg, x));
    sim.lineOf(m, 3).mallAt = [];
    const without3 = num(sim.lineIncome(m, sim.lineOf(m, 3), cfg, x));
    assert.ok(Math.abs(with3 / without3 - (20 + cfg['mall.bonus']) / 20) < 1e-9, 'торговый центр: +50 % одной станции');
    // The station must be served: past the served ones it gives nothing.
    sim.lineOf(m, 3).mallAt = [25];
    assert.ok(Math.abs(num(sim.lineIncome(m, sim.lineOf(m, 3), cfg, x)) / without3 - 1) < 1e-9, 'необслуженная станция без бонуса');
  }
  assert.strictEqual(sim.lineOf(got.escalator.s, 2).bonus, 1);
  assert.strictEqual(got.retro.s.meta.retro[3], 1);
  assert.strictEqual(got.glove.s.layers.city.state.blueprints, 1, 'перчатка: Чертёж');
  assert.ok(got.museums.s.run.museumsUntil > NOON);
  const school = got.school.s;
  const a = num(sim.tap(school, cfg, 1, NOON + 3000));
  assert.ok(a > 5, 'экскурсия: турникет ×5');
  // A card with a choice without the choice is not taken.
  const s = fresh();
  s.run.event = { kind: 'mall', at: NOON, until: NOON + 30000, choices: [{ t: 1, j: 0 }] };
  assert.strictEqual(sim.collect(s, cfg, undefined, NOON + 1000, 1).need, 'choice');
  // Graduation lasts till the end of the session.
  sim.endSession(got.graduation.s);
  assert.strictEqual(got.graduation.s.run.boosts.length, 0);
});

test('торговый центр: карточка предлагает станции, старое сохранение переносится', () => {
  const s = withLines(fresh(), 3);
  s.run.lines.forEach((l) => { l.stations = 12; l.trains = 2; });
  const rng = Rng.make(3);
  s.run.mallDone = false;
  // Spawn until the mall comes up: three stations to choose from, each served and on an open line.
  let mall = null;
  for (let i = 0; i < 400 && !mall; i++) {
    s.run.event = null;
    s.run.nextEventAt = NOON - 1;
    sim.tick(s, 0.001, ctxOf(cfg, rng, NOON + i));
    if (s.run.event && s.run.event.kind === 'mall') mall = s.run.event;
  }
  assert.ok(mall, 'торговый центр не выпал');
  assert.strictEqual(mall.choices.length, 3);
  mall.choices.forEach((p) => {
    const l = sim.lineOf(s, p.t);
    assert.ok(l && p.j >= 0 && p.j < Math.min(l.stations, sim.served(s, l, cfg)), 'станция ' + JSON.stringify(p));
  });
  const old = withLines(fresh(), 1);
  delete old.run.lines[0].mallAt;
  old.run.lines[0].malls = 2;
  sim.ensure(old);
  assert.deepStrictEqual(old.run.lines[0].mallAt, [0, 1]);
  assert.strictEqual(old.run.lines[0].malls, undefined);
});

test('события сами появляются только в открытой игре, каждые 90–150 с', () => {
  const s = withLines(fresh(), 3);
  const rng = Rng.make(9);
  let now = NOON;
  let seen = 0;
  for (let i = 0; i < 1800; i++) {
    now += 1000;
    sim.tick(s, 1, ctxOf(cfg, rng, now));
    if (s.run.event && s.run.event.at === now) seen++;
  }
  assert.ok(seen >= 8 && seen <= 16, 'за 30 минут событий ' + seen);
  const off = withLines(fresh(), 3);
  sim.tick(off, 3600, Object.assign(ctxOf(cfg, rng, NOON + 3600000), { offline: true }));
  assert.ok(!off.run.event, 'офлайн карточек нет');
});

test('офлайн: без диспетчеров ноль, с автоматами — шаги и сводка покупок', () => {
  const s = withLines(fresh(), 2);
  s.run.lines.forEach((l) => { l.stations = 10; l.trains = 4; });
  assert.strictEqual(num(sim.offlineRate(s, cfg, NOON)), 0);
  sim.lineOf(s, 1).dispatcher = true;
  const rate = num(sim.offlineRate(s, cfg, NOON));
  assert.ok(rate > 0);
  const p = Core.plan(NOON, NOON + 8 * 3600000, cfg, 0);
  const a = JSON.parse(JSON.stringify(s));
  Core.runOffline(sim, a, game, p, null, (seg) => ctxOf(cfg, Rng.make(1), seg.to, true), cfg);
  assert.ok(Math.abs(num(a.run.money) / (rate * 8 * 3600) - 1) < 1e-6, 'офлайн = доход диспетчеров × время × 0,5');
  s.meta.bureau.depot = 1;
  s.run.money = '1e6';
  sim.lineOf(s, 1).stations = 40;
  assert.ok(sim.hasAuto(s));
  Core.runOffline(sim, s, game, p, null, (seg) => ctxOf(cfg, Rng.make(1), seg.to, true), cfg);
  assert.ok(s.run.away && s.run.away.trains > 0, 'склад поездов докупил поезда офлайн');
  assert.ok(sim.lineOf(s, 1).trains >= Math.ceil(40 / 3), 'поездов хватает на 40 станций');
});

test('задания города: Чертёж и ретро-состав за каждое', () => {
  const s = withLines(fresh(), 6);
  const rng = Rng.make(4);
  assert.strictEqual(sim.taskGoal(s, cfg, 'lines'), 6);
  assert.strictEqual(sim.taskGoal(s, cfg, 'lines', 3), 7);
  assert.strictEqual(sim.taskGoal(s, cfg, 'stations', 2), 125);
  assert.deepStrictEqual(sim.checkTasks(s, cfg, NOON, rng), ['lines']);
  assert.strictEqual(sim.blueprints(s), 1);
  assert.strictEqual(s.meta.retro.reduce((a, b) => a + b, 0), 1, 'задание — ретро-состав');
  assert.deepStrictEqual(sim.checkTasks(s, cfg, NOON, rng), [], 'одно задание — один Чертёж');
  s.run.lines.forEach((l) => { l.stations = 100; l.trains = 40; });
  s.run.money = '1e300';
  [[1, 2], [1, 3], [2, 3], [3, 4], [4, 5], [5, 6]].forEach((p) => sim.buyTransfer(s, cfg, p[0], p[1]));
  s.run.tariffs = 10;
  s.run.calmSec = 700;
  const fresh2 = sim.checkTasks(s, cfg, NOON, rng);
  assert.deepStrictEqual(fresh2.sort(), ['calm', 'income', 'stations', 'transfers']);
  assert.strictEqual(sim.blueprints(s), 5);
  assert.strictEqual(s.meta.retro.reduce((a, b) => a + b, 0), 5, 'пять заданий — пять ретро-составов');
  eq(num(sim.taskGoal(s, cfg, 'income', 1)), 1e9, 'доход 1 млрд/с в первом городе');
});

test('второй слой: Патенты = √(ОИ за всё время / 10^4), сброс городов, Бюро остаётся', () => {
  const s = fresh();
  Object.assign(s.meta.unlocks, { general: 1, bureau: 1 });
  s.meta.bureau.loud = 1;
  s.meta.oiEver = '1e6';
  s.layers.city.currency = '500';
  s.layers.city.state.city = 11;
  s.layers.city.state.blueprints = 7;
  assert.strictEqual(num(sim.generalGain(s, cfg)), 10);
  const r = Core.prestige(sim, game, s, 'general', ctxOf(cfg, Rng.make(1), NOON));
  assert.strictEqual(num(r.gain), 10);
  assert.strictEqual(num(s.layers.general.currency), 10);
  assert.strictEqual(num(s.layers.city.currency), 0, 'ОИ сброшены');
  assert.strictEqual(sim.cityOf(s), 1, 'снова Приречье');
  assert.strictEqual(sim.blueprints(s), 0, 'Чертежи сброшены');
  assert.strictEqual(s.meta.bureau.loud, 1, 'Бюро осталось');
  assert.ok(Math.abs(num(sim.patentMult(cfg, Big.of(10))) - Math.pow(1.25, 10)) < 1e-6, 'каждый патент ×1,25');
  // Above the softcap the further patents add, and the whole is always growing.
  const at = (p) => num(sim.patentMult(cfg, Big.of(p)));
  assert.ok(Math.abs(at(24) / at(20) - Math.sqrt(2)) < 1e-9);
  assert.ok(at(1e6) > at(1e3) && at(1e3) > at(21));
  assert.ok(Math.abs(num(sim.bonus(s, 'general', '10', cfg)) - Math.pow(1.25, 10)) < 1e-6);
  // The patent bureau: points = patents, the pneumo opens line 13.
  assert.ok(sim.patentBuy(s, cfg, 'pneumo'));
  assert.strictEqual(sim.maxTier(s), 13);
  assert.ok(sim.patentBuy(s, cfg, 'autobuild'));
  assert.strictEqual(sim.patentLeft(s, cfg), 7);
  for (let i = 0; i < 5; i++) assert.ok(sim.patentBuy(s, cfg, 'capital'));
  assert.ok(sim.patentBuy(s, cfg, 'bridge'));
  assert.strictEqual(sim.patentLeft(s, cfg), 1);
});

test('автостроитель раз в минуту покупает лучшее; выключенный автомат молчит', () => {
  const s = fresh();
  s.layers.general.currency = '5';
  assert.ok(sim.patentBuy(s, cfg, 'autobuild'));
  s.run.money = '1e5';
  const st0 = sim.lineOf(s, 1).stations + sim.lineOf(s, 1).trains + s.run.lines.length;
  assert.ok(sim.automate(s, cfg, NOON, 125, false) >= 2);
  assert.ok(sim.lineOf(s, 1).stations + sim.lineOf(s, 1).trains + s.run.lines.length > st0);
  sim.setAuto(s, 'autobuild', false);
  assert.strictEqual(sim.automate(s, cfg, NOON, 300, false), 0);
});

test('сундук, сводка, уведомления, процедурный запас, проверка запаса', () => {
  const s = withLines(fresh(), 2);
  s.run.lines.forEach((l) => { l.stations = 10; l.trains = 4; l.dispatcher = true; });
  s.lastTick = NOON;
  const inc = num(sim.income(s, cfg, NOON, true));
  const c = sim.chest(s, Rng.make(1), cfg);
  assert.ok(Math.abs(num(c.items[0].amount) / (inc * 600) - 1) < 1e-9, 'вагон: 10 минут дохода');
  assert.ok(/линии · город 1$/.test(sim.summary(s, cfg).line), sim.summary(s, cfg).line);
  s.run.money = '0e0';
  // Just short of 15 ОИ (E = 15² · 10^7): the move notification comes within a day.
  s.run.earned = Big.str(Big.sub(Big.mul(225, cfg['oi.div']), Big.mul(sim.offlineRate(s, cfg, NOON), 3600)));
  const n = sim.next(s, NOON, cfg);
  assert.ok(n.some((e) => e.id === 'mile' && e.at > NOON), 'уведомление о вехе');
  assert.ok(n.some((e) => e.id === 'move'), 'уведомление о переезде');
  const st = sim.procedural('stations', Rng.make(2));
  assert.ok(st.title && st.procedural);
  assert.strictEqual(sim.procedural('tariffs', Rng.make(2)), null);
  assert.ok(sim.validateStock('events', { kind: 'match', text: 'x' }) === null);
  assert.ok(sim.validateStock('events', { kind: 'nope' }));
  assert.ok(sim.validateStock('stations', { title: 'http://x' }));
});

test('сохранение v1 из fixtures читается, проверяется и играется дальше', () => {
  const fx = JSON.parse(fs.readFileSync(path.join(GAME, 'fixtures', 'v1.json'), 'utf8'));
  const s = sim.migrate(JSON.parse(JSON.stringify(fx.state || fx)), 1);
  assert.strictEqual(sim.validate(s), null);
  sim.ensure(s);
  const m0 = Big.of(s.run.money);
  sim.tick(s, 1, ctxOf(cfg, Rng.make(1), (s.lastTick || NOON) + 1000));
  assert.ok(Big.gte(s.run.money, m0));
  const bad = JSON.parse(JSON.stringify(s));
  bad.run.lines[0].stations = -1;
  assert.ok(sim.validate(bad));
});

test('без потолков: стартовый бюджет, стартовый капитал и вехи города растут дальше, дорожая', () => {
  const s = fresh();
  s.meta.unlocks.bureau = 1;
  s.layers.city.state.blueprints = 100;
  // The first five levels cost 1 blueprint each, as before; then 2, 3, 4…
  const paid = [];
  for (let i = 0; i < 8; i++) {
    paid.push(sim.bureauCost(s, cfg, 'budget'));
    assert.ok(sim.bureauBuy(s, cfg, 'budget'), 'бюджет ' + (i + 1));
  }
  assert.deepStrictEqual(paid, [1, 1, 1, 1, 1, 2, 3, 4]);
  assert.strictEqual(sim.blueprints(s), 100 - 14);
  assert.strictEqual(sim.bureauLevel(s, 'budget'), 8);
  // Single nodes stay single.
  assert.ok(sim.bureauBuy(s, cfg, 'loud'));
  assert.strictEqual(sim.bureauCost(s, cfg, 'loud'), null);
  assert.ok(!sim.bureauBuy(s, cfg, 'loud'));
  // The patent «Стартовый капитал»: 1 point a level for five, then 2, 3…; the points spent add up the same way.
  s.layers.general.currency = '12';
  const points = [];
  for (let i = 0; i < 7; i++) {
    points.push(sim.patentCost(s, cfg, 'capital'));
    assert.ok(sim.patentBuy(s, cfg, 'capital'), 'капитал ' + (i + 1));
  }
  assert.deepStrictEqual(points, [1, 1, 1, 1, 1, 2, 3]);
  assert.strictEqual(sim.patentLeft(s, cfg), 2);
  assert.strictEqual(sim.patentCost(s, cfg, 'capital'), 4);
  assert.ok(!sim.patentBuy(s, cfg, 'capital'), 'на восьмой уровень очков не хватает');
  // City milestones: 25/50/100 from the list, then every 100 stations more, each ×2.
  assert.deepStrictEqual([0, 1, 2, 3, 4].map((i) => sim.cityMileNeed(cfg, i)), [25, 50, 100, 200, 300]);
  assert.deepStrictEqual([0, 1, 2, 3, 4].map((i) => sim.cityMileStep(cfg, i)), [1.5, 2, 3, 2, 2]);
  s.run.cityMiles = 5;
  eq(sim.cityMileMult(s, cfg), 1.5 * 2 * 3 * 2 * 2);
  assert.strictEqual(sim.cityMileNeed(Object.assign({}, cfg, { 'cityMile.every': 0 }), 3), Infinity, '0 — вехи только по списку');
});

done('Подземка, правила');
