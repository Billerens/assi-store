// Фокус: a work timer. For its time the phone goes into "do not disturb", messages quietly pile
// up in the inbox, distracting apps do not open, and at the end a short summary of what was
// missed comes. The description: docs/modules/focus.md in Axiko.
//
// A session lives in data/focus/state.json (so it survives the app being unloaded): its start and
// end, how "do not disturb" was switched, attempts, calls. The end comes by the shell's exact
// alarm (job 'focus:end'), by a sleeping thread while the process lives, by a button, by the
// voice — and happens once: whoever takes the session out of state.json first ends it.
//
// The inbox (modules/inbox) is optional: with it the summary has sorted messages and replies,
// without it — the phone's recent notifications.
//
// Events to the screens: emit('focus.changed', { type }), emit('focus.ended', { sessionId, … }),
// emit('focus.summary', { sessionId }) — the model's digest is ready.
var axiko = require('lib/axiko');
var timer = require('./logic/timer.js');
var dndLib = require('./logic/dnd.js');
var distract = require('./logic/distract.js');
var summaryLib = require('./logic/summary.js');
var history = require('./logic/history.js');
var callsLib = require('./logic/calls.js');
var settingsLib = require('./logic/settings.js');
var phone = require('./android.js');
var awardsLib = require('./logic/awards.js');
var achieve = require('./achieve.js');

var SCREEN = 'modules/focus/ui/index.html';
var RECORDER_MAIN = 'modules/recorder/main.js';
var RECORDER_SCREEN = 'modules/recorder/ui/index.html';
var SETTINGS_PATH = 'data/focus/settings.json';
var STATE_PATH = 'data/focus/state.json';
var ACHIEVED_PATH = 'data/focus/achievements.json';
var TOOL_PATH = 'tools/focus.js';
var TOOL_MARK = '// Инструмент модуля «Фокус»';
var ROLE = 'focus.digest';
var JOB_END = 'focus:end';
var JOB_CLEAN = 'focus:clean';
var KEY = 'focus';
var MINUTE = 60000;
var DAY = 86400000;

// What lives as long as the process, kept on the engine's global object: a reload of this file
// must not lose the lock or leave a second sleeping timer.
var G = typeof global !== 'undefined' ? global : {};
var LIVE = G.__focusLive || (G.__focusLive = {
  lock: new java.util.concurrent.locks.ReentrantLock(),
  sleeper: 0,
  memory: {},
  unsubscribe: {},
  widgetAt: 0
});

function locked(fn) {
  LIVE.lock.lock();
  try {
    return fn();
  } finally {
    LIVE.lock.unlock();
  }
}

function message(error) {
  var text = String(error && error.message ? error.message : error);
  return text.replace(/^[\w.$]+(Exception|Error):\s*/, '').slice(0, 300);
}

// ---- storage ---------------------------------------------------------------------------------

var db = axiko.db('focus');

function columns(table) {
  return db.query('pragma table_info(' + table + ')').map(function (row) { return row.name; });
}

db.exec('create table if not exists sessions (id text primary key, task text, startAt integer, plannedMin integer, endAt integer, ' +
  'actualMin integer, endedBy text, extendedMin integer default 0, dndMode text, dndBy text, dndOk integer default 0, ' +
  'blockedAttempts integer default 0, blockedApps text, messages integer default 0, important integer default 0, summary text, cycle integer)');
(function () {
  var have = columns('sessions');
  // attemptsKnown: the attempts of the session were really counted (the lock was on and could see the apps).
  var wanted = { headline: 'text', details: 'text', missedCalls: 'integer default 0', cycles: 'integer', recordingId: 'integer', attemptsKnown: 'integer default 0' };
  Object.keys(wanted).forEach(function (name) {
    if (have.indexOf(name) < 0) db.exec('alter table sessions add column ' + name + ' ' + wanted[name]);
  });
})();
db.exec('create index if not exists sessions_start on sessions (startAt)');

function settings() {
  return settingsLib.normalize(axiko.files.readJson(SETTINGS_PATH, {}));
}

/** The session now, as state.json holds it: { id, kind, startAt, endAt, … } or {} (maybe { next }). */
function readState() {
  try {
    return axiko.files.readJson(STATE_PATH, {}) || {};
  } catch (error) {
    return {};
  }
}

function writeState(state) {
  axiko.files.writeJson(STATE_PATH, state || {});
}

function changeState(fn) {
  return locked(function () {
    var state = readState();
    if (!state.id) return null;
    var next = fn(state);
    if (next) writeState(next);
    return next;
  });
}

function changed(type, data) {
  try {
    emit('focus.changed', { type: type, data: data || null });
  } catch (error) { /* no screens */ }
}

/** Redraws the widget, at most every few seconds. */
function refreshWidget() {
  if (Date.now() - LIVE.widgetAt < 3000) return;
  LIVE.widgetAt = Date.now();
  try { axiko.widget.refresh('focus'); } catch (error) { /* no widget */ }
}

// ---- the inbox, when it is installed -----------------------------------------------------------

/** modules/inbox/main.js, or null: Focus works without it. */
function inbox() {
  if (!axiko.files.exists('modules/inbox/main.js')) return null;
  try {
    var found = require('modules/inbox/main.js');
    return found && typeof found.since === 'function' ? found : null;
  } catch (error) {
    console.warn('focus: inbox: ' + message(error));
    return null;
  }
}

// ---- the recorder (Диктофон), when it is installed -------------------------------------------------

/** modules/recorder/main.js, or null: without it there is no «Надиктовать итог». */
function recorder() {
  if (!axiko.files.exists(RECORDER_MAIN)) return null;
  try {
    var found = require(RECORDER_MAIN);
    return found && typeof found.startRecording === 'function' ? found : null;
  } catch (error) {
    console.warn('focus: recorder: ' + message(error));
    return null;
  }
}

