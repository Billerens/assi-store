// «Рисуй — угадаю» — логика в движке: настройки, модели (угадывание по снимку и рисунок
// штрихами), слова, запас рисунков, раунды и партии в data/draw-guess.db, картинки рисунков,
// отклик на имя на время голосового угадывания, общая база, сравнение моделей.
// Экран зовёт эти функции через assi.call('modules/draw-guess/main.js', имя, аргументы).
//
// Для агента: «давай порисуем» — require('modules/draw-guess/main.js').open({ mode: 'human' });
// «нарисуй что-нибудь, а я угадаю» — open({ mode: 'model', start: true }). Ещё можно передать
// theme (любая строка), difficulty (1–5), players (имена команд), teams, drawSeconds, rounds.
// Агент узнаёт об этом из инструмента tools/draw-guess.js (action open), который start() пишет при
// каждом запуске Assi (module.json "autostart"); текст инструмента — в tool.js.
// Ачивки партии уходят в «Ачивки за жизнь» (awards.js).
var assi = require('lib/assi');
var ai = require('lib/ai');
var match = require('./match');
var config = require('./config');
var canvas = require('./canvas');
var talk = require('./guess');
var cards = require('./cards');
var agentTool = require('./tool');
var awards = require('./awards');

var DIR = 'data/draw-guess';
var SETTINGS = DIR + '/settings.json';
var WAKE = DIR + '/wake.json';
var QUEUE = DIR + '/cards.json';
var PREFILL = DIR + '/prefill.json';
var CLEANED = DIR + '/cleaned.json';
var DAILY = DIR + '/daily.json';
var ART = DIR + '/art';
var SCREEN = 'modules/draw-guess/ui/index.html';
var ROLE_GUESS = 'draw.guess';
var ROLE_PAINT = 'draw.paint';
var DAY = 24 * 3600000;

var prepared = false;

