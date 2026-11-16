// node tests/guess.test.js — промпты, разбор ответа модели, когда говорить вслух, автосудья.
var assert = require('assert');
var h = require('./harness.js');
var G = require('../guess.js');

h.test('промпт угадывания: отвергнутые, тепло, тема; загаданного слова нет', function () {
  var p = G.guessPrompt({ rejected: ['гора', 'свеча'], warm: 'башня', theme: 'предметы' });
  assert.ok(/рисунок пальцем/.test(p.system) && /одним существительным/.test(p.system));
  assert.ok(/Это точно не: гора, свеча/.test(p.prompt));
  assert.ok(/Тепло: «башня»/.test(p.prompt));
  assert.ok(/Тема: предметы/.test(p.prompt));
  assert.ok(/"confidence"/.test(p.prompt));
  var last = G.guessPrompt({ final: true, alternatives: 3 });
  assert.ok(/Последняя попытка/.test(last.prompt) && /3 варианта/.test(last.prompt));
  assert.ok(!/Тема/.test(G.guessPrompt({}).prompt));
});

h.test('разбор ответа', function () {
  assert.deepStrictEqual(G.parseGuess({ guess: 'Маяк!', confidence: 0.8, alternatives: ['башня', 'маяк', 'Свеча'], say: 'Это маяк?' }),
    { guess: 'маяк', confidence: 0.8, alternatives: ['башня', 'свеча'], say: 'Это маяк?' });
  assert.strictEqual(G.parseGuess({ guess: 'кот', confidence: 80 }).confidence, 0.8);
  assert.strictEqual(G.parseGuess({ guess: 'кот', confidence: 'много' }).confidence, 0.5);
  assert.strictEqual(G.parseGuess({ guess: 'кот', say: 'Я думаю что это скорее всего очень пушистый кот' }).say, 'Это кот?');
  assert.strictEqual(G.parseGuess('Ответ: {"guess": "ёлка", "confidence": 0.4}').guess, 'елка');
  assert.strictEqual(G.parseGuess('кошка').guess, 'кошка');
  assert.strictEqual(G.parseGuess({}), null);
  assert.strictEqual(G.parseGuess(null), null);
});

h.test('говорить вслух: порог, повтор, отвергнутое, устаревшее', function () {
  var g = { guess: 'маяк', confidence: 0.6 };
  var base = { threshold: 0.35, staleMs: 6000, snapshotAt: 0, now: 2000, lastSaid: '', rejected: [] };
  assert.ok(G.shouldSay(g, base));
  assert.ok(!G.shouldSay({ guess: 'маяк', confidence: 0.2 }, base), 'ниже порога');
  assert.ok(!G.shouldSay(g, Object.assign({}, base, { lastSaid: 'Маяк' })), 'то же самое');
  assert.ok(G.shouldSay(g, Object.assign({}, base, { lastSaid: 'маяк', noRepeat: false })), 'повтор разрешён');
  assert.ok(!G.shouldSay(g, Object.assign({}, base, { rejected: ['маяк'] })), 'отвергнуто');
  assert.ok(!G.shouldSay(g, Object.assign({}, base, { now: 7000 })), 'устарело: 7 с после снимка');
  assert.ok(!G.shouldSay(g, Object.assign({}, base, { voice: false })), 'без голоса');
});

h.test('автосудья: догадка, формы, альтернативы, синонимы', function () {
  var card = { word: 'кошка', forms: [], synonyms: ['кот'] };
  assert.ok(G.judge({ guess: 'кошка', alternatives: [] }, card).ok);
  assert.ok(G.judge({ guess: 'кошки', alternatives: [] }, card).ok, 'форма');
  var alt = G.judge({ guess: 'собака', alternatives: ['лиса', 'кошка'] }, card);
  assert.ok(alt.ok && !alt.first && alt.word === 'кошка', 'альтернатива');
  assert.ok(!G.judge({ guess: 'кот', alternatives: [] }, card).ok, 'синонимы выключены');
  assert.ok(G.judge({ guess: 'кот', alternatives: [] }, card, { synonyms: true }).ok, 'синонимы включены');
  assert.ok(G.judge({ guess: 'старый маяк', alternatives: [] }, { word: 'маяк' }).ok);
  assert.ok(!G.judge({ guess: 'гора', alternatives: ['свеча'] }, { word: 'маяк' }).ok);
  assert.ok(!G.judge(null, { word: 'маяк' }).ok);
});

h.test('промпт рисунка', function () {
  var p = G.paintPrompt('маяк', { strokesMin: 15, strokesMax: 40, maxPoints: 30 });
  assert.ok(/«маяк»/.test(p.prompt));
  assert.ok(/1000×1000/.test(p.prompt));
  assert.ok(/15–40 штрихов/.test(p.prompt));
  assert.ok(/M, L, Q, C/.test(p.prompt));
  assert.ok(/Без текста/.test(p.prompt));
  assert.ok(/JSON/.test(p.system));
  assert.ok(/не подошёл: мало штрихов/.test(G.paintPrompt('кот', { retry: 'мало штрихов' }).prompt));
});
