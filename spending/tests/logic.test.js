// node tests/logic.test.js — repeats, holds, own transfers, the budget month, subscriptions, the review.
var assert = require('assert');
var dedupe = require('../logic/dedupe.js');
var budget = require('../logic/budget.js');
var subs = require('../logic/subs.js');
var review = require('../logic/review.js');
var parse = require('../logic/parse.js');
var rules = require('../logic/rules.js');
var awards = require('../logic/awards.js');
var settingsLib = require('../logic/settings.js');

var failed = 0;
var passed = 0;
function check(name, fn) {
  try {
    fn();
    passed++;
  } catch (error) {
    failed++;
    console.log('FAIL ' + name + '\n  ' + (error && error.stack ? error.stack.split('\n').slice(0, 3).join('\n  ') : error));
  }
}

var T0 = new Date(2026, 10, 14, 14, 5).getTime();
var MIN = 60000;

function op(fields) {
  var base = { id: Math.random(), at: T0, type: 'purchase', amount: 350, currency: 'RUB', amountBase: 350, card: null, merchant: null, sender: 'x', source: 'push', balance: null, bank: null };
  Object.keys(fields).forEach(function (k) { base[k] = fields[k]; });
  return base;
}

// ---- repeats --------------------------------------------------------------------------------
check('push, SMS and wallet of one purchase are one', function () {
  var sms = op({ id: 1, sender: '900', source: 'sms', card: '1234', merchant: 'PYATEROCHKA 1234', balance: 12345.67, bank: 'Сбербанк' });
  var push = op({ id: 2, at: T0 + 20000, sender: 'ru.sberbankmobile', card: '1234', merchant: 'Пятёрочка', balance: 12345.67, bank: 'Сбербанк' });
  var wallet = op({ id: 3, at: T0 + 5000, sender: 'com.samsung.android.spay', source: 'wallet', card: '1234' });
  assert.strictEqual(dedupe.duplicateOf(push, [sms], 10 * MIN), sms);
  assert.strictEqual(dedupe.duplicateOf(wallet, [sms], 10 * MIN), sms);
  assert.strictEqual(dedupe.primary(sms, wallet), sms);
  assert.strictEqual(dedupe.primary(wallet, sms), sms);
});
check('two coffees from one sender are two purchases', function () {
  var a = op({ id: 1, sender: 'com.idamob.tinkoff.android', merchant: 'Cofix', balance: 1000 });
  var b = op({ id: 2, at: T0 + 3 * MIN, sender: 'com.idamob.tinkoff.android', merchant: 'Cofix', balance: 650 });
  assert.strictEqual(dedupe.duplicateOf(b, [a], 10 * MIN), null);
  // The same text again (an updated notification) is one.
  var c = op({ id: 3, at: T0 + MIN, sender: 'com.idamob.tinkoff.android', merchant: 'Cofix', balance: 1000, rawHash: 'h' });
  var d = op({ id: 4, at: T0 + 2 * MIN, sender: 'com.idamob.tinkoff.android', merchant: 'Cofix', balance: 1000, rawHash: 'h' });
  assert.strictEqual(dedupe.duplicateOf(d, [c], 10 * MIN), c);
});
check('different shops, cards, amounts or times are not repeats', function () {
  var a = op({ id: 1, sender: '900', merchant: 'PYATEROCHKA', card: '1234' });
  assert.strictEqual(dedupe.duplicateOf(op({ id: 2, sender: 'push', merchant: 'MAGNIT', card: '1234' }), [a], 10 * MIN), null);
  assert.strictEqual(dedupe.duplicateOf(op({ id: 2, sender: 'push', merchant: 'Пятёрочка', card: '9999' }), [a], 10 * MIN), null);
  assert.strictEqual(dedupe.duplicateOf(op({ id: 2, sender: 'push', merchant: 'Пятёрочка', amount: 351 }), [a], 10 * MIN), null);
  assert.strictEqual(dedupe.duplicateOf(op({ id: 2, sender: 'push', merchant: 'Пятёрочка', at: T0 + 11 * MIN }), [a], 10 * MIN), null);
  assert.strictEqual(dedupe.duplicateOf(op({ id: 2, sender: 'push', type: 'refund', merchant: 'Пятёрочка' }), [a], 10 * MIN), null);
});
check('repeats from parsed samples', function () {
  var read = function (input) { return parse.parse(input, rules).tx; };
  var sms = read({ sender: '900', text: 'MIR-1234 14:05 Покупка 350р PYATEROCHKA 1234 Баланс: 12 345.67р' });
  var push = read({ sender: 'ru.sberbankmobile', title: 'СберБанк', text: 'Покупка 350 ₽ Пятёрочка, карта MIR ••1234. Баланс 12 345,67 ₽' });
  var wallet = read({ sender: 'com.samsung.android.spay', title: 'Samsung Wallet', text: 'Оплачено 350,00 ₽ · Карта Мир *1234' });
  sms.id = 1; sms.at = T0; sms.sender = '900'; sms.source = 'sms'; sms.amountBase = 350;
  push.id = 2; push.at = T0 + 3000; push.sender = 'ru.sberbankmobile'; push.source = 'push'; push.amountBase = 350;
  wallet.id = 3; wallet.at = T0 + 1000; wallet.sender = 'com.samsung.android.spay'; wallet.source = 'wallet'; wallet.amountBase = 350;
  assert.ok(dedupe.duplicateOf(push, [sms], 10 * MIN));
  assert.ok(dedupe.duplicateOf(wallet, [sms], 10 * MIN));
});
check('a hold and its final debit', function () {
  var hold = op({ id: 1, type: 'hold', amount: 1000, amountBase: 1000, merchant: 'AZS LUKOIL', card: '1234' });
  var final = op({ id: 2, at: T0 + 2 * 864e5, amount: 987, amountBase: 987, merchant: 'LUKOIL 77', card: '1234' });
  assert.strictEqual(dedupe.holdFor(final, [hold], 5, 5), hold);
  assert.strictEqual(dedupe.holdFor(op({ id: 3, at: T0 + 6 * 864e5, amount: 987, merchant: 'LUKOIL' }), [hold], 5, 5), null);
  assert.strictEqual(dedupe.holdFor(op({ id: 4, at: T0 + 864e5, amount: 900, merchant: 'LUKOIL' }), [hold], 5, 5), null);
  assert.strictEqual(dedupe.holdFor(op({ id: 5, at: T0 + 864e5, amount: 990, merchant: 'ROSNEFT' }), [hold], 5, 5), null);
});
check('a purchase abroad settled in rubles', function () {
  var abroad = op({ id: 1, amount: 12.99, currency: 'USD', amountBase: 1200, fx: 'cbr', merchant: 'NETFLIX.COM' });
  var rub = op({ id: 2, at: T0 + 864e5, amount: 1230, currency: 'RUB', merchant: 'NETFLIX COM' });
  assert.strictEqual(dedupe.settles(rub, [abroad], 5, 10, 'RUB'), abroad);
  assert.strictEqual(dedupe.settles(op({ id: 3, amount: 2000, merchant: 'NETFLIX' }), [abroad], 5, 10, 'RUB'), null);
});
check('a transfer between own accounts in two banks', function () {
  var out = op({ id: 1, type: 'transfer_out', amount: 10000, amountBase: 10000, bank: 'Сбербанк', sender: '900' });
  var inn = op({ id: 2, type: 'transfer_in', at: T0 + 2 * MIN, amount: 10000, amountBase: 10000, bank: 'Т-Банк', sender: 'com.idamob.tinkoff.android' });
  assert.strictEqual(dedupe.internalPair(inn, [out], 10 * MIN), out);
  assert.strictEqual(dedupe.internalPair(out, [inn], 10 * MIN), inn);
  assert.strictEqual(dedupe.internalPair(op({ id: 3, type: 'transfer_in', at: T0 + 20 * MIN, amount: 10000 }), [out], 10 * MIN), null);
  assert.strictEqual(dedupe.internalPair(op({ id: 4, type: 'purchase', amount: 10000 }), [out], 10 * MIN), null);
});

