// Settings of «Обои дня»: the schema the screen draws its form from, the defaults, and the
// check that turns whatever is in data/wallpapers/settings.json into a complete, valid set.
// Pure: runs in node (tests) and in the engine.

var DEFAULT_TOPICS = [
  { name: 'природа', query: 'nature landscape', weight: 3, bright: false, space: false },
  { name: 'горы', query: 'mountains', weight: 2, bright: false, space: false },
  { name: 'архитектура', query: 'architecture', weight: 1, bright: false, space: false },
  { name: 'космос', query: 'nebula galaxy', weight: 1, bright: false, space: true }
];

var SOURCE_IDS = ['commons', 'openverse', 'apod', 'nasa-images', 'aic', 'unsplash', 'pexels'];

var SCHEMA = [
  { key: 'enabled', group: 'Расписание', label: 'Менять обои каждый день', type: 'bool', def: true },
  { key: 'time', group: 'Расписание', label: 'Время смены', type: 'time', def: '07:00' },
  { key: 'favoriteDays', group: 'Расписание', label: 'Дни «из избранного»', type: 'days', def: [6, 7],
    hint: 'В эти дни ставится картинка из избранного, а не новая. Пусто — никогда' },
  { key: 'favoriteGapDays', group: 'Расписание', label: 'Не ставить одну картинку из избранного чаще, дней', type: 'number', def: 21, min: 0, max: 365, step: 1 },
  { key: 'notify', group: 'Расписание', label: 'Тихое уведомление о новых обоях', type: 'bool', def: true },
  { key: 'notifyErrors', group: 'Расписание', label: 'Сообщать, если обои не сменились', type: 'bool', def: true },
  { key: 'otherPerHour', group: 'Расписание', label: '«Другие сейчас» — не больше раз в час', type: 'number', def: 5, min: 1, max: 60, step: 1,
    hint: 'У бесплатных API есть лимиты запросов' },

  { key: 'setInner', group: 'Куда ставить', label: 'Внутренний экран', type: 'bool', def: true },
  { key: 'setCover', group: 'Куда ставить', label: 'Внешний экран', type: 'bool', def: true },
  { key: 'setLock', group: 'Куда ставить', label: 'Экран блокировки', type: 'bool', def: true,
    hint: 'Если у Samsung включён «Динамический экран блокировки» или обои из тем Galaxy, они могут перебивать эти обои' },
  { key: 'shots', group: 'Куда ставить', label: 'Кадры', type: 'select', def: 'same',
    options: [['same', 'Один кадр, разное кадрирование'], ['different', 'Разные фото на внешний и внутренний']] },
  { key: 'lockScreen', group: 'Куда ставить', label: 'Кадр для блокировки', type: 'select', def: 'inner',
    options: [['inner', 'Как на внутреннем'], ['cover', 'Как на внешнем']] },

  { key: 'foldMode', group: 'Экраны', label: 'Как ставить на два экрана Fold', type: 'select', def: 'auto',
    options: [['auto', 'Выбрать самому по разведке'], ['crops', 'Кадрирования системы (Android 15+)'],
      ['flag', 'Флаг внешнего экрана (проверенный)'], ['single', 'Один кадр на оба экрана']] },
  { key: 'innerWidth', group: 'Экраны', label: 'Внутренний экран, ширина', type: 'number', def: 1812, min: 320, max: 6000, step: 1, unit: 'px' },
  { key: 'innerHeight', group: 'Экраны', label: 'Внутренний экран, высота', type: 'number', def: 2176, min: 320, max: 6000, step: 1, unit: 'px' },
  { key: 'coverWidth', group: 'Экраны', label: 'Внешний экран, ширина', type: 'number', def: 904, min: 320, max: 6000, step: 1, unit: 'px' },
  { key: 'coverHeight', group: 'Экраны', label: 'Внешний экран, высота', type: 'number', def: 2316, min: 320, max: 6000, step: 1, unit: 'px' },
  { key: 'hingeShift', group: 'Экраны', label: 'Сдвиг главного объекта от шарнира, доля ширины', type: 'number', def: 0.1, min: 0, max: 0.3, step: 0.01,
    hint: 'На внутреннем экране по середине шарнир: главное в кадре уводится от него' },
  { key: 'focusY', group: 'Экраны', label: 'Высота главного объекта в кадре без модели, доля', type: 'number', def: 0.5, min: 0.2, max: 0.8, step: 0.01 },

  { key: 'useWeather', group: 'Погода и место', label: 'Учитывать погоду', type: 'bool', def: true },
  { key: 'city', group: 'Погода и место', label: 'Город', type: 'text', def: '', max: 80,
    hint: 'Пусто — по грубой геолокации телефона' },
  { key: 'weatherMaxAge', group: 'Погода и место', label: 'Погода годится, минут', type: 'number', def: 60, min: 5, max: 720, step: 5 },
  { key: 'useHolidays', group: 'Погода и место', label: 'Повод дня из «Праздничных пасхалок»', type: 'bool', def: true },

  { key: 'calmAfterBadNight', group: 'После плохой ночи', label: 'После короткой ночи — спокойные пейзажи', type: 'bool', def: false,
    hint: 'Сон берётся из сводки модуля «Здоровье»; без него ничего не меняется' },
  { key: 'calmFromPet', group: 'После плохой ночи', label: 'Настроение Питомца — тоже повод для спокойных пейзажей', type: 'select', def: 'off',
    options: [['off', 'Не учитывать'], ['tired', 'Когда он невыспавшийся или сонный'], ['low', 'Ещё и когда притихший или под пледом']],
    hint: 'Настроение берётся из модуля «Питомец» (его состояние на сегодня); без него ничего не меняется' },
  { key: 'calmShortMin', group: 'После плохой ночи', label: 'Плохая ночь: сон короче цели на, минут', type: 'number', def: 45, min: 0, max: 300, step: 5 },
  { key: 'calmTopic', group: 'После плохой ночи', label: 'Тема такого дня', type: 'text', def: 'тишина', max: 40 },
  { key: 'calmQuery', group: 'После плохой ночи', label: 'Её запрос, по-английски', type: 'text', def: 'calm quiet landscape', max: 60 },
  { key: 'calmWeight', group: 'После плохой ночи', label: 'Её вес в такой день', type: 'number', def: 6, min: 0, max: 100, step: 0.5,
    hint: 'Добавляется к весам тем из настроек: при 6 и весах по умолчанию (всего 7) тема выпадает примерно в половине таких дней' },

  { key: 'minSide', group: 'Отбор', label: 'Меньшая сторона оригинала, не меньше', type: 'number', def: 2400, min: 600, max: 10000, step: 50, unit: 'px',
    hint: 'Art Institute отдаёт не больше 4,8 Мпикс: при 2400 его картины не проходят, при 2100 — проходят квадратные' },
  { key: 'maxBrightness', group: 'Отбор', label: 'Предел средней яркости кадра (0..1)', type: 'number', def: 0.45, min: 0.05, max: 1, step: 0.01 },
  { key: 'targetBrightness', group: 'Отбор', label: 'Желанная яркость кадра (0..1)', type: 'number', def: 0.3, min: 0, max: 1, step: 0.01 },
  { key: 'noRepeatDays', group: 'Отбор', label: 'Не повторять картинку, дней', type: 'number', def: 365, min: 0, max: 3650, step: 1 },
  { key: 'dhashDistance', group: 'Отбор', label: 'Похожей считать при отличии не больше, бит из 64', type: 'number', def: 10, min: 0, max: 32, step: 1 },
  { key: 'authorDays', group: 'Отбор', label: 'Не повторять автора, дней', type: 'number', def: 14, min: 0, max: 365, step: 1 },
  { key: 'topicStreak', group: 'Отбор', label: 'Одна тема подряд, не более дней', type: 'number', def: 2, min: 1, max: 30, step: 1 },
  { key: 'candidates', group: 'Отбор', label: 'Кандидатов на выбор', type: 'number', def: 8, min: 1, max: 20, step: 1 },
  { key: 'pageSize', group: 'Отбор', label: 'Результатов с одного запроса к источнику', type: 'number', def: 20, min: 5, max: 50, step: 1 },
  { key: 'apodCount', group: 'Отбор', label: 'NASA APOD: случайных картинок за запрос', type: 'number', def: 10, min: 1, max: 100, step: 1 },
  { key: 'maxRequests', group: 'Отбор', label: 'Запросов к источникам за один подбор, не больше', type: 'number', def: 12, min: 1, max: 60, step: 1 },
  { key: 'applyAttempts', group: 'Отбор', label: 'Если оригинал не скачался — пробовать следующих, всего', type: 'number', def: 3, min: 1, max: 10, step: 1 },
  { key: 'allowPeople', group: 'Отбор', label: 'Можно людей в кадре', type: 'bool', def: false },
  { key: 'queryTemplate', group: 'Отбор', label: 'Шаблон запроса', type: 'text', def: '{topic} {weather} {season}', max: 120,
    hint: 'Без модели запрос собирается так. Слова: {topic}, {weather}, {season}' },
  { key: 'openverseAspect', group: 'Отбор', label: 'Openverse: форма картинок', type: 'select', def: 'tall',
    options: [['tall', 'Вертикальные'], ['square', 'Квадратные'], ['wide', 'Горизонтальные'], ['any', 'Любые']] },

  { key: 'scoreBrightness', group: 'Оценка без модели', label: 'Вес: близость к желанной яркости', type: 'number', def: 1, min: 0, max: 5, step: 0.1 },
  { key: 'scoreResolution', group: 'Оценка без модели', label: 'Вес: разрешение', type: 'number', def: 0.5, min: 0, max: 5, step: 0.1 },
  { key: 'scoreContrast', group: 'Оценка без модели', label: 'Вес: чёткость в центре', type: 'number', def: 1, min: 0, max: 5, step: 0.1 },
  { key: 'scoreTaste', group: 'Оценка без модели', label: 'Вес: «больше/меньше такого»', type: 'number', def: 0.5, min: 0, max: 5, step: 0.1 },

  { key: 'useModelQuery', group: 'Модели', label: 'Запрос поиска пишет модель', type: 'bool', def: true,
    hint: 'Роль «Обои: запрос поиска». Без модели — по шаблону' },
  { key: 'useJudge', group: 'Модели', label: 'Оценка кандидатов моделью со зрением', type: 'bool', def: true,
    hint: 'Роль «Обои: выбор картинки». Модель без зрения не используется' },
  { key: 'judgeThumb', group: 'Модели', label: 'Миниатюры для модели, сторона', type: 'number', def: 384, min: 128, max: 1024, step: 16, unit: 'px' },

  { key: 'voteStep', group: 'Вкус', label: 'Сила одного «больше/меньше такого»', type: 'number', def: 0.25, min: 0, max: 2, step: 0.05 },
  { key: 'revertPenalty', group: 'Вкус', label: '«Вернуть вчерашние» — доля минуса', type: 'number', def: 0.5, min: 0, max: 2, step: 0.05 },
  { key: 'rememberTaste', group: 'Вкус', label: 'Запоминать вкус в долгую память', type: 'bool', def: true,
    hint: 'Тогда им пользуются и другие модули' },

  { key: 'awards', group: 'Ачивки', label: 'Выдавать ачивки «Коллекционер» и «Путешественник»', type: 'bool', def: true,
    hint: 'Через модуль «Ачивки»; пока его нет — ачивка ждёт в его ящике' },
  { key: 'collectorFavorites', group: 'Ачивки', label: '«Коллекционер»: обоев в избранном', type: 'number', def: 50, min: 1, max: 10000, step: 1 },
  { key: 'travellerCountries', group: 'Ачивки', label: '«Путешественник»: обоев из разных стран', type: 'number', def: 30, min: 1, max: 300, step: 1,
    hint: 'Страна известна не у всех картинок: у картин Art Institute — место создания, у Unsplash — страна съёмки, если автор её указал' },

  { key: 'keepFiles', group: 'Хранение и сеть', label: 'Хранить полные файлы, последних дней', type: 'number', def: 30, min: 1, max: 3650, step: 1,
    hint: 'Избранное хранится всегда, миниатюры — тоже' },
  { key: 'thumbSide', group: 'Хранение и сеть', label: 'Миниатюра в истории, ширина', type: 'number', def: 360, min: 120, max: 1080, step: 10, unit: 'px' },
  { key: 'jpegQuality', group: 'Хранение и сеть', label: 'Качество JPEG', type: 'number', def: 92, min: 50, max: 100, step: 1 },
  { key: 'maxDownloadMb', group: 'Хранение и сеть', label: 'Оригинал не больше', type: 'number', def: 30, min: 1, max: 200, step: 1, unit: 'МБ' },
  { key: 'maxDecodeMegapixels', group: 'Хранение и сеть', label: 'Читать в память не больше', type: 'number', def: 24, min: 4, max: 100, step: 1, unit: 'Мпикс',
    hint: 'Больший оригинал читается с уменьшением' },
  { key: 'wifiOnly', group: 'Хранение и сеть', label: 'Скачивать только по Wi-Fi', type: 'bool', def: false },
  { key: 'retryMinutes', group: 'Хранение и сеть', label: 'Без Wi-Fi повторять каждые, минут', type: 'number', def: 30, min: 5, max: 240, step: 5 },
  { key: 'retryUntil', group: 'Хранение и сеть', label: 'Повторять до, потом — из избранного', type: 'time', def: '12:00' },

  { key: 'sources', group: 'Источники', label: 'Источники', type: 'sources',
    def: { commons: true, openverse: true, apod: true, 'nasa-images': true, aic: true, unsplash: true, pexels: true } },
  { key: 'topics', group: 'Темы', label: 'Темы и их веса', type: 'topics', def: DEFAULT_TOPICS }
];

