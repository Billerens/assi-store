// The module's settings: what they are, their defaults, and how a saved file is read back safely.
// The screen draws its «Настройки» tab from SCHEMA; every tunable number of the module is here.
// Pure: runs in node (tests) and in the engine.

/** Occasions that are off until the owner turns them on. */
var OFF_BY_DEFAULT = ['defender-day', 'womens-day', 'russia-day', 'unity-day', 'mothers-day'];

exports.OFF_BY_DEFAULT = OFF_BY_DEFAULT;

exports.SCHEMA = [
  { key: 'strength', group: 'Оформление', label: 'Сила декора', type: 'select', def: 'full',
    options: [['full', 'Полный'], ['color', 'Только цвет'], ['off', 'Выключен']], hint: 'Полный — цвет, украшения и пасхалки.' },
  { key: 'powerSave', group: 'Оформление', label: 'В режиме энергосбережения', type: 'select', def: 'color',
    options: [['color', 'Только цвет'], ['full', 'Как обычно'], ['off', 'Без украшений']] },
  { key: 'motionSeconds', group: 'Оформление', label: 'Движение при открытии экрана', type: 'number', def: 6, min: 0, max: 60, step: 1, unit: 'с',
    hint: 'Потом украшения стоят неподвижно. 0 — без движения.' },
  { key: 'particleCount', group: 'Оформление', label: 'Плотность фоновых украшений', type: 'number', def: 28, min: 8, max: 56, step: 4,
    hint: 'Редкие частицы без повторяющихся узоров. Положение меняется каждый день.' },
  { key: 'confettiSeconds', group: 'Оформление', label: 'Конфетти в день рождения', type: 'number', def: 4, min: 0, max: 20, step: 1, unit: 'с' },
  { key: 'confettiPieces', group: 'Оформление', label: 'Конфетти, штук', type: 'number', def: 30, min: 5, max: 80, step: 1 },
  { key: 'confettiWindowMinutes', group: 'Оформление', label: 'Конфетти показывать после первого открытия', type: 'number', def: 10, min: 1, max: 240, step: 1, unit: 'мин' },
  { key: 'previewSeconds', group: 'Оформление', label: 'Предпросмотр праздника', type: 'number', def: 30, min: 5, max: 300, step: 5, unit: 'с' },

  { key: 'off', group: 'Поводы', label: 'Поводы', type: 'list', def: OFF_BY_DEFAULT,
    hint: 'Какие праздники Axiko отмечает. Свои поводы — на вкладке «Свои поводы».' },
  { key: 'upcomingDays', group: 'Поводы', label: 'Показывать поводы вперёд на', type: 'number', def: 60, min: 7, max: 400, step: 1, unit: 'дн.' },
  { key: 'dailyTime', group: 'Поводы', label: 'Время ежедневной проверки', type: 'time', def: '00:05' },

  { key: 'remindDays', group: 'Дни рождения', label: 'Напоминать о днях рождения близких за', type: 'number', def: 1, min: 0, max: 30, step: 1, unit: 'дн.',
    hint: 'У каждого человека можно задать своё на вкладке «Близкие».' },
  { key: 'remindTime', group: 'Дни рождения', label: 'Время напоминания', type: 'time', def: '19:00' },
  { key: 'closeStarred', group: 'Дни рождения', label: 'Близкие — контакты из «Избранного»', type: 'bool', def: true,
    hint: 'Плюс те, кого вы отметили вручную.' },
  { key: 'ownerBirthday', group: 'Дни рождения', label: 'Ваша дата рождения', type: 'text', def: '',
    hint: 'Например, 15.11.1990. Пусто — из вашей карточки в контактах.' },
  { key: 'greetModel', group: 'Дни рождения', label: 'Поздравления пишет модель', type: 'bool', def: true,
    hint: 'Выключено — простой шаблон без модели.' },
  { key: 'greetVoice', group: 'Дни рождения', label: 'Поздравить голосом при первой разблокировке', type: 'bool', def: false },
  { key: 'draftKeepDays', group: 'Дни рождения', label: 'Хранить черновики поздравлений', type: 'number', def: 365, min: 7, max: 3650, step: 1, unit: 'дн.' },

  { key: 'awardYearDays', group: 'Ачивки', label: 'Ачивка «Не забыл»: поздравить всех близких за', type: 'number', def: 365, min: 30, max: 730, step: 1, unit: 'дн.',
    hint: 'Поздравлением считается черновик, подготовленный здесь: модуль сам ничего не отправляет.' },
  { key: 'awardEarlyDays', group: 'Ачивки', label: 'Черновик вовремя — если сделан не раньше чем за', type: 'number', def: 14, min: 0, max: 60, step: 1, unit: 'дн.',
    hint: 'До дня рождения или в сам день.' },
  { key: 'awardMinPeople', group: 'Ачивки', label: 'Близких с днём рождения за это время — хотя бы', type: 'number', def: 3, min: 1, max: 100, step: 1 },

  { key: 'firstSnow', group: 'Первый снег', label: 'Замечать первый снег', type: 'bool', def: true },
  { key: 'firstSnowAfter', group: 'Первый снег', label: 'Не раньше (ММ-ДД)', type: 'text', def: '10-01' },
  { key: 'firstSnowUntil', group: 'Первый снег', label: 'Не позже (ММ-ДД)', type: 'text', def: '12-31' },
  { key: 'firstSnowDays', group: 'Первый снег', label: 'Зимнее оформление после первого снега', type: 'number', def: 3, min: 1, max: 60, step: 1, unit: 'дн.' },
  { key: 'weatherEveryHours', group: 'Первый снег', label: 'Смотреть погоду не чаще, чем раз в', type: 'number', def: 6, min: 1, max: 48, step: 1, unit: 'ч' },
  { key: 'weatherMaxAgeMinutes', group: 'Первый снег', label: 'Погода из «Обоев дня» годится, если не старше', type: 'number', def: 180, min: 10, max: 1440, step: 10, unit: 'мин' },
  { key: 'weatherCity', group: 'Первый снег', label: 'Город для погоды', type: 'text', def: '',
    hint: 'Нужен, если нет модуля «Обои дня» и доступа к местоположению.' },

  { key: 'memoryLine', group: 'Ассистент', label: 'Говорить ассистенту о поводе дня', type: 'bool', def: false,
    hint: 'В дни поводов модуль пишет одну строку в память ассистента (agent/memory.md) и убирает её на следующий день.' },
  { key: 'aprilJoke', group: 'Ассистент', label: 'Шутка 1 апреля', type: 'bool', def: true,
    hint: 'Одна безобидная шутка в первом ответе дня. Работает, только если включено «Говорить ассистенту о поводе дня».' }
];

