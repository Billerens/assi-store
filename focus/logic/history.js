// The history of sessions: minutes by day for the bars, today's total, past tasks. Pure: the rows
// of the sessions table come in. Days are the phone's local days.
var timer = require('./timer.js');

var WEEKDAYS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

function pad(n) {
  return (n < 10 ? '0' : '') + n;
}

/** The local day of a moment: { start, key: 'YYYY-MM-DD' }. */
function day(time) {
  var date = new Date(time);
  date.setHours(0, 0, 0, 0);
  return { start: date.getTime(), key: date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) };
}

exports.day = day;

/** "1 ч 40 мин", "25 мин". */
exports.duration = function (minutes) {
  var m = Math.max(0, Math.round(minutes || 0));
  if (m < 60) return m + ' мин';
  var h = Math.floor(m / 60);
  var rest = m % 60;
  return h + ' ч' + (rest ? ' ' + rest + ' мин' : '');
};

/** Bars of the last n days, oldest first: [{ key, label, weekday, start, minutes, sessions, attempts }]. */
exports.days = function (sessions, now, n) {
  var out = [];
  var index = {};
  var today = day(now).start;
  for (var i = n - 1; i >= 0; i--) {
    // Step back by whole calendar days (a day is not always 24 hours: daylight saving).
    var date = new Date(today);
    date.setDate(date.getDate() - i);
    var d = day(date.getTime());
    var item = { key: d.key, start: d.start, label: String(date.getDate()), weekday: WEEKDAYS[date.getDay()], minutes: 0, sessions: 0, attempts: 0 };
    index[d.key] = item;
    out.push(item);
  }
  (sessions || []).forEach(function (row) {
    var item = index[day(row.startAt).key];
    if (!item) return;
    item.minutes += Number(row.actualMin) || 0;
    item.sessions++;
    item.attempts += Number(row.blockedAttempts) || 0;
  });
  return out;
};

/** Today's focus: { minutes, sessions }. */
exports.today = function (sessions, now) {
  var start = day(now).start;
  var out = { minutes: 0, sessions: 0 };
  (sessions || []).forEach(function (row) {
    if (day(row.startAt).start !== start) return;
    out.minutes += Number(row.actualMin) || 0;
    out.sessions++;
  });
  return out;
};

/** "Сегодня: 1 ч 40 мин, 3 сессии". */
exports.todayText = function (stats) {
  if (!stats.sessions) return 'Сегодня фокуса ещё не было';
  return 'Сегодня: ' + exports.duration(stats.minutes) + ', ' + stats.sessions + ' ' + timer.plural(stats.sessions, 'сессия', 'сессии', 'сессий');
};

/** The week (the last 7 days): { minutes, sessions, attempts, calmDays } — calm: sessions and no attempts. */
exports.week = function (sessions, now) {
  var days = exports.days(sessions, now, 7);
  var out = { minutes: 0, sessions: 0, attempts: 0, calmDays: 0 };
  days.forEach(function (item) {
    out.minutes += item.minutes;
    out.sessions += item.sessions;
    out.attempts += item.attempts;
    if (item.sessions && !item.attempts) out.calmDays++;
  });
  return out;
};

/** Past tasks, the latest first, each once: what the field suggests. */
exports.tasks = function (sessions, limit) {
  var out = [];
  var seen = {};
  (sessions || []).slice().sort(function (a, b) { return b.startAt - a.startAt; }).forEach(function (row) {
    var task = String(row.task || '').trim();
    var key = task.toLowerCase();
    if (!task || seen[key] || out.length >= limit) return;
    seen[key] = true;
    out.push(task);
  });
  return out;
};

/** How a session ended, in words. */
exports.ENDED = { timer: 'по таймеру', owner: 'вручную', voice: 'голосом', call: 'из-за звонка', restore: 'после перезапуска' };
