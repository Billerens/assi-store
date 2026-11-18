// The engine side of «Алхимик»: the part of the recipe tree the model writes. The engine's
// content stock (stock.js, kind «pairs») asks the model; every answer goes through
// sim.validateStock → accept() here: the nine checks of the spec, and an accepted answer moves
// into data/games/alchemist/graph.json at once, so the next request already sees it. The screen
// calls sync() (what the owner has and tried), veto() (the owner removes a model's recipe) and
// graph(); the agent calls check() and journal().
//   axiko.call('modules/games/alchemist/graph.js', 'sync', seen)
var axiko = require('lib/axiko');
var Core = require('../engine/core.js');
var Rng = require('../engine/rng.js');
var sim = require('./sim.js');

var ID = 'alchemist';
var DIR = 'modules/games/alchemist';
var GRAPH = 'data/games/alchemist/graph.json';
var VECTORS = 'data/games/alchemist/vectors.json';
var STOCK = 'data/games/alchemist/stock.json';
var PROMPT = DIR + '/prompts/pairs.md';
var RULES = DIR + '/prompts/pairs-rules.md';
var DAY = 86400000;

var LOCK = typeof java !== 'undefined' ? new java.util.concurrent.locks.ReentrantLock() : null;

function locked(fn) {
  if (!LOCK) return fn();
  LOCK.lock();
  try {
    return fn();
  } finally {
    LOCK.unlock();
  }
}

function readJson(path, fallback) {
  try {
    if (!axiko.files.exists(path)) return fallback;
    var text = String(axiko.files.read(path));
    return text.trim() ? JSON.parse(text) : fallback;
  } catch (error) {
    return fallback;
  }
}

function writeJson(path, value) { axiko.files.write(path, JSON.stringify(value)); }

function now() { return Date.now(); }

function main() {
  try {
    return require('modules/games/main.js');
  } catch (error) {
    return null;
  }
}

/** A line in the game's journal (data/games/alchemist/log.json): the agent reads it. */
function log(text) {
  var m = main();
  if (!m) return;
  try {
    m.log(ID, text);
  } catch (ignored) { /* no journal */ }
}

function gameJson() {
  var g = readJson(DIR + '/game.json', {});
  g.id = ID;
  g.stock = g.stock || [];
  g.prestige = g.prestige || [];
  g.currencies = g.currencies || [];
  return g;
}

/** The game's settings with the owner's; the defaults of config.json without the hub. */
function config() {
  var m = main();
  if (m) {
    try {
      return m.settings(ID).values;
    } catch (ignored) { /* below */ }
  }
  return Core.config(Core.schema(readJson(DIR + '/config.json', {}), gameJson()), {}, null);
}

function hubConfig() {
  var m = main();
  if (m) {
    try {
      return m.settings(null).values;
    } catch (ignored) { /* below */ }
  }
  return Core.config(Core.schema({}, null), {}, null);
}

function empty() {
  return {
    version: 0, elements: [], recipes: [], none: [], quarantine: [], vetoed: [], queue: [], asking: [], asked: [],
    seen: { book: [], recent: [], opened: [], unlocks: {}, triple: false, at: 0 },
    batch: { at: 0, total: 0, fresh: 0, none: 0, deferred: 0, rejected: 0 },
    stats: { accepted: 0, none: 0, quarantined: 0, deferred: 0, resolved: 0, vetoed: 0 },
    embed: null, fillAt: 0, localAt: 0
  };
}

function load() {
  var g = readJson(GRAPH, null);
  var e = empty();
  if (!g || typeof g !== 'object') return e;
  for (var k in e) if (g[k] === undefined) g[k] = e[k];
  return g;
}

function save(g) {
  writeJson(GRAPH, g);
  sim.setGraph(g);
}

function treeOf(g) {
  sim.setGraph(g);
  return sim.tree();
}

/** The pairs of the request text in prompts/pairs.md (the shipped one too, before any sync). */
function promptPairs() {
  var out = [];
  var text = '';
  try {
    text = String(axiko.files.read(PROMPT));
  } catch (error) {
    return out;
  }
  var re = /^\d+\. «([^»]+)»/gm;
  var m;
  while ((m = re.exec(text))) if (!/^проверка /.test(m[1])) out.push(m[1]);
  return out;
}

