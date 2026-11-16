// Жизнь-RPG: a role-playing game on top of real life. Steps, sleep and habits give experience and
// skills when a day closes (hook life.day of «Здоровье», after Achievements); new places open the
// map; achievements are rewards. The character is the creature of «Питомец»: look() tells it
// how far it has grown. The journal of experience only grows; levels never fall.
var assi = require('lib/assi');
var files = assi.files;
var source = require('./source.js');
var dates = require('./dates.js');
var xpMod = require('./xp.js');
var quests = require('./quests.js');
var chronicle = require('./chronicle.js');
var geo = require('./geo.js');

var DIR = 'data/rpg/';
var SELF = 'modules/rpg/main.js';
var SCREEN = 'modules/rpg/ui/index.html';

var DEFAULTS = {
  xp: JSON.parse(JSON.stringify(xpMod.DEFAULTS)),
  rounding: 'floor',                         // floor | round | ceil — дробный опыт
  level: { base: 120, power: 1.6 },          // T(L) = base × (L − 1)^power
  skill: { base: 50, power: 1.5 },           // уровень навыка
  comeback: { mult: 1.5, gap: 3 },           // бонус возвращения: ×1,5 после 3+ пустых дней или паузы
  freezesPerWeek: 1,                         // заморозки цепочек привычек в неделю
  achievements: true,                        // опыт за ачивки
  traitLevel: 10,                            // уровень навыка, с которого у существа появляется черта
  traits: { exploration: 'backpack', endurance: 'sturdy', regime: 'nightcap' },
  stages: [1, 5, 15, 30, 50],                // пороги стадий, если у Питомца нет своих
  quests: { on: true, daily: 3, weekly: 2, at: '08:00', window: 28, minDays: 7, model: false },
  chronicle: { model: false, day: 7, at: '20:00' },
  notify: { level: true, weeklyQuest: true },
  cells: { precision: 7 },
  map: { osm: false },
  games: { bonus: true, perLevels: 5, max: 3 }, // стартовые сундуки новым играм Игротеки: 1 за каждые perLevels уровней, не больше max
  hero: '',                                  // имя героя в хронике; пусто — имя Питомца или «Странник»
  checkAt: '05:40',                          // запасное закрытие дня, если «Здоровье» не позвало
  catchUpDays: 14,                           // сколько пропущенных дней закрыть задним числом
  historyDays: 90                            // история навыка на экране
};

// ---- storage -------------------------------------------------------------------------------

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function merge(into, from) {
  Object.keys(from || {}).forEach(function (key) {
    var value = from[key];
    if (value && typeof value === 'object' && !Array.isArray(value) && into[key] && typeof into[key] === 'object' && !Array.isArray(into[key])) merge(into[key], value);
    else into[key] = value;
  });
  return into;
}

function settings() {
  return merge(clone(DEFAULTS), files.readJson(DIR + 'settings.json', {}) || {});
}

function read(name, fallback) {
  var value = files.readJson(DIR + name, fallback);
  return value === null || value === undefined ? fallback : value;
}

function write(name, value) {
  files.writeJson(DIR + name, value);
}

var journal = null;

function db() {
  if (journal) return journal;
  journal = assi.db('rpg/xp');
  journal.exec('create table if not exists xp (id integer primary key autoincrement, day text not null, at integer not null, ' +
    'skill text not null, amount integer not null, reason text, ref text unique)');
  journal.exec('create index if not exists xp_day on xp (day)');
  journal.exec('create index if not exists xp_skill on xp (skill, day)');
  return journal;
}

/** Writes entries that are not in the journal yet (by ref); returns those written. */
function record(date, entries) {
  var written = [];
  entries.forEach(function (entry) {
    if (!(entry.amount > 0)) return;
    if (entry.ref && db().query('select id from xp where ref = ?', [entry.ref]).length) return;
    db().exec('insert into xp (day, at, skill, amount, reason, ref) values (?, ?, ?, ?, ?, ?)',
      [date, Date.now(), entry.skill, Math.round(entry.amount), entry.reason || '', entry.ref || null]);
    written.push(entry);
  });
  return written;
}

function heroName(s) {
  if (s.hero) return s.hero;
  var pet = files.readJson('data/pet/settings.json', {}) || {};
  return pet.name || 'Странник';
}

function habitTitles() {
  var out = {};
  var habits = files.readJson('data/health/habits.json', []);
  (Array.isArray(habits) ? habits : []).forEach(function (habit) { out[habit.id] = { title: habit.title, icon: habit.icon, archived: habit.archived }; });
  return out;
}

// ---- levels ----------------------------------------------------------------------------------

/** Totals from the journal → levels that never fall. Returns what rose. */
function recompute(st, s) {
  var rows = db().query('select skill, sum(amount) as xp from xp group by skill');
  var total = 0;
  var skills = st.skills || {};
  var rose = [];
  rows.forEach(function (row) {
    total += row.xp;
    if (xpMod.LEVEL_ONLY.indexOf(row.skill) >= 0) return;
    var was = skills[row.skill] || { xp: 0, level: 1 };
    var level = Math.max(was.level || 1, xpMod.level(row.xp, s.skill.base, s.skill.power).level);
    if (level > (was.level || 1)) rose.push({ skill: row.skill, level: level });
    skills[row.skill] = { xp: row.xp, level: level };
  });
  var before = st.level || 1;
  st.total = total;
  st.level = Math.max(before, xpMod.level(total, s.level.base, s.level.power).level);
  st.skills = skills;
  return { from: before, to: st.level, skills: rose };
}

