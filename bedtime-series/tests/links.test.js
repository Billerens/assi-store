// The neighbours' details of the night series (links.js through main.js) under node: each neighbour
// present (a stand-in main.js mounted from a temporary folder) and absent. node tests/links.test.js
var assert = require('assert');
var path = require('path');
var fs = require('fs');
var os = require('os');
var ROOT = path.join(__dirname, '..');
var ADVENTURE = path.join(ROOT, '..', 'voice-adventure');
var env = require(path.join(ADVENTURE, 'tests', 'engine-stub.js')).install({
  mounts: { 'modules/voice-adventure': ADVENTURE, 'modules/bedtime-series': ROOT }
});
var sample = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'sample.json'), 'utf8'));
var fakeAxiko = require('lib/axiko');
var main = env.require('modules/bedtime-series/main.js');
var plan = env.require('modules/bedtime-series/plan.js');

global.context = { checkSelfPermission: function () { return -1; } };

// Stand-in neighbours: modules/<id>/main.js reads its functions from global.__fake[id], so that each
// test sets its own. The pet also gets its real look.js (the titles of stages and things).
var NEIGHBOURS = ['holidays', 'hat', 'rpg', 'recorder', 'inbox', 'horoscope', 'pet', 'draw-guess'];
var TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'series-links-'));
var DIRS = {};
NEIGHBOURS.forEach(function (id) {
  var dir = path.join(TMP, id);
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'main.js'),
    'module.exports = new Proxy({}, { get: function (t, key) { return ((global.__fake || {})[' + JSON.stringify(id) + '] || {})[key]; } });\n');
  DIRS[id] = dir;
});
fs.copyFileSync(path.join(ROOT, '..', 'pet', 'look.js'), path.join(DIRS.pet, 'look.js'));
process.on('exit', function () {
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (error) { /* left in temp */ }
});

function install(ids) {
  ids.forEach(function (id) { env.mounts['modules/' + id] = DIRS[id]; });
}

var ALL = ['calendar', 'trip', 'workout', 'note', 'place', 'holidays', 'hat', 'rpg', 'meetings', 'inbox', 'horoscope', 'pet', 'draw'];

var failed = 0;
var passed = 0;
function test(name, fn) {
  env.reset();
  NEIGHBOURS.forEach(function (id) { delete env.mounts['modules/' + id]; });
  global.__fake = {};
  env.query = null;
  fakeAxiko.rows = function () { return []; };
  try {
    fn();
    passed++;
  } catch (error) {
    failed++;
    console.error('FAIL ' + name + '\n  ' + (error && error.stack || error));
  }
}

function hhmm(time) {
  var d = new Date(time);
  return (d.getHours() < 10 ? '0' : '') + d.getHours() + ':' + (d.getMinutes() < 10 ? '0' : '') + d.getMinutes();
}

function texts() {
  return main.preview().details.map(function (d) { return d.text; });
}

function today() {
  return plan.midnight(Date.now());
}

/** Everything the neighbours could tell about today. */
function fullDay() {
  var day = today();
  env.base.push({ kind: 'event', source: 'hat', title: 'Шляпа', at: day + 60000, data: { players: 4, games: 1, names: ['Петя', 'Оля'] } });
  env.base.push({ kind: 'event', source: 'rpg', title: 'Уровень 15', at: day + 120000, data: { level: 15 } });
  env.base.push({ kind: 'event', source: 'recorder', title: 'Созвон про отпуск', at: day + 180000, tags: ['встреча'], data: { people: ['Петя'] } });
  env.base.push({ kind: 'event', source: 'draw-guess', title: 'Рисуй — угадаю', at: day + 240000, data: { rounds: 4 } });
  global.__fake.holidays = { occasionToday: function (date) { return date === plan.dayOf(Date.now()) ? { id: 'new-year', title: 'Новый год', wallpaper: 'snow' } : null; } };
  global.__fake.horoscope = { sign: function () { return { week: '2026-11-09', title: 'Сова в доме Скроллера' }; } };
  global.__fake.pet = {
    settings: function () { return { name: 'Листик' }; },
    look: function () { return { stage: 1, items: [{ id: 'scarf', slot: 'neck' }, { id: 'trophy', slot: 'shelf' }] }; }
  };
  global.__fake.inbox = {
    since: function (from) {
      assert.strictEqual(from, day);
      return {
        important: [{ isGroup: false, chat: 'Мама', sender: 'Мама', text: 'секрет' }, { isGroup: true, chat: 'Семья', sender: 'Оля Петрова', text: 'секрет' }],
        others: [{ isGroup: false, title: 'Петя Иванов', about: '«секрет»' }, { isGroup: true, title: 'Работа' }]
      };
    }
  };
  global.__fake['draw-guess'] = {};
  env.files['data/draw-guess.db'] = 'sqlite';
  env.query = function (name, sql, args) {
    if (name !== 'draw-guess') return [];
    assert.ok(/^select word from rounds where at >= \?/.test(sql), sql);
    assert.strictEqual(args[0], day);
    return [{ word: 'маяк' }, { word: 'кот' }];
  };
}

