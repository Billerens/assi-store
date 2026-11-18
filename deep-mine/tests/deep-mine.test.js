// The logic of «Шахта вглубь» against its spec (docs/games/deep-mine.md, «Темп» and «Как
// проверить»), in a node workspace of the Axiko harness. node tests/deep-mine.test.js
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const GAME = path.resolve(__dirname, '..');
const HARNESS = path.join(process.env.AXIKO_ROOT || path.resolve(__dirname, '../../../Axiko'), 'scripts/games/harness.js');
const H = require(HARNESS);
const { test, done } = H;
const ID = 'deep-mine';

const env = H.workspace({ fixture: false });
process.on('exit', () => env.close());
fs.cpSync(GAME, path.join(env.root, 'modules', 'games', ID), { recursive: true, filter: (src) => !/[\\/]tests([\\/]|$)/.test(path.relative(GAME, src) ? '/' + path.relative(GAME, src) : '') });
const x = H.gameOf(env, ID);
const { Core, Big, Rng, sim, game } = x;
const cfg = x.cfg;
const bot = env.require('modules/games/' + ID + '/bot.js');
const HOUR = 3600000;

function fresh(now) {
  return Core.newState(game, sim, { now: now || Date.UTC(2026, 10, 2, 5), config: cfg, rng: Rng.make(11) });
}
function ctx(now, extra) { return Object.assign({ now, config: cfg, rng: Rng.make(5), mult: 1, offline: false }, extra || {}); }
function within(v, target, tol) { return Math.abs(v - target) / target <= tol; }

let wellOne = null;
test('темп первой скважины по таблице «Темп» (±25 %), 1 000 м к 15–25-й минуте', () => {
  wellOne = bot.well(game, sim, cfg, 120, 0, [5, 15, 30, 60, 120]);
  const spec = { 5: 310, 15: 870, 30: 1300, 60: 1740, 120: 2150 };
  console.log('  скважина 1: ' + Object.keys(spec).map((m) => m + ' мин — ' + wellOne.at[m] + ' м (по описанию ~' + spec[m] + ')').join(', '));
  console.log('  1 000 м на ' + wellOne.thousandMin.toFixed(1) + ' мин; средняя за 10 мин скорость ниже 0,2 м/с с ' + wellOne.slowMin + ' мин');
  for (const m in spec) assert.ok(within(wellOne.at[m], spec[m], 0.25), m + ' мин: ' + wellOne.at[m] + ' м');
  assert.ok(wellOne.thousandMin >= 15 && wellOne.thousandMin <= 25);
  assert.ok(wellOne.slowMin >= 45 && wellOne.slowMin <= 90, 'медленно с ' + wellOne.slowMin);
  assert.ok(wellOne.firstBuySec <= 10, 'первая покупка ' + wellOne.firstBuySec);
});

test('с 8 Керна быстрее по таблице «Темп»', () => {
  const w = bot.well(game, sim, cfg, 60, 8, [5, 15, 30, 60]);
  const spec = { 5: 580, 15: 1220, 30: 1680, 60: 2100 };
  console.log('  с 8 Керна: ' + Object.keys(spec).map((m) => m + ' мин — ' + w.at[m] + ' м (~' + spec[m] + ')').join(', '));
  for (const m of [15, 30, 60]) assert.ok(within(w.at[m], spec[m], 0.3), m + ' мин: ' + w.at[m]);
  for (const m of [5, 15, 30, 60]) assert.ok(w.at[m] > wellOne.at[m] || m === 5, 'с Керном не быстрее на ' + m + ' мин');
});

test('следующая скважина доходит до прежнего рекорда за 40–60 % времени', () => {
  // Well 1: 60 minutes, then «Новая скважина» on that very state: its Керн and Чертежи, the workshop
  // bought with them (the bot's order), and the second well is played to the old record.
  const w = bot.well(game, sim, cfg, 60, 0, [60]);
  const target = w.state.run.depth;
  const st = w.state;
  const r = Core.prestige(sim, game, st, 'core', ctx(w.now));
  assert.ok(r.ok);
  sim.playWorkshop(st, cfg);
  let now = w.now;
  let sec = 0;
  while (st.run.depth < target && sec < 7200) {
    sim.play(st, ctx(now), 3);
    sim.tick(st, 1, ctx(now + 1000));
    now += 1000;
    sec++;
  }
  const share = sec / 3600;
  console.log('  рекорд ' + Math.round(target) + ' м (Керн +' + Big.toNumber(r.gain) + ', Чертежей ' + st.layers.core.state.bp + ' до покупок): вторая скважина за ' + (sec / 60).toFixed(1) + ' мин — ' + Math.round(share * 100) + ' % (мастерская: ' + JSON.stringify(st.layers.core.state.ws) + ')');
  assert.ok(share >= 0.35 && share <= 0.6, 'доля ' + share);
});

