// The rules of «Рыбалка» one by one: the cast, the hook, the fight, the shop, the aquarium, the
// weather, legends, events, the links, the save. node tests/rules.test.js
'use strict';
const assert = require('assert');
const { open, ctxOf, test, done } = require('./env');

const x = open();
const { sim, cfg, Core, Big, Rng, game } = x;
const NOW = Date.UTC(2026, 10, 3, 10, 0, 0);
const near = (a, b, eps, text) => assert.ok(Math.abs(a - b) <= eps, (text || '') + ': ' + a + ' / ' + b);

function fresh(now) {
  return Core.newState(game, sim, ctxOf(x, now || NOW, Rng.make(1)));
}

/** A rng that always says «0» (first item, lower bound): the unlucky or the lucky branch at will. */
function fixed(v) {
  return { next: () => v, range: (a, b) => a + (b - a) * v, int: () => 0, pick: (l) => l[0], weighted: (l) => l[0], chance: (p) => v < p };
}

function step(s, sec, now, rng) {
  const n = Math.round(sec / 0.05);
  for (let i = 0; i < n; i++) sim.tick(s, 0.05, ctxOf(x, (now || NOW) + i * 50, rng || Rng.make(9)));
}

/** A fight already on the line with a given fish. */
function fight(s, spId, w, d) {
  s.run.cast = { phase: 'bite', sp: spId, w: w, d: d || 15, el: 0, win: 1, bait: 'worm', charged: true };
  assert.strictEqual(sim.press(s, cfg, NOW, Rng.make(1)), 'hooked');
  return s.run.cast;
}

test('заброс: дальность от удержания, наживка списывается один раз, червь бесплатный', () => {
  const s = fresh();
  assert.strictEqual(sim.press(s, cfg, NOW, Rng.make(1)), 'aim');
  sim.tick(s, cfg['cast.fillSec'] / 2, ctxOf(x, NOW, Rng.make(1)));
  near(s.run.cast.fill, 0.5, 1e-9, 'полоса дальности');
  assert.strictEqual(sim.release(s, cfg, NOW, Rng.make(1)), 'cast');
  assert.strictEqual(s.run.cast.phase, 'wait');
  near(s.run.cast.d, Math.round(0.5 * sim.maxRange(s, cfg) * 10) / 10, 0.11, 'дистанция');
  const s2 = fresh();
  s2.run.bait.bloodworm = 3;
  assert.ok(sim.setBait(s2, 'bloodworm'));
  assert.ok(sim.throwAt(s2, cfg, NOW, Rng.make(2), 0.01, false));
  assert.strictEqual(s2.run.bait.bloodworm, 2);
  assert.ok(s2.run.cast.d >= cfg['cast.min'], 'не ближе минимума');
  assert.ok(!sim.throwAt(s2, cfg, NOW, Rng.make(2), 0.5, false), 'второй заброс поверх первого не идёт');
  assert.strictEqual(s2.run.bait.bloodworm, 2, 'и не списывает');
  const s3 = fresh();
  sim.throwAt(s3, cfg, NOW, Rng.make(2), 2, false);
  assert.ok(s3.run.cast.d <= sim.maxRange(s3, cfg), 'не дальше удилища');
});

test('рано нажать — пустой крючок; поздно — сход, крючок удерживает', () => {
  const s = fresh();
  sim.throwAt(s, cfg, NOW, Rng.make(3), 0.5, false);
  assert.strictEqual(sim.press(s, cfg, NOW, Rng.make(1)), 'early');
  assert.strictEqual(s.run.cast.msg, 'early');
  const late = fresh();
  late.run.cast = { phase: 'late', sp: 'karas', w: 0.3, d: 10, el: 2, win: 1 };
  assert.strictEqual(sim.press(late, cfg, NOW, fixed(0.99)), 'missed', 'без крючка поздняя подсечка не держит');
  const kept = fresh();
  kept.run.up.hook = 5;
  kept.run.cast = { phase: 'late', sp: 'karas', w: 0.3, d: 10, el: 2, win: 1 };
  near(sim.keepChance(kept, cfg), Math.min(cfg['hook.keepMax'], 5 * cfg['hook.keepPer']), 1e-12, 'шанс удержать');
  assert.strictEqual(sim.press(kept, cfg, NOW, fixed(0)), 'hooked');
  // Missing the window entirely.
  const miss = fresh();
  miss.run.cast = { phase: 'bite', sp: 'karas', w: 0.3, d: 10, el: 0, win: 0.5 };
  sim.tick(miss, 0.5 + cfg['hook.late'] + 0.1, ctxOf(x, NOW, Rng.make(1)));
  assert.strictEqual(miss.run.cast.msg, 'missed');
  // The float widens the window.
  const f = fresh();
  f.run.up.float = 3;
  near(sim.hookWindow(f, cfg), cfg['hook.window'] * (1 + 3 * cfg['float.per']), 1e-12, 'окно поплавка');
});

