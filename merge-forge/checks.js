// The checks of «Кузница слияний» (module_check('games/merge-forge')): the engine's standard ones
// with the game's bot (sim.botPlay: one tap a second, every pair merged, the cheapest useful
// upgrade bought), then the game's own: the merge, the coals, the boss, the chest, the triple
// merge, «Горн мастера» and the upgrades with no last level (the price grows, the effect does not
// run away, a run does not pay for itself in coals), the pace of one long session and the wall.
var kit = require('../engine/checks-kit.js');
var Big = require('../engine/big.js');
var Rng = require('../engine/rng.js');
var Core = require('../engine/core.js');

var TAPS = 1;

var checks = kit.standard(__dirname, {
  firstBuySec: 10,
  prestigeTrips: [3, 6],
  taps: TAPS,
  play: function (state, ctx, sim, taps) { return sim.botPlay(state, ctx, taps); }
});
for (var name in checks) exports[name] = checks[name];

function load() {
  var id = kit.idOf(__dirname);
  var axiko = require('lib/axiko');
  var game = JSON.parse(axiko.files.read('modules/games/' + id + '/game.json'));
  game.id = id;
  var sim = require('modules/games/' + id + '/sim.js');
  return { game: game, sim: sim, cfg: kit.configOf(game, 'modules/games/' + id) };
}

function ctxOf(cfg, rng, now) {
  return { now: now, config: cfg, rng: rng, mult: 1, links: {}, stock: {}, offline: false, capBonusHours: 0 };
}

function fresh(x, seed) {
  var now = Date.UTC(2026, 10, 2, 8, 0, 0);
  return Core.newState(x.game, x.sim, ctxOf(x.cfg, Rng.make(seed || 1), now));
}

/** One session of `sec` seconds by the bot: waves at the marks, the longest stretch without a purchase. */
function session(x, sec, marks) {
  var rng = Rng.make(12345);
  var now = Date.UTC(2026, 10, 2, 5, 0, 0);
  var state = Core.newState(x.game, x.sim, ctxOf(x.cfg, rng, now));
  var at = {};
  var lastBuy = 0;
  var gap = 0;
  for (var s = 0; s < sec; s++) {
    var bought = x.sim.botPlay(state, ctxOf(x.cfg, rng, now), TAPS);
    if (bought) {
      gap = Math.max(gap, s - lastBuy);
      lastBuy = s;
    }
    x.sim.tick(state, 1, ctxOf(x.cfg, rng, now + 1000));
    now += 1000;
    for (var i = 0; i < marks.length; i++) if (marks[i] === s + 1) at[marks[i]] = state.run.maxWave;
  }
  return { state: state, at: at, gap: Math.max(gap, sec - 1 - lastBuy) };
}

exports['слитый клинок сильнее двух исходных'] = function (t) {
  var x = load();
  for (var n = 1; n <= 80; n++) {
    var two = 2 * x.sim.bladeDmg(x.cfg, n);
    t.ok(x.sim.bladeDmg(x.cfg, n + 1) > two, 'уровень ' + n + ': ' + x.sim.bladeDmg(x.cfg, n + 1) + ' не больше ' + two);
  }
  var state = fresh(x, 2);
  var g = state.run.grid;
  for (var i = 0; i < g.length; i++) g[i] = 0;
  g[0] = 4;
  g[1] = 4;
  var before = x.sim.rawSum(state, x.cfg);
  var r = x.sim.move(state, x.cfg, 1, 0, 1);
  t.ok(r && r.kind === 'merge' && g[0] === 5 && g[1] === 0, 'слияние двух клинков 4-го уровня: ' + JSON.stringify(r));
  t.ok(x.sim.rawSum(state, x.cfg) > before, 'урон наковальни после слияния не вырос');
  g[2] = 3;
  r = x.sim.move(state, x.cfg, 2, 0, 1);
  t.ok(r && r.kind === 'swap' && g[0] === 3 && g[2] === 5, 'разные уровни меняются местами');
};

