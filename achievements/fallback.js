// The day summary built straight from the shared base (lib/base.js) when the «Здоровье» module is
// not installed. Same shape as health's day(date); what nobody recorded stays unknown
// (known.* = false), so it never breaks a streak and never counts against the owner.
// Pure: records come in as arguments. The same file is in achievements, rpg and horoscope.
var dates = require('./dates.js');

function number(value) {
  return value === null || value === undefined || value === '' || isNaN(Number(value)) ? null : Number(value);
}

function tagged(record, tag) {
  return (record.tags || []).some(function (item) { return String(item).toLowerCase() === tag; });
}

/** Normalizes goals the health module (or its settings) gave, whatever the field names. */
exports.goals = function (given) {
  var g = given || {};
  var pick = function (names, fallback) {
    for (var i = 0; i < names.length; i++) {
      var value = g[names[i]];
      if (value !== undefined && value !== null && value !== '') return value;
    }
    return fallback;
  };
  var dayEnd = pick(['dayEnd', 'dayEndAt', 'dayClose', 'endOfDay'], '05:00');
  return {
    steps: Number(pick(['steps', 'stepsGoal', 'stepGoal'], 8000)),
    sleep: Number(pick(['sleep', 'sleepMin', 'sleepGoal'], 450)),
    bedtime: String(pick(['bedtime', 'bedtimeGoal', 'bedtimeTarget', 'bed'], '00:00')),
    water: Number(pick(['water', 'waterMl', 'waterGoal'], 2000)),
    stride: Number(pick(['stride', 'strideM', 'stepLength'], 0.75)),
    dayEnd: typeof dayEnd === 'number' ? dates.hhmm(dayEnd * 60) : String(dayEnd),
    dayEndHour: typeof dayEnd === 'number' ? dayEnd : dates.minutes(dayEnd) / 60,
    socialLimit: Number(pick(['socialLimit', 'socialMax'], 90)),
    screenLimit: Number(pick(['screenLimit', 'screenMax'], 240))
  };
};

/**
 * The summary of one day.
 *   date     'YYYY-MM-DD'
 *   records  base rows around that day (kind, at, title, amount, unit, tags, data, source)
 *   options  { goals (normalized), deliveryHour, pauses: [pause rows], placeTypes: { id: type },
 *              spendTracked, placesTracked }
 */
