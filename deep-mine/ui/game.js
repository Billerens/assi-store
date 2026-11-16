// The screen of «Шахта вглубь». The field is the vertical cut of the well on a canvas, painted by
// scene.js: rock bands by 100 m with their names, ores and fossils, the lit shaft and the drill,
// the zones with their own tint, record marks and the sparks of finds. Drag the cut to
// look at the passed metres (kept in metres, so folding the phone keeps the place). A narrow
// column on the right: «Бур +1», «Бригады», «Зона». The lists live in a panel: a sheet from the
// bottom on the cover screen (swipe up or «Списки»), the right column on the unfolded one.
// Event cards, finds and the heat reset sit at the bottom edge. The logic is ../sim.js.
(async function () {
  const h = ui.h;
  const sim = window.GameSim;
  const view = {
    tab: 'crews', how: 'one', scrollM: 0, drag: null, sheet: null, panelKey: '', rows: [],
    colors: {}, w: 0, h: 0, dpr: 1, phase: 0, lastRock: -1, lastZone: '', lastEvent: null
  };
  let g = null;
  let rocks = [];
  let notes = [];
  let echoes = [];
  let note = null;
  const KEEP = 'deep-mine.scroll';
  const TABS = [
    { id: 'crews', title: 'Бригады', art: 'digger' },
    { id: 'drill', title: 'Бур', art: 'drill' },
    { id: 'zones', title: 'Зоны', art: 'zones' },
    { id: 'shop', title: 'Мастерская', art: 'blueprint' },
    { id: 'book', title: 'Коллекция', art: 'gem' }
  ];
  const HOW = [
    { id: 'one', title: '×1' },
    { id: 'ten', title: '×10' },
    { id: 'mile', title: 'до вехи' },
    { id: 'max', title: 'макс' }
  ];
  const KIND = { income: 'дохода', power: 'мощности', find: 'к шансу находки' };

  // ---- sounds of the well (Web Audio, no files) ----
  Sfx.add('drill', [{ type: 'sawtooth', f: [70, 55], d: 0.25, v: 0.16 }, { type: 'noise', f: [1, 1], d: 0.2, v: 0.08 }]);
  Sfx.add('find', [{ type: 'triangle', f: [740, 740], d: 0.09, v: 0.4 }, { at: 0.08, type: 'triangle', f: [1110, 1110], d: 0.18, v: 0.35 }]);
  Sfx.add('vent', [{ type: 'noise', f: [1, 1], d: 0.45, v: 0.3, a: 0.03 }, { type: 'sine', f: [300, 120], d: 0.4, v: 0.15 }]);
  Sfx.add('steam', [{ type: 'noise', f: [1, 1], d: 0.3, v: 0.2, a: 0.02 }]);
  Sfx.add('layer', [{ type: 'triangle', f: [330, 300], d: 0.06, v: 0.2 }]);
  Sfx.add('zone', [{ type: 'sine', f: [196, 196], d: 0.4, v: 0.35 }, { at: 0.15, type: 'sine', f: [247, 247], d: 0.4, v: 0.3 }, { at: 0.3, type: 'sine', f: [294, 294], d: 0.6, v: 0.3 }]);
  const BUZZ = { find: [20, 60, 40], vent: [60, 40, 120], zone: [40, 80, 40, 80, 120], layer: [12] };

  const now = () => Date.now();
  const cfg = () => g.config;
  const zone = (id) => sim.ZONES.filter((z) => z.id === id)[0];
  const meters = (d) => g.fmt(Math.floor(d)) + ' м';
  const mps = (v) => (v > 0 && v < 0.01 ? '< 0,01' : g.fmt(v, { digits: v < 10 ? 2 : 1 })) + ' м/с';
  const buffOn = (state, name) => (state.run.buffs[name] || 0) > now();

  function rockOf(i) {
    if (!rocks.length) return { title: 'Порода ' + (i + 1), color: '#555049' };
    if (i < rocks.length) return rocks[i];
    const named = g.state.meta.names && g.state.meta.names[i - rocks.length];
    const base = rocks[20 + ((i - rocks.length) % (rocks.length - 20))];
    const round = Math.floor((i - rocks.length) / (rocks.length - 20)) + 1;
    return { title: named ? named.title : base.title + ' ' + ['', 'II', 'III', 'IV', 'V'][Math.min(4, round)], color: named && named.color ? named.color : shade(base.color, round % 2 ? 10 : -10) };
  }

  function shade(hex, k) {
    const n = parseInt(String(hex).slice(1), 16);
    const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((x) => Math.max(0, Math.min(255, x + k)));
    return 'rgb(' + c.join(',') + ')';
  }

  // ---- building the screen ----

  function build(game) {
    g = game;
    g.el.field.classList.add('dm-field');
    view.depth = h('div', { class: 'g-big', id: 'depth' });
    view.rate = h('div', { class: 'g-rate', id: 'rate' });
    view.money = h('div', { class: 'dm-money g-num', id: 'money' });
    g.el.top.append(view.depth, h('div', { class: 'dm-top-row' }, view.rate, h('div', { class: 'dm-purse' }, DmArt.el('money'), view.money)));

    view.canvas = h('canvas', { class: 'dm-cut', id: 'cut' });
    view.ctx = view.canvas.getContext('2d');
    view.back = h('button', { class: 'dm-back', id: 'back', hidden: true, onclick: () => { view.scrollM = 0; keepScroll(); } }, GameIcons.el('up'), 'К забою');
    view.drillBtn = colButton('drill-btn', 'drill', 'Бур +1', buyDrill);
    view.crewBtn = colButton('crews-btn', 'digger', 'Бригады', hireBest);
    view.zoneBtn = colButton('zone-btn', 'sediment', 'Зона', () => openPanel('zones'));
    view.col = h('div', { class: 'dm-col' }, view.drillBtn.el, view.crewBtn.el, view.zoneBtn.el);
    g.el.field.append(view.canvas, view.back, view.col);

    view.cards = h('div', { class: 'dm-cards', id: 'cards' });
    view.heat = h('div', { class: 'dm-heat', id: 'heat', hidden: true });
    view.heatBar = h('div', { class: 'dm-heat-fill' });
    view.heatText = h('span', { class: 'dm-heat-text g-num' });
    view.ventBtn = h('button', { class: 'g-btn small', id: 'vent', onclick: doVent }, 'Сброс тепла');
    view.heat.append(h('div', { class: 'dm-heat-bar' }, view.heatBar, view.heatText), view.ventBtn);
    view.listBtn = h('button', { class: 'g-btn small', id: 'lists', onclick: () => openPanel(view.tab) }, GameIcons.el('up'), 'Списки');
    view.prestige = g.ui.prestigeButton('core', { label: 'Новая скважина' });
    view.prestige.id = 'prestige';
    view.bottom = h('div', { class: 'g-btns dm-bottom' }, view.listBtn, view.prestige);
    view.panel = h('div', { class: 'dm-panel', id: 'panel' });
    view.tabs = h('div', { class: 'dm-tabs', role: 'tablist' }, TABS.map((t) => h('button', { class: 'dm-tab', 'data-tab': t.id, onclick: () => setTab(t.id) }, DmArt.el(t.art), h('span', {}, t.title))));
    view.list = h('div', { class: 'dm-list' });
    view.panel.append(view.tabs, view.list);
    g.el.actions.append(view.cards, view.heat, view.bottom);

    try { view.scrollM = Math.max(0, Number(localStorage.getItem(KEEP)) || 0); } catch (e) { view.scrollM = 0; }
    dragging();
    placePanel();
    g.on('resize', () => { placePanel(); sizeCanvas(); });
    g.on('offline', offlineLines);
    g.on('chest', () => { g.sfx('chest'); g.buzz('chest'); });
    g.on('prestige', (p) => {
      view.scrollM = 0;
      view.panelKey = '';
      if (p.layer === 'core') g.achieve('new-well');
      if (p.layer === 'edge') {
        g.achieve('new-edge');
        setTimeout(pickEdge, 300);
      }
    });
    g.on('visible', () => sizeCanvas());
    window.addEventListener('resize', sizeCanvas);
    // The field shrinks when a card appears at the bottom: the canvas follows it.
    if (window.ResizeObserver) new ResizeObserver(() => sizeCanvas()).observe(g.el.field);
    sizeCanvas();
    load('rocks', (l) => { rocks = l; });
    load('notes', (l) => { notes = l; });
    load('echoes', (l) => { echoes = l; });
    prepareNote();
    if (g.state.layers.edge && g.state.layers.edge.state && g.state.layers.edge.state.pick) setTimeout(pickEdge, 600);
  }

  function load(name, done) {
    fetch('../content/' + name + '.json').then((r) => r.json()).then((list) => { done(list); g.redraw(); }).catch(() => {});
  }

  /** A field note waits for the next summary: from the stock, else the built-in ones. */
  async function prepareNote() {
    note = await g.stock.take('notes');
    if (!note && notes.length) note = notes[Math.floor(Math.random() * notes.length)];
  }

  function colButton(id, icon, title, fn) {
    const sub = h('span', { class: 'dm-col-sub g-num' });
    const pic = picture(icon);
    const el = h('button', { class: 'dm-col-btn', id, onclick: fn }, pic.el, h('span', { class: 'dm-col-title' }, title), sub);
    return { el, sub, pic };
  }

  /** A slot with a drawn picture; set(name) swaps it only when the name changes. */
  function picture(name, cls) {
    const el = h('span', { class: 'dm-pic' + (cls ? ' ' + cls : '') });
    const p = { el, name: null, set: (n) => { if (n !== p.name) { p.name = n; el.replaceChildren(DmArt.el(n)); } } };
    p.set(name);
    return p;
  }

  function placePanel() {
    if (g.layout === 'wide') {
      if (view.sheet) {
        const c = view.sheet;
        view.sheet = null;
        c();
      }
      view.listBtn.hidden = true;
      if (view.panel.parentNode !== g.el.actions) g.el.actions.insertBefore(view.panel, g.el.actions.firstChild);
      view.panel.classList.add('dm-wide');
    } else {
      view.listBtn.hidden = false;
      view.panel.classList.remove('dm-wide');
      if (view.panel.parentNode === g.el.actions) view.panel.remove();
    }
    view.panelKey = '';
    g.redraw();
  }

  function openPanel(tab) {
    if (tab) view.tab = tab;
    view.panelKey = '';
    if (g.layout === 'wide') {
      g.redraw();
      return;
    }
    if (view.sheet) {
      g.redraw();
      return;
    }
    view.sheet = g.sheet(view.panel, () => { view.sheet = null; });
    g.sfx('tap');
    g.redraw();
  }

  function setTab(id) {
    view.tab = id;
    view.panelKey = '';
    view.list.scrollTop = 0;
    g.sfx('tap');
    g.redraw();
  }

  // ---- the cut: size, drag, drawing ----

  function sizeCanvas() {
    const r = g.el.field.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    view.w = Math.max(1, Math.round(r.width));
    view.h = Math.max(1, Math.round(r.height));
    view.dpr = dpr;
    view.canvas.width = Math.round(view.w * dpr);
    view.canvas.height = Math.round(view.h * dpr);
    view.canvas.style.width = view.w + 'px';
    view.canvas.style.height = view.h + 'px';
    const cs = getComputedStyle(document.documentElement);
    ['--bg', '--surface', '--surface-2', '--ink', '--ink-2', '--ink-3', '--line', '--accent', '--danger', '--ok'].forEach((k) => {
      view.colors[k] = (cs.getPropertyValue(k) || '').trim() || '#888';
    });
    draw(g.state, 0);
  }

  function ppm() { return Math.max(1.2, view.h / 240); }

  function keepScroll() {
    try { localStorage.setItem(KEEP, String(Math.round(view.scrollM))); } catch (e) { /* private mode */ }
  }

  function dragging() {
    const c = view.canvas;
    c.addEventListener('pointerdown', (e) => {
      view.drag = { y: e.clientY, from: view.scrollM, at: now(), id: e.pointerId };
      try { c.setPointerCapture(e.pointerId); } catch (x) { /* old WebView */ }
    });
    c.addEventListener('pointermove', (e) => {
      if (!view.drag) return;
      const dy = e.clientY - view.drag.y;
      view.scrollM = Math.max(0, Math.min(g.state.run.depth, view.drag.from + dy / ppm()));
      draw(g.state, 0);
    });
    const up = (e) => {
      if (!view.drag) return;
      const dy = e.clientY - view.drag.y;
      const quick = now() - view.drag.at < 450;
      // A quick swipe up at the face (nothing deeper to see) opens the lists.
      if (quick && dy < -50 && view.drag.from <= 1 && g.layout !== 'wide') openPanel();
      view.drag = null;
      keepScroll();
      g.redraw();
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
  }

  /** The cut is painted by scene.js; here is only what it needs to know. */
  function draw(state, dt) {
    if (!state || !view.ctx || !view.w) return;
    DmScene.draw({
      x: view.ctx, W: view.w, H: view.h, dpr: view.dpr, k: ppm(), colW: 80, state, cfg: cfg(), sim, dt: dt || 0,
      scrollM: view.scrollM, colors: view.colors, rockOf, fmt: g.fmt, meters, mps, t: ui.t,
      v: sim.speed(state, cfg(), g.links.mult(), now())
    });
  }

  // ---- actions ----

  function buyDrill() {
    const before = sim.speed(g.state, cfg(), g.links.mult(), now());
    const ok = g.act((s) => sim.buyDrill(s, cfg()));
    if (!ok) {
      g.sfx('deny');
      g.buzz('deny');
      return;
    }
    g.sfx('drill');
    g.buzz('buy');
    if (sim.speed(g.state, cfg(), g.links.mult(), now()) > before * 1.2 && g.state.run.drill % 10 === 0) g.sfx('level');
  }

  function buyCrew(i) {
    const n = g.act((s) => sim.buyCrew(s, i, cfg(), sim.crewCount(s, i, cfg(), view.how)));
    if (!n) {
      g.sfx('deny');
      g.buzz('deny');
      return;
    }
    g.sfx('buy');
    g.buzz('buy');
  }

  /** «Бригады» in the column: one crew of the best tier now (the full list is in «Списки»). */
  function hireBest() {
    const i = sim.bestCrew(g.state, cfg());
    const n = i >= 0 ? g.act((s) => sim.buyCrew(s, i, cfg(), 1)) : 0;
    if (!n) {
      g.sfx('deny');
      g.buzz('deny');
      return;
    }
    g.sfx('buy');
    g.buzz('buy');
  }

  function doVent() {
    const ok = g.act((s) => sim.vent(s, cfg(), now()));
    if (!ok) {
      g.sfx('deny');
      return;
    }
    g.sfx('vent');
    g.buzz(BUZZ.vent);
    g.flash('energy', 'Сброс тепла', 'Рывок: скорость ×' + g.fmt(cfg()['heat.burstMult']) + ' на ' + cfg()['heat.burstSec'] + ' с');
  }

  function takeEvent(choice) {
    const id = g.state.run.event && g.state.run.event.id;
    const line = g.act((s) => sim.eventTake(s, cfg(), choice, now(), g.rng), { now: true, reason: 'event' });
    if (!line) return;
    g.sfx(id === 'gas' || id === 'overheat' ? 'steam' : id === 'nugget' ? 'chest' : 'level');
    g.buzz('buy');
    if (id === 'voice') echoLine();
    g.flash('sparkle', line);
  }

  async function echoLine() {
    let e = await g.stock.take('echoes');
    if (!e && echoes.length) e = echoes.filter((x) => x.rule === g.state.run.rule)[0];
    if (e && e.text) g.flash('sparkle', 'Голос из глубины', e.text, 5000);
  }

  function takeFind(all) {
    const lines = g.act((s) => {
      const out = [];
      do {
        const r = sim.collect(s, cfg(), 0, now());
        if (r) out.push(r);
      } while (all && s.run.finds.length);
      return out;
    }, { now: true, reason: 'find' });
    if (!lines.length) return;
    g.sfx('find');
    g.buzz(BUZZ.find);
    const last = lines[lines.length - 1];
    const a = sim.ARTIFACTS.filter((x) => x.id === last.find.id)[0];
    g.flash('gem', last.find.title, last.repeat ? 'Повтор — продан за ' + g.fmt(last.amount) : a ? '+' + a.pct + ' % ' + KIND[a.kind] + ' навсегда' : 'В коллекцию свода');
    if (sim.SETS.some((s) => sim.setDone(g.state, s.id))) g.achieve('full-set');
  }

  async function strike() {
    const r = await g.links.spend('strike');
    if (!r.ok) {
      ui.toast(r.off ? 'Связка «Шаги» выключена' : 'Нужна ' + r.need + ' энергия — это ~' + g.fmt(r.need * cfg()['steps.perSteps']) + ' шагов');
      g.buzz('deny');
      return;
    }
    g.act((s) => { s.run.buffs.strike = Math.max(now(), s.run.buffs.strike || 0) + cfg()['strike.sec'] * 1000; }, { now: true, reason: 'spend' });
    g.sfx('drill');
    g.buzz(BUZZ.zone);
  }

  function pickEdge() {
    const st = g.state.layers.edge && g.state.layers.edge.state;
    if (!st || !st.pick || view.edgeSheet) return;
    const rows = sim.EDGES.map((e) => h('button', {
      class: 'g-btn dm-edge', onclick: () => {
        g.act((s) => sim.chooseEdge(s, e.id), { now: true, reason: 'edge' });
        if (view.edgeSheet) view.edgeSheet();
        g.sfx('level');
      }
    }, picture('edge-' + e.id).el, h('span', { class: 'dm-edge-text' }, e.title, h('span', { class: 'g-sub' }, e.text))));
    view.edgeSheet = g.sheet([h('h3', {}, 'Новый край: выберите породы'), h('div', { class: 'g-note' }, 'Каждая Карта недр умножает получаемый Керн на ' + g.fmt(cfg()['edge.mult']) + ' (карты перемножаются). Край меняет порядок зон до следующего «Нового края».')].concat(rows), () => { view.edgeSheet = null; });
  }

  // ---- the offline summary: what the well did while away ----

  function offlineLines(report) {
    const s = g.state;
    const a = s.run.away;
    if (!a) return;
    const r = s.run;
    const from = Math.floor(a.depth);
    const to = Math.floor(r.depth);
    const ev = [];
    if (to > from) ev.push('Пройдено ' + g.fmt(to - from) + ' м: с ' + g.fmt(from) + ' по ' + g.fmt(to) + ' м (офлайн бур идёт на ' + g.fmt.pct(sim.offlineRate(s, cfg())) + ')');
    const newRocks = [];
    for (let i = a.rock + 1; i <= Math.floor(r.depth / 100) && newRocks.length < 6; i++) newRocks.push(rockOf(i).title);
    if (newRocks.length) ev.push('Новые породы: ' + newRocks.join(', ') + (Math.floor(r.depth / 100) - a.rock > 6 ? ' и ещё ' + (Math.floor(r.depth / 100) - a.rock - 6) : ''));
    if (a.finds.length) ev.push('Находки (ждут на экране): ' + a.finds.join(', '));
    const bought = [];
    if (a.crews) bought.push(g.fmt.count(a.crews, 'бригада', 'бригады', 'бригад'));
    if (a.drill) bought.push(g.fmt.count(a.drill, 'уровень бура', 'уровня бура', 'уровней бура'));
    if (a.eq) bought.push(g.fmt.count(a.eq, 'оборудование', 'оборудования', 'оборудования'));
    if (bought.length) ev.push('Автоматы купили: ' + bought.join(', '));
    if (a.bp) ev.push('Чертежей +' + a.bp);
    a.exp.forEach((l) => ev.push(l));
    const z = sim.nextZone(s, r.depth, cfg());
    if (z) ev.push('До зоны «' + z.zone.title + '» осталось ' + meters(z.at - r.depth));
    if (note && note.text) {
      ev.push((note.who || note.title || 'Геолог') + ': «' + note.text + '»');
      note = null;
      prepareNote();
    }
    report.events.unshift.apply(report.events, ev);
    // The snapshot is spent: the next absence starts its own (even with no online tick between).
    g.act((st) => { delete st.run.away; });
  }

  // ---- the panel: rows built once per structure, updated on every render ----

  function row(parts) {
    const el = h('div', { class: 'dm-row' }, parts.pic ? parts.pic.el : null, parts.left, parts.right || null);
    return { el, update: parts.update || (() => {}) };
  }

  function priceButton(id, fn) {
    const label = h('span', { class: 'dm-price g-num' });
    const b = h('button', { class: 'g-btn small dm-buy', id, onclick: fn }, label);
    return { b, label };
  }

  function info(title, art) {
    const t = h('div', { class: 'dm-row-title' }, title);
    const s = h('div', { class: 'dm-row-sub g-num' });
    return { el: h('div', { class: 'dm-row-text' }, t, s), t, s, pic: picture(art || 'sediment') };
  }

  function buildCrews(state) {
    const c = cfg();
    const rows = [];
    const how = h('div', { class: 'dm-how' }, HOW.map((o) => h('button', {
      class: 'dm-chip' + (view.how === o.id ? ' on' : ''), onclick: () => { view.how = o.id; view.panelKey = ''; g.redraw(); }
    }, o.title)));
    rows.push({ el: how, update: () => {} });
    sim.CREWS.forEach((crew, i) => {
      // The open tiers and the first closed one.
      if (i > 0 && !sim.crewOpen(state, i) && !sim.crewOpen(state, i - 1)) return;
      const t = info(crew.title, crew.id);
      const p = priceButton('crew-' + i, () => buyCrew(i));
      rows.push(row({
        pic: t.pic, left: t.el, right: p.b, update: (s) => {
          const n = s.run.crews[i];
          const open = sim.crewOpen(s, i);
          const count = sim.crewCount(s, i, c, view.how);
          const price = sim.crewCost(s, i, c, count);
          const each = Big.mul(sim.value(s, s.run.depth, c), sim.crewBase(i, c) * sim.milestoneMult(n, c));
          const nm = sim.nextMilestone(n, c);
          t.t.textContent = crew.title + (n ? ' · ' + n : '');
          t.s.textContent = !open ? 'Откроется с первой бригадой «' + sim.CREWS[i - 1].title + '»'
            : g.fmt.rate(Big.mul(each, Math.max(1, n))) + (nm ? ' · до вехи ' + nm + ': ещё ' + (nm - n) : '');
          p.label.textContent = (count > 1 ? '+' + count + ' за ' : '') + g.fmt.price(price);
          p.b.disabled = !open || Big.lt(s.run.money, price);
          t.pic.el.classList.toggle('locked', !open);
        }
      }));
    });
    rows.push(staffRow('master'));
    return rows;
  }

  function staffRow(id) {
    const c = cfg();
    const s0 = sim.STAFF.filter((x) => x.id === id)[0];
    const t = info(s0.title, id);
    const p = priceButton('staff-' + id, () => {
      const s = g.state;
      if (s.run.staff[id]) {
        g.act((st) => { st.run.autoOff[id] = !st.run.autoOff[id]; });
        g.sfx('tap');
        return;
      }
      if (!g.act((st) => sim.hire(st, id, c))) {
        g.sfx('deny');
        return;
      }
      g.sfx('level');
      g.buzz('buy');
    });
    return row({
      pic: t.pic, left: t.el, right: p.b, update: (s) => {
        const open = sim.staffOpen(s, id, c);
        const hired = s.run.staff[id];
        t.pic.el.classList.toggle('locked', !open);
        t.pic.el.classList.toggle('have', !!hired && !s.run.autoOff[id]);
        t.s.textContent = !open ? 'С ' + g.fmt(c[s0.depth]) + ' м' : hired ? (s.run.autoOff[id] ? 'на перерыве' : 'работает: ' + s0.text) : s0.text;
        p.label.textContent = hired ? (s.run.autoOff[id] ? 'Включить' : 'Пауза') : g.fmt.price(sim.staffCost(s, id, c));
        p.b.disabled = !hired && (!open || Big.lt(s.run.money, sim.staffCost(s, id, c)));
      }
    });
  }

  function buildDrill(state) {
    const c = cfg();
    const rows = [];
    const t = info('Бур', 'drill');
    const p = priceButton('drill-buy', buyDrill);
    rows.push(row({
      pic: t.pic, left: t.el, right: p.b, update: (s) => {
        const v = sim.speed(s, c, g.links.mult(), now());
        const v2 = sim.speedNext(s, c, g.links.mult(), now());
        t.t.textContent = 'Бур, уровень ' + s.run.drill;
        t.s.textContent = 'Скорость станет ' + mps(v) + ' → ' + mps(v2);
        p.label.textContent = g.fmt.price(sim.drillCost(s, c));
        p.b.disabled = Big.lt(s.run.money, sim.drillCost(s, c));
      }
    }));
    const hard = info('Порода');
    rows.push(row({
      pic: hard.pic, left: hard.el, update: (s) => {
        const ri = Math.floor(s.run.depth / 100);
        if (hard.rock !== ri + rockOf(ri).color) {
          hard.rock = ri + rockOf(ri).color;
          hard.pic.name = null;
          hard.pic.el.replaceChildren(DmArt.rock(rockOf(ri).color, ri));
        }
        hard.t.textContent = 'Порода: ' + rockOf(ri).title;
        hard.s.textContent = 'Каждые 100 м твёрже ×' + g.fmt(sim.growth(s, c), { digits: 3 }) + ', богаче ×' + g.fmt(c['value.base']) + ' · ценность ' + g.fmt(sim.value(s, s.run.depth, c));
      }
    }));
    rows.push(staffRow('mechanic'));
    const st = g.links.status().steps;
    if (st && st.on) {
      const sk = info('Ударная проходка', 'strike');
      const b = h('button', { class: 'g-btn small dm-buy', id: 'strike', onclick: strike }, GameIcons.el('steps'), 'Энергия');
      rows.push(row({
        pic: sk.pic, left: sk.el, right: b, update: (s) => {
          const left = Math.ceil(((s.run.buffs.strike || 0) - now()) / 1000);
          sk.s.textContent = left > 0 ? 'Идёт: ещё ' + left + ' с' : 'Скорость бура ×' + c['strike.mult'] + ' на ' + c['strike.sec'] + ' с за энергию прогулки';
        }
      }));
    }
    const buffs = info('Сейчас', 'gauge');
    rows.push(row({
      pic: buffs.pic, left: buffs.el, update: (s) => {
        const list = [];
        const names = { soft: 'мягкий пласт', burst: 'рывок', strike: 'ударная проходка', quartz: 'жила кварца', collapse: 'бригады разбирают обвал', stream: 'ручей', druse: 'друза' };
        for (const n in names) if (buffOn(s, n)) list.push(names[n] + ' ' + Math.ceil((s.run.buffs[n] - now()) / 1000) + ' с');
        if (s.run.repairs) list.push('починенные коронки +' + Math.round(s.run.repairs * c['event.crown.power'] * 100) + ' %');
        if (g.links.mult() > 1) list.push('связки ' + g.fmt.mult(g.links.mult()));
        buffs.t.textContent = list.length ? 'Сейчас: ' + list.join(', ') : 'Усилений сейчас нет';
        buffs.s.textContent = 'Керн ×' + g.fmt(1 + sim.coreCount(s) * c['core.bonus'], { digits: 2 }) + ' к мощности и доходу';
      }
    }));
    return rows;
  }

  function eqRow(eq) {
    const c = cfg();
    const t = info(eq.title, eq.id);
    const p = priceButton('eq-' + eq.id, () => {
      if (!g.act((s) => sim.buyEq(s, eq.id, c))) {
        g.sfx('deny');
        return;
      }
      g.sfx('buy');
    });
    return row({
      pic: t.pic, left: t.el, right: p.b, update: (s) => {
        const d = s.run.depth;
        const lvl = s.run.eq[eq.id];
        const cap = sim.capacity(s, eq.id, lvl, c);
        if (eq.id === 'cool') t.s.textContent = 'Уровень ' + lvl + ' · снимает ' + g.fmt(cap + c['heat.passive']) + ' тепла/с';
        else {
          const need = sim.need(s, eq.id, d, c);
          const cov = sim.coverage(s, eq.id, d, c, now());
          t.s.textContent = 'Уровень ' + lvl + ' · ' + eq.verb + ' ' + g.fmt(cap) + ' из ' + g.fmt(need) + ' ' + eq.unit + ' · ' + g.fmt.pct(cov) + (cov < 1 && sim.inZone(s, eq.zone, d, c) ? ' — скорость ниже' : '');
        }
        p.label.textContent = g.fmt.price(sim.eqCost(s, eq.id, c));
        p.b.disabled = Big.lt(s.run.money, sim.eqCost(s, eq.id, c));
      }
    });
  }

  function buildZones(state) {
    const c = cfg();
    const rows = [];
    const here = info('Зона', 'sediment');
    rows.push(row({
      pic: here.pic, left: here.el, update: (s) => {
        const z = sim.zoneAt(s, s.run.depth, c);
        here.pic.set(z.id);
        const nz = sim.nextZone(s, s.run.depth, c);
        here.t.textContent = z.title;
        here.s.textContent = z.text + (nz ? ' · до «' + nz.zone.title + '» ' + meters(nz.at - s.run.depth) : '');
      }
    }));
    sim.EQUIP.forEach((eq) => { if (sim.zoneOpen(state, eq.zone, c)) rows.push(eqRow(eq)); });
    if (sim.zoneOpen(state, 'crystal', c)) {
      const t = info('Кристаллы', 'lens');
      const p = priceButton('lens', () => {
        if (!g.act((s) => sim.cutLens(s, c))) return g.sfx('deny');
        g.sfx('find');
      });
      rows.push(row({
        pic: t.pic, left: t.el, right: p.b, update: (s) => {
          t.s.textContent = g.fmt(Math.floor(s.run.crystals)) + ' кристаллов · линз ' + s.run.lenses + ' (+' + Math.round(s.run.lenses * c['lens.bonus'] * 100) + ' % мощности до конца скважины)';
          p.label.textContent = 'Огранить: ' + sim.lensCost(s, c);
          p.b.disabled = s.run.crystals < sim.lensCost(s, c);
        }
      }));
    }
    if (sim.zoneOpen(state, 'void', c)) {
      const t = info('Экспедиции в пещеры', 'expedition');
      rows.push(row({
        pic: t.pic, left: t.el, update: (s) => {
          const e = s.run.exp;
          t.s.textContent = e ? 'В пути, вернётся через ' + g.fmt.time(Math.max(0, (e.until - now()) / 1000)) : s.run.lastExp || (sim.inZone(s, 'void', s.run.depth, c) ? 'Деньги и артефакт с шансом' + (s.run.freeExp ? ' · следующая бесплатно' : '') : 'Только в зоне пустот');
        }
      }));
      const btns = sim.EXPEDITIONS.map((key, k) => {
        const b = h('button', {
          class: 'dm-chip', id: 'exp-' + k, onclick: () => {
            if (!g.act((s) => sim.expedition(s, k, c, now()), { now: true, reason: 'expedition' })) return g.sfx('deny');
            g.sfx('buy');
          }
        });
        return b;
      });
      rows.push({
        el: h('div', { class: 'dm-how' }, btns), update: (s) => {
          btns.forEach((b, k) => {
            const price = sim.expCost(s, k, c);
            b.textContent = c[sim.EXPEDITIONS[k]] + ' мин · ' + (s.run.freeExp ? 'даром' : g.fmt.price(price));
            b.disabled = !!s.run.exp || !sim.inZone(s, 'void', s.run.depth, c) || (!s.run.freeExp && Big.lt(s.run.money, price));
          });
        }
      });
    }
    if (sim.zoneOpen(state, 'magma', c)) {
      const t = info('Геотермальная станция', 'geo');
      const p = priceButton('geo', () => {
        if (!g.act((s) => sim.buyGeo(s, c))) return g.sfx('deny');
        g.sfx('level');
      });
      rows.push(row({
        pic: t.pic, left: t.el, right: p.b, update: (s) => {
          t.pic.el.classList.toggle('have', !!s.run.eq.geo);
          t.s.textContent = s.run.eq.geo ? 'Работает: бригады ×' + c['geo.mult'] + ' при полном теплоотводе' : 'Бригады ×' + c['geo.mult'] + ' в зоне магмы, нужен теплоотвод';
          p.label.textContent = s.run.eq.geo ? 'Есть' : g.fmt.price(sim.geoCost(s, c));
          p.b.disabled = !!s.run.eq.geo || Big.lt(s.run.money, sim.geoCost(s, c));
        }
      }));
    }
    if (sim.zoneOpen(state, 'pressure', c)) {
      const t = info('Алмазные коронки', 'crown');
      const p = priceButton('crown', () => {
        if (!g.act((s) => sim.buyCrown(s, c))) return g.sfx('deny');
        g.sfx('buy');
      });
      rows.push(row({
        pic: t.pic, left: t.el, right: p.b, update: (s) => {
          t.s.textContent = 'Износ ' + g.fmt.pct(s.run.wear) + ' (скорость −' + g.fmt.pct(s.run.wear * c['wear.penalty']) + ') · коронок ' + s.run.eq.crown;
          p.label.textContent = g.fmt.price(sim.crownCost(s, c));
          p.b.disabled = Big.lt(s.run.money, sim.crownCost(s, c));
        }
      }));
    }
    if (sim.zoneOpen(state, 'echo', c)) {
      const t = info('Правило скважины', 'rule');
      rows.push(row({
        pic: t.pic, left: t.el, update: (s) => {
          const rule = sim.RULES.filter((x) => x.id === s.run.rule)[0];
          t.s.textContent = rule ? rule.title + ': ' + rule.text : 'Появится на ' + g.fmt(c['echo.start']) + ' м';
        }
      }));
    }
    // All the zones of this edge: a picture, the name, where it starts and whether it is open.
    const tiles = sim.ZONES.filter((z) => z.start).map((z) => {
      const p = picture(z.id);
      const sub = h('span', { class: 'dm-tile-sub g-num' });
      return { z, p, sub, el: h('div', { class: 'dm-tile' }, p.el, h('span', { class: 'dm-tile-text' }, h('span', { class: 'dm-tile-title' }, z.title), sub)) };
    });
    rows.push({
      el: h('div', { class: 'dm-set' }, h('div', { class: 'dm-row-title' }, 'Зоны этого края'), h('div', { class: 'dm-tiles' }, tiles.map((t) => t.el))),
      update: (s) => {
        tiles.forEach((t) => {
          const at = sim.zoneStart(s, t.z.id, c);
          const open = at !== null && sim.zoneOpen(s, t.z.id, c);
          t.sub.textContent = at === null ? 'нет в этом краю' : 'с ' + g.fmt(at) + ' м' + (open ? '' : ' · закрыта');
          t.el.classList.toggle('on', open);
          t.p.el.classList.toggle('locked', !open);
        });
      }
    });
    return rows;
  }

  function buildShop(state) {
    const c = cfg();
    const rows = [];
    const head = info('Чертежи', 'blueprint');
    rows.push(row({
      pic: head.pic, left: head.el, update: (s) => {
        const st = sim.cs(s);
        head.t.textContent = 'Чертежи: ' + st.bp;
        head.s.textContent = 'Следующий на ' + meters(st.bpAt || c['blueprint.every']) + ' рекорда · рекорд скважин ' + meters(st.record);
      }
    }));
    sim.WORKSHOP.forEach((w) => {
      const t = info(w.title, w.id);
      const p = priceButton('ws-' + w.id, () => {
        if (!g.act((s) => sim.buyWs(s, w.id, c), { now: true, reason: 'workshop' })) return g.sfx('deny');
        g.sfx('level');
        g.buzz('buy');
      });
      rows.push(row({
        pic: t.pic, left: t.el, right: p.b, update: (s) => {
          const lvl = sim.ws(s, w.id);
          const max = sim.wsMax(s, w.id, c);
          t.pic.el.classList.toggle('have', lvl > 0);
          t.t.textContent = w.title + (max === Infinity ? (lvl ? ' · уровень ' + lvl : '') : max > 1 ? ' · ' + lvl + '/' + max : lvl ? ' · есть' : '');
          let now2 = '';
          if (w.id === 'bit') now2 = ' · сейчас ×' + g.fmt(sim.growth(s, c), { digits: 3 });
          if (w.id === 'motor' && lvl) now2 = ' · сейчас ×' + g.fmt(c['ws.motor.mult'] * Math.pow(c['ws.motor.step'], lvl - 1), { digits: 2 });
          if (w.id === 'night' && lvl) now2 = ' · сейчас +' + g.fmt(sim.capBonusHours(s)) + ' ч';
          t.s.textContent = w.text + now2;
          p.label.textContent = lvl >= max ? 'Готово' : sim.wsCost(s, w.id, c) + ' черт.';
          p.b.disabled = lvl >= max || sim.cs(s).bp < sim.wsCost(s, w.id, c);
        }
      }));
    });
    const edge = info('Новый край', 'map');
    const eb = g.ui.prestigeButton('edge', { label: 'Новый край' });
    eb.id = 'prestige-edge';
    eb.classList.add('small');
    rows.push(row({
      pic: edge.pic, left: edge.el, update: (s) => {
        const k = sim.edgeKind(s);
        edge.pic.set('edge-' + k);
        const e = sim.EDGES.filter((x) => x.id === k)[0];
        edge.s.textContent = 'Сейчас: ' + e.title + ' · Карт недр ' + sim.maps(s) + ' (Керн ×' + g.fmt(sim.mapsMult(sim.maps(s), c)) + ') · с рекорда ' + meters(c['edge.depth']);
      }
    }));
    rows.push({ el: eb, update: (s) => { eb.hidden = sim.cs(s).record < c['edge.depth'] * 0.5 && !sim.maps(s); } });
    return rows;
  }

  function buildBook(state) {
    const c = cfg();
    const rows = [];
    const m = state.meta;
    const sum = info('Коллекция', 'gem');
    rows.push(row({
      pic: sum.pic, left: sum.el, update: (s) => {
        const b = sim.bonuses(s, c);
        sum.t.textContent = 'Артефакты: ' + sim.ARTIFACTS.filter((a) => s.meta.artifacts[a.id]).length + ' из ' + sim.ARTIFACTS.length;
        sum.s.textContent = 'Доход +' + Math.round(b.income * 100) + ' %, мощность +' + Math.round(b.power * 100) + ' %, находки +' + Math.round(b.find * 100) + ' % · атлас пород: ' + (s.meta.rocks + 1);
      }
    }));
    sim.SETS.forEach((set) => {
      const items = sim.ARTIFACTS.filter((a) => a.set === set.id);
      const done = sim.setDone(state, set.id);
      rows.push({
        el: h('div', { class: 'dm-set' + (done ? ' done' : '') },
          h('div', { class: 'dm-row-title' }, set.title + (done ? ' — собран, +' + Math.round(c['artifact.setBonus'] * 100) + ' % ' + KIND[set.kind] : '')),
          h('div', { class: 'dm-tiles' }, items.map((a) => thing(a.id, m.artifacts[a.id], a.title, '+' + a.pct + ' % ' + KIND[a.kind])))),
        update: () => {}
      });
    });
    if (sim.zoneOpen(state, 'vault', c)) {
      rows.push({
        el: h('div', { class: 'dm-set' }, h('div', { class: 'dm-row-title' }, 'Реликвии древних сводов'),
          h('div', { class: 'dm-tiles' }, sim.RELICS.map((r) => thing(r.id, m.relics[r.id], r.title, '+' + Math.round(c['vault.each'] * 100) + ' % дохода')))),
        update: () => {}
      });
    }
    const ach = h('button', { class: 'g-btn small', id: 'achievements', onclick: () => g.ui.achievements() }, GameIcons.el('trophy'), 'Ачивки');
    rows.push({ el: ach, update: () => {} });
    return rows;
  }

  /** A tile of the collection: the picture and the name when found, a dark outline when not. */
  function thing(id, have, title, sub) {
    const p = picture(id, have ? '' : 'unknown');
    return h('div', { class: 'dm-tile' + (have ? ' on' : '') }, p.el,
      h('span', { class: 'dm-tile-text' }, h('span', { class: 'dm-tile-title' }, have ? title : 'Не найдено'), have ? h('span', { class: 'dm-tile-sub g-num' }, sub) : null));
  }

  const BUILD = { crews: buildCrews, drill: buildDrill, zones: buildZones, shop: buildShop, book: buildBook };

  function renderPanel(state) {
    const shown = view.sheet || g.layout === 'wide';
    if (!shown) return;
    const c = cfg();
    const key = view.tab + '|' + view.how + '|' + state.run.crews.map((n) => n > 0 ? 1 : 0).join('') + '|' +
      sim.ZONES.map((z) => sim.zoneOpen(state, z.id, c) ? 1 : 0).join('') + '|' + (g.links.status().steps && g.links.status().steps.on ? 1 : 0) + '|' +
      Object.keys(state.meta.artifacts).length + '|' + Object.keys(state.meta.relics).length;
    if (key !== view.panelKey) {
      view.panelKey = key;
      view.rows = BUILD[view.tab](state);
      view.list.replaceChildren(...view.rows.map((r) => r.el));
      view.tabs.querySelectorAll('.dm-tab').forEach((b) => {
        b.classList.toggle('on', b.getAttribute('data-tab') === view.tab);
        b.setAttribute('aria-selected', b.getAttribute('data-tab') === view.tab ? 'true' : 'false');
      });
    }
    view.rows.forEach((r) => r.update(state));
  }

  // ---- the bottom: event card, finds, heat ----

  function renderCards(state) {
    const r = state.run;
    const t = now();
    const ev = r.event && r.event.until > t ? r.event : null;
    const fkey = r.finds.length ? r.finds.length + ':' + r.finds[0].id : '';
    const key = (ev ? ev.id + ev.until : '') + '|' + fkey;
    if (key !== view.cardsKey) {
      view.cardsKey = key;
      const cards = [];
      if (ev) {
        const e = sim.EVENTS.filter((x) => x.id === ev.id)[0];
        view.evBar = h('div', { class: 'dm-card-fill' });
        let text = e.text;
        let take = e.take;
        let skip = e.skip;
        if (e.id === 'voice' && ev.options) {
          const a = sim.RULES.filter((x) => x.id === ev.options[0])[0];
          const b = sim.RULES.filter((x) => x.id === ev.options[1])[0];
          text = 'Правило скважины: «' + a.title + '» или «' + b.title + '»';
          take = a.title;
          skip = b.title;
        }
        if (e.id === 'crown') text += ' (' + g.fmt.price(Big.mul(sim.income(state, cfg(), t), 60 * cfg()['event.crown.min'])) + ')';
        cards.push(h('div', { class: 'dm-card', id: 'event' },
          h('div', { class: 'dm-card-bar' }, view.evBar),
          picture('ev-' + e.id).el,
          h('div', { class: 'dm-row-text' }, h('div', { class: 'dm-row-title' }, e.title), h('div', { class: 'dm-row-sub' }, text)),
          h('div', { class: 'dm-card-btns' },
            h('button', { class: 'g-btn primary small', id: 'event-take', onclick: () => takeEvent(0) }, take),
            skip ? h('button', { class: 'g-btn small', id: 'event-skip', onclick: () => takeEvent(1) }, skip) : null)));
        if (view.lastEvent !== ev.id + ev.until) {
          view.lastEvent = ev.id + ev.until;
          g.sfx('tap');
          g.buzz([30, 50, 30]);
        }
      }
      if (r.finds.length) {
        const f = r.finds[0];
        const a = sim.ARTIFACTS.filter((x) => x.id === f.id)[0];
        const have = f.kind === 'relic' ? state.meta.relics[f.id] : state.meta.artifacts[f.id];
        cards.push(h('div', { class: 'dm-card dm-find', id: 'find' },
          picture(f.id).el,
          h('div', { class: 'dm-row-text' }, h('div', { class: 'dm-row-title' }, f.title),
            h('div', { class: 'dm-row-sub' }, g.fmt(f.depth) + ' м · ' + (have ? 'повтор: продать за ' + cfg()['find.repeatMin'] + ' мин дохода' : a ? '+' + a.pct + ' % ' + KIND[a.kind] + ' навсегда' : 'реликвия свода'))),
          h('div', { class: 'dm-card-btns' },
            h('button', { class: 'g-btn primary small', id: 'find-take', onclick: () => takeFind(false) }, 'Забрать'),
            r.finds.length > 1 ? h('button', { class: 'g-btn small', id: 'find-all', onclick: () => takeFind(true) }, 'Все ' + r.finds.length) : null)));
      }
      view.cards.replaceChildren(...cards);
    }
    if (ev && view.evBar) view.evBar.style.width = Math.max(0, Math.min(100, (ev.until - t) / (cfg()['event.cardSec'] * 10))) + '%';
    const hot = sim.inZone(state, 'heat', r.depth, cfg());
    view.heat.hidden = !hot;
    if (hot) {
      view.heatBar.style.width = Math.round(r.heat) + '%';
      view.heatBar.classList.toggle('over', !!r.over);
      view.heatText.textContent = r.over ? 'Перегрев: скорость ×' + g.fmt(cfg()['heat.overMult']) : 'Тепло ' + Math.round(r.heat) + ' %';
      view.ventBtn.disabled = r.heat < cfg()['heat.resetMin'];
    }
  }

  // ---- render and animate ----

  function render(state) {
    const c = cfg();
    const r = state.run;
    const t = now();
    const mult = g.links.mult();
    const v = sim.speed(state, c, mult, t);
    const inc = Big.mul(sim.income(state, c, t), mult);
    view.depth.textContent = g.fmt(Math.floor(r.depth)) + ' м';
    view.rate.textContent = mps(v) + ' · ' + g.fmt.rate(inc);
    view.money.textContent = g.fmt.live(r.money);
    const v2 = sim.speedNext(state, c, mult, t);
    view.drillBtn.el.disabled = Big.lt(r.money, sim.drillCost(state, c));
    view.drillBtn.el.setAttribute('aria-label', 'Бур +1: ' + mps(v) + ' → ' + mps(v2) + ', ' + g.fmt.price(sim.drillCost(state, c)));
    const best = sim.bestCrew(state, c);
    const crewPrice = best >= 0 ? sim.crewCost(state, best, c, 1) : null;
    view.crewBtn.sub.textContent = crewPrice ? g.fmt.price(crewPrice) : '—';
    view.crewBtn.el.disabled = !crewPrice || Big.lt(r.money, crewPrice);
    if (best >= 0) view.crewBtn.pic.set(sim.CREWS[best].id);
    view.crewBtn.el.setAttribute('aria-label', best >= 0 ? 'Нанять: ' + sim.CREWS[best].title + ', ' + g.fmt.price(crewPrice) : 'Бригады');
    view.drillBtn.sub.textContent = '→ ' + g.fmt(v2, { digits: v2 < 10 ? 2 : 1 }) + ' · ' + g.fmt.price(sim.drillCost(state, c));
    const z = sim.zoneAt(state, r.depth, c);
    const warn = sim.EQUIP.some((e) => e.id !== 'cool' && sim.inZone(state, e.zone, r.depth, c) && sim.coverage(state, e.id, r.depth, c, t) < 1);
    view.zoneBtn.sub.textContent = warn ? 'мало' : z.id === 'sediment' ? '—' : 'ок';
    view.zoneBtn.el.classList.toggle('warn', warn);
    view.zoneBtn.pic.set(z.id);
    view.back.hidden = view.scrollM < 5;
    renderCards(state);
    renderPanel(state);
    // Sounds and achievements by the depth.
    const rock = Math.floor(r.depth / 100);
    if (view.lastRock >= 0 && rock > view.lastRock) {
      g.sfx('layer');
      g.buzz(BUZZ.layer);
    }
    view.lastRock = rock;
    if (view.lastZone && z.id !== view.lastZone) {
      g.sfx('zone');
      g.buzz(BUZZ.zone);
      g.flash('map', 'Новая зона: ' + z.title, z.text);
    }
    view.lastZone = z.id;
    if (r.depth >= 100) g.achieve('first-100');
    if (r.depth >= 1000) g.achieve('km');
    if (r.depth >= 5000) g.achieve('five-km');
    if (r.depth >= 10000) g.achieve('ten-km');
    // Marked by sim.buyEq on every pump purchase: the button and the Начальник участка, offline too.
    if (state.meta.aquifer && !(state.meta.achievements && state.meta.achievements.aquifer)) g.achieve('aquifer');
    nameRocks(state);
  }

  /** Bands past the built-in list get names from the stock of the model (kept in the save). */
  async function nameRocks(state) {
    if (!rocks.length || view.naming) return;
    const need = state.meta.rocks + 2 - rocks.length;
    const have = (state.meta.names || []).length;
    if (need <= have) return;
    view.naming = true;
    const item = await g.stock.take('rocks');
    view.naming = false;
    if (!item || !item.title) return;
    g.act((s) => {
      if (!Array.isArray(s.meta.names)) s.meta.names = [];
      if (s.meta.names.length < 400) s.meta.names.push({ title: String(item.title).slice(0, 28), color: /^#[0-9a-fA-F]{6}$/.test(String(item.color)) ? item.color : null });
    });
  }

  function animate(state, gg, dt) {
    draw(state, dt);
  }

  await Game.start({ sim, render, animate, init: build });
})();
