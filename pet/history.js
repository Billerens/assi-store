// One line a day of the pet's mood: { date, morning, evening, energyAvg, n, sum, states }. Pure.

function minutes(hm) {
  var m = /^(\d{1,2}):(\d{2})$/.exec(String(hm || ''));
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
}

/**
 * Adds one computed mood to the history. stamp: { date, minute, state, energy, tick }; opts:
 * { morningUntil, eveningFrom, dayEnd, keepDays, today }. Returns the new history (sorted, trimmed).
 */
exports.add = function (history, stamp, opts) {
  var list = (history || []).slice();
  var row = null;
  for (var i = 0; i < list.length; i++) {
    if (list[i].date === stamp.date) {
      row = list[i] = JSON.parse(JSON.stringify(list[i]));
      break;
    }
  }
  if (!row) {
    row = { date: stamp.date, morning: null, evening: null, energyAvg: null, n: 0, sum: 0, states: {} };
    list.push(row);
  }
  var end = minutes(opts.dayEnd || '05:00');
  // The minute of the owner's day: after midnight it is still the evening.
  var m = stamp.minute < end ? stamp.minute + 1440 : stamp.minute;
  if (m < minutes(opts.morningUntil || '12:00') && stamp.state !== 'asleep' && stamp.state !== 'woken') row.morning = stamp.state;
  if (m >= minutes(opts.eveningFrom || '18:00') && stamp.state !== 'asleep' && stamp.state !== 'woken') row.evening = stamp.state;
  row.states = row.states || {};
  // Only the regular recount counts towards the averages: marks and screen events come in bursts.
  if (stamp.tick !== false) {
    if (typeof stamp.energy === 'number') {
      row.n = (row.n || 0) + 1;
      row.sum = (row.sum || 0) + stamp.energy;
      row.energyAvg = Math.round(row.sum / row.n);
    }
    row.states[stamp.state] = (row.states[stamp.state] || 0) + 1;
  }
  list.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
  var keep = opts.keepDays || 730;
  return list.length > keep ? list.slice(list.length - keep) : list;
};

/** The state that stood for most of the day (for the strip), the evening's when there is a tie. */
exports.main = function (row) {
  if (!row) return null;
  var best = row.evening || row.morning || null;
  var count = best && row.states ? row.states[best] || 0 : 0;
  Object.keys(row.states || {}).forEach(function (state) {
    if (state === 'asleep' || state === 'woken') return;
    if (row.states[state] > count) {
      best = state;
      count = row.states[state];
    }
  });
  return best;
};

/** Days in a row without the owner looking (the last seen date to today). */
exports.gap = function (lastSeen, today) {
  if (!lastSeen) return 0;
  var a = new Date(lastSeen + 'T12:00:00');
  var b = new Date(today + 'T12:00:00');
  return Math.round((b - a) / 864e5);
};
