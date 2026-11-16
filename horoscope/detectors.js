// Detectors of «Гороскоп по данным»: patterns in the owner's days that make a forecast come true.
// Each prediction is { id, detector, kind, tone, params, check, confidence }; the words come later
// (text.js). Pure: days, records and extras come in as arguments, nothing here touches Android.
var dates = require('./dates.js');

exports.DEFAULTS = {
  n: 4,                    // the last n same weekdays…
  k: 3,                    // …of which k must show the pattern
  count: 3,                // predictions a day (2–4)
  noRepeat: 2,             // the same prediction at most this many days in a row
  window: 56,              // days of history
  deliveryHour: 22,        // «доставка после 22:00»
  deliveryTag: 'доставка еды',
  cafeTag: 'кафе и рестораны',
  cafeHour: 10,            // «кафе по утрам» — before 10:00
  lateMin: 15,             // «экран ночью» — at least 15 minutes after the late hour
  sleepNights: 3,
  sleepDebt: 120,          // minutes of debt over those nights
  trendPct: 15,            // steps of 7 days above the 7 before by 15%+
  trendKnown: 5,           // known days in each of the two weeks
  chainSoon: 3,            // a round chain within 3 days
  chainRound: [7, 10, 14, 21, 30, 40, 50, 60, 75, 100, 150, 200, 250, 300, 365, 500, 1000],
  achievementDays: 3,      // an achievement 1–3 days away
  rpgDays: 6,              // a level within 6 days
  holidayDays: 3,          // a holiday of Праздники within 3 days
  focusMin: 25,            // «фокус по четвергам» — at least 25 minutes of Фокус that day
  focusAttempts: 3,        // «попытки отвлечься» — at least 3 in the day's sessions
  focusSplitHour: 13,      // sessions before and after 13:00 are compared…
  focusSessions: 4,        // …when each side has at least 4 sessions…
  focusRatio: 1.5,         // …and one side's usual session is 1.5 times longer
  confidence: { chain: 0.75, achievement: 0.7, sleepDebt: 0.62, trend: 0.6, rpgToday: 0.7, rpgWeek: 0.5, calendar: 0.35,
    holidayToday: 0.9, holidaySoon: 0.45, focusHours: 0.55 }
};

var PAUSE_DROP = ['steps', 'sleep', 'screen', 'focus'];

function median(values) {
  var list = values.filter(function (v) { return typeof v === 'number' && !isNaN(v); }).sort(function (a, b) { return a - b; });
  if (!list.length) return null;
  var mid = Math.floor(list.length / 2);
  return list.length % 2 ? list[mid] : (list[mid - 1] + list[mid]) / 2;
}
exports.median = median;

function known(day, key) {
  return Boolean(day && day.known && day.known[key]);
}

function before(days, date) {
  return days.filter(function (day) { return day && day.date && dates.diff(date, day.date) > 0; });
}

/** The last n days of the same weekday as `date`, not on pause, where `ok(day)` (the data is known). */
function sameWeekdays(days, date, n, ok) {
  var weekday = dates.weekday(date);
  return before(days, date).filter(function (day) { return dates.weekday(day.date) === weekday && !day.paused && ok(day); }).slice(-n);
}

function dayOf(at, dayEndHour) {
  return dates.current(at, dayEndHour);
}

/** Sessions of Фокус among records. */
function focusOf(list) {
  return (list || []).filter(function (r) { return r.kind === 'focus'; });
}

function focusMinutes(list) {
  return list.reduce(function (sum, r) { return sum + (Number(r.amount) || 0); }, 0);
}

function focusAttempts(list) {
  return list.reduce(function (sum, r) { return sum + (Number((r.data || {}).blockedAttempts) || 0); }, 0);
}

/** 'before' for a session started from the day's end hour to `split`, otherwise 'after'. */
function focusPart(at, split, endHour) {
  var hour = dates.hour(at);
  return hour >= endHour && hour < split ? 'before' : 'after';
}

function tagged(record, tag) {
  return (record.tags || []).some(function (item) { return String(item).toLowerCase() === String(tag).toLowerCase(); });
}

/** Records grouped by the owner's day: { date: [records] }. */
function byDay(records, dayEndHour) {
  var out = {};
  (records || []).forEach(function (record) {
    var date = dayOf(record.at, dayEndHour);
    (out[date] = out[date] || []).push(record);
  });
  return out;
}
exports.byDay = byDay;

