// «Сериал на ночь»: every evening a new episode of an interactive story by voice. The owner is the
// hero, real details of his day are woven into the plot, he chooses by voice at two forks and may
// fall asleep in the middle. The episode is written in advance (prepareAt, role series.write), checked
// by the engine, recorded with the quiet cloud voice on Wi-Fi; at remindAt a notification says it is
// ready. The voice loop, saving and recording are the shared «Голосовой движок историй» of
// voice-adventure (modules/voice-adventure/story-engine/).
//
// Data (data/series/):
//   settings.json            the owner's changes of the settings (schema.js)
//   index.json               {current, seasons: [{id, title, genre, tone, minutes, episodes, written, listened, …}]}
//   <season>/bible.json      the season's bible; summaries.json — [{episode, title, summary, ending}]
//   <season>/e<N>.json       the episode's graph, the given details, `played` (choices, asleepAt)
//   <season>/e<N>/audio/     recorded scenes
//   state.json               the episode and the scene being played (+ state.prev.json)
//   stats.json, log.json
var axiko = require('lib/axiko');
var files = axiko.files;

var HOME = 'modules/bedtime-series';
var SCREEN = HOME + '/ui/index.html';
var ENGINE = 'modules/voice-adventure/story-engine/';
var DATA = 'data/series';
var SETTINGS = DATA + '/settings.json';
var INDEX = DATA + '/index.json';
var STATS = DATA + '/stats.json';
var LOG = DATA + '/log.json';
var OUTBOX = 'data/games/achievements-outbox.json';
var SESSION = 'series';
var NOTICE_ID = 'series-ready';
var AGENT = 'storyteller';
var NO_ENGINE = 'Нет голосового движка историй: установите из магазина «Текстовое приключение для дороги» (voice-adventure)';
var SYSTEM = 'Ты автор вечернего аудиосериала на русском языке. Отвечаешь только JSON по схеме из задания.';

var GENRES = [
  { id: 'fairy', title: 'Сказка для взрослых', brief: 'сказка для взрослых: волшебное рядом с обычной жизнью, мягкий юмор, добрые чудеса' },
  { id: 'detective', title: 'Тихий детектив', brief: 'тихий детектив: маленькие загадки без крови и угроз, наблюдательность, уютные улики' },
  { id: 'sea', title: 'Морское путешествие', brief: 'морское путешествие: корабль, острова, порты, ночные вахты под звёздами' },
  { id: 'city', title: 'Городская мистика', brief: 'тихая городская мистика: мосты, дворы, трамваи, город, который ночью живёт по-другому' },
  { id: 'custom', title: 'Своё', brief: '' }
];

var TONES = [
  { id: 'warm', title: 'Тёплый' },
  { id: 'funny', title: 'С юмором' },
  { id: 'dreamy', title: 'Мечтательный' },
  { id: 'mystery', title: 'Загадочный' }
];

var ASK_OPTIONS = [
  { label: 'продолжим', keywords: ['продолжим', 'продолжить', 'продолжай', 'продолжаем', 'оттуда', 'старую', 'прошлую', 'вчерашнюю', 'дальше'] },
  { label: 'новую', keywords: ['новую', 'новая', 'новой', 'нового', 'заново', 'следующую', 'следующая', 'сегодняшнюю'] }
];

// The engine's parts are loaded on first use: without voice-adventure the module still answers why.
var words, branch, lines, settingsLib, phone, store, audio, voice, graph, details, links, prompts, plan, schema;
var loaded = false;

function engineInstalled() {
  try {
    return files.exists(ENGINE + 'voice.js');
  } catch (error) {
    return false;
  }
}

function load() {
  if (loaded) return;
  if (!engineInstalled()) throw new Error(NO_ENGINE);
  words = require(ENGINE + 'words.js');
  branch = require(ENGINE + 'branch.js');
  lines = require(ENGINE + 'lines.js');
  settingsLib = require(ENGINE + 'settings.js');
  phone = require(ENGINE + 'phone.js');
  store = require(ENGINE + 'store.js');
  audio = require(ENGINE + 'audio.js');
  voice = require(ENGINE + 'voice.js');
  graph = require('./graph.js');
  details = require('./details.js');
  links = require('./links.js');
  prompts = require('./prompt.js');
  plan = require('./plan.js');
  schema = require('./schema.js');
  loaded = true;
}

// What lives between calls: the module file may be reread while an episode is being written.
var G = typeof global !== 'undefined' ? global : (function () { return this; })();
var REG = G.__bedtimeSeries || (G.__bedtimeSeries = {});
REG.indexLock = REG.indexLock || new java.util.concurrent.locks.ReentrantLock();
REG.writeLock = REG.writeLock || new java.util.concurrent.locks.ReentrantLock();
if (REG.writing === undefined) REG.writing = null;
if (REG.rendering === undefined) REG.rendering = null;

function msg(error) {
  return String(error && error.message ? error.message : error);
}

// ---- settings ------------------------------------------------------------------------------------

function savedSettings() {
  var saved = files.readJson(SETTINGS, {});
  return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
}

function settings() {
  return settingsLib.values(schema.SCHEMA, savedSettings());
}

exports.settings = function () {
  load();
  return settings();
};

/** The settings for the screen: [{key, title, value, fallback, type, min, max, step, group, options}]. */
exports.settingsView = function () {
  load();
  return settingsLib.describe(schema.SCHEMA, savedSettings());
};

/** Changes settings: {key: value}; people may come as «Петя, мама». Only what differs from the defaults is kept. */
exports.saveSettings = function (patch) {
  load();
  var saved = savedSettings();
  Object.keys(patch || {}).forEach(function (key) {
    if (!schema.SCHEMA[key]) throw new Error('Нет такой настройки: ' + key);
    var value = patch[key];
    if (key === 'people') value = schema.peopleList(value);
    if (key === 'sources') value = schema.sourceList(value);
    saved[key] = settingsLib.coerce(schema.SCHEMA[key], value);
  });
  files.writeJson(SETTINGS, settingsLib.changes(schema.SCHEMA, saved));
  if (patch && (patch.prepareAt !== undefined || patch.remindAt !== undefined)) schedule();
  emitState('settings');
  return exports.settingsView();
};

// ---- seasons and episodes ------------------------------------------------------------------------

function readIndex() {
  var idx = store.readJson(INDEX, null);
  if (!idx || typeof idx !== 'object') idx = {};
  idx.seasons = Array.isArray(idx.seasons) ? idx.seasons : [];
  idx.current = idx.current || null;
  return idx;
}

/** Read, change and write the index under one lock (the voice loop and the writer both touch it). */
function updateIndex(fn) {
  REG.indexLock.lock();
  try {
    var idx = readIndex();
    var result = fn(idx);
    store.writeJson(INDEX, idx);
    return result === undefined ? idx : result;
  } finally {
    REG.indexLock.unlock();
  }
}

function seasonOf(idx, id) {
  for (var i = 0; i < idx.seasons.length; i++) if (idx.seasons[i].id === id) return idx.seasons[i];
  return null;
}

function updateSeason(id, fn) {
  return updateIndex(function (idx) {
    var season = seasonOf(idx, id);
    if (season) fn(season, idx);
  });
}