function traitsOf(st, s) {
  var out = [];
  Object.keys(s.traits || {}).forEach(function (skill) {
    var one = (st.skills || {})[skill];
    if (one && one.level >= s.traitLevel) out.push(s.traits[skill]);
  });
  return out;
}

/** For «Питомец»: { level, stage, stageIndex, traits }. */
exports.look = function () {
  var s = settings();
  var st = read('state.json', {});
  var thresholds = s.stages;
  var pet = files.readJson('data/pet/settings.json', {}) || {};
  if (Array.isArray(pet.stages) && pet.stages.length && pet.stages.every(function (n) { return typeof n === 'number'; })) thresholds = pet.stages;
  var level = st.level || 1;
  var stage = xpMod.stage(level, thresholds);
  return { level: level, stage: stage.name, stageIndex: stage.index, traits: traitsOf(st, s) };
};

function levelsWord(n) {
  var tens = n % 100;
  var ones = n % 10;
  if (tens >= 11 && tens <= 14) return 'уровней';
  if (ones === 1) return 'уровень';
  return ones >= 2 && ones <= 4 ? 'уровня' : 'уровней';
}

function levelUp(date, rise, st, s) {
  if (rise.to <= rise.from) return;
  var base = require('lib/base');
  for (var level = rise.from + 1; level <= rise.to; level++) {
    try {
      base.add({ kind: 'event', title: 'Уровень ' + level, source: 'rpg', data: { level: level, day: date } });
    } catch (error) {
      console.warn('rpg: base.add: ' + error);
    }
  }
  // One notification a real day, even when several levels (or several closed days) came at once.
  var now = dates.ymd(Date.now());
  if (s.notify.level && st.notifiedLevelDay !== now) {
    st.notifiedLevelDay = now;
    try {
      assi.notify({ title: 'Новый уровень: ' + rise.to, text: heroName(s) + ' вырос' + (rise.to - rise.from > 1 ? ' сразу на ' + (rise.to - rise.from) + ' ' + levelsWord(rise.to - rise.from) : '') + '. Загляните к нему.', open: SCREEN });
    } catch (error) {
      console.warn('rpg: notify: ' + error);
    }
  }
  var pet = source.module('pet');
  try { if (pet && typeof pet.celebrate === 'function') pet.celebrate('level', { level: rise.to }); } catch (error) { /* the pet may not want it */ }
}

// ---- cells and locations -----------------------------------------------------------------------

function baseRows(kind, fromMs, toMs) {
  require('lib/base');
  var sql = 'select id, at, title, data from records where kind = ?';
  var args = [kind];
  if (fromMs !== undefined && fromMs !== null) { sql += ' and at >= ?'; args.push(fromMs); }
  if (toMs !== undefined && toMs !== null) { sql += ' and at < ?'; args.push(toMs); }
  return assi.db('base').query(sql + ' order by at', args).map(function (row) {
    var data = null;
    try { data = row.data ? JSON.parse(row.data) : null; } catch (error) { data = null; }
    return { id: row.id, at: row.at, title: row.title, data: data || {} };
  });
}

function cellOf(data, precision) {
  if (data.cell) return String(data.cell).slice(0, precision);
  if (typeof data.lat === 'number' && typeof data.lon === 'number') return geo.encode(data.lat, data.lon, precision);
  return null;
}

/** Adds cells from visits (and the route, when «Здоровье» gives it) of a period; returns the new ones. */
function addCells(fromMs, toMs, s) {
  var cells = read('cells.json', {});
  var fresh = [];
  var precision = s.cells.precision || 7;
  var places = {};
  var dayEndHour = source.goals().dayEndHour;
  baseRows('place').forEach(function (place) { if (place.data.id !== undefined) places[place.data.id] = place.data; });
  var add = function (cell, at) {
    if (!cell || cells[cell]) return;
    cells[cell] = dates.current(at, dayEndHour);
    fresh.push(cell);
  };
  baseRows('visit', fromMs, toMs).forEach(function (visit) {
    add(cellOf(visit.data, precision) || cellOf(places[visit.data.place] || {}, precision), visit.at);
  });
  // «Здоровье» keeps the cells its place collector saw (by the route too): { cell: first seen, ms }.
  var health = source.health();
  if (health && typeof health.cells === 'function') {
    try {
      var seen = health.cells() || {};
      Object.keys(seen).forEach(function (cell) {
        var at = Number(seen[cell]) || Date.now();
        if ((fromMs === null || fromMs === undefined || at >= fromMs) && (toMs === null || toMs === undefined || at < toMs)) add(String(cell).slice(0, precision), at);
      });
    } catch (error) {
      console.warn('rpg: health.cells: ' + error);
    }
  }
  if (fresh.length) write('cells.json', cells);
  return fresh;
}

/** How many cells were opened on that day (by the day of their first visit). */
function cellsOn(date) {
  var cells = read('cells.json', {});
  return Object.keys(cells).filter(function (cell) { return cells[cell] === date; }).length;
}

