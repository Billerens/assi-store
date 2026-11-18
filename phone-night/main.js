// Тайная жизнь телефона: a morning report of what the phone did at night while its owner slept —
// who woke it, who went online, where the battery went. Told with a smile, every number real.
// The description: docs/modules/phone-night.md in Axiko.
//
// Sources: the live journal of Axiko (on screen / notification / power / network, written only
// in the night's window), UsageStatsManager, NetworkStatsManager, the battery, and through
// Shizuku (or as Axiko itself, if empower gave it DUMP) dumpsys alarm, batterystats --history and
// --checkin, deviceidle, jobscheduler — an evening and a morning snapshot. The pure logic is in
// night.js (facts, template, honesty check, trends) and parse.js (dumpsys formats).
//
// Storage: data/phone-night.db (events, snapshots, reports), raw outputs in
// data/phone-night/raw/<day>/, settings in data/phone-night/settings.json; the night's summary
// and the owner's night sessions go to lib/base.js.
var axiko = require('lib/axiko');
var parse = require('./parse');
var night = require('./night');
var settingsLib = require('./settings');
var phone = require('./android');

var ID = 'phone-night';
var MAIN = 'modules/phone-night/main.js';
var SCREEN = 'modules/phone-night/ui/index.html';
var SETTINGS_PATH = 'data/phone-night/settings.json';
var RAW = 'data/phone-night/raw';
var BOOT_PATH = 'data/phone-night/boot.json';
var ROLE = 'phone-night.story';
var TOOL_PATH = 'tools/phone_night.js';
var TOOL_MARK = '// Инструмент модуля «Тайная жизнь телефона»';
var JOBS = ['phone-night.evening', 'phone-night.morning', 'phone-night.late'];
var DAY = 864e5;
var HOUR = 36e5;

// What lives as long as the process (a reload of this file after an edit keeps it).
var G = typeof global !== 'undefined' ? global : {};
var LIVE = G.__phoneNightLive || (G.__phoneNightLive = {
  lock: new java.util.concurrent.locks.ReentrantLock(),
  notices: {},
  noticesAt: 0,
  doneNight: null,
  modelAt: 0,
  model: null
});

function message(error) {
  return phone.message(error);
}

function locked(fn) {
  LIVE.lock.lock();
  try {
    return fn();
  } finally {
    LIVE.lock.unlock();
  }
}

function changed(type, key) {
  try { emit('phone-night.changed', { type: type, night: key || null }); } catch (error) { /* no screens */ }
}

function refreshWidget() {
  try { axiko.widget.refresh(ID); } catch (error) { /* no widget */ }
}

// ---- storage -----------------------------------------------------------------------------------

var db = axiko.db('phone-night');
db.exec('create table if not exists events (id integer primary key autoincrement, at integer not null, kind text not null, package text, extra text)');
db.exec('create index if not exists events_at on events (at)');
db.exec('create table if not exists snapshots (id integer primary key autoincrement, night text not null, phase text not null, at integer, ' +
  'uptime integer, battery integer, charging integer, temp real, alarm_stats text, checkin text, ok_sources text, extra text)');
db.exec('create unique index if not exists snapshots_night on snapshots (night, phase)');
db.exec('create table if not exists reports (night text primary key, "from" integer, "to" integer, facts text, summary text, story text, ' +
  'template integer, created integer, notified integer)');

function json(text, fallback) {
  if (text === null || text === undefined || text === '') return fallback;
  try {
    return JSON.parse(String(text));
  } catch (error) {
    return fallback;
  }
}

// ---- settings ------------------------------------------------------------------------------------

function values() {
  try {
    return settingsLib.normalize(axiko.files.readJson(SETTINGS_PATH, {}));
  } catch (error) {
    return settingsLib.defaults();
  }
}

/** -> { values, schema } — the «Настройки» tab is drawn from the schema. */
exports.settings = function () {
  return { values: values(), schema: settingsLib.SCHEMA };
};

/** Saves the given values (all or some), re-registers the jobs; -> the normalized values. */
exports.saveSettings = function (input) {
  var merged = values();
  Object.keys(input || {}).forEach(function (key) { merged[key] = input[key]; });
  var next = settingsLib.normalize(merged);
  axiko.files.writeJson(SETTINGS_PATH, next);
  register(next);
  changed('settings');
  return next;
};

function register(s) {
  JOBS.forEach(function (key) {
    try { unjob(key); } catch (error) { /* none */ }
  });
  if (!s.enabled) return;
  job('phone-night.evening', { at: s.nightStart }, function () { require(MAIN).snapshotEvening(); });
  job('phone-night.morning', { at: s.nightEnd }, function () { require(MAIN).morning('time'); });
  job('phone-night.late', { at: s.lateReportAt }, function () { require(MAIN).morning('late'); });
}

/** The night the screen shows now: the one going on (from the evening) or the last one. */
function currentNight(now, s) {
  var key = night.nightKey(now, s.dayBoundary);
  return now < night.logFrom(key, s) ? night.prevNight(key) : key;
}

// ---- the live journal ------------------------------------------------------------------------------

function record(kind, pkg, extra, at) {
  db.exec('insert into events (at, kind, package, extra) values (?, ?, ?, ?)',
    [at || Date.now(), kind, pkg || null, extra ? JSON.stringify(extra) : null]);
  return db.lastId();
}

var SCREEN_KINDS = { on: 'screen_on', off: 'screen_off', unlocked: 'unlock' };

/**
 * The handler of the phone's events (on screen / notification / power / network). Writes only
 * in the night's window. options.test: write whatever the time (checks), start nothing.
 * -> { id, kind } or { skipped }
 */
exports.handle = function (name, data, options) {
  options = options || {};
  data = data || {};
  var s = values();
  var now = Date.now();
  if (!s.enabled) return { skipped: 'журнал выключен' };
  if (!options.test && !night.logging(now, s)) return { skipped: 'не ночь' };
  var kind = null;
  var pkg = null;
  var extra = null;
  if (name === 'screen') {
    kind = SCREEN_KINDS[String(data.state)];
    if (!kind) return { skipped: 'неизвестное состояние экрана' };
  } else if (name === 'notification') {
    if (data.ongoing === true) return { skipped: 'постоянное уведомление' };
    pkg = data.package ? String(data.package) : null;
    var key = String(data.key || (pkg + '|' + (data.title || '')));
    var last = LIVE.notices[key];
    if (last && now - last < s.noticeRepeatSeconds * 1000) return { skipped: 'обновление того же уведомления' };
    LIVE.notices[key] = now;
    if (now - LIVE.noticesAt > HOUR) {
      Object.keys(LIVE.notices).forEach(function (seen) { if (now - LIVE.notices[seen] > HOUR) delete LIVE.notices[seen]; });
      LIVE.noticesAt = now;
    }
    kind = 'notification';
    // The text is not kept: only its length.
    extra = { app: data.app ? String(data.app) : null, len: String(data.text || '').length };
  } else if (name === 'power') {
    kind = 'power';
    extra = { charging: Boolean(data.charging) };
  } else if (name === 'network') {
    kind = 'network';
    extra = { online: Boolean(data.online), wifi: Boolean(data.wifi) };
  } else {
    return { skipped: 'неизвестное событие' };
  }
  var id = record(kind, pkg, extra, now);
  if (kind === 'unlock' && !options.test) maybeMorning(now, s);
  return { id: id, kind: kind };
};