/** May the texts go to focus.digest? The inbox's own choice of where texts may go is followed. */
function modelAllowed() {
  if (!inbox()) return { ok: false, why: 'Без Входящих выжимки моделью нет' };
  var mode = 'auto';
  try {
    mode = String((axiko.files.readJson('data/inbox/settings.json', {}) || {}).triageMode || 'auto');
  } catch (error) { /* the default */ }
  if (mode === 'off') return { ok: false, why: 'Во Входящих разбор моделью выключен' };
  var target;
  try {
    target = native('models.resolve', ROLE);
  } catch (error) {
    return { ok: false, why: 'Модель не настроена: ' + message(error) };
  }
  var local = String((target && target.baseUrl) || '').indexOf('local:') === 0;
  if (mode === 'local' && !local) return { ok: false, why: 'Во Входящих тексты отдаются только модели на телефоне, а роли «Фокус: сводка» назначена облачная' };
  return { ok: true, local: local, model: target ? String(target.model || '') : '' };
}

// ---- subscriptions of a session ------------------------------------------------------------------

function subscribe(name, fn) {
  var off = on(name, fn, KEY);
  LIVE.unsubscribe[name] = typeof off === 'function' ? off : null;
}

function unsubscribe(name) {
  if (phone.has('off')) {
    try {
      off(name, KEY);
      LIVE.unsubscribe[name] = null;
      return;
    } catch (error) { /* the older way */ }
  }
  var fn = LIVE.unsubscribe[name];
  if (fn) {
    try { fn(); } catch (error) { /* gone */ }
  } else {
    // Without off(): a later subscription under the same key replaces the earlier one.
    on(name, function () {}, KEY);
  }
  LIVE.unsubscribe[name] = null;
}

function listen(session, s) {
  if (session.kind !== 'work') return;
  subscribe('call', function (event) {
    try {
      require('modules/focus/main.js').callEvent(event);
    } catch (error) {
      console.error('focus: call: ' + message(error));
    }
  });
  if (session.block) {
    subscribe('screen.app', function (event) {
      try {
        require('modules/focus/main.js').appOpened(event);
      } catch (error) {
        console.error('focus: screen.app: ' + message(error));
      }
    });
  }
  if (session.breakthrough === 'own') {
    subscribe('notification', function (notice) {
      try {
        require('modules/focus/main.js').noticeDuring(notice);
      } catch (error) {
        console.error('focus: notification: ' + message(error));
      }
    });
  }
}

function unlisten() {
  ['call', 'screen.app', 'notification'].forEach(function (name) {
    try { unsubscribe(name); } catch (error) { /* not there */ }
  });
}

// ---- the end of a session in time ------------------------------------------------------------------

function endJob() {
  require('modules/focus/main.js').timeUp();
}

/** The exact alarm of the shell: a one-off job when it has them, otherwise the daily one at the minute. */
function scheduleEnd(session) {
  if (session.pausedAt) return;
  try {
    if (phone.has('job.once')) job(JOB_END, { once: session.endAt }, endJob);
    else job(JOB_END, { at: timer.atClock(session.endAt).at }, endJob);
  } catch (error) {
    console.warn('focus: job: ' + message(error));
  }
}

/** A sleeping thread up to the end, for the end to the second while the process lives; redraws the widget. */
function sleeper(id) {
  LIVE.sleeper++;
  var mine = LIVE.sleeper;
  spawn(function () {
    while (LIVE.sleeper === mine) {
      var state = readState();
      if (!state.id || state.id !== id) return;
      var s = settings();
      var left = state.pausedAt ? s.widgetEveryMin * MINUTE : state.endAt - Date.now();
      if (!state.pausedAt && left <= 0) {
        if (LIVE.sleeper === mine) exports.timeUp();
        return;
      }
      sleep(Math.max(250, Math.min(left, s.widgetEveryMin * MINUTE)));
      if (LIVE.sleeper !== mine) return;
      LIVE.widgetAt = 0;
      refreshWidget();
    }
  });
}

/** The time of the session is up (the job or the sleeping thread). */
exports.timeUp = function () {
  var state = readState();
  if (!state.id) {
    try { unjob(JOB_END); } catch (error) { /* none */ }
    return { ok: false, why: 'Фокус не идёт' };
  }
  if (state.pausedAt) return { ok: false, why: 'Пауза' };
  if (Date.now() < state.endAt - 1000) {
    // The daily job came at a minute when the session was longer (extended): set it anew.
    scheduleEnd(state);
    sleeper(state.id);
    return { ok: false, why: 'Ещё не время' };
  }
  return finish('timer');
};

// ---- the notification of a session -----------------------------------------------------------------

function sessionTitle(session) {
  if (session.kind === 'break') return session.long ? 'Длинный перерыв' : 'Перерыв';
  return 'Фокус' + (session.task ? ' · ' + session.task : '');
}

function showOngoing(session, s) {
  var text;
  if (session.pausedAt) text = 'Пауза: ' + (session.pausedBy === 'call' ? 'звонок' : 'остановлено') + ' · осталось ' + timer.leftText(timer.left(session, Date.now()));
  else text = 'До ' + timer.clockOf(session.endAt) + (session.cycle ? ' · цикл ' + session.cycle + ' из ' + session.cycles : '');
  if (session.kind === 'work' && !session.dndOk && session.dndWanted) text += ' · без «не беспокоить»';
  var buttons = session.kind === 'break'
    ? [{ title: 'Начать работу', act: 'next' }, { title: 'Закончить', act: 'end' }]
    : [{ title: '+' + s.extendMin + ' мин', act: 'extend' }, { title: 'Закончить', act: 'end' }];
  if (session.kind === 'break' && !timer.afterBreak(session, s)) buttons = [{ title: 'Закончить', act: 'end' }];
  try {
    phone.showSession({ title: sessionTitle(session), text: text, open: SCREEN, when: session.pausedAt ? 0 : session.endAt, buttons: buttons });
  } catch (error) {
    console.warn('focus: notification: ' + message(error));
  }
}

/** Everything a running session needs in this process: the alarm, the thread, the subscriptions, the notification. */
function arm(session, s, test) {
  scheduleEnd(session);
  sleeper(session.id);
  listen(session, s);
  if (!test) showOngoing(session, s);
  LIVE.widgetAt = 0;
  refreshWidget();
}

