// Башня: deterministic turn-based simulation shared by WebView, Rhino and Node.
(function (root, make) {
  var node = typeof require === 'function' && typeof exports !== 'undefined';
  var api = node ? make(require('../engine/big.js'), require('../engine/rng.js'), {
    catalog: require('./content/catalog.json'), events: require('./content/events.json')
  }) : make(root.Big, root.Rng, null);
  if (typeof exports !== 'undefined') { for (var k in api) exports[k] = api[k]; } else { root.GameSim = api; }
})(this, function (Big, Rng, content) {
  'use strict';

  var C = content || { catalog: {}, events: [] };
  var MOVE_IDS = ['strike', 'block', 'lunge', 'reflect', 'sweep', 'dash', 'read', 'flame', 'breathe', 'execute'];
  var DOOR_IDS = ['combat', 'event', 'chest', 'elite', 'shop', 'rest'];
  var WORKSHOP_IDS = ['health', 'strength', 'defense', 'agility', 'will', 'gold', 'doors', 'memory'];
  var RULE_IDS = ['ironDoors', 'costly', 'embers', 'generous', 'frail', 'quiet'];
  var EFFECT_IDS = ['gold', 'damage', 'heal', 'relic', 'upgrade', 'swap', 'skip', 'ally', 'strength', 'defense', 'agility', 'will', 'curse', 'removeRelic'];
  var ENEMY_IDS = ['piper', 'mold', 'lantern', 'dog', 'weaver', 'double', 'pupil', 'thief', 'knight', 'maiden', 'clockmaker', 'echo'];
  var PHASES = ['home', 'doors', 'combat', 'reward', 'event', 'shop', 'rest', 'fork', 'ended'];

  function setContent(catalog, events) { C = { catalog: catalog, events: events }; }
  function use(data) { C = data; }
  function copy(x) { return JSON.parse(JSON.stringify(x)); }
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function cfgNumber(cfg, key) { return Number(cfg[key]); }
  function item(kind, id) {
    var list = C.catalog[kind] || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return { id: id, title: id, text: '' };
  }
  function title(kind, id) { return item(kind, id).title; }
  function has(state, id) { return state.run.relics.indexOf(id) >= 0; }
  function meta(state) { return state.meta.tower; }
  function log(state, text, cfg) {
    state.run.log.push(text);
    if (state.run.log.length > cfg['log.max']) state.run.log.shift();
  }
  function flightOf(floor, cfg) { return Math.floor((floor - 1) / cfg['floor.flightSize']); }
  function flightFloor(floor, cfg) { return (floor - 1) % cfg['floor.flightSize'] + 1; }
  function flightTitle(floor, cfg) {
    var index = flightOf(floor, cfg);
    var flights = C.catalog.flights || [];
    return index < flights.length ? flights[index].title : 'Над облаками';
  }
  function heightRule(state, cfg, name) { return state.run.height >= cfg['height.' + name + 'At']; }
  function power(floor, cfg) { return 1 + cfg['floor.linear'] * floor + cfg['floor.quadratic'] * floor * floor; }
  function workshopLevel(state, id) { return meta(state).workshop[id] || 0; }
  // A capped upgrade stops at `max`. An endless one (max 0) has no last level: up to `mastery` the
  // price grows as before, past it every level costs `lateGrowth` times the previous one.
  function workshopMax(id, cfg) { return cfg['workshop.' + id + '.max'] || 0; }
  function workshopCost(state, id, cfg) {
    var level = workshopLevel(state, id);
    var mastery = workshopMax(id, cfg) > 0 ? level : Math.min(level, cfg['workshop.' + id + '.mastery'] || 0);
    var price = Big.mul(cfg['workshop.' + id + '.base'], Big.pow(cfg['workshop.growth'], mastery));
    if (level > mastery) price = Big.mul(price, Big.pow(cfg['workshop.lateGrowth'], level - mastery));
    return Big.ceil(price);
  }
  function remember(state, kind, id) {
    if (!meta(state).album[kind]) meta(state).album[kind] = [];
    if (meta(state).album[kind].indexOf(id) < 0) meta(state).album[kind].push(id);
  }
  function achievement(state, id) { meta(state).achievements[id] = true; }
  function unlock(state, id, cfg) {
    if (meta(state).classes.indexOf(id) >= 0) return;
    meta(state).classes.push(id);
    log(state, 'Открыт класс: ' + title('classes', id), cfg);
  }
  function baseRun(seed) {
    return {
      phase: 'home', floor: 1, height: 1, classId: 'guardian', seed: seed, rng: seed,
      hero: null, gold: '0e0', earnedGold: '0e0', moves: {}, relics: [], hand: [],
      enemy: null, doors: [], rewards: [], offers: [], event: null, log: [],
      level: 1, xp: 0, pendingLevels: 0, bosses: 0, elites: 0, completedFloor: 0,
      turns: 0, battles: 0, kills: 0, flameKills: 0, flightBlocks: 0,
      flightEvents: 0, flightRests: 0, vaneUsed: false, heartUsed: false,
      chain: 0, ally: 0, curse: 0, skip: 0, freshLegs: false, tripChest: false,
      doorTypes: [], ended: false, paid: false, payout: '0e0', daily: null,
      lastMove: 'strike', lastOutcome: '', afterReward: 'doors', damageTaken: 0, unlockedHeight: 0
    };
  }
  function init(ctx) {
    var seed = ctx.rng ? ctx.rng.int(1, 2147483647) : Rng.hash('tower:' + ctx.now);
    var upgrades = {};
    WORKSHOP_IDS.forEach(function (id) { upgrades[id] = 0; });
    return {
      run: baseRun(seed),
      layers: { height: { currency: '0e0', count: 0, best: '0e0', state: {} } },
      meta: { tower: {
        shards: '0e0', workshop: upgrades, classes: ['guardian'], heights: 1,
        bestFloor: 0, bestByClass: {}, album: { relics: [], events: [], enemies: [], eventData: {} }, achievements: {},
        stats: { runs: 0, kills: 0, flameKills: 0, battles: 0, turns: 0, bosses: 0, elites: 0, shards: '0e0' },
        stock: { events: [], enemies: [], daily: [] }, pendingChests: 0, dailyBest: {}, dailySchedule: {}
      } }
    };
  }

  function recalc(state, cfg) {
    var run = state.run;
    var h = run.hero;
    var oldMax = h.maxHp;
    h.maxHp = h.baseHp + (has(state, 'buckle') ? cfg['relic.buckle.hp'] : 0);
    if (has(state, 'crown')) h.maxHp *= cfg['relic.crown.health'];
    h.maxHp = Math.max(1, Math.round(h.maxHp));
    h.strength = h.baseStrength + (has(state, 'whetstone') ? cfg['relic.whetstone.strength'] : 0);
    if (has(state, 'smallChange')) h.strength += Math.floor(Big.toNumber(Big.div(run.earnedGold, cfg['relic.smallChange.gold']))) * cfg['relic.smallChange.strength'];
    h.defense = h.baseDefense + (has(state, 'buckle') ? cfg['relic.buckle.defense'] : 0);
    h.agility = clamp(h.baseAgility, 0, cfg['combat.agilityCap']);
    h.dodge = clamp(h.agility + (has(state, 'horseshoe') ? cfg['relic.horseshoe.dodge'] : 0), 0, cfg['combat.agilityCap']);
    h.maxWill = Math.max(0, h.baseWill);
    h.hp = Math.min(h.maxHp, h.hp + Math.max(0, h.maxHp - oldMax));
    h.will = Math.min(h.maxWill, h.will);
  }
  function gainGold(state, amount, cfg) {
    var multiplier = (has(state, 'purse') ? 1 + cfg['relic.purse.gold'] : 1);
    if (heightRule(state, cfg, 'gold')) multiplier *= cfg['height.goldMult'];
    if (state.run.daily && state.run.daily.rule === 'generous') multiplier *= cfg['daily.generous.gold'];
    var got = Big.floor(Big.mul(amount, multiplier));
    state.run.gold = Big.add(state.run.gold, got);
    state.run.earnedGold = Big.add(state.run.earnedGold, got);
    recalc(state, cfg);
    return got;
  }
  function randomRelic(state, rng, cfg) {
    var available = (C.catalog.relics || []).filter(function (r) { return !has(state, r.id); });
    if (!available.length) return null;
    return rng.weighted(available, function (r) {
      var rarity = r.rarity;
      return cfg['relic.weight.' + (rarity === 'rare' || rarity === 'Р' ? 'rare' : rarity === 'legendary' || rarity === 'Л' ? 'legendary' : 'common')];
    }).id;
  }
  function addRelic(state, id, cfg) {
    if (!id || has(state, id)) { gainGold(state, cfg['reward.fallbackGold'], cfg); return; }
    state.run.relics.push(id);
    remember(state, 'relics', id);
    if (id === 'mirror' && state.run.moves.reflect === undefined) state.run.moves.reflect = 0;
    if (id === 'snake' && state.run.moves.flame === undefined) state.run.moves.flame = 0;
    recalc(state, cfg);
    log(state, 'Реликвия: ' + title('relics', id), cfg);
  }
  function addMove(state, id, cfg) {
    if (state.run.moves[id] === undefined) state.run.moves[id] = 0;
    else if (state.run.moves[id] < cfg['combat.upgradeMax']) state.run.moves[id]++;
    else gainGold(state, cfg['reward.fallbackGold'], cfg);
    log(state, 'Дар: ' + title('moves', id) + (state.run.moves[id] ? ' +' + state.run.moves[id] : ''), cfg);
  }
  function heal(state, amount) {
    var before = state.run.hero.hp;
    state.run.hero.hp = Math.min(state.run.hero.maxHp, before + amount);
    return state.run.hero.hp - before;
  }
  function deathKeep(state, cfg) { return Math.min(1, cfg['shards.deathKeep'] + workshopLevel(state, 'memory') * cfg['workshop.memory.effect']); }
  function shardReward(state, cfg, died) {
    var run = state.run;
    var raw = Big.add(Big.mul(run.floor, cfg['shards.floor']), run.bosses * cfg['shards.boss'] + run.elites * cfg['shards.elite']);
    raw = Big.mul(raw, 1 + (run.height - 1) * cfg['shards.heightBonus']);
    return Big.floor(Big.mul(raw, died ? deathKeep(state, cfg) : 1));
  }
  function passengerActive(ctx) {
    var links = ctx.links || {};
    var p = links.passenger || {};
    return p.on !== false && (p.state === 'trip' || p.state === 'riding' || p.state === 'ride' || p.active === true || ctx.passenger === true);
  }
  function settle(state, died, ctx) {
    var run = state.run;
    if (run.paid) return;
    var cfg = ctx.config;
    run.payout = shardReward(state, cfg, died);
    if (passengerActive(ctx)) run.payout = Big.mul(run.payout, cfg['shards.passengerMult']);
    meta(state).shards = Big.add(meta(state).shards, run.payout);
    meta(state).stats.shards = Big.add(meta(state).stats.shards, run.payout);
    run.paid = true;
    run.ended = true;
    run.phase = 'ended';
    run.result = died ? 'death' : 'descent';
    log(state, (died ? 'Подъём окончен. ' : 'Вы вернулись в мастерскую. ') + 'Осколки: ' + Big.toNumber(run.payout), cfg);
    if (run.daily) {
      var old = meta(state).dailyBest[run.daily.day] || 0;
      meta(state).dailyBest[run.daily.day] = Math.max(old, run.floor);
    }
  }
  function death(state, ctx) {
    var h = state.run.hero;
    if (h.hp > 0) return false;
    if (has(state, 'heart') && !state.run.heartUsed) {
      state.run.heartUsed = true;
      h.hp = Math.max(1, Math.round(h.maxHp * ctx.config['relic.heart.heal']));
      log(state, 'Сердце башни вернуло вас к жизни.', ctx.config);
      return false;
    }
    h.hp = 0;
    settle(state, true, ctx);
    return true;
  }
  function trackFloor(state, cfg) {
    var run = state.run;
    meta(state).bestFloor = Math.max(meta(state).bestFloor, run.floor);
    meta(state).bestByClass[run.classId] = Math.max(meta(state).bestByClass[run.classId] || 0, run.floor);
    if (run.floor > cfg['floor.flightSize'] * cfg['floor.flights']) achievement(state, 'clouds');
    if (run.height >= cfg['height.max']) achievement(state, 'height-12');
  }
  function doorsAt(state, floor, cfg) {
    var run = state.run;
    var local = flightFloor(floor, cfg);
    if (local === cfg['floor.flightSize']) return [{ type: 'boss', id: 'boss' }];
    if (local === cfg['doors.serviceFloor']) return [{ type: 'shop', id: 'shop' }, { type: 'rest', id: 'rest' }];
    if (local === cfg['doors.restFloor']) return [{ type: 'rest', id: 'rest' }];
    var rng = Rng.make(Rng.hash(run.seed + ':doors:' + floor));
    var count = rng.int(cfg['doors.min'], cfg['doors.max']);
    if (has(state, 'lamp')) count = Math.max(count, cfg['doors.max']);
    if (local === 1) count += workshopLevel(state, 'doors') * cfg['workshop.doors.effect'];
    var types = DOOR_IDS.filter(function (id) { return id !== 'elite' || local >= cfg['doors.eliteFrom']; });
    var choices = [];
    for (var i = 0; i < count && types.length; i++) {
      var chosen = rng.weighted(types, function (id) { return cfg['doorWeight.' + id]; });
      choices.push({ type: chosen, id: chosen });
      types.splice(types.indexOf(chosen), 1);
    }
    return choices;
  }
  function enterFloor(state, ctx, rng) {
    var run = state.run;
    var cfg = ctx.config;
    run.phase = 'doors';
    run.enemy = null;
    run.offers = [];
    run.rewards = [];
    run.event = null;
    trackFloor(state, cfg);
    run.doors = doorsAt(state, run.floor, cfg);
    if (has(state, 'purse')) run.gold = Big.max(0, Big.sub(run.gold, cfg['relic.purse.loss']));
    if (run.curse) {
      run.hero.hp -= run.curse * cfg['event.curse.damage'];
      if (death(state, ctx)) return;
    }
    if (flightFloor(run.floor, cfg) === 1) {
      run.flightBlocks = 0;
      run.flightEvents = 0;
      run.flightRests = 0;
      run.vaneUsed = false;
      run.chain = 0;
      if (meta(state).pendingChests > 0) {
        meta(state).pendingChests--;
        run.tripChest = true;
        chestRoom(state, ctx, rng, 'doors');
        return;
      }
    }
  }
  function nextFloor(state, ctx, rng) {
    var run = state.run;
    run.completedFloor = Math.max(run.completedFloor, run.floor);
    var steps = 1 + run.skip;
    run.skip = 0;
    var bossFloor = Math.ceil(run.floor / ctx.config['floor.flightSize']) * ctx.config['floor.flightSize'];
    run.floor = Math.min(run.floor + steps, run.floor < bossFloor ? bossFloor : ctx.config['floor.max']);
    enterFloor(state, ctx, rng);
  }
  function start(state, action, ctx) {
    if (state.run.phase !== 'home' && state.run.phase !== 'ended') return { ok: false, message: 'Сначала завершите подъём.' };
    var cfg = ctx.config;
    var classId = action.classId || 'guardian';
    if (meta(state).classes.indexOf(classId) < 0) return { ok: false, message: 'Этот класс пока закрыт.' };
    var height = action.height === undefined ? 1 : Number(action.height);
    if (height === 0) height = 1;
    if (height < 1 || height > meta(state).heights || height % 1) return { ok: false, message: 'Эта высота пока закрыта.' };
    var seed = action.seed === undefined ? (ctx.rng ? ctx.rng.int(1, 2147483647) : Rng.hash(String(ctx.now) + ':' + meta(state).stats.runs)) : action.seed;
    var daily = null;
    if (action.daily) {
      var day = String(Math.floor(ctx.now / 86400000));
      if (!meta(state).dailySchedule) meta(state).dailySchedule = {};
      var scheduled = meta(state).dailySchedule[day];
      var stored = meta(state).stock.daily.filter(function (x) { return String(x.day) === day; })[0];
      var dailyRng = Rng.make(Rng.hash('tower-day:' + day));
      var dayRule = scheduled ? scheduled.rule : stored ? stored.rule : dailyRng.pick(RULE_IDS);
      var ruleData = item('dailyRules', dayRule);
      daily = { day: day, rule: dayRule, title: scheduled ? scheduled.title : stored ? stored.title : ruleData.title, text: scheduled ? scheduled.text : stored ? stored.text : ruleData.text };
      seed = scheduled ? scheduled.seed : stored && stored.seed !== undefined ? Rng.hash(String(stored.seed)) : Rng.hash('tower:' + day);
      if (!scheduled) {
        meta(state).dailySchedule[day] = { seed: seed, rule: daily.rule, title: daily.title, text: daily.text };
        var scheduleDays = Object.keys(meta(state).dailySchedule).sort();
        if (scheduleDays.length > cfg['stock.maxStored']) delete meta(state).dailySchedule[scheduleDays[0]];
      }
    }
    state.run = baseRun(seed);
    var run = state.run;
    run.height = height;
    run.classId = classId;
    run.daily = daily;
    var hp = cfg['hero.hp'] + workshopLevel(state, 'health') * cfg['workshop.health.effect'];
    if (classId === 'archer') hp *= cfg['class.archer.hp'];
    if (heightRule(state, cfg, 'curse')) hp *= cfg['height.curseHp'];
    if (daily && daily.rule === 'frail') hp *= cfg['daily.frail.hp'];
    var will = cfg['hero.will'] + workshopLevel(state, 'will') * cfg['workshop.will.effect'];
    if (classId === 'scholar') will += cfg['class.scholar.will'];
    if (heightRule(state, cfg, 'will')) will -= cfg['height.willLoss'];
    run.hero = {
      hp: Math.round(hp), maxHp: Math.round(hp), baseHp: Math.round(hp),
      baseStrength: cfg['hero.strength'] + workshopLevel(state, 'strength') * cfg['workshop.strength.effect'],
      baseDefense: cfg['hero.defense'] + workshopLevel(state, 'defense') * cfg['workshop.defense.effect'],
      baseAgility: cfg['hero.agility'] + workshopLevel(state, 'agility') * cfg['workshop.agility.effect'],
      baseWill: Math.max(0, will), maxWill: Math.max(0, will), will: Math.max(0, will), strength: 0, defense: 0, agility: 0
    };
    run.moves = { strike: 0, block: 0 };
    if (classId === 'guardian') { run.moves.block = cfg['class.guardian.block']; run.moves.reflect = 0; }
    if (classId === 'archer') { run.moves.dash = 0; run.relics.push('bow'); remember(state, 'relics', 'bow'); }
    if (classId === 'scholar') { run.moves.read = 0; run.moves.flame = 0; }
    if (classId === 'firestarter') run.moves.flame = 0;
    if (classId === 'nameless') run.moves = { strike: 0, block: 0 };
    recalc(state, cfg);
    gainGold(state, cfg['hero.gold'] + workshopLevel(state, 'gold') * cfg['workshop.gold.effect'], cfg);
    meta(state).stats.runs++;
    var rng = Rng.make(seed);
    enterFloor(state, ctx, rng);
    run.rng = rng.state();
    log(state, 'Подъём начинается: ' + title('classes', classId) + ', высота ' + height + '.', cfg);
    return { ok: true, sound: 'select' };
  }


  function moveCost(id, cfg) {
    if (id === 'strike' || id === 'block' || id === 'reflect') return 0;
    if (id === 'read') return cfg['move.readCost'];
    return cfg['move.specialCost'];
  }
  function moveScale(state, id, cfg) { return 1 + (state.run.moves[id] || 0) * cfg['combat.upgradePower']; }
  function makeIntent(state, turn, cfg) {
    var run = state.run;
    var e = run.enemy;
    var kind = e.template;
    var attack = e.attack;
    var intent = { type: 'attack', amount: attack, hits: 1, hidden: false, charged: false };
    if (kind === 'piper' && turn % 3 === 0) { intent.type = 'defend'; intent.amount = e.defense; }
    if (kind === 'mold') intent.amount += (turn - 1) * cfg['enemy.mold.growth'] * (e.attackPower || e.power);
    if (kind === 'lantern') {
      intent.type = turn % 2 === 1 ? 'charge' : 'attack';
      intent.amount = turn % 2 === 1 ? 0 : attack * cfg['enemy.lantern.chargeMult'];
      intent.charged = turn % 2 === 0;
    }
    if (kind === 'dog') intent.hits = cfg['enemy.dog.hits'];
    if (kind === 'weaver') {
      if (turn % 3 === 1) { intent.type = 'curse'; intent.amount = 0; }
      if (turn % 3 === 2) intent.hidden = true;
    }
    if (kind === 'double' || kind === 'echo') {
      var previous = run.lastMove;
      var share = kind === 'echo' ? cfg['enemy.echo.copy'] : cfg['enemy.double.copy'];
      if (previous === 'block' || previous === 'reflect') { intent.type = 'defend'; intent.amount = run.hero.defense * share; }
      else if (previous === 'breathe') { intent.type = 'heal'; intent.amount = e.maxHp * cfg['move.breathe'] * share; }
      else if (previous === 'read') { intent.type = 'charge'; intent.amount = 0; }
      else if (previous === 'flame') { intent.type = 'flame'; intent.amount = cfg['move.flame'] * share; }
      else intent.amount = run.hero.strength * share * (previous === 'lunge' ? cfg['move.lunge'] : previous === 'sweep' ? cfg['move.sweep'] : 1);
    }
    if (kind === 'pupil' && turn % 2 === 0) { intent.type = 'defend'; intent.amount = e.defense; }
    if (kind === 'thief') {
      intent.steal = cfg['enemy.thief.gold'];
      if (turn >= cfg['enemy.thief.fleeTurn']) { intent.type = 'flee'; intent.amount = 0; }
    }
    if (kind === 'clockmaker' && turn % cfg['enemy.clockmaker.midnightTurn'] === 0) intent.amount = cfg['enemy.clockmaker.midnight'] * (e.attackPower || e.power);
    if (kind === 'mistress') {
      var form = Math.floor((turn - 1) / cfg['boss.mistress.period']) % 2;
      if (form) { intent.type = 'heal'; intent.amount = e.maxHp * cfg['boss.mistress.heal']; }
    }
    if (e.weaken > 0 && (intent.type === 'attack' || intent.type === 'flame')) intent.amount *= 1 - e.weaken;
    if (e.phaseTwo && intent.type === 'attack') intent.amount *= cfg['height.phaseAttack'];
    intent.amount = Math.max(0, Math.round(intent.amount));
    return intent;
  }
  function intentView(intent) {
    var out = copy(intent);
    if (out.hidden) { out.title = 'Неизвестное намерение'; out.displayAmount = '?'; return out; }
    var names = { attack: 'Удар', defend: 'Защита', charge: 'Зарядка', curse: 'Заклятие', heal: 'Лечение', flame: 'Пламя', flee: 'Побег', skip: 'Пропуск' };
    out.title = names[out.type] || out.type;
    if (out.amount) out.title += ' ' + out.amount + (out.hits > 1 ? ' × ' + out.hits : '');
    out.displayAmount = out.amount;
    return out;
  }
  function drawHand(state, rng, cfg) {
    var run = state.run;
    var e = run.enemy;
    var count = has(state, 'deck') ? cfg['relic.deck.hand'] : cfg['combat.hand'];
    var pool = Object.keys(run.moves);
    if (run.classId === 'nameless') pool = (run.combatMoves || MOVE_IDS).slice();
    if (has(state, 'vow')) pool = pool.filter(function (id) { return id !== 'block' && id !== 'reflect'; });
    var hand = [];
    // Two basic choices keep a hand playable when all will charges have been spent.
    if (pool.indexOf('strike') >= 0) hand.push('strike');
    if (pool.indexOf('block') >= 0 && count > hand.length) hand.push('block');
    rng.shuffle(pool);
    for (var i = 0; i < pool.length && hand.length < count; i++) if (hand.indexOf(pool[i]) < 0) hand.push(pool[i]);
    run.hand = hand;
    e.locked = [];
    if (e.template === 'keykeeper') {
      var lockCount = e.hp <= e.maxHp * cfg['boss.keykeeper.threshold'] ? cfg['boss.keykeeper.locksLow'] : cfg['boss.keykeeper.locks'];
      var candidates = hand.slice();
      rng.shuffle(candidates);
      // A lock must not make a hand with no will impossible to play.
      for (var j = 0; j < candidates.length && e.locked.length < lockCount; j++) {
        var left = hand.filter(function (id) { return id !== candidates[j] && e.locked.indexOf(id) < 0 && moveCost(id, cfg) <= run.hero.will; });
        if (left.length) e.locked.push(candidates[j]);
      }
    }
    e.intent = makeIntent(state, e.turn, cfg);
    if (has(state, 'hourglass') && e.turn === 1) e.intent = { type: 'skip', amount: 0, hits: 1, hidden: false };
    e.weaken = 0;
  }
  function beginCombat(state, elite, boss, ctx, rng) {
    var run = state.run;
    var cfg = ctx.config;
    var tier = Math.min(cfg['floor.flights'] - 1, flightOf(run.floor, cfg));
    var enemyData;
    if (boss) enemyData = (C.catalog.bosses || [])[tier];
    else {
      var pool = (C.catalog.enemies || []).filter(function (e) { return Number(e.flight) === tier + 1 || e.flight === ['cellar', 'gallery', 'spire'][tier]; });
      if (!pool.length) pool = (C.catalog.enemies || []).slice(tier * 4, tier * 4 + 4);
      var external = meta(state).stock.enemies.filter(function (e) { return Number(e.flight) === tier + 1; });
      if (external.length) pool = pool.concat(external);
      enemyData = rng.pick(pool);
    }
    var template = enemyData.template || enemyData.id;
    var scaled = power(run.floor, cfg);
    var hp = cfg['enemy.' + template + '.hp'] * scaled * cfg['combat.enemyHpScale'];
    var attackScale = cfg['combat.enemyAttackScale'] * cfg['combat.attackScale.' + ['cellar', 'gallery', 'spire'][tier]];
    var attack = cfg['enemy.' + template + '.attack'] * scaled * attackScale;
    if (tier === 0) attack *= cfg[boss ? 'combat.cellarBossAttack' : 'combat.cellarNormalAttack'];
    var defense = cfg['enemy.' + template + '.defense'] * scaled;
    var realElite = elite && !has(state, 'emptyLantern');
    if (realElite) hp *= cfg['combat.eliteHp'];
    if (heightRule(state, cfg, 'hp')) hp *= cfg['height.hpMult'];
    if (heightRule(state, cfg, 'attack')) attack *= cfg['height.attackMult'];
    if (realElite && heightRule(state, cfg, 'elite')) hp *= cfg['height.eliteHp'];
    if (heightRule(state, cfg, 'pinnacle')) {
      hp *= cfg['height.pinnacleHp'];
      attack *= cfg['height.pinnacleAttack'] * (boss ? cfg['height.bossAttack'] : 1);
    }
    run.enemy = {
      id: enemyData.id, title: enemyData.title, text: enemyData.text || '', template: template,
      hp: Math.round(hp), maxHp: Math.round(hp), attack: Math.round(attack), defense: Math.round(defense), power: scaled, attackPower: scaled * attackScale,
      elite: elite, boss: boss, modifier: realElite ? rng.pick(['thorns', 'heal', 'double']) : null,
      turn: 1, attacks: 0, burn: 0, heroBurn: 0, weaken: 0, read: has(state, 'eye'), locked: [],
      plates: template === 'gatekeeper' ? cfg['boss.plates'] : 0,
      shield: heightRule(state, cfg, 'shield') ? cfg['height.shield'] : 0,
      phaseTwo: false, damageTaken: 0, doubleUsed: false, stolenGold: '0e0', intent: null
    };
    remember(state, 'enemies', template);
    if (run.daily && run.daily.rule === 'ironDoors') run.enemy.shield += cfg['daily.ironDoors.shield'];
    run.phase = 'combat';
    if (run.classId === 'nameless') {
      var randomMoves = rng.shuffle(MOVE_IDS.filter(function (id) { return id !== 'strike' && id !== 'block'; }));
      var handSize = has(state, 'deck') ? cfg['relic.deck.hand'] : cfg['combat.hand'];
      run.combatMoves = ['strike', 'block'].concat(randomMoves.slice(0, handSize - 2));
    }
    run.hero.will = run.hero.maxWill;
    run.damageTaken = 0;
    run.battles++;
    meta(state).stats.battles++;
    if (has(state, 'bell')) run.enemy.hp -= cfg['relic.bell.damage'];
    if (run.chain > 0) { run.enemy.hp -= run.chain; log(state, 'Цепь переносит ' + Math.round(run.chain) + ' урона.', cfg); run.chain = 0; }
    if (boss && run.ally > 0) {
      run.enemy.hp -= run.enemy.maxHp * cfg['boss.ally.damage'] * run.ally;
      run.ally = 0;
      log(state, 'Раненый страж сдержал босса.', cfg);
    }
    drawHand(state, rng, cfg);
    if (run.enemy.hp <= 0) winCombat(state, false, false, ctx, rng);
  }
  function upgradeChoices(state, rng, cfg, count) {
    var run = state.run;
    var out = [];
    var used = {};
    for (var i = 0; i < count; i++) {
      var options = MOVE_IDS.filter(function (id) { return !used['move:' + id] && (run.moves[id] === undefined || run.moves[id] < cfg['combat.upgradeMax']); });
      var relic = randomRelic(state, rng, cfg);
      if (relic && !used['relic:' + relic] && (!options.length || rng.chance(cfg['reward.relicChance']))) {
        out.push({ type: 'relic', id: relic }); used['relic:' + relic] = true;
      } else if (options.length) {
        var id = rng.pick(options);
        out.push({ type: 'move', id: id }); used['move:' + id] = true;
      } else out.push({ type: 'gold', id: 'gold', amount: cfg['reward.fallbackGold'] });
    }
    return out;
  }
  function beginLevel(state, ctx, rng) {
    var run = state.run;
    var cfg = ctx.config;
    run.level++;
    run.hero.baseHp += cfg['level.health'];
    run.hero.baseStrength += cfg['level.strength'];
    run.hero.baseDefense += cfg['level.defense'];
    recalc(state, cfg);
    heal(state, cfg['level.heal']);
    run.rewards = upgradeChoices(state, rng, cfg, cfg['reward.choices'] + (has(state, 'crown') ? cfg['relic.crown.extra'] : 0));
    run.phase = 'reward';
    run.rewardTitle = 'Уровень ' + run.level + ': выберите дар';
    run.rewardKind = 'level';
  }
  function xpNext(state, cfg) { return cfg['level.xpBase'] + (state.run.level - 1) * cfg['level.xpGrowth']; }
  function postCombat(state, ctx, rng) {
    var run = state.run;
    if (run.xp >= xpNext(state, ctx.config)) {
      run.xp -= xpNext(state, ctx.config);
      beginLevel(state, ctx, rng);
    } else if (run.afterReward === 'fork') run.phase = 'fork';
    else nextFloor(state, ctx, rng);
  }
  function winCombat(state, flameKill, fled, ctx, rng) {
    var run = state.run;
    var cfg = ctx.config;
    var e = run.enemy;
    if (!fled) {
      run.kills++;
      meta(state).stats.kills++;
      if (flameKill) {
        run.flameKills++;
        meta(state).stats.flameKills++;
        if (meta(state).stats.flameKills >= cfg['class.firestarter.kills']) unlock(state, 'firestarter', cfg);
      }
      if (has(state, 'chain')) run.chain = Math.max(0, -e.hp) * cfg['relic.chain.carry'];
      var multiplier = e.boss ? cfg['combat.bossGold'] : e.elite ? cfg['combat.eliteGold'] : 1;
      var amount = gainGold(state, (cfg['combat.gold'] + rng.int(0, cfg['combat.goldSpread'])) * multiplier, cfg);
      if (Big.gt(e.stolenGold, 0)) run.gold = Big.add(run.gold, e.stolenGold);
      if (has(state, 'feather') && run.damageTaken === 0) gainGold(state, cfg['relic.feather.gold'], cfg);
      run.xp += cfg['combat.xp'] * (e.boss ? cfg['combat.bossXp'] : e.elite ? cfg['combat.eliteXp'] : 1);
      log(state, 'Победа: ' + e.title + '. Золото +' + Big.toNumber(amount) + '.', cfg);
      if (e.elite) {
        run.elites++;
        meta(state).stats.elites++;
        addRelic(state, randomRelic(state, rng, cfg), cfg);
      }
      if (e.boss) {
        run.bosses++;
        meta(state).stats.bosses++;
        if (run.flightBlocks === 0) achievement(state, 'no-block');
        var flight = flightOf(run.floor, cfg);
        if (flight === 0) { unlock(state, 'archer', cfg); achievement(state, 'cellar'); }
        if (flight === 1) { unlock(state, 'scholar', cfg); achievement(state, 'gallery'); }
        if (flight === 2) {
          unlock(state, 'nameless', cfg); achievement(state, 'spire');
          var nextHeight = Math.min(cfg['height.max'], run.height + 1);
          if (nextHeight > meta(state).heights) { meta(state).heights = nextHeight; run.unlockedHeight = nextHeight; }
          if (nextHeight >= cfg['height.max']) achievement(state, 'height-12');
        }
      }
    } else log(state, e.title + ' убежал с добычей.', cfg);
    run.afterReward = e.boss ? 'fork' : 'doors';
    run.completedFloor = Math.max(run.completedFloor, run.floor);
    if (death(state, ctx)) return;
    postCombat(state, ctx, rng);
  }
  function hitEnemy(state, amount, rng, cfg, critical, evadable) {
    var e = state.run.enemy;
    var h = state.run.hero;
    if (evadable) e.attacks++;
    if (evadable && e.template === 'maiden' && e.attacks % cfg['enemy.maiden.period'] === 0) return 0;
    if (critical && rng.chance(h.agility)) amount *= cfg['combat.criticalMult'];
    if (e.plates > 0) return 0;
    var guard = e.intent.type === 'defend' ? e.intent.amount : 0;
    var blocked = Math.min(e.shield, Math.max(0, amount - guard));
    e.shield -= blocked;
    var dealt = Math.max(0, amount - guard - blocked);
    e.hp -= dealt;
    e.damageTaken += dealt;
    return dealt;
  }
  function enemyPhase(state, intent, block, rng, cfg) {
    var run = state.run;
    var e = run.enemy;
    var h = run.hero;
    var received = 0;
    if (intent.type === 'attack') {
      var total = intent.amount * intent.hits;
      if (intent.charged && block > 0) total = 0;
      if (rng.chance(clamp(h.agility + (has(state, 'horseshoe') ? cfg['relic.horseshoe.dodge'] : 0), 0, cfg['combat.agilityCap']))) total = 0;
      received = Math.max(0, total - block);
      h.hp -= received;
      if (received > 0 && intent.steal) {
        var taken = Big.min(run.gold, intent.steal);
        run.gold = Big.sub(run.gold, taken);
        e.stolenGold = Big.add(e.stolenGold, taken);
      }
      if (e.plates > 0 && block > 0) {
        e.plates--;
        log(state, 'Пластина щита снята. Осталось: ' + e.plates + '.', cfg);
      }
    } else if (intent.type === 'heal') e.hp = Math.min(e.maxHp, e.hp + intent.amount);
    else if (intent.type === 'flame') e.heroBurn += intent.amount;
    if (e.heroBurn > 0) { h.hp -= e.heroBurn; received += e.heroBurn; }
    run.damageTaken += received;
    return received;
  }
  function play(state, id, ctx, rng) {
    var run = state.run;
    var cfg = ctx.config;
    var e = run.enemy;
    var h = run.hero;
    if (run.phase !== 'combat' || run.hand.indexOf(id) < 0) return { ok: false, message: 'Приёма нет в руке.' };
    if (e.locked.indexOf(id) >= 0) return { ok: false, message: 'Ключник запер этот приём.' };
    var cost = moveCost(id, cfg);
    if (h.will < cost) return { ok: false, message: 'Не хватает воли.' };
    if (has(state, 'vow') && (id === 'block' || id === 'reflect')) return { ok: false, message: 'Обет тишины запрещает блок.' };
    h.will -= cost;
    var intent = copy(e.intent);
    var scale = moveScale(state, id, cfg);
    var repeat = has(state, 'shadow') ? cfg['relic.shadow.power'] : 0;
    var block = 0;
    var attack = 0;
    var flameKill = false;
    var isBlock = id === 'block' || id === 'reflect';
    if (isBlock) {
      block = h.defense * scale * (1 + repeat);
      run.flightBlocks++;
      if (e.template === 'knight') {
        intent = { type: 'defend', amount: Math.round(e.defense + e.attack * cfg['enemy.knight.switchMult']), hits: 1 };
        e.intent = intent;
      }
    }
    if (id === 'strike' || id === 'dash' || id === 'lunge' || id === 'sweep') {
      attack = h.strength * scale;
      if (id === 'lunge') attack *= cfg['move.lunge'];
      if (id === 'sweep') { attack *= cfg['move.sweep']; e.weaken = cfg['move.weaken']; }
      if (id === 'dash' && intent.type === 'charge') attack *= cfg['move.dashCharge'];
      if (id === 'strike' && has(state, 'vow')) attack *= cfg['relic.vow.strike'];
      var hits = (id === 'strike' || id === 'dash') && has(state, 'bow') ? cfg['relic.bow.hits'] : 1;
      var hitScale = hits > 1 ? cfg['relic.bow.power'] : 1;
      for (var i = 0; i < hits; i++) {
        hitEnemy(state, attack * hitScale, rng, cfg, true, true);
        if (repeat) hitEnemy(state, attack * hitScale * repeat, rng, cfg, true, true);
      }
      if ((id === 'strike' || id === 'dash') && has(state, 'snake')) e.burn += cfg['move.flame'] * (run.classId === 'firestarter' ? cfg['class.firestarter.flame'] : 1) * (1 + repeat);
    }
    if (id === 'reflect') {
      var incoming = intent.type === 'attack' ? intent.amount * intent.hits : 0;
      if (intent.charged) incoming = 0;
      var reflected = Math.max(0, block - incoming) * (has(state, 'mirror') ? cfg['relic.mirror.mult'] : 1);
      hitEnemy(state, reflected, rng, cfg, false, false);
    }
    if (id === 'read') e.read = true;
    if (id === 'flame') {
      e.burn += cfg['move.flame'] * scale * (run.classId === 'firestarter' ? cfg['class.firestarter.flame'] : 1) * (1 + repeat);
      if (run.daily && run.daily.rule === 'embers') e.burn += cfg['daily.embers.flame'];
    }
    if (id === 'breathe') heal(state, h.maxHp * cfg['move.breathe'] * scale * (1 + repeat));
    if (id === 'execute' && e.hp < e.maxHp * cfg['move.execute'] * scale && e.plates === 0) e.hp = 0;
    // Dash is the sole first-strike action; all other moves resolve with the enemy.
    var firstStrike = id === 'dash' && e.hp <= 0;
    var received = 0;
    if (!firstStrike) {
      received = enemyPhase(state, intent, block, rng, cfg);
      if (e.modifier === 'double' && !e.doubleUsed && e.turn >= cfg['combat.eliteDoubleTurn']) {
        e.doubleUsed = true;
        received += enemyPhase(state, intent, block, rng, cfg);
      }
      if (e.modifier === 'thorns' && attack > 0) { h.hp -= cfg['combat.eliteThorns']; run.damageTaken += cfg['combat.eliteThorns']; }
      if (e.burn > 0 && e.hp > 0) { e.hp -= e.burn; flameKill = e.hp <= 0; }
      if (e.modifier === 'heal' && e.hp > 0) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * cfg['combat.eliteHeal']);
    }
    if (e.boss && !e.phaseTwo && heightRule(state, cfg, 'phase') && e.hp <= e.maxHp * cfg['boss.keykeeper.threshold']) {
      e.phaseTwo = true;
      e.hp = Math.max(1, e.hp) + e.maxHp * cfg['height.phaseHeal'];
      log(state, 'Вторая фаза босса.', cfg);
    }
    run.lastMove = id;
    run.turns++;
    meta(state).stats.turns++;
    log(state, title('moves', id) + (received > 0 ? ': получено ' + Math.round(received) + ' урона.' : ': без потери здоровья.'), cfg);
    if (e.hp <= 0) { winCombat(state, flameKill, false, ctx, rng); return { ok: true, sound: 'win' }; }
    if (death(state, ctx)) return { ok: true, sound: 'lose' };
    if (intent.type === 'flee') { winCombat(state, false, true, ctx, rng); return { ok: true, sound: 'select' }; }
    e.turn++;
    if (has(state, 'warmStone') && (e.turn - 1) % cfg['relic.warmStone.turns'] === 0) h.will = Math.min(h.maxWill, h.will + cfg['relic.warmStone.will']);
    drawHand(state, rng, cfg);
    return { ok: true, sound: isBlock ? 'select' : 'tap' };
  }


  function offerView(state, offer, cfg) {
    var out = copy(offer);
    var source = offer.type === 'relic' ? item('relics', offer.id) : offer.type === 'move' ? item('moves', offer.id) : null;
    out.title = source ? source.title : offer.type === 'heal' ? 'Перевязка' : 'Золото';
    out.text = source ? source.text : offer.type === 'heal' ? 'Восстановить часть здоровья.' : 'Монеты для следующих этажей.';
    if (offer.type === 'move') out.title += state.run.moves[offer.id] === undefined ? ' — новый' : ' +' + (state.run.moves[offer.id] + 1);
    out.price = offer.price === undefined ? 0 : offer.price;
    out.sold = !!offer.sold;
    out.affordable = !out.sold && Big.gte(state.run.gold, out.price);
    out.healthPrice = Math.ceil(Number(out.price) / cfg['relic.bloodCoin.rate']);
    out.canHealth = has(state, 'bloodCoin') && !out.sold && state.run.hero.hp > out.healthPrice;
    return out;
  }
  function chestRoom(state, ctx, rng, returnTo) {
    var run = state.run;
    var cfg = ctx.config;
    gainGold(state, cfg['chest.gold'] + rng.int(0, cfg['chest.goldSpread']), cfg);
    run.rewards = [];
    var count = has(state, 'key') ? cfg['relic.key.choices'] : 1;
    var avoid = {};
    for (var i = 0; i < count; i++) {
      var available = (C.catalog.relics || []).filter(function (r) { return !has(state, r.id) && !avoid[r.id]; });
      var relic = available.length ? rng.weighted(available, function (r) { return cfg['relic.weight.' + r.rarity] || cfg['relic.weight.common']; }).id : null;
      if (relic) { run.rewards.push({ type: 'relic', id: relic }); avoid[relic] = true; }
      else run.rewards.push({ type: 'gold', id: 'gold', amount: cfg['reward.fallbackGold'] });
    }
    run.phase = 'reward';
    run.rewardTitle = run.tripChest ? 'Сундук за поездку' : 'Сундук: выберите находку';
    run.rewardKind = 'chest';
    run.afterReward = returnTo || 'next';
  }
  function shopPrice(state, price, cfg) {
    if (has(state, 'abacus')) price *= 1 - cfg['relic.abacus.discount'];
    if (heightRule(state, cfg, 'shop')) price *= cfg['height.shopMult'];
    if (state.run.daily && state.run.daily.rule === 'costly') price *= cfg['daily.costly.mult'];
    return Math.ceil(price);
  }
  function shopRoom(state, ctx, rng) {
    var run = state.run;
    var cfg = ctx.config;
    run.phase = 'shop';
    run.offers = [];
    for (var i = 0; i < cfg['shop.slots']; i++) {
      var offer;
      var price;
      if (i % 3 === 0) {
        var relic = randomRelic(state, rng, cfg);
        if (relic) {
          var rarity = item('relics', relic).rarity;
          price = cfg['shop.relicCost'] * (rarity === 'legendary' ? cfg['shop.legendaryMult'] : rarity === 'rare' ? cfg['shop.rareMult'] : 1);
          offer = { type: 'relic', id: relic };
        } else { offer = { type: 'heal', id: 'heal' }; price = cfg['shop.healCost']; }
      } else if (i % 3 === 1) {
        var pool = MOVE_IDS.filter(function (id) { return run.moves[id] === undefined || run.moves[id] < cfg['combat.upgradeMax']; });
        offer = pool.length ? { type: 'move', id: rng.pick(pool) } : { type: 'heal', id: 'heal' };
        price = cfg['shop.upgradeCost'];
      } else { offer = { type: 'heal', id: 'heal' }; price = cfg['shop.healCost']; }
      offer.price = shopPrice(state, price, cfg);
      offer.sold = false;
      run.offers.push(offer);
    }
  }
  function restRoom(state, ctx) {
    var run = state.run;
    var cfg = ctx.config;
    var fraction = cfg['rest.heal'] + (has(state, 'rations') ? cfg['relic.rations.heal'] : 0);
    if (heightRule(state, cfg, 'rest')) fraction *= cfg['height.restMult'];
    if (run.daily && run.daily.rule === 'quiet') fraction *= cfg['daily.quiet.rest'];
    var amount = run.hero.maxHp * fraction;
    if (run.freshLegs && run.flightRests === 0) { amount = run.hero.maxHp; run.freshLegs = false; }
    run.flightRests++;
    var gained = heal(state, Math.round(amount));
    run.phase = 'rest';
    run.lastOutcome = 'Восстановлено здоровья: ' + Math.round(gained) + '.';
    log(state, run.lastOutcome, cfg);
  }
  function eventRoom(state, ctx, rng) {
    var run = state.run;
    var pool = C.events.concat(meta(state).stock.events);
    run.event = copy(rng.pick(pool));
    run.event.reveal = has(state, 'knot') && run.flightEvents === 0;
    run.flightEvents++;
    run.phase = 'event';
    remember(state, 'events', run.event.id);
    if (!meta(state).album.eventData) meta(state).album.eventData = {};
    meta(state).album.eventData[run.event.id] = { id: run.event.id, title: run.event.title, text: run.event.text };
  }
  function chooseDoor(state, index, ctx, rng) {
    var run = state.run;
    if (run.phase !== 'doors' || index % 1 || index < 0 || index >= run.doors.length) return { ok: false, message: 'Такой двери нет.' };
    var door = run.doors[index];
    if (DOOR_IDS.indexOf(door.type) >= 0 && run.doorTypes.indexOf(door.type) < 0) run.doorTypes.push(door.type);
    if (run.doorTypes.length === DOOR_IDS.length) achievement(state, 'all-doors');
    if (door.type === 'combat' || door.type === 'elite' || door.type === 'boss') beginCombat(state, door.type === 'elite', door.type === 'boss', ctx, rng);
    else if (door.type === 'chest') chestRoom(state, ctx, rng, 'next');
    else if (door.type === 'shop') shopRoom(state, ctx, rng);
    else if (door.type === 'rest') restRoom(state, ctx);
    else if (door.type === 'event') eventRoom(state, ctx, rng);
    return { ok: true, sound: door.type === 'chest' ? 'reward' : 'select' };
  }
  function chooseReward(state, index, ctx, rng) {
    var run = state.run;
    if (run.phase !== 'reward' || index % 1 || !run.rewards[index]) return { ok: false, message: 'Такого дара нет.' };
    var chosen = run.rewards[index];
    if (chosen.type === 'relic') addRelic(state, chosen.id, ctx.config);
    if (chosen.type === 'move') addMove(state, chosen.id, ctx.config);
    if (chosen.type === 'gold') gainGold(state, chosen.amount, ctx.config);
    run.rewards = [];
    if (run.rewardKind === 'level') postCombat(state, ctx, rng);
    else if (run.afterReward === 'doors') {
      run.tripChest = false;
      run.phase = 'doors';
      run.doors = doorsAt(state, run.floor, ctx.config);
    } else nextFloor(state, ctx, rng);
    return { ok: true, sound: 'reward' };
  }
  function canPayChoice(state, choice, cfg) {
    if (!choice.cost) return true;
    var amount = cfg[choice.cost.key];
    if (!(amount >= 0)) return false;
    return choice.cost.type === 'gold' ? Big.gte(state.run.gold, amount) : state.run.hero.hp > amount;
  }
  function effectAmount(effect, cfg) {
    if (effect.key && cfg[effect.key] !== undefined) return Number(cfg[effect.key]);
    if (effect.type === 'heal') return cfg['event.defaultHeal'];
    if (effect.type === 'damage') return cfg['event.defaultDamage'];
    if (effect.type === 'gold') return cfg['event.defaultGold'];
    return cfg['event.defaultAmount'];
  }
  function describeEffects(effects, cfg) {
    var labels = { gold: 'Золото', damage: 'Потеря здоровья', heal: 'Лечение', relic: 'Найдена реликвия', upgrade: 'Приём усилен', swap: 'Выучен другой приём', skip: 'Пропущен этаж', ally: 'Страж придёт на помощь', strength: 'Сила', defense: 'Защита', agility: 'Ловкость', will: 'Запас воли', curse: 'Бремя башни', removeRelic: 'Одна реликвия оставлена' };
    if (!effects.length) return 'Ничего не изменилось.';
    return effects.map(function (effect) {
      var amount = effectAmount(effect, cfg);
      var numeric = ['gold', 'damage', 'heal', 'strength', 'defense', 'agility', 'will', 'curse'].indexOf(effect.type) >= 0;
      return labels[effect.type] + (numeric ? ': ' + (effect.type === 'agility' ? Math.round(amount * 100) + '%' : amount) : '') + '.';
    }).join(' ');
  }
  function applyEffects(state, effects, ctx, rng) {
    var run = state.run;
    var cfg = ctx.config;
    effects.forEach(function (effect) {
      var amount = effectAmount(effect, cfg);
      var kind = effect.type;
      if (kind === 'gold') gainGold(state, amount, cfg);
      if (kind === 'heal') heal(state, amount);
      if (kind === 'damage') run.hero.hp -= amount;
      if (kind === 'relic') addRelic(state, randomRelic(state, rng, cfg), cfg);
      if (kind === 'upgrade') {
        var upgrades = Object.keys(run.moves).filter(function (id) { return run.moves[id] < cfg['combat.upgradeMax']; });
        if (upgrades.length) addMove(state, rng.pick(upgrades), cfg);
        else gainGold(state, cfg['reward.fallbackGold'], cfg);
      }
      if (kind === 'swap') {
        var oldMoves = Object.keys(run.moves).filter(function (id) { return id !== 'strike' && id !== 'block'; });
        var newMoves = MOVE_IDS.filter(function (id) { return run.moves[id] === undefined; });
        if (newMoves.length) {
          var old = oldMoves.length ? rng.pick(oldMoves) : null;
          var level = old ? run.moves[old] : 0;
          if (old) delete run.moves[old];
          run.moves[rng.pick(newMoves)] = level;
        }
      }
      if (kind === 'skip') run.skip += amount;
      if (kind === 'ally') run.ally += amount;
      if (kind === 'curse') run.curse += amount;
      if (kind === 'strength') run.hero.baseStrength += amount;
      if (kind === 'defense') run.hero.baseDefense += amount;
      if (kind === 'agility') run.hero.baseAgility += amount;
      if (kind === 'will') run.hero.baseWill += amount;
      if (kind === 'removeRelic' && run.relics.length) {
        var removed = rng.pick(run.relics);
        run.relics.splice(run.relics.indexOf(removed), 1);
      }
      recalc(state, cfg);
    });
  }
  function chooseEvent(state, index, ctx, rng) {
    var run = state.run;
    if (run.phase !== 'event' || index % 1 || !run.event.choices[index]) return { ok: false, message: 'Такого выбора нет.' };
    var choice = run.event.choices[index];
    if (!canPayChoice(state, choice, ctx.config)) return { ok: false, message: 'Не хватает ресурсов.' };
    if (choice.cost) {
      if (choice.cost.type === 'gold') run.gold = Big.sub(run.gold, ctx.config[choice.cost.key]);
      else run.hero.hp -= ctx.config[choice.cost.key];
    }
    var success = !choice.chanceKey || rng.chance(ctx.config[choice.chanceKey]);
    applyEffects(state, success ? choice.effects : (choice.failEffects || []), ctx, rng);
    run.lastOutcome = run.event.title + ': ' + choice.title + (choice.chanceKey ? success ? ' — удача.' : ' — неудача.' : '.') + ' ' + describeEffects(success ? choice.effects : (choice.failEffects || []), ctx.config);
    log(state, run.lastOutcome, ctx.config);
    if (!death(state, ctx)) nextFloor(state, ctx, rng);
    return { ok: true, sound: success ? 'reward' : 'select' };
  }
  function buy(state, index, payment, ctx) {
    var run = state.run;
    var cfg = ctx.config;
    if (run.phase !== 'shop' || index % 1 || !run.offers[index] || run.offers[index].sold) return { ok: false, message: 'Товара нет в лавке.' };
    var offer = run.offers[index];
    if (payment === 'health') {
      if (!has(state, 'bloodCoin')) return { ok: false, message: 'Нужна Кровавая монета.' };
      var hpCost = Math.ceil(offer.price / cfg['relic.bloodCoin.rate']);
      if (run.hero.hp <= hpCost && !(has(state, 'heart') && !run.heartUsed)) return { ok: false, message: 'Недостаточно здоровья.' };
      run.hero.hp -= hpCost;
    } else {
      if (Big.lt(run.gold, offer.price)) return { ok: false, message: 'Недостаточно золота.' };
      run.gold = Big.sub(run.gold, offer.price);
    }
    offer.sold = true;
    if (offer.type === 'relic') addRelic(state, offer.id, cfg);
    if (offer.type === 'move') addMove(state, offer.id, cfg);
    if (offer.type === 'heal') heal(state, run.hero.maxHp * cfg['shop.heal']);
    death(state, ctx);
    return { ok: true, sound: 'buy' };
  }
  function buyWorkshop(state, id, cfg) {
    if (state.run.phase !== 'home' && state.run.phase !== 'ended') return { ok: false, message: 'Мастерская доступна между подъёмами.' };
    if (WORKSHOP_IDS.indexOf(id) < 0 || (workshopMax(id, cfg) > 0 && workshopLevel(state, id) >= workshopMax(id, cfg))) return { ok: false, message: 'Улучшение недоступно.' };
    var price = workshopCost(state, id, cfg);
    if (Big.lt(meta(state).shards, price)) return { ok: false, message: 'Не хватает осколков.' };
    meta(state).shards = Big.sub(meta(state).shards, price);
    meta(state).workshop[id]++;
    return { ok: true, sound: 'buy' };
  }
  function canFreshLegs(state, cfg) {
    return ['home', 'ended', 'fork'].indexOf(state.run.phase) < 0 && !state.run.freshLegs && state.run.flightRests === 0;
  }
  function rerollDoor(state, index, ctx, rng) {
    var run = state.run;
    var cfg = ctx.config;
    if (run.phase !== 'doors' || !has(state, 'vane') || run.vaneUsed || !run.doors[index] || ['boss'].indexOf(run.doors[index].type) >= 0) return { ok: false, message: 'Флюгер сейчас недоступен.' };
    var local = flightFloor(run.floor, cfg);
    if (local === cfg['doors.serviceFloor'] || local === cfg['doors.restFloor']) return { ok: false, message: 'Обязательные двери менять нельзя.' };
    var pool = DOOR_IDS.filter(function (type) { return type !== run.doors[index].type && (type !== 'elite' || local >= cfg['doors.eliteFrom']); });
    var type = rng.weighted(pool, function (id) { return cfg['doorWeight.' + id]; });
    run.doors[index] = { id: type, type: type };
    run.vaneUsed = true;
    return { ok: true, sound: 'select' };
  }


  function stockText(value, limit) {
    return typeof value === 'string' && value.length > 0 && value.length <= limit && !/https?:/.test(value);
  }
  function knownEventKey(key, type, cost) {
    var found = false;
    C.events.forEach(function (event) {
      event.choices.forEach(function (choice) {
        if (cost && choice.cost && choice.cost.key === key && choice.cost.type === type) found = true;
        if (!cost) (choice.effects || []).concat(choice.failEffects || []).forEach(function (effect) { if (effect.key === key && effect.type === type) found = true; });
      });
    });
    return found;
  }
  function effectValid(effect) {
    return effect && EFFECT_IDS.indexOf(effect.type) >= 0 && (!effect.key || knownEventKey(effect.key, effect.type, false));
  }
  function validateStock(kind, value) {
    if (!value || !stockText(value.title, 80) || !stockText(value.text, 1000)) return 'Нужны короткие название и текст без ссылок.';
    if (value.id !== undefined && !/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(value.id)) return 'Недопустимый идентификатор.';
    if (kind === 'events') {
      if (!Array.isArray(value.choices) || value.choices.length < 2 || value.choices.length > 3) return 'Нужно два или три выбора.';
      var freeChoice = false;
      for (var i = 0; i < value.choices.length; i++) {
        var choice = value.choices[i];
        if (!choice || !stockText(choice.title, 80) || !stockText(choice.text, 1000) || !Array.isArray(choice.effects)) return 'Неверное описание выбора.';
        if (choice.effects.length > 3 || !choice.effects.every(effectValid)) return 'Неизвестный эффект.';
        if (choice.failEffects && (!Array.isArray(choice.failEffects) || choice.failEffects.length > 3 || !choice.failEffects.every(effectValid))) return 'Неверный исход неудачи.';
        if (choice.cost && (['gold', 'health'].indexOf(choice.cost.type) < 0 || !knownEventKey(choice.cost.key, choice.cost.type, true))) return 'Неверная цена.';
        if (choice.chanceKey && ['event.well.chance', 'event.toll.chance', 'event.nest.chance'].indexOf(choice.chanceKey) < 0) return 'Неизвестная вероятность.';
        if (!choice.cost && choice.effects.concat(choice.failEffects || []).every(function (effect) { return ['damage', 'curse', 'removeRelic'].indexOf(effect.type) < 0; })) freeChoice = true;
      }
      if (!freeChoice) return 'Нужен бесплатный безопасный выбор.';
      return null;
    }
    if (kind === 'enemies') {
      if (ENEMY_IDS.indexOf(value.template) < 0 || [1, 2, 3].indexOf(value.flight) < 0 || Math.floor(ENEMY_IDS.indexOf(value.template) / 4) + 1 !== value.flight) return 'Неизвестный шаблон врага или пролёт.';
      return null;
    }
    if (kind === 'daily') {
      if (RULE_IDS.indexOf(value.rule) < 0 || !stockText(String(value.seed || ''), 80)) return 'Неизвестное правило или зерно.';
      return null;
    }
    return 'Неизвестный вид контента.';
  }
  function addStock(state, action, ctx) {
    var problem = validateStock(action.kind, action.item);
    if (problem) return { ok: false, message: problem };
    var value = copy(action.item);
    if (!value.id) value.id = 'stock-' + Rng.hash(value.title + ':' + value.text);
    if (action.kind === 'daily') value.day = String(value.day || Math.floor(ctx.now / 86400000));
    if (action.kind === 'events') {
      for (var i = 0; i < value.choices.length; i++) {
        var c = value.choices[i];
        var effects = c.effects.concat(c.failEffects || []);
        if (c.cost && ctx.config[c.cost.key] === undefined) return { ok: false, message: 'Неизвестная цена события.' };
        for (var j = 0; j < effects.length; j++) if (effects[j].key && ctx.config[effects[j].key] === undefined) return { ok: false, message: 'Неизвестный ключ эффекта.' };
      }
    }
    var queue = meta(state).stock[action.kind];
    if (queue.some(function (x) { return (action.kind !== 'daily' || x.day === value.day) && (x.id === value.id || x.title === value.title); })) return { ok: true, message: 'Уже в запасе.' };
    queue.push(value);
    if (queue.length > ctx.config['stock.maxStored']) queue.shift();
    return { ok: true };
  }
  function procedural(kind, rng) {
    if (kind === 'events') return copy(rng.pick(C.events));
    if (kind === 'enemies') {
      var foe = copy(rng.pick(C.catalog.enemies));
      foe.id = 'stock-' + foe.id;
      return foe;
    }
    if (kind === 'daily') {
      var rule = rng.pick(RULE_IDS);
      var ruleData = item('dailyRules', rule);
      return { id: 'daily-' + rule, title: ruleData.title, text: ruleData.text, rule: rule, seed: String(rng.int(1, 2147483647)), procedural: true };
    }
    return null;
  }
  function act(state, action, ctx) {
    if (!action || typeof action.type !== 'string') return { ok: false, message: 'Нет действия.' };
    var cfg = ctx.config;
    var run = state.run;
    var rng = Rng.make(run.rng);
    var result;
    if (action.type === 'start') result = start(state, action, ctx);
    else if (action.type === 'stock') result = addStock(state, action, ctx);
    else if (action.type === 'workshop') result = buyWorkshop(state, action.id, cfg);
    else if (action.type === 'door') result = chooseDoor(state, Number(action.index), ctx, rng);
    else if (action.type === 'play') result = play(state, action.id, ctx, rng);
    else if (action.type === 'reward') result = chooseReward(state, Number(action.index), ctx, rng);
    else if (action.type === 'event') result = chooseEvent(state, Number(action.index), ctx, rng);
    else if (action.type === 'buy') result = buy(state, Number(action.index), action.payment || 'gold', ctx);
    else if (action.type === 'reroll') result = rerollDoor(state, Number(action.index), ctx, rng);
    else if (action.type === 'freshLegs') {
      if (canFreshLegs(state, cfg)) { run.freshLegs = true; result = { ok: true, sound: 'reward' }; }
      else result = { ok: false, message: 'Первый отдых этого пролёта уже прошёл.' };
    } else if (action.type === 'next' && (run.phase === 'rest' || run.phase === 'shop')) {
      nextFloor(state, ctx, rng);
      result = { ok: true, sound: 'select' };
    } else if (action.type === 'continue' && run.phase === 'fork') {
      nextFloor(state, ctx, rng);
      result = { ok: true, sound: 'select' };
    } else if (action.type === 'descend' && run.phase === 'fork') {
      settle(state, false, ctx);
      result = { ok: true, sound: 'reward' };
    } else result = { ok: false, message: 'Сейчас это действие недоступно.' };
    if (result.ok) {
      if (action.type !== 'start') state.run.rng = rng.state();
      result.achievements = Object.keys(meta(state).achievements);
      if (state.run.phase === 'ended' && state.run.result === 'death') result.sound = 'alarm';
    }
    return result;
  }
  function doorView(door) {
    var data = item('doors', door.type);
    return { id: door.id, type: door.type, title: door.type === 'boss' ? 'Босс пролёта' : data.title, text: door.type === 'boss' ? 'За победой — выбор: спуск или следующий пролёт.' : data.text, icon: data.icon || 'door' };
  }
  function view(state, cfg) {
    var run = state.run;
    var m = meta(state);
    var out = {
      phase: run.phase, floor: run.floor, flight: flightOf(run.floor, cfg) + 1, flightFloor: flightFloor(run.floor, cfg),
      flightTitle: flightTitle(run.floor, cfg), classId: run.classId, height: run.height, heights: m.heights,
      hero: run.hero ? copy(run.hero) : null, gold: Big.str(run.gold), shards: Big.str(m.shards),
      level: run.level, xp: run.xp, xpNext: xpNext(state, cfg), enemy: run.enemy ? copy(run.enemy) : null,
      intent: null, previewIntents: [], hand: [], doors: run.doors.map(doorView), doorPreview: [],
      offers: run.offers.map(function (offer) { return offerView(state, offer, cfg); }),
      rewards: run.rewards.map(function (offer) { return offerView(state, offer, cfg); }),
      rewardTitle: run.rewardTitle || '', event: null, log: run.log.slice(), lastOutcome: run.lastOutcome,
      relics: run.relics.map(function (id) { return copy(item('relics', id)); }),
      payout: Big.str(run.paid ? run.payout : shardReward(state, cfg, false)), deathPayout: Big.str(shardReward(state, cfg, true)),
      canFreshLegs: canFreshLegs(state, cfg), canReroll: false, daily: run.daily, workshop: [],
      classes: [], album: copy(m.album), bestFloor: m.bestFloor, stats: copy(m.stats)
    };
    if (run.enemy && run.phase === 'combat') {
      var current = intentView(run.enemy.intent);
      if (current.hidden && !run.enemy.read) { current.type = 'hidden'; current.amount = 0; current.title = 'Намерение скрыто'; }
      else { current.hidden = false; current.title = { attack: 'Удар', defend: 'Защита', charge: 'Зарядка', curse: 'Заклятие', heal: 'Лечение', flame: 'Пламя', flee: 'Побег', skip: 'Пропуск' }[current.type]; }
      out.intent = current;
      if (run.enemy.read) {
        for (var p = 1; p <= 2; p++) {
          var future = makeIntent(state, run.enemy.turn + p, cfg);
          future.hidden = false;
          var futureView = intentView(future);
          futureView.title = { attack: 'Удар', defend: 'Защита', charge: 'Зарядка', curse: 'Заклятие', heal: 'Лечение', flame: 'Пламя', flee: 'Побег', skip: 'Пропуск' }[future.type];
          out.previewIntents.push(futureView);
        }
      }
      out.hand = run.hand.map(function (id) {
        var d = item('moves', id);
        var cost = moveCost(id, cfg);
        var locked = run.enemy.locked.indexOf(id) >= 0;
        return { id: id, title: d.title, text: d.text, level: run.moves[id] || 0, cost: cost, locked: locked, disabled: locked || run.hero.will < cost };
      });
    }
    if (run.phase === 'doors') {
      var local = flightFloor(run.floor, cfg);
      out.canReroll = has(state, 'vane') && !run.vaneUsed && local !== cfg['doors.serviceFloor'] && local !== cfg['doors.restFloor'] && local !== cfg['floor.flightSize'];
      if (has(state, 'map')) {
        for (var q = 1; q <= cfg['doors.preview']; q++) out.doorPreview.push({ floor: run.floor + q, doors: doorsAt(state, run.floor + q, cfg).map(doorView) });
      }
    }
    if (run.event && run.phase === 'event') {
      out.event = copy(run.event);
      out.event.choices = run.event.choices.map(function (choice) {
        var c = copy(choice);
        c.disabled = !canPayChoice(state, choice, cfg);
        if (run.event.reveal) c.outcome = choice.text;
        else c.text = choice.cost ? (choice.cost.type === 'gold' ? 'Цена: ' : 'Потребуется здоровья: ') + cfg[choice.cost.key] + (choice.cost.type === 'gold' ? ' золота.' : '.') : 'Исход откроется после выбора.';
        return c;
      });
    }
    WORKSHOP_IDS.forEach(function (id) {
      var d = item('workshop', id);
      var level = workshopLevel(state, id);
      var price = workshopCost(state, id, cfg);
      var max = workshopMax(id, cfg);
      out.workshop.push({ id: id, title: d.title, text: d.text, level: level, max: max, endless: max <= 0, mastery: max > 0 ? max : cfg['workshop.' + id + '.mastery'] || 0,
        effect: cfg['workshop.' + id + '.effect'], price: Big.str(price), affordable: Big.gte(m.shards, price) && (max <= 0 || level < max) });
    });
    (C.catalog.classes || []).forEach(function (d) { out.classes.push({ id: d.id, title: d.title, text: d.text, unlocked: m.classes.indexOf(d.id) >= 0, bestFloor: m.bestByClass[d.id] || 0 }); });
    return out;
  }
  function botAction(state, cfg) {
    var run = state.run;
    if (run.phase === 'home' || run.phase === 'ended') return { type: 'start', classId: 'guardian', height: 1 };
    if (run.phase === 'fork') return { type: 'continue' };
    if (run.phase === 'rest') return { type: 'next' };
    if (run.phase === 'doors') {
      var best = 0;
      var score = -Infinity;
      var low = run.hero.hp < run.hero.maxHp * cfg['bot.restThreshold'];
      run.doors.forEach(function (door, index) {
        var weights = { boss: 100, chest: 60, event: 55, combat: 70, shop: 30, elite: 20, rest: low ? 90 : 40 };
        var s = weights[door.type] || 0;
        if (s > score) { best = index; score = s; }
      });
      return { type: 'door', index: best };
    }
    if (run.phase === 'reward') {
      var chosen = 0;
      var max = -Infinity;
      run.rewards.forEach(function (offer, index) {
        var ranks = { whetstone: 12, bow: 11, shadow: 15, buckle: 10, heart: 14, rations: 9, mirror: 9, vow: 2, strike: 10, dash: 11, reflect: 9, flame: 8, block: 5, lunge: 8 };
        var rank = ranks[offer.id] || (offer.type === 'relic' ? 6 : 4);
        if (rank > max) { max = rank; chosen = index; }
      });
      return { type: 'reward', index: chosen };
    }
    if (run.phase === 'event') {
      var choiceIndex = run.event.choices.length - 1;
      var bestEffect = -Infinity;
      run.event.choices.forEach(function (choice, index) {
        if (!canPayChoice(state, choice, cfg)) return;
        var score = choice.cost ? choice.cost.type === 'health' ? -cfg[choice.cost.key] : -cfg[choice.cost.key] / cfg['event.defaultGold'] : 0;
        choice.effects.forEach(function (effect) {
          var v = { relic: 10, strength: 10, defense: 8, agility: 8, will: 6, upgrade: 8, gold: 4, swap: 3, heal: run.hero.hp < run.hero.maxHp ? 10 : 0, curse: -10, damage: -10, skip: -3, ally: 6 };
          score += v[effect.type] || 0;
        });
        if (score > bestEffect) { bestEffect = score; choiceIndex = index; }
      });
      return { type: 'event', index: choiceIndex };
    }
    if (run.phase === 'shop') {
      for (var i = 0; i < run.offers.length; i++) {
        var offer = run.offers[i];
        if (!offer.sold && Big.gte(run.gold, offer.price) && (offer.type !== 'heal' || run.hero.hp < run.hero.maxHp * (1 - cfg['shop.heal']))) return { type: 'buy', index: i };
      }
      return { type: 'next' };
    }
    if (run.phase === 'combat') {
      var e = run.enemy;
      var h = run.hero;
      var incoming = e.intent.type === 'attack' ? e.intent.amount * e.intent.hits : 0;
      var bestMove = null;
      var bestScore = -Infinity;
      run.hand.forEach(function (id) {
        if (e.locked.indexOf(id) >= 0 || moveCost(id, cfg) > h.will) return;
        var score = -1;
        var scale = moveScale(state, id, cfg);
        var block = h.defense * scale * (has(state, 'shadow') ? 1 + cfg['relic.shadow.power'] : 1);
        var damage = h.strength * scale * (has(state, 'shadow') ? 1 + cfg['relic.shadow.power'] : 1);
        if (id === 'strike' || id === 'dash' || id === 'lunge' || id === 'sweep') {
          if (id === 'strike' && has(state, 'vow')) damage *= cfg['relic.vow.strike'];
          if ((id === 'strike' || id === 'dash') && has(state, 'bow')) damage *= cfg['relic.bow.hits'] * cfg['relic.bow.power'];
          if (id === 'lunge') damage *= cfg['move.lunge'];
          if (id === 'sweep') damage *= cfg['move.sweep'];
          if (id === 'dash' && e.intent.type === 'charge') damage *= cfg['move.dashCharge'];
          score = e.plates > 0 ? 0 : damage;
          if (id === 'dash' && damage >= e.hp) score += incoming;
        }
        if (id === 'block' || id === 'reflect') {
          score = id === 'reflect' ? Math.max(0, block - incoming) * (has(state, 'mirror') ? cfg['relic.mirror.mult'] : 1) : 0;
          if (incoming > 0 && e.plates > 0) score += h.strength * cfg['boss.plates'];
          if (e.intent.charged) score += incoming;
          if (e.burn > 0 && incoming > 0) score += Math.min(block, incoming);
          // A simple bot eventually risks an attack instead of repeating a zero-damage stalemate.
          if (e.turn < cfg['combat.maxTurns'] && incoming >= h.hp && block >= incoming && run.lastMove !== 'block' && run.lastMove !== 'reflect') score += incoming;
        }
        if (id === 'breathe') score = Math.min(h.maxHp - h.hp, h.maxHp * cfg['move.breathe'] * scale) - incoming;
        if (id === 'flame') score = cfg['move.flame'] * scale * (run.classId === 'firestarter' ? cfg['class.firestarter.flame'] : 1) * Math.max(1, Math.min(4, e.hp / h.strength));
        if (id === 'execute') score = e.hp < e.maxHp * cfg['move.execute'] * scale && !e.plates ? e.hp + incoming : -1;
        if (id === 'read') score = -2;
        if (score > bestScore) { bestScore = score; bestMove = id; }
      });
      return { type: 'play', id: bestMove || run.hand[0] };
    }
    return { type: 'next' };
  }

  function tick(state, dt, ctx) {}
  function offline(state, sec, ctx) { return { events: [] }; }
  function prestigeGain(state, layerId, cfg) {
    if (layerId !== 'height' || ['home', 'ended', 'fork'].indexOf(state.run.phase) < 0 || !state.run.unlockedHeight || state.run.height >= cfg['height.max']) return Big.ZERO;
    return Big.max(0, Big.sub(state.run.unlockedHeight - 1, state.layers.height ? state.layers.height.currency : 0));
  }
  function bonus(state, layerId, amount, cfg) { return Big.add(1, Big.mul(amount, cfg['shards.heightBonus'])); }
  function onPrestige(state, layerId, before, ctx) {
    if (layerId !== 'height') return;
    var old = before.run;
    if (!old.paid && old.phase === 'fork') {
      state.run = copy(old);
      settle(state, false, ctx);
    }
    state.run = baseRun(old.rng);
    start(state, { classId: old.classId, height: Math.min(meta(state).heights, old.height + 1) }, ctx);
  }
  function migrate(state, fromVer) { return state; }
  function validate(state) {
    if (!state || !state.run || !state.meta || !state.meta.tower) return 'Нет данных башни.';
    var run = state.run;
    var m = meta(state);
    if (PHASES.indexOf(run.phase) < 0) return 'Неизвестная фаза.';
    if (run.floor < 1 || run.floor % 1 || run.height < 1 || run.height % 1) return 'Неверный этаж или высота.';
    if (!Big.valid(run.gold) || Big.sign(run.gold) < 0 || !Big.valid(m.shards) || Big.sign(m.shards) < 0) return 'Неверные валюты.';
    if (run.hero && (!(run.hero.maxHp > 0) || run.hero.hp < 0 || run.hero.hp > run.hero.maxHp || run.hero.will < 0)) return 'Неверное здоровье или воля.';
    if (run.phase === 'combat' && (!run.enemy || !run.hand.length || !(run.enemy.hp > 0))) return 'Неверный бой.';
    if (run.relics.some(function (id, index) { return run.relics.indexOf(id) !== index; })) return 'Повтор реликвии.';
    if (WORKSHOP_IDS.some(function (id) { return !(m.workshop[id] >= 0) || m.workshop[id] % 1; })) return 'Неверная мастерская.';
    return null;
  }
  function summary(state, cfg) {
    return { line: 'Этаж ' + state.run.floor + ' · ' + flightTitle(state.run.floor, cfg) + ' · осколки ' + Big.str(meta(state).shards) };
  }
  function next(state, now, cfg) { return []; }
  function chest(state, rng, cfg) {
    meta(state).pendingChests++;
    return { title: 'Сундук следующего пролёта', items: [{ title: 'Сундук в начале пролёта', amount: 1 }] };
  }
  return {
    init: init, tick: tick, offline: offline, prestigeGain: prestigeGain, bonus: bonus, onPrestige: onPrestige,
    migrate: migrate, validate: validate, summary: summary, next: next, chest: chest, procedural: procedural, validateStock: validateStock,
    setContent: setContent, use: use, act: act, view: view, botAction: botAction, canFreshLegs: canFreshLegs,
    power: power, doorsAt: doorsAt, workshopCost: workshopCost, shardReward: shardReward, deathKeep: deathKeep,
    addRelic: addRelic, recalc: recalc, beginCombat: beginCombat, startCombat: beginCombat, makeIntent: makeIntent,
    moveCost: moveCost, xpNext: xpNext, applyEffects: applyEffects, flightOf: flightOf, gainGold: gainGold
  };
});





