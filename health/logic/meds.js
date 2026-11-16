// Medicines on a schedule: which doses fall on the owner's day and what became of each. Pure.
//
// med: { id, name, dose, times: ['09:00', '21:00'], days: [1..7] (empty = every day),
//        from: 'YYYY-MM-DD' | null, until: 'YYYY-MM-DD' | null, note, remind: true }
// A dose: { medId, name, dose, time, due (ms), date (calendar date of the dose) }.
// A record of the base: kind 'med', data: { medId, due, status: 'taken'|'late'|'skipped'|'missed' }.
var T = require('./time.js');

/** Does the course run on that calendar date? */
exports.active = function (med, date) {
  if (!med || med.archived) return false;
  if (med.from && date < med.from) return false;
  if (med.until && date > med.until) return false;
  var days = Array.isArray(med.days) && med.days.length ? med.days.map(Number) : null;
  return !days || days.indexOf(T.weekday(date)) >= 0;
};

function dosesOn(med, date) {
  if (!exports.active(med, date)) return [];
  return (med.times || []).map(function (time) {
    return { medId: med.id, name: med.name, dose: med.dose || '', time: time, due: T.at(date, time), date: date };
  });
}

/**
 * The doses of the owner's day: the calendar date's doses from dayEnd on, plus the next
 * calendar date's doses before dayEnd (a pill at 01:00 belongs to the evening before).
 */
exports.doses = function (meds, date, dayEnd) {
  var end = T.minutes(dayEnd) || 0;
  var out = [];
  (meds || []).forEach(function (med) {
    dosesOn(med, date).forEach(function (dose) { if (T.minutes(dose.time) >= end) out.push(dose); });
    dosesOn(med, T.addDays(date, 1)).forEach(function (dose) { if (T.minutes(dose.time) < end) out.push(dose); });
  });
  return out.sort(function (a, b) { return a.due - b.due; });
};

/** 'taken' when within lateMin of the due time (or earlier), else 'late'. */
exports.statusFor = function (takenAt, due, lateMin) {
  return takenAt - due > lateMin * 60000 ? 'late' : 'taken';
};

/** Each dose with what the records say: status null — nothing yet. */
exports.withStatus = function (doses, records) {
  var byKey = {};
  (records || []).forEach(function (record) {
    var data = record.data || {};
    if (!data.medId || !data.due) return;
    var key = data.medId + '@' + data.due;
    // The latest word wins: "skipped" can be changed to "taken".
    if (!byKey[key] || record.at >= byKey[key].at) byKey[key] = record;
  });
  return doses.map(function (dose) {
    var record = byKey[dose.medId + '@' + dose.due];
    var out = {};
    Object.keys(dose).forEach(function (key) { out[key] = dose[key]; });
    out.status = record ? record.data.status : null;
    out.recordId = record ? record.id : null;
    out.takenAt = record ? record.at : null;
    return out;
  });
};

/** Doses whose time has passed with no record: they become 'missed' when the day closes. */
exports.missed = function (dosesWithStatus) {
  return dosesWithStatus.filter(function (dose) { return !dose.status; });
};

/** A medicine as the owner typed it, made right; throws when it cannot be kept. */
exports.clean = function (input, now) {
  var name = String(input.name || '').trim();
  if (!name) throw new Error('У лекарства должно быть название');
  var times = (Array.isArray(input.times) ? input.times : String(input.times || '').split(/[,;\s]+/))
    .map(function (t) { return T.normalizeTime(t); }).filter(function (t) { return t; });
  var unique = [];
  times.forEach(function (t) { if (unique.indexOf(t) < 0) unique.push(t); });
  if (!unique.length) throw new Error('Укажите время приёма, например 09:00');
  var days = (Array.isArray(input.days) ? input.days : []).map(Number).filter(function (d) { return d >= 1 && d <= 7; });
  var date = function (value) { return T.isDate(value) ? String(value) : null; };
  return {
    id: input.id ? String(input.id) : 'm' + Number(now || Date.now()).toString(36),
    name: name,
    dose: String(input.dose || '').trim(),
    times: unique.sort(),
    days: days.length === 7 ? [] : days.sort(),
    from: date(input.from),
    until: date(input.until),
    note: String(input.note || '').trim(),
    remind: input.remind !== false,
    archived: Boolean(input.archived)
  };
};