// ---- start -------------------------------------------------------------------------------------------

/** Silence for a work session, by the settings. Fills dndWanted, prevFilter, dndBy, dndFilter, dndOk, dndError. */
function silence(session, wanted, s) {
  session.dndWanted = Boolean(wanted);
  session.prevFilter = phone.filter();
  session.dndBy = null;
  session.dndFilter = session.prevFilter;
  session.dndOk = dndLib.silent(session.prevFilter);
  session.dndError = '';
  session.dndNote = '';
  var plan = dndLib.atStart(session.prevFilter, wanted);
  if (!plan.touch) {
    if (plan.reason === 'already') session.dndNote = '«Не беспокоить» уже было включено — Фокус его не трогает';
    return session;
  }
  var result = phone.silence(session.mode, s);
  session.dndBy = result.ok ? result.by : null;
  session.dndFilter = result.filter;
  session.dndOk = result.ok;
  if (!result.ok) session.dndError = dndLib.failure(result.tried);
  return session;
}

function viewOf(state, s, now) {
  if (!state || !state.id) return null;
  return {
    id: state.id, kind: state.kind, task: state.task, startAt: state.startAt, endAt: state.endAt,
    left: timer.left(state, now), total: timer.total(state), paused: Boolean(state.pausedAt), pausedBy: state.pausedBy || null,
    cycle: state.cycle || null, cycles: state.cycles || null, long: Boolean(state.long),
    dndWanted: Boolean(state.dndWanted), dndOk: Boolean(state.dndOk), dndBy: state.dndBy || null, dndError: state.dndError || '', dndNote: state.dndNote || '',
    attempts: state.attempts || 0, block: Boolean(state.block), watch: state.watch || 'none', early: timer.early(state, now, s.earlyThreshold),
    extendedMin: state.extendedMin || 0
  };
}

/**
 * Starts a session: startFocus({ minutes, task, mode, dnd, block, cycles }).
 *   mode — 'priority' | 'alarms' | 'none' (the setting by default); dnd, block, cycles — the
 *   switches of the screen (the settings by default). options.test — the checks: no silence, no
 *   notifications, nothing in the shared base.
 * Returns { ok, session } or { ok: false, why }.
 */
exports.startFocus = function (options) {
  options = options || {};
  var s = settings();
  var now = Date.now();
  var running = readState();
  if (running.id && running.kind === 'work') {
    return { ok: false, why: 'Фокус уже идёт: осталось ' + timer.leftText(timer.left(running, now)), session: viewOf(running, s, now) };
  }
  if (running.id) finish('owner', { silent: true, stopCycles: true });
  var cycles = options.cycles === undefined || options.cycles === null ? s.cycles : Boolean(options.cycles);
  var minutes = timer.minutes(options.minutes, s) || (cycles ? s.workMin : s.durations[0]);
  var mode = settingsLib.CHOICES.dndMode.list.indexOf(options.mode) >= 0 ? options.mode : s.dndMode;
  var session = timer.create({
    minutes: minutes, task: options.task, now: now, mode: mode, kind: 'work',
    cycle: options.cycle || (cycles ? 1 : null), cycles: options.cyclesTotal || (cycles ? s.cyclesCount : null)
  });
  session.test = Boolean(options.test);
  var wantDnd = options.test ? false : (options.dnd === undefined || options.dnd === null ? s.dnd : Boolean(options.dnd));
  silence(session, wantDnd, s);
  var wantBlock = options.block === undefined || options.block === null ? s.block : Boolean(options.block);
  session.block = Boolean(wantBlock && s.distractApps.length);
  session.watch = !session.block ? 'none' : phone.screenOn() ? 'screen' : 'usage';
  session.breakthrough = null;
  if (s.breakthrough && !options.test) {
    var ib = inbox();
    if (ib && typeof ib.repeatImportant === 'function') {
      try {
        ib.repeatImportant({ until: session.endAt, people: s.people, everyMin: s.breakthroughEveryMin, from: 'focus' });
        session.breakthrough = 'inbox';
      } catch (error) {
        console.warn('focus: inbox.repeatImportant: ' + message(error));
      }
    }
    if (!session.breakthrough && s.people.length) session.breakthrough = 'own';
  }
  session.inbox = Boolean(inbox());
  LIVE.memory = {};
  locked(function () { writeState(session); });
  arm(session, s, options.test);
  if (!options.test) {
    try { phone.hideEnd(); } catch (error) { /* none */ }
  }
  changed('start');
  return { ok: true, session: viewOf(session, s, now) };
};

/** A break (cycles, or "Перерыв 5 минут" after a session): no silence, a countdown and the end. */
function startBreak(options, s) {
  var now = Date.now();
  var session = timer.create({
    minutes: options.minutes, task: options.task, now: now, kind: 'break',
    cycle: options.cycle || null, cycles: options.cycles || null, long: options.long
  });
  session.dndWanted = false;
  session.dndOk = false;
  session.test = Boolean(options.test);
  locked(function () { writeState(session); });
  arm(session, s, options.test);
  changed('break');
  return { ok: true, session: viewOf(session, s, now) };
}

exports.startBreak = function (minutes) {
  var s = settings();
  var running = readState();
  if (running.id && running.kind === 'work') return { ok: false, why: 'Сначала закончите фокус' };
  if (running.id) finish('owner', { silent: true, stopCycles: true });
  return startBreak({ minutes: timer.minutes(minutes, s) || s.breakMin }, s);
};

/** The next work of the cycles: after a break (or instead of it). */
exports.next = function () {
  var s = settings();
  var state = readState();
  var plan = null;
  var test = Boolean(state.test || (state.next && state.next.test));
  if (state.id && state.kind === 'break') {
    plan = timer.afterBreak(state, s);
    finish('owner', { silent: true, stopCycles: true });
  } else if (state.id) {
    return { ok: false, why: 'Фокус уже идёт' };
  } else if (state.next) {
    plan = state.next;
  }
  if (!plan) return exports.startFocus({ test: test });
  return exports.startFocus({ minutes: plan.minutes, task: plan.task, cycles: true, cycle: plan.cycle, cyclesTotal: plan.cycles, test: test });
};

