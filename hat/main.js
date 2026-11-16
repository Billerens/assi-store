// Шляпа — логика в движке: настройки, колоды (модель и запасной словарь), игры и ходы,
// история слов («не повторять»), отклик на имя на время игры, общая база.
// Экран зовёт эти функции через assi.call('modules/hat/main.js', имя, аргументы).
//
// Для агента: «Assi, давай в шляпу, нас шестеро, тема — кино» —
//   require('modules/hat/main.js').open({ players: 6, theme: 'кино' })
// открывает экран подготовки с заполненными полями. Поля: players (число или массив имён),
// theme, difficulty (1–5), mode ('pairs'|'teams'), teamCount, turnSeconds, rounds.
// Агент узнаёт об этом из инструмента tools/hat.js (action open), который start() пишет при
// каждом запуске Assi (module.json "autostart"); текст инструмента — в tool.js.
var assi = require('lib/assi');
var ai = require('lib/ai');
var match = require('./match');
var config = require('./config');
var deck = require('./deck');
var rules = require('./rules');
var agentTool = require('./tool');
var achieve = require('./achieve');

var DIR = 'data/hat';
var SETTINGS = DIR + '/settings.json';
var CURRENT = DIR + '/current.json';
var WAKE = DIR + '/wake.json';
var PREFILL = DIR + '/prefill.json';
var EXTRA = DIR + '/words-extra.json';
var CARRY = DIR + '/carry.json';
var CLEANED = DIR + '/cleaned.json';
var ACHIEVED = DIR + '/achievements.json';
var SCREEN = 'modules/hat/ui/index.html';
var ROLE = 'hat.words';
var HOUR = 3600000;
var DAY = 24 * HOUR;

var prepared = false;

function db() {
  var handle = assi.db('hat');
  if (!prepared) {
    handle.exec('create table if not exists decks (id integer primary key autoincrement, created integer not null, theme text, ' +
      'difficulty integer, cards text not null, keep integer default 0, source text, played integer default 0)');
    handle.exec('create table if not exists games (id integer primary key autoincrement, started integer not null, ended integer, ' +
      'mode text, players text, teams text, settings text, deck_id integer, scores text, summary text)');
    handle.exec('create table if not exists turns (id integer primary key autoincrement, game_id integer not null, round integer, ' +
      'explainer text, guesser text, started integer, results text)');
    handle.exec('create table if not exists word_history (id integer primary key autoincrement, word text not null, ' +
      'played_at integer not null, guessed integer not null, game_id integer, turn_id integer)');
    handle.exec('create index if not exists word_history_played on word_history (played_at)');
    handle.exec('create index if not exists word_history_turn on word_history (turn_id)');
    prepared = true;
  }
  return handle;
}

function message(error) {
  return String(error && error.message ? error.message : error);
}

function tryNative() {
  try {
    return native.apply(null, Array.prototype.slice.call(arguments));
  } catch (error) {
    return undefined;
  }
}

function merge(a, b) {
  var out = {};
  var key;
  for (key in a || {}) out[key] = a[key];
  for (key in b || {}) out[key] = b[key];
  return out;
}

// ---- настройки -----------------------------------------------------------------------------

exports.settings = function () {
  return config.normalize(assi.files.readJson(SETTINGS, {}));
};

exports.saveSettings = function (patch) {
  var next = config.normalize(merge(exports.settings(), patch));
  assi.files.writeJson(SETTINGS, next);
  return next;
};

// ---- что умеет оболочка ----------------------------------------------------------------------

var featureCache = null;
var featureAt = 0;

/** Правки оболочки, которые есть на этом телефоне (docs/shell-changes.md); нет операции — пусто. */
exports.features = function () {
  if (!featureCache || Date.now() - featureAt > 60000) {
    var list = tryNative('shell.features');
    featureCache = Array.isArray(list) ? list.map(String) : [];
    featureAt = Date.now();
  }
  return featureCache;
};

function has(feature) {
  return exports.features().indexOf(feature) >= 0;
}

// ---- открыть с заполненными полями (для агента) ---------------------------------------------

exports.open = function (prefill) {
  assi.files.writeJson(PREFILL, merge(prefill || {}, { at: Date.now() }));
  native('ui.open', SCREEN);
  return 'Открыта подготовка Шляпы';
};

