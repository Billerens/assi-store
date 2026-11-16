// Ачивки за жизнь: achievements for real life, checked by themselves from the day summaries of
// «Здоровье», the shared base and hook events; games of the game hub hand theirs in with grant().
// The list is data (data/achievements/list.json, format — AGENT.md); rules.js reads it.
var assi = require('lib/assi');
var files = assi.files;
var source = require('./source.js');
var rules = require('./rules.js');
var custom = require('./custom.js');
var dates = require('./dates.js');

var DIR = 'data/achievements/';
var SELF = 'modules/achievements/main.js';
var SCREEN = 'modules/achievements/ui/index.html';
var OUTBOX = 'data/games/achievements-outbox.json';
var GROUPS = ['Сон', 'Движение', 'Привычки', 'Экран', 'Места', 'Траты', 'Жизнь', 'Игротека'];

var DEFAULTS = {
  xp: { common: 50, uncommon: 100, rare: 200, epic: 500, legendary: 1000 },
  notify: 'all',          // all | visible (не скрытые) | none
  hints: 'none',          // none | group | letter — намёк у скрытых
  tease: true,            // колкие ачивки
  retro: true,            // засчитывать прошлое для новых ачивок
  pause: 'skip',          // дни паузы в сериях: skip | break
  checkAt: '05:20',       // запасная проверка, если «Здоровье» не позвало после закрытия суток
  historyDays: 90,        // сколько дней истории смотреть каждый раз
  allTimeDays: 730,       // глубина первого подсчёта «за всё время»
  gamesRarity: 'common',  // редкость (и опыт) ачивок из игр
  closest: 3,             // сколько показывать в «Ближе всего»
  flavor: false,          // шутливые подписи от модели раз в неделю
  flavorDay: 7,           // день недели подписей (1 — пн … 7 — вс)
  flavorAt: '19:30',
  cardDays: 14,           // карточка на главном: дней в графике полученных
  cardBadges: 6,          // карточка на главном: сколько последних значков отдавать (покажет, сколько влезет)
  home: null             // { lat, lon } для «Рассвета», если в Здоровье нет места «дом»
};

// ---- storage -------------------------------------------------------------------------------

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function settings() {
  var saved = files.readJson(DIR + 'settings.json', {}) || {};
  var out = clone(DEFAULTS);
  Object.keys(saved).forEach(function (key) {
    if (key === 'xp' && saved.xp && typeof saved.xp === 'object') Object.keys(saved.xp).forEach(function (r) { out.xp[r] = Number(saved.xp[r]); });
    else out[key] = saved[key];
  });
  return out;
}

function readList() {
  var list = files.readJson(DIR + 'list.json', []);
  return Array.isArray(list) ? list : [];
}

function writeList(list) {
  files.writeJson(DIR + 'list.json', list);
}

function readState() {
  var state = files.readJson(DIR + 'state.json', {});
  return state && typeof state === 'object' ? state : {};
}

function writeState(state) {
  files.writeJson(DIR + 'state.json', state);
}

function readMeta() {
  return files.readJson(DIR + 'meta.json', {}) || {};
}

function writeMeta(meta) {
  files.writeJson(DIR + 'meta.json', meta);
}

function customNames() {
  return Object.keys(custom).filter(function (name) { return typeof custom[name] === 'function' && name !== 'sunriseUtc'; });
}

function find(list, id) {
  for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
  return null;
}

/** Definitions that take part: not switched off, teasing ones only when allowed. */
function active(def, s) {
  return def && !def.disabled && (!def.tease || s.tease);
}

/** Adds starter achievements that were never offered (an owner's deletion is respected). */
function seed() {
  var meta = readMeta();
  var seeded = meta.seeded || [];
  var list = readList();
  var added = 0;
  clone(require('./starter.json')).forEach(function (def) {
    if (seeded.indexOf(def.id) >= 0) return;
    if (!find(list, def.id)) {
      list.push(def);
      added++;
    }
    seeded.push(def.id);
  });
  if (added || !files.exists(DIR + 'list.json')) writeList(list);
  meta.seeded = seeded;
  writeMeta(meta);
  return added;
}

// ---- data for the rules --------------------------------------------------------------------

function baseDb() {
  require('lib/base');
  return assi.db('base');
}

function rows(kind) {
  return baseDb().query('select id, at, title, data from records where kind = ? order by at', [kind]).map(function (row) {
    var data = null;
    try { data = row.data ? JSON.parse(row.data) : null; } catch (error) { data = null; }
    return { id: row.id, at: row.at, title: row.title, data: data };
  });
}

