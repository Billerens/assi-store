// node tests/main.test.js — the engine (main.js) through a whole night on a pretend phone: the
// Rhino globals, lib/assi, lib/base, lib/ai and android.js are stand-ins; SQLite is node:sqlite
// (node 22.5+). The night is the sample one (samples/*.txt, fixture.js).
var assert = require('assert');
var fs = require('fs');
var path = require('path');
var Module = require('module');

process.removeAllListeners('warning');
var sqlite;
try {
  sqlite = require('node:sqlite');
} catch (error) {
  console.log('пропущено: нужен node 22.5+ с node:sqlite');
  process.exit(0);
}

var ROOT = path.join(__dirname, '..');
var fixture = require('../fixture');
var settingsLib = require('../settings');
var nightLib = require('../night');
var KEY = '2026-11-13';
var S = settingsLib.defaults();
var TEXTS = {};
fixture.FILES.forEach(function (name) { TEXTS[name] = fs.readFileSync(path.join(ROOT, 'samples', name + '.txt'), 'utf8'); });
var MADE = fixture.scenario(KEY, TEXTS, S);

var count = 0;
var failed = 0;
function test(name, fn) {
  count++;
  try {
    fn();
    console.log('ok ' + count + ' ' + name);
  } catch (error) {
    failed++;
    console.log('not ok ' + count + ' ' + name + '\n  ' + (error && error.stack ? error.stack.split('\n').slice(0, 4).join('\n  ') : error));
  }
}

// ---- the pretend phone --------------------------------------------------------------------------

var clock = { now: 0 };
var realNow = Date.now;
Date.now = function () { return clock.now; };
function t(hhmm, seconds) { return nightLib.at(KEY, hhmm, S.dayBoundary) + (seconds || 0) * 1000; }

var world;
function fresh() {
  world = {
    files: {}, dbs: {}, notices: [], jobs: {}, handlers: {}, emitted: [], records: [], nextRecord: 1,
    battery: 92, uptimeBase: t('23:00') - 3600000, dumps: [], askAnswers: null, asked: 0, healthScreen: false
  };
  delete global.__phoneNightLive;
}

function database(name) {
  if (world.dbs[name]) return world.dbs[name];
  var raw = new sqlite.DatabaseSync(':memory:');
  var clean = function (args) {
    return (args || []).map(function (value) {
      if (value === undefined) return null;
      if (typeof value === 'boolean') return value ? 1 : 0;
      return value;
    });
  };
  var handle = {
    exec: function (sql, args) {
      if (!args || !args.length) return raw.exec(sql);
      var statement = raw.prepare(sql);
      statement.run.apply(statement, clean(args));
    },
    query: function (sql, args) {
      var statement = raw.prepare(sql);
      return statement.all.apply(statement, clean(args)).map(function (row) { return Object.assign({}, row); });
    },
    lastId: function () { return Number(raw.prepare('select last_insert_rowid() as id').get().id); }
  };
  world.dbs[name] = handle;
  return handle;
}

var assiMock = {
  files: {
    path: function (p) { return '/abs/' + p; },
    read: function (p) {
      if (world.files[p] === undefined) throw new Error('нет файла ' + p);
      return world.files[p];
    },
    write: function (p, text) { world.files[p] = String(text); },
    exists: function (p) {
      return world.files[p] !== undefined || Object.keys(world.files).some(function (name) { return name.indexOf(p.replace(/\/?$/, '/')) === 0; });
    },
    list: function (p) {
      var prefix = p.replace(/\/?$/, '/');
      var out = {};
      Object.keys(world.files).forEach(function (name) {
        if (name.indexOf(prefix) !== 0) return;
        var rest = name.slice(prefix.length);
        var cut = rest.indexOf('/');
        out[cut >= 0 ? rest.slice(0, cut + 1) : rest] = true;
      });
      return Object.keys(out).sort();
    },
    remove: function (p) {
      var prefix = p.replace(/\/?$/, '/');
      Object.keys(world.files).forEach(function (name) { if (name === p || name.indexOf(prefix) === 0) delete world.files[name]; });
      return true;
    },
    readJson: function (p, fallback) { return world.files[p] === undefined ? fallback : JSON.parse(world.files[p]); },
    writeJson: function (p, value) { world.files[p] = JSON.stringify(value); }
  },
  db: function (name) { return database(name); },
  notify: function (options) { world.notices.push(options); return 'n' + world.notices.length; },
  widget: { refresh: function () {} },
  shell: function () { throw new Error('shell не должен вызываться в обход android.js'); }
};

