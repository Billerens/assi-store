// node tests/awards.test.js — ачивки в «Ачивки за жизнь»: «Художник» за рисунки подряд, grant(),
// когда модуль ачивок есть, общий ящик data/games/achievements-outbox.json, когда его нет.
var assert = require('assert');
var h = require('./harness.js');
var S = require('./sandbox.js');
var A = require('../awards.js');
var C = require('../config.js');

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function guessed(n) {
  var out = [];
  for (var i = 0; i < n; i++) out.push('guessed');
  return out;
}

h.test('серия: считаются только угаданные подряд от последнего', function () {
  assert.strictEqual(A.streak([]), 0);
  assert.strictEqual(A.streak(['guessed', 'guessed', 'missed', 'guessed']), 2);
  assert.strictEqual(A.streak(['missed', 'guessed']), 0);
  assert.strictEqual(A.streak(guessed(12)), 12);
});

h.test('«Художник» — после artistStreak угаданных подряд; выключено — ничего', function () {
  var s = C.defaults();
  assert.strictEqual(s.achievements, true);
  assert.strictEqual(s.artistStreak, 10);
  assert.deepStrictEqual(A.earned(guessed(9), s, 5), []);
  assert.deepStrictEqual(A.earned(['missed'].concat(guessed(10)), s, 5), []);
  var items = A.earned(guessed(10), s, 5);
  assert.strictEqual(items.length, 1);
  assert.deepStrictEqual(items[0], {
    key: 'draw-guess/artist', source: 'draw-guess', category: 'Игротека', title: 'Художник',
    text: 'Модель узнала 10 ваших рисунков подряд в «Рисуй — угадаю»', at: 5, hidden: false, icon: 'modules/draw-guess/icon.svg'
  });
  assert.deepStrictEqual(A.earned(guessed(10), C.normalize({ achievements: false }), 5), []);
  assert.strictEqual(A.earned(guessed(3), C.normalize({ artistStreak: 3 }), 5).length, 1);
});

h.test('модуль ачивок есть — grant(), второй раз не шлём', function () {
  var granted = [];
  var disk = { 'modules/achievements/main.js': '' };
  var files = S.memoryFiles(disk);
  var load = function (p) {
    assert.strictEqual(p, 'modules/achievements/main.js');
    return { grant: function (item) { granted.push(item); return { ok: true }; } };
  };
  var item = A.artist(10, 7);
  assert.deepStrictEqual(A.deliver([item], files, load), [{ key: 'draw-guess/artist', how: 'granted' }]);
  assert.strictEqual(granted.length, 1);
  assert.ok(!(A.OUTBOX in disk), 'в ящик не кладём');
  assert.deepStrictEqual(A.deliver([item], files, load), [{ key: 'draw-guess/artist', how: 'sent' }]);
  assert.strictEqual(granted.length, 1);
});

h.test('модуля ачивок нет — в общий ящик, к чужим ачивкам, без повторов', function () {
  var other = { key: 'games/subway/first-transfer', source: 'games', title: 'Первая пересадка' };
  var disk = {};
  disk[A.OUTBOX] = JSON.stringify([other]);
  var files = S.memoryFiles(disk);
  var load = function () { throw new Error('модуля нет — грузить нечего'); };
  assert.deepStrictEqual(A.deliver([A.artist(10, 7)], files, load), [{ key: 'draw-guess/artist', how: 'queued' }]);
  var box = JSON.parse(disk[A.OUTBOX]);
  assert.deepStrictEqual(box.map(function (item) { return item.key; }), ['games/subway/first-transfer', 'draw-guess/artist']);
  delete disk[A.SENT];
  A.deliver([A.artist(10, 8)], files, load);
  assert.strictEqual(JSON.parse(disk[A.OUTBOX]).length, 2, 'тот же key второй раз не кладётся');
});

h.test('grant() упал — ачивка всё равно не теряется: в ящик', function () {
  var disk = { 'modules/achievements/main.js': '' };
  var files = S.memoryFiles(disk);
  var load = function () { return { grant: function () { throw new Error('сломано'); } }; };
  assert.deepStrictEqual(A.deliver([A.artist(10, 7)], files, load), [{ key: 'draw-guess/artist', how: 'queued' }]);
  assert.strictEqual(JSON.parse(disk[A.OUTBOX])[0].key, 'draw-guess/artist');
});

h.test('ящик в виде { items } сохраняет свой вид', function () {
  var disk = {};
  disk[A.OUTBOX] = JSON.stringify({ version: 1, items: [] });
  A.deliver([A.artist(10, 7)], S.memoryFiles(disk), function () { return null; });
  var box = JSON.parse(disk[A.OUTBOX]);
  assert.strictEqual(box.version, 1);
  assert.strictEqual(box.items[0].key, 'draw-guess/artist');
});

h.test('конец партии: десятый угаданный рисунок подряд — «Художник» уходит в grant()', function () {
  var granted = [];
  var phone = S.make({
    disk: { 'modules/achievements/main.js': '' },
    rounds: guessed(10),
    modules: { 'modules/achievements/main.js': { grant: function (item) { granted.push(plain(item)); } } }
  });
  var result = phone.main.gameEnd(1, { rounds: 5, modelHits: 5, humanHits: 0, toBase: true });
  assert.deepStrictEqual(plain(result.awards), [{ key: 'draw-guess/artist', how: 'granted' }]);
  assert.strictEqual(granted.length, 1);
  assert.strictEqual(granted[0].title, 'Художник');
  var asked = phone.sql.filter(function (entry) { return /^select result from rounds/.test(entry[0]); });
  assert.deepStrictEqual(plain(asked[0][1]), ['human_draws', 10]);
});