function currentSeason() {
  var idx = readIndex();
  return seasonOf(idx, idx.current);
}

function seasonDir(id) {
  if (!plan.validId(id)) throw new Error('Неверный сезон: ' + id);
  return DATA + '/' + id;
}

function episodePath(id, n) {
  return seasonDir(id) + '/e' + n + '.json';
}

function audioDir(id, n) {
  return seasonDir(id) + '/e' + n;
}

function readEpisode(id, n) {
  if (!n || n < 1) return null;
  return store.readJson(episodePath(id, n), null);
}

function genreOf(id) {
  return GENRES.filter(function (genre) { return genre.id === id; })[0] || null;
}

function toneOf(id) {
  return TONES.filter(function (tone) { return tone.id === id; })[0] || null;
}

function genreText(season) {
  if (season.genre === 'custom') return season.custom || 'на выбор автора';
  var genre = genreOf(season.genre);
  return genre ? genre.brief : 'на выбор автора';
}

function toneText(season) {
  var tone = toneOf(season.tone);
  return tone ? tone.title.toLowerCase() : 'тёплый';
}

function readState() {
  var state = store.loadState(DATA);
  return state && typeof state === 'object' && state.story === 'series' ? state : null;
}

function readStats() {
  var stats = files.readJson(STATS, {});
  if (!stats || typeof stats !== 'object') stats = {};
  ['episodes', 'sessions', 'minutes', 'asleep', 'seasons'].forEach(function (key) { stats[key] = Number(stats[key]) || 0; });
  stats.granted = Array.isArray(stats.granted) ? stats.granted : [];
  return stats;
}

function log(text) {
  try {
    var list = files.readJson(LOG, []);
    if (!Array.isArray(list)) list = [];
    list.push({ at: Date.now(), text: String(text) });
    files.writeJson(LOG, list.slice(-200));
  } catch (error) {
    console.warn('bedtime-series: журнал: ' + error);
  }
}

/** The series' journal, newest first: [{at, text}]. */
exports.log = function (limit) {
  var list = files.readJson(LOG, []);
  return (Array.isArray(list) ? list : []).slice(-(Number(limit) || 50)).reverse();
};

function emitState(phase, extra) {
  var data = { phase: phase, writing: REG.writing, rendering: REG.rendering };
  Object.keys(extra || {}).forEach(function (key) { data[key] = extra[key]; });
  try { emit('series.state', data); } catch (error) { /* no screens */ }
  if (phase === 'written' || phase === 'ended' || phase === 'seasons') {
    try { axiko.widget.refresh('bedtime-series'); } catch (error) { /* no widget */ }
  }
}

// ---- the day's details (only allowed sources and people) ---------------------------------------------

function hasPermission(name) {
  try {
    return Number(context.checkSelfPermission('android.permission.' + name)) === 0;
  } catch (error) {
    return false;
  }
}

function calendarRows(from, to) {
  if (!hasPermission('READ_CALENDAR')) return [];
  try {
    return axiko.rows('content://com.android.calendar/instances/when/' + from + '/' + to,
      ['title', 'begin', 'end', 'allDay'], null, null, 'begin asc', 50) || [];
  } catch (error) {
    log('Календарь не прочитался: ' + msg(error));
    return [];
  }
}

/** Names of the contacts — only to cut them out of the details here; they go nowhere. */
function contactNames() {
  if (!hasPermission('READ_CONTACTS')) return [];
  try {
    return (axiko.rows('content://com.android.contacts/contacts', ['display_name'], null, null, null, 3000) || [])
      .map(function (row) { return row.display_name ? String(row.display_name) : ''; }).filter(Boolean);
  } catch (error) {
    return [];
  }
}

function dayDetails(s, time) {
  var since = plan.midnight(time);
  var sources = schema.sourceList(s.sources);
  var kinds = details.kindsOf(sources);
  var records = [];
  if (kinds.length) {
    try {
      records = require('lib/base').find({ kinds: kinds, since: since, limit: 100 }) || [];
    } catch (error) {
      log('Общая база не прочиталась: ' + msg(error));
    }
  }
  var calendar = sources.indexOf('calendar') >= 0 ? calendarRows(since, since + plan.DAY) : [];
  // The neighbours (Праздники, Шляпа, RPG, Диктофон, Входящие, Гороскоп, Питомец, Рисуй — угадаю): each optional.
  var near = links.gather({ sources: sources, since: since, day: plan.dayOf(time), now: time });
  if (near.notes.length) log('Соседи не ответили: ' + near.notes.join('; '));
  return details.collect({
    calendar: calendar, records: records, events: near.events, links: near.links, since: since, sources: sources,
    people: schema.peopleList(s.people), known: contactNames(), max: s['details.max'], perSource: s['details.perSource'],
    chars: s['details.chars'], names: s['details.names']
  });
}

/** Tonight's details as the model would get them (the screen shows them before anything is sent). */
exports.preview = function () {
  load();
  var s = settings();
  var got = dayDetails(s, Date.now());
  return { details: got.details, removed: got.removed.length, sources: schema.sourceList(s.sources), people: schema.peopleList(s.people) };
};

// ---- writing an episode (role series.write) ------------------------------------------------------------

function askModel(role, messages, extra) {
  var body = { messages: messages };
  Object.keys(extra || {}).forEach(function (key) { body[key] = extra[key]; });
  var response = require('lib/ai').complete(role, body);
  var message = response && response.choices && response.choices[0] && response.choices[0].message;
  var text = message ? message.content : '';
  if (typeof text !== 'string') text = (text || []).map(function (part) { return part.text || ''; }).join('');
  return String(text || '');
}

/**
 * Writes episode n: the prompt with the bible, the last recaps, tonight's details, the last
 * choices; the engine's check; the errors back to the model up to fixTries times.
 */
function writeEpisode(seasonId, n, collected) {
  var s = settings();
  var season = seasonOf(readIndex(), seasonId);
  if (!season) throw new Error('Нет сезона ' + seasonId);
  var dir = seasonDir(seasonId);
  var bible = store.readJson(dir + '/bible.json', {}) || {};
  var summaries = store.readJson(dir + '/summaries.json', []) || [];
  var prev = n > 1 ? readEpisode(seasonId, n - 1) : null;
  var limits = schema.episodeLimits(s, season.minutes);
  var given = collected.details.map(function (detail) { return detail.text; });
  var input = {
    season: { title: season.titleAuto ? '' : season.title, genre: genreText(season), tone: toneText(season), length: season.minutes || 10 },
    bible: bible, summaries: summaries, details: details.format(collected.details), occasion: details.occasionLine(collected.details),
    lastChoices: prev && prev.played ? prompts.choicesText(prev, prev.played) : '', number: n, total: season.episodes
  };
  var messages = [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: prompts.episodePrompt(files.read(HOME + '/prompts/episode.md'), input, limits) }
  ];
  var check = {
    sceneMin: limits.sceneMin, sceneMax: limits.sceneMax, branchMin: limits.branchMin, branchMax: limits.branchMax,
    asleepMax: limits.asleepMax, questionMax: limits.questionMax, details: given, forbidden: collected.removed
  };
  var started = Date.now();
  var text = '';
  var raw = null;
  var errors = ['нет ответа'];
  for (var attempt = 0; attempt <= s.fixTries; attempt++) {
    REG.writing = { season: seasonId, episode: n, attempt: attempt + 1, since: started };
    emitState('writing');
    if (attempt > 0) {
      if (text) messages.push({ role: 'assistant', content: text });
      messages.push({ role: 'user', content: prompts.fixPrompt(errors) });
    }
    text = askModel('series.write', messages, { response_format: { type: 'json_object' } });
    try {
      raw = prompts.parseJson(text);
    } catch (error) {
      errors = ['Ответ не разобрался как JSON (' + msg(error) + '). Пришли только JSON, без пояснений.'];
      log('Серия ' + n + ': ответ не JSON');
      continue;
    }
    errors = graph.validate(raw, check);
    if (!errors.length) break;
    log('Серия ' + n + ': проверка не прошла (' + errors.length + '): ' + errors.slice(0, 3).join('; '));
  }
  if (errors.length) throw new Error('Серия ' + n + ' не прошла проверку: ' + errors.slice(0, 3).join('; '));
  var ep = keepEpisode(seasonId, n, raw, given);
  log('Серия ' + n + ' «' + ep.title + '» готова за ' + Math.round((Date.now() - started) / 1000) + ' с; деталей дня ' +
    given.length + ', взято ' + ep.usedDetails.length + (collected.removed.length ? ', скрыто имён ' + collected.removed.length : ''));
  return ep;
}

