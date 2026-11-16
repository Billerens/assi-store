// Details of the owner's day for tonight's episode. Only from the sources the owner allowed; people
// only from his list; other names, addresses, phone numbers and e-mails are cut out before anything
// goes to a model. Pure logic (engine and node).
//
//   details.collect({calendar: rows, records, events, links, sources: ['calendar', 'trip'], people: ['Петя'],
//     known: ['Иван Петров'], max: 6, perSource: 3, chars: 120, names: 3})
//   -> {details: [{source, at, text}], removed: ['Иван', 'Петров']}
//
// Besides the calendar and the base's own kinds, the neighbours' facts (each optional, each a source):
//   events — base records of kind 'event' by their `source`: hat (an evening of «Шляпа»), rpg (a new
//            level), recorder (a meeting: its title only), draw-guess (a game of «Рисуй — угадаю»);
//   links  — what main.js asked the installed neighbours for: {holiday: {id, title}, sign: {title},
//            pet: {name, stage, items}, inbox: [names], drawn: [words]}.
var words = require('modules/voice-adventure/story-engine/words.js');

var SOURCES = [
  ['calendar', 'События календаря'],
  ['trip', 'Поездки'],
  ['workout', 'Тренировки'],
  ['note', 'Заметки'],
  ['place', 'Места'],
  ['holidays', 'Праздник дня (Праздники)'],
  ['hat', 'Вечер «Шляпы»'],
  ['rpg', 'Новый уровень в Жизни-RPG'],
  ['meetings', 'Встречи из Диктофона (только заголовки)'],
  ['inbox', 'Кто писал за день (Входящие; только имена из списка людей)'],
  ['horoscope', 'Знак недели (Гороскоп)'],
  ['pet', 'Существо Питомца'],
  ['draw', 'Игра «Рисуй — угадаю»']
];

// What the base records under each source.
var KINDS = { trip: ['trip'], workout: ['workout'], note: ['note'], place: ['place', 'visit'] };

// Records of kind 'event' by the module that wrote them (record.source) → the source that lets them in.
var EVENTS = { hat: 'hat', rpg: 'rpg', recorder: 'meetings', 'draw-guess': 'draw' };

// Which details give way first when there are more than fit: the holiday stays, the pet, the sign
// of the week and the drawing game go first.
var RANK = { holidays: 0, horoscope: 2, pet: 2, draw: 2 };

// Never taken, whatever the settings say: money, health, messages, notifications. (From Входящие
// only who wrote — and only people of the owner's list — never the texts; the pet without its mood,
// which comes from sleep and steps.)
var NEVER = ['expense', 'income', 'transfer', 'sleep', 'water', 'mood', 'medicine', 'weight', 'heart', 'steps', 'symptom',
  'message', 'notification', 'sms', 'call', 'mail'];