function context(days, goals, s) {
  var cache = {};
  return {
    days: days,
    goals: goals,
    settings: s,
    dayEndHour: goals.dayEndHour,
    tz: function (date) { return -dates.parse(date).getTimezoneOffset(); },
    places: function () { return cache.places || (cache.places = rows('place')); },
    visits: function () { return cache.visits || (cache.visits = rows('visit')); },
    home: function () {
      if (s.home && s.home.lat !== undefined) return s.home;
      var home = this.places().filter(function (place) { return place.data && place.data.type === 'home'; })[0];
      return home && home.data.lat !== undefined ? { lat: home.data.lat, lon: home.data.lon } : null;
    },
    cells: function () {
      if (cache.cells) return cache.cells;
      var rpg = files.readJson('data/rpg/cells.json', null);
      if (rpg && typeof rpg === 'object' && Object.keys(rpg).length) return (cache.cells = rpg);
      var out = {};
      this.visits().forEach(function (visit) {
        var cell = visit.data && visit.data.cell;
        if (cell && !out[cell]) out[cell] = dates.ymd(visit.at);
      });
      return (cache.cells = Object.keys(out).length ? out : null);
    }
  };
}

/** Adds what the summary may lack: launches per app from the `screen` record of each day. */
function enrich(days, list) {
  var needed = list.some(function (def) { return rules.metricsOf(def.rule && def.rule.when).indexOf('maxLaunches') >= 0; });
  if (!needed || !days.length) return;
  var byDay = {};
  var from = dates.parse(dates.add(days[0].date, -1)).getTime();
  baseDb().query("select at, data from records where kind = 'screen' and at >= ?", [from]).forEach(function (row) {
    try {
      var data = JSON.parse(row.data || '{}');
      byDay[data.day || dates.ymd(row.at)] = data.launches || null;
    } catch (error) { /* a broken record is skipped */ }
  });
  days.forEach(function (day) { if (!day.launches && byDay[day.date]) day.launches = byDay[day.date]; });
}

function recordTimes(query, sinceMs) {
  var base = require('lib/base');
  var asked = Object.assign({}, query || {}, { since: sinceMs, limit: 1000 });
  return base.find(asked).map(function (record) { return record.at; });
}

function recordCount(query, untilMs) {
  var sql = rules.recordsSql(query, null, untilMs);
  var got = baseDb().query('select count(*) as n from records' + sql.where, sql.args);
  return got.length ? Number(got[0].n) || 0 : 0;
}

// ---- evaluation and granting -----------------------------------------------------------------

/**
 * Evaluates one definition against the environment of a check:
 *   env: { days, goals, s, date, since (first day it may count from), historyFrom, ctx, longDays() }
 */
function evaluate(def, st, env) {
  var rule = def.rule || {};
  var from = env.s.retro ? null : st.since;
  var days = from ? env.days.filter(function (day) { return dates.diff(day.date, from) >= 0; }) : env.days;
  var historyMs = dates.parse(from || env.historyFrom).getTime();
  var data = { days: days, goals: env.goals, pause: env.s.pause, asOf: env.date, now: Date.now() };
  if (rule.type === 'total' && !rule.within) {
    if (st.acc) data.acc = st.acc;
    else if (from) data.acc = { sum: 0, through: dates.add(from, -1) };
    else data.days = env.longDays();
  }
  if (rule.type === 'records') {
    data.times = recordTimes(rule.query, historyMs);
    data.before = rule.within || from ? 0 : recordCount(rule.query, historyMs);
  }
  if (rule.type === 'event') {
    data.times = (st.events || []).slice();
    if (rule.history) {
      if (rule.within) data.times = data.times.concat(recordTimes(rule.history, historyMs));
      else data.before = from ? 0 : recordCount(rule.history, null);
    }
  }
  if (rule.type === 'custom') {
    data.custom = function (one) {
      var fn = custom[rule.fn];
      if (typeof fn !== 'function') return null;
      var ctx = env.ctx;
      if (from) ctx = Object.assign({}, ctx, { days: days });
      return fn(ctx, one);
    };
  }
  return rules.evaluate(def, data);
}

function noon(date) {
  var d = dates.parse(date);
  d.setHours(12);
  return d.getTime();
}

/**
 * A thing for the Pet: { id, from, slot, worn, rarity } — rarity of the tier that gave it ('common' …
 * 'legendary'), so the shelf can show what is rare; a Pet that does not know the field ignores it.
 */
function givePetItem(def, tier) {
  if (!def.item || def.tease || (def.item.tier || 0) !== tier) return;
  var item = { id: def.item.id, from: def.id, slot: def.item.slot, worn: false, rarity: rules.rarityOf(def, tier) };
  var pet = source.module('pet');
  try {
    if (pet && typeof pet.give === 'function') return pet.give(item);
    if (pet && typeof pet.addItem === 'function') return pet.addItem(item);
  } catch (error) {
    console.warn('achievements: pet.give: ' + error);
  }
  var path = 'data/pet/items.json';
  var items = files.readJson(path, []);
  if (!Array.isArray(items)) items = [];
  if (items.some(function (one) { return one.id === item.id; })) return;
  items.push(item);
  files.writeJson(path, items);
}

