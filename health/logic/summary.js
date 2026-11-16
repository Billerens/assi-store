// The summary of the owner's day: one honest picture that the pet, achievements, life-rpg and the
// horoscope all read (require('modules/health/main.js').day(date)). Pure: the engine gathers the
// records, this file adds them up.
//
// Fields whose source is missing are null, and `known` says which sources there were: what is
// not known breaks no chain and counts against nothing in any module.
var T = require('./time.js');
var Habits = require('./habits.js');
var Meds = require('./meds.js');
var Sleep = require('./sleep.js');
var Text = require('./text.js');

exports.FIELDS = ['date', 'paused', 'known', 'sleepMin', 'bedtime', 'wake', 'sleepFrom', 'sleepQuality',
  'steps', 'stepsGoal', 'distanceKm', 'workoutMin', 'waterMl', 'waterGoal', 'medsDue', 'medsTaken', 'medsLate',
  'habitsDue', 'habitsDone', 'habitIds', 'chains', 'screenMin', 'socialMin', 'unlocks', 'lateMin', 'lateAfter2Min',
  'places', 'newPlaces', 'newCells', 'farthestKm', 'homeOnly', 'spend', 'noSpend', 'deliveryLate', 'budgetOk',
  'focusMin', 'playMin', 'mood'];

/** The habit a record of kind 'habit' is about: data.habitId, a tag, or the title (from the chat). */
exports.habitIdOf = function (record, habits) {
  var data = record.data || {};
  if (data.habitId) return String(data.habitId);
  var ids = (habits || []).map(function (h) { return h.id; });
  var tags = record.tags || [];
  for (var i = 0; i < tags.length; i++) {
    var hit = ids.filter(function (id) { return String(id).toLowerCase() === String(tags[i]).toLowerCase(); })[0];
    if (hit) return hit;
  }
  var title = String(record.title || '').trim().toLowerCase();
  if (!title) return null;
  var byTitle = (habits || []).filter(function (h) { return String(h.title).trim().toLowerCase() === title; })[0];
  if (byTitle) return byTitle.id;
  var loose = (habits || []).filter(function (h) {
    var t = String(h.title).trim().toLowerCase();
    return t && (t.indexOf(title) >= 0 || title.indexOf(t) >= 0);
  })[0];
  return loose ? loose.id : null;
};

/** The sleep record of the night that ended on the morning of `date`: manual, then hc, then screen. */
exports.pickSleep = function (records, date) {
  var best = null;
  (records || []).forEach(function (record) {
    var data = record.data || {};
    if (data.night !== date) return;
    if (!best || Sleep.rank(data.from) > Sleep.rank(best.data.from) ||
      (Sleep.rank(data.from) === Sleep.rank(best.data.from) && record.id > best.id)) best = record;
  });
  return best;
};