/** Инструмент агента tools/hat.js: { action: 'open', count | names, theme, difficulty, mode, … }. */
exports.tool = function (args) {
  args = args || {};
  if (args.action === 'open') return exports.open(agentTool.prefill(args));
  return 'Неизвестное действие: ' + args.action;
};

/** Запуск Assi (module.json "autostart"): только записать инструмент агента — игры без экрана нет. */
exports.start = function () {
  agentTool.write(assi.files);
  return true;
};

function takePrefill() {
  var found = assi.files.readJson(PREFILL, null);
  if (!found) return null;
  assi.files.remove(PREFILL);
  return Date.now() - (found.at || 0) < 10 * 60000 ? found : null;
}

// ---- запасной словарь ------------------------------------------------------------------------

function dictionary() {
  return require('./words.json');
}

function extraFile() {
  var found = assi.files.readJson(EXTRA, null) || {};
  return { pending: found.pending || {}, accepted: found.accepted || {} };
}

exports.offlineInfo = function () {
  var words = dictionary();
  var extra = extraFile();
  var count = function (map) {
    var total = 0;
    for (var level = 1; level <= 5; level++) total += (map[level] || []).length;
    return total;
  };
  return { builtin: count(words), accepted: count(extra.accepted), pending: extra.pending };
};

/** Пополнить запасной словарь моделью: слова уровня ждут, пока владелец их просмотрит. */
exports.growOffline = function (level, count) {
  var s = exports.settings();
  level = Math.max(1, Math.min(5, Number(level) || 3));
  count = Math.max(10, Math.min(200, Number(count) || 100));
  var words = dictionary();
  var extra = extraFile();
  var have = [];
  for (var l = 1; l <= 5; l++) {
    have = have.concat(words[l] || [], extra.accepted[l] || [], extra.pending[l] || []);
  }
  var exclude = {};
  have.forEach(function (word) { exclude[match.normalize(word)] = true; });
  var p = deck.prompt({ theme: 'общее', difficulty: level, count: count, adult: s.adultWords });
  var answer = ai.ask({ role: ROLE, system: p.system, prompt: p.prompt, json: true });
  var cleaned = deck.clean(answer, { exclude: exclude, maxLetters: s.maxWordLetters, difficulty: level });
  extra.pending[level] = (extra.pending[level] || []).concat(cleaned.cards.map(function (card) { return card.word; }));
  assi.files.writeJson(EXTRA, extra);
  return extra.pending[level];
};

/** Владелец посмотрел слова уровня: accept — оставить, остальные из ожидания — выбросить. */
exports.reviewOffline = function (level, accept) {
  var extra = extraFile();
  var keep = {};
  (accept || []).forEach(function (word) { keep[match.normalize(word)] = true; });
  var good = (extra.pending[level] || []).filter(function (word) { return keep[match.normalize(word)]; });
  extra.accepted[level] = (extra.accepted[level] || []).concat(good);
  extra.pending[level] = [];
  assi.files.writeJson(EXTRA, extra);
  return exports.offlineInfo();
};

// ---- история слов ----------------------------------------------------------------------------

function playedSet(limit) {
  var out = {};
  if (!limit) return out;
  db().query('select word from word_history order by played_at desc limit ?', [limit]).forEach(function (row) {
    out[match.normalize(row.word)] = true;
  });
  return out;
}

function recentWords(limit) {
  if (!limit) return [];
  var seen = {};
  var out = [];
  db().query('select word from word_history order by played_at desc limit ?', [limit * 3]).forEach(function (row) {
    var plain = match.normalize(row.word);
    if (!seen[plain] && out.length < limit) {
      seen[plain] = true;
      out.push(row.word);
    }
  });
  return out;
}

// ---- колоды ----------------------------------------------------------------------------------

function saveDeck(theme, difficulty, cards, source) {
  db().exec('insert into decks (created, theme, difficulty, cards, source) values (?, ?, ?, ?, ?)',
    [Date.now(), theme, difficulty, JSON.stringify(cards), source]);
  return db().lastId();
}

