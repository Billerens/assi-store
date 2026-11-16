// Logic of the health module on a computer: node tests/logic.test.js
var assert = require('assert');
var T = require('../logic/time.js');
var Text = require('../logic/text.js');
var Settings = require('../logic/settings.js');
var Habits = require('../logic/habits.js');
var Meds = require('../logic/meds.js');
var Sleep = require('../logic/sleep.js');
var Screen = require('../logic/screen.js');
var Steps = require('../logic/steps.js');
var Places = require('../logic/places.js');
var Hooks = require('../logic/hooks.js');
var Summary = require('../logic/summary.js');
var Weekly = require('../logic/weekly.js');

var passed = 0;
var failed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
  } catch (error) {
    failed++;
    console.error('FAIL ' + name + '\n  ' + (error && error.stack ? error.stack.split('\n').slice(0, 3).join('\n  ') : error));
  }
}

function ms(y, m, d, h, mi) {
  return new Date(y, m - 1, d, h || 0, mi || 0).getTime();
}

var S = Settings.merge({});

// ---- time ----
test('time: logical day ends at 05:00', function () {
  assert.strictEqual(T.logical(ms(2026, 11, 14, 1, 30), '05:00'), '2026-11-13');
  assert.strictEqual(T.logical(ms(2026, 11, 14, 5, 0), '05:00'), '2026-11-14');
  assert.strictEqual(T.logical(ms(2026, 11, 14, 23, 59), '05:00'), '2026-11-14');
});
test('time: bounds, night window and inDay', function () {
  var b = T.bounds('2026-11-13', '05:00');
  assert.strictEqual(b.from, ms(2026, 11, 13, 5));
  assert.strictEqual(b.to, ms(2026, 11, 14, 5));
  var n = T.night('2026-11-13', '00:30', '05:00', '05:00');
  assert.strictEqual(n.from, ms(2026, 11, 14, 0, 30));
  assert.strictEqual(n.to, ms(2026, 11, 14, 5, 0));
  var n2 = T.night('2026-11-13', '23:30', '05:00', '05:00');
  assert.strictEqual(n2.from, ms(2026, 11, 13, 23, 30));
  assert.strictEqual(T.inDay('2026-11-13', '02:00', '05:00'), ms(2026, 11, 14, 2));
});
test('time: weeks, ranges, windows', function () {
  assert.strictEqual(T.weekday('2026-11-16'), 1);
  assert.strictEqual(T.weekday('2026-11-15'), 7);
  assert.strictEqual(T.monday('2026-11-15'), '2026-11-09');
  assert.strictEqual(T.isoWeek('2026-01-01'), '2026-W01');
  assert.strictEqual(T.isoWeek('2026-11-14'), '2026-W46');
  assert.strictEqual(T.range('2026-02-27', '2026-03-02').length, 4);
  assert.strictEqual(T.diffDays('2026-11-01', '2026-11-14'), 13);
  assert.ok(T.inWindow(30, '23:00', '05:00'));
  assert.ok(!T.inWindow(600, '23:00', '05:00'));
  assert.strictEqual(T.normalizeTime('9:05'), '09:05');
  assert.strictEqual(T.minutes('25:00'), null);
});

// ---- text ----
test('text: numbers and durations', function () {
  assert.strictEqual(Text.num(6412), '6 412');
  assert.strictEqual(Text.num(1000000), '1 000 000');
  assert.strictEqual(Text.dur(370), '6 ч 10 мин');
  assert.strictEqual(Text.dur(45), '45 мин');
  assert.strictEqual(Text.dur(420), '7 ч');
  assert.strictEqual(Text.clockDur(460), '7:40');
  assert.strictEqual(Text.liters(1000), '1,0');
  assert.strictEqual(Text.plural(5, 'стакан', 'стакана', 'стаканов'), 'стаканов');
  assert.strictEqual(Text.plural(22, 'стакан', 'стакана', 'стаканов'), 'стакана');
  assert.strictEqual(Text.toMl(1, 'л', 250), 1000);
  assert.strictEqual(Text.toMl(2, 'стакана', 250), 500);
  assert.strictEqual(Text.toMl(300, 'ml', 250), 300);
  assert.strictEqual(Text.toMl(2, '', 250), 500);
});

