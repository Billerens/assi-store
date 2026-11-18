// The logic of «Алхимик»: elements, recipes, the store, sources, cubes, orders, the philosopher's
// stone and the Great Work, and the checks of the model's answers that grow the tree. Shared
// subset of JavaScript: it runs on the screen (window.GameSim), in the engine (Rhino, require)
// and in node. No class, no async, no f(...args), no for (let …); every number is a setting of
// config.json (cfg). Randomness only from ctx.rng or a generator made from the save's seed.
//
// The tree = the hand-made set (content/*.json) + what the model added (graph.json in
// data/games/alchemist, written by graph.js). On the screen both come through setContent and
// setGraph before Game.start; in the engine and in node the content is required here and
// graph.json is read once (graph.js calls setGraph after every change).
(function (root, make) {
  var node = typeof require === 'function' && typeof exports !== 'undefined';
  var api;
  if (node) {
    api = make(require('../engine/big.js'), require('../engine/fmt.js'), require('../engine/rng.js'), {
      elements: require('./content/elements.json'),
      recipes: require('./content/recipes.json'),
      triples: require('./content/triples.json'),
      categories: require('./content/categories.json'),
      palette: require('./content/palette.json'),
      banned: require('./content/banned.json'),
      glyphs: require('./content/glyphs.json')
    }, require);
  } else {
    api = make(root.Big, root.Fmt, root.Rng, null, null);
  }
  if (typeof exports !== 'undefined') { for (var k in api) exports[k] = api[k]; } else { root.GameSim = api; }
})(this, function (Big, Fmt, Rng, CONTENT, engineRequire) {
  'use strict';

  var STONE = 'stone';
  var TINCT = 'tincture';
  var GRAPH_PATH = 'data/games/alchemist/graph.json';
  var MIN = 60000;

  var SOURCES = [
    { id: 'fire', el: 'огонь', title: 'Горн' },
    { id: 'water', el: 'вода', title: 'Родник' },
    { id: 'earth', el: 'земля', title: 'Пласт' },
    { id: 'air', el: 'воздух', title: 'Мехи' },
    { id: 'ether', el: 'эфир', title: 'Небесный купол', unlock: 'ether' },
    { id: 'void', el: 'пустота', title: 'Безмолвный колодец', unlock: 'void' }
  ];

  // The 21 upgrades of the spec (sources 1–4, with the two extra sources of the layers).
  var UPGRADES = [
    { id: 'fire', title: 'Горн', source: true },
    { id: 'water', title: 'Родник', source: true },
    { id: 'earth', title: 'Пласт', source: true },
    { id: 'air', title: 'Мехи', source: true },
    { id: 'ether', title: 'Небесный купол', source: true, unlock: 'ether' },
    { id: 'void', title: 'Безмолвный колодец', source: true, unlock: 'void' },
    { id: 'shelves', title: 'Полки' },
    { id: 'cubes', title: 'Перегонный куб' },
    { id: 'coil', title: 'Змеевик' },
    { id: 'crucible', title: 'Тигель удачи' },
    { id: 'shop', title: 'Лавка' },
    { id: 'clerk', title: 'Приказчик', once: true },
    { id: 'loupe', title: 'Лупа' },
    { id: 'scroll', title: 'Свиток подсказки' },
    { id: 'apprentice', title: 'Ученик' },
    { id: 'athanor', title: 'Атанор', once: true },
    { id: 'retort', title: 'Реторта' },
    { id: 'mortar', title: 'Ступка', once: true },
    { id: 'sieve', title: 'Сито' },
    { id: 'seal', title: 'Печать гильдии' },
    { id: 'pointer', title: 'Указатель', once: true },
    { id: 'glass', title: 'Песочные часы мастера' },
    { id: 'catalog', title: 'Каталог', once: true }
  ];

  var UNLOCKS = [
    { id: 'transmute', key: 'unlock.transmute', title: 'Трансмутация' },
    { id: 'cubes', key: 'unlock.cubes', title: 'Два куба с начала цикла' },
    { id: 'athanor', key: 'unlock.athanor', title: 'Атанор навсегда' },
    { id: 'ether', key: 'unlock.ether', title: 'Пятая стихия Эфир' },
    { id: 'triple', key: 'unlock.triple', title: 'Тройное смешение' },
    { id: 'void', key: 'unlock.void', title: 'Шестая стихия Пустота' },
    { id: 'great', key: 'unlock.great', title: 'Великое делание' }
  ];

  var EVENTS = {
    wanderer: { title: 'Странствующий алхимик', text: 'Оставил бесплатный свиток подсказки' },
    comet: { title: 'Комета', text: 'Открытия неба дают ×3' },
    fire: { title: 'Пожар в лаборатории', text: 'Куб остановлен — тапните по нему трижды' },
    star: { title: 'Звёздный час', text: 'Ценность всего ×2' },
    scholar: { title: 'Запрос учёного', text: 'Откройте новый элемент — награда за 10 минут дохода' }
  };
  var EVENT_IDS = ['wanderer', 'comet', 'fire', 'star', 'scholar'];

  // Defaults of the settings the graph checks need when no config comes (node tools).
  var GRAPH_DEFAULTS = {
    'name.min': 2, 'name.max': 24, 'name.words': 3, 'desc.max': 120, 'near.minLen': 6, 'near.distance': 1,
    'batch.size': 40, 'batch.maxNew': 15, 'reaction.noneShare': 0.4, 'pool.recent': 30, 'triple.share': 0.1
  };

  function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function num(v, d) { var n = Number(v); return n === n && isFinite(n) ? n : d; }
  function opt(cfg, k) { return cfg && cfg[k] !== undefined ? cfg[k] : GRAPH_DEFAULTS[k]; }

  // ---- the tree ------------------------------------------------------------------------------------

  var GRAPH = null;
  var GRAPH_READ = false;
  var TREE = null;

  /** Comparable form of a name: lower case, ё as е, hyphens as spaces, single spaces. */
  function compareKey(text) {
    return String(text === undefined || text === null ? '' : text).toLowerCase().replace(/ё/g, 'е').replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
  }

  /** The key of a recipe: the keys of its ingredients sorted, joined by «+» (a pair or a triple). */
  function keyOf(list) { return list.slice().sort().join('+'); }

  function readGraph() {
    if (GRAPH_READ || !engineRequire) return;
    GRAPH_READ = true;
    try {
      var files = engineRequire('lib/axiko').files;
      if (files.exists(GRAPH_PATH)) GRAPH = JSON.parse(files.read(GRAPH_PATH));
    } catch (error) {
      GRAPH = null;
    }
  }

  /**
   * The tree from the hand-made content and the model's graph: {els, list, recipes, none,
   * quarantine, producers, uses, roots, cats, glyphs, palette, version}. The first recipe of a
   * pair wins; an element enters with the first recipe that makes it (its tier then is fixed).
   */
  function buildTree(content, graph) {
    var t = {
      els: {}, list: [], recipes: {}, none: {}, quarantine: {}, producers: {}, uses: {}, roots: {},
      cats: {}, catList: [], glyphs: {}, glyphList: [], palette: 0, version: graph ? num(graph.version, 0) : 0, model: 0, triples: 0
    };
    if (!content) return t;
    (content.categories || []).forEach(function (c) { t.cats[c.id] = c; t.catList.push(c.id); });
    var gl = content.glyphs || {};
    for (var g in gl) if (has(gl, g)) { t.glyphs[g] = true; t.glyphList.push(g); }
    t.palette = (content.palette || []).length;
    function addEl(e, src) {
      if (!e || !e.key || t.els[e.key]) return;
      var x = { key: e.key, name: e.name, tier: num(e.tier, 0), cat: e.cat, glyph: e.glyph, colors: e.colors || [0, 0], desc: e.desc || '', src: src, at: num(e.at, 0) };
      // The model's own icon: checked when it came; the screen shows it as an image only.
      if (typeof e.svg === 'string' && /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/.test(e.svg)) x.svg = e.svg;
      t.els[x.key] = x;
      t.list.push(x);
      if (x.tier === 0) t.roots[x.key] = true;
    }
    function addRecipe(ins, r, src, at, by) {
      var sorted = ins.slice().sort();
      var k = sorted.join('+');
      if (t.recipes[k] || !t.els[r]) return;
      for (var i = 0; i < sorted.length; i++) if (!t.els[sorted[i]]) return;
      var rec = { k: k, ins: sorted, r: r, src: src, at: num(at, 0), by: by || '' };
      t.recipes[k] = rec;
      (t.producers[r] = t.producers[r] || []).push(rec);
      var seen = {};
      sorted.forEach(function (x) {
        if (seen[x]) return;
        seen[x] = true;
        (t.uses[x] = t.uses[x] || []).push(rec);
      });
      if (sorted.length === 3) t.triples++;
      if (src === 'model') t.model++;
    }
    (content.elements || []).forEach(function (e) { addEl(e, e.src || 'base'); });
    (content.recipes || []).forEach(function (r) { addRecipe([r.a, r.b], r.r, r.src || 'base', 0, ''); });
    (content.triples || []).forEach(function (r) { addRecipe(r.parts, r.r, 'triple', 0, ''); });
    if (graph) {
      (graph.elements || []).forEach(function (e) { addEl(e, 'model'); });
      (graph.recipes || []).forEach(function (r) { addRecipe(String(r.k).split('+'), r.r, 'model', r.at, r.by); });
      (graph.none || []).forEach(function (k) { if (!t.recipes[k]) t.none[k] = true; });
      (graph.vetoed || []).forEach(function (v) { if (v && v.k && !t.recipes[v.k]) t.none[v.k] = true; });
      (graph.quarantine || []).forEach(function (q) { if (q && q.k && !t.recipes[q.k]) t.quarantine[q.k] = q; });
    }
    return t;
  }

  function tree() {
    if (!TREE) {
      readGraph();
      TREE = buildTree(CONTENT, GRAPH);
    }
    return TREE;
  }

  /** The screen gives the content it fetched (the engine and node require it). */
  function setContent(content) {
    CONTENT = content;
    TREE = null;
  }

  /** The model's part of the tree changed (graph.js, the screen after a sync). */
  function setGraph(graph) {
    GRAPH = graph || null;
    GRAPH_READ = true;
    TREE = null;
  }

  function content() { return CONTENT; }
  function graph() { readGraph(); return GRAPH; }

  function pairState(k, t) {
    t = t || tree();
    if (t.recipes[k]) return 'recipe';
    if (t.none[k]) return 'none';
    return 'unknown';
  }

  // ---- numbers of the state --------------------------------------------------------------------------

  function lv(state, id) { return (state.run.lv && state.run.lv[id]) || 0; }

  function unlocked(state, id) { return !!(state.meta.unlocks && state.meta.unlocks[id]); }

  function layerAmount(state, id) {
    var l = state.layers && state.layers[id];
    if (!l) return 0;
    var x = Big.toNumber(Big.of(l.currency, 0));
    return x < 1e15 ? Math.round(x) : x;
  }

  function stones(state) { return layerAmount(state, STONE); }
  function tinctures(state) { return layerAmount(state, TINCT); }

  /** The stones' bonus with the tinctures': sources and value (+10 % a stone, ×2 a tincture). */
  function power(state, cfg) {
    return (1 + cfg['stone.bonus'] * stones(state)) * Math.pow(cfg['tincture.mult'], tinctures(state));
  }

  function capOf(state, cfg) { return cfg['store.base'] * Math.pow(cfg['shelves.mult'], lv(state, 'shelves')); }

  function sourceLevel(state, s) {
    if (s.unlock && !unlocked(state, s.unlock)) return 0;
    return 1 + lv(state, s.id);
  }

  function sourceRate(state, cfg, s) { return cfg['source.rate'] * sourceLevel(state, s) * power(state, cfg); }

  function eventOn(state, id, now) {
    var e = state.run.event;
    return !!(e && e.id === id && (e.until === 0 || e.until > now));
  }

  /** The value of one unit: 2.2^tier × (1 + 0.01 × the book) × stones and tinctures × the star hour. */
  function value(state, cfg, key, now) {
    var e = tree().els[key];
    var tier = e ? e.tier : 0;
    var v = Math.pow(cfg['value.base'], tier) * (1 + cfg['value.perBook'] * (state.meta.bookN || 0)) * power(state, cfg);
    if (now !== undefined && eventOn(state, 'star', now)) v *= cfg['star.mult'];
    return v;
  }

  function sellPrice(state, cfg, key, now) { return value(state, cfg, key, now) * (1 + cfg['shop.bonus'] * lv(state, 'shop')); }

  function gain(state, amount) {
    if (Big.sign(amount) <= 0) return;
    state.run.ess = Big.str(Big.add(state.run.ess, amount));
    state.run.earned = Big.str(Big.add(state.run.earned, amount));
  }

  function have(state, key) { return state.run.store[key] || 0; }

  /** Adds to the store up to the cap; returns what fitted. */
  function put(state, cfg, key, amount) {
    var cap = capOf(state, cfg);
    var now = have(state, key);
    var room = Math.max(0, cap - now);
    var add = Math.min(room, amount);
    if (add > 0) state.run.store[key] = now + add;
    return add;
  }

  function countOf(keys) {
    var n = {};
    keys.forEach(function (k) { n[k] = (n[k] || 0) + 1; });
    return n;
  }

  function canPay(state, keys) {
    var n = countOf(keys);
    for (var k in n) if (has(n, k) && have(state, k) + 1e-9 < n[k]) return false;
    return true;
  }

  function pay(state, keys) {
    var n = countOf(keys);
    for (var k in n) {
      if (!has(n, k)) continue;
      var left = have(state, k) - n[k];
      state.run.store[k] = left < 1e-9 ? 0 : left;
    }
  }

  /** Essence a second from the sources sold as they are (the base of «10 minutes of income»). */
  function incomeRate(state, cfg) {
    var sum = 0;
    SOURCES.forEach(function (s) { sum += sourceRate(state, cfg, s) * sellPrice(state, cfg, s.el); });
    return sum;
  }

  // ---- upgrades --------------------------------------------------------------------------------------

  function upgradeDef(id) {
    for (var i = 0; i < UPGRADES.length; i++) if (UPGRADES[i].id === id) return UPGRADES[i];
    return null;
  }

  function maxOf(cfg, u) {
    if (u.once) return 1;
    if (u.source) return cfg['source.max'];
    if (u.id === 'cubes') return cfg['cubes.max'];
    return cfg['up.' + u.id + '.max'];
  }

  function costOf(state, cfg, id) {
    var u = upgradeDef(id);
    if (!u) return null;
    var n = lv(state, id);
    if (n >= maxOf(cfg, u)) return null;
    if (u.source) {
      var base = u.unlock ? cfg[u.id + '.cost'] : cfg['source.cost'];
      return Big.costGeom(base, cfg['source.growth'], n, 1);
    }
    if (u.once) return Big.of(cfg['up.' + id + '.cost']);
    return Big.costGeom(cfg['up.' + id + '.cost'], cfg['up.' + id + '.growth'], n, 1);
  }

  function available(state, u) {
    if (u.unlock && !unlocked(state, u.unlock)) return false;
    if (u.id === 'athanor' && unlocked(state, 'athanor')) return false;
    return true;
  }

  function cubeCount(state) { return state.run.cubes.length; }

  /** Buys one level of an upgrade; true when bought. */
  function buy(state, cfg, id) {
    var u = upgradeDef(id);
    if (!u || !available(state, u)) return false;
    var price = costOf(state, cfg, id);
    if (!price || Big.lt(state.run.ess, price)) return false;
    if (id === 'cubes' && cubeCount(state) >= cfg['cubes.max']) return false;
    state.run.ess = Big.str(Big.sub(state.run.ess, price));
    state.run.lv[id] = lv(state, id) + 1;
    if (id === 'cubes') state.run.cubes.push({ k: null, p: 0, fire: 0 });
    if (id === 'glass') state.run.capHours = cfg['glass.hours'] * state.run.lv.glass;
    if (id === 'loupe' && !state.run.loupe.n) state.run.loupe.n = 1;
    if (id === 'scroll' && !state.run.scroll.n) state.run.scroll.n = 1;
    if (id === 'apprentice' && !state.run.appAt) state.run.appAt = 0;
    state.run.bought = (state.run.bought || 0) + 1;
    return true;
  }

  /** The cheapest upgrade for the screen: [{id, title, level, max, cost, can, text}]. */
  function upgradeList(state, cfg) {
    var out = [];
    UPGRADES.forEach(function (u) {
      if (!available(state, u)) return;
      var cost = costOf(state, cfg, u.id);
      out.push({
        id: u.id, title: u.title, level: lv(state, u.id) + (u.source ? 1 : 0), max: maxOf(cfg, u) + (u.source ? 1 : 0),
        cost: cost, can: !!cost && Big.gte(state.run.ess, cost), text: upgradeText(state, cfg, u)
      });
    });
    return out;
  }

  function pct(x) { return Math.round(x * 1000) / 10 + ' %'; }

  function upgradeText(state, cfg, u) {
    var n = lv(state, u.id);
    if (u.source) {
      var s = null;
      SOURCES.forEach(function (x) { if (x.id === u.id) s = x; });
      return tree().els[s.el] ? tree().els[s.el].name + ': ' + Fmt.num(sourceRate(state, cfg, s)) + ' в секунду, +' + Fmt.num(cfg['source.rate'] * power(state, cfg)) + ' за уровень' : '';
    }
    switch (u.id) {
      case 'shelves': return 'Склад на элемент: ' + Fmt.num(capOf(state, cfg)) + ' → ' + Fmt.num(capOf(state, cfg) * cfg['shelves.mult']);
      case 'cubes': return 'Кубов: ' + cubeCount(state) + ' из ' + cfg['cubes.max'] + '. Куб сам делает реакцию раз в ' + Fmt.num(cubePeriod(state, cfg)) + ' с';
      case 'coil': return 'Скорость кубов +' + pct(cfg['coil.speed']) + ' за уровень, сейчас ×' + Fmt.num(1 + cfg['coil.speed'] * n);
      case 'crucible': return 'Шанс двойного выхода куба: ' + (n ? pct(crucibleChance(state, cfg)) : '0 %') + ' → ' + pct(cfg['crucible.base'] + cfg['crucible.per'] * n);
      case 'shop': return 'Цена продажи +' + pct(cfg['shop.bonus']) + ' за уровень, сейчас ×' + Fmt.num(1 + cfg['shop.bonus'] * n);
      case 'clerk': return 'Продаёт всё сверх ' + pct(cfg['clerk.share']) + ' склада, пока вы в игре';
      case 'loupe': return 'До смешивания показывает, есть ли реакция. Зарядов до ' + (n + 1) + ', заряд в ' + cfg['loupe.periodMin'] + ' мин';
      case 'scroll': return 'Показывает пару из запаса, которую можно собрать сейчас. До ' + (n + 1) + ', свиток в ' + cfg['scroll.periodMin'] + ' мин';
      case 'apprentice': return 'Сам пробует рецепты из запаса раз в ' + Fmt.num(apprenticeMin(cfg, n + 1)) + ' мин';
      case 'athanor': return 'Кубы без вас работают на 100 % вместо ' + pct(cfg['cube.offline']);
      case 'retort': return 'Награда за открытие ×' + Fmt.num(Math.pow(cfg['retort.mult'], n + 1));
      case 'mortar': return 'Ручная реакция даёт ' + cfg['mortar.out'] + ' штуки';
      case 'sieve': return 'Источники с шансом ' + pct(cfg['sieve.chance'] * (n + 1)) + ' дают элемент ступени 1';
      case 'seal': return 'Заказов +' + cfg['seal.cards'] + ', награда +' + pct(cfg['seal.bonus']);
      case 'pointer': return 'В Книге видно, сколько неоткрытых рецептов в запасе у элемента';
      case 'glass': return 'Предел офлайна +' + cfg['glass.hours'] + ' ч, сейчас +' + (state.run.capHours || 0) + ' ч';
      case 'catalog': return 'Фильтр полки по категориям и поиск по буквам';
    }
    return '';
  }

  // ---- the book, discoveries ----------------------------------------------------------------------------

  function inBook(state, key) { return !!state.meta.book[key]; }

  function remember(state, key, cfg) {
    var list = state.meta.recent;
    var i = list.indexOf(key);
    if (i >= 0) list.splice(i, 1);
    list.push(key);
    var keep = cfg ? cfg['pool.recent'] : 30;
    if (list.length > keep) list.splice(0, list.length - keep);
  }

  /** A new element into the book: the reward, the stats; returns what the screen shows. */
  function discover(state, cfg, key, now, mult) {
    var e = tree().els[key];
    if (!e || inBook(state, key)) return null;
    state.meta.book[key] = now;
    state.meta.bookN = (state.meta.bookN || 0) + 1;
    remember(state, key, cfg);
    if (e.tier > (state.meta.maxTier || 0)) state.meta.maxTier = e.tier;
    var reward = cfg['reward.base'] * Math.pow(cfg['reward.growth'], e.tier) * Math.pow(cfg['retort.mult'], lv(state, 'retort')) *
      Math.pow(cfg['tincture.mult'], tinctures(state)) * (mult || 1);
    if (e.cat === 'небо' && eventOn(state, 'comet', now)) reward *= cfg['comet.mult'];
    gain(state, reward);
    var out = { key: key, name: e.name, tier: e.tier, reward: reward, desc: e.desc, src: e.src };
    if (eventOn(state, 'scholar', now) && !state.run.event.done) {
      var bonus = incomeRate(state, cfg) * cfg['scholar.rewardMin'] * 60 * (mult || 1);
      gain(state, bonus);
      state.run.event.done = true;
      state.run.event.until = now;
      out.scholar = bonus;
    }
    state.run.found = (state.run.found || 0) + 1;
    return out;
  }

  function open(state, k, now) {
    if (!state.meta.opened[k]) state.meta.opened[k] = now;
    if (state.meta.asked[k]) delete state.meta.asked[k];
  }

  function ask(state, cfg, k, now) {
    var asked = state.meta.asked;
    if (!asked[k]) asked[k] = now;
    var keys = Object.keys(asked);
    if (keys.length > cfg['queue.max']) {
      keys.sort(function (a, b) { return asked[a] - asked[b]; });
      keys.slice(0, keys.length - cfg['queue.max']).forEach(function (x) { delete asked[x]; });
    }
  }

  function recipeUsable(state, rec) {
    if (rec.ins.length === 3 && !unlocked(state, 'triple')) return false;
    for (var i = 0; i < rec.ins.length; i++) if (!inBook(state, rec.ins[i])) return false;
    return true;
  }

  /**
   * A reaction by hand: keys of 2 (or 3 with the triple mixing) elements from the shelf.
   * {result: 'recipe' | 'none' | 'unknown' | 'short' | 'locked', k, r, made, full, discovery}.
   * «none» and «unknown» spend nothing; «unknown» goes to the queue for the model.
   */
  function mix(state, cfg, keys, o) {
    o = o || {};
    var t = tree();
    var now = o.now || Date.now();
    keys = keys.map(String);
    if (keys.length !== 2 && keys.length !== 3) return { result: 'locked' };
    if (keys.length === 3 && !unlocked(state, 'triple')) return { result: 'locked' };
    for (var i = 0; i < keys.length; i++) if (!inBook(state, keys[i])) return { result: 'locked' };
    var k = keyOf(keys);
    if (!canPay(state, keys)) return { result: 'short', k: k };
    state.run.mixes = (state.run.mixes || 0) + 1;
    var rec = t.recipes[k];
    if (!rec) {
      if (t.none[k]) {
        state.run.last = { k: k, s: 'none', at: now };
        return { result: 'none', k: k };
      }
      ask(state, cfg, k, now);
      state.run.last = { k: k, s: 'unknown', at: now };
      return { result: 'unknown', k: k };
    }
    pay(state, keys);
    var out = lv(state, 'mortar') ? cfg['mortar.out'] : 1;
    var made = put(state, cfg, rec.r, out);
    var res = { result: 'recipe', k: k, r: rec.r, made: made, full: made < out, fresh: !state.meta.opened[k], src: rec.src };
    open(state, k, now);
    res.discovery = discover(state, cfg, rec.r, now, o.mult);
    state.run.made = (state.run.made || 0) + 1;
    state.run.last = { k: k, s: 'recipe', r: rec.r, at: now };
    if (state.run.hint && state.run.hint.k === k) state.run.hint = null;
    return res;
  }

  /** Recipes not opened yet whose ingredients are all in the book: the «stock» the counter shows. */
  function frontier(state, t) {
    t = t || tree();
    var out = [];
    for (var k in t.recipes) {
      if (!has(t.recipes, k)) continue;
      var rec = t.recipes[k];
      if (state.meta.opened[k] || !recipeUsable(state, rec)) continue;
      out.push(rec);
    }
    return out;
  }

  function stockCount(state) { return frontier(state).length; }

  /** Unopened recipes of the tree with the element (the «Указатель» in the Book). */
  function stockOf(state, key) {
    var n = 0;
    (tree().uses[key] || []).forEach(function (rec) { if (!state.meta.opened[rec.k]) n++; });
    return n;
  }

  /** Elements lit by «Вдохновение»: in a recipe of the stock with only opened elements. */
  function highlights(state, now) {
    var out = {};
    if (!(state.run.insightUntil > now)) return out;
    frontier(state).forEach(function (rec) { rec.ins.forEach(function (x) { out[x] = true; }); });
    return out;
  }

  function byTier(a, b) {
    var t = tree();
    var ta = t.els[a.r].tier;
    var tb = t.els[b.r].tier;
    if (a.src === 'model' && b.src !== 'model') return -1;
    if (b.src === 'model' && a.src !== 'model') return 1;
    return ta - tb || (a.k < b.k ? -1 : a.k > b.k ? 1 : 0);
  }

  /** The scroll of a hint: a recipe of the stock that can be made from the shelf now. */
  function hintPick(state, modelOnly) {
    var list = frontier(state).filter(function (rec) { return canPay(state, rec.ins) && (!modelOnly || rec.src === 'model'); });
    list.sort(byTier);
    return list[0] || null;
  }

  function useHint(state, cfg, now) {
    if (!(state.run.scroll.n >= 1)) return { ok: false, why: 'нет свитков' };
    var rec = hintPick(state);
    if (!rec) return { ok: false, why: frontier(state).length ? 'для запаса не хватает элементов на складе' : 'в запасе нет рецептов из открытого' };
    if (state.run.scroll.n >= lv(state, 'scroll')) state.run.scroll.at = now;
    state.run.scroll.n--;
    state.meta.hints = (state.meta.hints || 0) + 1;
    state.run.hint = { k: rec.k, ins: rec.ins, at: now };
    return { ok: true, k: rec.k, ins: rec.ins };
  }

  /** The loupe: whether a pair reacts, before mixing (spends a charge, nothing else). */
  function useLoupe(state, keys, now) {
    if (!(state.run.loupe.n >= 1)) return { ok: false, why: 'лупа без зарядов' };
    if (state.run.loupe.n >= lv(state, 'loupe')) state.run.loupe.at = now || Date.now();
    state.run.loupe.n--;
    return { ok: true, k: keyOf(keys), state: pairState(keyOf(keys)) };
  }

  function recharge(r, max, periodMs, now) {
    if (!max) return;
    if (!r.at) r.at = now;
    if (r.n >= max) {
      r.at = now;
      return;
    }
    while (r.n < max && now - r.at >= periodMs) {
      r.n++;
      r.at += periodMs;
    }
    if (r.n >= max) r.at = now;
  }

  /** Transmutation (1 stone): 10 units → 1 unit of another element of the same tier. */
  function transmute(state, cfg, from, to) {
    var t = tree();
    if (!unlocked(state, 'transmute')) return { ok: false, why: 'трансмутация откроется с первым камнем' };
    if (!t.els[from] || !t.els[to] || from === to) return { ok: false, why: 'нет таких элементов' };
    if (t.els[from].tier !== t.els[to].tier) return { ok: false, why: 'ступени разные' };
    if (!inBook(state, to)) return { ok: false, why: 'элемент ещё не открыт' };
    var need = cfg['transmute.cost'];
    if (have(state, from) + 1e-9 < need) return { ok: false, why: 'нужно ' + need + ' штук' };
    if (put(state, cfg, to, 1) < 1) return { ok: false, why: 'склад полон' };
    state.run.store[from] = Math.max(0, have(state, from) - need);
    return { ok: true };
  }

  /** Selling by hand: n units (all when n is not given) for the price × the links' multiplier. */
  function sell(state, cfg, key, n, mult, now) {
    var amount = Math.floor(n === undefined || n === null ? have(state, key) : Math.min(n, have(state, key)));
    if (amount <= 0) return Big.ZERO;
    state.run.store[key] = have(state, key) - amount;
    var got = Big.of(amount * sellPrice(state, cfg, key, now) * (mult || 1));
    gain(state, got);
    state.run.sold = (state.run.sold || 0) + amount;
    return got;
  }

  // ---- cubes -------------------------------------------------------------------------------------------

  function cubePeriod(state, cfg) { return cfg['cube.periodSec'] / (1 + cfg['coil.speed'] * lv(state, 'coil')); }

  function crucibleChance(state, cfg) {
    var n = lv(state, 'crucible');
    return n ? cfg['crucible.base'] + cfg['crucible.per'] * (n - 1) : 0;
  }

  function athanor(state) { return lv(state, 'athanor') > 0 || unlocked(state, 'athanor'); }

  /** Puts cube i on an opened recipe (null takes it off). */
  function setCube(state, i, k) {
    var c = state.run.cubes[i];
    if (!c) return false;
    if (k !== null && !(tree().recipes[k] && state.meta.opened[k])) return false;
    c.k = k;
    c.p = 0;
    return true;
  }

  /** A tap on a burning cube: three put it out. */
  function tapFire(state, i) {
    var c = state.run.cubes[i];
    if (!c || !c.fire) return false;
    c.fire--;
    if (!c.fire && state.run.event && state.run.event.id === 'fire') state.run.event.until = 1;
    return true;
  }

  function runCubes(state, cfg, dt, offline) {
    var t = tree();
    var speed = 1 / cubePeriod(state, cfg);
    if (offline && !athanor(state)) speed *= cfg['cube.offline'];
    var chance = crucibleChance(state, cfg);
    var made = 0;
    state.run.cubes.forEach(function (c) {
      if (!c.k || c.fire) return;
      var rec = t.recipes[c.k];
      if (!rec) {
        c.k = null;
        return;
      }
      c.p += dt * speed;
      var guard = 0;
      while (c.p >= 1 && guard++ < 100000) {
        if (!canPay(state, rec.ins) || have(state, rec.r) + 1 > capOf(state, cfg) + 1e-9) {
          c.p = Math.min(c.p, 1);
          return;
        }
        pay(state, rec.ins);
        var out = 1;
        if (chance) {
          state.run.acc.crucible += chance;
          if (state.run.acc.crucible >= 1) {
            state.run.acc.crucible -= 1;
            out = 2;
          }
        }
        put(state, cfg, rec.r, out);
        made++;
        c.p -= 1;
      }
    });
    state.run.cubeMade = (state.run.cubeMade || 0) + made;
    return made;
  }

  // ---- orders of the guild -----------------------------------------------------------------------------

  function orderSlots(state, cfg) { return cfg['orders.cards'] + cfg['seal.cards'] * lv(state, 'seal'); }

  function orderPick(state, cfg) {
    var t = tree();
    var maxTier = Math.max(1, (state.meta.maxTier || 1) - 1);
    var taken = {};
    state.run.orders.forEach(function (o) { if (o.k) taken[o.k] = true; });
    var list = [];
    for (var k in state.meta.book) {
      if (!has(state.meta.book, k) || taken[k] || !t.els[k]) continue;
      var tier = t.els[k].tier;
      if (tier >= 1 && tier <= maxTier) list.push(k);
    }
    if (!list.length) return null;
    list.sort();
    state.run.orderNo = (state.run.orderNo || 0) + 1;
    var rng = Rng.make(Rng.hash(String(state.meta.seed) + ':order:' + state.run.orderNo));
    return list[rng.int(list.length)];
  }

  function runOrders(state, cfg, now) {
    if ((state.meta.bookN || 0) < cfg['orders.fromBook']) return;
    var slots = orderSlots(state, cfg);
    while (state.run.orders.length < slots) state.run.orders.push({ k: null, n: 0, at: 0 });
    state.run.orders.forEach(function (o) {
      if (o.k || o.at > now) return;
      var k = orderPick(state, cfg);
      if (!k) return;
      o.k = k;
      o.n = cfg['orders.amount'];
      o.at = now;
    });
  }

  function orderReward(state, cfg, o, now) {
    return cfg['orders.rewardMult'] * o.n * value(state, cfg, o.k, now) * (1 + cfg['seal.bonus'] * lv(state, 'seal'));
  }

  /** Hands an order in when the store has it: the reward, a new order in 15 minutes. */
  function deliver(state, cfg, i, mult, now) {
    var o = state.run.orders[i];
    if (!o || !o.k) return null;
    if (have(state, o.k) + 1e-9 < o.n) return null;
    state.run.store[o.k] = have(state, o.k) - o.n;
    var reward = orderReward(state, cfg, o, now) * (mult || 1);
    gain(state, reward);
    state.run.delivered = (state.run.delivered || 0) + 1;
    o.k = null;
    o.n = 0;
    o.at = now + cfg['orders.everyMin'] * MIN;
    return reward;
  }

  // ---- the apprentice and the sieve --------------------------------------------------------------------

  function apprenticeMin(cfg, level) { return Math.max(cfg['apprentice.minMin'], cfg['apprentice.periodMin'] - cfg['apprentice.perLevel'] * (level - 1)); }

  function runApprentice(state, cfg, now, mult, report) {
    var n = lv(state, 'apprentice');
    if (!n) return;
    var period = apprenticeMin(cfg, n) * MIN;
    if (!state.run.appAt) state.run.appAt = now + period;
    var guard = 0;
    while (now >= state.run.appAt && guard++ < 200) {
      state.run.appAt += period;
      var rec = hintPick(state, true);
      if (!rec) continue;
      pay(state, rec.ins);
      put(state, cfg, rec.r, 1);
      open(state, rec.k, state.run.appAt);
      var d = discover(state, cfg, rec.r, now, mult);
      state.run.appFound = (state.run.appFound || 0) + 1;
      var e = tree().els[rec.r];
      var ins = rec.ins.map(function (x) { return tree().els[x].name; }).join(' + ');
      state.run.appLog.push({ k: rec.k, r: rec.r, at: now, d: !!d });
      if (state.run.appLog.length > 20) state.run.appLog.shift();
      if (report) report('Ученик: ' + ins + ' = ' + e.name + (d ? ' — открытие' : ''));
    }
  }

  function tierOneKeys(state) {
    var t = tree();
    var out = [];
    for (var k in state.meta.book) if (has(state.meta.book, k) && t.els[k] && t.els[k].tier === 1) out.push(k);
    out.sort();
    return out;
  }

  // ---- events --------------------------------------------------------------------------------------------

  function nextEventSec(cfg, rng) { return (cfg['events.minMin'] + (cfg['events.maxMin'] - cfg['events.minMin']) * rng.next()) * 60; }

  function startEvent(state, cfg, now, rng) {
    var run = state.run;
    var id = EVENT_IDS[rng.int(EVENT_IDS.length)];
    var busy = [];
    run.cubes.forEach(function (c, i) { if (c.k && !c.fire) busy.push(i); });
    if (id === 'fire' && !busy.length) id = 'star';
    var e = { id: id, at: now, until: now, no: (run.eventNo || 0) + 1 };
    if (id === 'wanderer') {
      run.scroll.n++;
      e.until = now + 5000;
    } else if (id === 'comet') e.until = now + cfg['comet.minutes'] * MIN;
    else if (id === 'star') e.until = now + cfg['star.minutes'] * MIN;
    else if (id === 'scholar') e.until = now + cfg['scholar.minutes'] * MIN;
    else if (id === 'fire') {
      e.cube = busy[rng.int(busy.length)];
      run.cubes[e.cube].fire = cfg['fire.taps'];
      e.until = 0;
    }
    run.event = e;
    run.eventNo = e.no;
  }

  function runEvents(state, cfg, dt, now, rng) {
    var run = state.run;
    run.playSec = (run.playSec || 0) + dt;
    var e = run.event;
    if (e && e.id === 'fire' && e.until === 0) {
      var c = run.cubes[e.cube];
      if (!c || !c.fire) e.until = now;
    }
    if (e && e.until !== 0 && e.until <= now) run.event = null;
    if (!rng || (state.meta.bookN || 0) < cfg['events.fromBook']) return;
    if (!run.eventAt) run.eventAt = run.playSec + nextEventSec(cfg, rng);
    if (run.playSec >= run.eventAt && !run.event) {
      startEvent(state, cfg, now, rng);
      run.eventAt = run.playSec + nextEventSec(cfg, rng);
    }
  }

  // ---- the engine's functions ----------------------------------------------------------------------------

  function freshRun(cfg) {
    var store = {};
    SOURCES.forEach(function (s) { if (!s.unlock) store[s.el] = cfg['start.amount']; });
    return {
      ess: Big.str(Big.of(cfg['start.ess'])), earned: '0e0', store: store, lv: {}, cubes: [], orders: [], orderNo: 0,
      loupe: { n: 0, at: 0 }, scroll: { n: 0, at: 0 }, appAt: 0, appLog: [], appFound: 0,
      acc: { crucible: 0, sieve: 0, sieveNo: 0 }, capHours: 0, insightUntil: 0, hint: null,
      event: null, eventAt: 0, eventNo: 0, playSec: 0, last: null, triple: false,
      mixes: 0, made: 0, cubeMade: 0, sold: 0, delivered: 0, found: 0, bought: 0
    };
  }

  function init(ctx) {
    var cfg = ctx.config;
    var book = {};
    var recent = [];
    SOURCES.forEach(function (s) {
      if (s.unlock) return;
      book[s.el] = ctx.now;
      recent.push(s.el);
    });
    return {
      run: freshRun(cfg),
      layers: {},
      meta: {
        book: book, bookN: recent.length, recent: recent, opened: {}, asked: {}, hints: 0, maxTier: 0,
        unlocks: {}, stonesBest: 0, seenGraph: 0
      }
    };
  }

  function tick(state, dt, ctx) {
    var cfg = ctx.config;
    var run = state.run;
    var now = ctx.now;
    var offline = !!ctx.offline;
    if (!(dt > 0)) return;
    // Sources (and the sieve's tier-1 finds by an accumulator: the same by steps and in one go).
    var sieve = cfg['sieve.chance'] * lv(state, 'sieve');
    var made = 0;
    SOURCES.forEach(function (s) {
      var r = sourceRate(state, cfg, s);
      if (r > 0) made += put(state, cfg, s.el, r * dt);
    });
    if (sieve > 0 && made > 0) {
      run.acc.sieve += made * sieve;
      if (run.acc.sieve >= 1) {
        var ones = tierOneKeys(state);
        var guard = 0;
        while (run.acc.sieve >= 1 && ones.length && guard++ < 1000) {
          run.acc.sieve -= 1;
          run.acc.sieveNo = (run.acc.sieveNo || 0) + 1;
          put(state, cfg, ones[run.acc.sieveNo % ones.length], 1);
        }
        if (!ones.length) run.acc.sieve = Math.min(run.acc.sieve, 1);
      }
    }
    runCubes(state, cfg, dt, offline);
    // The clerk sells everything over his share of the store, with the links' multiplier — while
    // the owner plays: without him the sources fill the store up to its cap (the spec's offline).
    if (lv(state, 'clerk') && !offline) {
      var edge = capOf(state, cfg) * cfg['clerk.share'];
      var sold = 0;
      var got = 0;
      for (var k in run.store) {
        if (!has(run.store, k)) continue;
        var over = run.store[k] - edge;
        if (over > 0) {
          run.store[k] = edge;
          got += over * sellPrice(state, cfg, k, now);
          sold += over;
        }
      }
      if (got > 0) {
        gain(state, Big.of(got * (ctx.mult || 1)));
        run.sold = (run.sold || 0) + sold;
        run.clerkGot = Big.str(Big.add(run.clerkGot || 0, got * (ctx.mult || 1)));
      }
    }
    recharge(run.loupe, lv(state, 'loupe') ? lv(state, 'loupe') : 0, cfg['loupe.periodMin'] * MIN, now);
    recharge(run.scroll, lv(state, 'scroll') ? lv(state, 'scroll') : 0, cfg['scroll.periodMin'] * MIN, now);
    runApprentice(state, cfg, now, ctx.mult, ctx.report);
    runOrders(state, cfg, now);
    runEvents(state, cfg, dt, now, offline ? null : ctx.rng);
  }

  /** The same as tick in chunks of offline.chunkSec, with the summary of what happened. */
  function offline(state, sec, ctx) {
    var cfg = ctx.config;
    var run = state.run;
    var chunk = Math.max(1, cfg['offline.chunkSec']);
    var n = Math.max(1, Math.ceil(sec / chunk));
    var dt = sec / n;
    var start = ctx.now - sec * 1000;
    var c = {};
    for (var k in ctx) if (has(ctx, k)) c[k] = ctx[k];
    c.offline = true;
    var before = { cube: run.cubeMade || 0, sold: run.sold || 0, found: run.appFound || 0, clerk: Big.of(run.clerkGot || 0) };
    for (var i = 0; i < n; i++) {
      c.now = start + (i + 1) * dt * 1000;
      tick(state, dt, c);
    }
    var events = [];
    var cubes = (run.cubeMade || 0) - before.cube;
    if (cubes >= 1) events.push('Кубы сделали реакций: ' + Fmt.num(Math.floor(cubes)));
    var clerk = Big.sub(run.clerkGot || 0, before.clerk);
    if (Big.gt(clerk, 1)) events.push('Приказчик продал на ' + Fmt.num(clerk) + ' эссенции');
    var found = (run.appFound || 0) - before.found;
    if (found) events.push('Ученик собрал рецептов: ' + found);
    return { events: events };
  }

  function prestigeGain(state, layerId, cfg) {
    if (layerId === STONE) {
      if ((state.meta.bookN || 0) < cfg['stone.minBook']) return Big.ZERO;
      if (Big.lt(state.run.earned, cfg['stone.minEarned'])) return Big.ZERO;
      var x = Math.sqrt(Big.toNumber(Big.div(state.run.earned, cfg['stone.divisor'])));
      return Big.floor(Big.of(x));
    }
    if (layerId === TINCT) {
      if (!unlocked(state, 'great')) return Big.ZERO;
      var s = stones(state);
      if (s < cfg['unlock.great']) return Big.ZERO;
      return Big.of(Math.max(0, Math.floor(Math.log(s / cfg['tincture.divisor']) / Math.LN2)));
    }
    return Big.ZERO;
  }

  function bonus(state, layerId, amount, cfg) {
    var a = Big.toNumber(Big.of(amount, 0));
    if (layerId === STONE) return Big.of(1 + cfg['stone.bonus'] * a);
    return Big.of(Math.pow(cfg['tincture.mult'], a));
  }

  /** What the stones reached open: {id: true}, from the most stones ever held. */
  function unlocksOf(best, cfg) {
    var out = {};
    UNLOCKS.forEach(function (u) { if (best >= cfg[u.key]) out[u.id] = true; });
    return out;
  }

  function applyUnlocks(state, cfg, now) {
    var best = Math.max(state.meta.stonesBest || 0, stones(state));
    state.meta.stonesBest = best;
    var was = state.meta.unlocks || {};
    var u = unlocksOf(best, cfg);
    for (var k in was) if (has(was, k) && was[k]) u[k] = true;
    state.meta.unlocks = u;
    var fresh = [];
    UNLOCKS.forEach(function (x) { if (u[x.id] && !was[x.id]) fresh.push(x.title); });
    // A cycle starts with the unlocked: two cubes, the new elements and their sources.
    if (u.cubes) while (state.run.cubes.length < cfg['unlock.cubesCount']) state.run.cubes.push({ k: null, p: 0, fire: 0 });
    [['ether', 'эфир'], ['void', 'пустота']].forEach(function (p) {
      if (!u[p[0]]) return;
      if (!inBook(state, p[1]) && tree().els[p[1]]) {
        state.meta.book[p[1]] = now;
        state.meta.bookN++;
        remember(state, p[1], cfg);
      }
      if (!have(state, p[1])) state.run.store[p[1]] = cfg['start.amount'];
    });
    return fresh;
  }

  function onPrestige(state, layerId, before, ctx) {
    var cfg = ctx.config;
    state.meta.cycles = (state.meta.cycles || 0) + 1;
    state.meta.lastUnlocked = applyUnlocks(state, cfg, ctx.now);
    if (before && before.run) state.meta.bestEarned = Big.str(Big.max(state.meta.bestEarned || 0, before.run.earned || 0));
  }

  function migrate(state, fromVer) { return state; }

  function validate(state) {
    var r = state.run;
    var m = state.meta;
    if (!Big.valid(r.ess) || Big.sign(r.ess) < 0) return 'эссенции меньше нуля';
    if (!Big.valid(r.earned)) return 'эссенция за цикл не число';
    if (!r.store || typeof r.store !== 'object') return 'нет склада';
    for (var k in r.store) {
      if (!has(r.store, k)) continue;
      var v = r.store[k];
      if (typeof v !== 'number' || !(v >= 0) || !isFinite(v)) return 'на складе «' + k + '»: ' + v;
    }
    if (!Array.isArray(r.cubes)) return 'кубы не список';
    if (!m.book || typeof m.book !== 'object') return 'нет Книги';
    if (!m.opened || typeof m.opened !== 'object') return 'нет открытых рецептов';
    return null;
  }

  function summary(state, cfg) {
    var parts = ['Книга ' + (state.meta.bookN || 0), Fmt.rate(incomeRate(state, cfg))];
    var s = stones(state);
    if (s) parts.push('камней ' + Fmt.num(s));
    var tc = tinctures(state);
    if (tc) parts.push('тинктуры ' + Fmt.num(tc));
    return { line: parts.join(' · ') };
  }

  /** «Новый заказ гильдии» and «Склад стихий полон» for the notifications. */
  function next(state, now, cfg) {
    var out = [];
    var soon = null;
    state.run.orders.forEach(function (o) { if (!o.k && o.at > now && (soon === null || o.at < soon)) soon = o.at; });
    if (soon !== null) out.push({ id: 'order', at: soon, text: 'Гильдия ждёт: новый заказ' });
    // Without the owner the clerk does not sell: the store fills up with him too.
    if (state.run.store) {
      var cap = capOf(state, cfg);
      var worst = null;
      SOURCES.forEach(function (s) {
        var r = sourceRate(state, cfg, s);
        if (!(r > 0)) return;
        var sec = (cap - have(state, s.el)) / r;
        if (sec > 0 && (worst === null || sec > worst)) worst = sec;
      });
      if (worst !== null && worst < 86400) out.push({ id: 'full', at: now + Math.ceil(worst) * 1000, text: 'Склад стихий полон — пора продать или поставить кубы' });
    }
    return out;
  }

  /** The chest of «Пассажир»: 2 scrolls and one discovery from the stock. */
  function chest(state, rng, cfg) {
    var now = Date.now();
    state.run.scroll.n += cfg['chest.scrolls'];
    var items = [{ title: 'Свитки подсказки', amount: cfg['chest.scrolls'] }];
    var list = frontier(state).filter(function (rec) { return !inBook(state, rec.r); });
    var model = list.filter(function (rec) { return rec.src === 'model'; });
    var pool = model.length ? model : list;
    if (pool.length) {
      pool.sort(function (a, b) { return a.k < b.k ? -1 : 1; });
      var rec = pool[rng.int(pool.length)];
      open(state, rec.k, now);
      var d = discover(state, cfg, rec.r, now, 1);
      put(state, cfg, rec.r, 1);
      items.push({ title: 'Открытие: ' + tree().els[rec.r].name, amount: 1 });
      if (d) items.push({ title: 'Эссенция за открытие', amount: Big.str(Big.of(d.reward)) });
    } else {
      var amount = Big.of(Math.max(incomeRate(state, cfg) * cfg['chest.fallbackMin'] * 60, cfg['reward.base'] * 10));
      gain(state, amount);
      items.push({ title: 'Эссенция', amount: Big.str(amount) });
    }
    return { title: 'Сундук алхимика', items: items };
  }

  /** The alchemist makes nothing up without the model: a pair stays «unknown» (the spec). */
  function procedural(kind, rng) { return null; }

  function capBonusHours(state) { return Number(state.run.capHours) || 0; }

  // ---- checks of the model's answers (graph.js applies them) ------------------------------------------

  var ENDINGS = ['ий', 'ый', 'ой', 'ая', 'ое', 'ие', 'а', 'я', 'ы', 'и', 'о', 'е', 'ь'];

  function stemWord(w) {
    for (var i = 0; i < ENDINGS.length; i++) {
      var e = ENDINGS[i];
      if (w.length - e.length >= 2 && w.slice(w.length - e.length) === e) return w.slice(0, w.length - e.length);
    }
    return w;
  }

  /** The key without the endings of each word (для «почти дублей»). */
  function stem(key) { return compareKey(key).split(' ').map(stemWord).join(' '); }

  function levenshtein(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    var prev = [];
    var cur = [];
    var i;
    var j;
    for (j = 0; j <= b.length; j++) prev.push(j);
    for (i = 1; i <= a.length; i++) {
      cur = [i];
      for (j = 1; j <= b.length; j++) {
        var cost = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
        cur.push(Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost));
      }
      prev = cur;
    }
    return prev[b.length];
  }

  /** Step 2: the name as the tree keeps it, {name, key} or {error}. */
  function normName(raw, cfg) {
    var s = String(raw === undefined || raw === null ? '' : raw).replace(/\s+/g, ' ').trim();
    if (!s) return { error: 'нет имени' };
    if (!/^[А-Яа-яЁё -]+$/.test(s)) return { error: 'не только кириллица: «' + s + '»' };
    if (/^-|-$|--|- | -/.test(s)) return { error: 'дефис не на месте: «' + s + '»' };
    if (s.length < opt(cfg, 'name.min') || s.length > opt(cfg, 'name.max')) return { error: 'длина имени ' + s.length + ': «' + s + '»' };
    if (s.split(' ').length > opt(cfg, 'name.words')) return { error: 'больше ' + opt(cfg, 'name.words') + ' слов: «' + s + '»' };
    var name = s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
    return { name: name, key: compareKey(name) };
  }

  function bannedHit(key, banned) {
    var words = compareKey(key).split(' ');
    var flat = ' ' + words.join(' ') + ' ';
    for (var i = 0; i < (banned || []).length; i++) {
      var b = compareKey(banned[i]);
      if (!b) continue;
      if (b.indexOf(' ') >= 0) {
        if (flat.indexOf(' ' + b) >= 0) return b;
        continue;
      }
      for (var j = 0; j < words.length; j++) {
        var w = words[j];
        if (w === b) return b;
        if (w.indexOf(b) === 0 && (b.length >= 4 || w.length <= b.length + 2)) return b;
      }
    }
    return null;
  }

  function nearIndex(t) {
    if (t.near) return t.near;
    var stems = {};
    var byLen = {};
    t.list.forEach(function (e) {
      var s = stem(e.key);
      (stems[s] = stems[s] || []).push(e.key);
      (byLen[e.key.length] = byLen[e.key.length] || []).push(e.key);
    });
    t.near = { stems: stems, byLen: byLen };
    return t.near;
  }

  /** Step 4: an existing key the new one nearly repeats (distance ≤ 1 from 6 letters, or the same stem). */
  function nearDup(t, key, cfg) {
    var ix = nearIndex(t);
    var s = stem(key);
    var hit = (ix.stems[s] || []).filter(function (k) { return k !== key; });
    if (hit.length) return hit[0];
    if (key.length < opt(cfg, 'near.minLen')) return null;
    var d = opt(cfg, 'near.distance');
    for (var len = key.length - d; len <= key.length + d; len++) {
      var list = ix.byLen[len] || [];
      for (var i = 0; i < list.length; i++) {
        if (list[i] !== key && list[i].length >= opt(cfg, 'near.minLen') && levenshtein(key, list[i]) <= d) return list[i];
      }
    }
    return null;
  }

  /** Is `target` an ancestor of any of `ins` (by every recipe of the tree)? Then the edge closes a cycle. */
  function isAncestor(t, target, ins) {
    var seen = {};
    var stack = ins.slice();
    while (stack.length) {
      var x = stack.pop();
      if (x === target) return true;
      if (seen[x]) continue;
      seen[x] = true;
      (t.producers[x] || []).forEach(function (rec) { rec.ins.forEach(function (y) { if (!seen[y]) stack.push(y); }); });
    }
    return false;
  }

  function parsePair(text) {
    var s = String(text === undefined || text === null ? '' : text).trim();
    var check = false;
    var m = /^проверка\s+(.+)$/i.exec(s);
    if (m) {
      check = true;
      s = m[1];
    }
    var parts = s.split('+').map(compareKey).filter(function (x) { return !!x; });
    if (parts.length < 2 || parts.length > 3) return null;
    parts.sort();
    return { check: check, ins: parts, k: parts.join('+') };
  }

  function tierFor(t, ins) {
    var top = 0;
    ins.forEach(function (x) { if (t.els[x] && t.els[x].tier > top) top = t.els[x].tier; });
    return top + 1;
  }

  function trimDesc(text, max) {
    var s = String(text || '').replace(/\s+/g, ' ').trim();
    if (s.length <= max) return s;
    var cut = s.slice(0, max);
    var sp = cut.lastIndexOf(' ');
    return (sp > max / 2 ? cut.slice(0, sp) : cut).replace(/[\s,;:—-]+$/, '');
  }

  /** Step 8 for a new element: banned words, the category, the glyph, the colours, the description. */
  function elementOf(t, item, nm, ins, cfg, banned) {
    var hit = bannedHit(nm.key, banned);
    if (hit) return { error: 'запрещённое слово «' + hit + '» в имени' };
    var cat = compareKey(item.category);
    if (!t.cats[cat]) return { error: 'категория не из списка: «' + item.category + '»' };
    var glyph = String(item.glyph || '').trim();
    if (!t.glyphs[glyph]) return { error: 'глиф не из набора: «' + item.glyph + '»' };
    var colors = Array.isArray(item.colors) ? item.colors.slice(0, 2) : [];
    if (colors.length === 1) colors.push(colors[0]);
    if (colors.length !== 2) return { error: 'нужно два цвета палитры' };
    for (var i = 0; i < 2; i++) {
      var c = colors[i];
      if (typeof c !== 'number' || c % 1 !== 0 || c < 0 || c >= t.palette) return { error: 'цвет вне палитры: ' + c };
    }
    var desc = trimDesc(item.desc, opt(cfg, 'desc.max'));
    if (desc.length < 3) return { error: 'нет описания' };
    var dh = bannedHit(desc, banned);
    if (dh) return { error: 'запрещённое слово «' + dh + '» в описании' };
    if (/https?:|www\./i.test(desc)) return { error: 'ссылка в описании' };
    var el = { key: nm.key, name: nm.name, tier: tierFor(t, ins), cat: cat, glyph: glyph, colors: colors, desc: desc };
    var icon = iconOf(item.svg);
    if (icon) el.svg = icon;
    return { el: el };
  }

  function existingVerdict(t, p, key) {
    if (t.roots[key]) return { why: 'стихия как результат: ' + t.els[key].name };
    if (p.ins.indexOf(key) >= 0) return { why: 'результат — один из ингредиентов' };
    if (isAncestor(t, key, p.ins)) return { why: 'цикл: «' + t.els[key].name + '» — предок ингредиента' };
    return { action: 'recipe', k: p.k, ins: p.ins, r: key };
  }

  /**
   * Steps 1–8 of the check of one answer (step 9, the limits of a batch, is graph.js's):
   * {action: 'recipe' | 'none' | 'quarantine' | 'resolve', k, ins, r, el, like} or {why}.
   * o: {config, asked: {pair key: true}, banned, triples, similar(el) -> key | null}.
   */
  function validateAnswer(t, item, o) {
    o = o || {};
    var cfg = o.config;
    if (!item || typeof item !== 'object' || Array.isArray(item)) return { why: 'ответ не объект' };
    var p = parsePair(item.pair);
    if (!p) return { why: 'пара не читается: «' + String(item.pair).slice(0, 60) + '»' };
    for (var i = 0; i < p.ins.length; i++) if (!t.els[p.ins[i]]) return { why: 'нет ингредиента «' + p.ins[i] + '»' };
    if (p.ins.length === 3 && !o.triples) return { why: 'тройное смешение ещё не открыто' };
    var kind = String(item.kind || '').trim().toLowerCase();
    if (p.check) return resolveVerdict(t, p, kind, o);
    if (o.asked && !o.asked[p.k]) return { why: 'эту пару не спрашивали: ' + p.k };
    if (item.a || item.b) {
      var named = [item.a, item.b, item.c].filter(function (x) { return !!x; }).map(compareKey).sort().join('+');
      if (named !== p.k) return { why: 'a и b не совпадают с парой' };
    }
    if (t.recipes[p.k]) return { why: 'у пары уже есть рецепт' };
    if (t.none[p.k]) return { why: 'пара уже «реакции нет»' };
    if (t.quarantine[p.k]) return { why: 'пара ждёт решения карантина' };
    if (kind === 'none') return { action: 'none', k: p.k, ins: p.ins };
    if (kind !== 'new' && kind !== 'existing') return { why: 'вид ответа «' + kind + '»' };
    var nm = normName(item.result, cfg);
    if (nm.error) return { why: nm.error };
    if (t.els[nm.key]) return existingVerdict(t, p, nm.key);
    if (kind === 'existing' && !(item.desc && item.category)) return { why: 'такого элемента нет: «' + nm.name + '»' };
    var made = elementOf(t, item, nm, p.ins, cfg, o.banned);
    if (made.error) return { why: made.error };
    var near = nearDup(t, nm.key, cfg);
    if (near) return { action: 'quarantine', k: p.k, ins: p.ins, el: made.el, like: near, how: 'почти как «' + t.els[near].name + '»' };
    if (o.similar) {
      var like = o.similar(made.el);
      if (like && t.els[like]) return { action: 'quarantine', k: p.k, ins: p.ins, el: made.el, like: like, how: 'по смыслу как «' + t.els[like].name + '»' };
    }
    return { action: 'recipe', k: p.k, ins: p.ins, r: nm.key, el: made.el };
  }

  function resolveVerdict(t, p, kind, o) {
    var q = t.quarantine[p.k];
    if (!q) return { why: 'нет такого вопроса карантина: ' + p.k };
    if (t.recipes[p.k] || t.none[p.k]) return { why: 'пара уже решена' };
    if (kind === 'same') {
      if (!t.els[q.like]) return { why: 'того элемента уже нет' };
      var v = existingVerdict(t, p, q.like);
      if (v.why) return v;
      v.action = 'resolve';
      return v;
    }
    if (kind !== 'differ') return { why: 'ответ на проверку не same и не differ: «' + kind + '»' };
    if (t.els[q.el.key]) {
      var w = existingVerdict(t, p, q.el.key);
      if (w.why) return w;
      w.action = 'resolve';
      return w;
    }
    var el = {};
    for (var k in q.el) if (has(q.el, k)) el[k] = q.el[k];
    el.tier = tierFor(t, p.ins);
    return { action: 'resolve', k: p.k, ins: p.ins, r: el.key, el: el };
  }

  function dropFrom(list, k) {
    for (var i = list.length - 1; i >= 0; i--) if (list[i] === k || (list[i] && list[i].k === k)) list.splice(i, 1);
  }

  /** Writes a verdict into the graph (graph.json's object); the tree is built again after it. */
  function applyVerdict(g, v, now, by) {
    g.elements = g.elements || [];
    g.recipes = g.recipes || [];
    g.none = g.none || [];
    g.quarantine = g.quarantine || [];
    g.queue = g.queue || [];
    if (v.action === 'none') {
      g.none.push(v.k);
    } else if (v.action === 'quarantine') {
      g.quarantine.push({ k: v.k, ins: v.ins, el: v.el, like: v.like, how: v.how, at: now });
    } else if (v.action === 'recipe' || v.action === 'resolve') {
      if (v.action === 'resolve') dropFrom(g.quarantine, v.k);
      if (v.el) {
        var e = {};
        for (var k in v.el) if (has(v.el, k)) e[k] = v.el[k];
        e.at = now;
        e.src = 'model';
        g.elements.push(e);
      }
      g.recipes.push({ k: v.k, r: v.r, at: now, by: by || 'stock' });
    }
    if (v.action !== 'quarantine') dropFrom(g.queue, v.k);
    g.version = (g.version || 0) + 1;
    return g;
  }

  /**
   * The check of the whole tree (after every batch, and by the agent): unique keys, ingredients
   * exist, at most one recipe a pair, acyclic, everything reachable from the elements, tiers by
   * the formula; the near duplicates as a report. {ok, problems, near, counts}.
   */
  function checkTree(c, g, cfg) {
    c = c || CONTENT;
    var problems = [];
    var els = {};
    var order = [];
    function addEl(e, src) {
      if (!e || !e.key) {
        problems.push('элемент без ключа (' + src + ')');
        return;
      }
      if (els[e.key]) {
        problems.push('ключ дважды: ' + e.key);
        return;
      }
      if (e.key !== compareKey(e.name)) problems.push('ключ не по имени: ' + e.key + ' / ' + e.name);
      els[e.key] = e;
      order.push(e.key);
    }
    (c.elements || []).forEach(function (e) { addEl(e, 'набор'); });
    ((g && g.elements) || []).forEach(function (e) { addEl(e, 'модель'); });
    var recipes = [];
    (c.recipes || []).forEach(function (r) { recipes.push({ ins: [r.a, r.b], r: r.r, src: 'набор' }); });
    (c.triples || []).forEach(function (r) { recipes.push({ ins: r.parts, r: r.r, src: 'тройка' }); });
    ((g && g.recipes) || []).forEach(function (r) { recipes.push({ ins: String(r.k).split('+'), r: r.r, src: 'модель' }); });
    var pairs = {};
    var first = {};
    var edges = {};
    recipes.forEach(function (r) {
      var k = keyOf(r.ins);
      if (pairs[k]) problems.push('у пары два рецепта: ' + k);
      pairs[k] = true;
      r.ins.forEach(function (x) { if (!els[x]) problems.push('нет ингредиента ' + x + ' в ' + k); });
      if (!els[r.r]) problems.push('нет результата ' + r.r + ' у ' + k);
      if (els[r.r] && els[r.r].tier === 0) problems.push('стихия как результат: ' + k + ' = ' + r.r);
      if (!first[r.r]) first[r.r] = r;
      r.ins.forEach(function (x) { (edges[x] = edges[x] || []).push(r.r); });
    });
    ((g && g.none) || []).forEach(function (k) { if (pairs[k]) problems.push('пара и рецепт, и «нет»: ' + k); });
    // Acyclic: depth-first search with colours.
    var color = {};
    var cyclic = false;
    function visit(x, depth) {
      if (cyclic || depth > 5000) return;
      color[x] = 1;
      (edges[x] || []).forEach(function (y) {
        if (color[y] === 1) {
          cyclic = true;
          problems.push('цикл через ' + y);
        } else if (!color[y]) visit(y, depth + 1);
      });
      color[x] = 2;
    }
    order.forEach(function (x) { if (!color[x]) visit(x, 0); });
    // Reachable from the elements of tier 0.
    var reach = {};
    order.forEach(function (x) { if (els[x].tier === 0) reach[x] = true; });
    var grew = true;
    while (grew) {
      grew = false;
      recipes.forEach(function (r) {
        if (reach[r.r]) return;
        for (var i = 0; i < r.ins.length; i++) if (!reach[r.ins[i]]) return;
        reach[r.r] = true;
        grew = true;
      });
    }
    order.forEach(function (x) {
      if (!reach[x]) problems.push('недостижим: ' + x);
      var e = els[x];
      if (e.tier === 0) return;
      var f = first[x];
      if (!f) {
        problems.push('нет рецепта у ' + x);
        return;
      }
      var top = 0;
      f.ins.forEach(function (y) { if (els[y] && els[y].tier > top) top = els[y].tier; });
      if (e.tier !== top + 1) problems.push('ступень ' + x + ': ' + e.tier + ', по формуле ' + (top + 1));
    });
    // Near duplicates: a report, not an error.
    var near = [];
    var stems = {};
    var byLen = {};
    order.forEach(function (x) {
      var s = stem(x);
      if (stems[s]) near.push([stems[s], x, 'окончания']);
      else stems[s] = x;
      (byLen[x.length] = byLen[x.length] || []).push(x);
    });
    var minLen = opt(cfg, 'near.minLen');
    order.forEach(function (x) {
      if (x.length < minLen) return;
      [x.length, x.length + 1].forEach(function (len) {
        (byLen[len] || []).forEach(function (y) {
          if (y <= x && len === x.length) return;
          if (y.length >= minLen && levenshtein(x, y) <= opt(cfg, 'near.distance')) near.push([x, y, 'одна буква']);
        });
      });
    });
    return {
      ok: !problems.length, problems: problems, near: near,
      counts: { elements: order.length, recipes: recipes.length, none: ((g && g.none) || []).length, model: ((g && g.recipes) || []).length }
    };
  }

  /**
   * The pairs for the next request (batch.size), in the order of the spec: the queue the owner
   * tried, pairs with the recent elements, pairs of the elements with the fewest recipes, random
   * pairs of the opened. seen: {book: [keys], recent: [keys], queue: [pair keys], triple}.
   */
  function choosePairs(t, seen, o) {
    o = o || {};
    var size = o.size || opt(o.config, 'batch.size');
    var rng = o.rng || Rng.make(Rng.hash('pairs:' + t.version));
    var out = [];
    var used = {};
    var book = (seen.book || []).filter(function (k) { return !!t.els[k]; });
    function take(k) {
      if (out.length >= size || used[k] || t.recipes[k] || t.none[k] || t.quarantine[k]) return false;
      var parts = k.split('+');
      for (var i = 0; i < parts.length; i++) if (!t.els[parts[i]]) return false;
      if (parts.length === 3 && !seen.triple) return false;
      used[k] = true;
      out.push(k);
      return true;
    }
    (seen.queue || []).forEach(take);
    if (!book.length) return out;
    var recent = (seen.recent || []).filter(function (k) { return !!t.els[k]; }).slice(-opt(o.config, 'pool.recent')).reverse();
    var tries;
    var share = Math.floor(size * 0.5);
    recent.forEach(function (e) {
      tries = 0;
      var got = 0;
      while (got < 2 && tries++ < 20 && out.length < share) {
        if (take(keyOf([e, book[rng.int(book.length)]]))) got++;
      }
    });
    var lonely = book.slice().sort(function (a, b) { return (t.uses[a] || []).length - (t.uses[b] || []).length || (a < b ? -1 : 1); });
    var edge = Math.floor(size * 0.8);
    lonely.forEach(function (e) {
      tries = 0;
      while (tries++ < 8 && out.length < edge) {
        if (take(keyOf([e, book[rng.int(book.length)]]))) break;
      }
    });
    if (seen.triple && book.length >= 3) {
      var triples = Math.max(1, Math.round(size * opt(o.config, 'triple.share')));
      tries = 0;
      var n = 0;
      while (n < triples && tries++ < 200 && out.length < size) {
        if (take(keyOf([book[rng.int(book.length)], book[rng.int(book.length)], book[rng.int(book.length)]]))) n++;
      }
    }
    tries = 0;
    while (out.length < size && tries++ < size * 50) take(keyOf([book[rng.int(book.length)], book[rng.int(book.length)]]));
    return out;
  }

  var SCHEMA = {
    key: 'pair',
    fields: {
      pair: { type: 'string', min: 3, max: 120 },
      kind: { type: 'string', oneOf: ['new', 'existing', 'none', 'same', 'differ'] },
      result: { type: 'string', max: 40, required: false },
      desc: { type: 'string', max: 200, required: false },
      category: { type: 'string', max: 20, required: false },
      glyph: { type: 'string', max: 20, required: false },
      colors: { type: 'array', max: 2, required: false },
      // The model draws the icon itself (GameArt.clean checks it); the glyph stays the fallback.
      svg: {
        type: 'svg', size: 64, max: 3000, shapes: 24, required: false,
        palette: ((CONTENT && CONTENT.palette) || []).map(function (p) { return String(p.hex || p).toLowerCase(); }),
        style: 'линейная пиктограмма, как значки рядом (капля, пламя, кристалл): только контуры, fill="none", ' +
          'stroke-width 3–4, stroke-linecap и stroke-linejoin round, один-два цвета палитры; без фона и рамки — рамку рисует игра; ' +
          'предмет занимает середину, примерно 44 на 44, его можно узнать без подписи'
      }
    }
  };

  /** GameArt where it is: the engine and node require it, a screen has window.GameArt. */
  function artLib() {
    if (engineRequire) {
      try {
        return engineRequire('../engine/art.js');
      } catch (ignored) { /* an old engine without pictures */ }
    }
    return typeof window !== 'undefined' && window.GameArt ? window.GameArt : null;
  }

  /** The model's icon, cleaned again by the same rules; null when there is none or it fails. */
  function iconOf(svg) {
    if (typeof svg !== 'string' || !svg) return null;
    var art = artLib();
    if (!art) return null;
    var f = SCHEMA.fields.svg;
    var r = art.clean(svg, { size: f.size, palette: f.palette.length ? f.palette : null, max: f.max, shapes: f.shapes });
    return r.svg || null;
  }

  function describe(t, k) {
    var e = t.els[k];
    return e ? e.name + ' (' + e.desc + ')' : k;
  }

  /**
   * The text of prompts/pairs.md: the rules, the pairs with both descriptions, the quarantine
   * questions, the names of all elements and the schema the engine checks the answers by.
   */
  function buildPrompt(t, pairs, quarantine, cfg, rules) {
    var lines = [];
    lines.push(String(rules || '').trim());
    lines.push('');
    lines.push('Ответь на первые {count} пунктов списка ниже — по одному объекту на пункт, в том же порядке.');
    lines.push('Доля ответов «none» — около ' + Math.round(opt(cfg, 'reaction.noneShare') * 100) + ' %. Новых элементов во всём ответе — не больше ' + opt(cfg, 'batch.maxNew') + '.');
    lines.push('');
    lines.push('Категории: ' + t.catList.join(', ') + '.');
    lines.push('Глифы: ' + t.glyphList.join(', ') + '.');
    var pal = [];
    var palette = (CONTENT && CONTENT.palette) || [];
    palette.forEach(function (p, i) { pal.push(i + ' — ' + (p.name || p.hex || p)); });
    lines.push('Цвета палитры (номер — цвет): ' + pal.join('; ') + '.');
    lines.push('');
    var n = 0;
    if (quarantine && quarantine.length) {
      lines.push('Сначала проверки — одно ли это и то же (kind "same" или "differ"):');
      quarantine.forEach(function (q) {
        n++;
        var like = t.els[q.like];
        lines.push(n + '. «проверка ' + q.k + '»: новое «' + q.el.name + '» (' + q.el.desc + ') и уже есть «' + (like ? like.name : q.like) + '» (' + (like ? like.desc : '') + ').');
      });
      lines.push('');
    }
    lines.push('Пары (поле pair — ровно как в кавычках):');
    pairs.forEach(function (k) {
      n++;
      var parts = k.split('+');
      lines.push(n + '. «' + k + '» — ' + parts.map(function (x) { return describe(t, x); }).join(' + '));
    });
    lines.push('');
    lines.push('Все элементы дерева: ' + t.list.map(function (e) { return e.name; }).join(', ') + '.');
    lines.push('');
    lines.push('```schema');
    // Without icons (art.askIcons off) the model is not asked to draw: the answers are shorter.
    var sch = SCHEMA;
    if (cfg && cfg['art.askIcons'] === false) {
      sch = { key: SCHEMA.key, fields: {} };
      for (var f in SCHEMA.fields) if (has(SCHEMA.fields, f) && f !== 'svg') sch.fields[f] = SCHEMA.fields[f];
    }
    lines.push(JSON.stringify(sch));
    lines.push('```');
    return lines.join('\n') + '\n';
  }

  /**
   * The owner's veto of a model recipe: the pair becomes «no reaction»; the element goes when it
   * has no other recipe, with its unopened recipes and what only they made. Refused when the
   * element has opened descendants. {ok, k, r, keep, els: [keys], recipes: [keys]} or {ok: false, why}.
   */
  function vetoPlan(t, k, opened) {
    opened = opened || {};
    var rec = t.recipes[k];
    if (!rec) return { ok: false, why: 'такого рецепта нет' };
    if (rec.src !== 'model') return { ok: false, why: 'рецепты ручного набора не убираются' };
    var others = (t.producers[rec.r] || []).filter(function (x) { return x.k !== k; });
    if (others.length) return { ok: true, k: k, r: rec.r, keep: true, els: [], recipes: [k] };
    var gone = {};
    var goneRecipes = {};
    goneRecipes[k] = true;
    var bad = null;
    function remove(key) {
      if (gone[key] || bad) return;
      var e = t.els[key];
      if (!e || e.src !== 'model') {
        bad = 'элемент «' + (e ? e.name : key) + '» из ручного набора';
        return;
      }
      gone[key] = true;
      (t.uses[key] || []).forEach(function (u) {
        if (opened[u.k]) {
          bad = 'у элемента есть открытые потомки (' + u.k + ')';
          return;
        }
        goneRecipes[u.k] = true;
      });
      if (bad) return;
      (t.uses[key] || []).forEach(function (u) {
        var left = (t.producers[u.r] || []).filter(function (x) { return !goneRecipes[x.k]; });
        if (!left.length) remove(u.r);
      });
    }
    remove(rec.r);
    if (bad) return { ok: false, why: bad };
    return { ok: true, k: k, r: rec.r, keep: false, els: Object.keys(gone), recipes: Object.keys(goneRecipes) };
  }

  function applyVeto(g, plan, now) {
    var gone = {};
    plan.els.forEach(function (x) { gone[x] = true; });
    var rec = {};
    plan.recipes.forEach(function (x) { rec[x] = true; });
    g.recipes = (g.recipes || []).filter(function (r) { return !rec[r.k]; });
    g.elements = (g.elements || []).filter(function (e) { return !gone[e.key]; });
    g.quarantine = (g.quarantine || []).filter(function (q) {
      if (gone[q.like]) return false;
      for (var i = 0; i < q.ins.length; i++) if (gone[q.ins[i]]) return false;
      return true;
    });
    g.none = (g.none || []).filter(function (k) {
      var parts = k.split('+');
      for (var i = 0; i < parts.length; i++) if (gone[parts[i]]) return false;
      return true;
    });
    if (g.none.indexOf(plan.k) < 0) g.none.push(plan.k);
    g.vetoed = g.vetoed || [];
    g.vetoed.push({ k: plan.k, r: plan.r, els: plan.els, at: now });
    g.version = (g.version || 0) + 1;
    return g;
  }

  /** The screen's part of a veto: what is gone leaves the book, the store, the cubes. */
  function forgetVetoed(state, plan) {
    var gone = {};
    plan.els.forEach(function (x) { gone[x] = true; });
    plan.recipes.forEach(function (k) { delete state.meta.opened[k]; });
    plan.els.forEach(function (x) {
      if (state.meta.book[x]) {
        delete state.meta.book[x];
        state.meta.bookN = Math.max(0, (state.meta.bookN || 0) - 1);
      }
      delete state.run.store[x];
    });
    state.meta.recent = state.meta.recent.filter(function (x) { return !gone[x]; });
    state.run.cubes.forEach(function (c) { if (c.k && plan.recipes.indexOf(c.k) >= 0) c.k = null; });
    Object.keys(state.meta.asked).forEach(function (k) {
      var parts = k.split('+');
      for (var i = 0; i < parts.length; i++) if (gone[parts[i]]) delete state.meta.asked[k];
    });
  }

  /** What the screen sends to graph.js: what the owner has and tried. */
  function seenOf(state) {
    return {
      book: Object.keys(state.meta.book), recent: state.meta.recent.slice(), opened: Object.keys(state.meta.opened),
      queue: Object.keys(state.meta.asked), unlocks: state.meta.unlocks || {}, triple: unlocked(state, 'triple')
    };
  }

  // ---- the bot of the checks: plays as a person would, a reaction every few seconds -------------------

  var BOT = { mixSec: 2.5, findSec: 3, findPerTier: 1, findK: 0.75, findPow: 1.5, sellAt: 0.92, sellTo: 0.5, cubesEverySec: 120, shopEverySec: 120 };

  function botOpt(o, k) { return o && o[k] !== undefined ? o[k] : BOT[k]; }

  /** The cheapest way to make a key from the shelf now: the recipe to mix next, or null (wait). */
  function stepTo(state, key, need, depth) {
    if (have(state, key) + 1e-9 >= need) return 'ok';
    if (depth > 14) return null;
    var t = tree();
    var list = (t.producers[key] || []).filter(function (r) { return state.meta.opened[r.k] && recipeUsable(state, r); });
    if (!list.length) return null;
    list.sort(function (a, b) { return costOf2(t, a) - costOf2(t, b); });
    return stepFor(state, list[0], depth + 1);
  }

  function stepFor(state, rec, depth) {
    var n = countOf(rec.ins);
    for (var k in n) {
      if (!has(n, k)) continue;
      var s = stepTo(state, k, n[k], depth);
      if (s === null) return null;
      if (s !== 'ok') return s;
    }
    return rec;
  }

  function costOfKey(t, key) {
    t.cost = t.cost || {};
    if (t.cost[key] !== undefined) return t.cost[key];
    var e = t.els[key];
    if (!e || e.tier === 0) {
      t.cost[key] = 1;
      return 1;
    }
    t.cost[key] = 1e9;
    var best = 1e9;
    (t.producers[key] || []).forEach(function (r) { best = Math.min(best, costOf2(t, r)); });
    t.cost[key] = best;
    return best;
  }

  function costOf2(t, rec) {
    var sum = 0;
    rec.ins.forEach(function (x) { sum += costOfKey(t, x); });
    return sum;
  }

  function botTarget(state) {
    var t = tree();
    var list = frontier(state, t).filter(function (rec) { return !inBook(state, rec.r); });
    if (!list.length) return null;
    list.sort(function (a, b) { return costOf2(t, a) - costOf2(t, b) || (a.k < b.k ? -1 : 1); });
    return list[0];
  }

  function botCubes(state, cfg, now) {
    var t = tree();
    var made = {};
    SOURCES.forEach(function (s) { if (sourceLevel(state, s)) made[s.el] = true; });
    var chosen = [];
    var gainOf = function (rec) {
      var v = value(state, cfg, rec.r);
      var cost = 0;
      rec.ins.forEach(function (x) { cost += value(state, cfg, x); });
      return v - cost;
    };
    state.run.cubes.forEach(function (c) {
      var best = null;
      var bestGain = -1;
      for (var k in state.meta.opened) {
        if (!has(state.meta.opened, k) || !t.recipes[k]) continue;
        var rec = t.recipes[k];
        if (chosen.indexOf(k) >= 0) continue;
        var ok = true;
        for (var i = 0; i < rec.ins.length; i++) if (!made[rec.ins[i]]) ok = false;
        if (!ok) continue;
        var g = gainOf(rec);
        if (g > bestGain) {
          bestGain = g;
          best = rec;
        }
      }
      if (best) {
        if (c.k !== best.k) {
          c.k = best.k;
          c.p = 0;
        }
        chosen.push(best.k);
        made[best.r] = true;
      }
    });
  }

  var BOT_WEIGHT = {
    fire: 1, water: 1, earth: 1, air: 1, ether: 1.2, void: 1.2, shop: 1.4, clerk: 0.5, shelves: 2.5, cubes: 1.2, coil: 2.2,
    mortar: 1, retort: 1.6, apprentice: 3, athanor: 1.5, seal: 2.5, crucible: 3, glass: 4, catalog: 6, sieve: 5, loupe: 8, scroll: 8, pointer: 10
  };

  function botBuy(state, cfg) {
    var bought = 0;
    for (var guard = 0; guard < 40; guard++) {
      var best = null;
      var bestScore = Infinity;
      UPGRADES.forEach(function (u) {
        if (!available(state, u)) return;
        var c = costOf(state, cfg, u.id);
        if (!c) return;
        var score = Big.toNumber(c) * (BOT_WEIGHT[u.id] || 5);
        if (score < bestScore) {
          bestScore = score;
          best = u.id;
        }
      });
      if (!best || !buy(state, cfg, best)) break;
      bought++;
    }
    return bought;
  }

  /**
   * One second of the bot (the checks' `play`): a reaction every mixSec, finding a new pair takes
   * findSec + findPerTier × tier + findK × book^findPow (more elements, more pairs to try), then it sells what fills up, hands in orders, keeps the cubes on
   * the best recipes and buys the cheapest useful upgrade. Returns how many upgrades it bought.
   */
  function bot(state, ctx, o) {
    var cfg = ctx.config;
    var now = ctx.now;
    var run = state.run;
    var m = run.bot || (run.bot = { busy: 0, target: null, found: false, cubesAt: 0, misses: 0 });
    m.busy -= 1;
    var guard = 0;
    while (m.busy <= 0 && guard++ < 10) {
      var rec = m.target ? tree().recipes[m.target] : null;
      if (!rec || inBook(state, rec.r)) {
        rec = botTarget(state);
        m.target = rec ? rec.k : null;
        m.found = false;
        if (!rec) break;
      }
      if (!m.found) {
        m.found = true;
        m.busy += botOpt(o, 'findSec') + botOpt(o, 'findPerTier') * tree().els[rec.r].tier + botOpt(o, 'findK') * Math.pow(state.meta.bookN || 0, botOpt(o, 'findPow'));
        // The misses of a person looking for a pair: unknown pairs go to the queue.
        var book = Object.keys(state.meta.book);
        var miss = keyOf([book[(m.misses * 7) % book.length], book[(m.misses * 13 + 3) % book.length]]);
        m.misses++;
        if (pairState(miss) === 'unknown') ask(state, cfg, miss, now);
        continue;
      }
      var step = stepFor(state, rec, 0);
      if (!step) {
        m.busy = 0;
        break;
      }
      mix(state, cfg, step.ins, { now: now, mult: ctx.mult });
      m.busy += botOpt(o, 'mixSec');
    }
    var cap = capOf(state, cfg);
    if (!lv(state, 'clerk')) {
      for (var k in run.store) {
        if (has(run.store, k) && run.store[k] >= cap * botOpt(o, 'sellAt')) sell(state, cfg, k, run.store[k] - cap * botOpt(o, 'sellTo'), ctx.mult, now);
      }
    }
    run.orders.forEach(function (x, i) { if (x.k) deliver(state, cfg, i, ctx.mult, now); });
    if (run.event && run.event.id === 'fire' && run.event.until === 0) {
      for (var f = 0; f < cfg['fire.taps']; f++) tapFire(state, run.event.cube);
    }
    if (now - m.cubesAt >= botOpt(o, 'cubesEverySec') * 1000 || m.cubeN !== run.cubes.length) {
      m.cubesAt = now;
      m.cubeN = run.cubes.length;
      botCubes(state, cfg, now);
    }
    // A person looks at the upgrades now and then, not every second.
    if (m.shopAt && now - m.shopAt < botOpt(o, 'shopEverySec') * 1000) return 0;
    m.shopAt = now;
    return botBuy(state, cfg);
  }

  return {
    // the engine's
    init: init, tick: tick, offline: offline, prestigeGain: prestigeGain, bonus: bonus, onPrestige: onPrestige,
    migrate: migrate, validate: validate, summary: summary, next: next, chest: chest, procedural: procedural,
    validateStock: validateStock, capBonusHours: capBonusHours,
    // the tree
    setContent: setContent, setGraph: setGraph, tree: tree, buildTree: buildTree, content: content, graph: graph,
    compareKey: compareKey, keyOf: keyOf, pairState: pairState, parsePair: parsePair,
    stem: stem, levenshtein: levenshtein, normName: normName, nearDup: nearDup, isAncestor: isAncestor, bannedHit: bannedHit,
    validateAnswer: validateAnswer, applyVerdict: applyVerdict, checkTree: checkTree, choosePairs: choosePairs,
    buildPrompt: buildPrompt, SCHEMA: SCHEMA, vetoPlan: vetoPlan, applyVeto: applyVeto, forgetVetoed: forgetVetoed, seenOf: seenOf,
    // the screen's
    mix: mix, sell: sell, buy: buy, deliver: deliver, setCube: setCube, tapFire: tapFire, transmute: transmute,
    useHint: useHint, useLoupe: useLoupe, hintPick: hintPick, frontier: frontier, stockCount: stockCount, stockOf: stockOf,
    highlights: highlights, upgradeList: upgradeList, costOf: costOf, capOf: capOf, value: value, sellPrice: sellPrice,
    incomeRate: incomeRate, sourceRate: sourceRate, power: power, cubePeriod: cubePeriod, orderReward: orderReward,
    orderSlots: orderSlots, unlocked: unlocked, unlocksOf: unlocksOf, stones: stones, tinctures: tinctures, discover: discover,
    eventOn: eventOn, have: have, lv: lv, bot: bot,
    SOURCES: SOURCES, UPGRADES: UPGRADES, UNLOCKS: UNLOCKS, EVENTS: EVENTS, STONE: STONE, TINCT: TINCT
  };

  /**
   * The engine checks each answer of the model with this before it enters stock.json. In the
   * engine graph.js does the whole check and moves the answer into graph.json at once (the
   * next request already sees it); elsewhere only what needs no graph is checked.
   */
  function validateStock(kind, item) {
    if (kind !== 'pairs') return null;
    if (engineRequire) {
      var g = null;
      try {
        g = engineRequire('./graph.js');
      } catch (error) {
        g = null;
      }
      if (g && typeof g.accept === 'function') return g.accept(item);
    }
    var v = validateAnswer(tree(), item, { banned: CONTENT ? CONTENT.banned : [], triples: true });
    return v.why || null;
  }
});
