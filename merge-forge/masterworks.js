// «Коллекция шедевров»: rare pieces of gear a beaten boss may leave. ES5 / Rhino / browser.
// Every piece is unique: the game rolls its slot, rarity and effects; its name, story, motto and icon
// come from the model (the stock kind «masterworks»), filled in by the screen (setFlavor).
// Only the pieces on the stand work: one in each slot, two rings. Levels, the stand and the forge of
// masterworks (drop chance, a second drop, quality, room, the strength of each slot) are kept in
// meta.masterworks: they outlive every reforge and the star metal. Everything is paid in coals.
(function (root, make) {
  var api = typeof require === 'function' && typeof exports !== 'undefined' ? make(require('../engine/big.js')) : make(root.Big);
  if (typeof exports !== 'undefined') { for (var k in api) exports[k] = api[k]; } else root.MFMasterworks = api;
})(this, function (Big) {
  'use strict';

  var SLOTS = ['sword', 'shield', 'helmet', 'chest', 'legs', 'boots', 'ring'];
  var SLOT_TITLE = { sword: 'Меч', shield: 'Щит', helmet: 'Шлем', chest: 'Нагрудник', legs: 'Поножи', boots: 'Сапоги', ring: 'Кольцо' };
  // The places of the stand: one for each slot, two for the rings.
  var STAND = ['sword', 'shield', 'helmet', 'chest', 'legs', 'boots', 'ring1', 'ring2'];
  function slotOf(place) { return place === 'ring1' || place === 'ring2' ? 'ring' : place; }

  var RARITY = [
    { id: 'good', title: 'Добротный', weight: 62, mult: 1, extra: 1, cost: 3, salvage: 1 },
    { id: 'rare', title: 'Редкий', weight: 27, mult: 1.5, extra: 2, cost: 5, salvage: 2 },
    { id: 'legend', title: 'Легендарный', weight: 9, mult: 2.3, extra: 3, cost: 9, salvage: 4 },
    { id: 'myth', title: 'Мифический', weight: 2, mult: 3.5, extra: 3, cost: 15, salvage: 8 }
  ];
  var RARITY_BY = {};
  RARITY.forEach(function (r, i) { r.index = i; RARITY_BY[r.id] = r; });

  // The effects, what one gives on a plain piece of level 1 (mw.stat.<kind> in the settings), and the
  // most the stand gives together where more would break the game (the rest have no ceiling).
  var STATS = {
    damage: { base: 0.15, label: 'Весь урон: +{}%', pct: true },
    critMult: { base: 0.1, label: 'Сила критов: +{}%', pct: true },
    critChance: { base: 0.02, label: 'Шанс крита: +{} п.п.', pct: true },
    bossDamage: { base: 0.2, label: 'Урон по боссам: +{}%', pct: true },
    bossTime: { base: 2, label: 'Время босса: +{} с', pct: false },
    enemyHp: { base: 0.03, label: 'Здоровье врагов: −{}%', pct: true, cap: 0.5 },
    gold: { base: 0.15, label: 'Золото за врагов: +{}%', pct: true },
    bossGold: { base: 0.25, label: 'Золото с боссов: +{}%', pct: true },
    offline: { base: 0.1, label: 'Офлайн-золото: +{}%', pct: true },
    waveSkip: { base: 0.02, label: 'Шанс перескочить волну: {}%', pct: true, cap: 0.5 },
    forgeSpeed: { base: 0.06, label: 'Скорость ковки: +{}%', pct: true },
    tapPower: { base: 0.15, label: 'Сила ручного удара: +{}%', pct: true },
    skillPower: { base: 0.1, label: 'Сила приёмов: +{}%', pct: true },
    skillCooldown: { base: 0.05, label: 'Приёмы восстанавливаются быстрее на {}%', pct: true, cap: 0.6 },
    coals: { base: 0.05, label: 'Углей за перековку: +{}%', pct: true }
  };
  var KINDS = Object.keys(STATS);
  // The main effect of each slot (the first) and the ones a piece may add.
  var POOLS = {
    sword: ['damage', 'critMult', 'bossDamage', 'critChance'],
    shield: ['bossTime', 'enemyHp', 'bossDamage', 'offline'],
    helmet: ['critChance', 'critMult', 'skillCooldown', 'skillPower'],
    chest: ['gold', 'bossGold', 'offline', 'coals'],
    legs: ['waveSkip', 'gold', 'forgeSpeed', 'enemyHp'],
    boots: ['forgeSpeed', 'tapPower', 'waveSkip', 'skillCooldown'],
    ring: ['skillPower', 'coals', 'gold', 'damage', 'critMult', 'skillCooldown']
  };
  // The forge of masterworks: nodes with no last level, bought with coals.
  var NODES = [
    { id: 'chance', title: 'Чутьё на добычу', text: 'Шанс шедевра с босса', cost: 5, growth: 1.8 },
    { id: 'double', title: 'Двойная добыча', text: 'Шанс второго шедевра с того же босса', cost: 10, growth: 2 },
    { id: 'quality', title: 'Глаз оценщика', text: 'Редкие, легендарные и мифические выпадают чаще', cost: 8, growth: 1.9 },
    { id: 'capacity', title: 'Просторная оружейная', text: 'Больше мест в инвентаре', cost: 4, growth: 1.7 },
    { id: 'sword', title: 'Мастер мечей', text: 'Эффекты мечей сильнее', cost: 6, growth: 1.8, slot: true },
    { id: 'shield', title: 'Мастер щитов', text: 'Эффекты щитов сильнее', cost: 6, growth: 1.8, slot: true },
    { id: 'helmet', title: 'Мастер шлемов', text: 'Эффекты шлемов сильнее', cost: 6, growth: 1.8, slot: true },
    { id: 'chest', title: 'Мастер доспехов', text: 'Эффекты нагрудников сильнее', cost: 6, growth: 1.8, slot: true },
    { id: 'legs', title: 'Мастер поножей', text: 'Эффекты поножей сильнее', cost: 6, growth: 1.8, slot: true },
    { id: 'boots', title: 'Мастер сапог', text: 'Эффекты сапог сильнее', cost: 6, growth: 1.8, slot: true },
    { id: 'ring', title: 'Ювелир', text: 'Эффекты колец сильнее', cost: 6, growth: 1.8, slot: true }
  ];
  var NODE_BY = {};
  NODES.forEach(function (n) { NODE_BY[n.id] = n; });

  function num(v, d) { var n = Number(v); return n === n && isFinite(n) ? n : d; }
  function setting(cfg, key, d) { return num(cfg && cfg[key], d); }
  function wholeLevel(n) { return typeof n === 'number' && n >= 0 && Math.floor(n) === n && n <= 1000000; }

  /** A number in [0, 1) that follows from three integers alone (the same as the simulation's). */
  function mul32(a, b) { return ((a & 0xffff) * b + ((((a >>> 16) * b) & 0xffff) << 16)) >>> 0; }
  function hash01(a, b, c) {
    var h = 2166136261;
    var xs = [a, b, c];
    for (var k = 0; k < xs.length; k++) {
      var x = Math.floor(Math.abs(Number(xs[k]) || 0)) >>> 0;
      for (var i = 0; i < 4; i++) h = mul32((h ^ ((x >>> (i * 8)) & 255)) >>> 0, 16777619);
    }
    h = mul32((h ^ (h >>> 13)) >>> 0, 0x5bd1e995);
    h = (h ^ (h >>> 15)) >>> 0;
    return h / 4294967296;
  }

  function ensure(state) {
    state.meta = state.meta || {};
    var m = state.meta.masterworks;
    if (!m || typeof m !== 'object' || Array.isArray(m)) m = state.meta.masterworks = {};
    if (m.version === undefined) m.version = 1;
    if (m.serial === undefined) m.serial = 0;
    if (m.drops === undefined) m.drops = 0;
    if (!m.items || typeof m.items !== 'object' || Array.isArray(m.items)) m.items = {};
    if (!m.stand || typeof m.stand !== 'object' || Array.isArray(m.stand)) m.stand = {};
    STAND.forEach(function (p) { if (m.stand[p] === undefined) m.stand[p] = ''; });
    if (!m.up || typeof m.up !== 'object' || Array.isArray(m.up)) m.up = {};
    NODES.forEach(function (n) { if (m.up[n.id] === undefined) m.up[n.id] = 0; });
    return state;
  }
  function data(state) { ensure(state); return state.meta.masterworks; }

  function validate(state) {
    var m = state.meta && state.meta.masterworks;
    if (m === undefined) return null;
    if (!m || m.version !== 1 || !m.items || typeof m.items !== 'object' || !m.stand || !m.up) return 'коллекция шедевров повреждена';
    for (var id in m.items) {
      var it = m.items[id];
      if (!it || SLOTS.indexOf(it.slot) < 0 || !RARITY_BY[it.rarity] || !wholeLevel(it.level) || it.level < 1 || !Array.isArray(it.stats) || !it.stats.length) return 'шедевр ' + id + ' повреждён';
      for (var k = 0; k < it.stats.length; k++) if (!STATS[it.stats[k]]) return 'шедевр ' + id + ': неизвестный эффект';
    }
    for (var p in m.stand) {
      var on = m.stand[p];
      if (STAND.indexOf(p) < 0) return 'стенд шедевров повреждён';
      if (on && (!m.items[on] || m.items[on].slot !== slotOf(p))) return 'на стенде чужой шедевр';
    }
    for (var n in m.up) if (!NODE_BY[n] || !wholeLevel(m.up[n])) return 'кузница шедевров повреждена';
    return null;
  }

  function nodeLevel(state, id) { return num(data(state).up[id], 0); }
  /** The chance of a piece from a beaten boss. */
  function dropChance(state, cfg) {
    return Math.min(setting(cfg, 'mw.drop.max', 0.6), setting(cfg, 'mw.drop.base', 0.06) + setting(cfg, 'mw.drop.step', 0.01) * nodeLevel(state, 'chance'));
  }
  /** The chance of a second piece from the same boss. */
  function doubleChance(state, cfg) { return Math.min(0.5, setting(cfg, 'mw.double.step', 0.05) * nodeLevel(state, 'double')); }
  /** Places for pieces not on the stand. */
  function capacity(state, cfg) { return Math.floor(setting(cfg, 'mw.capacity.base', 12) + setting(cfg, 'mw.capacity.step', 3) * nodeLevel(state, 'capacity')); }
  /** The weight of each rarity: «Глаз оценщика» makes the rarer ones likelier. */
  function weights(state, cfg) {
    var q = setting(cfg, 'mw.quality.step', 0.15) * nodeLevel(state, 'quality');
    return RARITY.map(function (r, i) { return r.weight * (i > 0 ? 1 + q * i : 1); });
  }
  function slotPower(state, cfg, slot) { return 1 + setting(cfg, 'mw.slot.step', 0.1) * nodeLevel(state, slot); }

  /** What effect `kind` of a piece gives (the first of its effects is the main one, the rest 60 % of it). */
  function statValue(state, cfg, item, index) {
    var kind = item.stats[index], s = STATS[kind], r = RARITY_BY[item.rarity];
    var base = setting(cfg, 'mw.stat.' + kind, s.base);
    var level = 1 + setting(cfg, 'mw.level.step', 0.25) * (item.level - 1);
    return base * r.mult * (index ? 0.6 : 1) * level * slotPower(state, cfg, item.slot);
  }
  function bounded(value, cap) { return cap ? cap * value / (cap + value) : value; }

  /** Everything the stand gives, by effect. */
  function modifiers(state, cfg) {
    var m = data(state), out = {};
    KINDS.forEach(function (k) { out[k] = 0; });
    STAND.forEach(function (p) {
      var item = m.items[m.stand[p]];
      if (!item) return;
      for (var i = 0; i < item.stats.length; i++) out[item.stats[i]] += statValue(state, cfg, item, i);
    });
    KINDS.forEach(function (k) { if (STATS[k].cap) out[k] = bounded(out[k], STATS[k].cap); });
    return out;
  }

  function inventory(state) {
    var m = data(state), on = {};
    STAND.forEach(function (p) { if (m.stand[p]) on[m.stand[p]] = true; });
    return Object.keys(m.items).filter(function (id) { return !on[id]; });
  }
  function placeOf(state, id) {
    var m = data(state);
    for (var i = 0; i < STAND.length; i++) if (m.stand[STAND[i]] === id) return STAND[i];
    return '';
  }

  function pick(list, u) { return list[Math.min(list.length - 1, Math.floor(u * list.length))]; }
  /** A new piece rolled from (serial, wave, n): its slot, rarity and effects. */
  function roll(state, cfg, serial, wave, n) {
    var m = data(state);
    var slot = pick(SLOTS, hash01(serial, wave, 4001 + n * 13));
    var w = weights(state, cfg), total = 0, i;
    for (i = 0; i < w.length; i++) total += w[i];
    var u = hash01(serial, wave, 4003 + n * 13) * total, rarity = RARITY[0];
    for (i = 0; i < w.length; i++) { u -= w[i]; if (u < 0) { rarity = RARITY[i]; break; } }
    var pool = POOLS[slot].slice(1), stats = [POOLS[slot][0]];
    for (var k = 0; k < rarity.extra && pool.length; k++) stats.push(pool.splice(Math.floor(hash01(serial, wave, 4007 + n * 13 + k) * pool.length), 1)[0]);
    m.serial = num(m.serial, 0) + 1;
    return { id: 'mw' + m.serial, slot: slot, rarity: rarity.id, level: 1, stats: stats, wave: wave, flavor: null, invested: 0 };
  }

  /**
   * A boss beaten (not on the farm): maybe a piece, maybe two. A piece with no room left in the
   * inventory is taken apart at once for its coals. Returns {added: [ids], salvaged: coals}.
   */
  function onBossKill(state, cfg, serial, wave, now) {
    var m = data(state), out = { added: [], salvaged: 0 };
    if (!(hash01(serial, wave, 4000) < dropChance(state, cfg))) return out;
    var count = 1 + (hash01(serial, wave, 4002) < doubleChance(state, cfg) ? 1 : 0);
    for (var n = 0; n < count; n++) {
      var item = roll(state, cfg, serial, wave, n);
      item.at = now || 0;
      m.drops = num(m.drops, 0) + 1;
      if (inventory(state).length >= capacity(state, cfg)) {
        out.salvaged += RARITY_BY[item.rarity].salvage;
        continue;
      }
      m.items[item.id] = item;
      out.added.push(item.id);
    }
    if (out.salvaged) addCoals(state, out.salvaged);
    return out;
  }

  function layer(state) { return state.layers && state.layers.forge; }
  function addCoals(state, coals) {
    var l = layer(state);
    if (!l) return;
    l.currency = Big.str(Big.add(Big.of(l.currency, 0), coals));
    l.state = l.state || {};
    l.state.total = num(l.state.total, 0) + coals;
  }
  function spend(state, price) {
    var l = layer(state);
    if (!l || !Big.valid(l.currency) || !Big.gte(l.currency, price)) return false;
    l.currency = Big.str(Big.sub(l.currency, price));
    l.state = l.state || {};
    l.state.spent = num(l.state.spent, 0) + Big.toNumber(Big.of(price));
    return true;
  }

  /** The coals of the next level of a piece. */
  function levelCost(state, cfg, id) {
    var item = data(state).items[id];
    if (!item) return null;
    var r = RARITY_BY[item.rarity];
    return Big.ceil(Big.mul(r.cost, Big.pow(setting(cfg, 'mw.level.growth', 1.6), item.level - 1)));
  }
  function levelUp(state, cfg, id) {
    var item = data(state).items[id];
    if (!item) return { ok: false, reason: 'Нет такого шедевра' };
    var price = levelCost(state, cfg, id);
    if (!spend(state, price)) return { ok: false, reason: 'Не хватает углей' };
    item.level++;
    item.invested = num(item.invested, 0) + Big.toNumber(price);
    return { ok: true, level: item.level, cost: Big.str(price) };
  }
  /** What taking a piece apart gives: its rarity's coals and half of what its levels cost. */
  function salvageValue(state, id) {
    var item = data(state).items[id];
    return item ? RARITY_BY[item.rarity].salvage + Math.floor(num(item.invested, 0) / 2) : 0;
  }
  function salvage(state, cfg, id) {
    var m = data(state), item = m.items[id];
    if (!item) return { ok: false, reason: 'Нет такого шедевра' };
    var coals = salvageValue(state, id);
    var p = placeOf(state, id);
    if (p) m.stand[p] = '';
    delete m.items[id];
    addCoals(state, coals);
    return { ok: true, coals: coals };
  }

  /** Puts a piece on the stand (a ring: the empty place, else the first), the one there goes back. */
  function equip(state, id, place) {
    var m = data(state), item = m.items[id];
    if (!item) return { ok: false, reason: 'Нет такого шедевра' };
    var was = placeOf(state, id);
    if (was) m.stand[was] = '';
    var to = place;
    if (!to || slotOf(to) !== item.slot) to = item.slot === 'ring' ? (!m.stand.ring1 ? 'ring1' : !m.stand.ring2 ? 'ring2' : 'ring1') : item.slot;
    m.stand[to] = id;
    return { ok: true, place: to };
  }
  function unequip(state, id) {
    var p = placeOf(state, id);
    if (!p) return { ok: false, reason: 'Шедевр не на стенде' };
    data(state).stand[p] = '';
    return { ok: true };
  }
  /** The bot and a hand that wants it simple: an empty place takes the best piece of its slot. */
  function autoEquip(state) {
    var m = data(state);
    STAND.forEach(function (p) {
      if (m.stand[p]) return;
      var best = null;
      inventory(state).forEach(function (id) {
        var it = m.items[id];
        if (it.slot !== slotOf(p)) return;
        if (!best || RARITY_BY[it.rarity].index > RARITY_BY[best.rarity].index || (it.rarity === best.rarity && it.level > best.level)) best = it;
      });
      if (best) m.stand[p] = best.id;
    });
  }

  function nodeCost(state, cfg, id) {
    var n = NODE_BY[id];
    if (!n) return null;
    return Big.ceil(Big.mul(setting(cfg, 'mw.node.' + id + '.cost', n.cost), Big.pow(setting(cfg, 'mw.node.' + id + '.growth', n.growth), nodeLevel(state, id))));
  }
  function buyNode(state, cfg, id) {
    if (!NODE_BY[id]) return { ok: false, reason: 'Нет такого узла' };
    var price = nodeCost(state, cfg, id);
    if (!spend(state, price)) return { ok: false, reason: 'Не хватает углей' };
    data(state).up[id] = nodeLevel(state, id) + 1;
    return { ok: true, level: data(state).up[id] };
  }

  /** Name, story, motto and icon from the model (or a stand-in while the model is away). */
  function clip(s, n) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n); }
  function setFlavor(state, id, flavor) {
    var item = data(state).items[id];
    if (!item || !flavor) return false;
    item.flavor = {
      title: clip(flavor.title, 48) || SLOT_TITLE[item.slot], text: clip(flavor.text, 160), lore: clip(flavor.lore, 600),
      motto: clip(flavor.motto, 90), theme: clip(flavor.theme, 40), svg: typeof flavor.svg === 'string' ? flavor.svg : ''
    };
    item.stub = !!(flavor.procedural || flavor.stub);
    return true;
  }
  /** Pieces still waiting for their story from the model. */
  function waiting(state) {
    var m = data(state);
    return Object.keys(m.items).filter(function (id) { return !m.items[id].flavor || m.items[id].stub; });
  }

  return { SLOTS: SLOTS, SLOT_TITLE: SLOT_TITLE, STAND: STAND, RARITY: RARITY, RARITY_BY: RARITY_BY, STATS: STATS, KINDS: KINDS, POOLS: POOLS, NODES: NODES,
    slotOf: slotOf, ensure: ensure, validate: validate, nodeLevel: nodeLevel, dropChance: dropChance, doubleChance: doubleChance,
    capacity: capacity, weights: weights, slotPower: slotPower, statValue: statValue, modifiers: modifiers, inventory: inventory,
    placeOf: placeOf, onBossKill: onBossKill, levelCost: levelCost, levelUp: levelUp, salvageValue: salvageValue, salvage: salvage,
    equip: equip, unequip: unequip, autoEquip: autoEquip, nodeCost: nodeCost, buyNode: buyNode, setFlavor: setFlavor, waiting: waiting, hash01: hash01 };
});