/** The map: open cells, locations (places with visits), counts. Home and work show only their cell. */
exports.map = function () {
  var s = settings();
  var cells = read('cells.json', {});
  var names = read('locations.json', {});
  var precision = s.cells.precision || 7;
  var visits = {};
  var farthest = 0;
  baseRows('visit').forEach(function (visit) {
    var place = visit.data.place;
    if (place !== undefined && place !== null) visits[place] = (visits[place] || 0) + 1;
    if (typeof visit.data.distanceKm === 'number' && visit.data.distanceKm > farthest) farthest = visit.data.distanceKm;
  });
  var locations = [];
  baseRows('place').forEach(function (place) {
    var d = place.data;
    if (d.id === undefined || !visits[d.id]) return;
    var hidden = d.type === 'home' || d.type === 'work';
    locations.push({
      id: d.id, name: names[d.id] || place.title || 'Место', title: place.title || '', type: d.type || 'other',
      cell: cellOf(d, precision), visits: visits[d.id], first: dates.ymd(place.at), hidden: hidden,
      lat: hidden ? null : d.lat, lon: hidden ? null : d.lon
    });
  });
  return {
    cells: Object.keys(cells).map(function (cell) { return { cell: cell, first: cells[cell] }; }),
    locations: locations,
    counts: { cells: Object.keys(cells).length, locations: locations.length, farthestKm: Math.round(farthest) },
    osm: Boolean(s.map.osm),
    source: source.kind()
  };
};

/** The owner's own, «game» name of a location. */
exports.rename = function (id, name) {
  var names = read('locations.json', {});
  if (name && String(name).trim()) names[id] = String(name).trim().slice(0, 60); else delete names[id];
  write('locations.json', names);
  emit('rpg.changed', {});
  return true;
};

// ---- the day --------------------------------------------------------------------------------

function newPlaces(date, goals) {
  var from = dates.start(date, goals.dayEndHour);
  var to = dates.start(dates.add(date, 1), goals.dayEndHour);
  var names = read('locations.json', {});
  return baseRows('place', from, to).map(function (place) {
    return { id: place.data.id !== undefined ? place.data.id : place.id, title: names[place.data.id] || place.title || 'Место' };
  });
}

/** Chains of habits: «Здоровье» knows the schedules, so its numbers win; ours fill the gaps. */
function chainsFor(day, st) {
  var out = {};
  Object.keys(st.chains || {}).forEach(function (id) { out[id] = st.chains[id].days || 0; });
  Object.keys(day.chains || {}).forEach(function (id) { if (Number(day.chains[id]) > 0) out[id] = Number(day.chains[id]); });
  return out;
}

function achievementEntries(s) {
  if (!s.achievements) return [];
  require('lib/base');
  return assi.db('base').query("select id, title, data from records where kind = 'achievement' order by id").map(function (row) {
    var data = {};
    try { data = JSON.parse(row.data || '{}'); } catch (error) { data = {}; }
    return { skill: 'achievement', amount: data.tease ? 0 : Number(data.xp) || 0, reason: 'ачивка «' + row.title + '»', ref: 'ach:' + row.id, title: row.title };
  }).filter(function (entry) {
    return entry.amount > 0 && !db().query('select id from xp where ref = ?', [entry.ref]).length;
  });
}

function entriesOf(day, st, s, goals, cellsNew, places) {
  var habits = habitTitles();
  var titles = {};
  Object.keys(habits).forEach(function (id) { titles[id] = habits[id].title; });
  var bonus = !day.paused && xpMod.hasData(day) && xpMod.comeback(day.date, st.lastActive, st.lastPaused, s.comeback.gap);
  return {
    bonus: bonus,
    entries: xpMod.dayEntries(day, {
      goals: goals, newCells: cellsNew, places: places, chains: chainsFor(day, st), habits: titles,
      bonus: bonus, bonusMult: s.comeback.mult, rounding: s.rounding
    }, s.xp)
  };
}

/**
 * Closes a day: experience by the formulas, achievements, quests, levels, chronicle. Idempotent:
 * closing the same day again adds nothing (every entry has its ref).
 *   given — a day summary to use instead of the one of «Здоровье» (checks); options.quiet — no
 *   notification, no base event and no pet's celebration for a new level.
 */
