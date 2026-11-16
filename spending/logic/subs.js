// Subscriptions found in the operations by code, without a model: the same shop, at least N
// charges, every week, every month on the same day or every year, amounts close to each other.
// Also "trial periods": a charge of 0 or 1 ruble at a shop never seen before. Pure.
var merchant = require('./merchant.js');

var DAY = 864e5;

function addMonths(time, n, day) {
  var d = new Date(time);
  var y = d.getFullYear();
  var m = d.getMonth() + n;
  y += Math.floor(m / 12);
  m = ((m % 12) + 12) % 12;
  var want = day || d.getDate();
  var last = new Date(y, m + 1, 0).getDate();
  return new Date(y, m, Math.min(want, last), d.getHours(), d.getMinutes()).getTime();
}

function median(list) {
  var s = list.slice().sort(function (a, b) { return a - b; });
  var mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function calendarDays(a, b) {
  var x = new Date(a);
  var y = new Date(b);
  return Math.round((Date.UTC(y.getFullYear(), y.getMonth(), y.getDate()) - Date.UTC(x.getFullYear(), x.getMonth(), x.getDate())) / DAY);
}

/** Does the step from one charge to the next fit the period? */
function fits(prev, next, period, dayTol) {
  if (period === 'week') return Math.abs(calendarDays(prev, next) - 7) <= dayTol;
  if (period === 'month') return Math.abs(calendarDays(addMonths(prev, 1), next)) <= dayTol;
  if (period === 'year') return Math.abs(calendarDays(addMonths(prev, 12), next)) <= dayTol;
  return false;
}

/** The next charge after the last one; `day` keeps the day of the month through short months. */
function nextDate(lastAt, period, day, now) {
  var next;
  var step = function (t) {
    if (period === 'week') return t + 7 * DAY;
    if (period === 'year') return addMonths(t, 12, day);
    return addMonths(t, 1, day);
  };
  next = step(lastAt);
  var guard = 0;
  while (now !== undefined && next < now - DAY && guard++ < 520) next = step(next);
  return next;
}

/** What a subscription costs in a year. */
function yearly(amount, period) {
  if (period === 'week') return Math.round(amount * 52);
  if (period === 'year') return Math.round(amount);
  return Math.round(amount * 12);
}

function counts(tx) {
  return (tx.type === 'purchase' || tx.type === 'fee') && !tx.dupOf && !tx.internal && !tx.excluded && Number(tx.amount) > 0;
}

/**
 * Candidates: [{ key, merchant, amount, currency, period, day, count, lastAt, next, txIds, lastTxId, yearly }].
 * opts: { minCount, dayTol, amountTolPct, now }.
 */
function detect(txs, opts) {
  var minCount = opts.minCount || 3;
  var dayTol = opts.dayTol === undefined ? 3 : opts.dayTol;
  var tol = (opts.amountTolPct === undefined ? 15 : opts.amountTolPct) / 100;
  var groups = {};
  (txs || []).filter(counts).forEach(function (tx) {
    var k = tx.key || merchant.key(tx.merchant || tx.name || '');
    if (!k) return;
    var group = k + '\u0000' + (tx.currency || 'RUB');
    (groups[group] = groups[group] || []).push(tx);
  });
  var found = [];
  Object.keys(groups).forEach(function (k) {
    var list = groups[k].slice().sort(function (a, b) { return a.at - b.at; });
    if (list.length < minCount) return;
    var best = null;
    ['month', 'week', 'year'].forEach(function (period) {
      // The longest run of fitting steps that ends with the last charge of that size.
      for (var end = list.length - 1; end >= minCount - 1; end--) {
        var run = [list[end]];
        for (var i = end - 1; i >= 0; i--) {
          var head = run[0];
          if (fits(list[i].at, head.at, period, dayTol)) {
            run.unshift(list[i]);
          } else if (calendarDays(list[i].at, head.at) === 0) {
            continue;
          } else if (period === 'week' ? calendarDays(list[i].at, head.at) > 7 + dayTol : period === 'month' ? calendarDays(list[i].at, head.at) > 40 : calendarDays(list[i].at, head.at) > 400) {
            break;
          }
        }
        if (run.length < minCount) continue;
        var amounts = run.map(function (tx) { return Number(tx.amount); });
        var mid = median(amounts);
        if (!amounts.every(function (a) { return Math.abs(a - mid) <= mid * tol; })) continue;
        // A shop visited often (coffee every day) has a "monthly" chain hidden among its visits:
        // a subscription is what the shop mostly charges, not one visit in ten.
        var from = run[0].at - dayTol * 864e5;
        var to = run[run.length - 1].at + dayTol * 864e5;
        var others = list.filter(function (tx) { return tx.at >= from && tx.at <= to && run.indexOf(tx) < 0; }).length;
        if (others > Math.floor(run.length / 2)) continue;
        if (!best || run.length > best.run.length) best = { period: period, run: run };
        break;
      }
    });
    if (!best) return;
    var last = best.run[best.run.length - 1];
    var day = best.period === 'week' ? new Date(last.at).getDay() : new Date(best.run[0].at).getDate();
    found.push({
      key: last.key || merchant.key(last.merchant || last.name || ''),
      merchant: last.name || merchant.title(last.merchant),
      amount: Number(last.amount),
      currency: last.currency || 'RUB',
      period: best.period,
      day: day,
      count: best.run.length,
      lastAt: last.at,
      next: nextDate(last.at, best.period, best.period === 'week' ? undefined : day, opts.now),
      txIds: best.run.map(function (tx) { return tx.id; }),
      lastTxId: last.id,
      yearly: yearly(Number(last.amount), best.period)
    });
  });
  return found.sort(function (a, b) { return a.next - b.next; });
}

/**
 * Trial periods: a charge of 0 or 1 in a shop with no earlier operations. → [{ key, merchant, at, txId, endsAt }].
 */
function trials(txs, trialDays) {
  var seen = {};
  var out = [];
  (txs || []).slice().sort(function (a, b) { return a.at - b.at; }).forEach(function (tx) {
    if (tx.dupOf || tx.internal || tx.excluded || (tx.type !== 'purchase' && tx.type !== 'hold')) return;
    var k = tx.key || merchant.key(tx.merchant || tx.name || '');
    if (!k) return;
    var original = Number(tx.amount);
    var hasOriginal = tx.amount !== null && tx.amount !== undefined && String(tx.amount).trim() !== '' && isFinite(original) && original >= 0;
    var smallRubleCharge = (tx.currency || 'RUB') === 'RUB' && original >= 0 && original <= 1;
    var smallBankDebit = tx.bankCurrency === 'RUB' && tx.bankAmount !== null && tx.bankAmount !== undefined &&
      String(tx.bankAmount).trim() !== '' && isFinite(Number(tx.bankAmount)) && Number(tx.bankAmount) >= 0 && Number(tx.bankAmount) <= 1;
    if (!seen[k] && hasOriginal && (original === 0 || smallRubleCharge || smallBankDebit)) {
      out.push({ key: k, merchant: tx.name || merchant.title(tx.merchant), at: tx.at, txId: tx.id, endsAt: tx.at + trialDays * DAY });
    }
    seen[k] = true;
  });
  return out;
}

/** Is it time to remind: the charge is `days` days away (today, in local days) and not yet reminded of. */
function dueReminder(sub, now, days) {
  if (!sub || !sub.remind || !sub.next || sub.confirmed !== 1) return false;
  if (sub.remindedFor && sub.remindedFor === sub.next) return false;
  var left = calendarDays(now, sub.next);
  return left >= 0 && left <= days;
}

exports.addMonths = addMonths;
exports.fits = fits;
exports.nextDate = nextDate;
exports.yearly = yearly;
exports.detect = detect;
exports.trials = trials;
exports.dueReminder = dueReminder;
exports.calendarDays = calendarDays;
