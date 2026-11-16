// node tests/xp.test.js — experience of a day, levels, comeback, chains, stages.
var assert = require('assert');
var xp = require('../xp.js');
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

function day(fields) {
  var d = Object.assign({ date: '2026-11-13', paused: null, habitIds: [], chains: {}, known: {} }, fields);
  d.known = Object.assign({ sleep: d.sleepMin !== undefined, steps: d.steps !== undefined, screen: d.screenMin !== undefined, places: false, spend: false }, fields.known || {});
  return d;
}

var goals = { steps: 8000, sleep: 450, bedtime: '00:00', water: 2000 };

test('the documented day: 9 400 steps, sleep to the goal, a habit with chain 15 → 146', function () {
  // Sleep to the goal, bedtime far from the goal (no bedtime bonus): the doc counts 94 + 40 + 12.5.
  var d = day({ steps: 9400, sleepMin: 450, bedtime: '02:00', habitIds: ['read'], chains: { read: 15 } });
  var entries = xp.dayEntries(d, { goals: goals, rounding: 'floor' });
  var bySkill = {};
  entries.forEach(function (e) { bySkill[e.skill] = (bySkill[e.skill] || 0) + e.amount; });
  assert.strictEqual(bySkill.endurance, 94);
  assert.strictEqual(bySkill.regime, 40);
  assert.strictEqual(bySkill['habit:read'], 12);
  var total = entries.reduce(function (s, e) { return s + e.amount; }, 0);
  assert.strictEqual(total, 146, 'floor of 94 + 40 + 12.5');
  // Rounding of the sum, as the doc writes it, and of each entry gives the same here.
  assert.strictEqual(Math.floor(94 + 40 + xp.habitXp(15)), 146);
  assert.strictEqual(xp.habitXp(15), 12.5);
});

test('rounding is a setting', function () {
  var d = day({ habitIds: ['read'], chains: { read: 15 } });
  assert.strictEqual(xp.dayEntries(d, { goals: goals, rounding: 'ceil' })[0].amount, 13);
  assert.strictEqual(xp.dayEntries(d, { goals: goals, rounding: 'round' })[0].amount, 13);
  assert.strictEqual(xp.dayEntries(d, { goals: goals, rounding: 'floor' })[0].amount, 12);
});

test('unknown data gives nothing, never less than zero', function () {
  var d = day({ known: { sleep: false, steps: false, screen: false } });
  assert.deepStrictEqual(xp.dayEntries(d, { goals: goals }), []);
});

test('caps and every number from settings', function () {
  var d = day({ steps: 40000, workoutMin: 90 });
  var e = xp.dayEntries(d, { goals: goals });
  assert.strictEqual(e.filter(function (x) { return x.ref.indexOf(':steps') > 0; })[0].amount, 250);
  assert.strictEqual(e.filter(function (x) { return x.ref.indexOf(':workout') > 0; })[0].amount, 120);
  var custom = xp.dayEntries(d, { goals: goals }, { stepsCap: 300, workoutCap: 200 });
  assert.strictEqual(custom.filter(function (x) { return x.ref.indexOf(':steps') > 0; })[0].amount, 300);
  assert.strictEqual(custom.filter(function (x) { return x.ref.indexOf(':workout') > 0; })[0].amount, 180);
});

test('regime, will, care, exploration, household', function () {
  var d = day({
    sleepMin: 460, bedtime: '23:45', screenMin: 200, socialMin: 60, lateMin: 0, waterMl: 2100, medsTaken: 2, medsLate: 1,
    known: { places: true, spend: true }, newPlaces: 0, farthestKm: 64, noSpend: true, budgetOk: true
  });
  var e = xp.dayEntries(d, { goals: goals, places: [{ id: 7, title: 'Сквер' }], newCells: 20 });
  var sum = function (skill) { return e.filter(function (x) { return x.skill === skill; }).reduce(function (s, x) { return s + x.amount; }, 0); };
  assert.strictEqual(sum('regime'), 40 + 20 + 10);
  assert.strictEqual(sum('will'), 20 + 20);
  assert.strictEqual(sum('care'), 5 + 10);
  assert.strictEqual(sum('exploration'), 30 + 150 + 50);
  assert.strictEqual(sum('household'), 15 + 10);
  assert.ok(e.some(function (x) { return x.ref === 'day:2026-11-13:place:7'; }));
});

test('refs are unique within a day (closing twice is caught by ref)', function () {
  var d = day({ steps: 9000, sleepMin: 460, bedtime: '00:10', habitIds: ['a', 'b'] });
  var refs = xp.dayEntries(d, { goals: goals }).map(function (e) { return e.ref; });
  assert.strictEqual(refs.length, new Set(refs).size);
});

