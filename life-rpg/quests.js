// Quests of Жизнь-RPG: templates (data/rpg/quests.json) turn into goals the owner can reach,
// counted from his own median of the last 28 days; done or not is read from the day summaries.
// No penalties: an unfinished quest simply disappears. Pure: no Android.
var dates = require('./dates.js');

/** Values the quests read from a day summary: { known, value }. */
var METRICS = {
  steps: { known: 'steps' },
  sleepMin: { known: 'sleep' },
  bedtimeMin: { known: 'sleep', get: function (d) { return dates.night(d.bedtime); } },
  waterMl: { zero: true },
  lateMin: { known: 'screen' },
  socialMin: { known: 'screen' },
  screenMin: { known: 'screen' },
  workoutMin: { zero: true },
  focusMin: { zero: true },
  noSpend: { known: 'spend' },
  newPlaces: { known: 'places' },
  newCells: { known: 'places' },
  habitsDone: { zero: true }
};
exports.METRICS = METRICS;

exports.value = function (metric, day) {
  if (!day) return { known: false, value: null };
  if (/^habit:/.test(metric)) {
    var id = metric.slice(6);
    return { known: true, value: (day.habitIds || []).indexOf(id) >= 0 ? 1 : 0 };
  }
  var spec = METRICS[metric];
  if (!spec) return { known: false, value: null };
  if (spec.known && !(day.known && day.known[spec.known])) return { known: false, value: null };
  var value = spec.get ? spec.get(day) : day[metric];
  if (value === null || value === undefined || (typeof value === 'number' && isNaN(value))) {
    return spec.zero ? { known: true, value: 0 } : { known: false, value: null };
  }
  return { known: true, value: typeof value === 'boolean' ? (value ? 1 : 0) : Number(value) };
};

exports.median = function (values) {
  var list = values.filter(function (v) { return typeof v === 'number' && !isNaN(v); }).sort(function (a, b) { return a - b; });
  if (!list.length) return null;
  var mid = Math.floor(list.length / 2);
  return list.length % 2 ? list[mid] : (list[mid - 1] + list[mid]) / 2;
};

function goalOf(metric, goals) {
  switch (metric) {
    case 'steps': return goals.steps;
    case 'sleepMin': return goals.sleep;
    case 'bedtimeMin': return dates.night(goals.bedtime || '00:00');
    case 'waterMl': return goals.water;
    case 'socialMin': return goals.socialLimit || 90;
    case 'screenMin': return goals.screenLimit || 240;
  }
  return null;
}

/**
 * The number a template's target means: a number, or 'median+1000', 'median*7+5000', 'goal',
 * 'goal-30' — computed from the owner's own days. null when there is too little data.
 */
exports.target = function (template, history, goals, minDays) {
  var target = template.target;
  if (typeof target === 'number' || typeof target === 'boolean') return Number(target);
  var match = /^(median|goal)((?:[+\-*]\d+(?:\.\d+)?)*)$/.exec(String(target).replace(/\s+/g, ''));
  if (!match) return null;
  var value;
  if (match[1] === 'goal') {
    value = goalOf(template.metric, goals || {});
  } else {
    var values = (history || []).map(function (day) { return exports.value(template.metric, day); })
      .filter(function (got) { return got.known; }).map(function (got) { return got.value; });
    if (values.length < (minDays || 7)) return null;
    value = exports.median(values);
  }
  if (value === null || value === undefined) return null;
  (match[2].match(/[+\-*]\d+(?:\.\d+)?/g) || []).forEach(function (step) {
    var n = Number(step.slice(1));
    if (step.charAt(0) === '+') value += n;
    else if (step.charAt(0) === '-') value -= n;
    else value *= n;
  });
  var round = template.round || (Math.abs(value) >= 1000 ? 100 : Math.abs(value) >= 100 ? 10 : 1);
  value = Math.round(value / round) * round;
  if (template.min !== undefined) value = Math.max(template.min, value);
  if (template.max !== undefined) value = Math.min(template.max, value);
  return value;
};

function compare(a, op, b) {
  switch (op) {
    case '>': return a > b;
    case '<': return a < b;
    case '<=': return a <= b;
    case '==': return a === b;
    default: return a >= b;
  }
}