test('натяжение: дольше snap.sec на 100 — обрыв; амортизатор спасает один раз', () => {
  const s = fresh();
  const c = fight(s, 'karas', 0.3);
  c.T = 100;
  c.d = 30;
  for (let i = 0; i < 200 && s.run.cast.phase === 'fight'; i++) {
    s.run.cast.hold = true;
    s.run.cast.T = Math.max(s.run.cast.T, 100);
    sim.tick(s, 0.05, ctxOf(x, NOW, Rng.make(1)));
  }
  assert.strictEqual(s.run.cast.msg, 'snap');
  assert.strictEqual(s.meta.snaps, 1);
  assert.strictEqual(s.meta.streak, 0, 'серия сброшена');
  const a = fresh();
  a.run.up.absorber = 1;
  fight(a, 'karas', 0.3).d = 30;
  let reset = 0;
  for (let i = 0; i < 400 && a.run.cast.phase === 'fight'; i++) {
    a.run.cast.hold = true;
    if (a.run.cast.T < 100) {
      if (a.run.cast.used && !reset) reset = a.run.cast.T;
      a.run.cast.T = 100;
    }
    sim.tick(a, 0.05, ctxOf(x, NOW, Rng.make(1)));
  }
  assert.ok(reset > 0 && reset <= cfg['absorber.to'] + 1, 'натяжение сброшено до ' + cfg['absorber.to'] + ': ' + reset);
  assert.strictEqual(a.run.cast.msg, 'snap', 'второй раз амортизатор не спасает');
});

test('провисшая леска — сход; отпускать и держать по правилу — рыба на берегу', () => {
  const s = fresh();
  const c = fight(s, 'karas', 0.3);
  c.hold = false;
  c.T = cfg['slack.below'] - 1;
  const calm = fixed(0.99);
  for (let i = 0; i < 400 && s.run.cast.phase === 'fight'; i++) {
    s.run.cast.hold = false;
    s.run.cast.T = Math.min(s.run.cast.T, cfg['slack.below'] - 1);
    sim.tick(s, 0.05, ctxOf(x, NOW, calm));
  }
  assert.strictEqual(s.run.cast.msg, 'slack');
  const ok = fresh();
  ok.run.up.line = 2;
  fight(ok, 'karas', 0.3, 12);
  const rng = Rng.make(4);
  for (let i = 0; i < 4000 && ok.run.cast.phase === 'fight'; i++) {
    const cc = ok.run.cast;
    if (cc.hold && cc.T >= 80) sim.release(ok, cfg, NOW, rng);
    else if (!cc.hold && cc.T <= 50) sim.press(ok, cfg, NOW, rng);
    sim.tick(ok, 0.05, ctxOf(x, NOW, rng));
  }
  assert.strictEqual(ok.run.cast.phase, 'caught', 'рыба вытащена: ' + JSON.stringify(ok.run.cast));
  assert.ok(ok.run.pending && ok.run.pending.first && ok.run.pending.s === 3);
});