var baseMock = {
  add: function (record) {
    var copy = JSON.parse(JSON.stringify(record));
    copy.id = world.nextRecord++;
    world.records.push(copy);
    return copy.id;
  },
  find: function (query) {
    return world.records.filter(function (row) {
      return (!query.kind || row.kind === query.kind) && (!query.source || row.source === query.source) &&
        (query.since === undefined || row.at >= query.since) && (query.until === undefined || row.at < query.until);
    });
  },
  remove: function (id) { world.records = world.records.filter(function (row) { return row.id !== id; }); },
  kinds: function () {
    var kinds = {};
    world.records.forEach(function (row) { kinds[row.kind] = true; });
    if (world.healthScreen) kinds.screen = true;
    return Object.keys(kinds).map(function (kind) { return { kind: kind }; });
  }
};

var aiMock = {
  ask: function () {
    world.asked++;
    if (!world.askAnswers || !world.askAnswers.length) throw new Error('модель не настроена');
    var next = world.askAnswers.shift();
    if (next instanceof Error) throw next;
    return next;
  }
};

function dumpText(command, file) {
  var phase = /morning-/.test(file) ? 'morning' : 'evening';
  if (/alarm/.test(command)) return TEXTS['alarm-' + phase];
  if (/--checkin/.test(command)) return TEXTS['checkin-' + phase];
  if (/--history/.test(command)) return MADE.raw.history;
  if (/deviceidle/.test(command)) return TEXTS.deviceidle;
  if (/jobscheduler/.test(command)) return TEXTS.jobscheduler;
  return '';
}

var phoneMock = {
  CUT: '-----',
  message: function (error) { return String(error && error.message || error); },
  features: function () { return world.features || []; },
  has: function (name) { return (world.features || []).indexOf(name) >= 0; },
  battery: function () { return { ok: true, note: '', level: world.battery, charging: false, plugged: 0, temp: 25 }; },
  uptime: function () { return clock.now - world.uptimeBase; },
  usageAccess: function () { return true; },
  usageEvents: function (from, to) {
    return { ok: true, note: '', events: MADE.usage.filter(function (e) { return e.at >= from && e.at < to; }).map(function (e) {
      var copy = JSON.parse(JSON.stringify(e));
      copy.src = 'usage';
      if (/screen|unlock/.test(copy.kind)) copy.package = null;
      return copy;
    }) };
  },
  traffic: function () { return JSON.parse(JSON.stringify(MADE.input.traffic)); },
  apps: function () { return JSON.parse(JSON.stringify(fixture.APPS)); },
  shizuku: function () { return { installed: true, running: true, granted: true, ready: true, note: '' }; },
  dump: function (command, file) {
    world.dumps.push(command);
    if (world.noShizuku) return { ok: false, note: 'Shizuku не был запущен', via: '', path: null, truncated: false };
    world.files[file] = dumpText(command, file);
    return { ok: true, note: '', via: 'Shizuku', path: file, truncated: false };
  },
  eachLine: function (file, fn) {
    if (world.files[file] === undefined) return -1;
    var lines = world.files[file].split(/\r?\n/);
    lines.forEach(fn);
    return lines.length;
  },
  run: function (command) { return { ok: true, out: /getprop/.test(command) ? '\nreboot\n' : '', note: '' }; },
  selfDump: function () { return false; },
  noticesOn: function () { return true; },
  dozeExempt: function () { return true; },
  openAppSettings: function (pkg) { world.opened = pkg; return true; },
  openUsageAccess: function () { return true; },
  openNotices: function () { return true; },
  openBatterySettings: function () { return true; },
  allowDoze: function () { return { ok: true, note: '' }; }
};

// Neighbour modules: present only when a test installs them (world.mods + a file at their path).
var NEIGHBOURS = ['modules/health/main.js', 'modules/focus/main.js', 'modules/wallpapers/main.js', 'modules/horoscope/main.js'];
function install(request, mod) {
  world.mods = world.mods || {};
  world.mods[request] = mod;
  world.files[request] = '// ' + request;
}

