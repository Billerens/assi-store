// node tests/links.test.js — the RPG and «Игротека»: experience for game sessions (kind 'play'),
// starting chests for games not played yet through the hub's inbox, and nothing without the hub.
// main.js runs under voice-adventure's tests/engine-stub.js (files in memory, a fake hub).
var assert = require('assert');
var path = require('path');
var ROOT = path.join(__dirname, '..');
var STUB = path.join(ROOT, '..', 'voice-adventure', 'tests', 'engine-stub.js');
var xp = require('../xp.js');

var hubState = { games: [], saves: {}, inbox: {} };
var hub = {
  games: function () { return hubState.games.map(function (id) { return { id: id, title: id, status: 'active' }; }); },
  saves: function (id) { return hubState.saves[id] || []; },
  inboxAdd: function (id, entry) {
    var list = hubState.inbox[id] = hubState.inbox[id] || [];
    if (list.some(function (e) { return e.id === entry.id; })) return false;
    list.push(entry);
    return true;
  }
};

var env = require(STUB).install({ mounts: { 'modules/rpg': ROOT }, fakes: { 'modules/games/main.js': hub } });
var main = env.require('modules/rpg/main.js');

var passed = 0;
function test(name, fn) {
  env.reset();
  hubState = { games: [], saves: {}, inbox: {} };
  try {
    fn();
    passed++;
  } catch (error) {
    console.error('FAIL ' + name + '\n' + (error.stack || error));
    process.exitCode = 1;
  }
}

function state(value) {
  env.files['data/rpg/state.json'] = JSON.stringify(value);
}

function readState() {
  return JSON.parse(env.files['data/rpg/state.json']);
}

test('опыт за игры: минуты × playPerMin, потолок в день, только уровень', function () {
  var day = { date: '2026-11-13', known: {}, habitIds: [], chains: {}, playMin: 45 };
  var entries = xp.dayEntries(day, { rounding: 'floor' });
  assert.strictEqual(entries.length, 1);
  assert.strictEqual(entries[0].skill, 'play');
  assert.strictEqual(entries[0].amount, 20, 'потолок playCap по умолчанию');
  assert.strictEqual(entries[0].ref, 'day:2026-11-13:play');
  assert.strictEqual(xp.dayEntries(Object.assign({}, day, { playMin: 7 }), {})[0].amount, 7);
  assert.strictEqual(xp.dayEntries(day, {}, { playPerMin: 2, playCap: 60 })[0].amount, 60);
  assert.deepStrictEqual(xp.dayEntries(day, {}, { playPerMin: 0 }), [], 'выключено настройкой');
  assert.deepStrictEqual(xp.dayEntries(Object.assign({}, day, { playMin: 0 }), {}), []);
  assert.ok(xp.LEVEL_ONLY.indexOf('play') >= 0, 'игры не навык');
});

test('бонус игре: сундук за каждые perLevels уровней, не больше max, всё из настроек', function () {
  state({ level: 1 });
  assert.strictEqual(main.gameBonus('subway').chests, 0);
  state({ level: 12 });
  var b = main.gameBonus('subway');
  assert.strictEqual(b.chests, 2);
  assert.strictEqual(b.level, 12);
  assert.ok(/уровень 12/.test(b.reason));
  state({ level: 40 });
  assert.strictEqual(main.gameBonus('subway').chests, 3, 'не больше max');
  env.files['data/rpg/settings.json'] = JSON.stringify({ games: { perLevels: 10, max: 5 } });
  assert.strictEqual(main.gameBonus('subway').chests, 4);
  env.files['data/rpg/settings.json'] = JSON.stringify({ games: { bonus: false } });
  assert.strictEqual(main.gameBonus('subway').chests, 0);
  assert.strictEqual(main.gameBonus('subway').on, false);
});

test('Игротека есть: несыгранная игра получает сундуки через ящик один раз, сыгранная — нет', function () {
  env.files['modules/games/main.js'] = '// the hub';
  state({ level: 12 });
  hubState.games = ['subway', 'old'];
  hubState.saves.old = [{ seq: 1 }];
  var given = main.giveGameBonuses();
  assert.deepStrictEqual(given, [{ game: 'subway', chests: 2 }]);
  assert.strictEqual(hubState.inbox.subway.length, 2);
  assert.strictEqual(hubState.inbox.subway[0].op, 'chest');
  assert.strictEqual(hubState.inbox.subway[0].from, 'rpg');
  assert.ok(!hubState.inbox.old, 'в начатую игру сундуки не кладутся');
  var marks = readState().gameBonus;
  assert.strictEqual(marks.subway.chests, 2);
  assert.strictEqual(marks.old.started, true);
  assert.strictEqual(readState().level, 12, 'состояние не потеряно');
  assert.deepStrictEqual(main.giveGameBonuses(), [], 'второй раз ничего');
  assert.strictEqual(hubState.inbox.subway.length, 2);
});

test('уровень ниже порога: игра не помечена и получит сундук, когда уровень вырастет', function () {
  env.files['modules/games/main.js'] = '// the hub';
  state({ level: 2 });
  hubState.games = ['subway'];
  assert.deepStrictEqual(main.giveGameBonuses(), []);
  assert.ok(!(readState().gameBonus || {}).subway);
  state({ level: 5 });
  assert.deepStrictEqual(main.giveGameBonuses(), [{ game: 'subway', chests: 1 }]);
});

test('Игротеки нет или бонус выключен — ничего и без ошибок', function () {
  state({ level: 30 });
  hubState.games = ['subway'];
  assert.deepStrictEqual(main.giveGameBonuses(), []);
  assert.ok(!hubState.inbox.subway);
  env.files['modules/games/main.js'] = '// the hub';
  env.files['data/rpg/settings.json'] = JSON.stringify({ games: { bonus: false } });
  assert.deepStrictEqual(main.giveGameBonuses(), []);
  assert.ok(!hubState.inbox.subway);
});

console.log('links: ' + passed + ' passed');
