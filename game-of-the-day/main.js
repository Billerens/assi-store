// «Игра дня»: every morning the agent gamesmith makes a new mini game from scratch on the engine of
// «Игротека» (modules/games/daily/<date>/); the owner plays and rates it; what he keeps moves into
// the catalog «На пробу», the rest goes away after keepDays; the ratings become a readable taste
// model that steers the next tasks. Description: docs/modules/game-of-the-day.md in Assi.
//
// Data in data/games/daily/: log.json (a line per day), taste.json (the tag table), taste-week.json
// (the weekly summary), settings.json, journal.json, state.json.
var assi = require('lib/assi');
var files = assi.files;
var days = require('./days.js');
var schema = require('./schema.js');
var taste = require('./taste.js');
var slug = require('./slug.js');
var prompts = require('./prompt.js');
var device = require('./device.js');

var HOME = 'modules/game-of-the-day';
var SCREEN = HOME + '/ui/index.html';
var HUB = 'modules/games';
var HUB_MAIN = HUB + '/main.js';
var GUIDE = HUB + '/AGENT.md';
var DAILY = HUB + '/daily';
var DATA = 'data/games/daily';
var SETTINGS = DATA + '/settings.json';
var LOG = DATA + '/log.json';
var TASTE = DATA + '/taste.json';
var WEEKLY = DATA + '/taste-week.json';
var JOURNAL = DATA + '/journal.json';
var STATE = DATA + '/state.json';
var PLAYS = 'data/games/links/plays.json';
var OUTBOX = 'data/games/achievements-outbox.json';
var AGENT = 'gamesmith';
var NOTICE = 'daily-game';
var ROLE = 'daily-game.taste';
var MEMORY_TAG = 'игра-дня';
var TEXT_FILE = /\.(js|mjs|html?|css|json|md|txt|svg)$/i;

var G = typeof global !== 'undefined' ? global : (function () { return this; })();
var REG = G.__gameOfTheDay || (G.__gameOfTheDay = {});
REG.lock = REG.lock || new java.util.concurrent.locks.ReentrantLock();
if (REG.making === undefined) REG.making = null;

function msg(error) {
  return String(error && error.message ? error.message : error);
}

function locked(fn) {
  REG.lock.lock();
  try {
    return fn();
  } finally {
    REG.lock.unlock();
  }
}

function readJson(path, fallback) {
  try {
    if (!files.exists(path)) return fallback;
    var value = files.readJson(path, fallback);
    return value === null || value === undefined ? fallback : value;
  } catch (error) {
    return fallback;
  }
}

function writeJson(path, value) {
  files.writeJson(path, value);
}

function journal(text) {
  locked(function () {
    var list = readJson(JOURNAL, []);
    if (!Array.isArray(list)) list = [];
    list.push({ at: Date.now(), text: String(text) });
    writeJson(JOURNAL, list.slice(-200));
  });
}

function emitState(phase, extra) {
  var event = { phase: phase };
  Object.keys(extra || {}).forEach(function (key) { event[key] = extra[key]; });
  try {
    emit('daily-game.state', event);
  } catch (error) { /* no screen listens */ }
}

function notify(options) {
  try {
    return assi.notify(options);
  } catch (error) {
    journal('Уведомление не ушло: ' + msg(error));
    return null;
  }
}

/**
 * A game of the day is keyed by its day and slot: «2026-11-14» (the first game of the day, as in
 * the first version), «2026-11-14-2» (the second). The log keeps the key in `date`.
 */
function needDate(date) {
  if (!slug.validKey(date)) throw new Error('Не дата игры дня: ' + date);
  return String(date);
}

function dayOf(key) {
  var k = days.parseKey(key);
  return k ? k.day : String(key);
}

function slotOf(key) {
  var k = days.parseKey(key);
  return k ? k.slot : 0;
}

function newestFirst(a, b) {
  return a.date < b.date ? 1 : a.date > b.date ? -1 : 0;
}

// ---- settings -------------------------------------------------------------------------------------

/** The owner's changes; the first version's makeAt / readyBy / giveUpAt / days become the new schedule once. */
function savedSettings() {
  var saved = readJson(SETTINGS, {});
  saved = saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
  var moved = schema.migrate(saved);
  if (moved.changed) {
    try {
      writeJson(SETTINGS, moved.settings);
      journal('Настройки расписания переведены на новый вид: ' + days.scheduleText(schema.values(moved.settings), schema.values(moved.settings).slots));
    } catch (error) { /* read-only now: migrated again next time */ }
  }
  return moved.settings;
}

function settings() {
  return schema.values(savedSettings());
}

/** The slots that work now: one when the hub does not take a second game of a day yet (multiOk). */
function activeSlots(s) {
  return multiOk() ? s.slots : s.slots.slice(0, 1);
}

/**
 * Does the hub take «daily/2026-11-14-2» — a second game of a day? Its engine (core.js validId,
 * game.js, ui/preview.html) knew only «daily/YYYY-MM-DD» at first.
 */
function multiOk() {
  try {
    var core = require(HUB + '/engine/core.js');   // cached by require: cheap on every call
    return !!(core && typeof core.validId === 'function' && core.validId('daily/2026-01-01-2'));
  } catch (error) {
    return false;
  }
}

/** The window of a game (key) on its day: {make, ready, giveUp}; null when the slot is gone from the settings. */
function windowOf(key, s) {
  var k = days.parseKey(key);
  if (!k) return null;
  return days.slotTimes(days.dayStart(k.day) + 12 * 3600000, s.slots, k.slot, s.giveUpMin);
}

/** The games to come (keys not made yet, not given up), the earliest first: [{key, day, slot, make, ready, giveUp}]. */
function upcoming(s, t, limit) {
  var log = readLog();
  var done = {};
  log.forEach(function (entry) { if (entry.made || entry.final) done[entry.date] = true; });
  if (REG.making) done[REG.making.date] = true;
  return days.upcoming(t, s, activeSlots(s), s.giveUpMin, (limit || 1) + 12)
    .filter(function (one) { return !done[one.key]; }).slice(0, limit || 1);
}

/** The next game for the cards: {key, slot, at (ready), make, when: «завтра в 08:00»}; null when the schedule is off. */
function nextGame(s, t) {
  var one = upcoming(s, t, 1)[0];
  if (!one) return null;
  return { key: one.key, day: one.day, slot: one.slot, at: one.ready, make: one.make, when: days.whenText(one.ready, t) };
}

/** For the settings screen and the cards: the schedule in words and numbers. */
function scheduleView(s, t) {
  var next = nextGame(s, t);
  var slots = activeSlots(s);
  var first = (next && windowOf(next.key, s)) || days.slotTimes(t, slots, 0, s.giveUpMin);
  return {
    frequency: s.frequency, everyDays: s.everyDays, anchor: s.anchor, weekdays: s.weekdays.slice(), slots: s.slots.slice(),
    giveUpMin: s.giveUpMin, text: days.scheduleText(s, slots), next: next, multiOk: multiOk(), maxSlots: schema.MAX_SLOTS,
    blocked: s.slots.length > 1 && !multiOk(),
    // The first version's fields (the window of the next game), for older screens.
    makeAt: first ? days.hhmm(first.make) : s.slots[0].make, readyBy: first ? days.hhmm(first.ready) : s.slots[0].ready,
    giveUpAt: first ? days.hhmm(first.giveUp) : '', days: s.frequency === 'off' ? 'never' : 'all', keepDays: s.keepDays,
    soon: days.upcoming(t, s, slots, s.giveUpMin, 6).map(function (one) { return { key: one.key, at: one.ready, when: days.whenText(one.ready, t) }; })
  };
}

function tasteOptions(s) {
  return { explore: s.explore, decay: s.decay, dislikedTo: s.dislikedTo, likedFrom: s.likedFrom, newDays: s.newGenreDays };
}

exports.settings = function () { return settings(); };

/** For the settings screen: [{key, title, value, fallback, type, min, max, step, group, options}]. */
exports.settingsView = function () { return schema.describe(savedSettings()); };

/** Changes settings ({key: value}); an unknown key is an error. Only what differs from the defaults is kept. */
exports.saveSettings = function (patch) {
  writeJson(SETTINGS, schema.merge(savedSettings(), patch, days.dayKey(Date.now())));
  schedule();
  emitState('settings');
  return exports.settingsView();
};

/**
 * The schedule for the settings screen: {frequency, everyDays, anchor, weekdays, slots, giveUpMin,
 * text: «Через день в 08:00 и 19:00», next: {when}, soon: [the next six], multiOk, blocked, maxSlots}.
 */
exports.scheduleView = function () {
  return scheduleView(settings(), Date.now());
};

// ---- the log of days ------------------------------------------------------------------------------

function readLog() {
  var list = readJson(LOG, []);
  return Array.isArray(list) ? list.filter(function (entry) { return entry && entry.date; }) : [];
}

function entryOf(date) {
  return readLog().filter(function (entry) { return entry.date === date; })[0] || null;
}