var MAIN_PATH = path.join(ROOT, 'main.js');
var originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (NEIGHBOURS.indexOf(request) >= 0) {
    if (!world.mods || !world.mods[request]) throw new Error('Cannot find module ' + request);
    return world.mods[request];
  }
  if (request === 'lib/assi') return assiMock;
  if (request === 'lib/base') return baseMock;
  if (request === 'lib/ai') return aiMock;
  if (request === './android' && parent && parent.filename === MAIN_PATH) return phoneMock;
  if (request === 'modules/phone-night/main.js') return originalLoad.call(this, MAIN_PATH, parent, isMain);
  if (/^modules\/phone-night\//.test(request)) return originalLoad.call(this, path.join(ROOT, request.slice('modules/phone-night/'.length)), parent, isMain);
  return originalLoad.apply(this, arguments);
};

global.native = function (method) {
  if (method === 'models.resolve') return { model: 'test' };
  throw new Error('нет операции ' + method);
};
global.on = function (name, fn, key) { world.handlers[name + '|' + key] = fn; };
global.job = function (key, when, fn) { world.jobs[key] = { when: when, fn: fn }; };
global.unjob = function (key) { delete world.jobs[key]; };
global.spawn = function (fn) { fn(); };
global.sleep = function () {};
global.emit = function (name, data) { world.emitted.push([name, data]); };
global.java = { util: { concurrent: { locks: { ReentrantLock: function () {
  var held = 0;
  return { lock: function () { held++; }, unlock: function () { held--; }, tryLock: function () { held++; return true; } };
} } } } };

function main() {
  delete require.cache[MAIN_PATH];
  return require(MAIN_PATH);
}

/** The sample night lived through the module: the evening snapshot, the live journal, the morning unlock. */
function liveTheNight(m, options) {
  options = options || {};
  clock.now = t('22:30');
  m.start();
  clock.now = t('23:00');
  world.jobs['phone-night.evening'].fn();
  var ids = [];
  MADE.live.forEach(function (event, index) {
    if (options.stopAt && event.at >= options.stopAt) return;
    clock.now = event.at;
    if (event.at >= t('07:12')) world.battery = 81;
    var made;
    if (event.kind === 'screen_on') made = m.handle('screen', { state: 'on' });
    else if (event.kind === 'screen_off') made = m.handle('screen', { state: 'off' });
    else if (event.kind === 'unlock') made = m.handle('screen', { state: 'unlocked' });
    else if (event.kind === 'notification') {
      made = m.handle('notification', { package: event.package, app: event.extra.app, title: 'T', text: new Array(event.extra.len + 1).join('x'), key: 'k' + index });
    } else if (event.kind === 'network') made = m.handle('network', event.extra);
    if (made && made.id) ids.push(made.id);
  });
  return ids;
}

// ---- the checks ----------------------------------------------------------------------------------------

test('start: subscriptions, three jobs at the set times, the agent tool', function () {
  fresh();
  var m = main();
  clock.now = t('15:00');
  m.start();
  assert.deepStrictEqual(Object.keys(world.jobs).sort(), ['phone-night.evening', 'phone-night.late', 'phone-night.morning']);
  assert.strictEqual(world.jobs['phone-night.evening'].when.at, '23:00');
  assert.strictEqual(world.jobs['phone-night.morning'].when.at, '07:00');
  assert.strictEqual(world.jobs['phone-night.late'].when.at, '12:00');
  ['screen', 'notification', 'power', 'network'].forEach(function (name) { assert.ok(world.handlers[name + '|phone-night'], name); });
  assert.ok(/modules\/phone-night\/tools\/phone_night\.js/.test(world.files['tools/phone_night.js']));
  assert.strictEqual(m.handle('screen', { state: 'off' }).skipped, 'не ночь');
});

