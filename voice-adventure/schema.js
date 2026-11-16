// Settings of the adventure (data/stories/settings.json): every tunable number is here, with a
// title and limits. Pure logic (engine, node).

var SCHEMA = {
  listenSec: { value: 12, title: 'Сколько ждать ответа, секунд', min: 4, max: 60, integer: true, group: 'Голос' },
  'voice.pushToTalk': { value: 'auto', title: 'Режим «нажми и говори»', group: 'Голос',
    options: [['auto', 'В поездке'], ['always', 'Всегда'], ['never', 'Никогда']] },
  'voice.pushToTalkInTrip': { value: true, title: '«Нажми и говори», пока «Пассажир» видит поездку', group: 'Голос' },
  'voice.mode': { value: 'auto', title: 'Голос рассказчика', group: 'Голос',
    options: [['auto', 'Облачный, когда есть сеть'], ['local', 'Всегда голос телефона']] },
  'voice.speed': { value: 0, title: 'Темп голоса телефона (0 — как в настройках)', min: 0, max: 1.8, step: 0.05, group: 'Голос' },
  'voice.slowFactor': { value: 0.85, title: 'Замедление тихих реплик', min: 0.5, max: 1, step: 0.05, group: 'Голос' },
  'voice.pollMs': { value: 200, title: 'Проверка конца речи, мс', min: 50, max: 1000, integer: true, group: 'Голос' },
  silenceTries: { value: 2, title: 'Молчаний подряд до паузы', min: 1, max: 6, integer: true, group: 'Голос' },
  pauseHoldMin: { value: 20, title: 'Пауза ждёт кнопку, минут', min: 1, max: 240, integer: true, group: 'Голос' },
  pttWaitMin: { value: 30, title: '«Нажми и говори» ждёт кнопку, минут', min: 1, max: 240, integer: true, group: 'Голос' },
  'headset.on': { value: true, title: 'Кнопка гарнитуры: нажатие — говорить, двойное — повтори', group: 'Голос' },
  'headset.doubleMs': { value: 400, title: 'Двойное нажатие гарнитуры, мс', min: 150, max: 1000, integer: true, group: 'Голос' },
  pauseOnCall: { value: true, title: 'Пауза при звонке', group: 'Голос' },
  pauseOnUnplug: { value: true, title: 'Пауза, когда отключились наушники', group: 'Голос' },
  'notice.on': { value: true, title: 'Уведомление с кнопками, пока идёт история', group: 'Голос' },
  recapAfterMin: { value: 30, title: 'Пересказ после перерыва дольше, минут', min: 1, max: 1440, integer: true, group: 'История' },
  'life.rpg': { value: true, title: 'Уровень и места из «Жизни-RPG» — материал для новых глав', group: 'История' },
  'life.places': { value: 5, title: 'Мест из «Жизни-RPG» в задании главы, не больше', min: 0, max: 20, integer: true, group: 'История' },
  ahead: { value: 2, title: 'Готовых глав впереди', min: 0, max: 5, integer: true, group: 'Запас глав' },
  refillEveryMin: { value: 180, title: 'Пополнять запас раз в, минут', min: 30, max: 1440, integer: true, group: 'Запас глав' },
  retryAfterMin: { value: 15, title: 'После неудачи не пробовать писать, минут', min: 1, max: 720, integer: true, group: 'Запас глав' },
  fixTries: { value: 2, title: 'Попыток исправить главу', min: 0, max: 5, integer: true, group: 'Запас глав' },
  maxTextChars: { value: 400, title: 'Длина одного текста, знаков', min: 150, max: 1200, integer: true, group: 'Запас глав' },
  'rooms.min': { value: 6, title: 'Комнат в главе, не меньше', min: 2, max: 20, integer: true, group: 'Запас глав' },
  'rooms.max': { value: 10, title: 'Комнат в главе, не больше', min: 2, max: 30, integer: true, group: 'Запас глав' },
  'items.min': { value: 4, title: 'Предметов, не меньше', min: 1, max: 20, integer: true, group: 'Запас глав' },
  'items.max': { value: 8, title: 'Предметов, не больше', min: 1, max: 30, integer: true, group: 'Запас глав' },
  'puzzles.min': { value: 2, title: 'Загадок, не меньше', min: 1, max: 10, integer: true, group: 'Запас глав' },
  'puzzles.max': { value: 3, title: 'Загадок, не больше', min: 1, max: 10, integer: true, group: 'Запас глав' },
  recapChapters: { value: 3, title: 'Пересказов прошлых глав в задании', min: 0, max: 10, integer: true, group: 'Запас глав' },
  'audio.prerender': { value: false, title: 'Записывать облачный голос заранее (Wi-Fi и зарядка)', group: 'Запись голоса' },
  'audio.maxMb': { value: 300, title: 'Место под записи, МБ', min: 20, max: 4000, integer: true, group: 'Запись голоса' },
  'audio.rate': { value: 24000, title: 'Частота сырого звука, Гц', min: 8000, max: 48000, integer: true, group: 'Запись голоса' },
  'local.understand': { value: true, title: 'Модель на телефоне понимает непонятые фразы', group: 'Модель на телефоне' },
  'local.freeAnswers': { value: true, title: 'Модель на телефоне отвечает о том, чего нет в мире', group: 'Модель на телефоне' },
  'local.maxChars': { value: 280, title: 'Длина свободного ответа, знаков', min: 60, max: 800, integer: true, group: 'Модель на телефоне' },
  'local.maxTokens': { value: 120, title: 'Токенов на ответ модели на телефоне', min: 20, max: 600, integer: true, group: 'Модель на телефоне' },
  'parse.maxTypos': { value: 2, title: 'Опечаток распознавания в слове', min: 0, max: 3, integer: true, group: 'Разбор фраз' }
};

