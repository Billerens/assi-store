// node tests/deck.test.js — колода: промпт, проверка ответа модели, запасной словарь, свои слова.
var assert = require('assert');
var h = require('./harness.js');
var D = require('../deck.js');
var M = require('../match.js');
var words = require('../words.json');

h.test('промпт: тема, сложность, формат, «не повторяй»', function () {
  var p = D.prompt({ theme: 'кино', difficulty: 4, count: 60, recent: ['холодильник', 'кошка'] });
  assert.ok(/60 слов/.test(p.prompt));
  assert.ok(/«кино»/.test(p.prompt));
  assert.ok(/Сложность 4 из 5/.test(p.prompt));
  assert.ok(/ностальгия, монополия, акведук/.test(p.prompt));
  assert.ok(/имена собственные можно/.test(p.prompt));
  assert.ok(/Не повторяй эти слова: холодильник, кошка/.test(p.prompt));
  assert.ok(/"forms"/.test(p.prompt) && /"roots"/.test(p.prompt));
  assert.ok(/JSON/.test(p.system));
  var general = D.prompt({ theme: 'общее', difficulty: 2, count: 10 });
  assert.ok(!/на тему/.test(general.prompt));
  assert.ok(/без имён собственных/.test(general.prompt));
  assert.ok(/Без грубых/.test(general.prompt));
  assert.ok(/мат/.test(D.prompt({ count: 5, adult: true }).prompt));
  assert.ok(/нарисовать/.test(D.prompt({ count: 5, drawable: true }).prompt));
  assert.ok(/synonyms/.test(D.prompt({ count: 5, synonyms: true }).prompt));
});

h.test('проверка ответа: дубли, история, латиница, длина, больше двух слов', function () {
  var made = D.clean({ words: [
    { word: ' Холодильник ', forms: ['холодильника', 'fridge'], roots: ['холод'], difficulty: 9 },
    { word: 'холодильники' },
    'железная дорога',
    { word: 'железные дороги' },
    { word: 'Wi-Fi' },
    { word: 'R2D2' },
    { word: 'превысокомногорассмотрительствующий' },
    { word: 'очень большая собака' },
    { word: 'сквозняк' },
    { word: '' },
    null
  ] }, { exclude: { 'сквозняк': true }, maxLetters: 24, difficulty: 3 });
  assert.deepStrictEqual(made.cards.map(function (c) { return c.word; }), ['холодильник', 'железная дорога']);
  assert.deepStrictEqual(made.cards[0].forms, ['холодильника'], 'латиница в формах отброшена');
  assert.strictEqual(made.cards[0].difficulty, 5);
  var reasons = {};
  made.dropped.forEach(function (item) { reasons[item.why] = (reasons[item.why] || 0) + 1; });
  assert.strictEqual(reasons['повтор'], 2);
  assert.strictEqual(reasons['латиница или цифры'], 2);
  assert.strictEqual(reasons['длинное'], 1);
  assert.strictEqual(reasons['больше двух слов'], 1);
  assert.strictEqual(reasons['уже было'], 1);
  assert.strictEqual(reasons['пусто'], 2);
});

h.test('проверка ответа: не больше нужного и с учётом уже набранного', function () {
  var made = D.clean({ words: ['кошка', 'собака', 'мышь', 'лошадь'] }, { have: [{ word: 'собаки' }], count: 2 });
  assert.deepStrictEqual(made.cards.map(function (c) { return c.word; }), ['кошка', 'мышь']);
  assert.deepStrictEqual(D.clean('ерунда', {}).cards, []);
  assert.deepStrictEqual(D.clean(['кот'], {}).cards.map(function (c) { return c.word; }), ['кот']);
});

h.test('словарь: 5 уровней, всё кириллицей, без повторов', function () {
  var all = [];
  for (let level = 1; level <= 5; level++) {
    assert.ok(words[level].length >= 100, 'уровень ' + level + ': ' + words[level].length);
    all = all.concat(words[level]);
  }
  var seen = {};
  all.forEach(function (word) {
    assert.ok(!M.foreign(word), word);
    assert.ok(/^[а-яё ]+$/.test(word), word);
    var plain = M.normalize(word);
    assert.ok(!seen[plain], 'повтор ' + word);
    seen[plain] = true;
  });
});

h.test('словарь: колода нужного уровня, без сыгранного', function () {
  var exclude = {};
  words[2].slice(0, 50).forEach(function (word) { exclude[M.normalize(word)] = true; });
  var cards = D.offline(words, { difficulty: 2, count: 60, exclude: exclude }, h.seeded(4));
  assert.strictEqual(cards.length, 60);
  cards.forEach(function (card) {
    assert.ok(!exclude[M.normalize(card.word)], 'сыгранное: ' + card.word);
    assert.strictEqual(card.difficulty, 2);
  });
});

h.test('словарь: не хватает уровня — соседние, всё сыграно — повтор', function () {
  var cards = D.offline(words, { difficulty: 5, count: 200 }, h.seeded(1));
  assert.strictEqual(cards.length, 200);
  assert.ok(cards.some(function (card) { return card.difficulty === 4; }));
  var everything = {};
  for (let level = 1; level <= 5; level++) words[level].forEach(function (word) { everything[M.normalize(word)] = true; });
  var replay = D.offline(words, { difficulty: 3, count: 20, exclude: everything }, h.seeded(2));
  assert.strictEqual(replay.length, 20);
});

h.test('словарь: добавки владельца участвуют', function () {
  var tiny = { 1: ['кошка'], 2: [], 3: [], 4: [], 5: [] };
  var cards = D.offline(tiny, { difficulty: 1, count: 3, extra: { 1: ['собака', 'мышь'] } }, h.seeded(3));
  assert.deepStrictEqual(cards.map(function (c) { return c.word; }).sort(), ['кошка', 'мышь', 'собака']);
});

h.test('свои слова: формы из ответа модели', function () {
  var cards = [{ word: 'кошка', owner: 'Маша' }, { word: 'тапок', owner: 'Петя' }];
  var made = D.applyForms(cards, { words: [{ word: 'Кошка', forms: ['кошки', 'кошку'], roots: ['кош'] }] });
  assert.deepStrictEqual(made[0].forms, ['кошки', 'кошку']);
  assert.strictEqual(made[0].owner, 'Маша');
  assert.strictEqual(made[1], cards[1]);
  assert.ok(/кошка/.test(D.formsPrompt(['кошка', 'тапок']).prompt));
});

h.test('свои слова: повторы и мусор подсвечиваются', function () {
  assert.strictEqual(D.ownWordProblem('кошки', ['кошка', 'дом'], 24), 'это слово уже есть, выберите другое');
  assert.strictEqual(D.ownWordProblem('Ёлка', ['елки'], 24), 'это слово уже есть, выберите другое');
  assert.strictEqual(D.ownWordProblem('кот', ['кошка'], 24), '');
  assert.strictEqual(D.ownWordProblem('abc', [], 24), 'только русские буквы, без цифр');
  assert.strictEqual(D.ownWordProblem('   ', [], 24), 'пусто');
  assert.strictEqual(D.ownWordProblem('превысокомногорассмотрительствующий', [], 24), 'слишком длинное');
});
