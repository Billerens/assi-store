// The logic of «Династия»: a ruler lives, grows rich and ages; his death is the prestige — the heir
// takes a share of the treasury and the holdings, all the Lands and the traits, and the family
// tree gets one more name. Shared subset of JavaScript: it runs on the screen (window.GameSim),
// in the engine (Rhino, require) and in node. No class, no async, no f(...args), no for (let …).
//
// Every balance number is a key of config.json (cfg); texts and lists are content/*.json. In node
// and Rhino the content is required here; the screen fetches it and calls GameSim.use(content)
// before Game.start. Randomness inside tick/offline is derived from the state (run.seed and a
// counter), so the offline formula, the engine's steps and the checks give the same outcome.
(function (root, make) {
  var node = typeof require === 'function' && typeof exports !== 'undefined';
  var api = node ? make(require('../engine/big.js'), require('../engine/fmt.js'), require('../engine/rng.js'), {
    world: require('./content/world.json'), traits: require('./content/traits.json'), names: require('./content/names.json'),
    cards: require('./content/cards.json'), chronicle: require('./content/chronicle.json')
  }) : make(root.Big, root.Fmt, root.Rng, null);
  if (typeof exports !== 'undefined') { for (var k in api) exports[k] = api[k]; } else { root.GameSim = api; }
})(this, function (Big, Fmt, Rng, content) {
  'use strict';

  var GEN = 'generation';
  var EPOCH = 'epoch';
  var STATS = ['adm', 'trade', 'war', 'learn', 'health'];
  var LAW_CHAIN = ['elder', 'majorat', 'treasury', 'indivisible'];
  var RARE = ['lefthanded', 'giant', 'longlived', 'stargazer'];
  var GOOD = ['wise', 'learned', 'brave', 'diligent', 'honest', 'sturdy', 'kind', 'builder', 'eloquent', 'bookish', 'tireless'];
  var FACTS = ['reign', 'marriage', 'child', 'campaignWin', 'campaignLoss', 'lands', 'tier8', 'card', 'death', 'abdication'];
  var SLOTS = ['имя', 'прозвище', 'супруг', 'ребёнок', 'возраст', 'земли', 'годы', 'наследник', 'эпоха', 'владение'];
  var STOCK_EFFECTS = ['alliance', 'war1', 'granary', 'nothing', 'fair', 'scholar', 'treasure', 'temple', 'gift', 'blueprint', 'chronicler',
    'bandits', 'comet', 'harvest', 'goldSmall', 'goldLoss', 'deed', 'learn1', 'adm1', 'trade1', 'health1'];
  var COLORS = ['#A8443A', '#3E5F8A', '#4F7A4A', '#6B4E7A', '#2E2E2E', '#C9A646', '#B9BDC2', '#8A5A3C'];
  var DIVS = ['plain', 'pale', 'fess', 'bend', 'quarter', 'chief'];
  var CHARGES = ['bar', 'chevron', 'cross', 'circle', 'saltire', 'pale', 'circles', 'lozenge'];
  var ADDS = ['bordure', 'label', 'star', 'canton', 'base', 'ring'];

  var C = content;
  var TRAITS = null;
  var MILESTONES = { text: null, list: [] };

  /** The screen gives the content it fetched: {world, traits, names, cards, chronicle}. */
  function use(data) {
    C = data;
    TRAITS = null;
  }

  // ---- small helpers --------------------------------------------------------------------------------

  function n(x, d) {
    var v = Number(x);
    return v === v && v !== Infinity && v !== -Infinity ? v : d;
  }

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function traitMap() {
    if (!TRAITS) {
      TRAITS = {};
      C.traits.forEach(function (t) { TRAITS[t.id] = t; });
    }
    return TRAITS;
  }

  function trait(id) { return traitMap()[id] || null; }

  /** A generator of its own for one event: from the run's seed and a counter (reproducible). */
  function rngOf(state, label) {
    var run = state.run;
    run.rn = (run.rn || 0) + 1;
    return Rng.make(Rng.hash(String(run.seed) + ':' + label + ':' + run.rn));
  }

  function genState(state) {
    var l = state.layers[GEN] = state.layers[GEN] || { currency: '0e0', count: 0, best: '0e0', state: {} };
    var s = l.state = l.state && typeof l.state === 'object' ? l.state : {};
    s.laws = s.laws || {};
    s.spent = n(s.spent, 0);
    s.gens = n(s.gens, 0);
    s.years = n(s.years, 0);
    s.discoveries = n(s.discoveries, 0);
    s.colonies = s.colonies || [];
    return s;
  }

  function epochIndex(state) { return state.layers[EPOCH] ? n(state.layers[EPOCH].count, 0) : 0; }

  function round(state) { return Math.floor(epochIndex(state) / 6); }

  /** The mechanic of epoch k is open (they stay open in the later epochs). */
  function opened(state, k) { return epochIndex(state) >= k; }

  function greatness(state) { return state.layers[GEN] ? Big.toNumber(Big.of(state.layers[GEN].currency, 0)) : 0; }

  function legends(state) { return state.layers[EPOCH] ? Big.toNumber(Big.of(state.layers[EPOCH].currency, 0)) : 0; }

  /** Glory to spend on laws: all the Greatness minus what the laws took. */
  function glory(state) { return Math.max(0, greatness(state) - genState(state).spent); }

  function hasLaw(state, id) { return !!genState(state).laws[id]; }

  function tiers(state) { return opened(state, 5) ? 9 : 8; }

  function milestones(cfg) {
    var text = String(cfg['holding.milestones'] || '');
    if (MILESTONES.text !== text) {
      MILESTONES.text = text;
      MILESTONES.list = text.split(',').map(function (x) { return Number(x); }).filter(function (x) { return x > 0; }).sort(function (a, b) { return a - b; });
    }
    return MILESTONES.list;
  }

  function reached(cfg, count) {
    var m = 0;
    var list = milestones(cfg);
    list.forEach(function (x) { if (count >= x) m++; });
    // After the listed ones the milestones go on without an end, every `milestoneEvery` holdings.
    var every = Number(cfg['holding.milestoneEvery']) || 0;
    var last = list.length ? list[list.length - 1] : 0;
    if (every > 0 && count > last) m += Math.floor((count - last) / every);
    return m;
  }

  /** The next milestone of a tier after `count`, or 0. */
  function nextMilestone(cfg, count) {
    var list = milestones(cfg);
    for (var i = 0; i < list.length; i++) if (list[i] > count) return list[i];
    var every = Number(cfg['holding.milestoneEvery']) || 0;
    var last = list.length ? list[list.length - 1] : 0;
    return every > 0 ? last + (Math.floor((count - last) / every) + 1) * every : 0;
  }

  // ---- people and traits ----------------------------------------------------------------------------

  function tsum(p, field) {
    var v = 0;
    (p && p.tr || []).forEach(function (id) {
      var t = trait(id);
      if (t && typeof t[field] === 'number') v += t[field];
    });
    return v;
  }

  function tmul(p, field) {
    var v = 1;
    (p && p.tr || []).forEach(function (id) {
      var t = trait(id);
      if (t && typeof t[field] === 'number') v *= t[field];
    });
    return v;
  }

  function thas(p, field) {
    return (p && p.tr || []).some(function (id) {
      var t = trait(id);
      return !!(t && t[field]);
    });
  }

  /** A characteristic with the traits (and the ruler's bonuses of this generation). */
  function stat(state, p, id) {
    var v = n(p && p.st ? p.st[id] : 0, 0);
    (p && p.tr || []).forEach(function (t) {
      var d = trait(t);
      if (d && d.stats && d.stats[id]) v += d.stats[id];
    });
    if (id === 'health') v += n(p.pb, 0);
    if (state && p === state.run.ruler && id === 'war') v += n(state.run.fx.war, 0);
    return Math.max(0, v);
  }

  /** How many years the ruler lives. */
  function life(state, cfg) {
    var r = state.run.ruler;
    var years = cfg['life.base'] + cfg['life.perHealth'] * stat(state, r, 'health') + tsum(r, 'life') - n(r.lost, 0);
    if (hasLaw(state, 'healers')) years += cfg['law.healers.years'];
    return Math.max(cfg['age.start'] + 1, years);
  }

  function onDeathbed(state, cfg) { return !state.run.dead && state.run.ruler.age >= life(state, cfg) - 1 - 1e-9; }

  function hashOf(text) {
    var h = 0;
    text = String(text);
    for (var i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) % 2147483647;
    return h;
  }

  /** The model's nicknames (stock «names») for this main trait and gender. */
  function modelNicks(state, traitId, g) {
    return ((state && state.meta && state.meta.pool && state.meta.pool.names) || []).filter(function (x) {
      return x && x.nick && x.trait === traitId && x.gender === g && !validateStock('names', x);
    });
  }

  /**
   * The nickname by the main trait: the one fixed at accession while that trait is still the main one;
   * with `state`, otherwise the model's nickname for the trait (stable per person), else the built-in one.
   */
  function nickOf(p, state) {
    if (!p || !p.tr || !p.tr.length) return '';
    if (p.nk && p.nk.t === p.tr[0] && typeof p.nk.x === 'string') return p.nk.x;
    var own = state ? modelNicks(state, p.tr[0], p.g) : [];
    if (own.length) return own[hashOf(p.id) % own.length].nick;
    var t = trait(p.tr[0]);
    return t ? t.nick[p.g === 'f' ? 1 : 0] : '';
  }

  /** At accession the ruler keeps the model's nickname for the whole reign, even as the stock grows. */
  function fixNick(state, p) {
    if (!p || !p.tr || !p.tr.length || (p.nk && p.nk.t === p.tr[0])) return;
    var own = modelNicks(state, p.tr[0], p.g);
    if (own.length) p.nk = { t: p.tr[0], x: own[hashOf(p.id) % own.length].nick };
  }

  function newId(state) {
    state.meta.pid = n(state.meta.pid, 0) + 1;
    return 'p' + state.meta.pid;
  }

  function namePool(state, g) {
    var list = (g === 'f' ? C.names.female : C.names.male).slice();
    ((state.meta.pool && state.meta.pool.names) || []).forEach(function (x) { if (x && x.gender === g && x.name) list.push(x.name); });
    return list;
  }

  /** A name nobody living in the family has (the pool is large, so a few tries are enough). */
  function nameFor(state, g, rng) {
    var pool = namePool(state, g);
    var used = {};
    var run = state.run;
    if (run && run.ruler) used[run.ruler.name] = 1;
    ((run && run.children) || []).forEach(function (c) { used[c.name] = 1; });
    for (var i = 0; i < 8; i++) {
      var name = rng.pick(pool);
      if (!used[name]) return name;
    }
    return rng.pick(pool);
  }

  function addTrait(list, id, max) {
    if (list.indexOf(id) >= 0) return list;
    var t = trait(id);
    if (!t) return list;
    if (t.opposite && list.indexOf(t.opposite) >= 0) return list;
    if (list.length >= max) return list;
    list.push(id);
    return list;
  }

  /**
   * Traits a child takes from the parents: each trait of each parent with trait.chance (strong
   * ones trait.strongChance), not more than trait.max. Pure, for the checks of the shares.
   */
  function inheritTraits(father, mother, cfg, rng) {
    var out = [];
    var all = (father.tr || []).concat(mother.tr || []);
    all.forEach(function (id) {
      var t = trait(id);
      if (!t) return;
      var p = t.strong ? cfg['trait.strongChance'] : cfg['trait.chance'];
      if (rng.next() < p) addTrait(out, id, cfg['trait.max']);
    });
    return out;
  }

  function randomTrait(rng, rareToo) {
    var list = C.traits.filter(function (t) { return rareToo || !t.rare; });
    return rng.pick(list).id;
  }

  function freshStats(cfg, rng, lo, hi) {
    var st = {};
    STATS.forEach(function (k) { st[k] = rng.int(lo, hi); });
    return st;
  }

  /** A child of the ruler and the spouse: stats around the parents', inherited traits. */
  function makeChild(state, cfg, rng) {
    var run = state.run;
    var a = run.ruler;
    var b = run.spouse;
    var g = rng.chance(0.5) ? 'm' : 'f';
    var st = {};
    STATS.forEach(function (k) {
      var avg = (n(a.st[k], 3) + n(b.st[k], 3)) / 2;
      st[k] = clamp(Math.round(avg + rng.int(cfg['heir.randMin'], cfg['heir.randMax'])), 1, cfg['stat.max']);
    });
    var tr = [];
    if (run.fx.comet) {
      tr.push(rng.pick(RARE));
      run.fx.comet = false;
    }
    inheritTraits(a, b, cfg, rng).forEach(function (id) { addTrait(tr, id, cfg['trait.max']); });
    if (rng.next() < cfg['trait.natural']) addTrait(tr, randomTrait(rng, false), cfg['trait.max']);
    return { id: newId(state), name: nameFor(state, g, rng), g: g, born: a.age, st: st, tr: tr, focus: null, raised: false };
  }

  function childAge(state, c) { return Math.max(0, state.run.ruler.age - n(c.born, state.run.ruler.age)); }

  function coatOf(seed) {
    var rng = Rng.make(Rng.hash('coat:' + seed));
    var c1 = rng.pick(COLORS);
    var c2 = rng.pick(COLORS.filter(function (c) { return c !== c1; }));
    var c3 = rng.pick(COLORS.filter(function (c) { return c !== c1 && c !== c2; }));
    return { a: c1, b: c2, c: c3, div: rng.pick(DIVS), charge: rng.pick(CHARGES) };
  }

  // ---- money ------------------------------------------------------------------------------------------

  /** Income of one tier with `count` items (before the common multipliers). */
  function tierIncome(state, cfg, i, count) {
    if (!count) return Big.ZERO;
    var unit = Big.mul(cfg['holding.baseIncome'], Big.pow(cfg['holding.incomeStep'], i));
    var m = Math.pow(cfg['holding.milestoneMult'], reached(cfg, count));
    var run = state.run;
    if (i === 5 && n(run.fx.fireUntil, 0) > run.ruler.age) m *= cfg['card.fireMult'];
    if (i === 6) m *= tmul(run.ruler, 'port');
    return Big.mul(unit, count * m);
  }

  /** The multiplier of everything: court, Management, Lands, traits, Greatness, Legends, epochs. */
  function multiplier(state, cfg) {
    var run = state.run;
    var r = run.ruler;
    var gs = genState(state);
    var x = (1 + cfg['bonus.adm'] * stat(state, r, 'adm')) * (1 + cfg['bonus.lands'] * run.lands) * Math.max(0.1, 1 + tsum(r, 'gold')) *
      (1 + cfg['bonus.greatness'] * greatness(state)) * (1 + n(run.fx.alliance, 0)) * (1 + cfg['patron.bonus'] * gs.discoveries);
    var m = Big.mul(Big.pow(cfg['court.mult'], run.court), x);
    var L = legends(state);
    if (L > 0) m = Big.mul(m, Big.pow(cfg['epoch.legendMult'], L));
    var k = round(state);
    if (k > 0) m = Big.mul(m, Big.pow(cfg['epoch.roundIncome'], k));
    return m;
  }

  function baseIncome(state, cfg) {
    var sum = Big.ZERO;
    var h = state.run.h;
    for (var i = 0; i < tiers(state); i++) if (h[i]) sum = Big.add(sum, tierIncome(state, cfg, i, h[i]));
    return sum;
  }

  /** Gold a second as it stands (no links, no temporary cards). */
  function income(state, cfg) { return Big.mul(baseIncome(state, cfg), multiplier(state, cfg)); }

  /** Temporary multipliers of the cards at the moment (the fair by the clock, the harvest by the age). */
  function boost(state, cfg, now) {
    var run = state.run;
    if (run.dead) return cfg['deathbed.regentMult'];
    var m = 1;
    if (n(run.fx.fairUntil, 0) > now) m *= cfg['card.fairMult'];
    if (n(run.fx.harvestUntil, 0) > run.ruler.age) m *= cfg['card.harvestMult'];
    return m;
  }

  /** What the screen shows as «доход»: with the cards (the links' multiplier is the screen's). */
  function rate(state, cfg, now) { return Big.mul(income(state, cfg), boost(state, cfg, now)); }

  function gain(state, amount) {
    var run = state.run;
    run.gold = Big.add(run.gold, amount);
    if (Big.sign(amount) > 0) run.earned = Big.add(run.earned, amount);
  }

  function pay(state, amount) {
    if (Big.lt(state.run.gold, amount)) return false;
    state.run.gold = Big.sub(state.run.gold, amount);
    return true;
  }

  /** Gold of `minutes` of income (at least a little, so a poor court still has prices). */
  function minutesOf(state, cfg, minutes) {
    return Big.max(Big.mul(income(state, cfg), minutes * 60), Big.mul(cfg['holding.baseIncome'], minutes * 60));
  }

  function discount(state, cfg) {
    var r = state.run.ruler;
    var trade = Math.max(1 - cfg['bonus.tradeMax'], 1 - cfg['bonus.trade'] * stat(state, r, 'trade'));
    return trade * Math.max(0.1, 1 + tsum(r, 'holding'));
  }

  function tierBase(state, cfg, i) {
    var b = Big.mul(Big.mul(cfg['holding.baseCost'], Big.pow(cfg['holding.costStep'], i)), discount(state, cfg));
    var k = round(state);
    return k > 0 ? Big.mul(b, Big.pow(cfg['epoch.roundCost'], k)) : b;
  }

  /** The price of `count` holdings of tier i (0-based); the blueprint makes the next one free. */
  function cost(state, cfg, i, count) {
    i = i === undefined ? 0 : i;
    count = count === undefined ? 1 : count;
    var run = state.run;
    var price = Big.costGeom(tierBase(state, cfg, i), cfg['holding.growth'], run.h[i] || 0, count);
    if (run.fx.freeNext && count >= 1) price = Big.sub(price, Big.costGeom(tierBase(state, cfg, i), cfg['holding.growth'], run.h[i] || 0, 1));
    return Big.max(price, 0);
  }

  /** How many of tier i the treasury buys now. */
  function maxCount(state, cfg, i) {
    var run = state.run;
    var budget = run.fx.freeNext ? Big.add(run.gold, cost(state, cfg, i, 1)) : run.gold;
    var k = Big.maxBuy(budget, tierBase(state, cfg, i), cfg['holding.growth'], run.h[i] || 0);
    if (run.fx.freeNext && k < 1) k = 1;
    return k;
  }

  /** Buys `count` of tier i (fewer when the gold ends); returns how many were bought. */
  function buyHolding(state, cfg, i, count) {
    var run = state.run;
    if (i < 0 || i >= tiers(state)) return 0;
    count = Math.max(1, Math.floor(count || 1));
    var k = Math.min(count, maxCount(state, cfg, i));
    if (k < 1) return 0;
    var price = cost(state, cfg, i, k);
    if (!pay(state, price)) return 0;
    run.fx.freeNext = false;
    run.h[i] = (run.h[i] || 0) + k;
    run.boughtTier = Math.max(n(run.boughtTier, -1), i);
    // «Первая Столица»: the first holding of tier 8 of a reign that inherited none.
    if (i === 7 && !n(run.startTop, 0)) addDeed(state, cfg, 'tier8');
    return k;
  }

  function courtCost(state, cfg, k) {
    k = k === undefined ? state.run.court : k;
    var c = Big.mul(Big.mul(cfg['court.baseCost'], Big.pow(cfg['court.costStep'], k)), Math.max(0.1, 1 + tsum(state.run.ruler, 'court')));
    var r = round(state);
    return r > 0 ? Big.mul(c, Big.pow(cfg['epoch.roundCost'], r)) : c;
  }

  function buyCourt(state, cfg) {
    if (!pay(state, courtCost(state, cfg))) return false;
    state.run.court++;
    return true;
  }

  /**
   * The best purchase now by «payback + waiting» (the cheapest income per gold, counting the
   * time to save up): {kind: 'tier' | 'court', i, price, score}.
   */
  function best(state, cfg) {
    var run = state.run;
    var m = multiplier(state, cfg);
    var rateNow = Big.max(income(state, cfg), Big.mul(cfg['holding.baseIncome'], 0.1));
    var top = null;
    function consider(kind, i, price, delta) {
      if (Big.sign(delta) <= 0) return;
      var wait = Big.gt(price, run.gold) ? Big.div(Big.sub(price, run.gold), rateNow) : Big.ZERO;
      var score = Big.add(Big.div(price, delta), wait);
      if (!top || Big.lt(score, top.score)) top = { kind: kind, i: i, price: price, score: score };
    }
    for (var i = 0; i < tiers(state); i++) {
      var have = run.h[i] || 0;
      var delta = Big.mul(Big.sub(tierIncome(state, cfg, i, have + 1), tierIncome(state, cfg, i, have)), m);
      consider('tier', i, cost(state, cfg, i, 1), delta);
    }
    consider('court', 0, courtCost(state, cfg), Big.mul(income(state, cfg), cfg['court.mult'] - 1));
    return top;
  }

  /** One best purchase if there is gold for it (the bot and «Управляющий»); true when bought. */
  function buy(state, cfg) {
    var b = best(state, cfg);
    if (!b || Big.gt(b.price, state.run.gold)) return false;
    if (b.kind === 'court') return buyCourt(state, cfg);
    return buyHolding(state, cfg, b.i, 1) > 0;
  }

  // ---- deeds and glory ------------------------------------------------------------------------------------

  function deedCap(state, cfg) { return cfg['deeds.max'] + (hasLaw(state, 'chronicler') ? 1 : 0); }

  function reignYears(state) { return Math.max(0, state.run.ruler.age - n(state.run.startAge, state.run.ruler.age)); }

  /** «Мирное правление»: a ruler who could lead campaigns (Война ≥ campaign.minWar) and kept the peace. */
  function peaceful(state, cfg) {
    var c = state.run.camp || {};
    return !c.won && !c.lost && !state.run.campaign && reignYears(state) >= cfg['peace.years'] && stat(state, state.run.ruler, 'war') >= cfg['campaign.minWar'];
  }

  function deedList(state, cfg) {
    var out = Object.keys(state.run.deeds || {});
    if (peaceful(state, cfg) && out.length < deedCap(state, cfg)) out.push('peace');
    return out.slice(0, deedCap(state, cfg));
  }

  function addDeed(state, cfg, id) {
    var run = state.run;
    run.deeds = run.deeds || {};
    if (run.deeds[id]) return false;
    if (Object.keys(run.deeds).length >= deedCap(state, cfg)) return false;
    run.deeds[id] = true;
    return true;
  }

  /** Glory of this reign: floor(lg(З)² / glory.div), plus deeds, times the honesty of the ruler. */
  function gloryOf(state, cfg) {
    var z = Big.of(state.run.earned, 0);
    var lg = Big.lt(z, 1) ? 0 : Big.log10(z);
    var g = (Math.floor(lg * lg / cfg['glory.div'] + 1e-9) + deedList(state, cfg).length) * Math.max(0, 1 + tsum(state.run.ruler, 'glory'));
    return Math.max(0, Math.floor(g + 1e-9));
  }

  function share(state, cfg) {
    var h = cfg['inherit.base'];
    LAW_CHAIN.forEach(function (id) { if (hasLaw(state, id)) h = Math.max(h, cfg['law.' + id + '.share']); });
    return h;
  }

  // ---- facts for the chronicle -------------------------------------------------------------------------

  function fact(state, t, extra) {
    var run = state.run;
    run.facts = run.facts || [];
    var f = { t: t, age: Math.floor(run.ruler.age) };
    for (var k in extra || {}) f[k] = extra[k];
    run.facts.push(f);
    if (run.facts.length > 30) run.facts = run.facts.slice(-30);
  }

  function report(ctx, text) { if (ctx && ctx.offline && ctx.report) ctx.report(text); }

  function traitTitles(p) {
    return (p.tr || []).map(function (id) { return trait(id) ? trait(id).title.toLowerCase() : id; }).join(', ');
  }

  function bornText(c) {
    var t = traitTitles(c);
    return (c.g === 'f' ? 'Родилась дочь ' : 'Родился сын ') + c.name + (t ? ' (' + t + ')' : '');
  }

  // ---- marriage, children, upbringing ------------------------------------------------------------------

  function marriageBonus(state) { return tsum(state.run.ruler, 'marriage'); }

  /** Three candidates for a marriage: traits, characteristics and a dowry of Lands or gold. */
  function makeCandidates(state, cfg) {
    var run = state.run;
    var rng = rngOf(state, 'cands');
    var bonus = marriageBonus(state);
    var g = run.ruler.g === 'f' ? 'm' : 'f';
    var out = [];
    for (var i = 0; i < 3; i++) {
      var st = freshStats(cfg, rng, Math.max(1, cfg['founder.statMin'] + bonus), Math.max(2, cfg['founder.statMax'] + 3 + bonus * 2));
      var tr = [];
      var count = rng.int(1, 2);
      for (var j = 0; j < count; j++) addTrait(tr, randomTrait(rng, rng.chance(0.08)), cfg['trait.max']);
      var lands = rng.chance(0.5);
      var dowry = lands ? { lands: rng.int(1, Math.max(1, cfg['marry.dowryLands'] + (bonus > 0 ? 1 : 0))) }
        : { min: Math.round(cfg['marry.dowryMin'] * rng.range(0.6, 1.6) * (bonus > 0 ? 1.5 : bonus < 0 ? 0.7 : 1)) };
      out.push({ id: newId(state), name: nameFor(state, g, rng), g: g, house: rng.pick(C.names.houses), age: rng.int(16, 24), st: st, tr: tr, dowry: dowry });
    }
    run.cands = out;
    run.candYear = Math.floor(run.ruler.age);
    return out;
  }

  function canMarry(state, cfg) {
    var r = state.run.ruler;
    return !state.run.dead && !state.run.spouse && r.age >= cfg['marry.from'] && r.age <= cfg['marry.to'];
  }

  function childGap(state, cfg, rng) {
    return rng.range(cfg['child.minYears'], cfg['child.maxYears']) * tmul(state.run.ruler, 'children');
  }

  /** Marries the candidate `index` (0..2); the dowry comes at once. */
  function marry(state, cfg, index, ctx) {
    var run = state.run;
    if (!canMarry(state, cfg)) return false;
    if (!run.cands || !run.cands.length) makeCandidates(state, cfg);
    var c = run.cands[index];
    if (!c) return false;
    run.spouse = { id: c.id, name: c.name, g: c.g, house: c.house, st: c.st, tr: c.tr };
    var got = '';
    if (c.dowry.lands) {
      run.lands += c.dowry.lands;
      got = '+' + c.dowry.lands + ' ' + Fmt.plural(c.dowry.lands, 'Земля', 'Земли', 'Земель');
    } else {
      var gold = minutesOf(state, cfg, c.dowry.min);
      gain(state, gold);
      got = '+' + Fmt.num(gold) + ' золота';
    }
    if (run.fx.giftLand) {
      run.lands += run.fx.giftLand;
      run.fx.giftLand = 0;
    }
    run.cands = null;
    run.nextChild = run.ruler.age + childGap(state, cfg, rngOf(state, 'gap'));
    fact(state, 'marriage', { name: c.name });
    report(ctx, 'Свадьба: ' + run.ruler.name + ' и ' + c.name + ' из дома ' + c.house + ', приданое ' + got);
    return got;
  }

  /** The candidate the matchmaker («Сват») picks by the owner's priority. */
  function preferred(state, cands) {
    var by = (state.meta.prefs && state.meta.prefs.match) || 'stats';
    var bestI = 0;
    var bestV = -Infinity;
    cands.forEach(function (c, i) {
      var v;
      if (by === 'lands') v = (c.dowry.lands || 0) * 100 + (c.dowry.min || 0);
      else if (by === 'traits') v = c.tr.reduce(function (s, id) { var t = trait(id); return s + (t && (t.strong || t.rare) ? 3 : 1); }, 0);
      else v = STATS.reduce(function (s, k) { return s + c.st[k]; }, 0) + c.tr.length;
      if (v > bestV) {
        bestV = v;
        bestI = i;
      }
    });
    return bestI;
  }

  function birth(state, cfg, ctx) {
    var run = state.run;
    var rng = rngOf(state, 'child');
    var c = makeChild(state, cfg, rng);
    run.children.push(c);
    if (c.tr.indexOf('lefthanded') >= 0 || RARE.some(function (id) { return c.tr.indexOf(id) >= 0; })) {
      state.meta.rare = state.meta.rare || {};
      c.tr.forEach(function (id) { if (RARE.indexOf(id) >= 0) state.meta.rare[id] = true; });
    }
    run.nextChild = run.ruler.age + childGap(state, cfg, rng);
    if (!run.heir) run.heir = c.id;
    fact(state, 'child', { name: c.name, g: c.g });
    report(ctx, bornText(c));
    return c;
  }

  /** Upbringing: +heir.focus to the characteristic, and a chance to instill one trait. */
  function raise(state, cfg, childId, statId, traitId) {
    var run = state.run;
    var c = null;
    run.children.forEach(function (x) { if (x.id === childId) c = x; });
    if (!c || c.raised || STATS.indexOf(statId) < 0) return null;
    c.st[statId] = clamp(n(c.st[statId], 1) + cfg['heir.focus'], 1, cfg['stat.max']);
    c.focus = statId;
    c.raised = true;
    var got = false;
    if (traitId && trait(traitId) && !trait(traitId).rare && c.tr.indexOf(traitId) < 0) {
      if (rngOf(state, 'raise').next() < cfg['heir.traitChance']) {
        var before = c.tr.length;
        addTrait(c.tr, traitId, cfg['trait.max']);
        got = c.tr.length > before;
      }
    }
    return { child: c, trait: got };
  }

  /** Traits the upbringing can try to instill: the ruler's own good ones and the usual virtues. */
  function teachable(state, child) {
    var out = [];
    (state.run.ruler.tr || []).concat(GOOD).forEach(function (id) {
      var t = trait(id);
      if (!t || t.rare || out.indexOf(id) >= 0 || (child && child.tr.indexOf(id) >= 0)) return;
      if (child && t.opposite && child.tr.indexOf(t.opposite) >= 0) return;
      out.push(id);
    });
    return out.slice(0, 6);
  }

  function setHeir(state, childId) {
    var ok = state.run.children.some(function (c) { return c.id === childId; });
    if (ok) state.run.heir = childId;
    return ok;
  }

  /** The heir who takes the throne: the chosen child, else the eldest, else a distant kinsman. */
  function heirOf(state) {
    var run = state.run;
    var list = run.children || [];
    var chosen = null;
    list.forEach(function (c) { if (c.id === run.heir) chosen = c; });
    if (!chosen && list.length) {
      chosen = list[0];
      list.forEach(function (c) { if (n(c.born, 0) < n(chosen.born, 0)) chosen = c; });
    }
    return chosen;
  }

  /** A ruler would have this many years on the throne if `c` succeeded now. */
  function reignLeft(state, cfg, c) {
    var age = childAge(state, c);
    var start = hasLaw(state, 'regency') ? age : Math.max(cfg['age.start'], age);
    var years = cfg['life.base'] + cfg['life.perHealth'] * stat(null, c, 'health') + tsum(c, 'life') + (hasLaw(state, 'healers') ? cfg['law.healers.years'] : 0);
    return Math.max(0, years - start);
  }

  // ---- the court cards ---------------------------------------------------------------------------------

  function cardYears(state, cfg, rng) { return rng.range(cfg['card.minYears'], cfg['card.maxYears']); }

  function copyCard(c, src) {
    return { id: c.id, title: c.title, text: c.text, a: { label: c.a.label, effect: c.a.effect }, b: { label: c.b.label, effect: c.b.effect }, src: src };
  }

  /** Picks the next card now (so «Звездочёт» can see it ahead): court cards or one of the model's. */
  function pickNext(state, cfg) {
    var run = state.run;
    var rng = rngOf(state, 'card');
    var pool = state.meta.pool && state.meta.pool.cards || [];
    if (pool.length && rng.next() < cfg['card.stockShare']) {
      var s = pool[0];
      run.peek = { id: 'm-' + n(state.meta.cardN, 0), title: s.title, text: s.text, a: { label: s.a, effect: s.aEffect }, b: { label: s.b, effect: s.bEffect }, src: 'model' };
      state.meta.pool.cards = pool.slice(1);
      state.meta.cardN = n(state.meta.cardN, 0) + 1;
    } else {
      var list = C.cards.court.filter(function (c) { return !c.when || (c.when === 'city' && run.h[5] > 0); });
      run.peek = copyCard(rng.pick(list), 'court');
    }
    run.nextCard = run.ruler.age + cardYears(state, cfg, rng);
  }

  function drawCard(state, cfg) {
    var run = state.run;
    if (!run.peek || (run.peek.when === 'city' && !run.h[5])) pickNext(state, cfg);
    var c = run.peek;
    if (c.id === 'fire' && !run.h[5]) {
      pickNext(state, cfg);
      c = run.peek;
    }
    run.card = c;
    run.peek = null;
    pickNext(state, cfg);
  }

  /** The cost of an effect in gold now (null when free). */
  function effectCost(state, cfg, effect) {
    var minutes = {
      scholar: cfg['card.scholarMin'], tourney: cfg['card.tourneyMin'], gift: cfg['card.giftMin'], healer: cfg['card.plagueMin'],
      chronicler: cfg['card.chroniclerMin'], rebuild: cfg['card.rebuildMin'], healIllness: cfg['illness.healerMin'], deed: cfg['card.deedMin'],
      learn1: cfg['card.statMin'], adm1: cfg['card.statMin'], trade1: cfg['card.statMin'], health1: cfg['card.statMin']
    }[effect];
    return minutes === undefined ? null : minutesOf(state, cfg, minutes);
  }

  /** The chance of a chancy effect, 0..1 (null for the sure ones). */
  function effectChance(state, cfg, effect) {
    var r = state.run.ruler;
    var war = stat(state, r, 'war');
    if (effect === 'plotInvestigate') return thas(r, 'plots') ? 1 : stat(state, r, 'learn') / (stat(state, r, 'learn') + cfg['card.plotDiff']);
    if (effect === 'tourney') return war / (war + cfg['card.tourneyFoe']);
    if (effect === 'bandits') return war / (war + cfg['card.banditsFoe']);
    if (effect === 'plotRisk' || effect === 'pray') return 0.5;
    return null;
  }

  function goodness(state) { return Math.max(1, tmul(state.run.ruler, 'cards')); }

  function festive(state) { return tmul(state.run.ruler, 'festivals'); }

  /** A text of what the option does (with its numbers), for the buttons of the card. */
  function effectText(state, cfg, effect) {
    var t = (C.cards.effects || {})[effect] || '';
    var price = effectCost(state, cfg, effect);
    var chance = effectChance(state, cfg, effect);
    var values = {
      alliance: Math.round(allianceBonus(state, cfg) * 100), granary: Math.round(cfg['card.granary'] * 100), fairMult: cfg['card.fairMult'],
      fairSec: Math.round(cfg['card.fairSec'] * festive(state)), cost: price ? Fmt.price(price) + ' золота' : '', chance: chance === null ? '' : Math.round(chance * 100),
      plot: Math.round(cfg['card.plot'] * 100), treasure: Math.round(cfg['card.treasureMin'] * goodness(state)), harvestMult: cfg['card.harvestMult'],
      fireMult: cfg['card.fireMult'], fireYears: cfg['card.fireYears'], lifeLoss: cfg['illness.lifeLoss'], goldSmall: Math.round(cfg['card.goldSmall'] * goodness(state)),
      goldLoss: Math.round(cfg['card.goldLoss'] * 100)
    };
    return t.replace(/\{(\w+)\}/g, function (all, k) { return values[k] === undefined ? '' : String(values[k]); });
  }

  function allianceBonus(state, cfg) {
    var r = state.run.ruler;
    var own = 0;
    (r.tr || []).forEach(function (id) { var t = trait(id); if (t && t.alliance) own = Math.max(own, t.alliance); });
    return Math.max(cfg['card.alliance'], own) * goodness(state);
  }

  function canAfford(state, cfg, effect) {
    var price = effectCost(state, cfg, effect);
    return !price || Big.gte(state.run.gold, price);
  }

  function lose(state, part) {
    var run = state.run;
    run.gold = Big.mul(run.gold, Math.max(0, 1 - part));
  }

  function bastard(state, cfg, rng) {
    var run = state.run;
    var g = rng.chance(0.7) ? 'm' : 'f';
    var ageNow = rng.int(8, 20);
    var tr = [];
    addTrait(tr, randomTrait(rng, rng.chance(0.15)), cfg['trait.max']);
    if (rng.chance(0.5)) addTrait(tr, randomTrait(rng, false), cfg['trait.max']);
    var c = { id: newId(state), name: nameFor(state, g, rng), g: g, born: run.ruler.age - ageNow, st: freshStats(cfg, rng, cfg['founder.statMin'], cfg['founder.statMax'] + 2),
      tr: tr, focus: null, raised: false, bastard: true };
    run.children.push(c);
    if (!run.heir) run.heir = c.id;
    return c;
  }

  /**
   * Applies an effect of a card option. Returns {ok, text} — text says what happened (a flash on
   * the screen). Paid options need the gold first.
   */
  function applyEffect(state, cfg, effect, now) {
    var run = state.run;
    var r = run.ruler;
    var price = effectCost(state, cfg, effect);
    if (price && !pay(state, price)) return { ok: false, text: 'Не хватает золота' };
    var rng = rngOf(state, 'effect:' + effect);
    var chance = effectChance(state, cfg, effect);
    var lucky = chance === null ? true : rng.next() < chance;
    var good = goodness(state);
    var text = '';
    switch (effect) {
      case 'nothing':
        break;
      case 'alliance':
        run.fx.alliance = n(run.fx.alliance, 0) + allianceBonus(state, cfg);
        text = 'Союз заключён: золото +' + Math.round(allianceBonus(state, cfg) * 100) + ' % до конца поколения';
        break;
      case 'war1':
        run.fx.war = n(run.fx.war, 0) + 1;
        text = 'Война +1 до конца поколения';
        break;
      case 'granary':
        lose(state, cfg['card.granary']);
        text = addDeed(state, cfg, 'granary') ? 'Амбары открыты: +1 деяние' : 'Амбары открыты';
        break;
      case 'fair':
        run.fx.fairUntil = Math.max(n(run.fx.fairUntil, 0), now) + cfg['card.fairSec'] * festive(state) * 1000;
        text = 'Ярмарка: доход ×' + cfg['card.fairMult'];
        break;
      case 'scholar':
        r.st.learn = clamp(n(r.st.learn, 1) + 2, 1, cfg['stat.max']);
        text = 'Учёность +2';
        break;
      case 'plotInvestigate':
        if (lucky) text = 'Заговор раскрыт, казна цела';
        else {
          lose(state, cfg['card.plot']);
          text = 'Заговорщики ушли с частью казны';
        }
        break;
      case 'plotRisk':
        if (lucky) {
          lose(state, cfg['card.plot']);
          text = 'Заговорщики унесли часть казны';
        } else text = 'Обошлось';
        break;
      case 'tourney':
        if (lucky) {
          genState(state);
          state.layers[GEN].currency = Big.add(Big.of(state.layers[GEN].currency, 0), cfg['card.tourneyGlory']);
          text = 'Победа на турнире: +' + cfg['card.tourneyGlory'] + ' Слава';
        } else text = 'Боец рода проиграл';
        break;
      case 'treasure':
        gain(state, minutesOf(state, cfg, cfg['card.treasureMin'] * good));
        text = 'Клад в казне';
        break;
      case 'goldSmall':
        gain(state, minutesOf(state, cfg, cfg['card.goldSmall'] * good));
        text = 'Казна пополнилась';
        break;
      case 'goldLoss':
        lose(state, cfg['card.goldLoss']);
        text = 'Казна потеряла ' + Math.round(cfg['card.goldLoss'] * 100) + ' %';
        break;
      case 'temple':
      case 'deed':
        text = addDeed(state, cfg, effect === 'temple' ? 'temple' : 'card') ? '+1 деяние' : 'Деяний за поколение уже предостаточно';
        break;
      case 'gift':
        run.fx.giftLand = n(run.fx.giftLand, 0) + 1;
        text = 'Подарок запомнят: +1 Земля при следующем браке';
        break;
      case 'healer':
        text = 'Мор обошёл столицу';
        break;
      case 'pray':
        if (lucky) {
          r.st.health = clamp(n(r.st.health, 1) - 1, 1, cfg['stat.max']);
          text = 'Мор задел и правителя: Здоровье −1';
        } else text = 'Молитвы услышаны';
        break;
      case 'blueprint':
        run.fx.freeNext = true;
        text = 'Следующее владение — даром';
        break;
      case 'chronicler':
        text = addDeed(state, cfg, 'chronicler') ? 'Летописец доволен: +1 деяние' : 'Летописец доволен';
        break;
      case 'bandits':
        if (lucky) {
          run.lands += 1;
          text = 'Дорога очищена: +1 Земля';
        } else text = 'Разбойники ушли в лес';
        break;
      case 'bastard':
        var b = bastard(state, cfg, rng);
        text = (b.g === 'f' ? 'Признана дочь ' : 'Признан сын ') + b.name;
        break;
      case 'comet':
        run.fx.comet = true;
        text = 'Следующий ребёнок родится с редкой чертой';
        break;
      case 'harvest':
        var f = festive(state);
        var left = Math.floor(r.age) + 1 - r.age;
        run.fx.harvestUntil = f > 1 ? Math.floor(r.age) + f : r.age + left * f;
        text = 'Праздник урожая: доход ×' + cfg['card.harvestMult'];
        break;
      case 'rebuild':
        text = 'Город отстроен';
        break;
      case 'fire':
        run.fx.fireUntil = r.age + cfg['card.fireYears'];
        text = 'Город отстраивается сам';
        break;
      case 'healIllness':
        text = 'Правитель поправился';
        break;
      case 'endure':
        r.lost = n(r.lost, 0) + cfg['illness.lifeLoss'];
        text = 'Болезнь отступила, но жизнь стала короче на ' + cfg['illness.lifeLoss'] + ' ' + Fmt.plural(cfg['illness.lifeLoss'], 'год', 'года', 'лет');
        break;
      case 'learn1':
      case 'adm1':
      case 'trade1':
      case 'health1':
        var k = { learn1: 'learn', adm1: 'adm', trade1: 'trade', health1: 'health' }[effect];
        r.st[k] = clamp(n(r.st[k], 1) + 1, 1, cfg['stat.max']);
        text = 'Характеристика +1';
        break;
      default:
        return { ok: false, text: 'Неизвестное решение' };
    }
    return { ok: true, text: text };
  }

  /** Answers the card on the table: choice 'a' or 'b'. */
  function answer(state, cfg, choice, now) {
    var run = state.run;
    var c = run.card;
    if (!c) return { ok: false, text: 'Нет карточки' };
    var opt = choice === 'b' ? c.b : c.a;
    if (!canAfford(state, cfg, opt.effect)) return { ok: false, text: 'Не хватает золота' };
    var r = applyEffect(state, cfg, opt.effect, now);
    if (!r.ok) return r;
    run.card = null;
    run.cards = n(run.cards, 0) + 1;
    if (c.id !== 'illness') fact(state, 'card', { id: c.id, title: c.title, choice: opt.label });
    return r;
  }

  // ---- campaigns, scholars, colonies -------------------------------------------------------------------

  function campaignInfo(state, cfg, kind) {
    var r = state.run.ruler;
    var war = stat(state, r, 'war') * (1 + tsum(r, 'campaign'));
    var foe = (cfg['campaign.neighbor'] + cfg['campaign.neighborPerLand'] * state.run.lands) * cfg['campaign.' + kind + '.foe'];
    return {
      kind: kind, minutes: cfg['campaign.' + kind + '.min'], price: minutesOf(state, cfg, cfg['campaign.' + kind + '.cost']),
      chance: war > 0 ? war / (war + foe) : 0, lands: cfg['campaign.' + kind + '.lands']
    };
  }

  function canCampaign(state, cfg) {
    return !state.run.dead && !state.run.campaign && stat(state, state.run.ruler, 'war') >= cfg['campaign.minWar'];
  }

  function startCampaign(state, cfg, kind, now) {
    if (!canCampaign(state, cfg) || !cfg['campaign.' + kind + '.min']) return false;
    var c = campaignInfo(state, cfg, kind);
    if (!pay(state, c.price)) return false;
    state.run.campaign = { kind: kind, from: now, to: now + c.minutes * 60000, invest: Big.str(c.price), chance: c.chance, roll: rngOf(state, 'camp').next(), lands: c.lands };
    return true;
  }

  function campaignCheck(state, cfg, ctx) {
    var run = state.run;
    var c = run.campaign;
    if (!c || ctx.now < c.to) return;
    run.campaign = null;
    run.camp = run.camp || { won: 0, lost: 0 };
    var title = (C.world.campaigns.filter(function (x) { return x.id === c.kind; })[0] || { title: 'Поход' }).title;
    if (c.roll < c.chance) {
      var before = run.lands;
      run.lands += c.lands;
      run.camp.won++;
      run.last = { campaign: title, ok: true, lands: c.lands };
      fact(state, 'campaignWin', { lands: run.lands });
      if (Math.floor(run.lands / 10) > Math.floor(before / 10)) addDeed(state, cfg, 'lands10');
      report(ctx, title + ': победа, +' + c.lands + ' ' + Fmt.plural(c.lands, 'Земля', 'Земли', 'Земель'));
    } else {
      run.camp.lost++;
      var back = thas(run.ruler, 'cautious') ? Big.div(c.invest, 2) : Big.ZERO;
      if (Big.gt(back, 0)) run.gold = Big.add(run.gold, back);
      run.last = { campaign: title, ok: false };
      fact(state, 'campaignLoss', {});
      report(ctx, title + ': неудача, вложенное потеряно' + (Big.gt(back, 0) ? ' (половина вернулась)' : ''));
    }
  }

  function scholarInfo(state, cfg) {
    var learn = stat(state, state.run.ruler, 'learn');
    return { price: minutesOf(state, cfg, cfg['patron.costMin']), years: cfg['patron.years'] / (1 + cfg['patron.learnSpeed'] * learn) };
  }

  function fundScholar(state, cfg) {
    var gs = genState(state);
    if (!opened(state, 2) || gs.scholar || state.run.dead) return false;
    var s = scholarInfo(state, cfg);
    if (!pay(state, s.price)) return false;
    gs.scholar = { at: gs.years + s.years, from: gs.years };
    return true;
  }

  function scholarCheck(state, cfg, ctx) {
    var gs = genState(state);
    if (!gs.scholar || gs.years < gs.scholar.at) return;
    gs.scholar = null;
    gs.discoveries++;
    var list = C.world.discoveries;
    var name = list[(gs.discoveries - 1) % list.length];
    state.run.last = { discovery: name };
    report(ctx, 'Открытие: «' + name + '» — золото +' + Math.round(cfg['patron.bonus'] * 100) + ' %');
  }

  function colonyInfo(state, cfg, idx) {
    var c = C.world.colonies[idx];
    if (!c) return null;
    var inc = income(state, cfg);
    return {
      id: c.id, title: c.title, hours: c.hours, price: minutesOf(state, cfg, cfg['colony.costMin'] * Math.sqrt(c.hours)),
      gold: Big.mul(inc, c.hours * 3600 * cfg['colony.yield']), land: 1 - Math.pow(1 - cfg['colony.landChance'], c.hours)
    };
  }

  function sendColony(state, cfg, idx, now) {
    var gs = genState(state);
    if (!opened(state, 3) || gs.colonies.length >= cfg['colony.max'] || state.run.dead) return false;
    var c = colonyInfo(state, cfg, idx);
    if (!c || !pay(state, c.price)) return false;
    gs.colonies.push({ id: c.id, title: c.title, from: now, to: now + c.hours * 3600000, gold: Big.str(c.gold), land: c.land, roll: rngOf(state, 'colony').next() });
    return true;
  }

  function colonyCheck(state, cfg, ctx) {
    var gs = genState(state);
    if (!gs.colonies.length) return;
    var keep = [];
    gs.colonies.forEach(function (c) {
      if (ctx.now < c.to) {
        keep.push(c);
        return;
      }
      gain(state, c.gold);
      var land = c.roll < c.land;
      if (land) state.run.lands += 1;
      report(ctx, 'Корабль из «' + c.title + '» вернулся: +' + Fmt.num(c.gold) + ' золота' + (land ? ', +1 Земля' : ''));
      state.run.last = { colony: c.title, gold: c.gold, land: land };
    });
    gs.colonies = keep;
  }

  // ---- laws ---------------------------------------------------------------------------------------------------

  function lawCost(cfg, id) { return n(cfg['law.' + id + '.cost'], 0); }

  function lawState(state, cfg, id) {
    var law = C.world.laws.filter(function (l) { return l.id === id; })[0];
    if (!law) return { exists: false };
    var gs = genState(state);
    return {
      exists: true, law: law, have: !!gs.laws[id], cost: lawCost(cfg, id), needs: law.needs && !gs.laws[law.needs] ? law.needs : null,
      can: !gs.laws[id] && !(law.needs && !gs.laws[law.needs]) && glory(state) >= lawCost(cfg, id)
    };
  }

  function buyLaw(state, cfg, id) {
    var s = lawState(state, cfg, id);
    if (!s.exists || !s.can) return false;
    var gs = genState(state);
    gs.laws[id] = true;
    gs.spent += s.cost;
    return true;
  }

  /** Parliament (Просвещение): once a generation a law can be repealed, its Glory comes back. */
  function canRepeal(state, cfg, id) {
    var gs = genState(state);
    if (!opened(state, 4) || state.run.lawSwap || !gs.laws[id]) return false;
    return !C.world.laws.some(function (l) { return l.needs === id && gs.laws[l.id]; });
  }

  function repealLaw(state, cfg, id) {
    if (!canRepeal(state, cfg, id)) return false;
    var gs = genState(state);
    gs.laws[id] = false;
    gs.spent = Math.max(0, gs.spent - lawCost(cfg, id));
    state.run.lawSwap = true;
    return true;
  }

  // ---- pilgrimage (the steps link) ------------------------------------------------------------------------------

  function pilgrimage(state, cfg, kind) {
    var run = state.run;
    if (run.dead) return false;
    if (kind === 'health') {
      if (n(run.ruler.pb, 0) >= cfg['pilgrimage.maxHealth']) return false;
      run.ruler.pb = n(run.ruler.pb, 0) + 1;
      return true;
    }
    return addDeed(state, cfg, 'pilgrimage');
  }

  // ---- automation (the laws) --------------------------------------------------------------------------------------

  function automation(state, cfg, ctx) {
    var run = state.run;
    if (run.dead) return;
    if (hasLaw(state, 'steward')) {
      for (var i = 0; i < 20; i++) {
        var b = best(state, cfg);
        if (!b || b.kind !== 'tier' || Big.gt(b.price, run.gold)) break;
        if (!buyHolding(state, cfg, b.i, 1)) break;
      }
    }
    if (hasLaw(state, 'chancellor')) {
      for (var k = 0; k < 3 && Big.gte(run.gold, courtCost(state, cfg)); k++) buyCourt(state, cfg);
    }
    if (hasLaw(state, 'matchmaker') && canMarry(state, cfg)) {
      if (!run.cands || !run.cands.length) makeCandidates(state, cfg);
      marry(state, cfg, preferred(state, run.cands), ctx);
    }
    if (hasLaw(state, 'voivode') && canCampaign(state, cfg)) {
      var c = campaignInfo(state, cfg, 'war');
      if (Big.gte(run.gold, Big.mul(c.price, 2))) startCampaign(state, cfg, 'war', ctx.now);
    }
  }

  // ---- time --------------------------------------------------------------------------------------------------------

  function die(state, cfg, ctx) {
    var run = state.run;
    run.dead = true;
    run.card = null;
    run.ruler.age = Math.max(run.ruler.age, Math.floor(life(state, cfg) * 100) / 100);
    fact(state, 'death', {});
  }

  /** The ruler ages by real seconds: a year a minute in the game, a year in 20 minutes away. */
  function age(state, cfg, real, ctx) {
    var run = state.run;
    var r = run.ruler;
    var off = !!ctx.offline;
    var per = off ? cfg['age.offlineSec'] : cfg['age.onlineSec'];
    var from = r.age;
    var to = from + real / per;
    if (off) {
      var cap = life(state, cfg) - 1;
      if (to > cap) to = Math.max(from, cap);
    }
    var guard = 0;
    while (guard++ < 400 && !run.dead) {
      // The next thing on the way: a whole year, a birth — whichever comes first.
      var year = Math.floor(r.age) + 1;
      var stop = Math.min(to, year);
      if (run.spouse && run.nextChild !== null && run.nextChild !== undefined && run.nextChild <= stop && run.nextChild < cfg['child.until']) stop = Math.max(r.age, run.nextChild);
      genState(state).years += stop - r.age;
      r.age = stop;
      if (run.spouse && run.nextChild !== null && run.nextChild !== undefined && r.age >= run.nextChild) {
        if (r.age < cfg['child.until']) birth(state, cfg, ctx);
        else run.nextChild = null;
      }
      if (r.age >= year) yearly(state, cfg, ctx);
      if (!off && r.age >= life(state, cfg)) {
        die(state, cfg, ctx);
        break;
      }
      if (r.age >= to) break;
    }
    // Sums of small steps miss whole years by a hair (39.9999…): snap them.
    var whole = Math.round(r.age);
    if (Math.abs(r.age - whole) < 1e-6) r.age = whole;
  }

  /** Once a year of the reign: illness (online), the long life, the card and the tournament timers. */
  function yearly(state, cfg, ctx) {
    var run = state.run;
    var r = run.ruler;
    if (r.age >= cfg['longlife.age']) addDeed(state, cfg, 'longlife');
    if (ctx.offline) return;
    if (r.age >= cfg['illness.from'] && rngOf(state, 'ill').next() < cfg['illness.chance']) run.ill = true;
  }

  function cards(state, cfg, ctx) {
    var run = state.run;
    if (ctx.offline || run.dead || run.card) return;
    if (run.ill) {
      run.card = copyCard(C.cards.illness, 'illness');
      run.ill = false;
      return;
    }
    if (opened(state, 1) && run.ruler.age >= n(run.nextTourney, Infinity)) {
      run.card = copyCard(C.cards.tourney, 'tourney');
      run.nextTourney = run.ruler.age + cfg['tourney.everyYears'];
      return;
    }
    if (run.ruler.age >= n(run.nextCard, Infinity)) drawCard(state, cfg);
  }

  function step(state, dt, ctx) {
    var cfg = ctx.config;
    var run = state.run;
    var off = !!ctx.offline;
    var eff = n(cfg['offline.efficiency'], 1) || 1;
    var real = off ? dt / eff : dt;
    if (!run.dead) age(state, cfg, real, ctx);
    var m = (ctx.mult || 1) * boost(state, cfg, off ? 0 : ctx.now);
    if (off) {
      m *= hasLaw(state, 'nightwatch') ? 1 : cfg['offline.share'];
      if (onDeathbed(state, cfg)) m *= cfg['deathbed.mult'];
    }
    var inc = income(state, cfg);
    if (Big.sign(inc) > 0) gain(state, Big.mul(inc, dt * m));
    campaignCheck(state, cfg, ctx);
    colonyCheck(state, cfg, ctx);
    scholarCheck(state, cfg, ctx);
    automation(state, cfg, ctx);
    cards(state, cfg, ctx);
    if (run.lands >= 10 * (1 + Math.floor(n(run.startLands, 0) / 10))) addDeed(state, cfg, 'lands10');
    state.meta.maxLands = Math.max(n(state.meta.maxLands, 0), run.lands);
    state.meta.maxAge = Math.max(n(state.meta.maxAge, 0), run.ruler.age);
  }

  // ---- the engine's functions -------------------------------------------------------------------------------------

  function person(state, cfg, rng, g, ageNow) {
    return { id: newId(state), name: nameFor(state, g, rng), g: g, age: ageNow, st: freshStats(cfg, rng, cfg['founder.statMin'], cfg['founder.statMax']), tr: [], lost: 0, pb: 0 };
  }

  function newRun(state, cfg, rng, ruler) {
    return {
      seed: rng.int(1, 2147483646), rn: 0, gold: Big.str(Big.of(cfg['start.gold'])), earned: '0e0', h: [0, 0, 0, 0, 0, 0, 0, 0, 0], court: 0, lands: 0,
      ruler: ruler, spouse: null, children: [], heir: null, cands: null, nextChild: null, card: null, peek: null, nextCard: null,
      nextTourney: null, campaign: null, camp: { won: 0, lost: 0 }, fx: {}, deeds: {}, facts: [], dead: false, startAge: ruler.age, startLands: 0,
      reignFrom: 0, lawSwap: false, ill: false, cards: 0, last: null
    };
  }

  function startReign(state, cfg, now) {
    var run = state.run;
    var rng = rngOf(state, 'reign');
    run.startAge = run.ruler.age;
    run.startLands = run.lands;
    run.startTop = run.h[7] || 0;
    run.reignFrom = now || 0;
    fixNick(state, run.ruler);
    run.nextCard = run.ruler.age + cardYears(state, cfg, rng);
    run.nextTourney = opened(state, 1) ? run.ruler.age + cfg['tourney.everyYears'] * rng.range(0.4, 1) : null;
    if (thas(run.ruler, 'deed')) addDeed(state, cfg, 'pious');
    pickNext(state, cfg);
    fact(state, 'reign', {});
  }

  function treeNode(state, p, extra) {
    var node = { id: p.id, name: p.name, g: p.g, nick: nickOf(p, state), tr: (p.tr || []).slice(0, 4), epoch: epochIndex(state) };
    for (var k in extra || {}) node[k] = extra[k];
    return node;
  }

  function init(ctx) {
    var cfg = ctx.config;
    var rng = ctx.rng;
    var state = { run: { rn: 0, seed: rng.int(1, 2147483646), children: [] }, layers: {}, meta: { pid: 0 } };
    var ruler = person(state, cfg, rng, 'm', cfg['age.start']);
    ruler.st.health = cfg['founder.health'];
    if (rng.chance(0.6)) addTrait(ruler.tr, randomTrait(rng, false), cfg['trait.max']);
    var run = newRun(state, cfg, rng, ruler);
    state.run = run;
    startReign(state, cfg, ctx.now);
    return {
      run: run,
      layers: { generation: { state: { laws: {}, spent: 0, gens: 0, years: 0, discoveries: 0, colonies: [], scholar: null } }, epoch: { state: {} } },
      meta: {
        pid: state.meta.pid, house: ruler.name, coat: coatOf(run.seed), branches: {},
        tree: [treeNode(state, ruler, { gen: 0, parent: null, ruler: true, from: ruler.age, founder: true })],
        chronicle: [], pool: { names: [], phrases: [], cards: [] }, prefs: { match: 'stats' }, rare: {}, maxLands: 0, maxAge: ruler.age
      }
    };
  }

  function tick(state, dt, ctx) { step(state, dt, ctx); }

  /**
   * The absence at once: the same steps as tick in pieces of offline.subSec, then the summary
   * (years, gold before → after, births and campaigns as they came, the deathbed).
   */
  function offline(state, sec, ctx) {
    var cfg = ctx.config;
    var eff = n(cfg['offline.efficiency'], 1) || 1;
    var real = sec / eff;
    var run = state.run;
    var startAge = run.ruler.age;
    var startGold = Big.of(run.gold);
    var wasDeathbed = onDeathbed(state, cfg);
    var pieces = Math.max(1, Math.ceil(real / Math.max(1, cfg['offline.subSec'])));
    var start = ctx.now - real * 1000;
    var c = {};
    for (var k in ctx) c[k] = ctx[k];
    c.offline = true;
    var happened = [];
    c.report = function (text) { if (text) happened.push(String(text)); };
    for (var i = 0; i < pieces; i++) {
      c.now = start + real * 1000 * (i + 1) / pieces;
      step(state, sec / pieces, c);
    }
    var years = run.ruler.age - startAge;
    var events = [];
    if (years >= 0.05 && !run.dead) {
      events.push('Прошло ' + Fmt.num(years, { digits: 2 }) + ' ' + Fmt.plural(Math.floor(years), 'год', 'года', 'лет') + ': правителю ' +
        Math.floor(startAge) + ' → ' + Math.floor(run.ruler.age));
    }
    events.push('Золото: ' + Fmt.num(startGold) + ' → ' + Fmt.num(run.gold));
    happened.forEach(function (text) { events.push(text); });
    if (run.campaign) events.push('Войско ещё в походе');
    if (!run.dead && onDeathbed(state, cfg)) events.push(wasDeathbed ? 'Правитель всё ещё на смертном одре — проститесь с ним' : 'Правитель при смерти — проститесь с ним');
    return { events: events };
  }

  function prestigeGain(state, layerId, cfg) {
    var run = state.run;
    if (layerId === GEN) {
      if (!run.ruler || (!run.dead && run.ruler.age < cfg['age.abdicate'])) return Big.ZERO;
      var g = gloryOf(state, cfg);
      return Big.of(run.dead ? Math.max(1, g) : g);
    }
    if (layerId === EPOCH) {
      if (genState(state).gens < cfg['epoch.minGens']) return Big.ZERO;
      return Big.floor(Big.sqrt(Big.div(Big.of(state.layers[GEN].currency, 0), cfg['epoch.legendDiv'])));
    }
    return Big.ZERO;
  }

  function bonus(state, layerId, amount, cfg) {
    if (layerId === GEN) return Big.add(1, Big.mul(amount, cfg['bonus.greatness']));
    return Big.pow(cfg['epoch.legendMult'], Big.toNumber(Big.of(amount, 0)));
  }

  /** The words of the chronicle for one reign: 3–5 lines from the phrases (the model's first). */
  function compose(state, info, rng) {
    var pool = (state.meta.pool && state.meta.pool.phrases) || [];
    var used = {};
    function phrase(t) {
      var own = pool.filter(function (p) { return p.fact === t && !used[p.text]; });
      var list = own.length ? own.map(function (p) { return p.text; }) : (C.chronicle[t] || []);
      var text = rng.pick(list) || '';
      used[text] = true;
      return text.replace(/\{([^}]+)\}/g, function (all, k) { return info[k] === undefined ? '' : String(info[k]); }).replace(/\s+/g, ' ').replace(/\s([,.])/g, '$1').trim();
    }
    var facts = info.facts || [];
    var lines = [phrase('reign')];
    var kinds = {};
    facts.forEach(function (f) { kinds[f.t] = f; });
    if (kinds.marriage) lines.push(phrase('marriage'));
    if (kinds.child) lines.push(phrase('child'));
    if (kinds.campaignWin) lines.push(phrase('campaignWin'));
    else if (kinds.campaignLoss) lines.push(phrase('campaignLoss'));
    if (lines.length < 4 && kinds.card) lines.push(phrase('card'));
    if (lines.length < 4 && info.tier8) lines.push(phrase('tier8'));
    if (lines.length < 4 && info.landsN >= 5) lines.push(phrase('lands'));
    lines.push(phrase(info.abdicated ? 'abdication' : 'death'));
    return lines.slice(0, 5);
  }

  function chronicleInfo(state, before, heirName) {
    var run = before.run;
    var r = run.ruler;
    var lastChild = null;
    (run.facts || []).forEach(function (f) { if (f.t === 'child') lastChild = f.name; });
    var ep = C.world.epochs[epochIndex(before) % 6];
    return {
      'имя': r.name, 'прозвище': nickOf(r), 'супруг': run.spouse ? run.spouse.name : '', 'ребёнок': lastChild || '', 'возраст': Math.floor(r.age),
      'земли': run.lands, 'годы': Math.max(1, Math.floor(r.age - n(run.startAge, r.age))), 'наследник': heirName, 'эпоха': ep ? ep.title.toLowerCase() : '',
      'владение': 'Столица', facts: run.facts || [], abdicated: !run.dead, tier8: !!(run.deeds && run.deeds.tier8), landsN: run.lands
    };
  }

  /** The heir takes the throne: a share of the gold and the holdings, all the Lands; the tree grows. */
  function succeed(state, before, cfg, ctx) {
    var gl = state.layers[GEN];
    var gs = genState(state);
    gs.gens++;
    var old = before.run;
    var dead = old.ruler;
    var h = share(before, cfg);
    var rng = Rng.make(Rng.hash(String(old.seed) + ':succession:' + n(old.rn, 0)));
    var tmp = { run: old, layers: before.layers, meta: state.meta };
    var heir = heirOf(tmp);
    var kin = false;
    if (!heir) {
      kin = true;
      var g = rng.chance(0.5) ? 'm' : 'f';
      heir = { id: newId(state), name: nameFor(state, g, rng), g: g, born: dead.age - rng.int(cfg['kin.ageMin'], cfg['kin.ageMax']),
        st: freshStats(cfg, rng, cfg['founder.statMin'], cfg['founder.statMax']), tr: [], kin: true };
      if (rng.chance(0.5)) addTrait(heir.tr, randomTrait(rng, false), cfg['trait.max']);
    }
    var hisAge = Math.max(0, dead.age - n(heir.born, dead.age));
    var startAge = hasLaw(state, 'regency') ? Math.max(hisAge, 1) : Math.max(cfg['age.start'], hisAge);
    var ruler = { id: heir.id, name: heir.name, g: heir.g, age: startAge, st: heir.st, tr: heir.tr.slice(0, cfg['trait.max']), lost: 0, pb: 0, regent: startAge < cfg['age.start'] };
    var run = newRun(state, cfg, rng, ruler);
    run.gold = Big.str(Big.max(Big.floor(Big.mul(old.gold, h)), Big.of(cfg['start.gold'])));
    for (var i = 0; i < 9; i++) run.h[i] = Math.floor((old.h[i] || 0) * h);
    run.lands = old.lands;
    run.fx.giftLand = n(old.fx && old.fx.giftLand, 0);
    state.run = run;
    // The tree: the dead ruler closes, the spouse and the children are written in.
    var gen = n(gl.count, 1);
    var tree = state.meta.tree = state.meta.tree || [];
    var info = chronicleInfo(state, before, heir.name);
    var glory = gloryOf(before, cfg);
    tree.forEach(function (t) {
      if (t.id === dead.id) {
        t.to = Math.floor(dead.age);
        t.glory = old.dead ? Math.max(1, glory) : glory;
        t.nick = nickOf(dead);
        t.abdicated = !old.dead;
      }
    });
    if (old.spouse && !tree.some(function (t) { return t.id === old.spouse.id; })) {
      tree.push(treeNode(state, old.spouse, { gen: gen - 1, spouseOf: dead.id, house: old.spouse.house }));
    }
    (old.children || []).forEach(function (c) {
      if (tree.some(function (t) { return t.id === c.id; })) return;
      tree.push(treeNode(state, c, { gen: gen, parent: dead.id, ruler: c.id === heir.id, bastard: !!c.bastard, from: c.id === heir.id ? startAge : undefined }));
    });
    if (kin) tree.push(treeNode(state, heir, { gen: gen, parent: dead.id, ruler: true, kin: true, from: startAge }));
    var lines = compose(state, info, rng);
    state.meta.chronicle = state.meta.chronicle || [];
    state.meta.chronicle.push({ gen: gen - 1, name: dead.name, nick: nickOf(dead), epoch: epochIndex(before), years: info['годы'], age: Math.floor(dead.age),
      glory: glory, deeds: deedList(before, cfg), lines: lines, at: ctx && ctx.now ? ctx.now : 0, lands: old.lands });
    if (state.meta.chronicle.length > 300) state.meta.chronicle = state.meta.chronicle.slice(-300);
    startReign(state, cfg, ctx && ctx.now);
    if (ruler.regent) fact(state, 'reign', { regent: true });
  }

  /** A new epoch: the family founds a branch; Glory, Greatness and laws start anew, Legends stay. */
  function newEpoch(state, before, cfg, ctx) {
    var old = before.run;
    var rng = Rng.make(Rng.hash(String(old.seed) + ':epoch:' + n(old.rn, 0)));
    var tmp = { run: old, layers: before.layers, meta: state.meta };
    var heir = heirOf(tmp);
    var e = epochIndex(state);
    var ruler;
    if (heir) {
      ruler = { id: heir.id, name: heir.name, g: heir.g, age: Math.max(cfg['age.start'], Math.max(0, old.ruler.age - n(heir.born, old.ruler.age))), st: heir.st, tr: heir.tr.slice(0, cfg['trait.max']), lost: 0, pb: 0 };
    } else {
      ruler = person(state, cfg, rng, rng.chance(0.5) ? 'm' : 'f', cfg['age.start']);
      ruler.tr = old.ruler.tr.slice(0, 1);
    }
    state.run = newRun(state, cfg, rng, ruler);
    state.meta.branches = state.meta.branches || {};
    state.meta.branches[e] = { add: rng.pick(ADDS), color: rng.pick(COLORS) };
    var tree = state.meta.tree = state.meta.tree || [];
    var gen = n(state.layers[GEN].count, 0);
    tree.forEach(function (t) { if (t.id === old.ruler.id) t.to = Math.floor(old.ruler.age); });
    if (!tree.some(function (t) { return t.id === ruler.id; })) tree.push(treeNode(state, ruler, { gen: gen + 1, parent: heir ? old.ruler.id : null, ruler: true, from: ruler.age, branch: true }));
    else tree.forEach(function (t) { if (t.id === ruler.id) { t.ruler = true; t.branch = true; t.epoch = e; t.from = ruler.age; } });
    state.meta.chronicle = state.meta.chronicle || [];
    var ep = C.world.epochs[e % 6];
    state.meta.chronicle.push({ gen: gen, name: ruler.name, epoch: e, lines: ['Род основывает новую ветвь: начинается эпоха «' + (ep ? ep.title : '') + '». Во главе ветви — ' + ruler.name + '.'],
      at: ctx && ctx.now ? ctx.now : 0, branch: true });
    startReign(state, cfg, ctx && ctx.now);
  }

  function onPrestige(state, layerId, before, ctx) {
    var cfg = ctx.config;
    if (layerId === GEN) succeed(state, before, cfg, ctx);
    else if (layerId === EPOCH) newEpoch(state, before, cfg, ctx);
  }

  function migrate(state, fromVer) {
    // Version 1 is the first. A new version adds its case here and fixtures/v<old>.json.
    return state;
  }

  function validate(state) {
    var run = state.run;
    if (!run || !run.ruler || typeof run.ruler.age !== 'number') return 'нет правителя';
    if (!Array.isArray(run.h) || run.h.length < 8) return 'нет владений';
    for (var i = 0; i < run.h.length; i++) if (typeof run.h[i] !== 'number' || run.h[i] < 0 || run.h[i] % 1 !== 0) return 'владения тира ' + (i + 1) + ': ' + run.h[i];
    if (!Big.valid(run.gold) || Big.sign(run.gold) < 0) return 'золото меньше нуля';
    if (typeof run.lands !== 'number' || run.lands < 0) return 'Земли: ' + run.lands;
    if (!Array.isArray(run.children)) return 'нет списка детей';
    return null;
  }

  function summary(state, cfg) {
    var run = state.run;
    var r = run.ruler;
    var nick = nickOf(r);
    var parts = [r.name + (nick ? ' ' + nick : '') + ', ' + Math.floor(r.age) + ' ' + Fmt.plural(Math.floor(r.age), 'год', 'года', 'лет'), Fmt.rate(income(state, cfg))];
    var gl = state.layers[GEN];
    if (gl && gl.count) parts.push('поколение ' + (gl.count + 1));
    if (run.dead) parts.push('престол ждёт наследника');
    else if (onDeathbed(state, cfg)) parts.push('на смертном одре');
    return { line: parts.join(' · ') };
  }

  function next(state, now, cfg) {
    var run = state.run;
    var out = [];
    if (!run.dead) {
      var left = life(state, cfg) - 1 - run.ruler.age;
      if (left > 0) out.push({ id: 'deathbed', at: now + Math.ceil(left * cfg['age.offlineSec']) * 1000, text: run.ruler.name + ' слёг на смертный одр — проститесь с ним' });
    }
    if (run.campaign && run.campaign.to > now) out.push({ id: 'campaign', at: run.campaign.to, text: 'Войско вернулось — узнайте, чем кончился поход' });
    return out;
  }

  /** The chest of «Пассажир»: a caravan — chest.minutes of income and a chance of a Land. */
  function chest(state, rng, cfg) {
    var amount = minutesOf(state, cfg, cfg['chest.minutes']);
    gain(state, amount);
    var items = [{ title: 'Золото', amount: amount }];
    if (rng.next() < cfg['chest.landChance']) {
      state.run.lands += 1;
      items.push({ title: 'Земля', amount: 1 });
    }
    return { title: 'Караван с дороги', items: items };
  }

  function procedural(kind, rng) {
    if (kind === 'chronicle') {
      var t = rng.pick(FACTS);
      return { fact: t, text: rng.pick(C.chronicle[t]), procedural: true };
    }
    if (kind === 'names') {
      var g = rng.chance(0.5) ? 'm' : 'f';
      return { name: rng.pick(g === 'f' ? C.names.female : C.names.male), gender: g, procedural: true };
    }
    return null;
  }

  function validateStock(kind, item) {
    if (/https?:/.test(JSON.stringify(item))) return 'ссылка';
    if (kind === 'chronicle') {
      if (FACTS.indexOf(item.fact) < 0) return 'неизвестный факт ' + item.fact;
      var bad = null;
      String(item.text).replace(/\{([^}]*)\}/g, function (all, k) {
        if (SLOTS.indexOf(k) < 0) bad = k;
        return all;
      });
      if (bad !== null) return 'неизвестная подстановка {' + bad + '}';
    }
    if (kind === 'cards') {
      if (STOCK_EFFECTS.indexOf(item.aEffect) < 0 || STOCK_EFFECTS.indexOf(item.bEffect) < 0) return 'неизвестное действие карточки';
      if (item.aEffect === item.bEffect) return 'оба ответа одинаковы';
    }
    if (kind === 'names') {
      if (!/^[А-ЯЁ][а-яё]{2,13}$/.test(String(item.name))) return 'имя не из русских букв';
      if (item.gender !== 'm' && item.gender !== 'f') return 'нет пола';
      if (item.nick !== undefined && item.nick !== null && item.nick !== '') {
        if (!/^[А-ЯЁ][а-яё]{2,15}( [а-яё]{2,12})?$/.test(String(item.nick))) return 'прозвище не из русских букв';
        var nt = typeof item.trait === 'string' && trait(item.trait);
        if (!nt || nt.id !== item.trait) return 'прозвище без известной черты';
      }
    }
    return null;
  }

  function capBonusHours(state) { return 0; }

  // ---- the bot of the checks ------------------------------------------------------------------------------------

  var BOT_LAWS = ['elder', 'healers', 'majorat', 'steward', 'chronicler', 'nightwatch', 'treasury', 'chancellor', 'matchmaker', 'regency', 'voivode', 'indivisible'];

  /** A second of a sensible player: answers cards, marries, raises and picks the heir, buys. */
  function botPlay(state, cfg, now) {
    var run = state.run;
    if (run.dead) return 0;
    if (run.card) answer(state, cfg, canAfford(state, cfg, run.card.a.effect) && run.card.a.effect !== 'endure' ? 'a' : 'b', now);
    if (canMarry(state, cfg)) {
      if (!run.cands || !run.cands.length) makeCandidates(state, cfg);
      marry(state, cfg, preferred(state, run.cands), { now: now });
    }
    run.children.forEach(function (c) { if (!c.raised) raise(state, cfg, c.id, 'health', teachable(state, c)[0]); });
    var bestHeir = null;
    run.children.forEach(function (c) { if (!bestHeir || reignLeft(state, cfg, c) > reignLeft(state, cfg, bestHeir)) bestHeir = c; });
    if (bestHeir) run.heir = bestHeir.id;
    BOT_LAWS.forEach(function (id) { buyLaw(state, cfg, id); });
    var bought = 0;
    while (bought < 50 && buy(state, cfg)) bought++;
    if (canCampaign(state, cfg)) {
      var c = campaignInfo(state, cfg, 'war');
      if (c.chance > 0.45 && Big.gte(run.gold, Big.mul(c.price, 4))) startCampaign(state, cfg, 'war', now);
    }
    if (opened(state, 2)) fundScholar(state, cfg);
    if (opened(state, 3)) sendColony(state, cfg, 1, now);
    return bought;
  }

  return {
    use: use, init: init, tick: tick, offline: offline, prestigeGain: prestigeGain, bonus: bonus, onPrestige: onPrestige, migrate: migrate,
    validate: validate, summary: summary, next: next, chest: chest, procedural: procedural, validateStock: validateStock, capBonusHours: capBonusHours,
    // the screen and the checks
    GEN: GEN, EPOCH: EPOCH, STATS: STATS, RARE: RARE, STOCK_EFFECTS: STOCK_EFFECTS, FACTS: FACTS,
    income: income, rate: rate, boost: boost, multiplier: multiplier, tierIncome: tierIncome, cost: cost, maxCount: maxCount, buyHolding: buyHolding,
    courtCost: courtCost, buyCourt: buyCourt, best: best, buy: buy, tiers: tiers, nextMilestone: nextMilestone, reached: reached,
    stat: stat, life: life, onDeathbed: onDeathbed, nickOf: nickOf, trait: trait, inheritTraits: inheritTraits, childAge: childAge, coatOf: coatOf,
    greatness: greatness, legends: legends, glory: glory, gloryOf: gloryOf, deedList: deedList, deedCap: deedCap, share: share, hasLaw: hasLaw,
    lawState: lawState, buyLaw: buyLaw, canRepeal: canRepeal, repealLaw: repealLaw, epochIndex: epochIndex, opened: opened, round: round,
    canMarry: canMarry, makeCandidates: makeCandidates, marry: marry, preferred: preferred, raise: raise, teachable: teachable, setHeir: setHeir,
    heirOf: heirOf, reignLeft: reignLeft, answer: answer, effectText: effectText, effectCost: effectCost, effectChance: effectChance, canAfford: canAfford,
    campaignInfo: campaignInfo, canCampaign: canCampaign, startCampaign: startCampaign, scholarInfo: scholarInfo, fundScholar: fundScholar,
    colonyInfo: colonyInfo, sendColony: sendColony, pilgrimage: pilgrimage, minutesOf: minutesOf, genState: genState, reignYears: reignYears,
    compose: compose, botPlay: botPlay, step: step, addDeed: addDeed
  };
});
