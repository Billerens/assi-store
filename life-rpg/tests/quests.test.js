// node tests/quests.test.js — quest targets from the owner's median, progress, picking.
var assert = require('assert');
var quests = require('../quests.js');
var dates = require('../dates.js');
var templates = require('../quests.json');

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

function history(n, make) {
  var out = [];
  for (var i = 0; i < n; i++) {
    var d = Object.assign({ date: dates.add('2026-10-16', i), habitIds: [], known: { steps: true, sleep: true, screen: true, places: true, spend: false } }, make(i));
    out.push(d);
  }
  return out;
}

var goals = { steps: 8000, sleep: 450, bedtime: '00:00', water: 2000, socialLimit: 90 };
var byId = {};
templates.forEach(function (t) { byId[t.id] = t; });

test('every template is well formed', function () {
  var ids = {};
  templates.forEach(function (t) {
    assert.ok(t.id && !ids[t.id], 'id ' + t.id);
    ids[t.id] = true;
    assert.ok(t.metric === 'habit' || quests.METRICS[t.metric], 'metric ' + t.metric);
    assert.ok(t.period === 'day' || t.period === 'week');
    assert.ok(t.xp > 0);
    assert.ok(/\{target\}|\{times\}|\{habit\}/.test(t.title) || typeof t.target === 'number', t.id);
  });
});

test('median and targets: «на тысячу больше обычного»', function () {
  assert.strictEqual(quests.median([3, 1, 2]), 2);
  assert.strictEqual(quests.median([1, 2, 3, 4]), 2.5);
  var h = history(28, function (i) { return { steps: 6000 + (i % 5) * 200 }; });
  assert.strictEqual(quests.target(byId['steps-more'], h, goals, 7), 6400 + 1000);
  assert.strictEqual(quests.target(byId['steps-goal'], h, goals, 7), 8000);
  assert.strictEqual(quests.target(byId['steps-week'], h, goals, 7), Math.round(6400 * 7 * 1.1 / 100) * 100);
  assert.strictEqual(quests.target(byId['steps-more'], h.slice(0, 5), goals, 7), null, 'too little data');
});

test('a bedtime quest shows a clock time', function () {
  var h = history(14, function () { return { bedtime: '00:40', sleepMin: 420 }; });
  var target = quests.target(byId['bed-earlier'], h, goals, 7);
  assert.strictEqual(dates.hhmm(target - 720), '00:10');
  assert.strictEqual(quests.title(byId['bed-earlier'], target), 'Лечь до 00:10 — на полчаса раньше обычного');
  assert.strictEqual(quests.title(byId['bed-early'], quests.target(byId['bed-early'], h, goals, 7)), 'Отбой до 00:00');
});

test('progress of day and week quests', function () {
  var q = quests.make(byId['steps-more'], 7400, '2026-11-13', '2026-11-13');
  assert.deepStrictEqual(quests.progress(q, [{ date: '2026-11-13', steps: 8000, known: { steps: true } }]).done, true);
  assert.strictEqual(quests.progress(q, [{ date: '2026-11-13', known: { steps: false } }]).known, false);
  var w = quests.make(byId['sleep-week'], 450, '2026-11-09', '2026-11-15');
  var days = history(7, function (i) { return { date: dates.add('2026-11-09', i), sleepMin: i < 5 ? 460 : 400 }; });
  var got = quests.progress(w, days);
  assert.strictEqual(got.progress, 5);
  assert.strictEqual(got.done, true);
  var sum = quests.make(byId['steps-week'], 50000, '2026-11-09', '2026-11-15');
  assert.strictEqual(quests.progress(sum, history(7, function (i) { return { date: dates.add('2026-11-09', i), steps: 7000 }; })).progress, 49000);
});

test('picking: steady for a seed, different skills first, nothing unverifiable', function () {
  var h = history(28, function (i) { return { steps: 7000 + i * 10, sleepMin: 430, bedtime: '00:20', screenMin: 220, socialMin: 70, lateMin: 5, waterMl: 1500 }; });
  var env = { templates: templates, history: h, goals: goals, habits: [{ id: 'read', title: 'Чтение' }], period: 'day', start: '2026-11-13', end: '2026-11-13', count: 3, seed: 'x', minDays: 7 };
  var a = quests.pick(env);
  var b = quests.pick(env);
  assert.strictEqual(a.length, 3);
  assert.deepStrictEqual(a.map(function (q) { return q.id; }), b.map(function (q) { return q.id; }));
  var skills = a.map(function (q) { return /^habit:/.test(q.skill) ? 'habit' : q.skill; });
  assert.strictEqual(new Set(skills).size, 3);
  assert.ok(a.every(function (q) { return q.template !== 'workout' && q.template !== 'focus' && q.template !== 'no-spend'; }), 'no workouts, focus or spending data');
  var skipped = quests.pick(Object.assign({}, env, { skip: a.map(function (q) { return q.template; }) }));
  assert.ok(skipped.every(function (q) { return a.map(function (x) { return x.template; }).indexOf(q.template) < 0; }));
});

test('a habit already done daily gets no quest', function () {
  var h = history(20, function () { return { habitIds: ['read'] }; });
  var env = { templates: [byId.habit], history: h, goals: goals, habits: [{ id: 'read', title: 'Чтение' }, { id: 'run', title: 'Бег' }], period: 'day', start: '2026-11-13', end: '2026-11-13', count: 3, seed: 'y' };
  var got = quests.pick(env);
  assert.deepStrictEqual(got.map(function (q) { return q.metric; }), ['habit:run']);
  assert.strictEqual(got[0].title, 'Отметить «Бег»');
  assert.strictEqual(got[0].skill, 'habit:run');
  assert.strictEqual(quests.value('habit:run', { habitIds: ['run'] }).value, 1);
});

console.log('quests: ' + passed + ' passed' + (process.exitCode ? ', some FAILED' : ''));
