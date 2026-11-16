// The logic of «Ветки поездов» for «Игротека»: tokens for stars and points, the upgrades, the level
// of the day and the challenge of the week, the endless run (endless.js) ticking in the engine's
// tick. The rails and the generator of levels are in rails.js. No passive income and no prestige:
// nothing accrues while the game is closed, an endless run waits paused.
// Shared subset of JavaScript: on the screen (window.GameSim), in the engine (Rhino) and in node.
// Every number is a setting of config.json (cfg).
(function (root, make) {
  var node = typeof require === 'function' && typeof exports !== 'undefined';
  var api = node
    ? make(require('../engine/big.js'), require('./rails.js'), require('./endless.js'))
    : make(root.Big, root.Rails, root.Endless);
  if (typeof exports !== 'undefined') { for (var k in api) exports[k] = api[k]; } else { root.GameSim = api; }
})(this, function (Big, Rails, Endless) {
  'use strict';

  var DAY = 86400000;
  var LEVELS = 15;
  var CHAPTERS = 10;

  /**
   * The upgrades of the spec (16): kind once — bought for good; charge — a charge a purchase;
   * level — charges a run equal to the level, no ceiling, every next level costs
   * price.<id>Growth times more; skin — one look a purchase.
   */
  var UPGRADES = [
    { id: 'hint', title: 'Подсказка', text: 'Показать положение одной стрелки из решения', kind: 'charge', mode: 'puzzle' },
    { id: 'back', title: 'Шаг назад', text: 'Перемотка симуляции головоломки по тактам назад', kind: 'once', mode: 'puzzle' },
    { id: 'ghosts', title: 'Призраки', text: 'Перед пуском видны пути поездов пунктиром', kind: 'once', mode: 'puzzle' },
    { id: 'brake', title: 'Тормоз', text: 'Бесконечный: 5 с время вдвое медленнее. Каждый уровень — ещё заряд на заход, потолка нет', kind: 'level', mode: 'endless' },
    { id: 'signal', title: 'Светофор', text: 'Бесконечный: удержать поезд на 2 с. Каждый уровень — ещё заряд на заход, потолка нет', kind: 'level', mode: 'endless' },
    { id: 'life', title: 'Запасная жизнь', text: 'Бесконечный: четвёртая жизнь', kind: 'once', mode: 'endless' },
    { id: 'warn', title: 'Предупреждение', text: 'Бесконечный: стрелка мигает, если следующий поезд пойдёт не туда', kind: 'once', mode: 'endless' },
    { id: 'siding', title: 'Тупик-отстойник', text: 'Бесконечный: первая стрелка уводит поезд в тупик без штрафа (удержание)', kind: 'once', mode: 'endless' },
    { id: 'wide', title: 'Широкие стрелки', text: 'Зона нажатия стрелок на 30 % больше', kind: 'once', mode: 'both' },
    { id: 'desk', title: 'Диспетчерская', text: 'Бесконечный: расписание следующих 5 поездов с цветами', kind: 'once', mode: 'endless' },
    { id: 'series', title: 'Серия', text: 'Множитель серии растёт на 0,15 вместо 0,1', kind: 'once', mode: 'endless' },
    { id: 'quick', title: 'Скорая смена', text: 'Бесконечный: после ошибки 3 с замедления', kind: 'once', mode: 'endless' },
    { id: 'map', title: 'Карта линий', text: 'Уровни открытых глав — в любом порядке', kind: 'once', mode: 'puzzle' },
    { id: 'skin', title: 'Окраски составов', text: 'Новый рисунок вагонов', kind: 'skin', mode: 'look' },
    { id: 'night', title: 'Ночная схема', text: 'Вторая тема оформления схемы', kind: 'once', mode: 'look' },
    { id: 'depot2', title: 'Второй депо-старт', text: 'Бесконечный: начать с сетью на ступень больше, очки ×1,2', kind: 'once', mode: 'endless' }
  ];
  var SKINS = [
    { id: 'plain', title: 'Гладкие' },
    { id: 'stripes', title: 'Полосы' },
    { id: 'dots', title: 'Горошек' },
    { id: 'chevron', title: 'Ёлочка' },
    { id: 'check', title: 'Клетка' },
    { id: 'wave', title: 'Волна' }
  ];

  function n(x, d) { return typeof x === 'number' && isFinite(x) ? x : d; }

  // Whole tokens: rounded, not floored — a Big read back as a number may be a hair under (122880 → 122879,99…).
  function tokens(state) { return Math.max(0, Math.round(Big.toNumber(Big.of(state.run.tokens, 0)))); }

  function addTokens(state, k) {
    state.run.tokens = Math.max(0, tokens(state) + Math.round(k));
    return Math.round(k);
  }

  // ---- upgrades --------------------------------------------------------------------------------------

  function upgrade(id) {
    for (var i = 0; i < UPGRADES.length; i++) if (UPGRADES[i].id === id) return UPGRADES[i];
    return null;
  }

  /** The price of the next purchase of an upgrade, or -1 when there is nothing more to buy. */
  function price(state, cfg, id) {
    var u = upgrade(id);
    if (!u) return -1;
    var base = n(cfg['price.' + id], 100);
    var have = n(state.run.up[id], 0);
    if (u.kind === 'once') return have ? -1 : base;
    if (u.kind === 'charge') return base;
    if (u.kind === 'level') return Math.round(base * Math.pow(Math.max(1, n(cfg['price.' + id + 'Growth'], 2)), have));
    if (u.kind === 'skin') return SKINS.some(function (s) { return s.id !== 'plain' && !state.run.skins[s.id]; }) ? base : -1;
    return -1;
  }

  /** Buys the upgrade (skin — which one); true when bought. */
  function buyUpgrade(state, cfg, id, skin) {
    var p = price(state, cfg, id);
    if (p < 0 || tokens(state) < p) return false;
    var u = upgrade(id);
    if (u.kind === 'skin') {
      var ok = false;
      SKINS.forEach(function (s) { if (s.id === skin && s.id !== 'plain' && !state.run.skins[s.id]) ok = true; });
      if (!ok) return false;
      state.run.skins[skin] = 1;
      state.run.skin = skin;
    } else if (u.kind === 'charge') {
      state.run.up[id] = n(state.run.up[id], 0) + 1;
    } else {
      state.run.up[id] = n(state.run.up[id], 0) + 1;
    }
    if (id === 'night') state.run.theme = 'night';
    addTokens(state, -p);
    return true;
  }

  // ---- puzzles ---------------------------------------------------------------------------------------

  function chapterOf(id) { return Number(String(id).split('-')[0]) || 0; }

  function solvedIn(state, ch) {
    var c = 0;
    for (var i = 1; i <= LEVELS; i++) if (state.run.stars[ch + '-' + i] > 0) c++;
    return c;
  }

  function starsIn(state, ch) {
    var c = 0;
    for (var i = 1; i <= LEVELS; i++) c += n(state.run.stars[ch + '-' + i], 0);
    return c;
  }

  function totalStars(state) {
    var c = 0;
    for (var k in state.run.stars) c += n(state.run.stars[k], 0);
    return c;
  }

  /** A chapter opens when the one before has chapter.unlock levels solved. */
  function chapterOpen(state, cfg, ch) {
    if (ch <= 1) return true;
    return chapterOpen(state, cfg, ch - 1) && solvedIn(state, ch - 1) >= n(cfg['chapter.unlock'], 10);
  }

  /** In order, or any level of an open chapter with «Карта линий». */
  function levelOpen(state, cfg, ch, i) {
    if (!chapterOpen(state, cfg, ch)) return false;
    if (i <= 1 || state.run.up.map) return true;
    return state.run.stars[ch + '-' + (i - 1)] > 0;
  }

  function threeStarChapter(state, ch) {
    for (var i = 1; i <= LEVELS; i++) if (n(state.run.stars[ch + '-' + i], 0) < 3) return false;
    return true;
  }

  function dayBefore(day) {
    var p = String(day).split('-');
    var t = Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2])) - DAY;
    var d = new Date(t);
    var mm = d.getUTCMonth() + 1;
    var dd = d.getUTCDate();
    return d.getUTCFullYear() + '-' + (mm < 10 ? '0' : '') + mm + '-' + (dd < 10 ? '0' : '') + dd;
  }

  /**
   * A solved puzzle: tokens only for stars better than before. info: {id, kinds, mode: chapter |
   * daily | weekly, day, week}. Returns {tokens, gained, stars, before, first}.
   */
  function award(state, cfg, info, stars) {
    var r = state.run;
    var per = n(cfg['tokens.perStar'], 10);
    var before = 0;
    var first = false;
    stars = Math.max(1, Math.min(3, Math.round(stars)));
    if (info.mode === 'daily') {
      if (r.daily.day !== info.day) {
        r.daily.day = info.day;
        r.daily.stars = 0;
      }
      before = r.daily.stars;
      if (!before) {
        first = true;
        r.daily.streak = r.daily.last === dayBefore(info.day) ? r.daily.streak + 1 : r.daily.last === info.day ? r.daily.streak : 1;
        r.daily.last = info.day;
        r.daily.best = Math.max(r.daily.best, r.daily.streak);
        r.daily.count++;
      }
      r.daily.stars = Math.max(before, stars);
      per *= n(cfg['daily.mult'], 1);
    } else if (info.mode === 'weekly') {
      if (r.weekly.week !== info.week) {
        r.weekly.week = info.week;
        r.weekly.stars = 0;
      }
      before = r.weekly.stars;
      if (!before) {
        first = true;
        r.weekly.count++;
      }
      r.weekly.stars = Math.max(before, stars);
      per *= n(cfg['weekly.mult'], 2);
    } else {
      before = n(r.stars[info.id], 0);
      if (!before) {
        first = true;
        r.solved++;
      }
      if (stars > before) r.stars[info.id] = stars;
    }
    (info.kinds || []).forEach(function (k) { if (Rails.KINDS.indexOf(k) >= 0) r.kinds[k] = 1; });
    var gained = Math.max(0, stars - before);
    var got = addTokens(state, gained * per);
    if (info.mode !== 'daily' && info.mode !== 'weekly' && state.run.puzzle && state.run.puzzle.id === info.id) state.run.puzzle.won = Math.max(n(state.run.puzzle.won, 0), stars);
    return { tokens: got, gained: gained, stars: stars, before: before, first: first };
  }

  /** The switches and delays of the puzzle in hand (restored after the app is killed). */
  function setPuzzle(state, id, sw, dl) {
    var p = state.run.puzzle;
    if (!p || p.id !== id) p = state.run.puzzle = { id: id, sw: [], dl: [], hint: [], won: 0 };
    p.sw = (sw || []).map(function (x) { return x ? 1 : 0; });
    p.dl = (dl || []).map(function (x) { return Math.max(0, Math.round(n(x, 0))); });
    return p;
  }

  /** «Подсказка»: one switch of the solution, where it stands otherwise (a charge). */
  function useHint(state, lv) {
    var p = state.run.puzzle;
    if (!p || p.id !== lv.id || !lv.sol || n(state.run.up.hint, 0) <= 0) return -1;
    var pick = -1;
    for (var i = 0; i < lv.sol.sw.length && pick < 0; i++) if (p.hint.indexOf(i) < 0 && (p.sw[i] ? 1 : 0) !== lv.sol.sw[i]) pick = i;
    for (var j = 0; j < lv.sol.sw.length && pick < 0; j++) if (p.hint.indexOf(j) < 0) pick = j;
    if (pick < 0) return -1;
    p.sw[pick] = lv.sol.sw[pick];
    p.hint.push(pick);
    state.run.up.hint--;
    state.run.hintsUsed++;
    return pick;
  }

  // ---- the endless run -------------------------------------------------------------------------------

  function onTrip(ctx) {
    var L = ctx && ctx.links;
    return !!(L && L.passenger && L.passenger.on && L.passenger.state === 'trip');
  }

  function envOf(state, ctx) {
    return { trip: onTrip(ctx), series: !!state.run.up.series, quick: !!state.run.up.quick };
  }

  /** A new endless run: the upgrades give lives and charges; «Шаги» give one more life once. */
  function startEndless(state, cfg, rng, o) {
    o = o || {};
    var up = state.run.up;
    var bonus = state.run.bonusLife ? 1 : 0;
    var live = Endless.create(cfg, rng, {
      names: o.names, tables: o.tables, depot2: !!(o.depot2 && up.depot2), siding: !!up.siding,
      lives: (up.life ? 1 : 0) + bonus, brakes: n(up.brake, 0), signals: n(up.signal, 0)
    });
    if (!live) return null;
    state.run.bonusLife = 0;
    state.run.live = live;
    return live;
  }

  /** The end of a run: 100 points — a token; the record. */
  function finishEndless(state, cfg) {
    var live = state.run.live;
    if (!live) return null;
    var e = state.run.endless;
    var got = addTokens(state, Math.floor(live.score / n(cfg['tokens.pointsPerToken'], 100)));
    var record = live.score > e.best;
    e.best = Math.max(e.best, live.score);
    e.runs++;
    e.total += live.delivered;
    e.clean = Math.max(e.clean, live.bestClean);
    state.run.result = {
      n: e.runs, score: live.score, tokens: got, delivered: live.delivered, crashes: live.crashes, wrong: live.wrong,
      clean: live.bestClean, record: record, best: e.best
    };
    state.run.live = null;
    return state.run.result;
  }

  // ---- the functions the engine calls ----------------------------------------------------------------

  function init(ctx) {
    return {
      run: {
        tokens: 0, stars: {}, solved: 0, kinds: {}, hintsUsed: 0,
        up: { hint: 0, back: 0, ghosts: 0, brake: 0, signal: 0, life: 0, warn: 0, siding: 0, wide: 0, desk: 0, series: 0, quick: 0, map: 0, night: 0, depot2: 0 },
        skins: { plain: 1 }, skin: 'plain', theme: 'day',
        puzzle: null,
        daily: { day: '', stars: 0, last: '', streak: 0, best: 0, count: 0 },
        weekly: { week: '', stars: 0, count: 0 },
        endless: { best: 0, runs: 0, total: 0, clean: 0 },
        bonusLife: 0, live: null, result: null
      },
      layers: {},
      meta: {}
    };
  }

  /** The endless run goes on while the screen is open; the absence never moves it (paused). */
  function tick(state, dt, ctx) {
    var live = state.run.live;
    if (!live || ctx.offline) return;
    if (!live.over) Endless.advance(live, dt, ctx.config, envOf(state, ctx));
    if (live.over) finishEndless(state, ctx.config);
  }

  function migrate(state, fromVer) {
    // Version 1 is the first.
    return state;
  }

  function validate(state) {
    var r = state.run;
    if (!r || typeof r.stars !== 'object' || !r.up) return 'нет звёзд или улучшений';
    for (var k in r.stars) {
      var s = r.stars[k];
      if (typeof s !== 'number' || s < 0 || s > 3 || s % 1 !== 0) return 'звёзды уровня ' + k + ': ' + s;
    }
    for (var u in r.up) if (typeof r.up[u] !== 'number' || r.up[u] < 0 || r.up[u] % 1 !== 0) return 'улучшение ' + u + ': ' + r.up[u];
    if (!Big.valid(r.tokens) || Big.sign(Big.of(r.tokens, 0)) < 0) return 'жетонов меньше нуля';
    if (r.live) {
      var L = r.live;
      if (typeof L.lives !== 'number' || typeof L.tick !== 'number' || !L.nodes || !L.trains) return 'заход бесконечного режима испорчен';
    }
    return null;
  }

  function summary(state, cfg) {
    var r = state.run;
    var parts = ['звёзд ' + totalStars(state) + ' из ' + LEVELS * CHAPTERS * 3, 'жетонов ' + tokens(state)];
    if (r.endless.best) parts.push('рекорд ' + r.endless.best);
    if (r.live) parts.push('заход идёт');
    return { line: parts.join(' · ') };
  }

  /** «Новый уровень дня»: the next morning (daily.notifyHour) when today's level is solved. */
  function next(state, now, cfg) {
    var d = new Date(now);
    var at = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, n(cfg['daily.notifyHour'], 9), 0, 0).getTime();
    return [{ id: 'daily', at: at, text: 'Новый уровень дня ждёт на схеме' }];
  }

  /** The chest of «Пассажир»: tokens and a charge of the hint. */
  function chest(state, rng, cfg) {
    var t = addTokens(state, n(cfg['chest.tokens'], 30));
    var h = Math.round(n(cfg['chest.hints'], 1));
    state.run.up.hint = n(state.run.up.hint, 0) + h;
    return { title: 'Сундук пассажира', items: [{ title: 'Жетоны', amount: t }, { title: 'Заряд подсказки', amount: h }] };
  }

  var WORDS = {
    open: ['Помню, как здесь', 'В мои годы на этой ветке', 'Говорят, раньше тут', 'Старые машинисты рассказывают, что тут', 'На этом узле когда-то'],
    what: ['стрелки переводили рычагом и песней', 'поезда ходили по свистку', 'расписание писали мелом', 'ночью светились одни семафоры', 'дежурный знал каждый вагон по стуку'],
    tail: ['Не торопитесь с пуском.', 'Смотрите на ленту расписания.', 'Каждая стрелка здесь не просто так.', 'Поезда ждать не любят.', 'Цвет поезда — его адрес.']
  };
  var NAME_PARTS = {
    a: ['Ольховая', 'Сосновая', 'Луговая', 'Заречная', 'Тихая', 'Дальняя', 'Ясная', 'Еловая'],
    b: ['Старый', 'Верхний', 'Нижний', 'Сонный', 'Зелёный'],
    c: ['переезд', 'разъезд', 'пост', 'бор', 'причал']
  };

  /** Without the stock: an intro from the tables, a made-up name of a station. */
  function procedural(kind, rng) {
    if (kind === 'intros') {
      return { chapter: rng.int(1, CHAPTERS), text: rng.pick(WORDS.open) + ' ' + rng.pick(WORDS.what) + '. ' + rng.pick(WORDS.tail), procedural: true };
    }
    if (kind === 'stations') {
      return { name: rng.chance(0.5) ? rng.pick(NAME_PARTS.a) : rng.pick(NAME_PARTS.b) + ' ' + rng.pick(NAME_PARTS.c), procedural: true };
    }
    return null;
  }

  function validateStock(kind, item) {
    var text = kind === 'intros' ? item.text : item.name;
    if (/https?:/i.test(text || '')) return 'ссылка в тексте';
    if (kind === 'intros' && !(item.chapter >= 1 && item.chapter <= CHAPTERS && item.chapter % 1 === 0)) return 'глава не 1–10';
    if (kind === 'stations' && !/^[А-ЯЁ][а-яё -]{2,22}$/.test(item.name || '')) return 'название не по-русски или длинное';
    return null;
  }

  return {
    init: init, tick: tick, migrate: migrate, validate: validate, summary: summary, next: next, chest: chest,
    procedural: procedural, validateStock: validateStock,
    UPGRADES: UPGRADES, SKINS: SKINS, LEVELS: LEVELS, CHAPTERS: CHAPTERS,
    tokens: tokens, addTokens: addTokens, price: price, buyUpgrade: buyUpgrade, award: award, setPuzzle: setPuzzle, useHint: useHint,
    chapterOpen: chapterOpen, levelOpen: levelOpen, solvedIn: solvedIn, starsIn: starsIn, totalStars: totalStars,
    threeStarChapter: threeStarChapter, chapterOf: chapterOf, dayBefore: dayBefore,
    startEndless: startEndless, finishEndless: finishEndless, envOf: envOf, onTrip: onTrip
  };
});