function byKey() {
  var map = {};
  exports.SCHEMA.forEach(function (item) { map[item.key] = item; });
  return map;
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

exports.defaults = function () {
  var out = { people: {} };
  exports.SCHEMA.forEach(function (item) { out[item.key] = clone(item.def); });
  return out;
};

function time(value, fallback) {
  var found = /^(\d{1,2}):(\d{2})$/.exec(String(value || '').trim());
  if (!found) return fallback;
  var hours = Number(found[1]);
  var minutes = Number(found[2]);
  if (hours > 23 || minutes > 59) return fallback;
  return (hours < 10 ? '0' : '') + hours + ':' + found[2];
}

function monthDay(value, fallback) {
  var found = /^(\d{1,2})-(\d{1,2})$/.exec(String(value || '').trim());
  if (!found) return fallback;
  var month = Number(found[1]);
  var day = Number(found[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return fallback;
  return (month < 10 ? '0' : '') + month + '-' + (day < 10 ? '0' : '') + day;
}

function people(value) {
  var out = {};
  if (!value || typeof value !== 'object') return out;
  Object.keys(value).forEach(function (id) {
    var mark = value[id] || {};
    var clean = {};
    if (typeof mark.remind === 'boolean') clean.remind = mark.remind;
    if (typeof mark.days === 'number' && isFinite(mark.days)) clean.days = Math.max(0, Math.min(30, Math.round(mark.days)));
    if (mark.name) clean.name = String(mark.name).slice(0, 120);
    out[String(id)] = clean;
  });
  return out;
}

/** A saved (or sent from the screen) set of values made whole and safe: defaults, limits, formats. */
exports.normalize = function (raw) {
  raw = raw && typeof raw === 'object' ? raw : {};
  var schema = byKey();
  var out = exports.defaults();
  Object.keys(schema).forEach(function (key) {
    var item = schema[key];
    var value = raw[key];
    if (value === undefined || value === null) return;
    if (item.type === 'number') {
      var number = Number(value);
      if (!isFinite(number)) return;
      if (item.step && item.step >= 1) number = Math.round(number);
      if (item.min !== undefined) number = Math.max(item.min, number);
      if (item.max !== undefined) number = Math.min(item.max, number);
      out[key] = number;
    } else if (item.type === 'bool') {
      out[key] = value === true || value === 'true' || value === 1;
    } else if (item.type === 'time') {
      out[key] = time(value, item.def);
    } else if (item.type === 'select') {
      if (item.options.some(function (option) { return option[0] === value; })) out[key] = value;
    } else if (item.type === 'list') {
      var list = Array.isArray(value) ? value : String(value).split(',');
      out[key] = list.map(function (entry) { return String(entry).trim(); }).filter(function (entry, index, all) {
        return entry && all.indexOf(entry) === index;
      });
    } else {
      out[key] = String(value).trim().slice(0, 200);
    }
  });
  out.firstSnowAfter = monthDay(out.firstSnowAfter, '10-01');
  out.firstSnowUntil = monthDay(out.firstSnowUntil, '12-31');
  out.people = people(raw.people);
  return out;
};

/** 'ЧЧ:ММ' → minutes since midnight. */
exports.minutes = function (value) {
  var found = /^(\d{1,2}):(\d{2})$/.exec(String(value || ''));
  return found ? Number(found[1]) * 60 + Number(found[2]) : 0;
};