// ---- the budget month -----------------------------------------------------------------------
check('budget month from the 1st and from the salary day', function () {
  var p = budget.periodOf(new Date(2026, 10, 14).getTime(), 1);
  assert.strictEqual(p.key, '2026-11');
  assert.strictEqual(p.label, 'Ноябрь');
  assert.strictEqual(p.days, 30);
  assert.strictEqual(new Date(p.start).getDate(), 1);
  var s = budget.periodOf(new Date(2026, 10, 14).getTime(), 25);
  assert.strictEqual(new Date(s.start).getMonth(), 9);
  assert.strictEqual(new Date(s.start).getDate(), 25);
  assert.strictEqual(new Date(s.end).getMonth(), 10);
  var feb = budget.periodOf(new Date(2027, 1, 28).getTime(), 31);
  assert.strictEqual(new Date(feb.start).getDate(), 28);
  var prev = budget.previous(p, 1);
  assert.strictEqual(prev.key, '2026-10');
  assert.strictEqual(budget.periodOf(new Date(2026, 0, 5).getTime(), 10).key, '2025-12');
});
check('what counts as spending', function () {
  assert.strictEqual(budget.counted(op({ amountBase: 100 })), 100);
  assert.strictEqual(budget.counted(op({ type: 'refund', amountBase: 100 })), -100);
  assert.strictEqual(budget.counted(op({ type: 'transfer_out', amountBase: 100 })), 100);
  assert.strictEqual(budget.counted(op({ type: 'transfer_out', amountBase: 100 }), { transfersInBudget: false }), 0);
  assert.strictEqual(budget.counted(op({ type: 'declined' })), 0);
  assert.strictEqual(budget.counted(op({ dupOf: 5 })), 0);
  assert.strictEqual(budget.counted(op({ internal: 1 })), 0);
  assert.strictEqual(budget.counted(op({ excluded: 1 })), 0);
  assert.strictEqual(budget.counted(op({ type: 'income' })), 0);
  assert.strictEqual(budget.counted(op({ amountBase: null })), 0);
});
check('summary: spent, left, per day, categories, days', function () {
  var p = budget.periodOf(new Date(2026, 10, 14).getTime(), 1);
  var txs = [
    op({ at: new Date(2026, 10, 2, 12).getTime(), amountBase: 30000, category: 'Дом' }),
    op({ at: new Date(2026, 10, 10, 9).getTime(), amountBase: 11200, category: 'Продукты' }),
    op({ at: new Date(2026, 10, 10, 19).getTime(), type: 'refund', amountBase: 200, category: 'Продукты' }),
    op({ at: new Date(2026, 9, 30, 19).getTime(), amountBase: 5000, category: 'Продукты' }),
    op({ at: new Date(2026, 10, 11).getTime(), type: 'income', amountBase: 85000 })
  ];
  var now = new Date(2026, 10, 21, 20).getTime();
  var s = budget.summary(txs, { period: p, budget: 60000, now: now, limits: { 'Продукты': 10000 } });
  assert.strictEqual(s.spent, 41000);
  assert.strictEqual(s.left, 19000);
  assert.strictEqual(s.daysLeft, 10);
  assert.strictEqual(s.perDay, 1900);
  assert.strictEqual(Math.round(s.pct), 68);
  assert.strictEqual(s.byCategory[0].name, 'Дом');
  assert.strictEqual(s.byCategory[1].sum, 11000);
  assert.strictEqual(Math.round(s.byCategory[1].pct), 110);
  assert.strictEqual(s.byDay[9], 11000);
  assert.strictEqual(s.byDay.length, 30);
  assert.strictEqual(budget.summary(txs, { period: p, budget: null, now: now }).perDay, null);
});
check('thresholds are told once', function () {
  assert.deepStrictEqual(budget.crossed(85, [80, 100], []), [80]);
  assert.deepStrictEqual(budget.crossed(85, [80, 100], [80]), []);
  assert.deepStrictEqual(budget.crossed(120, [100, 80], []), [80, 100]);
  assert.deepStrictEqual(budget.crossed(null, [80], []), []);
});
check('an unusual purchase', function () {
  var history = [700, 800, 900, 1000, 1200, 650];
  assert.ok(budget.unusual(8450, history, 3, 5).unusual);
  assert.ok(!budget.unusual(1500, history, 3, 5).unusual);
  assert.ok(!budget.unusual(8450, [700, 800], 3, 5).unusual);
  assert.strictEqual(budget.median([3, 1, 2]), 2);
  assert.strictEqual(budget.median([4, 1, 2, 3]), 2.5);
});
check('the allowance of a day for neighbours', function () {
  var p = budget.periodOf(new Date(2026, 10, 14).getTime(), 1);
  var txs = [op({ at: new Date(2026, 10, 5).getTime(), amountBase: 16000 }), op({ at: new Date(2026, 10, 11, 13).getTime(), amountBase: 700 })];
  var day = budget.dayAllowance(txs, p, 60000, new Date(2026, 10, 11, 23).getTime());
  assert.strictEqual(day.date, '2026-11-11');
  assert.strictEqual(day.allowance, 2200);
  assert.strictEqual(day.spent, 700);
  assert.strictEqual(day.ok, true);
  assert.strictEqual(budget.dayAllowance(txs, p, null, T0).ok, null);
});

