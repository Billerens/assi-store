// Settings of the health module: every number the module uses lives here, with its default,
// its limits and the words the settings screen shows. Pure: the screen gets SCHEMA through the
// engine and draws the form from it; the engine merges what is saved with DEFAULTS.

var SCHEMA = [
  // Goals
  { key: 'stepsGoal', section: 'Цели', label: 'Цель шагов', type: 'int', min: 500, max: 50000, step: 500, unit: 'шагов', def: 8000 },
  { key: 'strideM', section: 'Цели', label: 'Длина шага', type: 'num', min: 0.3, max: 1.5, step: 0.01, unit: 'м', def: 0.75 },
  { key: 'sleepGoal', section: 'Цели', label: 'Цель сна', type: 'int', min: 240, max: 720, step: 10, unit: 'мин', def: 450 },
  { key: 'bedtime', section: 'Цели', label: 'Целевой отбой', type: 'time', def: '00:00' },
  { key: 'waterGoal', section: 'Цели', label: 'Цель воды', type: 'int', min: 250, max: 6000, step: 250, unit: 'мл', def: 2000 },
  { key: 'glassMl', section: 'Цели', label: 'Стакан', type: 'int', min: 50, max: 1000, step: 50, unit: 'мл', def: 250 },
  { key: 'moodOn', section: 'Цели', label: 'Отметка самочувствия на экране', type: 'bool', def: true },

  // The day and the night
  { key: 'dayEnd', section: 'Сутки и ночь', label: 'Конец суток', type: 'time', def: '05:00',
    hint: 'До этого часа ночь считается предыдущим днём' },
  { key: 'nightStart', section: 'Сутки и ночь', label: 'Ночное окно: с', type: 'time', def: '00:30' },
  { key: 'nightEnd', section: 'Сутки и ночь', label: 'Ночное окно: до', type: 'time', def: '05:00' },
  { key: 'lateAfter', section: 'Сутки и ночь', label: 'Поздний экран — после', type: 'time', def: '02:00',
    hint: 'Для поля lateAfter2Min сводки (ачивка «Полуночник»)' },
  { key: 'cacheSeconds', section: 'Сутки и ночь', label: 'Сводку «сегодня» пересчитывать не чаще', type: 'int', min: 0, max: 900, step: 10, unit: 'с', def: 60 },
  { key: 'recomputeDays', section: 'Сутки и ночь', label: 'Пересчитывать сами последние', type: 'int', min: 1, max: 14, step: 1, unit: 'дн', def: 2 },

  // Collecting
  { key: 'collectEvery', section: 'Сбор данных', label: 'Собирать данные раз в', type: 'int', min: 10, max: 240, step: 5, unit: 'мин', def: 30 },
  { key: 'stepsSource', section: 'Сбор данных', label: 'Источник шагов', type: 'select', def: 'both',
    options: [['both', 'Health Connect и датчик'], ['hc', 'Только Health Connect'], ['sensor', 'Только датчик телефона']] },
  { key: 'stepsPriority', section: 'Сбор данных', label: 'Если есть оба — главный', type: 'select', def: 'hc',
    options: [['hc', 'Health Connect'], ['sensor', 'Датчик телефона']] },
  { key: 'sleepFromHc', section: 'Сбор данных', label: 'Сон из Health Connect', type: 'bool', def: true },
  { key: 'workoutsFromHc', section: 'Сбор данных', label: 'Тренировки из Health Connect', type: 'bool', def: true },
  { key: 'waterToHc', section: 'Сбор данных', label: 'Писать воду в Health Connect', type: 'bool', def: false,
    hint: 'Чтобы её видел Samsung Health; нужно разрешение на запись воды' },
  { key: 'hcBackHours', section: 'Сбор данных', label: 'Читать Health Connect за последние', type: 'int', min: 12, max: 96, step: 6, unit: 'ч', def: 36 },
  { key: 'hcTimeoutMs', section: 'Сбор данных', label: 'Ждать Health Connect', type: 'int', min: 2000, max: 60000, step: 1000, unit: 'мс', def: 15000 },
  { key: 'sensorWaitMs', section: 'Сбор данных', label: 'Ждать датчик шагов', type: 'int', min: 500, max: 20000, step: 500, unit: 'мс', def: 4000 },
  { key: 'sensorSpreadHours', section: 'Сбор данных', label: 'Раскладывать шаги датчика по часам, не дальше', type: 'int', min: 1, max: 48, step: 1, unit: 'ч', def: 24 },

  // Sleep
  { key: 'sleepMinGap', section: 'Сон', label: 'Сон по экрану: не короче', type: 'int', min: 60, max: 600, step: 10, unit: 'мин', def: 180 },
  { key: 'sleepGlue', section: 'Сон', label: 'Склеивать пробуждения до', type: 'int', min: 0, max: 90, step: 1, unit: 'мин', def: 20 },
  { key: 'sleepFromStory', section: 'Сон', label: 'Засыпание под «Сериал на ночь» — начало сна по экрану', type: 'bool', def: true,
    hint: 'Под сериал экран гаснет раньше, чем вы засыпаете; сериал замечает, когда вы уснули' },
  { key: 'storyShiftMax', section: 'Сон', label: 'Сдвигать начало сна по сериалу не дальше', type: 'int', min: 10, max: 240, step: 5, unit: 'мин', def: 120 },
  { key: 'sleepWindowStart', section: 'Сон', label: 'Искать сон: с', type: 'time', def: '20:00' },
  { key: 'sleepWindowEnd', section: 'Сон', label: 'Искать сон: до', type: 'time', def: '14:00' },
  { key: 'screenLogDays', section: 'Сон', label: 'Хранить свой журнал экрана', type: 'int', min: 1, max: 14, step: 1, unit: 'дн', def: 3 },

  // Medicines
  { key: 'medRepeatMin', section: 'Лекарства', label: 'Повтор напоминания через', type: 'int', min: 5, max: 120, step: 5, unit: 'мин', def: 15 },
  { key: 'medRepeatCount', section: 'Лекарства', label: 'Сколько повторов', type: 'int', min: 0, max: 5, step: 1, unit: '', def: 1 },
  { key: 'medLateMin', section: 'Лекарства', label: 'Позже этого — «с опозданием»', type: 'int', min: 10, max: 600, step: 10, unit: 'мин', def: 60 },

  // Habits
  { key: 'freezesPerWeek', section: 'Привычки', label: 'Заморозок цепочки в неделю', type: 'int', min: 0, max: 7, step: 1, unit: '', def: 1 },
  { key: 'calendarWeeks', section: 'Привычки', label: 'Календарь привычек: недель', type: 'int', min: 4, max: 26, step: 1, unit: '', def: 8 },

  // Screen
  { key: 'socialAdd', section: 'Экран', label: 'Ещё соцсети (пакеты через запятую)', type: 'list', def: [] },
  { key: 'socialRemove', section: 'Экран', label: 'Не считать соцсетями (пакеты)', type: 'list', def: [] },
  { key: 'appsTop', section: 'Экран', label: 'Приложений в сводке экрана', type: 'int', min: 5, max: 50, step: 1, unit: '', def: 15 },
  { key: 'appsKeepDays', section: 'Экран', label: 'Подробности по приложениям хранить', type: 'int', min: 30, max: 3650, step: 30, unit: 'дн', def: 365 },

  // Places
  { key: 'placesOn', section: 'Места', label: 'Собирать места', type: 'bool', def: false },
  { key: 'placeEvery', section: 'Места', label: 'Местоположение раз в', type: 'int', min: 5, max: 120, step: 5, unit: 'мин', def: 15 },
  { key: 'placeRadius', section: 'Места', label: 'Радиус места', type: 'int', min: 50, max: 1000, step: 10, unit: 'м', def: 150 },
  { key: 'placeMinStay', section: 'Места', label: 'Визит — не короче', type: 'int', min: 1, max: 120, step: 1, unit: 'мин', def: 10 },
  { key: 'useGps', section: 'Места', label: 'GPS, если сеть неточна', type: 'bool', def: true },
  { key: 'gpsIfWorse', section: 'Места', label: 'Сеть неточна, если хуже', type: 'int', min: 20, max: 2000, step: 10, unit: 'м', def: 200 },
  { key: 'placeTimeoutMs', section: 'Места', label: 'Ждать местоположение', type: 'int', min: 2000, max: 60000, step: 1000, unit: 'мс', def: 20000 },
  { key: 'geohashPrecision', section: 'Места', label: 'Точность клеток карты (geohash)', type: 'int', min: 5, max: 9, step: 1, unit: '', def: 7 },
  { key: 'fixesKeepDays', section: 'Места', label: 'Сырые точки хранить', type: 'int', min: 1, max: 90, step: 1, unit: 'дн', def: 14 },
  { key: 'homeWorkDays', section: 'Места', label: 'Дом и работа — по последним', type: 'int', min: 7, max: 180, step: 1, unit: 'дн', def: 60 },

  // Weekly review
  { key: 'weeklyOn', section: 'Разбор недели', label: 'Разбор сна раз в неделю', type: 'bool', def: true },
  { key: 'weeklyDay', section: 'Разбор недели', label: 'День разбора', type: 'select', def: '7',
    options: [['1', 'Понедельник'], ['2', 'Вторник'], ['3', 'Среда'], ['4', 'Четверг'], ['5', 'Пятница'], ['6', 'Суббота'], ['7', 'Воскресенье']] },
  { key: 'weeklyAt', section: 'Разбор недели', label: 'Время разбора', type: 'time', def: '19:00' },
  { key: 'weeklyModel', section: 'Разбор недели', label: 'Текст пишет модель', type: 'bool', def: true },
  { key: 'weeklyDepth', section: 'Разбор недели', label: 'Глубина разбора', type: 'int', min: 14, max: 365, step: 7, unit: 'ночей', def: 56 },
  { key: 'badSleepBelow', section: 'Разбор недели', label: 'Ночь плохая, если сон короче цели на', type: 'int', min: 10, max: 240, step: 5, unit: 'мин', def: 45 },
  { key: 'minCases', section: 'Разбор недели', label: 'Не меньше случаев в группе', type: 'int', min: 2, max: 30, step: 1, unit: '', def: 5 },
  { key: 'minDiffPp', section: 'Разбор недели', label: 'Разница не меньше', type: 'int', min: 5, max: 80, step: 1, unit: 'п. п.', def: 20 },
  { key: 'featSocialMin', section: 'Разбор недели', label: 'Признак: соцсети больше', type: 'int', min: 10, max: 600, step: 10, unit: 'мин', def: 90 },
  { key: 'featLateMin', section: 'Разбор недели', label: 'Признак: экран в ночном окне больше', type: 'int', min: 5, max: 300, step: 5, unit: 'мин', def: 30 },
  { key: 'featStepsBelow', section: 'Разбор недели', label: 'Признак: шагов меньше', type: 'int', min: 500, max: 30000, step: 500, unit: '', def: 5000 },
  { key: 'featWorkoutAfter', section: 'Разбор недели', label: 'Признак: тренировка после', type: 'time', def: '20:00' },
  { key: 'deliveryAfter', section: 'Разбор недели', label: 'Доставка «поздняя» после', type: 'time', def: '22:00' },
  { key: 'featCoffeeAfter', section: 'Разбор недели', label: 'Признак: кофейня после', type: 'time', def: '16:00' },
  { key: 'deliveryTag', section: 'Разбор недели', label: 'Тег доставки еды', type: 'text', def: 'доставка еды' },
  { key: 'cafeTag', section: 'Разбор недели', label: 'Тег кафе', type: 'text', def: 'кафе и рестораны' },
  { key: 'coffeeWords', section: 'Разбор недели', label: 'Слова кофеен (через запятую)', type: 'list',
    def: ['кофе', 'coffee', 'cofix', 'starbucks', 'старбакс', 'даблби', 'кофемания', 'шоколадница', 'surf', 'espresso', 'эспрессо'] },

  // Notifications
  { key: 'notifyMeds', section: 'Уведомления', label: 'Напоминать о лекарствах', type: 'bool', def: true },
  { key: 'notifyHabits', section: 'Уведомления', label: 'Напоминать о привычках (у кого задано время)', type: 'bool', def: true },
  { key: 'notifyWeekly', section: 'Уведомления', label: 'Сообщать о разборе недели', type: 'bool', def: true }
];

