// «Выживание в волнах» — the logic between the runs: the workshop, heroes, storm levels, shards,
// records, unlocks and achievements; the run itself is world.js (WaveWorld). Shared subset of
// JavaScript: it runs on the screen (window.GameSim), in the engine (Rhino, require) and in node.
// No class, no async, no f(...args), no for (let …); randomness only from the rng given.
//
// The state:
//   run.ws            levels of the workshop (the smelting «Переплавка» resets them)
//   layers.smelt      the prestige layer: its currency is the number of smeltings
//   meta.shards       shards (a big number as a string, though they stay small)
//   meta.live         the snapshot of a run in progress (WaveWorld.save) or null
//   meta.*            heroes, the storm, totals, records, the run of the day, data cards
// Nothing happens while the game is closed: offline gives nothing (the links give their own).
(function (root, make) {
  var node = typeof require === 'function' && typeof exports !== 'undefined';
  var api = node ? make(require('../engine/big.js'), require('../engine/rng.js'), require('./world.js')) : make(root.Big, root.Rng, root.WaveWorld);
  if (typeof exports !== 'undefined') { for (var k in api) exports[k] = api[k]; } else { root.GameSim = api; }
})(this, function (Big, Rng, World) {
  'use strict';

  var LAYER = 'smelt';
  var WORKSHOP = ['power', 'vitality', 'armor', 'speed', 'attract', 'luck', 'xp', 'loot', 'reroll', 'banish', 'wind'];
  var HEROES = ['wanderer', 'keeper', 'bomber', 'hunter', 'mechanic', 'hermit'];
  var MODES = ['normal', 'sprint', 'endless', 'daily'];
  var STOCK = ['daily', 'waves', 'cards'];

  function num(v, d) {
    var n = Number(v);
    return n === n && n !== Infinity && n !== -Infinity ? n : d;
  }

  function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }

  function zeros() {
    var ws = {};
    WORKSHOP.forEach(function (id) { ws[id] = 0; });
    return ws;
  }

  function freshMeta() {
    return {
      shards: '0e0', hero: 'wanderer', mode: 'normal', storm: 0, stormMax: 0,
      heroes: { wanderer: true }, endless: false, smelts: 0,
      totals: { runs: 0, wins: 0, deaths: 0, kills: 0, elites: 0, bosses: 0, hives: 0, seconds: 0, fusions: 0, bestLevel: 0, medkitless: 0 },
      best: {}, minutes: [], live: null, liveInfo: null, bonus: '', freeFusions: 0, cards: [], cardsDay: '',
      daily: null, last: null, wins: {}
    };
  }

  /** Fills what an older or a hand-made state lacks; returns the meta. */
  function fill(state) {
    state.run = state.run && typeof state.run === 'object' ? state.run : {};
    var ws = state.run.ws && typeof state.run.ws === 'object' ? state.run.ws : {};
    WORKSHOP.forEach(function (id) { ws[id] = Math.max(0, Math.round(num(ws[id], 0))); });
    state.run.ws = ws;
    state.meta = state.meta && typeof state.meta === 'object' ? state.meta : {};
    var m = state.meta;
    var d = freshMeta();
    for (var k in d) if (!own(m, k) || m[k] === undefined) m[k] = d[k];
    for (var t in d.totals) if (!own(m.totals, t)) m.totals[t] = 0;
    if (!Big.valid(m.shards)) m.shards = '0e0';
    if (HEROES.indexOf(m.hero) < 0 || !m.heroes[m.hero]) m.hero = 'wanderer';
    if (MODES.indexOf(m.mode) < 0) m.mode = 'normal';
    m.heroes.wanderer = true;
    return m;
  }

  // ---- the engine's contract ------------------------------------------------------------------------

  function init(ctx) {
    return { run: { ws: zeros() }, meta: freshMeta() };
  }

  /** Nothing grows while you look at the hub: the run lives on the screen (world.js). */
  function tick(state, dt, ctx) { return state; }

  /** No income of its own while the game is closed (the spec's open question): only the links. */
  function offline(state, sec, ctx) { return { events: [] }; }

  function allMaxed(state, cfg) {
    var ws = state.run.ws || {};
    for (var i = 0; i < WORKSHOP.length; i++) {
      var id = WORKSHOP[i];
      if ((ws[id] || 0) < maxOf(id, cfg, state)) return false;
    }
    return true;
  }

  /** «Переплавка»: one when every workshop upgrade is at its maximum and no run is in progress. */
  function prestigeGain(state, layerId, cfg) {
    if (layerId !== LAYER) return Big.ZERO;
    fill(state);
    if (state.meta.live) return Big.ZERO;
    return allMaxed(state, cfg || {}) ? Big.of(1) : Big.ZERO;
  }

  /** The shards multiplier of `amount` smeltings. */
  function bonus(state, layerId, amount, cfg) {
    return 1 + Big.toNumber(Big.of(amount, 0)) * num(cfg && cfg['smelt.bonus'], 0.1);
  }

  function onPrestige(state, layerId, before, ctx) {
    var m = fill(state);
    m.smelts = (m.smelts || 0) + 1;
  }

  function migrate(state, fromVer) {
    fill(state);
    return state;
  }

  function validate(state) {
    if (!state.run || !state.run.ws || typeof state.run.ws !== 'object') return 'нет мастерской (run.ws)';
    var m = state.meta || {};
    if (!Big.valid(m.shards)) return 'осколки не число';
    if (m.live !== null && m.live !== undefined) {
      if (typeof m.live !== 'object' || !m.live.s || typeof m.live.s !== 'object') return 'снимок забега испорчен';
      if (m.live.v !== World.VERSION) return 'снимок забега другой версии: ' + m.live.v;
    }
    return null;
  }

  function smeltCount(state) {
    var layer = state.layers && state.layers[LAYER];
    return layer ? Big.toNumber(Big.of(layer.currency, 0)) : 0;
  }

  function clock(sec) {
    sec = Math.max(0, Math.floor(sec));
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  function summary(state, cfg) {
    var m = fill(state);
    var shards = Math.floor(Big.toNumber(Big.of(m.shards, 0)));
    var best = m.best.normal ? clock(m.best.normal.T) : '';
    var parts = ['Осколков ' + shards];
    if (m.stormMax > 0) parts.push('шторм ' + m.stormMax);
    if (best) parts.push('рекорд ' + best);
    if (m.live) parts.push('забег на паузе');
    return { line: parts.join(' · ') };
  }

  /** The chest of «Пассажир» (a trip of 20 minutes and more): shards and a free fusion for the next run. */
  function chest(state, rng, cfg) {
    var m = fill(state);
    var shards = Math.round(num(cfg && cfg['chest.shards'], 25));
    m.shards = Big.str(Big.add(Big.of(m.shards, 0), shards));
    var items = [{ title: 'Осколки', amount: String(shards) }];
    var max = Math.round(num(cfg && cfg['chest.fusionsMax'], 3));
    if (m.freeFusions < max) {
      m.freeFusions++;
      items.push({ title: 'Бесплатное сращение на следующий забег', amount: '1' });
    }
    return { title: 'Сундук попутчика', items: items };
  }

  // ---- the workshop ---------------------------------------------------------------------------------

  function cost(state, id, cfg) {
    var lvl = (state.run.ws && state.run.ws[id]) || 0;
    return Math.ceil(num(cfg['ws.' + id + '.base'], 10) * Math.pow(num(cfg['ws.' + id + '.growth'], 1.3), lvl));
  }

  // The upgrades that grow without an end: every smelting lifts their ceiling (`smelt.levels`).
  // The rest are bounded by what they are: armour, speed, charges, the one revival.
  var GROWING = ['power', 'vitality', 'attract', 'luck', 'xp', 'loot'];

  /** The ceiling of an upgrade; with a state — the one of this player, lifted by the smeltings done. */
  function maxOf(id, cfg, state) {
    var max = Math.round(num(cfg['ws.' + id + '.max'], 1));
    if (state && GROWING.indexOf(id) >= 0) max += Math.round(num(cfg['smelt.levels'], 0)) * smeltCount(state);
    return max;
  }

  function shardsOf(state) { return Big.toNumber(Big.of(state.meta.shards, 0)); }

  function canBuy(state, id, cfg) {
    fill(state);
    if (WORKSHOP.indexOf(id) < 0 || (state.run.ws[id] || 0) >= maxOf(id, cfg, state)) return false;
    return shardsOf(state) >= cost(state, id, cfg);
  }

  function buyUpgrade(state, id, cfg) {
    if (!canBuy(state, id, cfg)) return false;
    var price = cost(state, id, cfg);
    state.meta.shards = Big.str(Big.sub(Big.of(state.meta.shards, 0), price));
    state.run.ws[id] = (state.run.ws[id] || 0) + 1;
    return true;
  }

  /** The bot's buy: the cheapest upgrade it can pay for (checks-kit calls buy(state, cfg)). */
  function buy(state, cfg) {
    fill(state);
    var best = '';
    var price = Infinity;
    WORKSHOP.forEach(function (id) {
      if (!canBuy(state, id, cfg)) return;
      var c = cost(state, id, cfg);
      if (c < price) {
        price = c;
        best = id;
      }
    });
    return best ? buyUpgrade(state, best, cfg) : false;
  }

  // ---- heroes, modes, the storm -----------------------------------------------------------------

  function canMode(state, mode) {
    var m = fill(state);
    if (mode === 'endless') return !!m.endless;
    return MODES.indexOf(mode) >= 0;
  }

  function choose(state, what, value) {
    var m = fill(state);
    if (what === 'hero' && m.heroes[value]) m.hero = value;
    else if (what === 'mode' && canMode(state, value)) m.mode = value;
    else if (what === 'storm') m.storm = Math.max(0, Math.min(m.stormMax, Math.round(num(value, 0))));
    else return false;
    return true;
  }

  /** How far each locked hero is from being unlocked: [{id, have, need, text}]. */
  function unlockProgress(state, cfg) {
    var m = fill(state);
    var out = [];
    if (!m.heroes.keeper) out.push({ id: 'keeper', have: Math.floor(m.best.normal ? m.best.normal.T : 0), need: num(cfg['unlock.keeper.sec'], 180), text: 'Пережить ' + clock(num(cfg['unlock.keeper.sec'], 180)) });
    if (!m.heroes.bomber) out.push({ id: 'bomber', have: m.totals.kills, need: num(cfg['unlock.bomber.kills'], 2000), text: 'Убить врагов всего' });
    if (!m.heroes.hunter) out.push({ id: 'hunter', have: m.totals.medkitless, need: 1, text: 'Победить без аптечек' });
    if (!m.heroes.mechanic) out.push({ id: 'mechanic', have: 0, need: 1, text: 'Взять Множитель 2 в одном забеге' });
    if (!m.heroes.hermit) out.push({ id: 'hermit', have: Math.min(m.stormMax, num(cfg['unlock.hermit.storm'], 5)), need: num(cfg['unlock.hermit.storm'], 5), text: 'Победить на ступени шторма ' + num(cfg['unlock.hermit.storm'], 5) });
    return out;
  }

  // ---- the run of the day and the stock ---------------------------------------------------------

  var RULE_TITLES = {
    swarm: 'Рой', giants: 'Великаны', glass: 'Стекло', haste: 'Спешка', elites: 'Двойная элита', rich: 'Богатство',
    dry: 'Без аптечек', many: 'Лишний снаряд', pull: 'Тяга', heavy: 'Тяжесть', bombers: 'Подрывники', calm: 'Затишье'
  };

  function dayKey(ms) {
    var d = new Date(ms);
    var mm = d.getMonth() + 1;
    var dd = d.getDate();
    return d.getFullYear() + '-' + (mm < 10 ? '0' : '') + mm + '-' + (dd < 10 ? '0' : '') + dd;
  }

  function pickRules(rng) {
    var list = World.DAILY.slice();
    var out = [];
    while (out.length < 3 && list.length) {
      var i = Math.floor(rng.next() * list.length);
      var r = list[i];
      list.splice(i, 1);
      // Opposites do not come together.
      if ((r === 'swarm' && out.indexOf('calm') >= 0) || (r === 'calm' && out.indexOf('swarm') >= 0)) continue;
      out.push(r);
    }
    return out;
  }

  /** The run of the day for `day`: the seed from the date, the rules from the stock item or from the date. */
  function daily(state, day, item) {
    var m = fill(state);
    if (m.daily && m.daily.day === day) return m.daily;
    var seed = Rng.hash('wave-survival:' + day) >>> 0;
    var rules = item && Array.isArray(item.rules) && !validateStock('daily', item) ? item.rules.slice(0, 3) : pickRules(Rng.make(seed));
    var title = item && item.title && !validateStock('daily', item) ? String(item.title) : rules.map(function (r) { return RULE_TITLES[r]; }).join(', ');
    var keep = m.daily && m.daily.history ? m.daily.history.slice(-13) : [];
    if (m.daily && m.daily.best) keep.push({ day: m.daily.day, title: m.daily.title, best: m.daily.best });
    m.daily = { day: day, seed: seed, rules: rules, title: title, waves: null, best: null, runs: 0, history: keep };
    // The look of the day's horde the model chose (a GameArt look); the screen checks it again.
    var hd = item && item.horde && typeof item.horde === 'object' && !validateStock('daily', item) ? item.horde : null;
    if (hd && typeof hd.mask === 'string' && typeof hd.hue === 'number') {
      m.daily.horde = { mask: hd.mask, hue: hd.hue };
      if (typeof hd.accent === 'number') m.daily.horde.accent = hd.accent;
      if (typeof hd.light === 'string') m.daily.horde.light = hd.light;
    }
    return m.daily;
  }

  /** Puts a wave set from the stock into today's run (before its first start). */
  function dailyWaves(state, item) {
    var m = fill(state);
    if (!m.daily || m.daily.runs > 0 || !item || validateStock('waves', item)) return false;
    m.daily.waves = item.waves.slice(0, 10);
    m.daily.wavesTitle = String(item.title || '');
    return true;
  }

  /** A data card from the stock into the pool of the runs (the oldest leaves when the pool is full). */
  function addCard(state, item, cfg, day) {
    var m = fill(state);
    if (validateStock('cards', item)) return false;
    var keep = Math.round(num(cfg['cards.keep'], 6));
    if (keep <= 0) return false;
    m.cards.push({ title: String(item.title), rarity: item.rarity, max: Math.round(num(item.max, 3)), effects: item.effects.slice(0, 3), text: String(item.text || '') });
    while (m.cards.length > keep) m.cards.shift();
    if (day) m.cardsDay = day;
    return true;
  }

  var BRICK_LIMIT = { damage: 0.5, cooldown: 0.5, projectiles: 1, area: 0.5, duration: 0.5, speed: 0.5, pickup: 0.5, xp: 0.5, luck: 20, regen: 1, armor: 1, hp: 40, crit: 0.5, slow: 0.5, freeze: 0.5 };

  function validateStock(kind, item) {
    if (!item || typeof item !== 'object') return 'не объект';
    if (kind === 'daily') {
      if (!Array.isArray(item.rules) || item.rules.length !== 3) return 'нужно ровно три правила';
      for (var i = 0; i < 3; i++) {
        if (World.DAILY.indexOf(item.rules[i]) < 0) return 'неизвестное правило ' + item.rules[i];
        if (item.rules.indexOf(item.rules[i]) !== i) return 'правило дважды';
      }
      if (item.rules.indexOf('swarm') >= 0 && item.rules.indexOf('calm') >= 0) return '«Рой» и «Затишье» вместе';
      return null;
    }
    if (kind === 'waves') {
      if (!Array.isArray(item.waves) || item.waves.length !== 10) return 'нужно десять волн';
      for (var w = 0; w < 10; w++) {
        var text = String(item.waves[w] || '');
        var parts = text.split(/\s+/).filter(function (p) { return p; });
        var kinds = 0;
        for (var p = 0; p < parts.length; p++) {
          if (parts[p] === 'side') continue;
          var mm = /^([a-z]+):(\d+)$/.exec(parts[p]);
          if (!mm) return 'волна ' + (w + 1) + ': не разобрать «' + parts[p] + '»';
          var k = World.ENEMIES.indexOf(mm[1]);
          if (k < 0 || mm[1] === 'hive' || mm[1] === 'reaper') return 'волна ' + (w + 1) + ': нельзя «' + mm[1] + '»';
          if (Number(mm[2]) < 1 || Number(mm[2]) > 20) return 'волна ' + (w + 1) + ': вес от 1 до 20';
          kinds++;
        }
        if (!kinds) return 'волна ' + (w + 1) + ' пустая';
      }
      return null;
    }
    if (kind === 'cards') {
      if (typeof item.title !== 'string' || item.title.length < 3 || item.title.length > 30) return 'название от 3 до 30 знаков';
      if (World.RARITY.indexOf(item.rarity) < 0) return 'неизвестная редкость';
      var max = Number(item.max);
      if (!(max >= 1 && max <= 5) || max % 1) return 'уровней от 1 до 5';
      if (!Array.isArray(item.effects) || !item.effects.length || item.effects.length > 3) return 'эффектов от 1 до 3';
      var power = 0;
      for (var e = 0; e < item.effects.length; e++) {
        var ef = item.effects[e];
        if (!ef || World.BRICKS.indexOf(ef.stat) < 0) return 'неизвестный кирпичик ' + (ef && ef.stat);
        var v = Number(ef.value);
        if (!(v === v) || v === 0) return 'пустой эффект';
        var lim = BRICK_LIMIT[ef.stat];
        if (Math.abs(v) > lim) return ef.stat + ': не больше ' + lim + ' за уровень';
        if (ef.stat === 'projectiles' && v % 1) return 'снарядов — целое';
        power += Math.abs(v) / lim;
      }
      // A card is a trade, not a gift: the sum of its effects (as shares of their limits) at most 1.
      if (power > 1.0001) return 'слишком сильная карточка';
      return null;
    }
    return 'неизвестный вид ' + kind;
  }

  function procedural(kind, rng) {
    if (kind === 'daily') {
      var rules = pickRules(rng);
      return { title: rules.map(function (r) { return RULE_TITLES[r]; }).join(', '), rules: rules };
    }
    if (kind === 'waves') {
      var pool = ['crawler', 'runner', 'splitter', 'shooter', 'ram', 'shield', 'leech', 'bomber'];
      var waves = [];
      for (var w = 0; w < 10; w++) {
        var open = Math.min(pool.length, 2 + Math.floor(w * 0.7));
        var n = 2 + Math.floor(rng.next() * 3);
        var parts = [];
        if (rng.next() < 0.2) parts.push('side');
        var used = {};
        parts.push('crawler:' + (3 + Math.floor(rng.next() * 4)));
        used.crawler = 1;
        for (var k = 1; k < n; k++) {
          var id = pool[Math.floor(rng.next() * open)];
          if (used[id]) continue;
          used[id] = 1;
          parts.push(id + ':' + (1 + Math.floor(rng.next() * 3)));
        }
        waves.push(parts.join(' '));
      }
      return { title: 'Случайные волны', waves: waves };
    }
    if (kind === 'cards') {
      var a = World.BRICKS[Math.floor(rng.next() * World.BRICKS.length)];
      var b = World.BRICKS[Math.floor(rng.next() * World.BRICKS.length)];
      if (b === a) b = a === 'damage' ? 'speed' : 'damage';
      var va = BRICK_LIMIT[a] * 0.6;
      var vb = -BRICK_LIMIT[b] * 0.2;
      if (a === 'projectiles') {
        va = 1;
        vb = -BRICK_LIMIT[b] * 0.4;
        if (b === 'projectiles') b = 'cooldown';
      }
      if (b === 'projectiles' || b === 'armor') b = 'speed';
      vb = -BRICK_LIMIT[b] * (a === 'projectiles' ? 0 : 0.2);
      var effects = [{ stat: a, value: Math.round(va * 100) / 100 }];
      if (vb) effects.push({ stat: b, value: Math.round(vb * 100) / 100 });
      return { title: 'Находка ' + (1 + Math.floor(rng.next() * 99)), rarity: 'rare', max: 3, effects: effects, text: '' };
    }
    return null;
  }

  // ---- a run: start and finish -----------------------------------------------------------------------

  /** The config a run works with: the day's waves over the game's. */
  function runConfig(cfg, info) {
    if (!info || !info.waves) return cfg;
    var out = {};
    for (var k in cfg) out[k] = cfg[k];
    for (var i = 0; i < 10 && i < info.waves.length; i++) out['wave.' + (i + 1)] = info.waves[i];
    return out;
  }

  /**
   * Options for WaveWorld.create and the info to keep beside the snapshot. Takes the step bonus
   * and the free fusions into the run. o: {mode, seed, day, viewW, viewH}.
   */
  function startRun(state, cfg, o) {
    var m = fill(state);
    o = o || {};
    var mode = canMode(state, o.mode || m.mode) ? o.mode || m.mode : 'normal';
    var info = { mode: mode, hero: m.hero, storm: mode === 'daily' ? 0 : m.storm, waves: null, day: '', at: o.now || 0 };
    var seed = (Number(o.seed) >>> 0) || 1;
    var rules = [];
    if (mode === 'daily' && m.daily) {
      seed = m.daily.seed;
      rules = m.daily.rules.slice();
      info.waves = m.daily.waves || null;
      info.day = m.daily.day;
      m.daily.runs++;
    }
    var opts = {
      seed: seed, hero: m.hero, mode: mode, storm: info.storm, ws: state.run.ws, bonus: m.bonus || '',
      cards: m.cards, rules: rules, freeFusions: m.freeFusions, viewW: o.viewW || 0, viewH: o.viewH || 0
    };
    m.bonus = '';
    m.freeFusions = 0;
    m.liveInfo = info;
    return { opts: opts, info: info, cfg: runConfig(cfg, info) };
  }

  /** Shards for a run: kills, minutes, the boss, elites, gold; the storm, the workshop, smelting, the links. */
  function shardsFor(state, r, cfg, mult) {
    var base = r.kills / num(cfg['shards.perKills'], 40) + num(cfg['shards.perMinute'], 5) * r.time / 60 +
      num(cfg['shards.boss'], 30) * r.bosses + num(cfg['shards.hive'], 15) * r.hives + num(cfg['shards.elite'], 10) * r.elites +
      r.gold / num(cfg['shards.goldPer'], 20);
    var k = (1 + num(cfg['storm.bonus'], 0.12) * (r.storm || 0)) * (1 + num(cfg['ws.loot.v'], 0.1) * ((state.run.ws && state.run.ws.loot) || 0)) *
      bonus(state, LAYER, smeltCount(state), cfg) * (num(mult, 1) || 1);
    return Math.max(0, Math.floor(base * k));
  }

  function better(a, b, mode) {
    if (!b) return true;
    if (mode === 'endless') return a.time > b.time;
    if (a.won !== b.won) return a.won;
    if (Math.floor(a.T) !== Math.floor(b.T)) return a.T > b.T;
    return a.kills > b.kills;
  }

  /**
   * The end of a run (WaveWorld.result): shards, totals, records, unlocks, the next storm level.
   * Returns {shards, unlocked: [hero ids], achievements: [ids], stormUp, record, endless}.
   */
  function finish(state, r, cfg, ctx) {
    var m = fill(state);
    ctx = ctx || {};
    var out = { shards: 0, unlocked: [], achievements: [], stormUp: false, record: false, endless: false, freeFusionsBack: 0 };
    var mode = (m.liveInfo && m.liveInfo.mode) || r.mode;
    out.shards = shardsFor(state, r, cfg, ctx.mult);
    m.shards = Big.str(Big.add(Big.of(m.shards, 0), out.shards));
    var t = m.totals;
    t.runs++;
    if (r.won) t.wins++;
    else t.deaths++;
    t.kills += r.kills;
    t.elites += r.elites;
    t.bosses += r.bosses;
    t.hives += r.hives;
    t.seconds += Math.round(r.time);
    t.fusions += r.fusions.length;
    if (r.level > t.bestLevel) t.bestLevel = r.level;
    if (r.won && r.medkits === 0) t.medkitless++;
    m.freeFusions = Math.min(Math.round(num(cfg['chest.fusionsMax'], 3)), m.freeFusions + Math.max(0, r.freeFusionsLeft || 0));
    var rec = { T: Math.round(r.T * 10) / 10, time: Math.round(r.time * 10) / 10, kills: r.kills, level: r.level, won: r.won, hero: r.hero, storm: r.storm, at: ctx.now || 0 };
    if (better(rec, m.best[mode], mode)) {
      out.record = !!m.best[mode];
      m.best[mode] = rec;
    }
    if (mode === 'normal') {
      // The best result at each minute of the timeline: kills and the level at the minute mark.
      for (var i = 0; i < r.minutes.length; i++) {
        var have = m.minutes[i];
        var mk = r.minutes[i];
        if (!have || mk[0] > have[0]) m.minutes[i] = [mk[0], mk[1]];
      }
    }
    if (mode === 'daily' && m.daily) {
      if (better(rec, m.daily.best, 'daily')) m.daily.best = rec;
    }
    var key = mode + ':' + (r.storm || 0);
    if (r.won) m.wins[key] = (m.wins[key] || 0) + 1;
    // The next storm level after a win on the highest open one (the normal run and «Перегон»).
    var top = Math.round(num(cfg['storm.max'], 15));
    if (r.won && (mode === 'normal' || mode === 'sprint') && r.storm === m.stormMax && m.stormMax < top) {
      m.stormMax++;
      out.stormUp = true;
    }
    if (r.bosses > 0 && !m.endless) {
      m.endless = true;
      out.endless = true;
    }
    // Heroes.
    var opened = function (id, ok) {
      if (ok && !m.heroes[id]) {
        m.heroes[id] = true;
        out.unlocked.push(id);
      }
    };
    opened('keeper', r.T >= num(cfg['unlock.keeper.sec'], 180));
    opened('bomber', t.kills >= num(cfg['unlock.bomber.kills'], 2000));
    opened('hunter', r.won && r.medkits === 0);
    opened('mechanic', r.multi2);
    opened('hermit', r.won && r.storm >= num(cfg['unlock.hermit.storm'], 5));
    // Achievements (the screen gives them with g.achieve).
    var a = out.achievements;
    if (r.won) a.push('five-minutes');
    if (r.noScratch) a.push('no-scratch');
    if (r.won && r.onlyPulse) a.push('hedgehog');
    if (r.won && r.storm >= 15) a.push('storm-15');
    if (r.kills >= num(cfg['achieve.thousand'], 1000)) a.push('thousand');
    if (r.fusions.length) a.push('first-fusion');
    if (r.bosses > 0) a.push('reaper');
    if (HEROES.every(function (h) { return m.heroes[h]; })) a.push('all-heroes');
    if (mode === 'endless' && r.time >= 600) a.push('endless-10');
    if (mode === 'sprint' && r.won) a.push('sprint');
    if (mode === 'daily') a.push('daily');
    m.last = {
      won: r.won, mode: mode, T: rec.T, time: rec.time, kills: r.kills, level: r.level, shards: out.shards, hero: r.hero, storm: r.storm,
      bosses: r.bosses, elites: r.elites, fusions: r.fusions.slice(), weapons: r.weapons.slice(), record: out.record, stormUp: out.stormUp,
      unlocked: out.unlocked.slice(), endless: out.endless, at: ctx.now || 0
    };
    m.live = null;
    m.liveInfo = null;
    return out;
  }

  /** Throws away a paused run: nothing is credited (the owner confirmed). */
  function abandon(state) {
    var m = fill(state);
    m.live = null;
    m.liveInfo = null;
  }

  // ---- texts the screen shows on the cards ---------------------------------------------------------

  function pct(x) { return Math.round(x * 100) + ' %'; }

  /**
   * One line of a card's effect in numbers: what changes from level `from` to `to`
   * (content: content/items.json — names, per-level words).
   */
  function effectLine(kind, id, from, to, cfg, card) {
    var c = cfg;
    if (kind === 'x') {
      if (!card) return '';
      return card.effects.map(function (e) { return brickText(e.stat, e.value); }).join(', ');
    }
    if (kind === 'gold') return '+' + num(c['skip.gold'], 15) + ' золота';
    if (kind === 'heal') return '+' + num(c['medkit.heal'], 30) + ' здоровья';
    if (kind === 'w') {
      var p = 'w.' + id + '.';
      var base = num(c[p + 'dmg'], 10);
      var lvl = num(c[p + 'lvlDmg'], 0.2);
      var dmg = function (l) { return Math.round(base * (1 + lvl * (l - 1)) * 10) / 10; };
      var counts = World.countAtLevel(String(c[p + 'countAt'] || '').split(/[\s,;]+/).filter(function (x) { return x; }).map(Number), to) -
        World.countAtLevel(String(c[p + 'countAt'] || '').split(/[\s,;]+/).filter(function (x) { return x; }).map(Number), from);
      if (from === 0) {
        var cd = c[p + 'cd'];
        return 'урон ' + dmg(1) + (cd ? ', раз в ' + cd + ' с' : '');
      }
      var parts = ['урон ' + dmg(from) + ' → ' + dmg(to)];
      if (counts > 0) parts.push(id === 'blades' ? '+1 лезвие' : id === 'chain' ? '+1 прыжок' : id === 'beacon' ? '+1 луч' : id === 'drones' ? '+1 дрон' : id === 'seeds' ? '+1 мина' : '+1 снаряд');
      else if (id === 'blades') parts.push('радиус +' + pct(num(c['w.blades.radiusLvl'], 0.15)));
      if (id === 'needles' && to === num(c['w.needles.behindAt'], 6)) parts.push('иглы и за спину');
      return parts.join(', ');
    }
    var v = num(c['p.' + id + '.v'], 0.1);
    var words = {
      armor: function (l) { return '−' + l * v + ' к урону'; },
      core: function (l) { return '+' + pct(l * v) + ' здоровья'; },
      accel: function (l) { return '−' + pct(l * v) + ' перезарядки'; },
      lens: function (l) { return '+' + pct(l * v) + ' размера'; },
      magnet: function (l) { return '+' + pct(l * v) + ' радиуса сбора'; },
      soles: function (l) { return '+' + pct(l * v) + ' скорости'; },
      multi: function (l) { return '+' + l * v + ' снаряд' + (l * v > 1 ? 'а' : '') + ' всему оружию'; },
      regen: function (l) { return '+' + Math.round(l * v * 10) / 10 + ' здоровья в секунду'; },
      coin: function (l) { return '+' + l * v + ' удачи'; },
      sharp: function (l) { return '+' + pct(l * v) + ' урона'; },
      fuse: function (l) { return '+' + pct(l * v) + ' длительности'; },
      pupil: function (l) { return '+' + pct(l * v) + ' опыта'; },
      thorns: function (l) { return pct(l * v) + ' урона касания обратно'; },
      scope: function (l) { return '+' + pct(l * v) + ' шанса крита'; }
    };
    var f = words[id];
    if (!f) return '';
    return from ? f(from) + ' → ' + f(to).replace(/^[+−]/, function (s) { return s; }) : f(to);
  }

  var BRICK_WORDS = {
    damage: 'урон', cooldown: 'перезарядка быстрее', projectiles: 'снаряд', area: 'размер', duration: 'длительность', speed: 'скорость',
    pickup: 'радиус сбора', xp: 'опыт', luck: 'удача', regen: 'здоровья в секунду', armor: 'броня', hp: 'здоровье', crit: 'шанс крита',
    slow: 'шанс замедлить', freeze: 'шанс заморозить'
  };

  function brickText(stat, v) {
    var sign = v > 0 ? '+' : '−';
    var a = Math.abs(v);
    var flat = stat === 'projectiles' || stat === 'luck' || stat === 'regen' || stat === 'armor' || stat === 'hp';
    return sign + (flat ? Math.round(a * 10) / 10 : Math.round(a * 100) + ' %') + ' ' + BRICK_WORDS[stat];
  }

  return {
    LAYER: LAYER, WORKSHOP: WORKSHOP, GROWING: GROWING, HEROES: HEROES, MODES: MODES, STOCK: STOCK, RULE_TITLES: RULE_TITLES, World: World,
    init: init, tick: tick, offline: offline, prestigeGain: prestigeGain, bonus: bonus, onPrestige: onPrestige, migrate: migrate,
    validate: validate, summary: summary, chest: chest, procedural: procedural, validateStock: validateStock,
    fill: fill, cost: cost, canBuy: canBuy, buyUpgrade: buyUpgrade, buy: buy, maxOf: maxOf, allMaxed: allMaxed, smeltCount: smeltCount,
    canMode: canMode, choose: choose, unlockProgress: unlockProgress, dayKey: dayKey, daily: daily, dailyWaves: dailyWaves, addCard: addCard,
    runConfig: runConfig, startRun: startRun, shardsFor: shardsFor, finish: finish, abandon: abandon, clock: clock,
    effectLine: effectLine, brickText: brickText
  };
});