// ---- subscriptions ----------------------------------------------------------------------------
function monthly(day, months, amount, key) {
  var out = [];
  for (var i = 0; i < months; i++) {
    out.push(op({ id: key + i, at: new Date(2026, 4 + i, day, 3).getTime(), amount: amount, amountBase: amount, merchant: key, name: key }));
  }
  return out;
}
check('a monthly subscription is found and its next date counted', function () {
  var txs = monthly(17, 6, 399, 'KINOPOISK').concat([op({ id: 'x', at: new Date(2026, 6, 3).getTime(), merchant: 'PYATEROCHKA', amount: 350 })]);
  txs[2].at = new Date(2026, 6, 19, 3).getTime(); // a day or two late is still the same day
  var found = subs.detect(txs, { minCount: 3, dayTol: 3, amountTolPct: 15, now: new Date(2026, 10, 1).getTime() });
  assert.strictEqual(found.length, 1);
  assert.strictEqual(found[0].period, 'month');
  assert.strictEqual(found[0].count, 6);
  assert.strictEqual(found[0].amount, 399);
  assert.strictEqual(new Date(found[0].next).getMonth(), 10);
  assert.strictEqual(new Date(found[0].next).getDate(), 17);
  assert.strictEqual(found[0].yearly, 4788);
});
check('weekly and yearly subscriptions; noise is not one', function () {
  var week = [];
  for (var i = 0; i < 4; i++) week.push(op({ id: 'w' + i, at: T0 + i * 7 * 864e5, amount: 149, amountBase: 149, merchant: 'BOOSTY' }));
  var found = subs.detect(week, { minCount: 3, dayTol: 3, amountTolPct: 15, now: T0 });
  assert.strictEqual(found[0].period, 'week');
  // The spec: the day may move by ±3 for a weekly charge too (the setting subDayTol).
  var late = [0, 9, 14, 19].map(function (d, i) { return op({ id: 'l' + i, at: T0 + d * 864e5, amount: 149, amountBase: 149, merchant: 'BOOSTY' }); });
  assert.strictEqual(subs.detect(late, { minCount: 3, dayTol: 3, amountTolPct: 15, now: T0 })[0].period, 'week');
  assert.strictEqual(subs.detect(late, { minCount: 4, dayTol: 1, amountTolPct: 15, now: T0 }).length, 0);
  assert.ok(subs.fits(T0, T0 + 10 * 864e5, 'week', 3));
  assert.ok(!subs.fits(T0, T0 + 11 * 864e5, 'week', 3));
  var year = [0, 1, 2].map(function (i) { return op({ id: 'y' + i, at: new Date(2024 + i, 2, 5).getTime(), amount: 2990, amountBase: 2990, merchant: 'KASPERSKY' }); });
  assert.strictEqual(subs.detect(year, { minCount: 3, dayTol: 3, amountTolPct: 15 })[0].period, 'year');
  var random = [3, 11, 29, 47, 52].map(function (d, i) { return op({ id: 'r' + i, at: T0 + d * 864e5, amount: 350 + i * 40, merchant: 'PYATEROCHKA' }); });
  assert.strictEqual(subs.detect(random, { minCount: 3, dayTol: 3, amountTolPct: 15 }).length, 0);
  var drifting = monthly(10, 4, 399, 'OKKO');
  drifting[3].amount = drifting[3].amountBase = 799;
  assert.strictEqual(subs.detect(drifting, { minCount: 4, dayTol: 3, amountTolPct: 15 }).length, 0);
});
check('a coffee every working day is not a monthly subscription', function () {
  var coffee = [];
  for (var d = 0; d < 120; d++) {
    var day = new Date(T0 + d * 864e5);
    if (day.getDay() === 0 || day.getDay() === 6) continue;
    coffee.push(op({ id: 'c' + d, at: day.getTime(), amount: 250 + (d % 3) * 10, amountBase: 250 + (d % 3) * 10, merchant: 'COFFEE LIKE' }));
  }
  assert.strictEqual(subs.detect(coffee, { minCount: 3, dayTol: 3, amountTolPct: 15, now: T0 + 120 * 864e5 }).length, 0);
  // A subscription among a few other purchases at the same place (Google Play: apps and YouTube) stays one.
  var play = monthly(5, 5, 299, 'GOOGLE *YouTube').concat([
    op({ id: 'g1', at: new Date(2026, 7, 20).getTime(), amount: 99, amountBase: 99, merchant: 'GOOGLE *YouTube' })
  ]);
  assert.strictEqual(subs.detect(play, { minCount: 3, dayTol: 3, amountTolPct: 15, now: new Date(2026, 10, 1).getTime() }).length, 1);
});
check('short months keep the day: 31st → 30th → 31st', function () {
  assert.strictEqual(new Date(subs.addMonths(new Date(2026, 0, 31).getTime(), 1)).getDate(), 28);
  assert.strictEqual(new Date(subs.nextDate(new Date(2026, 1, 28).getTime(), 'month', 31)).getDate(), 31);
  assert.ok(subs.fits(new Date(2026, 0, 31).getTime(), new Date(2026, 1, 28).getTime(), 'month', 3));
});
check('a trial for 1 ruble at a new shop', function () {
  var txs = [op({ id: 1, at: T0, amount: 1, amountBase: 1, merchant: 'IVI' }), op({ id: 2, at: T0 + 864e5, amount: 1, amountBase: 1, merchant: 'PYATEROCHKA' }), op({ id: 3, at: T0 - 864e5, amount: 300, merchant: 'PYATEROCHKA' })];
  var found = subs.trials(txs, 7);
  assert.strictEqual(found.length, 1);
  assert.strictEqual(found[0].key, 'IVI');
  assert.strictEqual(found[0].endsAt, T0 + 7 * 864e5);
});
check('reminders come once, days before', function () {
  var sub = { remind: 1, confirmed: 1, next: new Date(2026, 10, 17, 3).getTime() };
  assert.ok(subs.dueReminder(sub, new Date(2026, 10, 15, 10).getTime(), 2));
  assert.ok(!subs.dueReminder(sub, new Date(2026, 10, 14, 10).getTime(), 2));
  sub.remindedFor = sub.next;
  assert.ok(!subs.dueReminder(sub, new Date(2026, 10, 15, 10).getTime(), 2));
  assert.ok(!subs.dueReminder({ remind: 1, confirmed: null, next: sub.next }, new Date(2026, 10, 16).getTime(), 2));
});

