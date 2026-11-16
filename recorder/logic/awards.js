// Achievements of the recorder for «Ачивки за жизнь» (handed in by achieve.js). «Сто мыслей» is a data
// rule of «Ачивки» (records `note` of source `recorder`), here is only what the shared base does not hold:
//   «Ни одной задачи не потерял» — every task with a date that fell in the last keptTasksDays days is
//   done, and there were at least keptTasksMin of them. Proposed tasks (a reminder the owner did not
//   take yet) do not count. Pure.

/**
 * tasks: [{ due: 'YYYY-MM-DD' | null, done: 0|1, proposed: 0|1 }], today: 'YYYY-MM-DD'.
 * → { ok, due: how many tasks count, done: how many of them are done }
 */
exports.keptAll = function (tasks, today, days, min) {
  var from = shift(today, -Number(days));
  var counted = (tasks || []).filter(function (t) {
    return t && !t.proposed && /^\d{4}-\d{2}-\d{2}$/.test(String(t.due || '')) && t.due >= from && t.due < today;
  });
  var done = counted.filter(function (t) { return Boolean(Number(t.done)); }).length;
  return { ok: counted.length >= Number(min) && done === counted.length, due: counted.length, done: done };
};

/** 'YYYY-MM-DD' moved by n days (local calendar). */
function shift(day, n) {
  var parts = String(day).split('-');
  var d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]) + n, 12);
  var pad = function (v) { return (v < 10 ? '0' : '') + v; };
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

exports.shift = shift;
