// Achievements of this module for «Ачивки за жизнь» (docs/modules/achievements.md). The link is
// optional: with that module installed the item goes to require('modules/achievements/main.js').grant(item);
// without it (or when grant fails) it waits in the shared box data/games/achievements-outbox.json,
// which «Ачивки» take at their start and at the close of every day. Each key is handed in once: the
// keys handed in are kept in the module's own file (`memo`), so a check that runs every day costs nothing.
// Engine code (Rhino, ES5) that node runs too: files and require come in as arguments.
// The same file is in hat, inbox, recorder, holidays, spending and focus.
var MAIN = 'modules/achievements/main.js';
var OUTBOX = 'data/games/achievements-outbox.json';

exports.MAIN = MAIN;
exports.OUTBOX = OUTBOX;

function readJson(files, path, fallback) {
  try {
    if (!files.exists(path)) return fallback;
    var value = files.readJson(path, fallback);
    return value === null || value === undefined ? fallback : value;
  } catch (error) {
    return fallback;
  }
}

function warn(text) {
  try { console.warn('achieve: ' + text); } catch (error) { /* no console */ }
}

/** Was this key handed in already? memo — the module's JSON file { key: when }. */
exports.given = function (files, memo, key) {
  var seen = readJson(files, memo, {});
  return Boolean(seen && typeof seen === 'object' && seen[key]);
};

/** Puts the item into the shared box (once per key). */
function toOutbox(files, item) {
  var box = readJson(files, OUTBOX, []);
  var wrapped = Boolean(box && !Array.isArray(box) && Array.isArray(box.items));
  var list = Array.isArray(box) ? box : (wrapped ? box.items : []);
  if (!list.some(function (one) { return one && one.key === item.key; })) list.push(item);
  if (wrapped) {
    box.items = list;
    files.writeJson(OUTBOX, box);
  } else {
    files.writeJson(OUTBOX, list);
  }
}

/**
 * Hands one achievement in:
 *   item: { key: 'hat/telepath', source, category, title, text, rarity, icon, hidden, at }
 *   load: the module's require (it resolves 'modules/…')
 *   memo: the module's file of keys handed in, e.g. 'data/hat/achievements.json'
 * → 'granted' (the module took it), 'outbox' (it waits in the box), 'already' (handed in before)
 *   or null (nothing worked; it will be tried again next time).
 */
exports.give = function (files, load, item, memo) {
  if (!item || !item.key) return null;
  if (exports.given(files, memo, item.key)) return 'already';
  if (!item.at) item.at = Date.now();
  var how = null;
  if (files.exists(MAIN)) {
    try {
      var achievements = load(MAIN);
      if (achievements && typeof achievements.grant === 'function') {
        achievements.grant(item);
        how = 'granted';
      }
    } catch (error) {
      warn(item.key + ': ' + (error && error.message ? error.message : error));
    }
  }
  if (!how) {
    try {
      toOutbox(files, item);
      how = 'outbox';
    } catch (error) {
      warn('ящик: ' + (error && error.message ? error.message : error));
      return null;
    }
  }
  var seen = readJson(files, memo, {});
  if (!seen || typeof seen !== 'object' || Array.isArray(seen)) seen = {};
  seen[item.key] = item.at;
  files.writeJson(memo, seen);
  return how;
};