/** Changes the line of a day under the lock: updateEntry(date, fn(entry)). */
function updateEntry(date, fn) {
  return locked(function () {
    var list = readLog();
    var entry = null;
    list.forEach(function (one) { if (one.date === date) entry = one; });
    if (!entry) {
      var k = days.parseKey(date);
      entry = { date: date, id: 'daily/' + date, made: false };
      if (k && k.slot) {
        entry.day = k.day;
        entry.slot = k.slot;
      }
      list.push(entry);
    }
    fn(entry);
    list.sort(function (a, b) { return -newestFirst(a, b); });
    writeJson(LOG, list);
    return entry;
  });
}

function readState() {
  var state = readJson(STATE, {});
  return state && typeof state === 'object' ? state : {};
}

function updateState(fn) {
  return locked(function () {
    var state = readState();
    fn(state);
    writeJson(STATE, state);
    return state;
  });
}

// ---- the hub ----------------------------------------------------------------------------------------

function hubInstalled() {
  return files.exists(HUB_MAIN);
}

function hub() {
  if (!hubInstalled()) throw new Error('Нет Игротеки (modules/games): игра дня делается на её движке');
  return require(HUB_MAIN);
}

function dailyId(date) {
  return 'daily/' + date;
}

function dailyDir(date) {
  return DAILY + '/' + date;
}

function entryPage(dir, game) {
  return dir + '/' + ((game && game.entry) || 'ui/index.html');
}

function playPath(entry) {
  if (entry.kept && entry.slug) return HUB + '/' + entry.slug + '/ui/index.html';
  return entry.open || dailyDir(entry.date) + '/ui/index.html';
}

/** Every file under a folder of the workspace. */
function listFiles(dir, out) {
  out = out || [];
  var names = [];
  try {
    names = files.list(dir);
  } catch (error) {
    return out;
  }
  names.forEach(function (name) {
    name = String(name);
    if (name.charAt(name.length - 1) === '/') listFiles(dir + '/' + name.slice(0, -1), out);
    else out.push(dir + '/' + name);
  });
  return out;
}

/** The folders of the catalog (ids taken) and the reserved names. */
function takenIds() {
  var out = slug.RESERVED.slice();
  try {
    files.list(HUB).forEach(function (name) {
      name = String(name);
      if (name.charAt(name.length - 1) === '/') out.push(name.slice(0, -1));
    });
  } catch (error) { /* no hub folder */ }
  return out;
}

/** Days of the folders in modules/games/daily/. */
function folderDates() {
  try {
    return files.list(DAILY).map(String).filter(function (name) { return /\/$/.test(name); })
      .map(function (name) { return name.slice(0, -1); }).filter(slug.validKey);
  } catch (error) {
    return [];
  }
}

function moveFolder(from, to) {
  if (files.exists(to)) throw new Error('Папка ' + to + ' уже есть');
  var moved = false;
  if (typeof java !== 'undefined' && java.io && java.io.File) {
    try {
      moved = device.moveDir(files, from, to);
    } catch (error) {
      moved = false;
    }
  }
  if (moved) return;
  listFiles(from).forEach(function (path) { files.write(to + path.slice(from.length), files.read(path)); });
  files.remove(from);
}

function gamesDb() {
  return assi.db('games');
}

/** Saves of the daily id go to the kept id (rows that came in after the move too). Returns how many. */
function adopt(date, id) {
  var old = dailyId(date);
  try {
    var db = gamesDb();
    var rows = db.query('select count(*) as n from saves where game = ?', [old]);
    var n = rows && rows[0] ? Number(rows[0].n) || 0 : 0;
    if (!n) return 0;
    db.exec('update or ignore saves set game = ? where game = ?', [id, old]);
    db.exec('delete from saves where game = ?', [old]);
    return n;
  } catch (error) {
    return 0;   // no table yet: the game was never saved
  }
}

function dropSaves(date) {
  try {
    gamesDb().exec('delete from saves where game = ?', [dailyId(date)]);
  } catch (error) { /* no table yet */ }
}

/** Plays of the hub (data/games/links/plays.json) for these ids: {sessions, seconds}. */
function playStats(ids) {
  var plays = readJson(PLAYS, []);
  var n = 0;
  var ms = 0;
  (Array.isArray(plays) ? plays : []).forEach(function (play) {
    if (!play || ids.indexOf(String(play.game)) < 0) return;
    n++;
    ms += Math.max(0, (Number(play.to) || 0) - (Number(play.from) || 0));
  });
  return { sessions: n, seconds: Math.round(ms / 1000) };
}

// ---- the agent ------------------------------------------------------------------------------------------

/** agents/gamesmith/ from the module's templates (the owner's edits of system.md are kept). */
function installAgent() {
  var dir = 'agents/' + AGENT;
  ['agent.json', 'system.md'].forEach(function (name) {
    if (!files.exists(dir + '/' + name)) files.write(dir + '/' + name, files.read(HOME + '/agent/gamesmith/' + name));
  });
  if (!files.exists(dir + '/icon.svg')) files.write(dir + '/icon.svg', files.read(HOME + '/icon.svg'));
  return dir;
}

/** An occasion of «Праздники» (modules/holidays) on the day, when the owner has that module. */
function occasion(date) {
  try {
    if (files.exists('modules/holidays/main.js')) {
      var holidays = require('modules/holidays/main.js');
      if (typeof holidays.occasionToday === 'function') {
        var found = holidays.occasionToday(date);
        if (found && found.title) return String(found.title);
      }
    }
  } catch (error) { /* the module is busy or older */ }
  try {
    var history = readJson('data/holidays/history.json', []);
    var today = (Array.isArray(history) ? history : []).filter(function (one) { return one && one.day === date && one.occasion; })[0];
    if (today) return String(today.occasion);
    var state = readJson('data/holidays/state.json', null);
    if (state && state.applied) return String(state.applied);
  } catch (error) { /* no holidays module */ }
  return '';
}

// ---- the drawing of the day («Рисуй — угадаю») -------------------------------------------------------
//
// docs/modules/draw-guess.md, «Связи»: the game of the day offers a drawing of the day — the model
// draws in the morning, the owner guesses it on the way (without the network too: the drawing is
// kept on the phone). «Рисуй — угадаю» keeps the drawing; here — when to order it and the reminder.

var DRAW = 'modules/draw-guess/main.js';

/** «Рисуй — угадаю» when it is installed and knows dayDrawing(); null otherwise. */
function drawGuess() {
  if (!files.exists(DRAW)) return null;
  try {
    var mod = require(DRAW);
    return mod && typeof mod.dayDrawing === 'function' ? mod : null;
  } catch (error) {
    journal('«Рисуй — угадаю» не загрузился: ' + msg(error));
    return null;
  }
}

/** Is a drawing ordered on the day of this moment (the setting drawing: days | all | off)? */
function drawingOn(time, s) {
  if (s.drawing === 'off') return false;
  return s.drawing === 'all' || days.makesOn(time, s);
}

/**
 * The drawing of the day: (date, peek). peek — only what there is, nothing ordered. → the answer of
 * dayDrawing ({ready, played, result, open, title, text} | {ready: false, why}), or null when the
 * module is missing or the drawing is off for that day.
 */
function drawing(date, peek) {
  var s = settings();
  if (!drawingOn(days.dayStart(date), s)) return null;
  var dg = drawGuess();
  if (!dg) return null;
  try {
    return dg.dayDrawing(date, { peek: !!peek }) || null;
  } catch (error) {
    journal('Рисунок дня: ' + msg(error));
    return null;
  }
}

/** The morning order (the job at makeAt, before the game): the journal says when it did not work. */
function orderDrawing(date) {
  var got = drawing(date, false);
  if (got && !got.ready && got.why) journal('Рисунок дня не готов: ' + got.why);
  else if (got && got.ready) journal('Рисунок дня готов');
  return got;
}

/** «Рисунок дня» — a quiet notification at readyBy, once a day, while it is not opened. */
function notifyDrawing(date, force) {
  var got = drawing(date, true);
  if (!got || !got.ready) return { send: false, why: got && got.why ? got.why : 'рисунка дня нет' };
  if (got.played) return { send: false, why: 'рисунок дня уже открыт' };
  if (readState().drawingNotified === date && !force) return { send: false, why: 'уже сообщено' };
  notify({ id: NOTICE + '-drawing', title: got.title || 'Рисунок дня', text: got.text, open: got.open, channel: 'quiet' });
  updateState(function (state) { state.drawingNotified = date; });
  return { send: true, text: got.text, open: got.open };
}

/** For the screen: {installed, on, ready, played, result, open, text, why}. */
function drawingStatus(date) {
  var s = settings();
  var installed = !!drawGuess();
  var on = drawingOn(days.dayStart(date), s);
  var got = installed && on ? drawing(date, true) : null;
  return {
    installed: installed, on: on, ready: !!(got && got.ready), played: !!(got && got.played), result: got ? got.result || null : null,
    open: got && got.ready ? got.open : null, text: got ? got.text || got.why || '' : ''
  };
}

