// The logic of «Словоплёт»: words from a wheel of letters build a city. Shared subset of JavaScript
// (screen: window.GameSim; engine and node: require): no class, no async, no f(...args), no
// for (let …); randomness only from the rng given; every number comes from config.json (cfg).
//
// The dictionary (lexicon.js, WWLex.parse of data/games/word-weaver/assets/dict.txt) is passed in
// as `lex` where words are involved: the sim itself never loads files.
(function (root, make) {
  var node = typeof require === 'function' && typeof exports !== 'undefined';
  var api = node ? make(require('../engine/big.js'), require('../engine/fmt.js'), require('./lexicon.js'))
    : make(root.Big, root.Fmt, root.WWLex);
  if (typeof exports !== 'undefined') { for (var k in api) exports[k] = api[k]; } else { root.GameSim = api; }
})(this, function (Big, Fmt, Lex) {
  'use strict';

  var LAYER = 'city';
  var MIN = 60000;
  var DAY = 86400000;

  // ---- the city: buildings, quarters, kinds of cities ---------------------------------------------

  // kind: house (residents, takes a plot), upgrade (a level, effects below). Numbers are in config:
  // b.<id>.base (the price of level 0), b.<id>.max (levels), and the effect keys of each.
  var BUILDINGS = [
    { id: 'izba', title: 'Изба', kind: 'house', text: '+{b.izba.people} жителей' },
    { id: 'stone', title: 'Каменный дом', kind: 'house', text: '+{b.stone.people} жителей' },
    { id: 'tenement', title: 'Доходный дом', kind: 'house', text: '+{b.tenement.people} жителей' },
    { id: 'workshop', title: 'Мастерская', kind: 'upgrade', text: 'кирпичи за слова +{b.workshop.pct%} за уровень' },
    { id: 'market', title: 'Рынок', kind: 'upgrade', text: 'налог +{b.market.pct%} за уровень' },
    { id: 'library', title: 'Библиотека', kind: 'upgrade', text: 'редкие слова ×{b.library.rare} вместо ×{word.rare}' },
    { id: 'typography', title: 'Типография', kind: 'upgrade', text: 'последние слова из альбома видны прямо на главном экране' },
    { id: 'tower', title: 'Каланча', kind: 'upgrade', text: 'раз в {b.tower.everyMin} мин сундук налога за {b.tower.taxMin} мин (× уровень)' },
    { id: 'post', title: 'Почта', kind: 'upgrade', text: '«Нет в словаре?» засчитывается ×{b.post.mult}' },
    { id: 'lamp', title: 'Фонарщик', kind: 'upgrade', text: 'подсказка: первая буква слова, заряд раз в {b.lamp.everyMin} мин; зарядов — по уровню' },
    { id: 'herald', title: 'Глашатай', kind: 'upgrade', text: 'подсказка: слово целиком, заряд раз в {b.herald.everyMin} мин; зарядов — по уровню' },
    { id: 'quill', title: 'Перо писаря', kind: 'upgrade', text: '+1 буква-гость в новых наборах за уровень' },
    { id: 'mill', title: 'Мельница', kind: 'upgrade', text: 'налог без игры {b.mill.offline%} вместо {offline.share%}' },
    { id: 'bridge', title: 'Мост', kind: 'upgrade', text: 'Набережная открывается словом из {b.bridge.len} букв' },
    { id: 'school', title: 'Школа', kind: 'upgrade', text: 'слова из 3 букв ×{b.school.mult}' },
    { id: 'gym', title: 'Гимназия', kind: 'upgrade', text: 'слова из {b.gym.from}+ букв ×{b.gym.mult}' },
    { id: 'archive', title: 'Архив', kind: 'upgrade', text: 'альбом показывает, сколько слов каждого зерна ещё не найдено' },
    { id: 'townhall', title: 'Ратуша', kind: 'upgrade', text: '+{b.townhall.pct%} налога за каждые {b.townhall.per} слов альбома' },
    { id: 'inn', title: 'Трактир', kind: 'upgrade', text: 'серия: каждое слово подряд без ошибок +{b.inn.step%}, до +{b.inn.cap%}' },
    { id: 'garden', title: 'Сад скульптур', kind: 'upgrade', text: 'жители +{b.garden.pct%} за уровень' }
  ];

  var QUARTERS = [
    { id: 'sloboda', title: 'Слобода', special: 'Колодец', need: 'сразу' },
    { id: 'craft', title: 'Ремесленный', special: 'Кузница', need: 'слово из {q.craft.len} букв' },
    { id: 'trade', title: 'Торговый', special: 'Гостиный двор', need: 'слово из {q.trade.len} букв' },
    { id: 'uni', title: 'Университетский', special: 'Университет', need: 'слово из {q.uni.len} букв и {q.uni.rare} редких слов' },
    { id: 'quay', title: 'Набережная', special: 'Маяк', need: 'слово из {q.quay.len} букв (с Мостом — из {b.bridge.len})' },
    { id: 'forms', title: 'Переулок форм', special: 'Печатня', need: '{q.forms.album} слов в альбоме; засчитывает множественное число' },
    { id: 'old', title: 'Старый город', special: 'Ратушная башня', need: '{q.old.album} слов в альбоме' }
  ];

  var CITIES = [
    { id: 'plain', title: 'Посад', text: 'обычный город' },
    { id: 'sea', title: 'Приморский', text: 'слова с «м» или «р» ×{city.sea.mult}' },
    { id: 'north', title: 'Северный', text: 'слова из {city.north.longFrom}+ букв ×{city.north.long}, из 3–{city.north.shortTo} ×{city.north.short}' },
    { id: 'mountain', title: 'Горный', text: 'редкие слова ×{city.mountain.rare}, обычные ×{city.mountain.common}' },
    { id: 'river', title: 'Речной', text: 'налог ×{city.river.tax}, кирпичи за слова ×{city.river.words}' }
  ];

  var POINT_GROUPS = [1, 2, 3, 5, 8];
  var LETTER_DAY = 'бвгдзклмнпрстаеиоу';
  var ORDER_LETTERS = 'кпсмбтдвгнлр';
  var ALPHABET_START = 'абвгдежзийклмнопрстуфхцчшщэюя';

  // Built-in themes (when the stock prepared by the model is empty): a seed of 6–9 letters that the
  // generator accepts with the default settings (tests/generator.test.js checks each).
  var THEMES = [
    { title: 'Кухня', seed: 'кастрюля' }, { title: 'Кухня', seed: 'кофейник' }, { title: 'Кухня', seed: 'пирожок' },
    { title: 'Море', seed: 'пароход' }, { title: 'Море', seed: 'водоросль' }, { title: 'Море', seed: 'капитан' },
    { title: 'Лес', seed: 'черника' }, { title: 'Город', seed: 'трамвай' }, { title: 'Город', seed: 'вокзал' },
    { title: 'Дорога', seed: 'чемодан' }, { title: 'Дорога', seed: 'палатка' }, { title: 'Дом', seed: 'подушка' },
    { title: 'Зима', seed: 'снеговик' }, { title: 'Зима', seed: 'варежка' }, { title: 'Музыка', seed: 'оркестр' },
    { title: 'Музыка', seed: 'скрипка' }, { title: 'Музыка', seed: 'барабан' }, { title: 'Школа', seed: 'учебник' },
    { title: 'Метро', seed: 'турникет' }, { title: 'Метро', seed: 'пассажир' }, { title: 'Сад', seed: 'крыжовник' }
  ];

  function find(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  /** A building's text with its numbers from the config: {b.izba.people}, {b.workshop.pct%}. */
  function fill(text, cfg) {
    return String(text).replace(/\{([a-zA-Z0-9.]+)(%?)\}/g, function (all, k, pct) {
      var v = cfg[k];
      if (v === undefined) return all;
      if (pct) return String(Math.round(v * 1000) / 10).replace('.', ',') + ' %';
      return String(v).replace('.', ',');
    });
  }

  function lvl(state, id) { return (state.run.b && state.run.b[id]) || 0; }

  function quarterOpen(state, id) { return state.run.quarters.indexOf(id) >= 0; }

  function plots(state, cfg) { return state.run.quarters.length * cfg['quarter.plots']; }

  function houses(state) { return lvl(state, 'izba') + lvl(state, 'stone') + lvl(state, 'tenement'); }

  function residents(state, cfg) {
    var base = lvl(state, 'izba') * cfg['b.izba.people'] + lvl(state, 'stone') * cfg['b.stone.people'] + lvl(state, 'tenement') * cfg['b.tenement.people'];
    return Math.floor(base * (1 + lvl(state, 'garden') * cfg['b.garden.pct']));
  }

  function fame(state) {
    var l = state.layers && state.layers[LAYER];
    return l ? Big.toNumber(Big.of(l.currency, 0)) : 0;
  }

  function fameMult(state, cfg) { return 1 + fame(state) * cfg['fame.bonus']; }

  function albumSize(state) { return state.meta.albumCount || 0; }

  // ---- money --------------------------------------------------------------------------------------

  /** Bricks a second from the tax (before the links' multiplier; without the offline share). */
  function taxPerSec(state, cfg) {
    var people = residents(state, cfg);
    if (people <= 0) return 0;
    var m = 1 + lvl(state, 'market') * cfg['b.market.pct'];
    m *= fameMult(state, cfg);
    if (lvl(state, 'townhall') > 0) m *= 1 + cfg['b.townhall.pct'] * Math.floor(albumSize(state) / cfg['b.townhall.per']);
    if (state.run.city === 'river') m *= cfg['city.river.tax'];
    return cfg['tax.perMin'] * people * m / 60;
  }

  function offlineShare(state, cfg) { return lvl(state, 'mill') > 0 ? cfg['b.mill.offline'] : cfg['offline.share']; }

  function gain(state, amount) {
    state.run.bricks = Big.add(state.run.bricks, amount);
    state.run.earned = Big.add(state.run.earned, amount);
  }

  // ---- prices and buying ----------------------------------------------------------------------------

  function cost(state, cfg, id) {
    return Big.ceil(Big.costGeom(cfg['b.' + id + '.base'], cfg['build.growth'], lvl(state, id), 1));
  }

  /** Why the building cannot be bought now (null when it can, apart from money). */
  function blocked(state, cfg, id) {
    var b = find(BUILDINGS, id);
    if (!b) return 'нет такого здания';
    if (lvl(state, id) >= cfg['b.' + id + '.max']) return 'построено всё';
    if (b.kind === 'house' && houses(state) >= plots(state, cfg)) {
      if (id === 'izba') return 'нет свободных участков';
      var weaker = id === 'stone' ? ['izba'] : ['izba', 'stone'];
      if (!weaker.some(function (w) { return lvl(state, w) > 0; })) return 'нет свободных участков';
    }
    return null;
  }

  // The bot and the default play buy the cheapest thing they can (houses first among equals).
  var BUY_ORDER = ['izba', 'workshop', 'lamp', 'school', 'market', 'stone', 'post', 'archive', 'typography', 'tower', 'herald',
    'inn', 'library', 'mill', 'quill', 'tenement', 'gym', 'garden', 'bridge', 'townhall'];

  /** Buys building `id` (or, with no id, the cheapest one that can be bought); true when bought. */
  function buy(state, cfg, id) {
    if (!id) {
      var best = null;
      var bestCost = null;
      BUY_ORDER.forEach(function (bid) {
        if (blocked(state, cfg, bid)) return;
        var c = cost(state, cfg, bid);
        if (Big.lt(state.run.bricks, c)) return;
        if (!best || Big.lt(c, bestCost)) {
          best = bid;
          bestCost = c;
        }
      });
      if (!best) return false;
      id = best;
    }
    if (blocked(state, cfg, id)) return false;
    var price = cost(state, cfg, id);
    if (Big.lt(state.run.bricks, price)) return false;
    var b = find(BUILDINGS, id);
    if (b.kind === 'house' && houses(state) >= plots(state, cfg)) {
      // A better house on the plot of a weaker one.
      var w = lvl(state, 'izba') > 0 ? 'izba' : 'stone';
      state.run.b[w]--;
    }
    state.run.bricks = Big.sub(state.run.bricks, price);
    state.run.b[id] = lvl(state, id) + 1;
    if (id === 'lamp') state.run.hints.lamp++;
    if (id === 'herald') state.run.hints.herald++;
    state.run.maxResidents = Math.max(state.run.maxResidents, residents(state, cfg));
    return true;
  }

  // ---- timers: hint charges, the fire tower ------------------------------------------------------------

  function regen(state, cfg, now) {
    var h = state.run.hints;
    ['lamp', 'herald'].forEach(function (k) {
      var level = lvl(state, k);
      if (level <= 0) return;
      var every = cfg['b.' + k + '.everyMin'] * MIN;
      if (h[k] >= level) {
        h[k + 'At'] = 0;
        return;
      }
      if (!h[k + 'At']) h[k + 'At'] = now + every;
      while (h[k] < level && now >= h[k + 'At']) {
        h[k]++;
        h[k + 'At'] += every;
      }
      if (h[k] >= level) h[k + 'At'] = 0;
    });
    if (lvl(state, 'tower') > 0 && !state.run.towerReady) {
      if (!state.run.towerAt) state.run.towerAt = now + cfg['b.tower.everyMin'] * MIN;
      if (now >= state.run.towerAt) state.run.towerReady = true;
    }
  }

  /** The fire tower's chest: tax of b.tower.taxMin minutes × its level. Returns the bricks or null. */
  function collectTower(state, cfg, now, mult) {
    if (!state.run.towerReady) return null;
    var amount = Big.max(cfg['b.tower.min'], Big.mul(taxPerSec(state, cfg) * 60 * cfg['b.tower.taxMin'] * lvl(state, 'tower'), mult || 1));
    amount = Big.floor(amount);
    gain(state, amount);
    state.run.towerReady = false;
    state.run.towerAt = now + cfg['b.tower.everyMin'] * MIN;
    return amount;
  }

  // ---- the day: the letter of the day ---------------------------------------------------------------

  function dayKey(now) {
    var d = new Date(now);
    var m = d.getMonth() + 1;
    var day = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
  }

  function hash(text) {
    var h = 0x811c9dc5;
    for (var i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return h >>> 0;
  }

  /** The letter of the day: words with it ×letterDay.mult all day (the same for every player on a date). */
  function letterOfDay(now) { return LETTER_DAY.charAt(hash('word-weaver:' + dayKey(now)) % LETTER_DAY.length); }

  function dayNumber(now) { return Math.floor(now / DAY); }

  // ---- words -----------------------------------------------------------------------------------------

  function points(k, cfg) {
    var sum = 0;
    for (var i = 0; i < k.length; i++) {
      var ch = k.charAt(i);
      var p = 1;
      for (var g = 0; g < POINT_GROUPS.length; g++) {
        if (String(cfg['points.' + POINT_GROUPS[g]] || '').indexOf(ch) >= 0) {
          p = POINT_GROUPS[g];
          break;
        }
      }
      sum += p;
    }
    return sum;
  }

  function lenMult(len, cfg) { return cfg['len.' + Math.max(3, Math.min(9, len))]; }

  /**
   * Bricks for a word now and the reasons, before being added: o = {rare, first, seed, plural,
   * extra, now, mult}. Returns {amount: Big, parts: [text]}.
   */
  function wordValue(state, cfg, k, o) {
    var r = state.run;
    var v = points(k, cfg) * lenMult(k.length, cfg);
    var parts = [];
    if (o.plural) {
      v *= cfg['forms.share'];
      parts.push('форма');
    }
    if (o.rare) {
      var rare = lvl(state, 'library') > 0 ? cfg['b.library.rare'] : cfg['word.rare'];
      if (r.city === 'mountain') rare *= cfg['city.mountain.rare'] / cfg['word.rare'];
      if (o.extra && lvl(state, 'post') > 0) rare *= cfg['b.post.mult'];
      v *= rare;
      parts.push('редкое');
    } else if (r.city === 'mountain' && !o.plural) v *= cfg['city.mountain.common'];
    if (o.first) {
      v *= cfg['word.firstAlbum'];
      parts.push('новое в альбоме');
    }
    if (o.seed) {
      v *= cfg['word.seed'];
      parts.push('зерно');
    }
    if (k.length === 3 && lvl(state, 'school') > 0) v *= cfg['b.school.mult'];
    if (k.length >= cfg['b.gym.from'] && lvl(state, 'gym') > 0) v *= cfg['b.gym.mult'];
    v *= 1 + lvl(state, 'workshop') * cfg['b.workshop.pct'];
    v *= fameMult(state, cfg);
    v *= 1 + (r.quarters.length - 1) * cfg['q.special.pct'];
    if (r.city === 'sea' && /[мр]/.test(k)) v *= cfg['city.sea.mult'];
    if (r.city === 'north') {
      if (k.length >= cfg['city.north.longFrom']) v *= cfg['city.north.long'];
      else if (k.length <= cfg['city.north.shortTo']) v *= cfg['city.north.short'];
    }
    if (r.city === 'river') v *= cfg['city.river.words'];
    if (lvl(state, 'inn') > 0 && r.streak > 0) v *= 1 + Math.min(cfg['b.inn.cap'], r.streak * cfg['b.inn.step']);
    if (r.fairUntil > o.now) {
      v *= cfg['fair.mult'];
      parts.push('ярмарка');
    }
    if (r.museUntil > o.now) {
      v *= cfg['muse.mult'];
      parts.push('вдохновение');
    }
    if (k.indexOf(letterOfDay(o.now)) >= 0) {
      v *= cfg['letterDay.mult'];
      parts.push('буква дня');
    }
    v *= o.mult || 1;
    return { amount: Big.max(1, Big.round(v)), parts: parts };
  }

  /** The words of a set: {common, rare, plurals} (keys); plurals only with «Переулок форм». */
  function setWords(state, cfg, lex, set) {
    var w = Lex.subwords(lex, set.letters, cfg['dict.commonTop']);
    return { common: w.common, rare: w.rare, plurals: quarterOpen(state, 'forms') ? Lex.plurals(lex, set.letters, cfg['dict.commonTop']) : [] };
  }

  /** {found3, need3, all3, found4, all4, closed}: the set is closed when every common word of 4+ letters and close3 of the 3-letter ones are found. */
  function progress(state, cfg, lex, set) {
    var w = setWords(state, cfg, lex, set);
    var found = {};
    set.found.forEach(function (k) { found[k] = true; });
    var p = { found3: 0, all3: 0, found4: 0, all4: 0, rareFound: 0, rareAll: w.rare.length, common: w.common.length };
    w.common.forEach(function (k) {
      if (k.length === 3) {
        p.all3++;
        if (found[k]) p.found3++;
      } else {
        p.all4++;
        if (found[k]) p.found4++;
      }
    });
    w.rare.forEach(function (k) { if (found[k]) p.rareFound++; });
    p.need3 = Math.ceil(p.all3 * cfg['sets.close3'] - 1e-9);
    p.closed = p.found4 >= p.all4 && p.found3 >= p.need3;
    return p;
  }

  function current(state) {
    var r = state.run;
    for (var i = 0; i < r.sets.length; i++) if (r.sets[i].id === r.cur) return r.sets[i];
    return null;
  }

  function albumAdd(state, k, seed, now) {
    var meta = state.meta;
    if (meta.album[k]) return false;
    var si = meta.seeds.indexOf(seed);
    if (si < 0) {
      meta.seeds.push(seed);
      si = meta.seeds.length - 1;
    }
    meta.album[k] = [dayNumber(now), si];
    meta.albumCount = (meta.albumCount || 0) + 1;
    return true;
  }

  /** Quarters whose condition is met now: they open; returns their ids. */
  function openQuarters(state, cfg) {
    var r = state.run;
    var s = r.stats;
    var album = albumSize(state);
    var opened = [];
    var want = {
      craft: s.maxLen >= cfg['q.craft.len'],
      trade: s.maxLen >= cfg['q.trade.len'],
      uni: s.maxLen >= cfg['q.uni.len'] && s.rare >= cfg['q.uni.rare'],
      quay: s.maxLen >= (lvl(state, 'bridge') > 0 ? cfg['b.bridge.len'] : cfg['q.quay.len']),
      forms: album >= cfg['q.forms.album'],
      old: album >= cfg['q.old.album']
    };
    QUARTERS.forEach(function (q) {
      if (q.id === 'sloboda' || quarterOpen(state, q.id) || !want[q.id]) return;
      r.quarters.push(q.id);
      opened.push(q.id);
    });
    // Longer seeds from now on: the sets prepared ahead for the old length go (themes stay).
    if (opened.length) r.queue = r.queue.filter(function (s) { return !!s.theme; });
    return opened;
  }

  /**
   * A word from the wheel (or typed): {ok, why?, k, word, amount, rare, first, seed, plural, closed,
   * opened, order, nine}. why: 'short' | 'letters' | 'unknown' | 'again' | 'noset'.
   * Unknown words break the series (Трактир); repeated ones do not.
   */
  function submit(state, cfg, lex, word, now, mult) {
    var r = state.run;
    var set = current(state);
    if (!set) return { ok: false, why: 'noset' };
    var k = Lex.key(word);
    if (!k || k.length < 3) return { ok: false, why: 'short', k: k };
    if (!Lex.fits(k, Lex.countsOf(set.letters))) return { ok: false, why: 'letters', k: k };
    var known = Lex.has(lex, k);
    var plural = false;
    if (!known && quarterOpen(state, 'forms') && lex.plural[k] !== undefined && lex.plural[k] < cfg['dict.commonTop']) plural = true;
    if (!known && !plural) {
      r.streak = 0;
      r.stats.errors++;
      return { ok: false, why: 'unknown', k: k };
    }
    if (set.found.indexOf(k) >= 0) return { ok: false, why: 'again', k: k, word: Lex.shown(lex, k) };
    var rare = !plural && !Lex.common(lex, k, cfg['dict.commonTop']);
    var first = !plural && !state.meta.album[k];
    var isSeed = k === set.seed;
    var v = wordValue(state, cfg, k, { rare: rare, first: first, seed: isSeed, plural: plural, extra: !!lex.extra[k], now: now, mult: mult });
    gain(state, v.amount);
    r.wordBricks = Big.add(r.wordBricks, v.amount);
    set.found.push(k);
    r.streak++;
    r.stats.words++;
    if (rare) r.stats.rare++;
    if (k.length > r.stats.maxLen) r.stats.maxLen = k.length;
    if (plural) state.meta.forms = (state.meta.forms || 0) + 1;
    else {
      if (first) albumAdd(state, k, set.seed, now);
      if (first && rare) state.meta.rare = (state.meta.rare || 0) + 1;
    }
    state.meta.found = (state.meta.found || 0) + 1;
    var out = { ok: true, k: k, word: Lex.shown(lex, k), amount: v.amount, parts: v.parts, rare: rare, first: first, seed: isSeed, plural: plural };
    out.nine = k.length >= 9;
    // The order of the town hall: words on a letter, long enough.
    var order = r.order;
    if (order && !order.done && k.charAt(0) === order.letter && k.length >= order.len && order.got.indexOf(k) < 0) {
      order.got.push(k);
      if (order.got.length >= order.need) {
        order.done = true;
        var reward = Big.floor(Big.max(cfg['order.min'], Big.mul(averageSet(state), cfg['order.mult'])));
        gain(state, reward);
        out.order = { done: true, reward: reward };
        r.order = null;
      } else out.order = { done: false, got: order.got.length, need: order.need };
    }
    out.opened = openQuarters(state, cfg);
    out.closed = progress(state, cfg, lex, set).closed && !set.closed;
    return out;
  }

  function averageSet(state) {
    var n = Math.max(1, state.run.closed);
    return Big.div(state.run.wordBricks, n);
  }

  /** Words the owner asked about («Нет в словаре?»): kept until the model says yes or no. */
  function ask(state, word, now) {
    var k = Lex.key(word);
    if (!k || k.length < 3) return false;
    var p = state.meta.pending;
    if (state.meta.extra[k] || p.some(function (x) { return x.k === k; })) return false;
    var set = current(state);
    p.push({ k: k, w: String(word).toLowerCase(), seed: set ? set.seed : '', at: now });
    if (p.length > 50) p.shift();
    return true;
  }

  /**
   * The model's answers about the asked words: [{k, ok}]. A word said yes goes to the personal
   * dictionary (meta.extra) and counts afterwards as a rare word (×b.post.mult with «Почта»).
   * Returns {added: [keys], amount: Big}. The screen adds the words to its lexicon (WWLex.addExtra).
   */
  function approve(state, cfg, lex, answers, now, mult) {
    var meta = state.meta;
    var added = [];
    var total = Big.ZERO;
    (answers || []).forEach(function (a) {
      var i = -1;
      meta.pending.forEach(function (x, j) { if (x.k === a.k) i = j; });
      if (i < 0) return;
      var item = meta.pending.splice(i, 1)[0];
      if (!a.ok) {
        meta.rejected = (meta.rejected || []).concat([item.k]).slice(-200);
        return;
      }
      meta.extra[item.k] = item.w;
      if (lex) Lex.addExtra(lex, [item.w]);
      var first = !meta.album[item.k];
      var v = wordValue(state, cfg, item.k, { rare: true, first: first, extra: true, now: now, mult: mult });
      gain(state, v.amount);
      total = Big.add(total, v.amount);
      if (first) albumAdd(state, item.k, item.seed || '', now);
      added.push(item.k);
    });
    return { added: added, amount: total };
  }

  // ---- sets ------------------------------------------------------------------------------------------

  function seedRange(state, cfg) {
    // +1 letter from quarter `seed.growFrom` (2) on, up to `seed.lenMax`. The spec's «с третьего
    // квартала 7» would lock the game: the third quarter, Торговый, opens with a 7-letter word,
    // which a 6-letter seed cannot give (README, «Отклонения»).
    var q = state.run.quarters.length;
    var from = cfg['seed.growFrom'] || 2;
    var max = Math.min(cfg['seed.lenMax'], cfg['seed.lenStart'] + Math.max(0, q - from + 1));
    var min = Math.max(cfg['seed.lenStart'], max - cfg['seed.spread']);
    return { min: min, max: max };
  }

  function genOptions(state, cfg, avoid) {
    var range = seedRange(state, cfg);
    return {
      top: cfg['dict.commonTop'], lenMin: range.min, lenMax: range.max, min: cfg['sets.min'], max: cfg['sets.max'],
      needLong: cfg['sets.needLong'], avoid: avoid, guests: lvl(state, 'quill') * cfg['b.quill.letters'], tries: cfg['sets.tries']
    };
  }

  /**
   * Prepares sets ahead (a batch of sets.batch) with the game's rng — works without network.
   * `themes`: [{title, seed}] wanted first (from the stock or built in). Returns how many were added.
   */
  function prepare(state, cfg, lex, rng, themes) {
    var r = state.run;
    var avoid = {};
    state.meta.recent.forEach(function (s) { avoid[s] = true; });
    r.queue.forEach(function (s) { avoid[s.seed] = true; });
    r.sets.forEach(function (s) { avoid[s.seed] = true; });
    var added = 0;
    // A wanted theme goes first in the queue (the next set), over the batch.
    (themes || []).forEach(function (t) {
      var k = Lex.key(t && t.seed);
      if (!k || avoid[k] || !Lex.has(lex, k)) return;
      var o = genOptions(state, cfg, avoid);
      o.seed = k;
      o.lenMin = 3;
      o.lenMax = 20;
      var s = Lex.generate(lex, rng, o);
      if (!s) return;
      avoid[s.seed] = true;
      r.queue.unshift({ seed: s.seed, letters: s.letters, theme: String(t.title || '').slice(0, 30) });
      added++;
    });
    var guard = 0;
    while (r.queue.length < cfg['sets.batch'] && guard++ < cfg['sets.batch'] * 3) {
      var made = Lex.generate(lex, rng, genOptions(state, cfg, avoid));
      if (!made) break;
      avoid[made.seed] = true;
      r.queue.push({ seed: made.seed, letters: made.letters });
      added++;
    }
    return added;
  }

  /** Opens the next prepared set as the current one (prepares a batch when the queue is empty). */
  function openNext(state, cfg, lex, rng, now) {
    var r = state.run;
    if (!r.queue.length) prepare(state, cfg, lex, rng);
    var next = r.queue.shift();
    if (!next) return null;
    var set = { id: r.nextId++, seed: next.seed, letters: next.letters, found: [], hints: {}, hinted: false, at: now || 0 };
    if (next.theme) set.theme = next.theme;
    r.sets.push(set);
    r.cur = set.id;
    state.meta.recent.push(next.seed);
    if (state.meta.recent.length > cfg['sets.noRepeat']) state.meta.recent = state.meta.recent.slice(-cfg['sets.noRepeat']);
    // Unclosed sets stay in the list, the oldest go when there are too many.
    while (r.sets.length > cfg['sets.keepOpen']) r.sets.shift();
    return set;
  }

  /** Switches to an unclosed set of the list. */
  function choose(state, id) {
    var ok = state.run.sets.some(function (s) { return s.id === id; });
    if (ok) state.run.cur = id;
    return ok;
  }

  /**
   * Closes the current set (when progress says so): counts it, rolls the events of the city with
   * the rng (fair, courier, town hall order). Returns {events: [{id, title, text, amount?}], nohint}.
   */
  function closeSet(state, cfg, lex, rng, now, mult) {
    var r = state.run;
    var set = current(state);
    if (!set || set.closed) return null;
    if (!progress(state, cfg, lex, set).closed) return null;
    set.closed = true;
    r.closed++;
    state.meta.sets = (state.meta.sets || 0) + 1;
    r.sets = r.sets.filter(function (s) { return s.id !== set.id; });
    var events = [];
    if (rng.chance(cfg['fair.chance'])) {
      r.fairUntil = Math.max(now, r.fairUntil) + cfg['fair.minutes'] * MIN;
      events.push({ id: 'fair', title: 'Ярмарка', text: 'Кирпичи за слова ×' + cfg['fair.mult'] + ' на ' + cfg['fair.minutes'] + ' мин' });
    }
    if (rng.chance(cfg['courier.chance'])) {
      var amount = Big.floor(Big.max(cfg['courier.min'], Big.mul(taxPerSec(state, cfg) * 60 * cfg['courier.taxMin'], mult || 1)));
      gain(state, amount);
      events.push({ id: 'courier', title: 'Гонец', text: 'Сундук налога', amount: amount });
    }
    if (!r.order && rng.chance(cfg['order.chance'])) {
      r.order = { letter: ORDER_LETTERS.charAt(rng.int(ORDER_LETTERS.length)), len: cfg['order.len'], need: cfg['order.count'], got: [], done: false };
      events.push({ id: 'order', title: 'Заказ ратуши', text: 'Найдите ' + r.order.need + ' слова на «' + r.order.letter + '» из ' + r.order.len + '+ букв' });
    }
    if (!set.hinted) state.meta.nohint = (state.meta.nohint || 0) + 1;
    return { events: events, nohint: !set.hinted, set: set };
  }

  /**
   * A hint: 'lamp' opens the first letter of the shortest unfound common word, 'herald' shows the
   * longest one whole. Spends a charge. Returns the key or null.
   */
  function hint(state, cfg, lex, kind, now) {
    var r = state.run;
    var set = current(state);
    if (!set || !(r.hints[kind] > 0)) return null;
    var w = setWords(state, cfg, lex, set);
    var open = w.common.filter(function (k) { return set.found.indexOf(k) < 0 && (set.hints[k] || 0) < (kind === 'lamp' ? 1 : 2); });
    if (!open.length) return null;
    var k = kind === 'lamp' ? open[0] : open[open.length - 1];
    set.hints[k] = kind === 'lamp' ? 1 : 2;
    set.hinted = true;
    r.hints[kind]--;
    var levels = lvl(state, kind);
    if (r.hints[kind] < levels && !r.hints[kind + 'At']) r.hints[kind + 'At'] = now + cfg['b.' + kind + '.everyMin'] * MIN;
    return k;
  }

  /** Shuffles the letters of the wheel (the order is the screen's, the letters stay). */
  function shuffle(state, rng) {
    var set = current(state);
    if (!set) return false;
    set.letters = rng.shuffle(set.letters.split('')).join('');
    return true;
  }

  /** «Вдохновение» (a spend of energy): all words ×muse.mult for muse.minutes. */
  function muse(state, cfg, now) {
    state.run.museUntil = Math.max(now, state.run.museUntil) + cfg['muse.minutes'] * MIN;
  }

  /** The kind of a new city (after «Новый город»). */
  function pickCity(state, id) {
    if (!find(CITIES, id)) return false;
    state.run.city = id;
    state.run.cityPicked = true;
    return true;
  }

  /** Every first letter that can start a word: true when the album has a word on each. */
  function alphabetDone(state) {
    var have = {};
    for (var k in state.meta.album) have[k.charAt(0)] = true;
    for (var i = 0; i < ALPHABET_START.length; i++) if (!have[ALPHABET_START.charAt(i)]) return false;
    return true;
  }

  function alphabetMissing(state) {
    var have = {};
    for (var k in state.meta.album) have[k.charAt(0)] = true;
    return ALPHABET_START.split('').filter(function (ch) { return !have[ch]; });
  }

  // ---- the functions the engine calls -------------------------------------------------------------------

  function newRun(cfg) {
    var b = {};
    BUILDINGS.forEach(function (x) { b[x.id] = 0; });
    return {
      bricks: Big.str(Big.of(cfg && cfg['start.bricks'] !== undefined ? cfg['start.bricks'] : 0)), earned: '0e0', wordBricks: '0e0',
      b: b, quarters: ['sloboda'], city: 'plain', cityPicked: true, maxResidents: 0,
      sets: [], cur: 0, queue: [], nextId: 1, closed: 0,
      stats: { words: 0, rare: 0, maxLen: 0, errors: 0 }, streak: 0,
      hints: { lamp: 0, lampAt: 0, herald: 0, heraldAt: 0 }, towerAt: 0, towerReady: false,
      fairUntil: 0, museUntil: 0, order: null
    };
  }

  function init(ctx) {
    return {
      run: newRun(ctx && ctx.config),
      layers: {},
      meta: { album: {}, albumCount: 0, seeds: [], recent: [], rare: 0, forms: 0, found: 0, sets: 0, nohint: 0, extra: {}, pending: [], rejected: [] }
    };
  }

  function tick(state, dt, ctx) {
    var cfg = ctx.config;
    var tax = taxPerSec(state, cfg);
    if (tax > 0) gain(state, Big.mul(tax, dt * (ctx.mult || 1) * (ctx.offline ? offlineShare(state, cfg) : 1)));
    regen(state, cfg, ctx.now);
  }

  /** The same as tick for `sec` seconds at once: the tax is constant while nobody builds. */
  function offline(state, sec, ctx) {
    var cfg = ctx.config;
    var tax = taxPerSec(state, cfg);
    var events = [];
    if (tax > 0) gain(state, Big.mul(tax, sec * (ctx.mult || 1) * offlineShare(state, cfg)));
    var before = { lamp: state.run.hints.lamp, herald: state.run.hints.herald, tower: state.run.towerReady };
    regen(state, cfg, ctx.now);
    if (state.run.hints.lamp > before.lamp) events.push('Фонарщик: зарядов ' + state.run.hints.lamp);
    if (state.run.hints.herald > before.herald) events.push('Глашатай: зарядов ' + state.run.hints.herald);
    if (state.run.towerReady && !before.tower) events.push('Каланча: сундук налога ждёт');
    if (offlineShare(state, cfg) < 1 && tax > 0) events.push('Налог без игры — ' + Math.round(offlineShare(state, cfg) * 100) + ' %, с Мельницей — 100 %');
    return { events: events };
  }

  function prestigeGain(state, layerId, cfg) {
    var r = state.run;
    if (!(quarterOpen(state, 'old') || r.maxResidents >= cfg['city.minResidents'])) return Big.ZERO;
    return Big.floor(Big.sqrt(Big.div(r.maxResidents, cfg['fame.div'])));
  }

  function bonus(state, layerId, amount, cfg) { return Big.add(1, Big.mul(amount, cfg['fame.bonus'])); }

  function onPrestige(state, layerId, before, ctx) {
    var l = state.layers[LAYER];
    l.state.bestResidents = Math.max(l.state.bestResidents || 0, before.run.maxResidents);
    l.state.cities = (l.state.cities || []).concat([before.run.city]).slice(-50);
    state.run.cityPicked = false;
  }

  function migrate(state, fromVer) { return state; }

  function validate(state) {
    var r = state.run;
    if (!Big.valid(r.bricks) || Big.sign(r.bricks) < 0) return 'кирпичей меньше нуля';
    if (!r.b || typeof r.b !== 'object') return 'нет зданий';
    for (var k in r.b) if (typeof r.b[k] !== 'number' || r.b[k] < 0 || r.b[k] % 1 !== 0) return 'уровень здания ' + k + ' не целое число';
    if (!Array.isArray(r.sets) || !Array.isArray(r.queue) || !Array.isArray(r.quarters)) return 'нет наборов';
    if (!state.meta.album || typeof state.meta.album !== 'object') return 'нет альбома';
    return null;
  }

  function summary(state, cfg) {
    var parts = [Fmt.num(Big.floor(state.run.bricks)) + ' кирпичей', 'жителей ' + residents(state, cfg), 'альбом ' + albumSize(state)];
    var l = state.layers[LAYER];
    if (l && l.count) parts.push('городов ' + (l.count + 1));
    return { line: parts.join(' · ') };
  }

  /** The fire tower's chest is ready (the notification «Каланча»). */
  function next(state, now, cfg) {
    if (lvl(state, 'tower') <= 0 || state.run.towerReady || !state.run.towerAt) return [];
    if (state.run.towerAt - now > DAY) return [];
    return [{ id: 'tower', at: Math.max(now, state.run.towerAt), text: 'Каланча собрала налог — заберите сундук' }];
  }

  /** The chest of «Пассажир»: a herald's hint and the tax of an hour. */
  function chest(state, rng, cfg) {
    var amount = Big.floor(Big.max(cfg['chest.min'], Big.mul(taxPerSec(state, cfg), 60 * cfg['chest.taxMin'])));
    gain(state, amount);
    state.run.hints.herald += cfg['chest.heralds'];
    return { title: 'Сундук путника', items: [{ title: 'Кирпичи', amount: amount }, { title: 'Подсказка Глашатая', amount: cfg['chest.heralds'] }] };
  }

  /** A themed set when the stock is empty: a theme and a seed from the built-in list. */
  function procedural(kind, rng) {
    if (kind !== 'themes') return null;
    var t = rng.pick(THEMES);
    return { title: t.title, seed: t.seed, procedural: true };
  }

  function validateStock(kind, item) {
    if (kind === 'themes') {
      if (!/^[а-яё]{6,9}$/.test(String(item.seed || '').toLowerCase())) return 'зерно — одно русское слово из 6–9 букв';
      if (String(item.title || '').indexOf('//') >= 0) return 'ссылка в теме';
    }
    return null;
  }

  return {
    LAYER: LAYER, BUILDINGS: BUILDINGS, QUARTERS: QUARTERS, CITIES: CITIES, THEMES: THEMES, ALPHABET_START: ALPHABET_START,
    init: init, tick: tick, offline: offline, prestigeGain: prestigeGain, bonus: bonus, onPrestige: onPrestige,
    migrate: migrate, validate: validate, summary: summary, next: next, chest: chest, procedural: procedural, validateStock: validateStock,
    fill: fill, lvl: lvl, cost: cost, blocked: blocked, buy: buy, residents: residents, houses: houses, plots: plots,
    taxPerSec: taxPerSec, offlineShare: offlineShare, fame: fame, quarterOpen: quarterOpen, albumSize: albumSize,
    points: points, wordValue: wordValue, setWords: setWords, progress: progress, current: current, submit: submit,
    ask: ask, approve: approve, prepare: prepare, openNext: openNext, choose: choose, closeSet: closeSet, hint: hint,
    shuffle: shuffle, muse: muse, pickCity: pickCity, collectTower: collectTower, regen: regen, letterOfDay: letterOfDay,
    dayKey: dayKey, seedRange: seedRange, alphabetDone: alphabetDone, alphabetMissing: alphabetMissing, openQuarters: openQuarters
  };
});