exports.close = function (date, given, options) {
  var s = settings();
  var st = read('state.json', {});
  options = options || {};
  date = date || dates.add(source.currentDay(), -1);
  var day = given ? require('./fallback.js').normalize(Object.assign({ date: date }, given)) : source.day(date);
  if (!day) return { date: date, written: 0 };
  var goals = source.goals();
  if (!st.started || dates.diff(date, st.started) < 0) st.started = date;
  var again = st.closed && st.closed.indexOf(date) >= 0;
  if (!again) st.chains = xpMod.trackChains(st.chains || {}, day, s.freezesPerWeek);
  var freezes = {};
  Object.keys(st.chains || {}).forEach(function (id) { freezes[id] = st.chains[id].freezesLeft; });
  st.freezes = freezes;

  var fromMs = dates.start(date, goals.dayEndHour);
  var toMs = dates.start(dates.add(date, 1), goals.dayEndHour);
  addCells(fromMs, toMs, s);
  var places = newPlaces(date, goals);
  var opened = cellsOn(date);
  var made = entriesOf(day, st, s, goals, opened || undefined, places);
  var achievements = achievementEntries(s);
  var settled = settle(date, day, s);
  // The comeback bonus is for the whole day's experience: achievements and quests too.
  if (made.bonus) xpMod.applyComeback(achievements.concat(settled.entries), s.comeback.mult, s.rounding);
  var written = record(date, made.entries.concat(achievements, settled.entries));

  var rise = recompute(st, s);
  if (!options.quiet) levelUp(date, rise, st, s);

  if (xpMod.hasData(day)) st.lastActive = !st.lastActive || dates.diff(date, st.lastActive) > 0 ? date : st.lastActive;
  if (day.paused) st.lastPaused = !st.lastPaused || dates.diff(date, st.lastPaused) > 0 ? date : st.lastPaused;
  st.lastClosed = !st.lastClosed || dates.diff(date, st.lastClosed) > 0 ? date : st.lastClosed;
  st.closed = (st.closed || []).concat(again ? [] : [date]).slice(-30);

  // The chronicle: 1–3 template lines.
  var dayXp = db().query('select skill, sum(amount) as xp from xp where day = ? group by skill', [date]);
  var top = dayXp.filter(function (row) { return xpMod.SKILLS.some(function (k) { return k.id === row.skill; }); })
    .sort(function (a, b) { return b.xp - a.xp; })[0];
  var record_ = day.known && day.known.steps && day.steps > (st.maxSteps || 0) && st.maxSteps > 0;
  if (day.known && day.known.steps && day.steps > (st.maxSteps || 0)) st.maxSteps = day.steps;
  var book = read('chronicle.json', { days: {}, weeks: {} });
  if (!again || !book.days[date]) {
    var lines = chronicle.dayLines({
      day: dates.diff(date, st.started) + 1, hero: heroName(s), level: rise.to > rise.from ? rise.to : null,
      places: places.map(function (p) { return p.title; }), achievements: achievements.map(function (a) { return a.title; }),
      steps: day.steps || 0, stepsRecord: record_, xp: dayXp.reduce(function (sum, row) { return sum + row.xp; }, 0),
      topSkill: top ? top.skill : null, paused: day.paused
    });
    if (lines.length) book.days[date] = lines;
    write('chronicle.json', book);
  }
  write('state.json', st);
  changed();
  return { date: date, written: written.length, xp: written.reduce(function (sum, e) { return sum + e.amount; }, 0), level: st.level, bonus: made.bonus };
};

/**
 * Closes every day not closed yet up to `date` (yesterday when not given): after the phone was off
 * for a few days nothing is lost. Looks back at most `catchUpDays` (14) days.
 */
exports.catchUp = function (date) {
  var s = settings();
  var st = read('state.json', {});
  date = date || dates.add(source.currentDay(), -1);
  var from = st.lastClosed ? dates.add(st.lastClosed, 1) : date;
  var oldest = dates.add(date, 1 - Math.max(1, Number(s.catchUpDays) || 14));
  if (dates.diff(from, oldest) < 0) from = oldest;
  var out = [];
  if (dates.diff(date, from) < 0) return out;
  dates.range(from, date).forEach(function (day) { out.push(exports.close(day)); });
  return out;
};

/** Hook life.day of «Здоровье»: the day is closed (Achievements have been checked already). */
exports.onDay = function (date) {
  var day = typeof date === 'string' ? date : (date && date.date) || null;
  var st = read('state.json', {});
  // The same day again (the owner closed it twice, or a check): close it alone; refs keep it single.
  var out = day && st.lastClosed && dates.diff(day, st.lastClosed) <= 0 ? [exports.close(day)] : exports.catchUp(day);
  bonusesQuietly();
  return out;
};

function bonusesQuietly() {
  try {
    exports.giveGameBonuses();
  } catch (error) {
    console.warn('rpg: бонусы играм: ' + error);
  }
}

/** Hook life.place: a new place — open its cell at once. */
exports.onPlace = function () {
  var s = settings();
  var fresh = addCells(Date.now() - 864e5, null, s);
  if (fresh.length) changed();
  return fresh.length;
};

/** Events of other modules: event('subscription.cancel', { id }) — Траты, when a subscription is cancelled. */
exports.event = function (name, data) {
  data = data || {};
  if (name !== 'subscription.cancel') return false;
  var s = settings();
  var date = source.currentDay();
  var written = record(date, [{ skill: 'household', amount: s.xp.subscription, reason: 'отменённая подписка' + (data.merchant ? ': ' + data.merchant : ''), ref: 'sub:' + (data.id || data.merchant || Date.now()) }]);
  var st = read('state.json', {});
  var rise = recompute(st, s);
  levelUp(date, rise, st, s);
  write('state.json', st);
  changed();
  return written.length > 0;
};

// ---- starting bonuses for the games of «Игротека» ---------------------------------------------

var GAMES = 'modules/games/main.js';

/**
 * What the level gives a game at its start: { on, level, chests, reason }. A chest for every
 * `games.perLevels` (5) levels, at most `games.max` (3). The hub applies chests itself (sim.chest
 * of the game, or its income for a while), so any game can take them.
 */
exports.gameBonus = function (gameId) {
  var s = settings();
  var st = read('state.json', {});
  var level = st.level || 1;
  var per = Math.max(1, Number(s.games.perLevels) || 5);
  var chests = s.games.bonus ? Math.max(0, Math.min(Number(s.games.max) || 0, Math.floor(level / per))) : 0;
  var given = (st.gameBonus || {})[gameId] || null;
  return {
    on: Boolean(s.games.bonus), game: gameId || null, level: level, chests: chests, given: given,
    reason: chests ? 'Стартовый бонус Жизни-RPG: уровень ' + level : ''
  };
};