/** The button «Заказать рисунок»: in the background (the model may draw it now). */
exports.drawingNow = function () {
  if (!drawGuess()) return { skipped: 'Нет «Рисуй — угадаю»' };
  var date = days.dayKey(Date.now());
  spawn(function () {
    orderDrawing(date);
    emitState('drawing', { date: date });
  });
  return { started: true };
};

exports.drawing = function () {
  return drawingStatus(days.dayKey(Date.now()));
};

/** The task of a game (its key: the day, or «2026-11-14-2» for a later game of it) and its way (taste.direction). */
function buildTask(date, s) {
  var log = readLog().filter(function (entry) { return entry.date !== date; });
  var time = days.dayStart(date);
  var weekly = readJson(WEEKLY, null);
  var way = taste.direction(log, date, tasteOptions(s));
  var text = prompts.taskPrompt(files.read(HOME + '/prompts/task.md'), {
    date: dayOf(date),
    key: date,
    slot: slotOf(date),
    guide: files.exists(GUIDE),
    minutes: s.workMinutes,
    table: taste.compute(log, time, s.decay),
    summary: weekly && weekly.feedbackVersion === 2 && Array.isArray(weekly.taste) ? weekly.taste : [],
    notes: taste.notes(log, s.notesInTask),
    recent: taste.recent(log, time, s.noRepeatDays),
    noRepeatDays: s.noRepeatDays,
    newDays: s.newGenreDays,
    way: way,
    occasion: occasion(date),
    hook: slug.HOOK,
    likedFrom: s.likedFrom,
    dislikedTo: s.dislikedTo,
    preview: 'modules/games/ui/preview.html?game=' + dailyId(date)
  });
  if (slotOf(date)) text += '\nВ Game.start передай id явно: { id: \'' + dailyId(date) + '\', … } — по пути папки движок узнаёт только первую игру дня.';
  if (files.exists(dailyDir(date))) text += '\nВ папке уже есть работа прошлой попытки: посмотри её и доведи до конца или начни заново.';
  return { text: text, way: way };
}

/** What the agent gamesmith spent today (usage.summary: the cost by who asked); null when unknown. */
function agentCost() {
  try {
    var usage = native('usage.summary', 2);
    var today = days.dayKey(Date.now());
    var total = 0;
    ((usage && usage.days) || []).forEach(function (day) {
      if (day && String(day.day) === today && day.who && day.who[AGENT]) total += Number(day.who[AGENT].cost) || 0;
    });
    return total;
  } catch (error) {
    return null;
  }
}

function history(thread) {
  try {
    var list = native('agent.history', AGENT, thread);
    return Array.isArray(list) ? list : [];
  } catch (error) {
    return [];
  }
}

function lastOf(list, type) {
  for (var i = list.length - 1; i >= 0; i--) {
    var item = list[i];
    if (item && item.type === type && item.text && String(item.text).trim()) return String(item.text);
  }
  return '';
}

function busy(thread) {
  try {
    return !!native('agent.busy', AGENT, thread);
  } catch (error) {
    return false;
  }
}

/**
 * The agent's work: in a thread of its own (agent.newThread + agent.send), watched every pollSec;
 * past workMinutes or maxCostPerGame it is told to wrap up, after graceMinutes more it is stopped.
 * Without threads — one ai.run that cannot be steered. {text, cost, minutes, steered, stopped, mode}.
 */
function runAgent(task, s) {
  var started = Date.now();
  var before = agentCost();
  var out = { text: '', steered: null, stopped: false, mode: 'thread', note: '' };
  var thread = null;
  try {
    thread = native('agent.newThread', AGENT);
  } catch (error) {
    thread = null;
  }
  if (!thread) {
    out.mode = 'run';
    out.text = String(require('lib/ai').run(AGENT, task) || '');
  } else {
    thread = String(thread);
    if (REG.making) REG.making.thread = thread;
    native('agent.send', AGENT, task, thread, false, 'after');
    var steeredAt = 0;
    var idle = 0;
    for (;;) {
      sleep(s.pollSec * 1000);
      var t = Date.now();
      if (REG.making) REG.making.minutes = Math.round((t - started) / 60000);
      if (!busy(thread)) {
        idle++;
        if (lastOf(history(thread), 'assistant') || idle >= 3) break;
        continue;
      }
      idle = 0;
      var after = before === null ? null : agentCost();
      var spent = after === null ? null : after - before;
      if (REG.making) REG.making.cost = spent;
      if (!out.steered) {
        var kind = t - started >= s.workMinutes * 60000 ? 'time' : spent !== null && spent >= s.maxCostPerGame ? 'cost' : null;
        if (kind) {
          out.steered = kind;
          steeredAt = t;
          native('agent.send', AGENT, prompts.steerText(kind, s.graceMinutes), thread, false, 'steer');
          journal(kind === 'cost' ? 'Расход дошёл до предела — агенту сказано сдавать' : 'Срок вышел — агенту сказано сдавать');
          emitState('steered', { kind: kind });
        }
      } else if (t - steeredAt >= s.graceMinutes * 60000) {
        try {
          native('agent.stop', AGENT, thread);
        } catch (error) { /* already stopped */ }
        out.stopped = true;
        journal('Агент остановлен: время на сдачу вышло');
        break;
      }
    }
    var list = history(thread);
    out.text = lastOf(list, 'assistant');
    out.note = lastOf(list, 'note');
    out.thread = thread;
  }
  var end = agentCost();
  out.cost = before === null || end === null ? null : Math.round((end - before) * 1000) / 1000;
  out.minutes = Math.max(0, Math.round((Date.now() - started) / 60000));
  return out;
}

function hitText(hit) {
  return hit.path + ':' + hit.line + ' ' + hit.url;
}

/** The folder the agent made: a manifest with the daily id and status, a screen with the rating hook, no network. */
function verify(date) {
  var dir = dailyDir(date);
  var problems = [];
  var game = readJson(dir + '/game.json', null);
  if (!game || typeof game !== 'object') return { ok: false, problems: ['в папке игры нет game.json'], game: null };
  var fixed = slug.dailyManifest(game, date);
  if (JSON.stringify(fixed) !== JSON.stringify(game)) files.write(dir + '/game.json', JSON.stringify(fixed, null, 2));
  listFiles(dir).forEach(function (path) {
    if (!/\.(js|mjs)$/i.test(path)) return;
    var text = files.read(path);
    var next = slug.fixEngine(text);
    if (next !== text) files.write(path, next);
  });
  var page = entryPage(dir, fixed);
  if (!files.exists(page)) problems.push('нет экрана ' + page.slice(dir.length + 1));
  else if (/\.html?$/i.test(page)) {
    var html = files.read(page);
    var hooked = slug.addHook(html);
    if (hooked !== html) files.write(page, hooked);
  }
  try {
    var offline = hub().offlineCheck(dailyId(date));
    if (offline && !offline.ok) problems.push('не пройдена проверка «без сети»: ' + (offline.hits || []).slice(0, 3).map(hitText).join(', '));
  } catch (error) {
    problems.push('проверка «без сети» не прошла: ' + msg(error));
  }
  return { ok: !problems.length, problems: problems, game: fixed, page: page };
}

function tagsOf(game) {
  var out = {};
  var from = game.tags && typeof game.tags === 'object' ? game.tags : {};
  taste.TAGS.forEach(function (tag) {
    var value = from[tag] !== undefined ? from[tag] : game[tag];
    if (value !== undefined && value !== null && String(value).trim()) out[tag] = String(value).toLowerCase().trim();
  });
  return out;
}

// ---- making the game of the day ---------------------------------------------------------------------

/** Is the moment inside the window of that game (on its day, [make, giveUp))? */
function inKeyWindow(key, time, s) {
  if (dayOf(key) !== days.dayKey(time)) return false;
  var w = windowOf(key, s);
  return !!w && time >= w.make && time < w.giveUp;
}

/** The game whose window holds the moment, on a day of the plan: its key; null between windows and on days off. */
function currentKey(t, s) {
  if (!days.makesOn(t, s)) return null;
  var i = days.slotAt(t, activeSlots(s), s.giveUpMin);
  return i < 0 ? null : days.gameKey(days.dayKey(t), i);
}

/** When the game is due (its slot's ready time). */
function readyAt(date, s) {
  var w = windowOf(date, s);
  return w ? w.ready : days.at(days.dayStart(dayOf(date)), s.slots[0].ready);
}

/** The next try while the game's window is open (an exact alarm when the shell has job.once). */
function scheduleRetry(s, soon, key) {
  var t = Date.now();
  key = key || currentKey(t, s);
  var w = key ? windowOf(key, s) : null;
  if (!w || dayOf(key) !== days.dayKey(t) || t >= w.giveUp) return null;
  var at = Math.min(t + (soon ? 60000 : s.retryEveryMin * 60000), w.giveUp);
  if (device.has('job.once')) job('daily-game:retry', { once: at }, retryJob);
  else if (soon) spawn(function () { exports.make('start'); });
  else job('daily-game:retry', { every: s.retryEveryMin }, retryJob);
  return at;
}

function stopRetry() {
  try {
    unjob('daily-game:retry');
  } catch (error) { /* none */ }
}

