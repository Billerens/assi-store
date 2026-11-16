// The logic of «Блоки»: a game on the board (classic 8×8, 9×9, two fields 6×6, the task of the
// day, challenges), coins at the end of a game, tools and upgrades bought with coins, the master's
// rank (prestige), the workshop that makes tools while the game is closed.
// Shared subset of JavaScript: the screen (window.GameSim), the engine (Rhino, require) and node.
// Randomness only from the rng given / the game's own stored generator; every number from cfg.
(function (root, make) {
  var node = typeof require === 'function' && typeof exports !== 'undefined';
  var api = node ? make(require('../engine/big.js'), require('../engine/fmt.js'), require('../engine/rng.js'), require('./board.js'))
    : make(root.Big, root.Fmt, root.Rng, root.BlocksBoard);
  if (typeof exports !== 'undefined') { for (var k in api) exports[k] = api[k]; } else { root.GameSim = api; }
})(this, function (Big, Fmt, Rng, B) {
  'use strict';

  var LAYER = 'rank';

  /** The 20 upgrades: `tool` — charges per game (the level); `max` — at most this level. */
  var UPGRADES = [
    { id: 'rotate', tool: true }, { id: 'bomb', tool: true }, { id: 'slot', max: 1 }, { id: 'reroll', tool: true },
    { id: 'undo', tool: true }, { id: 'eraser', tool: true }, { id: 'hammer', tool: true }, { id: 'ruler', tool: true },
    { id: 'streak' }, { id: 'mint' }, { id: 'preview', max: 1 }, { id: 'second', max: 1 }, { id: 'lucky' },
    { id: 'color', max: 1 }, { id: 'gold' }, { id: 'hint', max: 1 }, { id: 'workshop' }, { id: 'wide', max: 1 },
    { id: 'cutter', tool: true }, { id: 'clean', max: 1 }
  ];
  var TOOLS = ['rotate', 'bomb', 'reroll', 'undo', 'eraser', 'hammer', 'ruler', 'cutter'];
  /** The order the workshop makes things in (deterministic: offline by formula = by steps). */
  var WORKSHOP = ['bomb', 'reroll', 'eraser', 'rotate', 'hammer', 'undo', 'ruler', 'cutter'];
  var TOOL_FORMS = {
    rotate: ['поворот', 'поворота', 'поворотов'], bomb: ['бомба', 'бомбы', 'бомб'], reroll: ['переброс', 'переброса', 'перебросов'],
    undo: ['отмена', 'отмены', 'отмен'], eraser: ['ластик', 'ластика', 'ластиков'], hammer: ['молот', 'молота', 'молотов'],
    ruler: ['линейка', 'линейки', 'линеек'], cutter: ['резчик', 'резчика', 'резчиков']
  };
  var TOOL_TITLES = { rotate: 'Поворот', bomb: 'Бомба', reroll: 'Переброс', undo: 'Отмена', eraser: 'Ластик', hammer: 'Молот', ruler: 'Линейка', cutter: 'Резчик' };
  /** One-time upgrades that a «Чистый лист» game switches on for itself. */
  var PASSIVE_FULL = ['slot', 'preview', 'second', 'hint'];
  var RANKS = ['Ученик', 'Подмастерье', 'Мастер', 'Старшина', 'Зодчий'];
  var MODES = { classic: 1, big: 1, twin: 1, daily: 1, challenge: 1 };

  // ---- small helpers ------------------------------------------------------------------------------

  function clone(x) { return JSON.parse(JSON.stringify(x)); }

  function upgrade(id) {
    for (var i = 0; i < UPGRADES.length; i++) if (UPGRADES[i].id === id) return UPGRADES[i];
    return null;
  }

  function level(state, id) { return Number(state.run.up && state.run.up[id]) || 0; }

  function mine(state) {
    var m = state.meta.blocks;
    if (!m) m = state.meta.blocks = metaInit();
    m.records = m.records || { classic: 0, big: 0, twin: 0 };
    m.supply = m.supply || {};
    m.picks = m.picks || {};
    m.chal = m.chal || { done: {} };
    m.chal.done = m.chal.done || {};
    m.names = m.names || {};
    m.daily = m.daily || {};
    m.stats = m.stats || {};
    ['games', 'lines', 'maxLines', 'maxStreak', 'noTools'].forEach(function (k) { m.stats[k] = Number(m.stats[k]) || 0; });
    m.theme = m.theme || 'slate';
    return m;
  }

  function metaInit() {
    return {
      records: { classic: 0, big: 0, twin: 0 }, supply: {}, picks: {}, chal: { done: {} }, names: {}, daily: {}, theme: 'slate',
      stats: { games: 0, lines: 0, maxLines: 0, maxStreak: 0, noTools: 0 }
    };
  }

  function mastery(state) {
    var l = state.layers && state.layers[LAYER];
    return l ? Big.toNumber(Big.of(l.currency, 0)) : 0;
  }

  /** The master's rank: 1 (Ученик) + the number of resets. */
  function rank(state) {
    var l = state.layers && state.layers[LAYER];
    return 1 + (l ? Number(l.count) || 0 : 0);
  }

  function rankName(r) { return RANKS[Math.min(r, RANKS.length) - 1] + (r > RANKS.length ? ' ' + r : ''); }

  /** Is a mode open at this rank (9×9 from rank.big, two fields from rank.twin)? */
  function modeOpen(state, cfg, mode) {
    if (mode === 'big') return rank(state) >= cfg['rank.big'];
    if (mode === 'twin') return rank(state) >= cfg['rank.twin'];
    return !!MODES[mode];
  }

  function supplyCount(state) {
    var s = mine(state).supply;
    var n = 0;
    for (var k in s) n += Number(s[k]) || 0;
    return n;
  }

  function seedFrom(rng) { return Math.floor(rng.next() * 4294967296) >>> 0; }

  // ---- prices and buying ---------------------------------------------------------------------------

  function price(state, cfg, id) {
    var u = upgrade(id);
    if (!u) return null;
    var lv = level(state, id);
    if (u && u.max && lv >= u.max) return null;
    var growth = cfg['up.' + id + '.growth'] || 1;
    return Big.costGeom(cfg['up.' + id + '.cost'], growth, lv, 1);
  }

  function canBuy(state, cfg, id) {
    var p = price(state, cfg, id);
    return !!p && Big.gte(state.run.coins, p);
  }

  /** Buys a level of the upgrade when there is enough; a tool's level also adds a charge to the game on. */
  function buyUpgrade(state, cfg, id) {
    var p = price(state, cfg, id);
    if (!p || Big.lt(state.run.coins, p)) return false;
    state.run.coins = Big.sub(state.run.coins, p);
    state.run.up[id] = level(state, id) + 1;
    var g = state.run.game;
    if (g && upgrade(id).tool && g.mode !== 'challenge') g.ch[id] = (g.ch[id] || 0) + 1;
    return true;
  }

  /** A single-use supply is permanent until spent; it never refills with a new game. */
  function buySupply(state, cfg, tool) {
    if (TOOLS.indexOf(tool) < 0) return false;
    var cost = Big.of(cfg['supply.' + tool + '.cost']);
    if (!Big.valid(cost) || Big.sign(cost) <= 0 || Big.lt(state.run.coins, cost)) return false;
    state.run.coins = Big.sub(state.run.coins, cost);
    var supplies = mine(state).supply;
    supplies[tool] = (Number(supplies[tool]) || 0) + 1;
    return true;
  }

  /** The bot's purchase (checks-kit): the cheapest of the upgrades worth having. */
  function buy(state, cfg) {
    var best = null;
    var bestPrice = null;
    UPGRADES.forEach(function (u) {
      var p = price(state, cfg, u.id);
      if (!p) return;
      if (!bestPrice || Big.lt(p, bestPrice)) {
        best = u.id;
        bestPrice = p;
      }
    });
    return best ? buyUpgrade(state, cfg, best) : false;
  }

  /** Is a passive one-time upgrade on in this game (bought, or the «Чистый лист» game)? */
  function has(state, id) {
    var g = state.run.game;
    if (g && g.full && PASSIVE_FULL.indexOf(id) >= 0) return true;
    return level(state, id) > 0;
  }

  function coinMult(state, cfg) {
    return (1 + level(state, 'mint') * cfg['up.mint.bonus']) * (1 + mastery(state) * cfg['rank.bonus']);
  }

  function streakStep(state, cfg) { return cfg['streak.step'] + level(state, 'streak') * cfg['up.streak.step']; }

  function streakMult(state, cfg, streak) { return Math.min(cfg['streak.max'], 1 + streakStep(state, cfg) * streak); }

  // ---- a game --------------------------------------------------------------------------------------

  function boardsOf(game) { return game.b; }

  function dealOptions(state, cfg, game) {
    if (game.mode === 'daily') return { score: 0, rank: 1, dot: 0, specials: false };
    var r = rank(state);
    var special = (game.mode === 'classic' || game.mode === 'big' || game.mode === 'twin') && r >= cfg['special.fromRank'];
    return {
      score: game.score, rank: r,
      opening: game.deal < cfg['deal.openingDeals'],
      dot: Math.min(cfg['up.lucky.max'], level(state, 'lucky') * cfg['up.lucky.dot']),
      specials: special,
      gold: cfg['special.gold'] * (1 + level(state, 'gold') * cfg['up.gold.more']),
      cracked: cfg['special.cracked']
    };
  }

  function withRng(game, fn) {
    var rng = Rng.make(game.rs);
    var out = fn(rng);
    game.rs = rng.state();
    return out;
  }

  function locks(cells) {
    var k = 0;
    for (var i = 0; i < cells.length; i++) if (B.isLock(cells[i])) k++;
    return k;
  }

  function nextEvent(rng, cfg, game, deal) {
    if (game.mode === 'daily' || deal + 1 < cfg['event.fromDeal']) return null;
    var x = rng.next();
    if (x < cfg['event.heavy']) return 'heavy';
    if (x < cfg['event.heavy'] + cfg['event.gold']) return 'gold';
    if (x < cfg['event.heavy'] + cfg['event.gold'] + cfg['event.gift']) return 'gift';
    return null;
  }

  function eventOptions(o, event) {
    o.heavy = event === 'heavy';
    o.allGold = event === 'gold';
    return o;
  }

  /** The next deal into the tray: events, a lock now and then, the fair deal, the preview. */
  function handOut(state, cfg, game, out) {
    if (game.mode === 'challenge') return;
    if (game.mode === 'daily' && game.deal >= game.deals) {
      game.done = true;
      game.tray = [];
      return;
    }
    withRng(game, function (rng) {
      var event = game.next ? game.nextEv : nextEvent(rng, cfg, game, game.deal);
      var o = eventOptions(dealOptions(state, cfg, game), event);
      game.ev = event || null;
      game.heavy = event === 'heavy';
      if (o.specials && rng.chance(cfg['special.lock'])) {
        var f = rng.int(game.b.length);
        var cells = game.b[f];
        if (locks(cells) < cfg['special.maxLocks']) {
          var free = [];
          for (var i = 0; i < cells.length; i++) if (cells[i] === 0) free.push(i);
          if (free.length > cells.length / 2) cells[rng.pick(free)] = B.LOCK_CELL;
        }
      }
      if (event === 'gift') {
        // Undo may revisit a deal, but may not mint its gift for a second time.
        var giftKey = game.deal + ':' + game.rs;
        game.gifts = game.gifts || {};
        if (!game.gifts[giftKey]) {
          var sup = mine(state).supply;
          sup.bomb = (Number(sup.bomb) || 0) + 1;
          game.gifts[giftKey] = true;
        }
      }
      // Events are chosen together with the preview. A later gold/heavy event cannot replace
      // a promised hand. Fair-deal replacement is needed only if all preview pieces became blocked.
      var previewFits = game.next && (o.opening ? B.handFits(game.b, game.next, cfg['deal.openingBudget'])
        : game.next.some(function (p) { return B.fitsAnywhere(game.b, p); }));
      var picked = previewFits ? game.next : null;
      if (game.next && !picked && out) out.previewChanged = true;
      if (!picked) picked = B.deal(rng, cfg, game.b, o).pieces;
      game.tray = picked;
      // Drawing the daily preview also for owners without the upgrade keeps its RNG common.
      game.next = null;
      game.nextEv = null;
      if (has(state, 'preview') || game.mode === 'daily') {
        game.nextEv = nextEvent(rng, cfg, game, game.deal + 1);
        var nextOptions = dealOptions(state, cfg, game);
        nextOptions.opening = game.mode !== 'daily' && game.deal + 1 < cfg['deal.openingDeals'];
        game.next = B.draw(rng, cfg, eventOptions(nextOptions, game.nextEv));
      }
    });
    game.deal++;
    game.clear = false;
    if (out) out.deal = true;
  }

  /**
   * A new game: mode classic | big | twin | daily | challenge. o = {rng (or seed), fresh, day,
   * level (a challenge), index}. Sets state.run.game and returns it.
   */
  function newGame(state, cfg, mode, o) {
    o = o || {};
    if (!MODES[mode]) throw new Error('нет такого режима: ' + mode);
    if (!modeOpen(state, cfg, mode)) throw new Error('режим ещё не открыт');
    var m = mine(state);
    var source = o.rng || Rng.make(state.meta.seed);
    var seed = o.seed !== undefined ? o.seed >>> 0 : seedFrom(source);
    if (o.seed === undefined && !o.rng) state.meta.seed = source.state();
    var n = mode === 'big' ? cfg['big.size'] : mode === 'twin' ? cfg['twin.size'] : mode === 'challenge' ? o.level.n : cfg['board.size'];
    var game = {
      mode: mode, n: n, b: [B.empty(n)], tray: [], next: null, hold: null,
      score: 0, lines: 0, deal: 0, streak: 0, grace: false, clear: false, heavy: false, ev: null,
      ch: {}, used: 0, second: false, gold: 0, rs: seed, undo: null, stuck: false, done: false,
      full: !!o.fresh, best: 0
    };
    if (mode === 'twin') game.b.push(B.empty(n));
    if (mode === 'daily') {
      var day = o.day;
      var rng = Rng.make(Rng.hash('blocks-daily:' + day));
      var made = B.dailyBoard(rng, cfg, cfg['board.size']);
      game.b = [made.cells];
      game.target = made.target;
      game.deals = cfg['daily.deals'];
      game.day = day;
      game.rs = rng.state();
    }
    if (mode === 'challenge') {
      game.b = [o.level.board.slice()];
      game.queue = clone(o.level.queue);
      game.qi = 0;
      game.idx = o.index;
      game.hist = [];
      game.tray = [clone(game.queue[0])];
    } else {
      TOOLS.forEach(function (t) {
        game.ch[t] = level(state, t) + (Number(m.picks[t]) || 0) + (o.fresh ? cfg['fresh.charges'] : 0);
      });
      if (level(state, 'clean') > 0) game.streak = 1;
    }
    state.run.game = game;
    if (mode !== 'challenge') handOut(state, cfg, game, null);
    game.stuck = isStuck(game);
    return game;
  }

  /** Does any piece of the tray (or the reserve) fit anywhere? */
  function isStuck(game) {
    if (game.done) return false;
    var list = game.tray.concat(game.hold ? [game.hold] : []);
    var any = false;
    for (var i = 0; i < list.length; i++) {
      if (!list[i]) continue;
      any = true;
      if (B.fitsAnywhere(game.b, list[i])) return false;
    }
    return any;
  }

  function snap(game) {
    return clone({
      b: game.b, tray: game.tray, next: game.next, nextEv: game.nextEv, hold: game.hold, score: game.score, lines: game.lines, deal: game.deal,
      streak: game.streak, grace: game.grace, clear: game.clear, heavy: game.heavy, ev: game.ev, gold: game.gold, rs: game.rs,
      stuck: game.stuck, done: game.done, qi: game.qi, best: game.best
    });
  }

  function restore(game, s) {
    for (var k in s) game[k] = s[k];
  }

  function trayEmpty(game) {
    for (var i = 0; i < game.tray.length; i++) if (game.tray[i]) return false;
    return true;
  }

  function endOfDeal(state, cfg, game, out) {
    if (game.clear) {
      game.streak++;
      game.grace = false;
    } else if (has(state, 'wide') && !game.grace && game.streak > 0) {
      game.grace = true;
    } else {
      game.streak = 0;
      game.grace = false;
    }
    var m = mine(state);
    if (game.streak > m.stats.maxStreak) m.stats.maxStreak = game.streak;
    if (out && game.streak >= cfg['ach.streak']) out.ach.push('streak-10');
    handOut(state, cfg, game, out);
  }

  /** The center of each board cleared (the second chance); how many cells went. */
  function clearCenter(game, cfg) {
    var k = 0;
    game.b.forEach(function (cells) {
      var n = B.sideOf(cells);
      var s = Math.min(cfg['second.size'], n - 2);
      var r0 = Math.floor((n - s) / 2);
      for (var r = r0; r < r0 + s; r++) {
        for (var c = r0; c < r0 + s; c++) {
          if (B.kindOf(cells[r * n + c]) === B.GOLD) game.gold += cfg['special.goldCoins'];
        }
      }
      k += B.clearArea(cells, r0, r0, r0 + s - 1, r0 + s - 1);
    });
    return k;
  }

  /** When nothing fits: the second chance once a game (center cleared), else the game is stuck. */
  function settle(state, cfg, game, out) {
    game.stuck = isStuck(game);
    if (game.stuck && game.mode !== 'challenge' && has(state, 'second') && !game.second) {
      game.second = true;
      game.used++;
      clearCenter(game, cfg);
      if (out) out.second = true;
      game.stuck = isStuck(game);
    }
  }

  /**
   * Puts tray piece `ti` on board `f` at (r, c). Returns {ok, points, lines, placed, gold, mono,
   * burnt: [cell indexes], rows, cols, field, deal (a new deal came), stuck, won, failed, ach: [ids]}.
   */
  function place(state, cfg, ti, f, r, c) {
    var game = state.run.game;
    var out = { ok: false, ach: [] };
    if (!game || game.done) return out;
    var p = game.tray[ti];
    if (!p) return out;
    var cells = game.b[f || 0];
    if (!cells || !B.fits(cells, p, r, c)) return out;
    if (game.mode === 'challenge') game.hist.push(snap(game));
    else game.undo = snap(game);
    var burn = B.put(cells, p, r, c);
    var pts = burn.placed * cfg['score.cell'];
    var linePts = 0;
    if (burn.lines) {
      linePts = B.linePoints(burn.lines, cfg) * streakMult(state, cfg, game.streak);
      if (has(state, 'color') && burn.mono) linePts *= 1 + (cfg['up.color.mult'] - 1) * burn.mono / burn.lines;
      game.clear = true;
      game.lines += burn.lines;
      game.gold += burn.gold * cfg['special.goldCoins'];
      var m = mine(state);
      m.stats.lines += burn.lines;
      if (burn.lines > m.stats.maxLines) m.stats.maxLines = burn.lines;
      if (burn.lines >= cfg['ach.lines']) out.ach.push('five-lines');
    }
    pts += linePts;
    if (game.heavy) pts *= cfg['event.heavyMult'];
    pts = Math.round(pts);
    game.score += pts;
    game.tray[ti] = null;
    out.ok = true;
    out.points = pts;
    out.lines = burn.lines;
    out.placed = burn.placed;
    out.gold = burn.gold;
    out.mono = burn.mono;
    out.burnt = burn.burnt;
    out.rows = burn.rows;
    out.cols = burn.cols;
    out.field = f || 0;
    if (game.mode === 'challenge') {
      game.qi++;
      if (game.qi < game.queue.length) game.tray = [clone(game.queue[game.qi])];
      else {
        game.tray = [];
        game.done = true;
        out.won = B.filled(game.b[0]) === 0;
        out.failed = !out.won;
      }
      game.stuck = !game.done && isStuck(game);
      if (game.stuck) out.failed = true;
      return out;
    }
    if (trayEmpty(game)) endOfDeal(state, cfg, game, out);
    settle(state, cfg, game, out);
    out.stuck = game.stuck;
    out.done = game.done;
    if (game.score >= cfg['ach.record']) out.ach.push('record-10k');
    return out;
  }

  /** The reserve slot: tray piece ti goes to the reserve (or swaps with what is there). */
  function hold(state, cfg, ti) {
    var game = state.run.game;
    if (!game || game.done || game.mode === 'challenge' || !has(state, 'slot') || ti % 1 !== 0 || ti < 0 || ti >= game.tray.length) return false;
    var p = game.tray[ti];
    if (!p && !game.hold) return false;
    game.undo = snap(game);
    game.tray[ti] = game.hold;
    game.hold = p || null;
    game.used++;
    var out = { ach: [] };
    if (trayEmpty(game)) endOfDeal(state, cfg, game, out);
    settle(state, cfg, game, out);
    return true;
  }

  /** Charges of the game first, then the one-time supplies: how many uses of a tool are left. */
  function toolLeft(state, tool) {
    var game = state.run.game;
    var ch = game && game.ch ? Number(game.ch[tool]) || 0 : 0;
    return ch + (Number(mine(state).supply[tool]) || 0);
  }

  function spendTool(state, tool) {
    var game = state.run.game;
    if (game.ch[tool] > 0) {
      game.ch[tool]--;
      return 'charge';
    }
    var sup = mine(state).supply;
    if ((Number(sup[tool]) || 0) > 0) {
      sup[tool] = Number(sup[tool]) - 1;
      if (!sup[tool]) delete sup[tool];
      return 'supply';
    }
    return null;
  }

  /**
   * A tool: rotate {ti}, cutter {ti}, reroll, undo, bomb {f, r, c}, eraser {f, r, c},
   * hammer {f, r}, ruler {f, c}. Returns {ok, why?, from: 'charge' | 'supply', cleared, …}.
   */
  function useTool(state, cfg, tool, a) {
    a = a || {};
    var game = state.run.game;
    if (!game || game.done || game.mode === 'challenge') return { ok: false, why: 'не в этой партии' };
    if (TOOLS.indexOf(tool) < 0) return { ok: false, why: 'нет такого инструмента' };
    if (toolLeft(state, tool) <= 0) return { ok: false, why: 'нет зарядов' };
    var f = a.f || 0;
    var cells = game.b[f];
    var before = snap(game);
    var out = { ok: true, tool: tool, ach: [] };
    if (tool === 'rotate' || tool === 'cutter') {
      var p = game.tray[a.ti];
      if (!p) return { ok: false, why: 'нет фигуры' };
      if (tool === 'rotate') game.tray[a.ti] = B.rotatePiece(p);
      else {
        var parts = B.cut(p);
        if (!parts) return { ok: false, why: 'клетку не разрезать' };
        game.tray[a.ti] = parts[0];
        game.tray.push(parts[1]);
      }
    } else if (tool === 'reroll') {
      withRng(game, function (rng) { game.tray = B.deal(rng, cfg, game.b, dealOptions(state, cfg, game)).pieces; });
      game.heavy = false;
      game.ev = null;
    } else if (tool === 'undo') {
      if (!game.undo) return { ok: false, why: 'нечего отменять' };
      mine(state).stats.lines -= game.lines - game.undo.lines;
      restore(game, game.undo);
      game.undo = null;
      out.from = spendTool(state, tool);
      game.used++;
      settle(state, cfg, game, out);
      return out;
    } else {
      if (!cells) return { ok: false, why: 'нет поля' };
      var n = B.sideOf(cells);
      if ((tool !== 'ruler' && (a.r % 1 !== 0 || a.r < 0 || a.r >= n)) ||
          (tool !== 'hammer' && (a.c % 1 !== 0 || a.c < 0 || a.c >= n))) return { ok: false, why: 'за пределами поля' };
      var goldBefore = 0;
      for (var gi = 0; gi < cells.length; gi++) if (B.kindOf(cells[gi]) === B.GOLD) goldBefore++;
      if (tool === 'bomb') out.cleared = B.clearArea(cells, a.r - 1, a.c - 1, a.r + 1, a.c + 1);
      else if (tool === 'eraser') {
        if (!cells[a.r * n + a.c]) return { ok: false, why: 'клетка пуста' };
        out.cleared = B.clearArea(cells, a.r, a.c, a.r, a.c);
      } else if (tool === 'hammer') out.cleared = B.clearArea(cells, a.r, 0, a.r, n - 1);
      else if (tool === 'ruler') out.cleared = B.clearArea(cells, 0, a.c, n - 1, a.c);
      if (!out.cleared) return { ok: false, why: 'здесь нечего убирать' };
      var goldAfter = 0;
      for (var gj = 0; gj < cells.length; gj++) if (B.kindOf(cells[gj]) === B.GOLD) goldAfter++;
      out.gold = goldBefore - goldAfter;
      game.gold += out.gold * cfg['special.goldCoins'];
    }
    out.from = spendTool(state, tool);
    game.used++;
    game.undo = before;
    settle(state, cfg, game, out);
    return out;
  }

  /** Coins for a game that ends now (before the multiplier of the links). */
  function rawCoinsFor(state, cfg, game) {
    var base = Math.floor(game.score / cfg['coins.per']) + game.gold;
    var coins = Big.mul(base, Big.add(1, Big.mul(level(state, 'mint'), cfg['up.mint.bonus'])));
    coins = Big.mul(coins, Big.add(1, Big.mul(mastery(state), cfg['rank.bonus'])));
    return coins;
  }

  function coinsFor(state, cfg, game) {
    return Big.toNumber(rawCoinsFor(state, cfg, game));
  }

  /**
   * Ends the game: coins (× the links' multiplier `mult`), records, the best of the cycle, the
   * task of the day. Returns {coins, score, record, mode, daily: {target, done}, ach: [ids]}.
   */
  function endGame(state, cfg, mult) {
    var game = state.run.game;
    if (!game) return null;
    var m = mine(state);
    var out = { score: game.score, mode: game.mode, lines: game.lines, deals: game.deal, record: false, ach: [], coins: 0 };
    if (game.mode === 'challenge') {
      state.run.game = null;
      return out;
    }
    var coins = Big.toNumber(Big.floor(Big.mul(rawCoinsFor(state, cfg, game), mult || 1)));
    if (game.mode === 'daily') {
      var d = m.daily[game.day] || { best: 0, done: false };
      out.daily = { target: game.target, done: game.score >= game.target, first: false };
      if (out.daily.done && !d.done) {
        coins += cfg['daily.reward'];
        out.daily.first = true;
        d.done = true;
      }
      d.best = Math.max(d.best, game.score);
      m.daily[game.day] = d;
      // Only the last days are kept.
      var days = Object.keys(m.daily).sort();
      while (days.length > cfg['daily.history']) delete m.daily[days.shift()];
    } else {
      var key = game.mode;
      if (game.score > (m.records[key] || 0)) {
        m.records[key] = game.score;
        out.record = true;
      }
      if (game.score > (state.run.best || 0)) state.run.best = game.score;
      if (game.used === 0 && game.score >= cfg['ach.noTools']) out.ach.push('no-tools');
      if (game.used === 0 && game.score > m.stats.noTools) m.stats.noTools = game.score;
    }
    if (game.score >= cfg['ach.record']) out.ach.push('record-10k');
    out.coins = coins;
    state.run.coins = Big.add(state.run.coins, coins);
    state.run.earned = Big.add(state.run.earned, coins);
    state.run.games = (state.run.games || 0) + 1;
    m.stats.games++;
    state.run.last = { score: game.score, coins: coins, mode: game.mode, record: out.record, lines: game.lines };
    state.run.game = null;
    return out;
  }

  // ---- challenges ----------------------------------------------------------------------------------

  /** The free step back of a challenge. */
  function back(state) {
    var game = state.run.game;
    if (!game || game.mode !== 'challenge' || !game.hist.length) return false;
    restore(game, game.hist.pop());
    return true;
  }

  /** A challenge solved: coins the first time, the next one opens. Returns the reward (0 if again). */
  function winChallenge(state, cfg, index) {
    var m = mine(state);
    var game = state.run.game;
    if (!game || game.mode !== 'challenge' || game.idx !== index || !game.done || B.filled(game.b[0]) !== 0) return 0;
    if (m.chal.done[index]) return 0;
    m.chal.done[index] = 1;
    var reward = cfg['challenge.reward'] + cfg['challenge.step'] * (index - 1);
    state.run.coins = Big.add(state.run.coins, reward);
    state.run.earned = Big.add(state.run.earned, reward);
    return reward;
  }

  function challengesDone(state) {
    var n = 0;
    var done = mine(state).chal.done;
    for (var k in done) if (done[k]) n++;
    return n;
  }

  /** The highest challenge open: the first not solved (they open one after another). */
  function challengeOpen(state, total) {
    var done = mine(state).chal.done;
    for (var i = 1; i <= total; i++) if (!done[i]) return i;
    return total;
  }

  // ---- mastery picks --------------------------------------------------------------------------------

  function picksFree(state, cfg) {
    var used = 0;
    var picks = mine(state).picks;
    for (var k in picks) used += Number(picks[k]) || 0;
    return Math.floor(mastery(state) / cfg['rank.pickEvery']) - used;
  }

  /** Every rank.pickEvery mastery: +1 starting charge of a tool of the owner's choice. */
  function pick(state, cfg, tool) {
    if (TOOLS.indexOf(tool) < 0 || picksFree(state, cfg) <= 0) return false;
    var picks = mine(state).picks;
    picks[tool] = (Number(picks[tool]) || 0) + 1;
    return true;
  }

  // ---- the workshop ---------------------------------------------------------------------------------

  function workshopInterval(state, cfg) {
    var lv = level(state, 'workshop');
    return lv > 0 ? cfg['up.workshop.hours'] * 3600 / lv : 0;
  }

  /** The workshop works for `sec` seconds: tools into the supplies, up to up.workshop.cap. */
  function workshop(state, cfg, sec, made) {
    var interval = workshopInterval(state, cfg);
    if (!interval) return;
    var cap = cfg['up.workshop.cap'];
    if (supplyCount(state) >= cap) return;
    state.run.ws = (Number(state.run.ws) || 0) + sec;
    var sup = mine(state).supply;
    while (state.run.ws >= interval && supplyCount(state) < cap) {
      state.run.ws -= interval;
      var tool = WORKSHOP[(Number(state.run.wsAt) || 0) % WORKSHOP.length];
      state.run.wsAt = (Number(state.run.wsAt) || 0) + 1;
      sup[tool] = (Number(sup[tool]) || 0) + 1;
      if (made) made[tool] = (made[tool] || 0) + 1;
    }
    if (supplyCount(state) >= cap) state.run.ws = 0;
  }

  function madeText(made) {
    var parts = [];
    WORKSHOP.forEach(function (t) {
      if (made[t]) parts.push(made[t] + ' ' + Fmt.plural(made[t], TOOL_FORMS[t][0], TOOL_FORMS[t][1], TOOL_FORMS[t][2]));
    });
    return parts.length ? 'Мастерская сделала: ' + parts.join(', ') : '';
  }

  // ---- the functions the engine calls --------------------------------------------------------------

  function init(ctx) {
    return {
      run: { coins: '0e0', earned: '0e0', up: {}, best: 0, games: 0, game: null, last: null, ws: 0, wsAt: 0 },
      layers: {},
      meta: { blocks: metaInit() }
    };
  }

  function tick(state, dt, ctx) {
    workshop(state, ctx.config, dt, null);
  }

  /** The same as tick for `sec` seconds at once: the workshop makes its tools. */
  function offline(state, sec, ctx) {
    var made = {};
    workshop(state, ctx.config, sec, made);
    var text = madeText(made);
    return { events: text ? [text] : [] };
  }

  /** Mastery for a reset now: floor((best of the cycle / rank.div) ^ rank.power), from rank.minRecord. */
  function prestigeGain(state, layerId, cfg) {
    var best = Number(state.run.best) || 0;
    if (best < cfg['rank.minRecord']) return Big.ZERO;
    return Big.of(Math.floor(Math.pow(best / cfg['rank.div'], cfg['rank.power'])));
  }

  function bonus(state, layerId, amount, cfg) {
    return Big.add(1, Big.mul(amount, cfg['rank.bonus']));
  }

  function onPrestige(state, layerId, before, ctx) {
    var l = state.layers[LAYER];
    l.state.bestRecord = Math.max(Number(l.state.bestRecord) || 0, Number(before.run.best) || 0);
    mine(state);
  }

  function migrate(state, fromVer) {
    // Version 1 is the first.
    return state;
  }

  function validate(state) {
    var r = state.run;
    if (!Big.valid(r.coins) || Big.sign(r.coins) < 0) return 'монет меньше нуля';
    if (!Big.valid(r.earned) || Big.sign(r.earned) < 0) return 'заработок меньше нуля';
    if (typeof r.best !== 'number' || !isFinite(r.best) || r.best < 0) return 'рекорд цикла не число';
    var id;
    for (id in r.up) if (!upgrade(id) || r.up[id] % 1 !== 0 || r.up[id] < 0) return 'неверный уровень улучшения';
    var m = state.meta.blocks;
    if (m && m.supply) {
      for (id in m.supply) if (TOOLS.indexOf(id) < 0 || m.supply[id] % 1 !== 0 || m.supply[id] < 0) return 'неверный запас инструмента';
    }
    var g = r.game;
    if (g) {
      if (!MODES[g.mode]) return 'неизвестный режим ' + g.mode;
      if (g.n % 1 !== 0 || g.n < 1) return 'неверный размер поля';
      if (!Array.isArray(g.b) || !g.b.length) return 'нет поля';
      for (var i = 0; i < g.b.length; i++) {
        if (!Array.isArray(g.b[i]) || g.b[i].length !== g.n * g.n) return 'поле не того размера';
        for (var j = 0; j < g.b[i].length; j++) {
          var cell = g.b[i][j];
          if (cell % 1 !== 0 || cell < 0 || cell > 63) return 'неверная клетка';
        }
      }
      if (!Array.isArray(g.tray)) return 'нет лотка';
      if (typeof g.score !== 'number' || !isFinite(g.score) || g.score < 0) return 'счёт не число';
      var pieces = g.tray.concat(g.hold ? [g.hold] : []).concat(g.next || []);
      for (var pi = 0; pi < pieces.length; pi++) {
        var p = pieces[pi];
        if (!p) continue;
        if (!B.type(p.t) || !Array.isArray(p.c) || !p.c.length || p.k % 1 !== 0 || p.k < 1 || p.k > 15) return 'неверная фигура';
        var seen = {};
        for (var qi = 0; qi < p.c.length; qi++) {
          var q = p.c[qi];
          if (!Array.isArray(q) || q.length !== 2 || q[0] % 1 !== 0 || q[1] % 1 !== 0 || q[0] < 0 || q[1] < 0 || q[0] >= g.n || q[1] >= g.n || seen[q.join(':')]) return 'неверные клетки фигуры';
          seen[q.join(':')] = true;
        }
      }
      for (id in g.ch) if (TOOLS.indexOf(id) < 0 || g.ch[id] % 1 !== 0 || g.ch[id] < 0) return 'неверные заряды';
    }
    return null;
  }

  function summary(state, cfg) {
    var m = mine(state);
    var parts = ['рекорд ' + Fmt.num(m.records.classic || 0), Fmt.num(Big.floor(Big.of(state.run.coins, 0))) + ' монет'];
    if (rank(state) > 1) parts.push(rankName(rank(state)));
    if (state.run.game && state.run.game.mode !== 'challenge') parts.push('партия: ' + Fmt.num(state.run.game.score));
    return { line: parts.join(' · ') };
  }

  /** When the workshop makes its next tool (the notification «Мастерская сделала инструмент»). */
  function next(state, now, cfg) {
    var interval = workshopInterval(state, cfg);
    if (!interval || supplyCount(state) >= cfg['up.workshop.cap']) return [];
    var sec = interval - (Number(state.run.ws) || 0);
    if (!(sec > 0) || sec > 86400) return [];
    var tool = WORKSHOP[(Number(state.run.wsAt) || 0) % WORKSHOP.length];
    return [{ id: 'workshop', at: now + Math.ceil(sec) * 1000, text: 'Мастерская сделала: ' + TOOL_FORMS[tool][0] }];
  }

  /** The chest of «Пассажир»: chest.tools random one-time tools. */
  function chest(state, rng, cfg) {
    var sup = mine(state).supply;
    var got = {};
    for (var i = 0; i < cfg['chest.tools']; i++) {
      var t = rng.pick(TOOLS);
      sup[t] = (Number(sup[t]) || 0) + 1;
      got[t] = (got[t] || 0) + 1;
    }
    var items = [];
    TOOLS.forEach(function (t) { if (got[t]) items.push({ title: TOOL_TITLES[t], amount: got[t] }); });
    return { title: 'Сундук мастера: разовые инструменты', items: items };
  }

  var NAME_A = ['Тихий', 'Узкий', 'Северный', 'Каменный', 'Ровный', 'Старый', 'Кривой', 'Дальний', 'Седой', 'Пустой'];
  var NAME_B = ['двор', 'переулок', 'склад', 'мост', 'причал', 'чердак', 'квартал', 'тупик', 'зал', 'сад'];
  var NAME_C = ['Всё сгорит, если не спешить', 'Каждая клетка на счету', 'Порядок важнее скорости', 'Сначала угол, потом середина',
    'Одна ошибка — и заново', 'Тесно, но выход есть', 'Линии ждут своей очереди', 'Ровно столько, сколько нужно'];

  /** A name of a challenge made without the model. */
  function procedural(kind, rng) {
    return { title: rng.pick(NAME_A) + ' ' + rng.pick(NAME_B), text: rng.pick(NAME_C), procedural: true };
  }

  function validateStock(kind, item) {
    if (/https?:/.test((item.title || '') + (item.text || ''))) return 'ссылка в тексте';
    return null;
  }

  return {
    init: init, tick: tick, offline: offline, prestigeGain: prestigeGain, bonus: bonus, onPrestige: onPrestige,
    migrate: migrate, validate: validate, summary: summary, next: next, chest: chest,
    procedural: procedural, validateStock: validateStock,
    // the game
    LAYER: LAYER, UPGRADES: UPGRADES, TOOLS: TOOLS, TOOL_TITLES: TOOL_TITLES, TOOL_FORMS: TOOL_FORMS, RANKS: RANKS, WORKSHOP: WORKSHOP,
    mine: mine, level: level, mastery: mastery, rank: rank, rankName: rankName, modeOpen: modeOpen, has: has,
    price: price, canBuy: canBuy, buyUpgrade: buyUpgrade, buySupply: buySupply, buy: buy, coinMult: coinMult, streakMult: streakMult, streakStep: streakStep,
    newGame: newGame, place: place, hold: hold, useTool: useTool, toolLeft: toolLeft, isStuck: isStuck, settle: settle,
    endGame: endGame, coinsFor: coinsFor, back: back, winChallenge: winChallenge, challengesDone: challengesDone, challengeOpen: challengeOpen,
    picksFree: picksFree, pick: pick, workshopInterval: workshopInterval, supplyCount: supplyCount, madeText: madeText
  };
});
