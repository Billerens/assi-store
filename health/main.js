// Health and habits: sleep, steps, water, medicines and habits with chains — and the summary of
// the owner's day that the pet, achievements, life-rpg and the horoscope stand on, the hooks
// convention of the life modules (data/health/hooks.json) and the places collector.
// Engine side (Rhino). The arithmetic lives in logic/*.js (tested in node), the Android parts in
// android/*.js. The API other modules call is listed in health/README.md.
var axiko = require('lib/axiko');
var base = require('lib/base');
var T = require('./logic/time.js');
var Text = require('./logic/text.js');
var Settings = require('./logic/settings.js');
var Habits = require('./logic/habits.js');
var Meds = require('./logic/meds.js');
var Sleep = require('./logic/sleep.js');
var Screen = require('./logic/screen.js');
var Steps = require('./logic/steps.js');
var Places = require('./logic/places.js');
var Hooks = require('./logic/hooks.js');
var Summary = require('./logic/summary.js');
var Weekly = require('./logic/weekly.js');

var ID = 'health';
var DIR = 'data/health/';
var MAIN = 'modules/health/main.js';
var SCREEN = 'modules/health/ui/index.html';
var VERSION = 1; // of the cached summaries: a new version recomputes them all
var PAUSE_TITLES = { sick: 'Болею', vacation: 'В отпуске', rest: 'Перерыв' };

// One lock for the module's files, shared by every thread and by reloads of this file.
var GLOBAL = (function () { return this; })();
var LOCK = GLOBAL.__healthLock || (GLOBAL.__healthLock = new java.util.concurrent.locks.ReentrantLock());
var COLLECTING = GLOBAL.__healthCollect || (GLOBAL.__healthCollect = new java.util.concurrent.locks.ReentrantLock());

function locked(fn) {
  LOCK.lock();
  try {
    return fn();
  } finally {
    LOCK.unlock();
  }
}

function copy(target) {
  for (var i = 1; i < arguments.length; i++) {
    var source = arguments[i] || {};
    Object.keys(source).forEach(function (key) { target[key] = source[key]; });
  }
  return target;
}

function message(error) {
  return String(error && error.message ? error.message : error);
}

// ---- storage ---------------------------------------------------------------------------------

function load(name, fallback) {
  try {
    return axiko.files.readJson(DIR + name, fallback);
  } catch (error) {
    console.warn('health: не читается ' + name + ': ' + message(error));
    return fallback;
  }
}

function save(name, value, compact) {
  if (compact) axiko.files.write(DIR + name, JSON.stringify(value));
  else axiko.files.writeJson(DIR + name, value);
}

function settings() {
  return Settings.merge(load('settings.json', {}));
}

function state() {
  return load('state.json', {});
}

function setState(patch) {
  return locked(function () {
    var now = copy(state(), patch);
    save('state.json', now);
    return now;
  });
}

/** Shell changes that are there (docs/shell-changes.md): native('shell.features'). */
function features() {
  try {
    var list = native('shell.features');
    return Array.isArray(list) ? list : [];
  } catch (error) {
    return [];
  }
}

function has(feature) {
  return features().indexOf(feature) >= 0;
}

// ---- the shared base, read without limits ----------------------------------------------------

function parse(row) {
  var data = null;
  try {
    data = row.data ? JSON.parse(row.data) : null;
  } catch (error) {
    data = null;
  }
  return {
    id: row.id, kind: row.kind, at: row.at, title: row.title, amount: row.amount, unit: row.unit,
    tags: row.tags ? String(row.tags).split(',').filter(function (tag) { return tag; }) : [],
    data: data, source: row.source
  };
}

/** Records of these kinds with at in [since, until), oldest first. */
function rows(kinds, since, until) {
  var marks = kinds.map(function () { return '?'; }).join(', ');
  return axiko.db('base').query('select * from records where kind in (' + marks + ') and at >= ? and at < ? order by at asc, id asc',
    kinds.concat([Math.floor(since), Math.ceil(until)])).map(parse);
}

function countKind(kind) {
  var found = axiko.db('base').query('select count(*) as n from records where kind = ?', [kind]);
  return found.length ? Number(found[0].n) : 0;
}

// ---- habits, medicines, pauses ---------------------------------------------------------------

function loadHabits() {
  return load('habits.json', []);
}

function loadMeds() {
  return load('meds.json', []);
}

function findHabit(habits, ref) {
  var key = String(ref || '').trim().toLowerCase();
  if (!key) return null;
  var live = habits.filter(function (h) { return !h.archived; });
  return habits.filter(function (h) { return h.id === ref; })[0] ||
    live.filter(function (h) { return h.title.toLowerCase() === key; })[0] ||
    live.filter(function (h) { return h.title.toLowerCase().indexOf(key) >= 0 || key.indexOf(h.title.toLowerCase()) >= 0; })[0] || null;
}

function findMed(meds, ref) {
  var key = String(ref || '').trim().toLowerCase();
  if (!key) return null;
  var live = meds.filter(function (m) { return !m.archived; });
  return meds.filter(function (m) { return m.id === ref; })[0] ||
    live.filter(function (m) { return m.name.toLowerCase() === key; })[0] ||
    live.filter(function (m) { return m.name.toLowerCase().indexOf(key) >= 0 || key.indexOf(m.name.toLowerCase()) >= 0; })[0] || null;
}

/** { habitId: { date: true } } — every marked owner's date of every habit. */
function habitDone(s, habits) {
  var done = {};
  rows(['habit'], Date.now() - 1100 * 864e5, Date.now() + 864e5).forEach(function (record) {
    var id = Summary.habitIdOf(record, habits);
    if (!id) return;
    (done[id] || (done[id] = {}))[T.logical(record.at, s.dayEnd)] = true;
  });
  return done;
}

function pauseRecords() {
  return rows(['pause'], 0, Date.now() + 3650 * 864e5);
}

/** A function date → 'sick' | 'vacation' | 'rest' | null over the pause records. */
function pausedFn(s, list) {
  var spans = list.map(function (record) {
    var data = record.data || {};
    return { from: T.logical(record.at, s.dayEnd), until: data.until || '9999-12-31', type: data.type || 'rest', record: record };
  });
  var fn = function (date) {
    for (var i = spans.length - 1; i >= 0; i--) {
      if (date >= spans[i].from && date <= spans[i].until) return spans[i].type;
    }
    return null;
  };
  fn.spans = spans;
  return fn;
}

function placeRecords() {
  return rows(['place'], 0, Date.now() + 864e5).filter(function (record) { return record.data && record.data.id; });
}

/** What is the same for every day of a range: read once. */
function makeContext(s) {
  var habits = loadHabits();
  var places = placeRecords();
  return {
    habits: habits,
    meds: loadMeds(),
    done: habitDone(s, habits),
    pausedOn: pausedFn(s, pauseRecords()),
    homeIds: places.filter(function (p) { return p.data.type === 'home'; }).map(function (p) { return p.data.id; }),
    cells: load('cells.json', {}),
    spendKnown: axiko.files.exists('modules/spending/main.js') || countKind('expense') > 0
  };
}

// ---- the day summary ---------------------------------------------------------------------------

function dayRecords(date, s) {
  var b = T.bounds(date, s.dayEnd);
  var out = { water: [], med: [], habit: [], workout: [], visit: [], place: [], expense: [], focus: [], play: [], mood: [] };
  rows(['water', 'habit', 'workout', 'visit', 'place', 'expense', 'focus', 'play', 'mood'], b.from, b.to).forEach(function (record) {
    (out[record.kind] || (out[record.kind] = [])).push(record);
  });
  // A dose is matched by its due time, whenever it was taken.
  out.med = rows(['med'], b.from - 12 * 3600000, b.to + 12 * 3600000);
  out.sleep = rows(['sleep'], T.at(T.addDays(date, -2), '00:00'), T.at(T.addDays(date, 1), '00:00'));
  var midnight = T.at(date, '00:00');
  var near = rows(['steps', 'screen'], midnight - 3 * 3600000, midnight + 3 * 3600000);
  out.steps = near.filter(function (r) { return r.kind === 'steps'; });
  out.screen = near.filter(function (r) { return r.kind === 'screen'; });
  return out;
}

function fixesDb() {
  var db = axiko.db('health/fixes');
  db.exec('create table if not exists fixes (id integer primary key autoincrement, at integer not null, lat real, lon real, acc real, provider text)');
  db.exec('create index if not exists fixes_at on fixes (at)');
  return db;
}

function placesKnown(date, s, records) {
  if (records.visit.length) return true;
  if (!s.placesOn) return false;
  var b = T.bounds(date, s.dayEnd);
  try {
    var found = fixesDb().query('select count(*) as n from fixes where at >= ? and at < ?', [b.from, b.to]);
    return found.length > 0 && Number(found[0].n) > 0;
  } catch (error) {
    return false;
  }
}

/** Is the day within the spending module's daily budget: its own answer, or null. */
function budgetOk(date, spend) {
  if (!axiko.files.exists('modules/spending/main.js')) return null;
  try {
    var spending = require('modules/spending/main.js');
    var fn = spending.dayBudget || spending.budgetDay;
    if (typeof fn !== 'function') return null;
    var answer = fn(date);
    if (typeof answer === 'boolean') return answer;
    if (answer && typeof answer.ok === 'boolean') return answer.ok;
    var limit = typeof answer === 'number' ? answer : answer && typeof answer.limit === 'number' ? answer.limit : null;
    if (limit === null || spend === null) return null;
    return spend <= limit;
  } catch (error) {
    return null;
  }
}

function compute(date, s, ctx) {
  var records = dayRecords(date, s);
  var b = T.bounds(date, s.dayEnd);
  var newCells = 0;
  Object.keys(ctx.cells).forEach(function (cell) {
    if (ctx.cells[cell] >= b.from && ctx.cells[cell] < b.to) newCells++;
  });
  var summary = Summary.build({
    date: date, settings: s, records: records, habits: ctx.habits, meds: ctx.meds, habitDone: ctx.done,
    pausedType: ctx.pausedOn(date), pausedOn: ctx.pausedOn, homeIds: ctx.homeIds,
    placesKnown: placesKnown(date, s, records), spendKnown: ctx.spendKnown, newCells: newCells
  });
  summary.budgetOk = budgetOk(date, summary.spend);
  return summary;
}