test('подсак: крупная рыба у берега без подсака может сойти, с подсаком — нет', () => {
  const sp = sim.spOf(fresh(), 'lin');
  const big = sp.avg * cfg['net.big'] * 1.2;
  const run = (landing) => {
    const s = fresh();
    if (landing) s.run.up.landing = 1;
    const c = fight(s, 'lin', big, cfg['shore.meters'] + 0.01);
    c.T = 60;
    c.hold = true;
    for (let i = 0; i < 400 && s.run.cast.phase === 'fight'; i++) {
      s.run.cast.T = 60;
      sim.tick(s, 0.05, { now: NOW, config: cfg, rng: fixed(0.2), mult: 1, links: {}, stock: {}, offline: false });
    }
    return s.run.cast;
  };
  assert.strictEqual(run(false).msg, 'slip');
  assert.strictEqual(run(true).phase, 'caught');
});

test('шансы: часы, погода, наживка и зона множат вес; легенды отдельно', () => {
  const s = fresh();
  const d = sim.zoneDistance(s, cfg, 0);
  const a = sim.chances(s, cfg, NOW, d, 'worm');
  const b = sim.chances(s, cfg, NOW, d, 'bloodworm');
  assert.ok(a.every((e) => e.sp.rarity !== 'legend'), 'легенды не в общей таблице');
  a.forEach((e) => {
    const other = b.find((y) => y.sp.id === e.sp.id);
    const k = (e.sp.bait === 'bloodworm' ? cfg['mult.bait'] : 1) / (e.sp.bait === 'worm' ? cfg['mult.bait'] : 1);
    near(other.w / e.w, k, 1e-9, 'наживка ' + e.sp.id);
    let expect = e.sp.weight * (sim.inHours(e.sp, s, NOW, cfg) ? cfg['mult.hours'] : 1) * (sim.inWeather(e.sp, 'pond', NOW, cfg) ? cfg['mult.weather'] : 1) *
      (e.sp.bait === 'worm' ? cfg['mult.bait'] : 1);
    const zone = Math.abs(sim.fishZone(e.sp, NOW, cfg) - 0);
    expect *= zone === 0 ? 1 : zone === 1 ? cfg['zone.near'] : cfg['zone.far'];
    near(e.w, expect, 1e-9, 'вес ' + e.sp.id);
  });
});

test('вес в пределах вида, звёзды от рекорда, цена по формуле', () => {
  const s = fresh();
  const rng = Rng.make(11);
  const k = sim.content();
  // The weight is rolled at the bite: check the bites.
  const counts = {};
  for (let i = 0; i < 3000; i++) {
    s.run.cast = { phase: 'wait', d: 10 + (i % 25), el: 0, bt: 0.01, fl: [], bait: 'worm', charged: true };
    sim.tick(s, 0.02, ctxOf(x, NOW + i * 600000, rng));
    const c = s.run.cast;
    if (c.phase !== 'bite' || c.snag) continue;
    const sp = k.sp[c.sp];
    counts[c.sp] = (counts[c.sp] || 0) + 1;
    assert.ok(c.w >= sp.avg * cfg['weight.min'] - 1e-9 && c.w <= sp.max + 1e-9, c.sp + ' ' + c.w);
  }
  assert.ok(Object.keys(counts).length >= 4, 'клюют разные виды: ' + JSON.stringify(counts));
  const sp = k.sp.karas;
  const p3 = sim.priceOf(s, sp, 0.5, 3, cfg);
  const raw = sp.base * Math.pow(0.5, cfg['price.power']) * (1 + 2 * cfg['price.star']) * cfg['price.mult'];
  assert.strictEqual(p3, Math.max(1, Math.round(raw)));
  assert.ok(sim.priceOf(s, sp, 0.5, 1, cfg) < p3, 'одна звезда дешевле трёх');
  s.meta.journal.karas = { n: 1, best: 1, first: NOW };
  s.run.cast = { phase: 'fight', sp: 'karas', w: cfg['stars.two'] * 1 + 0.01, d: -1, T: 60, hold: true, ft: 0, over: 0, slack: 0, jerks: 0, jt: 0, shore: true };
  sim.tick(s, 0.05, ctxOf(x, NOW, fixed(0.99)));
  assert.strictEqual(s.run.pending.s, 2, 'две звезды от ' + cfg['stars.two'] + ' рекорда');
  sim.keep(s, cfg, 'sack');
  s.run.cast = { phase: 'fight', sp: 'karas', w: 0.2, d: -1, T: 60, hold: true, ft: 0, over: 0, slack: 0, jerks: 0, jt: 0, shore: true };
  sim.tick(s, 0.05, ctxOf(x, NOW, fixed(0.99)));
  assert.strictEqual(s.run.pending.s, 1, 'одна звезда');
  assert.ok(!s.run.pending.first && !s.run.pending.record);
});

