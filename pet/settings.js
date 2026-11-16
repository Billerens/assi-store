// Settings of the pet (data/pet/settings.json): every number of the mood, the states, the growth
// and the phrases, with defaults, limits and the words the settings tab shows. Pure.
// Other modules read some keys straight from the file: life-rpg — name, palette, stages.

var BANNED = ['ленив', 'лентя', 'стыд', 'позор', 'опять не', 'снова не', 'должен', 'обязан', 'виноват', 'плохо', 'провал',
  'зря', 'слаб', 'ты опять', 'ты снова', 'ты не ', 'вы опять', 'вы снова', 'вы не ', 'надо было', 'тебе надо', 'тебе нужно',
  'вам надо', 'вам нужно', 'разочар', 'голод', 'умира', 'умру', 'бросил', 'забыл', 'заброш', 'одинок', 'скучал', 'обидел', 'грущу'];

var SCHEMA = [
  { key: 'name', section: 'Существо', label: 'Имя', type: 'text', def: 'Листик' },
  { key: 'palette', section: 'Существо', label: 'Палитра', type: 'select', def: 'moss',
    options: [['moss', 'Мох'], ['clay', 'Глина'], ['dusk', 'Сумерки'], ['accent', 'Цвет темы']] },
  { key: 'stages', section: 'Существо', label: 'Пороги стадий по уровню RPG', type: 'ints', def: [1, 5, 15, 30, 50],
    hint: 'Росток, два листа, четыре листа, бутон, цветок' },
  { key: 'seasonOn', section: 'Существо', label: 'Сезонные вещи', type: 'bool', def: true,
    hint: 'Шарф зимой, тыквенная шапка в Хэллоуин, колпак в день рождения' },
  { key: 'winterMonths', section: 'Существо', label: 'Месяцы шарфа', type: 'ints', def: [12, 1, 2] },
  { key: 'shelfFrom', section: 'Существо', label: 'Значки ачивок на полку', type: 'select', def: 'rare',
    options: [['uncommon', 'Необычные и выше'], ['rare', 'Редкие и выше'], ['epic', 'Эпические и выше'], ['legendary', 'Только легендарные'], ['off', 'Не ставить']],
    hint: 'Значок, который он держал, встаёт на полку, когда вы его увидели; цвет — по редкости' },

  { key: 'wSleep', section: 'Энергия', label: 'Вес сна', type: 'num', min: 0, max: 1, step: 0.05, def: 0.40 },
  { key: 'wLate', section: 'Энергия', label: 'Вес ночного экрана', type: 'num', min: 0, max: 1, step: 0.05, def: 0.20 },
  { key: 'wActivity', section: 'Энергия', label: 'Вес шагов', type: 'num', min: 0, max: 1, step: 0.05, def: 0.25 },
  { key: 'wCare', section: 'Энергия', label: 'Вес отметок', type: 'num', min: 0, max: 1, step: 0.05, def: 0.15 },
  { key: 'lateLimit', section: 'Энергия', label: 'Ночной экран: «совсем много» от', type: 'int', min: 10, max: 240, step: 5, unit: 'мин', def: 60 },
  { key: 'phoneNightOn', section: 'Энергия', label: 'Ночной экран — из «Тайной жизни телефона»', type: 'bool', def: true,
    hint: 'Минуты владельца в телефоне прошлой ночью, если модуль стоит и ночь уже посчитана; иначе — из «Здоровья»' },
  { key: 'playOn', section: 'Энергия', label: 'Игры из Игротеки немного бодрят', type: 'bool', def: true },
  { key: 'playBonus', section: 'Энергия', label: 'Игры: прибавка к энергии до', type: 'int', min: 0, max: 20, step: 1, def: 5 },
  { key: 'playFull', section: 'Энергия', label: 'Игры: вся прибавка за', type: 'int', min: 5, max: 240, step: 5, unit: 'мин', def: 30 },
  { key: 'activityFrom', section: 'Энергия', label: 'Шаги ждём с', type: 'time', def: '08:00' },
  { key: 'activityTo', section: 'Энергия', label: 'Вся цель шагов — к', type: 'time', def: '21:00' },
  { key: 'minKnown', section: 'Энергия', label: 'Мало данных, если известно меньше', type: 'num', min: 0, max: 1, step: 0.05, def: 0.35,
    hint: 'Доля весов, по которым есть данные; меньше — «Спокойный»' },

  { key: 'unrestedUntil', section: 'Состояния', label: '«Невыспавшийся» держится до', type: 'time', def: '14:00' },
  { key: 'unrestedLate', section: 'Состояния', label: '«Невыспавшийся», если ночью экрана от', type: 'int', min: 5, max: 240, step: 5, unit: 'мин', def: 45 },
  { key: 'unrestedSleep', section: 'Состояния', label: '«Невыспавшийся», если сна меньше', type: 'int', min: 60, max: 600, step: 10, unit: 'мин', def: 330 },
  { key: 'wakeSteps', section: 'Состояния', label: 'Прогулка снимает «невыспавшегося» от', type: 'int', min: 500, max: 20000, step: 500, unit: 'шагов', def: 3000 },
  { key: 'sleepyBelow', section: 'Состояния', label: '«Сонный», если сна меньше цели на', type: 'int', min: 10, max: 240, step: 5, unit: 'мин', def: 60 },
  { key: 'restlessAfter', section: 'Состояния', label: '«Засиделся» — после', type: 'time', def: '18:00' },
  { key: 'restlessBelow', section: 'Состояния', label: '«Засиделся», если шагов меньше доли', type: 'num', min: 0.1, max: 1, step: 0.05, def: 0.4 },
  { key: 'cheerfulFrom', section: 'Состояния', label: '«Бодрый» от энергии', type: 'int', min: 50, max: 100, step: 1, def: 75 },
  { key: 'calmFrom', section: 'Состояния', label: '«Спокойный» от энергии', type: 'int', min: 10, max: 90, step: 1, def: 45 },
  { key: 'nightWoken', section: 'Состояния', label: 'Показывать ночью «Разбуженного»', type: 'bool', def: true,
    hint: 'Выключено — ночью он просто спит' },
  { key: 'focusOn', section: 'Состояния', label: 'Спокоен и молчит, пока идёт сессия Фокуса', type: 'bool', def: true,
    hint: 'Без уведомления дня и без голоса до конца сессии' },
  { key: 'focusRecheck', section: 'Состояния', label: 'После конца сессии Фокуса пересчитать через', type: 'int', min: 0, max: 30, step: 1, unit: 'мин', def: 1 },
  { key: 'welcomeDays', section: 'Состояния', label: 'Радоваться возвращению после', type: 'int', min: 2, max: 30, step: 1, unit: 'дн', def: 3 },
  { key: 'partyHours', section: 'Состояния', label: 'Праздник уровня длится', type: 'int', min: 1, max: 72, step: 1, unit: 'ч', def: 24 },
  { key: 'holdDays', section: 'Состояния', label: 'Держит значок ачивки, пока не посмотрите, но не дольше', type: 'int', min: 1, max: 60, step: 1, unit: 'дн', def: 14 },
  { key: 'reactSeconds', section: 'Состояния', label: 'Реакция на отметку видна', type: 'int', min: 2, max: 60, step: 1, unit: 'с', def: 6 },

  { key: 'tickEvery', section: 'Работа', label: 'Пересчитывать раз в', type: 'int', min: 10, max: 240, step: 5, unit: 'мин', def: 30 },
  { key: 'morningUntil', section: 'Работа', label: 'История: «утро» до', type: 'time', def: '12:00' },
  { key: 'eveningFrom', section: 'Работа', label: 'История: «вечер» с', type: 'time', def: '18:00' },
  { key: 'historyDays', section: 'Работа', label: 'Хранить историю', type: 'int', min: 30, max: 3650, step: 30, unit: 'дн', def: 730 },
  { key: 'stripDays', section: 'Работа', label: 'Полоса настроений', type: 'int', min: 7, max: 60, step: 1, unit: 'дн', def: 14 },
  { key: 'darkFrom', section: 'Работа', label: 'Окно в комнате темнеет с', type: 'time', def: '21:00' },
  { key: 'darkTo', section: 'Работа', label: 'Окно в комнате светлеет в', type: 'time', def: '07:00' },

  { key: 'notifyOn', section: 'Голос и фразы', label: 'Одно уведомление в день', type: 'bool', def: false },
  { key: 'notifyFrom', section: 'Голос и фразы', label: 'Не раньше', type: 'time', def: '10:00' },
  { key: 'notifyTo', section: 'Голос и фразы', label: 'Не позже', type: 'time', def: '21:00' },
  { key: 'voiceOn', section: 'Голос и фразы', label: 'Говорить голосом телефона', type: 'bool', def: false },
  { key: 'modelOn', section: 'Голос и фразы', label: 'Фраза дня от модели', type: 'bool', def: false },
  { key: 'modelAt', section: 'Голос и фразы', label: 'Фраза дня — в', type: 'time', def: '08:00' },
  { key: 'banned', section: 'Голос и фразы', label: 'Запрещённые слова и обороты (через запятую)', type: 'list', def: BANNED }
];