test('comeback ×1.5 after 3 empty days or after a pause', function () {
  assert.strictEqual(xp.comeback('2026-11-13', '2026-11-09', null, 3), true);
  assert.strictEqual(xp.comeback('2026-11-13', '2026-11-10', null, 3), false);
  assert.strictEqual(xp.comeback('2026-11-13', '2026-11-12', '2026-11-12', 3), true);
  assert.strictEqual(xp.comeback('2026-11-13', null, null, 3), false);
  var d = day({ steps: 5000 });
  var e = xp.dayEntries(d, { goals: goals, bonus: true, bonusMult: 1.5 });
  assert.strictEqual(e[0].amount, 75);
  assert.ok(/×1,5/.test(e[0].reason));
  // The whole day's experience: achievements and quests closed that day get it too (main.close).
  var other = xp.applyComeback([{ skill: 'achievement', amount: 50, reason: 'ачивка «Неделя»' }, { skill: 'endurance', amount: 30, reason: 'квест' }], 1.5);
  assert.deepStrictEqual(other.map(function (x) { return x.amount; }), [75, 45]);
  assert.ok(/×1,5/.test(other[0].reason));
  assert.strictEqual(xp.applyComeback([{ amount: 10, reason: 'x' }], 1)[0].amount, 10, 'множитель 1 ничего не меняет');
});

test('levels: T(L) = round(120 × (L − 1)^1.6) and the doc\'s numbers', function () {
  assert.strictEqual(xp.threshold(1, 120, 1.6), 0);
  assert.strictEqual(xp.threshold(2, 120, 1.6), 120);
  assert.ok(Math.abs(xp.threshold(10, 120, 1.6) - 4030) < 15, 'level 10 ≈ 4 030: ' + xp.threshold(10, 120, 1.6));
  assert.ok(Math.abs(xp.threshold(20, 120, 1.6) - 13400) < 100);
  assert.ok(Math.abs(xp.threshold(50, 120, 1.6) - 60700) < 300);
  assert.ok(Math.abs(xp.threshold(100, 120, 1.6) - 187000) < 1000);
  var l = xp.level(4100, 120, 1.6);
  assert.strictEqual(l.level, 10);
  assert.ok(l.pct > 0 && l.pct < 1);
  assert.strictEqual(xp.level(0, 120, 1.6).level, 1);
});

test('a changed formula never lowers the shown level (max of old and new)', function () {
  var before = xp.level(5000, 120, 1.6).level;
  var after = xp.level(5000, 200, 1.8).level;
  assert.ok(after < before);
  assert.strictEqual(Math.max(before, after), before);
});

test('habit chains: grow, one freeze a week bridges a gap, a pause freezes them', function () {
  var chains = {};
  ['2026-11-09', '2026-11-10', '2026-11-11'].forEach(function (date) { xp.trackChains(chains, { date: date, habitIds: ['r'] }, 1); });
  assert.strictEqual(chains.r.days, 3);
  xp.trackChains(chains, { date: '2026-11-13', habitIds: ['r'] }, 1);          // missed the 12th: the freeze
  assert.strictEqual(chains.r.days, 4);
  assert.strictEqual(chains.r.freezesLeft, 0);
  xp.trackChains(chains, { date: '2026-11-14', habitIds: [], paused: 'sick' }, 1);
  xp.trackChains(chains, { date: '2026-11-15', habitIds: [], paused: 'sick' }, 1);
  xp.trackChains(chains, { date: '2026-11-16', habitIds: ['r'] }, 1);          // after the pause, new week
  assert.strictEqual(chains.r.days, 5);
  xp.trackChains(chains, { date: '2026-11-19', habitIds: ['r'] }, 1);          // two days missed: broken
  assert.strictEqual(chains.r.days, 1);
});

test('stages of the pet by level', function () {
  assert.strictEqual(xp.stage(1).name, 'sprout');
  assert.strictEqual(xp.stage(4).name, 'sprout');
  assert.strictEqual(xp.stage(5).name, 'two-leaves');
  assert.strictEqual(xp.stage(15).index, 2);
  assert.strictEqual(xp.stage(30).name, 'bud');
  assert.strictEqual(xp.stage(77).name, 'flower');
  assert.strictEqual(xp.stage(3, [1, 2, 3, 4, 5]).index, 2);
});

test('hasData', function () {
  assert.strictEqual(xp.hasData(day({ known: {} })), false);
  assert.strictEqual(xp.hasData(day({ waterMl: 250, known: {} })), true);
  assert.strictEqual(xp.hasData(day({ steps: 10 })), true);
});

test('dates used by the module', function () {
  assert.strictEqual(dates.monday('2026-11-15'), '2026-11-09');
  assert.strictEqual(dates.diff('2026-11-13', '2026-11-09'), 4);
});

console.log('xp: ' + passed + ' passed' + (process.exitCode ? ', some FAILED' : ''));