function maybeMorning(now, s) {
  if (s.reportWhen === 'time') return;
  var key = night.nightKey(now, s.dayBoundary);
  if (LIVE.doneNight === key || !night.mayReport(now, key, s)) return;
  spawn(function () {
    try {
      require(MAIN).morning('unlock');
    } catch (error) {
      console.error('phone-night: утро: ' + message(error));
    }
  });
}

/** Removes events the checks made (by id). */
exports.dropEvents = function (ids) {
  (ids || []).forEach(function (id) { db.exec('delete from events where id = ?', [id]); });
  return true;
};

// ---- snapshots --------------------------------------------------------------------------------------

function rawDir(key) {
  // One folder per night, named by its morning: data/phone-night/raw/2026-11-14/.
  return RAW + '/' + night.nextNight(key) + '/';
}

function readRaw(path) {
  try {
    return axiko.files.read(path);
  } catch (error) {
    return '';
  }
}

/** A dumpsys output parsed: -> { source: { ok, via, note }, value } */
function dumped(command, path, parser, s) {
  var done = phone.dump(command, path, s);
  if (!done.ok) return { source: { ok: false, via: '', note: done.note }, value: null };
  var value = parser(readRaw(path), done);
  var ok = Boolean(value && value.ok);
  return { source: { ok: ok, via: done.via, note: ok ? done.note || '' : value && value.note ? value.note : 'не разобрано' }, value: value };
}

function snapshotRow(row) {
  if (!row) return null;
  return {
    night: row.night, phase: row.phase, at: row.at, uptime: row.uptime, battery: row.battery,
    charging: row.charging === null ? null : Boolean(row.charging), temp: row.temp,
    alarm: json(row.alarm_stats, null), checkin: json(row.checkin, null),
    sources: json(row.ok_sources, {}), extra: json(row.extra, {})
  };
}

function snapshotOf(key, phase) {
  var rows = db.query('select * from snapshots where night = ? and phase = ?', [key, phase]);
  return rows.length ? snapshotRow(rows[0]) : null;
}

function takeSnapshot(key, phase, s, now) {
  var sources = {};
  var battery = phone.battery();
  sources.battery = { ok: battery.ok, via: 'ACTION_BATTERY_CHANGED', note: battery.note };
  var uptime = phone.uptime();
  var dir = rawDir(key);
  var alarm = dumped('dumpsys alarm', dir + phase + '-alarm.txt', function (text) { return parse.parseAlarm(text); }, s);
  sources.alarm = alarm.source;
  var checkin = dumped('dumpsys batterystats --checkin', dir + phase + '-checkin.txt', function (text, done) {
    if (done.truncated) return { ok: false, note: 'вывод --checkin слишком длинный и обрезан — не используется' };
    return parse.parseCheckin(text);
  }, s);
  sources.checkin = checkin.source;
  var extra = {};
  if (phase === 'morning') {
    var historyPath = dir + 'morning-history.txt';
    var done = phone.dump('dumpsys batterystats --history', historyPath, s);
    if (done.ok) {
      var reader = parse.historyReader({ from: night.logFrom(key, s), to: now, year: new Date(now).getFullYear() });
      var head = '';
      var count = phone.eachLine(historyPath, function (line) {
        if (head.length < 600) head += line + '\n';
        reader.line(line);
      });
      var history = count < 0 ? { ok: false, note: 'файл ленты не прочитан' } : parse.denied(head) ? { ok: false, note: 'dumpsys batterystats не ответил' } : reader.result();
      if (history.ok) {
        extra.history = history;
        sources.history = { ok: true, via: done.via, note: done.note || '' };
      } else {
        extra.historyNote = history.note;
        sources.history = { ok: false, via: done.via, note: history.note };
      }
    } else {
      extra.historyNote = done.note;
      sources.history = { ok: false, via: '', note: done.note };
    }
    var idle = dumped('dumpsys deviceidle', dir + 'morning-deviceidle.txt', function (text) { return parse.parseDeviceIdle(text); }, s);
    sources.deviceidle = idle.source;
    if (idle.value) extra.deviceIdle = idle.value;
    var jobs = dumped('dumpsys jobscheduler', dir + 'morning-jobscheduler.txt', function (text) { return parse.parseJobs(text, now); }, s);
    sources.jobscheduler = jobs.source;
    if (jobs.value) extra.jobs = jobs.value;
    // The reason of the boot only matters when the phone booted during the night.
    var evening = snapshotOf(key, 'evening');
    var bootedAt = now - uptime;
    if (!evening || bootedAt > evening.at - 60000) {
      var props = phone.run('getprop sys.boot.reason; getprop ro.boot.bootreason; getprop persist.sys.boot.reason', false, s);
      var restart = phone.run("settings list global | grep -i -E 'restart|reboot'; settings list system | grep -i -E 'restart|reboot'; " +
        "settings list secure | grep -i -E 'restart|reboot'", true, s);
      extra.boot = { reason: parse.bootReason(props.out), autoRestart: restart.out ? parse.autoRestart(restart.out) : null, at: bootedAt };
      sources.boot = { ok: Boolean(extra.boot.reason), via: 'getprop', note: extra.boot.reason ? '' : props.note || 'причина загрузки не прочитана' };
    } else {
      sources.boot = { ok: true, via: 'время работы', note: 'перезагрузок с вечера не было' };
    }
  }
  db.exec('insert or replace into snapshots (night, phase, at, uptime, battery, charging, temp, alarm_stats, checkin, ok_sources, extra) ' +
    'values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [
    key, phase, now, uptime, battery.level, battery.charging === null ? null : (battery.charging ? 1 : 0), battery.temp,
    alarm.value ? JSON.stringify(alarm.value) : null, checkin.value ? JSON.stringify(checkin.value) : null,
    JSON.stringify(sources), JSON.stringify(extra)
  ]);
  cleanRaw(s);
  return snapshotOf(key, phase);
}