exports.summarize = function (date, records, options) {
  options = options || {};
  var goals = options.goals || exports.goals({});
  var endHour = goals.dayEndHour === undefined ? 5 : goals.dayEndHour;
  var from = dates.start(date, endHour);
  var to = dates.start(dates.add(date, 1), endHour);
  var inDay = function (record) { return record.at >= from && record.at < to; };
  var of = function (kind) { return records.filter(function (record) { return record.kind === kind; }); };
  var sum = function (list) { return list.reduce(function (total, record) { return total + (number(record.amount) || 0); }, 0); };

  var day = { date: date, source: 'base', paused: null };

  // Pause: the shared switch of the five modules.
  (options.pauses || of('pause')).forEach(function (record) {
    var data = record.data || {};
    var until = data.until ? String(data.until).slice(0, 10) : null;
    var started = dates.ymd(record.at);
    if (dates.diff(date, started) >= 0 && (!until || dates.diff(until, date) >= 0)) day.paused = data.type || 'rest';
  });

  // Sleep belongs to the morning the owner woke up.
  var sleep = of('sleep').filter(function (record) {
    var night = record.data && record.data.night;
    if (night) return night === date;
    return record.at >= dates.parse(dates.add(date, -1)).getTime() + 18 * 3600e3 && record.at < dates.parse(date).getTime() + 14 * 3600e3;
  }).pop();
  if (sleep) {
    var sd = sleep.data || {};
    day.sleepMin = number(sleep.amount);
    day.bedtime = sd.bedtime || dates.hhmm(dates.hour(sleep.at) * 60);
    day.wake = sd.wake || (sd.end ? dates.hhmm(dates.hour(sd.end) * 60) : (day.sleepMin !== null ? dates.hhmm(dates.hour(sleep.at + day.sleepMin * 60000) * 60) : null));
    day.sleepFrom = sd.from || sleep.source || 'manual';
    day.sleepQuality = number(sd.quality);
  }

  var steps = of('steps').filter(function (record) {
    return record.data && record.data.day ? record.data.day === date : dates.ymd(record.at) === date;
  });
  if (steps.length) {
    day.steps = Math.max.apply(null, steps.map(function (record) { return number(record.amount) || 0; }));
    day.distanceKm = Math.round(day.steps * goals.stride / 100) / 10;
  }
  day.stepsGoal = goals.steps;

  day.workoutMin = sum(of('workout').filter(inDay));
  day.waterMl = of('water').filter(inDay).reduce(function (total, record) {
    var amount = number(record.amount) || 0;
    return total + (String(record.unit || '').toLowerCase() === 'l' ? amount * 1000 : amount);
  }, 0);
  day.waterGoal = goals.water;

  var meds = of('med').filter(inDay);
  day.medsDue = meds.length;
  day.medsTaken = meds.filter(function (record) { var s = (record.data || {}).status; return s === 'taken' || s === 'late'; }).length;
  day.medsLate = meds.filter(function (record) { return (record.data || {}).status === 'late'; }).length;

  var habits = of('habit').filter(inDay);
  var ids = [];
  habits.forEach(function (record) {
    var id = (record.data && record.data.habitId) || (record.tags && record.tags[0]) || record.title;
    if (id && ids.indexOf(id) < 0) ids.push(String(id));
  });
  day.habitIds = ids;
  day.habitsDone = ids.length;
  day.habitsDue = null;
  day.chains = {};

  var screen = of('screen').filter(function (record) {
    return record.data && record.data.day ? record.data.day === date : dates.ymd(record.at) === date;
  }).pop();
  if (screen) {
    var sc = screen.data || {};
    day.screenMin = number(screen.amount);
    day.socialMin = number(sc.social);
    day.unlocks = number(sc.unlocks);
    day.lateMin = number(sc.late);
    day.lateAfter2Min = number(sc.lateAfter2);
    day.launches = sc.launches || null;
  }

  var visits = of('visit').filter(inDay);
  var newPlaces = of('place').filter(inDay);
  var types = options.placeTypes || {};
  day.places = [];
  visits.forEach(function (record) {
    var place = record.data && record.data.place;
    if (place !== undefined && place !== null && day.places.indexOf(place) < 0) day.places.push(place);
  });
  day.newPlaces = newPlaces.length;
  day.newCells = visits.filter(function (record) { return record.data && record.data.firstTime; }).length;
  day.farthestKm = visits.reduce(function (most, record) { return Math.max(most, number((record.data || {}).distanceKm) || 0); }, 0);
  day.homeOnly = visits.length > 0 && visits.every(function (record) { return types[(record.data || {}).place] === 'home'; });

  var spent = of('expense').filter(inDay);
  var deliveryHour = options.deliveryHour === undefined ? 22 : options.deliveryHour;
  day.spend = Math.round(sum(spent) * 100) / 100;
  day.noSpend = !spent.some(function (record) { return (number(record.amount) || 0) > 0; });
  day.deliveryLate = spent.filter(function (record) {
    var hour = dates.hour(record.at);
    return tagged(record, 'доставка еды') && (hour >= deliveryHour || hour < endHour);
  }).length;
  day.budgetOk = null;

  day.focusMin = sum(of('focus').filter(inDay));
  day.playMin = sum(of('play').filter(inDay));
  var mood = of('mood').filter(inDay).pop();
  day.mood = mood ? number(mood.amount) : null;

  day.known = {
    sleep: Boolean(sleep && day.sleepMin !== null),
    steps: steps.length > 0,
    screen: Boolean(screen && day.screenMin !== null),
    places: visits.length > 0 || newPlaces.length > 0 || Boolean(options.placesTracked),
    spend: spent.length > 0 || Boolean(options.spendTracked)
  };
  return day;
};

/**
 * Brings a summary from any source to one shape: every field the rules read exists, `known`
 * has all five flags. A field the source did not give is null and stays unknown.
 */
exports.normalize = function (day) {
  if (!day) return null;
  var out = {};
  Object.keys(day).forEach(function (key) { out[key] = day[key]; });
  var known = day.known || {};
  out.known = {
    sleep: known.sleep !== undefined ? Boolean(known.sleep) : number(day.sleepMin) !== null,
    steps: known.steps !== undefined ? Boolean(known.steps) : number(day.steps) !== null,
    screen: known.screen !== undefined ? Boolean(known.screen) : number(day.screenMin) !== null,
    places: known.places !== undefined ? Boolean(known.places) : Array.isArray(day.places),
    spend: known.spend !== undefined ? Boolean(known.spend) : day.spend !== undefined && day.spend !== null
  };
  out.date = String(day.date || '').slice(0, 10);
  out.paused = day.paused || null;
  out.habitIds = Array.isArray(day.habitIds) ? day.habitIds.map(String) : [];
  out.chains = day.chains && typeof day.chains === 'object' ? day.chains : {};
  out.places = Array.isArray(day.places) ? day.places : [];
  return out;
};
