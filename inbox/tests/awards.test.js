// node tests/awards.test.js — the conditions of the inbox's achievements and their settings.
var assert = require('assert');
var t = require('./harness.js');
var awards = require('../logic/awards.js');
var settings = require('../logic/settings.js');

t.test('the thresholds are settings with defaults and bounds', function () {
  var s = settings.normalize({});
  assert.strictEqual(s.zeroMinMessages, 20);
  assert.strictEqual(s.answerMinChats, 3);
  assert.strictEqual(s.answerBy, '10:00');
  var odd = settings.normalize({ zeroMinMessages: 0, answerMinChats: 500, answerBy: '25:00' });
  assert.strictEqual(odd.zeroMinMessages, 1);
  assert.strictEqual(odd.answerMinChats, 50);
  assert.strictEqual(odd.answerBy, '10:00');
  assert.strictEqual(settings.apply({}, { answerBy: '09:30' }).answerBy, '09:30');
  assert.strictEqual(awards.minutes('09:30'), 570);
  assert.strictEqual(awards.minutes('нет'), null);
});

t.test('«Ноль входящих»: empty «Важно» and «Подождёт» on a busy day', function () {
  assert.ok(awards.zero({ important: 0, later: 0, noise: 4 }, 25, 20), 'noise does not count');
  assert.ok(!awards.zero({ important: 1 }, 25, 20), 'something important is still new');
  assert.ok(!awards.zero({ later: 2 }, 25, 20));
  assert.ok(!awards.zero({}, 5, 20), 'a quiet day is not an achievement');
});

t.test('«Ответил всем важным»: every important chat answered after its last message, before the hour', function () {
  var important = [{ chatId: 'a', time: 100 }, { chatId: 'b', time: 200 }, { chatId: 'c', time: 300 }];
  var sent = [{ chatId: 'a', sentAt: 150 }, { chatId: 'b', sentAt: 250 }, { chatId: 'c', sentAt: 350 }];
  assert.ok(awards.answered(important, sent, 3, 9 * 60, 600));
  assert.ok(!awards.answered(important, sent, 3, 10 * 60, 600), 'not after the hour');
  assert.ok(!awards.answered(important, sent, 4, 9 * 60, 600), 'too few important chats');
  assert.ok(!awards.answered(important, sent.slice(0, 2), 3, 9 * 60, 600), 'one chat without an answer');
  var early = [{ chatId: 'a', sentAt: 150 }, { chatId: 'b', sentAt: 250 }, { chatId: 'c', sentAt: 290 }];
  assert.ok(!awards.answered(important, early, 3, 9 * 60, 600), 'a new important message after the answer');
  assert.ok(!awards.answered(important, sent, 3, 9 * 60, null), 'no hour — no achievement');
});

t.run('awards');
