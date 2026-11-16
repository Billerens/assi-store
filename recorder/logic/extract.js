// What code alone finds in a transcript, without a model: numbers said in words («пятьсот» → 500),
// dates and times («до пятницы», «двадцатого ноября», «через час», «в девять»), commands of a short
// thought («напиши Пете, что опоздаю», «потратил пятьсот на такси», «напомни завтра купить хлеб»),
// and for a meeting — decisions, tasks with who and when, open questions, people and topics.
// A model does the same better; this is what is there when it is not. Pure.
var text = require('./text.js');

var UNITS = {
  'ноль': 0, 'один': 1, 'одна': 1, 'одно': 1, 'одну': 1, 'два': 2, 'две': 2, 'три': 3, 'четыре': 4, 'пять': 5, 'шесть': 6,
  'семь': 7, 'восемь': 8, 'девять': 9
};
var TEENS = {
  'десять': 10, 'одиннадцать': 11, 'двенадцать': 12, 'тринадцать': 13, 'четырнадцать': 14, 'пятнадцать': 15,
  'шестнадцать': 16, 'семнадцать': 17, 'восемнадцать': 18, 'девятнадцать': 19
};
var TENS = { 'двадцать': 20, 'тридцать': 30, 'сорок': 40, 'пятьдесят': 50, 'шестьдесят': 60, 'семьдесят': 70, 'восемьдесят': 80, 'девяносто': 90 };
var HUNDREDS = {
  'сто': 100, 'двести': 200, 'триста': 300, 'четыреста': 400, 'пятьсот': 500, 'шестьсот': 600, 'семьсот': 700,
  'восемьсот': 800, 'девятьсот': 900
};
var THOUSAND = /^тысяч[аиуе]?$|^тыщ[аиу]?$|^тыс$/;
var MILLION = /^миллион(а|ов)?$|^млн$/;
var HALF = { 'полторы': 1.5, 'полтора': 1.5 };
var ORDINALS = {
  'перв': 1, 'втор': 2, 'трет': 3, 'четверт': 4, 'пят': 5, 'шест': 6, 'седьм': 7, 'восьм': 8, 'девят': 9, 'десят': 10,
  'одиннадцат': 11, 'двенадцат': 12, 'тринадцат': 13, 'четырнадцат': 14, 'пятнадцат': 15, 'шестнадцат': 16,
  'семнадцат': 17, 'восемнадцат': 18, 'девятнадцат': 19, 'двадцат': 20, 'тридцат': 30
};

function ordinal(word) {
  var m = /^(.+?)(ое|ого|ий|ый|ой|ье|ьего|его|ая|ую|ые|ых|ому|ем|ом)$/.exec(word);
  if (!m) return null;
  var root = m[1];
  if (ORDINALS[root] !== undefined) return ORDINALS[root];
  if (root === 'тре') return 3;
  return null;
}

/**
 * Numbers said in words become digits: «две тысячи пятьсот» → «2500»; with ordinals: true also
 * «двадцать пятого» → «25-го» (for dates).
 */
