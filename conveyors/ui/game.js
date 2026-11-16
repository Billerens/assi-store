// The screen of «Конвейеры»: the plot on a canvas (drag, pinch, tap), the palette of buildings and
// the switch «Смотреть / Строить» under the thumb, research, orders and the planet in sheets on the
// cover screen and in a panel on the right when unfolded. The engine (Game.start) keeps the state,
// saves, offline, prestige and sound; the logic is ../sim.js over ../factory.js; numbers — g.config.
(async function () {
  const h = ui.h;
  const sim = window.GameSim;
  const F = window.ConveyorFactory;

  let data = null;
  try {
    data = await fetch('../content/planets.json').then((r) => r.json());
  } catch (error) {
    data = null;
  }
  if (!data) {
    document.body.append(h('div', { class: 'g-error' }, 'Не читается content/planets.json'));
    return;
  }
  sim.useData(data);

  const DEF = {};
  data.buildings.forEach((b) => { DEF[b.id] = b; });
  const TOOLS = ['drill', 'belt', 'tunnel', 'furnace', 'assembler', 'splitter', 'sorter', 'storage', 'port'];
  const SHORT = { drill: 'Бур', belt: 'Лента', tunnel: 'Проход', furnace: 'Печь', assembler: 'Сборщик', splitter: 'Делитель', sorter: 'Сортировка', storage: 'Склад', port: 'Порт', erase: 'Снос', frame: 'Рамка' };
  const HINT = {
    drill: 'Бур — только на пятно руды. Стрелка — куда отдаёт',
    belt: 'Тап — начало, тап — конец: лента буквой Г. Ещё тап по концу — сначала по вертикали. Двойной тап — одна клетка',
    tunnel: 'Вход и выход прохода — в одну сторону, через 1–4 клетки',
    furnace: 'Печь сама берёт рецепт по первой руде',
    assembler: 'Рецепт сборщика — в карточке (режим «Смотреть»)',
    splitter: 'Раздаёт по очереди вперёд, влево и вправо',
    sorter: 'Выбранный предмет — вперёд, остальное — вбок. Выбор — в карточке',
    storage: 'Склад копит и отдаёт по стрелке',
    port: 'Порт продаёт всё, что в него входит',
    erase: 'Тап по зданию — снести, деньги вернутся',
    frame: 'Тап по одному углу, тап по другому — кусок фабрики станет чертежом'
  };
  const ICON = {
    drill: '<circle cx="12" cy="12" r="7"/><path d="M12 6v12M6 12h12"/>',
    belt: '<rect x="3" y="7" width="18" height="10" rx="2"/><path d="M8 10l2 2-2 2M13 10l2 2-2 2"/>',
    tunnel: '<path d="M4 19v-7a8 8 0 0 1 16 0v7"/><path d="M9 19v-6a3 3 0 0 1 6 0v6"/>',
    furnace: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9 15c0-2 3-3 3-6 2 2 3 4 3 6a3 3 0 0 1-6 0z"/>',
    assembler: '<rect x="4" y="4" width="16" height="16" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M12 6v3M12 15v3M6 12h3M15 12h3"/>',
    splitter: '<path d="M3 12h7M10 12l8-6M10 12h9M10 12l8 6"/>',
    sorter: '<path d="M3 12h14M14 8l4 4-4 4M9 12v7h5"/>',
    storage: '<path d="M4 8l8-4 8 4v9l-8 4-8-4z"/><path d="M4 8l8 4 8-4M12 12v9"/>',
    port: '<circle cx="12" cy="12" r="8"/><path d="M12 7v10M8.5 10.5h7"/>',
    erase: '<path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"/>',
    frame: '<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>',
    bp: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 8h3v3H8zM13 13h3v3h-3z"/>',
    look: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    build: '<path d="M14 5l5 5-9 9H5v-5z"/><path d="M12 7l5 5"/>',
    undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
    arrow: '<path d="M4 12h15M13 6l6 6-6 6"/>',
    research: '<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3"/>',
    orders: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/>',
    planet: '<circle cx="12" cy="12" r="6"/><path d="M2.5 16c3 1.5 16-5 19-7"/>',
    bolt: '<path d="M13 3L5 14h6l-1 7 8-11h-6z"/>',
    zoom: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5M8 11h6"/>'
  };

  function evIcon(id) {
    return h('span', { class: 'cv-ico', html: CvArt.event(id) });
  }

  function icon(name, cls) {
    return h('span', { class: 'cv-ico' + (cls ? ' ' + cls : ''), html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + (ICON[name] || ICON.bp) + '</svg>' });
  }

  const view = {};
  const st = {
    mode: 'look', tool: 'belt', dir: 0, size: 40, zoom: 1, camX: 0, camY: 0, fitted: '',
    start: null, last: null, corner: null, blink: 0, newsSeen: -1, drawLast: null, panel: '', time: 0
  };
  window.__conveyors = st;
  let g = null;
  let cv = null;
  let cx = null;
  let dpr = 1;
  let lastPanel = 0;

  const items = () => sim.world(g.state).items;
  const itemTitle = (id) => (items()[id] ? items()[id].title : id);
  const lower = (s) => String(s).charAt(0).toLowerCase() + String(s).slice(1);
  const clock = (ms) => {
    const s = Math.max(0, Math.ceil(ms / 1000));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  };

  function deny(text) {
    if (text) ui.toast(text);
    g.sfx('deny');
    g.buzz('deny');
  }

  function ok(sound) {
    g.sfx(sound || 'tap');
    g.buzz('tap');
  }

  // ---- building the frame -------------------------------------------------------------------------

  function build(game) {
    g = game;
    view.money = h('div', { class: 'g-big', id: 'money' });
    view.rate = h('div', { class: 'g-rate', id: 'rate' });
    view.planet = h('button', { class: 'cv-planet', id: 'planet', onclick: planetSheet });
    g.el.top.append(h('div', { class: 'cv-top' }, h('div', { class: 'cv-top-l' }, view.money, view.rate), view.planet));

    cv = h('canvas', { class: 'cv-canvas', id: 'plot' });
    cx = cv.getContext('2d');
    view.chips = h('div', { class: 'cv-chips' });
    view.hint = h('div', { class: 'cv-hint' });
    view.wrap = h('div', { class: 'cv-wrap g-gestures' }, cv, view.chips, view.hint);
    view.zoom = h('button', { class: 'cv-zoom', 'aria-label': 'Весь участок', onclick: zoomToggle }, icon('zoom'));
    view.wrap.append(view.zoom);

    view.palette = h('div', { class: 'cv-palette', id: 'palette' });
    view.mode = h('button', { class: 'g-btn small cv-mode', id: 'mode', onclick: () => setMode(st.mode === 'look' ? 'build' : 'look') });
    view.dir = h('button', { class: 'g-btn small cv-sq', id: 'dir', 'aria-label': 'Направление', onclick: turnDir }, icon('arrow', 'cv-turn'));
    view.undo = h('button', { class: 'g-btn small cv-sq', id: 'undo', 'aria-label': 'Отменить', onclick: undo }, icon('undo'));
    view.researchBtn = h('button', { class: 'g-btn small cv-sq', id: 'research-btn', 'aria-label': 'Исследования', onclick: researchSheet }, icon('research'), h('span', { class: 'cv-badge' }));
    view.ordersBtn = h('button', { class: 'g-btn small cv-sq', id: 'orders-btn', 'aria-label': 'Заказы', onclick: ordersSheet }, icon('orders'), h('span', { class: 'cv-badge' }));
    view.controls = h('div', { class: 'cv-controls' }, view.mode, view.dir, view.undo, view.researchBtn, view.ordersBtn);
    view.tools = h('div', { class: 'cv-tools' }, view.palette, view.controls);

    view.orders = h('div', { class: 'cv-orders' });
    view.research = h('div', { class: 'cv-research' });
    view.prestige = g.ui.prestigeButton(sim.LAYER, { label: 'Новая планета' });
    view.prestige.id = 'prestige';
    view.prestige.addEventListener('click', onPrestigeClick, true);
    view.rush = h('button', { class: 'g-btn small', id: 'rush', onclick: rush });
    view.panel = h('div', { class: 'cv-panel' },
      h('div', { class: 'cv-h' }, 'Заказы'), view.orders,
      h('div', { class: 'cv-h' }, 'Исследования'), view.research,
      view.planetBtns = h('div', { class: 'g-btns cv-planet-btns' }, view.prestige, h('button', { class: 'g-btn small', onclick: shopSheet }, 'Магазин'), view.rush));

    placeZones();
    setupInput();
    new ResizeObserver(() => { st.fitted = ''; }).observe(view.wrap);
    g.on('resize', placeZones);
    g.on('chest', () => g.sfx('chest'));
    g.on('prestige', () => {
      st.fitted = '';
      st.start = null;
      st.last = null;
      st.newsSeen = -1;
      lore();
    });
    g.on('visible', () => { st.fitted = ''; });
    if (g.fresh) st.tool = 'drill';
    setMode(g.fresh ? 'build' : 'look');
    // For checks in a background page, where frames do not come: draw one by hand.
    st.frame = (dt) => animate(g.state, g, dt || 0);
    if (!(g.state.meta.lore || []).length) lore();
  }

  /** Cover: palette and controls in the actions, research and orders in sheets. Unfolded: the panel. */
  function placeZones() {
    const wide = g.layout === 'wide';
    view.researchBtn.hidden = wide;
    view.ordersBtn.hidden = wide;
    if (wide) {
      g.el.field.replaceChildren(h('div', { class: 'cv-col' }, view.wrap, view.tools));
      g.el.actions.replaceChildren(view.panel);
    } else {
      g.el.field.replaceChildren(view.wrap);
      g.el.actions.replaceChildren(view.tools);
    }
    st.fitted = '';
  }

  async function lore() {
    const item = await g.stock.take('lore');
    if (!item) return;
    g.act((s) => {
      s.meta.lore = (s.meta.lore || []).concat([{ title: String(item.title || ''), text: String(item.text || '') }]).slice(-5);
    });
  }

  // ---- modes, tools, the palette ----------------------------------------------------------------------

  function setMode(mode) {
    st.mode = mode;
    st.start = null;
    st.corner = null;
    view.mode.replaceChildren(icon(mode === 'look' ? 'look' : 'build'), h('span', {}, mode === 'look' ? 'Смотреть' : 'Строить'));
    view.mode.classList.toggle('primary', mode === 'build');
    renderPalette();
    hint();
  }

  function pick(tool) {
    if (st.tool === tool && st.mode === 'build') {
      setMode('look');
      return;
    }
    st.tool = tool;
    st.start = null;
    st.corner = null;
    if (st.mode !== 'build') setMode('build');
    else {
      renderPalette();
      hint();
    }
    g.sfx('tap');
  }

  function turnDir() {
    st.dir = (st.dir + 1) % 4;
    view.dir.firstChild.style.transform = 'rotate(' + st.dir * 90 + 'deg)';
    g.sfx('tap');
    hint();
  }

  function hint() {
    let text = '';
    if (st.mode === 'build') {
      if (st.tool.indexOf('bp:') === 0) text = 'Тап — левый верхний угол чертежа';
      else if (st.tool === 'belt' && st.start) text = 'Теперь тап по концу ленты';
      else if (st.tool === 'frame' && st.corner) text = 'Теперь тап по второму углу';
      else text = HINT[st.tool] || '';
    }
    view.hint.textContent = text;
    view.hint.hidden = !text;
  }

  function paletteKey() {
    const s = g.state;
    return [st.mode, st.tool, sim.level(s.run, 'blueprints'), (s.meta.bp || []).map((b) => b.name).join(','), s.run.planet, s.run.free].join('|');
  }

  function renderPalette() {
    if (!g) return;
    const s = g.state;
    const cfg = g.config;
    const out = [];
    function tile(tool, name, label, sub, disabled) {
      const on = st.mode === 'build' && st.tool === tool;
      out.push(h('button', { class: 'cv-tool' + (on ? ' on' : ''), 'data-tool': tool, disabled: !!disabled, onclick: () => pick(tool) },
        icon(name), h('span', { class: 'cv-tool-t' }, label), sub ? h('span', { class: 'cv-tool-s g-num' }, sub) : null));
    }
    TOOLS.forEach((t) => tile(t, t, SHORT[t], s.run.free > 0 ? 'даром' : String(sim.costOf(cfg, t))));
    tile('erase', 'erase', SHORT.erase, '');
    if (sim.level(s.run, 'blueprints')) {
      tile('frame', 'frame', SHORT.frame, '');
      (s.meta.bp || []).forEach((bp, i) => tile('bp:' + i, 'bp', bp.name.replace('Чертёж ', 'Ч'), String(sim.blueprintCost(bp, cfg)), !sim.blueprintFits(s, bp)));
    }
    view.palette.replaceChildren(...out);
    view.paletteKey = paletteKey();
  }

  // ---- the camera -------------------------------------------------------------------------------------

  function base() {
    const run = g.state.run;
    const w = view.wrap.clientWidth;
    const hgt = view.wrap.clientHeight;
    if (g.layout === 'wide') return Math.max(16, Math.floor(Math.min(w / run.w, hgt / run.h)));
    const across = g.layout === 'narrow' ? 8 : 10;
    return Math.max(20, Math.floor(Math.min(w / across, 64)));
  }

  function fit() {
    const run = g.state.run;
    const key = [view.wrap.clientWidth, view.wrap.clientHeight, g.layout, run.w, run.h, run.planet].join('|');
    if (key === st.fitted) return;
    const first = !st.fitted;
    st.fitted = key;
    dpr = window.devicePixelRatio || 1;
    const w = view.wrap.clientWidth;
    const hgt = view.wrap.clientHeight;
    cv.width = Math.max(1, Math.round(w * dpr));
    cv.height = Math.max(1, Math.round(hgt * dpr));
    cv.style.width = w + 'px';
    cv.style.height = hgt + 'px';
    st.size = Math.round(base() * st.zoom);
    if (first || g.layout === 'wide') center();
    clamp();
  }

  function center() {
    const run = g.state.run;
    const w = view.wrap.clientWidth;
    const hgt = view.wrap.clientHeight;
    st.camX = Math.round((w - run.w * st.size) / 2);
    st.camY = Math.round((hgt - run.h * st.size) / 2);
    if (run.w * st.size > w) {
      // Start where the ore and the buildings are: the top left of the plot.
      st.camX = 0;
      st.camY = 0;
    }
  }

  function clamp() {
    const run = g.state.run;
    const w = view.wrap.clientWidth;
    const hgt = view.wrap.clientHeight;
    const pw = run.w * st.size;
    const ph = run.h * st.size;
    const m = st.size * 1.5;
    st.camX = pw + 2 * m <= w ? Math.round((w - pw) / 2) : Math.min(m, Math.max(w - pw - m, st.camX));
    st.camY = ph + 2 * m <= hgt ? Math.round((hgt - ph) / 2) : Math.min(m, Math.max(hgt - ph - m, st.camY));
  }

  function zoomAt(z, px, py) {
    const old = st.size;
    st.zoom = Math.max(0.4, Math.min(2.5, z));
    st.size = Math.max(10, Math.round(base() * st.zoom));
    st.camX = px - (px - st.camX) * st.size / old;
    st.camY = py - (py - st.camY) * st.size / old;
    clamp();
  }

  function zoomToggle() {
    const run = g.state.run;
    const all = Math.min(view.wrap.clientWidth / run.w, view.wrap.clientHeight / run.h) / base();
    const z = Math.abs(st.zoom - 1) < 0.05 ? all : 1;
    zoomAt(z, view.wrap.clientWidth / 2, view.wrap.clientHeight / 2);
    if (z !== 1) center();
    clamp();
    g.sfx('tap');
  }

  function cellAt(px, py) {
    return { x: Math.floor((px - st.camX) / st.size), y: Math.floor((py - st.camY) / st.size) };
  }

  // ---- touch: drag pans, pinch zooms, a tap acts; edges stay the system's ------------------------

  function setupInput() {
    const pts = new Map();
    let drag = null;
    let pinch = null;
    const EDGE = 24;
    function local(e) {
      const r = cv.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }
    cv.addEventListener('pointerdown', (e) => {
      if (e.clientX < EDGE || e.clientX > window.innerWidth - EDGE) return;
      cv.setPointerCapture(e.pointerId);
      const p = local(e);
      pts.set(e.pointerId, p);
      if (pts.size === 1) {
        drag = { x: p.x, y: p.y, camX: st.camX, camY: st.camY, moved: false, draw: null };
        const c = cellAt(p.x, p.y);
        if (st.mode === 'build' && st.tool === 'belt' && sim.level(g.state.run, 'autobuild')) drag.draw = { x: c.x, y: c.y, placed: false };
      } else if (pts.size === 2) {
        const [a, b] = Array.from(pts.values());
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), zoom: st.zoom };
        drag = null;
      }
    });
    cv.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return;
      const p = local(e);
      pts.set(e.pointerId, p);
      if (pinch && pts.size === 2) {
        const [a, b] = Array.from(pts.values());
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch.d > 10) zoomAt(pinch.zoom * d / pinch.d, (a.x + b.x) / 2, (a.y + b.y) / 2);
        return;
      }
      if (!drag) return;
      if (Math.abs(p.x - drag.x) + Math.abs(p.y - drag.y) > 10) drag.moved = true;
      if (!drag.moved) return;
      if (drag.draw) {
        drawTo(drag.draw, cellAt(p.x, p.y));
        return;
      }
      st.camX = drag.camX + p.x - drag.x;
      st.camY = drag.camY + p.y - drag.y;
      clamp();
    });
    function up(e) {
      if (!pts.has(e.pointerId)) return;
      const p = local(e);
      pts.delete(e.pointerId);
      if (pinch) {
        if (pts.size < 2) pinch = null;
        drag = null;
        return;
      }
      if (drag && !drag.moved && e.type === 'pointerup') tap(cellAt(p.x, p.y));
      drag = null;
    }
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
  }

  /** «Автостройка»: the belt follows the finger cell by cell. */
  function drawTo(d, c) {
    const run = g.state.run;
    let guard = 0;
    while ((d.x !== c.x || d.y !== c.y) && guard++ < 40) {
      const dx = Math.sign(c.x - d.x);
      const dy = dx ? 0 : Math.sign(c.y - d.y);
      const nx = d.x + dx;
      const ny = d.y + dy;
      if (nx < 0 || ny < 0 || nx >= run.w || ny >= run.h) return;
      const r = g.act((s) => {
        if (!d.placed && !F.findAt(s.run, d.x, d.y)) sim.build(s, 'belt', d.x, d.y, F.dirOf(dx, dy), g.config);
        d.placed = true;
        return sim.drawBelt(s, d.x, d.y, nx, ny, g.config);
      });
      if (r && r.ok) g.sfx('tap');
      else if (r && r.reason === 'не хватает денег') {
        deny(r.reason);
        return;
      }
      d.x = nx;
      d.y = ny;
    }
  }

  function inside(c) {
    const run = g.state.run;
    return c.x >= 0 && c.y >= 0 && c.x < run.w && c.y < run.h;
  }

  function tap(c) {
    if (g.readonly) return;
    if (!inside(c)) {
      st.start = null;
      st.corner = null;
      hint();
      return;
    }
    const run = g.state.run;
    const b = F.findAt(run, c.x, c.y);
    if (run.ev && run.ev.id === 'outage' && b && b.t === 'furnace') {
      fixPower();
      return;
    }
    if (st.mode === 'look') {
      if (b) card(b);
      else {
        const o = F.oreAt(run, c.x, c.y);
        if (o) ui.toast(itemTitle(o.r) + ': ' + oreText(o));
      }
      return;
    }
    const cfg = g.config;
    const tool = st.tool;
    if (tool === 'erase') {
      if (!b) return;
      const r = g.act((s) => sim.demolish(s, c.x, c.y, cfg));
      if (r.ok) ok();
      else deny(r.reason);
      return;
    }
    if (tool === 'frame') {
      if (!st.corner) {
        st.corner = c;
        hint();
        g.sfx('tap');
        return;
      }
      const a = st.corner;
      st.corner = null;
      const r = g.act((s) => sim.saveBlueprint(s, a.x, a.y, c.x, c.y, cfg), { now: true, reason: 'blueprint' });
      if (r.ok) {
        ok('level');
        ui.toast(r.bp.name + ': ' + r.bp.cells.length + ' ' + g.fmt.plural(r.bp.cells.length, 'здание', 'здания', 'зданий'));
        st.tool = 'bp:' + (g.state.meta.bp.length - 1);
      } else deny(r.reason);
      renderPalette();
      hint();
      return;
    }
    if (tool.indexOf('bp:') === 0) {
      const i = Number(tool.slice(3));
      const r = g.act((s) => sim.placeBlueprint(s, i, c.x, c.y, cfg));
      if (r.ok) {
        ok('buy');
        if (r.skipped) ui.toast('Поставлено ' + r.placed + ', не встало ' + r.skipped);
      } else deny(r.reason);
      return;
    }
    if (tool === 'belt') {
      beltTap(c, b);
      return;
    }
    if (b) {
      card(b);
      return;
    }
    const r = g.act((s) => sim.build(s, tool, c.x, c.y, st.dir, cfg));
    if (r.ok) ok(r.free ? 'chest' : 'tap');
    else deny(r.reason);
  }

  /** «Лента линией»: start, end — the letter Г; the end again — vertical first; the start again — one cell. */
  function beltTap(c, b) {
    const cfg = g.config;
    const last = st.last;
    if (!st.start && last && last.x1 === c.x && last.y1 === c.y && Date.now() - last.at < 8000 && g.state.run.undo.length && g.state.run.undo[g.state.run.undo.length - 1].k === 'line') {
      const vertical = !last.vertical;
      const r = g.act((s) => {
        sim.undo(s, cfg);
        return sim.buildLine(s, last.x0, last.y0, last.x1, last.y1, vertical, cfg, st.dir);
      });
      if (r.ok) {
        st.last = Object.assign({}, last, { vertical, at: Date.now() });
        ok();
      } else deny(r.reason);
      return;
    }
    if (!st.start) {
      if (b && b.t !== 'belt') {
        card(b);
        return;
      }
      st.start = c;
      st.last = null;
      g.sfx('tap');
      hint();
      return;
    }
    const a = st.start;
    st.start = null;
    hint();
    const r = g.act((s) => sim.buildLine(s, a.x, a.y, c.x, c.y, false, cfg, st.dir));
    if (r.ok) {
      st.last = { x0: a.x, y0: a.y, x1: c.x, y1: c.y, vertical: false, at: Date.now() };
      ok();
    } else deny(r.reason);
  }

  function undo() {
    const r = g.act((s) => sim.undo(s, g.config));
    st.start = null;
    st.last = null;
    if (r.ok) ok();
    else deny(r.text);
  }

  function fixPower() {
    const done = g.act((s) => sim.fixPower(s, Date.now()));
    if (done) {
      ok('level');
      ui.toast('Щиток починен — печи работают');
    }
  }

  async function rush() {
    const r = await g.links.spend('rush');
    if (!r.ok) {
      deny(r.off ? 'Связка «Шаги» выключена' : 'Нужна ' + r.need + ' энергия — пройдитесь');
      return;
    }
    g.act((s) => sim.rush(s, Date.now(), g.config), { now: true, reason: 'spend' });
    g.sfx('level');
  }

  // ---- sheets ---------------------------------------------------------------------------------------

  function oreText(o) {
    const cfg = g.config;
    if (o.u) return 'метеоритное пятно, не беднеет';
    if (sim.level(g.state.run, 'deep')) return 'глубокое бурение: не беднеет';
    const left = cfg['ore.amount'] - o.m;
    return left > 0 ? 'осталось ' + g.fmt(Math.floor(left)) + ' руды' : 'пятно бедное: бур вчетверо медленнее';
  }

  function card(b) {
    const s = g.state;
    const run = s.run;
    const cfg = g.config;
    const w = sim.world(s);
    const def = DEF[b.t];
    const body = [h('h3', {}, def.title), h('div', { class: 'g-note' }, def.text)];
    const lines = [];
    const idle = F.idleOf(run, b);
    if (b.t !== 'belt' && b.t !== 'tunnel') lines.push(g.ui.line('Сейчас', idle ? 'стоит: ' + idle : 'работает'));
    const sp = sim.speeds(s, cfg);
    if (b.t === 'drill') {
      const o = F.oreAt(run, b.x, b.y);
      if (o) {
        lines.push(g.ui.line('Руда', itemTitle(o.r)));
        lines.push(g.ui.line('Пятно', oreText(o)));
        lines.push(g.ui.line('Скорость', g.fmt(sp.drill * F.richness(o, { deep: sim.level(run, 'deep') > 0, depleteAt: cfg['ore.amount'], slow: cfg['ore.slow'] })) + ' руды/с'));
      }
    }
    if (b.t === 'belt' || (b.t === 'tunnel' && b.it)) {
      lines.push(g.ui.line('На ленте', b.it ? itemTitle(b.it.i) : 'пусто'));
      if (sim.level(run, 'counters')) lines.push(g.ui.line('Поток', g.fmt(F.flowRate(run, b)) + ' в минуту'));
      lines.push(g.ui.line('Скорость', g.fmt(sp.belt) + ' клетки/с'));
    }
    if (b.t === 'tunnel') {
      const range = sim.level(run, 'longTunnel') ? cfg['tunnel.rangeLong'] : cfg['tunnel.range'];
      const exit = F.exitOf(run, b, range);
      const isExit = F.isExit(run, b, range);
      lines.push(g.ui.line('Пара', exit ? 'вход, выход через ' + (Math.abs(exit.x - b.x) + Math.abs(exit.y - b.y) - 1) + ' кл.' : isExit ? 'выход' : 'нет пары: второй проход по стрелке через 1–' + range + ' клетки'));
      if (b.q && b.q.length) lines.push(g.ui.line('Под землёй', String(b.q.length)));
    }
    if (b.t === 'storage') lines.push(g.ui.line('Внутри', b.s.length + ' из ' + (cfg['storage.cap'] + cfg['storage.step'] * sim.level(run, 'storage'))));
    if (b.t === 'splitter' || b.t === 'sorter') lines.push(g.ui.line('Держит', b.h ? itemTitle(b.h) : 'пусто'));
    if (b.t === 'furnace' || b.t === 'assembler') {
      const r = b.r ? w.recipe[b.r] : null;
      lines.push(g.ui.line('Рецепт', r ? itemTitle(r.out) + (r.n > 1 ? ' ×' + r.n : '') : 'не выбран'));
      if (r) {
        const speed = b.t === 'furnace' ? sp.furnace : sp.assembler;
        lines.push(g.ui.line('Вход', Object.keys(r.in).map((k) => lower(itemTitle(k)) + ' ×' + r.in[k] + ' (есть ' + (b.s[k] || 0) + ')').join(', ')));
        lines.push(g.ui.line('Время', g.fmt(r.sec / speed) + ' с'));
        if (b.o.length) lines.push(g.ui.line('Ждёт выхода', String(b.o.length)));
      }
    }
    body.push(h('div', { class: 'g-lines' }, lines));
    let close = null;
    if (b.t === 'furnace' || b.t === 'assembler') {
      const list = (w.byAt[b.t] || []).filter((r) => w.open[r.id]);
      body.push(h('div', { class: 'cv-h' }, 'Рецепты'));
      body.push(h('div', { class: 'cv-chips-list' }, list.map((r) => h('button', {
        class: 'cv-chip' + (b.r === r.id ? ' on' : ''),
        onclick: () => {
          g.act((st2) => sim.setRecipe(st2, b.x, b.y, r.id, cfg));
          g.sfx('tap');
          close();
          card(F.findAt(g.state.run, b.x, b.y));
        }
      }, swatch(r.out), h('span', {}, itemTitle(r.out) + (r.n > 1 ? ' ×' + r.n : '') + ' ← ' + Object.keys(r.in).map((k) => lower(itemTitle(k)) + (r.in[k] > 1 ? ' ×' + r.in[k] : '')).join(' + '))))));
      const locked = (w.byAt[b.t] || []).filter((r) => !w.open[r.id]);
      if (locked.length) body.push(h('div', { class: 'g-note' }, 'Закрыто исследованием: ' + locked.map((r) => lower(itemTitle(r.out))).join(', ')));
    }
    if (b.t === 'sorter') {
      body.push(h('div', { class: 'cv-h' }, 'Вперёд идёт'));
      body.push(h('div', { class: 'cv-chips-list' }, w.list.filter((id) => w.items[id]).map((id) => h('button', {
        class: 'cv-chip' + (b.f === id ? ' on' : ''),
        onclick: () => {
          g.act((st2) => sim.setFilter(st2, b.x, b.y, id, cfg));
          g.sfx('tap');
          close();
          card(F.findAt(g.state.run, b.x, b.y));
        }
      }, swatch(id), h('span', {}, itemTitle(id))))));
    }
    if (b.t !== 'dock') {
      body.push(h('div', { class: 'g-btns cv-card-btns' },
        h('button', { class: 'g-btn', onclick: () => {
          g.act((st2) => sim.rotate(st2, b.x, b.y, cfg));
          ok();
          close();
          card(F.findAt(g.state.run, b.x, b.y));
        } }, icon('arrow', 'cv-turn-' + ((b.d + 1) % 4)), 'Повернуть'),
        h('button', { class: 'g-btn', onclick: () => {
          const r = g.act((st2) => sim.demolish(st2, b.x, b.y, cfg));
          if (r.ok) ok();
          else deny(r.reason);
          close();
        } }, icon('erase'), 'Снести · +' + Math.floor(sim.costOf(cfg, b.t) * cfg['refund.share']))));
    }
    close = g.sheet(body);
  }

  /** A drawn picture in a tile; done adds the green tick. */
  function pic(svg, done) {
    return h('span', { class: 'cv-pic' + (done ? ' done' : ''), html: svg + (done ? '<svg class="cv-tick" viewBox="0 0 16 16"><circle cx="8" cy="8" r="8" fill="#5FD08A"/><path d="M4.5 8.2l2.4 2.4 4.6-5" fill="none" stroke="#101010" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>' : '') });
  }

  function swatch(id) {
    const def = items()[id];
    return h('span', { class: 'cv-sw', html: CvArt.item(def, 20) });
  }

  function researchRows(target) {
    const s = g.state;
    const cfg = g.config;
    const rows = sim.researchList(s).map((r) => {
      const L = sim.level(s.run, r.id);
      const max = sim.researchMax(cfg, r.id);
      const endless = max === Infinity;
      const done = L >= max;
      const cost = sim.researchCost(s, r.id, cfg);
      const btn = h('button', {
        class: 'g-btn small cv-buy', 'data-research': r.id, disabled: done || !sim.canResearch(s, r.id, cfg),
        onclick: () => {
          const res = g.act((st2) => sim.buyResearch(st2, r.id, cfg, g.rng, Date.now()), { now: true, reason: 'research' });
          if (res.ok) {
            g.sfx('buy');
            g.buzz('buy');
            if (r.id === 'land') st.fitted = '';
            renderPalette();
          } else deny(res.reason);
          researchRows(target);
        }
      }, done ? 'изучено' : g.fmt.price(cost));
      const lv = endless ? (L ? 'ур. ' + L : '') : max > 1 ? L + ' из ' + max : '';
      return h('div', { class: 'cv-row' + (done ? ' done' : L ? ' has' : '') },
        pic(CvArt.research(r.id), done),
        h('div', { class: 'cv-row-t' }, h('b', {}, r.title), lv ? h('span', { class: 'g-num cv-lv' }, ' ' + lv) : null, h('div', { class: 'g-note' }, r.text)), btn);
    });
    target.replaceChildren(...rows);
  }

  function researchSheet() {
    const box = h('div', { class: 'cv-research' });
    researchRows(box);
    g.sheet([h('h3', {}, 'Исследования'), box]);
  }

  function orderRows(target) {
    const run = g.state.run;
    const now = Date.now();
    const rows = run.orders.map((o) => h('div', { class: 'cv-order' + (o.x3 ? ' x3' : '') },
      h('div', { class: 'cv-order-t' }, swatch(o.item), h('b', {}, itemTitle(o.item) + ' ×' + o.need), o.x3 ? h('span', { class: 'g-mark' }, '×3') : null),
      h('div', { class: 'g-progress' }, h('i', { style: 'width:' + Math.min(100, 100 * o.have / o.need).toFixed(1) + '%' })),
      h('div', { class: 'g-note g-num' }, o.have + ' из ' + o.need + ' · ещё ' + clock(o.until - now) + ' · награда ' + g.fmt(o.reward))));
    const next = (run.orderAt || []).filter((t) => t > now).sort((a, b) => a - b)[0];
    if (!rows.length) rows.push(h('div', { class: 'g-note' }, run.soldN ? 'Заказы приходят на то, что порт уже продавал' : 'Продайте что-нибудь через порт — придут заказы'));
    if (next) rows.push(h('div', { class: 'g-note g-num' }, 'Новый заказ через ' + clock(next - now)));
    target.replaceChildren(...rows);
  }

  function ordersSheet() {
    const box = h('div', { class: 'cv-orders' });
    orderRows(box);
    const close = g.sheet([h('h3', {}, 'Заказы'), h('div', { class: 'g-note' }, 'Порт платит за заказ ×' + String(g.config['order.reward']).replace('.', ',') + ' от цены'), box]);
    const timer = setInterval(() => {
      if (!box.isConnected) {
        clearInterval(timer);
        return;
      }
      orderRows(box);
    }, 1000);
    return close;
  }

  function planetSheet() {
    const s = g.state;
    const cfg = g.config;
    const p = sim.planetDef(s, s.run.planet);
    const credits = sim.credits(s);
    const body = [
      h('div', { class: 'cv-head' }, pic(CvArt.planet(s.run.planet)), h('div', { class: 'cv-pick-t' }, h('h3', {}, p.title), h('div', { class: 'g-note' }, p.feature || ''))),
      h('p', {}, p.about || ''),
      h('div', { class: 'g-lines' },
        g.ui.line('Звёздные кредиты', g.fmt(Big.of(s.layers.planet.currency, 0)) + (credits ? ' · все скорости ' + g.fmt.mult(sim.creditMul(s, cfg)) : '')),
        g.ui.line('Заработано здесь', g.fmt(s.run.earned)),
        g.ui.line('Порог переезда', g.fmt(Big.of(cfg['planet.minEarned'])) + ' и продан ' + lower(itemTitle(p.goal))),
        g.ui.line('Главное изделие', itemTitle(p.goal) + (s.run.goalSold ? ' · продано ' + s.run.goalSold : '')),
        g.ui.line('Посещено', (s.meta.visited || []).map((id) => sim.planetDef(s, id).title).join(', ')))
    ];
    const prestige = view.prestige;
    const rushBtn = h('button', { class: 'g-btn small', onclick: rush }, icon('bolt'), 'Аврал: 3 мин ×2 · 1 энергия');
    rushBtn.hidden = !(g.links.status().steps && g.links.status().steps.on);
    body.push(h('div', { class: 'g-btns cv-card-btns' }, prestige));
    body.push(h('div', { class: 'g-btns cv-card-btns' },
      h('button', { class: 'g-btn small', onclick: shopSheet }, 'Мета-магазин'),
      h('button', { class: 'g-btn small', onclick: () => g.ui.achievements() }, 'Ачивки')));
    body.push(rushBtn);
    const log = s.meta.lore || [];
    if (log.length) {
      body.push(h('div', { class: 'cv-h' }, 'Бортовой журнал'));
      log.slice().reverse().forEach((e) => body.push(h('div', { class: 'cv-lore' }, h('b', {}, e.title), h('div', { class: 'g-note' }, e.text))));
    }
    // The one prestige button lives in the panel when unfolded; the sheet borrows it.
    view.closePlanet = g.sheet(body, () => {
      view.closePlanet = null;
      if (!view.prestige.isConnected) view.planetBtns.prepend(view.prestige);
    });
  }

  function shopSheet() {
    const s = g.state;
    const cfg = g.config;
    const box = h('div', { class: 'cv-research' });
    function rows() {
      const have = Big.of(g.state.layers.planet.currency, 0);
      box.replaceChildren(...data.shop.map((item) => {
        const cost = sim.shopCost(g.state, item.id, cfg);
        const bought = (g.state.layers.planet.state.shop || {})[item.id] || 0;
        return h('div', { class: 'cv-row' + (cost === null ? ' done' : bought ? ' has' : '') },
          pic(CvArt.shop(item.id), cost === null),
          h('div', { class: 'cv-row-t' }, h('b', {}, item.title), bought ? h('span', { class: 'g-num cv-lv' }, ' ×' + bought) : null, h('div', { class: 'g-note' }, item.text)),
          h('button', {
            class: 'g-btn small cv-buy', disabled: cost === null || Big.lt(have, cost),
            onclick: () => {
              const r = g.act((st2) => sim.shopBuy(st2, item.id, cfg), { now: true, reason: 'shop' });
              if (r.ok) ok('buy');
              else deny(r.reason);
              rows();
            }
          }, cost === null ? 'куплено' : cost + ' кр.'));
      }));
    }
    rows();
    g.sheet([h('h3', {}, 'Мета-магазин'), h('div', { class: 'g-note' }, 'Кредиты: ' + g.fmt(Big.of(s.layers.planet.currency, 0)) + '. Потраченные кредиты тоже ускоряют на ' + Math.round(cfg['credit.bonus'] * 100) + ' % каждый; покупки работают с начала следующей планеты.'), box]);
  }

  /** Before the move: where to? The first move is fixed, then two planets (and a model's one). */
  async function onPrestigeClick(e) {
    e.stopImmediatePropagation();
    e.preventDefault();
    const s = g.state;
    const cfg = g.config;
    if (!g.prestigeInfo(sim.LAYER).can) return;
    if (view.closePlanet) view.closePlanet();
    const moves = s.layers.planet.count || 0;
    const options = sim.planetOptions(s, moves, cfg);
    if (options.length < 2) {
      g.act((st2) => sim.choosePlanet(st2, options[0]));
      g.prestige(sim.LAYER);
      return;
    }
    let close = null;
    const go = (id) => {
      close();
      g.act((st2) => sim.choosePlanet(st2, id));
      g.prestige(sim.LAYER);
    };
    const cards = options.map((id) => {
      const p = sim.planetDef(s, id);
      return h('button', { class: 'cv-pick', onclick: () => go(id) }, pic(CvArt.planet(id)), h('div', { class: 'cv-pick-t' }, h('b', {}, p.title), h('div', { class: 'g-note' }, p.feature || ''), h('div', { class: 'g-note' }, p.about || '')));
    });
    if (g.stock.count('planet') > 0) {
      cards.push(h('button', { class: 'cv-pick', onclick: async () => {
        const item = await g.stock.take('planet');
        const id = item ? g.act((st2) => sim.adoptPlanet(st2, item)) : null;
        if (!id) {
          deny('Планета от модели не подошла');
          return;
        }
        go(id);
      } }, pic(CvArt.planet('model')), h('div', { class: 'cv-pick-t' }, h('b', {}, 'Новая планета от модели'), h('div', { class: 'g-note' }, 'Ресурсы и рецепты, придуманные, пока была сеть'))));
    }
    close = g.sheet([h('h3', {}, 'Куда летим?'), h('div', { class: 'g-note' }, 'Деньги, здания и исследования останутся здесь; кредиты и чертежи летят с вами'), h('div', { class: 'cv-picks' }, cards)]);
  }

  // ---- drawing --------------------------------------------------------------------------------------

  function px(x) { return st.camX + x * st.size; }
  function py(y) { return st.camY + y * st.size; }

  function shape(item, x, y, r) {
    const def = items()[item];
    const c = cx;
    c.fillStyle = def ? def.color : '#9A9A9A';
    c.strokeStyle = def ? def.color : '#9A9A9A';
    c.lineWidth = Math.max(1, r * 0.28);
    const kind = def ? def.shape : 'box';
    c.beginPath();
    switch (kind) {
      case 'ore':
        c.arc(x, y, r * 0.8, 0, Math.PI * 2);
        c.fill();
        return;
      case 'ingot':
        c.rect(x - r, y - r * 0.5, r * 2, r);
        c.fill();
        return;
      case 'brick':
        c.rect(x - r, y - r * 0.6, r * 2, r * 1.2);
        c.fill();
        c.strokeStyle = '#101010';
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(x - r, y);
        c.lineTo(x + r, y);
        c.stroke();
        return;
      case 'wire':
        c.arc(x, y, r * 0.75, 0, Math.PI * 2);
        c.stroke();
        c.beginPath();
        c.moveTo(x - r, y + r * 0.8);
        c.lineTo(x + r, y - r * 0.8);
        c.stroke();
        return;
      case 'gear': {
        const n = 8;
        for (var k = 0; k < n * 2; k++) {
          const a = k * Math.PI / n;
          const rr = k % 2 ? r * 0.7 : r;
          if (k) c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
          else c.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
        }
        c.closePath();
        c.stroke();
        return;
      }
      case 'chip':
        c.rect(x - r * 0.8, y - r * 0.8, r * 1.6, r * 1.6);
        c.fill();
        c.strokeStyle = '#101010';
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(x - r * 0.4, y - r * 0.8);
        c.lineTo(x - r * 0.4, y);
        c.lineTo(x + r * 0.4, y);
        c.lineTo(x + r * 0.4, y + r * 0.8);
        c.stroke();
        return;
      case 'motor':
        c.arc(x, y, r * 0.7, 0, Math.PI * 2);
        c.fill();
        c.fillRect(x + r * 0.4, y - r * 0.2, r * 0.6, r * 0.4);
        return;
      case 'frame':
        c.lineWidth = Math.max(1.5, r * 0.35);
        c.rect(x - r * 0.75, y - r * 0.75, r * 1.5, r * 1.5);
        c.stroke();
        return;
      case 'drone':
        c.moveTo(x - r, y - r);
        c.lineTo(x + r, y + r);
        c.moveTo(x + r, y - r);
        c.lineTo(x - r, y + r);
        c.stroke();
        [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach((q) => {
          c.beginPath();
          c.arc(x + q[0] * r, y + q[1] * r, r * 0.35, 0, Math.PI * 2);
          c.fill();
        });
        return;
      case 'plate':
        c.rect(x - r, y - r * 0.3, r * 2, r * 0.6);
        c.fill();
        return;
      case 'crystal':
        c.moveTo(x, y - r);
        c.lineTo(x + r * 0.7, y);
        c.lineTo(x, y + r);
        c.lineTo(x - r * 0.7, y);
        c.closePath();
        c.fill();
        return;
      case 'drop':
        c.arc(x, y + r * 0.25, r * 0.65, 0, Math.PI * 2);
        c.fill();
        c.beginPath();
        c.moveTo(x - r * 0.55, y);
        c.lineTo(x, y - r);
        c.lineTo(x + r * 0.55, y);
        c.fill();
        return;
      case 'cell':
        c.rect(x - r * 0.55, y - r * 0.85, r * 1.1, r * 1.7);
        c.fill();
        c.fillRect(x - r * 0.25, y - r * 1.05, r * 0.5, r * 0.25);
        return;
      case 'ring':
        c.lineWidth = Math.max(1.5, r * 0.4);
        c.arc(x, y, r * 0.7, 0, Math.PI * 2);
        c.stroke();
        return;
      case 'tri':
        c.moveTo(x, y - r);
        c.lineTo(x + r, y + r * 0.8);
        c.lineTo(x - r, y + r * 0.8);
        c.closePath();
        c.fill();
        return;
      default:
        c.rect(x - r * 0.8, y - r * 0.8, r * 1.6, r * 1.6);
        c.fill();
    }
  }

  function arrow(b, S) {
    const c = cx;
    c.save();
    c.translate(px(b.x) + S / 2, py(b.y) + S / 2);
    c.rotate(b.d * Math.PI / 2);
    c.fillStyle = 'rgba(237,237,237,0.75)';
    c.beginPath();
    c.moveTo(S * 0.5, 0);
    c.lineTo(S * 0.34, -S * 0.13);
    c.lineTo(S * 0.34, S * 0.13);
    c.closePath();
    c.fill();
    c.restore();
  }

  const BODY = { drill: '#2B2F33', furnace: '#33291F', assembler: '#27243A', splitter: '#2A2A2A', sorter: '#2A2A2A', storage: '#302A22', port: '#1F3326', dock: '#22303A', tunnel: '#202020' };
  const MARK = { drill: '#B7C0CA', furnace: '#E0864A', assembler: '#8B7CFF', splitter: '#A6A6A6', sorter: '#A6A6A6', storage: '#C4A484', port: '#5FD08A', dock: '#7FB3D9', tunnel: '#8A8A8A' };

  function drawBuilding(b, S, t, E) {
    const c = cx;
    const x = px(b.x);
    const y = py(b.y);
    const m = Math.max(1, S * 0.06);
    if (b.t === 'belt') {
      c.fillStyle = '#262626';
      c.fillRect(x + 0.5, y + 0.5, S - 1, S - 1);
      c.save();
      c.translate(x + S / 2, y + S / 2);
      c.rotate(b.d * Math.PI / 2);
      c.beginPath();
      c.rect(-S / 2, -S / 2, S, S);
      c.clip();
      c.strokeStyle = E.storm && F.outer({ w: g.state.run.w, h: g.state.run.h }, b, g.config['storm.edge']) ? '#5A4A30' : '#3C3C3C';
      c.lineWidth = Math.max(1.5, S * 0.07);
      const off = ((t * E.belt) % 0.5) * S;
      for (var k = -1; k < 2; k++) {
        const ax = -S / 2 + k * S / 2 + off;
        c.beginPath();
        c.moveTo(ax, -S * 0.28);
        c.lineTo(ax + S * 0.18, 0);
        c.lineTo(ax, S * 0.28);
        c.stroke();
      }
      c.restore();
      return;
    }
    c.fillStyle = BODY[b.t] || '#2A2A2A';
    c.fillRect(x + m, y + m, S - 2 * m, S - 2 * m);
    c.strokeStyle = '#444';
    c.lineWidth = 1;
    c.strokeRect(x + m + 0.5, y + m + 0.5, S - 2 * m - 1, S - 2 * m - 1);
    const mx = x + S / 2;
    const my = y + S / 2;
    c.strokeStyle = MARK[b.t] || '#A6A6A6';
    c.fillStyle = MARK[b.t] || '#A6A6A6';
    c.lineWidth = Math.max(1.5, S * 0.06);
    c.beginPath();
    if (b.t === 'drill') {
      const a = b.o ? 0 : t * 3;
      c.arc(mx, my, S * 0.24, 0, Math.PI * 2);
      c.stroke();
      for (var k = 0; k < 3; k++) {
        c.beginPath();
        c.moveTo(mx, my);
        c.lineTo(mx + Math.cos(a + k * 2.094) * S * 0.24, my + Math.sin(a + k * 2.094) * S * 0.24);
        c.stroke();
      }
    } else if (b.t === 'furnace') {
      c.fillStyle = b.w && !E.outage ? '#E0864A' : '#4A3A2C';
      c.fillRect(mx - S * 0.2, my - S * 0.05, S * 0.4, S * 0.22);
      c.strokeRect(mx - S * 0.26, my - S * 0.26, S * 0.52, S * 0.5);
    } else if (b.t === 'assembler') {
      const r = b.r ? sim.world(g.state).recipe[b.r] : null;
      if (r) shape(r.out, mx, my, S * 0.17);
      else {
        c.arc(mx, my, S * 0.16, 0, Math.PI * 2);
        c.stroke();
      }
      if (b.w) {
        c.strokeStyle = '#8B7CFF';
        c.beginPath();
        c.arc(mx, my, S * 0.32, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, b.c));
        c.stroke();
      }
    } else if (b.t === 'splitter') {
      c.save();
      c.translate(mx, my);
      c.rotate(b.d * Math.PI / 2);
      c.moveTo(-S * 0.28, 0);
      c.lineTo(0, 0);
      c.lineTo(S * 0.22, -S * 0.22);
      c.moveTo(0, 0);
      c.lineTo(S * 0.26, 0);
      c.moveTo(0, 0);
      c.lineTo(S * 0.22, S * 0.22);
      c.stroke();
      c.restore();
    } else if (b.t === 'sorter') {
      if (b.f) shape(b.f, mx, my, S * 0.15);
      else {
        c.moveTo(mx - S * 0.2, my);
        c.lineTo(mx + S * 0.2, my);
        c.stroke();
      }
      c.strokeStyle = '#A6A6A6';
      c.beginPath();
      c.arc(mx, my, S * 0.28, 0, Math.PI * 2);
      c.stroke();
    } else if (b.t === 'storage') {
      const cap = g.config['storage.cap'] + g.config['storage.step'] * sim.level(g.state.run, 'storage');
      c.strokeRect(mx - S * 0.25, my - S * 0.25, S * 0.5, S * 0.5);
      const fill = Math.min(1, b.s.length / cap);
      c.fillRect(mx - S * 0.25, my + S * 0.25 - S * 0.5 * fill, S * 0.5, S * 0.5 * fill);
    } else if (b.t === 'port') {
      c.arc(mx, my, S * 0.25, 0, Math.PI * 2);
      c.stroke();
      c.beginPath();
      c.moveTo(mx, my - S * 0.15);
      c.lineTo(mx, my + S * 0.15);
      c.moveTo(mx - S * 0.1, my - S * 0.05);
      c.lineTo(mx + S * 0.1, my - S * 0.05);
      c.stroke();
    } else if (b.t === 'dock') {
      c.moveTo(mx - S * 0.25, my - S * 0.2);
      c.lineTo(mx + S * 0.05, my - S * 0.2);
      c.lineTo(mx + S * 0.25, my);
      c.lineTo(mx + S * 0.05, my + S * 0.2);
      c.lineTo(mx - S * 0.25, my + S * 0.2);
      c.closePath();
      c.stroke();
      if (b.o) shape(b.o, mx - S * 0.05, my, S * 0.1);
    } else if (b.t === 'tunnel') {
      c.fillStyle = '#0C0C0C';
      c.beginPath();
      c.arc(mx, my, S * 0.24, Math.PI, 0);
      c.lineTo(mx + S * 0.24, my + S * 0.24);
      c.lineTo(mx - S * 0.24, my + S * 0.24);
      c.closePath();
      c.fill();
      c.stroke();
    }
    if (b.t !== 'port') arrow(b, S);
  }

  function drawItem(b, S) {
    const it = b.it;
    if (!it) return;
    const p = Math.min(1, it.p);
    const x = px(b.x) + S / 2 + F.DX[b.d] * (p - 0.5) * S;
    const y = py(b.y) + S / 2 + F.DY[b.d] * (p - 0.5) * S;
    shape(it.i, x, y, S * 0.17);
  }

  function animate(state, game, dt) {
    if (!cv || !view.wrap.clientWidth) return;
    fit();
    st.time += dt;
    const run = state.run;
    const cfg = g.config;
    const c = cx;
    const S = st.size;
    const t = st.time;
    const now = Date.now();
    const w = sim.world(state);
    const E = { belt: sim.speeds(state, cfg).belt * (run.rushUntil > now ? cfg['rush.mult'] : 1), storm: !!(w.planet.storm && run.storm && run.storm.until > now), outage: !!(run.ev && run.ev.id === 'outage' && run.ev.until > now) };
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.fillStyle = '#0B0B0B';
    c.fillRect(0, 0, cv.width / dpr, cv.height / dpr);
    c.fillStyle = '#161616';
    c.fillRect(px(0), py(0), run.w * S, run.h * S);
    // Ore patches: a soft fill and three dots; a poor cell fades, a meteor one is outlined.
    const deep = sim.level(run, 'deep') > 0;
    run.ore.forEach((o) => {
      const def = w.items[o.r];
      const col = def ? def.color : '#888';
      const poor = !deep && !o.u && o.m >= cfg['ore.amount'];
      const x = px(o.x);
      const y = py(o.y);
      c.globalAlpha = poor ? 0.08 : 0.2;
      c.fillStyle = col;
      c.fillRect(x, y, S, S);
      c.globalAlpha = poor ? 0.35 : 0.85;
      [[0.3, 0.32], [0.68, 0.45], [0.42, 0.72]].forEach((q) => {
        c.beginPath();
        c.arc(x + q[0] * S, y + q[1] * S, S * 0.07, 0, Math.PI * 2);
        c.fill();
      });
      c.globalAlpha = 1;
      if (o.u) {
        c.strokeStyle = col;
        c.setLineDash([3, 3]);
        c.strokeRect(x + 1.5, y + 1.5, S - 3, S - 3);
        c.setLineDash([]);
      }
    });
    // The grid.
    c.strokeStyle = '#222';
    c.lineWidth = 1;
    c.beginPath();
    for (var gx = 0; gx <= run.w; gx++) {
      c.moveTo(Math.round(px(gx)) + 0.5, py(0));
      c.lineTo(Math.round(px(gx)) + 0.5, py(run.h));
    }
    for (var gy = 0; gy <= run.h; gy++) {
      c.moveTo(px(0), Math.round(py(gy)) + 0.5);
      c.lineTo(px(run.w), Math.round(py(gy)) + 0.5);
    }
    c.stroke();
    if (w.planet.storm && E.storm) {
      c.fillStyle = 'rgba(217,192,140,0.10)';
      const e = cfg['storm.edge'] * S;
      c.fillRect(px(0), py(0), run.w * S, e);
      c.fillRect(px(0), py(run.h) - e, run.w * S, e);
      c.fillRect(px(0), py(0) + e, e, run.h * S - 2 * e);
      c.fillRect(px(run.w) - e, py(0) + e, e, run.h * S - 2 * e);
    }
    const W = view.wrap.clientWidth;
    const H = view.wrap.clientHeight;
    const vis = (b) => px(b.x) + S >= 0 && px(b.x) <= W && py(b.y) + S >= 0 && py(b.y) <= H;
    const shown = run.b.filter(vis);
    shown.forEach((b) => { if (b.t === 'belt') drawBuilding(b, S, t, E); });
    shown.forEach((b) => { if (b.t !== 'belt') drawBuilding(b, S, t, E); });
    shown.forEach((b) => drawItem(b, S));
    // Idle buildings blink («Подсветка простоя»), the inspector's one always.
    const idleOn = sim.level(run, 'idle') > 0;
    const pulse = 0.35 + 0.35 * Math.sin(t * 6);
    shown.forEach((b) => {
      const insp = run.ev && run.ev.id === 'inspector' && run.ev.until > now && run.ev.x === b.x && run.ev.y === b.y;
      if (!insp && !(idleOn && F.idleOf(run, b))) return;
      c.strokeStyle = insp ? 'rgba(242,201,76,' + (0.4 + pulse) + ')' : 'rgba(255,123,114,' + pulse + ')';
      c.lineWidth = insp ? 3 : 2;
      c.strokeRect(px(b.x) + 2, py(b.y) + 2, S - 4, S - 4);
    });
    // «Счётчики»: items a minute over the last belt of each line.
    if (sim.level(run, 'counters') && S >= 28) {
      c.font = '600 11px sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      shown.forEach((b) => {
        if (b.t !== 'belt') return;
        const next = F.findAt(run, b.x + F.DX[b.d], b.y + F.DY[b.d]);
        if (next && next.t === 'belt') return;
        const n = F.flowRate(run, b);
        if (!(n > 0)) return;
        const label = n >= 10 ? Math.round(n) + '/м' : n.toFixed(1).replace('.', ',') + '/м';
        const tw = c.measureText(label).width + 6;
        c.fillStyle = 'rgba(11,11,11,0.85)';
        c.fillRect(px(b.x) + S / 2 - tw / 2, py(b.y) - 7, tw, 14);
        c.fillStyle = '#EDEDED';
        c.fillText(label, px(b.x) + S / 2, py(b.y));
      });
    }
    // Marks of the tools: the start of a line, a corner of the frame.
    const mark = st.start || st.corner;
    if (st.mode === 'build' && mark) {
      c.strokeStyle = '#8B7CFF';
      c.lineWidth = 3;
      c.strokeRect(px(mark.x) + 1.5, py(mark.y) + 1.5, S - 3, S - 3);
    }
    if (now - lastPanel > 500) {
      lastPanel = now;
      chips(state);
    }
  }

  // ---- the chips over the plot: events, the storm, the rush, free buildings -----------------------

  function chips(state) {
    const run = state.run;
    const now = Date.now();
    const list = [];
    if (run.ev && run.ev.until > now) {
      const ev = run.ev;
      if (ev.id === 'outage') {
        list.push(h('button', { class: 'cv-chip warn', id: 'panel-fix', onclick: fixPower }, icon('bolt'), h('span', {}, 'Сбой питания · тап — щиток')));
      } else list.push(h('div', { class: 'cv-chip' + (ev.id === 'fair' ? ' good' : '') }, evIcon(ev.id), h('span', {}, ev.title + ': ' + ev.text + ' · ' + clock(ev.until - now))));
    }
    const p = sim.world(state).planet;
    if (p.storm && run.storm) {
      if (run.storm.until > now) list.push(h('div', { class: 'cv-chip warn' }, evIcon('storm'), h('span', {}, 'Буря: край стоит · ' + clock(run.storm.until - now))));
      else if (run.storm.at - now < 60000) list.push(h('div', { class: 'cv-chip' }, evIcon('storm'), h('span', {}, 'Буря через ' + clock(run.storm.at - now))));
    }
    if (run.rushUntil > now) list.push(h('div', { class: 'cv-chip good' }, evIcon('rush'), h('span', {}, 'Аврал ×2 · ' + clock(run.rushUntil - now))));
    if (run.free > 0) list.push(h('div', { class: 'cv-chip good' }, evIcon('free'), h('span', {}, 'Даром: ' + run.free + ' ' + g.fmt.plural(run.free, 'здание', 'здания', 'зданий'))));
    const key = list.map((n) => n.textContent).join('|');
    if (key !== view.chipsKey) {
      view.chipsKey = key;
      view.chips.replaceChildren(...list);
    }
  }

  // ---- numbers and panels ---------------------------------------------------------------------------

  function render(state) {
    if (!g) return;
    const run = state.run;
    const cfg = g.config;
    const now = Date.now();
    view.money.textContent = g.fmt.live(run.money);
    const rate = sim.windowRate(run, cfg) * g.links.mult();
    view.rate.textContent = run.soldN ? g.fmt.rate(rate) + ' · порт за 5 мин' : 'Поставьте бур, печь и порт';
    const p = sim.planetDef(state, run.planet);
    const planetText = p.title + (sim.credits(state) ? ' · ' + g.fmt.mult(sim.creditMul(state, cfg)) : '');
    if (view.planet.textContent !== planetText) view.planet.replaceChildren(h('span', { class: 'cv-ico', html: CvArt.planet(g.state.run.planet) }), h('span', {}, planetText));
    view.undo.disabled = !run.undo.length;
    const canBuy = sim.researchList(state).filter((r) => sim.canResearch(state, r.id, cfg)).length;
    view.researchBtn.lastChild.textContent = canBuy ? String(canBuy) : '';
    view.ordersBtn.lastChild.textContent = run.orders.length ? String(run.orders.length) : '';
    if (paletteKey() !== view.paletteKey) renderPalette();
    if (g.layout === 'wide' && now - (view.panelAt || 0) > 1000) {
      view.panelAt = now;
      orderRows(view.orders);
      researchRows(view.research);
      view.rush.replaceChildren(icon('bolt'), h('span', {}, 'Аврал · 1 энергия'));
      view.rush.hidden = !(g.links.status().steps && g.links.status().steps.on);
    }
    // News of the factory (orders done, events): a plate each.
    const fresh = (run.news || []).filter((n) => n.n > st.newsSeen);
    if (st.newsSeen >= 0) fresh.forEach((n) => g.flash('factory', n.text));
    if (run.news && run.news.length) st.newsSeen = Math.max(st.newsSeen, run.news[run.news.length - 1].n);
    else if (st.newsSeen < 0) st.newsSeen = 0;
    // Achievements.
    const f = state.meta.flags || {};
    if (f.drone) g.achieve('first-drone');
    if (f.noTunnel) g.achieve('no-tunnel');
    if (f.calm) g.achieve('calm');
    if (f.k1000) g.achieve('thousand');
    if (sim.ORDER.every((id) => (state.meta.visited || []).indexOf(id) >= 0)) g.achieve('five-planets');
  }

  await Game.start({ sim, render, animate, init: build });
})();