exports.SCHEMA = SCHEMA;
exports.BANNED = BANNED;

var DEFAULTS = {};
var BY_KEY = {};
SCHEMA.forEach(function (item) {
  DEFAULTS[item.key] = item.def;
  BY_KEY[item.key] = item;
});
exports.DEFAULTS = DEFAULTS;

function time(value) {
  var m = /^(\d{1,2}):(\d{2})$/.exec(String(value || '').trim());
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return undefined;
  return (Number(m[1]) < 10 ? '0' : '') + Number(m[1]) + ':' + m[2];
}

function cleanValue(item, value) {
  if (item.type === 'int' || item.type === 'num') {
    var n = Number(value);
    if (value === '' || value === null || value === undefined || isNaN(n)) return undefined;
    if (item.type === 'int') n = Math.round(n);
    if (item.min !== undefined) n = Math.max(item.min, n);
    if (item.max !== undefined) n = Math.min(item.max, n);
    return n;
  }
  if (item.type === 'time') return time(value);
  if (item.type === 'bool') return value === true || value === 'true' || value === 1 || value === '1';
  if (item.type === 'select') {
    var text = String(value);
    return item.options.some(function (o) { return o[0] === text; }) ? text : undefined;
  }
  if (item.type === 'list' || item.type === 'ints') {
    var list = (Array.isArray(value) ? value : String(value === undefined || value === null ? '' : value).split(','))
      .map(function (x) { return String(x).trim(); }).filter(function (x) { return x; });
    if (item.type === 'list') return list;
    var ints = list.map(Number).filter(function (n) { return !isNaN(n); }).map(Math.round);
    return ints.length ? ints : undefined;
  }
  if (item.type === 'text') {
    var t = String(value === undefined || value === null ? '' : value).trim();
    return item.key === 'name' && !t ? undefined : t.slice(0, 40);
  }
  return undefined;
}

/** Only known keys, each made right. */
exports.clean = function (patch) {
  var out = {};
  Object.keys(patch || {}).forEach(function (key) {
    var item = BY_KEY[key];
    if (!item) return;
    var value = cleanValue(item, patch[key]);
    if (value !== undefined) out[key] = value;
  });
  if (out.stages) out.stages = out.stages.slice().sort(function (a, b) { return a - b; }).slice(0, 5);
  return out;
};

/** The settings in force. */
exports.merge = function (saved) {
  var out = {};
  Object.keys(DEFAULTS).forEach(function (key) {
    out[key] = Array.isArray(DEFAULTS[key]) ? DEFAULTS[key].slice() : DEFAULTS[key];
  });
  var clean = exports.clean(saved || {});
  Object.keys(clean).forEach(function (key) { out[key] = clean[key]; });
  return out;
};