function loadCache() {
  return load('days.json', {});
}

function invalidate(dates) {
  locked(function () {
    var cache = loadCache();
    var changed = false;
    [].concat(dates).forEach(function (date) {
      if (cache[date]) {
        delete cache[date];
        changed = true;
      }
    });
    if (changed) save('days.json', cache, true);
  });
}

function dropCache() {
  locked(function () { save('days.json', {}, true); });
}

function today(s) {
  return T.logical(Date.now(), (s || settings()).dayEnd);
}

function normalizeDate(date, s) {
  if (date === undefined || date === null || date === '' || date === 'today' || date === 'сегодня') return today(s);
  if (date === 'yesterday' || date === 'вчера') return T.addDays(today(s), -1);
  if (typeof date === 'number') return T.logical(date, s.dayEnd);
  if (!T.isDate(date)) throw new Error('Дата должна быть вида 2026-11-13');
  return String(date);
}

/** Summaries of the owner's days from `from` to `to` (dates, both included; not past today). */
exports.days = function (from, to) {
  var s = settings();
  var now = Date.now();
  var last = today(s);
  from = normalizeDate(from, s);
  to = normalizeDate(to === undefined ? from : to, s);
  if (to > last) to = last;
  if (from > to) return [];
  if (T.diffDays(from, to) > 1100) from = T.addDays(to, -1100);
  var cache = loadCache();
  var ctx = null;
  var fresh = {};
  var out = T.range(from, to).map(function (date) {
    var entry = cache[date];
    var age = T.diffDays(date, last);
    var stale = !entry || entry.v !== VERSION || (age < s.recomputeDays && now - entry.at > s.cacheSeconds * 1000);
    if (!stale) return entry.s;
    ctx = ctx || makeContext(s);
    var summary = compute(date, s, ctx);
    fresh[date] = { s: summary, at: now, v: VERSION };
    return summary;
  });
  if (Object.keys(fresh).length) {
    locked(function () {
      var saved = loadCache();
      copy(saved, fresh);
      // A year and a half of summaries is plenty; older ones are recomputed when asked.
      var keys = Object.keys(saved).sort();
      if (keys.length > 560) keys.slice(0, keys.length - 560).forEach(function (key) { delete saved[key]; });
      save('days.json', saved, true);
    });
  }
  return out;
};

/** The summary of one owner's day ('YYYY-MM-DD'; today when not given). See README for the fields. */
exports.day = function (date) {
  var s = settings();
  return exports.days(normalizeDate(date, s), normalizeDate(date, s))[0] || null;
};

/** Recomputes a day (or a range) right now, past the cache. */
exports.recompute = function (from, to) {
  var s = settings();
  from = normalizeDate(from, s);
  to = normalizeDate(to === undefined ? from : to, s);
  invalidate(T.range(from, to > today(s) ? today(s) : to));
  return exports.days(from, to);
};

function screenOn() {
  try {
    return Boolean(context.getSystemService('power').isInteractive());
  } catch (error) {
    return null;
  }
}

/** The summary "for now", for the pet: today's day plus what the moment adds. */
exports.today = function () {
  var s = settings();
  var now = Date.now();
  var date = today(s);
  var list = exports.days(T.addDays(date, -1), date);
  var out = copy({}, list[1]);
  var night = T.night(date, s.nightStart, s.nightEnd, s.dayEnd);
  out.now = now;
  out.hour = new Date(now).getHours();
  out.minute = T.minuteOfDay(now);
  out.screenOn = screenOn();
  out.night = now >= night.from && now < night.to;
  out.prevLateMin = list[0] ? list[0].lateMin : null;
  out.prevLateAfter2Min = list[0] ? list[0].lateAfter2Min : null;
  out.prevKnownScreen = list[0] ? Boolean(list[0].known.screen) : false;
  out.goals = exports.goals();
  return out;
};

/** The goals and the clock of the owner's day. */
exports.goals = function () {
  var s = settings();
  return {
    stepsGoal: s.stepsGoal, sleepGoal: s.sleepGoal, waterGoal: s.waterGoal, glassMl: s.glassMl, bedtime: s.bedtime,
    strideM: s.strideM, dayEnd: s.dayEnd, nightStart: s.nightStart, nightEnd: s.nightEnd, lateAfter: s.lateAfter
  };
};

/** 'sick' | 'vacation' | 'rest' | null for a date (today when not given). */
exports.paused = function (date) {
  var s = settings();
  return pausedFn(s, pauseRecords())(normalizeDate(date, s));
};

/** The pauses: [{ id, type, title, from, until }], newest last. */
exports.pauses = function () {
  var s = settings();
  return pausedFn(s, pauseRecords()).spans.map(function (span) {
    return { id: span.record.id, type: span.type, title: span.record.title, from: span.from, until: span.until === '9999-12-31' ? null : span.until };
  });
};

/** Days in a row of a habit (by id or title) as of a date (today when not given). */
exports.chain = function (habitId, date) {
  var s = settings();
  var habits = loadHabits();
  var habit = findHabit(habits, habitId);
  if (!habit) return 0;
  var done = habitDone(s, habits)[habit.id] || {};
  return Habits.chain(habit, done, pausedFn(s, pauseRecords()), normalizeDate(date, s), s.freezesPerWeek);
};

/** Map cells (geohash) seen by the places collector: { cell: first seen, ms }. */
exports.cells = function () {
  return load('cells.json', {});
};

// ---- hooks: data/health/hooks.json ---------------------------------------------------------------

// The file is a list; a module that wrapped it as { hooks: [...] } is read the same way.
function hookList() {
  var value = load('hooks.json', []);
  if (Array.isArray(value)) return value;
  return value && Array.isArray(value.hooks) ? value.hooks : [];
}

exports.hooks = function () {
  return hookList();
};

/** Adds a hook: hook('life.day', 'modules/pet/main.js', 'onDay'). Repeating it changes nothing. */
exports.hook = function (event, path, fn, order) {
  if (Hooks.EVENTS.indexOf(event) < 0 && String(event).indexOf('check.') !== 0) throw new Error('Нет такого события: ' + event);
  return locked(function () {
    var list = Hooks.add(hookList(), { event: event, path: path, fn: fn, order: typeof order === 'number' ? order : undefined });
    save('hooks.json', list);
    return list;
  });
};

/** Removes the hooks of a module (only of that event and function, when given). */
exports.unhook = function (path, event, fn) {
  return locked(function () {
    var list = Hooks.remove(hookList(), path, event, fn);
    save('hooks.json', list);
    return list;
  });
};

/** Calls the hooks of an event in order; one that fails does not stop the others. */
exports.fire = function (event, arg) {
  var list = Hooks.ordered(hookList(), event);
  return list.map(function (entry) {
    if (!axiko.files.exists(entry.path)) return { path: entry.path, fn: entry.fn, ok: false, error: 'модуля нет' };
    try {
      var module = require(entry.path);
      if (typeof module[entry.fn] !== 'function') throw new Error('нет функции ' + entry.fn);
      module[entry.fn](arg);
      return { path: entry.path, fn: entry.fn, ok: true };
    } catch (error) {
      console.error('health: крючок ' + event + ' → ' + entry.path + '.' + entry.fn + ': ' + message(error));
      return { path: entry.path, fn: entry.fn, ok: false, error: message(error) };
    }
  });
};

var probes = [];
/** For checks.js: a hook target that remembers what it got. */
exports._probe = function (arg) {
  probes.push(arg);
};
exports._probes = function (clear) {
  var out = probes.slice();
  if (clear) probes = [];
  return out;
};

// ---- marks: water, habits, medicines, mood, workouts, sleep --------------------------------------

// Checks mark things too: while quiet, the other modules do not hear about it.
var quiet = false;
exports._quiet = function (on) {
  quiet = Boolean(on);
};

function changed(payload, fireHooks) {
  var s = settings();
  if (quiet) fireHooks = false;
  var dates = [T.logical(payload.at || Date.now(), s.dayEnd)];
  if (payload.due) dates.push(T.logical(payload.due, s.dayEnd));
  if (payload.night) dates.push(payload.night);
  invalidate(dates);
  try { emit('health.changed', payload); } catch (error) { /* no screens */ }
  if (fireHooks) {
    try { emit('life.mark', payload); } catch (error) { /* no screens */ }
  }
  spawn(function () {
    if (fireHooks) exports.fire('life.mark', payload);
    try { axiko.widget.refresh(ID); } catch (error) { /* no widget */ }
  });
}

/** A glass of water (ml; a glass from the settings when not given). */
exports.addWater = function (ml, at) {
  var s = settings();
  var amount = Math.round(Number(ml) || s.glassMl);
  if (amount <= 0 || amount > 5000) throw new Error('Столько воды за раз не записываю: ' + amount + ' мл');
  var when = Number(at) || Date.now();
  var id = base.add({ kind: 'water', at: when, amount: amount, unit: 'ml', title: 'Вода', source: ID });
  changed({ type: 'water', id: id, amount: amount, at: when }, true);
  if (s.waterToHc) {
    // So that Samsung Health sees it too; a failure here does not undo the glass.
    spawn(function () {
      try {
        var H = require('./android/hc.js');
        if (!H.granted('hydration')) return;
        var hcId = H.writeWater(when, amount, s.hcTimeoutMs);
        if (hcId && base.get(id)) base.update(id, { data: { hcId: hcId } });
      } catch (error) {
        console.warn('health: вода в Health Connect: ' + message(error));
      }
    });
  }
  return { id: id, amount: amount, waterMl: exports.day(T.logical(when, s.dayEnd)).waterMl };
};