/** Keeps a checked episode: its file, the bible with its updates, the recap, the season's counters. */
function keepEpisode(seasonId, n, raw, given) {
  var dir = seasonDir(seasonId);
  var bible = store.readJson(dir + '/bible.json', {}) || {};
  var summaries = store.readJson(dir + '/summaries.json', []) || [];
  var ep = graph.normalize(raw);
  ep.number = n;
  ep.writtenAt = Date.now();
  ep.given = given || [];
  ep.bibleUpdates = raw.bibleUpdates && typeof raw.bibleUpdates === 'object' ? raw.bibleUpdates : null;
  delete ep.played;
  store.writeJson(episodePath(seasonId, n), ep);
  bible = prompts.mergeBible(bible, raw.bibleUpdates);
  store.writeJson(dir + '/bible.json', bible);
  summaries = summaries.filter(function (entry) { return entry.episode !== n; });
  summaries.push({ episode: n, title: ep.title, summary: ep.summary, ending: ep.ending });
  summaries.sort(function (a, b) { return a.episode - b.episode; });
  store.writeJson(dir + '/summaries.json', summaries);

  var today = plan.dayOf(Date.now());
  updateSeason(seasonId, function (p) {
    p.written = Math.max(p.written || 0, n);
    p.titles = p.titles || {};
    p.titles[n] = ep.title;
    p.preparedOn = today;
    if (p.titleAuto && bible.title) {
      p.title = words.clip(String(bible.title), 60);
      p.titleAuto = false;
    }
    delete p.lastError;
    delete p.lastErrorAt;
  });
  emitState('written', { season: seasonId, episode: n });
  return ep;
}

/**
 * The picture of the episode in strokes by «Рисуй — угадаю» (its role draw.paint), when the setting
 * art.on is on and the module is installed: kept in the episode file as `art` {word, strokes, at}, the
 * screen draws it. Without the module or the model the episode simply has no picture.
 */
function illustrate(seasonId, n) {
  if (!settings()['art.on']) return null;
  var ep = readEpisode(seasonId, n);
  if (!ep || ep.art) return null;
  var got = null;
  try {
    got = links.paint(ep.title || '');
  } catch (error) {
    got = { error: msg(error) };
  }
  if (got.error) {
    log('Рисунок к серии ' + n + ' не сделан: ' + got.error);
    return null;
  }
  ep = readEpisode(seasonId, n) || ep;
  ep.art = { word: got.word, strokes: got.strokes, at: Date.now() };
  store.writeJson(episodePath(seasonId, n), ep);
  log('Рисунок к серии ' + n + ': штрихов ' + got.strokes.length);
  emitState('art', { season: seasonId, episode: n });
  return ep.art;
}

/** The next try after a failure, while it is still before remindAt (an exact alarm when the shell has job.once). */
function scheduleRetry() {
  var s = settings();
  var at = plan.retryAt(Date.now(), s.retryEveryMin, s.prepareAt, s.remindAt);
  if (!at) return null;
  if (phone.has('job.once')) job('series:retry', { once: at }, retryJob);
  else job('series:retry', { every: s.retryEveryMin }, retryJob);
  return at;
}

function retryJob() {
  var s = settings();
  if (!plan.inWindow(Date.now(), s.prepareAt, s.remindAt)) {
    try { unjob('series:retry'); } catch (error) { /* already gone */ }
    return;
  }
  background('retry');
}

/**
 * Writes tonight's episode if one is due: in the evening window [prepareAt, remindAt), once a day,
 * when the last written one is already started. force (the button «Написать сейчас», a new
 * season) — any time, even if today's is written. Returns {written, title} | {skipped} | {error}.
 */
exports.prepare = function (reason, force) {
  load();
  var s = settings();
  var season = currentSeason();
  var now = Date.now();
  if (!season) return { skipped: 'нет сезона' };
  if (!force && !plan.inWindow(now, s.prepareAt, s.remindAt)) return { skipped: 'не время: серия готовится с ' + s.prepareAt + ' до ' + s.remindAt };
  var need = plan.writeNeed(season, readState(), plan.dayOf(now), !!force);
  if (!need.need) return { skipped: need.why };
  var can = phone.model('series.write');
  if (!can.ok) {
    updateSeason(season.id, function (p) {
      p.lastError = can.why;
      p.lastErrorAt = now;
    });
    var retry = force ? null : scheduleRetry();
    log('Серия ' + need.number + ' не пишется: ' + can.why + (retry ? ', попробую снова' : ''));
    return { skipped: can.why, retry: retry };
  }
  if (!REG.writeLock.tryLock()) return { busy: true };
  var ep = null;
  try {
    ep = writeEpisode(season.id, need.number, dayDetails(s, now));
  } catch (failure) {
    var error = msg(failure);
    updateSeason(season.id, function (p) {
      p.lastError = error;
      p.lastErrorAt = Date.now();
    });
    log('Не удалось написать серию ' + need.number + (reason ? ' (' + reason + ')' : '') + ': ' + error);
    emitState('failed', { error: error });
    if (!force) scheduleRetry();
    return { error: error };
  } finally {
    REG.writing = null;
    REG.writeLock.unlock();
  }
  try { unjob('series:retry'); } catch (error) { /* none */ }
  illustrate(season.id, need.number);
  // Written after the reminder went out («Сегодня без новой серии»): tell now.
  var fresh = currentSeason();
  if (fresh && fresh.remindedOn === plan.dayOf(now) && s.remind) {
    try { exports.remind(); } catch (error) { log('Напоминание: ' + msg(error)); }
  }
  return { written: need.number, title: ep.title };
};

// ---- the quiet cloud voice recorded in advance ---------------------------------------------------------

