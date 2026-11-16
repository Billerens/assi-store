// «Колония на астероиде» — the logic. Drones gnaw an asteroid for ore; icebreakers bring ice;
// buildings turn them into chains: ore → alloys, ice → water → fuel, alloys + ice → electronics →
// data. Energy is a flow (panels, later a reactor): with a deficit every building works at the
// share production / consumption. Data buys the research tree; fuel sends expeditions and, with
// alloys, builds the jump engine. The jump to a new star gives dark matter (ТМ) and the star's
// rule; after the 10th star «Карта скопления» trades ТМ and the meta for beacons and stations.
//
// Shared subset of JavaScript: it runs on the screen (window.GameSim), in the engine (Rhino,
// require) and in node. No class, no async, no f(...args), no for (let …); randomness only from
// ctx.rng; time only from ctx.now. Every number is a key of config.json (cfg).
//
// A step: drones and icebreakers add their flow, then the buildings run in chain order, each
// taking at most its throughput × the energy share × dt and at most what is in stock (shared
// inputs are split by demand), so no stock goes below zero and nothing comes from nothing.
(function (root, make) {
  var node = typeof require === 'function' && typeof exports !== 'undefined';
  var api = node ? make(require('../engine/big.js'), require('../engine/fmt.js'), require('./content/catalog.json')) : make(root.Big, root.Fmt, root.ColonyContent);
  if (typeof exports !== 'undefined') { for (var k in api) exports[k] = api[k]; } else { root.GameSim = api; }
})(this, function (Big, Fmt, catalog) {
  'use strict';

  var JUMP = 'jump';
  var CLUSTER = 'cluster';

  // ---- content ----

  var DRONES = [
    { title: 'Скребок', need: null },
    { title: 'Бурильщик', need: null },
    { title: 'Буксир', need: 'grab' },
    { title: 'Резак', need: 'grab' },
    { title: 'Дробилка', need: 'crush' },
    { title: 'Плазменный резак', need: 'crush' },
    { title: 'Гравизахват', need: 'gravity' },
    { title: 'Рой', need: 'gravity' }
  ];

  var BREAKERS = [
    { title: 'Ледокол' },
    { title: 'Термобур' },
    { title: 'Испаритель' }
  ];

  // Buildings in chain order: input → output (ratio from config), the research they need.
  var BUILDINGS = [
    { id: 'smelter', title: 'Плавильня', from: 'ore', to: 'alloy', need: 'smelt', text: '10 руды → 1 сплав' },
    { id: 'purifier', title: 'Водоочистка', from: 'ice', to: 'water', need: 'purify', text: '2 льда → 1 вода' },
    { id: 'electro', title: 'Электролиз', from: 'water', to: 'fuel', need: 'electro', text: '3 воды → 1 топливо' },
    { id: 'factory', title: 'Фабрика электроники', from: 'alloy', to: 'chip', need: 'factory', text: '5 сплавов + 5 льда → 1 электроника' },
    { id: 'lab', title: 'Лаборатория', from: 'chip', to: 'data', need: 'lab', text: '1 электроника → 4 данных' }
  ];

  var RESOURCES = [
    { id: 'ore', title: 'Руда' },
    { id: 'ice', title: 'Лёд' },
    { id: 'alloy', title: 'Сплавы' },
    { id: 'water', title: 'Вода' },
    { id: 'fuel', title: 'Топливо' },
    { id: 'chip', title: 'Электроника' },
    { id: 'data', title: 'Данные' }
  ];

  // The research tree: cost key in config, the currency (ore for the first three), the parents.
  var RESEARCH = [
    { id: 'grab', title: 'Захваты', text: 'буксиры и резаки', cur: 'ore', after: [] },
    { id: 'smelt', title: 'Плавка', text: 'плавильня, сплавы, корпуса дронов', cur: 'ore', after: [] },
    { id: 'ice', title: 'Лёд', text: 'ледоколы, фабрика электроники и лаборатория', cur: 'ore', after: [] },
    { id: 'purify', title: 'Водоочистка', text: 'вода', cur: 'data', after: ['ice'] },
    { id: 'dome', title: 'Купол', text: 'колонисты: доход ×(1 + 0,04 за колониста)', cur: 'data', after: ['purify'] },
    { id: 'electro', title: 'Электролиз', text: 'топливо, ангар и экспедиции', cur: 'data', after: ['purify'] },
    { id: 'crush', title: 'Дробление', text: 'дробилки и плазменные резаки', cur: 'data', after: ['grab'] },
    { id: 'chips', title: 'Микросхемы', text: 'электроника ×2', cur: 'data', after: ['crush'] },
    { id: 'reactor', title: 'Реактор', text: 'второй источник энергии, не зависит от звезды', cur: 'data', after: ['electro'] },
    { id: 'gravity', title: 'Гравитация', text: 'гравизахваты и рой', cur: 'data', after: ['crush'] },
    { id: 'dispatch', title: 'Диспетчер дронов', text: 'автопокупка дронов', cur: 'data', after: ['gravity'] },
    { id: 'autosmelt', title: 'Автоплавка', text: 'здания сами поднимают уровень при избытке энергии', cur: 'data', after: ['reactor'] },
    { id: 'far', title: 'Дальняя связь', text: 'экспедиции на час и на 4 часа', cur: 'data', after: ['electro'] },
    { id: 'jump', title: 'Прыжковая теория', text: 'прыжковый двигатель', cur: 'data', after: ['reactor'] }
  ];
  // The factory and the lab need «Плавка» and «Лёд» both (not a node of the tree).
  var NEEDS = { smelter: ['smelt'], purifier: ['purify'], electro: ['electro'], factory: ['smelt', 'ice'], lab: ['smelt', 'ice'] };

  // Expeditions: minutes and fuel are config keys by index.
  var EXPEDITIONS = [
    { id: 'short', title: 'Ближний облёт', far: false },
    { id: 'mid', title: 'Пояс обломков', far: false },
    { id: 'long', title: 'Соседний астероид', far: true },
    { id: 'deep', title: 'Дальний рейс', far: true }
  ];

  // Samples of the collection: kind — what the bonus raises, pct — percent (forever).
  var SAMPLES = [
    { id: 'chondrite', title: 'Железный хондрит', kind: 'ore', pct: 5 },
    { id: 'stoneice', title: 'Каменный лёд', kind: 'ice', pct: 8 },
    { id: 'glass', title: 'Метеоритное стекло', kind: 'energy', pct: 5 },
    { id: 'olivine', title: 'Кристалл оливина', kind: 'alloy', pct: 6 },
    { id: 'darkdust', title: 'Тёмная пыль', kind: 'data', pct: 4 },
    { id: 'debris', title: 'Обломок спутника', kind: 'container', pct: 10 },
    { id: 'seeds', title: 'Капсула с семенами', kind: 'colony', pct: 10 },
    { id: 'magnet', title: 'Магнитный камень', kind: 'ore', pct: 3 },
    { id: 'ringdust', title: 'Кольцевая крошка', kind: 'ice', pct: 4 },
    { id: 'stardust', title: 'Звёздный песок', kind: 'energy', pct: 6 },
    { id: 'signal', title: 'Древний сигнал', kind: 'data', pct: 10 },
    { id: 'amber', title: 'Чёрный янтарь', kind: 'ore', pct: 10 }
  ];
  var KIND = { ore: 'к руде', ice: 'ко льду', energy: 'к энергии', alloy: 'к сплавам', data: 'к данным', container: 'к контейнерам', colony: 'к куполу' };

  // Stars by number; 10+ — one of the passed (2..9) with its rule doubled.
  var STARS = [
    { id: 'yellow', title: 'Жёлтый карлик', text: 'обычная' },
    { id: 'red', title: 'Красный карлик', text: 'панели ×0,4, лёд ×3 — первым становится реактор' },
    { id: 'blue', title: 'Голубой гигант', text: 'панели ×3, но вспышки выключают здания на 20 с' },
    { id: 'white', title: 'Белый карлик', text: 'руда ×2, лёд ×0,5' },
    { id: 'nebula', title: 'Туманность', text: 'данные ×3, дроны дороже на 20 %' },
    { id: 'binary', title: 'Двойная звезда', text: 'две колонии на одном экране, ресурсы общие' },
    { id: 'pulsar', title: 'Пульсар', text: 'энергия пульсирует; касание в пик — ×2 энергии на 10 с' },
    { id: 'neutron', title: 'Нейтронная звезда', text: 'дроны изнашиваются, ремонт за сплавы, зато ×5' },
    { id: 'hole', title: 'Окрестность чёрной дыры', text: 'время в колонии идёт ×2, офлайн ×2' }
  ];

  // Meta upgrades for ТМ: price ceil(c0 · 1.6^level), c0 and max in config; max 0 — no ceiling.
  var META = [
    { id: 'mine', title: 'Добыча', text: 'руда ×1,5 за уровень' },
    { id: 'research', title: 'Стартовые исследования', text: 'по три узла дерева за уровень с начала колонии' },
    { id: 'build', title: 'Дешёвые здания', text: 'здания дешевле на 25 % за уровень' },
    { id: 'exp', title: 'Быстрые экспедиции', text: 'экспедиции на 15 % быстрее за уровень' },
    { id: 'offline', title: 'Ночная смена', text: 'офлайн 0,5 → 1,0 (+0,1 за уровень)' },
    { id: 'colonists', title: 'Стартовые колонисты', text: '+5 колонистов и уровень купола за уровень' },
    { id: 'memory', title: 'Память дронов', text: 'после прыжка остаётся 10 % дронов за уровень' }
  ];

  // Stations of «Карта скопления» for beacons: a bonus in every next colony.
  var STATIONS = [
    { id: 'ore', title: 'Рудная станция', text: 'руда ×2 за уровень' },
    { id: 'ice', title: 'Ледовая станция', text: 'лёд ×2 за уровень' },
    { id: 'sun', title: 'Солнечная станция', text: 'энергия +50 % за уровень' },
    { id: 'lab', title: 'Научная станция', text: 'данные ×2 за уровень' },
    { id: 'dock', title: 'Док', text: 'контейнеры экспедиций ×2 за уровень' }
  ];

  // Online events, every 2–3 minutes; `need` — a check of the colony; `w` — weight.
  var EVENTS = [
    { id: 'meteor', title: 'Метеоритный дождь', text: '+3 минуты руды', take: 'Собрать', w: 10 },
    { id: 'comet', title: 'Комета рядом', text: 'лёд ×5 на 60 с', take: 'Ловить', w: 8, need: 'ice' },
    { id: 'flare', title: 'Солнечная вспышка', text: 'панели ×3 на 30 с', take: 'Развернуть панели', w: 8, need: 'panels' },
    { id: 'wreck', title: 'Обломок станции', text: 'сплавы сразу', take: 'Разобрать', w: 8, need: 'smelt' },
    { id: 'signal', title: 'Сигнал', text: 'образец в коллекцию (10 %) или данные', take: 'Расшифровать', w: 8 },
    { id: 'fault', title: 'Сбой дрона', text: 'ремонт за сплавы: +10 % тиру навсегда', take: 'Починить', skip: 'Пропустить', w: 8, need: 'smelt' },
    { id: 'truck', title: 'Попутный грузовик', text: 'половину льда — за руду по двойному курсу колонии, до 10 минут добычи', take: 'Продать', skip: 'Оставить', w: 6, need: 'ice' },
    { id: 'dust', title: 'Пылевая буря', text: 'здания ×0,5 и дроны ×3 на 30 с', take: 'Переждать', w: 8 },
    { id: 'settlers', title: 'Новые колонисты', text: '+5 колонистов, если есть место', take: 'Принять', w: 6, need: 'dome' },
    { id: 'swarm', title: 'Рой микрометеоров', text: 'купол укреплён: +1 уровень бесплатно', take: 'Укрепить', w: 5, need: 'dome' },
    { id: 'link', title: 'Сбой связи', text: 'экспедиция возвращается вдвое быстрее', take: 'Перенастроить', w: 6, need: 'exp' },
    { id: 'vein', title: 'Рудная жила', text: 'один тир дронов ×4 на 60 с', take: 'Направить дронов', w: 8 },
    { id: 'mirror', title: 'Зеркальный астероид', text: 'следующее исследование вдвое дешевле', take: 'Изучить', w: 6 },
    { id: 'clot', title: 'Тёмный сгусток', text: '+1 ТМ', take: 'Поймать', w: 1 },
    { id: 'calm', title: 'Тихий час', text: 'энергия без дефицита 2 минуты', take: 'Отдохнуть', w: 6, need: 'buildings' }
  ];

  var ACH = { smelter: 'first-smelter', chain: 'full-chain', hundred: 'hundred-colonists', calm: 'no-deficit', jump: 'first-jump', five: 'five-stars', binary: 'binary-star', collector: 'collector' };

  if (catalog) {
    DRONES = catalog.DRONES || DRONES;
    BREAKERS = catalog.BREAKERS || BREAKERS;
    BUILDINGS = catalog.BUILDINGS || BUILDINGS;
    RESOURCES = catalog.RESOURCES || RESOURCES;
    RESEARCH = catalog.RESEARCH || RESEARCH;
    EXPEDITIONS = catalog.EXPEDITIONS || EXPEDITIONS;
    SAMPLES = catalog.SAMPLES || SAMPLES;
    STARS = catalog.STARS || STARS;
    META = catalog.META || META;
    STATIONS = catalog.STATIONS || STATIONS;
    EVENTS = catalog.EVENTS || EVENTS;
  }

  function find(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  function num(v, d) {
    var n = Number(v);
    return v === undefined || v === null || !isFinite(n) ? d : n;
  }

  // ---- the parts of the state ----

  function zeros(n) {
    var a = [];
    for (var i = 0; i < n; i++) a.push(0);
    return a;
  }

  function freshRun(cfg, now) {
    return {
      ore: Big.str(Big.of(cfg ? cfg['start.ore'] : 10)), mined: '0e0',
      ice: 0, alloy: 0, water: 0, fuel: 0, chip: 0, data: 0,
      drones: zeros(DRONES.length), drones2: zeros(DRONES.length), breakers: zeros(BREAKERS.length), hulls: zeros(DRONES.length),
      up: 0, b: { smelter: 0, purifier: 0, electro: 0, factory: 0, lab: 0 }, off: {},
      panels: 0, reactor: 0, dome: 0, colonists: 0, hangar: 0,
      research: {}, queue: [], mirror: false,
      exps: [], containers: [], engine: false,
      buffs: {}, vein: null, event: null, eventAt: 0,
      wear: 0, deficitSec: 0, calmSec: 0, work: {}, flow: {}, auto: { dispatch: true, smelt: true },
      start: now || 0, bought: { drones: 0, levels: 0, research: [], expeditions: 0 }
    };
  }

  function jumpState() {
    return { star: 1, rule: null, total: 0, meta: {} };
  }

  function L(state, id) { return state.layers[id] || { currency: '0e0', count: 0, state: {} }; }

  function js(state) {
    var l = state.layers[JUMP];
    if (!l) return jumpState();
    var s = l.state || (l.state = {});
    if (typeof s.star !== 'number' || s.star < 1) s.star = 1;
    if (!Big.valid(s.total)) s.total = 0;
    if (!s.meta || typeof s.meta !== 'object') s.meta = {};
    if (s.rule === undefined) s.rule = null;
    return s;
  }

  function clusterState(state) {
    var l = state.layers[CLUSTER];
    if (!l) return { stations: {} };
    var s = l.state || (l.state = {});
    if (!s.stations || typeof s.stations !== 'object') s.stations = {};
    return s;
  }

  function meta(state) {
    var m = state.meta;
    if (!m.samples || typeof m.samples !== 'object') m.samples = {};
    if (!m.atlas || typeof m.atlas !== 'object') m.atlas = {};
    if (!Array.isArray(m.tierBoost) || m.tierBoost.length !== DRONES.length) m.tierBoost = zeros(DRONES.length);
    if (typeof m.jumps !== 'number') m.jumps = 0;
    if (typeof m.bestStar !== 'number') m.bestStar = 1;
    return m;
  }

  function lvl(state, id) { return num(js(state).meta[id], 0); }

  function station(state, id) { return num(clusterState(state).stations[id], 0); }

  function dm(state) { return compact(Big.of(L(state, JUMP).currency, 0)); }

  function beacons(state) { return compact(Big.of(L(state, CLUSTER).currency, 0)); }

  function has(state, id) { return !!state.run.research[id]; }

  function buff(state, name, now) { return num(state.run.buffs[name], 0) > now; }

  // ---- the star ----

  /** The star now: {n, id, title, text, double}. */
  function star(state) {
    var s = js(state);
    var n = s.star;
    if (n <= STARS.length) {
      var x = STARS[n - 1];
      return { n: n, id: x.id, title: x.title, text: x.text, double: false };
    }
    var id = s.rule && find(STARS, s.rule) ? s.rule : 'red';
    var y = find(STARS, id);
    return { n: n, id: id, title: y.title + ' (удвоенное правило)', text: y.text, double: true };
  }

  /** A star multiplier: the rule's number, squared when the rule is doubled. */
  function starMult(state, cfg, key) {
    var s = star(state);
    var k = 'star.' + s.id + '.' + key;
    if (cfg[k] === undefined) return 1;
    return s.double ? Math.pow(cfg[k], 2) : cfg[k];
  }

  function isStar(state, id) { return star(state).id === id; }

  /** Time in the colony: ×2 by a black hole (×4 doubled). */
  function timeMult(state, cfg) { return isStar(state, 'hole') ? starMult(state, cfg, 'time') : 1; }

  // ---- bonuses ----

  function sampleBonus(state, kind, cfg) {
    var m = meta(state);
    var b = 0;
    SAMPLES.forEach(function (x) { if (x.kind === kind && m.samples[x.id]) b += (cfg && cfg['sample.' + x.id + '.pct'] !== undefined ? cfg['sample.' + x.id + '.pct'] : x.pct) / 100; });
    return 1 + b;
  }

  function colonistMult(state, cfg) {
    return 1 + cfg['colony.bonus'] * state.run.colonists;
  }

  function milestones(cfg) {
    return String(cfg['drone.milestones']).split(',').map(Number).filter(function (n) { return n > 0; });
  }

  // After the list ends the milestones go on: one every drone.milestoneEvery drones (0 switches
  // that off, the list is then the whole of it). The income is a plain number, so the count stops
  // at PAST_MAX — far beyond any colony: the ore for that many drones does not fit into a number.
  var PAST_MAX = 200;

  function milestonesPast(n, cfg) {
    var list = milestones(cfg);
    var every = cfg['drone.milestoneEvery'] || 0;
    var last = list.length ? list[list.length - 1] : 0;
    return every > 0 && n > last ? Math.min(PAST_MAX, Math.floor((n - last) / every)) : 0;
  }

  function milestoneMult(n, cfg) {
    var m = 1;
    milestones(cfg).forEach(function (x) { if (n >= x) m *= cfg['drone.milestoneMult']; });
    return m * Math.pow(cfg['drone.milestoneMult'], milestonesPast(n, cfg));
  }

  function nextMilestone(n, cfg) {
    var list = milestones(cfg);
    for (var i = 0; i < list.length; i++) if (list[i] > n) return list[i];
    var every = cfg['drone.milestoneEvery'] || 0;
    if (!(every > 0) || milestonesPast(n, cfg) >= PAST_MAX) return null;
    return (list.length ? list[list.length - 1] : 0) + (milestonesPast(n, cfg) + 1) * every;
  }

  // ---- drones: ore and ice ----

  function droneOpen(state, i) {
    var need = DRONES[i].need;
    if (need && !has(state, need)) return false;
    return i === 0 || state.run.drones[i - 1] > 0 || state.run.drones[i] > 0;
  }

  /** Ore a second of tier i per drone (the tier's own multipliers). */
  function tierRate(state, i, n, cfg, now) {
    var r = state.run;
    var m = cfg['drone.rate'] * Math.pow(cfg['drone.rateGrowth'], i) * milestoneMult(n, cfg) * Math.pow(cfg['hull.mult'], r.hulls[i]);
    m *= 1 + meta(state).tierBoost[i];
    if (r.vein && r.vein.tier === i && r.vein.until > now) m *= cfg['event.vein.mult'];
    return m;
  }

  /** Multipliers of all the ore (and, partly, of the ice). */
  function oreMult(state, cfg, now) {
    var r = state.run;
    var m = Math.pow(cfg['upgrade.mult'], r.up) * colonistMult(state, cfg) * Math.pow(cfg['meta.mine.mult'], lvl(state, 'mine'));
    m *= starMult(state, cfg, 'ore') * sampleBonus(state, 'ore', cfg) * Math.pow(cfg['station.ore.mult'], station(state, 'ore'));
    if (buff(state, 'dust', now)) m *= cfg['event.dust.drones'];
    if (isStar(state, 'neutron')) m *= starMult(state, cfg, 'drones') * (1 - Math.min(1, r.wear) * cfg['wear.penalty']);
    return m * timeMult(state, cfg) * (cfg['dm.bonus'] ? 1 + dm(state) * cfg['dm.bonus'] : 1) * (cfg['cluster.bonus'] ? 1 + beacons(state) * cfg['cluster.bonus'] : 1);
  }

  /** Ore a second (without the links' multiplier and the offline share). */
  function oreRate(state, cfg, now) {
    var r = state.run;
    var sum = 0;
    for (var i = 0; i < DRONES.length; i++) {
      if (r.drones[i] > 0) sum += r.drones[i] * tierRate(state, i, r.drones[i], cfg, now);
      if (r.drones2[i] > 0) sum += r.drones2[i] * tierRate(state, i, r.drones2[i], cfg, now) * (star(state).double && isStar(state, 'binary') ? cfg['star.binary.double'] : 1);
    }
    return sum * oreMult(state, cfg, now);
  }

  function iceRate(state, cfg, now) {
    var r = state.run;
    var sum = 0;
    for (var j = 0; j < BREAKERS.length; j++) if (r.breakers[j] > 0) sum += r.breakers[j] * cfg['breaker.rate'] * Math.pow(cfg['breaker.rateGrowth'], j);
    var m = colonistMult(state, cfg) * starMult(state, cfg, 'ice') * sampleBonus(state, 'ice', cfg) * Math.pow(cfg['station.ice.mult'], station(state, 'ice'));
    if (buff(state, 'comet', now)) m *= cfg['event.comet.mult'];
    if (buff(state, 'dust', now)) m *= cfg['event.dust.drones'];
    return sum * m * timeMult(state, cfg);
  }

  function droneCostMult(state, cfg) { return starMult(state, cfg, 'droneCost'); }

  function droneCost(state, i, cfg, count, second) {
    var base = Big.mul(cfg['drone.cost'], Big.pow(cfg['drone.costGrowth'], i));
    base = Big.mul(base, droneCostMult(state, cfg));
    var owned = second ? state.run.drones2[i] : state.run.drones[i];
    return Big.costGeom(base, cfg['drone.growth'], owned, count || 1);
  }

  function breakerCost(state, j, cfg, count) {
    var base = Big.mul(cfg['breaker.cost'], Big.pow(cfg['breaker.costGrowth'], j));
    return Big.costGeom(base, cfg['breaker.growth'], state.run.breakers[j], count || 1);
  }

  function pay(state, price) {
    if (Big.lt(state.run.ore, price)) return false;
    state.run.ore = Big.str(Big.sub(state.run.ore, price));
    return true;
  }

  function compact(value) {
    var n = Big.toNumber(value);
    return n < 1e15 && isFinite(n) ? n : Big.str(value);
  }

  function addRes(state, res, amount) { state.run[res] = compact(Big.add(state.run[res], amount)); }

  function takeRes(state, res, want) {
    var amount = Big.min(state.run[res], Math.max(0, want));
    state.run[res] = compact(Big.max(0, Big.sub(state.run[res], amount)));
    return Big.toNumber(amount);
  }

  function payRes(state, res, amount) {
    if (Big.lt(state.run[res], amount)) return false;
    state.run[res] = compact(Big.max(0, Big.sub(state.run[res], amount)));
    return true;
  }

  /** How many: 'one' 1, 'ten' 10, 'mile' to the next milestone, 'max' as much as the ore buys. */
  function droneCount(state, i, cfg, how, second) {
    var n = second ? state.run.drones2[i] : state.run.drones[i];
    if (how === 'ten') return 10;
    if (how === 'mile') return Math.max(1, (nextMilestone(n, cfg) || n + 1) - n);
    if (how === 'max') {
      var base = Big.mul(Big.mul(cfg['drone.cost'], Big.pow(cfg['drone.costGrowth'], i)), droneCostMult(state, cfg));
      return Math.max(1, Big.maxBuy(state.run.ore, base, cfg['drone.growth'], n));
    }
    return 1;
  }

  function buyDrone(state, i, cfg, count, second) {
    count = count || 1;
    if (!isFinite(count) || count < 1 || count % 1 || !DRONES[i]) return 0;
    if (!droneOpen(state, i)) return 0;
    if (second && !isStar(state, 'binary')) return 0;
    if (!pay(state, droneCost(state, i, cfg, count, second))) return 0;
    if (second) state.run.drones2[i] += count;
    else state.run.drones[i] += count;
    return count;
  }

  function breakerOpen(state, j) { return has(state, 'ice') && (j === 0 || state.run.breakers[j - 1] > 0 || state.run.breakers[j] > 0); }

  function buyBreaker(state, j, cfg, count) {
    count = count || 1;
    if (!isFinite(count) || count < 1 || count % 1 || !BREAKERS[j]) return 0;
    if (!breakerOpen(state, j)) return 0;
    if (!pay(state, breakerCost(state, j, cfg, count))) return 0;
    state.run.breakers[j] += count;
    return count;
  }

  /** The best drone now: the most ore a second per ore spent; second — in the second colony. */
  function bestDrone(state, cfg, now, second) {
    var best = -1;
    var score = -1;
    var list = second ? state.run.drones2 : state.run.drones;
    for (var i = 0; i < DRONES.length; i++) {
      if (!droneOpen(state, i)) continue;
      var n = list[i];
      var gain = (n + 1) * tierRate(state, i, n + 1, cfg, now) - n * tierRate(state, i, n, cfg, now);
      var s = gain / Big.toNumber(droneCost(state, i, cfg, 1, second));
      if (s > score) {
        score = s;
        best = i;
      }
    }
    return best;
  }

  function hullCost(state, i, cfg) { return cfg['hull.cost'] * Math.pow(cfg['hull.growth'], state.run.hulls[i]) * Math.pow(cfg['hull.tierGrowth'], i); }

  function buyHull(state, i, cfg) {
    if (!has(state, 'smelt') || state.run.drones[i] + state.run.drones2[i] === 0) return false;
    if (!payRes(state, 'alloy', hullCost(state, i, cfg))) return false;
    state.run.hulls[i]++;
    return true;
  }

  function upgradeCost(state, cfg) { return Big.mul(cfg['upgrade.cost'], Big.pow(cfg['upgrade.growth'], state.run.up)); }

  function buyUpgrade(state, cfg) {
    if (!pay(state, upgradeCost(state, cfg))) return false;
    state.run.up++;
    return true;
  }

  // ---- buildings and energy ----

  function buildingOpen(state, id) {
    var need = NEEDS[id];
    if (!need) return false;
    for (var i = 0; i < need.length; i++) if (!has(state, need[i])) return false;
    return true;
  }

  function buildMult(state, cfg) { return Math.pow(1 - cfg['meta.build.step'], lvl(state, 'build')); }

  function buildingCost(state, id, cfg) {
    return Big.mul(Big.mul(cfg['b.' + id + '.cost'], Big.pow(cfg['b.growth'], state.run.b[id])), buildMult(state, cfg));
  }

  /** Throughput of a building at level l, input units a second (before energy). */
  function throughput(id, l, cfg) { return l > 0 ? cfg['b.' + id + '.t'] * Math.pow(cfg['b.tGrowth'], l - 1) : 0; }

  function consumption(id, l, cfg) { return l > 0 ? cfg['b.' + id + '.e'] * Math.pow(cfg['b.eGrowth'], l - 1) : 0; }

  function buyBuilding(state, id, cfg) {
    if (!buildingOpen(state, id)) return false;
    if (!pay(state, buildingCost(state, id, cfg))) return false;
    state.run.b[id]++;
    return true;
  }

  function panelCost(state, cfg) { return Big.mul(cfg['panel.cost'], Big.pow(cfg['panel.costGrowth'], state.run.panels)); }

  function buyPanel(state, cfg) {
    if (!pay(state, panelCost(state, cfg))) return false;
    state.run.panels++;
    return true;
  }

  function reactorCost(state, cfg) { return Big.mul(cfg['reactor.cost'], Big.pow(cfg['reactor.costGrowth'], state.run.reactor)); }

  function buyReactor(state, cfg) {
    if (!has(state, 'reactor') || !pay(state, reactorCost(state, cfg))) return false;
    state.run.reactor++;
    return true;
  }

  /** The pulsar's wave now (1 ± amplitude); offline — its average, 1. */
  function pulse(state, cfg, now, offline) {
    if (!isStar(state, 'pulsar')) return 1;
    var t = (now - state.run.start) / 1000;
    var amp = Math.min(cfg['star.pulsar.maxAmp'], cfg['star.pulsar.amp'] * (star(state).double ? 2 : 1));
    return 1 + amp * Math.sin(2 * Math.PI * t / cfg['star.pulsar.period']);
  }

  /** Energy production now: panels by the star, the reactor not. */
  function energyProd(state, cfg, now, offline) {
    var r = state.run;
    var panels = r.panels > 0 ? cfg['panel.power'] * Math.pow(cfg['panel.growth'], r.panels - 1) * starMult(state, cfg, 'panels') : 0;
    if (buff(state, 'flare', now)) panels *= cfg['event.flare.mult'];
    var reactor = r.reactor > 0 ? cfg['reactor.power'] * Math.pow(cfg['reactor.growth'], r.reactor - 1) : 0;
    var e = (panels + reactor) * sampleBonus(state, 'energy', cfg) * (1 + cfg['station.sun.add'] * station(state, 'sun'));
    e *= pulse(state, cfg, now, offline);
    if (buff(state, 'peak', now)) e *= cfg['star.pulsar.tapMult'];
    return e;
  }

  function energyUse(state, cfg) {
    var r = state.run;
    var u = 0;
    BUILDINGS.forEach(function (b) { if (!r.off[b.id]) u += consumption(b.id, r.b[b.id], cfg); });
    return u;
  }

  /** The share the buildings work at: production / consumption (1 when enough or in a calm hour). */
  function energyShare(state, cfg, now, offline) {
    var use = energyUse(state, cfg);
    if (!(use > 0) || buff(state, 'calm', now)) return 1;
    return Math.min(1, energyProd(state, cfg, now, offline) / use);
  }

  /** The share of [t0, t1] (ms) free of the blue giant's flares: buildings are off in them. */
  function flareFree(state, cfg, t0, t1) {
    if (!isStar(state, 'blue') || !(t1 > t0)) return 1;
    var period = cfg['star.blue.every'] * 1000;
    var len = cfg['star.blue.flare'] * 1000 * (star(state).double ? 2 : 1);
    var start = state.run.start;
    var off = 0;
    var k = Math.floor((t0 - start) / period);
    for (var guard = 0; guard < 10000; guard++) {
      var a = start + k * period;
      var b = a + len;
      if (a >= t1) break;
      off += Math.max(0, Math.min(b, t1) - Math.max(a, t0));
      k++;
    }
    return 1 - off / (t1 - t0);
  }

  // ---- research ----

  function researchOpen(state, id) {
    var x = find(RESEARCH, id);
    if (!x || has(state, id)) return false;
    for (var i = 0; i < x.after.length; i++) if (!has(state, x.after[i])) return false;
    return true;
  }

  function researchCost(state, id, cfg) {
    var c = cfg['r.' + id];
    if (state.run.mirror) c *= cfg['event.mirror.mult'];
    return c;
  }

  function research(state, id, cfg) {
    var x = find(RESEARCH, id);
    if (!researchOpen(state, id)) return false;
    var c = researchCost(state, id, cfg);
    if (x.cur === 'ore') {
      if (!pay(state, Big.of(c))) return false;
    } else if (!payRes(state, 'data', c)) return false;
    state.run.research[id] = true;
    state.run.mirror = false;
    if (id === 'electro' && state.run.hangar < 1) state.run.hangar = 1;
    var q = state.run.queue.indexOf(id);
    if (q >= 0) state.run.queue.splice(q, 1);
    return true;
  }

  /** Puts a research in the queue: the lab closes it when the data is there (offline too). */
  function enqueue(state, id) {
    if (has(state, id) || state.run.queue.indexOf(id) >= 0 || !find(RESEARCH, id)) return false;
    state.run.queue.push(id);
    return true;
  }

  // ---- colony: dome, colonists, upgrades ----

  function domeCap(state, cfg) {
    var r = state.run;
    if (r.dome < 1) return 0;
    return Math.floor(cfg['dome.cap'] * Math.pow(cfg['dome.capGrowth'], r.dome - 1) * sampleBonus(state, 'colony', cfg));
  }

  function domeCost(state, cfg) { return cfg['dome.cost'] * Math.pow(cfg['dome.growth'], state.run.dome); }

  function buyDome(state, cfg) {
    if (!has(state, 'dome') || !payRes(state, 'alloy', domeCost(state, cfg))) return false;
    state.run.dome++;
    return true;
  }

  function hangarCost(state, cfg) { return Big.mul(cfg['hangar.cost'], Big.pow(cfg['hangar.growth'], state.run.hangar)); }

  function buyHangar(state, cfg) {
    if (!has(state, 'electro') || !pay(state, hangarCost(state, cfg))) return false;
    state.run.hangar++;
    return true;
  }

  // ---- expeditions ----

  function expOpen(state, k) {
    if (!has(state, 'electro')) return false;
    return !EXPEDITIONS[k].far || has(state, 'far');
  }

  function expMinutes(state, k, cfg) {
    var m = cfg['exp.' + EXPEDITIONS[k].id + '.min'] * Math.pow(1 - cfg['meta.exp.step'], lvl(state, 'exp'));
    return Math.max(cfg['exp.minMinutes'], m);
  }

  function expFuel(state, k, cfg) { return cfg['exp.' + EXPEDITIONS[k].id + '.fuel']; }

  function expedition(state, k, cfg, now) {
    var r = state.run;
    if (!EXPEDITIONS[k] || !expOpen(state, k) || r.exps.length >= r.hangar || r.exps.length + r.containers.length >= cfg['exp.maxContainers']) return false;
    if (!payRes(state, 'fuel', expFuel(state, k, cfg))) return false;
    var ms = expMinutes(state, k, cfg) * 60000;
    r.exps.push({ k: k, from: now, until: now + ms });
    r.bought.expeditions = num(r.bought.expeditions, 0) + 1;
    return true;
  }

  /** The expedition came back: a container with ore of N minutes, maybe a sample, rarely ТМ. */
  function expBack(state, e, cfg, rng, now) {
    var r = state.run;
    var x = EXPEDITIONS[e.k];
    var minutes = cfg['exp.' + x.id + '.min'];
    var rate = oreRate(state, cfg, now);
    var mult = sampleBonus(state, 'container', cfg) * Math.pow(cfg['station.dock.mult'], station(state, 'dock'));
    var c = { k: e.k, title: x.title, ore: Big.str(Big.of(Math.max(cfg['start.ore'], rate * minutes * 60 * cfg['exp.oreShare'] * mult))), at: now };
    c.ice = Math.round(iceRate(state, cfg, now) * minutes * 60 * cfg['exp.oreShare'] * mult);
    if (rng && rng.chance(cfg['exp.' + x.id + '.sample'])) c.sample = pickSample(state, rng, cfg);
    if (rng && rng.chance(cfg['exp.' + x.id + '.dm'])) c.dm = 1;
    r.containers.push(c);
    return c;
  }

  function pickSample(state, rng, cfg) {
    var m = meta(state);
    var missing = SAMPLES.filter(function (s) { return !m.samples[s.id]; });
    var s = missing.length && rng.chance(cfg['sample.missingChance']) ? rng.pick(missing) : rng.pick(SAMPLES);
    return s.id;
  }

  /** Takes a container: ore, ice, the sample into the collection, ТМ. Returns it or null. */
  function takeContainer(state, index) {
    var r = state.run;
    var c = r.containers[index || 0];
    if (!c) return null;
    r.containers.splice(index || 0, 1);
    earnOre(state, Big.of(c.ore), false);
    addRes(state, 'ice', c.ice || 0);
    if (c.sample) meta(state).samples[c.sample] = num(meta(state).samples[c.sample], 0) + 1;
    if (c.dm) addDm(state, c.dm);
    return c;
  }

  function addDm(state, n) {
    var l = state.layers[JUMP];
    if (!l) return;
    l.currency = Big.str(Big.add(Big.of(l.currency, 0), n));
    js(state).total = compact(Big.add(js(state).total, n));
  }

  function earnOre(state, amount, mined) {
    state.run.ore = Big.str(Big.add(state.run.ore, amount));
    if (mined) state.run.mined = Big.str(Big.add(state.run.mined, amount));
  }

  // ---- the jump engine ----

  function engineReady(state, cfg) {
    var r = state.run;
    return has(state, 'jump') && Big.gte(r.fuel, cfg['engine.fuel']) && Big.gte(r.alloy, cfg['engine.alloy']);
  }

  function buildEngine(state, cfg) {
    if (state.run.engine || !engineReady(state, cfg)) return false;
    payRes(state, 'fuel', cfg['engine.fuel']);
    payRes(state, 'alloy', cfg['engine.alloy']);
    state.run.engine = true;
    return true;
  }

  /** Chains working: buildings that produced in the last step. */
  function chains(state) {
    var n = 0;
    BUILDINGS.forEach(function (b) { if (state.run.work[b.id]) n++; });
    return n;
  }

  // ---- neutron star wear ----

  function repairCost(state, cfg) {
    var n = 0;
    for (var i = 0; i < DRONES.length; i++) n += state.run.drones[i] + state.run.drones2[i];
    return Math.max(cfg['wear.repairMin'], n * cfg['wear.repairPer']);
  }

  function repair(state, cfg) {
    if (!isStar(state, 'neutron') || state.run.wear <= 0) return false;
    if (!payRes(state, 'alloy', repairCost(state, cfg))) return false;
    state.run.wear = 0;
    return true;
  }

  /** The pulsar tap: at the peak of the wave energy ×2 for 10 s. */
  function tapPeak(state, cfg, now) {
    if (!isStar(state, 'pulsar') || pulse(state, cfg, now, false) < cfg['star.pulsar.peak']) return false;
    state.run.buffs.peak = now + cfg['star.pulsar.tapSec'] * 1000;
    return true;
  }

  // ---- automation ----

  function auto(state, cfg, now, offline) {
    var r = state.run;
    var got = { drones: 0, levels: 0, research: [] };
    // The research queue: the lab closes what the data covers.
    var guard = 0;
    while (r.queue.length && guard++ < 20) {
      var id = r.queue[0];
      if (has(state, id) || !find(RESEARCH, id)) {
        r.queue.shift();
        continue;
      }
      if (!researchOpen(state, id) || !research(state, id, cfg)) break;
      got.research.push(id);
    }
    if (has(state, 'dispatch') && r.auto.dispatch) {
      var k = 0;
      var budget = Big.mul(r.ore, cfg['dispatch.share']);
      while (k < 30) {
        var i = bestDrone(state, cfg, now, false);
        if (i < 0 || Big.gt(droneCost(state, i, cfg), budget) || !buyDrone(state, i, cfg, 1)) break;
        budget = Big.mul(r.ore, cfg['dispatch.share']);
        k++;
      }
      got.drones += k;
    }
    if (has(state, 'autosmelt') && r.auto.smelt) {
      BUILDINGS.forEach(function (b) {
        if (!buildingOpen(state, b.id) || r.off[b.id]) return;
        var extra = consumption(b.id, r.b[b.id] + 1, cfg) - consumption(b.id, r.b[b.id], cfg);
        var spare = energyProd(state, cfg, now, offline) - energyUse(state, cfg);
        if (spare >= extra && Big.lte(buildingCost(state, b.id, cfg), Big.mul(r.ore, cfg['autosmelt.share'])) && buyBuilding(state, b.id, cfg)) got.levels++;
      });
    }
    r.bought.drones += got.drones;
    r.bought.levels += got.levels;
    if (offline && r.away) {
      r.away.drones += got.drones;
      r.away.levels += got.levels;
      got.research.forEach(function (x) { r.away.research.push(find(RESEARCH, x).title); });
    }
  }

  // ---- events ----

  function eventOk(state, e) {
    var r = state.run;
    if (!e.need) return true;
    if (e.need === 'ice') return has(state, 'ice');
    if (e.need === 'panels') return r.panels > 0;
    if (e.need === 'smelt') return has(state, 'smelt');
    if (e.need === 'dome') return r.dome > 0;
    if (e.need === 'exp') return r.exps.length > 0;
    if (e.need === 'buildings') return BUILDINGS.some(function (building) { return r.b[building.id] > 0; });
    return true;
  }

  function spawnEvent(state, ctx) {
    var r = state.run;
    var cfg = ctx.config;
    var rng = ctx.rng;
    var now = ctx.now;
    if (!rng) return;
    if (r.event && r.event.until <= now) r.event = null;
    if (!r.eventAt) r.eventAt = now + rng.range(cfg['event.minSec'], cfg['event.maxSec']) * 1000;
    if (now < r.eventAt || r.event) return;
    r.eventAt = now + rng.range(cfg['event.minSec'], cfg['event.maxSec']) * 1000;
    var list = EVENTS.filter(function (e) { return eventOk(state, e); });
    var e = rng.chance(cfg['event.clot.chance']) ? find(EVENTS, 'clot') : rng.weighted(list.filter(function (x) { return x.id !== 'clot'; }), function (x) { return cfg['event.' + x.id + '.w']; });
    if (!e) return;
    r.event = { id: e.id, until: now + cfg['event.cardSec'] * 1000 };
  }

  /** The player takes the event card: choice 0 (the main button) or 1 (the second). Returns a line. */
  function eventTake(state, cfg, choice, now, rng) {
    var r = state.run;
    var ev = r.event;
    if (!ev || ev.until <= now) {
      r.event = null;
      return null;
    }
    r.event = null;
    var id = ev.id;
    var sec = function (key) { return now + cfg[key] * 1000; };
    var e = find(EVENTS, id);
    if (id === 'meteor') {
      earnOre(state, Big.of(Math.max(cfg['start.ore'], oreRate(state, cfg, now) * 60 * cfg['event.meteor.min'])), true);
    } else if (id === 'comet') r.buffs.comet = sec('event.comet.sec');
    else if (id === 'flare') r.buffs.flare = sec('event.flare.sec');
    else if (id === 'wreck') {
      var a = cfg['event.wreck.alloy'] * star(state).n;
      addRes(state, 'alloy', a);
      return 'Обломок станции: +' + Fmt.num(a) + ' сплавов';
    } else if (id === 'signal') {
      if (rng && rng.chance(cfg['event.signal.chance'])) {
        var s = pickSample(state, rng, cfg);
        meta(state).samples[s] = num(meta(state).samples[s], 0) + 1;
        return 'Сигнал: в коллекцию — ' + find(SAMPLES, s).title;
      }
      var d = Math.max(cfg['event.signal.data'], num(r.flow.data, 0) * 60 * cfg['event.signal.min']);
      addRes(state, 'data', d);
      return 'Сигнал: +' + Fmt.num(Math.round(d)) + ' данных';
    } else if (id === 'fault') {
      if (choice === 1) return 'Дрона оставили как есть';
      var tier = topTier(state);
      var cost = Math.max(cfg['event.fault.min'], hullCost(state, Math.max(0, tier), cfg) * cfg['event.fault.share']);
      if (tier < 0 || !payRes(state, 'alloy', cost)) return 'Не хватает сплавов на ремонт';
      meta(state).tierBoost[tier] += cfg['event.fault.boost'];
      return 'Ремонт: ' + DRONES[tier].title.toLowerCase() + ' +' + Math.round(cfg['event.fault.boost'] * 100) + ' % навсегда';
    } else if (id === 'truck') {
      if (choice === 1) return 'Грузовик ушёл';
      // «Курс ×2»: the colony's own rate (ore a second to ice a second; event.truck.base ore for one
      // ice without icebreakers), doubled; at most event.truck.capMin minutes of ore.
      var sold = Big.mul(r.ice, cfg['event.truck.share']);
      var oreNow = oreRate(state, cfg, now);
      var iceNow = iceRate(state, cfg, now);
      var course = (oreNow > 0 && iceNow > 0 ? oreNow / iceNow : cfg['event.truck.base']) * cfg['event.truck.mult'];
      var ore = Big.mul(sold, course);
      if (oreNow > 0) ore = Big.min(ore, oreNow * 60 * cfg['event.truck.capMin']);
      payRes(state, 'ice', sold);
      earnOre(state, ore, false);
      return 'Продано ' + Fmt.num(sold) + ' льда за ' + Fmt.num(ore) + ' руды';
    } else if (id === 'dust') r.buffs.dust = sec('event.dust.sec');
    else if (id === 'settlers') {
      var room = domeCap(state, cfg) - r.colonists;
      var add = Math.max(0, Math.min(cfg['event.settlers.n'], room));
      r.colonists += add;
      return add ? '+' + Math.floor(add) + ' колонистов' : 'В куполе нет места';
    } else if (id === 'swarm') {
      if (r.dome > 0) r.dome++;
    } else if (id === 'link') {
      r.exps.forEach(function (x) { x.until = now + Math.max(0, x.until - now) / 2; });
    } else if (id === 'vein') {
      var t = topTier(state);
      if (t >= 0) r.vein = { tier: t, until: sec('event.vein.sec') };
      return t >= 0 ? 'Рудная жила: ' + DRONES[t].title.toLowerCase() + ' ×' + cfg['event.vein.mult'] + ' на ' + cfg['event.vein.sec'] + ' с' : null;
    } else if (id === 'mirror') r.mirror = true;
    else if (id === 'clot') addDm(state, 1);
    else if (id === 'calm') r.buffs.calm = sec('event.calm.sec');
    return e.title + ': ' + e.text;
  }

  function topTier(state) {
    for (var i = DRONES.length - 1; i >= 0; i--) if (state.run.drones[i] + state.run.drones2[i] > 0) return i;
    return -1;
  }

  // ---- the step ----

  function offlineRate(state, cfg) { return Math.min(1, cfg['offline.rate'] + lvl(state, 'offline') * cfg['meta.offline.step']); }

  /** Splits `have` between demands proportionally: returns the share each gets (0..1). */
  function shareOf(have, demand) { return demand > have && demand > 0 ? Math.max(0, have) / demand : 1; }

  function advance(state, dt, ctx) {
    var cfg = ctx.config;
    var r = state.run;
    var now = ctx.now || 0;
    var offline = !!ctx.offline;
    meta(state);
    if (!r.start) r.start = now;
    if (!offline) {
      if (r.away) delete r.away;
      spawnEvent(state, ctx);
    } else if (!r.away) {
      r.away = {
        ore: r.ore, ice: r.ice, alloy: r.alloy, water: r.water, fuel: r.fuel, data: r.data, drones: 0, levels: 0, research: [],
        exps: [], deficit: 0, deficitLoss: 0
      };
    }
    // Expeditions by the real time; containers wait.
    for (var i = r.exps.length - 1; i >= 0; i--) {
      if (now >= r.exps[i].until) {
        var e = r.exps.splice(i, 1)[0];
        var c = expBack(state, e, cfg, ctx.rng, now);
        if (offline && r.away) {
          var cargo = c.title + ': ' + Fmt.num(c.ore) + ' руды, ' + Fmt.num(c.ice) + ' льда';
          if (c.sample) cargo += ', ' + find(SAMPLES, c.sample).title;
          if (c.dm) cargo += ', +' + c.dm + ' ТМ';
          r.away.exps.push(cargo);
          if (ctx.report) ctx.report(cargo);
        }
      }
    }
    auto(state, cfg, now, offline);
    var eff = dt;
    var mult = ctx.mult || 1;
    // 1. Drones and icebreakers.
    var ore = oreRate(state, cfg, now) * mult * eff;
    if (ore > 0) earnOre(state, Big.of(ore), true);
    var ice = iceRate(state, cfg, now) * mult * eff;
    addRes(state, 'ice', ice);
    // 2. Energy and the share of the buildings.
    var share = energyShare(state, cfg, now, offline);
    var t0 = now - (ctx.realDt || dt) * 1000;
    var free = flareFree(state, cfg, t0, now);
    var k = share * free * eff * timeMult(state, cfg) * colonistMult(state, cfg) * (buff(state, 'dust', now) ? cfg['event.dust.buildings'] : 1);
    var cap = function (id) { return r.off[id] ? 0 : throughput(id, r.b[id], cfg) * k; };
    var flow = { ore: ore / dt, ice: ice / dt, share: share, fed: 1 };
    var work = {};
    // 3. Smelter: ore → alloys.
    var wantOre = cap('smelter');
    var oreHave = Big.toNumber(r.ore);
    var tookOre = Math.min(wantOre, Math.max(0, oreHave));
    if (tookOre > 0) {
      r.ore = Big.str(Big.max(Big.ZERO, Big.sub(r.ore, tookOre)));
      var alloys = tookOre / cfg['b.smelter.ratio'] * sampleBonus(state, 'alloy', cfg);
      addRes(state, 'alloy', alloys);
      flow.alloy = alloys / dt;
      work.smelter = true;
    }
    // 4. Ice is shared by the purifier and the factory (with the alloys).
    var wantP = cap('purifier');
    var wantF = cap('factory');
    wantF = Math.min(wantF, Big.toNumber(r.alloy));
    var iceShare = shareOf(Big.toNumber(r.ice), wantP + wantF);
    var takeP = wantP * iceShare;
    var takeF = wantF * iceShare;
    if (takeP > 0) {
      takeRes(state, 'ice', takeP);
      addRes(state, 'water', takeP / cfg['b.purifier.ratio']);
      flow.water = takeP / cfg['b.purifier.ratio'] / dt;
      work.purifier = true;
    }
    if (takeF > 0) {
      takeRes(state, 'ice', takeF);
      takeRes(state, 'alloy', takeF);
      var chips = takeF / cfg['b.factory.ratio'] * (has(state, 'chips') ? cfg['chips.mult'] : 1);
      addRes(state, 'chip', chips);
      flow.chip = chips / dt;
      work.factory = true;
    }
    // 5. Water: the colonists drink first (upkeep), the electrolysis takes the rest.
    var drink = r.colonists * cfg['colony.water'] / 60 * eff * timeMult(state, cfg);
    var wantE = cap('electro');
    var fed = shareOf(Big.toNumber(r.water), drink);
    takeRes(state, 'water', drink * fed);
    flow.fed = drink > 0 ? fed : 1;
    var takeE = Math.min(wantE, Math.max(0, Big.toNumber(r.water)));
    if (takeE > 0) {
      takeRes(state, 'water', takeE);
      var fuel = takeE / cfg['b.electro.ratio'];
      addRes(state, 'fuel', fuel);
      flow.fuel = fuel / dt;
      work.electro = true;
    }
    // Settling: new colonists while there is room and water, 1 water each.
    var room = domeCap(state, cfg) - r.colonists;
    if (room > 0 && r.water > 0) {
      var come = Math.min(room, cfg['colony.settle'] * eff * timeMult(state, cfg), r.water / cfg['colony.settleWater']);
      r.colonists += come;
      takeRes(state, 'water', come * cfg['colony.settleWater']);
    }
    // 6. Lab: electronics → data.
    var takeL = Math.min(cap('lab'), Math.max(0, Big.toNumber(r.chip)));
    if (takeL > 0) {
      takeRes(state, 'chip', takeL);
      var data = takeL * cfg['b.lab.ratio'] * starMult(state, cfg, 'data') * sampleBonus(state, 'data', cfg) * Math.pow(cfg['station.lab.mult'], station(state, 'lab'));
      addRes(state, 'data', data);
      flow.data = data / dt;
      work.lab = true;
    }
    r.work = work;
    r.flow = flow;
    // Energy: the deficit time and «a calm hour» without it.
    var use = energyUse(state, cfg);
    if (use > 0 && share < 1) {
      r.deficitSec += dt;
      r.calmSec = 0;
      if (offline && r.away) {
        r.away.deficit += dt;
        r.away.deficitLoss += (1 - share) * dt;
      }
    } else if (use > 0) r.calmSec += dt;
    if (isStar(state, 'neutron')) r.wear = Math.min(1, r.wear + dt * timeMult(state, cfg) / (cfg['wear.sec'] * (star(state).double ? 0.5 : 1)));
    else r.wear = 0;
    clean(r);
  }

  function tick(state, dt, ctx) {
    if (!(dt > 0)) return;
    var rate = ctx.offline ? offlineRate(state, ctx.config) : 1;
    var effective = dt * rate;
    var n = Math.max(1, Math.ceil(dt / ctx.config['simulation.stepSec']));
    var sub = {};
    for (var key in ctx) sub[key] = ctx[key];
    var start = ctx.now - dt * 1000;
    for (var i = 0; i < n; i++) {
      sub.now = start + dt * 1000 * (i + 1) / n;
      sub.realDt = dt / n;
      advance(state, effective / n, sub);
    }
    if (ctx.offline && ctx.report && state.run.away && !state.run.away.reported) {
      ctx.report('Цепочки продолжают работу; вернувшиеся контейнеры ждут в экспедициях.');
      state.run.away.reported = true;
    }
  }

  /** Tiny negatives of floating point back to zero. */
  function clean(r) {
    ['ice', 'alloy', 'water', 'fuel', 'chip', 'data'].forEach(function (k) { if (Big.sign(r[k]) < 0) r[k] = 0; });
    if (!(r.colonists > 0)) r.colonists = 0;
  }

  // ---- the engine's functions ----

  function init(ctx) {
    var cfg = ctx && ctx.config;
    return {
      run: freshRun(cfg, ctx && ctx.now),
      layers: { jump: { state: jumpState() }, cluster: { state: { stations: {} } } },
      meta: { samples: {}, atlas: { 1: 'yellow' }, tierBoost: zeros(DRONES.length), jumps: 0, bestStar: 1 }
    };
  }

  function prestigeGain(state, layerId, cfg) {
    if (layerId === CLUSTER) {
      if (js(state).star < cfg['cluster.star']) return Big.ZERO;
      return Big.floor(Big.pow(Big.div(js(state).total, cfg['cluster.div']), 0.5));
    }
    if (!state.run.engine) return Big.ZERO;
    return Big.add(Big.floor(Big.pow(Big.div(state.run.mined, cfg['dm.div']), 0.5)), cfg['dm.chain'] * chains(state));
  }

  function bonus(state, layerId, amount, cfg) {
    return Big.add(1, Big.mul(amount, layerId === CLUSTER ? cfg['cluster.bonus'] : cfg['dm.bonus']));
  }

  function onPrestige(state, layerId, before, ctx) {
    var cfg = ctx.config;
    var m = meta(state);
    var s = js(state);
    var r = state.run;
    if (!r.drones) state.run = r = freshRun(cfg, ctx.now);
    r.start = ctx.now || 0;
    if (layerId === JUMP) {
      var gained = prestigeGain(before, JUMP, cfg);
      s.total = compact(Big.add(s.total, Big.max(Big.ZERO, gained)));
      s.star++;
      m.jumps++;
      if (s.star > STARS.length) {
        var passed = STARS.slice(1).map(function (x) { return x.id; });
        s.rule = ctx.rng ? ctx.rng.pick(passed) : 'red';
      } else s.rule = null;
      if (s.star > m.bestStar) m.bestStar = s.star;
      m.atlas[s.star] = star(state).id;
      // Drone memory: 10 % of the drones stay for every level.
      if (lvl(state, 'memory')) {
        var keep = Math.min(1, lvl(state, 'memory') * cfg['meta.memory.share']);
        for (var i = 0; i < DRONES.length; i++) r.drones[i] = Math.floor((before.run.drones[i] + before.run.drones2[i]) * keep);
      }
    } else {
      m.atlas[1] = 'yellow';
    }
    startColony(state, cfg);
  }

  /** What a new colony starts with by the meta: researches, dome and colonists. */
  function startColony(state, cfg) {
    var r = state.run;
    var order = ['grab', 'smelt', 'ice', 'purify', 'dome', 'electro', 'crush', 'chips', 'reactor'];
    var n = Math.min(order.length, lvl(state, 'research') * cfg['meta.research.nodes']);
    for (var i = 0; i < n; i++) r.research[order[i]] = true;
    if (r.research.electro && r.hangar < 1) r.hangar = 1;
    var c = lvl(state, 'colonists');
    if (c > 0) {
      r.research.purify = true;
      r.research.ice = true;
      r.research.dome = true;
      r.dome = Math.max(r.dome, c);
      r.colonists = Math.min(domeCap(state, cfg), c * cfg['meta.colonists.n']);
    }
  }

  function metaCost(state, id, cfg) { return Math.ceil(cfg['meta.' + id + '.c0'] * Math.pow(cfg['meta.growth'], lvl(state, id))); }

  /** The ceiling of a meta upgrade; 0 in config — none, the price just keeps growing. */
  function metaMax(id, cfg) {
    var m = cfg['meta.' + id + '.max'];
    return m > 0 ? m : Infinity;
  }

  function buyMeta(state, id, cfg) {
    if (!find(META, id) || lvl(state, id) >= metaMax(id, cfg)) return false;
    var c = metaCost(state, id, cfg);
    if (Big.lt(L(state, JUMP).currency, c)) return false;
    state.layers[JUMP].currency = Big.str(Big.sub(Big.of(state.layers[JUMP].currency, 0), c));
    js(state).meta[id] = lvl(state, id) + 1;
    if (Big.isZero(state.run.mined)) startColony(state, cfg);
    return true;
  }

  function stationCost(state, id, cfg) { return Big.ceil(Big.mul(cfg['station.c0'], Big.pow(cfg['station.growth'], station(state, id)))); }

  function buyStation(state, id, cfg) {
    if (!find(STATIONS, id)) return false;
    var c = stationCost(state, id, cfg);
    if (Big.lt(L(state, CLUSTER).currency, c)) return false;
    state.layers[CLUSTER].currency = Big.str(Big.sub(Big.of(state.layers[CLUSTER].currency, 0), c));
    clusterState(state).stations[id] = station(state, id) + 1;
    return true;
  }

  function migrate(state, fromVer) { return state; }

  function validate(state) {
    var r = state.run;
    if (!Big.valid(r.ore) || Big.sign(r.ore) < 0) return 'руды меньше нуля';
    var keys = ['ice', 'alloy', 'water', 'fuel', 'chip', 'data', 'colonists'];
    for (var i = 0; i < keys.length; i++) if (!Big.valid(r[keys[i]]) || Big.sign(r[keys[i]]) < 0) return keys[i] + ' не число или меньше нуля: ' + r[keys[i]];
    if (!Array.isArray(r.drones) || r.drones.length !== DRONES.length) return 'нет списка дронов';
    for (var j = 0; j < r.drones.length; j++) if (r.drones[j] < 0 || r.drones[j] % 1 !== 0) return 'дронов не целое число';
    return null;
  }

  function summary(state, cfg) {
    var parts = [Fmt.num(oreRate(state, cfg, state.lastTick || state.run.start)) + ' руды/с', star(state).title];
    var d = dm(state);
    if (d > 0) parts.push('ТМ ' + Fmt.num(d));
    return { line: parts.join(' · ') };
  }

  /** When an expedition comes back; when the data is enough for the next research in the queue. */
  function next(state, now, cfg) {
    var out = [];
    state.run.exps.forEach(function (e) { out.push({ id: 'expedition', at: e.until, text: 'Экспедиция «' + EXPEDITIONS[e.k].title + '» вернулась с контейнером' }); });
    var q = state.run.queue[0];
    var rate = num(state.run.flow.data, 0);
    if (q && find(RESEARCH, q).cur === 'data' && rate > 0) {
      var sec = (researchCost(state, q, cfg) - state.run.data) / rate;
      if (sec > 0 && sec < 86400) out.push({ id: 'research', at: now + Math.ceil(sec / offlineRate(state, cfg)) * 1000, text: 'Исследование «' + find(RESEARCH, q).title + '» закрыто' });
    }
    return out;
  }

  /** «Попутный груз» of «Пассажир»: 15 minutes of all the resources. */
  function chest(state, rng, cfg) {
    var r = state.run;
    var sec = cfg['chest.min'] * 60;
    var ore = Math.max(cfg['start.ore'] * cfg['chest.minOreMult'], oreRate(state, cfg, 0) * sec);
    earnOre(state, Big.of(ore), true);
    var items = [{ title: 'Руда', amount: '+' + Fmt.num(ore) }];
    ['ice', 'alloy', 'water', 'fuel', 'chip', 'data'].forEach(function (k) {
      var v = num(r.flow[k], 0) * sec;
      if (v > 0) {
        addRes(state, k, v);
        items.push({ title: find(RESOURCES, k).title, amount: '+' + Fmt.num(Math.round(v)) });
      }
    });
    return { title: 'Попутный груз', items: items };
  }

  function capBonusHours(state, cfg) { return isStar(state, 'hole') ? (cfg ? cfg['star.hole.capBonusHours'] : 12) : 0; }

  function stepFuel(state, cfg) { addRes(state, 'fuel', expFuel(state, 1, cfg)); return expFuel(state, 1, cfg); }

  function achievements(state, cfg) {
    var r = state.run;
    var out = [];
    if (r.b.smelter > 0) out.push(ACH.smelter);
    if (chains(state) === BUILDINGS.length) out.push(ACH.chain);
    if (r.colonists >= cfg['achievement.colonists']) out.push(ACH.hundred);
    if (r.calmSec >= cfg['achievement.calmSec']) out.push(ACH.calm);
    if (meta(state).jumps > 0) out.push(ACH.jump);
    if (meta(state).bestStar >= cfg['achievement.fiveStar']) out.push(ACH.five);
    if (Object.keys(meta(state).atlas).some(function (k) { return meta(state).atlas[k] === 'binary'; })) out.push(ACH.binary);
    if (Object.keys(meta(state).samples).filter(function (k) { return !!find(SAMPLES, k); }).length >= SAMPLES.length) out.push(ACH.collector);
    return out;
  }

  // ---- the stock: the colony log and star descriptions, made up when it ran out ----

  var LOG_WHO = ['Диспетчер', 'Инженер купола', 'Пилот катера', 'Геолог', 'Повар колонии'];
  var LOG_WHAT = ['дроны сегодня работали тише обычного', 'в пыли нашли кусочек блестящего металла', 'панели развернули на четверть градуса — стало лучше',
    'в оранжерее купола взошли первые ростки', 'катер вернулся с царапиной и хорошим настроением', 'лёд с северного склона оказался чище'];
  var STAR_A = ['Тусклая', 'Дальняя', 'Тихая', 'Рыжая', 'Холодная', 'Мерцающая'];
  var STAR_B = ['звезда Пояса', 'звезда Края', 'звезда Скопления', 'звезда Ветра'];

  function procedural(kind, rng) {
    var list = kind === 'stars' ? STARS : kind === 'samples' ? SAMPLES : kind === 'events' ? EVENTS : null;
    if (list) {
      var item = rng.pick(list);
      return { id: item.id, title: item.title, text: item.description || item.text || 'Этот образец останется в коллекции колонии.' };
    }
    return { who: rng.pick(LOG_WHO), text: rng.pick(LOG_WHAT) };
  }

  function validateStock(kind, item) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return 'нужен объект';
    if (/https?:|<[^>]*>/.test(JSON.stringify(item))) return 'ссылка или разметка в тексте';
    var list = kind === 'stars' ? STARS : kind === 'samples' ? SAMPLES : kind === 'events' ? EVENTS : null;
    var allowed = list ? ['id', 'title', 'text'] : ['who', 'text'];
    for (var key in item) if (allowed.indexOf(key) < 0) return 'неизвестное поле ' + key;
    if (typeof item.text !== 'string' || !item.text.trim() || item.text.length > 240) return 'неверная длина текста';
    if (list) {
      var canonical = find(list, item.id);
      if (!canonical || item.title !== canonical.title) return 'неизвестный объект контента';
    } else if (kind !== 'log' || LOG_WHO.indexOf(item.who) < 0) return 'неизвестный вид журнала';
    return null;
  }

  // ---- the bot of «Темп» (checks, tests): one second of a careful player ----

  var BOT_ORDER = ['grab', 'smelt', 'ice', 'purify', 'crush', 'electro', 'dome', 'chips', 'gravity', 'reactor', 'far', 'dispatch', 'jump', 'autosmelt'];

  /** One second of the bot: research by the order, energy, chains, drones; returns purchases. */
  function play(state, ctx, taps) {
    var cfg = ctx.config;
    var now = ctx.now || 0;
    var r = state.run;
    var n = 0;
    while (r.containers.length) takeContainer(state, 0);
    if (r.event && r.event.until > now) eventTake(state, cfg, 0, now, ctx.rng);
    if (isStar(state, 'pulsar')) tapPeak(state, cfg, now);
    if (isStar(state, 'neutron') && r.wear > 0.5) repair(state, cfg);
    // Research: the next by the order when it is open and affordable, else queued.
    for (var i = 0; i < BOT_ORDER.length; i++) {
      var id = BOT_ORDER[i];
      if (has(state, id)) continue;
      if (researchOpen(state, id)) {
        var x = find(RESEARCH, id);
        if (x.cur === 'ore' ? Big.gte(r.ore, researchCost(state, id, cfg)) : r.data >= researchCost(state, id, cfg)) {
          if (research(state, id, cfg)) n++;
        } else if (x.cur === 'data') enqueue(state, id);
      }
      break;
    }
    if (buildEngine(state, cfg)) n++;
    var ore = function () { return Big.toNumber(r.ore); };
    var oreNow = oreRate(state, cfg, now);
    // The chain: each building one level when it is cheap and its input is there.
    var reserve = function () { return has(state, 'jump') ? 0 : 0; };
    BUILDINGS.forEach(function (b) {
      if (!buildingOpen(state, b.id)) return;
      var cost = Big.toNumber(buildingCost(state, b.id, cfg));
      var cheap = cost <= Math.max(cfg['bot.buildSec'] * oreNow, cfg['bot.buildFirst'] * (r.b[b.id] === 0 ? 1 : 0)) && cost <= ore() - reserve();
      if (cheap && buyBuilding(state, b.id, cfg)) n++;
    });
    // Energy: panels or the reactor while consumption is above production.
    var g = 0;
    while (g++ < 20 && energyUse(state, cfg) > energyProd(state, cfg, now, true)) {
      var pc = Big.toNumber(panelCost(state, cfg));
      var rc = has(state, 'reactor') ? Big.toNumber(reactorCost(state, cfg)) : Infinity;
      var panelGain = cfg['panel.power'] * Math.pow(cfg['panel.growth'], r.panels) * starMult(state, cfg, 'panels');
      var reactorGain = cfg['reactor.power'] * Math.pow(cfg['reactor.growth'], r.reactor);
      if (rc / reactorGain < pc / Math.max(1e-9, panelGain) ? buyReactor(state, cfg) : buyPanel(state, cfg)) n++;
      else break;
    }
    // Ice: icebreakers while the buildings want more than comes.
    var wantIce = throughput('purifier', r.b.purifier, cfg) + throughput('factory', r.b.factory, cfg);
    var gi = 0;
    while (gi++ < 20 && has(state, 'ice') && iceRate(state, cfg, now) < wantIce * cfg['bot.iceCover']) {
      var best = -1;
      var score = -1;
      for (var j = 0; j < BREAKERS.length; j++) {
        if (!breakerOpen(state, j)) continue;
        var sc = Math.pow(cfg['breaker.rateGrowth'], j) / Big.toNumber(breakerCost(state, j, cfg));
        if (sc > score) {
          score = sc;
          best = j;
        }
      }
      if (best < 0 || Big.toNumber(breakerCost(state, best, cfg)) > ore() * cfg['bot.iceShare'] || !buyBreaker(state, best, cfg)) break;
      n++;
    }
    // Alloys: the engine first, then hulls and the dome.
    var keep = has(state, 'jump') && !r.engine ? cfg['engine.alloy'] : 0;
    if (r.dome > 0 && r.colonists >= domeCap(state, cfg) - 1 && r.alloy - domeCost(state, cfg) >= keep && buyDome(state, cfg)) n++;
    if (has(state, 'dome') && r.dome === 0 && r.alloy - domeCost(state, cfg) >= keep && buyDome(state, cfg)) n++;
    var hull = -1;
    var hullScore = 0;
    for (var h = 0; h < DRONES.length; h++) {
      var hullGain = r.drones[h] * tierRate(state, h, r.drones[h], cfg, now) * (cfg['hull.mult'] - 1);
      var hs = hullGain / hullCost(state, h, cfg);
      if (hs > hullScore) { hullScore = hs; hull = h; }
    }
    if (hull >= 0 && Big.gte(r.alloy, Big.add(keep, hullCost(state, hull, cfg))) && buyHull(state, hull, cfg)) n++;
    if (has(state, 'electro') && r.hangar < 2 && Big.toNumber(hangarCost(state, cfg)) < ore() * 0.1 && buyHangar(state, cfg)) n++;
    // Fuel: the engine first; expeditions only from the surplus.
    if (!r.bought.expeditions && expedition(state, 0, cfg, now)) n++;
    var fuelKeep = has(state, 'jump') && !r.engine ? cfg['engine.fuel'] : cfg['bot.fuelKeep'];
    for (var k = EXPEDITIONS.length - 1; k >= 0; k--) {
      if (expOpen(state, k) && r.exps.length < r.hangar && r.fuel - expFuel(state, k, cfg) >= fuelKeep && expedition(state, k, cfg, now)) n++;
    }
    if (Big.toNumber(upgradeCost(state, cfg)) <= ore() * cfg['bot.upgradeShare'] && buyUpgrade(state, cfg)) n++;
    // Drones: the best by ore a second per ore, in both colonies at a binary star.
    var guard = 0;
    var nextTier = topTier(state) + 1;
    if (nextTier < DRONES.length && droneOpen(state, nextTier) && Big.toNumber(droneCost(state, nextTier, cfg)) <= oreRate(state, cfg, now) * cfg['bot.newTierSec']) {
      if (buyDrone(state, nextTier, cfg, 1)) n++;
      else return n;
    }
    while (guard++ < 60) {
      var d = bestDrone(state, cfg, now, false);
      if (d < 0 || !buyDrone(state, d, cfg, 1)) break;
      n++;
    }
    if (isStar(state, 'binary')) {
      guard = 0;
      while (guard++ < 60) {
        var d2 = bestDrone(state, cfg, now, true);
        if (d2 < 0 || !buyDrone(state, d2, cfg, 1, true)) break;
        n++;
      }
    }
    return n;
  }

  /** The meta the bot buys after a jump: the cheapest useful first. */
  function playMeta(state, cfg) {
    var order = ['mine', 'research', 'build', 'offline', 'exp', 'colonists', 'memory'];
    var guard = 0;
    var any = true;
    while (any && guard++ < 60) {
      any = false;
      for (var i = 0; i < order.length; i++) {
        if (buyMeta(state, order[i], cfg)) {
          any = true;
        }
      }
    }
    STATIONS.forEach(function (s) { while (buyStation(state, s.id, cfg)) { /* all the beacons */ } });
  }

  return {
    init: init, tick: tick, prestigeGain: prestigeGain, bonus: bonus, onPrestige: onPrestige, migrate: migrate,
    validate: validate, summary: summary, next: next, chest: chest, procedural: procedural, validateStock: validateStock,
    capBonusHours: capBonusHours, stepFuel: stepFuel, achievements: achievements,
    // helpers of the screen and the bot
    oreRate: oreRate, iceRate: iceRate, tierRate: tierRate, oreMult: oreMult, droneCost: droneCost, droneCount: droneCount, buyDrone: buyDrone,
    droneOpen: droneOpen, bestDrone: bestDrone, breakerCost: breakerCost, buyBreaker: buyBreaker, breakerOpen: breakerOpen,
    hullCost: hullCost, buyHull: buyHull, upgradeCost: upgradeCost, buyUpgrade: buyUpgrade,
    buildingOpen: buildingOpen, buildingCost: buildingCost, buyBuilding: buyBuilding, throughput: throughput, consumption: consumption,
    panelCost: panelCost, buyPanel: buyPanel, reactorCost: reactorCost, buyReactor: buyReactor,
    energyProd: energyProd, energyUse: energyUse, energyShare: energyShare, pulse: pulse, tapPeak: tapPeak, flareFree: flareFree,
    researchOpen: researchOpen, researchCost: researchCost, research: research, enqueue: enqueue, has: has,
    domeCap: domeCap, domeCost: domeCost, buyDome: buyDome, hangarCost: hangarCost, buyHangar: buyHangar,
    expOpen: expOpen, expMinutes: expMinutes, expFuel: expFuel, expedition: expedition, takeContainer: takeContainer,
    engineReady: engineReady, buildEngine: buildEngine, chains: chains, repair: repair, repairCost: repairCost,
    eventTake: eventTake, star: star, starMult: starMult, isStar: isStar, timeMult: timeMult, offlineRate: offlineRate,
    metaCost: metaCost, metaMax: metaMax, buyMeta: buyMeta, stationCost: stationCost, buyStation: buyStation, station: station,
    lvl: lvl, dm: dm, beacons: beacons, js: js, meta: meta, sampleBonus: sampleBonus, colonistMult: colonistMult,
    milestoneMult: milestoneMult, nextMilestone: nextMilestone, topTier: topTier, play: play, playMeta: playMeta,
    DRONES: DRONES, BREAKERS: BREAKERS, BUILDINGS: BUILDINGS, RESOURCES: RESOURCES, RESEARCH: RESEARCH, EXPEDITIONS: EXPEDITIONS,
    SAMPLES: SAMPLES, KIND: KIND, STARS: STARS, META: META, STATIONS: STATIONS, EVENTS: EVENTS, ACH: ACH, JUMP: JUMP, CLUSTER: CLUSTER
  };
});



