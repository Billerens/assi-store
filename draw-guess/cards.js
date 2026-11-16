// Слова для рисунков без сети: запасной список по уровням и темам (words.json), без недавних.
// Чистая логика: движок (require('./cards')), node (тесты), экран (window.dgCards).
(function (exports) {
  var match = typeof require === 'function' ? require('./match') : window.ruMatch;

  function random(rnd) {
    return typeof rnd === 'function' ? rnd() : Math.random();
  }

  function shuffle(list, rnd) {
    var out = list.slice();
    for (var i = out.length - 1; i > 0; i--) {
      var j = Math.floor(random(rnd) * (i + 1));
      var keep = out[i];
      out[i] = out[j];
      out[j] = keep;
    }
    return out;
  }

  function levelOf(dictionary, word) {
    for (var level = 1; level <= 5; level++) {
      if ((dictionary.levels[level] || []).indexOf(word) >= 0) return level;
    }
    return 3;
  }

  /**
   * Слова из запаса: тема (если есть в словаре) и уровень сложности, затем соседние уровни;
   * недавние (exclude: нормализованное слово → true) — в последнюю очередь.
   * → [{ word, forms: [], roots: [], difficulty }].
   */
  function offline(dictionary, options, rnd) {
    var o = options || {};
    var level = Math.max(1, Math.min(5, Number(o.difficulty) || 2));
    var exclude = o.exclude || {};
    var count = o.count || 10;
    var themed = o.theme && dictionary.themes && dictionary.themes[o.theme] ? dictionary.themes[o.theme] : null;
    var order = [level];
    for (var step = 1; step < 5; step++) {
      if (level - step >= 1) order.push(level - step);
      if (level + step <= 5) order.push(level + step);
    }
    var pools = [];
    if (themed) {
      order.forEach(function (l) {
        pools.push(themed.filter(function (word) { return levelOf(dictionary, word) === l; }));
      });
    } else {
      order.forEach(function (l) { pools.push(dictionary.levels[l] || []); });
    }
    var cards = [];
    var taken = {};
    var fill = function (allowRecent) {
      pools.forEach(function (pool) {
        shuffle(pool, rnd).forEach(function (word) {
          var plain = match.normalize(word);
          if (cards.length >= count || taken[plain] || (!allowRecent && exclude[plain])) return;
          taken[plain] = true;
          cards.push({ word: word, forms: [], roots: [], difficulty: levelOf(dictionary, word) });
        });
      });
    };
    fill(false);
    if (cards.length < count) fill(true);
    return cards;
  }

  /** Карточка из слова или из ответа генератора Шляпы. */
  function toCard(item) {
    if (typeof item === 'string') return { word: item, forms: [], roots: [], difficulty: 3 };
    return {
      word: String(item.word || ''),
      forms: Array.isArray(item.forms) ? item.forms : [],
      roots: Array.isArray(item.roots) ? item.roots : [],
      synonyms: Array.isArray(item.synonyms) ? item.synonyms : [],
      difficulty: item.difficulty || 3
    };
  }

  exports.offline = offline;
  exports.toCard = toCard;
  exports.shuffle = shuffle;
})(typeof exports !== 'undefined' ? exports : (window.dgCards = {}));
