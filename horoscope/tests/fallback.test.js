// node tests/fallback.test.js — the day summary from base records (when «Здоровье» is not installed) and dates.
var assert = require('assert');
var fallback = require('../fallback.js');
var dates = require('../dates.js');

var at = function (date, hh, mm) { var d = dates.parse(date); d.setHours(hh, mm || 0); return d.getTime(); };
var goals = fallback.goals({ stepsGoal: 9000, sleepGoal: 420 });
var records = [
  { kind: 'sleep', at: at('2026-11-12', 23, 40), amount: 450, data: { night: '2026-11-13', bedtime: '23:40', wake: '07:10', from: 'screen' } },
  { kind: 'steps', at: at('2026-11-13', 0), amount: 9400, data: { day: '2026-11-13' } },
  { kind: 'water', at: at('2026-11-13', 10), amount: 250, unit: 'ml' },
  { kind: 'water', at: at('2026-11-14', 1), amount: 0.5, unit: 'l' },          // 01:00 belongs to the 13th
  { kind: 'water', at: at('2026-11-14', 6), amount: 250, unit: 'ml' },         // the 14th
  { kind: 'habit', at: at('2026-11-13', 9), title: 'Растяжка', tags: ['stretch'], data: { habitId: 'stretch' } },
  { kind: 'habit', at: at('2026-11-13', 21), title: 'Растяжка', tags: ['stretch'], data: { habitId: 'stretch' } },
  { kind: 'expense', at: at('2026-11-13', 22, 30), amount: 900, tags: ['доставка еды'] },
  { kind: 'screen', at: at('2026-11-13', 0), amount: 200, data: { day: '2026-11-13', social: 40, unlocks: 80, late: 12, lateAfter2: 0, launches: { a: 30, b: 101 } } },
  { kind: 'visit', at: at('2026-11-13', 12), amount: 30, data: { place: 1, distanceKm: 3, firstTime: true } },
  { kind: 'place', at: at('2026-11-13', 12), title: 'Сквер', data: { id: 1, type: 'other' } }
];

var day = fallback.summarize('2026-11-13', records, { goals: goals, pauses: [] });
assert.strictEqual(day.sleepMin, 450);
assert.strictEqual(day.wake, '07:10');
assert.strictEqual(day.steps, 9400);
assert.strictEqual(day.distanceKm, 7.1);
assert.strictEqual(day.stepsGoal, 9000);
assert.strictEqual(day.waterMl, 750);
assert.deepStrictEqual(day.habitIds, ['stretch']);
assert.strictEqual(day.spend, 900);
assert.strictEqual(day.noSpend, false);
assert.strictEqual(day.deliveryLate, 1);
assert.strictEqual(day.socialMin, 40);
assert.strictEqual(day.newPlaces, 1);
assert.strictEqual(day.farthestKm, 3);
assert.strictEqual(day.homeOnly, false);
assert.deepStrictEqual(day.known, { sleep: true, steps: true, screen: true, places: true, spend: true });

var empty = fallback.summarize('2026-11-10', records, { goals: goals, pauses: [] });
assert.deepStrictEqual(empty.known, { sleep: false, steps: false, screen: false, places: false, spend: false });
assert.strictEqual(empty.waterMl, 0);

var paused = fallback.summarize('2026-11-13', [], { goals: goals, pauses: [{ kind: 'pause', at: at('2026-11-12', 10), data: { type: 'sick', until: '2026-11-15' } }] });
assert.strictEqual(paused.paused, 'sick');

var normal = fallback.normalize({ date: '2026-11-13', steps: 100 });
assert.strictEqual(normal.known.steps, true);
assert.strictEqual(normal.known.sleep, false);
assert.deepStrictEqual(normal.habitIds, []);

assert.strictEqual(dates.night('23:30'), 690);
assert.strictEqual(dates.night('01:40'), 820);
assert.strictEqual(dates.weekday('2026-11-14'), 6);
assert.strictEqual(dates.monday('2026-11-14'), '2026-11-09');
assert.strictEqual(dates.current(at('2026-11-14', 3), 5), '2026-11-13');
assert.strictEqual(dates.current(at('2026-11-14', 6), 5), '2026-11-14');
assert.strictEqual(dates.range('2026-10-30', '2026-11-02').length, 4);
assert.strictEqual(goals.dayEndHour, 5);
console.log('fallback и dates: всё сошлось');