/** The retry alarm: games of today whose window is over get the honest «не собралась»; the open one is tried again. */
function retryJob() {
  var s = settings();
  var t = Date.now();
  var today = days.dayKey(t);
  readLog().forEach(function (one) {
    if (dayOf(one.date) !== today || one.made || one.final || one.removedAt) return;
    if (REG.making && REG.making.date === one.date) return;
    var w = windowOf(one.date, s);
    if (!w || t < w.giveUp) return;
    var until = days.hhmm(w.giveUp);
    giveUpDay(one.date, one.waiting ? 'не было сети до ' + until : one.error || 'не успел до ' + until);
  });
  var key = currentKey(t, s);
  var entry = key ? entryOf(key) : null;
  if (!key || (entry && (entry.made || entry.final))) {
    stopRetry();
    return;
  }
  spawn(function () { exports.make('retry'); });
}

function giveUpDay(date, why) {
  var entry = updateEntry(date, function (e) {
    if (e.made) return;
    e.final = true;
    e.error = why;
    e.waiting = null;
  });
  if (entry.made) return entry;
  journal('Игра дня на ' + date + ' не собралась: ' + why);
  emitState('failed', { date: date, error: why });
  notifyDay(date, false);
  return entry;
}

function fail(date, why, s, run) {
  var t = Date.now();
  var entry = updateEntry(date, function (e) {
    e.made = false;
    e.error = why;
    e.finishedAt = t;
    if (run) {
      e.costUsd = run.cost;
      e.minutes = run.minutes;
      e.steered = run.steered;
      e.stopped = run.stopped;
    }
    e.final = (e.attempts || 0) >= s.maxAttempts || !inKeyWindow(date, t, s);
  });
  journal('Игра дня на ' + date + ' не собралась: ' + why + (entry.final ? '' : ' — попробую ещё раз'));
  emitState('failed', { date: date, error: why, final: !!entry.final });
  if (!entry.final) scheduleRetry(s, false, date);
  return { error: why, date: date, final: !!entry.final };
}

function build(date, s, reason) {
  installAgent();
  var task = buildTask(date, s);
  updateEntry(date, function (e) {
    e.made = false;
    e.error = null;
    e.final = false;
    e.waiting = null;
    e.removedAt = null;
    e.notified = null;
    ['title', 'pitch', 'tags', 'rating', 'reasons', 'voice', 'ratedAt', 'kept', 'slug', 'pending', 'baseId'].forEach(function (key) { delete e[key]; });
    e.attempts = (e.attempts || 0) + 1;
    e.startedAt = Date.now();
    e.mode = task.way.mode;
    e.direction = task.way.mode === 'explore' ? task.way.genre : task.way.mode === 'exploit' ? task.way.base.title : null;
  });
  journal('Делаю игру дня на ' + date + ' (' + reason + '; ' + (task.way.mode === 'explore' ? 'новое: ' + task.way.genre :
    task.way.mode === 'exploit' ? 'вариация на «' + task.way.base.title + '»' : 'свободный выбор') + (device.charging() ? '; на зарядке' : '') + ')');
  emitState('making', { date: date });
  if (REG.making) REG.making.phase = 'agent';
  var run = runAgent(task.text, s);
  if (REG.making) REG.making.phase = 'check';
  var answer = prompts.parseResult(run.text);
  if (answer.said) return fail(date, answer.error, s, run);
  var check = verify(date);
  if (!check.ok) {
    var why = check.problems.join('; ');
    if (!answer.ok && run.note) why += ' (' + run.note + ')';
    return fail(date, why, s, run);
  }
  var title = answer.ok ? answer.title : String(check.game.title || 'Игра дня');
  var pitch = answer.ok ? answer.pitch : String(check.game.about || '');
  var tags = answer.ok ? answer.tags : tagsOf(check.game);
  if (!tags.genre && check.game.genre) tags.genre = String(check.game.genre).toLowerCase();
  updateEntry(date, function (e) {
    e.made = true;
    e.title = title;
    e.pitch = pitch;
    e.tags = tags;
    e.costUsd = run.cost;
    e.minutes = run.minutes;
    e.finishedAt = Date.now();
    e.steered = run.steered;
    e.stopped = run.stopped;
    e.answered = !!answer.ok;
    e.open = check.page;
  });
  journal('Готово: «' + title + '» за ' + run.minutes + ' мин' + (run.cost !== null ? ', $' + run.cost : '') + (answer.ok ? '' : ' (ответа JSON не было — описание из game.json)'));
  emitState('made', { date: date, title: title });
  return { made: true, date: date, title: title, pitch: pitch, tags: tags, minutes: run.minutes, cost: run.cost };
}

/** Is there a playable game under the key (made, not removed)? */
function live(entry) {
  return !!(entry && entry.made && !entry.removedAt);
}

/**
 * The slot the button makes now: the earliest of today's slots already begun without a game, else
 * the earliest without one at all (made early, the scheduled run then finds it); -1 when all are there.
 */
function buttonSlot(t, s) {
  var today = days.dayKey(t);
  var slots = activeSlots(s);
  var later = -1;
  for (var i = 0; i < slots.length; i++) {
    if (live(entryOf(days.gameKey(today, i)))) continue;
    var w = days.slotTimes(t, slots, i, s.giveUpMin);
    if (w && w.make <= t) return i;
    if (later < 0) later = i;
  }
  return later;
}

/** «не время: следующая — завтра в 08:00» for make() outside every window. */
function notNowText(s, t) {
  var next = nextGame(s, t);
  return next ? 'не время: следующая игра — ' + next.when : 'не время: расписание выключено';
}

/**
 * Makes a game if one is due: on a day of the plan, inside a slot's window [make, ready + giveUpMin),
 * once per slot, with the network (without it — a retry every retryEveryMin). slot — the slot of a
 * job (the window of the moment when left out). force (the button) — any time, the first slot of
 * today without a game. Long (the agent works up to workMinutes + graceMinutes): run it in spawn.
 * Returns {made, title, …} | {skipped, retry?} | {busy} | {error, final}.
 */
exports.make = function (reason, force, slot) {
  var s = settings();
  var t = Date.now();
  var today = days.dayKey(t);
  if (!hubInstalled()) return { skipped: 'Нет Игротеки (modules/games): игра дня делается на её движке' };
  if (!force && !days.makesOn(t, s)) return { skipped: s.frequency === 'off' ? 'игра дня выключена в настройках' : 'сегодня игры нет по расписанию' };
  var i = typeof slot === 'number' && slot >= 0 ? slot : force ? buttonSlot(t, s) : days.slotAt(t, activeSlots(s), s.giveUpMin);
  if (force && i < 0) return { skipped: activeSlots(s).length > 1 ? 'все игры на сегодня уже есть' : 'игра дня уже есть', date: today };
  if (i < 0) return { skipped: notNowText(s, t) };
  if (i >= activeSlots(s).length) return { skipped: i < s.slots.length ? 'Игротека пока не принимает вторую игру за день — нужна новая версия Assi' : 'такой игры в расписании нет' };
  var date = days.gameKey(today, i);
  if (!force && !inKeyWindow(date, t, s)) return { skipped: notNowText(s, t) };
  var entry = entryOf(date);
  if (live(entry)) return { skipped: 'игра дня уже есть', date: date };
  if (REG.making) return { busy: true, date: REG.making.date };
  if (!force && entry && entry.final) return { skipped: 'сегодня уже не вышло: ' + entry.error };
  if (!force && entry && (entry.attempts || 0) >= s.maxAttempts) return { skipped: 'попытки на эту игру кончились' };
  if (!device.online()) {
    var retry = force ? null : scheduleRetry(s, false, date);
    updateEntry(date, function (e) { e.waiting = 'нет сети'; });
    journal('Нет сети — ' + (retry ? 'попробую снова' : 'игру дня не сделать'));
    return { skipped: 'нет сети', retry: retry, date: date };
  }
  REG.making = { date: date, slot: i, since: t, reason: String(reason || ''), phase: 'task', cost: null, minutes: 0, thread: null };
  var result;
  try {
    result = build(date, s, reason || 'кнопка');
  } catch (failure) {
    result = fail(date, msg(failure), s, null);
  } finally {
    REG.making = null;
  }
  if (result.made) stopRetry();
  if (result.made || result.final) {
    if (Date.now() >= readyAt(date, s)) notifyDay(date, false);
  }
  return result;
};

/**
 * A game of the day made by hand (the main agent on the owner's word, or a check): the same check
 * of the folder modules/games/daily/<key>/, then it is that game. info: {title, pitch, tags}.
 */
exports.register = function (date, info) {
  date = needDate(date);
  info = info || {};
  var check = verify(date);
  if (!check.ok) return { ok: false, problems: check.problems };
  var tags = info.tags && typeof info.tags === 'object' ? info.tags : tagsOf(check.game);
  if (!tags.genre && check.game.genre) tags.genre = String(check.game.genre).toLowerCase();
  updateEntry(date, function (e) {
    e.made = true;
    e.title = String(info.title || check.game.title || 'Игра дня');
    e.pitch = String(info.pitch || check.game.about || '');
    e.tags = tags;
    e.finishedAt = Date.now();
    e.open = check.page;
    e.error = null;
    e.final = false;
    e.removedAt = null;
    e.byHand = true;
  });
  emitState('made', { date: date });
  return { ok: true, date: date };
};

