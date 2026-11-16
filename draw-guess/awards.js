// Ачивки «Рисуй — угадаю» для модуля «Ачивки за жизнь» (docs/modules/achievements.md и games.md):
// ачивка уходит в require('modules/achievements/main.js').grant(item), если модуль есть; иначе —
// в общий ящик data/games/achievements-outbox.json, который модуль ачивок забирает при старте и
// при каждом закрытии суток. Повтор того же key модуль ачивок не засчитывает, но и сами мы
// отданное помним (data/draw-guess/awards.json), чтобы не слать его после каждой партии.
// Чистая логика: движок (require('./awards')) и node (tests/awards.test.js).
var OUTBOX = 'data/games/achievements-outbox.json';
var ACHIEVEMENTS = 'modules/achievements/main.js';
var SENT = 'data/draw-guess/awards.json';
var ICON = 'modules/draw-guess/icon.svg';

/** Сколько последних рисунков «Я рисую» модель узнала подряд; results — от нового к старому. */
exports.streak = function (results) {
  var count = 0;
  for (var i = 0; i < (results || []).length; i++) {
    if (results[i] !== 'guessed') break;
    count += 1;
  }
  return count;
};

/** «Художник»: модель узнала столько рисунков владельца подряд (настройка artistStreak). */
exports.artist = function (count, at) {
  return {
    key: 'draw-guess/artist', source: 'draw-guess', category: 'Игротека',
    title: 'Художник', text: 'Модель узнала ' + count + ' ваших рисунков подряд в «Рисуй — угадаю»',
    at: at, hidden: false, icon: ICON
  };
};

/**
 * «Нераспознанный гений»: модель не узнала рисунок, а люди узнали (настройка geniusCount — сколько
 * таких рисунков). Редкая: так выходит нечасто, и это скорее шутка над моделью.
 */
exports.genius = function (count, at) {
  return {
    key: 'draw-guess/unrecognized-genius', source: 'draw-guess', category: 'Игротека',
    title: 'Нераспознанный гений',
    text: count > 1 ? 'Модель не узнала ' + count + ' ваших рисунков, а люди узнали' : 'Модель не узнала ваш рисунок, а люди узнали',
    at: at, hidden: false, icon: ICON, rarity: 'rare'
  };
};

/**
 * Что заработано после партии. results — исходы последних раундов «Я рисую», новые первыми;
 * settings — настройки модуля (achievements, artistStreak, geniusCount); counts — { genius: сколько
 * рисунков модель не узнала, а люди узнали }. → [item].
 */
exports.earned = function (results, settings, now, counts) {
  if (!settings || !settings.achievements) return [];
  var out = [];
  var need = Number(settings.artistStreak) || 10;
  if (exports.streak(results) >= need) out.push(exports.artist(need, now));
  var geniusNeed = Number(settings.geniusCount) || 1;
  if (counts && Number(counts.genius) >= geniusNeed) out.push(exports.genius(geniusNeed, now));
  return out;
};

function boxItems(box) {
  if (Array.isArray(box)) return box;
  return box && Array.isArray(box.items) ? box.items : [];
}

/**
 * Отдать ачивки. files — assi.files; load(path) — require другого модуля.
 * → [{ key, how: 'granted' | 'queued' | 'sent' }] ('sent' — уже отдавали раньше).
 */
exports.deliver = function (items, files, load) {
  var sent = files.readJson(SENT, null) || {};
  var out = [];
  (items || []).forEach(function (item) {
    if (sent[item.key]) {
      out.push({ key: item.key, how: 'sent' });
      return;
    }
    var how = null;
    var achievements = null;
    if (files.exists(ACHIEVEMENTS)) {
      try {
        achievements = load(ACHIEVEMENTS);
      } catch (error) {
        console.warn('draw-guess: ачивки: ' + error);
      }
    }
    if (achievements && typeof achievements.grant === 'function') {
      try {
        achievements.grant(item);
        how = 'granted';
      } catch (error) {
        console.warn('draw-guess: ачивки: grant: ' + error);
      }
    }
    if (!how) {
      var box = files.readJson(OUTBOX, []);
      var list = boxItems(box);
      if (!list.some(function (other) { return other && other.key === item.key; })) {
        list.push(item);
        if (Array.isArray(box) || !box || typeof box !== 'object') files.writeJson(OUTBOX, list);
        else {
          box.items = list;
          files.writeJson(OUTBOX, box);
        }
      }
      how = 'queued';
    }
    sent[item.key] = item.at || 1;
    out.push({ key: item.key, how: how });
  });
  if (out.some(function (entry) { return entry.how !== 'sent'; })) files.writeJson(SENT, sent);
  return out;
};

exports.OUTBOX = OUTBOX;
exports.SENT = SENT;