function sum(list, fn) {
  return (list || []).reduce(function (total, item) { return total + (fn ? fn(item) : Number(item.amount) || 0); }, 0);
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

/** The summary. See the head of this file and health/README.md for every field. */
exports.build = function (input) {
  var s = input.settings;
  var date = input.date;
  var r = input.records || {};
  var bounds = T.bounds(date, s.dayEnd);
  var known = {
    sleep: false,
    steps: false,
    screen: false,
    places: Boolean(input.placesKnown),
    spend: Boolean(input.spendKnown)
  };

  // Sleep: the night that ended this morning.
  var sleep = exports.pickSleep(r.sleep, date);
  known.sleep = Boolean(sleep);
  var sleepData = sleep ? sleep.data || {} : {};

  // Steps: the calendar day's record (the way Health Connect counts them).
  var stepsRecord = (r.steps || []).filter(function (x) { return x.data && x.data.day === date; })[0] || null;
  known.steps = Boolean(stepsRecord);
  var steps = stepsRecord ? Math.round(Number(stepsRecord.amount) || 0) : null;

  // Screen of the owner's day.
  var screen = (r.screen || []).filter(function (x) { return x.data && x.data.day === date; })[0] || null;
  known.screen = Boolean(screen);
  var sd = screen ? screen.data || {} : {};

  // Medicines.
  var doses = Meds.withStatus(Meds.doses(input.meds || [], date, s.dayEnd), r.med || []);
  var medsTaken = doses.filter(function (d) { return d.status === 'taken' || d.status === 'late'; }).length;
  var medsLate = doses.filter(function (d) { return d.status === 'late'; }).length;

  // Habits.
  var habits = (input.habits || []).filter(function (h) { return !h.archived; });
  var doneAll = input.habitDone || {};
  var marked = {};
  (r.habit || []).forEach(function (record) {
    var id = exports.habitIdOf(record, input.habits || []);
    if (id) marked[id] = true;
  });
  var habitIds = Object.keys(marked);
  var due = habits.filter(function (h) { return Habits.isDue(h, date, doneAll[h.id] || {}); });
  var chains = {};
  habits.forEach(function (h) {
    chains[h.id] = Habits.chain(h, doneAll[h.id] || {}, input.pausedOn, date, s.freezesPerWeek);
  });

  // Places.
  var visits = r.visit || [];
  var placeIds = [];
  visits.forEach(function (v) {
    var id = v.data && v.data.place;
    if (id && placeIds.indexOf(id) < 0) placeIds.push(id);
  });
  var far = null;
  visits.forEach(function (v) {
    var km = v.data && typeof v.data.distanceKm === 'number' ? v.data.distanceKm : null;
    if (km !== null && (far === null || km > far)) far = km;
  });
  var homeIds = input.homeIds || [];
  var newPlaces = (r.place || []).filter(function (p) { return p.at >= bounds.from && p.at < bounds.to; }).length;

  // Money (from the spending module's records).
  var expenses = r.expense || [];
  var deliveryAfter = T.minutes(s.deliveryAfter);
  var dayEnd = T.minutes(s.dayEnd);
  var deliveryTag = String(s.deliveryTag || '').toLowerCase();
  var deliveryLate = expenses.filter(function (e) {
    var minute = T.minuteOfDay(e.at);
    var late = minute >= deliveryAfter || minute < dayEnd;
    return late && Number(e.amount) > 0 && (e.tags || []).indexOf(deliveryTag) >= 0;
  }).length;
  var purchases = expenses.filter(function (e) { return Number(e.amount) > 0; });

  var moods = (r.mood || []).slice().sort(function (a, b) { return a.at - b.at; });
  var water = sum(r.water, function (x) { return Text.toMl(x.amount, x.unit, s.glassMl); });

  var left = [];
  doses.forEach(function (d) { if (!d.status && left.indexOf(d.name) < 0) left.push(d.name); });
  due.forEach(function (h) { if (!marked[h.id] && left.indexOf(h.title) < 0) left.push(h.title); });

  return {
    date: date,
    paused: input.pausedType || null,
    known: known,
    sleepMin: known.sleep ? Math.round(Number(sleep.amount) || 0) : null,
    bedtime: known.sleep ? sleepData.bedtime || T.clock(sleep.at) : null,
    wake: known.sleep ? sleepData.wake || (sleepData.end ? T.clock(sleepData.end) : null) : null,
    sleepFrom: known.sleep ? sleepData.from || null : null,
    sleepQuality: known.sleep && typeof sleepData.quality === 'number' ? sleepData.quality : null,
    sleepConfidence: known.sleep && typeof sleepData.confidence === 'number' ? sleepData.confidence : null,
    sleepGoal: s.sleepGoal,
    steps: steps,
    stepsGoal: s.stepsGoal,
    stepsFrom: stepsRecord && stepsRecord.data ? stepsRecord.data.from || null : null,
    distanceKm: steps === null ? null : round1(steps * s.strideM / 1000),
    workoutMin: Math.round(sum(r.workout)),
    waterMl: Math.round(water),
    waterGoal: s.waterGoal,
    medsDue: doses.length,
    medsTaken: medsTaken,
    medsLate: medsLate,
    habitsDue: due.length,
    habitsDone: habitIds.length,
    habitIds: habitIds,
    chains: chains,
    screenMin: known.screen ? Math.round(Number(screen.amount) || 0) : null,
    socialMin: known.screen && typeof sd.social === 'number' ? sd.social : null,
    unlocks: known.screen && typeof sd.unlocks === 'number' ? sd.unlocks : null,
    lateMin: known.screen && typeof sd.late === 'number' ? sd.late : null,
    lateAfter2Min: known.screen && typeof sd.lateAfter2 === 'number' ? sd.lateAfter2 : null,
    places: placeIds,
    newPlaces: newPlaces,
    newCells: input.newCells || 0,
    farthestKm: far === null ? null : round1(far),
    homeOnly: known.places ? visits.length > 0 && placeIds.every(function (id) { return homeIds.indexOf(id) >= 0; }) : null,
    spend: known.spend ? Math.round(sum(expenses) * 100) / 100 : null,
    noSpend: known.spend ? purchases.length === 0 : null,
    deliveryLate: known.spend ? deliveryLate : null,
    budgetOk: typeof input.budgetOk === 'boolean' ? input.budgetOk : null,
    focusMin: Math.round(sum(r.focus)),
    playMin: Math.round(sum(r.play)),
    mood: moods.length ? Number(moods[moods.length - 1].amount) : null,
    left: left
  };
};
