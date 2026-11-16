// The logic of «Библиотека» for «Игротека». Shared subset of JavaScript: it runs on the screen
// (window.GameSim), in the engine (Rhino, require) and in node. No class, no async, no f(...args),
// no for (let/const …); randomness only from the rng given or from Rng.make(hash of the state's
// own counters), so the offline formula, the steps and the checks repeat each other exactly.
//
// The library: supplies of 8 kinds of books (each book is of a branch of knowledge) bring coins
// from readers; books are read at desks by timers and give knowledge of their branch; knowledge
// opens the levels of 6 branches; halls hold books and multiply them; unique tomes are rare
// finds. The prestige «Новое здание» gives Экслибрисы for the knowledge of the building.
// Every number comes from config.json (cfg).
(function (root, make) {
  var node = typeof require === 'function' && typeof exports !== 'undefined';
  var api = node ? make(require('../engine/big.js'), require('../engine/rng.js'), require('../engine/fmt.js')) : make(root.Big, root.Rng, root.Fmt);
  if (typeof exports !== 'undefined') { for (var k in api) exports[k] = api[k]; } else { root.GameSim = api; }
})(this, function (Big, Rng, Fmt) {
  'use strict';

  var LAYER = 'building';
  var K = 8;
  var B = 6;
  var GROUPS = K * B;

  var BRANCHES = ['nature', 'history', 'letters', 'art', 'crafts', 'secret'];
  var BRANCH_NAMES = ['Естествознание', 'История', 'Словесность', 'Искусство', 'Ремёсла', 'Тайное'];
  var BRANCH_EFFECTS = ['книги ветви ×{v} за уровень', 'чтение ×{v} за уровень', 'аннотации: +{p} к книге за уровень',
    'залы ×{v} за уровень', 'поставки дешевле на {p} за уровень', 'шанс уникальных ×{v} за уровень'];
  var KIND_NAMES = ['Букинистическая связка', 'Полка романов', 'Справочники', 'Подписные издания', 'Иллюстрированные альбомы',
    'Старопечатные книги', 'Рукописи', 'Собрания коллекционеров'];
  var KIND_SHORT = ['Связки', 'Романы', 'Справочники', 'Подписка', 'Альбомы', 'Старопечатные', 'Рукописи', 'Собрания'];
  var BUILDINGS = ['Сельская библиотека', 'Городская библиотека', 'Университетская библиотека', 'Губернская библиотека',
    'Национальная библиотека', 'Библиотека-лабиринт'];
  var UPGRADES = [
    { id: 'lamp', title: 'Лампа' },
    { id: 'glasses', title: 'Очки' },
    { id: 'silence', title: 'Тишина в зале' }
  ];

  // The halls: what opens them (need), whose books they multiply (kinds, branches) or what else
  // they give. Costs, capacities and multipliers are settings: hall.<id>.cost|cap|mult.
  var HALLS = [
    { id: 'reading', title: 'Читальный зал', text: 'обычный зал' },
    { id: 'children', title: 'Детский зал', kinds: [0, 1], text: 'Связки и Романы' },
    { id: 'periodicals', title: 'Зал периодики', kinds: [3], need: { own: 3, key: 'hall.periodicals.need' }, text: 'Подписные издания' },
    { id: 'lending', title: 'Абонемент', need: { desks: 'hall.lending.desks' }, librarian: true, text: 'Библиотекарь ставит книги на свободные столы' },
    { id: 'herbarium', title: 'Гербарий', branches: [0], need: { level: 0, key: 'branch.nature.herbarium' }, text: 'книги Естествознания' },
    { id: 'maps', title: 'Картографический зал', branches: [1], need: { tome: 'atlas' }, text: 'книги Истории' },
    { id: 'gallery', title: 'Галерея гравюр', kinds: [4], need: { level: 3, key: 'branch.art.gallery' }, text: 'Иллюстрированные альбомы' },
    { id: 'manuscripts', title: 'Зал рукописей', kinds: [6], need: { own: 6, key: 'hall.manuscripts.need' }, text: 'Рукописи' },
    { id: 'music', title: 'Музыкальный зал', need: { tome: 'rain' }, speed: true, text: 'чтение во всей библиотеке' },
    { id: 'secret', title: 'Тайный зал', need: { level: 5, key: 'branch.secret.hall' }, tomes: true, text: 'эффекты уникальных томов' },
    { id: 'scrolls', title: 'Зал свитков', need: { tomes: 'hall.scrolls.tomes' }, global: true, text: 'все монеты' },
    { id: 'observatory', title: 'Обсерватория', branches: [0, 5], need: { tome: 'stars' }, text: 'Естествознание и Тайное' }
  ];

  // Unique tomes: each has an effect (its size is the setting tome.<id>); three are keys to halls.
  var TOMES = [
    { id: 'atlas', title: 'Атлас несуществующих берегов', fx: 'know', b: 1, key: 'maps' },
    { id: 'rain', title: 'Ноты для дождя', fx: 'speed', key: 'music' },
    { id: 'stars', title: 'Каталог тусклых звёзд', fx: 'know', b: 5, key: 'observatory' },
    { id: 'lighthouse', title: 'Поваренная книга смотрителя маяка', fx: 'offline' },
    { id: 'trades', title: 'Словарь забытых ремёсел', fx: 'know', b: 4 },
    { id: 'clock', title: 'Записки часовщика', fx: 'speed' },
    { id: 'stones', title: 'Трактат о терпении камней', fx: 'storage' },
    { id: 'city', title: 'Хроника города, которого не было', fx: 'coins' },
    { id: 'herb', title: 'Гербарий с одной страницей', fx: 'know', b: 0 },
    { id: 'letters', title: 'Письма к незнакомому читателю', fx: 'advice' },
    { id: 'hush', title: 'Руководство по ловле тишины', fx: 'short' },
    { id: 'chapter', title: 'Книга без последней главы', fx: 'knowAll' },
    { id: 'ferry', title: 'Песенник паромщика', fx: 'trip' },
    { id: 'attics', title: 'Путеводитель по чердакам', fx: 'capacity' },
    { id: 'stairs', title: 'История одной лестницы', fx: 'cost' },
    { id: 'dreams', title: 'Сонник для бессонных', fx: 'long' },
    { id: 'clouds', title: 'Опись облаков за сто лет', fx: 'know', b: 3 },
    { id: 'birds', title: 'Алфавит для птиц', fx: 'know', b: 2 },
    { id: 'diary', title: 'Дневник библиотекаря', fx: 'unique' },
    { id: 'streets', title: 'Карта отсутствующих улиц', fx: 'lend' }
  ];

  var TOME_FX = {
    know: 'знания ветви «{b}» ×{m}', speed: 'чтение ×{m}', offline: 'офлайн-доля монет +{p}', storage: 'запасники +{p} к доле',
    coins: 'монеты ×{m}', advice: '«прочитанное советуют» +{p} за книгу', short: 'знания коротких книг ×{m}',
    knowAll: 'все знания ×{m}', trip: 'монеты в поездке ×{m}', capacity: 'вместимость залов ×{m}', cost: 'поставки дешевле на {p}',
    long: 'длинные книги читаются ×{m} быстрее', unique: 'шанс уникальных ×{m}', lend: 'абонемент приносит ×{m}'
  };

  // The board of trustees: bought with Экслибрисы, stays for good (meta.council).
  var COUNCIL = [
    { id: 'desks', title: 'Стартовые столы', text: '+1 стол в начале здания' },
    { id: 'coins', title: 'Стартовые монеты', text: 'монеты в начале здания' },
    { id: 'vault', title: 'Ячейки Хранилища', text: '+1 ячейка' },
    { id: 'read', title: 'Чтение', text: 'чтение ×{m}' },
    { id: 'offline', title: 'Ночные читатели', text: 'офлайн-доля монет +{p}' },
    { id: 'librarian', title: 'Библиотекарь с начала', text: 'ставит книги на свободные столы с первой минуты' },
    { id: 'unique', title: 'Шанс уникальных', text: 'шанс ×{m}' },
    { id: 'memory', title: 'Память читателя', text: '{p} знаний ветвей переходит в новое здание' },
    { id: 'catalog', title: 'Каталогизатор', text: 'книги сами расставляются по лучшим залам' }
  ];

  var EVENTS = ['excursion', 'professor', 'tea', 'returned', 'quiet', 'bookseller', 'bookmark', 'note', 'contest', 'roof',
    'opendoors', 'students', 'cat', 'catalog', 'writer'];

  // ---- small helpers ----

  function num(v, d) { var n = Number(v); return n === n && isFinite(n) ? n : d; }
  function g(k, b) { return k * B + b; }
  function zeros(n) { var a = []; for (var i = 0; i < n; i++) a.push(0); return a; }
  function has(list, x) { return (list || []).indexOf(x) >= 0; }
  function lvl(state, b) { return state.run.levels[b] || 0; }
  function building(state) { var l = state.layers && state.layers[LAYER]; return (l ? num(l.count, 0) : 0) + 1; }
  function council(state, id) { return num(((state.meta && state.meta.council) || {})[id], 0); }
  function circle(state) { return Math.max(0, building(state) - 6); }
  function costScale(state, cfg) { return Math.pow(cfg['circle.cost'], circle(state)); }
  function incomeScale(state, cfg) { return Math.pow(cfg['circle.income'], circle(state)); }

  /** A number in [0, 1) that depends only on the state's seed and its own counter. */
  function roll(state, label) {
    state.run.rolls = num(state.run.rolls, 0) + 1;
    return Rng.make(Rng.hash(String(state.run.seed) + ':' + label + ':' + state.run.rolls)).next();
  }

  function rngOf(state, label) {
    state.run.rolls = num(state.run.rolls, 0) + 1;
    return Rng.make(Rng.hash(String(state.run.seed) + ':' + label + ':' + state.run.rolls));
  }

  function tomeOwned(state, id) { return has(state.run.tomes, id); }

  function tomeDef(id) {
    for (var i = 0; i < TOMES.length; i++) if (TOMES[i].id === id) return TOMES[i];
    return null;
  }

  /** The bonus of a tome (0 when not owned), doubled by «Тайный зал». */
  function tomeValue(state, cfg, id) {
    if (!tomeOwned(state, id)) return 0;
    var v = num(cfg['tome.' + id], 0);
    return hallOpen(state, 'secret') ? v * cfg['hall.secret.mult'] : v;
  }

  function hallOpen(state, id) { return has(state.run.halls, id); }

  function boostOf(state, type, now, k, b) {
    var m = 1;
    var list = state.run.boosts || [];
    for (var i = 0; i < list.length; i++) {
      var x = list[i];
      if (x.t !== type || !(x.until > now)) continue;
      if (x.k !== undefined && x.k !== k) continue;
      if (x.b !== undefined && x.b !== b) continue;
      m *= x.v;
    }
    return m;
  }

  function inTrip(ctx) {
    if (!ctx) return false;
    if (ctx.offline) return num(ctx.mult, 1) >= num(ctx.config && ctx.config['passenger.mult'], 2) - 1e-9;
    return !!(ctx.links && ctx.links.passenger && ctx.links.passenger.state === 'trip');
  }

  function milestones(cfg) {
    return String(cfg['supply.milestones'] || '').split(',').map(Number).filter(function (x) { return x > 0; });
  }

  function milestoneMult(cfg, n) {
    var m = 1;
    var list = milestones(cfg);
    for (var i = 0; i < list.length; i++) if (n >= list[i]) m *= cfg['supply.milestoneMult'];
    return m;
  }

  function nextMilestone(cfg, n) {
    var list = milestones(cfg);
    for (var i = 0; i < list.length; i++) if (n < list[i]) return list[i];
    return null;
  }

  function ownKind(state, k) { var s = 0; for (var b = 0; b < B; b++) s += state.run.own[g(k, b)]; return s; }
  function readKind(state, k) { var s = 0; for (var b = 0; b < B; b++) s += state.run.rd[g(k, b)]; return s; }

  function lentGroups(state) {
    var out = zeros(GROUPS);
    (state.run.loans || []).forEach(function (l) {
      for (var key in l.g) out[Number(key)] += l.g[key];
    });
    return out;
  }

  function deskGroups(state) {
    var out = zeros(GROUPS);
    state.run.desks.forEach(function (d) { if (d) out[g(d.k, d.b)] += d.n; });
    return out;
  }

  /** Books of the group that can go to a desk: owned, not read, not on a desk, not lent. */
  function unread(state, k, b, lent, desk) {
    var i = g(k, b);
    lent = lent || lentGroups(state);
    desk = desk || deskGroups(state);
    return Math.max(0, state.run.own[i] - state.run.rd[i] - desk[i] - lent[i]);
  }

  function unreadKind(state, k) {
    var lent = lentGroups(state);
    var desk = deskGroups(state);
    var s = 0;
    for (var b = 0; b < B; b++) s += unread(state, k, b, lent, desk);
    return s;
  }

  // ---- the halls ----

  function labHall(state, cfg, n) {
    var r = Rng.make(Rng.hash('lab:' + n));
    var rule = r.int(4);
    var parts = ['Зал', 'Галерея', 'Ротонда', 'Анфилада', 'Ниша', 'Переход', 'Хоры'];
    var tails = ['отражений', 'шёпота', 'забытых полок', 'винтовой лестницы', 'сквозняков', 'тихих шагов', 'долгих теней', 'пыльных карт'];
    var h = { id: 'lab' + n, title: r.pick(parts) + ' ' + r.pick(tails), lab: n, cap: cfg['labyrinth.capBase'] + cfg['labyrinth.capStep'] * n };
    if (rule === 0) {
      h.kinds = [r.int(K)];
      h.mult = cfg['labyrinth.kindMult'];
      h.text = KIND_NAMES[h.kinds[0]];
    } else if (rule === 1) {
      h.branches = [r.int(B)];
      h.mult = cfg['labyrinth.branchMult'];
      h.text = 'книги ветви «' + BRANCH_NAMES[h.branches[0]] + '»';
    } else if (rule === 2) {
      h.speed = true;
      h.mult = cfg['labyrinth.speedMult'];
      h.text = 'чтение во всей библиотеке';
    } else {
      h.global = true;
      h.mult = cfg['labyrinth.coinsMult'];
      h.text = 'все монеты';
    }
    return h;
  }

  function hallDef(state, cfg, id) {
    if (/^lab\d+$/.test(id)) return labHall(state, cfg, Number(id.slice(3)));
    for (var i = 0; i < HALLS.length; i++) {
      if (HALLS[i].id !== id) continue;
      var h = {};
      for (var k in HALLS[i]) h[k] = HALLS[i][k];
      h.cap = cfg['hall.' + id + '.cap'];
      h.mult = cfg['hall.' + id + '.mult'] === undefined ? 1 : cfg['hall.' + id + '.mult'];
      return h;
    }
    return null;
  }

  function hallCost(state, cfg, id) {
    if (/^lab\d+$/.test(id)) return Big.mul(Big.mul(cfg['labyrinth.cost'], Math.pow(cfg['labyrinth.growth'], Number(id.slice(3)))), costScale(state, cfg));
    return Big.mul(cfg['hall.' + id + '.cost'], costScale(state, cfg));
  }

  /** Why the hall is closed now ('' when it can be opened for coins). */
  function hallNeed(state, cfg, id) {
    if (/^lab\d+$/.test(id)) {
      var n = Number(id.slice(3));
      if (building(state) < cfg['labyrinth.building']) return 'откроется в Библиотеке-лабиринте';
      if (n > 0 && !hallOpen(state, 'lab' + (n - 1))) return 'сначала предыдущий зал лабиринта';
      return '';
    }
    var def = null;
    for (var i = 0; i < HALLS.length; i++) if (HALLS[i].id === id) def = HALLS[i];
    if (!def || !def.need) return '';
    var need = def.need;
    if (need.own !== undefined && ownKind(state, need.own) < cfg[need.key]) return KIND_SHORT[need.own] + ': ' + ownKind(state, need.own) + ' из ' + cfg[need.key];
    if (need.desks && state.run.desks.length < cfg[need.desks]) return 'столов ' + state.run.desks.length + ' из ' + cfg[need.desks];
    if (need.level !== undefined && lvl(state, need.level) < cfg[need.key]) return BRANCH_NAMES[need.level] + ' ' + cfg[need.key] + '-го уровня';
    if (need.tome && !tomeOwned(state, need.tome)) return 'том «' + tomeDef(need.tome).title + '»';
    if (need.tomes && state.run.tomes.length < cfg[need.tomes]) return 'уникальных томов ' + state.run.tomes.length + ' из ' + cfg[need.tomes];
    return '';
  }

  function openHall(state, cfg, id) {
    if (hallOpen(state, id) || hallNeed(state, cfg, id)) return false;
    if (!hallDef(state, cfg, id)) return false;
    var price = hallCost(state, cfg, id);
    if (Big.lt(state.run.coins, price)) return false;
    state.run.coins = Big.sub(state.run.coins, price);
    state.run.halls.push(id);
    if (/^lab/.test(id)) state.run.lab = Math.max(num(state.run.lab, 0), Number(id.slice(3)) + 1);
    if (allStandardHalls(state)) flag(state, 'allHalls');
    return true;
  }

  function allStandardHalls(state) {
    for (var i = 0; i < HALLS.length; i++) if (!hallOpen(state, HALLS[i].id)) return false;
    return true;
  }

  /** Halls the screen lists: the 12, then the labyrinth's (opened ones and the next). */
  function hallList(state, cfg) {
    var out = HALLS.map(function (h) { return hallDef(state, cfg, h.id); });
    if (building(state) >= cfg['labyrinth.building']) {
      var n = num(state.run.lab, 0);
      for (var i = 0; i <= n; i++) out.push(labHall(state, cfg, i));
    }
    return out;
  }

  function openHalls(state, cfg, now) {
    var out = [];
    var capMult = 1 + tomeValue(state, cfg, 'attics');
    state.run.halls.forEach(function (id) {
      var h = hallDef(state, cfg, id);
      if (!h) return;
      h.cap = Math.floor(h.cap * capMult);
      if (id === 'reading' && state.run.roofUntil > now) h.cap = 0;
      out.push(h);
    });
    return out;
  }

  /** How much a hall multiplies a book of the group (1 when the hall is not for it). */
  function hallEff(h, k, b) {
    if (h.speed || h.global || h.tomes || h.librarian) return 1;
    if (h.kinds && h.kinds.indexOf(k) >= 0) return h.mult;
    if (h.branches && h.branches.indexOf(b) >= 0) return h.mult;
    return 1;
  }

  function specialty(h) { return (h.kinds && h.kinds.length) || (h.branches && h.branches.length) ? 1 : 0; }

  // ---- multipliers ----

  /** Everything the coins of a book depend on, once per computation. */
  function mults(state, cfg, now, ctx) {
    var r = state.run;
    var kind = [];
    var advicePer = cfg['advice.per'] + tomeValue(state, cfg, 'letters');
    var letters = lvl(state, 2);
    for (var k = 0; k < K; k++) {
      var own = ownKind(state, k);
      var read = Math.min(readKind(state, k), own);
      var base = cfg['supply.income'] * Math.pow(cfg['supply.incomeStep'], k);
      var annot = 1 + cfg['branch.letters.annot'] * letters * Math.min(num(r.annot[k], 0), own);
      kind.push(base * milestoneMult(cfg, own) * (1 + advicePer * read) * annot * boostOf(state, 'kind', now, k));
    }
    var branch = [];
    for (var b = 0; b < B; b++) {
      var m = 1;
      if (b === 0) m *= Math.pow(cfg['branch.nature.mult'], lvl(state, 0));
      if (b === 2) m *= Math.pow(cfg['event.contest.mult'], num(r.contest, 0));
      var tr = (state.meta.treatises || []);
      for (var t = 0; t < tr.length; t++) if (tr[t][0] === b || tr[t][1] === b) m *= cfg['treatise.mult'];
      m *= boostOf(state, 'branch', now, undefined, b);
      branch.push(m);
    }
    var storage = lvl(state, 4) >= cfg['branch.crafts.bindery'] ? cfg['storage.bindery'] : cfg['storage.mult'];
    if (r.roofUntil > now) storage = Math.max(storage, cfg['event.roof.storage']);
    storage += tomeValue(state, cfg, 'stones');
    var global = (1 + cfg['reputation.bonus'] * num(state.meta.reputation, 0)) * (1 + tomeValue(state, cfg, 'city')) *
      (1 + cfg['exhibit.bonus'] * num(r.exhibits, 0)) * boostOf(state, 'coins', now);
    if (hallOpen(state, 'scrolls')) global *= cfg['hall.scrolls.mult'];
    var labs = num(r.lab, 0);
    for (var i = 0; i < labs; i++) {
      var lh = labHall(state, cfg, i);
      if (lh.global && hallOpen(state, lh.id)) global *= lh.mult;
    }
    if (ctx && inTrip(ctx)) global *= 1 + tomeValue(state, cfg, 'ferry');
    return {
      kind: kind, branch: branch, storage: storage, global: global,
      hall: Math.pow(cfg['branch.art.halls'], lvl(state, 3)) * boostOf(state, 'halls', now),
      scale: incomeScale(state, cfg)
    };
  }

  /**
   * Where the books stand: {halls: [{h, used, groups: {g: n}}], storage: {g: n}, stored}. With the
   * Каталогизатор (or right after «Расставить книги») — the best placement; otherwise the last
   * arrangement keeps its places and new books fill free shelves in order of arrival (kind by kind).
   */
  function allocation(state, cfg, now, m) {
    var lent = lentGroups(state);
    var left = [];
    var i;
    for (i = 0; i < GROUPS; i++) left.push(Math.max(0, state.run.own[i] - lent[i]));
    var halls = openHalls(state, cfg, now).map(function (h) { return { h: h, used: 0, groups: {} }; });
    function put(hall, gi, n) {
      if (n <= 0) return;
      hall.groups[gi] = (hall.groups[gi] || 0) + n;
      hall.used += n;
      left[gi] -= n;
    }
    if (council(state, 'catalog') > 0) {
      best(halls, left, m, put);
    } else {
      var shelf = state.run.shelf || {};
      halls.forEach(function (hall) {
        var q = shelf[hall.h.id];
        if (!q) return;
        for (var key in q) {
          var gi = Number(key);
          put(hall, gi, Math.min(q[key], left[gi], hall.h.cap - hall.used));
        }
      });
      halls.forEach(function (hall) {
        for (var gi = 0; gi < GROUPS && hall.used < hall.h.cap; gi++) put(hall, gi, Math.min(left[gi], hall.h.cap - hall.used));
      });
    }
    var storage = {};
    var stored = 0;
    for (i = 0; i < GROUPS; i++) {
      if (left[i] > 0) {
        storage[i] = left[i];
        stored += left[i];
      }
    }
    return { halls: halls, storage: storage, stored: stored };
  }

  function best(halls, left, m, put) {
    var order = [];
    for (var i = 0; i < GROUPS; i++) if (left[i] > 0) order.push(i);
    order.sort(function (a, b) {
      return m.kind[Math.floor(b / B)] * m.branch[b % B] - m.kind[Math.floor(a / B)] * m.branch[a % B];
    });
    order.forEach(function (gi) {
      var k = Math.floor(gi / B);
      var b = gi % B;
      var fit = halls.filter(function (x) { return x.used < x.h.cap; });
      fit.sort(function (x, y) { return (hallEff(y.h, k, b) - hallEff(x.h, k, b)) || (specialty(x.h) - specialty(y.h)); });
      for (var j = 0; j < fit.length && left[gi] > 0; j++) put(fit[j], gi, Math.min(left[gi], fit[j].h.cap - fit[j].used));
    });
  }

  /** «Расставить книги»: the best placement becomes the arrangement. */
  function arrange(state, cfg, now) {
    var m = mults(state, cfg, now, null);
    var lent = lentGroups(state);
    var left = [];
    for (var i = 0; i < GROUPS; i++) left.push(Math.max(0, state.run.own[i] - lent[i]));
    var halls = openHalls(state, cfg, now).map(function (h) { return { h: h, used: 0, groups: {} }; });
    best(halls, left, m, function (hall, gi, n) {
      if (n <= 0) return;
      hall.groups[gi] = (hall.groups[gi] || 0) + n;
      hall.used += n;
      left[gi] -= n;
    });
    var shelf = {};
    halls.forEach(function (hall) { shelf[hall.h.id] = hall.groups; });
    state.run.shelf = shelf;
    return true;
  }

  /** Coins a second of every book now (before the links' multiplier and the offline share): a number. */
  function incomeNumber(state, cfg, now, ctx, detail) {
    var m = mults(state, cfg, now, ctx);
    var a = allocation(state, cfg, now, m);
    var total = 0;
    var byKind = detail ? zeros(K) : null;
    a.halls.forEach(function (hall) {
      for (var key in hall.groups) {
        var gi = Number(key);
        var k = Math.floor(gi / B);
        var v = hall.groups[key] * m.kind[k] * m.branch[gi % B] * hallEff(hall.h, k, gi % B) * m.hall;
        total += v;
        if (byKind) byKind[k] += v;
      }
    });
    for (var key2 in a.storage) {
      var gi2 = Number(key2);
      var v2 = a.storage[key2] * m.kind[Math.floor(gi2 / B)] * m.branch[gi2 % B] * m.storage;
      total += v2;
      if (byKind) byKind[Math.floor(gi2 / B)] += v2;
    }
    var fav = state.run.fav;
    if (typeof fav === 'number' && fav >= 0 && lvl(state, 2) >= cfg['branch.letters.favorite'] && ownKind(state, fav) > 0) {
      var fv = (cfg['branch.letters.favoriteMult'] - 1) * m.kind[fav] * m.hall;
      total += fv;
      if (byKind) byKind[fav] += fv;
    }
    total *= m.global;
    if (detail) return { total: total, byKind: byKind.map(function (x) { return x * m.global * m.scale; }), alloc: a, m: m };
    return total;
  }

  /** Coins a second (Big), before the links' multiplier. */
  function income(state, cfg, now, ctx) {
    return Big.mul(incomeNumber(state, cfg, now === undefined ? 0 : now, ctx), incomeScale(state, cfg));
  }

  function offlineShare(state, cfg) {
    return Math.min(1, cfg['offline.share'] + cfg['council.offline.step'] * council(state, 'offline') + tomeValue(state, cfg, 'lighthouse'));
  }

  // ---- reading ----

  function speed(state, cfg, now, ctx) {
    var s = Math.pow(cfg['branch.history.speed'], lvl(state, 1));
    UPGRADES.forEach(function (u) { s *= Math.pow(cfg['upgrade.mult'], upgradeLevel(state, u.id)); });
    s *= Math.pow(cfg['council.read.mult'], council(state, 'read'));
    if (hallOpen(state, 'music')) s *= cfg['hall.music.mult'];
    var labs = num(state.run.lab, 0);
    for (var i = 0; i < labs; i++) {
      var lh = labHall(state, cfg, i);
      if (lh.speed && hallOpen(state, lh.id)) s *= lh.mult;
    }
    s *= 1 + tomeValue(state, cfg, 'rain');
    s *= 1 + tomeValue(state, cfg, 'clock');
    s *= boostOf(state, 'speed', now);
    if (inTrip(ctx)) s *= cfg['trip.read'];
    return s;
  }

  function bookFactor(state, cfg, k) {
    return k >= cfg['tome.dreams.minKind'] - 1 ? 1 + tomeValue(state, cfg, 'dreams') : 1;
  }

  /** Seconds of reading a book of the kind takes at speed 1. */
  function work(cfg, k) { return cfg['read.minutes'] * 60 * Math.pow(cfg['read.step'], k); }

  /** Seconds the book of the kind takes now (no events, no trip). */
  function readTime(state, cfg, k, now) {
    return work(cfg, k) / (speed(state, cfg, now === undefined ? 0 : now, null) * bookFactor(state, cfg, k));
  }

  function knowledgeOf(state, cfg, k, b) {
    var base = Math.floor(Math.pow(cfg['knowledge.base'], k));
    var m = 1;
    for (var i = 0; i < TOMES.length; i++) if (TOMES[i].fx === 'know' && TOMES[i].b === b) m *= 1 + tomeValue(state, cfg, TOMES[i].id);
    m *= 1 + tomeValue(state, cfg, 'chapter');
    if (k < cfg['tome.hush.maxKind']) m *= 1 + tomeValue(state, cfg, 'hush');
    return Math.max(1, Math.floor(base * m));
  }

  function librarian(state) { return hallOpen(state, 'lending') || council(state, 'librarian') > 0; }

  function pairs(state, cfg, k) { return lvl(state, 1) >= cfg['branch.history.pair'] && k < cfg['history.pairMaxKind']; }

  var ADJ = ['Тихий', 'Северный', 'Зимний', 'Последний', 'Неторопливый', 'Дальний', 'Старый', 'Ночной', 'Забытый', 'Медленный', 'Короткий', 'Светлый'];
  var NOUN = [
    ['гербарий', 'сад', 'лес', 'ручей', 'мох', 'чертополох'],
    ['летописец', 'перевал', 'город', 'архив', 'тракт', 'гарнизон'],
    ['роман', 'дневник', 'сонет', 'переписчик', 'словарь', 'рассказчик'],
    ['холст', 'мастер', 'этюд', 'орнамент', 'витраж', 'резец'],
    ['станок', 'фонарщик', 'гончар', 'переплёт', 'чертёж', 'механизм'],
    ['маятник', 'знак', 'шифр', 'колодец', 'ключ', 'туман']
  ];
  var FIRST = ['А.', 'Б.', 'В.', 'Г.', 'Д.', 'Е.', 'З.', 'И.', 'К.', 'Л.', 'М.', 'Н.', 'О.', 'П.', 'Р.', 'С.', 'Т.', 'Ф.'];
  var LAST = ['Зорин', 'Ветлугин', 'Мельникова', 'Остроумов', 'Ласточкина', 'Перелесов', 'Тихомирова', 'Синицын', 'Колоколов', 'Ясенева',
    'Бережной', 'Рябинина', 'Камышов', 'Светлова', 'Полынин', 'Крапивина', 'Островой', 'Черёмухина'];
  var LINES = [
    ['Неторопливое описание того, что растёт и живёт рядом с нами.', 'Наблюдения, записанные на полях за много лет.'],
    ['Повествование о событиях, которые помнят немногие.', 'Хроника, собранная по письмам и счетам.'],
    ['Тонкая книга, которую перечитывают по одной странице в день.', 'Истории, рассказанные будто вполголоса.'],
    ['Рассуждения о цвете, линии и терпении мастера.', 'Описание работ, которых больше никто не видел.'],
    ['Подробное руководство с чертежами и примечаниями.', 'Записки о ремесле, которое знают руки.'],
    ['Книга, в которой больше вопросов, чем ответов.', 'Страницы с пометками, смысл которых ещё не разгадан.']
  ];

  /** A book made without the model: title, author and a short description from a template. */
  function procBook(rng, b, k) {
    if (b === undefined || b === null || b < 0) b = rng.int(B);
    if (k === undefined || k === null || k < 0) k = rng.int(K);
    var title = rng.pick(ADJ) + ' ' + rng.pick(NOUN[b]);
    var author = rng.pick(FIRST) + ' ' + rng.pick(LAST);
    var text = KIND_NAMES[k] + ', ветвь «' + BRANCH_NAMES[b] + '». ' + rng.pick(LINES[b]) + ' Аннотация появится, когда будет сеть.';
    return { title: title, author: author, branch: BRANCH_NAMES[b], kind: k + 1, text: text, procedural: true };
  }

  function makeDesk(state, cfg, k, b, n) {
    var r = rngOf(state, 'book');
    var p = procBook(r, b, k);
    state.run.bookId = num(state.run.bookId, 0) + 1;
    var d = { k: k, b: b, n: n, w: work(cfg, k), p: 0, id: state.run.bookId, t: p.title, a: p.author, x: p.text, tpl: 1, s: 0 };
    if (state.run.bookmark) {
      d.p = d.w;
      state.run.bookmark = 0;
    }
    return d;
  }

  /** Puts a book of the group on the desk (two short books with History 4); true when placed. */
  function place(state, cfg, d, k, b) {
    var r = state.run;
    if (d < 0 || d >= r.desks.length || r.desks[d]) return false;
    var avail = unread(state, k, b);
    if (avail <= 0) return false;
    var n = pairs(state, cfg, k) && avail >= 2 ? 2 : 1;
    r.desks[d] = makeDesk(state, cfg, k, b, n);
    return true;
  }

  /** Puts the next book of the kind (its branch: the least read one with books) on a free desk. */
  function placeKind(state, cfg, d, k) {
    var bestB = -1;
    for (var b = 0; b < B; b++) {
      if (unread(state, k, b) <= 0) continue;
      if (bestB < 0 || state.run.knBy[b] < state.run.knBy[bestB]) bestB = b;
    }
    return bestB >= 0 && place(state, cfg, d, k, bestB);
  }

  /** The book the rule of the Библиотекарь picks: {k, b} or null. */
  function pickBook(state, cfg, rule) {
    var lent = lentGroups(state);
    var desk = deskGroups(state);
    var bestK = -1;
    var bestB = -1;
    var k;
    var b;
    if (rule === 'branch') {
      var order = [0, 1, 2, 3, 4, 5].sort(function (x, y) { return state.run.knBy[x] - state.run.knBy[y]; });
      for (var i = 0; i < order.length; i++) {
        for (k = 0; k < K; k++) if (unread(state, k, order[i], lent, desk) > 0) return { k: k, b: order[i] };
      }
      return null;
    }
    for (k = 0; k < K; k++) {
      for (b = 0; b < B; b++) {
        if (unread(state, k, b, lent, desk) <= 0) continue;
        var better = bestK < 0 || (rule === 'know' ? k > bestK : k < bestK) ||
          (k === bestK && state.run.knBy[b] < state.run.knBy[bestB]);
        if (better) {
          bestK = k;
          bestB = b;
        }
      }
    }
    return bestK < 0 ? null : { k: bestK, b: bestB };
  }

  /** The chance of a unique tome: rarer with every tome this building already has (unique.decay). */
  function uniqueChance(state, cfg, base) {
    return base * Math.pow(cfg['branch.secret.unique'], lvl(state, 5)) * Math.pow(cfg['council.unique.mult'], council(state, 'unique')) *
      (1 + tomeValue(state, cfg, 'diary')) * Math.pow(cfg['unique.decay'], state.run.tomes.length);
  }

  function flag(state, name) {
    state.meta.flags = state.meta.flags || {};
    state.meta.flags[name] = 1;
  }

  function away(state) {
    var r = state.run;
    r.away = r.away || { books: 0, kn: zeros(B), titles: [], tomes: [], loans: 0, coins: '0e0', restored: 0 };
    return r.away;
  }

  /** A unique tome not owned yet, or null; it goes to run.tomes and the collection. */
  function findTome(state, label) {
    var free = TOMES.filter(function (t) { return !tomeOwned(state, t.id); });
    if (!free.length) return null;
    var t = free[Math.floor(roll(state, label) * free.length)];
    state.run.tomes.push(t.id);
    state.meta.collection = state.meta.collection || [];
    if (!has(state.meta.collection, t.id)) state.meta.collection.push(t.id);
    state.run.found = (state.run.found || []).concat([t.id]).slice(-5);
    flag(state, 'tome');
    return t;
  }

  /** The book on desk d is read: knowledge, counters, finds; the desk is freed. finishAt — when. */
  function finish(state, cfg, d, finishAt, ctx) {
    var r = state.run;
    var desk = r.desks[d];
    var gi = g(desk.k, desk.b);
    var n = Math.max(1, Math.min(desk.n, r.own[gi] - r.rd[gi]));
    r.rd[gi] += n;
    r.readTotal = num(r.readTotal, 0) + n;
    state.meta.totalRead = num(state.meta.totalRead, 0) + n;
    var kn = knowledgeOf(state, cfg, desk.k, desk.b) * n;
    r.kn[desk.b] += kn;
    r.knBy[desk.b] += kn;
    r.knEarned += kn;
    if (desk.s) r.annot[desk.k] = num(r.annot[desk.k], 0) + 1;
    var found = null;
    if (desk.k >= cfg['unique.readMinKind'] - 1) {
      var chance = uniqueChance(state, cfg, cfg['unique.readChance']) * (r.note ? cfg['event.note.mult'] : 1);
      if (roll(state, 'read') < chance * n) found = findTome(state, 'tome');
    }
    r.note = 0;
    if (building(state) >= cfg['restore.building'] && desk.k >= cfg['restore.minKind'] - 1 && num(r.damaged, 0) < cfg['restore.max']) {
      if (roll(state, 'damaged') < cfg['restore.chance']) r.damaged = num(r.damaged, 0) + 1;
    }
    var entry = { t: desk.t, a: desk.a, x: desk.x, k: desk.k, b: desk.b, id: desk.id };
    if (desk.tpl) entry.tpl = 1;
    state.meta.catalog = [entry].concat(state.meta.catalog || []).slice(0, cfg['catalog.max']);
    r.last = { t: desk.t, k: desk.k, b: desk.b, kn: kn, at: finishAt };
    flag(state, 'read');
    if (new Date(finishAt).getHours() === cfg['ach.nightHour']) flag(state, 'night');
    if (ctx && ctx.offline) {
      var a = away(state);
      a.books += n;
      a.kn[desk.b] += kn;
      if (a.titles.length < 4) a.titles.push(desk.t);
      if (found) a.tomes.push(found.title);
    }
    r.desks[d] = null;
    return found;
  }

  /** Reading for dt seconds at speed sp: books finish, the Библиотекарь puts the next ones. */
  function readStep(state, cfg, dt, now, ctx, sp) {
    var r = state.run;
    if (librarian(state)) {
      // The Библиотекарь does not leave a desk free while there are books to read.
      for (var f0 = 0; f0 < r.desks.length; f0++) {
        if (r.desks[f0]) continue;
        var first = pickBook(state, cfg, r.rule || 'short');
        if (!first) break;
        place(state, cfg, f0, first.k, first.b);
      }
    }
    for (var d = 0; d < r.desks.length; d++) {
      var guard = 0;
      var budget = dt;
      while (r.desks[d] && budget > 0 && guard < 500) {
        guard++;
        var desk = r.desks[d];
        var f = sp * bookFactor(state, cfg, desk.k);
        var need = (desk.w - desk.p) / f;
        if (need > budget) {
          desk.p += budget * f;
          budget = 0;
          break;
        }
        budget -= Math.max(0, need);
        finish(state, cfg, d, now - budget * 1000, ctx);
        if (librarian(state)) {
          var pick = pickBook(state, cfg, r.rule || 'short');
          if (pick) place(state, cfg, d, pick.k, pick.b);
        }
      }
    }
  }

  /** «Читать на ходу»: `minutes` of reading at all desks at once (the Библиотекарь puts the next books). */
  function readAhead(state, cfg, minutes, now) {
    if (!(minutes > 0)) return false;
    readStep(state, cfg, minutes * 60, now + minutes * 60000, null, speed(state, cfg, now, null));
    return true;
  }

  /** «Книга на дорогу»: the kind whose book is read by the end of a trip of `minutes` (the longest that fits; else the shortest), or -1. */
  function roadKind(state, cfg, minutes, now) {
    var sp = speed(state, cfg, now, null) * cfg['trip.read'];
    var fit = -1;
    var shortest = -1;
    for (var k = 0; k < K; k++) {
      if (unreadKind(state, k) <= 0) continue;
      if (shortest < 0) shortest = k;
      if (work(cfg, k) / (sp * bookFactor(state, cfg, k)) <= minutes * 60) fit = k;
    }
    return fit >= 0 ? fit : shortest;
  }

  /**
   * The usual length of a trip, minutes: the median of the recent trips of «Пассажир» (`trips` from its
   * sheet, [{min}]) not shorter than road.shortTripMin; with fewer than road.usualTrips of them — road.tripMin.
   */
  function usualTripMin(cfg, trips) {
    var list = [];
    (trips || []).forEach(function (t) {
      var m = Number(t && t.min);
      if (isFinite(m) && m >= cfg['road.shortTripMin']) list.push(m);
    });
    if (!list.length || list.length < cfg['road.usualTrips']) return cfg['road.tripMin'];
    list.sort(function (a, b) { return a - b; });
    var mid = Math.floor(list.length / 2);
    return list.length % 2 ? list[mid] : (list[mid - 1] + list[mid]) / 2;
  }

  /** Minutes of the trip still ahead: the usual length less the minutes already on the way, at least road.minLeftMin. */
  function roadMinutes(cfg, usual, elapsed) {
    return Math.max(cfg['road.minLeftMin'], usual - Math.max(0, Number(elapsed) || 0));
  }

  /** Takes the book off the desk: it goes back to the shelf unread. */
  function unplace(state, d) {
    if (!state.run.desks[d]) return false;
    state.run.desks[d] = null;
    return true;
  }

  function setText(x, item) {
    x.t = String(item.title).slice(0, 60);
    x.a = String(item.author || '').slice(0, 40);
    x.x = String(item.text).slice(0, 600);
    x.tpl = 0;
  }

  /**
   * A model's annotation for a book that has only the template one: the first such book of the
   * item's branch on a desk, else in the catalog. 'desk', 'catalog' or '' when none fits.
   */
  function annotate(state, item) {
    if (!item || item.procedural || !item.title || !item.text) return '';
    var b = BRANCH_NAMES.indexOf(item.branch);
    if (b < 0) return '';
    var r = state.run;
    for (var d = 0; d < r.desks.length; d++) {
      if (r.desks[d] && r.desks[d].tpl && r.desks[d].b === b) {
        setText(r.desks[d], item);
        return 'desk';
      }
    }
    var list = state.meta.catalog || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].tpl && list[i].b === b) {
        setText(list[i], item);
        return 'catalog';
      }
    }
    return '';
  }

  /** Books waiting for a model's annotation: on desks and in the catalog, by branch. */
  function waiting(state) {
    var out = zeros(B);
    state.run.desks.forEach(function (d) { if (d && d.tpl) out[d.b] += 1; });
    (state.meta.catalog || []).forEach(function (e) { if (e.tpl) out[e.b] += 1; });
    return out;
  }

  // ---- buying ----

  function discount(state, cfg) {
    return Math.pow(1 - cfg['branch.crafts.discount'], lvl(state, 4)) * (1 - tomeValue(state, cfg, 'stairs'));
  }

  function supplyBase(state, cfg, k) {
    return Big.mul(Big.mul(cfg['supply.cost'], Math.pow(cfg['supply.costStep'], k) * discount(state, cfg)), costScale(state, cfg));
  }

  /** The price of n supplies of kind k (Big). */
  function supplyCost(state, cfg, k, n) {
    return Big.costGeom(supplyBase(state, cfg, k), cfg['supply.growth'], ownKind(state, k), n === undefined ? 1 : n);
  }

  /** How many supplies of kind k the coins buy. */
  function supplyMax(state, cfg, k, coins) {
    return Big.maxBuy(coins === undefined ? state.run.coins : coins, supplyBase(state, cfg, k), cfg['supply.growth'], ownKind(state, k));
  }

  /** n books of kind k arrive (bought or given): branches by lot, a rare unique tome. */
  function addBooks(state, cfg, k, n, label) {
    var r = state.run;
    for (var i = 0; i < n; i++) {
      var b = Math.floor(roll(state, label || 'branch') * B);
      r.own[g(k, b)] += 1;
    }
    r.bought = num(r.bought, 0) + n;
    if (k >= cfg['unique.supplyMinKind'] - 1 && n > 0) {
      var p = 1 - Math.pow(1 - Math.min(1, uniqueChance(state, cfg, cfg['unique.supplyChance'])), n);
      if (roll(state, 'supply') < p) return findTome(state, 'stome');
    }
    return null;
  }

  /** Buys n supplies of kind k when the coins suffice: {bought, tome} or null. */
  function buySupply(state, cfg, k, n) {
    if (k < 0 || k >= K || !(n > 0)) return null;
    var price = supplyCost(state, cfg, k, n);
    if (Big.lt(state.run.coins, price)) return null;
    state.run.coins = Big.sub(state.run.coins, price);
    var tome = addBooks(state, cfg, k, n, 'branch');
    if (council(state, 'catalog') > 0) arrange(state, cfg, 0);
    return { bought: n, tome: tome };
  }

  /** How many to buy for the mode: 1, 10, 'milestone' (to the next), 'max'. */
  function amountFor(state, cfg, k, mode) {
    if (mode === 'max') return Math.max(1, supplyMax(state, cfg, k));
    if (mode === 'milestone') {
      var own = ownKind(state, k);
      var next = nextMilestone(cfg, own);
      return next ? next - own : 10;
    }
    return Number(mode) || 1;
  }

  function deskCost(state, cfg) {
    return Big.mul(Big.mul(cfg['desk.cost'], Math.pow(cfg['desk.growth'], state.run.desks.length)), costScale(state, cfg));
  }

  function buyDesk(state, cfg) {
    if (state.run.desks.length >= cfg['desk.max']) return false;
    var price = deskCost(state, cfg);
    if (Big.lt(state.run.coins, price)) return false;
    state.run.coins = Big.sub(state.run.coins, price);
    state.run.desks.push(null);
    return true;
  }

  /** Лампа, Очки, Тишина have levels without a ceiling: every next one costs upgrade.growth times more. */
  function upgradeLevel(state, id) { return Math.max(0, Math.floor(num(state.run.upgrades[id], 0))); }

  function upgradeCost(state, cfg, id) {
    return Big.mul(Big.mul(cfg['upgrade.' + id + '.cost'], Big.pow(cfg['upgrade.growth'], upgradeLevel(state, id))), costScale(state, cfg));
  }

  function buyUpgrade(state, cfg, id) {
    var price = upgradeCost(state, cfg, id);
    if (Big.lt(state.run.coins, price)) return false;
    state.run.coins = Big.sub(state.run.coins, price);
    state.run.upgrades[id] = upgradeLevel(state, id) + 1;
    return true;
  }

  // ---- branches ----

  function levelCost(state, cfg, b) { return cfg['branch.levelCost'] * Math.pow(cfg['branch.levelGrowth'], lvl(state, b)); }

  function openLevel(state, cfg, b) {
    var cost = levelCost(state, cfg, b);
    if (state.run.kn[b] < cost) return false;
    state.run.kn[b] -= cost;
    state.run.levels[b] = lvl(state, b) + 1;
    var all = true;
    for (var i = 0; i < B; i++) if (lvl(state, i) < cfg['ach.branchLevel']) all = false;
    if (all) flag(state, 'branches');
    return true;
  }

  function setFavorite(state, cfg, k) {
    if (lvl(state, 2) < cfg['branch.letters.favorite']) return false;
    state.run.fav = k;
    return true;
  }

  // ---- the mechanics of the buildings ----

  /** Абонемент (from the Городская): lends a share of the kind's shelf for hours; they come back with coins. */
  function lend(state, cfg, k, hours, now) {
    var r = state.run;
    if (building(state) < cfg['lend.building']) return null;
    if ((r.loans || []).length >= cfg['lend.slots']) return null;
    hours = Math.max(1, Math.min(cfg['lend.maxHours'], Math.round(hours)));
    var lent = lentGroups(state);
    var desk = deskGroups(state);
    var shelf = 0;
    var b;
    for (b = 0; b < B; b++) shelf += Math.max(0, r.own[g(k, b)] - lent[g(k, b)] - desk[g(k, b)]);
    var n = Math.floor(shelf * cfg['lend.share']);
    if (n < 1) return null;
    var m = mults(state, cfg, now, null);
    var groups = {};
    var left = n;
    for (b = 0; b < B && left > 0; b++) {
      var free = Math.max(0, r.own[g(k, b)] - lent[g(k, b)] - desk[g(k, b)]);
      var take = Math.min(free, Math.ceil(n * free / Math.max(1, shelf)), left);
      if (take > 0) {
        groups[g(k, b)] = take;
        left -= take;
      }
    }
    var coins = Big.mul(n * m.kind[k] * m.global * hours * 3600 * cfg['lend.mult'] * (1 + tomeValue(state, cfg, 'streets')), m.scale);
    r.loanId = num(r.loanId, 0) + 1;
    var loan = { id: r.loanId, k: k, n: n - left, g: groups, from: now, until: now + hours * 3600000, coins: Big.str(coins) };
    r.loans = (r.loans || []).concat([loan]);
    return loan;
  }

  function settleLoans(state, cfg, now, ctx) {
    var r = state.run;
    if (!r.loans || !r.loans.length) return;
    var keep = [];
    r.loans.forEach(function (l) {
      if (l.until > now) {
        keep.push(l);
        return;
      }
      r.coins = Big.add(r.coins, l.coins);
      r.earned = Big.add(r.earned, l.coins);
      r.returned = (r.returned || []).concat([{ k: l.k, n: l.n, coins: l.coins, review: Math.floor(roll(state, 'review') * 1000) }]).slice(-5);
      if (ctx && ctx.offline) {
        var a = away(state);
        a.loans += 1;
        a.coins = Big.str(Big.add(a.coins, l.coins));
      }
    });
    r.loans = keep;
  }

  function treatiseCost(state, cfg) { return Math.round(cfg['treatise.cost'] * Math.pow(cfg['treatise.growth'], (state.meta.treatises || []).length)); }

  /** Трактат (from the Университетская): knowledge of two branches → ×2 to their books for good. */
  function writeTreatise(state, cfg, a, b) {
    if (building(state) < cfg['treatise.building'] || a === b || a < 0 || b < 0 || a >= B || b >= B) return false;
    var list = state.meta.treatises || [];
    for (var i = 0; i < list.length; i++) if ((list[i][0] === a && list[i][1] === b) || (list[i][0] === b && list[i][1] === a)) return false;
    var cost = treatiseCost(state, cfg);
    if (state.run.kn[a] < cost || state.run.kn[b] < cost) return false;
    state.run.kn[a] -= cost;
    state.run.kn[b] -= cost;
    state.meta.treatises = list.concat([[Math.min(a, b), Math.max(a, b)]]);
    return true;
  }

  /** Реставрация (from the Губернская): a damaged tome mends by a timer and becomes unique. */
  function startRestore(state, cfg, now) {
    var r = state.run;
    if (building(state) < cfg['restore.building'] || !(r.damaged > 0) || r.restoreUntil) return false;
    r.damaged -= 1;
    r.restoreUntil = now + cfg['restore.minutes'] * 60000;
    return true;
  }

  function settleRestore(state, cfg, now, ctx) {
    var r = state.run;
    if (!r.restoreUntil || r.restoreUntil > now) return;
    r.restoreUntil = 0;
    var t = findTome(state, 'restore');
    if (!t) r.coins = Big.add(r.coins, Big.mul(income(state, cfg, now, null), cfg['restore.coinsMin'] * 60));
    if (ctx && ctx.offline) {
      var a = away(state);
      a.restored += 1;
      if (t) a.tomes.push(t.title);
    }
  }

  /** The theme of an exhibition: {title, b, k, text} (from the screen: stock or built-in). */
  function setTheme(state, theme) {
    if (!theme || typeof theme.b !== 'number') return false;
    state.run.theme = { title: String(theme.title || ''), b: Math.max(0, Math.min(B - 1, theme.b)), k: Math.max(0, Math.min(K - 1, num(theme.k, 0))), text: String(theme.text || '') };
    return true;
  }

  /** Books that fit the theme on the shelves (not lent, not on desks). */
  function themeBooks(state, cfg) {
    var t = state.run.theme;
    if (!t) return 0;
    var lent = lentGroups(state);
    var desk = deskGroups(state);
    var n = 0;
    for (var k = t.k; k < K; k++) n += Math.max(0, state.run.own[g(k, t.b)] - lent[g(k, t.b)] - desk[g(k, t.b)]);
    return n;
  }

  /** Выставка (from the Национальная): 5 books of the theme leave the shelves, the building gets a bonus. */
  function exhibit(state, cfg) {
    var t = state.run.theme;
    if (building(state) < cfg['exhibit.building'] || !t || themeBooks(state, cfg) < cfg['exhibit.size']) return false;
    var left = cfg['exhibit.size'];
    var lent = lentGroups(state);
    var desk = deskGroups(state);
    for (var k = t.k; k < K && left > 0; k++) {
      var gi = g(k, t.b);
      var take = Math.min(left, Math.max(0, state.run.own[gi] - lent[gi] - desk[gi]));
      state.run.own[gi] -= take;
      state.run.rd[gi] = Math.min(state.run.rd[gi], state.run.own[gi]);
      left -= take;
    }
    state.run.exhibits = num(state.run.exhibits, 0) + 1;
    state.run.shown = (state.run.shown || []).concat([t.title]).slice(-20);
    state.run.theme = null;
    return true;
  }

  // ---- the council and the vault ----

  function councilCost(state, cfg, id) {
    return Big.round(Big.mul(cfg['council.' + id + '.cost'], Big.pow(cfg['council.growth'], council(state, id))));
  }

  /** The levels a seat has; from council.endless on it counts as having no ceiling (councilEndless). */
  function councilMax(cfg, id) { return cfg['council.' + id + '.max']; }
  function councilEndless(cfg, id) { return councilMax(cfg, id) >= cfg['council.endless']; }

  function buyCouncil(state, cfg, id) {
    if (council(state, id) >= councilMax(cfg, id)) return false;
    var cost = councilCost(state, cfg, id);
    var have = Big.of(state.layers[LAYER].currency, 0);
    if (Big.lt(have, cost)) return false;
    state.layers[LAYER].currency = Big.sub(have, cost);
    state.meta.council = state.meta.council || {};
    state.meta.council[id] = council(state, id) + 1;
    if (id === 'desks') {
      while (state.run.desks.length < Math.min(cfg['desk.max'], cfg['desk.start'] + council(state, 'desks'))) state.run.desks.push(null);
    }
    if (id === 'catalog') arrange(state, cfg, 0);
    return true;
  }

  function vaultSlots(state, cfg) {
    return Math.min(cfg['vault.max'], cfg['vault.slots'] + council(state, 'vault') + num(state.meta.vaultBonus, 0));
  }

  /** Puts a tome of this building into the Хранилище (kept by the next building) or takes it out. */
  function toggleVault(state, cfg, id) {
    var v = state.meta.vault || [];
    if (has(v, id)) {
      state.meta.vault = v.filter(function (x) { return x !== id; });
      return true;
    }
    if (!tomeOwned(state, id) || v.length >= vaultSlots(state, cfg)) return false;
    state.meta.vault = v.concat([id]);
    return true;
  }

  // ---- events (online only) ----

  function scheduleEvent(state, cfg, now) {
    var r = roll(state, 'eventAt');
    state.run.eventAt = now + (cfg['event.minSec'] + r * (cfg['event.maxSec'] - cfg['event.minSec'])) * 1000;
  }

  function startEvent(state, cfg, now) {
    var id = EVENTS[Math.floor(roll(state, 'event') * EVENTS.length)];
    var e = { id: id, at: now, until: now + cfg['event.expireSec'] * 1000, b: Math.floor(roll(state, 'eventB') * B) };
    if (id === 'catalog') {
      // The puzzle: 9 spines, three of them of the branch b.
      var cells = [];
      var others = [0, 1, 2, 3, 4, 5].filter(function (x) { return x !== e.b; });
      for (var i = 0; i < 9; i++) cells.push(others[Math.floor(roll(state, 'cell') * others.length)]);
      var placed = 0;
      while (placed < 3) {
        var at = Math.floor(roll(state, 'cellAt') * 9);
        if (cells[at] !== e.b) {
          cells[at] = e.b;
          placed++;
        }
      }
      e.cells = cells;
    }
    state.run.event = e;
    return e;
  }

  function addBoost(state, t, v, sec, now, k, b) {
    var x = { t: t, v: v, until: now + sec * 1000 };
    if (k !== undefined) x.k = k;
    if (b !== undefined) x.b = b;
    state.run.boosts = (state.run.boosts || []).filter(function (y) { return y.until > now; }).concat([x]);
  }

  /** The answer to the event card: 'yes' / 'no' (and the kind for the bookseller); {ok, text}. */
  function answer(state, cfg, choice, now, arg) {
    var r = state.run;
    var e = r.event;
    if (!e) return { ok: false };
    var text = '';
    var yes = choice === 'yes';
    var rate = income(state, cfg, now, null);
    if (e.id === 'excursion') {
      addBoost(state, 'coins', cfg['event.excursion.coins'], cfg['event.excursion.sec'], now);
      addBoost(state, 'speed', cfg['event.excursion.read'], cfg['event.excursion.sec'], now);
      text = 'Монеты ×' + cfg['event.excursion.coins'] + ' на ' + cfg['event.excursion.sec'] + ' с';
    } else if (e.id === 'professor') {
      addBooks(state, cfg, cfg['event.professor.kind'] - 1, cfg['event.professor.books'], 'gift');
      text = '+' + cfg['event.professor.books'] + ' книг: ' + KIND_SHORT[cfg['event.professor.kind'] - 1];
    } else if (e.id === 'tea') {
      if (yes) {
        r.kn[e.b] += cfg['event.tea.knowledge'];
        r.knBy[e.b] += cfg['event.tea.knowledge'];
        r.knEarned += cfg['event.tea.knowledge'];
        text = '+' + cfg['event.tea.knowledge'] + ' знание: ' + BRANCH_NAMES[e.b];
      }
    } else if (e.id === 'returned') {
      var got = Big.mul(rate, cfg['event.returned.min'] * 60);
      r.coins = Big.add(r.coins, got);
      r.earned = Big.add(r.earned, got);
      text = '+' + cfg['event.returned.min'] + ' мин монет';
    } else if (e.id === 'quiet') {
      addBoost(state, 'speed', cfg['event.quiet.mult'], cfg['event.quiet.sec'], now);
      text = 'Чтение ×' + cfg['event.quiet.mult'];
    } else if (e.id === 'bookseller') {
      if (yes && typeof arg === 'number') {
        var k = Math.max(0, Math.min(K - 1, arg));
        var n = Math.min(cfg['event.bookseller.books'], Math.max(0, supplyMax(state, cfg, k, Big.div(r.coins, cfg['event.bookseller.price']))));
        if (n > 0) {
          r.coins = Big.sub(r.coins, Big.mul(supplyCost(state, cfg, k, n), cfg['event.bookseller.price']));
          addBooks(state, cfg, k, n, 'branch');
          text = '+' + n + ' ' + KIND_SHORT[k] + ' за полцены';
        } else {
          return { ok: false, text: 'Не хватает монет' };
        }
      }
    } else if (e.id === 'bookmark') {
      r.bookmark = 1;
      text = 'Следующая книга прочтётся сразу';
    } else if (e.id === 'note') {
      r.note = 1;
      text = 'Шанс уникального тома ×' + cfg['event.note.mult'] + ' на следующую книгу';
    } else if (e.id === 'contest') {
      r.contest = num(r.contest, 0) + 1;
      text = 'Словесность ×' + cfg['event.contest.mult'] + ' до конца здания';
    } else if (e.id === 'roof') {
      if (yes) {
        var fix = Big.mul(rate, cfg['event.roof.fixMin'] * 60);
        if (Big.lt(r.coins, fix)) return { ok: false, text: 'Не хватает монет' };
        r.coins = Big.sub(r.coins, fix);
        text = 'Крыша починена';
      } else {
        r.roofUntil = now + cfg['event.roof.min'] * 60000;
        text = 'Книги в запасниках, запасники ×' + cfg['event.roof.storage'];
      }
    } else if (e.id === 'opendoors') {
      addBoost(state, 'halls', cfg['event.opendoors.mult'], cfg['event.opendoors.sec'], now);
      text = 'Залы ×' + cfg['event.opendoors.mult'];
    } else if (e.id === 'students') {
      addBoost(state, 'kind', cfg['event.students.mult'], cfg['event.students.sec'], now, cfg['event.students.kind'] - 1);
      text = KIND_SHORT[cfg['event.students.kind'] - 1] + ' ×' + cfg['event.students.mult'];
    } else if (e.id === 'cat') {
      state.meta.cats = num(state.meta.cats, 0) + 1;
      if (state.meta.cats % cfg['event.cat.every'] === 0) {
        state.meta.vaultBonus = num(state.meta.vaultBonus, 0) + 1;
        text = 'Хранилище +1 ячейка';
      } else {
        text = 'Встреч с котом: ' + state.meta.cats;
      }
    } else if (e.id === 'catalog') {
      if (choice === 'solved') {
        var kn = cfg['event.catalog.knowledge'] * building(state);
        r.kn[e.b] += kn;
        r.knBy[e.b] += kn;
        r.knEarned += kn;
        text = '+' + kn + ' знаний: ' + BRANCH_NAMES[e.b];
      }
    } else if (e.id === 'writer') {
      addBoost(state, 'branch', cfg['event.writer.mult'], cfg['event.writer.sec'], now, undefined, 2);
      text = 'Словесность ×' + cfg['event.writer.mult'];
    }
    r.event = null;
    r.events = num(r.events, 0) + 1;
    scheduleEvent(state, cfg, now);
    return { ok: true, text: text };
  }

  // ---- the automation ----

  /** The Завхоз (Ремёсла 4): buys the supply that pays back first while the coins suffice. */
  function quartermaster(state, cfg, now) {
    if (lvl(state, 4) < cfg['branch.crafts.quartermaster'] || state.run.autoBuy === 0) return 0;
    var bought = 0;
    for (var guard = 0; guard < 20; guard++) {
      var k = bestSupply(state, cfg, now);
      if (k < 0) break;
      if (!buySupply(state, cfg, k, 1)) break;
      bought++;
    }
    return bought;
  }

  /** The kind whose next supply pays back first (by the per-book coins now), or -1 when none is affordable. */
  function bestSupply(state, cfg, now) {
    var m = mults(state, cfg, now, null);
    var bestK = -1;
    var bestT = Infinity;
    for (var k = 0; k < K; k++) {
      var price = supplyCost(state, cfg, k, 1);
      if (Big.gt(price, state.run.coins)) continue;
      var gain = m.kind[k] * m.global * m.scale;
      var own = ownKind(state, k);
      var next = nextMilestone(cfg, own);
      if (next === own + 1) gain *= 1 + own;
      var t = Big.toNumber(price) / Math.max(1e-300, gain);
      if (t < bestT) {
        bestT = t;
        bestK = k;
      }
    }
    return bestK;
  }

  // ---- the functions the engine calls ----

  function newRun(seed, cfg) {
    var desks = [];
    var n = cfg ? cfg['desk.start'] : 1;
    for (var i = 0; i < n; i++) desks.push(null);
    return {
      seed: seed, rolls: 0, coins: Big.str(Big.of(cfg ? cfg['start.coins'] : 15)), earned: '0e0',
      own: zeros(GROUPS), rd: zeros(GROUPS), desks: desks, kn: zeros(B), knBy: zeros(B), knEarned: 0, levels: zeros(B),
      halls: ['reading'], shelf: null, upgrades: {}, tomes: [], annot: zeros(K), fav: -1, rule: 'short', autoBuy: 1,
      boosts: [], event: null, eventAt: 0, loans: [], damaged: 0, restoreUntil: 0, theme: null, exhibits: 0, lab: 0,
      readTotal: 0, bookId: 0, bought: 0, contest: 0, roofUntil: 0, bookmark: 0, note: 0, away: null, last: null, found: [], returned: []
    };
  }

  function init(ctx) {
    var seed = ctx && ctx.rng ? ctx.rng.int(1, 2000000000) : 1;
    return {
      run: newRun(seed, ctx && ctx.config),
      layers: {},
      meta: { reputation: 0, council: {}, vault: [], collection: [], catalog: [], treatises: [], pool: [], flags: {}, cats: 0, vaultBonus: 0, totalRead: 0 }
    };
  }

  function tick(state, dt, ctx) {
    var cfg = ctx.config;
    var now = ctx.now;
    var r = state.run;
    if (!(dt > 0)) return;
    var rate = incomeNumber(state, cfg, now, ctx) * (ctx.mult || 1) * (ctx.offline ? offlineShare(state, cfg) : 1);
    if (rate > 0) {
      var got = Big.mul(rate * dt, incomeScale(state, cfg));
      r.coins = Big.add(r.coins, got);
      r.earned = Big.add(r.earned, got);
    }
    readStep(state, cfg, dt, now, ctx, speed(state, cfg, now, ctx));
    settleLoans(state, cfg, now, ctx);
    settleRestore(state, cfg, now, ctx);
    if (!(r.autoAt > now)) {
      r.autoAt = now + 1000;
      quartermaster(state, cfg, now);
    }
    if (r.boosts && r.boosts.length) r.boosts = r.boosts.filter(function (x) { return x.until > now; });
    if (r.roofUntil && r.roofUntil <= now) r.roofUntil = 0;
    if (!ctx.offline) {
      if (r.event && r.event.until <= now) {
        r.event = null;
        scheduleEvent(state, cfg, now);
      }
      if (!r.eventAt) scheduleEvent(state, cfg, now);
      else if (!r.event && r.eventAt <= now) startEvent(state, cfg, now);
    }
  }

  /** The time of the next thing that happens by itself (a book read, a loan back, a restoration). */
  function nextAt(state, cfg, now, ctx) {
    var r = state.run;
    var t = Infinity;
    var sp = speed(state, cfg, now, ctx);
    r.desks.forEach(function (d) {
      if (d) t = Math.min(t, now + Math.max(0, (d.w - d.p) / (sp * bookFactor(state, cfg, d.k))) * 1000);
    });
    (r.loans || []).forEach(function (l) { t = Math.min(t, l.until); });
    if (r.restoreUntil) t = Math.min(t, r.restoreUntil);
    (r.boosts || []).forEach(function (b) { if (b.until > now) t = Math.min(t, b.until); });
    if (r.roofUntil > now) t = Math.min(t, r.roofUntil);
    return t;
  }

  /**
   * Offline by events: from one finished book (loan back, restoration) to the next, at most
   * offline.maxStepSec a piece, the same tick inside — so it agrees with the engine's steps.
   */
  function offline(state, sec, ctx) {
    var cfg = ctx.config;
    var end = ctx.now;
    var t = end - sec * 1000;
    var guard = 0;
    while (t < end - 0.5 && guard < 100000) {
      guard++;
      var c = {};
      for (var k in ctx) c[k] = ctx[k];
      var next = Math.min(end, t + cfg['offline.maxStepSec'] * 1000, nextAt(state, cfg, t, ctx) + 1);
      if (next <= t) next = Math.min(end, t + 1000);
      c.now = next;
      tick(state, (next - t) / 1000, c);
      t = next;
    }
    return { events: [] };
  }

  function prestigeGain(state, layerId, cfg) {
    var k = num(state.run.knEarned, 0);
    if (!(k > 0)) return Big.ZERO;
    return Big.of(Math.floor(Math.pow(k / cfg['exlibris.per'], cfg['exlibris.power'])));
  }

  /** The bonus of Репутация (+5 % of coins for every Экслибрис ever) with `amount` on hand. */
  function bonus(state, layerId, amount, cfg) {
    var have = Big.toNumber(Big.of(state.layers[LAYER] ? state.layers[LAYER].currency : 0, 0));
    var rep = num(state.meta.reputation, 0) + Math.max(0, Big.toNumber(amount) - have);
    return 1 + cfg['reputation.bonus'] * rep;
  }

  function onPrestige(state, layerId, before, ctx) {
    var cfg = ctx.config;
    var gain = Big.toNumber(Big.sub(state.layers[LAYER].currency, before.layers[LAYER].currency));
    state.meta.reputation = num(state.meta.reputation, 0) + Math.max(0, gain);
    var r = state.run;
    while (r.desks.length < Math.min(cfg['desk.max'], cfg['desk.start'] + council(state, 'desks'))) r.desks.push(null);
    var c = council(state, 'coins');
    if (c > 0) r.coins = Big.str(Big.mul(cfg['council.coins.base'], Big.pow(cfg['council.coins.step'], c - 1)));
    r.tomes = (state.meta.vault || []).slice();
    if (council(state, 'memory') > 0) {
      for (var b = 0; b < B; b++) r.kn[b] = Math.floor(before.run.kn[b] * cfg['council.memory.share']);
    }
    r.rule = before.run.rule || 'short';
    state.meta.buildings = building(state);
    flag(state, 'building');
  }

  function migrate(state, fromVer) { return state; }

  function validate(state) {
    var r = state.run;
    if (!r || !Array.isArray(r.own) || r.own.length !== GROUPS) return 'нет книг (run.own)';
    if (!Array.isArray(r.rd) || r.rd.length !== GROUPS) return 'нет прочитанного (run.rd)';
    for (var i = 0; i < GROUPS; i++) {
      if (!(r.own[i] >= 0) || r.own[i] % 1 !== 0) return 'книг не целое число: ' + r.own[i];
      if (!(r.rd[i] >= 0) || r.rd[i] > r.own[i]) return 'прочитано больше, чем есть: ' + r.rd[i] + ' из ' + r.own[i];
    }
    if (!Array.isArray(r.desks) || r.desks.length < 1) return 'нет столов';
    if (!Array.isArray(r.kn) || r.kn.length !== B) return 'нет знаний';
    if (!Big.valid(r.coins) || Big.sign(r.coins) < 0) return 'монет меньше нуля';
    return null;
  }

  function summary(state, cfg) {
    var parts = [Fmt.rate(income(state, cfg, Date.now(), null)), 'столов ' + state.run.desks.length, 'прочитано ' + num(state.run.readTotal, 0)];
    if (building(state) > 1) parts.push('здание ' + building(state));
    return { line: parts.join(' · ') };
  }

  /** The next desk to free (the notification «Стол освободился»), the next loan to return. */
  function next(state, now, cfg) {
    var out = [];
    var sp = speed(state, cfg, now, null);
    var first = null;
    state.run.desks.forEach(function (d) {
      if (!d) return;
      var at = now + Math.ceil((d.w - d.p) / (sp * bookFactor(state, cfg, d.k))) * 1000;
      if (!first || at < first.at) first = { id: 'desk', at: at, text: 'Дочитана «' + d.t + '» — поставьте следующую книгу' };
    });
    if (first && !librarian(state)) out.push(first);
    (state.run.loans || []).forEach(function (l) { out.push({ id: 'loan', at: l.until, text: 'Абонемент: вернулись ' + l.n + ' книг с монетами' }); });
    return out;
  }

  /** The chest of «Пассажир»: «книга из поезда» — a free book of kind 5 with an annotation, on a free desk if any. */
  function chest(state, rng, cfg) {
    var k = cfg['chest.kind'] - 1;
    var b = rng.int(B);
    state.run.own[g(k, b)] += 1;
    var title = 'Книга из поезда';
    var free = state.run.desks.indexOf(null);
    if (free >= 0 && place(state, cfg, free, k, b)) {
      state.run.desks[free].train = 1;
      title = 'Книга из поезда — уже на столе';
    }
    return { title: title, items: [{ title: KIND_NAMES[k] + ', ' + BRANCH_NAMES[b], amount: 1 }] };
  }

  var THEMES = [
    ['Птицы старых садов', 0], ['Дороги и заставы', 1], ['Письма без адресата', 2], ['Мастера витража', 3], ['Ремёсла у реки', 4],
    ['Знаки на полях', 5], ['Травы и времена года', 0], ['Города, которых нет на картах', 1], ['Сказки зимних вечеров', 2],
    ['Портреты незнакомцев', 3], ['Часы и механизмы', 4], ['Туманные предсказания', 5]
  ];

  /** Content made without the model when the stock ran out in the metro. */
  function procedural(kind, rng) {
    if (kind === 'annotations') return procBook(rng);
    if (kind === 'tomes') {
      var t = rng.pick(TOMES);
      return { title: t.title, text: 'Единственный экземпляр. Подробная аннотация появится, когда будет сеть.', procedural: true };
    }
    if (kind === 'themes') {
      var th = rng.pick(THEMES);
      return { title: th[0], branch: BRANCH_NAMES[th[1]], minKind: 1 + rng.int(4), text: 'Пять книг одной темы — для витрины здания.', procedural: true };
    }
    return null;
  }

  function validateStock(kind, item) {
    var text = JSON.stringify(item || {});
    if (/https?:|www\./i.test(text)) return 'ссылка';
    if (kind === 'annotations') {
      var sentences = String(item.text || '').split(/[.!?…]+/).filter(function (s) { return s.trim().length > 2; }).length;
      if (sentences < 1 || sentences > 5) return 'аннотация не из 2–4 предложений';
      if (BRANCH_NAMES.indexOf(item.branch) < 0) return 'нет такой ветви';
    }
    if (kind === 'tomes') {
      var ok = false;
      for (var i = 0; i < TOMES.length; i++) if (TOMES[i].title === item.title) ok = true;
      if (!ok) return 'не уникальный том из списка';
    }
    if (kind === 'themes' && BRANCH_NAMES.indexOf(item.branch) < 0) return 'нет такой ветви';
    if (kind === 'events' && EVENTS.indexOf(item.event) < 0) return 'нет такого события';
    return null;
  }

  // ---- the bot of the checks (an active player) ----

  /**
   * One second of an attentive player: answers the event card, keeps every desk busy (books that
   * fit in what is left of the trip, the longest one when the trip ends), buys desks, halls,
   * speed and the supplies that pay back first, opens branch levels, spends Экслибрисы.
   * o.tripLeftSec — seconds left of the play (the checks know it).
   */
  function bot(state, ctx, o) {
    var cfg = ctx.config;
    var now = ctx.now;
    var r = state.run;
    o = o || {};
    var bought = 0;
    if (r.event) {
      var e = r.event;
      var res = e.id === 'catalog' ? answer(state, cfg, 'solved', now) : answer(state, cfg, 'yes', now, Math.max(0, bestSupply(state, cfg, now)));
      if (!res.ok) answer(state, cfg, 'no', now);
    }
    var left = o.tripLeftSec === undefined ? Infinity : o.tripLeftSec;
    var sp = speed(state, cfg, now, ctx);
    for (var d = 0; d < r.desks.length; d++) {
      if (r.desks[d]) continue;
      var pick = -1;
      for (var k = K - 1; k >= 0; k--) {
        if (unreadKind(state, k) <= 0) continue;
        var t = work(cfg, k) / (sp * bookFactor(state, cfg, k));
        if (left < 150) {
          pick = k;
          break;
        }
        if (t <= left * 0.9 && t <= cfg['bot.maxOnlineMin'] * 60) {
          pick = k;
          break;
        }
        pick = k;
      }
      if (pick >= 0) placeKind(state, cfg, d, pick);
    }
    for (var b = 0; b < B; b++) while (openLevel(state, cfg, b)) { /* open what the knowledge allows */ }
    if (lvl(state, 2) >= cfg['branch.letters.favorite'] && r.fav < 0) setFavorite(state, cfg, K - 1);
    for (var guard = 0; guard < 4; guard++) {
      var spent = false;
      var deskPrice = deskCost(state, cfg);
      if (r.desks.length < cfg['desk.max'] && Big.gte(r.coins, deskPrice) && Big.lte(deskPrice, Big.mul(income(state, cfg, now, null), cfg['bot.deskSec']))) spent = buyDesk(state, cfg) || spent;
      for (var u = 0; u < UPGRADES.length; u++) {
        var up = UPGRADES[u].id;
        if (Big.lte(upgradeCost(state, cfg, up), Big.mul(income(state, cfg, now, null), cfg['bot.deskSec']))) spent = buyUpgrade(state, cfg, up) || spent;
      }
      hallList(state, cfg).forEach(function (h) {
        var sec = h.id === 'lending' ? cfg['bot.lendingSec'] : cfg['bot.hallSec'];
        if (!hallOpen(state, h.id) && !hallNeed(state, cfg, h.id) && Big.lte(hallCost(state, cfg, h.id), Big.mul(income(state, cfg, now, null), sec))) {
          if (openHall(state, cfg, h.id)) {
            spent = true;
            arrange(state, cfg, now);
          }
        }
      });
      if (!spent) break;
    }
    var before = r.bought;
    // A new kind is bought to be seen as soon as it costs a few seconds of income (saved up for).
    var saving = false;
    for (var nk = 0; nk < K; nk++) {
      if (ownKind(state, nk) > 0) continue;
      if (Big.lte(supplyCost(state, cfg, nk, 1), Big.mul(income(state, cfg, now, null), cfg['bot.newKindSec']))) saving = !buySupply(state, cfg, nk, 1);
      break;
    }
    for (var s = 0; s < 60 && !saving; s++) {
      var best = bestSupply(state, cfg, now);
      if (best < 0 || !buySupply(state, cfg, best, 1)) break;
    }
    bought += r.bought - before;
    if (bought && (num(r.bought, 0) % 25 === 0 || bought > 5)) arrange(state, cfg, now);
    COUNCIL.forEach(function (c) { while (buyCouncil(state, cfg, c.id)) { /* spend */ } });
    return bought;
  }

  return {
    init: init, tick: tick, offline: offline, prestigeGain: prestigeGain, bonus: bonus, onPrestige: onPrestige, migrate: migrate,
    validate: validate, summary: summary, next: next, chest: chest, procedural: procedural, validateStock: validateStock,
    // for the screen and the checks
    LAYER: LAYER, K: K, B: B, BRANCHES: BRANCHES, BRANCH_NAMES: BRANCH_NAMES, BRANCH_EFFECTS: BRANCH_EFFECTS, KIND_NAMES: KIND_NAMES,
    KIND_SHORT: KIND_SHORT, BUILDINGS: BUILDINGS, UPGRADES: UPGRADES, HALLS: HALLS, TOMES: TOMES, TOME_FX: TOME_FX, COUNCIL: COUNCIL,
    EVENTS: EVENTS, THEMES: THEMES,
    group: g, building: building, level: lvl, council: council, ownKind: ownKind, readKind: readKind, unread: unread, unreadKind: unreadKind,
    income: income, incomeNumber: incomeNumber, mults: mults, allocation: allocation, arrange: arrange, offlineShare: offlineShare,
    speed: speed, work: work, readTime: readTime, knowledgeOf: knowledgeOf, bookFactor: bookFactor, librarian: librarian, pairs: pairs,
    place: place, placeKind: placeKind, pickBook: pickBook, procBook: procBook, readStep: readStep, nextAt: nextAt,
    supplyCost: supplyCost, supplyMax: supplyMax, buySupply: buySupply, amountFor: amountFor, bestSupply: bestSupply,
    milestoneMult: milestoneMult, nextMilestone: nextMilestone,
    deskCost: deskCost, buyDesk: buyDesk, upgradeCost: upgradeCost, buyUpgrade: buyUpgrade,
    hallList: hallList, hallDef: hallDef, hallCost: hallCost, hallNeed: hallNeed, hallOpen: hallOpen, openHall: openHall, hallEff: hallEff,
    levelCost: levelCost, openLevel: openLevel, setFavorite: setFavorite,
    tomeDef: tomeDef, tomeValue: tomeValue, tomeOwned: tomeOwned, vaultSlots: vaultSlots, toggleVault: toggleVault,
    councilCost: councilCost, councilMax: councilMax, councilEndless: councilEndless, upgradeLevel: upgradeLevel, buyCouncil: buyCouncil,
    lend: lend, treatiseCost: treatiseCost, writeTreatise: writeTreatise, startRestore: startRestore, setTheme: setTheme,
    themeBooks: themeBooks, exhibit: exhibit, labHall: labHall,
    startEvent: startEvent, answer: answer, quartermaster: quartermaster, uniqueChance: uniqueChance, inTrip: inTrip,
    readAhead: readAhead, roadKind: roadKind, usualTripMin: usualTripMin, roadMinutes: roadMinutes, unplace: unplace, annotate: annotate, waiting: waiting, finish: finish,
    bot: bot
  };
});
