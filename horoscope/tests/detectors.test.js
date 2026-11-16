// node tests/detectors.test.js — every detector on made-up days, the checks of each kind, pauses.
var assert = require('assert');
var det = require('../detectors.js');
var dates = require('../dates.js');

var passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
  } catch (error) {
    console.error('FAIL ' + name + '\n' + (error.stack || error));
    process.exitCode = 1;
  }
}

var goals = { steps: 8000, sleep: 450, bedtime: '00:00', dayEndHour: 5 };
var TODAY = '2026-11-19';   // a Thursday
function at(date, hh, mm) { var d = dates.parse(date); d.setHours(hh, mm || 0); return d.getTime(); }

/** 56 quiet days before TODAY: everything known, nothing special. */
function history(change) {
  var out = [];
  for (var i = 56; i >= 1; i--) {
    var date = dates.add(TODAY, -i);
    var day = {
      date: date, paused: null, known: { sleep: true, steps: true, screen: true, places: true, spend: true },
      steps: 5000, stepsGoal: 8000, sleepMin: 450, sleepGoal: 450, bedtime: '23:50', wake: '07:40',
      lateMin: 0, socialMin: 40, screenMin: 150, places: [], newPlaces: 0, homeOnly: false, noSpend: false, deliveryLate: 0,
      habitIds: [], chains: {}
    };
    if (change) change(day, dates.weekday(date));
    out.push(day);
  }
  return out;
}

test('delivery on 4 Thursdays in a row gives exactly that prediction', function () {
  var days = history(function (d, wd) { if (wd === 4 && dates.diff(TODAY, d.date) <= 28) d.deliveryLate = 1; });
  var got = det.candidates({ date: TODAY, days: days, goals: goals, settings: {} });
  assert.deepStrictEqual(got.map(function (p) { return p.id; }), ['weekday.delivery']);
  assert.strictEqual(got[0].confidence, 1);
  assert.deepStrictEqual([got[0].params.k, got[0].params.n, got[0].params.weekday], [4, 4, 4]);
  // 2 of the last 4 is below k = 3: nothing.
  var weak = history(function (d, wd) { if (wd === 4 && dates.diff(TODAY, d.date) <= 14) d.deliveryLate = 1; });
  assert.deepStrictEqual(det.candidates({ date: TODAY, days: weak, goals: goals }), []);
});

test('the weekday detector waits for n known days of that weekday', function () {
  var days = history(function (d, wd) { if (wd === 4) d.deliveryLate = 1; if (wd === 4 && dates.diff(TODAY, d.date) > 14) d.known.spend = false; });
  assert.deepStrictEqual(det.candidates({ date: TODAY, days: days, goals: goals }), []);
});

test('steps on this weekday, late screen, the same place, a game, a morning cafe', function () {
  var days = history(function (d, wd) {
    if (wd === 4) { d.steps = 9000; d.lateMin = 40; d.places = ['p7']; }
  });
  var records = [];
  days.forEach(function (d) {
    if (dates.weekday(d.date) === 4) records.push({ kind: 'play', at: at(d.date, 20), title: 'Подземка' });
    if (dates.weekday(d.date) <= 5) records.push({ kind: 'expense', at: at(d.date, 8, 30), amount: 300, tags: ['кафе и рестораны'] });
  });
  var got = det.candidates({ date: TODAY, days: days, goals: goals, records: records, places: { p7: { title: 'Сквер', type: 'other' } } });
  var ids = got.map(function (p) { return p.id; }).sort();
  assert.deepStrictEqual(ids, ['weekday.cafe', 'weekday.late', 'weekday.place:p7', 'weekday.play:Подземка', 'weekday.steps']);
  var home = det.candidates({ date: TODAY, days: days, goals: goals, places: { p7: { title: 'Дом', type: 'home' } } });
  assert.ok(!home.some(function (p) { return p.detector === 'weekday' && p.kind === 'places'; }), 'home is not a prediction');
});

