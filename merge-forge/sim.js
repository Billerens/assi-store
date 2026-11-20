// The logic of «Кузница слияний» (docs/games/merge-forge.md). Shared subset of JavaScript: it runs
// on the screen (window.GameSim), in the engine (Rhino, require) and in node. No class, no async,
// no f(...args), no for (let …); randomness only from ctx.rng / the rng given; every number is a
// setting of config.json (ctx.config / cfg).
//
// The anvil is a fixed 5×7 field (index = row × 5 + column); the cells open in ORDER: the 4×5
// block row by row (a run starts with its first grid.start cells, 4×3 by default), then the fifth
// column, then rows 6 and 7. A cell holds 0 (empty) or a blade level.
(function (root, make) {
  var node = typeof require === 'function' && typeof exports !== 'undefined';
  var api = node ? make(require('../engine/big.js'), require('../engine/fmt.js'), require('./outpost.js'), require('./adventures.js'), require('./upgrade-progress.js'), require('./artifacts.js')) : make(root.Big, root.Fmt, root.MFOutpost, root.MFAdventures, root.MFUpgradeProgress, root.MFArtifacts);
  if (typeof exports !== 'undefined') { for (var k in api) exports[k] = api[k]; } else { root.GameSim = api; }
})(this, function (Big, Fmt, Outpost, Adventures, UpgradeProgress, Artifacts) {
  'use strict';

  var L1 = 'forge';
  var L2 = 'star';
  var COLS = 5;
  var ROWS = 7;
  var CELLS = COLS * ROWS;

  var ORDER = (function () {
    var o = [];
    var r;
    var c;
    for (r = 0; r < 5; r++) for (c = 0; c < 4; c++) o.push(r * COLS + c);
    for (r = 0; r < 5; r++) o.push(r * COLS + 4);
    for (r = 5; r < 7; r++) for (c = 0; c < 5; c++) o.push(r * COLS + c);
    return o;
  })();

  // The cells of the rune sockets before 0.5.0, one in each row (a save from then keeps those that are
  // open); since then a socket takes a random open cell when the run earns it (placeSockets).
  var SOCKETS = [4 * COLS + 1, 3 * COLS + 3, 2 * COLS + 0, 1 * COLS + 2, 0 * COLS + 1, 5 * COLS + 3, 6 * COLS + 1];

  // Every run began with these cells before the anvil started smaller: such a run keeps them.
  var LEGACY_START = 20;
  var RUNES = ['fire', 'ice', 'greed'];

  var UP = [
    { id: 'bellows', title: 'Мехи' }, { id: 'steel', title: 'Качество стали' }, { id: 'sharp', title: 'Острота' },
    { id: 'purse', title: 'Кошель' }, { id: 'eye', title: 'Глаз мастера' }, { id: 'hand', title: 'Тяжёлая рука' },
    { id: 'wide', title: 'Шире наковальня' }, { id: 'twin', title: 'Двойная поковка' }, { id: 'melt', title: 'Удачная плавка' },
    { id: 'apprentice', title: 'Подмастерье' }, { id: 'hourglass', title: 'Песочные часы' }, { id: 'hunter', title: 'Охотник за головами' },
    { id: 'temper', title: 'Закалка' }, { id: 'runeMason', title: 'Рунная кладка', rune: true }, { id: 'runePower', title: 'Сила руны', rune: true },
    { id: 'caravan', title: 'Караванщик' }, { id: 'night', title: 'Ночная смена' }, { id: 'cry', title: 'Боевой клич', skill: 'cry' },
    { id: 'banner', title: 'Знамя' },
    { id: 'hammer', title: 'Удар молота' }, { id: 'stall', title: 'Лавка кузнеца' },
    { id: 'ember', title: 'Жаркие угли' }, { id: 'pilot', title: 'Негаснущий огонь' },
    { id: 'cryCd', title: 'Боевой клич: откат', skill: 'cry', cd: true },
    { id: 'midas', title: 'Золотое касание', skill: 'midas' }, { id: 'midasCd', title: 'Золотое касание: откат', skill: 'midas', cd: true },
    { id: 'strike', title: 'Мощный удар', skill: 'strike' }, { id: 'strikeCd', title: 'Мощный удар: откат', skill: 'strike', cd: true },
    { id: 'fury', title: 'Ярость кузни', skill: 'fury' }, { id: 'furyCd', title: 'Ярость кузни: откат', skill: 'fury', cd: true }
  ];
  var UP_BY = {};
  UP.forEach(function (u) { UP_BY[u.id] = u; });

  // The tree of «Горн мастера»: bought with coals, kept in layers.forge.state.mf (the star reset clears it).
  // A node without `single` has no last level: its price in coals grows by mf.<id>.growth a level.
  var MF = [
    { id: 'startGold', title: 'Стартовое золото', needs: null },
    { id: 'rush', title: 'Ускоренный ранний ход', needs: null, single: true },
    { id: 'startLevel', title: 'Стартовый уровень клинка', needs: 'startGold' },
    { id: 'auto', title: 'Автоклик горна', needs: 'rush' },
    { id: 'rune', title: 'Руны мастера', needs: 'startLevel' },
    { id: 'memory', title: 'Память наковальни', needs: 'auto', single: true },
    { id: 'rhythm', title: 'Ритм мастерской', needs: 'auto', outpost: true },
    { id: 'trade', title: 'Клеймо мастера', needs: 'startLevel', outpost: true },
    { id: 'team', title: 'Плечом к плечу', needs: 'memory', single: true, outpost: true },
    { id: 'dragonCare', title: 'Тёплое логово', needs: 'rune', outpost: true },
    { id: 'command', title: 'Командный строй', needs: 'team', single: true, outpost: true }
  ];

  var EVENTS = ['caravan', 'wanderer', 'starfall', 'storm', 'order'];

  // ---- small helpers ---------------------------------------------------------------------------------

  function num(v, d) {
    var n = Number(v);
    return n === n ? n : d;
  }

  function lvl(state, id) { return num((state.run.up || {})[id], 0); }

  function upgradeEffective(state, cfg, id, levelOverride) {
    return UpgradeProgress.effective(id, levelOverride === undefined ? lvl(state, id) : levelOverride, cfg);
  }
  function upgradeProgress(state, cfg, id, levelOverride) {
    return UpgradeProgress.progress(id, levelOverride === undefined ? lvl(state, id) : levelOverride, cfg);
  }

  /** What the perks of the 50th and 100th levels of the upgrades give, of one kind (UpgradeProgress.KINDS). */
  function perk(state, cfg, kind) { return UpgradeProgress.perkTotals(state.run.up, cfg)[kind]; }

  /**
   * The levels that count: all of them up to `knee`, past it each next one adds less (the
   * logarithm), so an effect with no last level grows without running away.
   */
  function soft(n, knee) {
    if (!(knee > 0) || n <= knee) return n;
    return knee * (1 + Math.log(n / knee));
  }

  function forgeLayer(state) {
    var l = state.layers[L1];
    if (!l) {
      l = state.layers[L1] = { currency: '0e0', count: 0, best: '0e0', state: {} };
    }
    l.state = l.state || {};
    var s = l.state;
    s.mf = s.mf || {};
    s.paid = num(s.paid, 0);
    s.total = num(s.total, 0);
    s.spent = num(s.spent, 0);
    s.record = num(s.record, 0);
    return l;
  }

  function starLayer(state) {
    var l = state.layers[L2];
    if (!l) l = state.layers[L2] = { currency: '0e0', count: 0, best: '0e0', state: {} };
    l.state = l.state || {};
    return l;
  }

  function mfLevel(state, id) { return num(forgeLayer(state).state.mf[id], 0); }

  function ingots(state) { return Big.toNumber(Big.of(starLayer(state).currency, 0)); }

  /** Makes sure an older or partial state has every field (cheap; called from tick and helpers). */
  function ensure(state) {
    var r = state.run;
    if (!r.grid || r.grid.length !== CELLS) {
      var g = [];
      for (var i = 0; i < CELLS; i++) g.push(r.grid && r.grid[i] ? r.grid[i] : 0);
      r.grid = g;
    }
    r.up = r.up || {};
    // «Переплавка» is part of «Лавка кузнеца» now: its levels count there.
    if (r.up.remelt !== undefined) {
      r.up.stall = Math.max(num(r.up.stall, 0), num(r.up.remelt, 0));
      delete r.up.remelt;
    }
    r.overheat = num(r.overheat, 0);
    r.bursts = num(r.bursts, 0);
    r.pending = r.pending || [];
    r.runes = r.runes || [];
    r.stats = r.stats || { forged: 0, merged: 0, sold: 0, kills: 0, bosses: 0 };
    r.crits = r.crits || [];
    r.walkT = num(r.walkT, 0);
    r.runup = num(r.runup, 0);
    // A run saved before runs started with a smaller anvil has its blades on the cells it began with.
    if (r.keptStart === undefined) r.keptStart = LEGACY_START;
    r.heat = Math.max(0, Math.min(1, num(r.heat, 0)));
    state.meta.album = state.meta.album || {};
    state.meta.feats = state.meta.feats || {};
    state.meta.names = state.meta.names || {};
    state.meta.bestLevel = num(state.meta.bestLevel, 0);
    forgeLayer(state);
    starLayer(state);
    Outpost.ensure(state);
    Adventures.ensure(state);
    Artifacts.ensure(state);
    return state;
  }

  // ---- the anvil ---------------------------------------------------------------------------------------

  /** The cells a run starts with: the setting, or more for a run that began when the anvil started larger. */
  function startCells(state, cfg) { return Math.max(cfg['grid.start'], num(state.run.keptStart, 0)); }

  function openCount(state, cfg) {
    return Math.min(CELLS, startCells(state, cfg) + lvl(state, 'wide') * cfg['up.wide.step']);
  }

  /**
   * The order of the rune sockets: first those in the rows the run starts with, the lowest one —
   * nearest the thumb — first; then the rest as the anvil grows to them. A rune keeps its place in
   * this order. With the old start of 4×5 it is the order every run had before.
   */
  function baseSocketCells(state, cfg) {
    var start = startCells(state, cfg);
    var ready = [];
    var later = [];
    SOCKETS.forEach(function (cell) { (ORDER.indexOf(cell) < start ? ready : later).push(cell); });
    ready.sort(function (a, b) { return b - a; });
    later.sort(function (a, b) { return ORDER.indexOf(a) - ORDER.indexOf(b); });
    return ready.concat(later);
  }

  /**
   * Where the sockets of a save from before 0.5.0 are: the order of baseSocketCells, each moved where
   * the owner put it (run.socketAt[index]).
   */
  function legacySocketCells(state, cfg) {
    var cells = baseSocketCells(state, cfg);
    var moved = state.run.socketAt;
    if (!moved || !moved.length) return cells;
    var out = cells.slice();
    for (var i = 0; i < out.length; i++) {
      var c = moved[i];
      if (typeof c === 'number' && c >= 0 && c < CELLS && c % 1 === 0) out[i] = c;
    }
    // A broken save (two sockets on one cell) falls back to the places of the order.
    for (var a = 0; a < out.length; a++) for (var b = a + 1; b < out.length; b++) if (out[a] === out[b]) return cells;
    return out;
  }

  /** How many rune sockets the run has earned: rune.base, «Рунная кладка», «Руны мастера» (0 before the wave of runes). */
  function socketWant(state, cfg) {
    if (!runesOpen(state, cfg)) return 0;
    return Math.min(SOCKETS.length, cfg['rune.base'] + lvl(state, 'runeMason') * cfg['up.runeMason.step'] + mfLevel(state, 'rune'));
  }

  /**
   * The cells of the sockets the run has earned (index — the socket, the place of its rune). A socket
   * that has a cell keeps it; one that has none yet takes a random open cell with no socket — random by
   * the seed of the game, the number of the run and the socket's own number, so the same run places it
   * alike. A socket waits while every open cell has one. Nothing is written: placeSockets keeps it.
   */
  function socketPlan(state, cfg) {
    var r = state.run;
    var want = socketWant(state, cfg);
    var stored = r.socketAt || [];
    var at = [];
    var taken = {};
    for (var i = 0; i < want; i++) {
      var c = stored[i];
      var ok = typeof c === 'number' && c % 1 === 0 && isOpen(state, cfg, c) && !taken[c];
      at.push(ok ? c : -1);
      if (ok) taken[c] = true;
    }
    var open = openCells(state, cfg);
    var seed = num(state.meta && state.meta.seed, 0);
    var run = num(state.layers && state.layers[L1] && state.layers[L1].count, 0) + 1000 * num(state.layers && state.layers[L2] && state.layers[L2].count, 0);
    for (var k = 0; k < at.length; k++) {
      if (at[k] >= 0) continue;
      var free = open.filter(function (cell) { return !taken[cell]; });
      if (!free.length) { at.length = k; break; }
      at[k] = free[Math.min(free.length - 1, Math.floor(hash01(seed, run, k + 1) * free.length))];
      taken[at[k]] = true;
    }
    return at;
  }

  /** Where the sockets are now: a cell for each socket the run has a cell for. */
  function socketCells(state, cfg) {
    return state.run.socketsRandom ? socketPlan(state, cfg) : legacySocketCells(state, cfg);
  }

  /**
   * Writes the places of the sockets down (before the anvil grows, so a placed socket never moves by
   * itself). A save from before 0.5.0 keeps the sockets that stood on open cells, each with its rune;
   * those on cells the anvil has not opened yet take free open cells.
   */
  function placeSockets(state, cfg) {
    var r = state.run;
    if (!r.socketsRandom) {
      var old = legacySocketCells(state, cfg);
      var want = socketWant(state, cfg);
      var kept = [];
      var runes = [];
      for (var i = 0; i < old.length && i < want; i++) {
        if (!isOpen(state, cfg, old[i])) continue;
        kept.push(old[i]);
        runes.push(r.runes[i] || 'fire');
      }
      r.socketAt = kept;
      r.runes = runes;
      r.socketsRandom = true;
    }
    var plan = socketPlan(state, cfg);
    var same = r.socketAt && r.socketAt.length === plan.length;
    for (var k = 0; same && k < plan.length; k++) if (r.socketAt[k] !== plan[k]) same = false;
    if (!same) r.socketAt = plan;
  }

  /** Moves socket `index` (with its rune) to `cell`, an open cell; a socket already there takes its old place. */
  function moveSocket(state, cfg, index, cell) {
    ensure(state);
    placeSockets(state, cfg);
    var cells = socketCells(state, cfg);
    if (!(index >= 0 && index < cells.length) || index % 1 !== 0) return false;
    if (!(cell >= 0 && cell < CELLS) || cell % 1 !== 0 || !isOpen(state, cfg, cell)) return false;
    if (cells[index] === cell) return false;
    var r = state.run;
    var at = cells.slice();
    var other = at.indexOf(cell);
    if (other >= 0) at[other] = at[index];
    at[index] = cell;
    r.socketAt = at;
    return true;
  }

  /** Open cells in the order they open. */
  function openCells(state, cfg) { return ORDER.slice(0, openCount(state, cfg)); }

  function isOpen(state, cfg, cell) { return ORDER.indexOf(cell) >= 0 && ORDER.indexOf(cell) < openCount(state, cfg); }

  function freeCells(state, cfg) {
    var out = [];
    var open = openCells(state, cfg);
    for (var i = 0; i < open.length; i++) if (!state.run.grid[open[i]]) out.push(open[i]);
    return out;
  }

  /** Columns and rows the open cells take: {cols, rows}. */
  function shape(state, cfg) {
    var open = openCells(state, cfg);
    var cols = 0;
    var rows = 0;
    open.forEach(function (c) {
      cols = Math.max(cols, c % COLS + 1);
      rows = Math.max(rows, Math.floor(c / COLS) + 1);
    });
    return { cols: cols, rows: rows };
  }

  /** Sorts movable blades by level, keeping every open rune socket and closed cell in place. */
  function sortGrid(state, cfg) {
    var open = openCells(state, cfg);
    var grid = state.run.grid;
    var fixed = {};
    // Socket lookup fills missing forge-layer defaults. Keep that bookkeeping off the live save.
    var layer = state.layers && state.layers[L1];
    var probe = { run: state.run, meta: state.meta, layers: {} };
    probe.layers[L1] = { count: layer && layer.count, state: { mf: layer && layer.state && layer.state.mf || {} } };
    probe.layers[L2] = { count: state.layers && state.layers[L2] && state.layers[L2].count };
    sockets(probe, cfg).forEach(function (s) { fixed[s.cell] = true; });
    var cells = [];
    var levels = [];
    open.forEach(function (cell) {
      if (!fixed[cell]) {
        cells.push(cell);
        levels.push(grid[cell]);
      }
    });
    levels.sort(function (a, b) { return b - a; });
    var changed = false;
    cells.forEach(function (cell, i) {
      if (grid[cell] !== levels[i]) {
        grid[cell] = levels[i];
        changed = true;
      }
    });
    return changed;
  }

  function runesOpen(state, cfg) { return state.run.maxWave >= cfg['rune.fromWave']; }

  /** How many rune sockets there are now (0 before the wave of runes). */
  function socketCount(state, cfg) {
    if (state.run.socketsRandom) return socketPlan(state, cfg).length;
    var n = socketWant(state, cfg);
    var cells = socketCells(state, cfg);
    var open = 0;
    for (var i = 0; i < cells.length && i < n; i++) if (isOpen(state, cfg, cells[i])) open++;
    return open;
  }

  /** [{cell, rune, active}] for the sockets that exist. */
  function sockets(state, cfg) {
    var out = [];
    var n = socketCount(state, cfg);
    var cells = socketCells(state, cfg);
    var k = 0;
    // «Авто»: every socket holds ice at a boss and greed at the rest.
    var auto = state.run.runeAuto ? (isBoss(cfg, state.run.wave) && !state.run.farm ? 'ice' : 'greed') : '';
    for (var i = 0; i < cells.length && k < n; i++) {
      if (!isOpen(state, cfg, cells[i])) continue;
      var rune = auto || state.run.runes[i] || 'fire';
      out.push({ index: i, cell: cells[i], rune: rune, active: state.run.grid[cells[i]] > 0 });
      k++;
    }
    return out;
  }

  function runeAt(state, cfg, cell) {
    var list = sockets(state, cfg);
    for (var i = 0; i < list.length; i++) if (list[i].cell === cell) return list[i];
    return null;
  }

  /** How strong the runes are: Сила руны and every level of «Руны мастера». */
  function runePower(state, cfg) { return (1 + upgradeEffective(state, cfg, 'runePower') * cfg['up.runePower.step'] + mfLevel(state, 'rune') * cfg['mf.rune.power']) * (1 + Artifacts.modifiers(state, cfg).runePower); }

  function activeRunes(state, cfg, kind) {
    var n = 0;
    sockets(state, cfg).forEach(function (s) { if (s.active && s.rune === kind) n++; });
    return n;
  }

  /** Sets the rune of socket `index` ('fire' | 'ice' | 'greed'); a rune chosen by hand ends «Авто». */
  function setRune(state, cfg, index, rune) {
    if (RUNES.indexOf(rune) < 0 || index < 0 || index >= SOCKETS.length) return false;
    state.run.runes[index] = rune;
    state.run.runeAuto = false;
    return true;
  }

  /** The same rune in every socket, at once. */
  function setRuneAll(state, cfg, rune) {
    if (RUNES.indexOf(rune) < 0) return false;
    for (var i = 0; i < SOCKETS.length; i++) state.run.runes[i] = rune;
    state.run.runeAuto = false;
    return true;
  }

  /** «Авто»: ice in every socket at a boss, greed at the rest; off — the runes chosen by hand. */
  function setRuneAuto(state, cfg, on) {
    state.run.runeAuto = !!on;
    return true;
  }

  // ---- numbers of the battle ---------------------------------------------------------------------------

  function isBoss(cfg, w) { return w > 0 && w % cfg['boss.every'] === 0; }

  function hpOf(cfg, w) { return Big.mul(cfg['wave.hp'], Big.pow(cfg['wave.hpGrowth'], w - 1)); }

  function goldOf(cfg, w) { return Big.ceil(Big.mul(cfg['wave.gold'], Big.pow(cfg['wave.goldGrowth'], w - 1))); }

  /** The damage of a blade of level n with no bonuses: blade.dmg × 2.35^(n−1). */
  function bladeDmg(cfg, n) { return cfg['blade.dmg'] * Math.pow(cfg['blade.dmgGrowth'], n - 1); }

  function bladePrice(cfg, n) { return Big.mul(cfg['blade.price'], Big.pow(cfg['blade.priceGrowth'], n - 1)); }

  /** The share of a blade's price a sale gives: sell.share, and up.stall.share more for each level of «Лавка кузнеца», up to the whole price. */
  function sellShare(state, cfg) { return Math.min(1, cfg['sell.share'] + lvl(state, 'stall') * num(cfg['up.stall.share'], 0)); }

  function saleMult(state, cfg) {
    return (1 + upgradeEffective(state, cfg, 'stall') * (cfg['up.stall.step'] || 0) +
      soft(mfLevel(state, 'trade'), cfg['mf.trade.soft']) * (cfg['mf.trade.step'] || 0)) * (1 + Artifacts.modifiers(state, cfg).sale) * perk(state, cfg, 'sale');
  }

  function sellPrice(state, cfg, n) { return Big.floor(Big.mul(bladePrice(cfg, n), sellShare(state, cfg) * saleMult(state, cfg))); }

  function coalsAll(state) {
    var l = forgeLayer(state);
    return Big.toNumber(Big.of(l.currency, 0)) + l.state.spent;
  }

  function coalBonus(state, cfg) { return 1 + cfg['coals.bonus'] * coalsAll(state); }

  function starMult(state, cfg) { return Math.pow(cfg['star.mult'], ingots(state)); }

  function criticalStats(state, cfg, options) {
    var chance = Math.min(cfg['crit.maxChance'], cfg['crit.chance'] + lvl(state, 'eye') * cfg['up.eye.step'] + perk(state, cfg, 'critChance'));
    var mult = (cfg['crit.mult'] + upgradeEffective(state, cfg, 'hand') * cfg['up.hand.step']) * perk(state, cfg, 'critMult');
    // «Ярость кузни» while it works: past the cap of the chance its share turns into crit strength.
    if (options && options.now > 0 && skillOn(state, 'fury', options.now)) {
      var fury = furyBonus(state, cfg);
      chance += fury.chance;
      mult *= fury.mult;
    }
    return Artifacts.criticalStats(state, cfg, chance, mult, options);
  }
  function critChance(state, cfg, options) { return criticalStats(state, cfg, options).chance; }

  function critMult(state, cfg, options) { return criticalStats(state, cfg, options).multiplier; }

  function cryOn(state, now) { return now > 0 && state.run.cryUntil > now; }

  // ---- the skills: «Боевой клич», «Золотое касание», «Мощный удар», «Ярость кузни» ----------------
  // Each has two upgrades with no last level: its strength (<id>) and its cooldown (<id>Cd: the base
  // cooldown divided by 1 + step × level). They are used by a tap on the scene, or by themselves
  // with «Авто» (meta.autoSkills) as soon as they are ready and a foe stands at the gate.
  var SKILLS = {
    cry: { cd: 'cryCd', sec: 'cry.sec', cooldown: 'cry.cooldownSec' },
    midas: { cd: 'midasCd', sec: 'skill.midas.sec', cooldown: 'skill.midas.cooldownSec' },
    strike: { cd: 'strikeCd', sec: '', cooldown: 'skill.strike.cooldownSec' },
    fury: { cd: 'furyCd', sec: 'skill.fury.sec', cooldown: 'skill.fury.cooldownSec' }
  };
  var SKILL_IDS = ['cry', 'midas', 'strike', 'fury'];

  /** {until, readyAt} of a skill, in ms of the game's clock (the cry keeps its old fields). */
  function skillTimes(state, id) {
    var r = state.run;
    if (id === 'cry') return { until: num(r.cryUntil, 0), readyAt: num(r.cryReadyAt, 0) };
    var s = r.skills && r.skills[id];
    return { until: num(s && s.until, 0), readyAt: num(s && s.readyAt, 0) };
  }
  function setSkillTimes(state, id, until, readyAt) {
    var r = state.run;
    if (id === 'cry') { r.cryUntil = until; r.cryReadyAt = readyAt; return; }
    r.skills = r.skills && typeof r.skills === 'object' ? r.skills : {};
    r.skills[id] = { until: until, readyAt: readyAt };
  }
  /** Seconds between two uses: the base over 1 + step × the cooldown upgrade, the relics' share off. */
  function skillCooldown(state, cfg, id) {
    var d = SKILLS[id];
    if (!d) return Infinity;
    var mods = Artifacts.modifiers(state, cfg);
    var sec = num(cfg[d.cooldown], 60) / (1 + lvl(state, d.cd) * num(cfg['up.' + d.cd + '.step'], 0)) / (1 + mods.skillCooldown);
    if (id === 'cry') sec /= 1 + mods.cryRecovery;
    return Math.max(num(cfg['skill.minCooldownSec'], 1), sec);
  }
  /** Seconds a skill works (0 for the strike, which is one blow). */
  function skillDuration(state, cfg, id) {
    var d = SKILLS[id];
    if (!d || !d.sec) return 0;
    var mods = Artifacts.modifiers(state, cfg);
    var sec = num(cfg[d.sec], 0);
    if (id === 'fury') sec *= 1 + mods.furyTime;
    if (id === 'cry') sec *= 1 + mods.cryDuration;
    return sec;
  }
  function skillOn(state, id, now) { return now > 0 && skillTimes(state, id).until > now; }
  function skillReady(state, cfg, id, now) { return !!SKILLS[id] && lvl(state, id) > 0 && now >= skillTimes(state, id).readyAt; }

  /** «Золотое касание»: the share of a foe's reward each volley brings while it works. */
  function midasShare(state, cfg) {
    return num(cfg['up.midas.step'], 0) * upgradeEffective(state, cfg, 'midas') * (1 + Artifacts.modifiers(state, cfg).midasPower);
  }
  /** The reward of a plain foe of the wave now (a Big): what «Золотое касание» takes its share of. */
  function foeReward(state, cfg) { return Big.mul(goldOf(cfg, state.run.wave), goldMult(state, cfg, state.run.wave)); }
  /** «Мощный удар»: seconds of the forge's damage dealt at once. */
  function strikeSeconds(state, cfg) {
    return num(cfg['skill.strike.sec'], 0) * (1 + num(cfg['up.strike.step'], 0) * upgradeEffective(state, cfg, 'strike')) * (1 + Artifacts.modifiers(state, cfg).strikePower);
  }
  /** Damage of `sec` seconds of the forge before the global multiplier (a Big): the volley applies that. */
  function rawSeconds(state, cfg, now, sec) {
    return Big.mul(Big.div(dps(state, cfg, now), dmgMult(state, cfg, now)), sec);
  }
  /** «Ярость кузни»: what it adds to the crit chance and multiplies the crit by. */
  function furyBonus(state, cfg) {
    return { chance: num(cfg['skill.fury.chance'], 0), mult: 1 + num(cfg['up.fury.step'], 0) * upgradeEffective(state, cfg, 'fury') };
  }

  /** Uses a ready skill: true when it went. The strike needs a foe at the gate. */
  function useSkill(state, cfg, id, now) {
    ensure(state);
    var r = state.run;
    if (!skillReady(state, cfg, id, now)) return false;
    if (id === 'strike') {
      var e = r.encounter;
      if (!e || r.walkT > 0) return false;
      var raw = rawSeconds(state, cfg, now, strikeSeconds(state, cfg));
      e.pending.push({ id: 'strike', damage: Big.str(raw) });
      r.lastStrike = { at: now, serial: num(r.lastStrike && r.lastStrike.serial, 0) + 1, damage: Big.str(Big.mul(raw, dmgMult(state, cfg, now))) };
    }
    var dur = skillDuration(state, cfg, id);
    setSkillTimes(state, id, dur > 0 ? now + dur * 1000 : 0, now + skillCooldown(state, cfg, id) * 1000);
    r.lastSkill = { id: id, at: now, serial: num(r.lastSkill && r.lastSkill.serial, 0) + 1 };
    return true;
  }
  /** «Авто»: every ready skill, while a foe stands at the gate. */
  function autoSkills(state, cfg, now) {
    if (!state.meta.autoSkills || state.run.walkT > 0 || !state.run.encounter) return;
    for (var i = 0; i < SKILL_IDS.length; i++) if (skillReady(state, cfg, SKILL_IDS[i], now)) useSkill(state, cfg, SKILL_IDS[i], now);
  }
  function setAutoSkills(state, on) { state.meta.autoSkills = !!on; return true; }


  function starfallOn(state, now) { return now > 0 && state.run.starfallUntil > now; }

  /**
   * The multiplier of all damage (a Big): Острота, угли, слитки, Знамя and — when `now` is given —
   * the timed ones (Боевой клич, Звездопад).
   */
  function dmgMult(state, cfg, now) {
    var plain = (1 + cfg['up.sharp.step'] * upgradeEffective(state, cfg, 'sharp')) * coalBonus(state, cfg) * starMult(state, cfg) * (1 + cfg['up.banner.step'] * upgradeEffective(state, cfg, 'banner') * Math.floor(state.run.maxWave / 10));
    if (cryOn(state, now)) plain *= 1 + cfg['up.cry.step'] * upgradeEffective(state, cfg, 'cry');
    if (starfallOn(state, now)) plain *= cfg['event.starfall.mult'];
    plain *= 1 + Artifacts.modifiers(state, cfg, { passiveOnly: now === 0 }).damage;
    plain *= perk(state, cfg, 'dmg');
    return Big.of(plain);
  }

  /** The damage of the blade in `cell` before the global multiplier (a Number). */
  function cellDmg(state, cfg, cell) {
    var n = state.run.grid[cell];
    if (!n) return 0;
    var d = bladeDmg(cfg, n);
    if (n >= cfg['temper.fromLevel']) d *= 1 + cfg['up.temper.step'] * upgradeEffective(state, cfg, 'temper');
    var s = runeAt(state, cfg, cell);
    if (s && s.rune === 'fire') d *= 1 + cfg['rune.fire'] * runePower(state, cfg);
    var res = resonance(state, cfg);
    if (res > 0 && resonates(state, cfg, cell)) d *= 1 + res;
    return d;
  }

  /**
   * «Резонанс»: past the last cell of the anvil every level of «Шире наковальня» makes a blade that has one of
   * its level next to it (left, right, above, below) stronger by up.wide.res.
   */
  function resonance(state, cfg) {
    var over = lvl(state, 'wide') - room(startCells(state, cfg), CELLS, cfg['up.wide.step']);
    return over > 0 ? over * num(cfg['up.wide.res'], 0) : 0;
  }

  /** Whether the blade in `cell` has a blade of its level beside it on the anvil. */
  function resonates(state, cfg, cell) {
    var g = state.run.grid;
    var n = g[cell];
    if (!n) return false;
    var row = Math.floor(cell / COLS);
    var col = cell % COLS;
    var near = [col > 0 ? cell - 1 : -1, col < COLS - 1 ? cell + 1 : -1, row > 0 ? cell - COLS : -1, cell + COLS < CELLS ? cell + COLS : -1];
    for (var i = 0; i < near.length; i++) if (near[i] >= 0 && g[near[i]] === n && isOpen(state, cfg, near[i])) return true;
    return false;
  }

  /** The sum of the blades' own damage on the open cells (a Number). */
  function rawSum(state, cfg) {
    var open = openCells(state, cfg);
    var sum = 0;
    for (var i = 0; i < open.length; i++) sum += cellDmg(state, cfg, open[i]);
    return sum;
  }

  /** Big fallback for weapon levels beyond Number's range; normal levels keep their old rounding. */
  function cellPower(state, cfg, cell) {
    var level = state.run.grid[cell];
    if (!level) return Big.ZERO;
    var old = cellDmg(state, cfg, cell);
    if (isFinite(old)) return Big.of(old);
    var power = Big.mul(cfg['blade.dmg'], Big.pow(cfg['blade.dmgGrowth'], level - 1));
    if (level >= cfg['temper.fromLevel']) power = Big.mul(power, 1 + cfg['up.temper.step'] * upgradeEffective(state, cfg, 'temper'));
    var socket = runeAt(state, cfg, cell);
    if (socket && socket.rune === 'fire') power = Big.mul(power, 1 + cfg['rune.fire'] * runePower(state, cfg));
    var res = resonance(state, cfg);
    if (res > 0 && resonates(state, cfg, cell)) power = Big.mul(power, 1 + res);
    return power;
  }

  function fieldPower(state, cfg) {
    var old = rawSum(state, cfg);
    if (isFinite(old)) return Big.of(old);
    var power = Big.ZERO;
    openCells(state, cfg).forEach(function (cell) { power = Big.add(power, cellPower(state, cfg, cell)); });
    return power;
  }

  // ---- the heat of the forge --------------------------------------------------------------------------
  // Taps on the forge heat it; a hot forge makes the blades strike more often; left alone it cools.
  // «Жаркие угли» make full heat stronger, «Негаснущий огонь» keeps a part of it for good.

  /** Levels of «Глаз мастера» past the cap of the crit chance turn into «Сокрушительный удар». */
  function overcrit(state, cfg) { return UpgradeProgress.overcrit(state.run.up, cfg); }

  /**
   * «Перегрев»: past the most heat it keeps, every level of «Негаснущий огонь» opens and strengthens the
   * overheat — the heat of taps beyond full fills it, and a full one makes the next volley a burst,
   * stronger by up.pilot.burst for each such level.
   */
  function overheatLevels(state, cfg) {
    return Math.max(0, lvl(state, 'pilot') - room(0, num(cfg['heat.maxFloor'], 0), num(cfg['up.pilot.step'], 0)));
  }
  function burstMult(state, cfg) { return 1 + overheatLevels(state, cfg) * num(cfg['up.pilot.burst'], 0); }

  /** The heat the forge never falls below (0…heat.maxFloor): the levels of «Негаснущий огонь». */
  function heatFloor(state, cfg) {
    return Math.max(0, Math.min(num(cfg['heat.maxFloor'], 0), lvl(state, 'pilot') * num(cfg['up.pilot.step'], 0)));
  }

  /** The heat now, 0…1. */
  function heat(state, cfg) { return Math.max(heatFloor(state, cfg), Math.min(1, num(state.run.heat, 0))); }

  /** How much more often the blades strike at full heat: heat.speed plus «Жаркие угли» (past up.ember.soft a level adds less). */
  function heatPower(state, cfg) {
    return Math.max(0, num(cfg['heat.speed'], 0) + soft(lvl(state, 'ember'), cfg['up.ember.soft']) * num(cfg['up.ember.step'], 0));
  }

  /** How many times faster the volleys come; `passive` counts only the heat that stays without taps. */
  function volleySpeed(state, cfg, passive) { return 1 + (passive ? heatFloor(state, cfg) : heat(state, cfg)) * heatPower(state, cfg); }

  /** Seconds between two volleys. */
  function volleySec(state, cfg, passive) { return cfg['combat.hitSec'] / volleySpeed(state, cfg, passive); }

  /** The forge cools for dt seconds: from full to cold in heat.coolSec, never below the floor. */
  function coolHeat(state, cfg, dt) {
    var sec = num(cfg['heat.coolSec'], 0);
    state.run.heat = Math.max(heatFloor(state, cfg), sec > 0 ? heat(state, cfg) - dt / sec : 0);
    // The overheat cools as the heat does.
    if (state.run.overheat > 0) state.run.overheat = Math.max(0, sec > 0 ? state.run.overheat - dt / sec : 0);
  }

  /** Damage a second with crits on average (a Big); `now` 0 leaves out the timed bonuses and the heat of taps. */
  function dps(state, cfg, now) {
    var options = { passiveOnly: now === 0, now: now };
    var crit = 1 + critChance(state, cfg, options) * (UpgradeProgress.critAverage(critMult(state, cfg, options), overcrit(state, cfg)) - 1);
    var power = Big.add(Big.mul(fieldPower(state, cfg), crit), Outpost.passivePower(state, cfg, options));
    return Big.div(Big.mul(dmgMult(state, cfg, now), power), volleySec(state, cfg, now === 0));
  }

  /** Gold multiplier at wave w (a Number): Кошель, угли, слитки, жадность, ранний ход. No links. */
  function goldMult(state, cfg, w) {
    var m = (1 + cfg['up.purse.step'] * upgradeEffective(state, cfg, 'purse')) * coalBonus(state, cfg) * starMult(state, cfg);
    m *= 1 + cfg['rune.greed'] * runePower(state, cfg) * activeRunes(state, cfg, 'greed');
    if (mfLevel(state, 'rush') > 0 && w <= cfg['mf.rush.waves']) m *= cfg['mf.rush.mult'];
    m *= 1 + Artifacts.modifiers(state, cfg).gold;
    m *= perk(state, cfg, 'gold');
    return m;
  }

  function bossTimer(state, cfg) { return cfg['boss.timer'] + upgradeEffective(state, cfg, 'hourglass') * cfg['up.hourglass.step'] + Artifacts.modifiers(state, cfg).bossSeconds + perk(state, cfg, 'bossTime'); }

  /** How much slower the boss timer runs with ice runes (≥ 1). */
  /**
   * How much slower the boss timer runs with ice runes (≥ 1). Every rune adds rune.ice × the power of the
   * runes; the sum gives less and less (a logarithm, rune.iceSoft its scale) but has no ceiling: a first
   * rune works almost in full, seven strong ones slow the timer some times over, not twenty.
   */
  function iceSlow(state, cfg) {
    var raw = cfg['rune.ice'] * runePower(state, cfg) * activeRunes(state, cfg, 'ice');
    if (!(raw > 0)) return 1;
    var k = num(cfg['rune.iceSoft'], 0);
    return 1 + (k > 0 ? k * Math.log(1 + raw / k) : raw);
  }

  /**
   * Gold a second by farming the last cleared wave (a Big, no links): the rate offline progress
   * pays (× offline.share) and the screen shows.
   */
  function farmRateNow(state, cfg) {
    var r = state.run;
    var w = r.farm ? r.wave : r.wave - 1;
    if (w < 1) return Big.ZERO;
    // Without taps the volleys come as often as the heat that stays allows.
    var sec = volleySec(state, cfg, true);
    var hit = Big.mul(dps(state, cfg, 0), sec);
    if (Big.isZero(hit)) return Big.ZERO;
    var hits = Math.max(1, Big.toNumber(Big.ceil(Big.div(hpOf(cfg, w), hit))));
    var walk = cfg['wave.walkSec'] / (1 + Artifacts.modifiers(state, cfg).walkSpeed);
    if (hits <= 1) walk = runupWalk(cfg, walk, Infinity);
    return Big.div(Big.mul(goldOf(cfg, w), goldMult(state, cfg, w)), hits * sec + walk);
  }

  function offlineShare(state, cfg) { return Math.min(1, cfg['offline.share'] + lvl(state, 'night') * cfg['up.night.step']); }

  // ---- the forge ---------------------------------------------------------------------------------------

  function forgeLevel(state, cfg) {
    return Math.min(cfg['forge.maxLevel'], 1 + lvl(state, 'steel') * cfg['up.steel.step'] + mfLevel(state, 'startLevel'));
  }

  /** Seconds a blade takes at the moment `ms` (Раздуть горн halves it). */
  function forgeInterval(state, cfg, ms) {
    var t = Math.max(cfg['forge.minInterval'], cfg['forge.interval'] * Math.pow(1 - cfg['up.bellows.step'], lvl(state, 'bellows')));
    if (ms > 0 && state.run.bellowsUntil > ms) t *= cfg['bellows.mult'];
    return t;
  }

  /** Taps a second the auto-click of «Горн мастера» gives at level n (less a level past mf.auto.soft). */
  function autoTaps(cfg, n) { return soft(n, cfg['mf.auto.soft']) * cfg['mf.auto.taps']; }

  /** How fast the forge's clock runs: 1 plus the auto-click of «Горн мастера». */
  function forgeSpeed(state, cfg) { return (1 + autoTaps(cfg, mfLevel(state, 'auto')) * cfg['forge.tapSec']) * (1 + Artifacts.modifiers(state, cfg).forgeSpeed) * perk(state, cfg, 'forgeSpeed'); }

  function apprenticeSpeed(state, cfg) { return 1 + Artifacts.modifiers(state, cfg).apprenticeSpeed; }

  function apprenticeInterval(state, cfg) {
    var l = lvl(state, 'apprentice');
    if (!l) return 0;
    return Math.max(cfg['apprentice.minInterval'], cfg['apprentice.interval'] - (l - 1) * cfg['up.apprentice.step']);
  }

  function noteLevel(state, n, now) {
    Outpost.noteForged(state, n);
    var meta = state.meta;
    if (n > meta.bestLevel) meta.bestLevel = n;
    if (!meta.album[n]) meta.album[n] = now || 1;
    var e = state.run.event;
    if (e && e.id === 'order' && !e.done && n >= e.level) {
      e.done = true;
      state.run.gold = Big.add(state.run.gold, e.reward);
      state.run.earned = Big.add(state.run.earned, e.reward);
      state.run.orderPaid = e.reward;
      state.run.stats.orders = num(state.run.stats.orders, 0) + 1;
    }
  }

  /**
   * What just happened on the anvil, for the screen to show where it happened: run.fx — the last few
   * {s: serial, at, kind: 'merge'|'place', cell, from, third, level, by: 'hand'|'apprentice'|<relic id>}.
   * Nothing is decided by it; the screen shows the entries newer than the last it saw.
   */
  function noteFx(state, entry, now) {
    var r = state.run;
    var fx = r.fx && typeof r.fx === 'object' && Array.isArray(r.fx.list) ? r.fx : { serial: 0, list: [] };
    fx.serial = num(fx.serial, 0) + 1;
    entry.s = fx.serial;
    entry.at = now || 0;
    fx.list.push(entry);
    if (fx.list.length > 12) fx.list.splice(0, fx.list.length - 12);
    r.fx = fx;
  }

  function place(state, cfg, rng, level, now) {
    var free = freeCells(state, cfg);
    if (!free.length) return -1;
    var cell = free.length === 1 ? free[0] : free[Math.floor(rng.next() * free.length)];
    state.run.grid[cell] = level;
    noteLevel(state, level, now);
    noteFx(state, { kind: 'place', cell: cell, level: level }, now);
    return cell;
  }

  function placePending(state, cfg, rng, now) {
    var r = state.run;
    while (r.pending.length && freeCells(state, cfg).length) place(state, cfg, rng, r.pending.shift(), now);
  }

  /**
   * One blade out of the forge, more with Двойная поковка. A chance above 100 % is whole extra
   * blades (or levels, for Удачная плавка) plus the chance of one more, so neither has a last level.
   */
  function forgeOne(state, cfg, rng, now) {
    var r = state.run;
    var twin = upgradeEffective(state, cfg, 'twin') * cfg['up.twin.step'] + perk(state, cfg, 'twin');
    var melt = lvl(state, 'melt') * cfg['up.melt.step'];
    var count = 1 + Math.floor(twin) + (rng.chance(twin - Math.floor(twin)) ? 1 : 0);
    var sold = 0, proceeds = Big.ZERO;
    for (var i = 0; i < count; i++) {
      var level = forgeLevel(state, cfg) + Math.floor(melt);
      if (rng.chance(melt - Math.floor(melt))) level++;
      if (r.stormLeft > 0) {
        level++;
        r.stormLeft--;
      }
      if (place(state, cfg, rng, level, now) < 0) {
        // A full anvil changes the destination, not the clock. Only this newly forged blade
        // is sold; existing blades and pending chest rewards are never consumed here.
        noteLevel(state, level, now);
        proceeds = Big.add(proceeds, creditSale(state, cfg, level));
        sold++;
      }
      r.stats.forged++;
    }
    if (sold) r.lastForgeSale = {
      serial: num(r.lastForgeSale && r.lastForgeSale.serial, 0) + 1,
      at: now || 0, count: sold, gold: Big.str(proceeds)
    };
  }

  /** The level a merge of `level` with `level` gives, and the third blade it takes (or -1). */
  function mergeResult(state, cfg, level, from, to) {
    if (ingots(state) >= cfg['star.tripleFrom']) {
      var open = openCells(state, cfg);
      var best = -1;
      var bestD = Infinity;
      for (var i = 0; i < open.length; i++) {
        var c = open[i];
        if (c === from || c === to || state.run.grid[c] !== level) continue;
        var d = dist(c, to);
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      if (best >= 0) return { level: level + 2, third: best };
    }
    return { level: level + 1, third: -1 };
  }

  function dist(a, b) {
    var dx = a % COLS - b % COLS;
    var dy = Math.floor(a / COLS) - Math.floor(b / COLS);
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Drag of the blade in `from` onto `to`: the same level merges (three with «двойные клинки»),
   * an empty cell takes it, a different level swaps. Returns {kind: 'merge'|'move'|'swap', level}
   * or null.
   */
  function move(state, cfg, from, to, now) {
    var g = state.run.grid;
    if (from === to || !isOpen(state, cfg, from) || !isOpen(state, cfg, to) || !g[from]) return null;
    if (!g[to]) {
      g[to] = g[from];
      g[from] = 0;
      return { kind: 'move', level: g[to] };
    }
    if (g[to] === g[from]) {
      var m = mergeResult(state, cfg, g[from], from, to);
      g[to] = m.level;
      g[from] = 0;
      if (m.third >= 0) g[m.third] = 0;
      state.run.stats.merged++;
      noteLevel(state, m.level, now);
      noteFx(state, { kind: 'merge', cell: to, from: from, third: m.third, level: m.level, by: state.run.mergeBy || 'hand' }, now);
      state.run.forgeT = Math.max(0, state.run.forgeT - Outpost.onMerge(state, cfg));
      return { kind: 'merge', level: m.level, third: m.third };
    }
    var t = g[to];
    g[to] = g[from];
    g[from] = t;
    return { kind: 'swap', level: g[to] };
  }

  /** The nearest other blade of the same level, or -1 (double tap). */
  function nearestTwin(state, cfg, cell) {
    var level = state.run.grid[cell];
    if (!level) return -1;
    var open = openCells(state, cfg);
    var best = -1;
    var bestD = Infinity;
    for (var i = 0; i < open.length; i++) {
      var c = open[i];
      if (c === cell || state.run.grid[c] !== level) continue;
      var d = dist(c, cell);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    return best;
  }

  /** Double tap: merges the blade with its nearest twin into the tapped cell. */
  function mergeNearest(state, cfg, cell, now) {
    var other = nearestTwin(state, cfg, cell);
    return other < 0 ? null : move(state, cfg, other, cell, now);
  }

  /** One merge of the lowest pair (Подмастерье, a relic, the bot): true when merged. `by` — who, for the screen. */
  function autoMerge(state, cfg, now, by) {
    var open = openCells(state, cfg);
    var seen = {};
    var bestLevel = Infinity;
    var pair = null;
    for (var i = 0; i < open.length; i++) {
      var n = state.run.grid[open[i]];
      if (!n) continue;
      if (seen[n] !== undefined && n < bestLevel) {
        bestLevel = n;
        pair = [seen[n], open[i]];
      } else if (seen[n] === undefined) {
        seen[n] = open[i];
      }
    }
    if (!pair) return false;
    state.run.mergeBy = by || 'apprentice';
    try { return !!move(state, cfg, pair[1], pair[0], now); } finally { delete state.run.mergeBy; }
  }

  function creditSale(state, cfg, level) {
    var price = sellPrice(state, cfg, level);
    state.run.gold = Big.add(state.run.gold, price);
    state.run.earned = Big.add(state.run.earned, price);
    state.run.stats.sold++;
    return price;
  }

  /** Sells the blade in `cell` into the chest: gold now. Returns the gold or null. */
  function sell(state, cfg, cell) {
    var n = state.run.grid[cell];
    if (!n || !isOpen(state, cfg, cell)) return null;
    state.run.grid[cell] = 0;
    return creditSale(state, cfg, n);
  }

  // Artifacts propose small actions; only these normal simulation paths may apply them.
  function artifactTargets(state, cfg, now) {
    var r = state.run, camp = r.outpost, e = r.encounter;
    var recovering = Outpost.HEROS.some(function (hero) { return camp.cooldowns[hero.id] > 0; });
    return {
      merge: pairLevel(state, cfg) > 0, forgeSeconds: r.forgeT > 0,
      goldSaleShare: Big.gt(sellPrice(state, cfg, forgeLevel(state, cfg)), 0),
      dragonCharge: camp.dragon.charge < cfg['outpost.dragon.chargeMax'] && state.meta.outpost.seenWave >= cfg['outpost.dragon.wave'],
      heroCooldown: recovering, bossSeconds: isBoss(cfg, r.wave) && !r.farm && r.walkT <= 0 && r.bossT > 0 && r.bossT < bossTimer(state, cfg),
      bossSlow: isBoss(cfg, r.wave) && !r.farm && r.walkT <= 0 && r.bossT > 0,
      critChance: cfg['crit.maxChance'] > 0,
      shieldFraction: !!e && Big.gt(e.shield || 0, 0),
      suppressSeconds: !!e && e.kind === 'regenerator' && Big.gt(e.regenLeft || 0, 0),
      petXp: !!state.meta.outpost.pet, apprenticeSeconds: apprenticeInterval(state, cfg) > 0 && r.appT > 0,
      crySeconds: lvl(state, 'cry') > 0 && r.cryReadyAt > now, digestSeconds: camp.dragon.queue.length > 0,
      tapStrike: !!e && r.walkT <= 0, nextCrit: !r.nextCrit,
      skillSeconds: SKILL_IDS.some(function (id) { return lvl(state, id) > 0 && skillTimes(state, id).readyAt > now; })
    };
  }
  function applyArtifactCommands(state, cfg, commands, now) {
    var r = state.run, ids = [], done = [], camp = r.outpost, e = r.encounter;
    (commands || []).forEach(function (command) {
      var value = Math.max(0, num(command.value, 0)), used = true, shown = value;
      if (command.kind === 'merge') used = autoMerge(state, cfg, now, command.id);
      else if (command.kind === 'forgeSeconds') r.forgeT = Math.max(0, r.forgeT - value);
      else if (command.kind === 'goldSaleShare') {
        var gold = Big.mul(sellPrice(state, cfg, forgeLevel(state, cfg)), Math.min(1, value));
        r.gold = Big.add(r.gold, gold); r.earned = Big.add(r.earned, gold);
        shown = Big.str(gold);
      } else if (command.kind === 'dragonCharge') camp.dragon.charge = Math.min(cfg['outpost.dragon.chargeMax'], camp.dragon.charge + value);
      else if (command.kind === 'heroCooldown') Outpost.HEROS.forEach(function (hero) { camp.cooldowns[hero.id] = Math.max(0, camp.cooldowns[hero.id] - value); });
      else if (command.kind === 'bossSeconds') r.bossT = Math.min(bossTimer(state, cfg), r.bossT + value);
      else if (command.kind === 'shieldFraction' && e) e.shield = Big.str(Big.mul(e.shield, 1 - Math.min(1, value)));
      else if (command.kind === 'suppressSeconds' && e) e.fireT = Math.max(e.fireT, value);
      else if (command.kind === 'petXp') Outpost.rewardPet(state, cfg, value, false);
      else if (command.kind === 'apprenticeSeconds') r.appT = Math.max(0, r.appT - value);
      else if (command.kind === 'crySeconds') r.cryReadyAt = Math.max(now, r.cryReadyAt - value * 1000);
      else if (command.kind === 'digestSeconds') Outpost.digest(state, value, cfg);
      else if (command.kind === 'tapStrike' && e && r.walkT <= 0) {
        // «Тяжёлый молот»: the tap itself strikes the foe for some seconds of the forge's damage.
        var blow = rawSeconds(state, cfg, now, value);
        e.pending.push({ id: command.id, damage: Big.str(blow) });
        shown = Big.str(Big.mul(blow, dmgMult(state, cfg, now)));
      } else if (command.kind === 'nextCrit') r.nextCrit = true;
      else if (command.kind === 'skillSeconds') {
        SKILL_IDS.forEach(function (id) { var t = skillTimes(state, id); if (t.readyAt > now) setSkillTimes(state, id, t.until, Math.max(now, t.readyAt - value * 1000)); });
      } else used = false;
      if (used) { ids.push(command.id); done.push({ id: command.id, kind: command.kind, value: shown }); }
    });
    if (ids.length) r.lastArtifactFx = { serial: num(r.lastArtifactFx && r.lastArtifactFx.serial, 0) + 1, at: now, ids: ids, done: done };
    return ids;
  }
  function activateArtifact(state, cfg, id, now) {
    ensure(state);
    var result = Artifacts.activate(state, cfg, id, { can: artifactTargets(state, cfg, now || 0) });
    if (result.ok) applyArtifactCommands(state, cfg, result.commands, now || 0);
    if (result.ok && result.duration > 0) state.run.lastArtifactFx = { serial: num(state.run.lastArtifactFx && state.run.lastArtifactFx.serial, 0) + 1, at: now || 0, ids: [id] };
    return result;
  }
  function buyArtifact(state, cfg, id) { ensure(state); return Artifacts.buy(state, cfg, id); }
  function setArtifactEnabled(state, id, enabled) { ensure(state); return Artifacts.setEnabled(state, id, enabled); }

  /**
   * A rate-limited tap speeds up the current cycle. With the engine RNG it also completes a
   * ready batch immediately. Without RNG, older callers leave completion to the workshop.
   * Both paths use the same timer and batch: a blade without room goes straight to sale.
   */
  function tapSeconds(state, cfg, now) {
    var base = cfg['forge.tapSec'];
    var extra = upgradeEffective(state, cfg, 'hammer') * (cfg['up.hammer.step'] || 0) * perk(state, cfg, 'tap');
    if (!extra || !base) return base;
    var interval = forgeInterval(state, cfg, now || 0);
    // A stronger strike approaches one complete cycle; each purchased level remains useful.
    return base >= interval ? base : base * (1 + extra) / (1 + base * extra / interval);
  }

  function tap(state, cfg, rng, now) {
    var r = state.run;
    if (r.tapBudget < 1) return false;
    r.tapBudget -= 1;
    r.forgeT = Math.max(0, r.forgeT - tapSeconds(state, cfg, now) - Outpost.onTap(state, cfg));
    r.taps++;
    // The same strike fans the fire: the blades at the gate strike more often while the forge is hot.
    var hot = heat(state, cfg) + num(cfg['heat.perTap'], 0);
    r.heat = Math.min(1, hot);
    // What goes past full heat fills the overheat; a full one waits as a burst for the next volley.
    if (hot > 1 && overheatLevels(state, cfg) > 0) {
      r.overheat = num(r.overheat, 0) + (hot - 1) / Math.max(0.01, num(cfg['heat.overCost'], 1));
      if (r.overheat >= 1) {
        r.overheat -= 1;
        r.bursts = Math.min(3, num(r.bursts, 0) + 1);
      }
    }
    var proc = Artifacts.onTap(state, cfg, rng, { manual: true, accepted: true, can: artifactTargets(state, cfg, now || 0) });
    applyArtifactCommands(state, cfg, proc.commands, now || 0);
    if (rng && r.forgeT <= 0) {
      placePending(state, cfg, rng, now || 0);
      forgeOne(state, cfg, rng, now || 0);
      r.forgeT = forgeInterval(state, cfg, now || 0);
    }
    return true;
  }

  /**
   * The workshop for `dt` seconds ending at `endMs`: the forge and the apprentice, event by event
   * in time order, so that one long step (offline) and many short ones (the screen) agree.
   */
  function workshop(state, dt, cfg, rng, endMs, eventLimit) {
    var r = state.run;
    var startMs = endMs - dt * 1000;
    var t = 0;
    var events = 0;
    var maxEvents = eventLimit === undefined ? cfg['offline.maxEvents'] : Math.min(cfg['offline.maxEvents'], Math.max(0, eventLimit));
    var speed = forgeSpeed(state, cfg);
    var appEvery = apprenticeInterval(state, cfg);
    var appSpeed = apprenticeSpeed(state, cfg);
    // Repeated fractional intervals otherwise leave an event a few picoseconds beyond
    // the end of one large offline step while short screen steps include it.
    var epsilon = 1e-9;
    if (!appEvery) r.appT = 0;
    placePending(state, cfg, rng, startMs);
    while (true) {
      var tf = Math.max(0, r.forgeT) / speed;
      var ta = appEvery ? Math.max(0, r.appT) / appSpeed : Infinity;
      var next = Math.min(tf, ta);
      if (next > Math.max(0, dt - t) + epsilon || events >= maxEvents) {
        var rest = Math.max(0, dt - t);
        r.forgeT = Math.max(0, r.forgeT - rest * speed);
        if (appEvery) r.appT = Math.max(0, r.appT - rest * appSpeed);
        break;
      }
      next = Math.min(next, Math.max(0, dt - t));
      r.forgeT = Math.max(0, r.forgeT - next * speed);
      if (appEvery) r.appT = Math.max(0, r.appT - next * appSpeed);
      t += next;
      var ms = startMs + t * 1000;
      if (tf <= ta + epsilon) {
        forgeOne(state, cfg, rng, ms);
        r.forgeT = forgeInterval(state, cfg, ms);
      } else {
        autoMerge(state, cfg, ms);
        r.appT = appEvery;
        placePending(state, cfg, rng, ms);
      }
      events++;
    }
    return events;
  }

  // ---- the battle --------------------------------------------------------------------------------------

  function enemyKind(state, cfg) {
    var route = Adventures.modifiers(state, cfg);
    if (route.enemyKind) return route.enemyKind;
    var heroes = state.meta.outpost && state.meta.outpost.heroes;
    var joined = heroes && Outpost.HEROS.some(function (h) { return heroes[h.id] && heroes[h.id].unlocked; });
    if (!(state.run.wave >= cfg['encounter.fromWave']) || !joined) return 'plain';
    var kinds = ['armored', 'regenerator', 'channeler'];
    return kinds[state.run.wave % kinds.length];
  }

  function newEncounter(state, cfg) {
    var r = state.run;
    var kind = enemyKind(state, cfg);
    var benefits = Outpost.benefits(state, cfg);
    r.encounterSerial = num(r.encounterSerial, 0) + 1;
    r.encounter = { serial: r.encounterSerial, kind: kind, walkTotal: r.walkT,
      prepared: '', aim: false, pending: [], fireT: 0, iceT: 0, iceStrength: 0, weakened: false, echo: '0e0', opening: 0, mark: 0,
      ward: !!benefits.casterWard, wardUsed: false, wardUsedCount: 0, wardCharges: Math.max(0, Math.min(2, benefits.casterWards || (benefits.casterWard ? 1 : 0))),
      shield: Big.str(kind === 'armored' ? Big.mul(r.hpMax, cfg['encounter.armor.share']) : Big.ZERO),
      regenLeft: Big.str(kind === 'regenerator' ? Big.mul(r.hpMax, cfg['encounter.regen.budget']) : Big.ZERO),
      castT: cfg['encounter.cast.sec'] };
    return r.encounter;
  }

  function encounterOf(state, cfg) { return state.run.encounter || newEncounter(state, cfg); }

  /** Choose one preparation per encounter; early contact also has a play-time cooldown. */
  function prepare(state, cfg, kind) {
    ensure(state);
    var r = state.run;
    var e = encounterOf(state, cfg);
    if (!(r.maxWave >= cfg['encounter.prepare.fromWave']) || !(r.walkT > 0) || e.prepared) return false;
    if (kind === 'meet') {
      if (num(r.meetCooldown, 0) > 0 || r.walkT <= cfg['encounter.meet.minSec']) return false;
      r.walkT = Math.max(cfg['encounter.meet.minSec'], r.walkT - cfg['encounter.meet.cutSec']);
      r.meetCooldown = cfg['encounter.meet.cooldown'];
    } else if (kind === 'aim') e.aim = true;
    else return false;
    e.prepared = kind;
    return true;
  }

  /** Whether «Встретить» can be used now (the wave, the approach, the cooldown, nothing prepared yet). */
  function canMeet(state, cfg) {
    var r = state.run;
    var e = r.encounter;
    return r.maxWave >= cfg['encounter.prepare.fromWave'] && r.walkT > cfg['encounter.meet.minSec'] && !(num(r.meetCooldown, 0) > 0) && !(e && e.prepared);
  }

  /** «Авто»: meets the foe at once whenever «Встретить» is ready. */
  function autoMeet(state, cfg) {
    if (canMeet(state, cfg)) prepare(state, cfg, 'meet');
  }

  /** «Авто» of «Встретить» on or off: the owner's choice, kept between runs. */
  function setAutoMeet(state, on) {
    state.meta.autoMeet = !!on;
    return true;
  }

  /** Abilities join the next real volley, which owns kill rewards, passenger bonuses and RNG. */
  function useAbility(state, cfg, id, now) {
    ensure(state);
    var e = encounterOf(state, cfg);
    for (var i = 0; i < e.pending.length; i++) if (e.pending[i].id === id) return { ok: false, reason: 'Умение уже подготовлено' };
    var result = Outpost.active(state, cfg, id);
    if (!result || !result.ok) return result;
    if (id === 'veya' && !(state.run.walkT > 0) && e.kind === 'channeler' && e.castT <= cfg['encounter.cast.windSec']) {
      result.damage = Big.str(Big.mul(result.damage, 1 + cfg['encounter.riposte.bonus'] + (result.riposteBonus || 0)));
      result.timed = true;
    }
    e.pending.push(result);
    return result;
  }

  function encounterView(state, cfg) {
    var e = state.run.encounter || { kind: 'plain', walkTotal: cfg['wave.walkSec'], prepared: '', shield: '0e0', regenLeft: '0e0', castT: cfg['encounter.cast.sec'], pending: [] };
    return { kind: e.kind, mod: e.mod || '', size: currentMod(state, cfg).size, walking: state.run.walkT > 0, remaining: state.run.walkT, total: e.walkTotal,
      prepared: e.prepared, shield: e.shield, regenLeft: e.regenLeft, castT: e.castT,
      casting: e.kind === 'channeler' && !(state.run.walkT > 0) && e.castT <= cfg['encounter.cast.windSec'],
      meetCooldown: num(state.run.meetCooldown, 0), canPrepare: state.run.maxWave >= cfg['encounter.prepare.fromWave'] && state.run.walkT > 0 && !e.prepared,
      queued: e.pending.map(function (p) { return p.id; }) };
  }

  function coldStrength(state, cfg, e) {
    return Math.max(Outpost.elements(state, cfg).ice ? cfg['encounter.ice.slow'] : 0,
      e.iceT > 0 ? Math.max(cfg['encounter.ice.slow'], num(e.iceStrength, 0)) : 0);
  }

  function enemyStep(state, cfg, dt, at) {
    var r = state.run;
    var e = encounterOf(state, cfg);
    var burning = e.fireT > 0 || Outpost.elements(state, cfg).fire;
    var cold = coldStrength(state, cfg, e);
    e.fireT = Math.max(0, e.fireT - dt);
    e.iceT = Math.max(0, e.iceT - dt);
    if (!(e.iceT > 0)) e.iceStrength = 0;
    if (e.kind === 'regenerator' && !burning && Big.gt(e.regenLeft, 0)) {
      var heal = Big.min(Big.sub(r.hpMax, r.hp), Big.min(e.regenLeft, Big.mul(r.hpMax, cfg['encounter.regen.rate'] * dt)));
      if (Big.gt(heal, 0)) { r.hp = Big.str(Big.add(r.hp, heal)); e.regenLeft = Big.str(Big.sub(e.regenLeft, heal)); }
    }
    if (e.kind === 'channeler') {
      e.castT -= dt / (1 + cold);
      if (e.castT <= 1e-9) {
        var usedWards = e.wardUsedCount === undefined ? (e.wardUsed ? 1 : 0) : e.wardUsedCount;
        if (e.ward && usedWards < (e.wardCharges || 1)) {
          e.wardUsed = true;
          e.wardUsedCount = usedWards + 1;
          Outpost.onWard(state, cfg);
          r.lastOutpostFx = { at: at || 0, ids: ['turtle'], effect: 'ward' };
        }
        else e.weakened = true;
        e.castT += cfg['encounter.cast.sec'];
      }
    }
  }

  // ---- rare monsters -------------------------------------------------------------------------------------
  // Now and then a monster comes with a modifier — golden, a giant, feeble… — with its own health, gold,
  // pace and look; a boss from mod.bossFromWave always has one of its own set. The choice follows from
  // the encounter's number, the wave and the reforges, never from the game's random numbers: the same
  // encounter is the same monster on every screen, after a reload and offline. The values are the
  // settings mod.<id>.<field>, with these when one is missing.
  var MODS = {
    golden: { weight: 3, hp: 1, gold: 5, walk: 1, size: 1 },
    giant: { weight: 3, hp: 3, gold: 3, walk: 1.25, size: 1.3 },
    feeble: { weight: 3, hp: 0.4, gold: 1, walk: 1, size: 0.72 },
    swift: { weight: 2, hp: 0.8, gold: 1.8, walk: 0.4, size: 0.92 },
    ghostly: { weight: 2, hp: 1.5, gold: 2.5, walk: 1, size: 1 },
    enraged: { weight: 2, hp: 2, gold: 2.2, walk: 0.7, size: 1.08 },
    frosty: { weight: 1.5, hp: 1.6, gold: 2, walk: 1, size: 1, cool: 0.5 },
    burning: { weight: 1.5, hp: 1.4, gold: 1.5, walk: 1, size: 1 },
    treasure: { weight: 1, hp: 1.5, gold: 1, walk: 1, size: 1, blades: 2 },
    rainbow: { weight: 0.3, hp: 1, gold: 12, walk: 1, size: 1 }
  };
  var BOSS_MODS = {
    regal: { weight: 3, hp: 1, gold: 1, timer: 1, size: 1 },
    colossal: { weight: 2, hp: 1.6, gold: 1.8, timer: 1.3, size: 1.12 },
    frenzied: { weight: 2, hp: 1, gold: 1.6, timer: 0.8, size: 1 },
    hoarder: { weight: 2, hp: 1.2, gold: 3, timer: 1, size: 1 },
    shadow: { weight: 2, hp: 1.3, gold: 1.8, timer: 1.1, size: 1 },
    enduring: { weight: 2, hp: 1.4, gold: 1.8, timer: 1.2, size: 1 }
  };

  /** A 32-bit product, as Math.imul (not everywhere the game runs). */
  function mul32(a, b) {
    var lo = (a & 0xffff) * b;
    var hi = ((a >>> 16) * b) & 0xffff;
    return (lo + (hi << 16)) >>> 0;
  }

  /** A number in [0, 1) that follows from three integers alone. */
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

  /** The modifier `id` with its values from the settings: {id, weight, hp, gold, walk, timer, size, …}; a plain one for ''. */
  function modOf(cfg, id, boss) {
    var table = boss ? BOSS_MODS : MODS;
    var base = id && Object.prototype.hasOwnProperty.call(table, id) ? table[id] : null;
    var out = { id: base ? id : '', boss: !!boss, weight: 0, hp: 1, gold: 1, walk: 1, timer: 1, size: 1 };
    if (!base) return out;
    for (var key in base) {
      if (!Object.prototype.hasOwnProperty.call(base, key)) continue;
      var v = Number(cfg['mod.' + id + '.' + key]);
      out[key] = isFinite(v) && v >= 0 ? v : base[key];
    }
    return out;
  }

  /** The modifier an encounter gets: '' for most, one of MODS now and then, one of BOSS_MODS for a boss. */
  function pickMod(state, cfg, boss, serial, wave) {
    var salt = num(forgeLayer(state).count, 0);
    var table = boss ? BOSS_MODS : MODS;
    if (boss) {
      if (!(wave >= num(cfg['mod.bossFromWave'], Infinity))) return '';
    } else {
      if (!(wave >= num(cfg['mod.fromWave'], Infinity))) return '';
      if (hash01(serial, wave, salt * 2 + 1) >= num(cfg['mod.chance'], 0) * (1 + Artifacts.modifiers(state, cfg).rareChance)) return '';
    }
    var ids = [];
    var total = 0;
    for (var id in table) {
      if (!Object.prototype.hasOwnProperty.call(table, id)) continue;
      var w = modOf(cfg, id, boss).weight;
      if (w > 0) { ids.push([id, w]); total += w; }
    }
    if (!(total > 0)) return '';
    var u = hash01(serial + 7919, wave, salt * 2) * total;
    for (var i = 0; i < ids.length; i++) {
      u -= ids[i][1];
      if (u < 0) return ids[i][0];
    }
    return ids[ids.length - 1][0];
  }

  /** The approach after `streak` easy wins: shorter each time by runup.factor, never under runup.minSec. */
  function runupWalk(cfg, walk, streak) {
    var floor = Math.min(walk, num(cfg['runup.minSec'], 0));
    var factor = Math.max(0, Math.min(1, num(cfg['runup.factor'], 1)));
    // A factor of 1 is no run-up at all, however long the streak (1^Infinity is NaN, not 1).
    if (factor >= 1 || !(streak > 0)) return walk;
    return Math.max(floor, isFinite(streak) ? walk * Math.pow(factor, streak) : 0);
  }

  /** The modifier of the monster at the gate now. */
  function currentMod(state, cfg) {
    var e = state.run.encounter;
    var boss = isBoss(cfg, state.run.wave) && !state.run.farm;
    return modOf(cfg, e && e.mod || '', boss);
  }

  function spawn(state, cfg) {
    var r = state.run;
    var boss = isBoss(cfg, r.wave) && !r.farm;
    var mod = modOf(cfg, pickMod(state, cfg, boss, num(r.encounterSerial, 0) + 1, r.wave), boss);
    r.hp = Big.str(boss ? Big.mul(hpOf(cfg, r.wave), cfg['boss.hpMult']) : hpOf(cfg, r.wave));
    var route = Adventures.modifiers(state, cfg);
    if (route.hpMult && route.hpMult !== 1) r.hp = Big.str(Big.mul(r.hp, route.hpMult));
    if (mod.hp !== 1) r.hp = Big.str(Big.max(Big.of(1), Big.ceil(Big.mul(r.hp, mod.hp))));
    // «Окалина титанов»: every foe comes weaker.
    var thin = Artifacts.modifiers(state, cfg).enemyHp;
    if (thin > 0) r.hp = Big.str(Big.max(Big.of(1), Big.ceil(Big.mul(r.hp, 1 - thin))));
    r.hpMax = r.hp;
    r.bossT = boss ? bossTimer(state, cfg) * mod.timer : 0;
    // The monster walks up to the gate first; the blades strike once it is there.
    r.walkT = cfg['wave.walkSec'] / (1 + Artifacts.modifiers(state, cfg).walkSpeed) * mod.walk;
    // «Разбег»: after foes that fell in the first volley the next one comes quicker; a boss always walks the whole road.
    if (!boss && num(r.runup, 0) > 0) r.walkT = runupWalk(cfg, r.walkT, r.runup);
    r.volleyT = cfg['combat.hitSec'];
    newEncounter(state, cfg);
    r.encounter.mod = mod.id;
    // A frosty one cools the forge as it comes.
    if (mod.id === 'frosty') r.heat = Math.max(heatFloor(state, cfg), heat(state, cfg) * Math.min(1, num(mod.cool, 0.5)));
  }

  function kill(state, ctx) {
    var cfg = ctx.config;
    var r = state.run;
    var w = r.wave;
    var boss = isBoss(cfg, w) && !r.farm;
    var gold = Big.mul(goldOf(cfg, w), goldMult(state, cfg, w) * (ctx.mult || 1));
    if (boss) gold = Big.mul(gold, cfg['boss.goldMult'] * (1 + upgradeEffective(state, cfg, 'hunter') * cfg['up.hunter.step']) * perk(state, cfg, 'bossGold') * (1 + Artifacts.modifiers(state, cfg).bossGold));
    var encounter = encounterOf(state, cfg);
    if (encounter.mark > 0) gold = Big.mul(gold, 1 + Math.min(cfg['campaign.mark.maxShare'], encounter.mark));
    var mod = modOf(cfg, encounter.mod || '', boss);
    if (mod.gold !== 1) gold = Big.mul(gold, mod.gold);
    if (mod.id) {
      // What a rare one leaves besides gold: a burning one heats the forge, a treasure-bearer drops blades.
      if (mod.id === 'burning') r.heat = 1;
      var drop = mod.id === 'treasure' ? Math.max(0, Math.min(10, Math.floor(num(mod.blades, 0)))) : 0;
      for (var b = 0; b < drop; b++) r.pending.push(Math.min(cfg['forge.maxLevel'] + 1, forgeLevel(state, cfg) + 1));
      r.stats.rare = num(r.stats.rare, 0) + 1;
      r.lastMod = { id: mod.id, boss: boss, serial: encounter.serial, wave: w, gold: Big.str(gold), blades: drop, at: ctx.now || 0 };
    }
    r.gold = Big.add(r.gold, gold);
    r.earned = Big.add(r.earned, gold);
    r.stats.kills++;
    r.runup = num(encounter.volleys, 0) <= 1 ? Math.min(50, num(r.runup, 0) + 1) : 0;
    Outpost.onKill(state, cfg, boss);
    Adventures.onKill(state, cfg, { serial: encounter.serial, wave: w, boss: boss, farm: !!r.farm, gold: Big.str(gold) });
    r.lastGold = Big.str(gold);
    if (boss) {
      r.stats.bosses++;
      r.lastBoss = { wave: w, left: Math.round(r.bossT * 100) / 100 };
      if (r.bossT < cfg['ach.lastSecond']) state.meta.feats.lastSecond = ctx.now || 1;
      r.bossT = 0;
    }
    if (!r.farm) {
      r.wave = w + 1;
      // «Сапоги-скороходы»: after a plain foe the next wave may be stepped over (never a boss), its reward taken.
      var skip = boss ? 0 : Artifacts.modifiers(state, cfg).waveSkip;
      if (skip > 0 && !isBoss(cfg, w + 1) && hash01(num(encounter.serial, 0), w, 97) < skip) {
        var passed = Big.mul(goldOf(cfg, w + 1), goldMult(state, cfg, w + 1) * (ctx.mult || 1));
        r.gold = Big.add(r.gold, passed);
        r.earned = Big.add(r.earned, passed);
        r.wave = w + 2;
        r.stats.skipped = num(r.stats.skipped, 0) + 1;
        r.lastSkip = { at: ctx.now || 0, wave: w + 1, gold: Big.str(passed) };
      }
      if (r.wave > r.maxWave) r.maxWave = r.wave;
    }
    spawn(state, cfg);
  }

  /** The boss's time ran out: back one wave to farm (or, without the rollback, the boss anew). */
  function failBoss(state, cfg) {
    var r = state.run;
    r.stats.fails = num(r.stats.fails, 0) + 1;
    if (cfg['boss.rollback'] && r.wave > 1) {
      r.wave = r.wave - 1;
      r.farm = true;
    }
    spawn(state, cfg);
  }

  /** «Ещё раз»: back to the boss that beat us. */
  function retry(state, cfg) {
    var r = state.run;
    if (!r.farm) return false;
    r.farm = false;
    r.wave = r.wave + 1;
    spawn(state, cfg);
    return true;
  }

  /** All blades strike once; crits by chance each. */
  function volley(state, ctx) {
    var cfg = ctx.config;
    var r = state.run;
    var open = openCells(state, cfg);
    var p = critChance(state, cfg, { now: ctx.now || 0 });
    var m = critMult(state, cfg, { now: ctx.now || 0 });
    // «Искра точности»: one volley of sure crits.
    if (r.nextCrit) { p = 1; r.nextCrit = false; }
    var smash = overcrit(state, cfg);
    var smashes = [];
    var sum = 0;
    var bigSum = Big.ZERO;
    var crits = [];
    for (var i = 0; i < open.length; i++) {
      var d = cellDmg(state, cfg, open[i]);
      if (!d) continue;
      var power = isFinite(d) ? Big.of(d) : cellPower(state, cfg, open[i]);
      if (ctx.rng.chance(p)) {
        d *= m;
        power = Big.mul(power, m);
        crits.push(open[i]);
        // «Сокрушительный удар»: the crit strikes once more, maybe more than once.
        if (smash > 0) {
          var extra = Math.floor(smash) + (ctx.rng.chance(smash - Math.floor(smash)) ? 1 : 0);
          if (extra > 0) {
            d *= Math.pow(m, extra);
            power = Big.mul(power, Big.pow(m, extra));
            smashes.push(open[i]);
          }
        }
      }
      sum += d;
      bigSum = Big.add(bigSum, power);
    }
    r.volleys++;
    r.crits = crits;
    r.smashes = smashes;
    var e = encounterOf(state, cfg);
    e.volleys = num(e.volleys, 0) + 1;
    var base = Big.add(isFinite(sum) ? Big.of(sum) : bigSum, Outpost.passivePower(state, cfg));
    base = Big.add(base, e.echo || 0);
    if (e.opening > 0) base = Big.mul(base, 1 + Math.min(cfg['campaign.opening.maxShare'], e.opening));
    e.opening = 0;
    e.echo = '0e0';
    var elements = Outpost.elements(state, cfg);
    var interrupt = false;
    var armorBreak = false;
    var resonantSkill = false;
    var extraEcho = Big.ZERO;
    var used = [];
    for (var k = 0; k < e.pending.length; k++) {
      var skill = e.pending[k];
      var damage = Big.of(skill.damage || 0);
      if (r.bossT > 0 && skill.bossBonus) damage = Big.mul(damage, 1 + skill.bossBonus);
      base = Big.add(base, damage);
      used.push(skill.id);
      if (skill.echoDamage) extraEcho = Big.add(extraEcho, skill.echoDamage);
      if (skill.echoShare && skill.heroPower) extraEcho = Big.add(extraEcho, Big.mul(skill.heroPower, skill.echoShare));
      e.opening = Math.max(e.opening, skill.openingBonus || 0);
      e.mark = Math.max(e.mark || 0, skill.markGoldShare || 0);
      armorBreak = armorBreak || !!skill.breakArmor;
      interrupt = true;
      resonantSkill = resonantSkill || !!skill.resonant;
      if (skill.temper === 'fire' || skill.suppressRegenSec) e.fireT = Math.max(e.fireT, cfg['encounter.fire.sec'], skill.suppressRegenSec || 0);
      if (skill.temper === 'ice' || skill.slowSec) {
        e.iceT = Math.max(e.iceT, cfg['encounter.ice.sec'], skill.slowSec || 0);
        e.iceStrength = Math.max(e.iceStrength || 0, skill.slowStrength || 0);
      }
    }
    e.pending = [];
    if (elements.resonant && (crits.length || resonantSkill)) {
      var echo = Big.ZERO;
      Outpost.model(state, cfg).heroes.forEach(function (hero) {
        if (hero.active && hero.equipment && hero.equipment.temper === 'resonant') echo = Big.add(echo, hero.power);
      });
      e.echo = Big.str(Big.mul(echo, cfg['encounter.resonant.share']));
    }
    e.echo = Big.str(Big.add(e.echo, extraEcho));
    if (used.length) r.lastOutpostFx = { at: ctx.now || 0, ids: used, dragonForm: state.meta.outpost.dragon.form || 'ash' };
    if (interrupt && e.kind === 'channeler') { e.castT = cfg['encounter.cast.sec']; e.weakened = false; }
    if (armorBreak) e.shield = '0e0';
    if (elements.fire) e.fireT = Math.max(e.fireT, cfg['encounter.fire.sec']);
    if (Big.isZero(base)) return;
    if (e.aim) { base = Big.mul(base, 1 + cfg['encounter.aim.bonus']); e.aim = false; }
    if (e.weakened) { base = Big.mul(base, 1 - cfg['encounter.cast.penalty']); e.weakened = false; }
    var hit = Big.mul(dmgMult(state, cfg, ctx.now), base);
    if (num(r.bursts, 0) > 0) {
      var burst = burstMult(state, cfg);
      hit = Big.mul(hit, burst);
      r.bursts -= 1;
      r.lastBurst = { at: ctx.now || 0, mult: burst, serial: num(r.lastBurst && r.lastBurst.serial, 0) + 1 };
    }
    if (r.bossT > 0) hit = Big.mul(hit, perk(state, cfg, 'bossDmg') * (1 + Artifacts.modifiers(state, cfg).bossDamage));
    // «Золотое касание»: while it works, every volley brings a share of a foe's reward.
    if (skillOn(state, 'midas', ctx.now || 0)) {
      var touch = Big.mul(foeReward(state, cfg), midasShare(state, cfg) * (ctx.mult || 1));
      r.gold = Big.add(r.gold, touch);
      r.earned = Big.add(r.earned, touch);
      r.lastMidas = { at: ctx.now || 0, gold: Big.str(touch), serial: num(r.lastMidas && r.lastMidas.serial, 0) + 1 };
    }
    if (Big.gt(e.shield, 0)) {
      var absorbed = Big.min(e.shield, hit);
      e.shield = Big.str(Big.sub(e.shield, absorbed));
      hit = Big.sub(hit, absorbed);
    }
    r.lastHit = Big.str(hit);
    var hp = Big.sub(r.hp, hit);
    if (Big.sign(hp) <= 0) kill(state, ctx);
    else r.hp = Big.str(hp);
  }

  /** Strikes and the boss's clock in time order inside dt; a strike at the last moment still counts. */
  function battleTimers(state, dt, cfg) {
    if (!(dt > 0)) return;
    Outpost.tick(state, dt, cfg, { offline: false });
    state.run.meetCooldown = Math.max(0, num(state.run.meetCooldown, 0) - dt);
  }

  function battle(state, dt, ctx) {
    var cfg = ctx.config;
    var r = state.run;
    var hitSec = cfg['combat.hitSec'];
    var t = 0;
    var guard = 0;
    while (t < dt - 1e-9 && guard++ < 100000) {
      if (r.walkT > 0) {
        if (state.meta.autoMeet) autoMeet(state, cfg);
        var w = Math.min(dt - t, r.walkT);
        battleTimers(state, w, cfg);
        r.walkT = Math.max(0, r.walkT - w);
        coolHeat(state, cfg, w);
        t += w;
        continue;
      }
      var e = encounterOf(state, cfg);
      var slow = iceSlow(state, cfg) + coldStrength(state, cfg, e) + Artifacts.modifiers(state, cfg).bossSlow;
      var boss = r.bossT > 0;
      // A hot forge runs the volley's clock faster; the heat is read once a step and cools as the step goes.
      var speed = volleySpeed(state, cfg, false);
      var toHit = Math.max(0, r.volleyT) / speed;
      var toFail = boss ? r.bossT * slow : Infinity;
      var castSlow = 1 + coldStrength(state, cfg, e);
      var step = Math.min(dt - t, toHit, toFail, e.kind === 'channeler' ? Math.max(0, e.castT) * castSlow : Infinity,
        e.iceT > 0 ? e.iceT : Infinity, e.fireT > 0 ? e.fireT : Infinity);
      t += step;
      battleTimers(state, step, cfg);
      enemyStep(state, cfg, step, (ctx.now || 0) - (dt - t) * 1000);
      r.volleyT -= step * speed;
      coolHeat(state, cfg, step);
      if (boss) r.bossT = Math.max(0, r.bossT - step / slow);
      if (r.volleyT <= 1e-9) {
        r.volleyT += hitSec;
        var at = {};
        for (var key in ctx) at[key] = ctx[key];
        at.now = (ctx.now || 0) - (dt - t) * 1000;
        volley(state, at);
      }
      // The volley did not kill it: the same boss still stands with no time left.
      if (boss && r.bossT <= 1e-9 && isBoss(cfg, r.wave) && !r.farm) failBoss(state, cfg);
    }
  }

  // ---- events (only while playing) -----------------------------------------------------------------

  /** How much more often events come: Караванщик, each level past up.caravan.soft adds less. */
  function eventSpeed(state, cfg) { return (1 + upgradeEffective(state, cfg, 'caravan') * cfg['up.caravan.step']) * perk(state, cfg, 'events'); }

  function eventDelay(state, cfg, rng) {
    var speed = eventSpeed(state, cfg);
    return rng.range(cfg['event.minSec'], cfg['event.maxSec']) / speed;
  }

  function startEvent(state, ctx) {
    var cfg = ctx.config;
    var r = state.run;
    var now = ctx.now;
    var ids = EVENTS.filter(function (id) {
      if (id === 'wanderer') return pairLevel(state, cfg) > 0;
      if (id === 'order') return r.stats.forged > 0;
      return true;
    });
    var id = ctx.rng.weighted(ids, function (x) { return cfg['event.w.' + x]; });
    if (!id) return null;
    var rate = farmRateNow(state, cfg);
    if (id === 'caravan') r.event = { id: id, gold: Big.str(Big.max(Big.mul(rate, cfg['event.caravan.sec']), goldOf(cfg, r.wave))), until: now + cfg['event.ttlSec'] * 1000 };
    else if (id === 'wanderer') r.event = { id: id, level: pairLevel(state, cfg), until: now + cfg['event.ttlSec'] * 1000 };
    else if (id === 'starfall') {
      r.starfallUntil = now + cfg['event.starfall.sec'] * 1000;
      r.event = { id: id, until: r.starfallUntil };
    } else if (id === 'storm') {
      r.stormLeft += cfg['event.storm.blades'];
      r.event = { id: id, until: now + 10000, blades: cfg['event.storm.blades'] };
    } else if (id === 'order') {
      r.event = { id: id, level: Math.max(forgeLevel(state, cfg) + 1, maxOnGrid(state, cfg)), until: now + cfg['event.order.sec'] * 1000,
        reward: Big.str(Big.max(Big.mul(rate, cfg['event.order.rewardSec']), Big.mul(goldOf(cfg, r.wave), 10))) };
    }
    r.stats.events = num(r.stats.events, 0) + 1;
    return r.event;
  }

  /** The highest level with at least two blades (the wanderer takes two of them), or 0. */
  function pairLevel(state, cfg) {
    var counts = {};
    var best = 0;
    openCells(state, cfg).forEach(function (c) {
      var n = state.run.grid[c];
      if (!n) return;
      counts[n] = (counts[n] || 0) + 1;
      if (counts[n] >= 2 && n > best) best = n;
    });
    return best;
  }

  function maxOnGrid(state, cfg) {
    var best = 0;
    openCells(state, cfg).forEach(function (c) { if (state.run.grid[c] > best) best = state.run.grid[c]; });
    return best;
  }

  function events(state, dt, ctx) {
    var r = state.run;
    var e = r.event;
    if (e && (e.done || ctx.now > e.until)) r.event = null;
    r.eventT -= dt;
    if (r.eventT <= 0) {
      r.eventT = eventDelay(state, ctx.config, ctx.rng);
      if (!r.event && ctx.rng.chance(ctx.config['event.chance'])) startEvent(state, ctx);
    }
  }

  /** Takes the offer of the current event (caravan: the chest; wanderer: the trade). */
  function acceptEvent(state, cfg, now) {
    var r = state.run;
    var e = r.event;
    if (!e) return null;
    if (e.id === 'caravan') {
      r.gold = Big.add(r.gold, e.gold);
      r.earned = Big.add(r.earned, e.gold);
      r.event = null;
      return { id: 'caravan', gold: e.gold };
    }
    if (e.id === 'wanderer') {
      var cells = openCells(state, cfg).filter(function (c) { return r.grid[c] === e.level; });
      if (cells.length < 2) {
        r.event = null;
        return null;
      }
      r.grid[cells[1]] = 0;
      r.grid[cells[0]] = e.level + 2;
      noteLevel(state, e.level + 2, now);
      r.event = null;
      return { id: 'wanderer', level: e.level + 2 };
    }
    return null;
  }

  function dismissEvent(state) {
    state.run.event = null;
    return true;
  }

  // ---- upgrades ----------------------------------------------------------------------------------------

  /** Levels that still do something when the limit is `limit`, `step` a level from `from` (never negative). */
  function room(from, limit, step) {
    if (!(step > 0)) return Infinity;
    return Math.max(0, Math.ceil((limit - from) / step - 1e-9));
  }

  /**
   * The last level of an upgrade. Only what follows from other settings stops one: the forge's and
   * the apprentice's shortest interval, the crit cap, the 35 cells, the 7 sockets, a share of 100 %.
   * The rest have no last level (up.<id>.max is a guard, 10 000 by default).
   */
  function upMax(state, cfg, id) {
    var max = cfg['up.' + id + '.max'];
    if (id === 'steel') max = Math.min(max, room(1 + mfLevel(state, 'startLevel'), cfg['forge.maxLevel'], cfg['up.steel.step']));
    if (id === 'bellows') {
      var left = Math.log(cfg['forge.minInterval'] / cfg['forge.interval']) / Math.log(1 - cfg['up.bellows.step']);
      if (left === left && left >= 0) max = Math.min(max, Math.ceil(left));
    }
    if (id === 'apprentice') max = Math.min(max, 1 + room(cfg['apprentice.minInterval'], cfg['apprentice.interval'], cfg['up.apprentice.step']));
    if (id === 'night') max = Math.min(max, room(cfg['offline.share'], 1, cfg['up.night.step']));
    if (id === 'runeMason') max = Math.min(max, room(cfg['rune.base'] + mfLevel(state, 'rune'), SOCKETS.length, cfg['up.runeMason.step']));
    return Math.max(0, max);
  }

  function upCost(state, cfg, id) { return Big.costGeom(cfg['up.' + id + '.base'], cfg['up.' + id + '.growth'], lvl(state, id), 1); }

  /** Can the upgrade be bought at all now (not at its cap, open)? */
  function upUnlocked(state, cfg, id) {
    if (id === 'hammer') return state.run.maxWave >= cfg['up.hammer.fromWave'];
    // A skill opens at its wave; its cooldown, once the skill is bought.
    var up = UP_BY[id];
    if (up && up.skill && up.skill !== 'cry') {
      if (state.run.maxWave < num(cfg['up.' + up.skill + '.fromWave'], 0)) return false;
      if (up.cd && !lvl(state, up.skill)) return false;
    }
    if (id === 'cryCd' && !lvl(state, 'cry')) return false;
    if (id === 'ember' || id === 'pilot') return state.run.maxWave >= cfg['up.' + id + '.fromWave'];
    return !((id === 'runeMason' || id === 'runePower') && !runesOpen(state, cfg));
  }

  function upOpen(state, cfg, id) {
    if (!upUnlocked(state, cfg, id)) return false;
    return lvl(state, id) < upMax(state, cfg, id);
  }

  function buyUp(state, cfg, id) {
    if (!upOpen(state, cfg, id)) return false;
    var price = upCost(state, cfg, id);
    if (Big.lt(state.run.gold, price)) return false;
    // The sockets keep the cells they have before the anvil grows; a new one takes its cell now.
    placeSockets(state, cfg);
    state.run.gold = Big.sub(state.run.gold, price);
    state.run.up[id] = lvl(state, id) + 1;
    placeSockets(state, cfg);
    return true;
  }

  // ---- «Горн мастера» --------------------------------------------------------------------------------

  function mfDecl(id) {
    for (var i = 0; i < MF.length; i++) if (MF[i].id === id) return MF[i];
    return null;
  }

  /** One level for a node that opens a thing once, no last level for the rest. */
  function mfMax(cfg, id) { return mfDecl(id).single ? 1 : Infinity; }

  function mfCost(state, cfg, id) {
    var growth = mfDecl(id).single ? 1 : cfg['mf.' + id + '.growth'];
    return Math.ceil(cfg['mf.' + id + '.cost'] * Math.pow(growth, mfLevel(state, id)));
  }

  function mfOpen(state, cfg, id) {
    var d = mfDecl(id);
    if (!d) return false;
    if (d.needs && mfLevel(state, d.needs) < 1) return false;
    return mfLevel(state, id) < mfMax(cfg, id);
  }

  function buyMf(state, cfg, id) {
    if (!mfOpen(state, cfg, id)) return false;
    var l = forgeLayer(state);
    var price = mfCost(state, cfg, id);
    if (Big.lt(l.currency, price)) return false;
    l.currency = Big.str(Big.sub(l.currency, price));
    l.state.spent += price;
    l.state.mf[id] = mfLevel(state, id) + 1;
    return true;
  }

  /** The gold a run starts with at level n of «Стартовое золото» (a Big). */
  function startGoldAt(cfg, n) {
    var base = Big.of(cfg['start.gold']);
    if (!n) return base;
    return Big.add(base, Big.mul(cfg['mf.startGold.amount'], Big.pow(cfg['mf.startGold.mult'], n - 1)));
  }

  function startGold(state, cfg) { return startGoldAt(cfg, mfLevel(state, 'startGold')); }

  // ---- the functions the engine calls ----------------------------------------------------------------

  function newRun(cfg, rng) {
    var grid = [];
    for (var i = 0; i < CELLS; i++) grid.push(0);
    var run = {
      gold: Big.str(Big.of(cfg['start.gold'])), earned: '0e0', grid: grid, pending: [], up: {}, runes: [],
      forgeT: cfg['forge.interval'], appT: 0, tapBudget: cfg['forge.tapsPerSec'], taps: 0,
      wave: 1, hp: '0e0', hpMax: '0e0', bossT: 0, farm: false, maxWave: 1, volleyT: cfg['combat.hitSec'], volleys: 0, crits: [],
      walkT: cfg['wave.walkSec'], lastHit: '0e0', lastGold: '0e0', lastBoss: null, farmRate: '0e0',
      eventT: rng ? rng.range(cfg['event.minSec'], cfg['event.maxSec']) : cfg['event.minSec'], event: null, stormLeft: 0,
      starfallUntil: 0, cryUntil: 0, cryReadyAt: 0, bellowsUntil: 0, orderPaid: null, heat: 0, keptStart: 0, runup: 0,
      socketAt: [], socketsRandom: true,
      stats: { forged: 0, merged: 0, sold: 0, kills: 0, bosses: 0, fails: 0, events: 0 }
    };
    // The first blades lie on the anvil already (the start of the 4×5 block).
    var n = Math.min(cfg['grid.startBlades'], cfg['grid.start']);
    for (var k = 0; k < n; k++) run.grid[ORDER[k]] = 1;
    run.hp = Big.str(hpOf(cfg, 1));
    run.hpMax = run.hp;
    return run;
  }

  function init(ctx) {
    var state = { run: newRun(ctx.config, ctx.rng), layers: {}, meta: { album: { 1: 1 }, feats: {}, names: {}, bestLevel: 1 } };
    Outpost.ensure(state);
    Adventures.ensure(state);
    Artifacts.ensure(state);
    return state;
  }

  // A temporary artifact applies only to its remaining seconds, including a large offline step.
  function artifactSegments(state, dt, ctx, apply) {
    var left = Math.max(0, num(dt, 0)), end = ctx.now || 0, budget = ctx.config['offline.maxEvents'];
    if (!left) { apply(0, ctx, budget); Artifacts.tick(state, 0); return; }
    while (left > 0) {
      var part = Math.min(left, Artifacts.nextExpiry(state));
      var step = {};
      for (var key in ctx) step[key] = ctx[key];
      step.now = end - (left - part) * 1000;
      var events = apply(part, step, budget);
      budget = Math.max(0, budget - num(events, 0));
      Artifacts.tick(state, part);
      left = Math.max(0, left - part);
    }
  }
  function tick(state, dt, ctx) {
    ensure(state);
    artifactSegments(state, dt, ctx, function (part, step, budget) { return tickSegment(state, part, step, budget); });
  }
  function tickSegment(state, dt, ctx, budget) {
    var cfg = ctx.config;
    ensure(state);
    placeSockets(state, cfg);
    // «Авто» of the skills: on the screen, never offline.
    if (!ctx.offline) autoSkills(state, cfg, ctx.now || 0);
    var r = state.run;
    Adventures.tick(state, dt, cfg);
    if (!ctx.offline) encounterOf(state, cfg);
    if (ctx.offline) {
      coolHeat(state, cfg, dt);
      Outpost.tick(state, dt, cfg, { offline: true });
      r.meetCooldown = Math.max(0, num(r.meetCooldown, 0) - dt);
    }
    r.tapBudget = Math.min(cfg['forge.tapsPerSec'], num(r.tapBudget, 0) + cfg['forge.tapsPerSec'] * dt);
    var eventsDone = workshop(state, dt, cfg, ctx.rng, ctx.now || 0, budget);
    if (ctx.offline) {
      var gold = Big.mul(r.farmRate, offlineShare(state, cfg) * dt * (ctx.mult || 1) * (1 + Artifacts.modifiers(state, cfg).offlineIncome));
      r.gold = Big.add(r.gold, gold);
      r.earned = Big.add(r.earned, gold);
      return eventsDone;
    }
    battle(state, dt, ctx);
    events(state, dt, ctx);
    r.farmRate = Big.str(farmRateNow(state, cfg));
    return eventsDone;
  }

  /** Offline: the workshop goes on (including overflow sales); battle gold uses farm rate × share. */
  function offline(state, sec, ctx) {
    var cfg = ctx.config;
    ensure(state);
    var r = state.run;
    var forged = r.stats.forged;
    var merged = r.stats.merged;
    var sold = r.stats.sold;
    var best = maxOnGrid(state, cfg);
    artifactSegments(state, sec, ctx, function (part, step, budget) {
      Adventures.tick(state, part, cfg);
      Outpost.tick(state, part, cfg, { offline: true });
      r.meetCooldown = Math.max(0, num(r.meetCooldown, 0) - part);
      var eventsDone = workshop(state, part, cfg, step.rng, step.now || 0, budget);
      var gold = Big.mul(r.farmRate, offlineShare(state, cfg) * part * (ctx.mult || 1) * (1 + Artifacts.modifiers(state, cfg).offlineIncome) * perk(state, cfg, 'offline'));
      r.gold = Big.add(r.gold, gold);
      r.earned = Big.add(r.earned, gold);
      return eventsDone;
    });
    var out = [];
    if (r.stats.forged > forged) out.push('Горн выковал клинков: ' + (r.stats.forged - forged));
    if (r.stats.sold > sold) out.push('Новые излишки проданы: ' + (r.stats.sold - sold));
    if (r.stats.merged > merged) out.push('Подмастерье слил пар: ' + (r.stats.merged - merged));
    var now = maxOnGrid(state, cfg);
    if (now > best) out.push('Лучший клинок теперь — уровень ' + now);
    if (!freeCells(state, cfg).length) out.push('Наковальня заполнена — новые клинки продаются');
    return { events: out };
  }

  function coalsFor(cfg, wave) {
    if (wave < cfg['coals.fromWave']) return 0;
    return Math.floor(Math.pow(Math.max(0, (wave - cfg['coals.base']) / cfg['coals.div']), cfg['coals.power']) + 1e-9);
  }

  /**
   * The coals of a reset whose run reached the coals `f` (coalsFor of its best wave) when `paid` were
   * paid before (the coals of the record): what lies above the record — whole, what lies below it —
   * coals.repeatShare of it. So every run past wave coals.fromWave gives something, a new record most.
   */
  function coalsPay(cfg, f, paid) {
    var share = Math.max(0, Math.min(1, num(cfg['coals.repeatShare'], 0)));
    var p = Math.max(0, num(paid, 0));
    return Math.floor(Math.max(0, f - p) + Math.min(f, p) * share + 1e-9);
  }

  /**
   * «Звёздный металл»: each ingot multiplies the coals of a reset by star.coalMult — the star reset
   * throws the forge back, and the next climb pays more, so the plateau after it is passed easier.
   */
  function starCoals(state, cfg) { return Math.pow(Math.max(1, num(cfg['star.coalMult'], 1)), ingots(state)); }

  /** What a reset of a run that reached wave `wave` would give now. */
  function coalsGain(state, cfg, wave) {
    ensure(state);
    return Math.floor(coalsPay(cfg, coalsFor(cfg, wave), forgeLayer(state).state.paid) * starCoals(state, cfg) + 1e-9);
  }

  function prestigeGain(state, layerId, cfg) {
    ensure(state);
    if (layerId === L1) return Big.of(coalsGain(state, cfg, state.run.maxWave));
    if (layerId === L2) {
      var total = forgeLayer(state).state.total;
      if (total < cfg['star.fromCoals']) return Big.ZERO;
      return Big.of(Math.max(0, Math.floor(Math.log(total) / Math.LN10 - cfg['star.offset'] + 1e-9)));
    }
    return Big.ZERO;
  }

  /**
   * The engine's «выгодно» on the reset: for coals — when the reset adds at least coals.hintShare of all
   * the coals there are (the first one — any). Below the record a run pays only a share, so the mark
   * waits for a run that is worth it rather than lighting up at wave 60 of every run.
   */
  function prestigeHint(state, layerId, cfg, info) {
    if (layerId !== L1) return null;
    var gain = Big.toNumber(Big.of(info && info.gain, 0));
    return gain >= Math.max(1, num(cfg['coals.hintShare'], 0) * coalsAll(state));
  }

  function bonus(state, layerId, amount, cfg) {
    if (layerId === L1) return 1 + cfg['coals.bonus'] * (Big.toNumber(Big.of(amount, 0)) + forgeLayer(state).state.spent);
    if (layerId === L2) return Math.pow(cfg['star.mult'], Big.toNumber(Big.of(amount, 0)));
    return 1;
  }

  function onPrestige(state, layerId, before, ctx) {
    var cfg = ctx.config;
    ensure(state);
    var l = forgeLayer(state);
    if (layerId === L1) {
      var f = coalsFor(cfg, before.run.maxWave);
      var gain = Math.floor(coalsPay(cfg, f, before.layers[L1] && before.layers[L1].state && before.layers[L1].state.paid) * starCoals(before, cfg) + 1e-9);
      l.state.paid = Math.max(l.state.paid, f);
      l.state.total += gain;
      l.state.record = Math.max(l.state.record, before.run.maxWave);
      // «Память наковальни»: the strongest blade (not above mf.memory.maxLevel) stays.
      if (mfLevel(state, 'memory') > 0) {
        var keep = 0;
        (before.run.grid || []).forEach(function (n) { if (n > keep) keep = Math.min(n, cfg['mf.memory.maxLevel']); });
        var camp = before.run.outpost;
        if (camp) {
          var gear = (camp.rack || []).slice();
          for (var hero in camp.equipment) if (camp.equipment[hero]) gear.push(camp.equipment[hero]);
          gear.forEach(function (item) { if (item.level > keep) keep = Math.min(item.level, cfg['mf.memory.maxLevel']); });
        }
        var free = freeCells(state, cfg);
        if (keep && free.length) state.run.grid[free[0]] = keep;
      }
    } else if (layerId === L2) {
      starLayer(state).state.record = Math.max(num(starLayer(state).state.record, 0), num(before.run.maxWave, 0));
    }
    state.run.gold = Big.str(startGold(state, cfg));
    state.run.taps = 0;
    Outpost.onPrestige(state);
    Adventures.onPrestige(state, cfg);
  }

  function migrate(state, fromVer) {
    // Version 2 adds companions alongside the unchanged numeric field and original economy.
    // No old blade, currency, seed, artist entry or unknown extension field is rewritten.
    if (fromVer < 3) { Outpost.migrate(state); Adventures.migrate(state); }
    Artifacts.ensure(state);
    return state;
  }

  function validate(state) {
    var r = state.run;
    // A save of this very version may predate a field added since (dragon.eaten came on 2026-11-17):
    // the parts fill what is missing before they judge, so a new field never reads as damage.
    try { Outpost.ensure(state); Adventures.ensure(state); Artifacts.ensure(state); } catch (ignored) { /* judged below */ }
    if (!r.grid || r.grid.length !== CELLS) return 'наковальня не 35 клеток';
    for (var i = 0; i < CELLS; i++) {
      var n = r.grid[i];
      if (typeof n !== 'number' || n < 0 || n % 1 !== 0 || n > 1000) return 'клетка ' + i + ': ' + n;
    }
    if (typeof r.wave !== 'number' || r.wave < 1 || r.wave % 1 !== 0) return 'волна не целое число: ' + r.wave;
    if (!Big.valid(r.gold) || Big.sign(r.gold) < 0) return 'золота меньше нуля';
    if (!Big.valid(r.hp)) return 'здоровье чудища не число';
    return Outpost.validate(state) || Adventures.validate(state) || Artifacts.validate(state);
  }

  function summary(state, cfg) {
    ensure(state);
    var parts = ['волна ' + state.run.wave];
    var rec = Math.max(state.run.maxWave, forgeLayer(state).state.record);
    if (rec > state.run.wave) parts.push('рекорд ' + rec);
    var l = forgeLayer(state);
    if (l.count) parts.push('перековок ' + l.count);
    var rate = Big.of(state.run.farmRate, 0);
    if (!Big.isZero(rate)) parts.unshift(Fmt.rate(rate));
    return { line: parts.join(' · ') };
  }

  /** When the anvil fills up (the notification «Наковальня заполнена»), without the apprentice. */
  function next(state, now, cfg) {
    ensure(state);
    if (apprenticeInterval(state, cfg)) return [];
    var free = freeCells(state, cfg).length;
    if (!free) return [];
    var sec = Math.max(0, state.run.forgeT) / forgeSpeed(state, cfg) + (free - 1) * forgeInterval(state, cfg, 0) / forgeSpeed(state, cfg);
    return [{ id: 'full', at: now + Math.ceil(sec) * 1000, text: 'Наковальня заполнена: пора сливать клинки' }];
  }

  /** The chest of «Пассажир»: blades one level above the forge; what does not fit waits for room. */
  function chest(state, rng, cfg) {
    ensure(state);
    var level = Math.min(forgeLevel(state, cfg) + cfg['chest.levelPlus'], 1000);
    for (var i = 0; i < cfg['chest.blades']; i++) state.run.pending.push(level);
    placePending(state, cfg, rng, 0);
    var waiting = state.run.pending.length;
    return {
      title: 'Сундук путника' + (waiting ? ': ' + waiting + ' ждут места на наковальне' : ''),
      items: [{ title: 'Клинки уровня ' + level, amount: cfg['chest.blades'] }]
    };
  }

  // ---- content without the model ----------------------------------------------------------------------

  var WORDS = {
    a: ['Древний', 'Глухой', 'Пыльный', 'Седой', 'Бледный', 'Кривой', 'Медный', 'Ночной'],
    b: ['страж', 'ползун', 'шептун', 'рогач', 'вой', 'жнец', 'топотун', 'грызун'],
    c: ['пришёл из-под старых стен', 'боится только звона стали', 'ходит кругами у ворот', 'носит ржавую корону', 'просыпается от стука молота'],
    goods: ['соль и сукно', 'бочку дёгтя', 'мешок угля', 'медные гвозди', 'шёлк с юга', 'сушёные яблоки']
  };

  var SHAPES = ['rat', 'blob', 'bones', 'golem', 'wolf', 'rider', 'serpent', 'ghost', 'dragon'];

  function procedural(kind, rng) {
    if (kind === 'caravan') return { title: 'Караван: ' + rng.pick(WORDS.goods), text: 'Купцы оставили сундук у ворот и ушли дальше', procedural: true };
    var gray = 90 + rng.int(0, 80);
    var color = '#' + [gray + rng.int(0, 30), gray, gray + rng.int(0, 30)].map(function (c) { return ('0' + Math.min(208, c).toString(16)).slice(-2); }).join('');
    return { title: rng.pick(WORDS.a) + ' ' + rng.pick(WORDS.b), text: rng.pick(WORDS.c), kind: 'чудище', shape: rng.pick(SHAPES), color: color, procedural: true };
  }

  function validateStock(kind, item) {
    if (/https?:|www\./.test((item.title || '') + (item.text || '') + (item.theme || ''))) return 'ссылка в тексте';
    if (kind === 'monsters' && !/^#[0-9a-fA-F]{6}$/.test(String(item.color || ''))) return 'цвет не #rrggbb';
    if (kind === 'blades') {
      var n = item.level;
      if (typeof n !== 'number' || n !== Math.floor(n) || n < 1 || n > 100000) return 'уровень не целое число от 1';
      if (!item.svg) return 'нет рисунка';
      // The blade stands upright inside one group turned by 45° (prompts/blades.md): otherwise the
      // model lays the guard and the hilt crooked against a diagonal blade.
      if (!/rotate\(\s*45[\s,]+32[\s,]+32\s*\)/.test(String(item.svg))) return 'клинок не в группе rotate(45 32 32)';
    }
    return null;
  }

  // ---- the bot (checks and tests): one second of play --------------------------------------------------

  var USEFUL = ['bellows', 'steel', 'sharp', 'purse', 'eye', 'hand', 'wide', 'twin', 'melt', 'apprentice', 'hourglass', 'hunter',
    'temper', 'runeMason', 'runePower', 'night', 'cry', 'banner', 'cryCd', 'midas', 'midasCd', 'strike', 'strikeCd', 'fury', 'furyCd'];

  /** The cheapest useful upgrade to buy now, or null. */
  function cheapest(state, cfg) {
    var best = null;
    var price = null;
    for (var i = 0; i < USEFUL.length; i++) {
      var id = USEFUL[i];
      if (!upOpen(state, cfg, id)) continue;
      if (id === 'temper' && state.meta.bestLevel < cfg['temper.fromLevel'] - 1) continue;
      var c = upCost(state, cfg, id);
      if (!price || Big.lt(c, price)) {
        best = id;
        price = c;
      }
    }
    return best;
  }

  /**
   * The bot's second: taps the forge, merges every pair, takes events, cries at bosses, retries a
   * lost boss when it looks winnable, sells the lowest blade when the anvil is stuck, then buys
   * the cheapest useful upgrade while there is gold. Returns how many it bought.
   */
  function botPlay(state, ctx, taps) {
    var cfg = ctx.config;
    var now = ctx.now || 0;
    ensure(state);
    var r = state.run;
    for (var i = 0; i < (taps || 0); i++) tap(state, cfg, ctx.rng, now);
    var guard = 0;
    while (guard++ < 40 && autoMerge(state, cfg, now)) { /* every pair */ }
    if (r.event && (r.event.id === 'caravan' || r.event.id === 'wanderer')) acceptEvent(state, cfg, now);
    // The skills: the gold one at any foe, the others at a boss.
    if (r.walkT <= 0 && r.encounter) {
      if (skillReady(state, cfg, 'midas', now)) useSkill(state, cfg, 'midas', now);
      if (r.bossT > 0) ['cry', 'fury', 'strike'].forEach(function (id) { if (skillReady(state, cfg, id, now)) useSkill(state, cfg, id, now); });
    }
    if (r.farm) {
      r.botFarm = num(r.botFarm, 0) + 1;
      var need = Big.mul(hpOf(cfg, r.wave + 1), cfg['boss.hpMult']);
      var can = Big.mul(dps(state, cfg, 0), bossTimer(state, cfg) * iceSlow(state, cfg));
      if (Big.gte(can, need) || r.botFarm >= 120) {
        r.botFarm = 0;
        retry(state, cfg);
      }
    }
    if (!freeCells(state, cfg).length && !pairLevel(state, cfg)) {
      var low = 0;
      var cell = -1;
      openCells(state, cfg).forEach(function (c) {
        if (r.grid[c] && (!low || r.grid[c] < low)) {
          low = r.grid[c];
          cell = c;
        }
      });
      if (cell >= 0 && low < forgeLevel(state, cfg) + 2) sell(state, cfg, cell);
    }
    var bought = 0;
    while (bought < 50) {
      var id = cheapest(state, cfg);
      if (!id || !buyUp(state, cfg, id)) break;
      bought++;
    }
    var l = forgeLayer(state);
    for (var k = 0; k < 10 && Big.gt(l.currency, 0); k++) {
      var pick = null;
      var cost = Infinity;
      MF.forEach(function (d) {
        if (d.outpost) return; // The legacy pacing bot does not silently choose a new play style.
        if (!mfOpen(state, cfg, d.id)) return;
        var c = mfCost(state, cfg, d.id);
        if (c < cost) {
          cost = c;
          pick = d.id;
        }
      });
      if (!pick || !buyMf(state, cfg, pick)) break;
    }
    return bought;
  }

  /** «Боевой клич» when ready: true when cried. */
  /** «Боевой клич»: one of the skills (useSkill), its cooldown with «Боевой клич: откат». */
  function cry(state, cfg, now) { return useSkill(state, cfg, 'cry', now); }


  // ---- blades as pictures: the base of each level, for the screen and for the artist ----------------

  var BEYOND_SHAPES = ['sword', 'heavy', 'saber', 'rune', 'star', 'knife'];

  function hex2(x) { var s = Math.round(Math.max(0, Math.min(255, x))).toString(16); return s.length < 2 ? '0' + s : s; }

  /** #rrggbb of a hue (0–360), saturation and lightness (0–1). */
  function hsl(h, s, l) {
    var a = s * Math.min(l, 1 - l);
    function f(n) {
      var k = (n + h / 30) % 12;
      return 255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)));
    }
    return '#' + hex2(f(0)) + hex2(f(8)) + hex2(f(4));
  }

  /**
   * A blade of level n: {level, title, color, shape}. Levels of content/blades.json have their
   * names; past them every level is a base of its own — the shape goes round, the metal's hue
   * turns by the golden angle — and a name the artist gave (art[n].title) when there is one.
   */
  function bladeOf(n, blades, art) {
    var list = blades && blades.list ? blades.list : [];
    if (n >= 1 && n <= list.length) return list[n - 1];
    var over = n - list.length;
    var named = art && art[n] && art[n].title;
    var template = blades && blades.beyond ? blades.beyond : 'Клинок звезды +{}';
    return {
      level: n,
      title: named || template.replace('{}', String(over)),
      color: hsl((over * 137.508) % 360, 0.55, 0.62),
      shape: BEYOND_SHAPES[over % BEYOND_SHAPES.length]
    };
  }

  /** The drawn base of a blade (blade, guard, hilt) as SVG: size 40 on the anvil, 64 for the artist. */
  function baseSvg(b, size) {
    var n = b.level;
    var guard = n >= 30 ? '#e6c870' : n >= 20 ? '#9aa6c8' : n >= 10 ? '#b8a070' : '#8a7458';
    var hilt = n >= 20 ? '#3a3448' : '#6a4a32';
    var blade;
    var wide = 12;
    if (b.shape === 'knife') blade = 'M17.5 27V15l2.5-5 2.5 5v12z';
    else if (b.shape === 'sword') blade = 'M18 27V8l2-5 2 5v19z';
    else if (b.shape === 'heavy') {
      blade = 'M16.5 27V10l3.5-6 3.5 6v17z';
      wide = 14;
    } else if (b.shape === 'saber') blade = 'M18 27c0-9 1-16 5-23-.4 8-1 15-1 23z';
    else if (b.shape === 'rune') {
      blade = 'M16.8 27V9l3.2-6 3.2 6v18z';
      wide = 14;
    } else blade = 'M17.6 27V7l2.4-5 2.4 5v20z';
    var extra = '<path d="M20 25V10" stroke="#000000" stroke-opacity=".25" stroke-width="1"/>';
    if (b.shape === 'rune') extra += '<path d="M19 13l2 2-2 2 2 2" stroke="#e8f0ff" stroke-opacity=".7" stroke-width=".9" fill="none"/>';
    if (b.shape === 'star') extra += '<path d="M20 4.5v4M18 6.5h4" stroke="#fff6d8" stroke-width="1.2"/>';
    var big = size === 64;
    return '<svg ' + (big ? 'xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"' : 'viewBox="0 0 40 40" aria-hidden="true"') +
      // At 64 (the artist's base) the frame the prompt asks for: the blade upright on x=32 inside
      // one group turned by 45° — the same picture as scale(1.6) rotate(45 20 20).
      (big ? '><g transform="rotate(45 32 32)"><g transform="scale(1.6)">' : '><g transform="rotate(45 20 20)">') +
      '<path d="' + blade + '" fill="' + b.color + '"/>' + extra +
      '<rect x="' + (20 - wide / 2) + '" y="26.5" width="' + wide + '" height="2.6" rx="1.2" fill="' + guard + '"/>' +
      '<rect x="19" y="29" width="2" height="6" rx=".8" fill="' + hilt + '"/>' +
      '<circle cx="20" cy="36.4" r="1.8" fill="' + guard + '"/></g>' + (big ? '</g>' : '') + '</svg>';
  }

  /**
   * The base for the model's artist (game.json "artist", engine/series.js): the drawn base of
   * level n at 64 and, for the levels of content/blades.json, their name to repeat.
   */
  function artBase(n, blades) {
    var list = blades && blades.list ? blades.list : [];
    return { svg: baseSvg(bladeOf(n, blades, null), 64), title: n >= 1 && n <= list.length ? list[n - 1].title : null };
  }

  /** «Раздуть горн» (a spend of energy): the forge's interval × bellows.mult for bellows.minutes. */
  function bellows(state, cfg, now) {
    state.run.bellowsUntil = Math.max(now, state.run.bellowsUntil || 0) + cfg['bellows.minutes'] * 60000;
    return true;
  }

  function acceptContract(state, cfg, offer, reward) {
    return Adventures.acceptContract(state, cfg, offer, reward, Outpost.benefits(state, cfg));
  }
  function previewContractDelivery(state, cfg, cells) {
    return Adventures.previewDelivery(state, cfg, cells, openCells(state, cfg), function (level) { return sellPrice(state, cfg, level); });
  }
  function deliverContract(state, cfg, cells) {
    return Adventures.deliver(state, cfg, cells, openCells(state, cfg), function (level) { return sellPrice(state, cfg, level); });
  }
  function claimContract(state, cfg) {
    var result = Adventures.claimContract(state, cfg, Outpost.benefits(state, cfg));
    if (result.ok) Outpost.onContract(state, cfg);
    return result;
  }

  return {
    outpost: Outpost, adventures: Adventures, artifacts: Artifacts, prepare: prepare, useAbility: useAbility, encounterView: encounterView,
    buyArtifact: buyArtifact, setArtifactEnabled: setArtifactEnabled, activateArtifact: activateArtifact,
    acceptContract: acceptContract, previewContractDelivery: previewContractDelivery, deliverContract: deliverContract, claimContract: claimContract,
    init: init, tick: tick, offline: offline, prestigeGain: prestigeGain, prestigeHint: prestigeHint, bonus: bonus, onPrestige: onPrestige,
    SKILLS: SKILLS, SKILL_IDS: SKILL_IDS, skillTimes: skillTimes, skillCooldown: skillCooldown, skillDuration: skillDuration, skillOn: skillOn,
    skillReady: skillReady, useSkill: useSkill, autoSkills: autoSkills, setAutoSkills: setAutoSkills, midasShare: midasShare, foeReward: foeReward,
    strikeSeconds: strikeSeconds, furyBonus: furyBonus,
    migrate: migrate, validate: validate, summary: summary, next: next, chest: chest,
    procedural: procedural, validateStock: validateStock,
    // the screen and the checks
    L1: L1, L2: L2, COLS: COLS, ROWS: ROWS, CELLS: CELLS, ORDER: ORDER, SOCKETS: SOCKETS, RUNES: RUNES, UP: UP, MF: MF, EVENTS: EVENTS,
    ensure: ensure, openCells: openCells, isOpen: isOpen, freeCells: freeCells, shape: shape, sockets: sockets, runeAt: runeAt,
    startCells: startCells, socketCells: socketCells, baseSocketCells: baseSocketCells, socketWant: socketWant, placeSockets: placeSockets, moveSocket: moveSocket, setRuneAll: setRuneAll, setRuneAuto: setRuneAuto, LEGACY_START: LEGACY_START,
    socketCount: socketCount, runesOpen: runesOpen, setRune: setRune, sortGrid: sortGrid,
    isBoss: isBoss, hpOf: hpOf, goldOf: goldOf, bladeDmg: bladeDmg, bladePrice: bladePrice, sellPrice: sellPrice, sellShare: sellShare,
    cellPower: cellPower, fieldPower: fieldPower, saleMult: saleMult, tapSeconds: tapSeconds, upUnlocked: upUnlocked,
    dmgMult: dmgMult, cellDmg: cellDmg, rawSum: rawSum, dps: dps, goldMult: goldMult, bossTimer: bossTimer, iceSlow: iceSlow,
    heat: heat, heatFloor: heatFloor, heatPower: heatPower, volleySpeed: volleySpeed, volleySec: volleySec,
    farmRateNow: farmRateNow, offlineShare: offlineShare, coalBonus: coalBonus, starMult: starMult, ingots: ingots,
    critChance: critChance, critMult: critMult, criticalStats: criticalStats, cryOn: cryOn, starfallOn: starfallOn,
    forgeLevel: forgeLevel, forgeInterval: forgeInterval, forgeSpeed: forgeSpeed, apprenticeInterval: apprenticeInterval, apprenticeSpeed: apprenticeSpeed,
    move: move, mergeNearest: mergeNearest, nearestTwin: nearestTwin, autoMerge: autoMerge, sell: sell, tap: tap,
    workshop: workshop, retry: retry, acceptEvent: acceptEvent, dismissEvent: dismissEvent, maxOnGrid: maxOnGrid, pairLevel: pairLevel,
    upMax: upMax, upCost: upCost, upOpen: upOpen, buyUp: buyUp, lvl: lvl, upgradeEffective: upgradeEffective, upgradeProgress: upgradeProgress, perk: perk,
    MODS: MODS, BOSS_MODS: BOSS_MODS, modOf: modOf, pickMod: pickMod, currentMod: currentMod, hash01: hash01,
    runupWalk: runupWalk, canMeet: canMeet, setAutoMeet: setAutoMeet,
    overcrit: overcrit, resonance: resonance, resonates: resonates, overheatLevels: overheatLevels, burstMult: burstMult, room: room,
    spawn: spawn, kill: kill, newEncounter: newEncounter,
    mfLevel: mfLevel, mfMax: mfMax, mfCost: mfCost, mfOpen: mfOpen, buyMf: buyMf, startGold: startGold, startGoldAt: startGoldAt, coalsFor: coalsFor, coalsGain: coalsGain, coalsPay: coalsPay, starCoals: starCoals,
    soft: soft, autoTaps: autoTaps, eventSpeed: eventSpeed, runePower: runePower,
    forgeLayer: forgeLayer, starLayer: starLayer, coalsAll: coalsAll,
    cheapest: cheapest, botPlay: botPlay, cry: cry, bellows: bellows, startEvent: startEvent,
    bladeOf: bladeOf, baseSvg: baseSvg, artBase: artBase
  };
});