function db() {
  var handle = assi.db('draw-guess');
  if (!prepared) {
    handle.exec('create table if not exists rounds (id integer primary key autoincrement, at integer not null, mode text, word text, ' +
      'secret_known integer, strokes text, guesses text, result text, time_ms integer, requests integer, role_model text, ' +
      'player text, game_id integer, people_knew integer default 0)');
    // Старые базы: столбец «люди узнали» появился позже (ачивка «Нераспознанный гений»).
    try {
      handle.exec('alter table rounds add column people_knew integer default 0');
    } catch (error) { /* уже есть */ }
    handle.exec('create table if not exists drawings (id integer primary key autoincrement, word text not null, strokes text not null, ' +
      'created integer not null, checked integer default 0, used_at integer, retried integer default 0, difficulty integer)');
    handle.exec('create table if not exists games (id integer primary key autoincrement, started integer not null, ended integer, ' +
      'mode text, players text, rounds integer, model_hits integer, human_hits integer, cost real, scores text)');
    handle.exec('create table if not exists bench (id integer primary key autoincrement, word text not null, strokes text not null, created integer)');
    handle.exec('create table if not exists bench_runs (id integer primary key autoincrement, at integer, role_model text, ' +
      'total integer, hits integer, avg_ms integer)');
    handle.exec('create index if not exists rounds_at on rounds (at)');
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

function parse(text, fallback) {
  try {
    return JSON.parse(text);
  } catch (error) {
    return fallback;
  }
}

// ---- настройки и возможности ------------------------------------------------------------------

exports.settings = function () {
  return config.normalize(assi.files.readJson(SETTINGS, {}));
};

exports.saveSettings = function (patch) {
  var next = config.normalize(merge(exports.settings(), patch));
  assi.files.writeJson(SETTINGS, next);
  return next;
};

var featureCache = null;
var featureAt = 0;

/** Правки оболочки на этом телефоне (docs/shell-changes.md); нет операции — пусто. */
exports.features = function () {
  if (!featureCache || Date.now() - featureAt > 60000) {
    var list = tryNative('shell.features');
    featureCache = Array.isArray(list) ? list.map(String) : [];
    featureAt = Date.now();
  }
  return featureCache;
};

exports.open = function (prefill) {
  assi.files.writeJson(PREFILL, merge(prefill || {}, { at: Date.now() }));
  native('ui.open', SCREEN);
  return 'Открыта игра «Рисуй — угадаю»';
};

/** Инструмент агента tools/draw-guess.js: { action: 'open', mode, start, theme, difficulty, … }. */
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

// ---- модели ------------------------------------------------------------------------------------

/** Что назначено роли: { assigned, vision, local, model }; без назначения — основная модель. */
function role(name) {
  var roles = tryNative('models.roles') || {};
  var own = roles[name] && roles[name].model ? roles[name] : null;
  var used = own || (roles.main && roles.main.model ? roles.main : null);
  var resolved = tryNative('models.resolve', name);
  var baseUrl = resolved && resolved.baseUrl ? String(resolved.baseUrl) : '';
  return {
    assigned: !!own,
    vision: !!(used && used.vision),
    local: /^local:/i.test(baseUrl),
    model: used ? String(used.model) : '',
    provider: used ? String(used.provider || '') : '',
    ready: !!used
  };
}

/** Роли угадывания и рисунка + насколько быстро угадывающая модель отвечала раньше. */
exports.roleInfo = function () {
  var s = exports.settings();
  var guess = role(ROLE_GUESS);
  var paint = role(ROLE_PAINT);
  var rows = db().query('select guesses from rounds where mode = ? and role_model = ? order by at desc limit 20', ['human_draws', guess.model]);
  var times = [];
  rows.forEach(function (row) {
    parse(row.guesses, []).forEach(function (g) { if (g.ms > 0) times.push(g.ms); });
  });
  guess.avgMs = times.length ? Math.round(times.reduce(function (a, b) { return a + b; }, 0) / times.length) : 0;
  guess.slow = guess.avgMs > s.slowSeconds * 1000;
  guess.interval = guess.local ? s.localInterval : s.minInterval;
  return { guess: guess, paint: paint };
};

/**
 * Догадка по снимку. options: { image (data:image/jpeg;base64,…), rejected, warm, theme, final }.
 * → { guess, confidence, alternatives, say, ms, model } или { error }.
 */
exports.guess = function (options) {
  options = options || {};
  var s = exports.settings();
  var image = String(options.image || '');
  if (!/^data:image\/(jpeg|png|webp);base64,/.test(image)) return { error: 'нет снимка' };
  var p = talk.guessPrompt({
    rejected: options.rejected, warm: options.warm, theme: s.hintTheme ? options.theme : '',
    final: options.final, alternatives: s.finalAlternatives
  });
  var started = Date.now();
  try {
    var answer = ai.ask({ role: ROLE_GUESS, system: p.system, prompt: p.prompt, images: [image], json: true });
    var parsed = talk.parseGuess(answer, { sayMaxWords: s.sayMaxWords });
    if (!parsed) return { error: 'модель не дала догадки', ms: Date.now() - started };
    parsed.ms = Date.now() - started;
    parsed.model = role(ROLE_GUESS).model;
    return parsed;
  } catch (error) {
    return { error: message(error), ms: Date.now() - started };
  }
};

/** Рисунок модели по слову: { ok, word, strokes: [{ d, length }], why, tries }. */
exports.paint = function (word) {
  var s = exports.settings();
  var why = '';
  var best = null;
  for (var tries = 1; tries <= s.paintRetries + 1; tries++) {
    var p = talk.paintPrompt(word, { strokesMin: s.strokesMin, strokesMax: s.strokesMax, maxPoints: s.maxPoints, retry: why });
    var answer;
    try {
      answer = ai.ask({ role: ROLE_PAINT, system: p.system, prompt: p.prompt, json: true });
    } catch (error) {
      return { ok: false, word: word, strokes: [], why: message(error), tries: tries };
    }
    var checked = canvas.validatePainting(answer, { minStrokes: s.strokesMin, maxStrokes: s.strokesMax, maxPoints: s.maxPoints });
    if (checked.ok) return { ok: true, word: word, strokes: checked.strokes, why: '', tries: tries };
    why = checked.why;
    if (checked.count && checked.strokes.length >= 3 && (!best || checked.strokes.length > best.length)) best = checked.strokes;
  }
  // Число штрихов не то, но сам рисунок разобрался — лучше такой, чем никакого.
  if (best) return { ok: true, word: word, strokes: best.slice(0, s.strokesMax), why: 'число штрихов: ' + why, tries: tries - 1, lenient: true };
  return { ok: false, word: word, strokes: [], why: why, tries: tries - 1 };
};

// ---- слова -------------------------------------------------------------------------------------

function dictionary() {
  return require('./words.json');
}

function hatInstalled() {
  return assi.files.exists('modules/hat/main.js');
}

function recentSet(limit) {
  var out = {};
  if (!limit) return out;
  db().query('select word from rounds order by at desc limit ?', [limit]).forEach(function (row) { out[match.normalize(row.word)] = true; });
  db().query('select word from drawings where used_at is null').forEach(function (row) { out[match.normalize(row.word)] = true; });
  return out;
}

function queueKey(o) {
  return [o.theme || 'общее', o.difficulty || 2, o.synonyms ? 1 : 0].join('|');
}

var refilling = {};

/** Пополнить очередь карточек генератором Шляпы (в фоне; без Шляпы или без сети — ничего). */
function refill(options) {
  var key = queueKey(options);
  if (refilling[key] || !hatInstalled()) return;
  refilling[key] = true;
  spawn(function () {
    try {
      var made = require('modules/hat/main.js').generate({
        theme: options.theme, difficulty: options.difficulty, count: 10, drawable: true, synonyms: options.synonyms
      });
      if (made && made.source !== 'offline') {
        var recent = recentSet(exports.settings().recentWords);
        var fresh = (made.cards || []).map(cards.toCard).filter(function (card) { return card.word && !recent[match.normalize(card.word)]; });
        var queue = assi.files.readJson(QUEUE, {});
        queue[key] = (queue[key] || []).concat(fresh).slice(0, 40);
        assi.files.writeJson(QUEUE, queue);
      }
    } catch (error) {
      console.warn('draw-guess: слова от Шляпы: ' + message(error));
    } finally {
      refilling[key] = false;
    }
  });
}

/**
 * Следующая карточка: из очереди, что приготовил генератор Шляпы, иначе из запаса без сети.
 * options: { theme, difficulty, synonyms, offline }; offline — только запас, без модели (проверки).
 * → { word, forms, roots, synonyms, difficulty, source }.
 */
exports.card = function (options) {
  options = options || {};
  var s = exports.settings();
  var o = {
    theme: options.theme || s.theme, difficulty: options.difficulty || s.difficulty,
    synonyms: options.synonyms === undefined ? s.synonyms : options.synonyms
  };
  if (options.offline) {
    var plain = cards.offline(dictionary(), { theme: o.theme, difficulty: o.difficulty, count: 1, exclude: recentSet(s.recentWords) });
    return merge(plain[0], { source: 'offline' });
  }
  var key = queueKey(o);
  var queue = assi.files.readJson(QUEUE, {});
  var list = queue[key] || [];
  var recent = recentSet(s.recentWords);
  var card = null;
  while (list.length && !card) {
    var next = list.shift();
    if (!recent[match.normalize(next.word)]) card = merge(next, { source: 'model' });
  }
  queue[key] = list;
  assi.files.writeJson(QUEUE, queue);
  if (list.length < 3) refill(o);
  if (card) return card;
  var picked = cards.offline(dictionary(), { theme: o.theme, difficulty: o.difficulty, count: 1, exclude: recent });
  return merge(picked[0], { source: 'offline' });
};

// ---- запас рисунков модели ---------------------------------------------------------------------

var filling = false;

exports.stockInfo = function () {
  var s = exports.settings();
  var ready = db().query('select count(*) as n from drawings where used_at is null and id != ?', [reservedId()])[0].n;
  return { ready: ready, size: s.stockSize, filling: filling, check: s.checkPaint };
};

/** Подготовить рисунки в запас (в фоне), пока есть сеть; ошибка модели — стоп до следующего раза. */
exports.fillStock = function () {
  if (filling) return exports.stockInfo();
  filling = true;
  spawn(function () {
    try {
      var s = exports.settings();
      var failures = 0;
      while (failures < 2) {
        var ready = db().query('select count(*) as n from drawings where used_at is null')[0].n;
        if (ready >= s.stockSize) break;
        var card = cards.offline(dictionary(), { difficulty: s.difficulty, count: 1, exclude: recentSet(s.recentWords) })[0];
        var made = exports.paint(card.word);
        if (!made.ok) {
          failures += 1;
          console.warn('draw-guess: запас: ' + made.why);
          continue;
        }
        db().exec('insert into drawings (word, strokes, created, difficulty) values (?, ?, ?, ?)',
          [card.word, JSON.stringify(made.strokes), Date.now(), card.difficulty]);
      }
    } catch (error) {
      console.warn('draw-guess: запас: ' + message(error));
    } finally {
      filling = false;
    }
  });
  return exports.stockInfo();
};

function drawingRow(row) {
  return { id: row.id, word: row.word, strokes: parse(row.strokes, []), checked: !!row.checked, retried: !!row.retried, difficulty: row.difficulty };
}

/**
 * Рисунок для раунда «Assi рисует»: из запаса (старый первым), иначе — нарисовать сейчас.
 * → { id, word, strokes, checked, fresh } или { error }.
 */
exports.takeDrawing = function (options) {
  options = options || {};
  if (options.daily) {
    var daily = takeDaily();
    if (daily) return daily;
  }
  var rows = db().query('select * from drawings where used_at is null and id != ? order by created asc limit 1', [reservedId()]);
  if (rows.length) {
    db().exec('update drawings set used_at = ? where id = ?', [Date.now(), rows[0].id]);
    return drawingRow(rows[0]);
  }
  var card = exports.card({ theme: options.theme, difficulty: options.difficulty, synonyms: false });
  var made = exports.paint(card.word);
  if (!made.ok) return { error: made.why || 'модель не нарисовала' };
  db().exec('insert into drawings (word, strokes, created, used_at, difficulty) values (?, ?, ?, ?, ?)',
    [card.word, JSON.stringify(made.strokes), Date.now(), Date.now(), card.difficulty]);
  return { id: db().lastId(), word: card.word, strokes: made.strokes, checked: false, fresh: true };
};

// ---- рисунок дня для «Игры дня» -----------------------------------------------------------------
//
// «Игра дня» (modules/game-of-the-day) утром заказывает dayDrawing(): один рисунок модели на день
// откладывается из запаса (или рисуется сразу, если запас пуст), а владелец угадывает его, когда
// удобно, хоть без сети — экран ?daily=1 играет один раунд «Assi рисует» именно с ним.

function pad2(n) {
  return (n < 10 ? '0' : '') + n;
}

function dayKey(time) {
  var d = new Date(time);
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}

function dailyMark() {
  var mark = assi.files.readJson(DAILY, null);
  return mark && typeof mark === 'object' && mark.id ? mark : null;
}

/** id рисунка, отложенного на сегодня и ещё не сыгранного: обычные раунды его не берут (-1 — нет такого). */
function reservedId() {
  var mark = dailyMark();
  return mark && !mark.played && mark.date === dayKey(Date.now()) ? mark.id : -1;
}

function dailyView(mark) {
  var text = !mark.played ? 'Модель нарисовала загадку — угадайте, что это'
    : mark.result === 'guessed' ? 'Угадан' : mark.result ? 'Не угадан' : 'Уже открыт';
  return {
    ready: true, date: mark.date, played: !!mark.played, result: mark.result || null,
    open: SCREEN + '?daily=1', title: 'Рисунок дня', text: text
  };
}

/**
 * Рисунок дня: (date 'ГГГГ-ММ-ДД' — сегодня по умолчанию, options). Один на день: из запаса (старый
 * первым), а если запас пуст — нарисованный сейчас (нужна сеть). Само слово не отдаётся: это загадка.
 * options.peek — только узнать, отложен ли он, ничего не заказывая.
 * → { ready: true, date, played, result, open, title, text } или { ready: false, date, why }.
 */
exports.dayDrawing = function (date, options) {
  options = options || {};
  date = /^\d{4}-\d{2}-\d{2}$/.test(String(date || '')) ? String(date) : dayKey(Date.now());
  var s = exports.settings();
  var mark = dailyMark();
  if (mark && mark.date === date) return dailyView(mark);
  if (!s.dailyDrawing) return { ready: false, date: date, why: 'рисунок дня выключен в настройках «Рисуй — угадаю»' };
  if (options.peek) return { ready: false, date: date, why: 'ещё не заказан' };
  var rows = db().query('select id from drawings where used_at is null order by created asc limit 1');
  var id = rows.length ? rows[0].id : null;
  if (!id) {
    var card = cards.offline(dictionary(), { difficulty: s.difficulty, count: 1, exclude: recentSet(s.recentWords) })[0];
    var made = exports.paint(card.word);
    if (!made.ok) return { ready: false, date: date, why: made.why || 'модель не нарисовала' };
    db().exec('insert into drawings (word, strokes, created, difficulty) values (?, ?, ?, ?)',
      [card.word, JSON.stringify(made.strokes), Date.now(), card.difficulty]);
    id = db().lastId();
  }
  mark = { date: date, id: id, at: Date.now(), played: null, result: null };
  assi.files.writeJson(DAILY, mark);
  return dailyView(mark);
};

/** Раунд «рисунок дня»: отложенный рисунок, если он ещё не сыгран; иначе null — обычный из запаса. */
function takeDaily() {
  var mark = dailyMark();
  if (!mark || mark.played) return null;
  var rows = db().query('select * from drawings where id = ? and used_at is null', [mark.id]);
  if (!rows.length) return null;
  db().exec('update drawings set used_at = ? where id = ?', [Date.now(), mark.id]);
  mark.played = Date.now();
  assi.files.writeJson(DAILY, mark);
  var out = drawingRow(rows[0]);
  out.daily = true;
  return out;
}

/** Открыть рисунок дня на экране (агенту и «Игре дня»). */
exports.openDaily = function () {
  native('ui.open', SCREEN + '?daily=1');
  return 'Открыт рисунок дня';
};

/**
 * Проверка рисунка зрением (снимок делает экран): ok — рисунок годен; нет — перерисовать то же
 * слово один раз, второй раз — другое слово. → { ok, drawing } (новый рисунок или null).
 */
exports.verifyDrawing = function (id, image) {
  var rows = db().query('select * from drawings where id = ?', [id]);
  if (!rows.length) return { ok: false, drawing: null, why: 'нет рисунка' };
  var row = rows[0];
  var answer = exports.guess({ image: image, final: true });
  if (answer.error) return { ok: true, drawing: null, why: 'проверка не удалась: ' + answer.error };
  var verdict = talk.judge(answer, { word: row.word, forms: [] });
  if (verdict.ok) {
    db().exec('update drawings set checked = 1 where id = ?', [id]);
    return { ok: true, drawing: null, guess: answer };
  }
  if (!row.retried) {
    var again = exports.paint(row.word);
    if (again.ok) {
      db().exec('update drawings set strokes = ?, retried = 1 where id = ?', [JSON.stringify(again.strokes), id]);
      return { ok: false, drawing: { id: id, word: row.word, strokes: again.strokes, checked: false, retried: true }, guess: answer };
    }
  }
  db().exec('delete from drawings where id = ?', [id]);
  var other = exports.takeDrawing({});
  return { ok: false, drawing: other.error ? null : other, guess: answer, replaced: true };
};

// ---- раунды, партии, картинки ------------------------------------------------------------------

/**
 * Раунд сыгран: { mode, word, secretKnown, strokes, guesses, result, timeMs, requests, roleModel, player, gameId,
 * peopleKnew } — peopleKnew: модель не узнала рисунок «Я рисую», а люди рядом узнали (кнопка в итогах раунда).
 */
exports.saveRound = function (round) {
  var peopleKnew = round.mode === 'human_draws' && round.result !== 'guessed' && round.peopleKnew ? 1 : 0;
  db().exec('insert into rounds (at, mode, word, secret_known, strokes, guesses, result, time_ms, requests, role_model, player, game_id, people_knew) ' +
    'values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [
    Date.now(), round.mode, round.word || '', round.secretKnown ? 1 : 0, JSON.stringify(round.strokes || []),
    JSON.stringify(round.guesses || []), round.result || 'missed', Math.round(round.timeMs || 0), round.requests || 0,
    round.roleModel || '', round.player || '', round.gameId || null, peopleKnew
  ]);
  if (round.daily) {
    var mark = dailyMark();
    if (mark) {
      mark.result = round.result === 'guessed' ? 'guessed' : 'missed';
      assi.files.writeJson(DAILY, mark);
    }
  }
  return db().lastId();
};

exports.removeRound = function (id) {
  db().exec('delete from rounds where id = ?', [id]);
  return true;
};

/** Картинка рисунка (PNG или JPEG data URL) → data/draw-guess/art/<id>.png. */
exports.saveArt = function (id, dataUrl) {
  var found = /^data:image\/(png|jpeg);base64,(.+)$/.exec(String(dataUrl || ''));
  if (!found) throw new Error('Нет картинки');
  var path = ART + '/' + String(id).replace(/[^\w-]/g, '') + (found[1] === 'png' ? '.png' : '.jpg');
  var bytes = java.util.Base64.getDecoder().decode(String(found[2]));
  var target = java.nio.file.Paths.get(assi.files.path(path));
  java.nio.file.Files.createDirectories(target.getParent());
  java.nio.file.Files.write(target, bytes);
  return path;
};

exports.removeArt = function (path) {
  if (/^data\/draw-guess\/art\/[\w-]+\.(png|jpg)$/.test(path) && assi.files.exists(path)) assi.files.remove(path);
  return true;
};

/** Сколько потрачено на модели сегодня (usage.summary) — экран берёт разницу до и после партии. */
exports.usageNow = function () {
  var summary = tryNative('usage.summary', 1);
  var day = summary && summary.days && summary.days[0];
  return day ? Number(day.cost) || 0 : 0;
};

/** Партия началась: { mode: 'human_draws'|'model_draws', players, listen } → id. */
exports.gameStart = function (game) {
  game = game || {};
  db().exec('insert into games (started, mode, players) values (?, ?, ?)', [Date.now(), game.mode || '', JSON.stringify(game.players || [])]);
  var id = db().lastId();
  if (game.listen) exports.wakeOff();
  return id;
};

function recordGame(info) {
  var base = require('lib/base');
  return base.add({
    kind: 'event', title: 'Рисуй — угадаю', tags: ['игра'], source: 'draw-guess',
    data: { rounds: info.rounds || 0, modelHits: info.modelHits || 0, humanHits: info.humanHits || 0 }
  });
}

/** Партия окончена: { rounds, modelHits, humanHits, cost, scores, toBase, keep }. */
exports.gameEnd = function (gameId, info) {
  info = info || {};
  var s = exports.settings();
  db().exec('update games set ended = ?, rounds = ?, model_hits = ?, human_hits = ?, cost = ?, scores = ? where id = ?', [
    Date.now(), info.rounds || 0, info.modelHits || 0, info.humanHits || 0, info.cost || 0, JSON.stringify(info.scores || {}), gameId
  ]);
  var record = null;
  if (s.namesToBase && info.toBase !== false && info.rounds > 0) {
    try {
      record = recordGame(info);
    } catch (error) {
      console.error('draw-guess: общая база: ' + message(error));
    }
  }
  var earned = [];
  if (!info.keep && info.toBase !== false && info.rounds > 0) {
    try {
      earned = reportAwards(s);
    } catch (error) {
      console.warn('draw-guess: ачивки: ' + message(error));
    }
  }
  if (!info.keep) {
    exports.wakeRestore();
    exports.fillStock();
  }
  cleanup(true);
  return { record: record, awards: earned };
};

/**
 * Ачивки после партии: «Художник» — модель узнала artistStreak рисунков «Я рисую» подряд;
 * «Нераспознанный гений» — модель не узнала, а люди узнали geniusCount рисунков (всего).
 */
function reportAwards(s) {
  if (!s.achievements) return [];
  var results = db().query('select result from rounds where mode = ? order by at desc, id desc limit ?', ['human_draws', s.artistStreak])
    .map(function (row) { return String(row.result); });
  var unrecognized = db().query('select count(*) as genius from rounds where mode = ? and result != ? and people_knew = 1', ['human_draws', 'guessed']);
  var genius = unrecognized.length ? Number(unrecognized[0].genius) || 0 : 0;
  var items = awards.earned(results, s, Date.now(), { genius: genius });
  if (!items.length) return [];
  return awards.deliver(items, assi.files, function (path) { return require(path); });
}

exports.removeGame = function (gameId) {
  db().exec('delete from rounds where game_id = ?', [gameId]);
  db().exec('delete from games where id = ?', [gameId]);
  return true;
};

/** Итоги по раундам партии: модель угадала N из M в среднем за T; люди — так же. */
exports.gameStats = function (gameId) {
  var rows = db().query('select mode, result, time_ms from rounds where game_id = ?', [gameId]);
  var out = { human_draws: { rounds: 0, hits: 0, ms: 0 }, model_draws: { rounds: 0, hits: 0, ms: 0 } };
  rows.forEach(function (row) {
    var item = out[row.mode];
    if (!item) return;
    item.rounds += 1;
    if (row.result === 'guessed') {
      item.hits += 1;
      item.ms += row.time_ms || 0;
    }
  });
  Object.keys(out).forEach(function (key) {
    out[key].avgMs = out[key].hits ? Math.round(out[key].ms / out[key].hits) : 0;
    delete out[key].ms;
  });
  return out;
};

// ---- сравнение моделей ---------------------------------------------------------------------------

/** Набор рисунков для сравнения: свои рисунки владельца (по кнопке) и образцы из samples.js. */
exports.bench = function () {
  var own = db().query('select * from bench order by created asc').map(function (row) {
    return { id: row.id, word: row.word, strokes: parse(row.strokes, []), own: true };
  });
  var samples = require('./samples').list().map(function (item, i) { return { id: 'sample' + i, word: item.word, strokes: item.strokes, own: false }; });
  return own.concat(samples);
};

exports.benchAdd = function (word, strokes) {
  if (!word || !strokes || !strokes.length) throw new Error('Нужны слово и рисунок');
  db().exec('insert into bench (word, strokes, created) values (?, ?, ?)', [String(word), JSON.stringify(strokes), Date.now()]);
  return db().lastId();
};

exports.benchRemove = function (id) {
  db().exec('delete from bench where id = ?', [id]);
  return true;
};

/** Прогон набора через угадывающую модель (снимки делает экран): { model, total, hits, avgMs }. */
exports.benchRecord = function (run) {
  db().exec('insert into bench_runs (at, role_model, total, hits, avg_ms) values (?, ?, ?, ?, ?)',
    [Date.now(), run.model || role(ROLE_GUESS).model, run.total || 0, run.hits || 0, Math.round(run.avgMs || 0)]);
  return db().lastId();
};

/** Сравнение моделей: прогоны набора и живые раунды «Я рисую» по модели. */
exports.compare = function () {
  var runs = db().query('select * from bench_runs order by at desc limit 30').map(function (row) {
    return { at: row.at, model: row.role_model, total: row.total, hits: row.hits, avgMs: row.avg_ms };
  });
  var live = {};
  db().query('select role_model, result, time_ms, guesses from rounds where mode = ?', ['human_draws']).forEach(function (row) {
    var key = row.role_model || '—';
    var item = live[key] = live[key] || { model: key, rounds: 0, hits: 0, answerMs: 0, answers: 0 };
    item.rounds += 1;
    if (row.result === 'guessed') item.hits += 1;
    parse(row.guesses, []).forEach(function (g) {
      if (g.ms > 0) {
        item.answerMs += g.ms;
        item.answers += 1;
      }
    });
  });
  return {
    runs: runs,
    live: Object.keys(live).map(function (key) {
      var item = live[key];
      return { model: item.model, rounds: item.rounds, hits: item.hits, avgMs: item.answers ? Math.round(item.answerMs / item.answers) : 0 };
    })
  };
};

// ---- отклик на имя на время голосового угадывания ------------------------------------------------

var lastBeat = 0;
var watching = false;

function wakeMark() {
  return assi.files.readJson(WAKE, null) || {};
}

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

exports.beat = function () {
  lastBeat = Date.now();
  return true;
};

exports.streamMark = function (on) {
  var mark = wakeMark();
  mark.stream = !!on;
  assi.files.writeJson(WAKE, mark);
  return true;
};

/** Сторож: экран закрыли посреди игры и он молчит — отклик на имя обратно, микрофон отпущен. */
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
      console.error('draw-guess: сторож: ' + error);
    } finally {
      watching = false;
    }
  });
}