/** Takes back the latest water of today. */
exports.undoWater = function () {
  var s = settings();
  var b = T.bounds(today(s), s.dayEnd);
  var list = rows(['water'], b.from, b.to);
  var last = list[list.length - 1];
  if (!last) return { waterMl: 0 };
  base.remove(last.id);
  if (last.data && last.data.hcId) {
    spawn(function () {
      try {
        require('./android/hc.js').deleteWater(last.data.hcId, s.hcTimeoutMs);
      } catch (error) {
        console.warn('health: вода из Health Connect: ' + message(error));
      }
    });
  }
  changed({ type: 'water-undo', id: last.id, at: last.at }, false);
  return { removed: last.id, waterMl: exports.day(today(s)).waterMl };
};

/** Marks a habit (by id or title) for its owner's day. Once a day: a second mark changes nothing. */
exports.markHabit = function (ref, value, at) {
  var s = settings();
  var habits = loadHabits();
  var habit = findHabit(habits, ref);
  if (!habit) throw new Error('Нет привычки «' + ref + '». Есть: ' + habits.filter(function (h) { return !h.archived; }).map(function (h) { return h.title; }).join(', '));
  var when = Number(at) || Date.now();
  var date = T.logical(when, s.dayEnd);
  var b = T.bounds(date, s.dayEnd);
  var already = rows(['habit'], b.from, b.to).filter(function (r) { return Summary.habitIdOf(r, habits) === habit.id; })[0];
  if (already) return { id: already.id, already: true, title: habit.title, chain: exports.chain(habit.id, date) };
  var amount = value === undefined || value === null || value === '' ? null : Number(value);
  var id = base.add({
    kind: 'habit', at: when, title: habit.title, tags: [habit.id],
    amount: amount, unit: amount !== null && habit.measure ? habit.measure.unit : null,
    data: { habitId: habit.id, value: amount }, source: ID
  });
  changed({ type: 'habit', id: id, habitId: habit.id, title: habit.title, value: amount, at: when }, true);
  return { id: id, title: habit.title, chain: exports.chain(habit.id, date) };
};

/** Takes a habit's mark of a day back (today when no date). */
exports.unmarkHabit = function (ref, date) {
  var s = settings();
  var habits = loadHabits();
  var habit = findHabit(habits, ref);
  if (!habit) throw new Error('Нет привычки «' + ref + '»');
  date = normalizeDate(date, s);
  var b = T.bounds(date, s.dayEnd);
  var gone = rows(['habit'], b.from, b.to).filter(function (r) { return Summary.habitIdOf(r, habits) === habit.id; });
  gone.forEach(function (r) { base.remove(r.id); });
  changed({ type: 'habit-undo', habitId: habit.id, at: b.from + 3600000 }, false);
  return { removed: gone.length, chain: exports.chain(habit.id, date) };
};

function doseRecords(medId, due) {
  return rows(['med'], due - 3 * 864e5, due + 3 * 864e5).filter(function (r) {
    return r.data && r.data.medId === medId && Number(r.data.due) === Number(due);
  });
}

function notifyKey(medId, due) {
  return 'health-med-' + medId + '-' + due;
}

function notifyNumber(text) {
  var hash = 0;
  for (var i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) % 1000000007;
  return 100000 + hash % 900000000;
}

function cancelNotice(medId, due) {
  try {
    if (has('notify.actions')) native('notify.cancel', notifyKey(medId, due));
    else context.getSystemService('notification').cancel(notifyNumber(notifyKey(medId, due)));
  } catch (error) { /* already gone */ }
}

/** The dose of a medicine the owner most likely means now: the earliest open one of today. */
function nearestDue(med, s) {
  var date = today(s);
  var doses = Meds.withStatus(Meds.doses([med], date, s.dayEnd), rows(['med'], Date.now() - 3 * 864e5, Date.now() + 864e5));
  var open = doses.filter(function (d) { return !d.status; });
  var now = Date.now();
  var soon = open.filter(function (d) { return d.due <= now + 3 * 3600000; });
  if (soon.length) return soon[0].due;
  if (open.length) return open[0].due;
  return doses.length ? doses[doses.length - 1].due : now;
}

/**
 * Marks a dose: medTaken(medId or name, due ms (the nearest open dose when not given),
 * 'taken' | 'skipped'). Taken later than medLateMin after due becomes 'late'.
 */
exports.medTaken = function (ref, due, status) {
  var s = settings();
  var med = findMed(loadMeds(), ref);
  if (!med) throw new Error('Нет лекарства «' + ref + '»');
  due = Number(due) || nearestDue(med, s);
  var now = Date.now();
  var mark = status === 'skipped' ? 'skipped' : Meds.statusFor(now, due, s.medLateMin);
  doseRecords(med.id, due).forEach(function (r) { base.remove(r.id); });
  var id = base.add({ kind: 'med', at: now, title: med.name, data: { medId: med.id, due: due, status: mark }, source: ID });
  cancelNotice(med.id, due);
  changed({ type: 'med', id: id, medId: med.id, title: med.name, status: mark, due: due, at: now }, true);
  return { id: id, name: med.name, status: mark, time: T.clock(due), due: due };
};

/** The notification's buttons call this: { id, due, status }. */
exports.medAction = function (args) {
  args = args || {};
  return exports.medTaken(args.id, args.due, args.status);
};

/** Takes a dose's mark back. */
exports.medUndo = function (medId, due) {
  var gone = doseRecords(medId, Number(due));
  gone.forEach(function (r) { base.remove(r.id); });
  changed({ type: 'med-undo', medId: medId, due: Number(due), at: Number(due) }, false);
  return { removed: gone.length };
};

/** How the owner feels, 1–5. */
exports.setMood = function (value, at) {
  var n = Math.round(Number(value));
  if (!(n >= 1 && n <= 5)) throw new Error('Самочувствие — число от 1 до 5');
  var when = Number(at) || Date.now();
  var id = base.add({ kind: 'mood', at: when, amount: n, title: 'Самочувствие', source: ID });
  changed({ type: 'mood', id: id, amount: n, at: when }, true);
  return { id: id, mood: n };
};

/** A workout by hand: { minutes, type, at }. */
exports.addWorkout = function (args) {
  args = args || {};
  var minutes = Math.round(Number(args.minutes));
  if (!(minutes > 0 && minutes < 1440)) throw new Error('Сколько минут длилась тренировка?');
  var when = Number(args.at) || Date.now() - minutes * 60000;
  var type = String(args.type || 'тренировка');
  var id = base.add({ kind: 'workout', at: when, amount: minutes, unit: 'min', title: type, data: { type: type, from: 'manual', end: when + minutes * 60000 }, source: ID });
  changed({ type: 'workout', id: id, amount: minutes, title: type, at: when }, true);
  return { id: id, minutes: minutes };
};

/** One sleep record a night: a better source replaces a worse one, never the other way round. */
function upsertSleep(night, info) {
  return locked(function () {
    var list = rows(['sleep'], T.at(T.addDays(night, -2), '00:00'), T.at(T.addDays(night, 1), '00:00'))
      .filter(function (r) { return r.data && r.data.night === night; });
    var record = {
      kind: 'sleep', at: info.start, amount: info.minutes, unit: 'min', title: 'Сон', source: ID,
      data: {
        night: night, end: info.end, bedtime: T.clock(info.start), wake: T.clock(info.end), wakes: info.wakes || 0,
        quality: typeof info.quality === 'number' ? info.quality : null, from: info.from,
        confidence: info.confidence, hcId: info.hcId || null
      }
    };
    if (info.story) record.data.story = true;   // the start is the moment of falling asleep under the series
    if (!list.length) return { id: base.add(record), written: true };
    var keep = list[list.length - 1];
    list.slice(0, -1).forEach(function (r) { base.remove(r.id); });
    var was = keep.data || {};
    if (Sleep.rank(was.from) > Sleep.rank(info.from)) return { id: keep.id, written: false };
    if (was.from === info.from && keep.amount === info.minutes && keep.at === info.start && was.end === info.end) return { id: keep.id, written: false };
    base.update(keep.id, record);
    return { id: keep.id, written: true };
  });
}

/**
 * Corrects the sleep by hand: { night: 'YYYY-MM-DD' (the morning; today when not given),
 * bed: 'HH:MM', wake: 'HH:MM' }. A manual correction outranks every other source.
 */
exports.setSleep = function (args) {
  args = args || {};
  var night = args.night && T.isDate(args.night) ? args.night : T.ymd(Date.now());
  if (!T.normalizeTime(args.bed) || !T.normalizeTime(args.wake)) throw new Error('Нужно время отбоя и подъёма, например 01:00 и 08:00');
  var m = Sleep.manual(night, T.normalizeTime(args.bed), T.normalizeTime(args.wake), T.at);
  var saved = upsertSleep(night, { start: m.start, end: m.end, minutes: m.minutes, wakes: 0, from: 'manual', confidence: 1 });
  changed({ type: 'sleep', id: saved.id, night: night, minutes: m.minutes, at: m.end }, true);
  return { id: saved.id, night: night, minutes: m.minutes, bedtime: T.clock(m.start), wake: T.clock(m.end) };
};

/** Removes the manual correction of a night: the screen or Health Connect speak again at the next collect. */
exports.clearManualSleep = function (night) {
  var list = rows(['sleep'], T.at(T.addDays(night, -2), '00:00'), T.at(T.addDays(night, 1), '00:00'))
    .filter(function (r) { return r.data && r.data.night === night && r.data.from === 'manual'; });
  list.forEach(function (r) { base.remove(r.id); });
  changed({ type: 'sleep-undo', night: night, at: T.at(night, '08:00') }, false);
  return { removed: list.length };
};

// ---- pause -------------------------------------------------------------------------------------

/**
 * A pause for every life module: { type: 'sick' | 'vacation' | 'rest', until: 'YYYY-MM-DD' (the
 * last day, included; open-ended when not given), title }.
 */
exports.pause = function (args) {
  args = args || {};
  var s = settings();
  var type = PAUSE_TITLES[args.type] ? args.type : 'rest';
  var until = args.until && T.isDate(args.until) ? args.until : null;
  var date = today(s);
  if (until && until < date) throw new Error('Пауза не может закончиться раньше сегодняшнего дня');
  exports.unpause(true);
  var id = base.add({ kind: 'pause', at: Date.now(), title: String(args.title || PAUSE_TITLES[type]), data: { type: type, until: until }, source: ID });
  dropCache();
  changed({ type: 'pause', id: id, pause: type, until: until, at: Date.now() }, true);
  return { id: id, type: type, until: until };
};

