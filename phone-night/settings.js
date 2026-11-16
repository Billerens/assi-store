// Settings of «Тайная жизнь телефона»: every tunable number lives here, not in the code.
// Pure: no Android, no native — the engine (main.js) and node tests (tests/settings.test.js) use it.
// The screen draws the «Настройки» tab from SCHEMA; data/phone-night/settings.json keeps the values.

var SCHEMA = [
  // ---- the night ----
  { key: 'enabled', group: 'Ночь', label: 'Вести журнал ночи', type: 'bool', def: true,
    hint: 'Подписки на экран, уведомления, зарядку и сеть, вечерний и утренний снимки' },
  { key: 'nightStart', group: 'Ночь', label: 'Начало окна ночи', type: 'time', def: '23:00',
    hint: 'В это время — вечерний снимок' },
  { key: 'nightEnd', group: 'Ночь', label: 'Конец окна ночи', type: 'time', def: '07:00',
    hint: 'Утренний снимок, если телефон ещё не разблокировали' },
  { key: 'byScreen', group: 'Ночь', label: 'Определять ночь по выключенному экрану', type: 'bool', def: true,
    hint: 'Начало — выключение экрана, после которого он долго тёмный; конец — первая разблокировка утром' },
  { key: 'screenOffAfter', group: 'Ночь', label: 'Ночь начинается не раньше', type: 'time', def: '22:00' },
  { key: 'darkMinutes', group: 'Ночь', label: 'Экран тёмный не меньше, мин', type: 'number', def: 30, min: 5, max: 240, step: 5, unit: 'мин' },
  { key: 'wakeMaxMinutes', group: 'Ночь', label: 'Ночное пробуждение короче, мин', type: 'number', def: 30, min: 1, max: 180, step: 1, unit: 'мин',
    hint: 'Экран горел меньше — это ночь с пробуждением; дольше — ещё вечер' },
  { key: 'morningAfter', group: 'Ночь', label: 'Конец ночи — первая разблокировка после', type: 'time', def: '05:00' },
  { key: 'dayBoundary', group: 'Ночь', label: 'Граница суток отчёта', type: 'time', def: '14:00',
    hint: 'Позже утренний отчёт уже не присылается, а события относятся к следующей ночи' },

  // ---- the report ----
  { key: 'reportWhen', group: 'Отчёт', label: 'Когда присылать отчёт', type: 'select', def: 'unlock',
    options: [['unlock', 'При первой разблокировке утром'], ['time', 'В конец окна ночи'], ['never', 'Не присылать, только на экране']] },
  { key: 'lateReportAt', group: 'Отчёт', label: 'Собрать отчёт, если утром телефон не брали, в', type: 'time', def: '12:00',
    hint: 'Запасной путь: разблокировки не было или её событие потерялось' },
  { key: 'quietNotice', group: 'Отчёт', label: 'Утреннее уведомление без звука', type: 'bool', def: true },
  { key: 'notBeforeHours', group: 'Отчёт', label: 'Не раньше конца окна минус, ч', type: 'number', def: 2, min: 0, max: 8, step: 0.5, unit: 'ч' },
  { key: 'style', group: 'Отчёт', label: 'Стиль рассказа', type: 'select', def: 'nature',
    options: [['nature', 'Документальный фильм о природе'], ['detective', 'Детектив'], ['gossip', 'Сплетни'], ['dry', 'Сухо']] },
  { key: 'useModel', group: 'Отчёт', label: 'Рассказ моделью', type: 'bool', def: true,
    hint: 'Каждое число и название в рассказе сверяется с фактами; не сошлось — шаблон' },
  { key: 'storySentences', group: 'Отчёт', label: 'Предложений в рассказе, не больше', type: 'number', def: 8, min: 3, max: 15, step: 1 },
  { key: 'notifyLines', group: 'Отчёт', label: 'Строк в уведомлении', type: 'number', def: 3, min: 1, max: 6, step: 1 },
  { key: 'ownerInNotice', group: 'Отчёт', label: 'Ваши ночные сессии в уведомлении', type: 'bool', def: true,
    hint: 'Уведомление могут увидеть другие; на экране отчёта сессии видны всегда' },

  // ---- thresholds ----
  { key: 'wakeupThreshold', group: 'Пороги', label: 'Порог «нарушителя»: пробуждений за ночь', type: 'number', def: 5, min: 1, max: 1000, step: 1 },
  { key: 'tipNights', group: 'Пороги', label: 'Совет, если порог превышен ночей подряд', type: 'number', def: 3, min: 1, max: 14, step: 1 },
  { key: 'trafficMb', group: 'Пороги', label: 'Порог трафика в строке, МБ', type: 'number', def: 5, min: 0, max: 10000, step: 0.5, unit: 'МБ' },
  { key: 'noticeMin', group: 'Пороги', label: 'Порог уведомлений в строке', type: 'number', def: 3, min: 1, max: 1000, step: 1 },
  { key: 'topCount', group: 'Пороги', label: 'Мест в рейтингах', type: 'number', def: 3, min: 1, max: 10, step: 1 },
  { key: 'mergeSeconds', group: 'Пороги', label: 'Склеивать одинаковые события ближе, с', type: 'number', def: 3, min: 0, max: 60, step: 1, unit: 'с',
    hint: 'Журнал Assi и статистика Android видят одно включение экрана — это одно событие' },
  { key: 'noticeRepeatSeconds', group: 'Пороги', label: 'Обновление того же уведомления не считать, с', type: 'number', def: 60, min: 0, max: 3600, step: 10, unit: 'с' },
  { key: 'rebootMergeMinutes', group: 'Пороги', label: 'Признаки одной перезагрузки ближе, мин', type: 'number', def: 10, min: 1, max: 120, step: 1, unit: 'мин' },
  { key: 'timelineMarks', group: 'Пороги', label: 'Отметок на шкале ночи, не больше', type: 'number', def: 300, min: 50, max: 2000, step: 50 },
  { key: 'batteryPoints', group: 'Пороги', label: 'Точек на линии батареи, не больше', type: 'number', def: 120, min: 20, max: 1000, step: 10 },

  // ---- keeping ----
  { key: 'rawNights', group: 'Хранение', label: 'Хранить сырые выводы dumpsys, ночей', type: 'number', def: 3, min: 0, max: 30, step: 1 },
  { key: 'reportDays', group: 'Хранение', label: 'Хранить отчёты, дней', type: 'number', def: 365, min: 7, max: 3650, step: 1 },
  { key: 'eventDays', group: 'Хранение', label: 'Хранить журнал событий, дней', type: 'number', def: 30, min: 1, max: 365, step: 1 },
  { key: 'trendDays', group: 'Хранение', label: 'Тренды за, дней', type: 'number', def: 30, min: 7, max: 365, step: 1 },
  { key: 'lookbackHours', group: 'Хранение', label: 'Статистика Android: смотреть раньше вечера, ч', type: 'number', def: 6, min: 0, max: 24, step: 1, unit: 'ч',
    hint: 'Чтобы увидеть службы и приложения, запущенные ещё вечером' },
  { key: 'commandSeconds', group: 'Хранение', label: 'Ждать ответа dumpsys, с', type: 'number', def: 60, min: 10, max: 300, step: 5, unit: 'с' },
  { key: 'historyHeadBytes', group: 'Хранение', label: 'Запасной путь: начало ленты батареи, байт', type: 'number', def: 4000, min: 1000, max: 50000, step: 1000,
    hint: 'Когда файл ленты недоступен — берутся начало (время отсчёта) и конец вывода' },
  { key: 'historyTailBytes', group: 'Хранение', label: 'Запасной путь: конец ленты батареи, байт', type: 'number', def: 190000, min: 20000, max: 195000, step: 5000 },

  // ---- links with other modules (each works only when that module wrote something) ----
  { key: 'linkGames', group: 'Связи', label: 'Ночные игры из Игротеки', type: 'bool', def: true,
    hint: 'Сессии игр из общей базы (вид play), пересечённые с окном ночи' },
  { key: 'linkSpending', group: 'Связи', label: 'Ночные покупки из Трат', type: 'bool', def: true,
    hint: 'Траты из общей базы (вид expense) за окно ночи; возвраты не считаются' },
  { key: 'linkFocus', group: 'Связи', label: 'Фокус: «не беспокоить» ночью и попытки отвлечься днём', type: 'bool', def: true,
    hint: 'Сколько уведомлений пришло, пока ночью шёл Фокус с «не беспокоить», и дневные попытки открыть отвлекающее' },
  { key: 'linkSeries', group: 'Связи', label: 'Во сколько уснули под «Сериал на ночь»', type: 'bool', def: true },
  { key: 'linkMinMinutes', group: 'Связи', label: 'Игры и «не беспокоить» короче, мин, — не упоминать', type: 'number', def: 1, min: 1, max: 120, step: 1, unit: 'мин' },
  { key: 'habitMark', group: 'Связи', label: 'Ночь без телефона — отметка привычки в Здоровье', type: 'bool', def: false,
    hint: 'Утром, если ночью телефон не разблокировали, отчёт отмечает привычку ниже (её нужно завести в Здоровье)' },
  { key: 'habitName', group: 'Связи', label: 'Привычка в Здоровье', type: 'text', def: 'Ночь без телефона',
    hint: 'Название или id привычки' },
  { key: 'habitMaxUnlocks', group: 'Связи', label: 'Ночь без телефона: разблокировок не больше', type: 'number', def: 0, min: 0, max: 10, step: 1 },
  { key: 'morningBundle', group: 'Связи', label: 'Утренний пакет: обои дня и гороскоп рядом с отчётом', type: 'bool', def: true,
    hint: 'Если установлены «Обои дня» и «Гороскоп по данным»: строка в уведомлении и карточка на экране' },

  // ---- privacy ----
  { key: 'hidden', group: 'Приватность', label: 'Не упоминать приложения', type: 'list', def: [],
    hint: 'Пакеты, по одному в строке (com.example.app): выбрасываются из фактов до модели и экрана' },
  { key: 'launchers', group: 'Приватность', label: 'Не считать приложениями ваших сессий', type: 'list',
    def: ['com.sec.android.app.launcher', 'com.android.systemui', 'com.google.android.apps.nexuslauncher', 'com.android.launcher3'],
    hint: 'Рабочие столы и шторка: время в них не называется приложением ночи' }
];

