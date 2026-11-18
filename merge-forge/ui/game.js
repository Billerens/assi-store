// The screen of «Кузница слияний». Top: gold and the farm rate. The field: the gate (a canvas
// with the monster walking up, its HP bar, the boss timer and short slash lines of the strikes),
// then the anvil — a grid of cells with blades drawn as SVG (blade, guard, hilt), the level in
// the corner, rune sockets marked under their cell. Drag a blade onto the same one to merge
// (released near a twin it snaps to it), onto another level to swap, onto the chest to sell;
// a double tap merges it with the nearest twin. At the bottom: the forge (a tap speeds the
// current blade), the chest, «Улучшения» (a sheet on the cover screen, the right panel on the
// unfolded one) and «Горн мастера» (coals, the tree, both resets, the album). Every row of a list
// has its drawn picture (art.js, window.MFArt). The logic is ../sim.js.
(async function () {
  const h = ui.h;
  const sim = window.GameSim;
  let g = null;
  const view = {
    cells: {}, cellKey: {}, shapeKey: '', drag: null, lastTap: null, info: null, selected: null,
    slashes: [], floats: [], critUntil: {}, lastVolleys: -1, lastBest: 0, lastWave: 0, lastEvent: '',
    sheet: null, sheetKind: '', blades: null, monsters: null, bosses: null, events: null,
    caravan: null, caravanFor: 0, asked: {}, panelKey: '', masterKey: '', w: 0, h: 0, dpr: 1, t: 0,
    art: {}, artOn: false, artAnimate: true, artKey: '', artBusy: false, hitAt: 0,
    still: !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  };
  const SNAP = 0.8;
  const DOUBLE_MS = 320;

  // ---- sounds (Web Audio, no files) ----
  Sfx.add('merge', [{ type: 'triangle', f: [520, 780], d: 0.09, v: 0.3 }, { at: 0.06, type: 'sine', f: [1040, 1040], d: 0.12, v: 0.18 }]);
  Sfx.add('clang', [{ type: 'square', f: [900, 600], d: 0.05, v: 0.08 }, { type: 'noise', f: [1, 1], d: 0.06, v: 0.06 }]);
  Sfx.add('forge', [{ type: 'noise', f: [1, 1], d: 0.08, v: 0.12 }, { type: 'triangle', f: [260, 200], d: 0.08, v: 0.12 }]);
  Sfx.add('boss', [{ type: 'sawtooth', f: [110, 80], d: 0.4, v: 0.16 }, { at: 0.2, type: 'sine', f: [165, 165], d: 0.5, v: 0.2 }]);
  Sfx.add('sell', [{ type: 'triangle', f: [700, 700], d: 0.06, v: 0.25 }, { at: 0.07, type: 'triangle', f: [940, 940], d: 0.1, v: 0.22 }]);

  const cfg = () => g.config;
  const now = () => Date.now();
  // A text of the screen in the interface's language: the whole template is the dictionary key,
  // what goes into {} is translated too when it is a text of the interface (a blade, a rune).
  const tx = (text, ...values) => ui.t(text, ...values.map((v) => (typeof v === 'string' ? ui.t(v) : v)));
  const pct = (x) => g.fmt.pct(x);
  const lvl = (state, id) => sim.lvl(state, id);

  // ---- content ----

  /** A blade of level n: {level, title, color, shape}; past the named levels the artist's name. */
  function bladeInfo(n) {
    const b = view.blades;
    if (b && n >= 1 && n <= b.list.length) return b.list[n - 1];
    const base = sim.bladeOf(n, b, null);
    const drawn = view.artOn && view.art[n];
    const over = b ? n - b.list.length : n;
    return Object.assign({}, base, { title: drawn && drawn.title ? drawn.title : b ? tx(b.beyond, over) : tx('Клинок {}', n) });
  }

  function shift(hex, k) {
    const n = parseInt(String(hex).slice(1), 16);
    const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    const out = [c[2], c[0], c[1]].map((x, i) => Math.max(30, Math.min(220, Math.round(x * 0.7 + c[i] * 0.3 + k * 0.2))));
    return '#' + out.map((x) => ('0' + x.toString(16)).slice(-2)).join('');
  }

  /** The monster of wave w: {title, text, shape, color, boss}. */
  function monsterOf(state, w) {
    const boss = sim.isBoss(cfg(), w) && !state.run.farm;
    const block = Math.floor((w - 1) / 10);
    const named = state.meta.names && state.meta.names[(boss ? 'b' : 'm') + block];
    if (named) return { title: named.title, text: named.text, shape: MFMonsters.shapeOf(named.shape, named.title), color: named.color || '#8a8a8a', boss };
    if (boss && view.bosses) {
      const k = Math.floor(w / cfg()['boss.every']) - 1;
      const b = view.bosses[((k % view.bosses.length) + view.bosses.length) % view.bosses.length];
      const round = Math.floor(k / view.bosses.length);
      return { title: round ? b.old : b.title, text: b.text, shape: b.shape, mark: b.mark, color: round ? shift(b.color, round * 20) : b.color, boss: true };
    }
    if (!view.monsters) return { title: boss ? 'Босс' : 'Чудище', text: '', shape: 'blob', color: '#7a7f86', boss };
    const bands = view.monsters.bands;
    const last = bands[bands.length - 1].to;
    const round = Math.floor((w - 1) / last);
    const ww = ((w - 1) % last) + 1;
    let band = bands[0];
    for (let i = 0; i < bands.length; i++) if (ww >= bands[i].from && ww <= bands[i].to) band = bands[i];
    const kind = band.kinds[w % band.kinds.length];
    return { title: round ? kind.old : kind.title, text: kind.text, shape: kind.shape, color: round ? shift(kind.color, view.monsters.oldShift * round) : kind.color, boss };
  }

  /** Waves past the named bands take their names from the stock (the model), once per ten. */
  function askNames(state) {
    const w = state.run.wave;
    const last = view.monsters ? view.monsters.bands[view.monsters.bands.length - 1].to : 200;
    if (w <= last) return;
    const boss = sim.isBoss(cfg(), w) && !state.run.farm;
    const key = (boss ? 'b' : 'm') + Math.floor((w - 1) / 10);
    if ((state.meta.names && state.meta.names[key]) || view.asked[key]) return;
    view.asked[key] = true;
    g.stock.take('monsters').then((item) => {
      if (!item || item.procedural) return;
      g.act((s) => {
        s.meta.names = s.meta.names || {};
        s.meta.names[key] = { title: item.title, text: item.text, shape: item.shape, color: item.color };
      });
    }).catch(() => {});
  }

  function load(name, done) {
    fetch('../content/' + name + '.json').then((r) => r.json()).then((v) => { done(v); view.cellKey = {}; g.redraw(); }).catch(() => {});
  }

  // ---- blades as SVG: blade, guard, hilt; the shape by the band, the colour by the metal ----

  const SVG_CACHE = {};

  function bladeSvg(n) {
    if (!SVG_CACHE[n]) SVG_CACHE[n] = sim.baseSvg(bladeInfo(n), 40);
    return SVG_CACHE[n];
  }

  /**
   * Puts the picture of level n into el: the artist's (an <img>, so the ids of two pictures never
   * clash; still when the setting or the system's reduced motion says) or the drawn base.
   */
  function putBlade(el, n) {
    const a = view.artOn && view.art[n];
    if (a && a.svg) {
      const img = g.art.img(a.svg, { cls: 'mf-img', still: !view.artAnimate, alt: '' });
      if (img) {
        el.replaceChildren(img);
        return;
      }
    }
    el.innerHTML = bladeSvg(n);
  }

  // ---- the model's artist: pictures of the levels seen (game.json "artist", engine/series.js) ----

  /** The levels to ask about: the album and the anvil. */
  function seenLevels(state) {
    const out = {};
    Object.keys(state.meta.album || {}).forEach((k) => { out[Number(k)] = true; });
    (state.run.grid || []).forEach((n) => { if (n) out[n] = true; });
    return Object.keys(out).map(Number).filter((n) => n >= 1).sort((a, b) => a - b);
  }

  /** Takes the pictures of the seen levels; force — even when nothing new is seen (stock refilled). */
  async function syncArt(force) {
    if (!g || view.artBusy) return;
    const state = g.state;
    const levels = seenLevels(state);
    const key = (state.meta.bestLevel || 1) + '|' + levels.join(',');
    if (!force && key === view.artKey) return;
    view.artKey = key;
    view.artBusy = true;
    try {
      const r = await g.art.sync('blades', state.meta.bestLevel || 1, levels);
      const sig = (r.on ? 1 : 0) + '|' + (r.animate ? 1 : 0) + '|' + Object.keys(r.items || {}).join(',');
      const old = (view.artOn ? 1 : 0) + '|' + (view.artAnimate ? 1 : 0) + '|' + Object.keys(view.art).join(',');
      view.artOn = !!r.on;
      view.artAnimate = r.animate !== false;
      view.art = r.items || {};
      if (sig !== old) {
        for (const k in SVG_CACHE) delete SVG_CACHE[k];
        view.cellKey = {};
        view.masterKey = '';
        g.redraw();
      }
    } finally {
      view.artBusy = false;
    }
  }

  // ---- building the screen ----

  function build(game) {
    g = game;
    view.saleKey = g.state.run.lastForgeSale ? g.state.run.lastForgeSale.at + ':' + g.state.run.lastForgeSale.serial : '';
    view.artifactFxKey = g.state.run.lastArtifactFx ? g.state.run.lastArtifactFx.at + ':' + g.state.run.lastArtifactFx.serial : '';
    window.__mf = api;
    g.el.app.classList.add('mf-app');
    g.el.field.classList.add('mf-field');

    view.gold = h('div', { class: 'g-big g-num', id: 'gold' });
    view.rate = h('span', { class: 'g-rate', id: 'rate' });
    view.coalsText = h('span', { class: 'g-num' });
    view.coals = h('span', { class: 'mf-chip', id: 'coals', hidden: true }, MFArt.el('ui', 'coal', 'mf-chip-ic'), view.coalsText);
    g.el.top.append(view.gold, h('div', { class: 'mf-toprow' }, view.rate, view.coals));

    view.canvas = h('canvas', { class: 'mf-canvas', id: 'gate-canvas' });
    view.ctx = view.canvas.getContext('2d');
    view.waveLabel = h('div', { class: 'mf-wave', id: 'wave' });
    view.monsterName = h('div', { class: 'mf-mname', id: 'monster' });
    view.hpFill = h('i', {});
    view.hpText = h('span', { class: 'mf-hptext g-num' });
    view.hp = h('div', { class: 'mf-hp', id: 'hp' }, view.hpFill, view.hpText);
    view.timerFill = h('i', {});
    view.timerText = h('span', { class: 'mf-hptext g-num' });
    view.timer = h('div', { class: 'mf-timer', id: 'boss-timer', hidden: true }, view.timerFill, view.timerText);
    view.bars = h('div', { class: 'mf-bars' }, view.hp, view.timer);
    // The wave, the monster's whole name (it wraps) and the bars under them, in one column.
    view.gate = h('div', { class: 'mf-gate', id: 'gate' }, view.canvas,
      h('div', { class: 'mf-gate-head' }, h('div', { class: 'mf-gate-top' }, view.waveLabel, view.monsterName), view.bars));

    view.info = h('div', { class: 'mf-info', id: 'info' }, 'Перетащите клинок на такой же');
    view.selectionBadge = h('button', { class: 'g-btn small mf-selected-blade', id: 'blade-clear', onclick: clearSelection });
    view.equipBlade = h('button', { class: 'g-btn small', id: 'blade-equip', onclick: () => bladeAction('equip') }, tx('Герою'));
    view.feedBlade = h('button', { class: 'g-btn small', id: 'blade-feed', onclick: () => bladeAction('feed') }, tx('Дракону'));
    view.sellBlade = h('button', { class: 'g-btn small', id: 'blade-sell', onclick: () => { if (selectionValid()) sell(view.selected.cell); } }, tx('Продать'));
    view.bladeActions = h('div', { class: 'mf-blade-actions', hidden: true, role: 'group', 'aria-label': tx('Действия с клинком') }, view.selectionBadge, view.equipBlade, view.feedBlade, view.sellBlade);
    view.anvilTools = h('div', { class: 'mf-anvil-tools' }, view.info, view.bladeActions);
    view.anvil = h('div', { class: 'mf-anvil', id: 'anvil' });
    view.anvilWrap = h('div', { class: 'mf-anvil-wrap' }, view.anvil);
    g.el.field.append(view.gate, view.anvilTools, view.anvilWrap);

    view.event = h('div', { class: 'mf-event', id: 'event', hidden: true });
    view.retry = h('button', { class: 'g-btn primary', id: 'retry', hidden: true, onclick: retry });
    view.cry = h('button', { class: 'g-btn', id: 'cry', hidden: true, onclick: cry });
    view.sort = h('button', { class: 'g-btn small mf-sort', id: 'sort', 'aria-label': tx('Сортировать'), title: tx('По уровню: сильные первыми. Клинки на рунах остаются на месте.'), onclick: sortAnvil }, 'Порядок');
    view.context = h('div', { class: 'g-btns mf-context' }, view.retry, view.cry);
    view.meet = h('button', { class: 'g-btn small', id: 'meet', onclick: () => prepareFight('meet') }, 'Встретить');
    view.aim = h('button', { class: 'g-btn small', id: 'aim', onclick: () => prepareFight('aim') }, 'Прицелиться');
    view.preparation = h('div', { class: 'mf-preparation', hidden: true }, view.meet, view.aim);
    view.outpost = MFOutpostUI.create({ g, sim, onLayout: size, putBlade });
    view.artifacts = window.MFArtifactsUI ? MFArtifactsUI.create({ g, sim, onOpen: () => openMaster('artifacts') }) : null;
    view.anvilTools.append(view.sort);

    view.forgeFill = h('i', { class: 'mf-forge-fill' });
    view.forgeSub = h('span', { class: 'g-sub g-num' });
    view.forge = h('button', { class: 'g-btn primary mf-forge', id: 'forge', onclick: tapForge }, view.forgeFill, head('forge', 'Горн'), view.forgeSub);
    view.chestSub = h('span', { class: 'g-sub', role: 'status', 'aria-live': 'polite' }, 'продать');
    view.chest = h('button', { class: 'g-btn mf-chest', id: 'chest', onclick: () => g.flash('chest', 'Сундук продажи', 'Перетащите сюда клинок, чтобы продать его за золото') }, head('chest', 'Сундук'), view.chestSub);
    view.upBtn = h('button', { class: 'g-btn mf-up-btn', id: 'upgrades', onclick: openUpgrades }, head('upgrades', 'Улучшения'), h('span', { class: 'g-sub' }, 'кузня и руны'));
    view.masterSub = h('span', { class: 'g-sub g-num' });
    view.masterBtn = h('button', { class: 'g-btn mf-master-btn', id: 'master', onclick: openMaster }, head('master', 'Горн мастера'), view.masterSub);
    view.panel = h('div', { class: 'mf-panel', id: 'panel' });
    view.bottom = h('div', { class: 'mf-bottom' }, view.forge, view.chest, view.upBtn, view.masterBtn);
    g.el.actions.append(view.event, view.outpost.element, view.preparation, view.context, view.panel, view.bottom);
    if (view.artifacts) view.outpost.element.after(view.artifacts.quickElement);

    gestures();
    placePanel();
    g.on('resize', () => { placePanel(); size(); });
    g.on('visible', size);
    g.on('prestige', (p) => {
      closeSheet();
      clearSelection();
      view.cellKey = {};
      view.slashes = [];
      if (p.layer === 'forge') g.flash('gem', 'Перековка', tx('Угли: +{}, каждый навсегда +{} к урону и золоту', g.fmt(p.gain), pct(cfg()['coals.bonus'])));
      if (p.layer === 'star') g.flash('sparkle', 'Звёздный металл', tx('Слитки: +{}', g.fmt(p.gain)));
    });
    g.on('chest', () => { g.sfx('chest'); g.buzz('chest'); view.cellKey = {}; });
    if (window.ResizeObserver) new ResizeObserver(size).observe(g.el.field);
    window.addEventListener('resize', size);
    load('blades', (v) => { view.blades = v; for (const k in SVG_CACHE) delete SVG_CACHE[k]; });
    syncArt(true);
    window.axiko.on('games.stock', (e) => { if (e && e.game === 'merge-forge' && e.kind === 'blades') syncArt(true); });
    g.on('visible', () => syncArt(true));
    load('monsters', (v) => { view.monsters = v; });
    load('bosses', (v) => { view.bosses = v; });
    // The event card may already show by now: draw it again with the titles and texts.
    load('events', (v) => { view.events = v; view.lastEvent = ''; });
    view.lastBest = g.state.meta.bestLevel || 0;
    view.lastWave = g.state.run.wave;
    size();
  }

  function head(icon, title) {
    return h('span', { class: 'mf-btn-head' }, MFArt.el('ui', icon, 'mf-btn-ic'), h('span', { class: 'mf-btn-t' }, title));
  }

  /** On the unfolded screen the upgrades are a panel on the right, on the cover screen a sheet. */
  function placePanel() {
    const wide = g.layout === 'wide';
    view.panel.hidden = !wide;
    view.upBtn.hidden = wide;
    view.panelKey = '';
    if (wide && view.sheetKind === 'up') closeSheet();
  }

  /** The cell size from the room the field has: 64 when it fits, never under 40; the canvas follows its box. */
  function size() {
    if (!g) return;
    const shape = sim.shape(g.state, cfg());
    const field = g.el.field;
    const gap = shape.rows > 5 ? 4 : 6;
    const wide = g.layout === 'wide';
    const MIN = 44;
    const INFO = 46;
    const roomW = field.clientWidth - 32;
    const byW = (roomW - gap * (shape.cols - 1)) / shape.cols;
    // The gate gives way first: cells keep 64 px (the spec's cover screen) while the gate can
    // shrink to 100 (the bars and a small monster under them); then the cells shrink to 40; on a
    // really short field the gate folds to its top line and bars (58) and the hint line goes,
    // the anvil stays whole.
    const want = Math.max(MIN, Math.min(64, byW));
    // The gaps of the column, the plate under the cells with its margin (game.css, .mf-anvil-wrap)
    // and the padding under the field.
    const PLATE = 18;
    const rest = gap * (shape.rows - 1) + INFO + 12 + PLATE;
    const prefer = Math.min(wide ? 230 : 200, Math.round(field.clientHeight * (shape.rows > 5 ? 0.24 : 0.31)));
    let gateH = Math.max(100, Math.min(prefer, field.clientHeight - shape.rows * want - rest));
    const roomAtMin = field.clientHeight - shape.rows * MIN - rest;
    const folded = roomAtMin < gateH;
    if (folded) gateH = Math.max(58, roomAtMin);
    view.info.hidden = !!view.selected;
    view.gate.style.height = gateH + 'px';
    // A low gate has no room for a monster under the bars: the bars give it a column on the right,
    // where it stands in the gate's whole height.
    view.tight = gateH < 130;
    view.monSize = Math.round(Math.max(30, Math.min(gateH - 16, 110, roomW * 0.3)));
    view.gate.classList.toggle('tight', view.tight);
    view.gate.style.setProperty('--mf-mon', (view.monSize + 14) + 'px');
    view.anvil.style.gap = gap + 'px';
    const roomH = field.clientHeight - gateH - INFO - 12 - PLATE;
    const byH = (roomH - gap * (shape.rows - 1)) / shape.rows;
    const cell = Math.max(MIN, Math.floor(Math.min(byW, byH, wide ? 110 : 96)));
    view.anvil.style.setProperty('--cell', cell + 'px');
    view.cell = cell;
    const dpr = window.devicePixelRatio || 1;
    const w = view.canvas.clientWidth;
    const hh = view.canvas.clientHeight;
    if (w && hh && (w !== view.w || hh !== view.h || dpr !== view.dpr)) {
      view.w = w;
      view.h = hh;
      view.dpr = dpr;
      view.canvas.width = Math.round(w * dpr);
      view.canvas.height = Math.round(hh * dpr);
    }
  }

  // ---- the anvil ----

  function rebuildAnvil(state) {
    const shape = sim.shape(state, cfg());
    const open = sim.openCells(state, cfg());
    const key = shape.cols + 'x' + shape.rows + ':' + open.length;
    if (key === view.shapeKey) return;
    view.shapeKey = key;
    view.anvil.textContent = '';
    view.cells = {};
    view.cellKey = {};
    view.anvil.style.setProperty('--cols', shape.cols);
    for (let r = 0; r < shape.rows; r++) {
      for (let c = 0; c < shape.cols; c++) {
        const i = r * sim.COLS + c;
        const isOpen = open.indexOf(i) >= 0;
        const el = h('div', { class: 'mf-cell' + (isOpen ? '' : ' shut'), 'data-cell': i, role: isOpen ? 'button' : null, tabindex: isOpen ? 0 : null });
        if (!isOpen) el.append(MFArt.el('ui', 'lock', 'mf-cell-lock'));
        view.anvil.append(el);
        if (isOpen) view.cells[i] = el;
      }
    }
    size();
  }

  const RUNE_TITLE = { fire: 'Огонь', ice: 'Лёд', greed: 'Жадность' };
  const RUNE_WORD = { fire: 'огонь', ice: 'лёд', greed: 'жадность' };
  const RUNE_LABEL = { fire: 'Руна: огонь', ice: 'Руна: лёд', greed: 'Руна: жадность' };

  /** The rank of a blade's metal, as its guard is drawn (sim.baseSvg): 0, 1 from level 10, 2 from 20, 3 from 30. */
  function tier(n) { return n >= 30 ? 3 : n >= 20 ? 2 : n >= 10 ? 1 : 0; }

  function renderAnvil(state) {
    rebuildAnvil(state);
    const grid = state.run.grid;
    const sockets = {};
    sim.sockets(state, cfg()).forEach((s) => { sockets[s.cell] = s; });
    let hint = [];
    if (state.meta.outpost && state.meta.outpost.pet === 'fox') {
      const seen = {};
      let lowest = Infinity;
      sim.openCells(state, cfg()).forEach((cell) => {
        const level = grid[cell];
        if (!level) return;
        if (seen[level] !== undefined && level < lowest) { hint = [seen[level], cell]; lowest = level; }
        else if (seen[level] === undefined) seen[level] = cell;
      });
    }
    const t = now();
    for (const k in view.cells) {
      const i = Number(k);
      const n = grid[i];
      const s = sockets[i];
      const crit = (view.critUntil[i] || 0) > t;
      const lifted = view.drag && view.drag.from === i && view.drag.moving;
      const target = view.drag && view.drag.target === i;
      const foxHint = hint.indexOf(i) >= 0;
      const selected = !!view.selected && view.selected.cell === i && view.selected.level === n;
      const key = n + '|' + (s ? s.rune : '') + '|' + crit + '|' + lifted + '|' + target + '|' + foxHint + '|' + selected;
      if (view.cellKey[i] === key) continue;
      view.cellKey[i] = key;
      const el = view.cells[i];
      el.className = 'mf-cell' + (n ? ' full tier-' + tier(n) : '') + (s ? ' rune rune-' + s.rune : '') + (crit ? ' crit' : '') + (lifted ? ' lifted' : '') + (target ? ' target' : '') + (foxHint ? ' fox-hint' : '') + (selected ? ' selected' : '');
      el.setAttribute('aria-pressed', String(selected));
      el.setAttribute('aria-label', n ? tx('Клинок ур. {} · выбрать действия', n) : tx('Пустая клетка'));
      el.title = foxHint ? tx('Лиса заметила пару для слияния') : '';
      el.textContent = '';
      if (n) {
        const art = h('span', { class: 'mf-art' });
        putBlade(art, n);
        el.append(art, h('span', { class: 'mf-lvl g-num' }, String(n)));
      }
      if (s) el.append(h('span', { class: 'mf-rune-mark', 'aria-label': RUNE_LABEL[s.rune], html: MFArt.svg('rune', s.rune) }));
    }
  }

  function cellAt(x, y) {
    let best = -1;
    for (const k in view.cells) {
      const r = view.cells[k].getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) best = Number(k);
    }
    return best;
  }

  /** Released near a blade of the same level: that one (the snap), else -1. */
  function snapAt(x, y, from) {
    const level = g.state.run.grid[from];
    let best = -1;
    let bestD = Infinity;
    for (const k in view.cells) {
      const i = Number(k);
      if (i === from || g.state.run.grid[i] !== level) continue;
      const r = view.cells[k].getBoundingClientRect();
      const d = Math.hypot(x - (r.left + r.width / 2), y - (r.top + r.height / 2));
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best >= 0 && bestD <= (view.cell || 64) * SNAP ? best : -1;
  }

  function overChest(x, y) {
    const r = view.chest.getBoundingClientRect();
    return x >= r.left - 8 && x <= r.right + 8 && y >= r.top - 8 && y <= r.bottom + 8;
  }

  function gestures() {
    view.anvil.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { clearSelection(); return; }
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const cell = e.target.closest('[data-cell]');
      if (!cell || cell.classList.contains('shut')) return;
      e.preventDefault(); tapCell(Number(cell.dataset.cell));
    });
    view.anvil.addEventListener('pointerdown', (e) => {
      const el = e.target.closest('.mf-cell');
      if (!el || el.classList.contains('shut')) return;
      const cell = Number(el.dataset.cell);
      if (!g.state.run.grid[cell]) return;
      e.preventDefault();
      try { view.anvil.setPointerCapture(e.pointerId); } catch (ignored) { /* the pointer is gone */ }
      view.drag = { from: cell, x: e.clientX, y: e.clientY, id: e.pointerId, moving: false, target: -1, ghost: null };
    });
    view.anvil.addEventListener('pointermove', (e) => {
      const d = view.drag;
      if (!d || d.id !== e.pointerId) return;
      if (!d.moving && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 8) {
        d.moving = true;
        d.ghost = h('div', { class: 'mf-ghost' });
        putBlade(d.ghost, g.state.run.grid[d.from]);
        d.ghost.style.width = (view.cell || 64) + 'px';
        d.ghost.style.height = (view.cell || 64) + 'px';
        document.body.append(d.ghost);
      }
      if (!d.moving) return;
      d.ghost.style.left = (e.clientX - (view.cell || 64) / 2) + 'px';
      d.ghost.style.top = (e.clientY - (view.cell || 64) / 2) + 'px';
      const snap = snapAt(e.clientX, e.clientY, d.from);
      d.target = snap >= 0 ? snap : cellAt(e.clientX, e.clientY);
      d.ghost.classList.toggle('sell', overChest(e.clientX, e.clientY));
      renderAnvil(g.state);
    });
    const end = (e, cancel) => {
      const d = view.drag;
      if (!d || d.id !== e.pointerId) return;
      view.drag = null;
      if (d.ghost) d.ghost.remove();
      view.cellKey = {};
      if (cancel) return g.redraw();
      if (!d.moving) return tapCell(d.from);
      if (overChest(e.clientX, e.clientY)) return sell(d.from);
      const snap = snapAt(e.clientX, e.clientY, d.from);
      const to = snap >= 0 ? snap : cellAt(e.clientX, e.clientY);
      if (to >= 0 && to !== d.from) drop(d.from, to);
      else g.redraw();
    };
    view.anvil.addEventListener('pointerup', (e) => end(e, false));
    view.anvil.addEventListener('pointercancel', (e) => end(e, true));
  }

  function tapCell(cell) {
    const t = now();
    const last = view.lastTap;
    view.lastTap = { cell, t };
    if (last && last.cell === cell && t - last.t < DOUBLE_MS) {
      view.lastTap = null;
      clearSelection();
      const r = g.act((s) => sim.mergeNearest(s, cfg(), cell, now()));
      if (r && r.kind === 'merge') merged(r);
      else g.sfx('deny');
      return;
    }
    const n = g.state.run.grid[cell];
    if (!n) return clearSelection();
    view.selected = { cell, level: n };
    const b = bladeInfo(n);
    const hit = Big.mul(sim.dmgMult(g.state, cfg(), now()), sim.cellPower(g.state, cfg(), cell));
    const rune = sim.runeAt(g.state, cfg(), cell);
    view.info.textContent = rune
      ? tx('{} · ур. {} · удар {} · руна: {}', b.title, n, g.fmt(hit), RUNE_WORD[rune.rune])
      : tx('{} · ур. {} · удар {}', b.title, n, g.fmt(hit));
    view.infoUntil = t + 4000;
    view.selectionBadge.textContent = tx('Ур. {} ×', n);
    view.selectionBadge.setAttribute('aria-label', view.info.textContent + '. ' + tx('Снять выбор'));
    view.selectionBadge.title = view.info.textContent;
    g.redraw();
  }

  function selectionValid() {
    return !!view.selected && g.state.run.grid[view.selected.cell] === view.selected.level;
  }

  function clearSelection() {
    view.selected = null;
    view.lastTap = null;
    if (g) g.redraw();
  }

  function bladeAction(kind) {
    if (!selectionValid()) return clearSelection();
    closeSheet();
    view.outpost.open(kind === 'feed' ? 'dragon' : 'heroes', Object.assign({ kind, source: 'grid' }, view.selected));
  }

  function drop(from, to) {
    clearSelection();
    const r = g.act((s) => sim.move(s, cfg(), from, to, now()));
    if (!r) return g.sfx('deny');
    if (r.kind === 'merge') merged(r);
    else g.sfx('tap');
  }

  function merged(r) {
    g.sfx('merge');
    g.buzz([12]);
    const b = bladeInfo(r.level);
    view.info.textContent = tx('{} · ур. {}', b.title, r.level);
    view.infoUntil = now() + 3000;
  }

  function sell(cell) {
    const n = g.state.run.grid[cell];
    if (!n) return;
    const price = sim.sellPrice(g.state, cfg(), n);
    const doSell = () => {
      if (g.state.run.grid[cell] !== n) {
        g.flash('info', 'Клинок изменился', 'Выберите клинок снова');
        return;
      }
      const got = g.act((s) => sim.sell(s, cfg(), cell), { now: true, reason: 'action' });
      if (got) {
        clearSelection();
        g.sfx('sell');
        g.flash('coin', 'Продано', tx('{}: +{}', bladeInfo(n).title, g.fmt(got)));
      }
    };
    if (n <= sim.forgeLevel(g.state, cfg()) + cfg()['sell.confirmAbove']) return doSell();
    const btn = h('button', { class: 'g-btn primary', id: 'sell-hold' }, tx('Держите, чтобы продать за {}', g.fmt(price)));
    g.ui.hold(btn, 900, () => {
      closeSheet();
      doSell();
    });
    openSheet('sell', [h('h3', {}, tx('Продать «{}»?', bladeInfo(n).title)),
      h('div', { class: 'mf-row mf-sell' }, bladePic(n), h('div', { class: 'grow mf-row-d' }, tx('Клинок {}-го уровня — выше горна. Его не вернуть.', n))),
      h('div', { class: 'g-btns' }, btn)]);
  }

  // ---- actions ----

  function prepareFight(kind) {
    if (!g.act((s) => sim.prepare(s, cfg(), kind))) return;
    g.sfx('tap');
    g.buzz('tap');
    size();
  }

  function sortAnvil() {
    if (view.drag) return;
    clearSelection();
    const changed = g.act((s) => sim.sortGrid(s, cfg()));
    view.cellKey = {};
    view.critUntil = {};
    view.info.textContent = tx(changed ? 'Клинки по уровню · руны на своих местах' : 'Клинки уже отсортированы');
    view.infoUntil = now() + 2400;
    if (changed) {
      g.sfx('tap');
      g.buzz('tap');
    }
    g.redraw();
  }

  function tapForge() {
    const before = g.state.run.stats.sold;
    const ok = g.act((s) => sim.tap(s, cfg(), g.rng, now()));
    if (ok) {
      g.sfx(g.state.run.stats.sold > before ? 'sell' : 'forge');
      g.buzz('tap');
    }
  }

  function retry() {
    if (g.act((s) => sim.retry(s, cfg()))) g.sfx('boss');
  }

  function cry() {
    if (g.act((s) => sim.cry(s, cfg(), now()))) {
      g.sfx('boss');
      g.buzz([40, 30, 40]);
    } else g.sfx('deny');
  }

  async function blow() {
    const r = await g.links.spend('bellows');
    if (r && r.ok) {
      g.act((s) => sim.bellows(s, cfg(), now()), { now: true, reason: 'spend' });
      g.sfx('level');
      g.flash('energy', 'Горн раздут', tx('{} мин клинки идут быстрее', cfg()['bellows.minutes']));
    } else if (r && r.off) g.flash('energy', 'Шаги выключены', 'Связка «Шаги — топливо» выключена');
    else g.flash('energy', 'Не хватает энергии', 'Пройдитесь пешком — шаги дают энергию');
  }

  function acceptEvent() {
    const r = g.act((s) => sim.acceptEvent(s, cfg(), now()), { now: true, reason: 'action' });
    if (!r) return g.sfx('deny');
    g.sfx(r.id === 'caravan' ? 'chest' : 'level');
    if (r.id === 'caravan') g.flash('chest', 'Сундук каравана', '+' + g.fmt(r.gold));
    if (r.id === 'wanderer') g.flash('sword', 'Странник обменял клинки', bladeInfo(r.level).title);
  }

  function buyUp(id) {
    const before = sim.upgradeProgress(g.state, cfg(), id);
    const ok = g.act((s) => sim.buyUp(s, cfg(), id));
    g.sfx(ok ? 'buy' : 'deny');
    if (ok) g.buzz('buy');
    if (ok && before.supported && before.nextAt === before.level + 1) {
      const p = sim.upgradeProgress(g.state, cfg(), id);
      g.flash('sparkle', tx('Рубеж {} достигнут', p.level), tx('Бонус к эффекту улучшения: {}', pct(p.factor - 1)));
    }
    if (ok && id === 'wide') view.shapeKey = '';
    view.panelKey = '';
  }

  function buyMf(id) {
    const ok = g.act((s) => sim.buyMf(s, cfg(), id), { now: true, reason: 'action' });
    g.sfx(ok ? 'buy' : 'deny');
    view.masterKey = '';
  }

  // ---- sheets ----

  function openSheet(kind, content) {
    closeSheet();
    const origin = document.activeElement;
    const body = h('div', { class: 'mf-sheet-content', role: 'dialog', 'aria-modal': 'true', 'aria-label': tx(kind === 'master' ? 'Горн мастера' : kind === 'up' ? 'Улучшения' : 'Продать') }, content);
    view.sheetKind = kind;
    view.sheet = g.sheet(body, () => {
      view.sheet = null;
      view.sheetKind = '';
      if (origin && origin.isConnected && origin.focus) origin.focus({ preventScroll: true });
    });
    body.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); closeSheet(); return; }
      if (event.key !== 'Tab') return;
      const targets = [...body.querySelectorAll('button:not([disabled]),input:not([disabled]),summary,[tabindex="0"]')].filter(node => node.getClientRects().length && !node.closest('[hidden]') && ![...body.querySelectorAll('details:not([open])')].some(detail => detail.contains(node) && !detail.querySelector('summary').contains(node)));
      if (!targets.length) return;
      if (event.shiftKey && document.activeElement === targets[0]) { event.preventDefault(); targets[targets.length - 1].focus(); }
      else if (!event.shiftKey && document.activeElement === targets[targets.length - 1]) { event.preventDefault(); targets[0].focus(); }
    });
    const close = body.querySelector('#forge-sheet-close');
    if (close) close.focus({ preventScroll: true });
  }

  function sheetHeading(title) {
    return h('div', { class: 'mf-sheet-head' }, h('h3', {}, tx(title)), h('button', { class: 'g-btn small', id: 'forge-sheet-close', onclick: closeSheet }, tx('Закрыть')));
  }

  function closeSheet() {
    if (view.sheet) view.sheet();
    view.sheet = null;
    view.sheetKind = '';
  }

  function openUpgrades() {
    if (g.layout === 'wide') return;
    view.upList = h('div', { class: 'mf-uplist', id: 'up-list' });
    view.panelKey = '';
    openSheet('up', [sheetHeading('Улучшения'), view.upList]);
    fillUpgrades(view.upList, true);
  }

  function openMaster(wanted) {
    view.mfBox = h('div', { class: 'mf-master', id: 'master-sheet' });
    view.masterKey = '';
    view.masterTab = typeof wanted === 'string' ? wanted : view.masterTab || 'tree';
    openSheet('master', [sheetHeading('Горн мастера'), view.mfBox]);
    const dialog = view.mfBox.closest('.sheet');
    if (dialog) { dialog.classList.add('mf-workshop-dialog'); dialog.parentElement.classList.add('mf-workshop-backdrop'); }
    fillMaster(true);
  }

  /** A blade as a picture of a row: the drawing in a tile and its level in the corner. */
  function bladePic(n) {
    const art = h('span', { class: 'mf-ev-art' });
    putBlade(art, n);
    return h('span', { class: 'mf-ic mf-ev-pic' }, art, h('span', { class: 'mf-ic-lvl g-num' }, String(n)));
  }

  /**
   * A row of a list: the picture (the level bought in its corner, a lock when shut), the title,
   * what it gives — the whole text, it wraps — and the button or the mark on the right.
   */
  function row(o) {
    const pic = MFArt.el(o.set, o.id);
    if (o.level) pic.append(h('span', { class: 'mf-ic-lvl g-num' }, String(o.level)));
    if (o.locked) pic.append(MFArt.el('ui', 'lock', 'mf-ic-lock'));
    const el = h('div', { class: 'mf-row' + (o.cls ? ' ' + o.cls : '') }, pic,
      h('div', { class: 'grow' }, h('div', { class: 'mf-row-t' }, o.title), h('div', { class: 'mf-row-d' }, o.text, o.now ? h('span', { class: 'mf-now' }, o.now) : null), o.progress || null),
      o.side);
    if (o.attr) el.setAttribute(o.attr, o.id);
    return el;
  }

  /** The button of a purchase: the price and, under it, the level it buys. */
  function buyButton(can, price, level, onclick) {
    return h('button', { class: 'g-btn small mf-buy' + (can ? ' primary' : ''), disabled: !can, onclick },
      h('span', { class: 'g-num' }, price), h('span', { class: 'g-sub g-num' }, tx('ур. {}', level)));
  }

  /** The mark in place of the button: bought once («есть») or at the limit other numbers set («предел»). */
  function mark(text, done) {
    return h('span', { class: 'mf-mark' + (done ? ' done' : '') }, done ? MFArt.el('ui', 'check', 'mf-mark-ic') : null, h('span', {}, text));
  }

  const DESC = {
    bellows: (c) => tx('Горн быстрее на {}', pct(c['up.bellows.step'])),
    steel: () => tx('Клинок из горна на уровень выше'),
    sharp: (c) => tx('Весь урон +{}', pct(c['up.sharp.step'])),
    purse: (c) => tx('Золото +{}', pct(c['up.purse.step'])),
    eye: (c) => tx('Шанс крита +{}', pct(c['up.eye.step'])),
    hand: (c) => tx('Множитель крита +{}', g.fmt(c['up.hand.step'])),
    wide: () => tx('Ещё одна клетка наковальни'),
    twin: (c) => tx('Клинков из горна больше на {}', pct(c['up.twin.step'])),
    melt: (c) => tx('Шанс клинка на уровень выше +{}', pct(c['up.melt.step'])),
    apprentice: () => tx('Сам сливает пары, чаще с каждым уровнем'),
    hourglass: (c) => tx('Таймер босса +{} с', c['up.hourglass.step']),
    hunter: (c) => tx('Золото с босса +{}', pct(c['up.hunter.step'])),
    temper: (c) => tx('Урон клинков от {}-го уровня +{}', c['temper.fromLevel'], pct(c['up.temper.step'])),
    runeMason: () => tx('Ещё одно гнездо руны'),
    runePower: (c) => tx('Руны сильнее на {}', pct(c['up.runePower.step'])),
    caravan: (c) => tx('События чаще на {}', pct(c['up.caravan.step'])),
    night: (c) => tx('Офлайн-доход +{}', pct(c['up.night.step'])),
    cry: (c) => tx('Кнопка: урон +{} на {} с', pct(c['up.cry.step']), c['cry.sec']),
    remelt: (c) => tx('Продажа клинка даёт на {} цены больше', pct(c['up.remelt.step'])),
    banner: (c) => tx('Урон +{} за каждую десятку волн', pct(c['up.banner.step'])),
    hammer: () => tx('Ручной удар сильнее; прирост постепенно уменьшается'),
    stall: () => tx('Дороже продаёт обычные клинки и излишки ковки')
  };

  /** What the upgrade gives now, in a few words ('' before the first level where there is nothing to say). */
  function nowText(state, id) {
    const c = cfg();
    const n = sim.upgradeEffective(state, c, id);
    if (id === 'bellows') return tx('{} с на клинок', g.fmt(sim.forgeInterval(state, c, 0), { digits: 2 }));
    if (id === 'steel') return tx('горн {}-го уровня', sim.forgeLevel(state, c));
    if (id === 'eye') return tx('крит {}', pct(sim.critChance(state, c)));
    if (id === 'hand') return tx('крит ×{}', g.fmt(sim.critMult(state, c), { digits: 2 }));
    if (id === 'apprentice') return sim.apprenticeInterval(state, c) ? tx('раз в {} с', g.fmt(sim.apprenticeInterval(state, c) / sim.apprenticeSpeed(state, c), { digits: 1 })) : tx('нет');
    if (id === 'hourglass') return tx('таймер {} с', sim.bossTimer(state, c));
    if (id === 'wide') return tx('{} клеток', sim.openCells(state, c).length);
    if (id === 'night') return tx('офлайн {}', pct(sim.offlineShare(state, c)));
    if (id === 'remelt') return tx('продажа {}', pct(sim.sellShare(state, c)));
    if (id === 'hammer') return tx('один тап: −{} с', g.fmt(sim.tapSeconds(state, c, now()), { digits: 2 }));
    if (id === 'stall') return tx('выручка ×{}', g.fmt(sim.saleMult(state, c), { digits: 2 }));
    if (id === 'runeMason') return tx('гнёзд {}', sim.socketCount(state, c));
    if (!n) return '';
    if (id === 'melt') {
      const p = n * c['up.melt.step'];
      return p >= 1 ? tx('сейчас +{} ур. и шанс {}', Math.floor(p), pct(p - Math.floor(p))) : tx('сейчас {}', pct(p));
    }
    if (id === 'runePower') return tx('руны ×{}', g.fmt(sim.runePower(state, c), { digits: 2 }));
    if (id === 'caravan') return tx('сейчас +{}', pct(sim.eventSpeed(state, c) - 1));
    if (id === 'banner') return tx('сейчас +{}', pct(c['up.banner.step'] * n * Math.floor(state.run.maxWave / 10)));
    return tx('сейчас +{}', pct(c['up.' + id + '.step'] * n));
  }

  function fillUpgrades(box, force) {
    const state = g.state;
    const c = cfg();
    const groups = [
      { id: 'forge', title: 'Ковка', items: ['bellows', 'steel', 'wide', 'twin', 'melt', 'apprentice', 'hammer'] },
      { id: 'battle', title: 'Бой', items: ['sharp', 'eye', 'hand', 'hourglass', 'temper', 'runeMason', 'runePower', 'cry', 'banner'] },
      { id: 'income', title: 'Доход', items: ['purse', 'hunter', 'caravan', 'night', 'remelt', 'stall'] }
    ];
    view.upTab = view.upTab || 'forge';
    const group = groups.find(item => item.id === view.upTab) || groups[0];
    const rows = sim.UP.filter((u) => group.items.includes(u.id) && (!u.rune || sim.runesOpen(state, c)));
    const artifacts = state.meta.artifacts && state.meta.artifacts.items || {};
    const effects = state.run.artifacts && state.run.artifacts.effects || {};
    const artifactKey = JSON.stringify([Object.keys(artifacts).map(id => [id, artifacts[id].level, artifacts[id].enabled]), Object.keys(effects).filter(id => effects[id].left > 0).map(id => [id, effects[id].power])]);
    const key = view.upTab + ':' + rows.map((u) => lvl(state, u.id) + (sim.upUnlocked(state, c, u.id) ? 'o' : 'l') + (sim.upOpen(state, c, u.id) && Big.gte(state.run.gold, sim.upCost(state, c, u.id)) ? 'y' : 'n')).join(',') +
      '|' + sim.socketCount(state, c) + '|' + (state.run.runes || []).join(',') + '|' + (state.run.bellowsUntil > now()) + '|' + Math.floor(state.run.maxWave / 10) + '|' + JSON.stringify(sim.forgeLayer(state).state.mf) + '|' + artifactKey;
    if (!force && key === view.panelKey && box.childNodes.length) return;
    view.panelKey = key;
    const focused = box.contains(document.activeElement) ? document.activeElement : null;
    const focusBuy = focused && focused.dataset.buy, focusTab = focused && focused.dataset.upgradeTab;
    box.textContent = '';
    const tabs = h('div', { class: 'mf-up-tabs', role: 'tablist', 'aria-label': tx('Улучшения') });
    groups.forEach(item => tabs.append(h('button', { class: 'g-btn small' + (item.id === group.id ? ' selected' : ''), role: 'tab', 'aria-selected': String(item.id === group.id), tabindex: item.id === group.id ? 0 : -1, 'data-upgrade-tab': item.id, onclick: () => { view.upTab = item.id; fillUpgrades(box, true); box.querySelector('[data-upgrade-tab="' + item.id + '"]').focus({ preventScroll: true }); } }, tx(item.title))));
    tabs.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      const list = [...tabs.querySelectorAll('button')], index = list.indexOf(event.target);
      if (index < 0) return;
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? list.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : list.length - 1)) % list.length;
      list[next].click();
    });
    box.append(tabs);
    const blowing = state.run.bellowsUntil > now();
    if (group.id === 'forge') box.append(row({ set: 'ui', id: 'blow', cls: 'mf-blow', title: 'Раздуть горн',
      text: blowing ? tx('Горн раздут ещё {}', g.fmt.time(Math.ceil((state.run.bellowsUntil - now()) / 1000))) : tx('{} мин горн вдвое быстрее, за 1 энергию шагов', cfg()['bellows.minutes']),
      side: h('button', { class: 'g-btn small', id: 'blow', onclick: blow }, GameIcons.el('energy'), 'Раздуть') }));
    const sockets = sim.sockets(state, c);
    if (group.id === 'battle' && sockets.length) {
      box.append(h('div', { class: 'mf-sec' }, 'Руны'));
      sockets.forEach((s, k) => {
        box.append(h('div', { class: 'mf-row mf-rune-row' }, MFArt.el('rune', s.rune), h('div', { class: 'mf-row-t' }, tx('Гнездо {}', k + 1)),
          h('div', { class: 'mf-seg mf-pick' }, sim.RUNES.map((rune) => h('button', {
            class: s.rune === rune ? 'on' : '', 'data-rune': rune,
            onclick: () => { g.act((st) => sim.setRune(st, cfg(), s.index, rune)); view.panelKey = ''; view.cellKey = {}; g.sfx('tap'); }
          }, RUNE_TITLE[rune])))));
      });
    }
    rows.forEach((u) => {
      const open = sim.upOpen(state, c, u.id);
      const price = sim.upCost(state, c, u.id);
      const can = open && Big.gte(state.run.gold, price);
      const n = lvl(state, u.id);
      const unlocked = sim.upUnlocked(state, c, u.id);
      const requirement = u.id === 'hammer' ? tx('Откроется с волны {}', c['up.hammer.fromWave']) : tx('Откроется с волны {} или после {} продаж', c['up.stall.fromWave'], c['up.stall.fromSold']);
      let side;
      if (open) {
        side = buyButton(can, g.fmt.price(price), n + 1, () => buyUp(u.id));
        side.dataset.buy = u.id;
      } else side = mark(tx(unlocked ? 'предел' : 'закрыто'), false);
      const progression = sim.upgradeProgress(state, c, u.id);
      let description = DESC[u.id] ? DESC[u.id](c) : '';
      if (progression.supported && !['caravan', 'hammer', 'stall'].includes(u.id)) {
        const nextConfig = Object.assign({}, c);
        nextConfig['up.' + u.id + '.step'] *= progression.nextEffective - progression.effective;
        description = tx('Следующий уровень: {}', DESC[u.id](nextConfig));
      }
      let progress;
      if (unlocked && progression.supported && progression.nextAt) {
        const at = sim.upgradeProgress(state, c, u.id, progression.nextAt);
        const jump = progression.nextMilestoneJump / (at.factor - progression.nextMilestoneJump);
        const done = n % 10;
        progress = h('div', { class: 'mf-milestone' + (done === 9 ? ' near' : ''), 'data-milestone': u.id, 'data-next-level': progression.nextAt },
          h('div', { class: 'mf-milestone-copy' }, h('strong', {}, tx('Рубеж {}', progression.nextAt)), h('span', {}, tx('эффект +{}', g.fmt.pct(jump, { digits: 2 })))),
          h('div', { class: 'mf-milestone-track', role: 'progressbar', 'aria-label': tx('До рубежа {}', progression.nextAt), 'aria-valuemin': 0, 'aria-valuemax': 10, 'aria-valuenow': done }, h('i', { style: 'width:' + done * 10 + '%' })));
        progress.title = tx('Развитие усиливает вклад этого улучшения. Текущий бонус: {}. Рубежи повторяются каждые 10 уровней; на 50 и 100 прибавка больше.', g.fmt.pct(progression.factor - 1, { digits: 2 }));
      }
      box.append(row({ set: 'up', id: u.id, attr: 'data-up', level: n, title: u.title, locked: !unlocked, cls: unlocked ? '' : 'locked', text: unlocked ? description : requirement, now: unlocked ? nowText(state, u.id) : '', progress, side }));
    });
    const restore = focusBuy ? box.querySelector('[data-buy="' + focusBuy + '"]') : focusTab ? box.querySelector('[data-upgrade-tab="' + focusTab + '"]') : null;
    if (restore && !restore.disabled) restore.focus({ preventScroll: true });
  }

  /** What the next level of a node of «Горн мастера» gives. */
  const MF_DESC = {
    startGold: (c, n) => tx('Забег начинается с {} золота', g.fmt(sim.startGoldAt(c, n + 1))),
    rush: (c) => tx('Первые {} волн — золото ×{}', c['mf.rush.waves'], c['mf.rush.mult']),
    startLevel: () => tx('Горн начинает на уровень выше'),
    auto: (c, n) => tx('Горн сам стучит: {} тапа в секунду', g.fmt(sim.autoTaps(c, n + 1), { digits: 2 })),
    rune: (c, n) => (c['rune.base'] + n < sim.SOCKETS.length
      ? tx('Ещё одно гнездо руны с начала забега, руны сильнее на {}', pct(c['mf.rune.power']))
      : tx('Руны сильнее на {}', pct(c['mf.rune.power']))),
    memory: (c) => tx('После перековки остаётся лучший клинок, до {}-го уровня', c['mf.memory.maxLevel']),
    rhythm: () => tx('Питомец быстрее накапливает помощь для кузни'),
    trade: () => tx('Постоянно повышает выручку от продажи клинков'),
    team: () => tx('Два героя одновременно участвуют в бою'),
    dragonCare: () => tx('Дракон быстрее переваривает клинки'),
    command: () => tx('Три героя одновременно участвуют в бою')
  };

  /** What the levels bought give now ('' when nothing is bought or there is nothing to add). */
  function mfNow(c, id, n) {
    if (!n) return '';
    if (id === 'startGold') return tx('сейчас {}', g.fmt(sim.startGoldAt(c, n)));
    if (id === 'startLevel') return tx('сейчас +{} ур.', n);
    if (id === 'auto') return tx('сейчас {} в секунду', g.fmt(sim.autoTaps(c, n), { digits: 2 }));
    if (id === 'rune') return tx('сейчас +{}', pct(c['mf.rune.power'] * n));
    if (id === 'trade') return tx('выручка ×{}', g.fmt(sim.saleMult(g.state, c), { digits: 2 }));
    if (id === 'rhythm' || id === 'dragonCare') return tx('ур. {} · прирост постепенно уменьшается', n);
    return '';
  }

  function fillMaster(force) {
    const box = view.mfBox;
    if (!box || view.sheetKind !== 'master') return;
    const state = g.state;
    const c = cfg();
    const l = sim.forgeLayer(state);
    const key = view.masterTab === 'artifacts' ? 'artifacts' : view.masterTab + '|' + l.currency + '|' + JSON.stringify(l.state.mf) + '|' + Object.keys(state.meta.album || {}).length + '|' + sim.ingots(state);
    if (!force && key === view.masterKey) return;
    view.masterKey = key;
    box.textContent = '';
    const tabs = h('div', { class: 'mf-seg mf-tabs' },
      h('button', { class: view.masterTab === 'tree' ? 'on' : '', id: 'tab-tree', title: tx('Угли и дерево'), onclick: () => { view.masterTab = 'tree'; fillMaster(true); } }, tx('Дерево')),
      view.artifacts ? h('button', { class: view.masterTab === 'artifacts' ? 'on' : '', id: 'tab-artifacts', onclick: () => { view.masterTab = 'artifacts'; fillMaster(true); } }, tx('Артефакты')) : null,
      h('button', { class: view.masterTab === 'album' ? 'on' : '', id: 'tab-album', title: tx('Альбом металлов'), onclick: () => { view.masterTab = 'album'; fillMaster(true); } }, tx('Металлы')));
    box.append(tabs);
    if (view.masterTab === 'artifacts' && view.artifacts) { view.artifacts.render(state); box.append(view.artifacts.element); return; }
    if (view.masterTab === 'album') return fillAlbum(box, state);
    const coals = Big.of(l.currency, 0);
    const rec = Math.max(state.run.maxWave, l.state.record);
    box.append(h('div', { class: 'g-lines' },
      g.ui.line('Углей', g.fmt(coals)),
      g.ui.line('Бонус углей', tx('+{} урона и золота', pct(c['coals.bonus'] * sim.coalsAll(state)))),
      g.ui.line('Рекорд волны', String(rec)),
      sim.ingots(state) ? g.ui.line('Звёздные слитки', tx('{} · ×{} ко всему', g.fmt(sim.ingots(state)), g.fmt(sim.starMult(state, c)))) : null));
    const gain = sim.coalsFor(c, state.run.maxWave);
    let nextWave = c['coals.fromWave'];
    while (sim.coalsFor(c, nextWave) <= l.state.paid && nextWave < 100000) nextWave++;
    box.append(h('p', { class: 'g-note' }, gain > l.state.paid
      ? tx('Перековка сейчас даст углей: {}. Угли платятся только за прирост рекорда.', gain - l.state.paid)
      : tx('Следующий уголь — с волны {} в забеге. Угли платятся только за прирост рекорда.', nextWave)));
    const pb = g.ui.prestigeButton('forge', { label: 'Перековка' });
    pb.id = 'prestige-forge';
    box.append(h('div', { class: 'g-btns' }, pb));
    box.append(h('div', { class: 'mf-sec' }, 'Дерево углей'));
    box.append(h('p', { class: 'g-note' }, tx('У узлов дерева нет последнего уровня: каждый следующий дороже. Разовые открытия покупаются один раз.')));
    sim.MF.forEach((d) => {
      const open = sim.mfOpen(state, c, d.id);
      const lv = sim.mfLevel(state, d.id);
      const need = d.needs && sim.mfLevel(state, d.needs) < 1 ? sim.MF.filter((x) => x.id === d.needs)[0] : null;
      const price = sim.mfCost(state, c, d.id);
      const can = open && Big.gte(coals, price);
      const owned = d.single && lv >= 1;
      box.append(row({ set: 'mf', id: d.id, attr: 'data-mf', cls: need ? 'locked' : '', locked: !!need, level: d.single ? 0 : lv, title: d.title,
        text: need ? tx('Сначала «{}»', need.title) : MF_DESC[d.id](c, lv), now: need || owned ? '' : mfNow(c, d.id, lv),
        side: owned ? mark(tx('есть'), true) : buyButton(can, tx('{} угл.', g.fmt(price)), lv + 1, () => buyMf(d.id)) }));
    });
    box.append(h('div', { class: 'mf-sec' }, 'Звёздный металл'));
    const total = l.state.total;
    if (total < c['star.fromCoals'] && !sim.ingots(state)) {
      box.append(h('p', { class: 'g-note' }, tx('Откроется после {} углей за все перековки (сейчас {}). Сбросит угли и дерево ради слитков: каждый — ×{} ко всему и двойные клинки.', g.fmt(c['star.fromCoals']), g.fmt(total), c['star.mult'])));
    } else {
      const sb = g.ui.prestigeButton('star', { label: 'Звёздный металл' });
      sb.id = 'prestige-star';
      box.append(h('p', { class: 'g-note' }, tx('Каждый слиток — ×{} ко всему. Со слитком три одинаковых клинка сливаются в один на два уровня выше.', c['star.mult'])), h('div', { class: 'g-btns' }, sb));
    }
  }

  function fillAlbum(box, state) {
    const album = state.meta.album || {};
    const top = Math.max(40, state.meta.bestLevel || 1);
    const grid = h('div', { class: 'mf-album', id: 'album' });
    for (let n = 1; n <= top; n++) {
      const seen = !!album[n];
      const cell = h('div', { class: 'mf-alb' + (seen ? '' : ' unseen') });
      const art = h('span', { class: 'mf-art' });
      // A level not forged yet shows as the dark outline of its base, never the artist's picture.
      if (seen) putBlade(art, n);
      else art.innerHTML = bladeSvg(n);
      cell.append(art, h('span', { class: 'mf-alb-t' }, seen ? bladeInfo(n).title : '?'), h('span', { class: 'mf-lvl g-num' }, String(n)));
      grid.append(cell);
    }
    box.append(h('p', { class: 'g-note' }, tx('Открыто металлов: {}', Object.keys(album).length)), grid);
  }

  // ---- render ----

  function renderEvent(state) {
    const e = state.run.event;
    const t = now();
    let key = '';
    if (e && !e.done && t <= e.until) key = e.id + ':' + e.until;
    else if (state.run.starfallUntil > t) key = 'starfall-left';
    if (state.run.stormLeft > 0 && !key) key = 'storm-left';
    const left = e ? Math.max(0, Math.ceil((e.until - t) / 1000)) : 0;
    if (key !== view.lastEvent) {
      view.lastEvent = key;
      view.event.textContent = '';
      view.event.hidden = !key;
      if (!key) return;
      const ev = view.events || {};
      const id = key.split(':')[0].replace('-left', '');
      const decl = ev[id] || { title: id, text: '' };
      let title = decl.title;
      let text = e && e.level ? tx(String(decl.text || ''), e.level) : String(decl.text || '');
      if (id === 'caravan') {
        if (view.caravanFor !== e.until) {
          view.caravanFor = e.until;
          view.caravan = null;
          g.stock.take('caravan').then((item) => { if (item) view.caravan = item; view.lastEvent = ''; g.redraw(); }).catch(() => {});
        }
        if (view.caravan) {
          title = view.caravan.title;
          text = view.caravan.text;
        }
      }
      view.eventLeft = h('span', { class: 'mf-ev-left g-num' });
      // The title, the whole text (it wraps, nothing is cut), then the time left and the reward;
      // the button of the offer takes its own row under them, so the text keeps the card's width.
      const body = h('div', { class: 'grow' }, h('div', { class: 'mf-ev-t' }, title), text ? h('div', { class: 'mf-ev-d' }, text) : null, h('div', { class: 'mf-ev-m' }, view.eventLeft));
      const btns = [];
      if (id === 'caravan') btns.push(h('button', { class: 'g-btn small primary mf-ev-go', id: 'event-accept', onclick: acceptEvent }, h('span', {}, decl.accept || 'Забрать'), h('span', { class: 'g-sub g-num' }, '+' + g.fmt(e.gold))));
      if (id === 'wanderer') btns.push(h('button', { class: 'g-btn small primary mf-ev-go', id: 'event-accept', onclick: acceptEvent }, decl.accept || 'Обменять'));
      btns.push(h('button', { class: 'icon-btn mf-ev-x', 'aria-label': 'Скрыть', onclick: () => { g.act((s) => sim.dismissEvent(s)); view.lastEvent = ''; } }, GameIcons.el('close')));
      // The king's order and the wanderer show the blade they are about, with its level.
      let pic = MFArt.el('ev', MFArt.sets.ev[id] ? id : 'order', 'mf-ev-pic');
      if ((id === 'order' || id === 'wanderer') && e && e.level) pic = bladePic(e.level);
      view.event.append(pic, body, ...btns);
    }
    if (view.eventLeft) {
      if (key === 'starfall-left' || (e && e.id === 'starfall')) view.eventLeft.textContent = tx('{} с', Math.max(0, Math.ceil((state.run.starfallUntil - t) / 1000)));
      else if (key === 'storm-left' || (e && e.id === 'storm')) view.eventLeft.textContent = tx('ещё {}', state.run.stormLeft);
      else if (e && e.id === 'order') view.eventLeft.textContent = tx('осталось {} · награда {}', g.fmt.time(left), g.fmt(e.reward));
      else view.eventLeft.textContent = tx('{} с', left);
    }
  }

  function render(state) {
    const c = cfg();
    const r = state.run;
    const t = now();
    const encounter = sim.encounterView(state, c);
    view.encounter = encounter;
    view.outpost.render(state);
    if (view.artifacts) view.artifacts.render(state);
    view.gold.textContent = g.fmt.live(r.gold);
    const mult = g.links.mult ? g.links.mult() : 1;
    view.rate.textContent = tx('{} фарм', g.fmt.rate(Big.mul(r.farmRate, mult)));
    const coals = sim.coalsAll(state);
    view.coals.hidden = !coals && !sim.ingots(state);
    view.coalsText.textContent = sim.ingots(state) ? tx('угли {} · слитки {}', g.fmt(coals), sim.ingots(state)) : tx('угли {}', g.fmt(coals));

    // the gate
    const boss = sim.isBoss(c, r.wave) && !r.farm;
    const m = monsterOf(state, r.wave);
    view.monster = m;
    view.waveLabel.textContent = tx(r.farm ? 'Фарм · волна {}' : boss ? 'Волна {} · босс' : 'Волна {}', r.wave);
    const behavior = { armored: 'Панцирный', regenerator: 'Восстанавливается', channeler: 'Заклинатель' }[encounter.kind];
    view.monsterName.textContent = tx(m.title) + (behavior ? ' · ' + tx(behavior) : '');
    const hpShare = Big.isZero(Big.of(r.hpMax)) ? 0 : Math.max(0, Math.min(1, Big.toNumber(Big.div(r.hp, r.hpMax))));
    view.hpFill.style.width = (hpShare * 100) + '%';
    view.hpText.textContent = g.fmt(r.hp) + ' / ' + g.fmt(r.hpMax);
    view.timer.hidden = !boss;
    if (boss) {
      const full = sim.bossTimer(state, c);
      const tl = r.walkT > 0 ? full : r.bossT;
      view.timerFill.style.width = Math.max(0, Math.min(1, tl / full)) * 100 + '%';
      view.timerText.textContent = tx('{} с', g.fmt(tl, { digits: 1 }));
    }
    view.gate.classList.toggle('boss', boss);
    askNames(state);
    syncArt(false);

    // the anvil and the info line
    if (view.selected && !selectionValid()) { view.selected = null; view.lastTap = null; }
    renderAnvil(state);
    const selected = !!view.selected;
    const outpostModel = view.outpost.inspect().model;
    view.bladeActions.hidden = !selected;
    view.info.hidden = selected;
    view.sort.hidden = selected;
    view.equipBlade.hidden = !outpostModel.unlocks.heroes;
    view.feedBlade.hidden = !outpostModel.dragon.unlocked;
    const artifactFx = r.lastArtifactFx;
    const artifactFxKey = artifactFx ? artifactFx.at + ':' + artifactFx.serial : '';
    if (artifactFxKey && artifactFxKey !== view.artifactFxKey) {
      view.artifactFxKey = artifactFxKey;
      if (t >= artifactFx.at && t - artifactFx.at < 1500 && artifactFx.ids && artifactFx.ids.length) {
        const relic = sim.artifacts.CATALOG.find(item => item.id === artifactFx.ids[0]);
        view.info.textContent = tx('Артефакт: {}', relic ? tx(relic.title) : artifactFx.ids[0]) + (artifactFx.ids.length > 1 ? ' +' + (artifactFx.ids.length - 1) : '');
        view.infoUntil = t + 1600;
        if (!view.still && view.forge.animate) {
          if (view.artifactAnimation) view.artifactAnimation.cancel();
          view.artifactAnimation = view.forge.animate([{ filter: 'brightness(1.25)' }, { filter: 'brightness(1)' }], { duration: 220 });
        }
      }
    }
    if (!view.infoUntil || t > view.infoUntil) {
      view.infoUntil = 0;
      view.info.textContent = encounter.walking ? tx('До ворот {} с · время подготовить кузню', g.fmt(encounter.remaining, { digits: 1 })) :
        encounter.casting ? tx('Готовит заклинание · умение героя прервёт его') :
        Big.gt(encounter.shield, 0) ? tx('Панцирь {} · «Раскол» снимает защиту', g.fmt(encounter.shield)) :
        tx(sim.freeCells(state, c).length ? 'Тап — действия · дважды — слить' : 'Поле заполнено · горн продаёт излишки');
    }
    const preparationShown = encounter.walking && r.maxWave >= c['encounter.prepare.fromWave'];
    const changedPreparation = view.preparation.hidden === preparationShown;
    view.preparation.hidden = !preparationShown;
    view.meet.disabled = !encounter.canPrepare || encounter.meetCooldown > 0 || encounter.remaining <= c['encounter.meet.minSec'];
    view.meet.textContent = encounter.prepared === 'meet' ? tx('Выходим навстречу') : encounter.meetCooldown > 0 ? tx('Встретить · {} с', Math.ceil(encounter.meetCooldown)) : tx('Встретить · −{} с', c['encounter.meet.cutSec']);
    view.aim.disabled = !encounter.canPrepare;
    view.aim.textContent = encounter.prepared === 'aim' ? tx('Первый залп усилен') : tx('Прицелиться · +{}', pct(c['encounter.aim.bonus']));
    if (changedPreparation) size();

    // the context buttons
    view.sort.disabled = !!view.drag;
    view.retry.hidden = !r.farm;
    if (r.farm) view.retry.textContent = tx('Ещё раз: босс волны {}', r.wave + 1);
    const cryLvl = lvl(state, 'cry');
    view.cry.hidden = !cryLvl;
    if (cryLvl) {
      const on = sim.cryOn(state, t);
      const wait = Math.max(0, Math.ceil((r.cryReadyAt - t) / 1000));
      view.cry.disabled = on || wait > 0;
      view.cry.textContent = on ? tx('Клич звучит') : wait > 0 ? tx('Боевой клич · {}', g.fmt.time(wait)) : tx('Боевой клич');
    }
    view.context.hidden = view.retry.hidden && view.cry.hidden;
    renderEvent(state);

    // the forge
    const full = !sim.freeCells(state, c).length;
    const remaining = Math.max(0, r.forgeT) / sim.forgeSpeed(state, c);
    const share = Math.max(0, Math.min(1, 1 - Math.max(0, r.forgeT) / sim.forgeInterval(state, c, t)));
    view.forgeFill.style.width = (share * 100) + '%';
    view.forgeSub.textContent = full ? tx('продажа · {} с', g.fmt(remaining, { digits: 1 })) : tx('ур. {} · {} с', sim.forgeLevel(state, c), g.fmt(remaining, { digits: 1 }));
    view.forge.title = tx('Горн куёт сам. Нажатия ускоряют тот же цикл. Если места нет, новый клинок продаётся.');
    view.forge.classList.toggle('blow', r.bellowsUntil > t);
    const sale = r.lastForgeSale;
    const saleKey = sale ? sale.at + ':' + sale.serial : '';
    if (saleKey && saleKey !== view.saleKey) {
      view.saleKey = saleKey;
      if (t >= sale.at && t - sale.at < 2500) {
        view.saleReceipt = tx('+{} · {} шт.', g.fmt(sale.gold), sale.count);
        view.saleUntil = t + 1800;
        if (view.saleAnimation) view.saleAnimation.cancel();
        if (!view.still && view.chest.animate) view.saleAnimation = view.chest.animate([
          { transform: 'scale(1)' }, { transform: 'scale(1.035)' }, { transform: 'scale(1)' }
        ], { duration: 240 });
      }
    }
    const receipt = view.saleUntil > t ? view.saleReceipt : tx(full ? 'автопродажа' : 'продать');
    if (view.chestSub.textContent !== receipt) view.chestSub.textContent = receipt;
    view.chest.classList.toggle('proceeds', view.saleUntil > t);
    view.masterSub.textContent = coals ? tx('угли {}', g.fmt(Big.of(sim.forgeLayer(state).currency, 0))) : tx('с волны {}', c['coals.fromWave']);

    if (g.layout === 'wide') fillUpgrades(view.panel, false);
    else if (view.sheetKind === 'up' && view.upList) fillUpgrades(view.upList, false);
    if (view.sheetKind === 'master') fillMaster(false);

    // news: a new metal, a boss, achievements
    if ((state.meta.bestLevel || 0) > view.lastBest) {
      if (view.lastBest) {
        g.sfx('level');
        g.flash('sword', 'Новый металл', tx('{} · ур. {}', bladeInfo(state.meta.bestLevel).title, state.meta.bestLevel));
      }
      view.lastBest = state.meta.bestLevel;
    }
    if (r.wave !== view.lastWave) {
      if (r.lastBoss && r.lastBoss.wave === view.lastWave && r.wave === view.lastWave + 1) {
        g.sfx('boss');
        g.buzz('level');
      }
      view.lastWave = r.wave;
    }
    achievements(state);
  }

  function achievements(state) {
    const c = cfg();
    const r = state.run;
    const l = sim.forgeLayer(state);
    const rec = Math.max(r.maxWave, l.state.record);
    if (r.stats.bosses > 0 || rec > c['boss.every']) g.achieve('first-boss');
    if ((state.meta.bestLevel || 0) >= c['ach.starLevel']) g.achieve('star-blade');
    if (rec >= c['ach.wave']) g.achieve('wave-100');
    if ((l.count || 0) >= c['ach.reforges']) g.achieve('ten-reforges');
    if (r.maxWave >= c['ach.noTapWave'] && !r.taps) g.achieve('no-taps');
    if (state.meta.feats && state.meta.feats.lastSecond) g.achieve('last-second');
  }

  // ---- the gate on the canvas: the monster walks up, strikes flash as short lines ----

  function animate(state, game, dt) {
    const ctx = view.ctx;
    if (!ctx || !view.w) return;
    const c = cfg();
    const r = state.run;
    const W = view.w;
    const H = view.h;
    const dpr = view.dpr;
    const t = now();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const css = getComputedStyle(view.gate);
    const accent = css.getPropertyValue('--mf-accent').trim() || '#e0a050';
    // Under the wave, the name and the bars (the name may take two lines): the wall with the
    // archway on the left, the road and the hills behind.
    const top = view.bars.offsetTop + view.bars.offsetHeight + view.bars.offsetParent.offsetTop + 6;
    const gx = Math.max(30, W * 0.12);
    MFArt.gate(ctx, W, H, gx, top, t);
    // the monster
    const walkTotal = (view.encounter && view.encounter.total) || c['wave.walkSec'];
    const walk = walkTotal > 0 ? Math.max(0, Math.min(1, r.walkT / walkTotal)) : 0;
    const m = view.monster || { shape: 'blob', color: '#7a7f86', boss: false };
    // A gate folded to its bars on a short screen shows no monster.
    if (!view.tight && H - 12 - top < 18) {
      view.lastVolleys = r.volleys;
      return;
    }
    // The monster stands on the road in front of the gate, whole in the frame at any width: a
    // boss fills the room under the bars, the others are a size smaller. It comes from the far
    // end of the road (never from behind the edge), fading in on its first steps.
    const ground = H - 8;
    const room = ground - top - 2;
    // In a low gate it stands in its column on the right and grows as it comes nearer.
    const full = view.tight ? view.monSize : Math.max(18, Math.min(room, W * 0.3, 190));
    const size = full * (m.boss ? 1 : 0.86) * (view.tight ? 1 - 0.3 * walk : 1);
    const stand = view.tight ? W - 8 - view.monSize * 0.5 : Math.min(gx + 38 + size * 0.56, W - size * 0.56);
    const far = Math.max(stand, W - size * 0.56);
    const mx = view.tight ? stand : stand + walk * (far - stand);
    const my = ground - size * 0.5;
    view.floatTop = top + 14;
    const hit = view.hitAt ? Math.max(0, 1 - (t - view.hitAt) / 160) : 0;
    MFMonsters.draw(ctx, m, mx, ground + 2, size, view.still ? 0 : t, { walk: walk > 0 && !view.still, hit: walk > 0 ? 0 : hit, alpha: walk > 0 ? Math.min(1, (1 - walk) / 0.12) : 1, accent });
    if (!view.tight) view.outpost.draw(ctx, { x: 4, y: top, width: Math.max(70, Math.min(W * 0.30, mx - size * 0.5 - 8)), height: Math.max(0, ground - top) }, t / 1000, view.still);
    if (view.encounter && view.encounter.kind !== 'plain') {
      ctx.strokeStyle = view.encounter.kind === 'armored' ? '#b9c8dc' : view.encounter.kind === 'regenerator' ? '#8cc7a8' : '#b3a0dc';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(mx, my, size * 0.59, Math.PI * 0.10, Math.PI * 0.90);
      ctx.stroke();
    }
    // the strikes
    if (view.lastVolleys < 0) view.lastVolleys = r.volleys;
    if (r.volleys !== view.lastVolleys) {
      const many = Math.min(4, Math.max(1, Object.keys(view.cells).filter((k) => r.grid[k]).length >> 2));
      const crit = (r.crits || []).length > 0;
      for (let i = 0; i < many + (crit ? 1 : 0); i++) {
        const a = Math.random() * Math.PI;
        view.slashes.push({ x: mx + (Math.random() - 0.5) * size * 0.5, y: my + (Math.random() - 0.5) * size * 0.5, a, len: size * (crit && i === 0 ? 0.9 : 0.55), crit: crit && i === 0, at: t });
      }
      (r.crits || []).forEach((cell) => { view.critUntil[cell] = t + 220; });
      if (r.lastHit && walk === 0) view.floats.push({ x: Math.min(W - 40, mx + size * 0.6), y: Math.max(view.floatTop + 22, my), text: '−' + g.fmt(r.lastHit), crit, at: t });
      if (crit) g.sfx('clang');
      if (walk === 0) view.hitAt = t;
      view.lastVolleys = r.volleys;
    }
    view.slashes = view.slashes.filter((s) => t - s.at < 200);
    view.slashes.forEach((s) => {
      const k = 1 - (t - s.at) / 200;
      ctx.strokeStyle = s.crit ? accent : '#f2f2f2';
      ctx.globalAlpha = k;
      ctx.lineWidth = s.crit ? 4 : 2.5;
      ctx.beginPath();
      ctx.moveTo(s.x - Math.cos(s.a) * s.len / 2, s.y - Math.sin(s.a) * s.len / 2);
      ctx.lineTo(s.x + Math.cos(s.a) * s.len / 2, s.y + Math.sin(s.a) * s.len / 2);
      ctx.stroke();
    });
    view.floats = view.floats.filter((f) => t - f.at < 700).slice(-4);
    ctx.font = '600 15px system-ui, sans-serif';
    ctx.textAlign = 'center';
    view.floats.forEach((f) => {
      const k = (t - f.at) / 700;
      ctx.globalAlpha = 1 - k;
      ctx.fillStyle = f.crit ? accent : '#e8e8e8';
      ctx.fillText(f.text, f.x, Math.max(view.floatTop, f.y - k * 22));
    });
    ctx.globalAlpha = 1;
    if (state.run.starfallUntil > t) {
      ctx.fillStyle = accent;
      for (let i = 0; i < 6; i++) {
        const sx = ((t / 7 + i * 97) % W);
        const sy = ((t / 5 + i * 53) % H);
        ctx.fillRect(sx, sy, 2, 6);
      }
    }
    if (Object.keys(view.critUntil).length) renderAnvil(state);
    for (const k in view.critUntil) if (view.critUntil[k] < t) delete view.critUntil[k];
  }

  // ---- for checks in the browser ----

  const api = {
    drop: (from, to) => drop(from, to),
    tap: (cell) => tapCell(cell),
    sell: (cell) => sell(cell),
    forge: tapForge,
    upgrades: openUpgrades,
    master: openMaster,
    close: closeSheet,
    state: () => g.state,
    cellOf: (i) => view.cells[i] || null
  };

  await Game.start({ sim, render, animate, init: build });
})();