function seenObj(list) {
  var out = {};
  (list || []).forEach(function (k) { out[k] = true; });
  return out;
}

// ---- the request: which pairs, the text of prompts/pairs.md ----------------------------------------

function rules() {
  try {
    return String(axiko.files.read(RULES));
  } catch (error) {
    return '';
  }
}

/** Builds the next request into prompts/pairs.md (stock.js reads it there) and remembers its pairs. */
function writePrompt(g, t, cfg) {
  var decided = function (k) { return !!(t.recipes[k] || t.none[k] || t.quarantine[k]); };
  g.queue = g.queue.filter(function (k) { return !decided(k); });
  var rng = Rng.make(Rng.hash('alchemist:' + g.version + ':' + (g.seen.book || []).length + ':' + g.queue.length));
  // Before the first sync (a fresh install) the request is about the first hours of the base set.
  var book = g.seen.book && g.seen.book.length ? g.seen.book : t.list.filter(function (e) { return e.src === 'base' && e.tier <= cfg['prompt.defaultTier']; }).map(function (e) { return e.key; });
  var pairs = sim.choosePairs(t, { book: book, recent: g.seen.recent, queue: g.queue, triple: !!g.seen.triple }, { config: cfg, rng: rng });
  // A small Book (the four elements of a new game) has every pair decided already: an empty list
  // would make the model invent pairs of its own. Then the request looks ahead — first the base
  // set up to prompt.defaultTier, then the whole tree — so the stock is ready when the player is.
  var wide = [
    t.list.filter(function (e) { return e.src === 'base' && e.tier <= cfg['prompt.defaultTier']; }).map(function (e) { return e.key; }),
    t.list.map(function (e) { return e.key; })
  ];
  for (var w = 0; w < wide.length && pairs.length < Math.floor(cfg['batch.size'] / 2); w++) {
    var more = seenObj(book);
    var ahead = book.concat(wide[w].filter(function (k) { return !more[k]; }));
    var extra = sim.choosePairs(t, { book: ahead, recent: g.seen.recent, queue: g.queue, triple: !!g.seen.triple }, { config: cfg, rng: rng });
    var have = seenObj(pairs);
    extra.forEach(function (k) { if (!have[k] && pairs.length < cfg['batch.size']) pairs.push(k); });
  }
  var q = g.quarantine.slice(0, cfg['quarantine.perRequest']);
  g.asking = pairs.slice();
  // The pairs of the last requests: an answer to an older text (read before it was rewritten) still counts.
  var known = seenObj(g.asked);
  pairs.forEach(function (k) { if (!known[k]) g.asked.push(k); });
  if (g.asked.length > 1000) g.asked = g.asked.slice(g.asked.length - 1000);
  var text = sim.buildPrompt(t, pairs, q, cfg, rules());
  try {
    axiko.files.write(PROMPT, text);
  } catch (error) {
    log('Запрос модели не записан: ' + error);
  }
  return { pairs: pairs.length, quarantine: q.length };
}

// ---- the stock file of the engine: what is in the stock --------------------------------------------

/**
 * stock.json keeps every answer; the engine counts the unused ones. An answer is the stock while
 * its recipe is in the tree and not opened; «no reaction», quarantine and the opened are used.
 * The unused are kept fresh (the engine drops unused items after stock.expireDays).
 */
function housekeeping(g, t) {
  var opened = seenObj(g.seen.opened);
  var at = now();
  var changed = 0;
  locked(function () {
    var list = readJson(STOCK, null);
    if (!Array.isArray(list)) return;
    list.forEach(function (s) {
      if (!s || s.kind !== 'pairs' || s.usedAt) return;
      var it = s.item || {};
      var k = it.key;
      var live = k && (it.status === 'new' || it.status === 'existing' || it.status === 'same' || it.status === 'differ') && t.recipes[k] && !opened[k];
      if (!live) {
        s.usedAt = at;
        changed++;
      } else if ((s.createdAt || 0) < at - 10 * DAY) {
        s.createdAt = at;
        changed++;
      }
    });
    if (changed) writeJson(STOCK, list);
  });
  return changed;
}

