// Derived upgrade strength shared by the forge, equipped weapons and their UI previews.
// Milestones never claim rewards or change owned levels, prices or save data: they follow from the level.
//
// Every 25th level multiplies what an upgrade gives (×1.5, every 100th ×2; the upgrades that change how
// the game runs — more blades, a longer boss timer, more events, a stronger tap — ×1.2 and ×1.4), and
// the 50th and the 100th level of each also open a perk of its own: a small lasting bonus elsewhere.
(function (root, make) {
  var api = make();
  if (typeof exports !== 'undefined') { for (var key in api) exports[key] = api[key]; }
  else root.MFUpgradeProgress = api;
})(this, function () {
  'use strict';
  var SUPPORTED = ['sharp', 'purse', 'hand', 'twin', 'temper', 'runePower', 'hunter', 'hourglass', 'cry', 'banner', 'caravan', 'hammer', 'stall'];
  var MECHANIC = ['twin', 'hourglass', 'caravan', 'hammer'];
  var SOFT = { caravan: 20, hammer: 8, stall: 8 };
  // The values the game's settings (milestone.*) have when a setting is missing.
  var MILESTONE = { every: 25, mult: 1.5, bigEvery: 100, bigMult: 2, mechMult: 1.2, mechBigMult: 1.4 };
  // The perk each upgrade opens at its 50th and its 100th level: what it changes and by how much
  // (perk.<id>.<level> in the settings). The kinds with a + are added, the others multiply.
  var PERKS = {
    sharp: [[50, 'critChance', 0.03], [100, 'bossDmg', 1.5]],
    purse: [[50, 'bossGold', 1.5], [100, 'offline', 1.5]],
    hand: [[50, 'critChance', 0.02], [100, 'critMult', 1.3]],
    twin: [[50, 'forgeSpeed', 1.1], [100, 'twin', 0.25]],
    temper: [[50, 'bossDmg', 1.25], [100, 'dmg', 1.25]],
    runePower: [[50, 'bossTime', 3], [100, 'dmg', 1.2]],
    hunter: [[50, 'gold', 1.25], [100, 'bossGold', 2]],
    hourglass: [[50, 'bossTime', 5], [100, 'bossDmg', 1.3]],
    cry: [[50, 'dmg', 1.1], [100, 'critMult', 1.2]],
    banner: [[50, 'gold', 1.2], [100, 'dmg', 1.3]],
    caravan: [[50, 'events', 1.25], [100, 'gold', 1.25]],
    hammer: [[50, 'tap', 1.5], [100, 'forgeSpeed', 1.15]],
    stall: [[50, 'sale', 1.25], [100, 'gold', 1.2]]
  };
  var ADDED = { critChance: true, bossTime: true, twin: true };
  var KINDS = ['dmg', 'bossDmg', 'gold', 'bossGold', 'critChance', 'critMult', 'bossTime', 'forgeSpeed', 'sale', 'offline', 'events', 'tap', 'twin'];

  function level(value) {
    var n = Number(value);
    return isFinite(n) && n > 0 ? Math.floor(n) : 0;
  }
  function supported(id) { return SUPPORTED.indexOf(id) >= 0; }
  function mechanic(id) { return MECHANIC.indexOf(id) >= 0; }
  function setting(cfg, name) {
    var value = Number(cfg && cfg['milestone.' + name]);
    return isFinite(value) && value >= 0 ? value : MILESTONE[name];
  }
  function every(cfg) { return Math.max(1, Math.floor(setting(cfg, 'every'))); }
  function bigEvery(cfg) { return Math.max(every(cfg), Math.floor(setting(cfg, 'bigEvery'))); }
  function mults(id, cfg) {
    var mech = mechanic(id);
    return { small: Math.max(1, setting(cfg, mech ? 'mechMult' : 'mult')), big: Math.max(1, setting(cfg, mech ? 'mechBigMult' : 'bigMult')) };
  }
  /** How many milestones level n has passed: {small, big} (a big one is every bigEvery-th, in place of a small one). */
  function passed(n, cfg) {
    var e = every(cfg), b = bigEvery(cfg);
    var all = Math.floor(n / e);
    var big = b % e === 0 ? Math.floor(n / b) : 0;
    return { small: all - big, big: big };
  }
  /** What the milestones of level n multiply the upgrade by. */
  function milestone(id, n, cfg) {
    if (!supported(id)) return 1;
    var p = passed(n, cfg), m = mults(id, cfg);
    var value = Math.pow(m.small, p.small) * Math.pow(m.big, p.big);
    return isFinite(value) ? value : Number.MAX_VALUE;
  }
  function factor(id, n, cfg) {
    var value = (1 + (n ? 0.04 / (1 + 100 / n) : 0)) * milestone(id, n, cfg);
    return isFinite(value) ? value : Number.MAX_VALUE;
  }
  function strength(id, value, cfg) { return supported(id) ? factor(id, level(value), cfg) : 1; }
  function base(id, n, cfg) {
    if (!Object.prototype.hasOwnProperty.call(SOFT, id)) return n;
    var knee = Number(cfg && cfg['up.' + id + '.soft']);
    if (!(knee > 0) || !isFinite(knee)) knee = SOFT[id];
    return n > knee ? knee * (1 + Math.log(n) - Math.log(knee)) : n;
  }
  function effective(id, value, cfg) {
    var n = level(value);
    if (!supported(id)) return n;
    var raw = base(id, n, cfg), mult = factor(id, n, cfg);
    return raw > Number.MAX_VALUE / mult ? Number.MAX_VALUE : raw * mult;
  }

  /** The perks of upgrade id: [{at, kind, value, added, on}] for level `value`. */
  function perks(id, value, cfg) {
    var n = level(value);
    return (PERKS[id] || []).map(function (p) {
      var v = Number(cfg && cfg['perk.' + id + '.' + p[0]]);
      if (!isFinite(v) || v < 0) v = p[2];
      return { at: p[0], kind: p[1], value: v, added: !!ADDED[p[1]], on: n >= p[0] };
    });
  }

  /** All the perks the levels `levels` ({id: level}) have opened, by kind: a sum for the added kinds, a product for the rest. */
  function perkTotals(levels, cfg) {
    var out = {};
    KINDS.forEach(function (k) { out[k] = ADDED[k] ? 0 : 1; });
    for (var id in PERKS) {
      if (!Object.prototype.hasOwnProperty.call(PERKS, id)) continue;
      perks(id, levels && levels[id], cfg).forEach(function (p) {
        if (!p.on) return;
        if (p.added) out[p.kind] += p.value;
        else out[p.kind] *= p.value;
      });
    }
    return out;
  }

  function progress(id, value, cfg) {
    var n = level(value), on = supported(id);
    var e = every(cfg), b = bigEvery(cfg);
    // Beyond exact integer precision a fictitious "next level" would equal this one.
    var next = on && n < 9007199254740980 ? (Math.floor(n / e) + 1) * e : null;
    var m = mults(id, cfg);
    var list = perks(id, n, cfg);
    var nextPerk = null;
    for (var i = 0; i < list.length; i++) if (!list[i].on) { nextPerk = list[i]; break; }
    return {
      supported: on, level: n,
      effective: effective(id, n, cfg), nextEffective: effective(id, n + 1, cfg),
      factor: on ? factor(id, n, cfg) : 1, previousFactor: on ? factor(id, Math.max(0, n - 1), cfg) : 1, nextFactor: on ? factor(id, n + 1, cfg) : 1,
      milestone: on ? milestone(id, n, cfg) : 1,
      every: e,
      nextAt: next,
      nextBig: next !== null && b % e === 0 && next % b === 0,
      nextMult: next === null ? 1 : (b % e === 0 && next % b === 0 ? m.big : m.small),
      perks: list,
      nextPerk: nextPerk
    };
  }

  /** The milestones and perks passed when an upgrade goes from level `from` to level `to`: [{at, mult, perk}]. */
  function crossed(id, from, to, cfg) {
    if (!supported(id)) return [];
    var a = level(from), z = level(to), e = every(cfg), b = bigEvery(cfg), m = mults(id, cfg);
    var out = [];
    var list = perks(id, z, cfg);
    for (var at = (Math.floor(a / e) + 1) * e; at <= z && out.length < 100; at += e) {
      var perk = null;
      for (var i = 0; i < list.length; i++) if (list[i].at === at) perk = list[i];
      out.push({ at: at, mult: b % e === 0 && at % b === 0 ? m.big : m.small, perk: perk });
    }
    return out;
  }

  return { supported: supported, mechanic: mechanic, strength: strength, effective: effective, progress: progress,
    perks: perks, perkTotals: perkTotals, crossed: crossed, PERKS: PERKS, KINDS: KINDS };
});
