// node tests/rules.test.js — the rule language on made-up days.
var assert = require('assert');
var rules = require('../rules.js');
var custom = require('../custom.js');
var dates = require('../dates.js');
var starter = require('../starter.json');

var goals = { steps: 8000, sleep: 450, bedtime: '00:00', water: 2000, stride: 0.75, dayEndHour: 5 };
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

/** Days from 2026-10-01 on, each made from a partial summary; known flags follow the given fields. */
function days(list, from) {
  var start = from || '2026-10-01';
  return list.map(function (fields, i) {
    var day = Object.assign({ date: dates.add(start, i), paused: null, habitIds: [], chains: {} }, fields || {});
    day.known = Object.assign({
      sleep: day.sleepMin !== undefined,
      steps: day.steps !== undefined,
      screen: day.screenMin !== undefined || day.lateMin !== undefined || day.lateAfter2Min !== undefined,
      places: day.newPlaces !== undefined || day.homeOnly !== undefined,
      spend: day.noSpend !== undefined || day.budgetOk !== undefined
    }, (fields || {}).known || {});
    return day;
  });
}

function def(id) {
  var found = starter.filter(function (item) { return item.id === id; })[0];
  if (!found) throw new Error('нет ' + id);
  return JSON.parse(JSON.stringify(found));
}

test('the starter list: 96 rows, 125 with tiers, 19 hidden, every rule valid', function () {
  assert.strictEqual(starter.length, 96);
  var withTiers = starter.reduce(function (sum, item) { return sum + rules.tiersOf(item).length; }, 0);
  assert.strictEqual(withTiers, 125);
  assert.strictEqual(starter.filter(function (item) { return item.hidden; }).length, 19);
  var ids = [];
  var fns = Object.keys(custom).filter(function (name) { return typeof custom[name] === 'function' && name !== 'sunriseUtc'; });
  starter.forEach(function (item) {
    assert.deepStrictEqual(rules.validate(item, ids, fns), [], item.id);
    ids.push(item.id);
  });
});

test('achievements other modules hand in: id = key, rule `grant`, and the module really hands that key in', function () {
  var fs = require('fs');
  var path = require('path');
  var granted = starter.filter(function (item) { return item.key; });
  assert.deepStrictEqual(granted.map(function (item) { return item.id; }).sort(), [
    'focus/quiet-week', 'hat/telepath', 'holidays/not-forgotten', 'inbox/answered-by-ten', 'inbox/zero',
    'recorder/no-task-lost', 'spending/month-in-budget', 'spending/no-delivery-week'
  ]);
  granted.forEach(function (item) {
    assert.strictEqual(item.id, item.key, item.id + ': grant() finds the definition by id = key');
    assert.ok(/^[a-z0-9][a-z0-9/_.-]*$/.test(item.key), item.key);
    assert.deepStrictEqual(item.rule, { type: 'event', event: 'grant' }, item.id);
    assert.strictEqual(item.key.split('/')[0], item.source, item.id + ': source');
    // The store keeps the neighbours next to this module: the key must be in the source module's code.
    var dir = path.join(__dirname, '..', '..', item.source);
    if (!fs.existsSync(dir)) return;
    var code = [];
    (function walk(at) {
      fs.readdirSync(at).forEach(function (name) {
        var full = path.join(at, name);
        if (fs.statSync(full).isDirectory()) { if (name !== 'tests' && name !== 'ui') walk(full); } else if (/\.js$/.test(name)) code.push(fs.readFileSync(full, 'utf8'));
      });
    })(dir);
    assert.ok(code.some(function (text) { return text.indexOf("'" + item.key + "'") >= 0; }), item.source + ' does not hand in ' + item.key);
  });
});

