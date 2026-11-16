// node tests/config.test.js — настройки: значения по описанию, пределы, параметры сравнения.
var assert = require('assert');
var h = require('./harness.js');
var C = require('../config.js');

h.test('значения по умолчанию — как в описании модуля', function () {
  var d = C.defaults();
  assert.strictEqual(d.turnSeconds, 60);
  assert.strictEqual(d.rounds, 3);
  assert.strictEqual(d.wordsPerPlayer, 8);
  assert.strictEqual(d.difficulty, 3);
  assert.strictEqual(d.skipPenalty, 0);
  assert.strictEqual(d.lastWordSeconds, 3);
  assert.strictEqual(d.autoVoice, true);
  assert.strictEqual(d.chunkSeconds, 4);
  assert.strictEqual(d.undoSeconds, 5);
  assert.strictEqual(d.noRepeat, 3000);
  assert.strictEqual(d.allowForms, true);
  assert.strictEqual(d.allowTypos, true);
  assert.strictEqual(d.adultWords, false);
  assert.strictEqual(d.quietWhileListening, true);
  assert.strictEqual(d.mode, 'pairs');
  assert.strictEqual(d.theme, 'общее');
});

h.test('у каждой числовой настройки есть пределы и шаг, значение в пределах', function () {
  var keys = {};
  C.SCHEMA.forEach(function (item) {
    assert.ok(!keys[item.key], 'повтор ключа ' + item.key);
    keys[item.key] = true;
    assert.ok(item.title && item.group, item.key);
    if (typeof item.def === 'number') {
      assert.ok(item.min <= item.def && item.def <= item.max && item.step > 0, item.key);
    }
  });
});

h.test('пределы и типы при сохранении', function () {
  var s = C.normalize({ turnSeconds: 7, rounds: '2', autoVoice: 'false', noRepeat: 1234, typoLength1: 9, typoLength2: 6, unknown: 5, mode: 'x', teamCount: 9 });
  assert.strictEqual(s.turnSeconds, 20);
  assert.strictEqual(s.rounds, 2);
  assert.strictEqual(s.autoVoice, false);
  assert.strictEqual(s.noRepeat, 1000);
  assert.strictEqual(s.typoLength2, 9, 'вторая граница не ниже первой');
  assert.strictEqual(s.unknown, undefined);
  assert.strictEqual(s.mode, 'pairs');
  assert.strictEqual(s.teamCount, 2);
  assert.strictEqual(C.normalize({ theme: '  космос ' }).theme, 'космос');
  assert.strictEqual(C.normalize({ turnSeconds: 'abc' }).turnSeconds, 60);
});

h.test('параметры сравнения слов из настроек', function () {
  var o = C.matchOptions(C.normalize({ allowForms: false, typoLength1: 7, phraseWindow: 3 }));
  assert.deepStrictEqual(o, { forms: false, typos: true, fuzzy1: 7, fuzzy2: 10, sound: true, window: 3 });
});

h.test('темы — как на экране подготовки', function () {
  assert.deepStrictEqual(C.THEMES, ['общее', 'кино', 'еда', 'природа', 'профессии', 'IT', 'история']);
});