test('три дня по две поездки: первая покупка до 10 с, первая скважина в поездках 3–6', () => {
  const r = bot.trips(game, sim, cfg, {});
  console.log('  первая покупка на ' + r.firstBuySec + ' с; глубина к концу поездок: ' + r.ends.join(', ') + ' м');
  console.log('  скважины: ' + r.prestiges.map((p) => 'поездка ' + p.trip + ' (' + p.activeMin + ' мин игры, ' + p.depth + ' м, +' + Big.toNumber(p.gain) + ' Керна)').join('; '));
  assert.ok(r.firstBuySec <= 10);
  assert.ok(r.prestiges.length >= 1);
  assert.ok(r.prestiges[0].trip >= 3 && r.prestiges[0].trip <= 6, 'первая в поездке ' + r.prestiges[0].trip);
  assert.strictEqual(Core.validate(r.state, game), null);
  assert.strictEqual(sim.validate(r.state), null);
});

test('Керн: 1 500 м — 4, 2 000 — 8, 3 000 — 18, 5 000 — 50; до 1 000 м нельзя', () => {
  const st = fresh();
  for (const [d, k] of [[1500, 4], [2000, 8], [3000, 18], [5000, 50], [999, 0], [1000, 2]]) {
    st.run.depth = d;
    assert.strictEqual(Big.toNumber(sim.prestigeGain(st, 'core', cfg)), k, d + ' м');
  }
  st.layers.edge.currency = '2';
  st.run.depth = 2000;
  assert.strictEqual(Big.toNumber(sim.prestigeGain(st, 'core', cfg)), 32, 'две Карты недр: Керн ×4');
  st.layers.edge.currency = '3';
  assert.strictEqual(Big.toNumber(sim.prestigeGain(st, 'core', cfg)), 64, 'три Карты недр: Керн ×8');
  assert.strictEqual(sim.bonus(st, 'edge', '2', cfg), 4, 'множитель слоя на экране движка');
});

test('Водоносный горизонт: метку ставит любая покупка насоса — кнопкой и Начальником участка', () => {
  // By hand: pumps up to the inflow.
  const st = fresh();
  st.run.depth = 1200;
  st.meta.record = 1200;
  st.run.money = '1e30';
  assert.ok(!sim.pumpsHold(st, cfg));
  while (!st.meta.aquifer) assert.ok(sim.buyEq(st, 'pump', cfg), 'насос');
  assert.ok(sim.pumpsHold(st, cfg));
  // The Начальник участка (auto-buyer of the workshop) buys the pumps itself: the mark is there too.
  const au = fresh();
  au.run.depth = 1200;
  au.meta.record = 1200;
  au.run.money = '1e30';
  sim.cs(au).ws.chief = 1;
  assert.ok(sim.ws(au, 'chief') > 0, 'Начальник участка куплен');
  for (let i = 0; i < 10 && !au.meta.aquifer; i++) sim.tick(au, 1, ctx(Date.UTC(2026, 10, 2, 5) + (i + 1) * 1000));
  assert.ok(au.run.eq.pump > 0 && au.meta.aquifer, 'насосы Начальника участка — тоже ачивка');
  // A stream (no pumps needed) does not count: the pumps must hold the water themselves.
  const sr = fresh();
  sr.run.depth = 1200;
  sr.run.money = '1e30';
  sr.run.buffs.stream = Date.UTC(2030, 0, 1);
  sim.buyEq(sr, 'pump', cfg);
  assert.ok(!sr.meta.aquifer, 'ручей не в счёт');
});

/** Plays to `depth` online, then returns the state (the bot's own play). */
function playTo(depth) {
  const st = fresh();
  let now = Date.UTC(2026, 10, 2, 5);
  while (st.run.depth < depth) {
    sim.play(st, ctx(now), 3);
    sim.tick(st, 1, ctx(now + 1000));
    now += 1000;
  }
  st.lastTick = now;
  st.run.event = null;
  return { st, now };
}

