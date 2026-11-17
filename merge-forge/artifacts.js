// Coal relic collection. ES5 / Rhino / browser. All owned relics work together;
// this module returns commands, and the simulation applies them through normal game actions.
(function (root, make) {
  var api = typeof require === 'function' && typeof exports !== 'undefined' ? make(require('../engine/big.js')) : make(root.Big);
  if (typeof exports !== 'undefined') { for (var k in api) exports[k] = api[k]; } else root.MFArtifacts = api;
})(this, function (Big) {
  'use strict';
  var WAVES = [60, 70, 80, 100, 120, 150];
  var LIMITS = { damage: 0.75, gold: 0.5, forgeSpeed: 0.75, sale: 0.6, critChance: 0.12, critMult: 0.35,
    bossSeconds: 14, apprenticeSpeed: 0.5, offlineIncome: 0.15, runePower: 0.5, petXp: 0.75, heroXp: 0.75,
    dragonDigest: 0.6, dragonCharge: 0.5, cryRecovery: 0.5, walkSpeed: 0.4, bossSlow: 0.6, dragonMeals: 8 };
  var LABELS = { damage: 'Урон всех клинков: +{}%', gold: 'Золото за врагов: +{}%', forgeSpeed: 'Скорость ковки: +{}%',
    sale: 'Выручка продажи: +{}%', critChance: 'Шанс крита: +{} п.п.', critMult: 'Сила критов: +{}%', bossSeconds: 'Время босса: +{} с',
    apprenticeSpeed: 'Скорость подмастерья: +{}%', offlineIncome: 'Офлайн-золото: +{}%', runePower: 'Сила рун: +{}%',
    petXp: 'Опыт питомцев: +{}%', heroXp: 'Опыт героев: +{}%', dragonDigest: 'Скорость кормления: +{}%',
    dragonCharge: 'Заряд дракона: +{}%', cryRecovery: 'Восстановление клича: +{}%', walkSpeed: 'Скорость подхода врага: +{}%', bossSlow: 'Замедление таймера босса: +{}%',
    dragonMeals: 'Кормлений дракона за забег: +{}' };
  function relic(id, title, kind, stage, icon, description, effect, maximum, options) {
    var r = { id: id, title: title, kind: kind, stage: stage, wave: WAVES[stage], icon: icon, description: description,
      effect: effect, maximum: maximum, baseCost: [2, 3, 4, 6, 9, 14][stage] };
    for (var key in options || {}) r[key] = options[key];
    return r;
  }
  var CATALOG = [
    relic('pairHammer', 'Парный молот', 'click', 0, 'hammer', 'Принятый ручной удар иногда сливает одну подходящую пару обычным слиянием. Автоклик и офлайн его не запускают.', 'merge', 1, { baseCost: 1, chanceMax: 0.12, chanceKnee: 5 }),
    relic('emberSpark', 'Искра горнила', 'click', 0, 'bellows', 'Ручной удар иногда дополнительно сокращает текущую ковку, включая ковку на продажу.', 'forgeSeconds', 1.2),
    relic('whetstone', 'Памятный оселок', 'passive', 0, 'sharp', 'Усиливает общий урон клинков на поле и у героев. Вклад складывается с другими артефактами этого свойства.', 'damage', 0.5),
    relic('goldenSeal', 'Золотая печать', 'passive', 0, 'purse', 'Добавляет золото за победы над врагами, включая боссов.', 'gold', 0.35),
    relic('forgeHeart', 'Сердце горна', 'passive', 0, 'bellows', 'Ускоряет один общий цикл обычной и переполненной кузни.', 'forgeSpeed', 0.4),
    relic('warStandard', 'Знамя первого мастера', 'active', 0, 'banner', 'По нажатию временно усиливает весь урон. Другие активные артефакты могут работать одновременно.', 'damage', 0.35, { duration: 12, recharge: 90, baseCost: 3 }),
    relic('coinDie', 'Купеческая кость', 'click', 1, 'stall', 'Ручной удар иногда приносит долю цены обычного клинка горна; клинки игрока не расходуются.', 'goldSaleShare', 0.8),
    relic('dragonChime', 'Драконий колокольчик', 'click', 1, 'cry', 'Ручной удар иногда добавляет заряд дыхания найденному дракону.', 'dragonCharge', 3),
    relic('tradeScale', 'Верные весы', 'passive', 1, 'remelt', 'Увеличивает выручку обычной продажи и новых излишков ковки.', 'sale', 0.35),
    relic('keenLens', 'Линза мастера', 'passive', 1, 'eye', 'Повышает шанс крита. После предела шанса излишек усиливает криты с той же средней отдачей.', 'critChance', 0.04),
    relic('petTalisman', 'След любимца', 'passive', 1, 'apprentice', 'Питомцы получают больше опыта за свои настоящие действия.', 'petXp', 0.5),
    relic('hotBellows', 'Походные мехи', 'active', 1, 'bellows', 'По нажатию на короткое время ускоряет общий цикл ковки.', 'forgeSpeed', 0.5, { duration: 12, recharge: 90 }),
    relic('hourNeedle', 'Игла часовщика', 'click', 2, 'hourglass', 'Ручной удар иногда сокращает оставшееся восстановление приёмов героев.', 'heroCooldown', 1),
    relic('sandPin', 'Булавка песочных часов', 'click', 2, 'hourglass', 'Ручной удар иногда возвращает немного времени текущему боссу, не превышая предел таймера.', 'bossSeconds', 0.5),
    relic('heavyPommel', 'Навершие великана', 'passive', 2, 'hand', 'Повышает силу критов; герой получает тот же средний критический бонус, что и клинок на поле.', 'critMult', 0.3),
    relic('keeperSand', 'Песок хранителя', 'passive', 2, 'hourglass', 'Даёт дополнительное начальное время каждой битве с боссом.', 'bossSeconds', 10),
    relic('mentorBook', 'Записки оруженосца', 'passive', 2, 'hunter', 'Герои получают больше опыта в бою. Опыт наставника и купленные уровни не умножаются.', 'heroXp', 0.5),
    relic('hungryCrop', 'Ненасытный зоб', 'passive', 2, 'temper', 'Дракон принимает больше клинков за один забег.', 'dragonMeals', 12),
    relic('marketBell', 'Рыночный звон', 'active', 2, 'stall', 'По нажатию временно повышает цену продажи. Учитывается и автоматическая продажа излишков.', 'sale', 0.4, { duration: 15, recharge: 120 }),
    relic('shieldAwl', 'Панцирное шило', 'click', 3, 'temper', 'Ручной удар иногда снимает небольшую долю текущего панциря врага; не наносит бесплатный залп.', 'shieldFraction', 0.04),
    relic('mossVial', 'Склянка сухого мха', 'click', 3, 'runePower', 'Ручной удар иногда ненадолго подавляет восстановление текущего врага.', 'suppressSeconds', 0.8),
    relic('apprenticeGear', 'Шестерня ученика', 'passive', 3, 'apprentice', 'Купленный подмастерье чаще выполняет обычные слияния; сам подмастерье не выдаётся.', 'apprenticeSpeed', 0.35),
    relic('nightLantern', 'Фонарь ночной смены', 'passive', 3, 'night', 'Добавляет золото к рассчитанному офлайн-доходу. Работает и при полностью развитой Ночной смене.', 'offlineIncome', 0.1),
    relic('runePrism', 'Призма гнезда', 'passive', 3, 'runePower', 'Усиливает эффекты открытых рун, не создавая новые гнёзда.', 'runePower', 0.3),
    relic('frozenClock', 'Замёрзшие часы', 'active', 3, 'hourglass', 'По нажатию временно замедляет расход таймера босса. Не останавливает время полностью.', 'bossSlow', 0.35, { duration: 10, recharge: 100 }),
    relic('petTreat', 'Карман лакомств', 'click', 4, 'apprentice', 'Ручной удар иногда даёт немного опыта выбранному питомцу.', 'petXp', 2),
    relic('apprenticeSpring', 'Пружина подмастерья', 'click', 4, 'apprentice', 'Ручной удар иногда приближает следующее слияние уже нанятого подмастерья.', 'apprenticeSeconds', 1),
    relic('dragonCradle', 'Тёплая колыбель', 'passive', 4, 'temper', 'Ускоряет переваривание только тех клинков, которые игрок сам отдал дракону.', 'dragonDigest', 0.4),
    relic('emberVein', 'Жила тлеющего угля', 'passive', 4, 'cry', 'Увеличивает обычный приток заряда дыхания от побед и кормления.', 'dragonCharge', 0.3),
    relic('rallyCrest', 'Гребень боевого клича', 'passive', 4, 'cry', 'Ускоряет восстановление уже открытого боевого клича.', 'cryRecovery', 0.25),
    relic('focusCrystal', 'Кристалл точного удара', 'active', 4, 'eye', 'Временно повышает шанс крита. После предела шанса излишек усиливает криты с той же средней отдачей.', 'critChance', 0.08, { duration: 12, recharge: 100 }),
    relic('crySpark', 'Искра боевого рога', 'click', 5, 'cry', 'Ручной удар иногда сокращает оставшееся восстановление боевого клича.', 'crySeconds', 1),
    relic('digestiveCoal', 'Уголь долгого жара', 'click', 5, 'temper', 'Ручной удар иногда помогает переварить уже отданный клинок; сам не выбирает корм.', 'digestSeconds', 1.5),
    relic('marchingBoot', 'Сапог дозорного', 'passive', 5, 'hunter', 'Сокращает ожидание подходящего врага, оставляя время на подготовку.', 'walkSpeed', 0.25),
    relic('rallyHorn', 'Рог сбора', 'active', 5, 'cry', 'По нажатию сокращает оставшееся восстановление всех приёмов героев. Подготовленный удар не дублируется.', 'heroCooldown', 8, { recharge: 120 }),
    relic('feedingBowl', 'Чаша тёплого пепла', 'active', 5, 'temper', 'По нажатию продвигает переваривание существующей очереди дракона. Новые клинки не расходуются.', 'digestSeconds', 8, { recharge: 90 }),
    relic('twinLever', 'Рычаг близнецов', 'active', 5, 'apprentice', 'По нажатию выполняет одно обычное слияние подходящей пары. Улучшения сокращают собственный откат.', 'merge', 1, { recharge: 120 })
  ];
  var BY_ID = {};
  CATALOG.forEach(function (item) { BY_ID[item.id] = item; });
  function finite(n, fallback) { return typeof n === 'number' && isFinite(n) ? n : fallback; }
  function validLevel(n) { return finite(n, -1) >= 1 && Math.floor(n) === n && n <= 1000000; }
  function ensure(state) {
    state.meta = state.meta || {}; state.run = state.run || {};
    if (state.meta.artifacts === undefined) state.meta.artifacts = { version: 1, items: {} };
    if (state.run.artifacts === undefined) state.run.artifacts = { effects: {} };
    var m = state.meta.artifacts, r = state.run.artifacts;
    if (m && typeof m === 'object' && !Array.isArray(m)) {
      if (m.version === undefined) m.version = 1;
      if (m.items === undefined) m.items = {};
      for (var id in m.items || {}) {
        var it = m.items[id]; if (!it || typeof it !== 'object') continue;
        if (it.enabled === undefined) it.enabled = true;
        if (it.cooldown === undefined) it.cooldown = 0;
      }
    }
    if (r && typeof r === 'object' && !Array.isArray(r) && r.effects === undefined) r.effects = {};
    return state;
  }
  function validate(state) {
    var m = state.meta && state.meta.artifacts, r = state.run && state.run.artifacts;
    if (m === undefined && r === undefined) return null;
    if (!m || m.version !== 1 || !m.items || typeof m.items !== 'object' || Array.isArray(m.items)) return 'Некорректная коллекция артефактов';
    if (!r || !r.effects || typeof r.effects !== 'object' || Array.isArray(r.effects)) return 'Некорректные эффекты артефактов';
    for (var id in m.items) {
      var it = m.items[id];
      if (!it || !validLevel(it.level) || typeof it.enabled !== 'boolean' || finite(it.cooldown, -1) < 0) return 'Некорректный уровень или откат артефакта';
    }
    for (var key in r.effects) {
      var effect = r.effects[key], definition = BY_ID[key];
      if (!effect || finite(effect.left, -1) < 0 || finite(effect.power, -1) < 0) return 'Некорректный временный бонус артефакта';
      if (definition && (!definition.duration || !m.items[key] || effect.left > definition.duration + 1e-6 || effect.power > definition.maximum + 1e-6)) return 'Некорректный временный бонус артефакта';
    }
    return null;
  }
  function progress(state) {
    var layer = state.layers && state.layers.forge, star = state.layers && state.layers.star;
    return { prestige: Math.max(finite(layer && layer.count, 0), finite(star && star.count, 0)),
      wave: Math.max(finite(state.run && state.run.maxWave, 0), finite(state.meta && state.meta.bestWave, 0), finite(state.meta && state.meta.outpost && state.meta.outpost.seenWave, 0), finite(layer && layer.state && layer.state.record, 0)) };
  }
  function items(state) { ensure(state); return state.meta.artifacts.items; }
  function level(state, id) { var it = items(state)[id]; return it && validLevel(it.level) ? it.level : 0; }
  function available(state, id) { var definition = BY_ID[id], p = progress(state); return !!definition && (level(state, id) > 0 || p.prestige >= 1 && p.wave >= definition.wave); }
  function power(definition, n) { return definition.effect === 'merge' ? 1 : definition.maximum * n / (n + 8); }
  function chance(definition, n) { return (definition.chanceMax || 0.06) * n / (n + (definition.chanceKnee || 3)); }
  function recharge(definition, n) { return definition.recharge / (1 + 0.35 * n / (n + 8)); }
  function blank() { var out = {}; for (var id in LIMITS) out[id] = 0; return out; }
  function bounded(value, cap) { return value > 0 ? cap * value / (cap + value) : 0; }
  function rawModifiers(state, options) {
    var owned = items(state), out = blank(), effects = state.run.artifacts.effects;
    for (var id in owned) {
      var it = owned[id], d = BY_ID[id];
      if (!d || !it.enabled || !validLevel(it.level)) continue;
      if (d.kind === 'passive') out[d.effect] += power(d, it.level);
      else if (!(options && options.passiveOnly) && d.kind === 'active' && d.duration && effects[id] && effects[id].left > 0) out[d.effect] += effects[id].power;
    }
    return out;
  }
  function modifiers(state, cfg, options) { var raw = rawModifiers(state, options); for (var key in raw) raw[key] = bounded(raw[key], LIMITS[key]); return raw; }
  /** The same expected critical damage for field blades and equipped weapons, including a reached chance cap. */
  function criticalStats(state, cfg, baseChance, baseMult, options) {
    var mods = modifiers(state, cfg, options), cap = Math.max(0, Math.min(1, finite(cfg && cfg['crit.maxChance'], 1)));
    var base = Math.max(0, Math.min(cap, finite(baseChance, 0)));
    var multiplier = finite(baseMult, 1) * (1 + mods.critMult);
    var chance = Math.min(cap, base + mods.critChance), overflow = Math.max(0, base + mods.critChance - chance);
    if (chance > 0) multiplier += (multiplier - 1) * overflow / chance;
    return { chance: chance, multiplier: multiplier, overflow: cap > 0 ? overflow : 0 };
  }
  function cost(state, cfg, id) {
    var d = BY_ID[id]; if (!d) return null;
    var owned = items(state), count = 0;
    for (var key in owned) if (BY_ID[key] && validLevel(owned[key].level)) count++;
    var n = level(state, id), collection = Math.max(0, count - (n ? 1 : 0));
    var rankGrowth = Math.max(1.01, Math.min(3, finite(cfg && cfg['artifacts.cost.rankGrowth'], 1.55)));
    var collectionGrowth = Math.max(1, Math.min(1.2, finite(cfg && cfg['artifacts.cost.collectionGrowth'], 1.08)));
    return Big.str(Big.ceil(Big.mul(d.baseCost, Big.mul(Big.pow(collectionGrowth, collection), Big.pow(rankGrowth, n)))));
  }
  function fail(reason) { return { ok: false, reason: reason }; }
  function buy(state, cfg, id) {
    ensure(state); var error = validate(state); if (error) return fail(error);
    if (!BY_ID[id]) return fail('Неизвестный артефакт');
    if (!available(state, id)) return fail('Артефакт пока не найден');
    var n = level(state, id), layer = state.layers && state.layers.forge;
    if (n >= 1000000) return fail('Достигнут технический предел уровня');
    var price = cost(state, cfg, id);
    if (!layer || !Big.valid(layer.currency) || !Big.gte(layer.currency, price)) return fail('Не хватает углей');
    layer.state = layer.state || {};
    if (layer.state.spent !== undefined && (!Big.valid(layer.state.spent) || Big.lt(layer.state.spent, 0))) return fail('Некорректный учёт потраченных углей');
    layer.currency = Big.str(Big.sub(layer.currency, price));
    layer.state.spent = Big.str(Big.add(layer.state.spent || 0, price));
    var it = state.meta.artifacts.items[id];
    if (!it) it = state.meta.artifacts.items[id] = { level: 0, enabled: true, cooldown: 0 };
    it.level++;
    return { ok: true, id: id, level: it.level, cost: price };
  }
  function setEnabled(state, id, enabled) {
    var it = items(state)[id];
    if (!BY_ID[id] || !it || !validLevel(it.level)) return fail('Сначала приобретите артефакт');
    if (typeof enabled !== 'boolean') return fail('Некорректное состояние переключателя');
    it.enabled = enabled; return { ok: true, id: id, enabled: enabled };
  }
  function command(d, n) { return { id: d.id, kind: d.effect, value: power(d, n) }; }
  function onTap(state, cfg, rng, context) {
    var out = { commands: [], procs: [] };
    if (!context || context.manual !== true || context.accepted !== true || !rng || typeof rng.next !== 'function') return out;
    var owned = items(state);
    CATALOG.forEach(function (d) {
      var it = owned[d.id];
      if (d.kind !== 'click' || !it || !it.enabled || !validLevel(it.level)) return;
      if (context.can && context.can[d.effect] === false) return;
      if (rng.next() >= chance(d, it.level)) return;
      out.commands.push(command(d, it.level)); out.procs.push(d.id);
    });
    return out;
  }
  function activate(state, cfg, id, context) {
    ensure(state); var error = validate(state); if (error) return fail(error);
    var owned = items(state), d = BY_ID[id], it = owned[id];
    if (!d || d.kind !== 'active' || !it || !validLevel(it.level)) return fail('Сначала приобретите активный артефакт');
    if (!it.enabled) return fail('Артефакт выключен');
    if (it.cooldown > 1e-9) return fail('Артефакт восстанавливается');
    if (context && context.can && context.can[d.effect] === false) return fail('Сейчас нет подходящей цели');
    it.cooldown = recharge(d, it.level);
    var commands = [];
    if (d.duration) state.run.artifacts.effects[id] = { left: d.duration, power: power(d, it.level) };
    else commands.push(command(d, it.level));
    return { ok: true, id: id, cooldown: it.cooldown, duration: d.duration || 0, commands: commands };
  }
  function nextExpiry(state) {
    ensure(state); var next = Infinity, effects = state.run.artifacts.effects;
    for (var id in effects) if (effects[id].left > 0) next = Math.min(next, effects[id].left);
    return next;
  }
  function tick(state, dt) {
    ensure(state); dt = Math.max(0, finite(dt, 0));
    var owned = state.meta.artifacts.items, effects = state.run.artifacts.effects;
    for (var id in owned) if (finite(owned[id].cooldown, 0) > 0) owned[id].cooldown = Math.max(0, owned[id].cooldown - dt);
    for (var key in effects) {
      if (finite(effects[key].left, -1) < 0) continue;
      effects[key].left = Math.max(0, effects[key].left - dt); if (effects[key].left <= 1e-9) delete effects[key];
    }
  }
  function rounded(n) { return Math.round(n * 1000) / 1000; }
  function statText(stat, value) {
    // Feedings are whole: the outpost rounds the bonus the same way.
    if (stat === 'dragonMeals') return { template: LABELS[stat], args: [Math.round(value)] };
    return { template: LABELS[stat], args: [rounded(value * (stat === 'bossSeconds' ? 1 : 100))] };
  }
  var CLICK_TEXT = { merge: 'Шанс слияния: {}% · не более одной пары', forgeSeconds: 'Шанс: {}% · ковка −{} с', goldSaleShare: 'Шанс: {}% · {}% цены клинка',
    dragonCharge: 'Шанс: {}% · заряд +{}', heroCooldown: 'Шанс: {}% · откаты героев −{} с', bossSeconds: 'Шанс: {}% · боссу +{} с',
    shieldFraction: 'Шанс: {}% · снять {}% панциря', suppressSeconds: 'Шанс: {}% · подавление на {} с', petXp: 'Шанс: {}% · питомцу +{} опыта',
    apprenticeSeconds: 'Шанс: {}% · подмастерью −{} с', crySeconds: 'Шанс: {}% · откат клича −{} с', digestSeconds: 'Шанс: {}% · кормление +{} с' };
  function effectText(d, n, raw, oldLevel, enabled) {
    if (!n) return { template: 'Ещё не приобретён', args: [] };
    if (d.kind === 'passive') {
      var current = raw[d.effect] - (enabled && oldLevel ? power(d, oldLevel) : 0) + (enabled ? power(d, n) : 0);
      return statText(d.effect, bounded(current, LIMITS[d.effect]));
    }
    if (d.kind === 'click') return { template: CLICK_TEXT[d.effect], args: [rounded(chance(d, n) * 100), rounded(power(d, n) * (d.effect === 'goldSaleShare' || d.effect === 'shieldFraction' ? 100 : 1))] };
    if (d.duration) return { template: 'Вклад +{}% на {} с · откат {} с', args: [rounded(power(d, n) * 100), d.duration, rounded(recharge(d, n))] };
    return { template: d.effect === 'merge' ? 'Одно слияние · откат {} с' : d.effect === 'heroCooldown' ? 'Откаты героев −{} с · откат {} с' : 'Кормление +{} с · откат {} с',
      args: d.effect === 'merge' ? [rounded(recharge(d, n))] : [rounded(power(d, n)), rounded(recharge(d, n))] };
  }
  function model(state, cfg) {
    var owned = items(state), raw = rawModifiers(state), p = progress(state), layer = state.layers && state.layers.forge;
    var coals = layer && Big.valid(layer.currency) ? Big.str(layer.currency) : '0e0', count = 0, found = 0, next = null;
    var list = CATALOG.map(function (d) {
      var it = owned[d.id], n = level(state, d.id), open = available(state, d.id), price = cost(state, cfg, d.id), enabled = !it || it.enabled;
      if (n) count++; if (open) found++; else if (!next || d.wave < next.wave) next = { wave: d.wave, prestige: 1, title: d.title };
      var current = effectText(d, n, raw, n, enabled), after = effectText(d, n + 1, raw, enabled ? n : 0, true);
      return { id: d.id, title: d.title, kind: d.kind, description: d.description, icon: d.icon, iconSet: 'up', available: open, wave: d.wave,
        level: n, enabled: enabled, cost: price, canBuy: open && Big.gte(coals, price), ready: !!it && enabled && d.kind === 'active' && it.cooldown <= 1e-9,
        cooldown: it ? it.cooldown : 0, remaining: state.run.artifacts.effects[d.id] ? state.run.artifacts.effects[d.id].left : 0,
        current: current, next: after, nextRequiresEnable: !!it && !enabled,
        unlock: { template: p.prestige < 1 ? 'После первой перековки · рекорд {}' : 'Нужен рекорд волны {}', args: [d.wave] } };
    });
    return { coals: coals, items: list, owned: count, availableCount: found, nextUnlock: next, allOwnedActive: true, modifiers: modifiers(state), limits: LIMITS };
  }
  return { CATALOG: CATALOG, LIMITS: LIMITS, LABELS: LABELS, CLICK_TEXT: CLICK_TEXT, ensure: ensure, validate: validate, available: available,
    level: level, cost: cost, buy: buy, setEnabled: setEnabled, activate: activate, modifiers: modifiers, onTap: onTap,
    tick: tick, offline: tick, nextExpiry: nextExpiry, model: model, criticalStats: criticalStats };
});