exports['угли: волна 60 → 4, 100 → 51, 200 → 445; за волны ниже рекорда — половина'] = function (t) {
  var x = load();
  t.equal(x.sim.coalsFor(x.cfg, 59), 0, 'волна 59');
  t.equal(x.sim.coalsFor(x.cfg, 60), 4, 'волна 60');
  t.equal(x.sim.coalsFor(x.cfg, 100), 51, 'волна 100');
  t.equal(x.sim.coalsFor(x.cfg, 200), 445, 'волна 200');
  var rng = Rng.make(4);
  var ctx = ctxOf(x.cfg, rng, Date.now());
  var state = fresh(x, 4);
  state.run.maxWave = 59;
  t.ok(!Core.prestigeInfo(x.sim, x.game, state, 'forge', x.cfg).can, 'перековка до волны 60');
  state.run.maxWave = 60;
  var r = Core.prestige(x.sim, x.game, state, 'forge', ctx);
  t.ok(r.ok, 'перековка на волне 60 не прошла');
  t.equal(Big.str(state.layers.forge.currency), Big.str(Big.of(4)), 'углей после первой перековки');
  t.equal(state.run.wave, 1, 'волна после перековки');
  state.run.maxWave = 60;
  t.equal(Big.str(x.sim.prestigeGain(state, 'forge', x.cfg)), Big.str(Big.of(2)), 'тот же рекорд второй раз — половина: 2 из 4');
  state.run.maxWave = 100;
  t.equal(Big.str(x.sim.prestigeGain(state, 'forge', x.cfg)), Big.str(Big.of(49)), 'рекорд 100 после 60: 51 − 4 сверху и половина от 4');
  t.ok(Math.abs(x.sim.coalBonus(state, x.cfg) - 1.4) < 1e-9, 'четыре угля: +40 % урона и золота');
};

exports['босс: не успели — откат на волну назад и фарм, «Ещё раз» возвращает'] = function (t) {
  var x = load();
  var rng = Rng.make(6);
  var state = fresh(x, 6);
  var r = state.run;
  r.wave = 10;
  r.maxWave = 10;
  r.farm = false;
  x.sim.ensure(state);
  r.hp = Big.str(Big.of('1e30'));
  r.hpMax = r.hp;
  r.walkT = 0;
  r.bossT = x.sim.bossTimer(state, x.cfg);
  for (var s = 0; s < 40; s++) x.sim.tick(state, 1, ctxOf(x.cfg, rng, Date.now() + s * 1000));
  t.equal(r.wave, 9, 'волна после проигранного босса');
  t.ok(r.farm, 'после отката — фарм');
  t.ok(x.sim.retry(state, x.cfg), '«Ещё раз»');
  t.equal(r.wave, 10, 'снова босс');
  t.ok(r.bossT > 0, 'таймер босса снова идёт');
};

exports['сундук «Пассажира»: 3 клинка на уровень выше горна, лишние ждут места'] = function (t) {
  var x = load();
  var state = fresh(x, 8);
  var g = state.run.grid;
  var open = x.sim.openCells(state, x.cfg);
  for (var i = 0; i < open.length; i++) g[open[i]] = i < open.length - 1 ? 7 : 0;
  var c = x.sim.chest(state, Rng.make(3), x.cfg);
  var level = x.sim.forgeLevel(state, x.cfg) + x.cfg['chest.levelPlus'];
  t.ok(c.items.length && c.items[0].amount === x.cfg['chest.blades'], 'в сундуке не ' + x.cfg['chest.blades'] + ' клинка');
  t.equal(g[open[open.length - 1]], level, 'клинок из сундука в свободной клетке');
  t.equal(state.run.pending.length, x.cfg['chest.blades'] - 1, 'остальные ждут места');
  g[open[0]] = 0;
  x.sim.tick(state, 0.1, ctxOf(x.cfg, Rng.make(3), Date.now()));
  t.equal(g[open[0]], level, 'ждавший клинок лёг, когда место освободилось');
};

exports['двойные клинки: со слитком три одинаковых сливаются в +2'] = function (t) {
  var x = load();
  var state = fresh(x, 9);
  var g = state.run.grid;
  for (var i = 0; i < g.length; i++) g[i] = 0;
  g[0] = 5;
  g[1] = 5;
  g[2] = 5;
  var r = x.sim.move(state, x.cfg, 1, 0, 1);
  t.ok(r && g[0] === 6 && g[2] === 5, 'без слитков — обычное слияние');
  g[0] = 5;
  g[1] = 5;
  state.layers.star.currency = Big.str(Big.of(1));
  r = x.sim.move(state, x.cfg, 1, 0, 1);
  t.ok(r && g[0] === 7 && g[1] === 0 && g[2] === 0, 'со слитком — три в один на +2: ' + g.slice(0, 3).join(','));
};