function weekdayPattern(spec, list, test, s) {
  if (list.length < s.n) return null;
  var k = list.filter(test).length;
  if (k < s.k) return null;
  return {
    id: spec.id, detector: spec.detector, kind: spec.kind, tone: spec.tone, check: spec.check,
    confidence: k / list.length, params: Object.assign({ k: k, n: list.length }, spec.params || {})
  };
}

/**
 * All candidate predictions for `date`.
 *   env: { date, days (summaries before date, oldest first), today (summary of date so far),
 *          records (expense, play… of the window), goals, places: { id: { title, type } },
 *          habits: { id: title }, extras: { achievements: [{ id, title, daysLeft, progress }],
 *          rpg: { level, toNext, perDay }, calendar: [{ begin }],
 *          holiday: { today: { id, title } | null, soon: { id, title, inDays } | null } (Праздники),
 *          focus: false when Фокус is not installed }, settings }
 *   records may hold `focus` sessions of Фокус: { at, amount (minutes), data: { blockedAttempts } }.
 */
exports.candidates = function (env) {
  var s = Object.assign({}, exports.DEFAULTS, env.settings || {});
  s.confidence = Object.assign({}, exports.DEFAULTS.confidence, (env.settings || {}).confidence || {});
  var date = env.date;
  var days = env.days || [];
  var goals = env.goals || {};
  var endHour = goals.dayEndHour === undefined ? 5 : goals.dayEndHour;
  var weekday = dates.weekday(date);
  var records = byDay(env.records, endHour);
  var out = [];
  var push = function (one) { if (one) out.push(one); };

  // ---- the day of the week ----
  push(weekdayPattern({
    id: 'weekday.delivery', detector: 'weekday', kind: 'spend', tone: 'tease',
    params: { weekday: weekday, hour: s.deliveryHour },
    check: { metric: 'deliveryLate', op: '>=', value: 1 }
  }, sameWeekdays(days, date, s.n, function (d) { return known(d, 'spend'); }), function (d) { return d.deliveryLate >= 1; }, s));

  push(weekdayPattern({
    id: 'weekday.steps', detector: 'weekday', kind: 'steps', tone: 'pleasant',
    params: { weekday: weekday, goal: goals.steps },
    check: { metric: 'steps', op: '>=', value: goals.steps }
  }, sameWeekdays(days, date, s.n, function (d) { return known(d, 'steps'); }), function (d) { return d.steps >= (d.stepsGoal || goals.steps); }, s));

  push(weekdayPattern({
    id: 'weekday.late', detector: 'weekday', kind: 'screen', tone: 'tease',
    params: { weekday: weekday, min: s.lateMin },
    check: { metric: 'lateMin', op: '>=', value: s.lateMin }
  }, sameWeekdays(days, date, s.n, function (d) { return known(d, 'screen') && d.lateMin !== null && d.lateMin !== undefined; }), function (d) { return d.lateMin >= s.lateMin; }, s));

  // The same place on this weekday (home and work are not news).
  var placeDays = sameWeekdays(days, date, s.n, function (d) { return known(d, 'places'); });
  var placeIds = {};
  placeDays.forEach(function (d) { (d.places || []).forEach(function (id) { placeIds[id] = true; }); });
  var bestPlace = null;
  Object.keys(placeIds).forEach(function (id) {
    var info = (env.places || {})[id] || {};
    if (info.type === 'home' || info.type === 'work') return;
    var one = weekdayPattern({
      id: 'weekday.place:' + id, detector: 'weekday', kind: 'places', tone: 'neutral',
      params: { weekday: weekday, place: id, title: info.title || 'Место' },
      check: { type: 'visit', place: id }
    }, placeDays, function (d) { return (d.places || []).map(String).indexOf(String(id)) >= 0; }, s);
    if (one && (!bestPlace || one.confidence > bestPlace.confidence)) bestPlace = one;
  });
  push(bestPlace);

  // A cafe in the morning on weekdays: the last n weekdays, any of Monday–Friday.
  if (weekday <= 5) {
    var workdays = before(days, date).filter(function (d) { return dates.weekday(d.date) <= 5 && !d.paused && known(d, 'spend'); }).slice(-s.n);
    push(weekdayPattern({
      id: 'weekday.cafe', detector: 'weekday', kind: 'spend', tone: 'neutral',
      params: { hour: s.cafeHour },
      check: { type: 'expense', tag: s.cafeTag, beforeHour: s.cafeHour }
    }, workdays, function (d) {
      return (records[d.date] || []).some(function (r) { return r.kind === 'expense' && tagged(r, s.cafeTag) && dates.hour(r.at) < s.cafeHour && dates.hour(r.at) >= endHour; });
    }, s));
  }

  // A game on this weekday (sessions `play` of Игротека).
  var sameDays = before(days, date).filter(function (d) { return dates.weekday(d.date) === weekday && !d.paused; }).slice(-s.n);
  var games = {};
  sameDays.forEach(function (d) {
    (records[d.date] || []).forEach(function (r) { if (r.kind === 'play' && r.title) games[r.title] = true; });
  });
  var bestGame = null;
  Object.keys(games).forEach(function (title) {
    var one = weekdayPattern({
      id: 'weekday.play:' + title, detector: 'weekday', kind: 'play', tone: 'pleasant',
      params: { weekday: weekday, game: title },
      check: { type: 'play', title: title }
    }, sameDays, function (d) { return (records[d.date] || []).some(function (r) { return r.kind === 'play' && r.title === title; }); }, s);
    if (one && (!bestGame || one.confidence > bestGame.confidence)) bestGame = one;
  });
  push(bestGame);

  // ---- sleep debt: the last nights (today's summary holds last night) ----
  var nights = before(days, date).concat(env.today ? [env.today] : []).filter(function (d) { return known(d, 'sleep') && typeof d.sleepMin === 'number'; }).slice(-s.sleepNights);
  if (nights.length === s.sleepNights) {
    var debt = nights.reduce(function (sum, d) { return sum + Math.max(0, (d.sleepGoal || goals.sleep || 450) - d.sleepMin); }, 0);
    var beds = before(days, date).slice(-28).filter(function (d) { return known(d, 'sleep') && d.bedtime; }).map(function (d) { return dates.night(d.bedtime); });
    var usual = median(beds);
    if (debt >= s.sleepDebt && usual !== null) {
      out.push({
        id: 'sleep.debt', detector: 'sleep', kind: 'sleep', tone: 'neutral',
        confidence: Math.min(0.9, s.confidence.sleepDebt + (debt - s.sleepDebt) / 1000),
        params: { debt: Math.round(debt), nights: nights.length, usual: dates.hhmm(usual - 720) },
        check: { type: 'bedtimeBefore', value: usual, dayOffset: 1 }
      });
    }
  }

  // ---- trend of steps ----
  var last14 = [];
  for (var i = 14; i >= 1; i--) last14.push(dates.add(date, -i));
  var stepsOf = function (list) { return days.filter(function (d) { return list.indexOf(d.date) >= 0 && known(d, 'steps'); }); };
  var older = stepsOf(last14.slice(0, 7));
  var newer = stepsOf(last14.slice(7));
  if (older.length >= s.trendKnown && newer.length >= s.trendKnown) {
    var avg = function (list) { return list.reduce(function (sum, d) { return sum + d.steps; }, 0) / list.length; };
    var a = avg(older);
    var b = avg(newer);
    var pct = a > 0 ? Math.round((b / a - 1) * 100) : 0;
    var usualSteps = median(before(days, date).slice(-28).filter(function (d) { return known(d, 'steps'); }).map(function (d) { return d.steps; }));
    if (pct >= s.trendPct && usualSteps !== null) {
      out.push({
        id: 'trend.steps', detector: 'trend', kind: 'steps', tone: 'pleasant',
        confidence: Math.min(0.85, s.confidence.trend + pct / 500),
        params: { pct: pct, usual: Math.round(usualSteps / 100) * 100 },
        check: { metric: 'steps', op: '>=', value: Math.round(usualSteps / 100) * 100 }
      });
    }
  }

  // ---- a chain of a habit close to a round number ----
  var yesterday = before(days, date).filter(function (d) { return d.date === dates.add(date, -1); })[0];
  var bestChain = null;
  if (yesterday) {
    (yesterday.habitIds || []).forEach(function (id) {
      var chain = Number((yesterday.chains || {})[id]) || 0;
      if (chain < 2) return;
      var round = s.chainRound.filter(function (r) { return r > chain; })[0];
      if (!round || round - chain > s.chainSoon) return;
      var one = {
        id: 'chain:' + id, detector: 'chain', kind: 'habit', tone: 'pleasant',
        confidence: s.confidence.chain - (round - chain - 1) * 0.05,
        params: { habit: (env.habits || {})[id] || id, habitId: id, chain: chain, round: round, inDays: round - chain - 1 },
        check: { type: 'habit', id: id }
      };
      if (!bestChain || one.confidence > bestChain.confidence) bestChain = one;
    });
  }
  push(bestChain);

  // ---- an achievement 1–3 days away ----
  var extras = env.extras || {};
  var close = (extras.achievements || []).filter(function (a) { return a.daysLeft >= 1 && a.daysLeft <= s.achievementDays; })
    .sort(function (a, b) { return a.daysLeft - b.daysLeft; })[0];
  if (close) {
    out.push({
      id: 'achievement:' + close.id, detector: 'achievement', kind: 'achievement', tone: 'pleasant',
      confidence: s.confidence.achievement - (close.daysLeft - 1) * 0.05,
      params: { title: close.title, daysLeft: close.daysLeft },
      check: { type: 'achievement', id: close.id, progress: close.progress }
    });
  }

  // ---- a level of Жизнь-RPG ----
  var rpg = extras.rpg;
  if (rpg && rpg.perDay > 0 && rpg.toNext > 0) {
    var need = Math.ceil(rpg.toNext / rpg.perDay);
    if (need <= 1) {
      out.push({ id: 'rpg.today', detector: 'rpg', kind: 'rpg', tone: 'pleasant', confidence: s.confidence.rpgToday,
        params: { level: rpg.level + 1, toNext: rpg.toNext, perDay: Math.round(rpg.perDay) }, check: { type: 'rpg', level: rpg.level + 1 } });
    } else if (need <= s.rpgDays) {
      out.push({ id: 'rpg.week', detector: 'rpg', kind: 'rpg', tone: 'pleasant', confidence: s.confidence.rpgWeek,
        params: { level: rpg.level + 1, toNext: rpg.toNext, perDay: Math.round(rpg.perDay), by: dates.weekday(dates.add(date, need - 1)) }, check: null });
    }
  }

  // ---- the calendar: only for beauty, never checked ----
  var meeting = (extras.calendar || []).filter(function (e) { return e && e.begin; })[0];
  if (meeting) {
    var at = new Date(meeting.begin);
    out.push({ id: 'calendar', detector: 'calendar', kind: 'calendar', tone: 'neutral', confidence: s.confidence.calendar,
      params: { time: dates.hhmm(at.getHours() * 60 + at.getMinutes()) }, check: null });
  }

  // ---- a holiday of Праздники: today's, or the nearest within holidayDays; told, never checked ----
  var holiday = extras.holiday || {};
  if (holiday.today && holiday.today.title) {
    out.push({ id: 'holiday.today:' + holiday.today.id, detector: 'holiday', kind: 'holiday', tone: 'pleasant', confidence: s.confidence.holidayToday,
      params: { holiday: holiday.today.title }, check: null });
  } else if (holiday.soon && holiday.soon.title && holiday.soon.inDays >= 1 && holiday.soon.inDays <= s.holidayDays) {
    out.push({ id: 'holiday.soon:' + holiday.soon.id, detector: 'holiday', kind: 'holiday', tone: 'pleasant',
      confidence: s.confidence.holidaySoon - (holiday.soon.inDays - 1) * 0.05,
      params: { holiday: holiday.soon.title, inDays: holiday.soon.inDays }, check: null });
  }

  // ---- Фокус: sessions `focus` (minutes in amount, data.blockedAttempts); silent without the module ----
  var focusDays = before(days, date).filter(function (d) { return !d.paused && focusOf(records[d.date]).length; });
  if (extras.focus !== false && focusDays.length) {
    push(weekdayPattern({
      id: 'weekday.focus', detector: 'weekday', kind: 'focus', tone: 'pleasant',
      params: { weekday: weekday, min: s.focusMin },
      check: { type: 'focus', min: s.focusMin }
    }, sameDays, function (d) { return focusMinutes(focusOf(records[d.date])) >= s.focusMin; }, s));

    push(weekdayPattern({
      id: 'weekday.focusAttempts', detector: 'weekday', kind: 'focus', tone: 'tease',
      params: { weekday: weekday, min: s.focusAttempts },
      check: { type: 'focusAttempts', min: s.focusAttempts }
    }, focusDays.filter(function (d) { return dates.weekday(d.date) === weekday; }).slice(-s.n),
    function (d) { return focusAttempts(focusOf(records[d.date])) >= s.focusAttempts; }, s));

    // The usual session before the split hour against after it.
    var parts = { before: [], after: [] };
    focusDays.forEach(function (d) {
      focusOf(records[d.date]).forEach(function (r) { parts[focusPart(r.at, s.focusSplitHour, endHour)].push(Number(r.amount) || 0); });
    });
    if (parts.before.length >= s.focusSessions && parts.after.length >= s.focusSessions) {
      var early = median(parts.before);
      var late = median(parts.after);
      var side = late >= early ? 'after' : 'before';
      var longer = Math.round(Math.max(early, late));
      var shorter = Math.round(Math.min(early, late));
      if (shorter > 0 && longer / shorter >= s.focusRatio) {
        out.push({
          id: 'focus.' + side, detector: 'focus', kind: 'focus', tone: 'pleasant',
          confidence: Math.min(0.85, s.confidence.focusHours + (longer / shorter - s.focusRatio) / 10),
          params: { hour: s.focusSplitHour, longMin: longer, shortMin: shorter },
          check: { type: 'focusPart', part: side, hour: s.focusSplitHour, min: shorter }
        });
      }
    }
  }

  // A pause: a soft forecast, nothing about steps, sleep and screen, no teasing.
  var paused = env.today && env.today.paused;
  if (paused) out = out.filter(function (p) { return PAUSE_DROP.indexOf(p.kind) < 0 && p.tone !== 'tease'; });
  return out;
};