function grantTier(def, tier, at, retro, s, st) {
  st.got = st.got || [];
  if (st.got.some(function (g) { return g.tier === tier; })) return null;
  var xp = rules.xpOf(def, tier, s.xp);
  var rarity = rules.rarityOf(def, tier);
  var title = rules.titleOf(def, tier);
  st.got.push({ tier: tier, at: at, retro: Boolean(retro), seen: false });
  var base = require('lib/base');
  try {
    base.add({
      kind: 'achievement', at: at, title: title, source: 'achievements',
      data: { id: def.id, tier: tier, rarity: rarity, xp: xp, retro: Boolean(retro), source: def.source || 'achievements', tease: Boolean(def.tease) }
    });
  } catch (error) {
    console.error('achievements: base.add: ' + error);
  }
  givePetItem(def, tier);
  if (!def.tease) {
    var pet = source.module('pet');
    try { if (pet && typeof pet.celebrate === 'function') pet.celebrate('achievement', { id: def.id, title: title, rarity: rarity }); } catch (error) { /* the pet may not want it */ }
  }
  return { id: def.id, tier: tier, title: title, text: def.text || '', hidden: Boolean(def.hidden), tease: Boolean(def.tease), retro: Boolean(retro), at: at, xp: xp, rarity: rarity };
}

/** Applies an evaluation: progress into the state, new tiers granted. */
function apply(def, st, result, env, granted) {
  st.progress = result.progress;
  st.target = result.target;
  st.best = Math.max(Number(st.best) || 0, Number(result.best) || 0);
  if (result.unknown) st.unknown = true; else delete st.unknown;
  if (result.acc) st.acc = result.acc;
  result.tiers.forEach(function (tier, i) {
    if (!tier.metAt) return;
    var when = tier.metAt === 'before' ? env.historyFrom : tier.metAt;
    var retro = env.live ? false : dates.diff(env.date, when) > 0;
    var made = grantTier(def, i, retro ? noon(when) : Date.now(), retro, env.s, st);
    if (made) granted.push(made);
  });
}

function notify(granted, s) {
  if (!granted.length || s.notify === 'none') return;
  var shown = s.notify === 'visible' ? granted.filter(function (g) { return !g.hidden; }) : granted;
  if (!shown.length) return;
  var silent = shown.every(function (g) { return g.hidden || g.tease; });
  var retro = shown.every(function (g) { return g.retro; });
  var title;
  var text;
  if (shown.length === 1) {
    var one = shown[0];
    title = 'Получено: ' + one.title;
    text = one.text + (one.retro ? ' — за прошлое, ' + dates.human(dates.ymd(one.at)) : '');
  } else {
    title = (retro ? 'За прошлое получено ачивок: ' : 'Получено ачивок: ') + shown.length;
    text = shown.map(function (g) { return g.title; }).join(', ');
  }
  try {
    assi.notify({ title: title, text: text, open: SCREEN, silent: silent });
  } catch (error) {
    console.warn('achievements: notify: ' + error);
  }
}

function changed() {
  try { assi.widget.refresh('achievements'); } catch (error) { /* no widget */ }
  try { emit('achievements.changed', {}); } catch (error) { /* no screens */ }
}

/**
 * The daily check: every active definition over the history (90 days by default) of day summaries
 * up to `date` (the day just closed). Grants what is met, writes progress. Zero model calls.
 *   options: { only: [ids], quiet: true (no notification) }
 */
exports.check = function (date, options) {
  options = options || {};
  var s = settings();
  date = date || dates.add(source.currentDay(), -1);
  var list = readList().filter(function (def) { return active(def, s) && (!options.only || options.only.indexOf(def.id) >= 0); });
  var state = readState();
  var goals = source.goals();
  var historyFrom = dates.add(date, 1 - Number(s.historyDays || 90));
  var days = source.days(historyFrom, date);
  enrich(days, list);
  var long = null;
  var env = {
    days: days, goals: goals, s: s, date: date, historyFrom: historyFrom, ctx: context(days, goals, s),
    longDays: function () {
      if (!long) {
        var deepFrom = dates.add(date, 1 - Number(s.allTimeDays || 730));
        long = dates.diff(historyFrom, deepFrom) > 0 ? source.days(deepFrom, dates.add(historyFrom, -1)).concat(days) : days;
      }
      return long;
    }
  };
  var granted = [];
  var errors = [];
  list.forEach(function (def) {
    var st = state[def.id] = state[def.id] || {};
    if (!st.since) st.since = date;
    try {
      apply(def, st, evaluate(def, st, env), env, granted);
    } catch (error) {
      errors.push(def.id + ': ' + (error && error.message ? error.message : error));
    }
  });
  writeState(state);
  var meta = readMeta();
  meta.lastChecked = !meta.lastChecked || dates.diff(date, meta.lastChecked) > 0 ? date : meta.lastChecked;
  meta.checkedAt = Date.now();
  meta.source = source.kind();
  meta.placesKnown = days.some(function (day) { return day.known && day.known.places; });
  if (errors.length) meta.errors = errors; else delete meta.errors;
  writeMeta(meta);
  if (!options.quiet) notify(granted, s);
  if (granted.length || !options.quiet) changed();
  return { date: date, granted: granted, errors: errors, days: days.length, source: meta.source };
};