/** A fresh game with `coals` coals, all of them spent on «Горн мастера» the cheapest node first. */
function withCoals(x, coals, seed) {
  var state = fresh(x, seed);
  var l = x.sim.forgeLayer(state);
  l.currency = Big.str(Big.of(coals));
  l.state.total = coals;
  for (var k = 0; k < 1000; k++) {
    var pick = null;
    var cost = Infinity;
    for (var i = 0; i < x.sim.MF.length; i++) {
      var id = x.sim.MF[i].id;
      if (!x.sim.mfOpen(state, x.cfg, id)) continue;
      var c = x.sim.mfCost(state, x.cfg, id);
      if (c < cost) {
        cost = c;
        pick = id;
      }
    }
    if (!pick || !x.sim.buyMf(state, x.cfg, pick)) break;
  }
  state.run.gold = Big.str(x.sim.startGold(state, x.cfg));
  return state;
}

exports['Горн мастера без потолка: цена в углях растёт с каждым уровнем, разовые узлы — один раз'] = function (t) {
  var x = load();
  var state = fresh(x, 11);
  var l = x.sim.forgeLayer(state);
  l.currency = Big.str(Big.of('1e60'));
  x.sim.MF.forEach(function (d) {
    if (d.single) {
      t.ok(x.sim.buyMf(state, x.cfg, d.id), d.id + ': разовый узел не купился');
      t.ok(!x.sim.mfOpen(state, x.cfg, d.id) && !x.sim.buyMf(state, x.cfg, d.id), d.id + ': разовый узел купился второй раз');
      return;
    }
    t.ok(x.cfg['mf.' + d.id + '.growth'] > 1, d.id + ': рост цены не больше 1 — уровни без потолка стоили бы одинаково');
    var last = 0;
    for (var n = 0; n < 60; n++) {
      var price = x.sim.mfCost(state, x.cfg, d.id);
      t.ok(price > last && price < Infinity, d.id + ', уровень ' + (n + 1) + ': цена ' + price + ' не выше прежней ' + last);
      t.ok(x.sim.mfOpen(state, x.cfg, d.id) && x.sim.buyMf(state, x.cfg, d.id), d.id + ': уровень ' + (n + 1) + ' не купился');
      last = price;
    }
    t.equal(x.sim.mfLevel(state, d.id), 60, d.id + ': уровней после 60 покупок');
  });
  // 1000 углей (порог «Звёздного металла») в один узел — это единицы уровней, а не десятки.
  x.sim.MF.forEach(function (d) {
    if (d.single) return;
    var sum = 0;
    var n = 0;
    while (sum + Math.ceil(x.cfg['mf.' + d.id + '.cost'] * Math.pow(x.cfg['mf.' + d.id + '.growth'], n)) <= 1000) {
      sum += Math.ceil(x.cfg['mf.' + d.id + '.cost'] * Math.pow(x.cfg['mf.' + d.id + '.growth'], n));
      n++;
    }
    t.ok(n >= 3 && n <= 12, d.id + ': на 1000 углей выходит уровней ' + n + ', нужно 3–12');
  });
};