test('a whole night: the morning unlock brings the report, the notification and the base records', function () {
  fresh();
  var m = main();
  liveTheNight(m);
  assert.strictEqual(world.notices.length, 1, 'одно утреннее уведомление');
  var notice = world.notices[0];
  assert.strictEqual(notice.title, 'Ночь с 13 на 14 ноября');
  assert.strictEqual(notice.open, 'modules/phone-night/ui/index.html');
  assert.ok(/^Батарея: 92% → 82%/.test(notice.text), notice.text);
  assert.ok(/02:40, Telegram, 6 мин/.test(notice.text), notice.text);
  assert.strictEqual(notice.id, undefined, 'без notify.actions — простое уведомление');
  var report = m.report(KEY);
  assert.strictEqual(report.stored, true);
  assert.strictEqual(report.story.by, 'template');
  assert.ok(/модель не ответила/.test(report.story.note), report.story.note);
  var f = report.facts;
  assert.strictEqual(f.window.how, 'screen');
  assert.strictEqual(nightLib.hhmm(f.window.from), '23:39');
  assert.strictEqual(nightLib.hhmm(f.window.to), '07:12');
  assert.deepStrictEqual([f.battery.start, f.battery.end], [92, 82]);
  assert.deepStrictEqual(f.screen, { on: 2, unlocks: 1 });
  assert.strictEqual(f.notifications.total, 9);
  assert.strictEqual(f.notifications.source, 'live');
  assert.strictEqual(f.traffic.top[0].app, 'Telegram');
  assert.strictEqual(f.doze.fullMinutes, 254);
  assert.ok(f.sources.every(function (source) { return source.ok; }), JSON.stringify(f.sources.filter(function (x) { return !x.ok; })));
  assert.deepStrictEqual(report.whence.missing, []);
  var phoneNight = world.records.filter(function (row) { return row.kind === 'phone_night'; });
  assert.strictEqual(phoneNight.length, 1);
  assert.strictEqual(phoneNight[0].amount, 10);
  assert.strictEqual(phoneNight[0].data.topWaker, 'Сервисы Google Play');
  assert.strictEqual(phoneNight[0].data.ownerMinutes, 6);
  var screen = world.records.filter(function (row) { return row.kind === 'screen_time'; });
  assert.strictEqual(screen.length, 1);
  assert.deepStrictEqual(screen[0].tags, ['ночь']);
  assert.strictEqual(screen[0].data.app, 'Telegram');
  var dumps = world.dumps.join('|');
  ['dumpsys alarm', 'dumpsys batterystats --checkin', 'dumpsys batterystats --history', 'dumpsys deviceidle', 'dumpsys jobscheduler'].forEach(function (command) {
    assert.ok(dumps.indexOf(command) >= 0, command);
  });
  assert.ok(Object.keys(world.files).some(function (name) { return /^data\/phone-night\/raw\/2026-11-14\/morning-history\.txt$/.test(name); }));
});

test('the same morning: a second unlock gives no second notification', function () {
  clock.now = t('08:30');
  var m = main();
  m.handle('screen', { state: 'unlocked' });
  assert.strictEqual(world.notices.length, 1);
  assert.strictEqual(m.morning('late').skipped, 'отчёт за эту ночь уже был');
});

test('lists, trends, the widget, the tool', function () {
  var m = main();
  var list = m.nights(10);
  assert.strictEqual(list.length, 1);
  assert.strictEqual(list[0].night, KEY);
  assert.strictEqual(list[0].topWaker.app, 'Сервисы Google Play');
  assert.deepStrictEqual([list[0].battery.start, list[0].battery.end], [92, 82]);
  var trends = m.trends(30);
  assert.strictEqual(trends.nights.length, 1);
  assert.strictEqual(trends.avgDrop, 10);
  var widget = m.widget();
  assert.strictEqual(widget.title, 'Ночь с 13 на 14 ноября');
  assert.ok(/Батарея: 92% → 82%/.test(widget.text));
  var told = m.toolReport({});
  assert.ok(/Ночь с 13 на 14 ноября/.test(told) && /Telegram/.test(told), told);
});

