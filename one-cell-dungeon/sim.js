// The logic of «Подземелье в одну клетку»: a descent on a 3×3 grid where the hero is one of the
// nine cards. A step eats the neighbouring card; the cell left behind takes the next card of the
// floor's descent deck. Shared subset of JavaScript (screen, Rhino, node): no class, no async, no
// f(...args), no for (let …); randomness only from Rng streams whose state lives in the save
// (run.rs), so a killed app comes back to the very same move.
//
// The lists (enemies, seals, gifts, heroes, kind cards, floors, depths, rule bricks) are data in
// content/*.json; every number is a setting of config.json (cfg).
(function (root, make) {
  var node = typeof require === 'function' && typeof exports !== 'undefined';
  var api = node ? make(require('../engine/big.js'), require('../engine/rng.js')) : make(root.Big, root.Rng);
  if (node) {
    api.setContent({
      enemies: require('./content/enemies.json'), seals: require('./content/seals.json'), gifts: require('./content/gifts.json'),
      heroes: require('./content/heroes.json'), kind: require('./content/kind.json'), floors: require('./content/floors.json'),
      depths: require('./content/depths.json'), bricks: require('./content/bricks.json')
    });
    api.setDefaults(require('./config.json'));
  }
  if (typeof exports !== 'undefined') { for (var k in api) exports[k] = api[k]; } else { root.GameSim = api; }
})(this, function (Big, Rng) {
  'use strict';

  var LAYER = 'depth';
  var ID = 'one-cell-dungeon';
  // Orthogonal neighbours of the cells 0..8 (row by row).
  var NB = [[1, 3], [0, 2, 4], [1, 5], [0, 4, 6], [1, 3, 5, 7], [2, 4, 8], [3, 7], [4, 6, 8], [5, 7]];
  var PHASES = ['hub', 'play', 'choice', 'seal', 'gift', 'rest', 'shop', 'won', 'over'];
  // Gifts whose power is the number of uses a floor.
  var MULTI = { swap: 1, empty: 1, squeeze: 1, double: 1 };
  // The order the smart bot prefers seals in (a taste, not a number of balance).
  var SEAL_RANK = ['stone', 'last', 'master', 'echo', 'leech', 'belt', 'counter', 'mirror', 'shadow', 'spare', 'cauldron', 'rule',
    'quiet', 'bolt', 'grip', 'sleep', 'piggy', 'abacus', 'lockpick', 'breath', 'hand', 'greed', 'hunger'];
  var KIND_TITLES = {
    potion: 'Зелье', weapon: 'Оружие', shield: 'Щит', gold: 'Золото', trap: 'Ловушка', key: 'Ключ', chest: 'Сундук',
    altar: 'Алтарь', stairs: 'Лестница', whet: 'Точильный камень', boss: 'Хозяин глубины', fog: 'Неизвестно'
  };

  // ---- content and defaults -------------------------------------------------------------------------

  var C = null;
  var IX = {};
  var DEF = null;

  function setContent(c) {
    C = c;
    IX = {};
    for (var k in c) {
      IX[k] = {};
      (c[k] || []).forEach(function (x) { if (x && x.id !== undefined) IX[k][x.id] = x; });
    }
  }

  /** The default values of config.json (validateStock has no settings of its own). */
  function setDefaults(conf) {
    DEF = {};
    for (var k in conf) if (conf[k] && typeof conf[k] === 'object') DEF[k] = conf[k].value;
  }

  function list(kind) {
    if (!C) throw new Error('Подземелье: нет содержимого content/*.json — нужен sim.setContent');
    return C[kind] || [];
  }

  function item(kind, id) {
    list(kind);
    return (IX[kind] && IX[kind][id]) || null;
  }

  function numText(v) { return typeof v === 'number' ? String(Math.round(v * 100) / 100).replace('.', ',') : String(v); }

  /** A text of the content with {setting.key} replaced by the value of the setting. */
  function fill(text, cfg) {
    return String(text || '').replace(/\{([A-Za-z0-9.]+)\}/g, function (m, k) { return cfg && cfg[k] !== undefined ? numText(cfg[k]) : m; });
  }

  function plural(n, one, two, five) {
    var a = Math.abs(n) % 100;
    var b = a % 10;
    if (a > 10 && a < 20) return five;
    if (b === 1) return one;
    if (b >= 2 && b <= 4) return two;
    return five;
  }

  function num(x) {
    var v = Big.toNumber(Big.of(x, 0));
    return v === v && isFinite(v) ? v : 0;
  }

  // ---- cards --------------------------------------------------------------------------------------

  function copy(c) {
    if (!c) return null;
    var o = {};
    for (var k in c) o[k] = c[k];
    return o;
  }

  function stamp(run, c) {
    var o = copy(c);
    o.u = ++run.uid;
    return o;
  }

  function has(run, id) { return run.seals.indexOf(id) >= 0; }

  function enemyDef(run, id) {
    if (id === 'rule') return run && run.rule && run.rule.type === 'enemy' ? run.rule : { id: 'rule', title: 'Враг', text: '' };
    return item('enemies', id) || { id: id, title: 'Враг', text: '' };
  }

  function isPredator(run, c) { return !!(c && c.k === 'foe' && enemyDef(run, c.e).predator); }

  function ruleSeal(run, brick) {
    return run.rule && run.rule.type === 'seal' && run.rule.brick === brick && has(run, 'rule') ? run.rule.value : 0;
  }

  function cardTitle(run, c) {
    if (!c) return 'Пусто';
    if (c.kind) {
      var kd = item('kind', c.kind);
      if (kd) return kd.title;
    }
    if (c.k === 'foe') return enemyDef(run, c.e).title;
    return KIND_TITLES[c.k] || c.k;
  }

  function floorTitle(cfg, f) {
    var n = cfg['floors.count'];
    var fl = list('floors');
    if (f <= n && fl[f - 1]) return fl[f - 1].title;
    var deep = item('floors', 'endless');
    return (deep ? deep.title : 'Ниже дна') + ', ' + (f - n);
  }

  // ---- the hero's numbers ---------------------------------------------------------------------------

  function strength(run, cfg) {
    if (!run.wpn) return 0;
    return run.wpn.s + (run.hero === 'madman' ? cfg['hero.madman.strength'] : 0);
  }

  function witch(run) {
    for (var i = 0; i < 9; i++) if (run.grid[i] && run.grid[i].k === 'foe' && run.grid[i].e === 'witch') return true;
    return false;
  }

  function packed(run, cell) {
    var n = NB[cell];
    for (var i = 0; i < n.length; i++) if (isPredator(run, run.grid[n[i]])) return true;
    return false;
  }

  function bossHit(run, cfg) {
    var cycle = Math.max(0, Math.floor((run.floor - cfg['floors.count']) / cfg['endless.bossEvery']));
    return (run.depth >= 10 ? cfg['depth.bossHit'] : cfg['boss.hit']) + cycle * cfg['boss.hitPerCycle'];
  }

  function bossHp(run, cfg) {
    var cycle = Math.max(0, Math.floor((run.floor - cfg['floors.count']) / cfg['endless.bossEvery']));
    return (run.depth >= 4 ? cfg['depth.bossHp'] : cfg['boss.hp']) + cycle * cfg['boss.hpPerCycle'];
  }

  /** The strength of a foe as it fights now (the dog's pack, the twin, greed). */
  function foeValue(run, cfg, card, cell) {
    if (card.k === 'boss') return bossHit(run, cfg);
    var v = card.v;
    if (card.e === 'twin') v = strength(run, cfg) + cfg['enemy.twin.over'];
    else if (card.e === 'dog' && cell >= 0 && packed(run, cell)) v += cfg['enemy.dog.pack'];
    if (has(run, 'greed')) v += cfg['seal.greed.enemy'];
    return v;
  }

  function skin(run, cfg, n) { return has(run, 'stone') ? Math.min(n, cfg['seal.stone.cap']) : n; }

  function hurt(run, n, pierce) {
    if (!(n > 0)) return;
    if (!pierce && run.shield > 0) {
      var a = Math.min(run.shield, n);
      run.shield -= a;
      n -= a;
    }
    run.hp -= n;
    run.st.damage += n;
  }

  function heal(run, n) { if (n > 0) run.hp = Math.min(run.maxHp, run.hp + n); }

  function say(run, text) {
    if (run.sim || !run.log) return;
    run.log.push(text);
    if (run.log.length > 40) run.log.shift();
  }

  function ev(res, type, n) { if (res) res.ev.push([type, n || 0]); }

  // ---- what a card does --------------------------------------------------------------------------------

  function wear(run, cfg, strong, res) {
    if (!run.wpn) return;
    if (strong && has(run, 'master')) return;
    run.wpn.c -= 1;
    if (run.wpn.c > 0) return;
    var s = run.wpn.s;
    run.wpn = null;
    run.st.broke++;
    ev(res, 'broke', s);
    say(run, 'Оружие сломалось');
    if (has(run, 'mirror') && run.hero !== 'madman') run.shield = Math.min(cfg['shield.cap'], run.shield + s);
  }

  function fight(run, cfg, card, cell, res) {
    var def = enemyDef(run, card.e);
    var V = foeValue(run, cfg, card, cell);
    var S = strength(run, cfg);
    var hit = S;
    if (def.armour && S < V / 2) hit = Math.floor(S / 2);
    var dmg = skin(run, cfg, Math.max(0, V - hit));
    hurt(run, dmg, false);
    if (run.wpn) {
      wear(run, cfg, S >= V, res);
      for (var i = 0; i < (def.drain || 0) && run.wpn; i++) wear(run, cfg, false, res);
    }
    if (dmg === 0 && has(run, 'leech')) heal(run, cfg['seal.leech.heal']);
    run.st.kills++;
    if (!run.sim) {
      run.met = run.met || {};
      run.met[card.e] = 1;
    }
    var bounty = ruleSeal(run, 'bounty');
    if (bounty) loot(run, cfg, bounty, null, true);
    if (card.e === 'fly') run.under = { k: 'trap', v: cfg['enemy.fly.trap'], u: ++run.uid };
    else if (def.loot) run.under = { k: 'gold', v: def.loot, u: ++run.uid };
    ev(res, 'fight', dmg);
    say(run, def.title + ' ' + V + ': ' + (dmg ? '−' + dmg : 'без урона'));
  }

  function drink(run, cfg, v, res) {
    var n = v + (has(run, 'cauldron') ? cfg['seal.cauldron.plus'] : 0);
    if (run.hero === 'priestess') n = Math.round(n * cfg['hero.priestess.potion']);
    if (witch(run)) n = Math.floor(n * cfg['enemy.witch.potion']);
    run.st.potions++;
    if (has(run, 'hunger')) {
      run.maxHp += cfg['seal.hunger.max'];
      ev(res, 'max', cfg['seal.hunger.max']);
      say(run, 'Зелье: +' + cfg['seal.hunger.max'] + ' к наибольшему здоровью');
      return;
    }
    var before = run.hp;
    heal(run, n);
    ev(res, 'heal', run.hp - before);
    say(run, 'Зелье: +' + (run.hp - before));
  }

  function arm(run, cfg, s, c, res) {
    var charges = c + (has(run, 'grip') ? cfg['seal.grip.plus'] : 0) + ruleSeal(run, 'charges') +
      (run.hero === 'smith' ? cfg['hero.smith.charges'] : 0) - (run.hero === 'priestess' ? cfg['hero.priestess.charges'] : 0);
    charges = Math.max(1, charges);
    if (run.wpn && has(run, 'spare') && s < run.wpn.s) {
      run.wpn.c += cfg['seal.spare.plus'];
      ev(res, 'charge', cfg['seal.spare.plus']);
      say(run, 'Запасной клинок: +' + cfg['seal.spare.plus'] + ' заряд');
      return;
    }
    run.wpn = { s: s, c: charges, n: ++run.blades };
    ev(res, 'weapon', s);
    say(run, 'Оружие ' + s + '×' + charges);
  }

  function guard(run, cfg, v, res) {
    if (run.hero === 'madman') {
      say(run, 'Щит недоступен');
      return;
    }
    var before = run.shield;
    run.shield = Math.min(cfg['shield.cap'], run.shield + v + (has(run, 'bolt') ? cfg['seal.bolt.plus'] : 0));
    ev(res, 'shield', run.shield - before);
    say(run, 'Щит: +' + (run.shield - before));
  }

  function loot(run, cfg, v, res, quiet) {
    var n = v + (quiet ? 0 : has(run, 'piggy') ? cfg['seal.piggy.plus'] : 0);
    if (run.hero === 'thief') n = Math.round(n * cfg['hero.thief.gold']);
    run.gold += n;
    run.st.gold += n;
    ev(res, 'gold', n);
    if (!quiet) say(run, 'Золото: +' + n);
  }

  function trap(run, cfg, v, res) {
    if (has(run, 'sleep') && !run.slept) {
      run.slept = true;
      say(run, 'Чуткий сон: ловушка не сработала');
      return;
    }
    var d = skin(run, cfg, v);
    hurt(run, d, true);
    ev(res, 'trap', d);
    say(run, 'Ловушка: −' + d);
  }

  function offerSeals(run, cfg, r, count) {
    var weights = { c: cfg['seals.common'], r: cfg['seals.rare'], l: cfg['seals.legend'] };
    var pool = [];
    list('seals').forEach(function (s) { if (!has(run, s.id)) pool.push({ id: s.id, w: weights[s.rarity] || 0 }); });
    if (run.rule && run.rule.type === 'seal' && !has(run, 'rule')) pool.push({ id: 'rule', w: weights.r });
    var out = [];
    while (out.length < count && pool.length) {
      var p = r.weighted(pool, 'w');
      if (!p) break;
      out.push(p.id);
      pool.splice(pool.indexOf(p), 1);
    }
    return out;
  }

  function openChest(run, cfg, r, res) {
    var open = false;
    if (run.keys > 0) {
      run.keys--;
      open = true;
    } else if (has(run, 'lockpick') && !run.picked) {
      run.picked = true;
      open = true;
    }
    if (!open) {
      say(run, 'Сундук пуст: нет ключа');
      return;
    }
    ev(res, 'chest', 1);
    if (run.sim) {
      loot(run, cfg, cfg['chest.gold'], null, true);
      return;
    }
    run.pending = { type: 'chest', seals: offerSeals(run, cfg, r, cfg['chest.seals']), gold: cfg['chest.gold'] };
    run.phase = 'choice';
    say(run, 'Сундук открыт');
  }

  function altar(run, cfg, res) {
    if (run.sim) return;
    if (run.hp <= cfg['altar.cost']) {
      say(run, 'Алтарь: не хватает здоровья');
      return;
    }
    run.pending = { type: 'altar', cost: cfg['altar.cost'] };
    run.phase = 'choice';
    ev(res, 'altar', 1);
  }

  function trigger(run, cfg, card, cell, r, res) {
    var k = card.k;
    if (k === 'foe') fight(run, cfg, card, cell, res);
    else if (k === 'potion') drink(run, cfg, card.v, res);
    else if (k === 'weapon') arm(run, cfg, card.v, card.c, res);
    else if (k === 'shield') guard(run, cfg, card.v, res);
    else if (k === 'gold') loot(run, cfg, card.v, res, false);
    else if (k === 'trap') trap(run, cfg, card.v, res);
    else if (k === 'key') {
      run.keys++;
      ev(res, 'key', 1);
      say(run, 'Ключ');
    } else if (k === 'chest') openChest(run, cfg, r, res);
    else if (k === 'altar') altar(run, cfg, res);
    else if (k === 'whet') {
      if (run.wpn) run.wpn.c += card.v;
      ev(res, 'charge', card.v);
      say(run, run.wpn ? 'Точильный камень: +' + card.v + ' заряда' : 'Точильный камень: нет оружия');
    } else if (k === 'stairs') {
      res.done = 'stairs';
      say(run, 'Вниз по лестнице');
    }
  }

  // ---- the grid ---------------------------------------------------------------------------------------

  function draw(run) {
    if (run.blind) return { k: 'fog', u: ++run.uid };
    var c = run.deck.shift();
    if (!c) return null;
    c = stamp(run, c);
    if (c.k === 'stairs') run.stairsOut = true;
    if (run.peek > 0) run.peek--;
    return c;
  }

  /** The cell gets the top card of the deck; when the deck is out, the first empty cell gets the stairs. */
  function place(run, cfg, cell, r) {
    if (cfg['deal.place'] === 'random' && !run.blind) {
      var empty = [];
      for (var i = 0; i < 9; i++) if (i !== run.pos && !run.grid[i]) empty.push(i);
      if (empty.length) cell = r.pick(empty);
    }
    if (run.blind || run.deck.length) {
      run.grid[cell] = draw(run);
      return;
    }
    if (!run.stairsOut && !run.bossFloor) {
      run.grid[cell] = { k: 'stairs', u: ++run.uid };
      run.stairsOut = true;
    }
  }

  function leave(run, cfg, from, prev, r) {
    if (prev) {
      run.grid[from] = prev;
      return;
    }
    if (has(run, 'shadow')) {
      var d = run.delayed;
      run.delayed = from;
      if (d >= 0 && d !== run.pos && !run.grid[d]) place(run, cfg, d, r);
      return;
    }
    place(run, cfg, from, r);
  }

  function bite(run, cfg, res) {
    var cells = NB[run.pos].filter(function (c) { return isPredator(run, run.grid[c]); });
    if (!cells.length) return;
    if (has(run, 'quiet') && cells.length < cfg['seal.quiet.min']) return;
    var total = 0;
    cells.forEach(function (c) {
      var d = skin(run, cfg, cfg['predator.bite']);
      hurt(run, d, false);
      total += d;
      if (has(run, 'counter')) {
        var p = run.grid[c];
        p.v -= cfg['seal.counter.damage'];
        if (p.v <= 0) run.grid[c] = { k: 'gold', v: Math.max(1, p.v0 || 1), u: ++run.uid };
      }
    });
    run.st.bitten += total;
    ev(res, 'bite', total);
    say(run, 'Укусы хищников: −' + total);
  }

  function thievesNear(run) {
    var out = [];
    NB[run.pos].forEach(function (c) {
      var x = run.grid[c];
      if (x && x.k === 'foe' && x.e === 'thief') out.push({ cell: c, u: x.u });
    });
    return out;
  }

  function steal(run, cfg, r, res, near) {
    near.forEach(function (t) {
      var x = run.grid[t.cell];
      if (!x || x.u !== t.u || NB[run.pos].indexOf(t.cell) >= 0) return;
      var take = Math.min(run.gold, cfg['enemy.thief.steal']);
      run.gold -= take;
      run.grid[t.cell] = null;
      place(run, cfg, t.cell, r);
      ev(res, 'steal', take);
      say(run, 'Вор-тень унёс ' + take + ' золота');
    });
  }

  function bossCell(run) {
    for (var i = 0; i < 9; i++) if (run.grid[i] && run.grid[i].k === 'boss') return i;
    return -1;
  }

  function bossMoves(run, cfg, r) {
    var b = bossCell(run);
    if (b < 0) return;
    // Next to the hero the boss stands its ground: otherwise it could slip away for ever.
    if (cfg['boss.stayNear'] && NB[b].indexOf(run.pos) >= 0) return;
    var opts = NB[b].filter(function (c) { return c !== run.pos && run.grid[c]; });
    if (!opts.length) return;
    var t = r.pick(opts);
    var x = run.grid[t];
    run.grid[t] = run.grid[b];
    run.grid[b] = x;
  }

  function summon(run, cfg, r) {
    var cells = [];
    var i;
    for (i = 0; i < 9; i++) if (i !== run.pos && !run.grid[i]) cells.push(i);
    var others = [];
    for (i = 0; i < 9; i++) if (i !== run.pos && run.grid[i] && run.grid[i].k !== 'boss' && run.grid[i].k !== 'stairs') others.push(i);
    r.shuffle(cells);
    r.shuffle(others);
    cells = cells.concat(others);
    for (i = 0; i < cfg['boss.summonCount'] && i < cells.length; i++) {
      var c = cells[i];
      if (run.grid[c]) {
        var back = copy(run.grid[c]);
        delete back.u;
        run.deck.push(back);
      }
      run.grid[c] = { k: 'foe', e: 'rat', v: cfg['boss.ratV'], v0: cfg['boss.ratV'], u: ++run.uid };
    }
    say(run, 'Хозяин позвал крыс');
  }

  function hitBoss(run, cfg, card, cell, power, r, res) {
    card.hp -= Math.max(cfg['boss.fist'], power);
    if (card.hp <= 0) {
      run.grid[cell] = null;
      res.done = 'boss';
      say(run, 'Хозяин глубины повержен');
      return;
    }
    if (!card.summoned && card.hp <= Math.round(card.hp0 * cfg['boss.summonAt'] / cfg['boss.hp'])) {
      card.summoned = true;
      summon(run, cfg, r);
    }
  }

  function bossFight(run, cfg, card, cell, r, res) {
    var S = strength(run, cfg);
    var H = bossHit(run, cfg);
    var dmg = skin(run, cfg, Math.max(0, H - S));
    hurt(run, dmg, false);
    var serial = run.wpn ? run.wpn.n : 0;
    if (run.bossBlade === 0) run.bossBlade = serial || -1;
    else if (run.bossBlade !== serial) run.bossBlade = -1;
    if (run.wpn) wear(run, cfg, S >= H, res);
    ev(res, 'boss', dmg);
    say(run, 'Бой с хозяином: −' + dmg + ' вам, −' + Math.max(cfg['boss.fist'], S) + ' ему');
    hitBoss(run, cfg, card, cell, S, r, res);
  }

  function mortal(run, cfg, res) {
    if (run.hp > 0) return;
    if (has(run, 'last') && !run.lastUsed) {
      run.lastUsed = true;
      run.hp = cfg['seal.last.hp'];
      if (run.hero !== 'madman') run.shield = Math.max(run.shield, Math.min(cfg['shield.cap'], cfg['seal.last.shield']));
      ev(res, 'last', 1);
      say(run, 'Последний вдох');
      return;
    }
    run.dead = true;
    res.dead = true;
    say(run, 'Герой погиб');
  }

  function after(run, cfg, r, res, near) {
    var skip = false;
    if (run.dbl === 2) {
      run.dbl = 1;
      skip = true;
    } else if (run.dbl === 1) run.dbl = 0;
    if (run.silence > 0) {
      run.silence--;
      skip = true;
    }
    if (!skip) bite(run, cfg, res);
    for (var i = 0; i < 9; i++) {
      var x = run.grid[i];
      if (x && x.k === 'foe' && x.e === 'root') x.v += cfg['enemy.root.grow'];
    }
    steal(run, cfg, r, res, near);
    bossMoves(run, cfg, r);
    mortal(run, cfg, res);
  }

  /**
   * The hero steps to the neighbouring cell `to` (o.quiet — «Пустой шаг»: the card does not fire
   * and stays). Works on a run (the game's or a bot's copy). {ok, ev, done: 'stairs'|'boss', dead}.
   */
  function step(run, cfg, to, r, o) {
    o = o || {};
    var res = { ok: false, ev: [] };
    if (run.phase !== 'play') {
      res.why = 'phase';
      return res;
    }
    if (NB[run.pos].indexOf(to) < 0) {
      res.why = 'far';
      return res;
    }
    var card = run.grid[to];
    if (o.quiet && card && card.k === 'boss') {
      res.why = 'boss';
      return res;
    }
    res.ok = true;
    var near = thievesNear(run);
    run.st.moves++;
    run.fm = (run.fm || 0) + 1;
    var from = run.pos;
    if (card && card.k === 'boss') {
      bossFight(run, cfg, card, to, r, res);
      if (res.done) {
        mortal(run, cfg, res);
        if (res.dead) res.done = null;
        return res;
      }
    } else {
      var prev = run.under;
      run.under = null;
      run.pos = to;
      run.grid[to] = null;
      if (card) {
        if (o.quiet) {
          run.under = card;
          say(run, 'Пустой шаг: ' + cardTitle(run, card));
        } else trigger(run, cfg, card, to, r, res);
      }
      if (res.done) return res;
      leave(run, cfg, from, prev, r);
    }
    after(run, cfg, r, res, near);
    return res;
  }

  // ---- a floor ----------------------------------------------------------------------------------------

  function range(cfg, key, f) {
    var lo = Math.round(cfg[key + '.lo'] + cfg[key + '.growLo'] * (f - 1));
    var hi = Math.round(cfg[key + '.hi'] + cfg[key + '.growHi'] * (f - 1));
    return [lo, Math.max(lo, hi)];
  }

  function depthEnemy(run, cfg) {
    return (run.depth >= 1 ? cfg['depth.enemyPlus'] : 0) + (run.depth >= 8 ? cfg['depth.enemyPlus2'] : 0);
  }

  function pool(run, cfg, f) {
    var fk = Math.min(f, cfg['floors.count']);
    var predFrom = run.depth >= 3 ? 1 : cfg['predators.from'];
    var out = [];
    list('enemies').forEach(function (d) {
      if (fk < d.floors[0] || fk > d.floors[1]) return;
      if (d.predator && fk < predFrom) return;
      if (d.armour && fk < cfg['armour.from']) return;
      var w = cfg['enemy.' + d.id + '.weight'];
      if (w > 0) out.push({ def: d, w: w });
    });
    if (run.rule && run.rule.type === 'enemy' && fk >= 2) out.push({ def: run.rule, w: cfg['rule.weight'] });
    if (!out.length) out.push({ def: item('enemies', 'mold'), w: 1 });
    return out;
  }

  function foeCard(run, cfg, f, def, fr) {
    var lo = cfg['enemy.lo.base'] + cfg['enemy.lo.perFloor'] * f;
    var hi = cfg['enemy.hi.base'] + cfg['enemy.hi.perFloor'] * f;
    var span = cfg['enemy.' + def.id + '.span'];
    if (typeof span === 'number' && span >= 0) hi = Math.min(hi, lo + span);
    var v = fr.int(lo, Math.max(lo, hi)) + depthEnemy(run, cfg) + (def.power || 0);
    return { k: 'foe', e: def.id, v: v, v0: v };
  }

  function usefulCard(run, cfg, f, fr) {
    var wp = cfg['mix.potion'] * (run.depth >= 2 ? cfg['depth.potionFactor'] : 1);
    var t = fr.weighted(['potion', 'weapon', 'shield', 'gold'], [wp, cfg['mix.weapon'], cfg['mix.shield'], cfg['mix.gold']]);
    if (t === 'weapon') {
      var s = range(cfg, 'weapon', f);
      return { k: 'weapon', v: fr.int(s[0], s[1]), c: fr.int(cfg['weapon.cLo'], Math.max(cfg['weapon.cLo'], cfg['weapon.cHi'])) };
    }
    var r = range(cfg, t, f);
    return { k: t, v: fr.int(r[0], r[1]) };
  }

  function otherCard(run, cfg, f, fr) {
    var trapsFrom = run.depth >= 7 ? 1 : cfg['traps.from'];
    var kinds = ['altar'];
    var weights = [cfg['mix.altar']];
    if (f >= trapsFrom) {
      kinds.push('trap');
      weights.push(cfg['mix.trap']);
    }
    if (f >= cfg['traps.from']) {
      kinds.push('key', 'chest');
      weights.push(cfg['mix.key'], cfg['mix.chest']);
    }
    var t = fr.weighted(kinds, weights) || 'altar';
    if (t === 'trap') {
      var r = range(cfg, 'trap', f);
      return { k: 'trap', v: fr.int(r[0], r[1]) + (run.depth >= 7 ? cfg['depth.trapPlus'] : 0) };
    }
    return { k: t };
  }

  function kindCard(cfg, id) {
    var d = item('kind', id);
    if (!d) return null;
    if (d.card === 'weapon') return { k: 'weapon', v: cfg['kind.' + id + '.s'], c: cfg['kind.' + id + '.c'], kind: id };
    if (d.card === 'key') return { k: 'key', kind: id };
    return { k: d.card, v: cfg['kind.' + id + '.v'], kind: id };
  }

  function bossFloor(run, cfg) {
    var n = cfg['floors.count'];
    return run.floor === n || (run.floor > n && (run.floor - n) % cfg['endless.bossEvery'] === 0);
  }

  /** The cards of the floor, the grid dealt, the stairs shuffled in, the fairness check run. */
  function makeFloor(run, cfg) {
    var f = run.floor;
    var fr = Rng.make(Rng.hash(run.seed + ':floor:' + f));
    var n = cfg['floors.count'];
    var fk = Math.min(f, n);
    var boss = bossFloor(run, cfg);
    var size = f <= n ? cfg['floor.' + f + '.size'] : cfg['endless.size'];
    var field = boss ? 7 : 8;
    var total = size + field;
    var nE = Math.round(total * cfg['floor.' + fk + '.enemies'] / 100);
    var nU = Math.round(total * cfg['floor.' + fk + '.useful'] / 100);
    var nO = Math.max(0, total - nE - nU);
    if (run.depth >= 9) nE += cfg['depth.longPlus'];
    var p = pool(run, cfg, f);
    var cards = [];
    var i;
    for (i = 0; i < nE; i++) cards.push(foeCard(run, cfg, f, fr.weighted(p, 'w').def, fr));
    for (i = 0; i < nU; i++) cards.push(usefulCard(run, cfg, f, fr));
    for (i = 0; i < nO; i++) cards.push(otherCard(run, cfg, f, fr));
    fr.shuffle(cards);
    var top = cards.slice(0, field);
    var deck = cards.slice(field);
    run.kinds.forEach(function (id) {
      var kc = kindCard(cfg, id);
      if (kc) deck.splice(fr.int(0, deck.length), 0, kc);
    });
    // «Заряд от шагов»: the first card of the first floor's deck — it lands behind the hero at the first step.
    if (f === 1 && run.charge) deck.unshift({ k: 'potion', v: cfg['charge.potion'], charge: true });
    run.stairsOut = false;
    run.bossFloor = boss;
    if (!boss && (has(run, 'breath') || fr.chance(cfg['stairs.deckChance']))) {
      var len = deck.length;
      var lo = Math.ceil(len * 2 / 3);
      var hi = len;
      if (has(run, 'breath')) {
        var k2 = 1 - cfg['seal.breath.earlier'];
        lo = Math.floor(lo * k2);
        hi = Math.floor(hi * k2);
      }
      deck.splice(fr.int(lo, Math.max(lo, hi)), 0, { k: 'stairs' });
    }
    run.grid = [null, null, null, null, null, null, null, null, null];
    run.pos = 4;
    var cells = [0, 1, 2, 3, 5, 6, 7, 8];
    if (boss) {
      var bc = fr.pick([0, 2, 6, 8]);
      var hp = bossHp(run, cfg);
      run.grid[bc] = { k: 'boss', hp: hp, hp0: hp, u: ++run.uid };
      cells.splice(cells.indexOf(bc), 1);
    }
    cells.forEach(function (c, j) { if (top[j]) run.grid[c] = stamp(run, top[j]); });
    run.deck = deck;
    run.under = null;
    run.delayed = -1;
    run.peek = 0;
    run.silence = 0;
    run.dbl = 0;
    run.slept = false;
    run.picked = false;
    run.bossBlade = 0;
    run.fm = 0;
    run.pending = null;
    run.shop = null;
    run.hand.forEach(function (g) { g.used = 0; });
    heal(run, ruleSeal(run, 'heal'));
    var rg = ruleSeal(run, 'guard');
    if (rg && run.hero !== 'madman') run.shield = Math.min(cfg['shield.cap'], run.shield + rg);
    fairness(run, cfg);
    say(run, 'Этаж ' + f + ' — ' + floorTitle(cfg, f));
  }

  // ---- fairness: a simple bot plays the floor many times ---------------------------------------------------

  /** The simple bot's quick worth of stepping to `to`, without copying anything. */
  function quick(run, cfg, to) {
    var c = run.grid[to];
    var v = 0;
    if (c) {
      var k = c.k;
      if (k === 'foe') {
        var V = foeValue(run, cfg, c, to);
        var S = strength(run, cfg);
        var hit = enemyDef(run, c.e).armour && S < V / 2 ? Math.floor(S / 2) : S;
        var d = Math.max(0, V - hit);
        v = d >= run.hp + run.shield ? -100 : -d - (run.wpn ? 0.5 : 0);
      } else if (k === 'boss') v = 6 - Math.max(0, bossHit(run, cfg) - strength(run, cfg));
      else if (k === 'potion') v = Math.min(c.v, run.maxHp - run.hp) + 0.5;
      else if (k === 'weapon') v = (c.v * c.c - (run.wpn ? strength(run, cfg) * run.wpn.c : 0)) * 0.3 + (run.wpn ? 0 : 2);
      else if (k === 'shield') v = run.hero === 'madman' ? 0 : Math.min(c.v, cfg['shield.cap'] - run.shield) * 0.8;
      else if (k === 'gold') v = 0.3;
      else if (k === 'trap') v = -c.v;
      else if (k === 'stairs') v = 3;
      else if (k === 'key') v = 0.5;
      else if (k === 'chest') v = run.keys ? 1.5 : 0;
      else if (k === 'whet') v = run.wpn ? 1 : 0;
    }
    var bites = 0;
    NB[to].forEach(function (x) { if (x !== to && isPredator(run, run.grid[x])) bites++; });
    return v - bites;
  }

  function simpleChoice(run, cfg, br) {
    var n = NB[run.pos];
    if (br.chance(cfg['fair.random'])) return br.pick(n);
    var best = n[0];
    var bestV = -1e9;
    n.forEach(function (c) {
      var v = quick(run, cfg, c) + br.next() * 0.01;
      if (v > bestV) {
        bestV = v;
        best = c;
      }
    });
    return best;
  }

  function cloneRun(run, blind) {
    var c = {};
    for (var k in run) c[k] = run[k];
    c.grid = run.grid.map(function (x) { return copy(x); });
    c.deck = run.deck.slice();
    c.wpn = run.wpn ? { s: run.wpn.s, c: run.wpn.c, n: run.wpn.n } : null;
    c.under = copy(run.under);
    c.st = copy(run.st);
    c.hand = run.hand.map(function (x) { return copy(x); });
    c.pending = null;
    c.log = null;
    c.sim = true;
    c.blind = !!blind;
    return c;
  }

  /** One play of the floor by the simple bot from the hero's state now: true when it gets down alive. */
  function simFloor(run, cfg, br) {
    var s = cloneRun(run, false);
    var max = cfg['fair.maxMoves'];
    for (var i = 0; i < max; i++) {
      var res = step(s, cfg, simpleChoice(s, cfg, br), br);
      if (res.dead || s.hp <= 0) return false;
      if (res.done) return true;
    }
    return false;
  }

  function soften(run, cfg) {
    var r = range(cfg, 'potion', run.floor);
    var potion = { k: 'potion', v: r[1], fair: true };
    var best = -1;
    var bestV = -1;
    run.deck.forEach(function (c, i) {
      if (c.k === 'foe' && c.v > bestV) {
        best = i;
        bestV = c.v;
      }
    });
    if (best >= 0) {
      run.deck[best] = potion;
      return true;
    }
    for (var i = 0; i < 9; i++) {
      var x = run.grid[i];
      if (x && x.k === 'foe' && x.v > bestV) {
        best = i;
        bestV = x.v;
      }
    }
    if (best < 0) return false;
    run.grid[best] = stamp(run, potion);
    return true;
  }

  function fairness(run, cfg) {
    var runs = cfg['fair.runs'];
    run.fair = null;
    if (!(runs > 0) || run.sim) return;
    var fixed = 0;
    for (var t = 0; ; t++) {
      var br = Rng.make(Rng.hash(run.seed + ':fair:' + run.floor + ':' + t));
      var alive = 0;
      for (var i = 0; i < runs; i++) if (simFloor(run, cfg, br)) alive++;
      run.fair = { rate: Math.round(alive / runs * 1000) / 1000, fixed: fixed };
      if (alive / runs >= cfg['fair.min'] || t >= cfg['fair.maxFix']) return;
      if (!soften(run, cfg)) return;
      fixed++;
    }
  }

  // ---- gifts --------------------------------------------------------------------------------------------

  function giftPower(cfg, g) { return cfg['gift.' + g.id + '.base'] + cfg['gift.' + g.id + '.step'] * (g.lvl || 0); }

  function giftUses(run, cfg, g) {
    var u = MULTI[g.id] ? Math.max(1, Math.floor(giftPower(cfg, g))) : 1;
    return u * (run && has(run, 'echo') ? cfg['seal.echo.times'] : 1);
  }

  /** The cells a gift of the hand can be used on (`first` — the first card already chosen for «Обмен»). */
  function targets(run, cfg, i, first) {
    var g = run.hand[i];
    if (!g || run.phase !== 'play') return [];
    var d = item('gifts', g.id);
    if (!d) return [];
    if (d.target === 'self') {
      if (g.id === 'whet' && !run.wpn) return [];
      return [run.pos];
    }
    var out = [];
    for (var c = 0; c < 9; c++) {
      if (c === run.pos) continue;
      var x = run.grid[c];
      if (d.target === 'two' || d.target === 'card') {
        if (x && c !== first) out.push(c);
      } else if (d.target === 'foe') {
        if (x && x.k === 'foe') out.push(c);
      } else if (d.target === 'far') {
        if (x && (x.k === 'foe' || x.k === 'boss')) out.push(c);
      } else if (d.target === 'near') {
        if (NB[run.pos].indexOf(c) >= 0 && !(x && x.k === 'boss')) out.push(c);
      }
    }
    return out;
  }

  function shoot(run, cfg, a, power, r, res) {
    var x = run.grid[a];
    var S = strength(run, cfg) + power;
    if (x.k === 'boss') {
      if (run.wpn) wear(run, cfg, S >= bossHit(run, cfg), res);
      say(run, 'Удар издали по хозяину: −' + Math.max(cfg['boss.fist'], S));
      hitBoss(run, cfg, x, a, S, r, res);
      return;
    }
    var V = foeValue(run, cfg, x, a);
    if (run.wpn) wear(run, cfg, S >= V, res);
    if (V <= S) {
      run.st.kills++;
      run.grid[a] = null;
      if (x.e === 'fly') run.grid[a] = { k: 'trap', v: cfg['enemy.fly.trap'], u: ++run.uid };
      else place(run, cfg, a, r);
      say(run, 'Удар издали: ' + enemyDef(run, x.e).title + ' убит');
    } else {
      x.v -= S;
      say(run, 'Удар издали: ' + enemyDef(run, x.e).title + ' ранен');
    }
  }

  /** Uses the gift `i` of the hand on `cells` (none for the hero's own gifts, two for «Обмен»). */
  function gift(run, cfg, i, cells, r) {
    var res = { ok: false, ev: [] };
    if (run.phase !== 'play') return res;
    var g = run.hand[i];
    if (!g || g.used >= giftUses(run, cfg, g)) {
      res.why = 'used';
      return res;
    }
    var d = item('gifts', g.id);
    var p = giftPower(cfg, g);
    cells = cells || [];
    var a = cells[0];
    var tg = targets(run, cfg, i);
    if (d.target !== 'self' && tg.indexOf(a) < 0) return res;
    if (d.target === 'self' && !tg.length) return res;
    if (g.id === 'swap') {
      if (targets(run, cfg, i, a).indexOf(cells[1]) < 0) return res;
      var t = run.grid[a];
      run.grid[a] = run.grid[cells[1]];
      run.grid[cells[1]] = t;
      say(run, 'Обмен');
    } else if (g.id === 'horseshoe') {
      var x = run.grid[a];
      var gold = Math.max(1, Math.round(foeValue(run, cfg, x, a) * p));
      run.grid[a] = { k: 'gold', v: gold, u: ++run.uid };
      say(run, 'Подкова: ' + enemyDef(run, x.e).title + ' стал золотом ' + gold);
    } else if (g.id === 'empty') {
      var rs = step(run, cfg, a, r, { quiet: true });
      if (!rs.ok) return rs;
      g.used++;
      run.st.gifts++;
      rs.gift = g.id;
      return rs;
    } else if (g.id === 'sip') {
      heal(run, p);
      say(run, 'Глоток: +' + p);
    } else if (g.id === 'whet') {
      run.wpn.c += p;
      say(run, 'Точило: +' + p + ' заряда');
    } else if (g.id === 'glance') {
      run.peek = Math.max(run.peek, p);
      say(run, 'Взгляд в колоду');
    } else if (g.id === 'shot') {
      shoot(run, cfg, a, p, r, res);
    } else if (g.id === 'silence') {
      run.silence = Math.max(run.silence, p);
      say(run, 'Тишина: ' + p + ' ' + plural(p, 'ход', 'хода', 'ходов'));
    } else if (g.id === 'squeeze') {
      var y = run.grid[a];
      run.grid[a] = null;
      var back = copy(y);
      delete back.u;
      run.deck.push(back);
      if (y.k === 'stairs') run.stairsOut = false;
      place(run, cfg, a, r);
      say(run, 'Сжатие: ' + cardTitle(run, y) + ' — в низ колоды');
    } else if (g.id === 'double') {
      run.dbl = 2;
      say(run, 'Двойной шаг');
    }
    g.used++;
    run.st.gifts++;
    res.ok = true;
    res.gift = g.id;
    if (res.done) mortal(run, cfg, res);
    return res;
  }

  // ---- the state: meta, runs, the engine's contract -------------------------------------------------------

  function freshMeta() {
    return {
      embers: 0,
      shop: { gifts: [], lv: {}, slots: 0, fort: 0, blade: 0 },
      unlocked: { guard: true },
      album: { seals: {}, foes: {} },
      rec: { runs: 0, wins: 0, bestFloor: 0, floors: 0, broke: 0, bosses: 0, deepest: 0, noPotion: 0, oneBlade: 0, embers: 0, firstWinRun: 0 },
      pref: { hero: 'guard', depth: 0, hand: [], kinds: ['smith', 'hearth'], charge: false, rules: true },
      daily: { day: '', best: 0, tries: 0 },
      ascend: false
    };
  }

  /** Fills what an older or a fresh save lacks; every action calls it first. */
  function ensure(state) {
    var m = state.meta = state.meta && typeof state.meta === 'object' ? state.meta : {};
    var f = freshMeta();
    for (var k in f) if (m[k] === undefined || m[k] === null) m[k] = f[k];
    ['shop', 'rec', 'pref', 'album', 'daily'].forEach(function (key) {
      for (var x in f[key]) if (m[key][x] === undefined || m[key][x] === null) m[key][x] = f[key][x];
    });
    if (!state.run || typeof state.run !== 'object' || !state.run.phase) state.run = { phase: 'hub' };
    state.layers = state.layers || {};
    return state;
  }

  function embers(state) { return num(state.meta && state.meta.embers); }

  function unlockedDepth(state) { return num(state.layers && state.layers[LAYER] ? state.layers[LAYER].currency : 0); }

  function slots(state, cfg) { return cfg['slots.base'] + (state.meta.shop.slots || 0); }

  function handSize(cfg) { return Math.max(1, cfg['hand.size']); }

  function handOf(state, cfg) {
    var s = state.meta.shop;
    var pick = state.meta.pref.hand.filter(function (id, i, a) { return s.gifts.indexOf(id) >= 0 && a.indexOf(id) === i; });
    s.gifts.forEach(function (id) { if (pick.length < handSize(cfg) && pick.indexOf(id) < 0) pick.push(id); });
    return pick.slice(0, handSize(cfg)).map(function (id) { return { id: id, lvl: s.lv[id] || 0, used: 0 }; });
  }

  function kindsOf(state, cfg) {
    return state.meta.pref.kinds.filter(function (id, i, a) { return item('kind', id) && a.indexOf(id) === i; }).slice(0, slots(state, cfg));
  }

  /** A rule of the model's stock (or a procedural one) as the run uses it. */
  function ruleOf(it) {
    if (!it || validateRule(it, null)) return null;
    var r = { type: it.type, id: 'rule', title: String(it.title), text: String(it.text), brick: it.brick, value: it.value };
    if (it.type === 'enemy') {
      r.predator = it.brick === 'bite';
      r.armour = it.brick === 'armour';
      r.power = it.brick === 'power' ? it.value : 0;
      r.drain = it.brick === 'drain' ? it.value : 0;
      r.loot = it.brick === 'loot' ? it.value * 2 : 0;
    }
    return r;
  }

  function init(ctx) {
    return { run: { phase: 'hub' }, layers: {}, meta: freshMeta() };
  }

  /**
   * A new descent: o = {seed, day ('2026-11-14' for the descent of the day), charge (the steps were
   * spent), rule (an item of the stock)}. The hero, depth, hand and kind cards come from meta.pref.
   */
  function startRun(state, cfg, o) {
    ensure(state);
    o = o || {};
    var m = state.meta;
    var pref = m.pref;
    if (state.run.phase !== 'hub' && state.run.phase !== 'over') return { ok: false, why: 'забег уже идёт' };
    var hero = m.unlocked[pref.hero] && item('heroes', pref.hero) ? pref.hero : 'guard';
    var depth = o.day ? 0 : Math.max(0, Math.min(Math.floor(num(pref.depth)), unlockedDepth(state)));
    var seed = o.day ? Rng.hash(ID + ':' + o.day) : (Number(o.seed) >>> 0) || 1;
    var hp = cfg['hero.' + hero + '.hp'] + m.shop.fort * cfg['shop.fort.hp'] - (depth >= 5 ? cfg['depth.hpMinus'] : 0);
    hp = Math.max(1, hp);
    var run = {
      phase: 'play', seed: seed, rs: Rng.hash('run:' + seed), day: o.day || '', hero: hero, depth: depth, floor: 1,
      hp: hp, maxHp: hp, shield: 0, wpn: null, gold: 0, keys: hero === 'thief' ? cfg['hero.thief.keys'] : 0, blades: 0, uid: 0,
      grid: [], pos: 4, under: null, deck: [], stairsOut: false, bossFloor: false, peek: 0, delayed: -1, silence: 0, dbl: 0,
      slept: false, picked: false, bossBlade: 0, lastUsed: false, dead: false, won: false, endless: false,
      hand: handOf(state, cfg), seals: [], kinds: kindsOf(state, cfg), charge: !!o.charge, rule: ruleOf(o.rule),
      st: { moves: 0, kills: 0, potions: 0, floors: 0, bosses: 0, gold: 0, damage: 0, bitten: 0, broke: 0, gifts: 0, choices: 0 },
      log: [], news: [], met: {}, pending: null, shop: null, fair: null, result: null
    };
    if (m.shop.blade) arm(run, cfg, cfg['shop.blade.s'], cfg['shop.blade.c'], null);
    run.log = [];
    makeFloor(run, cfg);
    state.run = run;
    m.rec.runs++;
    return { ok: true };
  }

  function takeSeal(state, cfg, id) {
    var run = state.run;
    if (has(run, id)) return;
    run.seals.push(id);
    var album = state.meta.album.seals;
    album[id] = (album[id] || 0) + 1;
    if (id === 'belt') {
      run.maxHp += cfg['seal.belt.max'];
      run.hp += cfg['seal.belt.max'];
    }
    var mh = ruleSeal(run, 'maxhp');
    if (id === 'rule' && mh) {
      run.maxHp += mh;
      run.hp += mh;
    }
    say(run, 'Печать: ' + sealTitle(run, id));
    if (id === 'hand') {
      var open = state.meta.shop.gifts.filter(function (g) { return !run.hand.some(function (h) { return h.id === g; }); });
      if (open.length) {
        run.pending = { type: 'gift', options: open, back: run.phase, left: Math.max(1, cfg['seal.hand.plus']) };
        run.phase = 'gift';
      }
    }
  }

  function sealTitle(run, id) {
    if (id === 'rule') return run.rule ? run.rule.title : 'Печать';
    var s = item('seals', id);
    return s ? s.title : id;
  }

  function nextFloor(state, cfg) {
    var run = state.run;
    run.floor++;
    run.phase = 'play';
    makeFloor(run, cfg);
  }

  function toSeals(state, cfg) {
    var run = state.run;
    var r = Rng.make(run.rs);
    var offers = offerSeals(run, cfg, r, cfg['seals.offer']);
    run.rs = r.state();
    run.pending = offers.length ? { type: 'seal', seals: offers } : null;
    run.phase = offers.length ? 'seal' : 'rest';
  }

  function win(state, cfg) {
    var run = state.run;
    var m = state.meta;
    run.won = true;
    m.rec.wins++;
    if (!m.rec.firstWinRun) m.rec.firstWinRun = m.rec.runs;
    if (!m.unlocked.madman) {
      m.unlocked.madman = true;
      run.news.push('madman');
    }
    if (run.st.potions === 0) m.rec.noPotion++;
    if (run.bossBlade > 0) m.rec.oneBlade++;
    if (!run.day && run.depth >= unlockedDepth(state) && unlockedDepth(state) < cfg['depth.max']) m.ascend = true;
  }

  function unlocks(state, cfg) {
    var run = state.run;
    var m = state.meta;
    function open(id) {
      if (m.unlocked[id]) return;
      m.unlocked[id] = true;
      run.news.push(id);
    }
    if (run.st.floors >= cfg['unlock.thief.floors']) open('thief');
    if (run.st.floors >= cfg['unlock.priestess.floors']) open('priestess');
    if (m.rec.broke + run.st.broke >= cfg['hero.smith.unlock']) open('smith');
  }

  function floorDone(state, cfg, res) {
    var run = state.run;
    var m = state.meta;
    run.st.floors++;
    m.rec.floors++;
    if (res.done === 'boss') {
      run.st.bosses++;
      m.rec.bosses++;
    }
    unlocks(state, cfg);
    if (res.done === 'boss' && run.floor === cfg['floors.count'] && !run.won) {
      win(state, cfg);
      run.phase = 'won';
      run.pending = null;
      return;
    }
    toSeals(state, cfg);
  }

  function embersOf(run, cfg, mult) {
    var gold = cfg['embers.goldFrom'] === 'earned' ? run.st.gold : run.gold;
    var fromGold = Math.floor(Math.max(0, gold) / cfg['embers.goldPer']);
    var fromFloors = run.st.floors * cfg['embers.floor'];
    var fromBoss = run.st.bosses * cfg['embers.boss'];
    var base = fromGold + fromFloors + fromBoss;
    var depthMult = 1 + run.depth * cfg['depth.bonus'];
    var m = mult > 0 ? mult : 1;
    return { gold: fromGold, floors: fromFloors, boss: fromBoss, base: base, depth: depthMult, mult: m, total: Math.floor(base * depthMult * m + 1e-9) };
  }

  /** The end of a descent (death, giving up, taking the win): embers, records, the result sheet. */
  function endRun(state, cfg, why, mult) {
    var run = state.run;
    var m = state.meta;
    unlocks(state, cfg);
    var e = embersOf(run, cfg, mult);
    m.embers = embers(state) + e.total;
    m.rec.embers += e.total;
    m.rec.broke += run.st.broke;
    m.rec.bestFloor = Math.max(m.rec.bestFloor, run.floor);
    for (var f in run.met || {}) m.album.foes[f] = (m.album.foes[f] || 0) + 1;
    if (run.won) m.rec.deepest = Math.max(m.rec.deepest, run.floor);
    var best = 0;
    if (run.day) {
      if (m.daily.day !== run.day) m.daily = { day: run.day, best: 0, tries: 0 };
      m.daily.tries++;
      best = m.daily.best;
      m.daily.best = Math.max(m.daily.best, run.st.floors);
    }
    run.result = {
      why: why, won: run.won, floor: run.floor, floors: run.st.floors, gold: run.gold, embers: e, news: run.news.slice(),
      day: run.day, dayBest: best, moves: run.st.moves, kills: run.st.kills, choices: run.st.choices, depth: run.depth
    };
    run.phase = 'over';
    run.pending = null;
    run.shop = null;
  }

  function settle(state, cfg, res, mult) {
    if (!res || !res.ok) return;
    if (res.dead) {
      endRun(state, cfg, 'dead', mult);
      res.over = true;
      return;
    }
    if (res.done) floorDone(state, cfg, res);
  }

  /** A step on the grid (the screen: g.act(s => sim.move(s, g.config, cell, g.links.mult()))). */
  function move(state, cfg, to, mult) {
    ensure(state);
    var run = state.run;
    if (run.phase !== 'play') return { ok: false, ev: [], why: 'phase' };
    var r = Rng.make(run.rs);
    var res = step(run, cfg, to, r);
    run.rs = r.state();
    settle(state, cfg, res, mult);
    return res;
  }

  function useGift(state, cfg, i, cells, mult) {
    ensure(state);
    var run = state.run;
    if (run.phase !== 'play') return { ok: false, ev: [] };
    var r = Rng.make(run.rs);
    var res = gift(run, cfg, i, cells, r);
    run.rs = r.state();
    settle(state, cfg, res, mult);
    return res;
  }

  /** The choice in the middle of a floor: a chest (0, 1 — seals, anything else — gold) or an altar (0 — give, 1 — pass). */
  function choose(state, cfg, i) {
    ensure(state);
    var run = state.run;
    if (run.phase !== 'choice' || !run.pending) return { ok: false };
    var p = run.pending;
    run.pending = null;
    run.phase = 'play';
    run.st.choices++;
    if (p.type === 'chest') {
      if (i >= 0 && i < p.seals.length) takeSeal(state, cfg, p.seals[i]);
      else loot(run, cfg, p.gold, null, true);
    } else if (p.type === 'altar' && i === 0) {
      run.hp -= p.cost;
      if (run.wpn) {
        run.wpn.s += cfg['altar.strength'];
        run.wpn.c += cfg['altar.charges'];
      } else run.wpn = { s: cfg['altar.strength'], c: cfg['altar.charges'], n: ++run.blades };
      say(run, 'Алтарь: оружие ' + run.wpn.s + '×' + run.wpn.c);
    }
    return { ok: true };
  }

  function pickSeal(state, cfg, i) {
    ensure(state);
    var run = state.run;
    if (run.phase !== 'seal') return { ok: false };
    var opts = run.pending ? run.pending.seals : [];
    run.pending = null;
    run.phase = 'rest';
    run.st.choices++;
    if (i >= 0 && i < opts.length) takeSeal(state, cfg, opts[i]);
    return { ok: true };
  }

  /** «Вторая рука»: one more gift of the open ones into the hand. */
  function pickGift(state, cfg, i) {
    ensure(state);
    var run = state.run;
    if (run.phase !== 'gift' || !run.pending) return { ok: false };
    var p = run.pending;
    var id = p.options[i];
    if (id) {
      run.hand.push({ id: id, lvl: state.meta.shop.lv[id] || 0, used: 0 });
      p.options.splice(i, 1);
      p.left = (p.left || 1) - 1;
      if (p.left > 0 && p.options.length) return { ok: true };
    }
    run.pending = null;
    run.phase = p.back || 'play';
    return { ok: true };
  }

  function shopMult(run, cfg) {
    return (has(run, 'greed') ? 1 - cfg['seal.greed.discount'] : 1) * (run.depth >= 6 ? cfg['depth.shopMult'] : 1);
  }

  function price(run, cfg, base) { return Math.max(1, Math.round((base + cfg['shop.perFloor'] * run.floor) * shopMult(run, cfg))); }

  function makeShop(run, cfg) {
    var f = run.floor;
    return {
      items: [
        { t: 'potion', v: cfg['shop.potion.v'], price: price(run, cfg, cfg['shop.potion.price']) },
        { t: 'potion', v: cfg['shop.bigPotion.v'], price: price(run, cfg, cfg['shop.bigPotion.price']) },
        { t: 'weapon', v: cfg['shop.weapon.s'] + f, c: cfg['shop.weapon.c'], price: price(run, cfg, cfg['shop.weapon.price'] + cfg['shop.weapon.perFloor'] * f) },
        { t: 'whet', v: cfg['shop.whet.v'], price: price(run, cfg, cfg['shop.whet.price']) },
        { t: 'swap', price: price(run, cfg, cfg['shop.swap.price']) }
      ]
    };
  }

  /** The rest stop: 'heal' (+rest.heal health, then the next floor) or 'shop'. */
  function rest(state, cfg, what) {
    ensure(state);
    var run = state.run;
    if (run.phase !== 'rest') return { ok: false };
    run.st.choices++;
    if (what === 'shop') {
      run.phase = 'shop';
      run.shop = makeShop(run, cfg);
      return { ok: true };
    }
    heal(run, cfg['rest.heal']);
    say(run, 'Привал: +' + cfg['rest.heal'] + ' здоровья');
    nextFloor(state, cfg);
    return { ok: true };
  }

  /** Buys the shop's item i; «Обмен дара» takes o = {hand: index in the hand, gift: id of an open gift}. */
  function shopBuy(state, cfg, i, o) {
    ensure(state);
    var run = state.run;
    if (run.phase !== 'shop' || !run.shop) return { ok: false };
    var it = run.shop.items[i];
    if (!it || it.sold) return { ok: false, why: 'нет товара' };
    if (run.gold < it.price) return { ok: false, why: 'мало золота' };
    if (it.t === 'whet' && !run.wpn) return { ok: false, why: 'нет оружия' };
    if (it.t === 'swap') {
      o = o || {};
      var h = run.hand[o.hand];
      if (!h || state.meta.shop.gifts.indexOf(o.gift) < 0 || run.hand.some(function (x) { return x.id === o.gift; })) return { ok: false, why: 'нечем меняться' };
      run.hand[o.hand] = { id: o.gift, lvl: state.meta.shop.lv[o.gift] || 0, used: 0 };
    }
    run.gold -= it.price;
    it.sold = true;
    if (it.t === 'potion') drink(run, cfg, it.v, null);
    else if (it.t === 'weapon') arm(run, cfg, it.v, it.c, null);
    else if (it.t === 'whet') run.wpn.c += it.v;
    return { ok: true };
  }

  function shopLeave(state, cfg) {
    ensure(state);
    if (state.run.phase !== 'shop') return { ok: false };
    nextFloor(state, cfg);
    return { ok: true };
  }

  /** After the depth's boss: 'finish' (take the embers) or 'deeper' («Ниже дна»). */
  function wonChoice(state, cfg, what, mult) {
    ensure(state);
    var run = state.run;
    if (run.phase !== 'won') return { ok: false };
    if (what === 'deeper') {
      run.endless = true;
      toSeals(state, cfg);
      return { ok: true };
    }
    endRun(state, cfg, 'win', mult);
    return { ok: true };
  }

  function abandon(state, cfg, mult) {
    ensure(state);
    var p = state.run.phase;
    if (p === 'hub' || p === 'over') return { ok: false };
    endRun(state, cfg, 'gave', mult);
    return { ok: true };
  }

  function toHub(state) {
    ensure(state);
    if (state.run.phase === 'over' || state.run.phase === 'hub') state.run = { phase: 'hub' };
    return { ok: true };
  }

  // ---- the workshop ----------------------------------------------------------------------------------------

  /** The ceilings of the workshop; a negative setting means there is none. */
  function fortMax(cfg) { return cfg['shop.fort.max'] < 0 ? Infinity : cfg['shop.fort.max']; }
  function giftMaxLevel(cfg) { return cfg['gift.maxLevel'] < 0 ? Infinity : cfg['gift.maxLevel']; }

  function costs(state, cfg) {
    var s = state.meta.shop;
    return {
      gift: s.gifts.length >= list('gifts').length ? null : Math.round(cfg['shop.gift.base'] * Math.pow(cfg['shop.gift.growth'], s.gifts.length)),
      slot: s.slots >= cfg['shop.slot.max'] ? null : Math.round(cfg['shop.slot.base'] * Math.pow(cfg['shop.slot.growth'], s.slots)),
      fort: s.fort >= fortMax(cfg) ? null : Math.round(cfg['shop.fort.base'] * Math.pow(cfg['shop.fort.growth'], s.fort)),
      blade: s.blade >= 1 ? null : cfg['shop.blade.cost']
    };
  }

  function levelCost(state, cfg, id) {
    var s = state.meta.shop;
    var lv = s.lv[id] || 0;
    if (s.gifts.indexOf(id) < 0 || lv >= giftMaxLevel(cfg)) return null;
    return Math.round(cfg['shop.level.base'] * Math.pow(cfg['shop.level.growth'], lv));
  }

  /** A purchase in the workshop: 'gift' (id — which gift to open), 'level' (id), 'slot', 'fort', 'blade'. */
  function buy(state, cfg, what, id) {
    ensure(state);
    var m = state.meta;
    var s = m.shop;
    var p = state.run.phase;
    if (p !== 'hub' && p !== 'over') return { ok: false, why: 'во время спуска мастерская закрыта' };
    var c = costs(state, cfg);
    var cost;
    if (what === 'gift') {
      if (!item('gifts', id) || s.gifts.indexOf(id) >= 0) return { ok: false, why: 'нет такого дара' };
      cost = c.gift;
    } else if (what === 'level') cost = levelCost(state, cfg, id);
    else cost = c[what];
    if (cost === null || cost === undefined) return { ok: false, why: 'больше нельзя' };
    if (embers(state) < cost) return { ok: false, why: 'мало углей', need: cost };
    m.embers = embers(state) - cost;
    if (what === 'gift') {
      s.gifts.push(id);
      if (m.pref.hand.length < handSize(cfg)) m.pref.hand.push(id);
    } else if (what === 'level') s.lv[id] = (s.lv[id] || 0) + 1;
    else if (what === 'slot') {
      s.slots++;
      list('kind').forEach(function (k) { if (m.pref.kinds.length < slots(state, cfg) && m.pref.kinds.indexOf(k.id) < 0) m.pref.kinds.push(k.id); });
    } else if (what === 'fort') s.fort++;
    else if (what === 'blade') s.blade = 1;
    return { ok: true, cost: cost };
  }

  /** The choices of the start screen: 'hero', 'depth', 'hand' (ids), 'kinds' (ids), 'charge'. */
  function setPref(state, cfg, key, value) {
    ensure(state);
    var m = state.meta;
    if (key === 'hero') {
      if (!m.unlocked[value] || !item('heroes', value)) return { ok: false };
      m.pref.hero = value;
    } else if (key === 'depth') {
      m.pref.depth = Math.max(0, Math.min(Math.floor(Number(value) || 0), unlockedDepth(state)));
    } else if (key === 'hand') {
      m.pref.hand = (value || []).filter(function (id, i, a) { return m.shop.gifts.indexOf(id) >= 0 && a.indexOf(id) === i; }).slice(0, handSize(cfg));
    } else if (key === 'kinds') {
      m.pref.kinds = (value || []).filter(function (id, i, a) { return item('kind', id) && a.indexOf(id) === i; }).slice(0, slots(state, cfg));
    } else if (key === 'charge') m.pref.charge = !!value;
    else if (key === 'rules') m.pref.rules = !!value;
    else return { ok: false };
    return { ok: true };
  }

  function achievements(state, cfg) {
    ensure(state);
    var m = state.meta;
    var out = [];
    if (m.rec.wins > 0) out.push('first-win');
    if (m.rec.noPotion > 0) out.push('no-potion');
    if (m.rec.oneBlade > 0) out.push('one-blade');
    if (unlockedDepth(state) >= cfg['depth.max']) out.push('depth-10');
    if (m.rec.floors >= cfg['ach.floors']) out.push('floors-100');
    if (m.rec.deepest >= cfg['ach.deep']) out.push('below');
    if (list('heroes').every(function (h) { return m.unlocked[h.id]; })) out.push('heroes');
    return out;
  }

  // ---- for the screen ------------------------------------------------------------------------------------------

  /** What a step to `to` would do: {text: «−3 здоровья, оружие 1 заряд», dead, done}. */
  function preview(run, cfg, to) {
    if (run.phase !== 'play' || NB[run.pos].indexOf(to) < 0) return null;
    var card = run.grid[to];
    var a = cloneRun(run, true);
    var res = step(a, cfg, to, Rng.make(run.uid + 5));
    var parts = [];
    if (res.dead || a.hp <= 0) parts.push('смерть');
    var dh = a.hp - run.hp;
    var dm = a.maxHp - run.maxHp;
    var ds = a.shield - run.shield;
    var dg = a.gold - run.gold;
    if (dh) parts.push((dh > 0 ? '+' : '−') + Math.abs(dh) + ' ' + plural(dh, 'здоровье', 'здоровья', 'здоровья'));
    if (dm) parts.push('+' + dm + ' к наибольшему здоровью');
    if (ds) parts.push((ds > 0 ? '+' : '−') + Math.abs(ds) + ' щита');
    if (run.wpn && !a.wpn) parts.push('оружие сломается');
    else if (a.wpn && (!run.wpn || a.wpn.n !== run.wpn.n)) parts.push('оружие ' + a.wpn.s + '×' + a.wpn.c);
    else if (a.wpn && run.wpn && (a.wpn.c !== run.wpn.c || a.wpn.s !== run.wpn.s)) {
      parts.push((a.wpn.s !== run.wpn.s ? 'оружие ' + a.wpn.s + '×' + a.wpn.c : 'оружие ' + a.wpn.c + ' ' + plural(a.wpn.c, 'заряд', 'заряда', 'зарядов')));
    }
    if (card && card.k === 'chest') parts.push(run.keys || (has(run, 'lockpick') && !run.picked) ? 'сундук: печать или золото' : 'сундук пуст: нет ключа');
    else if (dg) parts.push((dg > 0 ? '+' : '−') + Math.abs(dg) + ' золота');
    if (card && card.k === 'altar') parts.push(run.hp > cfg['altar.cost'] ? 'алтарь: −' + cfg['altar.cost'] + ' здоровья за силу' : 'алтарь: не хватит здоровья');
    if (a.keys > run.keys) parts.push('+1 ключ');
    if (res.done === 'stairs') parts.push('вниз по лестнице');
    if (res.done === 'boss') parts.push('хозяин повержен');
    if (card && card.k === 'boss' && !res.done) parts.push('хозяину −' + Math.max(cfg['boss.fist'], strength(run, cfg)));
    return { text: parts.length ? parts.join(', ') : 'ничего не случится', dead: !!res.dead, done: res.done || null };
  }

  /** The strength shown on a foe's card now. */
  function shown(run, cfg, cell) {
    var c = run.grid[cell];
    if (!c) return null;
    if (c.k === 'foe') return foeValue(run, cfg, c, cell);
    if (c.k === 'boss') return c.hp;
    return c.v === undefined ? null : c.v;
  }

  /** The long press: what a card is. */
  function describe(run, cfg, card, cell) {
    if (!card) return { title: 'Пусто', text: 'На пустую клетку можно шагнуть — ничего не случится.' };
    var k = card.k;
    var t = cardTitle(run, card);
    var text = '';
    if (k === 'foe') {
      var d = enemyDef(run, card.e);
      var V = foeValue(run, cfg, card, cell === undefined ? -1 : cell);
      t += ' ' + V;
      text = fill(d.text, cfg) + '. Бой: враг погибает, вам — урон сила минус оружие, сначала в щит; оружие теряет заряд.';
    } else if (k === 'boss') {
      text = 'Здоровье ' + card.hp + ' из ' + card.hp0 + '. Каждый бой снимает с него силу оружия, а вам бьёт на ' + bossHit(run, cfg) +
        ' минус оружие и щит. После вашего хода меняется местами с соседней картой; на половине здоровья зовёт двух крыс.';
    } else if (k === 'potion') {
      t += ' ' + card.v;
      text = '+' + card.v + ' здоровья, не выше наибольшего.';
    } else if (k === 'weapon') {
      t += ' ' + card.v + '×' + card.c;
      text = 'Заменяет текущее оружие: сила ' + card.v + ', зарядов ' + card.c + '.';
    } else if (k === 'shield') {
      t += ' ' + card.v;
      text = '+' + card.v + ' к щиту (не больше ' + cfg['shield.cap'] + '). Щит сгорает первым.';
    } else if (k === 'gold') {
      t += ' ' + card.v;
      text = '+' + card.v + ' золота. Золото в конце спуска переходит в угли.';
    } else if (k === 'trap') {
      t += ' ' + card.v;
      text = '−' + card.v + ' здоровья, щит не помогает.';
    } else if (k === 'key') text = '+1 ключ: им открывается сундук.';
    else if (k === 'chest') text = 'С ключом — выбор из двух печатей или ' + cfg['chest.gold'] + ' золота; без ключа просто пустеет.';
    else if (k === 'altar') text = 'Отдать ' + cfg['altar.cost'] + ' здоровья: оружию +' + cfg['altar.strength'] + ' к силе и +' + cfg['altar.charges'] + ' заряд.';
    else if (k === 'stairs') text = 'Шагнуть — следующий этаж. Можно сначала добрать карты.';
    else if (k === 'whet') text = '+' + card.v + ' заряда оружию.';
    else if (k === 'fog') text = 'Карта ещё не открыта.';
    if (card.kind) {
      var kd = item('kind', card.kind);
      if (kd) text = 'Добрая карта сокровищницы. ' + text;
    }
    if (card.charge) text = 'Заряд от шагов. ' + text;
    return { title: t, text: text };
  }

  /** The top cards of the deck that are visible («Взгляд», «Счётная доска»). */
  function seen(run) {
    if (!run.deck) return [];
    var n = Math.max(run.peek || 0, has(run, 'abacus') ? 1 : 0);
    return run.deck.slice(0, n);
  }

  // ---- the stock of the model: new enemies and seals from rule bricks --------------------------------------------

  function validateRule(it, cfg) {
    if (!it || typeof it !== 'object') return 'не объект';
    if (it.type !== 'enemy' && it.type !== 'seal') return 'тип не enemy и не seal';
    var b = item('bricks', it.brick);
    if (!b || b.type !== it.type) return 'нет такого кирпичика: ' + it.brick;
    if (typeof it.value !== 'number' || it.value < 1 || it.value > 3 || it.value % 1 !== 0) return 'value не целое 1–3';
    if (typeof it.title !== 'string' || it.title.length < 3 || it.title.length > 24) return 'название не 3–24 знака';
    if (typeof it.text !== 'string' || it.text.length < 8 || it.text.length > 90) return 'текст не 8–90 знаков';
    if (/https?:/.test(it.title + ' ' + it.text)) return 'ссылка в тексте';
    if (!cfg) return null;
    var rate = ruleCheck(it, cfg);
    if (rate < cfg['rule.minSurvive']) return 'бот выживает с ним реже ' + Math.round(cfg['rule.minSurvive'] * 100) + ' %: ' + Math.round(rate * 100) + ' %';
    return null;
  }

  /** A run of the simple bot over a reference floor with the rule in play: the share that gets down alive. */
  function ruleCheck(it, cfg) {
    var c2 = {};
    for (var k in cfg) c2[k] = cfg[k];
    c2['fair.runs'] = 0;
    c2['rule.weight'] = c2['rule.checkWeight'];
    var state = { run: { phase: 'hub' }, layers: {}, meta: freshMeta() };
    startRun(state, c2, { seed: 77, rule: it });
    var run = state.run;
    if (!run.rule) return 0;
    if (it.type === 'seal') takeSeal(state, c2, 'rule');
    run.floor = c2['rule.checkFloor'];
    run.wpn = { s: c2['rule.checkWeapon'], c: 3, n: ++run.blades };
    makeFloor(run, c2);
    var br = Rng.make(99);
    var alive = 0;
    var n = c2['rule.checkRuns'];
    for (var i = 0; i < n; i++) if (simFloor(run, c2, br)) alive++;
    return n ? alive / n : 1;
  }

  var WORDS = {
    enemyA: ['Ржавый', 'Глухой', 'Сырой', 'Каменный', 'Бледный', 'Корявый', 'Слепой', 'Хмурый'],
    enemyB: ['червь', 'скелет', 'паук', 'гриб', 'сторож', 'крот', 'жук', 'призрак'],
    sealA: ['Старый', 'Тёплый', 'Медный', 'Тихий', 'Крепкий', 'Ясный', 'Ночной', 'Глубинный'],
    sealB: ['амулет', 'пояс', 'перстень', 'оберег', 'фонарь', 'плащ', 'посох', 'шнурок']
  };

  function brickText(b, value) { return b.text.replace('N', String(value)); }

  /** A rule made without the model, when the stock ran out in the metro. */
  function procedural(kind, rng) {
    var bricks = list('bricks');
    var b = rng.pick(bricks);
    var value = rng.int(1, 3);
    var enemy = b.type === 'enemy';
    var title = enemy ? rng.pick(WORDS.enemyA) + ' ' + rng.pick(WORDS.enemyB) : rng.pick(WORDS.sealA) + ' ' + rng.pick(WORDS.sealB);
    var text = brickText(b, value);
    text = text.charAt(0).toUpperCase() + text.slice(1);
    return { type: b.type, title: title, text: text, brick: b.id, value: value, procedural: true };
  }

  function validateStock(kind, it) {
    if (kind !== 'rules') return null;
    return validateRule(it, DEF);
  }

  // ---- the engine's contract ---------------------------------------------------------------------------------------

  function tick(state, dt, ctx) { /* a turn-based game: nothing moves by itself */ }

  function offline(state, sec, ctx) { return { events: [] }; }

  function prestigeGain(state, layerId, cfg) {
    if (layerId !== LAYER) return Big.ZERO;
    var m = state.meta || {};
    var phase = state.run && state.run.phase;
    if (!m.ascend || (phase !== 'hub' && phase !== 'over')) return Big.ZERO;
    if (unlockedDepth(state) >= cfg['depth.max']) return Big.ZERO;
    return Big.ONE;
  }

  function bonus(state, layerId, amount, cfg) { return 1 + num(amount) * cfg['depth.bonus']; }

  function onPrestige(state, layerId, before, ctx) {
    ensure(state);
    state.meta.ascend = false;
    state.meta.pref.depth = unlockedDepth(state);
  }

  function migrate(state, fromVer) {
    // Version 1 is the first: nothing to translate yet.
    return state;
  }

  function validate(state) {
    var r = state.run;
    if (!r || typeof r.phase !== 'string') return 'нет фазы забега';
    if (PHASES.indexOf(r.phase) < 0) return 'неизвестная фаза ' + r.phase;
    if (r.phase !== 'hub') {
      if (!Array.isArray(r.grid) || r.grid.length !== 9) return 'поле не 3×3';
      if (typeof r.pos !== 'number' || r.pos < 0 || r.pos > 8 || r.pos % 1 !== 0) return 'герой вне поля';
      if (r.grid[r.pos]) return 'в клетке героя лежит карта';
      if (typeof r.hp !== 'number' || typeof r.maxHp !== 'number' || typeof r.gold !== 'number') return 'числа героя испорчены';
      if (!Array.isArray(r.deck) || !Array.isArray(r.hand) || !Array.isArray(r.seals)) return 'колода, рука или печати испорчены';
      if (typeof r.rs !== 'number' || typeof r.seed !== 'number') return 'нет генератора забега';
    }
    var m = state.meta || {};
    if (m.embers !== undefined && (!Big.valid(m.embers) || num(m.embers) < 0)) return 'угли испорчены';
    return null;
  }

  function summary(state, cfg) {
    var r = state.run || {};
    var e = embers(state);
    if (r.phase && r.phase !== 'hub' && r.phase !== 'over') return { line: 'этаж ' + r.floor + ' · здоровье ' + r.hp + '/' + r.maxHp + ' · угли ' + e };
    var parts = [];
    var d = unlockedDepth(state);
    if (d) parts.push('глубина ' + d);
    var wins = state.meta && state.meta.rec ? state.meta.rec.wins : 0;
    if (wins) parts.push('побед ' + wins);
    parts.push('угли ' + e);
    return { line: parts.join(' · ') };
  }

  /** The chest of «Пассажир»: some embers. */
  function chest(state, rng, cfg) {
    ensure(state);
    var n = rng.int(cfg['chest.min'], Math.max(cfg['chest.min'], cfg['chest.max']));
    state.meta.embers = embers(state) + n;
    return { title: 'Сундук путника', items: [{ title: 'Угли', amount: n }] };
  }

  // ---- bots: the checks of balance and the simple bot of fairness -------------------------------------------------

  /** «здоровье + щит + ценность оружия» (plus a little for gold and keys). */
  function worth(run, cfg) {
    if (run.dead || run.hp <= 0) return -1000;
    var w = run.wpn ? strength(run, cfg) * Math.min(run.wpn.c, cfg['bot.chargeCap']) * cfg['bot.weapon'] : 0;
    var b = bossCell(run);
    var boss = b >= 0 ? run.grid[b].hp * cfg['bot.boss'] : 0;
    return run.hp + run.shield + w + run.gold * cfg['bot.gold'] + run.keys * cfg['bot.key'] - boss;
  }

  function doneValue(res, cfg) { return res.done === 'boss' ? 1000 : res.done ? cfg['bot.stairs'] : 0; }

  /** The cell the bot that looks two steps ahead picks. */
  function think(run, cfg, noise) {
    var lr = Rng.make(run.uid * 7919 + run.st.moves);
    var best = NB[run.pos][0];
    var bestV = -1e9;
    NB[run.pos].forEach(function (c) {
      var a = cloneRun(run, true);
      var ra = step(a, cfg, c, lr);
      var v;
      if (ra.dead || a.hp <= 0) v = -1000;
      else if (ra.done) v = worth(a, cfg) + doneValue(ra, cfg);
      else {
        v = -1e9;
        NB[a.pos].forEach(function (c2) {
          var b = cloneRun(a, true);
          var rb = step(b, cfg, c2, lr);
          var vb = rb.dead || b.hp <= 0 ? -1000 : worth(b, cfg) + doneValue(rb, cfg);
          if (vb > v) v = vb;
        });
      }
      v += noise ? noise.next() * 0.01 : 0;
      if (v > bestV) {
        bestV = v;
        best = c;
      }
    });
    return best;
  }

  function damageOf(run, cfg, cell) {
    var c = run.grid[cell];
    if (!c || c.k !== 'foe') return 0;
    var V = foeValue(run, cfg, c, cell);
    var S = strength(run, cfg);
    var hit = enemyDef(run, c.e).armour && S < V / 2 ? Math.floor(S / 2) : S;
    return Math.max(0, V - hit);
  }

  /** A card worth walking to: something good, an empty cell or the stairs. */
  function good(run, cfg, c) {
    var x = run.grid[c];
    return !x || (x.k !== 'foe' && x.k !== 'trap' && x.k !== 'boss') || damageOf(run, cfg, c) === 0;
  }

  /** The bot is boxed in: every neighbour hurts at least `need`. */
  function boxed(run, cfg, need) {
    return NB[run.pos].every(function (c) {
      var x = run.grid[c];
      if (!x) return false;
      if (x.k === 'trap') return x.v >= need;
      return x.k === 'foe' && damageOf(run, cfg, c) >= need;
    });
  }

  function biters(run) { return NB[run.pos].filter(function (c) { return isPredator(run, run.grid[c]); }).length; }

  /** The cells of a gift worth using now for the bot, or null. */
  function giftPlan(run, cfg, i) {
    var g = run.hand[i];
    var p = giftPower(cfg, g);
    var need = cfg['bot.giftDamage'];
    var tg = targets(run, cfg, i);
    var S = strength(run, cfg);
    var best = -1;
    var bestD = need - 1;
    if (g.id === 'sip') return run.maxHp - run.hp >= p ? [] : null;
    if (g.id === 'whet') return run.wpn && run.wpn.c <= 1 ? [] : null;
    if (g.id === 'silence' || g.id === 'double') return biters(run) >= 2 ? [] : null;
    if (g.id === 'glance') return run.fm === 0 ? [] : null;
    if (g.id === 'horseshoe' || g.id === 'squeeze') {
      tg.forEach(function (c) {
        var x = run.grid[c];
        if (!x || x.k !== 'foe' || NB[run.pos].indexOf(c) < 0) return;
        var d = damageOf(run, cfg, c);
        if (d > bestD) {
          bestD = d;
          best = c;
        }
      });
      return best >= 0 ? [best] : null;
    }
    if (g.id === 'shot') {
      tg.forEach(function (c) {
        var x = run.grid[c];
        var d;
        if (x.k === 'boss') d = Math.max(0, bossHit(run, cfg) - S) + need;
        else if (NB[run.pos].indexOf(c) < 0 && !isPredator(run, x)) return;
        else d = damageOf(run, cfg, c) - Math.max(0, foeValue(run, cfg, x, c) - (S + p) - S) + (isPredator(run, x) ? 1 : 0);
        if (d > bestD) {
          bestD = d;
          best = c;
        }
      });
      return best >= 0 ? [best] : null;
    }
    if (!boxed(run, cfg, need)) return null;
    if (g.id === 'empty') {
      var bv = -1e9;
      tg.forEach(function (c) {
        var v = -1e9;
        NB[c].forEach(function (d) { if (d !== run.pos) v = Math.max(v, quick(run, cfg, d)); });
        if (v > bv) {
          bv = v;
          best = c;
        }
      });
      return best >= 0 ? [best] : null;
    }
    if (g.id === 'swap') {
      var far = -1;
      for (var c = 0; c < 9; c++) if (c !== run.pos && NB[run.pos].indexOf(c) < 0 && run.grid[c] && good(run, cfg, c)) far = c;
      if (far < 0) return null;
      NB[run.pos].forEach(function (c) {
        var d = damageOf(run, cfg, c);
        if (run.grid[c] && d > bestD) {
          bestD = d;
          best = c;
        }
      });
      return best >= 0 ? [best, far] : null;
    }
    return null;
  }

  function botGift(state, cfg, mult) {
    var run = state.run;
    for (var i = 0; i < run.hand.length; i++) {
      var g = run.hand[i];
      if (g.used >= giftUses(run, cfg, g)) continue;
      var cells = giftPlan(run, cfg, i);
      if (cells) {
        var r = useGift(state, cfg, i, cells, mult);
        if (r.ok) return true;
      }
    }
    return false;
  }

  /** The boss floor with the deck out and nothing left worth the walk: the bot goes for the boss. */
  function stalled(run, cfg) { return run.fm > cfg['bot.stall']; }

  /** A stalled bot: straight to the boss, or into the cheapest card next to it. */
  function unstick(run, cfg) {
    var b = bossCell(run);
    if (b < 0) {
      var pick = -1;
      var pv = -1e9;
      NB[run.pos].forEach(function (c) {
        if (!run.grid[c]) return;
        var v = quick(run, cfg, c);
        if (v > pv) {
          pv = v;
          pick = c;
        }
      });
      return pick >= 0 ? pick : NB[run.pos][run.fm % NB[run.pos].length];
    }
    var best = NB[run.pos][0];
    var bestD = 99;
    NB[run.pos].forEach(function (c) {
      var d = c === b ? -1 : Math.abs(c % 3 - b % 3) + Math.abs(Math.floor(c / 3) - Math.floor(b / 3));
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    });
    return best;
  }

  function rank(id) {
    var i = SEAL_RANK.indexOf(id);
    return i < 0 ? 99 : i;
  }

  /**
   * One decision of a bot on the real state: 'smart' looks two steps ahead and uses gifts, 'random'
   * steps anywhere and chooses at random. Returns false when there is nothing to decide.
   */
  function botTurn(state, cfg, kind, r, mult) {
    var run = state.run;
    var smart = kind !== 'random';
    var p = run.phase;
    if (p === 'play') {
      if (smart && botGift(state, cfg, mult)) return true;
      var cell = smart ? (stalled(run, cfg) ? unstick(run, cfg) : think(run, cfg, r)) : r.pick(NB[run.pos]);
      move(state, cfg, cell, mult);
    } else if (p === 'choice') {
      var pd = run.pending;
      if (pd.type === 'chest') {
        var bi = -1;
        if (smart) pd.seals.forEach(function (id, i) { if (bi < 0 || rank(id) < rank(pd.seals[bi])) bi = i; });
        else bi = r.int(0, pd.seals.length);
        choose(state, cfg, bi);
      } else choose(state, cfg, smart ? (run.hp > pd.cost + cfg['bot.altarHp'] ? 0 : 1) : r.int(0, 1));
    } else if (p === 'seal') {
      var opts = run.pending ? run.pending.seals : [];
      var si = 0;
      if (smart) opts.forEach(function (id, i) { if (rank(id) < rank(opts[si])) si = i; });
      else si = r.int(0, opts.length - 1);
      pickSeal(state, cfg, si);
    } else if (p === 'gift') pickGift(state, cfg, 0);
    else if (p === 'rest') {
      if (!smart) {
        rest(state, cfg, r.chance(0.5) ? 'heal' : 'shop');
        return true;
      }
      var wp = price(run, cfg, cfg['shop.weapon.price'] + cfg['shop.weapon.perFloor'] * run.floor);
      var needWeapon = !run.wpn || run.wpn.c <= 1 || strength(run, cfg) < cfg['shop.weapon.s'] + run.floor - 1;
      rest(state, cfg, needWeapon && run.gold >= wp ? 'shop' : run.hp < run.maxHp ? 'heal' : 'shop');
    } else if (p === 'shop') {
      if (smart) {
        var items = run.shop.items;
        if (items[2] && !items[2].sold && run.gold >= items[2].price && (!run.wpn || strength(run, cfg) * run.wpn.c < items[2].v * items[2].c)) shopBuy(state, cfg, 2);
        if (items[1] && !items[1].sold && run.gold >= items[1].price && run.maxHp - run.hp >= items[1].v) shopBuy(state, cfg, 1);
        if (items[0] && !items[0].sold && run.gold >= items[0].price && run.maxHp - run.hp >= items[0].v) shopBuy(state, cfg, 0);
      }
      shopLeave(state, cfg);
    } else if (p === 'won') wonChoice(state, cfg, 'finish', mult);
    else return false;
    return true;
  }

  /** A whole descent by a bot from the start screen: the result of the run. */
  function botRun(state, cfg, kind, seed, o) {
    o = o || {};
    ensure(state);
    if (state.run.phase === 'over') toHub(state);
    startRun(state, cfg, { seed: seed, charge: o.charge, rule: o.rule });
    var r = Rng.make(seed ^ 0x5bd1e995);
    for (var i = 0; i < cfg['bot.maxTurns'] && state.run.phase !== 'over'; i++) botTurn(state, cfg, kind, r, o.mult || 1);
    if (state.run.phase !== 'over') abandon(state, cfg, o.mult || 1);
    return state.run.result;
  }

  return {
    LAYER: LAYER, NB: NB,
    setContent: setContent, setDefaults: setDefaults, list: list, item: item, fill: fill, plural: plural,
    init: init, tick: tick, offline: offline, prestigeGain: prestigeGain, bonus: bonus, onPrestige: onPrestige,
    migrate: migrate, validate: validate, summary: summary, chest: chest, procedural: procedural, validateStock: validateStock,
    ensure: ensure, embers: embers, unlockedDepth: unlockedDepth, slots: slots, handSize: handSize,
    startRun: startRun, move: move, useGift: useGift, choose: choose, pickSeal: pickSeal, pickGift: pickGift,
    rest: rest, shopBuy: shopBuy, shopLeave: shopLeave, wonChoice: wonChoice, abandon: abandon, toHub: toHub,
    costs: costs, levelCost: levelCost, fortMax: fortMax, giftMaxLevel: giftMaxLevel, buy: buy, setPref: setPref, achievements: achievements, embersOf: embersOf,
    preview: preview, shown: shown, describe: describe, seen: seen, targets: targets, giftPower: giftPower, giftUses: giftUses,
    cardTitle: cardTitle, floorTitle: floorTitle, sealTitle: sealTitle, strength: strength, foeValue: foeValue,
    isPredator: isPredator, enemyDef: enemyDef, bossHit: bossHit, price: price,
    validateRule: validateRule, ruleCheck: ruleCheck, ruleOf: ruleOf,
    step: step, cloneRun: cloneRun, makeFloor: makeFloor, simFloor: simFloor, fairness: fairness, quick: quick,
    worth: worth, think: think, botTurn: botTurn, botRun: botRun, freshMeta: freshMeta
  };
});