/** The button «Сделать сейчас»: the quick checks here, the work in the background. */
exports.makeNow = function () {
  if (!hubInstalled()) return { skipped: 'Нет Игротеки (modules/games)' };
  if (REG.making) return { busy: true };
  var s = settings();
  var slot = buttonSlot(Date.now(), s);
  if (slot < 0) return { skipped: activeSlots(s).length > 1 ? 'все игры на сегодня уже есть' : 'игра дня уже есть' };
  if (!device.online()) return { skipped: 'нет сети' };
  spawn(function () { exports.make('кнопка', true, slot); });
  return { started: true };
};

/** The agent's task for a game (its key; today's first by default) as it would go now («Задание агенту»). */
exports.task = function (date) {
  return buildTask(date ? needDate(date) : days.dayKey(Date.now()), settings()).text;
};

// ---- notifications ---------------------------------------------------------------------------------------

/** The notification of a game: «daily-game» for the first of a day, «daily-game-2» for the second… */
function noticeId(date) {
  var slot = slotOf(date);
  return slot ? NOTICE + '-' + (slot + 1) : NOTICE;
}

/** «Игра дня: «Отражатель» — …, 2 минуты» (opens the game) or the honest «не собралась». Once per game. */
function notifyDay(date, force) {
  var entry = entryOf(date);
  if (!entry) return { send: false, why: 'игры дня нет' };
  if (entry.notified && !force) return { send: false, why: 'уже сообщено' };
  var options;
  if (live(entry)) {
    options = { id: noticeId(date), title: 'Игра дня', text: prompts.readyText(entry), open: playPath(entry), channel: 'normal' };
  } else if (entry.final && entry.error) {
    var s = settings();
    var next = nextGame(s, Date.now());
    options = { id: noticeId(date), title: 'Игра дня', text: prompts.failText(entry.error, next ? next.when : ''), open: SCREEN, channel: 'quiet' };
  } else {
    return { send: false, why: REG.making ? 'ещё делается' : entry.error ? 'ещё пробую' : 'ещё не готова' };
  }
  notify(options);
  updateEntry(date, function (e) { e.notified = Date.now(); });
  return { send: true, text: options.text, open: options.open };
}

/** The job at a slot's ready time: the game's notification; the drawing of the day with the first slot. */
function readyJob(slot) {
  var s = settings();
  var t = Date.now();
  slot = slot || 0;
  var date = days.gameKey(days.dayKey(t), slot);
  var out = notifyDay(date, false);
  if (!out.send && REG.making && REG.making.date === date) journal('К ' + days.hhmm(readyAt(date, s)) + ' игра ещё делается — сообщу, как будет готова');
  if (slot === 0) {
    try {
      out.drawing = notifyDrawing(days.dayKey(t), false);
    } catch (error) {
      journal('Рисунок дня: ' + msg(error));
    }
  }
  return out;
}

/** The key of today's latest game that has something to say (made or given up); today's first otherwise. */
function latestToday(t) {
  var today = days.dayKey(t);
  var list = readLog().filter(function (entry) { return dayOf(entry.date) === today && (entry.made || entry.final); }).sort(newestFirst);
  return list.length ? list[0].date : today;
}

exports.notifyReady = function (force) {
  var t = Date.now();
  var out = notifyDay(latestToday(t), !!force);
  try {
    out.drawing = notifyDrawing(days.dayKey(t), !!force);
  } catch (error) {
    journal('Рисунок дня: ' + msg(error));
  }
  return out;
};

// ---- ratings, keep, remove ---------------------------------------------------------------------------------

function refreshTaste(s) {
  var table = taste.compute(readLog(), Date.now(), s.decay);
  writeJson(TASTE, table);
  return table;
}

/** The rating into the shared base: a record per game, updated when rated again. */
function recordBase(entry) {
  try {
    var base = require('lib/base');
    var record = {
      kind: 'rating', title: 'Игра дня: ' + entry.title, amount: entry.rating, source: 'games',
      data: { tags: entry.tags || {}, game: entry.slug || dailyId(entry.date), date: entry.date, reasons: entry.reasons || [],
        ratingScope: 'implementation', genrePreference: entry.genrePreference || 'unknown', comment: entry.comment || '', voice: entry.voice || '' }
    };
    if (entry.baseId && typeof base.update === 'function') {
      base.update(entry.baseId, record);
      return entry.baseId;
    }
    var id = base.add(record);
    updateEntry(entry.date, function (e) { e.baseId = id; });
    return id;
  } catch (error) {
    journal('Общая база: ' + msg(error));
    return null;
  }
}

/** Into «Ачивки за жизнь» when it is installed; otherwise into the game hub's outbox. Once per key. */
function grant(item) {
  if (readState().granted && readState().granted[item.key]) return false;
  var full = {
    key: item.key, source: 'games', category: 'Игротека', title: item.title, text: item.text,
    at: Date.now(), hidden: false, icon: HOME + '/icon.svg'
  };
  var done = false;
  try {
    if (files.exists('modules/achievements/main.js')) {
      var achievements = require('modules/achievements/main.js');
      if (typeof achievements.grant === 'function') {
        achievements.grant(full);
        done = true;
      }
    }
  } catch (error) {
    journal('Ачивка: ' + msg(error));
  }
  if (!done) {
    try {
      var box = readJson(OUTBOX, []);
      var list = Array.isArray(box) ? box : (box && Array.isArray(box.items) ? box.items : []);
      if (!list.some(function (one) { return one && one.key === full.key; })) list.push(full);
      if (Array.isArray(box) || !box || typeof box !== 'object') writeJson(OUTBOX, list);
      else {
        box.items = list;
        writeJson(OUTBOX, box);
      }
      done = true;
    } catch (error) {
      journal('Ящик ачивок: ' + msg(error));
    }
  }
  if (done) {
    updateState(function (state) {
      state.granted = state.granted || {};
      state.granted[item.key] = Date.now();
    });
    journal('Ачивка «' + item.title + '»');
  }
  return done;
}

function achievements(s) {
  var c = taste.counts(readLog());
  if (c.ratings >= s.criticRatings) grant({ key: 'games/daily/critic', title: 'Критик', text: 'Оценил ' + s.criticRatings + ' игр дня' });
  if (c.kept >= s.collectorKept) grant({ key: 'games/daily/collector', title: 'Коллекционер', text: 'Оставил в Игротеке ' + s.collectorKept + ' игр дня' });
  return c;
}

/**
 * A rating: (date, {stars: 1–5, reasons: [chips], voice: 'одна реплика', playedSec}). Into the log, the
 * taste table, the shared base; «Критик» at criticRatings. Returns {ok, rating, taste: [lines]}.
 */
exports.rate = function (date, data) {
  date = needDate(date);
  data = data || {};
  var stars = Math.round(Number(data.stars));
  if (!(stars >= 1 && stars <= 5)) throw new Error('Оценка — от 1 до 5 звёзд');
  var entry = entryOf(date);
  if (!entry || !entry.made || entry.removedAt) throw new Error('Игры дня на ' + date + ' нет');
  var reasons = (Array.isArray(data.reasons) ? data.reasons : []).map(String)
    .filter(function (reason, i, all) { return taste.REASONS.indexOf(reason) >= 0 && all.indexOf(reason) === i; });
  if (data.genrePreference !== undefined && ['unknown', 'like', 'neutral', 'dislike'].indexOf(data.genrePreference) < 0) {
    throw new Error('Выберите отношение к жанру отдельно от оценки игры');
  }
  var s = settings();
  var stats = playStats([dailyId(date)].concat(entry.slug ? [entry.slug] : []));
  entry = updateEntry(date, function (e) {
    e.rating = stars;
    e.feedbackVersion = 2;
    if (data.genrePreference !== undefined) e.genrePreference = data.genrePreference;
    if (typeof data.comment === 'string') e.comment = data.comment.trim().slice(0, 1000);
    e.reasons = reasons;
    if (typeof data.voice === 'string') e.voice = data.voice.replace(/\s+/g, ' ').trim().slice(0, 300);
    e.ratedAt = Date.now();
    e.sessions = Math.max(stats.sessions, e.sessions || 0);
    e.playedSec = Math.max(stats.seconds, Math.round(Number(data.playedSec) || 0), e.playedSec || 0);
  });
  var table = refreshTaste(s);
  recordBase(entry);
  achievements(s);
  journal('Реализация «' + entry.title + '»: ' + stars + (reasons.length ? ' (' + reasons.join(', ') + ')' : '') +
    ', жанр: ' + (taste.GENRE_WORDS[entry.genrePreference] || 'не оценён') + (entry.comment ? ', отзыв: «' + entry.comment + '»' : '') + (entry.voice ? ', голосом: «' + entry.voice + '»' : ''));
  emitState('rated', { date: date, rating: stars });
  return { ok: true, rating: stars, taste: taste.rows(table).slice(0, 6).map(taste.rowText) };
};