exports.SCHEMA = SCHEMA;

function copy(value) {
  return value && typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : value;
}

exports.defaults = function () {
  var out = {};
  SCHEMA.forEach(function (item) { out[item.key] = copy(item.def); });
  return out;
};

/** 'H:MM' or 'HH:MM' -> 'HH:MM'; anything else -> null. */
function time(value) {
  var match = /^\s*(\d{1,2})[:.](\d{2})\s*$/.exec(String(value === undefined || value === null ? '' : value));
  if (!match) return null;
  var hours = Number(match[1]);
  var minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return (hours < 10 ? '0' : '') + hours + ':' + (minutes < 10 ? '0' : '') + minutes;
}

exports.time = time;

function number(item, value) {
  var n = typeof value === 'number' ? value : parseFloat(String(value === undefined || value === null ? '' : value).replace(',', '.'));
  if (!isFinite(n)) return item.def;
  if (item.min !== undefined && n < item.min) n = item.min;
  if (item.max !== undefined && n > item.max) n = item.max;
  if (item.step) n = Math.round(n / item.step) * item.step;
  return Math.round(n * 1000) / 1000;
}

function list(value) {
  if (value === undefined || value === null) return null;
  var parts = Array.isArray(value) ? value : String(value).split(/[\n,;]+/);
  var out = [];
  parts.forEach(function (part) {
    var text = String(part).trim();
    if (text && out.indexOf(text) < 0) out.push(text);
  });
  return out;
}

/** The stored values completed with defaults, numbers clamped, times and choices checked. */
exports.normalize = function (raw) {
  raw = raw && typeof raw === 'object' ? raw : {};
  var out = {};
  SCHEMA.forEach(function (item) {
    var value = raw[item.key];
    if (value === undefined || value === null || value === '') {
      out[item.key] = copy(item.def);
      return;
    }
    if (item.type === 'number') out[item.key] = number(item, value);
    else if (item.type === 'bool') out[item.key] = value === true || value === 'true' || value === 1 || value === '1' || value === 'on';
    else if (item.type === 'time') out[item.key] = time(value) || item.def;
    else if (item.type === 'select') {
      var known = item.options.some(function (option) { return option[0] === value; });
      out[item.key] = known ? value : item.def;
    } else if (item.type === 'list') {
      var parsed = list(value);
      out[item.key] = parsed === null ? copy(item.def) : parsed;
    } else {
      var text = String(value).trim();
      out[item.key] = text || copy(item.def);
    }
  });
  return out;
};