/**
 * Puts the starting chests into the inbox of every game of «Игротека» that has not been started
 * yet (no saves) and has not had them: hub.inboxAdd(id, { op: 'chest' }). Without the hub — nothing.
 * Games already played get nothing and are remembered, so that the bonus stays a start one.
 */
exports.giveGameBonuses = function () {
  var s = settings();
  if (!s.games.bonus || !files.exists(GAMES)) return [];
  var hub;
  try {
    hub = require(GAMES);
  } catch (error) {
    console.warn('rpg: Игротека: ' + error);
    return [];
  }
  if (typeof hub.games !== 'function' || typeof hub.inboxAdd !== 'function') return [];
  var st = read('state.json', {});
  var marks = st.gameBonus || {};
  var out = [];
  var changedMarks = false;
  (hub.games() || []).forEach(function (game) {
    var id = game && game.id;
    if (!id || marks[id]) return;
    var started = false;
    try {
      started = typeof hub.saves === 'function' && (hub.saves(id) || []).length > 0;
    } catch (error) {
      started = false;
    }
    if (started) {
      marks[id] = { at: Date.now(), chests: 0, started: true };
      changedMarks = true;
      return;
    }
    var bonus = exports.gameBonus(id);
    if (!bonus.chests) return;
    var put = 0;
    for (var i = 1; i <= bonus.chests; i++) {
      try {
        if (hub.inboxAdd(id, { id: 'rpg-start-' + i, from: 'rpg', op: 'chest', reason: bonus.reason })) put++;
      } catch (error) {
        console.warn('rpg: бонус игре ' + id + ': ' + error);
      }
    }
    marks[id] = { at: Date.now(), chests: put, level: bonus.level };
    changedMarks = true;
    out.push({ game: id, chests: put });
  });
  if (changedMarks) {
    var fresh = read('state.json', {});
    fresh.gameBonus = marks;
    write('state.json', fresh);
  }
  return out;
};

/** Experience of today so far — shown, not written until the day closes. */
exports.today = function () {
  var s = settings();
  var st = read('state.json', {});
  var day = source.today();
  if (!day) return { date: source.currentDay(), total: 0, entries: [] };
  var goals = source.goals();
  var cells = read('cells.json', {});
  var fromMs = dates.start(day.date, goals.dayEndHour);
  var openToday = {};
  Object.keys(cells).forEach(function (cell) { if (cells[cell] === day.date) openToday[cell] = true; });
  baseRows('visit', fromMs, null).forEach(function (visit) {
    var cell = cellOf(visit.data, s.cells.precision || 7);
    if (cell && (!cells[cell] || cells[cell] === day.date)) openToday[cell] = true;
  });
  var chains = Object.assign({}, st.chains || {});
  var preview = xpMod.trackChains(clone(chains), day, s.freezesPerWeek);
  var made = entriesOf(day, Object.assign({}, st, { chains: preview }), s, goals, Object.keys(openToday).length, newPlaces(day.date, goals));
  var entries = made.entries.concat(achievementEntries(s));
  var total = entries.reduce(function (sum, e) { return sum + e.amount; }, 0);
  return { date: day.date, total: total, entries: entries, bonus: made.bonus, paused: day.paused || null };
};

// ---- quests ---------------------------------------------------------------------------------

function templates() {
  var own = files.readJson(DIR + 'quests.json', null);
  return Array.isArray(own) ? own : clone(require('./quests.json'));
}

function activeQuests() {
  var active = read('active.json', { quests: [], skip: {} });
  if (Array.isArray(active)) active = { quests: active, skip: {} };
  active.quests = active.quests || [];
  active.skip = active.skip || {};
  return active;
}

function habitList() {
  var habits = habitTitles();
  return Object.keys(habits).filter(function (id) { return !habits[id].archived; }).map(function (id) { return { id: id, title: habits[id].title }; });
}

function retitle(made, s) {
  if (!s.quests.model || !made.length) return made;
  try {
    var answer = require('lib/ai').ask({
      role: 'rpg.quests',
      system: 'Перепиши названия квестов в тоне лёгкой фэнтези-игры, по-русски, до 60 знаков каждое. Числа и время не меняй, ' +
        'ничего не добавляй, без упрёков и без эмодзи. Ответ — JSON-объект { id: название }.',
      prompt: JSON.stringify(made.map(function (q) { return { id: q.id, title: q.title }; })),
      json: true
    });
    made.forEach(function (q) {
      var text = answer && answer[q.id] ? String(answer[q.id]).trim().slice(0, 80) : '';
      if (text && chronicle.clean(text) && chronicle.sameNumbers(text, [q.title])) {
        q.plain = q.title;
        q.title = text;
      }
    });
  } catch (error) {
    console.warn('rpg: quests model: ' + error);
  }
  return made;
}

/** Gives the quests of a period if there are none yet (none on a pause day). */
exports.issue = function (date, period) {
  var s = settings();
  date = date || source.currentDay();
  if (!s.quests.on) return [];
  if (source.paused(date)) return [];
  var active = activeQuests();
  var start = period === 'week' ? dates.monday(date) : date;
  var end = period === 'week' ? dates.add(start, 6) : date;
  active.quests = active.quests.filter(function (q) { return dates.diff(q.end, date) >= 0; });
  var have = active.quests.filter(function (q) { return q.period === (period || 'day') && q.start === start; });
  var count = period === 'week' ? s.quests.weekly : s.quests.daily;
  if (have.length >= count) return have;
  var history = source.days(dates.add(date, -Number(s.quests.window || 28)), dates.add(date, -1));
  var picked = quests.pick({
    templates: templates(), history: history, goals: source.goals(), habits: habitList(), period: period || 'day',
    active: have.map(function (q) { return q.template; }), skip: active.skip[start] || [],
    start: start, end: end, count: count - have.length, seed: start + ':' + (period || 'day'), minDays: s.quests.minDays
  });
  picked = retitle(picked, s);
  active.quests = active.quests.concat(picked);
  write('active.json', active);
  if (picked.length) changed();
  return have.concat(picked);
};

