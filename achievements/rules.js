// The rule language of achievements: definitions are data (data/achievements/list.json), this file
// reads them. Pure: no Android, no native — the engine and node (tests/) run the same code.
//
// A definition:
//   { id, title, text, group, icon, rarity, hidden, tease, negative, tiers, titles, xp, item, rule }
// A rule:
//   day      { when }                                   — one day met the condition
//   streak   { when, days, pause: 'skip'|'break' }      — N days in a row
//   count    { when, times, within }                    — the condition on M days of a window
//   total    { metric, value, within? }                 — a sum over a window or over all time
//   event    { event, where, count?, history? }         — a hook event happened (place.new, mark, grant…)
//   records  { query, count, within? }                  — records of the shared base
//   custom   { fn, … }                                  — a function of custom.js
// `when` — { metric, op, value } or { metric, op, ref: 'otherMetric' } or { all: [...] } / { any: [...] }.
// `tiers` — several steps under one id ([7, 30, 100]); a tier replaces the rule's main number.
var dates = require('./dates.js');

var RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
var RARITY_TITLES = { common: 'обычная', uncommon: 'необычная', rare: 'редкая', epic: 'эпическая', legendary: 'легендарная' };
var TYPES = ['day', 'streak', 'count', 'total', 'event', 'records', 'custom'];
var OPS = ['>=', '>', '<=', '<', '==', '!='];
var EVENTS = ['place.new', 'mark', 'grant', 'subscription.cancel'];
var SLOTS = ['neck', 'head', 'hand', 'shelf'];
var ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

exports.RARITIES = RARITIES;
exports.RARITY_TITLES = RARITY_TITLES;
exports.TYPES = TYPES;
exports.OPS = OPS;
exports.EVENTS = EVENTS;

function num(value) {
  return value === null || value === undefined || value === '' || (typeof value === 'number' && isNaN(value)) ? null : value;
}

function maxOf(object) {
  var best = 0;
  Object.keys(object || {}).forEach(function (key) { var v = Number(object[key]) || 0; if (v > best) best = v; });
  return best;
}

function perfect(day, goals) {
  return day.sleepMin >= goals.sleep && day.steps >= (day.stepsGoal || goals.steps) &&
    (!(day.habitsDue > 0) || day.habitsDone >= day.habitsDue) && (day.waterMl || 0) >= (day.waterGoal || goals.water);
}

/**
 * The metrics a condition can name. `known` — which flag of day.known must be true ('sleep',
 * 'steps', 'screen', 'places', 'spend'), a function, or null (always known: marks, goals; a missing
 * value counts as 0 when `zero`).
 */
