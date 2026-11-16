// node tests/awards.test.js — «Неделя без единой попытки отвлечься»: the condition and its settings.
var assert = require('assert');
var t = require('./harness.js');
var awards = require('../logic/awards.js');
var settingsLib = require('../logic/settings.js');

var DAY = 86400000;
var NOW = new Date(2026, 10, 14, 20, 0, 0).getTime();

function sessions(daysAgo, attempts) {
  return daysAgo.map(function (n, i) { return { startAt: NOW - n * DAY - 3600000, blockedAttempts: attempts ? attempts[i] : 0 }; });
}

t.test('the thresholds are settings', function () {
  var s = settingsLib.normalize({});
  assert.strictEqual(s.quietDays, 7);
  assert.strictEqual(s.quietMinDays, 5);
  assert.strictEqual(settingsLib.normalize({ quietDays: 1 }).quietDays, 3);
});

t.test('a week of counted sessions without a single attempt', function () {
  var got = awards.quiet(sessions([0, 1, 2, 4, 5]), NOW, 7, 5);
  assert.deepStrictEqual(got, { ok: true, days: 5, attempts: 0 });
});

t.test('one attempt, too few days, or old sessions — no achievement', function () {
  assert.strictEqual(awards.quiet(sessions([0, 1, 2, 4, 5], [0, 0, 1, 0, 0]), NOW, 7, 5).ok, false, 'an attempt');
  assert.strictEqual(awards.quiet(sessions([0, 0, 1, 1, 2]), NOW, 7, 5).ok, false, 'three days only');
  assert.strictEqual(awards.quiet(sessions([0, 1, 2, 4, 9]), NOW, 7, 5).ok, false, 'one is older than the week');
  assert.strictEqual(awards.quiet([], NOW, 7, 5).ok, false);
});

t.run('awards');