/** «Другой»: this quest goes, another of the same period comes. No penalty. */
exports.replace = function (id) {
  var active = activeQuests();
  var quest = active.quests.filter(function (q) { return q.id === id; })[0];
  if (!quest) return [];
  active.skip[quest.start] = (active.skip[quest.start] || []).concat([quest.template]);
  active.quests = active.quests.filter(function (q) { return q.id !== id; });
  write('active.json', active);
  return exports.issue(quest.period === 'week' ? source.currentDay() : quest.start, quest.period);
};

/** «Не сейчас»: the quest just goes away. */
exports.later = function (id) {
  var active = activeQuests();
  var quest = active.quests.filter(function (q) { return q.id === id; })[0];
  if (!quest) return false;
  active.skip[quest.start] = (active.skip[quest.start] || []).concat([quest.template]);
  active.quests = active.quests.filter(function (q) { return q.id !== id; });
  write('active.json', active);
  changed();
  return true;
};

/** At the close of a day: done quests give experience; the ended ones disappear quietly. */
function settle(date, day, s) {
  var active = activeQuests();
  var entries = [];
  var keep = [];
  active.quests.forEach(function (q) {
    if (dates.diff(date, q.start) < 0) { keep.push(q); return; }
    if (day.paused && q.period === 'week') q.end = dates.add(q.end, 1);   // a pause freezes quests
    var days = q.period === 'week' ? source.days(q.start, date) : [day];
    var got = quests.progress(q, days);
    q.progress = got.progress;
    if (got.done && !q.done) {
      q.done = true;
      entries.push({ skill: q.skill || 'quest', amount: Number(q.xp) || 0, reason: 'квест: ' + q.title, ref: 'quest:' + q.id });
      if (q.period === 'week' && s.notify.weeklyQuest) {
        try { assi.notify({ title: 'Квест недели выполнен', text: q.title + ' — +' + q.xp + ' опыта', open: SCREEN }); } catch (error) { /* no notification */ }
      }
    }
    if (dates.diff(q.end, date) > 0) keep.push(q);
  });
  Object.keys(active.skip).forEach(function (start) { if (dates.diff(date, start) > 7) delete active.skip[start]; });
  active.quests = keep;
  write('active.json', active);
  return { entries: entries };
}

/** Active quests with progress as of now (today's preliminary data included). */
exports.questsView = function () {
  var today = source.currentDay();
  var now = source.today();
  return activeQuests().quests.filter(function (q) { return dates.diff(q.end, today) >= 0 && dates.diff(today, q.start) >= 0; }).map(function (q) {
    var days = q.period === 'week' && dates.diff(today, q.start) > 0 ? source.days(q.start, dates.add(today, -1)) : [];
    if (now) days = days.concat([now]);
    var got = quests.progress(q, days);
    return Object.assign({}, q, { progress: got.progress, goal: got.goal, done: q.done || got.done, known: got.known });
  });
};

// ---- the weekly paragraph ---------------------------------------------------------------------

exports.weekParagraph = function (date) {
  var s = settings();
  if (!s.chronicle.model) return { skipped: 'выключено' };
  date = date || source.currentDay();
  var monday = chronicle.week(date);
  var book = read('chronicle.json', { days: {}, weeks: {} });
  var lines = [];
  dates.range(monday, dates.add(monday, 6)).forEach(function (day) { lines = lines.concat(book.days[day] || []); });
  if (!lines.length) return { skipped: 'нет записей' };
  var prompt = chronicle.weekPrompt(lines, heroName(s));
  var text = String(require('lib/ai').ask({ role: 'rpg.chronicle', system: prompt.system, prompt: prompt.prompt }) || '').trim();
  if (!text || !chronicle.clean(text) || !chronicle.sameNumbers(text, lines)) return { skipped: 'текст модели не прошёл проверку' };
  book.weeks[monday] = { text: text.slice(0, 1500), at: Date.now() };
  write('chronicle.json', book);
  changed();
  return { ok: true };
};

// ---- what the screen, the widget and the agent read -------------------------------------------

function changed() {
  try { assi.widget.refresh('rpg'); } catch (error) { /* no widget */ }
  try { emit('rpg.changed', {}); } catch (error) { /* no screens */ }
}

function skillInfo(id, one, s, habits) {
  var main = xpMod.SKILLS.filter(function (k) { return k.id === id; })[0];
  var level = xpMod.level(one.xp || 0, s.skill.base, s.skill.power);
  var shownLevel = Math.max(one.level || 1, level.level);
  var habitId = /^habit:/.test(id) ? id.slice(6) : null;
  var habit = habitId ? habits[habitId] : null;
  return {
    id: id, title: main ? main.title : habit ? habit.title : (habitId || id), icon: main ? main.icon : (habit && habit.icon) || 'book',
    habit: Boolean(habitId), xp: one.xp || 0, level: shownLevel,
    into: (one.xp || 0) - xpMod.threshold(shownLevel, s.skill.base, s.skill.power),
    need: xpMod.threshold(shownLevel + 1, s.skill.base, s.skill.power) - xpMod.threshold(shownLevel, s.skill.base, s.skill.power),
    trait: s.traits[id] && shownLevel >= s.traitLevel ? s.traits[id] : null
  };
}