// ---- settings ----
test('settings: defaults, clamping and unknown keys', function () {
  assert.strictEqual(S.stepsGoal, 8000);
  assert.strictEqual(S.dayEnd, '05:00');
  assert.strictEqual(S.weeklyDay, 7);
  var clean = Settings.clean({ stepsGoal: '99999', bedtime: '1:30', nope: 1, stepsSource: 'x', placesOn: 'true', coffeeWords: 'a, b' });
  assert.strictEqual(clean.stepsGoal, 50000);
  assert.strictEqual(clean.bedtime, '01:30');
  assert.ok(!('nope' in clean));
  assert.ok(!('stepsSource' in clean));
  assert.strictEqual(clean.placesOn, true);
  assert.deepStrictEqual(clean.coffeeWords, ['a', 'b']);
  Settings.SCHEMA.forEach(function (item) { assert.ok(item.section && item.label, item.key); });
});

// ---- habits ----
var daily = { id: 'read', title: 'Чтение', schedule: { days: [1, 2, 3, 4, 5, 6, 7] }, created: '2026-10-01' };
function doneSet(dates) {
  var out = {};
  dates.forEach(function (d) { out[d] = true; });
  return out;
}
test('habits: a daily chain counts back to the first miss', function () {
  var done = doneSet(['2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13']);
  assert.strictEqual(Habits.chain(daily, done, null, '2026-11-13', 0), 4);
  // Today not done yet does not break it.
  assert.strictEqual(Habits.chain(daily, done, null, '2026-11-14', 0), 4);
  assert.strictEqual(Habits.chain(daily, doneSet(['2026-11-14']), null, '2026-11-14', 0), 1);
});
test('habits: one freeze a week covers one missed day', function () {
  var done = doneSet(['2026-11-09', '2026-11-10', '2026-11-12', '2026-11-13']);
  assert.strictEqual(Habits.chain(daily, done, null, '2026-11-13', 0), 2);
  assert.strictEqual(Habits.chain(daily, done, null, '2026-11-13', 1), 4);
});
test('habits: a pause freezes the chain', function () {
  var done = doneSet(['2026-11-05', '2026-11-06', '2026-11-12', '2026-11-13']);
  var paused = function (d) { return d >= '2026-11-07' && d <= '2026-11-11'; };
  assert.strictEqual(Habits.chain(daily, done, paused, '2026-11-13', 0), 4);
  assert.strictEqual(Habits.chain(daily, done, null, '2026-11-13', 0), 2);
});
test('habits: days off the schedule are skipped', function () {
  var weekdays = { id: 'w', title: 'Зарядка', schedule: { days: [1, 2, 3, 4, 5] }, created: '2026-10-01' };
  // Fri 13, Mon 16: the weekend in between is not due.
  var done = doneSet(['2026-11-12', '2026-11-13', '2026-11-16']);
  assert.strictEqual(Habits.chain(weekdays, done, null, '2026-11-16', 0), 3);
  assert.ok(!Habits.isDue(weekdays, '2026-11-15', done));
  assert.ok(Habits.isDue(weekdays, '2026-11-16', done));
});
test('habits: N times a week', function () {
  var three = { id: 't', title: 'Бег', schedule: { perWeek: 3 }, created: '2026-10-01' };
  // Weeks of Nov 2 and Nov 9 fulfilled, this week (Nov 16) one run so far.
  var done = doneSet(['2026-11-02', '2026-11-04', '2026-11-06', '2026-11-09', '2026-11-11', '2026-11-13', '2026-11-16']);
  assert.strictEqual(Habits.chain(three, done, null, '2026-11-17', 0), T.diffDays('2026-11-02', '2026-11-17') + 1);
  assert.ok(Habits.isDue(three, '2026-11-17', done));
  var full = doneSet(['2026-11-16', '2026-11-17', '2026-11-18']);
  assert.ok(!Habits.isDue(three, '2026-11-19', full));
  assert.strictEqual(Habits.chain(three, doneSet([]), null, '2026-11-17', 0), 0);
  assert.strictEqual(Habits.describe(three), '3 раза в неделю');
  assert.strictEqual(Habits.describe(daily), 'каждый день');
});
test('habits: clean and best', function () {
  var h = Habits.clean({ title: ' Растяжка ', schedule: { days: [3, 1, 1, 9] }, remind: '8:00', measure: { amount: 10 } }, 1000);
  assert.strictEqual(h.title, 'Растяжка');
  assert.deepStrictEqual(h.schedule.days, [1, 3]);
  assert.strictEqual(h.remind, '08:00');
  assert.strictEqual(h.measure.unit, 'мин');
  assert.throws(function () { Habits.clean({ title: '' }); });
  var done = doneSet(['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-10']);
  assert.strictEqual(Habits.best(daily, done, null, '2026-11-13', 0), 3);
});

