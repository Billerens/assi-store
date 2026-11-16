// The factory of «Конвейеры»: the plot, the buildings 1×1 and the step of the simulation. Shared
// subset of JavaScript (screen: window.ConveyorFactory; engine and node: require). No class,
// no async, no f(...args), no for (let …); randomness only from the rng given (E.rng).
//
// A building is plain data in state.run.b: {x, y, t, d, …} where t is the type and d the
// direction of its output (0 right, 1 down, 2 left, 3 up). Fields by type:
//   belt      it: {i, p, a} | null   — the item on it (id, progress 0..1, age for melting ice)
//   tunnel    it (the exit's slot), q: [{i, p, a}] (the entry's queue under the ground)
//   drill     c (progress to the next ore), o (the ore waiting to leave), rf (richness last seen)
//   furnace, assembler   r (recipe), s {item: count} (inputs), w (working), c (progress), o [outputs]
//   splitter  h (the item held), k (whose turn)        sorter  h, f (the item that goes forward)
//   storage   s [items]                                  dock    c, k (place in the schedule), o
// The step needs an environment E made by sim.js: speeds, capacities, the world (items and the
// recipes open on this planet), flags of events and E.sell(item) — what a port does with an item.
(function (root, make) {
  var api = make();
  if (typeof exports !== 'undefined') { for (var k in api) exports[k] = api[k]; } else { root.ConveyorFactory = api; }
})(this, function () {
  'use strict';

  var DX = [1, 0, -1, 0];
  var DY = [0, 1, 0, -1];
  // Progress counts to 1 by steps of 0.1: 0.1 added ten times is 0.9999…, so a hair under 1 is 1.
  var ONE = 1 - 1e-9;
  var TYPES = ['drill', 'belt', 'tunnel', 'furnace', 'assembler', 'splitter', 'sorter', 'storage', 'port', 'dock'];

  function back(d) { return (d + 2) % 4; }

  function dirOf(dx, dy) {
    if (dx > 0) return 0;
    if (dy > 0) return 1;
    if (dx < 0) return 2;
    return 3;
  }

  /** A new building of type t at x, y facing d. */
  function make(t, x, y, d) {
    var b = { x: x, y: y, t: t, d: d || 0 };
    if (t === 'belt') b.it = null;
    else if (t === 'tunnel') {
      b.it = null;
      b.q = [];
    } else if (t === 'drill' || t === 'dock') {
      b.c = 0;
      b.o = '';
      if (t === 'dock') b.k = 0;
      else b.rf = 1;
    } else if (t === 'furnace' || t === 'assembler') {
      b.r = '';
      b.s = {};
      b.w = 0;
      b.c = 0;
      b.o = [];
    } else if (t === 'splitter') {
      b.h = '';
      b.k = 0;
    } else if (t === 'sorter') {
      b.h = '';
      b.f = '';
    } else if (t === 'storage') b.s = [];
    return b;
  }

  /** The building without what it carries (blueprints, undo of a removal). */
  function bare(b) {
    var out = make(b.t, b.x, b.y, b.d);
    if (b.r) out.r = b.r;
    if (b.f) out.f = b.f;
    return out;
  }

  // ---- the cache of lookups (not saved: rebuilt when the layout changes) ----

  var cached = null;

  function key(c, x, y) { return y * c.w + x; }

  function inside(c, x, y) { return x >= 0 && y >= 0 && x < c.w && y < c.h; }

  function at(c, x, y) { return inside(c, x, y) ? c.grid[y * c.w + x] : null; }

  function front(c, b) { return at(c, b.x + DX[b.d], b.y + DY[b.d]); }

  function isSlot(c, b) {
    if (!b) return false;
    if (b.t === 'belt') return true;
    if (b.t === 'tunnel') return !c.entryKey[key(c, b.x, b.y)];
    return false;
  }

  /** Lookups for a run: grid, lists by type, tunnel pairs, the order of belts (downstream first). */
  function cache(run, range) {
    range = range || 4;
    if (cached && cached.run === run && cached.lv === run.lv && cached.w === run.w && cached.h === run.h && cached.range === range) return cached;
    var keepFlow = cached && cached.run === run ? cached : null;
    var c = {
      run: run, lv: run.lv, w: run.w, h: run.h, range: range, grid: [], ore: {},
      order: [], drills: [], crafters: [], storages: [], splitters: [], sorters: [], ports: [], docks: [], entries: [], tunnels: 0,
      entryKey: {}, exitOf: {}, dist: {}, idle: keepFlow ? keepFlow.idle : {}, lastSale: keepFlow ? keepFlow.lastSale : {},
      flowA: keepFlow ? keepFlow.flowA : {}, flowB: keepFlow ? keepFlow.flowB : {}, flowT: keepFlow ? keepFlow.flowT : 0,
      time: keepFlow ? keepFlow.time : 0
    };
    var n = c.w * c.h;
    for (var i = 0; i < n; i++) c.grid.push(null);
    var tunnels = [];
    run.b.forEach(function (b) {
      if (!inside(c, b.x, b.y)) return;
      c.grid[key(c, b.x, b.y)] = b;
      if (b.t === 'drill') c.drills.push(b);
      else if (b.t === 'furnace' || b.t === 'assembler') c.crafters.push(b);
      else if (b.t === 'storage') c.storages.push(b);
      else if (b.t === 'splitter') c.splitters.push(b);
      else if (b.t === 'sorter') c.sorters.push(b);
      else if (b.t === 'port') c.ports.push(b);
      else if (b.t === 'dock') c.docks.push(b);
      else if (b.t === 'tunnel') tunnels.push(b);
    });
    c.tunnels = tunnels.length;
    (run.ore || []).forEach(function (o) { if (inside(c, o.x, o.y)) c.ore[key(c, o.x, o.y)] = o; });
    pairTunnels(c, tunnels, range);
    orderSlots(c);
    cached = c;
    return c;
  }

  function along(b) {
    // The position of a tunnel along its own direction: entries come before their exits.
    if (b.d === 0) return b.y * 100000 + b.x;
    if (b.d === 2) return b.y * 100000 - b.x;
    if (b.d === 1) return b.x * 100000 + b.y;
    return b.x * 100000 - b.y;
  }

  function pairTunnels(c, tunnels, range) {
    var used = {};
    tunnels.sort(function (a, b) { return a.d - b.d || along(a) - along(b); });
    tunnels.forEach(function (t) {
      var kt = key(c, t.x, t.y);
      if (used[kt]) return;
      for (var k = 2; k <= range + 1; k++) {
        var u = at(c, t.x + DX[t.d] * k, t.y + DY[t.d] * k);
        if (!u || u.t !== 'tunnel' || u.d !== t.d) continue;
        var ku = key(c, u.x, u.y);
        if (used[ku]) continue;
        used[kt] = true;
        used[ku] = true;
        c.entryKey[kt] = true;
        c.exitOf[kt] = u;
        c.dist[kt] = k;
        c.entries.push(t);
        return;
      }
    });
  }

  function orderSlots(c) {
    var seen = {};
    var exits = {};
    for (var k in c.exitOf) exits[key(c, c.exitOf[k].x, c.exitOf[k].y)] = true;
    c.exitKey = exits;
    c.grid.forEach(function (b) {
      if (!b || !isSlot(c, b) || seen[key(c, b.x, b.y)]) return;
      var chain = [];
      var cur = b;
      while (cur && !seen[key(c, cur.x, cur.y)]) {
        seen[key(c, cur.x, cur.y)] = true;
        chain.push(cur);
        var nx = front(c, cur);
        cur = nx && isSlot(c, nx) && nx.d !== back(cur.d) && !exits[key(c, nx.x, nx.y)] ? nx : null;
      }
      for (var i = chain.length - 1; i >= 0; i--) c.order.push(chain[i]);
    });
  }

  // ---- moving items ----

  function richness(ore, E) {
    if (!ore) return 0;
    if (E.deep || ore.u) return 1;
    return ore.m < E.depleteAt ? 1 : E.slow;
  }

  function outer(c, b, edge) {
    return b.x < edge || b.y < edge || b.x >= c.w - edge || b.y >= c.h - edge;
  }

  function recipeOf(E, b) {
    var r = b.r ? E.world.recipe[b.r] : null;
    return r && r.at === b.t && E.world.open[r.id] ? r : null;
  }

  /** Picks the recipe of a crafter by the item that came, when only one open recipe takes it. */
  function autoRecipe(E, b, item) {
    var list = E.world.byAt[b.t] || [];
    var found = null;
    for (var i = 0; i < list.length; i++) {
      if (!E.world.open[list[i].id] || !list[i].in[item]) continue;
      if (found) return null;
      found = list[i];
    }
    return found;
  }

  function stamp(c, b, what) { c.idle[key(c, b.x, b.y)] = what || ''; }

  /** Whether building t takes the item that travels in direction dir; takes it when it does. */
  function accept(c, E, t, item, dir, age, carry) {
    if (!t) return false;
    var kt = key(c, t.x, t.y);
    switch (t.t) {
      case 'belt':
        if (t.it || t.d === back(dir)) return false;
        t.it = { i: item, p: Math.max(0, Math.min(carry || 0, 0.5)), a: age || 0 };
        return true;
      case 'tunnel':
        if (t.d === back(dir)) return false;
        if (c.exitKey[kt]) return false;
        if (c.entryKey[kt]) {
          var q = t.q;
          if (q.length && q[q.length - 1].p < ONE) return false;
          q.push({ i: item, p: 0, a: age || 0 });
          return true;
        }
        if (t.it) return false;
        t.it = { i: item, p: Math.max(0, Math.min(carry || 0, 0.5)), a: age || 0 };
        return true;
      case 'port':
        E.sell(item, t);
        c.lastSale[kt] = c.time;
        return true;
      case 'storage':
        if (t.s.length >= E.storageCap) return false;
        t.s.push(item);
        return true;
      case 'splitter':
      case 'sorter':
        if (t.h) return false;
        t.h = item;
        return true;
      case 'furnace':
      case 'assembler':
        var r = recipeOf(E, t);
        if (!r) {
          r = autoRecipe(E, t, item);
          if (!r) return false;
          t.r = r.id;
          t.s = {};
        }
        var need = r.in[item];
        if (!need) return false;
        var have = t.s[item] || 0;
        if (have >= need * E.inCap) return false;
        t.s[item] = have + 1;
        return true;
      default:
        return false;
    }
  }

  function give(c, E, b, dir, item) {
    return accept(c, E, at(c, b.x + DX[dir], b.y + DY[dir]), item, dir, 0, 0);
  }

  /** Gives an item out of a building: by its arrow first, else onto any belt that leads away from it. */
  function emit(c, E, b, item) {
    if (give(c, E, b, b.d, item)) return true;
    for (var j = 1; j < 4; j++) {
      var d = (b.d + j) % 4;
      var t = at(c, b.x + DX[d], b.y + DY[d]);
      if (t && t.t === 'belt' && t.d === d && accept(c, E, t, item, d, 0, 0)) return true;
    }
    return false;
  }

  function flow(c, b) {
    var k = key(c, b.x, b.y);
    c.flowA[k] = (c.flowA[k] || 0) + 1;
  }

  function beltSpeed(c, E, b, item) {
    if (E.storm && outer(c, b, E.stormEdge)) return 0;
    var def = E.world.items[item];
    return E.belt * (def && def.fluid ? E.lava : 1);
  }

  function melting(E, item) {
    var def = E.world.items[item];
    return !!(def && def.melts);
  }

  /** One step of dt seconds (sim.js keeps dt at 0.1 s or less). */
  function step(run, E, dt) {
    var c = cache(run, E.tunnelRange);
    var i;
    var b;
    c.time += dt;
    c.flowT += dt;
    if (c.flowT >= 30) {
      c.flowB = c.flowA;
      c.flowA = {};
      c.flowT = 0;
    }

    for (i = 0; i < c.docks.length; i++) {
      b = c.docks[i];
      if (!b.o && E.cargo.length) {
        b.c += E.dock * dt;
        if (b.c >= ONE) {
          b.c -= 1;
          b.o = E.cargo[b.k % E.cargo.length];
          b.k = (b.k + 1) % E.cargo.length;
        }
      }
      if (b.c > 1) b.c = 1;
      if (b.o && emit(c, E, b, b.o)) b.o = '';
      stamp(c, b, b.o ? 'выход забит' : '');
    }

    for (i = 0; i < c.drills.length; i++) {
      b = c.drills[i];
      var ore = c.ore[key(c, b.x, b.y)];
      if (!ore) {
        stamp(c, b, 'не на руде');
        continue;
      }
      var rich = richness(ore, E);
      b.rf = rich;
      if (!b.o) {
        b.c += E.drill * rich * dt;
        if (b.c >= ONE) {
          b.c -= 1;
          b.o = ore.r;
          ore.m += 1;
        }
      }
      if (b.c > 1) b.c = 1;
      if (b.o && emit(c, E, b, b.o)) b.o = '';
      stamp(c, b, b.o ? 'выход забит' : '');
    }

    for (i = 0; i < c.crafters.length; i++) {
      b = c.crafters[i];
      var r = recipeOf(E, b);
      if (r && !b.w) {
        var ready = b.o.length < E.outCap;
        for (var item in r.in) if (!((b.s[item] || 0) >= r.in[item])) ready = false;
        if (ready) {
          for (var used in r.in) b.s[used] -= r.in[used];
          b.w = 1;
        } else b.c = 0;
      }
      if (r && b.w) {
        var speed = b.t === 'furnace' ? (E.outage ? 0 : E.furnace) : E.assembler;
        b.c += speed * dt / r.sec;
        if (b.c >= ONE) {
          b.c -= 1;
          b.w = 0;
          var n = r.n;
          if (b.t === 'assembler' && E.double > 0 && E.rng.next() < E.double) n *= 2;
          for (var m = 0; m < n; m++) b.o.push(r.out);
        }
      }
      if (b.o.length && emit(c, E, b, b.o[0])) b.o.shift();
      stamp(c, b, !r ? 'нет рецепта' : b.w ? (b.t === 'furnace' && E.outage ? 'нет питания' : '') : b.o.length >= E.outCap ? 'выход забит' : 'нет входа');
    }

    for (i = 0; i < c.splitters.length; i++) {
      b = c.splitters[i];
      if (!b.h) {
        stamp(c, b, 'нет входа');
        continue;
      }
      var outs = [b.d, (b.d + 3) % 4, (b.d + 1) % 4];
      for (var j = 0; j < 3; j++) {
        var o = (b.k + j) % 3;
        if (give(c, E, b, outs[o], b.h)) {
          b.h = '';
          b.k = (o + 1) % 3;
          break;
        }
      }
      stamp(c, b, b.h ? 'выход забит' : '');
    }

    for (i = 0; i < c.sorters.length; i++) {
      b = c.sorters[i];
      if (!b.h) {
        stamp(c, b, 'нет входа');
        continue;
      }
      var done = b.h === b.f ? give(c, E, b, b.d, b.h) : give(c, E, b, (b.d + 3) % 4, b.h) || give(c, E, b, (b.d + 1) % 4, b.h);
      if (done) b.h = '';
      stamp(c, b, b.h ? 'выход забит' : '');
    }

    for (i = 0; i < c.storages.length; i++) {
      b = c.storages[i];
      if (b.s.length && emit(c, E, b, b.s[0])) b.s.shift();
      stamp(c, b, b.s.length >= E.storageCap ? 'склад полон' : '');
    }

    for (i = 0; i < c.order.length; i++) {
      b = c.order[i];
      var it = b.it;
      if (!it) continue;
      it.p += beltSpeed(c, E, b, it.i) * dt;
      if (melting(E, it.i)) {
        it.a = (it.a || 0) + dt;
        if (it.a >= E.melt) {
          b.it = null;
          continue;
        }
      }
      if (it.p >= ONE) {
        if (accept(c, E, front(c, b), it.i, b.d, it.a, it.p - 1)) {
          b.it = null;
          flow(c, b);
        } else it.p = 1;
      }
    }

    for (i = 0; i < c.entries.length; i++) {
      b = c.entries[i];
      var q = b.q;
      if (!q.length) continue;
      var kb = key(c, b.x, b.y);
      var L = c.dist[kb];
      var exit = c.exitOf[kb];
      for (var e = 0; e < q.length; e++) {
        q[e].p += beltSpeed(c, E, b, q[e].i) * dt;
        var lim = e === 0 ? L : q[e - 1].p - 1;
        if (q[e].p > lim) q[e].p = lim;
        if (melting(E, q[e].i)) q[e].a = (q[e].a || 0) + dt;
      }
      for (e = q.length - 1; e >= 0; e--) if (melting(E, q[e].i) && q[e].a >= E.melt) q.splice(e, 1);
      if (q.length && q[0].p >= L - 1e-9 && !exit.it) {
        exit.it = { i: q[0].i, p: 0, a: q[0].a || 0 };
        q.shift();
        flow(c, b);
      }
    }

    for (i = 0; i < c.ports.length; i++) {
      b = c.ports[i];
      var kp = key(c, b.x, b.y);
      if (E.sidePort) {
        for (var d = 0; d < 4; d++) {
          var nb = at(c, b.x + DX[d], b.y + DY[d]);
          if (!nb || !isSlot(c, nb) || !nb.it || nb.it.p < 0.5) continue;
          if (front(c, nb) === b) continue;
          E.sell(nb.it.i, b);
          nb.it = null;
          c.lastSale[kp] = c.time;
        }
      }
      stamp(c, b, c.time - (c.lastSale[kp] === undefined ? -1e9 : c.lastSale[kp]) > 10 ? 'нет входа' : '');
    }
  }

  // ---- what the screen and sim.js ask ----

  /** Items a minute through a belt (the research «Счётчики»). */
  function flowRate(run, b) {
    var c = cached && cached.run === run ? cached : null;
    if (!c) return 0;
    var k = key(c, b.x, b.y);
    return ((c.flowA[k] || 0) + (c.flowB[k] || 0)) * 60 / (30 + c.flowT);
  }

  /** Why a building stands ('' when it works). */
  function idleOf(run, b) {
    var c = cached && cached.run === run ? cached : null;
    if (!c || b.t === 'belt' || b.t === 'tunnel') return '';
    return c.idle[key(c, b.x, b.y)] || '';
  }

  /** Buildings that stand now (not belts): [building]. */
  function idleList(run) {
    var c = cached && cached.run === run ? cached : null;
    if (!c) return [];
    var out = [];
    run.b.forEach(function (b) {
      if (b.t === 'belt' || b.t === 'tunnel' || b.t === 'dock') return;
      if (c.idle[key(c, b.x, b.y)]) out.push(b);
    });
    return out;
  }

  /** How many items are inside the factory (belts, tunnels, buffers). */
  function itemCount(run) {
    var n = 0;
    run.b.forEach(function (b) {
      if (b.it) n++;
      if (b.q) n += b.q.length;
      if (b.o && typeof b.o === 'string') n++;
      else if (b.o && b.o.length) n += b.o.length;
      if (b.h) n++;
      if (b.t === 'storage') n += b.s.length;
      else if (b.s) for (var k in b.s) n += b.s[k];
    });
    return n;
  }

  function findAt(run, x, y) {
    for (var i = 0; i < run.b.length; i++) if (run.b[i].x === x && run.b[i].y === y) return run.b[i];
    return null;
  }

  function oreAt(run, x, y) {
    var list = run.ore || [];
    for (var i = 0; i < list.length; i++) if (list[i].x === x && list[i].y === y) return list[i];
    return null;
  }

  /** The cells of a belt line from (x0, y0) to (x1, y1) as the letter Г: [{x, y, d}]. */
  function line(x0, y0, x1, y1, vertical, d0) {
    var cx = vertical ? x0 : x1;
    var cy = vertical ? y1 : y0;
    var pts = [];
    function walk(ax, ay, bx, by) {
      var x = ax;
      var y = ay;
      var sx = bx > ax ? 1 : bx < ax ? -1 : 0;
      var sy = by > ay ? 1 : by < ay ? -1 : 0;
      while (x !== bx || y !== by) {
        pts.push([x, y]);
        x += sx;
        y += sy;
      }
    }
    walk(x0, y0, cx, cy);
    walk(cx, cy, x1, y1);
    pts.push([x1, y1]);
    var out = [];
    for (var i = 0; i < pts.length; i++) {
      var p = pts[i];
      var q = pts[i + 1];
      var d;
      if (q) d = dirOf(q[0] - p[0], q[1] - p[1]);
      else if (i > 0) d = out[i - 1].d;
      else d = d0 || 0;
      out.push({ x: p[0], y: p[1], d: d });
    }
    return out;
  }

  // ---- making the plot ----

  function free(run, x, y, gap) {
    var list = run.ore || [];
    for (var i = 0; i < list.length; i++) {
      var o = list[i];
      if (Math.abs(o.x - x) <= gap && Math.abs(o.y - y) <= gap) return false;
    }
    for (var j = 0; j < run.b.length; j++) if (run.b[j].x === x && run.b[j].y === y) return false;
    return true;
  }

  /**
   * A patch of ore of `res` with `size` cells inside the region {x0, y0, x1, y1} (exclusive ends):
   * a blob grown from a random cell, one cell away from other patches. Returns the cells added.
   */
  function patch(run, rng, res, size, region, extra) {
    var tries = 0;
    while (tries++ < 60) {
      var sx = rng.int(region.x0 + 1, Math.max(region.x0 + 1, region.x1 - 2));
      var sy = rng.int(region.y0 + 1, Math.max(region.y0 + 1, region.y1 - 2));
      if (!free(run, sx, sy, 1)) continue;
      var cells = [[sx, sy]];
      var guard = 0;
      while (cells.length < size && guard++ < size * 20) {
        var base = rng.pick(cells);
        var d = rng.int(4);
        var nx = base[0] + DX[d];
        var ny = base[1] + DY[d];
        if (nx < region.x0 || ny < region.y0 || nx >= region.x1 || ny >= region.y1) continue;
        var dup = false;
        for (var k = 0; k < cells.length; k++) if (cells[k][0] === nx && cells[k][1] === ny) dup = true;
        if (dup || !free(run, nx, ny, 1)) continue;
        cells.push([nx, ny]);
      }
      var added = [];
      cells.forEach(function (p) {
        var o = { x: p[0], y: p[1], r: res, m: 0 };
        if (extra) for (var f in extra) o[f] = extra[f];
        run.ore.push(o);
        added.push(o);
      });
      return added;
    }
    return [];
  }

  return {
    DX: DX, DY: DY, TYPES: TYPES, back: back, dirOf: dirOf, make: make, bare: bare,
    cache: cache, at: function (run, x, y, range) { return at(cache(run, range), x, y); }, findAt: findAt, oreAt: oreAt,
    step: step, richness: richness, outer: outer, line: line, patch: patch,
    flowRate: flowRate, idleOf: idleOf, idleList: idleList, itemCount: itemCount,
    tunnelCount: function (run) { var n = 0; run.b.forEach(function (b) { if (b.t === 'tunnel') n++; }); return n; },
    exitOf: function (run, b, range) {
      var c = cache(run, range);
      return c.exitOf[key(c, b.x, b.y)] || null;
    },
    isEntry: function (run, b, range) {
      var c = cache(run, range);
      return !!c.entryKey[key(c, b.x, b.y)];
    },
    isExit: function (run, b, range) {
      var c = cache(run, range);
      return !!c.exitKey[key(c, b.x, b.y)];
    }
  };
});