function deckRow(row) {
  var cards = [];
  try { cards = JSON.parse(row.cards); } catch (ignored) { cards = []; }
  return {
    id: row.id, created: row.created, theme: row.theme, difficulty: row.difficulty, keep: !!row.keep,
    source: row.source, played: !!row.played, count: cards.length, cards: cards
  };
}

exports.decks = function () {
  return db().query('select * from decks order by created desc limit 30').map(function (row) {
    var item = deckRow(row);
    delete item.cards;
    return item;
  });
};

exports.deck = function (id) {
  var rows = db().query('select * from decks where id = ?', [id]);
  return rows.length ? deckRow(rows[0]) : null;
};

exports.keepDeck = function (id, keep) {
  db().exec('update decks set keep = ? where id = ?', [keep ? 1 : 0, id]);
  return true;
};

exports.removeDeck = function (id) {
  db().exec('delete from decks where id = ?', [id]);
  return true;
};

function takeCarry() {
  var carry = assi.files.readJson(CARRY, []);
  if (carry.length) assi.files.remove(CARRY);
  return carry;
}

/**
 * Колода моделью: options { theme, difficulty, count } (и для generate: save, carry, fill — false
 * выключает сохранение, перенос неугаданных, добор из словаря). Слова проверяются (дубли, история,
 * латиница, длина); не хватает — дозапрос; модель недоступна — запасной словарь.
 * Колода сохраняется: играть можно без сети. → { id, cards, source, error }.
 */
exports.buildDeck = function (options) {
  options = options || {};
  var s = exports.settings();
  var count = Math.max(1, Math.min(400, Math.round(Number(options.count) || 40)));
  var theme = String(options.theme || s.theme || 'общее');
  var difficulty = Math.max(1, Math.min(5, Number(options.difficulty) || s.difficulty));
  var exclude = playedSet(s.noRepeat);
  var cards = [];
  if (s.carryUnguessed && options.carry !== false) {
    takeCarry().forEach(function (card) { if (cards.length < count) cards.push(card); });
  }
  var recent = recentWords(s.recentInPrompt);
  var error = '';
  var asked = 0;
  while (cards.length < count && asked <= s.modelRetries) {
    var missing = count - cards.length;
    var p = deck.prompt({
      theme: theme, difficulty: difficulty, count: Math.ceil(missing * 1.2) + 2, adult: s.adultWords, recent: recent,
      already: asked ? cards.map(function (card) { return card.word; }) : [], drawable: options.drawable, synonyms: options.synonyms
    });
    asked += 1;
    try {
      var answer = ai.ask({ role: ROLE, system: p.system, prompt: p.prompt, json: true });
      var cleaned = deck.clean(answer, { exclude: exclude, have: cards, maxLetters: s.maxWordLetters, count: missing, difficulty: difficulty });
      cards = cards.concat(cleaned.cards);
    } catch (failure) {
      error = message(failure);
      break;
    }
  }
  var fromModel = cards.length;
  if (cards.length < count && options.fill !== false) {
    var taken = merge(exclude, {});
    cards.forEach(function (card) { taken[match.normalize(card.word)] = true; });
    cards = cards.concat(deck.offline(dictionary(), {
      difficulty: difficulty, count: count - cards.length, exclude: taken, extra: extraFile().accepted
    }));
  }
  var source = fromModel === 0 ? 'offline' : fromModel < count ? 'mixed' : 'model';
  if (options.save === false) return { id: null, cards: cards, source: source, error: error };
  var id = saveDeck(theme, difficulty, cards, source);
  return { id: id, cards: cards, source: source, theme: theme, difficulty: difficulty, error: error };
};

/** Колода только из запасного словаря — без сети и без ожидания. */
exports.offlineDeck = function (options) {
  options = options || {};
  var s = exports.settings();
  var count = Math.max(1, Math.min(400, Math.round(Number(options.count) || 40)));
  var difficulty = Math.max(1, Math.min(5, Number(options.difficulty) || s.difficulty));
  var cards = s.carryUnguessed ? takeCarry().slice(0, count) : [];
  var taken = playedSet(s.noRepeat);
  cards.forEach(function (card) { taken[match.normalize(card.word)] = true; });
  cards = cards.concat(deck.offline(dictionary(), { difficulty: difficulty, count: count - cards.length, exclude: taken, extra: extraFile().accepted }));
  var id = saveDeck('общее', difficulty, cards, 'offline');
  return { id: id, cards: cards, source: 'offline', theme: 'общее', difficulty: difficulty, error: '' };
};

