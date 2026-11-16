// node tests/economy.test.js — money around the factory on the real sim: offline by the sliding
// port rate (formula against steps, 2 hours = rate × time × 50 %, «Ночная смена» 100 %, poorer
// ore), orders, research prices from the spec, events, the chest, the new planet, saves and NaN.
'use strict';
const fs = require('fs');
const path = require('path');
const T = require('./env.js');
const x = T.open();
const { sim, Core, Big, Rng, game, cfg, kit } = x;

const NOW = Date.UTC(2026, 10, 14, 8, 0, 0);
const HOUR = 3600000;
function ctxAt(now, seed, o) { return T.ctxOf(x, Object.assign({ now, seed: seed || 1 }, o || {})); }

function play(state, ctx) {
  if (state.run.b.some((b) => b.t === 'port')) return 0;
  return sim.starterLine(state, ctx.config, 'iron-ore') ? 5 : 0;
}

/** A state that played `sec` seconds on the starter line with events off. */
function played(sec, seed) {
  let now = NOW;
  const state = Core.newState(game, sim, ctxAt(now, seed));
  state.run.evAt = NOW + 1e12;
  play(state, ctxAt(now, seed));
  for (let i = 0; i < sec; i++) {
    now += 1000;
    sim.tick(state, 1, ctxAt(now, seed));
  }
  state.lastTick = now;
  return state;
}

function numbers(v, where, out) {
  if (typeof v === 'number' && !isFinite(v)) out.push(where);
  else if (typeof v === 'string' && /NaN|Infinity/.test(v)) out.push(where + ' = ' + v);
  else if (v && typeof v === 'object') for (const k in v) numbers(v[k], where + '.' + k, out);
  return out;
}

T.test('офлайн 12 ч: формула и шаги движка совпадают', () => {
  const r = kit.offlineAgree(game, sim, cfg, 360, play);
  console.log('  формула ' + Big.str(r.formula) + ', шаги ' + Big.str(r.steps) + ' (' + r.stepsRun + ' шагов), расхождение ' + (r.diff * 100).toFixed(4) + ' %');
  if (!(r.diff <= 0.01)) throw new Error('расхождение ' + (r.diff * 100).toFixed(2) + ' %');
  if (Big.lte(Big.of(r.steps), 0)) throw new Error('ничего не накопилось');
});

T.test('офлайн 2 ч = ставка порта × время × 50 %; с «Ночной сменой» — 100 %', () => {
  const state = played(400);
  const rate = sim.windowRate(state.run, cfg);
  const before = Big.toNumber(state.run.money);
  const a = Core.clone(state);
  sim.offline(a, 7200, ctxAt(NOW, 1, { offline: true }));
  const gotA = Big.toNumber(a.run.money) - before;
  const expectA = rate * 7200 * cfg['offline.share'];
  const b = Core.clone(state);
  b.run.res.night = 1;
  const rep = sim.offline(b, 7200, ctxAt(NOW, 1, { offline: true }));
  const gotB = Big.toNumber(b.run.money) - before;
  const expectB = rate * 7200 * cfg['offline.shareNight'];
  console.log('  ставка ' + rate.toFixed(3) + '/с: 2 ч — ' + gotA.toFixed(1) + ' (ждали ' + expectA.toFixed(1) + '), с Ночной сменой ' + gotB.toFixed(1) + ' (ждали ' + expectB.toFixed(1) + ')');
  if (Math.abs(gotA - expectA) / expectA > 0.001) throw new Error('50 %: ' + gotA + ' против ' + expectA);
  if (Math.abs(gotB - expectB) / expectB > 0.001) throw new Error('100 %: ' + gotB + ' против ' + expectB);
  if (!rep.events.length || !Object.keys(rep.gains).length) throw new Error('пустая сводка: ' + JSON.stringify(rep));
});

T.test('офлайн: пятно беднеет — доход падает, сводка говорит, какое истощилось', () => {
  const state = played(400);
  const rate = sim.windowRate(state.run, cfg);
  const drill = state.run.b.find((b) => b.t === 'drill');
  const ore = state.run.ore.find((o) => o.x === drill.x && o.y === drill.y);
  ore.m = cfg['ore.amount'] - 3600 * cfg['drill.rate'];
  const before = Big.toNumber(state.run.money);
  const rep = sim.offline(state, 4 * 3600, ctxAt(NOW, 1, { offline: true }));
  const got = Big.toNumber(state.run.money) - before;
  const expect = rate * cfg['offline.share'] * (3600 + cfg['ore.slow'] * 3 * 3600);
  console.log('  4 ч, из них 1 ч до истощения: ' + got.toFixed(1) + ' (ждали ' + expect.toFixed(1) + '); ' + rep.events.join(' / '));
  if (Math.abs(got - expect) / expect > 0.01) throw new Error(got + ' против ' + expect);
  if (!rep.events.some((e) => /Истощилось/.test(e))) throw new Error('нет события истощения');
});