/** The options of the voice loop (story-engine/voice.js) from the adventure's settings. */
function voiceOptions(values) {
  return {
    listenSec: values.listenSec,
    pollMs: values['voice.pollMs'],
    silenceTries: values.silenceTries,
    pauseHoldMin: values.pauseHoldMin,
    pttWaitMin: values.pttWaitMin,
    pushToTalk: values['voice.pushToTalk'],
    pushToTalkInTrip: values['voice.pushToTalkInTrip'],
    voiceMode: values['voice.mode'],
    voiceSpeed: values['voice.speed'],
    slowFactor: values['voice.slowFactor'],
    doubleMs: values['headset.doubleMs'],
    headset: values['headset.on'],
    notice: values['notice.on'],
    pauseOnCall: values.pauseOnCall,
    pauseOnUnplug: values.pauseOnUnplug
  };
}

/** Limits for the check of a chapter (story-engine/chapter.js). */
function chapterLimits(values) {
  function low(name) { return Math.min(values[name + '.min'], values[name + '.max']); }
  function high(name) { return Math.max(values[name + '.min'], values[name + '.max']); }
  return {
    maxTextChars: values.maxTextChars,
    roomsMin: low('rooms'), roomsMax: high('rooms'),
    itemsMin: low('items'), itemsMax: high('items'),
    puzzlesMin: low('puzzles'), puzzlesMax: high('puzzles'),
    hints: 3
  };
}

/** The same limits under the names the chapter prompt uses ('rooms.min' …), min never above max. */
function promptSettings(values) {
  var limits = chapterLimits(values);
  return {
    'rooms.min': limits.roomsMin, 'rooms.max': limits.roomsMax,
    'items.min': limits.itemsMin, 'items.max': limits.itemsMax,
    'puzzles.min': limits.puzzlesMin, 'puzzles.max': limits.puzzlesMax,
    maxTextChars: values.maxTextChars, recapChapters: values.recapChapters
  };
}

exports.SCHEMA = SCHEMA;
exports.voiceOptions = voiceOptions;
exports.chapterLimits = chapterLimits;
exports.promptSettings = promptSettings;