function snapshotSummary(shot) {
  if (!shot) return null;
  var sources = {};
  Object.keys(shot.sources || {}).forEach(function (id) {
    var source = shot.sources[id];
    sources[id] = source.ok ? 'да' + (source.via ? ' (' + source.via + ')' : '') : 'нет — ' + (source.note || 'нет данных');
  });
  return { night: shot.night, phase: shot.phase, at: shot.at, battery: shot.battery, charging: shot.charging, ok_sources: sources };
}

/** The evening snapshot (the job at the night's start). -> { night, phase, at, battery, ok_sources } */
exports.snapshotEvening = function (key) {
  var s = values();
  if (!s.enabled) return { skipped: 'журнал выключен' };
  var now = Date.now();
  key = key || night.nightKey(now, s.dayBoundary);
  var shot = locked(function () { return takeSnapshot(key, 'evening', s, now); });
  changed('snapshot', key);
  return snapshotSummary(shot);
};

/** The morning snapshot, without the report. -> { night, phase, at, battery, ok_sources } */
exports.snapshotMorning = function (key) {
  var s = values();
  var now = Date.now();
  key = key || night.nightKey(now, s.dayBoundary);
  var shot = locked(function () { return takeSnapshot(key, 'morning', s, now); });
  changed('snapshot', key);
  return snapshotSummary(shot);
};

// ---- gathering a night ---------------------------------------------------------------------------------

var SOURCE_LABELS = {
  live: 'Журнал Axiko', usage: 'Статистика Android (UsageStatsManager)', netstats: 'Трафик (NetworkStatsManager)',
  battery: 'Батарея', alarm: 'Будильники приложений (dumpsys alarm)', history: 'Лента батареи (batterystats --history)',
  checkin: 'Wakelock и процессор (batterystats --checkin)', deviceidle: 'Белый список Doze (dumpsys deviceidle)',
  jobscheduler: 'Фоновые задания (dumpsys jobscheduler)', boot: 'Причина загрузки'
};

function sourceOf(id, ok, via, note) {
  return { id: id, label: SOURCE_LABELS[id], ok: Boolean(ok), via: via || '', note: note || '' };
}

/** Both snapshots' word on a dumpsys source. */
function pairSource(id, evening, morning, needEvening) {
  var e = evening && evening.sources ? evening.sources[id] : null;
  var m = morning && morning.sources ? morning.sources[id] : null;
  if (!m) return sourceOf(id, false, '', morning ? 'нет данных' : 'утреннего снимка ещё не было');
  if (needEvening && !e) return sourceOf(id, false, '', 'вечернего снимка не было — модуль запустили позже начала ночи');
  if (needEvening && !e.ok) return sourceOf(id, false, '', 'вечером: ' + (e.note || 'нет данных'));
  return sourceOf(id, m.ok, m.via, m.note);
}

/** Everything night.buildFacts needs, read from the journal, the snapshots and Android. */
function gather(key, s, now) {
  var evening = snapshotOf(key, 'evening');
  var morning = snapshotOf(key, 'morning');
  var from = night.logFrom(key, s);
  var end = morning ? morning.at : Math.min(now, night.dayEnd(key, s));
  var live = db.query('select at, kind, package, extra from events where at >= ? and at < ? order by at', [from, end]).map(function (row) {
    return { at: row.at, kind: row.kind, package: row.package || null, extra: json(row.extra, null), src: 'live' };
  });
  var usage = phone.usageEvents(from - s.lookbackHours * HOUR, end);
  var history = morning && morning.extra && morning.extra.history ? morning.extra.history : null;
  var historyScreen = history ? (history.screen || []).map(function (event) {
    return { at: event.at, kind: event.on ? 'screen_on' : 'screen_off', src: 'history' };
  }) : [];
  var events = night.mergeEvents([live, usage.events, historyScreen], s.mergeSeconds * 1000);
  var window = night.detectWindow(events, key, s, end);
  var traffic = phone.traffic(window.from, window.to);

  var alarmDiff = parse.alarmDiff(evening ? evening.alarm : null, morning ? morning.alarm : null);
  var checkinDiff = parse.checkinDiff(evening ? evening.checkin : null, morning ? morning.checkin : null);
  var deviceIdle = morning && morning.extra ? morning.extra.deviceIdle || null : null;
  var jobs = morning && morning.extra ? morning.extra.jobs || null : null;
  var boot = morning && morning.extra && morning.extra.boot ? morning.extra.boot : { reason: null, autoRestart: null };

  // Names of the apps that appear anywhere this night.
  var pkgs = [];
  var uids = [];
  events.forEach(function (event) { if (event.package) pkgs.push(event.package); });
  (alarmDiff.packages || []).forEach(function (row) { pkgs.push(row.pkg); if (row.uid !== null && row.uid !== undefined) uids.push(row.uid); });
  if (deviceIdle && deviceIdle.user) deviceIdle.user.forEach(function (pkg) { pkgs.push(pkg); });
  if (jobs && jobs.jobs) jobs.jobs.forEach(function (row) { if (row.pkg) pkgs.push(row.pkg); if (row.uid !== null && row.uid !== undefined) uids.push(row.uid); });
  Object.keys(traffic.rows || {}).forEach(function (uid) { uids.push(Number(uid)); });
  (checkinDiff.uids || []).forEach(function (row) { uids.push(row.uid); });
  if (history) {
    (history.alarms || []).forEach(function (alarm) { if (alarm.uid !== null) uids.push(alarm.uid); });
    Object.keys(history.jobs || {}).forEach(function (uid) { uids.push(Number(uid)); });
  }
  var names = morning && morning.checkin && morning.checkin.names ? morning.checkin.names : {};
  var apps = phone.apps(unique(pkgs), unique(uids), names);

  var notices = phone.noticesOn();
  var liveCount = live.filter(function (event) { return event.kind !== 'axiko_start'; }).length;
  var liveNote = !s.enabled ? 'журнал выключен в настройках'
    : notices === false ? 'нет доступа к уведомлениям — журнал видит только экран, зарядку и сеть'
      : liveCount ? '' : 'журнал за эту ночь пуст: Axiko не работал или был выключен';
  var sources = [
    sourceOf('live', s.enabled && liveCount > 0, 'подписки Axiko', liveNote),
    sourceOf('usage', usage.ok, 'статистика Android', usage.note),
    sourceOf('netstats', traffic.ok, 'статистика Android', traffic.ok ? '' : traffic.note),
    sourceOf('battery', Boolean((evening && evening.battery !== null) || history), history ? 'лента батареи' : 'снимки',
      evening && evening.battery !== null ? '' : 'вечернего снимка батареи не было'),
    pairSource('alarm', evening, morning, true),
    pairSource('history', evening, morning, false),
    pairSource('checkin', evening, morning, true),
    pairSource('deviceidle', evening, morning, false),
    pairSource('jobscheduler', evening, morning, false),
    pairSource('boot', evening, morning, false)
  ];
  // Both snapshots answered, yet the difference is not usable (a reboot, a reset on the charger).
  sources.forEach(function (source) {
    var diff = source.id === 'alarm' ? alarmDiff : source.id === 'checkin' ? checkinDiff : null;
    if (diff && !diff.ok && source.ok) {
      source.ok = false;
      source.note = diff.note;
    }
  });

  return {
    night: key, now: now, events: events, links: neighbours(key, s, end),
    live: { ok: s.enabled && notices !== false, note: liveNote },
    usage: { ok: usage.ok, note: usage.note },
    evening: evening, morning: morning,
    history: history, historyNote: morning && morning.extra ? morning.extra.historyNote || '' : 'утреннего снимка ещё не было',
    alarmDiff: alarmDiff, checkinDiff: checkinDiff, traffic: traffic, jobs: jobs, deviceIdle: deviceIdle, boot: boot,
    apps: apps, sources: sources
  };
}