/** Records the episode to be played (and the next one, when he is asked «продолжим или новую?»). */
exports.prerenderNow = function (force) {
  load();
  var s = settings();
  if (!force && !s['audio.prerender']) return { skipped: 'запись заранее выключена' };
  if (s['voice.mode'] === 'local') return { skipped: 'выбран голос телефона' };
  var season = currentSeason();
  if (!season) return { skipped: 'нет сезона' };
  var p = plan.toPlay(season, readState(), Date.now(), s.continueDays);
  if (!p.episode) return { skipped: 'нечего записывать' };
  if (!phone.online()) return { skipped: 'нет сети' };
  if (REG.rendering && Date.now() - REG.rendering.since < 30 * 60000) return { busy: true };
  var numbers = [p.episode];
  if (p.mode === 'ask' && (season.written || 0) > p.episode) numbers.push(p.episode + 1);
  REG.rendering = { season: season.id, episode: p.episode, since: Date.now() };
  emitState('audio');
  var total = { done: 0, skipped: 0, failed: 0, error: null, total: 0 };
  try {
    numbers.forEach(function (n) {
      var ep = readEpisode(season.id, n);
      if (!ep || total.error) return;
      var items = graph.texts(ep);
      var out = audio.prerender(audioDir(season.id, n), items, {
        style: s.voiceStyle, anyNetwork: !!force, anyPower: true, maxMb: s['audio.maxMb'], roots: [DATA], rate: s['audio.rate']
      });
      total.done += out.done;
      total.skipped += out.skipped;
      total.failed += out.failed;
      total.error = out.error;
      total.total += items.length;
    });
    log('Запись голоса: новых ' + total.done + ', уже было ' + total.skipped + (total.error ? ', ' + total.error : ''));
    return total;
  } finally {
    REG.rendering = null;
    emitState('audio');
  }
};

// ---- the evening reminder ----------------------------------------------------------------------------

/** At remindAt: «Серия 12 готова: „Ключ под мостом“», or «Сегодня без новой серии». */
exports.remind = function (force) {
  load();
  var s = settings();
  if (!s.remind && !force) return { send: false, why: 'напоминание выключено' };
  var season = currentSeason();
  if (!season) return { send: false, why: 'нет сезона' };
  var now = Date.now();
  var state = readState();
  var p = plan.toPlay(season, state, now, s.continueDays);
  var ep = p.episode ? readEpisode(season.id, p.episode) : null;
  var asleep = (p.mode === 'ask' || p.mode === 'continue') && ep && state && state.asleepAt;
  var today = plan.dayOf(now);
  var note = plan.reminder({
    play: p, title: ep ? ep.title : '', moment: asleep ? graph.momentOf(ep, state.asleepAt) : '',
    error: season.lastErrorAt && plan.dayOf(season.lastErrorAt) === today ? season.lastError : ''
  });
  updateSeason(season.id, function (x) { x.remindedOn = today; });
  if (!note.send) return note;
  var options = { id: NOTICE_ID, title: note.title, text: note.text, open: SCREEN, channel: 'normal' };
  if (note.ready && phone.has('notify.actions')) {
    options.actions = [{ title: 'Слушать', call: HOME + '/main.js', fn: 'listenFromNotice', args: {} }];
  }
  try {
    axiko.notify(options);
  } catch (error) {
    log('Уведомление не ушло: ' + msg(error));
  }
  return note;
};

/** The button «Слушать» of the reminder: the episode starts without opening the screen. */
exports.listenFromNotice = function () {
  try { axiko.notify.cancel(NOTICE_ID); } catch (error) { /* already gone */ }
  return exports.play({});
};

// ---- achievements and facts -------------------------------------------------------------------------

/** Into «Ачивки за жизнь» when it is installed; otherwise into the game hub's outbox. */
function grant(item) {
  var full = {
    key: item.key, source: 'series', category: 'Истории', title: item.title, text: item.text,
    at: Date.now(), hidden: false, icon: HOME + '/icon.svg'
  };
  try {
    if (files.exists('modules/achievements/main.js')) {
      var achievements = require('modules/achievements/main.js');
      if (typeof achievements.grant === 'function') {
        achievements.grant(full);
        return true;
      }
    }
  } catch (error) {
    console.warn('bedtime-series: ачивка: ' + error);
  }
  try {
    var box = files.readJson(OUTBOX, []);
    var list = Array.isArray(box) ? box : (box && Array.isArray(box.items) ? box.items : []);
    if (!list.some(function (one) { return one && one.key === full.key; })) list.push(full);
    if (Array.isArray(box) || !box || typeof box !== 'object') files.writeJson(OUTBOX, list);
    else {
      box.items = list;
      files.writeJson(OUTBOX, box);
    }
    return true;
  } catch (error) {
    console.warn('bedtime-series: ящик ачивок: ' + error);
    return false;
  }
}

/** The choices of a session go into the episode file: the next episode answers them. */
function writePlayed(seasonId, n, state) {
  var ep = readEpisode(seasonId, n);
  if (!ep) return;
  ep.played = {
    choices: state.choices || {}, defaults: state.defaults || {}, asleepAt: state.asleepAt || null,
    done: !!state.done, at: Date.now()
  };
  store.writeJson(episodePath(seasonId, n), ep);
}

/** An asleep episode left for a new one: it counts as heard. */
function markHeard(seasonId, n) {
  updateSeason(seasonId, function (p) { p.listened = Math.max(p.listened || 0, n); });
}

function seasonFinished(seasonId) {
  var stats = readStats();
  stats.seasons++;
  if (stats.granted.indexOf('stories/series/season-done') < 0 &&
    grant({ key: 'stories/series/season-done', title: 'Досмотрел сезон', text: 'Все серии сезона «Сериала на ночь» до конца' })) {
    stats.granted.push('stories/series/season-done');
  }
  files.writeJson(STATS, stats);
  updateSeason(seasonId, function (p) { p.finishedAt = Date.now(); });
  log('Сезон досмотрен');
}

function recordStory(n, minutes, state, finished) {
  var asleep = !!state.asleepAt;
  if (minutes < 1 && !asleep) return;
  try {
    require('lib/base').add({
      kind: 'story', at: asleep && state.asleepTime ? state.asleepTime : Date.now(),
      title: 'Сериал: серия ' + n, amount: minutes, unit: 'min', source: 'series',
      data: {
        asleep: asleep, asleepScene: asleep ? graph.sceneNumber(state.asleepAt) : null, done: !!finished,
        season: state.season, episode: n
      }
    });
  } catch (error) {
    console.warn('bedtime-series: base.add: ' + error);
  }
}

// ---- the episode as a driver of the voice loop ---------------------------------------------------------

/**
 * pick — plan.toPlay(): {mode: 'new' | 'resume' | 'continue' | 'ask', episode, node, skipped, note}.
 * options.quiet — for checks: no facts, no achievements, the season's counters stay.
 */
