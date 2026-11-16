// The rails of «Ветки поездов»: the level, the deterministic run of the trains, the brute force that
// counts the solutions, and the generator of levels (the chapters are made on the PC by
// tools/gen-levels.js; the level of the day and the challenge of the week — here, on the phone).
// Shared subset of JavaScript: the screen (window.Rails), the engine (Rhino, require) and node.
//
// A level: {w, h, nodes, trains, delay, …}. A node {x, y, z?, t, o: [out…]} on a cell of the grid:
//   t 'D' depot, 'R' rail, 'M' merge (two ways in), 'W' switch (o[0] — «налево», o[1] — «направо»),
//   'S' station (colour c). A switch has k: 'm' ручная, 'f' перекидная, 'c' цветная (colour c),
//   'n' счётная (count n); v: 1 when the player sets it; p: the position it starts in. z: 1 is a
//   bridge over the rail below. trains: [{d: depot node, t: tick, c: colour, l: 1 | 2}].
(function (root, make) {
  var node = typeof require === 'function' && typeof exports !== 'undefined';
  var api = node ? make(require('../engine/rng.js')) : make(root.Rng);
  if (typeof exports !== 'undefined') { for (var k in api) exports[k] = api[k]; } else { root.Rails = api; }
})(this, function (Rng) {
  'use strict';

  var TYPE = { D: 0, R: 1, M: 2, W: 3, S: 4 };
  var SKIND = { m: 1, f: 2, c: 3, n: 4 };
  var KINDS = ['m', 'f', 'c', 'n'];
  var KIND_TITLES = { m: 'ручная', f: 'перекидная', c: 'цветная', n: 'счётная' };
  var COLORS = 6;
  var WIN = 1;
  var REASONS = { 1: 'win', 2: 'crash', 3: 'wrong', 4: 'stuck', 5: 'loop', 6: 'timeout' };
  var SERIAL = 0;

  // ---- the level as arrays ---------------------------------------------------------------------------

  /** A level made ready to run many times (typed arrays, work buffers). */
  function compile(lv) {
    var n = lv.nodes.length;
    var W = lv.w;
    var H = lv.h;
    var L = {
      lv: lv, n: n, w: W, h: H,
      cell: new Int32Array(n), type: new Int8Array(n), out0: new Int32Array(n), out1: new Int32Array(n),
      sk: new Int8Array(n), sc: new Int8Array(n), sn: new Int8Array(n), start: new Int8Array(n), color: new Int8Array(n),
      pos: new Int8Array(n), cnt: new Int16Array(n),
      vars: [], switches: [], depots: [], stations: [], merges: 0
    };
    for (var i = 0; i < n; i++) {
      var d = lv.nodes[i];
      var o = d.o || [];
      L.cell[i] = ((d.z || 0) * H + d.y) * W + d.x;
      L.type[i] = TYPE[d.t];
      L.out0[i] = o.length > 0 ? o[0] : -1;
      L.out1[i] = o.length > 1 ? o[1] : -1;
      L.color[i] = d.c === undefined ? -1 : d.c;
      if (d.t === 'W') {
        L.sk[i] = SKIND[d.k] || 1;
        L.sc[i] = d.k === 'c' ? d.c : -1;
        L.sn[i] = d.n || 1;
        L.start[i] = d.p ? 1 : 0;
        L.switches.push(i);
        if (d.k === 'm' || ((d.k === 'f' || d.k === 'n') && d.v)) L.vars.push(i);
      }
      if (d.t === 'D') L.depots.push(i);
      if (d.t === 'S') L.stations.push(i);
      if (d.t === 'M') L.merges++;
    }
    var T = lv.trains.length;
    L.T = T;
    L.tDepot = new Int32Array(T);
    L.tTime = new Int32Array(T);
    L.tColor = new Int8Array(T);
    L.tLen = new Int8Array(T);
    for (var j = 0; j < T; j++) {
      var t = lv.trains[j];
      L.tDepot[j] = t.d;
      L.tTime[j] = t.t;
      L.tColor[j] = t.c === undefined ? -1 : t.c;
      L.tLen[j] = t.l || 1;
    }
    L.head = new Int32Array(T);
    L.prev = new Int32Array(T);
    L.tail = new Int32Array(T);
    L.st = new Int8Array(T);
    L.spawn = new Int32Array(T);
    L.steps = new Int32Array(T);
    L.arrived = new Int32Array(T);
    L.stamp = new Int32Array(W * H * 2);
    L.who = new Int32Array(W * H * 2);
    L.maxTicks = lv.maxTicks || 200;
    L.maxSteps = lv.maxSteps || W * H * 3;
    return L;
  }

  /** The node a train goes to from h (the switch moves as its kind says). */
  function nextNode(L, h, color, pos, cnt, pick, train) {
    var a = L.out0[h];
    var b = L.out1[h];
    if (b < 0) return a;
    var k = L.sk[h];
    if (k === 1) return pos[h] ? b : a;
    if (k === 2) {
      var r = pos[h] ? b : a;
      pos[h] = pos[h] ? 0 : 1;
      return r;
    }
    if (k === 3) {
      if (pick) return pick(train, h) ? b : a;
      return color === L.sc[h] ? a : b;
    }
    var first = cnt[h] < L.sn[h];
    cnt[h]++;
    var side = first ? pos[h] : 1 - pos[h];
    return side ? b : a;
  }

  /**
   * One run of the level: sw — positions of the player's switches (L.vars order), dl — delays per
   * train. Returns 1 when every train reached its station, otherwise the reason (REASONS). The
   * details are in L.res: {tick, trains, cell, node}. o: {trace: true} — positions per tick;
   * {paths: true} — the nodes each train went through; {free: true} — any station is right
   * (planning), {pick(train, switch)} — the side of a colour switch while planning; {noCrash}.
   */
  function run(L, sw, dl, o) {
    o = o || {};
    var T = L.T;
    var i;
    var j;
    var pos = L.pos;
    var cnt = L.cnt;
    for (i = 0; i < L.switches.length; i++) {
      pos[L.switches[i]] = L.start[L.switches[i]];
      cnt[L.switches[i]] = 0;
    }
    if (o.pos) for (i = 0; i < L.switches.length; i++) pos[L.switches[i]] = o.pos[i];
    if (sw) for (i = 0; i < L.vars.length; i++) pos[L.vars[i]] = sw[i];
    for (i = 0; i < T; i++) {
      L.st[i] = 0;
      L.spawn[i] = L.tTime[i] + (dl ? dl[i] : 0);
      L.head[i] = -1;
      L.prev[i] = -1;
      L.tail[i] = -1;
      L.steps[i] = 0;
      L.arrived[i] = -1;
    }
    SERIAL = (SERIAL + 1) % 4000000;
    var base = SERIAL * 512;
    var stamp = L.stamp;
    var who = L.who;
    var trace = o.trace ? [] : null;
    var paths = o.paths ? [] : null;
    if (paths) for (i = 0; i < T; i++) paths.push([]);
    var done = 0;
    var res = { tick: 0, trains: [], cell: -1, node: -1, reason: 'timeout', trace: trace, paths: paths, arrived: L.arrived };
    L.res = res;
    var maxT = o.maxTicks || L.maxTicks;
    function fail(code, tick, a, b, cell, nd) {
      res.reason = REASONS[code];
      res.tick = tick;
      res.trains = b === undefined || b < 0 ? [a] : [a, b];
      res.cell = cell;
      res.node = nd;
      return code;
    }
    for (var tick = 0; tick <= maxT; tick++) {
      // 1. The trains on the rails move one cell.
      for (i = 0; i < T; i++) {
        if (L.st[i] !== 1) continue;
        var h = L.head[i];
        var nx = nextNode(L, h, L.tColor[i], pos, cnt, o.pick, i);
        L.prev[i] = h;
        L.tail[i] = L.tLen[i] > 1 ? h : -1;
        L.head[i] = nx;
        if (nx < 0) {
          if (trace) trace.push(snapshot(L));
          return fail(4, tick, i, -1, L.cell[h], h);
        }
        if (paths) paths[i].push(nx);
        if (++L.steps[i] > L.maxSteps) return fail(5, tick, i, -1, L.cell[nx], nx);
      }
      // 2. The depots let out the trains of this tick.
      for (i = 0; i < T; i++) {
        if (L.st[i] === 0 && L.spawn[i] === tick) {
          L.st[i] = 1;
          L.head[i] = L.tDepot[i];
          if (paths) paths[i].push(L.tDepot[i]);
        }
      }
      if (trace) trace.push(snapshot(L));
      // 3. Two trains in one cell, or two trains that swapped cells.
      if (!o.noCrash) {
        var key = base + tick;
        for (i = 0; i < T; i++) {
          if (L.st[i] !== 1) continue;
          var c = L.cell[L.head[i]];
          if (stamp[c] === key) return fail(2, tick, who[c], i, c, L.head[i]);
          stamp[c] = key;
          who[c] = i;
          if (L.tail[i] >= 0) {
            c = L.cell[L.tail[i]];
            if (stamp[c] === key) return fail(2, tick, who[c], i, c, L.tail[i]);
            stamp[c] = key;
            who[c] = i;
          }
        }
        for (i = 0; i < T; i++) {
          if (L.st[i] !== 1 || L.prev[i] < 0) continue;
          for (j = i + 1; j < T; j++) {
            if (L.st[j] !== 1 || L.prev[j] < 0) continue;
            if (L.cell[L.head[i]] === L.cell[L.prev[j]] && L.cell[L.head[j]] === L.cell[L.prev[i]]) return fail(2, tick, i, j, L.cell[L.head[i]], L.head[i]);
          }
        }
      }
      // 4. Stations take the trains that came.
      for (i = 0; i < T; i++) {
        if (L.st[i] !== 1 || L.type[L.head[i]] !== 4) continue;
        if (!o.free && L.color[L.head[i]] !== L.tColor[i]) return fail(3, tick, i, -1, L.cell[L.head[i]], L.head[i]);
        L.st[i] = 2;
        L.arrived[i] = L.head[i];
        done++;
      }
      if (done === T) {
        res.reason = 'win';
        res.tick = tick;
        return WIN;
      }
    }
    return fail(6, maxT, -1, -1, -1, -1);
  }

  function snapshot(L) {
    var out = [];
    for (var i = 0; i < L.T; i++) if (L.st[i] === 1) out.push([i, L.head[i], L.prev[i], L.tail[i]]);
    return out;
  }

  /** The run as the screen needs it: {win, reason, tick, trains, cell, node, trace, paths, arrived}. */
  function simulate(lv, setup, o) {
    var L = lv.__compiled || compile(lv);
    try {
      Object.defineProperty(lv, '__compiled', { value: L, enumerable: false, configurable: true, writable: true });
    } catch (ignored) { /* frozen */ }
    o = o || {};
    var code = run(L, setup && setup.sw, setup && setup.dl, { trace: o.trace !== false, paths: o.paths !== false, noCrash: o.noCrash });
    var r = L.res;
    return {
      win: code === WIN, reason: r.reason, tick: r.tick, trains: r.trains, cell: r.cell, node: r.node,
      trace: r.trace, paths: r.paths, arrived: Array.prototype.slice.call(r.arrived)
    };
  }

  // ---- the brute force -------------------------------------------------------------------------------

  /** Every way to spend at most `budget` ticks of delay over T trains (the zero vector first). */
  function delayVectors(T, budget) {
    var out = [];
    var cur = [];
    for (var i = 0; i < T; i++) cur.push(0);
    function rec(k, left) {
      if (k === T) {
        out.push(cur.slice());
        return;
      }
      for (var d = 0; d <= left; d++) {
        cur[k] = d;
        rec(k + 1, left - d);
      }
      cur[k] = 0;
    }
    rec(0, budget || 0);
    return out;
  }

  function binom(n, k) {
    var r = 1;
    for (var i = 1; i <= k; i++) r = r * (n - k + i) / i;
    return Math.round(r);
  }

  /** How many variants a level has: positions of the player's switches × delays in the budget. */
  function variantCount(lv) {
    var nv = 0;
    lv.nodes.forEach(function (d) { if (d.t === 'W' && (d.k === 'm' || ((d.k === 'f' || d.k === 'n') && d.v))) nv++; });
    return Math.pow(2, nv) * binom((lv.delay || 0) + lv.trains.length, lv.trains.length);
  }

  function popcount(x) {
    var c = 0;
    while (x) {
      c += x & 1;
      x >>>= 1;
    }
    return c;
  }

  /**
   * Every variant of the level: S solutions of V, par (fewest changes of the player's switches
   * from the start), dpar (the delay allowed for three stars), useless switches (any position in
   * every solution), whether the start is already a solution, the best solution. cap: give up
   * when V is larger (returns {over: true, V}).
   */
  function solve(lv, o) {
    o = o || {};
    var L = compile(lv);
    var nv = L.vars.length;
    var B = lv.delay || 0;
    var Dv = delayVectors(L.T, B);
    var D = Dv.length;
    var combos = 1 << nv;
    var V = combos * D;
    if (o.cap && V > o.cap) return { over: true, V: V };
    var sums = Dv.map(function (v) {
      var s = 0;
      for (var i = 0; i < v.length; i++) s += v[i];
      return s;
    });
    var startMask = 0;
    for (var b = 0; b < nv; b++) if (L.start[L.vars[b]]) startMask |= 1 << b;
    var win = new Uint8Array(V);
    var sw = [];
    var S = 0;
    var par = 99;
    for (var di = 0; di < D; di++) {
      for (var mask = 0; mask < combos; mask++) {
        for (var k = 0; k < nv; k++) sw[k] = (mask >> k) & 1;
        if (run(L, sw, Dv[di]) === WIN) {
          win[mask * D + di] = 1;
          S++;
          var ch = popcount(mask ^ startMask);
          if (ch < par) par = ch;
        }
      }
    }
    var out = { V: V, S: S, nv: nv, D: D, budget: B, startWin: !!win[startMask * D], useless: [], par: S ? par : -1, dpar: 0, zeroDelay: false, best: null };
    if (!S) return out;
    var bestDelay = 99;
    var best = -1;
    for (var x = 0; x < V; x++) {
      if (!win[x]) continue;
      var m = Math.floor(x / D);
      var dd = x % D;
      if (sums[dd] === 0) out.zeroDelay = true;
      if (popcount(m ^ startMask) === par && sums[dd] < bestDelay) {
        bestDelay = sums[dd];
        best = x;
      }
    }
    out.dpar = bestDelay === 0 ? 0 : Math.max(bestDelay, Math.ceil(B / 2));
    var bm = Math.floor(best / D);
    var bsw = [];
    for (var q = 0; q < nv; q++) bsw.push((bm >> q) & 1);
    out.best = { sw: bsw, dl: Dv[best % D].slice() };
    for (var bit = 0; bit < nv; bit++) {
      var free = true;
      for (var y = 0; y < V && free; y++) {
        if (!win[y]) continue;
        var m2 = Math.floor(y / D) ^ (1 << bit);
        if (!win[m2 * D + (y % D)]) free = false;
      }
      if (free) out.useless.push(bit);
    }
    return out;
  }

  /** d = log2(variants / solutions) + 0.5 × trains + merges. */
  function difficulty(V, S, trains, merges) {
    return Math.round((Math.log(V / Math.max(1, S)) / Math.LN2 + 0.5 * trains + merges) * 100) / 100;
  }

  /** Stars of a won run: 1 solved; 2 within par changes; 3 also within the delay of three stars. */
  function stars(lv, setup) {
    var changes = 0;
    var delay = 0;
    var vars = varNodes(lv);
    for (var i = 0; i < vars.length; i++) if ((setup.sw[i] ? 1 : 0) !== (lv.nodes[vars[i]].p ? 1 : 0)) changes++;
    for (var j = 0; j < (setup.dl || []).length; j++) delay += setup.dl[j];
    if (changes > lv.par) return 1;
    if (delay > (lv.dpar || 0)) return 2;
    return 3;
  }

  function varNodes(lv) {
    var out = [];
    lv.nodes.forEach(function (d, i) { if (d.t === 'W' && (d.k === 'm' || ((d.k === 'f' || d.k === 'n') && d.v))) out.push(i); });
    return out;
  }

  // ---- the generator ---------------------------------------------------------------------------------

  var MOVES = [[1, 0], [0, 1], [1, 1]];

  function net(W, H) {
    var at = [];
    for (var i = 0; i < W * H * 2; i++) at.push(-1);
    return { w: W, h: H, nodes: [], at: at, sw: 0, mg: 0 };
  }

  function key(N, x, y, z) { return ((z || 0) * N.h + y) * N.w + x; }

  function inside(N, x, y) { return x >= 0 && y >= 0 && x < N.w && y < N.h; }

  function add(N, x, y, z, t) {
    var i = N.nodes.length;
    N.nodes.push({ x: x, y: y, z: z || 0, t: t, o: [], ins: 0, from: -1 });
    if (N.at[key(N, x, y, z)] < 0) N.at[key(N, x, y, z)] = i;
    return i;
  }

  function link(N, a, b) {
    N.nodes[a].o.push(b);
    N.nodes[b].ins++;
    if (N.nodes[b].from < 0) N.nodes[b].from = a;
  }

  /** A chain of rails through the cells [[x, y, z?], …] after node `from`; returns the last node. */
  function chain(N, from, cells, last) {
    var prev = from;
    for (var i = 0; i < cells.length; i++) {
      var c = cells[i];
      var t = i === cells.length - 1 && last ? last : 'R';
      var id = add(N, c[0], c[1], c[2] || 0, t);
      if (prev >= 0) link(N, prev, id);
      prev = id;
    }
    return prev;
  }

  function farFromSwitches(N, x, y, gap) {
    for (var i = 0; i < N.nodes.length; i++) {
      var d = N.nodes[i];
      if (d.t === 'W' && Math.max(Math.abs(d.x - x), Math.abs(d.y - y)) < (gap || 2)) return false;
    }
    return true;
  }

  function freeMoves(N, x, y) {
    var out = [];
    for (var i = 0; i < MOVES.length; i++) {
      var nx = x + MOVES[i][0];
      var ny = y + MOVES[i][1];
      if (inside(N, nx, ny) && N.at[key(N, nx, ny, 0)] < 0) out.push(i);
    }
    return out;
  }

  function isHead(heads, n) {
    for (var i = 0; i < heads.length; i++) if (heads[i].n === n) return true;
    return false;
  }

  /** A bridge over a straight rail across the move: the node over it and the cell beyond. */
  function bridgeAt(N, x, y, m) {
    var bx = x + MOVES[m][0];
    var by = y + MOVES[m][1];
    var cx = bx + MOVES[m][0];
    var cy = by + MOVES[m][1];
    if (m === 2 || !inside(N, cx, cy)) return null;
    var under = N.at[key(N, bx, by, 0)];
    if (under < 0 || N.at[key(N, bx, by, 1)] >= 0 || N.at[key(N, cx, cy, 0)] >= 0) return null;
    var u = N.nodes[under];
    if (u.t !== 'R' || u.ins !== 1 || u.o.length !== 1 || u.from < 0) return null;
    var p = N.nodes[u.from];
    var s = N.nodes[u.o[0]];
    if (p.x - bx !== -(s.x - bx) || p.y - by !== -(s.y - by)) return null;
    if (m === 0 && s.x !== bx) return null;
    if (m === 1 && s.y !== by) return null;
    return [bx, by, cx, cy];
  }

  /**
   * Grows rails from the heads (depots and switch exits) to the right and down: plain moves,
   * switches (two exits), merges into a rail already laid, stations on the right and bottom
   * edges, bridges over a straight rail (p.bridges). True when every head ended at a station
   * or a merge.
   */
  function grow(N, p, rng, heads) {
    var guard = 0;
    while (heads.length && guard++ < 600) {
      var hi = rng.int(heads.length);
      var h = heads[hi];
      var cur = N.nodes[h.n];
      var x = cur.x;
      var y = cur.y;
      var depot = cur.t === 'D';
      var edge = x === N.w - 1 || y === N.h - 1;
      var steps = h.steps || 0;
      if (!depot && cur.z === 0 && steps >= 1 && N.sw < p.swMax && rng.chance(p.pSwitch) && farFromSwitches(N, x, y, 2)) {
        var fm = freeMoves(N, x, y);
        if (fm.length >= 2) {
          rng.shuffle(fm);
          cur.t = 'W';
          var a = add(N, x + MOVES[fm[0]][0], y + MOVES[fm[0]][1], 0, 'R');
          var b = add(N, x + MOVES[fm[1]][0], y + MOVES[fm[1]][1], 0, 'R');
          link(N, h.n, a);
          link(N, h.n, b);
          N.sw++;
          heads.splice(hi, 1, { n: a, m: fm[0], steps: 0 }, { n: b, m: fm[1], steps: 0 });
          continue;
        }
      }
      if (!depot && steps >= 1 && N.mg < p.mgMax && rng.chance(p.pMerge)) {
        var merged = false;
        var order = rng.shuffle([0, 1, 2]);
        for (var q = 0; q < order.length && !merged; q++) {
          var mx = x + MOVES[order[q]][0];
          var my = y + MOVES[order[q]][1];
          if (!inside(N, mx, my)) continue;
          var tn = N.at[key(N, mx, my, 0)];
          if (tn < 0) continue;
          var td = N.nodes[tn];
          if (td.t !== 'R' || td.ins !== 1 || td.o.length !== 1 || isHead(heads, tn) || td.from === h.n) continue;
          if (p.mergeGap && !farFromSwitches(N, mx, my, 1)) continue;
          link(N, h.n, tn);
          td.t = 'M';
          N.mg++;
          heads.splice(hi, 1);
          merged = true;
        }
        if (merged) continue;
      }
      if (!depot && edge && cur.z === 0 && steps >= (p.minRun || 1) && rng.chance(p.pStation)) {
        cur.t = 'S';
        heads.splice(hi, 1);
        continue;
      }
      var moves = freeMoves(N, x, y);
      if (moves.length) {
        var m = moves[rng.int(moves.length)];
        if (h.m !== undefined && moves.indexOf(h.m) >= 0 && rng.chance(p.pStraight === undefined ? 0.55 : p.pStraight)) m = h.m;
        var nn = add(N, x + MOVES[m][0], y + MOVES[m][1], 0, 'R');
        link(N, h.n, nn);
        h.n = nn;
        h.m = m;
        h.steps = steps + 1;
        continue;
      }
      if (p.bridges && !depot) {
        var bridged = false;
        for (var bm = 0; bm < 2 && !bridged; bm++) {
          var br = bridgeAt(N, x, y, bm);
          if (!br) continue;
          var over = add(N, br[0], br[1], 1, 'R');
          var beyond = add(N, br[2], br[3], 0, 'R');
          link(N, h.n, over);
          link(N, over, beyond);
          h.n = beyond;
          h.m = bm;
          h.steps = steps + 2;
          N.bridges = (N.bridges || 0) + 1;
          bridged = true;
        }
        if (bridged) continue;
      }
      if (!depot && edge && cur.z === 0) {
        cur.t = 'S';
        heads.splice(hi, 1);
        continue;
      }
      return false;
    }
    return heads.length === 0;
  }

  /** Depots on the left and top edges, at least two cells apart. */
  function placeDepots(N, count, rng) {
    var cand = [];
    var y;
    for (y = 0; y <= N.h - 3; y++) cand.push([0, y, 0]);
    for (var x = 1; x <= N.w - 3; x++) cand.push([x, 0, 1]);
    rng.shuffle(cand);
    var heads = [];
    for (var i = 0; i < cand.length && heads.length < count; i++) {
      var c = cand[i];
      var ok = true;
      for (var j = 0; j < heads.length; j++) {
        var d = N.nodes[heads[j].n];
        if (Math.max(Math.abs(d.x - c[0]), Math.abs(d.y - c[1])) < 2) ok = false;
      }
      if (!ok || N.at[key(N, c[0], c[1], 0)] >= 0) continue;
      heads.push({ n: add(N, c[0], c[1], 0, 'D'), m: c[2], steps: 0 });
    }
    return heads.length === count ? heads : null;
  }

  function growNet(p, rng) {
    var N = net(p.w, p.h);
    var heads = placeDepots(N, rng.int(p.depots[0], p.depots[1]), rng);
    if (!heads) return null;
    if (!grow(N, p, rng, heads)) return null;
    return N;
  }

  /**
   * «Встречные»: a single track across the middle with passing loops; eastbound trains come from
   * the left, westbound from the right, and both share the cells of the single track.
   */
  function corridorNet(p, rng) {
    var W = 7;
    var H = 9;
    var N = net(W, H);
    var r = rng.int(3, 5);
    var loops = rng.chance(p.twoLoops || 0) ? [2, 4] : [rng.int(2, 4)];
    var east = [];
    var west = [];
    for (var x = 1; x <= 5; x++) east.push([x, loops.indexOf(x) >= 0 ? r - 1 : r]);
    for (var x2 = 5; x2 >= 1; x2--) west.push([x2, r]);
    // Eastbound: depot on the left, maybe a second one from the top merging in.
    var d1 = add(N, 0, r, 0, 'D');
    var eFirst = add(N, 1, r, 0, 'R');
    link(N, d1, eFirst);
    var eLast = chain(N, eFirst, east.slice(1));
    if (rng.chance(p.second || 0.5)) {
      var d2 = add(N, 1, 0, 0, 'D');
      var cells = [];
      for (var y = 1; y <= r - 1; y++) cells.push([1, y]);
      var tail = chain(N, d2, cells);
      link(N, tail, eFirst);
      N.nodes[eFirst].t = 'M';
      N.mg++;
    }
    // Eastbound exit: a switch to the right edge, two stations up the right side.
    var es = add(N, 6, r - 1, 0, 'W');
    link(N, eLast, es);
    var up0 = [];
    var up1 = [];
    for (var yy = r - 2; yy >= 0; yy--) up0.push([6, yy]);
    for (var y3 = r - 2; y3 >= 0; y3--) up1.push([5, y3]);
    var s0 = chain(N, -1, up0, 'S');
    var s1 = chain(N, -1, up1, 'S');
    link(N, es, s0 - up0.length + 1);
    link(N, es, s1 - up1.length + 1);
    // Westbound: depot on the right, maybe a second one from the bottom merging in.
    var d3 = add(N, 6, r, 0, 'D');
    var wFirst = add(N, 5, r, 0, 'R');
    link(N, d3, wFirst);
    var wLast = chain(N, wFirst, west.slice(1));
    if (rng.chance(p.second || 0.5)) {
      var d4 = add(N, 5, H - 1, 0, 'D');
      var cells2 = [];
      for (var y4 = H - 2; y4 >= r + 1; y4--) cells2.push([5, y4]);
      var tail2 = chain(N, d4, cells2);
      link(N, tail2, wFirst);
      N.nodes[wFirst].t = 'M';
      N.mg++;
    }
    var ws = add(N, 0, r + 1, 0, 'W');
    link(N, wLast, ws);
    var dn0 = [];
    var dn1 = [];
    for (var y5 = r + 2; y5 <= H - 1; y5++) dn0.push([0, y5]);
    for (var y6 = r + 2; y6 <= H - 1; y6++) dn1.push([1, y6]);
    var t0 = chain(N, -1, dn0, 'S');
    var t1 = chain(N, -1, dn1, 'S');
    link(N, ws, t0 - dn0.length + 1);
    link(N, ws, t1 - dn1.length + 1);
    N.sw = 2;
    N.corridor = true;
    return N;
  }

  /** «Кольцо»: a ring line with entries (merges) and exits (switches), a line over it on bridges. */
  function ringNet(p, rng) {
    var W = 7;
    var H = 9;
    var N = net(W, H);
    var rw = rng.int(3, 4);
    var rh = rng.int(3, 4);
    var x0 = rng.int(1, W - rw - 2);
    var x1 = x0 + rw - 1;
    var y0 = rng.int(2, H - rh - 2);
    var y1 = y0 + rh - 1;
    var ring = [];
    var x;
    var y;
    for (x = x0; x <= x1; x++) ring.push([x, y0]);
    for (y = y0 + 1; y <= y1; y++) ring.push([x1, y]);
    for (x = x1 - 1; x >= x0; x--) ring.push([x, y1]);
    for (y = y1 - 1; y > y0; y--) ring.push([x0, y]);
    var ids = ring.map(function (c) { return add(N, c[0], c[1], 0, 'R'); });
    for (var i = 0; i < ids.length; i++) link(N, ids[i], ids[(i + 1) % ids.length]);
    function at(xx, yy) { return N.at[key(N, xx, yy, 0)]; }
    var used = {};
    // A line across the ring on two bridges, with a switch before it that can also enter the ring.
    var cross = -1;
    if (rw >= 3 && rng.chance(p.cross === undefined ? 0.7 : p.cross)) {
      cross = rng.int(x0 + 1, x1 - 1);
      if (cross + 1 > x1) cross = -1;
    }
    if (cross >= 0) {
      var dc = add(N, cross, 0, 0, 'D');
      var sw = add(N, cross, 1, 0, 'W');
      link(N, dc, sw);
      var downCells = [];
      for (y = 2; y < y0; y++) downCells.push([cross, y]);
      downCells.push([cross, y0, 1]);
      for (y = y0 + 1; y < y1; y++) downCells.push([cross, y]);
      downCells.push([cross, y1, 1]);
      for (y = y1 + 1; y <= H - 1; y++) downCells.push([cross, y]);
      var first = N.nodes.length;
      chain(N, -1, downCells, 'S');
      link(N, sw, first);
      // The other exit of the switch goes down-right into the ring.
      var into = [];
      for (y = 2; y < y0; y++) into.push([cross + 1, y]);
      var target = at(cross + 1, y0);
      if (into.length) {
        var f2 = N.nodes.length;
        var last2 = chain(N, -1, into);
        link(N, sw, f2);
        link(N, last2, target);
      } else {
        link(N, sw, target);
      }
      N.nodes[target].t = 'M';
      N.mg++;
      N.sw++;
      N.bridges = 2;
      used[cross] = 1;
      used[cross + 1] = 1;
    }
    // Entries from the top or the left edge.
    var entries = rng.int(1, 2);
    var tries = 0;
    var made = 0;
    while (made < entries && tries++ < 20) {
      if (rng.chance(0.5)) {
        var ex = rng.int(x0 + 1, x1 - 1);
        if (used[ex] || used[ex - 1] || used[ex + 1]) continue;
        var tn = at(ex, y0);
        if (N.nodes[tn].t !== 'R') continue;
        var dt = add(N, ex, 0, 0, 'D');
        var cl = [];
        for (y = 1; y < y0; y++) cl.push([ex, y]);
        var lt = cl.length ? chain(N, dt, cl) : dt;
        link(N, lt, tn);
        N.nodes[tn].t = 'M';
        used[ex] = 1;
      } else {
        var ey = rng.int(y0 + 1, y1 - 1);
        var tn2 = at(x0, ey);
        if (N.nodes[tn2].t !== 'R' || used['y' + ey]) continue;
        var dl = add(N, 0, ey, 0, 'D');
        var cl2 = [];
        for (x = 1; x < x0; x++) cl2.push([x, ey]);
        var lt2 = cl2.length ? chain(N, dl, cl2) : dl;
        link(N, lt2, tn2);
        N.nodes[tn2].t = 'M';
        used['y' + ey] = 1;
      }
      N.mg++;
      made++;
    }
    if (!made) return null;
    // Exits: switches on the right side (out to the right) and the bottom (out down).
    var cand = [];
    for (y = y0; y <= y1; y++) cand.push([x1, y, 0]);
    for (x = x0; x < x1; x++) if (!used[x]) cand.push([x, y1, 1]);
    rng.shuffle(cand);
    var exits = rng.int(p.exits ? p.exits[0] : 2, p.exits ? p.exits[1] : 3);
    var done = 0;
    for (var c = 0; c < cand.length && done < exits; c++) {
      var e = cand[c];
      var nid = at(e[0], e[1]);
      if (N.nodes[nid].t !== 'R' || !farFromSwitches(N, e[0], e[1], 2)) continue;
      var out = [];
      if (e[2] === 0) for (x = e[0] + 1; x <= W - 1; x++) out.push([x, e[1]]);
      else for (y = e[1] + 1; y <= H - 1; y++) out.push([e[0], y]);
      var free = true;
      out.forEach(function (cc) { if (at(cc[0], cc[1]) >= 0) free = false; });
      if (!free || !out.length) continue;
      N.nodes[nid].t = 'W';
      var fo = N.nodes.length;
      chain(N, -1, out, 'S');
      link(N, nid, fo);
      N.sw++;
      done++;
    }
    if (done < 2) return null;
    N.ring = true;
    return N;
  }

  /** A level from a network: kinds of switches, a schedule and a planned solution (or null). */
  function plan(N, p, rng) {
    var nodes = N.nodes;
    var sws = [];
    var depots = [];
    var stations = [];
    nodes.forEach(function (d, i) {
      if (d.t === 'W') sws.push(i);
      if (d.t === 'D') depots.push(i);
      if (d.t === 'S') stations.push(i);
    });
    if (stations.length < 2 || stations.length > COLORS || !sws.length) return null;
    var weights = KINDS.map(function (k) { return (p.kinds && p.kinds[k]) || 0; });
    sws.forEach(function (s) {
      var d = nodes[s];
      d.k = rng.weighted(KINDS, weights) || 'm';
      if (d.k === 'n') d.n = rng.int(1, p.countMax || 2);
    });
    if (p.need && !sws.some(function (s) { return nodes[s].k === p.need; })) {
      var forced = nodes[sws[rng.int(sws.length)]];
      forced.k = p.need;
      if (p.need === 'n') forced.n = rng.int(1, p.countMax || 2);
    }
    sws.forEach(function (s) {
      var d = nodes[s];
      d.v = d.k === 'm' ? 1 : (d.k === 'f' || d.k === 'n') && rng.chance(p.setShare === undefined ? 0.5 : p.setShare) ? 1 : 0;
      if (d.k === 'c') d.v = 0;
    });
    if (!sws.some(function (s) { return nodes[s].v; })) {
      var any = nodes[sws[rng.int(sws.length)]];
      if (any.k === 'c') return null;
      any.v = 1;
    }
    var T = rng.int(p.trains[0], p.trains[1]);
    if (T < depots.length) T = depots.length;
    var B = rng.int(p.delay[0], p.delay[1]);
    var palette = rng.shuffle([0, 1, 2, 3, 4, 5]);
    stations.forEach(function (s, i) { nodes[s].c = palette[i]; });
    for (var attempt = 0; attempt < 50; attempt++) {
      var trains = [];
      var order = [];
      var i;
      for (i = 0; i < depots.length; i++) order.push(depots[i]);
      while (order.length < T) order.push(depots[rng.int(depots.length)]);
      rng.shuffle(order);
      var nextAt = {};
      depots.forEach(function (d) { nextAt[d] = rng.int(0, p.start || 2); });
      for (i = 0; i < T; i++) {
        var dep = order[i];
        var len = p.len2 && rng.chance(p.len2) ? 2 : 1;
        var tt = nextAt[dep];
        trains.push({ d: dep, t: tt, l: len });
        nextAt[dep] = tt + len + rng.int(p.gap ? p.gap[0] : 1, p.gap ? p.gap[1] : 3);
      }
      trains.sort(function (a, b) { return a.t - b.t || a.d - b.d; });
      var planned = [];
      sws.forEach(function () { planned.push(rng.int(2)); });
      var dl = [];
      for (i = 0; i < T; i++) dl.push(0);
      if (B > 0 && rng.chance(p.pDelay === undefined ? 0.5 : p.pDelay)) {
        var spend = rng.int(1, B);
        for (var s2 = 0; s2 < spend; s2++) dl[rng.int(T)]++;
      }
      var lv = { w: N.w, h: N.h, nodes: export_(nodes), trains: trains, delay: B };
      var L = compile(lv);
      var picks = {};
      var posAll = planned;
      var code = run(L, null, dl, {
        free: true, pos: posAll,
        pick: function (tr, sw) {
          var k = tr + ':' + sw;
          if (picks[k] === undefined) picks[k] = rng.int(2);
          return picks[k];
        }
      });
      if (code !== WIN) continue;
      var arrived = Array.prototype.slice.call(L.arrived);
      for (i = 0; i < T; i++) trains[i].c = nodes[arrived[i]].c;
      // The labels of colour switches from where the trains went.
      var labelsOk = true;
      sws.forEach(function (s) {
        if (!labelsOk || nodes[s].k !== 'c') return;
        var left = {};
        var right = {};
        var nl = 0;
        for (var k in picks) {
          var parts = k.split(':');
          if (Number(parts[1]) !== s) continue;
          var col = trains[Number(parts[0])].c;
          if (picks[k]) right[col] = 1;
          else {
            if (!left[col]) nl++;
            left[col] = 1;
          }
        }
        if (nl > 1) {
          labelsOk = false;
          return;
        }
        var label = -1;
        for (var lc in left) label = Number(lc);
        if (label < 0) {
          var cands = palette.filter(function (cc) { return !right[cc]; });
          if (!cands.length) {
            labelsOk = false;
            return;
          }
          label = cands[rng.int(cands.length)];
        }
        if (right[label]) labelsOk = false;
        nodes[s].c = label;
      });
      if (!labelsOk) continue;
      lv = { w: N.w, h: N.h, nodes: export_(nodes), trains: trains, delay: B };
      // The planned positions become the fixed starts of the switches the player does not set.
      lv.nodes.forEach(function (d, ni) {
        var si = sws.indexOf(ni);
        if (si >= 0) d.p = planned[si];
      });
      var L2 = compile(lv);
      var swv = L2.vars.map(function (vn) { return planned[sws.indexOf(vn)]; });
      if (run(L2, swv, dl) !== WIN) continue;
      lv.plan = { sw: swv, dl: dl };
      // The start: the player's switches turned away from the plan, and not a solution itself.
      for (var st = 0; st < 12; st++) {
        var same = true;
        L2.vars.forEach(function (vn, vi) {
          lv.nodes[vn].p = rng.int(2);
          if (lv.nodes[vn].p !== swv[vi]) same = false;
        });
        if (same) {
          var fv = L2.vars[rng.int(L2.vars.length)];
          lv.nodes[fv].p = 1 - lv.nodes[fv].p;
        }
        var L3 = compile(lv);
        if (run(L3, null, null) !== WIN) return lv;
      }
      return null;
    }
    return null;
  }

  function export_(nodes) {
    return nodes.map(function (d) {
      var o = { x: d.x, y: d.y, t: d.t, o: d.o.slice() };
      if (d.z) o.z = d.z;
      if (d.t === 'W') {
        o.k = d.k || 'm';
        if (d.k === 'c') o.c = d.c === undefined ? 0 : d.c;
        if (d.k === 'n') o.n = d.n || 1;
        o.v = d.v ? 1 : 0;
        o.p = d.p ? 1 : 0;
      }
      if (d.t === 'S') o.c = d.c;
      return o;
    });
  }

  /**
   * A checked level by the parameters of a chapter (or the day): a network, a plan, the brute
   * force, the rules of the spec. Returns the level with S, V, par, dpar, d, sol — or null.
   * p.cap — the most variants to try (2^14 on the PC, 2^12 on the phone).
   */
  function candidate(p, rng) {
    var N = p.shape === 'corridor' ? corridorNet(p, rng) : p.shape === 'ring' ? ringNet(p, rng) : growNet(p, rng);
    if (!N) return null;
    if (N.sw < p.sw[0] || N.sw > p.sw[1]) return null;
    if (N.mg < p.merges[0] || N.mg > p.merges[1]) return null;
    if (p.bridgesMin && (N.bridges || 0) < p.bridgesMin) return null;
    var lv = plan(N, p, rng);
    if (!lv) return null;
    var V = variantCount(lv);
    if (V > (p.cap || 16384)) return null;
    var s = solve(lv, { cap: p.cap || 16384 });
    if (s.over || !s.S || s.startWin || s.useless.length) return null;
    var limit = Math.max(1, Math.floor((p.share === undefined ? 0.05 : p.share) * s.V));
    if (s.S > limit) return null;
    if (p.needDelay && s.zeroDelay) return null;
    lv.S = s.S;
    lv.V = s.V;
    lv.par = s.par;
    lv.dpar = s.dpar;
    lv.sol = s.best;
    lv.merges = N.mg;
    lv.bridges = N.bridges || 0;
    lv.shape = p.shape || 'tree';
    lv.d = difficulty(s.V, s.S, lv.trains.length, N.mg);
    if (p.dMin && lv.d < p.dMin) return null;
    lv.kinds = kindsOf(lv);
    delete lv.plan;
    return lv;
  }

  function kindsOf(lv) {
    var k = {};
    lv.nodes.forEach(function (d) { if (d.t === 'W') k[d.k] = 1; });
    return KINDS.filter(function (x) { return k[x]; });
  }

  /** Up to `tries` candidates until one passes; null when none did. */
  function generate(p, rng, tries) {
    for (var i = 0; i < (tries || 200); i++) {
      var lv = candidate(p, rng);
      if (lv) return lv;
    }
    return null;
  }

  // ---- names -----------------------------------------------------------------------------------------

  /** A made-up name of a station from the tables of content/names.json: «Ольховая», «Тихий переезд». */
  function stationName(tables, rng) {
    if (!tables || !tables.fem) return 'Станция ' + (rng.int(90) + 10);
    var r = rng.next();
    if (r < 0.5) return rng.pick(tables.fem);
    if (r < 0.85) return rng.pick(tables.masc) + ' ' + rng.pick(tables.noun);
    return rng.pick(tables.root) + rng.pick(tables.suffix);
  }

  /** Names for the stations of a level (no repeats within one level); the level's name is the first. */
  function nameStations(lv, tables, rng) {
    var seen = {};
    lv.nodes.forEach(function (d) {
      if (d.t !== 'S') return;
      var name = stationName(tables, rng);
      for (var k = 0; k < 8 && seen[name]; k++) name = stationName(tables, rng);
      seen[name] = 1;
      d.nm = name;
    });
    return lv;
  }

  // ---- the level of the day and the challenge of the week --------------------------------------------

  /** The level of a date seed (the same for one date on any phone): params of content/chapters.json. */
  function seeded(seedText, p, tables, tries) {
    var rng = Rng.make(Rng.hash(seedText));
    var lv = null;
    var list = [].concat(p);
    for (var i = 0; i < list.length && !lv; i++) lv = generate(list[i], rng, tries || 120);
    if (!lv) return null;
    nameStations(lv, tables, Rng.make(Rng.hash(seedText + ':names')));
    lv.id = seedText;
    return lv;
  }

  /** «2026-W46» — the ISO week of a day key «2026-11-14». */
  function weekKey(dayKey) {
    var parts = String(dayKey).split('-');
    var d = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])));
    var day = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - day);
    var y0 = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    var week = Math.ceil(((d - y0) / 86400000 + 1) / 7);
    return d.getUTCFullYear() + '-W' + (week < 10 ? '0' : '') + week;
  }

  return {
    TYPE: TYPE, KINDS: KINDS, KIND_TITLES: KIND_TITLES, COLORS: COLORS,
    compile: compile, run: run, simulate: simulate, nextNode: nextNode,
    delayVectors: delayVectors, variantCount: variantCount, solve: solve, difficulty: difficulty, stars: stars, varNodes: varNodes,
    growNet: growNet, corridorNet: corridorNet, ringNet: ringNet, grow: grow, plan: plan, candidate: candidate, generate: generate,
    kindsOf: kindsOf, stationName: stationName, nameStations: nameStations, seeded: seeded, weekKey: weekKey
  };
});
