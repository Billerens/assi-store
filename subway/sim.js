// The logic of «Подземка» (docs/games/subway.md): lines of stations give demand, trains carry it,
// the passengers pay; a built city is handed over for the next one — for «опыт инженера» (ОИ),
// and after the tenth city the second layer, «Генеральный конструктор», gives patents.
// Shared subset of JavaScript: it runs on the screen (window.GameSim), in the engine (Rhino) and in
// node. No class, no async, no f(...args), no for (let …); randomness only from ctx.rng / the rng
// given. Every number is a setting of config.json (cfg); here are only names and structure.
(function (root, make) {
  var node = typeof require === 'function' && typeof exports !== 'undefined';
  var api = node ? make(require('../engine/big.js'), require('../engine/fmt.js')) : make(root.Big, root.Fmt);
  if (typeof exports !== 'undefined') { for (var k in api) exports[k] = api[k]; } else { root.GameSim = api; }
})(this, function (Big, Fmt) {
  'use strict';

  var LAYER = 'city';
  var GENERAL = 'general';
  var GROUND = { 11: true, 12: true };
  var UNDERGROUND_MAX = 10;
  // What reaching a city opens for good (the table «Города»): city number -> unlock keys.
  var UNLOCKS = { 2: ['bureau', 'express'], 3: ['ring'], 4: ['night'], 5: ['districts'], 6: ['ground'], 7: ['recon'], 8: ['autoTrains'], 9: ['airport'], 10: ['general'] };
  // Бюро инженера: id, price key (cfg 'bureau.<id>'), levels, what it needs first.
  var BUREAU = [
    { id: 'budget', levels: 'bureau.budgetLevels' }, { id: 'dispatch' }, { id: 'longShift' }, { id: 'nightShift', needs: 'longShift' },
    { id: 'depot' }, { id: 'design' }, { id: 'transfers' }, { id: 'quickStart' }, { id: 'loud' }, { id: 'sense' }, { id: 'tariffs' },
    { id: 'sleep' }, { id: 'experience' }, { id: 'hub' }, { id: 'memory' }, { id: 'autoTransfer' }
  ];
  // The automations a player may switch off (meta.autoOff): Бюро and the patent «автостроитель».
  var AUTOS = ['depot', 'design', 'tariffs', 'autoTransfer', 'autobuild'];
  // Патентное бюро: id, price key 'patent.<id>', levels.
  var PATENTS = [{ id: 'pneumo' }, { id: 'bridge' }, { id: 'autobuild' }, { id: 'capital', levels: 'patent.capitalLevels' }];
  var EVENTS = ['match', 'rain', 'suitcase', 'school', 'musician', 'fair', 'mall', 'snow', 'museums', 'tourist', 'escalator',
    'inspector', 'graduation', 'retro', 'sept1', 'newyear', 'rush', 'glove'];
  var REGULAR = ['match', 'rain', 'suitcase', 'school', 'musician', 'fair', 'mall', 'snow', 'tourist', 'escalator', 'inspector', 'graduation'];
  var CHOICE = { mall: 1, escalator: 1, inspector: 1 };
  var TASKS = ['lines', 'stations', 'transfers', 'income', 'calm'];
  var QUESTIONS = ['income', 'stations', 'trains', 'newest'];
  var RETRO = 8;

  // ---- small helpers -------------------------------------------------------------------------------

  var MEMO = {};
  /** "10,25,50" -> [10, 25, 50] (kept: the same text gives the same array). */
  function list(text) {
    var key = String(text);
    if (!MEMO[key]) {
      MEMO[key] = key.split(',').map(function (s) { return Number(String(s).trim()); }).filter(function (v) { return v === v; });
    }
    return MEMO[key];
  }

  var SPANS = {};
  /** "07:30-10:00" -> [450, 600] minutes; null when the text does not read. */
  function span(text) {
    var key = String(text || '');
    if (SPANS[key] !== undefined) return SPANS[key];
    var m = /^\s*(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})\s*$/.exec(key);
    SPANS[key] = m ? [Number(m[1]) * 60 + Number(m[2]), Number(m[3]) * 60 + Number(m[4])] : null;
    return SPANS[key];
  }

  function minuteOf(ms) {
    var d = new Date(ms);
    return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
  }

  /** Is the moment inside the daily window "HH:MM-HH:MM" (a window may cross midnight)? */
  function within(text, ms) {
    var s = span(text);
    if (!s || !(ms > 0) || s[0] === s[1]) return false;
    var m = minuteOf(ms);
    return s[0] < s[1] ? m >= s[0] && m < s[1] : m >= s[0] || m < s[1];
  }

  function pad(n) { return n < 10 ? '0' + n : String(n); }
  function dayKey(ms) {
    var d = new Date(ms);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function monthDay(ms) {
    var d = new Date(ms);
    return pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  /** The next moment after `ms` when the local clock shows minute `minute` of a day. */
  function nextClock(ms, minute) {
    var d = new Date(ms);
    d.setHours(Math.floor(minute / 60), minute % 60, 0, 0);
    if (d.getTime() <= ms) d.setDate(d.getDate() + 1);
    return d.getTime();
  }

  function bigStr(x) { return Big.str(x); }
  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  function has(list, x) { return list.indexOf(x) >= 0; }

  // ---- the shape of the state ------------------------------------------------------------------------

  function newLine(tier, cfg) {
    return {
      tier: tier, stations: cfg['line.startStations'], trains: cfg['line.startTrains'], cars: 0,
      dispatcher: false, express: false, duty: false, recon: false, bonus: 0, mallAt: []
    };
  }

  function freshRun(cfg) {
    return {
      money: '0e0', earned: '0e0', carried: '0e0', lines: [newLine(1, cfg)], transfers: [], tariffs: 0,
      ring: false, airport: false, cityMiles: 0, boosts: [], event: null, nextEventAt: 0, streak: 0, shown: {},
      calmSec: 0, boostUntil: 0, museumsUntil: 0, mallDone: false, tapSec: 0, tapN: 0, autoAcc: 0, buildAcc: 0,
      taskAcc: 0, keepDisp: [], names: [], away: null, playSec: 0
    };
  }

  function freshCity() { return { city: 1, earned: '0e0', blueprints: 0, tasks: {}, prevIncome: '0e0' }; }

  function freshMeta() {
    var retro = [];
    for (var i = 0; i < RETRO; i++) retro.push(0);
    return { bureau: {}, patents: {}, unlocks: {}, autoOff: {}, retro: retro, oiEver: '0e0', carried: '0e0', tripSec: 0, maxCity: 1, collected: 0 };
  }

  /** Fills what an older or a fresh state may miss (cheap; called by every entry point). */
  function ensure(state) {
    var r = state.run = state.run || {};
    if (!r.lines) {
      var f = freshRun({ 'line.startStations': 2, 'line.startTrains': 1 });
      for (var k in f) if (r[k] === undefined) r[k] = f[k];
    }
    if (!r.transfers) r.transfers = [];
    if (!r.boosts) r.boosts = [];
    if (!r.shown) r.shown = {};
    if (!r.keepDisp) r.keepDisp = [];
    if (!r.names) r.names = [];
    if (r.money === undefined) r.money = '0e0';
    if (r.earned === undefined) r.earned = '0e0';
    if (r.carried === undefined) r.carried = '0e0';
    for (var li = 0; li < r.lines.length; li++) {
      var ln = r.lines[li];
      // Older saves: «malls» counted shopping centres of a line; now each one is a chosen station.
      if (!ln.mallAt) {
        ln.mallAt = [];
        for (var mi = 0; mi < (ln.malls || 0); mi++) ln.mallAt.push(mi);
      }
      if (ln.malls !== undefined) delete ln.malls;
    }
    state.layers = state.layers || {};
    var c = state.layers[LAYER] = state.layers[LAYER] || { currency: '0e0', count: 0, best: '0e0', state: {} };
    c.state = c.state || {};
    var fc = freshCity();
    for (var key in fc) if (c.state[key] === undefined) c.state[key] = fc[key];
    var g = state.layers[GENERAL] = state.layers[GENERAL] || { currency: '0e0', count: 0, best: '0e0', state: {} };
    g.state = g.state || {};
    var meta = state.meta = state.meta || {};
    var fm = freshMeta();
    for (var mk in fm) if (meta[mk] === undefined) meta[mk] = fm[mk];
    while (meta.retro.length < RETRO) meta.retro.push(0);
    return state;
  }

  function cityState(state) { return state.layers[LAYER].state; }
  function cityOf(state) { var s = state.layers[LAYER] && state.layers[LAYER].state; return s && s.city > 0 ? s.city : 1; }
  function unlocked(state, key) { return !!(state.meta.unlocks && state.meta.unlocks[key]); }
  function bureau(state, id) { return (state.meta.bureau && state.meta.bureau[id]) || 0; }
  function patent(state, id) { return (state.meta.patents && state.meta.patents[id]) || 0; }
  function autoOn(state, id) { return !(state.meta.autoOff && state.meta.autoOff[id]); }
  function oi(state) { return Big.of(state.layers[LAYER].currency, 0); }
  function patents(state) { return Big.of(state.layers[GENERAL].currency, 0); }

  // ---- the rules of the current city -------------------------------------------------------------------

  /** The rule of the city (table «Города»): every number from cfg. Round r repeats cities 1..10. */
  function rules(state, cfg) {
    var c = cityOf(state);
    var base = ((c - 1) % 10) + 1;
    var round = Math.floor((c - 1) / 10) + 1;
    var all = base === 10 && !!cfg['city10.all'];
    function on(n) { return base === n || all; }
    // Every next city is dearer (city.costGrowth per number): a move doubles the bonus, the city must not get easier.
    var cost = Big.mul((base === 10 ? cfg['city10.cost'] : 1) * Math.pow(round, cfg['round.costPow']), Big.pow(cfg['city.costGrowth'] || 1, c - 1));
    return {
      city: c, base: base, round: round,
      growth: (on(2) ? cfg['city2.growth'] : cfg['station.growth']) + (cfg['city.growthStep'] || 0) * (c - 1),
      demand: (on(2) ? cfg['city2.demand'] : 1) * (base === 10 ? cfg['city10.demand'] : 1) * Math.pow(round, cfg['round.demandPow']),
      cost: cost,
      transfers: on(3) ? cfg['city3.transfers'] : cfg['transfer.limit'],
      offline: on(4) ? cfg['city4.offline'] : 1,
      online: on(4) ? cfg['city4.online'] : 1,
      open: on(5) ? cfg['city5.lineOpen'] : 1,
      stilts: on(6),
      historic: on(7),
      train: on(8) ? cfg['city8.train'] : 1,
      events: on(9) ? cfg['city9.events'] : 1
    };
  }

  var BASES = {};
  /** B_i: the price of the first station of line tier t, with the city's price factor. */
  function baseCost(t, R, cfg) {
    var key = t + '|' + R.cost + '|' + cfg['station.base'] + '|' + cfg['line.tierCost'];
    var b = BASES[key];
    if (!b) {
      b = Big.mul(Big.mul(cfg['station.base'], Big.pow(cfg['line.tierCost'], t - 1)), R.cost);
      BASES[key] = b;
    }
    return b;
  }

  var DEMANDS = {};
  /** P_i: passengers a second of one station of tier t, with the city's demand factor. */
  function demand(t, R, cfg) {
    var key = t + '|' + R.demand + '|' + cfg['demand.base'] + '|' + cfg['demand.tierRatio'];
    var p = DEMANDS[key];
    if (!p) {
      p = Big.mul(Big.mul(cfg['demand.base'], Big.pow(cfg['demand.tierRatio'], t - 1)), R.demand);
      DEMANDS[key] = p;
    }
    return p;
  }

  // ---- lines ---------------------------------------------------------------------------------------------

  function lineOf(state, tier) {
    var lines = state.run.lines;
    for (var i = 0; i < lines.length; i++) if (lines[i].tier === tier) return lines[i];
    return null;
  }

  /** S: stations one train serves — cars, plus the automatic trains, minus one for an express. */
  function cars(state, line, cfg) {
    var s = cfg['train.cars'] + (line.cars || 0);
    if (unlocked(state, 'autoTrains')) s += cfg['autoTrains.cars'];
    if (line.express) s -= cfg['express.cars'];
    return Math.max(1, s);
  }

  function served(state, line, cfg) { return Math.min(line.stations, cars(state, line, cfg) * line.trains); }

  /** How many milestones of stations a line of n stations has passed (each ×2 to its demand). */
  function miles(n, cfg) {
    var l = list(cfg['milestone.list']);
    var c = 0;
    for (var i = 0; i < l.length; i++) if (n >= l[i]) c++;
    var last = l.length ? l[l.length - 1] : 0;
    var every = cfg['milestone.every'];
    if (every > 0 && n > last) c += Math.floor((n - last) / every);
    return c;
  }

  /** The next milestone above n stations. */
  function nextMile(n, cfg) {
    var l = list(cfg['milestone.list']);
    for (var i = 0; i < l.length; i++) if (l[i] > n) return l[i];
    var last = l.length ? l[l.length - 1] : 0;
    var every = cfg['milestone.every'] > 0 ? cfg['milestone.every'] : 100;
    return last + every * (Math.floor((n - last) / every) + 1);
  }

  /** The district of station j (0-based) of line `tier`: 1 спальный, 2 деловой, 3 промзона, 4 центр. */
  function district(j, tier) { return ((j + tier) % 4) + 1; }

  /** How many of the first n stations of line `tier` are in district d (1..4). */
  function districtCount(n, tier, d) {
    var first = (((d - 1 - tier) % 4) + 4) % 4;
    return n > first ? Math.floor((n - 1 - first) / 4) + 1 : 0;
  }

  /**
   * Served stations as station-equivalents of demand: the historic centre (first stations ×5), the
   * stilts (every second ×3), the rush hour of the districts (spare ×2 in the morning, business in
   * the evening), the shopping centres (the chosen station's own demand +50 %, while it is served).
   */
  function effStations(line, s, R, cfg, rush) {
    function factor(j) {
      var f = 1;
      if (R.historic && j < cfg['city7.firstStations']) f *= cfg['city7.firstMult'];
      if (R.stilts && j % 2 === 1) f *= cfg['city6.stiltDemand'];
      if (rush && district(j, line.tier) === rush) f *= cfg['rush.mult'];
      return f;
    }
    var malls = 0;
    var at = line.mallAt || [];
    for (var m = 0; m < at.length; m++) if (at[m] < s) malls += factor(at[m]) * cfg['mall.bonus'];
    if (!R.historic && !R.stilts && !rush) return s + malls;
    var headSize = 4 * Math.ceil((Math.max(cfg['city7.firstStations'], 0) + 1) / 4);
    var head = Math.min(s, headSize);
    var sum = 0;
    for (var j = 0; j < head; j++) sum += factor(j);
    var rest = s - head;
    if (rest > 0) {
      var per = 0;
      for (var p = 0; p < 4; p++) per += factor(head + p);
      var q = Math.floor(rest / 4);
      sum += q * per;
      for (var p2 = 0; p2 < rest % 4; p2++) sum += factor(head + q * 4 + p2);
    }
    return sum + malls;
  }

  function transfersOf(state, tier) {
    var c = 0;
    var tr = state.run.transfers;
    for (var i = 0; i < tr.length; i++) if (tr[i][0] === tier || tr[i][1] === tier) c++;
    return c;
  }

  function transferMult(state, cfg) { return bureau(state, 'hub') ? cfg['bureau.hubMult'] : cfg['transfer.mult']; }

  function transferLimit(state, cfg, R) {
    return (R || rules(state, cfg)).transfers + (bureau(state, 'transfers') ? cfg['bureau.transfersPlus'] : 0);
  }

  /**
   * The environment of a moment: the city's rule, online or not, the clock (night, rush hours)
   * and, online only, the event bonuses. x.events false — without the bonuses (tasks).
   */
  function envOf(state, cfg, now, online, events) {
    var R = rules(state, cfg);
    var r = state.run;
    var x = { R: R, online: !!online, now: now, night: false, museums: false, rush: 0, all: 1, line: {}, transfer: 1, snow: 0, tap: 1 };
    if (unlocked(state, 'night') && within(cfg['night.hours'], now)) {
      x.night = true;
      x.museums = r.museumsUntil > now;
    }
    if (unlocked(state, 'districts')) {
      if (within(cfg['rush.morning'], now)) x.rush = 1;
      else if (within(cfg['rush.evening'], now)) x.rush = 2;
    }
    if (online && events !== false) {
      for (var i = 0; i < r.boosts.length; i++) {
        var b = r.boosts[i];
        if (!(b.until > now)) continue;
        if (b.k === 'all') x.all *= b.m;
        else if (b.k === 'line') x.line[b.t] = (x.line[b.t] || 1) * b.m;
        else if (b.k === 'transfer') x.transfer *= b.m;
        else if (b.k === 'snow') x.snow = Math.max(x.snow, b.m);
        else if (b.k === 'tap') x.tap *= b.m;
      }
    }
    return x;
  }

  /** The multiplier of one line: milestones, transfers, ring, express, reconstruction, collection, events. */
  function lineMult(state, line, cfg, x) {
    var t = line.tier;
    var m = Math.pow(cfg['milestone.mult'], miles(line.stations, cfg));
    var tm = transferMult(state, cfg);
    if (x.transfer !== 1) tm = 1 + (tm - 1) * x.transfer;
    var count = transfersOf(state, t) + (state.run.airport && t === 1 ? 1 : 0);
    if (count) m *= Math.pow(tm, count);
    if (state.run.airport && t === UNDERGROUND_MAX) m *= cfg['airport.mult'];
    if (state.run.ring) m *= cfg['ring.mult'];
    if (line.express) m *= cfg['express.demand'];
    if (line.recon) m *= cfg['recon.mult'];
    if (t <= RETRO) m *= 1 + cfg['retro.bonus'] * (state.meta.retro[t - 1] || 0);
    if (line.bonus) m *= 1 + cfg['escalator.bonus'] * line.bonus;
    if (x.night) m *= line.duty ? cfg['night.dutyMult'] : (x.museums ? 1 : 0);
    if (x.online) {
      if (x.line[t]) m *= x.line[t];
      if (x.snow) m *= GROUND[t] ? 0 : x.snow;
    }
    return m;
  }

  /** Passengers a second of one line (its income at the fare 1 ₽), as Big. */
  function lineIncome(state, line, cfg, x) {
    var s = served(state, line, cfg);
    if (s <= 0) return Big.ZERO;
    if (!x.online && !line.dispatcher) return Big.ZERO;
    var m = lineMult(state, line, cfg, x);
    if (!(m > 0)) return Big.ZERO;
    return Big.mul(demand(line.tier, x.R, cfg), effStations(line, s, x.R, cfg, x.rush) * m);
  }

  function oiRate(state, cfg) { return bureau(state, 'experience') ? cfg['bureau.experienceBonus'] : cfg['oi.bonus']; }

  function cityMileMult(state, cfg) {
    var m = 1;
    for (var i = 0; i < state.run.cityMiles; i++) m *= cityMileStep(cfg, i);
    return m;
  }

  /** City milestone number i (from 0): stations needed on every line; past the list — every cityMile.every more. */
  function cityMileNeed(cfg, i) {
    var l = list(cfg['cityMile.list']);
    if (i < l.length) return l[i];
    var every = Number(cfg['cityMile.every']) || 0;
    if (every <= 0 || !l.length) return Infinity;
    return l[l.length - 1] + (i - l.length + 1) * every;
  }

  /** The income multiplier of city milestone number i: from the list, past it — cityMile.moreMult. */
  function cityMileStep(cfg, i) {
    var l = list(cfg['cityMile.mults']);
    return i < l.length ? l[i] : Number(cfg['cityMile.moreMult']) || 1;
  }

  /**
   * The income multiplier of P patents: ×patent.mult each up to patent.softcap, then the further
   * ones as (1 + (patent.mult − 1)·(P − softcap))^patent.softPow. Without it ×1.25 per patent feeds
   * itself: income ∝ 1.25^P, ОИ grow faster than linearly with income (new lines pay almost as they
   * cost), patents = √ОИ — after ~20 patents every Генеральный конструктор gives more than the last
   * and the numbers run to 10^(10^10) in one session. Even a linear tail (softPow 1) still runs away
   * (patents ∝ P^1.17); with softPow below ~0.8 the patents settle.
   */
  function patentMult(cfg, p) {
    var n = Math.min(Big.toNumber(p), 1e15);
    var cap = cfg['patent.softcap'] > 0 ? cfg['patent.softcap'] : Infinity;
    var m = Big.pow(cfg['patent.mult'], Math.min(n, cap, 1e12));
    if (n > cap) m = Big.mul(m, Math.pow(1 + (cfg['patent.mult'] - 1) * (n - cap), cfg['patent.softPow']));
    return m;
  }

  /** Everything that multiplies the whole income: tariffs, ОИ, patents, the city's milestones, bonuses. */
  function globalMult(state, cfg, x) {
    var g = Big.pow(cfg['tariff.mult'], state.run.tariffs || 0);
    g = Big.mul(g, Big.add(1, Big.mul(oi(state), oiRate(state, cfg))));
    var p = patents(state);
    if (!Big.isZero(p)) g = Big.mul(g, patentMult(cfg, p));
    g = Big.mul(g, cityMileMult(state, cfg) * x.all * (x.online ? x.R.online : 1));
    if (state.run.boostUntil > x.now) g = Big.mul(g, cfg['boost.mult']);
    return g;
  }

  /** Passengers a second of the whole city (lines plus the ring's own little share). */
  function passengersX(state, cfg, x) {
    var sum = Big.ZERO;
    var lines = state.run.lines;
    for (var i = 0; i < lines.length; i++) sum = Big.add(sum, lineIncome(state, lines[i], cfg, x));
    if (state.run.ring) sum = Big.mul(sum, 1 + cfg['ring.own']);
    return sum;
  }

  function bridgeIncome(state, cfg) {
    if (!patent(state, 'bridge')) return Big.ZERO;
    return Big.mul(cityState(state).prevIncome || 0, cfg['bridge.share']);
  }

  function incomeX(state, cfg, x) {
    return Big.add(Big.mul(passengersX(state, cfg, x), globalMult(state, cfg, x)), bridgeIncome(state, cfg));
  }

  /** ₽ a second now (before the links' multiplier). online false — what the dispatchers bring offline. */
  function income(state, cfg, now, online) {
    ensure(state);
    return incomeX(state, cfg, envOf(state, cfg, now, online !== false));
  }

  /** The share of the offline time that counts: Бюро «Длинная/Ночная смена» over the engine's setting. */
  function offlineEff(state, cfg) {
    if (bureau(state, 'nightShift')) return cfg['bureau.nightShiftEff'];
    if (bureau(state, 'longShift')) return cfg['bureau.longShiftEff'];
    return cfg['offline.efficiency'];
  }

  /** ₽ a real second while away (dispatcher lines, the offline share, the city's offline factor). */
  function offlineRate(state, cfg, now) {
    ensure(state);
    return Big.mul(income(state, cfg, now, false), offlineEff(state, cfg) * rules(state, cfg).offline);
  }

  // ---- prices -----------------------------------------------------------------------------------------------

  /** The price of the next `count` stations of a line (the stilts make every second one dearer). */
  function stationsCost(line, count, R, cfg) {
    if (!(count > 0)) return Big.ZERO;
    var B = baseCost(line.tier, R, cfg);
    var g = R.growth;
    var n = line.stations;
    var sum = Big.costGeom(B, g, n, count);
    if (R.stilts && cfg['city6.stiltCost'] !== 1) {
      var j0 = n % 2 === 1 ? n : n + 1;
      var last = n + count - 1;
      if (j0 <= last) {
        var m = Math.floor((last - j0) / 2) + 1;
        var series = Big.div(Big.sub(Big.pow(g * g, m), 1), g * g - 1);
        sum = Big.add(sum, Big.mul(Big.mul(Big.mul(B, Big.pow(g, j0)), series), cfg['city6.stiltCost'] - 1));
      }
    }
    return sum;
  }

  /** How many stations the budget buys on the line (a number). */
  function maxStations(line, budget, R, cfg) {
    var plain = Big.maxBuy(budget, baseCost(line.tier, R, cfg), R.growth, line.stations);
    if (!R.stilts || plain <= 0) return plain;
    var lo = 0;
    var hi = plain;
    while (lo < hi) {
      var mid = Math.ceil((lo + hi) / 2);
      if (Big.lte(stationsCost(line, mid, R, cfg), budget)) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  function trainBase(line, R, cfg) { return Big.mul(baseCost(line.tier, R, cfg), cfg['train.costMult'] * R.train); }

  function trainsCost(line, count, R, cfg) {
    if (!(count > 0)) return Big.ZERO;
    return Big.costGeom(trainBase(line, R, cfg), cfg['train.growth'], line.trains, count);
  }

  function maxTrains(line, budget, R, cfg) { return Big.maxBuy(budget, trainBase(line, R, cfg), cfg['train.growth'], line.trains); }

  function openCost(state, cfg, tier, R) {
    R = R || rules(state, cfg);
    return Big.mul(baseCost(tier, R, cfg), cfg['line.openMult'] * R.open);
  }

  function dispatcherCost(state, cfg, line, R) {
    R = R || rules(state, cfg);
    var c = line.tier === 1 ? Big.mul(cfg['dispatcher.first'], R.cost) : Big.mul(baseCost(line.tier, R, cfg), cfg['dispatcher.mult']);
    if (bureau(state, 'dispatch')) c = Big.mul(c, cfg['bureau.dispatchDiscount']);
    return c;
  }

  function carsCost(state, cfg, line, R) {
    // No ceiling: after the listed steps every next car costs cars.growth times the last one.
    var l = String(cfg['cars.costs']).split(',');
    var lv = line.cars || 0;
    var growth = Number(cfg['cars.growth']) || 0;
    if (lv >= l.length && growth <= 1) return null;
    var k = lv < l.length ? Big.of(String(l[lv]).trim()) : Big.mul(Big.of(String(l[l.length - 1]).trim()), Big.pow(growth, lv - l.length + 1));
    return Big.mul(baseCost(line.tier, R || rules(state, cfg), cfg), k);
  }

  /** How many steps of longer trains have a listed price (the next ones grow by cars.growth). */
  function carsMax(cfg) { return String(cfg['cars.costs']).split(',').length; }

  function tariffCost(state, cfg, R) {
    R = R || rules(state, cfg);
    return Big.mul(Big.mul(cfg['tariff.base'], Big.pow(cfg['tariff.growth'], state.run.tariffs || 0)), R.cost);
  }

  function transferCost(state, cfg, a, b, R) {
    R = R || rules(state, cfg);
    return Big.mul(baseCost(Math.max(a, b), R, cfg), cfg['transfer.costMult']);
  }

  function dutyCost(state, cfg, line, R) { return Big.mul(baseCost(line.tier, R || rules(state, cfg), cfg), cfg['night.dutyCost']); }

  function ringCost(state, cfg, R) {
    var top = 1;
    state.run.lines.forEach(function (l) { if (l.tier > top) top = l.tier; });
    return Big.mul(baseCost(top, R || rules(state, cfg), cfg), cfg['ring.costMult']);
  }

  function airportCost(state, cfg, R) { return Big.mul(baseCost(UNDERGROUND_MAX, R || rules(state, cfg), cfg), cfg['airport.costMult']); }

  function maxTier(state) {
    var m = UNDERGROUND_MAX;
    if (unlocked(state, 'ground')) m = 12;
    if (patent(state, 'pneumo')) m = 13;
    return m;
  }

  /** The tier of the line that opens next (0 when every line is open). */
  function nextTier(state) {
    var lines = state.run.lines;
    var t = lines.length ? lines[lines.length - 1].tier + 1 : 1;
    return t <= maxTier(state) ? t : 0;
  }

  // ---- money -----------------------------------------------------------------------------------------------

  function gain(state, amount) {
    state.run.money = Big.add(state.run.money, amount);
    state.run.earned = Big.add(state.run.earned, amount);
  }

  function pay(state, price) {
    if (!price || Big.lt(state.run.money, price)) return false;
    state.run.money = Big.sub(state.run.money, price);
    return true;
  }

  // ---- buying (the screen, the bot and the automations call the same) ------------------------------------

  /** A plan for the station button: mode 1 | 10 | 'mile' | 'max' -> {stations, trains, cost}. */
  function stationPlan(state, cfg, tier, mode) {
    ensure(state);
    var line = lineOf(state, tier);
    if (!line) return null;
    var R = rules(state, cfg);
    var count;
    var trains = 0;
    if (mode === 'mile') {
      var target = nextMile(line.stations, cfg);
      count = target - line.stations;
      trains = Math.max(0, Math.ceil(target / cars(state, line, cfg)) - line.trains);
    } else if (mode === 'max') {
      count = Math.max(1, maxStations(line, state.run.money, R, cfg));
    } else {
      count = Math.max(1, Number(mode) || 1);
    }
    var cost = Big.add(stationsCost(line, count, R, cfg), trains ? trainsCost(line, trains, R, cfg) : Big.ZERO);
    return { stations: count, trains: trains, cost: cost, target: line.stations + count };
  }

  /** A plan for the train button: 1 | 10 | 'mile' (enough for every station) | 'max'. */
  function trainPlan(state, cfg, tier, mode) {
    ensure(state);
    var line = lineOf(state, tier);
    if (!line) return null;
    var R = rules(state, cfg);
    var count;
    if (mode === 'mile') count = Math.max(1, Math.ceil(line.stations / cars(state, line, cfg)) - line.trains);
    else if (mode === 'max') count = Math.max(1, maxTrains(line, state.run.money, R, cfg));
    else count = Math.max(1, Number(mode) || 1);
    return { trains: count, cost: trainsCost(line, count, R, cfg) };
  }

  function buyStations(state, cfg, tier, count, trains) {
    ensure(state);
    var line = lineOf(state, tier);
    if (!line || !(count > 0)) return false;
    var R = rules(state, cfg);
    var cost = Big.add(stationsCost(line, count, R, cfg), trains > 0 ? trainsCost(line, trains, R, cfg) : Big.ZERO);
    if (!pay(state, cost)) return false;
    line.stations += count;
    if (trains > 0) line.trains += trains;
    checkCityMiles(state, cfg);
    return true;
  }

  function buyTrains(state, cfg, tier, count) {
    ensure(state);
    var line = lineOf(state, tier);
    if (!line || !(count > 0)) return false;
    if (!pay(state, trainsCost(line, count, rules(state, cfg), cfg))) return false;
    line.trains += count;
    return true;
  }

  /** Buys by a plan of the buttons; true when bought. */
  function buyPlan(state, cfg, tier, kind, mode) {
    if (kind === 'train') {
      var tp = trainPlan(state, cfg, tier, mode);
      return !!tp && buyTrains(state, cfg, tier, tp.trains);
    }
    var sp = stationPlan(state, cfg, tier, mode);
    return !!sp && buyStations(state, cfg, tier, sp.stations, sp.trains);
  }

  function addLine(state, cfg, tier) {
    var line = newLine(tier, cfg);
    if (has(state.run.keepDisp || [], tier)) line.dispatcher = true;
    state.run.lines.push(line);
    return line;
  }

  function openLine(state, cfg) {
    ensure(state);
    var t = nextTier(state);
    if (!t) return false;
    if (!pay(state, openCost(state, cfg, t))) return false;
    addLine(state, cfg, t);
    return true;
  }

  function hireDispatcher(state, cfg, tier) {
    ensure(state);
    var line = lineOf(state, tier);
    if (!line || line.dispatcher) return false;
    if (!pay(state, dispatcherCost(state, cfg, line))) return false;
    line.dispatcher = true;
    return true;
  }

  function buyCars(state, cfg, tier) {
    ensure(state);
    var line = lineOf(state, tier);
    if (!line) return false;
    var c = carsCost(state, cfg, line);
    if (!c || !pay(state, c)) return false;
    line.cars = (line.cars || 0) + 1;
    return true;
  }

  function buyTariff(state, cfg) {
    ensure(state);
    if (!pay(state, tariffCost(state, cfg))) return false;
    state.run.tariffs = (state.run.tariffs || 0) + 1;
    return true;
  }

  function hasTransfer(state, a, b) {
    var tr = state.run.transfers;
    for (var i = 0; i < tr.length; i++) if ((tr[i][0] === a && tr[i][1] === b) || (tr[i][0] === b && tr[i][1] === a)) return true;
    return false;
  }

  function buyTransfer(state, cfg, a, b) {
    ensure(state);
    if (a === b || !lineOf(state, a) || !lineOf(state, b) || hasTransfer(state, a, b)) return false;
    if (state.run.transfers.length >= transferLimit(state, cfg)) return false;
    if (!pay(state, transferCost(state, cfg, a, b))) return false;
    state.run.transfers.push(a < b ? [a, b] : [b, a]);
    return true;
  }

  /** The free pairs of lines for a transfer, the most profitable first: [{a, b, cost, gain}]. */
  function transferPairs(state, cfg, now) {
    ensure(state);
    var x = envOf(state, cfg, now, true, false);
    var g = globalMult(state, cfg, x);
    var tm = transferMult(state, cfg) - 1;
    var lines = state.run.lines;
    var incs = {};
    lines.forEach(function (l) { incs[l.tier] = lineIncome(state, l, cfg, x); });
    var out = [];
    for (var i = 0; i < lines.length; i++) {
      for (var j = i + 1; j < lines.length; j++) {
        var a = lines[i].tier;
        var b = lines[j].tier;
        if (hasTransfer(state, a, b)) continue;
        out.push({ a: a, b: b, cost: transferCost(state, cfg, a, b, x.R), gain: Big.mul(Big.mul(Big.add(incs[a], incs[b]), tm), g) });
      }
    }
    out.sort(function (p, q) { return Big.cmp(q.gain, p.gain); });
    return out;
  }

  function toggleExpress(state, cfg, tier) {
    ensure(state);
    var line = lineOf(state, tier);
    if (!line || !unlocked(state, 'express')) return false;
    line.express = !line.express;
    return true;
  }

  function buyDuty(state, cfg, tier) {
    ensure(state);
    var line = lineOf(state, tier);
    if (!line || line.duty || !unlocked(state, 'night')) return false;
    if (!pay(state, dutyCost(state, cfg, line))) return false;
    line.duty = true;
    return true;
  }

  function buyRing(state, cfg) {
    ensure(state);
    if (state.run.ring || !unlocked(state, 'ring') || state.run.lines.length < 2) return false;
    if (!pay(state, ringCost(state, cfg))) return false;
    state.run.ring = true;
    return true;
  }

  function buyAirport(state, cfg) {
    ensure(state);
    if (state.run.airport || !unlocked(state, 'airport') || !lineOf(state, UNDERGROUND_MAX)) return false;
    if (!pay(state, airportCost(state, cfg))) return false;
    state.run.airport = true;
    return true;
  }

  /** «Реконструкция»: the line back to recon.stations stations for ×recon.mult for the rest of the city. */
  function reconstruct(state, cfg, tier) {
    ensure(state);
    var line = lineOf(state, tier);
    if (!line || line.recon || !unlocked(state, 'recon') || line.stations <= cfg['recon.stations']) return false;
    var done = state.run.lines.filter(function (l) { return l.recon; }).length;
    if (done >= cfg['recon.perCity']) return false;
    line.stations = cfg['recon.stations'];
    line.recon = true;
    return true;
  }

  // ---- Бюро инженера and Патентное бюро ----------------------------------------------------------------

  function nodeOf(listOfNodes, id) {
    for (var i = 0; i < listOfNodes.length; i++) if (listOfNodes[i].id === id) return listOfNodes[i];
    return null;
  }

  /** The price in blueprints of the next level of a node of the Бюро (null when it is all bought). */
  function bureauCost(state, cfg, id) {
    var n = nodeOf(BUREAU, id);
    if (!n) return null;
    var lv = bureau(state, id);
    if (!n.levels) return lv >= 1 ? null : cfg['bureau.' + id];
    // An endless node: the first cfg[n.levels] levels at the starting price, every next one dearer.
    var over = Math.max(0, lv - cfg[n.levels] + 1);
    return cfg['bureau.budget'] + lv * cfg['bureau.budgetStep'] + over * cfg['bureau.budgetOverStep'];
  }

  function blueprints(state) { return Number(cityState(state).blueprints) || 0; }

  function bureauBuy(state, cfg, id) {
    ensure(state);
    if (!unlocked(state, 'bureau')) return false;
    var n = nodeOf(BUREAU, id);
    var cost = bureauCost(state, cfg, id);
    if (!n || cost === null) return false;
    if (n.needs && !bureau(state, n.needs)) return false;
    var st = cityState(state);
    if (blueprints(state) < cost) return false;
    st.blueprints = blueprints(state) - cost;
    state.meta.bureau[id] = bureau(state, id) + 1;
    if (id === 'sleep') state.meta.sleepHours = cfg['bureau.sleepHours'];
    if (id === 'quickStart' && !lineOf(state, 2) && nextTier(state) === 2) addLine(state, cfg, 2);
    return true;
  }

  /** The price in points of level lv + 1 of a patent node: endless nodes grow after cfg[n.levels] levels. */
  function patentPrice(cfg, n, lv) {
    var base = cfg['patent.' + n.id];
    if (!n.levels) return base;
    return base + Math.max(0, lv - cfg[n.levels] + 1) * cfg['patent.capitalOverStep'];
  }

  /** Patent points left: patents held minus the points spent in the Патентное бюро. */
  function patentLeft(state, cfg) {
    var spent = 0;
    for (var k in state.meta.patents) {
      var n = nodeOf(PATENTS, k);
      if (!n) continue;
      for (var lv = 0; lv < state.meta.patents[k]; lv++) spent += patentPrice(cfg, n, lv);
    }
    return Big.toNumber(patents(state)) - spent;
  }

  function patentCost(state, cfg, id) {
    var n = nodeOf(PATENTS, id);
    if (!n) return null;
    if (!n.levels && patent(state, id) >= 1) return null;
    return patentPrice(cfg, n, patent(state, id));
  }

  function patentBuy(state, cfg, id) {
    ensure(state);
    var cost = patentCost(state, cfg, id);
    if (cost === null || patentLeft(state, cfg) < cost) return false;
    state.meta.patents[id] = patent(state, id) + 1;
    return true;
  }

  function setAuto(state, id, on) {
    ensure(state);
    if (!has(AUTOS, id)) return false;
    state.meta.autoOff[id] = !on;
    return true;
  }

  function hasAuto(state) {
    return (bureau(state, 'depot') && autoOn(state, 'depot')) || (bureau(state, 'design') && autoOn(state, 'design')) ||
      (bureau(state, 'tariffs') && autoOn(state, 'tariffs')) || (bureau(state, 'autoTransfer') && autoOn(state, 'autoTransfer')) ||
      (patent(state, 'autobuild') && autoOn(state, 'autobuild'));
  }

  // ---- the greedy choice (the bot, the «автостроитель», the debug panel) --------------------------------

  /**
   * What can be bought now and what it gives: [{kind, tier, a, b, stations, trains, cost, gain}].
   * The same bundles as the pace bot of the spec: a station (+trains it needs), stations up to
   * the next milestone (+trains), cars (worth at least 2 % of the income), a transfer, a tariff,
   * the next line.
   */
  function options(state, cfg, now) {
    ensure(state);
    var x = envOf(state, cfg, now, true, false);
    var g = globalMult(state, cfg, x);
    var lines = state.run.lines;
    var incs = lines.map(function (l) { return lineIncome(state, l, cfg, x); });
    var sum = Big.ZERO;
    incs.forEach(function (v) { sum = Big.add(sum, v); });
    var base = Big.mul(sum, g);
    var out = [];
    var t = nextTier(state);
    if (t) out.push({ kind: 'open', tier: t, cost: openCost(state, cfg, t, x.R), gain: Big.mul(lineIncome(state, newLine(t, cfg), cfg, x), g) });
    lines.forEach(function (line, i) {
      var S = cars(state, line, cfg);
      var targets = [line.stations + 1];
      var mile = nextMile(line.stations, cfg);
      if (mile !== targets[0]) targets.push(mile);
      targets.forEach(function (target) {
        var need = Math.max(line.trains, Math.ceil(target / S));
        var cost = Big.add(stationsCost(line, target - line.stations, x.R, cfg), trainsCost(line, need - line.trains, x.R, cfg));
        var after = clone(line);
        after.stations = target;
        after.trains = need;
        var d = Big.mul(Big.sub(lineIncome(state, after, cfg, x), incs[i]), g);
        if (Big.gt(d, 0)) out.push({ kind: 'stations', tier: line.tier, stations: target - line.stations, trains: need - line.trains, cost: cost, gain: d });
      });
      var cc = carsCost(state, cfg, line, x.R);
      if (cc) {
        var up = clone(line);
        up.cars = (line.cars || 0) + 1;
        var dc = Big.mul(Big.sub(lineIncome(state, up, cfg, x), incs[i]), g);
        // The listed steps are worth at least 2 % of the income; the endless ones only what they really add.
        if ((line.cars || 0) < carsMax(cfg)) out.push({ kind: 'cars', tier: line.tier, cost: cc, gain: Big.max(dc, Big.mul(base, 0.02)) });
        else if (Big.gt(dc, 0)) out.push({ kind: 'cars', tier: line.tier, cost: cc, gain: dc });
      }
    });
    if (state.run.transfers.length < transferLimit(state, cfg, x.R)) {
      var tm = transferMult(state, cfg) - 1;
      for (var i = 0; i < lines.length; i++) {
        for (var j = i + 1; j < lines.length; j++) {
          var a = lines[i].tier;
          var b = lines[j].tier;
          if (hasTransfer(state, a, b)) continue;
          out.push({ kind: 'transfer', a: a, b: b, cost: transferCost(state, cfg, a, b, x.R), gain: Big.mul(Big.mul(Big.add(incs[i], incs[j]), tm), g) });
        }
      }
    }
    out.push({ kind: 'tariff', cost: tariffCost(state, cfg, x.R), gain: Big.mul(base, cfg['tariff.mult'] - 1) });
    return out;
  }

  /** The best option by «payback + waiting» (cost / gain + cost / income), affordable or not. */
  function best(state, cfg, now, opts, rate) {
    opts = opts || options(state, cfg, now);
    rate = rate || income(state, cfg, now, true);
    var r = Big.isZero(rate) ? Big.of(1e-9) : rate;
    var top = null;
    var topScore = Infinity;
    opts.forEach(function (o) {
      if (!Big.gt(o.gain, 0)) return;
      var score = Big.toNumber(Big.div(o.cost, o.gain)) + Big.toNumber(Big.div(o.cost, r));
      if (score < topScore) {
        topScore = score;
        top = o;
      }
    });
    return top;
  }

  var BOT_BUREAU = ['budget', 'dispatch', 'longShift', 'loud', 'depot', 'quickStart', 'transfers', 'nightShift', 'design', 'tariffs',
    'sense', 'sleep', 'experience', 'hub', 'autoTransfer', 'memory'];
  var BOT_PATENTS = ['bridge', 'pneumo', 'autobuild', 'capital'];

  function botBureauDone(state) {
    for (var i = 0; i < BUREAU.length; i++) if (!BUREAU[i].levels && !bureau(state, BUREAU[i].id)) return false;
    return true;
  }

  /** The bot's Бюро and Патентное бюро: the first affordable node in a fixed order. */
  function botMeta(state, cfg) {
    var n = 0;
    for (var guard = 0; guard < 40; guard++) {
      var done = false;
      for (var i = 0; i < BOT_BUREAU.length && !done; i++) {
        // The endless start budget: its first levels in turn, the dearer ones after everything else.
        if (BOT_BUREAU[i] === 'budget' && bureau(state, 'budget') >= cfg['bureau.budgetLevels']) continue;
        if (bureauBuy(state, cfg, BOT_BUREAU[i])) done = true;
      }
      if (!done && botBureauDone(state) && bureauBuy(state, cfg, 'budget')) done = true;
      for (var j = 0; j < BOT_PATENTS.length && !done; j++) if (patentBuy(state, cfg, BOT_PATENTS[j])) done = true;
      if (!done) break;
      n++;
    }
    return n;
  }

  /** Buys an option of options(); true when bought. */
  function take(state, cfg, o) {
    if (!o) return false;
    if (o.kind === 'open') return openLine(state, cfg);
    if (o.kind === 'stations') return buyStations(state, cfg, o.tier, o.stations, o.trains);
    if (o.kind === 'cars') return buyCars(state, cfg, o.tier);
    if (o.kind === 'transfer') return buyTransfer(state, cfg, o.a, o.b);
    if (o.kind === 'tariff') return buyTariff(state, cfg);
    if (o.kind === 'dispatcher') return hireDispatcher(state, cfg, o.tier);
    return false;
  }

  // ---- automations -------------------------------------------------------------------------------------

  function note(state, key, n) {
    var a = state.run.away;
    if (!a) return;
    a[key] = (a[key] || 0) + (n || 1);
  }

  /** The automations of the Бюро and the «автостроитель»; `realSec` — real seconds since the last call. */
  function automate(state, cfg, now, realSec, offline) {
    var r = state.run;
    var R = rules(state, cfg);
    var order = r.lines.slice().sort(function (a, b) { return b.tier - a.tier; });
    var bought = 0;
    if (bureau(state, 'depot') && autoOn(state, 'depot')) {
      order.forEach(function (line) {
        var need = Math.ceil(line.stations / cars(state, line, cfg)) - line.trains;
        if (need <= 0) return;
        var can = Math.min(need, maxTrains(line, r.money, R, cfg));
        if (can > 0 && buyTrains(state, cfg, line.tier, can)) {
          bought += can;
          if (offline) note(state, 'trains', can);
        }
      });
    }
    if (bureau(state, 'design') && autoOn(state, 'design')) {
      order.forEach(function (line) {
        var target = nextMile(line.stations, cfg);
        var count = target - line.stations;
        if (count > 0 && Big.gte(r.money, stationsCost(line, count, R, cfg)) && buyStations(state, cfg, line.tier, count, 0)) {
          bought += count;
          if (offline) note(state, 'stations', count);
        }
      });
    }
    if (bureau(state, 'tariffs') && autoOn(state, 'tariffs')) {
      var guard = 0;
      while (guard++ < 20 && buyTariff(state, cfg)) {
        bought++;
        if (offline) note(state, 'tariffs', 1);
      }
    }
    if (bureau(state, 'autoTransfer') && autoOn(state, 'autoTransfer') && r.transfers.length < transferLimit(state, cfg, R)) {
      var pairs = transferPairs(state, cfg, now);
      if (pairs.length && Big.gte(r.money, pairs[0].cost) && buyTransfer(state, cfg, pairs[0].a, pairs[0].b)) {
        bought++;
        if (offline) note(state, 'transfers', 1);
      }
    }
    if (patent(state, 'autobuild') && autoOn(state, 'autobuild')) {
      r.buildAcc = (r.buildAcc || 0) + realSec;
      var every = cfg['autobuild.everySec'];
      while (r.buildAcc >= every) {
        r.buildAcc -= every;
        var o = best(state, cfg, now);
        if (o && take(state, cfg, o)) {
          bought++;
          if (offline) note(state, 'built', 1);
        }
      }
    }
    return bought;
  }

  // ---- the city: milestones, tasks ------------------------------------------------------------------------

  function checkCityMiles(state, cfg) {
    var r = state.run;
    if (r.lines.length < cfg['cityMile.minLines']) return false;
    var grew = false;
    for (var guard = 0; guard < 1000; guard++) {
      var need = cityMileNeed(cfg, r.cityMiles);
      if (need === Infinity) break;
      var all = r.lines.every(function (line) { return line.stations >= need; });
      if (!all) break;
      r.cityMiles++;
      grew = true;
    }
    return grew;
  }

  function crowded(state, cfg) {
    var lines = state.run.lines;
    for (var i = 0; i < lines.length; i++) if (served(state, lines[i], cfg) < lines[i].stations) return true;
    return false;
  }

  /** The goal of a task of the city c (task.* settings grow with the number of the city). */
  function taskGoal(state, cfg, kind, c) {
    c = c || cityOf(state);
    if (kind === 'lines') return Math.min(maxTier(state), Math.floor(cfg['task.lines'] + (c - 1) * cfg['task.linesStep']));
    if (kind === 'stations') return cfg['task.stations'] + (c - 1) * cfg['task.stationsStep'];
    if (kind === 'transfers') return transferLimit(state, cfg);
    if (kind === 'income') return Big.mul(cfg['task.income'], Big.pow(cfg['task.incomeGrowth'], c - 1));
    if (kind === 'calm') return cfg['task.calmSec'];
    return 0;
  }

  /** {have, need, done} of a task in the current city. */
  function taskProgress(state, cfg, kind, now) {
    ensure(state);
    var st = cityState(state);
    var done = has(st.tasks[String(cityOf(state))] || [], kind);
    var need = taskGoal(state, cfg, kind);
    var have;
    if (kind === 'lines') have = state.run.lines.length;
    else if (kind === 'stations') have = state.run.lines.reduce(function (m, l) { return Math.max(m, l.stations); }, 0);
    else if (kind === 'transfers') have = state.run.transfers.length;
    else if (kind === 'income') have = incomeX(state, cfg, envOf(state, cfg, now, true, false));
    else have = Math.floor(state.run.calmSec || 0);
    var reached = Big.isBig(need) ? Big.gte(have, need) : have >= need;
    return { kind: kind, have: have, need: need, done: done, reached: reached };
  }

  /** Gives a blueprint and a retro train («по одному за событие или задание») for every task just done. */
  function checkTasks(state, cfg, now, rng) {
    var st = cityState(state);
    var key = String(cityOf(state));
    var done = st.tasks[key] = st.tasks[key] || [];
    var fresh = [];
    TASKS.forEach(function (kind) {
      if (has(done, kind)) return;
      if (!taskProgress(state, cfg, kind, now).reached) return;
      done.push(kind);
      st.blueprints = blueprints(state) + 1;
      var idx = rng ? rng.int(RETRO) : (cityOf(state) - 1 + TASKS.indexOf(kind)) % RETRO;
      state.meta.retro[idx] = (state.meta.retro[idx] || 0) + 1;
      state.run.lastRetro = idx;
      fresh.push(kind);
    });
    return fresh;
  }

  // ---- events (only while the game is open) ------------------------------------------------------------

  function eventGap(cfg, rng, R) { return Math.round(rng.range(cfg['event.minSec'], cfg['event.maxSec']) * 1000 / R.events); }

  function pickTiers(state, rng, count, must) {
    var tiers = state.run.lines.map(function (l) { return l.tier; });
    rng.shuffle(tiers);
    var out = [];
    if (must) out.push(must);
    for (var i = 0; i < tiers.length && out.length < count; i++) if (!has(out, tiers[i])) out.push(tiers[i]);
    out.sort(function (a, b) { return a - b; });
    return out;
  }

  /**
   * Stations to choose from for a shopping centre: up to `count` of them, {t: tier, j: index}, on
   * different lines while there are enough, among the served stations of a line (all, if none is).
   */
  function pickStations(state, cfg, rng, count) {
    var tiers = pickTiers(state, rng, count);
    var out = [];
    for (var guard = 0; out.length < count && guard < count * 8; guard++) {
      var line = lineOf(state, tiers[guard % tiers.length]);
      var pool = served(state, line, cfg) || line.stations;
      if (pool < 1) continue;
      var j = rng.int(pool);
      var dup = false;
      for (var i = 0; i < out.length; i++) if (out[i].t === line.tier && out[i].j === j) dup = true;
      if (!dup && !has(line.mallAt || [], j)) out.push({ t: line.tier, j: j });
    }
    return out;
  }

  /** The answer to a question of the Inspector: the tier of the line. */
  function answerOf(state, cfg, q, now) {
    var lines = state.run.lines;
    if (q === 'newest') return lines[lines.length - 1].tier;
    var x = envOf(state, cfg, now, true, false);
    var top = lines[0];
    var topV = null;
    lines.forEach(function (l) {
      var v = q === 'stations' ? Big.of(l.stations) : q === 'trains' ? Big.of(l.trains) : lineIncome(state, l, cfg, x);
      if (topV === null || Big.gt(v, topV)) {
        topV = v;
        top = l;
      }
    });
    return top.tier;
  }

  function eligibleSpecial(state, cfg, now) {
    var r = state.run;
    var md = monthDay(now);
    var day = dayKey(now);
    var year = String(new Date(now).getFullYear());
    var out = [];
    if (r.streak >= cfg['glove.streak']) out.push('glove');
    if (md === cfg['sept1.date'] && lineOf(state, 5) && r.shown.sept1 !== day) out.push('sept1');
    var ny = span(cfg['newyear.hours']);
    var nyYear = md === cfg['newyear.date'] ? year : String(new Date(now).getFullYear() - 1);
    var newYearNight = (md === cfg['newyear.date'] && ny && minuteOf(now) >= ny[0]) ||
      (md === '01-01' && ny && minuteOf(now) < ny[1]);
    if (newYearNight && r.shown.newyear !== nyYear) out.push('newyear');
    if (md === cfg['museums.date'] && unlocked(state, 'night') && r.shown.museums !== year) out.push('museums');
    if (within(cfg['rush.eventHours'], now) && r.shown.rush !== day) out.push('rush');
    return out;
  }

  function spawnEvent(state, cfg, now, rng, R) {
    var r = state.run;
    var lines = r.lines;
    if (!lines.length) return null;
    var life = (bureau(state, 'sense') ? cfg['event.lifeLong'] : cfg['event.lifeSec']) * 1000;
    var ev = { kind: '', at: now, until: now + life, gap: eventGap(cfg, rng, R) };
    if (rng.chance(cfg['retro.chance'])) {
      ev.kind = 'retro';
      ev.retro = rng.int(RETRO);
      return ev;
    }
    var special = eligibleSpecial(state, cfg, now);
    if (special.length) {
      ev.kind = special[0];
      var day = dayKey(now);
      var year = String(new Date(now).getFullYear());
      if (ev.kind === 'sept1' || ev.kind === 'rush') r.shown[ev.kind] = day;
      if (ev.kind === 'museums') r.shown.museums = year;
      if (ev.kind === 'newyear') r.shown.newyear = monthDay(now) === cfg['newyear.date'] ? year : String(new Date(now).getFullYear() - 1);
      return ev;
    }
    var pool = REGULAR.filter(function (k) {
      if (k === 'musician') return r.transfers.length > 0;
      if (k === 'mall') return !r.mallDone;
      if (k === 'inspector') return lines.length >= 3;
      return true;
    });
    ev.kind = rng.pick(pool);
    if (ev.kind === 'match' || ev.kind === 'fair' || ev.kind === 'escalator') ev.tier = rng.pick(lines).tier;
    if (ev.kind === 'mall') ev.choices = pickStations(state, cfg, rng, 3);
    if (ev.kind === 'inspector') {
      ev.q = rng.pick(QUESTIONS);
      ev.answer = answerOf(state, cfg, ev.q, now);
      ev.choices = pickTiers(state, rng, 3, ev.answer);
    }
    return ev;
  }

  function stepEvents(state, cfg, now, rng, R) {
    var r = state.run;
    r.boosts = r.boosts.filter(function (b) { return b.until > now; });
    var ev = r.event;
    if (ev) {
      if (now > ev.until) {
        // Missed while playing breaks the series; a card that expired while the game was closed does not.
        if (now - ev.until < cfg['event.awaySec'] * 1000) r.streak = 0;
        r.event = null;
        r.nextEventAt = now + (ev.gap || eventGap(cfg, rng, R));
      }
      return;
    }
    if (!(r.nextEventAt > 0)) {
      r.nextEventAt = now + eventGap(cfg, rng, R);
      return;
    }
    if (now < r.nextEventAt) return;
    r.event = spawnEvent(state, cfg, now, rng, R);
    if (!r.event) r.nextEventAt = now + eventGap(cfg, rng, R);
  }

  function boost(state, k, m, until, t, session) {
    var b = { k: k, m: m, until: until };
    if (t) b.t = t;
    if (session) b.session = true;
    state.run.boosts.push(b);
  }

  /**
   * Takes the card of the event: choice — a tier (inspector), the position of a station in
   * ev.choices (mall) or 'pay' / 'skip' (escalator).
   * Returns {kind, ok, amount?, right?, tier?, station?, retro?} or null when there is no card.
   */
  function collect(state, cfg, choice, now, mult) {
    ensure(state);
    var r = state.run;
    var ev = r.event;
    if (!ev || now > ev.until) return null;
    var rate = Big.mul(income(state, cfg, now, true), mult || 1);
    var out = { kind: ev.kind, ok: true, tier: ev.tier };
    var k = ev.kind;
    if (CHOICE[k] && choice === undefined) return { kind: k, ok: false, need: 'choice' };
    if (k === 'match') boost(state, 'line', cfg['match.mult'], now + cfg['match.sec'] * 1000, ev.tier);
    else if (k === 'rain') boost(state, 'all', cfg['rain.mult'], now + cfg['rain.sec'] * 1000);
    else if (k === 'suitcase') { out.amount = Big.mul(rate, cfg['suitcase.min'] * 60); gain(state, out.amount); }
    else if (k === 'school') boost(state, 'tap', cfg['school.mult'], now + cfg['school.sec'] * 1000);
    else if (k === 'musician') boost(state, 'transfer', cfg['musician.mult'], now + cfg['musician.sec'] * 1000);
    else if (k === 'fair') boost(state, 'line', cfg['fair.mult'], now + cfg['fair.sec'] * 1000, ev.tier);
    else if (k === 'mall') {
      // choice — the position of the station in ev.choices ({t, j}).
      var pick = ev.choices && ev.choices[Number(choice)];
      var line = pick && lineOf(state, pick.t);
      if (!line) return { kind: k, ok: false };
      line.mallAt = line.mallAt || [];
      if (!has(line.mallAt, pick.j)) line.mallAt.push(pick.j);
      r.mallDone = true;
      out.tier = line.tier;
      out.station = pick.j;
    } else if (k === 'snow') boost(state, 'snow', cfg['snow.mult'], now + cfg['snow.sec'] * 1000);
    else if (k === 'museums') r.museumsUntil = nextClock(now, span(cfg['night.hours']) ? span(cfg['night.hours'])[1] : 330);
    else if (k === 'tourist') { out.amount = Big.mul(rate, cfg['tourist.min'] * 60); gain(state, out.amount); }
    else if (k === 'escalator') {
      if (choice === 'pay') {
        var price = Big.mul(rate, cfg['escalator.costMin'] * 60);
        var esc = lineOf(state, ev.tier);
        if (!esc || !pay(state, price)) return { kind: k, ok: false, need: 'money', amount: price };
        esc.bonus = (esc.bonus || 0) + 1;
        out.amount = Big.neg(price);
      }
      out.paid = choice === 'pay';
    } else if (k === 'inspector') {
      out.right = Number(choice) === ev.answer;
      out.answer = ev.answer;
      if (out.right) { out.amount = Big.mul(rate, cfg['inspector.min'] * 60); gain(state, out.amount); }
    } else if (k === 'graduation') boost(state, 'all', cfg['graduation.mult'], now + cfg['graduation.maxMin'] * 60000, 0, true);
    else if (k === 'retro') {
      state.meta.retro[ev.retro] = (state.meta.retro[ev.retro] || 0) + 1;
      r.lastRetro = ev.retro;
      out.retro = ev.retro;
    } else if (k === 'sept1') boost(state, 'line', cfg['sept1.mult'], nextClock(now, 0), 5);
    else if (k === 'newyear') boost(state, 'all', cfg['newyear.mult'], nextClock(now, span(cfg['newyear.hours']) ? span(cfg['newyear.hours'])[1] : 180));
    else if (k === 'rush') boost(state, 'all', cfg['rush.eventMult'], now + cfg['rush.eventSec'] * 1000);
    else if (k === 'glove') cityState(state).blueprints = blueprints(state) + 1;
    r.streak = k === 'glove' ? 0 : (r.streak || 0) + 1;
    state.meta.collected = (state.meta.collected || 0) + 1;
    r.event = null;
    r.nextEventAt = now + (ev.gap || 120000);
    return out;
  }

  /** The session ended (the screen hid): «Выпускной» lasts only till the end of the session. */
  function endSession(state) {
    ensure(state);
    state.run.boosts = state.run.boosts.filter(function (b) { return !b.session; });
    return true;
  }

  // ---- the turnstile ------------------------------------------------------------------------------------------

  /** One tap of the turnstile: 1 + 3 % of the income a second; at most turnstile.maxPerSec a second count. */
  function tap(state, cfg, mult, now) {
    ensure(state);
    var r = state.run;
    now = now || 0;
    var sec = Math.floor(now / 1000);
    if (r.tapSec !== sec) {
      r.tapSec = sec;
      r.tapN = 0;
    }
    if (r.tapN >= cfg['turnstile.maxPerSec']) return Big.ZERO;
    r.tapN++;
    var x = envOf(state, cfg, now, true);
    var amount = Big.add(cfg['turnstile.base'], Big.mul(incomeX(state, cfg, x), cfg['turnstile.share']));
    var m = (mult || 1) * x.tap * (bureau(state, 'loud') ? cfg['bureau.loudMult'] : 1);
    amount = Big.mul(amount, m);
    gain(state, amount);
    return amount;
  }

  // ---- the functions the engine calls ----------------------------------------------------------------------

  function init(ctx) {
    var cfg = ctx.config;
    return {
      run: freshRun(cfg),
      layers: { city: { currency: '0e0', count: 0, best: '0e0', state: freshCity() }, general: { currency: '0e0', count: 0, best: '0e0', state: {} } },
      meta: freshMeta()
    };
  }

  /** Accumulates what happened while away (the screen turns it into lines of «Пока вас не было»). */
  function away(state, realSec, money, carriedNow, now) {
    var a = state.run.away;
    if (!a) a = state.run.away = { sec: 0, money: '0e0', carried: '0e0', from: now - realSec * 1000 };
    a.sec += realSec;
    a.money = bigStr(Big.add(a.money, money));
    a.carried = bigStr(Big.add(a.carried, carriedNow));
    a.to = now;
  }

  function tick(state, dt, ctx) {
    ensure(state);
    var cfg = ctx.config;
    var now = ctx.now || 0;
    var online = !ctx.offline;
    var r = state.run;
    var R = rules(state, cfg);
    if (online && ctx.rng) stepEvents(state, cfg, now, ctx.rng, R);
    var x = envOf(state, cfg, now, online);
    var real = online ? dt : dt / (cfg['offline.efficiency'] || 1);
    var scale = online ? 1 : offlineEff(state, cfg) / (cfg['offline.efficiency'] || 1) * R.offline;
    var pass = passengersX(state, cfg, x);
    var money = Big.mul(Big.add(Big.mul(pass, globalMult(state, cfg, x)), bridgeIncome(state, cfg)), dt * scale * (ctx.mult || 1));
    if (!Big.isZero(money)) gain(state, money);
    var carriedNow = Big.mul(pass, dt * scale);
    if (!Big.isZero(carriedNow)) {
      r.carried = Big.add(r.carried, carriedNow);
      state.meta.carried = Big.add(state.meta.carried, carriedNow);
    }
    r.calmSec = crowded(state, cfg) ? 0 : (r.calmSec || 0) + real;
    if (online) {
      r.playSec = (r.playSec || 0) + dt;
      var p = ctx.links && ctx.links.passenger;
      if (p && p.state === 'trip') state.meta.tripSec = (state.meta.tripSec || 0) + dt;
    } else {
      away(state, real, money, carriedNow, now);
    }
    r.autoAcc = (r.autoAcc || 0) + real;
    if (r.autoAcc >= 1 || !online) {
      var spent = r.autoAcc;
      r.autoAcc = 0;
      automate(state, cfg, now, spent, !online);
    }
    // The tasks give blueprints only while the game is open (the first second after a return
    // counts what was reached away): a blueprint is not a currency of «Забрать ×2».
    r.taskAcc = (r.taskAcc || 0) + real;
    if (r.taskAcc >= 1 || !online) {
      r.taskAcc = 0;
      checkCityMiles(state, cfg);
      if (online) checkTasks(state, cfg, now, ctx.rng);
    }
  }

  /**
   * One second of the pace bot of «Темп»: `taps` presses of the turnstile, a dispatcher when it is
   * cheaper than the next best buy, then the best option (payback + waiting) while it is affordable.
   */
  function botStep(state, cfg, now, taps, mult) {
    ensure(state);
    for (var i = 0; i < taps; i++) tap(state, cfg, mult, now);
    var bought = 0;
    for (var guard = 0; guard < 60; guard++) {
      var o = best(state, cfg, now);
      var ratio = cfg['bot.dispatcherRatio'];
      if (ratio > 0) {
        state.run.lines.forEach(function (l) {
          if (l.dispatcher || (o && o.kind === 'dispatcher')) return;
          var c = dispatcherCost(state, cfg, l);
          if (!o || Big.lte(c, Big.mul(o.cost, ratio))) o = { kind: 'dispatcher', tier: l.tier, cost: c };
        });
      }
      if (!o || Big.lt(state.run.money, o.cost) || !take(state, cfg, o)) break;
      bought++;
    }
    return bought;
  }

  /** The cut points of [start, end]: the night, the rush hours and the end of the bellows of the steps. */
  function cuts(state, cfg, start, end) {
    var points = [start, end];
    if (state.run.boostUntil > start && state.run.boostUntil < end) points.push(state.run.boostUntil);
    var specs = [];
    if (unlocked(state, 'night')) specs.push(cfg['night.hours']);
    if (unlocked(state, 'districts')) specs.push(cfg['rush.morning'], cfg['rush.evening']);
    var minutes = [];
    specs.forEach(function (sp) {
      var s = span(sp);
      if (s) minutes.push(s[0], s[1]);
    });
    if (minutes.length) {
      var d = new Date(start);
      d.setHours(0, 0, 0, 0);
      for (var day = 0; day < 40 && d.getTime() < end; day++) {
        minutes.forEach(function (m) {
          var t = new Date(d.getTime());
          t.setHours(Math.floor(m / 60), m % 60, 0, 0);
          var ms = t.getTime();
          if (ms > start && ms < end) points.push(ms);
        });
        d.setDate(d.getDate() + 1);
      }
    }
    points.sort(function (a, b) { return a - b; });
    return points;
  }

  /**
   * Offline by formula when nothing is bought by itself: the dispatcher lines' income times the
   * time, piece by piece of the clock (night, rush hours). With automations — steps of
   * offline.stepSec, as tick does it. `sec` comes already times offline.efficiency.
   */
  function offline(state, sec, ctx) {
    ensure(state);
    var cfg = ctx.config;
    var eff = cfg['offline.efficiency'] || 1;
    var real = sec / eff;
    var end = ctx.now || 0;
    var start = end - real * 1000;
    if (!(real > 0)) return { events: [] };
    if (hasAuto(state)) {
      var n = Math.max(1, Math.ceil(real / cfg['offline.stepSec']));
      var piece = real / n;
      for (var i = 0; i < n; i++) {
        var c = {};
        for (var k in ctx) c[k] = ctx[k];
        c.now = start + piece * (i + 1) * 1000;
        c.offline = true;
        tick(state, piece * eff, c);
      }
      return { events: [] };
    }
    var R = rules(state, cfg);
    var scale = offlineEff(state, cfg) * R.offline * (ctx.mult || 1);
    var points = cuts(state, cfg, start, end);
    var money = Big.ZERO;
    var carried = Big.ZERO;
    for (var j = 0; j + 1 < points.length; j++) {
      var a = points[j];
      var b = points[j + 1];
      if (b <= a) continue;
      // The clock of the piece is its middle: the night and the rush hours are cut points.
      var x = envOf(state, cfg, (a + b) / 2, false);
      var pass = passengersX(state, cfg, x);
      var dur = (b - a) / 1000;
      money = Big.add(money, Big.mul(Big.add(Big.mul(pass, globalMult(state, cfg, x)), bridgeIncome(state, cfg)), dur * scale));
      carried = Big.add(carried, Big.mul(pass, dur * offlineEff(state, cfg) * R.offline));
    }
    if (!Big.isZero(money)) gain(state, money);
    if (!Big.isZero(carried)) {
      state.run.carried = Big.add(state.run.carried, carried);
      state.meta.carried = Big.add(state.meta.carried, carried);
    }
    state.run.calmSec = crowded(state, cfg) ? 0 : (state.run.calmSec || 0) + real;
    away(state, real, money, carried, end);
    return { events: [] };
  }

  /** ОИ the move gives now: floor(sqrt(E / oi.div)) minus what this cycle already gave. */
  function cityGain(state, cfg) {
    var st = cityState(state);
    var E = Big.add(st.earned || 0, state.run.earned || 0);
    var total = Big.floor(Big.sqrt(Big.div(E, cfg['oi.div'])));
    var g = Big.sub(total, oi(state));
    return Big.sign(g) > 0 ? g : Big.ZERO;
  }

  function generalGain(state, cfg) {
    if (!unlocked(state, 'general')) return Big.ZERO;
    var all = Big.add(state.meta.oiEver || 0, cityGain(state, cfg));
    var total = Big.floor(Big.sqrt(Big.div(all, cfg['patent.div'])));
    var g = Big.sub(total, patents(state));
    return Big.sign(g) > 0 ? g : Big.ZERO;
  }

  function prestigeGain(state, layerId, cfg) {
    ensure(state);
    return layerId === GENERAL ? generalGain(state, cfg) : cityGain(state, cfg);
  }

  /** The mark «выгодно» of the game: new ОИ at least the held ones (prestige.hintRatio), and at least oi.hintMin. */
  function moveHint(state, cfg) {
    var g = cityGain(state, cfg);
    var need = Big.max(Big.mul(oi(state), cfg['prestige.hintRatio']), cfg['oi.hintMin']);
    return Big.gte(g, need) && Big.gte(g, 1);
  }

  function bonus(state, layerId, amount, cfg) {
    ensure(state);
    if (layerId === GENERAL) return patentMult(cfg, Big.of(amount, 0));
    return Big.add(1, Big.mul(amount, oiRate(state, cfg)));
  }

  function unlockFor(state, city, now) {
    var keys = UNLOCKS[((city - 1) % 10) + 1] || [];
    if (city > 10) keys = [];
    var fresh = [];
    keys.forEach(function (k) {
      if (!state.meta.unlocks[k]) {
        state.meta.unlocks[k] = now || 1;
        fresh.push(k);
      }
    });
    return fresh;
  }

  /** What a new city starts with: the start budget of the Бюро and patents, the fast start, the kept dispatchers. */
  function startCity(state, cfg) {
    var r = state.run;
    var money = Big.ZERO;
    var lv = bureau(state, 'budget');
    if (lv > 0) money = Big.add(money, Big.mul(cfg['bureau.budgetStart'], Big.pow(cfg['bureau.budgetGrowth'], lv - 1)));
    var cap = patent(state, 'capital');
    if (cap > 0) money = Big.add(money, Big.mul(cfg['patent.capitalStart'], Big.pow(cfg['patent.capitalGrowth'], cap - 1)));
    r.money = bigStr(money);
    r.lines.forEach(function (l) { if (has(r.keepDisp, l.tier)) l.dispatcher = true; });
    if (bureau(state, 'quickStart') && !lineOf(state, 2)) addLine(state, cfg, 2);
  }

  function onPrestige(state, layerId, before, ctx) {
    ensure(state);
    var cfg = ctx.config;
    var now = ctx.now || Date.now();
    var st = cityState(state);
    if (layerId === LAYER) {
      st.earned = bigStr(Big.add(st.earned || 0, before.run.earned || 0));
      st.city = (st.city || 1) + 1;
      var b = ensure(clone(before));
      st.prevIncome = bigStr(income(b, cfg, now, true));
      var gained = Big.sub(oi(state), Big.of(before.layers[LAYER].currency, 0));
      state.meta.oiEver = bigStr(Big.add(state.meta.oiEver || 0, gained));
      state.meta.maxCity = Math.max(state.meta.maxCity || 1, st.city);
      state.run.unlocked = unlockFor(state, st.city, now);
      if (bureau(state, 'memory')) {
        var kept = (before.run.keepDisp || []).slice();
        before.run.lines.forEach(function (l) { if (l.dispatcher && !has(kept, l.tier)) kept.push(l.tier); });
        state.run.keepDisp = kept;
      }
    } else if (layerId === GENERAL) {
      var pending = cityGain(ensure(clone(before)), cfg);
      state.meta.oiEver = bigStr(Big.add(state.meta.oiEver || 0, pending));
      var fc = freshCity();
      for (var k in fc) if (st[k] === undefined) st[k] = fc[k];
    }
    startCity(state, cfg);
  }

  function migrate(state, fromVer) {
    // Version 1 is the first; a new version adds a case here and fixtures/v<old>.json.
    return state;
  }

  function validate(state) {
    var r = state.run;
    if (!r || !Array.isArray(r.lines)) return 'нет линий';
    for (var i = 0; i < r.lines.length; i++) {
      var l = r.lines[i];
      if (!(l.tier >= 1 && l.tier <= 13 && l.tier % 1 === 0)) return 'линия ' + i + ': номер ' + l.tier;
      if (!(l.stations >= 0 && l.stations % 1 === 0)) return 'линия ' + l.tier + ': станций ' + l.stations;
      if (!(l.trains >= 0 && l.trains % 1 === 0)) return 'линия ' + l.tier + ': поездов ' + l.trains;
    }
    if (!Big.valid(r.money) || Big.sign(r.money) < 0) return 'денег меньше нуля';
    if (!Array.isArray(r.transfers)) return 'нет пересадок';
    return null;
  }

  function summary(state, cfg) {
    ensure(state);
    var inc = income(state, cfg, state.lastTick || 0, true);
    var n = state.run.lines.length;
    var parts = [Fmt.rate(inc), n + ' ' + Fmt.plural(n, 'линия', 'линии', 'линий'), 'город ' + cityOf(state)];
    return { line: parts.join(' · ') };
  }

  /** The notifications: enough for stations to the milestone of the best line; the move becomes worth it. */
  function next(state, now, cfg) {
    ensure(state);
    var rate = offlineRate(state, cfg, now);
    if (Big.isZero(rate)) return [];
    var out = [];
    var x = envOf(state, cfg, now, false);
    var top = null;
    var topV = null;
    state.run.lines.forEach(function (l) {
      var v = lineIncome(state, l, cfg, x);
      if (topV === null || Big.gt(v, topV)) {
        topV = v;
        top = l;
      }
    });
    if (top) {
      var plan = stationPlan(state, cfg, top.tier, 'mile');
      var need = Big.sub(plan.cost, state.run.money);
      var sec = Big.sign(need) <= 0 ? 0 : Big.toNumber(Big.div(need, rate));
      if (sec > 0 && sec < 86400) out.push({ id: 'mile', at: now + Math.ceil(sec) * 1000, text: 'Хватает на ' + plan.stations + ' ст. до вехи ' + plan.target + ' на линии №' + top.tier });
    }
    if (!moveHint(state, cfg)) {
      var have = oi(state);
      var want = Big.add(have, Big.max(Big.mul(have, cfg['prestige.hintRatio']), cfg['oi.hintMin']));
      var E = Big.mul(Big.mul(want, want), cfg['oi.div']);
      var st = cityState(state);
      var left = Big.sub(E, Big.add(st.earned || 0, state.run.earned || 0));
      var s2 = Big.sign(left) <= 0 ? 0 : Big.toNumber(Big.div(left, rate));
      if (s2 > 0 && s2 < 86400) out.push({ id: 'move', at: now + Math.ceil(s2) * 1000, text: 'Переезд в новый город уже выгоден' });
    }
    return out;
  }

  /** The chest of «Пассажир»: «вагон с выручкой» — chest.minutes of income and a chance of a retro train. */
  function chest(state, rng, cfg) {
    ensure(state);
    var inc = income(state, cfg, state.lastTick || 0, true);
    var amount = Big.max(Big.mul(inc, cfg['chest.minutes'] * 60), Big.mul(cfg['turnstile.base'], 100));
    gain(state, amount);
    var items = [{ title: 'Деньги, ₽', amount: amount }];
    if (rng.chance(cfg['chest.retroChance'])) {
      var idx = rng.int(RETRO);
      state.meta.retro[idx] = (state.meta.retro[idx] || 0) + 1;
      state.run.lastRetro = idx;
      items.push({ title: 'Ретро-состав в коллекцию', amount: 1 });
    }
    return { title: 'Вагон с выручкой', items: items };
  }

  var POOL = ['Липовая аллея', 'Речной вокзал', 'Пожарная каланча', 'Библиотечная', 'Сенной рынок', 'Ткацкая', 'Хлебозавод',
    'Обсерватория', 'Тихий тупик', 'Водокачка', 'Почтамт', 'Старая мельница', 'Ботанический сад', 'Каменный мост', 'Цирковая'];

  /** Without the model's stock: a station from the start pool with a district number; a built-in note. */
  function procedural(kind, rng) {
    if (kind === 'stations') return { title: rng.pick(POOL) + '-' + rng.int(2, 9), procedural: true };
    if (kind === 'tariffs') return null;
    if (kind === 'notes') return { title: 'Городская хроника', text: rng.pick(['Пассажиры хвалят чистые вагоны', 'Машинисты просят больше пересадок', 'Город спорит, какой линии нужен новый депо']), procedural: true };
    return null;
  }

  function validateStock(kind, item) {
    if (/https?:/.test(JSON.stringify(item))) return 'ссылка в тексте';
    if (kind === 'events' && item.kind && EVENTS.indexOf(item.kind) < 0) return 'нет такого события: ' + item.kind;
    return null;
  }

  function capBonusHours(state) {
    ensure(state);
    return bureau(state, 'sleep') ? Number(state.meta.sleepHours) || 12 : 0;
  }

  /** The lines as the screen shows them: [{tier, stations, trains, S, served, crowd, income, mult, next}]. */
  function lineStats(state, cfg, now) {
    ensure(state);
    var x = envOf(state, cfg, now, true);
    var g = globalMult(state, cfg, x);
    return state.run.lines.map(function (l) {
      var S = cars(state, l, cfg);
      var s = served(state, l, cfg);
      var inc = lineIncome(state, l, cfg, x);
      return {
        tier: l.tier, stations: l.stations, trains: l.trains, S: S, served: s, crowd: l.stations - s, passengers: inc,
        income: Big.mul(inc, g), mult: lineMult(state, l, cfg, x), next: nextMile(l.stations, cfg), miles: miles(l.stations, cfg),
        transfers: transfersOf(state, l.tier), dispatcher: !!l.dispatcher, express: !!l.express, duty: !!l.duty, recon: !!l.recon,
        ground: !!GROUND[l.tier], line: l
      };
    });
  }

  return {
    init: init, tick: tick, offline: offline, prestigeGain: prestigeGain, bonus: bonus, onPrestige: onPrestige,
    migrate: migrate, validate: validate, summary: summary, next: next, chest: chest, procedural: procedural,
    validateStock: validateStock, capBonusHours: capBonusHours,
    // the screen, the bot and the checks
    ensure: ensure, rules: rules, income: income, offlineRate: offlineRate, offlineEff: offlineEff, envOf: envOf,
    lineStats: lineStats, lineIncome: lineIncome, lineMult: lineMult, globalMult: globalMult, patentMult: patentMult, cars: cars, served: served,
    miles: miles, nextMile: nextMile, district: district, districtCount: districtCount, baseCost: baseCost, demand: demand,
    stationsCost: stationsCost, trainsCost: trainsCost, openCost: openCost, dispatcherCost: dispatcherCost, carsCost: carsCost,
    carsMax: carsMax, tariffCost: tariffCost, transferCost: transferCost, dutyCost: dutyCost, ringCost: ringCost,
    airportCost: airportCost, transferLimit: transferLimit, transferMult: transferMult, transferPairs: transferPairs,
    stationPlan: stationPlan, trainPlan: trainPlan, buyPlan: buyPlan, buyStations: buyStations, buyTrains: buyTrains,
    openLine: openLine, hireDispatcher: hireDispatcher, buyCars: buyCars, buyTariff: buyTariff, buyTransfer: buyTransfer,
    toggleExpress: toggleExpress, buyDuty: buyDuty, buyRing: buyRing, buyAirport: buyAirport, reconstruct: reconstruct,
    bureauCost: bureauCost, bureauBuy: bureauBuy, patentCost: patentCost, patentBuy: patentBuy, patentLeft: patentLeft,
    setAuto: setAuto, hasAuto: hasAuto, autoOn: autoOn, options: options, best: best, take: take, automate: automate, botStep: botStep, botMeta: botMeta,
    collect: collect, endSession: endSession, tap: tap, cityGain: cityGain, generalGain: generalGain, moveHint: moveHint,
    taskGoal: taskGoal, taskProgress: taskProgress, checkTasks: checkTasks, crowded: crowded, cityMileMult: cityMileMult, cityMileNeed: cityMileNeed, cityMileStep: cityMileStep,
    nextTier: nextTier, maxTier: maxTier, lineOf: lineOf, cityOf: cityOf, unlocked: unlocked, bureauLevel: bureau,
    patentLevel: patent, blueprints: blueprints, oiRate: oiRate, within: within, hasTransfer: hasTransfer,
    LAYER: LAYER, GENERAL: GENERAL, BUREAU: BUREAU, PATENTS: PATENTS, AUTOS: AUTOS, EVENTS: EVENTS, TASKS: TASKS,
    UNLOCKS: UNLOCKS, GROUND: GROUND, RETRO: RETRO, CHOICE: CHOICE, QUESTIONS: QUESTIONS
  };
});