test('rules over the records of other modules: «Душа компании» (Шляпа), «Сто мыслей» (Диктофон)', function () {
  var soul = def('soul-of-the-party');
  assert.deepStrictEqual(soul.rule.query, { kind: 'event', source: 'hat' });
  var times = [1, 2, 3, 4].map(function (n) { return new Date(2026, 9, n * 3, 21).getTime(); });
  var r = rules.evaluate(soul, { times: times, before: 0 });
  assert.strictEqual(r.progress, 4);
  assert.strictEqual(r.tiers[0].metAt, null);
  r = rules.evaluate(soul, { times: times.concat([new Date(2026, 10, 1, 21).getTime()]), before: 0 });
  assert.strictEqual(r.tiers[0].metAt, '2026-11-01');
  var thoughts = def('hundred-thoughts');
  assert.deepStrictEqual(thoughts.rule.query, { kind: 'note', source: 'recorder' });
  assert.strictEqual(rules.evaluate(thoughts, { times: [new Date(2026, 10, 2, 9).getTime()], before: 99 }).tiers[0].metAt, '2026-11-02');
  assert.strictEqual(rules.progressText(thoughts, { progress: 42, target: 100 }), '42 из 100');
});

test('streak: break, skip of unknown day, exact progress', function () {
  var walker = def('walker');
  var list = days([
    { steps: 9000 }, { steps: 9000 }, { steps: 2000 },              // broken on day 3
    { steps: 8000 }, {}, { steps: 8100 }, { steps: 12000 },          // unknown day skipped: 3 in a row
    { steps: 9000 }, { steps: 9000 }, { steps: 9000 }, { steps: 9000 }  // 7 in a row
  ]);
  var r = rules.evaluate(walker, { days: list, goals: goals, pause: 'skip' });
  assert.strictEqual(r.progress, 7);
  assert.strictEqual(r.best, 7);
  assert.strictEqual(r.tiers[0].metAt, '2026-10-11');
  assert.strictEqual(r.tiers[1].metAt, null);
  assert.strictEqual(r.target, 30);
  assert.strictEqual(rules.progressText(walker, r), '7 из 30 дней подряд');
});

test('streak: a pause day skips by default and breaks with pause = break', function () {
  var camel = def('camel');
  var list = days([
    { waterMl: 2000 }, { waterMl: 2500 }, { waterMl: 0, paused: 'sick' }, { waterMl: 2000 }
  ]);
  assert.strictEqual(rules.evaluate(camel, { days: list, goals: goals, pause: 'skip' }).progress, 3);
  assert.strictEqual(rules.evaluate(camel, { days: list, goals: goals, pause: 'break' }).progress, 1);
});

test('negative conditions are never checked on pause days', function () {
  var couch = def('couch-philosopher');
  var paused = days([{ steps: 100, paused: 'sick' }]);
  assert.strictEqual(rules.evaluate(couch, { days: paused, goals: goals }).tiers[0].metAt, null);
  var plain = days([{ steps: 100 }]);
  assert.strictEqual(rules.evaluate(couch, { days: plain, goals: goals }).tiers[0].metAt, '2026-10-01');
});

test('day: all of, unknown screen does not count', function () {
  var monk = def('monk');
  var list = days([{ socialMin: 0, screenMin: 30 }, { steps: 5000 }, { socialMin: 0, screenMin: 120 }]);
  var r = rules.evaluate(monk, { days: list, goals: goals });
  assert.strictEqual(r.tiers[0].metAt, '2026-10-03');
  assert.strictEqual(r.matched, 1);
});

test('count: 5 nights of 7', function () {
  var eight = def('eight-hours');
  var list = days([
    { sleepMin: 490 }, { sleepMin: 300 }, { sleepMin: 500 }, { sleepMin: 480 }, { sleepMin: 200 },
    { sleepMin: 485 }, { sleepMin: 490 }
  ]);
  var r = rules.evaluate(eight, { days: list, goals: goals });
  assert.strictEqual(r.progress, 5);
  assert.strictEqual(r.tiers[0].metAt, '2026-10-07');
  var short = rules.evaluate(eight, { days: list.slice(0, 6), goals: goals });
  assert.strictEqual(short.tiers[0].metAt, null);
  assert.strictEqual(short.progress, 4);
});