test('sleep debt, trend, chain, achievement, rpg, calendar', function () {
  var days = history(function (d) {
    var age = dates.diff(TODAY, d.date);
    if (age <= 7) d.steps = 9000;
    else if (age <= 14) d.steps = 7000;
    if (age <= 2) d.sleepMin = 380;
    if (age === 1) { d.habitIds = ['stretch']; d.chains = { stretch: 29 }; }
  });
  var today = { date: TODAY, known: { sleep: true }, sleepMin: 360, sleepGoal: 450, paused: null };
  var got = det.candidates({
    date: TODAY, days: days, today: today, goals: goals, habits: { stretch: 'Растяжка' },
    extras: { achievements: [{ id: 'walker', title: 'Пешеход II', daysLeft: 2, progress: 28 }], rpg: { level: 14, toNext: 200, perDay: 300 }, calendar: [{ begin: at(TODAY, 15) }] }
  });
  var by = {};
  got.forEach(function (p) { by[p.id] = p; });
  assert.ok(by['sleep.debt'], 'sleep debt');
  assert.strictEqual(by['sleep.debt'].params.debt, 70 + 70 + 90);
  assert.strictEqual(by['sleep.debt'].params.usual, '23:50');
  assert.ok(by['trend.steps'] && by['trend.steps'].params.pct === 29, 'trend +29%');
  assert.ok(by['chain:stretch'] && by['chain:stretch'].params.round === 30 && by['chain:stretch'].params.inDays === 0);
  assert.ok(by['achievement:walker']);
  assert.ok(by['rpg.today'] && by['rpg.today'].params.level === 15);
  assert.ok(by.calendar && by.calendar.params.time === '15:00' && by.calendar.check === null);
});

test('a holiday of Праздники: today first, else the nearest within holidayDays; never checked', function () {
  var days = history();
  var run = function (holiday, settings) {
    return det.candidates({ date: TODAY, days: days, goals: goals, extras: { holiday: holiday }, settings: settings || {} }).filter(function (p) { return p.detector === 'holiday'; });
  };
  var today = run({ today: { id: 'ny', title: 'Новый год' }, soon: { id: 'x', title: 'Другой', inDays: 1 } });
  assert.deepStrictEqual(today.map(function (p) { return p.id; }), ['holiday.today:ny']);
  assert.strictEqual(today[0].check, null);
  assert.strictEqual(today[0].confidence, 0.9);
  var soon = run({ today: null, soon: { id: 'ny', title: 'Новый год', inDays: 2 } });
  assert.deepStrictEqual([soon[0].id, soon[0].params.inDays, soon[0].tone], ['holiday.soon:ny', 2, 'pleasant']);
  assert.deepStrictEqual(run({ today: null, soon: { id: 'ny', title: 'Новый год', inDays: 2 } }, { holidayDays: 1 }), []);
  assert.deepStrictEqual(run(null), [], 'without Праздники nothing changes');
  var paused = det.candidates({ date: TODAY, days: days, goals: goals, today: { date: TODAY, paused: 'rest', known: {} }, extras: { holiday: { today: { id: 'ny', title: 'Новый год' } } } });
  assert.deepStrictEqual(paused.map(function (p) { return p.id; }), ['holiday.today:ny'], 'a holiday stays on a pause');
});

/** Sessions of Фокус on every Thursday: 40 min at 15:00 with 4 attempts, 15 min at 09:00. */
function focusRecords(days, change) {
  var out = [];
  days.forEach(function (d) {
    if (dates.weekday(d.date) !== 4) return;
    var morning = { kind: 'focus', at: at(d.date, 9), amount: 15, data: { blockedAttempts: 0 } };
    var day = { kind: 'focus', at: at(d.date, 15), amount: 40, data: { blockedAttempts: 4 } };
    if (change) change(morning, day, d);
    out.push(morning, day);
  });
  return out;
}