/** Ends the pause that is on now. */
exports.unpause = function (quiet) {
  var s = settings();
  var date = today(s);
  var fn = pausedFn(s, pauseRecords());
  var ended = 0;
  fn.spans.forEach(function (span) {
    if (!(date >= span.from && date <= span.until)) return;
    if (span.from === date) base.remove(span.record.id);
    else base.update(span.record.id, { data: copy({}, span.record.data, { until: T.addDays(date, -1) }) });
    ended++;
  });
  if (ended) {
    // Quiet (checks) only keeps the other modules out of it; the summaries are recounted anyway.
    dropCache();
    if (quiet !== true) changed({ type: 'unpause', at: Date.now() }, true);
  }
  return { ended: ended };
};

// ---- habits and medicines: the lists ---------------------------------------------------------

exports.habits = function () {
  return loadHabits();
};

exports.saveHabit = function (input) {
  var habit = Habits.clean(input || {}, Date.now());
  var s = settings();
  locked(function () {
    var list = loadHabits();
    var at = -1;
    list.forEach(function (h, i) { if (h.id === habit.id) at = i; });
    if (at >= 0) {
      habit.created = list[at].created || habit.created;
      list[at] = habit;
    } else {
      // The habit exists from the owner's day it was made on (at 01:00 that is still yesterday).
      habit.created = input && T.isDate(input.created) ? input.created : today(s);
      list.push(habit);
    }
    save('habits.json', list);
  });
  dropCache();
  arm();
  emit('health.changed', { type: 'habits' });
  return habit;
};

exports.archiveHabit = function (id, archived) {
  var list = loadHabits();
  var habit = list.filter(function (h) { return h.id === id; })[0];
  if (!habit) throw new Error('Нет привычки ' + id);
  habit.archived = archived !== false;
  return exports.saveHabit(habit);
};

/** Removes a habit from the list; its marks stay in the base (they are facts of the owner's life). */
exports.removeHabit = function (id) {
  locked(function () { save('habits.json', loadHabits().filter(function (h) { return h.id !== id; })); });
  dropCache();
  arm();
  emit('health.changed', { type: 'habits' });
  return true;
};

exports.meds = function () {
  return loadMeds();
};

exports.saveMed = function (input) {
  var med = Meds.clean(input || {}, Date.now());
  var s = settings();
  locked(function () {
    var list = loadMeds();
    var at = -1;
    list.forEach(function (m, i) { if (m.id === med.id) at = i; });
    // A course without a start begins on the day it was added: no "missed" doses before it.
    med.added = at >= 0 && list[at].added ? list[at].added : today(s);
    if (!med.from) med.from = med.added;
    if (at >= 0) list[at] = med;
    else list.push(med);
    save('meds.json', list);
  });
  dropCache();
  arm();
  emit('health.changed', { type: 'meds' });
  return med;
};

exports.removeMed = function (id) {
  locked(function () { save('meds.json', loadMeds().filter(function (m) { return m.id !== id; })); });
  dropCache();
  arm();
  emit('health.changed', { type: 'meds' });
  return true;
};

/** Today's doses with their status. */
exports.medsToday = function () {
  var s = settings();
  var date = today(s);
  var b = T.bounds(date, s.dayEnd);
  return Meds.withStatus(Meds.doses(loadMeds(), date, s.dayEnd), rows(['med'], b.from - 12 * 3600000, b.to + 12 * 3600000));
};

// ---- settings ------------------------------------------------------------------------------------

exports.settings = settings;

exports.settingsSchema = function () {
  return Settings.SCHEMA;
};

exports.setSettings = function (patch) {
  var clean = Settings.clean(patch || {});
  locked(function () {
    var saved = load('settings.json', {});
    copy(saved, clean);
    save('settings.json', saved);
  });
  dropCache();
  arm();
  emit('health.changed', { type: 'settings' });
  return settings();
};

// ---- collecting: Health Connect, the step sensor, screen time, sleep ------------------------------

function trimDays(map, keepDays) {
  var keep = T.addDays(T.ymd(Date.now()), -keepDays);
  Object.keys(map).forEach(function (date) { if (date < keep) delete map[date]; });
  return map;
}

function collectHc(s, now) {
  var H = require('./android/hc.js');
  if (!H.available()) return 'нет Health Connect';
  var out = {};
  if (s.stepsSource !== 'sensor' && H.granted('steps')) {
    var groups = H.stepsByHour(T.at(T.addDays(T.ymd(now), -1), '00:00'), now, s.hcTimeoutMs);
    var days = {};
    groups.forEach(function (g) {
      var date = T.ymd(g.start);
      var hours = days[date] || (days[date] = Steps.zeros(24));
      hours[new Date(g.start).getHours()] += g.steps;
    });
    locked(function () {
      var stored = load('hc-steps.json', {});
      copy(stored, days);
      save('hc-steps.json', trimDays(stored, 14), true);
    });
    out.steps = Object.keys(days).map(function (d) { return d + ': ' + Steps.total(days[d]); }).join(', ');
  }
  if (s.workoutsFromHc && H.granted('exercise')) {
    var since = now - s.hcBackHours * 3600000;
    var known = {};
    rows(['workout'], since - 864e5, now + 864e5).forEach(function (r) { if (r.data && r.data.hcId) known[r.data.hcId] = true; });
    var added = 0;
    H.exercises(since, now, s.hcTimeoutMs).forEach(function (w) {
      if (known[w.id] || !(w.end > w.start)) return;
      var minutes = Math.round((w.end - w.start) / 60000);
      var type = w.title || H.typeName(w.type);
      base.add({ kind: 'workout', at: w.start, amount: minutes, unit: 'min', title: type, data: { type: H.typeName(w.type), from: 'hc', hcId: w.id, end: w.end }, source: ID });
      added++;
    });
    out.workouts = added;
  }
  return out;
}

function collectSensor(s, now) {
  if (s.stepsSource === 'hc') return 'выключен в настройках';
  var Sn = require('./android/sensor.js');
  if (!Sn.present()) return 'нет датчика шагов';
  if (!Sn.granted()) return 'нет разрешения на физическую активность';
  var value = Sn.read(s.sensorWaitMs);
  if (value === null) return 'датчик не ответил';
  var reading = { value: value, boot: Sn.boot(), at: now };
  return locked(function () {
    var prev = load('sensor.json', null);
    var delta = Steps.delta(prev, reading);
    save('sensor.json', reading);
    if (delta > 0) {
      var days = load('sensor-days.json', {});
      Steps.addParts(days, Steps.spread(delta, prev && prev.at, now, s.sensorSpreadHours));
      save('sensor-days.json', trimDays(days, 14), true);
    }
    return delta;
  });
}

function upsertSteps(date, pick) {
  var midnight = T.at(date, '00:00');
  var list = rows(['steps'], midnight - 3 * 3600000, midnight + 3 * 3600000).filter(function (r) { return r.data && r.data.day === date; });
  var amount = Steps.total(pick.hours);
  var record = { kind: 'steps', at: midnight, amount: amount, unit: 'steps', title: 'Шаги', data: { day: date, from: pick.from, hours: pick.hours }, source: ID };
  if (!list.length) return base.add(record);
  list.slice(1).forEach(function (r) { base.remove(r.id); });
  if (list[0].amount === amount && list[0].data && list[0].data.from === pick.from) return list[0].id;
  base.update(list[0].id, record);
  return list[0].id;
}

function writeSteps(s, dates) {
  var hcDays = load('hc-steps.json', {});
  var sensorDays = load('sensor-days.json', {});
  var out = {};
  dates.forEach(function (date) {
    var pick = Steps.pick(hcDays[date], sensorDays[date], s.stepsSource, s.stepsPriority);
    if (!pick) return;
    upsertSteps(date, pick);
    out[date] = Steps.total(pick.hours) + ' (' + pick.from + ')';
  });
  return out;
}

/** The screen's own log kept from on('screen'): [[ms, 'on' | 'off' | 'unlocked'], …]. */
function onScreen(event) {
  try {
    var s = settings();
    var now = Date.now();
    locked(function () {
      var log = load('screenlog.json', []);
      log.push([now, String(event && event.state)]);
      var keep = now - s.screenLogDays * 864e5;
      save('screenlog.json', log.filter(function (item) { return item[0] >= keep; }), true);
    });
    if (!state().logSince) setState({ logSince: now });
  } catch (error) {
    console.error('health: журнал экрана: ' + message(error));
  }
}

/** Screen events from usage statistics, or from the module's own log. */
function screenEvents(since, until) {
  var U = require('./android/usage.js');
  if (U.access()) return { events: U.events(since, until), apps: true, coverage: 0 };
  var log = load('screenlog.json', []);
  return {
    events: Screen.fromLog(log).filter(function (e) { return e.time >= since && e.time < until; }),
    apps: false,
    coverage: state().logSince || null
  };
}

function socialSet(s) {
  var U = require('./android/usage.js');
  var set = U.socialPackages();
  (s.socialAdd || []).forEach(function (pkg) { set[pkg] = true; });
  (s.socialRemove || []).forEach(function (pkg) { delete set[pkg]; });
  return set;
}

function collectScreen(s, now, date) {
  date = date || T.logical(now, s.dayEnd);
  var b = T.bounds(date, s.dayEnd);
  var src = screenEvents(b.from - 6 * 3600000, Math.min(b.to, now));
  if (!src.apps && !(src.coverage && src.coverage <= b.from)) return 'нет доступа к статистике, а свой журнал ещё не покрыл сутки';
  var agg = Screen.aggregate(src.events, {
    from: b.from, to: b.to, now: now,
    night: T.night(date, s.nightStart, s.nightEnd, s.dayEnd),
    after: T.inDay(date, s.lateAfter, s.dayEnd),
    social: src.apps ? socialSet(s) : {}, appsTop: s.appsTop, withApps: src.apps
  });
  var midnight = T.at(date, '00:00');
  var record = {
    kind: 'screen', at: midnight, amount: agg.minutes, unit: 'min', title: 'Экран', source: ID,
    data: {
      day: date, unlocks: agg.unlocks, social: agg.social, late: agg.late, lateAfter2: agg.lateAfter2,
      first: agg.first ? T.clock(agg.first) : null, last: agg.last ? T.clock(agg.last) : null,
      apps: agg.apps, launches: agg.launches, from: src.apps ? 'usage' : 'log'
    }
  };
  locked(function () {
    var list = rows(['screen'], midnight - 3 * 3600000, midnight + 3 * 3600000).filter(function (r) { return r.data && r.data.day === date; });
    if (!list.length) base.add(record);
    else {
      list.slice(1).forEach(function (r) { base.remove(r.id); });
      base.update(list[0].id, record);
    }
  });
  return agg.minutes + ' мин, разблокировок ' + agg.unlocks;
}

