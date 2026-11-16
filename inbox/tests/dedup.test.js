// node tests/dedup.test.js
var assert = require('assert');
var t = require('./harness.js');
var dedup = require('../logic/dedup.js');

var SETTINGS = { repeatWindowHours: 6, editWindowSec: 120, editSimilarity: 0.5 };
var stored = [];
var nextId = 1;

// A small model of the store: what main.js does with the verdicts.
function feed(sender, text, time, msgTime) {
  var message = { sender: sender, text: text, time: time, msgTime: msgTime || null, hash: dedup.hash('p', 'c', sender, text) };
  var recent = stored.slice().sort(function (a, b) { return b.time - a.time; });
  var verdict = dedup.classify(message, recent, SETTINGS);
  if (verdict.kind === 'new') {
    stored.push({ id: nextId++, sender: sender, text: verdict.text, time: time, msgTime: message.msgTime, hash: dedup.hash('p', 'c', sender, verdict.text) });
  } else if (verdict.kind === 'edit') {
    stored.forEach(function (old) {
      if (old.id === verdict.of) {
        old.text = text;
        old.hash = message.hash;
        old.edited = true;
      }
    });
  }
  return verdict.kind;
}

function reset() {
  stored = [];
  nextId = 1;
}

t.test('three messages a second apart are three, the updates in between are repeats', function () {
  reset();
  assert.strictEqual(feed('Петя', 'Привет', 0), 'new');
  assert.strictEqual(feed('Петя', 'Привет', 300), 'repeat');
  assert.strictEqual(feed('Петя', 'Ты где?', 1000), 'new');
  assert.strictEqual(feed('Петя', 'Ты где?', 1200), 'repeat');
  assert.strictEqual(feed('Петя', 'Позвони, как сможешь', 2000), 'new');
  assert.strictEqual(stored.length, 3);
});

t.test('an edited message replaces the first one', function () {
  reset();
  feed('Петя', 'Буду в 7 у входа', 0);
  assert.strictEqual(feed('Петя', 'Буду в 8 у входа', 30000), 'edit');
  assert.strictEqual(stored.length, 1);
  assert.strictEqual(stored[0].text, 'Буду в 8 у входа');
  assert.ok(stored[0].edited);
});

t.test('a like text long after is a new message, not an edit', function () {
  reset();
  feed('Петя', 'Буду в 7 у входа', 0);
  assert.strictEqual(feed('Петя', 'Буду в 8 у входа', 10 * 60000), 'new');
});

t.test('the same text after the repeat window is a new message', function () {
  reset();
  feed('Петя', 'ок', 0);
  assert.strictEqual(feed('Петя', 'ок', 7 * 3600000), 'new');
});

t.test('with the messenger\'s own times: equal texts at other times are two messages', function () {
  reset();
  assert.strictEqual(feed('Петя', 'ок', 1000, 1000), 'new');
  assert.strictEqual(feed('Петя', 'ок', 1000, 1000), 'repeat');
  assert.strictEqual(feed('Петя', 'ок', 60000, 60000), 'new');
  assert.strictEqual(stored.length, 2);
});

t.test('with the messenger\'s own times: same time, other text is an edit', function () {
  reset();
  feed('Петя', 'Купи хлеб', 1000, 1000);
  assert.strictEqual(feed('Петя', 'Купи хлеба и молока', 50000, 1000), 'edit');
  assert.strictEqual(stored.length, 1);
});

t.test('a notification that keeps lines: only the new line is a message', function () {
  reset();
  feed('Петя', 'Привет', 0);
  assert.strictEqual(feed('Петя', 'Привет\nКак дела?', 1000), 'new');
  assert.strictEqual(stored[1].text, 'Как дела?');
});

t.test('another sender with a like text is a new message', function () {
  reset();
  feed('Петя', 'Буду в 7', 0);
  assert.strictEqual(feed('Маша', 'Буду в 7', 1000), 'new');
});

t.test('similarity', function () {
  assert.strictEqual(dedup.similarity('abc', 'abc'), 1);
  assert.ok(dedup.similarity('Буду в 7 у входа', 'Буду в 8 у входа') > 0.7);
  assert.ok(dedup.similarity('Привет', 'Ты где?') < 0.2);
  assert.strictEqual(dedup.similarity('', 'x'), 0);
});

t.test('hidden messages are told apart by the notification time', function () {
  reset();
  var hidden = function (time) {
    var message = { sender: '', text: '', time: time, hidden: true, hash: dedup.hash('p', 'c', '', 'hidden:' + time) };
    var verdict = dedup.classify(message, stored, SETTINGS);
    if (verdict.kind === 'new') stored.push({ id: nextId++, sender: '', text: '', time: time, hidden: true, hash: message.hash });
    return verdict.kind;
  };
  assert.strictEqual(hidden(100), 'new');
  assert.strictEqual(hidden(100), 'repeat');
  assert.strictEqual(hidden(5000), 'new');
});

t.run('dedup');