test('Фокус: this weekday, attempts to get distracted, before and after the split hour', function () {
  var days = history();
  var records = focusRecords(days);
  var got = det.candidates({ date: TODAY, days: days, goals: goals, records: records, extras: { focus: true } });
  var by = {};
  got.forEach(function (p) { by[p.id] = p; });
  assert.deepStrictEqual(Object.keys(by).sort(), ['focus.after', 'weekday.focus', 'weekday.focusAttempts']);
  assert.deepStrictEqual([by['weekday.focus'].params.k, by['weekday.focus'].params.min, by['weekday.focus'].check.type], [4, 25, 'focus']);
  assert.strictEqual(by['weekday.focusAttempts'].tone, 'tease');
  assert.deepStrictEqual(by['focus.after'].params, { hour: 13, longMin: 40, shortMin: 15 });
  assert.deepStrictEqual(by['focus.after'].check, { type: 'focusPart', part: 'after', hour: 13, min: 15 });
  // Thresholds are settings.
  var strict = det.candidates({ date: TODAY, days: days, goals: goals, records: records, settings: { focusMin: 60, focusAttempts: 5, focusRatio: 3 } });
  assert.deepStrictEqual(strict, []);
  // Mornings longer: the other side.
  var early = focusRecords(days, function (m, d) { m.amount = 60; d.amount = 20; });
  var before = det.candidates({ date: TODAY, days: days, goals: goals, records: early }).filter(function (p) { return p.detector === 'focus'; });
  assert.deepStrictEqual([before[0].id, before[0].params.longMin, before[0].params.shortMin], ['focus.before', 60, 20]);
  // Without the module, or without sessions, nothing; on a pause, nothing about focus.
  assert.deepStrictEqual(det.candidates({ date: TODAY, days: days, goals: goals, records: records, extras: { focus: false } }), []);
  assert.deepStrictEqual(det.candidates({ date: TODAY, days: days, goals: goals, records: [], extras: { focus: true } }), []);
  assert.deepStrictEqual(det.candidates({ date: TODAY, days: days, goals: goals, records: records, today: { date: TODAY, paused: 'sick', known: {} } }), []);
});

test('Фокус checks: minutes, attempts, the longer side; null without data or the module', function () {
  var day = { date: TODAY, known: {} };
  var ev = function (check, records, extras) { return det.evaluate({ check: check }, { day: day, records: records, dayEndHour: 5, extras: extras || {} }); };
  var sessions = [{ kind: 'focus', at: at(TODAY, 9), amount: 15, data: { blockedAttempts: 1 } }, { kind: 'focus', at: at(TODAY, 16), amount: 30, data: { blockedAttempts: 2 } }];
  assert.strictEqual(ev({ type: 'focus', min: 25 }, sessions), true);
  assert.strictEqual(ev({ type: 'focus', min: 60 }, sessions), false);
  assert.strictEqual(ev({ type: 'focus', min: 25 }, []), false);
  assert.strictEqual(ev({ type: 'focus', min: 25 }, sessions, { focus: false }), null);
  assert.strictEqual(ev({ type: 'focusAttempts', min: 3 }, sessions), true);
  assert.strictEqual(ev({ type: 'focusAttempts', min: 4 }, sessions), false);
  assert.strictEqual(ev({ type: 'focusAttempts', min: 3 }, []), null);
  assert.strictEqual(ev({ type: 'focusPart', part: 'after', hour: 13, min: 15 }, sessions), true);
  assert.strictEqual(ev({ type: 'focusPart', part: 'before', hour: 13, min: 15 }, sessions), false);
  assert.strictEqual(ev({ type: 'focusPart', part: 'after', hour: 13, min: 15 }, sessions.slice(0, 1)), null);
});

test('a pause drops steps, sleep, screen and teasing', function () {
  var days = history(function (d, wd) { if (wd === 4) { d.deliveryLate = 1; d.steps = 9000; } });
  var got = det.candidates({ date: TODAY, days: days, today: { date: TODAY, paused: 'sick', known: {} }, goals: goals });
  assert.deepStrictEqual(got, []);
});

test('pick: confidence, no third day in a row, at least one pleasant', function () {
  var c = [
    { id: 'weekday.delivery', detector: 'weekday', tone: 'tease', confidence: 1 },
    { id: 'weekday.late', detector: 'weekday', tone: 'tease', confidence: 0.9 },
    { id: 'weekday.steps', detector: 'weekday', tone: 'pleasant', confidence: 0.75 },
    { id: 'sleep.debt', detector: 'sleep', tone: 'neutral', confidence: 0.6 },
    { id: 'calendar', detector: 'calendar', tone: 'neutral', confidence: 0.35 }
  ];
  var got = det.pick(c, [], { count: 3 });
  assert.deepStrictEqual(got.map(function (p) { return p.id; }), ['weekday.delivery', 'weekday.late', 'weekday.steps']);
  var again = det.pick(c, [['weekday.delivery', 'x'], ['weekday.delivery']], { count: 3, noRepeat: 2 });
  assert.ok(again.every(function (p) { return p.id !== 'weekday.delivery'; }), 'repeated for a third day');
  var teasing = det.pick(c.slice(0, 2), [], { count: 2 });
  assert.ok(teasing.some(function (p) { return p.tone !== 'tease'; }), 'no pleasant one');
  assert.strictEqual(teasing[teasing.length - 1].id, 'calm');
  assert.deepStrictEqual(det.pick([], [], {}).map(function (p) { return p.id; }), ['calm']);
});

