// The logic of «Библиотека» against its spec (docs/games/library.md, «Темп» and «Как проверить»),
// in a node workspace of the Axiko harness. Prints the numbers of the pace.  node tests/library.test.js
'use strict';
const assert = require('assert');
const { H, open, ctx } = require('./env');

const w = open();
const { Core, Big, Rng, sim, game, cfg } = w.x;
const MIN = 60000;
const HOUR = 3600000;
const TRIP_SEC = 25 * 60;

function C(now, extra) { return ctx(w.x, now, Rng.make(5), extra); }
function fresh(now) { return Core.newState(game, sim, C(now)); }
function finite(x) { return typeof x === 'number' && isFinite(x); }

/** The play of checks.js: the bot knows what is left of the 25-minute trip. */
const seen = { state: null, at: 0, from: 0 };
function play(state, c) {
  if (seen.state !== state || c.now - seen.at > 5000 || c.now < seen.at) seen.from = c.now;
  seen.state = state;
  seen.at = c.now;
  return sim.bot(state, c, { tripLeftSec: TRIP_SEC - (c.now - seen.from) / 1000 });
}

H.test('темп первого часа: первая покупка, виды по минутам, столы, залы, ветви', () => {
  let now = Date.UTC(2026, 10, 2, 5, 0, 0);
  const s = fresh(now);
  const kindAt = {};
  let firstBuy = null;
  let firstRead = null;
  let desks3 = null;
  const marks = {};
  const T = 60 * 60;
  for (let sec = 0; sec < T; sec++) {
    const bought = sim.bot(s, C(now), { tripLeftSec: T - sec });
    if (firstBuy === null && bought) firstBuy = sec + 1;
    sim.tick(s, 1, C(now + 1000));
    now += 1000;
    for (let k = 0; k < 8; k++) if (kindAt[k + 1] === undefined && sim.ownKind(s, k) > 0) kindAt[k + 1] = Math.round(sec / 6) / 10;
    if (firstRead === null && s.run.readTotal > 0) firstRead = sec + 1;
    if (desks3 === null && s.run.desks.length >= 3) desks3 = Math.round(sec / 6) / 10;
    if ((sec + 1) % (5 * 60) === 0) marks[(sec + 1) / 60] = { rate: Big.toNumber(sim.income(s, cfg, now, null)), kinds: [0, 1, 2, 3, 4, 5, 6, 7].filter((k) => sim.ownKind(s, k) > 0).length };
  }
  console.log('  первая покупка на ' + firstBuy + ' с, первая книга дочитана на ' + firstRead + ' с');
  console.log('  виды (минута первой поставки): ' + JSON.stringify(kindAt));
  console.log('  3 стола на ' + desks3 + ' мин; залы через час: ' + s.run.halls.join(', ') + '; уровни ветвей: ' + s.run.levels.join('/'));
  console.log('  доход: ' + [5, 15, 30, 45, 60].map((m) => m + ' мин — ' + marks[m].rate.toExponential(2) + '/с').join(', '));
  assert.ok(firstBuy <= 10, 'первая покупка ' + firstBuy);
  assert.ok(firstRead <= 150, 'первая книга ' + firstRead + ' с (2 минуты чтения)');
  assert.ok(marks[5].kinds >= 3, 'к 5-й минуте видов ' + marks[5].kinds);
  assert.ok(kindAt[8] >= 30 && kindAt[8] <= 40, '8-й вид на ' + kindAt[8] + ' мин (по описанию 30–40)');
  assert.ok(desks3 !== null && desks3 <= 60, '3 стола к часу');
  assert.ok(s.run.halls.indexOf('children') >= 0 && s.run.halls.indexOf('periodicals') >= 0, 'Детский зал и Зал периодики к часу');
  assert.ok(s.run.levels.some((l) => l > 0), 'ни одного уровня ветвей за час');
});