// ---- the neighbours -------------------------------------------------------------------------------------
// Every link is optional: a module that is not installed (or a setting turned off) gives nothing,
// and the report simply has no line for it.

var LINKS = {
  health: 'modules/health/main.js', focus: 'modules/focus/main.js',
  wallpapers: 'modules/wallpapers/main.js', horoscope: 'modules/horoscope/main.js'
};
var LINK_SCREENS = { wallpapers: 'modules/wallpapers/ui/index.html', horoscope: 'modules/horoscope/ui/index.html' };

/** A neighbour's main.js, or null when it is not installed or does not load. */
function neighbour(id) {
  try {
    if (!axiko.files.exists(LINKS[id])) return null;
    return require(LINKS[id]);
  } catch (error) {
    return null;
  }
}

function baseRecords(kind, since, until) {
  try {
    return require('lib/base').find({ kind: kind, since: since, until: until, limit: 1000, oldestFirst: true }) || [];
  } catch (error) {
    return [];
  }
}

/**
 * What other modules recorded around night `key`: game sessions, purchases, the story the owner
 * fell asleep to (lib/base.js), the focus sessions of the day and the night (base records `focus`;
 * whether «do not disturb» was on — from the focus module itself, when it is installed).
 * night.linkFacts keeps what falls in the window.
 */
function neighbours(key, s, end) {
  var from = night.logFrom(key, s);
  var until = Math.max(end, night.dayEnd(key, s));
  var out = { plays: [], purchases: [], stories: [], focus: [] };
  if (s.linkGames) out.plays = baseRecords('play', from, until);
  if (s.linkSpending) out.purchases = baseRecords('expense', from, until);
  if (s.linkSeries) out.stories = baseRecords('story', from - s.lookbackHours * HOUR, until);
  if (s.linkFocus) {
    var focus = null;
    var looked = false;
    out.focus = baseRecords('focus', night.dayStart(key), until).map(function (record) {
      var minutes = Number(record.amount) || 0;
      var row = {
        at: record.at, from: record.at, to: record.at + minutes * 60000, minutes: minutes,
        attempts: record.data ? Number(record.data.blockedAttempts) || 0 : 0, dnd: null
      };
      // «Do not disturb» matters only for sessions reaching into the night.
      if (row.to > from && record.data && record.data.sessionId) {
        if (!looked) {
          focus = neighbour('focus');
          looked = true;
        }
        try {
          var told = focus && typeof focus.summary === 'function' ? focus.summary(record.data.sessionId) : null;
          if (told && told.session) {
            row.dnd = Boolean(told.session.dndOk);
            if (told.session.startAt) row.from = told.session.startAt;
            if (told.session.endAt) row.to = told.session.endAt;
          }
        } catch (error) { /* unknown then */ }
      }
      return row;
    });
  }
  return out;
}

/**
 * «Ночь без телефона — плюс к привычке»: with the setting on, a night without unlocks (no more
 * than habitMaxUnlocks) marks the owner's habit in «Здоровье» on the morning's day. Only when the
 * screen was really watched (the journal or the usage statistics answered).
 * -> { title, marked, already, note } or null (nothing to do)
 */
function markHabit(facts, s) {
  if (!s.habitMark || !s.habitName) return null;
  var watched = (facts.sources || []).some(function (source) { return (source.id === 'live' || source.id === 'usage') && source.ok; });
  if (!watched) return { title: s.habitName, marked: false, note: 'экран ночью не наблюдался — отметка не ставится' };
  if (facts.screen.unlocks > s.habitMaxUnlocks) return null;
  var health = neighbour('health');
  if (!health || typeof health.markHabit !== 'function') return { title: s.habitName, marked: false, note: 'модуль «Здоровье» не установлен' };
  try {
    var done = health.markHabit(s.habitName, null, facts.window.to);
    return { title: done && done.title ? done.title : s.habitName, marked: true, already: Boolean(done && done.already), note: '' };
  } catch (error) {
    return { title: s.habitName, marked: false, note: message(error) };
  }
}

/**
 * The morning bundle: today's wallpaper and horoscope beside the report, read-only (nothing is
 * made or set here). -> { wallpaper, horoscope } or null when neither module has anything for today.
 */
function morningBundle(key, s) {
  if (!s.morningBundle) return null;
  var out = { wallpaper: null, horoscope: null };
  var morningDay = night.nextNight(key);
  var dayFrom = night.dayStart(morningDay);
  var wallpapers = neighbour('wallpapers');
  if (wallpapers && typeof wallpapers.history === 'function') {
    try {
      var row = (wallpapers.history({ limit: 1 }) || [])[0];
      if (row && row.set_at >= dayFrom) {
        out.wallpaper = { title: row.title || 'Обои дня', credit: row.credit || '', thumb: row.thumbUrl || '', at: row.set_at, open: LINK_SCREENS.wallpapers };
      }
    } catch (error) { /* no wallpaper then */ }
  }
  var horoscope = neighbour('horoscope');
  if (horoscope && typeof horoscope.day === 'function') {
    try {
      var file = horoscope.day(morningDay);
      if (file) {
        var first = (file.predictions || []).filter(function (p) { return p.id !== 'calm' && p.claim; })[0];
        var said = first ? first.claim : (/^[^.!?]*[.!?]?/.exec(String(file.text || '').trim()) || [''])[0];
        if (said) out.horoscope = { text: said, open: LINK_SCREENS.horoscope };
      }
    } catch (error) { /* no horoscope then */ }
  }
  return out.wallpaper || out.horoscope ? out : null;
}

