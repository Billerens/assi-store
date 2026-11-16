// Birthdays: reading the dates contacts keep, ages, when to remind. Pure, for node and the engine.
var calendar = require('./calendar');

/** Years outside this range are not real birth years: iOS writes 1604 for "no year". */
var FIRST_YEAR = 1900;
var LAST_YEAR = 2100;

function make(year, month, day) {
  if (!(month >= 1 && month <= 12)) return null;
  if (!(day >= 1 && day <= calendar.daysInMonth(2000, month))) return null;
  if (year !== null && (year < FIRST_YEAR || year > LAST_YEAR)) year = null;
  if (year !== null && month === 2 && day === 29 && !calendar.isLeap(year)) return null;
  return { year: year, month: month, day: day };
}

/**
 * A birthday as a contact keeps it → { year | null, month, day }, or null when it is not a date.
 * Seen formats: '1996-11-15', '--11-15', '--1115', '19961115', '15.11.1996', '15.11', '15/11/96',
 * '1996-11-15T00:00:00.000Z'. A year like 1604 means the year was not given.
 */
exports.parse = function (text) {
  var value = String(text === null || text === undefined ? '' : text).trim();
  if (!value) return null;
  var found;
  if ((found = /^--(\d{2})-?(\d{2})$/.exec(value))) return make(null, Number(found[1]), Number(found[2]));
  if ((found = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:$|[T\s])/.exec(value))) return make(Number(found[1]), Number(found[2]), Number(found[3]));
  if ((found = /^(\d{4})(\d{2})(\d{2})$/.exec(value))) return make(Number(found[1]), Number(found[2]), Number(found[3]));
  if ((found = /^(\d{1,2})[./](\d{1,2})(?:[./](\d{2}|\d{4}))?$/.exec(value))) {
    var year = null;
    if (found[3]) {
      year = Number(found[3]);
      if (found[3].length === 2) year += year >= 30 ? 1900 : 2000;
    }
    return make(year, Number(found[2]), Number(found[1]));
  }
  return null;
};

/** The next birthday on or after the day (ISO). */
exports.next = function (birthday, day) {
  var year = calendar.parse(day).year;
  var date = calendar.onYear(birthday.month, birthday.day, year);
  if (calendar.diff(day, date) < 0) date = calendar.onYear(birthday.month, birthday.day, year + 1);
  return date;
};

/** How old the person turns on that birthday; null when the year is not known. */
exports.age = function (birthday, onDay) {
  if (!birthday || !birthday.year) return null;
  var age = calendar.parse(onDay).year - birthday.year;
  return age > 0 && age < 130 ? age : null;
};

/** Russian plural: plural(5, 'год', 'года', 'лет') → 'лет'. */
exports.plural = function (number, one, few, many) {
  var n = Math.abs(Math.round(number)) % 100;
  var last = n % 10;
  if (n > 10 && n < 20) return many;
  if (last === 1) return one;
  if (last >= 2 && last <= 4) return few;
  return many;
};

/** '30 лет', '21 год', '22 года'. */
exports.years = function (age) {
  return age + ' ' + exports.plural(age, 'год', 'года', 'лет');
};

/** 'Сегодня', 'Завтра', 'Послезавтра', 'Через 5 дней'. */
exports.when = function (days) {
  if (days === 0) return 'Сегодня';
  if (days === 1) return 'Завтра';
  if (days === 2) return 'Послезавтра';
  if (days < 0) return (-days) + ' ' + exports.plural(-days, 'день', 'дня', 'дней') + ' назад';
  return 'Через ' + days + ' ' + exports.plural(days, 'день', 'дня', 'дней');
};

/**
 * People from rows of the contacts provider (Data table, mimetype contact_event, type 3 =
 * birthday): [{ contact_id, display_name, data1, data2, starred }] → [{ id, name, birthday, raw, starred }].
 * One birthday per contact; rows whose date cannot be read are kept out and counted in `unreadable`.
 */