var METRICS = {
  sleepMin: { known: 'sleep', title: 'минут сна' },
  sleepQuality: { known: 'sleep', title: 'качество сна' },
  wakeMin: { known: 'sleep', title: 'подъём, минут от полуночи', get: function (d) { return dates.minutes(d.wake); } },
  bedtimeMin: { known: 'sleep', title: 'отбой, минут от полудня', get: function (d) { return dates.night(d.bedtime); } },
  bedtimeLate: { known: 'sleep', title: 'отбой позже цели, мин', get: function (d, g) { var b = dates.night(d.bedtime); return b === null ? null : b - dates.night(g.bedtime); } },
  bedtimeDev: { known: 'sleep', title: 'отклонение отбоя от цели, мин', get: function (d, g) { var b = dates.night(d.bedtime); return b === null ? null : Math.abs(b - dates.night(g.bedtime)); } },
  sleepGoal: { known: null, title: 'цель сна', get: function (d, g) { return g.sleep; } },
  steps: { known: 'steps', title: 'шаги' },
  stepsGoal: { known: null, title: 'цель шагов', get: function (d, g) { return d.stepsGoal || g.steps; } },
  distanceKm: { known: 'steps', title: 'км пешком', get: function (d, g) { return num(d.distanceKm) !== null ? d.distanceKm : (num(d.steps) === null ? null : Math.round(d.steps * g.stride / 100) / 10); } },
  workoutMin: { known: null, zero: true, title: 'минут тренировок' },
  waterMl: { known: null, zero: true, title: 'мл воды' },
  waterGoal: { known: null, title: 'цель воды', get: function (d, g) { return d.waterGoal || g.water; } },
  medsDue: { known: null, zero: true, title: 'приёмов лекарств положено' },
  medsTaken: { known: null, zero: true, title: 'приёмов принято' },
  medsLate: { known: null, zero: true, title: 'приёмов с опозданием' },
  medsAllOnTime: { known: function (d) { return d.medsDue > 0; }, title: 'все лекарства вовремя', get: function (d) { return d.medsTaken >= d.medsDue && !(d.medsLate > 0); } },
  habitsDue: { known: null, zero: true, title: 'привычек положено' },
  habitsDone: { known: null, zero: true, title: 'привычек отмечено' },
  habitsAll: { known: null, title: 'все положенные привычки', get: function (d) { return !(d.habitsDue > 0) || d.habitsDone >= d.habitsDue; } },
  distinctHabits: { known: null, title: 'разных привычек за день', get: function (d) { return (d.habitIds || []).length; } },
  maxChain: { known: null, title: 'самая длинная цепочка привычки', get: function (d) { return maxOf(d.chains); } },
  anyMark: { known: null, title: 'хоть одна отметка', get: function (d) { return (d.habitsDone || 0) > 0 || (d.habitIds || []).length > 0 || (d.waterMl || 0) > 0 || (d.medsTaken || 0) > 0; } },
  screenMin: { known: 'screen', title: 'минут экрана' },
  socialMin: { known: 'screen', title: 'минут соцсетей' },
  unlocks: { known: 'screen', title: 'разблокировок' },
  lateMin: { known: 'screen', title: 'минут экрана в ночном окне' },
  lateAfter2Min: { known: 'screen', title: 'минут экрана после 02:00' },
  maxLaunches: { known: 'screen', title: 'запусков одного приложения', get: function (d) { return d.launches ? maxOf(d.launches) : num(d.maxLaunches); } },
  newPlaces: { known: 'places', title: 'новых мест' },
  newCells: { known: 'places', title: 'новых клеток карты' },
  farthestKm: { known: 'places', title: 'км от дома' },
  homeOnly: { known: 'places', title: 'весь день дома' },
  placesCount: { known: 'places', title: 'мест за день', get: function (d) { return (d.places || []).length; } },
  spend: { known: 'spend', title: 'потрачено' },
  noSpend: { known: 'spend', title: 'день без трат' },
  deliveryLate: { known: 'spend', title: 'поздних доставок еды' },
  budgetOk: { known: 'spend', title: 'в пределах дневного бюджета' },
  focusMin: { known: null, zero: true, title: 'минут фокуса' },
  playMin: { known: null, zero: true, title: 'минут игр' },
  mood: { known: function (d) { return num(d.mood) !== null; }, title: 'самочувствие 1–5' },
  hasData: { known: null, title: 'день с данными', get: function (d) { var k = d.known || {}; return Boolean(k.sleep || k.steps || k.screen || k.places || k.spend || (d.habitIds || []).length || (d.waterMl || 0) > 0); } },
  perfect: { known: function (d) { var k = d.known || {}; return Boolean(k.sleep && k.steps); }, title: 'идеальный день', get: perfect },
  paused: { known: null, title: 'день паузы', get: function (d) { return Boolean(d.paused); } }
};
exports.METRICS = METRICS;

/** { known, value } of a metric on a day. */
function metric(name, day, goals) {
  var spec = METRICS[name];
  if (!spec) return { known: false, value: null };
  var known = true;
  if (typeof spec.known === 'string') known = Boolean(day.known && day.known[spec.known]);
  else if (typeof spec.known === 'function') known = Boolean(spec.known(day, goals));
  if (!known) return { known: false, value: null };
  var value = spec.get ? spec.get(day, goals) : day[name];
  if (num(value) === null) {
    if (spec.zero) return { known: true, value: 0 };
    return { known: false, value: null };
  }
  return { known: true, value: value };
}
exports.metric = metric;