// ---- during a session ------------------------------------------------------------------------------

/** "+10 минут" (or as many as asked). */
exports.extend = function (minutes) {
  var s = settings();
  var m = timer.minutes(minutes, s) || s.extendMin;
  var state = changeState(function (now) {
    var next = timer.extend(now, m);
    if (timer.total(next) > s.maxMinutes) return null;
    return next;
  });
  if (!state) return { ok: false, why: readState().id ? 'Длиннее ' + s.maxMinutes + ' минут нельзя' : 'Фокус не идёт' };
  scheduleEnd(state);
  if (!state.test) showOngoing(state, s);
  if (state.breakthrough === 'inbox') {
    var ib = inbox();
    try {
      if (ib) ib.repeatImportant({ until: state.endAt, people: s.people, everyMin: s.breakthroughEveryMin, from: 'focus' });
    } catch (error) { /* stays till the old end */ }
  }
  LIVE.widgetAt = 0;
  refreshWidget();
  changed('extend');
  return { ok: true, session: viewOf(state, s, Date.now()) };
};

/** A distracting app came to the front (on('screen.app')). */
exports.appOpened = function (event) {
  var s = settings();
  var pkg = String((event && event.package) || '');
  var now = Date.now();
  var own = phone.ownPackages();
  var result = locked(function () {
    var state = readState();
    if (!state.id || state.kind !== 'work' || !state.block) return null;
    var decision = distract.decide(pkg, now, LIVE.memory, s, own);
    LIVE.memory = decision.memory;
    if (decision.attempt) {
      state = distract.count(state, pkg);
      writeState(state);
    }
    return { decision: decision, state: state };
  });
  if (!result || result.decision.action === 'none') return { action: 'none' };
  var action = result.decision.action;
  var quiet = Boolean(result.state.test);
  if (action === 'home' && !quiet) {
    try { phone.home(); } catch (error) { console.warn('focus: home: ' + message(error)); }
  }
  var text = action === 'allow' ? 'Если очень надо — пускаю. ' + timer.reminder(result.state, now) : timer.reminder(result.state, now);
  if (!quiet) {
    try { phone.toast(text); } catch (error) { /* no toast */ }
  }
  changed('attempt', { package: pkg, action: action });
  return { action: action, attempts: result.state.attempts, text: text };
};

/** A call during a session (on('call')): remembered; a pause or the end by the settings. */
exports.callEvent = function (event) {
  var s = settings();
  var now = Date.now();
  var name = event && event.state === 'ringing' ? phone.contactName(event.number) : '';
  var result = locked(function () {
    var state = readState();
    if (!state.id || state.kind !== 'work') return null;
    state.calls = callsLib.step(state.calls, event, now, name);
    var what = callsLib.react(event, s.callAction, Boolean(state.pausedAt && state.pausedBy === 'call'));
    if (what === 'pause') {
      state = timer.pause(state, now);
      state.pausedBy = 'call';
    } else if (what === 'resume') {
      state = timer.resume(state, now);
      state.pausedBy = null;
    }
    writeState(state);
    return { what: what, state: state };
  });
  if (!result) return null;
  if (result.what === 'end') return finish('call');
  if (result.what === 'pause' || result.what === 'resume') {
    if (result.what === 'pause') {
      try { unjob(JOB_END); } catch (error) { /* none */ }
    } else {
      scheduleEnd(result.state);
    }
    if (!result.state.test) showOngoing(result.state, s);
    refreshWidget();
    changed(result.what);
  }
  return result.what;
};

/**
 * Without the inbox: a notification during a session from a person of the list is repeated
 * through the silence, at most once in breakthroughEveryMin for one person.
 * options.test — only says what it would do.
 */
exports.noticeDuring = function (notice, options) {
  options = options || {};
  var s = settings();
  var now = Date.now();
  if (!notice || notice.ongoing || notice.package === phone.ownPackage()) return { through: false };
  var title = summaryLib.cut(notice.title, 80);
  if (!title || !summaryLib.isPerson(title, s.people)) return { through: false };
  var key = String(notice.package || '') + '|' + title.toLowerCase();
  var go = false;
  locked(function () {
    var state = readState();
    if (!state.id || state.kind !== 'work' || (state.breakthrough !== 'own' && !options.test)) return;
    var last = state.lastThrough || {};
    if (now - (last[key] || 0) < s.breakthroughEveryMin * MINUTE) return;
    go = true;
    if (options.test) return;
    last[key] = now;
    state.lastThrough = last;
    writeState(state);
  });
  if (go && !options.test) {
    try {
      phone.notifyThrough({ title: 'Сквозь фокус · ' + title, text: summaryLib.cut(notice.text, 300) || 'Новое сообщение', open: SCREEN });
    } catch (error) {
      console.warn('focus: through: ' + message(error));
    }
  }
  return { through: go };
};

// ---- the end -------------------------------------------------------------------------------------------

function restoreDnd(session, s) {
  if (!session.dndBy) return { restored: false, reason: session.dndOk ? 'not ours' : 'none' };
  var current = phone.filter();
  var plan = dndLib.atEnd(session, current);
  if (!plan.restore) return { restored: false, reason: plan.reason, filter: current };
  var result = phone.unsilence(plan.to, session.dndBy, s);
  if (!result.ok) console.warn('focus: could not put "do not disturb" back: ' + result.filter);
  return { restored: result.ok, by: result.by, filter: result.filter };
}

/** What came during the session: from the inbox, otherwise from the recent notifications. */
function gather(session, from, to, s) {
  var made = null;
  var ib = inbox();
  if (ib) {
    try {
      made = summaryLib.fromInbox(ib.since(from, to), s);
    } catch (error) {
      console.warn('focus: inbox.since: ' + message(error));
      made = null;
    }
  }
  if (!made) {
    var list = [];
    try {
      list = axiko.notifications.recent(s.noticesLimit) || [];
    } catch (error) {
      list = [];
    }
    made = summaryLib.fromNotices(list, from, to, s, phone.ownPackage());
  }
  return made;
}