test('total within a window and over all time with an accumulator', function () {
  var marathon = def('marathon-week');
  var list = days([{ steps: 10000 }, { steps: 10000 }, { steps: 10000 }, { steps: 10000 }, { steps: 10000 }, { steps: 10000 }]);
  var r = rules.evaluate(marathon, { days: list, goals: goals });
  assert.strictEqual(r.progress, 45);
  assert.strictEqual(r.tiers[0].metAt, '2026-10-06');
  var million = def('millionaire');
  var first = rules.evaluate(million, { days: list, goals: goals, acc: { sum: 950000, through: '2026-09-30' } });
  assert.strictEqual(first.progress, 1010000);
  assert.strictEqual(first.tiers[0].metAt, '2026-10-05');
  // The same days again do not count twice.
  var again = rules.evaluate(million, { days: list, goals: goals, acc: first.acc });
  assert.strictEqual(again.progress, 1010000);
});

test('tiered day rule: the chain of a habit', function () {
  var chain = def('chain');
  var list = days([{ chains: { read: 5 } }, { chains: { read: 6, run: 2 } }, { chains: { read: 7 } }, { chains: { read: 8 } }]);
  var r = rules.evaluate(chain, { days: list, goals: goals });
  assert.strictEqual(r.tiers[0].metAt, '2026-10-03');
  assert.strictEqual(r.tiers[1].metAt, null);
  assert.strictEqual(r.best, 8);
  assert.strictEqual(rules.titleOf(chain, 2), 'Сотня');
  assert.strictEqual(rules.titleOf(def('walker'), 1), 'Пешеход II');
});

test('records and events: sliding window and all-time', function () {
  var athlete = def('athlete');
  var now = dates.parse('2026-11-01').getTime();
  var times = [];
  for (var i = 0; i < 10; i++) times.push(now - (25 - i * 2) * 864e5);
  var r = rules.evaluate(athlete, { times: times, now: now });
  assert.strictEqual(r.tiers[0].metAt, dates.ymd(times[9]));
  var first = def('first-mark');
  var e = rules.evaluate(first, { times: [], before: 3 });
  assert.strictEqual(e.tiers[0].metAt, 'before');
});

test('rarity, xp and tease', function () {
  var walker = def('walker');
  assert.strictEqual(rules.rarityOf(walker, 2), 'epic');
  assert.strictEqual(rules.xpOf(walker, 2), 500);
  assert.strictEqual(rules.xpOf(def('night-owl'), 0), 0);
  assert.strictEqual(rules.xpOf(def('year'), 0, { legendary: 1500 }), 1500);
});

test('validate catches bad rules', function () {
  var bad = { id: 'x', title: 'X', group: 'Сон', rule: { type: 'streak', when: { metric: 'nope', op: '>=', value: 1 } } };
  var errors = rules.validate(bad, [], []);
  assert.ok(errors.some(function (e) { return /неизвестная метрика/.test(e); }));
  assert.ok(errors.some(function (e) { return /days/.test(e); }));
  assert.ok(rules.validate({ id: 'walker', title: 'a', group: 'b', rule: { type: 'day', when: { metric: 'steps', value: 1 } } }, ['walker'], []).length > 0);
  assert.ok(rules.validate({ id: 'q', title: 'a', group: 'b', rule: { type: 'magic' } }, [], []).length > 0);
});

test('matches and the records select', function () {
  assert.ok(rules.matches({ kind: 'habit' }, { kind: 'habit', id: 1 }));
  assert.ok(!rules.matches({ kind: 'habit' }, { kind: 'water' }));
  assert.ok(rules.matches({ hour: { '>=': 23 } }, { hour: 23.5 }));
  var sql = rules.recordsSql({ kinds: ['note', 'event'], source: 'recorder' }, 10);
  assert.strictEqual(sql.where, ' where kind in (?, ?) and source = ? and at >= ?');
  assert.deepStrictEqual(sql.args, ['note', 'event', 'recorder', 10]);
});