/** Quick check of rules that react to events (no day summaries needed). */
function quick(predicate, event) {
  var s = settings();
  var list = readList().filter(function (def) { return active(def, s) && predicate(def); });
  if (!list.length) return [];
  var state = readState();
  var goals = source.goals();
  var today = source.currentDay();
  var env = { days: [], goals: goals, s: s, date: today, historyFrom: dates.add(today, 1 - Number(s.historyDays || 90)), live: true };
  env.ctx = context([], goals, s);
  env.longDays = function () { return []; };
  var granted = [];
  list.forEach(function (def) {
    var st = state[def.id] = state[def.id] || {};
    if (!st.since) st.since = today;
    if (event && def.rule.type === 'event') {
      st.events = (st.events || []).concat([event.at || Date.now()]).slice(-200);
    }
    try {
      apply(def, st, evaluate(def, st, env), env, granted);
    } catch (error) {
      console.warn('achievements: ' + def.id + ': ' + error);
    }
  });
  writeState(state);
  notify(granted, s);
  if (granted.length) changed();
  return granted;
}

/** Any event another module reports: event('subscription.cancel', { merchant }). */
exports.event = function (name, data) {
  data = data || {};
  return quick(function (def) {
    return def.rule && def.rule.type === 'event' && def.rule.event === name && rules.matches(def.rule.where, data);
  }, { at: Number(data.at) || Date.now() });
};

// ---- hooks of «Здоровье» (data/health/hooks.json) -------------------------------------------

/** life.day: the day is closed — games' outbox, then the full check. */
exports.onDay = function (date) {
  try { exports.drainOutbox(); } catch (error) { console.warn('achievements: outbox: ' + error); }
  return exports.check(typeof date === 'string' ? date : (date && date.date) || null);
};

/** life.mark: a mark of water, a habit, a medicine. */
exports.onMark = function (mark) {
  var data = mark || {};
  if (data.record && typeof data.record === 'object') data = Object.assign({}, data.record, data);
  if (!data.kind && data.type) data.kind = data.type;
  return exports.event('mark', data);
};

/** life.place: a new place — events place.new and the rules about places. */
exports.onPlace = function (place) {
  var data = place || {};
  var got = exports.event('place.new', Object.assign({ hour: dates.hour(Number(data.at) || Date.now()) }, data.data || {}, data));
  return got.concat(quick(function (def) {
    return def.rule && def.rule.type === 'custom' && ['nightPlace', 'regular', 'cells'].indexOf(def.rule.fn) >= 0;
  }));
};

// ---- games of the game hub ------------------------------------------------------------------

function safeId(key) {
  return String(key).toLowerCase().replace(/[^a-z0-9/_.-]+/g, '-').replace(/^[^a-z0-9]+/, '') || 'game';
}

/**
 * An achievement handed in from outside (the game hub, docs/modules/games.md, and other modules —
 * Шляпа, Входящие, Диктофон, Праздники, Траты, Фокус through their achieve.js):
 *   grant({ key: 'games/subway/first-transfer', source: 'games', category: 'Игротека', title, text, at, hidden, icon, rarity })
 * Defines it on first sight (rule `event`, group from category); a definition with id = key already in
 * the list (the starter ones of other modules) is used as it is; the same key again does nothing.
 */
exports.grant = function (item) {
  if (!item || !item.key) throw new Error('grant: нужен key');
  var s = settings();
  var list = readList();
  var id = safeId(item.key);
  var def = find(list, id);
  if (!def) {
    def = {
      id: id, title: String(item.title || id), text: String(item.text || ''), group: String(item.category || 'Игротека'),
      icon: item.icon || 'star', rarity: rules.RARITIES.indexOf(item.rarity) >= 0 ? item.rarity : s.gamesRarity,
      hidden: Boolean(item.hidden), source: String(item.source || 'games'), key: String(item.key),
      rule: { type: 'event', event: 'grant' }, added: dates.ymd(Date.now())
    };
    list.push(def);
    writeList(list);
  }
  var state = readState();
  var st = state[id] = state[id] || {};
  if ((st.got || []).length) return { ok: true, already: true, id: id };
  var at = Number(item.at) || Date.now();
  st.events = (st.events || []).concat([at]);
  st.since = st.since || dates.ymd(at);
  st.progress = 1;
  st.target = 1;
  st.best = 1;
  var made = grantTier(def, 0, at, false, s, st);
  writeState(state);
  if (made) {
    notify([made], s);
    changed();
  }
  return { ok: true, id: id, granted: made };
};

