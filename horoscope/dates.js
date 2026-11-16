// Dates as 'YYYY-MM-DD' strings in local time. Pure: no Android, works in the engine and in node.
// The same file is in achievements, rpg and horoscope: each module is installed on its own.

function pad(n) {
  return (n < 10 ? '0' : '') + n;
}

/** A Date, milliseconds or a date string → 'YYYY-MM-DD'. */
exports.ymd = function (value) {
  var date = value instanceof Date ? value : (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? exports.parse(value) : new Date(value));
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
};

/** 'YYYY-MM-DD' → local midnight of that day. */
exports.parse = function (text) {
  var parts = String(text).slice(0, 10).split('-');
  return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
};

exports.add = function (text, days) {
  var date = exports.parse(text);
  date.setDate(date.getDate() + days);
  return exports.ymd(date);
};

/** a − b in whole days. */
exports.diff = function (a, b) {
  return Math.round((exports.parse(a).getTime() - exports.parse(b).getTime()) / 864e5);
};

/** 1 — Monday … 7 — Sunday. */
exports.weekday = function (text) {
  var day = exports.parse(text).getDay();
  return day === 0 ? 7 : day;
};

/** Monday of the week the date is in. */
exports.monday = function (text) {
  return exports.add(text, 1 - exports.weekday(text));
};

/** The day the owner lives in now: before the end of the day (05:00) it is still yesterday. */
exports.current = function (now, dayEndHour) {
  var date = new Date(now);
  if (date.getHours() + date.getMinutes() / 60 < (dayEndHour === undefined ? 5 : dayEndHour)) date.setDate(date.getDate() - 1);
  return exports.ymd(date);
};

/** When the day starts: the date at the end-of-day hour, in ms. */
exports.start = function (text, dayEndHour) {
  var date = exports.parse(text);
  date.setMinutes(Math.round((dayEndHour === undefined ? 5 : dayEndHour) * 60));
  return date.getTime();
};

/** 'HH:MM' → minutes since midnight; null when there is no time. */
exports.minutes = function (hhmm) {
  if (hhmm === null || hhmm === undefined || hhmm === '') return null;
  if (typeof hhmm === 'number') return hhmm;
  var match = /^(\d{1,2}):(\d{2})/.exec(String(hhmm));
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
};

/** A bedtime as minutes since 12:00: 23:30 → 690, 01:40 → 820. Lets times around midnight be compared. */
exports.night = function (hhmm) {
  var value = exports.minutes(hhmm);
  if (value === null) return null;
  return (value + 12 * 60) % (24 * 60);
};

/** Minutes since midnight → 'HH:MM'. */
exports.hhmm = function (minutes) {
  if (minutes === null || minutes === undefined || isNaN(minutes)) return null;
  var value = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return pad(Math.floor(value / 60)) + ':' + pad(value % 60);
};

/** Every date from `from` to `to`, both included. */
exports.range = function (from, to) {
  var out = [];
  for (var day = from; exports.diff(to, day) >= 0; day = exports.add(day, 1)) out.push(day);
  return out;
};

/** The hour of a moment (ms), with minutes as a fraction. */
exports.hour = function (ms) {
  var date = new Date(ms);
  return date.getHours() + date.getMinutes() / 60;
};

var WEEKDAYS = ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'];
var WEEKDAYS_ACC = ['понедельник', 'вторник', 'среду', 'четверг', 'пятницу', 'субботу', 'воскресенье'];
var WEEKDAYS_PL = ['понедельникам', 'вторникам', 'средам', 'четвергам', 'пятницам', 'субботам', 'воскресеньям'];
var WEEKDAYS_GEN = ['понедельников', 'вторников', 'сред', 'четвергов', 'пятниц', 'суббот', 'воскресений'];

/** Weekday names in Russian: form 'nom' (среда), 'acc' (в среду), 'pl' (по средам), 'gen' (четырёх сред). */
exports.weekdayName = function (weekday, form) {
  var list = form === 'acc' ? WEEKDAYS_ACC : form === 'pl' ? WEEKDAYS_PL : form === 'gen' ? WEEKDAYS_GEN : WEEKDAYS;
  return list[(weekday - 1 + 7) % 7];
};

/** '14 ноября'. */
var MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
exports.human = function (text) {
  var date = exports.parse(text);
  return date.getDate() + ' ' + MONTHS[date.getMonth()];
};