test('custom: comeback, phoenix, cells, regular, night place, dawn', function () {
  var back = def('back-to-regime');
  var list = days([
    { sleepMin: 400, bedtime: '01:30' }, { sleepMin: 400, bedtime: '02:00' }, { sleepMin: 400, bedtime: '01:10' },
    { sleepMin: 400, bedtime: '23:50' }, { sleepMin: 400, bedtime: '00:00' }, { sleepMin: 400, bedtime: '23:40' }
  ]);
  var c = custom.comeback({ days: list, goals: goals }, back);
  assert.strictEqual(c.metAt[0], '2026-10-06');

  var phoenix = def('phoenix');
  var chain = [];
  for (var i = 1; i <= 5; i++) chain.push({ chains: { read: i } });
  chain.push({ chains: { read: 0 } });
  for (var j = 1; j <= 14; j++) chain.push({ chains: { read: j } });
  var p = custom.phoenix({ days: days(chain) }, phoenix);
  assert.strictEqual(p.metAt[0], dates.add('2026-10-01', 19));

  var cells = {};
  for (var k = 0; k < 120; k++) cells['c' + k] = dates.add('2026-01-01', k);
  var map = custom.cells({ cells: function () { return cells; } }, def('cartographer'));
  assert.strictEqual(map.metAt[0], dates.add('2026-01-01', 99));
  assert.strictEqual(map.metAt[1], null);

  var visits = [];
  for (var v = 0; v < 20; v++) visits.push({ at: dates.parse('2026-02-01').getTime() + v * 864e5, data: { place: 7 } });
  visits.push({ at: 1, data: { place: 1 } });
  var reg = custom.regular({ visits: function () { return visits; }, places: function () { return [{ data: { id: 1, type: 'home' } }, { data: { id: 7, type: 'other' } }]; } }, def('regular'));
  assert.strictEqual(reg.metAt[0], dates.add('2026-02-01', 19));

  var late = new Date(2026, 9, 3, 23, 40).getTime();
  var night = custom.nightPlace({ places: function () { return [{ at: late }]; }, dayEndHour: 5 }, def('night-wanderer'));
  assert.strictEqual(night.metAt[0], '2026-10-03');

  // Moscow, mid-November: the sun rises a little before 08:00 local (UTC+3).
  var sunrise = custom.sunriseUtc('2026-11-14', 55.75, 37.62);
  assert.ok(sunrise > 4.5 * 60 && sunrise < 5.1 * 60, 'восход ' + sunrise);
  var dawn = custom.dawn({ days: days([{ sleepMin: 420, wake: '07:20' }], '2026-11-14'), home: function () { return { lat: 55.75, lon: 37.62 }; }, tz: function () { return 180; } }, def('dawn'));
  assert.strictEqual(dawn.metAt[0], '2026-11-14');
  var noHome = custom.dawn({ days: [], home: function () { return null; } }, def('dawn'));
  assert.ok(noHome.unknown);
});

test('records rules count what modules really write: kind (and source) is in the code of the writer', function () {
  var fs = require('fs');
  var path = require('path');
  // Who writes what: kind → [folder of the store, source]; the games hub lives in Assi itself.
  var writers = {
    'story/series': 'bedtime-series', 'play/stories': 'voice-adventure', 'rating/games': 'game-of-the-day',
    'event/draw-guess': 'draw-guess', 'event/hat': 'hat', 'event/rpg': 'life-rpg', 'event/spending': 'spending',
    'expense/recorder': 'recorder', 'note/recorder': 'recorder', 'event/recorder': 'recorder', 'focus/': 'focus',
    'workout/': 'health', 'mood/': 'health', 'achievement/': 'achievements'
  };
  var hub = path.join(__dirname, '..', '..', '..', 'Assi', 'app', 'src', 'main', 'assets', 'factory', 'modules', 'games');
  var code = function (dir) {
    var out = [];
    if (!fs.existsSync(dir)) return null;
    (function walk(at) {
      fs.readdirSync(at).forEach(function (name) {
        var full = path.join(at, name);
        if (fs.statSync(full).isDirectory()) { if (name !== 'tests' && name !== 'ui') walk(full); } else if (/\.js$/.test(name)) out.push(fs.readFileSync(full, 'utf8'));
      });
    })(dir);
    return out.join('\n');
  };
  starter.filter(function (item) { return item.rule.type === 'records'; }).forEach(function (item) {
    var q = item.rule.query;
    (q.kinds || [q.kind]).forEach(function (kind) {
      var key = kind + '/' + (q.source || '');
      var dir = writers[key] ? path.join(__dirname, '..', '..', writers[key]) : (q.source === 'games' || !q.source ? hub : null);
      assert.ok(writers[key] || dir === hub, item.id + ': nobody known writes ' + key);
      var text = code(dir);
      if (text === null) return;
      var kindSeen = text.indexOf("kind: '" + kind + "'") >= 0 || text.indexOf("'" + kind + "' : 'event'") >= 0 || text.indexOf("kind === 'note' ? 'note' : 'event'") >= 0;
      assert.ok(kindSeen, item.id + ': ' + (writers[key] || 'games') + ' does not write kind ' + kind);
      if (q.source) assert.ok(text.indexOf("source: '" + q.source + "'") >= 0 || text.indexOf("var ID = '" + q.source + "'") >= 0, item.id + ': source ' + q.source);
    });
  });
});

