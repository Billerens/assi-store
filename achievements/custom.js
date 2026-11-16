// Functions for rules of type `custom` — conditions the rule language cannot say in one line.
// Each takes (ctx, def) and returns { progress, best, metAt: [date per tier], matched, unknown }.
//   ctx: { days, goals, dayEndHour, home() → { lat, lon } | null, places() → place records,
//          visits() → visit records, cells() → { cell: first date } | null, tz(date) → minutes east of UTC }
// Pure: data comes in through ctx. Add a function here, name it in a rule: { "type": "custom", "fn": "…" }.
var dates = require('./dates.js');
var rules = require('./rules.js');

function tiers(def) {
  return rules.tiersOf(def);
}

/** Sunrise at a place on a date, in minutes after midnight UTC; null in a polar night or day. */
exports.sunriseUtc = function (date, lat, lon) {
  var rad = Math.PI / 180;
  var parsed = dates.parse(date);
  var start = new Date(parsed.getFullYear(), 0, 0);
  var n = Math.round((parsed.getTime() - start.getTime()) / 864e5);
  var lngHour = lon / 15;
  var t = n + (6 - lngHour) / 24;
  var m = 0.9856 * t - 3.289;
  var l = m + 1.916 * Math.sin(m * rad) + 0.020 * Math.sin(2 * m * rad) + 282.634;
  l = ((l % 360) + 360) % 360;
  var ra = Math.atan(0.91764 * Math.tan(l * rad)) / rad;
  ra = ((ra % 360) + 360) % 360;
  ra = (ra + Math.floor(l / 90) * 90 - Math.floor(ra / 90) * 90) / 15;
  var sinDec = 0.39782 * Math.sin(l * rad);
  var cosDec = Math.cos(Math.asin(sinDec));
  var cosH = (Math.cos(90.833 * rad) - sinDec * Math.sin(lat * rad)) / (cosDec * Math.cos(lat * rad));
  if (cosH > 1 || cosH < -1) return null;
  var h = (360 - Math.acos(cosH) / rad) / 15;
  var ut = h + ra - 0.06571 * t - 6.622 - lngHour;
  ut = ((ut % 24) + 24) % 24;
  return ut * 60;
};

/** Рассвет: woke up before the sun rose over home. */
exports.dawn = function (ctx, def) {
  var home = ctx.home ? ctx.home() : null;
  if (!home || home.lat === undefined || home.lon === undefined) return { progress: 0, metAt: [], unknown: true };
  var metAt = [];
  var matched = 0;
  (ctx.days || []).forEach(function (day) {
    if (!day.known || !day.known.sleep) return;
    var wake = dates.minutes(day.wake);
    var sunrise = exports.sunriseUtc(day.date, Number(home.lat), Number(home.lon));
    if (wake === null || sunrise === null) return;
    var local = sunrise + (ctx.tz ? ctx.tz(day.date) : 0);
    if (wake < local) {
      matched++;
      if (!metAt[0]) metAt[0] = day.date;
    }
  });
  return { progress: metAt[0] ? 1 : 0, metAt: metAt, matched: matched };
};

/**
 * Возвращение к режиму: after `late` (3) late nights in a row, `good` (3) nights in a row with the
 * bedtime no later than the goal. A night is late when the bedtime is past the goal by more than
 * `tolerance` minutes (0).
 */
exports.comeback = function (ctx, def) {
  var rule = def.rule || {};
  var lateNeed = Number(rule.late) || 3;
  var goodNeed = Number(rule.good) || 3;
  var tolerance = Number(rule.tolerance) || 0;
  var goal = dates.night(ctx.goals && ctx.goals.bedtime ? ctx.goals.bedtime : '00:00');
  var lateRun = 0;
  var goodRun = 0;
  var armed = false;
  var metAt = [];
  (ctx.days || []).forEach(function (day) {
    if (day.paused || !day.known || !day.known.sleep) return;
    var bed = dates.night(day.bedtime);
    if (bed === null) return;
    if (bed - goal > tolerance) {
      lateRun++;
      goodRun = 0;
      if (lateRun >= lateNeed) armed = true;
    } else {
      lateRun = 0;
      if (armed) goodRun++;
      if (armed && goodRun >= goodNeed && !metAt[0]) metAt[0] = day.date;
    }
  });
  return { progress: armed ? Math.min(goodRun, goodNeed) : 0, best: metAt[0] ? goodNeed : goodRun, metAt: metAt };
};

