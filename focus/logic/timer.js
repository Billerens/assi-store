// The timer of a session: its moments, pauses, extensions and what follows it in cycles. Pure:
// a session is plain data (what data/focus/state.json holds), time comes in as an argument.
var MINUTE = 60000;

function plural(n, one, few, many) {
  var a = Math.abs(Math.round(n)) % 100;
  var b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b === 1) return one;
  if (b >= 2 && b <= 4) return few;
  return many;
}

exports.plural = plural;

/** Minutes asked for, made whole and kept within the settings' limits; null when not a number. */
exports.minutes = function (value, s) {
  var n = Number(String(value === undefined || value === null ? '' : value).replace(',', '.'));
  if (!isFinite(n) || n <= 0) return null;
  return Math.min(s.maxMinutes, Math.max(s.minMinutes, Math.round(n)));
};

/**
 * A new session: { id, kind, startAt, endAt, plannedMin, extendedMin, pausedAt, pausedMs, task,
 * mode, cycle, cycles, long, attempts, blockedApps, calls }.
 */
exports.create = function (options) {
  var now = Number(options.now) || Date.now();
  var minutes = Number(options.minutes);
  return {
    id: 'f' + now.toString(36),
    kind: options.kind === 'break' ? 'break' : 'work',
    startAt: now,
    endAt: now + minutes * MINUTE,
    plannedMin: minutes,
    extendedMin: 0,
    pausedAt: null,
    pausedMs: 0,
    task: String(options.task || '').trim().slice(0, 120),
    mode: options.mode || 'priority',
    cycle: options.cycle || null,
    cycles: options.cycles || null,
    long: Boolean(options.long),
    attempts: 0,
    blockedApps: {},
    calls: []
  };
};

function copy(session) {
  var out = {};
  Object.keys(session).forEach(function (key) { out[key] = session[key]; });
  return out;
}

/** What is left, ms (a paused session keeps what it had at the pause). */
exports.left = function (session, now) {
  if (!session) return 0;
  var at = session.pausedAt ? session.pausedAt : now;
  return Math.max(0, session.endAt - at);
};

/** Time actually worked, ms: from the start, without pauses, up to the end at most. */
exports.elapsed = function (session, now) {
  if (!session) return 0;
  var until = Math.min(now, session.endAt + (session.pausedAt ? now - session.pausedAt : 0));
  var paused = (session.pausedMs || 0) + (session.pausedAt ? Math.max(0, now - session.pausedAt) : 0);
  return Math.max(0, until - session.startAt - paused);
};

exports.actualMin = function (session, now) {
  return Math.round(exports.elapsed(session, now) / MINUTE);
};

/** The whole length planned, minutes: asked for plus extensions. */
exports.total = function (session) {
  return (session.plannedMin || 0) + (session.extendedMin || 0);
};

exports.extend = function (session, minutes) {
  var next = copy(session);
  next.endAt = session.endAt + minutes * MINUTE;
  next.extendedMin = (session.extendedMin || 0) + minutes;
  return next;
};

exports.pause = function (session, now) {
  if (session.pausedAt) return session;
  var next = copy(session);
  next.pausedAt = now;
  return next;
};

/** Back from a pause: the end moves by the time of the pause. */
exports.resume = function (session, now) {
  if (!session.pausedAt) return session;
  var next = copy(session);
  var paused = Math.max(0, now - session.pausedAt);
  next.endAt = session.endAt + paused;
  next.pausedMs = (session.pausedMs || 0) + paused;
  next.pausedAt = null;
  return next;
};

/** Does ending now need a confirmation (less than the threshold's share of the session done)? */
exports.early = function (session, now, threshold) {
  var total = exports.total(session) * MINUTE;
  return total > 0 && exports.elapsed(session, now) < threshold * total;
};

function pad(n) {
  return (n < 10 ? '0' : '') + n;
}

/**
 * The daily job's time for a moment, when the shell has no one-off jobs: 'ЧЧ:ММ' of the first
 * whole minute not before it, and that minute in ms (the job comes then, never before the end).
 */
exports.atClock = function (time) {
  var date = new Date(time);
  if (date.getSeconds() || date.getMilliseconds()) {
    date = new Date(time + MINUTE);
    date.setSeconds(0, 0);
  }
  return { at: pad(date.getHours()) + ':' + pad(date.getMinutes()), fires: date.getTime() };
};

/**
 * After the app was started again: what to do with the session in state.json.
 *   'none' — nothing is running; 'continue' — not over yet; 'timer' — over a moment ago (the
 *   alarm woke the app); 'restore' — over long ago (the app was dead).
 */
exports.restore = function (session, now, graceSec) {
  if (!session || !session.id) return 'none';
  if (session.pausedAt) return 'continue';
  if (now < session.endAt) return 'continue';
  return now - session.endAt <= graceSec * 1000 ? 'timer' : 'restore';
};

/** What follows a finished work in cycles: a break (the long one after the last work) or nothing. */
exports.afterWork = function (session, s) {
  if (!session.cycle || !session.cycles) return null;
  var last = session.cycle >= session.cycles;
  return { kind: 'break', minutes: last ? s.longBreakMin : s.breakMin, long: last, cycle: session.cycle, cycles: session.cycles, task: session.task };
};

/** What follows a break: the next work of the series, or nothing after the long one. */
exports.afterBreak = function (session, s) {
  if (!session.cycle || !session.cycles || session.long || session.cycle >= session.cycles) return null;
  return { kind: 'work', minutes: s.workMin, cycle: session.cycle + 1, cycles: session.cycles, task: session.task };
};

/** "18:05" or "1:02:05" for a countdown. */
exports.clock = function (ms) {
  var seconds = Math.max(0, Math.ceil(ms / 1000));
  var h = Math.floor(seconds / 3600);
  var m = Math.floor((seconds % 3600) / 60);
  var sec = seconds % 60;
  return (h ? h + ':' + pad(m) : String(m)) + ':' + pad(sec);
};

/** "18 минут" — what is left, said in words (whole minutes, rounded up). */
exports.leftText = function (ms) {
  var minutes = Math.max(0, Math.ceil(ms / MINUTE));
  if (minutes >= 60) {
    var h = Math.floor(minutes / 60);
    var m = minutes % 60;
    return h + ' ч' + (m ? ' ' + m + ' мин' : '');
  }
  return minutes + ' ' + plural(minutes, 'минута', 'минуты', 'минут');
};

/** "Фокус: ещё 18 минут" — the reminder over a distracting app. */
exports.reminder = function (session, now) {
  return 'Фокус: ещё ' + exports.leftText(exports.left(session, now)).replace(/минута$/, 'минуту');
};

/** The share of the ring still to go, 0..1. */
exports.ring = function (session, now) {
  var total = exports.total(session) * MINUTE;
  return total > 0 ? Math.min(1, exports.left(session, now) / total) : 0;
};

exports.clockOf = function (time) {
  var date = new Date(time);
  return pad(date.getHours()) + ':' + pad(date.getMinutes());
};
