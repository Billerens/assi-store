// Text and money of bank messages: spaces, amounts, currencies, cards. Pure: no Android, no native.
// Works the same under node (tests) and in the Rhino engine of Axiko.

// A number as banks write it: "350", "1 299", "12 345,67", "12345.67". Thousands go in groups of
// three after a space, so "*1234 350" stays two numbers, not one.
var AMT = String.raw`(?<![\d.,])(?:\d{1,3}(?: \d{3})+|\d+)(?:[.,]\d{1,2})?(?![\d])`;

// Currency marks after a number; longer words first so that "руб." is not cut to "р".
var CUR = String.raw`₽|рублей|рубля|рубль|руб\.?|р\.?|RUB|RUR|USD|EUR|GBP|CNY|KZT|BYN|TRY|GEL|AMD|UZS|KGS|AED|THB|JPY|\$|€|£|¥|₸|₺`;

// Currency marks before a number: "$12.99", "€ 15,50".
var CURPRE = String.raw`\$|€|£|USD|EUR`;

var CODES = {
  '₽': 'RUB', 'р': 'RUB', 'р.': 'RUB', 'руб': 'RUB', 'руб.': 'RUB', 'рублей': 'RUB', 'рубля': 'RUB', 'рубль': 'RUB',
  'rub': 'RUB', 'rur': 'RUB', '$': 'USD', 'usd': 'USD', '€': 'EUR', 'eur': 'EUR', '£': 'GBP', 'gbp': 'GBP',
  '¥': 'CNY', 'cny': 'CNY', '₸': 'KZT', 'kzt': 'KZT', 'byn': 'BYN', '₺': 'TRY', 'try': 'TRY', 'gel': 'GEL',
  'amd': 'AMD', 'uzs': 'UZS', 'kgs': 'KGS', 'aed': 'AED', 'thb': 'THB', 'jpy': 'JPY'
};

var SIGNS = { RUB: '₽', USD: '$', EUR: '€', GBP: '£', CNY: '¥', KZT: '₸', TRY: '₺' };

/** One line, ordinary spaces: no-break and thin spaces, tabs and line breaks become a space. */
function normalize(text) {
  return String(text === undefined || text === null ? '' : text)
    .replace(/[       ]/g, ' ')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/ {2,}/g, ' ')
    .trim();
}

/**
 * The title and the text of a notification as one message. Banks put the operation into either:
 * "Покупка 350 ₽" + "Пятёрочка. Карта *1234" → "Покупка 350 ₽. Пятёрочка. Карта *1234".
 */
function combine(title, text) {
  var t = normalize(title);
  var x = normalize(text);
  if (!t) return x;
  if (!x) return t;
  if (x.toLowerCase().indexOf(t.toLowerCase()) === 0) return x;
  if (t.toLowerCase().indexOf(x.toLowerCase()) === 0) return t;
  return /[.!?:;]$/.test(t) ? t + ' ' + x : t + '. ' + x;
}

/** "12 345,67" → 12345.67; "1 299" → 1299; null when there is no number. */
function amount(text) {
  if (text === undefined || text === null) return null;
  if (typeof text === 'number') return isFinite(text) ? text : null;
  var s = normalize(text).replace(/ /g, '');
  if (!/\d/.test(s)) return null;
  var dot = s.lastIndexOf('.');
  var comma = s.lastIndexOf(',');
  if (dot >= 0 && comma >= 0) {
    // Both: the last one is the decimal mark.
    if (dot > comma) s = s.replace(/,/g, '');
    else s = s.replace(/\./g, '').replace(',', '.');
  } else if (comma >= 0) {
    // "1,299" with exactly three digits after is a thousands mark; "350,00" is a decimal one.
    s = /^\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
  } else if (dot >= 0 && /^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, '');
  }
  s = s.replace(/[^\d.]/g, '');
  var value = parseFloat(s);
  return isFinite(value) ? Math.round(value * 100) / 100 : null;
}