function compare(a, op, b) {
  if (typeof b === 'boolean' || typeof a === 'boolean') {
    a = Boolean(a);
    b = Boolean(b);
    if (op === '==' ) return a === b;
    if (op === '!=') return a !== b;
    a = a ? 1 : 0;
    b = b ? 1 : 0;
  }
  a = Number(a);
  b = Number(b);
  switch (op) {
    case '>=': return a >= b;
    case '>': return a > b;
    case '<=': return a <= b;
    case '<': return a < b;
    case '==': return a === b;
    case '!=': return a !== b;
  }
  return false;
}
exports.compare = compare;

/** A condition on a day: true, false, or null when its data is unknown. */
function test(when, day, goals, value) {
  if (!when) return null;
  if (when.all) {
    var sawNull = false;
    for (var i = 0; i < when.all.length; i++) {
      var part = test(when.all[i], day, goals);
      if (part === false) return false;
      if (part === null) sawNull = true;
    }
    return sawNull ? null : true;
  }
  if (when.any) {
    var unknown = false;
    for (var j = 0; j < when.any.length; j++) {
      var one = test(when.any[j], day, goals);
      if (one === true) return true;
      if (one === null) unknown = true;
    }
    return unknown ? null : false;
  }
  var left = metric(when.metric, day, goals);
  if (!left.known) return null;
  var right;
  if (value !== undefined) right = value;
  else if (when.ref) {
    var ref = metric(when.ref, day, goals);
    if (!ref.known) return null;
    right = ref.value;
  } else right = when.value;
  return compare(left.value, when.op || '>=', right);
}
exports.test = test;

/** Every metric a condition names (for checks and for known-ness). */
function metricsOf(when, into) {
  into = into || [];
  if (!when) return into;
  (when.all || when.any || []).forEach(function (part) { metricsOf(part, into); });
  if (when.metric) into.push(when.metric);
  if (when.ref) into.push(when.ref);
  return into;
}
exports.metricsOf = metricsOf;

/** The numbers of the steps: tiers, or the one main number of the rule. */
function tiersOf(def) {
  if (Array.isArray(def.tiers) && def.tiers.length) return def.tiers.map(Number);
  var rule = def.rule || {};
  switch (rule.type) {
    case 'streak': return [Number(rule.days)];
    case 'count': return [Number(rule.times)];
    case 'total': return [Number(rule.value)];
    case 'records': return [Number(rule.count || 1)];
    case 'event': return [Number(rule.count || 1)];
    case 'custom': return [Number(rule.target || 1)];
    default: return [1];
  }
}
exports.tiersOf = tiersOf;

exports.rarityOf = function (def, tier) {
  var rarity = Array.isArray(def.rarity) ? def.rarity[Math.min(tier || 0, def.rarity.length - 1)] : def.rarity;
  return RARITIES.indexOf(rarity) >= 0 ? rarity : 'common';
};

exports.titleOf = function (def, tier) {
  var count = tiersOf(def).length;
  if (Array.isArray(def.titles) && def.titles[tier || 0]) return def.titles[tier || 0];
  return count > 1 ? def.title + ' ' + ROMAN[tier || 0] : def.title;
};

/** Experience of a tier: the definition's own, or by rarity; teasing ones give none. */
exports.xpOf = function (def, tier, xpByRarity) {
  if (def.tease) return 0;
  if (Array.isArray(def.xp) && def.xp[tier || 0] !== undefined) return Number(def.xp[tier || 0]);
  if (typeof def.xp === 'number') return def.xp;
  var table = xpByRarity || { common: 50, uncommon: 100, rare: 200, epic: 500, legendary: 1000 };
  return Number(table[exports.rarityOf(def, tier)]) || 0;
};

/**
 * One day's verdict for a condition-rule:
 *   'yes' — counts, 'no' — the condition failed (breaks a streak), 'skip' — neither.
 * Unknown data skips. A negative condition («меньше 300 шагов») is never checked on a pause day;
 * on a pause day a met positive condition counts, the rest skip or break by the pause setting.
 */