// ---- medicines ----
var vitamin = { id: 'd', name: 'Витамин D', dose: '1 капсула', times: ['09:00', '21:00'], days: [], from: null, until: null };
var night = { id: 'n', name: 'Мелатонин', times: ['01:00'], days: [] };
test('meds: doses of the owner day include the small hours of the next date', function () {
  var doses = Meds.doses([vitamin, night], '2026-11-13', '05:00');
  assert.deepStrictEqual(doses.map(function (d) { return d.name + ' ' + d.time; }), ['Витамин D 09:00', 'Витамин D 21:00', 'Мелатонин 01:00']);
  assert.strictEqual(doses[2].due, ms(2026, 11, 14, 1));
});
test('meds: course dates and week days', function () {
  assert.ok(!Meds.active({ times: ['09:00'], from: '2026-11-20' }, '2026-11-13'));
  assert.ok(!Meds.active({ times: ['09:00'], until: '2026-11-10' }, '2026-11-13'));
  assert.ok(Meds.active({ times: ['09:00'], days: [5] }, '2026-11-13'));
  assert.ok(!Meds.active({ times: ['09:00'], days: [1] }, '2026-11-13'));
});
test('meds: status of each dose from the records', function () {
  var doses = Meds.doses([vitamin], '2026-11-13', '05:00');
  var records = [{ id: 1, at: ms(2026, 11, 13, 9, 20), data: { medId: 'd', due: doses[0].due, status: 'taken' } }];
  var withStatus = Meds.withStatus(doses, records);
  assert.strictEqual(withStatus[0].status, 'taken');
  assert.strictEqual(withStatus[1].status, null);
  assert.strictEqual(Meds.missed(withStatus).length, 1);
  assert.strictEqual(Meds.statusFor(ms(2026, 11, 13, 10, 30), ms(2026, 11, 13, 9), 60), 'late');
  assert.strictEqual(Meds.statusFor(ms(2026, 11, 13, 9, 30), ms(2026, 11, 13, 9), 60), 'taken');
  var m = Meds.clean({ name: 'X', times: '21:00, 9:00, 9:00', days: [1, 2, 3, 4, 5, 6, 7] }, 5);
  assert.deepStrictEqual(m.times, ['09:00', '21:00']);
  assert.deepStrictEqual(m.days, []);
  assert.throws(function () { Meds.clean({ name: 'X', times: '' }); });
});