var PERSON = '[человек]';
var HIDDEN_PLACE = '[адрес]';
var ADDRESS = /(^|[\s,(])(улиц[аеуы]|ул\.|проспект[аеу]?|пр-т|пр\.|переул[а-я]*|пер\.|бульвар[аеу]?|б-р|шоссе|наб\.|набережн[а-я]+|д\.|дом|кв\.|квартир[аеуы]|корпус|корп\.|стр\.)\s*[А-ЯЁA-Z0-9][^,.;()]*/gi;
var EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
var PHONE = /\+?\d[\d\s()-]{6,}\d/g;
var URL = /https?:\/\/\S+/gi;

function pad(n) {
  return (n < 10 ? '0' : '') + n;
}

function hhmm(time) {
  var d = new Date(time);
  return pad(d.getHours()) + ':' + pad(d.getMinutes());
}

function rootOf(name) {
  var norm = words.normalize(name);
  var stem = words.stem(norm);
  return stem.length >= 3 ? stem : norm;
}

/** Does the word name one of these people (any case: «Петя», «Пете», «Петей»)? */
function namesOne(word, people) {
  var tok = words.normalize(word);
  if (tok.length < 2) return false;
  return (people || []).some(function (person) {
    return words.tokens(person).some(function (part) {
      if (part === tok) return true;
      var root = rootOf(part);
      // «Петя» → «Пете», «Петей», but not «Петров».
      return root.length >= 3 && tok.indexOf(root) === 0 && tok.length - root.length <= (root.length <= 3 ? 2 : 3);
    });
  });
}

function capital(word) {
  return /^[А-ЯЁA-Z]/.test(word);
}

/**
 * Cuts out what must not reach a model: names of people not in `people` (a capital word inside a
 * sentence, or any word that is a name from `known` — the contacts), addresses, phones, e-mails,
 * links. Returns {text, removed: [names cut out]}.
 */
function scrub(text, people, known) {
  var removed = [];
  var s = String(text || '')
    .replace(URL, ' ')
    .replace(EMAIL, HIDDEN_PLACE)
    .replace(PHONE, ' ')
    .replace(ADDRESS, function (all, lead) { return lead + HIDDEN_PLACE; });
  var knownWords = [];
  (known || []).forEach(function (name) {
    words.tokens(name).forEach(function (part) { if (part.length >= 3) knownWords.push(part); });
  });
  var pieces = s.split(/([\s,;:!?.()«»"„“—–]+)/);
  var out = [];
  var sentenceStart = true;
  for (var i = 0; i < pieces.length; i++) {
    var piece = pieces[i];
    if (!piece) continue;
    if (i % 2 === 1) {
      out.push(piece);
      // «в 15:00 — Обед с Петей», «заметка: Купить хлеб»: a title starts after a dash or a colon.
      if (/[.!?:—–]/.test(piece)) sentenceStart = true;
      continue;
    }
    var isName = namesOne(piece, knownWords) || (capital(piece) && !sentenceStart && /[А-ЯЁа-яёA-Za-z]/.test(piece) && piece !== HIDDEN_PLACE && piece !== PERSON);
    sentenceStart = false;
    if (isName && !namesOne(piece, people)) {
      removed.push(piece);
      var last = out.length > 1 && /^\s+$/.test(out[out.length - 1]) ? out[out.length - 2] : null;
      if (last === PERSON) {
        out.pop();
        continue;
      }
      out.push(PERSON);
      continue;
    }
    out.push(piece);
  }
  var result = out.join('').replace(/\s+/g, ' ').replace(/\s+([,.;:!?])/g, '$1').trim();
  return { text: result, removed: removed.filter(function (name, k) { return removed.indexOf(name) === k; }) };
}

/** Events of the calendar for the day: rows {title, begin, end, allDay} (instances, so repeats are in). */
function fromCalendar(rows) {
  return (rows || []).filter(function (row) { return row && row.title; }).map(function (row) {
    var allDay = row.allDay === true || row.allDay === 1 || row.allDay === '1';
    return {
      source: 'calendar', at: Number(row.begin) || 0,
      text: (allDay ? 'весь день: ' : 'в ' + hhmm(Number(row.begin)) + ' — ') + String(row.title).trim()
    };
  });
}

function minutes(record) {
  if (record.amount === null || record.amount === undefined) return null;
  var unit = String(record.unit || '').toLowerCase();
  if (unit === 'min' || unit === 'мин') return Math.round(record.amount);
  if (unit === 'h' || unit === 'ч') return Math.round(record.amount * 60);
  return null;
}

/** Records of the shared base: trip, workout, note, place/visit. */
function fromBase(records) {
  return (records || []).map(function (record) {
    var title = String(record.title || '').trim();
    var mins = minutes(record);
    var text = '';
    if (record.kind === 'trip') text = 'поездка' + (mins ? ' ' + mins + ' мин' : '') + (title && !/^поездка$/i.test(title) ? ': ' + title : '');
    else if (record.kind === 'workout') text = 'тренировка' + (title ? ': ' + title : '') + (mins ? ', ' + mins + ' мин' : '');
    else if (record.kind === 'note') text = title ? 'заметка: ' + words.clip(title, 90) : '';
    else if (record.kind === 'place' || record.kind === 'visit') text = title ? 'место: ' + title : '';
    return text ? { source: record.kind, at: Number(record.at) || 0, text: text } : null;
  }).filter(Boolean);
}

/**
 * The owner's own spelling of those of `names` who are on his list `people`: only the first word of
 * a name is looked at («Петя Иванов» → «Петя»), nobody else gets through. At most `limit` (all when
 * not given).
 */
function allowedNames(names, people, limit) {
  var out = [];
  (Array.isArray(names) ? names : []).forEach(function (name) {
    var first = String(name || '').replace(/^[^А-ЯЁа-яёA-Za-z]+/, '').split(/[^А-ЯЁа-яёA-Za-z-]+/)[0];
    if (!first) return;
    var match = null;
    (people || []).forEach(function (person) {
      if (!match && namesOne(first, [person])) match = person;
    });
    if (match && out.indexOf(match) < 0) out.push(match);
  });
  return limit === undefined || limit === null ? out : out.slice(0, Math.max(0, Number(limit) || 0));
}

function lower(text) {
  return String(text || '').trim().toLowerCase();
}

/**
 * Base records of kind 'event' written by the neighbours (record.source): hat, rpg, recorder,
 * draw-guess. Several games of one evening make one detail; several new levels — the highest one.
 */
function fromEvents(records, people, limit) {
  var out = [];
  var level = null;
  var draw = null;
  (records || []).forEach(function (record) {
    if (!record || record.kind !== 'event') return;
    var data = record.data && typeof record.data === 'object' ? record.data : {};
    var at = Number(record.at) || 0;
    var source = EVENTS[record.source];
    if (source === 'hat') {
      var bits = [];
      if (Number(data.players) > 0) bits.push('игроков ' + Math.round(data.players));
      if (Number(data.games) > 1) bits.push('партий ' + Math.round(data.games));
      var who = allowedNames(data.names, people, limit);
      out.push({
        source: 'hat', at: at, keep: ['Шляпа'],
        text: 'вечер игры в «Шляпу» с компанией' + (bits.length ? ', ' + bits.join(', ') : '') + (who.length ? '; играли ' + who.join(', ') : '')
      });
    } else if (source === 'rpg') {
      var n = Number(data.level) || Number((/\d+/.exec(String(record.title || '')) || [])[0]) || 0;
      if (n > 0 && (!level || n > level.n)) level = { n: n, at: at };
    } else if (source === 'meetings') {
      var tags = Array.isArray(record.tags) ? record.tags : [];
      var title = words.clip(String(record.title || '').trim(), 80);
      var met = allowedNames(data.people, people, limit);
      out.push({
        source: 'meetings', at: at,
        text: (tags.indexOf('лекция') >= 0 ? 'лекция' : 'встреча') + (title ? ': ' + title : '') + (met.length ? '; были ' + met.join(', ') : '')
      });
    } else if (source === 'draw') {
      if (!draw) draw = { source: 'draw', at: at, rounds: 0, keep: ['Рисуй'] };
      draw.rounds += Number(data.rounds) || 0;
    }
  });
  if (level) out.push({ source: 'rpg', at: level.at, text: 'новый уровень в жизни-игре: ' + level.n });
  if (draw) out.push(draw);
  return out;
}

/** The game of «Рисуй — угадаю» with the words of the day's rounds (made here, when there are words without a record too). */
function drawDetail(found, drawn, at, limit) {
  var list = (Array.isArray(drawn) ? drawn : []).map(lower).filter(function (word, i, all) {
    return word && word.length <= 30 && all.indexOf(word) === i;
  });
  if (limit !== undefined && limit !== null) list = list.slice(0, Math.max(0, Number(limit) || 0));
  if (!found && !list.length) return null;
  var detail = found || { source: 'draw', at: at, rounds: 0, keep: ['Рисуй'] };
  detail.text = 'играли в «Рисуй — угадаю»' + (detail.rounds ? ', раундов ' + detail.rounds : '') + (list.length ? '; рисовали: ' + list.join(', ') : '');
  return detail;
}

/**
 * What main.js asked the neighbours for, only from the allowed sources (day-wide facts stand at
 * the start of the day): {holiday: {id, title}, sign: {title}, pet: {name, stage, items}, inbox: [names]}.
 */
function fromLinks(links, sources, people, limit, since) {
  links = links || {};
  var at = Number(since) || 0;
  var on = function (id) { return (sources || []).indexOf(id) >= 0; };
  var out = [];
  var holiday = links.holiday;
  if (on('holidays') && holiday && (holiday.title || holiday.id)) {
    var title = String(holiday.title || '').trim();
    out.push({
      source: 'holidays', at: at, keep: [title],
      text: holiday.id === 'birthday-owner' ? 'день рождения слушателя' : 'праздник: ' + title
    });
  }
  if (on('horoscope') && links.sign && links.sign.title) {
    var sign = String(links.sign.title).trim();
    // The sign is made of the horoscope's own fixed list of stars («Сова в доме Скроллера»): nothing of
    // the owner's in it, and «в доме …» must not be taken for an address.
    out.push({ source: 'horoscope', at: at, trusted: true, text: 'знак недели в шуточном гороскопе: ' + words.clip(sign, 60) });
  }
  var pet = links.pet;
  if (on('pet') && pet && pet.name) {
    var name = String(pet.name).trim().slice(0, 30);
    var items = (Array.isArray(pet.items) ? pet.items : []).map(lower).filter(Boolean).slice(0, 3);
    out.push({
      source: 'pet', at: at, keep: [name],
      text: 'у слушателя есть питомец — маленькое нарисованное существо-росток по имени ' + name +
        (pet.stage ? ', сейчас «' + lower(pet.stage) + '»' : '') + (items.length ? ', при нём: ' + items.join(', ') : '')
    });
  }
  if (on('inbox')) {
    var wrote = allowedNames(links.inbox, people, limit);
    if (wrote.length) out.push({ source: 'inbox', at: at, text: 'писали за день: ' + wrote.join(', ') });
  }
  return out;
}

/** The line about tonight's holiday for the prompt ('' on an ordinary day). */
function occasionLine(details) {
  var found = (details || []).filter(function (detail) { return detail.source === 'holidays'; })[0];
  if (!found) return '';
  return 'Сегодня у слушателя особый день (' + found.text + '): пусть серия будет праздничной — тихо и тепло, праздник в мире сериала, без пересказа самого дня.';
}

/**
 * Which details go when there are more than `max`: by rank (the holiday first, the pet, the sign and
 * the drawing game last), then by the day's order; no more than `perSource` from one source. The
 * chosen ones keep the day's order.
 */
function pick(list, max, perSource) {
  var order = list.map(function (detail, i) { return i; }).sort(function (a, b) {
    var ra = RANK[list[a].source] === undefined ? 1 : RANK[list[a].source];
    var rb = RANK[list[b].source] === undefined ? 1 : RANK[list[b].source];
    return ra - rb || a - b;
  });
  var taken = {};
  var per = {};
  var count = 0;
  order.forEach(function (i) {
    if (count >= max) return;
    var source = list[i].source === 'visit' ? 'place' : list[i].source;
    if (perSource > 0 && (per[source] || 0) >= perSource) return;
    per[source] = (per[source] || 0) + 1;
    taken[i] = true;
    count++;
  });
  return list.filter(function (detail, i) { return taken[i]; });
}

/** Which base kinds the allowed sources let in. */
function kindsOf(sources) {
  var out = [];
  (sources || []).forEach(function (source) {
    (KINDS[source] || []).forEach(function (kind) { if (NEVER.indexOf(kind) < 0 && out.indexOf(kind) < 0) out.push(kind); });
  });
  return out;
}

/**
 * Tonight's details: input {calendar: rows, records, events, links, since, sources, people, known,
 * max, perSource, chars, names}. Returns {details: [{source, at, text}], removed: [names]} — at most
 * `max` (no more than `perSource` from one source, each clipped to `chars`), in the day's order.
 */
function collect(input) {
  input = input || {};
  var sources = input.sources || [];
  var people = input.people || [];
  var list = [];
  if (sources.indexOf('calendar') >= 0) list = list.concat(fromCalendar(input.calendar));
  var kinds = kindsOf(sources);
  list = list.concat(fromBase((input.records || []).filter(function (record) { return kinds.indexOf(record.kind) >= 0; })));
  var events = fromEvents((input.events || []).filter(function (record) {
    return record && record.kind === 'event' && EVENTS[record.source] && sources.indexOf(EVENTS[record.source]) >= 0;
  }), people, input.names);
  var draw = events.filter(function (detail) { return detail.source === 'draw'; })[0] || null;
  list = list.concat(events.filter(function (detail) { return detail.source !== 'draw'; }));
  if (sources.indexOf('draw') >= 0) {
    draw = drawDetail(draw, (input.links || {}).drawn, Number(input.since) || 0, input.names);
    if (draw) list.push(draw);
  }
  list = list.concat(fromLinks(input.links, sources, people, input.names, input.since));
  var removed = [];
  var seen = {};
  var out = [];
  list.sort(function (a, b) { return a.at - b.at; }).forEach(function (detail) {
    var clean = detail.trusted ? { text: detail.text, removed: [] } : scrub(detail.text, detail.keep ? people.concat(detail.keep) : people, input.known);
    clean.removed.forEach(function (name) { if (removed.indexOf(name) < 0) removed.push(name); });
    var text = input.chars > 0 ? words.clip(clean.text, input.chars) : clean.text;
    var key = words.normalize(text);
    if (!key || seen[key] || key === words.normalize(PERSON)) return;
    seen[key] = true;
    out.push({ source: detail.source, at: detail.at, text: text });
  });
  var max = input.max === undefined || input.max === null ? 6 : Math.max(0, Number(input.max) || 0);
  return { details: pick(out, max, Number(input.perSource) || 0), removed: removed };
}

/** Lines for the prompt: «- в 15:00 — обед с Петей». */
function format(details) {
  if (!details || !details.length) return '(сегодня деталей нет — обойдись без них)';
  return details.map(function (detail) { return '- ' + detail.text; }).join('\n');
}

exports.SOURCES = SOURCES;
exports.KINDS = KINDS;
exports.EVENTS = EVENTS;
exports.NEVER = NEVER;
exports.allowedNames = allowedNames;
exports.fromEvents = fromEvents;
exports.fromLinks = fromLinks;
exports.occasionLine = occasionLine;
exports.pick = pick;
exports.PERSON = PERSON;
exports.scrub = scrub;
exports.namesOne = namesOne;
exports.fromCalendar = fromCalendar;
exports.fromBase = fromBase;
exports.kindsOf = kindsOf;
exports.collect = collect;
exports.format = format;
exports.hhmm = hhmm;
