// Words of the module: the widget, notifications, dates, and the expenses written into the base
// by someone else (the agent from a chat). Pure.
var money = require('./money.js');
var budget = require('./budget.js');

var OF = {
  'Продукты': 'продуктов', 'Кафе и рестораны': 'кафе и ресторанов', 'Доставка еды': 'доставки еды', 'Такси': 'такси',
  'Транспорт': 'транспорта', 'Связь и интернет': 'связи и интернета', 'Подписки': 'подписок', 'Здоровье': 'здоровья',
  'Одежда': 'одежды', 'Дом': 'дома', 'Развлечения': 'развлечений', 'Переводы людям': 'переводов людям', 'Прочее': 'прочего'
};

function plural(n, one, few, many) {
  var a = Math.abs(n) % 100;
  var b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}

function pad(n) {
  return (n < 10 ? '0' : '') + n;
}

/** "17 ноября". */
function dateText(time) {
  var d = new Date(time);
  return d.getDate() + ' ' + budget.MONTHS_OF[d.getMonth()];
}

/** "17.11". */
function shortDate(time) {
  var d = new Date(time);
  return pad(d.getDate()) + '.' + pad(d.getMonth() + 1);
}

/** "вдвое", "втрое", … "в 7 раз". */
function times(n) {
  var r = Math.round(n);
  var words = { 2: 'вдвое', 3: 'втрое', 4: 'вчетверо', 5: 'впятеро' };
  return words[r] || 'в ' + r + ' ' + plural(r, 'раз', 'раза', 'раз');
}

/** "для продуктов", or "для категории «Хобби»" for a category of the owner's own. */
function forCategory(name) {
  return OF[name] ? 'для ' + OF[name] : 'для категории «' + name + '»';
}

/**
 * The widget: { title: 'Ноябрь: 41 200 из 60 000 ₽', text: 'На день: 1 250 ₽\nСкоро: Кинопоиск 399 ₽, 17.11' }.
 * upcoming: [{ merchant, amount, currency, next }].
 */
function widget(period, sum, upcoming, currency) {
  var cur = currency || 'RUB';
  var title;
  var lines = [];
  if (sum.budget) {
    title = period.label + ': ' + money.format(Math.round(sum.spent), cur).replace(/ [^ ]+$/, '') + ' из ' + money.format(sum.budget, cur);
    lines.push(sum.left >= 0 ? 'На день: ' + money.format(sum.perDay, cur) : 'Бюджет превышен на ' + money.format(-sum.left, cur));
  } else {
    title = period.label + ': ' + money.format(Math.round(sum.spent), cur);
    lines.push('Бюджет не задан');
  }
  if (upcoming && upcoming.length) {
    lines.push('Скоро: ' + upcoming.map(function (sub) {
      return sub.merchant + ' ' + money.format(sub.amount, sub.currency || cur) + ', ' + shortDate(sub.next);
    }).join('; '));
  }
  return { title: title, text: lines.join('\n') };
}

/** "Потрачено 80% бюджета ноября, до конца месяца 9 дней". */
function thresholdText(threshold, period, daysLeft) {
  var month = budget.MONTHS_OF[period.month];
  if (threshold >= 100) {
    return 'Бюджет ' + month + ' исчерпан' + (daysLeft > 0 ? ', до конца месяца ' + daysLeft + ' ' + plural(daysLeft, 'день', 'дня', 'дней') : '');
  }
  return 'Потрачено ' + threshold + '% бюджета ' + month + ', до конца месяца ' + daysLeft + ' ' + plural(daysLeft, 'день', 'дня', 'дней');
}

/** "Магнит 8 450 ₽ — втрое больше обычного для продуктов. Верно?" */
function unusualText(name, amount, currency, n, category) {
  return (name || 'Покупка') + ' ' + money.format(amount, currency) + ' — ' + times(n) + ' больше обычного ' + forCategory(category) + '. Верно?';
}

/**
 * "Кинопоиск спишет 399 ₽ 17 ноября. За месяц вы открывали его один раз". opens: null when the
 * screen time is not known.
 */
