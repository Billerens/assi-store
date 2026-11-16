// Moving a game of the day into the catalog: its new id, its manifest, the rating hook of its
// screen, the days it was played on. Pure logic (engine and node).
var days = require('./days.js');

var RESERVED = ['engine', 'ui', 'links', 'daily', 'archive', 'template'];
var HOOK_SRC = '/modules/game-of-the-day/ui/rate.js';
var HOOK = '<script src="' + HOOK_SRC + '"></script>';
var LETTERS = {
  'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'e', 'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y',
  'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u', 'ф': 'f',
  'х': 'h', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'sch', 'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya'
};

/** «Отражатель лучей» → «otrazhatel-luchey». */
function translit(text) {
  var s = String(text || '').toLowerCase();
  var out = '';
  for (var i = 0; i < s.length; i++) {
    var ch = s.charAt(i);
    out += LETTERS[ch] !== undefined ? LETTERS[ch] : ch;
  }
  return out.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/** An id of the catalog: latin letters, digits, hyphens, up to 24, not reserved. */
function validId(id) {
  return /^[a-z0-9][a-z0-9-]{0,23}$/.test(String(id || '')) && RESERVED.indexOf(String(id)) < 0;
}

/** A day of the daily folder: «2026-11-14». */
function validDate(date) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(date || '')) && days.dayStart(date) !== null;
}

/** A game of the day: its day «2026-11-14» or, for a later game of that day, «2026-11-14-2». */
function validKey(key) {
  return days.parseKey(key) !== null;
}

/** The new id of a kept game: from its title, unique among `taken`; «day-261114» when the title gives none. */
function slugFor(title, date, taken) {
  taken = taken || [];
  var base = translit(title).slice(0, 24).replace(/-+$/, '');
  if (!validId(base)) base = 'day-' + String(date || '').replace(/-/g, '').slice(2);
  if (!validId(base)) base = 'day-game';
  var id = base;
  for (var k = 2; taken.indexOf(id) >= 0 || !validId(id); k++) {
    if (k > 999) throw new Error('Не подобрать имя для игры');
    var tail = '-' + k;
    id = base.slice(0, 24 - tail.length).replace(/-+$/, '') + tail;
  }
  return id;
}

/** The screen of a game of the day with the rating hook (once, before </body>). */
function addHook(html) {
  var text = String(html || '');
  if (text.indexOf(HOOK_SRC) >= 0) return text;
  var at = text.toLowerCase().lastIndexOf('</body>');
  if (at < 0) return text.replace(/\s*$/, '\n') + HOOK + '\n';
  return text.slice(0, at) + HOOK + '\n' + text.slice(at);
}

/** The screen without the hook: a kept game is not rated again. */
function stripHook(html) {
  return String(html || '').split('\n').filter(function (line) { return line.indexOf(HOOK_SRC) < 0; }).join('\n');
}

/** game.json of a kept game: the new id, «на пробу», where it came from. */
function keptManifest(game, id, date, rating) {
  var out = JSON.parse(JSON.stringify(game || {}));
  out.id = id;
  out.status = 'trial';
  out.origin = { from: 'game-of-the-day', date: date, rating: typeof rating === 'number' ? rating : null };
  return out;
}

/** game.json of a game of the day as the hub wants it: the daily id and status. */
function dailyManifest(game, date) {
  var out = JSON.parse(JSON.stringify(game || {}));
  out.id = 'daily/' + date;
  out.status = 'daily';
  if (!out.entry) out.entry = 'ui/index.html';
  if (!out.origin) out.origin = { from: 'game-of-the-day', date: date };
  return out;
}

/**
 * A file of the moved game with its old address replaced: modules/games/daily/<key> → modules/games/<id>.
 * «…/daily/2026-11-14» does not touch «…/daily/2026-11-14-2» (another game of the same day).
 */
function rewrite(text, date, id) {
  date = String(date).replace(/[^0-9-]/g, '');
  return String(text)
    .replace(new RegExp('modules/games/daily/' + date + '(?![-0-9])', 'g'), 'modules/games/' + id)
    .split('"daily/' + date + '"').join('"' + id + '"')
    .split('\'daily/' + date + '\'').join('\'' + id + '\'');
}

/**
 * The engine by its full path: the template's require('../engine/…') is right only from
 * modules/games/<id>/, a game of the day lies one level deeper and moves later.
 */
function fixEngine(text) {
  return String(text).replace(/require\(\s*(['"])(?:\.\.\/)+engine\//g, 'require($1modules/games/engine/');
}

/** Distinct days on which any of `ids` was played since `since`; plays [{game, from, to}]. */
function playDays(plays, ids, since) {
  var seen = {};
  (plays || []).forEach(function (play) {
    if (!play || ids.indexOf(String(play.game)) < 0) return;
    if (since && Number(play.from) < since) return;
    seen[days.dayKey(Number(play.from) || 0)] = true;
  });
  return Object.keys(seen).sort();
}

exports.RESERVED = RESERVED;
exports.HOOK = HOOK;
exports.HOOK_SRC = HOOK_SRC;
exports.translit = translit;
exports.validId = validId;
exports.validDate = validDate;
exports.validKey = validKey;
exports.slugFor = slugFor;
exports.addHook = addHook;
exports.stripHook = stripHook;
exports.keptManifest = keptManifest;
exports.dailyManifest = dailyManifest;
exports.rewrite = rewrite;
exports.fixEngine = fixEngine;
exports.playDays = playDays;
