// node tests/awards.test.js — «Не забыл»: which drafts count as a greeting in time, and when nobody was forgotten.
var assert = require('assert');
var awards = require('../awards.js');
var t = require('./harness.js');

var PEOPLE = [
  { id: '12', name: 'Аня', close: true, birthday: { year: 1996, month: 11, day: 15 } },
  { id: '31', name: 'Петя', close: true, birthday: { year: null, month: 3, day: 2 } },
  { id: '40', name: 'Коллега', close: false, birthday: { year: null, month: 6, day: 1 } }
];

t.test('черновик засчитывается в день рождения или не раньше чем за awardEarlyDays', function () {
  var record = awards.normalize(null, '2026-01-01');
  assert.strictEqual(record.since, '2026-01-01');
  assert.strictEqual(awards.remember(record, '12', '2026-11-15', '2026-11-15', 14), true, 'в сам день');
  assert.strictEqual(awards.remember(record, '12', '2026-11-10', '2026-11-15', 14), false, 'уже есть');
  assert.strictEqual(awards.remember(record, '31', '2027-02-01', '2027-03-02', 14), false, 'слишком рано');
  assert.strictEqual(awards.remember(record, '31', '2027-02-20', '2027-03-02', 14), true);
  assert.deepStrictEqual(Object.keys(record.greeted).sort(), ['12:2026-11-15', '31:2027-03-02']);
});

t.test('все близкие за год поздравлены — да; один забыт — нет; не близкие не считаются', function () {
  var record = { since: '2026-01-01', greeted: { '12:2026-11-15': '2026-11-14', '31:2027-03-02': '2027-03-01' } };
  var got = awards.check(PEOPLE, record, '2027-11-10', 365, 2);
  assert.strictEqual(got.ok, true);
  assert.strictEqual(got.due, 2);
  assert.strictEqual(got.people, 2);
  delete record.greeted['31:2027-03-02'];
  got = awards.check(PEOPLE, record, '2027-11-10', 365, 2);
  assert.strictEqual(got.ok, false);
  assert.deepStrictEqual(got.missed, ['Петя']);
});

t.test('счёт должен покрывать весь срок, и близких — не меньше awardMinPeople', function () {
  var record = { since: '2027-01-01', greeted: { '12:2026-11-15': '2026-11-14', '31:2027-03-02': '2027-03-01' } };
  assert.strictEqual(awards.check(PEOPLE, record, '2027-11-10', 365, 2).tracked, false);
  record.since = '2026-01-01';
  assert.strictEqual(awards.check(PEOPLE, record, '2027-11-10', 365, 3).ok, false, 'мало близких');
  var onTheDay = awards.check(PEOPLE, record, '2027-11-15', 365, 2);
  assert.strictEqual(onTheDay.due, 2, 'сегодняшний день рождения ещё впереди: в счёт идёт прошлогодний');
  assert.strictEqual(onTheDay.ok, true);
});

t.done('awards');