T.test('цены исследований: base × growth^L по таблице описания', () => {
  const state = Core.newState(game, sim, ctxAt(NOW));
  const table = { belts: [50, 1.9], drills: [40, 1.8], furnaces: [60, 1.8], assembly: [150, 1.9], trade: [100, 1.7], land: [200, 2.6], deep: [800], double: [1500, 2.4],
    longTunnel: [400], blueprints: [1000], idle: [100], counters: [300], night: [5000], storage: [250, 2], advanced: [600], top: [8000], logistics: [700, 2.5],
    autobuild: [200], sidePort: [350], alloy: [20000], courier: [12000, 2] };
  const list = sim.researchList(state).map((r) => r.id);
  for (const id in table) {
    if (id !== 'alloy' && list.indexOf(id) < 0) throw new Error('нет исследования ' + id);
    const c0 = Big.toNumber(sim.researchCost(state, id, cfg));
    if (c0 !== table[id][0]) throw new Error(id + ': ' + c0);
    if (table[id][1]) {
      state.run.res[id] = 2;
      const c2 = Big.toNumber(sim.researchCost(state, id, cfg));
      if (Math.abs(c2 - Math.ceil(table[id][0] * table[id][1] * table[id][1])) > 1) throw new Error(id + ' L2: ' + c2);
      state.run.res[id] = 0;
    }
  }
  const titles = sim.researchList(state).filter((r) => r.id === 'advanced' || r.id === 'top').map((r) => r.title);
  if (titles.join() !== 'Сталь,Дроны') throw new Error('названия: ' + titles);
  // «Межевание» grows the plot by a strip with new patches, up to 20 × 28.
  state.run.money = Big.str(Big.of(1e9));
  const ore0 = state.run.ore.length;
  for (let i = 0; i < 10; i++) sim.buyResearch(state, 'land', cfg, Rng.make(i), NOW);
  if (state.run.w !== cfg['plot.wMax'] || state.run.h !== cfg['plot.hMax']) throw new Error('участок ' + state.run.w + '×' + state.run.h);
  if (!(state.run.ore.length > ore0)) throw new Error('новых пятен нет');
  console.log('  21 исследование, цены сходятся; участок после «Межевания» ' + state.run.w + '×' + state.run.h + ', пятен руды ' + ore0 + ' → ' + state.run.ore.length + ' клеток');
});

T.test('исследования без предела: буры, печи, сборка, торговля и склады растут дальше 20-го уровня', () => {
  const state = Core.newState(game, sim, ctxAt(NOW));
  for (const id of ['drills', 'furnaces', 'assembly', 'trade', 'storage']) {
    if (sim.researchMax(cfg, id) !== Infinity) throw new Error(id + ': предел ' + sim.researchMax(cfg, id));
    state.run.res[id] = 30;
    const cost = sim.researchCost(state, id, cfg);
    const want = Big.ceil(Big.mul(cfg['research.' + id + '.base'], Big.pow(cfg['research.' + id + '.growth'], 30)));
    if (!Big.eq(cost, want)) throw new Error(id + ' L30: цена ' + Big.str(cost));
    state.run.money = Big.str(Big.sub(cost, 1));
    if (sim.buyResearch(state, id, cfg, Rng.make(1), NOW).ok) throw new Error(id + ': куплено в долг');
    state.run.money = Big.str(cost);
    const r = sim.buyResearch(state, id, cfg, Rng.make(1), NOW);
    if (!r.ok || r.level !== 31) throw new Error(id + ': 31-й уровень не куплен');
  }
  // What opens a mechanic stays single, and the belts keep their ceiling: the step of the simulation.
  state.run.money = Big.str(Big.of(1e30));
  for (const id of ['deep', 'blueprints', 'night']) {
    sim.buyResearch(state, id, cfg, Rng.make(1), NOW);
    if (sim.buyResearch(state, id, cfg, Rng.make(1), NOW).ok) throw new Error(id + ': куплено дважды');
  }
  if (sim.researchMax(cfg, 'belts') !== 20) throw new Error('ленты: предел ' + sim.researchMax(cfg, 'belts'));
});

