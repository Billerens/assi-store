// Habits: which day a habit is due, and how long its chain of days is. Pure.
//
// habit: { id, title, icon, schedule: { days: [1..7] } | { perWeek: n }, measure, remind, created, archived }
// done:  { 'YYYY-MM-DD': true } — the owner's dates on which the habit was marked
// paused: function (date) → truthy when the date is inside a pause (sick, vacation, rest)
//
// Rules that keep the chain kind: a paused day neither breaks nor adds to it; a missed due day
// is "frozen" while the week still has freezes left (freezesPerWeek); today not done yet does
// not break anything. A day marked without being due adds to the chain.
var T = require('./time.js');

function daysOf(habit) {
  var schedule = habit.schedule || {};
  if (schedule.perWeek) return null;
  var days = Array.isArray(schedule.days) && schedule.days.length ? schedule.days : [1, 2, 3, 4, 5, 6, 7];
  return days.map(Number);
}

/** The first date the habit exists on. */
function createdDate(habit) {
  if (!habit.created) return '2000-01-01';
  return typeof habit.created === 'number' ? T.ymd(habit.created) : String(habit.created).slice(0, 10);
}
exports.createdDate = createdDate;

/** Marks in the ISO week of the date, before the date itself. */
function marksBefore(done, date) {
  var monday = T.monday(date);
  var n = 0;
  for (var d = monday; d < date; d = T.addDays(d, 1)) if (done[d]) n++;
  return n;
}

function marksInWeek(done, monday) {
  var n = 0;
  for (var i = 0; i < 7; i++) if (done[T.addDays(monday, i)]) n++;
  return n;
}

/** Is the habit expected on that date? */
exports.isDue = function (habit, date, done) {
  if (habit.archived) return false;
  if (date < createdDate(habit)) return false;
  var days = daysOf(habit);
  if (days) return days.indexOf(T.weekday(date)) >= 0;
  // N times a week: due while the week's quota is not met (or it was marked that very day).
  return marksBefore(done || {}, date) < Number(habit.schedule.perWeek) || Boolean(done && done[date]);
};

/** Chain of a habit with fixed days, in days, as of `today`. */
function dayChain(habit, done, paused, today, freezesPerWeek) {
  var days = daysOf(habit);
  var start = createdDate(habit);
  var count = done[today] ? 1 : 0;
  var used = {};
  var date = T.addDays(today, -1);
  for (var guard = 0; guard < 4000 && date >= start; guard++, date = T.addDays(date, -1)) {
    if (done[date]) {
      count++;
      continue;
    }
    if (days.indexOf(T.weekday(date)) < 0) continue;
    if (paused && paused(date)) continue;
    var week = T.isoWeek(date);
    if ((used[week] || 0) < freezesPerWeek) {
      used[week] = (used[week] || 0) + 1;
      continue;
    }
    break;
  }
  return count;
}

/** Chain of an "N times a week" habit: the days its run of fulfilled weeks covers up to today. */
function weekChain(habit, done, paused, today, freezesPerWeek) {
  var per = Number(habit.schedule.perWeek) || 1;
  var start = createdDate(habit);
  var thisMonday = T.monday(today);
  var required = function (monday) {
    var active = 0;
    for (var i = 0; i < 7; i++) {
      var d = T.addDays(monday, i);
      if (d >= start && !(paused && paused(d))) active++;
    }
    return Math.ceil(per * active / 7);
  };
  var chainStart = null;
  var monday = T.addDays(thisMonday, -7);
  for (var guard = 0; guard < 600 && T.addDays(monday, 6) >= start; guard++, monday = T.addDays(monday, -7)) {
    var need = required(monday);
    var got = marksInWeek(done, monday);
    if (need === 0) continue;
    if (got >= need || need - got <= freezesPerWeek) {
      chainStart = monday < start ? start : monday;
      continue;
    }
    break;
  }
  if (!chainStart) {
    // No finished week in the run: the chain is what this week has so far.
    for (var d = thisMonday; d <= today; d = T.addDays(d, 1)) {
      if (done[d]) {
        chainStart = d;
        break;
      }
    }
  }
  if (!chainStart) return 0;
  return T.diffDays(chainStart, today) + 1;
}

/** Days in a row, as of `today`. */
exports.chain = function (habit, done, paused, today, freezesPerWeek) {
  done = done || {};
  var freezes = Math.max(0, Number(freezesPerWeek) || 0);
  return daysOf(habit) ? dayChain(habit, done, paused, today, freezes) : weekChain(habit, done, paused, today, freezes);
};

/** The longest chain the habit ever had up to today (for the habits list). */
exports.best = function (habit, done, paused, today, freezesPerWeek) {
  var dates = Object.keys(done || {}).filter(function (d) { return done[d] && d <= today; }).sort();
  var best = 0;
  // A chain is longest on a marked day; checking each marked day is enough.
  dates.forEach(function (d) {
    best = Math.max(best, exports.chain(habit, done, paused, d, freezesPerWeek));
  });
  return best;
};

/** A schedule in words: 'каждый день', 'пн, ср, пт', '3 раза в неделю'. */
exports.describe = function (habit) {
  var schedule = habit.schedule || {};
  if (schedule.perWeek) {
    var n = Number(schedule.perWeek);
    return n + (n % 10 >= 2 && n % 10 <= 4 && (n < 10 || n > 20) ? ' раза' : ' раз') + ' в неделю';
  }
  var days = daysOf(habit);
  if (days.length === 7) return 'каждый день';
  if (days.length === 5 && [1, 2, 3, 4, 5].every(function (d) { return days.indexOf(d) >= 0; })) return 'по будням';
  if (days.length === 2 && days.indexOf(6) >= 0 && days.indexOf(7) >= 0) return 'по выходным';
  var names = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
  return days.slice().sort().map(function (d) { return names[d - 1]; }).join(', ');
};

/** A habit as the owner typed it, made right; throws when it cannot be kept. */
exports.clean = function (input, now) {
  var title = String(input.title || '').trim();
  if (!title) throw new Error('У привычки должно быть название');
  var schedule;
  if (input.schedule && Number(input.schedule.perWeek) > 0) {
    schedule = { perWeek: Math.min(7, Math.max(1, Math.round(Number(input.schedule.perWeek)))) };
  } else {
    var days = (input.schedule && Array.isArray(input.schedule.days) ? input.schedule.days : [1, 2, 3, 4, 5, 6, 7])
      .map(Number).filter(function (d) { return d >= 1 && d <= 7; });
    var unique = [];
    days.forEach(function (d) { if (unique.indexOf(d) < 0) unique.push(d); });
    schedule = { days: unique.length ? unique.sort() : [1, 2, 3, 4, 5, 6, 7] };
  }
  var measure = null;
  if (input.measure && Number(input.measure.amount) > 0) {
    measure = { amount: Number(input.measure.amount), unit: String(input.measure.unit || 'мин').trim() || 'мин' };
  }
  var remind = input.remind ? T.normalizeTime(input.remind) : null;
  var id = input.id ? String(input.id) : 'h' + Number(now || Date.now()).toString(36);
  return {
    id: id,
    title: title,
    icon: String(input.icon || 'check'),
    schedule: schedule,
    measure: measure,
    remind: remind,
    created: input.created || now || Date.now(),
    archived: Boolean(input.archived)
  };
};