/** The bundle as one line of the morning notification. */
function bundleLine(bundle) {
  if (!bundle) return '';
  var parts = [];
  if (bundle.wallpaper) parts.push('Обои дня: «' + bundle.wallpaper.title + '».');
  if (bundle.horoscope) parts.push('Звёзды: ' + bundle.horoscope.text.replace(/[.!?]?$/, '.'));
  return parts.join(' ');
}

function unique(list) {
  var seen = {};
  var out = [];
  list.forEach(function (item) {
    var key = String(item);
    if (item === null || item === undefined || seen[key]) return;
    seen[key] = true;
    out.push(item);
  });
  return out;
}

// ---- the story ---------------------------------------------------------------------------------------------

function templateStory(template, note) {
  return {
    by: 'template', headline: template.headline, lines: template.lines.map(function (line) { return line.text; }),
    tip: template.tip, note: note || '', errors: [], attempts: 0
  };
}

/**
 * The story of the night: the model in the chosen style, checked against the facts; one more try
 * with the errors named; then the template. ask(prompt) replaces the model (checks).
 * -> { by: 'model'|'template', headline, lines, tip, note, errors, attempts }
 */
exports.tell = function (facts, s, ask) {
  s = s || values();
  var template = night.templateReport(facts, s);
  if (!s.useModel) return templateStory(template, 'рассказ моделью выключен');
  var mf = night.modelFacts(facts);
  var errors = [];
  for (var attempt = 1; attempt <= 2; attempt++) {
    var prompt = night.storyPrompt(mf, s.style, s, attempt > 1 ? errors : null);
    var answer;
    try {
      answer = ask ? ask(prompt) : require('lib/ai').ask({ role: ROLE, system: prompt.system, prompt: prompt.prompt, json: true });
    } catch (error) {
      if (error && error.name === 'SyntaxError') {
        errors = ['ответ — не JSON'];
        continue;
      }
      var story = templateStory(template, 'модель не ответила: ' + message(error));
      story.attempts = attempt;
      return story;
    }
    var check = night.checkStory(answer, mf, s);
    if (check.ok) {
      return { by: 'model', headline: check.story.headline, lines: check.story.lines, tip: check.story.tip, note: '', errors: errors, attempts: attempt };
    }
    errors = check.errors;
  }
  var fallback = templateStory(template, 'рассказ модели не прошёл проверку: ' + errors.join('; '));
  fallback.errors = errors;
  fallback.attempts = 2;
  return fallback;
};

// ---- the report -----------------------------------------------------------------------------------------------

/** What lists and trends need of a night: small, kept beside the full facts. */
function lite(facts) {
  var b = facts.battery;
  var w = facts.wakers || {};
  return {
    night: facts.night, title: facts.title,
    window: { from: facts.window.from, to: facts.window.to, minutes: facts.window.minutes, how: facts.window.how },
    battery: b ? { start: b.start, end: b.end, drop: b.drop, source: b.source, charging: { any: Boolean(b.charging && b.charging.any), whole: Boolean(b.charging && b.charging.whole) } } : null,
    screen: facts.screen, owner: { minutes: facts.owner.minutes, count: facts.owner.count },
    wakers: { ok: Boolean(w.ok), total: w.total || 0, top: w.top || [], list: (w.list || []).slice(0, 30) },
    traffic: { ok: Boolean(facts.traffic && facts.traffic.ok), totalMb: facts.traffic ? facts.traffic.totalMb : null, top: facts.traffic ? facts.traffic.top : [] },
    notifications: { total: facts.notifications ? facts.notifications.total : 0 },
    doze: { ok: Boolean(facts.doze && facts.doze.ok), fullMinutes: facts.doze ? facts.doze.fullMinutes : null },
    reboots: (facts.reboots || []).length
  };
}

function summaries(before, limit) {
  return db.query('select night, summary from reports where night < ? order by night desc limit ?', [before, limit]).map(function (row) {
    return { night: row.night, facts: json(row.summary, null) };
  }).filter(function (row) { return row.facts; });
}

/** Facts, template, story and what the screen draws, from a gathered input. */
function compose(input, s, options) {
  options = options || {};
  var facts = night.buildFacts(input, s);
  var previous = options.alone ? [] : summaries(input.night, s.tipNights + 2);
  var tips = night.offenders([{ night: input.night, facts: lite(facts) }].concat(previous), s);
  facts.tip = tips.length ? tips[0] : null;
  var template = night.templateReport(facts, s);
  var story = options.model === false ? templateStory(template, options.why || '') : exports.tell(facts, s, options.ask);
  return {
    night: input.night, title: facts.title, facts: facts, template: template, story: story,
    whence: night.whence(template, facts, story), timeline: night.timeline(facts, s),
    partial: Boolean(options.partial), stored: false
  };
}

function reportRow(key) {
  var rows = db.query('select night, "from" as from_at, "to" as to_at, facts, summary, story, template, created, notified from reports where night = ?', [key]);
  return rows.length ? rows[0] : null;
}

function save(made, s, options) {
  var existing = reportRow(made.night);
  db.exec('insert or replace into reports (night, "from", "to", facts, summary, story, template, created, notified) values (?, ?, ?, ?, ?, ?, ?, ?, ?)', [
    made.night, made.facts.window.from, made.facts.window.to, JSON.stringify(made.facts), JSON.stringify(lite(made.facts)),
    JSON.stringify(made.story), made.story.by === 'model' ? 0 : 1, Date.now(), existing ? existing.notified : null
  ]);
  made.stored = true;
  if (!options || options.base !== false) {
    try { writeBase(made.night, made.facts); } catch (error) { console.warn('phone-night: общая база: ' + message(error)); }
  }
}

function present(row, s) {
  var facts = json(row.facts, null);
  if (!facts) return null;
  var template = night.templateReport(facts, s);
  var story = json(row.story, null) || templateStory(template, '');
  return {
    night: row.night, title: facts.title, facts: facts, template: template, story: story,
    whence: night.whence(template, facts, story), timeline: night.timeline(facts, s),
    partial: false, stored: true, created: row.created, notified: row.notified
  };
}

/** The habit's mark joins the facts; the template (and a template story) get its line. */
function withHabit(made, habit, s) {
  if (!habit) return;
  made.facts.habit = habit;
  made.template = night.templateReport(made.facts, s);
  if (made.story.by === 'template') made.story.lines = made.template.lines.map(function (line) { return line.text; });
  made.whence = night.whence(made.template, made.facts, made.story);
}