/**
 * Слова для других модулей (Рисуй — угадаю): карточки без сохранения колоды, только от модели —
 * без неугаданных слов Шляпы и без добора из её словаря (там не всё можно нарисовать).
 * options: theme, difficulty, count, drawable, synonyms. → { cards, source, error }.
 */
exports.generate = function (options) {
  return exports.buildDeck(merge(options, { save: false, carry: false, fill: false }));
};

/** Формы своих слов игроков одним запросом; без сети — без форм (их даст правило окончаний). */
exports.formsFor = function (cards) {
  var list = (cards || []).filter(function (card) { return card && card.word; });
  if (!list.length) return { cards: [], model: false, error: '' };
  try {
    var p = deck.formsPrompt(list.map(function (card) { return card.word; }));
    var answer = ai.ask({ role: ROLE, system: p.system, prompt: p.prompt, json: true });
    return { cards: deck.applyForms(list, answer), model: true, error: '' };
  } catch (error) {
    return { cards: list, model: false, error: message(error) };
  }
};

// ---- сохранение игры после каждого действия ----------------------------------------------------

exports.saveState = function (state) {
  assi.files.writeJson(CURRENT, merge(state, { savedAt: Date.now() }));
  return true;
};

exports.loadState = function () {
  return assi.files.readJson(CURRENT, null);
};

exports.clearState = function () {
  if (assi.files.exists(CURRENT)) assi.files.remove(CURRENT);
  return true;
};

// ---- отклик на имя: выключен на время игры, возвращается после ---------------------------------

var lastBeat = 0;
var watching = false;

function wakeMark() {
  return assi.files.readJson(WAKE, null) || {};
}

/** Выключить отклик на имя (два слушателя микрофона одновременно не работают), запомнив, был ли он. */
exports.wakeOff = function () {
  var mark = wakeMark();
  var status = tryNative('wake.status');
  if (!mark.pending) {
    mark = { pending: true, was: !!(status && status.on), at: Date.now() };
    assi.files.writeJson(WAKE, mark);
  }
  if (status && status.on) tryNative('wake.set', false);
  exports.beat();
  watch();
  return { was: mark.was };
};

/** Вернуть отклик на имя, каким он был до игры; остановить непрерывное распознавание. */
exports.wakeRestore = function () {
  var mark = wakeMark();
  if (mark.stream) tryNative('speech.stream.stop');
  if (!mark.pending) {
    if (mark.stream) assi.files.writeJson(WAKE, merge(mark, { stream: false }));
    return false;
  }
  if (mark.was) tryNative('wake.set', true);
  assi.files.writeJson(WAKE, { pending: false, was: mark.was, restored: Date.now() });
  return true;
};

/** Экран жив и игра идёт (зовётся раз в несколько секунд). */
exports.beat = function () {
  lastBeat = Date.now();
  return true;
};

/** Экран включил или выключил непрерывное распознавание — чтобы сторож мог его остановить. */
exports.streamMark = function (on) {
  var mark = wakeMark();
  mark.stream = !!on;
  assi.files.writeJson(WAKE, mark);
  return true;
};

/**
 * Сторож: если экран игры закрыли посреди хода (или он упал) и перестал отзываться,
 * отклик на имя возвращается, а микрофон отпускается.
 */
function watch() {
  if (watching) return;
  watching = true;
  spawn(function () {
    try {
      while (true) {
        sleep(5000);
        var mark = wakeMark();
        if (!mark.pending && !mark.stream) break;
        if (Date.now() - lastBeat > exports.settings().watchdogSeconds * 1000) {
          exports.wakeRestore();
          break;
        }
      }
    } catch (error) {
      console.error('hat: сторож: ' + error);
    } finally {
      watching = false;
    }
  });
}