test('офлайн 8 ч с 1 500 м: совпадает с онлайн-прогоном ×0,5 до 2 %, шаг 30 с против 1 с — до 1 %', () => {
  const { st, now } = playTo(1500);
  const p = Core.plan(now, now + 8 * HOUR, cfg, 0);
  const mk = (seg) => ({ now: seg.to, config: cfg, rng: Rng.make(1), mult: 1 });
  const a = Core.clone(st);
  Core.runOffline(sim, a, game, p, null, mk, cfg);
  const b = Core.clone(st);
  const fine = Object.assign({}, cfg, { 'offline.stepSec': 1, 'offline.maxSteps': 100000 });
  Core.runOffline(sim, b, game, p, null, mk, fine);
  // Online: the same 8 hours by 1-second ticks, the links' multiplier 0.5 (the offline share).
  const c = Core.clone(st);
  let t = now;
  for (let s = 0; s < 8 * 3600; s++) {
    sim.tick(c, 1, { now: t + 1000, config: cfg, rng: Rng.make(2), mult: cfg['offline.rate'], offline: false });
    c.run.event = null;
    t += 1000;
  }
  const da = a.run.depth - st.run.depth;
  const db = b.run.depth - st.run.depth;
  const dc = c.run.depth - st.run.depth;
  console.log('  с 1 500 м за 8 ч: офлайн шагом 30 с +' + da.toFixed(1) + ' м, шагом 1 с +' + db.toFixed(1) + ' м, онлайн ×0,5 +' + dc.toFixed(1) + ' м');
  assert.ok(Math.abs(da - db) / db < 0.01);
  assert.ok(Math.abs(da - dc) / dc < 0.02);
  assert.ok(Big.gt(a.run.money, 0));
  assert.strictEqual(Core.validate(a, game), null);
});

test('шаг 30 с равен 30 шагам по 1 с (точный интеграл бурения и денег)', () => {
  const { st, now } = playTo(800);
  const a = Core.clone(st);
  const b = Core.clone(st);
  sim.tick(a, 30, ctx(now + 30000));
  for (let s = 0; s < 30; s++) sim.tick(b, 1, ctx(now + (s + 1) * 1000));
  const da = a.run.depth - st.run.depth;
  const db = b.run.depth - st.run.depth;
  const ma = Big.toNumber(Big.sub(a.run.money, st.run.money));
  const mb = Big.toNumber(Big.sub(b.run.money, st.run.money));
  assert.ok(Math.abs(da - db) / db < 0.001, da + ' / ' + db);
  assert.ok(Math.abs(ma - mb) / Math.abs(mb) < 0.001, ma + ' / ' + mb);
});

test('сводка офлайна: снимок «было», находки ждут, снимок уходит с первым онлайн-тактом', () => {
  const { st, now } = playTo(600);
  st.layers.core.state.ws.seismic = 1;
  st.run.sure = true;
  const events = [];
  const p = Core.plan(now, now + 6 * HOUR, cfg, 0);
  Core.runOffline(sim, st, game, p, null, (seg) => ({ now: seg.to, config: cfg, rng: Rng.make(3), mult: 1, report: (t) => events.push(t) }), cfg);
  assert.ok(st.run.away && st.run.away.depth > 0, 'нет снимка');
  assert.ok(st.run.away.finds.length >= 1, 'находка офлайн не записана');
  assert.ok(st.run.finds.length >= 1, 'находка не ждёт');
  sim.tick(st, 0.1, ctx(p.to + 100));
  assert.ok(!st.run.away, 'снимок остался');
});

test('вода без насосов — скорость ×0,5, с насосами ×1; ручей снимает нужду', () => {
  const st = fresh();
  st.run.depth = 1200;
  st.meta.record = 1200;
  const v0 = sim.speed(st, cfg, 1, 0);
  while (sim.coverage(st, 'pump', 1200, cfg, 0) < 1) st.run.eq.pump++;
  const v1 = sim.speed(st, cfg, 1, 0);
  assert.ok(Math.abs(v1 / v0 - 2) < 1e-9, 'отношение ' + v1 / v0);
  st.run.eq.pump = 0;
  st.run.buffs.stream = 1000;
  assert.ok(Math.abs(sim.speed(st, cfg, 1, 0) - v1) < 1e-12, 'ручей');
});