exports['Горн мастера без потолка: отдача уровней не разгоняется'] = function (t) {
  var x = load();
  var cfg = x.cfg;
  var state = fresh(x, 12);
  var mf = x.sim.forgeLayer(state).state.mf;
  // автоклик: растёт всегда, после mf.auto.soft каждый уровень даёт меньше прежнего
  var soft = cfg['mf.auto.soft'];
  for (var n = 1; n <= 200; n++) {
    var step = x.sim.autoTaps(cfg, n) - x.sim.autoTaps(cfg, n - 1);
    t.ok(step > 0, 'автоклик: уровень ' + n + ' ничего не дал');
    if (n > soft + 1) t.ok(step < x.sim.autoTaps(cfg, n - 1) - x.sim.autoTaps(cfg, n - 2), 'автоклик: уровень ' + n + ' дал не меньше прежнего');
  }
  mf.auto = 100;
  t.ok(x.sim.forgeSpeed(state, cfg) < 1 + 100 * cfg['mf.auto.taps'] * cfg['forge.tapSec'] / 3, 'автоклик 100-го уровня: горн ×' + x.sim.forgeSpeed(state, cfg) + ' — отдача не убывает');
  mf.auto = 0;
  // стартовое золото: число остаётся числом на любом уровне
  t.ok(Big.valid(x.sim.startGoldAt(cfg, 500)) && Big.gt(x.sim.startGoldAt(cfg, 500), x.sim.startGoldAt(cfg, 499)), 'стартовое золото на 500-м уровне');
  // стартовый уровень клинка: +1 за уровень, улучшение «Качество стали» остаётся открытым
  mf.startLevel = 30;
  t.equal(x.sim.forgeLevel(state, cfg), 31, 'горн с 30 уровнями стартового клинка');
  t.ok(x.sim.upOpen(state, cfg, 'steel'), '«Качество стали» закрылось из-за стартового уровня');
  mf.startLevel = 0;
  // руны мастера: гнёзд не больше семи, сила рун растёт линейно
  state.run.maxWave = cfg['rune.fromWave'];
  mf.rune = 40;
  t.equal(x.sim.socketCount(state, cfg), x.sim.sockets(state, cfg).length, 'гнёзда рун');
  t.ok(x.sim.socketCount(state, cfg) <= x.sim.SOCKETS.length, 'гнёзд больше, чем есть на наковальне');
  t.ok(Math.abs(x.sim.runePower(state, cfg) - (1 + 40 * cfg['mf.rune.power'])) < 1e-9, 'сила рун на 40-м уровне: ' + x.sim.runePower(state, cfg));
  t.ok(!x.sim.upOpen(state, cfg, 'runeMason'), '«Рунная кладка» продаёт гнёзда, которых уже нет');
};

exports['улучшения кузни: потолок только там, где он следует из других настроек'] = function (t) {
  var x = load();
  var cfg = x.cfg;
  var state = fresh(x, 13);
  ['steel', 'sharp', 'purse', 'hand', 'twin', 'melt', 'hourglass', 'hunter', 'temper', 'runePower', 'caravan', 'cry', 'banner'].forEach(function (id) {
    t.ok(x.sim.upMax(state, cfg, id) >= 400, id + ': потолок ' + x.sim.upMax(state, cfg, id));
  });
  // «Шире наковальня» и «Глаз мастера» без последнего уровня: после 35 клеток — резонанс, после предела крита — сокрушительный удар.
  t.ok(x.sim.upMax(state, cfg, 'wide') >= 400, '«Шире наковальня» без потолка');
  t.ok(x.sim.upMax(state, cfg, 'eye') >= 400, '«Глаз мастера» без потолка');
  t.equal(x.sim.upMax(state, cfg, 'night'), Math.round((1 - cfg['offline.share']) / cfg['up.night.step']), '«Ночная смена» — до 100 % офлайна');
  // Двойная поковка и Удачная плавка выше 100 %: целые клинки и уровни сверху.
  var r = state.run;
  var g = r.grid;
  for (var i = 0; i < g.length; i++) g[i] = 0;
  // The first level at which Двойная поковка, with its milestones, makes at least four blades.
  r.up.twin = 1;
  while (1 + Math.floor(x.sim.upgradeEffective(state, cfg, 'twin', r.up.twin) * cfg['up.twin.step']) < 4) r.up.twin++;
  r.up.melt = Math.round(2 / cfg['up.melt.step']);
  r.forgeT = 0;
  x.sim.workshop(state, 0.001, cfg, Rng.make(3), 1000);
  var made = g.filter(function (n) { return n > 0; });
  var twins = 1 + Math.floor(x.sim.upgradeEffective(state, cfg, 'twin') * cfg['up.twin.step']);
  t.ok(twins >= 4, 'двойная поковка с рубежами даёт не меньше 4 клинков, получено ' + twins);
  t.ok(made.length === twins || made.length === twins + 1, 'двойная поковка с рубежом: ' + twins + ' клинков и шанс ещё одного, получено ' + made.length);
  t.ok(made.every(function (n) { return n === 3; }), 'удачная плавка 200 %: уровни ' + made.join(','));
  // Караванщик retains logarithmic softening between the bounded milestone bonuses.
  var soft = cfg['up.caravan.soft'];
  r.up.caravan = soft;
  // The perk of the 50th level makes events more frequent on its own: it is left out here.
  var a = x.sim.eventSpeed(state, cfg) / x.sim.perk(state, cfg, 'events');
  r.up.caravan = soft * 5;
  var b = x.sim.eventSpeed(state, cfg) / x.sim.perk(state, cfg, 'events');
  var aBase = (a - 1) / x.sim.upgradeProgress(state, cfg, 'caravan', soft).factor;
  var bBase = (b - 1) / x.sim.upgradeProgress(state, cfg, 'caravan', soft * 5).factor;
  t.ok(b > a && bBase < aBase * 3, 'караванщик: после отделения бонуса вех сохраняется замедленный рост');
};