function verdict(def, day, goals, pauseMode, value) {
  var rule = def.rule || {};
  var negative = Boolean(def.negative || rule.negative);
  if (day.paused) {
    if (!negative) {
      var met = test(rule.when, day, goals, value);
      if (met === true) return 'yes';
    }
    return (rule.pause || pauseMode) === 'break' ? 'no' : 'skip';
  }
  var result = test(rule.when, day, goals, value);
  if (result === null) return 'skip';
  return result ? 'yes' : 'no';
}
exports.verdict = verdict;

function shape(need, metAt) {
  return need.map(function (value, i) { return { need: value, metAt: metAt[i] || null }; });
}

function finish(result) {
  var open = result.tiers.filter(function (tier) { return !tier.metAt; });
  result.target = open.length ? open[0].need : result.tiers[result.tiers.length - 1].need;
  return result;
}

function evalDay(def, days, goals, options) {
  var rule = def.rule;
  var need = tiersOf(def);
  var metAt = [];
  var matched = 0;
  if (Array.isArray(def.tiers) && def.tiers.length && rule.when && rule.when.metric) {
    var op = rule.when.op || '>=';
    var best = null;
    var last = null;
    days.forEach(function (day) {
      if (day.paused && (def.negative || rule.negative)) return;
      var got = metric(rule.when.metric, day, goals);
      if (!got.known) return;
      var v = typeof got.value === 'boolean' ? (got.value ? 1 : 0) : Number(got.value);
      last = v;
      if (best === null || (op.charAt(0) === '<' ? v < best : v > best)) best = v;
      need.forEach(function (tier, i) { if (!metAt[i] && compare(v, op, tier)) metAt[i] = day.date; });
      if (compare(v, op, need[0])) matched++;
    });
    return finish({ progress: last === null ? 0 : last, best: best === null ? 0 : best, tiers: shape(need, metAt), matched: matched });
  }
  days.forEach(function (day) {
    if (verdict(def, day, goals, options.pause) !== 'yes') return;
    matched++;
    if (!metAt[0]) metAt[0] = day.date;
  });
  var done = metAt[0] ? 1 : 0;
  return finish({ progress: done, best: done, tiers: shape([1], metAt), matched: matched });
}

function evalStreak(def, days, goals, options) {
  var need = tiersOf(def);
  var metAt = [];
  var current = 0;
  var best = 0;
  var matched = 0;
  days.forEach(function (day) {
    var v = verdict(def, day, goals, options.pause);
    if (v === 'skip') return;
    if (v === 'no') { current = 0; return; }
    current++;
    matched++;
    if (current > best) best = current;
    need.forEach(function (tier, i) { if (!metAt[i] && current >= tier) metAt[i] = day.date; });
  });
  return finish({ progress: current, best: best, tiers: shape(need, metAt), matched: matched });
}

function evalCount(def, days, goals, options) {
  var rule = def.rule;
  var need = tiersOf(def);
  var within = Number(rule.within) || 30;
  var metAt = [];
  var window = [];
  var best = 0;
  var matched = 0;
  days.forEach(function (day) {
    if (verdict(def, day, goals, options.pause) !== 'yes') return;
    matched++;
    window.push(day.date);
    while (window.length && dates.diff(day.date, window[0]) >= within) window.shift();
    if (window.length > best) best = window.length;
    need.forEach(function (tier, i) { if (!metAt[i] && window.length >= tier) metAt[i] = day.date; });
  });
  var asOf = options.asOf || (days.length ? days[days.length - 1].date : null);
  var progress = asOf ? window.filter(function (date) { return dates.diff(asOf, date) < within; }).length : 0;
  return finish({ progress: progress, best: best, tiers: shape(need, metAt), matched: matched });
}

function amount(def, day, goals) {
  var rule = def.rule;
  if (day.paused && (def.negative || rule.negative)) return 0;
  var got = metric(rule.metric, day, goals);
  if (!got.known) return 0;
  return typeof got.value === 'boolean' ? (got.value ? 1 : 0) : Number(got.value) || 0;
}

