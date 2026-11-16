// "Do not disturb": the names of the phone's interruption filters, the ways to switch them and
// when Focus may put the phone's mode back. Pure: the Android side is in android.js.

// NotificationManager.INTERRUPTION_FILTER_*
var CODES = { all: 1, priority: 2, none: 3, alarms: 4 };

exports.CODES = CODES;

exports.code = function (name) {
  return CODES[name] || null;
};

exports.name = function (code) {
  var n = Number(code);
  if (n === 2) return 'priority';
  if (n === 3) return 'none';
  if (n === 4) return 'alarms';
  return 'all';
};

/** Is the phone silent in this filter? 'all' lets everything through; 0 (unknown) — not known. */
exports.silent = function (name) {
  return name === 'priority' || name === 'alarms' || name === 'none';
};

/** The words of `cmd notification set_dnd` (Shizuku, path C) for a filter. */
exports.shizukuArg = function (name) {
  return { all: 'off', priority: 'priority', alarms: 'alarms', none: 'on' }[name] || 'off';
};

exports.TITLES = { priority: 'только важные', alarms: 'только будильники', none: 'полная тишина', all: 'выключен' };

/** The ways in the order they are tried. */
exports.ORDER = ['shell', 'listener', 'manager', 'shizuku'];

/**
 * Whether to switch at the start: { touch, reason }. The phone already silent (sleep mode,
 * a Samsung mode, the owner himself) is left alone — and Focus remembers it did not switch it.
 */
exports.atStart = function (current, wanted) {
  if (!wanted) return { touch: false, reason: 'off' };
  if (exports.silent(current)) return { touch: false, reason: 'already' };
  return { touch: true, reason: '' };
};

/**
 * Whether to put the mode back at the end: only when Focus switched it and it is still what Focus
 * set (the owner may have switched it off or changed it during the session — then hands off).
 */
exports.atEnd = function (session, current) {
  if (!session || !session.dndBy || !session.dndOk) return { restore: false, reason: 'not ours' };
  if (current !== session.dndFilter) return { restore: false, reason: 'changed' };
  return { restore: true, to: session.prevFilter && !exports.silent(session.prevFilter) ? session.prevFilter : 'all' };
};

/** Did switching work: the filter read back is silent (any silent mode counts — the phone may pick its own). */
exports.worked = function (after) {
  return exports.silent(after);
};

/** What the screen says when silence could not be switched on. */
exports.failure = function (tried) {
  var why = (tried || []).filter(Boolean).join('; ');
  return 'Не удалось включить «не беспокоить» — сообщения будут приходить' + (why ? ' (' + why + ')' : '');
};
