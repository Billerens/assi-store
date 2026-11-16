// Steps: the phone's step counter between two readings, and the choice between sources. Pure.
var T = require('./time.js');

/**
 * Steps since the previous reading of TYPE_STEP_COUNTER (counted from the phone's boot).
 * prev, now: { value, boot (ms the phone started) }. After a restart the counter starts from
 * zero again: then the steps are the new value itself.
 */
exports.delta = function (prev, now) {
  if (!now || now.value === null || now.value === undefined) return 0;
  if (!prev || prev.value === null || prev.value === undefined) return 0;
  var rebooted = (prev.boot && now.boot && Math.abs(now.boot - prev.boot) > 120000) || now.value < prev.value;
  var steps = rebooted ? now.value : now.value - prev.value;
  return Math.max(0, Math.round(steps));
};

/**
 * Spreads `steps` evenly over the hours between two moments (no further back than maxHours):
 * → [{ date, hour, steps }] in whole steps, adding up to `steps`.
 */
exports.spread = function (steps, fromMs, toMs, maxHours) {
  if (steps <= 0) return [];
  var start = Math.max(fromMs || toMs, toMs - (maxHours || 24) * 3600000);
  if (!(toMs > start)) return [{ date: T.ymd(toMs), hour: new Date(toMs).getHours(), steps: steps }];
  var parts = [];
  var cursor = start;
  while (cursor < toMs) {
    var d = new Date(cursor);
    var hourEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours() + 1).getTime();
    var until = Math.min(hourEnd, toMs);
    parts.push({ date: T.ymd(cursor), hour: d.getHours(), ms: until - cursor });
    cursor = until;
  }
  var total = toMs - start;
  var given = 0;
  var out = parts.map(function (part, i) {
    var n = i === parts.length - 1 ? steps - given : Math.floor(steps * part.ms / total);
    given += n;
    return { date: part.date, hour: part.hour, steps: n };
  });
  return out.filter(function (part) { return part.steps > 0; });
};

function zeros(n) {
  var out = [];
  for (var i = 0; i < n; i++) out.push(0);
  return out;
}
exports.zeros = zeros;

/** Adds spread parts into { date: [24 numbers] }. */
exports.addParts = function (days, parts) {
  parts.forEach(function (part) {
    var hours = days[part.date] || (days[part.date] = zeros(24));
    hours[part.hour] += part.steps;
  });
  return days;
};

function total(hours) {
  return (hours || []).reduce(function (a, b) { return a + (Number(b) || 0); }, 0);
}
exports.total = total;

/**
 * The day's steps from the sources the owner chose: source 'hc' | 'sensor' | 'both',
 * priority 'hc' | 'sensor' when both have data. → { hours, from } or null.
 */
exports.pick = function (hcHours, sensorHours, source, priority) {
  var hc = hcHours && total(hcHours) > 0 ? hcHours : null;
  var sensor = sensorHours && total(sensorHours) > 0 ? sensorHours : null;
  if (source === 'hc') return hc ? { hours: hc, from: 'hc' } : null;
  if (source === 'sensor') return sensor ? { hours: sensor, from: 'sensor' } : null;
  if (hc && sensor) return priority === 'sensor' ? { hours: sensor, from: 'sensor' } : { hours: hc, from: 'hc' };
  if (hc) return { hours: hc, from: 'hc' };
  if (sensor) return { hours: sensor, from: 'sensor' };
  return null;
};