function copy(value) { return JSON.parse(JSON.stringify(value)); }

exports.SCHEMA = SCHEMA;
exports.SOURCE_IDS = SOURCE_IDS;
exports.DEFAULT_TOPICS = DEFAULT_TOPICS;

/** The settings as they are when nothing was changed. */
exports.defaults = function () {
  var out = {};
  SCHEMA.forEach(function (item) { out[item.key] = copy(item.def); });
  return out;
};

/** "7:5" → null, "07:05" → "07:05", "7:05" → "07:05". */
exports.time = function (value) {
  var match = /^\s*(\d{1,2}):(\d{2})\s*$/.exec(String(value === undefined || value === null ? '' : value));
  if (!match) return null;
  var hours = Number(match[1]);
  var minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return (hours < 10 ? '0' : '') + hours + ':' + match[2];
};

function number(item, value) {
  var parsed = typeof value === 'number' ? value : parseFloat(String(value === undefined || value === null ? '' : value).replace(',', '.'));
  if (!isFinite(parsed)) return item.def;
  if (item.min !== undefined && parsed < item.min) parsed = item.min;
  if (item.max !== undefined && parsed > item.max) parsed = item.max;
  if (item.step && item.step >= 1) parsed = Math.round(parsed);
  else if (item.step) parsed = Math.round(parsed / item.step) * item.step;
  return Math.round(parsed * 1000) / 1000;
}

