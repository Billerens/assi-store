// Numbers and durations the way the screen, the widget and the agent say them. Pure.
var NB = ' ';

/** 6412 → '6 412'. */
exports.num = function (value) {
  var n = Math.round(Number(value) || 0);
  var digits = String(Math.abs(n));
  var out = '';
  while (digits.length > 3) {
    out = NB + digits.slice(-3) + out;
    digits = digits.slice(0, -3);
  }
  return (n < 0 ? '-' : '') + digits + out;
};

/** 370 → '6 ч 10 мин', 45 → '45 мин', 420 → '7 ч'. */
exports.dur = function (minutes) {
  if (minutes === null || minutes === undefined || isNaN(minutes)) return '—';
  var m = Math.max(0, Math.round(minutes));
  var h = Math.floor(m / 60);
  var rest = m % 60;
  if (!h) return rest + NB + 'мин';
  if (!rest) return h + NB + 'ч';
  return h + NB + 'ч ' + rest + NB + 'мин';
};

/** 460 → '7:40'. */
exports.clockDur = function (minutes) {
  if (minutes === null || minutes === undefined || isNaN(minutes)) return '—';
  var m = Math.max(0, Math.round(minutes));
  var rest = m % 60;
  return Math.floor(m / 60) + ':' + (rest < 10 ? '0' : '') + rest;
};

/** 1000 → '1,0'. */
exports.liters = function (ml) {
  return ((Number(ml) || 0) / 1000).toFixed(1).replace('.', ',');
};

/** plural(5, 'стакан', 'стакана', 'стаканов') → 'стаканов'. */
exports.plural = function (n, one, few, many) {
  var a = Math.abs(Math.round(n)) % 100;
  var b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b === 1) return one;
  if (b >= 2 && b <= 4) return few;
  return many;
};

var MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
var WEEKDAYS = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
exports.WEEKDAYS = WEEKDAYS;

/** '2026-11-20' → '20 ноября'. */
exports.dateLong = function (date) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date || ''));
  if (!m) return String(date || '');
  return Number(m[3]) + ' ' + MONTHS[Number(m[2]) - 1];
};

/** Water of a record in millilitres, whatever unit the chat used. */
exports.toMl = function (amount, unit, glassMl) {
  var a = Number(amount) || 0;
  var u = String(unit || '').toLowerCase().trim();
  if (/^(l|л|литр|литра|литров|liter|litre)$/.test(u)) return a * 1000;
  if (/^(glass|glasses|cup|стакан|стакана|стаканов|ст)$/.test(u)) return a * glassMl;
  if (!u && a > 0 && a < 20) return a * glassMl;
  return a;
};
