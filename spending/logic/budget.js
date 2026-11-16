// The month of the budget, what counts as spending, "per day", thresholds, unusual purchases.
// Pure: no Android, no native. Times are milliseconds; days are local calendar days.

var MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
var MONTHS_OF = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
var MONTHS_IN = ['январе', 'феврале', 'марте', 'апреле', 'мае', 'июне', 'июле', 'августе', 'сентябре', 'октябре', 'ноябре', 'декабре'];

function daysIn(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function startDayOf(year, month, startDay) {
  return Math.min(Math.max(1, Math.round(startDay || 1)), daysIn(year, month));
}

function pad(n) {
  return (n < 10 ? '0' : '') + n;
}

/** "2026-11-14" of a time, in local days. */
function dayKey(time) {
  var d = new Date(time);
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

/** Whole calendar days from a to b (local, safe across clock changes). */
function daysBetween(a, b) {
  var x = new Date(a);
  var y = new Date(b);
  var ux = Date.UTC(x.getFullYear(), x.getMonth(), x.getDate());
  var uy = Date.UTC(y.getFullYear(), y.getMonth(), y.getDate());
  return Math.round((uy - ux) / 864e5);
}

/**
 * The budget month that holds this time: from the start day (1 or the day of the salary) to the
 * same day of the next month. → { start, end, key: '2026-11', days, label: 'Ноябрь', month, year }.
 * The key and the label are of the month that holds most of its days.
 */
function periodOf(time, startDay) {
  var d = new Date(time);
  var y = d.getFullYear();
  var m = d.getMonth();
  var first = startDayOf(y, m, startDay);
  var sy = y;
  var sm = m;
  if (d.getDate() < first) {
    sm = m - 1;
    if (sm < 0) { sm = 11; sy = y - 1; }
  }
  var start = new Date(sy, sm, startDayOf(sy, sm, startDay)).getTime();
  var ey = sm === 11 ? sy + 1 : sy;
  var em = sm === 11 ? 0 : sm + 1;
  var end = new Date(ey, em, startDayOf(ey, em, startDay)).getTime();
  var days = daysBetween(start, end);
  var middle = new Date(start + (end - start) / 2);
  return {
    start: start, end: end, days: days,
    key: middle.getFullYear() + '-' + pad(middle.getMonth() + 1),
    label: MONTHS[middle.getMonth()], month: middle.getMonth(), year: middle.getFullYear()
  };
}

/** The period before this one. */
function previous(period, startDay) {
  return periodOf(period.start - 864e5, startDay);
}

/**
 * How much an operation adds to the spending, in the budget's currency: purchases, holds and fees
 * add, refunds take away, transfers to people add when the setting says so; repeats, transfers
 * to oneself, declined ones and "not a spending" add nothing.
 */
function counted(tx, settings) {
  if (!tx || tx.dupOf || tx.internal || tx.excluded) return 0;
  var value = tx.amountBase;
  if (value === null || value === undefined) return 0;
  value = Number(value);
  switch (tx.type) {
    case 'purchase':
    case 'hold':
    case 'fee':
      return value;
    case 'refund':
      return -Math.abs(value);
    case 'transfer_out':
      return settings && settings.transfersInBudget === false ? 0 : value;
    default:
      return 0;
  }
}

function round(value) {
  return Math.round(value * 100) / 100;
}

/**
 * The picture of a budget month.
 * opts: { period, budget (number or null), limits: {category: amount}, now, settings, categories: [order] }
 * → { spent, budget, left, perDay, daysLeft, pct, pace, byCategory: [{ name, sum, share, limit, pct }], byDay: [sum…], count }
 */
function summary(txs, opts) {
  var period = opts.period;
  var now = opts.now === undefined ? Date.now() : opts.now;
  var byCategory = {};
  var byDay = [];
  for (var i = 0; i < period.days; i++) byDay.push(0);
  var spent = 0;
  var count = 0;
  (txs || []).forEach(function (tx) {
    if (tx.at < period.start || tx.at >= period.end) return;
    var value = counted(tx, opts.settings);
    if (!value) return;
    count++;
    spent += value;
    var cat = tx.category || 'Прочее';
    byCategory[cat] = (byCategory[cat] || 0) + value;
    var index = daysBetween(period.start, tx.at);
    if (index >= 0 && index < byDay.length) byDay[index] += value;
  });
  var budget = opts.budget > 0 ? Number(opts.budget) : null;
  var daysLeft = now >= period.end ? 0 : Math.max(1, period.days - Math.max(0, daysBetween(period.start, now)));
  var left = budget === null ? null : budget - spent;
  var order = opts.categories || [];
  var limits = opts.limits || {};
  var list = Object.keys(byCategory).map(function (name) {
    var limit = limits[name] > 0 ? Number(limits[name]) : null;
    return {
      name: name, sum: round(byCategory[name]), share: spent > 0 ? byCategory[name] / spent : 0,
      limit: limit, pct: limit ? byCategory[name] / limit * 100 : null
    };
  }).filter(function (item) { return Math.abs(item.sum) >= 0.01; }).sort(function (a, b) {
    if (b.sum !== a.sum) return b.sum - a.sum;
    return order.indexOf(a.name) - order.indexOf(b.name);
  });
  return {
    spent: round(spent), budget: budget, left: left === null ? null : round(left),
    perDay: left === null ? null : (daysLeft > 0 ? Math.max(0, Math.floor(left / daysLeft)) : 0),
    daysLeft: daysLeft, pct: budget ? spent / budget * 100 : null,
    pace: budget ? budget / period.days : null,
    byCategory: list, byDay: byDay.map(round), count: count
  };
}

/** Thresholds (percent) the spending has reached and that were not yet told about. */
function crossed(pct, thresholds, told) {
  if (pct === null || pct === undefined) return [];
  return (thresholds || []).filter(function (t) { return pct >= t && (told || []).indexOf(t) < 0; })
    .sort(function (a, b) { return a - b; });
}

function median(list) {
  var sorted = (list || []).filter(function (x) { return isFinite(x); }).slice().sort(function (a, b) { return a - b; });
  if (!sorted.length) return null;
  var mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Is this purchase unusually big for its category: more than `factor` times the median of the
 * category's purchases, when there are at least minSamples of them? → { unusual, median, times }.
 */
function unusual(amount, history, factor, minSamples) {
  var list = (history || []).filter(function (x) { return x > 0; });
  if (list.length < (minSamples || 1)) return { unusual: false, median: null, times: null };
  var m = median(list);
  if (!m) return { unusual: false, median: m, times: null };
  var times = amount / m;
  return { unusual: times > factor, median: m, times: times };
}

/**
 * The day's allowance of a budget month and whether the day kept to it — for neighbours (Health,
 * Life-RPG): what was left at the start of the day divided by the days left, the day included.
 * → { date, allowance, spent, ok } (allowance null when there is no budget).
 */
function dayAllowance(txs, period, budget, day, settings) {
  var dayStart = new Date(new Date(day).getFullYear(), new Date(day).getMonth(), new Date(day).getDate()).getTime();
  var before = 0;
  var spent = 0;
  (txs || []).forEach(function (tx) {
    if (tx.at < period.start || tx.at >= period.end) return;
    var value = counted(tx, settings);
    if (tx.at < dayStart) before += value;
    else if (daysBetween(dayStart, tx.at) === 0) spent += value;
  });
  if (!(budget > 0)) return { date: dayKey(dayStart), allowance: null, spent: round(spent), ok: null };
  var left = period.days - daysBetween(period.start, dayStart);
  var allowance = left > 0 ? Math.max(0, (budget - before) / left) : 0;
  return { date: dayKey(dayStart), allowance: Math.floor(allowance), spent: round(spent), ok: spent <= allowance };
}

exports.MONTHS = MONTHS;
exports.MONTHS_OF = MONTHS_OF;
exports.MONTHS_IN = MONTHS_IN;
exports.dayKey = dayKey;
exports.daysBetween = daysBetween;
exports.periodOf = periodOf;
exports.previous = previous;
exports.counted = counted;
exports.summary = summary;
exports.crossed = crossed;
exports.median = median;
exports.unusual = unusual;
exports.dayAllowance = dayAllowance;