function seriesDriver(seasonId, pick, options) {
  var quiet = !!(options && options.quiet);
  var s = settings();
  var season = null;
  var ep = null;
  var n = 0;
  var state = null;
  var known = [];
  var fades = {};
  var mode = 'play';   // play | ask («продолжим оттуда или новую?»)
  var askHeard = 0;
  var askSilent = 0;

  var d = {
    id: SESSION, title: 'Сериал на ночь', screen: SCREEN,
    pauseLine: 'Пауза. Чтобы продолжить, нажмите «Говорить» или кнопку на гарнитуре.'
  };

  function fresh(number) {
    return {
      story: 'series', season: seasonId, episode: number, node: 's1', choices: {}, defaults: {}, asked: {}, unclear: {},
      missed: 0, firstMissed: null, firstMissedAt: null, asleepAt: null, asleepTime: null, slow: false, done: false,
      startedAt: Date.now()
    };
  }

  function open(number, keep) {
    var found = readEpisode(seasonId, number);
    if (!found) throw new Error('Серия ' + number + ' ещё не написана');
    ep = graph.normalize(found);
    ep.number = number;
    n = number;
    var saved = readState();
    state = keep && saved && saved.season === seasonId && saved.episode === number ? saved : fresh(number);
    ['choices', 'defaults', 'asked', 'unclear'].forEach(function (key) { if (!state[key] || typeof state[key] !== 'object') state[key] = {}; });
    known = s['voice.mode'] === 'local' ? [] : audio.known(audioDir(seasonId, n), graph.texts(ep));
    fades = graph.fade(s.fadeScenes, s.fadeTo);
    d.title = 'Сериал · серия ' + n;
  }

  /** A line of the narrator; recorded parts of it are played from their files. */
  function line(text, extra) {
    var out = { text: String(text || '').replace(/\s+/g, ' ').trim() };
    if (known.length) {
      var parts = lines.segments(out.text, known);
      if (parts.some(function (part) { return part.audio; })) out.parts = parts;
    }
    Object.keys(extra || {}).forEach(function (key) { out[key] = extra[key]; });
    return out;
  }

  function sceneLine(node, prefix) {
    var extra = { listen: false };
    var tail = !!fades[node];
    if (tail || state.slow) {
      extra.slow = true;
      extra.pauseMs = s.pauseMs;
    }
    if (tail) extra.fade = fades[node];
    if (node === 'final') {
      extra.end = true;
      extra.reason = 'done';
    }
    return line((prefix ? prefix + ' ' : '') + ep.scenes[node], extra);
  }

  function optionsText(fork) {
    var c = ep.choices[fork];
    return '«' + c.options[0].label + '» или «' + c.options[1].label + '»';
  }

  function questionLine(fork, prefix, extra) {
    var out = line((prefix ? prefix + ' ' : '') + ep.choices[fork].question, { listen: true, listenSec: s.choiceWaitSec });
    Object.keys(extra || {}).forEach(function (key) { out[key] = extra[key]; });
    if (state.slow) out.slow = true;
    return out;
  }

  function enter(node, prefix) {
    state.node = node;
    store.saveState(DATA, state);
    emitState('scene', { episode: n, node: node });
    if (graph.isFork(node)) {
      state.asked[node] = 0;
      state.unclear[node] = 0;
      return questionLine(node, prefix);
    }
    return sceneLine(node, prefix);
  }

  function pickBranch(fork, idx, prefix, byNarrator) {
    state.choices[fork] = idx;
    if (byNarrator) state.defaults[fork] = true;
    else delete state.defaults[fork];
    return enter(graph.next(fork, state.choices), prefix);
  }

  function header() {
    var out = [];
    if (!readStats().sessions && n === 1) {
      out.push('Это сериал на ночь. На развилках отвечайте голосом. Если промолчите, я выберу сам, а экран можно погасить.');
    }
    var title = season && !season.titleAuto ? season.title : '';
    out.push((title ? 'Сериал «' + title + '». ' : '') + 'Серия ' + n + (ep.title ? ': «' + ep.title + '».' : '.'));
    return out.join(' ');
  }

  function asleepLine() {
    state.asleepAt = state.firstMissed || state.node;
    state.asleepTime = state.firstMissedAt || Date.now();
    store.saveState(DATA, state);
    return line(ep.asleep, { listen: false, end: true, reason: 'asleep', slow: true, pauseMs: s.pauseMs, volume: s.fadeTo, noRepeat: true });
  }

  function missFork(fork) {
    state.missed = (state.missed || 0) + 1;
    if (state.missed === 1) {
      state.firstMissed = fork;
      state.firstMissedAt = Date.now();
    }
    state.slow = true;
  }

  function startContinue(prefix, missedAlready) {
    var fork = state.asleepAt || 'A';
    var at = state.asleepTime;
    state = plan.rewind(state, fork);
    if (missedAlready) {
      state.missed = 1;
      state.firstMissed = fork;
      state.firstMissedAt = at || Date.now();
      state.slow = true;
    }
    mode = 'play';
    return enter(state.node, (prefix ? prefix + ' ' : '') + 'Продолжаем серию ' + n + ' с того места, где вы уснули.');
  }

  function startNew() {
    var old = n;
    if (!readEpisode(seasonId, old + 1)) return startContinue('Новой серии пока нет.');
    writePlayed(seasonId, old, state);
    if (!quiet) markHeard(seasonId, old);
    open(old + 1, false);
    mode = 'play';
    return enter('s1', header());
  }

  function askLine(prefix, extra) {
    var moment = graph.momentOf(ep, state.asleepAt);
    var out = line((prefix ? prefix + ' ' : '') + plan.dayWord(state.asleepTime || state.savedAt || Date.now(), Date.now()) + ' вы уснули, ' +
      moment + '. Продолжим оттуда или начнём новую серию?', { listen: true, listenSec: s.choiceWaitSec });
    Object.keys(extra || {}).forEach(function (key) { out[key] = extra[key]; });
    return out;
  }

  function askAnswer(text) {
    var idx = branch.choose(text, ASK_OPTIONS);
    if (idx < 0 && branch.yesNo(text) === 'yes') idx = 0;
    if (idx === 1) return startNew();
    if (idx === 0) return startContinue('');
    askHeard++;
    if (askHeard < 2) return line('Не расслышал. Скажите «продолжим» или «новую».', { listen: true, listenSec: s.choiceWaitSec, noRepeat: true });
    return startContinue('Тогда продолжим.');
  }

  d.begin = function () {
    season = seasonOf(readIndex(), seasonId);
    if (!season) throw new Error('Нет сезона ' + seasonId);
    var p = pick || {};
    if (p.mode === 'ask') {
      open(p.episode, true);
      mode = 'ask';
      return askLine('');
    }
    if (p.mode === 'continue') {
      open(p.episode, true);
      return startContinue(p.note || '');
    }
    if (p.mode === 'resume') {
      open(p.episode, true);
      return enter(state.node || 's1', 'Продолжаем серию ' + n + '.');
    }
    if (p.skipped) {
      var skipped = readState();
      if (skipped && skipped.season === seasonId && skipped.episode === p.skipped) writePlayed(seasonId, p.skipped, skipped);
      if (!quiet) markHeard(seasonId, p.skipped);
    }
    open(p.episode || 1, false);
    return enter('s1', header());
  };

  d.next = function () {
    if (mode === 'ask' || !state) return null;
    var node = graph.next(state.node, state.choices);
    if (!node) return null;
    return enter(node);
  };

  d.answer = function (text, service) {
    if (mode === 'ask') {
      if (service === 'resume') return startContinue('');
      return askAnswer(text);
    }
    var node = state.node;
    // Spoken over a scene (the button «Говорить»): the scene goes on from its start.
    if (!graph.isFork(node)) return enter(node, 'Продолжаю.');
    var c = ep.choices[node];
    if (service === 'resume') return questionLine(node);
    if (service) return questionLine(node, 'Выберите: ' + optionsText(node) + '.');
    var idx = branch.choose(text, c.options);
    if (idx < 0) {
      state.unclear[node] = (state.unclear[node] || 0) + 1;
      if (state.unclear[node] < 2) {
        return line('Не расслышал. Какой вариант: ' + optionsText(node) + '?', { listen: true, listenSec: s.choiceWaitSec, noRepeat: true });
      }
      state.missed = 0;
      state.firstMissed = null;
      return pickBranch(node, c.calm, 'Пусть будет «' + c.options[c.calm].label + '».', true);
    }
    state.missed = 0;
    state.firstMissed = null;
    state.firstMissedAt = null;
    return pickBranch(node, idx, '', false);
  };

  /** Silence at a fork: the question again, quieter; then the calm branch; two missed forks — asleep. */
  d.silence = function (count, said) {
    if (mode === 'ask') {
      askSilent++;
      if (askSilent < 2) return askLine('', { volume: s.repeatVolume, slow: true });
      return startContinue('', true);
    }
    var node = state.node;
    // «Говорить» pressed over a scene and nothing said: the scene goes on.
    if (!graph.isFork(node)) return enter(node, 'Продолжаю.');
    var c = ep.choices[node];
    state.asked[node] = (state.asked[node] || 0) + 1;
    if (state.asked[node] < 2) return questionLine(node, '', { volume: s.repeatVolume, slow: true });
    missFork(node);
    if (state.missed >= s.missedForks) return asleepLine();
    return pickBranch(node, c.calm, 'Тогда выберу сам: «' + c.options[c.calm].label + '».', true);
  };

  d.resume = function () {
    if (mode === 'ask') return askLine('Продолжаем.');
    return enter(state.node, 'Продолжаем.');
  };

  d.save = function () {
    if (state) store.saveState(DATA, state);
  };

  d.end = function (reason, minutes) {
    if (!state) return;
    var finished = reason === 'done' && state.node === 'final' && mode === 'play';
    if (finished) state.done = true;
    store.saveState(DATA, state);
    writePlayed(seasonId, n, state);
    if (quiet) return;
    var stats = readStats();
    stats.sessions++;
    stats.minutes += minutes;
    if (finished) stats.episodes++;
    if (state.asleepAt) stats.asleep++;
    files.writeJson(STATS, stats);
    var last = false;
    updateSeason(seasonId, function (p) {
      p.lastPlayed = Date.now();
      if (finished) {
        p.listened = Math.max(p.listened || 0, n);
        last = p.listened >= (p.episodes || 12);
      }
    });
    if (last) seasonFinished(seasonId);
    recordStory(n, minutes, state, finished);
    log('Серия ' + n + ': ' + minutes + ' мин, ' + ({
      done: 'до конца', asleep: 'уснул на сцене ' + graph.sceneNumber(state.asleepAt), pause: 'пауза', stop: 'хватит',
      error: 'ошибка', replaced: 'другая история'
    }[reason] || reason));
    emitState('ended', { reason: reason, episode: n });
  };

  d.info = function () {
    if (!ep || !state) return { season: seasonId };
    return {
      season: seasonId, seasonTitle: season ? season.title : '', episode: n, title: ep.title || '', node: state.node,
      scene: graph.sceneNumber(state.node), mode: mode, missed: state.missed || 0, slow: !!state.slow, recorded: known.length
    };
  };

  d.goodbye = function () {
    return 'Сохранено. Спокойной ночи.';
  };

  return d;
}