// ---- sleep ----
function ev(h, mi, type, day) {
  return { time: ms(2026, 11, day || 13, h, mi), type: type };
}
test('sleep: the longest off stretch, short looks glued as wakes', function () {
  var events = [
    ev(22, 0, 'screen-on'), ev(23, 50, 'screen-off'),
    ev(3, 10, 'screen-on', 14), ev(3, 15, 'screen-off', 14),
    ev(7, 40, 'screen-on', 14), ev(8, 30, 'screen-off', 14)
  ];
  var from = ms(2026, 11, 13, 20);
  var to = ms(2026, 11, 14, 14);
  var ons = Sleep.onIntervals(events, from, to);
  var found = Sleep.detect(ons, from, to, ms(2026, 11, 14, 12), { minGap: 180, glue: 20 });
  assert.strictEqual(found.start, ms(2026, 11, 13, 23, 50));
  assert.strictEqual(found.end, ms(2026, 11, 14, 7, 40));
  assert.strictEqual(found.wakes, 1);
  assert.strictEqual(found.minutes, 470 - 5);
  assert.ok(!found.ongoing);
});
test('sleep: a long look splits the night; too short is no sleep; still asleep is ongoing', function () {
  var events = [ev(23, 0, 'screen-off'), ev(2, 0, 'screen-on', 14), ev(3, 0, 'screen-off', 14), ev(5, 0, 'screen-on', 14)];
  var from = ms(2026, 11, 13, 20);
  var to = ms(2026, 11, 14, 14);
  var ons = Sleep.onIntervals(events, from, to, true);
  var found = Sleep.detect(ons, from, to, ms(2026, 11, 14, 12), { minGap: 180, glue: 20 });
  assert.strictEqual(found.start, ms(2026, 11, 13, 23));
  assert.strictEqual(found.minutes, 180);
  assert.strictEqual(Sleep.detect(ons, from, to, ms(2026, 11, 14, 12), { minGap: 200, glue: 20 }), null);
  var asleep = Sleep.onIntervals([ev(23, 30, 'screen-off')], from, to, true);
  var now = ms(2026, 11, 14, 6);
  var going = Sleep.detect(asleep, from, to, now, { minGap: 180, glue: 20 });
  assert.ok(going.ongoing);
});
test('sleep: «Сериал на ночь» moves the start of the screen sleep to the moment of falling asleep', function () {
  var found = { start: ms(2026, 11, 13, 23, 0), end: ms(2026, 11, 14, 7, 0), minutes: 480, wakes: 0, confidence: 0.7, ongoing: false, clipped: false };
  var story = function (h, mi, asleep, day) {
    return { kind: 'story', at: ms(2026, 11, day || 13, h, mi), amount: 25, data: { asleep: asleep, episode: 12 } };
  };
  var moved = Sleep.storyHint(found, [story(23, 25, true)], 120);
  assert.strictEqual(moved.start, ms(2026, 11, 13, 23, 25));
  assert.strictEqual(moved.minutes, 455);
  assert.strictEqual(moved.end, found.end);
  assert.strictEqual(moved.story, true);
  assert.strictEqual(moved.confidence, 0.8);
  assert.strictEqual(found.start, ms(2026, 11, 13, 23, 0), 'the found sleep is not changed in place');
  // No series, or it did not see him fall asleep, or too far from the screen going off: as before.
  assert.strictEqual(Sleep.storyHint(found, [], 120), found);
  assert.strictEqual(Sleep.storyHint(found, null, 120), found);
  assert.strictEqual(Sleep.storyHint(found, [story(23, 25, false)], 120), found);
  assert.strictEqual(Sleep.storyHint(found, [story(2, 0, true, 14)], 120), found, 'beyond storyShiftMax');
  assert.strictEqual(Sleep.storyHint(found, [story(22, 40, true)], 120), found, 'before the screen went off — he was not asleep');
  assert.strictEqual(Sleep.storyHint(null, [story(23, 25, true)], 120), null);
  assert.strictEqual(Sleep.storyHint(found, [story(23, 10, true), story(23, 40, true)], 120).start, ms(2026, 11, 13, 23, 40), 'the last one');
  assert.strictEqual(S.sleepFromStory, true);
  assert.strictEqual(S.storyShiftMax, 120);
});
test('sleep: Health Connect session with stages', function () {
  var start = ms(2026, 11, 13, 23);
  var session = { start: start, end: start + 8 * 3600000, stages: [
    { start: start, end: start + 3600000, type: 4 },
    { start: start + 3600000, end: start + 2 * 3600000, type: 5 },
    { start: start + 2 * 3600000, end: start + 2.5 * 3600000, type: 1 },
    { start: start + 2.5 * 3600000, end: start + 8 * 3600000, type: 6 }
  ] };
  var out = Sleep.fromSession(session);
  assert.strictEqual(out.minutes, 450);
  assert.strictEqual(out.wakes, 1);
  assert.strictEqual(out.quality, 100);
  assert.strictEqual(Sleep.fromSession({ start: start, end: start + 3600000 }).quality, null);
});
test('sleep: manual correction puts an evening bedtime on the day before', function () {
  var m = Sleep.manual('2026-11-14', '23:30', '07:00', T.at);
  assert.strictEqual(m.start, ms(2026, 11, 13, 23, 30));
  assert.strictEqual(m.minutes, 450);
  var m2 = Sleep.manual('2026-11-14', '01:00', '08:00', T.at);
  assert.strictEqual(m2.minutes, 420);
  assert.ok(Sleep.rank('manual') > Sleep.rank('hc') && Sleep.rank('hc') > Sleep.rank('screen'));
});

