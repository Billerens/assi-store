// Calls during a session (on('call') → { state: 'ringing'|'offhook'|'idle', number }): which ones
// were missed, and what the session does about a call by the settings. Pure.

/**
 * The calls of the session after one more event: a ringing one is added, "offhook" while it
 * rings means it was answered, "idle" closes it. [{ number, name, time, answered, open }].
 */
exports.step = function (calls, event, now, name) {
  var list = (calls || []).map(function (call) {
    var out = {};
    Object.keys(call).forEach(function (key) { out[key] = call[key]; });
    return out;
  });
  var state = String((event && event.state) || '');
  var last = list.length ? list[list.length - 1] : null;
  if (state === 'ringing') {
    if (last && last.open && last.number === String(event.number || '')) return list;
    list.push({ number: String(event.number || ''), name: name || '', time: now, answered: false, open: true });
  } else if (state === 'offhook') {
    if (last && last.open) last.answered = true;
  } else if (state === 'idle') {
    if (last && last.open) last.open = false;
  }
  return list;
};

/**
 * What the session does now: 'none' | 'pause' | 'resume' | 'end'. `action` — the setting
 * (nothing / pause / end); `pausedByCall` — the session is paused because of a call.
 */
exports.react = function (event, action, pausedByCall) {
  var state = String((event && event.state) || '');
  if (action === 'end' && state === 'ringing') return 'end';
  if (action === 'pause' && (state === 'ringing' || state === 'offhook') && !pausedByCall) return 'pause';
  if (state === 'idle' && pausedByCall) return 'resume';
  return 'none';
};