// ---- the live mode: the storyteller agent leads the episode -----------------------------------------------

/** agents/storyteller/ from the module's templates (the owner's edits of system.md are kept). */
function installAgent() {
  var dir = 'agents/' + AGENT;
  if (!files.exists(dir + '/agent.json')) files.write(dir + '/agent.json', files.read(HOME + '/agent/storyteller/agent.json'));
  if (!files.exists(dir + '/system.md')) files.write(dir + '/system.md', files.read(HOME + '/agent/storyteller/system.md'));
  if (!files.exists(dir + '/icon.svg')) files.write(dir + '/icon.svg', files.read(HOME + '/icon.svg'));
}

function liveStatus() {
  try {
    var got = native('live.status');
    return got && typeof got === 'object' ? { active: !!got.active, state: got.state ? String(got.state) : '' } : { active: false };
  } catch (error) {
    return { active: false };
  }
}

/**
 * The episode in a live conversation with agents/storyteller: it can be interrupted by voice, but
 * there is no recorded voice and no promise of length. The brief goes into its memory.md.
 */
exports.live = function (pick) {
  load();
  var s = settings();
  var season = currentSeason();
  if (!season) return { ok: false, why: 'Сначала начните сезон' };
  var p = pick && pick.episode ? pick : plan.toPlay(season, readState(), Date.now(), s.continueDays);
  if (!p.mode) return { ok: false, why: p.why };
  if (!phone.online()) return { ok: false, why: 'Живому режиму нужна сеть' };
  if (!phone.speech().ready) return { ok: false, why: 'Распознавание речи на телефоне не готово — скачайте его в настройках голоса Axiko' };
  var number = p.mode === 'ask' && (season.written || 0) > p.episode ? p.episode + 1 : p.episode;
  var ep = readEpisode(season.id, number);
  if (!ep) return { ok: false, why: 'Серия ' + number + ' ещё не написана' };
  ep = graph.normalize(ep);
  ep.number = number;
  var bible = store.readJson(seasonDir(season.id) + '/bible.json', {}) || {};
  installAgent();
  files.write('agents/' + AGENT + '/memory.md', prompts.liveBrief({ title: season.title, tone: toneText(season) }, bible, ep));
  var thread = null;
  try { thread = native('agent.newThread', AGENT); } catch (error) { thread = null; }
  try { voice.stop(SESSION); } catch (error) { /* nothing runs */ }
  voice.speak('Живой режим. Скажите «начинай», и рассказчик начнёт серию ' + number + '. Перебить его можно голосом.');
  var ok = false;
  try {
    ok = !!native('live.start', AGENT, thread ? String(thread) : null);
  } catch (error) {
    return { ok: false, why: 'Живой разговор не начался: ' + msg(error) };
  }
  if (!ok) return { ok: false, why: 'Живой разговор не начался' };
  store.saveState(DATA, {
    story: 'series', season: season.id, episode: number, node: 'live', live: true, done: true, choices: {}, defaults: {},
    startedAt: Date.now()
  });
  markHeard(season.id, number);
  log('Серия ' + number + ': живой режим');
  emitState('live', { episode: number });
  return { ok: true, live: true, episode: number, thread: thread };
};

// ---- what the screen calls --------------------------------------------------------------------------------

