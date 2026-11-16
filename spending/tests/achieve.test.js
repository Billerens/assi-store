// node tests/achieve.test.js — the link to «Ачивки за жизнь» (achieve.js): with the module there the
// item goes to its grant(), without it — to the shared box; each key goes once. The same test is in
// hat, inbox, recorder, holidays, spending and focus.
var assert = require('assert');
var achieve = require('../achieve.js');

var passed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
  } catch (error) {
    console.error('FAIL ' + name + '\n' + (error.stack || error));
    process.exitCode = 1;
  }
}

/** Files in memory, as assi.files sees them. */
function disk(start) {
  var data = {};
  Object.keys(start || {}).forEach(function (key) { data[key] = JSON.stringify(start[key]); });
  return {
    data: data,
    exists: function (p) { return p in data; },
    readJson: function (p, fallback) { return p in data ? JSON.parse(data[p]) : fallback; },
    writeJson: function (p, value) { data[p] = JSON.stringify(value); },
    json: function (p) { return p in data ? JSON.parse(data[p]) : undefined; }
  };
}

var MEMO = 'data/test/achievements.json';
var ITEM = { key: 'test/first', source: 'test', category: 'Жизнь', title: 'Первая', text: 'Проверка' };

function copy(item) {
  return JSON.parse(JSON.stringify(item));
}

test('the module is there: grant() gets the item, the key is remembered, a repeat does nothing', function () {
  var files = disk({});
  files.data[achieve.MAIN] = '// main.js';
  var got = [];
  var load = function (path) {
    assert.strictEqual(path, achieve.MAIN);
    return { grant: function (item) { got.push(item); return { ok: true }; } };
  };
  assert.strictEqual(achieve.give(files, load, copy(ITEM), MEMO), 'granted');
  assert.strictEqual(got.length, 1);
  assert.strictEqual(got[0].key, 'test/first');
  assert.ok(got[0].at > 0, 'the moment is filled in');
  assert.ok(achieve.given(files, MEMO, 'test/first'));
  assert.strictEqual(files.json(achieve.OUTBOX), undefined, 'nothing in the box');
  assert.strictEqual(achieve.give(files, load, copy(ITEM), MEMO), 'already');
  assert.strictEqual(got.length, 1);
});

test('the module is absent: the item waits in the shared box, once', function () {
  var files = disk({});
  var load = function () { throw new Error('must not be loaded'); };
  assert.strictEqual(achieve.give(files, load, copy(ITEM), MEMO), 'outbox');
  assert.strictEqual(achieve.give(files, load, copy(ITEM), MEMO), 'already');
  var box = files.json(achieve.OUTBOX);
  assert.strictEqual(box.length, 1);
  assert.strictEqual(box[0].title, 'Первая');
});

test('the box of the game hub is kept: its items stay, the { items } shape stays', function () {
  var files = disk({});
  files.writeJson(achieve.OUTBOX, { items: [{ key: 'games/x/y', title: 'Игра' }] });
  assert.strictEqual(achieve.give(files, function () { return {}; }, copy(ITEM), MEMO), 'outbox');
  var box = files.json(achieve.OUTBOX);
  assert.deepStrictEqual(box.items.map(function (one) { return one.key; }), ['games/x/y', 'test/first']);
});

test('grant() fails: the item goes to the box instead of being lost', function () {
  var files = disk({});
  files.data[achieve.MAIN] = '// main.js';
  var load = function () { return { grant: function () { throw new Error('сломалось'); } }; };
  var warn = console.warn;
  console.warn = function () {};
  try {
    assert.strictEqual(achieve.give(files, load, copy(ITEM), MEMO), 'outbox');
  } finally {
    console.warn = warn;
  }
  assert.strictEqual(files.json(achieve.OUTBOX).length, 1);
});

test('an item without a key is not handed in', function () {
  var files = disk({});
  assert.strictEqual(achieve.give(files, function () { return {}; }, { title: 'Без ключа' }, MEMO), null);
  assert.strictEqual(files.json(MEMO), undefined);
});

process.on('exit', function () {
  if (!process.exitCode) console.log('achieve: ' + passed + ' ok');
});
