// Where the days come from: the «Здоровье» module (modules/health/main.js: day, days, goals,
// paused, today) when it is installed; otherwise a summary built from the shared base by
// fallback.js — honestly poorer: no schedules of habits, no budget, no cells.
// Engine code (Rhino). The same file is in achievements, rpg and horoscope.
var axiko = require('lib/axiko');
var dates = require('./dates.js');
var fallback = require('./fallback.js');

var HEALTH = 'modules/health/main.js';
var KINDS = ['sleep', 'steps', 'water', 'med', 'habit', 'workout', 'screen', 'place', 'visit', 'mood', 'expense', 'focus', 'play'];

/** The health module, or null when it is not installed or does not load. */
exports.health = function () {
  if (!axiko.files.exists(HEALTH)) return null;
  try {
    var module = require(HEALTH);
    return module && typeof module.day === 'function' ? module : null;
  } catch (error) {
    console.warn('source: modules/health не загрузился: ' + error);
    return null;
  }
};

/** 'health' when days come from the health module, 'base' when they are built from records. */
exports.kind = function () {
  return exports.health() ? 'health' : 'base';
};

/** Goals in one shape: { steps, sleep, bedtime, water, stride, dayEnd, dayEndHour, socialLimit, screenLimit }. */
exports.goals = function () {
  var given = {};
  var health = exports.health();
  if (health && typeof health.goals === 'function') {
    try { given = health.goals() || {}; } catch (error) { console.warn('source: goals: ' + error); }
  } else {
    given = axiko.files.readJson('data/health/settings.json', {}) || {};
  }
  return fallback.goals(given);
};

/** The day the owner lives in now (before 05:00 it is still yesterday). */
exports.currentDay = function () {
  return dates.current(Date.now(), exports.goals().dayEndHour);
};

function list(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'object') return Object.keys(value).map(function (key) { var day = value[key]; if (day && !day.date) day.date = key; return day; });
  return [];
}

function baseRecords(fromMs, toMs) {
  var base = require('lib/base');
  var out = [];
  // base.find returns at most 1000 rows, newest first: read in ten-day slices.
  for (var start = fromMs; start < toMs; start += 10 * 864e5) {
    var until = Math.min(toMs, start + 10 * 864e5);
    out = out.concat(base.find({ kinds: KINDS, since: start, until: until, limit: 1000, oldestFirst: true }));
  }
  return out;
}

function baseOptions(goals) {
  var base = require('lib/base');
  var pauses = base.find({ kind: 'pause', limit: 500 });
  var placeTypes = {};
  base.find({ kind: 'place', limit: 1000 }).forEach(function (place) {
    var data = place.data || {};
    if (data.id !== undefined) placeTypes[data.id] = data.type || 'other';
  });
  var month = Date.now() - 30 * 864e5;
  return {
    goals: goals,
    pauses: pauses,
    placeTypes: placeTypes,
    spendTracked: base.find({ kind: 'expense', since: month, limit: 1 }).length > 0,
    placesTracked: base.find({ kind: 'visit', since: month, limit: 1 }).length > 0
  };
}

/** Day summaries from `from` to `to` (both included), oldest first, in one shape. */
exports.days = function (from, to) {
  var health = exports.health();
  if (health) {
    try {
      var got = typeof health.days === 'function' ? list(health.days(from, to))
        : dates.range(from, to).map(function (date) { return health.day(date); });
      return got.filter(Boolean).map(fallback.normalize).filter(function (day) { return day.date; })
        .sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    } catch (error) {
      console.warn('source: health.days: ' + error);
    }
  }
  var goals = exports.goals();
  var options = baseOptions(goals);
  var records = baseRecords(dates.start(from, goals.dayEndHour) - 864e5, dates.start(dates.add(to, 1), goals.dayEndHour) + 864e5);
  return dates.range(from, to).map(function (date) {
    return fallback.normalize(fallback.summarize(date, records, options));
  });
};

/** One day. */
exports.day = function (date) {
  var health = exports.health();
  if (health) {
    try { return fallback.normalize(health.day(date)); } catch (error) { console.warn('source: health.day: ' + error); }
  }
  return exports.days(date, date)[0] || null;
};

/** Today so far. */
exports.today = function () {
  var health = exports.health();
  if (health && typeof health.today === 'function') {
    try { return fallback.normalize(health.today()); } catch (error) { console.warn('source: health.today: ' + error); }
  }
  return exports.day(exports.currentDay());
};

/** The pause on that day: null or 'sick' | 'vacation' | 'rest'. */
exports.paused = function (date) {
  var health = exports.health();
  if (health && typeof health.paused === 'function') {
    try {
      var value = health.paused(date);
      return value && typeof value === 'object' ? (value.type || 'rest') : (value || null);
    } catch (error) { console.warn('source: health.paused: ' + error); }
  }
  var day = exports.day(date);
  return day ? day.paused : null;
};

/** Registers the module's hooks in data/health/hooks.json, keeping the order achievements → rpg → pet. */
exports.hooks = function (mine) {
  var path = 'data/health/hooks.json';
  var current = axiko.files.readJson(path, []);
  var wrapped = !Array.isArray(current);
  var hooks = wrapped ? (current && Array.isArray(current.hooks) ? current.hooks : []) : current;
  var order = ['modules/achievements/', 'modules/rpg/', 'modules/pet/'];
  var rank = function (path) {
    for (var i = 0; i < order.length; i++) if (String(path).indexOf(order[i]) === 0) return i;
    return order.length;
  };
  var changed = false;
  mine.forEach(function (hook) {
    var same = hooks.some(function (item) { return item.event === hook.event && item.path === hook.path && item.fn === hook.fn; });
    if (same) return;
    var at = hooks.length;
    for (var i = 0; i < hooks.length; i++) {
      if (hooks[i].event === hook.event && rank(hooks[i].path) > rank(hook.path)) { at = i; break; }
    }
    hooks.splice(at, 0, { event: hook.event, path: hook.path, fn: hook.fn });
    changed = true;
  });
  if (changed) axiko.files.writeJson(path, wrapped ? Object.assign({}, current, { hooks: hooks }) : hooks);
  return changed;
};

/** Removes the module's hooks (used by checks, never by the module itself). */
exports.unhook = function (prefix) {
  var path = 'data/health/hooks.json';
  var hooks = axiko.files.readJson(path, []);
  if (!Array.isArray(hooks)) return;
  axiko.files.writeJson(path, hooks.filter(function (hook) { return String(hook.path).indexOf(prefix) !== 0; }));
};

/** The shell's new operations (docs/shell-changes.md), or [] on a shell without them. */
exports.features = function () {
  try {
    var got = native('shell.features');
    return Array.isArray(got) ? got : [];
  } catch (error) {
    return [];
  }
};

/** Writes tools/<file> for the agents when it is missing or differs. */
exports.tool = function (file, source) {
  var path = 'tools/' + file;
  try {
    if (!axiko.files.exists(path) || axiko.files.read(path) !== source) axiko.files.write(path, source);
  } catch (error) {
    console.warn('source: tool ' + file + ': ' + error);
  }
};

/** Another store module's main.js, or null. */
exports.module = function (id) {
  var path = 'modules/' + id + '/main.js';
  if (!axiko.files.exists(path)) return null;
  try { return require(path); } catch (error) { console.warn('source: ' + path + ': ' + error); return null; }
};
