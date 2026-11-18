// «Приключение»: a classic quest played entirely by voice — for the metro, the car, a walk in
// headphones. A model with the network writes chapters ahead (rooms, items, exits, puzzles as
// data, checked by the engine before they are kept); the engine plays them without the network,
// understanding phrases by parse, saving after every line. The voice loop is the shared
// «Голосовой движок историй» in ./story-engine/ (the night series uses it too).
//
// Data (data/stories/):
//   settings.json                 the owner's changes of the settings (schema.js)
//   quest/index.json              {current, plots: [{id, title, genre, chapter, done, written, …}]}
//   quest/<plot>/ch<N>.json       chapters; bible.json, summaries.json; state.json (+ .prev.json); audio/
//   quest/stats.json, quest/log.json
var axiko = require('lib/axiko');
var files = axiko.files;
var words = require('./story-engine/words.js');
var parse = require('./story-engine/parse.js');
var quest = require('./story-engine/quest.js');
var chapters = require('./story-engine/chapter.js');
var branch = require('./story-engine/branch.js');
var lines = require('./story-engine/lines.js');
var settingsLib = require('./story-engine/settings.js');
var phone = require('./story-engine/phone.js');
var store = require('./story-engine/store.js');
var audio = require('./story-engine/audio.js');
var voice = require('./story-engine/voice.js');
var schema = require('./schema.js');
var prompts = require('./prompt.js');
var stock = require('./stock.js');

var HOME = 'modules/voice-adventure';
var SCREEN = HOME + '/ui/index.html';
var DATA = 'data/stories';
var QUEST = DATA + '/quest';
var SETTINGS = DATA + '/settings.json';
var INDEX = QUEST + '/index.json';
var STATS = QUEST + '/stats.json';
var LOG = QUEST + '/log.json';
var OUTBOX = 'data/games/achievements-outbox.json';
var SESSION = 'quest';
var VERB_IDS = Object.keys(parse.VERBS);

var GENRES = [
  { id: 'house', title: 'Таинственный дом', brief: 'старый дом с тайной: скрипучие лестницы, запертые комнаты, тихая жуть без крови' },
  { id: 'expedition', title: 'Экспедиция', brief: 'экспедиция в глухое место: заброшенная станция, перевал, остров, которого нет на картах' },
  { id: 'maze-city', title: 'Город-лабиринт', brief: 'город, где улицы ведут не туда: подворотни, крыши, переходы, двери без номеров' },
  { id: 'custom', title: 'Своё', brief: '' },
  { id: 'demo', title: 'Маяк на Сухой косе', brief: 'готовая первая глава, работает без сети' }
];

// What lives between calls: the module file may be reread while a chapter is being written.
var G = typeof global !== 'undefined' ? global : (function () { return this; })();
var REG = G.__voiceAdventure || (G.__voiceAdventure = {});
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
  return settings();
};

/** The settings for the screen: [{key, title, value, fallback, type, min, max, step, group, options}]. */
exports.settingsView = function () {
  return settingsLib.describe(schema.SCHEMA, savedSettings());
};

/** Changes settings: {key: value}; only what differs from the defaults is kept. */
exports.saveSettings = function (patch) {
  var saved = savedSettings();
  Object.keys(patch || {}).forEach(function (key) {
    if (!schema.SCHEMA[key]) throw new Error('Нет такой настройки: ' + key);
    saved[key] = settingsLib.coerce(schema.SCHEMA[key], patch[key]);
  });
  files.writeJson(SETTINGS, settingsLib.changes(schema.SCHEMA, saved));
  if (patch && patch.refillEveryMin !== undefined) schedule();
  emitState('settings');
  return exports.settingsView();
};

// ---- the plots and their chapters ---------------------------------------------------------------------