/** Takes what the game hub and other modules left in data/games/achievements-outbox.json while this module was missing. */
exports.drainOutbox = function () {
  if (!files.exists(OUTBOX)) return 0;
  var box = files.readJson(OUTBOX, []);
  var items = Array.isArray(box) ? box : (box && Array.isArray(box.items) ? box.items : []);
  var left = [];
  var taken = 0;
  items.forEach(function (item) {
    try {
      exports.grant(item);
      taken++;
    } catch (error) {
      console.warn('achievements: outbox: ' + error);
      left.push(item);
    }
  });
  if (left.length) files.writeJson(OUTBOX, Array.isArray(box) ? left : Object.assign({}, box, { items: left }));
  else files.remove(OUTBOX);
  return taken;
};

// ---- what the screen, the widget and the agent read -----------------------------------------

function hint(def, s) {
  if (s.hints === 'group') return 'Группа: ' + def.group;
  if (s.hints === 'letter') return 'Начинается на «' + String(def.title || '?').charAt(0) + '»';
  return '';
}

function describe(def, st, s) {
  st = st || {};
  var got = st.got || [];
  var masked = Boolean(def.hidden) && !got.length;
  var need = rules.tiersOf(def);
  var next = need.length;
  for (var i = 0; i < need.length; i++) {
    if (!got.some(function (g) { return g.tier === i; })) { next = i; break; }
  }
  var last = got.slice().sort(function (a, b) { return b.at - a.at; })[0] || null;
  return {
    id: def.id,
    group: def.group,
    icon: masked ? null : def.icon,
    masked: masked,
    hidden: Boolean(def.hidden),
    tease: Boolean(def.tease),
    source: def.source || 'achievements',
    title: masked ? 'Скрытое достижение' : (next < need.length ? rules.titleOf(def, next) : rules.titleOf(def, need.length - 1)),
    baseTitle: masked ? 'Скрытое достижение' : def.title,
    text: masked ? hint(def, s) : (def.text || ''),
    rarity: rules.rarityOf(def, Math.min(next, need.length - 1)),
    tiers: need.map(function (value, i) {
      var g = got.filter(function (one) { return one.tier === i; })[0];
      return {
        title: masked ? null : rules.titleOf(def, i), need: value, rarity: rules.rarityOf(def, i), xp: rules.xpOf(def, i, s.xp),
        got: g ? { at: g.at, retro: Boolean(g.retro) } : null
      };
    }),
    done: got.length >= need.length,
    gotCount: got.length,
    lastAt: last ? last.at : null,
    lastRetro: last ? Boolean(last.retro) : false,
    progress: masked ? null : (st.progress === undefined ? 0 : st.progress),
    target: masked ? null : (st.target === undefined ? need[0] : st.target),
    best: masked ? null : (st.best || 0),
    ratio: masked ? 0 : rules.ratio(def, st),
    progressText: masked ? '' : (st.unknown && !st.progress ? 'пока нет данных' : rules.progressText(def, st)),
    flavor: st.flavor || null,
    unseen: got.filter(function (g) { return !g.seen; }).map(function (g) { return g.tier; })
  };
}

/** The nearest achievements: visible, not finished, the biggest share of the way. */
exports.closest = function (count) {
  var s = settings();
  var state = readState();
  return readList().filter(function (def) { return active(def, s); }).map(function (def) {
    return { def: def, view: describe(def, state[def.id], s) };
  }).filter(function (one) {
    return !one.view.masked && !one.view.done && one.view.ratio > 0;
  }).sort(function (a, b) { return b.view.ratio - a.view.ratio; }).slice(0, count || s.closest || 3).map(function (one) {
    var rule = one.def.rule || {};
    return {
      id: one.view.id, title: one.view.title, group: one.view.group, progress: one.view.progress, target: one.view.target,
      ratio: one.view.ratio, progressText: one.view.progressText,
      daysLeft: rule.type === 'streak' && one.view.progress > 0 ? one.view.target - one.view.progress : null
    };
  });
};

/** What was received in the last `days` days. Hidden ones appear only once received. */
exports.recent = function (days) {
  var since = Date.now() - (Number(days) || 7) * 864e5;
  var state = readState();
  var out = [];
  readList().forEach(function (def) {
    ((state[def.id] || {}).got || []).forEach(function (g) {
      if (g.at >= since) out.push({ id: def.id, title: rules.titleOf(def, g.tier), text: def.text || '', at: g.at, retro: Boolean(g.retro), tease: Boolean(def.tease) });
    });
  });
  return out.sort(function (a, b) { return b.at - a.at; });
};

