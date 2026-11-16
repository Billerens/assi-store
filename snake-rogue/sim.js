// «Змейка-рогалик» — the logic. Shared subset of JavaScript: it runs on the screen
// (window.GameSim), in the engine (Rhino, require) and in node. No class, no async, no
// f(...args), no for (let/const …); randomness only from the run's own generator (run.rs).
//
// The field is a grid w×h (cell c = y·w + x). The snake is run.body (head first) plus run.pend
// segments still to grow; its length is its health. A glade is run.g; three lands of three
// glades, the third of each land is the lair of its master. Every number is a setting of
// config.json (cfg). Texts and lists are content/*.json (setContent).
(function (root, make) {
  var node = typeof require === 'function' && typeof exports !== 'undefined';
  var api = node ? make(require('../engine/big.js'), require('../engine/rng.js')) : make(root.Big, root.Rng);
  if (node) {
    api.setContent({
      abilities: require('./content/abilities.json'),
      snakes: require('./content/snakes.json'),
      upgrades: require('./content/upgrades.json'),
      molts: require('./content/molts.json'),
      lands: require('./content/lands.json'),
      enemies: require('./content/enemies.json'),
      glades: require('./content/glades.json')
    });
  }
  if (typeof exports !== 'undefined') { for (var k in api) exports[k] = api[k]; } else { root.GameSim = api; }
})(this, function (Big, Rng) {
  'use strict';

  var LAYER = 'molt';
  var DX = [0, 1, 0, -1];
  var DY = [-1, 0, 1, 0];
  var REV = 9;
  var LANDS = ['meadow', 'bog', 'ridge'];
  var BOSSES = ['poloz', 'mother', 'stone'];
  var SNAKES = ['poloz', 'copper', 'boa', 'twohead', 'glass'];
  var UPGRADES = ['long', 'skin', 'nose', 'sack', 'reroll', 'quiet'];
  var PHASES = ['hub', 'play', 'pick', 'shop', 'over'];
  var CONTENT_FILES = ['abilities', 'snakes', 'upgrades', 'molts', 'lands', 'enemies', 'glades'];
  // Bricks of the abilities the model makes (stock «abilities»): the allowed range of the value.
  var BRICKS = { speed: [-2, 1], length: [1, 8], phase: [4, 16], bodyDamage: [1, 1], magnet: [1, 3], seeds: [1, 6] };
  // The glade layouts of the stock are drawn for the standard field.
  var STOCK_W = 15;
  var STOCK_H = 25;
  var SYMBOLS = '.#~h';

  // ---- content ----------------------------------------------------------------------------------

  var C = null;
  var AB = {};

  function setContent(c) {
    for (var i = 0; i < CONTENT_FILES.length; i++) {
      if (!c || !c[CONTENT_FILES[i]]) throw new Error('snake-rogue: нет content/' + CONTENT_FILES[i] + '.json');
    }
    C = c;
    AB = {};
    c.abilities.forEach(function (a) { AB[a.id] = a; });
  }

  function need() {
    if (!C) throw new Error('snake-rogue: контент не загружен (sim.setContent)');
    return C;
  }

  // ---- small helpers ----------------------------------------------------------------------------

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function num(x) { return Math.floor(Big.toNumber(Big.of(x, 0))); }
  function ri(r, a, b) { return a + Math.floor(r.next() * (b - a + 1)); }
  function pick(r, list) { return list[Math.floor(r.next() * list.length)]; }
  function len(run) { return run.body.length + run.pend; }
  function alive(run) { return run.phase === 'play' || run.phase === 'pick'; }

  /** An event for the screen (sound, flash): numbered, the screen remembers the last it played. */
  function fx(run, k) {
    run.fxN = (run.fxN || 0) + 1;
    run.fx.push([run.fxN, k]);
    if (run.fx.length > 16) run.fx.shift();
  }

  function meta(state) {
    var m = state.meta || (state.meta = {});
    if (m.scales === undefined) m.scales = 0;
    if (!m.shop) m.shop = {};
    if (!m.unlocked) m.unlocked = { poloz: true };
    if (!m.album) m.album = {};
    if (!m.album.abilities) m.album.abilities = {};
    if (!m.album.enemies) m.album.enemies = {};
    if (!m.rec) m.rec = {};
    var rec = m.rec;
    var zero = ['runs', 'wins', 'bestLen', 'bestGlades', 'endless', 'ring', 'sec', 'firstWinSec'];
    for (var i = 0; i < zero.length; i++) if (typeof rec[zero[i]] !== 'number') rec[zero[i]] = 0;
    var flags = ['meadow', 'bogClean', 'cleanWin'];
    for (i = 0; i < flags.length; i++) if (typeof rec[flags[i]] !== 'boolean') rec[flags[i]] = false;
    if (!m.daily) m.daily = { day: '', best: 0, tries: 0 };
    if (typeof m.ascend !== 'boolean') m.ascend = false;
    if (!m.choice) m.choice = { snake: 'poloz', molt: 0, charge: false };
    return m;
  }

  function scalesOf(state) { return num(meta(state).scales); }
  function moltTop(state) { var l = state.layers && state.layers[LAYER]; return l ? num(l.currency) : 0; }

  function rulesOf(molt) {
    var on = {};
    need().molts.forEach(function (x) { if (x.n <= molt) on[x.rule] = true; });
    return on;
  }

  /** The working context of one call: the state, its run, the settings and the run's generator. */
  function open(state, cfg) { return { s: state, run: state.run, cfg: cfg, r: Rng.make(state.run.rs) }; }
  function close(X) { X.run.rs = X.r.state(); }

  // ---- the grid ---------------------------------------------------------------------------------
  // g.grid is a string w·h long: '.' free, '~' bog, '#' stone, 'h' hedgehog, 'v' vine, 'm' the mother.

  function at(g, c) { return g.grid.charAt(c); }
  function blocks(ch) { return ch === '#' || ch === 'h' || ch === 'v' || ch === 'm'; }
  function setCell(g, c, ch) { g.grid = g.grid.substring(0, c) + ch + g.grid.substring(c + 1); }
  function cx(g, c) { return c % g.w; }
  function cy(g, c) { return Math.floor(c / g.w); }

  function stepOf(g, c, d, wrap) {
    var x = c % g.w + DX[d];
    var y = Math.floor(c / g.w) + DY[d];
    if (x < 0 || y < 0 || x >= g.w || y >= g.h) {
      if (!wrap) return -1;
      x = (x + g.w) % g.w;
      y = (y + g.h) % g.h;
    }
    return y * g.w + x;
  }

  function manh(g, a, b) { return Math.abs(a % g.w - b % g.w) + Math.abs(Math.floor(a / g.w) - Math.floor(b / g.w)); }
  function cheb(g, a, b) { return Math.max(Math.abs(a % g.w - b % g.w), Math.abs(Math.floor(a / g.w) - Math.floor(b / g.w))); }
  function edgeDist(g, c) { var x = c % g.w; var y = Math.floor(c / g.w); return Math.min(x, y, g.w - 1 - x, g.h - 1 - y); }

  /** The direction from cell a to the neighbouring cell b (across the edge too); -1 when not neighbours. */
  function dirTo(g, a, b) {
    var dx = b % g.w - a % g.w;
    var dy = Math.floor(b / g.w) - Math.floor(a / g.w);
    if (dx > 1) dx = -1; else if (dx < -1) dx = 1;
    if (dy > 1) dy = -1; else if (dy < -1) dy = 1;
    for (var d = 0; d < 4; d++) if (DX[d] === dx && DY[d] === dy) return d;
    return -1;
  }

  function flood(g, from, pass, limit) {
    var seen = [];
    var list = [from];
    seen[from] = 1;
    for (var i = 0; i < list.length; i++) {
      if (limit && list.length >= limit) break;
      for (var d = 0; d < 4; d++) {
        var n = stepOf(g, list[i], d, false);
        if (n < 0 || seen[n] || !pass(n)) continue;
        seen[n] = 1;
        list.push(n);
      }
    }
    return list;
  }

  function freeCount(g) { var n = 0; for (var c = 0; c < g.grid.length; c++) if (!blocks(g.grid.charAt(c))) n++; return n; }

  /** Every free cell is reachable from `from` (the snake never gets a glade with a closed pocket). */
  function connected(g, from) {
    if (blocks(at(g, from))) return false;
    return flood(g, from, function (c) { return !blocks(at(g, c)); }).length === freeCount(g);
  }

  // ---- glades -----------------------------------------------------------------------------------

  function gladeSeed(run, n) { return Rng.hash('glade:' + run.gs + ':' + n); }
  function landNo(n) { return Math.floor(n / 3) % 3; }
  function isBoss(n) { return n % 3 === 2; }

  function reservedOf(g) {
    var res = [];
    var sx = cx(g, g.start);
    var sy = cy(g, g.start);
    for (var y = Math.max(0, sy - 9); y < g.h; y++) for (var x = sx - 1; x <= sx + 1; x++) if (x >= 0 && x < g.w) res[y * g.w + x] = 1;
    for (y = Math.max(0, sy - 2); y < g.h; y++) for (x = sx - 2; x <= sx + 2; x++) if (x >= 0 && x < g.w) res[y * g.w + x] = 1;
    var ex = cx(g, g.exit);
    var ey = cy(g, g.exit);
    for (y = ey - 2; y <= ey + 2; y++) for (x = ex - 2; x <= ex + 2; x++) {
      if (x >= 0 && y >= 0 && x < g.w && y < g.h && Math.abs(x - ex) + Math.abs(y - ey) <= 2) res[y * g.w + x] = 1;
    }
    return res;
  }

  function fits(L, g) {
    return L && L.rows && L.rows.length === g.h && L.rows.every(function (row) { return typeof row === 'string' && row.length === g.w; });
  }

  /** The glade n of the run: its layout comes from its own seed, so Зоркость can show it ahead. */
  function makeGlade(run, cfg, n) {
    var lr = Rng.make(gladeSeed(run, n));
    var w = cfg['grid.w'];
    var h = cfg['grid.h'];
    var li = landNo(n);
    var g = {
      n: n, w: w, h: h, land: LANDS[li], boss: isBoss(n) ? BOSSES[li] : '',
      start: (h - 3) * w + Math.floor(w / 2), exit: -1, exitOpen: false, goal: 0, eaten: 0,
      grid: '', vines: [], holes: [], holeT: cfg['hole.every'], beetles: [], mice: [], rival: null,
      hawkOn: false, hawk: null, hawkT: cfg['hawk.every'], rockOn: false, rocks: [], rockT: cfg['rock.every'], fallen: 0,
      food: [], curioAt: [], ram: run.ab.ram || 0, brow: run.ab.brow || 0, curlLeft: run.ab.curl || 0,
      b: null, t: 0, near: [], layout: '', ringAt: -1000
    };
    g.goal = cfg['goal.base'] + cfg['goal.per'] * n + (run.rule.goal ? cfg['molt.goalExtra'] : 0);
    var side = ri(lr, 0, 2);
    var ex;
    var ey;
    if (side === 0) { ex = ri(lr, 2, w - 3); ey = 0; } else { ex = side === 1 ? 0 : w - 1; ey = ri(lr, 1, Math.max(1, Math.floor(h / 3))); }
    g.exit = ey * w + ex;
    var res = reservedOf(g);
    var cells = [];
    for (var c = 0; c < w * h; c++) cells.push('.');
    var layout = null;
    if (!g.boss) {
      var pool = (run.layouts || []).concat(need().glades).filter(function (L) { return L.land === g.land && fits(L, g); });
      var useLayout = (run.daily && n === 0) || lr.next() < cfg['glade.layoutShare'];
      if (pool.length && useLayout) layout = pool[Math.floor(lr.next() * pool.length)];
    }
    if (layout) {
      for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
        var ch = layout.rows[y].charAt(x);
        c = y * w + x;
        if (res[c]) continue;
        if (ch === '#' || ch === 'h' || (ch === '~' && li === 1)) cells[c] = ch;
      }
      g.grid = cells.join('');
      if (connected(g, g.start)) {
        g.layout = layout.title || '';
      } else {
        layout = null;
        cells = [];
        for (c = 0; c < w * h; c++) cells.push('.');
      }
    }
    var count = cfg['obst.base'] + cfg['obst.per'] * n + (run.rule.obstacles ? cfg['molt.obstacles'] : 0);
    if (g.boss) count = Math.round(count * cfg['obst.bossShare']);
    count = Math.min(count, cfg['obst.max']);
    if (!layout) {
      g.grid = cells.join('');
      placeStones(g, lr, res, count, cfg['obst.sizeMax']);
      if (!g.boss) placeSingles(g, lr, res, cfg['hedgehog.count'], 'h');
    }
    if (li === 1) bogPatches(g, lr, res, cfg);
    if (!g.boss) {
      if (li >= 1) {
        var vineCells = placeSingles(g, lr, res, cfg['vine.count'], 'v');
        g.vines = vineCells.map(function (v) { return [v]; });
        for (var p = 0; p < cfg['hole.pairs']; p++) {
          var a = freeCell(g, lr, res, function (q) { return g.holes.indexOf(q) < 0; });
          var b = freeCell(g, lr, res, function (q) { return g.holes.indexOf(q) < 0 && a >= 0 && manh(g, a, q) >= 8; });
          if (a >= 0 && b >= 0) g.holes.push(a, b);
        }
        g.hawkOn = true;
      }
      if (li === 0 && run.rule.hawk) g.hawkOn = true;
      if (li === 2) g.rockOn = true;
      var farFromStart = function (q) { return cy(g, q) < h - 8; };
      for (var i = 0; i < cfg['beetle.count']; i++) { var bc = freeCell(g, lr, res, farFromStart); if (bc >= 0) g.beetles.push({ c: bc, t: 0 }); }
      for (i = 0; i < cfg['mouse.count']; i++) { var mc = freeCell(g, lr, res, farFromStart); if (mc >= 0) g.mice.push({ c: mc, t: 0 }); }
      if ((li === 2 || (li === 1 && run.rule.rival)) && cfg['rival.count'] > 0) {
        var rc = freeCell(g, lr, res, function (q) { return cy(g, q) < h / 3; });
        if (rc >= 0) g.rival = { body: [rc], pend: cfg['rival.length'] - 1, dir: 2, acc: 0, stun: 0, dead: false };
      }
    }
    var extra = run.rule.boss ? cfg['molt.bossExtra'] : 0;
    if (g.boss === 'poloz') {
      var pc = Math.floor(w / 2) + 2 * w;
      if (blocks(at(g, pc))) setCell(g, pc, '.');
      g.b = { body: [pc], pend: cfg['boss.polozLength'] - 1, dir: 2, acc: 0, stun: 0, hits: 0, need: cfg['boss.polozHits'] + extra, dead: false };
    } else if (g.boss === 'mother') {
      var mc0 = Math.floor(h / 2) * w + Math.floor(w / 2);
      var mcells = [];
      for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) { var q = mc0 + dy * w + dx; mcells.push(q); setCell(g, q, 'm'); }
      g.b = { c: mc0, cells: mcells, t: cfg['boss.motherEvery'] / 2, lost: 0, max: cfg['boss.motherMax'] + extra };
      g.goal = cfg['boss.motherGoal'];
      if (!connected(g, g.start)) {
        // a stone walled the mother in with the field: clear the stones around her
        for (q = 0; q < w * h; q++) if (at(g, q) === '#' && cheb(g, q, mc0) <= 3) setCell(g, q, '.');
      }
    } else if (g.boss === 'stone') {
      g.b = { t: cfg['boss.stoneSec'], warn: false, ring: 0, rings: Math.max(1, cfg['boss.stoneRings'] - extra), fails: 0, base: g.grid };
      g.goal = cfg['boss.stoneGoal'];
    }
    return g;
  }

  function freeCell(g, lr, res, ok) {
    for (var tries = 0; tries < 200; tries++) {
      var c = Math.floor(lr.next() * g.w * g.h);
      if (res[c] || blocks(at(g, c)) || c === g.start) continue;
      if (ok && !ok(c)) continue;
      return c;
    }
    return -1;
  }

  function placeStones(g, lr, res, count, sizeMax) {
    var placed = 0;
    for (var tries = 0; placed < count && tries < count * 12; tries++) {
      var c = freeCell(g, lr, res);
      if (c < 0) break;
      var size = ri(lr, 1, Math.max(1, sizeMax));
      var group = [c];
      for (var k = 1; k < size; k++) {
        var n = stepOf(g, pick(lr, group), ri(lr, 0, 3), false);
        if (n >= 0 && !res[n] && !blocks(at(g, n)) && group.indexOf(n) < 0) group.push(n);
      }
      var before = g.grid;
      group.forEach(function (q) { setCell(g, q, '#'); });
      if (connected(g, g.start)) placed++; else g.grid = before;
    }
    return placed;
  }

  function placeSingles(g, lr, res, count, ch) {
    var out = [];
    for (var tries = 0; out.length < count && tries < count * 12; tries++) {
      var c = freeCell(g, lr, res);
      if (c < 0) break;
      var before = g.grid;
      setCell(g, c, ch);
      if (connected(g, g.start)) out.push(c); else g.grid = before;
    }
    return out;
  }

  function bogPatches(g, lr, res, cfg) {
    for (var p = 0; p < cfg['bog.patches']; p++) {
      var c = freeCell(g, lr, []);
      if (c < 0) continue;
      for (var k = 0; k < cfg['bog.patchSize']; k++) {
        if (at(g, c) === '.' && c !== g.start) setCell(g, c, '~');
        var n = stepOf(g, c, ri(lr, 0, 3), false);
        if (n >= 0 && !blocks(at(g, n))) c = n;
      }
    }
  }

  /** What the minimap of Зоркость shows: the stones of the next glade. */
  function preview(X, n) {
    if (n >= X.cfg['run.glades'] && !X.run.endless) return null;
    var g = makeGlade(X.run, X.cfg, n);
    return { n: n, grid: g.grid, exit: g.exit, land: g.land, boss: g.boss };
  }

  function startGlade(X, n) {
    var run = X.run;
    var cfg = X.cfg;
    var m = meta(X.s);
    var g = makeGlade(run, cfg, n);
    var L = len(run);
    run.g = g;
    run.glade = n;
    run.body = [g.start];
    run.pend = Math.max(0, L - 1);
    run.dir = 0;
    run.q = [];
    run.acc = 0;
    run.stun = 0;
    run.wait = false;
    run.curl = 0;
    run.hist = [];
    run.lastTail = g.start;
    run.count = cfg['countdown.gladeSec'];
    run.phase = 'play';
    run.pick = null;
    run.shop = null;
    if (n % 9 === 3) run.bogBites = run.bites;
    curios(X);
    var want = g.boss === 'mother' ? cfg['boss.motherFood'] : cfg['fruit.onField'];
    for (var i = 0; i < want; i++) spawnFood(X, 'f');
    run.next = run.ab.sight ? preview(X, n + 1) : null;
    enemiesOf(g).forEach(function (id) { m.album.enemies[id] = (m.album.enemies[id] || 0) + 1; });
    fx(run, 'glade');
  }

  /** The kinds of enemies a glade has (for the album and the legend of the screen). */
  function enemiesOf(g) {
    var out = [];
    if (g.grid.indexOf('#') >= 0) out.push('stone');
    if (g.grid.indexOf('h') >= 0) out.push('hedgehog');
    if (g.beetles.length) out.push('beetle');
    if (g.mice.length) out.push('mouse');
    if (g.hawkOn) out.push('hawk');
    if (g.vines.length) out.push('vine');
    if (g.grid.indexOf('~') >= 0) out.push('mire');
    if (g.holes.length) out.push('holes');
    if (g.rival) out.push('rival');
    if (g.rockOn) out.push('rockfall');
    return out;
  }

  function curios(X) {
    var run = X.run;
    var g = run.g;
    var cfg = X.cfg;
    var r = X.r;
    g.curioAt = [];
    if (g.boss) return;
    var k = ri(r, cfg['curio.min'], cfg['curio.max']);
    k *= 1 + cfg['ab.nose.mult'] * (run.ab.nose || 0);
    if (run.snake === 'boa') k *= cfg['ab.boa.curio'];
    if (run.rule.curio) k *= cfg['molt.curio'];
    var n = Math.floor(k);
    if (r.next() < k - n) n++;
    if (g.n % 3 === 0) n += (run.up.nose || 0) * cfg['shop.nose.value'];
    for (var i = 0; i < n; i++) g.curioAt.push(Math.max(1, Math.round(g.goal * (i + 1) / (n + 1))));
  }

  // ---- occupancy and food -----------------------------------------------------------------------

  function foodAt(g, c) { for (var i = 0; i < g.food.length; i++) if (g.food[i].c === c) return i; return -1; }
  function creatureAt(g, c) {
    for (var i = 0; i < g.beetles.length; i++) if (g.beetles[i].c === c) return true;
    for (i = 0; i < g.mice.length; i++) if (g.mice[i].c === c) return true;
    return false;
  }

  /** Cells taken by anything but the free ground: the snake, food, creatures, holes, the exit. */
  function occupied(X) {
    var run = X.run;
    var g = run.g;
    var occ = [];
    run.body.forEach(function (c) { occ[c] = 1; });
    g.food.forEach(function (f) { occ[f.c] = 1; });
    g.beetles.forEach(function (b) { occ[b.c] = 1; });
    g.mice.forEach(function (b) { occ[b.c] = 1; });
    g.holes.forEach(function (c) { occ[c] = 1; });
    g.rocks.forEach(function (m) { occ[m.c] = 1; });
    if (g.rival && !g.rival.dead) g.rival.body.forEach(function (c) { occ[c] = 1; });
    if (g.boss === 'poloz' && g.b && !g.b.dead) g.b.body.forEach(function (c) { occ[c] = 1; });
    occ[g.exit] = 1;
    return occ;
  }

  function foodCell(X) {
    var run = X.run;
    var g = run.g;
    var cfg = X.cfg;
    var occ = occupied(X);
    var head = run.body[0];
    var reach = flood(g, head, function (c) { return !blocks(at(g, c)) && !occ[c]; });
    var far = [];
    var any = [];
    var ring = g.boss === 'stone' && g.b ? g.b.ring : -1;
    for (var i = 1; i < reach.length; i++) {
      var c = reach[i];
      if (ring >= 0 && edgeDist(g, c) <= ring) continue;
      // not in a dead end the snake could only enter and never leave
      var ways = 0;
      for (var d = 0; d < 4; d++) { var n = stepOf(g, c, d, false); if (n >= 0 && !blocks(at(g, n))) ways++; }
      if (ways < 2) continue;
      any.push(c);
      if (manh(g, head, c) >= cfg['fruit.minDist']) far.push(c);
    }
    var list = far.length ? far : any;
    if (!list.length) {
      // the snake shut itself in: any free cell of the field
      for (var c2 = 0; c2 < g.w * g.h; c2++) if (!blocks(at(g, c2)) && !occ[c2]) list.push(c2);
    }
    if (!list.length) return -1;
    return list[Math.floor(X.r.next() * list.length)];
  }

  function spawnFood(X, kind) {
    var run = X.run;
    var g = run.g;
    var cfg = X.cfg;
    var c = foodCell(X);
    if (c < 0) return -1;
    g.food.push({ c: c, k: kind });
    if (kind === 'f' && run.ab.twin) {
      var p = cfg['ab.twin.chance'] + cfg['ab.twin.step'] * (run.ab.twin - 1);
      if (X.r.next() < p) {
        for (var d = 0; d < 4; d++) {
          var n = stepOf(g, c, d, false);
          if (n >= 0 && !blocks(at(g, n)) && foodAt(g, n) < 0 && run.body.indexOf(n) < 0 && n !== g.exit) { g.food.push({ c: n, k: 'b' }); break; }
        }
      }
    }
    return c;
  }

  function drop(X, n) {
    var lvl = X.run.ab.grain || 0;
    return n * (lvl ? X.cfg['ab.grain.mult'] + lvl - 1 : 1);
  }

  function grew(run) { var L = len(run); if (L > run.maxLen) run.maxLen = L; }

  function eatAt(X, c) {
    var g = X.run.g;
    for (var i = g.food.length - 1; i >= 0; i--) {
      if (i < g.food.length && g.food[i].c === c) eatFood(X, i);
    }
  }

  function eatFood(X, i) {
    var run = X.run;
    var g = run.g;
    var cfg = X.cfg;
    var f = g.food.splice(i, 1)[0];
    if (f.k === 'c') { openCurio(X); curioCheck(X); return; }
    run.fruits++;
    g.eaten++;
    run.streak++;
    var grow = 1;
    if (run.ab.full) { run.full++; if (run.full % cfg['ab.full.every'] === 0) grow = cfg['ab.full.bonus']; }
    run.pend += grow;
    grew(run);
    run.score += 1 + (run.ab.hunger ? Math.floor(run.streak / cfg['ab.hunger.every']) : 0);
    fx(run, 'eat');
    goalCheck(X);
    curioCheck(X);
    if (f.k === 'f') spawnFood(X, 'f');
  }

  function curioCheck(X) {
    var g = X.run.g;
    for (var i = 0; i < g.food.length; i++) if (g.food[i].k === 'c') return;
    if (g.curioAt.length && g.eaten >= g.curioAt[0]) {
      g.curioAt.shift();
      spawnFood(X, 'c');
    }
  }

  function goalOf(run, cfg) {
    var g = run.g;
    return run.ab.short ? Math.ceil(g.goal * cfg['ab.short.share']) : g.goal;
  }

  function goalCheck(X) {
    var run = X.run;
    var g = run.g;
    if (g.exitOpen || g.boss === 'poloz') return;
    if (g.eaten >= goalOf(run, X.cfg)) {
      if (g.boss === 'stone') clearRings(X);
      openExit(X);
    }
  }

  function openExit(X) {
    var g = X.run.g;
    if (g.exitOpen) return;
    g.exitOpen = true;
    if (blocks(at(g, g.exit))) setCell(g, g.exit, '.');
    fx(X.run, 'open');
  }

  // ---- damage -----------------------------------------------------------------------------------

  function dmg(X, base) {
    var run = X.run;
    var cfg = X.cfg;
    var d = base;
    if (run.ab.armor) d -= cfg['hit.damage'] - cfg['ab.armor.damage'];
    if (run.rule.hit) d += cfg['molt.hitExtra'];
    d -= (run.up.skin || 0) * cfg['shop.skin.value'];
    return Math.max(cfg['hit.min'], d);
  }

  /** Stop after a blow: half a second still, then the snake waits for a new direction. */
  function stop(X) {
    var run = X.run;
    run.stun = X.cfg['hit.stopSec'];
    run.wait = true;
    run.q = [];
    run.acc = 0;
  }

  /** The head ran into a wall or an obstacle. */
  function hit(X, what) {
    var run = X.run;
    var g = run.g;
    var cfg = X.cfg;
    stop(X);
    if (g.brow > 0) { g.brow--; fx(run, 'brow'); return; }
    run.hits++;
    run.streak = 0;
    fx(run, 'hit');
    if (cfg['rules.classicDeath']) { die(X, 'hit'); return; }
    var base = cfg['hit.damage'];
    if (run.snake === 'glass' && (what === 'wall' || what === 'stone')) base = cfg['snake.glass.wall'];
    lose(X, dmg(X, base));
  }

  /** A blow to the head counts as a hit; false when the classic rule ended the run. */
  function blow(X) {
    var run = X.run;
    run.hits++;
    run.streak = 0;
    fx(run, 'hurt');
    if (X.cfg['rules.classicDeath']) { die(X, 'hit'); return false; }
    return true;
  }

  /** A creature hurt the head (rockfall, the master): stronger in each next land unless flat. */
  function hurt(X, base, flat) {
    if (!blow(X)) return;
    lose(X, dmg(X, base + (flat ? 0 : landNo(X.run.g.n) * X.cfg['hit.landExtra'])));
  }

  /** Segments torn off from outside (the hawk, the ring): the thick skin and the armour soften it too. */
  function tear(X, n) {
    var run = X.run;
    var cfg = X.cfg;
    var d = n - (run.up.skin || 0) * cfg['shop.skin.value'] - (run.ab.armor ? cfg['hit.damage'] - cfg['ab.armor.damage'] : 0);
    lose(X, Math.max(cfg['hit.min'], d));
  }

  function lose(X, n) {
    var run = X.run;
    var take = Math.min(run.pend, n);
    run.pend -= take;
    n -= take;
    while (n > 0 && run.body.length > 1) { run.body.pop(); n--; }
    if (n > 0) run.body = run.body.slice(0, 1);
    lenCheck(X, n > 0);
  }

  function lenCheck(X, force) {
    if (force || len(X.run) < X.cfg['snake.minLength']) die(X, 'short');
  }

  /** Cuts the body from index i on; Линька leaves the cut segments as fruits. */
  function cut(X, i) {
    var run = X.run;
    var g = run.g;
    if (i <= 0 || i >= run.body.length) return;
    var gone = run.body.splice(i);
    if (run.ab.molt) {
      var k = 0;
      gone.forEach(function (c) {
        if (k < X.cfg['ab.molt.max'] && foodAt(g, c) < 0 && !blocks(at(g, c)) && run.body.indexOf(c) < 0 && c !== g.exit) { g.food.push({ c: c, k: 'b' }); k++; }
      });
    }
    fx(run, 'cut');
    lenCheck(X);
  }

  function die(X, reason) {
    var run = X.run;
    if (run.phase === 'over') return;
    run.phase = 'over';
    finish(X, false, reason);
  }

  // ---- the snake --------------------------------------------------------------------------------

  /** The index of a body segment on cell c that the head would bite (the tail leaves when not growing). */
  function bodyAt(run, c) {
    var last = run.body.length - (run.pend > 0 ? 1 : 2);
    for (var i = 1; i <= last; i++) if (run.body[i] === c) return i;
    return -1;
  }

  function speedOf(run, cfg) {
    var n = run.g ? run.g.n : 0;
    var lastN = Math.max(1, cfg['run.glades'] - 1);
    var s0 = cfg['speed.start'] - (run.up.quiet || 0) * cfg['shop.quiet.value'];
    var v = s0 + (cfg['speed.end'] - s0) * Math.min(1, n / lastN);
    if (n > lastN) v += (n - lastN) * cfg['endless.speedStep'];
    if (run.snake === 'copper') v += cfg['snake.copper.speed'];
    if (run.snake === 'boa') v -= cfg['snake.boa.speed'];
    if (run.rule.speed) v += cfg['molt.speed'];
    if (run.rule.speed2) v += cfg['molt.speed'];
    v += run.bricks.speed || 0;
    v *= 1 - cfg['ab.slow.pct'] * (run.ab.slow || 0);
    return clamp(v, cfg['speed.min'], cfg['speed.max']);
  }

  /** Seconds a cell takes now (the bog doubles it unless Тёплая кожа). */
  function period(run, cfg) {
    var p = 1 / speedOf(run, cfg);
    if (run.g && run.body.length && at(run.g, run.body[0]) === '~' && !run.ab.warm) p *= cfg['bog.slow'];
    return p;
  }

  function reverse(run) {
    var g = run.g;
    run.body.reverse();
    if (run.body.length > 1) {
      var d = dirTo(g, run.body[1], run.body[0]);
      run.dir = d >= 0 ? d : (run.dir + 2) % 4;
    } else {
      run.dir = (run.dir + 2) % 4;
    }
    run.hist = [];
    run.lastTail = run.body[run.body.length - 1];
  }

  function moveHead(X, c) {
    var run = X.run;
    run.body.unshift(c);
    if (run.pend > 0) { run.pend--; run.lastTail = -1; } else run.lastTail = run.body.pop();
    if (run.ab.shadow) {
      run.hist.unshift(c);
      if (run.hist.length > X.cfg['ab.shadow.lag'] + 1) run.hist.pop();
    }
    grew(run);
  }

  function snakeStep(X, noQueue) {
    var run = X.run;
    var g = run.g;
    var cfg = X.cfg;
    var turned = false;
    if (!noQueue && run.q.length) {
      var d = run.q.shift();
      if (d === REV) { reverse(run); turned = true; } else if (d !== run.dir) { run.dir = d; turned = true; }
    }
    run.steps++;
    var c = stepOf(g, run.body[0], run.dir, !!run.ab.wrap);
    if (c < 0) { hit(X, 'wall'); return; }
    if (g.exitOpen && c === g.exit) { moveHead(X, c); gladeDone(X); return; }
    var hole = g.holes.indexOf(c);
    if (hole >= 0) { c = g.holes[hole ^ 1]; fx(run, 'hole'); }
    var ch = at(g, c);
    if (blocks(ch)) {
      if ((ch === '#' || ch === 'v') && g.ram > 0) { g.ram--; smash(g, c); fx(run, 'ram'); } else { hit(X, ch === 'm' ? 'mother' : 'stone'); return; }
    }
    var rv = g.rival;
    if (rv && !rv.dead) {
      var ri0 = rv.body.indexOf(c);
      if (ri0 === 0) {
        // the spec: a head-on collision takes the same number of segments from both snakes
        hurtRival(X, cfg['rival.damage']);
        stop(X);
        hurt(X, cfg['rival.damage'], true);
        return;
      }
      if (ri0 > 0) { hit(X, 'rival'); return; }
    }
    if (g.boss === 'poloz' && g.b && !g.b.dead && g.b.body.indexOf(c) >= 0) { hit(X, 'boss'); return; }
    var own = bodyAt(run, c);
    if (own > 0) {
      if (run.snake === 'glass') {
        // the glass snake slides through itself
      } else if (run.ab.ghost && run.steps - run.ghost >= cfg['ab.ghost.every']) {
        run.ghost = run.steps;
        fx(run, 'ghost');
      } else if (run.bricks.phase && run.steps - run.ghost >= run.bricks.phase) {
        run.ghost = run.steps;
        fx(run, 'ghost');
      } else {
        run.bites++;
        fx(run, 'bite');
        if (cfg['rules.classicDeath']) { die(X, 'bite'); return; }
        if (!run.ab.spine) { cut(X, own); if (!alive(run)) return; }
      }
    }
    moveHead(X, c);
    prick(X, c);
    if (!alive(run)) return;
    eatCreatures(X, c);
    magnet(X);
    eatAt(X, c);
    if (run.ab.tongue) { var t = stepOf(g, c, run.dir, !!run.ab.wrap); if (t >= 0) eatAt(X, t); }
    if (run.ab.shadow) shadowStep(X);
    vineGrow(X);
    if (turned && run.ab.whip) whip(X);
    ringCheck(X);
  }

  function smash(g, c) {
    setCell(g, c, '.');
    g.vines.forEach(function (v) { var i = v.indexOf(c); if (i >= 0) v.splice(i, 1); });
    g.vines = g.vines.filter(function (v) { return v.length > 0; });
  }

  function prick(X, c) {
    var run = X.run;
    var g = run.g;
    var near = [];
    for (var d = 0; d < 4; d++) { var n = stepOf(g, c, d, false); if (n >= 0 && at(g, n) === 'h') near.push(n); }
    var fresh = near.filter(function (n) { return g.near.indexOf(n) < 0; });
    g.near = near;
    if (fresh.length) {
      run.streak = 0;
      fx(run, 'prick');
      // each needle is a blow of its own: the thick skin and the armour soften it. Stronger than the
      // spec's −1 on purpose: with −1 the empty workshop wins 56 % instead of 27 % (target 10 %), see README
      for (var f1 = 0; f1 < fresh.length && alive(run); f1++) tear(X, X.cfg['hedgehog.damage'] + landNo(g.n) * X.cfg['hit.landExtra']);
    }
  }

  function eatCreatures(X, c) {
    var run = X.run;
    var g = run.g;
    var cfg = X.cfg;
    var bonus = run.ab.devour ? cfg['ab.devour.length'] : 0;
    for (var i = g.beetles.length - 1; i >= 0; i--) {
      if (g.beetles[i].c !== c) continue;
      g.beetles.splice(i, 1);
      run.pend += cfg['beetle.length'] + bonus;
      if (X.r.next() < cfg['beetle.seedChance']) run.seeds += drop(X, 1);
      fx(run, 'beetle');
    }
    for (i = g.mice.length - 1; i >= 0; i--) {
      if (g.mice[i].c !== c) continue;
      g.mice.splice(i, 1);
      run.pend += cfg['mouse.length'] + bonus;
      run.seeds += drop(X, cfg['mouse.seeds']);
      fx(run, 'mouse');
    }
    grew(run);
  }

  function magnet(X) {
    var run = X.run;
    var g = run.g;
    var cfg = X.cfg;
    var R = (run.ab.magnet ? cfg['ab.magnet.radius'] + run.ab.magnet - 1 : 0) + (run.bricks.magnet || 0);
    if (!R) return;
    var head = run.body[0];
    g.food.forEach(function (f) {
      if (f.c === head || cheb(g, f.c, head) > R) return;
      var best = -1;
      var bd = manh(g, f.c, head);
      for (var d = 0; d < 4; d++) {
        var n = stepOf(g, f.c, d, false);
        if (n < 0 || blocks(at(g, n)) || foodAt(g, n) >= 0) continue;
        if (n !== head && run.body.indexOf(n) >= 0) continue;
        var dd = manh(g, n, head);
        if (dd < bd) { bd = dd; best = n; }
      }
      if (best >= 0) f.c = best;
    });
  }

  function shadowStep(X) {
    var run = X.run;
    var g = run.g;
    var lag = X.cfg['ab.shadow.lag'];
    if (run.hist.length <= lag) return;
    var c = run.hist[lag];
    for (var i = g.food.length - 1; i >= 0; i--) if (i < g.food.length && g.food[i].c === c && g.food[i].k !== 'c') eatFood(X, i);
    for (i = g.beetles.length - 1; i >= 0; i--) if (g.beetles[i].c === c) { g.beetles.splice(i, 1); fx(run, 'kill'); }
  }

  function vineGrow(X) {
    var run = X.run;
    var g = run.g;
    var cfg = X.cfg;
    if (!g.vines.length || run.steps % cfg['vine.every'] !== 0) return;
    var occ = occupied(X);
    g.vines.forEach(function (v) {
      if (v.length >= cfg['vine.max']) return;
      var base = pick(X.r, v);
      var opts = [];
      for (var d = 0; d < 4; d++) {
        var n = stepOf(g, base, d, false);
        if (n < 0 || blocks(at(g, n)) || occ[n] || cheb(g, n, g.exit) <= 1 || n === g.start) continue;
        if (cheb(g, n, run.body[0]) <= 1) continue;
        opts.push(n);
      }
      if (!opts.length) return;
      var c = pick(X.r, opts);
      var before = g.grid;
      setCell(g, c, 'v');
      if (!connected(g, run.body[0])) { g.grid = before; return; }
      v.push(c);
      occ[c] = 1;
    });
  }

  function whip(X) {
    var run = X.run;
    var g = run.g;
    var R = X.cfg['ab.whip.radius'];
    var tail = run.body[run.body.length - 1];
    var hitAny = false;
    for (var i = g.beetles.length - 1; i >= 0; i--) if (cheb(g, g.beetles[i].c, tail) <= R) { g.beetles.splice(i, 1); hitAny = true; }
    for (i = g.mice.length - 1; i >= 0; i--) if (cheb(g, g.mice[i].c, tail) <= R) { g.mice.splice(i, 1); hitAny = true; }
    for (var dy = -R; dy <= R; dy++) for (var dx = -R; dx <= R; dx++) {
      var x = cx(g, tail) + dx;
      var y = cy(g, tail) + dy;
      if (x < 0 || y < 0 || x >= g.w || y >= g.h) continue;
      if (at(g, y * g.w + x) === 'h') { setCell(g, y * g.w + x, '.'); hitAny = true; }
    }
    if (hitAny) fx(run, 'whip');
  }

  /** Кольцо силы: the head closed the body around cells — everything inside is eaten. */
  function ringCheck(X) {
    var run = X.run;
    var g = run.g;
    var b = run.body;
    if (b.length < 8) return;
    var head = b[0];
    var touch = false;
    for (var d = 0; d < 4 && !touch; d++) {
      var n = stepOf(g, head, d, false);
      if (n >= 0 && b.indexOf(n, 3) >= 3) touch = true;
    }
    if (!touch) return;
    var isBody = [];
    b.forEach(function (c) { isBody[c] = 1; });
    var out = [];
    var list = [];
    function seed(c) { if (!isBody[c] && !out[c]) { out[c] = 1; list.push(c); } }
    for (var x = 0; x < g.w; x++) { seed(x); seed((g.h - 1) * g.w + x); }
    for (var y = 0; y < g.h; y++) { seed(y * g.w); seed(y * g.w + g.w - 1); }
    for (var i = 0; i < list.length; i++) {
      for (d = 0; d < 4; d++) { var q = stepOf(g, list[i], d, false); if (q >= 0) seed(q); }
    }
    var inside = [];
    for (var c = 0; c < g.w * g.h; c++) if (!isBody[c] && !out[c]) inside.push(c);
    if (!inside.length) return;
    if (inside.length > run.ring) run.ring = inside.length;
    if (!run.ab.ring || run.steps - g.ringAt < X.cfg['ab.ring.cd']) return;
    var inSet = [];
    inside.forEach(function (q) { inSet[q] = 1; });
    var ate = false;
    for (i = g.food.length - 1; i >= 0; i--) if (i < g.food.length && inSet[g.food[i].c]) { eatFood(X, i); ate = true; }
    var cfg = X.cfg;
    for (i = g.beetles.length - 1; i >= 0; i--) if (inSet[g.beetles[i].c]) { g.beetles.splice(i, 1); run.pend += cfg['beetle.length']; ate = true; }
    for (i = g.mice.length - 1; i >= 0; i--) if (inSet[g.mice[i].c]) { g.mice.splice(i, 1); run.pend += cfg['mouse.length']; ate = true; }
    if (g.rival && !g.rival.dead && inSet[g.rival.body[0]]) { killRival(X); ate = true; }
    grew(run);
    if (ate) { g.ringAt = run.steps; fx(run, 'ring'); }
  }

  // ---- the world: creatures and masters ---------------------------------------------------------

  function world(X, dt) {
    var run = X.run;
    var g = run.g;
    var cfg = X.cfg;
    g.t += dt;
    if (g.holes.length) { g.holeT -= dt; if (g.holeT <= 0) { moveHoles(X); g.holeT = cfg['hole.every']; } }
    if (g.hawkOn) hawkTime(X, dt);
    if (!alive(run)) return;
    if (g.rockOn) rockTime(X, dt);
    if (!alive(run)) return;
    // fruits that could not be placed (the field was full) come back as soon as there is room
    var want = g.boss === 'mother' ? cfg['boss.motherFood'] : cfg['fruit.onField'];
    var have = 0;
    for (var f0 = 0; f0 < g.food.length; f0++) if (g.food[f0].k === 'f') have++;
    if (have < want) spawnFood(X, 'f');
    var bs = cfg['beetle.stepSec'];
    for (var i = g.beetles.length - 1; i >= 0; i--) {
      var b = g.beetles[i];
      if (!b) continue;
      b.t += dt;
      while (b.t >= bs && g.beetles.indexOf(b) >= 0 && alive(run)) { b.t -= bs; beetleStep(X, b); }
    }
    if (!alive(run)) return;
    var ms = cfg['mouse.stepSec'];
    for (i = g.mice.length - 1; i >= 0; i--) {
      var m = g.mice[i];
      if (!m) continue;
      m.t += dt;
      while (m.t >= ms && g.mice.indexOf(m) >= 0) { m.t -= ms; mouseStep(X, m); }
    }
    if (g.rival && !g.rival.dead) rivalTime(X, dt);
    if (!alive(run)) return;
    if (g.boss === 'poloz') polozTime(X, dt);
    else if (g.boss === 'mother') motherTime(X, dt);
    else if (g.boss === 'stone') stoneTime(X, dt);
  }

  function moveHoles(X) {
    var run = X.run;
    var g = run.g;
    var occ = occupied(X);
    var res = reservedOf(g);
    var lr = X.r;
    var out = [];
    for (var p = 0; p < g.holes.length / 2; p++) {
      var a = freeCell(g, lr, res, function (q) { return !occ[q] && out.indexOf(q) < 0; });
      var b = freeCell(g, lr, res, function (q) { return !occ[q] && out.indexOf(q) < 0 && a >= 0 && manh(g, a, q) >= 8; });
      if (a < 0 || b < 0) return;
      out.push(a, b);
    }
    g.holes = out;
    fx(run, 'holes');
  }

  function venomOn(run) { return !!(run.ab.venom || run.bricks.venom); }

  function touchesBody(run, g, c) {
    for (var d = 0; d < 4; d++) {
      var n = stepOf(g, c, d, false);
      if (n >= 0 && run.body.indexOf(n) >= 1) return true;
    }
    return false;
  }

  function hawkTime(X, dt) {
    var run = X.run;
    var g = run.g;
    var cfg = X.cfg;
    var slow = run.ab.herbs ? 1 + cfg['ab.herbs.slow'] : 1;
    if (!g.hawk) {
      g.hawkT -= dt;
      if (g.hawkT > 0) return;
      var head = run.body[0];
      var x = clamp(cx(g, head) + DX[run.dir] * cfg['hawk.lead'], 1, g.w - 2);
      var y = clamp(cy(g, head) + DY[run.dir] * cfg['hawk.lead'], 1, g.h - 2);
      g.hawk = { c: y * g.w + x, t: cfg['hawk.warn'] * slow };
      fx(run, 'hawk');
      return;
    }
    g.hawk.t -= dt;
    if (g.hawk.t > 0) return;
    var c0 = g.hawk.c;
    g.hawk = null;
    g.hawkT = cfg['hawk.every'] * slow;
    fx(run, 'strike');
    // the spec: the segments in the square are cut off, the head among them; the snake is shorter by as many
    var n = 0;
    for (var i = 0; i < run.body.length; i++) if (cheb(g, run.body[i], c0) <= 1) n++;
    if (!n) return;
    if (cheb(g, run.body[0], c0) <= 1 && !blow(X)) return;
    fx(run, 'cut');
    tear(X, n);
  }

  function rockTime(X, dt) {
    var run = X.run;
    var g = run.g;
    var cfg = X.cfg;
    g.rockT -= dt;
    if (g.rockT <= 0) {
      g.rockT = cfg['rock.every'];
      var head = run.body[0];
      var opts = [];
      var R = cfg['rock.near'];
      for (var dy = -R; dy <= R; dy++) for (var dx = -R; dx <= R; dx++) {
        var x = cx(g, head) + dx;
        var y = cy(g, head) + dy;
        if (x < 0 || y < 0 || x >= g.w || y >= g.h) continue;
        var c = y * g.w + x;
        if (blocks(at(g, c)) || foodAt(g, c) >= 0 || cheb(g, c, g.exit) <= 1 || g.holes.indexOf(c) >= 0) continue;
        var taken = false;
        g.rocks.forEach(function (m) { if (m.c === c) taken = true; });
        if (!taken) opts.push(c);
      }
      if (opts.length) { g.rocks.push({ c: pick(X.r, opts), t: cfg['rock.delay'] }); fx(run, 'mark'); }
    }
    for (var i = g.rocks.length - 1; i >= 0; i--) {
      var m = g.rocks[i];
      m.t -= dt;
      if (m.t > 0) continue;
      g.rocks.splice(i, 1);
      fx(run, 'rock');
      if (m.c === run.body[0]) { hurt(X, cfg['rock.damage']); if (!alive(run)) return; continue; }
      // a segment under the stone is crushed; the stone rolls off the snake
      if (run.body.indexOf(m.c) > 0) { fx(run, 'cut'); lose(X, 1); if (!alive(run)) return; continue; }
      if (g.fallen >= cfg['rock.max']) continue;
      var before = g.grid;
      setCell(g, m.c, '#');
      if (!connected(g, run.body[0])) { g.grid = before; continue; }
      g.fallen++;
      g.beetles = g.beetles.filter(function (b) { return b.c !== m.c; });
      g.mice = g.mice.filter(function (b) { return b.c !== m.c; });
      var fi = foodAt(g, m.c);
      if (fi >= 0) { var f = g.food.splice(fi, 1)[0]; if (f.k !== 'b') spawnFood(X, f.k); }
    }
  }

  function creatureFree(X, n) {
    var run = X.run;
    var g = run.g;
    if (n < 0 || blocks(at(g, n)) || run.body.indexOf(n) >= 0 || creatureAt(g, n)) return false;
    if (g.exitOpen && n === g.exit) return false;
    if (g.rival && !g.rival.dead && g.rival.body.indexOf(n) >= 0) return false;
    if (g.boss === 'poloz' && g.b && !g.b.dead && g.b.body.indexOf(n) >= 0) return false;
    return true;
  }

  function beetleStep(X, b) {
    var run = X.run;
    var g = run.g;
    var cfg = X.cfg;
    var r = X.r;
    var tail = run.body[run.body.length - 1];
    var flee = run.ab.rattle && cheb(g, b.c, tail) <= cfg['ab.rattle.radius'];
    var wander = r.next() < cfg['beetle.wander'];
    var goal = -1;
    var gd = 1e9;
    g.food.forEach(function (f) { if (f.k !== 'c') { var d0 = manh(g, b.c, f.c); if (d0 < gd) { gd = d0; goal = f.c; } } });
    var best = -1;
    var bestScore = 1e9;
    for (var d = 0; d < 4; d++) {
      var n = stepOf(g, b.c, d, false);
      if (!creatureFree(X, n)) continue;
      var score = flee ? -manh(g, n, tail) : (wander || goal < 0) ? r.next() : manh(g, n, goal) + r.next() * 0.5;
      if (score < bestScore) { bestScore = score; best = n; }
    }
    if (best < 0) return;
    b.c = best;
    if (venomOn(run) && touchesBody(run, g, b.c)) { g.beetles.splice(g.beetles.indexOf(b), 1); fx(run, 'venom'); return; }
    var fi = foodAt(g, b.c);
    if (fi >= 0 && g.food[fi].k !== 'c') {
      var f = g.food.splice(fi, 1)[0];
      fx(run, 'stolen');
      if (f.k === 'f') spawnFood(X, 'f');
      if (g.boss === 'mother') {
        g.b.lost++;
        if (g.b.lost >= cfg['boss.motherBeetles']) { g.b.lost = 0; fx(run, 'mother'); lose(X, cfg['boss.motherPenalty']); }
      }
    }
  }

  function mouseStep(X, m) {
    var run = X.run;
    var g = run.g;
    var cfg = X.cfg;
    var r = X.r;
    var head = run.body[0];
    var tail = run.body[run.body.length - 1];
    var scared = manh(g, m.c, head) <= cfg['mouse.fear'] || (run.ab.rattle && cheb(g, m.c, tail) <= cfg['ab.rattle.radius']);
    if (!scared && r.next() < cfg['mouse.idle']) return;
    var best = -1;
    var bestScore = -1e9;
    for (var d = 0; d < 4; d++) {
      var n = stepOf(g, m.c, d, false);
      if (!creatureFree(X, n) || foodAt(g, n) >= 0) continue;
      var score = scared ? manh(g, n, head) + r.next() * 0.5 : r.next();
      if (score > bestScore) { bestScore = score; best = n; }
    }
    if (best < 0) return;
    m.c = best;
    if (venomOn(run) && touchesBody(run, g, m.c)) { g.mice.splice(g.mice.indexOf(m), 1); fx(run, 'venom'); }
  }

  // ---- the rival --------------------------------------------------------------------------------

  /** First direction of the shortest way from `from` to the nearest target, or -1. */
  function bfsDir(g, from, noDir, pass, isTarget, limit) {
    var seen = [];
    var first = [];
    var list = [from];
    seen[from] = 1;
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if (i > 0 && isTarget(c)) return first[c];
      if (limit && i > limit) break;
      for (var d = 0; d < 4; d++) {
        if (i === 0 && d === noDir) continue;
        var n = stepOf(g, c, d, false);
        if (n < 0 || seen[n] || !pass(n)) continue;
        seen[n] = 1;
        first[n] = i === 0 ? d : first[c];
        list.push(n);
      }
    }
    return -1;
  }

  function rivalTime(X, dt) {
    var run = X.run;
    var rv = run.g.rival;
    var cfg = X.cfg;
    if (rv.stun > 0) { rv.stun = Math.max(0, rv.stun - dt); return; }
    rv.acc += dt;
    var p = 1 / (speedOf(run, cfg) * cfg['rival.speed'] * (run.ab.herbs ? 1 - cfg['ab.herbs.slow'] : 1));
    var guard = 0;
    while (rv.acc >= p && !rv.dead && alive(run) && guard++ < 4) { rv.acc -= p; rivalStep(X); }
  }

  function rivalStep(X) {
    var run = X.run;
    var g = run.g;
    var cfg = X.cfg;
    var rv = g.rival;
    var head = rv.body[0];
    var tailFree = rv.pend > 0 ? -1 : rv.body[rv.body.length - 1];
    var pass = function (n) {
      if (blocks(at(g, n)) || run.body.indexOf(n) >= 0 || creatureAt(g, n)) return false;
      if (n !== tailFree && rv.body.indexOf(n) >= 0) return false;
      if (g.exitOpen && n === g.exit) return false;
      return true;
    };
    var back = rv.body.length > 1 ? dirTo(g, head, rv.body[1]) : -1;
    var d = bfsDir(g, head, back, pass, function (c) { return foodAt(g, c) >= 0 && g.food[foodAt(g, c)].k !== 'c'; }, 400);
    if (d < 0) {
      var opts = [];
      for (var k = 0; k < 4; k++) { if (k === back) continue; var q = stepOf(g, head, k, false); if (q >= 0 && pass(q)) opts.push(k); }
      if (opts.length) d = pick(X.r, opts);
    }
    if (d < 0) { hurtRival(X, cfg['rival.damage']); rv.stun = cfg['hit.stopSec']; return; }
    var n = stepOf(g, head, d, false);
    rv.dir = d;
    rv.body.unshift(n);
    if (rv.pend > 0) rv.pend--; else rv.body.pop();
    var fi = foodAt(g, n);
    if (fi >= 0 && g.food[fi].k !== 'c') {
      var f = g.food.splice(fi, 1)[0];
      if (rv.body.length + rv.pend < cfg['rival.max']) rv.pend++;
      fx(run, 'stolen');
      if (f.k === 'f') spawnFood(X, 'f');
    }
    if (venomOn(run) && touchesBody(run, g, n)) { killRival(X); fx(run, 'venom'); }
  }

  function hurtRival(X, n) {
    var rv = X.run.g.rival;
    if (!rv || rv.dead) return;
    var take = Math.min(rv.pend, n);
    rv.pend -= take;
    n -= take;
    while (n > 0 && rv.body.length > 1) { rv.body.pop(); n--; }
    if (rv.body.length + rv.pend < X.cfg['snake.minLength']) killRival(X);
  }

  function killRival(X) {
    var run = X.run;
    var g = run.g;
    var rv = g.rival;
    if (!rv || rv.dead) return;
    var k = 0;
    rv.body.forEach(function (c) {
      if (k < X.cfg['rival.drop'] && foodAt(g, c) < 0 && run.body.indexOf(c) < 0 && !blocks(at(g, c))) { g.food.push({ c: c, k: 'b' }); k++; }
    });
    rv.dead = true;
    rv.body = [];
    fx(run, 'rival');
  }

  // ---- the masters ------------------------------------------------------------------------------

  function polozTime(X, dt) {
    var run = X.run;
    var b = run.g.b;
    var cfg = X.cfg;
    if (b.dead) return;
    if (b.stun > 0) { b.stun = Math.max(0, b.stun - dt); return; }
    b.acc += dt;
    var p = 1 / (speedOf(run, cfg) * cfg['boss.polozSpeed']);
    var guard = 0;
    while (b.acc >= p && !b.dead && alive(run) && guard++ < 4) { b.acc -= p; polozStep(X); }
  }

  function polozStep(X) {
    var run = X.run;
    var g = run.g;
    var cfg = X.cfg;
    var b = g.b;
    var head = b.body[0];
    var target = run.body[0];
    var careful = X.r.next() < cfg['boss.polozCareful'];
    var tailFree = b.pend > 0 ? -1 : b.body[b.body.length - 1];
    var back = b.body.length > 1 ? dirTo(g, head, b.body[1]) : -1;
    var best = -1;
    var bd = 1e9;
    for (var d = 0; d < 4; d++) {
      if (d === back) continue;
      var n = stepOf(g, head, d, false);
      var safe = n >= 0 && !blocks(at(g, n)) && (n === tailFree || b.body.indexOf(n) < 0) && run.body.indexOf(n) <= 0;
      if (careful && !safe) continue;
      var tx = cx(g, head) + DX[d];
      var ty = cy(g, head) + DY[d];
      var dist = Math.abs(tx - cx(g, target)) + Math.abs(ty - cy(g, target)) + X.r.next() * 0.5;
      if (dist < bd) { bd = dist; best = d; }
    }
    if (best < 0) { polozCrash(X); return; }
    b.dir = best;
    var c = stepOf(g, head, best, false);
    if (c < 0 || blocks(at(g, c)) || (c !== tailFree && b.body.indexOf(c) >= 0)) { polozCrash(X); return; }
    var pi = run.body.indexOf(c);
    if (pi === 0) { b.stun = cfg['boss.polozStun']; stop(X); hurt(X, cfg['hit.damage']); return; }
    // it ran into the player's body: that is one of the three blows it has to take
    if (pi > 0) { polozCrash(X); return; }
    b.body.unshift(c);
    if (b.pend > 0) b.pend--; else b.body.pop();
  }

  function polozCrash(X) {
    var run = X.run;
    var g = run.g;
    var cfg = X.cfg;
    var b = g.b;
    b.hits++;
    b.stun = cfg['boss.polozStun'];
    var n = cfg['boss.polozLose'];
    var take = Math.min(b.pend, n);
    b.pend -= take;
    n -= take;
    while (n > 0 && b.body.length > 1) { b.body.pop(); n--; }
    fx(run, 'bossHit');
    if (b.hits < b.need) return;
    var k = 0;
    b.body.forEach(function (c) {
      if (k < cfg['boss.polozFood'] && foodAt(g, c) < 0 && run.body.indexOf(c) < 0) { g.food.push({ c: c, k: 'b' }); k++; }
    });
    b.dead = true;
    b.body = [];
    fx(run, 'bossDown');
    openExit(X);
  }

  function motherTime(X, dt) {
    var run = X.run;
    var g = run.g;
    var cfg = X.cfg;
    var b = g.b;
    if (g.exitOpen) return;
    b.t -= dt;
    if (b.t > 0) return;
    b.t = cfg['boss.motherEvery'];
    if (g.beetles.length >= b.max) return;
    var opts = [];
    b.cells.forEach(function (c) {
      for (var d = 0; d < 4; d++) { var n = stepOf(g, c, d, false); if (creatureFree(X, n) && opts.indexOf(n) < 0) opts.push(n); }
    });
    if (opts.length) { g.beetles.push({ c: pick(X.r, opts), t: 0 }); fx(run, 'spawn'); }
  }

  function stoneTime(X, dt) {
    var run = X.run;
    var g = run.g;
    var cfg = X.cfg;
    var b = g.b;
    if (g.exitOpen) return;
    b.t -= dt;
    if (!b.warn && b.t <= cfg['boss.stoneWarn']) { b.warn = true; fx(run, 'warn'); }
    if (b.t > 0) return;
    b.t = cfg['boss.stoneSec'];
    b.warn = false;
    if (b.ring >= b.rings) {
      b.fails++;
      clearRings(X);
      fx(run, 'stoneFail');
      lose(X, cfg['boss.stoneFail']);
      return;
    }
    closeRing(X, b.ring);
    b.ring++;
  }

  function closeRing(X, k) {
    var run = X.run;
    var g = run.g;
    var cfg = X.cfg;
    var head = run.body[0];
    if (edgeDist(g, head) === k) { hurt(X, cfg['hit.damage']); if (!alive(run)) return; }
    // segments caught by the ring are crushed: the snake is shorter by as many
    var caught = 0;
    for (var i = 1; i < run.body.length; i++) if (edgeDist(g, run.body[i]) === k) caught++;
    if (caught) { fx(run, 'cut'); tear(X, caught); if (!alive(run)) return; }
    var keep = [];
    run.body.forEach(function (c) { keep[c] = 1; });
    var chars = g.grid.split('');
    for (var c = 0; c < chars.length; c++) if (edgeDist(g, c) === k && !keep[c]) chars[c] = '#';
    g.grid = chars.join('');
    g.beetles = g.beetles.filter(function (q) { return edgeDist(g, q.c) !== k; });
    g.mice = g.mice.filter(function (q) { return edgeDist(g, q.c) !== k; });
    for (i = g.food.length - 1; i >= 0; i--) {
      if (edgeDist(g, g.food[i].c) !== k) continue;
      var f = g.food.splice(i, 1)[0];
      if (f.k !== 'b') spawnFood(X, f.k);
    }
    fx(run, 'ring-close');
  }

  function clearRings(X) {
    var g = X.run.g;
    var b = g.b;
    if (!b || !b.base) return;
    var chars = g.grid.split('');
    for (var c = 0; c < chars.length; c++) if (edgeDist(g, c) < b.ring) chars[c] = b.base.charAt(c);
    g.grid = chars.join('');
    b.ring = 0;
    b.warn = false;
    b.t = X.cfg['boss.stoneSec'];
  }

  // ---- glade done, the burrow, the end ----------------------------------------------------------

  function gladeDone(X) {
    var run = X.run;
    var g = run.g;
    var cfg = X.cfg;
    var m = meta(X.s);
    var lastN = cfg['run.glades'] - 1;
    if (g.boss) { run.bosses++; run.seeds += cfg['boss.seeds']; } else run.glades++;
    run.seeds += cfg['glade.seeds'];
    if (g.n === 2) m.rec.meadow = true;
    if (g.n === 5 && run.bites === run.bogBites) m.rec.bogClean = true;
    if (run.endless) m.rec.endless = Math.max(m.rec.endless, g.n - lastN);
    fx(run, g.boss ? 'boss' : 'exit');
    unlocks(X);
    if (g.n === lastN && !run.won) {
      run.won = true;
      run.phase = 'over';
      finish(X, true, 'win');
      return;
    }
    if (g.boss) openShop(X); else startGlade(X, g.n + 1);
  }

  function earned(run, cfg) {
    var mult = run.snake === 'copper' ? cfg['snake.copper.score'] : 1;
    var base = Math.floor(run.score * mult / cfg['scales.perFruits']) + run.glades * cfg['scales.perGlade'] + run.bosses * cfg['scales.perBoss'];
    if (cfg['scales.bossGlade']) base += run.bosses * cfg['scales.perGlade'];
    return Math.floor(base * (1 + run.molt * cfg['molt.bonus']) * (run.lm || 1));
  }

  function bank(X) {
    var run = X.run;
    var m = meta(X.s);
    var total = earned(run, X.cfg);
    var add = Math.max(0, total - run.banked);
    run.banked = Math.max(run.banked, total);
    m.scales = num(m.scales) + add;
    return add;
  }

  function unlocks(X) {
    var m = meta(X.s);
    var rec = m.rec;
    var cfg = X.cfg;
    var got = [];
    rec.bestLen = Math.max(rec.bestLen, X.run.maxLen);
    function give(id, cond) {
      if (cond && !m.unlocked[id]) { m.unlocked[id] = true; got.push(id); fx(X.run, 'unlock:' + id); }
    }
    give('copper', rec.meadow);
    give('boa', rec.bestLen >= cfg['unlock.boa.length']);
    give('twohead', rec.bogClean);
    give('glass', rec.wins >= 1);
    return got;
  }

  function finish(X, won, reason) {
    var s = X.s;
    var run = X.run;
    var cfg = X.cfg;
    var m = meta(s);
    var rec = m.rec;
    var add = bank(X);
    rec.bestLen = Math.max(rec.bestLen, run.maxLen);
    rec.bestGlades = Math.max(rec.bestGlades, run.glades + run.bosses);
    rec.ring = Math.max(rec.ring, run.ring);
    var sec = run.sec - (run.secBanked || 0);
    rec.sec += sec;
    run.secBanked = run.sec;
    if (won) {
      rec.wins++;
      if (!rec.firstWinSec) rec.firstWinSec = Math.round(rec.sec);
      if (!run.bites) rec.cleanWin = true;
      var top = moltTop(s);
      if (run.molt === top && top < cfg['molt.max']) m.ascend = true;
    }
    if (run.daily) {
      if (m.daily.day !== run.day) m.daily = { day: run.day, best: 0, tries: 0 };
      m.daily.tries++;
      m.daily.best = Math.max(m.daily.best, run.glades + run.bosses);
    }
    var got = unlocks(X);
    var prev = run.result;
    run.result = {
      won: run.won, reason: reason, scales: run.banked, add: add + (prev ? prev.add : 0), glades: run.glades + run.bosses,
      len: run.maxLen, fruits: run.fruits, sec: Math.round(run.sec), mult: run.lm || 1, endless: run.endless,
      snakes: (prev ? prev.snakes : []).concat(got), ascend: m.ascend
    };
    fx(run, won ? 'win' : 'over');
  }

  /** «Тропа без конца» after a victory: the burrow, then glade 10, 11 … faster each. */
  function continueEndless(state, cfg) {
    var run = state.run;
    if (!run || run.phase !== 'over' || !run.won || !cfg['rules.endless'] || !run.result || run.result.reason !== 'win') return { ok: false };
    var X = open(state, cfg);
    run.endless = true;
    openShop(X);
    close(X);
    return { ok: true };
  }

  // ---- abilities --------------------------------------------------------------------------------

  function extraOf(item) {
    if (!item || !item.title) return null;
    return {
      id: item.id || 'x' + Rng.hash(String(item.title)), rarity: item.rarity || 'rare', max: 1,
      short: item.short || String(item.title).slice(0, 5), title: item.title, text: item.text || '', bricks: item.bricks || []
    };
  }

  function abilityOf(run, id) {
    if (AB[id]) return AB[id];
    var list = run.extra || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  function weightOf(a, cfg) {
    return a.rarity === 'legend' ? cfg['ab.wLegend'] : a.rarity === 'rare' ? cfg['ab.wRare'] : cfg['ab.wCommon'];
  }

  function rollOptions(X, k, skip) {
    var run = X.run;
    var cfg = X.cfg;
    var pool = [];
    need().abilities.forEach(function (a) { if ((run.ab[a.id] || 0) < a.max && (!skip || skip.indexOf(a.id) < 0)) pool.push(a); });
    (run.extra || []).forEach(function (a) { if (!run.ab[a.id] && (!skip || skip.indexOf(a.id) < 0)) pool.push(a); });
    var out = [];
    while (out.length < k && pool.length) {
      var tot = 0;
      pool.forEach(function (a) { tot += weightOf(a, cfg); });
      var x = X.r.next() * tot;
      var i = 0;
      for (; i < pool.length - 1; i++) { x -= weightOf(pool[i], cfg); if (x < 0) break; }
      out.push(pool[i].id);
      pool.splice(i, 1);
    }
    return out;
  }

  function openCurio(X) {
    var run = X.run;
    var cfg = X.cfg;
    var g = run.g;
    run.seeds += drop(X, cfg['curio.seeds']);
    var landN = Math.floor(g.n / 3);
    var k = cfg['ab.choices'];
    var luck = false;
    if (run.ab.luck && run.luck !== landN) { k = cfg['ab.luck.choices']; luck = true; }
    var opts = rollOptions(X, k);
    fx(run, 'curio');
    if (!opts.length) return;
    if (luck) run.luck = landN;
    run.pick = { opts: opts, luck: luck };
    run.phase = 'pick';
  }

  function applyAbility(X, id) {
    var run = X.run;
    var cfg = X.cfg;
    var g = run.g;
    var m = meta(X.s);
    var a = abilityOf(run, id);
    if (!a) return false;
    run.ab[id] = (run.ab[id] || 0) + 1;
    m.album.abilities[id] = (m.album.abilities[id] || 0) + 1;
    if (id === 'reserve') run.pend += cfg['ab.reserve'];
    if (g && alive(run)) {
      if (id === 'ram') g.ram++;
      if (id === 'brow') g.brow++;
      if (id === 'curl') g.curlLeft++;
    }
    if (id === 'sight') run.next = preview(X, (g ? g.n : -1) + 1);
    (a.bricks || []).forEach(function (b) {
      var v = Number(b.value) || 0;
      if (b.brick === 'speed') run.bricks.speed = (run.bricks.speed || 0) + v;
      if (b.brick === 'length') run.pend += Math.max(0, Math.round(v));
      if (b.brick === 'phase') run.bricks.phase = run.bricks.phase ? Math.min(run.bricks.phase, v) : v;
      if (b.brick === 'bodyDamage') run.bricks.venom = true;
      if (b.brick === 'magnet') run.bricks.magnet = (run.bricks.magnet || 0) + v;
      if (b.brick === 'seeds') run.seeds += Math.max(0, Math.round(v));
    });
    grew(run);
    fx(run, 'pick');
    return true;
  }

  function choose(state, cfg, i) {
    var run = state.run;
    if (!run || run.phase !== 'pick' || !run.pick) return { ok: false };
    var id = run.pick.opts[i];
    if (!id) return { ok: false };
    var X = open(state, cfg);
    run.pick = null;
    run.phase = 'play';
    applyAbility(X, id);
    run.count = Math.max(run.count, cfg['countdown.pickSec']);
    close(X);
    return { ok: true, id: id };
  }

  function reroll(state, cfg) {
    var run = state.run;
    if (!run || run.phase !== 'pick' || !run.pick || run.rerolls <= 0) return { ok: false };
    var X = open(state, cfg);
    run.rerolls--;
    var opts = rollOptions(X, run.pick.opts.length, run.pick.opts);
    if (opts.length < run.pick.opts.length) opts = opts.concat(rollOptions(X, run.pick.opts.length - opts.length, opts));
    run.pick.opts = opts;
    fx(run, 'reroll');
    close(X);
    return { ok: true };
  }

  function openShop(X) {
    var run = X.run;
    run.phase = 'shop';
    run.shop = { items: shopItems(X, []), rolls: 0 };
    fx(run, 'shop');
  }

  function shopItems(X, skip) {
    var cfg = X.cfg;
    var run = X.run;
    var items = rollOptions(X, 2, skip).map(function (id) {
      var a = abilityOf(run, id);
      return { kind: 'ab', id: id, price: cfg['burrow.' + a.rarity], sold: false };
    });
    items.push({ kind: 'snack', price: cfg['burrow.snack'], sold: false });
    items.push({ kind: 'reroll', price: cfg['burrow.reroll'], sold: false });
    return items;
  }

  function shopRollCost(run, cfg) { return cfg['burrow.roll'] + (run.shop ? run.shop.rolls : 0); }

  function shopBuy(state, cfg, i) {
    var run = state.run;
    if (!run || run.phase !== 'shop' || !run.shop) return { ok: false };
    var item = run.shop.items[i];
    if (!item || item.sold || run.seeds < item.price) return { ok: false };
    var X = open(state, cfg);
    run.seeds -= item.price;
    item.sold = true;
    if (item.kind === 'ab') applyAbility(X, item.id);
    else if (item.kind === 'snack') { run.pend += cfg['burrow.snackLength']; grew(run); fx(run, 'eat'); }
    else if (item.kind === 'reroll') { run.rerolls++; fx(run, 'buy'); }
    close(X);
    return { ok: true, item: item };
  }

  function shopRoll(state, cfg) {
    var run = state.run;
    if (!run || run.phase !== 'shop' || !run.shop) return { ok: false };
    var price = shopRollCost(run, cfg);
    if (run.seeds < price) return { ok: false };
    var X = open(state, cfg);
    run.seeds -= price;
    var keep = run.shop.items.filter(function (it) { return it.kind !== 'ab'; });
    var fresh = shopItems(X, []).filter(function (it) { return it.kind === 'ab'; });
    run.shop.items = fresh.concat(keep);
    run.shop.rolls++;
    fx(run, 'reroll');
    close(X);
    return { ok: true };
  }

  function shopLeave(state, cfg) {
    var run = state.run;
    if (!run || run.phase !== 'shop') return { ok: false };
    var X = open(state, cfg);
    startGlade(X, run.g.n + 1);
    close(X);
    return { ok: true };
  }

  // ---- the player's input -----------------------------------------------------------------------

  /** The direction the snake will have after its queue. */
  function lastDir(run) {
    var d = run.dir;
    for (var i = 0; i < run.q.length; i++) d = run.q[i] === REV ? revDir(run, d) : run.q[i];
    return d;
  }

  function revDir(run, d) {
    var b = run.body;
    if (b.length > 1 && run.g) { var r = dirTo(run.g, b[b.length - 2], b[b.length - 1]); if (r >= 0) return r; }
    return (d + 2) % 4;
  }

  /** A swipe: d = 0 up, 1 right, 2 down, 3 left. Two turns are remembered ahead. */
  function turn(state, cfg, d) {
    var run = state.run;
    if (!run || run.phase !== 'play' || run.paused || d < 0 || d > 3) return false;
    if (run.q.length >= cfg['control.buffer']) return false;
    var last = lastDir(run);
    if (d === last && !run.wait) return false;
    // «back» is where the neck is (after a blow the head still faces the wall)
    var back = run.q.length ? (last + 2) % 4 : neckDir(run);
    if (d === back) {
      if (run.ab.reverse || run.snake === 'twohead') { run.q.push(REV); return true; }
      if (run.body.length > 1) return false;
    }
    run.q.push(d);
    return true;
  }

  function neckDir(run) { return run.body.length > 1 && run.g ? dirTo(run.g, run.body[0], run.body[1]) : -1; }

  /** Halves of the screen: side -1 turns left, +1 turns right. */
  function turnRel(state, cfg, side) {
    var run = state.run;
    if (!run || run.phase !== 'play') return false;
    var d = (lastDir(run) + (side < 0 ? 3 : 1)) % 4;
    return turn(state, cfg, d);
  }

  function pause(state) {
    var run = state.run;
    if (!run || !alive(run) || run.paused) return false;
    run.paused = true;
    return true;
  }

  function resume(state, cfg) {
    var run = state.run;
    if (!run || !run.paused) return false;
    run.paused = false;
    if (run.phase === 'play') run.count = Math.max(run.count, cfg['countdown.resumeSec']);
    return true;
  }

  /** Рывок: up to dash.cells steps at once, stopping before anything hard. */
  function dash(state, cfg) {
    var run = state.run;
    if (!run || run.phase !== 'play' || run.paused || !run.ab.dash || run.dashT > 0) return { ok: false };
    if (run.count > 0 || run.wait || run.stun > 0 || run.curl > 0) return { ok: false };
    var X = open(state, cfg);
    var g = run.g;
    var moved = 0;
    for (var i = 0; i < cfg['ab.dash.cells'] && run.phase === 'play' && run.g === g; i++) {
      var c = stepOf(g, run.body[0], run.dir, !!run.ab.wrap);
      if (c < 0 || blocks(at(g, c)) || g.holes.indexOf(c) >= 0) break;
      if (bodyAt(run, c) > 0 && run.snake !== 'glass') break;
      if (g.rival && !g.rival.dead && g.rival.body.indexOf(c) >= 0) break;
      if (g.boss === 'poloz' && g.b && !g.b.dead && g.b.body.indexOf(c) >= 0) break;
      snakeStep(X, true);
      moved++;
    }
    if (moved) {
      run.dashT = Math.max(1, cfg['ab.dash.cd'] - cfg['ab.dash.cdStep'] * (run.ab.dash - 1));
      run.acc = 0;
      fx(run, 'dash');
    }
    close(X);
    return { ok: moved > 0 };
  }

  /** Свернуться: holding the finger keeps the snake still up to ab.curl.sec, once a glade a level. */
  function curl(state, cfg, on) {
    var run = state.run;
    if (!run || run.phase !== 'play' || !run.g) return false;
    if (!on) { if (run.curl > 0) { run.curl = 0; return true; } return false; }
    if (!run.ab.curl || run.g.curlLeft <= 0 || run.curl > 0 || run.count > 0) return false;
    run.g.curlLeft--;
    run.curl = cfg['ab.curl.sec'];
    fx(run, 'curl');
    return true;
  }

  function quit(state, cfg) {
    var run = state.run;
    if (!run || !alive(run)) return { ok: false };
    var X = open(state, cfg);
    run.paused = false;
    die(X, 'quit');
    close(X);
    return { ok: true };
  }

  function toHub(state) {
    var run = state.run;
    if (run && alive(run)) return false;
    state.run = { phase: 'hub', fxN: run && run.fxN || 0, fx: [] };
    return true;
  }

  // ---- runs and the workshop --------------------------------------------------------------------

  /**
   * A new run (o: {seed, snake, molt, charge, daily, day, layouts, extra}). The seed comes from the
   * screen (g.rng); the daily run from the day's hash; layouts and extra — what the stock gave.
   */
  function newRun(state, cfg, o) {
    o = o || {};
    var m = meta(state);
    need();
    var snake = o.snake && m.unlocked[o.snake] ? o.snake : 'poloz';
    var top = moltTop(state);
    var molt = clamp(Math.floor(o.molt || 0), 0, top);
    if (o.daily) { snake = 'poloz'; molt = 0; }
    var seed = (Math.floor(o.seed || 0) >>> 0) || 1;
    var r = Rng.make(seed);
    var up = {};
    UPGRADES.forEach(function (id) { up[id] = Math.min(m.shop[id] || 0, upgradeMax(cfg, id)); });
    var rule = rulesOf(molt);
    var L = (snake === 'boa' ? cfg['snake.boa.length'] : cfg['snake.startLength']) + up.long * cfg['shop.long.value'];
    if (o.charge) L += cfg['charge.length'];
    if (rule.short) L -= cfg['molt.startLength'];
    L = Math.max(cfg['snake.minLength'], L);
    var extra = (o.extra || []).map(extraOf).filter(function (a) { return a && !validateStock('abilities', a); }).slice(0, 12);
    var layouts = (o.layouts || []).filter(function (x) { return x && !validateStock('glades', x); }).slice(0, 12);
    var prev = state.run || {};
    var run = {
      phase: 'play', seed: seed, gs: Math.floor(r.next() * 2147483646) + 1, rs: 0,
      snake: snake, molt: molt, rule: rule, up: up, daily: !!o.daily, day: o.day || '', charge: !!o.charge,
      glade: 0, g: null, body: [], pend: L, dir: 0, q: [], acc: 0, stun: 0, wait: false, count: 0, curl: 0, paused: false,
      ab: {}, bricks: {}, extra: extra, layouts: layouts,
      seeds: up.sack * cfg['shop.sack.value'], rerolls: up.reroll * cfg['shop.reroll.value'],
      score: 0, fruits: 0, glades: 0, bosses: 0, bites: 0, bogBites: 0, hits: 0, maxLen: L, ring: 0, sec: 0, secBanked: 0, steps: 0,
      banked: 0, endless: false, won: false, luck: -1, dashT: 0, ghost: -1000, streak: 0, full: 0,
      hist: [], lastTail: -1, fx: [], fxN: prev.fxN || 0, pick: null, shop: null, next: null, result: null, lm: 1
    };
    state.run = run;
    m.rec.runs++;
    m.choice = { snake: snake, molt: molt, charge: !!(m.choice && m.choice.charge) };
    var X = { s: state, run: run, cfg: cfg, r: r };
    startGlade(X, 0);
    close(X);
    return { ok: true };
  }

  /** The ceiling of an improvement; a negative setting means there is none. */
  function upgradeMax(cfg, id) {
    var max = cfg['shop.' + id + '.max'];
    return max < 0 ? Infinity : max;
  }

  function upgradeCost(cfg, id, level) {
    return Math.round(cfg['shop.' + id + '.base'] * Math.pow(cfg['shop.growth'], level));
  }

  function buyUpgrade(state, cfg, id) {
    var m = meta(state);
    if (UPGRADES.indexOf(id) < 0) return { ok: false };
    if (state.run && alive(state.run)) return { ok: false };
    var level = m.shop[id] || 0;
    if (level >= upgradeMax(cfg, id)) return { ok: false, max: true };
    var price = upgradeCost(cfg, id, level);
    var have = num(m.scales);
    if (have < price) return { ok: false, need: price - have };
    m.scales = have - price;
    m.shop[id] = level + 1;
    return { ok: true, level: level + 1, price: price };
  }

  // ---- the engine's contract --------------------------------------------------------------------

  function init(ctx) {
    var state = { run: { phase: 'hub', fxN: 0, fx: [] }, layers: {}, meta: {} };
    meta(state);
    return state;
  }

  function tick(state, dt, ctx) {
    var run = state.run;
    if (!run || run.phase !== 'play' || run.paused || ctx.offline || !run.g) return;
    var cfg = ctx.config;
    if (ctx.mult) run.lm = ctx.mult;
    if (run.count > 0) { run.count = Math.max(0, run.count - dt); return; }
    var X = open(state, cfg);
    run.sec += dt;
    world(X, dt);
    if (run.phase === 'play') snakeTime(X, dt);
    close(X);
  }

  function snakeTime(X, dt) {
    var run = X.run;
    var cfg = X.cfg;
    if (run.dashT > 0) run.dashT = Math.max(0, run.dashT - dt);
    if (run.curl > 0) { run.curl = Math.max(0, run.curl - dt); return; }
    if (run.stun > 0) { run.stun = Math.max(0, run.stun - dt); return; }
    if (run.wait) {
      if (!run.q.length) return;
      run.wait = false;
      run.acc = period(run, cfg);
    } else {
      run.acc += dt;
    }
    var guard = 0;
    var g = run.g;
    while (run.phase === 'play' && run.g === g && guard < 4) {
      var p = period(run, cfg);
      if (run.acc < p) break;
      run.acc -= p;
      snakeStep(X);
      guard++;
      if (run.stun > 0 || run.wait || run.count > 0) { run.acc = 0; break; }
    }
    if (guard >= 4) run.acc = Math.min(run.acc, period(run, cfg));
  }

  /** Nothing goes on while the owner is away: the snake waits on its glade. */
  function offline(state, sec, ctx) { return { events: [] }; }

  function prestigeGain(state, layerId, cfg) {
    var m = meta(state);
    var run = state.run || {};
    if (!m.ascend || (run.phase !== 'hub' && run.phase !== 'over')) return Big.ZERO;
    if (moltTop(state) >= cfg['molt.max']) return Big.ZERO;
    return Big.of(1);
  }

  function bonus(state, layerId, amount, cfg) {
    return Big.add(1, Big.mul(Big.of(amount, 0), cfg['molt.bonus']));
  }

  function onPrestige(state, layerId, before, ctx) {
    var m = meta(state);
    m.ascend = false;
    m.choice.molt = moltTop(state);
  }

  function migrate(state, fromVer) { return state; }

  function validate(state) {
    var run = state.run;
    if (!run || typeof run.phase !== 'string') return 'нет фазы забега';
    if (PHASES.indexOf(run.phase) < 0) return 'неизвестная фаза забега: ' + run.phase;
    if (run.phase !== 'hub') {
      var g = run.g;
      if (!g || typeof g.grid !== 'string' || g.grid.length !== g.w * g.h) return 'поляна испорчена';
      if (!Array.isArray(run.body)) return 'змея испорчена';
      if (alive(run) && !run.body.length) return 'змея без головы';
      for (var i = 0; i < run.body.length; i++) {
        var c = run.body[i];
        if (typeof c !== 'number' || c % 1 !== 0 || c < 0 || c >= g.w * g.h) return 'звено змеи вне поля: ' + c;
      }
      if (typeof run.pend !== 'number' || run.pend < 0) return 'рост змеи меньше нуля';
      if (typeof run.seeds !== 'number' || run.seeds < 0) return 'зёрен меньше нуля';
    }
    if (num(meta(state).scales) < 0) return 'чешуек меньше нуля';
    return null;
  }

  function landTitle(id) {
    var list = need().lands;
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i].title;
    return id;
  }

  function summary(state, cfg) {
    var m = meta(state);
    var run = state.run || {};
    var parts = [];
    if (alive(run) && run.g) {
      parts.push(landTitle(run.g.land) + ', поляна ' + (run.g.n % 3 + 1));
      parts.push('длина ' + len(run));
    } else {
      var top = moltTop(state);
      if (top) parts.push('линька ' + top);
      parts.push('побед ' + m.rec.wins);
    }
    parts.push('чешуйки ' + num(m.scales));
    return { line: parts.join(' · ') };
  }

  /** The chest of «Пассажир»: a handful of scales. */
  function chest(state, rng, cfg) {
    var m = meta(state);
    var a = Math.min(cfg['chest.min'], cfg['chest.max']);
    var b = Math.max(cfg['chest.min'], cfg['chest.max']);
    var amount = a + Math.floor(rng.next() * (b - a + 1));
    m.scales = num(m.scales) + amount;
    return { title: 'Сундук с чешуйками', items: [{ title: 'Чешуйки', amount: amount }] };
  }

  // ---- the stock: glade layouts and abilities from bricks ---------------------------------------

  var WORDS = {
    glade: ['Поляна', 'Опушка', 'Прогалина', 'Лощина', 'Пустошь', 'Тропка'],
    of: ['валунов', 'ежей', 'кочек', 'камней', 'тишины', 'ветра'],
    ab: { speed: 'Лёгкий шаг', length: 'Жирок', phase: 'Сквозняк', bodyDamage: 'Колючки', magnet: 'Притяжение', seeds: 'Запасливость' },
    abText: {
      speed: 'Скорость {} такта', length: '+{} звеньев сразу', phase: 'Раз в {} тактов — сквозь своё тело',
      bodyDamage: 'Враг, коснувшийся тела, погибает', magnet: 'Плоды в {} клетках тянутся к голове', seeds: '+{} зёрен сразу'
    }
  };

  function procedural(kind, rng) {
    if (kind === 'glades') {
      var land = LANDS[Math.floor(rng.next() * 3)];
      var rows = [];
      var cells = [];
      for (var c = 0; c < STOCK_W * STOCK_H; c++) cells.push('.');
      var n = 6 + Math.floor(rng.next() * 10);
      for (var i = 0; i < n; i++) {
        var x = 1 + Math.floor(rng.next() * (STOCK_W - 2));
        var y = 1 + Math.floor(rng.next() * (STOCK_H - 8));
        cells[y * STOCK_W + x] = '#';
        if (rng.next() < 0.5 && x + 1 < STOCK_W - 1) cells[y * STOCK_W + x + 1] = '#';
      }
      if (land === 'bog') for (i = 0; i < 8; i++) { var q = Math.floor(rng.next() * STOCK_W * (STOCK_H - 6)); if (cells[q] === '.') cells[q] = '~'; }
      var hogs = 1 + Math.floor(rng.next() * 2);
      for (i = 0; i < hogs; i++) { var hq = Math.floor(rng.next() * STOCK_W * (STOCK_H - 6)); if (cells[hq] === '.') cells[hq] = 'h'; }
      for (y = 0; y < STOCK_H; y++) rows.push(cells.slice(y * STOCK_W, (y + 1) * STOCK_W).join(''));
      var item = { title: rng.pick(WORDS.glade) + ' ' + rng.pick(WORDS.of), land: land, rows: rows, procedural: true };
      if (validateStock('glades', item)) {
        // a closed pocket: a clear field is always valid
        item.rows = rows.map(function (row) { return row.replace(/[#h]/g, '.'); });
      }
      return item;
    }
    var names = Object.keys(BRICKS);
    var brick = names[Math.floor(rng.next() * names.length)];
    var range = BRICKS[brick];
    var value = range[0] + Math.floor(rng.next() * (range[1] - range[0] + 1));
    if (brick === 'speed' && value === 0) value = -1;
    var shown = brick === 'speed' ? (value > 0 ? '+' + value : String(value)) : String(value);
    return {
      title: WORDS.ab[brick] + ' ' + value, text: WORDS.abText[brick].replace('{}', shown),
      rarity: Math.abs(value) > (range[1] - range[0]) / 2 ? 'rare' : 'common', bricks: [{ brick: brick, value: value }], procedural: true
    };
  }

  function validateStock(kind, item) {
    if (!item) return 'пусто';
    if (kind === 'glades') {
      if (LANDS.indexOf(item.land) < 0) return 'неизвестное угодье: ' + item.land;
      var rows = item.rows;
      if (!Array.isArray(rows) || rows.length !== STOCK_H) return 'строк не ' + STOCK_H;
      for (var y = 0; y < rows.length; y++) {
        if (typeof rows[y] !== 'string' || rows[y].length !== STOCK_W) return 'строка ' + (y + 1) + ' не из ' + STOCK_W + ' знаков';
        for (var x = 0; x < STOCK_W; x++) if (SYMBOLS.indexOf(rows[y].charAt(x)) < 0) return 'чужой знак «' + rows[y].charAt(x) + '» в строке ' + (y + 1);
      }
      var g = { w: STOCK_W, h: STOCK_H, grid: rows.join('').replace(/~/g, '.') };
      var blocked = 0;
      for (var c = 0; c < g.grid.length; c++) if (blocks(g.grid.charAt(c))) blocked++;
      if (blocked > g.grid.length * 0.3) return 'слишком тесно: ' + blocked + ' занятых клеток';
      var start = (STOCK_H - 3) * STOCK_W + Math.floor(STOCK_W / 2);
      g.grid = g.grid.substring(0, start) + '.' + g.grid.substring(start + 1);
      if (!connected(g, start)) return 'есть закрытые карманы';
      return null;
    }
    if (kind === 'abilities') {
      if (!item.title || String(item.title).length > 24) return 'название';
      if (item.rarity && ['common', 'rare', 'legend'].indexOf(item.rarity) < 0) return 'редкость: ' + item.rarity;
      var bricks = item.bricks;
      if (!Array.isArray(bricks) || !bricks.length || bricks.length > 3) return 'кирпичиков нужно 1–3';
      for (var i = 0; i < bricks.length; i++) {
        var b = bricks[i];
        var range = b && BRICKS[b.brick];
        if (!range) return 'неизвестный кирпичик: ' + (b && b.brick);
        if (typeof b.value !== 'number' || b.value !== b.value || b.value < range[0] || b.value > range[1]) return 'значение ' + b.brick + ' вне ' + range[0] + '–' + range[1];
      }
      return null;
    }
    return null;
  }

  // ---- for the screen ---------------------------------------------------------------------------

  function hud(run, cfg) {
    var g = run.g;
    var polozGoal = g.boss === 'poloz' && g.b;
    return {
      eaten: polozGoal ? g.b.hits : g.eaten, goal: polozGoal ? g.b.need : goalOf(run, cfg), len: len(run),
      speed: speedOf(run, cfg), land: g.land, landNo: landNo(g.n), inLand: g.n % 3, boss: g.boss, n: g.n, seeds: run.seeds, open: g.exitOpen
    };
  }

  // ---- the bot (balance tests, checks) ----------------------------------------------------------
  // It goes to the nearest fruit by breadth-first search, around the body and the obstacles, and
  // reacts `delay` seconds late: it plans from where the head will be when its command lands.

  var BOT_PICKS = ['spine', 'armor', 'brow', 'reserve', 'ram', 'molt', 'ghost', 'short', 'tongue', 'magnet', 'full',
    'warm', 'herbs', 'slow', 'twin', 'venom', 'rattle', 'devour', 'shadow', 'ring', 'hunger', 'nose', 'grain', 'luck',
    'wrap', 'whip', 'sight', 'curl', 'dash', 'reverse'];

  function botRank(id) { var i = BOT_PICKS.indexOf(id); return i < 0 ? 50 : i; }

  function botPick(run) {
    var best = 0;
    for (var i = 1; i < run.pick.opts.length; i++) if (botRank(run.pick.opts[i]) < botRank(run.pick.opts[best])) best = i;
    return best;
  }

  /**
   * The bot's direction. `late` is how late a command lands (the reaction delay plus the frame it
   * waits for): the bot plans from where the head will be by then, keeps one step of margin from
   * its own tail and takes only turns that leave it a straight runway until its next command.
   */
  function botThink(run, cfg, delay, frame, info) {
    var g = run.g;
    if (!g || !run.body.length) return -1;
    var W = g.w * g.h;
    var wrap = !!run.ab.wrap;
    var holeAt = [];
    for (var h0 = 0; h0 < g.holes.length; h0++) holeAt[g.holes[h0]] = h0;
    // a step as the head makes it: through a hole it comes out of the other one
    function nxt(c, d) {
      var n = stepOf(g, c, d, wrap);
      if (n >= 0 && holeAt[n] !== undefined) n = g.holes[holeAt[n] ^ 1];
      return n;
    }
    // a command lands on the first frame after the delay, before that frame's step: count the
    // steps until then with the same sums the snake's clock does
    var frames = frame ? Math.ceil(delay / frame - 1e-6) : 0;
    var late = frame ? frames * frame : delay;
    var p = period(run, cfg);
    var still = run.count > 0 || run.wait || run.stun > 0 || run.curl > 0;
    var k = 0;
    if (!still && frame) {
      var acc = run.acc;
      for (var f = 0; f < frames; f++) {
        acc += frame;
        for (var s4 = 0; s4 < 4 && acc >= p; s4++) { acc -= p; k++; }
      }
    } else if (!still) {
      k = Math.floor((run.acc + delay) / p);
    }
    // steps straight on after the turn before the next command can land
    var risky = !!(info && info.risky);
    // the spec's bot: the nearest fruit by breadth-first search around the body, the stones and
    // the hedgehogs' needles; no foresight of moving enemies, no check of the room after eating
    var simple = !!(info && info.simple);
    var runway = risky ? 0 : Math.max(0, Math.ceil((late + (frame || 0)) / p - 1e-6) - 1);
    var margin = risky ? 0 : 1;
    var head = run.body[0];
    var dir = run.dir;
    var qq = run.q.slice();
    var path = [];
    for (var i = 0; i < k; i++) {
      if (qq.length) { var qd = qq.shift(); dir = qd === REV ? revDir(run, dir) : qd; }
      var n0 = nxt(head, dir);
      if (n0 < 0 || blocks(at(g, n0))) break;
      head = n0;
      path.push(n0);
    }
    if (qq.length && qq[0] !== REV) dir = qq[0];
    var L = run.body.length;
    var pend = run.pend;
    var free = [];
    for (i = 0; i < W; i++) free[i] = 0;
    var glass = run.snake === 'glass';
    if (!glass) {
      for (i = 0; i < L; i++) { var left = L - i + pend - path.length + margin; if (left > free[run.body[i]]) free[run.body[i]] = left; }
      for (i = 0; i < path.length; i++) free[path[i]] = Math.max(free[path[i]], L + pend - (path.length - 1 - i));
    }
    var hard = [];
    for (i = 0; i < W; i++) hard[i] = blocks(at(g, i)) ? 1 : 0;
    if (g.rival && !g.rival.dead) g.rival.body.forEach(function (c) { hard[c] = 1; });
    if (g.boss === 'poloz' && g.b && !g.b.dead) g.b.body.forEach(function (c) { hard[c] = 1; });
    var danger = [];
    for (i = 0; i < W; i++) danger[i] = 0;
    var mark = function (c, R, square) {
      for (var dy = -R; dy <= R; dy++) for (var dx = -R; dx <= R; dx++) {
        var x = cx(g, c) + dx;
        var y = cy(g, c) + dy;
        if (x >= 0 && y >= 0 && x < g.w && y < g.h && (square || Math.abs(dx) + Math.abs(dy) <= R)) danger[y * g.w + x] = 1;
      }
    };
    for (i = 0; i < W; i++) if (at(g, i) === 'h') mark(i, 1, false);
    if (g.hawk && !simple) mark(g.hawk.c, 1, true);
    if (!simple) g.rocks.forEach(function (m) { danger[m.c] = 1; });
    if (g.rival && !g.rival.dead && !simple) mark(g.rival.body[0], 1, false);
    if (g.boss === 'poloz' && g.b && !g.b.dead && !simple) mark(g.b.body[0], 2, false);
    if (g.boss === 'stone' && g.b && !g.exitOpen && !simple) for (i = 0; i < W; i++) if (edgeDist(g, i) <= g.b.ring) danger[i] = 1;
    var curio = false;
    g.food.forEach(function (f) { if (f.k === 'c') curio = true; });
    // 1 — what the bot goes for first (the exit, a curio), 2 — the rest of the food
    var target = [];
    if (g.exitOpen) target[g.exit] = 1;
    else g.food.forEach(function (f) { target[f.c] = f.k === 'c' || !curio ? 1 : 2; });
    // the way back is where the neck will be
    var back = path.length ? dirTo(g, head, path.length > 1 ? path[path.length - 2] : run.body[0]) : (qq.length ? (dir + 2) % 4 : neckDir(run));
    var canBack = back < 0;
    // a turn is safe when the cells straight on are free until the next command can land
    var straight = [];
    var endAt = [];
    var endDepth = [];
    for (var sd = 0; sd < 4; sd++) {
      var at0 = nxt(head, sd);
      var ok = at0 >= 0 && !hard[at0] && free[at0] <= 1;
      var j0 = 1;
      for (; ok && j0 <= runway && !target[at0]; j0++) {
        var nx = nxt(at0, sd);
        if (nx < 0 || hard[nx] || free[nx] > j0 + 1) ok = false; else at0 = nx;
      }
      straight[sd] = ok;
      endAt[sd] = ok ? at0 : -1;
      endDepth[sd] = j0;
    }
    // breadth-first from the end of each possible runway; {d, cell, par, dist} or null
    function search(avoid, tmap) {
      var dist = [];
      var first = [];
      var par = [];
      var list = [];
      dist[head] = 0;
      for (var e0 = 0; e0 < 4; e0++) {
        if ((e0 === back && !canBack) || !straight[e0]) continue;
        var bad = false;
        for (var w1 = nxt(head, e0); w1 >= 0 && w1 !== endAt[e0]; w1 = nxt(w1, e0)) {
          if (avoid && danger[w1]) bad = true;
          if (dist[w1] === undefined) dist[w1] = 0;
        }
        var end = endAt[e0];
        if (bad || (dist[end] !== undefined && dist[end] > 0)) continue;
        if (avoid && danger[end] && !tmap[end]) continue;
        dist[end] = endDepth[e0];
        first[end] = e0;
        par[end] = -1;
        list.push(end);
      }
      var second = -1;
      for (var j = 0; j < list.length; j++) {
        var c = list[j];
        var dd = dist[c];
        if (tmap[c] === 1) return { d: first[c], cell: c, par: par, dist: dist };
        if (tmap[c] === 2 && second < 0) second = c;
        for (var e = 0; e < 4; e++) {
          var n = nxt(c, e);
          if (n < 0 || dist[n] !== undefined || hard[n]) continue;
          if (free[n] > dd + 1 && !tmap[n]) continue;
          if (free[n] > dd + 1 && tmap[n] && free[n] > dd + 1 + margin) continue;
          if (avoid && danger[n] && !tmap[n]) continue;
          dist[n] = dd + 1;
          first[n] = first[c];
          par[n] = c;
          list.push(n);
        }
      }
      return second >= 0 ? { d: first[second], cell: second, par: par, dist: dist } : null;
    }
    // after eating at the end of the way, is there still room (or a way along its own body)?
    function safeAfter(res) {
      var seq = [];
      for (var c = res.cell; c >= 0; c = res.par[c]) seq.push(c);
      var e0 = res.d;
      var run0 = [];
      for (var w2 = nxt(head, e0); w2 >= 0 && w2 !== seq[seq.length - 1]; w2 = nxt(w2, e0)) run0.push(w2);
      var vb = seq.concat(run0.reverse(), [head], path.slice(0, Math.max(0, path.length - 1)).reverse(), run.body);
      var VL = Math.min(vb.length, L + pend + 1);
      vb = vb.slice(0, VL);
      if (glass) return true;
      var vfree = [];
      for (var i2 = 0; i2 < VL; i2++) if (vfree[vb[i2]] === undefined) vfree[vb[i2]] = VL - i2;
      var start = vb[0];
      var need1 = Math.min(VL, 40);
      var depth = [];
      depth[start] = 0;
      var list = [start];
      for (var j = 0; j < list.length; j++) {
        if (list.length > need1) return true;
        var dj = depth[list[j]];
        for (var e = 0; e < 4; e++) {
          var q = nxt(list[j], e);
          if (q < 0 || depth[q] !== undefined || hard[q]) continue;
          if (vfree[q] !== undefined && vfree[q] > dj + 1) continue;
          if (vfree[q] !== undefined && q !== start) return true;
          depth[q] = dj + 1;
          list.push(q);
        }
      }
      return list.length > need1;
    }
    // the room the snake has after the move and its runway straight on
    function area(d) {
      var n = endAt[d];
      if (n === undefined || n < 0) {
        n = nxt(head, d);
        if (n < 0 || hard[n] || free[n] > 1) return -1;
        endDepth[d] = 1;
      }
      if (target[n] === 1 && g.exitOpen) return 1000;
      var cap = L + pend + 8;
      var depth = [];
      depth[head] = 0;
      for (var w0 = nxt(head, d); w0 >= 0 && w0 !== n && depth[w0] === undefined; w0 = nxt(w0, d)) depth[w0] = 0;
      depth[n] = endDepth[d];
      var list = [n];
      for (var j = 0; j < list.length && list.length < cap; j++) {
        var dj = depth[list[j]];
        for (var e = 0; e < 4; e++) {
          var q = nxt(list[j], e);
          if (q < 0 || depth[q] !== undefined || hard[q] || free[q] > dj + 1) continue;
          depth[q] = dj + 1;
          list.push(q);
        }
      }
      return list.length - (danger[n] ? 0.5 : 0);
    }
    var need0 = Math.min(L + pend, 40);
    // the nearest target it can eat and still get out; an unsafe one is struck off and the next tried
    var res = null;
    var firstRes = null;
    var tm = target.slice();
    for (var tries = 0; tries < 4; tries++) {
      res = search(true, tm) || search(false, tm);
      if (!res) break;
      if (!firstRes) firstRes = res;
      if (simple || g.exitOpen || safeAfter(res)) break;
      tm[res.cell] = 0;
      res = null;
    }
    if (info) { info.k = k; info.runway = runway; info.want = res ? res.d : -1; info.need = need0; info.straight = straight; info.head = head; info.dir = dir; }
    if (res) return res.d;
    res = firstRes;
    // not safe to eat yet: follow its own tail, it always leaves the way open
    if (L > 1 && !glass && !simple) {
      var tmap = [];
      tmap[run.body[L - 1]] = 1;
      var tail = search(true, tmap) || search(false, tmap);
      if (tail && area(tail.d) >= Math.min(need0, 12)) return tail.d;
    }
    var bestD = res ? res.d : -1;
    var bestA = res ? area(res.d) : -1e9;
    for (var d = 0; d < 4; d++) {
      if (d === back && !canBack) continue;
      var a = area(d) - (straight[d] ? 0 : 1000);
      if (a > bestA) { bestA = a; bestD = d; }
    }
    if (bestD >= 0 && area(bestD) > 0) return bestD;
    // shut in: bite where it costs least (nearest the tail), else wait for the way to clear
    var bite = -1;
    var biteAt = -1;
    for (d = 0; d < 4; d++) {
      var n2 = nxt(head, d);
      var bi = n2 >= 0 ? run.body.indexOf(n2) : -1;
      if (bi > 1 && bi > biteAt && !hard[n2]) { biteAt = bi; bite = d; }
    }
    return bite;
  }

  function botShop(state, cfg) {
    var run = state.run;
    var bought = true;
    while (bought) {
      bought = false;
      var best = -1;
      for (var i = 0; i < run.shop.items.length; i++) {
        var it = run.shop.items[i];
        if (it.sold || it.price > run.seeds) continue;
        if (it.kind === 'ab' && (best < 0 || run.shop.items[best].kind !== 'ab' || botRank(it.id) < botRank(run.shop.items[best].id))) best = i;
        if (it.kind === 'snack' && best < 0 && len(run) < 12) best = i;
      }
      if (best >= 0) bought = shopBuy(state, cfg, best).ok;
    }
  }

  /**
   * Plays the current run to its end with the bot: {won, glades, sec, gladeSec: [..], scales, len}.
   * o: {delay, dt, mult, maxSec, maxGladeSec, endless, skill: 'smart' | 'simple'}.
   */
  function botPlay(state, cfg, o) {
    o = o || {};
    var dt = o.dt || 1 / 30;
    var delay = o.delay === undefined ? 0.15 : o.delay;
    var ctx = { now: 0, config: cfg, mult: o.mult || 1, offline: false };
    var t = 0;
    var pending = [];
    var lastSteps = -1;
    var lastGlade = -1;
    var gladeStart = 0;
    var gladeSec = [];
    var maxSec = o.maxSec || 3600;
    var maxGlade = o.maxGladeSec || 240;
    var timeout = false;
    var progT = 0;
    var lastProgress = -1;
    var waitT = 0;
    while (state.run.phase !== 'over' && t < maxSec) {
      var run = state.run;
      if (run.phase === 'pick') { choose(state, cfg, botPick(run)); continue; }
      if (run.phase === 'shop') { botShop(state, cfg); shopLeave(state, cfg); pending = []; continue; }
      if (run.glade !== lastGlade) {
        if (lastGlade >= 0) gladeSec.push(t - gladeStart);
        lastGlade = run.glade;
        gladeStart = t;
        lastSteps = -1;
        pending = [];
        progT = t;
      }
      // no fruit for a while (chasing its own tail): the bot takes risks to break out
      var progress = run.g.eaten + (run.g.b && run.g.b.hits ? run.g.b.hits : 0) + (run.g.exitOpen ? 1000 : 0);
      if (progress !== lastProgress) { lastProgress = progress; progT = t; }
      if (t - gladeStart > maxGlade) { timeout = true; quit(state, cfg); break; }
      var delivered = false;
      while (pending.length && pending[0].at <= t) { turn(state, cfg, pending.shift().d); delivered = true; }
      if (!pending.length && (run.steps !== lastSteps || run.wait || delivered)) {
        lastSteps = run.steps;
        var d = botThink(run, cfg, delay, dt, { risky: t - progT > 12, simple: o.skill === 'simple' });
        // shut in for long: any way but back
        if (d < 0 && run.wait && t - waitT > 2) d = (neckDir(run) + 1 + Math.floor(t * 7) % 3) % 4;
        if (d >= 0 && (d !== lastDir(run) || run.wait)) pending.push({ at: t + delay, d: d });
      }
      if (!run.wait) waitT = t;
      tick(state, dt, ctx);
      t += dt;
      if (o.onTick) o.onTick(state, t);
      if (state.run.phase === 'over' && o.endless && state.run.won && state.run.result && state.run.result.reason === 'win') {
        gladeSec.push(t - gladeStart);
        lastGlade = -1;
        continueEndless(state, cfg);
      }
    }
    if (state.run.phase !== 'over') { timeout = true; quit(state, cfg); }
    var res = state.run.result || {};
    if (lastGlade >= 0 && res.reason === 'win') gladeSec.push(t - gladeStart);
    return {
      won: !!state.run.won, glades: res.glades || 0, sec: t, gladeSec: gladeSec, scales: res.scales || 0,
      len: res.len || 0, reason: res.reason, timeout: timeout, abilities: Object.keys(state.run.ab).length
    };
  }

  /** A new run and the bot plays it (o as in newRun plus botPlay's). */
  function botRun(state, cfg, o) {
    newRun(state, cfg, o);
    return botPlay(state, cfg, o);
  }

  return {
    // the engine's contract
    init: init, tick: tick, offline: offline, prestigeGain: prestigeGain, bonus: bonus, onPrestige: onPrestige,
    migrate: migrate, validate: validate, summary: summary, chest: chest, procedural: procedural, validateStock: validateStock,
    // content and actions of the screen
    setContent: setContent, newRun: newRun, turn: turn, turnRel: turnRel, pause: pause, resume: resume, dash: dash, curl: curl,
    choose: choose, reroll: reroll, shopBuy: shopBuy, shopRoll: shopRoll, shopRollCost: shopRollCost, shopLeave: shopLeave,
    continueEndless: continueEndless, quit: quit, toHub: toHub, buyUpgrade: buyUpgrade, upgradeCost: upgradeCost, upgradeMax: upgradeMax,
    // reading
    hud: hud, speed: speedOf, period: period, length: len, earned: earned, moltTop: moltTop, scales: scalesOf, meta: meta,
    rules: rulesOf, ability: abilityOf, enemiesOf: enemiesOf, landTitle: landTitle, lastDir: lastDir, makeGlade: makeGlade,
    // the bot
    botThink: botThink, botPlay: botPlay, botRun: botRun, botPick: botPick,
    LAYER: LAYER, REV: REV, DX: DX, DY: DY, LANDS: LANDS, BOSSES: BOSSES, SNAKES: SNAKES, UPGRADES: UPGRADES,
    BRICKS: BRICKS, CONTENT_FILES: CONTENT_FILES, STOCK_W: STOCK_W, STOCK_H: STOCK_H
  };
});