function describeSeason(p) {
  var titles = p.titles || {};
  return {
    id: p.id, title: p.titleAuto ? 'Новый сезон' : p.title, genre: p.genre, genreTitle: (genreOf(p.genre) || {}).title || '',
    custom: p.custom || '', tone: p.tone, minutes: p.minutes || 10, episodes: p.episodes || 12, written: p.written || 0,
    listened: p.listened || 0, titles: titles, createdAt: p.createdAt || null, lastPlayed: p.lastPlayed || null,
    preparedOn: p.preparedOn || null, finishedAt: p.finishedAt || null,
    lastError: p.lastError || null, lastErrorAt: p.lastErrorAt || null
  };
}

/** Everything the screen draws. Without the engine: {engine: false, why}. */
exports.status = function () {
  if (!engineInstalled()) return { engine: false, why: NO_ENGINE };
  load();
  var s = settings();
  var idx = readIndex();
  var current = seasonOf(idx, idx.current);
  var state = readState();
  var next = current ? plan.toPlay(current, state, Date.now(), s.continueDays) : { why: 'Сначала начните сезон' };
  var ep = current && next.episode ? readEpisode(current.id, next.episode) : null;
  if (ep) {
    next.title = ep.title || '';
    if ((next.mode === 'ask' || next.mode === 'continue') && state && state.asleepAt) {
      next.moment = graph.momentOf(ep, state.asleepAt);
      next.asleepScene = graph.sceneNumber(state.asleepAt);
    }
    next.recorded = audio.known(audioDir(current.id, next.episode), graph.texts(ep)).length;
    next.texts = graph.texts(ep).length;
    if (ep.art && Array.isArray(ep.art.strokes) && ep.art.strokes.length) next.art = { strokes: ep.art.strokes, word: ep.art.word || '' };
  }
  var can = phone.model('series.write');
  var need = current ? plan.writeNeed(current, state, plan.dayOf(Date.now()), true) : { need: false };
  return {
    engine: true,
    season: current ? describeSeason(current) : null,
    seasons: idx.seasons.map(describeSeason).sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); }),
    next: next,
    canWrite: !!(need.need && can.ok && !REG.writing),
    voice: voice.state(SESSION),
    live: liveStatus(),
    writing: REG.writing,
    rendering: REG.rendering,
    speech: phone.speech(),
    online: phone.online(),
    write: can,
    features: phone.features(),
    permissions: { calendar: hasPermission('READ_CALENDAR'), contacts: hasPermission('READ_CONTACTS'), microphone: hasPermission('RECORD_AUDIO') },
    schedule: { prepareAt: s.prepareAt, remindAt: s.remindAt, remind: s.remind },
    liveMode: !!s.live,
    genres: GENRES.map(function (genre) { return { id: genre.id, title: genre.title }; }),
    tones: TONES,
    episodesPerSeason: s.seasonEpisodes,
    audioMb: audio.usage([DATA]),
    stats: readStats()
  };
};

/**
 * A new season: {genre: 'fairy' | 'detective' | 'sea' | 'city' | 'custom', custom: 'о чём', tone:
 * 'warm' | 'funny' | 'dreamy' | 'mystery', minutes: 10 | 15}. The first episode is written right away
 * in the background (event series.state) when the model can answer. quiet — nothing is written (checks).
 */
exports.startSeason = function (options) {
  load();
  options = options || {};
  var s = settings();
  var genre = genreOf(options.genre) ? options.genre : 'custom';
  var custom = String(options.custom || '').replace(/\s+/g, ' ').trim().slice(0, 300);
  var tone = toneOf(options.tone) ? options.tone : 'warm';
  var minutes = Number(options.minutes) >= 15 ? 15 : 10;
  var now = Date.now();
  var idx = readIndex();
  var id = plan.seasonId(now);
  for (var k = 2; seasonOf(idx, id); k++) id = plan.seasonId(now) + '-' + k;
  var season = {
    id: id, title: 'Новый сезон', titleAuto: true, genre: genre, custom: custom, tone: tone, minutes: minutes,
    episodes: s.seasonEpisodes, createdAt: now, written: 0, listened: 0, titles: {}
  };
  store.writeJson(seasonDir(id) + '/bible.json', { genre: genreText(season), tone: toneText(season) });
  store.writeJson(seasonDir(id) + '/summaries.json', []);
  updateIndex(function (i) {
    i.seasons.push(season);
    i.current = id;
  });
  log('Новый сезон: ' + ((genreOf(genre) || {}).title || genre) + (custom ? ' — ' + custom : '') + ', ' + toneText(season) + ', ' + minutes + ' мин');
  emitState('seasons', { season: id });
  if (options.quiet) return { ok: true, season: id };
  var can = phone.model('series.write');
  if (!can.ok) {
    return { ok: false, season: id, why: 'Первую серию сейчас не написать: ' + can.why + '. Она напишется сама в ' + s.prepareAt + ', когда будет сеть.' };
  }
  spawn(function () {
    try {
      var out = exports.prepare('season', true);
      if (out.error) emitState('failed', { season: id, error: out.error });
      else if (out.written) background('after-season');
    } catch (error) {
      log('Первая серия: ' + msg(error));
      emitState('failed', { season: id, error: msg(error) });
    }
  });
  return { ok: true, season: id, writing: true };
};

/** Makes another season the current one. */
exports.selectSeason = function (id) {
  load();
  updateIndex(function (idx) {
    if (!seasonOf(idx, id)) throw new Error('Нет сезона ' + id);
    idx.current = id;
  });
  emitState('seasons', { season: id });
  return exports.status();
};

/** Removes a season with its episodes and recordings. */
exports.removeSeason = function (id) {
  load();
  var running = voice.state(SESSION);
  if (running.running && running.info && running.info.season === id) {
    voice.stop(SESSION);
    for (var i = 0; i < 30 && voice.state(SESSION).running; i++) sleep(100);
  }
  store.removeDir(seasonDir(id));
  var state = readState();
  if (state && state.season === id) store.writeJson(DATA + '/state.json', {});
  updateIndex(function (idx) {
    idx.seasons = idx.seasons.filter(function (p) { return p.id !== id; });
    if (idx.current === id) {
      var left = idx.seasons.slice().sort(function (a, b) { return (b.lastPlayed || b.createdAt || 0) - (a.lastPlayed || a.createdAt || 0); });
      idx.current = left.length ? left[0].id : null;
    }
  });
  log('Сезон удалён: ' + id);
  emitState('seasons');
  return exports.status();
};

/** The recaps of the heard episodes of the current season (no spoilers of what is not heard yet). */
exports.recaps = function () {
  load();
  var season = currentSeason();
  if (!season) return { season: null, items: [] };
  var summaries = store.readJson(seasonDir(season.id) + '/summaries.json', []) || [];
  var state = readState();
  var heard = season.listened || 0;
  if (state && state.season === season.id && state.episode > heard) heard = state.episode;
  return {
    season: season.titleAuto ? 'Новый сезон' : season.title,
    items: summaries.filter(function (entry) { return entry.episode <= heard; }).map(function (entry) {
      return { episode: entry.episode, title: entry.title || '', summary: entry.summary || '' };
    }).reverse()
  };
};