/** options.morning: the morning's own build — the habit of a night without the phone is marked. */
function build(key, s, now, options) {
  var hasMorning = snapshotOf(key, 'morning');
  var morningTime = now >= night.morningFrom(key, s);
  if (!hasMorning && morningTime && now < night.dayEnd(key, s)) {
    takeSnapshot(key, 'morning', s, now);
    hasMorning = true;
  }
  var partial = !hasMorning && !morningTime;
  var made = compose(gather(key, s, now), s, partial ? { model: false, partial: true, why: 'ночь ещё идёт — рассказ будет утром' } : {});
  if (!partial) {
    if (options && options.morning) {
      withHabit(made, markHabit(made.facts, s), s);
    } else {
      // A rebuild keeps the mark the morning made (it is not made twice).
      var kept = reportRow(key);
      var before = kept ? json(kept.facts, null) : null;
      if (before && before.habit) withHabit(made, before.habit, s);
    }
    save(made, s);
  }
  return made;
}

/** The morning bundle for the screen: only for the night that ended this morning. */
function bundleFor(made, s, now) {
  if (!made || made.partial || made.empty) return null;
  if (night.nextNight(made.night) !== night.dayKey(now)) return null;
  return morningBundle(made.night, s);
}

/** Builds the report of a night again (default — the current or the last one) and keeps it. */
exports.buildReport = function (key) {
  var s = values();
  var now = Date.now();
  key = key || currentNight(now, s);
  var made = locked(function () { return build(key, s, now); });
  if (made.stored) {
    changed('report', key);
    refreshWidget();
  }
  made.morning = bundleFor(made, s, now);
  made.status = exports.status();
  return made;
};

/** The report of a night as kept (default — the current or the last night); a night going on — a preview. */
exports.report = function (key) {
  var s = values();
  var now = Date.now();
  key = key || currentNight(now, s);
  var row = reportRow(key);
  var made = row ? present(row, s) : null;
  if (!made) {
    var inProgress = now < night.dayEnd(key, s);
    var anything = inProgress || snapshotOf(key, 'evening') || snapshotOf(key, 'morning') ||
      db.query('select count(*) as n from events where at >= ? and at < ?', [night.logFrom(key, s), night.dayEnd(key, s)])[0].n > 0;
    if (!anything) {
      return { night: key, title: night.nightTitle(key), empty: true, status: exports.status() };
    }
    made = locked(function () { return build(key, s, now); });
  }
  made.morning = bundleFor(made, s, now);
  made.status = exports.status();
  return made;
};

/** The morning: the snapshot, the report, the notification. reason: 'unlock' | 'time' | 'late'. */
exports.morning = function (reason) {
  var s = values();
  if (!s.enabled) return { skipped: 'журнал выключен' };
  var now = Date.now();
  var key = night.nightKey(now, s.dayBoundary);
  if (!night.mayReport(now, key, s)) return { skipped: 'не время отчёта' };
  var row = reportRow(key);
  if (row && row.notified) {
    LIVE.doneNight = key;
    return { skipped: 'отчёт за эту ночь уже был' };
  }
  if (reason === 'unlock' && s.reportWhen === 'time') return { skipped: 'отчёт — по времени' };
  if (reason === 'time' && s.reportWhen === 'unlock' && !unlockedSince(night.morningFrom(key, s), now)) {
    // The fallback of the description: at the end of the window the morning snapshot is taken
    // anyway (the counters of the night as they are now); the report waits for the first unlock.
    var snapshot = false;
    if (!snapshotOf(key, 'morning') && LIVE.lock.tryLock()) {
      try {
        takeSnapshot(key, 'morning', s, now);
        snapshot = true;
      } catch (error) {
        console.warn('phone-night: запасной утренний снимок: ' + message(error));
      } finally {
        LIVE.lock.unlock();
      }
      if (snapshot) changed('snapshot', key);
    }
    return { skipped: 'утром телефон ещё не разблокировали', snapshot: snapshot };
  }
  if (!LIVE.lock.tryLock()) return { skipped: 'отчёт уже собирается' };
  var made;
  try {
    made = build(key, s, now, { morning: true });
    db.exec('update reports set notified = ? where night = ?', [now, key]);
    LIVE.doneNight = key;
  } finally {
    LIVE.lock.unlock();
  }
  if (s.reportWhen !== 'never') notifyReport(made, s);
  try { clean(s); } catch (error) { console.warn('phone-night: уборка: ' + message(error)); }
  changed('report', key);
  refreshWidget();
  return { night: key, by: made.story.by, notified: s.reportWhen !== 'never' };
};

function unlockedSince(from, to) {
  var live = db.query("select count(*) as n from events where kind = 'unlock' and at >= ? and at < ?", [from, to])[0].n;
  if (live > 0) return true;
  var usage = phone.usageEvents(from, to);
  return usage.events.some(function (event) { return event.kind === 'unlock'; });
}

function notifyReport(made, s) {
  var text = night.noticeText(made.template, made.story, made.facts, s);
  var extra = '';
  try { extra = bundleLine(morningBundle(made.night, s)); } catch (error) { extra = ''; }
  var options = { title: made.facts.title, text: extra ? text + '\n' + extra : text, open: SCREEN };
  if (phone.has('notify.actions')) {
    options.id = 'phone-night.morning';
    options.silent = s.quietNotice;
    options.channel = s.quietNotice ? 'quiet' : 'normal';
  }
  try {
    axiko.notify(options);
  } catch (error) {
    console.warn('phone-night: уведомление: ' + message(error));
  }
}

// ---- the common base ---------------------------------------------------------------------------------------

function baseOf(key, kinds) {
  var base = require('lib/base');
  var out = [];
  kinds.forEach(function (kind) {
    base.find({ kind: kind, source: ID, since: night.logFrom(key, values()) - DAY, until: night.dayEnd(key, values()) + DAY, limit: 500 })
      .forEach(function (row) { if (row.data && row.data.night === key) out.push(row); });
  });
  return out;
}