h.test('конец партии: проверка (keep), пустая партия и серия короче — ничего', function () {
  var granted = [];
  var modules = { 'modules/achievements/main.js': { grant: function (item) { granted.push(item); } } };
  var phone = S.make({ disk: { 'modules/achievements/main.js': '' }, rounds: guessed(10), modules: modules });
  phone.main.gameEnd(1, { rounds: 1, toBase: false, keep: true });
  phone.main.gameEnd(1, { rounds: 0, toBase: false });
  assert.strictEqual(granted.length, 0);
  var short = S.make({ disk: { 'modules/achievements/main.js': '' }, rounds: guessed(9), modules: modules });
  assert.deepStrictEqual(plain(short.main.gameEnd(1, { rounds: 3, toBase: true }).awards), []);
  assert.strictEqual(granted.length, 0);
});

h.test('конец партии без модуля ачивок — «Художник» в общем ящике', function () {
  var phone = S.make({ rounds: guessed(10) });
  phone.main.gameEnd(1, { rounds: 5, toBase: true });
  var box = JSON.parse(phone.disk['data/games/achievements-outbox.json']);
  assert.strictEqual(box.length, 1);
  assert.strictEqual(box[0].key, 'draw-guess/artist');
  assert.strictEqual(box[0].source, 'draw-guess');
});

h.test('«Нераспознанный гений»: модель не узнала, а люди узнали geniusCount рисунков; редкая', function () {
  var s = C.defaults();
  assert.strictEqual(s.geniusCount, 1);
  assert.deepStrictEqual(A.earned([], s, 5, { genius: 0 }), []);
  assert.deepStrictEqual(A.earned([], s, 5), [], 'без счёта — ничего');
  var items = A.earned(['missed'], s, 5, { genius: 1 });
  assert.strictEqual(items.length, 1);
  assert.strictEqual(items[0].key, 'draw-guess/unrecognized-genius');
  assert.strictEqual(items[0].title, 'Нераспознанный гений');
  assert.strictEqual(items[0].category, 'Игротека');
  assert.strictEqual(items[0].rarity, 'rare');
  assert.strictEqual(A.earned([], C.normalize({ geniusCount: 3 }), 5, { genius: 2 }).length, 0);
  assert.ok(/3 ваших рисунков/.test(A.earned([], C.normalize({ geniusCount: 3 }), 5, { genius: 3 })[0].text));
  assert.deepStrictEqual(A.earned([], C.normalize({ achievements: false }), 5, { genius: 5 }), []);
  var both = A.earned(guessed(10), s, 5, { genius: 1 }).map(function (item) { return item.key; });
  assert.deepStrictEqual(both, ['draw-guess/artist', 'draw-guess/unrecognized-genius']);
});

h.test('конец партии: люди узнали рисунок — «Нераспознанный гений» в grant() с полными данными', function () {
  var granted = [];
  var phone = S.make({
    disk: { 'modules/achievements/main.js': '' }, rounds: ['missed'], genius: 1,
    modules: { 'modules/achievements/main.js': { grant: function (item) { granted.push(plain(item)); } } }
  });
  var result = phone.main.gameEnd(1, { rounds: 1, modelHits: 0, toBase: true });
  assert.deepStrictEqual(plain(result.awards), [{ key: 'draw-guess/unrecognized-genius', how: 'granted' }]);
  assert.strictEqual(granted[0].rarity, 'rare');
  assert.strictEqual(granted[0].source, 'draw-guess');
  var asked = phone.sql.filter(function (entry) { return /count\(\*\) as genius/.test(entry[0]); });
  assert.deepStrictEqual(plain(asked[0][1]), ['human_draws', 'guessed']);
});

h.test('конец партии без модуля ачивок — «Нераспознанный гений» ждёт в общем ящике', function () {
  var phone = S.make({ rounds: ['missed'], genius: 1 });
  phone.main.gameEnd(1, { rounds: 1, toBase: true });
  var box = JSON.parse(phone.disk['data/games/achievements-outbox.json']);
  assert.deepStrictEqual(box.map(function (item) { return item.key; }), ['draw-guess/unrecognized-genius']);
  assert.strictEqual(box[0].rarity, 'rare');
});

h.test('раунд: «люди узнали» пишется только для неугаданного рисунка «Я рисую»', function () {
  var phone = S.make({});
  phone.main.saveRound({ mode: 'human_draws', word: 'кит', result: 'missed', peopleKnew: true });
  phone.main.saveRound({ mode: 'human_draws', word: 'кот', result: 'guessed', peopleKnew: true });
  phone.main.saveRound({ mode: 'model_draws', word: 'дом', result: 'missed', peopleKnew: true });
  var inserts = phone.sql.filter(function (entry) { return /^insert into rounds/.test(entry[0]); });
  assert.deepStrictEqual(inserts.map(function (entry) { return entry[1][entry[1].length - 1]; }), [1, 0, 0]);
  assert.ok(/people_knew/.test(inserts[0][0]));
});