function collectSleep(s, now) {
  var night = T.ymd(now);
  var winFrom = T.at(T.addDays(night, -1), s.sleepWindowStart);
  var winTo = T.at(night, s.sleepWindowEnd);
  if (now <= winFrom) return 'ещё рано';
  var H = require('./android/hc.js');
  if (s.sleepFromHc && H.available() && H.granted('sleep')) {
    try {
      var sessions = H.sleep(winFrom - 6 * 3600000, Math.min(winTo, now), s.hcTimeoutMs)
        .filter(function (x) { return x.end > winFrom && x.end <= winTo + 6 * 3600000; });
      var longest = null;
      sessions.forEach(function (x) { if (!longest || x.end - x.start > longest.end - longest.start) longest = x; });
      if (longest) {
        var made = Sleep.fromSession(longest);
        upsertSleep(night, { start: made.start, end: made.end, minutes: made.minutes, wakes: made.wakes, quality: made.quality, from: 'hc', confidence: 0.9, hcId: longest.id });
        return 'Health Connect: ' + made.minutes + ' мин';
      }
    } catch (error) {
      console.warn('health: сон из Health Connect: ' + message(error));
    }
  }
  var until = Math.min(winTo, now);
  var src = screenEvents(winFrom - 6 * 3600000, until);
  if (!src.apps && !(src.coverage && src.coverage <= winFrom)) return 'мало данных об экране';
  var screenOnly = src.events.filter(function (e) { return e.type === 'screen-on' || e.type === 'screen-off' || e.type === 'unlock'; });
  var found = Sleep.detect(Sleep.onIntervals(screenOnly, winFrom, until), winFrom, winTo, now, { minGap: s.sleepMinGap, glue: s.sleepGlue });
  if (!found) return 'сон не найден';
  if (found.ongoing) return 'ещё спит';
  // «Сериал на ночь» knows when the owner fell asleep under it (kind 'story', data.asleep): the start moves there.
  if (s.sleepFromStory) found = Sleep.storyHint(found, rows(['story'], found.start, found.end), s.storyShiftMax);
  upsertSleep(night, { start: found.start, end: found.end, minutes: found.minutes, wakes: found.wakes, from: 'screen', confidence: found.confidence, story: !!found.story });
  return 'по экрану' + (found.story ? ' и сериалу' : '') + ': ' + found.minutes + ' мин';
}

/** One round of collecting: Health Connect, the step sensor, screen time, sleep. */
exports.collect = function () {
  if (!COLLECTING.tryLock()) return { busy: true };
  try {
    var s = settings();
    var now = Date.now();
    var report = {};
    var step = function (name, fn) {
      try {
        report[name] = fn();
      } catch (error) {
        report[name] = 'ошибка: ' + message(error);
        console.error('health: сбор ' + name + ': ' + message(error));
      }
    };
    step('hc', function () { return collectHc(s, now); });
    step('sensor', function () { return collectSensor(s, now); });
    step('steps', function () { return writeSteps(s, [T.addDays(T.ymd(now), -1), T.ymd(now)]); });
    step('screen', function () { return collectScreen(s, now); });
    step('sleep', function () { return collectSleep(s, now); });
    setState({ lastCollect: now, lastReport: report });
    invalidate([today(s), T.addDays(today(s), -1)]);
    try { emit('health.changed', { type: 'collect' }); } catch (error) { /* no screens */ }
    try { axiko.widget.refresh(ID); } catch (error) { /* no widget */ }
    return report;
  } finally {
    COLLECTING.unlock();
  }
};

// ---- places ------------------------------------------------------------------------------------

function visitMinutes(cluster) {
  return Math.max(0, Math.round((cluster.last - cluster.start) / 60000));
}

function startVisit(cluster, s) {
  var L = require('./android/location.js');
  var places = placeRecords();
  var match = Places.match(places.map(function (p) {
    return { id: p.data.id, lat: p.data.lat, lon: p.data.lon, radius: p.data.radius };
  }), cluster.lat, cluster.lon, s.placeRadius);
  var cell = Places.geohash(cluster.lat, cluster.lon, s.geohashPrecision);
  var place;
  var firstTime = false;
  if (match) {
    place = places.filter(function (p) { return p.data.id === match.id; })[0];
    base.update(place.id, { data: copy({}, place.data, { visits: (place.data.visits || 0) + 1 }) });
  } else {
    var placeId = 'p' + Number(cluster.start).toString(36);
    var title = L.name(cluster.lat, cluster.lon) || 'Место № ' + (places.length + 1);
    var data = { id: placeId, lat: cluster.lat, lon: cluster.lon, radius: s.placeRadius, type: 'other', cell: cell, visits: 1 };
    var recordId = base.add({ kind: 'place', at: cluster.start, title: title, data: data, source: ID });
    place = { id: recordId, title: title, data: data };
    firstTime = true;
  }
  var home = places.filter(function (p) { return p.data.type === 'home'; })[0];
  var distanceKm = home ? Math.round(Places.distance(home.data.lat, home.data.lon, cluster.lat, cluster.lon) * 10) / 10 : null;
  cluster.baseId = base.add({
    kind: 'visit', at: cluster.start, amount: visitMinutes(cluster), unit: 'min', title: place.title, source: ID,
    data: { place: place.data.id, end: cluster.last, firstTime: firstTime, cell: cell, distanceKm: distanceKm }
  });
  cluster.place = place.data.id;
  invalidate([T.logical(cluster.start, s.dayEnd)]);
  if (firstTime) {
    var info = { id: place.data.id, title: place.title, type: 'other', cell: cell, at: cluster.start };
    try { emit('life.place', info); } catch (error) { /* no screens */ }
    spawn(function () { exports.fire('life.place', info); });
  }
}

function extendVisit(cluster, s) {
  var found = base.get(cluster.baseId);
  if (!found) return;
  base.update(cluster.baseId, { amount: visitMinutes(cluster), data: copy({}, found.data, { end: cluster.last }) });
  invalidate([T.logical(cluster.start, s.dayEnd)]);
}

/** One location fix into the places collector (the job 'health:places' calls it). */
exports.collectPlace = function () {
  var s = settings();
  if (!s.placesOn) return 'сбор мест выключен';
  var L = require('./android/location.js');
  if (!L.granted()) return 'нет разрешения на местоположение';
  var fix = L.current('network', s.placeTimeoutMs);
  if ((!fix || fix.acc > s.gpsIfWorse) && s.useGps) {
    var gps = L.current('gps', s.placeTimeoutMs);
    if (gps && (!fix || gps.acc < fix.acc)) fix = gps;
  }
  if (!fix) return 'нет точки';
  var now = Date.now();
  fix.at = now;
  return locked(function () {
    fixesDb().exec('insert into fixes (at, lat, lon, acc, provider) values (?, ?, ?, ?, ?)', [now, fix.lat, fix.lon, fix.acc, fix.provider]);
    var cell = Places.geohash(fix.lat, fix.lon, s.geohashPrecision);
    var cells = load('cells.json', {});
    var newCell = !cells[cell];
    if (newCell) {
      cells[cell] = now;
      save('cells.json', cells, true);
      invalidate([T.logical(now, s.dayEnd)]);
    }
    var track = load('track.json', { cluster: null });
    var step = Places.track(track.cluster, fix, { radius: s.placeRadius, minStay: s.placeMinStay });
    if (step.closed && step.closed.baseId) extendVisit(step.closed, s);
    if (step.cluster.visit && !step.cluster.baseId) startVisit(step.cluster, s);
    else if (step.cluster.baseId) extendVisit(step.cluster, s);
    save('track.json', { cluster: step.cluster });
    return { acc: Math.round(fix.acc), provider: fix.provider, newCell: newCell, visit: Boolean(step.cluster.visit) };
  });
};

/** The places for the screen: names, types, visits — no coordinates. */
exports.places = function () {
  var visits = {};
  rows(['visit'], Date.now() - 400 * 864e5, Date.now() + 864e5).forEach(function (v) {
    var id = v.data && v.data.place;
    if (!id) return;
    var item = visits[id] || (visits[id] = { count: 0, last: 0, minutes: 0 });
    item.count++;
    item.last = Math.max(item.last, v.at);
    item.minutes += Number(v.amount) || 0;
  });
  return placeRecords().map(function (p) {
    var v = visits[p.data.id] || { count: 0, last: p.at, minutes: 0 };
    return {
      id: p.data.id, title: p.title, type: p.data.type || 'other', confirmed: Boolean(p.data.confirmed),
      suggested: Boolean(p.data.suggested), visits: v.count, minutes: Math.round(v.minutes), last: v.last, first: p.at
    };
  }).sort(function (a, b) { return b.last - a.last; });
};

function placeById(placeId) {
  return placeRecords().filter(function (p) { return p.data.id === placeId; })[0];
}

exports.renamePlace = function (placeId, title) {
  var place = placeById(placeId);
  var name = String(title || '').trim();
  if (!place || !name) throw new Error('Нет такого места или пустое имя');
  base.update(place.id, { title: name });
  emit('health.changed', { type: 'places' });
  return true;
};