test('аквариум: литры, доход в минуту, не помещается — не берёт; продать и отпустить', () => {
  const s = fresh();
  s.run.pending = { sp: 'karas', w: 0.4, s: 3, p: 10, r: 'c', first: true, record: true };
  s.run.cast = { phase: 'caught' };
  assert.ok(sim.keep(s, cfg, 'aq'));
  near(sim.usedLitres(s, cfg), 0.4 * cfg['aquarium.perKg'], 1e-9, 'литры');
  near(sim.aqRate(s, cfg), 10 * cfg['aquarium.rate'], 1e-12, 'доход');
  const before = Big.toNumber(s.run.coins);
  sim.tick(s, 60, ctxOf(x, NOW, Rng.make(1)));
  near(Big.toNumber(s.run.coins) - before, 10 * cfg['aquarium.rate'], 1e-6, 'за минуту');
  s.run.pending = { sp: 'karas', w: 1000, s: 3, p: 10, r: 'c' };
  s.run.cast = { phase: 'caught' };
  assert.ok(!sim.keep(s, cfg, 'aq'), 'огромная рыба не влезает');
  assert.ok(s.run.pending, 'карточка осталась');
  assert.ok(sim.keep(s, cfg, 'free'));
  assert.strictEqual(s.run.released, 10);
  assert.strictEqual(sim.releaseAq(s, cfg, 0), 10);
  assert.strictEqual(s.run.released, 20);
  assert.strictEqual(s.run.aq.length, 0);
  s.run.up.light = 2;
  s.run.aq.push({ sp: 'albino', w: 6, s: 3, p: 100, r: 'l' });
  near(sim.aqRate(s, cfg), 100 * cfg['aquarium.rate'] * (1 + 2 * cfg['light.per']), 1e-9, 'подсветка для редких');
});

test('садок: продать всё, старый рыбак берёт 5 одинаковых за золотую наживку', () => {
  const s = fresh();
  for (let i = 0; i < 6; i++) {
    s.run.pending = { sp: 'plotva', w: 0.2, s: 1, p: 3, r: 'c' };
    s.run.cast = { phase: 'caught' };
    sim.keep(s, cfg, 'sack');
  }
  assert.strictEqual(sim.sackCount(s), 6);
  assert.ok(!sim.trade(s, cfg, 'plotva', NOW), 'без рыбака не меняется');
  s.run.fisherUntil = NOW + 60000;
  assert.deepStrictEqual(sim.tradeable(s, cfg), ['plotva']);
  assert.ok(sim.trade(s, cfg, 'plotva', NOW));
  assert.strictEqual(s.run.bait.gold, cfg['fisher.gold']);
  assert.strictEqual(sim.sackCount(s), 6 - cfg['fisher.need']);
  const before = Big.toNumber(s.run.coins);
  assert.strictEqual(sim.sellSack(s, cfg), 3 * (6 - cfg['fisher.need']));
  near(Big.toNumber(s.run.coins), before + 3 * (6 - cfg['fisher.need']), 1e-9);
});

test('улучшения без предела: катушка, леска, аквариум, фильтр, подсветка и кот растут дальше прежних потолков', () => {
  ['reel', 'line', 'aquarium', 'filter', 'light', 'cat'].forEach((id) => {
    const s = fresh();
    assert.strictEqual(sim.upMax(cfg, id), Infinity, id);
    s.run.up[id] = 60;
    const cost = sim.costOf(s, cfg, id);
    assert.ok(cost, id + ': цена есть и на 60-м уровне');
    assert.ok(Big.eq(cost, Big.ceil(Big.mul(cfg['up.' + id + '.base'], Big.pow(cfg['up.' + id + '.growth'], 60)))), id + ': цена по росту');
    s.run.coins = Big.mul(cost, 0.99);
    assert.ok(!sim.buy(s, cfg, id), id + ': в долг не купить');
    s.run.coins = cost;
    assert.ok(sim.buy(s, cfg, id), id);
    assert.strictEqual(sim.lvl(s, id), 61);
  });
  const s = fresh();
  s.run.up.aquarium = 100;
  assert.strictEqual(sim.litres(s, cfg), cfg['aquarium.litres'] + 100 * cfg['aquarium.per'], 'литры растут без потолка');
  // The tackle tied to the geometry of the water and to chances keeps its levels.
  ['rod', 'hook', 'float'].forEach((id) => {
    s.run.up[id] = cfg['up.' + id + '.max'];
    assert.strictEqual(sim.costOf(s, cfg, id), null, id + ': предел');
  });
});