function days(value, fallback) {
  if (!Array.isArray(value)) return copy(fallback);
  var seen = {};
  value.forEach(function (day) {
    var n = Math.round(Number(day));
    if (n >= 1 && n <= 7) seen[n] = true;
  });
  return Object.keys(seen).map(Number).sort(function (a, b) { return a - b; });
}

/** A topic the owner typed: a name, English words to search by, a weight and two flags. */
exports.topic = function (raw) {
  if (!raw || typeof raw !== 'object') return null;
  var name = String(raw.name || '').trim().slice(0, 40);
  var query = String(raw.query || '').toLowerCase().replace(/[^a-z0-9 '\-]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
  if (!name || !query) return null;
  var weight = parseFloat(String(raw.weight === undefined ? 1 : raw.weight).replace(',', '.'));
  if (!isFinite(weight) || weight < 0) weight = 0;
  if (weight > 100) weight = 100;
  return { name: name, query: query, weight: Math.round(weight * 100) / 100, bright: Boolean(raw.bright), space: Boolean(raw.space) };
};

/** Whatever was stored → a complete set of valid settings. */
exports.normalize = function (raw) {
  raw = raw && typeof raw === 'object' ? raw : {};
  var out = {};
  SCHEMA.forEach(function (item) {
    var value = raw[item.key];
    if (item.type === 'bool') out[item.key] = value === undefined || value === null ? item.def : value === true || value === 'true' || value === 1;
    else if (item.type === 'number') out[item.key] = number(item, value);
    else if (item.type === 'time') out[item.key] = exports.time(value) || item.def;
    else if (item.type === 'select') {
      var allowed = item.options.map(function (option) { return option[0]; });
      out[item.key] = allowed.indexOf(value) >= 0 ? value : item.def;
    } else if (item.type === 'text') out[item.key] = value === undefined || value === null ? item.def : String(value).trim().slice(0, item.max || 200);
    else if (item.type === 'days') out[item.key] = days(value, item.def);
    else if (item.type === 'sources') {
      var sources = {};
      SOURCE_IDS.forEach(function (id) {
        sources[id] = value && typeof value === 'object' && value[id] !== undefined ? Boolean(value[id]) : item.def[id];
      });
      out[item.key] = sources;
    } else if (item.type === 'topics') {
      var topics = (Array.isArray(value) ? value : []).map(exports.topic).filter(function (topic) { return topic; });
      var names = {};
      topics = topics.filter(function (topic) {
        var key = topic.name.toLowerCase();
        if (names[key]) return false;
        names[key] = true;
        return true;
      });
      out[item.key] = topics.length ? topics : copy(DEFAULT_TOPICS);
    }
  });
  if (out.targetBrightness > out.maxBrightness) out.targetBrightness = out.maxBrightness;
  if (!out.queryTemplate || out.queryTemplate.indexOf('{topic}') < 0) out.queryTemplate = '{topic} ' + (out.queryTemplate || '{weather} {season}');
  return out;
};

/** Minutes since midnight of "HH:MM". */
exports.minutes = function (hhmm) {
  var parts = String(hhmm).split(':');
  return Number(parts[0]) * 60 + Number(parts[1]);
};