/** The recaps of the last episodes aloud (eyes-free), in the background. */
exports.sayRecaps = function (count) {
  load();
  var list = exports.recaps().items.slice(0, Number(count) || settings().recapEpisodes || 3).reverse();
  if (!list.length) return { ok: false, why: 'Пересказывать пока нечего' };
  var text = list.map(function (entry) {
    return 'Серия ' + entry.episode + (entry.title ? ', «' + entry.title + '»' : '') + '. ' + entry.summary.replace(/\s*\n\s*/g, ' ');
  }).join(' ');
  spawn(function () {
    try { voice.speak(text); } catch (error) { log('Пересказ вслух: ' + msg(error)); }
  });
  return { ok: true, episodes: list.length };
};

/**
 * Starts tonight's episode. options.from: 'continue' | 'new' — the answer to «продолжим или новую?»
 * given on the screen; without it the narrator asks by voice. With the live mode on, the storyteller
 * agent leads (options.recorded: true — the recorded voice anyway). {ok, why?, state?, mode, episode}.
 */
exports.play = function (options) {
  load();
  options = options || {};
  var s = settings();
  var season = currentSeason();
  if (!season) return { ok: false, why: 'Сначала начните сезон' };
  var p = plan.toPlay(season, readState(), Date.now(), s.continueDays, options.from);
  if (!p.mode) {
    var can = phone.model('series.write');
    var need = plan.writeNeed(season, readState(), plan.dayOf(Date.now()), true);
    return { ok: false, why: p.why + (need.need && can.ok ? '. Можно написать её сейчас.' : ''), canWrite: !!(need.need && can.ok), finished: !!p.finished };
  }
  if (s.live && !options.recorded) return exports.live(p);
  if (!axiko.permission(['RECORD_AUDIO'])) return { ok: false, why: 'Нужен доступ к микрофону: на развилках отвечают голосом' };
  if (!phone.speech().ready) return { ok: false, why: 'Распознавание речи на телефоне не готово — скачайте его в настройках голоса Axiko' };
  try { axiko.notify.cancel(NOTICE_ID); } catch (error) { /* none */ }
  var state = voice.run(seriesDriver(season.id, p), schema.voiceOptions(s));
  return { ok: true, state: state, mode: p.mode, episode: p.episode };
};

/** A command to the running episode: talk, release, repeat, pause, resume, stop, say (typed text). */
exports.command = function (cmd, text) {
  load();
  return voice.command(SESSION, cmd, text);
};

exports.stopPlay = function () {
  load();
  var live = liveStatus();
  if (live.active) {
    try { native('live.stop'); } catch (error) { /* already stopped */ }
  }
  return voice.stop(SESSION) || live.active;
};

/** The state of the voice session (the same as the event story.state). */
exports.voiceState = function () {
  load();
  return voice.state(SESSION);
};

/** Asks for a permission the series needs: 'READ_CALENDAR' | 'READ_CONTACTS' | 'RECORD_AUDIO'. */
exports.askPermission = function (name) {
  if (['READ_CALENDAR', 'READ_CONTACTS', 'RECORD_AUDIO'].indexOf(String(name)) < 0) throw new Error('Не та доступность: ' + name);
  return axiko.permission([String(name)]);
};

exports.widget = function () {
  if (!engineInstalled()) return { title: 'Сериал', text: 'Нужен модуль «Приключение» с голосовым движком', open: SCREEN };
  load();
  var season = currentSeason();
  if (!season) return { title: 'Сериал', text: 'Сериал на ночь. Начните первый сезон.', open: SCREEN };
  var p = plan.toPlay(season, readState(), Date.now(), settings().continueDays);
  var ep = p.episode ? readEpisode(season.id, p.episode) : null;
  var text = (season.titleAuto ? 'Новый сезон' : season.title) + '\n';
  if (p.mode === 'new') text += 'Серия ' + p.episode + (ep && ep.title ? ': «' + ep.title + '»' : '') + ' готова';
  else if (p.mode) text += 'Серия ' + p.episode + ' ждёт продолжения';
  else text += p.why;
  return { title: 'Сериал', text: text, open: SCREEN };
};

// ---- start ---------------------------------------------------------------------------------------------------

function background(reason) {
  var s = settings();
  var out = null;
  try { out = exports.prepare(reason); } catch (error) { log('Подготовка: ' + msg(error)); }
  if (s['audio.prerender'] && phone.unmetered()) {
    try { exports.prerenderNow(false); } catch (error) { log('Запись голоса: ' + msg(error)); }
  }
  return out;
}

function schedule() {
  var s = settings();
  job('series:prepare', { at: s.prepareAt }, function () { background('job'); });
  job('series:remind', { at: s.remindAt }, function () {
    try { exports.remind(); } catch (error) { log('Напоминание: ' + msg(error)); }
  });
}

/** One line about the module in the main agent's memory, so that «включи сериал» works by voice. */
function teachAgent() {
  var path = 'agent/memory.md';
  var text = '';
  try { text = files.exists(path) ? String(files.read(path)) : ''; } catch (error) { text = ''; }
  if (text.indexOf(HOME + '/main.js') >= 0) return false;
  var lineText = '- Сериал на ночь: «включи сериал» — require(\'' + HOME + '/main.js\').play(); «продолжи сериал» — play({from: \'continue\'}); «новую серию» — play({from: \'new\'}); «стоп» — stopPlay().';
  files.write(path, (text ? text.replace(/\s*$/, '') + '\n' : '') + lineText + '\n');
  return true;
}

exports.start = function () {
  if (!engineInstalled()) {
    console.warn('bedtime-series: ' + NO_ENGINE);
    return false;
  }
  load();
  schedule();
  on('network', function (event) {
    if (!event || !event.online) return;
    spawn(function () { background('network'); });
  }, 'bedtime-series-network');
  try { teachAgent(); } catch (error) { console.warn('bedtime-series: память агента: ' + error); }
  // Started in the evening window (the phone was off at prepareAt): try soon.
  var s = settings();
  var season = currentSeason();
  if (season && plan.inWindow(Date.now(), s.prepareAt, s.remindAt) && plan.writeNeed(season, readState(), plan.dayOf(Date.now()), false).need) {
    scheduleRetry();
  }
  return true;
};

// For checks and other modules.
exports.GENRES = GENRES;
exports.TONES = TONES;
exports.driver = function (seasonId, pick, options) {
  load();
  return seriesDriver(seasonId, pick, options);
};
exports.writeEpisode = function (seasonId, n, collected) {
  load();
  if (!REG.writeLock.tryLock()) throw new Error('Серия уже пишется');
  try {
    return writeEpisode(seasonId, n, collected || { details: [], removed: [] });
  } finally {
    REG.writing = null;
    REG.writeLock.unlock();
  }
};
/**
 * An episode written by hand (by the agent, or a check): the same engine check as a model's, then
 * kept as the next episode of the season. Returns {ok, episode} | {ok: false, errors}.
 */
exports.addEpisode = function (seasonId, raw) {
  load();
  var s = settings();
  var season = seasonOf(readIndex(), seasonId);
  if (!season) throw new Error('Нет сезона ' + seasonId);
  var limits = schema.episodeLimits(s, season.minutes);
  limits.details = null;
  var errors = graph.validate(raw, limits);
  if (errors.length) return { ok: false, errors: errors };
  var n = (season.written || 0) + 1;
  keepEpisode(seasonId, n, raw, []);
  return { ok: true, episode: n };
};
exports.background = function (reason) {
  load();
  return background(reason || 'button');
};
