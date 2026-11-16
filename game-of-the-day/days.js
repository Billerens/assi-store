// Days and times of «Игра дня». Pure logic (engine and node).
var DAY = 86400000;

function pad(n) {
  return (n < 10 ? '0' : '') + n;
}

/** «2026-11-14» in the phone's time zone. */
function dayKey(time) {
  var d = new Date(time);
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

/** The local midnight of a «2026-11-14» (a game key «2026-11-14-2» gives its day). */
function dayStart(key) {
  var m = /^(\d{4})-(\d{2})-(\d{2})(?:-[2-9])?$/.exec(String(key || ''));
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0).getTime();
}

/** Whole days from the day `key` to the day of `time` (0 — the same day). */
function daysSince(key, time) {
  var start = dayStart(key);
  if (start === null) return Infinity;
  return Math.round((dayStart(dayKey(time)) - start) / DAY);
}

function minutesOf(hhmm) {
  var m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || ''));
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** The moment of «ЧЧ:ММ» on the day of time. */
function at(time, hhmm) {
  var m = minutesOf(hhmm);
  if (m === null) return null;
  var d = new Date(time);
  d.setHours(Math.floor(m / 60), m % 60, 0, 0);
  return d.getTime();
}

/** Is the moment inside [from, to) of its day? */
function inWindow(time, from, to) {
  var a = minutesOf(from);
  var b = minutesOf(to);
  if (a === null || b === null || a === b) return false;
  var d = new Date(time);
  var now = d.getHours() * 60 + d.getMinutes();
  return a < b ? now >= a && now < b : now >= a || now < b;
}

// ---- the schedule -------------------------------------------------------------------------------
//
// A plan says on which days games are made: {frequency: 'daily' | 'every' | 'weekdays' | 'off',
// everyDays: N, anchor: '2026-11-14' (the first day of «every N days»), weekdays: [1, 3, 5]}.
// Slots say how many games a day and when: [{make: '06:00', ready: '08:00'}, …], sorted by make;
// a slot's window is [make, ready + giveUpMin), cut at the next slot's make and at midnight.
// A game is keyed by its day and slot: «2026-11-14» (slot 0, as before), «2026-11-14-2» (slot 1).

var WEEKDAYS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
var MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

/** «2026-11-14» + slot 1 → «2026-11-14-2»; slot 0 is the day itself. */
function gameKey(day, slot) {
  return slot > 0 ? day + '-' + (slot + 1) : String(day);
}

/** «2026-11-14-2» → {day: '2026-11-14', slot: 1}; null when it is not a key. */
function parseKey(key) {
  var m = /^(\d{4}-\d{2}-\d{2})(?:-([2-9]))?$/.exec(String(key || ''));
  if (!m || dayStart(m[1]) === null) return null;
  return { day: m[1], slot: m[2] ? Number(m[2]) - 1 : 0 };
}

/**
 * Is a game made on the day of this moment? plan — the settings ({frequency, everyDays, anchor,
 * weekdays}) or the old setting «days» (all | weekdays | never).
 */
function makesOn(time, plan) {
  if (typeof plan === 'string' || !plan) {
    if (plan === 'never') return false;
    if (plan === 'weekdays') return makesOn(time, { frequency: 'weekdays', weekdays: [1, 2, 3, 4, 5] });
    return true;
  }
  var f = plan.frequency;
  if (f === 'off') return false;
  if (f === 'weekdays') return (plan.weekdays || []).indexOf(new Date(time).getDay()) >= 0;
  if (f === 'every') {
    var n = Math.max(1, Math.round(Number(plan.everyDays) || 1));
    var since = daysSince(plan.anchor || '2026-01-01', time);
    if (!isFinite(since)) since = 0;
    return ((since % n) + n) % n === 0;
  }
  return true;
}

/** The moments of slot i on the day of `time`: {make, ready, giveUp}; null when there is no such slot. */
function slotTimes(time, slots, i, giveUpMin) {
  var slot = (slots || [])[i];
  if (!slot) return null;
  var make = at(time, slot.make);
  var ready = at(time, slot.ready);
  if (make === null || ready === null) return null;
  if (ready < make) ready = make;
  var end = dayStart(dayKey(time)) + DAY;
  var giveUp = Math.min(ready + Math.max(0, Number(giveUpMin) || 0) * 60000, end);
  var next = slots[i + 1] ? at(time, slots[i + 1].make) : null;
  if (next !== null && next > make) giveUp = Math.min(giveUp, next);
  if (giveUp <= make) giveUp = Math.min(make + 60000, end);
  return { make: make, ready: ready, giveUp: giveUp };
}

/** The slot whose window [make, giveUp) holds the moment; -1 when none. */
function slotAt(time, slots, giveUpMin) {
  for (var i = 0; i < (slots || []).length; i++) {
    var w = slotTimes(time, slots, i, giveUpMin);
    if (w && time >= w.make && time < w.giveUp) return i;
  }
  return -1;
}