test('магазин и водоёмы: цена уровня по росту, порядок водоёмов, подлёдное после залива и сезона', () => {
  const s = fresh();
  s.run.coins = Big.of(1e9);
  const c0 = Big.toNumber(sim.costOf(s, cfg, 'rod'));
  assert.ok(sim.buy(s, cfg, 'rod'));
  near(Big.toNumber(sim.costOf(s, cfg, 'rod')), Math.ceil(cfg['up.rod.base'] * cfg['up.rod.growth']), 1e-9, 'второй уровень');
  assert.strictEqual(c0, Math.ceil(cfg['up.rod.base']));
  assert.ok(sim.buy(s, cfg, 'landing'));
  assert.strictEqual(sim.costOf(s, cfg, 'landing'), null, 'разовая покупка одна');
  assert.strictEqual(sim.waterLock(s, cfg, 'lake'), 'сначала «Река»');
  assert.ok(sim.openWater(s, cfg, 'river'));
  assert.ok(sim.setWater(s, 'river'));
  ['lake', 'swamp', 'creek', 'bay'].forEach((w) => assert.ok(sim.openWater(s, cfg, w), w));
  assert.ok(sim.firstSix(s));
  assert.ok(/сезона/.test(sim.waterLock(s, cfg, 'ice')), 'подлёдное — со второго сезона');
  assert.ok(!sim.buy(fresh(), cfg, 'sonar'), 'без денег не купить');
});

test('погода одна и та же для одного часа и водоёма, под землёй её нет', () => {
  const seen = {};
  for (let h = 0; h < 24 * 14; h++) {
    const t = NOW + h * 3600000;
    const w = sim.weatherAt('lake', t, cfg);
    assert.strictEqual(w, sim.weatherAt('lake', t, cfg));
    assert.strictEqual(w, sim.weatherAt('lake', t + 60000, cfg), 'в пределах часа');
    seen[w] = (seen[w] || 0) + 1;
  }
  assert.ok(Object.keys(seen).length >= 4, 'за две недели разная погода: ' + JSON.stringify(seen));
  assert.strictEqual(sim.weatherAt('cave', NOW, cfg), 'any');
});

test('легенда клюёт только в свои часы и погоду; фонарь не зовёт легенд', () => {
  const s = fresh();
  const leg = sim.waterSpecies(s, 'pond').find((sp) => sp.rarity === 'legend');
  assert.ok(leg, 'у пруда есть легенда');
  let inT = null;
  let outT = null;
  for (let h = 0; h < 24 * 30 && (inT === null || outT === null); h++) {
    const t = NOW + h * 3600000;
    const ok = leg.hours.indexOf(sim.periodAt(s, t, cfg)) >= 0 && sim.inWeather(leg, 'pond', t, cfg);
    if (ok && inT === null) inT = t;
    if (!ok && outT === null) outT = t;
  }
  assert.ok(sim.legendsNow(s, cfg, inT).some((sp) => sp.id === leg.id));
  assert.ok(!sim.legendsNow(s, cfg, outT).some((sp) => sp.id === leg.id));
  const n = sim.next(s, inT - 1, cfg);
  assert.ok(n.length === 1 && n[0].at === inT, 'уведомление о выходе легенды: ' + JSON.stringify(n));
});

