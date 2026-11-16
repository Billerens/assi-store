// The logic of «Пасьянс-рогалик»: the chain solitaire, the run of three circles, the shop, the
// workshop, the nights. Shared subset of JavaScript: it runs on the screen (window.GameSim), in
// the engine (Rhino, require) and in node. No class, no async, no f(...args), no for (let …);
// randomness only from the run's own generator (run.rs) or the rng given.
//
// The lists (relics, seals, curses, hosts, decks, upgrades, nights, rule bricks) are data in
// content/*.json: node and Rhino require them here, the screen fetches them and calls
// setContent before Game.start. Every number is a setting of config.json (cfg).
(function (root, make) {
  var node = typeof require === 'function' && typeof exports !== 'undefined';
  var api = node ? make(require('../engine/big.js'), require('../engine/rng.js')) : make(root.Big, root.Rng);
  if (node) {
    api.setContent({
      relics: require('./content/relics.json'), seals: require('./content/seals.json'), curses: require('./content/curses.json'),
      hosts: require('./content/hosts.json'), decks: require('./content/decks.json'), upgrades: require('./content/upgrades.json'),
      nights: require('./content/nights.json'), circles: require('./content/circles.json'), bricks: require('./content/bricks.json')
    });
    api.setDefaults(require('./config.json'));
  }
  if (typeof exports !== 'undefined') { for (var k in api) exports[k] = api[k]; } else { root.GameSim = api; }
})(this, function (Big, Rng) {
  'use strict';

  var LAYER = 'night';
  var GAME = 'solitaire-rogue';
  var KINDS = ['relics', 'seals', 'curses', 'hosts', 'decks', 'upgrades', 'bricks'];
  var C = null;
  var IDX = {};

  function setContent(c) {
    C = c || {};
    IDX = {};
    KINDS.forEach(function (k) {
      IDX[k] = {};
      (C[k] || []).forEach(function (x) { IDX[k][x.id] = x; });
    });
    return true;
  }

  function need() {
    if (!C) throw new Error('Пасьянс-рогалик: нет контента (setContent)');
    return C;
  }

  function info(kind, id) {
    need();
    return (IDX[kind] && IDX[kind][id]) || null;
  }

  // ---- small helpers ----------------------------------------------------------------------------

  function n(v, d) {
    var x = Number(v);
    return x === x && x !== Infinity && x !== -Infinity ? x : (d || 0);
  }

  function waxOf(meta) { return Math.floor(Big.toNumber(Big.of(meta && meta.wax !== undefined ? meta.wax : 0, 0))); }

  function nightsOf(state) {
    var l = state.layers && state.layers[LAYER];
    return Math.floor(Big.toNumber(Big.of(l ? l.currency : 0, 0)));
  }

  function clone(x) { return JSON.parse(JSON.stringify(x)); }

  function has(run, id) { return !!run && !!run.relics && run.relics.indexOf(id) >= 0; }

  function no(why) { return { ok: false, deny: true, why: why || '' }; }

  function rankName(r) {
    if (r === 1) return 'Т';
    if (r === 11) return 'В';
    if (r === 12) return 'Д';
    if (r === 13) return 'К';
    return String(r);
  }

  // ---- decks ------------------------------------------------------------------------------------

  var R13 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
  var DECK_DEF = {
    normal: { ranks: R13, suits: [0, 1, 2, 3], copies: 1, wrap: false },
    short: { ranks: [6, 7, 8, 9, 10, 11, 12, 13, 1], suits: [0, 1, 2, 3], copies: 1, wrap: false },
    lunar: { ranks: R13, suits: [0, 1, 2, 3], copies: 1, wrap: true },
    twosuit: { ranks: R13, suits: [0, 1], copies: 2, wrap: false },
    widow: { ranks: R13, suits: [0, 1, 2, 3], copies: 1, wrap: false }
  };
  var DECK_IDS = ['normal', 'short', 'lunar', 'twosuit', 'widow'];
  var NO_WIDOW = ['undo', 'sandundo', 'joker', 'jokers2'];
  var TABLE_CURSE = { stone: 1, thorn: 1, shadow: 1, lock: 1, weed: 1 };
  var POWERS = ['shuffle', 'turncoat', 'reverse'];
  var UPGRADES = ['wick', 'joker', 'glance', 'coins', 'wideshop', 'discount', 'startrelic'];

  function deckDef(run) { return DECK_DEF[run && run.deck] || DECK_DEF.normal; }

  function mk(run, r, s, extra) {
    var c = { i: run.nextId++, r: r, s: s };
    for (var k in extra || {}) c[k] = extra[k];
    return c;
  }

  function buildCards(run) {
    var def = deckDef(run);
    var out = [];
    for (var copy = 0; copy < def.copies; copy++) {
      for (var a = 0; a < def.suits.length; a++) {
        for (var b = 0; b < def.ranks.length; b++) out.push(mk(run, def.ranks[b], def.suits[a]));
      }
    }
    return out;
  }

  function addJokers(run, count) {
    for (var i = 0; i < count; i++) run.cards.push(mk(run, 0, -1, { j: 1 }));
  }

  function cursePool(circle) {
    return need().curses.filter(function (c) { return (c.from || 0) <= circle; }).map(function (c) { return c.id; });
  }

  function addCurse(run, r, circle, type) {
    var def = deckDef(run);
    var id = type || r.pick(cursePool(circle));
    var c = id === 'stone' || id === 'dud' ? mk(run, 0, -1, { c: id }) : mk(run, r.pick(def.ranks), r.pick(def.suits), { c: id });
    run.cards.push(c);
    return c;
  }

  // ---- rules of a deal (mods) -------------------------------------------------------------------

  function posMap(order) {
    var p = {};
    for (var i = 0; i < order.length; i++) p[order[i]] = i;
    return p;
  }

  function applyBrick(m, item) {
    var k = Number(item.n) || 0;
    switch (item.brick) {
      case 'deck.cut': m.cut += k; break;
      case 'see.blind': m.blind = true; break;
      case 'move.alternate': m.alt = true; break;
      case 'cols.swap': m.clock = k; break;
      case 'aces.guard': m.guard = k; break;
      case 'candles.leftover': m.leftover = Math.max(m.leftover, k); break;
      case 'gold.half': m.goldMult *= 0.5; break;
      case 'match.wrap': m.wrap = true; break;
      case 'match.step2': m.step2 = true; break;
      case 'match.parity': m.parity = true; break;
      case 'match.suit': m.sameSuit = true; break;
      case 'gold.perCard': m.goldPlus += k; break;
      case 'candles.clear': m.clearPlus += k; break;
      case 'see.deck': m.see = Math.max(m.see, k); break;
      default: break;
    }
  }

  function customOf(run, id) {
    var list = (run && run.custom) || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  function mods(run, cfg, hosts, hx) {
    var def = deckDef(run);
    var night = run.night || 0;
    var m = {
      order: def.ranks.slice(), pos: posMap(def.ranks), suits: def.suits.slice(),
      wrap: def.wrap || has(run, 'moon'), aces: has(run, 'aces'), step2: has(run, 'double'), parity: has(run, 'parity'), sameSuit: false,
      suitMult: has(run, 'suit') ? cfg['relic.suit.mult'] : 1, goldMult: 1, goldPlus: 0,
      leftover: cfg['candles.leftover'], clear: night >= 8 ? 0 : cfg['candles.clear'], clearPlus: 0,
      cut: night >= 6 ? cfg['night.deckCut'] : 0,
      see: has(run, 'clair') ? 99 : has(run, 'peek') ? 1 : 0,
      blind: false, alt: false, clock: 0, guard: 0, hosts: (hosts || []).slice(), hx: hx ? hx.id : null
    };
    (hosts || []).forEach(function (h) {
      if (h === 'miser') m.cut += cfg['host.miser.cards'];
      else if (h === 'blind') m.blind = true;
      else if (h === 'mirror') m.alt = true;
      else if (h === 'clock') m.clock = cfg['host.clock.every'];
      else if (h === 'guard') m.guard = cfg['host.guard.kings'];
      else if (h === 'lender') {
        m.leftover = Math.max(m.leftover, cfg['host.lender.cost']);
        m.clear = cfg['host.lender.clear'];
      }
    });
    (run.relics || []).forEach(function (id) {
      var x = customOf(run, id);
      if (x && x.kind === 'relic') applyBrick(m, x);
    });
    if (hx) applyBrick(m, hx);
    return m;
  }

  // ---- matching ---------------------------------------------------------------------------------

  var NO = { ok: 0, dir: 0 };

  function vals(card) { return card.r2 ? [card.r, card.r2] : [card.r]; }

  /** Does `card` fit on `top` by value under the rules m: {ok: 0 | 1 (chain grows) | 2 (a double step), dir}. */
  function match(top, card, m) {
    if (!top || !card || card.c === 'stone') return NO;
    if (top.j || card.j) return { ok: 1, dir: 0 };
    if (m.aces && (top.r === 1 || card.r === 1)) return { ok: 1, dir: 0 };
    var L = m.order.length;
    var step = null;
    var loose = false;
    var tv = vals(top);
    var cv = vals(card);
    for (var a = 0; a < tv.length; a++) {
      for (var b = 0; b < cv.length; b++) {
        var pa = m.pos[tv[a]];
        var pb = m.pos[cv[b]];
        if (pa === undefined || pb === undefined) continue;
        var d = pb - pa;
        var ad = Math.abs(d);
        if (ad === 1) return { ok: 1, dir: d > 0 ? 1 : -1 };
        if (m.wrap && ad === L - 1) return { ok: 1, dir: d > 0 ? -1 : 1 };
        if (m.step2 && ad === 2) step = { ok: 2, dir: d > 0 ? 1 : -1 };
        else if (m.step2 && m.wrap && ad === L - 2) step = { ok: 2, dir: d > 0 ? -1 : 1 };
        if (m.parity && tv[a] % 2 === cv[b] % 2) loose = true;
      }
    }
    if (m.sameSuit && top.s >= 0 && top.s === card.s) loose = true;
    if (loose) return { ok: 1, dir: 0 };
    return step || NO;
  }

  function topOf(d) { return d.pile[d.pile.length - 1] || null; }

  function hiddenShadow(d, card, cfg) { return card.c === 'shadow' && d.chain < cfg['curse.shadow.chain']; }

  /** May `card` go on the pile now (the deal's state: locks, the guard of aces, the mirror). */
  function legal(d, card, cfg, fromPocket) {
    if (!card || (!fromPocket && !card.u)) return NO;
    if (card.c === 'lock' && !card.unl && d.chain < cfg['curse.lock.chain']) return NO;
    if (d.m.guard && card.r === 1 && !card.j && d.kings < d.m.guard) return NO;
    var mt = match(topOf(d), card, d.m);
    if (!mt.ok) return NO;
    if (d.m.alt && d.dir && mt.dir && mt.dir === d.dir) return NO;
    return mt;
  }

  // ---- the solver: can the table be cleared with perfect play --------------------------------------

  /**
   * Depth-first search with memory over (column heights, cards drawn, pile top, and the bits of
   * state the rules need). `budget` — nodes; {ok: true | false | null (the budget ran out), nodes}.
   * Stones leave when a neighbouring column is empty; locks need the chain; the guard of aces
   * counts kings; the mirror keeps the direction. Weeds, the clock and the blind are ignored
   * (they do not change what perfect play can clear, or only a little). Under the plain rules a
   * position is dead when a card of the table has no neighbour by value left anywhere.
   */
  function solve(cols, deck, top, m, cfg, budget) {
    var nc = cols.length;
    var h = cols.map(function (c) { return c.length; });
    var memo = {};
    var nodes = 0;
    var limit = budget || 20000;
    var lockChain = 0;
    var useKings = !!m.guard;
    var useDir = !!m.alt;
    var over = false;
    var plain = !m.aces && !m.step2 && !m.parity && !m.sameSuit;
    var L = m.order.length;
    var cnt = [];
    var ids = {};
    var nid = 0;
    var hb = 1;
    for (var z = 0; z < L; z++) cnt.push(0);
    function note(c, k) {
      if (c.j || c.r2) {
        plain = false;
        return;
      }
      var p = c.c === 'stone' ? undefined : m.pos[c.r];
      if (p !== undefined) cnt[p] += k;
    }
    function own(c) {
      if (ids[c.i] === undefined) {
        ids[c.i] = nid++;
        note(c, 1);
      }
    }
    cols.forEach(function (c) {
      if (c.length + 1 > hb) hb = c.length + 1;
      c.forEach(function (x) {
        own(x);
        if (x.c === 'lock' && !x.unl) lockChain = cfg['curse.lock.chain'];
      });
    });
    deck.forEach(own);
    own(top);
    var db = deck.length + 1;

    function fitsHere(t, card, kings, dir, chain) {
      if (card.c === 'lock' && !card.unl && chain < lockChain) return NO;
      if (useKings && card.r === 1 && !card.j && kings < m.guard) return NO;
      var mt = match(t, card, m);
      if (!mt.ok) return NO;
      if (useDir && dir && mt.dir && mt.dir === dir) return NO;
      return mt;
    }

    function near(p, d) {
      var q = p + d;
      if (q < 0 || q >= L) {
        if (!m.wrap) return 0;
        q = (q + L) % L;
      }
      return cnt[q];
    }

    function dead() {
      for (var s = 0; s < nc; s++) {
        for (var i = 0; i < h[s]; i++) {
          var x = cols[s][i];
          if (x.c === 'stone') continue;
          var p = m.pos[x.r];
          if (p !== undefined && near(p, -1) + near(p, 1) === 0) return true;
        }
      }
      return false;
    }

    function rec(dp, t, kings, dir, chain) {
      if (++nodes > limit) {
        over = true;
        return false;
      }
      var removed = [];
      var moved = true;
      while (moved) {
        moved = false;
        for (var s = 0; s < nc; s++) {
          if (h[s] > 0 && cols[s][h[s] - 1].c === 'stone' && ((s > 0 && h[s - 1] === 0) || (s < nc - 1 && h[s + 1] === 0))) {
            h[s]--;
            removed.push(s);
            moved = true;
          }
        }
      }
      var left = 0;
      var code = 0;
      for (var q = 0; q < nc; q++) {
        left += h[q];
        code = code * hb + h[q];
      }
      var result = false;
      if (left === 0) result = true;
      else if (!(plain && dead())) {
        var key = (code * db + dp) * nid + ids[t.i];
        if (useKings || useDir || lockChain) key = key + '/' + (useKings ? Math.min(kings, m.guard) : '') + '/' + (useDir ? dir : '') + '/' + (lockChain ? Math.min(chain, lockChain) : '');
        if (!memo[key]) {
          memo[key] = 1;
          // Moves that leave a next move first (the chain goes on), then the tallest columns.
          var order = [];
          var score = {};
          for (var c = 0; c < nc; c++) {
            if (h[c] <= 0) continue;
            var x = cols[c][h[c] - 1];
            var mx = fitsHere(t, x, kings, dir, chain);
            if (!mx.ok) continue;
            var follow = 0;
            for (var e = 0; e < nc; e++) {
              var y = e === c ? (h[c] > 1 ? cols[c][h[c] - 2] : null) : (h[e] > 0 ? cols[e][h[e] - 1] : null);
              if (y && match(x, y, m).ok) follow++;
            }
            score[c] = (follow ? 100 : 0) + h[c] * 2 + follow;
            order.push(c);
          }
          order.sort(function (a2, b2) { return score[b2] - score[a2]; });
          for (var o = 0; o < order.length && !result && !over; o++) {
            var col = order[o];
            var card = cols[col][h[col] - 1];
            var mt = fitsHere(t, card, kings, dir, chain);
            h[col]--;
            note(t, -1);
            result = rec(dp, card, kings + (card.r === 13 && !card.j ? 1 : 0), mt.dir, mt.ok === 1 ? chain + 1 : chain);
            note(t, 1);
            h[col]++;
          }
          if (!result && !over && dp < deck.length) {
            var next = deck[deck.length - 1 - dp];
            note(t, -1);
            result = rec(dp + 1, next, kings + (next.r === 13 && !next.j ? 1 : 0), 0, 0);
            note(t, 1);
          }
        }
      }
      for (var k = removed.length - 1; k >= 0; k--) h[removed[k]]++;
      return result;
    }

    var ok = rec(0, top, top.r === 13 && !top.j ? 1 : 0, 0, 0);
    return { ok: ok ? true : over ? null : false, nodes: nodes };
  }

  // ---- the layout of a deal ---------------------------------------------------------------------

  function perCircle(run, cfg) { return run.deck === 'short' ? cfg['deck.short.deals'] : cfg['deals.perCircle']; }

  function mainDeals(run, cfg) { return 3 * perCircle(run, cfg); }

  function circleOf(run, cfg) {
    if (run.mode === 'daily') return 0;
    if (run.whiteOn) return 3;
    return Math.min(2, Math.floor(run.dealNo / perCircle(run, cfg)));
  }

  function tableSize(run, cfg, circle) {
    if (run.mode === 'daily') return { cols: cfg['daily.cols'], rows: cfg['daily.rows'] };
    var k = Math.min(3, circle + 1);
    var size = { cols: cfg['tableau.cols.' + k], rows: cfg['tableau.rows.' + k] };
    if (run.deck === 'short') size.rows = Math.min(size.rows, cfg['deck.short.rows']);
    return size;
  }

  function layout(run, cfg, r, m, size) {
    var cards = run.cards.map(clone);
    r.shuffle(cards);
    var slots = size.cols * size.rows;
    var curses = [];
    var plain = [];
    var duds = [];
    cards.forEach(function (c) {
      if (c.c && TABLE_CURSE[c.c]) curses.push(c);
      else if (c.c === 'dud') duds.push(c);
      else plain.push(c);
    });
    var tab = curses.slice(0, Math.min(curses.length, Math.max(0, slots - 1)));
    while (tab.length < slots && plain.length > 1) tab.push(plain.shift());
    r.shuffle(tab);
    var deck = plain.concat(duds);
    r.shuffle(deck);
    if (has(run, 'memory')) deck = deck.filter(function (c) { return c.j || c.r !== 13 || c.c; });
    var cut = Math.min(m.cut, Math.max(0, deck.length - 2));
    if (cut > 0) deck.splice(0, cut);
    deck.forEach(function (c) {
      if (c.c === 'dud') {
        c.r = r.pick(m.order);
        c.s = r.pick(m.suits);
      }
    });
    var pile = [deck.pop()];
    pile[0].u = 1;
    var cols = [];
    for (var c = 0; c < size.cols; c++) {
      var col = tab.slice(c * size.rows, (c + 1) * size.rows);
      col.forEach(function (x, i) {
        x.u = i === col.length - 1 || (has(run, 'third') && i % 3 === 2) ? 1 : 0;
      });
      cols.push(col);
    }
    return { cols: cols, deck: deck, pile: pile };
  }

  function pickHost(run, r) {
    var all = need().hosts.map(function (h) { return h.id; });
    var fresh = all.filter(function (id) { return (run.hostsUsed || []).indexOf(id) < 0; });
    var id = r.pick(fresh.length ? fresh : all);
    run.hostsUsed = (run.hostsUsed || []).concat([id]);
    return id;
  }

  function isHostDeal(run, cfg) {
    if (run.mode === 'daily') return !!(run.dailyRule && run.dailyRule.kind === 'host');
    if (run.whiteOn) return (run.white + 1) % cfg['whiteNight.hostEvery'] === 0;
    var dpc = perCircle(run, cfg);
    var pos = run.dealNo % dpc;
    return pos === dpc - 1 || ((run.night || 0) >= 3 && pos === dpc - 2);
  }

  function startDeal(state, cfg) {
    var run = state.run;
    var r = Rng.make(run.rs);
    var circle = circleOf(run, cfg);
    var dpc = perCircle(run, cfg);
    if (run.mode === 'run') {
      if (!run.whiteOn && run.dealNo % dpc === 0 && run.cursedCircle !== circle) {
        run.cursedCircle = circle;
        var count = cfg['curses.c' + (circle + 1)] + ((run.night || 0) >= 5 ? cfg['night.curses'] : 0);
        for (var i = 0; i < count; i++) addCurse(run, r, circle);
      }
      if (run.whiteOn && run.white > 0 && run.white % cfg['whiteNight.curseEvery'] === 0 && run.cursedWhite !== run.white) {
        run.cursedWhite = run.white;
        addCurse(run, r, 2);
      }
    }
    var hosts = [];
    var hx = null;
    if (isHostDeal(run, cfg)) {
      if (run.mode === 'daily') hx = run.dailyRule;
      else {
        var custom = (run.custom || []).filter(function (x) { return x.kind === 'host' && !x.used; });
        if (custom.length && r.chance(cfg['stock.ruleChance'])) {
          hx = custom[0];
          hx.used = true;
        } else hosts.push(pickHost(run, r));
        if ((run.night || 0) >= 7) {
          var second = pickHost(run, r);
          if (hosts.indexOf(second) < 0) hosts.push(second);
        }
      }
    } else if (run.mode === 'daily' && run.dailyRule && run.dailyRule.kind === 'relic') {
      hx = run.dailyRule;
    }
    var m = mods(run, cfg, hosts, hx);
    var size = tableSize(run, cfg, circle);
    var allowBad = run.mode === 'run' && circle >= 1 && r.chance(cfg['solver.unsolvableShare']);
    var made = null;
    var verdict = null;
    var tries = Math.max(1, cfg['solver.tries']);
    var nodes = 0;
    for (var t = 0; t < tries; t++) {
      made = layout(run, cfg, r, m, size);
      var s = solve(made.cols, made.deck, made.pile[0], m, cfg, cfg['solver.nodes']);
      verdict = s.ok;
      nodes += s.nodes;
      if (allowBad || verdict === true) break;
    }
    var undos = (has(run, 'undo') ? cfg['relic.undo.n'] : 0) + (has(run, 'sandundo') ? cfg['relic.sandundo.n'] : 0);
    if (run.deck === 'widow') undos = 0;
    var slots = (has(run, 'pocket') ? 1 : 0) + (has(run, 'pocket2') ? 1 : 0);
    var d = {
      n: run.mode === 'daily' ? 0 : run.whiteOn ? mainDeals(run, cfg) + run.white : run.dealNo, circle: circle,
      pos: run.whiteOn ? run.white : run.dealNo % dpc, hosts: hosts, hx: hx ? { id: hx.id, title: hx.title, text: hx.text, kind: hx.kind, brick: hx.brick, n: hx.n, procedural: !!hx.procedural } : null,
      m: m, cols: made.cols, deck: made.deck, pile: made.pile,
      chain: 0, best: 0, moves: 0, played: 0, gold: 0, kings: made.pile[0].r === 13 ? 1 : 0, dir: 0,
      wickUsed: false, holderUsed: false, glance: !!(state.meta.shop && state.meta.shop.glance), used: { shuffle: 0, turncoat: 0, reverse: 0 },
      undos: undos, undoUsed: 0, hist: [], pocket: [], echoLeft: 0, waxUsed: {}, sinceWeed: 0, sinceClock: 0,
      bonus: 0, cleared: 0, reshuffles: 0, solvable: verdict, allowBad: allowBad, tries: t + 1, nodes: nodes, over: false, lost: 0
    };
    for (var p = 0; p < slots; p++) d.pocket.push(null);
    if (m.blind) {
      var bottoms = [];
      d.cols.forEach(function (col) { if (col.length) bottoms.push(col[col.length - 1]); });
      var keep = r.int(0, Math.max(0, bottoms.length - 1));
      bottoms.forEach(function (b, k) {
        if (k !== keep) {
          b.u = 0;
          b.bh = 1;
        }
      });
    }
    run.deal = d;
    run.shop = null;
    run.phase = 'play';
    run.rs = r.state();
    return d;
  }

  // ---- table helpers ----------------------------------------------------------------------------

  function tableCount(d) {
    var k = 0;
    d.cols.forEach(function (c) { k += c.length; });
    return k;
  }

  function pocketCount(d) {
    var k = 0;
    d.pocket.forEach(function (c) { if (c) k++; });
    return k;
  }

  function bottomOf(d, col) {
    var c = d.cols[col];
    return c && c.length ? c[c.length - 1] : null;
  }

  function revealBottoms(d) {
    d.cols.forEach(function (col) {
      var b = col[col.length - 1];
      if (b && !b.bh) b.u = 1;
    });
  }

  function removeStones(d) {
    var moved = true;
    var removed = 0;
    while (moved) {
      moved = false;
      for (var s = 0; s < d.cols.length; s++) {
        var b = bottomOf(d, s);
        if (b && b.c === 'stone' && ((s > 0 && !d.cols[s - 1].length) || (s < d.cols.length - 1 && !d.cols[s + 1].length))) {
          d.cols[s].pop();
          removed++;
          moved = true;
        }
      }
    }
    return removed;
  }

  function openColumn(d) {
    var best = -1;
    var most = 0;
    d.cols.forEach(function (col, i) {
      var closed = 0;
      col.forEach(function (c) { if (!c.u || (c.c === 'lock' && !c.unl)) closed++; });
      if (closed > most) {
        most = closed;
        best = i;
      }
    });
    if (best < 0) return -1;
    d.cols[best].forEach(function (c) {
      c.u = 1;
      delete c.bh;
      if (c.c === 'lock') c.unl = 1;
    });
    return best;
  }

  function sparksBetween(a, b, cfg) {
    var first = cfg['spark.chain'];
    var every = Math.max(1, cfg['spark.every']);
    var k = 0;
    for (var t = first; t <= b; t += every) if (t > a) k++;
    return k;
  }

  function gainCandle(run, cfg, k) {
    if (k <= 0) return 0;
    var before = run.candles;
    run.candles = Math.min(cfg['candles.max'], run.candles + k);
    return run.candles - before;
  }

  /** Candles go out one by one; the holder saves the first of the deal, the eternal candle all while the table is small. */
  function loseCandle(run, cfg, k) {
    var d = run.deal;
    var lost = 0;
    for (var i = 0; i < k; i++) {
      if (d && has(run, 'eternal') && tableCount(d) + pocketCount(d) <= cfg['relic.eternal.cards']) continue;
      if (d && has(run, 'holder') && !d.holderUsed) {
        d.holderUsed = true;
        continue;
      }
      if (run.candles > 0) {
        run.candles--;
        lost++;
      }
    }
    if (d) d.lost += lost;
    return lost;
  }

  function logChain(run, d) {
    if (d.chain >= 3) {
      run.log.push({ deal: d.n, chain: d.chain });
      if (run.log.length > 12) run.log = run.log.slice(-12);
    }
  }

  // ---- history for the undo ---------------------------------------------------------------------

  function snapshot(run) {
    var d = run.deal;
    var hist = d.hist;
    d.hist = null;
    var text = JSON.stringify({ deal: d, gold: run.gold, candles: run.candles, sparks: run.sparks, rs: run.rs, cards: run.cards, stats: run.stats, log: run.log, nextId: run.nextId });
    d.hist = hist;
    return text;
  }

  function pushHist(run) {
    var d = run.deal;
    if (d.undos <= 0) return;
    d.hist.push(snapshot(run));
    if (d.hist.length > d.undos) d.hist.shift();
  }

  // ---- moves ------------------------------------------------------------------------------------

  function inPlay(state) {
    var run = state.run;
    return run && run.phase === 'play' && run.deal && !run.deal.over;
  }

  function playCard(state, cfg, card, remove, fromPocket) {
    var run = state.run;
    var d = run.deal;
    var lg = legal(d, card, cfg, fromPocket);
    if (!lg.ok) {
      var res = no('Не подходит');
      if (!fromPocket && card.c === 'shadow' && hiddenShadow(d, card, cfg) && cfg['curse.shadow.missBreaks'] && d.chain > 0) {
        logChain(run, d);
        d.chain = 0;
        res.broke = true;
      }
      return res;
    }
    var r = Rng.make(run.rs);
    pushHist(run);
    var top = topOf(d);
    remove();
    card.u = 1;
    delete card.bh;
    if (d.echoLeft > 0 && d.pile.length) {
      d.pile.splice(d.pile.length - 1, 0, card);
      d.echoLeft = 0;
    } else d.pile.push(card);
    var before = d.chain;
    if (lg.ok === 1) d.chain++;
    if (card.se === 'glass') d.chain += cfg['seal.glass.chain'];
    d.dir = lg.dir;
    if (card.r === 13 && !card.j) d.kings++;
    var gold = cfg['gold.perCard'] + Math.floor(d.chain / Math.max(1, cfg['gold.chainStep']));
    if (d.m.suitMult > 1 && top && top.s >= 0 && card.s === top.s) gold *= d.m.suitMult;
    gold = Math.floor(gold * d.m.goldMult) + d.m.goldPlus;
    if (card.se === 'gold') gold += cfg['seal.gold'];
    run.gold += gold;
    d.gold += gold;
    run.stats.gold += gold;
    var ev = { ok: true, gold: gold, chain: d.chain, step: lg.ok, card: card };
    var sp = sparksBetween(before, d.chain, cfg);
    if (sp) {
      run.sparks += sp;
      ev.sparks = sp;
    }
    if (has(run, 'ember') && before < cfg['relic.ember.chain'] && d.chain >= cfg['relic.ember.chain']) ev.ember = gainCandle(run, cfg, 1);
    if (card.c === 'thorn') ev.thorn = loseCandle(run, cfg, 1);
    if (card.se === 'wax' && !d.waxUsed[card.i]) {
      d.waxUsed[card.i] = 1;
      ev.wax = gainCandle(run, cfg, 1);
    }
    if (card.se === 'key') ev.key = openColumn(d);
    if (card.se === 'echo') d.echoLeft = 1;
    if (card.se === 'glass') {
      run.cards = run.cards.filter(function (x) { return x.i !== card.i; });
      ev.glass = true;
    }
    d.played++;
    run.stats.played++;
    if (d.chain > d.best) d.best = d.chain;
    if (d.chain > run.stats.bestChain) run.stats.bestChain = d.chain;
    after(state, cfg, r, true, ev);
    run.rs = r.state();
    return ev;
  }

  /** Plays the open card of a column onto the pile. */
  function play(state, cfg, col) {
    if (!inPlay(state)) return no('Сейчас не расклад');
    var d = state.run.deal;
    var colArr = d.cols[col];
    if (!colArr || !colArr.length) return no('Пустой столбец');
    var card = colArr[colArr.length - 1];
    if (!card.u) return no('Карта закрыта');
    return playCard(state, cfg, card, function () { colArr.pop(); }, false);
  }

  /** A card from the deck onto the pile: the chain breaks (the long wick saves it once a deal). */
  function draw(state, cfg) {
    if (!inPlay(state)) return no('Сейчас не расклад');
    var run = state.run;
    var d = run.deal;
    var r = Rng.make(run.rs);
    var ev = { ok: true, drew: true };
    if (!d.deck.length) {
      if (!has(run, 'bottomless') || d.pile.length < 2) return no('Колода пуста');
      pushHist(run);
      var back = d.pile.splice(0, d.pile.length - 1);
      back.forEach(function (c) { if (c.c === 'dud') { c.r = r.pick(d.m.order); c.s = r.pick(d.m.suits); } });
      r.shuffle(back);
      d.deck = back;
      d.reshuffles++;
      ev.reshuffle = true;
      ev.lost = loseCandle(run, cfg, 1);
    } else pushHist(run);
    var c = d.deck.pop();
    c.u = 1;
    d.pile.push(c);
    d.glance = false;
    d.echoLeft = 0;
    d.dir = 0;
    if (c.r === 13 && !c.j && c.c !== 'dud') d.kings++;
    var keep = has(run, 'wick') && !d.wickUsed && c.c !== 'dud';
    if (keep && d.chain > 0) {
      d.wickUsed = true;
      ev.wick = true;
    } else {
      logChain(run, d);
      if (d.chain > 0) ev.broke = true;
      d.chain = 0;
    }
    if (c.c === 'dud') ev.dud = true;
    after(state, cfg, r, true, ev);
    run.rs = r.state();
    return ev;
  }

  function freeSlot(d) {
    for (var i = 0; i < d.pocket.length; i++) if (!d.pocket[i]) return i;
    return -1;
  }

  /** The open card of a column into the pocket (Карман). */
  function pocketPut(state, cfg, col) {
    if (!inPlay(state)) return no('Сейчас не расклад');
    var run = state.run;
    var d = run.deal;
    var slot = freeSlot(d);
    if (slot < 0) return no('Карман занят');
    var b = bottomOf(d, col);
    if (!b || !b.u || b.c === 'stone' || (b.c === 'lock' && !b.unl)) return no('Эту карту не отложить');
    var r = Rng.make(run.rs);
    pushHist(run);
    d.cols[col].pop();
    d.pocket[slot] = b;
    var ev = { ok: true, pocket: slot };
    after(state, cfg, r, true, ev);
    run.rs = r.state();
    return ev;
  }

  function pocketPlay(state, cfg, slot) {
    if (!inPlay(state)) return no('Сейчас не расклад');
    var d = state.run.deal;
    var card = d.pocket[slot];
    if (!card) return no('Карман пуст');
    return playCard(state, cfg, card, function () { d.pocket[slot] = null; }, true);
  }

  function undo(state, cfg) {
    if (!inPlay(state)) return no('Сейчас не расклад');
    var run = state.run;
    var d = run.deal;
    if (d.undos <= 0 || !d.hist.length) return no('Отмен не осталось');
    var snap = JSON.parse(d.hist.pop());
    var hist = d.hist;
    var undos = d.undos - 1;
    var used = d.undoUsed + 1;
    run.deal = snap.deal;
    run.deal.hist = hist;
    run.deal.undos = undos;
    run.deal.undoUsed = used;
    run.gold = snap.gold;
    run.candles = snap.candles;
    run.sparks = snap.sparks;
    run.rs = snap.rs;
    run.cards = snap.cards;
    run.stats = snap.stats;
    run.log = snap.log;
    run.nextId = snap.nextId;
    run.undosUsed = (run.undosUsed || 0) + 1;
    return { ok: true, undo: true };
  }

  function openBottoms(d) {
    var out = [];
    d.cols.forEach(function (col, i) {
      var b = col[col.length - 1];
      if (b && b.u && b.c !== 'stone' && !(b.c === 'lock' && !b.unl)) out.push(i);
    });
    return out;
  }

  function powerOwned(run, p) { return has(run, p); }

  function powerReady(run, p) { return powerOwned(run, p) && run.deal && !run.deal.used[p]; }

  /** Перетасовка: the open cards of the table change columns. */
  function shuffle(state, cfg) {
    if (!inPlay(state)) return no('Сейчас не расклад');
    var run = state.run;
    var d = run.deal;
    if (!powerReady(run, 'shuffle')) return no('Перетасовки нет');
    var idx = openBottoms(d);
    if (idx.length < 2) return no('Нечего перемешивать');
    var r = Rng.make(run.rs);
    pushHist(run);
    var cards = idx.map(function (i) { return d.cols[i].pop(); });
    var order = cards.slice();
    for (var t = 0; t < 6; t++) {
      r.shuffle(order);
      var same = true;
      for (var k = 0; k < order.length; k++) if (order[k] !== cards[k]) same = false;
      if (!same) break;
    }
    idx.forEach(function (col, k) { d.cols[col].push(order[k]); });
    d.used.shuffle = 1;
    var ev = { ok: true, shuffle: true };
    after(state, cfg, r, false, ev);
    run.rs = r.state();
    return ev;
  }

  /** Перевёртыш: the top of the pile and an open card of the table change places. */
  function turncoat(state, cfg, col) {
    if (!inPlay(state)) return no('Сейчас не расклад');
    var run = state.run;
    var d = run.deal;
    if (!powerReady(run, 'turncoat')) return no('Перевёртыша нет');
    if (openBottoms(d).indexOf(col) < 0) return no('Эту карту не поменять');
    var r = Rng.make(run.rs);
    pushHist(run);
    var b = d.cols[col].pop();
    var t = d.pile.pop();
    t.u = 1;
    d.cols[col].push(t);
    d.pile.push(b);
    d.used.turncoat = 1;
    d.echoLeft = 0;
    d.dir = 0;
    var ev = { ok: true, turncoat: true };
    after(state, cfg, r, false, ev);
    run.rs = r.state();
    return ev;
  }

  function reverseTargets(d) {
    var out = [];
    if (d.pile.length < 2) return out;
    var t = topOf(d);
    d.cols.forEach(function (col, i) {
      var b = col[col.length - 1];
      if (b && b.u && match(t, b, d.m).ok) out.push(i);
    });
    return out;
  }

  /** Обратный ход: the top of the pile back onto a column where its neighbour lies. */
  function reverse(state, cfg, col) {
    if (!inPlay(state)) return no('Сейчас не расклад');
    var run = state.run;
    var d = run.deal;
    if (!powerReady(run, 'reverse')) return no('Обратного хода нет');
    if (reverseTargets(d).indexOf(col) < 0) return no('Сюда не вернуть');
    var r = Rng.make(run.rs);
    pushHist(run);
    var t = d.pile.pop();
    t.u = 1;
    d.cols[col].push(t);
    d.used.reverse = 1;
    d.dir = 0;
    d.echoLeft = 0;
    var ev = { ok: true, reverse: true };
    after(state, cfg, r, false, ev);
    run.rs = r.state();
    return ev;
  }

  /** A spark brings back a power used in this deal. */
  function recharge(state, cfg, power) {
    if (!inPlay(state)) return no('Сейчас не расклад');
    var run = state.run;
    var d = run.deal;
    if (POWERS.indexOf(power) < 0 || !powerOwned(run, power) || !d.used[power]) return no('Нечего заряжать');
    if (run.sparks < 1) return no('Нет искр');
    pushHist(run);
    run.sparks--;
    d.used[power] = 0;
    return { ok: true, recharge: power };
  }

  /** Искровой камень: a spark turns a closed card of the table face up. */
  function reveal(state, cfg, col, idx) {
    if (!inPlay(state)) return no('Сейчас не расклад');
    var run = state.run;
    var d = run.deal;
    if (!has(run, 'sparkstone')) return no('Нет искрового камня');
    if (run.sparks < 1) return no('Нет искр');
    var card = d.cols[col] && d.cols[col][idx];
    if (!card || card.u) return no('Карта уже открыта');
    pushHist(run);
    run.sparks--;
    card.u = 1;
    delete card.bh;
    return { ok: true, reveal: true };
  }

  function canPlayAny(d, cfg) {
    for (var c = 0; c < d.cols.length; c++) {
      var b = bottomOf(d, c);
      if (b && legal(d, b, cfg, false).ok) return true;
    }
    for (var p = 0; p < d.pocket.length; p++) if (d.pocket[p] && legal(d, d.pocket[p], cfg, true).ok) return true;
    return false;
  }

  function canDraw(run) {
    var d = run.deal;
    return d.deck.length > 0 || (has(run, 'bottomless') && d.pile.length > 1);
  }

  /** No card fits and the deck cannot give one: the owner may end the deal. */
  function stuck(state, cfg) {
    if (!inPlay(state)) return false;
    var run = state.run;
    return !canPlayAny(run.deal, cfg) && !canDraw(run);
  }

  /** Anything at all left to do (else the deal ends by itself). */
  function canAct(run, cfg) {
    var d = run.deal;
    if (canPlayAny(d, cfg) || canDraw(run)) return true;
    if (d.undos > 0 && d.hist.length) return true;
    if (freeSlot(d) >= 0 && openBottoms(d).length) return true;
    if (powerReady(run, 'shuffle') && openBottoms(d).length >= 2) return true;
    if (powerReady(run, 'turncoat') && openBottoms(d).length) return true;
    if (powerReady(run, 'reverse') && reverseTargets(d).length) return true;
    if (run.sparks > 0) {
      for (var i = 0; i < POWERS.length; i++) if (powerOwned(run, POWERS[i]) && d.used[POWERS[i]]) return true;
    }
    return false;
  }

  /** What happens after a move: stones, the draught, weeds, the clock, the blind, locks, the end. */
  function after(state, cfg, r, counts, ev) {
    var run = state.run;
    var d = run.deal;
    if (counts) d.moves++;
    if (removeStones(d)) ev.stones = true;
    if (has(run, 'draft')) {
      d.cols.forEach(function (col) {
        if (!col.length && d.deck.length) {
          var c = d.deck.pop();
          c.u = 1;
          col.push(c);
          ev.draft = true;
        }
      });
    }
    if (counts) {
      var weeds = false;
      d.cols.forEach(function (col) { col.forEach(function (c) { if (c.c === 'weed') weeds = true; }); });
      if (weeds) {
        d.sinceWeed++;
        if (d.sinceWeed >= cfg['curse.weed.every']) {
          d.sinceWeed = 0;
          var live = [];
          d.cols.forEach(function (col, i) { if (col.length) live.push(i); });
          if (live.length) {
            d.cols[r.pick(live)].unshift(mk(run, r.pick(d.m.order), r.pick(d.m.suits), { u: 0, t: 1 }));
            ev.weed = true;
          }
        }
      }
      if (d.m.clock) {
        d.sinceClock++;
        if (d.sinceClock >= d.m.clock && d.cols.length > 1) {
          d.sinceClock = 0;
          var a = r.int(0, d.cols.length - 1);
          var b = r.int(0, d.cols.length - 2);
          if (b >= a) b++;
          var tmp = d.cols[a];
          d.cols[a] = d.cols[b];
          d.cols[b] = tmp;
          ev.clock = [a, b];
          removeStones(d);
        }
      }
      if (d.m.blind) {
        var hidden = [];
        d.cols.forEach(function (col) {
          var x = col[col.length - 1];
          if (x && x.bh) hidden.push(x);
        });
        if (hidden.length) {
          var h = r.pick(hidden);
          delete h.bh;
          h.u = 1;
        }
      }
    }
    if (d.chain >= cfg['curse.lock.chain']) {
      d.cols.forEach(function (col) {
        var x = col[col.length - 1];
        if (x && x.c === 'lock' && !x.unl) {
          x.unl = 1;
          ev.unlock = true;
        }
      });
    }
    revealBottoms(d);
    if (!tableCount(d) && !pocketCount(d)) {
      clearTable(state, cfg, r, ev);
      return;
    }
    if (run.candles <= 0 || d.moves >= cfg['maxMovesPerDeal'] || !canAct(run, cfg)) finishDeal(state, cfg, ev);
  }

  function clearTable(state, cfg, r, ev) {
    var run = state.run;
    var d = run.deal;
    if (d.bonus === 1) {
      finishDeal(state, cfg, ev);
      return;
    }
    d.cleared = 1;
    var per = has(run, 'miser') ? cfg['relic.miser.gold'] : cfg['gold.deckLeft'];
    var g = d.deck.length * per;
    run.gold += g;
    d.gold += g;
    run.stats.gold += g;
    ev.clear = { gold: g, deck: d.deck.length };
    ev.clear.candles = gainCandle(run, cfg, d.m.clear + d.m.clearPlus);
    run.stats.empties++;
    if (has(run, 'shadowmaster') && run.mode === 'run') {
      d.bonus = 1;
      var count = cfg['relic.shadowmaster.cards'];
      for (var k = 0; k < count; k++) {
        var col = d.cols[k % d.cols.length];
        if (col.length) col[col.length - 1].u = 0;
        col.push(mk(run, r.pick(d.m.order), r.pick(d.m.suits), { u: 1, t: 1 }));
      }
      ev.bonusTable = true;
      if (!canAct(run, cfg)) finishDeal(state, cfg, ev);
      return;
    }
    finishDeal(state, cfg, ev);
  }

  /** The end of a deal: candles for what is left, the counters, then the shop, the victory or the end. */
  function finishDeal(state, cfg, ev) {
    var run = state.run;
    var d = run.deal;
    if (d.over) return;
    var left = tableCount(d) + pocketCount(d);
    ev.dealEnd = { cleared: !!d.cleared, left: d.bonus === 1 ? 0 : left, before: run.candles };
    if (!d.cleared && left > 0) {
      var cost = left * d.m.leftover + (has(run, 'usurer') ? cfg['relic.usurer.candles'] : 0);
      ev.dealEnd.lost = loseCandle(run, cfg, cost);
    }
    if (!d.cleared && run.mode === 'run' && !run.whiteOn) run.stats.clean = false;
    if (d.cleared && run.mode === 'run' && !run.whiteOn) run.stats.cleared++;
    logChain(run, d);
    d.over = true;
    d.hist = [];
    var meta = state.meta;
    meta.rec = meta.rec || {};
    if (run.stats.bestChain > (meta.rec.bestChain || 0)) meta.rec.bestChain = run.stats.bestChain;
    if (d.best >= cfg['deck.lunar.chain'] && !meta.unlocked.lunar) {
      meta.unlocked.lunar = true;
      ev.decks = (ev.decks || []).concat(['lunar']);
    }
    var hosted = d.hosts.length > 0 || (d.hx && d.hx.kind === 'host');
    if (hosted && run.candles > 0 && run.mode === 'run') {
      run.stats.hosts++;
      if (d.hosts.indexOf('blind') >= 0 && d.cleared && !d.undoUsed) meta.rec.blindWin = true;
    }
    run.stats.deals++;
    if (run.candles <= 0) {
      endRun(state, 'lost');
      return;
    }
    if (run.mode === 'daily') {
      endRun(state, 'daily');
      return;
    }
    if (run.whiteOn) {
      run.white++;
      openShop(state, cfg);
      return;
    }
    run.dealNo++;
    var dpc = perCircle(run, cfg);
    if (run.dealNo === dpc && !meta.unlocked.short) {
      meta.unlocked.short = true;
      ev.decks = (ev.decks || []).concat(['short']);
    }
    if (run.dealNo >= mainDeals(run, cfg)) {
      run.stats.won = true;
      run.phase = 'won';
      run.deal.over = true;
      ev.won = true;
      return;
    }
    openShop(state, cfg);
  }

  /** The owner ends a deal that has no move left. */
  function giveUp(state, cfg) {
    if (!inPlay(state)) return no('Сейчас не расклад');
    var ev = { ok: true, gaveUp: true };
    finishDeal(state, cfg, ev);
    return ev;
  }

  // ---- the shop ---------------------------------------------------------------------------------

  function relicInfo(run, id) {
    var x = customOf(run, id);
    if (x) return { id: x.id, rarity: 'rare', title: x.title, text: x.text, custom: true };
    return info('relics', id);
  }

  function priceMult(state, cfg) {
    var run = state.run;
    var shop = state.meta.shop || {};
    var m = 1 - cfg['ws.discount.pct'] * (shop.discount || 0);
    if (has(run, 'usurer')) m *= 1 - cfg['relic.usurer.discount'];
    if ((run.night || 0) >= 2) m *= 1 + cfg['night.price'];
    return m;
  }

  function priceOf(state, cfg, kind, id) {
    var run = state.run;
    var base;
    if (kind === 'relic') {
      var x = relicInfo(run, id);
      base = cfg['price.' + ((x && x.rarity) || 'common')] * (1 + cfg['price.relicStep'] * run.relics.length);
    } else if (kind === 'seal') {
      base = cfg['price.seal'] * (run.deck === 'twosuit' ? cfg['deck.twosuit.sealMult'] : 1);
    } else if (kind === 'remove') base = cfg['price.remove'];
    else if (kind === 'candle') base = cfg['price.candle'] + cfg['price.candleStep'] * (run.candlesBought || 0);
    else if (kind === 'reroll') return cfg['price.reroll'] + cfg['price.rerollStep'] * (run.rerolls || 0);
    else return 0;
    return Math.max(1, Math.round(base * priceMult(state, cfg)));
  }

  function relicPool(state) {
    var run = state.run;
    var out = need().relics.filter(function (x) {
      if (has(run, x.id)) return false;
      if (run.deck === 'widow' && NO_WIDOW.indexOf(x.id) >= 0) return false;
      return true;
    }).map(function (x) { return x.id; });
    (run.custom || []).forEach(function (x) { if (x.kind === 'relic' && !has(run, x.id)) out.push(x.id); });
    return out;
  }

  function rollShop(state, cfg, r) {
    var run = state.run;
    var nRel = cfg['shop.relics'] + (has(run, 'shopkeeper') ? cfg['relic.shopkeeper.extra'] : 0) - ((run.night || 0) >= 9 ? 1 : 0);
    var pool = relicPool(state);
    var relics = [];
    for (var i = 0; i < nRel && pool.length; i++) {
      var pick = r.weighted(pool, function (id) {
        var x = relicInfo(run, id);
        return cfg['weight.' + ((x && x.rarity) || 'common')];
      });
      if (pick === undefined) break;
      relics.push(pick);
      pool.splice(pool.indexOf(pick), 1);
    }
    var nSeal = cfg['shop.seals'] + ((state.meta.shop && state.meta.shop.wideshop) || 0);
    var seals = [];
    var ids = need().seals.map(function (s) { return s.id; });
    for (var k = 0; k < nSeal; k++) seals.push(r.pick(ids));
    return { relics: relics, seals: seals, soldR: relics.map(function () { return 0; }), soldS: seals.map(function () { return 0; }) };
  }

  function openShop(state, cfg) {
    var run = state.run;
    var r = Rng.make(run.rs);
    run.shop = rollShop(state, cfg, r);
    run.phase = 'shop';
    run.rs = r.state();
  }

  function inShop(state) { return state.run && state.run.phase === 'shop' && state.run.shop; }

  function album(state, kind, id) {
    var a = state.meta.album = state.meta.album || {};
    a[kind] = a[kind] || {};
    a[kind][id] = (a[kind][id] || 0) + 1;
  }

  function gainRelic(state, cfg, id) {
    var run = state.run;
    if (has(run, id)) return false;
    run.relics.push(id);
    album(state, 'relics', id);
    if (id === 'tallow') gainCandle(run, cfg, cfg['relic.tallow.candles']);
    if (id === 'joker') addJokers(run, 1);
    if (id === 'jokers2') addJokers(run, cfg['relic.jokers2.n']);
    var x = customOf(run, id);
    if (x && x.brick === 'candles.start') gainCandle(run, cfg, Number(x.n) || 0);
    return true;
  }

  function buyRelic(state, cfg, i) {
    if (!inShop(state)) return no('Лавка закрыта');
    var run = state.run;
    var id = run.shop.relics[i];
    if (!id || run.shop.soldR[i]) return no('Уже куплено');
    var price = priceOf(state, cfg, 'relic', id);
    if (run.gold < price) return no('Не хватает золота');
    run.gold -= price;
    run.shop.soldR[i] = 1;
    gainRelic(state, cfg, id);
    return { ok: true, relic: id, price: price };
  }

  function sealTargets(run) {
    return run.cards.filter(function (c) { return !c.c && !c.j && !c.se; });
  }

  function buySeal(state, cfg, i, cardId) {
    if (!inShop(state)) return no('Лавка закрыта');
    var run = state.run;
    var id = run.shop.seals[i];
    if (!id || run.shop.soldS[i]) return no('Уже куплено');
    var card = null;
    run.cards.forEach(function (c) { if (c.i === cardId) card = c; });
    if (!card || card.c || card.j || card.se) return no('На эту карту печать не поставить');
    var price = priceOf(state, cfg, 'seal', id);
    if (run.gold < price) return no('Не хватает золота');
    run.gold -= price;
    run.shop.soldS[i] = 1;
    card.se = id;
    if (id === 'twin') {
      var order = deckDef(run).ranks;
      card.r2 = order[(order.indexOf(card.r) + cfg['seal.twin.offset']) % order.length];
    }
    album(state, 'seals', id);
    return { ok: true, seal: id, card: cardId, price: price };
  }

  function removeCard(state, cfg, cardId) {
    if (!inShop(state)) return no('Лавка закрыта');
    var run = state.run;
    var card = null;
    run.cards.forEach(function (c) { if (c.i === cardId) card = c; });
    if (!card) return no('Нет такой карты');
    if (!card.c && run.cards.length <= cfg['deck.minCards']) return no('Колода и так тонкая');
    var price = priceOf(state, cfg, 'remove');
    if (run.gold < price) return no('Не хватает золота');
    run.gold -= price;
    run.cards = run.cards.filter(function (c) { return c.i !== cardId; });
    run.stats.removed++;
    return { ok: true, removed: cardId, price: price };
  }

  function buyCandle(state, cfg) {
    if (!inShop(state)) return no('Лавка закрыта');
    var run = state.run;
    var price = priceOf(state, cfg, 'candle');
    if (run.gold < price) return no('Не хватает золота');
    if (run.candles >= cfg['candles.max']) return no('Свечей и так много');
    run.gold -= price;
    run.candlesBought = (run.candlesBought || 0) + 1;
    gainCandle(run, cfg, 1);
    return { ok: true, candle: true, price: price };
  }

  function reroll(state, cfg) {
    if (!inShop(state)) return no('Лавка закрыта');
    var run = state.run;
    var price = priceOf(state, cfg, 'reroll');
    if (run.gold < price) return no('Не хватает золота');
    run.gold -= price;
    run.rerolls = (run.rerolls || 0) + 1;
    var r = Rng.make(run.rs);
    run.shop = rollShop(state, cfg, r);
    run.rs = r.state();
    return { ok: true, reroll: true, price: price };
  }

  /** Out of the shop into the next deal. */
  function nextDeal(state, cfg) {
    var run = state.run;
    if (run.phase !== 'shop') return no('Сейчас не лавка');
    startDeal(state, cfg);
    return { ok: true, deal: run.deal.n };
  }

  // ---- runs -------------------------------------------------------------------------------------

  function upgradeLevel(state, id) { return (state.meta.shop && state.meta.shop[id]) || 0; }

  function emptyStats() {
    return { played: 0, empties: 0, hosts: 0, cleared: 0, clean: true, bestChain: 0, deals: 0, removed: 0, won: false, gold: 0 };
  }

  function startCandles(state, cfg, deck, night, charge) {
    var c = deck === 'widow' ? cfg['deck.widow.candles'] : cfg['candles.start'];
    c += upgradeLevel(state, 'wick');
    if (charge) c += cfg['charge.candles'];
    if (night >= 4) c -= cfg['night.candles'];
    if (night >= 10) c -= cfg['night.candles'];
    return Math.max(1, Math.min(cfg['candles.max'], c));
  }

  function commonRelics(state) {
    return need().relics.filter(function (x) {
      return x.rarity === 'common' && !(state.run.deck === 'widow' && NO_WIDOW.indexOf(x.id) >= 0);
    }).map(function (x) { return x.id; });
  }

  /**
   * A new run: o = {seed, deck, night, charge, custom: [stock rules]}; or the deal of the day:
   * o = {mode: 'daily', day: 'YYYY-MM-DD', rule}. Replaces state.run.
   */
  function newRun(state, cfg, o) {
    o = o || {};
    var meta = state.meta;
    var daily = o.mode === 'daily';
    var deck = daily ? 'normal' : (o.deck || 'normal');
    if (!daily && deck !== 'normal' && !(meta.unlocked && meta.unlocked[deck])) return no('Колода ещё не открыта');
    var night = daily ? 0 : Math.max(0, Math.min(nightsOf(state), Math.floor(n(o.night, 0))));
    var seed = daily ? Rng.hash(GAME + ':' + o.day) : (Number(o.seed) >>> 0);
    var run = {
      phase: 'play', mode: daily ? 'daily' : 'run', deck: deck, night: night, seed: seed, rs: seed, day: daily ? String(o.day) : '',
      candles: 0, gold: 0, sparks: 0, relics: [], custom: [], cards: [], nextId: 1, dealNo: 0, white: 0, whiteOn: false,
      deal: null, shop: null, pick: null, rerolls: 0, candlesBought: 0, hostsUsed: [], stats: emptyStats(), undosUsed: 0, result: null, log: [],
      charge: !!o.charge, cursedCircle: -1, cursedWhite: -1, dailyRule: null
    };
    state.run = run;
    run.cards = buildCards(run);
    var r = Rng.make(run.rs);
    if (!daily) {
      if (deck !== 'widow') addJokers(run, upgradeLevel(state, 'joker'));
      if (night >= 1) for (var i = 0; i < cfg['night.curses']; i++) addCurse(run, r, 0);
      (o.custom || []).forEach(function (item, k) {
        if (!item || validateRule(item)) return;
        run.custom.push({ id: 'x' + k, kind: item.kind, title: String(item.title), text: String(item.text), brick: item.brick, n: Number(item.n) || 0 });
      });
    } else {
      var rule = o.rule && !validateRule(o.rule) ? o.rule : procedural('rules', Rng.make(seed));
      run.dailyRule = { id: 'daily', kind: rule.kind, title: String(rule.title), text: String(rule.text), brick: rule.brick, n: Number(rule.n) || 0, procedural: !!rule.procedural };
      for (var dc = 0; dc < 2; dc++) addCurse(run, r, 1);
    }
    run.candles = daily ? cfg['candles.start'] : startCandles(state, cfg, deck, night, o.charge);
    run.gold = daily ? 0 : cfg['gold.start'] + upgradeLevel(state, 'coins') * cfg['ws.coins.gold'];
    run.rs = r.state();
    meta.rec = meta.rec || {};
    if (daily) {
      var dd = meta.daily && meta.daily.day === run.day ? meta.daily : { day: run.day, best: 0, tries: 0, rule: run.dailyRule };
      dd.tries++;
      meta.daily = dd;
    } else {
      meta.rec.runs = (meta.rec.runs || 0) + 1;
      meta.pickDeck = deck;
      meta.pickNight = night;
    }
    if (!daily && upgradeLevel(state, 'startrelic') > 0) {
      var pool = commonRelics(state);
      var opts = [];
      while (opts.length < 3 && pool.length) {
        var id = r.pick(pool);
        opts.push(id);
        pool.splice(pool.indexOf(id), 1);
      }
      run.rs = r.state();
      run.phase = 'pick';
      run.pick = { kind: 'start', options: opts };
      return { ok: true, pick: true };
    }
    startDeal(state, cfg);
    return { ok: true };
  }

  /** The start relic (or none: i = -1), then the first deal. */
  function pickStart(state, cfg, i) {
    var run = state.run;
    if (run.phase !== 'pick' || !run.pick) return no('Нечего выбирать');
    var id = run.pick.options[i];
    if (id) gainRelic(state, cfg, id);
    run.pick = null;
    startDeal(state, cfg);
    return { ok: true, relic: id || null };
  }

  /** After the victory: the endless «Белая ночь» (shop first). */
  function whiteNight(state, cfg) {
    var run = state.run;
    if (run.phase !== 'won' || !cfg['whiteNight.on']) return no('Белая ночь недоступна');
    run.whiteOn = true;
    openShop(state, cfg);
    return { ok: true };
  }

  /** The run ends: the wax is counted by settle (with the links' multiplier from the screen). */
  function endRun(state, outcome) {
    var run = state.run;
    run.phase = 'over';
    run.result = { pending: true, outcome: outcome };
    if (run.deal) run.deal.over = true;
  }

  /** Ends the run by the owner's choice: after the victory or during the white night. */
  function finish(state, cfg) {
    var run = state.run;
    if (run.phase === 'won' || (run.whiteOn && (run.phase === 'shop' || run.phase === 'play'))) {
      endRun(state, 'won');
      return { ok: true };
    }
    return no('Забег ещё идёт');
  }

  /** The wax of the run as the formula of the spec has it: {wax, base, mult, parts}. */
  function waxFor(run, cfg, linkMult) {
    var s = run.stats;
    var parts = {
      cards: Math.floor(s.played / Math.max(1, cfg['wax.perCards'])),
      empties: s.empties * cfg['wax.clear'],
      hosts: s.hosts * cfg['wax.host'],
      win: s.won ? cfg['wax.win'] : 0
    };
    var base = parts.cards + parts.empties + parts.hosts + parts.win;
    var mult = (run.deck === 'widow' ? cfg['deck.widow.wax'] : 1) * (1 + (run.night || 0) * cfg['night.bonus']) * (linkMult || 1);
    if (run.mode === 'daily') {
      base = parts.cards + parts.empties;
      mult = linkMult || 1;
    }
    return { wax: Math.floor(base * mult + 1e-9), base: base, mult: mult, parts: parts };
  }

  /** Pays the wax of a finished run once, keeps the records, opens decks; mult — g.links.mult(). */
  function settle(state, cfg, mult) {
    var run = state.run;
    if (run.phase !== 'over' || !run.result || !run.result.pending) return { ok: false };
    var meta = state.meta;
    var rec = meta.rec = meta.rec || {};
    var w = waxFor(run, cfg, mult);
    var daily = run.mode === 'daily';
    if (daily && meta.daily && meta.daily.tries > 1) w = { wax: 0, base: 0, mult: 1, parts: w.parts, repeat: true };
    meta.wax = waxOf(meta) + w.wax;
    rec.totalWax = (rec.totalWax || 0) + w.wax;
    rec.totalPlayed = (rec.totalPlayed || 0) + run.stats.played;
    var unlocks = [];
    var won = run.stats.won && !daily;
    if (won) {
      rec.wins = (rec.wins || 0) + 1;
      rec.wonNights = rec.wonNights || {};
      rec.wonNights[run.night] = 1;
      if (!meta.unlocked.twosuit) {
        meta.unlocked.twosuit = true;
        unlocks.push('twosuit');
      }
      if (run.night >= cfg['deck.widow.night'] && !meta.unlocked.widow) {
        meta.unlocked.widow = true;
        unlocks.push('widow');
      }
      if (run.stats.clean && run.stats.cleared >= mainDeals(run, cfg)) rec.cleanRun = true;
      if (run.night === nightsOf(state) && run.night < cfg['night.max']) meta.ascend = true;
    }
    if (run.whiteOn && run.white > (rec.bestWhite || 0)) rec.bestWhite = run.white;
    var reached = run.whiteOn ? mainDeals(run, cfg) + run.white : run.dealNo;
    if (!daily && reached > (rec.deepest || 0)) rec.deepest = reached;
    var score = 0;
    if (daily) {
      score = run.deal ? run.deal.gold : 0;
      if (meta.daily && score > (meta.daily.best || 0)) meta.daily.best = score;
      if (score > (rec.dailyBest || 0)) rec.dailyBest = score;
    }
    run.result = {
      pending: false, outcome: run.result.outcome, wax: w.wax, base: w.base, mult: w.mult, parts: w.parts, linkMult: mult || 1,
      unlocks: unlocks, won: won, white: run.white, deals: run.stats.deals, played: run.stats.played, bestChain: run.stats.bestChain,
      score: score, repeat: !!w.repeat
    };
    return { ok: true, wax: w.wax, unlocks: unlocks };
  }

  /** Back to the start screen from the result. */
  function toHub(state) {
    var run = state.run;
    if (run.phase === 'over' && run.result && run.result.pending) return no('Сначала итог');
    state.run = { phase: 'hub' };
    return { ok: true };
  }

  /** Leaves a run in the middle: it ends as lost (the wax of what was done is paid). */
  function abandon(state) {
    var run = state.run;
    if (['play', 'shop', 'pick', 'won'].indexOf(run.phase) < 0) return no('Забега нет');
    endRun(state, run.phase === 'won' ? 'won' : 'lost');
    return { ok: true };
  }

  // ---- the workshop -----------------------------------------------------------------------------

  /** The ceiling of an improvement; a negative setting means there is none. */
  function upgradeMax(cfg, id) {
    var max = cfg['ws.' + id + '.max'];
    return max < 0 ? Infinity : max;
  }

  function upgradeCost(state, cfg, id) {
    var lvl = upgradeLevel(state, id);
    if (lvl >= upgradeMax(cfg, id)) return null;
    return Math.round(cfg['ws.' + id + '.base'] * Math.pow(cfg['ws.growth'], lvl));
  }

  function buyUpgrade(state, cfg, id) {
    if (UPGRADES.indexOf(id) < 0) return no('Нет такого улучшения');
    var price = upgradeCost(state, cfg, id);
    if (price === null) return no('Уже наибольший уровень');
    var have = waxOf(state.meta);
    if (have < price) return no('Не хватает воска');
    state.meta.wax = have - price;
    state.meta.shop = state.meta.shop || {};
    state.meta.shop[id] = upgradeLevel(state, id) + 1;
    return { ok: true, level: state.meta.shop[id], price: price };
  }

  function deckOpen(state, id) { return id === 'normal' || !!(state.meta.unlocked && state.meta.unlocked[id]); }

  // ---- the functions the engine calls -----------------------------------------------------------

  function init(ctx) {
    return {
      run: { phase: 'hub' },
      layers: {},
      meta: {
        wax: 0, shop: {}, unlocked: { normal: true }, album: { relics: {}, seals: {} }, rec: { runs: 0, wins: 0, bestChain: 0 },
        daily: null, ascend: false, pickNight: 0, pickDeck: 'normal'
      }
    };
  }

  function tick(state, dt, ctx) { /* turn-based: nothing runs by itself */ }

  function offline(state, sec, ctx) { return { events: [] }; }

  function prestigeGain(state, layerId, cfg) {
    if (layerId !== LAYER) return Big.ZERO;
    var meta = state.meta || {};
    var phase = state.run && state.run.phase;
    if (!meta.ascend) return Big.ZERO;
    if (nightsOf(state) >= n(cfg && cfg['night.max'], 10)) return Big.ZERO;
    if (phase !== 'hub' && phase !== 'over') return Big.ZERO;
    if (state.run.result && state.run.result.pending) return Big.ZERO;
    return Big.ONE;
  }

  function bonus(state, layerId, amount, cfg) {
    return Big.add(1, Big.mul(amount, n(cfg && cfg['night.bonus'], 0.1)));
  }

  function onPrestige(state, layerId, before, ctx) {
    state.meta.ascend = false;
    state.meta.pickNight = nightsOf(state);
  }

  function migrate(state, fromVer) { return state; }

  var PHASES = ['hub', 'pick', 'play', 'shop', 'won', 'over'];

  function validate(state) {
    var run = state.run;
    if (!run || PHASES.indexOf(run.phase) < 0) return 'неизвестная фаза забега: ' + (run && run.phase);
    if (run.phase !== 'hub') {
      if (typeof run.candles !== 'number' || run.candles < 0) return 'свечи не число';
      if (typeof run.gold !== 'number' || run.gold < 0) return 'золото не число';
      if (!Array.isArray(run.cards)) return 'нет колоды забега';
      if (run.phase === 'play' && (!run.deal || !Array.isArray(run.deal.cols) || !Array.isArray(run.deal.deck))) return 'нет расклада';
      if (run.phase === 'shop' && !run.shop) return 'нет лавки';
    }
    if (!Big.valid(state.meta.wax === undefined ? 0 : state.meta.wax)) return 'воск не число';
    return null;
  }

  function circleTitle(k) {
    var c = need().circles[k];
    return c ? c.title : '';
  }

  function summary(state, cfg) {
    var run = state.run || {};
    var wax = waxOf(state.meta);
    var night = nightsOf(state);
    if (run.phase === 'play' || run.phase === 'shop') {
      if (run.mode === 'daily') return { line: 'Расклад дня · свечей ' + run.candles };
      var c = circleOf(run, cfg);
      var label = run.whiteOn ? 'Белая ночь, расклад ' + (run.white + 1) : circleTitle(c) + ', расклад ' + (run.dealNo % perCircle(run, cfg) + 1);
      return { line: label + ' · свечей ' + run.candles + ' · воск ' + wax };
    }
    var rec = state.meta.rec || {};
    return { line: 'ночь ' + night + ' · побед ' + (rec.wins || 0) + ' · воск ' + wax };
  }

  /** The chest of «Пассажир»: some wax. */
  function chest(state, rng, cfg) {
    var amount = rng.int(cfg['chest.min'], Math.max(cfg['chest.min'], cfg['chest.max']));
    state.meta.wax = waxOf(state.meta) + amount;
    return { title: 'Свечная лавка в вагоне', items: [{ title: 'Воск', amount: amount }] };
  }

  // ---- rules from the stock: bricks -----------------------------------------------------------------

  var WORDS = {
    host: ['Ключница', 'Звонарь', 'Сторожиха', 'Перевозчик', 'Свечник', 'Полуночница', 'Счетовод', 'Хромой картёжник'],
    relic: ['Медный', 'Тихий', 'Старый', 'Лунный', 'Тёплый', 'Восковой', 'Ночной'],
    thing: ['напёрсток', 'огарок', 'бубенец', 'гребень', 'ключик', 'фонарик', 'платок']
  };

  function brickText(b, k) { return String(b.text).replace('{n}', String(k)); }

  /** A rule made without the model (the stock ran out, or the deal of the day). */
  function procedural(kind, rng) {
    var bricks = need().bricks;
    var b = rng.pick(bricks);
    var k = b.min === b.max ? b.min : rng.int(b.min, b.max);
    var title = b.kind === 'host' ? rng.pick(WORDS.host) : rng.pick(WORDS.relic) + ' ' + rng.pick(WORDS.thing);
    return { title: title, text: brickText(b, k), kind: b.kind, brick: b.id, n: k, procedural: true };
  }

  function validateRule(item) {
    if (!item || typeof item !== 'object') return 'не объект';
    var b = info('bricks', item.brick);
    if (!b) return 'нет такого кирпичика: ' + item.brick;
    if (item.kind !== b.kind) return 'кирпичик ' + b.id + ' — для ' + (b.kind === 'host' ? 'хозяина' : 'реликвии');
    var k = Number(item.n);
    if (!(k >= b.min && k <= b.max)) return 'n вне ' + b.min + '..' + b.max;
    if (!item.title || !item.text) return 'нет названия или текста';
    return null;
  }

  /** How many of `tries` deals of the first circle the solver clears under the rule (or none). */
  function solvableCount(item, tries, budget) {
    var cfg = defaults();
    var run = { mode: 'run', deck: 'normal', night: 0, relics: [], custom: [], cards: [], nextId: 1, dealNo: 0, white: 0, whiteOn: false };
    run.cards = buildCards(run);
    var hx = null;
    if (item) {
      run.custom = [{ id: 'x0', kind: item.kind, title: String(item.title), text: String(item.text), brick: item.brick, n: Number(item.n) || 0 }];
      if (item.kind === 'relic') run.relics.push('x0');
      else hx = run.custom[0];
    }
    var m = mods(run, cfg, [], hx);
    var size = tableSize(run, cfg, 0);
    var k = 0;
    for (var s = 0; s < tries; s++) {
      var made = layout(run, cfg, Rng.make(77 + s), m, size);
      if (solve(made.cols, made.deck, made.pile[0], m, cfg, budget).ok === true) k++;
    }
    return k;
  }

  var BASE_SOLVABLE = -1;

  /**
   * The schema is checked by the engine; here the brick, and for a host a run of the generator
   * with the solver: the same 6 deals of the first circle under the plain rules and under the
   * host — the host must leave at least a third of what the plain rules clear (and one deal).
   */
  function validateStock(kind, item) {
    if (kind !== 'rules') return null;
    var bad = validateRule(item);
    if (bad) return bad;
    if (/https?:/.test(String(item.text) + String(item.title))) return 'ссылка в тексте';
    if (item.kind !== 'host') return null;
    var tries = 6;
    var budget = 4000;
    if (BASE_SOLVABLE < 0) BASE_SOLVABLE = solvableCount(null, tries, budget);
    var k = solvableCount(item, tries, budget);
    var want = Math.max(1, Math.ceil(BASE_SOLVABLE / 3));
    if (k < want) return 'хозяин делает раздачи нерешаемыми (' + k + ' из ' + tries + ', без него ' + BASE_SOLVABLE + ')';
    return null;
  }

  // The settings validateStock needs without the engine (it is called with no cfg): node and
  // Rhino read config.json above; the hand-written part is a fallback.
  var DEFAULTS = null;
  function setDefaults(file) {
    var out = {};
    for (var k in file || {}) {
      var v = file[k];
      out[k] = v && typeof v === 'object' && 'value' in v ? v.value : v;
    }
    DEFAULTS = out;
    return true;
  }
  function defaults() {
    if (DEFAULTS) return DEFAULTS;
    DEFAULTS = {
      'candles.start': 10, 'candles.clear': 1, 'candles.leftover': 1, 'candles.max': 25,
      'tableau.cols.1': 6, 'tableau.rows.1': 4, 'tableau.cols.2': 6, 'tableau.rows.2': 5, 'tableau.cols.3': 7, 'tableau.rows.3': 5,
      'deals.perCircle': 3, 'curse.lock.chain': 6, 'curse.shadow.chain': 3, 'host.miser.cards': 8, 'host.clock.every': 6,
      'host.guard.kings': 2, 'host.lender.cost': 2, 'host.lender.clear': 3, 'relic.suit.mult': 2, 'deck.short.rows': 3,
      'deck.short.deals': 4, 'night.deckCut': 4, 'daily.cols': 6, 'daily.rows': 5
    };
    return DEFAULTS;
  }

  return {
    LAYER: LAYER, GAME: GAME, DECK_IDS: DECK_IDS, UPGRADES: UPGRADES, POWERS: POWERS,
    setContent: setContent, setDefaults: setDefaults, info: info, content: need,
    init: init, tick: tick, offline: offline, prestigeGain: prestigeGain, bonus: bonus, onPrestige: onPrestige,
    migrate: migrate, validate: validate, summary: summary, chest: chest, procedural: procedural, validateStock: validateStock,
    // the game
    newRun: newRun, pickStart: pickStart, play: play, draw: draw, pocketPut: pocketPut, pocketPlay: pocketPlay, undo: undo,
    shuffle: shuffle, turncoat: turncoat, reverse: reverse, recharge: recharge, reveal: reveal, giveUp: giveUp,
    buyRelic: buyRelic, buySeal: buySeal, removeCard: removeCard, buyCandle: buyCandle, reroll: reroll, nextDeal: nextDeal,
    whiteNight: whiteNight, finish: finish, settle: settle, toHub: toHub, abandon: abandon,
    buyUpgrade: buyUpgrade, upgradeCost: upgradeCost, upgradeMax: upgradeMax, upgradeLevel: upgradeLevel, deckOpen: deckOpen,
    // reading
    legal: legal, match: match, topOf: topOf, stuck: stuck, canAct: canAct, hiddenShadow: hiddenShadow, tableCount: tableCount,
    pocketCount: pocketCount, openBottoms: openBottoms, reverseTargets: reverseTargets, powerReady: powerReady, has: has,
    priceOf: priceOf, relicInfo: relicInfo, sealTargets: sealTargets, waxOf: waxOf, nightsOf: nightsOf, waxFor: waxFor,
    circleOf: circleOf, perCircle: perCircle, mainDeals: mainDeals, isHostDeal: isHostDeal, rankName: rankName, circleTitle: circleTitle,
    solve: solve, layout: layout, mods: mods, startDeal: startDeal, validateRule: validateRule, deckDef: deckDef
  };
});