exports['перековки не разгоняют сами себя: забег с углями в дереве приносит меньше углей, чем было'] = function (t) {
  var x = load();
  [100, 1000, 100000].forEach(function (coals) {
    var state = withCoals(x, coals, 14);
    var rng = Rng.make(4242);
    var now = Date.UTC(2026, 10, 2, 5, 0, 0);
    for (var s = 0; s < 1800; s++) {
      x.sim.botPlay(state, ctxOf(x.cfg, rng, now), TAPS);
      x.sim.tick(state, 1, ctxOf(x.cfg, rng, now + 1000));
      now += 1000;
    }
    var back = x.sim.coalsFor(x.cfg, state.run.maxWave);
    t.equal(x.sim.validate(state), null, coals + ' углей: состояние после получаса');
    t.ok(Big.valid(x.sim.dps(state, x.cfg, 0)) && Big.valid(state.run.gold), coals + ' углей: урон и золото — числа');
    t.ok(back < coals, coals + ' углей в дереве: за полчаса волна ' + state.run.maxWave + ' — это ' + back + ' углей, забег окупает сам себя');
    t.ok(x.sim.forgeSpeed(state, x.cfg) <= 4, coals + ' углей: горн ×' + x.sim.forgeSpeed(state, x.cfg));
  });
};

exports['темп одного забега: 5 мин — около 20-й волны, час — 45–55, стены дольше 20 мин нет'] = function (t) {
  var x = load();
  var r = session(x, 7200, [300, 3600]);
  t.ok(r.at[300] >= 15 && r.at[300] <= 25, 'к 5-й минуте волна ' + r.at[300] + ', нужно около 20');
  t.ok(r.at[3600] >= 45 && r.at[3600] <= 55, 'к часу волна ' + r.at[3600] + ', нужно 45–55');
  t.ok(r.gap <= 1200, 'без покупки ' + r.gap + ' с, нужно не дольше 20 мин');
  t.equal(x.sim.validate(r.state), null, 'состояние после двух часов');
  t.ok(Big.valid(x.sim.dps(r.state, x.cfg, 0)) && Big.valid(r.state.run.farmRate), 'урон и ставка — числа');
};

exports['офлайн: ставка боя × доля и отдельная продажа излишков, бой стоит'] = function (t) {
  var x = load();
  var state = fresh(x, 10);
  state.run.farmRate = Big.str(Big.of(100));
  state.run.wave = 7;
  var gold = Big.of(state.run.gold);
  var interval = x.sim.forgeInterval(state, x.cfg, 0);
  var cycles = Math.max(0, Math.floor((3600 * x.sim.forgeSpeed(state, x.cfg) - state.run.forgeT) / interval + 1e-9) + 1);
  var sales = Math.max(0, cycles - x.sim.freeCells(state, x.cfg).length);
  var proceeds = Big.mul(x.sim.sellPrice(state, x.cfg, x.sim.forgeLevel(state, x.cfg)), sales);
  x.sim.offline(state, 3600, ctxOf(x.cfg, Rng.make(10), Date.now()));
  var want = Big.add(gold, Big.add(Big.mul(100, 3600 * x.cfg['offline.share']), proceeds));
  t.equal(Big.str(state.run.gold), Big.str(want), 'золото за час офлайна');
  t.equal(state.run.wave, 7, 'волна офлайн не меняется');
  t.ok(state.run.stats.forged > 0, 'горн офлайн не ковал');
  t.equal(state.run.stats.forged, cycles, 'ковка идёт тем же циклом после заполнения');
  t.equal(state.run.stats.sold, sales, 'проданы только новые излишки');
};

