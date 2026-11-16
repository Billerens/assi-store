// The logic of «Рыбалка»: a cast, the wait with false bites, the hook window, the fight on the
// line, the catch, the aquarium that earns while the phone is in the pocket, waters, weather,
// events and the season (prestige). Shared subset of JavaScript: it runs on the screen
// (window.GameSim), in the engine (Rhino, require) and in node. No class, no async, no
// f(...args), no for (let …); randomness only from ctx.rng / the rng given.
//
// The whole cast is a state machine in state.run.cast stepped by tick; the screen only sets the
// input (press / release). Every number is a setting of config.json (ctx.config or cfg); the
// species, waters and texts are content/*.json (on the screen — window.FishingContent).
(function (root, make) {
  var node = typeof require === 'function' && typeof exports !== 'undefined';
  var api = node
    ? make(require('../engine/big.js'), require('../engine/fmt.js'), require('../engine/rng.js'), function () {
      root.__fishingContent = root.__fishingContent || {
        species: require('./content/species.json'), waters: require('./content/waters.json'),
        world: require('./content/world.json'), trophies: require('./content/trophies.json'),
        notes: require('./content/notes.json'), config: require('./config.json')
      };
      return root.__fishingContent;
    })
    : make(root.Big, root.Fmt, root.Rng, function () { return root.FishingContent; });
  if (typeof exports !== 'undefined') { for (var k in api) exports[k] = api[k]; } else { root.GameSim = api; }
})(this, function (Big, Fmt, Rng, source) {
  'use strict';

  var LAYER = 'season';
  var TIERED = ['rod', 'reel', 'line', 'hook', 'float', 'aquarium', 'filter', 'light', 'cat'];
  var ONEOFF = ['landing', 'sonar', 'spoon', 'jig', 'keepnet', 'absorber', 'boat', 'rod2', 'journal'];
  var PACKS = ['groundbait', 'bloodworm', 'livebait'];
  var BAITS = ['worm', 'bloodworm', 'livebait', 'spoon', 'jig', 'gold'];
  var COUNTED = ['bloodworm', 'livebait', 'gold'];
  var WEATHER = ['clear', 'cloudy', 'rain', 'fog', 'wind'];
  var PERIODS = ['morning', 'day', 'evening', 'night'];
  var ZONES = ['shore', 'middle', 'deep'];
  var PHASES = ['idle', 'aim', 'wait', 'bite', 'late', 'fight', 'caught'];
  var SACK_MAX = 100;
  var NEWS_MAX = 8;
  var HINTS_MAX = 20;
  var SNAG_POWER = 0.45;
  var MIN = 60000;
  var lastCfg = null;

  // ---- content ----------------------------------------------------------------------------------

  var cache = null;

  /** The content as indexes (built once per content object; the content itself is never changed). */
  function K() {
    var c = source();
    if (!c || !c.species) throw new Error('нет содержимого игры (content/*.json)');
    if (cache && cache.src === c) return cache;
    var x = {
      src: c, sp: {}, byWater: {}, water: {}, order: {}, waters: c.waters, kinds: [], kindName: {},
      trophies: c.trophies || [], trophy: {}, world: c.world || {}, notes: c.notes || {}, config: c.config || {}
    };
    c.waters.forEach(function (w, i) {
      x.water[w.id] = w;
      x.order[w.id] = i;
      x.byWater[w.id] = [];
    });
    c.species.forEach(function (s) {
      x.sp[s.id] = s;
      if (x.byWater[s.water]) x.byWater[s.water].push(s);
      var kind = s.kind || s.id;
      if (!x.kindName[kind]) {
        x.kindName[kind] = s.name;
        x.kinds.push(kind);
      }
    });
    x.trophies.forEach(function (t) { x.trophy[t.id] = t; });
    cache = x;
    return x;
  }

  function defaultOf(key) {
    var d = K().config[key];
    return d ? d.value : undefined;
  }

  /** A setting from the config given, or the last one seen, or config.json's default. */
  function setting(cfg, key) {
    var v = cfg ? cfg[key] : undefined;
    if (v === undefined && lastCfg) v = lastCfg[key];
    if (v === undefined) v = defaultOf(key);
    return v;
  }

  function kindOf(sp) { return sp ? sp.kind || sp.id : null; }

  function spOf(state, id) {
    var k = K();
    if (k.sp[id]) return k.sp[id];
    var s = state && state.meta && state.meta.seasonal;
    if (s && s.sp && s.sp.id === id) return s.sp;
    return null;
  }

  /** The species of a water: the content's and this month's seasonal legend when it lives there. */
  function waterSpecies(state, water) {
    var list = K().byWater[water] || [];
    var s = state && state.meta && state.meta.seasonal;
    if (s && s.sp && s.sp.water === water) list = list.concat([s.sp]);
    return list;
  }

  function nameOf(state, id) {
    var sp = spOf(state, id);
    if (sp) return sp.name;
    var names = state && state.meta && state.meta.names;
    return names && names[id] ? names[id] : id;
  }

  function waterTitle(id) {
    var w = K().water[id];
    return w ? w.title : id;
  }

  // ---- levels, season ---------------------------------------------------------------------------

  function lvl(state, id) { return Number(state.run.up[id]) || 0; }
  function owned(state, id) { return lvl(state, id) > 0; }

  function seasonOf(state) {
    var l = state.layers && state.layers[LAYER];
    return (l ? Number(l.count) || 0 : 0) + 1;
  }

  function mastery(state) {
    var l = state.layers && state.layers[LAYER];
    return l ? Math.floor(Big.toNumber(Big.of(l.currency, 0))) : 0;
  }

  // ---- time, weather ----------------------------------------------------------------------------

  function pad(n) { return n < 10 ? '0' + n : String(n); }
  function hourOf(now) { return new Date(now).getHours(); }
  function dayOf(now) {
    var d = new Date(now);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function monthOf(now) {
    var d = new Date(now);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1);
  }

  /** The period of a local hour: утро 5–10, день 10–18, вечер 18–23, ночь 23–5 (settings). */
  function periodOfHour(h, cfg) {
    var night = cfg['hours.night'] > cfg['hours.evening'] ? cfg['hours.night'] : 24;
    if (h >= night || h < cfg['hours.morning']) return 'night';
    if (h < cfg['hours.day']) return 'morning';
    if (h < cfg['hours.evening']) return 'day';
    return 'evening';
  }

  /** The period the fish feel now: «Ранняя зорька» makes it morning on any water. */
  function periodAt(state, now, cfg) {
    if (state && state.run.dawnUntil > now) return 'morning';
    return periodOfHour(hourOf(now), cfg);
  }

  function lanternOn(state, now, cfg) {
    return !!(state && state.run.lantern) && seasonOf(state) >= cfg['season.lantern'] &&
      periodAt(state, now, cfg) === 'night';
  }

  /** Whether it is the species' hours: its periods, or any at night under the lantern (not legends). */
  function inHours(sp, state, now, cfg) {
    if (sp.rarity !== 'legend' && lanternOn(state, now, cfg)) return true;
    return sp.hours.indexOf(periodAt(state, now, cfg)) >= 0;
  }

  /** The weather of a water now: one of five, every weather.periodHours by a seed of the day. */
  function weatherAt(water, now, cfg) {
    var w = K().water[water];
    if (w && w.underground) return 'any';
    var per = cfg['weather.periodHours'] || 2;
    var slot = Math.floor(hourOf(now) / per);
    var r = Rng.make(Rng.hash('fishing:' + dayOf(now) + ':' + slot + ':' + water));
    var picked = r.weighted(WEATHER, function (id) { return Math.max(0, Number(cfg['weather.' + id]) || 0); });
    return picked || 'clear';
  }

  function inWeather(sp, water, now, cfg) {
    var w = weatherAt(water, now, cfg);
    return w === 'any' || sp.weather.indexOf('any') >= 0 || sp.weather.indexOf(w) >= 0;
  }

  // ---- distance, zones --------------------------------------------------------------------------

  function maxRange(state, cfg) {
    var m = cfg['cast.range'] * (1 + cfg['rod.range'] * lvl(state, 'rod')) + (owned(state, 'boat') ? cfg['boat.meters'] : 0);
    if (lvl(state, 'rod') < cfg['rod.deepLevel']) m = Math.min(m, cfg['zone.deep'] - 0.5);
    return Math.max(cfg['cast.min'], m);
  }

  function zoneIndex(d, cfg) { return d >= cfg['zone.deep'] ? 2 : d >= cfg['zone.middle'] ? 1 : 0; }

  function zoneMult(home, at, cfg) {
    var k = Math.abs(home - at);
    return k === 0 ? 1 : k === 1 ? cfg['zone.near'] : cfg['zone.far'];
  }

  /** Where a species stands now: rare fish wander between zones (the sonar shows it). */
  function fishZone(sp, now, cfg) {
    var home = Math.max(0, ZONES.indexOf(sp.zone));
    if (sp.rarity !== 'rare') return home;
    var slot = Math.floor(now / (Math.max(1, cfg['rare.wanderMin']) * MIN));
    var r = Rng.make(Rng.hash('fishing:rare:' + sp.id + ':' + slot));
    if (r.next() < cfg['rare.homeChance']) return home;
    var other = [0, 1, 2].filter(function (z) { return z !== home; });
    return other[r.int(other.length)];
  }

  /** A good distance into a zone (the middle of it, within reach). */
  function zoneDistance(state, cfg, zone) {
    var max = maxRange(state, cfg);
    var d = zone === 2 ? cfg['zone.deep'] + 6 : zone === 1 ? (cfg['zone.middle'] + Math.min(max, cfg['zone.deep'])) / 2 : cfg['zone.middle'] / 2;
    return Math.max(cfg['cast.min'], Math.min(max, d));
  }

  // ---- chances ----------------------------------------------------------------------------------

  function baitMult(sp, use, frac, cfg) {
    var m = 1;
    if (use === 'gold' || sp.bait === use) m *= cfg['mult.bait'];
    if (use === 'spoon' && sp.predator) m *= cfg['spoon.mult'] * (1 + cfg['spoon.range'] * frac);
    return m;
  }

  /** The weights of the bite: species weight × hours × weather × bait × zone (legends apart). */
  function chances(state, cfg, now, d, use) {
    var water = state.run.water;
    var frac = Math.max(0, Math.min(1, d / maxRange(state, cfg)));
    var at = zoneIndex(d, cfg);
    var out = [];
    waterSpecies(state, water).forEach(function (sp) {
      if (sp.rarity === 'legend') return;
      var w = sp.weight * (inHours(sp, state, now, cfg) ? cfg['mult.hours'] : 1) *
        (inWeather(sp, water, now, cfg) ? cfg['mult.weather'] : 1) * baitMult(sp, use, frac, cfg) *
        zoneMult(fishZone(sp, now, cfg), at, cfg);
      if (w > 0) out.push({ sp: sp, w: w });
    });
    return out;
  }

  /** Legends that may bite now: only in their hours and their weather. */
  function legendsNow(state, cfg, now, water) {
    water = water || state.run.water;
    return waterSpecies(state, water).filter(function (sp) {
      return sp.rarity === 'legend' && inHours(sp, state, now, cfg) && inWeather(sp, water, now, cfg);
    });
  }

  /** Species whose hours and weather are now (the line «сейчас клюёт»). */
  function bitingNow(state, cfg, now, water) {
    water = water || state.run.water;
    return waterSpecies(state, water).filter(function (sp) {
      return sp.rarity !== 'legend' && inHours(sp, state, now, cfg) && inWeather(sp, water, now, cfg);
    });
  }

  // ---- weight, stars, price ---------------------------------------------------------------------

  function normal(rng) {
    var u = rng.next();
    var v = rng.next();
    if (u < 1e-12) u = 1e-12;
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function rollWeight(sp, rng, cfg) {
    var w = sp.avg * (1 + cfg['weight.sd'] * normal(rng));
    w = Math.max(sp.avg * cfg['weight.min'], Math.min(sp.max, w));
    return Math.round(w * 1000) / 1000;
  }

  function starsOf(state, sp, w, cfg) {
    var j = state.meta.journal[kindOf(sp)];
    var best = j ? j.best : 0;
    if (!best || w >= best) return 3;
    return w >= cfg['stars.two'] * best ? 2 : 1;
  }

  /** price = base × weight^0,8 × (1 + 0,25 × (stars − 1)), plus 4 % for each point of mastery. */
  function priceOf(state, sp, w, stars, cfg) {
    var p = sp.base * Math.pow(w, cfg['price.power']) * (1 + cfg['price.star'] * (stars - 1)) *
      (1 + cfg['mastery.price'] * mastery(state)) * cfg['price.mult'] * (sp.rarity === 'common' ? 1 : cfg['rare.price']);
    return Math.max(1, Math.round(p));
  }

  function hookWindow(state, cfg) {
    return cfg['hook.window'] * (1 + cfg['float.per'] * lvl(state, 'float')) * (1 + cfg['mastery.window'] * mastery(state));
  }

  function keepChance(state, cfg) { return Math.min(cfg['hook.keepMax'], cfg['hook.keepPer'] * lvl(state, 'hook')); }

  // ---- money, aquarium, sack --------------------------------------------------------------------

  function earn(state, amount) {
    if (!Big.gt(amount, 0)) return;
    state.run.coins = Big.add(state.run.coins, amount);
    state.run.earned = Big.add(state.run.earned, amount);
  }

  function litres(state, cfg) {
    var all = cfg['aquarium.litres'] + cfg['aquarium.per'] * lvl(state, 'aquarium');
    return cfg['aquarium.max'] > 0 ? Math.min(cfg['aquarium.max'], all) : all;
  }

  function fishLitres(w, cfg) { return w * cfg['aquarium.perKg']; }

  function usedLitres(state, cfg) {
    var sum = 0;
    state.run.aq.forEach(function (f) { sum += fishLitres(f.w, cfg); });
    return sum;
  }

  function fits(state, cfg, w) { return usedLitres(state, cfg) + fishLitres(w, cfg) <= litres(state, cfg) + 1e-9; }

  /** Coins a minute from the aquarium (before the links' multiplier): 0,02 × price of each fish. */
  function aqRate(state, cfg) {
    var light = 1 + cfg['light.per'] * lvl(state, 'light');
    var sum = 0;
    state.run.aq.forEach(function (f) { sum += f.p * (f.r === 'c' ? 1 : light); });
    return sum * cfg['aquarium.rate'] * (1 + cfg['filter.per'] * lvl(state, 'filter'));
  }

  function aqValue(state) {
    var sum = 0;
    state.run.aq.forEach(function (f) { sum += f.p; });
    return sum;
  }

  function sackValue(state) {
    var sum = 0;
    state.run.sack.forEach(function (f) { sum += f.p * (f.n || 1); });
    return sum;
  }

  function sackCount(state) {
    var n = 0;
    state.run.sack.forEach(function (f) { n += f.n || 1; });
    return n;
  }

  function addSack(state, fish, n) {
    var sack = state.run.sack;
    n = n || 1;
    for (var i = 0; i < sack.length; i++) {
      var f = sack[i];
      if (f.sp === fish.sp && f.s === fish.s && f.p === fish.p && f.w === fish.w) {
        f.n = (f.n || 1) + n;
        return;
      }
    }
    var entry = { sp: fish.sp, w: fish.w, s: fish.s, p: fish.p, r: fish.r, n: n };
    if (fish.nm) entry.nm = fish.nm;
    sack.push(entry);
    while (sack.length > SACK_MAX) {
      var old = sack.shift();
      earn(state, old.p * (old.n || 1));
    }
  }

  function sellSack(state, cfg) {
    var sum = sackValue(state);
    state.run.sack = [];
    earn(state, sum);
    return sum;
  }

  function sellAq(state, cfg, i) {
    var f = state.run.aq[i];
    if (!f) return 0;
    state.run.aq.splice(i, 1);
    earn(state, f.p);
    return f.p;
  }

  function releaseAq(state, cfg, i) {
    var f = state.run.aq[i];
    if (!f) return 0;
    state.run.aq.splice(i, 1);
    state.run.released += f.p;
    state.meta.releasedAll = (state.meta.releasedAll || 0) + f.p;
    return f.p;
  }

  // ---- news (what the screen shows once) --------------------------------------------------------

  function news(state, kind, text, extra) {
    state.meta.newsId = (Number(state.meta.newsId) || 0) + 1;
    var item = { n: state.meta.newsId, kind: kind, text: text };
    for (var k in extra || {}) item[k] = extra[k];
    state.run.news.push(item);
    while (state.run.news.length > NEWS_MAX) state.run.news.shift();
    return item;
  }

  // ---- the shop ---------------------------------------------------------------------------------

  function waterCost(cfg, id) { return Big.of(cfg['water.' + id + '.cost'] || 0); }

  /** Levels of a tiered upgrade; 0 in the settings means no limit: the price just keeps growing. */
  function upMax(cfg, id) {
    var max = cfg['up.' + id + '.max'];
    return max > 0 ? max : Infinity;
  }

  /** The price of an item now, or null when it cannot be bought (all levels, owned). */
  function costOf(state, cfg, id) {
    if (TIERED.indexOf(id) >= 0) {
      var l = lvl(state, id);
      if (l >= upMax(cfg, id)) return null;
      if (id === 'aquarium' && cfg['aquarium.max'] > 0 && litres(state, cfg) >= cfg['aquarium.max']) return null;
      return Big.ceil(Big.mul(cfg['up.' + id + '.base'], Big.pow(cfg['up.' + id + '.growth'], l)));
    }
    if (ONEOFF.indexOf(id) >= 0) return owned(state, id) ? null : Big.of(cfg['up.' + id + '.price']);
    if (id === 'groundbait') return Big.of(cfg['shop.groundbait.price']);
    if (id === 'bloodworm' || id === 'livebait') {
      var step = Math.max(0, K().order[state.run.water] || 0);
      return Big.ceil(Big.mul(cfg['shop.' + id + '.price'], Math.pow(cfg['shop.packGrowth'], step)));
    }
    return null;
  }

  /** Buys an item (the cheapest upgrade when no id): true when bought. */
  function buy(state, cfg, id) {
    if (!id) {
      var best = null;
      var price = null;
      TIERED.concat(ONEOFF).forEach(function (k) {
        var c = costOf(state, cfg, k);
        if (c && (!price || Big.lt(c, price))) {
          best = k;
          price = c;
        }
      });
      if (!best) return false;
      id = best;
    }
    var cost = costOf(state, cfg, id);
    if (!cost || Big.lt(state.run.coins, cost)) return false;
    state.run.coins = Big.sub(state.run.coins, cost);
    var r = state.run;
    if (id === 'groundbait') r.ground += 1;
    else if (id === 'bloodworm' || id === 'livebait') r.bait[id] += cfg['shop.' + id + '.pack'];
    else r.up[id] = lvl(state, id) + 1;
    return true;
  }

  /** Why a water cannot be opened now (null — it can, given the coins). */
  function waterLock(state, cfg, id) {
    var k = K();
    var w = k.water[id];
    if (!w) return 'нет такого водоёма';
    if (state.run.waters.indexOf(id) >= 0) return 'уже открыт';
    if (w.season && seasonOf(state) < cfg['season.waters']) return 'откроется с сезона ' + cfg['season.waters'];
    var i = k.order[id];
    if (i > 0 && state.run.waters.indexOf(k.waters[i - 1].id) < 0) return 'сначала «' + k.waters[i - 1].title + '»';
    if (w.needs && !owned(state, w.needs)) return 'нужна ' + (w.needs === 'jig' ? 'мормышка' : w.needs);
    return null;
  }

  function openWater(state, cfg, id) {
    if (waterLock(state, cfg, id)) return false;
    var cost = waterCost(cfg, id);
    if (Big.lt(state.run.coins, cost)) return false;
    state.run.coins = Big.sub(state.run.coins, cost);
    state.run.waters.push(id);
    return true;
  }

  /** The next water to open in order, or null. */
  function nextWater(state, cfg) {
    var list = K().waters;
    for (var i = 0; i < list.length; i++) {
      if (state.run.waters.indexOf(list[i].id) < 0) return list[i];
    }
    return null;
  }

  function firstSix(state) {
    return K().waters.filter(function (w) { return !w.season; }).every(function (w) { return state.run.waters.indexOf(w.id) >= 0; });
  }

  function idle(state) {
    var p = state.run.cast.phase;
    return p === 'idle';
  }

  function setWater(state, id) {
    if (state.run.waters.indexOf(id) < 0 || !idle(state)) return false;
    state.run.water = id;
    return true;
  }

  function baitAvailable(state, id) {
    if (id === 'worm') return true;
    if (COUNTED.indexOf(id) >= 0) return state.run.bait[id] > 0;
    if (id === 'spoon' || id === 'jig') return owned(state, id);
    return false;
  }

  function setBait(state, id) {
    if (BAITS.indexOf(id) < 0 || !baitAvailable(state, id)) return false;
    state.run.use = id;
    return true;
  }

  function useGroundbait(state, cfg, now) {
    if (!(state.run.ground > 0)) return false;
    state.run.ground -= 1;
    state.run.groundUntil = Math.max(now, state.run.groundUntil) + cfg['groundbait.minutes'] * MIN;
    return true;
  }

  /** «Ранняя зорька» after the steps were spent: clёв как утром на любом водоёме. */
  function dawn(state, cfg, now) {
    state.run.dawnUntil = Math.max(now, state.run.dawnUntil) + cfg['dawn.minutes'] * MIN;
    return state.run.dawnUntil;
  }

  /** A won bet: «Жор» for the evening (till bet.zhorUntil o'clock, at least bet.zhorMin minutes). */
  function zhorTonight(state, cfg, now) {
    var d = new Date(now);
    d.setHours(Math.min(23, cfg['bet.zhorUntil']), cfg['bet.zhorUntil'] >= 24 ? 59 : 0, 0, 0);
    var until = Math.max(d.getTime(), now + cfg['bet.zhorMin'] * MIN);
    state.run.zhorUntil = Math.max(state.run.zhorUntil, until);
    news(state, 'zhor', 'Ставка выиграна — жор до ' + pad(new Date(until).getHours()) + ':' + pad(new Date(until).getMinutes()));
    return until;
  }

  function setLantern(state, cfg, on) {
    if (seasonOf(state) < cfg['season.lantern']) return false;
    state.run.lantern = !!on;
    return true;
  }

  /** The old fisherman: 5 fish of one species from the sack for golden bait. */
  function trade(state, cfg, spId, now) {
    if (!(state.run.fisherUntil > now)) return false;
    var need = cfg['fisher.need'];
    var have = 0;
    state.run.sack.forEach(function (f) { if (f.sp === spId) have += f.n || 1; });
    if (have < need) return false;
    var left = need;
    var keep = [];
    state.run.sack.forEach(function (f) {
      if (f.sp !== spId || left <= 0) {
        keep.push(f);
        return;
      }
      var n = f.n || 1;
      var take = Math.min(n, left);
      left -= take;
      if (n - take > 0) {
        f.n = n - take;
        keep.push(f);
      }
    });
    state.run.sack = keep;
    state.run.bait.gold += cfg['fisher.gold'];
    state.run.fisherUntil = 0;
    news(state, 'trade', 'Старый рыбак дал ' + cfg['fisher.gold'] + ' золотой наживки');
    return true;
  }

  /** Species in the sack with enough fish for the old fisherman. */
  function tradeable(state, cfg) {
    var by = {};
    state.run.sack.forEach(function (f) { by[f.sp] = (by[f.sp] || 0) + (f.n || 1); });
    var out = [];
    for (var k in by) if (by[k] >= cfg['fisher.need']) out.push(k);
    return out;
  }

  // ---- the cast ---------------------------------------------------------------------------------

  function waitTime(state, cfg, now, rng) {
    var speed = Number(cfg['bait.' + state.run.use + '.speed']) || 0;
    if (state.run.groundUntil > now) speed += cfg['groundbait.speed'];
    var t = rng.range(cfg['bite.min'], cfg['bite.max']) * Math.max(0.1, 1 - speed);
    if (state.run.zhorUntil > now) t *= cfg['zhor.wait'];
    return t;
  }

  /** Throws the line at `frac` of the reach (0..1). The bait goes into the water: charged once. */
  function throwAt(state, cfg, now, rng, frac, auto) {
    var r = state.run;
    if (r.cast.phase !== 'idle' && r.cast.phase !== 'aim') return false;
    if (r.pending) return false;
    if (!baitAvailable(state, r.use)) r.use = 'worm';
    if (COUNTED.indexOf(r.use) >= 0) r.bait[r.use] -= 1;
    var max = maxRange(state, cfg);
    var d = Math.max(cfg['cast.min'], Math.min(max, (frac > 0 ? frac : 0) * max));
    var t = waitTime(state, cfg, now, rng);
    var falses = [];
    var n = rng.int(Math.max(0, Math.floor(cfg['bite.falseMax'])) + 1);
    var room = t - cfg['bite.falseGap'] - cfg['bite.falseSec'];
    for (var i = 0; i < n && room > 0.5; i++) falses.push(Math.round(rng.range(0.5, room) * 100) / 100);
    falses.sort(function (a, b) { return a - b; });
    r.cast = { phase: 'wait', d: Math.round(d * 10) / 10, el: 0, bt: t, fl: falses, bait: r.use, charged: true, auto: !!auto };
    r.casts += 1;
    return true;
  }

  /** The bite: what is on the hook is decided now (the shoal, a snag, a legend, by weights). */
  function startBite(state, cfg, now, rng) {
    var r = state.run;
    var c = r.cast;
    var pick = null;
    var snag = null;
    if (r.shoal && r.shoal.left > 0 && r.shoal.water === r.water && spOf(state, r.shoal.sp)) {
      pick = spOf(state, r.shoal.sp);
      r.shoal.left -= 1;
      if (r.shoal.left <= 0) r.shoal = null;
    } else if (rng.next() < cfg['snag.chance']) {
      snag = rng.pick(K().trophies).id;
    } else {
      var legends = legendsNow(state, cfg, now);
      for (var i = 0; i < legends.length && !pick; i++) if (rng.next() < cfg['legend.chance']) pick = legends[i];
      if (!pick) {
        var list = chances(state, cfg, now, c.d, c.bait);
        var one = rng.weighted(list, 'w');
        pick = one ? one.sp : null;
      }
    }
    if (!pick && !snag) snag = rng.pick(K().trophies).id;
    var next = { phase: 'bite', d: c.d, el: 0, win: hookWindow(state, cfg), bait: c.bait, charged: true, auto: c.auto };
    if (snag) {
      next.snag = snag;
      next.w = 1;
    } else {
      next.sp = pick.id;
      next.w = rollWeight(pick, rng, cfg);
    }
    if (c.auto) next.react = rng.range(cfg['bot.reactMin'], cfg['bot.reactMax']);
    r.cast = next;
  }

  function lose(state, cfg, reason) {
    var r = state.run;
    var c = r.cast;
    r.cast = { phase: 'idle', msg: reason, msgT: 2.5, sp: c.sp || null };
    if (reason === 'snap') {
      state.meta.streak = 0;
      state.meta.snaps = (Number(state.meta.snaps) || 0) + 1;
    }
    return reason;
  }

  function startFight(state, cfg) {
    var c = state.run.cast;
    state.run.cast = {
      phase: 'fight', sp: c.sp || null, snag: c.snag || null, w: c.w, d: c.d, d0: c.d,
      T: cfg['fight.startTension'], hold: true, ft: 0, over: 0, slack: 0, used: false, shore: false,
      jerks: 0, jt: 0, auto: c.auto, want: true, rt: 0, charged: true
    };
    return 'hooked';
  }

  /** The press of the one button: aim / early tap / hook / late hook / reel in. */
  function press(state, cfg, now, rng) {
    var r = state.run;
    var c = r.cast;
    if (c.phase === 'idle') {
      if (r.pending) return 'pending';
      r.cast = { phase: 'aim', fill: 0 };
      return 'aim';
    }
    if (c.phase === 'wait') return lose(state, cfg, 'early');
    if (c.phase === 'bite') return startFight(state, cfg);
    if (c.phase === 'late') {
      if (rng.next() < keepChance(state, cfg)) return startFight(state, cfg);
      return lose(state, cfg, 'missed');
    }
    if (c.phase === 'fight') {
      c.hold = true;
      return 'hold';
    }
    return c.phase;
  }

  function release(state, cfg, now, rng) {
    var c = state.run.cast;
    if (c.phase === 'aim') {
      throwAt(state, cfg, now, rng, c.fill, false);
      return 'cast';
    }
    if (c.phase === 'fight') {
      c.hold = false;
      return 'release';
    }
    return null;
  }

  function biteStep(state, cfg, dt, rng) {
    var c = state.run.cast;
    c.el += dt;
    if (c.auto && c.react !== undefined && c.el >= c.react) {
      if (c.phase === 'bite') startFight(state, cfg);
      else press(state, cfg, 0, rng);
      return;
    }
    if (c.phase === 'bite' && c.el >= c.win) c.phase = 'late';
    if (c.phase === 'late' && c.el >= c.win + cfg['hook.late']) lose(state, cfg, 'missed');
  }

  /** The strength of the fish on the line now: power × (weight/avg)^0,5 × fatigue / the line. */
  function loadOf(state, cfg, c) {
    var sp = c.snag ? null : spOf(state, c.sp);
    var power = sp ? sp.power : SNAG_POWER;
    var ratio = sp ? Math.sqrt(c.w / sp.avg) : 1;
    var strength = cfg['line.strength'] * (1 + cfg['line.per'] * lvl(state, 'line'));
    var stamina = cfg['fight.stamina'] * ratio;
    var fat = Math.max(cfg['fight.fatigueMin'], 1 - c.ft / stamina);
    return { load: power * cfg['power.mult'] * ratio * fat / strength, fat: fat, jerks: sp ? sp.jerks : 0, sp: sp };
  }

  /** The bot's rule «держать до 80, отпускать до 50», with a reaction delay. */
  function autopilot(c, cfg, dt, rng) {
    var want = c.want;
    if (c.hold && c.T >= cfg['bot.high']) want = false;
    else if (!c.hold && c.T <= cfg['bot.low']) want = true;
    if (want !== c.hold) {
      if (c.want !== want) {
        c.want = want;
        c.rt = rng.range(cfg['bot.reactMin'], cfg['bot.reactMax']);
      }
      c.rt -= dt;
      if (c.rt <= 0) c.hold = want;
    } else {
      c.want = want;
    }
  }

  function fightStep(state, cfg, dt, now, rng) {
    var c = state.run.cast;
    var L = loadOf(state, cfg, c);
    var reel = cfg['reel.speed'] * (1 + cfg['reel.per'] * lvl(state, 'reel'));
    if (c.auto) autopilot(c, cfg, dt, rng);
    if (c.hold) {
      c.T += (cfg['tension.rise'] + cfg['tension.load'] * L.load) * dt;
      c.d += (cfg['fish.swimHold'] * L.load - reel) * dt;
    } else {
      c.T -= cfg['tension.fall'] * dt;
      c.d += cfg['fish.swim'] * L.load * dt;
    }
    if (L.jerks > 0 && rng.next() < L.jerks * cfg['jerk.mult'] * L.fat * dt) {
      c.T += cfg['jerk.tension'] * L.load;
      c.d += cfg['jerk.run'] * L.load;
      c.jerks += 1;
      c.jt = 0.35;
    }
    c.jt = Math.max(0, (c.jt || 0) - dt);
    c.T = Math.max(0, Math.min(cfg['tension.cap'], c.T));
    c.ft += dt;
    if (c.T >= 100) {
      c.over += dt;
      if (c.over > cfg['snap.sec']) {
        if (owned(state, 'absorber') && !c.used) {
          c.used = true;
          c.T = cfg['absorber.to'];
          c.over = 0;
        } else {
          return lose(state, cfg, 'snap');
        }
      }
    } else {
      c.over = 0;
    }
    if (c.T < cfg['slack.below']) {
      c.slack += dt;
      if (c.slack > cfg['slack.sec']) return lose(state, cfg, 'slack');
    } else {
      c.slack = 0;
    }
    if (c.d > cfg['line.spool']) return lose(state, cfg, 'run');
    if (c.d <= cfg['shore.meters'] && !c.shore) {
      c.shore = true;
      if (L.sp && c.w > cfg['net.big'] * L.sp.avg && !owned(state, 'landing') && rng.next() < cfg['net.slip']) return lose(state, cfg, 'slip');
    }
    if (c.d <= 0) return land(state, cfg, now, rng);
    return null;
  }

  /** The fish beats the worst in the aquarium by value per litre (the smart keepnet, the bot). */
  function worthAquarium(state, cfg, fish) {
    if (fits(state, cfg, fish.w)) return true;
    var worst = null;
    state.run.aq.forEach(function (f) {
      var v = f.p / fishLitres(f.w, cfg);
      if (worst === null || v < worst) worst = v;
    });
    return worst !== null && fish.p / fishLitres(fish.w, cfg) > worst * 1.05 && fishLitres(fish.w, cfg) <= litres(state, cfg);
  }

  function land(state, cfg, now, rng) {
    var r = state.run;
    var c = r.cast;
    var meta = state.meta;
    if (c.snag) {
      var t = K().trophy[c.snag];
      var isNew = !meta.trophies[c.snag];
      var coins = 0;
      if (isNew) meta.trophies[c.snag] = now;
      else {
        coins = cfg['snag.coins'] * ((K().order[r.water] || 0) + 1);
        earn(state, coins);
      }
      r.pending = { snag: c.snag, name: t ? t.name : c.snag, isNew: isNew, coins: coins };
      r.cast = { phase: 'caught' };
      news(state, 'snag', 'Зацеп: ' + (t ? t.name : c.snag), { snag: c.snag, isNew: isNew });
      return 'landed';
    }
    var sp = spOf(state, c.sp);
    var kind = kindOf(sp);
    var j = meta.journal[kind];
    var stars = starsOf(state, sp, c.w, cfg);
    var p = priceOf(state, sp, c.w, stars, cfg);
    var first = !j;
    var record = !j || c.w > j.best;
    if (!j) j = meta.journal[kind] = { n: 0, best: 0, first: now };
    j.n += 1;
    if (c.w > j.best) j.best = c.w;
    if (sp.seasonal) meta.names[sp.id] = sp.name;
    meta.caughtAll = (Number(meta.caughtAll) || 0) + 1;
    meta.streak = (Number(meta.streak) || 0) + 1;
    if (meta.streak > (meta.bestStreak || 0)) meta.bestStreak = meta.streak;
    if (hourOf(now) === cfg['ach.hour']) meta.flags.night3 = true;
    if (sp.rarity === 'legend') meta.legends = (Number(meta.legends) || 0) + 1;
    if (c.w > (meta.heaviest || 0)) meta.heaviest = c.w;
    r.caught += 1;
    r.lastSp = sp.rarity === 'common' ? sp.id : r.lastSp;
    var fish = { sp: sp.id, w: c.w, s: stars, p: p, r: sp.rarity.charAt(0) };
    if (sp.seasonal) fish.nm = sp.name;
    tourneyCheck(state, cfg, sp, c.w, now);
    if (owned(state, 'keepnet') && sp.rarity === 'common' && !first && !worthAquarium(state, cfg, fish)) {
      earn(state, p);
      r.cast = { phase: 'idle', msg: 'sold', msgT: 2, sp: sp.id, w: c.w, s: stars, p: p };
      return 'sold';
    }
    fish.first = first;
    fish.record = record;
    r.pending = fish;
    r.cast = { phase: 'caught' };
    if (sp.rarity === 'legend') news(state, 'legend', 'Легенда: ' + sp.name, { sp: sp.id });
    return 'landed';
  }

  /** What to do with the fish on the card: 'aq' (aquarium), 'sack', 'free' (release). */
  function keep(state, cfg, where) {
    var r = state.run;
    var f = r.pending;
    if (!f) return false;
    if (!f.snag) {
      var fish = { sp: f.sp, w: f.w, s: f.s, p: f.p, r: f.r };
      if (f.nm) fish.nm = f.nm;
      if (where === 'aq') {
        if (!fits(state, cfg, f.w)) return false;
        r.aq.push(fish);
      } else if (where === 'free') {
        r.released += f.p;
        state.meta.releasedAll = (Number(state.meta.releasedAll) || 0) + f.p;
      } else {
        addSack(state, fish, 1);
      }
    }
    r.pending = null;
    r.cast = { phase: 'idle' };
    return true;
  }

  /** Makes room for a fish: sells the aquarium's worst value per litre until it fits. */
  function makeRoom(state, cfg, w) {
    var sold = 0;
    var guard = 0;
    while (!fits(state, cfg, w) && state.run.aq.length && guard++ < 500) {
      var worst = 0;
      for (var i = 1; i < state.run.aq.length; i++) {
        var a = state.run.aq[i];
        var b = state.run.aq[worst];
        if (a.p / a.w < b.p / b.w) worst = i;
      }
      sold += sellAq(state, cfg, worst);
    }
    return sold;
  }

  // ---- the second rod, the cat, the tournament, events ------------------------------------------

  /** The common species the helpers catch: the most numerous common of the water. */
  function helperSpecies(state, water) {
    var best = null;
    waterSpecies(state, water).forEach(function (sp) {
      if (sp.rarity === 'common' && (!best || sp.weight > best.weight)) best = sp;
    });
    return best;
  }

  function helperFish(state, cfg, sp, size) {
    var w = Math.round(sp.avg * size * 1000) / 1000;
    return { sp: sp.id, w: w, s: 1, p: priceOf(state, sp, w, 1, cfg), r: 'c' };
  }

  function rod2Step(state, cfg, dt, now, rng) {
    if (!owned(state, 'rod2')) return;
    var r = state.run;
    r.rod2T += dt;
    while (r.rod2T >= cfg['rod2.sec']) {
      r.rod2T -= cfg['rod2.sec'];
      var list = waterSpecies(state, r.water).filter(function (sp) { return sp.rarity === 'common'; });
      var one = rng.weighted(list, 'weight');
      if (!one) continue;
      var fish = helperFish(state, cfg, one, cfg['rod2.size']);
      if (owned(state, 'keepnet')) earn(state, fish.p);
      else addSack(state, fish, 1);
      news(state, 'rod2', 'Вторая удочка: ' + one.name.toLowerCase(), { sp: one.id, p: fish.p });
    }
  }

  function tourneyToday(state, cfg, now) {
    if (seasonOf(state) < cfg['season.tourney']) return null;
    var day = dayOf(now);
    var t = state.meta.tourney;
    if (t && t.day === day) return t;
    var pool = [];
    K().waters.forEach(function (w) {
      if (w.season) return;
      (K().byWater[w.id] || []).forEach(function (sp) { if (sp.rarity !== 'legend') pool.push(sp); });
    });
    var r = Rng.make(Rng.hash('fishing:tourney:' + day));
    var sp = pool[r.int(pool.length)];
    t = state.meta.tourney = { day: day, sp: sp.id, target: Math.round(sp.avg * cfg['tourney.target'] * 1000) / 1000, best: 0, won: false };
    return t;
  }

  function tourneyCheck(state, cfg, sp, w, now) {
    var t = tourneyToday(state, cfg, now);
    if (!t || t.sp !== sp.id) return;
    if (w > t.best) t.best = w;
    if (!t.won && w >= t.target) {
      t.won = true;
      state.run.bait.gold += cfg['tourney.prize'];
      news(state, 'tourney', 'Турнир дня выигран: ' + cfg['tourney.prize'] + ' золотой наживки');
    }
  }

  /** A hint of the bottle: a legend of an opened water not caught yet (or any of them). */
  function bottleHint(state, cfg, rng) {
    var open = [];
    var fresh = [];
    state.run.waters.forEach(function (water) {
      waterSpecies(state, water).forEach(function (sp) {
        if (sp.rarity !== 'legend') return;
        open.push(sp);
        if (!state.meta.journal[kindOf(sp)]) fresh.push(sp);
      });
    });
    var list = fresh.length ? fresh : open;
    return list.length ? rng.pick(list) : null;
  }

  function rollEvents(state, cfg, dt, now, rng) {
    var p = cfg['events.perMin'] * dt / 60;
    if (!(p > 0) || rng.next() >= p) return;
    var kinds = ['zhor', 'shoal', 'bottle', 'fisher'];
    var kind = rng.weighted(kinds, function (k) { return Math.max(0, Number(cfg['events.' + k]) || 0); });
    var r = state.run;
    var ev = K().world.events || {};
    if (kind === 'zhor') {
      r.zhorUntil = Math.max(now, r.zhorUntil) + cfg['zhor.minutes'] * MIN;
      news(state, 'zhor', (ev.zhor ? ev.zhor.title : 'Жор') + ' на ' + cfg['zhor.minutes'] + ' мин');
    } else if (kind === 'shoal') {
      var sp = spOf(state, r.lastSp);
      if (!sp || sp.water !== r.water) sp = rng.weighted(waterSpecies(state, r.water).filter(function (s) { return s.rarity === 'common'; }), 'weight');
      if (!sp) return;
      r.shoal = { sp: sp.id, left: cfg['shoal.casts'], water: r.water };
      news(state, 'shoal', 'Подошёл косяк: ' + sp.name.toLowerCase() + ', ' + cfg['shoal.casts'] + ' заброса', { sp: sp.id });
    } else if (kind === 'bottle') {
      var leg = bottleHint(state, cfg, rng);
      if (!leg) return;
      var hints = state.meta.hints.filter(function (h) { return h.sp !== leg.id; });
      hints.push({ sp: leg.id, at: now });
      while (hints.length > HINTS_MAX) hints.shift();
      state.meta.hints = hints;
      news(state, 'bottle', 'Бутылка с запиской', { sp: leg.id });
    } else if (kind === 'fisher') {
      r.fisherUntil = now + cfg['fisher.minutes'] * MIN;
      news(state, 'fisher', 'Пришёл старый рыбак', {});
    }
  }

  /** The words of a hint: where and when the legend waits. */
  function hintText(state, cfg, spId) {
    var sp = spOf(state, spId);
    if (!sp) return '';
    var world = K().world;
    var title = function (list, id) {
      for (var i = 0; i < (list || []).length; i++) if (list[i].id === id) return list[i].title;
      return id;
    };
    var hours = sp.hours.map(function (h) { return title(world.periods, h); }).join(' или ');
    var weather = sp.weather.indexOf('any') >= 0 ? 'в любую погоду' : 'в погоду: ' + sp.weather.map(function (w) { return title(world.weather, w); }).join(', ');
    var bait = title(world.baits, sp.bait).toLowerCase();
    return sp.name + ' — ' + waterTitle(sp.water) + ', ' + hours + ', ' + weather + ', ' + title(world.zones, sp.zone) + ', на ' + bait;
  }

  // ---- passive income, offline ------------------------------------------------------------------

  function away(state) {
    var a = state.run.away;
    if (!a || typeof a !== 'object') a = state.run.away = { aq: 0, cat: 0, catP: 0, kinds: {}, lost: 0, sec: 0 };
    return a;
  }

  /** The aquarium's coins for `sec`, and (offline) the cat's fish. Same in tick and in offline. */
  function passive(state, sec, ctx) {
    var cfg = ctx.config;
    var mult = ctx.mult || 1;
    var rate = aqRate(state, cfg);
    var coins = rate * sec / 60 * mult;
    if (coins > 0) earn(state, coins);
    if (!ctx.offline) return;
    var a = away(state);
    a.aq += coins;
    a.sec += sec;
    var level = lvl(state, 'cat');
    if (level <= 0) return;
    var r = state.run;
    r.catAcc += cfg['cat.perHour'] * level * sec / 3600;
    var n = Math.floor(r.catAcc + 1e-9);
    if (n <= 0) return;
    r.catAcc = Math.max(0, r.catAcc - n);
    var sp = helperSpecies(state, r.water);
    if (!sp) return;
    var fish = helperFish(state, cfg, sp, 1);
    if (owned(state, 'keepnet')) earn(state, fish.p * n);
    else addSack(state, fish, n);
    a.cat += n;
    a.catP += fish.p * n;
    a.kinds[sp.id] = (a.kinds[sp.id] || 0) + n;
  }

  /** Ends a cast the player could not finish (the app was closed): the fish is gone, no charge. */
  function abandon(state, cfg, now) {
    var r = state.run;
    var c = r.cast;
    if (!c || PHASES.indexOf(c.phase) < 0) {
      r.cast = { phase: r.pending ? 'caught' : 'idle' };
      return null;
    }
    if (c.phase === 'fight' || c.phase === 'bite' || c.phase === 'late') {
      var was = c.phase;
      r.cast = { phase: 'idle', msg: 'gone', msgT: 3, sp: c.sp || null };
      if (was === 'fight') away(state).lost += 1;
      return was;
    }
    if (c.phase === 'wait' || c.phase === 'aim') {
      r.cast = { phase: 'idle' };
      return c.phase;
    }
    if (c.phase === 'caught' && !r.pending) r.cast = { phase: 'idle' };
    return null;
  }

  function fmtNum(x) { return Fmt ? Fmt.num(x) : String(Math.round(Big.toNumber(Big.of(x, 0)))); }

  /** The lines of the summary «Пока вас не было» from what the absence gave (state.run.away). */
  function awayLines(state, cfg) {
    var a = state.run.away;
    var out = [];
    if (!a) return out;
    if (a.lost) out.push('Рыба сошла с крючка, пока игра была закрыта — наживка не списана ещё раз');
    if (a.aq > 0) out.push('Аквариум: +' + fmtNum(a.aq) + ' монет');
    if (a.cat > 0) {
      var kinds = [];
      for (var k in a.kinds) kinds.push(nameOf(state, k).toLowerCase() + ' ×' + a.kinds[k]);
      out.push('Сторож-кот поймал ' + a.cat + ': ' + kinds.join(', ') + (owned(state, 'keepnet') ? ' — продано на ' + fmtNum(a.catP) : ' — в садке'));
    }
    return out;
  }

  // ---- the functions the engine calls -----------------------------------------------------------

  function freshMeta() {
    return {
      journal: {}, trophies: {}, hints: [], tourney: null, seasonal: null, names: {}, flags: {}, notes: {},
      streak: 0, bestStreak: 0, legends: 0, snaps: 0, releasedAll: 0, caughtAll: 0, heaviest: 0, newsId: 0
    };
  }

  /** Fills what older or partial states lack (cheap; called by tick and the bot). */
  function fix(state) {
    var m = state.meta;
    if (!m.journal || !m.flags) {
      var f = freshMeta();
      for (var k in f) if (m[k] === undefined || m[k] === null) m[k] = f[k];
      if (!m.flags) m.flags = {};
    }
    var r = state.run;
    if (!r.cast) r.cast = { phase: 'idle' };
    if (!r.news) r.news = [];
    return state;
  }

  function init(ctx) {
    var cfg = ctx.config;
    lastCfg = cfg;
    var up = {};
    TIERED.concat(ONEOFF).forEach(function (id) { up[id] = 0; });
    return {
      run: {
        coins: Big.of(cfg['start.coins'] || 0), earned: '0e0', up: up,
        bait: { bloodworm: 0, livebait: 0, gold: 0 }, ground: 0, use: 'worm',
        groundUntil: 0, dawnUntil: 0, zhorUntil: 0, fisherUntil: 0, shoal: null, lantern: false,
        waters: ['pond'], water: 'pond', aq: [], sack: [], cast: { phase: 'idle' }, pending: null,
        released: 0, rod2T: 0, catAcc: 0, casts: 0, caught: 0, lastSp: null, news: [], away: null
      },
      layers: {},
      meta: freshMeta()
    };
  }

  function tick(state, dt, ctx) {
    var cfg = ctx.config;
    lastCfg = cfg;
    if (!(dt > 0)) return;
    fix(state);
    var now = ctx.now;
    passive(state, dt, ctx);
    if (ctx.offline) {
      abandon(state, cfg, now);
      return;
    }
    var r = state.run;
    var rng = ctx.rng;
    rollEvents(state, cfg, dt, now, rng);
    if (r.cast.msgT > 0) r.cast.msgT = Math.max(0, r.cast.msgT - dt);
    var step = Math.max(0.005, cfg['fight.step']);
    var left = dt;
    var guard = 0;
    while (left > 1e-9 && guard++ < 20000) {
      var c = r.cast;
      var h = left;
      if (c.phase === 'wait') {
        h = Math.min(left, Math.max(1e-6, c.bt - c.el));
        rod2Step(state, cfg, h, now, rng);
        c.el += h;
        if (c.el >= c.bt - 1e-9) startBite(state, cfg, now, rng);
      } else if (c.phase === 'aim') {
        c.fill = Math.min(1, c.fill + h / cfg['cast.fillSec']);
      } else if (c.phase === 'bite' || c.phase === 'late') {
        h = Math.min(left, step);
        biteStep(state, cfg, h, rng);
      } else if (c.phase === 'fight') {
        h = Math.min(left, step);
        fightStep(state, cfg, h, now, rng);
      } else {
        break;
      }
      left -= h;
    }
  }

  /** The absence by formula: the cast is ended (the fish gone), the aquarium earns, the cat fishes. */
  function offline(state, sec, ctx) {
    var cfg = ctx.config;
    lastCfg = cfg;
    fix(state);
    var a0 = away(state);
    var before = { aq: a0.aq, cat: a0.cat, lost: a0.lost };
    abandon(state, cfg, ctx.now);
    passive(state, sec, ctx);
    var a = away(state);
    var events = [];
    if (a.lost > before.lost) events.push('Рыба сошла с крючка, пока игра была закрыта');
    if (a.aq > before.aq) events.push('Аквариум: +' + fmtNum(a.aq - before.aq) + ' монет');
    if (a.cat > before.cat) events.push('Сторож-кот поймал рыб: ' + (a.cat - before.cat));
    return { events: events };
  }

  /** Mastery of the new season: floor(sqrt(prices of released fish / 5000)), once six waters are open. */
  function prestigeGain(state, layerId, cfg) {
    if (!firstSix(state)) return Big.ZERO;
    var total = (Number(state.run.released) || 0) + aqValue(state);
    return Big.of(Math.floor(Math.sqrt(total / setting(cfg, 'mastery.threshold'))));
  }

  function bonus(state, layerId, amount, cfg) {
    return Big.add(1, Big.mul(amount, setting(cfg, 'mastery.price')));
  }

  function onPrestige(state, layerId, before, ctx) {
    fix(state);
    state.meta.releasedAll = (Number(state.meta.releasedAll) || 0) + aqValue(before);
    state.meta.seasonsBest = Math.max(Number(state.meta.seasonsBest) || 0, before.run.waters.length);
  }

  function migrate(state, fromVer) {
    // Version 1 is the first: nothing to translate yet.
    return state;
  }

  function validate(state) {
    var r = state.run;
    if (!r || !r.up || !r.bait || !Array.isArray(r.aq) || !Array.isArray(r.sack) || !Array.isArray(r.waters)) return 'нет частей забега';
    if (!Big.valid(r.coins) || Big.sign(r.coins) < 0) return 'монет меньше нуля';
    if (!r.cast || PHASES.indexOf(r.cast.phase) < 0) return 'непонятная фаза заброса: ' + (r.cast && r.cast.phase);
    for (var i = 0; i < r.aq.length; i++) {
      var f = r.aq[i];
      if (!(f.w > 0) || !(f.p >= 0)) return 'рыба в аквариуме без веса или цены';
    }
    var k;
    for (k in r.up) if (!(r.up[k] >= 0) || r.up[k] % 1 !== 0) return 'уровень ' + k + ' не целое число';
    for (k in r.bait) if (!(r.bait[k] >= 0)) return 'наживки ' + k + ' меньше нуля';
    if (r.waters.indexOf(r.water) < 0) return 'рыбалка на закрытом водоёме';
    return null;
  }

  function journalCount(state) {
    var n = 0;
    K().kinds.forEach(function (k) { if (state.meta.journal && state.meta.journal[k]) n++; });
    return n;
  }

  function summary(state, cfg) {
    var parts = [waterTitle(state.run.water)];
    var rate = aqRate(state, cfg);
    if (rate > 0) parts.push('аквариум +' + fmtNum(rate) + '/мин');
    parts.push('видов ' + journalCount(state) + ' из ' + K().kinds.length);
    if (seasonOf(state) > 1) parts.push('сезон ' + seasonOf(state));
    return { line: parts.join(' · ') };
  }

  /** When a legend of the current water comes out next (the notification «Легенда выходит»). */
  function next(state, now, cfg) {
    var water = state.run.water;
    var legends = waterSpecies(state, water).filter(function (sp) { return sp.rarity === 'legend'; });
    if (!legends.length) return [];
    var stepMs = 30 * MIN;
    var start = Math.ceil(now / stepMs) * stepMs;
    for (var t = start; t < now + 24 * 3600000; t += stepMs) {
      for (var i = 0; i < legends.length; i++) {
        var sp = legends[i];
        if (sp.hours.indexOf(periodOfHour(hourOf(t), cfg)) >= 0 && inWeather(sp, water, t, cfg)) {
          if (t <= now) continue;
          return [{ id: 'legend', at: t, title: 'Легенда выходит на клёв', text: sp.name + ': ' + waterTitle(water) + ', сейчас её часы и погода' }];
        }
      }
    }
    return [];
  }

  /** The chest of «Пассажир»: a pack of rare bait. */
  function chest(state, rng, cfg) {
    var r = state.run;
    r.bait.gold += cfg['chest.gold'];
    r.bait.livebait += cfg['chest.livebait'];
    r.bait.bloodworm += cfg['chest.bloodworm'];
    r.ground += cfg['chest.groundbait'];
    var items = [];
    if (cfg['chest.gold']) items.push({ title: 'Золотая наживка', amount: cfg['chest.gold'] });
    if (cfg['chest.livebait']) items.push({ title: 'Живец', amount: cfg['chest.livebait'] });
    if (cfg['chest.bloodworm']) items.push({ title: 'Мотыль', amount: cfg['chest.bloodworm'] });
    if (cfg['chest.groundbait']) items.push({ title: 'Прикормка', amount: cfg['chest.groundbait'] });
    return { title: 'Пачка редкой наживки', items: items };
  }

  // ---- the stock of the model: journal notes, bottle notes, seasonal legends ---------------------

  function noteIds() {
    var k = K();
    return k.kinds.concat(k.trophies.map(function (t) { return 't:' + t.id; }));
  }

  function procedural(kind, rng) {
    var k = K();
    var words = k.world.words || {};
    if (kind === 'notes') {
      var ids = noteIds();
      var about = rng.pick(ids);
      var name = /^t:/.test(about) ? (k.trophy[about.slice(2)] || {}).name : k.kindName[about];
      return { about: about, text: rng.pick(words.noteA) + ' ' + String(name).toLowerCase() + ' ' + rng.pick(words.noteB), procedural: true };
    }
    if (kind === 'bottles') {
      return { title: 'Записка', text: rng.pick(words.bottleA) + ' ' + rng.pick(words.bottleB), procedural: true };
    }
    if (kind === 'legends') {
      var waters = k.waters.filter(function (w) { return !w.season; });
      var water = rng.pick(waters).id;
      var avgMin = setting(null, 'legend.avgMin');
      var avg = Math.round(rng.range(Math.max(avgMin, 2), Math.max(avgMin + 1, Math.min(setting(null, 'legend.avgMax'), 12))) * 10) / 10;
      var ratio = Math.min(setting(null, 'legend.maxRatio'), 2.2);
      var zone = rng.pick(ZONES);
      var predator = rng.chance(0.5);
      var base = (k.byWater[water] || []).reduce(function (m, sp) { return sp.rarity === 'legend' ? sp.base : m; }, 100);
      return {
        name: rng.pick(words.legendA) + ' ' + rng.pick(words.legendB) + ' ' + rng.pick(words.legendC),
        water: water, zone: zone, hours: [rng.pick(PERIODS)], weather: [rng.pick(WEATHER)],
        bait: predator ? 'livebait' : 'bloodworm', predator: predator, avg: avg, max: Math.round(avg * ratio * 10) / 10,
        base: Math.max(setting(null, 'legend.baseMin'), Math.min(setting(null, 'legend.baseMax'), base)),
        power: Math.min(setting(null, 'legend.powerMax'), 3), jerks: Math.min(setting(null, 'legend.jerksMax'), 0.35),
        text: 'Говорят, этот месяц — её время.', procedural: true
      };
    }
    return null;
  }

  function within(v, a, b) { return typeof v === 'number' && v === v && v >= a && v <= b; }

  function validateStock(kind, item) {
    if (!item || typeof item !== 'object') return 'не объект';
    for (var f in item) if (typeof item[f] === 'string' && /https?:/i.test(item[f])) return 'ссылка в поле ' + f;
    if (kind === 'notes') {
      if (noteIds().indexOf(item.about) < 0) return 'запись не о виде и не о предмете: ' + item.about;
      return null;
    }
    if (kind === 'legends') {
      var k = K();
      if (!k.water[item.water] || k.water[item.water].season) return 'водоём не из первых шести: ' + item.water;
      if (ZONES.indexOf(item.zone) < 0) return 'нет зоны ' + item.zone;
      if (BAITS.indexOf(item.bait) < 0 || item.bait === 'gold') return 'нет наживки ' + item.bait;
      if (!Array.isArray(item.hours) || !item.hours.length || item.hours.some(function (h) { return PERIODS.indexOf(h) < 0; })) return 'часы не из утро/день/вечер/ночь';
      if (!Array.isArray(item.weather) || !item.weather.length || item.weather.some(function (w) { return WEATHER.indexOf(w) < 0; })) return 'погода не из пяти';
      if (!within(item.avg, setting(null, 'legend.avgMin'), setting(null, 'legend.avgMax'))) return 'средний вес вне пределов: ' + item.avg;
      if (!within(item.max, item.avg * 1.05, item.avg * setting(null, 'legend.maxRatio'))) return 'предельный вес вне пределов: ' + item.max;
      if (!within(item.power, 0.3, setting(null, 'legend.powerMax'))) return 'сила вне пределов: ' + item.power;
      if (!within(item.jerks, 0, setting(null, 'legend.jerksMax'))) return 'рывки вне пределов: ' + item.jerks;
      if (!within(item.base, setting(null, 'legend.baseMin'), setting(null, 'legend.baseMax'))) return 'цена вне пределов: ' + item.base;
      return null;
    }
    return null;
  }

  /** This month's legend from the stock (or made up): it joins its water until the month ends. */
  function setSeasonal(state, item, now) {
    if (!item || validateStock('legends', item)) return false;
    var month = monthOf(now);
    state.meta.seasonal = {
      month: month,
      sp: {
        id: 'm-' + month, name: String(item.name).slice(0, 40), water: item.water, rarity: 'legend', zone: item.zone,
        hours: item.hours.slice(0, 4), weather: item.weather.slice(0, 5), bait: item.bait, predator: !!item.predator,
        avg: item.avg, max: item.max, base: item.base, power: item.power, jerks: item.jerks, weight: 0, seasonal: true,
        text: item.text ? String(item.text).slice(0, 160) : '',
        shape: { back: 0.36, tail: item.predator ? 'straight' : 'fork', stripes: 0, color: '#b9a46a' }
      }
    };
    return true;
  }

  function seasonalStale(state, now) {
    var s = state.meta.seasonal;
    return !s || s.month !== monthOf(now);
  }

  // ---- the bot (checks and tests; also a simple model of a player) ------------------------------

  function expectedValue(state, cfg, now, d, use) {
    var list = chances(state, cfg, now, d, use);
    var sum = 0;
    var value = 0;
    list.forEach(function (x) {
      sum += x.w;
      value += x.w * x.sp.base * Math.pow(x.sp.avg, cfg['price.power']);
    });
    return sum ? value / sum : 0;
  }

  /** The best bait and distance for the water now, by the expected price of a bite. */
  function bestCast(state, cfg, now) {
    var best = { v: -1, use: 'worm', d: zoneDistance(state, cfg, 0) };
    var max = maxRange(state, cfg);
    var zones = [0, 1, 2].filter(function (z) { return z === 0 || (z === 1 ? max >= cfg['zone.middle'] : max >= cfg['zone.deep']); });
    var baits = ['worm', 'bloodworm', 'livebait', 'spoon', 'jig', 'gold'].filter(function (b) {
      if (b === 'spoon' || b === 'jig') return owned(state, b);
      if (b === 'gold') return state.run.bait.gold > 0;
      return true;
    });
    zones.forEach(function (z) {
      var d = zoneDistance(state, cfg, z);
      baits.forEach(function (b) {
        var v = expectedValue(state, cfg, now, d, b);
        if (v > best.v * 1.02) best = { v: v, use: b, d: d };
      });
    });
    return best;
  }

  var BOT_ORDER = ['line', 'reel', 'rod', 'float', 'hook', 'aquarium', 'filter', 'light', 'cat',
    'keepnet', 'landing', 'absorber', 'boat', 'rod2', 'jig', 'spoon', 'sonar', 'journal'];

  /** Buying as a careful player: the next water first, then the cheapest useful thing within budget. */
  function botShop(state, cfg, now) {
    var bought = 0;
    var nw = nextWater(state, cfg);
    if (nw && !waterLock(state, cfg, nw.id) && openWater(state, cfg, nw.id)) {
      bought++;
      state.run.water = idle(state) ? nw.id : state.run.water;
    }
    var save = nw && !waterLock(state, cfg, nw.id) ? Big.mul(waterCost(cfg, nw.id), setting(cfg, 'bot.save')) : Big.ZERO;
    var gear = (K().water[state.run.water] || {}).gear || 0;
    for (var guard = 0; guard < 40; guard++) {
      var pick = null;
      var price = null;
      var need = false;
      BOT_ORDER.forEach(function (id) {
        var c = costOf(state, cfg, id);
        if (!c) return;
        if (id === 'jig' && !(nw && nw.needs === 'jig') && state.run.water !== 'ice') return;
        // Gear below the water's own level is bought at once; the rest waits for the savings.
        var needed = (['line', 'reel', 'rod', 'float', 'hook'].indexOf(id) >= 0 && lvl(state, id) < gear + 2) || (id === 'aquarium' && lvl(state, id) < 1);
        if (needed && !need) {
          need = true;
          pick = id;
          price = c;
        } else if (needed === need && (!price || Big.lt(c, price))) {
          pick = id;
          price = c;
        }
      });
      if (!pick) break;
      var budget = need ? state.run.coins : Big.sub(state.run.coins, save);
      if (Big.gt(price, budget)) break;
      if (!buy(state, cfg, pick)) break;
      bought++;
    }
    return bought;
  }

  function botKeep(state, cfg) {
    var f = state.run.pending;
    if (!f) return;
    if (f.snag) {
      keep(state, cfg, 'sack');
      return;
    }
    if (worthAquarium(state, cfg, f)) {
      makeRoom(state, cfg, f.w);
      if (keep(state, cfg, 'aq')) return;
    }
    // With the first six waters open the season is near: released fish count toward mastery.
    keep(state, cfg, firstSix(state) ? 'free' : 'sack');
  }

  /** The bot's second of play: decide the catch, sell the sack, shop, cast with the autopilot. */
  function play(state, ctx) {
    var cfg = ctx.config;
    var now = ctx.now;
    lastCfg = cfg;
    fix(state);
    var r = state.run;
    if (r.cast.phase === 'caught') botKeep(state, cfg);
    if (r.sack.length) sellSack(state, cfg);
    var bought = botShop(state, cfg, now);
    if (r.cast.phase === 'idle') {
      var latest = r.waters[r.waters.length - 1];
      if (r.water !== latest) r.water = latest;
      var best = bestCast(state, cfg, now);
      if ((best.use === 'bloodworm' || best.use === 'livebait') && r.bait[best.use] < 1) {
        if (buy(state, cfg, best.use)) bought++;
      }
      if (!setBait(state, best.use)) setBait(state, 'worm');
      throwAt(state, cfg, now, ctx.rng, best.d / maxRange(state, cfg), true);
    }
    return bought;
  }

  /** One fight to the end with the autopilot (the catch-rate table): 'landed' or the reason lost. */
  function simulateFight(state, cfg, spId, w, d, rng) {
    lastCfg = cfg;
    var r = state.run;
    r.cast = { phase: 'bite', sp: spId, w: w, d: d, el: 0, win: 1, auto: true };
    startFight(state, cfg);
    r.cast.auto = true;
    var out = null;
    for (var i = 0; i < 200000 && !out; i++) out = fightStep(state, cfg, cfg['fight.step'], 0, rng);
    if (r.pending) {
      r.pending = null;
      r.cast = { phase: 'idle' };
    }
    return out || 'timeout';
  }

  return {
    init: init, tick: tick, offline: offline, prestigeGain: prestigeGain, bonus: bonus, onPrestige: onPrestige,
    migrate: migrate, validate: validate, summary: summary, next: next, chest: chest,
    procedural: procedural, validateStock: validateStock,
    // the screen and the checks
    LAYER: LAYER, upMax: upMax, TIERED: TIERED, ONEOFF: ONEOFF, PACKS: PACKS, BAITS: BAITS, WEATHER: WEATHER, PERIODS: PERIODS, ZONES: ZONES,
    content: K, spOf: spOf, kindOf: kindOf, nameOf: nameOf, waterSpecies: waterSpecies, waterTitle: waterTitle,
    lvl: lvl, owned: owned, seasonOf: seasonOf, mastery: mastery, hourOf: hourOf, dayOf: dayOf, monthOf: monthOf,
    periodOfHour: periodOfHour, periodAt: periodAt, lanternOn: lanternOn, inHours: inHours, weatherAt: weatherAt, inWeather: inWeather,
    maxRange: maxRange, zoneIndex: zoneIndex, fishZone: fishZone, zoneDistance: zoneDistance, chances: chances,
    legendsNow: legendsNow, bitingNow: bitingNow, priceOf: priceOf, hookWindow: hookWindow, keepChance: keepChance,
    litres: litres, usedLitres: usedLitres, fishLitres: fishLitres, fits: fits, aqRate: aqRate, aqValue: aqValue,
    sackValue: sackValue, sackCount: sackCount, sellSack: sellSack, sellAq: sellAq, releaseAq: releaseAq, makeRoom: makeRoom,
    costOf: costOf, buy: buy, waterCost: waterCost, waterLock: waterLock, openWater: openWater, nextWater: nextWater,
    firstSix: firstSix, setWater: setWater, baitAvailable: baitAvailable, setBait: setBait, useGroundbait: useGroundbait,
    dawn: dawn, zhorTonight: zhorTonight, setLantern: setLantern, trade: trade, tradeable: tradeable,
    throwAt: throwAt, press: press, release: release, keep: keep, abandon: abandon, loadOf: loadOf,
    worthAquarium: worthAquarium, tourneyToday: tourneyToday, hintText: hintText, awayLines: awayLines,
    journalCount: journalCount, setSeasonal: setSeasonal, seasonalStale: seasonalStale, noteIds: noteIds,
    fix: fix, play: play, bestCast: bestCast, simulateFight: simulateFight, expectedValue: expectedValue
  };
});