function countSince(from, to, s) {
  var ib = inbox();
  if (ib) {
    try {
      return { count: Number(ib.since(from, to).total) || 0, source: 'inbox' };
    } catch (error) { /* the notifications then */ }
  }
  var list = [];
  try {
    list = axiko.notifications.recent(s.noticesLimit) || [];
  } catch (error) {
    list = [];
  }
  return { count: summaryLib.fromNotices(list, from, to, s, phone.ownPackage()).total, source: 'notices' };
}

/**
 * Ends what is running (a session or a break), once. by: 'timer' | 'owner' | 'voice' | 'call' | 'restore'.
 * options: { silent — no notification at the end (a break taken over by a new start),
 *            stopCycles — no break after it }.
 */
function finish(by, options) {
  options = options || {};
  var s = settings();
  var now = Date.now();
  var session = locked(function () {
    var state = readState();
    if (!state.id) return null;
    writeState({});
    return state;
  });
  if (!session) return { ok: false, why: 'Фокус не идёт' };
  LIVE.sleeper++;
  try { unjob(JOB_END); } catch (error) { /* none */ }
  unlisten();
  try { phone.hideSession(); } catch (error) { /* none */ }
  if (session.kind === 'break') return finishBreak(session, by, options, s);

  // 1. "Do not disturb" back — only what Focus itself switched, and only if it is still so.
  var dnd = restoreDnd(session, s);
  if (session.breakthrough === 'inbox') {
    var ibStop = inbox();
    try { if (ibStop) ibStop.repeatImportant(null); } catch (error) { /* it ends by its time */ }
  }

  // 2. The summary.
  var until = by === 'restore' ? Math.min(now, session.pausedAt || session.endAt) : now;
  if (session.pausedAt) session = timer.resume(session, until);
  var actualMin = timer.actualMin(session, until);
  var attemptsKnown = Boolean(session.block && session.watch === 'screen' && !session.test);
  if (session.block && session.watch !== 'screen' && !session.test) {
    var events = phone.usageEvents(session.startAt, until);
    if (events) {
      var counted = distract.fromUsage(events, s.distractApps, session.startAt, until);
      session.attempts = counted.attempts;
      session.blockedApps = counted.blockedApps;
      session.watch = 'usage';
      attemptsKnown = true;
    }
  }
  var summary = gather(session, session.startAt, until, s);
  var missed = summaryLib.missed(session.calls);
  var headline = summaryLib.headline(session, actualMin);
  var text = summaryLib.text(headline, summary, null, missed);
  var details = { summary: summary, missed: missed, digest: null, dnd: dnd, watch: session.watch || 'none', inbox: summary.source === 'inbox' };

  // 3. The record.
  db.exec('insert or replace into sessions (id, task, startAt, plannedMin, endAt, actualMin, endedBy, extendedMin, dndMode, dndBy, dndOk, ' +
    'blockedAttempts, blockedApps, messages, important, summary, cycle, cycles, headline, details, missedCalls, attemptsKnown) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [
    session.id, session.task || null, session.startAt, session.plannedMin, until, actualMin, by, session.extendedMin || 0,
    session.dndWanted ? session.mode : null, session.dndBy || null, session.dndOk ? 1 : 0, session.attempts || 0,
    JSON.stringify(session.blockedApps || {}), summary.total, summary.important.length, text, session.cycle || null, session.cycles || null,
    headline, JSON.stringify(details), missed.length, attemptsKnown ? 1 : 0
  ]);
  if (attemptsKnown) quietAward(s);
  if (!session.test && actualMin >= s.minRecordMin && actualMin > 0) {
    try {
      require('lib/base').add({
        kind: 'focus', at: session.startAt, title: session.task || 'Фокус', amount: actualMin, unit: 'min',
        data: { sessionId: session.id, blockedAttempts: session.attempts || 0, endedBy: by }, source: 'focus'
      });
    } catch (error) {
      console.warn('focus: base: ' + message(error));
    }
  }

  // 4. Cycles: the break begins at once (without silence).
  var pause = options.stopCycles ? null : timer.afterWork(session, s);

  // 5. The notification — after the silence is gone, so it is heard.
  if (!session.test && !options.silent) {
    var buttons = pause
      ? [{ title: 'Пропустить перерыв', act: 'next' }]
      : [{ title: 'Ещё сессия', act: 'again' }, { title: 'Перерыв ' + s.breakMin + ' мин', act: 'break' }];
    var body = headline + (pause ? '\n' + (pause.long ? 'Длинный перерыв' : 'Перерыв') + ' ' + pause.minutes + ' мин — уже идёт' : '');
    try {
      phone.notifyEnd({ title: summaryLib.endText(summary, missed), text: body, open: SCREEN + '?session=' + encodeURIComponent(session.id), buttons: buttons });
    } catch (error) {
      console.warn('focus: end notification: ' + message(error));
    }
    try {
      if (!dndLib.silent(phone.filter())) phone.vibrate(s.vibrate);
    } catch (error) { /* no vibration */ }
  }
  try {
    emit('focus.ended', { sessionId: session.id, minutes: actualMin, endedBy: by, messages: summary.total, important: summary.important.length });
  } catch (error) { /* no screens */ }
  if (pause) startBreak({ minutes: pause.minutes, task: pause.task, cycle: pause.cycle, cycles: pause.cycles, long: pause.long, test: session.test }, s);
  if (summaryLib.wantsModel(summary, s) && !session.test) {
    var id = session.id;
    spawn(function () {
      try {
        require('modules/focus/main.js').digest(id);
      } catch (error) {
        console.warn('focus: digest: ' + message(error));
      }
    });
  }
  LIVE.widgetAt = 0;
  refreshWidget();
  changed('ended');
  return { ok: true, sessionId: session.id, minutes: actualMin, headline: headline, text: summaryLib.endText(summary, missed), dnd: dnd };
}