T.test('заказы: три карточки, награда ×2,5, новый через 10 мин', () => {
  let now = NOW;
  const state = Core.newState(game, sim, ctxAt(now));
  state.run.evAt = NOW + 1e12;
  sim.starterLine(state, cfg, 'iron-ore');
  for (let i = 0; i < 1200; i++) {
    now += 1000;
    sim.tick(state, 1, ctxAt(now, 4));
  }
  const o = state.run.orders[0];
  if (!o) throw new Error('за 20 минут нет заказа');
  const reward = Math.ceil(sim.data().items[o.item].price * o.need * cfg['order.reward']);
  if (o.reward !== reward) throw new Error('награда ' + o.reward + ', ждали ' + reward);
  const done = state.run.ordersDone;
  for (let i = 0; i < 1800; i++) {
    now += 1000;
    sim.tick(state, 1, ctxAt(now, 4));
  }
  console.log('  первый заказ: ' + o.need + ' × ' + o.item + ' за ' + cfg['order.minutes'] + ' мин, награда ' + o.reward + '; выполнено за 50 мин: ' + state.run.ordersDone);
  if (!(state.run.ordersDone > done)) throw new Error('заказы не выполняются');
  if (state.run.orders.length + state.run.orderAt.length < cfg['order.cards']) throw new Error('карточек меньше трёх');
});

T.test('события: метеорит, ярмарка, сбой питания со щитком, инспектор', () => {
  const seen = {};
  for (let seed = 1; seed < 40 && Object.keys(seen).length < 4; seed++) {
    let now = NOW;
    const state = Core.newState(game, sim, ctxAt(now, seed));
    sim.starterLine(state, cfg, 'iron-ore');
    state.run.money = Big.str(Big.of(1000));
    sim.build(state, 'furnace', 0, state.run.h - 1, 0, cfg);
    for (let i = 0; i < 900 && !state.run.ev; i++) {
      now += 1000;
      sim.tick(state, 1, ctxAt(now, seed));
    }
    const ev = state.run.ev;
    if (!ev) continue;
    seen[ev.id] = ev.text;
    if (ev.id === 'outage') {
      if (!sim.env(state, ctxAt(now), sim.world(state), () => {}).outage) throw new Error('сбой не останавливает печи');
      sim.fixPower(state, now);
      now += 1000;
      sim.tick(state, 1, ctxAt(now, seed));
      if (state.run.ev && state.run.ev.id === 'outage') throw new Error('щиток не починил');
    }
    if (ev.id === 'meteor' && !state.run.ore.some((o) => o.u)) throw new Error('метеорит без пятна');
  }
  console.log('  ' + Object.keys(seen).map((k) => k + ': ' + seen[k]).join('\n  '));
  if (Object.keys(seen).length < 4) throw new Error('видели только ' + Object.keys(seen));
});

T.test('«Аврал» ×2 на 3 минуты, сундук «Пассажира», доход поездки ×2', () => {
  const state = played(400);
  const base = sim.windowRate(state.run, cfg);
  let now = state.lastTick;
  sim.rush(state, now, cfg);
  const m0 = Big.toNumber(state.run.money);
  for (let i = 0; i < 120; i++) {
    now += 1000;
    sim.tick(state, 1, ctxAt(now));
  }
  const rushRate = (Big.toNumber(state.run.money) - m0) / 120;
  // The rush doubles the drill, but the furnace makes 0,5 a second as well — both ×2.
  if (rushRate < base * 1.8) throw new Error('аврал: ' + rushRate + ' против ' + base);
  if (Math.abs(sim.windowRate(state.run, cfg) - base) / base > 0.05) throw new Error('аврал попал в офлайн-ставку');
  const m1 = Big.toNumber(state.run.money);
  now += 4 * 60000;
  for (let i = 0; i < 60; i++) {
    now += 1000;
    sim.tick(state, 1, ctxAt(now, 1, { mult: 2 }));
  }
  const tripRate = (Big.toNumber(state.run.money) - m1) / 60;
  console.log('  ставка ' + base.toFixed(2) + '/с, в аврал ' + rushRate.toFixed(2) + '/с, в поездке ' + tripRate.toFixed(2) + '/с');
  if (Math.abs(tripRate - 2 * base) / base > 0.1) throw new Error('поездка: ' + tripRate);
});