/**
 * The sheet inside the game: a rating and what to do with the game — (date, {stars, reasons, voice,
 * playedSec, decision: 'keep' | 'remove' | 'later'}). The move waits settleSec, so that the game's
 * last save and session (on its exit) land first.
 */
exports.decide = function (date, data) {
  date = needDate(date);
  data = data || {};
  if (!data.stars && ((data.comment && String(data.comment).trim()) || data.voice ||
      (Array.isArray(data.reasons) && data.reasons.length) || (data.genrePreference && data.genrePreference !== 'unknown'))) {
    throw new Error('Для сохранения отзыва нужна оценка реализации от 1 до 5');
  }
  var out = { ok: true };
  if (data.stars) out = exports.rate(date, data);
  var what = data.decision;
  if (what === 'keep' || what === 'remove') {
    var s = settings();
    updateEntry(date, function (e) { e.pending = { what: what, at: Date.now() }; });
    spawn(function () {
      sleep(s.settleSec * 1000);
      runPending(date);
    });
    out.pending = what;
  } else if (!data.stars) {
    exports.played(date, data.playedSec);
  }
  out.ok = true;
  return out;
};

function runPending(date) {
  var entry = entryOf(date);
  if (!entry || !entry.pending) return null;
  try {
    return entry.pending.what === 'keep' ? exports.keep(date) : exports.remove(date);
  } catch (error) {
    journal((entry.pending.what === 'keep' ? 'Не перенести' : 'Не удалить') + ' «' + entry.title + '»: ' + msg(error));
    updateEntry(date, function (e) {
      e.pending = null;
      e.pendingError = msg(error);
    });
    return { error: msg(error) };
  }
}

/** For the rating hook of the game's screen: what to show and when. */
exports.rateInfo = function (date) {
  var s = settings();
  var entry = slug.validKey(date) ? entryOf(String(date)) : null;
  return {
    ok: !!(entry && entry.made && !entry.removedAt && !entry.kept), date: date, title: entry ? entry.title || '' : '',
    rated: entry && entry.rating ? entry.rating : null, reasons: entry ? entry.reasons || [] : [],
    genre: entry && entry.tags ? entry.tags.genre || '' : '',
    genrePreference: entry ? entry.genrePreference || 'unknown' : 'unknown', comment: entry ? entry.comment || '' : '',
    pending: entry && entry.pending ? entry.pending.what : null,
    rateAfterSec: s.rateAfterSec, voiceSec: s.voiceSec, chips: taste.REASONS.slice()
  };
};

/** A session left without the sheet (the back button): how long it went, for the screen. */
exports.played = function (date, seconds) {
  if (!slug.validKey(date)) return false;
  var entry = entryOf(String(date));
  if (!entry || !entry.made) return false;
  updateEntry(String(date), function (e) {
    e.playedSec = Math.max(Number(e.playedSec) || 0, Math.round(Number(seconds) || 0));
    e.lastPlayedAt = Date.now();
  });
  emitState('played', { date: date });
  return true;
};

/** One utterance for the voice feedback (speech.listen, voiceSec); '' when nothing was said. */
exports.listen = function () {
  var s = settings();
  try {
    var text = native('speech.listen', s.voiceSec);
    return text ? String(text) : '';
  } catch (error) {
    return '';
  }
};

/**
 * «Оставить в Игротеке»: the folder moves to modules/games/<slug>/, game.json gets status «trial» and
 * origin, the save rows move to the new id, the catalog shows it «На пробу». Returns {ok, id, open}.
 */
exports.keep = function (date) {
  date = needDate(date);
  var entry = entryOf(date);
  if (!entry || !entry.made) throw new Error('Игры дня на ' + date + ' нет');
  if (entry.kept && entry.slug) return { ok: true, id: entry.slug, open: playPath(entry), already: true };
  if (entry.removedAt) throw new Error('Игра уже удалена');
  var h = hub();
  var from = dailyDir(date);
  var game = readJson(from + '/game.json', null);
  if (!game) throw new Error('В папке игры нет game.json');
  var id = slug.slugFor(entry.title || game.title, date, takenIds());
  var to = HUB + '/' + id;
  moveFolder(from, to);
  listFiles(to).forEach(function (path) {
    if (!TEXT_FILE.test(path)) return;
    var text = files.read(path);
    var next = slug.rewrite(text, date, id);
    if (next !== text) files.write(path, next);
  });
  var kept = slug.keptManifest(readJson(to + '/game.json', game), id, date, entry.rating);
  files.write(to + '/game.json', JSON.stringify(kept, null, 2));
  var page = entryPage(to, kept);
  if (files.exists(page)) files.write(page, slug.stripHook(files.read(page)));
  var moved = adopt(date, id);
  try {
    h.catalogSet('trial', id, true);
  } catch (error) {
    journal('Каталог: ' + msg(error));
  }
  updateEntry(date, function (e) {
    e.kept = true;
    e.slug = id;
    e.keptAt = Date.now();
    e.playDays = [];
    e.pending = null;
    e.open = page;
  });
  journal('«' + entry.title + '» оставлена в Игротеке как ' + id + (moved ? ', сохранений перенесено: ' + moved : ''));
  achievements(settings());
  emitState('kept', { date: date, id: id });
  return { ok: true, id: id, open: page, saves: moved };
};

function removeDaily(date, why) {
  var dir = dailyDir(date);
  if (files.exists(dir)) files.remove(dir);
  dropSaves(date);
  var entry = updateEntry(date, function (e) {
    e.removedAt = Date.now();
    e.removedWhy = why;
    e.pending = null;
  });
  journal((entry.title ? '«' + entry.title + '»' : 'Игра на ' + date) + ' удалена: ' + why);
  emitState('removed', { date: date });
  return entry;
}

/** «Удалить»: the folder and its saves go (the code stays in «История изменений»). */
exports.remove = function (date) {
  date = needDate(date);
  var entry = entryOf(date);
  if (!entry) throw new Error('Игры дня на ' + date + ' нет');
  if (entry.kept) throw new Error('Игра уже в Игротеке — удалить её можно там');
  if (entry.removedAt) return { ok: true, already: true };
  removeDaily(date, 'удалил владелец');
  return { ok: true };
};

// ---- the daily round: what is old goes, what took root is promoted ---------------------------------------

function union(a, b) {
  var out = (a || []).slice();
  (b || []).forEach(function (x) { if (out.indexOf(x) < 0) out.push(x); });
  return out.sort();
}

/** The agent's offer in the chat, by a notification button (or the screen). */
function offer(entry) {
  var options = { id: NOTICE + '-root-' + entry.slug, title: 'Игротека', text: prompts.promoteText(entry.title), open: SCREEN, channel: 'quiet' };
  if (device.has('notify.actions')) options.actions = [{ title: 'Обсудить с агентом', call: HOME + '/main.js', fn: 'discuss', args: { id: entry.slug } }];
  notify(options);
}

/** Kept games played on promoteSessions different days since: «На пробу» → «Все игры». */
function promote() {
  var s = settings();
  var plays = readJson(PLAYS, []);
  var out = [];
  readLog().forEach(function (entry) {
    if (!entry.kept || !entry.slug || entry.promotedAt) return;
    if (!files.exists(HUB + '/' + entry.slug + '/game.json')) return;
    var all = union(entry.playDays, slug.playDays(plays, [entry.slug], entry.keptAt || 0));
    if (all.length !== (entry.playDays || []).length) updateEntry(entry.date, function (e) { e.playDays = all; });
    if (all.length < s.promoteSessions) return;
    try {
      hub().catalogSet('trial', entry.slug, false);
    } catch (error) {
      journal('Перевод во «Все игры»: ' + msg(error));
      return;
    }
    updateEntry(entry.date, function (e) {
      e.promotedAt = Date.now();
      e.offer = true;
    });
    journal('«' + entry.title + '» прижилась — теперь во «Все игры»');
    offer(entry);
    emitState('promoted', { date: entry.date, id: entry.slug });
    out.push(entry.slug);
  });
  return out;
}

exports.promote = function () { return promote(); };

/** The button «Обсудить с агентом»: the main agent gets the case and offers prestige and links. */
exports.discuss = function (args) {
  var id = args && typeof args === 'object' ? args.id : args;
  var entry = readLog().filter(function (e) { return e.slug === id; })[0];
  if (!entry) throw new Error('Нет такой оставленной игры: ' + id);
  try {
    assi.notify.cancel(NOTICE + '-root-' + id);
  } catch (error) { /* already gone */ }
  native('agent.send', 'assi', 'Игра «' + entry.title + '» из «Игры дня» прижилась: она в Игротеке, modules/games/' + id +
    '/ (сыграна в ' + (entry.playDays || []).length + ' разных дня). Предложи мне добавить ей престиж и связки с поездкой — по движку Игротеки — и спроси, хочу ли я.');
  updateEntry(entry.date, function (e) {
    e.offer = false;
    e.discussedAt = Date.now();
  });
  return { ok: true };
};