function finishBreak(session, by, options, s) {
  var plan = options.stopCycles ? null : timer.afterBreak(session, s);
  if (plan && s.autoNext && by !== 'owner') {
    LIVE.widgetAt = 0;
    var started = exports.startFocus({ minutes: plan.minutes, task: plan.task, cycles: true, cycle: plan.cycle, cyclesTotal: plan.cycles, test: session.test });
    return { ok: true, break: true, next: started };
  }
  if (plan) {
    locked(function () {
      var state = readState();
      if (!state.id) writeState({ next: { kind: plan.kind, minutes: plan.minutes, cycle: plan.cycle, cycles: plan.cycles, task: plan.task, test: Boolean(session.test) } });
    });
  }
  if (!session.test && !options.silent && by !== 'owner') {
    var buttons = plan ? [{ title: 'Начать работу', act: 'next' }] : [{ title: 'Ещё сессия', act: 'again' }];
    var text = plan ? 'Цикл ' + plan.cycle + ' из ' + plan.cycles + (plan.task ? ' · ' + plan.task : '') : (session.cycle ? 'Циклы пройдены' : 'Можно снова за работу');
    try {
      phone.notifyEnd({ title: 'Перерыв окончен', text: text, open: SCREEN, buttons: buttons });
      if (!dndLib.silent(phone.filter())) phone.vibrate(s.vibrate);
    } catch (error) {
      console.warn('focus: break notification: ' + message(error));
    }
  }
  LIVE.widgetAt = 0;
  refreshWidget();
  changed('break-ended');
  return { ok: true, break: true, next: plan };
}

/** Ends the session now. by: 'owner' (the screen, the notification), 'voice' (the tool). */
exports.end = function (by) {
  var why = ['owner', 'voice', 'call', 'timer', 'restore'].indexOf(by) >= 0 ? by : 'owner';
  return finish(why, {});
};

/** Ends the cycles: the break (or the pending next work) is dropped. */
exports.stopCycles = function () {
  var state = readState();
  if (state.id && state.kind === 'break') return finish('owner', { silent: true, stopCycles: true });
  if (state.id) return finish('owner', { stopCycles: true });
  locked(function () { if (!readState().id) writeState({}); });
  changed('stop');
  return { ok: true };
};

/** The buttons of the notifications: { act: 'extend' | 'end' | 'again' | 'break' | 'next' }. */
exports.fromNotice = function (args) {
  var act = String((args && args.act) || '');
  var s = settings();
  if (act === 'extend') return exports.extend(s.extendMin);
  if (act === 'end') {
    var state = readState();
    return state.kind === 'break' ? exports.stopCycles() : exports.end('owner');
  }
  if (act === 'next') return exports.next();
  if (act === 'break') return exports.startBreak(s.breakMin);
  if (act === 'again') {
    var last = db.query("select task, plannedMin from sessions order by startAt desc limit 1")[0];
    return exports.startFocus(last ? { minutes: last.plannedMin, task: last.task } : {});
  }
  return null;
};

/** The model's digest of "the rest" (one request a session, in the background). */
exports.digest = function (sessionId) {
  var s = settings();
  var row = db.query('select * from sessions where id = ?', [sessionId])[0];
  if (!row || !row.details) return { ok: false, why: 'Нет такой сессии' };
  var details = JSON.parse(row.details);
  if (!summaryLib.wantsModel(details.summary, s)) return { ok: false, why: 'Бесед немного — сводка без модели' };
  var allowed = modelAllowed();
  if (!allowed.ok) return { ok: false, why: allowed.why };
  var request = summaryLib.digestRequest(details.summary, row.actualMin || 0, s);
  var answer;
  try {
    answer = require('lib/ai').ask({ role: ROLE, system: request.system, prompt: request.prompt, temperature: 0.2 });
  } catch (error) {
    return { ok: false, why: message(error) };
  }
  var lines = summaryLib.readDigest(answer, s.digestLines);
  if (!lines.length) return { ok: false, why: 'Модель ничего не ответила' };
  details.digest = lines;
  var text = summaryLib.text(row.headline || '', details.summary, lines, details.missed);
  db.exec('update sessions set summary = ?, details = ? where id = ?', [text, JSON.stringify(details), sessionId]);
  try { emit('focus.summary', { sessionId: sessionId }); } catch (error) { /* no screens */ }
  return { ok: true, digest: lines };
};

// ---- «Неделя без единой попытки отвлечься» for «Ачивки за жизнь» (without them — the shared box) ----------

/**
 * After a session under the lock: quietDays days without a single attempt to open a distracting app,
 * with such sessions on at least quietMinDays of them. Only sessions whose attempts were really counted
 * take part. Once.
 */
function quietAward(s) {
  try {
    if (achieve.given(axiko.files, ACHIEVED_PATH, 'focus/quiet-week')) return null;
    var now = Date.now();
    var rows = db.query('select startAt, blockedAttempts from sessions where attemptsKnown = 1 and startAt >= ?', [now - s.quietDays * DAY]);
    var got = awardsLib.quiet(rows, now, s.quietDays, s.quietMinDays);
    if (!got.ok) return null;
    return achieve.give(axiko.files, require, {
      key: 'focus/quiet-week', source: 'focus', category: 'Экран', title: 'Неделя без единой попытки отвлечься', icon: 'lock', rarity: 'rare',
      text: s.quietDays + ' дней ни одной попытки открыть отвлекающее приложение во время фокуса (сессии в ' + got.days + ' из них)', at: now
    }, ACHIEVED_PATH);
  } catch (error) {
    console.warn('focus: ачивка: ' + message(error));
    return null;
  }
}

// ---- for the screen, the voice and other modules -------------------------------------------------------

function sessionsSince(from) {
  return db.query('select id, task, startAt, endAt, plannedMin, actualMin, endedBy, blockedAttempts, messages, important, cycle, headline from sessions where startAt >= ? order by startAt desc', [from]);
}

