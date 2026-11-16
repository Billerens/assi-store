// Achievements of Траты for «Ачивки за жизнь» (handed in by achieve.js):
//   «Неделя без доставки» — noDeliveryDays days without food delivery, after a delivery within the
//   noDeliveryBeforeDays before them (a habit put aside, not an empty history);
//   «Месяц в бюджете» — a whole budget month spent within its budget.
// «Охотник за подписками» is an event Траты already send (cancelSub). Pure.
var budget = require('./budget.js');

var DAY = 864e5;
var DELIVERY = 'Доставка еды';

exports.DELIVERY = DELIVERY;

/**
 * txs — the operations of [now − (days + beforeDays) days, now); first — when the first operation
 * Траты know of happened (null — none). → { ok, last: the last delivery's time or null }
 */
exports.noDelivery = function (txs, opts) {
  var now = opts.now;
  var from = now - Number(opts.days) * DAY;
  var before = from - Number(opts.beforeDays) * DAY;
  if (opts.first === null || opts.first === undefined || Number(opts.first) > before) return { ok: false, last: null };
  var seen = false;
  var last = null;
  (txs || []).forEach(function (tx) {
    if (tx.at < before || tx.at >= now) return;
    var value = budget.counted(tx, opts.settings);
    if (!(value > 0)) return;
    if (tx.at >= from) seen = true;
    if (tx.category === DELIVERY && (last === null || tx.at > last)) last = tx.at;
  });
  return { ok: seen && last !== null && last < from, last: last };
};

/**
 * The finished budget month: summary — budget.summary of it, period — { start, end }, first — when
 * the first operation happened (a month Траты did not see from its start does not count).
 */
exports.monthInBudget = function (summary, period, first) {
  if (!summary || !(summary.budget > 0) || !(summary.count > 0)) return false;
  if (first === null || first === undefined || Number(first) > period.start + 3 * DAY) return false;
  return summary.spent <= summary.budget;
};