/** How the creature looks on this screen: the pet's palette and the things it wears. */
function drawing() {
  var pet = files.readJson('data/pet/settings.json', {}) || {};
  var items = files.readJson('data/pet/items.json', []);
  if (items && !Array.isArray(items) && Array.isArray(items.items)) items = items.items;
  return {
    palette: typeof pet.palette === 'string' ? pet.palette : null,
    items: (Array.isArray(items) ? items : []).filter(function (item) { return item && item.worn === true && item.slot; })
      .map(function (item) { return { id: item.id, slot: item.slot }; })
  };
}

/**
 * The creature drawn by «Питомец» itself (its look.js and svg.js), so that the two screens never
 * differ; null when the pet is not installed — the screen then draws it with ui/creature.js.
 */
function petPicture(look, draw, name) {
  if (!files.exists('modules/pet/look.js') || !files.exists('modules/pet/svg.js')) return null;
  try {
    var shaped = require('modules/pet/look.js').look('calm', {
      stage: look.stageIndex, traits: look.traits, palette: draw.palette || 'moss',
      items: draw.items.map(function (item) { return { id: item.id, slot: item.slot, worn: true }; })
    });
    return String(require('modules/pet/svg.js').render(shaped, { room: false, size: 170, label: name }));
  } catch (error) {
    console.warn('rpg: pet picture: ' + error);
    return null;
  }
}

/** Everything the screen draws (the map comes separately: map()). */
exports.view = function () {
  var s = settings();
  var st = read('state.json', {});
  var habits = habitTitles();
  var total = st.total || 0;
  var level = xpMod.level(total, s.level.base, s.level.power);
  var shown = Math.max(st.level || 1, level.level);
  var from = xpMod.threshold(shown, s.level.base, s.level.power);
  var to = xpMod.threshold(shown + 1, s.level.base, s.level.power);
  var skills = st.skills || {};
  var main = xpMod.SKILLS.map(function (k) { return skillInfo(k.id, skills[k.id] || { xp: 0, level: 1 }, s, habits); });
  var habitSkills = Object.keys(skills).filter(function (id) { return /^habit:/.test(id); }).map(function (id) { return skillInfo(id, skills[id], s, habits); })
    .sort(function (a, b) { return b.xp - a.xp; });
  var look = exports.look();
  var draw = drawing();
  var book = read('chronicle.json', { days: {}, weeks: {} });
  var chron = Object.keys(book.days).sort().reverse().slice(0, 60).map(function (date) { return { date: date, lines: book.days[date] }; });
  var weeks = Object.keys(book.weeks || {}).sort().reverse().slice(0, 12).map(function (monday) { return { week: monday, text: book.weeks[monday].text }; });
  // Which sources the last week had: the screen says honestly what gives no experience.
  var sources = { sleep: false, steps: false, screen: false, places: false, spend: false };
  try {
    var today = source.currentDay();
    source.days(dates.add(today, -7), today).forEach(function (day) {
      Object.keys(sources).forEach(function (key) { if (day.known && day.known[key]) sources[key] = true; });
    });
  } catch (error) {
    console.warn('rpg: sources: ' + error);
  }
  return {
    level: shown, total: total, from: from, to: to, pct: to > from ? (total - from) / (to - from) : 1,
    hero: heroName(s), look: look, today: exports.today(), skills: main, habits: habitSkills,
    quests: exports.questsView(), chronicle: chron, weeks: weeks, started: st.started || null, lastClosed: st.lastClosed || null,
    source: source.kind(), sources: sources, pet: Boolean(source.module('pet')), drawing: draw, picture: petPicture(look, draw, heroName(s)), settings: s
  };
};

/** The experience of a skill by day over `days` (90) days — the skill's history bars. */
exports.skillHistory = function (skill, days) {
  var count = Math.max(7, Math.min(730, Number(days) || settings().historyDays || 90));
  var today = source.currentDay();
  var from = dates.add(today, 1 - count);
  var by = {};
  db().query('select day, sum(amount) as xp from xp where skill = ? and day >= ? group by day', [skill, from]).forEach(function (row) { by[row.day] = row.xp; });
  return dates.range(from, today).map(function (date) { return { date: date, xp: by[date] || 0 }; });
};

/** The journal of a day (or the last entries): what experience came from. */
exports.journal = function (date, limit) {
  if (date) return db().query('select day, skill, amount, reason from xp where day = ? order by id', [date]);
  return db().query('select day, skill, amount, reason from xp order by id desc limit ?', [Number(limit) || 50]);
};

/** Rebuilds the state's totals from the journal (levels still never fall). */
exports.rebuild = function () {
  var s = settings();
  var st = read('state.json', {});
  recompute(st, s);
  write('state.json', st);
  return { level: st.level, total: st.total };
};