/** The neutral prediction when nothing pleasant was found. */
exports.calm = function () {
  return { id: 'calm', detector: 'calm', kind: 'calm', tone: 'neutral', confidence: 0, params: {}, check: null };
};

/**
 * The day's choice: the best by confidence, without what was predicted on each of the last
 * `noRepeat` days, different detectors first, and at least one pleasant or neutral.
 *   recent: [[ids of yesterday], [ids of the day before], …]
 */
exports.pick = function (candidates, recent, settings) {
  var s = Object.assign({}, exports.DEFAULTS, settings || {});
  var count = Math.max(2, Math.min(4, Number(s.count) || 3));
  recent = recent || [];
  var blocked = function (id) {
    return recent.length >= s.noRepeat && recent.slice(0, s.noRepeat).every(function (list) { return (list || []).indexOf(id) >= 0; });
  };
  var pool = candidates.filter(function (c) { return !blocked(c.id); }).sort(function (a, b) {
    return (b.confidence - a.confidence) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  });
  var chosen = [];
  var used = {};
  pool.forEach(function (c) {
    var key = c.detector === 'weekday' ? c.id.split(':')[0] : c.detector;
    if (chosen.length < count && !used[key]) { chosen.push(c); used[key] = true; }
  });
  pool.forEach(function (c) { if (chosen.length < count && chosen.indexOf(c) < 0) chosen.push(c); });
  if (!chosen.some(function (c) { return c.tone !== 'tease'; })) {
    var nice = pool.filter(function (c) { return c.tone !== 'tease' && chosen.indexOf(c) < 0; })[0] || exports.calm();
    if (chosen.length >= count) chosen.pop();
    chosen.push(nice);
  }
  return chosen;
};