exports.vibrate = function (pattern) {
  if (Array.isArray(pattern)) {
    if (has('vibrate.pattern')) {
      assi.vibrate(pattern.map(Number));
      return true;
    }
    var longest = 0;
    for (var i = 1; i < pattern.length; i += 2) longest = Math.max(longest, Number(pattern[i]) || 0);
    if (longest > 0) assi.vibrate(longest);
    return true;
  }
  var ms = Number(pattern) || 0;
  if (ms > 0) assi.vibrate(ms);
  return true;
};

// ---- игры и ходы ----------------------------------------------------------------------------

/** Игра началась: запись в базе, отклик на имя выключен. → id игры. */
exports.gameStart = function (game) {
  db().exec('insert into games (started, mode, players, teams, settings, deck_id) values (?, ?, ?, ?, ?, ?)', [
    Date.now(), game.mode, JSON.stringify(game.players || []), JSON.stringify(game.teams || []),
    JSON.stringify(game.settings || {}), game.deckId || null
  ]);
  var id = db().lastId();
  if (game.deckId) db().exec('update decks set played = 1 where id = ?', [game.deckId]);
  if (game.wake !== false) exports.wakeOff();
  return id;
};

function historyFor(gameId, turnId, results) {
  var now = Date.now();
  (results || []).forEach(function (entry) {
    if (!entry.word) return;
    db().exec('insert into word_history (word, played_at, guessed, game_id, turn_id) values (?, ?, ?, ?, ?)',
      [entry.word, now, rules.counts(entry.result) ? 1 : 0, gameId, turnId]);
  });
}

/** Ход сыгран: results — [{ word, result, ms, heard, how, latency }]. → id хода. */
exports.turnSave = function (gameId, turn) {
  db().exec('insert into turns (game_id, round, explainer, guesser, started, results) values (?, ?, ?, ?, ?, ?)', [
    gameId, turn.round, turn.explainerName || '', turn.guesserName || '', turn.started || Date.now(), JSON.stringify(turn.results || [])
  ]);
  var id = db().lastId();
  historyFor(gameId, id, turn.results);
  if (turn.achieve !== false) telepath(turn.results);
  return id;
};

/**
 * Ачивка «Телепат» в «Ачивки за жизнь» (если модуля нет — в общий ящик, он заберёт): слово угадано
 * не дольше чем за telepathSeconds. «Душа компании» выдают сами Ачивки — по записям вечеров в общей базе.
 */
function telepath(results) {
  try {
    var s = exports.settings();
    if (!rules.telepath(results, s.telepathSeconds)) return null;
    return achieve.give(assi.files, require, {
      key: 'hat/telepath', source: 'hat', category: 'Игротека', title: 'Телепат', icon: 'bolt', rarity: 'uncommon', hidden: true,
      text: 'Слово в Шляпе угадано за ' + s.telepathSeconds + ' с или быстрее', at: Date.now()
    }, ACHIEVED);
  } catch (error) {
    console.warn('hat: ачивка: ' + message(error));
    return null;
  }
}

/** Исход слов хода исправили между ходами. */
exports.turnUpdate = function (gameId, turnId, results) {
  db().exec('update turns set results = ? where id = ?', [JSON.stringify(results || []), turnId]);
  db().exec('delete from word_history where turn_id = ?', [turnId]);
  historyFor(gameId, turnId, results);
  return true;
};

/** Запись в общую базу: одна на вечер — вторая игра того же вечера дополняет первую. */
function recordEvening(players, summary, s) {
  var base = require('lib/base');
  var since = Date.now() - 8 * HOUR;
  var found = base.find({ kind: 'event', source: 'hat', since: since, limit: 1 });
  var data = { players: players.length, words: summary.words || 0, games: 1 };
  if (s.namesToBase) {
    data.winner = summary.winner || '';
    data.names = players;
  }
  if (found.length) {
    var was = found[0].data || {};
    data.games = (was.games || 1) + 1;
    data.words = (was.words || 0) + data.words;
    data.players = Math.max(was.players || 0, data.players);
    if (s.namesToBase) {
      data.winner = data.winner || was.winner || '';
      data.names = (was.names || []).concat(players.filter(function (name) { return (was.names || []).indexOf(name) < 0; }));
      data.players = Math.max(data.players, data.names.length);
    }
    base.update(found[0].id, { data: data });
    return found[0].id;
  }
  return base.add({ kind: 'event', title: 'Шляпа', tags: ['игра', 'компания'], data: data, source: 'hat' });
}