exports.widget = function () {
  var view = exports.view();
  var lines = ['Ур. ' + view.level + ' · ' + Math.floor(view.pct * 100) + '% до ' + (view.level + 1)];
  var today = view.today;
  if (today.total > 0) {
    var names = [];
    today.entries.slice().sort(function (a, b) { return b.amount - a.amount; }).forEach(function (e) {
      var name = e.skill === 'endurance' && /^шаги/.test(e.reason) ? 'шаги' : e.reason.split(/[:,·]/)[0].trim();
      if (names.indexOf(name) < 0 && names.length < 3) names.push(name);
    });
    lines.push('Сегодня +' + today.total + ': ' + names.join(', '));
  }
  var quest = view.quests.filter(function (q) { return !q.done; })[0];
  if (quest) lines.push('Квест: ' + quest.title + ' (' + Math.round(quest.progress || 0) + '/' + Math.round(quest.goal || quest.target) + ')');
  return { title: 'Жизнь-RPG', text: lines.join('\n'), open: SCREEN };
};

/** For the agent: level, today, quests, what opened this week. */
exports.status = function () {
  var view = exports.view();
  var weekAgo = dates.add(source.currentDay(), -6);
  var map = exports.map();
  return {
    level: view.level, total: view.total, toNext: view.to - view.total, today: { total: view.today.total, from: view.today.entries.map(function (e) { return e.reason + ' +' + e.amount; }) },
    skills: view.skills.map(function (k) { return k.title + ' ' + k.level; }),
    quests: view.quests.map(function (q) { return q.title + (q.done ? ' (выполнен)' : ' (' + Math.round(q.progress || 0) + '/' + Math.round(q.goal || q.target) + ')'); }),
    week: {
      locations: map.locations.filter(function (l) { return dates.diff(l.first, weekAgo) >= 0; }).map(function (l) { return l.name; }),
      cells: map.cells.filter(function (c) { return dates.diff(c.first, weekAgo) >= 0; }).length
    }
  };
};

exports.settings = function () {
  return settings();
};

exports.saveSettings = function (patch) {
  var saved = files.readJson(DIR + 'settings.json', {}) || {};
  merge(saved, patch || {});
  var check = merge(clone(DEFAULTS), saved);
  if (!(check.level.base > 0) || !(check.level.power > 0) || !(check.skill.base > 0) || !(check.skill.power > 0)) throw new Error('Основания и степени формул должны быть больше нуля');
  if (['floor', 'round', 'ceil'].indexOf(check.rounding) < 0) throw new Error('rounding: floor, round или ceil');
  files.writeJson(DIR + 'settings.json', saved);
  schedule();
  changed();
  return settings();
};

// ---- the agent's tool -------------------------------------------------------------------------

var TOOL = [
  '// Written by modules/rpg on start: the agents\' way to Жизнь-RPG.',
  "exports.name = 'rpg';",
  "exports.description = 'Жизнь-RPG: уровень, опыт за сегодня, навыки, квесты, что открыто на этой неделе (status); выдать квесты (quests: period day|week); заменить квест (replace) или отложить (later).';",
  "exports.parameters = { type: 'object', properties: {",
  "  action: { type: 'string', enum: ['status', 'quests', 'replace', 'later', 'today'] },",
  "  period: { type: 'string', enum: ['day', 'week'] },",
  "  id: { type: 'string', description: 'id квеста для replace и later' }",
  "}, required: ['action'] };",
  'exports.run = function (args) {',
  "  if (!require('lib/assi').files.exists('modules/rpg/main.js')) return 'Модуль «Жизнь-RPG» не установлен';",
  "  return require('modules/rpg/main.js').tool(args || {});",
  '};',
  ''
].join('\n');

exports.tool = function (args) {
  switch (args.action) {
    case 'status': return exports.status();
    case 'today': return exports.today();
    case 'quests': return exports.issue(null, args.period || 'day');
    case 'replace': return exports.replace(args.id);
    case 'later': return exports.later(args.id);
  }
  return 'Неизвестное действие: ' + args.action;
};

// ---- start ----------------------------------------------------------------------------------

function schedule() {
  var s = settings();
  job('rpg:quests', { at: s.quests.at }, function () {
    try {
      exports.issue(null, 'day');
      exports.issue(null, 'week');
    } catch (error) {
      console.warn('rpg: quests: ' + error);
    }
  });
  job('rpg:day', { at: s.checkAt }, function () {
    var date = dates.add(source.currentDay(), -1);
    var st = read('state.json', {});
    if (!st.lastClosed || dates.diff(st.lastClosed, date) < 0) exports.catchUp(date);
    bonusesQuietly();
  });
  job('rpg:chronicle', { at: s.chronicle.at }, function () {
    var s2 = settings();
    if (!s2.chronicle.model || dates.weekday(dates.ymd(Date.now())) !== Number(s2.chronicle.day)) return;
    try { exports.weekParagraph(); } catch (error) { console.warn('rpg: chronicle: ' + error); }
  });
}

exports.start = function () {
  if (!files.exists(DIR + 'settings.json')) write('settings.json', {});
  if (!files.exists(DIR + 'quests.json')) write('quests.json', clone(require('./quests.json')));
  db();
  source.hooks([
    { event: 'life.day', path: SELF, fn: 'onDay' },
    { event: 'life.place', path: SELF, fn: 'onPlace' }
  ]);
  schedule();
  source.tool('rpg.js', TOOL);
  spawn(function () {
    try {
      addCells(null, null, settings());
      exports.catchUp(null);
      bonusesQuietly();
    } catch (error) {
      console.error('rpg: first start: ' + error);
    }
  });
  return true;
};
