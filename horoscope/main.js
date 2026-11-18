// «Гороскоп по данным»: a joking forecast that comes true because it is made of the owner's own
// habits; the next morning the module checks what came true. Morning job → check yesterday →
// sign of the week → detectors → text (model role horoscope.write, or templates) → day file.
var axiko = require('lib/axiko');
var files = axiko.files;
var source = require('./source.js');
var dates = require('./dates.js');
var detectors = require('./detectors.js');
var signs = require('./signs.js');
var text = require('./text.js');
var links = require('./links.js');

var DIR = 'data/horoscope/';
var SCREEN = 'modules/horoscope/ui/index.html';

var DEFAULTS = {
  at: '07:30',                 // время прогноза
  notify: false,               // уведомление с первым предсказанием
  count: 3,                    // число предсказаний (2–4)
  n: 4,                        // последних таких же дней…
  k: 3,                        // …из них с закономерностью
  noRepeat: 2,                 // одно предсказание — не дольше 2 дней подряд
  mentionMoney: false,         // упоминать суммы денег
  mentionPlaces: true,         // упоминать места по именам
  tone: 'soft',                // soft — мягкий, sharp — ехидный
  voice: 'tts',                // tts — голос роли tts, local — голос на телефоне
  model: true,                 // писать текст моделью роли horoscope.write (если ей назначена модель)
  calendar: false,             // встречи из календаря (нужно разрешение)
  outsmart: true,              // скрытая ачивка «Перехитрил звёзды»
  outsmartMisses: 5,           // столько несбывшихся подряд
  holidays: true,              // праздник сегодня или в ближайшие дни (модуль «Праздники»)
  holidayPeople: false,        // дни рождения близких из «Праздников» в прогнозе
  pet: false,                  // прогноз «читает» существо Питомца: имя, настроение, его фраза
  petPhraseMax: 160,           // фраза Питомца — не длиннее, знаков
  wallpaper: true,             // ссылка на сегодняшние обои («Обои дня») на экране
  window: 56,                  // дней истории для закономерностей
  keepDays: 365,               // сколько хранить прогнозы
  minScore: 0.25,              // знак недели: минимум очков у первой звезды
  full: {},                    // знак недели: «полные» очки звёзд { owl: 300, … }
  detectors: {}                // пороги детекторов (detectors.DEFAULTS): deliveryHour, sleepDebt, trendPct, holidayDays, focusMin…
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function merge(into, from) {
  Object.keys(from || {}).forEach(function (key) {
    var value = from[key];
    if (value && typeof value === 'object' && !Array.isArray(value) && into[key] && typeof into[key] === 'object' && !Array.isArray(into[key])) merge(into[key], value);
    else into[key] = value;
  });
  return into;
}

function settings() {
  return merge(clone(DEFAULTS), files.readJson(DIR + 'settings.json', {}) || {});
}

function stars() {
  return require('./stars.json');
}

function templates() {
  return require('./templates.json');
}

function dayPath(date) {
  return DIR + 'days/' + date + '.json';
}

function readDay(date) {
  return files.readJson(dayPath(date), null);
}

function writeDay(file) {
  files.writeJson(dayPath(file.date), file);
}

/** Day files of the last `count` days before (and including) `date`, oldest first. */
function lastFiles(date, count) {
  var out = [];
  for (var i = count - 1; i >= 0; i--) {
    var file = readDay(dates.add(date, -i));
    if (file) out.push(file);
  }
  return out;
}

function detectorSettings(s) {
  var d = Object.assign({}, s.detectors || {});
  d.n = s.n;
  d.k = s.k;
  d.count = s.count;
  d.noRepeat = s.noRepeat;
  if (d.deliveryHour === undefined) {
    var health = files.readJson('data/health/settings.json', {}) || {};
    var after = dates.minutes(health.deliveryAfter);
    if (after !== null) d.deliveryHour = Math.floor(after / 60);
  }
  return d;
}

// ---- what the detectors read --------------------------------------------------------------------

function records(fromMs, toMs) {
  var base = require('lib/base');
  var out = [];
  for (var start = fromMs; start < toMs; start += 10 * 864e5) {
    out = out.concat(base.find({ kinds: ['expense', 'play', 'focus'], since: start, until: Math.min(toMs, start + 10 * 864e5), limit: 1000, oldestFirst: true }));
  }
  return out;
}

function places() {
  var out = {};
  try {
    require('lib/base').find({ kind: 'place', limit: 1000 }).forEach(function (row) {
      var data = row.data || {};
      if (data.id !== undefined) out[data.id] = { title: row.title, type: data.type || 'other' };
    });
  } catch (error) {
    console.warn('horoscope: places: ' + error);
  }
  return out;
}

function habits() {
  var out = {};
  var list = files.readJson('data/health/habits.json', []);
  (Array.isArray(list) ? list : []).forEach(function (habit) { out[habit.id] = habit.title; });
  return out;
}

/** Achievements 1–3 days away (and their progress, for tomorrow's check). */
function achievementsClose() {
  var module = source.module('achievements');
  if (!module || typeof module.closest !== 'function') return [];
  try {
    return (module.closest(20) || []).map(function (one) {
      return { id: one.id, title: one.title, daysLeft: one.daysLeft, progress: one.progress };
    });
  } catch (error) {
    console.warn('horoscope: achievements: ' + error);
    return [];
  }
}

function achievementsGranted(sinceMs) {
  try {
    return require('lib/base').find({ kind: 'achievement', since: sinceMs, limit: 200 }).map(function (row) { return (row.data || {}).id; });
  } catch (error) {
    return [];
  }
}

/** The level of Жизнь-RPG and its pace: { level, toNext, perDay } or null. */
function rpgPace() {
  var rpg = source.module('rpg');
  if (!rpg || typeof rpg.status !== 'function') return null;
  try {
    var status = rpg.status();
    var today = source.currentDay();
    var sum = 0;
    for (var i = 1; i <= 7; i++) {
      (rpg.journal(dates.add(today, -i)) || []).forEach(function (row) { sum += Number(row.amount) || 0; });
    }
    return { level: status.level, toNext: status.toNext, perDay: sum / 7 };
  } catch (error) {
    console.warn('horoscope: rpg: ' + error);
    return null;
  }
}

/** Is Фокус installed: without it its sessions are not predicted and not checked. */
function focusInstalled() {
  return files.exists('modules/focus/main.js');
}

/** The holiday of «Праздники» today or within holidayDays (links.holiday), or null. */
function holiday(date, s) {
  if (!s.holidays) return null;
  return links.holiday(source.module('holidays'), date, { on: true, days: detectorSettings(s).holidayDays, people: s.holidayPeople });
}

function petReader(s) {
  if (!s.pet) return null;
  var banned = (files.readJson('data/pet/settings.json', {}) || {}).banned;
  return links.pet(source.module('pet'), { on: true, phraseMax: s.petPhraseMax, clean: function (phrase) { return text.clean(phrase, banned); } });
}

/** The forecast as it is read aloud and given to the agent: the creature's line first, when there is one. */
function fullText(file) {
  return (file.pet && file.pet.line ? file.pet.line + ' ' : '') + file.text;
}

/** Today's meetings (not all-day ones) when the owner allowed the calendar. */
function calendar(date, s) {
  if (!s.calendar) return [];
  try {
    var goals = source.goals();
    var from = Math.max(Date.now(), dates.start(date, goals.dayEndHour));
    var to = dates.start(dates.add(date, 1), goals.dayEndHour);
    return axiko.rows('content://com.android.calendar/instances/when/' + from + '/' + to, ['title', 'begin', 'end', 'allDay'], null, null, 'begin asc', 10)
      .filter(function (row) { return String(row.allDay) !== '1'; })
      .map(function (row) { return { begin: Number(row.begin) }; });
  } catch (error) {
    console.warn('horoscope: calendar: ' + error);
    return [];
  }
}

// ---- yesterday's check ------------------------------------------------------------------------

/**
 * Checks the forecast of `date` by its summary (and the next day's for sleep). What could not be
 * checked yet (the night's sleep not known at 05:00) is tried again for two more days.
 */
exports.verify = function (date) {
  var file = readDay(date);
  if (!file) return null;
  var age = dates.diff(source.currentDay(), date);
  if (age < 1) return file;
  var open = file.predictions.filter(function (p) { return p.check && (p.hit === null || p.hit === undefined); });
  if (!open.length || (file.checked && age > 2)) return file;
  var goals = source.goals();
  var day = source.day(date);
  var next = source.day(dates.add(date, 1));
  var fromMs = dates.start(date, goals.dayEndHour);
  var toMs = dates.start(dates.add(date, 1), goals.dayEndHour);
  var ctx = {
    day: day, next: next, records: records(fromMs, toMs), dayEndHour: goals.dayEndHour,
    extras: { achievements: achievementsClose(), granted: achievementsGranted(fromMs), rpgLevel: (rpgPace() || {}).level, focus: focusInstalled() }
  };
  open.forEach(function (p) { p.hit = detectors.evaluate(p, ctx); });
  file.checked = file.checked || Date.now();
  writeDay(file);
  outsmart(date);
  return file;
};

/** «Перехитрил звёзды»: a hidden achievement after 5 predictions in a row did not come true. */
function outsmart(date) {
  var s = settings();
  if (!s.outsmart) return;
  var misses = detectors.missStreak(lastFiles(date, 30));
  if (misses < s.outsmartMisses) return;
  var achievements = source.module('achievements');
  if (!achievements || typeof achievements.grant !== 'function') return;
  try {
    achievements.grant({
      key: 'horoscope/outsmart', source: 'horoscope', category: 'Жизнь', title: 'Перехитрил звёзды',
      text: s.outsmartMisses + ' несбывшихся предсказаний подряд', at: Date.now(), hidden: true, icon: 'modules/horoscope/icon.svg'
    });
  } catch (error) {
    console.warn('horoscope: outsmart: ' + error);
  }
}

// ---- the sign of the week ---------------------------------------------------------------------

/** The sign of the week `date` is in, made on its Monday from the week before. */
exports.sign = function (date) {
  var s = settings();
  date = date || source.currentDay();
  var monday = dates.monday(date);
  var list = files.readJson(DIR + 'signs.json', []) || [];
  var found = list.filter(function (one) { return one.week === monday; })[0];
  if (found) return found;
  var from = dates.add(monday, -7);
  var to = dates.add(monday, -1);
  var goals = source.goals();
  var days = source.days(from, to);
  var made = signs.ofWeek(stars(), days, records(dates.start(from, goals.dayEndHour), dates.start(monday, goals.dayEndHour)), goals, { full: s.full, minScore: s.minScore });
  var entry = made ? { week: monday, star: made.star, house: made.house, title: made.title, scores: made.scores } : { week: monday, star: null, house: null, title: null, scores: {} };
  list.push(entry);
  files.writeJson(DIR + 'signs.json', list);
  return entry;
};

// ---- the forecast -------------------------------------------------------------------------------

/** The sign with the names and meanings of its two stars, for the text. */
function signWords(sign) {
  var all = stars();
  var star = all.filter(function (one) { return one.id === sign.star; })[0] || {};
  var house = all.filter(function (one) { return one.id === sign.house; })[0] || {};
  return { star: sign.star, house: sign.house, title: sign.title, starTitle: star.title, starAbout: star.about, houseTitle: house.title, houseAbout: house.about };
}

function modelText(sign, predictions, s, date, paused) {
  if (!s.model || !predictions.some(function (p) { return p.claim; })) return null;
  try {
    var prompt = text.prompt(sign, predictions, s, date, paused);
    var started = Date.now();
    var answer = String(require('lib/ai').ask({ role: 'horoscope.write', system: prompt.system, prompt: prompt.prompt }) || '').trim();
    if (!answer) return null;
    var verdict = text.accept(answer, predictions, s, date, (files.readJson('data/pet/settings.json', {}) || {}).banned);
    if (!verdict.ok) {
      console.warn('horoscope: текст модели не принят — ' + verdict.reason);
      return { rejected: verdict.reason };
    }
    return { text: answer, ms: Date.now() - started };
  } catch (error) {
    console.warn('horoscope: model: ' + error);
    return null;
  }
}

/** Makes the forecast of `date` (today): checks yesterday first. `force` makes it again. */
exports.make = function (date, force) {
  var s = settings();
  date = date || source.currentDay();
  var existing = readDay(date);
  if (existing && !force) return existing;
  exports.verify(dates.add(date, -1));
  var goals = source.goals();
  var from = dates.add(date, -Number(s.window || 56));
  var days = source.days(from, dates.add(date, -1));
  var today = source.today();
  var paused = source.paused(date) || (today && today.paused) || null;
  if (today && paused) today.paused = paused;
  var sign = exports.sign(date);
  var candidates = detectors.candidates({
    date: date, days: days, today: today, goals: goals,
    records: records(dates.start(from, goals.dayEndHour), Date.now()),
    places: places(), habits: habits(),
    extras: { achievements: achievementsClose(), rpg: rpgPace(), calendar: calendar(date, s), holiday: holiday(date, s), focus: focusInstalled() },
    settings: detectorSettings(s)
  });
  var recent = [];
  for (var i = 1; i <= s.noRepeat; i++) {
    var before = readDay(dates.add(date, -i));
    recent.push(before ? before.predictions.map(function (p) { return p.id; }) : []);
  }
  var chosen = detectors.pick(candidates, recent, detectorSettings(s));
  var predictions = chosen.map(function (p) {
    var words = text.describe(p, templates(), s, date, paused);
    return { id: p.id, detector: p.detector, kind: p.kind, tone: p.tone, claim: words.claim, facts: words.facts, source: words.source,
      check: p.check, confidence: Math.round(p.confidence * 100) / 100, hit: null };
  });
  var signShown = sign && sign.title ? signWords(sign) : null;
  var written = modelText(signShown, predictions, s, date, paused);
  var file = {
    date: date, sign: signShown ? { star: sign.star, house: sign.house, title: sign.title } : null, paused: paused,
    predictions: predictions,
    text: written && written.text ? written.text : text.compose(signShown, predictions, templates(), s, date, paused),
    from: written && written.text ? 'model' : 'template', model: written && written.text ? 'horoscope.write' : null,
    rejected: written && written.rejected ? written.rejected : null, ms: written && written.ms ? written.ms : null, made: Date.now(),
    pet: petReader(s)
  };
  writeDay(file);
  prune(date, s);
  if (s.notify && !force) {
    var first = predictions.filter(function (p) { return p.id !== 'calm'; })[0];
    try { axiko.notify({ title: 'Звёзды на сегодня', text: first ? first.claim : text.first(file.text), open: SCREEN }); } catch (error) { /* no notification */ }
  }
  try { axiko.widget.refresh('horoscope'); } catch (error) { /* no widget */ }
  try { emit('horoscope.changed', { date: date }); } catch (error) { /* no screens */ }
  return file;
};

function prune(date, s) {
  var oldest = dates.add(date, -Number(s.keepDays || 365));
  try {
    (files.list ? files.list(DIR + 'days') : []).forEach(function (name) {
      var match = /(\d{4}-\d{2}-\d{2})\.json$/.exec(String(name));
      if (match && dates.diff(match[1], oldest) < 0) files.remove(DIR + 'days/' + match[1] + '.json');
    });
  } catch (error) {
    console.warn('horoscope: prune: ' + error);
  }
}

/** Today's forecast (made now if the morning job has not run yet) — for the agent and a morning summary. */
exports.today = function () {
  return exports.make(null, false);
};

/** «Вчера сбылось 2 из 3». */
function yesterdayOf(date) {
  var file = exports.verify(dates.add(date, -1));
  if (!file) return null;
  var checked = file.predictions.filter(function (p) { return p.hit === true || p.hit === false; });
  return {
    date: file.date, hits: checked.filter(function (p) { return p.hit; }).length, checked: checked.length, total: file.predictions.length,
    predictions: file.predictions.map(function (p) { return { claim: p.claim, hit: p.hit }; })
  };
}

exports.view = function () {
  var s = settings();
  var file = exports.today();
  var date = file.date;
  // Verify yesterday first: the accuracy below must count what was just checked.
  var yesterday = yesterdayOf(date);
  var month = lastFiles(date, 30);
  var sign = exports.sign(date);
  var all = stars();
  var star = all.filter(function (one) { return one.id === sign.star; })[0] || null;
  var house = all.filter(function (one) { return one.id === sign.house; })[0] || null;
  return {
    today: file, yesterday: yesterday,
    accuracy: detectors.accuracy(month), weeks: detectors.byWeeks(lastFiles(date, 56), 8, date),
    archive: lastFiles(dates.add(date, -1), 30).reverse().map(function (f) {
      var checked = f.predictions.filter(function (p) { return p.hit === true || p.hit === false; });
      return { date: f.date, sign: f.sign ? f.sign.title : null, first: f.predictions[0] && f.predictions[0].claim ? f.predictions[0].claim : text.first(f.text), hits: checked.filter(function (p) { return p.hit; }).length, checked: checked.length };
    }),
    sign: { week: sign.week, title: sign.title, star: star, house: house },
    source: source.kind(), settings: s, defaults: Object.assign({}, detectors.DEFAULTS, detectorSettings(clone(DEFAULTS))),
    wallpaper: links.wallpaper(s.wallpaper ? source.module('wallpapers') : null, { on: s.wallpaper })
  };
};

exports.day = function (date) {
  return readDay(date);
};

exports.widget = function () {
  var file = exports.today();
  var lines = ['Звёзды на ' + dates.weekdayName(dates.weekday(file.date), 'acc')];
  var first = file.predictions.filter(function (p) { return p.id !== 'calm'; })[0];
  lines.push(first ? first.claim : text.first(file.text));
  var y = yesterdayOf(file.date);
  if (y && y.checked) lines.push('вчера сбылось ' + y.hits + ' из ' + y.checked);
  return { title: 'Гороскоп', text: lines.join('\n'), open: SCREEN };
};

/** What the screen's «прочитать вслух» says, and how (the role tts or the local voice). */
exports.speech = function () {
  var s = settings();
  return { text: fullText(exports.today()), voice: s.voice === 'local' ? 'local' : null };
};

/** Asks Android for the calendar once; on yes, turns the calendar detector on. */
exports.askCalendar = function () {
  var granted = false;
  try { granted = Boolean(axiko.permission(['READ_CALENDAR'])); } catch (error) { granted = false; }
  if (granted) exports.saveSettings({ calendar: true });
  return granted;
};

exports.settings = function () {
  return settings();
};

exports.saveSettings = function (patch) {
  var saved = files.readJson(DIR + 'settings.json', {}) || {};
  merge(saved, patch || {});
  var check = merge(clone(DEFAULTS), saved);
  if (!(check.k >= 1 && check.n >= check.k)) throw new Error('Нужно 1 ≤ k ≤ n');
  if (['soft', 'sharp'].indexOf(check.tone) < 0) throw new Error('Тон: soft или sharp');
  if (!/^\d{1,2}:\d{2}$/.test(check.at)) throw new Error('Время прогноза — ЧЧ:ММ');
  files.writeJson(DIR + 'settings.json', saved);
  schedule();
  return settings();
};

// ---- the agent's tool -------------------------------------------------------------------------

var TOOL = [
  '// Written by modules/horoscope on start: the ready forecast for the agents.',
  "exports.name = 'horoscope_today';",
  "exports.description = 'Гороскоп по данным владельца: готовый текст на сегодня (читай его как есть, не сочиняй новый), знак недели и сбылось ли вчера. what: today | sign | yesterday.';",
  "exports.parameters = { type: 'object', properties: { what: { type: 'string', enum: ['today', 'sign', 'yesterday'] } } };",
  'exports.run = function (args) {',
  "  if (!require('lib/axiko').files.exists('modules/horoscope/main.js')) return 'Модуль «Гороскоп по данным» не установлен';",
  "  return require('modules/horoscope/main.js').tool(args || {});",
  '};',
  ''
].join('\n');

exports.tool = function (args) {
  var file = exports.today();
  var y = yesterdayOf(file.date);
  var yesterday = y ? (y.checked ? 'Вчера сбылось ' + y.hits + ' из ' + y.checked + '.' : 'Вчерашний прогноз проверить не по чему.') : 'Вчера прогноза не было.';
  if (args.what === 'sign') return file.sign ? 'Знак недели: ' + file.sign.title + '.' : 'Знак недели пока не сложился: мало данных.';
  if (args.what === 'yesterday') return { text: yesterday, predictions: y ? y.predictions : [] };
  var acc = detectors.accuracy(lastFiles(file.date, 30));
  return { text: fullText(file), sign: file.sign ? file.sign.title : null, yesterday: yesterday, accuracy: acc.pct === null ? null : acc.pct + '%' };
};

// ---- start ----------------------------------------------------------------------------------

function schedule() {
  var s = settings();
  job('horoscope:day', { at: s.at }, function () {
    try { exports.make(null, false); } catch (error) { console.error('horoscope: day: ' + error); }
  });
}

exports.start = function () {
  if (!files.exists(DIR + 'settings.json')) files.writeJson(DIR + 'settings.json', {});
  schedule();
  source.tool('horoscope_today.js', TOOL);
  return true;
};
