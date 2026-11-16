// The logic of «Конвейеры» for «Игротека»: the engine's functions (init, tick, offline, prestige …)
// and the economy around the factory of factory.js — money, research, orders, events, the planets.
// Shared subset of JavaScript: on the screen (window.GameSim, the data comes by GameSim.useData),
// in the engine (Rhino) and in node (require). Every number is a setting of config.json (cfg).
(function (root, make) {
  var node = typeof require === 'function' && typeof exports !== 'undefined';
  var api = node
    ? make(require('../engine/big.js'), require('../engine/fmt.js'), require('./factory.js'), require('./content/planets.json'))
    : make(root.Big, root.Fmt, root.ConveyorFactory, root.ConveyorData || null);
  if (typeof exports !== 'undefined') { for (var k in api) exports[k] = api[k]; } else { root.GameSim = api; }
})(this, function (Big, Fmt, F, DATA) {
  'use strict';

  var LAYER = 'planet';
  var MIN = 60000;
  var ORDER = ['rusty', 'icy', 'volcanic', 'dusty', 'ring'];
  var COSTS = ['drill', 'belt', 'tunnel', 'furnace', 'assembler', 'splitter', 'sorter', 'storage', 'port'];
  var SPEEDS = ['belts', 'drills', 'furnaces', 'assembly'];
  var ENDLESS = ['drills', 'furnaces', 'assembly', 'trade', 'storage'];

  /** The screen gives the content (content/planets.json) before the game starts. */
  function useData(data) { DATA = data; }

  function data() {
    if (!DATA) throw new Error('нет content/planets.json');
    return DATA;
  }

  // ---- the world: the planet, its items and its recipes -----------------------------------------

  function planetDef(state, id) {
    var list = data().planets;
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    var custom = (state && state.meta && state.meta.custom) || [];
    for (var j = 0; j < custom.length; j++) if (custom[j].id === id) return custom[j];
    return list[0];
  }

  function itemsOf(state) {
    var custom = (state && state.meta && state.meta.custom) || [];
    if (!custom.length) return data().items;
    var out = {};
    var base = data().items;
    for (var k in base) out[k] = base[k];
    custom.forEach(function (p) { for (var id in p.items || {}) out[id] = p.items[id]; });
    return out;
  }

  function level(run, id) { return (run.res && run.res[id]) || 0; }

  var worldCache = { key: '', value: null };

  /** {planet, items, recipe: {id: r}, byAt: {furnace: [r], assembler: [r]}, open: {id: true}, list: [items of the planet]}. */
  function world(state) {
    var run = state.run;
    var key = run.planet + '|' + level(run, 'advanced') + level(run, 'top') + level(run, 'alloy') + '|' + ((state.meta && state.meta.custom) || []).length;
    if (worldCache.key === key && worldCache.data === DATA) return worldCache.value;
    var p = planetDef(state, run.planet);
    var w = { planet: p, items: itemsOf(state), recipe: {}, byAt: { furnace: [], assembler: [] }, open: {}, list: [] };
    var seen = {};
    function note(id) {
      if (!seen[id]) {
        seen[id] = true;
        w.list.push(id);
      }
    }
    (p.resources || []).forEach(note);
    (p.imports || []).forEach(function (imp) { note(imp.res); });
    (p.recipes || []).forEach(function (r) {
      w.recipe[r.id] = r;
      (w.byAt[r.at] = w.byAt[r.at] || []).push(r);
      w.open[r.id] = !r.lock || level(run, r.lock) > 0;
      for (var i in r.in) note(i);
      note(r.out);
    });
    worldCache = { key: key, value: w, data: DATA };
    return w;
  }

  // ---- numbers ----------------------------------------------------------------------------------

  function credits(state) {
    var l = state.layers && state.layers[LAYER];
    if (!l) return 0;
    return Big.toNumber(Big.of(l.currency, 0)) + ((l.state && l.state.spent) || 0);
  }

  function creditMul(state, cfg) { return 1 + cfg['credit.bonus'] * credits(state); }

  function rushOn(run, now) { return run.rushUntil > now; }

  /** Speeds before the rush: belts cells/s, drills ore/s, furnaces and assemblers ×. */
  function speeds(state, cfg) {
    var run = state.run;
    var cm = creditMul(state, cfg);
    return {
      belt: cfg['belt.speed'] * (1 + cfg['research.belts.step'] * level(run, 'belts')) * cm,
      drill: cfg['drill.rate'] * (1 + cfg['research.drills.step'] * level(run, 'drills')) * cm,
      furnace: cfg['furnace.speed'] * (1 + cfg['research.furnaces.step'] * level(run, 'furnaces')) * cm,
      assembler: cfg['assembler.speed'] * (1 + cfg['research.assembly.step'] * level(run, 'assembly')) * cm,
      dock: cfg['dock.rate'] * cm
    };
  }

  function priceMul(run, cfg) { return 1 + cfg['research.trade.step'] * level(run, 'trade'); }

  function tunnelRange(run, cfg) { return level(run, 'longTunnel') ? cfg['tunnel.rangeLong'] : cfg['tunnel.range']; }

  function cargoList(p) {
    var out = [];
    (p.cargo || []).forEach(function (c) { for (var i = 0; i < c[1]; i++) out.push(c[0]); });
    return out;
  }

  /** The environment of a step of the factory (factory.js). */
  function env(state, ctx, w, sell) {
    var run = state.run;
    var cfg = ctx.config;
    var s = speeds(state, cfg);
    var rush = rushOn(run, ctx.now) ? cfg['rush.mult'] : 1;
    return {
      world: w, belt: s.belt * rush, drill: s.drill * rush, furnace: s.furnace * rush, assembler: s.assembler * rush, dock: s.dock,
      rush: rush, inCap: cfg['crafter.inCap'], outCap: cfg['crafter.outCap'],
      storageCap: cfg['storage.cap'] + cfg['storage.step'] * level(run, 'storage'),
      tunnelRange: tunnelRange(run, cfg), deep: level(run, 'deep') > 0, sidePort: level(run, 'sidePort') > 0,
      double: cfg['research.double.step'] * level(run, 'double'),
      depleteAt: cfg['ore.amount'], slow: cfg['ore.slow'],
      outage: !!(run.ev && run.ev.id === 'outage' && run.ev.until > ctx.now),
      storm: !!(w.planet.storm && run.storm && run.storm.until > ctx.now), stormEdge: cfg['storm.edge'],
      melt: cfg['ice.meltSec'], lava: cfg['lava.speed'], cargo: cargoList(w.planet),
      rng: ctx.rng, sell: sell
    };
  }

  // ---- money --------------------------------------------------------------------------------------

  function addMoney(run, amount) {
    run.money = Big.add(run.money, amount);
    run.earned = Big.add(run.earned, amount);
  }

  function pay(run, amount) {
    if (Big.lt(run.money, amount)) return false;
    run.money = Big.sub(run.money, amount);
    return true;
  }

  function emptyWindow(cfg) {
    var n = Math.max(1, Math.round(cfg['window.sec'] / cfg['window.bucket']));
    var b = [];
    var it = [];
    for (var i = 0; i < n; i++) {
      b.push(0);
      it.push({});
    }
    return { b: b, it: it, i: 0, s: 0, n: 0 };
  }

  function windowAdd(run, amount, item) {
    var w = run.win;
    w.b[w.i] += amount;
    w.it[w.i][item] = (w.it[w.i][item] || 0) + 1;
  }

  function windowAdvance(run, dt, cfg) {
    var w = run.win;
    var bucket = cfg['window.bucket'];
    w.s += dt;
    w.n = Math.min(w.n + dt, w.b.length * bucket);
    var guard = 0;
    while (w.s >= bucket && guard++ < w.b.length) {
      w.s -= bucket;
      w.i = (w.i + 1) % w.b.length;
      w.b[w.i] = 0;
      w.it[w.i] = {};
    }
    if (w.s >= bucket) w.s = 0;
  }

  function covered(run, cfg) {
    var w = run.win;
    return Math.min(w.n, (w.b.length - 1) * cfg['window.bucket'] + w.s);
  }

  /** Port income a second over the sliding window (before the trip's multiplier). */
  function windowRate(run, cfg) {
    var w = run.win;
    var t = covered(run, cfg);
    if (!(t > 0)) return 0;
    var sum = 0;
    for (var i = 0; i < w.b.length; i++) sum += w.b[i];
    return sum / t;
  }

  /** Items a second over the window: {item: rate}. */
  function windowItems(run, cfg) {
    var w = run.win;
    var t = covered(run, cfg);
    var out = {};
    if (!(t > 0)) return out;
    w.it.forEach(function (m) { for (var k in m) out[k] = (out[k] || 0) + m[k]; });
    for (var k in out) out[k] /= t;
    return out;
  }

  // ---- a new planet ------------------------------------------------------------------------------

  function newRun(state, planetId, rng, cfg, now) {
    var meta = (state && state.meta) || {};
    var p = planetDef(state, planetId);
    var run = {
      planet: p.id, w: cfg['plot.w'], h: cfg['plot.h'], lv: 1, b: [], ore: [],
      money: Big.str(Big.of(cfg['start.money'])), earned: '0e0', res: {}, sold: {}, soldN: 0, goalSold: 0, made: 0,
      orders: [], orderAt: [], ordersDone: 0, ev: null, evAt: now + cfg['event.firstMin'] * MIN,
      storm: { at: now + cfg['storm.everyMin'] * MIN, until: 0 }, rushUntil: 0, free: 0, win: emptyWindow(cfg),
      calm: 0, courierAt: now + cfg['courier.everySec'] * 1000, undo: [], news: [], newsN: 0, started: now
    };
    for (var o = 0; o < cfg['order.cards']; o++) run.orderAt.push(now + (cfg['order.firstMin'] + o * 2) * MIN);
    var region = { x0: 0, y0: 0, x1: run.w, y1: run.h };
    (p.patches || []).forEach(function (pt) {
      for (var k = 0; k < pt[1]; k++) F.patch(run, rng, pt[0], rng.int(cfg['patch.min'], cfg['patch.max']), region);
    });
    var visited = meta.visited || [];
    (p.imports || []).forEach(function (imp) {
      if (visited.indexOf(imp.after) >= 0) F.patch(run, rng, imp.res, cfg['patch.min'], region);
    });
    var docks = p.docks || 0;
    for (var d = 0; d < docks; d++) {
      var dock = F.make('dock', 0, Math.floor(run.h * (d + 1) / (docks + 1)), 0);
      dock.k = d * 3;
      run.b.push(dock);
    }
    return run;
  }

  /** «Межевание»: the plot grows by a strip to the right and below, with new patches. */
  function grow(state, rng, cfg) {
    var run = state.run;
    var p = planetDef(state, run.planet);
    var ow = run.w;
    var oh = run.h;
    run.w = Math.min(cfg['plot.wMax'], run.w + cfg['plot.stripW']);
    run.h = Math.min(cfg['plot.hMax'], run.h + cfg['plot.stripH']);
    var regions = [];
    if (run.w > ow) regions.push({ x0: ow, y0: 0, x1: run.w, y1: run.h });
    if (run.h > oh) regions.push({ x0: 0, y0: oh, x1: ow, y1: run.h });
    var grows = p.grow || [];
    var lvl = level(run, 'land');
    for (var i = 0; i < cfg['patch.perStrip'] && grows.length && regions.length; i++) {
      F.patch(run, rng, grows[(lvl * 2 + i) % grows.length], rng.int(cfg['patch.min'], cfg['patch.max']), regions[i % regions.length]);
    }
    if (p.docks && run.h > oh) run.b.push(F.make('dock', 0, oh + 1, 0));
    run.lv++;
  }

  // ---- building ----------------------------------------------------------------------------------

  function costOf(cfg, t) { return cfg['cost.' + t] || 0; }

  function remember(run, cfg, action) {
    run.undo.push(action);
    while (run.undo.length > cfg['undo.max']) run.undo.shift();
  }

  function news(run, text) {
    run.newsN = (run.newsN || 0) + 1;
    run.news.push({ n: run.newsN, text: text });
    if (run.news.length > 6) run.news.shift();
  }

  /** Why a building of type t cannot stand at x, y (null when it can). */
  function cannot(state, t, x, y) {
    var run = state.run;
    if (COSTS.indexOf(t) < 0) return 'нет такого здания';
    if (x < 0 || y < 0 || x >= run.w || y >= run.h) return 'за краем участка';
    if (F.findAt(run, x, y)) return 'клетка занята';
    if (t === 'drill' && !F.oreAt(run, x, y)) return 'бур ставится на пятно руды';
    return null;
  }

  /** Places one building (a free one from a chest first, then money). {ok, reason}. */
  function build(state, t, x, y, d, cfg) {
    var run = state.run;
    var why = cannot(state, t, x, y);
    if (why) return { ok: false, reason: why };
    var cost = costOf(cfg, t);
    var free = run.free > 0;
    if (!free && !pay(run, cost)) return { ok: false, reason: 'не хватает денег' };
    if (free) run.free--;
    run.b.push(F.make(t, x, y, d));
    run.lv++;
    remember(run, cfg, { k: 'add', cells: [[x, y]], cost: free ? 0 : cost, free: free ? 1 : 0 });
    return { ok: true, free: free };
  }

  /** A belt line as the letter Г: belts on empty cells, existing belts turned. {ok, placed, reason}. */
  function buildLine(state, x0, y0, x1, y1, vertical, cfg, d0) {
    var run = state.run;
    var cells = F.line(x0, y0, x1, y1, vertical, d0);
    var add = [];
    var turn = [];
    cells.forEach(function (c) {
      if (c.x < 0 || c.y < 0 || c.x >= run.w || c.y >= run.h) return;
      var b = F.findAt(run, c.x, c.y);
      if (!b) add.push(c);
      else if (b.t === 'belt' && b.d !== c.d) turn.push([b, c.d]);
    });
    var cost = add.length * costOf(cfg, 'belt');
    if (!add.length && !turn.length) return { ok: false, reason: 'нечего ставить', placed: 0 };
    if (!pay(run, cost)) return { ok: false, reason: 'не хватает денег: нужно ' + cost, placed: 0 };
    add.forEach(function (c) { run.b.push(F.make('belt', c.x, c.y, c.d)); });
    var turned = turn.map(function (t) {
      var old = t[0].d;
      t[0].d = t[1];
      return [t[0].x, t[0].y, old];
    });
    run.lv++;
    remember(run, cfg, { k: 'line', cells: add.map(function (c) { return [c.x, c.y]; }), turned: turned, cost: cost });
    return { ok: true, placed: add.length, turned: turned.length, cost: cost };
  }

  /** One belt of a drawn line (the research «Автостройка»): the previous one turns to it. */
  function drawBelt(state, fromX, fromY, x, y, cfg) {
    var run = state.run;
    var d = F.dirOf(x - fromX, y - fromY);
    var prev = F.findAt(run, fromX, fromY);
    if (prev && prev.t === 'belt' && Math.abs(x - fromX) + Math.abs(y - fromY) === 1) prev.d = d;
    var b = F.findAt(run, x, y);
    if (b) {
      run.lv++;
      return { ok: b.t === 'belt', reason: 'клетка занята' };
    }
    if (x < 0 || y < 0 || x >= run.w || y >= run.h) return { ok: false, reason: 'за краем участка' };
    if (!pay(run, costOf(cfg, 'belt'))) return { ok: false, reason: 'не хватает денег' };
    run.b.push(F.make('belt', x, y, d));
    run.lv++;
    remember(run, cfg, { k: 'add', cells: [[x, y]], cost: costOf(cfg, 'belt'), free: 0 });
    return { ok: true };
  }

  function removeAt(run, x, y) {
    for (var i = 0; i < run.b.length; i++) {
      if (run.b[i].x === x && run.b[i].y === y) {
        var b = run.b[i];
        run.b.splice(i, 1);
        run.lv++;
        return b;
      }
    }
    return null;
  }

  /** Takes a building down; the money comes back (cfg refund.share). Docks stay. */
  function demolish(state, x, y, cfg) {
    var run = state.run;
    var b = F.findAt(run, x, y);
    if (!b) return { ok: false, reason: 'пусто' };
    if (b.t === 'dock') return { ok: false, reason: 'док не снести' };
    removeAt(run, x, y);
    var back = Math.floor(costOf(cfg, b.t) * cfg['refund.share']);
    run.money = Big.add(run.money, back);
    remember(run, cfg, { k: 'del', items: [F.bare(b)], refund: back });
    return { ok: true, refund: back };
  }

  function rotate(state, x, y, cfg) {
    var run = state.run;
    var b = F.findAt(run, x, y);
    if (!b || b.t === 'dock') return false;
    remember(run, cfg, { k: 'rot', x: x, y: y, d: b.d });
    b.d = (b.d + 1) % 4;
    run.lv++;
    return true;
  }

  function setRecipe(state, x, y, rid, cfg) {
    var run = state.run;
    var b = F.findAt(run, x, y);
    var w = world(state);
    if (!b || (b.t !== 'furnace' && b.t !== 'assembler')) return false;
    if (rid && (!w.recipe[rid] || w.recipe[rid].at !== b.t)) return false;
    remember(run, cfg, { k: 'set', x: x, y: y, f: 'r', v: b.r });
    b.r = rid || '';
    b.s = {};
    b.w = 0;
    b.c = 0;
    return true;
  }

  function setFilter(state, x, y, item, cfg) {
    var run = state.run;
    var b = F.findAt(run, x, y);
    if (!b || b.t !== 'sorter') return false;
    remember(run, cfg, { k: 'set', x: x, y: y, f: 'f', v: b.f });
    b.f = item || '';
    return true;
  }

  /** Undoes the last action (20 kept). {ok, text}. */
  function undo(state, cfg) {
    var run = state.run;
    var a = run.undo.pop();
    if (!a) return { ok: false, text: 'Отменять нечего' };
    if (a.k === 'add' || a.k === 'line') {
      a.cells.forEach(function (c) { removeAt(run, c[0], c[1]); });
      (a.turned || []).forEach(function (t) {
        var b = F.findAt(run, t[0], t[1]);
        if (b) b.d = t[2];
      });
      run.money = Big.add(run.money, a.cost || 0);
      run.free += a.free || 0;
    } else if (a.k === 'del') {
      if (Big.lt(run.money, a.refund || 0)) {
        run.undo.push(a);
        return { ok: false, text: 'Не хватает денег вернуть здание' };
      }
      run.money = Big.sub(run.money, a.refund || 0);
      a.items.forEach(function (b) { if (!F.findAt(run, b.x, b.y)) run.b.push(F.make(b.t, b.x, b.y, b.d)); });
      a.items.forEach(function (b) {
        var n = F.findAt(run, b.x, b.y);
        if (n && b.r) n.r = b.r;
        if (n && b.f) n.f = b.f;
      });
    } else if (a.k === 'rot') {
      var r = F.findAt(run, a.x, a.y);
      if (r) r.d = a.d;
    } else if (a.k === 'set') {
      var s = F.findAt(run, a.x, a.y);
      if (s) {
        s[a.f] = a.v || '';
        if (a.f === 'r') {
          s.s = {};
          s.w = 0;
        }
      }
    }
    run.lv++;
    return { ok: true, text: 'Отменено' };
  }

  // ---- blueprints («Чертежи») ---------------------------------------------------------------------

  function saveBlueprint(state, x0, y0, x1, y1, cfg) {
    var run = state.run;
    if (!level(run, 'blueprints')) return { ok: false, reason: 'нужно исследование «Чертежи»' };
    var ax = Math.min(x0, x1);
    var ay = Math.min(y0, y1);
    var bx = Math.max(x0, x1);
    var by = Math.max(y0, y1);
    var cells = [];
    run.b.forEach(function (b) {
      if (b.t === 'dock' || b.x < ax || b.x > bx || b.y < ay || b.y > by) return;
      var c = [b.x - ax, b.y - ay, b.t, b.d];
      if (b.r || b.f) c.push(b.r || '', b.f || '');
      cells.push(c);
    });
    if (!cells.length) return { ok: false, reason: 'в рамке нет зданий' };
    if (cells.length > cfg['blueprint.maxCells']) return { ok: false, reason: 'больше ' + cfg['blueprint.maxCells'] + ' зданий' };
    var meta = state.meta;
    meta.bp = meta.bp || [];
    meta.bpN = (meta.bpN || 0) + 1;
    var bp = { name: 'Чертёж ' + meta.bpN, w: bx - ax + 1, h: by - ay + 1, cells: cells };
    meta.bp.push(bp);
    while (meta.bp.length > cfg['blueprint.max']) meta.bp.shift();
    return { ok: true, bp: bp };
  }

  /** Whether a blueprint works on this planet: every recipe and filter item is here. */
  function blueprintFits(state, bp) {
    var w = world(state);
    for (var i = 0; i < bp.cells.length; i++) {
      var c = bp.cells[i];
      if (c[4] && !w.recipe[c[4]]) return false;
      if (c[5] && w.list.indexOf(c[5]) < 0) return false;
    }
    return true;
  }

  function blueprintCost(bp, cfg) {
    var n = 0;
    bp.cells.forEach(function (c) { n += costOf(cfg, c[2]); });
    return n;
  }

  function placeBlueprint(state, index, x, y, cfg) {
    var run = state.run;
    var bp = (state.meta.bp || [])[index];
    if (!bp) return { ok: false, reason: 'нет чертежа' };
    if (!blueprintFits(state, bp)) return { ok: false, reason: 'на этой планете нет его предметов' };
    var put = [];
    var cost = 0;
    bp.cells.forEach(function (c) {
      var px = x + c[0];
      var py = y + c[1];
      if (cannot(state, c[2], px, py)) return;
      put.push(c);
      cost += costOf(cfg, c[2]);
    });
    if (!put.length) return { ok: false, reason: 'некуда поставить' };
    if (!pay(run, cost)) return { ok: false, reason: 'не хватает денег: нужно ' + cost };
    put.forEach(function (c) {
      var b = F.make(c[2], x + c[0], y + c[1], c[3]);
      if (c[4]) b.r = c[4];
      if (c[5]) b.f = c[5];
      run.b.push(b);
    });
    run.lv++;
    remember(run, cfg, { k: 'add', cells: put.map(function (c) { return [x + c[0], y + c[1]]; }), cost: cost, free: 0 });
    return { ok: true, placed: put.length, skipped: bp.cells.length - put.length, cost: cost };
  }

  // ---- research ------------------------------------------------------------------------------------

  function researchList(state) {
    var w = world(state);
    var titles = w.planet.research || {};
    return data().research.filter(function (r) {
      if (r.id === 'alloy') return !!w.byAt.assembler.filter(function (x) { return x.lock === 'alloy'; }).length;
      return true;
    }).map(function (r) {
      var t = r.title;
      var text = r.text;
      if (r.id === 'advanced' || r.id === 'top') {
        t = titles[r.id] || (r.id === 'top' ? 'Главное изделие' : 'Новый материал');
        var rec = null;
        (w.planet.recipes || []).forEach(function (x) { if (x.lock === r.id && !rec) rec = x; });
        text = rec ? 'Открывает рецепт: ' + (w.items[rec.out] ? w.items[rec.out].title.toLowerCase() : rec.out) : text;
      }
      return { id: r.id, title: t, text: text };
    });
  }

  /** Levels a research has; for the growing ones 0 means no limit: the price just keeps rising. */
  function researchMax(cfg, id) {
    var max = cfg['research.' + id + '.max'];
    return max === 0 && ENDLESS.indexOf(id) >= 0 ? Infinity : max;
  }

  function researchCost(state, id, cfg) {
    var L = level(state.run, id);
    return Big.ceil(Big.mul(cfg['research.' + id + '.base'], Big.pow(cfg['research.' + id + '.growth'], L)));
  }

  function canResearch(state, id, cfg) {
    var L = level(state.run, id);
    if (L >= researchMax(cfg, id)) return false;
    return Big.gte(state.run.money, researchCost(state, id, cfg));
  }

  function buyResearch(state, id, cfg, rng, now) {
    var run = state.run;
    if (researchMax(cfg, id) === undefined) return { ok: false, reason: 'нет такого исследования' };
    if (level(run, id) >= researchMax(cfg, id)) return { ok: false, reason: 'изучено' };
    if (!pay(run, researchCost(state, id, cfg))) return { ok: false, reason: 'не хватает денег' };
    run.res[id] = level(run, id) + 1;
    if (id === 'land') grow(state, rng, cfg);
    if (id === 'courier') run.courierAt = (now || 0) + cfg['courier.everySec'] * 1000;
    if (id === 'logistics') run.orderAt.push((now || 0) + MIN);
    run.lv++;
    return { ok: true, level: run.res[id] };
  }

  // ---- selling, orders, the courier ---------------------------------------------------------------

  function seller(state, ctx, w, sink) {
    var run = state.run;
    var cfg = ctx.config;
    var pm = priceMul(run, cfg);
    var rush = rushOn(run, ctx.now) ? cfg['rush.mult'] : 1;
    var goal = w.planet.goal;
    return function (item) {
      var def = w.items[item];
      if (!def) return;
      var base = def.price * pm;
      var fair = run.ev && run.ev.id === 'fair' && run.ev.item === item && run.ev.until > ctx.now ? cfg['fair.mult'] : 1;
      sink.money += base * fair * (ctx.mult || 1);
      windowAdd(run, base / rush, item);
      run.sold[item] = (run.sold[item] || 0) + 1;
      run.soldN++;
      run.orders.forEach(function (o) { if (o.item === item && o.have < o.need) o.have++; });
      if (item === goal) {
        run.goalSold++;
        var flags = state.meta.flags = state.meta.flags || {};
        if (goal === 'drone') {
          flags.drone = 1;
          if (F.tunnelCount(run) === 0) flags.noTunnel = 1;
        }
      }
    };
  }

  function makeOrder(state, rng, cfg, now, x3) {
    var run = state.run;
    var w = world(state);
    var raw = (w.planet.resources || []);
    var made = [];
    var all = [];
    for (var item in run.sold) {
      if (!w.items[item] || run.sold[item] < cfg['order.minSold']) continue;
      all.push(item);
      if (raw.indexOf(item) < 0) made.push(item);
    }
    var pool = made.length ? made : all;
    if (!pool.length) return null;
    var pick = rng.weighted(pool, function (i) { return Math.sqrt(w.items[i].price); });
    var rate = windowItems(run, cfg)[pick] || 0;
    var minutes = cfg['order.minutes'] * (1 + cfg['order.timeStep'] * level(run, 'logistics'));
    var need = Math.round(rate * minutes * 60 * rng.range(0.7, 1.1));
    need = Math.max(cfg['order.min'], Math.min(cfg['order.max'], need));
    var reward = Math.ceil(w.items[pick].price * need * cfg['order.reward'] * (x3 ? cfg['order.chestMult'] : 1));
    return { item: pick, need: need, have: 0, until: now + minutes * MIN, reward: reward, x3: x3 ? 1 : 0 };
  }

  function slots(run, cfg) { return cfg['order.cards'] + level(run, 'logistics'); }

  function stepOrders(state, ctx, sink) {
    var run = state.run;
    var cfg = ctx.config;
    var now = ctx.now;
    var w = world(state);
    var keep = [];
    run.orders.forEach(function (o) {
      if (o.have >= o.need) {
        sink.money += o.reward;
        run.ordersDone++;
        news(run, 'Заказ выполнен: ' + o.need + ' × ' + (w.items[o.item] ? w.items[o.item].title.toLowerCase() : o.item) + ', награда ' + Fmt.num(o.reward));
        if (!o.x3) run.orderAt.push(now + cfg['order.nextMin'] * MIN);
      } else if (o.until <= now) {
        if (!o.x3) run.orderAt.push(now + cfg['order.nextMin'] * MIN);
      } else keep.push(o);
    });
    run.orders = keep;
    run.orderAt.sort(function (a, b) { return a - b; });
    var regular = run.orders.filter(function (o) { return !o.x3; }).length;
    while (regular < slots(run, cfg) && run.orderAt.length && run.orderAt[0] <= now) {
      var o = makeOrder(state, ctx.rng, cfg, now, false);
      if (!o) {
        run.orderAt[0] = now + MIN;
        break;
      }
      run.orders.push(o);
      run.orderAt.shift();
      regular++;
    }
    while (regular + run.orderAt.length < slots(run, cfg)) run.orderAt.push(now + cfg['order.nextMin'] * MIN);
  }

  function stepCourier(state, ctx, E) {
    var run = state.run;
    var cfg = ctx.config;
    var L = level(run, 'courier');
    if (!L || ctx.now < run.courierAt) return;
    run.courierAt = ctx.now + cfg['courier.everySec'] * 1000;
    var left = cfg['courier.items'] * L;
    var moved = 0;
    run.b.forEach(function (b) {
      if (b.t !== 'storage') return;
      while (left > 0 && b.s.length) {
        E.sell(b.s.shift());
        left--;
        moved++;
      }
    });
    if (moved) news(run, 'Курьер отвёз в порт ' + moved + ' ' + Fmt.plural(moved, 'предмет', 'предмета', 'предметов'));
  }

  // ---- events --------------------------------------------------------------------------------------

  function startEvent(state, ctx) {
    var run = state.run;
    var cfg = ctx.config;
    var rng = ctx.rng;
    var w = world(state);
    var now = ctx.now;
    var kinds = [];
    if ((w.planet.resources || []).length && run.ore) kinds.push('meteor');
    var sold = Object.keys(run.sold || {}).filter(function (k) { return w.items[k]; });
    if (sold.length) kinds.push('fair');
    if (run.b.some(function (b) { return b.t === 'furnace'; })) kinds.push('outage');
    var idle = F.idleList(run).filter(function (b) { return b.t !== 'port'; });
    if (idle.length) kinds.push('inspector');
    if (!kinds.length) return null;
    var id = rng.pick(kinds);
    var def = null;
    data().events.forEach(function (e) { if (e.id === id) def = e; });
    var ev = { id: id, title: def ? def.title : id, at: now };
    if (id === 'meteor') {
      var res = rng.pick(w.planet.resources.filter(function (r) { return r !== 'mail'; }));
      var cells = F.patch(run, rng, res, cfg['meteor.size'], { x0: 0, y0: 0, x1: run.w, y1: run.h }, { u: 1 });
      if (!cells.length) return null;
      run.lv++;
      ev.until = now + cfg['meteor.min'] * MIN;
      ev.item = res;
      ev.text = 'Новое пятно: ' + w.items[res].title.toLowerCase() + ' на ' + cfg['meteor.min'] + ' мин';
    } else if (id === 'fair') {
      ev.item = rng.pick(sold);
      ev.until = now + cfg['fair.min'] * MIN;
      ev.text = 'Порт платит ×' + cfg['fair.mult'] + ' за «' + w.items[ev.item].title + '»';
    } else if (id === 'outage') {
      ev.until = now + cfg['outage.sec'] * 1000;
      ev.text = 'Печи стоят — тап по щитку чинит';
    } else {
      var target = rng.pick(idle);
      ev.x = target.x;
      ev.y = target.y;
      ev.until = now + cfg['inspector.sec'] * 1000;
      ev.text = 'Почините здание за минуту: ' + F.idleOf(run, target);
      ev.reward = Math.max(cfg['inspector.rewardMin'], Math.ceil(windowRate(run, cfg) * cfg['inspector.rewardMinutes'] * 60));
    }
    return ev;
  }

  function endEvent(run) {
    if (run.ev && run.ev.id === 'meteor') {
      run.ore = run.ore.filter(function (o) { return !o.u; });
      run.lv++;
    }
    run.ev = null;
  }

  function stepEvents(state, ctx, sink) {
    var run = state.run;
    var cfg = ctx.config;
    var now = ctx.now;
    if (run.ev && run.ev.id === 'inspector' && run.ev.until > now) {
      var b = F.findAt(run, run.ev.x, run.ev.y);
      if (b && !F.idleOf(run, b)) {
        sink.money += run.ev.reward;
        news(run, 'Инспектор доволен: +' + Fmt.num(run.ev.reward));
        run.ev.until = now;
      }
    }
    if (run.ev && run.ev.until <= now) {
      endEvent(run);
      run.evAt = now + cfg['event.everyMin'] * ctx.rng.range(0.6, 1.4) * MIN;
    }
    if (!run.ev && now >= run.evAt) {
      run.ev = startEvent(state, ctx);
      if (run.ev) news(run, run.ev.title + ': ' + run.ev.text);
      else run.evAt = now + MIN;
    }
    var p = world(state).planet;
    if (p.storm) {
      if (now >= run.storm.at) {
        run.storm.until = now + cfg['storm.sec'] * 1000;
        run.storm.at = now + cfg['storm.everyMin'] * MIN;
        news(run, 'Буря: внешние ленты стоят ' + cfg['storm.sec'] + ' с');
      }
    }
  }

  /** «Сбой питания»: a tap on the panel fixes it at once. */
  function fixPower(state, now) {
    var run = state.run;
    if (!run.ev || run.ev.id !== 'outage') return false;
    run.ev.until = now;
    return true;
  }

  // ---- the engine's functions ---------------------------------------------------------------------

  function init(ctx) {
    var cfg = ctx.config;
    return {
      run: newRun(null, 'rusty', ctx.rng, cfg, ctx.now),
      layers: { planet: { currency: '0e0', count: 0, best: '0e0', state: { spent: 0, shop: {} } } },
      meta: { visited: ['rusty'], visits: { rusty: 1 }, bp: [], bpN: 0, custom: [], flags: {}, nextPlanet: '' }
    };
  }

  function tick(state, dt, ctx) {
    var run = state.run;
    if (!run || !run.b) return;
    if (ctx.offline) {
      offlineAdvance(state, dt, ctx, null);
      return;
    }
    var cfg = ctx.config;
    var w = world(state);
    var sink = { money: 0 };
    var E = env(state, ctx, w, seller(state, ctx, w, sink));
    var n = Math.min(cfg['sim.maxSub'], Math.max(1, Math.ceil(dt / cfg['sim.step'] - 1e-9)));
    var h = dt / n;
    for (var i = 0; i < n; i++) F.step(run, E, h);
    windowAdvance(run, dt, cfg);
    stepCourier(state, ctx, E);
    stepOrders(state, ctx, sink);
    stepEvents(state, ctx, sink);
    if (sink.money) addMoney(run, sink.money);
    // «Фабрика без простоя»: no idle building among enough of them.
    var count = 0;
    run.b.forEach(function (b) { if (b.t !== 'belt' && b.t !== 'tunnel' && b.t !== 'dock') count++; });
    if (count >= cfg['ach.calmBuildings'] && !F.idleList(run).length) run.calm += dt;
    else run.calm = 0;
    var flags = state.meta.flags = state.meta.flags || {};
    if (run.calm >= cfg['ach.calmMin'] * 60) flags.calm = 1;
    var per = 0;
    var items = windowItems(run, cfg);
    for (var k in items) per += items[k] * 60;
    if (per >= cfg['ach.perMinute'] && covered(run, cfg) >= 60) flags.k1000 = 1;
  }

  /**
   * The closed screen: the port's sliding income × the offline share (× the trip's multiplier),
   * with ore getting poorer by what was dug. Exact over any split of the time, so the formula
   * (sim.offline) and the engine's steps (tick with ctx.offline) agree.
   */
  function offlineAdvance(state, sec, ctx, out) {
    var run = state.run;
    var cfg = ctx.config;
    var rate = windowRate(run, cfg);
    if (!(rate > 0) || !(sec > 0)) return 0;
    var share = level(run, 'night') ? cfg['offline.shareNight'] : cfg['offline.share'];
    var dr = speeds(state, cfg).drill;
    var deep = level(run, 'deep') > 0;
    var amount = cfg['ore.amount'];
    var slow = cfg['ore.slow'];
    var total = 0;
    var n = 0;
    run.b.forEach(function (b) {
      if (b.t !== 'drill') return;
      var ore = F.oreAt(run, b.x, b.y);
      if (!ore) return;
      n++;
      if (deep || ore.u || b.rf < 1) {
        total += sec;
        ore.m += dr * (ore.u || deep || ore.m < amount ? 1 : slow) * sec;
      } else if (ore.m >= amount) {
        total += slow * sec;
        ore.m += dr * slow * sec;
      } else {
        var t = (amount - ore.m) / dr;
        if (t >= sec) {
          total += sec;
          ore.m += dr * sec;
        } else {
          total += t + slow * (sec - t);
          ore.m = amount + dr * slow * (sec - t);
          if (out) out.depleted[ore.r] = (out.depleted[ore.r] || 0) + 1;
        }
      }
    });
    var equiv = n ? total / n : sec;
    var got = rate * share * equiv * (ctx.mult || 1);
    addMoney(run, got);
    if (out) {
      var items = windowItems(run, cfg);
      for (var k in items) out.items[k] = (out.items[k] || 0) + items[k] * share * equiv;
      out.money += got;
    }
    return got;
  }

  function offline(state, sec, ctx) {
    var out = { items: {}, depleted: {}, money: 0 };
    offlineAdvance(state, sec, ctx, out);
    var w = world(state);
    var gains = {};
    var events = [];
    for (var k in out.items) {
      var n = Math.floor(out.items[k]);
      if (n > 0 && w.items[k]) gains['Продано: ' + w.items[k].title.toLowerCase()] = n;
    }
    for (var r in out.depleted) {
      events.push('Истощилось пятно: ' + (w.items[r] ? w.items[r].title.toLowerCase() : r) + ' — ' + out.depleted[r] + ' ' + Fmt.plural(out.depleted[r], 'клетка', 'клетки', 'клеток') + ', бур на них работает вчетверо медленнее');
    }
    if (out.money > 0) {
      var share = level(state.run, 'night') ? 'полной ставке (Ночная смена)' : 'половине ставки';
      events.unshift('Фабрика работала по ' + share + ' последних 5 минут игры');
    }
    return { gains: gains, events: events };
  }

  function prestigeGain(state, layerId, cfg) {
    var run = state.run;
    if (!run || !run.goalSold) return Big.ZERO;
    if (Big.lt(run.earned, cfg['planet.minEarned'])) return Big.ZERO;
    return Big.floor(Big.pow(Big.div(run.earned, cfg['planet.div']), cfg['planet.power']));
  }

  function bonus(state, layerId, amount, cfg) {
    var l = state.layers && state.layers[LAYER];
    var spent = (l && l.state && l.state.spent) || 0;
    return Big.add(1, Big.mul(Big.add(amount, spent), cfg['credit.bonus']));
  }

  /** The planets to move to after `moves` moves: the first is fixed, then two to choose from. */
  function planetOptions(state, moves, cfg) {
    var current = state.run.planet;
    if (moves < cfg['planet.fixedMoves']) return [ORDER[Math.min(moves + 1, ORDER.length - 1)]];
    var visits = state.meta.visits || {};
    var ids = ORDER.concat((state.meta.custom || []).map(function (p) { return p.id; }));
    var list = ids.filter(function (id) { return id !== current; });
    list.sort(function (a, b) { return (visits[a] || 0) - (visits[b] || 0) || ids.indexOf(a) - ids.indexOf(b); });
    return list.slice(0, 2);
  }

  function choosePlanet(state, id) {
    state.meta.nextPlanet = id || '';
    return true;
  }

  function onPrestige(state, layerId, before, ctx) {
    var cfg = ctx.config;
    var meta = state.meta;
    var moves = (state.layers[LAYER].count || 1) - 1;
    var options = planetOptions(before, moves, cfg);
    var next = meta.nextPlanet && (options.indexOf(meta.nextPlanet) >= 0 || planetDef(state, meta.nextPlanet).id === meta.nextPlanet) && meta.nextPlanet !== before.run.planet
      ? meta.nextPlanet : options[0];
    meta.nextPlanet = '';
    meta.visited = meta.visited || [];
    if (meta.visited.indexOf(next) < 0) meta.visited.push(next);
    meta.visits = meta.visits || {};
    meta.visits[next] = (meta.visits[next] || 0) + 1;
    var l = state.layers[LAYER];
    l.state.best = Math.max(l.state.best || 0, Big.toNumber(Big.of(before.run.earned, 0)));
    var run = newRun(state, next, ctx.rng, cfg, ctx.now);
    var shop = (l.state && l.state.shop) || {};
    if (shop.money) run.money = Big.add(run.money, cfg['shop.money.amount'] * shop.money);
    if (shop.research) SPEEDS.forEach(function (id) { run.res[id] = shop.research; });
    if (shop.courier) {
      run.res.courier = Math.max(run.res.courier || 0, 1);
      run.courierAt = ctx.now + cfg['courier.everySec'] * 1000;
    }
    state.run = run;
  }

  // ---- the meta shop of credits ------------------------------------------------------------------

  function shopCost(state, id, cfg) {
    var shop = state.layers[LAYER].state.shop || {};
    var L = shop[id] || 0;
    if (id === 'courier') return L ? null : cfg['shop.courier.cost'];
    return cfg['shop.' + id + '.cost'] + cfg['shop.' + id + '.step'] * L;
  }

  function shopBuy(state, id, cfg) {
    var l = state.layers[LAYER];
    l.state.shop = l.state.shop || {};
    var cost = shopCost(state, id, cfg);
    if (cost === null || cost === undefined) return { ok: false, reason: 'уже куплено' };
    if (Big.lt(l.currency, cost)) return { ok: false, reason: 'не хватает кредитов' };
    l.currency = Big.sub(l.currency, cost);
    l.state.spent = (l.state.spent || 0) + cost;
    l.state.shop[id] = (l.state.shop[id] || 0) + 1;
    return { ok: true };
  }

  // ---- links: the rush, the chest -----------------------------------------------------------------

  /** «Аврал» (a spend of energy): every building ×2 for rush.min minutes. */
  function rush(state, now, cfg) {
    var run = state.run;
    run.rushUntil = Math.max(now, run.rushUntil || 0) + cfg['rush.min'] * MIN;
    return run.rushUntil;
  }

  /** The chest of «Пассажир»: free buildings and an order with a triple reward. */
  function chest(state, rng, cfg) {
    var run = state.run;
    var now = state.lastTick || 0;
    run.free += cfg['chest.free'];
    var items = [{ title: 'Бесплатные здания', amount: cfg['chest.free'] }];
    var o = makeOrder(state, rng, cfg, now, true);
    if (o) {
      run.orders.push(o);
      var w = world(state);
      items.push({ title: 'Заказ ×3: ' + o.need + ' × ' + w.items[o.item].title.toLowerCase(), amount: o.reward });
    } else {
      var money = Math.max(cfg['cost.furnace'], Math.ceil(windowRate(run, cfg) * 600));
      addMoney(run, money);
      items.push({ title: 'Деньги', amount: money });
    }
    return { title: 'Сундук поездки', items: items };
  }

  // ---- a starter line for the checks and bots ---------------------------------------------------

  /**
   * Builds drill → belt → furnace → belt → port on a cell of ore `res` (any resource with a furnace
   * recipe when res is empty) where the four cells after it are free land. True when built.
   */
  function starterLine(state, cfg, res) {
    var run = state.run;
    var w = world(state);
    var smelt = {};
    (w.byAt.furnace || []).forEach(function (r) {
      var ins = Object.keys(r.in);
      if (ins.length === 1 && w.open[r.id]) smelt[ins[0]] = r;
    });
    var cost = costOf(cfg, 'drill') + 2 * costOf(cfg, 'belt') + costOf(cfg, 'furnace') + costOf(cfg, 'port');
    if (Big.lt(run.money, cost)) return false;
    for (var i = 0; i < run.ore.length; i++) {
      var o = run.ore[i];
      if (o.u || (res ? o.r !== res : !smelt[o.r]) || F.findAt(run, o.x, o.y)) continue;
      for (var d = 0; d < 4; d++) {
        var ok = true;
        for (var k = 1; k <= 4 && ok; k++) {
          var x = o.x + F.DX[d] * k;
          var y = o.y + F.DY[d] * k;
          if (x < 0 || y < 0 || x >= run.w || y >= run.h || F.findAt(run, x, y) || F.oreAt(run, x, y)) ok = false;
        }
        if (!ok) continue;
        var types = ['drill', 'belt', 'furnace', 'belt', 'port'];
        for (var t = 0; t < types.length; t++) build(state, types[t], o.x + F.DX[d] * t, o.y + F.DY[d] * t, d, cfg);
        return true;
      }
    }
    return false;
  }

  // ---- the rest the engine asks --------------------------------------------------------------------

  function migrate(state, fromVer) { return state; }

  function validate(state) {
    var r = state.run;
    if (!r || !Array.isArray(r.b)) return 'нет зданий';
    if (typeof r.w !== 'number' || typeof r.h !== 'number' || r.w < 4 || r.h < 4) return 'странный участок';
    if (!Big.valid(r.money) || Big.sign(r.money) < 0) return 'денег меньше нуля';
    for (var i = 0; i < r.b.length; i++) {
      var b = r.b[i];
      if (F.TYPES.indexOf(b.t) < 0) return 'странное здание ' + b.t;
      if (typeof b.x !== 'number' || typeof b.y !== 'number') return 'здание без места';
    }
    return null;
  }

  function summary(state, cfg) {
    var run = state.run;
    var p = planetDef(state, run.planet);
    var parts = [Fmt.rate(windowRate(run, cfg)), p.title, 'зданий ' + run.b.length];
    var l = state.layers[LAYER];
    if (l && l.count) parts.push('переездов ' + l.count);
    return { line: parts.join(' · ') };
  }

  function next(state, now, cfg) {
    var run = state.run;
    if (!run.orderAt || !run.orderAt.length) return [];
    var at = Math.max(now, run.orderAt[0]);
    if (at - now > 86400000) return [];
    return [{ id: 'order', at: at, text: 'На «' + planetDef(state, run.planet).title + '» пришёл новый заказ' }];
  }

  var LORE = {
    a: ['Бортовой журнал', 'Записка смотрителя', 'Сводка диспетчера', 'Заметка бурильщика'],
    b: ['ленты гудят ровно, как море в штиль', 'печь опять просит руды раньше срока', 'сборщик насвистывает, когда рецепт сходится',
      'порт любит шестерни больше, чем слитки', 'ночью фабрика работает тише, но не останавливается', 'на краю участка снова замело дорожку']
  };

  function procedural(kind, rng) {
    if (kind === 'lore') return { title: rng.pick(LORE.a), text: rng.pick(LORE.b), procedural: true };
    return null;
  }

  /**
   * Checks a planet (built in or made by the model): resources, 6–10 items, every input made from
   * the planet's resources, no cycles, every product dearer than its inputs, the goal reachable.
   * Returns null or the reason.
   */
  function validatePlanet(p, items) {
    if (!p || typeof p !== 'object') return 'планета не объект';
    items = items || data().items;
    var res = p.resources || [];
    var recipes = p.recipes || [];
    if (!res.length) return 'нет ресурсов';
    for (var q = 0; q < res.length; q++) if (!items[res[q]]) return 'нет предмета ' + res[q];
    if (recipes.length < 3) return 'мало рецептов';
    var made = {};
    var count = 0;
    var i;
    for (i = 0; i < recipes.length; i++) {
      var r = recipes[i];
      if (r.at !== 'furnace' && r.at !== 'assembler') return 'рецепт ' + r.id + ': странное здание';
      if (!items[r.out]) return 'нет предмета ' + r.out;
      var kinds = Object.keys(r.in || {});
      if (!kinds.length || kinds.length > 3) return 'рецепт ' + r.id + ': входов должно быть 1–3';
      if (!(r.sec > 0) || !(r.n >= 1)) return 'рецепт ' + r.id + ': время и выход';
      if (made[r.out]) return 'два рецепта для ' + r.out;
      made[r.out] = r;
      count++;
    }
    if (count + res.length < 6 || count + res.length > 16) return 'предметов должно быть 6–16, а их ' + (count + res.length);
    // Reachable from the resources, without cycles: a product is ready once all its inputs are.
    var ready = {};
    res.forEach(function (x) { ready[x] = true; });
    (p.imports || []).forEach(function (x) { ready[x.res] = true; });
    var changed = true;
    var guard = 0;
    while (changed && guard++ < 100) {
      changed = false;
      for (var out in made) {
        if (ready[out]) continue;
        var ok = true;
        for (var inp in made[out].in) if (!ready[inp]) ok = false;
        if (ok) {
          ready[out] = true;
          changed = true;
        }
      }
    }
    for (var o in made) if (!ready[o]) return 'не достижимо из ресурсов или по кругу: ' + o;
    for (var x in made) {
      var rec = made[x];
      var cost = 0;
      for (var k in rec.in) {
        if (!items[k]) return 'нет предмета ' + k;
        cost += items[k].price * rec.in[k];
      }
      if (!(items[rec.out].price * rec.n > cost)) return 'изделие не дороже входа: ' + rec.out;
    }
    if (!p.goal || !ready[p.goal]) return 'главное изделие не достижимо';
    return null;
  }

  function validateStock(kind, item) {
    if (/https?:/.test(JSON.stringify(item))) return 'ссылка в тексте';
    if (kind !== 'planet') return null;
    var items = {};
    var base = data().items;
    for (var k in base) items[k] = base[k];
    (item.items || []).forEach(function (it) { if (it && it.id) items[it.id] = it; });
    var p = {
      resources: item.resources, imports: [], goal: item.goal, recipes: (item.recipes || []).map(function (r) {
        return { id: r.out, at: r.at, in: r.in, out: r.out, n: r.n || 1, sec: r.sec };
      })
    };
    return validatePlanet(p, items);
  }

  /** A planet made by the model (stock «planet») as the game keeps it in meta.custom. */
  function adoptPlanet(state, item) {
    var meta = state.meta;
    meta.custom = meta.custom || [];
    var id = 'custom-' + (meta.custom.length + 1);
    var items = {};
    (item.items || []).forEach(function (it) {
      items[it.id] = { title: it.title, price: it.price, shape: it.shape || 'box', color: /^#[0-9a-fA-F]{6}$/.test(it.color || '') ? it.color : '#B0B0B0' };
    });
    var patches = (item.resources || []).map(function (r) { return [r, 1]; });
    var top = null;
    var p = {
      id: id, title: item.title, about: item.about || '', feature: item.feature || '', resources: item.resources, patches: patches,
      grow: item.resources, goal: item.goal, research: { advanced: 'Новый материал', top: 'Главное изделие' },
      recipes: (item.recipes || []).map(function (r) {
        var rec = { id: r.out, at: r.at, in: r.in, out: r.out, n: r.n || 1, sec: r.sec };
        if (r.out === item.goal) {
          rec.lock = 'top';
          top = rec;
        }
        return rec;
      }),
      items: items
    };
    if (!top) return null;
    meta.custom.push(p);
    return id;
  }

  return {
    init: init, tick: tick, offline: offline, prestigeGain: prestigeGain, bonus: bonus, onPrestige: onPrestige,
    migrate: migrate, validate: validate, summary: summary, next: next, chest: chest,
    procedural: procedural, validateStock: validateStock,
    // the screen, the bots and the tests
    LAYER: LAYER, ORDER: ORDER, COSTS: COSTS, useData: useData, data: data, world: world, planetDef: planetDef, level: level,
    speeds: speeds, creditMul: creditMul, credits: credits, priceMul: priceMul, windowRate: windowRate, windowItems: windowItems,
    env: env, newRun: newRun, grow: grow, costOf: costOf, cannot: cannot, build: build, buildLine: buildLine, drawBelt: drawBelt,
    demolish: demolish, rotate: rotate, setRecipe: setRecipe, setFilter: setFilter, undo: undo,
    saveBlueprint: saveBlueprint, placeBlueprint: placeBlueprint, blueprintFits: blueprintFits, blueprintCost: blueprintCost,
    researchList: researchList, researchCost: researchCost, researchMax: researchMax, canResearch: canResearch, buyResearch: buyResearch,
    slots: slots, makeOrder: makeOrder, fixPower: fixPower, rush: rush, planetOptions: planetOptions, choosePlanet: choosePlanet,
    shopCost: shopCost, shopBuy: shopBuy, validatePlanet: validatePlanet, adoptPlanet: adoptPlanet, offlineAdvance: offlineAdvance,
    starterLine: starterLine, factory: F
  };
});