/**
 * The daily round: pending moves done, unkept games older than keepDays removed (folder and saves),
 * late saves of kept games adopted, promotions. Returns {removed, adopted, pending, promoted}.
 */
exports.sweep = function () {
  var s = settings();
  var t = Date.now();
  var out = { removed: [], adopted: 0, pending: 0, promoted: [] };
  readLog().forEach(function (entry) {
    if (entry.pending && t - entry.pending.at >= s.settleSec * 1000) {
      runPending(entry.date);
      out.pending++;
      return;
    }
    if (entry.kept && entry.slug) {
      out.adopted += adopt(entry.date, entry.slug);
      return;
    }
    if (entry.removedAt || dayOf(entry.date) === days.dayKey(t)) return;
    if (days.daysSince(entry.date, t) >= s.keepDays && (entry.made || files.exists(dailyDir(entry.date)))) {
      removeDaily(entry.date, entry.made ? 'не оставлена за ' + s.keepDays + ' дн.' : 'не собралась');
      out.removed.push(entry.date);
    }
  });
  folderDates().forEach(function (date) {
    if (entryOf(date) || days.daysSince(date, t) < s.keepDays) return;
    files.remove(dailyDir(date));
    dropSaves(date);
    out.removed.push(date);
  });
  out.promoted = promote();
  return out;
};

/** A slot's make job: the round, the drawing of the day (with the first slot), then the game. */
function morning(reason, slot) {
  try {
    exports.sweep();
  } catch (error) {
    journal('Уборка: ' + msg(error));
  }
  try {
    if (!slot) orderDrawing(days.dayKey(Date.now()));
  } catch (error) {
    journal('Рисунок дня: ' + msg(error));
  }
  try {
    return exports.make(reason, false, slot || 0);
  } catch (error) {
    journal('Игра дня: ' + msg(error));
    return { error: msg(error) };
  }
}

// ---- the weekly summary of taste ----------------------------------------------------------------------------

/**
 * On summaryDay at summaryAt: the model (role daily-game.taste) turns the week's ratings and words into
 * 5–8 lines of taste; they go into the long memory (tag «игра-дня») and into the next tasks; the owner
 * gets 2–3 sentences. Without a model — the same from the table.
 */
exports.weekly = function (force) {
  var s = settings();
  var t = Date.now();
  var today = days.dayKey(t);
  var last = readJson(WEEKLY, null);
  if (!force) {
    if (new Date(t).getDay() !== s.summaryDay) return { skipped: 'не день сводки' };
    if (last && last.date === today) return { skipped: 'сводка уже была' };
  }
  var log = readLog();
  var w = taste.week(log, t);
  if (!force && !w.made && !w.failed) return { skipped: 'за неделю игр не было' };
  var table = taste.compute(log, t, s.decay);
  var coming = nextGame(s, t);
  var tomorrow = taste.direction(log, coming ? coming.key : days.dayKey(t + days.DAY), tasteOptions(s));
  var result = null;
  var by = 'model';
  try {
    var text = require('lib/ai').ask({
      role: ROLE,
      system: 'Ты кратко сводишь вкус владельца в мини-играх. Отвечаешь только JSON.',
      prompt: prompts.tastePrompt(files.read(HOME + '/prompts/taste.md'), {
        week: w, table: table, notes: taste.notes(log, 20), reasons: taste.reasonCounts(log),
        previous: last && last.feedbackVersion === 2 && Array.isArray(last.taste) ? last.taste : [], tomorrow: tomorrow, newDays: s.newGenreDays
      })
    });
    result = prompts.parseTaste(text);
  } catch (error) {
    by = 'table';
    result = { owner: taste.plainSummary(w, table, tomorrow, tasteOptions(s)), taste: taste.plainLines(table, tasteOptions(s)) };
    journal('Сводка без модели: ' + msg(error));
  }
  try {
    require('lib/memory').save('Вкус владельца в играх дня (' + today + '):\n' + result.taste.join('\n'), MEMORY_TAG);
  } catch (error) {
    journal('Долгая память: ' + msg(error));
  }
  writeJson(WEEKLY, {
    date: today, at: t, owner: result.owner, taste: result.taste, by: by, feedbackVersion: 2,
    week: { made: w.made, failed: w.failed, rated: w.rated, average: w.average, cost: w.cost, minutes: w.minutes }
  });
  notify({ id: NOTICE + '-week', title: 'Игра дня: неделя', text: result.owner, open: SCREEN, channel: 'quiet' });
  journal('Недельная сводка вкуса' + (by === 'table' ? ' (без модели)' : ''));
  emitState('week');
  return { ok: true, owner: result.owner, taste: result.taste, by: by };
};

// ---- what the screen and others read ----------------------------------------------------------------------------

/** The game's own icon (icon.svg of its folder, a 24×24 outline) as a path for the screens; null without one. */
function iconPath(entry) {
  var dir = entry.kept && entry.slug ? HUB + '/' + entry.slug : dailyDir(entry.date);
  try {
    return files.exists(dir + '/icon.svg') ? '/' + dir + '/icon.svg' : null;
  } catch (error) {
    return null;
  }
}

var ORDINALS = ['первая', 'вторая', 'третья', 'четвёртая', 'пятая', 'шестая', 'седьмая', 'восьмая', 'девятая'];

/** «Сегодня», «Вчера», «12 ноября»; with several games a day — «Сегодня, вторая». */
function labelOf(key, t, s) {
  var ago = days.daysSince(key, t);
  var day = dayOf(key);
  var words = ago === 0 ? 'Сегодня' : ago === 1 ? 'Вчера' : ago === 2 ? 'Позавчера' :
    Number(day.slice(8)) + ' ' + days.MONTHS[Number(day.slice(5, 7)) - 1];
  var slot = slotOf(key);
  if (activeSlots(s).length > 1 || slot > 0) words += ', ' + ORDINALS[Math.min(slot, ORDINALS.length - 1)];
  return words;
}

function view(entry) {
  if (!entry) return null;
  var stats = playStats([dailyId(entry.date)].concat(entry.slug ? [entry.slug] : []));
  var playable = live(entry);
  return {
    date: entry.date, key: entry.date, day: dayOf(entry.date), slot: slotOf(entry.date),
    title: entry.title || '', pitch: entry.pitch || '', tags: entry.tags || {}, made: !!entry.made,
    error: entry.error || null, final: !!entry.final, waiting: entry.waiting || null, rating: entry.rating || null,
    reasons: entry.reasons || [], voice: entry.voice || '', kept: !!entry.kept, slug: entry.slug || null,
    comment: entry.comment || '', genrePreference: entry.genrePreference || 'unknown',
    removedAt: entry.removedAt || null, costUsd: entry.costUsd === undefined ? null : entry.costUsd,
    minutes: entry.minutes === undefined ? null : entry.minutes, mode: entry.mode || null, direction: entry.direction || null,
    promotedAt: entry.promotedAt || null, playDays: (entry.playDays || []).length, pending: entry.pending ? entry.pending.what : null,
    open: playable ? playPath(entry) : null, sessions: Math.max(stats.sessions, entry.sessions || 0),
    playedSec: Math.max(stats.seconds, entry.playedSec || 0), offer: !!entry.offer, canRate: playable,
    icon: playable ? iconPath(entry) : null
  };
}

/** Today's games, the first slot first. */
function todayEntries(t) {
  var today = days.dayKey(t);
  return readLog().filter(function (entry) { return dayOf(entry.date) === today; }).sort(function (a, b) { return -newestFirst(a, b); });
}

/** The game of today to show: the latest playable one, else the latest with news (failed, waiting). */
function todayEntry(t) {
  var list = todayEntries(t).reverse();
  return list.filter(live)[0] || list[0] || null;
}

/**
 * The current game: the newest playable one not older than keepDays — with «через день» yesterday's
 * game stays the current one until the next is made.
 */
function currentEntry(s, t) {
  return readLog().filter(function (entry) {
    var ago = days.daysSince(entry.date, t);
    return live(entry) && ago >= 0 && ago < Math.max(1, s.keepDays);
  }).sort(newestFirst)[0] || null;
}

exports.log = function (limit) {
  var list = readJson(JOURNAL, []);
  return (Array.isArray(list) ? list : []).slice(-(limit || 50)).reverse();
};

exports.history = function (limit) {
  return readLog().sort(newestFirst).slice(0, limit || 30).map(view);
};

exports.today = function () {
  return view(todayEntry(Date.now()));
};

function makingView(t, s) {
  if (!REG.making) return null;
  var minutes = Math.round((t - REG.making.since) / 60000);
  return {
    date: REG.making.date, key: REG.making.date, slot: REG.making.slot || 0, since: REG.making.since, phase: REG.making.phase,
    minutes: minutes, cost: REG.making.cost, workMinutes: s.workMinutes,
    // For a progress line: the agent's share of its time, the check counts as almost done.
    fraction: REG.making.phase === 'check' ? 0.95 : Math.max(0.03, Math.min(0.9, (t - REG.making.since) / (s.workMinutes * 60000)))
  };
}

