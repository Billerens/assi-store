// Words of «Гороскоп по данным»: predictions become sentences from templates.json, the day's text
// is built from them; a model may write it instead, and its text is taken only if every number in
// it is among the facts and it passes the word filter. Pure: no Android.
var dates = require('./dates.js');

/** Words of reproach and of medical advice: a text with any of them is not shown. */
exports.BANNED = ['ленив', 'лентя', 'стыд', 'позор', 'опять не', 'снова не', 'должен', 'обязан', 'виноват', 'плохо', 'провал', 'зря', 'слаб',
  'лекарств', 'таблет', 'врач', 'диет', 'лечени'];

exports.clean = function (text, extra) {
  var low = String(text || '').toLowerCase();
  return !exports.BANNED.concat(extra || []).some(function (word) { return word && low.indexOf(String(word).toLowerCase()) >= 0; });
};

var DATIVE = ['понедельнику', 'вторнику', 'среде', 'четвергу', 'пятнице', 'субботе', 'воскресенью'];

function plural(n, one, few, many) {
  var tens = n % 100;
  var ones = n % 10;
  if (tens >= 11 && tens <= 14) return many;
  if (ones === 1) return one;
  return ones >= 2 && ones <= 4 ? few : many;
}
exports.plural = plural;

function grouped(n) {
  var value = Math.round(Number(n) || 0);
  return Math.abs(value) >= 10000 ? String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') : String(value);
}

/** Steady choice: the same day and prediction give the same sentence. */
function choose(list, seed) {
  if (!list || !list.length) return '';
  var h = 0;
  String(seed).split('').forEach(function (ch) { h = (h * 31 + ch.charCodeAt(0)) % 2147483647; });
  return list[h % list.length];
}
exports.choose = choose;

exports.fill = function (template, params) {
  return String(template || '').replace(/\{(\w+)\}/g, function (all, key) {
    return params[key] === undefined || params[key] === null ? all : String(params[key]);
  });
};

/** Every value a template may use, from the prediction's params and the date. */
function paramsOf(prediction, date) {
  var p = prediction.params || {};
  var weekday = p.weekday || dates.weekday(date);
  var out = {};
  Object.keys(p).forEach(function (key) { out[key] = p[key]; });
  out.weekdayAcc = dates.weekdayName(weekday, 'acc');
  out.weekdayGen = dates.weekdayName(weekday, 'gen');
  out.weekdayPl = dates.weekdayName(weekday, 'pl');
  if (p.goal !== undefined) out.goal = grouped(p.goal);
  if (p.usual !== undefined && typeof p.usual === 'number') out.usual = grouped(p.usual);
  if (p.toNext !== undefined) out.toNext = grouped(p.toNext);
  if (p.inDays !== undefined) out.inDaysText = p.inDays + ' ' + plural(p.inDays, 'день', 'дня', 'дней');
  if (p.daysLeft !== undefined) out.daysLeftText = p.daysLeft + ' ' + plural(p.daysLeft, 'день', 'дня', 'дней');
  if (p.title !== undefined && prediction.kind === 'achievement') out.achievement = p.title;
  if (p.by !== undefined) out.byDat = DATIVE[(p.by - 1 + 7) % 7];
  if (prediction.detector === 'holiday' && p.inDays !== undefined) out.whenText = p.inDays === 1 ? 'завтра' : p.inDays === 2 ? 'послезавтра' : 'через ' + out.inDaysText;
  return out;
}

function claimKey(prediction) {
  var base = prediction.id.split(':')[0];
  if (prediction.detector === 'chain') return prediction.params && prediction.params.inDays > 0 ? 'chainLater' : 'chain';
  if (prediction.detector === 'achievement') return 'achievement';
  return base;
}

/**
 * The words of one prediction: { claim, facts: [fact], source }.
 *   settings: { tone: 'soft' | 'sharp', mentionPlaces }
 */
exports.describe = function (prediction, templates, settings, date, paused) {
  settings = settings || {};
  var spec = (templates.claims || {})[claimKey(prediction)] || templates.claims.calm;
  var tone = settings.tone === 'sharp' && !paused ? 'sharp' : 'soft';
  var anon = prediction.kind === 'places' && settings.mentionPlaces === false;
  var list = (anon && spec[tone + '_anon']) || spec[tone] || spec.soft;
  var params = paramsOf(prediction, date);
  return {
    claim: exports.fill(choose(list, date + ':' + prediction.id), params),
    facts: [exports.fill((anon && spec.fact_anon) || spec.fact, params)],
    source: spec.source
  };
};