var KNOWN = { deliveryLate: 'spend', steps: 'steps', lateMin: 'screen', socialMin: 'screen', screenMin: 'screen', sleepMin: 'sleep', noSpend: 'spend' };

function compare(a, op, b) {
  switch (op) {
    case '>': return a > b;
    case '<': return a < b;
    case '<=': return a <= b;
    case '==': return a === b;
    default: return a >= b;
  }
}

/**
 * Did a prediction come true: true | false | null (no data, a pause, or not checkable).
 *   ctx: { day (the predicted day's summary), next (the day after), records (of the predicted day),
 *          extras: { achievements: [{ id, progress }], granted: [ids], rpgLevel, focus: false without Фокус }, dayEndHour }
 */
exports.evaluate = function (prediction, ctx) {
  var check = prediction && prediction.check;
  if (!check) return null;
  var day = check.dayOffset ? ctx.next : ctx.day;
  if (!day || day.paused || (ctx.day && ctx.day.paused)) return null;
  if (check.metric) {
    var flag = KNOWN[check.metric];
    if (flag && !known(day, flag)) return null;
    var value = day[check.metric];
    if (value === null || value === undefined) return null;
    return compare(typeof value === 'boolean' ? (value ? 1 : 0) : Number(value), check.op, check.value);
  }
  var extras = ctx.extras || {};
  switch (check.type) {
    case 'visit':
      if (!known(day, 'places')) return null;
      return (day.places || []).map(String).indexOf(String(check.place)) >= 0;
    case 'expense':
      if (!known(day, 'spend')) return null;
      return (ctx.records || []).some(function (r) {
        return r.kind === 'expense' && tagged(r, check.tag) && dates.hour(r.at) < check.beforeHour && dates.hour(r.at) >= (ctx.dayEndHour === undefined ? 5 : ctx.dayEndHour);
      });
    case 'play':
      return (ctx.records || []).some(function (r) { return r.kind === 'play' && r.title === check.title; });
    case 'bedtimeBefore':
      if (!known(day, 'sleep') || !day.bedtime) return null;
      return dates.night(day.bedtime) < check.value;
    case 'habit':
      return (day.habitIds || []).map(String).indexOf(String(check.id)) >= 0;
    case 'achievement':
      if ((extras.granted || []).indexOf(check.id) >= 0) return true;
      var now = (extras.achievements || []).filter(function (a) { return a.id === check.id; })[0];
      if (!now || typeof now.progress !== 'number' || typeof check.progress !== 'number') return null;
      return now.progress > check.progress;
    case 'rpg':
      return typeof extras.rpgLevel === 'number' ? extras.rpgLevel >= check.level : null;
    case 'focus':
      if (extras.focus === false) return null;
      return focusMinutes(focusOf(ctx.records)) >= check.min;
    case 'focusAttempts':
      var sessions = focusOf(ctx.records);
      return sessions.length ? focusAttempts(sessions) >= check.min : null;
    case 'focusPart':
      var endHour = ctx.dayEndHour === undefined ? 5 : ctx.dayEndHour;
      var inPart = focusOf(ctx.records).filter(function (r) { return focusPart(r.at, check.hour, endHour) === check.part; });
      return inPart.length ? inPart.some(function (r) { return (Number(r.amount) || 0) > check.min; }) : null;
  }
  return null;
};