function digits(input, ordinals) {
  var tokens = String(input || '').split(/(\s+)/);
  var out = [];
  var run = null;
  var close = function () {
    if (!run) return;
    out.push(String(run.total + run.current));
    if (run.space) out.push(run.space);
    run = null;
  };
  var finish = function (tail) {
    var r = run;
    run = null;
    out.push(String(r.total + r.current) + tail);
  };
  for (var i = 0; i < tokens.length; i++) {
    var tok = tokens[i];
    if (tok === '') continue;
    if (/^\s+$/.test(tok)) {
      if (run) run.space = tok; else out.push(tok);
      continue;
    }
    var m = /^([^0-9A-Za-zА-Яа-яЁё]*)([0-9A-Za-zА-Яа-яЁё]+)([^0-9A-Za-zА-Яа-яЁё]*)$/.exec(tok);
    if (!m || m[1]) { close(); out.push(tok); continue; }
    var w = text.plain(m[2]);
    var tail = m[3];
    var v = null;
    var p = 0;
    if (UNITS[w] !== undefined) { v = UNITS[w]; p = 1; }
    else if (TEENS[w] !== undefined) { v = TEENS[w]; p = 1; }
    else if (TENS[w] !== undefined) { v = TENS[w]; p = 2; }
    else if (HUNDREDS[w] !== undefined) { v = HUNDREDS[w]; p = 3; }
    else if (HALF[w] !== undefined) { v = HALF[w]; p = 1; }
    if (v !== null) {
      if (run && p >= run.place) close();
      if (!run) run = { total: 0, current: 0, place: 9, space: '', big: 0 };
      run.current += v;
      run.place = p;
      run.space = '';
      if (tail) finish(tail);
      continue;
    }
    if (THOUSAND.test(w) || MILLION.test(w)) {
      var mult = THOUSAND.test(w) ? 1000 : 1e6;
      var place = mult === 1000 ? 4 : 7;
      if (run && run.big && place >= run.big) close();
      if (!run) run = { total: 0, current: 0, place: 9, space: '', big: 0 };
      run.total += (run.current || 1) * mult;
      run.current = 0;
      run.place = place;
      run.big = place;
      run.space = '';
      if (tail) finish(tail);
      continue;
    }
    var o = ordinals ? ordinal(w) : null;
    if (o !== null) {
      if (run && (o < 20 ? 1 : 2) >= run.place) close();
      var before = run ? run.total + run.current : 0;
      run = null;
      out.push(String(before + o) + '-го' + tail);
      continue;
    }
    close();
    out.push(tok);
  }
  close();
  return out.join('');
}

var MONTHS = ['январ', 'феврал', 'март', 'апрел', 'ма', 'июн', 'июл', 'август', 'сентябр', 'октябр', 'ноябр', 'декабр'];
var MONTH_RE = '(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)';
var WEEKDAYS = [['воскресень'], ['понедельник'], ['вторник'], ['сред'], ['четверг'], ['пятниц'], ['суббот']];
var WEEKDAY_RE = '(понедельник[а]?|вторник[а]?|сред[уеы]|четверг[а]?|пятниц[уеы]|суббот[уеы]|воскресень[яе])';