test('события: жор ускоряет поклёвку, косяк — тот же вид три заброса, бутылка — подсказка', () => {
  const zhor = Object.assign({}, cfg, { 'events.perMin': 1e6, 'events.zhor': 1, 'events.shoal': 0, 'events.bottle': 0, 'events.fisher': 0 });
  const s = fresh();
  sim.tick(s, 0.05, { now: NOW, config: zhor, rng: Rng.make(1), mult: 1, links: {}, stock: {}, offline: false });
  assert.ok(s.run.zhorUntil > NOW, 'жор начался');
  assert.ok(s.run.news.some((n) => n.kind === 'zhor'));
  const slow = fresh();
  const fast = fresh();
  fast.run.zhorUntil = NOW + 3600000;
  sim.throwAt(slow, cfg, NOW, Rng.make(5), 0.5, false);
  sim.throwAt(fast, cfg, NOW, Rng.make(5), 0.5, false);
  near(fast.run.cast.bt, slow.run.cast.bt * cfg['zhor.wait'], 1e-9, 'ожидание при жоре');
  const shoal = Object.assign({}, cfg, { 'events.perMin': 1e6, 'events.zhor': 0, 'events.shoal': 1, 'events.bottle': 0, 'events.fisher': 0 });
  const t = fresh();
  t.run.lastSp = 'plotva';
  sim.tick(t, 0.05, { now: NOW, config: shoal, rng: Rng.make(1), mult: 1, links: {}, stock: {}, offline: false });
  assert.deepStrictEqual([t.run.shoal.sp, t.run.shoal.left], ['plotva', cfg['shoal.casts']]);
  const bottle = Object.assign({}, cfg, { 'events.perMin': 1e6, 'events.zhor': 0, 'events.shoal': 0, 'events.bottle': 1, 'events.fisher': 0 });
  const b = fresh();
  sim.tick(b, 0.05, { now: NOW, config: bottle, rng: Rng.make(1), mult: 1, links: {}, stock: {}, offline: false });
  assert.strictEqual(b.meta.hints.length, 1);
  assert.ok(/Пруд у дачи/.test(sim.hintText(b, cfg, b.meta.hints[0].sp)), sim.hintText(b, cfg, b.meta.hints[0].sp));
});

test('связки: зорька — утро на любом водоёме, ставка — жор на вечер, сундук — наживка', () => {
  const s = fresh();
  const night = Date.UTC(2026, 10, 3, 23, 30) + new Date().getTimezoneOffset() * 60000;
  assert.strictEqual(sim.periodAt(s, night, cfg), 'night');
  sim.dawn(s, cfg, night);
  assert.strictEqual(sim.periodAt(s, night + 60000, cfg), 'morning');
  near(s.run.dawnUntil - night, cfg['dawn.minutes'] * 60000, 0, 'длительность');
  const until = sim.zhorTonight(s, cfg, NOW);
  assert.ok(until >= NOW + cfg['bet.zhorMin'] * 60000 && s.run.zhorUntil === until);
  const c = sim.chest(s, Rng.make(1), cfg);
  assert.ok(c.items.length >= 1);
  assert.strictEqual(s.run.bait.gold, cfg['chest.gold']);
  assert.ok(!sim.setLantern(s, cfg, true), 'фонарь — с третьего сезона');
});

test('сохранение: бот за сутки без NaN, validate чист, круг через Core.pick тот же', () => {
  const rng = Rng.make(21);
  const s = fresh();
  let now = NOW;
  for (let sec = 0; sec < 6 * 3600; sec++) {
    sim.play(s, ctxOf(x, now, rng));
    for (let i = 0; i < 4; i++) sim.tick(s, 0.25, ctxOf(x, now, rng));
    now += 1000;
  }
  const json = JSON.stringify(s);
  assert.ok(!/NaN|Infinity/.test(json), 'NaN или бесконечность в сохранении');
  assert.strictEqual(sim.validate(s), null);
  assert.ok(s.run.caught > 100, 'бот поймал ' + s.run.caught);
  const back = Core.pick([{ json: json, seq: 1, source: 'test' }], game, sim).state;
  assert.strictEqual(JSON.stringify(back.run), JSON.stringify(s.run));
  assert.strictEqual(JSON.stringify(back.meta.journal), JSON.stringify(s.meta.journal));
  const broken = JSON.parse(json);
  broken.run.cast = { phase: 'жарим' };
  assert.ok(sim.validate(broken), 'чужая фаза заметна');
});

done('rules');