exports.fromRows = function (rows) {
  var byId = {};
  var order = [];
  var unreadable = [];
  (rows || []).forEach(function (row) {
    if (row.data2 !== undefined && row.data2 !== null && String(row.data2) !== '3') return;
    var id = String(row.contact_id);
    if (byId[id]) return;
    var birthday = exports.parse(row.data1);
    if (!birthday) {
      unreadable.push({ id: id, name: row.display_name || '', raw: row.data1 });
      return;
    }
    byId[id] = {
      id: id,
      name: String(row.display_name || 'Без имени'),
      birthday: birthday,
      raw: String(row.data1),
      starred: Number(row.starred) === 1,
      source: 'contacts'
    };
    order.push(id);
  });
  var people = order.map(function (id) { return byId[id]; });
  people.unreadable = unreadable;
  return people;
};

var CALENDAR_WORDS = [
  /^\s*день\s+рождения\s*[:\-—–]?\s*(?:у\s+)?/i,
  /\s*[:\-—–]?\s*день\s+рождения\s*$/i,
  /^\s*др\s*[:\-—–]\s*/i,
  /^\s*birthday\s*[:\-—–]?\s*/i,
  /['’]s\s+birthday\s*$/i,
  /\s*[:\-—–]?\s*birthday\s*$/i
];

/** Is a calendar event a birthday (by its calendar's name or its title)? */
exports.isBirthdayEvent = function (event) {
  var where = String(event.calendar || '') + ' ' + String(event.title || '');
  return /рожд|birthday|\bдр\b/i.test(where);
};

/**
 * People from the "Birthdays" calendar when contacts give none: events [{ title, day, calendar }]
 * → [{ id: 'cal:<name>', name, birthday: { year: null, month, day }, source: 'calendar' }].
 */
exports.fromCalendar = function (events) {
  var seen = {};
  var out = [];
  (events || []).forEach(function (event) {
    if (!exports.isBirthdayEvent(event)) return;
    var date = calendar.parse(event.day);
    if (!date) return;
    var name = String(event.title || '');
    CALENDAR_WORDS.forEach(function (pattern) { name = name.replace(pattern, ''); });
    name = name.trim() || String(event.title || '').trim();
    if (!name || seen[name]) return;
    seen[name] = true;
    out.push({ id: 'cal:' + name, name: name, birthday: { year: null, month: date.month, day: date.day }, raw: event.day, starred: false, source: 'calendar' });
  });
  return out;
};

/**
 * Who is close and how early to remind: the owner's marks first (people[id].remind true/false and
 * days), otherwise starred contacts when that setting is on.
 */
exports.markClose = function (people, settings) {
  var marks = (settings && settings.people) || {};
  return (people || []).map(function (person) {
    var mark = marks[person.id] || {};
    var close = typeof mark.remind === 'boolean' ? mark.remind : Boolean(settings && settings.closeStarred && person.starred);
    var days = typeof mark.days === 'number' && mark.days >= 0 ? mark.days : (settings ? settings.remindDays : 1);
    var copy = {};
    Object.keys(person).forEach(function (key) { copy[key] = person[key]; });
    copy.close = close;
    copy.days = days;
    copy.marked = typeof mark.remind === 'boolean';
    return copy;
  });
};

/** People with their next birthday from the day: inDays, next, age; soonest first. */
exports.schedule = function (people, day) {
  return (people || []).filter(function (person) { return person.birthday; }).map(function (person) {
    var next = exports.next(person.birthday, day);
    var copy = {};
    Object.keys(person).forEach(function (key) { copy[key] = person[key]; });
    copy.next = next;
    copy.inDays = calendar.diff(day, next);
    copy.age = exports.age(person.birthday, next);
    return copy;
  }).sort(function (a, b) { return a.inDays - b.inDays || String(a.name).localeCompare(String(b.name)); });
};

/** People to remind today: close, with the birthday exactly `days` ahead. */
exports.due = function (people, day) {
  return exports.schedule(people, day).filter(function (person) {
    return person.close && person.inDays === person.days;
  });
};

/** The text of a reminder: { title, text }. */
exports.reminder = function (person) {
  var title = exports.when(person.inDays) + ' день рождения';
  var text = person.name + (person.age ? ' — исполняется ' + exports.years(person.age) : '') + '. Подготовить поздравление?';
  return { title: title, text: text };
};

/** A greeting to send when no model writes one. */
exports.template = function (name, age) {
  var first = String(name || '').split(/\s+/)[0] || 'Привет';
  return first + ', с днём рождения!' + (age ? ' ' + exports.years(age) + ' — отличный повод.' : '') +
    ' Желаю здоровья, радости и побольше хороших дней.';
};