test('rebuilding with a model: a story that passes the check is kept, the base is not doubled', function () {
  var m = main();
  world.askAnswers = [{
    headline: 'Ночная охота',
    lines: ['В 01:00 «Маркетплейс» вышел на охоту — 7 уведомлений до рассвета.', 'Батарея пережила ночь, потеряв 10%.'],
    tip: ''
  }];
  var made = m.buildReport(KEY);
  assert.strictEqual(made.story.by, 'model');
  assert.strictEqual(made.story.attempts, 1);
  assert.strictEqual(world.records.filter(function (row) { return row.kind === 'phone_night'; }).length, 1);
  assert.strictEqual(m.report(KEY).story.headline, 'Ночная охота');
  assert.strictEqual(m.nights(5)[0].by, 'model');
});

test('a model that invents twice: the template; once: the second answer', function () {
  var m = main();
  world.askAnswers = [
    { headline: 'Ночь', lines: ['Батарея потеряла 17%.'], tip: '' },
    { headline: 'Ночь', lines: ['В 03:15 телефон проснулся.'], tip: '' }
  ];
  var made = m.buildReport(KEY);
  assert.strictEqual(made.story.by, 'template');
  assert.strictEqual(made.story.attempts, 2);
  assert.ok(/03:15/.test(made.story.note), made.story.note);
  world.askAnswers = [
    { headline: 'Ночь', lines: ['Батарея потеряла 17%.'], tip: '' },
    { headline: 'Тихая ночь', lines: ['Батарея потеряла 10%.'], tip: '' }
  ];
  var again = m.buildReport(KEY);
  assert.strictEqual(again.story.by, 'model');
  assert.strictEqual(again.story.attempts, 2);
  assert.ok(/17/.test(again.story.errors.join(';')));
});

test('settings: saved partially, jobs moved, the style «сухо» is the model\'s style too', function () {
  var m = main();
  var saved = m.saveSettings({ nightStart: '22:30', style: 'dry', darkMinutes: 9999 });
  assert.strictEqual(saved.nightStart, '22:30');
  assert.strictEqual(saved.darkMinutes, 240);
  assert.strictEqual(world.jobs['phone-night.evening'].when.at, '22:30');
  var asked = world.asked;
  world.askAnswers = [{ headline: 'Ночь', lines: ['Тихая ночь.'], tip: '' }];
  var made = m.buildReport(KEY);
  assert.strictEqual(world.asked, asked + 1, '«сухо» — тоже рассказ модели');
  assert.strictEqual(made.story.by, 'model');
  assert.strictEqual(m.settings().schema.length, settingsLib.SCHEMA.length);
  m.saveSettings(settingsLib.defaults());
  m.saveSettings({ enabled: false });
  assert.deepStrictEqual(Object.keys(world.jobs), []);
  assert.strictEqual(m.handle('screen', { state: 'on' }).skipped, 'журнал выключен');
  m.saveSettings({ enabled: true });
});

test('forget: the report, snapshots, raw outputs and base records go', function () {
  var m = main();
  m.forget(KEY);
  assert.strictEqual(m.nights(5).length, 0);
  assert.strictEqual(world.records.filter(function (row) { return row.source === 'phone-night'; }).length, 0);
  assert.ok(!Object.keys(world.files).some(function (name) { return name.indexOf('data/phone-night/raw/2026-11-14/') === 0; }));
});

test('without Shizuku: an honest report with what is missing; with notify.actions — a quiet notification', function () {
  fresh();
  world.noShizuku = true;
  world.features = ['notify.actions'];
  world.healthScreen = true;
  var m = main();
  liveTheNight(m);
  var report = m.report(KEY);
  var missing = report.whence.missing.map(function (row) { return row.id; }).sort();
  assert.deepStrictEqual(missing, ['alarm', 'checkin', 'deviceidle', 'history', 'jobscheduler']);
  assert.ok(report.whence.missing.every(function (row) { return /Shizuku не был запущен/.test(row.note); }), JSON.stringify(report.whence.missing));
  assert.strictEqual(report.facts.battery.source, 'battery');
  assert.deepStrictEqual([report.facts.battery.start, report.facts.battery.end], [92, 81]);
  assert.strictEqual(report.facts.wakers.ok, false);
  assert.ok(!report.template.lines.some(function (line) { return line.key === 'wakers'; }));
  assert.strictEqual(world.notices[0].id, 'phone-night.morning');
  assert.strictEqual(world.notices[0].silent, true);
  assert.strictEqual(world.records.filter(function (row) { return row.kind === 'screen_time'; }).length, 0, 'Здоровье ведёт screen — свой вид не заводится');
});

