var assert = require('assert');
var h = require('./harness');
var settings = require('../settings');

h.test('нормализация пустого даёт значения по умолчанию', function () {
  assert.deepStrictEqual(settings.normalize({}), settings.defaults());
  assert.deepStrictEqual(settings.normalize(null), settings.defaults());
  assert.deepStrictEqual(settings.normalize(settings.defaults()), settings.defaults());
});

h.test('у каждой настройки есть группа, подпись и границы чисел', function () {
  var keys = {};
  settings.SCHEMA.forEach(function (item) {
    assert.ok(item.group && item.label, item.key);
    assert.ok(!keys[item.key], 'повтор ' + item.key);
    keys[item.key] = true;
    if (item.type === 'number') {
      assert.ok(item.min !== undefined && item.max !== undefined && item.step, item.key);
      assert.ok(item.def >= item.min && item.def <= item.max, item.key);
    }
    if (item.type === 'select') assert.ok(item.options.some(function (o) { return o[0] === item.def; }), item.key);
  });
  ['maxRequests', 'applyAttempts', 'minSide', 'maxBrightness', 'noRepeatDays', 'dhashDistance', 'otherPerHour', 'keepFiles', 'hingeShift']
    .forEach(function (key) { assert.ok(keys[key], key); });
});

h.test('числа: строка с запятой, границы, шаг', function () {
  var out = settings.normalize({ maxBrightness: '0,377', minSide: 99999, candidates: 3.6, hingeShift: 0.123, keepFiles: 'много' });
  assert.strictEqual(out.maxBrightness, 0.38);
  assert.strictEqual(out.minSide, 10000);
  assert.strictEqual(out.candidates, 4);
  assert.strictEqual(out.hingeShift, 0.12);
  assert.strictEqual(out.keepFiles, 30);
});

h.test('время: 7:05 → 07:05, неверное — по умолчанию', function () {
  assert.strictEqual(settings.time('7:05'), '07:05');
  assert.strictEqual(settings.time('24:00'), null);
  assert.strictEqual(settings.time('7:5'), null);
  var out = settings.normalize({ time: '8:30', retryUntil: 'полдень' });
  assert.strictEqual(out.time, '08:30');
  assert.strictEqual(out.retryUntil, '12:00');
  assert.strictEqual(settings.minutes('08:30'), 510);
});

h.test('желанная яркость не выше предела', function () {
  var out = settings.normalize({ maxBrightness: 0.2, targetBrightness: 0.5 });
  assert.strictEqual(out.targetBrightness, 0.2);
});

h.test('в шаблоне запроса всегда есть {topic}', function () {
  assert.strictEqual(settings.normalize({ queryTemplate: '{season} calm' }).queryTemplate, '{topic} {season} calm');
  assert.strictEqual(settings.normalize({ queryTemplate: '' }).queryTemplate, '{topic} {weather} {season}');
});

h.test('дни недели: только 1..7, без повторов, по порядку', function () {
  assert.deepStrictEqual(settings.normalize({ favoriteDays: [7, 0, 8, 6, '6', 2.2] }).favoriteDays, [2, 6, 7]);
  assert.deepStrictEqual(settings.normalize({ favoriteDays: [] }).favoriteDays, []);
  assert.deepStrictEqual(settings.normalize({ favoriteDays: 'сб' }).favoriteDays, [6, 7]);
});

h.test('выбор из списка: чужое значение — по умолчанию', function () {
  var out = settings.normalize({ foldMode: 'magic', shots: 'different', lockScreen: 'cover' });
  assert.strictEqual(out.foldMode, 'auto');
  assert.strictEqual(out.shots, 'different');
  assert.strictEqual(out.lockScreen, 'cover');
});

h.test('источники: незнакомые отброшены, недостающие включены', function () {
  var out = settings.normalize({ sources: { commons: false, flickr: true } });
  assert.strictEqual(out.sources.commons, false);
  assert.strictEqual(out.sources.openverse, true);
  assert.strictEqual(out.sources.flickr, undefined);
  assert.deepStrictEqual(Object.keys(out.sources), settings.SOURCE_IDS);
});

h.test('темы: запрос только латиницей, без пустых и повторов, вес в границах', function () {
  var out = settings.normalize({ topics: [
    { name: 'Море', query: 'Sea, ocean — waves!', weight: '2,5' },
    { name: 'море', query: 'sea', weight: 1 },
    { name: 'Пусто', query: 'море', weight: 1 },
    { name: '', query: 'forest' },
    { name: 'Город', query: 'city night', weight: -3, bright: 1 }
  ] });
  assert.deepStrictEqual(out.topics, [
    { name: 'Море', query: 'sea ocean waves', weight: 2.5, bright: false, space: false },
    { name: 'Город', query: 'city night', weight: 0, bright: true, space: false }
  ]);
  assert.deepStrictEqual(settings.normalize({ topics: [] }).topics, settings.DEFAULT_TOPICS);
});

h.test('текст обрезается по длине', function () {
  var long = new Array(200).join('я');
  assert.strictEqual(settings.normalize({ city: '  ' + long }).city.length, 80);
});

h.done(__filename);
