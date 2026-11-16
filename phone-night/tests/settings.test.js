// node tests/settings.test.js — defaults, clamping, times, choices, lists.
var assert = require('assert');
var settings = require('../settings');

var count = 0;
var failed = 0;
function test(name, fn) {
  count++;
  try {
    fn();
    console.log('ok ' + count + ' ' + name);
  } catch (error) {
    failed++;
    console.log('not ok ' + count + ' ' + name + '\n  ' + (error && error.stack ? error.stack.split('\n').slice(0, 3).join('\n  ') : error));
  }
}

test('defaults follow the description', function () {
  var d = settings.defaults();
  assert.strictEqual(d.nightStart, '23:00');
  assert.strictEqual(d.nightEnd, '07:00');
  assert.strictEqual(d.byScreen, true);
  assert.strictEqual(d.screenOffAfter, '22:00');
  assert.strictEqual(d.darkMinutes, 30);
  assert.strictEqual(d.morningAfter, '05:00');
  assert.strictEqual(d.notBeforeHours, 2);
  assert.strictEqual(d.style, 'nature');
  assert.strictEqual(d.notifyLines, 3);
  assert.strictEqual(d.wakeupThreshold, 5);
  assert.strictEqual(d.trafficMb, 5);
  assert.strictEqual(d.rawNights, 3);
  assert.strictEqual(d.reportDays, 365);
  assert.strictEqual(d.useModel, true);
  assert.deepStrictEqual(d.hidden, []);
  assert.strictEqual(d.eventDays, 30);
  assert.strictEqual(d.trendDays, 30);
  assert.strictEqual(d.tipNights, 3);
});

test('every schema item is complete', function () {
  var keys = {};
  settings.SCHEMA.forEach(function (item) {
    assert.ok(item.key && item.label && item.type && item.group, JSON.stringify(item));
    assert.ok(!keys[item.key], 'дважды ' + item.key);
    keys[item.key] = true;
    if (item.type === 'number') assert.ok(item.min !== undefined && item.max !== undefined, item.key);
    if (item.type === 'select') assert.ok(item.options.some(function (o) { return o[0] === item.def; }), item.key);
  });
});

test('normalize: clamps numbers, checks times and choices, parses lists', function () {
  var n = settings.normalize({
    darkMinutes: '1000', notifyLines: 0, notBeforeHours: '1,4', nightStart: '7:5', nightEnd: '6:30',
    style: 'poem', useModel: 'false', hidden: 'com.a.b\ncom.c.d, com.a.b', trafficMb: 'много'
  });
  assert.strictEqual(n.darkMinutes, 240);
  assert.strictEqual(n.notifyLines, 1);
  assert.strictEqual(n.notBeforeHours, 1.5);
  assert.strictEqual(n.nightStart, '23:00');
  assert.strictEqual(n.nightEnd, '06:30');
  assert.strictEqual(n.style, 'nature');
  assert.strictEqual(n.useModel, false);
  assert.deepStrictEqual(n.hidden, ['com.a.b', 'com.c.d']);
  assert.strictEqual(n.trafficMb, 5);
  assert.deepStrictEqual(settings.normalize(null), settings.defaults());
  assert.strictEqual(settings.time('24:00'), null);
  assert.strictEqual(settings.time('9.15'), '09:15');
});

test('links: on by default, the habit off until the owner turns it on; the habit name is text', function () {
  var d = settings.defaults();
  assert.deepStrictEqual([d.linkGames, d.linkSpending, d.linkFocus, d.linkSeries, d.morningBundle], [true, true, true, true, true]);
  assert.strictEqual(d.habitMark, false);
  assert.strictEqual(d.habitName, 'Ночь без телефона');
  assert.strictEqual(d.habitMaxUnlocks, 0);
  assert.strictEqual(d.linkMinMinutes, 1);
  var n = settings.normalize({ habitName: '  Без телефона ночью ', habitMaxUnlocks: 99, linkFocus: 'false' });
  assert.strictEqual(n.habitName, 'Без телефона ночью');
  assert.strictEqual(n.habitMaxUnlocks, 10);
  assert.strictEqual(n.linkFocus, false);
  assert.strictEqual(settings.normalize({ habitName: '   ' }).habitName, 'Ночь без телефона');
});

console.log((count - failed) + ' из ' + count + ' прошли');
if (failed) process.exitCode = 1;
