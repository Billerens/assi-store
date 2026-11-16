// The screen of «Династия». The engine (Game.start) gives the frame — g.el.top (the portrait of
// the ruler, the gold), g.el.field, g.el.actions (under the thumb) — and keeps the state, saves,
// offline, prestige, sound. The logic is in ../sim.js; numbers come from g.config, texts from
// ../content/*.json (fetched here and handed to the sim with GameSim.use before the start).
//
// Narrow and mid: the tabs (Владения, Двор, Семья, Род) in the field, the card of the court and
// the main buttons at the bottom. Wide (the inner screen of the Fold): the family tree on the
// left, the tabs and the buttons on the right.
(async function () {
  const h = ui.h;
  const sim = window.GameSim;
  const Art = window.DynastyArt;
  const NS = 'http://www.w3.org/2000/svg';
  const C = await content();
  sim.use(C);
  const T = {};
  C.traits.forEach((t) => { T[t.id] = t; });
  const TABS = [['holdings', 'Владения'], ['court', 'Двор'], ['family', 'Семья'], ['house', 'Род']];
  const view = {};
  const local = { tab: remembered('tab', 'holdings'), mode: 1, ancestors: false, pulling: false, pan: { x: 0, y: 0, s: 1, fit: '' } };
  let g = null;
  let clipN = 0;

  async function content() {
    const names = ['world', 'traits', 'names', 'cards', 'chronicle'];
    const list = await Promise.all(names.map((n) => fetch('../content/' + n + '.json').then((r) => {
      if (!r.ok) throw new Error('content/' + n + '.json: ' + r.status);
      return r.json();
    })));
    const out = {};
    names.forEach((n, i) => { out[n] = list[i]; });
    return out;
  }

  function remembered(key, fallback) {
    try {
      return localStorage.getItem('dynasty:' + key) || fallback;
    } catch (error) {
      return fallback;
    }
  }

  function remember(key, value) {
    try {
      localStorage.setItem('dynasty:' + key, value);
    } catch (error) { /* private mode */ }
  }

  // ---- small helpers --------------------------------------------------------------------------------

  function svg(tag, attrs, ...kids) {
    const node = document.createElementNS(NS, tag);
    for (const k in attrs || {}) if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
    kids.forEach((c) => { if (c) node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return node;
  }

  /** Rebuilds `node` only when its key changed; the builder registers live updaters in `up`. */
  function keyed(node, key, build) {
    if (node.__key === key) return false;
    node.__key = key;
    node.__up = [];
    node.replaceChildren(...[].concat(build(node.__up)).filter(Boolean));
    return true;
  }

  function live(node) { (node.__up || []).forEach((f) => f()); }

  function years(n) { return n + ' ' + g.fmt.plural(n, 'год', 'года', 'лет'); }

  function lands(n) { return n + ' ' + g.fmt.plural(n, 'Земля', 'Земли', 'Земель'); }

  function pct(x) { return Math.round(x * 100) + ' %'; }

  function gold(x) { return g.fmt.price(x); }

  function line(k, v) { return g.ui.line(k, v); }

  function section(title, ...kids) { return h('section', { class: 'd-sec' }, title ? h('h4', {}, title) : null, ...kids); }

  function note(text) { return h('p', { class: 'g-note' }, text); }

  // ---- the coat of arms and the headwear ----------------------------------------------------------------

  const SHIELD = 'M3 3h34v19c0 12.5-8.5 19.5-17 23C11.5 41.5 3 34.5 3 22z';

  function rect(x, y, w, hh, fill) { return svg('rect', { x, y, width: w, height: hh, fill }); }

  function charge(kind, c) {
    switch (kind) {
      case 'bar': return rect(3, 19, 34, 8, c);
      case 'chevron': return svg('path', { d: 'M5 35 20 17l15 18', fill: 'none', stroke: c, 'stroke-width': 6 });
      case 'cross': return svg('g', {}, rect(16, 0, 8, 48, c), rect(0, 17, 40, 8, c));
      case 'circle': return svg('circle', { cx: 20, cy: 23, r: 8, fill: c });
      case 'saltire': return svg('path', { d: 'M2 2 38 46M38 2 2 46', stroke: c, 'stroke-width': 6 });
      case 'pale': return rect(15, 0, 10, 48, c);
      case 'circles': return svg('g', { fill: c }, svg('circle', { cx: 12, cy: 14, r: 4 }), svg('circle', { cx: 28, cy: 14, r: 4 }), svg('circle', { cx: 20, cy: 30, r: 4 }));
      case 'lozenge': return svg('path', { d: 'M20 9 30 24 20 39 10 24z', fill: c });
      default: return null;
    }
  }

  function addition(a) {
    const c = a.color;
    switch (a.add) {
      case 'bordure': return svg('path', { d: SHIELD, fill: 'none', stroke: c, 'stroke-width': 5 });
      case 'label': return svg('g', { fill: c }, rect(8, 5, 24, 3), rect(10.5, 8, 3, 5), rect(18.5, 8, 3, 5), rect(26.5, 8, 3, 5));
      case 'star': return svg('path', { d: 'M10 5l1.5 3.2 3.5.4-2.6 2.4.7 3.5L10 12.8l-3.1 1.7.7-3.5L5 8.6l3.5-.4z', fill: c });
      case 'canton': return rect(3, 3, 12, 12, c);
      case 'base': return rect(0, 38, 40, 10, c);
      case 'ring': return svg('circle', { cx: 20, cy: 10, r: 3.5, fill: 'none', stroke: c, 'stroke-width': 2 });
      default: return null;
    }
  }

  /** A shield of simple figures: a field (divided), a charge, the additions of the branches. */
  function coat(c, adds, size, x, y) {
    const id = 'd-clip' + (++clipN);
    const body = svg('g', { 'clip-path': 'url(#' + id + ')' }, rect(0, 0, 40, 48, c.a));
    const b = c.b;
    if (c.div === 'pale') body.append(rect(20, 0, 20, 48, b));
    else if (c.div === 'fess') body.append(rect(0, 24, 40, 24, b));
    else if (c.div === 'bend') body.append(svg('path', { d: 'M0 0 40 48H0z', fill: b }));
    else if (c.div === 'quarter') body.append(rect(20, 0, 20, 24, b), rect(0, 24, 20, 24, b));
    else if (c.div === 'chief') body.append(rect(0, 0, 40, 14, b));
    body.append(charge(c.charge, c.c) || svg('g'));
    (adds || []).forEach((a) => { const n = addition(a); if (n) body.append(n); });
    return svg('svg', { viewBox: '0 0 40 48', width: size, height: size * 1.2, x, y, class: 'd-coat' },
      svg('defs', {}, svg('clipPath', { id }, svg('path', { d: SHIELD }))), body,
      svg('path', { d: SHIELD, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.5, opacity: 0.5 }));
  }

  function addsFor(state, epoch) {
    const out = [];
    const b = state.meta.branches || {};
    for (let e = 1; e <= epoch; e++) if (b[e]) out.push(b[e]);
    return out;
  }

  const HATS = {
    cap: 'M7 17c0-7 5.5-11 13-11s13 4 13 11zM5 17h30v2.5H5z',
    crown: 'M6 18 8 5l6 6 6-8 6 8 6-6 2 13z',
    beret: 'M5 15c0-5 7-8 15-8s15 3 15 8c-4 2-26 2-30 0zM19 3h2v4h-2z',
    tricorn: 'M3 15 20 6l17 9-8-1-9 5-9-5z',
    wig: 'M8 19C5 8 11 4 20 4s15 4 12 15c-2-3-4-3-5 0-1-3-4-3-5 0-1-3-3-3-4 0-1-3-3-3-5 0-1-3-3-3-5 0z',
    tophat: 'M13 1h14v14H13zM7 15h26v3.5H7z'
  };

  function hat(kind) {
    return svg('svg', { viewBox: '0 0 40 20', class: 'd-hat', 'aria-hidden': 'true' }, svg('path', { d: HATS[kind] || HATS.cap, fill: 'currentColor' }));
  }

  // ---- traits as small figures ------------------------------------------------------------------------------

  const SHAPES = {
    circle: 'M8 2.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11z',
    square: 'M3 3h10v10H3z',
    triangle: 'M8 2.5 14 13.5H2z',
    dot: 'M8 5a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
    wave: 'M1.5 9.5c2.2-3.5 4.3-3.5 6.5 0s4.3 3.5 6.5 0',
    cross: 'M6.5 2h3v4.5H14v3H9.5V14h-3V9.5H2v-3h4.5z',
    diamond: 'M8 1.8 14.2 8 8 14.2 1.8 8z',
    bar: 'M2 6h12v4H2z',
    chevron: 'M2 11.5 8 5l6 6.5',
    ring: 'M8 3a5 5 0 1 0 0 10A5 5 0 0 0 8 3z',
    half: 'M8 2.5a5.5 5.5 0 0 0 0 11z',
    tower: 'M4 14V5h2V2.5h1.5V5h1V2.5H10V5h2v9z',
    hourglass: 'M3 2h10L8 8l5 6H3l5-6z',
    star: 'M8 1.8l1.9 4 4.3.5-3.2 3 .9 4.3L8 11.4l-3.9 2.2.9-4.3-3.2-3 4.3-.5z',
    moon: 'M10.5 2.3a5.8 5.8 0 1 0 3.3 10 4.6 4.6 0 0 1-3.3-10z',
    anchor: 'M8 4.5V14M5 6.5h6M2.8 10c0 2.6 2.3 4 5.2 4s5.2-1.4 5.2-4M8 2a1.3 1.3 0 1 0 0 2.6A1.3 1.3 0 0 0 8 2z',
    hand: 'M4.5 14V8M7 14V3.5M9.5 14V5M12 14V7',
    shield: 'M3 2.5h10V8c0 3-2.5 5-5 6-2.5-1-5-3-5-6z',
    dots: 'M3 8a1.6 1.6 0 1 0 3.2 0A1.6 1.6 0 0 0 3 8zm3.4 0a1.6 1.6 0 1 0 3.2 0 1.6 1.6 0 0 0-3.2 0zm3.4 0a1.6 1.6 0 1 0 3.2 0 1.6 1.6 0 0 0-3.2 0z',
    book: 'M2 3.5h5v9.5H2zM9 3.5h5v9.5H9z'
  };
  const LINES = { wave: 1, chevron: 1, anchor: 1, hand: 1 };

  function traitIcon(id) {
    const t = T[id];
    if (!t) return null;
    const lineOnly = LINES[t.shape] || !t.fill;
    return svg('svg', { viewBox: '0 0 16 16', class: 'd-trait' + (t.fill ? '' : ' bad') + (t.rare ? ' rare' : ''), 'aria-hidden': 'true' },
      svg('path', { d: SHAPES[t.shape] || SHAPES.dot, fill: lineOnly ? 'none' : 'currentColor', stroke: lineOnly ? 'currentColor' : 'none', 'stroke-width': 1.6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
  }

  function traitChips(list) {
    return h('div', { class: 'd-chips' }, (list || []).map((id) => T[id] ? h('span', { class: 'd-chip' + (T[id].fill ? '' : ' bad') }, traitIcon(id), T[id].title) : null));
  }

  function traitsSheet(p, title) {
    const rows = (p.tr || []).map((id) => {
      const t = T[id];
      return t ? h('div', { class: 'd-trait-row' }, traitIcon(id), h('div', { class: 'grow' }, h('div', { class: 'd-row-t' }, t.title + (t.strong ? ' · сильная' : '') + (t.rare ? ' · редкая' : '')), h('div', { class: 'd-row-s' }, t.text))) : null;
    });
    const close = g.sheet([h('h3', { 'data-raw': '' }, title), rows.length ? h('div', { class: 'd-list' }, rows) : note('Черт нет — всё впереди'),
      h('button', { class: 'g-btn small', onclick: () => close() }, 'Закрыть')]);
  }

  function statsLine(state, p) {
    return h('div', { class: 'd-stats' }, C.world.stats.map((s) => h('span', { class: 'd-stat', title: s.title }, Art.el(s.id, 18), h('span', { class: 'k' }, s.title), h('b', {}, String(sim.stat(state, p, s.id))))));
  }

  // ---- the top: the portrait of the ruler -----------------------------------------------------------------------

  function buildTop() {
    view.face = h('button', { class: 'd-face', 'aria-label': 'Черты правителя', onclick: () => traitsSheet(g.state.run.ruler, rulerName(g.state)) });
    view.name = h('div', { class: 'd-name', 'data-raw': '' });
    view.age = h('div', { class: 'd-age' });
    view.lifeBar = h('i', {});
    view.life = h('div', { class: 'd-life', role: 'progressbar', 'aria-label': 'Жизнь' }, view.lifeBar);
    view.lifeText = h('div', { class: 'd-life-t' });
    view.stats = h('div', { class: 'd-top-stats' });
    view.gold = h('div', { class: 'g-big', id: 'gold' });
    view.rate = h('div', { class: 'g-rate', id: 'rate' });
    g.el.top.append(
      h('div', { class: 'd-portrait' }, view.face, h('div', { class: 'd-who' }, view.name, view.age, view.life, view.lifeText)),
      view.stats,
      h('div', { class: 'd-gold' }, view.gold, view.rate));
  }

  function rulerName(state) {
    const r = state.run.ruler;
    const nick = sim.nickOf(r);
    return r.name + (nick ? ' ' + nick : '');
  }

  function renderTop(state) {
    const cfg = g.config;
    const run = state.run;
    const r = run.ruler;
    const e = sim.epochIndex(state);
    const ep = C.world.epochs[e % 6];
    keyed(view.face, [e, JSON.stringify(state.meta.coat), Object.keys(state.meta.branches || {}).length].join('|'), () => [hat(ep.crown), coat(state.meta.coat, addsFor(state, e), 38)]);
    const age = Math.floor(r.age + 1e-6);
    const life = sim.life(state, cfg);
    view.name.textContent = rulerName(state);
    const gen = (state.layers.generation.count || 0) + 1;
    view.age.textContent = ui.t('{} · поколение {}', years(age), gen) + (r.regent ? ui.t(' · с регентом') : '');
    view.lifeBar.style.width = Math.min(100, r.age / life * 100) + '%';
    view.life.classList.toggle('end', run.dead || sim.onDeathbed(state, cfg));
    view.lifeText.textContent = run.dead ? 'Правитель умер — престол ждёт наследника' : sim.onDeathbed(state, cfg) ? 'На смертном одре' : ui.t('жизнь — до {}', years(Math.floor(life)));
    keyed(view.stats, sim.STATS.map((k) => sim.stat(state, r, k)).join(',') + '|' + r.tr.join(','), () => {
      const box = statsLine(state, r);
      box.append(h('button', { class: 'd-traits', 'aria-label': 'Черты правителя', onclick: () => traitsSheet(g.state.run.ruler, rulerName(g.state)) }, r.tr.length ? r.tr.map(traitIcon) : h('span', { class: 'g-note' }, 'без черт')));
      return [box];
    });
    view.gold.textContent = g.fmt.live(run.gold);
    view.rate.textContent = g.fmt.rate(rateNow(state));
  }

  function rateNow(state) { return Big.mul(sim.rate(state, g.config, Date.now()), g.links.mult()); }

  // ---- the tabs -----------------------------------------------------------------------------------------------

  function buildPanel() {
    view.tabs = h('nav', { class: 'd-tabs', role: 'tablist' }, TABS.map(([id, title]) => h('button', { class: 'd-tab', 'data-id': id, role: 'tab', onclick: () => showTab(id) }, title)));
    view.pages = {};
    TABS.forEach(([id]) => { view.pages[id] = h('div', { class: 'd-page', 'data-tab': id }); });
    view.panel = h('div', { class: 'd-panel' }, view.tabs, ...TABS.map(([id]) => view.pages[id]));
  }

  function showTab(id) {
    local.tab = id;
    remember('tab', id);
    g.redraw();
    const top = g.layout === 'wide' ? view.panel : g.el.field;
    if (top) top.scrollTop = 0;
  }

  // Владения
  function count(state, i) {
    if (local.mode === 0) return Math.max(1, sim.maxCount(state, g.config, i));
    return local.mode;
  }

  function buyTier(i) {
    const k = g.act((s) => sim.buyHolding(s, g.config, i, count(s, i)));
    if (!k) {
      g.sfx('deny');
      g.buzz('deny');
      return;
    }
    g.sfx('buy');
    g.buzz('buy');
  }

  function holdingsPage(state) {
    const cfg = g.config;
    const run = state.run;
    const n = sim.tiers(state);
    let shown = 0;
    for (let i = 0; i < n; i++) if (run.h[i]) shown = i + 1;
    shown = Math.min(n, shown + 1);
    const key = [run.h.join(','), shown, local.mode, sim.epochIndex(state), run.fx.freeNext ? 1 : 0, run.fx.fireUntil > run.ruler.age ? 1 : 0, run.ruler.tr.join(',')].join('|');
    keyed(view.pages.holdings, key, (up) => {
      const modes = h('div', { class: 'd-modes', role: 'group', 'aria-label': 'Сколько покупать' }, [[1, '×1'], [10, '×10'], [0, 'Макс']].map(([m, t]) =>
        h('button', { class: 'd-mode' + (local.mode === m ? ' on' : ''), onclick: () => { local.mode = m; g.redraw(); } }, t)));
      const rows = [];
      for (let i = 0; i < shown; i++) {
        const have = run.h[i] || 0;
        const price = h('span', { class: 'g-num' });
        const many = h('span', { class: 'd-buy-n' });
        const btn = h('button', { class: 'd-buy', onclick: () => buyTier(i) }, price, many);
        const sub = h('div', { class: 'd-row-s' });
        up.push(() => {
          const s = g.state;
          const k = count(s, i);
          const cost = sim.cost(s, cfg, i, k);
          price.textContent = gold(cost);
          many.textContent = k > 1 ? '×' + k : '';
          btn.disabled = Big.lt(s.run.gold, cost) || (local.mode === 0 && sim.maxCount(s, cfg, i) < 1);
          const m = sim.multiplier(s, cfg);
          const one = Big.mul(sim.tierIncome(s, cfg, i, 1), m);
          const all = Big.mul(sim.tierIncome(s, cfg, i, have), m);
          const next = sim.nextMilestone(cfg, have);
          sub.textContent = ui.t('{}/с за одно', g.fmt(one)) + (have ? ui.t(' · всего {}', g.fmt.rate(all)) : '') + (next ? ui.t(' · веха {}', next) : '');
        });
        const title = C.world.holdings[i].title;
        rows.push(h('div', { class: 'd-row' + (have ? '' : ' new') }, Art.el(C.world.holdings[i].id, 40),
          h('div', { class: 'grow' }, h('div', { class: 'd-row-t' }, title, have ? h('span', { class: 'd-count' }, String(have)) : null), sub), btn));
      }
      const notes = [];
      if (run.fx.freeNext) notes.push(note('Чертёж строителя: следующее владение — даром'));
      if (run.fx.fireUntil > run.ruler.age) notes.push(note('Пожар: Город приносит вдвое меньше'));
      if (shown < n) notes.push(note(ui.t('Дальше: {} — от {}', C.world.holdings[shown].title, gold(sim.cost(state, cfg, shown, 1)))));
      return [modes, h('div', { class: 'd-list' }, rows), ...notes];
    });
  }

  // Двор
  function courtTitle(k) {
    const list = C.world.court;
    const lap = Math.floor(k / list.length);
    return list[k % list.length] + (lap ? ' ' + ['II', 'III', 'IV', 'V', 'VI'][Math.min(lap, 5) - 1] : '');
  }

  function courtPage(state) {
    const cfg = g.config;
    const run = state.run;
    const gs = sim.genState(state);
    const steps = g.links.status().steps;
    const key = [run.court, run.lands, run.campaign ? run.campaign.to : 0, sim.canCampaign(state, cfg) ? 1 : 0, sim.epochIndex(state), gs.colonies.length,
      gs.scholar ? gs.scholar.at : 0, gs.discoveries, steps && steps.on ? 1 : 0, run.ruler.pb || 0, run.dead ? 1 : 0, (run.deeds || {}).pilgrimage ? 1 : 0].join('|');
    keyed(view.pages.court, key, (up) => {
      const out = [];
      // The court: each place multiplies the income.
      const price = h('span', { class: 'g-num' });
      const hire = h('button', { class: 'd-buy', onclick: () => {
        if (!g.act((s) => sim.buyCourt(s, cfg))) {
          g.sfx('deny');
          return;
        }
        g.sfx('level');
        g.buzz('buy');
      } }, price);
      up.push(() => {
        const c = sim.courtCost(g.state, cfg);
        price.textContent = gold(c);
        hire.disabled = Big.lt(g.state.run.gold, c);
      });
      const hired = [];
      for (let k = 0; k < run.court; k++) hired.push(courtTitle(k));
      out.push(section('Двор',
        h('div', { class: 'd-row' }, Art.el('court', 40), h('div', { class: 'grow' }, h('div', { class: 'd-row-t' }, courtTitle(run.court)),
          h('div', { class: 'd-row-s' }, ui.t('доход {} до конца поколения', g.fmt.mult(cfg['court.mult'])))), hire),
        hired.length ? note(ui.t('При дворе: {}', hired.join(', ')) + ' — ' + g.fmt.mult(Math.pow(cfg['court.mult'], run.court))) : null));
      out.push(section('Земли', note(run.lands ? ui.t('{} — золото +{}', lands(run.lands), pct(cfg['bonus.lands'] * run.lands)) : 'Земель пока нет: их дают походы, браки и события двора')));
      out.push(campaignSection(state, up));
      if (sim.opened(state, 2)) out.push(scholarSection(state, up));
      if (sim.opened(state, 3)) out.push(colonySection(state, up));
      if (steps && steps.on) out.push(pilgrimSection(state));
      return out;
    });
  }

  function campaignSection(state, up) {
    const cfg = g.config;
    const run = state.run;
    const war = sim.stat(state, run.ruler, 'war');
    if (run.campaign) {
      const bar = h('i', {});
      const left = h('div', { class: 'd-row-s' });
      up.push(() => {
        const c = g.state.run.campaign;
        if (!c) return;
        const p = Math.min(1, (Date.now() - c.from) / (c.to - c.from));
        bar.style.width = p * 100 + '%';
        left.textContent = ui.t('вернётся через {} · шанс {}', g.fmt.time(Math.max(0, (c.to - Date.now()) / 1000)), pct(c.chance));
      });
      const title = (C.world.campaigns.find((x) => x.id === run.campaign.kind) || {}).title || 'Поход';
      return section('Походы', h('div', { class: 'd-row' }, Art.el('march', 40), h('div', { class: 'grow' }, h('div', { class: 'd-row-t' }, title), left, h('div', { class: 'g-progress' }, bar))));
    }
    if (war < cfg['campaign.minWar']) return section('Походы', note(ui.t('Походы — с Войны {} (у правителя {})', cfg['campaign.minWar'], war)));
    const rows = C.world.campaigns.map((c) => {
      const price = h('span', { class: 'g-num' });
      const sub = h('div', { class: 'd-row-s' });
      const go = h('button', { class: 'd-buy', onclick: () => {
        if (!g.act((s) => sim.startCampaign(s, g.config, c.id, Date.now()), { now: true })) {
          g.sfx('deny');
          return;
        }
        g.sfx('level');
      } }, price);
      up.push(() => {
        const info = sim.campaignInfo(g.state, g.config, c.id);
        price.textContent = gold(info.price);
        go.disabled = Big.lt(g.state.run.gold, info.price) || g.state.run.dead;
        sub.textContent = ui.t('{} мин · шанс {} · +{}', info.minutes, pct(info.chance), lands(info.lands));
      });
      return h('div', { class: 'd-row' }, Art.el(c.id === 'war' ? 'campaign' : c.id, 40), h('div', { class: 'grow' }, h('div', { class: 'd-row-t' }, c.title), sub), go);
    });
    return section('Походы', h('div', { class: 'd-list' }, rows), note('Неудача — вложенное золото пропадает'));
  }

  function scholarSection(state, up) {
    const cfg = g.config;
    const gs = sim.genState(state);
    const out = [];
    if (gs.discoveries) out.push(note(ui.t('Открытий: {} — золото +{}', gs.discoveries, pct(cfg['patron.bonus'] * gs.discoveries))));
    if (gs.scholar) {
      const bar = h('i', {});
      up.push(() => {
        const s = sim.genState(g.state).scholar;
        if (s) bar.style.width = Math.min(100, (s ? (sim.genState(g.state).years - s.from) / (s.at - s.from) : 1) * 100) + '%';
      });
      out.push(h('div', { class: 'd-row' }, Art.el('scholar', 40), h('div', { class: 'grow' }, h('div', { class: 'd-row-t' }, 'Учёный на жалованье'), h('div', { class: 'g-progress' }, bar))));
    } else {
      const price = h('span', { class: 'g-num' });
      const sub = h('div', { class: 'd-row-s' });
      const go = h('button', { class: 'd-buy', onclick: () => { if (!g.act((s) => sim.fundScholar(s, g.config))) g.sfx('deny'); } }, price);
      up.push(() => {
        const info = sim.scholarInfo(g.state, cfg);
        price.textContent = gold(info.price);
        go.disabled = Big.lt(g.state.run.gold, info.price);
        sub.textContent = ui.t('открытие через {}', years(Math.ceil(info.years)));
      });
      out.push(h('div', { class: 'd-row' }, Art.el('scholar', 40), h('div', { class: 'grow' }, h('div', { class: 'd-row-t' }, 'Нанять учёного'), sub), go));
    }
    return section('Меценатство', ...out);
  }

  function colonySection(state, up) {
    const cfg = g.config;
    const gs = sim.genState(state);
    const out = gs.colonies.map((c) => {
      const left = h('div', { class: 'd-row-s' });
      up.push(() => { left.textContent = ui.t('вернётся через {}', g.fmt.time(Math.max(0, (c.to - Date.now()) / 1000))); });
      return h('div', { class: 'd-row' }, Art.el('ship', 40), h('div', { class: 'grow' }, h('div', { class: 'd-row-t' }, c.title), left));
    });
    if (gs.colonies.length < cfg['colony.max']) {
      C.world.colonies.forEach((c, i) => {
        const price = h('span', { class: 'g-num' });
        const sub = h('div', { class: 'd-row-s' });
        const go = h('button', { class: 'd-buy', onclick: () => { if (!g.act((s) => sim.sendColony(s, g.config, i, Date.now()), { now: true })) g.sfx('deny'); } }, price);
        up.push(() => {
          const info = sim.colonyInfo(g.state, cfg, i);
          price.textContent = gold(info.price);
          go.disabled = Big.lt(g.state.run.gold, info.price);
          sub.textContent = ui.t('{} ч · привезёт {} · Земля {}', info.hours, gold(info.gold), pct(info.land));
        });
        out.push(h('div', { class: 'd-row' }, Art.el(c.id, 40), h('div', { class: 'grow' }, h('div', { class: 'd-row-t' }, c.title), sub), go));
      });
    }
    return section('Колонии', h('div', { class: 'd-list' }, out));
  }

  function pilgrimSection(state) {
    const cfg = g.config;
    const run = state.run;
    const cost = cfg['steps.cost.pilgrimage'];
    const can = (kind) => kind === 'health' ? (run.ruler.pb || 0) < cfg['pilgrimage.maxHealth'] : !(run.deeds || {}).pilgrimage;
    const go = (kind) => async () => {
      if (!can(kind) || g.state.run.dead) return;
      const r = await g.links.spend('pilgrimage');
      if (!r.ok) {
        ui.toast(r.off ? 'Связка «Шаги» выключена' : ui.t('Нужно {} энергии', r.need));
        g.buzz('deny');
        return;
      }
      g.act((s) => sim.pilgrimage(s, g.config, kind), { now: true, reason: 'spend' });
      g.flash('steps', 'Паломничество', kind === 'health' ? '+1 Здоровье правителю' : '+1 деяние');
      g.sfx('level');
    };
    return section('Паломничество',
      note(ui.t('Шаги превращаются в энергию; паломничество стоит {}', cost + ' ' + g.fmt.plural(cost, 'энергию', 'энергии', 'энергии'))),
      h('div', { class: 'g-btns' },
        h('button', { class: 'g-btn small', disabled: !can('health') || run.dead, onclick: go('health') }, ui.t('+1 Здоровье ({} из {})', run.ruler.pb || 0, cfg['pilgrimage.maxHealth'])),
        h('button', { class: 'g-btn small', disabled: !can('deed') || run.dead, onclick: go('deed') }, '+1 деяние')));
  }

  // Семья
  function personCard(state, p, extra) {
    return h('div', { class: 'd-person' },
      h('div', { class: 'd-person-h' }, h('div', { class: 'grow', 'data-raw': '' }, h('div', { class: 'd-row-t' }, p.name), extra.sub ? h('div', { class: 'd-row-s' }, extra.sub) : null), extra.mark || null),
      statsLine(null, p), traitChips(p.tr), extra.buttons ? h('div', { class: 'g-btns' }, extra.buttons) : null);
  }

  function familyPage(state) {
    const cfg = g.config;
    const run = state.run;
    const age = Math.floor(run.ruler.age + 1e-6);
    const key = [run.spouse ? run.spouse.id : '', (run.cands || []).map((c) => c.id).join(','), run.children.map((c) => c.id + (c.raised ? 'r' : '') + Math.floor(sim.childAge(state, c))).join(','),
      run.heir, age, run.dead ? 1 : 0, sim.hasLaw(state, 'matchmaker') ? (state.meta.prefs || {}).match : ''].join('|');
    keyed(view.pages.family, key, () => {
      const out = [];
      if (run.spouse) {
        out.push(section(run.spouse.g === 'f' ? 'Супруга' : 'Супруг', personCard(state, run.spouse, { sub: ui.t('из дома {}', run.spouse.house) })));
      } else if (sim.canMarry(state, cfg)) {
        if (!run.cands || !run.cands.length) {
          out.push(section('Брак', note('Сваты ищут невесту — кандидаты появятся сейчас'), h('button', { class: 'g-btn small', onclick: () => g.act((s) => sim.makeCandidates(s, g.config)) }, 'Позвать сватов')));
        } else {
          out.push(section('Брак: три кандидата', note(ui.t('Брак — до {} лет. Дети унаследуют черты обоих.', cfg['marry.to'])),
            ...run.cands.map((c, i) => personCard(state, c, {
              sub: ui.t('из дома {}, {} · приданое: {}', c.house, years(c.age), c.dowry.lands ? lands(c.dowry.lands) : ui.t('золото за {} мин дохода', c.dowry.min)),
              buttons: [h('button', { class: 'g-btn small primary', onclick: () => marry(i) }, 'Выбрать')]
            }))));
        }
      } else if (age < cfg['marry.from']) {
        out.push(section('Брак', note(ui.t('Брак — с {} лет', cfg['marry.from']))));
      } else {
        out.push(section('Брак', note('Время браков прошло: детей уже не будет, наследника выберите из тех, кто есть')));
      }
      if (sim.hasLaw(state, 'matchmaker')) {
        const by = (state.meta.prefs || {}).match || 'stats';
        out.push(section('Сват выбирает по', h('div', { class: 'd-modes' }, [['stats', 'характеристикам'], ['traits', 'чертам'], ['lands', 'приданому']].map(([id, t]) =>
          h('button', { class: 'd-mode' + (by === id ? ' on' : ''), onclick: () => g.act((s) => { s.meta.prefs = s.meta.prefs || {}; s.meta.prefs.match = id; }) }, t)))));
      }
      const heir = sim.heirOf(state);
      const kids = run.children.slice().sort((a, b) => a.born - b.born).map((c) => {
        const isHeir = heir && heir.id === c.id;
        const buttons = [];
        if (!isHeir) buttons.push(h('button', { class: 'g-btn small', onclick: () => g.act((s) => sim.setHeir(s, c.id)) }, 'Сделать наследником'));
        if (!c.raised) buttons.push(h('button', { class: 'g-btn small', onclick: () => raiseSheet(c.id) }, 'Воспитать'));
        const a = Math.floor(sim.childAge(state, c));
        const left = Math.floor(sim.reignLeft(state, cfg, c));
        return personCard(state, c, {
          sub: (c.g === 'f' ? 'дочь' : 'сын') + ', ' + years(a) + (c.bastard ? (c.g === 'f' ? ', признана при дворе' : ', признан при дворе') : '') + ui.t(' · править ~{}', years(left)) +
            (a + 1 > cfg['marry.to'] ? ui.t(' · для брака поздно') : ''),
          mark: isHeir ? h('span', { class: 'g-mark' }, 'наследник') : null,
          buttons: buttons.length ? buttons : null
        });
      });
      out.push(section('Дети', kids.length ? h('div', { class: 'd-list' }, kids) : note(run.spouse ? 'Детей пока нет — они рождаются раз в 3–8 лет' : 'Детей нет: без наследника престол примет дальний родич')));
      return out;
    });
  }

  function marry(i) {
    const got = g.act((s) => sim.marry(s, g.config, i, { now: Date.now() }), { now: true });
    if (!got) return;
    g.sfx('level');
    g.flash('crown', 'Свадьба', ui.t('Приданое: {}', got));
  }

  function raiseSheet(childId) {
    const st = g.state;
    const child = st.run.children.find((c) => c.id === childId);
    if (!child) return;
    let stat = 'adm';
    let tr = null;
    const statsBox = h('div', { class: 'g-pick' });
    const traitBox = h('div', { class: 'g-pick' });
    function draw() {
      statsBox.replaceChildren(...C.world.stats.map((s) => h('button', { class: stat === s.id ? 'on' : '', onclick: () => { stat = s.id; draw(); } },
        Art.el(s.id, 24), h('span', { class: 'grow' }, s.title), h('b', { class: 'g-num' }, child.st[s.id] + ' → ' + Math.min(g.config['stat.max'], child.st[s.id] + g.config['heir.focus'])))));
      traitBox.replaceChildren(...[null].concat(sim.teachable(st, child)).map((id) => h('button', { class: tr === id ? 'on' : '', onclick: () => { tr = id; draw(); } },
        id ? traitIcon(id) : null, h('span', { class: 'grow' }, id ? T[id].title + ' — ' + T[id].text : 'Не прививать черту'))));
    }
    draw();
    const close = g.sheet([h('h3', { 'data-raw': '' }, child.name), note(ui.t('Воспитание — один раз: +{} к одной характеристике и шанс {} привить черту.', g.config['heir.focus'], pct(g.config['heir.traitChance']))),
      h('h4', {}, 'Характеристика'), statsBox, h('h4', {}, 'Черта'), traitBox,
      h('button', { class: 'g-btn primary', onclick: () => {
        close();
        const r = g.act((s) => sim.raise(s, g.config, childId, stat, tr), { now: true });
        if (r) g.flash('leaf', 'Воспитание', r.trait ? ui.t('Черта «{}» привита', T[tr].title) : tr ? 'Черта не привилась, характеристика выросла' : 'Характеристика выросла');
      } }, 'Воспитать'),
      h('button', { class: 'g-btn small', onclick: () => close() }, 'Отмена')]);
  }

  // Род
  function housePage(state) {
    const cfg = g.config;
    const gs = sim.genState(state);
    const e = sim.epochIndex(state);
    const key = [Big.str(state.layers.generation.currency), gs.spent, JSON.stringify(gs.laws), gs.gens, e, state.meta.chronicle.length, state.run.lawSwap ? 1 : 0,
      Object.keys(state.run.deeds || {}).join(','), Big.str(state.layers.epoch.currency), g.layout].join('|');
    keyed(view.pages.house, key, (up) => {
      const out = [];
      const ep = C.world.epochs[e % 6];
      const gloryNow = h('span', { class: 'v' });
      up.push(() => { gloryNow.textContent = '+' + sim.gloryOf(g.state, cfg); });
      out.push(section(null, h('div', { class: 'g-lines' },
        line('Основатель рода', h('span', { 'data-raw': '' }, state.meta.house)),
        line('Эпоха', ep.title + (sim.round(state) ? ui.t(', круг {}', sim.round(state) + 1) : '')),
        line('Слава для законов', String(sim.glory(state))),
        line('Величие', ui.t('{} — золото +{}', g.fmt(state.layers.generation.currency), pct(cfg['bonus.greatness'] * sim.greatness(state)))),
        sim.legends(state) ? line('Легенды', ui.t('{} — золото {}', g.fmt(state.layers.epoch.currency), g.fmt.mult(Math.pow(cfg['epoch.legendMult'], sim.legends(state))))) : null,
        line('Доля наследства', pct(sim.share(state, cfg))),
        h('div', { class: 'g-line' }, h('span', { class: 'k' }, 'Слава этого правления'), gloryNow))));
      const deeds = sim.deedList(state, cfg);
      out.push(section(ui.t('Деяния: {} из {}', deeds.length, sim.deedCap(state, cfg)), deeds.length ? h('div', { class: 'd-chips' }, deeds.map((d) => h('span', { class: 'd-chip' }, Art.el('deed', 16), C.world.deeds[d] || 'Доброе дело')))
        : note('Деяния дают Славу: первая Столица, десять Земель, мирное правление, решения двора, паломничество')));
      out.push(lawsSection(state));
      out.push(epochSection(state));
      if (g.layout !== 'wide') out.push(section('Родословное древо', view.treeBox));
      out.push(chronicleSection(state));
      return out;
    });
  }

  function lawsSection(state) {
    const cfg = g.config;
    const rows = C.world.laws.map((law) => {
      const s = sim.lawState(state, cfg, law.id);
      let right;
      if (s.have) {
        right = sim.canRepeal(state, cfg, law.id) ? h('button', { class: 'd-buy', onclick: () => g.act((st) => sim.repealLaw(st, g.config, law.id), { now: true }) }, 'Отменить') : h('span', { class: 'g-mark' }, 'принят');
      } else {
        right = h('button', { class: 'd-buy', disabled: !s.can, onclick: () => {
          if (g.act((st) => sim.buyLaw(st, g.config, law.id), { now: true })) {
            g.sfx('level');
            if (law.id === 'indivisible') g.achieve('indivisible');
          }
        } }, ui.t('{} Славы', s.cost));
      }
      const needs = s.needs ? C.world.laws.find((l) => l.id === s.needs) : null;
      return h('div', { class: 'd-row' + (s.have ? ' have' : '') }, Art.el(law.id, 40), h('div', { class: 'grow' }, h('div', { class: 'd-row-t' }, law.title),
        h('div', { class: 'd-row-s' }, law.text + (needs ? ui.t(' · после «{}»', needs.title) : ''))), right);
    });
    return section('Родовые законы', sim.opened(state, 4) ? note('Парламент: раз в поколение один закон можно отменить и вернуть его Славу') : null, h('div', { class: 'd-list' }, rows));
  }

  function epochSection(state) {
    const cfg = g.config;
    const gs = sim.genState(state);
    const e = sim.epochIndex(state);
    const next = C.world.epochs[(e + 1) % 6];
    const list = C.world.epochs.map((ep, i) => h('div', { class: 'd-row' + (i === e % 6 ? ' have' : '') }, h('span', { class: 'd-pic d-epoch' }, hat(ep.crown)), h('div', { class: 'grow' }, h('div', { class: 'd-row-t' }, ep.title), h('div', { class: 'd-row-s' }, ep.mechanic))));
    const ready = gs.gens >= cfg['epoch.minGens'];
    return section('Эпохи',
      note(ready ? ui.t('Род готов основать ветвь: «{}». Сбросятся Слава, Величие, законы и Земли; Легенды останутся.', next.title)
        : ui.t('Смена эпохи — после {} поколений: сейчас {}', cfg['epoch.minGens'], gs.gens)),
      ready ? view.epochButton : null,
      h('details', { class: 'd-more' }, h('summary', {}, 'Все эпохи'), h('div', { class: 'd-list' }, list)));
  }

  function chronicleSection(state) {
    const list = (state.meta.chronicle || []).slice().reverse();
    if (!list.length) return section('Летопись', note('Летопись начнётся со смертью первого правителя'));
    return section('Летопись', h('div', { class: 'd-chron', 'data-raw': '' }, list.slice(0, 40).map((c) => h('article', {},
      h('div', { class: 'd-row-t' }, c.branch ? c.name : c.name + (c.nick ? ' ' + c.nick : '') + (c.years ? ', ' + years(c.years) + ' ' + g.fmt.plural(c.years, 'правления', 'правления', 'правления') : '')),
      c.glory !== undefined ? h('div', { class: 'd-row-s' }, ui.t('Слава +{}', c.glory)) : null,
      h('p', {}, (c.lines || []).join(' '))))));
  }

  // ---- the family tree -------------------------------------------------------------------------------------------

  /** The nodes of the tree with the living family (the spouse and the children are written in at death). */
  function treeNodes(state) {
    const run = state.run;
    const e = sim.epochIndex(state);
    const nodes = (state.meta.tree || []).map((n) => Object.assign({}, n));
    const me = nodes.find((n) => n.id === run.ruler.id);
    const gen = me ? me.gen : 0;
    if (run.spouse && !nodes.some((n) => n.id === run.spouse.id)) nodes.push({ id: run.spouse.id, name: run.spouse.name, g: run.spouse.g, house: run.spouse.house, spouseOf: run.ruler.id, gen, epoch: e, live: true });
    run.children.forEach((c) => { if (!nodes.some((n) => n.id === c.id)) nodes.push({ id: c.id, name: c.name, g: c.g, parent: run.ruler.id, gen: gen + 1, epoch: e, live: true, heir: c.id === run.heir, bastard: c.bastard }); });
    if (me) me.current = true;
    return nodes;
  }

  function layoutTree(state, nodes) {
    const e = sim.epochIndex(state);
    const old = local.ancestors ? [] : nodes.filter((n) => n.epoch < e);
    const shown = nodes.filter((n) => old.indexOf(n) < 0);
    const byId = {};
    shown.forEach((n) => { byId[n.id] = n; });
    const rows = {};
    shown.forEach((n) => { (rows[n.gen] = rows[n.gen] || []).push(n); });
    const gens = Object.keys(rows).map(Number).sort((a, b) => a - b);
    const W = 64;
    const H = 84;
    const top = old.length ? 1 : 0;
    const centers = {};
    gens.forEach((gen, gi) => {
      // In a row: the children of one ruler; the spouse of the ruler right after him.
      const row = rows[gen];
      const spouses = row.filter((n) => n.spouseOf);
      const blood = row.filter((n) => !n.spouseOf).sort((a, b) => (a.ruler ? 0 : 1) - (b.ruler ? 0 : 1));
      const order = [];
      const left = blood.filter((n, i) => i % 2 === 1);
      const right = blood.filter((n, i) => i % 2 === 0);
      left.reverse().forEach((n) => order.push(n));
      right.forEach((n) => {
        order.push(n);
        spouses.filter((s) => s.spouseOf === n.id).forEach((s) => order.push(s));
      });
      spouses.filter((s) => order.indexOf(s) < 0).forEach((s) => order.push(s));
      const parent = blood.length && byId[blood[0].parent];
      let mid = 0;
      if (parent && centers[parent.id] !== undefined) {
        const sp = shown.find((s) => s.spouseOf === parent.id);
        mid = sp && centers[sp.id] !== undefined ? (centers[parent.id] + centers[sp.id]) / 2 : centers[parent.id];
      }
      const lead = order.findIndex((n) => n.ruler || n.current) >= 0 ? order.findIndex((n) => n.ruler || n.current) : 0;
      const pair = order[lead + 1] && order[lead + 1].spouseOf ? 0.5 : 0;
      order.forEach((n, i) => {
        n.x = mid + (i - (order.length - 1) / 2) * W;
        n.y = (gi + top) * H;
        centers[n.id] = n.x;
      });
      if (!parent) {
        const shift = -((order[lead] ? order[lead].x : 0) + pair * W);
        order.forEach((n) => { n.x += shift; centers[n.id] = n.x; });
      }
    });
    return { shown, old, byId, W, H };
  }

  function buildTree(state) {
    const nodes = treeNodes(state);
    const L = layoutTree(state, nodes);
    const g0 = svg('g', { class: 'd-tree-g' });
    const lines = svg('g', { class: 'd-tree-lines' });
    const marks = svg('g', {});
    g0.append(lines, marks);
    const e = sim.epochIndex(state);
    if (L.old.length) {
      const box = svg('g', { class: 'd-anc', tabindex: 0 });
      box.append(svg('rect', { x: -70, y: -34, width: 140, height: 34, rx: 8 }), svg('text', { x: 0, y: -12, 'text-anchor': 'middle' }, ui.t('Предки · {}', L.old.length)));
      box.addEventListener('click', () => { local.ancestors = true; view.treeSvg.__key = ''; g.redraw(); });
      marks.append(box);
    }
    L.shown.forEach((n) => {
      const parent = n.parent && L.byId[n.parent];
      if (parent) {
        const sp = L.shown.find((s) => s.spouseOf === parent.id);
        const px = sp ? (parent.x + sp.x) / 2 : parent.x;
        const py = parent.y + 42;
        lines.append(svg('path', { d: 'M' + px + ' ' + py + 'V' + (n.y - 12) + 'H' + n.x + 'V' + (n.y - 2) }));
      }
      if (n.spouseOf && L.byId[n.spouseOf]) {
        const m = L.byId[n.spouseOf];
        lines.append(svg('path', { d: 'M' + (m.x + 14) + ' ' + (m.y + 16) + 'H' + (n.x - 14), class: 'wed' }));
      }
      const node = svg('g', { class: 'd-node' + (n.ruler ? ' ruler' : '') + (n.current ? ' now' : '') + (n.live ? ' live' : ''), transform: 'translate(' + n.x + ' ' + n.y + ')' });
      if (n.ruler) node.append(svg('rect', { x: -26, y: -6, width: 52, height: 76, rx: 6, class: 'frame' }));
      const c = n.spouseOf ? sim.coatOf('house:' + n.house) : state.meta.coat;
      node.append(coat(c, n.spouseOf ? [] : addsFor(state, n.epoch || 0), 24, -12, 0));
      node.append(svg('text', { x: 0, y: 44, 'text-anchor': 'middle', class: 'nm' }, n.name));
      const sub = n.ruler ? (n.from !== undefined ? Math.floor(n.from) + '–' + (n.to !== undefined ? n.to : '') : '') : n.heir ? 'наследник' : n.kin ? 'родич' : n.bastard ? 'бастард' : '';
      if (sub) node.append(svg('text', { x: 0, y: 58, 'text-anchor': 'middle', class: 'sub' }, sub));
      if (n.epoch < e) node.classList.add('old');
      marks.append(node);
    });
    const xs = L.shown.map((n) => n.x);
    const ys = L.shown.map((n) => n.y);
    const box = { x0: Math.min(...xs, 0) - 40, x1: Math.max(...xs, 0) + 40, y0: (L.old.length ? -40 : 0) - 10, y1: Math.max(...ys, 0) + 80 };
    return { g: g0, box, count: L.shown.length + L.old.length };
  }

  function renderTree(state) {
    const tree = state.meta.tree || [];
    const key = [tree.length, tree.map((n) => n.to === undefined ? '' : n.to).join(','), state.run.spouse ? state.run.spouse.id : '', state.run.children.map((c) => c.id).join(','),
      state.run.heir, sim.epochIndex(state), local.ancestors ? 1 : 0].join('|');
    if (view.treeSvg.__key === key) return;
    view.treeSvg.__key = key;
    const t = buildTree(state);
    view.treeBoxSize = t.box;
    view.treeSvg.replaceChildren(view.treeG = svg('g', {}, t.g));
    view.treeCount.textContent = ui.t('{} имён на древе', t.count);
    if (local.pan.fit !== g.layout) fitTree();
    applyPan();
  }

  function fitTree() {
    const b = view.treeBoxSize;
    const r = view.treeBox.getBoundingClientRect();
    if (!b || !r.width || !r.height) return;
    const s = Math.max(0.35, Math.min(1.4, r.width / (b.x1 - b.x0), r.height / (b.y1 - b.y0)));
    // Show the current generation: the newest rows at the bottom of the box.
    local.pan.s = s;
    local.pan.x = r.width / 2 - ((b.x0 + b.x1) / 2) * s;
    const room = r.height - 52;
    const tall = (b.y1 - b.y0) * s;
    local.pan.y = tall <= room ? (room - tall) / 2 - b.y0 * s + 8 : room - b.y1 * s;
    local.pan.fit = g.layout;
  }

  function applyPan() {
    if (view.treeG) view.treeG.setAttribute('transform', 'translate(' + local.pan.x + ' ' + local.pan.y + ') scale(' + local.pan.s + ')');
  }

  /** Drag to move, pinch (two fingers) or the wheel to scale. */
  function gestures(el) {
    const pts = new Map();
    let last = null;
    function zoomAt(cx, cy, k) {
      const p = local.pan;
      const s = Math.max(0.25, Math.min(3, p.s * k));
      p.x = cx - (cx - p.x) * (s / p.s);
      p.y = cy - (cy - p.y) * (s / p.s);
      p.s = s;
      applyPan();
    }
    function state() {
      const list = [...pts.values()];
      if (list.length === 1) return { x: list[0].x, y: list[0].y, d: 0 };
      const [a, b] = list;
      return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y) };
    }
    el.addEventListener('pointerdown', (ev) => {
      const r = el.getBoundingClientRect();
      pts.set(ev.pointerId, { x: ev.clientX - r.left, y: ev.clientY - r.top });
      if (pts.size <= 2) last = state();
    });
    el.addEventListener('pointermove', (ev) => {
      if (!pts.has(ev.pointerId)) return;
      const r = el.getBoundingClientRect();
      pts.set(ev.pointerId, { x: ev.clientX - r.left, y: ev.clientY - r.top });
      if (pts.size > 2 || !last) return;
      const now = state();
      if (Math.hypot(now.x - last.x, now.y - last.y) > 2 && !el.hasPointerCapture(ev.pointerId)) el.setPointerCapture(ev.pointerId);
      local.pan.x += now.x - last.x;
      local.pan.y += now.y - last.y;
      if (now.d && last.d) zoomAt(now.x, now.y, now.d / last.d);
      else applyPan();
      last = now;
    });
    const up = (ev) => {
      pts.delete(ev.pointerId);
      last = pts.size ? state() : null;
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', (ev) => {
      ev.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(ev.clientX - r.left, ev.clientY - r.top, ev.deltaY < 0 ? 1.12 : 1 / 1.12);
    }, { passive: false });
  }

  function buildTreeBox() {
    view.treeSvg = svg('svg', { class: 'd-tree-svg', role: 'img', 'aria-label': 'Родословное древо' });
    view.treeCount = h('span', {});
    view.treeBox = h('div', { class: 'd-tree g-gestures', 'data-raw': '' }, view.treeSvg,
      h('div', { class: 'd-tree-bar' }, view.treeCount,
        h('button', { class: 'd-mode', onclick: () => { local.pan.fit = ''; fitTree(); applyPan(); } }, 'Весь род'),
        h('button', { class: 'd-mode', onclick: () => { local.ancestors = !local.ancestors; view.treeSvg.__key = ''; local.pan.fit = ''; g.redraw(); } }, 'Предки')));
    gestures(view.treeSvg);
  }

  // ---- the bottom: the card of the court, the main buttons ----------------------------------------------------

  function buildBottom() {
    view.card = h('div', { class: 'd-card', role: 'region', 'aria-label': 'Карточка двора' });
    view.bestSub = h('span', { class: 'g-sub' });
    view.best = h('button', { class: 'g-btn primary', id: 'best', onclick: buyBest }, h('span', {}, 'Купить лучшее', view.bestSub));
    view.abdicateSub = h('span', { class: 'g-sub' });
    view.abdicate = h('button', { class: 'g-btn', id: 'abdicate', onclick: succession }, h('span', {}, 'Отречься', view.abdicateSub));
    view.heirSub = h('span', { class: 'g-sub' });
    view.pass = h('button', { class: 'g-btn primary', id: 'pass', onclick: succession }, h('span', {}, 'Передать престол', view.heirSub));
    view.peek = h('div', { class: 'g-note d-peek' });
    view.main = h('div', { class: 'g-btns' }, view.best, view.abdicate);
    view.bottom = h('div', { class: 'd-bottom' }, view.card, view.peek, view.pass, view.main);
    view.epochButton = g.ui.prestigeButton('epoch', { label: 'Сменить эпоху' });
  }

  function buyBest() {
    const ok = g.act((s) => sim.buy(s, g.config));
    if (!ok) {
      g.sfx('deny');
      g.buzz('deny');
      return;
    }
    g.sfx('buy');
    g.buzz('buy');
  }

  function answer(choice) {
    const card = g.state.run.card;
    if (!card) return;
    const r = g.act((s) => sim.answer(s, g.config, choice, Date.now()), { now: true });
    if (!r || !r.ok) {
      ui.toast(r ? r.text : 'Не получилось');
      g.buzz('deny');
      return;
    }
    g.sfx(card.id === 'illness' && choice === 'b' ? 'deny' : 'level');
    if (r.text) g.flash('crown', card.title, r.text);
  }

  function renderBottom(state) {
    const cfg = g.config;
    const run = state.run;
    const c = run.card;
    keyed(view.card, c ? c.id + ':' + c.title + ':' + (run.cards || 0) : '', (up) => {
      if (!c) return [];
      const opt = (ch) => {
        const o = c[ch];
        const sub = h('span', { class: 'g-sub' });
        const b = h('button', { class: 'g-btn' + (ch === 'a' ? ' primary' : ''), onclick: () => answer(ch) }, h('span', {}, o.label, sub));
        up.push(() => {
          sub.textContent = sim.effectText(g.state, g.config, o.effect);
          b.disabled = !sim.canAfford(g.state, g.config, o.effect);
        });
        return b;
      };
      const model = c.src === 'model';
      return [h('div', { class: 'd-card-t' }, h('b', model ? { 'data-raw': '' } : {}, c.title), h('span', { class: 'g-note' }, c.id === 'illness' ? 'болезнь' : c.id === 'joust' ? 'турнир' : 'двор')),
        h('p', model ? { 'data-raw': '' } : {}, c.text), h('div', { class: 'g-btns d-answers' }, opt('a'), opt('b'))];
    });
    live(view.card);
    view.card.hidden = !c;
    const dead = run.dead;
    view.pass.hidden = !dead;
    view.main.hidden = !!c || dead;
    const heir = sim.heirOf(state);
    view.heirSub.textContent = heir ? ui.t('наследник — {}', heir.name) : 'наследника нет — престол примет дальний родич';
    if (!c && !dead) {
      const b = sim.best(state, cfg);
      view.best.disabled = !b || Big.gt(b.price, run.gold);
      view.bestSub.textContent = b ? (b.kind === 'court' ? courtTitle(run.court) : C.world.holdings[b.i].title) + ' · ' + gold(b.price) : '';
      const info = g.prestigeInfo('generation');
      const old = run.ruler.age >= cfg['age.abdicate'];
      view.abdicate.hidden = !old;
      view.abdicate.disabled = !info.can;
      view.abdicateSub.textContent = info.can ? ui.t('+{} Славы', g.fmt(info.gain)) + (info.hint ? ui.t(' · выгодно') : '') : '';
    }
    const peek = !c && !dead && run.peek && run.ruler.tr.some((id) => T[id] && T[id].preview);
    view.peek.hidden = !peek;
    if (peek) view.peek.textContent = ui.t('Звездочёт видит: скоро при дворе «{}»', run.peek.title);
  }

  /** The sheet of the succession: who takes the throne and with what; abdication is held. */
  function succession() {
    const st = g.state;
    const cfg = g.config;
    const run = st.run;
    const info = g.prestigeInfo('generation');
    if (!info.can) return;
    const heir = sim.heirOf(st);
    const share = sim.share(st, cfg);
    const age = heir ? Math.max(sim.hasLaw(st, 'regency') ? 1 : cfg['age.start'], Math.floor(sim.childAge(st, heir))) : null;
    const rows = [h('h3', {}, run.dead ? 'Престол ждёт наследника' : 'Отречение от престола'),
      h('div', { class: 'g-lines' },
        line('Наследник', heir ? h('span', { 'data-raw': '' }, heir.name + ', ' + years(age)) : 'дальний родич'),
        heir && heir.tr.length ? line('Черты', heir.tr.map((id) => T[id] ? T[id].title : id).join(', ')) : null,
        line('Слава рода', '+' + g.fmt(info.gain)),
        line('Доля наследства', pct(share) + ' золота и владений'),
        line('Земли', run.lands ? 'все ' + run.lands : 'нет')),
      note(run.dead ? 'Сменить наследника можно на вкладке «Семья»' : 'Отречение раньше смерти — короче поколение и меньше Славы')];
    const go = h('button', { class: 'g-btn primary', id: 'd-succession' }, run.dead ? 'Передать престол' : 'Удерживайте, чтобы отречься');
    const close = g.sheet([...rows, go, h('button', { class: 'g-btn small', onclick: () => close() }, 'Позже')]);
    const doIt = async () => {
      close();
      const name = rulerName(g.state);
      const r = await g.prestige('generation', { confirm: false });
      if (r && r.ok) g.flash('crown', ui.t('На престоле — {}', rulerName(g.state)), ui.t('{} — в летописи рода', name));
    };
    if (run.dead) go.addEventListener('click', doIt);
    else g.ui.hold(go, null, doIt);
  }

  // ---- placing the parts by the layout -----------------------------------------------------------------------

  function place() {
    if (g.layout === 'wide') {
      g.el.field.replaceChildren(...[view.worldRoot, view.treeBox].filter(Boolean));
      g.el.actions.replaceChildren(view.panel, view.bottom);
    } else {
      g.el.field.replaceChildren(...[view.worldRoot, view.panel].filter(Boolean));
      g.el.actions.replaceChildren(view.bottom);
    }
    view.pages.house.__key = '';
    view.treeSvg.__key = '';
    local.pan.fit = '';
  }

  // ---- the stock of the model: phrases of the chronicle, names, cards -----------------------------------------

  async function pull() {
    if (local.pulling || g.readonly) return;
    local.pulling = true;
    try {
      const want = { chronicle: ['phrases', 30], names: ['names', 30], cards: ['cards', 4] };
      for (const kind of Object.keys(want)) {
        const [field, max] = want[kind];
        let n = 0;
        while (n < 5 && g.stock.count(kind) > 0 && (g.state.meta.pool[field] || []).length < max) {
          const item = await g.stock.take(kind);
          if (!item || item.procedural) break;
          g.act((s) => { s.meta.pool[field] = (s.meta.pool[field] || []).concat([item]); });
          n++;
        }
      }
    } catch (error) {
      g.log && g.log('запас: ' + error.message);
    } finally {
      local.pulling = false;
    }
  }

  // ---- achievements ---------------------------------------------------------------------------------------------

  function achievements(state) {
    const cfg = g.config;
    const m = state.meta;
    if (state.layers.generation.count >= 1) g.achieve('first-heir');
    if (state.layers.generation.count >= cfg['achievement.gens']) g.achieve('ten-gens');
    if ((m.maxAge || 0) >= cfg['achievement.longlife']) g.achieve('long-liver');
    if (sim.hasLaw(state, 'indivisible')) g.achieve('indivisible');
    if ((m.maxLands || 0) >= cfg['achievement.lands']) g.achieve('hundred-lands');
    if (state.layers.epoch.count >= 1) g.achieve('new-epoch');
    if (m.rare && m.rare.lefthanded) g.achieve('left-hand');
    if ((m.tree || []).length >= cfg['achievement.tree']) g.achieve('tree-50');
  }

  // ---- the engine's hooks -----------------------------------------------------------------------------------------

  function build(game) {
    g = game;
    buildTop();
    buildPanel();
    buildTreeBox();
    buildBottom();
    if (Game.scene && window.DynastyScene) {
      view.worldRoot = h('div', { class: 'd-world' });
      view.world = Game.scene({ parent: view.worldRoot, label: 'Живое королевство', width: 1000, height: 620, game: g, draw: DynastyScene.draw });
      view.worldNote = h('div', { class: 'd-world-note' });
      view.worldRoot.append(view.worldNote);
      g.on('offline', () => { view.worldPrevious = null; });
    }
    place();
    g.on('resize', () => place());
    g.on('prestige', (e) => {
      local.ancestors = false;
      local.pan.fit = '';
      if (e.layer === 'epoch') g.flash('crown', 'Новая эпоха', C.world.epochs[sim.epochIndex(g.state) % 6].title);
      pull();
    });
    g.on('chest', () => g.sfx('chest'));
    setTimeout(pull, 1500);
    setInterval(pull, 60000);
  }

  function render(state) {
    if (view.world) {
      const world = DynastyScene.model(state, g.config, { world: C.world, mode: local.tab === 'court' || local.tab === 'family' ? 'court' : 'realm' });
      DynastyScene.changes(view.worldPrevious, world).forEach(kind => view.world.pulse(kind, null, 2.2));
      view.worldPrevious = world;
      view.world.update(world);
      view.worldNote.textContent = world.label;
    }
    TABS.forEach(([id]) => { view.pages[id].hidden = id !== local.tab; });
    view.tabs.querySelectorAll('.d-tab').forEach((b) => {
      b.classList.toggle('on', b.dataset.id === local.tab);
      b.setAttribute('aria-selected', b.dataset.id === local.tab ? 'true' : 'false');
    });
    renderTop(state);
    if (local.tab === 'holdings') holdingsPage(state);
    else if (local.tab === 'court') courtPage(state);
    else if (local.tab === 'family') familyPage(state);
    else housePage(state);
    live(view.pages[local.tab]);
    if (g.layout === 'wide' || local.tab === 'house') renderTree(state);
    renderBottom(state);
    achievements(state);
  }

  await Game.start({ sim, render, init: build });
})();