/** "₽", "р.", "RUR" → "RUB"; unknown → the text upper-cased; nothing → null. */
function currency(mark) {
  if (!mark) return null;
  var key = String(mark).trim().toLowerCase();
  if (CODES[key]) return CODES[key];
  if (/^[a-z]{3}$/.test(key)) return key.toUpperCase();
  return null;
}

/** The last four digits of a card or an account: "MIR-1234", "*1234", "•• 1234" → "1234". */
function card(text) {
  if (!text) return null;
  var digits = String(text).replace(/\D/g, '');
  return digits.length >= 4 ? digits.slice(-4) : null;
}

/** Money tokens of a message in order: [{ index, end, value, currency, text }]. */
function tokens(text) {
  var s = normalize(text);
  var re = new RegExp('(' + AMT + ') ?(' + CUR + ')(?![А-Яа-яЁёA-Za-z])|(?:^|[^А-Яа-яЁёA-Za-z])(' + CURPRE + ') ?(' + AMT + ')', 'gi');
  var out = [];
  var m;
  while ((m = re.exec(s)) !== null) {
    if (m[1] !== undefined) {
      out.push({ index: m.index, end: m.index + m[0].length, value: amount(m[1]), currency: currency(m[2]), text: m[0] });
    } else {
      var start = m.index + m[0].indexOf(m[3]);
      out.push({ index: start, end: m.index + m[0].length, value: amount(m[4]), currency: currency(m[3]), text: m[0].slice(m[0].indexOf(m[3])) });
    }
  }
  return out.filter(function (token) { return token.value !== null && token.currency; });
}

/** "1 250 ₽", "12,99 $": an amount for the screen and notifications. */
function format(value, code, digits) {
  if (value === null || value === undefined || !isFinite(value)) return '—';
  var negative = value < 0;
  var abs = Math.abs(value);
  var places = digits === undefined ? (Math.round(abs * 100) % 100 === 0 ? 0 : 2) : digits;
  var fixed = abs.toFixed(places);
  var parts = fixed.split('.');
  var whole = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  var text = whole + (parts[1] ? ',' + parts[1] : '');
  var sign = SIGNS[code || 'RUB'] || (code || '');
  return (negative ? '−' : '') + text + ' ' + sign;
}

/** Converts between currencies by rates given as "how many RUB one unit costs": { USD: 92.5 }. */
function convert(value, from, to, rates) {
  if (value === null || value === undefined || (typeof value === 'string' && !value.trim())) return null;
  value = Number(value);
  if (!isFinite(value)) return null;
  from = from || 'RUB';
  to = to || 'RUB';
  if (from === to) return Math.round(value * 100) / 100;
  function rate(code) {
    var n = rates && Number(rates[code]);
    return n > 0 && isFinite(n) ? n : null;
  }
  var fromRate = rate(from);
  var toRate = rate(to);
  var rub = from === 'RUB' ? value : (fromRate !== null ? value * fromRate : null);
  if (rub === null) return null;
  var out = to === 'RUB' ? rub : (toRate !== null ? rub / toRate : null);
  return out === null || !isFinite(out) ? null : Math.round(out * 100) / 100;
}

/** Rates from the CBR JSON (cbr-xml-daily.ru): { USD: 92.5, EUR: 99.1, … } per one unit. */
function cbrRates(json) {
  var out = {};
  var valute = json && json.Valute ? json.Valute : {};
  Object.keys(valute).forEach(function (code) {
    var item = valute[code];
    var value = item && Number(item.Value);
    var nominal = item && Number(item.Nominal);
    if (value > 0 && nominal > 0 && isFinite(value) && isFinite(nominal) && isFinite(value / nominal)) out[code] = value / nominal;
  });
  return out;
}

exports.AMT = AMT;
exports.CUR = CUR;
exports.CURPRE = CURPRE;
exports.normalize = normalize;
exports.combine = combine;
exports.amount = amount;
exports.currency = currency;
exports.card = card;
exports.tokens = tokens;
exports.format = format;
exports.convert = convert;
exports.cbrRates = cbrRates;
