// The endless mode of «Ветки поездов»: a small network that grows, trains without a stop, switches
// turned on the go — and the dispatcher that plans every train before it leaves the depot.
// Shared subset of JavaScript: the screen (window.Endless), the engine (Rhino, require) and node.
//
// The dispatcher. A new train gets a colour and a route only when the route is safe with the trains
// already planned: no cell of it is taken by another train within one tick, and at every switch two
// trains one after another that need different positions pass at least `reaction` seconds plus a
// tick apart (the player has time to turn it). When nothing is safe, the departure waits. So a
// careful player always has a way; only the player errs. The bot of tests/endless.test.js turns the
// switches exactly as planned and delivers 10 000 trains without a loss.
//
// The run is plain data (state.run.live): the network, the trains on the rails with their planned
// paths, the queue of planned departures, lives, score, the series multiplier. Ticks: a train moves
// one cell a tick; a tick lasts endless.tickSec / speed seconds.
(function (root, make) {
  var node = typeof require === 'function' && typeof exports !== 'undefined';
  var api = node ? make(require('./rails.js'), require('../engine/rng.js')) : make(root.Rails, root.Rng);
  if (typeof exports !== 'undefined') { for (var k in api) exports[k] = api[k]; } else { root.Endless = api; }
})(this, function (Rails, Rng) {
  'use strict';

  var SIDING = 2;

  function num(cfg, key, dflt) {
    var v = cfg && cfg[key];
    return typeof v === 'number' && isFinite(v) ? v : dflt;
  }

  // ---- the network -----------------------------------------------------------------------------------

  function cellOf(live, n) {
    var d = live.nodes[n];
    return ((d.z || 0) * live.h + d.y) * live.w + d.x;
  }

  function revealed(live, n) { return live.rev.indexOf(n) >= 0; }

  /** Every route from a depot to a station over what is open: hidden switches stand on «налево». */
  function routes(live, depot) {
    var out = [];
    var path = [depot];
    function walk(n) {
      var d = live.nodes[n];
      if (d.t === 'S') {
        out.push(path.slice());
        return;
      }
      if (path.length > live.w * live.h * 2) return;
      var next = d.t === 'W' && revealed(live, n) ? d.o : [d.o[0]];
      for (var i = 0; i < next.length; i++) {
        if (next[i] === undefined || next[i] < 0) continue;
        path.push(next[i]);
        walk(next[i]);
        path.pop();
      }
    }
    walk(depot);
    return out;
  }

  /** Nodes on the screen: what the open depots reach over the open switches. */
  function visible(live) {
    var seen = [];
    for (var i = 0; i < live.nodes.length; i++) seen.push(0);
    var stack = live.dep.slice();
    while (stack.length) {
      var n = stack.pop();
      if (seen[n]) continue;
      seen[n] = 1;
      var d = live.nodes[n];
      var next = d.t === 'W' && revealed(live, n) ? d.o : d.o.length ? [d.o[0]] : [];
      for (var j = 0; j < next.length; j++) if (next[j] >= 0 && !seen[next[j]]) stack.push(next[j]);
    }
    return seen;
  }

  function stationsSeen(live) {
    var v = visible(live);
    var out = [];
    live.nodes.forEach(function (d, i) { if (v[i] && d.t === 'S') out.push(i); });
    return out;
  }

  /** What one more open item (a switch or a depot) would add: the count of new stations. */
  function gainOf(live, item) {
    var before = stationsSeen(live).length;
    var d = live.nodes[item];
    if (d.t === 'W') live.rev.push(item);
    else live.dep.push(item);
    var after = stationsSeen(live).length;
    if (d.t === 'W') live.rev.pop();
    else live.dep.pop();
    return after - before;
  }

  /**
   * A new run: a network by the growth generator of the puzzles (rails.js), all its switches
   * manual; stage 0 shows one depot, one switch and two stations; every growth opens one more
   * switch or depot (the order is fixed at the start). o: {names, depot2, lives, siding, tables}.
   */
  function create(cfg, rng, o) {
    o = o || {};
    var p = {
      w: num(cfg, 'endless.w', 5), h: num(cfg, 'endless.h', 8), depots: [2, 2],
      swMax: num(cfg, 'endless.switchesMax', 6), mgMax: num(cfg, 'endless.mergesMax', 2),
      pSwitch: num(cfg, 'endless.pSwitch', 0.55), pMerge: num(cfg, 'endless.pMerge', 0.5), pStation: num(cfg, 'endless.pStation', 0.45)
    };
    var swMin = num(cfg, 'endless.switchesMin', 4);
    for (var attempt = 0; attempt < 400; attempt++) {
      var N = Rails.growNet(p, rng);
      if (!N || N.sw < swMin) continue;
      var nodes = N.nodes.map(function (d) {
        var x = { x: d.x, y: d.y, t: d.t, o: d.o.slice() };
        if (d.z) x.z = d.z;
        return x;
      });
      var stations = [];
      var depots = [];
      nodes.forEach(function (d, i) {
        if (d.t === 'S') stations.push(i);
        if (d.t === 'D') depots.push(i);
      });
      if (stations.length < 3 || stations.length > Rails.COLORS || depots.length < 2) continue;
      var live = {
        v: 1, w: p.w, h: p.h, nodes: nodes, rev: [], dep: [], order: [], stage: 0, side: -1, pos: [],
        tick: 0, acc: 0, speed: 1, trains: [], queue: [], nextId: 1, lastOut: -99, last: {},
        rs: 0, lives: 0, maxLives: 0, score: 0, mult: 1, delivered: 0, crashes: 0, wrong: 0, sided: 0,
        clean: 0, bestClean: 0, brakes: 0, signals: 0, slow: 0, slowK: 1, ev: [], evn: 0, over: 0, paused: 0,
        startMult: 1, armed: 0
      };
      nodes.forEach(function () { live.pos.push(0); });
      // Stage 0: the first switch on the way of one depot, two stations behind it.
      rng.shuffle(depots);
      var first = -1;
      var n = depots[0];
      for (var guard = 0; guard < 99 && first < 0; guard++) {
        var d0 = nodes[n];
        if (d0.t === 'W') first = n;
        else if (d0.t === 'S' || !d0.o.length) break;
        else n = d0.o[0];
      }
      if (first < 0) continue;
      live.dep.push(depots[0]);
      live.rev.push(first);
      if (stationsSeen(live).length < 2) continue;
      // The order of growth: each step adds a station (a switch) or a depot.
      var hidden = nodes.map(function (d, i) { return d.t === 'W' && i !== first ? i : -1; }).filter(function (i) { return i >= 0; });
      var rest = depots.slice(1);
      var steps = [];
      var probe = { nodes: nodes, rev: live.rev.slice(), dep: live.dep.slice(), w: p.w, h: p.h };
      for (var s = 0; s < 20; s++) {
        var vis = visible(probe);
        var cand = [];
        hidden.forEach(function (w) { if (vis[w] && probe.rev.indexOf(w) < 0 && gainOf(probe, w) > 0) cand.push(w); });
        rest.forEach(function (dd) { if (probe.dep.indexOf(dd) < 0) cand.push(dd); });
        if (!cand.length) break;
        var pick = cand[rng.int(cand.length)];
        steps.push(pick);
        if (nodes[pick].t === 'W') probe.rev.push(pick);
        else probe.dep.push(pick);
      }
      if (steps.length < num(cfg, 'endless.minGrowth', 3)) continue;
      // Merges are where the trains meet: the grown network has some with both ways open.
      var full = visible(probe);
      var ins = nodes.map(function () { return 0; });
      nodes.forEach(function (d, i) {
        if (!full[i]) return;
        var outs = d.t === 'W' && probe.rev.indexOf(i) >= 0 ? d.o : d.o.slice(0, 1);
        outs.forEach(function (j) { if (j >= 0) ins[j]++; });
      });
      var meets = ins.filter(function (c) { return c > 1; }).length;
      if (meets < num(cfg, 'endless.mergesMin', 1)) continue;
      live.order = steps;
      // Colours: every station its own; names from the stock or the tables.
      var palette = rng.shuffle([0, 1, 2, 3, 4, 5]);
      var names = (o.names || []).slice();
      stations.forEach(function (si, i) {
        nodes[si].c = palette[i];
        nodes[si].nm = names.length ? names.shift() : Rails.stationName(o.tables, rng);
      });
      live.side = o.siding ? first : -1;
      live.maxLives = num(cfg, 'endless.lives', 3) + (o.lives || 0);
      live.lives = live.maxLives;
      live.brakes = o.brakes || 0;
      live.signals = o.signals || 0;
      live.startMult = o.depot2 ? num(cfg, 'endless.depot2Mult', 1.2) : 1;
      if (o.depot2) grow(live, cfg, true);
      live.rs = rng.int(2147483647);
      plan(live, cfg);
      return live;
    }
    return null;
  }

  /** One step of growth: the next switch or depot opens; the speed grows. */
  function grow(live, cfg, quiet) {
    if (live.order.length) {
      var item = live.order.shift();
      if (live.nodes[item].t === 'W') live.rev.push(item);
      else live.dep.push(item);
      live.stage++;
      if (!quiet) event(live, 'grow', item);
    }
    if (!quiet) live.speed = Math.min(num(cfg, 'endless.speedMax', 2.5), Math.round(live.speed * num(cfg, 'endless.speedGrowth', 1.04) * 10000) / 10000);
  }

  function event(live, type, nodeId, extra) {
    live.evn++;
    var e = { n: live.evn, t: type, node: nodeId === undefined ? -1 : nodeId };
    if (extra) for (var k in extra) e[k] = extra[k];
    live.ev.push(e);
    if (live.ev.length > 12) live.ev.shift();
  }

  // ---- time ------------------------------------------------------------------------------------------

  function tickSec(live, cfg) { return num(cfg, 'endless.tickSec', 0.7) / live.speed; }

  /** Ticks between two trains with different positions at one switch: the reaction and one tick. */
  function gapTicks(live, cfg) {
    // At the speed after the next growth: the plan stays fair if the speed grows on the way.
    var speed = Math.min(num(cfg, 'endless.speedMax', 2.5), live.speed * num(cfg, 'endless.speedGrowth', 1.04));
    var sec = num(cfg, 'endless.tickSec', 0.7) / speed;
    return Math.ceil(num(cfg, 'endless.reaction', 0.8) / sec - 1e-9) + 1;
  }

  /** Real seconds go by: ticks as many as fit (slower under the brake). env: {trip}. */
  function advance(live, dt, cfg, env) {
    if (!live || live.over || live.paused) return 0;
    var k = 1;
    if (live.slow > 0) {
      k = live.slowK || 0.5;
      live.slow = Math.max(0, Math.round((live.slow - dt) * 1000) / 1000);
    }
    live.acc += dt * k;
    var sec = tickSec(live, cfg);
    var steps = 0;
    while (live.acc >= sec && steps < 20 && !live.over) {
      live.acc -= sec;
      step(live, cfg, env);
      steps++;
    }
    if (live.acc >= sec) live.acc = 0;
    live.acc = Math.round(live.acc * 100000) / 100000;
    return steps;
  }

  // ---- one tick --------------------------------------------------------------------------------------

  function removeTrain(live, i) { live.trains.splice(i, 1); }

  function step(live, cfg, env) {
    env = env || {};
    var t = live.tick + 1;
    var i;
    // 1. The trains on the rails move one cell (a train held by the light waits).
    for (i = live.trains.length - 1; i >= 0; i--) {
      var tr = live.trains[i];
      tr.pr = tr.at;
      if (!tr.off && tr.k + 1 < tr.p.length && tr.p[tr.k + 1] === tr.p[tr.k]) {
        tr.k++;
        continue;
      }
      var d = live.nodes[tr.at];
      var nx;
      if (d.t === 'W' && revealed(live, tr.at)) {
        var side = live.pos[tr.at];
        if (side === SIDING) {
          live.sided++;
          event(live, 'siding', tr.at, { c: tr.c });
          removeTrain(live, i);
          continue;
        }
        nx = d.o[side ? 1 : 0];
        live.last[tr.at] = [t, side ? 1 : 0];
      } else {
        nx = d.o[0];
      }
      if (nx === undefined || nx < 0) {
        removeTrain(live, i);
        continue;
      }
      tr.at = nx;
      tr.k++;
      if (!tr.off && tr.p[tr.k] !== nx) tr.off = 1;
    }
    // 2. The depots let out the trains planned for this tick.
    for (i = 0; i < live.queue.length; i++) {
      var q = live.queue[i];
      if (q.s !== t) continue;
      live.trains.push({ id: q.id, c: q.c, d: q.d, s: q.s, p: q.p, at: q.p[0], pr: -1, k: 0, off: 0 });
      live.queue.splice(i, 1);
      i--;
    }
    live.tick = t;
    // 3. Two trains in one cell: both are gone, a life too.
    var at = {};
    var gone = [];
    for (i = 0; i < live.trains.length; i++) {
      var c = cellOf(live, live.trains[i].at);
      if (at[c] !== undefined) {
        gone.push(at[c], i);
        crash(live, cfg, live.trains[i].at, env);
      } else {
        at[c] = i;
      }
    }
    if (gone.length) {
      gone.sort(function (a, b) { return b - a; });
      for (i = 0; i < gone.length; i++) if (i === 0 || gone[i] !== gone[i - 1]) removeTrain(live, gone[i]);
    }
    // 4. Stations take the trains that came.
    for (i = live.trains.length - 1; i >= 0; i--) {
      var tt = live.trains[i];
      var st = live.nodes[tt.at];
      if (st.t !== 'S') continue;
      removeTrain(live, i);
      if (st.c === tt.c) deliver(live, cfg, tt, env);
      else wrongStation(live, cfg, tt, env);
    }
    if (live.lives <= 0) {
      live.over = 1;
      event(live, 'over', -1);
      return;
    }
    plan(live, cfg);
  }

  function deliver(live, cfg, tr, env) {
    var pts = Math.round(num(cfg, 'endless.points', 10) * live.mult * (env.trip ? num(cfg, 'endless.tripMult', 1.5) : 1) * live.startMult);
    live.score += pts;
    live.delivered++;
    live.clean++;
    if (live.clean > live.bestClean) live.bestClean = live.clean;
    var stepUp = env.series ? num(cfg, 'endless.multStepSeries', 0.15) : num(cfg, 'endless.multStep', 0.1);
    live.mult = Math.min(num(cfg, 'endless.multMax', 3), Math.round((live.mult + stepUp) * 100) / 100);
    event(live, 'deliver', tr.at, { c: tr.c, pts: pts });
    if (live.delivered % num(cfg, 'endless.growEvery', 10) === 0) grow(live, cfg, false);
  }

  function wrongStation(live, cfg, tr, env) {
    var pen = num(cfg, 'endless.wrongPenalty', 20);
    live.score = Math.max(0, live.score - pen);
    live.wrong++;
    live.mult = 1;
    event(live, 'wrong', tr.at, { c: tr.c, pts: -pen });
    afterError(live, cfg, env);
  }

  function crash(live, cfg, nodeId, env) {
    live.lives--;
    live.crashes++;
    live.mult = 1;
    live.clean = 0;
    event(live, 'crash', nodeId);
    afterError(live, cfg, env);
  }

  /** «Скорая смена»: after an error the time goes slower for a while. */
  function afterError(live, cfg, env) {
    if (!env.quick) return;
    live.slow = Math.max(live.slow, num(cfg, 'endless.quickSec', 3));
    live.slowK = num(cfg, 'endless.slowFactor', 0.5);
  }

  // ---- the dispatcher --------------------------------------------------------------------------------

  /**
   * What the trains already planned take: cells by tick and passes of switches by tick and side.
   * skip — a train id left out (the one being fixed). Trains off their plan are projected by the
   * switches as they stand.
   */
  function reserve(live, skip, only) {
    var R = { cells: {}, sw: {} };
    function cell(c, tick) { R.cells[c + ':' + tick] = 1; }
    function pass(w, tick, side) { (R.sw[w] = R.sw[w] || []).push([tick, side]); }
    for (var w in live.last) pass(Number(w), live.last[w][0], live.last[w][1]);
    function add(tr, from, at0) {
      for (var k = from; k < tr.p.length; k++) {
        var tick = at0 + (k - from);
        cell(cellOf(live, tr.p[k]), tick);
        var n = tr.p[k];
        if (live.nodes[n].t === 'W' && k + 1 < tr.p.length && tr.p[k + 1] !== n) pass(n, tick + 1, tr.p[k + 1] === live.nodes[n].o[0] ? 0 : 1);
      }
    }
    live.trains.forEach(function (tr) {
      if (tr.id === skip || (only && only.indexOf(tr.id) < 0)) return;
      if (!tr.off) {
        add(tr, tr.k, live.tick);
        return;
      }
      // Off the plan: where the switches lead it now.
      var n = tr.at;
      for (var s = 0; s < live.w * live.h * 2; s++) {
        cell(cellOf(live, n), live.tick + s);
        var d = live.nodes[n];
        if (d.t === 'S') break;
        if (d.t === 'W' && revealed(live, n) && live.pos[n] === SIDING) break;
        n = d.t === 'W' && revealed(live, n) ? d.o[live.pos[n] ? 1 : 0] : d.o[0];
        if (n === undefined || n < 0) break;
      }
    });
    live.queue.forEach(function (q) {
      if (q.id === skip || (only && only.indexOf(q.id) < 0)) return;
      add(q, 0, q.s);
    });
    return R;
  }

  /** Is the path p (its index `from` at tick `at0`) safe against R? */
  function safe(live, R, p, from, at0, gap, margin) {
    for (var k = from; k < p.length; k++) {
      var tick = at0 + (k - from);
      var c = cellOf(live, p[k]);
      for (var m = -margin; m <= margin; m++) if (R.cells[c + ':' + (tick + m)]) return false;
      var n = p[k];
      if (live.nodes[n].t === 'W' && k + 1 < p.length && p[k + 1] !== n) {
        var side = p[k + 1] === live.nodes[n].o[0] ? 0 : 1;
        var list = R.sw[n];
        if (list) {
          for (var j = 0; j < list.length; j++) {
            if (list[j][1] !== side && Math.abs(list[j][0] - (tick + 1)) < gap) return false;
          }
        }
      }
    }
    return true;
  }

  /** Keeps `endless.horizon` departures planned ahead. */
  function plan(live, cfg) {
    var horizon = num(cfg, 'endless.horizon', 5);
    var guard = 0;
    while (live.queue.length < horizon && guard++ < horizon) {
      if (!planOne(live, cfg)) break;
    }
  }

  function planOne(live, cfg) {
    var rng = Rng.make(live.rs);
    var gap = gapTicks(live, cfg);
    var margin = num(cfg, 'endless.margin', 1);
    var lead = Math.max(num(cfg, 'endless.lead', 4), gap);
    var every = [num(cfg, 'endless.everyMin', 1), num(cfg, 'endless.everyMax', 3)];
    var base = Math.max(live.tick + lead, live.lastOut + rng.int(every[0], Math.max(every[0], every[1])));
    var options = [];
    live.dep.forEach(function (d) { routes(live, d).forEach(function (p) { options.push(p); }); });
    rng.shuffle(options);
    var R = reserve(live, -1);
    var window = num(cfg, 'endless.window', 30);
    var found = null;
    for (var t0 = base; t0 < base + window && !found; t0++) {
      for (var i = 0; i < options.length && !found; i++) {
        if (safe(live, R, options[i], 0, t0, gap, margin)) found = { p: options[i], s: t0 };
      }
    }
    live.rs = rng.state();
    if (!found) return false;
    var st = found.p[found.p.length - 1];
    live.queue.push({ id: live.nextId++, c: live.nodes[st].c, d: found.p[0], s: found.s, p: found.p });
    live.lastOut = found.s;
    return true;
  }

  // ---- the player ------------------------------------------------------------------------------------

  /** A tap on a switch: «налево» ↔ «направо» (from the siding — back to «налево»). */
  function tap(live, n) {
    if (!live || live.over || !revealed(live, n)) return false;
    live.pos[n] = live.pos[n] === 0 ? 1 : 0;
    return true;
  }

  /** «Тупик-отстойник»: the siding switch to the dead end and back. */
  function siding(live, n) {
    if (!live || live.over || n !== live.side || !revealed(live, n)) return false;
    live.pos[n] = live.pos[n] === SIDING ? 0 : SIDING;
    return true;
  }

  /** «Тормоз»: the time goes slower for a while (a charge of the run). */
  function brake(live, cfg) {
    if (!live || live.over || live.brakes <= 0) return false;
    live.brakes--;
    live.slow = Math.max(live.slow, num(cfg, 'endless.brakeSec', 5));
    live.slowK = num(cfg, 'endless.slowFactor', 0.5);
    return true;
  }

  function insertWait(tr, h) {
    var p = tr.p.slice(0, tr.k + 1);
    for (var i = 0; i < h; i++) p.push(tr.p[tr.k]);
    tr.p = p.concat(tr.p.slice(tr.k + 1));
  }

  /**
   * «Светофор»: the train waits where it is for endless.signalSec. The trains it would meet wait
   * too, the departures move later — the plan stays safe; when it cannot, nothing changes.
   */
  function hold(live, cfg, id) {
    if (!live || live.over || live.signals <= 0) return false;
    var tr = null;
    live.trains.forEach(function (x) { if (x.id === id && !x.off) tr = x; });
    if (!tr || live.nodes[tr.at].t === 'S') return false;
    var backup = JSON.stringify({ trains: live.trains, queue: live.queue });
    var h = Math.max(1, Math.ceil(num(cfg, 'endless.signalSec', 2) / tickSec(live, cfg)));
    var gap = gapTicks(live, cfg);
    var margin = num(cfg, 'endless.margin', 1);
    insertWait(tr, h);
    var done = [tr.id];
    var ok = true;
    var others = live.trains.filter(function (x) { return x !== tr && !x.off; });
    var offs = live.trains.filter(function (x) { return x.off; }).map(function (x) { return x.id; });
    done = done.concat(offs);
    others.forEach(function (y) {
      if (!ok) return;
      var R = reserve(live, -1, done);
      var fixed = false;
      for (var w = 0; w <= 40 && !fixed; w++) {
        var trial = { p: y.p, k: y.k };
        if (w) insertWait(trial, w);
        if (safe(live, R, trial.p, trial.k + 1, live.tick + 1, gap, margin)) {
          y.p = trial.p;
          fixed = true;
        }
      }
      if (!fixed) ok = false;
      done.push(y.id);
    });
    if (ok) {
      live.queue.forEach(function (q) {
        if (!ok) return;
        var R = reserve(live, -1, done);
        var s = q.s;
        while (s < q.s + 40 && !safe(live, R, q.p, 0, s, gap, margin)) s++;
        if (s >= q.s + 40) ok = false;
        q.s = s;
        done.push(q.id);
      });
    }
    if (!ok) {
      var b = JSON.parse(backup);
      live.trains = b.trains;
      live.queue = b.queue;
      return false;
    }
    live.queue.sort(function (a, b2) { return a.s - b2.s; });
    live.lastOut = live.queue.reduce(function (m, q) { return Math.max(m, q.s); }, live.lastOut);
    live.signals--;
    event(live, 'signal', tr.at);
    return true;
  }

  // ---- what the screen and the bot read --------------------------------------------------------------

  /** The next planned pass of every switch: {node: {side, tick, id, c}} (the warning, the bot). */
  function nextPasses(live) {
    var out = {};
    function look(tr, from, at0) {
      for (var k = from; k + 1 < tr.p.length; k++) {
        var n = tr.p[k];
        if (live.nodes[n].t !== 'W' || tr.p[k + 1] === n) continue;
        var tick = at0 + (k - from) + 1;
        if (!out[n] || out[n].tick > tick) out[n] = { side: tr.p[k + 1] === live.nodes[n].o[0] ? 0 : 1, tick: tick, id: tr.id, c: tr.c };
      }
    }
    live.trains.forEach(function (tr) { if (!tr.off) look(tr, tr.k, live.tick); });
    live.queue.forEach(function (q) { look(q, 0, q.s); });
    return out;
  }

  /** The bot of the checks: every open switch stands as its next planned train needs. */
  function botTurn(live) {
    var next = nextPasses(live);
    live.rev.forEach(function (w) {
      if (next[w] && live.pos[w] !== SIDING) live.pos[w] = next[w].side;
    });
  }

  /** The next departure of every depot (the trains waiting at the depots). */
  function waiting(live) {
    var out = {};
    live.queue.forEach(function (q) { if (!out[q.d] || out[q.d].s > q.s) out[q.d] = q; });
    return out;
  }

  return {
    SIDING: SIDING, create: create, advance: advance, step: step, plan: plan, grow: grow, routes: routes, visible: visible,
    stationsSeen: stationsSeen, tap: tap, siding: siding, brake: brake, hold: hold, nextPasses: nextPasses, botTurn: botTurn,
    waiting: waiting, tickSec: tickSec, gapTicks: gapTicks, cellOf: cellOf, revealed: revealed, reserve: reserve, safe: safe
  };
});