// ---- review and sleep ---------------------------------------------------------------------------
check('the month against three before it', function () {
  var cur = budget.periodOf(new Date(2026, 9, 15).getTime(), 1);
  var prev = [budget.previous(cur, 1)];
  prev.push(budget.previous(prev[0], 1));
  prev.push(budget.previous(prev[1], 1));
  var txs = [];
  prev.forEach(function (p) {
    txs.push(op({ at: p.start + 864e5, amountBase: 7000, category: 'Кафе и рестораны' }));
    txs.push(op({ at: p.start + 2 * 864e5, amountBase: 20000, category: 'Продукты' }));
  });
  txs.push(op({ at: cur.start + 864e5, amountBase: 9800, category: 'Кафе и рестораны', name: 'Тануки' }));
  txs.push(op({ at: cur.start + 3 * 864e5, amountBase: 19000, category: 'Продукты', name: 'Пятёрочка' }));
  var aggr = review.aggregates(txs, { current: cur, previous: prev }, { budget: 60000 });
  assert.strictEqual(aggr.total, 28800);
  assert.strictEqual(aggr.avgTotal, 27000);
  var cafe = aggr.categories.filter(function (c) { return c.name === 'Кафе и рестораны'; })[0];
  assert.strictEqual(cafe.diffPct, 40);
  assert.strictEqual(aggr.top[0].name, 'Пятёрочка');
  var lines = review.sentences(aggr);
  assert.ok(lines.length >= 3 && lines.length <= 6);
  assert.ok(lines.join(' ').indexOf('Кафе и рестораны — 9 800 ₽, на 40% больше обычного') >= 0, lines.join(' | '));
  assert.ok(review.prompt(aggr).indexOf('без советов') > 0);
  assert.deepStrictEqual(review.checkLines({ lines: ['a', 7, ' b '] }), ['a', 'b']);
  assert.strictEqual(review.checkLines({ x: 1 }), null);
});
check('short nights and delivery: spoken only with enough days and a clear difference', function () {
  var days = [];
  for (var i = 0; i < 10; i++) days.push({ date: 'a' + i, sleepMin: 300, delivery: i < 7 ? 1 : 0, deliverySum: i < 7 ? 900 : 0 });
  for (var j = 0; j < 12; j++) days.push({ date: 'b' + j, sleepMin: 450, delivery: j < 2 ? 1 : 0, deliverySum: j < 2 ? 700 : 0 });
  var link = review.sleepLink(days, { thresholdMin: 360, minDays: 8, ratio: 1.5 });
  assert.ok(link);
  assert.strictEqual(link.text, 'Доставка еды — в 7 из 10 дней после сна меньше 6 ч; после остальных ночей — в 2 из 12.');
  assert.strictEqual(review.sleepLink(days.slice(0, 15), { thresholdMin: 360, minDays: 8, ratio: 1.5 }), null);
  var even = days.map(function (d, k) { return { date: d.date, sleepMin: d.sleepMin, delivery: k % 2, deliverySum: k % 2 ? 800 : 0 }; });
  assert.strictEqual(review.sleepLink(even, { thresholdMin: 360, minDays: 8, ratio: 1.5 }), null);
});