/**
 * Игра окончена (или её завершили раньше): итоги в базу, неугаданные слова — в следующую
 * колоду, запись в общую базу, отклик на имя — обратно.
 * info: { scores, summary, players, unguessed: [карты] }; для проверок — toBase: false,
 * keep: true (не трогать отклик на имя, сохранённую игру и перенос слов).
 */
exports.gameEnd = function (gameId, info) {
  info = info || {};
  var s = exports.settings();
  var summary = info.summary || {};
  db().exec('update games set ended = ?, scores = ?, summary = ? where id = ?',
    [Date.now(), JSON.stringify(info.scores || {}), JSON.stringify(summary), gameId]);
  if (s.carryUnguessed && !info.keep && info.unguessed && info.unguessed.length) {
    assi.files.writeJson(CARRY, assi.files.readJson(CARRY, []).concat(info.unguessed).slice(0, 100));
  }
  var record = null;
  if (info.toBase !== false) {
    try {
      record = recordEvening(info.players || [], summary, s);
    } catch (error) {
      console.error('hat: общая база: ' + error);
    }
  }
  if (!info.keep) {
    exports.wakeRestore();
    exports.clearState();
  }
  cleanup(true);
  return { record: record };
};

/** Убрать игру целиком (для проверок): ходы, историю слов, запись игры. */
exports.removeGame = function (gameId) {
  db().exec('delete from word_history where game_id = ?', [gameId]);
  db().exec('delete from turns where game_id = ?', [gameId]);
  db().exec('delete from games where id = ?', [gameId]);
  return true;
};

/** Статистика игроков по всем играм: [{ name, games, wins, words, perMinute }]. */
exports.stats = function () {
  var people = {};
  db().query('select players, summary from games where ended is not null order by started desc limit 300').forEach(function (row) {
    var summary = {};
    try { summary = JSON.parse(row.summary || '{}'); } catch (ignored) { summary = {}; }
    var winners = {};
    (summary.places || []).forEach(function (place) {
      if (place.place !== 1) return;
      (place.members || [place.name]).forEach(function (name) { winners[name] = true; });
    });
    (summary.explainers || []).forEach(function (item) {
      var person = people[item.name] = people[item.name] || { name: item.name, games: 0, wins: 0, words: 0, ms: 0 };
      person.games += 1;
      person.words += item.words || 0;
      person.ms += item.ms || 0;
      if (winners[item.name]) person.wins += 1;
    });
  });
  return Object.keys(people).map(function (name) {
    var person = people[name];
    person.perMinute = person.ms > 0 ? Math.round(person.words / (person.ms / 60000) * 10) / 10 : 0;
    delete person.ms;
    return person;
  }).sort(function (a, b) { return b.words - a.words; });
};

/** Старое — прочь: колоды старше срока (если не отмечены «сохранить»), история сверх предела. */
function cleanup(force) {
  var stamp = assi.files.readJson(CLEANED, { at: 0 });
  if (!force && Date.now() - stamp.at < DAY) return;
  var s = exports.settings();
  db().exec('delete from decks where keep = 0 and created < ?', [Date.now() - s.deckDays * DAY]);
  db().exec('delete from word_history where id not in (select id from word_history order by played_at desc limit ?)', [Math.max(s.noRepeat, 1)]);
  assi.files.writeJson(CLEANED, { at: Date.now() });
}

// ---- открытие экрана --------------------------------------------------------------------------

/** Всё, что нужно экрану при открытии. Заодно — вернуть отклик на имя, если игру бросили. */
exports.init = function () {
  var current = exports.loadState();
  var mark = wakeMark();
  var restored = false;
  if ((mark.pending || mark.stream) && Date.now() - lastBeat > exports.settings().watchdogSeconds * 1000) {
    restored = exports.wakeRestore();
  }
  try {
    cleanup(false);
  } catch (error) {
    console.error('hat: уборка: ' + error);
  }
  return {
    settings: exports.settings(),
    current: current,
    decks: exports.decks(),
    features: exports.features(),
    prefill: takePrefill(),
    offline: exports.offlineInfo(),
    restored: restored,
    themes: config.THEMES
  };
};