/** Accuracy over the day files: { hits, misses, pct } (pct null when nothing was checked). */
exports.accuracy = function (files) {
  var hits = 0;
  var misses = 0;
  (files || []).forEach(function (file) {
    (file.predictions || []).forEach(function (p) {
      if (p.hit === true) hits++;
      else if (p.hit === false) misses++;
    });
  });
  return { hits: hits, misses: misses, pct: hits + misses ? Math.round(hits / (hits + misses) * 100) : null };
};

/** Accuracy by weeks, oldest first: [{ week, hits, misses, pct }]. */
exports.byWeeks = function (files, weeks, today) {
  var out = [];
  var monday = dates.monday(today);
  for (var i = (weeks || 8) - 1; i >= 0; i--) {
    var start = dates.add(monday, -7 * i);
    var end = dates.add(start, 6);
    var acc = exports.accuracy((files || []).filter(function (f) { return dates.diff(f.date, start) >= 0 && dates.diff(end, f.date) >= 0; }));
    out.push({ week: start, hits: acc.hits, misses: acc.misses, pct: acc.pct });
  }
  return out;
};

/** Predictions that did not come true in a row, newest back (unknown ones are skipped). */
exports.missStreak = function (files) {
  var list = (files || []).slice().sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
  var streak = 0;
  for (var i = 0; i < list.length; i++) {
    var predictions = (list[i].predictions || []).slice().reverse();
    for (var j = 0; j < predictions.length; j++) {
      if (predictions[j].hit === false) streak++;
      else if (predictions[j].hit === true) return streak;
    }
  }
  return streak;
};
