// The module's settings: what is there by default, and the owner's file brought to a safe shape
// (numbers in their bounds, lists as lists). Every tunable number of the module lives here. Pure.

var CATEGORIES = ['Продукты', 'Кафе и рестораны', 'Доставка еды', 'Такси', 'Транспорт', 'Связь и интернет', 'Подписки',
  'Здоровье', 'Одежда', 'Дом', 'Развлечения', 'Переводы людям', 'Прочее'];

// Packages of bank apps that send a push about each operation. Not taken from the owner's phone:
// the screen «Источники» offers to add an app that sent a notification with an amount in it.
var PACKAGES = [
  'ru.sberbankmobile', 'ru.sberbank*', 'com.idamob.tinkoff.android', 'ru.tinkoff*', 'ru.tbank*', 'com.tbank*',
  'ru.alfabank*', 'ru.vtb24*', 'ru.vtb*', 'ru.ozon.fintech*', 'ru.ozon.bank*', 'com.yandex.bank*', 'ru.yandex.bank*',
  'ru.raiffeisen*', 'ru.gazprombank*', 'ru.sovcombank*', 'ru.mts.money*', 'ru.mtsbank*', 'ru.pochtabank*', 'ru.psbank*',
  'ru.rosbank*', 'ru.rshb*', 'ru.open.*', 'ru.ftc.faktura*', 'ru.uralsib*', 'ru.akbars*', 'com.ubrr*', 'ru.mkb*'
];

// Wallets: they mostly repeat the bank's push and are a spare source.
var WALLETS = ['com.samsung.android.spay*', 'com.samsung.android.samsungpay*', 'com.samsung.android.wallet*', 'ru.nspk.mirpay*'];

// Senders of bank SMS: compared without case, dots, dashes and spaces.
var SMS_SENDERS = ['900', 'SBERBANK', 'Tinkoff', 'T-Bank', 'TBank', 'Alfa-Bank', 'AlfaBank', 'VTB', 'VTB24', 'Raiffeisen',
  'Gazprombank', 'GPB', 'Sovcombank', 'Halva', 'MTS-Bank', 'MTSBank', 'MTS Money', 'Pochtabank', 'Pochta Bank', 'OZON.Bank',
  'OzonBank', 'Yandex.Bank', 'YandexBank', 'PSB', 'Otkritie', 'RSHB', 'Rosbank', 'UBRR', 'Uralsib', 'MKB', 'AkBars', 'Tochka'];

var DEFAULTS = {
  budget: null,                 // the month's budget in `currency`; null — not set
  currency: 'RUB',
  monthStartDay: 1,             // 1 or the day of the salary
  categoryLimits: {},           // { 'Кафе и рестораны': 10000 }
  thresholds: [80, 100],        // percent of the budget to warn at
  dupWindowMin: 10,             // repeats of one purchase (push + SMS + wallet) within ± minutes
  holdDays: 5,                  // a hold and its final debit: days between
  holdTolPct: 5,                // … and the difference of the amounts, percent
  fxTolPct: 10,                 // a purchase abroad at the CBR rate and its ruble debit: difference, percent
  fxDays: 5,
  internalWindowMin: 10,        // out of one bank and in to another: a transfer to oneself
  subMinCount: 3,               // a subscription: at least this many charges
  subDayTol: 3,                 // … the day may move by ± days
  subAmountTolPct: 15,          // … the amount by ± percent
  subRemindDays: 2,             // remind of a charge this many days before
  trialDays: 7,                 // a trial period lasts this long unless the owner says otherwise
  unusualFactor: 3,             // an unusual purchase: this many times the median of its category
  unusualMinSamples: 5,         // … when the category has at least this many purchases
  unusualDays: 90,              // … over this many days
  parseNew: 'local',            // unknown formats: 'local' — only a model on the phone; 'cloud' — any; 'off'
  ruleSamples: 3,               // samples of one new format before asking for a rule
  categoryModel: true,          // sort new shops into categories with the model spending.category
  categoryEveryMin: 60,
  categoryBatch: 40,
  reviewModel: true,            // the monthly review worded by spending.review (only numbers go there)
  reviewAt: '10:00',
  reviewMonths: 3,              // compare the month with the average of this many before it
  keepRaw: false,               // keep the texts of notifications (balances inside)
  keepRawDays: 90,
  importDays: 90,               // SMS history to import at the first run
  importLimit: 5000,
  unparsedKeep: 200,
  unparsedDays: 14,
  transfersInBudget: true,      // transfers to people count as spending
  sleepThresholdMin: 360,       // short night: less than this many minutes of sleep
  sleepMinDays: 8,              // each group needs at least this many days
  sleepRatio: 1.5,              // … and the difference must be bigger than this
  sleepDays: 90,
  manualMatchMin: 60,           // an expense the agent wrote into the base is the same as an operation within ± minutes
  noDeliveryDays: 7,            // «Неделя без доставки»: this many days without food delivery…
  noDeliveryBeforeDays: 30,     // … after a delivery within this many days before them (a habit, not an empty history)
  widgetUpcoming: 1,            // subscriptions on the widget
  overviewRecent: 10,
  rateUrl: 'https://www.cbr-xml-daily.ru/daily_json.js',
  rateArchiveUrl: 'https://www.cbr-xml-daily.ru/archive/{yyyy}/{mm}/{dd}/daily_json.js',
  notify: { budget: true, unusual: true, subs: true, review: true, trials: true },
  categories: CATEGORIES,
  packages: PACKAGES,
  wallets: WALLETS,
  smsSenders: SMS_SENDERS
};

