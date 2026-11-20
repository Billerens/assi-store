// Derived upgrade strength shared by the forge, equipped weapons and their UI previews.
// Milestones never claim rewards or change owned levels, prices or save data: they follow from the level.
//
// A milestone comes each time the price of an upgrade has grown milestone.price times (×10 000), and at
// least every milestone.maxSpan (25) levels: every 25 levels for Острота and Кошель, whose price grows
// slowly, every 12 for Закалка (×2.2 a level), every 7 for Знамя (×4) — the dear ones no longer wait a
// hundred waves for one. A milestone multiplies what the upgrade gives (×1.4; the upgrades that change
// how the game runs — more blades, a longer boss timer, more events, a stronger tap — ×1.1); every
// milestone.bigEach-th (4th) is a big one (×1.8 and ×1.2) and
// opens a perk: a small lasting bonus elsewhere. The two perks of an upgrade take turns, without end;
// a perk that comes again adds what it gave once more (×1.3, ×1.6, ×1.9…) — a perk multiplying itself
// with every big milestone would outgrow the foes, whose health grows by a power of the wave.
(function (root, make) {
  var api = make();
  if (typeof exports !== 'undefined') { for (var key in api) exports[key] = api[key]; }
  else root.MFUpgradeProgress = api;
})(this, function () {
  'use strict';
  var SUPPORTED = ['sharp', 'purse', 'hand', 'twin', 'temper', 'runePower', 'hunter', 'hourglass', 'cry', 'banner', 'caravan', 'hammer', 'stall'];
  var MECHANIC = ['twin', 'hourglass', 'caravan', 'hammer'];
  var SOFT = { caravan: 20, hammer: 8, stall: 8 };
  // The values the game's settings (milestone.*) have when a setting is missing. `every` is the step
  // of an upgrade whose price does not grow.
  var MILESTONE = { price: 10000, bigEach: 4, every: 25, maxSpan: 25, mult: 1.4, bigMult: 1.8, mechMult: 1.1, mechBigMult: 1.2 };
  // The two perks of each upgrade, in turn at its big milestones: what they change and by how much
  // (perk.<id>.a and perk.<id>.b in the settings). The kinds with a + are added, the others multiply.
  var PERKS = {
    sharp: [['critChance', 0.03], ['bossDmg', 1.5]],
    purse: [['bossGold', 1.5], ['offline', 1.5]],
    hand: [['critChance', 0.02], ['critMult', 1.3]],
    twin: [['forgeSpeed', 1.1], ['twin', 0.25]],
    temper: [['bossDmg', 1.25], ['dmg', 1.25]],
    runePower: [['bossTime', 3], ['dmg', 1.2]],
    hunter: [['gold', 1.25], ['bossGold', 2]],
    hourglass: [['bossTime', 5], ['bossDmg', 1.3]],
    cry: [['dmg', 1.1], ['critMult', 1.2]],
    banner: [['gold', 1.2], ['dmg', 1.3]],
    caravan: [['events', 1.25], ['gold', 1.25]],
    hammer: [['tap', 1.5], ['forgeSpeed', 1.15]],
    stall: [['sale', 1.25], ['gold', 1.2]]
  };
  var ADDED = { critChance: true, bossTime: true, twin: true };
  var KINDS = ['dmg', 'bossDmg', 'gold', 'bossGold', 'critChance', 'critMult', 'bossTime', 'forgeSpeed', 'sale', 'offline', 'events', 'tap', 'twin'];
  var BIG = Number.MAX_VALUE;

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
  function finite(value) { return isFinite(value) ? value : BIG; }
  /** Levels between two milestones of upgrade id: how many it takes for its price to grow milestone.price times. */
  function span(id, cfg) {
    var growth = Number(cfg && cfg['up.' + id + '.growth']);
    var price = setting(cfg, 'price');
    var most = Math.max(2, Math.floor(setting(cfg, 'maxSpan')));
    if (!(growth > 1) || !(price > 1)) return Math.min(most, Math.max(1, Math.floor(MILESTONE.every)));
    return Math.min(most, Math.max(2, Math.round(Math.log(price) / Math.log(growth))));
  }
  function bigEach(cfg) { return Math.max(1, Math.floor(setting(cfg, 'bigEach'))); }
  function mults(id, cfg) {
    var mech = mechanic(id);
    return { small: Math.max(1, setting(cfg, mech ? 'mechMult' : 'mult')), big: Math.max(1, setting(cfg, mech ? 'mechBigMult' : 'bigMult')) };
  }
  /** The milestones level n of upgrade id has passed: {count, small, big} (a big one in place of a small one). */
  function passed(id, n, cfg) {
    var count = Math.floor(n / span(id, cfg));
    var big = Math.floor(count / bigEach(cfg));
    return { count: count, small: count - big, big: big };
  }
  /** What the milestones of level n multiply the upgrade by. */
  function milestone(id, n, cfg) {
    if (!supported(id)) return 1;
    var p = passed(id, n, cfg), m = mults(id, cfg);
    return finite(Math.pow(m.small, p.small) * Math.pow(m.big, p.big));
  }
  function factor(id, n, cfg) {
    return finite((1 + (n ? 0.04 / (1 + 100 / n) : 0)) * milestone(id, n, cfg));
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
    return raw > BIG / mult ? BIG : raw * mult;
  }

  function perkValue(id, i, cfg) {
    var v = Number(cfg && cfg['perk.' + id + '.' + (i ? 'b' : 'a')]);
    return isFinite(v) && v >= 0 ? v : PERKS[id][i][1];
  }
  /** The perk of the j-th big milestone of upgrade id (j from 1): {at, index, kind, value, added}. */
  function perkAt(id, j, cfg) {
    if (!PERKS[id] || !(j >= 1)) return null;
    var i = (j - 1) % 2;
    var kind = PERKS[id][i][0];
    return { at: j * bigEach(cfg) * span(id, cfg), index: i, kind: kind, value: perkValue(id, i, cfg), added: !!ADDED[kind] };
  }
  /** How many times each of the two perks has opened by `big` big milestones: [first, second]. */
  function perkCounts(big) { return [Math.ceil(big / 2), Math.floor(big / 2)]; }
  /** What a perk of value v gives when it has opened `count` times: v × count added, or 1 + (v − 1) × count. */
  function perkTotal(kind, v, count) { return finite(ADDED[kind] ? v * count : 1 + (v - 1) * count); }

  /**
   * The two perks of upgrade id at level `value`: [{index, kind, value, added, count, on, at}], `count` —
   * how many times it has opened, `at` — the level where it comes next.
   */
  function perks(id, value, cfg) {
    if (!PERKS[id]) return [];
    var n = level(value), big = passed(id, n, cfg).big, counts = perkCounts(big);
    return [0, 1].map(function (i) {
      var kind = PERKS[id][i][0];
      // The next big milestone with this perk: the first one after `big` whose turn it is.
      var j = big + 1;
      if ((j - 1) % 2 !== i) j++;
      var v = perkValue(id, i, cfg);
      return { index: i, kind: kind, value: v, added: !!ADDED[kind], count: counts[i], on: counts[i] > 0, total: perkTotal(kind, v, counts[i]), at: j * bigEach(cfg) * span(id, cfg) };
    });
  }

  /** All the perks the levels `levels` ({id: level}) have opened, by kind: a sum for the added kinds, a product for the rest. */
  function perkTotals(levels, cfg) {
    var out = {};
    KINDS.forEach(function (k) { out[k] = ADDED[k] ? 0 : 1; });
    for (var id in PERKS) {
      if (!Object.prototype.hasOwnProperty.call(PERKS, id)) continue;
      var counts = perkCounts(passed(id, level(levels && levels[id]), cfg).big);
      for (var i = 0; i < 2; i++) {
        if (!counts[i]) continue;
        var kind = PERKS[id][i][0], total = perkTotal(kind, perkValue(id, i, cfg), counts[i]);
        out[kind] = finite(ADDED[kind] ? out[kind] + total : out[kind] * total);
      }
    }
    return out;
  }

  function progress(id, value, cfg) {
    var n = level(value), on = supported(id);
    var s = span(id, cfg), each = bigEach(cfg);
    // Beyond exact integer precision a fictitious "next level" would equal this one.
    var count = Math.floor(n / s);
    var next = on && n < 9007199254740980 ? (count + 1) * s : null;
    var nextBig = next !== null && (count + 1) % each === 0;
    var m = mults(id, cfg);
    var big = passed(id, n, cfg).big;
    return {
      supported: on, level: n,
      effective: effective(id, n, cfg), nextEffective: effective(id, n + 1, cfg),
      factor: on ? factor(id, n, cfg) : 1, previousFactor: on ? factor(id, Math.max(0, n - 1), cfg) : 1, nextFactor: on ? factor(id, n + 1, cfg) : 1,
      milestone: on ? milestone(id, n, cfg) : 1,
      every: s,
      bigEach: each,
      nextAt: next,
      nextBig: nextBig,
      nextMult: next === null ? 1 : (nextBig ? m.big : m.small),
      perks: on ? perks(id, n, cfg) : [],
      nextPerk: on && next !== null ? perkAt(id, big + 1, cfg) : null
    };
  }

  /** The milestones and perks passed when an upgrade goes from level `from` to level `to`: [{at, mult, big, perk}]. */
  function crossed(id, from, to, cfg) {
    if (!supported(id)) return [];
    var a = level(from), z = level(to), s = span(id, cfg), each = bigEach(cfg), m = mults(id, cfg);
    var out = [];
    for (var k = Math.floor(a / s) + 1; k * s <= z && out.length < 100; k++) {
      var big = k % each === 0;
      out.push({ at: k * s, mult: big ? m.big : m.small, big: big, perk: big ? perkAt(id, k / each, cfg) : null });
    }
    return out;
  }

  /** Levels that still do something when the limit is `limit`, `step` a level from `from`. */
  function room(from, limit, step) {
    if (!(step > 0)) return Infinity;
    return Math.max(0, Math.ceil((limit - from) / step - 1e-9));
  }

  /**
   * «Сокрушительный удар»: past the cap of the crit chance every level of «Глаз мастера» adds up.eye.over to
   * the chance that a crit strikes once more (a crit of a crit); past 1 — a second layer surely and a chance
   * of a third, and so on.
   */
  function overcrit(levels, cfg) {
    var n = level(levels && levels.eye);
    var cap = room(Number(cfg['crit.chance']) || 0, Number(cfg['crit.maxChance']) || 0, Number(cfg['up.eye.step']) || 0);
    var over = Number(cfg['up.eye.over']);
    return n > cap && over > 0 ? (n - cap) * over : 0;
  }

  /** What a crit gives on average with the smashing ones: m × m^⌊o⌋ × (1 − frac + frac × m). */
  function critAverage(m, o) {
    if (!(o > 0)) return m;
    var whole = Math.floor(o);
    var frac = o - whole;
    var value = m * Math.pow(m, whole) * (1 - frac + frac * m);
    return isFinite(value) ? value : Number.MAX_VALUE;
  }

  return { supported: supported, mechanic: mechanic, strength: strength, effective: effective, progress: progress,
    perks: perks, perkAt: perkAt, perkTotals: perkTotals, crossed: crossed, span: span, bigEach: bigEach, PERKS: PERKS, KINDS: KINDS,
    room: room, overcrit: overcrit, critAverage: critAverage };
});