test('все соседи на месте: их детали в превью и в задании, праздник — отдельной строкой', function () {
  install(NEIGHBOURS);
  fullDay();
  main.saveSettings({ people: 'Петя, мама', sources: ALL, 'details.max': 20, 'details.perSource': 0 });
  var got = texts();
  var all = got.join(' | ');
  assert.ok(got.indexOf('праздник: Новый год') >= 0, all);
  assert.ok(got.indexOf('вечер игры в «Шляпу» с компанией, игроков 4; играли Петя') >= 0, all);
  assert.ok(got.indexOf('новый уровень в жизни-игре: 15') >= 0, all);
  assert.ok(got.indexOf('встреча: Созвон про отпуск; были Петя') >= 0, all);
  assert.ok(got.indexOf('писали за день: мама, Петя') >= 0, all);
  assert.ok(got.indexOf('знак недели в шуточном гороскопе: Сова в доме Скроллера') >= 0, all);
  assert.ok(got.some(function (t) { return /по имени Листик, сейчас «два листа», при нём: шарф$/.test(t); }), all);
  assert.ok(got.indexOf('играли в «Рисуй — угадаю», раундов 4; рисовали: маяк, кот') >= 0, all);
  assert.ok(!/Оля|секрет|Работа|Семья|кубок/i.test(all), 'лишнее: ' + all);

  var prompt = null;
  env.ai = function (role, body) {
    prompt = body.messages[1].content;
    return JSON.stringify(sample);
  };
  main.startSeason({ genre: 'sea', quiet: true });
  var out = main.prepare('button', true);
  assert.strictEqual(out.written, 1, JSON.stringify(out));
  assert.ok(/- праздник: Новый год/.test(prompt) && /особый день \(праздник: Новый год\): пусть серия будет праздничной/.test(prompt), prompt);
  assert.ok(/- писали за день: мама, Петя/.test(prompt) && !/секрет/.test(prompt));
});

test('соседей нет: источники включены, а серия пишется как прежде', function () {
  var day = today();
  // Records left in the base by modules removed since then are still facts of the day.
  env.base.push({ kind: 'event', source: 'rpg', title: 'Уровень 3', at: day + 60000, data: { level: 3 } });
  main.saveSettings({ people: 'Петя', sources: ALL });
  var got = texts();
  assert.deepStrictEqual(got, ['новый уровень в жизни-игре: 3']);
  var prompt = null;
  env.ai = function (role, body) {
    prompt = body.messages[1].content;
    return JSON.stringify(sample);
  };
  main.startSeason({ genre: 'sea', quiet: true });
  assert.strictEqual(main.prepare('button', true).written, 1);
  assert.ok(!/особый день/.test(prompt));
  assert.ok(!env.nativeCalls.some(function (c) { return /draw/.test(JSON.stringify(c)); }));
});

