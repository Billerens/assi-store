// The challenges of «Блоки»: a given board and a given queue of pieces, the board must end empty.
// The generator builds a level backwards: it starts from the empty board and "takes out" pieces
// of lines that will burn (a step with a burn) or of what lies on the board (a plain step); then a
// depth-first search proves there is a solution and counts them (fewer — harder). The levels in
// content/challenges.json were made by tools/gen-challenges.js with this file; a level is fully
// given by its seed and parameters, so the phone can make the same one again.
// Shared subset of JavaScript (screen: window.BlocksLevels; engine and node: require).
(function (root, make) {
  var node = typeof require === 'function' && typeof exports !== 'undefined';
  var api = node ? make(require('../engine/rng.js'), require('./board.js')) : make(root.Rng, root.BlocksBoard);
  if (typeof exports !== 'undefined') { for (var k in api) exports[k] = api[k]; } else { root.BlocksLevels = api; }
})(this, function (Rng, B) {
  'use strict';

  var GIVEN = 15;

  function popcount(x) {
    var k = 0;
    while (x) {
      x &= x - 1;
      k++;
    }
    return k;
  }

  /** A piece as row masks: {h, w, rows: [mask per row], size}. */
  function compile(p) {
    var b = B.bounds(p.c);
    var rows = [];
    for (var r = 0; r < b.h; r++) rows.push(0);
    p.c.forEach(function (q) { rows[q[0]] |= 1 << q[1]; });
    return { h: b.h, w: b.w, rows: rows, size: p.c.length };
  }

  function rowsOf(cells, n) {
    var rows = [];
    for (var r = 0; r < n; r++) {
      var m = 0;
      for (var c = 0; c < n; c++) if (cells[r * n + c] !== 0) m |= 1 << c;
      rows.push(m);
    }
    return rows;
  }

  /** Burns full rows and columns at once, in place; returns how many lines. */
  function burnRows(rows, n) {
    var full = (1 << n) - 1;
    var cols = full;
    var lines = 0;
    var r;
    for (r = 0; r < n; r++) cols &= rows[r];
    for (r = 0; r < n; r++) {
      if (rows[r] === full) {
        rows[r] = 0;
        lines++;
      }
    }
    if (cols) {
      for (r = 0; r < n; r++) rows[r] &= ~cols;
      lines += popcount(cols);
    }
    return lines;
  }

  function fullCount(rows, n) {
    var full = (1 << n) - 1;
    var cols = full;
    var k = 0;
    for (var r = 0; r < n; r++) {
      cols &= rows[r];
      if (rows[r] === full) k++;
    }
    return k + popcount(cols);
  }

  var POP = [];
  (function () {
    for (var i = 0; i < 512; i++) POP.push(popcount(i));
  })();

  /**
   * The fewest cells that still have to be put for the board to end empty: every filled cell burns
   * with its row or its column, so some set of rows burns and the columns of every other filled
   * cell burn; the empty cells of those lines (crossings once) have to be filled. Exact over the
   * subsets of the rows that hold something (at most 2^9).
   */
  function coverCost(rows, n, enough) {
    var full = (1 << n) - 1;
    var used = [];
    for (var r = 0; r < n; r++) if (rows[r]) used.push(r);
    var u = used.length;
    if (!u) return 0;
    var best = 0;
    for (var occupied = 0; occupied < u; occupied++) best += n - POP[rows[used[occupied]]];
    if (best <= enough) return best;
    var subsets = 1 << u;
    // Build the unions once. For each set of selected rows, the columns of every other occupied
    // row have to clear. Missing cells in selected rows are an immediate lower bound.
    var unions = [0];
    var missing = [0];
    var indexOfBit = {};
    for (var initial = 0; initial < u; initial++) indexOfBit[1 << initial] = initial;
    for (var subset = 1; subset < subsets; subset++) {
      var low = subset & -subset;
      var rest = subset ^ low;
      var source = rows[used[indexOfBit[low]]];
      unions[subset] = unions[rest] | source;
      missing[subset] = missing[rest] + n - POP[source];
    }
    for (var s = 0; s < subsets; s++) {
      var unchosen = (subsets - 1) ^ s;
      var cols = unions[unchosen];
      var cost = missing[s] + (n - u) * POP[cols];
      while (unchosen && cost < best) {
        var bit = unchosen & -unchosen;
        cost += POP[~rows[used[indexOfBit[bit]]] & cols & full];
        unchosen ^= bit;
      }
      if (cost < best) best = cost;
      if (best <= enough) return best;
    }
    return best;
  }

  function filledOf(rows) {
    var k = 0;
    for (var r = 0; r < rows.length; r++) k += POP[rows[r]];
    return k;
  }

  /** Can the board still end empty with `remain` more cells (see coverCost)? */
  function feasible(rows, n, remain) {
    return coverCost(rows, n, remain) <= remain;
  }

  /**
   * Depth-first search over the queue in order: {solutions (capped at o.limit), first: [[r, c] per
   * piece] or null, nodes, complete: false when the node budget or solution limit was reached}.
   * `solutions` is exact only when `complete`; `capped` distinguishes a lower bound from a timeout.
   */
  function solve(level, o) {
    o = o || {};
    var limit = Math.max(1, Math.floor(o.limit || 1));
    var budget = Math.max(1, Math.floor(o.budget || 2000000));
    var n = level.n;
    var pieces = level.queue.map(compile);
    var k = pieces.length;
    var remain = [];
    var sum = 0;
    for (var i = k - 1; i >= 0; i--) {
      sum += pieces[i].size;
      remain[i] = sum;
    }
    remain[k] = 0;
    var memo = {};
    var nodes = 0;
    var aborted = false;
    var capped = false;
    var path = [];
    var first = null;

    function rec(rows, i) {
      if (i === k) {
        for (var r = 0; r < n; r++) if (rows[r]) return 0;
        if (!first) first = path.slice();
        return 1;
      }
      if (aborted) return 0;
      if (++nodes > budget) {
        aborted = true;
        return 0;
      }
      var key = rows.join(',') + '/' + i;
      if (memo[key] !== undefined) return memo[key];
      if (!feasible(rows, n, remain[i])) return 0;
      var p = pieces[i];
      var total = 0;
      // The moves that burn go first: a solution is mostly found among them.
      var moves = [];
      for (var r0 = 0; r0 + p.h <= n; r0++) {
        for (var c0 = 0; c0 + p.w <= n; c0++) {
          var ok = true;
          for (var dr = 0; dr < p.h; dr++) {
            if (rows[r0 + dr] & (p.rows[dr] << c0)) {
              ok = false;
              break;
            }
          }
          if (!ok) continue;
          var next = rows.slice();
          for (var d2 = 0; d2 < p.h; d2++) next[r0 + d2] |= p.rows[d2] << c0;
          var burnt = burnRows(next, n);
          if (!feasible(next, n, remain[i + 1])) continue;
          moves.push({ rows: next, r: r0, c: c0, burnt: burnt, cost: filledOf(next) });
        }
      }
      moves.sort(function (a, b) { return b.burnt - a.burnt || a.cost - b.cost; });
      for (var j = 0; j < moves.length && total < limit; j++) {
        path.push([moves[j].r, moves[j].c]);
        total += rec(moves[j].rows, i + 1);
        path.pop();
        if (aborted) return total;
      }
      if (total >= limit) {
        capped = true;
        total = limit;
      }
      memo[key] = total;
      return total;
    }

    var solutions = rec(rowsOf(level.board, n), 0);
    return { solutions: Math.min(solutions, limit), first: first, nodes: nodes, complete: !aborted && !capped, capped: capped, aborted: aborted };
  }

  /** Plays a level's moves ([[r, c] …]) by the full rules (board.js): true when the board ends empty. */
  function check(level, moves) {
    if (!moves || moves.length !== level.queue.length) return false;
    var cells = level.board.slice();
    for (var i = 0; i < level.queue.length; i++) {
      var m = moves[i];
      if (!m || !B.fits(cells, level.queue[i], m[0], m[1])) return false;
      B.put(cells, level.queue[i], m[0], m[1]);
    }
    return B.filled(cells) === 0;
  }

  // ---- the generator (backwards) -------------------------------------------------------------------

  var DEFAULTS = { n: 8, k: 4, clear: 0.55, two: 0.25, plainTries: 12, reverseTries: 24,
    types: ['dot', 'line2', 'line3', 'line4', 'line5', 'corner3', 'corner4', 'bigcorner', 'sq2', 't4', 'zig4', 'cross'] };

  function params(o) {
    var out = {};
    for (var key in DEFAULTS) out[key] = o && o[key] !== undefined ? o[key] : DEFAULTS[key];
    out.types = out.types.slice();
    return out;
  }

  /** Current settings for creating new levels; saved catalogue entries keep their own parameters. */
  function fromConfig(cfg) {
    return params({ k: cfg['challenge.pieces'], clear: cfg['challenge.clear'], two: cfg['challenge.two'],
      plainTries: cfg['challenge.plainTries'], reverseTries: cfg['challenge.reverseTries'] });
  }

  function shapesOf(types) {
    var list = [];
    types.forEach(function (id) {
      var t = B.type(id);
      t.shapes.forEach(function (s, i) { list.push({ t: t, i: i }); });
    });
    return list;
  }

  function placedRows(p, r0, c0, n) {
    var rows = [];
    for (var r = 0; r < n; r++) rows.push(0);
    p.rows.forEach(function (m, dr) { rows[r0 + dr] |= m << c0; });
    return rows;
  }

  /** A piece somewhere inside the mask `within` (every cell of it in the mask), meeting `need`(rows). */
  function fitInside(rng, shapes, within, n, need, tries) {
    for (var t = 0; t < tries; t++) {
      var s = rng.pick(shapes);
      var p = B.piece(s.t, s.i);
      var cp = compile(p);
      var spots = [];
      for (var r0 = 0; r0 + cp.h <= n; r0++) {
        for (var c0 = 0; c0 + cp.w <= n; c0++) {
          var ok = true;
          for (var dr = 0; dr < cp.h && ok; dr++) {
            var m = cp.rows[dr] << c0;
            if ((within[r0 + dr] & m) !== m) ok = false;
          }
          if (ok && need(placedRows(cp, r0, c0, n))) spots.push([r0, c0]);
        }
      }
      if (spots.length) {
        var at = rng.pick(spots);
        return { piece: p, compiled: cp, r: at[0], c: at[1] };
      }
    }
    return null;
  }

  /**
   * One level from a seed: {seed, n, k, clear, two, types, board, queue, moves} — `moves` is the
   * planned solution (the order of the queue). null when this seed does not give one.
   */
  function generate(seed, o) {
    var pr = params(o);
    var n = pr.n;
    if (n < 2 || n > 9 || n !== Math.floor(n) || pr.k < 1 || pr.k !== Math.floor(pr.k)) return null;
    if (!pr.types.length || pr.types.some(function (id) { return !B.type(id); })) return null;
    var full = (1 << n) - 1;
    var rng = Rng.make(seed);
    var shapes = shapesOf(pr.types);
    var after = [];
    var r;
    for (r = 0; r < n; r++) after.push(0);
    var queue = [];
    var moves = [];
    for (var step = 0; step < pr.k; step++) {
      var done = null;
      var plain = step > 0 && !rng.chance(pr.clear);
      if (plain) {
        // A plain step: the piece lies wholly on what is filled after it.
        done = fitInside(rng, shapes, after, n, function () { return true; }, pr.plainTries);
        if (done) {
          for (r = 0; r < n; r++) after[r] &= ~placedRows(done.compiled, done.r, done.c, n)[r];
        }
      }
      if (!done) {
        // A step with a burn: lines empty after the move were full right at it.
        var rowsFree = [];
        var colsFree = [];
        var colUsed = 0;
        for (r = 0; r < n; r++) {
          colUsed |= after[r];
          if (!after[r]) rowsFree.push(r);
        }
        for (var c = 0; c < n; c++) if (!(colUsed & (1 << c))) colsFree.push(c);
        var lines = [];
        rowsFree.forEach(function (x) { lines.push(['r', x]); });
        colsFree.forEach(function (x) { lines.push(['c', x]); });
        if (!lines.length) return null;
        var count = rng.chance(pr.two) && lines.length > 1 ? 2 : 1;
        rng.shuffle(lines);
        var chosen = lines.slice(0, count);
        var union = after.slice();
        chosen.forEach(function (l) {
          if (l[0] === 'r') union[l[1]] = full;
          else for (var rr = 0; rr < n; rr++) union[rr] |= 1 << l[1];
        });
        // Exactly these lines are full at the move — none other.
        if (fullCount(union, n) !== chosen.length) return null;
        done = fitInside(rng, shapes, union, n, function (placed) {
          return chosen.every(function (l) {
            if (l[0] === 'r') return placed[l[1]] !== 0;
            for (var rr = 0; rr < n; rr++) if (placed[rr] & (1 << l[1])) return true;
            return false;
          });
        }, pr.reverseTries);
        if (!done) return null;
        var placedMask = placedRows(done.compiled, done.r, done.c, n);
        for (r = 0; r < n; r++) after[r] = union[r] & ~placedMask[r];
      }
      queue.unshift(done.piece);
      moves.unshift([done.r, done.c]);
    }
    var cells = [];
    for (r = 0; r < n; r++) for (var c2 = 0; c2 < n; c2++) cells.push(after[r] & (1 << c2) ? B.make(GIVEN, B.PLAIN) : 0);
    if (!B.filled(cells) || B.fullLines(cells).rows.length || B.fullLines(cells).cols.length) return null;
    var level = { seed: seed, n: n, k: pr.k, clear: pr.clear, two: pr.two, plainTries: pr.plainTries, reverseTries: pr.reverseTries,
      types: pr.types, board: cells, queue: queue, moves: moves };
    if (!check(level, moves)) return null;
    return level;
  }

  /**
   * A level that passed the check: generate(seed, o), then the depth-first search must find a
   * solution within o.budget nodes (so the phone verifies it in a moment). The level gets
   * `found` (the search's own solution) and `nodes`. null otherwise.
   */
  function makeLevel(seed, o) {
    var level = generate(seed, o);
    if (!level) return null;
    var r = solve(level, { limit: 1, budget: (o && o.budget) || 1500 });
    if (!r.solutions || !check(level, r.first)) return null;
    level.found = r.first;
    level.nodes = r.nodes;
    return level;
  }

  /** The difficulty: more pieces and fewer solutions — harder. */
  function difficulty(k, solutions, limit) {
    return Math.round((k + Math.log(limit / Math.max(1, solutions)) / Math.LN2) * 100) / 100;
  }

  return {
    GIVEN: GIVEN, compile: compile, rowsOf: rowsOf, burnRows: burnRows, feasible: feasible, solve: solve, check: check,
    generate: generate, makeLevel: makeLevel, params: params, fromConfig: fromConfig, difficulty: difficulty, DEFAULTS: DEFAULTS
  };
});