function evalTotal(def, days, goals, options) {
  var rule = def.rule;
  var need = tiersOf(def);
  var metAt = [];
  if (rule.within) {
    var within = Number(rule.within);
    var window = [];
    var best = 0;
    var sum = 0;
    days.forEach(function (day) {
      var value = amount(def, day, goals);
      window.push({ date: day.date, value: value });
      sum += value;
      while (window.length && dates.diff(day.date, window[0].date) >= within) sum -= window.shift().value;
      if (sum > best) best = sum;
      need.forEach(function (tier, i) { if (!metAt[i] && sum >= tier) metAt[i] = day.date; });
    });
    return finish({ progress: round(sum), best: round(best), tiers: shape(need, metAt), matched: 0 });
  }
  // All time: what was summed before (acc) plus the days after it.
  var acc = options.acc || { sum: 0, through: null };
  var running = Number(acc.sum) || 0;
  var through = acc.through;
  (options.metBefore || []).forEach(function (date, i) { if (date) metAt[i] = date; });
  days.forEach(function (day) {
    if (through && dates.diff(day.date, through) <= 0) return;
    running += amount(def, day, goals);
    through = day.date;
    need.forEach(function (tier, i) { if (!metAt[i] && running >= tier) metAt[i] = day.date; });
  });
  need.forEach(function (tier, i) { if (!metAt[i] && running >= tier) metAt[i] = through; });
  return finish({ progress: round(running), best: round(running), tiers: shape(need, metAt), matched: 0, acc: { sum: running, through: through } });
}

function round(value) {
  return Math.round(value * 10) / 10;
}

/** Records or events: moments in ms (any order), plus how many came before them (all-time rules). */
function evalMoments(def, times, before, within, now) {
  var need = tiersOf(def);
  var metAt = [];
  var sorted = times.slice().sort(function (a, b) { return a - b; });
  var best = 0;
  if (within) {
    var span = within * 864e5;
    var start = 0;
    sorted.forEach(function (time, i) {
      while (time - sorted[start] >= span) start++;
      var count = i - start + 1;
      if (count > best) best = count;
      need.forEach(function (tier, k) { if (!metAt[k] && count >= tier) metAt[k] = dates.ymd(time); });
    });
    var progress = sorted.filter(function (time) { return (now || Date.now()) - time < span; }).length;
    return finish({ progress: progress, best: best, tiers: shape(need, metAt), matched: sorted.length });
  }
  var base = Number(before) || 0;
  need.forEach(function (tier, k) { if (base >= tier) metAt[k] = 'before'; });
  sorted.forEach(function (time, i) {
    need.forEach(function (tier, k) { if (!metAt[k] && base + i + 1 >= tier) metAt[k] = dates.ymd(time); });
  });
  var total = base + sorted.length;
  return finish({ progress: total, best: total, tiers: shape(need, metAt), matched: sorted.length });
}
exports.evalMoments = evalMoments;

/**
 * Evaluates one definition.
 *   data: { days (normalized, oldest first), goals, pause: 'skip'|'break', asOf,
 *           acc (total over all time), times + before (records/events), custom: fn(def) → result }
 * → { progress, best, target, tiers: [{ need, metAt }], matched, acc? }
 */
exports.evaluate = function (def, data) {
  var rule = def.rule || {};
  var days = data.days || [];
  var goals = data.goals || {};
  switch (rule.type) {
    case 'day': return evalDay(def, days, goals, data);
    case 'streak': return evalStreak(def, days, goals, data);
    case 'count': return evalCount(def, days, goals, data);
    case 'total': return evalTotal(def, days, goals, data);
    case 'records': return evalMoments(def, data.times || [], data.before || 0, rule.within ? Number(rule.within) : 0, data.now);
    case 'event': return evalMoments(def, data.times || [], data.before || 0, rule.within ? Number(rule.within) : 0, data.now);
    case 'custom': {
      var made = data.custom ? data.custom(def) : null;
      if (!made) return finish({ progress: 0, best: 0, tiers: shape(tiersOf(def), []), matched: 0, unknown: true });
      var need = tiersOf(def);
      var metAt = need.map(function (tier, i) { return (made.metAt && made.metAt[i]) || null; });
      return finish({ progress: made.progress || 0, best: made.best === undefined ? made.progress || 0 : made.best, tiers: shape(need, metAt), matched: made.matched || 0, unknown: Boolean(made.unknown) });
    }
  }
  return finish({ progress: 0, best: 0, tiers: shape([1], []), matched: 0 });
};