function reminderText(sub, opens) {
  var head = sub.merchant + ' спишет ' + money.format(sub.amount, sub.currency) + ' ' + dateText(sub.next) + '.';
  if (opens === null || opens === undefined) return head;
  if (opens === 0) return head + ' За месяц вы его ни разу не открывали';
  var count = opens === 1 ? 'один раз' : opens === 2 ? 'два раза' : opens + ' ' + plural(opens, 'раз', 'раза', 'раз');
  return head + ' За месяц вы открывали его ' + count;
}

/** "Пробный период Иви кончается 21 ноября — дальше спишут деньги". */
function trialText(sub) {
  return 'Пробный период ' + sub.merchant + ' кончается ' + dateText(sub.next) + ' — дальше, скорее всего, начнут списывать деньги';
}

/**
 * Expenses written into the base by someone else (the agent from a chat) that are not one of the
 * module's operations: an operation of the same amount within ±windowMin minutes is the same
 * expense. records: base records of kind expense; txs: operations of the same time span.
 */
function foreign(records, txs, windowMin) {
  var win = windowMin * 60000;
  return (records || []).filter(function (record) {
    if (record.source === 'spending') return false;
    var value = Math.abs(Number(record.amount));
    if (!(value > 0)) return false;
    return !(txs || []).some(function (tx) {
      return !tx.dupOf && Math.abs(Number(tx.amountBase) - value) < 0.005 && Math.abs(tx.at - record.at) <= win;
    });
  });
}

/** A base record of the agent as an operation of the feed (source 'manual', not editable here). */
function fromBase(record, categories) {
  var tag = (record.tags || [])[0] || '';
  var category = (categories || []).filter(function (name) { return name.toLowerCase() === String(tag).toLowerCase(); })[0] || 'Прочее';
  var value = Number(record.amount);
  return {
    id: 'b' + record.id, baseId: record.id, at: record.at, type: value < 0 ? 'refund' : 'purchase', amount: Math.abs(value),
    currency: record.unit && /^[A-Z]{3}$/.test(record.unit) ? record.unit : 'RUB', amountBase: Math.abs(value), name: record.title || 'Трата',
    merchant: record.title || null, category: category, source: 'manual', foreign: true, dupOf: null, internal: 0, excluded: 0
  };
}

/** Operations by days for the feed: [{ day: '2026-11-14', label: '14 ноября', total, items }]. */
function byDays(items, settings, now) {
  var groups = [];
  var index = {};
  var today = budget.dayKey(now === undefined ? Date.now() : now);
  var yesterday = budget.dayKey((now === undefined ? Date.now() : now) - 864e5);
  (items || []).forEach(function (tx) {
    var day = budget.dayKey(tx.at);
    if (!index[day]) {
      index[day] = { day: day, label: day === today ? 'Сегодня' : day === yesterday ? 'Вчера' : dateText(tx.at), total: 0, items: [] };
      groups.push(index[day]);
    }
    index[day].items.push(tx);
    index[day].total += budget.counted(tx, settings);
  });
  groups.forEach(function (group) { group.total = Math.round(group.total * 100) / 100; });
  return groups;
}

function fold(text) {
  return String(text === null || text === undefined ? '' : text).toLowerCase().replace(/ё/g, 'е');
}

/** Does an operation answer the search: every word in its shop, category, note or amount, without case and ё. */
function matches(tx, query) {
  var hay = fold([tx.name, tx.merchant, tx.category, tx.note, tx.card, tx.amount, String(tx.amount).replace('.', ',')].join(' '));
  return fold(query).split(/\s+/).filter(Boolean).every(function (word) { return hay.indexOf(word) >= 0; });
}

exports.matches = matches;
exports.plural = plural;
exports.dateText = dateText;
exports.shortDate = shortDate;
exports.times = times;
exports.forCategory = forCategory;
exports.widget = widget;
exports.thresholdText = thresholdText;
exports.unusualText = unusualText;
exports.reminderText = reminderText;
exports.trialText = trialText;
exports.foreign = foreign;
exports.fromBase = fromBase;
exports.byDays = byDays;