/** The owner says what a place is: 'home' | 'work' | 'other'. There is one home and one work. */
exports.setPlaceType = function (placeId, type) {
  if (['home', 'work', 'other'].indexOf(type) < 0) throw new Error('Тип места: home, work или other');
  placeRecords().forEach(function (p) {
    if (p.data.id === placeId) base.update(p.id, { data: copy({}, p.data, { type: type, confirmed: true, suggested: false }) });
    else if (type !== 'other' && p.data.type === type) base.update(p.id, { data: copy({}, p.data, { type: 'other', confirmed: Boolean(p.data.confirmed), suggested: false }) });
  });
  dropCache();
  emit('health.changed', { type: 'places' });
  return true;
};

function guessHomeWork(s) {
  var now = Date.now();
  var visits = rows(['visit'], now - s.homeWorkDays * 864e5, now + 1).map(function (v) {
    return { place: v.data && v.data.place, start: v.at, end: (v.data && v.data.end) || v.at + (Number(v.amount) || 0) * 60000 };
  });
  var guess = Places.guess(visits);
  var places = placeRecords();
  var confirmed = {};
  places.forEach(function (p) { if (p.data.confirmed && p.data.type !== 'other') confirmed[p.data.type] = true; });
  places.forEach(function (p) {
    if (p.data.confirmed) return;
    var type = !confirmed.home && p.data.id === guess.home ? 'home' : !confirmed.work && p.data.id === guess.work ? 'work' : 'other';
    if (p.data.type !== type) base.update(p.id, { data: copy({}, p.data, { type: type, suggested: type !== 'other' }) });
  });
  return guess;
}

function pruneFixes(s) {
  try {
    fixesDb().exec('delete from fixes where at < ?', [Date.now() - s.fixesKeepDays * 864e5]);
  } catch (error) {
    console.warn('health: точки: ' + message(error));
  }
}

/** App details older than appsKeepDays shrink to the total minutes. */
function pruneApps(s) {
  var limit = Date.now() - s.appsKeepDays * 864e5;
  rows(['screen'], limit - 30 * 864e5, limit).forEach(function (r) {
    if (r.data && (r.data.apps && Object.keys(r.data.apps).length)) {
      base.update(r.id, { data: copy({}, r.data, { apps: {}, launches: {} }) });
    }
  });
}

// ---- closing the day ----------------------------------------------------------------------------

/**
 * Closes the owner's day (the one that just ended when not given): final steps and screen,
 * missed doses, home and work, the summary — then the hooks 'life.day': achievements, rpg, pet.
 */
exports.closeDay = function (date, collected) {
  var s = settings();
  var now = Date.now();
  date = date ? normalizeDate(date, s) : T.addDays(today(s), -1);
  if (collected !== true) {
    try { exports.collect(); } catch (error) { console.error('health: сбор перед закрытием: ' + message(error)); }
  }
  try { collectScreen(s, now, date); } catch (error) { console.warn('health: экран при закрытии: ' + message(error)); }
  try { writeSteps(s, [date]); } catch (error) { console.warn('health: шаги при закрытии: ' + message(error)); }
  // Doses with no word from the owner become "missed" (at the due time).
  var b = T.bounds(date, s.dayEnd);
  var doses = Meds.withStatus(Meds.doses(loadMeds(), date, s.dayEnd), rows(['med'], b.from - 12 * 3600000, b.to + 12 * 3600000));
  Meds.missed(doses).forEach(function (dose) {
    if (dose.due > now) return;
    base.add({ kind: 'med', at: dose.due, title: dose.name, data: { medId: dose.medId, due: dose.due, status: 'missed' }, source: ID });
  });
  if (s.placesOn) {
    try { guessHomeWork(s); } catch (error) { console.warn('health: дом и работа: ' + message(error)); }
  }
  pruneFixes(s);
  try { pruneApps(s); } catch (error) { console.warn('health: сокращение подробностей: ' + message(error)); }
  invalidate([date]);
  var summary = exports.day(date);
  var closed = state().closed || {};
  closed[date] = now;
  var keys = Object.keys(closed).sort();
  if (keys.length > 60) keys.slice(0, keys.length - 60).forEach(function (key) { delete closed[key]; });
  setState({ closed: closed, lastClosed: date > (state().lastClosed || '') ? date : state().lastClosed });
  var results = exports.fire('life.day', date);
  try { emit('life.day', { date: date }); } catch (error) { /* no screens */ }
  try { axiko.widget.refresh(ID); } catch (error) { /* no widget */ }
  return { date: date, summary: summary, hooks: results };
};

/**
 * Closes every owner's day that has ended and is not closed yet (up to a week back): the job at
 * the end of the day and the start of the app both call it, so a day missed while the phone was
 * off is closed later. A quarter of an hour of margin: an alarm that comes a little early still
 * closes the day that is ending.
 */
function catchUp() {
  var s = settings();
  var st = state();
  var yesterday = T.addDays(T.logical(Date.now() + 15 * 60000, s.dayEnd), -1);
  if (!st.lastClosed) {
    setState({ lastClosed: yesterday });
    return;
  }
  var date = T.addDays(st.lastClosed, 1);
  if (date > yesterday) return;
  if (T.diffDays(date, yesterday) > 7) date = T.addDays(yesterday, -7);
  try { exports.collect(); } catch (error) { console.error('health: сбор перед закрытием: ' + message(error)); }
  for (; date <= yesterday; date = T.addDays(date, 1)) {
    try {
      exports.closeDay(date, true);
    } catch (error) {
      console.error('health: закрытие ' + date + ': ' + message(error));
    }
  }
}

// ---- the weekly look at sleep ----------------------------------------------------------------------

/** Analyses the nights (weeklyDepth back) and writes data/health/weekly/<week>.json. */
exports.weekly = function () {
  var s = settings();
  var now = Date.now();
  var last = today(s);
  var first = T.addDays(last, -s.weeklyDepth);
  var list = exports.days(T.addDays(first, -1), last);
  var byDate = {};
  list.forEach(function (d) { byDate[d.date] = d; });
  // Signs the summary has not got: workouts late in the evening, coffee shops after 16:00.
  var extras = {};
  var span = T.bounds(T.addDays(first, -1), s.dayEnd);
  var late = T.minutes(s.featWorkoutAfter);
  var coffee = T.minutes(s.featCoffeeAfter);
  var dayEnd = T.minutes(s.dayEnd);
  rows(['workout', 'expense'], span.from, now).forEach(function (r) {
    var date = T.logical(r.at, s.dayEnd);
    var e = extras[date] || (extras[date] = { lateWorkout: false, lateCoffee: false });
    var minute = T.minuteOfDay(r.at);
    var evening = function (from) { return minute >= from || minute < dayEnd; };
    if (r.kind === 'workout' && evening(late)) e.lateWorkout = true;
    if (r.kind === 'expense' && evening(coffee) && Weekly.isCoffee(r, s)) e.lateCoffee = true;
  });
  var rowsOut = [];
  T.range(T.addDays(first, 1), last).forEach(function (date) {
    var day = byDate[date];
    if (!day || !day.known.sleep || day.paused) return;
    var prev = byDate[T.addDays(date, -1)] || null;
    var extra = extras[T.addDays(date, -1)] || { lateWorkout: false, lateCoffee: false };
    rowsOut.push({ night: date, sleepMin: day.sleepMin, feats: Weekly.features(prev, extra, s) });
  });
  var table = Weekly.analyze(rowsOut, s);
  var averages = {
    now: Weekly.averages(T.range(T.addDays(last, -6), last).map(function (d) { return byDate[d]; })),
    prev: Weekly.averages(T.range(T.addDays(last, -13), T.addDays(last, -7)).map(function (d) { return byDate[d]; }))
  };
  var text = null;
  var by = 'template';
  if (s.weeklyModel && table.nights) {
    try {
      text = String(require('lib/ai').ask({ role: 'health.weekly', system: Weekly.SYSTEM, prompt: Weekly.prompt(table, averages) }) || '').trim();
      by = 'model';
    } catch (error) {
      console.warn('health: разбор недели моделью: ' + message(error));
    }
  }
  if (!text) {
    text = Weekly.text(table);
    by = 'template';
  }
  if (!/не обязательно причина/i.test(text)) text += ' Совпадение — не обязательно причина.';
  var week = T.isoWeek(last);
  var report = { week: week, made: now, date: last, by: by, text: text, table: table, averages: averages };
  save('weekly/' + week + '.json', report);
  if (s.notifyWeekly) {
    axiko.notify({ title: 'Разбор сна за неделю', text: text.slice(0, 300), open: SCREEN + '?tab=week' });
  }
  emit('health.changed', { type: 'weekly' });
  return report;
};

/** Saved weekly reports, newest first. */
exports.weeklies = function (limit) {
  var names = [];
  try {
    names = axiko.files.list(DIR + 'weekly').filter(function (n) { return /\.json$/.test(n); }).sort().reverse();
  } catch (error) {
    names = [];
  }
  return names.slice(0, limit || 12).map(function (name) { return load('weekly/' + name, null); }).filter(function (r) { return r; });
};

// ---- reminders ---------------------------------------------------------------------------------

function notifyMed(med, due, attempt) {
  var options = {
    title: (attempt ? 'Напоминаю: ' : 'Пора: ') + med.name,
    text: [med.dose, T.clock(due), med.note].filter(function (x) { return x; }).join(' · '),
    // Without buttons a tap marks the dose (the screen marks it and closes itself).
    open: SCREEN + '#med=' + encodeURIComponent(med.id) + '&due=' + due
  };
  if (has('notify.actions')) {
    // With buttons a tap only opens the day: the buttons mark.
    options.open = SCREEN + '?tab=today';
    options.id = notifyKey(med.id, due);
    options.actions = [
      { title: 'Принял', call: MAIN, fn: 'medAction', args: { id: med.id, due: due, status: 'taken' } },
      { title: 'Пропустить', call: MAIN, fn: 'medAction', args: { id: med.id, due: due, status: 'skipped' } }
    ];
  } else {
    options.id = notifyNumber(notifyKey(med.id, due));
  }
  axiko.notify(options);
}

function doseDone(medId, due) {
  return doseRecords(medId, due).length > 0;
}

function repeatFire(medId, due, attempt) {
  var med = findMed(loadMeds(), medId);
  if (!med || doseDone(med.id, due)) return;
  notifyMed(med, due, attempt || 1);
}