/** A quest's title with its number: «Пройти 9 400 шагов», «Отбой до 23:30». */
exports.title = function (template, target, extra) {
  var shown = template.format === 'time' ? dates.hhmm(target - 12 * 60) : String(Math.round(target)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return String(template.title).replace('{target}', shown).replace('{habit}', (extra && extra.habit) || '').replace('{times}', template.times || '');
};

/** Makes an active quest from a template. */
exports.make = function (template, target, start, end, extra) {
  var metric = template.metric === 'habit' && extra && extra.habitId ? 'habit:' + extra.habitId : template.metric;
  return {
    id: template.id + ':' + start + (extra && extra.habitId ? ':' + extra.habitId : ''),
    template: template.id, title: exports.title(template, target, extra), metric: metric, op: template.op || '>=',
    target: target, period: template.period || 'day', agg: template.agg || null, times: template.times || null,
    start: start, end: end, skill: extra && extra.habitId && template.skill === 'habit' ? 'habit:' + extra.habitId : template.skill,
    xp: template.xp, progress: 0, done: false
  };
};

/**
 * Progress of a quest over the days it covers: { progress, goal, done, known }.
 * Day quests: the value on its day. Week quests: agg 'sum' adds the values, agg 'days' counts the
 * days that met the target (and needs `times` of them).
 */
exports.progress = function (quest, days) {
  var own = (days || []).filter(function (day) { return dates.diff(day.date, quest.start) >= 0 && dates.diff(quest.end, day.date) >= 0; });
  if (quest.period !== 'week' || !quest.agg) {
    var day = own[own.length - 1];
    var got = exports.value(quest.metric, day);
    if (!got.known) return { progress: 0, goal: quest.target, done: false, known: false };
    return { progress: got.value, goal: quest.target, done: compare(got.value, quest.op, quest.target), known: true };
  }
  if (quest.agg === 'days') {
    var count = own.filter(function (d) { var v = exports.value(quest.metric, d); return v.known && compare(v.value, quest.op, quest.target); }).length;
    return { progress: count, goal: quest.times, done: count >= quest.times, known: own.length > 0 };
  }
  var total = own.reduce(function (sum, d) { var v = exports.value(quest.metric, d); return sum + (v.known ? v.value : 0); }, 0);
  return { progress: total, goal: quest.target, done: compare(total, quest.op, quest.target), known: own.length > 0 };
};

function imul(a, b) {
  var ah = (a >>> 16) & 0xffff;
  var al = a & 0xffff;
  var bh = (b >>> 16) & 0xffff;
  var bl = b & 0xffff;
  return (al * bl + (((ah * bl + al * bh) << 16) >>> 0)) | 0;
}

/** A tiny steady random from a string: the same day picks the same quests. */
function seeded(seed) {
  var h = 2166136261;
  String(seed).split('').forEach(function (ch) { h = imul(h ^ ch.charCodeAt(0), 16777619) >>> 0; });
  return function () {
    h = imul(h ^ (h >>> 15), 2246822507) >>> 0;
    h = imul(h ^ (h >>> 13), 3266489909) >>> 0;
    h = (h ^ (h >>> 16)) >>> 0;
    return h / 4294967296;
  };
}

/**
 * Picks up to `count` quests of a period: templates whose target can be computed, not already
 * active, not put aside, different skills first.
 *   env: { templates, history, goals, habits: [{ id, title }], active: [ids of templates], skip: [ids],
 *          period, start, end, count, seed, minDays }
 */
exports.pick = function (env) {
  var random = seeded(env.seed || env.start);
  var pool = (env.templates || []).filter(function (t) {
    return (t.period || 'day') === env.period && (env.active || []).indexOf(t.id) < 0 && (env.skip || []).indexOf(t.id) < 0 && t.enabled !== false;
  });
  var made = [];
  pool.forEach(function (template) {
    if (template.metric === 'habit') {
      (env.habits || []).forEach(function (habit) {
        var history = (env.history || []).filter(function (day) { return (day.habitIds || []).length; });
        var share = history.filter(function (day) { return day.habitIds.indexOf(habit.id) >= 0; }).length / Math.max(1, (env.history || []).length);
        if (share > 0.9) return;   // already a daily habit: nothing to quest for
        made.push(exports.make(template, 1, env.start, env.end, { habitId: habit.id, habit: habit.title }));
      });
      return;
    }
    // A goal the owner's data cannot show is no quest: the metric must be known on a few days,
    // and for activities (workouts, focus) the owner must actually do them sometimes.
    var seen = (env.history || []).map(function (day) { return exports.value(template.metric, day); });
    if (seen.filter(function (got) { return got.known; }).length < (template.needKnown || 3)) return;
    if (template.needActive && seen.filter(function (got) { return got.known && got.value > 0; }).length < template.needActive) return;
    var target = exports.target(template, env.history, env.goals, env.minDays);
    if (target === null) return;
    made.push(exports.make(template, target, env.start, env.end));
  });
  var shuffled = made.map(function (q) { return { q: q, r: random() }; }).sort(function (a, b) { return a.r - b.r; }).map(function (x) { return x.q; });
  var chosen = [];
  var skills = [];
  shuffled.forEach(function (q) {
    if (chosen.length >= env.count) return;
    var skill = /^habit:/.test(q.skill) ? 'habit' : q.skill;
    if (skills.indexOf(skill) >= 0) return;
    chosen.push(q);
    skills.push(skill);
  });
  shuffled.forEach(function (q) {
    if (chosen.length < env.count && chosen.indexOf(q) < 0) chosen.push(q);
  });
  return chosen;
};
