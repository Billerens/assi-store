// The fields of «Сапёр-рогалик»: a generator of fields that never need a guess and the solver
// that checks them by doing exactly what a person can do with the visible cells. Shared subset
// of JavaScript: the screen (window.MineBoard), the Web Worker that prepares fields ahead
// (importScripts), the engine (Rhino, require) and node all run this same file, so a field made
// from the same seed and the same first tap is the same everywhere.
//
// A field is two strings of w×h characters, index i = y·w + x:
//   m (mines):    '.' safe cell, 'h' hole (not a cell), '1' mine, '2' double mine (counts 2),
//                 'r' roaming mine, 'c' clock mine
//   t (features): '.' nothing, 'd' deaf (opened, the number hidden), 'e' earth hint (a safe
//                 cell the game marks where the solver got stuck), 'g' cache of gold, 'i' cache
//                 with a find, 'z' false cache, 'o' opened at the start («Осколок карты»)
//
// What the solver knows of a cell is a set of values it may still have — bit 1: 0 (safe),
// bit 2: 1 (a mine), bit 4: 2 (a double mine). The rules, in the order a person tries them:
//   simple — a number and its hidden neighbours: the values left either fit only one way or not;
//   pair   — the hidden neighbours of one number inside another's: the difference holds the rest;
//   border — a connected piece of the border up to enumLimit cells is tried in every way, a cell
//            that is the same in all of them is known;
//   count  — at the end the number of mines (and of double mines) on the field decides.
// The budget of the work is counted in steps of the search, not in milliseconds, so the result
// does not depend on how fast the phone is.
(function (root, make) {
  var node = typeof require === 'function' && typeof exports !== 'undefined';
  var api = node ? make(require('../../engine/rng.js')) : make(root.Rng);
  if (typeof exports !== 'undefined') { for (var k in api) exports[k] = api[k]; }
  else { root.MineBoard = api; root.MinesBoard = api; }
})(this, function (Rng) {
  'use strict';

  // ---- cells -------------------------------------------------------------------------------------

  var AROUND = {};
  var WINDOWS = {};
  // Larger than the maximum accepted field, so adding component counts cannot carry doubles
  // into the mine count even with unusually dense owner-configured fields.
  var COUNT_BASE = 2048;

  /** The neighbours of every cell of a w×h field: [[i, …], …] (cached). */
  function around(w, h) {
    var key = w + 'x' + h;
    if (AROUND[key]) return AROUND[key];
    var out = [];
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var list = [];
        for (var dy = -1; dy <= 1; dy++) {
          for (var dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            var nx = x + dx;
            var ny = y + dy;
            if (nx >= 0 && ny >= 0 && nx < w && ny < h) list.push(ny * w + nx);
          }
        }
        out.push(list);
      }
    }
    AROUND[key] = out;
    return out;
  }

  function value(ch) { return ch === '2' ? 2 : ch === '1' || ch === 'r' || ch === 'c' ? 1 : 0; }
  function mined(ch) { return ch === '1' || ch === '2' || ch === 'r' || ch === 'c'; }

  function windows(w, h, radius) {
    var key = w + 'x' + h + ':' + radius;
    if (WINDOWS[key]) return WINDOWS[key];
    var lists = [];
    var r = Math.min(Math.max(w, h), Math.floor(radius));
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var cells = [];
        for (var ny = Math.max(0, y - r); ny <= Math.min(h - 1, y + r); ny++) {
          for (var nx = Math.max(0, x - r); nx <= Math.min(w - 1, x + r); nx++) cells.push(ny * w + nx);
        }
        lists.push(cells);
      }
    }
    WINDOWS[key] = lists;
    return lists;
  }

  // What a set of values contributes to a number: the sum of values, or (the boss «Наоборот»,
  // counted as mines = real neighbours − safe ones) the count of mines.
  var BITS = [1, 2, 4];
  var LO = { sum: [], cnt: [], dbl: [] };
  var HI = { sum: [], cnt: [], dbl: [] };
  (function () {
    for (var mask = 0; mask < 8; mask++) {
      var ls = 9;
      var hs = -1;
      var lc = 9;
      var hc = -1;
      var ld = 9;
      var hd = -1;
      for (var v = 0; v < 3; v++) {
        if (!(mask & BITS[v])) continue;
        ls = Math.min(ls, v);
        hs = Math.max(hs, v);
        lc = Math.min(lc, v > 0 ? 1 : 0);
        hc = Math.max(hc, v > 0 ? 1 : 0);
        ld = Math.min(ld, v === 2 ? 1 : 0);
        hd = Math.max(hd, v === 2 ? 1 : 0);
      }
      LO.sum.push(ls);
      HI.sum.push(hs);
      LO.cnt.push(lc);
      HI.cnt.push(hc);
      LO.dbl.push(ld);
      HI.dbl.push(hd);
    }
  })();

  function single(mask) { return mask === 1 || mask === 2 || mask === 4; }
  function valueOf(mask) { return mask === 4 ? 2 : mask === 2 ? 1 : 0; }
  function contrib(v, mode) { return mode === 'cnt' ? (v > 0 ? 1 : 0) : mode === 'dbl' ? (v === 2 ? 1 : 0) : v; }

  /**
   * The model the solver works on: {w, h, n, m: [], t: [], sum: [], cnt: [], nb, inverse, dom,
   * M, D, safe}. info: {inverse, mines: M, doubles: D} — what the player is told about the field.
   */
  function model(w, h, m, t, info) {
    info = info || {};
    var n = w * h;
    var nb = around(w, h);
    var B = { w: w, h: h, n: n, m: [], t: [], sum: [], cnt: [], nb: nb, inverse: !!info.inverse,
      fog: !!info.fog, fogRadius: info.fogRadius === undefined ? 2 : Math.max(0, info.fogRadius),
      last: info.last === undefined ? -1 : info.last, M: 0, D: 0, safe: 0 };
    for (var i = 0; i < n; i++) {
      B.m.push(m.charAt(i));
      B.t.push(t ? t.charAt(i) || '.' : '.');
    }
    B.all = [];
    for (var cell = 0; cell < n; cell++) B.all.push(cell);
    B.windows = B.fog ? windows(w, h, B.fogRadius) : null;
    for (var c = 0; c < n; c++) {
      var s = 0;
      var k = 0;
      for (var j = 0; j < nb[c].length; j++) {
        var ch = B.m[nb[c][j]];
        s += value(ch);
        if (mined(ch)) k++;
      }
      B.sum.push(s);
      B.cnt.push(k);
      if (mined(B.m[c])) {
        B.M++;
        if (B.m[c] === '2') B.D++;
      } else if (B.m[c] !== 'h') B.safe++;
    }
    if (info.mines !== undefined) B.M = info.mines;
    if (info.doubles !== undefined) B.D = info.doubles;
    B.dom = B.D > 0 ? 7 : 3;
    return B;
  }

  // ---- what is known -----------------------------------------------------------------------------

  /** Nothing opened yet: every cell may be anything the field allows. */
  function blank(B) {
    var K = { open: [], mask: [], opened: 0, last: B.last };
    for (var i = 0; i < B.n; i++) {
      K.open.push(0);
      K.mask.push(B.t[i] === 'e' || B.t[i] === 'o' ? 1 : B.dom);
    }
    return K;
  }

  function copy(K) { return { open: K.open.slice(), mask: K.mask.slice(), opened: K.opened, last: K.last }; }

  /**
   * Opens a cell as the game does: a hole shows it is a hole, a cell with no mines around opens
   * its neighbours (a deaf one does not — it shows nothing). Returns how many cells opened.
   * K.open: 0 hidden, 1 an opened cell, 2 a hole seen, 3 a mine seen (stepped on).
   */
  function reveal(B, K, i) {
    if (i < 0 || i >= B.n || i !== Math.floor(i)) return 0;
    K.last = i;
    var stack = [i];
    var count = 0;
    while (stack.length) {
      var c = stack.pop();
      if (K.open[c]) continue;
      var ch = B.m[c];
      if (mined(ch)) continue;
      if (ch === 'h') {
        K.open[c] = 2;
        K.mask[c] = 1;
        count++;
        continue;
      }
      K.open[c] = 1;
      K.mask[c] = 1;
      K.opened++;
      count++;
      if (B.t[c] === 'd' || B.sum[c] !== 0) continue;
      var nb = B.nb[c];
      for (var j = 0; j < nb.length; j++) if (!K.open[nb[j]]) stack.push(nb[j]);
    }
    return count;
  }

  /**
   * What a person knows from the field as it is on the screen — vis: '-' hidden, 'f'/'F' a flag
   * (a belief, not knowledge), 'o' opened, 'H' a hole seen, 'x' a mine stepped on; known: extra
   * {i: mask} facts (earth hints and probes say «safe», a probe says «mine»).
   */
  function knowledge(B, vis, known) {
    var K = blank(B);
    for (var i = 0; i < B.n; i++) {
      var v = vis.charAt(i);
      if (v === 'o') {
        K.open[i] = 1;
        K.mask[i] = 1;
        K.opened++;
      } else if (v === 'H') {
        K.open[i] = 2;
        K.mask[i] = 1;
      } else if (v === 'x') {
        K.open[i] = 3;
        K.mask[i] = BITS[value(B.m[i])];
      }
    }
    for (var k in known || {}) {
      var c = Number(k);
      if (!K.open[c]) K.mask[c] = K.mask[c] & known[k] || K.mask[c];
    }
    return K;
  }

  function finished(B, K) { return K.opened >= B.safe; }

  // ---- the rules ---------------------------------------------------------------------------------

  /** The numbers on the screen with hidden neighbours: [{cells, t, mode}] (known values subtracted). */
  function constraints(B, K) {
    var list = [];
    var mode = B.inverse ? 'cnt' : 'sum';
    var visible = B.fog && K.last >= 0 ? B.windows[K.last] : B.all;
    for (var vi = 0; vi < visible.length; vi++) {
      var i = visible[vi];
      if (K.open[i] !== 1 || B.t[i] === 'd') continue;
      var t = B.inverse ? B.cnt[i] : B.sum[i];
      var cells = [];
      var nb = B.nb[i];
      for (var j = 0; j < nb.length; j++) {
        var c = nb[j];
        var mk = K.mask[c];
        if (single(mk)) t -= contrib(valueOf(mk), mode);
        else cells.push(c);
      }
      if (cells.length) list.push({ cells: cells, t: t, mode: mode, at: i });
    }
    return list;
  }

  /**
   * One number (or a difference of two) against the values its cells may have: each value of a
   * cell must leave the rest able to make the number. Returns -1 on a contradiction, else how many
   * masks it narrowed.
   */
  function tighten(K, cells, t, mode) {
    var lo = 0;
    var hi = 0;
    var L = LO[mode];
    var H = HI[mode];
    var i;
    for (i = 0; i < cells.length; i++) {
      lo += L[K.mask[cells[i]]];
      hi += H[K.mask[cells[i]]];
    }
    if (t < lo || t > hi) return -1;
    if (t !== lo && t !== hi && hi - lo < 2) return 0;
    var changed = 0;
    for (i = 0; i < cells.length; i++) {
      var c = cells[i];
      var mk = K.mask[c];
      if (single(mk)) continue;
      var restLo = lo - L[mk];
      var restHi = hi - H[mk];
      var next = 0;
      for (var v = 0; v < 3; v++) {
        if (!(mk & BITS[v])) continue;
        var left = t - contrib(v, mode);
        if (left >= restLo && left <= restHi) next |= BITS[v];
      }
      if (!next) return -1;
      if (next !== mk) {
        K.mask[c] = next;
        changed++;
        lo = restLo + L[next];
        hi = restHi + H[next];
      }
    }
    return changed;
  }

  /** The simple rule over every number until nothing changes: how many masks narrowed. */
  function simple(K, cons) {
    var total = 0;
    for (var round = 0; round < 64; round++) {
      var changed = 0;
      for (var i = 0; i < cons.length; i++) {
        var r = tighten(K, cons[i].cells, cons[i].t, cons[i].mode);
        if (r > 0) changed += r;
      }
      total += changed;
      if (!changed) break;
    }
    return total;
  }

  function contains(big, small) {
    for (var i = 0; i < small.length; i++) if (big.indexOf(small[i]) < 0) return false;
    return true;
  }

  /** The pair rule: the hidden cells of one number inside another's — the difference holds the rest. */
  function pairs(K, cons) {
    var by = {};
    var i;
    for (i = 0; i < cons.length; i++) {
      for (var j = 0; j < cons[i].cells.length; j++) {
        var c = cons[i].cells[j];
        (by[c] = by[c] || []).push(i);
      }
    }
    var changed = 0;
    for (i = 0; i < cons.length; i++) {
      var a = cons[i];
      var seen = {};
      var first = by[a.cells[0]] || [];
      for (var k = 0; k < first.length; k++) {
        var bi = first[k];
        if (bi === i || seen[bi]) continue;
        seen[bi] = true;
        var b = cons[bi];
        if (b.mode !== a.mode || b.cells.length <= a.cells.length || !contains(b.cells, a.cells)) continue;
        var rest = [];
        for (var x = 0; x < b.cells.length; x++) if (a.cells.indexOf(b.cells[x]) < 0) rest.push(b.cells[x]);
        var r = tighten(K, rest, b.t - a.t, a.mode);
        if (r > 0) changed += r;
      }
    }
    return changed;
  }

  /** The border split into pieces joined by numbers: [{cells, cons}] (cells with a mask of several values). */
  function pieces(K, cons) {
    var parent = {};
    function find(x) {
      while (parent[x] !== x) {
        parent[x] = parent[parent[x]];
        x = parent[x];
      }
      return x;
    }
    var i;
    var live = [];
    for (i = 0; i < cons.length; i++) {
      var cells = [];
      for (var j = 0; j < cons[i].cells.length; j++) if (!single(K.mask[cons[i].cells[j]])) cells.push(cons[i].cells[j]);
      var t = cons[i].t;
      for (var q = 0; q < cons[i].cells.length; q++) {
        var mk = K.mask[cons[i].cells[q]];
        if (single(mk)) t -= contrib(valueOf(mk), cons[i].mode);
      }
      if (!cells.length) continue;
      live.push({ cells: cells, t: t, mode: cons[i].mode });
      for (var c = 0; c < cells.length; c++) if (parent[cells[c]] === undefined) parent[cells[c]] = cells[c];
      for (var d = 1; d < cells.length; d++) {
        var ra = find(cells[0]);
        var rb = find(cells[d]);
        if (ra !== rb) parent[rb] = ra;
      }
    }
    var groups = {};
    var order = [];
    for (var key in parent) {
      var root = find(Number(key));
      if (!groups[root]) {
        groups[root] = { cells: [], cons: [] };
        order.push(root);
      }
      groups[root].cells.push(Number(key));
    }
    for (i = 0; i < live.length; i++) groups[find(live[i].cells[0])].cons.push(live[i]);
    var out = [];
    for (i = 0; i < order.length; i++) {
      var g = groups[order[i]];
      g.cells.sort(function (x, y) { return x - y; });
      out.push(g);
    }
    return out;
  }

  /**
   * Every way a piece of the border can be: per (mines, doubles) — the values each cell took.
   * {keys: {key: masks[]}, big: true when larger than the limit or over the budget}.
   * key = mines · COUNT_BASE + doubles.
   */
  function enumerate(K, piece, limit, work) {
    var cells = piece.cells;
    if (cells.length > limit) return { big: true };
    var nc = piece.cons.length;
    var countMode = true;
    for (var modeIndex = 0; modeIndex < nc; modeIndex++) if (piece.cons[modeIndex].mode !== 'cnt') countMode = false;
    var at = {};
    var i;
    for (i = 0; i < cells.length; i++) at[cells[i]] = i;
    // The order of trying: along the numbers, so a wrong start shows up early.
    var order = [];
    var placed = {};
    for (i = 0; i < nc; i++) {
      var cs = piece.cons[i].cells;
      for (var j = 0; j < cs.length; j++) {
        if (!placed[cs[j]]) {
          placed[cs[j]] = true;
          order.push(at[cs[j]]);
        }
      }
    }
    var of = [];
    for (i = 0; i < cells.length; i++) of.push([]);
    var sum = [];
    var lo = [];
    var hi = [];
    for (i = 0; i < nc; i++) {
      var con = piece.cons[i];
      sum.push(0);
      var l = 0;
      var h = 0;
      for (var q = 0; q < con.cells.length; q++) {
        var mk = K.mask[con.cells[q]];
        l += LO[con.mode][mk];
        h += HI[con.mode][mk];
        of[at[con.cells[q]]].push(i);
      }
      lo.push(l);
      hi.push(h);
    }
    var val = [];
    for (i = 0; i < cells.length; i++) val.push(-1);
    var keys = {};
    var count = 0;
    // The limit is per piece; work.nodes keeps counting the whole effort.
    var stop = work.nodes + (work.limit || 50000);
    var big = false;

    function record() {
      var mines = 0;
      var doubles = 0;
      var flexible = 0;
      for (var a = 0; a < cells.length; a++) {
        if (val[a] > 0) mines++;
        if (val[a] === 2) doubles++;
        if (countMode && val[a] === 1 && (K.mask[cells[a]] & 4)) flexible++;
      }
      // Inverse clues distinguish safe/mined, but not ordinary/double. Enumerate occupancy
      // once and distribute doubles analytically; all count groups retain exact cell support.
      var combinations = 1;
      for (var dc = doubles; dc <= doubles + flexible; dc++) {
        if (work.maxD !== undefined && dc > work.maxD) break;
        var key = mines * COUNT_BASE + dc;
        var masks = keys[key];
        if (!masks) {
          masks = keys[key] = [];
          for (var b = 0; b < cells.length; b++) masks.push(0);
        }
        for (var c = 0; c < cells.length; c++) {
          var support = BITS[val[c]];
          if (countMode && val[c] === 1 && (K.mask[cells[c]] & 4)) {
            support = dc === doubles ? 2 : dc === doubles + flexible ? 4 : 6;
          }
          masks[c] |= support;
        }
        count += combinations;
        combinations = combinations * (flexible - (dc - doubles)) / (dc - doubles + 1);
      }
    }

    function step(depth, mineTotal, doubleTotal) {
      if (big) return;
      if (work.maxM !== undefined && mineTotal > work.maxM) return;
      if (work.maxD !== undefined && doubleTotal > work.maxD) return;
      if (++work.nodes > stop) {
        big = true;
        return;
      }
      if (depth === order.length) {
        record();
        return;
      }
      var ci = order[depth];
      var mk = K.mask[cells[ci]];
      var list = of[ci];
      for (var v = 0; v < 3; v++) {
        if (!(mk & BITS[v])) continue;
        if (countMode && v === 2 && (mk & 2)) continue;
        var ok = true;
        var k;
        for (k = 0; k < list.length; k++) {
          var cc = list[k];
          var mode = piece.cons[cc].mode;
          sum[cc] += contrib(v, mode);
          lo[cc] -= LO[mode][mk];
          hi[cc] -= HI[mode][mk];
          if (sum[cc] + lo[cc] > piece.cons[cc].t || sum[cc] + hi[cc] < piece.cons[cc].t) ok = false;
        }
        val[ci] = v;
        if (ok) step(depth + 1, mineTotal + (v > 0 ? 1 : 0), doubleTotal + (v === 2 ? 1 : 0));
        for (k = 0; k < list.length; k++) {
          var cu = list[k];
          var mo = piece.cons[cu].mode;
          sum[cu] -= contrib(v, mo);
          lo[cu] += LO[mo][mk];
          hi[cu] += HI[mo][mk];
        }
        val[ci] = -1;
        if (big) return;
      }
    }
    step(0, 0, 0);
    if (big) return { big: true };
    return { keys: keys, count: count, cells: cells };
  }

  function addSets(a, b, cap, maxM, maxD) {
    var out = {};
    var n = 0;
    for (var x in a) {
      for (var y in b) {
        var k = Number(x) + Number(y);
        var m = Math.floor(k / COUNT_BASE);
        if (m > maxM || k - m * COUNT_BASE > maxD) continue;
        if (!out[k]) {
          out[k] = true;
          if (++n > cap) return null;
        }
      }
    }
    return out;
  }

  /** Extra opened numbers can join otherwise small borders into one large piece. Try complete
   * subsets of its equations as well: omitting equations permits MORE layouts, so a cell fixed
   * in all of these layouts is still a proof. Each search contains at most enumLimit cells; its
   * counts must never be used as independent pieces in the global mine-total calculation. */
  function localPieces(piece, limit) {
    var out = [];
    var seen = {};
    for (var seed = 0; seed < piece.cons.length; seed++) {
      var selected = {};
      var cells = [];
      var cons = [];
      var used = {};
      var next = seed;
      while (next >= 0) {
        used[next] = true;
        var con = piece.cons[next];
        cons.push(con);
        for (var j = 0; j < con.cells.length; j++) {
          var cell = con.cells[j];
          if (!selected[cell]) {
            selected[cell] = true;
            cells.push(cell);
          }
        }
        next = -1;
        var best = -1;
        for (var i = 0; i < piece.cons.length; i++) {
          if (used[i]) continue;
          var added = 0;
          var shared = 0;
          for (var c = 0; c < piece.cons[i].cells.length; c++) {
            if (selected[piece.cons[i].cells[c]]) shared++;
            else added++;
          }
          if (!shared || cells.length + added > limit) continue;
          var score = shared * 32 - added;
          if (score > best) { best = score; next = i; }
        }
      }
      if (cells.length > limit) continue;
      cells.sort(function (a, b) { return a - b; });
      var key = cells.join(',');
      if (seen[key]) continue;
      seen[key] = true;
      out.push({ cells: cells, cons: cons });
    }
    return out;
  }

  function applyEnumeration(K, res) {
    if (res.big) return 0;
    var union = null;
    for (var key in res.keys) {
      var masks = res.keys[key];
      if (!union) union = masks.slice();
      else for (var q = 0; q < masks.length; q++) union[q] |= masks[q];
    }
    if (!union) return 0;
    var changed = 0;
    for (var c = 0; c < res.cells.length; c++) {
      var nm = K.mask[res.cells[c]] & union[c];
      if (nm && nm !== K.mask[res.cells[c]]) {
        K.mask[res.cells[c]] = nm;
        changed++;
      }
    }
    return changed;
  }

  /**
   * The border and the count of mines together: which (mines, doubles) of each piece can be
   * with the rest of the field. Narrows masks of the pieces and of the cells far from any number.
   */
  function global(B, K, results, work) {
    var fixedM = 0;
    var fixedD = 0;
    var interior = [];
    var groups = [0, 0, 0, 0, 0, 0, 0, 0];
    var inPiece = {};
    var r;
    var i;
    for (r = 0; r < results.length; r++) for (i = 0; i < results[r].cells.length; i++) inPiece[results[r].cells[i]] = true;
    for (i = 0; i < B.n; i++) {
      var mk = K.mask[i];
      if (inPiece[i]) continue;
      if (mk === 2 || mk === 4) {
        fixedM++;
        if (mk === 4) fixedD++;
      } else if (mk !== 1) {
        interior.push(i);
        groups[mk]++;
      }
    }
    var I = interior.length;
    function feasible(total, removed, value) {
      var mc = Math.floor(total / COUNT_BASE);
      var dc = total - mc * COUNT_BASE;
      var mI = B.M - fixedM - mc;
      var dRest = B.D - fixedD - dc;
      var ordinary = groups[3];
      var doubleOnly = groups[5];
      var either = groups[7];
      var certain = groups[6];
      if (removed) {
        if (removed === 3) ordinary--;
        if (removed === 5) doubleOnly--;
        if (removed === 7) either--;
        if (removed === 6) certain--;
        if (value > 0) mI--;
        if (value === 2) dRest--;
      }
      var optional = mI - certain;
      if (optional < 0 || optional > ordinary + doubleOnly + either) return false;
      var minimum = Math.max(0, optional - ordinary - either);
      var maximum = Math.min(optional, doubleOnly + either) + certain;
      return dRest >= minimum && dRest <= maximum;
    }
    var cap = 4000;
    var prefix = [{ 0: true }];
    for (r = 0; r < results.length; r++) {
      var next = addSets(prefix[r], results[r].keys, cap, B.M, B.D);
      if (!next) return 0;
      prefix.push(next);
    }
    var suffix = [];
    suffix[results.length] = { 0: true };
    for (r = results.length - 1; r >= 0; r--) {
      var s = addSets(suffix[r + 1], results[r].keys, cap, B.M, B.D);
      if (!s) return 0;
      suffix[r] = s;
    }
    work.nodes += results.length * 8;
    var changed = 0;
    for (r = 0; r < results.length; r++) {
      var others = addSets(prefix[r], suffix[r + 1], cap, B.M, B.D);
      if (!others) return 0;
      var masks = null;
      for (var key in results[r].keys) {
        var ok = false;
        for (var o in others) {
          if (feasible(Number(o) + Number(key))) {
            ok = true;
            break;
          }
        }
        if (!ok) continue;
        var km = results[r].keys[key];
        if (!masks) masks = km.slice();
        else for (var q = 0; q < km.length; q++) masks[q] |= km[q];
      }
      if (!masks) return -1;
      for (var c = 0; c < results[r].cells.length; c++) {
        var cell = results[r].cells[c];
        var nm = K.mask[cell] & masks[c];
        if (nm && nm !== K.mask[cell]) {
          K.mask[cell] = nm;
          changed++;
        }
      }
    }
    if (I) {
      var support = [0, 0, 0, 0, 0, 0, 0, 0];
      var any = false;
      for (var t in prefix[results.length]) {
        if (!feasible(Number(t))) continue;
        any = true;
        for (var mask = 3; mask < 8; mask++) {
          if (!groups[mask]) continue;
          for (var val = 0; val < 3; val++) {
            if (!(mask & BITS[val]) || (support[mask] & BITS[val])) continue;
            if (feasible(Number(t), mask, val)) support[mask] |= BITS[val];
          }
        }
      }
      if (!any) return -1;
      for (i = 0; i < interior.length; i++) {
        var previous = K.mask[interior[i]];
        var to = previous & support[previous];
        if (to && previous !== to) {
          K.mask[interior[i]] = to;
          changed++;
        }
      }
    }
    return changed;
  }

  /** Hidden cells known to be safe now. */
  function safeHidden(B, K) {
    var out = [];
    for (var i = 0; i < B.n; i++) if (!K.open[i] && K.mask[i] === 1) out.push(i);
    return out;
  }

  /**
   * One round of thinking without opening anything: the rules in order until one of them says
   * something. {safe: [i…], changed, rule: 'simple'|'pair'|'border'|'count'|null}.
   * o: {enumLimit, nodeLimit, rules: 'all'|'simple'}; work: {nodes, limit} counts the effort.
   */
  function thinkHere(B, K, o, work) {
    var cons = constraints(B, K);
    var changed = simple(K, cons);
    var safe = safeHidden(B, K);
    if (changed || (safe.length && !o.factsOnly)) return { safe: safe, changed: changed, rule: 'simple' };
    if (o.rules === 'simple') return { safe: [], changed: 0, rule: null };
    changed = pairs(K, cons);
    if (changed > 0) return { safe: safeHidden(B, K), changed: changed, rule: 'pair' };
    // The displayed totals are facts even when a boundary is too large to enumerate.
    if (!o.skipTotals) {
      var allCells = [];
      for (var ai = 0; ai < B.n; ai++) allCells.push(ai);
      changed = Math.max(0, tighten(K, allCells, B.M, 'cnt'));
      changed += Math.max(0, tighten(K, allCells, B.D, 'dbl'));
      if (changed > 0) return { safe: safeHidden(B, K), changed: changed, rule: 'count' };
    }
    if (o.noBorder) return { safe: [], changed: 0, rule: null };
    var ps = pieces(K, cons);
    work.maxM = B.M;
    work.maxD = B.D;
    for (var fi = 0; fi < B.n; fi++) {
      if (K.mask[fi] === 2 || K.mask[fi] === 4) work.maxM--;
      if (K.mask[fi] === 4) work.maxD--;
    }
    var results = [];
    var large = [];
    var all = true;
    for (var p = 0; p < ps.length; p++) {
      var res = enumerate(K, ps[p], o.enumLimit || 24, work);
      if (res.big) {
        all = false;
        large.push(ps[p]);
        continue;
      }
      results.push(res);
      changed += applyEnumeration(K, res);
    }
    if (changed) return { safe: safeHidden(B, K), changed: changed, rule: 'border' };
    if (all) {
      var g = global(B, K, results, work);
      if (g > 0) return { safe: safeHidden(B, K), changed: g, rule: 'count' };
    }
    for (var li = 0; li < large.length; li++) {
      var locals = localPieces(large[li], o.enumLimit || 24);
      for (var lp = 0; lp < locals.length; lp++) {
        var partial = enumerate(K, locals[lp], o.enumLimit || 24, work);
        changed = applyEnumeration(K, partial);
        if (changed) return { safe: safeHidden(B, K), changed: changed, rule: 'border' };
      }
    }
    return { safe: [], changed: 0, rule: null };
  }

  /** A fogged number can be inspected again without making an opening or ticking a clock.
   * Each deduction sees one radius-2 window; only proved cell facts survive looking elsewhere. */
  function think(B, K, o, work) {
    o = o || {};
    work = work || { nodes: 0, limit: o.nodeLimit || 50000 };
    if (B.fog && o.inspect !== false) {
      // Looking for an immediate visible rule in another window is much cheaper than enumerating
      // a difficult local border first. Only if every window stalls is enumeration necessary.
      var quick = {};
      for (var name in o) quick[name] = o[name];
      quick.noBorder = true;
      var original = K.last;
      var immediate = thinkHere(B, K, quick, work);
      if ((immediate.safe.length && !o.factsOnly) || immediate.changed) return immediate;
      quick.skipTotals = true;
      for (var qi = 0; qi < B.n; qi++) {
        if (K.open[qi] !== 1 || qi === original) continue;
        K.last = qi;
        immediate = thinkHere(B, K, quick, work);
        if ((immediate.safe.length && !o.factsOnly) || immediate.changed) {
          immediate.lookAt = qi;
          return immediate;
        }
      }
      K.last = original;
    }
    var r = thinkHere(B, K, o, work);
    if ((r.safe.length && !o.factsOnly) || r.changed || !B.fog || o.inspect === false) return r;
    var previous = K.last;
    for (var i = 0; i < B.n; i++) {
      if (K.open[i] !== 1 || i === previous) continue;
      K.last = i;
      r = thinkHere(B, K, o, work);
      if ((r.safe.length && !o.factsOnly) || r.changed) {
        r.lookAt = i;
        return r;
      }
    }
    K.last = previous;
    return r;
  }

  /** Thinking until nothing more follows from what is open (nothing is opened). Returns K. */
  function deduce(B, K, o, work) {
    work = work || { nodes: 0, limit: (o && o.nodeLimit) || 50000 };
    var facts = {};
    for (var key in o || {}) facts[key] = o[key];
    facts.factsOnly = true;
    for (var round = 0; round < 200; round++) {
      var r = think(B, K, facts, work);
      if (!r.changed) break;
    }
    return K;
  }

  /**
   * Plays the field as a careful person: thinks, opens what is surely safe, thinks again.
   * {ok, K, rules: {simple, pair, border, count}, rounds}. K is changed in place.
   */
  function play(B, K, o, work) {
    o = o || {};
    work = work || { nodes: 0, limit: o.nodeLimit || 50000 };
    var used = { simple: 0, pair: 0, border: 0, count: 0 };
    var rounds = 0;
    while (!finished(B, K) && rounds < 2000) {
      rounds++;
      var r = think(B, K, o, work);
      if (r.safe.length) {
        used[r.rule]++;
        for (var i = 0; i < r.safe.length; i++) reveal(B, K, r.safe[i]);
        continue;
      }
      if (r.changed) {
        used[r.rule]++;
        continue;
      }
      break;
    }
    return { ok: finished(B, K), K: K, rules: used, rounds: rounds };
  }

  // ---- making a field ------------------------------------------------------------------------------

  function near(w, a, b, r) {
    var ax = a % w;
    var ay = (a - ax) / w;
    var bx = b % w;
    var by = (b - bx) / w;
    return ax >= bx - r && ax <= bx + r && ay >= by - r && ay <= by + r;
  }

  /** Distance (in steps of a king) from the nearest opened cell, for every cell. */
  function distances(B, K) {
    var d = [];
    var queue = [];
    var i;
    for (i = 0; i < B.n; i++) {
      if (K.open[i]) {
        d.push(0);
        queue.push(i);
      } else d.push(-1);
    }
    for (var head = 0; head < queue.length; head++) {
      var c = queue[head];
      var nb = B.nb[c];
      for (var j = 0; j < nb.length; j++) {
        if (d[nb[j]] < 0) {
          d[nb[j]] = d[c] + 1;
          queue.push(nb[j]);
        }
      }
    }
    return d;
  }

  function strings(cells) { return cells.join(''); }

  /**
   * A field for spec {w, h, mines, doubles, roamers, clocks, deaf, holes, caches, findShare,
   * fakes, inverse, minOpen, shard} after the first tap at `start`, from `seed`.
   * o: {repairTries, enumLimit, nodeLimit, budget}. Returns {w, h, m, t, start, hints, repairs,
   * work, ok, key}. The same arguments give the same field on every device.
   */
  function generate(spec, seed, start, o) {
    o = o || {};
    var w = spec.w;
    var h = spec.h;
    var n = w * h;
    if (!(w > 0 && h > 0 && w <= 32 && h <= 32 && w === Math.floor(w) && h === Math.floor(h))) throw new Error('Invalid field dimensions');
    if (!(start >= 0 && start < n && start === Math.floor(start))) throw new Error('Invalid first cell');
    var rng = Rng.make(Rng.hash(String(seed) + ':' + start));
    var budget = o.budget || 2000000;
    var work = { nodes: 0, limit: o.nodeLimit || 50000 };
    var tries = 0;
    var i;
    // Holes: single cells or pairs, never next to the first tap, never more than a third of a row.
    var holes = {};
    var holeCount = spec.inverse ? 0 : Math.max(0, Math.min(spec.holes || 0, Math.floor(n / 8)));
    var guard = 0;
    while (Object.keys(holes).length < holeCount && guard++ < holeCount * 40) {
      var hc = rng.int(n);
      if (near(w, hc, start, 2) || holes[hc]) continue;
      holes[hc] = true;
      if (rng.chance(0.4) && Object.keys(holes).length < holeCount) {
        var side = hc + (rng.chance(0.5) ? 1 : w);
        if (side < n && (side % w) !== 0 && !near(w, side, start, 2)) holes[side] = true;
      }
    }
    var real = [];
    for (i = 0; i < n; i++) if (!holes[i]) real.push(i);
    var mineCount = Math.max(0, Math.min(Math.floor(spec.mines || 0), real.length - 1));
    var m;
    var t;
    var B;
    var K;
    var radius = 1;
    var minOpen = spec.minOpen || 0;

    function place() {
      m = [];
      t = [];
      for (var a = 0; a < n; a++) {
        m.push(holes[a] ? 'h' : '.');
        t.push('.');
      }
      var spots = [];
      for (var b = 0; b < real.length; b++) if (!near(w, real[b], start, radius)) spots.push(real[b]);
      rng.shuffle(spots);
      var chosen = spots.slice(0, mineCount);
      var kinds = [];
      var dbl = Math.min(spec.doubles || 0, chosen.length);
      var rm = Math.min(spec.roamers || 0, chosen.length - dbl);
      var cl = Math.min(spec.clocks || 0, chosen.length - dbl - rm);
      for (var c = 0; c < chosen.length; c++) kinds.push(c < dbl ? '2' : c < dbl + rm ? 'r' : c < dbl + rm + cl ? 'c' : '1');
      rng.shuffle(kinds);
      for (var d = 0; d < chosen.length; d++) m[chosen[d]] = kinds[d];
      // Deaf cells: safe, away from the first tap.
      var deafLeft = spec.deaf || 0;
      var safeSpots = [];
      for (var e = 0; e < real.length; e++) if (m[real[e]] === '.' && !near(w, real[e], start, radius + 1)) safeSpots.push(real[e]);
      rng.shuffle(safeSpots);
      for (var f = 0; f < safeSpots.length && deafLeft > 0; f++, deafLeft--) t[safeSpots[f]] = 'd';
    }

    function fresh() {
      B = model(w, h, strings(m), strings(t), { inverse: spec.inverse, fog: spec.fog, fogRadius: spec.fogRadius, last: start });
      K = blank(B);
      reveal(B, K, start);
    }

    // Lays the mines; «Широкий шаг» wants the first tap to open at least minOpen cells: new
    // layouts, then a wider clear square around the tap.
    function layout() {
      for (;;) {
        tries++;
        place();
        fresh();
        if (!minOpen) return;
        var opened = 0;
        for (var q = 0; q < n; q++) if (K.open[q]) opened++;
        if (opened >= minOpen || radius >= 3) return;
        if (tries % 6 === 0) radius++;
      }
    }
    layout();

    // Solve; when stuck, move a mine of the stuck border into the depth of the field and retry.
    var repairs = 0;
    var maxRepairs = o.repairTries === undefined ? 40 : o.repairTries;
    var stall = 0;
    var bestOpened = 0;
    var result = play(B, K, o, work);
    while (!result.ok && repairs < maxRepairs && work.nodes < budget) {
      // A repair that opened no more than the best one so far is a stall; after `restartAfter`
      // stalls the mines are laid anew (it counts as one of the tries).
      if (result.K.opened > bestOpened) {
        bestOpened = result.K.opened;
        stall = 0;
      } else if (++stall >= (o.restartAfter || 8)) {
        stall = 0;
        bestOpened = 0;
        repairs++;
        layout();
        result = play(B, K, o, work);
        continue;
      }
      var stuck = result.K;
      var border = [];
      var cons = constraints(B, stuck);
      var seen = {};
      for (var a = 0; a < cons.length; a++) {
        for (var b = 0; b < cons[a].cells.length; b++) {
          var c = cons[a].cells[b];
          if (!seen[c] && mined(m[c])) {
            seen[c] = true;
            border.push(c);
          }
        }
      }
      if (!border.length) {
        // Nothing unknown touches a number: the rest is walled off by known mines. A mine of the
        // wall (next to an opened cell and to the unknown) is the one to move.
        for (var wi = 0; wi < n; wi++) {
          if (!mined(m[wi]) || stuck.open[wi]) continue;
          var nbw = B.nb[wi];
          var byOpen = false;
          var byUnknown = false;
          for (var wj = 0; wj < nbw.length; wj++) {
            if (stuck.open[nbw[wj]] === 1) byOpen = true;
            else if (!stuck.open[nbw[wj]] && !single(stuck.mask[nbw[wj]])) byUnknown = true;
          }
          if (byOpen && byUnknown) border.push(wi);
        }
      }
      if (!border.length) break;
      var dist = distances(B, stuck);
      var far = [];
      var best = 0;
      for (var x = 0; x < n; x++) {
        if (m[x] !== '.' || t[x] !== '.' || stuck.open[x] || dist[x] < 2 || near(w, x, start, radius)) continue;
        if (dist[x] > best) {
          best = dist[x];
          far = [x];
        } else if (dist[x] === best) far.push(x);
      }
      var from = border[rng.int(border.length)];
      if (!far.length) {
        // Everything else is open already (a last fifty-fifty): the mine goes as far from the
        // stuck place as the field allows; the field is solved again from the first tap.
        var top = -1;
        for (var y = 0; y < n; y++) {
          if (m[y] !== '.' || t[y] !== '.' || near(w, y, start, radius) || near(w, y, from, 1)) continue;
          var dx = (y % w) - (from % w);
          var dy = Math.floor(y / w) - Math.floor(from / w);
          var dd2 = dx * dx + dy * dy;
          if (dd2 > top) {
            top = dd2;
            far = [y];
          } else if (dd2 === top) far.push(y);
        }
      }
      if (!far.length) break;
      var to = far[rng.int(far.length)];
      m[to] = m[from];
      m[from] = '.';
      repairs++;
      work.nodes += n;
      fresh();
      result = play(B, K, o, work);
    }

    // Still stuck: the earth shows one safe cell where the solver stopped, as many times as needed.
    var hints = 0;
    while (!result.ok && hints < n) {
      var st = result.K;
      var pick = -1;
      var cons2 = constraints(B, st);
      var cand = [];
      var mark = {};
      for (var u = 0; u < cons2.length; u++) {
        for (var v = 0; v < cons2[u].cells.length; v++) {
          var cc = cons2[u].cells[v];
          if (!mark[cc] && !st.open[cc] && m[cc] === '.' && t[cc] !== 'd') {
            mark[cc] = true;
            cand.push(cc);
          }
        }
      }
      if (!cand.length) {
        var dd = distances(B, st);
        var near1 = 99;
        for (var z = 0; z < n; z++) {
          if (st.open[z] || m[z] !== '.') continue;
          if (dd[z] < near1) {
            near1 = dd[z];
            cand = [z];
          } else if (dd[z] === near1) cand.push(z);
        }
      }
      if (!cand.length) break;
      cand.sort(function (p1, p2) { return p1 - p2; });
      pick = cand[rng.int(cand.length)];
      t[pick] = 'e';
      B.t[pick] = 'e';
      hints++;
      reveal(B, st, pick);
      result = play(B, st, o, work);
    }

    // Caches among safe cells the first tap did not open; false ones only «Нюх на клады» shows.
    var first = blank(B);
    reveal(B, first, start);
    var spots = [];
    for (i = 0; i < n; i++) if (m[i] === '.' && t[i] === '.' && !first.open[i]) spots.push(i);
    rng.shuffle(spots);
    var caches = Math.min(spec.caches || 0, spots.length);
    var fakes = Math.min(spec.fakes || 0, spots.length - caches);
    for (i = 0; i < caches; i++) t[spots[i]] = rng.chance(spec.findShare || 0) ? 'i' : 'g';
    for (i = caches; i < caches + fakes; i++) t[spots[i]] = 'z';
    if (spec.shard) {
      for (i = caches + fakes; i < spots.length; i++) {
        var sc = spots[i];
        if (B.sum[sc] > 0 && t[sc] === '.') {
          t[sc] = 'o';
          break;
        }
      }
    }
    // A map shard and earth marks are visible from the beginning. That can change which border
    // is joined first, so verify the FINAL field with no remembered deductions from generation.
    // Every extra fallback mark is also replayed from scratch, exactly as the player receives it.
    for (var check = 0; check <= n; check++) {
      B = model(w, h, strings(m), strings(t), { inverse: spec.inverse, fog: spec.fog, fogRadius: spec.fogRadius, last: start });
      var replay = blank(B);
      reveal(B, replay, start);
      for (i = 0; i < n; i++) if (t[i] === 'o') reveal(B, replay, i);
      result = play(B, replay, o, work);
      if (result.ok) break;
      var extra = -1;
      for (i = 0; i < n; i++) {
        if (replay.open[i] || m[i] !== '.' || t[i] === 'e' || t[i] === 'o') continue;
        if (extra < 0) extra = i;
        if (t[i] === '.') { extra = i; break; }
      }
      if (extra < 0) break;
      t[extra] = 'e';
      hints++;
    }
    return {
      w: w, h: h, m: strings(m), t: strings(t), start: start, hints: hints, repairs: repairs, tries: tries,
      work: work.nodes, ok: !!result.ok, unassisted: hints === 0, mines: B.M, doubles: B.D,
      inverse: !!spec.inverse, fog: !!spec.fog, fogRadius: B.fogRadius
    };
  }

  /** Replays a generated field from its first opening, including visible earth/map marks. */
  function solve(field, o) {
    var B = model(field.w, field.h, field.m, field.t, field);
    var K = blank(B);
    reveal(B, K, field.start);
    for (var i = 0; i < B.n; i++) if (B.t[i] === 'o') reveal(B, K, i);
    return play(B, K, o);
  }

  /** A roamer may enter only an unknown, featureless safe cell. Proven safe cells and mines
   * remain true after moving; a fresh solve checks the updated visible numbers and earth hints. */
  function canMove(B, K, from, to, o) {
    if (B.m[from] !== 'r' || B.m[to] !== '.' || B.t[to] !== '.' || K.open[from] || K.open[to]) return false;
    if (B.nb[from].indexOf(to) < 0 || !(K.mask[from] & 1) || !(K.mask[to] & 6)) return false;
    var moved = B.m.slice();
    moved[from] = '.';
    moved[to] = 'r';
    var next = model(B.w, B.h, moved.join(''), B.t.join(''), {
      inverse: B.inverse, fog: B.fog, fogRadius: B.fogRadius, last: K.last, mines: B.M, doubles: B.D
    });
    var facts = copy(K);
    for (var i = 0; i < B.n; i++) {
      if (facts.open[i]) continue;
      if (facts.mask[i] === 1 || !(facts.mask[i] & 1)) continue;
      facts.mask[i] = next.dom;
    }
    return play(next, facts, o).ok;
  }

  /** The order the worker prepares first taps in: from the middle outwards (taps land there). */
  function startOrder(w, h) {
    var list = [];
    for (var i = 0; i < w * h; i++) list.push(i);
    var cx = (w - 1) / 2;
    var cy = (h - 1) / 2.6;
    list.sort(function (a, b) {
      var ax = a % w;
      var ay = (a - ax) / w;
      var bx = b % w;
      var by = (b - bx) / w;
      var da = (ax - cx) * (ax - cx) + (ay - cy) * (ay - cy);
      var db = (bx - cx) * (bx - cx) + (by - cy) * (by - cy);
      return da - db || a - b;
    });
    return list;
  }

  return {
    around: around, value: value, mined: mined, model: model, blank: blank, copy: copy, reveal: reveal,
    knowledge: knowledge, finished: finished, constraints: constraints, tighten: tighten, simple: simple,
    think: think, deduce: deduce, play: play, generate: generate, solve: solve, canMove: canMove,
    startOrder: startOrder, single: single, pairs: pairs, pieces: pieces, enumerate: enumerate
  };
});
