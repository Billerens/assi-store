// Sleep without a watch: the longest stretch with the screen off. Pure.
//
// Screen events are [{ time, type }] with type 'screen-on' | 'screen-off' | 'unlock' (an unlock
// means the screen is on). From them come the on-intervals; between them lie the off-gaps.
// Gaps split by a short look at the phone (shorter than `glue` minutes) are glued together and
// that look counts as a wake. The longest glued stretch, not shorter than `minGap`, is the sleep.

/**
 * Screen-on intervals [[from, to], …] inside [from, to). `initiallyOn` says whether the screen
 * was on at `from` (when unknown, it is taken from the first event: an 'off' first means on).
 */
exports.onIntervals = function (events, from, to, initiallyOn) {
  var list = (events || []).filter(function (e) { return e && e.time !== undefined; })
    .slice().sort(function (a, b) { return a.time - b.time; });
  var inside = list.filter(function (e) { return e.time >= from && e.time < to; });
  var before = list.filter(function (e) { return e.time < from; });
  var on;
  if (initiallyOn !== undefined && initiallyOn !== null) {
    on = Boolean(initiallyOn);
  } else if (before.length) {
    on = before[before.length - 1].type !== 'screen-off';
  } else {
    on = inside.length ? inside[0].type === 'screen-off' : false;
  }
  var out = [];
  var start = on ? from : null;
  inside.forEach(function (e) {
    if (e.type === 'screen-off') {
      if (start !== null) out.push([start, e.time]);
      start = null;
    } else if (start === null) {
      start = e.time;
    }
  });
  if (start !== null) out.push([start, to]);
  // Merge touching or overlapping intervals.
  var merged = [];
  out.forEach(function (interval) {
    var last = merged[merged.length - 1];
    if (last && interval[0] <= last[1]) last[1] = Math.max(last[1], interval[1]);
    else if (interval[1] > interval[0]) merged.push([interval[0], interval[1]]);
  });
  return merged;
};

/**
 * The sleep inside the window [winFrom, winTo) as seen at `now`:
 *   { start, end, minutes, wakes, wakeMin, ongoing, clipped, confidence } or null.
 * opts: { minGap (min), glue (min) }.
 */
exports.detect = function (onIntervals, winFrom, winTo, now, opts) {
  var minGap = (opts && opts.minGap !== undefined ? opts.minGap : 180) * 60000;
  var glue = (opts && opts.glue !== undefined ? opts.glue : 20) * 60000;
  var end = Math.min(winTo, now);
  if (end <= winFrom) return null;
  var ons = (onIntervals || []).map(function (i) { return [Math.max(i[0], winFrom), Math.min(i[1], end)]; })
    .filter(function (i) { return i[1] > i[0]; });
  // Off-gaps between the on-intervals.
  var gaps = [];
  var cursor = winFrom;
  ons.forEach(function (i) {
    if (i[0] > cursor) gaps.push([cursor, i[0]]);
    cursor = Math.max(cursor, i[1]);
  });
  if (end > cursor) gaps.push([cursor, end]);
  if (!gaps.length) return null;
  // Glue gaps separated by a short look at the phone.
  var blocks = [];
  var block = { start: gaps[0][0], end: gaps[0][1], wakes: 0, wakeMs: 0 };
  for (var k = 1; k < gaps.length; k++) {
    var awake = gaps[k][0] - block.end;
    if (awake <= glue) {
      block.wakes++;
      block.wakeMs += awake;
      block.end = gaps[k][1];
    } else {
      blocks.push(block);
      block = { start: gaps[k][0], end: gaps[k][1], wakes: 0, wakeMs: 0 };
    }
  }
  blocks.push(block);
  var best = null;
  blocks.forEach(function (b) {
    b.sleepMs = b.end - b.start - b.wakeMs;
    if (!best || b.sleepMs > best.sleepMs) best = b;
  });
  if (!best || best.sleepMs < minGap) return null;
  var ongoing = end === now && now < winTo && best.end >= end - 60000;
  var clipped = best.start <= winFrom;
  var confidence = 0.7 - Math.max(0, best.wakes - 2) * 0.1 - (clipped ? 0.25 : 0);
  return {
    start: best.start,
    end: best.end,
    minutes: Math.round(best.sleepMs / 60000),
    wakes: best.wakes,
    wakeMin: Math.round(best.wakeMs / 60000),
    ongoing: ongoing,
    clipped: clipped,
    confidence: Math.max(0.2, Math.round(confidence * 100) / 100)
  };
};