/** Does an event's data match `where`: every key equal (arrays — any of). */
exports.matches = function (where, data) {
  if (!where) return true;
  data = data || {};
  return Object.keys(where).every(function (key) {
    var want = where[key];
    var have = data[key];
    if (Array.isArray(want)) return want.indexOf(have) >= 0;
    if (want && typeof want === 'object') {
      return Object.keys(want).every(function (op) { return compare(have, op, want[op]); });
    }
    return have === want;
  });
};

/** A records query (as base.find takes it) → a count select over the table `records`. */
exports.recordsSql = function (query, since, until) {
  query = query || {};
  var parts = [];
  var args = [];
  var kinds = query.kinds || (query.kind ? [query.kind] : null);
  if (kinds && kinds.length) {
    parts.push('kind in (' + kinds.map(function () { return '?'; }).join(', ') + ')');
    kinds.forEach(function (kind) { args.push(String(kind).toLowerCase()); });
  }
  if (query.tag) { parts.push('tags like ?'); args.push('%,' + String(query.tag).toLowerCase() + ',%'); }
  if (query.source) { parts.push('source = ?'); args.push(query.source); }
  if (query.text) { parts.push('(title like ? or data like ? or tags like ?)'); args.push('%' + query.text + '%', '%' + query.text + '%', '%' + query.text + '%'); }
  if (since !== undefined && since !== null) { parts.push('at >= ?'); args.push(since); }
  if (until !== undefined && until !== null) { parts.push('at < ?'); args.push(until); }
  return { where: parts.length ? ' where ' + parts.join(' and ') : '', args: args };
};

/**
 * Checks one definition: [] when it is fine, otherwise the problems in words.
 *   ids — ids of the other definitions; custom — names of functions in custom.js.
 */