/** Everything the screen draws. */
exports.view = function () {
  var s = settings();
  var state = readState();
  var meta = readMeta();
  var items = [];
  var total = 0;
  var got = 0;
  var hiddenLeft = 0;
  readList().forEach(function (def) {
    if (def.disabled) return;
    var st = state[def.id] || {};
    var have = (st.got || []).length;
    if (def.tease && !s.tease && !have) return;
    items.push(describe(def, st, s));
  });
  var groups = GROUPS.filter(function (group) { return items.some(function (item) { return item.group === group; }); });
  items.forEach(function (item) { if (groups.indexOf(item.group) < 0) groups.push(item.group); });
  if (!meta.placesKnown) {
    var placesGot = items.some(function (item) { return item.group === 'Места' && item.gotCount; });
    if (!placesGot) {
      groups = groups.filter(function (group) { return group !== 'Места'; });
      items = items.filter(function (item) { return item.group !== 'Места'; });
    }
  }
  // Counted after the hidden group went: the screen and the card add up to the same total.
  items.forEach(function (one) {
    total += one.tiers.length;
    got += one.gotCount;
    if (one.masked) hiddenLeft += one.tiers.length;
  });
  return {
    total: total, got: got, hiddenLeft: hiddenLeft, items: items, groups: groups,
    closest: exports.closest(s.closest).map(function (one) { return one.id; }),
    source: meta.source || source.kind(), checkedAt: meta.checkedAt || null, lastChecked: meta.lastChecked || null,
    placesKnown: Boolean(meta.placesKnown), errors: meta.errors || [], settings: s
  };
};

/** The screen showed these received tiers: they stop being «new». */
exports.seen = function (ids) {
  var state = readState();
  Object.keys(state).forEach(function (id) {
    if (ids && ids.indexOf(id) < 0) return;
    (state[id].got || []).forEach(function (g) { g.seen = true; });
  });
  writeState(state);
  return true;
};

/** For the agent: counts, what was received, what is near. Hidden ones only as a number. */
exports.summary = function () {
  var view = exports.view();
  return {
    got: view.got, total: view.total, hiddenLeft: view.hiddenLeft,
    recent: exports.recent(7), closest: exports.closest(3), source: view.source, lastChecked: view.lastChecked
  };
};

/**
 * What the home card (ui/card.html) draws, in one call: the count and the share, received by rarity,
 * the latest badges, the nearest one and how many came each day of the last `cardDays` days.
 */
exports.cardData = function () {
  var s = settings();
  var view = exports.view();
  var span = Math.max(1, Math.min(60, Math.round(Number(s.cardDays) || 14)));
  var byRarity = {};
  rules.RARITIES.forEach(function (r) { byRarity[r] = { id: r, title: rules.RARITY_TITLES[r], got: 0, total: 0 }; });
  var today = dates.ymd(Date.now());
  var perDay = {};
  var weekFrom = Date.now() - 7 * 864e5;
  var week = 0;
  view.items.forEach(function (item) {
    item.tiers.forEach(function (tier) {
      var one = byRarity[tier.rarity] || byRarity.common;
      one.total++;
      if (!tier.got) return;
      one.got++;
      var day = dates.ymd(tier.got.at);
      perDay[day] = (perDay[day] || 0) + 1;
      if (tier.got.at >= weekFrom) week++;
    });
  });
  var daily = [];
  for (var i = span - 1; i >= 0; i--) {
    var date = dates.add(today, -i);
    daily.push({ date: date, count: perDay[date] || 0 });
  }
  var latest = view.items.filter(function (item) { return item.lastAt; })
    .sort(function (a, b) { return b.lastAt - a.lastAt; })
    .slice(0, Math.max(0, Math.round(Number(s.cardBadges) || 0)))
    .map(function (item) {
      var last = item.tiers.filter(function (tier) { return tier.got; }).pop() || item.tiers[0];
      return {
        id: item.id, title: last.title, group: item.group, icon: item.icon, rarity: last.rarity, masked: false,
        gotCount: item.gotCount, tiers: item.tiers.map(function (tier) { return { rarity: tier.rarity, got: Boolean(tier.got) }; }), at: item.lastAt
      };
    });
  var near = exports.closest(1)[0] || null;
  return {
    got: view.got, total: view.total, hiddenLeft: view.hiddenLeft,
    percent: view.total ? Math.round(view.got * 100 / view.total) : 0,
    week: week, rarity: rules.RARITIES.map(function (r) { return byRarity[r]; }),
    latest: latest, daily: daily,
    closest: near ? { title: near.title, ratio: near.ratio, progressText: near.progressText } : null
  };
};