test('during the night: a preview without the model, nothing stored', function () {
  fresh();
  var m = main();
  liveTheNight(m, { stopAt: t('03:00') });
  clock.now = t('03:00');
  world.askAnswers = [{ headline: 'x', lines: ['y'], tip: '' }];
  var preview = m.report();
  assert.strictEqual(preview.night, KEY);
  assert.strictEqual(preview.partial, true);
  assert.strictEqual(preview.stored, false);
  assert.strictEqual(preview.story.by, 'template');
  assert.strictEqual(world.asked, 0);
  assert.strictEqual(m.nights(5).length, 0);
  assert.strictEqual(world.notices.length, 0);
});

test('the backup jobs: no unlock — the morning job waits, the late one reports', function () {
  fresh();
  var m = main();
  liveTheNight(m, { stopAt: t('07:05') });
  clock.now = t('07:00');
  var dumps = world.dumps.length;
  var waited = m.morning('time');
  assert.strictEqual(world.notices.length, 0);
  assert.strictEqual(waited.snapshot, true, 'запасной утренний снимок в конце окна: ' + JSON.stringify(waited));
  assert.ok(world.dumps.length > dumps, 'снимок снял dumpsys');
  assert.strictEqual(m.morning('time').snapshot, false, 'второй раз снимок не повторяется');
  clock.now = t('12:00');
  world.battery = 79;
  world.jobs['phone-night.late'].fn();
  assert.strictEqual(world.notices.length, 1);
  var report = m.report(KEY);
  assert.strictEqual(report.facts.window.how, 'screen');
  assert.ok(report.stored);
});

test('a reboot at night goes into the journal as kind reboot at the first start after it', function () {
  fresh();
  var m = main();
  clock.now = t('22:30');
  m.start();
  m.start();
  var events = function () { return world.dbs['phone-night'].query("select at from events where kind = 'reboot'"); };
  assert.strictEqual(events().length, 0, 'перезапуск Assi — не перезагрузка');
  world.uptimeBase = t('03:10');
  clock.now = t('03:12');
  m.start();
  assert.deepStrictEqual(events().map(function (row) { return row.at; }), [t('03:10')]);
  m.start();
  assert.strictEqual(events().length, 1);
  world.uptimeBase = t('15:00');
  clock.now = t('15:05');
  m.start();
  assert.strictEqual(events().length, 1, 'днём перезагрузка не пишется');
});

test('the journal: ongoing notifications and repeats are not counted, text is not kept', function () {
  fresh();
  var m = main();
  clock.now = t('01:00');
  assert.ok(m.handle('notification', { package: 'a.b', app: 'A', title: 'x', text: 'секрет', key: 'k1' }).id);
  clock.now = t('01:00', 20);
  assert.strictEqual(m.handle('notification', { package: 'a.b', app: 'A', title: 'x', text: 'секрет', key: 'k1' }).skipped, 'обновление того же уведомления');
  assert.strictEqual(m.handle('notification', { package: 'c.d', app: 'C', title: 'музыка', ongoing: true, key: 'k2' }).skipped, 'постоянное уведомление');
  var rows = world.dbs['phone-night'].query('select * from events');
  assert.strictEqual(rows.length, 1);
  assert.ok(rows[0].extra.indexOf('секрет') < 0);
  assert.strictEqual(JSON.parse(rows[0].extra).len, 6);
  m.dropEvents([rows[0].id]);
  assert.strictEqual(world.dbs['phone-night'].query('select * from events').length, 0);
});

// ---- the neighbours -------------------------------------------------------------------------------------

function seedNeighbours() {
  [
    { kind: 'play', at: t('02:46'), title: 'Подземка', amount: 6, unit: 'min', source: 'games', data: { game: 'subway', trip: false } },
    { kind: 'expense', at: t('02:44'), title: 'Самокат', amount: 990, unit: 'RUB', tags: ['доставка еды'], source: 'spending', data: { txId: 5 } },
    { kind: 'story', at: t('23:52'), title: 'Сериал: серия 12', amount: 14, unit: 'min', source: 'series', data: { asleep: true, episode: 12 } },
    { kind: 'focus', at: t('15:00'), title: 'Отчёт', amount: 50, unit: 'min', source: 'focus', data: { sessionId: 'f1', blockedAttempts: 3, endedBy: 'timer' } },
    { kind: 'focus', at: t('00:50'), title: 'Фокус', amount: 80, unit: 'min', source: 'focus', data: { sessionId: 'f2', blockedAttempts: 0, endedBy: 'timer' } }
  ].forEach(function (record) { baseMock.add(record); });
}