/** The day's text from templates: intro with the sign, a pause line, the claims, an ending. */
exports.compose = function (sign, predictions, templates, settings, date, paused) {
  // A pause is always told softly.
  var tone = settings && settings.tone === 'sharp' && !paused ? 'sharp' : 'soft';
  var weekday = dates.weekday(date);
  var params = { weekdayAcc: dates.weekdayName(weekday, 'acc'), sign: sign ? sign.title : '' };
  var parts = [exports.fill(choose((sign ? templates.intro : templates.introNoSign)[tone], date + ':intro'), params)];
  if (sign && sign.starTitle && templates.signLine) {
    parts.push(exports.fill(choose(templates.signLine[tone], date + ':sign'), {
      star: sign.starTitle, starAbout: sign.starAbout, house: sign.houseTitle, houseAbout: sign.houseAbout
    }));
  }
  if (paused) parts.push(choose(templates.pause[tone], date + ':pause'));
  var claims = predictions.filter(function (p) { return p.claim; });
  if (!claims.length && !paused) parts.push(choose(templates.empty[tone], date + ':empty'));
  claims.forEach(function (p) { parts.push(p.claim); });
  parts.push(choose(templates.outro[tone], date + ':outro'));
  return parts.join(' ');
};

/** Numbers of a text, «8 000» read as 8000, «22:00» as 22 and 00. */
exports.numbers = function (text) {
  return (String(text || '').replace(/(\d)[\s ](?=\d{3}\b)/g, '$1').match(/\d+(?:[.,]\d+)?/g) || []).map(function (n) {
    return String(Number(n.replace(',', '.')));
  });
};

/** The prompt of the model role horoscope.write: only the facts, the rules of the doc. */
exports.prompt = function (sign, predictions, settings, date, paused) {
  settings = settings || {};
  var rules = [
    'Ты пишешь шуточный гороскоп на день по-русски, 400–600 знаков, в стиле гороскопа, на «вы».',
    'Используй только переданные факты; числа и время не меняй и новых не добавляй.',
    'Не давай советов о здоровье и лекарствах. Не упрекай и не стыди. Без эмодзи.',
    settings.tone === 'sharp' ? 'Тон — ехидный, но добрый.' : 'Тон — мягкий.'
  ];
  if (!settings.mentionMoney) rules.push('Не упоминай суммы денег.');
  if (settings.mentionPlaces === false) rules.push('Не называй места по именам.');
  var lines = ['День: ' + dates.weekdayName(dates.weekday(date), 'nom') + '.'];
  if (sign) lines.push('Знак недели: ' + sign.title + '.');
  if (paused) lines.push('Сегодня пауза (отдых или болезнь): только мягко и уютно, без предсказаний о шагах, сне и экране.');
  predictions.forEach(function (p, i) {
    lines.push((i + 1) + ') ' + p.claim + ' Факт: ' + (p.facts || []).join('; ') + '.');
  });
  return { system: rules.join(' '), prompt: lines.join('\n') };
};

/** Is the model's text fit to show: { ok, reason }. */
exports.accept = function (text, predictions, settings, date, extraBanned) {
  settings = settings || {};
  var value = String(text || '').trim();
  if (value.length < (settings.minLength || 200) || value.length > (settings.maxLength || 1200)) return { ok: false, reason: 'длина ' + value.length };
  if (!exports.clean(value, extraBanned)) return { ok: false, reason: 'слова с упрёком или о лечении' };
  if (!settings.mentionMoney && /₽|руб|\$|€/i.test(value)) return { ok: false, reason: 'суммы денег' };
  var allowed = {};
  predictions.forEach(function (p) {
    exports.numbers(p.claim).concat(exports.numbers((p.facts || []).join(' '))).forEach(function (n) { allowed[n] = true; });
  });
  var bad = exports.numbers(value).filter(function (n) { return !allowed[n]; });
  if (bad.length) return { ok: false, reason: 'числа не из фактов: ' + bad.join(', ') };
  return { ok: true };
};

/** The first sentence: for the widget and the notification. */
exports.first = function (text) {
  var match = /^(.+?[.!?])(\s|$)/.exec(String(text || ''));
  return match ? match[1] : String(text || '').slice(0, 140);
};