test('жар: перегрев ×0,3 на экране и ×0,5 офлайн; сброс тепла — рывок', () => {
  const st = fresh();
  st.run.depth = 3100;
  st.meta.record = 3100;
  ['pump', 'vent'].forEach((id) => { while (sim.coverage(st, id, 3100, cfg, 0) < 1) st.run.eq[id]++; });
  const v = sim.speed(st, cfg, 1, 0);
  st.run.over = true;
  st.run.heat = 100;
  assert.ok(Math.abs(sim.speed(st, cfg, 1, 0, false) / v - cfg['heat.overMult']) < 1e-9);
  assert.ok(Math.abs(sim.speed(st, cfg, 1, 0, true) / v - 0.5) < 1e-9);
  assert.ok(sim.vent(st, cfg, 0));
  assert.strictEqual(st.run.heat, 0);
  assert.ok(Math.abs(sim.speed(st, cfg, 1, 0) / v - cfg['heat.burstMult']) < 1e-9);
});

test('все 15 событий берутся без ошибок; штрек +20 м, тишина — находка, геологи — Чертёж раньше', () => {
  const st = fresh();
  st.run.depth = 9500;
  st.meta.record = 9500;
  st.layers.core.state.record = 9500;
  st.layers.core.state.bpAt = 9750;
  sim.CREWS.forEach((c, i) => { st.run.crews[i] = 10; });
  st.run.money = '1e30';
  st.run.mark = 9600;
  for (const e of sim.EVENTS) {
    st.run.event = { id: e.id, until: 5000, options: e.id === 'voice' ? ['rich', 'lucky'] : undefined };
    const before = st.run.depth;
    sim.eventTake(st, cfg, 0, 1000, Rng.make(8));
    if (e.id === 'drift') assert.ok(Math.abs(st.run.depth - before - cfg['event.drift.m']) < 1e-9);
    if (e.id === 'geologists') assert.strictEqual(st.layers.core.state.bpAt, 9625);
    if (e.id === 'voice') assert.strictEqual(st.run.rule, 'rich');
    assert.strictEqual(sim.validate(st), null, e.id);
  }
  assert.ok(st.run.sure, 'тишина: следующая находка гарантирована');
  const finds = st.run.finds.length;
  sim.advance(st, 200, cfg, Rng.make(1), 2000);
  assert.ok(st.run.finds.length > finds, 'гарантированная находка не пришла');
  assert.strictEqual(Core.validate(st, game), null);
});

test('события только на экране и по глубине', () => {
  const st = fresh();
  let now = 1000;
  const seen = {};
  for (let i = 0; i < 400; i++) {
    sim.tick(st, 1, { now, config: cfg, rng: Rng.make(i), mult: 1, offline: false });
    if (st.run.event) {
      seen[st.run.event.id] = 1;
      st.run.event = null;
    }
    now += 200000;
  }
  assert.ok(Object.keys(seen).length >= 5);
  ['stream', 'gas', 'overheat', 'lake', 'druse', 'voice'].forEach((id) => assert.ok(!seen[id], id + ' на мелководье'));
  st.run.eventAt = 1;
  sim.tick(st, 1, { now: now + 1e6, config: cfg, rng: Rng.make(1), mult: 1, offline: true });
  assert.ok(!st.run.event, 'событие офлайн');
});

test('мастерская: головка до 1,6, трос, вышка, подъёмник, ночная смена', () => {
  const st = fresh();
  st.layers.core.state.bp = 10000;
  st.layers.core.state.record = 3000;
  for (let i = 0; i < 30; i++) sim.buyWs(st, 'bit', cfg);
  assert.strictEqual(sim.growth(st, cfg), cfg['ws.bit.min']);
  ['rope', 'rig', 'lift', 'lift', 'night', 'motor'].forEach((id) => sim.buyWs(st, id, cfg));
  assert.strictEqual(sim.offlineRate(st, cfg), 1);
  assert.strictEqual(sim.capBonusHours(st), 12);
  st.run.depth = 1200;
  const r = Core.prestige(sim, game, st, 'core', ctx(1000));
  assert.ok(r.ok);
  assert.strictEqual(st.run.depth, 300, 'трос: 10 % рекорда');
  assert.ok(st.run.staff.master && st.run.staff.mechanic, 'вышка');
});