/** Феникс: a chain of one habit broke after `before` (3) days, then the same habit got `after` (14). */
exports.phoenix = function (ctx, def) {
  var rule = def.rule || {};
  var before = Number(rule.before) || 3;
  var after = Number(rule.after) || 14;
  var last = {};
  var broken = {};
  var best = 0;
  var metAt = [];
  (ctx.days || []).forEach(function (day) {
    var chains = day.chains || {};
    Object.keys(chains).forEach(function (habit) {
      var now = Number(chains[habit]) || 0;
      var was = last[habit];
      if (was !== undefined && now < was && was >= before && !day.paused) broken[habit] = true;
      if (broken[habit]) {
        if (now > best) best = now;
        if (now >= after && !metAt[0]) metAt[0] = day.date;
      }
      last[habit] = now;
    });
  });
  return { progress: best, best: best, metAt: metAt };
};

/** Картограф: open cells of the map — the RPG's cells, or the cells of visits. */
exports.cells = function (ctx, def) {
  var cells = ctx.cells ? ctx.cells() : null;
  if (!cells) return { progress: 0, metAt: [], unknown: true };
  var firsts = Object.keys(cells).map(function (cell) { return String(cells[cell]).slice(0, 10); }).sort();
  var metAt = tiers(def).map(function (need) { return firsts.length >= need ? firsts[need - 1] : null; });
  return { progress: firsts.length, best: firsts.length, metAt: metAt, matched: firsts.length };
};

/** Завсегдатай: `visits` (20) visits to one place that is not home or work. */
exports.regular = function (ctx, def) {
  var visits = ctx.visits ? ctx.visits() : null;
  if (!visits) return { progress: 0, metAt: [], unknown: true };
  var types = {};
  (ctx.places ? ctx.places() : []).forEach(function (place) {
    var data = place.data || {};
    if (data.id !== undefined) types[data.id] = data.type || 'other';
  });
  var by = {};
  visits.slice().sort(function (a, b) { return a.at - b.at; }).forEach(function (visit) {
    var place = (visit.data || {}).place;
    if (place === undefined || place === null) return;
    var type = types[place] || 'other';
    if (type === 'home' || type === 'work') return;
    (by[place] = by[place] || []).push(visit.at);
  });
  var need = tiers(def);
  var metAt = [];
  var best = 0;
  Object.keys(by).forEach(function (place) {
    var times = by[place];
    if (times.length > best) best = times.length;
    need.forEach(function (count, i) {
      if (times.length >= count) {
        var date = dates.ymd(times[count - 1]);
        if (!metAt[i] || date < metAt[i]) metAt[i] = date;
      }
    });
  });
  return { progress: best, best: best, metAt: metAt, matched: Object.keys(by).length };
};

/** Ночной путник: a new place first visited after `hour` (23:00) and before the end of the day. */
exports.nightPlace = function (ctx, def) {
  var rule = def.rule || {};
  var from = Number(rule.hour === undefined ? 23 : rule.hour);
  var end = ctx.dayEndHour === undefined ? 5 : ctx.dayEndHour;
  var places = ctx.places ? ctx.places() : null;
  var visits = ctx.visits ? ctx.visits() : [];
  if (!places && !visits.length) return { progress: 0, metAt: [], unknown: true };
  var times = (places || []).map(function (place) { return place.at; })
    .concat(visits.filter(function (visit) { return visit.data && visit.data.firstTime; }).map(function (visit) { return visit.at; }));
  var night = times.filter(function (time) { var hour = dates.hour(time); return hour >= from || hour < end; }).sort(function (a, b) { return a - b; });
  return { progress: night.length ? 1 : 0, metAt: night.length ? [dates.current(night[0], end)] : [], matched: night.length };
};
