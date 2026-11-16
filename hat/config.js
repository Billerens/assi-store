// Настройки Шляпы: что можно менять, в каких пределах и что стоит по умолчанию.
// Хранятся в data/hat/settings.json; экран рисует по этому списку окно настроек.
// Чистая логика: движок (require('./config')), node (тесты), экран (window.hatConfig).
(function (exports) {
  var SCHEMA = [
    { key: 'turnSeconds', title: 'Время хода', unit: 'с', def: 60, min: 20, max: 300, step: 5, group: 'Игра' },
    { key: 'rounds', title: 'Раунды', hint: '3 — словами, жестами, одним словом; 1 — только словами', def: 3, min: 1, max: 3, step: 1, group: 'Игра' },
    { key: 'wordsPerPlayer', title: 'Слов на игрока в колоде', def: 8, min: 2, max: 30, step: 1, group: 'Колода' },
    { key: 'difficulty', title: 'Сложность', unit: 'из 5', def: 3, min: 1, max: 5, step: 1, group: 'Колода' },
    { key: 'skipPenalty', title: 'Штраф за пропуск', hint: '0 — без штрафа, 1 — минус очко', def: 0, min: 0, max: 3, step: 1, group: 'Игра' },
    { key: 'lastWordSeconds', title: 'Последнее слово: время на угадывание после конца хода', unit: 'с', def: 3, min: 0, max: 15, step: 1, group: 'Игра' },
    { key: 'autoVoice', title: 'Автозачёт голосом', def: true, group: 'Голос' },
    { key: 'chunkSeconds', title: 'Длина куска распознавания', unit: 'с', def: 4, min: 2, max: 10, step: 1, group: 'Голос' },
    { key: 'undoSeconds', title: 'Окно «Отмена»', unit: 'с', def: 5, min: 2, max: 20, step: 1, group: 'Игра' },
    { key: 'noRepeat', title: 'Не повторять слова, последних', def: 3000, min: 0, max: 20000, step: 500, group: 'Колода' },
    { key: 'allowForms', title: 'Допускать формы слова (падежи, число)', def: true, group: 'Голос' },
    { key: 'allowTypos', title: 'Допускать опечатки распознавания', hint: 'длина от 6 букв — 1 ошибка, от 10 — 2', def: true, group: 'Голос' },
    { key: 'typoLength1', title: 'Одна ошибка — со слов длиной', unit: 'букв', def: 6, min: 4, max: 12, step: 1, group: 'Голос' },
    { key: 'typoLength2', title: 'Две ошибки — со слов длиной', unit: 'букв', def: 10, min: 6, max: 20, step: 1, group: 'Голос' },
    { key: 'typoSound', title: 'Ошибка — только между созвучными буквами', def: true, group: 'Голос' },
    { key: 'phraseWindow', title: 'Части словосочетания — в пределах слов подряд', def: 4, min: 2, max: 8, step: 1, group: 'Голос' },
    { key: 'adultWords', title: 'Взрослые слова', def: false, group: 'Колода' },
    { key: 'quietWhileListening', title: 'Пауза распознавания во время собственных звуков игры', hint: 'пока слушает микрофон, тиканье тихое, а сигнал конца хода звучит после остановки микрофона', def: true, group: 'Голос' },
    { key: 'hotWord', title: 'Горячее слово: раз в раунд одно слово стоит больше', def: true, group: 'Игра' },
    { key: 'hotPoints', title: 'Очков за горячее слово', def: 3, min: 2, max: 5, step: 1, group: 'Игра' },
    { key: 'ownWords', title: 'Свои слова игроков', def: false, group: 'Колода' },
    { key: 'ownWordsPerPlayer', title: 'Своих слов на игрока', def: 5, min: 1, max: 15, step: 1, group: 'Колода' },
    { key: 'carryUnguessed', title: 'Неугаданные слова — в следующую колоду', def: true, group: 'Колода' },
    { key: 'deckDays', title: 'Хранить колоды', unit: 'дн.', def: 90, min: 7, max: 3650, step: 1, group: 'Колода' },
    { key: 'recentInPrompt', title: 'Сыгранных слов в запросе модели («не повторяй»)', def: 200, min: 0, max: 1000, step: 50, group: 'Колода' },
    { key: 'modelRetries', title: 'Дозапросов, если слов не хватило', def: 2, min: 0, max: 5, step: 1, group: 'Колода' },
    { key: 'maxWordLetters', title: 'Самое длинное слово в колоде', unit: 'букв', def: 24, min: 8, max: 40, step: 1, group: 'Колода' },
    { key: 'tickSeconds', title: 'Тиканье и вибрация в последние', unit: 'с', def: 5, min: 0, max: 15, step: 1, group: 'Звук' },
    { key: 'tickVolume', title: 'Громкость тиканья', unit: '%', def: 60, min: 0, max: 100, step: 5, group: 'Звук' },
    { key: 'tickQuietVolume', title: 'Громкость тиканья, пока слушает микрофон', unit: '%', def: 15, min: 0, max: 100, step: 5, group: 'Звук' },
    { key: 'vibrateMs', title: 'Вибрация при зачёте', unit: 'мс', def: 40, min: 0, max: 300, step: 10, group: 'Звук' },
    { key: 'tickVibrateMs', title: 'Вибрация на каждой последней секунде', unit: 'мс', def: 30, min: 0, max: 200, step: 10, group: 'Звук' },
    { key: 'countdownSeconds', title: 'Отсчёт перед ходом', unit: 'с', def: 3, min: 0, max: 10, step: 1, group: 'Игра' },
    { key: 'wordMaxPx', title: 'Размер слова на экране хода, наибольший', unit: 'px', def: 48, min: 24, max: 96, step: 2, group: 'Экран' },
    { key: 'wordMinPx', title: 'Размер слова на экране хода, наименьший', unit: 'px', def: 20, min: 12, max: 40, step: 2, group: 'Экран' },
    { key: 'streamMaxMinutes', title: 'Непрерывное распознавание: предел на ход', unit: 'мин', def: 10, min: 1, max: 60, step: 1, group: 'Голос' },
    { key: 'heartbeatSeconds', title: 'Как часто экран говорит движку «игра идёт»', unit: 'с', def: 10, min: 3, max: 60, step: 1, group: 'Служебное' },
    { key: 'watchdogSeconds', title: 'Вернуть отклик на имя, если экран молчит', unit: 'с', def: 45, min: 15, max: 600, step: 5, group: 'Служебное' },
    { key: 'namesToBase', title: 'Имена игроков — в общую базу', def: true, group: 'Служебное' },
    { key: 'telepathSeconds', title: 'Ачивка «Телепат»: слово угадано не дольше чем за', unit: 'с', def: 2, min: 1, max: 10, step: 1, group: 'Ачивки' }
  ];

  var THEMES = ['общее', 'кино', 'еда', 'природа', 'профессии', 'IT', 'история'];

  function defaults() {
    var out = {};
    for (var i = 0; i < SCHEMA.length; i++) out[SCHEMA[i].key] = SCHEMA[i].def;
    out.mode = 'pairs';
    out.teamCount = 2;
    out.theme = 'общее';
    out.customTheme = '';
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
        out[item.key] = Math.round(number / item.step) * item.step;
      }
    }
    if (given.mode === 'pairs' || given.mode === 'teams') out.mode = given.mode;
    var teams = Number(given.teamCount);
    if (teams >= 2 && teams <= 4) out.teamCount = Math.round(teams);
    if (typeof given.theme === 'string' && given.theme.trim()) out.theme = given.theme.trim().slice(0, 60);
    if (typeof given.customTheme === 'string') out.customTheme = given.customTheme.trim().slice(0, 60);
    if (out.typoLength2 < out.typoLength1) out.typoLength2 = out.typoLength1;
    return out;
  }

  /** Параметры сравнения слов для match.js из настроек. */
  function matchOptions(settings) {
    return {
      forms: settings.allowForms,
      typos: settings.allowTypos,
      fuzzy1: settings.typoLength1,
      fuzzy2: settings.typoLength2,
      sound: settings.typoSound,
      window: settings.phraseWindow
    };
  }

  exports.SCHEMA = SCHEMA;
  exports.THEMES = THEMES;
  exports.defaults = defaults;
  exports.normalize = normalize;
  exports.matchOptions = matchOptions;
})(typeof exports !== 'undefined' ? exports : (window.hatConfig = {}));