test('источник выключен — соседа не спрашивают', function () {
  install(NEIGHBOURS);
  fullDay();
  var asked = [];
  ['holidays', 'horoscope', 'inbox'].forEach(function (id) {
    var fake = global.__fake[id];
    Object.keys(fake).forEach(function (key) {
      var fn = fake[key];
      fake[key] = function () { asked.push(id); return fn.apply(null, arguments); };
    });
  });
  main.saveSettings({ people: 'Петя, мама', sources: ['calendar', 'note'] });
  assert.deepStrictEqual(texts(), []);
  assert.deepStrictEqual(asked, []);
  // By default Входящие and the meetings of the recorder are off.
  main.saveSettings({ sources: main.settingsView().filter(function (r) { return r.key === 'sources'; })[0].fallback });
  var got = texts().join(' | ');
  assert.ok(/праздник: Новый год/.test(got) && !/писали за день|встреча:/.test(got), got);
  assert.ok(asked.indexOf('inbox') < 0);
});

test('сосед упал или старый — деталь пропадает, остальное идёт, причина в журнале', function () {
  install(['holidays', 'horoscope', 'pet']);
  global.__fake.holidays = { occasionToday: function () { throw new Error('сломался'); } };
  global.__fake.horoscope = {};   // an old version without sign()
  global.__fake.pet = { settings: function () { return { name: 'Листик' }; }, look: function () { throw new Error('нет рисунка'); } };
  main.saveSettings({ sources: ['holidays', 'horoscope', 'pet'] });
  var got = texts();
  assert.deepStrictEqual(got, ['у слушателя есть питомец — маленькое нарисованное существо-росток по имени Листик']);
  assert.ok(main.log(5).some(function (e) { return /Праздники: сломался/.test(e.text); }), JSON.stringify(main.log(5)));
});

test('бюджет: не больше details.max, праздник остаётся, питомец и знак уходят первыми', function () {
  install(NEIGHBOURS);
  fullDay();
  main.saveSettings({ people: 'Петя, мама', sources: ALL, 'details.max': 3 });
  var got = texts();
  assert.strictEqual(got.length, 3, got.join(' | '));
  assert.strictEqual(got[0], 'праздник: Новый год');
  assert.ok(!/питомец|знак недели|Рисуй/.test(got.join(' ')), got.join(' | '));
});

test('рисунок к серии: с «Рисуй — угадаю» — в файле серии и на экране, без него — серия без рисунка', function () {
  install(['draw-guess']);
  var painted = [];
  global.__fake['draw-guess'] = {
    paint: function (word) {
      painted.push(word);
      return { ok: true, word: word, strokes: [{ d: 'M 100 100 L 900 900', length: 1131 }, { d: 'M 0 0 L <script>', length: 1 }] };
    }
  };
  env.ai = function () { return JSON.stringify(sample); };
  var id = main.startSeason({ genre: 'sea', quiet: true }).season;
  // Off by default: no picture, no request.
  assert.strictEqual(main.prepare('button', true).written, 1);
  assert.deepStrictEqual(painted, []);
  main.saveSettings({ 'art.on': true });
  main.removeSeason(id);
  id = main.startSeason({ genre: 'sea', quiet: true }).season;
  assert.strictEqual(main.prepare('button', true).written, 1);
  assert.deepStrictEqual(painted, ['Смотритель моста']);
  var ep = JSON.parse(env.files['data/series/' + id + '/e1.json']);
  assert.deepStrictEqual(ep.art.strokes, ['M 100 100 L 900 900'], 'только команды пути');
  assert.deepStrictEqual(main.status().next.art.strokes, ['M 100 100 L 900 900']);

  // Without the module.
  delete env.mounts['modules/draw-guess'];
  main.removeSeason(id);
  id = main.startSeason({ genre: 'sea', quiet: true }).season;
  assert.strictEqual(main.prepare('button', true).written, 1);
  assert.ok(!JSON.parse(env.files['data/series/' + id + '/e1.json']).art);
  assert.ok(!main.status().next.art);
  assert.ok(main.log(5).some(function (e) { return /Рисунок к серии 1 не сделан: нет модуля/.test(e.text); }));
});

console.log('links: прошло ' + passed + ', не прошло ' + failed);
if (failed) process.exit(1);
