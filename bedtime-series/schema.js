// Settings of the night series (data/series/settings.json): every tunable number is here, with a
// title and limits. Pure logic (engine, node).
var SOURCE_IDS = ['calendar', 'trip', 'workout', 'note', 'place', 'holidays', 'hat', 'rpg', 'meetings', 'inbox', 'horoscope', 'pet', 'draw'];

// Off until the owner allows them: who wrote (Входящие) and the titles of meetings (Диктофон).
var SOURCE_OFF = ['inbox', 'meetings'];

var SCHEMA = {
  prepareAt: { value: '20:00', type: 'time', title: 'Готовить серию в', group: 'Расписание' },
  remindAt: { value: '22:30', type: 'time', title: 'Напоминать о серии в', group: 'Расписание' },
  remind: { value: true, title: 'Уведомление «Серия готова»', group: 'Расписание' },
  retryEveryMin: { value: 30, title: 'Без сети пробовать снова через, минут', min: 5, max: 180, integer: true, group: 'Расписание' },
  continueDays: { value: 3, title: 'Предлагать продолжить уснувшую серию, дней', min: 1, max: 30, integer: true, group: 'Расписание' },

  sources: { value: SOURCE_IDS.filter(function (id) { return SOURCE_OFF.indexOf(id) < 0; }), title: 'Откуда брать детали дня', group: 'Детали дня',
    options: [['calendar', 'События календаря'], ['trip', 'Поездки'], ['workout', 'Тренировки'], ['note', 'Заметки'], ['place', 'Места'],
      ['holidays', 'Праздник дня (Праздники)'], ['hat', 'Вечер «Шляпы»'], ['rpg', 'Новый уровень в Жизни-RPG'],
      ['meetings', 'Встречи из Диктофона (только заголовки)'], ['inbox', 'Кто писал за день (Входящие; только имена из списка людей)'],
      ['horoscope', 'Знак недели (Гороскоп)'], ['pet', 'Существо Питомца'], ['draw', 'Игра «Рисуй — угадаю»']] },
  people: { value: [], title: 'Кого можно упоминать (имена через запятую)', group: 'Детали дня' },
  'details.max': { value: 8, title: 'Деталей дня в задании, не больше', min: 0, max: 20, integer: true, group: 'Детали дня' },
  'details.perSource': { value: 3, title: 'Деталей из одного источника, не больше (0 — без предела)', min: 0, max: 20, integer: true, group: 'Детали дня' },
  'details.chars': { value: 120, title: 'Длина одной детали, знаков не больше', min: 40, max: 400, integer: true, group: 'Детали дня' },
  'details.names': { value: 3, title: 'Имён и слов в одной детали (Шляпа, Входящие, встречи, рисунки), не больше', min: 0, max: 10, integer: true, group: 'Детали дня' },
  'art.on': { value: false, title: 'Рисунок к серии штрихами из «Рисуй — угадаю» (ещё один запрос к модели)', group: 'Детали дня' },

  seasonEpisodes: { value: 12, title: 'Серий в сезоне', min: 2, max: 60, integer: true, group: 'Сезон' },
  recapEpisodes: { value: 3, title: 'Пересказов прошлых серий в задании', min: 0, max: 10, integer: true, group: 'Сезон' },
  fixTries: { value: 2, title: 'Попыток исправить серию', min: 0, max: 5, integer: true, group: 'Сезон' },
  'scene.min': { value: 900, title: 'Длинная сцена, знаков не меньше', min: 200, max: 4000, integer: true, group: 'Сезон' },
  'scene.max': { value: 1600, title: 'Длинная сцена, знаков не больше', min: 300, max: 6000, integer: true, group: 'Сезон' },
  'branch.min': { value: 250, title: 'Короткая сцена ветки, знаков не меньше', min: 100, max: 3000, integer: true, group: 'Сезон' },
  'branch.max': { value: 900, title: 'Короткая сцена ветки, знаков не больше', min: 200, max: 4000, integer: true, group: 'Сезон' },
  asleepMax: { value: 600, title: 'Концовка «если уснул», знаков не больше', min: 100, max: 2000, integer: true, group: 'Сезон' },
  questionMax: { value: 240, title: 'Вопрос развилки, знаков не больше', min: 60, max: 600, integer: true, group: 'Сезон' },
  longFactor: { value: 1.4, title: 'Во сколько раз длиннее сцены у серии в 15 минут', min: 1, max: 3, step: 0.1, group: 'Сезон' },

  choiceWaitSec: { value: 15, title: 'Ждать ответа на развилке, секунд', min: 5, max: 90, integer: true, group: 'Развилки' },
  missedForks: { value: 2, title: 'Пропущенных развилок подряд до «уснул»', min: 1, max: 4, integer: true, group: 'Развилки' },
  repeatVolume: { value: 0.6, title: 'Громкость повторного вопроса (записанный голос)', min: 0.1, max: 1, step: 0.05, group: 'Развилки' },

  voiceStyle: { value: 'тихо, неторопливо, тепло', title: 'Манера облачного голоса', group: 'Голос' },
  'voice.mode': { value: 'auto', title: 'Голос рассказчика', group: 'Голос',
    options: [['auto', 'Облачный, когда есть сеть или запись'], ['local', 'Всегда голос телефона']] },
  'voice.speed': { value: 0, title: 'Темп голоса телефона (0 — как в настройках)', min: 0, max: 1.8, step: 0.05, group: 'Голос' },
  'voice.slowFactor': { value: 0.85, title: 'Замедление в конце серии', min: 0.5, max: 1, step: 0.05, group: 'Голос' },
  'voice.pollMs': { value: 200, title: 'Проверка конца речи, мс', min: 50, max: 1000, integer: true, group: 'Голос' },
  pauseMs: { value: 900, title: 'Пауза между фразами в конце серии, мс', min: 0, max: 5000, integer: true, group: 'Голос' },
  fadeScenes: { value: 2, title: 'Сцен с затуханием в конце', min: 0, max: 4, integer: true, group: 'Голос' },
  fadeTo: { value: 0.4, title: 'Громкость в самом конце (записанный голос)', min: 0.05, max: 1, step: 0.05, group: 'Голос' },
  pauseHoldMin: { value: 20, title: 'Пауза ждёт кнопку, минут', min: 1, max: 240, integer: true, group: 'Голос' },
  'headset.on': { value: true, title: 'Кнопка гарнитуры: нажатие — говорить, двойное — повтори', group: 'Голос' },
  'headset.doubleMs': { value: 400, title: 'Двойное нажатие гарнитуры, мс', min: 150, max: 1000, integer: true, group: 'Голос' },
  pauseOnCall: { value: true, title: 'Пауза при звонке', group: 'Голос' },
  pauseOnUnplug: { value: true, title: 'Пауза, когда отключились наушники', group: 'Голос' },
  'notice.on': { value: true, title: 'Уведомление с кнопками, пока идёт серия', group: 'Голос' },

  'audio.prerender': { value: true, title: 'Записывать облачный голос заранее (на Wi-Fi)', group: 'Запись голоса' },
  'audio.maxMb': { value: 300, title: 'Место под записи, МБ', min: 20, max: 4000, integer: true, group: 'Запись голоса' },
  'audio.rate': { value: 24000, title: 'Частота сырого звука, Гц', min: 8000, max: 48000, integer: true, group: 'Запись голоса' },

  live: { value: false, title: 'Живой режим: серию ведёт агент-рассказчик, его можно перебить голосом', group: 'Живой режим' }
};

