// node tests/grant.test.js — grant() from other modules on a pretend engine: a starter definition
// with id = key is used as it is (its rarity, its secrecy), the same key is granted once, the shared
// box is taken; a thing for the Pet carries the rarity of its tier (with the Pet and without it).
var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = path.join(__dirname, '..');
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

/** main.js of the module with files in memory, a fake base and, when given, a fake Pet. */
function engine(options) {
  options = options || {};
  var disk = {};
  var log = { base: [], notify: [], pet: [] };
  var files = {
    exists: function (p) { return p in disk; },
    read: function (p) { return disk[p]; },
    write: function (p, text) { disk[p] = String(text); },
    remove: function (p) { delete disk[p]; return true; },
    readJson: function (p, fallback) { return p in disk ? JSON.parse(disk[p]) : fallback; },
    writeJson: function (p, value) { disk[p] = JSON.stringify(value); }
  };
  var mocks = {
    'lib/assi': {
      files: files,
      notify: function (o) { log.notify.push(o); },
      widget: { refresh: function () {} },
      db: function () { return { query: function () { return []; } }; }
    },
    'lib/base': { add: function (record) { log.base.push(record); return log.base.length; }, find: function () { return []; } }
  };
  if (options.pet) {
    disk['modules/pet/main.js'] = '// Питомец';
    mocks['modules/pet/main.js'] = { give: function (item) { log.pet.push(item); return true; }, celebrate: function () {} };
  }
  var cache = {};
  function load(file) {
    if (cache[file]) return cache[file].exports;
    var module = { exports: {} };
    cache[file] = module;
    if (/\.json$/.test(file)) {
      module.exports = JSON.parse(fs.readFileSync(file, 'utf8'));
      return module.exports;
    }
    var fn = vm.runInThisContext('(function (exports, require, module) {' + fs.readFileSync(file, 'utf8') + '\n})', { filename: file });
    fn(module.exports, function (name) {
      if (mocks[name]) return mocks[name];
      if (/^\.\//.test(name)) return load(path.join(path.dirname(file), name.slice(2)));
      throw new Error('нет модуля ' + name);
    }, module);
    return module.exports;
  }
  global.emit = function () {};
  return { main: load(path.join(ROOT, 'main.js')), disk: disk, files: files, log: log };
}

var STARTER = JSON.parse(fs.readFileSync(path.join(ROOT, 'starter.json'), 'utf8'));

test('grant() of another module finds its starter definition: rarity and secrecy from the list, once', function () {
  var e = engine();
  e.files.writeJson('data/achievements/list.json', STARTER);
  var got = e.main.grant({ key: 'hat/telepath', source: 'hat', category: 'Игротека', title: 'Телепат', text: 'за 3 с', rarity: 'common' });
  assert.strictEqual(got.ok, true);
  assert.strictEqual(got.granted.id, 'hat/telepath');
  assert.strictEqual(got.granted.rarity, 'uncommon', 'the definition decides, not the item');
  assert.strictEqual(got.granted.hidden, true);
  assert.strictEqual(e.files.readJson('data/achievements/list.json').length, STARTER.length, 'no second definition');
  assert.strictEqual(e.log.base.length, 1);
  assert.strictEqual(e.log.base[0].data.xp, 100);
  assert.strictEqual(e.main.grant({ key: 'hat/telepath' }).already, true);
  assert.strictEqual(e.log.base.length, 1);
});

test('the shared box: items of other modules are taken, the box goes', function () {
  var e = engine();
  e.files.writeJson('data/achievements/list.json', STARTER);
  e.files.writeJson('data/games/achievements-outbox.json', [
    { key: 'spending/month-in-budget', source: 'spending', category: 'Траты', title: 'Месяц в бюджете', text: 'Октябрь', at: Date.now() },
    { key: 'inbox/zero', source: 'inbox', category: 'Жизнь', title: 'Ноль входящих', text: 'пусто', at: Date.now() }
  ]);
  assert.strictEqual(e.main.drainOutbox(), 2);
  assert.strictEqual(e.files.exists('data/games/achievements-outbox.json'), false);
  var state = e.files.readJson('data/achievements/state.json');
  assert.strictEqual(state['spending/month-in-budget'].got.length, 1);
  assert.strictEqual(state['inbox/zero'].got.length, 1);
});

var WITH_ITEM = { id: 'test/shelf', key: 'test/shelf', title: 'Полка', group: 'Жизнь', rarity: 'epic', item: { id: 'trophy', slot: 'shelf' }, rule: { type: 'event', event: 'grant' } };

test('a thing for the Pet carries the rarity: through give() when the Pet is there', function () {
  var e = engine({ pet: true });
  e.files.writeJson('data/achievements/list.json', [WITH_ITEM]);
  e.main.grant({ key: 'test/shelf' });
  assert.strictEqual(e.log.pet.length, 1);
  assert.deepStrictEqual(e.log.pet[0], { id: 'trophy', from: 'test/shelf', slot: 'shelf', worn: false, rarity: 'epic' });
});

test('a thing for the Pet carries the rarity: in data/pet/items.json when the Pet is not there', function () {
  var e = engine();
  e.files.writeJson('data/achievements/list.json', [WITH_ITEM]);
  e.main.grant({ key: 'test/shelf' });
  var items = e.files.readJson('data/pet/items.json');
  assert.strictEqual(items.length, 1);
  assert.strictEqual(items[0].rarity, 'epic');
});

test('cardData() for the home card: share, rarity, latest badges, days of the chart', function () {
  var e = engine();
  e.files.writeJson('data/achievements/list.json', STARTER);
  e.files.writeJson('data/achievements/settings.json', { cardDays: 10, cardBadges: 2 });
  e.main.grant({ key: 'inbox/zero', at: Date.now() - 3 * 864e5 });
  e.main.grant({ key: 'hat/telepath', at: Date.now() - 2 * 864e5 });
  e.main.grant({ key: 'spending/month-in-budget' });
  var card = e.main.cardData();
  assert.strictEqual(card.got, 3);
  assert.ok(card.total >= 100, 'total ' + card.total);
  assert.strictEqual(card.percent, Math.round(300 / card.total));
  assert.strictEqual(card.week, 3);
  assert.deepStrictEqual(card.rarity.map(function (r) { return r.id; }), ['common', 'uncommon', 'rare', 'epic', 'legendary']);
  assert.strictEqual(card.rarity.reduce(function (sum, r) { return sum + r.total; }, 0), card.total);
  assert.deepStrictEqual(card.rarity.map(function (r) { return r.got; }), [1, 1, 1, 0, 0]);
  assert.deepStrictEqual(card.latest.map(function (b) { return b.id; }), ['spending/month-in-budget', 'hat/telepath']);
  assert.strictEqual(card.latest[1].masked, false, 'a received hidden one is shown');
  assert.strictEqual(card.daily.length, 10);
  assert.strictEqual(card.daily[9].count, 1);
  assert.strictEqual(card.daily.reduce(function (sum, d) { return sum + d.count; }, 0), 3);
});

process.on('exit', function () {
  if (!process.exitCode) console.log('grant: ' + passed + ' ok');
});
