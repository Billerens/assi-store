// node tests/timer.test.js
var assert = require('assert');
var t = require('./harness.js');
var timer = require('../logic/timer.js');
var dnd = require('../logic/dnd.js');
var calls = require('../logic/calls.js');
var settingsLib = require('../logic/settings.js');

var MIN = 60000;
var s = settingsLib.normalize({});
var START = new Date(2026, 10, 14, 10, 0, 0).getTime();

t.test('minutes asked for are whole and within the limits', function () {
  assert.strictEqual(timer.minutes('50', s), 50);
  assert.strictEqual(timer.minutes(0.4, s), 1, 'less than a minute is a minute');
  assert.strictEqual(timer.minutes(-5, s), null);
  assert.strictEqual(timer.minutes('abc', s), null);
  assert.strictEqual(timer.minutes(1, s), 1);
  assert.strictEqual(timer.minutes(10000, s), 480);
  assert.strictEqual(timer.minutes('2,5', s), 3);
});

t.test('a session: left, elapsed, extension', function () {
  var session = timer.create({ minutes: 25, task: '  Отчёт ', now: START });
  assert.strictEqual(session.task, 'Отчёт');
  assert.strictEqual(session.endAt, START + 25 * MIN);
  assert.strictEqual(timer.left(session, START + 7 * MIN), 18 * MIN);
  assert.strictEqual(timer.actualMin(session, START + 7 * MIN), 7);
  var longer = timer.extend(session, 10);
  assert.strictEqual(longer.endAt, START + 35 * MIN);
  assert.strictEqual(longer.extendedMin, 10);
  assert.strictEqual(timer.total(longer), 35);
  assert.strictEqual(session.endAt, START + 25 * MIN, 'the old one is not changed');
  assert.strictEqual(timer.actualMin(longer, START + 60 * MIN), 35, 'not more than planned');
});

t.test('a pause stops the clock and moves the end', function () {
  var session = timer.create({ minutes: 25, now: START });
  var paused = timer.pause(session, START + 10 * MIN);
  assert.strictEqual(timer.left(paused, START + 14 * MIN), 15 * MIN, 'left stays during the pause');
  assert.strictEqual(timer.actualMin(paused, START + 14 * MIN), 10);
  var back = timer.resume(paused, START + 15 * MIN);
  assert.strictEqual(back.endAt, START + 30 * MIN);
  assert.strictEqual(back.pausedMs, 5 * MIN);
  assert.strictEqual(back.pausedAt, null);
  assert.strictEqual(timer.actualMin(back, START + 30 * MIN), 25);
  assert.strictEqual(timer.restore(paused, START + 100 * MIN, 120), 'continue', 'a paused one is not ended by a restore');
});

t.test('ending early asks first', function () {
  var session = timer.create({ minutes: 50, now: START });
  assert.ok(timer.early(session, START + 20 * MIN, 0.5));
  assert.ok(!timer.early(session, START + 26 * MIN, 0.5));
  assert.ok(!timer.early(session, START + MIN, 0), 'threshold 0 — never');
});

t.test('the daily job when the shell has no one-off jobs: the next whole minute', function () {
  var at = timer.atClock(new Date(2026, 10, 14, 10, 24, 30).getTime());
  assert.strictEqual(at.at, '10:25');
  assert.strictEqual(at.fires, new Date(2026, 10, 14, 10, 25, 0).getTime());
  assert.strictEqual(timer.atClock(new Date(2026, 10, 14, 10, 25, 0).getTime()).at, '10:25');
  assert.strictEqual(timer.atClock(new Date(2026, 10, 14, 23, 59, 1).getTime()).at, '00:00');
});

t.test('after a restart: continue, the timer, a restore', function () {
  var session = timer.create({ minutes: 5, now: START });
  assert.strictEqual(timer.restore(null, START, 120), 'none');
  assert.strictEqual(timer.restore({}, START, 120), 'none');
  assert.strictEqual(timer.restore(session, START + 2 * MIN, 120), 'continue');
  assert.strictEqual(timer.restore(session, START + 5 * MIN + 30000, 120), 'timer');
  assert.strictEqual(timer.restore(session, START + 60 * MIN, 120), 'restore');
});

t.test('cycles: work, break, the long break, the end of the series', function () {
  var work = timer.create({ minutes: 25, now: START, cycle: 1, cycles: 4, task: 'Отчёт' });
  var pause = timer.afterWork(work, s);
  assert.deepStrictEqual([pause.kind, pause.minutes, pause.long, pause.cycle], ['break', 5, false, 1]);
  var next = timer.afterBreak({ cycle: 1, cycles: 4, long: false, task: 'Отчёт' }, s);
  assert.deepStrictEqual([next.kind, next.minutes, next.cycle, next.task], ['work', 25, 2, 'Отчёт']);
  var last = timer.afterWork({ cycle: 4, cycles: 4 }, s);
  assert.deepStrictEqual([last.minutes, last.long], [15, true]);
  assert.strictEqual(timer.afterBreak({ cycle: 4, cycles: 4, long: true }, s), null);
  assert.strictEqual(timer.afterWork(timer.create({ minutes: 25, now: START }), s), null, 'a single session has no break');
});

