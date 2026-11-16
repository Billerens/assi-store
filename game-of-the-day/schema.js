// Settings of «Игра дня» (data/games/daily/settings.json): every tunable number is here, with a
// title and limits; what the owner changed is kept apart and merged over the defaults. Pure logic
// (engine, node).
//
//   schema.values({keepDays: 99}) -> {..., keepDays: 30}
//
// The schedule: frequency (daily | every | weekdays | off), everyDays and anchor for «every N days»,
// weekdays for chosen days, slots — the games of a day, each with its own make and ready times.
// The old settings makeAt / readyBy / giveUpAt / days are migrated (migrate) and still understood
// in a patch (merge), so an older caller keeps working.
var MAX_SLOTS = 6;

var SCHEMA = {
  frequency: { value: 'daily', title: 'Как часто', group: 'Расписание', custom: true,
    options: [['daily', 'Каждый день'], ['every', 'Через N дней'], ['weekdays', 'По дням недели'], ['off', 'Не делать']] },
  everyDays: { value: 2, title: 'Через сколько дней', min: 2, max: 30, integer: true, group: 'Расписание', custom: true },
  anchor: { value: '', type: 'date', title: 'Считать дни от', group: 'Расписание', custom: true },
  weekdays: { value: [1, 2, 3, 4, 5], type: 'weekdays', title: 'Дни недели', group: 'Расписание', custom: true },
  slots: { value: [{ make: '06:00', ready: '08:00' }], type: 'slots', title: 'Игры за день', min: 1, max: MAX_SLOTS, group: 'Расписание', custom: true },
  giveUpMin: { value: 90, title: 'Без сети пробовать после времени готовности ещё, минут', min: 0, max: 720, integer: true, group: 'Расписание' },
  retryEveryMin: { value: 30, title: 'Без сети пробовать снова через, минут', min: 5, max: 180, integer: true, group: 'Расписание' },
  workMinutes: { value: 40, title: 'Срок работы агента, минут', min: 5, max: 180, integer: true, group: 'Агент' },
  graceMinutes: { value: 5, title: 'После срока — на сдачу, минут', min: 1, max: 30, integer: true, group: 'Агент' },
  pollSec: { value: 20, title: 'Проверять, как идёт работа, раз в, секунд', min: 5, max: 300, integer: true, group: 'Агент' },
  maxCostPerGame: { value: 1, title: 'Предел трат на одну игру (в валюте учёта)', min: 0.05, max: 100, step: 0.05, group: 'Агент' },
  maxAttempts: { value: 2, title: 'Попыток сделать одну игру', min: 1, max: 5, integer: true, group: 'Агент' },
  keepDays: { value: 3, title: 'Неоценённая игра живёт, дней', min: 1, max: 30, integer: true, group: 'Оценки' },
  rateAfterSec: { value: 60, title: 'Лист оценки после игры дольше, секунд', min: 5, max: 1800, integer: true, group: 'Оценки' },
  voiceSec: { value: 10, title: 'Отзыв голосом, секунд', min: 3, max: 60, integer: true, group: 'Оценки' },
  settleSec: { value: 3, title: 'Перенос игры после выхода через, секунд', min: 1, max: 60, integer: true, group: 'Оценки' },
  promoteSessions: { value: 3, title: 'Из «На пробу» во «Все игры» после игры в разные дни', min: 1, max: 30, integer: true, group: 'Оценки' },
  explore: { value: 0.3, title: 'Доля игр с новым направлением', min: 0, max: 1, step: 0.05, group: 'Вкус' },
  decay: { value: 0.95, title: 'Затухание оценки за день давности', min: 0.5, max: 1, step: 0.01, group: 'Вкус' },
  noRepeatDays: { value: 14, title: 'Не повторять механику, дней', min: 1, max: 90, integer: true, group: 'Вкус' },
  newGenreDays: { value: 30, title: 'Новое направление — жанр, которого не было, дней', min: 7, max: 365, integer: true, group: 'Вкус' },
  likedFrom: { value: 4, title: 'Нравится — средняя оценка от', min: 1, max: 5, step: 0.1, group: 'Вкус' },
  dislikedTo: { value: 2.5, title: 'Не нравится — средняя оценка до', min: 1, max: 5, step: 0.1, group: 'Вкус' },
  notesInTask: { value: 8, title: 'Отзывов владельца в задании', min: 0, max: 30, integer: true, group: 'Вкус' },
  summaryDay: { value: 0, title: 'День недельной сводки (0 — воскресенье)', min: 0, max: 6, integer: true, group: 'Вкус' },
  summaryAt: { value: '19:00', type: 'time', title: 'Недельная сводка в', group: 'Вкус' },
  drawing: { value: 'days', title: 'Рисунок дня из «Рисуй — угадаю»', group: 'Рисунок дня',
    options: [['days', 'В дни игры дня'], ['all', 'Каждый день'], ['off', 'Не заказывать']] },
  criticRatings: { value: 30, title: 'Ачивка «Критик»: оценок', min: 1, max: 1000, integer: true, group: 'Ачивки' },
  collectorKept: { value: 10, title: 'Ачивка «Коллекционер»: оставленных игр', min: 1, max: 500, integer: true, group: 'Ачивки' }
};