/**
 * The games of the plan from the moment on, the earliest first: [{key, day, slot, make, ready, giveUp}]
 * whose window has not ended yet; up to `limit` (1) within `horizon` days (366).
 */
function upcoming(time, plan, slots, giveUpMin, limit, horizon) {
  var out = [];
  limit = limit || 1;
  var start = dayStart(dayKey(time));
  for (var d = 0; d <= (horizon || 366) && out.length < limit; d++) {
    var noon = start + d * DAY + 12 * 3600000;   // the noon of that day: safe across a clock change
    if (!makesOn(noon, plan)) continue;
    var day = dayKey(noon);
    for (var i = 0; i < (slots || []).length && out.length < limit; i++) {
      var w = slotTimes(noon, slots, i, giveUpMin);
      if (!w || w.giveUp <= time) continue;
      out.push({ key: gameKey(day, i), day: day, slot: i, make: w.make, ready: w.ready, giveUp: w.giveUp });
    }
  }
  return out;
}

function plural(n, forms) {
  var a = n % 10;
  var b = n % 100;
  return a === 1 && b !== 11 ? forms[0] : a >= 2 && a <= 4 && (b < 12 || b > 14) ? forms[1] : forms[2];
}

function hhmm(time) {
  var d = new Date(time);
  return pad(d.getHours()) + ':' + pad(d.getMinutes());
}

/** «сегодня в 19:00», «завтра в 09:00», «послезавтра в 09:00», «через 3 дня, в 09:00», «21 ноября в 09:00». */
function whenText(moment, now) {
  var ahead = daysSince(dayKey(now), moment);
  var clock = hhmm(moment);
  if (ahead <= 0) return 'сегодня в ' + clock;
  if (ahead === 1) return 'завтра в ' + clock;
  if (ahead === 2) return 'послезавтра в ' + clock;
  if (ahead < 7) return 'через ' + ahead + ' ' + plural(ahead, ['день', 'дня', 'дней']) + ', в ' + clock;
  var d = new Date(moment);
  return d.getDate() + ' ' + MONTHS[d.getMonth()] + ' в ' + clock;
}

/** «каждый день», «через день», «каждые 3 дня», «по будням», «по пн, ср, пт», «выключена». */
function planText(plan) {
  var f = plan && plan.frequency;
  if (f === 'off') return 'выключена';
  if (f === 'every') {
    var n = Math.max(1, Math.round(Number(plan.everyDays) || 1));
    if (n === 1) return 'каждый день';
    if (n === 2) return 'через день';
    return 'каждые ' + n + ' ' + plural(n, ['день', 'дня', 'дней']);
  }
  if (f === 'weekdays') {
    var list = (plan.weekdays || []).slice().sort(function (a, b) { return ((a + 6) % 7) - ((b + 6) % 7); });
    if (!list.length) return 'выключена';
    if (list.length === 7) return 'каждый день';
    if (list.join() === '1,2,3,4,5') return 'по будням';
    if (list.join() === '6,0') return 'по выходным';
    return 'по ' + list.map(function (w) { return WEEKDAYS[w]; }).join(', ');
  }
  return 'каждый день';
}

/** «Каждый день в 08:00», «Через день в 08:00 и 19:00», «Выключена». */
function scheduleText(plan, slots) {
  var words = planText(plan);
  if (words === 'выключена') return 'Выключена';
  var times = (slots || []).map(function (slot) { return slot.ready; });
  var tail = times.length > 1 ? times.slice(0, -1).join(', ') + ' и ' + times[times.length - 1] : times[0] || '';
  var text = words + (tail ? ' в ' + tail : '');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** 32-bit multiplication (Math.imul is not in every Rhino). */
function imul(a, b) {
  var ah = (a >>> 16) & 0xffff;
  var al = a & 0xffff;
  var bh = (b >>> 16) & 0xffff;
  var bl = b & 0xffff;
  return ((al * bl) + (((ah * bl + al * bh) << 16) >>> 0)) | 0;
}

/** A number from a day: the same day always gives the same choices. */
function seedOf(key) {
  var h = 2166136261;
  var s = String(key);
  for (var i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = imul(h, 16777619) >>> 0;
  }
  return h;
}

/** A small seeded generator (mulberry32): rng() → [0, 1). */
function rng(seed) {
  var a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    var t = a;
    t = imul(t ^ (t >>> 15), t | 1);
    t ^= t + imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

exports.DAY = DAY;
exports.dayKey = dayKey;
exports.dayStart = dayStart;
exports.daysSince = daysSince;
exports.minutesOf = minutesOf;
exports.at = at;
exports.inWindow = inWindow;
exports.makesOn = makesOn;
exports.gameKey = gameKey;
exports.parseKey = parseKey;
exports.slotTimes = slotTimes;
exports.slotAt = slotAt;
exports.upcoming = upcoming;
exports.whenText = whenText;
exports.planText = planText;
exports.scheduleText = scheduleText;
exports.plural = plural;
exports.hhmm = hhmm;
exports.WEEKDAYS = WEEKDAYS;
exports.MONTHS = MONTHS;
exports.seedOf = seedOf;
exports.rng = rng;