function scheduleRepeats(med, due, s) {
  if (!(s.medRepeatCount > 0)) return;
  if (has('job.once')) {
    locked(function () {
      var pending = load('pending.json', []).filter(function (p) { return p.at > Date.now(); });
      for (var i = 1; i <= s.medRepeatCount; i++) {
        var at = due + i * s.medRepeatMin * 60000;
        var key = 'health:rep:' + med.id + ':' + due + ':' + i;
        pending.push({ key: key, medId: med.id, due: due, attempt: i, at: at });
        registerRepeat(key, med.id, due, i, at);
      }
      save('pending.json', pending);
    });
    return;
  }
  // An older shell: wait in a background thread (lasts while the app's process lives).
  spawn(function () {
    for (var i = 1; i <= s.medRepeatCount; i++) {
      var wait = due + i * s.medRepeatMin * 60000 - Date.now();
      if (wait > 0) sleep(wait);
      if (doseDone(med.id, due)) return;
      repeatFire(med.id, due, i);
    }
  });
}

function registerRepeat(key, medId, due, attempt, at) {
  job(key, { once: at }, function () { repeatFire(medId, due, attempt); });
}

function restorePending() {
  if (!has('job.once')) return;
  var pending = load('pending.json', []).filter(function (p) { return p.at > Date.now(); });
  pending.forEach(function (p) { registerRepeat(p.key, p.medId, p.due, p.attempt, p.at); });
  save('pending.json', pending);
}

function medFire(medId, time) {
  var s = settings();
  if (!s.notifyMeds) return;
  var med = findMed(loadMeds(), medId);
  if (!med || !med.remind || med.archived) return;
  var date = T.ymd(Date.now());
  if (!Meds.active(med, date)) return;
  var due = T.at(date, time);
  if (doseDone(med.id, due)) return;
  notifyMed(med, due, 0);
  scheduleRepeats(med, due, s);
}

function habitFire(habitId) {
  var s = settings();
  if (!s.notifyHabits) return;
  var date = today(s);
  if (exports.paused(date)) return;
  var habits = loadHabits();
  var habit = habits.filter(function (h) { return h.id === habitId; })[0];
  if (!habit || !habit.remind || habit.archived) return;
  var done = habitDone(s, habits)[habit.id] || {};
  if (done[date] || !Habits.isDue(habit, date, done)) return;
  axiko.notify({ title: habit.title, text: 'Если сегодня получится — отметьте одним касанием или голосом.', open: SCREEN });
}

function safely(name, fn) {
  return function () {
    try {
      fn();
    } catch (error) {
      console.error('health: ' + name + ': ' + message(error));
    }
  };
}

/** Registers the module's jobs from the settings and the lists; drops the ones no longer wanted. */
function arm() {
  var s = settings();
  job('health:collect', { every: s.collectEvery }, safely('collect', function () { exports.collect(); }));
  job('health:dayclose', { at: s.dayEnd }, safely('dayclose', catchUp));
  if (s.weeklyOn) {
    job('health:weekly', { at: s.weeklyAt }, safely('weekly', function () {
      if (T.weekday(T.ymd(Date.now())) === settings().weeklyDay) exports.weekly();
    }));
  } else {
    unjob('health:weekly');
  }
  if (s.placesOn) job('health:places', { every: s.placeEvery }, safely('places', function () { exports.collectPlace(); }));
  else unjob('health:places');
  var wanted = {};
  if (s.notifyMeds) {
    loadMeds().forEach(function (med) {
      if (!med.remind || med.archived) return;
      (med.times || []).forEach(function (time) {
        var key = 'health:med:' + med.id + ':' + time;
        wanted[key] = true;
        job(key, { at: time }, safely(key, function () { medFire(med.id, time); }));
      });
    });
  }
  if (s.notifyHabits) {
    loadHabits().forEach(function (habit) {
      if (!habit.remind || habit.archived) return;
      var key = 'health:habit:' + habit.id;
      wanted[key] = true;
      job(key, { at: habit.remind }, safely(key, function () { habitFire(habit.id); }));
    });
  }
  var known = {};
  try {
    known = native('job.list') || {};
  } catch (error) {
    known = {};
  }
  Object.keys(known).forEach(function (key) {
    if ((key.indexOf('health:med:') === 0 || key.indexOf('health:habit:') === 0) && !wanted[key]) unjob(key);
  });
}

// ---- the agent's tools -----------------------------------------------------------------------------

function installTools() {
  ['health_mark.js', 'health_day.js'].forEach(function (name) {
    try {
      var text = axiko.files.read('modules/health/tools/' + name);
      var target = 'tools/' + name;
      if (!axiko.files.exists(target) || axiko.files.read(target) !== text) axiko.files.write(target, text);
    } catch (error) {
      console.error('health: инструмент ' + name + ': ' + message(error));
    }
  });
}

/** The tool health_mark: what the owner said, already parsed by the agent. */
exports.tool = function (args) {
  args = args || {};
  var what = String(args.what || '').toLowerCase();
  var s = settings();
  if (what === 'water') {
    var ml = Number(args.amount) > 0 ? Text.toMl(args.amount, args.unit, s.glassMl) : Text.toMl(1, args.unit || 'glass', s.glassMl);
    var water = exports.addWater(ml);
    return 'Записал ' + water.amount + ' мл воды. Сегодня ' + Text.liters(water.waterMl) + ' из ' + Text.liters(s.waterGoal) + ' л.';
  }
  if (what === 'habit') {
    var habit = exports.markHabit(args.name, args.amount);
    return habit.already ? '«' + habit.title + '» сегодня уже отмечена; цепочка ' + habit.chain + ' дн.' :
      'Отметил «' + habit.title + '». Цепочка: ' + habit.chain + ' дн.';
  }
  if (what === 'med') {
    var med = exports.medTaken(args.name, args.due, args.status === 'skipped' ? 'skipped' : 'taken');
    return (med.status === 'skipped' ? 'Отметил пропуск: ' : 'Отметил приём: ') + med.name + ' (' + med.time + ')' + (med.status === 'late' ? ', с опозданием.' : '.');
  }
  if (what === 'mood') {
    exports.setMood(args.amount);
    return 'Записал самочувствие: ' + Math.round(Number(args.amount)) + ' из 5.';
  }
  if (what === 'workout') {
    var w = exports.addWorkout({ minutes: args.amount, type: args.name });
    return 'Записал тренировку: ' + w.minutes + ' мин.';
  }
  if (what === 'sleep') {
    var slept = exports.setSleep({ night: args.date, bed: args.bed, wake: args.wake });
    return 'Поправил сон на ' + slept.night + ': ' + slept.bedtime + '–' + slept.wake + ', ' + Text.dur(slept.minutes) + '.';
  }
  if (what === 'pause') {
    var p = exports.pause({ type: args.type, until: args.date, title: args.name });
    return 'Пауза «' + PAUSE_TITLES[p.type] + '»' + (p.until ? ' до ' + Text.dateLong(p.until) + ' включительно' : ' без срока') +
      ': цепочки заморожены, о привычках не напоминаю (о лекарствах — напоминаю).';
  }
  if (what === 'unpause') {
    return exports.unpause().ended ? 'Пауза закончена.' : 'Паузы не было.';
  }
  if (what === 'add_habit') {
    var made = exports.saveHabit({
      title: args.name, icon: args.icon,
      schedule: Number(args.per_week) > 0 ? { perWeek: Number(args.per_week) } : { days: args.days },
      measure: Number(args.amount) > 0 ? { amount: Number(args.amount), unit: args.unit || 'мин' } : null,
      remind: args.remind || null
    });
    return 'Завёл привычку «' + made.title + '»: ' + Habits.describe(made) + (made.remind ? ', напоминание в ' + made.remind : '') + '.';
  }
  if (what === 'add_med') {
    var course = exports.saveMed({ name: args.name, dose: args.dose, times: args.times, days: args.days, until: args.date, note: args.note });
    return 'Завёл лекарство «' + course.name + '»' + (course.dose ? ' (' + course.dose + ')' : '') + ': ' + course.times.join(', ') +
      (course.days.length ? ', по дням ' + course.days.map(function (d) { return Text.WEEKDAYS[d - 1]; }).join(' ') : ', каждый день') +
      (course.until ? ', до ' + Text.dateLong(course.until) : '') + '. Напоминания включены.';
  }
  throw new Error('what: water, habit, med, mood, workout, sleep, pause, unpause, add_habit или add_med');
};

/** The tool health_day: the day in words. */
exports.toolDay = function (args) {
  var s = settings();
  var d = exports.day(args && args.date ? args.date : undefined);
  var lines = [];
  lines.push('День ' + d.date + (d.paused ? ' (пауза: ' + PAUSE_TITLES[d.paused] + ')' : '') + '.');
  if (d.known.sleep) {
    lines.push('Сон: ' + Text.dur(d.sleepMin) + ' (цель ' + Text.dur(s.sleepGoal) + '), отбой ' + d.bedtime + ', подъём ' + d.wake +
      ', источник: ' + ({ manual: 'вручную', hc: 'Health Connect', screen: 'по экрану' }[d.sleepFrom] || d.sleepFrom) + '.');
  } else {
    lines.push('Сон: данных нет.');
  }
  lines.push(d.known.steps ? 'Шаги: ' + Text.num(d.steps) + ' из ' + Text.num(d.stepsGoal) + ' (' + d.distanceKm + ' км).' : 'Шаги: данных нет.');
  lines.push('Вода: ' + Text.liters(d.waterMl) + ' из ' + Text.liters(d.waterGoal) + ' л.');
  if (d.medsDue) lines.push('Лекарства: принято ' + d.medsTaken + ' из ' + d.medsDue + (d.medsLate ? ', с опозданием ' + d.medsLate : '') + '.');
  if (d.habitsDue || d.habitsDone) {
    var habits = loadHabits();
    var names = d.habitIds.map(function (id) {
      var h = habits.filter(function (x) { return x.id === id; })[0];
      return h ? h.title + ' (' + (d.chains[id] || 0) + ' дн. подряд)' : id;
    });
    lines.push('Привычки: ' + d.habitsDone + ' из ' + d.habitsDue + (names.length ? ': ' + names.join(', ') : '') + '.');
  }
  if (d.known.screen) {
    lines.push('Экран: ' + Text.dur(d.screenMin) + ', разблокировок ' + d.unlocks + (d.socialMin !== null ? ', соцсети ' + Text.dur(d.socialMin) : '') +
      ', в ночном окне ' + Text.dur(d.lateMin) + '.');
  }
  if (d.workoutMin) lines.push('Тренировки: ' + d.workoutMin + ' мин.');
  if (d.places.length) lines.push('Мест за день: ' + d.places.length + (d.newPlaces ? ', новых ' + d.newPlaces : '') + '.');
  if (d.left.length && !d.paused) lines.push('Осталось: ' + d.left.join(', ') + '.');
  return lines.join('\n');
};

