// node tests/words.test.js — запас слов, выбор без сети, настройки, общий match.js со Шляпой.
var assert = require('assert');
var fs = require('fs');
var path = require('path');
var h = require('./harness.js');
var M = require('../match.js');
var cards = require('../cards.js');
var C = require('../config.js');
var words = require('../words.json');

function all() {
  var out = [];
  for (let level = 1; level <= 5; level++) out = out.concat(words.levels[level]);
  return out;
}

h.test('запас: 5 уровней, кириллица, без повторов, темы — из уровней', function () {
  var list = all();
  assert.ok(list.length >= 180, 'слов: ' + list.length);
  var seen = {};
  list.forEach(function (word) {
    assert.ok(/^[а-яё ]+$/.test(word), word);
    assert.ok(!seen[M.normalize(word)], 'повтор ' + word);
    seen[M.normalize(word)] = true;
  });
  Object.keys(words.themes).forEach(function (theme) {
    assert.ok(C.THEMES.indexOf(theme) >= 0, 'тема ' + theme + ' есть на экране');
    words.themes[theme].forEach(function (word) { assert.ok(seen[M.normalize(word)], theme + ': ' + word + ' нет в уровнях'); });
  });
});

h.test('запас: слово не засчитывается за другое (кроме части словосочетания)', function () {
  var list = all();
  var clashes = [];
  list.forEach(function (a) {
    list.forEach(function (b) {
      if (a === b) return;
      if (a.indexOf(' ') >= 0 && a.split(' ').indexOf(b) >= 0) return;
      if (M.matches(a, b).ok) clashes.push(a + ' → ' + b);
    });
  });
  assert.deepStrictEqual(clashes, []);
});

h.test('выбор без сети: уровень, тема, без недавних', function () {
  var rnd = h.seeded(3);
  var easy = cards.offline(words, { difficulty: 1, count: 10 }, rnd);
  assert.strictEqual(easy.length, 10);
  easy.forEach(function (card) { assert.strictEqual(card.difficulty, 1); });
  var animals = cards.offline(words, { theme: 'животные', difficulty: 2, count: 12 }, rnd);
  animals.forEach(function (card) { assert.ok(words.themes['животные'].indexOf(card.word) >= 0, card.word); });
  var exclude = {};
  words.levels[1].forEach(function (word) { exclude[M.normalize(word)] = true; });
  cards.offline(words, { difficulty: 1, count: 10, exclude: exclude }, rnd).forEach(function (card) {
    assert.ok(!exclude[M.normalize(card.word)], 'недавнее: ' + card.word);
  });
  assert.strictEqual(cards.offline(words, { difficulty: 3, count: 500 }, rnd).length, all().length, 'больше запаса — весь запас');
});

h.test('карточка из генератора Шляпы', function () {
  assert.deepStrictEqual(cards.toCard('кот'), { word: 'кот', forms: [], roots: [], difficulty: 3 });
  var c = cards.toCard({ word: 'кошка', forms: ['кошки'], synonyms: ['кот'], difficulty: 1 });
  assert.deepStrictEqual(c.synonyms, ['кот']);
  assert.deepStrictEqual(c.forms, ['кошки']);
});

h.test('настройки: значения из описания и пределы', function () {
  var d = C.defaults();
  assert.strictEqual(d.drawSeconds, 90);
  assert.strictEqual(d.minInterval, 3);
  assert.strictEqual(d.pauseSend, 1.5);
  assert.strictEqual(d.minNewStrokes, 1);
  assert.strictEqual(d.imageSize, 384);
  assert.strictEqual(d.jpegQuality, 0.7);
  assert.strictEqual(d.maxRequests, 25);
  assert.strictEqual(d.sayThreshold, 0.35);
  assert.strictEqual(d.noRepeatSay, true);
  assert.strictEqual(d.paintSeconds, 45);
  assert.strictEqual(d.strokesMin, 15);
  assert.strictEqual(d.strokesMax, 40);
  assert.strictEqual(d.checkPaint, false);
  assert.strictEqual(d.stockSize, 20);
  assert.strictEqual(d.speedPoints, true);
  assert.strictEqual(d.localInterval, 8);
  var n = C.normalize({ jpegQuality: 0.72, pauseSend: 1.3, strokesMin: 50, strokesMax: 20, secret: 'self', players: [' Маша ', '', 'Петя'], difficulty: 9 });
  assert.strictEqual(n.jpegQuality, 0.7);
  assert.strictEqual(n.pauseSend, 1.5);
  assert.strictEqual(n.strokesMax, 50);
  assert.strictEqual(n.secret, 'self');
  assert.deepStrictEqual(n.players, ['Маша', 'Петя']);
  assert.strictEqual(n.difficulty, 2);
  C.SCHEMA.forEach(function (item) {
    if (typeof item.def === 'number') assert.ok(item.min <= item.def && item.def <= item.max, item.key);
  });
});

h.test('match.js — та же, что у Шляпы', function () {
  var mine = fs.readFileSync(path.join(__dirname, '..', 'match.js'), 'utf8');
  var hat = path.join(__dirname, '..', '..', 'hat', 'match.js');
  if (!fs.existsSync(hat)) return;
  assert.ok(mine === fs.readFileSync(hat, 'utf8'), 'копии match.js разошлись: правьте обе');
});

h.test('match.js: набор примеров Шляпы проходит и здесь', function () {
  var cases = path.join(__dirname, '..', '..', 'hat', 'cases.js');
  if (!fs.existsSync(cases)) return;
  var outcome = require(cases).run(M);
  assert.deepStrictEqual(outcome.failed, []);
});
