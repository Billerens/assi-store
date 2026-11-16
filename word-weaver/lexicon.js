// The dictionary of «Словоплёт» in memory and the generator of letter sets. Shared subset of
// JavaScript (screen: window.WWLex; engine and node: require('./lexicon.js')): no class, no
// async, no f(...args), no for (let …); randomness only from the rng given.
//
// The dictionary file (data/games/word-weaver/assets/dict.txt, built by tools/build-dict.js) is
// a list of nouns, the most frequent first: «word» or «word<TAB><cut><add>» where the second part
// is the nominative plural (кошка → 1и: cut one letter, add «и»). Lines with # are comments.
// Words are compared by a key: lower case, ё → е (the wheel has no ё); the word keeps its ё for show.
(function (root, make) {
  var api = make();
  if (typeof exports !== 'undefined') { for (var k in api) exports[k] = api[k]; } else { root.WWLex = api; }
})(this, function () {
  'use strict';

  var ABC = 'абвгдежзийклмнопрстуфхцчшщъыьэюя';
  var BIT = {};
  for (var i = 0; i < ABC.length; i++) BIT[ABC.charAt(i)] = i;

  /** The key of a word: lower case, ё → е, only Russian letters (null when there are others). */
  function key(word) {
    var k = String(word || '').toLowerCase().replace(/ё/g, 'е');
    return /^[а-я]+$/.test(k) ? k : null;
  }

  /** The letters of a key as a bit mask (32 letters, one bit each). */
  function maskOf(k) {
    var m = 0;
    for (var i = 0; i < k.length; i++) m |= 1 << BIT[k.charAt(i)];
    return m;
  }

  /** How many of each letter: {а: 1, …}. */
  function countsOf(k) {
    var c = {};
    for (var i = 0; i < k.length; i++) {
      var ch = k.charAt(i);
      c[ch] = (c[ch] || 0) + 1;
    }
    return c;
  }

  /** True when every letter of `k` is in `have` (counts) as many times. */
  function fits(k, have) {
    var used = {};
    for (var i = 0; i < k.length; i++) {
      var ch = k.charAt(i);
      used[ch] = (used[ch] || 0) + 1;
      if (used[ch] > (have[ch] || 0)) return false;
    }
    return true;
  }

  function unplural(word, code) {
    var m = /^(\d+)(.*)$/.exec(code || '');
    if (!m) return null;
    return word.slice(0, word.length - Number(m[1])) + m[2];
  }

  /**
   * The dictionary from the text of dict.txt: {size, words: [shown], keys: [key], masks: [mask],
   * rank: {key: index}, plural: {pluralKey: index of its singular}, extra: {key: true}}.
   */
  function parse(text) {
    var lex = { size: 0, words: [], keys: [], masks: [], rank: {}, plural: {}, pluralOf: {}, extra: {} };
    var lines = String(text || '').split('\n');
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (!line || line.charAt(0) === '#') continue;
      if (line.charAt(line.length - 1) === '\r') line = line.slice(0, -1);
      var tab = line.indexOf('\t');
      var word = tab < 0 ? line : line.slice(0, tab);
      var k = key(word);
      if (!k || lex.rank[k] !== undefined) continue;
      var n = lex.words.length;
      lex.words.push(word);
      lex.keys.push(k);
      lex.masks.push(maskOf(k));
      lex.rank[k] = n;
      if (tab >= 0) {
        var pl = unplural(word, line.slice(tab + 1));
        var pk = pl && key(pl);
        if (pk && pk !== k) {
          lex.pluralOf[n] = pl;
          if (lex.plural[pk] === undefined) lex.plural[pk] = n;
        }
      }
    }
    lex.size = lex.words.length;
    lex.cache = {};
    return lex;
  }

  /** Adds the owner's own words (the personal dictionary): they count as rare. */
  function addExtra(lex, words) {
    (words || []).forEach(function (w) {
      var k = key(w);
      if (!k || lex.rank[k] !== undefined) return;
      var n = lex.words.length;
      lex.words.push(String(w).toLowerCase());
      lex.keys.push(k);
      lex.masks.push(maskOf(k));
      lex.rank[k] = n;
      lex.extra[k] = true;
    });
    lex.size = lex.words.length;
    lex.cache = {};
    return lex;
  }

  function has(lex, k) { return lex.rank[k] !== undefined; }

  /** The word as shown (with ё). */
  function shown(lex, k) {
    var r = lex.rank[k];
    if (r !== undefined) return lex.words[r];
    var p = lex.plural[k];
    return p !== undefined ? lex.pluralOf[p] : k;
  }

  /** Common: among the first `top` words of the dictionary (and not an owner's word). */
  function common(lex, k, top) {
    var r = lex.rank[k];
    return r !== undefined && r < top && !lex.extra[k];
  }

  /**
   * Every dictionary word of 3+ letters that can be made of `letters` (each letter once):
   * {common: [keys], rare: [keys]}, each sorted by length, then alphabet.
   */
  function subwords(lex, letters, top, minLen) {
    var lk = key(letters) || '';
    var cacheKey = lk.split('').sort().join('') + ':' + top;
    if (lex.cache && lex.cache[cacheKey]) return lex.cache[cacheKey];
    var have = countsOf(lk);
    var mask = maskOf(lk);
    var min = minLen || 3;
    var out = { common: [], rare: [] };
    for (var i = 0; i < lex.size; i++) {
      if ((lex.masks[i] & ~mask) !== 0) continue;
      var k = lex.keys[i];
      if (k.length < min || k.length > lk.length) continue;
      if (!fits(k, have)) continue;
      if (i < top && !lex.extra[k]) out.common.push(k);
      else out.rare.push(k);
    }
    var order = function (a, b) { return a.length - b.length || (a < b ? -1 : a > b ? 1 : 0); };
    out.common.sort(order);
    out.rare.sort(order);
    if (lex.cache) {
      var names = Object.keys(lex.cache);
      if (names.length > 300) lex.cache = {};
      lex.cache[cacheKey] = out;
    }
    return out;
  }

  /** The plural forms of common words that can be made of `letters` («Переулок форм»). */
  function plurals(lex, letters, top) {
    var lk = key(letters) || '';
    var have = countsOf(lk);
    var out = [];
    for (var pk in lex.plural) {
      if (pk.length > lk.length || pk.length < 3) continue;
      if (lex.plural[pk] >= top) continue;
      if (lex.rank[pk] !== undefined) continue;
      if (fits(pk, have)) out.push(pk);
    }
    return out;
  }

  /** The common words of a length between `a` and `b` (seeds), cached. */
  function seeds(lex, top, a, b) {
    var ck = 'seeds:' + top + ':' + a + ':' + b;
    if (lex.cache && lex.cache[ck]) return lex.cache[ck];
    var out = [];
    var n = Math.min(top, lex.size);
    for (var i = 0; i < n; i++) {
      var k = lex.keys[i];
      if (k.length >= a && k.length <= b && !lex.extra[k]) out.push(k);
    }
    if (lex.cache) lex.cache[ck] = out;
    return out;
  }

  /**
   * Checks a candidate set: {ok, common, rare, why}. A set is taken when it has from `min` to
   * `max` common words and at least one common word of `needLong`+ letters besides the seed.
   */
  function judge(lex, letters, seed, o) {
    var w = subwords(lex, letters, o.top);
    var n = w.common.length;
    var long = w.common.some(function (k) { return k.length >= o.needLong && k !== seed; });
    var why = n < o.min ? 'мало слов' : n > o.max ? 'много слов' : !long ? 'нет длинного слова' : null;
    return { ok: !why, common: n, rare: w.rare.length, why: why };
  }

  /**
   * A new set: a seed — a common word of lenMin..lenMax letters not in `avoid` — its letters
   * (plus `guests` random letters) shuffled. o: {top, lenMin, lenMax, min, max, needLong, avoid,
   * guests, guestLetters, tries, seed (a wanted seed word, a theme)}. Returns {seed, letters,
   * common, rare, tries} or null when nothing fits.
   */
  function generate(lex, rng, o) {
    var avoid = o.avoid || {};
    var pool = seeds(lex, o.top, o.lenMin, o.lenMax);
    var tries = o.tries || 200;
    var guestLetters = o.guestLetters || 'оеаинтсрвлкмдпу';
    for (var t = 0; t < tries; t++) {
      var seed = t === 0 && o.seed ? key(o.seed) : pool.length ? pool[Math.floor(rng.next() * pool.length)] : null;
      if (!seed) continue;
      if (avoid[seed] && !(t === 0 && o.seed)) continue;
      var letters = seed;
      for (var g = 0; g < (o.guests || 0); g++) letters += guestLetters.charAt(Math.floor(rng.next() * guestLetters.length));
      var j = judge(lex, letters, seed, o);
      if (!j.ok) {
        if (t === 0 && o.seed) return null;
        continue;
      }
      return { seed: seed, letters: rng.shuffle(letters.split('')).join(''), common: j.common, rare: j.rare, tries: t + 1 };
    }
    return null;
  }

  return {
    ABC: ABC, key: key, maskOf: maskOf, countsOf: countsOf, fits: fits, parse: parse, addExtra: addExtra,
    has: has, shown: shown, common: common, subwords: subwords, plurals: plurals, seeds: seeds,
    judge: judge, generate: generate
  };
});