exports['форпост v3: состав, талант и защита подготовленного оружия'] = function (t) {
  var x = load(), state = fresh(x, 81), O = x.sim.outpost;
  state.run.maxWave = 100;
  x.sim.forgeLayer(state).state.mf.team = 1;
  t.ok(O.recruit(state, x.cfg, 'bran').ok, 'приглашение');
  t.ok(O.recruit(state, x.cfg, 'veya').ok, 'второй герой');
  t.ok(O.selectHero(state, x.cfg, 'veya').ok, 'второе место');
  state.run.grid[0] = 8;
  t.ok(O.equip(state, x.cfg, 0, 'bran', x.sim.openCells(state, x.cfg)).ok, 'оружие');
  state.meta.outpost.heroes.bran.xp = 1000;
  t.ok(O.chooseTalent(state, x.cfg, 'bran', 3, 'heavy').ok, 'талант');
  t.ok(x.sim.useAbility(state, x.cfg, 'bran', Date.now()).ok, 'подготовка');
  t.ok(!O.unequip(state, x.cfg, 'bran', x.sim.openCells(state, x.cfg)).ok, 'оружие подготовленного удара не перемещается');
  t.equal(state.run.grid[0], 0, 'нет второй копии клинка');
  t.equal(x.sim.validate(state), null, 'состояние');
};

exports['форпост v3: заказ выдаёт оплату и опыт только один раз'] = function (t) {
  var x = load(), state = fresh(x, 82), A = x.sim.adventures;
  state.run.maxWave = 30;
  var offer = A.offers(state, x.cfg)[0], cells = x.sim.openCells(state, x.cfg).slice(0, offer.count);
  cells.forEach(function (cell) { state.run.grid[cell] = 4; });
  t.ok(x.sim.acceptContract(state, x.cfg, offer.id, 'training').ok, 'принятие');
  t.ok(x.sim.deliverContract(state, x.cfg, cells).ok, 'поставка');
  var reward = x.sim.claimContract(state, x.cfg);
  t.ok(reward.ok, 'награда');
  var gold = Big.str(state.run.gold), xp = state.meta.adventures.trainingXp;
  t.ok(!x.sim.claimContract(state, x.cfg).ok, 'повторная награда отклонена');
  t.equal(Big.str(state.run.gold), gold, 'золото не удвоено');
  t.equal(state.meta.adventures.trainingXp, xp, 'опыт не удвоен');
  cells.forEach(function (cell) { t.equal(state.run.grid[cell], 0, 'клинок передан'); });
};

exports['форпост v3: испытание изолировано от основной кузни'] = function (t) {
  var x = load(), state = fresh(x, 83), A = x.sim.adventures;
  state.run.maxWave = 60;
  var field = JSON.stringify(state.run.grid), gold = Big.str(state.run.gold);
  t.ok(A.startTrial(state, x.cfg).ok, 'начало');
  [[0, 1], [1, 2], [4, 5], [2, 5]].forEach(function (move) { t.ok(A.moveTrial(state, x.cfg, move[0], move[1]).ok, 'ход'); });
  t.ok(A.claimTrial(state, x.cfg).ok, 'награда');
  t.ok(!A.claimTrial(state, x.cfg).ok, 'награда однократна');
  t.equal(JSON.stringify(state.run.grid), field, 'свои клинки сохранены');
  t.equal(Big.str(state.run.gold), gold, 'золото не расходуется');
  t.equal(x.sim.validate(state), null, 'валидность');
};

exports['форпост v3: линька сохраняет возраст и требует нового рекорда'] = function (t) {
  var x = load(), state = fresh(x, 84), O = x.sim.outpost;
  state.run.maxWave = 100;
  state.meta.outpost.dragon.fed = 100;
  state.meta.outpost.dragon.absorbed = '1e6';
  t.ok(O.selectForm(state, x.cfg, 'storm').ok, 'форма');
  var preview = O.moltPreview(state, x.cfg);
  t.ok(preview.ok, 'условия линьки');
  t.ok(O.molt(state, x.cfg, 'strength').ok, 'линька');
  t.equal(Big.str(state.meta.outpost.dragon.absorbed), '7.5e5', 'ровно четверть силы');
  t.equal(O.model(state, x.cfg).dragon.stage, 'adult', 'взрослая форма сохраняется');
  t.ok(!O.molt(state, x.cfg, 'strength').ok, 'повтор без рекорда отклонён');
};