test('new rules: bedtime windows, «all habits» needs a mark, text queries match the JSON of data', function () {
  var cinderella = def('cinderella');
  var list = days([
    { sleepMin: 450, bedtime: '23:10' }, { sleepMin: 450, bedtime: '22:40' }, { sleepMin: 450, bedtime: '23:59' },
    { sleepMin: 450, bedtime: '23:30' }, { sleepMin: 450, bedtime: '00:20' }
  ]);
  assert.strictEqual(rules.evaluate(cinderella, { days: list, goals: goals }).best, 4);
  var grandma = def('grandma-mode');
  assert.strictEqual(rules.evaluate(grandma, { days: days([{ sleepMin: 500, bedtime: '21:40' }]), goals: goals }).tiers[0].metAt, '2026-10-01');
  assert.strictEqual(rules.evaluate(grandma, { days: days([{ sleepMin: 90, bedtime: '14:00' }]), goals: goals }).tiers[0].metAt, null);
  // Without «Здоровье» habitsDue is unknown: a day with no marks must not count as «все привычки».
  var allDone = def('all-done');
  var empty = days([{}, {}, {}, {}, {}, {}, {}, {}]);
  assert.strictEqual(rules.evaluate(allDone, { days: empty, goals: goals }).progress, 0);
  var marked = days([1, 2, 3, 4, 5, 6, 7].map(function () { return { habitsDue: 2, habitsDone: 2, habitIds: ['a', 'b'] }; }));
  assert.strictEqual(rules.evaluate(allDone, { days: marked, goals: goals }).tiers[0].metAt, '2026-10-07');
  // The text of a records query is a LIKE over the stored JSON of data (JSON.stringify, no spaces).
  var like = function (item, data) { return JSON.stringify(data).indexOf(item.rule.query.text) >= 0; };
  assert.ok(like(def('fell-asleep'), { asleep: true, asleepScene: 3, done: false }));
  assert.ok(!like(def('fell-asleep'), { asleep: false }));
  assert.ok(like(def('road-games'), { game: 'subway', trip: true }));
  assert.ok(!like(def('road-games'), { game: 'subway', trip: false }));
  var sql = rules.recordsSql(def('road-games').rule.query);
  assert.strictEqual(sql.where, ' where kind in (?) and (title like ? or data like ? or tags like ?)');
  // Tiered totals: the lake of water in litres, kilometres on foot.
  var lake = rules.evaluate(def('lake'), { days: days([{ waterMl: 2000 }]), goals: goals, acc: { sum: 99000, through: '2026-09-30' } });
  assert.strictEqual(lake.tiers[0].metAt, '2026-10-01');
  assert.strictEqual(rules.titleOf(def('lake'), 1), 'Тысяча литров');
  var far = rules.evaluate(def('far-away'), { days: days([{ farthestKm: 640, newPlaces: 1 }]), goals: goals });
  assert.strictEqual(far.tiers[0].metAt, '2026-10-01');
  assert.strictEqual(far.tiers[1].metAt, null);
  // Spending nothing is a negative condition: a pause day neither counts nor breaks.
  var ascetic = rules.evaluate(def('ascetic'), { days: days([{ noSpend: true }, { noSpend: true, paused: 'sick' }, { noSpend: true }, { noSpend: true }]), goals: goals, pause: 'skip' });
  assert.strictEqual(ascetic.progress, 3);
  assert.strictEqual(rules.xpOf(def('square-eyes'), 0), 0);
});

console.log(passed + ' проверок прошло' + (process.exitCode ? ', есть ошибки' : ''));