let day = null;
H.test('знания к концу суток 1 500–3 000 (±10 %), первый переезд в поездках 4–6, Абонемент к утру второго дня', () => {
  const one = w.kit.bot(game, sim, cfg, { days: 1, play: (s, c) => play(s, c) });
  const kn = Math.round(one.state.run.knEarned);
  day = one.state;
  // The trips of the three days as the play sees them (a gap of the clock starts the next one).
  let trip = 0;
  let last = 0;
  let lendingTrip = null;
  const three = w.kit.bot(game, sim, cfg, {
    days: 3, play: (s, c) => {
      if (c.now - last > 5000) trip++;
      last = c.now;
      if (lendingTrip === null && s.run.halls.indexOf('lending') >= 0) lendingTrip = trip;
      return play(s, c);
    }
  });
  const first = three.prestiges[0];
  console.log('  знаний к концу первых суток (2 поездки по 25 мин и ночь): ' + kn + '; прочитано книг ' + one.state.run.readTotal +
    '; уникальных томов ' + one.state.run.tomes.length + '; залы: ' + one.state.run.halls.join(', '));
  console.log('  Абонемент с Библиотекарем — в поездке ' + lendingTrip + '; переезды за 3 дня: ' +
    three.prestiges.map((p) => 'поездка ' + p.trip + ' (+' + Big.toNumber(p.gain) + ' экслибр.)').join(', '));
  assert.ok(kn >= 1350 && kn <= 3300, 'знаний за сутки ' + kn);
  assert.ok(first && first.trip >= 4 && first.trip <= 6, 'первый переезд в поездке ' + (first && first.trip));
  assert.ok(one.state.run.tomes.length >= 1, 'за сутки ни одного уникального тома');
  assert.ok(lendingTrip !== null && lendingTrip <= 3, 'Абонемент в поездке ' + lendingTrip);
});

H.test('чтение: таймеры видов, скорость, поездка ×1.5, «читать на ходу» −20 мин', () => {
  const now = Date.UTC(2026, 10, 2, 5, 0, 0);
  const s = fresh(now);
  const mins = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => sim.readTime(s, cfg, k, now) / 60);
  console.log('  минуты чтения видов 1–8 со скоростью ×1: ' + mins.join(', '));
  assert.deepStrictEqual(mins, [2, 4, 8, 16, 32, 64, 128, 256]);
  s.run.upgrades = { lamp: 1, glasses: 1, silence: 1 };
  const eight = sim.readTime(s, cfg, 7, now);
  console.log('  вид 8 с тремя узлами: ' + Math.floor(eight / 3600) + ' ч ' + Math.floor((eight % 3600) / 60) + ' мин');
  assert.strictEqual(Math.floor(eight / 60), 131);
  const trip = sim.speed(s, cfg, now, { links: { passenger: { state: 'trip' } } }) / sim.speed(s, cfg, now, null);
  assert.ok(Math.abs(trip - 1.5) < 1e-9, 'чтение в поездке ×' + trip);
  s.run.upgrades = {};
  for (let k = 0; k < 4; k++) s.run.own[sim.group(k + 4, 0)] += 1;
  s.run.desks = [null, null, null, null];
  for (let d = 0; d < 4; d++) sim.placeKind(s, cfg, d, d + 4);
  sim.readAhead(s, cfg, cfg['onthego.minutes'], now);
  assert.ok(s.run.desks.every((d) => d && Math.abs(d.p - cfg['onthego.minutes'] * 60) < 1e-6), 'у всех столов −20 минут');
  assert.strictEqual(sim.roadKind(s, cfg, 25, now), -1, 'книга на дорогу без непрочитанных книг');
  s.run.own[sim.group(1, 0)] += 1;
  s.run.own[sim.group(4, 0)] += 1;
  assert.strictEqual(sim.roadKind(s, cfg, 15, now), 1, 'на 15 мин поездки (×1.5) — Романы, Альбомы не успеть');
  assert.strictEqual(sim.roadKind(s, cfg, 25, now), 4, 'на 25 мин поездки — Альбомы (32 мин / 1.5)');
  // The trip's length: the median of the recent trips of «Пассажир», road.tripMin until there are enough.
  assert.strictEqual(sim.usualTripMin(cfg, []), cfg['road.tripMin']);
  assert.strictEqual(sim.usualTripMin(cfg, [{ min: 14 }, { min: 2 }, { min: 16 }]), cfg['road.tripMin'], 'двух настоящих поездок мало');
  assert.strictEqual(sim.usualTripMin(cfg, [{ min: 14 }, { min: 2 }, { min: 16 }, { min: 15 }]), 15);
  assert.strictEqual(sim.usualTripMin(cfg, [{ min: 40 }, { min: 50 }, { min: 44 }, { min: 46 }]), 45);
  assert.strictEqual(sim.roadMinutes(cfg, 15, 0), 15);
  assert.strictEqual(sim.roadMinutes(cfg, 15, 6), 9, 'шесть минут уже в пути');
  assert.strictEqual(sim.roadMinutes(cfg, 15, 30), cfg['road.minLeftMin']);
  assert.strictEqual(sim.roadKind(s, cfg, sim.usualTripMin(cfg, [{ min: 14 }, { min: 15 }, { min: 16 }]), now), 1, 'на обычные 15 мин — Романы');
});