// ---- screen ----
test('screen: minutes, unlocks, apps, social and the night window', function () {
  var from = ms(2026, 11, 13, 5);
  var to = ms(2026, 11, 14, 5);
  var events = [
    { time: ms(2026, 11, 13, 9), type: 'screen-on' }, { time: ms(2026, 11, 13, 9, 0), type: 'unlock' },
    { time: ms(2026, 11, 13, 9, 1), type: 'resumed', package: 'org.telegram' },
    { time: ms(2026, 11, 13, 9, 31), type: 'resumed', package: 'com.vk' },
    { time: ms(2026, 11, 13, 10), type: 'screen-off' },
    { time: ms(2026, 11, 14, 1), type: 'screen-on' }, { time: ms(2026, 11, 14, 1), type: 'unlock' },
    { time: ms(2026, 11, 14, 1, 0), type: 'resumed', package: 'com.vk' },
    { time: ms(2026, 11, 14, 2, 30), type: 'screen-off' }
  ];
  var out = Screen.aggregate(events, {
    from: from, to: to, now: to + 1000,
    night: T.night('2026-11-13', '00:30', '05:00', '05:00'),
    after: T.inDay('2026-11-13', '02:00', '05:00'),
    social: { 'com.vk': true }, appsTop: 15
  });
  assert.strictEqual(out.minutes, 60 + 90);
  assert.strictEqual(out.unlocks, 2);
  assert.strictEqual(out.apps['org.telegram'], 30);
  assert.strictEqual(out.apps['com.vk'], 29 + 90);
  assert.strictEqual(out.social, 119);
  assert.strictEqual(out.late, 90);
  assert.strictEqual(out.lateAfter2, 30);
  assert.strictEqual(out.launches['com.vk'], 2);
  assert.strictEqual(T.clock(out.first), '09:00');
});
test('screen: the own log gives minutes without apps', function () {
  var log = [[ms(2026, 11, 13, 9), 'on'], [ms(2026, 11, 13, 9), 'unlocked'], [ms(2026, 11, 13, 9, 45), 'off']];
  var out = Screen.aggregate(Screen.fromLog(log), { from: ms(2026, 11, 13, 5), to: ms(2026, 11, 14, 5), now: ms(2026, 11, 13, 12) });
  assert.strictEqual(out.minutes, 45);
  assert.strictEqual(out.unlocks, 1);
  assert.strictEqual(out.social, null);
});

