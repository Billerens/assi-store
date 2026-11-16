// node tests/daily.test.js — «рисунок дня» для «Игры дня»: рисунок откладывается из запаса (или
// рисуется, если запас пуст), обычные раунды его не берут, раунд ?daily=1 берёт именно его.
var assert = require('assert');
var h = require('./harness.js');
var S = require('./sandbox.js');
var samples = require('../samples.js');

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function today() {
  var d = new Date();
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

function stock() {
  return [
    { id: 1, word: 'маяк', strokes: '[]', used_at: null },
    { id: 2, word: 'кит', strokes: '[]', used_at: null }
  ];
}

h.test('рисунок дня из запаса: старый первым, слово не отдаётся, второй заказ — тот же', function () {
  var phone = S.make({ drawings: stock() });
  var got = phone.main.dayDrawing(today());
  assert.strictEqual(got.ready, true);
  assert.strictEqual(got.played, false);
  assert.strictEqual(got.open, 'modules/draw-guess/ui/index.html?daily=1');
  assert.ok(!('word' in got), 'загадку не выдаём');
  assert.ok(!/маяк/.test(JSON.stringify(got)));
  assert.strictEqual(JSON.parse(phone.disk['data/draw-guess/daily.json']).id, 1);
  assert.deepStrictEqual(plain(phone.main.dayDrawing(today())), plain(got));
});

h.test('отложенный рисунок обычный раунд не берёт, раунд дня — берёт один раз', function () {
  var phone = S.make({ drawings: stock() });
  phone.main.dayDrawing(today());
  var usual = phone.main.takeDrawing({});
  assert.strictEqual(usual.word, 'кит', 'обычный раунд взял отложенный');
  var phone2 = S.make({ drawings: stock() });
  phone2.main.dayDrawing(today());
  var daily = phone2.main.takeDrawing({ daily: true });
  assert.strictEqual(daily.word, 'маяк');
  assert.strictEqual(daily.daily, true);
  assert.strictEqual(phone2.main.dayDrawing(today()).played, true);
  assert.strictEqual(phone2.main.takeDrawing({ daily: true }).word, 'кит', 'второй раз — обычный из запаса');
});

h.test('итог раунда дня запоминается: «Игра дня» видит «Угадан»', function () {
  var phone = S.make({ drawings: stock() });
  phone.main.dayDrawing(today());
  phone.main.takeDrawing({ daily: true });
  phone.main.saveRound({ mode: 'model_draws', word: 'маяк', result: 'guessed', daily: true });
  var got = phone.main.dayDrawing(today());
  assert.strictEqual(got.result, 'guessed');
  assert.strictEqual(got.text, 'Угадан');
});

h.test('запас пуст: рисует сейчас; модель не ответила — честное «нет» без отложенного', function () {
  var painted = S.make({ drawings: [], ai: { ask: function () { return samples.painting(); } } });
  var got = painted.main.dayDrawing(today());
  assert.strictEqual(got.ready, true, JSON.stringify(got));
  assert.ok(painted.sql.some(function (entry) { return /^insert into drawings/.test(entry[0]); }));
  var broken = S.make({ drawings: [], ai: { ask: function () { throw new Error('нет сети'); } } });
  var none = broken.main.dayDrawing(today());
  assert.strictEqual(none.ready, false);
  assert.ok(/нет сети/.test(none.why));
  assert.ok(!broken.disk['data/draw-guess/daily.json']);
});

h.test('peek ничего не заказывает; настройка выключена — рисунка дня нет', function () {
  var phone = S.make({ drawings: stock() });
  assert.strictEqual(phone.main.dayDrawing(today(), { peek: true }).ready, false);
  assert.ok(!phone.disk['data/draw-guess/daily.json']);
  var off = S.make({ drawings: stock(), disk: { 'data/draw-guess/settings.json': JSON.stringify({ dailyDrawing: false }) } });
  var got = off.main.dayDrawing(today());
  assert.strictEqual(got.ready, false);
  assert.ok(/выключен/.test(got.why));
});

h.test('рисунок дня открывается на экране с ?daily=1', function () {
  var phone = S.make({});
  phone.main.openDaily();
  assert.deepStrictEqual(phone.opened, ['modules/draw-guess/ui/index.html?daily=1']);
});
