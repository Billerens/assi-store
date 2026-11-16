// Contracts, short routes and isolated forge puzzles. Shared ES5; no network, wall clock or RNG.
(function (root, make) {
  var node = typeof require === 'function' && typeof exports !== 'undefined';
  var api = node ? make(require('../engine/big.js')) : make(root.Big);
  if (typeof exports !== 'undefined') { for (var key in api) exports[key] = api[key]; }
  else root.MFAdventures = api;
})(this, function (Big) {
  'use strict';
  var DEFAULTS = {
    'adventures.contract.wave': 25, 'adventures.contract.count': 3,
    'adventures.contract.cooldown': 120, 'adventures.contract.gold': 1.15,
    'adventures.contract.trainingGold': 0.8, 'adventures.contract.xp': 10,
    'adventures.contract.bonusCap': 0.1,
    'adventures.expedition.wave': 45, 'adventures.expedition.first': 2,
    'adventures.expedition.short': 1, 'adventures.expedition.ruins': 3,
    'adventures.expedition.cooldown': 180,
    'adventures.expedition.hp': 1.08, 'adventures.expedition.ruinsHp': 1.15,
    'adventures.expedition.shortGold': 0.1, 'adventures.expedition.ruinsGold': 0.15,
    'adventures.expedition.shortXp': 6, 'adventures.expedition.ruinsXp': 10,
    'adventures.trial.wave': 60, 'adventures.trial.waveStep': 10,
    'adventures.trial.xp': 10, 'adventures.training.chunk': 10,
    'adventures.training.cap': 1000000000
  };
  var BUYERS = [
    { id: 'guard', title: 'Заказ гарнизона', text: 'Стражникам нужны клинки для смены у ворот.' },
    { id: 'caravan', title: 'Оружие для каравана', text: 'Купец собирает охрану для следующей дороги.' },
    { id: 'apprentices', title: 'Учебная партия', text: 'Наставник готовит клинки для молодых бойцов.' }
  ];
  var ROUTES = [
    { id: 'quarry', title: 'Каменная дорога', text: 'Панцирные стражи у старой каменоломни.', enemyKind: 'armored' },
    { id: 'grove', title: 'Заросшая тропа', text: 'Восстанавливающиеся чудища возле зелёных руин.', enemyKind: 'regenerator' },
    { id: 'beacons', title: 'Погасшие маяки', text: 'Заклинатели занимают дорогу к маякам.', enemyKind: 'channeler' }
  ];
  var PUZZLES = [
    { title: 'Квадрат подмастерья', grid: [1,1,2,0,2,2,0,0,0], target: 4, moves: 5 },
    { title: 'Пустая середина', grid: [1,1,0,2,0,2,0,0,2], target: 4, moves: 8 },
    { title: 'Дорога к мастеру', grid: [3,0,1,0,1,0,0,2,0], target: 4, moves: 7 }
  ];
  function number(n, fallback) { n = Number(n); return isFinite(n) ? n : fallback; }
  function setting(cfg, key) { return number(cfg && cfg[key], DEFAULTS[key]); }
  function whole(n) { return typeof n === 'number' && isFinite(n) && n >= 0 && n === Math.floor(n); }
  function fail(text) { return { ok: false, reason: text }; }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function seenWave(state) {
    var forge = state.layers && state.layers.forge;
    return Math.max(1, number(state.run.maxWave, 1), number(forge && forge.state && forge.state.record, 0), number(state.meta.outpost && state.meta.outpost.seenWave, 0), number(state.meta.adventures && state.meta.adventures.seenWave, 0));
  }
  function ensure(state) {
    if (state.meta === undefined) state.meta = {};
    if (!state.meta || !state.run) return state;
    if (state.meta.adventures === undefined) state.meta.adventures = {};
    var m = state.meta.adventures;
    if (!m || typeof m !== 'object' || Array.isArray(m)) return state;
    if (m.serial === undefined) m.serial = 0;
    if (m.contractCooldown === undefined) m.contractCooldown = 0;
    if (m.expeditionCooldown === undefined) m.expeditionCooldown = 0;
    if (m.contracts === undefined) m.contracts = 0;
    if (m.expeditions === undefined) m.expeditions = 0;
    if (m.trainingXp === undefined) m.trainingXp = 0;
    if (m.trialClaimedTier === undefined) m.trialClaimedTier = -1;
    if (m.collection === undefined) m.collection = {};
    if (m.seenWave === undefined || (whole(m.seenWave) && m.seenWave >= 1)) m.seenWave = seenWave(state);
    if (state.run.adventures === undefined) state.run.adventures = {};
    var r = state.run.adventures;
    if (!r || typeof r !== 'object' || Array.isArray(r)) return state;
    if (r.contract === undefined) r.contract = null;
    if (r.expedition === undefined) r.expedition = null;
    if (r.trial === undefined) r.trial = null;
    if (r.offers === undefined) r.offers = [];
    return state;
  }
  function unlocked(state, cfg, key) { return seenWave(state) >= setting(cfg, 'adventures.' + key + '.wave'); }
  function nextId(state, prefix) { state.meta.adventures.serial++; return prefix + '-' + state.meta.adventures.serial; }
  function forgeLevel(state, cfg) {
    var forge = state.layers && state.layers.forge;
    var mf = forge && forge.state && forge.state.mf || {};
    return Math.max(1, Math.min(number(cfg && cfg['forge.maxLevel'], 500), 1 + number(state.run.up && state.run.up.steel, 0) * number(cfg && cfg['up.steel.step'], 1) + number(mf.startLevel, 0)));
  }
  function offers(state, cfg) {
    ensure(state);
    var r = state.run.adventures, m = state.meta.adventures;
    if (!unlocked(state, cfg, 'contract') || r.contract || m.contractCooldown > 0) return [];
    if (!r.offers.length) {
      var level = forgeLevel(state, cfg), batch = nextId(state, 'offers');
      for (var i = 0; i < BUYERS.length; i++) {
        var buyer = BUYERS[(m.serial + i) % BUYERS.length];
        r.offers.push({ id: batch + '-' + buyer.id, buyer: buyer.id, title: buyer.title, text: buyer.text,
          level: Math.max(1, level - i), count: Math.max(1, Math.floor(setting(cfg, 'adventures.contract.count'))) + i });
      }
    }
    return clone(r.offers);
  }
  function acceptContract(state, cfg, id, mode, benefits) {
    ensure(state);
    if (mode !== 'gold' && mode !== 'training') return fail('Выберите награду заказа');
    if (state.run.adventures.contract) return fail('Сначала завершите текущий заказ');
    var list = offers(state, cfg), chosen = null;
    for (var i = 0; i < list.length; i++) if (list[i].id === id) chosen = list[i];
    if (!chosen) return fail('Предложение уже недоступно');
    chosen.mode = mode; chosen.delivered = 0; chosen.value = '0e0';
    chosen.bonus = Math.max(0, Math.min(DEFAULTS['adventures.contract.bonusCap'], setting(cfg, 'adventures.contract.bonusCap'), number(benefits && benefits.contractBonus, 0)));
    state.run.adventures.contract = chosen;
    state.run.adventures.offers = [];
    return { ok: true, id: chosen.id };
  }
  function previewDelivery(state, cfg, cells, open, quote) {
    ensure(state);
    var c = state.run.adventures.contract;
    if (!c) return fail('Нет активного заказа');
    if (!Array.isArray(cells) || !cells.length) return fail('Выберите клинки для заказа');
    if (cells.length > c.count - c.delivered) return fail('Выбрано больше клинков, чем осталось в заказе');
    if (!Array.isArray(open) || typeof quote !== 'function') return fail('Нельзя оценить выбранные клинки');
    var seen = {}, value = Big.ZERO, levels = [];
    for (var i = 0; i < cells.length; i++) {
      var cell = cells[i];
      if (!whole(cell) || seen[cell] || open.indexOf(cell) < 0 || !state.run.grid[cell]) return fail('Выбранный клинок уже изменился');
      seen[cell] = true;
      var level = state.run.grid[cell];
      if (!whole(level) || level < c.level || level > 1000) return fail('Уровень клинка ниже требования заказа');
      var price = quote(level);
      if (!Big.valid(price) || Big.sign(price) < 0) return fail('Цена клинка некорректна');
      value = Big.add(value, price); levels.push(level);
    }
    return { ok: true, id: c.id, cells: cells.slice(), levels: levels, value: Big.str(value), remaining: c.count - c.delivered - cells.length };
  }
  function deliver(state, cfg, cells, open, quote) {
    var preview = previewDelivery(state, cfg, cells, open, quote);
    if (!preview.ok) return preview;
    var c = state.run.adventures.contract;
    var total = Big.str(Big.add(c.value, preview.value));
    preview.cells.forEach(function (cell) { state.run.grid[cell] = 0; });
    c.delivered += preview.cells.length; c.value = total;
    return { ok: true, count: preview.cells.length, value: preview.value, complete: c.delivered === c.count };
  }
  function credit(state, cfg, gold, xp) {
    var amount = Big.floor(Big.max(0, gold));
    var nextGold = Big.add(state.run.gold, amount), nextEarned = Big.add(state.run.earned, amount);
    var m = state.meta.adventures;
    var actualXp = Math.max(0, Math.min(Math.floor(xp), setting(cfg, 'adventures.training.cap') - m.trainingXp));
    state.run.gold = nextGold; state.run.earned = nextEarned; m.trainingXp += actualXp;
    return { gold: Big.str(amount), xp: actualXp };
  }
  function contractReward(state, cfg, benefits) {
    var c = state.run.adventures.contract;
    if (!c) return null;
    var extra = Math.max(0, Math.min(DEFAULTS['adventures.contract.bonusCap'], setting(cfg, 'adventures.contract.bonusCap'), number(c.bonus, 0)));
    var rate = setting(cfg, c.mode === 'gold' ? 'adventures.contract.gold' : 'adventures.contract.trainingGold');
    return { gold: Big.str(Big.floor(Big.mul(c.value, rate + extra))), xp: c.mode === 'training' ? setting(cfg, 'adventures.contract.xp') : 0 };
  }
  function claimContract(state, cfg, benefits) {
    ensure(state); var r = state.run.adventures, m = state.meta.adventures, c = r.contract;
    if (!c || c.delivered < c.count) return fail('Заказ ещё не выполнен');
    var reward = contractReward(state, cfg, benefits), result = credit(state, cfg, reward.gold, reward.xp);
    r.contract = null; r.offers = []; m.contracts++; m.contractCooldown = setting(cfg, 'adventures.contract.cooldown');
    return { ok: true, id: c.id, gold: result.gold, xp: result.xp };
  }
  function cancelContract(state, cfg) {
    ensure(state); var r = state.run.adventures;
    if (!r.contract) return fail('Нет активного заказа');
    r.contract = null; r.offers = []; state.meta.adventures.contractCooldown = setting(cfg, 'adventures.contract.cooldown');
    return { ok: true };
  }
  function findRoute(id) { for (var i = 0; i < ROUTES.length; i++) if (ROUTES[i].id === id) return ROUTES[i]; return null; }
  function currentSerial(state) { return Math.max(0, Math.floor(number(state.run.encounterSerial, 0)), Math.floor(number(state.run.encounter && state.run.encounter.serial, 0))); }
  function startExpedition(state, cfg, id) {
    ensure(state); var r = state.run.adventures, m = state.meta.adventures, route = findRoute(id);
    if (!unlocked(state, cfg, 'expedition')) return fail('Походы ещё не открыты');
    if (!route) return fail('Неизвестный маршрут');
    if (r.expedition || m.expeditionCooldown > 0) return fail('Новый поход пока недоступен');
    r.expedition = { id: nextId(state, 'route'), route: id, title: route.title, progress: 0,
      target: Math.max(1, Math.floor(setting(cfg, 'adventures.expedition.first'))),
      branch: '', awaitingChoice: false, complete: false, gold: '0e0',
      startWave: Math.max(1, state.run.wave), minSerial: currentSerial(state) + 1, lastSerial: currentSerial(state) };
    return { ok: true, id: r.expedition.id };
  }
  function modifiers(state, cfg) {
    var r = state.run.adventures, e = r && r.expedition;
    if (!e || e.awaitingChoice || e.complete || currentSerial(state) + 1 < e.minSerial) return { hpMult: 1 };
    var route = findRoute(e.route);
    return { enemyKind: route ? route.enemyKind : undefined, hpMult: Math.max(1, Math.min(1.15, setting(cfg, e.branch === 'ruins' ? 'adventures.expedition.ruinsHp' : 'adventures.expedition.hp'))) };
  }
  function onKill(state, cfg, event) {
    ensure(state); var e = state.run.adventures.expedition;
    if (!e || e.complete || e.awaitingChoice || !event || event.farm || !whole(event.serial) || event.serial < e.minSerial || event.serial <= e.lastSerial || event.wave < e.startWave) return false;
    if (!Big.valid(event.gold) || Big.sign(event.gold) < 0) return false;
    e.gold = Big.str(Big.add(e.gold, event.gold)); e.lastSerial = event.serial; e.progress++;
    if (e.progress >= e.target) { if (e.branch) e.complete = true; else e.awaitingChoice = true; }
    return true;
  }
  function chooseRoute(state, cfg, choice) {
    ensure(state); var e = state.run.adventures.expedition;
    if (!e || !e.awaitingChoice || (choice !== 'short' && choice !== 'ruins')) return fail('Развилка сейчас недоступна');
    e.branch = choice; e.awaitingChoice = false;
    e.target = e.progress + Math.max(1, Math.floor(setting(cfg, 'adventures.expedition.' + choice)));
    e.minSerial = currentSerial(state) + 1;
    return { ok: true };
  }
  function expeditionReward(state, cfg) {
    var e = state.run.adventures.expedition;
    if (!e) return null;
    var branch = e.branch || 'short';
    return { gold: Big.str(Big.floor(Big.mul(e.gold, setting(cfg, 'adventures.expedition.' + branch + 'Gold')))), xp: setting(cfg, 'adventures.expedition.' + branch + 'Xp') };
  }
  function claimExpedition(state, cfg) {
    ensure(state); var r = state.run.adventures, m = state.meta.adventures, e = r.expedition;
    if (!e || !e.complete) return fail('Поход ещё не завершён');
    var reward = expeditionReward(state, cfg), result = credit(state, cfg, reward.gold, reward.xp);
    m.collection[e.route] = number(m.collection[e.route], 0) + 1;
    m.expeditions++; m.expeditionCooldown = setting(cfg, 'adventures.expedition.cooldown'); r.expedition = null;
    return { ok: true, id: e.id, gold: result.gold, xp: result.xp };
  }
  function cancelExpedition(state, cfg) {
    ensure(state); if (!state.run.adventures.expedition) return fail('Нет текущего похода');
    state.run.adventures.expedition = null; state.meta.adventures.expeditionCooldown = setting(cfg, 'adventures.expedition.cooldown');
    return { ok: true };
  }
  function trialTier(state, cfg) { return Math.max(0, Math.floor((seenWave(state) - setting(cfg, 'adventures.trial.wave')) / Math.max(1, setting(cfg, 'adventures.trial.waveStep')))); }
  function startTrial(state, cfg) {
    ensure(state); var r = state.run.adventures, m = state.meta.adventures, tier = trialTier(state, cfg);
    if (!unlocked(state, cfg, 'trial')) return fail('Испытания ещё не открыты');
    if (r.trial) return fail('Сначала завершите текущее испытание');
    if (tier <= m.trialClaimedTier) return fail('Следующее испытание требует нового рекорда волн');
    var recipe = PUZZLES[tier % PUZZLES.length], offset = Math.min(996, Math.floor(tier / PUZZLES.length));
    r.trial = { id: nextId(state, 'trial'), tier: tier, title: recipe.title,
      initial: recipe.grid.map(function (n) { return n ? n + offset : 0; }), target: recipe.target + offset,
      budget: recipe.moves, moves: 0, complete: false };
    r.trial.grid = r.trial.initial.slice();
    return { ok: true, id: r.trial.id };
  }
  function moveTrial(state, cfg, from, to) {
    ensure(state); var t = state.run.adventures.trial;
    if (!t || t.complete || t.moves >= t.budget) return fail('Начните или повторите испытание');
    if (!whole(from) || !whole(to) || from >= 9 || to >= 9 || from === to || !t.grid[from]) return fail('Выберите клинок и соседнюю клетку');
    if (Math.abs(Math.floor(from / 3) - Math.floor(to / 3)) + Math.abs(from % 3 - to % 3) !== 1) return fail('В испытании можно двигаться только в соседнюю клетку');
    if (t.grid[to] && t.grid[to] !== t.grid[from]) return fail('Сливаются только одинаковые уровни');
    t.grid[to] = t.grid[to] ? t.grid[to] + 1 : t.grid[from]; t.grid[from] = 0; t.moves++;
    if (t.grid[to] >= t.target) t.complete = true;
    return { ok: true, complete: t.complete };
  }
  function resetTrial(state, cfg) {
    ensure(state); var t = state.run.adventures.trial;
    if (!t) return fail('Нет текущего испытания');
    t.grid = t.initial.slice(); t.moves = 0; t.complete = false; return { ok: true };
  }
  function cancelTrial(state, cfg) { ensure(state); if (!state.run.adventures.trial) return fail('Нет текущего испытания'); state.run.adventures.trial = null; return { ok: true }; }
  function claimTrial(state, cfg) {
    ensure(state); var r = state.run.adventures, m = state.meta.adventures, t = r.trial;
    if (!t || !t.complete || t.tier <= m.trialClaimedTier) return fail('Награда испытания сейчас недоступна');
    var result = credit(state, cfg, 0, setting(cfg, 'adventures.trial.xp'));
    m.trialClaimedTier = t.tier; m.collection['trial-' + (t.tier % PUZZLES.length)] = true; r.trial = null;
    return { ok: true, id: t.id, gold: result.gold, xp: result.xp };
  }
  function trainHero(state, cfg, id) {
    ensure(state); var m = state.meta.adventures;
    var hero = state.meta.outpost && state.meta.outpost.heroes && state.meta.outpost.heroes[id];
    if (!hero || !hero.unlocked) return fail('Сначала пригласите героя');
    var count = Math.max(0, Math.min(Math.floor(setting(cfg, 'adventures.training.chunk')), m.trainingXp, setting(cfg, 'adventures.training.cap') - number(hero.xp, 0)));
    if (!count) return fail('Нет доступного опыта наставника');
    hero.xp = number(hero.xp, 0) + count; m.trainingXp -= count;
    return { ok: true, id: id, xp: count };
  }
  function tick(state, dt, cfg) {
    ensure(state); dt = Math.max(0, number(dt, 0)); var m = state.meta.adventures;
    m.contractCooldown = Math.max(0, m.contractCooldown - dt); m.expeditionCooldown = Math.max(0, m.expeditionCooldown - dt);
  }
  function onPrestige(state, cfg) {
    ensure(state); var m = state.meta.adventures;
    m.contractCooldown = Math.max(m.contractCooldown, setting(cfg, 'adventures.contract.cooldown'));
    m.expeditionCooldown = Math.max(m.expeditionCooldown, setting(cfg, 'adventures.expedition.cooldown'));
    m.serial++; state.run.adventures = { contract: null, expedition: null, trial: null, offers: [] };
  }
  function model(state, cfg, benefits) {
    ensure(state); var m = state.meta.adventures, r = state.run.adventures;
    return { wave: seenWave(state), trainingXp: m.trainingXp,
      contract: { unlocked: unlocked(state, cfg, 'contract'), wave: setting(cfg, 'adventures.contract.wave'), cooldown: m.contractCooldown,
        offers: offers(state, cfg), current: r.contract ? clone(r.contract) : null, reward: contractReward(state, cfg, benefits), completed: m.contracts },
      expedition: { unlocked: unlocked(state, cfg, 'expedition'), wave: setting(cfg, 'adventures.expedition.wave'), cooldown: m.expeditionCooldown,
        routes: clone(ROUTES), current: r.expedition ? clone(r.expedition) : null, reward: expeditionReward(state, cfg), completed: m.expeditions },
      trial: { unlocked: unlocked(state, cfg, 'trial'), wave: setting(cfg, 'adventures.trial.wave'), current: r.trial ? clone(r.trial) : null,
        canStart: unlocked(state, cfg, 'trial') && !r.trial && trialTier(state, cfg) > m.trialClaimedTier,
        nextWave: setting(cfg, 'adventures.trial.wave') + (m.trialClaimedTier + 1) * Math.max(1, setting(cfg, 'adventures.trial.waveStep')),
        rewardXp: setting(cfg, 'adventures.trial.xp') }, collection: clone(m.collection) };
  }
  function validate(state) {
    var m = state.meta && state.meta.adventures, r = state.run && state.run.adventures;
    if (m === undefined && r === undefined) return null;
    function record(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
    function id(v) { return typeof v === 'string' && v.length > 0 && v.length <= 128; }
    function count(v) { return whole(v) && v <= 1000000000000; }
    function time(v) { return typeof v === 'number' && isFinite(v) && v >= 0; }
    function offer(v) { return record(v) && id(v.id) && count(v.count) && v.count >= 1 && whole(v.level) && v.level >= 1 && v.level <= 1000; }
    if (!record(m) || !record(r) || !Array.isArray(r.offers) || r.offers.length > BUYERS.length || !record(m.collection)) return 'поручения повреждены';
    if (!count(m.serial) || !count(m.trainingXp) || !count(m.contracts) || !count(m.expeditions) || !time(m.contractCooldown) || !time(m.expeditionCooldown) || !count(m.seenWave) || m.seenWave < 1 || !(m.trialClaimedTier === -1 || count(m.trialClaimedTier))) return 'прогресс поручений повреждён';
    for (var key in m.collection) if (typeof m.collection[key] !== 'boolean' && !count(m.collection[key])) return 'прогресс поручений повреждён';
    var offerIds = {};
    for (var j = 0; j < r.offers.length; j++) {
      if (!offer(r.offers[j]) || offerIds[r.offers[j].id]) return 'заказ повреждён';
      offerIds[r.offers[j].id] = true;
    }
    if (r.contract !== null && r.contract !== undefined) {
      var c = r.contract;
      if (!offer(c) || !count(c.delivered) || c.delivered > c.count || (c.mode !== 'gold' && c.mode !== 'training') || !Big.valid(c.value) || Big.sign(c.value) < 0 || (c.bonus !== undefined && (!time(c.bonus) || c.bonus > DEFAULTS['adventures.contract.bonusCap']))) return 'заказ повреждён';
    }
    if (r.expedition !== null && r.expedition !== undefined) {
      var e = r.expedition;
      if (!record(e) || !id(e.id) || !findRoute(e.route) || !count(e.progress) || !count(e.target) || e.target < 1 || e.progress > e.target || !count(e.minSerial) || !count(e.lastSerial) || !count(e.startWave) || e.startWave < 1 || ['', 'short', 'ruins'].indexOf(e.branch) < 0 || typeof e.awaitingChoice !== 'boolean' || typeof e.complete !== 'boolean' || !Big.valid(e.gold) || Big.sign(e.gold) < 0) return 'поход повреждён';
      if (e.awaitingChoice !== (!e.branch && e.progress === e.target) || e.complete !== (!!e.branch && e.progress === e.target)) return 'поход повреждён';
    }
    if (r.trial) {
      var t = r.trial;
      if (!record(t) || !id(t.id) || !count(t.tier) || !whole(t.target) || t.target < 1 || t.target > 1000 || !Array.isArray(t.grid) || t.grid.length !== 9 || !Array.isArray(t.initial) || t.initial.length !== 9 || !whole(t.moves) || !whole(t.budget) || t.budget < 1 || t.budget > 1000 || t.moves > t.budget || typeof t.complete !== 'boolean') return 'испытание повреждено';
      for (var i = 0; i < 9; i++) if (!whole(t.grid[i]) || t.grid[i] > 1000 || !whole(t.initial[i]) || t.initial[i] > 1000) return 'клетка испытания повреждена';
      var won = t.grid.some(function (v) { return v >= t.target; });
      if (t.complete !== won || t.initial.some(function (v) { return v >= t.target; })) return 'испытание повреждено';
      // Powers of two are the exact merge mass. Carry bits instead of rounding mixed big levels.
      function mass(grid) {
        var counts = {}, bits = [];
        grid.forEach(function (level) { if (level) counts[level] = (counts[level] || 0) + 1; });
        for (var level = 1; level <= 1004; level++) {
          var amount = counts[level] || 0;
          if (amount % 2) bits.push(level);
          if (amount > 1) counts[level + 1] = (counts[level + 1] || 0) + Math.floor(amount / 2);
        }
        return bits.join(',');
      }
      if (mass(t.grid) !== mass(t.initial)) return 'испытание повреждено';
    }
    if (r.trial !== null && r.trial !== undefined && !record(r.trial)) return 'испытание повреждено';
    return null;
  }
  return { defaults: DEFAULTS, BUYERS: BUYERS, ROUTES: ROUTES, PUZZLES: PUZZLES,
    ensure: ensure, migrate: ensure, offers: offers, acceptContract: acceptContract, previewDelivery: previewDelivery, deliver: deliver,
    contractReward: contractReward, claimContract: claimContract, cancelContract: cancelContract,
    startExpedition: startExpedition, modifiers: modifiers, onKill: onKill, chooseRoute: chooseRoute,
    expeditionReward: expeditionReward, claimExpedition: claimExpedition, cancelExpedition: cancelExpedition,
    startTrial: startTrial, moveTrial: moveTrial, resetTrial: resetTrial, cancelTrial: cancelTrial, claimTrial: claimTrial,
    trainHero: trainHero, tick: tick, onPrestige: onPrestige, model: model, validate: validate };
});