exports.validate = function (def, ids, custom) {
  var errors = [];
  if (!def || typeof def !== 'object') return ['определение — не объект'];
  var id = def.id;
  if (!id || !/^[a-z0-9][a-z0-9/_.-]*$/.test(String(id))) errors.push('id: строчные латинские буквы, цифры, «-», «/», «_»');
  if (ids && ids.indexOf(id) >= 0) errors.push('id «' + id + '» уже есть');
  if (!def.title) errors.push(id + ': нет title');
  if (!def.group) errors.push(id + ': нет group');
  var rarities = Array.isArray(def.rarity) ? def.rarity : [def.rarity || 'common'];
  rarities.forEach(function (rarity) { if (RARITIES.indexOf(rarity) < 0) errors.push(id + ': неизвестная редкость ' + rarity); });
  if (def.tiers !== undefined) {
    if (!Array.isArray(def.tiers) || !def.tiers.length || def.tiers.some(function (t) { return !(Number(t) > 0); })) errors.push(id + ': tiers — список положительных чисел');
    else if (def.tiers.some(function (t, i) { return i && Number(t) <= Number(def.tiers[i - 1]); })) errors.push(id + ': tiers должны расти');
  }
  if (def.item) {
    if (!def.item.id) errors.push(id + ': у item нет id');
    if (SLOTS.indexOf(def.item.slot) < 0) errors.push(id + ': item.slot — neck, head, hand или shelf');
  }
  var rule = def.rule;
  if (!rule || TYPES.indexOf(rule.type) < 0) {
    errors.push(id + ': rule.type — один из ' + TYPES.join(', '));
    return errors;
  }
  var checkWhen = function (when, where) {
    if (!when) { errors.push(id + ': нет ' + where); return; }
    if (when.all || when.any) {
      var parts = when.all || when.any;
      if (!Array.isArray(parts) || !parts.length) errors.push(id + ': ' + where + '.all/any — непустой список');
      else parts.forEach(function (part, i) { checkWhen(part, where + '[' + i + ']'); });
      return;
    }
    if (!METRICS[when.metric]) errors.push(id + ': неизвестная метрика «' + when.metric + '»');
    if (when.ref && !METRICS[when.ref]) errors.push(id + ': неизвестная метрика ref «' + when.ref + '»');
    if (when.op && OPS.indexOf(when.op) < 0) errors.push(id + ': неизвестная операция «' + when.op + '»');
    if (when.ref === undefined && when.value === undefined && !def.tiers) errors.push(id + ': в условии нет value или ref');
  };
  var positive = function (value, name) { if (!(Number(value) > 0)) errors.push(id + ': ' + name + ' — положительное число'); };
  switch (rule.type) {
    case 'day':
      checkWhen(rule.when, 'when');
      if (def.tiers && !(rule.when && rule.when.metric)) errors.push(id + ': ступени у правила day — только с простым условием { metric, op }');
      break;
    case 'streak':
      checkWhen(rule.when, 'when');
      if (!def.tiers) positive(rule.days, 'days');
      if (rule.pause && ['skip', 'break'].indexOf(rule.pause) < 0) errors.push(id + ': pause — skip или break');
      break;
    case 'count':
      checkWhen(rule.when, 'when');
      if (!def.tiers) positive(rule.times, 'times');
      positive(rule.within, 'within');
      if (!def.tiers && Number(rule.times) > Number(rule.within)) errors.push(id + ': times больше within — не выполнится никогда');
      break;
    case 'total':
      if (!METRICS[rule.metric]) errors.push(id + ': неизвестная метрика «' + rule.metric + '»');
      if (!def.tiers) positive(rule.value, 'value');
      if (rule.within !== undefined) positive(rule.within, 'within');
      break;
    case 'event':
      if (!rule.event) errors.push(id + ': нет event');
      if (rule.count !== undefined) positive(rule.count, 'count');
      break;
    case 'records':
      if (!rule.query || !(rule.query.kind || (rule.query.kinds && rule.query.kinds.length))) errors.push(id + ': query.kind или query.kinds обязательны');
      if (!def.tiers) positive(rule.count, 'count');
      if (rule.within !== undefined) positive(rule.within, 'within');
      break;
    case 'custom':
      if (!rule.fn) errors.push(id + ': нет fn');
      else if (custom && custom.indexOf(rule.fn) < 0) errors.push(id + ': в custom.js нет функции «' + rule.fn + '»');
      break;
  }
  return errors;
};

/** How far along, in words: «19 из 30 дней подряд, лучшая серия 22». */
exports.progressText = function (def, st) {
  var rule = def.rule || {};
  var progress = st && st.progress !== undefined ? st.progress : 0;
  var target = st && st.target !== undefined ? st.target : tiersOf(def)[0];
  var best = st && st.best !== undefined ? st.best : 0;
  // 472 000 из 1 000 000, 2,5 из 5: groups of three with a no-break space, a decimal comma.
  var fmt = function (value) {
    var parts = String(Math.round(Number(value) * 10) / 10).split('.');
    var whole = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
    return parts.length > 1 ? whole + ',' + parts[1] : whole;
  };
  switch (rule.type) {
    case 'streak': return fmt(progress) + ' из ' + fmt(target) + ' дней подряд' + (best > progress ? ', лучшая серия ' + fmt(best) : '');
    case 'count': return fmt(progress) + ' из ' + fmt(target) + ' за ' + rule.within + ' дн.';
    case 'total': return fmt(progress) + ' из ' + fmt(target) + (rule.within ? ' за ' + rule.within + ' дн.' : '');
    case 'records':
    case 'event':
    case 'custom': return fmt(progress) + ' из ' + fmt(target);
    case 'day':
      if (def.tiers) return 'лучшее ' + fmt(best) + ' из ' + fmt(target);
      return progress ? 'выполнено' : 'ещё не было';
  }
  return '';
};

/** Share of the way to the next tier, 0…1. */
exports.ratio = function (def, st) {
  if (!st || !(st.target > 0)) return 0;
  var rule = def.rule || {};
  var value = rule.type === 'day' && def.tiers ? st.best : st.progress;
  return Math.max(0, Math.min(1, (Number(value) || 0) / st.target));
};