/** Everything the screen shows: { running, session, next, today, todayText, messages, … }. */
exports.status = function () {
  var s = settings();
  var state = readState();
  var now = Date.now();
  var recent = sessionsSince(now - 400 * DAY);
  var today = history.today(recent, now);
  var ways = phone.ways();
  var out = {
    now: now,
    running: Boolean(state.id),
    session: viewOf(state, s, now),
    next: state.id ? null : state.next || null,
    today: today,
    todayText: history.todayText(today),
    tasks: history.tasks(recent, s.taskSuggestions),
    inbox: Boolean(inbox()),
    ways: ways,
    canSilence: ways.shell || ways.listener || ways.manager || (s.shizuku && ways.shizuku),
    screen: phone.screenOn(),
    notices: phone.noticesOn(),
    filter: phone.filter(),
    features: phone.features(),
    last: recent.length ? recent[0].id : null,
    settings: {
      durations: s.durations, dnd: s.dnd, block: s.block, cycles: s.cycles, showCount: s.showCount, extendMin: s.extendMin,
      earlyThreshold: s.earlyThreshold, countEverySec: s.countEverySec, distractApps: s.distractApps.length, breakMin: s.breakMin,
      workMin: s.workMin, cyclesCount: s.cyclesCount, dndMode: s.dndMode, minMinutes: s.minMinutes, maxMinutes: s.maxMinutes
    }
  };
  if (state.id && state.kind === 'work' && s.showCount) {
    var counted = countSince(state.startAt, now, s);
    out.session.messages = counted.count;
    out.session.source = counted.source;
  }
  return out;
};

/** What is left, in words, for the voice: "Фокус: ещё 18 минут · Отчёт" or that nothing runs. */
exports.left = function () {
  var state = readState();
  var now = Date.now();
  if (!state.id) return { running: false, text: 'Фокус сейчас не идёт' };
  var prefix = state.kind === 'break' ? 'Перерыв: ещё ' + timer.leftText(timer.left(state, now)) : timer.reminder(state, now);
  return { running: true, kind: state.kind, left: timer.left(state, now), text: prefix + (state.task ? ' · ' + state.task : '') + (state.pausedAt ? ' (пауза)' : '') };
};

/** One session with its summary: { session, summary, missed, digest, headline, inbox }. */
exports.summary = function (sessionId) {
  var row = sessionId ? db.query('select * from sessions where id = ?', [sessionId])[0] : db.query('select * from sessions order by startAt desc limit 1')[0];
  if (!row) return null;
  var details = {};
  try { details = row.details ? JSON.parse(row.details) : {}; } catch (error) { details = {}; }
  var blocked = {};
  try { blocked = row.blockedApps ? JSON.parse(row.blockedApps) : {}; } catch (error) { blocked = {}; }
  var apps = Object.keys(blocked).map(function (pkg) { return { package: pkg, app: phone.label(pkg) || pkg, count: blocked[pkg] }; });
  return {
    session: {
      id: row.id, task: row.task || '', startAt: row.startAt, endAt: row.endAt, plannedMin: row.plannedMin, actualMin: row.actualMin,
      endedBy: row.endedBy, endedText: history.ENDED[row.endedBy] || '', attempts: row.blockedAttempts || 0, apps: apps, cycle: row.cycle, cycles: row.cycles,
      dndOk: Boolean(row.dndOk), dndBy: row.dndBy || null, recordingId: row.recordingId || null
    },
    headline: row.headline || '',
    text: row.summary || '',
    summary: details.summary || null,
    missed: details.missed || [],
    digest: details.digest || null,
    dnd: details.dnd || null,
    watch: details.watch || 'none',
    inbox: Boolean(inbox()),
    recorder: Boolean(recorder()),
    kept: Boolean(details.summary)
  };
};

/**
 * «Надиктовать итог»: a voice note in the recorder (Диктофон) about this session — its title and
 * tags carry the session's goal, the session keeps the recording's id. → { ok, recordingId, screen }
 * or { ok: false, why }.
 */
exports.dictate = function (sessionId) {
  var rec = recorder();
  if (!rec) return { ok: false, why: 'Модуль «Диктофон» не установлен' };
  var row = sessionId ? db.query('select * from sessions where id = ?', [sessionId])[0] : db.query('select * from sessions order by startAt desc limit 1')[0];
  if (!row) return { ok: false, why: 'Такой сессии нет' };
  var task = String(row.task || '').trim();
  var status;
  try {
    var before = rec.status();
    if (before && before.recording) return { ok: false, why: 'В Диктофоне уже идёт запись', screen: RECORDER_SCREEN };
    status = rec.startRecording({
      title: 'Итог фокуса' + (task ? ': ' + task : ''),
      tags: ['фокус'].concat(task ? [task] : []),
      link: { module: 'focus', id: row.id }
    });
  } catch (error) {
    return { ok: false, why: message(error) };
  }
  var recordingId = status && status.recording && status.recording.id ? status.recording.id : null;
  if (recordingId) db.exec('update sessions set recordingId = ? where id = ?', [recordingId, row.id]);
  return { ok: true, recordingId: recordingId, screen: RECORDER_SCREEN };
};

/** What came during the session running now, or the last one: for "Что пришло, пока я работал?". */
exports.missed = function () {
  var s = settings();
  var state = readState();
  if (state.id && state.kind === 'work') {
    var now = Date.now();
    var made = gather(state, state.startAt, now, s);
    return { running: true, text: summaryLib.text('Пока идёт фокус', made, null, summaryLib.missed(state.calls)), summary: made };
  }
  var last = exports.summary(null);
  if (!last) return { running: false, text: 'Сессий фокуса ещё не было' };
  return { running: false, text: last.text || last.headline, sessionId: last.session.id };
};

/** The history: { days: bars, sessions, today, week }. */
exports.history = function () {
  var s = settings();
  var now = Date.now();
  var from = new Date(now);
  from.setHours(0, 0, 0, 0);
  from.setDate(from.getDate() - Math.max(s.historyDays, 7));
  var rows = sessionsSince(from.getTime());
  return {
    days: history.days(rows, now, s.historyDays),
    sessions: rows.slice(0, s.historyList).map(function (row) {
      return { id: row.id, task: row.task || '', startAt: row.startAt, actualMin: row.actualMin, endedBy: row.endedBy, attempts: row.blockedAttempts || 0, messages: row.messages || 0, headline: row.headline || '' };
    }),
    today: history.today(rows, now),
    week: history.week(rows, now)
  };
};

