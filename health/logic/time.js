// Dates and clock times of the owner's day. Pure: no Android, the same in node and in the engine.
// A date is 'YYYY-MM-DD' (local time), a clock time is 'HH:MM', a moment is milliseconds.
// The owner's day ends at "dayEnd" (05:00 by default): 01:30 still belongs to the day before.

function pad(n) {
  return (n < 10 ? '0' : '') + n;
}
exports.pad = pad;

/** 'YYYY-MM-DD' of a moment or a Date, in local time. */
exports.ymd = function (value) {
  var d = value instanceof Date ? value : new Date(value);
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
};

exports.isDate = function (text) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(text || ''));
};

/** Local midnight of a date as a Date. */
exports.parse = function (date) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date));
  if (!m) throw new Error('Дата должна быть вида 2026-11-13, а не ' + date);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
};

exports.addDays = function (date, days) {
  var d = exports.parse(date);
  return exports.ymd(new Date(d.getFullYear(), d.getMonth(), d.getDate() + days));
};

/** b − a in whole days. */
exports.diffDays = function (a, b) {
  var x = exports.parse(a);
  var y = exports.parse(b);
  return Math.round((Date.UTC(y.getFullYear(), y.getMonth(), y.getDate()) - Date.UTC(x.getFullYear(), x.getMonth(), x.getDate())) / 864e5);
};

/** Every date from `from` to `to`, both included. */
exports.range = function (from, to) {
  var out = [];
  var n = exports.diffDays(from, to);
  for (var i = 0; i <= n && i < 4000; i++) out.push(exports.addDays(from, i));
  return out;
};

/** 'HH:MM' → minutes since midnight; null when it is not a time. */
exports.minutes = function (hm) {
  if (typeof hm === 'number') return hm;
  var m = /^(\d{1,2}):(\d{2})$/.exec(String(hm || '').trim());
  if (!m) return null;
  var h = Number(m[1]);
  var mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return h * 60 + mi;
};

/** Minutes since midnight → 'HH:MM' (wraps around the day). */
exports.hm = function (minutes) {
  var m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return pad(Math.floor(m / 60)) + ':' + pad(m % 60);
};

/** Normalized 'HH:MM' or null. */
exports.normalizeTime = function (text) {
  var m = exports.minutes(text);
  return m === null ? null : exports.hm(m);
};

/** The moment of a clock time on a date (local). */
exports.at = function (date, hm) {
  var d = exports.parse(date);
  var mins = exports.minutes(hm);
  if (mins === null) throw new Error('Время должно быть вида 08:30, а не ' + hm);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), Math.floor(mins / 60), mins % 60).getTime();
};

/** 'HH:MM' of a moment. */
exports.clock = function (ms) {
  var d = new Date(ms);
  return pad(d.getHours()) + ':' + pad(d.getMinutes());
};

exports.minuteOfDay = function (ms) {
  var d = new Date(ms);
  return d.getHours() * 60 + d.getMinutes();
};

/** The owner's date of a moment: before dayEnd it is still the day before. */
exports.logical = function (ms, dayEnd) {
  var end = exports.minutes(dayEnd) || 0;
  var date = exports.ymd(ms);
  return exports.minuteOfDay(ms) < end ? exports.addDays(date, -1) : date;
};

/** The owner's day as moments: { from, to } — from dayEnd of the date to dayEnd of the next one. */
exports.bounds = function (date, dayEnd) {
  var end = exports.hm(exports.minutes(dayEnd) || 0);
  return { from: exports.at(date, end), to: exports.at(exports.addDays(date, 1), end) };
};

/**
 * The moment a clock time falls on inside the owner's day: 23:30 is on the date itself,
 * 01:30 (before dayEnd) is on the next calendar date.
 */
exports.inDay = function (date, hm, dayEnd) {
  var mins = exports.minutes(hm);
  var end = exports.minutes(dayEnd) || 0;
  return exports.at(mins < end ? exports.addDays(date, 1) : date, mins);
};

/** The night window of the owner's day: { from, to } in moments (00:30–05:00 → the next calendar morning). */
exports.night = function (date, start, end, dayEnd) {
  var from = exports.inDay(date, start, dayEnd);
  var length = ((exports.minutes(end) - exports.minutes(start)) % 1440 + 1440) % 1440;
  return { from: from, to: from + length * 60000 };
};

/** Is the clock minute inside [start, end), a window that may cross midnight? */
exports.inWindow = function (minute, start, end) {
  var a = exports.minutes(start);
  var b = exports.minutes(end);
  return a <= b ? minute >= a && minute < b : minute >= a || minute < b;
};

/** 1 = Monday … 7 = Sunday. */
exports.weekday = function (date) {
  var day = exports.parse(date).getDay();
  return day === 0 ? 7 : day;
};

exports.monday = function (date) {
  return exports.addDays(date, 1 - exports.weekday(date));
};

/** ISO week: '2026-W46'. */
exports.isoWeek = function (date) {
  var d = exports.parse(date);
  var thursday = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 4 - (d.getDay() || 7));
  var yearStart = new Date(thursday.getFullYear(), 0, 1);
  var week = Math.ceil(((Date.UTC(thursday.getFullYear(), thursday.getMonth(), thursday.getDate()) -
    Date.UTC(yearStart.getFullYear(), 0, 1)) / 864e5 + 1) / 7);
  return thursday.getFullYear() + '-W' + pad(week);
};

/** Overlap of [a1, a2) and [b1, b2) in milliseconds. */
exports.overlap = function (a1, a2, b1, b2) {
  return Math.max(0, Math.min(a2, b2) - Math.max(a1, b1));
};