exports.widget = function () {
  var view = exports.view();
  var lines = ['Ачивки ' + view.got + ' / ' + view.total];
  var last = view.items.filter(function (item) { return item.lastAt; }).sort(function (a, b) { return b.lastAt - a.lastAt; })[0];
  if (last) lines.push('Последняя: ' + (last.tiers.filter(function (t) { return t.got; }).pop() || {}).title);
  var near = exports.closest(1)[0];
  if (near) lines.push('Ближе всего: ' + near.title + ' — ' + near.progress + '/' + near.target);
  return { title: 'Ачивки', text: lines.join('\n'), open: SCREEN };
};

// ---- settings and definitions (the screen and the agent) -------------------------------------

exports.settings = function () {
  return settings();
};

var CHOICES = { notify: ['all', 'visible', 'none'], hints: ['none', 'group', 'letter'], pause: ['skip', 'break'] };

exports.saveSettings = function (patch) {
  var saved = files.readJson(DIR + 'settings.json', {}) || {};
  Object.keys(patch || {}).forEach(function (key) {
    if (!(key in DEFAULTS)) throw new Error('Нет такой настройки: ' + key);
    var value = patch[key];
    if (CHOICES[key] && CHOICES[key].indexOf(value) < 0) throw new Error(key + ': одно из ' + CHOICES[key].join(', '));
    if (key === 'gamesRarity' && rules.RARITIES.indexOf(value) < 0) throw new Error('gamesRarity: одна из ' + rules.RARITIES.join(', '));
    if (key === 'checkAt' || key === 'flavorAt') {
      if (!/^\d{2}:\d{2}$/.test(String(value))) throw new Error(key + ': время ЧЧ:ММ');
    }
    if (key === 'xp') {
      var xp = Object.assign({}, saved.xp || {});
      Object.keys(value || {}).forEach(function (r) {
        if (rules.RARITIES.indexOf(r) < 0) throw new Error('xp: неизвестная редкость ' + r);
        xp[r] = Math.max(0, Number(value[r]) || 0);
      });
      value = xp;
    }
    saved[key] = value;
  });
  files.writeJson(DIR + 'settings.json', saved);
  if (patch && (patch.checkAt || patch.flavorAt || patch.flavor !== undefined)) schedule();
  changed();
  return settings();
};

/** The definitions as they are stored. */
exports.list = function () {
  return readList();
};

/** Checks every definition: [] when all are fine. Used by checks.js after every agent's turn. */
exports.validate = function () {
  var ids = [];
  var errors = [];
  var names = customNames();
  readList().forEach(function (def) {
    errors = errors.concat(rules.validate(def, ids, names));
    ids.push(def && def.id);
  });
  return errors;
};

/**
 * A dry run of a definition over the history: is it valid, what would be granted and when,
 * on how many days its condition held («по истории выдастся N раз»).
 */
exports.preview = function (entry) {
  var list = readList().filter(function (def) { return def.id !== entry.id; });
  var errors = rules.validate(entry, list.map(function (def) { return def.id; }), customNames());
  if (errors.length) return { ok: false, errors: errors };
  var s = settings();
  var date = dates.add(source.currentDay(), -1);
  var historyFrom = dates.add(date, 1 - Number(s.historyDays || 90));
  var days = source.days(historyFrom, date);
  enrich(days, [entry]);
  var goals = source.goals();
  var env = { days: days, goals: goals, s: Object.assign({}, s, { retro: true }), date: date, historyFrom: historyFrom, ctx: context(days, goals, s), longDays: function () { return days; } };
  var result = evaluate(entry, {}, env);
  return {
    ok: true, errors: [], matched: result.matched, progress: result.progress, best: result.best, target: result.target,
    progressText: rules.progressText(entry, result),
    wouldGrant: result.tiers.map(function (tier, i) { return { title: rules.titleOf(entry, i), need: tier.need, at: tier.metAt === 'before' ? historyFrom : tier.metAt }; })
      .filter(function (tier) { return tier.at; }),
    retro: s.retro
  };
};

/** Adds (or replaces) a definition after checking it, and checks it at once over the history. */
exports.define = function (entry) {
  var preview = exports.preview(entry);
  if (!preview.ok) return preview;
  var list = readList().filter(function (def) { return def.id !== entry.id; });
  var def = clone(entry);
  def.added = def.added || dates.ymd(Date.now());
  list.push(def);
  writeList(list);
  var checked = exports.check(null, { only: [def.id] });
  preview.granted = checked.granted;
  return preview;
};

/** Switches a definition off (received tiers stay: achievements are never taken back). */
exports.disable = function (id, off) {
  var list = readList();
  var def = find(list, id);
  if (!def) throw new Error('Нет ачивки ' + id);
  if (off === false) delete def.disabled; else def.disabled = true;
  writeList(list);
  changed();
  return true;
};