test('checks of every kind; pause and missing data give null', function () {
  var day = { date: TODAY, known: { sleep: true, steps: true, screen: true, places: true, spend: true }, steps: 9000, lateMin: 3, deliveryLate: 1, places: ['p7'], habitIds: ['stretch'], bedtime: '23:10' };
  var next = { date: dates.add(TODAY, 1), known: { sleep: true }, bedtime: '23:10' };
  var ctx = { day: day, next: next, dayEndHour: 5, records: [{ kind: 'expense', at: at(TODAY, 8), tags: ['кафе и рестораны'] }, { kind: 'play', at: at(TODAY, 21), title: 'Подземка' }],
    extras: { achievements: [{ id: 'walker', progress: 29 }], granted: ['chain'], rpgLevel: 15 } };
  var ev = function (check) { return det.evaluate({ check: check }, ctx); };
  assert.strictEqual(ev({ metric: 'deliveryLate', op: '>=', value: 1 }), true);
  assert.strictEqual(ev({ metric: 'steps', op: '>=', value: 10000 }), false);
  assert.strictEqual(ev({ metric: 'lateMin', op: '>=', value: 15 }), false);
  assert.strictEqual(ev({ type: 'visit', place: 'p7' }), true);
  assert.strictEqual(ev({ type: 'expense', tag: 'кафе и рестораны', beforeHour: 10 }), true);
  assert.strictEqual(ev({ type: 'play', title: 'Подземка' }), true);
  assert.strictEqual(ev({ type: 'bedtimeBefore', value: dates.night('23:50'), dayOffset: 1 }), true);
  assert.strictEqual(ev({ type: 'habit', id: 'stretch' }), true);
  assert.strictEqual(ev({ type: 'achievement', id: 'walker', progress: 28 }), true);
  assert.strictEqual(ev({ type: 'achievement', id: 'chain', progress: 3 }), true);
  assert.strictEqual(ev({ type: 'rpg', level: 16 }), false);
  assert.strictEqual(ev(null), null);
  assert.strictEqual(det.evaluate({ check: { metric: 'steps', op: '>=', value: 1 } }, { day: Object.assign({}, day, { paused: 'sick' }) }), null);
  assert.strictEqual(det.evaluate({ check: { metric: 'steps', op: '>=', value: 1 } }, { day: Object.assign({}, day, { known: { steps: false } }) }), null);
  assert.strictEqual(det.evaluate({ check: { type: 'bedtimeBefore', value: 700, dayOffset: 1 } }, { day: day, next: null }), null);
});

test('accuracy, weeks and the streak of misses', function () {
  var files = [
    { date: '2026-11-16', predictions: [{ hit: true }, { hit: false }, { hit: null }] },
    { date: '2026-11-17', predictions: [{ hit: false }, { hit: false }] },
    { date: '2026-11-18', predictions: [{ hit: false }, { hit: false }, { hit: null }] }
  ];
  assert.deepStrictEqual(det.accuracy(files), { hits: 1, misses: 5, pct: 17 });
  assert.strictEqual(det.missStreak(files), 5);
  var weeks = det.byWeeks(files, 2, '2026-11-19');
  assert.deepStrictEqual(weeks.map(function (w) { return w.week; }), ['2026-11-09', '2026-11-16']);
  assert.strictEqual(weeks[1].misses, 5);
  assert.strictEqual(weeks[0].pct, null);
});

console.log('detectors: ' + passed + ' passed' + (process.exitCode ? ', some FAILED' : ''));