/** The settings of the first version, understood in saved files and in patches. */
var LEGACY = ['makeAt', 'readyBy', 'giveUpAt', 'days'];

function validTime(value) {
  var m = /^(\d{1,2}):(\d{2})$/.exec(String(value || '').trim());
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return null;
  return (Number(m[1]) < 10 ? '0' : '') + Number(m[1]) + ':' + m[2];
}

function minutes(hhmm) {
  var t = validTime(hhmm);
  return t === null ? null : Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
}

function validDay(value) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || '').trim());
  if (!m) return null;
  var d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (d.getFullYear() !== Number(m[1]) || d.getMonth() !== Number(m[2]) - 1 || d.getDate() !== Number(m[3])) return null;
  return m[0];
}

/** [{make, ready}] sorted by make, a make only once, ready not before make; null when nothing fits. */
function cleanSlots(value, max) {
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch (error) {
      return null;
    }
  }
  if (!Array.isArray(value)) return null;
  var seen = {};
  var out = [];
  value.forEach(function (slot) {
    if (!slot || typeof slot !== 'object') return;
    var make = validTime(slot.make);
    var ready = validTime(slot.ready);
    if (!make) return;
    if (!ready || minutes(ready) < minutes(make)) ready = make;
    if (seen[make]) return;
    seen[make] = true;
    out.push({ make: make, ready: ready });
  });
  out.sort(function (a, b) { return minutes(a.make) - minutes(b.make); });
  out = out.slice(0, max || MAX_SLOTS);
  return out.length ? out : null;
}

/** [0..6] without repeats, Monday first; null when nothing fits. */
function cleanWeekdays(value) {
  if (typeof value === 'string') value = value.split(/[\s,]+/);
  if (!Array.isArray(value)) return null;
  var out = [];
  value.forEach(function (one) {
    var n = Number(one);
    if (one === '' || one === null || !isFinite(n) || n < 0 || n > 6 || Math.round(n) !== n) return;
    if (out.indexOf(n) < 0) out.push(n);
  });
  out.sort(function (a, b) { return ((a + 6) % 7) - ((b + 6) % 7); });
  return out.length ? out : null;
}

/** One value brought to the type and the limits of its spec; the default when it does not fit. */
function coerce(spec, value) {
  if (value === undefined || value === null || value === '') return copy(spec.value);
  if (spec.type === 'time') return validTime(value) || spec.value;
  if (spec.type === 'date') return validDay(value) || spec.value;
  if (spec.type === 'slots') return cleanSlots(value, spec.max) || copy(spec.value);
  if (spec.type === 'weekdays') return cleanWeekdays(value) || copy(spec.value);
  if (spec.options) {
    var ids = spec.options.map(function (option) { return option[0]; });
    return ids.indexOf(String(value)) >= 0 ? String(value) : spec.value;
  }
  var n = Number(String(value).replace(',', '.'));
  if (!isFinite(n)) return spec.value;
  if (n < spec.min) n = spec.min;
  if (n > spec.max) n = spec.max;
  if (spec.integer) n = Math.round(n);
  else n = Math.round(n * 1000) / 1000;
  return n;
}

function copy(value) {
  return value && typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : value;
}