var NUMBERS = {
  monthStartDay: [1, 28], dupWindowMin: [0, 120], holdDays: [0, 14], holdTolPct: [0, 50], fxTolPct: [0, 50], fxDays: [1, 30],
  internalWindowMin: [0, 120], subMinCount: [2, 12], subDayTol: [0, 7], subAmountTolPct: [0, 100], subRemindDays: [0, 14],
  trialDays: [1, 90], unusualFactor: [1.5, 20], unusualMinSamples: [1, 100], unusualDays: [14, 730], ruleSamples: [1, 10],
  categoryEveryMin: [5, 1440], categoryBatch: [1, 200], reviewMonths: [1, 12], keepRawDays: [1, 3650], importDays: [0, 730],
  importLimit: [100, 50000], unparsedKeep: [20, 2000], unparsedDays: [1, 90], sleepThresholdMin: [180, 600],
  sleepMinDays: [3, 60], sleepRatio: [1.1, 10], sleepDays: [14, 365], manualMatchMin: [0, 1440], widgetUpcoming: [0, 3],
  overviewRecent: [0, 50], noDeliveryDays: [3, 60], noDeliveryBeforeDays: [7, 365]
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function list(value, fallback) {
  if (!Array.isArray(value)) return fallback.slice();
  return value.map(function (item) { return String(item).trim(); }).filter(function (item) { return item; });
}

/** The saved settings over the defaults, every field in its bounds. */
function normalize(saved) {
  var out = clone(DEFAULTS);
  saved = saved && typeof saved === 'object' ? saved : {};
  Object.keys(saved).forEach(function (key) {
    if (key in DEFAULTS) out[key] = saved[key];
  });
  Object.keys(NUMBERS).forEach(function (key) {
    var n = Number(out[key]);
    if (!isFinite(n)) n = DEFAULTS[key];
    out[key] = Math.min(NUMBERS[key][1], Math.max(NUMBERS[key][0], n));
  });
  out.monthStartDay = Math.round(out.monthStartDay);
  var budget = out.budget === '' || out.budget === null || out.budget === undefined ? null : Number(out.budget);
  out.budget = budget > 0 ? Math.round(budget) : null;
  out.currency = /^[A-Z]{3}$/.test(String(out.currency || '')) ? String(out.currency) : 'RUB';
  out.thresholds = (Array.isArray(out.thresholds) ? out.thresholds : DEFAULTS.thresholds)
    .map(Number).filter(function (n) { return n > 0 && n <= 500; }).sort(function (a, b) { return a - b; });
  var limits = {};
  Object.keys(out.categoryLimits && typeof out.categoryLimits === 'object' ? out.categoryLimits : {}).forEach(function (name) {
    var n = Number(out.categoryLimits[name]);
    if (n > 0) limits[name] = Math.round(n);
  });
  out.categoryLimits = limits;
  if (['local', 'cloud', 'off'].indexOf(out.parseNew) < 0) out.parseNew = DEFAULTS.parseNew;
  ['keepRaw', 'transfersInBudget', 'categoryModel', 'reviewModel'].forEach(function (key) { out[key] = Boolean(out[key]); });
  out.reviewAt = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(out.reviewAt)) ? String(out.reviewAt) : DEFAULTS.reviewAt;
  var notify = {};
  Object.keys(DEFAULTS.notify).forEach(function (key) {
    notify[key] = out.notify && out.notify[key] !== undefined ? Boolean(out.notify[key]) : DEFAULTS.notify[key];
  });
  out.notify = notify;
  out.categories = list(out.categories, CATEGORIES);
  if (out.categories.indexOf('Прочее') < 0) out.categories.push('Прочее');
  out.packages = list(out.packages, PACKAGES);
  out.wallets = list(out.wallets, WALLETS);
  out.smsSenders = list(out.smsSenders, SMS_SENDERS);
  out.rateUrl = String(out.rateUrl || DEFAULTS.rateUrl);
  out.rateArchiveUrl = String(out.rateArchiveUrl || DEFAULTS.rateArchiveUrl);
  return out;
}

/** Does a package or a sender match a list entry ("ru.sberbank*" is a prefix)? */
function matches(listOf, who) {
  var id = String(who || '').toLowerCase();
  if (!id) return false;
  return (listOf || []).some(function (item) {
    var want = String(item).toLowerCase();
    if (want.charAt(want.length - 1) === '*') return id.indexOf(want.slice(0, -1)) === 0;
    return id === want;
  });
}

function senderKey(name) {
  return String(name || '').toLowerCase().replace(/[\s.\-_]/g, '');
}

/** Is this SMS sender in the list? "Alfa-Bank", "ALFABANK" and "alfa bank" are one. */
function smsSender(listOf, from) {
  var k = senderKey(from);
  if (!k) return false;
  return (listOf || []).some(function (item) { return senderKey(item) === k; });
}

exports.CATEGORIES = CATEGORIES;
exports.DEFAULTS = DEFAULTS;
exports.NUMBERS = NUMBERS;
exports.normalize = normalize;
exports.matches = matches;
exports.smsSender = smsSender;
exports.senderKey = senderKey;
