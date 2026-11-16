// node tests/match.test.js — сравнение услышанного со словом (match.js) на наборе cases.js
// и на всём запасном словаре: ни одно слово не должно засчитываться за другое.
var assert = require('assert');
var h = require('./harness.js');
var match = require('../match.js');
var cases = require('../cases.js');
var words = require('../words.json');

h.test('весь набор примеров cases.js', function () {
  var outcome = cases.run(match);
  assert.ok(outcome.total >= 200, 'примеров: ' + outcome.total);
  assert.deepStrictEqual(outcome.failed, []);
});

h.test('в каждой группе — не меньше 30 примеров (кроме склеек и синонимов)', function () {
  cases.groups.forEach(function (group) {
    if (/разрезанное|синоним/.test(group.name)) return;
    assert.ok(group.cases.length >= 30, group.name + ': ' + group.cases.length);
  });
});

h.test('нормализация', function () {
  assert.strictEqual(match.normalize('Ёлка-палка, ЁЖ!'), 'елка палка еж');
  assert.strictEqual(match.normalize('  «Холодильник»?! '), 'холодильник');
  assert.strictEqual(match.normalize('101 далматинец'), 'сто один далматинец');
  assert.deepStrictEqual(match.tokens('это же — холодильник!'), ['это', 'же', 'холодильник']);
});

h.test('числа словами', function () {
  assert.strictEqual(match.numberWords('7'), 'семь');
  assert.strictEqual(match.numberWords('12'), 'двенадцать');
  assert.strictEqual(match.numberWords('40'), 'сорок');
  assert.strictEqual(match.numberWords('2024'), 'две тысячи двадцать четыре');
  assert.strictEqual(match.numberWords('1000'), 'одна тысяча');
});

h.test('латиница и цифры', function () {
  assert.ok(match.foreign('iPhone'));
  assert.ok(match.foreign('кошка 2'));
  assert.ok(!match.foreign('железная дорога'));
});

h.test('формы по правилам склонения', function () {
  var has = function (word, form) {
    assert.ok(match.inflect(word).indexOf(form) >= 0, word + ' → ' + form + ': ' + match.inflect(word).join(', '));
  };
  has('кошка', 'кошек');
  has('кошка', 'кошкой');
  has('окно', 'окон');
  has('стол', 'столами');
  has('мяч', 'мячи');
  has('книга', 'книги');
  has('музей', 'музеями');
  has('конь', 'конём'.replace('ё', 'е'));
  has('потолок', 'потолка');
  has('отец', 'отцы');
  has('время', 'времени');
  has('имя', 'именем');
  has('здание', 'зданиях');
  has('котенок', 'котята');
  has('человек', 'люди');
  has('ребенок', 'детьми');
  has('мать', 'матери');
  has('дерево', 'деревья');
});

h.test('формы прилагательных для словосочетаний', function () {
  var forms = match.adjectiveForms('железная');
  ['железной', 'железную', 'железные'].forEach(function (form) {
    assert.ok(forms.indexOf(form) >= 0, form + ': ' + forms.join(', '));
  });
});

h.test('расстояние: созвучные буквы дешевле, предел', function () {
  assert.strictEqual(match.levenshtein('мотоцикл', 'мотоцикл', 2, true), 0);
  assert.strictEqual(match.levenshtein('мотоцыкл', 'мотоцикл', 2, true), 1);
  assert.ok(match.levenshtein('малина', 'машина', 1, true) > 1, 'л/ш не созвучны');
  assert.ok(match.levenshtein('абвгд', 'еёжзи', 2, false) > 2, 'предел');
});

h.test('одно ли слово: формы, ё, регистр', function () {
  assert.ok(match.sameWord('Холодильник', 'холодильники'));
  assert.ok(match.sameWord('ёлка', 'елки'));
  assert.ok(match.sameWord('железная дорога', 'железные дороги'));
  assert.ok(!match.sameWord('кошка', 'окошко'));
  assert.ok(!match.sameWord('машина', 'малина'));
});

h.test('короткие слова — только отдельным словом', function () {
  assert.ok(!match.matches('китайский', 'кит').ok);
  assert.ok(!match.matches('соковыжималка', 'сок').ok);
  assert.ok(match.matches('это сок', 'сок').ok);
});

h.test('без форм и без опечаток — только точно', function () {
  assert.ok(!match.matches('холодильником', 'холодильник', { forms: false, typos: false }).ok);
  assert.ok(match.matches('холодильник', 'холодильник', { forms: false, typos: false }).ok);
  assert.ok(!match.matches('мотоцыкл', 'мотоцикл', { typos: false }).ok);
});

h.test('запасной словарь: ни одно слово не засчитывается за другое', function () {
  var all = [];
  Object.keys(words).forEach(function (key) {
    if (/^\d$/.test(key)) all = all.concat(words[key]);
  });
  assert.ok(all.length >= 600, 'слов: ' + all.length);
  var clashes = [];
  for (let i = 0; i < all.length; i++) {
    for (let k = 0; k < all.length; k++) {
      if (i !== k && match.matches(all[i], all[k]).ok) clashes.push(all[i] + ' → ' + all[k]);
    }
  }
  assert.deepStrictEqual(clashes, []);
});

h.test('запасной словарь: формы слов из выборки не засчитываются за другие слова', function () {
  var all = [];
  Object.keys(words).forEach(function (key) {
    if (/^\d$/.test(key)) all = all.concat(words[key]);
  });
  // Полный перебор (все формы всех слов) идёт около минуты — здесь каждое 7-е слово.
  var sample = all.filter(function (word, index) { return index % 7 === 0 && word.indexOf(' ') < 0; });
  var clashes = [];
  sample.forEach(function (word) {
    match.inflect(word).forEach(function (form) {
      all.forEach(function (other) {
        if (other === word) return;
        if (match.matches(form, other).ok && !match.sameWord(word, other)) clashes.push(form + ' (' + word + ') → ' + other);
      });
    });
  });
  assert.deepStrictEqual(clashes, []);
});