// ---- уборка и открытие -------------------------------------------------------------------------

function cleanup(force) {
  var stamp = assi.files.readJson(CLEANED, { at: 0 });
  if (!force && Date.now() - stamp.at < DAY) return;
  var s = exports.settings();
  db().exec('delete from rounds where at < ?', [Date.now() - s.keepDays * DAY]);
  db().exec('delete from drawings where used_at is not null and used_at < ?', [Date.now() - 30 * DAY]);
  assi.files.writeJson(CLEANED, { at: Date.now() });
}

/**
 * Всё, что нужно экрану при открытии; заодно — запас рисунков в фоне и возврат отклика на имя.
 * options.test — экран открыт проверкой: запас не готовить (это запросы к модели).
 */
exports.init = function (options) {
  options = options || {};
  var mark = wakeMark();
  var restored = false;
  if ((mark.pending || mark.stream) && Date.now() - lastBeat > exports.settings().watchdogSeconds * 1000) {
    restored = exports.wakeRestore();
  }
  try {
    cleanup(false);
  } catch (error) {
    console.error('draw-guess: уборка: ' + error);
  }
  var s = exports.settings();
  if (s.stockSize > 0 && !options.test) exports.fillStock();
  return {
    settings: s,
    features: exports.features(),
    roles: exports.roleInfo(),
    stock: exports.stockInfo(),
    hat: hatInstalled(),
    prefill: takePrefill(),
    restored: restored,
    themes: config.THEMES
  };
};