/** Everything the screen shows. */
exports.status = function () {
  var s = settings();
  var t = Date.now();
  var date = days.dayKey(t);
  try {
    promote();
  } catch (error) { /* the hub is busy: next time */ }
  var log = readLog();
  var table = taste.compute(log, t, s.decay);
  var recent = log.filter(function (entry) {
    var ago = days.daysSince(entry.date, t);
    return ago >= 0 && ago < 14;
  }).sort(newestFirst).map(view);
  var coming = nextGame(s, t);
  var wayKey = coming ? coming.key : date;
  return {
    date: date, hub: hubInstalled(), guide: files.exists(GUIDE), today: view(todayEntry(t)), making: makingView(t, s),
    games: todayEntries(t).map(view), current: view(currentEntry(s, t)), upcoming: coming,
    recent: recent,
    trial: log.filter(function (entry) { return entry.kept && !entry.promotedAt; }).sort(newestFirst).map(function (entry) {
      return { date: entry.date, title: entry.title, slug: entry.slug, open: playPath(entry), days: (entry.playDays || []).length, need: s.promoteSessions };
    }),
    offers: log.filter(function (entry) { return entry.offer; }).map(function (entry) { return { slug: entry.slug, title: entry.title, text: prompts.promoteText(entry.title) }; }),
    taste: taste.rows(table).slice(0, 30).map(function (row) {
      return { tag: row.tag, title: taste.TITLES[row.tag] || row.tag, value: row.value, score: row.score, n: row.n };
    }),
    notes: taste.notes(log, 6),
    weekly: (function () { var weekly = readJson(WEEKLY, null); return weekly && weekly.feedbackVersion === 2 ? weekly : null; })(),
    counts: taste.counts(log),
    chips: taste.REASONS.slice(),
    schedule: scheduleView(s, t),
    next: taste.direction(log.filter(function (entry) { return entry.date !== wayKey; }), wayKey, tasteOptions(s)),
    features: { actions: device.has('notify.actions'), once: device.has('job.once') },
    drawing: drawingStatus(date)
  };
};

function nextFields(out, next) {
  out.next = next ? { key: next.key, at: next.at, when: next.when } : null;
  out.nextText = next ? 'Следующая — ' + next.when : '';
  return out;
}

/**
 * For the hub's card «Игра дня» at the top of the catalog: {date, title, text, open, made, rated,
 * kept, making} as before, plus key, slot, label («Сегодня», «Вчера, вторая»), error, next {key, at,
 * when}, nextText («Следующая — завтра в 08:00»). null when there is nothing to show.
 */
exports.card = function () {
  var s = settings();
  var t = Date.now();
  var next = nextGame(s, t);
  var entry = currentEntry(s, t);
  if (entry) {
    var today = todayEntry(t);
    return nextFields({
      date: entry.date, key: entry.date, slot: slotOf(entry.date), label: labelOf(entry.date, t, s), title: entry.title, text: entry.pitch || '',
      open: playPath(entry), made: true, rated: entry.rating || null, kept: !!entry.kept, making: !!REG.making,
      error: today && !live(today) && today.error ? today.error : null
    }, next);
  }
  if (REG.making) return nextFields({ date: REG.making.date, key: REG.making.date, slot: REG.making.slot || 0, title: 'Игра дня', text: 'Делается…', open: SCREEN, made: false, making: true }, next);
  var failed = todayEntries(t).reverse().filter(function (one) { return one.error; })[0];
  if (failed) {
    return nextFields({
      date: failed.date, key: failed.date, slot: slotOf(failed.date), title: 'Игра дня', text: 'Не собралась: ' + failed.error, open: SCREEN,
      made: false, error: failed.error, final: !!failed.final, waiting: failed.waiting || null
    }, next);
  }
  return null;
};

/**
 * The card on the main screen (ui/card.html, shell home.cards): card() or what to expect, plus
 * state (game | making | error | waiting | idle | off | nohub), icon, progress, drawing, schedule.
 */
exports.homeCard = function () {
  var s = settings();
  var t = Date.now();
  var card = exports.card();
  var next = nextGame(s, t);
  var out;
  if (card) out = card;
  else {
    var text = !hubInstalled() ? 'Нужна Игротека' : s.frequency === 'off' ? 'Выключена в настройках' :
      !next ? 'По расписанию игр нет' : days.daysSince(next.day, t) === 0 ? 'Будет ' + next.when : 'Следующая — ' + next.when;
    out = nextFields({ date: days.dayKey(t), title: 'Игра дня', text: text, open: SCREEN, made: false }, next);
  }
  var entry = card && card.made ? entryOf(card.key) : null;
  var waiting = !card || card.made ? null : card.waiting;
  out.state = !hubInstalled() ? 'nohub' : card && card.made ? 'game' : REG.making ? 'making' : waiting ? 'waiting' :
    card && card.error ? 'error' : s.frequency === 'off' ? 'off' : 'idle';
  out.icon = entry ? iconPath(entry) : null;
  out.progress = makingView(t, s);
  out.canMake = hubInstalled() && !REG.making && buttonSlot(t, s) >= 0;
  out.schedule = days.scheduleText(s, activeSlots(s));
  var d = drawingStatus(days.dayKey(t));
  out.drawing = d.installed && d.on ? { ready: d.ready, played: d.played, open: d.open, text: d.text } : null;
  return out;
};

exports.widget = function () {
  var card = exports.homeCard();
  var lines = card.made ? ['«' + card.title + '»'].concat(card.text ? [card.text] : []) : [card.text];
  if (card.nextText && card.text.indexOf(card.next.when) < 0) lines.push(card.nextText);
  return { title: 'Игра дня', text: lines.join('\n'), open: card.open };
};

// ---- start ------------------------------------------------------------------------------------------------

/** Make and ready jobs per slot («daily-game:make», «daily-game:make-2», …), the weekly summary; stale slots go. */
function schedule() {
  var s = settings();
  var slots = s.frequency === 'off' ? [] : activeSlots(s);
  for (var i = 0; i < 9; i++) {
    var suffix = i ? '-' + (i + 1) : '';
    if (i < slots.length) {
      (function (slot, at) {
        job('daily-game:make' + suffix, { at: at.make }, function () { spawn(function () { morning(slot ? 'расписание, игра ' + (slot + 1) : 'утро', slot); }); });
        job('daily-game:ready' + suffix, { at: at.ready }, function () { readyJob(slot); });
      })(i, slots[i]);
    } else {
      try {
        unjob('daily-game:make' + suffix);
        unjob('daily-game:ready' + suffix);
      } catch (error) { /* none */ }
    }
  }
  job('daily-game:week', { at: s.summaryAt }, function () {
    spawn(function () {
      try {
        exports.weekly(false);
      } catch (error) {
        journal('Сводка: ' + msg(error));
      }
    });
  });
}

/** One line about the module in the main agent's memory, so that «сделай игру дня» works in the chat. */
function teachAgent() {
  var path = 'agent/memory.md';
  var text = '';
  try {
    text = files.exists(path) ? String(files.read(path)) : '';
  } catch (error) {
    text = '';
  }
  if (text.indexOf(HOME + '/main.js') >= 0) return false;
  var line = '- Игра дня: «сделай игру дня» — require(\'' + HOME + '/main.js\').makeNow(); оценка реализации — rate(\'ГГГГ-ММ-ДД\', {stars: 1–5, reasons, comment, voice, genrePreference: "unknown|like|neutral|dislike"}); отношение к жанру указывать только со слов владельца; ' +
    '«оставь её» — keep(\'ГГГГ-ММ-ДД\'); вкус — status().taste; агент, который делает игры, — agents/gamesmith.';
  files.write(path, (text ? text.replace(/\s*$/, '\n') : '') + line + '\n');
  return true;
}

exports.start = function () {
  schedule();
  on('network', function (event) {
    if (!event || !event.online || REG.making) return;
    var s = settings();
    var key = currentKey(Date.now(), s);
    var entry = key ? entryOf(key) : null;
    if (!entry || !entry.waiting || entry.made || entry.final) return;
    spawn(function () { exports.make('сеть'); });
  }, 'game-of-the-day-network');
  try {
    installAgent();
  } catch (error) {
    console.warn('game-of-the-day: агент: ' + error);
  }
  try {
    teachAgent();
  } catch (error) {
    console.warn('game-of-the-day: память агента: ' + error);
  }
  spawn(function () {
    try {
      exports.sweep();
    } catch (error) {
      journal('Уборка: ' + msg(error));
    }
  });
  // Started inside a slot's window without its game (the phone was off at make, the app died mid-work): soon.
  var s = settings();
  var key = currentKey(Date.now(), s);
  if (hubInstalled() && key && !REG.making) {
    var entry = entryOf(key);
    if (!entry || (!entry.made && !entry.final && (entry.attempts || 0) < s.maxAttempts)) scheduleRetry(s, true, key);
  }
  return true;
};

// For checks and other modules.
exports.REASONS = taste.REASONS;
exports.AGENT = AGENT;
exports.installAgent = function () { return installAgent(); };
exports.verify = function (date) { return verify(needDate(date)); };