function same(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * The old schedule settings in `from` turned into the new ones over `base` (the values now):
 * days → frequency (+ weekdays), makeAt / readyBy → the first slot, giveUpAt → giveUpMin.
 * Returns {patch: {new keys}, legacy: true when there was anything old}.
 */
function translate(from, base) {
  var patch = {};
  var legacy = false;
  from = from || {};
  if (from.days !== undefined) {
    legacy = true;
    if (from.days === 'never') patch.frequency = 'off';
    else if (from.days === 'weekdays') {
      patch.frequency = 'weekdays';
      patch.weekdays = [1, 2, 3, 4, 5];
    } else patch.frequency = 'daily';
  }
  if (from.makeAt !== undefined || from.readyBy !== undefined || from.giveUpAt !== undefined) {
    legacy = true;
    var slots = cleanSlots(base.slots) || copy(SCHEMA.slots.value);
    var first = slots[0];
    if (from.makeAt !== undefined) first.make = validTime(from.makeAt) || SCHEMA.slots.value[0].make;
    if (from.readyBy !== undefined) first.ready = validTime(from.readyBy) || SCHEMA.slots.value[0].ready;
    if (minutes(first.ready) < minutes(first.make)) first.ready = first.make;
    if (from.makeAt !== undefined || from.readyBy !== undefined) patch.slots = cleanSlots(slots);
    if (from.giveUpAt !== undefined && validTime(from.giveUpAt)) {
      var gap = minutes(from.giveUpAt) - minutes(first.ready);
      if (gap >= 0) patch.giveUpMin = gap;
    }
  }
  return { patch: patch, legacy: legacy };
}

/**
 * Saved settings of the first version brought to the new schedule: {settings, changed}. The old keys
 * go; what they meant stays (only what differs from the defaults is kept, as always).
 */
function migrate(saved) {
  saved = saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
  var has = LEGACY.some(function (key) { return saved[key] !== undefined; });
  if (!has) return { settings: saved, changed: false };
  var rest = {};
  Object.keys(saved).forEach(function (key) { if (LEGACY.indexOf(key) < 0) rest[key] = saved[key]; });
  var t = translate(saved, values(rest));
  return { settings: merge(rest, t.patch), changed: true };
}

/** The values to work with: the defaults with the owner's changes over them. */
function values(saved) {
  var out = {};
  saved = saved || {};
  Object.keys(SCHEMA).forEach(function (key) { out[key] = coerce(SCHEMA[key], saved[key]); });
  return out;
}

/**
 * The saved changes with a patch over them; an unknown key is an error, an old schedule key is
 * translated. Only what differs from the defaults stays. today ('YYYY-MM-DD'): the start of «every N
 * days» when it is chosen without one, so that «через день» stays the same days.
 */
function merge(saved, patch, today) {
  var out = {};
  patch = patch || {};
  Object.keys(patch).forEach(function (key) {
    if (!SCHEMA[key] && LEGACY.indexOf(key) < 0) throw new Error('Нет такой настройки: ' + key);
  });
  var all = {};
  Object.keys(saved || {}).forEach(function (key) { if (SCHEMA[key]) all[key] = saved[key]; });
  var t = translate(patch, values(all));
  Object.keys(t.patch).forEach(function (key) { all[key] = t.patch[key]; });
  Object.keys(patch).forEach(function (key) { if (SCHEMA[key]) all[key] = patch[key]; });
  if (all.frequency === 'every' && !validDay(all.anchor) && validDay(today)) all.anchor = today;
  Object.keys(all).forEach(function (key) {
    var value = coerce(SCHEMA[key], all[key]);
    if (!same(value, SCHEMA[key].value)) out[key] = value;
  });
  return out;
}

/** For the settings screen: [{key, title, value, fallback, type, min, max, step, group, options, custom}]. */
function describe(saved) {
  var now = values(saved);
  return Object.keys(SCHEMA).map(function (key) {
    var spec = SCHEMA[key];
    var row = { key: key, value: now[key], fallback: copy(spec.value), type: spec.type || (spec.options ? 'choice' : 'number') };
    ['title', 'min', 'max', 'step', 'group', 'options', 'integer', 'custom'].forEach(function (field) {
      if (spec[field] !== undefined) row[field] = spec[field];
    });
    return row;
  });
}

exports.SCHEMA = SCHEMA;
exports.LEGACY = LEGACY;
exports.MAX_SLOTS = MAX_SLOTS;
exports.validTime = validTime;
exports.validDay = validDay;
exports.cleanSlots = cleanSlots;
exports.cleanWeekdays = cleanWeekdays;
exports.coerce = coerce;
exports.values = values;
exports.merge = merge;
exports.migrate = migrate;
exports.translate = translate;
exports.describe = describe;