// ---- steps ----
test('steps: counter delta survives a restart', function () {
  assert.strictEqual(Steps.delta({ value: 1000, boot: 1 }, { value: 1250, boot: 1 }), 250);
  assert.strictEqual(Steps.delta({ value: 5000, boot: 1 }, { value: 300, boot: 1 }), 300);
  assert.strictEqual(Steps.delta({ value: 100, boot: 1 }, { value: 300, boot: 10000000 }), 300);
  assert.strictEqual(Steps.delta(null, { value: 300, boot: 1 }), 0);
});
test('steps: spread over hours and across midnight', function () {
  var parts = Steps.spread(300, ms(2026, 11, 13, 23, 30), ms(2026, 11, 14, 0, 30), 24);
  assert.strictEqual(parts.length, 2);
  assert.strictEqual(parts[0].date, '2026-11-13');
  assert.strictEqual(parts[0].hour, 23);
  assert.strictEqual(parts[0].steps + parts[1].steps, 300);
  var days = Steps.addParts({}, parts);
  assert.strictEqual(Steps.total(days['2026-11-14']), parts[1].steps);
  assert.strictEqual(Steps.spread(50, null, ms(2026, 11, 14, 9, 10), 24)[0].hour, 9);
});
test('steps: choosing the source', function () {
  var hc = Steps.zeros(24);
  hc[9] = 100;
  var sensor = Steps.zeros(24);
  sensor[9] = 90;
  assert.strictEqual(Steps.pick(hc, sensor, 'both', 'hc').from, 'hc');
  assert.strictEqual(Steps.pick(hc, sensor, 'both', 'sensor').from, 'sensor');
  assert.strictEqual(Steps.pick(null, sensor, 'both', 'hc').from, 'sensor');
  assert.strictEqual(Steps.pick(null, sensor, 'hc', 'hc'), null);
});

// ---- places ----
test('places: geohash and distance', function () {
  assert.strictEqual(Places.geohash(57.64911, 10.40744, 11), 'u4pruydqqvj');
  var c = Places.decode('u4pruydqqvj');
  assert.ok(Math.abs(c.lat - 57.64911) < 0.0001 && Math.abs(c.lon - 10.40744) < 0.0001);
  var km = Places.distance(55.7558, 37.6173, 59.9343, 30.3351);
  assert.ok(km > 630 && km < 640, String(km));
});
test('places: fixes close together become a visit, a far fix closes it', function () {
  var opts = { radius: 150, minStay: 10 };
  var step = Places.track(null, { lat: 55.75, lon: 37.61, at: ms(2026, 11, 13, 12) }, opts);
  assert.ok(!step.cluster.visit);
  step = Places.track(step.cluster, { lat: 55.7505, lon: 37.6105, at: ms(2026, 11, 13, 12, 15) }, opts);
  assert.ok(step.started && step.cluster.visit);
  step = Places.track(step.cluster, { lat: 55.80, lon: 37.70, at: ms(2026, 11, 13, 12, 30) }, opts);
  assert.ok(step.closed && step.closed.visit);
  assert.strictEqual(step.cluster.n, 1);
  var places = [{ id: 'a', lat: 55.75, lon: 37.61, radius: 150 }, { id: 'b', lat: 55.8, lon: 37.7, radius: 150 }];
  assert.strictEqual(Places.match(places, 55.7501, 37.6101, 150).id, 'a');
  assert.strictEqual(Places.match(places, 55.77, 37.65, 150), null);
});
test('places: home by nights, work by weekday hours', function () {
  var visits = [];
  ['2026-11-09', '2026-11-10', '2026-11-11'].forEach(function (d) {
    visits.push({ place: 'home', start: T.at(T.addDays(d, -1), '22:00'), end: T.at(d, '08:00') });
    visits.push({ place: 'office', start: T.at(d, '09:30'), end: T.at(d, '18:00') });
  });
  var guess = Places.guess(visits);
  assert.strictEqual(guess.home, 'home');
  assert.strictEqual(guess.work, 'office');
});