/** A batch ends: a note in the journal when its share of «no reaction» is off. */
function closeBatch(g, cfg) {
  var b = g.batch;
  if (b.total >= 5) {
    var share = b.none / b.total;
    if (share < cfg['reaction.noneMin'] || share > cfg['reaction.noneMax']) {
      log('Пачка из ' + b.total + ' ответов: доля «реакции нет» ' + Math.round(share * 100) + ' % — вне ' +
        Math.round(cfg['reaction.noneMin'] * 100) + '–' + Math.round(cfg['reaction.noneMax'] * 100) + ' %, запрос стоит подстроить');
    }
    log('Пачка: принято ' + (b.total - b.rejected - b.deferred) + ' из ' + b.total + ', новых элементов ' + b.fresh + ', «нет» ' + b.none +
      (b.deferred ? ', отложено сверх лимита ' + b.deferred : '') + (b.rejected ? ', отвергнуто ' + b.rejected : ''));
  }
  g.batch = { at: 0, total: 0, fresh: 0, none: 0, deferred: 0, rejected: 0 };
}

// ---- step 5: duplicates by meaning, when Axiko has a model for embeddings ---------------------------

function cosine(a, b) {
  var dot = 0;
  var na = 0;
  var nb = 0;
  for (var i = 0; i < a.length && i < b.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

function plain(v) {
  var out = [];
  if (!v) return out;
  for (var i = 0; i < v.length; i++) out.push(Number(v[i]));
  return out;
}

function textOf(e) { return e.name + ': ' + (e.desc || ''); }

/** The existing element the new one means (similarity over semantic.threshold), or null. */
function similar(g, t, el, cfg) {
  if (!cfg['semantic.on']) return null;
  var vectors = readJson(VECTORS, {});
  var missing = t.list.filter(function (e) { return !vectors[e.key]; }).slice(0, 300);
  var texts = [textOf(el)].concat(missing.map(textOf));
  var out;
  try {
    out = native('models.embed', texts);
    if (!out || !out[0]) throw new Error('пустой ответ');
  } catch (error) {
    if (!g.embed) {
      g.embed = 'нет: ' + (error && error.message ? error.message : error);
      log('Проверка дублей по смыслу пропущена: в Axiko нет модели «embed» (' + g.embed + ')');
    }
    return null;
  }
  g.embed = 'да';
  for (var i = 0; i < missing.length; i++) if (out[i + 1]) vectors[missing[i].key] = plain(out[i + 1]);
  writeJson(VECTORS, vectors);
  var mine = plain(out[0]);
  var best = null;
  var score = cfg['semantic.threshold'];
  t.list.forEach(function (e) {
    var v = vectors[e.key];
    if (!v) return;
    var s = cosine(mine, v);
    if (s > score) {
      score = s;
      best = e.key;
    }
  });
  return best;
}

// ---- the answers ---------------------------------------------------------------------------------------

/**
 * One answer of the model (sim.validateStock calls it while the engine fills the stock): null
 * when it is taken (into graph.json now, the engine then keeps it in stock.json), otherwise the
 * reason it is refused (the engine writes it to the game's journal, the pair stays unknown).
 */
exports.accept = function (item) {
  var cfg = config();
  var g = load();
  var at = now();
  if (g.batch.at && at - g.batch.at > cfg['batch.gapSec'] * 1000) {
    closeBatch(g, cfg);
    housekeeping(g, treeOf(g));
  }
  g.batch.at = at;
  g.batch.total++;
  var t = treeOf(g);
  var asked = seenObj(g.asked.concat(g.asking, g.queue, promptPairs()));
  var by = item && item.by ? String(item.by) : 'stock';
  var v = sim.validateAnswer(t, item, {
    config: cfg, asked: asked, banned: (sim.content() && sim.content().banned) || [], triples: !!g.seen.triple,
    similar: function (el) { return similar(g, t, el, cfg); }
  });
  if (v.why) {
    g.batch.rejected++;
    save(g);
    return v.why;
  }
  // Step 9: at most batch.maxNew new elements a batch; the rest stays unknown till next time.
  if (v.el && v.action !== 'quarantine') {
    if (g.batch.fresh >= cfg['batch.maxNew']) {
      g.batch.deferred++;
      g.stats.deferred++;
      save(g);
      return 'в пачке уже ' + cfg['batch.maxNew'] + ' новых элементов — пара останется неизвестной до следующего запроса';
    }
    g.batch.fresh++;
  }
  if (v.action === 'none') {
    g.batch.none++;
    g.stats.none++;
  } else if (v.action === 'quarantine') {
    g.stats.quarantined++;
    log('Карантин: ' + v.k + ' = «' + v.el.name + '» — ' + v.how);
  } else if (v.action === 'resolve') {
    g.stats.resolved++;
    log('Карантин решён: ' + v.k + ' = ' + (v.el ? '«' + v.el.name + '» (новый)' : '«' + t.els[v.r].name + '» (тот же)'));
  } else {
    g.stats.accepted++;
  }
  sim.applyVerdict(g, v, at, by);
  item.key = v.k;
  if (v.r) item.r = v.r;
  item.status = v.action === 'resolve' ? (v.el ? 'differ' : 'same') : v.action === 'recipe' ? (v.el ? 'new' : 'existing') : v.action;
  var fresh = treeOf(g);
  writePrompt(g, fresh, cfg);
  save(g);
  return null;
};

// ---- the screen ------------------------------------------------------------------------------------------

function forScreen(g) {
  return {
    version: g.version, elements: g.elements, recipes: g.recipes, none: g.none, vetoed: g.vetoed,
    quarantine: g.quarantine.map(function (q) { return { k: q.k, ins: q.ins, el: q.el, like: q.like }; })
  };
}

function stats(g, t, seen) {
  var opened = seenObj(seen.opened);
  var book = seenObj(seen.book);
  var stock = 0;
  var ready = 0;
  for (var k in t.recipes) {
    if (!Object.prototype.hasOwnProperty.call(t.recipes, k)) continue;
    var rec = t.recipes[k];
    if (rec.src !== 'model' || opened[k]) continue;
    stock++;
    var all = true;
    rec.ins.forEach(function (x) { if (!book[x]) all = false; });
    if (all) ready++;
  }
  return {
    stock: stock, ready: ready, queue: g.queue.length, quarantine: g.quarantine.length, none: g.none.length,
    model: g.recipes.length, embed: g.embed, accepted: g.stats.accepted
  };
}

/** Is a request of our own worth it: the stock is short, or some opened element has too few recipes. */
function shortage(g, t, cfg) {
  var opened = seenObj(g.seen.opened);
  var stock = 0;
  for (var k in t.recipes) if (Object.prototype.hasOwnProperty.call(t.recipes, k) && t.recipes[k].src === 'model' && !opened[k]) stock++;
  if (stock < cfg['pool.target']) return 'запас ' + stock + ' из ' + cfg['pool.target'];
  var poor = null;
  (g.seen.book || []).forEach(function (key) {
    if (poor) return;
    var n = 0;
    (t.uses[key] || []).forEach(function (rec) { if (!opened[rec.k]) n++; });
    if (n < cfg['pool.minPerElement']) poor = key;
  });
  return poor ? 'мало рецептов у «' + (t.els[poor] ? t.els[poor].name : poor) + '»' : null;
}

function online() {
  try {
    return require('modules/games/links/sensors.js').online();
  } catch (error) {
    return null;
  }
}

function charging() {
  try {
    return !!context.getSystemService('batterymanager').isCharging();
  } catch (error) {
    return false;
  }
}

function later(fn) {
  if (typeof spawn === 'function') {
    spawn(function () {
      try {
        fn();
      } catch (error) {
        log('Запас рецептов: ' + error);
      }
    });
    return true;
  }
  return false;
}

/**
 * What the owner has and tried (from the screen): {book, recent, opened, queue, unlocks, triple}.
 * Keeps it for the requests, puts the tried pairs into the queue, marks the stock, writes the
 * next request, starts one when the stock is short. Returns {graph, stats, asking}.
 */
exports.sync = function (seen) {
  seen = seen || {};
  var cfg = config();
  var g = load();
  var at = now();
  g.seen = {
    book: (seen.book || []).map(String), recent: (seen.recent || []).map(String).slice(-cfg['pool.recent']),
    opened: (seen.opened || []).map(String), unlocks: seen.unlocks || {}, triple: !!seen.triple, at: at
  };
  var t = treeOf(g);
  var inQueue = seenObj(g.queue);
  (seen.queue || []).forEach(function (k) {
    k = String(k);
    if (inQueue[k] || t.recipes[k] || t.none[k]) return;
    var parts = k.split('+');
    for (var i = 0; i < parts.length; i++) if (!t.els[parts[i]]) return;
    g.queue.push(k);
    inQueue[k] = true;
  });
  if (g.queue.length > cfg['queue.max']) g.queue = g.queue.slice(g.queue.length - cfg['queue.max']);
  if (g.batch.at && at - g.batch.at > cfg['batch.gapSec'] * 1000) closeBatch(g, cfg);
  housekeeping(g, t);
  writePrompt(g, t, cfg);
  var why = shortage(g, t, cfg);
  var started = null;
  var net = online();
  if (why && net !== false && at - (g.fillAt || 0) > cfg['fill.everyMin'] * 60000) {
    g.fillAt = at;
    if (later(function () { exports.fill(false); })) started = 'сеть: ' + why;
  } else if (net === false && g.queue.length && hubConfig()['stock.local'] && charging() && at - (g.localAt || 0) > cfg['fill.everyMin'] * 60000) {
    g.localAt = at;
    if (later(function () { exports.fill(true); })) started = 'модель на телефоне';
  }
  save(g);
  return { graph: forScreen(g), stats: stats(g, t, g.seen), asking: g.asking.length, started: started };
};

/** The graph as the screen needs it before the game starts. */
exports.graph = function () { return forScreen(load()); };

/**
 * One request now through the engine's stock (the shared daily limit counts it); local — the
 * phone's model, a few pairs at a time. {added, rejected, error?}.
 */
exports.fill = function (local) {
  var m = main();
  if (!m) return { added: 0, rejected: 0, error: 'нет движка игр' };
  var cfg = config();
  var g = load();
  closeBatch(g, cfg);
  housekeeping(g, treeOf(g));
  var asking = writePrompt(g, treeOf(g), cfg);
  save(g);
  // Nothing to ask (every pair of the tree decided): no request, the daily limit is not spent.
  if (!asking.pairs && !asking.quarantine) return { added: 0, rejected: 0, error: 'нечего спрашивать: все пары решены' };
  var hubCfg = hubConfig();
  var hub = {
    readJson: readJson,
    update: function (path, fallback, fn) {
      return locked(function () {
        var value = readJson(path, fallback);
        var result = fn(value);
        writeJson(path, result === undefined ? value : result);
        return result === undefined ? value : result;
      });
    },
    now: now,
    log: function (id, text) { log(text); },
    Core: Core,
    config: function () { return hubCfg; },
    emit: function (name, value) {
      try {
        emit(name, value);
      } catch (ignored) { /* no screen */ }
    }
  };
  var game = gameJson();
  if (local) {
    game.stock = game.stock.map(function (d) {
      var c = {};
      for (var k in d) c[k] = d[k];
      if (c.kind === 'pairs') c.batch = cfg['local.batch'];
      return c;
    });
  }
  var r = require('modules/games/stock.js').fill(hub, game, 'pairs', { local: !!local });
  var after = load();
  closeBatch(after, cfg);
  housekeeping(after, treeOf(after));
  save(after);
  return r;
};

/** The owner's veto of a model's recipe (long press in the Book): the plan applied, or why not. */
exports.veto = function (k, opened) {
  var g = load();
  var t = treeOf(g);
  var plan = sim.vetoPlan(t, String(k), seenObj(opened || g.seen.opened));
  if (!plan.ok) return plan;
  sim.applyVeto(g, plan, now());
  g.stats.vetoed++;
  var name = t.els[plan.r] ? t.els[plan.r].name : plan.r;
  log('Вето владельца: ' + plan.k + ' = «' + name + '»' + (plan.els.length ? ', убрано элементов: ' + plan.els.length : ', элемент остался'));
  var fresh = treeOf(g);
  housekeeping(g, fresh);
  writePrompt(g, fresh, config());
  save(g);
  return plan;
};

/** The check of the whole tree (the spec's «Как проверить»), for the agent and checks.js. */
exports.check = function () { return sim.checkTree(sim.content(), load(), config()); };

/** The journal of the game: refusals of the engine, batches, quarantine, vetoes. */
exports.journal = function () { return readJson('data/games/alchemist/log.json', []); };
