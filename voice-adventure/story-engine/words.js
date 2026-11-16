// Words of spoken Russian: normalization of what the recognizer heard, numbers in words,
// typo distance, a rough stem. Pure logic: runs in the engine (Rhino) and under node.

var ONES = ['ноль', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'];
var TEENS = ['десять', 'одиннадцать', 'двенадцать', 'тринадцать', 'четырнадцать', 'пятнадцать',
  'шестнадцать', 'семнадцать', 'восемнадцать', 'девятнадцать'];
var TENS = ['', '', 'двадцать', 'тридцать', 'сорок', 'пятьдесят', 'шестьдесят', 'семьдесят', 'восемьдесят', 'девяносто'];
var HUNDREDS = ['', 'сто', 'двести', 'триста', 'четыреста', 'пятьсот', 'шестьсот', 'семьсот', 'восемьсот', 'девятьсот'];

function under1000(n, feminine) {
  var parts = [];
  if (n >= 100) {
    parts.push(HUNDREDS[Math.floor(n / 100)]);
    n = n % 100;
  }
  if (n >= 20) {
    parts.push(TENS[Math.floor(n / 10)]);
    n = n % 10;
    if (n) parts.push(feminine && n < 3 ? ['', 'одна', 'две'][n] : ONES[n]);
  } else if (n >= 10) {
    parts.push(TEENS[n - 10]);
  } else if (n > 0) {
    parts.push(feminine && n < 3 ? ['', 'одна', 'две'][n] : ONES[n]);
  }
  return parts.join(' ');
}

/** 0..999999 in words: 34 -> «тридцать четыре»; larger numbers stay digits. */
function numberWords(n) {
  n = Math.floor(Math.abs(Number(n)));
  if (!isFinite(n)) return '';
  if (n === 0) return ONES[0];
  if (n > 999999) return String(n);
  var out = [];
  var thousands = Math.floor(n / 1000);
  if (thousands) {
    var last = thousands % 10;
    var lastTwo = thousands % 100;
    var word = lastTwo >= 11 && lastTwo <= 14 ? 'тысяч' : last === 1 ? 'тысяча' : last >= 2 && last <= 4 ? 'тысячи' : 'тысяч';
    out.push(under1000(thousands, true), word);
  }
  var rest = n % 1000;
  if (rest) out.push(under1000(rest, false));
  return out.join(' ').replace(/\s+/g, ' ').trim();
}

/** Lower case, «ё» -> «е», digits in words, no punctuation, single spaces. */
function normalize(text) {
  var s = String(text === undefined || text === null ? '' : text).toLowerCase().replace(/ё/g, 'е');
  s = s.replace(/\d+/g, function (digits) { return ' ' + numberWords(Number(digits)) + ' '; });
  s = s.replace(/[^a-zа-я0-9\s-]/g, ' ');
  s = s.replace(/(^|\s)-+/g, ' ').replace(/-+(\s|$)/g, ' ');
  return s.replace(/\s+/g, ' ').trim();
}

function tokens(text) {
  var s = normalize(text);
  return s ? s.split(' ') : [];
}

/** Edit distance; stops early (returns max + 1) once it is clearly over max. */
function levenshtein(a, b, max) {
  a = String(a);
  b = String(b);
  if (max === undefined) max = Math.max(a.length, b.length);
  if (Math.abs(a.length - b.length) > max) return max + 1;
  var previous = [];
  var current = [];
  var i;
  var j;
  for (j = 0; j <= b.length; j++) previous[j] = j;
  for (i = 1; i <= a.length; i++) {
    current = [i];
    var best = i;
    for (j = 1; j <= b.length; j++) {
      var cost = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
      if (current[j] < best) best = current[j];
    }
    if (best > max) return max + 1;
    previous = current;
  }
  return previous[b.length];
}

var ENDINGS = ['иями', 'ями', 'ами', 'ого', 'его', 'ому', 'ему', 'ыми', 'ими', 'иях', 'ией', 'ешь', 'ишь',
  'ете', 'ите', 'ют', 'ут', 'ят', 'ат', 'ей', 'ой', 'ий', 'ый', 'ая', 'яя', 'ое', 'ее', 'ую', 'юю',
  'ом', 'ем', 'ах', 'ях', 'ам', 'ям', 'ов', 'ев', 'ью', 'ия', 'ие', 'ии', 'ть', 'ти', 'чь',
  'а', 'я', 'о', 'е', 'ы', 'и', 'у', 'ю', 'ь', 'й'];

/** A rough Russian stem: the word without its usual ending, kept at three letters or more. */
function stem(word) {
  word = normalize(word);
  for (var i = 0; i < ENDINGS.length; i++) {
    var ending = ENDINGS[i];
    if (word.length - ending.length >= 3 && word.slice(-ending.length) === ending) return word.slice(0, -ending.length);
  }
  return word;
}

function commonPrefix(a, b) {
  var n = 0;
  while (n < a.length && n < b.length && a.charAt(n) === b.charAt(n)) n++;
  return n;
}

/**
 * Does the heard word stand for this form? Exact, or a typo of the recognizer (distance up to
 * maxTypos; 1 for words of five letters and less), or the same stem.
 */
function similar(word, form, maxTypos) {
  word = normalize(word);
  form = normalize(form);
  if (!word || !form) return false;
  if (word === form) return true;
  if (word.length < 4 || form.length < 4) return false;
  var allowed = Math.min(form.length, word.length) <= 5 ? 1 : (maxTypos === undefined ? 2 : maxTypos);
  if (levenshtein(word, form, allowed) <= allowed) return true;
  var a = stem(word);
  var b = stem(form);
  return a.length >= 4 && a === b;
}

/** Sentences of a text, each with its own end mark (for speaking with pauses between them). */
function sentences(text) {
  var found = String(text || '').match(/[^.!?…]+[.!?…]*["»)]?/g) || [];
  return found.map(function (part) { return part.trim(); }).filter(function (part) { return part; });
}

/** A text cut to at most max characters at a sentence or word boundary. */
function clip(text, max) {
  text = String(text || '').trim();
  if (text.length <= max) return text;
  var cut = text.slice(0, max);
  var stop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  if (stop > max * 0.5) return cut.slice(0, stop + 1);
  var space = cut.lastIndexOf(' ');
  return (space > 0 ? cut.slice(0, space) : cut) + '…';
}

/** «лампа и ключ», «лампа, ключ и карта». */
function joinAnd(list) {
  list = list.filter(function (item) { return item; });
  if (list.length <= 1) return list.join('');
  return list.slice(0, -1).join(', ') + ' и ' + list[list.length - 1];
}

/** «1 глава», «2 главы», «5 глав». */
function plural(n, one, few, many) {
  var a = Math.abs(n) % 100;
  var b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}

function capital(text) {
  text = String(text || '');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

exports.numberWords = numberWords;
exports.normalize = normalize;
exports.tokens = tokens;
exports.levenshtein = levenshtein;
exports.stem = stem;
exports.commonPrefix = commonPrefix;
exports.similar = similar;
exports.sentences = sentences;
exports.clip = clip;
exports.joinAnd = joinAnd;
exports.plural = plural;
exports.capital = capital;