// ---- the widget ----------------------------------------------------------------------------------

exports.widget = function () {
  var d = exports.today();
  var s = settings();
  var lines = [];
  lines.push((d.known.steps ? Text.num(d.steps) : '—') + ' / ' + Text.num(s.stepsGoal) + ' шагов');
  lines.push('Сон ' + (d.known.sleep ? Text.dur(d.sleepMin) : '—') + ' · вода ' + Text.liters(d.waterMl) + ' / ' + Text.liters(s.waterGoal) + ' л');
  var left = d.left.filter(function (x, i, all) { return all.indexOf(x) === i; });
  if (d.paused) {
    // During a pause the habits keep quiet; the medicines do not.
    var medNames = loadMeds().map(function (m) { return m.name; });
    var meds = left.filter(function (name) { return medNames.indexOf(name) >= 0; });
    var pause = exports.pauses().filter(function (p) { return p.type === d.paused; }).pop();
    lines.push(PAUSE_TITLES[d.paused] + (pause && pause.until ? ' до ' + Text.dateLong(pause.until) : '') + (meds.length ? ' · ' + meds.join(', ') : ''));
  } else {
    lines.push(left.length ? 'Осталось: ' + left.join(', ') : 'Всё отмечено');
  }
  return { title: 'Здоровье', text: lines.join('\n'), open: SCREEN + '?tab=today' };
};

// ---- what the screen needs --------------------------------------------------------------------------

/** What is switched on and allowed: for the settings tab and for honest empty states. */
exports.status = function () {
  var out = { features: features(), sdk: Number(android.os.Build.VERSION.SDK_INT) };
  try { out.hc = require('./android/hc.js').status(); } catch (error) { out.hc = { available: false, error: message(error) }; }
  try {
    var Sn = require('./android/sensor.js');
    out.sensor = { present: Sn.present(), granted: Sn.granted() };
  } catch (error) { out.sensor = { present: false }; }
  try { out.usage = { granted: require('./android/usage.js').access() }; } catch (error) { out.usage = { granted: false }; }
  try {
    var L = require('./android/location.js');
    out.location = { granted: L.granted(), background: L.background() };
  } catch (error) { out.location = { granted: false }; }
  out.notifications = context.checkSelfPermission('android.permission.POST_NOTIFICATIONS') === 0;
  try {
    out.battery = Boolean(context.getSystemService('power').isIgnoringBatteryOptimizations(context.getPackageName()));
  } catch (error) { out.battery = null; }
  try { out.shizuku = native('shizuku.status'); } catch (error) { out.shizuku = null; }
  var st = state();
  out.lastCollect = st.lastCollect || null;
  out.lastReport = st.lastReport || null;
  out.lastClosed = st.lastClosed || null;
  out.logSince = st.logSince || null;
  out.tools = axiko.files.exists('tools/health_mark.js') && axiko.files.exists('tools/health_day.js');
  return out;
};

function openSettings(action, withPackage) {
  var intent = new android.content.Intent(action);
  if (withPackage) intent.setData(android.net.Uri.parse('package:' + context.getPackageName()));
  intent.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK);
  context.startActivity(intent);
}

function shizukuReady() {
  try {
    var st = native('shizuku.status');
    return Boolean(st && st.running && st.granted);
  } catch (error) {
    return false;
  }
}

/** Asks for a permission the module needs: 'steps' | 'hc' | 'usage' | 'location' | 'notifications' | 'battery'. */
exports.grant = function (what) {
  var pkg = context.getPackageName();
  if (what === 'steps') axiko.permission(['ACTIVITY_RECOGNITION']);
  else if (what === 'hc') {
    var P = require('./android/hc.js').PERMS;
    var asked = [P.steps, P.sleep, P.exercise, P.background, P.history];
    if (settings().waterToHc) asked.push(P.hydration);
    axiko.permission(asked);
  } else if (what === 'usage') {
    if (shizukuReady()) axiko.shell('appops set ' + pkg + ' GET_USAGE_STATS allow', { privileged: true });
    else openSettings(android.provider.Settings.ACTION_USAGE_ACCESS_SETTINGS, false);
  } else if (what === 'location') {
    axiko.permission(['ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION']);
    if (!require('./android/location.js').background()) {
      if (shizukuReady()) axiko.shell('pm grant ' + pkg + ' android.permission.ACCESS_BACKGROUND_LOCATION', { privileged: true });
      else openSettings(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS, true);
    }
  } else if (what === 'notifications') axiko.permission(['POST_NOTIFICATIONS']);
  else if (what === 'battery') openSettings(android.provider.Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, true);
  else throw new Error('Не знаю, что выдать: ' + what);
  return exports.status();
};

function placeTitles() {
  var out = {};
  placeRecords().forEach(function (p) { out[p.data.id] = { title: p.title, type: p.data.type || 'other' }; });
  return out;
}

/** Everything the screen shows, in one call. */
exports.view = function () {
  var s = settings();
  var now = Date.now();
  var date = today(s);
  var days = exports.days(T.addDays(date, -13), date);
  var summary = days[days.length - 1];
  var habits = loadHabits();
  var done = habitDone(s, habits);
  var pausedOn = pausedFn(s, pauseRecords());
  var live = habits.filter(function (h) { return !h.archived; }).map(function (h) {
    return copy({}, h, {
      chain: summary.chains[h.id] || 0,
      best: Habits.best(h, done[h.id] || {}, pausedOn, date, s.freezesPerWeek),
      done: summary.habitIds.indexOf(h.id) >= 0,
      due: Habits.isDue(h, date, done[h.id] || {}),
      when: Habits.describe(h)
    });
  });
  // The habits calendar: which habits were marked on each date, and the paused dates.
  var weeks = s.calendarWeeks;
  var calFrom = T.addDays(T.monday(date), -7 * (weeks - 1));
  var calendar = { from: calFrom, to: date, weeks: weeks, done: {}, paused: {} };
  T.range(calFrom, date).forEach(function (d) {
    var ids = Object.keys(done).filter(function (id) { return done[id][d]; });
    if (ids.length) calendar.done[d] = ids;
    var p = pausedOn(d);
    if (p) calendar.paused[d] = p;
  });
  var midnight = T.at(T.ymd(now), '00:00');
  var stepsRecord = rows(['steps'], midnight - 3 * 3600000, midnight + 3 * 3600000).filter(function (r) { return r.data && r.data.day === T.ymd(now); })[0];
  var screenRecord = rows(['screen'], T.at(date, '00:00') - 3 * 3600000, T.at(date, '00:00') + 3 * 3600000).filter(function (r) { return r.data && r.data.day === date; })[0];
  var apps = [];
  if (screenRecord && screenRecord.data && screenRecord.data.apps) {
    var U = require('./android/usage.js');
    apps = Object.keys(screenRecord.data.apps).slice(0, 5).map(function (pkg) { return { name: U.label(pkg), minutes: screenRecord.data.apps[pkg] }; });
  }
  var b = T.bounds(date, s.dayEnd);
  var titles = placeTitles();
  var visits = rows(['visit'], b.from, b.to).map(function (v) {
    var p = titles[v.data && v.data.place] || {};
    return { title: p.title || v.title, type: p.type || 'other', start: v.at, minutes: Math.round(Number(v.amount) || 0), firstTime: Boolean(v.data && v.data.firstTime) };
  });
  var pause = exports.pauses().filter(function (p) { return date >= p.from && (!p.until || date <= p.until); }).pop() || null;
  return {
    now: now, date: date, settings: s, summary: summary,
    days: days.map(function (d) {
      return { date: d.date, sleepMin: d.sleepMin, steps: d.steps, known: d.known, paused: d.paused, waterMl: d.waterMl, screenMin: d.screenMin };
    }),
    habits: live,
    archived: habits.filter(function (h) { return h.archived; }),
    meds: loadMeds(),
    doses: exports.medsToday(),
    stepHours: stepsRecord && stepsRecord.data ? stepsRecord.data.hours || null : null,
    screen: screenRecord ? { first: screenRecord.data.first, last: screenRecord.data.last, from: screenRecord.data.from, apps: apps } : null,
    calendar: calendar,
    pause: pause,
    visits: visits,
    weekly: exports.weeklies(1)[0] || null,
    places: exports.places(),
    focus: axiko.files.exists('modules/focus/main.js'),
    status: exports.status()
  };
};

// ---- start --------------------------------------------------------------------------------------

/** Runs at the app's start (module.json "autostart"): jobs, the screen log, the agent's tools. */
exports.start = function () {
  on('screen', onScreen, 'health');
  if (!state().logSince) setState({ logSince: Date.now() });
  arm();
  installTools();
  restorePending();
  spawn(function () {
    try {
      catchUp();
    } catch (error) {
      console.error('health: догоняю закрытие суток: ' + message(error));
    }
  });
  return true;
};

/** Stops the module's background work (before removing it). */
exports.stop = function () {
  var known = {};
  try { known = native('job.list') || {}; } catch (error) { known = {}; }
  Object.keys(known).forEach(function (key) { if (key.indexOf('health:') === 0) unjob(key); });
  try { if (has('off')) off('screen', 'health'); else on('screen', function () {}, 'health'); } catch (error) { /* nothing */ }
  return true;
};