function iso(d) {
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

function dayStart(time) {
  var d = new Date(time);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d, n) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

function weekday(word) {
  for (var i = 0; i < WEEKDAYS.length; i++) if (word.indexOf(WEEKDAYS[i][0]) === 0) return i;
  return -1;
}

function monthIndex(word) {
  for (var i = 0; i < MONTHS.length; i++) {
    if (word.indexOf(MONTHS[i]) === 0 && !(i === 4 && word !== 'мая')) return i;
  }
  return -1;
}

/**
 * A date and a time in a phrase, relative to `now`. → { date: 'YYYY-MM-DD' | null, time: 'HH:MM' | null,
 * at: ms | null (date and time, or now + a span), match: the words found } or null.
 */
function when(phrase, now) {
  var t = text.plain(digits(phrase, true));
  var base = dayStart(now);
  var date = null;
  var time = null;
  var at = null;
  var found = [];
  var m;
  if ((m = /(?:^|[^а-я])через\s+(?:(\d+)\s+)?(минут[уы]?|час[аов]*|дн[яей]+|день|недел[июь]+|месяц[аев]*)/.exec(t))) {
    var n = m[1] ? Number(m[1]) : 1;
    var unit = m[2];
    found.push(m[0].trim());
    if (/^минут/.test(unit)) at = now + n * 60000;
    else if (/^час/.test(unit)) at = now + n * 3600000;
    else if (/^(дн|день)/.test(unit)) date = addDays(base, n);
    else if (/^недел/.test(unit)) date = addDays(base, 7 * n);
    else date = new Date(base.getFullYear(), base.getMonth() + n, base.getDate());
  }
  if (!date && !at && (m = /(?:^|[^а-я])(сегодня|завтра|послезавтра)(?![а-я])/.exec(t))) {
    found.push(m[1]);
    date = addDays(base, m[1] === 'сегодня' ? 0 : m[1] === 'завтра' ? 1 : 2);
  }
  if (!date && !at && (m = new RegExp('(?:^|[^а-я])(\\d{1,2})(?:-?го|-?е)?\\s+' + MONTH_RE + '(?:\\s+(\\d{4}))?').exec(t))) {
    found.push(m[0].trim());
    var mi = monthIndex(m[2]);
    var y = m[3] ? Number(m[3]) : base.getFullYear();
    date = new Date(y, mi, Number(m[1]));
    if (!m[3] && date < addDays(base, -1)) date = new Date(y + 1, mi, Number(m[1]));
  }
  if (!date && !at && (m = /(?:^|[^\d.])(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?(?![\d.])/.exec(t))) {
    var dd = Number(m[1]);
    var mm = Number(m[2]);
    if (dd >= 1 && dd <= 31 && mm >= 1 && mm <= 12) {
      found.push(m[0].trim());
      var yy = m[3] ? Number(m[3].length === 2 ? '20' + m[3] : m[3]) : base.getFullYear();
      date = new Date(yy, mm - 1, dd);
      if (!m[3] && date < addDays(base, -1)) date = new Date(yy + 1, mm - 1, dd);
    }
  }
  if (!date && !at && (m = new RegExp('(?:^|[^а-я])(?:в|во|к|до|на|в эт[уот]|в следующ[иуюй]+|до следующ[иейго]+)\\s+' + WEEKDAY_RE).exec(t))) {
    found.push(m[0].trim());
    var wd = weekday(m[1]);
    var next = /следующ/.test(m[0]);
    var diff = (wd - base.getDay() + 7) % 7;
    if (diff === 0) diff = 7;
    if (next && diff < 7 && base.getDay() !== 0 && wd > base.getDay()) diff += 7;
    date = addDays(base, diff);
  }
  if (!date && !at && (m = /(?:^|[^а-я])(?:до|к)\s+конц[ау]\s+(недели|месяца|года)/.exec(t))) {
    found.push(m[0].trim());
    if (m[1] === 'недели') date = addDays(base, (5 - base.getDay() + 7) % 7);
    else if (m[1] === 'месяца') date = new Date(base.getFullYear(), base.getMonth() + 1, 0);
    else date = new Date(base.getFullYear(), 11, 31);
  }
  // The time is looked for in what is left after the date.
  found.forEach(function (f) { t = t.replace(f, ' '); });
  if (!at && (m = /(?:^|[^а-я])(?:в|к)\s+(\d{1,2})(?:[:.\s](\d{2}))?(?:\s*(?:час[аов]*|ч))?(?:\s+(утра|дня|вечера|ночи))?(?![\d.]|-?го)/.exec(t))) {
    var h = Number(m[1]);
    var min = m[2] ? Number(m[2]) : 0;
    if (m[3] === 'вечера' || (m[3] === 'дня' && h < 12)) h = h < 12 ? h + 12 : h;
    if (h <= 23 && min <= 59 && !(m[2] === undefined && m[3] === undefined && /\s(?:минут|дн|недел)/.test(t.slice(m.index + m[0].length, m.index + m[0].length + 8)))) {
      found.push(m[0].trim());
      time = (h < 10 ? '0' : '') + h + ':' + (min < 10 ? '0' : '') + min;
    }
  }
  if (!at && !time && (m = /(?:^|[^а-я])(утром|днем|вечером)(?![а-я])/.exec(t))) {
    found.push(m[1]);
    time = m[1] === 'утром' ? '09:00' : m[1] === 'днем' ? '13:00' : '19:00';
  }
  if (!date && !time && !at) return null;
  if (at) return { date: iso(new Date(at)), time: null, at: at, match: found };
  if (!date) {
    var hh = Number(time.slice(0, 2));
    var mmm = Number(time.slice(3));
    var today = new Date(base.getFullYear(), base.getMonth(), base.getDate(), hh, mmm);
    date = today.getTime() > now ? base : addDays(base, 1);
  }
  var full = null;
  if (time) full = new Date(date.getFullYear(), date.getMonth(), date.getDate(), Number(time.slice(0, 2)), Number(time.slice(3))).getTime();
  return { date: iso(date), time: time, at: full, match: found };
}

/** «Пете» → ['Пете', 'Петя', 'Пета', 'Пет']: the forms a name may have in the list of chats. */
function nameForms(word) {
  var w = String(word || '').trim();
  if (!w) return [];
  var out = [w];
  var push = function (x) { if (x && out.indexOf(x) < 0) out.push(x); };
  var lower = w.toLowerCase();
  var cap = function (x) { return w[0] === w[0].toUpperCase() ? x.charAt(0).toUpperCase() + x.slice(1) : x; };
  var stem = lower.slice(0, -1);
  if (/[^аеиоуыэюя]е$/.test(lower)) { push(cap(stem + 'я')); push(cap(stem + 'а')); }
  if (/[^аеиоуыэюя]у$/.test(lower)) { push(cap(stem)); push(cap(stem + 'а')); }
  if (/ею$/.test(lower)) push(cap(lower.slice(0, -2) + 'ей'));
  if (/[^е]ю$/.test(lower)) { push(cap(stem + 'ь')); push(cap(stem + 'я')); }
  if (/и$/.test(lower)) { push(cap(stem + 'я')); push(cap(stem + 'ь')); }
  if (/ой$/.test(lower)) push(cap(lower.slice(0, -2) + 'а'));
  if (/ам$/.test(lower)) push(cap(lower.slice(0, -2) + 'а'));
  return out;
}

var MESSAGE_RE = /^(?:(?:пожалуйста|слушай|так|ну)[\s,]+)*(?:напиши|напишите|написать|отправь|отправить|скажи|передай|ответь|сообщи|черкни)\s+([а-яёa-z-]+(?:\s+[а-яёa-z-]+)?)\s*(?:[,:-]\s*)?(?:что|чтобы)?\s*[,:]?\s*(.+)$/i;
var EXPENSE_RE = /(?:^|[^а-яё])(потратил[аи]?|заплатил[аи]?|купил[аи]?|отдал[аи]?|оплатил[аи]?|потрачено|трата)(?![а-яё])\s*(.*)$/i;
var REMIND_RE = /^(?:(?:пожалуйста|слушай|так|ну)[\s,]+)*(?:напомни|напомните|напоминание|не забыть|не забудь)(?![а-яё])\s*(?:мне\s+)?(?:о том,?\s*)?(?:что\s+)?(.*)$/i;
var NOT_NAME = /^(мне|ему|ей|им|нам|вам|тебе|себе|сообщение|письмо|смс|в|на|что|про|о)$/i;

function cleanTail(s) {
  return String(s || '').replace(/^[\s,.:;-]+/, '').replace(/[\s,;:-]+$/, '').trim();
}

function money(phrase) {
  var t = digits(phrase);
  var m = /(\d+(?:[.,]\d+)?)\s*(тысяч[аи]?|тыс\.?|к)?(?:\s*(?:руб(?:лей|ля|ль)?|р\.?|₽))?/i.exec(t);
  if (!m) return null;
  var v = Number(m[1].replace(',', '.'));
  if (m[2]) v *= 1000;
  return { amount: v, index: m.index, length: m[0].length, text: t };
}

/**
 * A command in a short thought, or null: { kind: 'message', to, names, text } | { kind: 'expense',
 * amount, what } | { kind: 'reminder', text, date, time, at }. now — when it was said.
 */
function command(phrase, now) {
  var t = String(phrase || '').replace(/\s+/g, ' ').trim().replace(/[.!]+$/, '');
  if (!t) return null;
  var m = MESSAGE_RE.exec(t);
  if (m) {
    var who = m[1].split(' ');
    var body = m[2];
    // «напиши Пете Иванову что…» — two words of a name; «напиши Пете опоздаю» — one.
    if (who.length > 1 && (NOT_NAME.test(who[1]) || /^(что|чтобы)$/i.test(who[1]))) {
      body = who.slice(1).join(' ') + ' ' + body;
      who = [who[0]];
    }
    if (who.length > 1 && !/^[А-ЯЁA-Z]/.test(who[1]) && /[а-яё]/.test(who[1])) {
      body = who[1] + ' ' + body;
      who = [who[0]];
    }
    who = who.map(function (w) { return w.charAt(0).toUpperCase() + w.slice(1); });
    if (!NOT_NAME.test(who[0])) {
      body = cleanTail(body.replace(/^(?:что|чтобы)\s+/i, ''));
      if (body) {
        var name = who.join(' ');
        return { kind: 'message', to: name, names: nameForms(who[0]).map(function (f) { return who.length > 1 ? f + ' ' + who.slice(1).join(' ') : f; }), text: text.sentence(body).replace(/\.$/, '') };
      }
    }
  }
  m = REMIND_RE.exec(t);
  if (m && m[1]) {
    var w = when(m[1], now);
    var rest = m[1];
    if (w) {
      var plainRest = digits(rest, true);
      w.match.forEach(function (x) {
        var re = new RegExp(x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/е/g, '[её]'), 'i');
        plainRest = plainRest.replace(re, ' ');
      });
      rest = plainRest;
    }
    rest = cleanTail(rest.replace(/\s+/g, ' ').replace(/^(?:что|чтобы)\s+/i, '').replace(/^(?:мне|надо|нужно)\s+/i, ''));
    if (rest) return { kind: 'reminder', text: text.sentence(rest).replace(/\.$/, ''), date: w ? w.date : null, time: w ? w.time : null, at: w ? w.at : null };
  }
  m = EXPENSE_RE.exec(t);
  if (m) {
    var sum = money(m[2]);
    if (sum && sum.amount > 0) {
      var tail = sum.text.slice(sum.index + sum.length);
      var head = sum.text.slice(0, sum.index);
      var what = cleanTail(tail.replace(/^\s*(?:на|за|в)\s+/i, '')) || cleanTail(head.replace(/\s+(?:за|на)\s*$/i, ''));
      what = what.replace(/^(?:на|за|в)\s+/i, '');
      return { kind: 'expense', amount: sum.amount, what: what ? what.charAt(0).toUpperCase() + what.slice(1) : null };
    }
  }
  return null;
}

var FILLERS = /^(?:(?:ну|так|значит|короче|в общем|вообще|слушай|смотри|эээ|э|мм|итак|кстати|вот|ладно|давай|ок|окей)[\s,.]+)+/i;

/** A title of a thought: the first words of its first sentence, at most `max`. */
function title(textValue, max) {
  max = max || 6;
  var first = String(textValue || '').replace(/\s+/g, ' ').trim().split(/(?<=[.!?…])\s+/)[0] || '';
  first = first.replace(FILLERS, '').replace(/[.!?…,;:]+$/, '');
  var ws = first.split(' ').filter(Boolean);
  var out = ws.slice(0, max).join(' ').replace(/[,;:]+$/, '');
  if (!out) return null;
  return out.charAt(0).toUpperCase() + out.slice(1);
}

var STOP = ('это этот эта эти того тому там тут здесь потом тоже также когда тогда если чтобы потому поэтому который которая которые ' +
  'просто очень можно нужно надо будет было были есть быть может могу можем хочу хотим давай давайте сейчас сегодня завтра вчера ' +
  'только вообще значит короче вот ладно хорошо ничего чего всего всех свой своей своих нашей наши ваши такой такая такие ' +
  'какой какая какие сколько потому больше меньше раньше позже после перед через между ещё еще уже даже вроде типа кстати ' +
  'говорит говорю сказал сказала думаю знаешь знаю понимаешь сделать сделаем сделаю делать ' +
  'минут минуты часов часа неделе недели месяц месяца года году').split(' ');

// Verbs, adjectives and adverbs by their endings: not what a talk is about.
// Endings that nouns share often («память», «решение», «кредит», «школа») are left alone.
var NOT_TOPIC = /(ться|тся|ать|еть|ить|ыть|уть|али|или|ели|яли|ались|ились|ался|ешь|ишь|ете|ите|ает|яет|еет|ует|ый|ая|яя|ое|ые|ую|юю|ого|ому|ыми|ими|ено|ано|ьно)$/;
// Of two forms of one word, the one that looks more like the dictionary form: not «…е», «…у», «…ю», «…ом».
var OBLIQUE = /(е|у|ю|ом|ем|ой|ей|ами|ями|ах|ях)$/;

/** The most frequent long words (nouns by their look): what the talk was about, in the order they came up. */
function topics(textValue, count, exclude) {
  var freq = {};
  var shown = {};
  var first = {};
  var order = 0;
  var ex = (exclude || []).map(function (x) { return text.plain(x); });
  String(textValue || '').split(/[^A-Za-zА-Яа-яЁё-]+/).forEach(function (raw) {
    var w = text.plain(raw).replace(/^-+|-+$/g, '');
    if (w.length < 5 || STOP.indexOf(w) >= 0 || NOT_TOPIC.test(w)) return;
    var key = w.slice(0, 4);   // one key for «смета», «сметы», «смету»
    if (ex.some(function (e) { return e.indexOf(key) === 0 || key.indexOf(e.slice(0, 4)) === 0; })) return;
    freq[key] = (freq[key] || 0) + 1;
    if (first[key] === undefined) first[key] = order++;
    var was = shown[key];
    if (!was || w.length < was.length || (w.length === was.length && OBLIQUE.test(was) && !OBLIQUE.test(w))) shown[key] = w;
  });
  return Object.keys(freq).filter(function (k) { return freq[k] >= 2; }).sort(function (a, b) { return freq[b] - freq[a] || first[a] - first[b]; })
    .slice(0, count || 3).map(function (k) { return shown[k]; });
}

/** Words of the dictionary (names, terms) said in the text, as the dictionary writes them. */
function dictionaryIn(textValue, dictionary) {
  var ws = text.words(textValue);
  return (dictionary || []).filter(function (d) {
    var parts = text.words(d);
    if (!parts.length) return false;
    return parts.every(function (p) {
      var st = p.length > 4 ? p.slice(0, p.length - 1) : p;
      return ws.some(function (w) { return w.indexOf(st) === 0 && w.length - st.length <= 3; });
    });
  });
}

var DECISION_RE = /(?:^|[^а-яё])(решили|решено|договорились|договоримся|утвердили|согласовали|остановились на|выбрали|принято решение|приняли решение|итого)(?![а-яё])/i;
var TASK_RE = /(?:^|[^а-яё])(нужно|надо|необходимо|должен|должна|должны|сделаю|сделаем|сделает|подготовлю|подготовит|подготовим|отправлю|отправит|пришлю|пришлет|пришлёт|напишу|напишет|позвоню|позвонит|проверю|проверит|займусь|займется|займётся|возьму на себя|берет на себя|берёт на себя|поручили|поручаю|договорился|закажу|закажет|купим|куплю|купит|посчитаю|посчитает|созвонимся|уточню|уточнит)(?![а-яё])/i;
var MINE_RE = /(?:^|[^а-яё])(сделаю|подготовлю|отправлю|пришлю|напишу|позвоню|проверю|займусь|возьму на себя|закажу|куплю|посчитаю|уточню|мне нужно|мне надо|я должен|я должна)(?![а-яё])/i;
// «Олег пришлёт», «Олег до среды пришлёт», «Олег, ты тогда позвонишь» is not caught (no third person).
var THIRD_RE = /(?<![А-Яа-яЁё])([А-ЯЁ][а-яё]+),?\s+((?:[а-яё]+\s+){0,3}?)(сделает|подготовит|отправит|пришлет|пришлёт|скинет|напишет|позвонит|проверит|займется|займётся|берет на себя|берёт на себя|возьмет|возьмёт|закажет|купит|посчитает|уточнит|узнает|найдет|найдёт|договорится|должен|должна)(?![а-яё])/g;
// Capitalized words that start a sentence and are not a person.
var NOT_WHO = ('потом завтра тогда сегодня послезавтра он она они оно мы я вы ты кто это этот эта там тут если когда ну да нет так вот ' +
  'и а но после до ещё еще сам сама наверное может давайте давай значит короче также тоже все всё каждый никто кто-то кто-нибудь ' +
  'сначала затем дальше заодно обязательно срочно').split(' ');

// «Смету подготовит Олег»: a capital after the verb, in the middle of a sentence, is a name.
var AFTER_RE = /(?:^|[^а-яё])(?:сделает|подготовит|отправит|пришлет|пришлёт|скинет|напишет|позвонит|проверит|займется|займётся|возьмет|возьмёт|закажет|купит|посчитает|уточнит|узнает|найдет|найдёт)\s+([А-ЯЁ][а-яё]+)(?![а-яё])/;

/** Who a task in the third person is on: «Олег до среды пришлёт смету» → «Олег»; null when no name. */
function ownerOf(sentence) {
  // A name that ends in -у/-ю is an object or «to whom» («Смету подготовит», «Олегу позвонит»), not who.
  var person = function (w) { return NOT_WHO.indexOf(w.toLowerCase()) < 0 && !/[ую]$/.test(w); };
  var after = AFTER_RE.exec(sentence);
  if (after && person(after[1])) return after[1];
  THIRD_RE.lastIndex = 0;
  var m = THIRD_RE.exec(sentence);
  while (m) {
    if (person(m[1])) return m[1];
    THIRD_RE.lastIndex = m.index + 1;
    m = THIRD_RE.exec(sentence);
  }
  return null;
}
var QUESTION_RE = /(?:^|[^а-яё])(непонятно|неясно|не решили|открытый вопрос|под вопросом|надо уточнить|нужно уточнить|не знаем|вопрос в том|остается вопрос|остаётся вопрос)(?![а-яё])/i;

function sentences(paragraph) {
  return String(paragraph.text).split(/(?<=[.!?…])\s+/).map(function (s) { return s.trim(); }).filter(function (s) { return text.wordCount(s) >= 3; });
}

/**
 * A summary by rules: { title, summary, decisions: [{ text, atMs }], tasks: [{ text, who, due, atMs }],
 * questions, people, topics }. paragraphs: [{ atMs, text }] of the whole recording.
 * opts: { now (when it was said), mode, dictionary, lines, maxTasks, date (a text for the title) }.
 */
function summarize(paragraphs, opts) {
  opts = opts || {};
  var all = paragraphs.map(function (p) { return p.text; }).join('\n');
  var decisions = [];
  var tasks = [];
  var questions = [];
  paragraphs.forEach(function (p) {
    sentences(p).forEach(function (s) {
      if (DECISION_RE.test(s)) {
        decisions.push({ text: s, atMs: p.atMs });
        return;
      }
      if (TASK_RE.test(s) && tasks.length < (opts.maxTasks || 20)) {
        var who = ownerOf(s);
        if (!who && MINE_RE.test(s)) who = 'владелец';
        var w = when(s, opts.now || Date.now());
        tasks.push({ text: s, who: who, due: w ? w.date : null, atMs: p.atMs });
        return;
      }
      if (/\?$/.test(s) || QUESTION_RE.test(s)) questions.push(s);
    });
  });
  var people = dictionaryIn(all, opts.dictionary);
  var tops = topics(all, 3, people);
  // «Кратко»: the first sentence of evenly spaced paragraphs.
  var lines = [];
  var want = Math.max(1, Math.min(opts.lines || 6, paragraphs.length));
  for (var i = 0; i < want; i++) {
    var p = paragraphs[Math.floor(i * paragraphs.length / want)];
    var first = p && sentences(p)[0];
    if (first && lines.indexOf(first) < 0) lines.push(first.length > 200 ? first.slice(0, 200).replace(/\s+\S*$/, '') + ' …' : first);
  }
  var kind = opts.mode === 'lecture' ? 'Лекция' : 'Встреча';
  return {
    title: tops.length ? kind + ': ' + tops.slice(0, 2).join(', ') : kind + (opts.date ? ' ' + opts.date : ''),
    summary: lines,
    decisions: decisions.slice(0, 20),
    tasks: tasks,
    questions: questions.slice(0, 10),
    people: people,
    topics: tops
  };
}

/** A thought by rules: { title, tags, command }. */
function note(textValue, opts) {
  opts = opts || {};
  var people = dictionaryIn(textValue, opts.dictionary);
  var tags = people.map(function (p) { return p.toLowerCase(); }).concat(topics(textValue, 3, people)).slice(0, 5);
  var cmd = opts.commands === false ? null : command(textValue, opts.now || Date.now());
  return { title: commandTitle(cmd) || title(textValue, 6), tags: tags, command: cmd };
}

/** The title of a thought that is a command: «Написать Пете: опоздаю минут на десять». */
function commandTitle(cmd) {
  if (!cmd) return null;
  var cut = function (s, n) {
    var ws = String(s || '').split(/\s+/).filter(Boolean);
    return ws.slice(0, n).join(' ') + (ws.length > n ? ' …' : '');
  };
  if (cmd.kind === 'message') return 'Написать ' + cmd.to + ': ' + cut(cmd.text, 5).replace(/^./, function (c) { return c.toLowerCase(); });
  if (cmd.kind === 'expense') return 'Трата: ' + (cmd.what ? cut(cmd.what, 4) + ', ' : '') + cmd.amount + ' ₽';
  if (cmd.kind === 'reminder') return 'Напомнить: ' + cut(cmd.text, 6).replace(/^./, function (c) { return c.toLowerCase(); });
  return null;
}

exports.digits = digits;
exports.when = when;
exports.nameForms = nameForms;
exports.command = command;
exports.title = title;
exports.topics = topics;
exports.dictionaryIn = dictionaryIn;
exports.summarize = summarize;
exports.ownerOf = ownerOf;
exports.note = note;
exports.iso = iso;
