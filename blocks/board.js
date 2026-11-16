// The rules of «Блоки» that do not depend on the save: pieces, the board, placing and burning
// lines, the dealer (fair deal, difficulty, help, lucky dots, special cells, events), the daily
// pattern. Shared subset of JavaScript (screen: window.BlocksBoard; engine and node: require).
// Randomness only from the rng given (engine/rng.js), every number from cfg (config.json).
(function (root, make) {
  var api = make();
  if (typeof exports !== 'undefined') { for (var k in api) exports[k] = api[k]; } else { root.BlocksBoard = api; }
})(this, function () {
  'use strict';

  // ---- cells -------------------------------------------------------------------------------------
  // A cell is a number: 0 empty; otherwise the colour (1..15) in the low 4 bits and the kind in the
  // next two: 0 plain, 1 gold (+coins when burnt), 2 cracked (survives its first line), 3 lock
  // (an obstacle: not part of a full line, taken off when a neighbouring line burns).
  var PLAIN = 0;
  var GOLD = 1;
  var CRACKED = 2;
  var LOCK = 3;
  var LOCK_CELL = LOCK << 4;

  function colorOf(v) { return v & 15; }
  function kindOf(v) { return (v >> 4) & 3; }
  function make(color, kind) { return (color & 15) | ((kind || 0) << 4); }
  function isLock(v) { return v !== 0 && kindOf(v) === LOCK; }
  function solid(v) { return v !== 0 && kindOf(v) !== LOCK; }

  // ---- pieces --------------------------------------------------------------------------------------
  // Each type: its id (config weight `w.<id>`), the shapes it comes in, its colour. «big» types
  // are those of deal.bigFrom cells and more: their weight grows with the score.
  var TYPES = [
    { id: 'dot', color: 1, shapes: [[[0, 0]]] },
    { id: 'line2', color: 2, shapes: [[[0, 0], [0, 1]], [[0, 0], [1, 0]]] },
    { id: 'line3', color: 3, shapes: [[[0, 0], [0, 1], [0, 2]], [[0, 0], [1, 0], [2, 0]]] },
    { id: 'line4', color: 4, shapes: [[[0, 0], [0, 1], [0, 2], [0, 3]], [[0, 0], [1, 0], [2, 0], [3, 0]]] },
    { id: 'line5', color: 5, shapes: [[[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]], [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]]] },
    { id: 'corner3', color: 6, shapes: 'rot', base: [[0, 0], [1, 0], [1, 1]] },
    { id: 'corner4', color: 7, shapes: 'rot', base: [[0, 0], [1, 0], [2, 0], [2, 1]] },
    { id: 'bigcorner', color: 8, shapes: 'rot', base: [[0, 0], [1, 0], [2, 0], [2, 1], [2, 2]] },
    { id: 'sq2', color: 9, shapes: [[[0, 0], [0, 1], [1, 0], [1, 1]]] },
    { id: 'sq3', color: 10, shapes: [[[0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2], [2, 0], [2, 1], [2, 2]]] },
    { id: 't4', color: 11, shapes: 'rot', base: [[0, 0], [0, 1], [0, 2], [1, 1]] },
    { id: 'zig4', color: 12, shapes: [[[0, 1], [0, 2], [1, 0], [1, 1]], [[0, 0], [1, 0], [1, 1], [2, 1]],
      [[0, 0], [0, 1], [1, 1], [1, 2]], [[0, 1], [1, 0], [1, 1], [2, 0]]] },
    { id: 'cross', color: 13, shapes: [[[0, 1], [1, 0], [1, 1], [1, 2], [2, 1]]] },
    { id: 'diag', color: 14, shapes: [[[0, 0], [1, 1]], [[0, 1], [1, 0]]], rank: 2 }
  ];

  /** Cells moved to the top-left corner and sorted (row, column). */
  function normalize(cells) {
    var minR = Infinity;
    var minC = Infinity;
    cells.forEach(function (p) {
      if (p[0] < minR) minR = p[0];
      if (p[1] < minC) minC = p[1];
    });
    var out = cells.map(function (p) { return [p[0] - minR, p[1] - minC]; });
    out.sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
    return out;
  }

  /** A quarter turn clockwise: (r, c) -> (c, -r). */
  function rotate(cells) {
    return normalize(cells.map(function (p) { return [p[1], -p[0]]; }));
  }

  function key(cells) { return cells.map(function (p) { return p[0] + ':' + p[1]; }).join(','); }

  (function expand() {
    TYPES.forEach(function (t) {
      if (t.shapes !== 'rot') {
        t.shapes = t.shapes.map(normalize);
      } else {
        var list = [];
        var seen = {};
        var s = normalize(t.base);
        for (var i = 0; i < 4; i++) {
          if (!seen[key(s)]) {
            seen[key(s)] = true;
            list.push(s);
          }
          s = rotate(s);
        }
        t.shapes = list;
      }
      t.size = t.shapes[0].length;
    });
  })();

  function type(id) {
    for (var i = 0; i < TYPES.length; i++) if (TYPES[i].id === id) return TYPES[i];
    return null;
  }

  function size(piece) { return piece.c.length; }

  function bounds(cells) {
    var h = 0;
    var w = 0;
    cells.forEach(function (p) {
      if (p[0] + 1 > h) h = p[0] + 1;
      if (p[1] + 1 > w) w = p[1] + 1;
    });
    return { h: h, w: w };
  }

  /** A piece of a type: {t, c: cells, k: colour, s: specials per cell (when any)}. */
  function piece(t, shapeIndex) {
    var tp = typeof t === 'string' ? type(t) : t;
    var shape = tp.shapes[shapeIndex % tp.shapes.length];
    return { t: tp.id, c: shape.map(function (p) { return [p[0], p[1]]; }), k: tp.color };
  }

  function rotatePiece(p) {
    var out = { t: p.t, c: [], k: p.k };
    // The specials follow their cells through the turn.
    var turned = p.c.map(function (q, i) { return { r: q[1], c: -q[0], s: p.s ? p.s[i] : 0 }; });
    var minR = Infinity;
    var minC = Infinity;
    turned.forEach(function (q) {
      if (q.r < minR) minR = q.r;
      if (q.c < minC) minC = q.c;
    });
    turned.forEach(function (q) {
      q.r -= minR;
      q.c -= minC;
    });
    turned.sort(function (a, b) { return a.r - b.r || a.c - b.c; });
    out.c = turned.map(function (q) { return [q.r, q.c]; });
    if (p.s) out.s = turned.map(function (q) { return q.s; });
    return out;
  }

  function connected(cells) {
    if (!cells.length) return false;
    var set = {};
    cells.forEach(function (p) { set[p[0] + ':' + p[1]] = true; });
    var seen = {};
    var stack = [cells[0]];
    seen[cells[0][0] + ':' + cells[0][1]] = true;
    var n = 0;
    while (stack.length) {
      var p = stack.pop();
      n++;
      // Diagonal pieces are one piece too: the eight neighbours count.
      for (var dr = -1; dr <= 1; dr++) {
        for (var dc = -1; dc <= 1; dc++) {
          var k = (p[0] + dr) + ':' + (p[1] + dc);
          if (set[k] && !seen[k]) {
            seen[k] = true;
            stack.push([p[0] + dr, p[1] + dc]);
          }
        }
      }
    }
    return n === cells.length;
  }

  /**
   * The cutter: a piece in two connected parts, as even as it goes (cut across rows first, then
   * columns, then one end cell off). null for a single cell.
   */
  function cut(p) {
    var n = p.c.length;
    if (n < 2) return null;
    var items = p.c.map(function (q, i) { return { q: q, s: p.s ? p.s[i] : 0 }; });
    var orders = [
      items.slice().sort(function (a, b) { return a.q[0] - b.q[0] || a.q[1] - b.q[1]; }),
      items.slice().sort(function (a, b) { return a.q[1] - b.q[1] || a.q[0] - b.q[0]; })
    ];
    var best = null;
    orders.forEach(function (list) {
      for (var k = 1; k < n; k++) {
        var a = list.slice(0, k);
        var b = list.slice(k);
        if (!connected(a.map(function (x) { return x.q; })) || !connected(b.map(function (x) { return x.q; }))) continue;
        var score = Math.abs(a.length - b.length);
        if (!best || score < best.score) best = { score: score, a: a, b: b };
      }
    });
    if (!best) {
      for (var i = 0; i < n && !best; i++) {
        var rest = items.filter(function (x, j) { return j !== i; });
        if (connected(rest.map(function (x) { return x.q; }))) best = { a: [items[i]], b: rest };
      }
    }
    if (!best) return null;
    function part(list) {
      var cells = normalize(list.map(function (x) { return x.q; }));
      var minR = Infinity;
      var minC = Infinity;
      list.forEach(function (x) {
        if (x.q[0] < minR) minR = x.q[0];
        if (x.q[1] < minC) minC = x.q[1];
      });
      var out = { t: p.t, c: cells, k: p.k, cut: true };
      if (p.s) {
        var at = {};
        list.forEach(function (x) { at[(x.q[0] - minR) + ':' + (x.q[1] - minC)] = x.s; });
        out.s = cells.map(function (q) { return at[q[0] + ':' + q[1]] || 0; });
      }
      return out;
    }
    return [part(best.a), part(best.b)];
  }

  // ---- the board ------------------------------------------------------------------------------------

  function empty(n) {
    var cells = [];
    for (var i = 0; i < n * n; i++) cells.push(0);
    return cells;
  }

  function sideOf(cells) { return Math.round(Math.sqrt(cells.length)); }

  function fits(cells, p, r0, c0) {
    var n = sideOf(cells);
    if (!p || !p.c || !p.c.length || r0 % 1 !== 0 || c0 % 1 !== 0) return false;
    for (var i = 0; i < p.c.length; i++) {
      var r = r0 + p.c[i][0];
      var c = c0 + p.c[i][1];
      if (r < 0 || c < 0 || r >= n || c >= n) return false;
      if (cells[r * n + c] !== 0) return false;
    }
    return true;
  }

  /** Every place a piece fits: [[r, c], …]. */
  function places(cells, p) {
    var n = sideOf(cells);
    var b = bounds(p.c);
    var out = [];
    for (var r = 0; r + b.h <= n; r++) {
      for (var c = 0; c + b.w <= n; c++) if (fits(cells, p, r, c)) out.push([r, c]);
    }
    return out;
  }

  function anyFit(cells, p) {
    var n = sideOf(cells);
    var b = bounds(p.c);
    for (var r = 0; r + b.h <= n; r++) {
      for (var c = 0; c + b.w <= n; c++) if (fits(cells, p, r, c)) return true;
    }
    return false;
  }

  function filled(cells) {
    var k = 0;
    for (var i = 0; i < cells.length; i++) if (cells[i] !== 0) k++;
    return k;
  }

  /** The rows and columns that are full (every cell solid; a lock keeps its line open). */
  function fullLines(cells) {
    var n = sideOf(cells);
    var rows = [];
    var cols = [];
    for (var r = 0; r < n; r++) {
      var ok = true;
      for (var c = 0; c < n && ok; c++) if (!solid(cells[r * n + c])) ok = false;
      if (ok) rows.push(r);
    }
    for (var c2 = 0; c2 < n; c2++) {
      var ok2 = true;
      for (var r2 = 0; r2 < n && ok2; r2++) if (!solid(cells[r2 * n + c2])) ok2 = false;
      if (ok2) cols.push(c2);
    }
    return { rows: rows, cols: cols };
  }

  /** The lines that would burn if the piece were put at (r0, c0) — for the highlight. */
  function wouldBurn(cells, p, r0, c0) {
    var n = sideOf(cells);
    var copy = cells.slice();
    p.c.forEach(function (q) { copy[(r0 + q[0]) * n + c0 + q[1]] = 1; });
    return fullLines(copy);
  }

  /**
   * Burns the full lines of the board in place, all at once: a cell in two burning lines counts
   * once; a cracked cell in one line only cracks off (turns plain), in two it goes; locks next to
   * a burnt line come off. Returns {rows, cols, lines, cells, gold, mono, colors: [per cell]}.
   */
  function burn(cells) {
    var n = sideOf(cells);
    var full = fullLines(cells);
    var out = { rows: full.rows, cols: full.cols, lines: full.rows.length + full.cols.length, cells: 0, gold: 0, mono: 0, burnt: [] };
    if (!out.lines) return out;
    var hits = {};
    function mono(list) {
      var color = -1;
      for (var i = 0; i < list.length; i++) {
        var v = colorOf(cells[list[i]]);
        if (color < 0) color = v;
        else if (v !== color) return false;
      }
      return true;
    }
    full.rows.forEach(function (r) {
      var list = [];
      for (var c = 0; c < n; c++) {
        list.push(r * n + c);
        hits[r * n + c] = (hits[r * n + c] || 0) + 1;
      }
      if (mono(list)) out.mono++;
    });
    full.cols.forEach(function (c) {
      var list = [];
      for (var r = 0; r < n; r++) {
        list.push(r * n + c);
        hits[r * n + c] = (hits[r * n + c] || 0) + 1;
      }
      if (mono(list)) out.mono++;
    });
    for (var i in hits) {
      var at = Number(i);
      var v = cells[at];
      if (kindOf(v) === CRACKED && hits[i] < 2) {
        cells[at] = make(colorOf(v), PLAIN);
        continue;
      }
      if (kindOf(v) === GOLD) out.gold++;
      cells[at] = 0;
      out.cells++;
      out.burnt.push(at);
    }
    // Locks beside a burnt line.
    full.rows.forEach(function (r) {
      [r - 1, r + 1].forEach(function (rr) {
        if (rr < 0 || rr >= n) return;
        for (var c = 0; c < n; c++) if (isLock(cells[rr * n + c])) cells[rr * n + c] = 0;
      });
    });
    full.cols.forEach(function (c) {
      [c - 1, c + 1].forEach(function (cc) {
        if (cc < 0 || cc >= n) return;
        for (var r = 0; r < n; r++) if (isLock(cells[r * n + cc])) cells[r * n + cc] = 0;
      });
    });
    return out;
  }

  /** Puts the piece and burns what is full: the burn report plus {placed}. Throws when it does not fit. */
  function put(cells, p, r0, c0) {
    if (!fits(cells, p, r0, c0)) throw new Error('фигура сюда не встаёт');
    var n = sideOf(cells);
    p.c.forEach(function (q, i) { cells[(r0 + q[0]) * n + c0 + q[1]] = make(p.k, p.s ? p.s[i] : 0); });
    var out = burn(cells);
    out.placed = p.c.length;
    return out;
  }

  /** Points for L lines at once: 1 → 10, 2 → 30, 3 → 60, 4 → 100, 5+ → 100 + 50 × (L − 4). */
  function linePoints(lines, cfg) {
    if (lines <= 0) return 0;
    var table = [0, cfg['score.l1'], cfg['score.l2'], cfg['score.l3'], cfg['score.l4']];
    if (lines <= 4) return table[lines];
    return cfg['score.l4'] + cfg['score.lMore'] * (lines - 4);
  }

  /** Clears a square (the bomb) — cells within the board; returns how many went. */
  function clearArea(cells, r0, c0, r1, c1) {
    var n = sideOf(cells);
    var k = 0;
    for (var r = Math.max(0, r0); r <= Math.min(n - 1, r1); r++) {
      for (var c = Math.max(0, c0); c <= Math.min(n - 1, c1); c++) {
        if (cells[r * n + c] !== 0) k++;
        cells[r * n + c] = 0;
      }
    }
    return k;
  }

  // ---- the dealer ---------------------------------------------------------------------------------

  function typesFor(o) {
    return TYPES.filter(function (t) { return !t.rank || (o.rank || 1) >= t.rank; });
  }

  /** The weight of a type now: `w.<id>`, the big ones grown by the score up to deal.growMax. */
  function weight(t, cfg, score) {
    var w = Number(cfg['w.' + t.id]) || 0;
    if (t.size >= cfg['deal.bigFrom']) w *= Math.min(cfg['deal.growMax'], 1 + (score || 0) / cfg['deal.growScore']);
    return w;
  }

  function randomPiece(rng, cfg, o, list) {
    var types = list || typesFor(o);
    var t = rng.weighted(types, function (x) { return weight(x, cfg, o.score); });
    if (!t) t = types[0] || type('dot');
    return piece(t, rng.int(t.shapes.length));
  }

  function dressPiece(p, rng, o) {
    // Special cells (the master's rank and up): gold and cracked; a golden deal makes them all gold.
    if (o.allGold) {
      p.s = p.c.map(function () { return GOLD; });
      return p;
    }
    if (!o.specials) return p;
    var any = false;
    var s = p.c.map(function () {
      if (rng.chance(o.gold)) {
        any = true;
        return GOLD;
      }
      if (rng.chance(o.cracked)) {
        any = true;
        return CRACKED;
      }
      return PLAIN;
    });
    if (any) p.s = s;
    return p;
  }

  /**
   * Three pieces: o = {score, rank, dot, specials, gold, cracked, heavy, allGold}. Heavy deals
   * take big types only. No fairness here — see deal().
   */
  function draw(rng, cfg, o) {
    var list = typesFor(o);
    if (o.heavy) list = list.filter(function (t) { return t.size >= cfg['deal.bigFrom']; });
    else if (o.opening) list = list.filter(function (t) { return t.size <= cfg['deal.openingMaxCells']; });
    var out = [];
    for (var i = 0; i < 3; i++) out.push(dressPiece(randomPiece(rng, cfg, o.heavy ? { score: o.score } : o, list), rng, o));
    // Lucky is one chance per hand, not one chance for each of its three pieces.
    if (!o.heavy && o.dot > 0 && rng.chance(o.dot)) out[rng.int(3)] = dressPiece(piece('dot', 0), rng, o);
    return out;
  }

  function fitsAnywhere(boards, p) {
    for (var i = 0; i < boards.length; i++) if (anyFit(boards[i], p)) return true;
    return false;
  }

  function fillOf(boards) {
    var f = 0;
    var all = 0;
    boards.forEach(function (b) {
      f += filled(b);
      all += b.length;
    });
    return all ? f / all : 0;
  }

  /** Bounded search for placing the whole visible hand, in any order, with normal line clears.
   * A legal first move alone does not make a hand playable (three 3x3 squares can share one gap).
   * This extra check is used only during the configurable short opening of a normal game.
   */
  function handFits(boards, pieces, budget) {
    var left = Math.max(1, budget || 20000);
    function search(fields, remaining) {
      if (!remaining.length) return true;
      if (remaining.length === 1) return fitsAnywhere(fields, remaining[0]);
      for (var i = 0; i < remaining.length; i++) {
        var rest = remaining.slice();
        rest.splice(i, 1);
        for (var f = 0; f < fields.length; f++) {
          var spots = places(fields[f], remaining[i]);
          for (var j = 0; j < spots.length; j++) {
            if (--left < 0) return false;
            var next = fields.slice();
            next[f] = fields[f].slice();
            put(next[f], remaining[i], spots[j][0], spots[j][1]);
            if (search(next, rest)) return true;
          }
        }
      }
      return false;
    }
    return search(boards, pieces.filter(function (p) { return !!p; }));
  }

  /**
   * A fair deal for the boards: at least one of the three fits somewhere, redrawn up to
   * deal.fairTries times, otherwise as it is (then it is an honest end). With help on and the
   * boards fuller than help.fill, one piece is chosen among those that fit. Returns {pieces,
   * tries, helped, fair}.
   */
  function deal(rng, cfg, boards, o) {
    var pieces = null;
    var tries = 0;
    var fair = false;
    var max = Math.max(1, cfg['deal.fairTries']);
    for (tries = 0; tries < max; tries++) {
      pieces = draw(rng, cfg, o);
      fair = o.opening ? handFits(boards, pieces, cfg['deal.openingBudget'])
        : pieces.some(function (p) { return fitsAnywhere(boards, p); });
      if (fair) break;
    }
    var helped = false;
    if (!o.opening && cfg['help.on'] && fillOf(boards) > cfg['help.fill']) {
      var fitting = [];
      typesFor(o).forEach(function (t) {
        if (o.heavy && t.size < cfg['deal.bigFrom']) return;
        t.shapes.forEach(function (s, i) {
          var p = piece(t, i);
          if (fitsAnywhere(boards, p)) fitting.push({ p: p, w: weight(t, cfg, o.score) / t.shapes.length });
        });
      });
      if (fitting.length) {
        var chosen = rng.weighted(fitting, 'w');
        if (!chosen) chosen = fitting[0];
        var slot = rng.int(3);
        pieces[slot] = dressPiece(chosen.p, rng, o);
        helped = true;
        fair = true;
      }
    }
    return { pieces: pieces, tries: tries, helped: helped, fair: fair };
  }

  // ---- the daily task -----------------------------------------------------------------------------

  /**
   * The board of the day: a pattern of locks and gold cells, mirrored for a pleasant look, by the
   * date's seed; the target score. Same date — same board. {cells, target, seed}.
   */
  function dailyBoard(rng, cfg, n) {
    var cells = empty(n);
    var half = Math.ceil(n / 2);
    var locks = cfg['daily.locks'];
    var gold = cfg['daily.gold'];
    var guard = 0;
    function mirror(r, c, v) {
      cells[r * n + c] = v;
      cells[r * n + (n - 1 - c)] = v;
    }
    var placed = 0;
    while (placed < locks && guard++ < 500) {
      var r = rng.int(n);
      var c = rng.int(half);
      if (cells[r * n + c] !== 0) continue;
      mirror(r, c, LOCK_CELL);
      placed += c === n - 1 - c ? 1 : 2;
    }
    placed = 0;
    guard = 0;
    while (placed < gold && guard++ < 500) {
      var r2 = rng.int(n);
      var c2 = rng.int(half);
      if (cells[r2 * n + c2] !== 0) continue;
      mirror(r2, c2, make(15, GOLD));
      placed += c2 === n - 1 - c2 ? 1 : 2;
    }
    // A pattern must not hold a full line at the start.
    burn(cells);
    var spread = Math.max(0, Math.round(cfg['daily.spread'] / 50));
    return { cells: cells, target: cfg['daily.target'] + 50 * rng.int(spread + 1) };
  }

  return {
    PLAIN: PLAIN, GOLD: GOLD, CRACKED: CRACKED, LOCK: LOCK, LOCK_CELL: LOCK_CELL, TYPES: TYPES,
    colorOf: colorOf, kindOf: kindOf, make: make, isLock: isLock, solid: solid,
    normalize: normalize, rotate: rotate, rotatePiece: rotatePiece, type: type, piece: piece, size: size, bounds: bounds,
    connected: connected, cut: cut,
    empty: empty, sideOf: sideOf, fits: fits, places: places, anyFit: anyFit, filled: filled, fullLines: fullLines,
    wouldBurn: wouldBurn, burn: burn, put: put, linePoints: linePoints, clearArea: clearArea,
    typesFor: typesFor, weight: weight, draw: draw, deal: deal, fitsAnywhere: fitsAnywhere, fillOf: fillOf, handFits: handFits,
    dailyBoard: dailyBoard
  };
});