exports.SCHEMA = SCHEMA;

var DEFAULTS = {};
SCHEMA.forEach(function (item) { DEFAULTS[item.key] = item.def; });
exports.DEFAULTS = DEFAULTS;

var BY_KEY = {};
SCHEMA.forEach(function (item) { BY_KEY[item.key] = item; });

function pad(n) {
  return (n < 10 ? '0' : '') + n;
}

function time(value) {
  var m = /^(\d{1,2}):(\d{2})$/.exec(String(value || '').trim());
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return null;
  return pad(Number(m[1])) + ':' + m[2];
}

/** One value made right for its setting, or undefined when it cannot be. */
function cleanValue(item, value) {
  if (item.type === 'int' || item.type === 'num') {
    var n = Number(value);
    if (value === '' || value === null || isNaN(n)) return undefined;
    if (item.type === 'int') n = Math.round(n);
    if (item.min !== undefined) n = Math.max(item.min, n);
    if (item.max !== undefined) n = Math.min(item.max, n);
    return n;
  }
  if (item.type === 'time') return time(value) || undefined;
  if (item.type === 'bool') return value === true || value === 'true' || value === 1 || value === '1';
  if (item.type === 'select') {
    var text = String(value);
    return item.options.some(function (option) { return option[0] === text; }) ? text : undefined;
  }
  if (item.type === 'list') {
    var list = Array.isArray(value) ? value : String(value || '').split(',');
    return list.map(function (x) { return String(x).trim(); }).filter(function (x) { return x; });
  }
  if (item.type === 'text') return String(value === null || value === undefined ? '' : value).trim();
  return undefined;
}

/** Only known keys, each made right; what cannot be made right is dropped. */
exports.clean = function (patch) {
  var out = {};
  Object.keys(patch || {}).forEach(function (key) {
    var item = BY_KEY[key];
    if (!item) return;
    var value = cleanValue(item, patch[key]);
    if (value !== undefined) out[key] = value;
  });
  return out;
};

/** The settings in force: defaults with what the owner saved on top. */
exports.merge = function (saved) {
  var out = {};
  Object.keys(DEFAULTS).forEach(function (key) {
    var value = DEFAULTS[key];
    out[key] = Array.isArray(value) ? value.slice() : value;
  });
  var clean = exports.clean(saved);
  Object.keys(clean).forEach(function (key) { out[key] = clean[key]; });
  out.weeklyDay = Number(out.weeklyDay);
  return out;
};