function installNeighbours() {
  world.marked = [];
  world.summaries = [];
  install('modules/health/main.js', {
    markHabit: function (ref, value, at) { world.marked.push([ref, at]); return { id: 70, title: 'Ночь без телефона' }; }
  });
  install('modules/focus/main.js', {
    summary: function (id) {
      world.summaries.push(id);
      if (id === 'f2') return { session: { id: id, dndOk: true, startAt: t('00:50'), endAt: t('02:10') } };
      return { session: { id: id, dndOk: false, startAt: t('15:00'), endAt: t('15:50') } };
    }
  });
  install('modules/wallpapers/main.js', {
    history: function () { return [{ id: 3, title: 'Туман над Ладогой', set_at: t('07:00'), thumbUrl: '/data/wallpapers/3/thumb.jpg', credit: 'Фото: А. Иванов, Unsplash' }]; }
  });
  install('modules/horoscope/main.js', {
    day: function (date) {
      if (date !== '2026-11-14') return null;
      return { date: date, predictions: [{ id: 'calm', claim: 'Спокойный день' }, { id: 'late', claim: 'Вечером вы снова закажете доставку' }], text: '' };
    }
  });
}

test('neighbours present: games, purchases, focus, the series, the habit, the morning bundle', function () {
  fresh();
  world.files['data/phone-night/settings.json'] = JSON.stringify({ habitMark: true, habitMaxUnlocks: 1 });
  seedNeighbours();
  installNeighbours();
  var m = main();
  liveTheNight(m);
  assert.strictEqual(world.notices.length, 1);
  var text = world.notices[0].text;
  assert.ok(/Обои дня: «Туман над Ладогой»\. Звёзды: Вечером вы снова закажете доставку\./.test(text), text);
  var report = m.report(KEY);
  var f = report.facts;
  assert.strictEqual(f.play.minutes, 6);
  assert.strictEqual(f.purchases.count, 1);
  assert.strictEqual(f.purchases.top.merchant, 'Самокат');
  assert.strictEqual(nightLib.hhmm(f.asleep.at), '23:52');
  assert.deepStrictEqual([f.quiet.minutes, f.quiet.hidden], [80, 3]);
  assert.deepStrictEqual(f.dayFocus, { sessions: 1, minutes: 50, attempts: 3 });
  assert.deepStrictEqual(world.summaries.filter(function (id, i, all) { return all.indexOf(id) === i; }), ['f2'], 'Фокус спрошен только о ночной сессии');
  assert.deepStrictEqual(world.marked, [['Ночь без телефона', f.window.to]]);
  assert.strictEqual(f.habit.marked, true);
  var keys = report.template.lines.map(function (line) { return line.key; });
  ['asleep', 'play', 'purchases', 'quiet', 'focusDay', 'habit'].forEach(function (key) { assert.ok(keys.indexOf(key) >= 0, key); });
  assert.ok(report.story.lines.some(function (line) { return /отмечена привычка «Ночь без телефона»/.test(line); }), 'строка привычки — и в шаблонном рассказе');
  assert.strictEqual(report.morning.wallpaper.title, 'Туман над Ладогой');
  assert.strictEqual(report.morning.wallpaper.open, 'modules/wallpapers/ui/index.html');
  assert.strictEqual(report.morning.horoscope.text, 'Вечером вы снова закажете доставку');
  // A rebuild keeps the mark and does not mark again.
  var again = m.buildReport(KEY);
  assert.strictEqual(again.facts.habit.marked, true);
  assert.strictEqual(world.marked.length, 1);
  assert.deepStrictEqual(m.ownerNight(), { night: KEY, to: f.window.to, ownerMinutes: 6, sessions: 1, unlocks: 1, screens: 2 });
  assert.strictEqual(m.ownerNight(KEY).ownerMinutes, 6);
  assert.strictEqual(m.ownerNight('2026-01-01'), null);
});