H.test('офлайн 8 ч с 4 столами и Библиотекарем: сколько уложилось по таймерам, ни одной книги дважды', () => {
  const now = Date.UTC(2026, 10, 3, 22, 0, 0);
  const s = fresh(now);
  const r = s.run;
  r.desks = [null, null, null, null];
  r.halls.push('lending');
  const own = [30, 20, 12, 6];
  own.forEach((n, k) => { for (let i = 0; i < n; i++) r.own[sim.group(k, i % 6)] += 1; });
  for (let d = 0; d < 4; d++) sim.placeKind(s, cfg, d, 3 - d);
  // The same by hand: every desk reads its book, the librarian puts the shortest unread one.
  const left = own.slice();
  const desks = [3, 2, 1, 0].map((k) => { left[k] -= 1; return { k, end: sim.work(cfg, k) }; });
  let expected = 0;
  for (;;) {
    let i = 0;
    for (let j = 1; j < desks.length; j++) if (desks[j] && (!desks[i] || desks[j].end < desks[i].end)) i = j;
    const x = desks[i];
    if (!x || x.end > 8 * 3600) break;
    expected++;
    const k = left.findIndex((n) => n > 0);
    if (k < 0) desks[i] = null;
    else {
      left[k] -= 1;
      desks[i] = { k, end: x.end + sim.work(cfg, k) };
    }
  }
  s.lastTick = now;
  const p = Core.plan(now, now + 8 * HOUR, cfg, 0);
  Core.runOffline(sim, s, game, p, null, (seg) => C(seg.to, { offline: true }), cfg);
  const ids = {};
  for (const e of s.meta.catalog) {
    assert.ok(!ids[e.id], 'книга ' + e.id + ' прочитана дважды');
    ids[e.id] = 1;
  }
  for (let gi = 0; gi < r.own.length; gi++) assert.ok(r.rd[gi] <= r.own[gi], 'группа ' + gi);
  const a = r.away;
  console.log('  офлайн 8 ч: прочитано ' + r.readTotal + ' книг (по таймерам ' + expected + '), знаний ' + Math.round(r.knEarned) +
    '; в сводке: ' + (a ? a.books + ' книг, названия ' + a.titles.length : 'нет'));
  assert.strictEqual(r.readTotal, expected, 'прочитано не по таймерам');
  assert.strictEqual(a && a.books, expected, 'сводка не о том');
});

H.test('аннотации: запас, шаблон при пустом запасе, модель дописывает лежащим книгам', () => {
  const now = Date.UTC(2026, 10, 2, 5, 0, 0);
  const s = fresh(now);
  s.run.own[sim.group(0, 2)] += 3;
  sim.placeKind(s, cfg, 0, 0);
  const d = s.run.desks[0];
  assert.ok(d.tpl === 1 && d.t && d.a && d.x.length > 30, 'у книги без сети нет шаблонного описания');
  assert.strictEqual(sim.annotate(s, sim.procedural('annotations', Rng.make(2))), '', 'шаблон не заменяет шаблон');
  assert.strictEqual(sim.annotate(s, { title: 'Сад камней', author: 'Т. Л.', branch: 'Естествознание', kind: 1, text: 'Одно. Два.' }), '', 'чужая ветвь заменила аннотацию');
  const item = { title: 'Письма с маяка', author: 'Н. Ясенева', branch: 'Словесность', kind: 1, text: 'Смотритель пишет сестре. Письма приходят раз в месяц.' };
  assert.strictEqual(sim.validateStock('annotations', item), null);
  assert.strictEqual(sim.annotate(s, item), 'desk');
  assert.ok(s.run.desks[0].t === item.title && !s.run.desks[0].tpl, 'аннотация не встала на стол');
  sim.readStep(s, cfg, 200, now + 200000, null, 1);
  assert.strictEqual(s.meta.catalog[0].t, item.title, 'в каталоге прочитанного не та аннотация');
  sim.placeKind(s, cfg, 0, 0);
  sim.readStep(s, cfg, 200, now + 400000, null, 1);
  assert.ok(s.meta.catalog[0].tpl, 'вторая книга без сети — с шаблоном');
  assert.deepStrictEqual(sim.waiting(s), [0, 0, 1, 0, 0, 0]);
  assert.strictEqual(sim.annotate(s, Object.assign({}, item, { title: 'Ночной словарь' })), 'catalog', 'прочитанной книге не дописана аннотация');
  assert.deepStrictEqual(sim.waiting(s), [0, 0, 0, 0, 0, 0]);
});