/** The options of the voice loop (story-engine/voice.js). Forks are answered by voice: no push-to-talk. */
function voiceOptions(values) {
  return {
    listenSec: values.choiceWaitSec,
    pollMs: values['voice.pollMs'],
    silenceTries: 2,
    pauseHoldMin: values.pauseHoldMin,
    pttWaitMin: 30,
    pushToTalk: 'never',
    pushToTalkInTrip: false,
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

/** Limits of the check of an episode (graph.validate) for a season of `minutes` (10 or 15). */
function episodeLimits(values, minutes) {
  var k = Number(minutes) >= 15 ? values.longFactor : 1;
  function pair(name) {
    var low = Math.min(values[name + '.min'], values[name + '.max']);
    var high = Math.max(values[name + '.min'], values[name + '.max']);
    return [Math.round(low * k), Math.round(high * k)];
  }
  var scene = pair('scene');
  var branchPair = pair('branch');
  return {
    sceneMin: scene[0], sceneMax: scene[1],
    branchMin: branchPair[0], branchMax: branchPair[1],
    asleepMax: values.asleepMax, questionMax: values.questionMax,
    recapEpisodes: values.recapEpisodes
  };
}

/** «Петя, мама» or ['Петя', 'мама'] → ['Петя', 'мама']. */
function peopleList(value) {
  var list = Array.isArray(value) ? value : String(value || '').split(/[,;\n]+/);
  return list.map(function (name) { return String(name).replace(/\s+/g, ' ').trim(); })
    .filter(function (name, i, all) { return name && name.length <= 40 && all.indexOf(name) === i; }).slice(0, 50);
}

/** Only the known sources, in their order. */
function sourceList(value) {
  var list = Array.isArray(value) ? value.map(String) : [];
  return SOURCE_IDS.filter(function (id) { return list.indexOf(id) >= 0; });
}

exports.SCHEMA = SCHEMA;
exports.SOURCE_IDS = SOURCE_IDS;
exports.SOURCE_OFF = SOURCE_OFF;
exports.voiceOptions = voiceOptions;
exports.episodeLimits = episodeLimits;
exports.peopleList = peopleList;
exports.sourceList = sourceList;
