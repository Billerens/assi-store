// Настройки «Рисуй — угадаю»: что можно менять, в каких пределах, что стоит по умолчанию.
// Хранятся в data/draw-guess/settings.json; окно настроек на экране строится по этому списку.
// Чистая логика: движок (require('./config')), node (тесты), экран (window.dgConfig).
(function (exports) {
  var SCHEMA = [
    { key: 'drawSeconds', title: 'Время на рисунок', unit: 'с', def: 90, min: 20, max: 300, step: 5, group: 'Игра' },
    { key: 'roundsPerGame', title: 'Рисунков в партии', def: 5, min: 1, max: 30, step: 1, group: 'Игра' },
    { key: 'speedPoints', title: 'Очки за угадывание: с 10 до 1 за время рисунка', hint: 'выключено — по очку', def: true, group: 'Игра' },
    { key: 'synonyms', title: 'Засчитывать близкие по смыслу («кот» вместо «кошка»)', def: false, group: 'Игра' },
    { key: 'hintTheme', title: 'Подсказывать модели тему', hint: 'только общая тема, загаданное слово модель не видит никогда', def: false, group: 'Игра' },
    { key: 'minInterval', title: 'Минимальный интервал между отправками рисунка модели', unit: 'с', def: 3, min: 1, max: 30, step: 0.5, group: 'Модель угадывает' },
    { key: 'pauseSend', title: 'Отправить после паузы в рисовании', unit: 'с', def: 1.5, min: 0.5, max: 10, step: 0.5, group: 'Модель угадывает' },
    { key: 'minNewStrokes', title: 'Новая отправка, только если добавлено штрихов не меньше', def: 1, min: 1, max: 10, step: 1, group: 'Модель угадывает' },
    { key: 'localInterval', title: 'Интервал отправки для модели на телефоне', unit: 'с', def: 8, min: 2, max: 60, step: 1, group: 'Модель угадывает' },
    { key: 'imageSize', title: 'Размер картинки для модели', unit: 'px', def: 384, min: 128, max: 1024, step: 32, group: 'Модель угадывает' },
    { key: 'jpegQuality', title: 'Качество JPEG', def: 0.7, min: 0.3, max: 0.95, step: 0.05, group: 'Модель угадывает' },
    { key: 'margin', title: 'Поля вокруг рисунка на снимке', unit: '%', def: 5, min: 0, max: 20, step: 1, group: 'Модель угадывает' },
    { key: 'maxRequests', title: 'Предел запросов к модели за рисунок', def: 25, min: 1, max: 100, step: 1, group: 'Модель угадывает' },
    { key: 'finalAlternatives', title: 'Вариантов в последней попытке', def: 3, min: 1, max: 5, step: 1, group: 'Модель угадывает' },
    { key: 'showSnapshot', title: 'Показывать снимок, который ушёл модели', def: false, group: 'Модель угадывает' },
    { key: 'slowSeconds', title: 'Модель «медленная», если отвечает дольше', unit: 'с', def: 20, min: 5, max: 120, step: 1, group: 'Модель угадывает' },
    { key: 'voice', title: 'Голос модели', def: true, group: 'Голос' },
    { key: 'localVoice', title: 'Голос на телефоне (быстрее, без сети)', def: true, group: 'Голос' },
    { key: 'sayThreshold', title: 'Порог уверенности, чтобы сказать догадку вслух', def: 0.35, min: 0, max: 1, step: 0.05, group: 'Голос' },
    { key: 'noRepeatSay', title: 'Не повторять вслух ту же догадку', def: true, group: 'Голос' },
    { key: 'staleSeconds', title: 'Не говорить ответ, пришедший позже', unit: 'с после снимка', def: 6, min: 1, max: 30, step: 1, group: 'Голос' },
    { key: 'sayMaxWords', title: 'Фраза вслух — не длиннее', unit: 'слов', def: 6, min: 2, max: 15, step: 1, group: 'Голос' },
    { key: 'autoVoice', title: 'Угадывать голосом, когда рисует Axiko', def: true, group: 'Голос' },
    { key: 'chunkSeconds', title: 'Длина куска распознавания', unit: 'с', def: 4, min: 2, max: 10, step: 1, group: 'Голос' },
    { key: 'streamMaxMinutes', title: 'Непрерывное распознавание: предел на рисунок', unit: 'мин', def: 10, min: 1, max: 60, step: 1, group: 'Голос' },
    { key: 'paintSeconds', title: 'Время рисования моделью (полный рисунок)', unit: 'с', def: 45, min: 10, max: 180, step: 5, group: 'Axiko рисует' },
    { key: 'strokesMin', title: 'Штрихов в рисунке модели, не меньше', def: 15, min: 3, max: 80, step: 1, group: 'Axiko рисует' },
    { key: 'strokesMax', title: 'Штрихов в рисунке модели, не больше', def: 40, min: 5, max: 120, step: 1, group: 'Axiko рисует' },
    { key: 'maxPoints', title: 'Точек в штрихе модели, не больше', def: 30, min: 5, max: 100, step: 1, group: 'Axiko рисует' },
    { key: 'pauseMinMs', title: 'Пауза между штрихами, от', unit: 'мс', def: 150, min: 0, max: 2000, step: 10, group: 'Axiko рисует' },
    { key: 'pauseMaxMs', title: 'Пауза между штрихами, до', unit: 'мс', def: 400, min: 0, max: 3000, step: 10, group: 'Axiko рисует' },
    { key: 'checkPaint', title: 'Проверять рисунки модели её же зрением перед игрой', hint: 'вдвое дороже', def: false, group: 'Axiko рисует' },
    { key: 'stockSize', title: 'Рисунков в запасе (готовить заранее)', def: 20, min: 0, max: 100, step: 1, group: 'Axiko рисует' },
    { key: 'paintRetries', title: 'Повторных запросов, если рисунок не прошёл проверку', def: 1, min: 0, max: 3, step: 1, group: 'Axiko рисует' },
    { key: 'lineThin', title: 'Тонкая линия', unit: 'из 1000', def: 8, min: 2, max: 40, step: 1, group: 'Холст' },
    { key: 'lineThick', title: 'Толстая линия', unit: 'из 1000', def: 18, min: 4, max: 80, step: 1, group: 'Холст' },
    { key: 'paintLine', title: 'Линия рисунка модели', unit: 'из 1000', def: 10, min: 2, max: 40, step: 1, group: 'Холст' },
    { key: 'palmMs', title: 'Касание пальцем сразу после пера не рисует (ладонь)', unit: 'мс', def: 1500, min: 0, max: 5000, step: 100, group: 'Холст' },
    { key: 'saveBest', title: 'Сохранять лучший рисунок партии картинкой', hint: 'data/draw-guess/art; выключено — только по кнопке «Сохранить»', def: true, group: 'Служебное' },
    { key: 'keepDays', title: 'Хранить раунды', unit: 'дн.', def: 365, min: 7, max: 3650, step: 1, group: 'Служебное' },
    { key: 'recentWords', title: 'Не повторять слова, последних', def: 200, min: 0, max: 2000, step: 50, group: 'Служебное' },
    { key: 'heartbeatSeconds', title: 'Как часто экран говорит движку «игра идёт»', unit: 'с', def: 10, min: 3, max: 60, step: 1, group: 'Служебное' },
    { key: 'watchdogSeconds', title: 'Вернуть отклик на имя, если экран молчит', unit: 'с', def: 45, min: 15, max: 600, step: 5, group: 'Служебное' },
    { key: 'namesToBase', title: 'Итоги партии — в общую базу', def: true, group: 'Служебное' },
    { key: 'achievements', title: 'Ачивки — в «Ачивки за жизнь»', hint: 'модуля ачивок нет — ждут его в общем ящике', def: true, group: 'Служебное' },
    { key: 'artistStreak', title: 'Ачивка «Художник»: модель узнала рисунков подряд', def: 10, min: 3, max: 50, step: 1, group: 'Служебное' },
    { key: 'geniusCount', title: 'Ачивка «Нераспознанный гений»: рисунков, что модель не узнала, а люди узнали', def: 1, min: 1, max: 50, step: 1, group: 'Служебное' },
    { key: 'dailyDrawing', title: 'Рисунок дня для «Игры дня»', hint: 'утром из запаса или новый, если запас пуст', def: true, group: 'Служебное' }
  ];

  var THEMES = ['общее', 'животные', 'еда', 'предметы', 'природа', 'транспорт', 'профессии'];

  function defaults() {
    var out = {};
    for (var i = 0; i < SCHEMA.length; i++) out[SCHEMA[i].key] = SCHEMA[i].def;
    out.theme = 'общее';
    out.customTheme = '';
    out.difficulty = 2;
    out.secret = 'card';
    out.teams = false;
    out.players = [];
    return out;
  }

  /** Настройки в пределах: неизвестное отбрасывается, недостающее — по умолчанию. */
  function normalize(given) {
    var out = defaults();
    given = given || {};
    for (var i = 0; i < SCHEMA.length; i++) {
      var item = SCHEMA[i];
      var value = given[item.key];
      if (value === undefined || value === null || value === '') continue;
      if (typeof item.def === 'boolean') {
        out[item.key] = value === true || value === 'true' || value === 1;
      } else {
        var number = Number(value);
        if (isNaN(number)) continue;
        number = Math.min(item.max, Math.max(item.min, number));
        out[item.key] = Math.round(Math.round(number / item.step) * item.step * 1000) / 1000;
      }
    }
    if (typeof given.theme === 'string' && given.theme.trim()) out.theme = given.theme.trim().slice(0, 60);
    if (typeof given.customTheme === 'string') out.customTheme = given.customTheme.trim().slice(0, 60);
    var level = Number(given.difficulty);
    if (level >= 1 && level <= 5) out.difficulty = Math.round(level);
    if (given.secret === 'card' || given.secret === 'self') out.secret = given.secret;
    if (given.teams === true || given.teams === false) out.teams = given.teams;
    if (Array.isArray(given.players)) {
      out.players = given.players.map(function (name) { return String(name).trim().slice(0, 24); }).filter(Boolean).slice(0, 12);
    }
    if (out.strokesMax < out.strokesMin) out.strokesMax = out.strokesMin;
    if (out.pauseMaxMs < out.pauseMinMs) out.pauseMaxMs = out.pauseMinMs;
    if (out.lineThick < out.lineThin) out.lineThick = out.lineThin;
    return out;
  }

  exports.SCHEMA = SCHEMA;
  exports.THEMES = THEMES;
  exports.defaults = defaults;
  exports.normalize = normalize;
})(typeof exports !== 'undefined' ? exports : (window.dgConfig = {}));
