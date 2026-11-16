// «Неделя без единой попытки отвлечься» for «Ачивки за жизнь» (handed in by achieve.js): over the last
// quietDays days not one attempt to open a distracting app during a session, with sessions whose attempts
// were really counted (the lock on and able to see the apps) on at least quietMinDays different days.
// Without the lock nothing is counted, so such sessions do not take part. Pure.
var history = require('./history.js');

var DAY = 86400000;

/** rows: [{ startAt, blockedAttempts }] of counted sessions. → { ok, days, attempts } */
exports.quiet = function (rows, now, days, minDays) {
  var from = now - Number(days) * DAY;
  var seen = {};
  var attempts = 0;
  (rows || []).forEach(function (row) {
    var at = Number(row.startAt);
    if (!(at >= from && at <= now)) return;
    attempts += Number(row.blockedAttempts) || 0;
    seen[history.day(at).key] = true;
  });
  var count = Object.keys(seen).length;
  return { ok: attempts === 0 && count >= Number(minDays), days: count, attempts: attempts };
};