/**
 * The bedtime series as a hint for the sleep found by the screen. Under «Сериал на ночь» the screen
 * goes off when the episode starts, not when the owner falls asleep; the series writes
 * { kind: 'story', at: the moment he fell asleep, data: { asleep: true } } (docs/modules/bedtime-series.md).
 * stories: such records; found: Sleep.detect's answer; maxShiftMin — how far the start may move.
 * → found with the start at the last such moment within [start, start + maxShift] (minutes, a bit
 * more confidence, story: true), or found itself when no story fits.
 */
exports.storyHint = function (found, stories, maxShiftMin) {
  if (!found) return found;
  var limit = found.start + Math.max(0, Number(maxShiftMin) || 0) * 60000;
  var asleep = null;
  (stories || []).forEach(function (r) {
    if (!r || !r.data || r.data.asleep !== true) return;
    var at = Number(r.at);
    if (!(at > found.start) || at > limit || at >= found.end) return;
    if (asleep === null || at > asleep) asleep = at;
  });
  if (asleep === null) return found;
  var out = {};
  Object.keys(found).forEach(function (key) { out[key] = found[key]; });
  out.start = asleep;
  out.minutes = Math.max(0, found.minutes - Math.round((asleep - found.start) / 60000));
  out.confidence = Math.min(0.9, Math.round(((found.confidence || 0) + 0.1) * 100) / 100);
  out.story = true;
  return out;
};

// Stage types of Health Connect's SleepSessionRecord.Stage.
var AWAKE = { 1: true, 3: true, 7: true };
var DEEP = 5;
var REM = 6;

/**
 * A Health Connect sleep session → { start, end, minutes, wakes, quality }.
 * quality (0–100): the share of deep + REM sleep against 45 % of sleep (a usual night); null
 * without stages.
 */
exports.fromSession = function (session) {
  var stages = session.stages || [];
  if (!stages.length) {
    return { start: session.start, end: session.end, minutes: Math.round((session.end - session.start) / 60000), wakes: 0, quality: null };
  }
  var asleep = 0;
  var good = 0;
  var wakes = 0;
  stages.forEach(function (stage) {
    var ms = Math.max(0, stage.end - stage.start);
    if (AWAKE[stage.type]) {
      wakes++;
      return;
    }
    asleep += ms;
    if (stage.type === DEEP || stage.type === REM) good += ms;
  });
  var hasKinds = stages.some(function (stage) { return stage.type === DEEP || stage.type === REM || stage.type === 4; });
  return {
    start: session.start,
    end: session.end,
    minutes: Math.round(asleep / 60000),
    wakes: wakes,
    quality: hasKinds && asleep > 0 ? Math.round(Math.min(1, good / asleep / 0.45) * 100) : null
  };
};

/** Which of two sleep records for the same night is in force: manual, then hc, then screen. */
var RANK = { manual: 3, hc: 2, screen: 1 };
exports.rank = function (from) {
  return RANK[from] || 0;
};

/**
 * The bed and wake moments of a manual correction: wake on the morning date, bed before it
 * (an evening time goes to the calendar day before).
 */
exports.manual = function (night, bed, wake, at) {
  var wakeAt = at(night, wake);
  var bedAt = at(night, bed);
  if (bedAt >= wakeAt) bedAt -= 864e5;
  if (wakeAt - bedAt > 20 * 3600000) throw new Error('Сон длиннее 20 часов — проверьте время');
  return { start: bedAt, end: wakeAt, minutes: Math.round((wakeAt - bedAt) / 60000) };
};