T.test('новая планета: порог, кредиты, выбор из двух, магазин, чертежи переносятся', () => {
  let now = NOW;
  const state = played(200);
  state.run.res.blueprints = 1;
  const bp = sim.saveBlueprint(state, 0, 0, state.run.w - 1, state.run.h - 1, cfg);
  if (!bp.ok) throw new Error('чертёж: ' + bp.reason);
  const info0 = Core.prestigeInfo(sim, game, state, 'planet', cfg);
  if (info0.can) throw new Error('переезд без дрона');
  state.run.goalSold = 1;
  state.run.earned = Big.str(Big.of(cfg['planet.minEarned']));
  const r = Core.prestige(sim, game, state, 'planet', ctxAt(now));
  const expect = Math.floor(Math.sqrt(Big.toNumber(cfg['planet.minEarned']) / Big.toNumber(cfg['planet.div'])));
  if (!r.ok || Big.toNumber(state.layers.planet.currency) !== expect) throw new Error('кредиты ' + Big.str(state.layers.planet.currency) + ', ждали ' + expect);
  if (state.run.planet !== 'icy') throw new Error('первый переезд: ' + state.run.planet);
  if (state.meta.bp.length !== 1) throw new Error('чертёж потерялся');
  if (sim.blueprintFits(state, state.meta.bp[0])) throw new Error('чертёж железа подошёл Ледяной');
  const speed0 = sim.speeds(state, cfg).drill;
  if (Math.abs(speed0 - cfg['drill.rate'] * (1 + cfg['credit.bonus'] * expect)) > 1e-9) throw new Error('кредиты не ускоряют: ' + speed0);
  const opts = sim.planetOptions(state, 1, cfg);
  if (opts.length !== 2 || opts.indexOf('icy') >= 0) throw new Error('выбор: ' + opts);
  sim.choosePlanet(state, opts[1]);
  state.run.goalSold = 1;
  state.run.earned = Big.str(Big.of(cfg['planet.minEarned']));
  state.layers.planet.currency = Big.str(Big.of(100));
  for (const id of ['money', 'research', 'courier']) if (!sim.shopBuy(state, id, cfg).ok) throw new Error('магазин: ' + id);
  if (sim.shopBuy(state, 'courier', cfg).ok) throw new Error('курьер куплен дважды');
  const r2 = Core.prestige(sim, game, state, 'planet', ctxAt(now));
  if (!r2.ok || state.run.planet !== opts[1]) throw new Error('второй переезд: ' + state.run.planet);
  if (Big.toNumber(state.run.money) !== cfg['start.money'] + cfg['shop.money.amount']) throw new Error('стартовый капитал ' + Big.str(state.run.money));
  if (state.run.res.belts !== 1 || !state.run.res.courier) throw new Error('начальные исследования: ' + JSON.stringify(state.run.res));
  console.log('  первый переезд: ' + expect + ' кредитов, скорость ×' + (1 + cfg['credit.bonus'] * expect).toFixed(2) + '; второй: выбор ' + opts.join(' / ') + ', посещено ' + state.meta.visited.join(', '));
});

T.test('ачивки: первый дрон, без прохода, пять планет', () => {
  const state = Core.newState(game, sim, ctxAt(NOW));
  const sink = [];
  const E = sim.env(state, ctxAt(NOW), sim.world(state), () => {});
  if (!E) throw new Error('нет окружения');
  state.run.sold.drone = 0;
  // A drone into the port: through the seller of a tick.
  state.run.ore = [];
  state.run.lv++;
  const s = sim.factory.make('storage', 0, 0, 0);
  s.s.push('drone');
  state.run.b.push(s, sim.factory.make('port', 1, 0, 0));
  state.run.lv++;
  sim.tick(state, 0.1, ctxAt(NOW + 100));
  if (!state.meta.flags.drone || !state.meta.flags.noTunnel) throw new Error('флаги: ' + JSON.stringify(state.meta.flags) + sink);
  if (state.run.goalSold !== 1) throw new Error('дрон не засчитан');
});