/** A draft of a reply to an important message from the summary (the inbox's drafts). */
exports.suggestReply = function (chatId) {
  var ib = inbox();
  if (!ib || typeof ib.suggest !== 'function') return { drafts: [], quick: [], why: 'Черновики есть только со Входящими' };
  return ib.suggest(chatId);
};

/** A reply from the summary: through the inbox, or through the notification itself. { ok, why }. */
exports.reply = function (item, text) {
  var value = String(text || '').trim();
  if (!value) return { ok: false, why: 'Пустой ответ' };
  var ib = inbox();
  if (ib && item && item.chatId && typeof ib.send === 'function' && item.inbox !== false) {
    var sent = ib.send(item.chatId, value, item.draftId || null);
    return sent && sent.ok ? { ok: true } : { ok: false, why: (sent && sent.why) || 'Не отправилось', gone: Boolean(sent && sent.gone) };
  }
  if (item && item.key) {
    try {
      var done = axiko.notifications.reply(item.key, value);
      return done === false ? { ok: false, why: 'Уведомление уже убрано' } : { ok: true };
    } catch (error) {
      return { ok: false, why: message(error) };
    }
  }
  return { ok: false, why: 'Ответить отсюда нельзя' };
};

/** The widget: during a session the time left; otherwise today's focus. */
exports.widget = function () {
  var state = readState();
  var now = Date.now();
  if (state.id) {
    var minutes = Math.max(0, Math.ceil(timer.left(state, now) / MINUTE));
    var what = state.kind === 'break' ? 'Перерыв' : 'Фокус';
    return { title: 'Фокус', text: what + ': осталось ' + minutes + ' мин' + (state.task && state.kind === 'work' ? ' · ' + state.task : '') + (state.pausedAt ? ' (пауза)' : ''), open: SCREEN };
  }
  var today = history.today(sessionsSince(now - 2 * DAY), now);
  return { title: 'Фокус', text: history.todayText(today), open: SCREEN };
};

// ---- settings -------------------------------------------------------------------------------------------

exports.settings = function () {
  var s = settings();
  var role = { model: '', local: false };
  try {
    var target = native('models.resolve', ROLE);
    role = { model: String(target.model || ''), local: String(target.baseUrl || '').indexOf('local:') === 0 };
  } catch (error) {
    role = { model: '', local: false, error: message(error) };
  }
  var picked = s.distractApps.map(function (pkg) { return { package: pkg, app: phone.label(pkg) || pkg }; });
  return {
    values: s, numbers: settingsLib.NUMBERS, choices: settingsLib.CHOICES, role: role, inbox: Boolean(inbox()),
    picked: picked, ways: phone.ways(), screen: phone.screenOn(), notices: phone.noticesOn(), features: phone.features()
  };
};

exports.saveSettings = function (patch) {
  var next = locked(function () {
    var saved = settingsLib.apply(axiko.files.readJson(SETTINGS_PATH, {}), patch || {});
    axiko.files.writeJson(SETTINGS_PATH, saved);
    return saved;
  });
  if (patch && patch.cleanAt) job(JOB_CLEAN, { at: next.cleanAt }, function () { require('modules/focus/main.js').clean(); });
  changed('settings');
  return next;
};

/** Apps to choose the distracting ones from. */
exports.apps = function () {
  return phone.launchable();
};

/** The system screen of access to "do not disturb"; the one of notifications; the accessibility one. */
exports.openAccess = function (which) {
  if (which === 'policy') return phone.askPolicy();
  return native('sense.open', which === 'screen' ? 'screen' : 'notices');
};

// ---- upkeep ---------------------------------------------------------------------------------------------

/** Texts of old summaries are cleared (the sessions stay: there are few of them). */
exports.clean = function () {
  var s = settings();
  db.exec('update sessions set summary = null, details = null where endAt < ? and (summary is not null or details is not null)', [Date.now() - s.summaryKeepDays * DAY]);
  return true;
};

/** Removes a session (the checks clean up with it). */
exports.forget = function (sessionId) {
  db.exec('delete from sessions where id = ?', [sessionId]);
  return true;
};

/** The voice tool lives in tools/ (that is where agents look): a stub that points here. */
function installTool() {
  var stub = TOOL_MARK + ' (modules/focus/tools/focus.js). Файл ставит сам модуль при запуске;\n' +
    '// удалите модуль — заглушка молча выключится.\n' +
    'try {\n  module.exports = require(\'modules/focus/tools/focus.js\');\n} catch (error) {\n  exports.name = null;\n}\n';
  var there = axiko.files.exists(TOOL_PATH) ? axiko.files.read(TOOL_PATH) : null;
  if (there === stub) return;
  if (there !== null && there.indexOf(TOOL_MARK) !== 0) return;   // the owner's own tool: not ours to replace
  axiko.files.write(TOOL_PATH, stub);
}

/** After a restart: a session that is over is ended, one that is not is armed again. */
function restore() {
  var s = settings();
  var state = readState();
  var what = timer.restore(state, Date.now(), s.restoreGraceSec);
  if (what === 'none') return what;
  if (what === 'timer' || what === 'restore') {
    finish(what, {});
    return what;
  }
  LIVE.memory = {};
  arm(state, s, state.test);
  return what;
}

exports.restore = restore;

/** Runs at every start of the app (module.json "autostart"): the restore, the cleaning job, the tool. */
exports.start = function () {
  var s = settings();
  try { installTool(); } catch (error) { console.warn('focus: tool: ' + message(error)); }
  job(JOB_CLEAN, { at: s.cleanAt }, function () { require('modules/focus/main.js').clean(); });
  var what = 'none';
  try {
    what = restore();
  } catch (error) {
    console.error('focus: restore: ' + message(error));
  }
  return what === 'continue' ? 'Фокус: сессия продолжается' : 'Фокус готов';
};
