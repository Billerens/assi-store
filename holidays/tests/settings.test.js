// node tests/settings.test.js — the settings schema, defaults and reading a saved file back.
var assert = require('assert');
var settings = require('../settings.js');
var t = require('./harness.js');

var TYPES = ['number', 'bool', 'select', 'time', 'text', 'list'];

t.test('схема: у каждой настройки ключ, группа, подпись, тип и значение по умолчанию', function () {
  var seen = {};
  settings.SCHEMA.forEach(function (item) {
    assert.ok(item.key && item.group && item.label, JSON.stringify(item));
    assert.ok(TYPES.indexOf(item.type) >= 0, item.key + ': тип ' + item.type);
    assert.ok(item.def !== undefined, item.key + ': нет def');
    assert.ok(!seen[item.key], item.key + ': повтор');
    seen[item.key] = true;
    if (item.type === 'number') {
      assert.ok(typeof item.min === 'number' && typeof item.max === 'number' && item.step > 0, item.key + ': границы');
      assert.ok(item.def >= item.min && item.def <= item.max, item.key + ': def вне границ');
    }
    if (item.type === 'select') {
      assert.ok(item.options.some(function (option) { return option[0] === item.def; }), item.key + ': def не из вариантов');
    }
  });
});

t.test('все числа модуля вынесены в настройки', function () {
  ['motionSeconds', 'confettiSeconds', 'confettiPieces', 'confettiWindowMinutes', 'previewSeconds', 'upcomingDays',
    'remindDays', 'draftKeepDays', 'firstSnowDays', 'weatherEveryHours', 'weatherMaxAgeMinutes'].forEach(function (key) {
    assert.ok(settings.SCHEMA.some(function (item) { return item.key === key && item.type === 'number'; }), key);
  });
});

t.test('по умолчанию: полный декор, 60 дней вперёд, напоминание за день в 19:00, первый снег на 3 дня', function () {
  var values = settings.defaults();
  assert.strictEqual(values.strength, 'full');
  assert.strictEqual(values.powerSave, 'color');
  assert.strictEqual(values.upcomingDays, 60);
  assert.strictEqual(values.remindDays, 1);
  assert.strictEqual(values.remindTime, '19:00');
  assert.strictEqual(values.firstSnowDays, 3);
  assert.strictEqual(values.memoryLine, false);
  assert.deepStrictEqual(values.people, {});
  assert.deepStrictEqual(values.off, ['defender-day', 'womens-day', 'russia-day', 'unity-day', 'mothers-day']);
});

t.test('defaults() отдаёт копию: правка не портит схему', function () {
  var values = settings.defaults();
  values.off.push('new-year');
  assert.strictEqual(settings.defaults().off.indexOf('new-year'), -1);
});

t.test('числа зажимаются в границы, мусор — значение по умолчанию', function () {
  var values = settings.normalize({ motionSeconds: 500, confettiPieces: 1, upcomingDays: 'много', remindDays: '3', previewSeconds: 12.6 });
  assert.strictEqual(values.motionSeconds, 60);
  assert.strictEqual(values.confettiPieces, 5);
  assert.strictEqual(values.upcomingDays, 60);
  assert.strictEqual(values.remindDays, 3);
  assert.strictEqual(values.previewSeconds, 13);
});

t.test('время, выбор, флаги', function () {
  var values = settings.normalize({ remindTime: '7:30', dailyTime: '25:00', strength: 'loud', powerSave: 'off', greetVoice: 'true', closeStarred: 0 });
  assert.strictEqual(values.remindTime, '07:30');
  assert.strictEqual(values.dailyTime, '00:05');
  assert.strictEqual(values.strength, 'full');
  assert.strictEqual(values.powerSave, 'off');
  assert.strictEqual(values.greetVoice, true);
  assert.strictEqual(values.closeStarred, false);
});

t.test('список выключенных поводов: строкой или массивом, без пустых и повторов', function () {
  assert.deepStrictEqual(settings.normalize({ off: 'halloween, easter,,halloween' }).off, ['halloween', 'easter']);
  assert.deepStrictEqual(settings.normalize({ off: [] }).off, []);
});

t.test('окно первого снега: ММ-ДД, ошибка — по умолчанию', function () {
  var values = settings.normalize({ firstSnowAfter: '9-15', firstSnowUntil: '13-40' });
  assert.strictEqual(values.firstSnowAfter, '09-15');
  assert.strictEqual(values.firstSnowUntil, '12-31');
});

t.test('отметки людей: только известные поля, дни в границах', function () {
  var values = settings.normalize({ people: { 12: { remind: true, days: 99, name: 'Аня', extra: 'x' }, 13: { remind: 'yes' } } });
  assert.deepStrictEqual(values.people, { '12': { remind: true, days: 30, name: 'Аня' }, '13': {} });
});

t.test('пустой или сломанный файл — значения по умолчанию', function () {
  assert.deepStrictEqual(settings.normalize(null), settings.defaults());
  assert.deepStrictEqual(settings.normalize('мусор'), settings.defaults());
});

t.test('минуты от полуночи', function () {
  assert.strictEqual(settings.minutes('19:00'), 1140);
  assert.strictEqual(settings.minutes('00:05'), 5);
  assert.strictEqual(settings.minutes('нет'), 0);
});

t.done('settings');