t.test('words and clocks', function () {
  assert.strictEqual(timer.clock(18 * MIN + 5000), '18:05');
  assert.strictEqual(timer.clock(62 * MIN), '1:02:00');
  assert.strictEqual(timer.clock(-1), '0:00');
  assert.strictEqual(timer.leftText(18 * MIN), '18 минут');
  assert.strictEqual(timer.leftText(21 * MIN), '21 минута');
  assert.strictEqual(timer.leftText(100 * MIN), '1 ч 40 мин');
  var session = timer.create({ minutes: 25, now: START });
  assert.strictEqual(timer.reminder(session, START + 7 * MIN), 'Фокус: ещё 18 минут');
  assert.strictEqual(timer.reminder(session, START + 24 * MIN), 'Фокус: ещё 1 минуту');
  assert.ok(Math.abs(timer.ring(session, START + 5 * MIN) - 0.8) < 1e-9);
});

t.test('do not disturb: leave it when already on, restore only what Focus set', function () {
  assert.deepStrictEqual(dnd.atStart('all', true), { touch: true, reason: '' });
  assert.strictEqual(dnd.atStart('priority', true).reason, 'already');
  assert.strictEqual(dnd.atStart('all', false).touch, false);
  var ours = { dndBy: 'listener', dndOk: true, dndFilter: 'priority', prevFilter: 'all' };
  assert.deepStrictEqual(dnd.atEnd(ours, 'priority'), { restore: true, to: 'all' });
  assert.strictEqual(dnd.atEnd(ours, 'all').reason, 'changed', 'the owner switched it off: hands off');
  assert.strictEqual(dnd.atEnd(ours, 'alarms').reason, 'changed');
  assert.strictEqual(dnd.atEnd({ dndBy: null, dndOk: true, dndFilter: 'priority' }, 'priority').restore, false, 'was on before Focus');
  assert.strictEqual(dnd.name(4), 'alarms');
  assert.strictEqual(dnd.code('none'), 3);
  assert.strictEqual(dnd.shizukuArg('priority'), 'priority');
  assert.strictEqual(dnd.shizukuArg('all'), 'off');
  assert.ok(dnd.worked('alarms'));
  assert.ok(!dnd.worked('all'));
  assert.ok(/сообщения будут приходить/.test(dnd.failure(['нет доступа'])));
});

t.test('calls: missed, answered, what the session does', function () {
  var list = calls.step([], { state: 'ringing', number: '+7900' }, START, 'Мама');
  list = calls.step(list, { state: 'ringing', number: '+7900' }, START + 1000);
  assert.strictEqual(list.length, 1, 'ringing again is the same call');
  list = calls.step(list, { state: 'idle' }, START + 20000);
  list = calls.step(list, { state: 'ringing', number: '+7911' }, START + 60000);
  list = calls.step(list, { state: 'offhook' }, START + 65000);
  list = calls.step(list, { state: 'idle' }, START + 90000);
  assert.deepStrictEqual(list.map(function (c) { return [c.number, c.answered, c.open]; }), [['+7900', false, false], ['+7911', true, false]]);
  assert.strictEqual(list[0].name, 'Мама');
  assert.strictEqual(calls.react({ state: 'ringing' }, 'end', false), 'end');
  assert.strictEqual(calls.react({ state: 'ringing' }, 'pause', false), 'pause');
  assert.strictEqual(calls.react({ state: 'offhook' }, 'pause', true), 'none');
  assert.strictEqual(calls.react({ state: 'idle' }, 'pause', true), 'resume');
  assert.strictEqual(calls.react({ state: 'ringing' }, 'nothing', false), 'none');
});

t.test('settings: defaults, limits, lists', function () {
  assert.deepStrictEqual(s.durations, [25, 50, 90]);
  assert.strictEqual(s.dndMode, 'priority');
  assert.strictEqual(s.strictness, 'soft');
  assert.strictEqual(s.allowSecondSec, 10);
  assert.strictEqual(s.earlyThreshold, 0.5);
  var odd = settingsLib.normalize({ durations: '15, 15, 45, 0, 5000', dndMode: 'loud', allowSecondSec: '-3', vibrate: '0, 300, 100, 300', cycles: 1 });
  assert.deepStrictEqual(odd.durations, [15, 45]);
  assert.strictEqual(odd.dndMode, 'priority');
  assert.strictEqual(odd.allowSecondSec, 0);
  assert.deepStrictEqual(odd.vibrate, [0, 300, 100, 300], 'a pattern keeps its repeats');
  assert.strictEqual(odd.cycles, true);
  assert.strictEqual(settingsLib.apply({}, { workMin: 50, nope: 1 }).workMin, 50);
  assert.strictEqual(settingsLib.apply({}, { nope: 1 }).nope, undefined);
  assert.deepStrictEqual(settingsLib.apply({}, { distractApps: 'com.vk.\ncom.instagram.android' }).distractApps, ['com.vk.', 'com.instagram.android']);
});

t.run('timer');