test('мастерская без потолка: двигатель и ночная смена растут в цене, вехи бригад идут дальше списка', () => {
  const st = fresh();
  st.layers.core.state.bp = 1e6;
  assert.strictEqual(sim.wsMax(st, 'motor', cfg), Infinity);
  assert.strictEqual(sim.wsMax(st, 'night', cfg), Infinity);
  const base = sim.speed(st, cfg, 1, 0);
  const prices = [];
  for (let i = 0; i < 6; i++) {
    prices.push(sim.wsCost(st, 'motor', cfg));
    assert.ok(sim.buyWs(st, 'motor', cfg), 'уровень двигателя ' + (i + 1));
  }
  for (let i = 1; i < prices.length; i++) assert.ok(prices[i] > prices[i - 1], 'цена двигателя растёт: ' + prices.join(', '));
  const want = cfg['ws.motor.mult'] * Math.pow(cfg['ws.motor.step'], 5);
  assert.ok(within(sim.speed(st, cfg, 1, 0) / base, want, 0.001), 'мощность ×' + want);
  const one = sim.wsCost(st, 'night', cfg);
  for (let i = 0; i < 3; i++) assert.ok(sim.buyWs(st, 'night', cfg));
  assert.ok(sim.wsCost(st, 'night', cfg) > one, 'цена ночной смены растёт');
  assert.strictEqual(sim.capBonusHours(st), 3 * cfg['ws.night.hours']);
  // The one-off nodes stay one-off.
  assert.ok(sim.buyWs(st, 'rope', cfg));
  assert.ok(!sim.buyWs(st, 'rope', cfg), 'трос разовый');
  // Milestones: the list, then every crew.milestoneStep.
  const list = String(cfg['crew.milestones']).split(',').map(Number);
  const last = list[list.length - 1];
  const step = cfg['crew.milestoneStep'];
  assert.strictEqual(sim.nextMilestone(last, cfg), last + step);
  assert.strictEqual(sim.nextMilestone(last + step, cfg), last + 2 * step);
  assert.strictEqual(sim.milestoneMult(last + step - 1, cfg), Math.pow(cfg['crew.milestoneMult'], list.length));
  assert.strictEqual(sim.milestoneMult(last + 3 * step, cfg), Math.pow(cfg['crew.milestoneMult'], list.length + 3));
  assert.strictEqual(sim.milestoneMult(list[0], cfg), cfg['crew.milestoneMult']);
});

test('Новый край: с рекорда 5 000 м, Карты недр, сброс Керна и мастерской, выбор края', () => {
  const st = fresh();
  sim.advance(st, 5200, cfg, Rng.make(1), 0);
  st.layers.core.currency = '40';
  st.layers.core.state.ws.motor = 1;
  const info = Core.prestigeInfo(sim, game, st, 'edge', cfg);
  assert.ok(info.can);
  assert.strictEqual(Big.toNumber(info.gain), 2);
  const r = Core.prestige(sim, game, st, 'edge', ctx(1000));
  assert.ok(r.ok);
  assert.strictEqual(Big.toNumber(st.layers.core.currency), 0);
  assert.deepStrictEqual(st.layers.core.state.ws, {});
  assert.strictEqual(st.layers.core.state.bp, 0);
  assert.ok(st.layers.edge.state.pick, 'выбор края');
  assert.ok(sim.chooseEdge(st, 'volcanic'));
  assert.strictEqual(sim.zoneStart(st, 'heat', cfg), 1500);
  assert.ok(Math.abs(Big.toNumber(sim.value(st, 0, cfg)) - 2) < 1e-9);
  assert.strictEqual(st.meta.record >= 5200, true, 'рекорд всех скважин остался');
  assert.strictEqual(Core.validate(st, game), null);
});

test('сохранение прежней версии читается (fixtures/v1.json), миграция не нужна', () => {
  const v1 = JSON.parse(fs.readFileSync(path.join(GAME, 'fixtures', 'v1.json'), 'utf8'));
  const picked = Core.pick([{ state: v1, seq: v1.seq, source: 'fixture' }], game, sim);
  assert.ok(picked.state, JSON.stringify(picked.broken));
  assert.strictEqual(sim.validate(picked.state), null);
  const before = picked.state.run.depth;
  sim.tick(picked.state, 10, ctx(v1.lastTick + 10000));
  assert.ok(picked.state.run.depth > before);
});

test('без NaN после долгой игры с офлайном; сундук «Пассажира»', () => {
  const r = bot.trips(game, sim, cfg, { days: 1 });
  const json = JSON.stringify(r.state);
  assert.ok(!/NaN|Infinity/.test(json));
  const st = fresh();
  const loot = sim.chest(st, Rng.make(2), cfg);
  assert.strictEqual(st.run.depth, cfg['chest.meters']);
  assert.ok(loot.items.length === 2 && st.run.finds.length === 1);
});

test('уведомления: время до уровня бура и до зоны', () => {
  const { st, now } = playTo(700);
  st.run.money = '0';
  const ev = sim.next(st, now, cfg);
  assert.ok(ev.some((e) => e.id === 'drill' && e.at > now));
  assert.ok(ev.every((e) => game.notify.some((n) => n.id === e.id)));
});

done('deep-mine');
