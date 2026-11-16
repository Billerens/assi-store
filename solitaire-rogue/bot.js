// The bots of «Пасьянс-рогалик» for the balance tests and the checks (node and Rhino): a greedy
// one (the longest chain it can see, else the deck) and one that looks three moves ahead and
// uses the tricks of the relics. Both see only what the owner sees: closed cards of the table
// and the deck (beyond what the relics show) are masked before they think. Shared subset of
// JavaScript, the same as sim.js; the sim is passed in.
(function (root, make) {
  var api = make();
  if (typeof exports !== 'undefined') { for (var k in api) exports[k] = api[k]; } else { root.GameBot = api; }
})(this, function () {
  'use strict';

  var MASK = 100;

  function clone(x) { return JSON.parse(JSON.stringify(x)); }

  /** A light copy of the state for thinking: the deal deep, the run shallow, no undo history. */
  function lite(state) {
    var run = state.run;
    var r = {};
    for (var k in run) r[k] = run[k];
    var d = run.deal;
    var hist = d.hist;
    d.hist = [];
    r.deal = clone(d);
    d.hist = hist;
    r.deal.undos = 0;
    r.stats = clone(run.stats);
    r.log = [];
    // The records and unlocks a thought-of deal would touch stay out of the real meta.
    return { run: r, meta: clone(state.meta), layers: state.layers };
  }

  function card(c) {
    var o = {};
    for (var k in c) o[k] = c[k];
    return o;
  }

  /** A fast copy for the search: table and pocket cards copied, the deck and the pile shared. */
  function copy(s) {
    var run = s.run;
    var r = {};
    var k;
    for (k in run) r[k] = run[k];
    var d = run.deal;
    var nd = {};
    for (k in d) nd[k] = d[k];
    nd.cols = d.cols.map(function (col) { return col.map(card); });
    nd.deck = d.deck.slice();
    nd.pile = d.pile.slice();
    nd.pocket = d.pocket.map(function (c) { return c ? card(c) : null; });
    nd.used = card(d.used);
    nd.waxUsed = card(d.waxUsed);
    nd.hist = [];
    r.deal = nd;
    r.stats = card(run.stats);
    r.log = [];
    return { run: r, meta: s.meta, layers: s.layers };
  }

  /** Masks what the owner cannot see: closed table cards, the deck beyond the shown cards. */
  function mask(s, sim, cfg) {
    var d = s.run.deal;
    var k = 0;
    d.cols.forEach(function (col) {
      col.forEach(function (c) {
        if (!c.u || c.bh || sim.hiddenShadow(d, c, cfg)) {
          c.r = MASK + k++;
          c.s = -1;
          delete c.j;
          delete c.r2;
          if (c.c !== 'stone') delete c.c;
        }
      });
    });
    var see = Math.max(d.m.see || 0, d.glance ? 1 : 0);
    for (var i = 0; i < d.deck.length - see; i++) {
      var x = d.deck[i];
      x.r = MASK + k++;
      x.s = -1;
      delete x.j;
      delete x.r2;
      delete x.c;
    }
    return s;
  }

  function bottom(d, c) {
    var col = d.cols[c];
    return col && col.length ? col[col.length - 1] : null;
  }

  // ---- the greedy bot ---------------------------------------------------------------------------

  /** The longest chain of plays among the cards it sees: [{col} | {slot}] (the first move first). */
  function longest(d, sim, cfg) {
    var best = [];
    var path = [];
    var count = 0;
    function rec(top, dir) {
      if (++count > 4000) return;
      if (path.length > best.length) best = path.slice();
      for (var c = 0; c < d.cols.length; c++) {
        var col = d.cols[c];
        var b = col[col.length - 1];
        if (!b || !b.u || b.r >= MASK) continue;
        var save = { top: d.pile[d.pile.length - 1], dir: d.dir };
        d.dir = dir;
        var lg = sim.legal(d, b, cfg, false);
        d.dir = save.dir;
        if (!lg.ok) continue;
        col.pop();
        d.pile.push(b);
        path.push({ col: c });
        rec(b, lg.dir);
        path.pop();
        d.pile.pop();
        col.push(b);
      }
      for (var p = 0; p < d.pocket.length; p++) {
        var x = d.pocket[p];
        if (!x) continue;
        var keep = d.dir;
        d.dir = dir;
        var lp = sim.legal(d, x, cfg, true);
        d.dir = keep;
        if (!lp.ok) continue;
        d.pocket[p] = null;
        d.pile.push(x);
        path.push({ slot: p });
        rec(x, lp.dir);
        path.pop();
        d.pile.pop();
        d.pocket[p] = x;
      }
    }
    rec(d.pile[d.pile.length - 1], d.dir);
    return best;
  }

  /** One move of the greedy bot; false when the deal is over or nothing could be done. */
  function greedyMove(state, sim, cfg) {
    var run = state.run;
    var s = mask(lite(state), sim, cfg);
    var line = longest(s.run.deal, sim, cfg);
    if (line.length) {
      var mv = line[0];
      var r = mv.col !== undefined ? sim.play(state, cfg, mv.col) : sim.pocketPlay(state, cfg, mv.slot);
      if (r.ok) return r;
    }
    var dr = sim.draw(state, cfg);
    if (dr.ok) return dr;
    if (run.phase === 'play' && !run.deal.over) return sim.giveUp(state, cfg);
    return dr;
  }

  // ---- the bot that looks ahead -------------------------------------------------------------------

  function evaluate(s, sim, cfg, plays) {
    var run = s.run;
    var d = run.deal;
    var table = sim.tableCount(d) + sim.pocketCount(d) * 0.5;
    var tall = 0;
    var hidden = 0;
    d.cols.forEach(function (col) {
      if (col.length > tall) tall = col.length;
      col.forEach(function (c) { if (!c.u) hidden++; });
    });
    var v = -10 * table - 2 * tall - 0.5 * hidden + d.deck.length + 3 * plays + 0.3 * d.chain + 25 * run.candles;
    if (d.over) v += d.cleared ? 400 : 0;
    var top = d.pile[d.pile.length - 1];
    if (top && top.r >= MASK) v -= 4;
    return v;
  }

  /** The moves worth thinking about in a state: [{kind, arg, arg2}]. */
  function moves(s, sim, cfg) {
    var run = s.run;
    var d = run.deal;
    var out = [];
    var c;
    for (c = 0; c < d.cols.length; c++) {
      var b = bottom(d, c);
      if (b && b.u && b.r < MASK && sim.legal(d, b, cfg, false).ok) out.push({ kind: 'play', arg: c });
    }
    for (var p = 0; p < d.pocket.length; p++) {
      if (d.pocket[p] && sim.legal(d, d.pocket[p], cfg, true).ok) out.push({ kind: 'pocketPlay', arg: p });
    }
    var free = d.pocket.indexOf(null) >= 0;
    var open = sim.openBottoms(d);
    if (free) open.forEach(function (i) { if (d.cols[i].length > 1) out.push({ kind: 'pocketPut', arg: i }); });
    if (sim.powerReady(run, 'turncoat')) open.forEach(function (i) { out.push({ kind: 'turncoat', arg: i }); });
    if (sim.powerReady(run, 'reverse')) sim.reverseTargets(d).forEach(function (i) { out.push({ kind: 'reverse', arg: i }); });
    if (sim.powerReady(run, 'shuffle') && open.length >= 2) out.push({ kind: 'shuffle' });
    if (run.sparks > 0) {
      sim.POWERS.forEach(function (pw) { if (sim.has(run, pw) && d.used[pw]) out.push({ kind: 'recharge', arg: pw }); });
    }
    return out;
  }

  function apply(s, sim, cfg, mv) {
    if (mv.kind === 'play') return sim.play(s, cfg, mv.arg);
    if (mv.kind === 'pocketPlay') return sim.pocketPlay(s, cfg, mv.arg);
    if (mv.kind === 'pocketPut') return sim.pocketPut(s, cfg, mv.arg);
    if (mv.kind === 'turncoat') return sim.turncoat(s, cfg, mv.arg);
    if (mv.kind === 'reverse') return sim.reverse(s, cfg, mv.arg);
    if (mv.kind === 'shuffle') return sim.shuffle(s, cfg);
    if (mv.kind === 'recharge') return sim.recharge(s, cfg, mv.arg);
    if (mv.kind === 'draw') return sim.draw(s, cfg);
    return { ok: false };
  }

  function search(s, sim, cfg, depth, plays, budget) {
    var base = evaluate(s, sim, cfg, plays);
    if (depth === 0 || s.run.deal.over || s.run.phase !== 'play' || budget.n <= 0) return base;
    var list = moves(s, sim, cfg);
    var best = base;
    for (var i = 0; i < list.length; i++) {
      budget.n--;
      var t = copy(s);
      var r = apply(t, sim, cfg, list[i]);
      if (!r.ok) continue;
      var v = search(t, sim, cfg, depth - 1, plays + (list[i].kind === 'play' || list[i].kind === 'pocketPlay' ? 1 : 0), budget);
      if (v > best) best = v;
    }
    return best;
  }

  function o2budget(cfg) { return cfg['bot.budget'] || 150; }

  /** One move of the bot that looks `depth` moves ahead (3 by default). */
  function lookMove(state, sim, cfg, depth) {
    var run = state.run;
    var d = run.deal;
    var base = mask(lite(state), sim, cfg);
    var list = moves(base, sim, cfg);
    var budget = { n: o2budget(cfg) };
    var best = null;
    var bestV = -Infinity;
    for (var i = 0; i < list.length; i++) {
      var t = copy(base);
      var r = apply(t, sim, cfg, list[i]);
      if (!r.ok) continue;
      var v = search(t, sim, cfg, (depth || 3) - 1, list[i].kind === 'play' || list[i].kind === 'pocketPlay' ? 1 : 0, budget);
      if (v > bestV) {
        bestV = v;
        best = list[i];
      }
    }
    // Drawing is worth it only when nothing on the table beats the plain state.
    var stay = evaluate(base, sim, cfg, 0);
    if (best && (bestV > stay || !sim.has(run, 'bottomless') && !d.deck.length)) {
      var res = apply(state, sim, cfg, best);
      if (res.ok) return res;
    }
    if (sim.has(run, 'sparkstone') && run.sparks > 0 && !list.some(function (m) { return m.kind === 'play'; })) {
      var tallest = -1;
      d.cols.forEach(function (col, ci) { if (col.length > 1 && !col[col.length - 2].u && (tallest < 0 || col.length > d.cols[tallest].length)) tallest = ci; });
      if (tallest >= 0) {
        var rv = sim.reveal(state, cfg, tallest, d.cols[tallest].length - 2);
        if (rv.ok) return rv;
      }
    }
    var dr = sim.draw(state, cfg);
    if (dr.ok) return dr;
    if (best) {
      var last = apply(state, sim, cfg, best);
      if (last.ok) return last;
    }
    if (run.phase === 'play' && !run.deal.over) return sim.giveUp(state, cfg);
    return dr;
  }

  // ---- the shop --------------------------------------------------------------------------------------

  // How much each bot wants a relic (0 — never buys it); the greedy one cannot use the tricks.
  var WANT = {
    aces: 9, moon: 7, double: 8, parity: 8, wick: 7, joker: 7, jokers2: 8, third: 6, tallow: 6, holder: 6, eternal: 8,
    bottomless: 5, draft: 6, memory: 4, ember: 5, miser: 4, suit: 3, shopkeeper: 3, usurer: 2, shadowmaster: 4,
    peek: 3, clair: 5, pocket: 5, pocket2: 4, turncoat: 6, reverse: 6, shuffle: 4, sparkstone: 4, undo: 1, sandundo: 2
  };
  var TRICKS = { peek: 1, clair: 1, pocket: 1, pocket2: 1, turncoat: 1, reverse: 1, shuffle: 1, sparkstone: 1, undo: 1, sandundo: 1 };

  function want(id, smart) {
    if (!smart && TRICKS[id]) return 0;
    if (WANT[id] !== undefined) return WANT[id];
    return 4;
  }

  /** The shop: candles when they run low, curses out, the most wanted relic, a seal now and then. */
  function shop(state, sim, cfg, smart) {
    var run = state.run;
    var bought = [];
    var guard = 0;
    function price(kind, id) { return sim.priceOf(state, cfg, kind, id); }
    // The next deal costs more candles in the later circles: keep that many in hand.
    var circle = Math.min(2, Math.floor((run.dealNo || 0) / sim.perCircle(run, cfg)));
    var keep = (cfg['bot.candles'] || 5) + 3 * (run.whiteOn ? 2 : circle);
    while (run.candles <= keep - 3 && run.gold >= price('candle') && guard++ < 10) {
      if (!sim.buyCandle(state, cfg).ok) break;
      bought.push('candle');
    }
    // Its own dice (the run's generator stays untouched): which of the wanted relics it takes.
    var seed = ((run.seed >>> 0) ^ Math.imul(run.dealNo + 1, 2654435761) ^ Math.imul(run.white + 7, 40503) ^ Math.imul(run.rerolls + 3, 69069)) >>> 0;
    function dice() {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    }
    var passes = cfg['bot.passes'] || 2;
    var power = cfg['bot.power'] || 2;
    for (var pass = 0; pass < passes; pass++) {
      var options = [];
      var sum = 0;
      run.shop.relics.forEach(function (id, i) {
        if (run.shop.soldR[i]) return;
        var w = want(id, smart);
        if (w >= 3 && run.gold >= price('relic', id) + Math.max(0, keep - 2 - run.candles) * price('candle')) {
          options.push({ i: i, w: Math.pow(w, power) });
          sum += Math.pow(w, power);
        }
      });
      if (options.length) {
        var roll = dice() * sum;
        var choice = options[options.length - 1].i;
        for (var o = 0; o < options.length; o++) {
          roll -= options[o].w;
          if (roll < 0) {
            choice = options[o].i;
            break;
          }
        }
        var rb = sim.buyRelic(state, cfg, choice);
        if (rb.ok) bought.push(rb.relic);
      } else if (pass === 0 && run.gold >= price('reroll') + 80 && run.rerolls < 2) {
        if (sim.reroll(state, cfg).ok) bought.push('reroll');
      }
    }
    var curses = run.cards.filter(function (c) { return !!c.c; });
    while (curses.length && run.gold >= price('remove') && guard++ < 20) {
      var rm = sim.removeCard(state, cfg, curses[0].i);
      if (!rm.ok) break;
      bought.push('remove');
      curses = run.cards.filter(function (c) { return !!c.c; });
    }
    run.shop.seals.forEach(function (id, i) {
      if (run.shop.soldS[i] || run.gold < price('seal') + 20) return;
      if (id !== 'gold' && id !== 'wax' && id !== 'twin' && !(smart && id === 'key')) return;
      var targets = sim.sealTargets(run);
      if (!targets.length) return;
      var mid = targets.filter(function (c) { return c.r >= 5 && c.r <= 9; });
      var card = (mid.length ? mid : targets)[0];
      if (sim.buySeal(state, cfg, i, card.i).ok) bought.push('seal:' + id);
    });
    while (run.candles < keep && run.gold >= price('candle') && guard++ < 30) {
      if (!sim.buyCandle(state, cfg).ok) break;
      bought.push('candle');
    }
    return bought;
  }

  // ---- a whole run ---------------------------------------------------------------------------------

  /**
   * Plays a run to its end and settles it: o = {smart, seed, deck, night, white (deals of the white
   * night to play after a victory), mult}. Returns {won, deals, moves, wax, relics, perDeal: [moves]}.
   */
  function playRun(state, sim, cfg, o) {
    o = o || {};
    var r = sim.newRun(state, cfg, { seed: o.seed || 1, deck: o.deck || 'normal', night: o.night || 0, charge: !!o.charge, custom: o.custom || [] });
    if (!r.ok) throw new Error('newRun: ' + r.why);
    var run = state.run;
    var guard = 0;
    var moveCount = 0;
    var perDeal = [];
    var dealMoves = 0;
    var shops = 0;
    while (run.phase !== 'over' && guard++ < 20000) {
      run = state.run;
      if (run.phase === 'pick') sim.pickStart(state, cfg, 0);
      else if (run.phase === 'play') {
        var mv = o.smart ? lookMove(state, sim, cfg, o.depth) : greedyMove(state, sim, cfg);
        moveCount++;
        dealMoves++;
        if (mv.dealEnd || state.run.phase !== 'play' || (state.run.deal && state.run.deal.over)) {
          perDeal.push(dealMoves);
          dealMoves = 0;
        }
      } else if (run.phase === 'shop') {
        shop(state, sim, cfg, o.smart);
        shops++;
        sim.nextDeal(state, cfg);
      } else if (run.phase === 'won') {
        if (o.white && sim.whiteNight(state, cfg).ok && state.run.white < o.white) continue;
        sim.finish(state, cfg);
      }
      if (state.run.whiteOn && state.run.white >= (o.white || 0) && state.run.phase === 'shop') sim.finish(state, cfg);
    }
    run = state.run;
    var relics = run.relics.slice();
    var won = !!run.stats.won;
    var deals = run.stats.deals;
    var played = run.stats.played;
    var s = sim.settle(state, cfg, o.mult || 1);
    return { won: won, deals: deals, moves: moveCount, wax: s.wax || 0, relics: relics, perDeal: perDeal, shops: shops, played: played, white: run.white, gold: run.stats.gold, candles: run.candles };
  }

  /** Spends the wax in the workshop the way an owner might: the cheapest useful upgrade first. */
  function workshop(state, sim, cfg) {
    var order = ['wick', 'coins', 'discount', 'joker', 'wideshop', 'glance', 'startrelic'];
    var bought = [];
    var guard = 0;
    for (;;) {
      var best = null;
      var cost = Infinity;
      order.forEach(function (id) {
        var c = sim.upgradeCost(state, cfg, id);
        if (c !== null && c < cost) {
          cost = c;
          best = id;
        }
      });
      if (!best || sim.waxOf(state.meta) < cost || guard++ > 50) break;
      sim.buyUpgrade(state, cfg, best);
      bought.push(best);
    }
    return bought;
  }

  return { greedyMove: greedyMove, lookMove: lookMove, shop: shop, playRun: playRun, workshop: workshop, mask: mask, lite: lite, longest: longest, MASK: MASK };
});