H.test('без потолков: Лампа, Очки, Тишина и места совета растут в цене, разовые места остаются разовыми', () => {
  const now = Date.UTC(2026, 10, 2, 5, 0, 0);
  const s = fresh(now);
  const base = sim.speed(s, cfg, now, null);
  const first = sim.upgradeCost(s, cfg, 'lamp');
  s.run.coins = Big.str(Big.mul(first, 1e30));
  for (let i = 0; i < 3; i++) assert.ok(sim.buyUpgrade(s, cfg, 'lamp'), 'уровень Лампы ' + (i + 1));
  assert.strictEqual(sim.upgradeLevel(s, 'lamp'), 3);
  assert.ok(Math.abs(sim.speed(s, cfg, now, null) / base - Math.pow(cfg['upgrade.mult'], 3)) < 1e-9, 'три уровня — три множителя');
  assert.ok(Big.eq(sim.upgradeCost(s, cfg, 'lamp'), Big.mul(first, Big.pow(cfg['upgrade.growth'], 3))), 'цена растёт в upgrade.growth за уровень');
  s.run.coins = '0';
  assert.ok(!sim.buyUpgrade(s, cfg, 'lamp'), 'без монет уровень не берётся');

  s.layers[sim.LAYER].currency = Big.str(Big.of(1e12));
  ['read', 'unique', 'coins'].forEach((id) => {
    assert.ok(sim.councilEndless(cfg, id), id + ' без предела');
    let last = Big.of(0);
    for (let i = 0; i < 12; i++) {
      const cost = sim.councilCost(s, cfg, id);
      assert.ok(Big.gt(cost, last), id + ': цена растёт');
      last = cost;
      assert.ok(sim.buyCouncil(s, cfg, id), id + ' уровень ' + (i + 1));
    }
    assert.strictEqual(sim.council(s, id), 12);
  });
  ['librarian', 'memory', 'catalog'].forEach((id) => {
    assert.ok(!sim.councilEndless(cfg, id));
    assert.ok(sim.buyCouncil(s, cfg, id));
    assert.ok(!sim.buyCouncil(s, cfg, id), id + ' берётся один раз');
  });
  while (sim.buyCouncil(s, cfg, 'vault')) { /* all the cells */ }
  assert.strictEqual(sim.vaultSlots(s, cfg), sim.TOMES.length, 'ячеек хватает на всю коллекцию');
  s.meta.reputation = 0;
  const moved = Core.clone ? Core.clone(s) : JSON.parse(JSON.stringify(s));
  assert.ok(finite(sim.speed(moved, cfg, now, null)));
});

H.test('трое суток игры: числа конечны, состояние проходит validate', () => {
  const three = w.kit.bot(game, sim, cfg, { days: 3, play: (s, c) => play(s, c) });
  const s = three.state;
  assert.strictEqual(sim.validate(s), null);
  const det = sim.incomeNumber(s, cfg, Date.now(), null, true);
  assert.ok(finite(det.total) && det.byKind.every(finite), 'доход не число');
  assert.ok(s.run.kn.every(finite) && finite(s.run.knEarned), 'знания не число');
  assert.ok(Big.valid(s.run.coins), 'монеты');
  assert.ok(sim.speed(s, cfg, Date.now(), null) > 0);
  console.log('  через 3 дня: здание ' + sim.building(s) + ', прочитано всего ' + s.meta.totalRead + ', томов в коллекции ' + s.meta.collection.length +
    ', доход ' + Big.toNumber(sim.income(s, cfg, Date.now(), null)).toExponential(2) + '/с');
  assert.ok(day && day.run.readTotal > 0);
});

H.done(w.id + ': логика и темп');
