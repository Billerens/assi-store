// The sign of the week: twelve «stars» (stars.json) score the week's days; the sign is the first
// star «in the house» of the second: «Сова в доме Скроллера». Pure: no Android.
var dates = require('./dates.js');

function known(day, key) {
  return Boolean(day && day.known && day.known[key]);
}

function tagged(record, tags) {
  return (record.tags || []).some(function (tag) { return tags.indexOf(String(tag).toLowerCase()) >= 0; });
}

/** The raw value of every metric of the stars over a week of days and its records. */
exports.values = function (days, records, goals) {
  goals = goals || {};
  var sum = function (key, flag) {
    return days.reduce(function (total, d) { return total + (known(d, flag) && typeof d[key] === 'number' ? d[key] : 0); }, 0);
  };
  var count = function (test) { return days.filter(test).length; };
  return {
    lateMin: sum('lateMin', 'screen'),
    earlyWake: count(function (d) { var m = dates.minutes(d.wake); return known(d, 'sleep') && m !== null && m >= 180 && m < 420; }),
    newPlaces: sum('newPlaces', 'places'),
    homeDays: count(function (d) { return known(d, 'places') && d.homeOnly === true && !d.paused; }),
    eatOut: (records || []).filter(function (r) { return r.kind === 'expense' && tagged(r, ['кафе и рестораны', 'доставка еды']); }).length,
    noSpendDays: count(function (d) { return known(d, 'spend') && d.noSpend === true; }),
    steps: sum('steps', 'steps'),
    longSleep: count(function (d) { return known(d, 'sleep') && d.sleepMin >= (d.sleepGoal || goals.sleep || 450) + 60; }),
    socialMin: sum('socialMin', 'screen'),
    noSocialDays: count(function (d) { return known(d, 'screen') && typeof d.socialMin === 'number' && d.socialMin < 10; }),
    overBudget: count(function (d) { return d.budgetOk === false; }),
    habitMarks: days.reduce(function (total, d) { return total + (d.habitIds || []).length; }, 0)
  };
};

/** Scores of the stars: value / full (the full mark — a setting per star), at most 2. */
exports.scores = function (stars, values, full) {
  var out = {};
  stars.forEach(function (star) {
    var mark = Number((full || {})[star.id]) || star.full;
    out[star.id] = Math.round(Math.min(2, (values[star.metric] || 0) / mark) * 100) / 100;
  });
  return out;
};

/** The sign from scores: { star, house, title, scores } or null when no star reached `min`. */
exports.sign = function (stars, scores, min) {
  var order = stars.slice().sort(function (a, b) { return (scores[b.id] || 0) - (scores[a.id] || 0) || (a.id < b.id ? -1 : 1); });
  if (!order.length || (scores[order[0].id] || 0) < (min === undefined ? 0.25 : min)) return null;
  var star = order[0];
  var house = order[1];
  return { star: star.id, house: house.id, title: star.title + ' в доме ' + house.gen, scores: scores };
};

/** The whole thing for a week. */
exports.ofWeek = function (stars, days, records, goals, settings) {
  settings = settings || {};
  var values = exports.values(days, records, goals);
  var scores = exports.scores(stars, values, settings.full);
  var sign = exports.sign(stars, scores, settings.minScore);
  if (sign) sign.values = values;
  return sign;
};
