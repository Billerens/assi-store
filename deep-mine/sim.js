// «Шахта вглубь» — the logic. A drill goes down through rock layers: every 100 m the rock is
// 2.2 times harder and 1.15 times richer; crews earn money by the value of the layer; money
// buys drill levels and crews. Every thousand metres opens a zone with its own mechanic
// (water, gas, heat, crystals, voids, magma, vaults, pressure, echo, the deep circle). Prestige:
// «Новая скважина» (Керн, Чертежи and the workshop) and «Новый край» (Карты недр).
//
// Shared subset of JavaScript: it runs on the screen (window.GameSim), in the engine (Rhino,
// require) and in node. No class, no async, no f(...args), no for (let …); randomness only from
// ctx.rng / the rng given; time only from ctx.now. Every number is a key of config.json (cfg).
//
// Drilling is integrated exactly within a step (constant power over the step): from
// dd/dt = P / g^(d/100) the depth after dt is d + (100 / ln g) · ln(1 + v·dt·ln g / 100), and the
// money of the step is the integral of the layer's value along that path. So 30-second steps of
// the offline count and 1/10-second steps on the screen agree.
(function (root, make) {
  var node = typeof require === 'function' && typeof exports !== 'undefined';
  var api = node ? make(require('../engine/big.js'), require('../engine/fmt.js')) : make(root.Big, root.Fmt);
  if (typeof exports !== 'undefined') { for (var k in api) exports[k] = api[k]; } else { root.GameSim = api; }
})(this, function (Big, Fmt) {
  'use strict';

  var CORE = 'core';
  var EDGE = 'edge';
  var LN10 = Math.LN10;

  // ---- content the logic needs (texts the model writes are in content/ and the stock) ----

  var CREWS = [
    { id: 'digger', title: 'Землекоп' },
    { id: 'barrow', title: 'Тачечник' },
    { id: 'breaker', title: 'Отбойщик' },
    { id: 'cart', title: 'Вагонетка' },
    { id: 'cage', title: 'Клеть-подъёмник' },
    { id: 'belt', title: 'Ленточный конвейер' },
    { id: 'plant', title: 'Обогатительная фабрика' },
    { id: 'combine', title: 'Проходческий комбайн' }
  ];

  // Zones by the local depth (within a circle of 10 000 m); `start` is a config key.
  var ZONES = [
    { id: 'sediment', title: 'Осадочные породы', start: null, text: 'бур и бригады' },
    { id: 'water', title: 'Водоносный горизонт', start: 'water.start', text: 'приток воды растёт с глубиной, насосы откачивают' },
    { id: 'gas', title: 'Газовые карманы', start: 'gas.start', text: 'вентиляция; выброс газа можно стравить за бонус' },
    { id: 'heat', title: 'Жар', start: 'heat.start', text: 'быстрый бур греется, охладители, сброс тепла даёт рывок' },
    { id: 'crystal', title: 'Кристаллы', start: 'crystal.start', text: 'кристаллы по пути, огранка в линзы до конца скважины' },
    { id: 'void', title: 'Пустоты', start: 'void.start', text: 'пещеры: экспедиции за артефактами' },
    { id: 'magma', title: 'Магма', start: 'magma.start', text: 'геотермальная станция: бригады ×3, нужен теплоотвод' },
    { id: 'vault', title: 'Древние своды', start: 'vault.start', text: 'реликвии неизвестной цивилизации, бонус за полный набор' },
    { id: 'pressure', title: 'Давление', start: 'pressure.start', text: 'бур изнашивается, алмазные коронки' },
    { id: 'echo', title: 'Эхо', start: 'echo.start', text: 'у каждой скважины своё правило' }
  ];

  // Equipment of the zones: coverage = capacity / need; without it the zone slows the drill.
  var EQUIP = [
    { id: 'pump', zone: 'water', title: 'Насосы', unit: 'м³/мин', verb: 'откачка' },
    { id: 'vent', zone: 'gas', title: 'Вентиляция', unit: 'м³/мин', verb: 'продув' },
    { id: 'cool', zone: 'heat', title: 'Охладители', unit: 'тепла/с', verb: 'охлаждение' },
    { id: 'sink', zone: 'magma', title: 'Теплоотвод', unit: 'МВт', verb: 'отвод' }
  ];

  // Artifacts: 5 sets of 4; kind — what the bonus raises (income, power, find), pct — percent.
  var ARTIFACTS = [
    { id: 'shell', title: 'Окаменелая ракушка', set: 'sea', kind: 'income', pct: 5 },
    { id: 'ammonite', title: 'Аммонит', set: 'sea', kind: 'income', pct: 4 },
    { id: 'fern', title: 'Отпечаток папоротника', set: 'sea', kind: 'power', pct: 3 },
    { id: 'amber', title: 'Янтарь с мошкой', set: 'sea', kind: 'income', pct: 4 },
    { id: 'flint', title: 'Кремнёвый наконечник', set: 'stone', kind: 'power', pct: 3 },
    { id: 'disk', title: 'Каменный диск с насечками', set: 'stone', kind: 'find', pct: 10 },
    { id: 'bear', title: 'Зуб пещерного медведя', set: 'stone', kind: 'power', pct: 3 },
    { id: 'tablet', title: 'Глиняная табличка', set: 'stone', kind: 'income', pct: 4 },
    { id: 'nail', title: 'Бронзовый гвоздь', set: 'miner', kind: 'power', pct: 3 },
    { id: 'lamp', title: 'Шахтёрская лампа', set: 'miner', kind: 'find', pct: 10 },
    { id: 'pick', title: 'Ржавая кирка', set: 'miner', kind: 'power', pct: 4 },
    { id: 'coin', title: 'Медная монета без надписи', set: 'miner', kind: 'income', pct: 4 },
    { id: 'meteor', title: 'Кусок метеорита', set: 'sky', kind: 'power', pct: 4 },
    { id: 'geode', title: 'Жеода', set: 'sky', kind: 'income', pct: 4 },
    { id: 'bead', title: 'Стеклянная бусина', set: 'sky', kind: 'find', pct: 10 },
    { id: 'pearl', title: 'Чёрная жемчужина', set: 'sky', kind: 'income', pct: 5 },
    { id: 'vertebra', title: 'Позвонок неизвестного', set: 'riddle', kind: 'power', pct: 3 },
    { id: 'ring', title: 'Кольцо из неизвестного металла', set: 'riddle', kind: 'income', pct: 5 },
    { id: 'key', title: 'Ключ без замка', set: 'riddle', kind: 'find', pct: 10 },
    { id: 'egg', title: 'Каменное яйцо', set: 'riddle', kind: 'income', pct: 5 }
  ];

  var SETS = [
    { id: 'sea', title: 'Древнее море', kind: 'income' },
    { id: 'stone', title: 'Каменный век', kind: 'power' },
    { id: 'miner', title: 'Шахтёрский набор', kind: 'income' },
    { id: 'sky', title: 'Небесные камни', kind: 'power' },
    { id: 'riddle', title: 'Загадки глубины', kind: 'find' }
  ];

  // Relics of the ancient vaults (7 000 m): one more set, a bigger bonus for the whole of it.
  var RELICS = [
    { id: 'seal', title: 'Печать свода' },
    { id: 'lantern', title: 'Светильник свода' },
    { id: 'slab', title: 'Скрижаль свода' },
    { id: 'vkey', title: 'Ключ свода' }
  ];

  // The rules of a well in the echo zone (9 000 m): the allowed list (numbers in config).
  var RULES = [
    { id: 'soft', title: 'Мягкая скважина', text: 'порода твердеет медленнее' },
    { id: 'rich', title: 'Богатая скважина', text: 'ценность породы выше' },
    { id: 'dry', title: 'Сухая скважина', text: 'вода и газ не мешают' },
    { id: 'hot', title: 'Горячая скважина', text: 'бур греется вдвое, но мощнее' },
    { id: 'lucky', title: 'Счастливая скважина', text: 'находки втрое чаще' },
    { id: 'busy', title: 'Людная скважина', text: 'бригады вдвое сильнее, бур слабее' }
  ];

  // Edges of «Новый край»: another order of the rocks.
  var EDGES = [
    { id: 'base', title: 'Обычный край', text: 'зоны по тысячам метров' },
    { id: 'volcanic', title: 'Вулканический', text: 'жар с 1 500 м, но ценность ×2' },
    { id: 'salt', title: 'Соляной', text: 'вода не мешает, кристаллы с 2 000 м' },
    { id: 'ice', title: 'Ледяной', text: 'бур не греется, твёрдость ×1,1' }
  ];

  // The workshop of the drill (for Чертежи). cost: config key of the price; growth: per level;
  // endless: no last level, the price keeps growing; max: config key of the number of levels.
  var WORKSHOP = [
    { id: 'bit', title: 'Победитовая головка', text: 'рост твёрдости ×0,97 за уровень (до 1,6)', cost: 'ws.bit.cost', growth: 'ws.bit.growth', max: 'ws.bit.max' },
    { id: 'motor', title: 'Мощный двигатель', text: 'мощность ×4, каждый следующий уровень ещё ×1,5', cost: 'ws.motor.cost', growth: 'ws.motor.growth', endless: true },
    { id: 'rope', title: 'Длинный трос', text: 'скважина начинается с 10 % рекорда', cost: 'ws.rope.cost', max: null },
    { id: 'lift', title: 'Подъёмник побольше', text: 'офлайн 0,5 → 0,75 → 1,0', cost: 'ws.lift.cost', growth: 'ws.lift.growth', max: 'ws.lift.max' },
    { id: 'seismic', title: 'Сейсморазведка', text: 'находки вдвое чаще', cost: 'ws.seismic.cost', max: null },
    { id: 'night', title: 'Ночная смена', text: 'потолок офлайна +12 ч за уровень', cost: 'ws.night.cost', growth: 'ws.night.growth', endless: true },
    { id: 'crews', title: 'Опытные бригады', text: 'бригады дешевле на 25 %', cost: 'ws.crews.cost', max: null },
    { id: 'rig', title: 'Буровая вышка', text: 'Мастер смены и Механик с самого начала', cost: 'ws.rig.cost', max: null },
    { id: 'chief', title: 'Начальник участка', text: 'зонное оборудование по потребности', cost: 'ws.chief.cost', max: null }
  ];

  // Hired automation of the well (for money, from a depth).
  var STAFF = [
    { id: 'master', title: 'Мастер смены', text: 'сам нанимает бригады', depth: 'master.depth', cost: 'master.cost' },
    { id: 'mechanic', title: 'Механик', text: 'сам поднимает бур, когда скорость падает', depth: 'mechanic.depth', cost: 'mechanic.cost' }
  ];

  // Online events, every 2–3 minutes; `zone` — the zone they need.
  var EVENTS = [
    { id: 'soft', title: 'Мягкий пласт', text: 'скорость ×5 на 20 с', take: 'Пройти' },
    { id: 'nugget', title: 'Самородок', text: '+3 минуты дохода', take: 'Забрать' },
    { id: 'stream', title: 'Подземный ручей', text: 'насосы не нужны 60 с', take: 'Пустить', zone: 'water' },
    { id: 'gas', title: 'Выброс газа', text: 'стравить: +2 минуты дохода', take: 'Стравить', zone: 'gas' },
    { id: 'overheat', title: 'Перегрев', text: 'сброс тепла: скорость ×3 на 15 с', take: 'Сбросить тепло', zone: 'heat' },
    { id: 'quartz', title: 'Жила кварца', text: 'ценность ×3 на 30 с', take: 'Взять' },
    { id: 'cavern', title: 'Каверна', text: 'артефакт с шансом 30 %', take: 'Осмотреть' },
    { id: 'crown', title: 'Сломанная коронка', text: 'ремонт за 2 минуты дохода: +5 % мощности до конца скважины', take: 'Починить', skip: 'Пропустить' },
    { id: 'collapse', title: 'Обвал выше забоя', text: 'бригады ×2 на 60 с — разбирают породу', take: 'Разобрать' },
    { id: 'drift', title: 'Старый штрек', text: '+20 м сразу', take: 'Пройти' },
    { id: 'geologists', title: 'Геологи в гостях', text: 'следующий Чертёж за 125 м вместо 250 м', take: 'Принять' },
    { id: 'lake', title: 'Подземное озеро', text: 'экспедиция бесплатно', take: 'Принять', zone: 'void' },
    { id: 'silence', title: 'Тишина', text: 'ничего, но следующая находка гарантирована', take: 'Прислушаться' },
    { id: 'druse', title: 'Друза кристаллов', text: 'кристаллы ×5 на 60 с', take: 'Взять', zone: 'crystal' },
    { id: 'voice', title: 'Голос из глубины', text: 'правило скважины — на выбор из двух', take: 'Первое', skip: 'Второе', zone: 'echo' }
  ];

  var EXPEDITIONS = ['exp.short', 'exp.mid', 'exp.long', 'exp.far'];

  function find(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  function num(v, d) {
    var n = Number(v);
    return v === undefined || v === null || n !== n ? d : n;
  }

  // ---- the parts of the state ----

  function coreState() {
    return { bp: 0, bpAt: 0, record: 0, ws: {} };
  }

  function freshRun(cfg) {
    var crews = [];
    for (var i = 0; i < CREWS.length; i++) crews.push(0);
    return {
      depth: 0, money: Big.str(Big.of(cfg ? cfg['start.money'] : 50)), earned: '0e0', drill: 0, crews: crews,
      eq: { pump: 0, vent: 0, cool: 0, sink: 0, geo: 0, crown: 0 },
      heat: 0, over: false, crystals: 0, lenses: 0, wear: 0, repairs: 0,
      buffs: {}, event: null, eventAt: 0, mark: 100, sure: false, rule: null, ruleAt: false,
      exp: null, freeExp: false, finds: [], marks: [],
      staff: { master: false, mechanic: false }, autoOff: {},
      bought: { crews: 0, drill: 0, eq: 0 }, start: 0
    };
  }

  function L(state, id) { return state.layers[id] || { currency: '0e0', count: 0, state: {} }; }

  function cs(state) {
    var l = state.layers[CORE];
    if (!l) return coreState();
    var s = l.state || (l.state = {});
    if (typeof s.bp !== 'number') s.bp = 0;
    if (typeof s.bpAt !== 'number') s.bpAt = 0;
    if (typeof s.record !== 'number') s.record = 0;
    if (!s.ws || typeof s.ws !== 'object') s.ws = {};
    return s;
  }

  function ws(state, id) { return num(cs(state).ws[id], 0); }

  function coreCount(state) { return Big.toNumber(Big.of(L(state, CORE).currency, 0)); }

  function maps(state) { return Big.toNumber(Big.of(L(state, EDGE).currency, 0)); }

  function edgeKind(state) {
    var s = L(state, EDGE).state || {};
    return s.kind && find(EDGES, s.kind) ? s.kind : 'base';
  }

  function meta(state) {
    var m = state.meta;
    if (typeof m.record !== 'number') m.record = 0;
    if (!m.artifacts || typeof m.artifacts !== 'object') m.artifacts = {};
    if (!m.relics || typeof m.relics !== 'object') m.relics = {};
    if (typeof m.rocks !== 'number') m.rocks = 0;
    if (typeof m.wells !== 'number') m.wells = 0;
    return m;
  }

  // ---- the physics of the depth ----

  /** Where a depth lies: the circle (each 10 000 m) and the depth within it. */
  function circleOf(d, cfg) {
    var c = Math.floor(Math.max(0, d) / cfg['circle.depth']);
    return { circle: c, local: d - c * cfg['circle.depth'] };
  }

  /** The depth where a zone starts in this edge (null — none in this edge). */
  function zoneStart(state, zoneId, cfg) {
    var z = find(ZONES, zoneId);
    if (!z || !z.start) return 0;
    var kind = edgeKind(state);
    if (zoneId === 'heat') {
      if (kind === 'ice') return null;
      if (kind === 'volcanic') return cfg['edge.volcanic.heat'];
    }
    if (zoneId === 'water' && kind === 'salt') return null;
    if (zoneId === 'crystal' && kind === 'salt') return cfg['edge.salt.crystal'];
    return cfg[z.start];
  }

  /** Is the zone active at the depth d (local depth past its start). */
  function inZone(state, zoneId, d, cfg) {
    var at = zoneStart(state, zoneId, cfg);
    if (at === null) return false;
    return circleOf(d, cfg).local >= at;
  }

  /** The zone of the depth: the deepest started zone (for the cut and the texts). */
  function zoneAt(state, d, cfg) {
    var best = ZONES[0];
    var bestAt = 0;
    for (var i = 1; i < ZONES.length; i++) {
      var at = zoneStart(state, ZONES[i].id, cfg);
      if (at !== null && circleOf(d, cfg).local >= at && at >= bestAt) {
        best = ZONES[i];
        bestAt = at;
      }
    }
    return best;
  }

  /** The zone is open forever (the record of all wells passed it once). */
  function zoneOpen(state, zoneId, cfg) {
    var at = zoneStart(state, zoneId, cfg);
    if (at === null) return false;
    return meta(state).record >= at || state.run.depth >= at;
  }

  /** The next zone below the depth: {zone, at} or null. */
  function nextZone(state, d, cfg) {
    var c = circleOf(d, cfg);
    var best = null;
    for (var i = 1; i < ZONES.length; i++) {
      var at = zoneStart(state, ZONES[i].id, cfg);
      if (at === null || at <= c.local) continue;
      if (!best || at < best.local) best = { zone: ZONES[i], local: at, at: c.circle * cfg['circle.depth'] + at };
    }
    if (!best) return { zone: ZONES[0], at: (c.circle + 1) * cfg['circle.depth'], circle: true };
    return best;
  }

  /** The growth of hardness per 100 m: 2.2, ×0.97 for each level of the carbide bit, not below 1.6. */
  function growth(state, cfg) {
    var g = cfg['hard.base'] * Math.pow(cfg['ws.bit.factor'], ws(state, 'bit'));
    g = Math.max(cfg['ws.bit.min'], g);
    if (state.run.rule === 'soft') g = Math.pow(g, cfg['echo.soft']);
    return g;
  }

  /** log10 of the hardness at d. */
  function lgHard(state, d, cfg) {
    var c = circleOf(d, cfg);
    var lg = (c.local / 100) * Math.log(growth(state, cfg)) / LN10 + c.circle * Math.log(cfg['circle.mult']) / LN10;
    if (edgeKind(state) === 'ice') lg += Math.log(cfg['edge.ice.hard']) / LN10;
    return lg;
  }

  /** log10 of the value of the layer at d. */
  function lgValue(state, d, cfg) {
    var c = circleOf(d, cfg);
    var lg = (c.local / 100) * Math.log(cfg['value.base']) / LN10 + c.circle * Math.log(cfg['circle.mult']) / LN10;
    if (edgeKind(state) === 'volcanic') lg += Math.log(cfg['edge.volcanic.value']) / LN10;
    if (state.run.rule === 'rich') lg += Math.log(cfg['echo.rich']) / LN10;
    return lg;
  }

  function value(state, d, cfg) { return Big.pow10(lgValue(state, d === undefined ? state.run.depth : d, cfg)); }

  // ---- bonuses ----

  /** Artifact bonuses as fractions: {income, power, find} including the sets and the vault. */
  function bonuses(state, cfg) {
    var m = meta(state);
    var out = { income: 0, power: 0, find: 0 };
    var scale = cfg['artifact.scale'];
    ARTIFACTS.forEach(function (a) { if (m.artifacts[a.id]) out[a.kind] += a.pct / 100 * scale; });
    SETS.forEach(function (s) { if (setDone(state, s.id)) out[s.kind] += cfg['artifact.setBonus']; });
    var relics = 0;
    RELICS.forEach(function (r) { if (m.relics[r.id]) relics++; });
    out.income += relics * cfg['vault.each'];
    if (relics === RELICS.length) {
      out.income += cfg['vault.bonus'];
      out.power += cfg['vault.bonus'];
    }
    return out;
  }

  function setDone(state, setId) {
    var m = meta(state);
    for (var i = 0; i < ARTIFACTS.length; i++) if (ARTIFACTS[i].set === setId && !m.artifacts[ARTIFACTS[i].id]) return false;
    return true;
  }

  function coreMult(state, cfg) { return 1 + coreCount(state) * cfg['core.bonus']; }

  function buff(state, name, now) { return num(state.run.buffs[name], 0) > now; }

  /** How well the equipment covers the zone's need at d: 0..1 (1 when the zone is not active). */
  function coverage(state, eqId, d, cfg, now) {
    var e = find(EQUIP, eqId);
    if (!inZone(state, e.zone, d, cfg)) return 1;
    if ((eqId === 'pump' || eqId === 'vent') && state.run.rule === 'dry') return 1;
    if (eqId === 'pump' && buff(state, 'stream', now)) return 1;
    var n = need(state, eqId, d, cfg);
    if (!(n > 0)) return 1;
    return Math.min(1, capacity(state, eqId, state.run.eq[eqId], cfg) / n);
  }

  /** The need of a zone at d (m³/min of water or gas, MW of magma heat). */
  function need(state, eqId, d, cfg) {
    var e = find(EQUIP, eqId);
    if (eqId === 'cool') return 0;
    var at = zoneStart(state, e.zone, cfg);
    if (at === null) return 0;
    var local = circleOf(d, cfg).local - at;
    if (local < 0) return 0;
    return cfg[e.zone + '.need'] * Math.pow(cfg[e.zone + '.growth'], local / 100);
  }

  function capacity(state, eqId, level, cfg) {
    if (!(level > 0)) return 0;
    return cfg[eqId + '.rate'] * Math.pow(cfg[eqId + '.power'], level - 1);
  }

  function eqCost(state, eqId, cfg) {
    var level = num(state.run.eq[eqId], 0);
    return Big.mul(Big.mul(cfg[eqId + '.cost'], Big.pow(cfg[eqId + '.growth'], level)), value(state, state.run.depth, cfg));
  }

  /** The speed multiplier of the zones at d: water, gas, magma without equipment ×0.5 each. */
  function zoneMult(state, d, cfg, now, offline) {
    var p = cfg['zone.penalty'];
    var m = 1;
    ['pump', 'vent', 'sink'].forEach(function (id) {
      var c = coverage(state, id, d, cfg, now);
      m *= p + (1 - p) * c;
    });
    if (inZone(state, 'heat', d, cfg) && state.run.over) m *= offline ? Math.max(cfg['heat.overMult'], cfg['zone.penalty']) : cfg['heat.overMult'];
    if (inZone(state, 'pressure', d, cfg)) m *= 1 - Math.min(1, state.run.wear) * cfg['wear.penalty'];
    return m;
  }

  /** log10 of the drill's power (without the links' multiplier). */
  function lgPower(state, cfg, now, offline) {
    var r = state.run;
    var lg = r.drill * Math.log(cfg['drill.mult']) / LN10;
    var mult = coreMult(state, cfg) * (1 + bonuses(state, cfg).power) * (1 + r.lenses * cfg['lens.bonus']) * (1 + r.repairs * cfg['event.crown.power']);
    if (ws(state, 'motor')) mult *= cfg['ws.motor.mult'] * Math.pow(cfg['ws.motor.step'], ws(state, 'motor') - 1);
    if (r.rule === 'hot') mult *= cfg['echo.hotPower'];
    if (r.rule === 'busy') mult *= cfg['echo.busyPower'];
    mult *= zoneMult(state, r.depth, cfg, now, offline);
    if (!offline) {
      if (buff(state, 'soft', now)) mult *= cfg['event.soft.mult'];
      if (buff(state, 'burst', now)) mult *= cfg['heat.burstMult'];
    }
    if (buff(state, 'strike', now)) mult *= cfg['strike.mult'];
    return lg + Math.log(Math.max(1e-12, mult)) / LN10;
  }

  /** The drill's speed now, m/s (mult — the links' multiplier). */
  function speed(state, cfg, mult, now, offline) {
    var lg = lgPower(state, cfg, now || 0, offline) - lgHard(state, state.run.depth, cfg);
    return Math.pow(10, lg) * (mult || 1);
  }

  /** The speed after one more drill level (for the button «0,42 → 0,55 м/с»). */
  function speedNext(state, cfg, mult, now) {
    state.run.drill++;
    var v = speed(state, cfg, mult, now);
    state.run.drill--;
    return v;
  }

  // ---- crews and money ----

  function crewMilestones(cfg) {
    return String(cfg['crew.milestones']).split(',').map(Number).filter(function (n) { return n > 0; });
  }

  /** Milestones passed by n crews: the listed ones, then one every crew.milestoneStep without end. */
  function milestonesPassed(n, cfg) {
    var list = crewMilestones(cfg);
    var k = 0;
    for (var i = 0; i < list.length; i++) if (n >= list[i]) k++;
    var step = num(cfg['crew.milestoneStep'], 0);
    var last = list.length ? list[list.length - 1] : 0;
    if (step > 0 && n > last) k += Math.floor((n - last) / step);
    return k;
  }

  function milestoneMult(n, cfg) { return Math.pow(cfg['crew.milestoneMult'], milestonesPassed(n, cfg)); }

  function nextMilestone(n, cfg) {
    var list = crewMilestones(cfg);
    for (var i = 0; i < list.length; i++) if (list[i] > n) return list[i];
    var step = num(cfg['crew.milestoneStep'], 0);
    var last = list.length ? list[list.length - 1] : 0;
    if (!(step > 0)) return null;
    return last + (Math.floor((n - last) / step) + 1) * step;
  }

  /** Money a second of crew tier i at value 1 (one crew × its milestones). */
  function crewBase(i, cfg) { return Math.pow(cfg['crew.tierIncome'], i) * cfg['crew.income']; }

  function crewMult(state, cfg, now) {
    var r = state.run;
    var m = coreMult(state, cfg) * (1 + bonuses(state, cfg).income);
    if (r.rule === 'busy') m *= cfg['echo.busyCrews'];
    if (r.eq.geo > 0 && inZone(state, 'magma', r.depth, cfg)) m *= 1 + (cfg['geo.mult'] - 1) * coverage(state, 'sink', r.depth, cfg, now);
    if (buff(state, 'collapse', now)) m *= cfg['event.collapse.mult'];
    if (buff(state, 'quartz', now)) m *= cfg['event.quartz.mult'];
    return m;
  }

  /** Money a second at value 1 (Σ crews · milestones · bonuses), as a plain number. */
  function baseIncome(state, cfg, now) {
    var sum = 0;
    for (var i = 0; i < CREWS.length; i++) {
      var n = state.run.crews[i];
      if (n > 0) sum += n * crewBase(i, cfg) * milestoneMult(n, cfg);
    }
    return sum * crewMult(state, cfg, now);
  }

  /** Money a second now (without the links' multiplier). */
  function income(state, cfg, now) { return Big.mul(value(state, state.run.depth, cfg), baseIncome(state, cfg, now || 0)); }

  function crewCost(state, i, cfg, count) {
    var base = Big.mul(cfg['crew.cost'], Big.pow(cfg['crew.tierCost'], i));
    if (ws(state, 'crews')) base = Big.mul(base, 1 - cfg['ws.crews.discount']);
    return Big.costGeom(base, cfg['crew.growth'], state.run.crews[i], count || 1);
  }

  function drillCost(state, cfg) { return Big.mul(cfg['drill.cost'], Big.pow(cfg['drill.growth'], state.run.drill)); }

  /** Is the tier open (the previous one has at least one crew). */
  function crewOpen(state, i) { return i === 0 || state.run.crews[i - 1] > 0; }

  function pay(state, price) {
    if (Big.lt(state.run.money, price)) return false;
    state.run.money = Big.sub(state.run.money, price);
    return true;
  }

  function earn(state, amount) {
    state.run.money = Big.add(state.run.money, amount);
    state.run.earned = Big.add(state.run.earned, amount);
  }

  function buyDrill(state, cfg) {
    if (!pay(state, drillCost(state, cfg))) return false;
    state.run.drill++;
    return true;
  }

  function buyCrew(state, i, cfg, count) {
    count = count || 1;
    if (!crewOpen(state, i)) return 0;
    if (!pay(state, crewCost(state, i, cfg, count))) return 0;
    state.run.crews[i] += count;
    return count;
  }

  /** How many crews of tier i: 'one' 1, 'ten' 10, 'mile' to the next milestone, 'max' as many as money buys. */
  function crewCount(state, i, cfg, how) {
    var n = state.run.crews[i];
    if (how === 'ten') return 10;
    if (how === 'mile') return Math.max(1, (nextMilestone(n, cfg) || n + 1) - n);
    if (how === 'max') {
      var base = Big.mul(cfg['crew.cost'], Big.pow(cfg['crew.tierCost'], i));
      if (ws(state, 'crews')) base = Big.mul(base, 1 - cfg['ws.crews.discount']);
      return Math.max(1, Big.maxBuy(state.run.money, base, cfg['crew.growth'], n));
    }
    return 1;
  }

  /** The best crew to hire now: the most money a second per money spent. */
  function bestCrew(state, cfg) {
    var best = -1;
    var score = -1;
    for (var i = 0; i < CREWS.length; i++) {
      if (!crewOpen(state, i)) continue;
      var n = state.run.crews[i];
      var gainNow = (n + 1) * crewBase(i, cfg) * milestoneMult(n + 1, cfg) - n * crewBase(i, cfg) * milestoneMult(n, cfg);
      var s = gainNow / Big.toNumber(crewCost(state, i, cfg));
      if (s > score) {
        score = s;
        best = i;
      }
    }
    return best;
  }

  /** Buys the best thing by the rule of «Темп»: the drill when slow or cheap, else the best crew. */
  function buy(state, cfg, now) {
    now = now || 0;
    var v = speed(state, cfg, 1, now);
    var inc = Big.toNumber(income(state, cfg, now));
    var dc = drillCost(state, cfg);
    if (v < cfg['bot.slow'] || Big.toNumber(dc) < cfg['bot.cheapSec'] * inc) return buyDrill(state, cfg);
    var i = bestCrew(state, cfg);
    return i >= 0 && buyCrew(state, i, cfg) > 0;
  }

  /** The pumps hold the inflow of water at the current depth by themselves (no stream, no dry rule). */
  function pumpsHold(state, cfg) {
    var d = state.run.depth;
    if (!inZone(state, 'water', d, cfg)) return false;
    var n = need(state, 'pump', d, cfg);
    return n > 0 && capacity(state, 'pump', state.run.eq.pump, cfg) >= n;
  }

  /**
   * Every purchase of equipment goes here — the player's button, the Начальник участка (auto), the bot.
   * A pump that makes the pumps hold the water marks «Водоносный горизонт» (meta.aquifer); the
   * screen turns the mark into the achievement.
   */
  function buyEq(state, eqId, cfg) {
    var e = find(EQUIP, eqId);
    if (!e || !zoneOpen(state, e.zone, cfg)) return false;
    if (!pay(state, eqCost(state, eqId, cfg))) return false;
    state.run.eq[eqId]++;
    if (eqId === 'pump' && pumpsHold(state, cfg)) meta(state).aquifer = 1;
    return true;
  }

  function geoCost(state, cfg) { return Big.mul(cfg['geo.cost'], value(state, state.run.depth, cfg)); }

  function buyGeo(state, cfg) {
    if (state.run.eq.geo > 0 || !zoneOpen(state, 'magma', cfg)) return false;
    if (!pay(state, geoCost(state, cfg))) return false;
    state.run.eq.geo = 1;
    return true;
  }

  function crownCost(state, cfg) { return Big.mul(Big.mul(cfg['crown.cost'], Big.pow(cfg['crown.growth'], state.run.eq.crown)), value(state, state.run.depth, cfg)); }

  /** A diamond crown: wear back to zero, and each next crown wears slower. */
  function buyCrown(state, cfg) {
    if (!zoneOpen(state, 'pressure', cfg)) return false;
    if (!pay(state, crownCost(state, cfg))) return false;
    state.run.eq.crown++;
    state.run.wear = 0;
    return true;
  }

  function lensCost(state, cfg) { return Math.ceil(cfg['lens.cost'] * Math.pow(cfg['lens.growth'], state.run.lenses)); }

  /** Cuts crystals into a lens: +10 % power to the end of the well. */
  function cutLens(state, cfg) {
    var c = lensCost(state, cfg);
    if (state.run.crystals < c) return false;
    state.run.crystals -= c;
    state.run.lenses++;
    return true;
  }

  function staffCost(state, id, cfg) {
    var s = find(STAFF, id);
    return Big.of(cfg[s.cost]);
  }

  function staffOpen(state, id, cfg) {
    var s = find(STAFF, id);
    return state.run.depth >= cfg[s.depth] || meta(state).record >= cfg[s.depth];
  }

  function hire(state, id, cfg) {
    if (state.run.staff[id] || !staffOpen(state, id, cfg)) return false;
    if (!pay(state, staffCost(state, id, cfg))) return false;
    state.run.staff[id] = true;
    return true;
  }

  /** Reset of heat by hand: heat to zero and a burst of the drill. */
  function vent(state, cfg, now) {
    var r = state.run;
    if (!inZone(state, 'heat', r.depth, cfg) || r.heat < cfg['heat.resetMin']) return false;
    r.heat = 0;
    r.over = false;
    r.buffs.burst = now + cfg['heat.burstSec'] * 1000;
    return true;
  }

  function expCost(state, k, cfg) {
    return Big.mul(Big.mul(cfg['exp.cost'], cfg[EXPEDITIONS[k]]), value(state, state.run.depth, cfg));
  }

  /** Sends an expedition into the caves (5 000 m): k — 0..3 for 5/15/30/60 minutes. */
  function expedition(state, k, cfg, now) {
    var r = state.run;
    if (r.exp || !inZone(state, 'void', r.depth, cfg) || k < 0 || k >= EXPEDITIONS.length) return false;
    if (r.freeExp) r.freeExp = false;
    else if (!pay(state, expCost(state, k, cfg))) return false;
    var minutes = cfg[EXPEDITIONS[k]];
    r.exp = { k: k, minutes: minutes, from: now, until: now + minutes * 60000 };
    return true;
  }

  // ---- finds ----

  function findChance(state, cfg) {
    var p = cfg['find.chance'] * (1 + bonuses(state, cfg).find);
    if (ws(state, 'seismic')) p *= cfg['ws.seismic.mult'];
    if (state.run.rule === 'lucky') p *= cfg['echo.lucky'];
    return Math.min(1, p);
  }

  /** Rolls a find: an artifact (in the vaults sometimes a relic); one not yet found is likelier. */
  function rollFind(state, rng, cfg, d) {
    var m = meta(state);
    if (inZone(state, 'vault', d, cfg) && rng.chance(cfg['vault.chance'])) {
      var relic = rng.pick(RELICS);
      return { kind: 'relic', id: relic.id, title: relic.title, depth: Math.round(d) };
    }
    var missing = ARTIFACTS.filter(function (a) { return !m.artifacts[a.id]; });
    var a = missing.length && rng.chance(cfg['find.newChance']) ? rng.pick(missing) : rng.pick(ARTIFACTS);
    return { kind: 'artifact', id: a.id, title: a.title, depth: Math.round(d) };
  }

  /** Takes a find into the collection (or sells a repeat for minutes of income). Returns a line. */
  function collect(state, cfg, index, now) {
    var r = state.run;
    var f = r.finds[index === undefined ? 0 : index];
    if (!f) return null;
    r.finds.splice(index === undefined ? 0 : index, 1);
    var m = meta(state);
    var bag = f.kind === 'relic' ? m.relics : m.artifacts;
    if (bag[f.id]) {
      var amount = Big.mul(income(state, cfg, now), cfg['find.repeatMin'] * 60);
      amount = Big.max(amount, cfg['start.money']);
      earn(state, amount);
      bag[f.id]++;
      return { find: f, repeat: true, amount: Big.str(amount) };
    }
    bag[f.id] = 1;
    return { find: f, repeat: false };
  }

  // ---- crossing of marks: every 100 m — a new rock, a find roll, blueprints, zones, the echo ----

  function cross(state, cfg, rng, now, offline, report) {
    var r = state.run;
    var m = meta(state);
    var c = cs(state);
    var every = cfg['blueprint.every'];
    if (!(c.bpAt > 0)) c.bpAt = every;
    var guard = 0;
    while (r.depth >= r.mark && guard++ < 1000) {
      var at = r.mark;
      r.mark += 100;
      var rock = Math.floor(at / 100);
      if (rock > m.rocks) m.rocks = rock;
      if (r.sure || (rng && rng.chance(findChance(state, cfg)))) {
        r.sure = false;
        var f = rollFind(state, rng || { chance: function () { return false; }, pick: function (l) { return l[0]; } }, cfg, at);
        r.finds.push(f);
        if (r.finds.length > cfg['find.maxWaiting']) r.finds.shift();
        if (r.marks.length < 200) r.marks.push(at);
        if (offline && r.away) r.away.finds.push(f.title);
      }
      if (inZone(state, 'echo', at, cfg) && !r.ruleAt) {
        r.ruleAt = true;
        if (rng) r.rule = rng.pick(RULES).id;
        if (offline && report) report('Эхо: у скважины правило «' + find(RULES, r.rule).title + '»');
      }
    }
    if (r.depth > c.record) c.record = r.depth;
    if (r.depth > m.record) m.record = r.depth;
    while (c.record >= c.bpAt && guard++ < 2000) {
      c.bp++;
      c.bpAt += every;
      if (offline && r.away) r.away.bp++;
    }
  }

  /** Moves the drill down by `meters` at once (a drift, a chest), with everything the marks give. */
  function advance(state, meters, cfg, rng, now) {
    state.run.depth += meters;
    cross(state, cfg, rng, now, false, null);
  }

  // ---- automation ----

  function auto(state, cfg, now, offline) {
    var r = state.run;
    var n = 0;
    var bought = { crews: 0, drill: 0, eq: 0 };
    if (r.staff.mechanic && !r.autoOff.mechanic) {
      while (n < 20 && speed(state, cfg, 1, now, offline) < cfg['mechanic.speed'] && buyDrill(state, cfg)) {
        n++;
        bought.drill++;
      }
    }
    if (ws(state, 'chief') && !r.autoOff.chief) {
      ['pump', 'vent', 'sink'].forEach(function (id) {
        var e = find(EQUIP, id);
        var k = 0;
        while (k < 5 && inZone(state, e.zone, r.depth, cfg) && coverage(state, id, r.depth, cfg, now) < 1 && buyEq(state, id, cfg)) {
          k++;
          bought.eq++;
        }
      });
      if (inZone(state, 'heat', r.depth, cfg) && r.heat > cfg['chief.heat'] && buyEq(state, 'cool', cfg)) bought.eq++;
      if (inZone(state, 'pressure', r.depth, cfg) && r.wear > cfg['chief.wear'] && buyCrown(state, cfg)) bought.eq++;
    }
    if (r.staff.master && !r.autoOff.master) {
      var k2 = 0;
      while (k2 < 20) {
        var i = bestCrew(state, cfg);
        if (i < 0 || !buyCrew(state, i, cfg)) break;
        k2++;
        bought.crews++;
      }
    }
    r.bought.crews += bought.crews;
    r.bought.drill += bought.drill;
    r.bought.eq += bought.eq;
    if (offline && r.away) {
      r.away.crews += bought.crews;
      r.away.drill += bought.drill;
      r.away.eq += bought.eq;
    }
  }

  // ---- events ----

  function eventOk(state, e, cfg) { return !e.zone || inZone(state, e.zone, state.run.depth, cfg); }

  function spawnEvent(state, ctx) {
    var r = state.run;
    var cfg = ctx.config;
    var rng = ctx.rng;
    if (!rng) return;
    var now = ctx.now;
    if (r.event && r.event.until <= now) r.event = null;
    if (!r.eventAt) r.eventAt = now + rng.range(cfg['event.minSec'], cfg['event.maxSec']) * 1000;
    if (now < r.eventAt || r.event) return;
    r.eventAt = now + rng.range(cfg['event.minSec'], cfg['event.maxSec']) * 1000;
    var list = EVENTS.filter(function (e) { return eventOk(state, e, cfg); });
    var e = rng.pick(list);
    if (!e) return;
    r.event = { id: e.id, until: now + cfg['event.cardSec'] * 1000 };
    if (e.id === 'voice') {
      var a = rng.pick(RULES);
      var b = rng.pick(RULES.filter(function (x) { return x.id !== a.id; }));
      r.event.options = [a.id, b.id];
    }
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
    var minute = Big.mul(income(state, cfg, now), 60);
    var sec = function (key) { return now + cfg[key] * 1000; };
    if (id === 'soft') r.buffs.soft = sec('event.soft.sec');
    else if (id === 'nugget') earn(state, Big.max(Big.mul(minute, cfg['event.nugget.min']), cfg['start.money']));
    else if (id === 'stream') r.buffs.stream = sec('event.stream.sec');
    else if (id === 'gas') earn(state, Big.max(Big.mul(minute, cfg['event.gas.min']), cfg['start.money']));
    else if (id === 'overheat') {
      r.heat = 0;
      r.over = false;
      r.buffs.burst = sec('event.overheat.sec');
    } else if (id === 'quartz') r.buffs.quartz = sec('event.quartz.sec');
    else if (id === 'cavern') {
      if (rng && rng.chance(cfg['event.cavern.chance'])) {
        r.finds.push(rollFind(state, rng, cfg, r.depth));
        return 'В каверне нашлась находка';
      }
      return 'Каверна пуста';
    } else if (id === 'crown') {
      if (choice === 1) return 'Коронку оставили как есть';
      if (!pay(state, Big.mul(minute, cfg['event.crown.min']))) return 'Не хватает денег на ремонт';
      r.repairs++;
      return 'Коронка починена: мощность +' + Math.round(cfg['event.crown.power'] * 100) + ' %';
    } else if (id === 'collapse') r.buffs.collapse = sec('event.collapse.sec');
    else if (id === 'drift') advance(state, cfg['event.drift.m'], cfg, rng, now);
    else if (id === 'geologists') {
      var c = cs(state);
      c.bpAt = Math.max(c.record + 1, c.bpAt - (cfg['blueprint.every'] - cfg['blueprint.geologists']));
    } else if (id === 'lake') r.freeExp = true;
    else if (id === 'silence') r.sure = true;
    else if (id === 'druse') r.buffs.druse = sec('event.druse.sec');
    else if (id === 'voice') {
      var pick = ev.options ? ev.options[choice === 1 ? 1 : 0] : null;
      if (pick) r.rule = pick;
      return pick ? 'Правило скважины: «' + find(RULES, pick).title + '»' : null;
    }
    var e = find(EVENTS, id);
    return e ? e.title + ': ' + e.text : null;
  }

  // ---- the engine's functions ----

  function init(ctx) {
    var cfg = ctx && ctx.config;
    return {
      run: freshRun(cfg),
      layers: { core: { state: coreState() }, edge: { state: { kind: 'base', pick: false } } },
      meta: { record: 0, artifacts: {}, relics: {}, rocks: 0, wells: 0 }
    };
  }

  function offlineRate(state, cfg) {
    return Math.min(1, cfg['offline.rate'] + ws(state, 'lift') * cfg['ws.lift.step']);
  }

  function tick(state, dt, ctx) {
    var cfg = ctx.config;
    var r = state.run;
    var now = ctx.now || 0;
    var offline = !!ctx.offline;
    meta(state);
    if (!offline) {
      if (r.away) delete r.away;
      spawnEvent(state, ctx);
    } else if (!r.away) {
      r.away = { depth: r.depth, money: Big.str(r.money), finds: [], crews: 0, drill: 0, eq: 0, bp: 0, rock: Math.floor(r.depth / 100), exp: [] };
    }
    if (r.exp && now >= r.exp.until) expBack(state, cfg, ctx);
    auto(state, cfg, now, offline);
    var eff = offline ? offlineRate(state, cfg) : 1;
    var mult = (ctx.mult || 1) * eff;
    var g = growth(state, cfg);
    var lnG = Math.log(g);
    var v = speed(state, cfg, mult, now, offline);
    var a = v * lnG / 100;
    var x = a * dt;
    var dd = x > 1e-9 ? (100 / lnG) * Math.log(1 + x) : v * dt;
    // The money of the step: ∫ V(d(t)) dt = V0 · ((1 + a t)^(β+1) − 1) / (a (β + 1)), β = ln 1.15 / ln g.
    var beta = Math.log(cfg['value.base']) / lnG;
    var factor = x > 1e-9 ? (Math.exp((beta + 1) * Math.log(1 + x)) - 1) / (a * (beta + 1)) : dt;
    var base = baseIncome(state, cfg, now) * mult;
    if (base > 0) earn(state, Big.mul(value(state, r.depth, cfg), base * factor));
    var d0 = r.depth;
    r.depth += dd;
    // Heat, crystals, wear go by the metres drilled.
    if (inZone(state, 'heat', r.depth, cfg)) {
      var heatK = r.rule === 'hot' ? cfg['echo.hotHeat'] : 1;
      r.heat += dd * cfg['heat.perMeter'] * heatK - dt * (cfg['heat.passive'] + capacity(state, 'cool', r.eq.cool, cfg));
      if (r.heat >= 100) {
        r.heat = 100;
        r.over = true;
      }
      if (r.heat <= cfg['heat.recover']) r.over = false;
      if (r.heat < 0) r.heat = 0;
    } else {
      r.heat = 0;
      r.over = false;
    }
    if (inZone(state, 'crystal', r.depth, cfg)) r.crystals += dd * cfg['crystal.perMeter'] * (buff(state, 'druse', now) ? cfg['event.druse.mult'] : 1);
    if (inZone(state, 'pressure', r.depth, cfg)) r.wear = Math.min(1, r.wear + dd * cfg['wear.perMeter'] * Math.pow(cfg['crown.wearMult'], r.eq.crown));
    var z0 = zoneAt(state, d0, cfg);
    var z1 = zoneAt(state, r.depth, cfg);
    if (offline && ctx.report && z0.id !== z1.id) ctx.report('Новая зона: ' + z1.title + ' (' + Fmt.num(Math.floor(r.depth)) + ' м)');
    cross(state, cfg, ctx.rng, now, offline, ctx.report);
  }

  /** The expedition came back: money of its minutes and maybe an artifact. */
  function expBack(state, cfg, ctx) {
    var r = state.run;
    var e = r.exp;
    r.exp = null;
    var amount = Big.mul(income(state, cfg, ctx.now), e.minutes * 60 * cfg['exp.income']);
    earn(state, amount);
    var got = ctx.rng && ctx.rng.chance(Math.min(1, e.minutes * cfg['exp.chance']));
    var line = 'Экспедиция на ' + e.minutes + ' мин вернулась: +' + Fmt.num(amount);
    if (got) {
      var f = rollFind(state, ctx.rng, cfg, r.depth);
      r.finds.push(f);
      line += ' и ' + f.title.toLowerCase();
    }
    r.lastExp = line;
    if (ctx.offline && r.away) r.away.exp.push(line);
  }

  function prestigeGain(state, layerId, cfg) {
    if (layerId === EDGE) {
      var rec = cs(state).record;
      if (rec < cfg['edge.depth']) return Big.ZERO;
      return Big.of(Math.floor(rec / cfg['edge.per']));
    }
    var d = state.run.depth;
    if (d < cfg['core.minDepth']) return Big.ZERO;
    var gain = Math.floor(Math.pow(d / cfg['core.depth'], cfg['core.power']) / cfg['core.div']);
    return Big.of(Math.floor(gain * mapsMult(maps(state), cfg)));
  }

  /** Underground maps: each one multiplies the Керн received (×2: 2 maps ×4, 3 maps ×8). */
  function mapsMult(n, cfg) { return Math.pow(cfg['edge.mult'], n); }

  function bonus(state, layerId, amount, cfg) {
    var n = Big.toNumber(Big.of(amount, 0));
    if (layerId === EDGE) return mapsMult(n, cfg);
    return 1 + n * cfg['core.bonus'];
  }

  function onPrestige(state, layerId, before, ctx) {
    var cfg = ctx.config;
    var m = meta(state);
    m.wells++;
    if (layerId === EDGE) {
      state.layers[CORE].state = coreState();
      state.layers[EDGE].state = { kind: 'base', pick: true, last: edgeKind(before) };
    }
    var c = cs(state);
    var r = state.run;
    if (!r.crews) state.run = r = freshRun(cfg);
    if (ws(state, 'rope')) {
      r.depth = Math.floor(c.record * cfg['ws.rope.share']);
      r.start = r.depth;
      r.mark = Math.floor(r.depth / 100) * 100 + 100;
    }
    if (ws(state, 'rig')) {
      r.staff.master = true;
      r.staff.mechanic = true;
    }
  }

  function chooseEdge(state, kind) {
    var s = L(state, EDGE).state;
    if (!find(EDGES, kind) || !state.layers[EDGE]) return false;
    state.layers[EDGE].state.kind = kind;
    state.layers[EDGE].state.pick = false;
    return true;
  }

  function wsCost(state, id, cfg) {
    var w = find(WORKSHOP, id);
    var level = ws(state, id);
    return Math.round(cfg[w.cost] * (w.growth ? Math.pow(cfg[w.growth], level) : 1));
  }

  function wsMax(state, id, cfg) {
    var w = find(WORKSHOP, id);
    if (id === 'bit') {
      // Levels until the growth reaches the floor of 1.6.
      var n = Math.ceil(Math.log(cfg['ws.bit.min'] / cfg['hard.base']) / Math.log(cfg['ws.bit.factor']));
      return Math.max(1, Math.min(cfg['ws.bit.max'], n));
    }
    if (w.endless) return Infinity;
    return w.max ? cfg[w.max] : 1;
  }

  function buyWs(state, id, cfg) {
    var c = cs(state);
    if (!find(WORKSHOP, id) || ws(state, id) >= wsMax(state, id, cfg)) return false;
    var price = wsCost(state, id, cfg);
    if (c.bp < price) return false;
    c.bp -= price;
    c.ws[id] = ws(state, id) + 1;
    if (id === 'night') c.nightHours = cfg['ws.night.hours'];
    if (id === 'rig') {
      state.run.staff.master = true;
      state.run.staff.mechanic = true;
    }
    return true;
  }

  function migrate(state, fromVer) { return state; }

  function validate(state) {
    var r = state.run;
    if (typeof r.depth !== 'number' || !(r.depth >= 0)) return 'глубина не число: ' + r.depth;
    if (!Array.isArray(r.crews) || r.crews.length !== CREWS.length) return 'нет списка бригад';
    for (var i = 0; i < r.crews.length; i++) if (typeof r.crews[i] !== 'number' || r.crews[i] < 0 || r.crews[i] % 1 !== 0) return 'бригад не целое число';
    if (typeof r.drill !== 'number' || r.drill < 0 || r.drill % 1 !== 0) return 'уровень бура не целый';
    if (!Big.valid(r.money) || Big.sign(r.money) < 0) return 'денег меньше нуля';
    if (!(r.heat >= 0 && r.heat <= 100)) return 'тепло вне шкалы';
    return null;
  }

  function summary(state, cfg) {
    var parts = [Fmt.num(Math.floor(state.run.depth)) + ' м', Fmt.num(speed(state, cfg, 1, 0), { digits: 2 }) + ' м/с'];
    var k = coreCount(state);
    if (k > 0) parts.push('Керн ' + Fmt.num(k));
    return { line: parts.join(' · ') };
  }

  /** When the money is enough for the next drill level; when the drill reaches the next zone. */
  function next(state, now, cfg) {
    var out = [];
    var rate = Big.toNumber(income(state, cfg, now));
    var needMoney = Big.toNumber(Big.sub(drillCost(state, cfg), state.run.money));
    if (rate > 0 && needMoney > 0) {
      var sec = needMoney / rate;
      if (sec < 86400) out.push({ id: 'drill', at: now + Math.ceil(sec) * 1000, text: 'Хватает на бур, уровень ' + (state.run.drill + 1) });
    }
    var z = nextZone(state, state.run.depth, cfg);
    var v = speed(state, cfg, 1, now);
    if (v > 0 && z) {
      var g = growth(state, cfg);
      var t = (100 / Math.log(g)) * (Math.pow(g, (z.at - state.run.depth) / 100) - 1) / v;
      if (t > 0 && t < 86400) out.push({ id: 'zone', at: now + Math.ceil(t) * 1000, text: 'Бур дошёл до зоны «' + z.zone.title + '»' });
    }
    return out;
  }

  /** «Керновый ящик» of «Пассажир»: +50 m and a find. */
  function chest(state, rng, cfg) {
    var r = state.run;
    var m = cfg['chest.meters'];
    r.depth += m;
    cross(state, cfg, rng, 0, false, null);
    var f = rollFind(state, rng, cfg, r.depth);
    r.finds.push(f);
    return { title: 'Керновый ящик', items: [{ title: 'Проходка', amount: '+' + m + ' м' }, { title: 'Находка', amount: f.title }] };
  }

  function capBonusHours(state) { return ws(state, 'night') * num(cs(state).nightHours, 12); }

  // ---- the stock: field notes, rock names, echo voices; made up when it ran out ----

  var NOTE_WHO = ['Геолог', 'Старый бурильщик', 'Мастер смены', 'Механик', 'Практикант'];
  var NOTE_WHAT = ['керн сегодня тёплый на ощупь', 'в шламе блестят мелкие зёрна', 'бур поёт на новой ноте', 'вода в зумпфе солоноватая',
    'на глубине пахнет мокрым камнем', 'трещины идут косо, значит, пласт уходит вниз', 'видели светлую жилку на стенке'];
  var ROCK_A = ['Серый', 'Пёстрый', 'Тёмный', 'Слоистый', 'Плотный', 'Зернистый', 'Красный', 'Зелёный'];
  var ROCK_B = ['сланец', 'песчаник', 'кварцит', 'туф', 'гранит', 'порфир', 'мрамор', 'гнейс'];
  var ROCK_COLORS = ['#4f4a44', '#5c5146', '#665a4e', '#4a4e52', '#56514c', '#3f4245', '#5e5650', '#4d5750'];

  function procedural(kind, rng) {
    if (kind === 'rocks') {
      var t = rng.pick(ROCK_A) + ' ' + rng.pick(ROCK_B);
      return { title: t, color: rng.pick(ROCK_COLORS), text: 'Порода как порода, но бур её запомнит', procedural: true };
    }
    if (kind === 'echoes') {
      var rule = rng.pick(RULES);
      return { text: 'Из глубины слышно: ' + rule.text, rule: rule.id, procedural: true };
    }
    var w = rng.pick(NOTE_WHO);
    return { who: w, text: rng.pick(NOTE_WHAT), depth: rng.int(0, 10000), procedural: true };
  }

  function validateStock(kind, item) {
    if (/https?:/.test(JSON.stringify(item))) return 'ссылка в тексте';
    if (kind === 'echoes' && !find(RULES, item.rule)) return 'правило не из списка';
    if (kind === 'rocks' && !/^#[0-9a-fA-F]{6}$/.test(String(item.color))) return 'цвет не #rrggbb';
    return null;
  }

  // ---- the bot of «Темп» (checks, tests): one second of play ----

  /** One second of the bot: takes events and finds, buys by the rule of «Темп», equipment by need. */
  function play(state, ctx, taps) {
    var cfg = ctx.config;
    var now = ctx.now || 0;
    var r = state.run;
    var bought = 0;
    while (r.finds.length) collect(state, cfg, 0, now);
    if (r.event && r.event.until > now) eventTake(state, cfg, 0, now, ctx.rng);
    if (inZone(state, 'heat', r.depth, cfg) && r.heat >= cfg['heat.resetMin'] * 2) vent(state, cfg, now);
    ['pump', 'vent', 'sink'].forEach(function (id) {
      var e = find(EQUIP, id);
      if (zoneOpen(state, e.zone, cfg) && inZone(state, e.zone, r.depth + 50, cfg) && coverage(state, id, r.depth + 50, cfg, now) < 1 && buyEq(state, id, cfg)) bought++;
    });
    STAFF.forEach(function (s) { if (!r.staff[s.id] && staffOpen(state, s.id, cfg) && Big.lt(staffCost(state, s.id, cfg), Big.mul(income(state, cfg, now), 120)) && hire(state, s.id, cfg)) bought++; });
    var n = 0;
    while (n < 50 && buy(state, cfg, now)) n++;
    return bought + n;
  }

  /** The workshop the bot buys after a well: the cheapest useful node first. */
  function playWorkshop(state, cfg) {
    var order = ['motor', 'bit', 'crews', 'rope', 'lift', 'seismic', 'rig', 'night', 'chief'];
    var guard = 0;
    var any = true;
    while (any && guard++ < 50) {
      any = false;
      for (var i = 0; i < order.length; i++) {
        // The endless nodes: the first level in its turn, the next ones after everything else.
        if (find(WORKSHOP, order[i]).endless && ws(state, order[i]) > 0) continue;
        if (buyWs(state, order[i], cfg)) {
          any = true;
          break;
        }
      }
    }
    var left = WORKSHOP.filter(function (w) { return !w.endless && ws(state, w.id) < wsMax(state, w.id, cfg); }).length;
    guard = 0;
    while (!left && guard++ < 50 && (buyWs(state, 'motor', cfg) || buyWs(state, 'night', cfg))) { /* the endless levels */ }
  }

  return {
    init: init, tick: tick, prestigeGain: prestigeGain, bonus: bonus, onPrestige: onPrestige, migrate: migrate,
    validate: validate, summary: summary, next: next, chest: chest, procedural: procedural, validateStock: validateStock,
    capBonusHours: capBonusHours,
    // helpers of the screen and the bot
    income: income, speed: speed, speedNext: speedNext, value: value, growth: growth, drillCost: drillCost, crewCost: crewCost,
    crewCount: crewCount, crewOpen: crewOpen, crewBase: crewBase, milestoneMult: milestoneMult, nextMilestone: nextMilestone, bestCrew: bestCrew,
    buy: buy, buyDrill: buyDrill, buyCrew: buyCrew, buyEq: buyEq, pumpsHold: pumpsHold, mapsMult: mapsMult, eqCost: eqCost, capacity: capacity, need: need, coverage: coverage,
    buyGeo: buyGeo, geoCost: geoCost, buyCrown: buyCrown, crownCost: crownCost, cutLens: cutLens, lensCost: lensCost,
    hire: hire, staffCost: staffCost, staffOpen: staffOpen, vent: vent, expedition: expedition, expCost: expCost,
    collect: collect, eventTake: eventTake, advance: advance, bonuses: bonuses, setDone: setDone, findChance: findChance,
    zoneAt: zoneAt, zoneOpen: zoneOpen, inZone: inZone, zoneStart: zoneStart, nextZone: nextZone, circleOf: circleOf, zoneMult: zoneMult,
    wsCost: wsCost, wsMax: wsMax, buyWs: buyWs, ws: ws, chooseEdge: chooseEdge, edgeKind: edgeKind, coreCount: coreCount, maps: maps,
    offlineRate: offlineRate, play: play, playWorkshop: playWorkshop, coreState: coreState, cs: cs, meta: meta,
    CREWS: CREWS, ZONES: ZONES, EQUIP: EQUIP, ARTIFACTS: ARTIFACTS, SETS: SETS, RELICS: RELICS, RULES: RULES, EDGES: EDGES,
    WORKSHOP: WORKSHOP, STAFF: STAFF, EVENTS: EVENTS, EXPEDITIONS: EXPEDITIONS, CORE: CORE, EDGE: EDGE
  };
});