T.test('сохранение после долгой игры: читается, без NaN, проверка проходит', () => {
  let now = NOW;
  const rng = Rng.make(42);
  const state = Core.newState(game, sim, ctxAt(now, 42));
  sim.starterLine(state, cfg, 'iron-ore');
  for (let i = 0; i < 3600; i++) {
    now += 1000;
    sim.tick(state, 1, ctxAt(now, 42));
    if (i % 300 === 299) {
      sim.starterLine(state, cfg, '');
      for (const id of ['drills', 'furnaces', 'trade', 'idle', 'counters']) if (sim.canResearch(state, id, cfg)) sim.buyResearch(state, id, cfg, rng, now);
    }
  }
  state.lastTick = now;
  const bad = numbers(state, 'state', []);
  if (bad.length) throw new Error('NaN: ' + bad.slice(0, 5).join(', '));
  if (Core.validate(state, game) || sim.validate(state)) throw new Error('проверка: ' + Core.validate(state, game) + ' ' + sim.validate(state));
  const json = JSON.stringify(state);
  const picked = Core.pick([{ json, seq: 1, source: 'test' }], game, sim);
  if (!picked.state) throw new Error('не читается: ' + JSON.stringify(picked.broken));
  console.log('  час игры: зданий ' + state.run.b.length + ', заработано ' + Big.str(state.run.earned) + ', сохранение ' + (json.length / 1024).toFixed(1) + ' КБ');
  // The fixture is a real mid-game save of this version.
  const file = path.join(x.dir, 'fixtures', 'v1.json');
  if (process.env.WRITE_FIXTURE) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const out = JSON.parse(json);
    out.game = x.id;
    out.seq = 7;
    fs.writeFileSync(file, JSON.stringify(out));
  }
  const fixture = JSON.parse(fs.readFileSync(file, 'utf8'));
  const old = Core.pick([{ state: fixture, seq: fixture.seq, source: 'fixture' }], game, sim);
  if (!old.state) throw new Error('fixtures/v1.json не читается: ' + JSON.stringify(old.broken));
  let t = now;
  for (let i = 0; i < 60; i++) {
    t += 1000;
    sim.tick(old.state, 1, ctxAt(t, 42));
  }
  if (numbers(old.state, 'fixture', []).length) throw new Error('NaN после fixtures');
});

T.test('планета от модели: проверка запаса, приём, на ней можно играть', () => {
  const good = {
    title: 'Туманная', about: 'Сырые долины, где всё покрыто росой', feature: 'Медленные буры, дорогие изделия',
    resources: ['fog-ore', 'moss'],
    items: [
      { id: 'fog-ore', title: 'Туманная руда', price: 1, shape: 'ore', color: '#9AA5B1' },
      { id: 'moss', title: 'Мох', price: 1, shape: 'ore', color: '#6FA36F' },
      { id: 'fog-bar', title: 'Туманный брусок', price: 3, shape: 'ingot', color: '#B9C2CC' },
      { id: 'felt', title: 'Войлок', price: 3, shape: 'plate', color: '#88B088' },
      { id: 'lamp', title: 'Фонарь', price: 9, shape: 'cell', color: '#E8D46B' },
      { id: 'beacon', title: 'Маяк', price: 30, shape: 'drone', color: '#EDEDED' }
    ],
    recipes: [
      { at: 'furnace', in: { 'fog-ore': 1 }, out: 'fog-bar', n: 1, sec: 2 },
      { at: 'furnace', in: { moss: 1 }, out: 'felt', n: 1, sec: 2 },
      { at: 'assembler', in: { 'fog-bar': 1, felt: 1 }, out: 'lamp', n: 1, sec: 3 },
      { at: 'assembler', in: { lamp: 2, 'fog-bar': 2 }, out: 'beacon', n: 1, sec: 6 }
    ],
    goal: 'beacon'
  };
  const why = sim.validateStock('planet', good);
  if (why) throw new Error('хорошая планета не прошла: ' + why);
  const loop = JSON.parse(JSON.stringify(good));
  loop.recipes[0].in = { lamp: 1 };
  if (!sim.validateStock('planet', loop)) throw new Error('круг рецептов прошёл');
  const cheap = JSON.parse(JSON.stringify(good));
  cheap.items[5].price = 10;
  if (!sim.validateStock('planet', cheap)) throw new Error('дешёвое изделие прошло');
  const state = Core.newState(game, sim, ctxAt(NOW));
  const id = sim.adoptPlanet(state, good);
  sim.choosePlanet(state, id);
  state.run.goalSold = 1;
  state.run.earned = Big.str(Big.of(cfg['planet.minEarned']));
  state.layers.planet.count = 3;
  Core.prestige(sim, game, state, 'planet', ctxAt(NOW));
  if (state.run.planet !== id) throw new Error('не улетели: ' + state.run.planet);
  if (!state.run.ore.length) throw new Error('на планете нет руды');
  if (sim.validate(state) || Core.validate(state, game)) throw new Error('проверка состояния');
  if (sim.researchList(state).find((r) => r.id === 'top').text.indexOf('маяк') < 0) throw new Error('исследование главного изделия');
  console.log('  ' + good.title + ': ' + state.run.ore.length + ' клеток руды, рецептов ' + good.recipes.length + ', круг и дешёвое изделие отклонены');
});

T.done('economy');
