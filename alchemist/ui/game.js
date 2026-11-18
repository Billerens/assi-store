// The screen of «Алхимик»: the cauldron and the shelf, the cubes, the Book with the tree of an
// element, the orders of the guild, the upgrades. The engine (Game.start) gives the frame and
// keeps the state, saves, offline, prestige, sound; the logic is in ../sim.js, the numbers in
// g.config. The model's part of the tree comes from graph.js (engine side) through axiko.call.
(async function () {
  const h = ui.h;
  const sim = window.GameSim;
  const GRAPH = 'modules/games/alchemist/graph.js';
  const CONTENT = ['elements', 'recipes', 'triples', 'categories', 'palette', 'banned', 'glyphs'];
  const TABS = [
    { id: 'shelf', icon: 'grid', title: 'Полка' },
    { id: 'cubes', icon: 'flask', title: 'Кубы' },
    { id: 'book', icon: 'book', title: 'Книга' },
    { id: 'orders', icon: 'flag', title: 'Заказы' },
    { id: 'up', icon: 'up', title: 'Улучшения', short: 'Цех' }
  ];
  const content = {};
  const cats = {};
  const view = {};
  const ui2 = { tab: 'shelf', slots: [], filter: 'all', search: '', triple: false, loupe: false, selected: null, last: null, hint: null };
  let g = null;
  let gridKey = '';
  let tabKey = '';
  let lastHeavy = 0;
  let eventNo = 0;
  let syncing = false;
  let lastSync = 0;
  let appSeen = 0;

  function engine(fn) {
    const a = window.axiko || (window.parent && window.parent.axiko);
    if (!a || typeof a.call !== 'function') return Promise.reject(new Error('нет связи с Axiko'));
    return a.call.apply(a, [GRAPH, fn].concat(Array.prototype.slice.call(arguments, 1)));
  }

  // ---- what the tree needs before the game starts ----
  await Promise.all(CONTENT.map((name) => fetch('../content/' + name + '.json').then((r) => r.json()).then((v) => { content[name] = v; })));
  content.categories.forEach((c) => { cats[c.id] = c; });
  sim.setContent(content);
  try {
    const graph = await engine('graph');
    if (graph) sim.setGraph(graph);
  } catch (ignored) { /* the hand-made set only */ }

  Sfx.add('discover', [{ type: 'sine', f: [660, 990], d: 0.12, v: 0.45 }, { at: 0.1, type: 'sine', f: [990, 1480], d: 0.18, v: 0.4 }, { at: 0.24, type: 'triangle', f: [1480, 1760], d: 0.2, v: 0.25 }]);
  Sfx.add('fizzle', [{ type: 'triangle', f: [300, 180], d: 0.12, v: 0.3 }]);
  Sfx.add('ask', [{ type: 'sine', f: [520, 620], d: 0.08, v: 0.3 }, { at: 0.1, type: 'sine', f: [620, 520], d: 0.08, v: 0.25 }]);
  Sfx.add('bubble', [{ type: 'sine', f: [380, 760], d: 0.06, v: 0.35 }]);
  GameIcons.add('cube', '<path d="M12 3 4 7.5v9L12 21l8-4.5v-9L12 3z"/><path d="M4 7.5 12 12l8-4.5"/><path d="M12 12v9"/>');
  GameIcons.add('loupe', '<circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 5 5"/>');
  GameIcons.add('scroll', '<path d="M7 4h11a2 2 0 0 1 0 4h-2v10a2 2 0 0 1-2 2H6a2 2 0 0 1 0-4h2V6a2 2 0 0 0-2-2"/><path d="M11 9h3"/><path d="M11 13h3"/>');
  GameIcons.add('three', '<circle cx="12" cy="6" r="3"/><circle cx="6" cy="17" r="3"/><circle cx="18" cy="17" r="3"/>');

  // ---- drawing elements ----
  function el(key) { return sim.tree().els[key]; }

  function nameOf(key) {
    const e = el(key);
    return e ? e.name : key;
  }

  /** Replaces the children of a node with a list that may hold lists and nulls. */
  function fill(node, list) {
    const box = h('div', {}, list);
    node.replaceChildren.apply(node, Array.from(box.childNodes));
  }

  function color(i) {
    const p = content.palette[i];
    return p ? p.hex : '#B8B8B8';
  }

  /** An <image> of the model's SVG inside the 100×100 frame, the same place the glyph takes. */
  function svgImage(markup) {
    const img = document.createElementNS('http://www.w3.org/2000/svg', 'image');
    // 72 of the frame's 100: the drawing (about 44 of its 64) is then as large as a glyph.
    img.setAttribute('x', '14');
    img.setAttribute('y', '14');
    img.setAttribute('width', '72');
    img.setAttribute('height', '72');
    img.setAttribute('href', window.GameArt.url(markup));
    return img;
  }

  function glyphNode(key, cls) {
    const e = el(key);
    const holder = document.createElement('span');
    holder.className = 'a-glyph ' + (cls || '');
    if (!e) return holder;
    const gl = content.glyphs[e.glyph] || content.glyphs.orb;
    const cat = cats[e.cat] || content.categories[0];
    const c = e.colors || [0, 0];
    if (e.svg && window.GameArt && g.config['art.modelIcons']) {
      // The model's own drawing in the frame of its category: as an image, never as markup.
      holder.innerHTML = '<svg viewBox="0 0 100 100" aria-hidden="true"><path class="a-frame" d="' + cat.frame + '"/></svg>';
      holder.firstChild.appendChild(svgImage(e.svg));
      return holder;
    }
    holder.innerHTML = '<svg viewBox="0 0 100 100" aria-hidden="true">' +
      '<path class="a-frame" d="' + cat.frame + '"/>' +
      '<g transform="translate(23 23) scale(2.25)" fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="' + gl.main + '" stroke="' + color(c[0]) + '"/>' +
      (gl.detail ? '<path d="' + gl.detail + '" stroke="' + color(c[1]) + '"/>' : '') +
      '</g></svg>';
    return holder;
  }

  function amount(state, key) { return Math.floor(sim.have(state, key) + 1e-9); }

  function tile(state, key, onTap, onHold) {
    const n = amount(state, key);
    const node = h('button', { class: 'a-tile', 'data-key': key, 'aria-label': nameOf(key) + ', ' + n },
      glyphNode(key), h('span', { class: 'a-name' }, nameOf(key)), h('span', { class: 'a-count g-num' }, String(n)));
    if (n <= 0) node.classList.add('empty');
    press(node, onTap, onHold);
    return node;
  }

  /** A tap, and a long press (550 ms) for the second action. */
  function press(node, onTap, onHold) {
    let timer = 0;
    let held = false;
    let moved = false;
    let start = null;
    node.addEventListener('pointerdown', (e) => {
      held = false;
      moved = false;
      start = { x: e.clientX, y: e.clientY };
      if (onHold) timer = setTimeout(() => { held = true; onHold(); g.buzz('tap'); }, 550);
    });
    node.addEventListener('pointermove', (e) => {
      if (start && Math.abs(e.clientX - start.x) + Math.abs(e.clientY - start.y) > 12) {
        moved = true;
        clearTimeout(timer);
      }
    });
    const end = () => clearTimeout(timer);
    node.addEventListener('pointerup', end);
    node.addEventListener('pointercancel', end);
    node.addEventListener('pointerleave', end);
    node.addEventListener('contextmenu', (e) => e.preventDefault());
    node.addEventListener('click', () => {
      if (held || moved) return;
      if (onTap) onTap();
    });
  }

  // ---- the frame ----
  function build(game) {
    g = game;
    view.ess = h('div', { class: 'g-big', id: 'essence' });
    view.rate = h('div', { class: 'g-rate', id: 'rate' });
    view.stock = h('div', { class: 'a-stock', id: 'stock' });
    g.el.top.append(view.ess, view.rate, view.stock);

    view.cauldron = h('div', { class: 'a-cauldron', id: 'cauldron' });
    view.world = window.AlchemyScene && AlchemyScene.mount(g, view.cauldron);
    if (view.world) view.cauldron.classList.add('a-has-world');
    view.rings = h('canvas', { class: 'a-rings', width: 300, height: 160 });
    view.rings.hidden = !!view.world;
    view.slotsBox = h('div', { class: 'a-slots' });
    view.result = h('div', { class: 'a-result', id: 'result', role: 'status' });
    view.tools = h('div', { class: 'a-tools' });
    view.cauldron.append(view.rings, view.slotsBox, view.result, view.tools);
    view.bar = h('div', { class: 'a-filter', id: 'filter' });
    view.grid = h('div', { class: 'a-grid', id: 'shelf' });
    view.page = h('div', { class: 'a-page', id: 'page' });
    g.el.field.append(view.cauldron, view.bar, view.grid, view.page);

    view.panel = h('div', { class: 'a-panel', id: 'panel' });
    view.row = h('div', { class: 'g-btns a-row' });
    view.prestige = g.ui.prestigeButton(sim.STONE);
    view.prestige.id = 'prestige';
    view.prestige.classList.add('small');
    view.tincture = g.ui.prestigeButton(sim.TINCT);
    view.tincture.classList.add('small');
    view.sell = h('button', { class: 'g-btn small', id: 'sell', onclick: sellSheet }, GameIcons.el('coin'), 'Продать');
    view.insightLabel = h('span', {}, 'Вдохновение');
    view.insight = h('button', { class: 'g-btn small', id: 'insight', onclick: insight }, GameIcons.el('energy'), view.insightLabel);
    view.row.append(view.sell, view.insight);
    view.layers = h('div', { class: 'g-btns a-row' }, view.prestige, view.tincture);
    view.tabs = h('nav', { class: 'a-tabs', id: 'tabs' });
    TABS.forEach((t) => {
      const b = h('button', { class: 'a-tab', 'data-tab': t.id, 'aria-label': t.title, onclick: () => setTab(t.id) },
        GameIcons.el(t.icon), h('span', { class: 'a-tab-t' }, t.title));
      if (t.short) b.querySelector('.a-tab-t').setAttribute('data-short', ui.t(t.short));
      view.tabs.appendChild(b);
    });
    g.el.actions.append(view.panel, view.row, view.layers, view.tabs);

    g.on('chest', () => { g.sfx('chest'); g.buzz('chest'); redrawAll(); });
    g.on('prestige', () => {
      ui2.slots = [];
      ui2.last = null;
      g.sfx('prestige');
      const got = g.state.meta.lastUnlocked || [];
      if (got.length) setTimeout(() => g.flash('gem', 'Открыто камнями', got.join(', '), 5000), 600);
      redrawAll();
    });
    g.on('offline', () => { setTimeout(apprenticeFlashes, 400); sync(true); });
    g.on('resize', redrawAll);
    g.on('visible', () => sync(false));
    g.on('links', () => { tabKey = ''; });
    appSeen = Date.now();
    setTimeout(() => sync(true), 300);
    setInterval(() => sync(false), 120000);
  }

  function redrawAll() {
    gridKey = '';
    tabKey = '';
    g.redraw();
  }

  function setTab(id) {
    ui2.tab = id;
    tabKey = '';
    gridKey = '';
    g.sfx('tap');
    g.redraw();
    g.el.field.scrollTop = 0;
  }

  // ---- talking to graph.js ----
  async function sync(force) {
    if (syncing || g.readonly) return;
    if (!force && Date.now() - lastSync < 20000) return;
    syncing = true;
    lastSync = Date.now();
    try {
      const r = await engine('sync', sim.seenOf(g.state));
      if (r && r.graph) {
        const before = Object.keys(g.state.meta.asked);
        sim.setGraph(r.graph);
        const decided = before.filter((k) => sim.pairState(k) !== 'unknown');
        if (decided.length) {
          const recipes = decided.filter((k) => sim.pairState(k) === 'recipe').length;
          g.flash('sparkle', 'Модель разобрала пар из очереди: ' + decided.length, recipes ? 'С реакцией: ' + recipes + ' — попробуйте их снова' : 'Во всех — реакции нет', 5000);
        }
        view.stats = r.stats;
        redrawAll();
      }
    } catch (ignored) {
      view.stats = null;
    }
    syncing = false;
  }

  function apprenticeFlashes() {
    const list = (g.state.run.appLog || []).filter((a) => a.at > appSeen - 24 * 3600000 && a.d);
    appSeen = Date.now();
    list.slice(-5).forEach((a, i) => setTimeout(() => {
      rings(a.r);
      g.flash('hand', 'Ученик открыл: ' + nameOf(a.r), a.k.split('+').map(nameOf).join(' + '), 2600);
    }, i * 2800));
  }

  // ---- the cauldron ----
  function slotCount(state) { return ui2.triple && sim.unlocked(state, 'triple') ? 3 : 2; }

  function pick(key) {
    const state = g.state;
    const need = slotCount(state);
    const want = ui2.slots.concat([key]).filter((k) => k === key).length;
    if (amount(state, key) < want) {
      g.sfx('deny');
      g.buzz('deny');
      ui2.last = { kind: 'short', text: 'Не хватает: ' + nameOf(key) + ' — нужно ' + want };
      g.redraw();
      return;
    }
    ui2.selected = key;
    ui2.slots.push(key);
    g.sfx('bubble');
    g.buzz('tap');
    if (ui2.slots.length >= need) {
      if (ui2.loupe) look();
      else react();
    }
    tabKey = '';
    g.redraw();
  }

  function clearSlot(i) {
    ui2.slots.splice(i, 1);
    g.sfx('tap');
    g.redraw();
  }

  function look() {
    const keys = ui2.slots.slice();
    const r = g.act((state) => sim.useLoupe(state, keys, Date.now()));
    ui2.loupe = false;
    if (!r.ok) {
      ui2.last = { kind: 'short', text: r.why };
      return;
    }
    const text = { recipe: 'Лупа: реакция будет', none: 'Лупа: реакции нет', unknown: 'Лупа: неизвестно — модель ещё не разбирала' }[r.state];
    ui2.last = { kind: r.state, text: text, look: true };
    g.sfx(r.state === 'recipe' ? 'level' : 'fizzle');
  }

  function react() {
    const keys = ui2.slots.slice();
    ui2.slots = [];
    const r = g.act((state) => sim.mix(state, g.config, keys, { now: Date.now(), mult: g.links.mult() }), { now: true, reason: 'action' });
    const names = keys.map(nameOf).join(' + ');
    if (r.result === 'short') {
      ui2.last = { kind: 'short', text: 'Не хватает элементов для ' + names };
      g.sfx('deny');
      g.buzz('deny');
    } else if (r.result === 'locked') {
      ui2.last = { kind: 'short', text: 'Тройное смешение откроется с ' + g.config['unlock.triple'] + ' камнями' };
      g.sfx('deny');
    } else if (r.result === 'none') {
      ui2.last = { kind: 'none', text: names + ' — реакции нет' };
      g.sfx('fizzle');
    } else if (r.result === 'unknown') {
      ui2.last = { kind: 'unknown', text: names + ' — неизвестно. Спросим модель, когда будет сеть' };
      g.sfx('ask');
      sync(false);
    } else {
      ui2.selected = r.r;
      if (r.discovery) {
        const d = r.discovery;
        ui2.last = { kind: 'new', text: 'Открытие: ' + d.name, sub: names + ' = ' + d.name + ' · +' + g.fmt(d.reward) + ' эссенции', key: r.r };
        rings(r.r);
        g.sfx('discover');
        g.buzz('level');
        discoveryCard(r);
        if (d.scholar) g.flash('book', 'Учёный доволен', '+' + g.fmt(d.scholar) + ' эссенции', 4000);
        achievements(g.state);
      } else {
        ui2.last = { kind: 'recipe', text: names + ' = ' + nameOf(r.r), sub: r.full ? 'Склад полон' : '+' + r.made, key: r.r };
        g.sfx('tap');
      }
    }
    if (view.world) view.world.pulse(r.result === 'recipe' ? (r.discovery ? 'discovery' : 'duplicate') : r.result === 'unknown' ? 'unknown' : 'failure', { key: r.r || null }, r.discovery ? 2.6 : 1.6);
    gridKey = '';
  }

  function discoveryCard(r) {
    const e = el(r.r);
    const rec = sim.tree().recipes[r.k];
    const close = g.sheet([
      h('div', { class: 'a-card' }, glyphNode(r.r, 'big'),
        h('div', {}, h('h3', {}, e.name), h('div', { class: 'g-note' }, 'Ступень ' + e.tier + ' · ' + e.cat + (rec && rec.src === 'model' ? ' · придумано моделью' : '')))),
      h('p', {}, e.desc),
      Game.ui.line('Рецепт', r.k.split('+').map(nameOf).join(' + ')),
      Game.ui.line('Награда', g.fmt(r.discovery.reward) + ' эссенции'),
      rec && rec.src === 'model' ? h('p', { class: 'g-note' }, 'Не нравится этот рецепт? Долгое нажатие на него в Книге — «Убрать».') : null,
      h('button', { class: 'g-btn primary', onclick: () => close() }, 'Дальше')
    ]);
  }

  function rings(key) {
    if (view.world) return;
    const e = el(key);
    const cv = view.rings;
    const box = view.cauldron.getBoundingClientRect();
    if (!box.width) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(box.width * dpr);
    cv.height = Math.round(box.height * dpr);
    const ctx = cv.getContext('2d');
    const colors = e ? [color(e.colors[0]), color(e.colors[1]), color(e.colors[0])] : ['#8B7CFF', '#8B7CFF', '#8B7CFF'];
    const t0 = performance.now();
    const cx = cv.width / 2;
    const cy = cv.height * 0.42;
    const max = Math.max(cv.width, cv.height) * 0.6;
    function step(t) {
      const p = (t - t0) / 1100;
      ctx.clearRect(0, 0, cv.width, cv.height);
      if (p >= 1) return;
      colors.forEach((c, i) => {
        const q = p - i * 0.16;
        if (q <= 0 || q >= 1) return;
        ctx.beginPath();
        ctx.arc(cx, cy, 12 * dpr + q * max, 0, Math.PI * 2);
        ctx.strokeStyle = c;
        ctx.globalAlpha = 1 - q;
        ctx.lineWidth = (3 - q * 2) * dpr;
        ctx.stroke();
      });
      ctx.globalAlpha = 1;
      requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function drawCauldron(state) {
    const need = slotCount(state);
    const slots = [];
    Array.from({ length: need }).forEach((unused, i) => {
      const k = ui2.slots[i];
      if (i) slots.push(h('span', { class: 'a-plus' }, '+'));
      if (k) {
        const b = h('button', { class: 'a-slot full', 'aria-label': 'Убрать ' + nameOf(k), onclick: () => clearSlot(i) }, glyphNode(k), h('span', { class: 'a-name' }, nameOf(k)));
        slots.push(b);
      } else {
        slots.push(h('div', { class: 'a-slot' }, h('span', { class: 'a-name muted' }, i === 0 ? 'Первый' : i === 1 ? 'Второй' : 'Третий')));
      }
    });
    view.slotsBox.replaceChildren.apply(view.slotsBox, slots);
    const last = ui2.last;
    if (last) {
      view.result.className = 'a-result ' + last.kind;
      view.result.replaceChildren(h('div', { class: 'a-result-t' }, last.text), last.sub ? h('div', { class: 'g-note' }, last.sub) : '');
    } else {
      view.result.className = 'a-result';
      const help = (g.state.meta.bookN || 0) <= 4 ? 'Тап по элементу — в котёл, второй тап — реакция. Тап по гнезду очищает его.' : 'Выберите два элемента';
      view.result.replaceChildren(h('div', { class: 'g-note' }, help));
    }
    const tools = [];
    if (ui2.loupe && ui2.slots.length) tools.push(h('button', { class: 'a-tool', onclick: () => { ui2.loupe = false; g.redraw(); } }, 'Без лупы'));
    if (sim.lv(state, 'loupe')) {
      tools.push(h('button', { class: 'a-tool' + (ui2.loupe ? ' on' : ''), id: 'loupe', onclick: () => { ui2.loupe = !ui2.loupe; g.redraw(); }, disabled: !(state.run.loupe.n >= 1) && !ui2.loupe },
        GameIcons.el('loupe'), 'Лупа ' + Math.floor(state.run.loupe.n)));
    }
    if (sim.lv(state, 'scroll') || state.run.scroll.n >= 1) {
      tools.push(h('button', { class: 'a-tool', id: 'hint', onclick: hint, disabled: !(state.run.scroll.n >= 1) }, GameIcons.el('scroll'), 'Свиток ' + Math.floor(state.run.scroll.n)));
    }
    if (sim.unlocked(state, 'triple')) {
      tools.push(h('button', { class: 'a-tool' + (ui2.triple ? ' on' : ''), id: 'triple', onclick: () => { ui2.triple = !ui2.triple; ui2.slots = []; g.redraw(); } }, GameIcons.el('three'), 'Три'));
    }
    if (last && last.look && ui2.slots.length === need) tools.push(h('button', { class: 'a-tool on', onclick: () => { react(); g.redraw(); } }, 'Смешать'));
    view.tools.replaceChildren.apply(view.tools, tools);
  }

  function hint() {
    const r = g.act((state) => sim.useHint(state, g.config, Date.now()));
    if (!r.ok) {
      ui.toast(r.why);
      g.sfx('deny');
      return;
    }
    ui2.hint = r.k;
    ui2.last = { kind: 'hint', text: 'Подсказка: ' + r.ins.map(nameOf).join(' + '), sub: 'Элементы подсвечены на полке' };
    g.sfx('level');
    gridKey = '';
  }

  async function insight() {
    const r = await g.links.spend('insight');
    if (!r.ok) {
      ui.toast(r.off ? 'Связка «Шаги» выключена' : 'Нужна энергия: ' + r.need);
      g.buzz('deny');
      return;
    }
    g.act((state) => { state.run.insightUntil = Math.max(Date.now(), state.run.insightUntil || 0) + g.config['insight.minutes'] * 60000; }, { now: true, reason: 'spend' });
    g.sfx('level');
    gridKey = '';
  }

  // ---- the shelf ----
  function shelfKeys(state) {
    const t = sim.tree();
    let keys;
    if (ui2.filter === 'recent') keys = state.meta.recent.slice().reverse();
    else {
      keys = Object.keys(state.meta.book).filter((k) => t.els[k]);
      if (ui2.filter !== 'all') keys = keys.filter((k) => t.els[k].cat === ui2.filter);
      keys.sort((a, b) => t.els[a].tier - t.els[b].tier || (t.els[a].name < t.els[b].name ? -1 : 1));
    }
    if (ui2.search) {
      const q = sim.compareKey(ui2.search);
      keys = keys.filter((k) => k.indexOf(q) >= 0);
    }
    return keys.filter((k) => t.els[k]);
  }

  function drawFilter(state) {
    const chips = [h('button', { class: 'a-chip' + (ui2.filter === 'all' ? ' on' : ''), onclick: () => setFilter('all') }, 'Все'),
      h('button', { class: 'a-chip' + (ui2.filter === 'recent' ? ' on' : ''), onclick: () => setFilter('recent') }, 'Недавние')];
    if (sim.lv(state, 'catalog')) {
      const have = {};
      Object.keys(state.meta.book).forEach((k) => { const e = el(k); if (e) have[e.cat] = true; });
      content.categories.forEach((c) => {
        if (have[c.id]) chips.push(h('button', { class: 'a-chip' + (ui2.filter === c.id ? ' on' : ''), onclick: () => setFilter(c.id) }, c.id));
      });
      const input = h('input', { class: 'a-search', type: 'search', placeholder: 'Поиск', value: ui2.search, 'aria-label': 'Поиск по буквам' });
      input.addEventListener('input', () => { ui2.search = input.value; gridKey = ''; g.redraw(); });
      chips.unshift(input);
    }
    view.bar.replaceChildren.apply(view.bar, chips);
  }

  function setFilter(f) {
    ui2.filter = f;
    gridKey = '';
    tabKey = '';
    g.redraw();
  }

  function drawGrid(state) {
    const keys = shelfKeys(state);
    const lit = sim.highlights(state, Date.now());
    const hintIns = state.run.hint && state.run.hint.ins ? state.run.hint.ins : [];
    const nodes = keys.map((k) => {
      const t = tile(state, k, () => pick(k), () => elementSheet(k));
      if (lit[k]) t.classList.add('lit');
      if (hintIns.indexOf(k) >= 0) t.classList.add('hint');
      if (k === ui2.selected) t.classList.add('sel');
      return t;
    });
    if (!nodes.length) nodes.push(h('div', { class: 'g-note' }, 'Ничего не нашлось'));
    view.grid.replaceChildren.apply(view.grid, nodes);
  }

  function updateCounts(state) {
    view.grid.querySelectorAll('.a-tile').forEach((node) => {
      const k = node.getAttribute('data-key');
      const n = amount(state, k);
      const c = node.querySelector('.a-count');
      if (c.textContent !== String(n)) c.textContent = String(n);
      node.classList.toggle('empty', n <= 0);
    });
  }

  // ---- the sheets: an element, selling, the recipe of a cube ----
  function treeOf(state, key) {
    const t = sim.tree();
    const from = (t.producers[key] || []).map((rec) => ({ rec, open: !!state.meta.opened[rec.k] }));
    const into = (t.uses[key] || []).filter((rec) => state.meta.opened[rec.k]);
    const hidden = (t.uses[key] || []).length - into.length;
    return { from, into, hidden };
  }

  function recipeRow(state, rec, open) {
    const text = open ? rec.ins.map(nameOf).join(' + ') + ' = ' + nameOf(rec.r) : '? + ? = ' + nameOf(rec.r);
    const row = h('button', { class: 'a-rec' + (rec.src === 'model' ? ' model' : '') + (open ? '' : ' closed'), 'data-k': rec.k },
      open ? glyphNode(rec.r, 'small') : null, h('span', { class: 'grow' }, text), rec.src === 'model' && open ? h('span', { class: 'g-mark' }, 'модель') : null);
    press(row, () => { if (open) { ui2.selected = rec.r; tabKey = ''; g.redraw(); } }, open && rec.src === 'model' ? () => vetoSheet(rec) : null);
    return row;
  }

  function detail(state, key) {
    const e = el(key);
    if (!e) return [h('p', { class: 'g-note' }, 'Выберите элемент на полке — здесь будет его дерево.')];
    const tr = treeOf(state, key);
    const parts = [
      h('div', { class: 'a-card' }, glyphNode(key, 'big'), h('div', {}, h('h3', {}, e.name),
        h('div', { class: 'g-note' }, 'Ступень ' + e.tier + ' · ' + e.cat + ' · на складе ' + amount(state, key)))),
      h('p', { class: 'a-desc' }, e.desc),
      h('div', { class: 'a-h' }, 'Откуда'),
      tr.from.length ? tr.from.map((x) => recipeRow(state, x.rec, x.open)) : h('div', { class: 'g-note' }, e.tier === 0 ? 'Стихия: из источника' : 'Рецепт ещё не открыт')
    ];
    parts.push(h('div', { class: 'a-h' }, 'Во что входит'));
    parts.push(tr.into.length ? tr.into.map((rec) => recipeRow(state, rec, true)) : h('div', { class: 'g-note' }, 'Пока ни во что открытое'));
    if (sim.lv(state, 'pointer')) parts.push(h('div', { class: 'g-note' }, 'Неоткрытых рецептов с ним в запасе: ' + sim.stockOf(state, key)));
    else if (tr.hidden) parts.push(h('div', { class: 'g-note' }, 'Есть и неоткрытые рецепты — Указатель покажет, сколько'));
    return parts;
  }

  /** Selling and transmutation of one element: in its sheet, or in the side panel when wide. */
  function elementActions(state, key, done) {
    const e = el(key);
    if (!e) return [];
    const after = () => { if (done) done(); view.panelKey = ''; };
    const out = [h('div', { class: 'a-h' }, 'Продать'), h('div', { class: 'g-btns' },
      h('button', { class: 'g-btn small', 'aria-label': 'Продать 1', onclick: () => { doSell(key, 1); after(); } }, '1'),
      h('button', { class: 'g-btn small', 'aria-label': 'Продать 10', onclick: () => { doSell(key, 10); after(); } }, '10'),
      h('button', { class: 'g-btn small', 'aria-label': 'Продать всё', onclick: () => { doSell(key, null); after(); } }, 'Всё'))];
    if (sim.unlocked(state, 'transmute') && e.tier > 0) {
      out.push(h('button', { class: 'g-btn small', onclick: () => { if (done) done(); transmuteSheet(key); } }, 'Трансмутация: ' + g.config['transmute.cost'] + ' → 1'));
    }
    return out;
  }

  function elementSheet(key) {
    const state = g.state;
    ui2.selected = key;
    tabKey = '';
    if (g.layout === 'wide') {
      view.panelKey = '';
      g.redraw();
      return;
    }
    let close = null;
    close = g.sheet([h('div', { class: 'a-detail' }, detail(state, key)), elementActions(state, key, () => close()),
      h('button', { class: 'g-btn small', onclick: () => close() }, 'Закрыть')]);
  }

  function doSell(key, n) {
    const got = g.act((state) => sim.sell(state, g.config, key, n, g.links.mult(), Date.now()));
    if (Big.isZero(got)) {
      g.sfx('deny');
      return;
    }
    g.sfx('buy');
    g.buzz('buy');
    ui.toast('Продано на ' + g.fmt(got) + ' эссенции');
  }

  function sellSheet() {
    const state = g.state;
    const cap = sim.capOf(state, g.config);
    const keys = Object.keys(state.run.store).filter((k) => amount(state, k) > 0 && el(k));
    keys.sort((a, b) => sim.have(state, b) / cap - sim.have(state, a) / cap);
    const rows = keys.slice(0, 40).map((k) => h('div', { class: 'a-sellrow' }, glyphNode(k, 'small'),
      h('div', { class: 'grow' }, h('div', {}, nameOf(k)), h('div', { class: 'g-note g-num' }, amount(state, k) + ' из ' + g.fmt(cap) + ' · ' + g.fmt(sim.sellPrice(state, g.config, k, Date.now())) + ' за штуку')),
      h('button', { class: 'g-btn small a-mini', onclick: () => { doSell(k, null); close(); sellSheet(); } }, 'Всё')));
    const close = g.sheet([h('h3', {}, 'Продать'),
      h('button', { class: 'g-btn primary', onclick: () => { sellHalf(); close(); } }, 'Продать всё сверх половины склада'),
      h('div', { class: 'a-list' }, rows.length ? rows : h('p', { class: 'g-note' }, 'Склад пуст')),
      h('button', { class: 'g-btn small', onclick: () => close() }, 'Закрыть')]);
  }

  function sellHalf() {
    let total = Big.ZERO;
    g.act((state) => {
      const half = sim.capOf(state, g.config) / 2;
      Object.keys(state.run.store).forEach((k) => {
        const over = Math.floor(sim.have(state, k) - half);
        if (over > 0) total = Big.add(total, sim.sell(state, g.config, k, over, g.links.mult(), Date.now()));
      });
    });
    if (Big.isZero(total)) {
      ui.toast('Ничего сверх половины');
      return;
    }
    g.sfx('buy');
    ui.toast('Продано на ' + g.fmt(total) + ' эссенции');
  }

  function transmuteSheet(from) {
    const state = g.state;
    const tier = el(from).tier;
    const keys = Object.keys(state.meta.book).filter((k) => k !== from && el(k) && el(k).tier === tier);
    const close = g.sheet([h('h3', {}, 'Трансмутация: ' + nameOf(from)),
      h('p', { class: 'g-note' }, g.config['transmute.cost'] + ' штук → 1 штука другого элемента той же ступени'),
      h('div', { class: 'g-pick' }, keys.map((k) => h('button', { onclick: () => {
        const r = g.act((s) => sim.transmute(s, g.config, from, k));
        if (!r.ok) ui.toast(r.why);
        else g.sfx('level');
        close();
      } }, glyphNode(k, 'small'), h('span', { class: 'grow' }, nameOf(k))))),
      h('button', { class: 'g-btn small', onclick: () => close() }, 'Закрыть')]);
  }

  function vetoSheet(rec) {
    const text = rec.ins.map(nameOf).join(' + ') + ' = ' + nameOf(rec.r);
    const close = g.sheet([h('h3', {}, 'Убрать рецепт модели?'), h('p', {}, text),
      h('p', { class: 'g-note' }, 'Пара станет «реакции нет». ' + nameOf(rec.r) + ' исчезнет из Книги, если у него нет другого рецепта, вместе с неоткрытыми рецептами, где он нужен.'),
      h('div', { class: 'g-btns' },
        h('button', { class: 'g-btn small', onclick: () => close() }, 'Оставить'),
        h('button', { class: 'g-btn small primary', onclick: async () => {
          close();
          try {
            const plan = await engine('veto', rec.k, Object.keys(g.state.meta.opened));
            if (!plan || !plan.ok) {
              ui.toast(plan && plan.why ? plan.why : 'Не получилось');
              return;
            }
            g.act((state) => sim.forgetVetoed(state, plan), { now: true, reason: 'action' });
            sim.setGraph(await engine('graph'));
            if (ui2.selected && !el(ui2.selected)) ui2.selected = null;
            ui.toast(plan.keep ? 'Рецепт убран, элемент остался' : 'Рецепт убран вместе с ' + nameOf(rec.r));
            redrawAll();
          } catch (error) {
            ui.toast('Нет связи с движком: ' + error.message);
          }
        } }, 'Убрать'))]);
  }

  // ---- the pages of the other tabs ----
  function cubesPage(state) {
    const t = sim.tree();
    const cfg = g.config;
    const out = [h('div', { class: 'g-note' }, 'Кубов ' + state.run.cubes.length + ' из ' + cfg['cubes.max'] + ' · реакция раз в ' + g.fmt(sim.cubePeriod(state, cfg)) + ' с' +
      (sim.lv(state, 'athanor') || sim.unlocked(state, 'athanor') ? ' · Атанор: без вас на 100 %' : ' · без вас на ' + Math.round(cfg['cube.offline'] * 100) + ' %'))];
    state.run.cubes.forEach((c, i) => {
      const rec = c.k ? t.recipes[c.k] : null;
      let status = 'Пусто — выберите рецепт';
      if (rec) {
        if (c.fire) status = 'Пожар! Тапните ещё ' + c.fire;
        else if (!rec.ins.every((k) => sim.have(state, k) >= rec.ins.filter((x) => x === k).length)) status = 'Ждёт сырья';
        else if (sim.have(state, rec.r) + 1 > sim.capOf(state, cfg)) status = 'Склад полон';
        else status = 'Работает';
      }
      const bar = h('div', { class: 'g-progress' }, h('i', { style: 'width: ' + Math.round(Math.min(1, c.p) * 100) + '%' }));
      const card = h('button', { class: 'a-cube' + (c.fire ? ' fire' : ''), 'data-cube': i },
        rec ? glyphNode(rec.r) : AlchemistArt.el('cubes', 40),
        h('div', { class: 'grow' }, h('div', { class: 'a-cube-t' }, rec ? rec.ins.map(nameOf).join(' + ') + ' = ' + nameOf(rec.r) : 'Куб ' + (i + 1)),
          h('div', { class: 'g-note' }, status), bar));
      press(card, () => {
        if (c.fire) {
          g.act((s) => sim.tapFire(s, i));
          g.sfx('tap');
          g.buzz('tap');
          tabKey = '';
          return;
        }
        recipePicker(i);
      }, null);
      out.push(card);
    });
    const price = sim.costOf(state, cfg, 'cubes');
    if (price) out.push(h('button', { class: 'g-btn', onclick: () => buyUp('cubes') }, 'Ещё куб — ' + g.fmt.price(price)));
    return out;
  }

  function recipePicker(i) {
    const state = g.state;
    const t = sim.tree();
    const cfg = g.config;
    const list = Object.keys(state.meta.opened).map((k) => t.recipes[k]).filter((r) => !!r);
    const gainOf = (rec) => sim.value(state, cfg, rec.r) - rec.ins.reduce((s, k) => s + sim.value(state, cfg, k), 0);
    list.sort((a, b) => gainOf(b) - gainOf(a));
    const close = g.sheet([h('h3', {}, 'Рецепт для куба ' + (i + 1)),
      h('p', { class: 'g-note' }, 'Кубы связываются через склад: результат одного — сырьё другого.'),
      h('div', { class: 'g-pick a-list' }, list.slice(0, 80).map((rec) => h('button', { onclick: () => {
        g.act((s) => sim.setCube(s, i, rec.k));
        g.sfx('buy');
        close();
        tabKey = '';
      } }, glyphNode(rec.r, 'small'), h('span', { class: 'grow' }, h('div', {}, rec.ins.map(nameOf).join(' + ') + ' = ' + nameOf(rec.r)),
        h('div', { class: 'g-note' }, 'прибавка ' + g.fmt(Math.max(0, gainOf(rec))) + ' за реакцию'))))),
      h('div', { class: 'g-btns' }, h('button', { class: 'g-btn small', onclick: () => { g.act((s) => sim.setCube(s, i, null)); close(); tabKey = ''; } }, 'Снять рецепт'),
        h('button', { class: 'g-btn small', onclick: () => close() }, 'Закрыть'))]);
  }

  function bookPage(state) {
    const t = sim.tree();
    const keys = Object.keys(state.meta.book).filter((k) => t.els[k]);
    const opened = Object.keys(state.meta.opened).length;
    const asked = Object.keys(state.meta.asked).length;
    const st = view.stats;
    const out = [h('div', { class: 'g-lines' },
      Game.ui.line('Элементов в Книге', String(keys.length)),
      Game.ui.line('Открыто рецептов', String(opened)),
      Game.ui.line('Пар ждут сети', String(asked)),
      st ? Game.ui.line('Рецептов от модели в запасе', String(st.stock)) : null)];
    const byTier = {};
    keys.forEach((k) => { (byTier[t.els[k].tier] = byTier[t.els[k].tier] || []).push(k); });
    Object.keys(byTier).map(Number).sort((a, b) => a - b).forEach((tier) => {
      out.push(h('div', { class: 'a-h' }, 'Ступень ' + tier));
      const grid = h('div', { class: 'a-grid small' });
      byTier[tier].sort((a, b) => (t.els[a].name < t.els[b].name ? -1 : 1)).forEach((k) => {
        const tl = tile(state, k, () => elementSheet(k), () => elementSheet(k));
        if (sim.lv(state, 'pointer')) {
          const n = sim.stockOf(state, k);
          if (n) tl.appendChild(h('span', { class: 'a-pointer g-num' }, String(n)));
        }
        grid.appendChild(tl);
      });
      out.push(grid);
    });
    return out;
  }

  function ordersPage(state) {
    const cfg = g.config;
    const now = Date.now();
    if (!state.run.orders.length) return [h('p', { class: 'g-note' }, 'Гильдия пришлёт заказы, когда в Книге будет ' + cfg['orders.fromBook'] + ' элементов.')];
    return state.run.orders.map((o, i) => {
      if (!o.k) {
        const left = Math.max(0, Math.ceil((o.at - now) / 60000));
        return h('div', { class: 'a-order empty' }, GameIcons.el('timer'), h('div', { class: 'grow' }, 'Новый заказ через ' + left + ' мин'));
      }
      const have = amount(state, o.k);
      const reward = sim.orderReward(state, cfg, o, now) * g.links.mult();
      return h('div', { class: 'a-order' }, glyphNode(o.k),
        h('div', { class: 'grow' }, h('div', { class: 'a-cube-t' }, 'Сдать ' + o.n + ' × ' + nameOf(o.k)),
          h('div', { class: 'g-note g-num' }, 'есть ' + have + ' из ' + o.n + ' · награда ' + g.fmt(reward)),
          h('div', { class: 'g-progress' }, h('i', { style: 'width: ' + Math.min(100, Math.round(have / o.n * 100)) + '%' }))),
        h('button', { class: 'g-btn small a-mini', disabled: have < o.n, onclick: () => {
          const r = g.act((s) => sim.deliver(s, cfg, i, g.links.mult(), Date.now()), { now: true, reason: 'action' });
          if (r) {
            g.sfx('buy');
            g.buzz('buy');
            ui.toast('Гильдия заплатила ' + g.fmt(r));
            tabKey = '';
          }
        } }, 'Сдать'));
    });
  }

  function buyUp(id) {
    const ok = g.act((state) => sim.buy(state, g.config, id));
    if (!ok) {
      g.sfx('deny');
      g.buzz('deny');
      return;
    }
    g.sfx('buy');
    g.buzz('buy');
    tabKey = '';
    gridKey = '';
  }

  function upPage(state) {
    return sim.upgradeList(state, g.config).map((u) => {
      const maxed = !u.cost;
      const b = h('button', { class: 'g-btn small a-mini' + (u.can ? ' primary' : ''), 'data-up': u.id, disabled: maxed || !u.can, onclick: () => buyUp(u.id) },
        maxed ? 'Всё' : g.fmt.price(u.cost));
      return h('div', { class: 'a-up' + (u.level > (u.max > 1 && sim.SOURCES.some((x) => x.id === u.id) ? 1 : 0) ? ' has' : '') }, AlchemistArt.el(u.id, 40), h('div', { class: 'grow' }, h('div', { class: 'a-cube-t' }, u.title + (u.max > 1 ? ' · ур. ' + u.level : u.level ? ' · есть' : '')),
        h('div', { class: 'g-note' }, u.text)), b);
    });
  }

  /** What a page of a tab shows besides the book: a change builds it again. */
  function pageSig(state, now) {
    const cfg = g.config;
    if (ui2.tab === 'cubes') {
      return state.run.cubes.map((c) => {
        const rec = c.k ? sim.tree().recipes[c.k] : null;
        const ready = rec ? rec.ins.every((k) => sim.have(state, k) >= 1) && sim.have(state, rec.r) + 1 <= sim.capOf(state, cfg) : false;
        return (c.k || '-') + ':' + c.fire + ':' + ready;
      }).join(',') + '|' + !!sim.costOf(state, cfg, 'cubes') + '|' + sim.lv(state, 'coil');
    }
    if (ui2.tab === 'orders') {
      return state.run.orders.map((o) => o.k ? o.k + ':' + Math.min(o.n, amount(state, o.k)) : Math.max(0, Math.ceil((o.at - now) / 60000))).join(',') + '|' + sim.stones(state);
    }
    if (ui2.tab === 'up') return sim.upgradeList(state, cfg).map((u) => u.id + u.level + (u.can ? '+' : '-')).join(',');
    if (ui2.tab === 'book') return String(view.stats ? view.stats.stock : '') + Object.keys(state.meta.asked).length;
    return '';
  }

  // ---- achievements ----
  function achievements(state) {
    const cfg = g.config;
    const n = state.meta.bookN || 0;
    if (n > 4) g.achieve('steam');
    if (n >= cfg['achieve.hundred']) g.achieve('hundred');
    if (n >= cfg['achieve.thousand']) g.achieve('thousand');
    if (state.meta.book['метро']) g.achieve('metro');
    if (state.layers.stone && state.layers.stone.count) g.achieve('stone');
    if (state.meta.book['эфир']) g.achieve('ether');
    if (n >= cfg['achieve.noHints'] && !state.meta.hints) g.achieve('nohints');
    if ((state.meta.maxTier || 0) >= cfg['achieve.tier']) g.achieve('tier20');
  }

  // ---- every frame ----
  function render(state) {
    const cfg = g.config;
    const now = Date.now();
    if (view.world) view.world.update(AlchemyScene.model(state, cfg, Object.assign({}, sim.tree(), { palette: content.palette }), {
      slots: ui2.slots, capacity: sim.capOf(state, cfg), stones: sim.stones(state), tinctures: sim.tinctures(state), last: ui2.last,
      sourceWorking: sim.SOURCES.some(source => sim.sourceRate(state, cfg, source) > 0)
    }));
    view.ess.textContent = ui.t('{} эссенции', g.fmt.live(state.run.ess));
    const clerk = sim.lv(state, 'clerk');
    const rate = clerk ? sim.incomeRate(state, cfg) * g.links.mult() : 0;
    const stones = sim.stones(state);
    const parts = [clerk ? g.fmt.rate(rate) : ui.t('Склад {} на элемент', g.fmt(sim.capOf(state, cfg))), ui.t('Книга {}', state.meta.bookN || 0)];
    if (stones) parts.push(ui.t('камней {}', g.fmt(stones)));
    view.rate.textContent = parts.join(' · ');
    const heavy = now - lastHeavy > 700;
    if (heavy) {
      lastHeavy = now;
      const stock = sim.stockCount(state);
      view.stock.textContent = stock ? ui.t('В запасе открытий: {}', stock) : ui.t('Запаса из открытого нет — подсказка, кубы и заказы');
      view.stock.classList.toggle('none', !stock);
    }
    if (state.run.eventNo !== eventNo) {
      if (eventNo && state.run.event) {
        const ev = sim.EVENTS[state.run.event.id];
        if (ev) g.flash('sparkle', ev.title, ev.text, 4000);
        g.sfx('alarm');
        tabKey = '';
      }
      eventNo = state.run.eventNo;
    }
    const layout = g.layout;
    const shelf = ui2.tab === 'shelf';
    view.cauldron.hidden = !shelf;
    view.bar.hidden = !shelf;
    view.grid.hidden = !shelf;
    view.page.hidden = shelf;
    if (shelf) {
      drawCauldron(state);
      const key = [layout, ui2.filter, ui2.search, state.meta.bookN, state.run.hint ? state.run.hint.k : '', ui2.selected, state.run.insightUntil > now, sim.lv(state, 'catalog'), sim.tree().version].join('|');
      if (key !== gridKey) {
        gridKey = key;
        drawFilter(state);
        drawGrid(state);
      } else if (heavy) updateCounts(state);
    }
    // A page is built again only when what it shows changed: a rebuilt button loses a tap.
    if (!shelf && (heavy || !tabKey)) {
      const pageKey = [ui2.tab, layout, ui2.selected, state.meta.bookN, Object.keys(state.meta.opened).length, pageSig(state, now)].join('|');
      if (pageKey !== tabKey) {
        tabKey = pageKey;
        const page = ui2.tab === 'cubes' ? cubesPage(state) : ui2.tab === 'book' ? bookPage(state) : ui2.tab === 'orders' ? ordersPage(state) : upPage(state);
        const y = g.el.field.scrollTop;
        fill(view.page, page);
        g.el.field.scrollTop = y;
      }
    }
    if (ui2.tab === 'cubes') {
      view.page.querySelectorAll('[data-cube]').forEach((node) => {
        const c = state.run.cubes[Number(node.getAttribute('data-cube'))];
        const bar = node.querySelector('.g-progress > i');
        if (c && bar) bar.style.width = Math.round(Math.min(1, c.p) * 100) + '%';
      });
    }
    if (layout === 'wide' && (heavy || !view.panelKey)) {
      const panelKey = [ui2.selected, ui2.selected ? amount(state, ui2.selected) : 0, state.meta.bookN, Object.keys(state.meta.opened).length, sim.unlocked(state, 'transmute')].join('|');
      if (panelKey !== view.panelKey) {
        view.panelKey = panelKey;
        fill(view.panel, detail(state, ui2.selected).concat(ui2.selected ? elementActions(state, ui2.selected, null) : []));
      }
    }
    view.panel.hidden = layout !== 'wide';
    view.tabs.querySelectorAll('.a-tab').forEach((b) => b.classList.toggle('on', b.getAttribute('data-tab') === ui2.tab));
    const steps = g.links.status().steps;
    view.insight.hidden = !(steps && steps.on);
    view.insightLabel.textContent = state.run.insightUntil > now ? ui.t('Вдохновение: {} мин', Math.ceil((state.run.insightUntil - now) / 60000)) : ui.t('Вдохновение');
    view.tincture.hidden = !sim.unlocked(state, 'great');
    // The stone's button appears when it is near: until then the shelf gets the room.
    view.prestige.hidden = !(stones || (state.meta.bookN || 0) >= cfg['stone.minBook'] * 0.75 || (state.meta.cycles || 0) > 0);
    view.sell.hidden = !shelf;
    achievements(state);
  }

  await Game.start({ sim, render, init: build, help: null });
})();