check('«Неделя без доставки» and «Месяц в бюджете»: the conditions and their settings', function () {
  var DAY = 864e5;
  var s = settingsLib.normalize({});
  assert.strictEqual(s.noDeliveryDays, 7);
  assert.strictEqual(s.noDeliveryBeforeDays, 30);
  assert.strictEqual(settingsLib.normalize({ noDeliveryDays: 1 }).noDeliveryDays, 3);
  var opts = { now: T0, days: 7, beforeDays: 30, first: T0 - 60 * DAY, settings: s };
  var txs = [op({ at: T0 - 20 * DAY, category: 'Доставка еды' }), op({ at: T0 - 2 * DAY, category: 'Продукты' })];
  assert.strictEqual(awards.noDelivery(txs, opts).ok, true);
  assert.strictEqual(awards.noDelivery(txs.concat([op({ at: T0 - DAY, category: 'Доставка еды' })]), opts).ok, false, 'a delivery this week');
  assert.strictEqual(awards.noDelivery(txs.concat([op({ at: T0 - DAY, category: 'Доставка еды', excluded: 1 })]), opts).ok, true, '«not a spending» does not count');
  assert.strictEqual(awards.noDelivery([txs[1]], opts).ok, false, 'no delivery before: not a habit');
  assert.strictEqual(awards.noDelivery([txs[0]], opts).ok, false, 'nothing seen this week');
  assert.strictEqual(awards.noDelivery(txs, Object.assign({}, opts, { first: T0 - 10 * DAY })).ok, false, 'history too short');
  var period = { start: T0 - 30 * DAY, end: T0 };
  assert.strictEqual(awards.monthInBudget({ spent: 40000, budget: 50000, count: 30 }, period, period.start), true);
  assert.strictEqual(awards.monthInBudget({ spent: 50001, budget: 50000, count: 30 }, period, period.start), false);
  assert.strictEqual(awards.monthInBudget({ spent: 100, budget: null, count: 3 }, period, period.start), false, 'no budget');
  assert.strictEqual(awards.monthInBudget({ spent: 100, budget: 50000, count: 3 }, period, period.start + 5 * DAY), false, 'not seen from its start');
});

console.log('logic: ' + passed + ' passed, ' + failed + ' failed');
if (failed) process.exit(1);