test('neighbours absent: base records still told, «не беспокоить», the habit and the bundle are not', function () {
  fresh();
  world.files['data/phone-night/settings.json'] = JSON.stringify({ habitMark: true, habitMaxUnlocks: 1 });
  seedNeighbours();
  var m = main();
  liveTheNight(m);
  var report = m.report(KEY);
  var f = report.facts;
  assert.strictEqual(f.play.minutes, 6);
  assert.strictEqual(f.purchases.count, 1);
  assert.strictEqual(f.quiet, null, 'без модуля Фокус не известно, было ли «не беспокоить»');
  assert.deepStrictEqual(f.dayFocus, { sessions: 1, minutes: 50, attempts: 3 });
  assert.strictEqual(f.habit.marked, false);
  assert.ok(/Здоровье/.test(f.habit.note), f.habit.note);
  assert.ok(!report.template.lines.some(function (line) { return line.key === 'habit' || line.key === 'quiet'; }));
  assert.strictEqual(report.morning, null);
  assert.ok(!/Обои дня|Звёзды/.test(world.notices[0].text), world.notices[0].text);
});

test('neighbours switched off in the settings: nothing is read, nothing is marked', function () {
  fresh();
  world.files['data/phone-night/settings.json'] = JSON.stringify({
    linkGames: false, linkSpending: false, linkFocus: false, linkSeries: false, morningBundle: false
  });
  seedNeighbours();
  installNeighbours();
  var m = main();
  liveTheNight(m);
  var f = m.report(KEY).facts;
  ['asleep', 'play', 'purchases', 'quiet', 'dayFocus'].forEach(function (key) { assert.strictEqual(f[key], null, key); });
  assert.strictEqual(f.habit, undefined, 'привычка выключена по умолчанию');
  assert.deepStrictEqual(world.summaries, []);
  assert.deepStrictEqual(world.marked, []);
  assert.ok(!/Обои дня/.test(world.notices[0].text));
  assert.strictEqual(m.report(KEY).morning, null);
});

test('a night with an unlock is not a night without the phone (threshold 0)', function () {
  fresh();
  world.files['data/phone-night/settings.json'] = JSON.stringify({ habitMark: true });
  installNeighbours();
  var m = main();
  liveTheNight(m);
  assert.deepStrictEqual(world.marked, []);
  assert.strictEqual(m.report(KEY).facts.habit, undefined);
});

test('checks.js passes on the pretend phone (the screen check is left to the phone)', function () {
  fresh();
  fixture.FILES.forEach(function (name) { world.files['modules/phone-night/samples/' + name + '.txt'] = TEXTS[name]; });
  clock.now = t('15:00');
  delete require.cache[path.join(ROOT, 'checks.js')];
  delete require.cache[MAIN_PATH];
  var checks = require(path.join(ROOT, 'checks.js'));
  function Skip(why) { this.why = why; }
  var helper = {
    ok: function (condition, text) { if (!condition) throw new Error(text || 'условие не выполнено'); },
    equal: function (a, b, text) { assert.deepStrictEqual(a, b, text); },
    skip: function (why) { throw new Skip(why); },
    wait: function () {},
    screen: function () { throw new Skip('экран — только на телефоне'); }
  };
  var ran = [];
  Object.keys(checks).forEach(function (name) {
    try {
      checks[name](helper);
      ran.push('ok');
    } catch (error) {
      if (error instanceof Skip) { ran.push('skip'); return; }
      throw new Error(name + ': ' + (error && error.message));
    }
  });
  assert.deepStrictEqual(ran, ['ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'skip']);
  assert.strictEqual(world.dbs['phone-night'].query('select count(*) as n from reports')[0].n, 0, 'проверки убрали за собой отчёт');
  assert.strictEqual(world.dbs['phone-night'].query('select count(*) as n from events')[0].n, 0, 'проверки убрали за собой событие');
  assert.strictEqual(world.files['data/phone-night/settings.json'], undefined, 'файла настроек не было — и не осталось');
});

Date.now = realNow;
console.log((count - failed) + ' из ' + count + ' прошли');
if (failed) process.exitCode = 1;