// ---- hooks ----
test('hooks: achievements, then rpg, then pet, then the rest; no duplicates', function () {
  var list = [];
  list = Hooks.add(list, { event: 'life.day', path: 'modules/pet/main.js', fn: 'onDay' });
  list = Hooks.add(list, { event: 'life.day', path: 'modules/horoscope/main.js', fn: 'onDay' });
  list = Hooks.add(list, { event: 'life.day', path: 'modules/rpg/main.js', fn: 'onDay' });
  list = Hooks.add(list, { event: 'life.day', path: 'modules/achievements/main.js', fn: 'onDay' });
  list = Hooks.add(list, { event: 'life.mark', path: 'modules/pet/main.js', fn: 'onMark' });
  list = Hooks.add(list, { event: 'life.day', path: 'modules/pet/main.js', fn: 'onDay' });
  assert.strictEqual(list.length, 5);
  assert.deepStrictEqual(Hooks.ordered(list, 'life.day').map(function (h) { return h.path.split('/')[1]; }),
    ['achievements', 'rpg', 'pet', 'horoscope']);
  assert.strictEqual(Hooks.remove(list, 'modules/pet/main.js').length, 3);
  assert.strictEqual(Hooks.remove(list, 'modules/pet/main.js', 'life.mark').length, 4);
  assert.throws(function () { Hooks.add(list, { event: 'life.day' }); });
});

// ---- summary ----
test('summary: a day from records', function () {
  var date = '2026-11-13';
  var habit = { id: 'read', title: 'Чтение', schedule: { days: [1, 2, 3, 4, 5, 6, 7] }, created: '2026-10-01' };
  var stretch = { id: 'stretch', title: 'Растяжка', schedule: { days: [1, 2, 3, 4, 5, 6, 7] }, created: '2026-10-01' };
  var records = {
    sleep: [
      { id: 1, at: ms(2026, 11, 13, 1, 40), amount: 370, data: { night: date, bedtime: '01:40', wake: '07:50', from: 'screen', confidence: 0.6 } },
      { id: 2, at: ms(2026, 11, 13, 1, 30), amount: 380, data: { night: date, bedtime: '01:30', wake: '07:50', from: 'manual' } }
    ],
    steps: [{ id: 3, at: ms(2026, 11, 13), amount: 6412, data: { day: date, from: 'sensor', hours: [] } }],
    water: [{ amount: 250, unit: 'ml' }, { amount: 250, unit: 'ml' }, { amount: 2, unit: 'стакана' }],
    med: [],
    habit: [{ id: 9, at: ms(2026, 11, 13, 20), title: 'Чтение', tags: ['read'], data: { habitId: 'read' } },
      { id: 10, at: ms(2026, 11, 13, 21), title: 'растяжка' }],
    workout: [{ amount: 30 }],
    screen: [{ id: 4, at: ms(2026, 11, 13), amount: 200, data: { day: date, social: 95, unlocks: 58, late: 25, lateAfter2: 0 } }],
    visit: [{ data: { place: 'p1', distanceKm: 3.2 } }, { data: { place: 'home', distanceKm: 0 } }],
    place: [{ at: ms(2026, 11, 13, 15) }],
    expense: [{ at: ms(2026, 11, 13, 22, 30), amount: 900, tags: ['доставка еды'] }, { at: ms(2026, 11, 13, 12), amount: -100, tags: [] }],
    focus: [{ amount: 50 }], play: [], mood: [{ at: 1, amount: 4 }, { at: 2, amount: 3 }]
  };
  var out = Summary.build({
    date: date, settings: S, records: records, habits: [habit, stretch],
    meds: [vitamin], habitDone: { read: doneSet(['2026-11-12', '2026-11-13']), stretch: doneSet(['2026-11-13']) },
    pausedType: null, pausedOn: function () { return null; }, homeIds: ['home'], placesKnown: true, spendKnown: true,
    newCells: 4, budgetOk: true
  });
  Summary.FIELDS.forEach(function (key) { assert.ok(key in out, 'нет поля ' + key); });
  assert.strictEqual(out.sleepMin, 380);
  assert.strictEqual(out.sleepFrom, 'manual');
  assert.strictEqual(out.steps, 6412);
  assert.strictEqual(out.distanceKm, 4.8);
  assert.strictEqual(out.waterMl, 1000);
  assert.strictEqual(out.medsDue, 2);
  assert.strictEqual(out.medsTaken, 0);
  assert.strictEqual(out.habitsDone, 2);
  assert.strictEqual(out.habitsDue, 2);
  assert.strictEqual(out.chains.read, 2);
  assert.strictEqual(out.screenMin, 200);
  assert.strictEqual(out.socialMin, 95);
  assert.deepStrictEqual(out.places, ['p1', 'home']);
  assert.strictEqual(out.newPlaces, 1);
  assert.strictEqual(out.farthestKm, 3.2);
  assert.strictEqual(out.homeOnly, false);
  assert.strictEqual(out.spend, 800);
  assert.strictEqual(out.noSpend, false);
  assert.strictEqual(out.deliveryLate, 1);
  assert.strictEqual(out.focusMin, 50);
  assert.strictEqual(out.mood, 3);
  assert.deepStrictEqual(out.left, ['Витамин D'], 'two doses left, one name');
});
test('summary: what is not known is null, never zero', function () {
  var out = Summary.build({ date: '2026-11-13', settings: S, records: {}, habits: [], meds: [] });
  assert.strictEqual(out.sleepMin, null);
  assert.strictEqual(out.steps, null);
  assert.strictEqual(out.screenMin, null);
  assert.strictEqual(out.spend, null);
  assert.strictEqual(out.noSpend, null);
  assert.strictEqual(out.homeOnly, null);
  assert.strictEqual(out.waterMl, 0);
  assert.deepStrictEqual(out.known, { sleep: false, steps: false, screen: false, places: false, spend: false });
});