function readIndex() {
  var idx = store.readJson(INDEX, null);
  if (!idx || typeof idx !== 'object') idx = {};
  idx.plots = Array.isArray(idx.plots) ? idx.plots : [];
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

function plotOf(idx, id) {
  for (var i = 0; i < idx.plots.length; i++) if (idx.plots[i].id === id) return idx.plots[i];
  return null;
}

function updatePlot(id, fn) {
  return updateIndex(function (idx) {
    var plot = plotOf(idx, id);
    if (plot) fn(plot, idx);
  });
}

function currentPlot() {
  var idx = readIndex();
  return plotOf(idx, idx.current);
}

function validId(id) {
  return /^[a-z0-9][a-z0-9-]{0,40}$/i.test(String(id || ''));
}

function plotDir(id) {
  if (!validId(id)) throw new Error('Неверный сюжет: ' + id);
  return QUEST + '/' + id;
}

function chapterPath(id, n) {
  return plotDir(id) + '/ch' + n + '.json';
}

function readChapter(id, n) {
  if (!n || n < 1) return null;
  return store.readJson(chapterPath(id, n), null);
}

function genreOf(id) {
  return GENRES.filter(function (genre) { return genre.id === id; })[0] || null;
}

function genreText(plot) {
  if (plot.genre === 'custom') return plot.custom || 'на выбор автора';
  if (plot.genre === 'demo') return 'морская тайна: маяк, смотритель, туман';
  var genre = genreOf(plot.genre);
  return genre ? genre.title.toLowerCase() + ' — ' + genre.brief : 'на выбор автора';
}

function readStats() {
  var stats = files.readJson(STATS, {});
  if (!stats || typeof stats !== 'object') stats = {};
  stats.chaptersDone = Number(stats.chaptersDone) || 0;
  stats.sessions = Number(stats.sessions) || 0;
  stats.minutes = Number(stats.minutes) || 0;
  stats.granted = Array.isArray(stats.granted) ? stats.granted : [];
  return stats;
}

function writeStats(stats) {
  files.writeJson(STATS, stats);
}

function log(text) {
  try {
    var list = files.readJson(LOG, []);
    if (!Array.isArray(list)) list = [];
    list.push({ at: Date.now(), text: String(text) });
    files.writeJson(LOG, list.slice(-200));
  } catch (error) {
    console.warn('voice-adventure: журнал: ' + error);
  }
}

/** The adventure's journal, newest first: [{at, text}]. */
exports.log = function (limit) {
  var list = files.readJson(LOG, []);
  return (Array.isArray(list) ? list : []).slice(-(Number(limit) || 50)).reverse();
};

function emitState(phase, extra) {
  var data = { phase: phase, writing: REG.writing, rendering: REG.rendering };
  Object.keys(extra || {}).forEach(function (key) { data[key] = extra[key]; });
  try { emit('stories.quest', data); } catch (error) { /* no screens */ }
  if (phase === 'written' || phase === 'ended' || phase === 'plots') {
    try { axiko.widget.refresh('voice-adventure'); } catch (error) { /* no widget */ }
  }
}

// ---- writing chapters (role stories.write) ------------------------------------------------------------

/** One answer of a model as text (the raw text is needed for the fix loop). */
function askModel(role, messages, extra) {
  var body = { messages: messages };
  Object.keys(extra || {}).forEach(function (key) { body[key] = extra[key]; });
  var response = require('lib/ai').complete(role, body);
  var message = response && response.choices && response.choices[0] && response.choices[0].message;
  var text = message ? message.content : '';
  if (typeof text !== 'string') text = (text || []).map(function (part) { return part.text || ''; }).join('');
  return String(text || '');
}

var RPG = 'modules/rpg/main.js';

/**
 * The listener's life as material for a chapter, from «Жизнь-RPG» (modules/rpg) when it is
 * installed and the setting life.rpg is on: { level, places } — the level of status(), the game
 * names of the locations of map() (the most visited first; home and work never: map() hides them).
 * null without the module, with the setting off, or when the module does not answer.
 */
function lifeContext(s) {
  if (!s['life.rpg'] || !files.exists(RPG)) return null;
  try {
    var rpg = require(RPG);
    var out = { level: 0, places: [] };
    if (typeof rpg.status === 'function') out.level = Number((rpg.status() || {}).level) || 0;
    var all = [];
    if (typeof rpg.map === 'function') {
      all = ((rpg.map() || {}).locations || []).filter(function (l) { return l && !l.hidden && l.name; })
        .sort(function (a, b) { return (b.visits || 0) - (a.visits || 0); })
        .map(function (l) { return String(l.name); });
    }
    all.forEach(function (name) {
      name = words.clip(String(name), 40);
      if (name && out.places.indexOf(name) < 0 && out.places.length < s['life.places']) out.places.push(name);
    });
    return out.level > 1 || out.places.length ? out : null;
  } catch (error) {
    log('Жизнь-RPG не ответила: ' + msg(error));
    return null;
  }
}

/**
 * Writes chapter n of a plot: the prompt with the bible and the last recaps, the engine's check,
 * the list of errors back to the model up to fixTries times. Keeps the chapter, the bible, the recap.
 */
function writeChapter(plotId, n) {
  var s = settings();
  var plot = plotOf(readIndex(), plotId);
  if (!plot) throw new Error('Нет сюжета ' + plotId);
  var dir = plotDir(plotId);
  var bible = store.readJson(dir + '/bible.json', {}) || {};
  var summaries = store.readJson(dir + '/summaries.json', []) || [];
  var template = files.read(HOME + '/prompts/chapter.md');
  var messages = [
    { role: 'system', content: 'Ты автор голосовых квестов на русском языке. Отвечаешь только JSON по схеме из задания.' },
    { role: 'user', content: prompts.chapterPrompt(template, { plotTitle: plot.titleAuto ? '' : plot.title, genre: genreText(plot), bible: bible, summaries: summaries, number: n, life: lifeContext(s) }, schema.promptSettings(s)) }
  ];
  var started = Date.now();
  var text = '';
  var answer = null;
  var raw = null;
  var errors = ['нет ответа'];
  for (var attempt = 0; attempt <= s.fixTries; attempt++) {
    REG.writing = { plot: plotId, chapter: n, attempt: attempt + 1, since: started };
    emitState('writing');
    if (attempt > 0) {
      if (text) messages.push({ role: 'assistant', content: text });
      messages.push({ role: 'user', content: prompts.fixPrompt(errors) });
    }
    text = askModel('stories.write', messages, { response_format: { type: 'json_object' } });
    try {
      answer = prompts.parseJson(text);
    } catch (error) {
      errors = ['Ответ не разобрался как JSON (' + msg(error) + '). Пришли только JSON, без пояснений.'];
      log('Глава ' + n + ': ответ не JSON');
      continue;
    }
    raw = answer.chapter && typeof answer.chapter === 'object' ? answer.chapter : answer;
    raw.chapter = n;
    errors = chapters.validate(raw, schema.chapterLimits(s));
    if (!errors.length) break;
    log('Глава ' + n + ': проверка не прошла (' + errors.length + '): ' + errors.slice(0, 3).join('; '));
  }
  if (errors.length) throw new Error('Глава ' + n + ' не прошла проверку: ' + errors.slice(0, 3).join('; '));

  var chapter = chapters.tidy(raw);
  chapter.chapter = n;
  store.writeJson(chapterPath(plotId, n), chapter);
  if (answer.bible && typeof answer.bible === 'object') store.writeJson(dir + '/bible.json', answer.bible);
  summaries = summaries.filter(function (entry) { return entry.chapter !== n; });
  summaries.push({ chapter: n, title: chapter.title || '', summary: String(answer.summary || chapter.recap || '') });
  summaries.sort(function (a, b) { return a.chapter - b.chapter; });
  store.writeJson(dir + '/summaries.json', summaries);

  var waiting = false;
  updatePlot(plotId, function (p) {
    p.written = Math.max(p.written || 0, n);
    p.titles = p.titles || {};
    p.titles[n] = chapter.title || '';
    if (p.titleAuto && answer.plotTitle) {
      p.title = words.clip(String(answer.plotTitle), 60);
      p.titleAuto = false;
    }
    delete p.lastError;
    delete p.lastErrorAt;
    if (p.waiting && stock.playingChapter(p.chapter, p.done) === n) {
      waiting = true;
      p.waiting = false;
    }
  });
  log('Глава ' + n + ' «' + (chapter.title || '') + '» готова за ' + Math.round((Date.now() - started) / 1000) + ' с');
  emitState('written', { plot: plotId, chapter: n });
  if (waiting) {
    try {
      axiko.notify({ id: 'stories-ready', title: 'Приключение', text: 'Глава ' + n + ' готова: «' + (chapter.title || '') + '»', open: SCREEN, silent: true });
    } catch (error) { /* the notification is a courtesy */ }
  }
  return chapter;
}

/**
 * Keeps `ahead` chapters ready beyond the one being played: writes what is missing while the
 * model can answer. Called by the job, by the network and power events, after a session.
 */
exports.refill = function (reason) {
  var plot = currentPlot();
  if (!plot) return { skipped: 'нет приключения' };
  var s = settings();
  var need = stock.missing(plot.written || 0, plot.chapter || 1, !!plot.done, s.ahead);
  if (!need.length) return { skipped: 'запас полон', ahead: stock.readyAhead(plot.written || 0, plot.chapter || 1, !!plot.done) };
  var can = phone.model('stories.write');
  if (!can.ok) return { skipped: can.why };
  if (!REG.writeLock.tryLock()) return { busy: true };
  var written = [];
  var error = null;
  try {
    for (var i = 0; i < need.length; i++) {
      try {
        writeChapter(plot.id, need[i]);
        written.push(need[i]);
      } catch (failure) {
        error = msg(failure);
        updatePlot(plot.id, function (p) {
          p.lastError = error;
          p.lastErrorAt = Date.now();
        });
        log('Не удалось написать главу ' + need[i] + (reason ? ' (' + reason + ')' : '') + ': ' + error);
        break;
      }
    }
  } finally {
    REG.writing = null;
    REG.writeLock.unlock();
  }
  emitState('stock', { plot: plot.id, error: error });
  if (written.length) maybePrerender();
  return { written: written, error: error };
};

// ---- the cloud voice recorded in advance --------------------------------------------------------------

function nodeOf(n, node) {
  return 'c' + n + '-' + node;
}

function audioItems(plot) {
  var out = [];
  for (var n = stock.playingChapter(plot.chapter, plot.done); n <= (plot.written || 0); n++) {
    var chapter = readChapter(plot.id, n);
    if (!chapter) continue;
    chapters.texts(chapter).forEach(function (item) { out.push({ node: nodeOf(n, item.node), text: item.text }); });
  }
  return out;
}

/**
 * Records the texts of the chapter being played and of those ahead with the cloud voice (role
 * tts). force: also on the mobile network and without charging (the button on the screen).
 */
exports.prerenderNow = function (force) {
  var s = settings();
  var plot = currentPlot();
  if (!plot) return { skipped: 'нет приключения' };
  if (!force && !s['audio.prerender']) return { skipped: 'запись заранее выключена' };
  if (!phone.online()) return { skipped: 'нет сети' };
  if (REG.rendering && Date.now() - REG.rendering.since < 30 * 60000) return { busy: true };
  REG.rendering = { plot: plot.id, since: Date.now() };
  emitState('audio');
  try {
    var items = audioItems(plot);
    var out = audio.prerender(plotDir(plot.id), items, {
      anyNetwork: !!force, anyPower: !!force, maxMb: s['audio.maxMb'], roots: [QUEST], rate: s['audio.rate']
    });
    out.total = items.length;
    log('Запись голоса: новых ' + out.done + ', уже было ' + out.skipped + (out.error ? ', ' + out.error : ''));
    return out;
  } finally {
    REG.rendering = null;
    emitState('audio');
  }
};

function maybePrerender() {
  var s = settings();
  if (!s['audio.prerender'] || !phone.unmetered() || !phone.charging()) return;
  spawn(function () {
    try { exports.prerenderNow(false); } catch (error) { log('Запись голоса: ' + msg(error)); }
  });
}

// ---- achievements and facts -------------------------------------------------------------------------

/** Into «Ачивки за жизнь» when it is installed; otherwise into the game hub's outbox. */
function grant(item) {
  var full = {
    key: item.key, source: 'stories', category: 'Игротека', title: item.title, text: item.text,
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
    console.warn('voice-adventure: ачивка: ' + error);
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
    console.warn('voice-adventure: ящик ачивок: ' + error);
    return false;
  }
}

/** A chapter is finished: the plot moves on, the counters grow, achievements are checked. */
function chapterFinished(plotId, n, hints, quiet) {
  updatePlot(plotId, function (p) {
    if (p.chapter === n) p.done = true;
    p.chaptersDone = Math.max(p.chaptersDone || 0, n);
  });
  if (quiet) return;
  var stats = readStats();
  stats.chaptersDone++;
  stats.lastChapterDone = true;
  stats.lastChapterHints = hints;
  stock.achievements(stats, stats.granted).forEach(function (item) {
    if (grant(item)) stats.granted.push(item.key);
  });
  writeStats(stats);
  log('Глава ' + n + ' пройдена' + (hints ? ', подсказок: ' + hints : ', без подсказок'));
}

function recordPlay(plotId, n, minutes) {
  if (minutes < 1) return;
  try {
    require('lib/base').add({
      kind: 'play', title: 'Приключение', amount: minutes, unit: 'min', source: 'stories',
      data: { game: 'voice-adventure', plot: plotId, chapter: n, trip: phone.inTrip() }
    });
  } catch (error) {
    console.warn('voice-adventure: base.add: ' + error);
  }
}

// ---- the quest as a driver of the voice loop -------------------------------------------------------------

/** options.quiet — for checks: no background writing, no achievements, no facts in the base. */
function questDriver(plotId, options) {
  var quiet = !!(options && options.quiet);
  var s = settings();
  var dir = plotDir(plotId);
  var plot = null;
  var n = 0;
  var chapter = null;
  var state = null;
  var known = [];
  var mode = 'play';   // play | between (the chapter is done, the next one is offered)

  var d = {
    id: SESSION, title: 'Приключение', screen: SCREEN,
    pauseLine: 'Пауза. Чтобы продолжить, нажмите «Говорить» или кнопку на гарнитуре.'
  };

  function load(number) {
    var found = readChapter(plotId, number);
    if (!found) throw new Error('Глава ' + number + ' ещё не написана');
    n = number;
    chapter = found;
    var saved = store.loadState(dir);
    state = saved && saved.story === 'quest' && saved.chapter === n && chapter.rooms[saved.room]
      ? saved : quest.create(chapter, { plot: plotId, now: Date.now() });
    known = s['voice.mode'] === 'local' ? [] : audio.known(dir, chapters.texts(chapter).map(function (item) {
      return { node: nodeOf(n, item.node), text: item.text };
    }));
    d.title = (plot && plot.title ? plot.title : 'Приключение') + ' · глава ' + n;
  }

  /** A line of the narrator; recorded parts of it are played from their files. */
  function line(text, extra) {
    var out = { text: String(text || ''), listen: true };
    if (known.length) {
      var parts = lines.segments(out.text, known);
      if (parts.some(function (part) { return part.audio; })) out.parts = parts;
    }
    Object.keys(extra || {}).forEach(function (key) { out[key] = extra[key]; });
    if (!out.noRepeat && state) state.lastLine = out.text;
    return out;
  }

  function opening() {
    var parts = [];
    if (!readStats().sessions && n === 1 && !state.turn) {
      parts.push('Говорите, когда рассказчик замолчит. Застряли — скажите «подсказка». Закончить — «хватит».');
    }
    if (!state.turn) {
      if (n > 1 && chapter.recap) parts.push(chapter.recap);
      parts.push('Глава ' + n + (chapter.title ? '. ' + chapter.title : '') + '.');
      parts.push(quest.describe(chapter, state, true));
    } else if (Date.now() - (state.savedAt || 0) > s.recapAfterMin * 60000) {
      parts.push(quest.recap(chapter, state));
      parts.push(quest.describe(chapter, state, true));
      parts.push(quest.exitsLine(chapter, state));
    } else {
      parts.push('Продолжаем.');
      parts.push(quest.describe(chapter, state, false));
    }
    return parts.join(' ').replace(/\s+/g, ' ').trim();
  }

  function nextReady() {
    return !!readChapter(plotId, n + 1);
  }

  function later(reason) {
    if (quiet) return;
    spawn(function () {
      try { exports.refill(reason); } catch (error) { log('Пополнение: ' + msg(error)); }
    });
  }

  function notReadyLine(prefix) {
    if (!quiet) updatePlot(plotId, function (p) { p.waiting = true; });
    later('chapter-done');
    return {
      text: (prefix ? prefix + ' ' : '') + 'Следующая глава ещё пишется. Когда будет сеть, Axiko её подготовит и пришлёт уведомление.',
      end: true, reason: 'done', noRepeat: true
    };
  }

  function offerNext(prefix) {
    mode = 'between';
    if (!nextReady()) return notReadyLine(prefix);
    return line((prefix ? prefix + ' ' : '') + 'Начать следующую главу? Скажите «дальше» или «хватит».');
  }

  function startNext() {
    var next = n + 1;
    if (!readChapter(plotId, next)) return notReadyLine('');
    updatePlot(plotId, function (p) {
      p.chapter = next;
      p.done = false;
    });
    load(next);
    store.saveState(dir, state);
    mode = 'play';
    later('next-chapter');
    return line(opening());
  }

  /** The phone's model maps a phrase the parse did not understand onto the world. */
  function understand(text, world, topic) {
    if (!s['local.understand']) return null;
    if (!phone.model('stories.local').ok) return null;
    try {
      var answer = prompts.parseJson(askModel('stories.local',
        [{ role: 'user', content: prompts.understandPrompt(text, world, VERB_IDS) }], { max_tokens: s['local.maxTokens'] }));
      var cmd = prompts.fromModel(answer, world, VERB_IDS);
      if (cmd && cmd.verb === 'look' && !cmd.object) cmd.topic = topic || text;
      return cmd;
    } catch (error) {
      log('Модель на телефоне не поняла фразу: ' + msg(error));
      return null;
    }
  }

  /** The phone's model answers about something the chapter does not describe; adds nothing to the world. */
  function freeAnswer(text) {
    if (!s['local.freeAnswers']) return null;
    if (!phone.model('stories.local').ok) return null;
    try {
      var names = quest.world(chapter, state).items.map(function (item) { return quest.nameOf(chapter, item.id, 0); });
      var said = askModel('stories.local', [{ role: 'user', content: prompts.freePrompt(text, quest.describe(chapter, state, true), names) }],
        { max_tokens: s['local.maxTokens'] });
      return prompts.cleanFree(said, s['local.maxChars']) || null;
    } catch (error) {
      log('Свободный ответ не удался: ' + msg(error));
      return null;
    }
  }

  function between(text, service) {
    var norm = words.normalize(text);
    var yes = service === 'resume' || branch.yesNo(text) === 'yes' || /(^| )(дальше|следующ\S*|начн\S*|начать)( |$)/.test(norm);
    if (yes) return startNext();
    if (branch.yesNo(text) === 'no') return { text: 'Хорошо. Продолжим в следующий раз.', end: true, reason: 'done', noRepeat: true };
    if (!nextReady()) return notReadyLine('');
    return line('Скажите «дальше», чтобы начать следующую главу, или «хватит».', { noRepeat: true });
  }

  d.begin = function () {
    plot = plotOf(readIndex(), plotId);
    if (!plot) throw new Error('Нет сюжета ' + plotId);
    load(plot.chapter || 1);
    if (state.done) return offerNext('Эта глава пройдена.');
    return line(opening());
  };

  d.answer = function (text, service) {
    if (mode === 'between') return between(text, service);
    if (service === 'where') return line(quest.whereText(chapter, state));
    if (service === 'inventory') return line(quest.inventoryText(chapter, state));
    if (service === 'hint') {
      var hinted = quest.hint(chapter, state);
      state = hinted.state;
      return line(hinted.text);
    }
    if (service === 'help') return line(parse.helpLine(quest.world(chapter, state)), { noRepeat: true });
    if (service === 'resume') return line(quest.describe(chapter, state, false));

    var world = quest.world(chapter, state);
    var cmd = parse.parse(text, world, { maxTypos: s['parse.maxTypos'] });
    if (cmd.empty) return line('Не расслышал. Скажите ещё раз.', { noRepeat: true });
    if (cmd.service) {
      // The loop takes repeat, pause, stop and save itself; the rest is answered here.
      if (['where', 'inventory', 'hint', 'help', 'resume'].indexOf(cmd.service) >= 0 && cmd.service !== service) return d.answer(text, cmd.service);
      return line(parse.helpLine(world), { noRepeat: true });
    }
    if (cmd.unknown) {
      var guessed = understand(text, world, cmd.topic);
      if (guessed) cmd = guessed;
    }
    if (!cmd.verb) {
      var free = cmd.topic ? freeAnswer(text) : null;
      return line(free || ('Не понял. ' + parse.helpLine(world)), { noRepeat: true });
    }
    var out = quest.act(chapter, state, cmd);
    state = out.state;
    var said = out.text;
    if (out.events.indexOf('free') >= 0) said = freeAnswer(text) || said;
    if (out.events.indexOf('chapter-done') >= 0) {
      chapterFinished(plotId, n, state.hints || 0, quiet);
      var ending = said + ((chapter.goal || {}).next ? ' ' + chapter.goal.next : '') + ' Глава ' + n + ' пройдена.';
      return offerNext(ending);
    }
    return line(said);
  };

  d.resume = function () {
    if (mode === 'between') return offerNext('');
    return line('Продолжаем. ' + quest.describe(chapter, state, false));
  };

  d.save = function () {
    if (state) store.saveState(dir, state);
  };

  d.end = function (reason, minutes) {
    if (quiet) return;
    updatePlot(plotId, function (p) { p.lastPlayed = Date.now(); });
    var stats = readStats();
    stats.sessions++;
    stats.minutes += minutes;
    writeStats(stats);
    recordPlay(plotId, n, minutes);
    log('Игра: ' + minutes + ' мин, глава ' + n + ' (' + ({ done: 'конец главы', pause: 'пауза', stop: 'хватит', error: 'ошибка', replaced: 'другая история' }[reason] || reason) + ')');
    emitState('ended', { reason: reason });
    if (phone.online()) later('session-end');
  };

  d.info = function () {
    if (!chapter || !state) return { plot: plotId };
    var room = chapter.rooms[state.room] || {};
    return {
      plot: plotId, plotTitle: plot ? plot.title : '', chapter: n, chapterTitle: chapter.title || '', room: room.name || '',
      inventory: state.inventory.map(function (id) { return quest.nameOf(chapter, id, 0); }),
      hints: state.hints || 0, progress: quest.progress(chapter, state), mode: mode, done: !!state.done,
      recorded: known.length
    };
  };

  d.goodbye = function () {
    return 'Сохранено. Продолжим с этого места.';
  };

  return d;
}

// ---- what the screen calls --------------------------------------------------------------------------------

function describePlot(p) {
  var playing = stock.playingChapter(p.chapter, p.done);
  var titles = p.titles || {};
  var written = p.written || 0;
  return {
    id: p.id, title: p.title || 'Новое приключение', genre: p.genre, demo: !!p.demo, chapter: p.chapter || 1, done: !!p.done,
    written: written, playing: playing, playingTitle: titles[playing] || '', ready: written >= playing,
    ahead: Math.max(0, stock.readyAhead(written, p.chapter || 1, !!p.done)), chaptersDone: p.chaptersDone || 0,
    line: stock.cardLine(playing, titles[playing] || '', false), lastPlayed: p.lastPlayed || null, createdAt: p.createdAt || null,
    lastError: p.lastError || null
  };
}

/** Everything the screen draws. */
exports.status = function () {
  var idx = readIndex();
  var current = plotOf(idx, idx.current);
  var plots = idx.plots.map(describePlot).sort(function (a, b) {
    return (b.lastPlayed || b.createdAt || 0) - (a.lastPlayed || a.createdAt || 0);
  });
  return {
    current: current ? describePlot(current) : null,
    plots: plots,
    genres: GENRES.map(function (genre) { return { id: genre.id, title: genre.title, brief: genre.brief }; }),
    voice: voice.state(SESSION),
    writing: REG.writing,
    rendering: REG.rendering,
    speech: phone.speech(),
    online: phone.online(),
    write: phone.model('stories.write'),
    local: phone.model('stories.local'),
    features: phone.features(),
    trip: phone.inTrip(),
    audioMb: audio.usage([QUEST]),
    stats: readStats()
  };
};

/**
 * A new adventure: {genre: 'house' | 'expedition' | 'maze-city' | 'custom' | 'demo', custom: 'о чём'}.
 * 'demo' — the ready chapter «Маяк на Сухой косе», no network needed; the next chapters are written
 * later from its bible. Other genres: chapter 1 is written in the background (event stories.quest).
 * quiet: true — nothing is written in the background (checks).
 */
exports.newAdventure = function (options) {
  options = options || {};
  var genre = genreOf(options.genre) ? options.genre : 'custom';
  var custom = String(options.custom || '').replace(/\s+/g, ' ').trim().slice(0, 300);
  var now = Date.now();
  var idx = readIndex();
  var id = stock.plotId(now);
  for (var k = 2; plotOf(idx, id); k++) id = stock.plotId(now) + '-' + k;
  var plot = {
    id: id, title: 'Новое приключение', titleAuto: true, genre: genre, custom: custom, createdAt: now,
    chapter: 1, done: false, written: 0, chaptersDone: 0, titles: {}
  };
  if (genre === 'demo') {
    var demo = files.readJson(HOME + '/content/demo.json', null);
    if (!demo || !demo.chapter) throw new Error('Нет готовой главы content/demo.json');
    var first = chapters.tidy(demo.chapter);
    first.chapter = 1;
    store.writeJson(chapterPath(id, 1), first);
    store.writeJson(plotDir(id) + '/bible.json', demo.bible || {});
    store.writeJson(plotDir(id) + '/summaries.json', [{ chapter: 1, title: first.title || '', summary: demo.summary || '' }]);
    plot.title = demo.title || 'Маяк на Сухой косе';
    plot.titleAuto = false;
    plot.written = 1;
    plot.titles = { 1: first.title || '' };
    plot.demo = true;
  }
  updateIndex(function (i) {
    i.plots.push(plot);
    i.current = id;
  });
  log('Новое приключение: ' + (genreOf(genre) || {}).title + (custom ? ' — ' + custom : ''));
  emitState('plots', { plot: id });
  var can = phone.model('stories.write');
  if (genre === 'demo') {
    if (can.ok && !options.quiet) spawn(function () { try { exports.refill('new'); } catch (error) { log('Пополнение: ' + msg(error)); } });
    return { ok: true, plot: id, ready: true };
  }
  updatePlot(id, function (p) { p.waiting = true; });
  if (!can.ok) {
    return {
      ok: false, plot: id, ready: false,
      why: 'Первую главу сейчас не написать: ' + can.why + '. Она напишется сама, когда появится сеть. А без сети можно начать готовую главу «Маяк на Сухой косе».'
    };
  }
  spawn(function () {
    try {
      var out = exports.refill('new');
      if (out.error) emitState('failed', { plot: id, error: out.error });
    } catch (error) {
      log('Первая глава: ' + msg(error));
      emitState('failed', { plot: id, error: msg(error) });
    }
  });
  return { ok: true, plot: id, ready: false, writing: true };
};

/** Makes another plot the current one. */
exports.selectPlot = function (id) {
  updateIndex(function (idx) {
    if (!plotOf(idx, id)) throw new Error('Нет сюжета ' + id);
    idx.current = id;
  });
  emitState('plots', { plot: id });
  return exports.status();
};

/** Removes a plot with its chapters, state and recordings. */
exports.removePlot = function (id) {
  var running = voice.state(SESSION);
  if (running.running && running.info && running.info.plot === id) {
    voice.stop(SESSION);
    for (var i = 0; i < 30 && voice.state(SESSION).running; i++) sleep(100);
  }
  store.removeDir(plotDir(id));
  updateIndex(function (idx) {
    idx.plots = idx.plots.filter(function (p) { return p.id !== id; });
    if (idx.current === id) {
      var left = idx.plots.slice().sort(function (a, b) { return (b.lastPlayed || b.createdAt || 0) - (a.lastPlayed || a.createdAt || 0); });
      idx.current = left.length ? left[0].id : null;
    }
  });
  log('Сюжет удалён: ' + id);
  emitState('plots');
  return exports.status();
};

/**
 * Starts the voice session of the current plot (or options.plot). The loop runs in the engine:
 * the screen may go dark. {ok, why?, state?}.
 */
exports.play = function (options) {
  options = options || {};
  var idx = readIndex();
  var plot = plotOf(idx, options.plot || idx.current);
  if (!plot) return { ok: false, why: 'Сначала начните приключение' };
  if (!axiko.permission(['RECORD_AUDIO'])) return { ok: false, why: 'Нужен доступ к микрофону' };
  if (!phone.speech().ready) return { ok: false, why: 'Распознавание речи на телефоне не готово — скачайте его в настройках голоса Axiko' };
  if (plot.done) {
    if (!readChapter(plot.id, plot.chapter + 1)) {
      updatePlot(plot.id, function (p) { p.waiting = true; });
      spawn(function () { try { exports.refill('play'); } catch (error) { log('Пополнение: ' + msg(error)); } });
      return { ok: false, why: 'Глава ' + (plot.chapter + 1) + ' ещё пишется. Когда будет сеть, Axiko её подготовит.' };
    }
    updatePlot(plot.id, function (p) {
      p.chapter = plot.chapter + 1;
      p.done = false;
    });
  } else if (!readChapter(plot.id, plot.chapter || 1)) {
    updatePlot(plot.id, function (p) { p.waiting = true; });
    spawn(function () { try { exports.refill('play'); } catch (error) { log('Пополнение: ' + msg(error)); } });
    return { ok: false, why: 'Глава ' + (plot.chapter || 1) + (REG.writing ? ' пишется прямо сейчас.' : ' ещё не написана: нужна сеть.') };
  }
  if (idx.current !== plot.id) updateIndex(function (i) { i.current = plot.id; });
  var state = voice.run(questDriver(plot.id), schema.voiceOptions(settings()));
  return { ok: true, state: state };
};

/** A command to the running session: talk, release, repeat, pause, resume, stop, say (typed text). */
exports.command = function (cmd, text) {
  return voice.command(SESSION, cmd, text);
};

exports.stopPlay = function () {
  return voice.stop(SESSION);
};

/** The state of the voice session (the same as the event story.state). */
exports.voiceState = function () {
  return voice.state(SESSION);
};

// ---- the game hub's card, the widget ------------------------------------------------------------------------

function iconText() {
  try {
    return files.read(HOME + '/icon.svg');
  } catch (error) {
    return null;
  }
}

/** The card for the game hub's catalog («Все игры»): the adventure is not on the hub's engine. */
exports.card = function () {
  var plot = currentPlot();
  var view = plot ? describePlot(plot) : null;
  var line = 'Новое приключение';
  if (view) line = view.ready ? 'Продолжить: ' + view.line : 'Глава ' + view.playing + ' пишется';
  return {
    id: 'voice-adventure', title: 'Приключение', about: 'Голосовой квест для дороги, работает без сети',
    icon: iconText(), entry: SCREEN, open: SCREEN, card: line, savedAt: plot ? plot.lastPlayed || null : null,
    opened: plot ? plot.lastPlayed || null : null, external: true, achievements: ['stories/quest/five-chapters', 'stories/quest/no-hints']
  };
};

exports.widget = function () {
  var plot = currentPlot();
  if (!plot) return { title: 'Приключение', text: 'Голосовой квест для дороги. Начните новое приключение.', open: SCREEN };
  var view = describePlot(plot);
  var text = view.title + '\n' + (view.ready ? 'Продолжить: ' + view.line : 'Глава ' + view.playing + ' пишется');
  if (view.ready) text += '\nГотово глав впереди: ' + view.ahead;
  return { title: 'Приключение', text: text, open: SCREEN };
};

// ---- start ---------------------------------------------------------------------------------------------------

function background(reason) {
  var plot = currentPlot();
  if (!plot) return;
  var s = settings();
  var cooling = plot.lastErrorAt && Date.now() - plot.lastErrorAt < s.retryAfterMin * 60000;
  if (!cooling) {
    try { exports.refill(reason); } catch (error) { log('Пополнение: ' + msg(error)); }
  }
  maybePrerender();
}

function schedule() {
  var s = settings();
  job('stories:refill', { every: s.refillEveryMin }, function () { background('job'); });
}

exports.start = function () {
  schedule();
  on('network', function (event) {
    if (!event || !event.online) return;
    spawn(function () { background('network'); });
  }, 'voice-adventure-network');
  on('power', function (event) {
    if (!event || !event.charging) return;
    spawn(function () { background('power'); });
  }, 'voice-adventure-power');
  return true;
};

// For checks and other modules.
exports.GENRES = GENRES;
exports.writeChapter = function (plotId, n) {
  if (!REG.writeLock.tryLock()) throw new Error('Глава уже пишется');
  try {
    return writeChapter(plotId, n);
  } finally {
    REG.writing = null;
    REG.writeLock.unlock();
  }
};
exports.driver = questDriver;
