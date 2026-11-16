// Screen time of the owner's day from usage events. Pure.
//
// Events: [{ time, type, package }] with type 'resumed' | 'paused' | 'stopped' | 'screen-on' |
// 'screen-off' | 'unlock' — the shape of lib/usage.js usage.events() and of the module's own
// fallback reader. Without app events (only the screen log) the per-app fields stay empty.
var Sleep = require('./sleep.js');

function clip(intervals, from, to) {
  var ms = 0;
  intervals.forEach(function (i) { ms += Math.max(0, Math.min(i[1], to) - Math.max(i[0], from)); });
  return ms;
}

function top(map, n) {
  var out = {};
  Object.keys(map).sort(function (a, b) { return map[b] - map[a]; }).slice(0, n).forEach(function (key) { out[key] = map[key]; });
  return out;
}

/**
 * opts: { from, to (the owner's day), now, night: { from, to }, after: moment (late after 02:00),
 *         social: { package: true }, appsTop, withApps (are app events there at all) }
 * → { minutes, unlocks, social, late, lateAfter2, first, last, apps, launches, sessions }
 */
exports.aggregate = function (events, opts) {
  var to = Math.min(opts.to, opts.now || opts.to);
  var from = opts.from;
  var list = (events || []).slice().sort(function (a, b) { return a.time - b.time; });
  var screenEvents = list.filter(function (e) { return e.type === 'screen-on' || e.type === 'screen-off' || e.type === 'unlock'; });
  var ons = Sleep.onIntervals(screenEvents, from, to);
  var minutes = clip(ons, from, to) / 60000;
  var unlocks = list.filter(function (e) { return e.type === 'unlock' && e.time >= from && e.time < to; }).length;
  var late = opts.night ? clip(ons, opts.night.from, Math.min(opts.night.to, to)) / 60000 : null;
  var lateAfter2 = opts.after ? clip(ons, opts.after, to) / 60000 : null;
  var first = null;
  var last = null;
  ons.forEach(function (i) {
    if (i[1] <= from || i[0] >= to) return;
    if (first === null) first = Math.max(i[0], from);
    last = Math.min(i[1], to);
  });

  // Apps in front: from 'resumed' to its 'paused'/'stopped', another app's 'resumed' or the screen going off.
  var appMs = {};
  var launches = {};
  var current = null;
  var since = 0;
  var previous = null;
  var close = function (at) {
    if (current === null) return;
    var ms = Math.max(0, Math.min(at, to) - Math.max(since, from));
    if (ms > 0) appMs[current] = (appMs[current] || 0) + ms;
    previous = current;
    current = null;
  };
  list.forEach(function (e) {
    if (e.type === 'resumed' && e.package) {
      if (current !== e.package) {
        close(e.time);
        if (e.time >= from && e.time < to && previous !== e.package) launches[e.package] = (launches[e.package] || 0) + 1;
        current = e.package;
        since = e.time;
      }
    } else if ((e.type === 'paused' || e.type === 'stopped') && e.package === current) {
      close(e.time);
    } else if (e.type === 'screen-off') {
      close(e.time);
      previous = null;
    }
  });
  close(to);

  var apps = {};
  var social = 0;
  Object.keys(appMs).forEach(function (pkg) {
    var min = appMs[pkg] / 60000;
    if (min < 0.5) return;
    apps[pkg] = Math.round(min);
    if (opts.social && opts.social[pkg]) social += min;
  });
  var withApps = opts.withApps !== undefined ? opts.withApps : list.some(function (e) { return e.type === 'resumed'; });
  return {
    minutes: Math.round(minutes),
    unlocks: unlocks,
    social: withApps ? Math.round(social) : null,
    late: late === null ? null : Math.round(late),
    lateAfter2: lateAfter2 === null ? null : Math.round(lateAfter2),
    first: first,
    last: last,
    apps: withApps ? top(apps, opts.appsTop || 15) : {},
    launches: withApps ? top(launches, opts.appsTop || 15) : {},
    sessions: ons.length
  };
};

/** The owner's own screen log ([[ms, 'on'|'off'|'unlocked'], …]) as usage-like events. */
exports.fromLog = function (log) {
  var types = { on: 'screen-on', off: 'screen-off', unlocked: 'unlock' };
  return (log || []).filter(function (item) { return types[item[1]]; })
    .map(function (item) { return { time: item[0], type: types[item[1]] }; });
};