// ---- weekly ----
test('weekly: bad nights after a sign are counted and reported', function () {
  var rows = [];
  for (var i = 0; i < 16; i++) {
    var social = i < 8;
    var bad = social ? i < 6 : i === 12;
    rows.push({ night: 'n' + i, sleepMin: bad ? 360 : 460, feats: { social: social, late: null, weekend: i % 7 >= 5 } });
  }
  var table = Weekly.analyze(rows, S);
  var social = table.rows.filter(function (r) { return r.key === 'social'; })[0];
  assert.strictEqual(social.withN, 8);
  assert.strictEqual(social.withBad, 6);
  assert.strictEqual(social.pWith, 75);
  assert.strictEqual(social.pWithout, 13);
  assert.ok(social.report);
  assert.strictEqual(social.diffMin, -62);
  var late = table.rows.filter(function (r) { return r.key === 'late'; })[0];
  assert.ok(!late.report);
  var text = Weekly.text(table);
  assert.ok(/не обязательно причина/.test(text));
  assert.ok(/6 из 8/.test(text));
  assert.ok(/соцсети больше 90 мин/.test(Weekly.prompt(table, null)));
});
test('weekly: signs of the day before', function () {
  var day = { date: '2026-11-14', known: { screen: true, steps: true, spend: false }, socialMin: 120, lateMin: 10, steps: 3000 };
  var f = Weekly.features(day, { lateWorkout: false }, S);
  assert.strictEqual(f.social, true);
  assert.strictEqual(f.late, false);
  assert.strictEqual(f.lowSteps, true);
  assert.strictEqual(f.lateDelivery, null);
  assert.strictEqual(f.weekend, true);
  assert.ok(Weekly.isCoffee({ title: 'Cofix Тверская', tags: ['кафе и рестораны'] }, S));
  assert.ok(!Weekly.isCoffee({ title: 'Cofix', tags: ['продукты'] }, S));
  var avg = Weekly.averages([{ known: { sleep: true }, sleepMin: 400 }, { known: { sleep: false }, sleepMin: null }]);
  assert.strictEqual(avg.sleepMin, 400);
});

console.log('health logic: ' + passed + ' passed, ' + failed + ' failed');
if (failed) process.exit(1);