function writeBase(key, facts) {
  var base = require('lib/base');
  baseOf(key, ['phone_night', 'screen_time']).forEach(function (row) { base.remove(row.id); });
  var top = facts.wakers && facts.wakers.ok ? facts.wakers.top.filter(function (row) { return row.key !== 'system'; })[0] : null;
  base.add({
    kind: 'phone_night', at: facts.window.to, title: 'Ночь телефона',
    amount: facts.battery ? facts.battery.drop : null, unit: '%',
    data: {
      night: key, wakeups: facts.wakers && facts.wakers.ok ? facts.wakers.total : null, screens: facts.screen.on, unlocks: facts.screen.unlocks,
      ownerMinutes: facts.owner.minutes, topWaker: top ? top.app : null, topWakerPkg: top ? top.pkg : null,
      charging: Boolean(facts.battery && facts.battery.charging && facts.battery.charging.any),
      sessions: facts.owner.sessions.map(function (session) { return { from: night.hhmm(session.from), minutes: session.minutes, app: session.app }; }),
      from: facts.window.from, to: facts.window.to
    },
    source: ID
  });
  // The owner's night sessions — unless «Здоровье» keeps the screen time as its own kind.
  var kinds = base.kinds().map(function (row) { return row.kind; });
  if (kinds.indexOf('screen') >= 0) return;
  facts.owner.sessions.forEach(function (session) {
    base.add({
      kind: 'screen_time', at: session.from, amount: session.minutes, unit: 'min', tags: ['ночь'],
      data: { app: session.app, pkg: session.pkg, night: key, to: session.to }, source: ID
    });
  });
}

// ---- lists, trends, the widget ------------------------------------------------------------------------------

/** Past nights, newest first: [{ night, title, battery, topWaker, wakeups, screens, unlocks, ownerMinutes, by, headline }] */
exports.nights = function (limit) {
  return db.query('select night, summary, story, template from reports order by night desc limit ?', [Math.max(1, Math.min(Number(limit) || 60, 400))])
    .map(function (row) {
      var f = json(row.summary, null);
      if (!f) return null;
      var story = json(row.story, {});
      var top = f.wakers && f.wakers.ok ? (f.wakers.top || []).filter(function (item) { return item.key !== 'system'; })[0] : null;
      return {
        night: row.night, title: f.title, battery: f.battery, window: f.window,
        topWaker: top ? { app: top.app, pkg: top.pkg, wakeups: top.wakeups } : null,
        wakeups: f.wakers && f.wakers.ok ? f.wakers.total : null,
        screens: f.screen ? f.screen.on : null, unlocks: f.screen ? f.screen.unlocks : null,
        ownerMinutes: f.owner ? f.owner.minutes : null, reboots: f.reboots || 0,
        by: story.by || (row.template ? 'template' : 'model'), headline: story.headline || f.title
      };
    }).filter(function (row) { return row; });
};

/**
 * For other modules (Питомец and anyone else): how much the owner was in the phone at night — the
 * last reported night, or night `key` ('2026-11-13'). The same number as data.ownerMinutes of the
 * base record `phone_night`.
 * -> { night, to, ownerMinutes, sessions, unlocks, screens } or null when there is no report.
 */
exports.ownerNight = function (key) {
  var rows = key && /^\d{4}-\d{2}-\d{2}$/.test(String(key))
    ? db.query('select night, summary from reports where night = ?', [String(key)])
    : db.query('select night, summary from reports order by night desc limit 1');
  var f = rows.length ? json(rows[0].summary, null) : null;
  if (!f || !f.owner) return null;
  return {
    night: rows[0].night, to: f.window ? f.window.to : null, ownerMinutes: f.owner.minutes, sessions: f.owner.count,
    unlocks: f.screen ? f.screen.unlocks : null, screens: f.screen ? f.screen.on : null
  };
};

/** The nights of the last `days` (default — the setting), average loss, frequent offenders. */
exports.trends = function (days) {
  var s = values();
  if (days) s.trendDays = Math.max(1, Math.min(Number(days) || s.trendDays, 3650));
  var since = night.dayKey(Date.now() - s.trendDays * DAY);
  var reports = db.query('select night, summary from reports where night >= ? order by night', [since]).map(function (row) {
    return { night: row.night, facts: json(row.summary, null) };
  }).filter(function (row) { return row.facts; });
  return night.trendsOf(reports, s, Date.now());
};

/** The widget: the last night in a few lines. */
exports.widget = function () {
  var s = values();
  var rows = db.query('select night from reports order by night desc limit 1');
  if (!rows.length) return { title: 'Ночь телефона', text: 'Отчёт появится утром', open: SCREEN };
  var made = present(reportRow(rows[0].night), s);
  if (!made) return { title: 'Ночь телефона', text: 'Отчёт не прочитан', open: SCREEN };
  return { title: made.facts.title, text: night.noticeText(made.template, made.story, made.facts, s), open: SCREEN };
};

// ---- access and the system screens -------------------------------------------------------------------------------

function modelReady() {
  if (LIVE.model !== null && Date.now() - LIVE.modelAt < 10 * 60000) return LIVE.model;
  var ready = false;
  try {
    var resolved = native('models.resolve', ROLE);
    ready = Boolean(resolved && resolved.model);
  } catch (error) {
    ready = false;
  }
  LIVE.model = ready;
  LIVE.modelAt = Date.now();
  return ready;
}

/** What works now: Shizuku, usage access, notifications, Doze, DUMP, the model, the snapshots of the night. */
exports.status = function () {
  var s = values();
  var now = Date.now();
  var key = currentNight(now, s);
  return {
    enabled: s.enabled, logging: s.enabled && night.logging(now, s), night: key,
    shizuku: phone.shizuku(), usage: phone.usageAccess(), notices: phone.noticesOn(), doze: phone.dozeExempt(),
    dump: phone.selfDump(), features: phone.features(), model: modelReady(), useModel: s.useModel,
    evening: snapshotSummary(snapshotOf(key, 'evening')), morning: snapshotSummary(snapshotOf(key, 'morning')),
    morningFrom: night.morningFrom(key, s), reportWhen: s.reportWhen
  };
};

/** Which sources answer right now (scripts\eval.ps1, the checks): battery, usage, notifications, Shizuku, the model. */
exports.sources = function () {
  var battery = phone.battery();
  return {
    battery: { ok: battery.ok, level: battery.level, charging: battery.charging, temp: battery.temp, note: battery.note },
    usage: phone.usageAccess(), notices: phone.noticesOn(), shizuku: phone.shizuku(), doze: phone.dozeExempt(),
    dump: phone.selfDump(), features: phone.features(), model: modelReady()
  };
};

/** The app's system page, where the owner restricts its background work. */
exports.openAppSettings = function (pkg) {
  if (!pkg || !/^[A-Za-z0-9_.]+$/.test(String(pkg))) throw new Error('Нет такого пакета: ' + pkg);
  return phone.openAppSettings(String(pkg));
};

exports.openUsageAccess = function () { return phone.openUsageAccess(); };
exports.openNotices = function () { return phone.openNotices(); };
exports.openBatterySettings = function () { return phone.openBatterySettings(); };

/** Puts Axiko on the Doze white list (Shizuku), by the owner's button. */
exports.allowDoze = function () {
  var done = phone.allowDoze(values());
  changed('status');
  return done;
};