// ---- playful captions (optional model) ---------------------------------------------------------

var BANNED = ['ленив', 'стыд', 'позор', 'опять', 'снова не', 'плохо', 'должен', 'обязан', 'виноват'];

exports.flavor = function () {
  var s = settings();
  if (!s.flavor) return { skipped: 'выключено' };
  var fresh = exports.recent(7).filter(function (one) { return !one.tease; });
  if (!fresh.length) return { skipped: 'нечего подписывать' };
  var ai = require('lib/ai');
  var answer = ai.ask({
    role: 'achievements.flavor',
    system: 'Ты пишешь короткие шутливые подписи к достижениям владельца. По-русски, одна фраза до 80 знаков на каждое. ' +
      'Без упрёков, без советов о здоровье, без эмодзи. Ответ — JSON-объект { id: подпись }.',
    prompt: JSON.stringify(fresh.map(function (one) { return { id: one.id, title: one.title, text: one.text }; })),
    json: true
  });
  var state = readState();
  var written = 0;
  Object.keys(answer || {}).forEach(function (id) {
    var text = String(answer[id] || '').trim().slice(0, 120);
    if (!text || !state[id]) return;
    var low = text.toLowerCase();
    if (BANNED.some(function (word) { return low.indexOf(word) >= 0; })) return;
    state[id].flavor = text;
    written++;
  });
  writeState(state);
  changed();
  return { written: written };
};

// ---- the agent's tool -----------------------------------------------------------------------

var TOOL = [
  '// Written by modules/achievements on start: the agents\' way to the achievements.',
  "exports.name = 'achievements';",
  "exports.description = 'Ачивки за жизнь: что получено (summary, recent), что ближе всего (closest), проверить и добавить ачивку (preview, add — формат в modules/achievements/AGENT.md), выключить (disable), настройки (settings: tease, notify, hints…). Скрытые до получения не раскрываются.';",
  'exports.parameters = { type: \'object\', properties: {',
  "  action: { type: 'string', enum: ['summary', 'recent', 'closest', 'preview', 'add', 'disable', 'enable', 'settings', 'check'] },",
  "  days: { type: 'number', description: 'для recent: за сколько дней' },",
  "  entry: { type: 'object', description: 'определение ачивки для preview и add' },",
  "  id: { type: 'string', description: 'для disable и enable' },",
  "  settings: { type: 'object', description: 'для settings: что поменять, например { tease: false }' }",
  "}, required: ['action'] };",
  'exports.run = function (args) {',
  "  if (!require('lib/assi').files.exists('modules/achievements/main.js')) return 'Модуль «Ачивки» не установлен';",
  "  return require('modules/achievements/main.js').tool(args || {});",
  '};',
  ''
].join('\n');

exports.tool = function (args) {
  switch (args.action) {
    case 'summary': return exports.summary();
    case 'recent': return exports.recent(args.days || 7);
    case 'closest': return exports.closest(3);
    case 'preview': return exports.preview(args.entry || {});
    case 'add': return exports.define(args.entry || {});
    case 'disable': return exports.disable(args.id, true);
    case 'enable': return exports.disable(args.id, false);
    case 'settings': return args.settings ? exports.saveSettings(args.settings) : settings();
    case 'check': return exports.check(null);
  }
  return 'Неизвестное действие: ' + args.action;
};

// ---- start -------------------------------------------------------------------------------------

function schedule() {
  var s = settings();
  job('achievements:day', { at: s.checkAt }, function () {
    var date = dates.add(source.currentDay(), -1);
    var meta = readMeta();
    if (meta.lastChecked && dates.diff(meta.lastChecked, date) >= 0) return;
    exports.onDay(date);
  });
  if (s.flavor) {
    job('achievements:flavor', { at: s.flavorAt }, function () {
      if (dates.weekday(dates.ymd(Date.now())) !== Number(settings().flavorDay)) return;
      try { exports.flavor(); } catch (error) { console.warn('achievements: flavor: ' + error); }
    });
  } else {
    try { unjob('achievements:flavor'); } catch (error) { /* was not there */ }
  }
}

exports.start = function () {
  if (!files.exists(DIR + 'settings.json')) files.writeJson(DIR + 'settings.json', {});
  seed();
  source.hooks([
    { event: 'life.day', path: SELF, fn: 'onDay' },
    { event: 'life.mark', path: SELF, fn: 'onMark' },
    { event: 'life.place', path: SELF, fn: 'onPlace' }
  ]);
  schedule();
  source.tool('achievements.js', TOOL);
  try { exports.drainOutbox(); } catch (error) { console.warn('achievements: outbox: ' + error); }
  if (!readMeta().lastChecked) {
    spawn(function () {
      try { exports.check(null); } catch (error) { console.error('achievements: first check: ' + error); }
    });
  }
  return true;
};