// ---- checks and keeping ---------------------------------------------------------------------------------------------

/**
 * A report from a ready input (the checks' sample night): { facts, template, story, whence, timeline }.
 * options: { store: keep it as the report of input.night, ask: the model's stand-in, model: false,
 * settings: values to use instead of the owner's }.
 */
exports.fromInput = function (input, options) {
  options = options || {};
  var s = options.settings ? settingsLib.normalize(options.settings) : values();
  var made = compose(input, s, { ask: options.ask, model: options.model, alone: true });
  if (options.store) save(made, s, { base: false });
  return made;
};

/** Forgets a night: its report, snapshots, raw outputs and records in the common base. */
exports.forget = function (key) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(key))) throw new Error('Не дата ночи: ' + key);
  db.exec('delete from reports where night = ?', [key]);
  db.exec('delete from snapshots where night = ?', [key]);
  try { axiko.files.remove(rawDir(key)); } catch (error) { /* none */ }
  try {
    var base = require('lib/base');
    baseOf(key, ['phone_night', 'screen_time']).forEach(function (row) { base.remove(row.id); });
  } catch (error) { /* no base */ }
  changed('forget', key);
  return true;
};

function cleanRaw(s) {
  var dirs = [];
  try {
    dirs = axiko.files.list(RAW).map(String).filter(function (name) { return /^\d{4}-\d{2}-\d{2}\/$/.test(name); }).sort().reverse();
  } catch (error) {
    return;
  }
  dirs.slice(s.rawNights).forEach(function (name) {
    try { axiko.files.remove(RAW + '/' + name.replace(/\/$/, '')); } catch (error) { /* left */ }
  });
}

/** Keeps the journal, snapshots, reports and raw outputs only as long as the settings say. */
function clean(s) {
  var now = Date.now();
  db.exec('delete from events where at < ?', [now - s.eventDays * DAY]);
  db.exec('delete from snapshots where night < ?', [night.dayKey(now - s.eventDays * DAY)]);
  db.exec('delete from reports where night < ?', [night.dayKey(now - s.reportDays * DAY)]);
  cleanRaw(s);
}

exports.clean = function () {
  clean(values());
  return true;
};

// ---- the agent's tool -------------------------------------------------------------------------------------------------

/** For the tool phone_night: the story of a night as text to read aloud. */
exports.toolReport = function (args) {
  args = args || {};
  var key = args.night && /^\d{4}-\d{2}-\d{2}$/.test(String(args.night)) ? String(args.night) : null;
  var made = exports.report(key);
  if (made.empty) return made.title + ': данных нет — модуль в эту ночь ещё не работал.';
  var lines = [made.story.headline || made.title].concat(made.story.lines || []);
  if (made.story.tip) lines.push(made.story.tip);
  else if (made.template.tip) lines.push(made.template.tip);
  if (made.partial) lines.unshift('Ночь ещё идёт, вот что уже видно.');
  if (made.whence.missing.length) {
    lines.push('Не хватило: ' + made.whence.missing.map(function (row) { return row.label + ' — ' + row.note; }).join('; ') + '.');
  }
  return lines.join('\n');
};

function installTool() {
  var stub = TOOL_MARK + ' (modules/phone-night/tools/phone_night.js). Файл ставит сам модуль при запуске;\n' +
    '// удалите модуль — заглушка молча выключится.\n' +
    "try {\n  module.exports = require('modules/phone-night/tools/phone_night.js');\n} catch (error) {\n  exports.name = null;\n}\n";
  var there = axiko.files.exists(TOOL_PATH) ? axiko.files.read(TOOL_PATH) : null;
  if (there === stub) return;
  if (there !== null && there.indexOf(TOOL_MARK) !== 0) return;   // the owner's own tool: not ours to replace
  axiko.files.write(TOOL_PATH, stub);
}

// ---- start --------------------------------------------------------------------------------------------------------------

/**
 * A reboot into the journal: Axiko is not running while the phone restarts, so the event is written
 * at the first start after it — with the moment of the boot (now minus the uptime), when that
 * moment falls in the night's window. data/phone-night/boot.json keeps the last boot seen.
 * -> the event's id or null
 */
function noteBoot(now, s) {
  var uptime = phone.uptime();
  if (!(uptime >= 0)) return null;
  var bootAt = now - uptime;
  var last = axiko.files.readJson(BOOT_PATH, null);
  // The same boot, give or take the clock's drift: a restart of Axiko, not of the phone.
  if (last && Math.abs(bootAt - last.bootAt) < s.mergeSeconds * 1000 + 60000) return null;
  axiko.files.writeJson(BOOT_PATH, { bootAt: bootAt, seen: now });
  if (!last || !s.enabled || !night.logging(bootAt, s)) return null;
  return record('reboot', null, { previousBoot: last.bootAt, uptimeMs: uptime }, bootAt);
}

/** Runs at every start of the app (module.json "autostart"): subscriptions, jobs, catching up. */
exports.start = function () {
  var s = values();
  if (!axiko.files.exists(SETTINGS_PATH)) axiko.files.writeJson(SETTINGS_PATH, s);
  register(s);
  ['screen', 'notification', 'power', 'network'].forEach(function (name) {
    on(name, function (data) {
      try {
        require(MAIN).handle(name, data);
      } catch (error) {
        console.error('phone-night: ' + name + ': ' + message(error));
      }
    }, ID);
  });
  try { installTool(); } catch (error) { console.warn('phone-night: инструмент: ' + message(error)); }
  var now = Date.now();
  try { noteBoot(now, s); } catch (error) { console.warn('phone-night: перезагрузка: ' + message(error)); }
  if (s.enabled && night.logging(now, s)) {
    // A restart of Axiko during the night: the journal may have a gap before this moment.
    record('axiko_start', null, null, now);
    var key = night.nightKey(now, s.dayBoundary);
    var eveningFrom = night.at(key, s.nightStart, s.dayBoundary);
    if (now >= eveningFrom && now < night.morningFrom(key, s) && !snapshotOf(key, 'evening')) {
      spawn(function () {
        try { require(MAIN).snapshotEvening(key); } catch (error) { console.warn('phone-night: вечерний снимок: ' + message(error)); }
      });
    } else if (night.mayReport(now, key, s) && s.reportWhen !== 'time') {
      spawn(function () {
        try {
          if (unlockedSince(night.morningFrom(key, s), Date.now())) require(MAIN).morning('unlock');
        } catch (error) { console.warn('phone-night: утро: ' + message(error)); }
      });
    }
  }
  try { clean(s); } catch (error) { console.warn('phone-night: уборка: ' + message(error)); }
  return 'Тайная жизнь телефона ведёт журнал ночи';
};
