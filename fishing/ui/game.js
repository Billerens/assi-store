// The screen of «Рыбалка». The engine (Game.start) gives the frame — g.el.top (coins, rate),
// g.el.field (the water, drawn on a canvas), g.el.actions (under the thumb: the one big button,
// the keepnet on the left, the aquarium and the shop on the right) — and keeps the state, saves,
// offline, prestige, sound. The logic is ../sim.js: the screen only presses and releases.
(async function () {
  'use strict';
  const h = ui.h;
  const NAMES = ['species', 'waters', 'world', 'trophies', 'notes'];
  const C = {};
  await Promise.all(NAMES.map((n) => fetch('../content/' + n + '.json').then((r) => r.json()).then((d) => { C[n] = d; })));
  try {
    C.config = await fetch('../config.json').then((r) => r.json());
  } catch (error) {
    C.config = {};
  }
  window.FishingContent = C;
  const sim = window.GameSim;
  const K = sim.content();
  const WORLD = C.world;
  const UPS = {};
  WORLD.upgrades.forEach((u) => { UPS[u.id] = u; });
  const title = (list, id) => ((list || []).find((x) => x.id === id) || {}).title || id;

  Sfx.add('splash', [{ type: 'noise', f: [1, 1], d: 0.22, v: 0.28 }, { at: 0.02, type: 'sine', f: [320, 110], d: 0.2, v: 0.25 }]);
  Sfx.add('bite', [{ type: 'sine', f: [520, 880], d: 0.09, v: 0.45 }, { at: 0.1, type: 'sine', f: [880, 1040], d: 0.12, v: 0.4 }]);
  Sfx.add('jerk', [{ type: 'triangle', f: [180, 90], d: 0.07, v: 0.35 }]);
  Sfx.add('snap', [{ type: 'square', f: [1400, 200], d: 0.12, v: 0.22 }, { at: 0.08, type: 'noise', f: [1, 1], d: 0.12, v: 0.2 }]);
  Sfx.add('catch', [{ type: 'triangle', f: [523, 784], d: 0.12, v: 0.45 }, { at: 0.12, type: 'triangle', f: [784, 1046], d: 0.2, v: 0.4 }]);

  const MSG = {
    early: 'Рано — пустой крючок, наживка потеряна',
    missed: 'Поздно — рыба сошла',
    snap: 'Обрыв лески — рыба ушла, снасть цела',
    slack: 'Леска провисла — рыба сошла',
    run: 'Рыба смотала всю леску',
    slip: 'Сошла у самого берега — нужен подсак',
    gone: 'Рыба сошла, пока игра была закрыта'
  };
  const BUZZ_BITE = [40, 30, 40];
  const BUZZ_JERK = [18];

  const view = {};
  const seen = { phase: null, jerks: 0, news: 0, caughtAt: 0, pending: null };
  const recent = [];
  let g = null;
  let closeSheet = null;
  let refreshSheet = null;
  let tAnim = 0;

  // ---- small helpers ----------------------------------------------------------------------------

  const now = () => Date.now();
  const cfg = () => g.config;

  function kg(w) {
    if (w < 1) return Math.round(w * 1000) + ' г';
    return String(Math.round(w * 100) / 100).replace('.', ',') + ' кг';
  }

  function mmss(ms) {
    const s = Math.max(0, Math.ceil(ms / 1000));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  function hhmm(t) {
    const d = new Date(t);
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  function icon(name) { return GameIcons.el(name); }

  function stars(n) {
    const box = h('span', { class: 'f-stars', 'aria-label': n + ' из 3' });
    for (let i = 0; i < 3; i++) {
      const s = icon('star');
      if (i >= n) s.classList.add('off');
      box.append(s);
    }
    return box;
  }

  function coinsText(x) { return g.fmt(x) + ' ' + g.fmt.plural(Math.floor(Big.toNumber(Big.of(x, 0))), 'монета', 'монеты', 'монет'); }

  // ---- fish silhouettes from the species' parameters (SVG; the same paths on the canvas) ----------

  const pathCache = {};

  /** The silhouette in a 100×50 box facing left: body, tail by its form, fin, stripes, eye. */
  function fishPaths(shape) {
    const key = JSON.stringify(shape || {});
    if (pathCache[key]) return pathCache[key];
    const s = shape || {};
    const hh = 4 + Math.max(0.08, Math.min(0.7, s.back || 0.3)) * 34;
    const y = 25;
    const f = (n) => Math.round(n * 10) / 10;
    const body = 'M6 ' + y + ' C14 ' + f(y - hh * 0.95) + ' 44 ' + f(y - hh * 1.05) + ' 74 ' + f(y - hh * 0.3) +
      ' L74 ' + f(y + hh * 0.3) + ' C44 ' + f(y + hh * 0.95) + ' 14 ' + f(y + hh * 0.8) + ' 6 ' + y + ' Z';
    let tail;
    if (s.tail === 'round') tail = 'M72 ' + f(y - hh * 0.3) + ' C88 ' + f(y - hh * 1.1) + ' 97 ' + f(y - hh * 0.6) + ' 96 ' + y + ' C97 ' + f(y + hh * 0.6) + ' 88 ' + f(y + hh * 1.1) + ' 72 ' + f(y + hh * 0.3) + ' Z';
    else if (s.tail === 'straight') tail = 'M72 ' + f(y - hh * 0.25) + ' L94 ' + f(y - hh * 0.8 - 2) + ' L94 ' + f(y + hh * 0.8 + 2) + ' L72 ' + f(y + hh * 0.25) + ' Z';
    else if (s.tail === 'long') tail = 'M72 ' + f(y - hh * 0.3) + ' C82 ' + f(y - hh * 0.3) + ' 90 ' + (y - 2) + ' 99 ' + y + ' C90 ' + (y + 2) + ' 82 ' + f(y + hh * 0.3) + ' 72 ' + f(y + hh * 0.3) + ' Z';
    else tail = 'M72 ' + y + ' L95 ' + f(y - hh * 0.95 - 2) + ' L86 ' + y + ' L95 ' + f(y + hh * 0.95 + 2) + ' Z';
    const fin = 'M34 ' + f(y - hh * 0.98) + ' L46 ' + f(y - hh * 1.3 - 3) + ' L56 ' + f(y - hh * 0.95) + ' Z';
    const stripes = [];
    const n = Math.max(0, Math.min(8, s.stripes || 0));
    for (let i = 0; i < n; i++) {
      const x = 28 + (40 * (i + 0.5)) / n;
      stripes.push('M' + f(x) + ' ' + f(y - hh * 0.8) + ' L' + f(x - 2) + ' ' + f(y + hh * 0.6));
    }
    const eye = [15, f(y - hh * 0.25), f(1.6 + hh * 0.06)];
    const out = { body, tail, fin, stripes, eye, hh };
    pathCache[key] = out;
    return out;
  }

  function fishSvg(sp, known, cls) {
    const p = fishPaths(sp && sp.shape);
    const color = known === false ? 'var(--surface-2)' : (sp && sp.shape && sp.shape.color) || '#8a8a8a';
    const stripes = known === false ? '' : p.stripes.map((d) => '<path d="' + d + '" stroke="#000" stroke-opacity=".35" stroke-width="3" stroke-linecap="round" fill="none"/>').join('');
    const eye = known === false ? '' : '<circle cx="' + p.eye[0] + '" cy="' + p.eye[1] + '" r="' + p.eye[2] + '" fill="#101010"/>';
    return h('span', {
      class: 'f-fish ' + (cls || ''),
      html: '<svg viewBox="0 0 100 50" aria-hidden="true"><g fill="' + color + '"><path d="' + p.tail + '"/><path d="' + p.fin + '"/><path d="' + p.body + '"/></g>' + stripes + eye + '</svg>'
    });
  }

  // ---- the frame --------------------------------------------------------------------------------

  function build(game) {
    g = game;
    window.__fishing = { down, up, sheet: openSheet, sim };
    g.el.app.classList.add('f-app');

    view.coins = h('div', { class: 'g-big', id: 'coins' });
    view.rate = h('div', { class: 'g-rate', id: 'rate' });
    view.where = h('div', { class: 'f-where', id: 'where' });
    g.el.top.append(view.coins, view.rate, view.where);

    g.el.field.classList.add('f-field');
    view.canvas = h('canvas', { class: 'f-scene', id: 'scene' });
    view.status = h('div', { class: 'f-status', id: 'status', role: 'status' });
    view.chips = h('div', { class: 'f-events', id: 'events' });
    view.card = h('div', { class: 'f-card', id: 'card', hidden: true });
    g.el.field.append(view.canvas, view.chips, view.status, view.card);

    // The wide screen: the live aquarium and the journal on the right, above the controls.
    view.aqCanvas = h('canvas', { class: 'f-aq-live', id: 'aq-live' });
    view.asideHead = h('div', { class: 'f-aside-head' });
    view.asideJournal = h('div', { class: 'f-aside-journal' });
    view.aside = h('div', { class: 'f-aside', id: 'aside' },
      h('button', { class: 'f-aside-aq', onclick: () => openSheet('aquarium') }, view.asideHead, h('span', { class: 'f-aq-box' }, view.aqCanvas)),
      h('button', { class: 'f-aside-j', onclick: () => openSheet('journal') }, view.asideJournal));

    // The one button: hold to aim, release to cast; tap to hook; hold to reel in.
    view.ring = h('span', {
      class: 'f-ring', html: '<svg viewBox="0 0 140 140" aria-hidden="true"><circle class="f-track" cx="70" cy="70" r="64"/><circle class="f-arc" cx="70" cy="70" r="64" pathLength="100" stroke-dasharray="0 100"/></svg>'
    });
    view.arc = view.ring.querySelector('.f-arc');
    view.bigLabel = h('span', { class: 'f-big-label' });
    view.bigSub = h('span', { class: 'f-big-sub' });
    view.big = h('button', { class: 'f-big', id: 'big', 'aria-label': 'Заброс, подсечка, подмотка' }, view.bigLabel, view.bigSub);
    view.bigWrap = h('div', { class: 'f-big-wrap' }, view.ring, view.big);
    view.big.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      try {
        view.big.setPointerCapture(e.pointerId);
      } catch (ignored) { /* a synthetic event */ }
      down();
    });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((ev) => view.big.addEventListener(ev, up));
    view.big.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && !e.repeat && !closeSheet) {
        e.preventDefault();
        down();
      }
    });
    document.addEventListener('keyup', (e) => {
      if (e.code === 'Space' && !closeSheet) {
        e.preventDefault();
        up();
      }
    });

    view.sackSub = h('span', { class: 'g-sub g-num' });
    const pict = (svg) => h('span', { class: 'f-ico', html: svg });
    view.sack = h('button', { class: 'g-btn f-side', id: 'sack', onclick: () => openSheet('sack') }, pict(FishArt.ui('keepnet')), h('span', {}, 'Садок', view.sackSub));
    view.aqSub = h('span', { class: 'g-sub g-num' });
    view.aq = h('button', { class: 'g-btn f-side', id: 'aquarium', onclick: () => openSheet('aquarium') }, pict(FishArt.ui('aquarium')), h('span', {}, 'Аквариум', view.aqSub));
    view.shop = h('button', { class: 'g-btn f-side', id: 'shop', onclick: () => openSheet('shop') }, pict(FishArt.ui('shop')), h('span', {}, 'Магазин'));
    view.journalSub = h('span', { class: 'g-sub g-num' });
    view.journal = h('button', { class: 'g-btn f-side', id: 'chip-journal', onclick: () => openSheet('journal') }, pict(FishArt.ui('journal')), h('span', {}, 'Журнал', view.journalSub));
    const row = h('div', { class: 'f-controls' },
      h('div', { class: 'f-left' }, view.sack, view.journal),
      view.bigWrap,
      h('div', { class: 'f-right' }, view.aq, view.shop));

    view.waterChip = chip('', 'Водоём', () => openSheet('waters'), 'chip-water');
    view.baitChip = chip('', 'Наживка', () => openSheet('bait'), 'chip-bait');
    view.lanternChip = chip(FishArt.ui('lantern'), 'Фонарь', toggleLantern, 'chip-lantern');
    view.dawnChip = chip(FishArt.ui('dawn'), 'Зорька', dawn, 'chip-dawn');
    const chips = h('div', { class: 'f-chips' }, view.waterChip, view.baitChip, view.lanternChip, view.dawnChip);

    view.prestige = g.ui.prestigeButton(sim.LAYER, { label: 'Новый сезон' });
    view.prestige.id = 'prestige';
    view.prestige.classList.add('f-prestige');
    g.el.actions.classList.add('f-actions');
    g.el.actions.append(view.aside, view.prestige, row, chips);

    g.on('offline', onOffline);
    g.on('inbox', onInbox);
    g.on('chest', () => g.sfx('chest'));
    g.on('resize', () => sizeCanvases());
    g.on('prestige', (r) => {
      seen.news = Math.max(0, ...g.state.run.news.map((n) => n.n));
      recent.length = 0;
      g.flash('trophy', 'Сезон ' + sim.seasonOf(g.state), 'Мастерство +' + g.fmt(r && r.gain ? r.gain : 0) + ': клёв быстрее, рыба дороже');
    });
    if (window.ResizeObserver) new ResizeObserver(sizeCanvases).observe(g.el.field);
    sizeCanvases();
    seen.news = Math.max(0, ...g.state.run.news.map((n) => n.n));
    seen.phase = g.state.run.cast.phase;
    setTimeout(monthLegend, 0);
  }

  /** A chip of the panel: a drawn picture (set again when the water or the bait changes) and a line. */
  function chip(svg, text, onclick, id) {
    const label = h('span', { class: 'f-chip-text' }, text);
    const pic = h('span', { class: 'f-ico', html: svg });
    const b = h('button', { class: 'f-chip', id, onclick }, pic, label);
    b.label = label;
    b.pic = pic;
    return b;
  }

  function sizeCanvases() {
    [view.canvas, view.aqCanvas].forEach((cv) => {
      if (!cv) return;
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      const w = Math.max(1, Math.round(cv.clientWidth * dpr));
      const hgt = Math.max(1, Math.round(cv.clientHeight * dpr));
      if (cv.width !== w || cv.height !== hgt) {
        cv.width = w;
        cv.height = hgt;
      }
    });
  }

  // ---- the button -------------------------------------------------------------------------------

  let isDown = false;

  function down() {
    if (isDown) return;
    isDown = true;
    const st = g.state;
    if (st.run.cast.phase === 'caught') {
      if (now() - seen.caughtAt < 500) return;
      decide('sack');
      return;
    }
    const r = g.act((s) => sim.press(s, g.config, now(), g.rng));
    view.big.classList.add('down');
    if (r === 'early') {
      g.sfx('deny');
      g.buzz('deny');
    } else if (r === 'hooked') {
      g.sfx('tap');
      g.buzz('tap');
    } else if (r === 'missed') {
      g.sfx('deny');
    }
    g.redraw();
  }

  function up() {
    if (!isDown) return;
    isDown = false;
    view.big.classList.remove('down');
    const r = g.act((s) => sim.release(s, g.config, now(), g.rng));
    if (r === 'cast') g.sfx('splash');
    g.redraw();
  }

  function decide(where) {
    const p = g.state.run.pending;
    if (!p) return;
    if (where === 'aq' && !p.snag && !sim.fits(g.state, g.config, p.w)) {
      ui.toast('Не помещается: нужно ' + Math.ceil(sim.fishLitres(p.w, g.config)) + ' л, свободно ' + Math.floor(sim.litres(g.state, g.config) - sim.usedLitres(g.state, g.config)) + ' л');
      g.sfx('deny');
      return;
    }
    g.act((s) => sim.keep(s, g.config, where), { now: true, reason: 'action' });
    g.sfx(where === 'free' ? 'level' : 'tap');
    g.redraw();
  }

  // ---- the links --------------------------------------------------------------------------------

  async function dawn() {
    const r = await g.links.spend('dawn');
    if (!r.ok) {
      ui.toast(r.off ? 'Связка «Шаги» выключена' : 'Нужна ' + r.need + ' энергия — это ~' + g.fmt(r.need * g.config['steps.perSteps']) + ' шагов');
      g.buzz('deny');
      return;
    }
    g.act((s) => sim.dawn(s, g.config, now()), { now: true, reason: 'spend' });
    g.sfx('level');
    g.flash('energy', 'Ранняя зорька', g.config['dawn.minutes'] + ' минут клёв как утром');
  }

  function toggleLantern() {
    const on = !g.state.run.lantern;
    if (!g.act((s) => sim.setLantern(s, g.config, on))) return;
    g.sfx('tap');
    g.redraw();
  }

  function onInbox(r) {
    const won = (r.moves || []).some((m) => m.from === 'bet' && /-win$/.test(String(m.id)));
    if (won) {
      g.act((s) => sim.zhorTonight(s, g.config, now()), { now: true, reason: 'inbox' });
      g.flash('dice', 'Ставка выиграна', 'И ещё жор на вечер', 5000);
    }
  }

  /** The summary of the absence: merged lines of the aquarium and the cat, the weather, what bites. */
  function onOffline(report) {
    const st = g.state;
    const c = g.config;
    const lines = sim.awayLines(st, c);
    const water = st.run.water;
    const from = report.plan ? report.plan.from : now();
    const was = sim.weatherAt(water, from, c);
    const is = sim.weatherAt(water, now(), c);
    if (was !== is && is !== 'any') lines.push('Погода на «' + sim.waterTitle(water) + '»: была ' + title(WORLD.weather, was) + ', теперь ' + title(WORLD.weather, is));
    const biting = sim.bitingNow(st, c, now()).map((sp) => sp.name.toLowerCase());
    if (biting.length) lines.push('Сейчас клюёт: ' + biting.join(', '));
    const legends = sim.legendsNow(st, c, now()).map((sp) => sp.name);
    if (legends.length) lines.push('Сейчас её часы и погода: ' + legends.join(', '));
    report.events.length = 0;
    lines.forEach((l) => report.events.push(l));
    st.run.away = null;
  }

  async function monthLegend() {
    if (!sim.seasonalStale(g.state, now())) return;
    const item = await g.stock.take('legends');
    if (item && g.act((s) => sim.setSeasonal(s, item, now()))) {
      g.log('Легенда месяца: ' + item.name + ' (' + sim.waterTitle(item.water) + ')');
    }
  }

  async function noteFor(id) {
    if (g.state.meta.notes[id]) return;
    const item = await g.stock.take('notes');
    if (item && item.about && item.text && !g.state.meta.notes[item.about]) g.act((s) => { s.meta.notes[item.about] = item.text; });
  }

  async function bottle(n) {
    const item = await g.stock.take('bottles');
    if (!item) return;
    g.act((s) => {
      const hint = s.meta.hints.find((x) => x.sp === n.sp);
      if (hint) {
        hint.title = item.title || 'Записка';
        hint.text = item.text;
      }
    });
  }

  // ---- news, catches, achievements ---------------------------------------------------------------

  function onNews(n) {
    const c = g.config;
    if (n.kind === 'zhor') g.flash('timer', 'Жор', n.text, 3500);
    else if (n.kind === 'shoal') g.flash('fish', 'Косяк', n.text, 3500);
    else if (n.kind === 'fisher') g.flash('user', 'Старый рыбак', 'Меняет ' + c['fisher.need'] + ' одинаковых рыб из садка на золотую наживку', 4500);
    else if (n.kind === 'bottle') {
      g.flash('mail', 'Бутылка с запиской', 'Подсказка о легенде — в журнале', 4500);
      bottle(n);
    } else if (n.kind === 'legend') g.flash('crown', n.text, 'Легенда в журнале', 5000);
    else if (n.kind === 'snag' && n.isNew) noteFor('t:' + n.snag);
    else if (n.kind === 'tourney' || n.kind === 'trade' || n.kind === 'zhor') g.flash('trophy', n.text, null, 3500);
  }

  function onCatch(st) {
    const p = st.run.pending;
    const c = st.run.cast;
    const fish = p && !p.snag ? p : c.msg === 'sold' ? { sp: c.sp, w: c.w, s: c.s, p: c.p } : null;
    if (!fish) return;
    recent.unshift({ sp: fish.sp, w: fish.w, at: now() });
    recent.length = Math.min(recent.length, 6);
    if (p && p.first) noteFor(sim.kindOf(sim.spOf(st, p.sp)));
  }

  function achievements(st) {
    const c = g.config;
    const m = st.meta;
    if (sim.journalCount(st) >= 1) g.achieve('first-fish');
    if (m.legends >= 1) g.achieve('first-legend');
    if (sim.journalCount(st) >= K.kinds.length) g.achieve('all-species');
    if ((m.heaviest || 0) >= c['ach.record']) g.achieve('record-10');
    if ((m.bestStreak || 0) >= c['ach.streak']) g.achieve('streak-50');
    if (m.flags && m.flags.night3) g.achieve('night-3');
  }

  // ---- render (the DOM) ------------------------------------------------------------------------

  function render(st) {
    const c = g.config;
    const r = st.run;
    const t = now();
    view.coins.textContent = coinsText(r.coins);
    const rate = sim.aqRate(st, c) * g.links.mult();
    view.rate.textContent = rate > 0 ? 'Аквариум +' + g.fmt(rate) + '/мин' + (g.links.mult() > 1 ? ' ' + g.fmt.mult(g.links.mult()) : '') : 'Аквариум пуст';
    const weather = sim.weatherAt(r.water, t, c);
    view.where.textContent = sim.waterTitle(r.water) + ' · ' + (weather === 'any' ? 'под землёй' : title(WORLD.weather, weather)) + ' · ' + title(WORLD.periods, sim.periodAt(st, t, c)) + ' · ' + hhmm(t);

    // News first: flashes and stock.
    r.news.forEach((n) => {
      if (n.n > seen.news) {
        seen.news = n.n;
        onNews(n);
      }
    });

    renderEvents(st, t);
    renderCard(st);
    renderSide(st);
    renderAside(st);
    achievements(st);
  }

  function renderEvents(st, t) {
    const r = st.run;
    const c = g.config;
    const list = [];
    const add = (iconName, text, onclick, cls) => list.push(h(onclick ? 'button' : 'span', { class: 'f-ev ' + (cls || ''), onclick }, icon(iconName), text));
    if (r.zhorUntil > t) add('timer', 'Жор ' + mmss(r.zhorUntil - t), null, 'hot');
    if (r.dawnUntil > t) add('energy', 'Зорька ' + mmss(r.dawnUntil - t), null, 'hot');
    if (r.groundUntil > t) add('leaf', 'Прикормка ' + mmss(r.groundUntil - t));
    if (r.shoal && r.shoal.water === r.water) add('fish', 'Косяк: ' + sim.nameOf(st, r.shoal.sp).toLowerCase() + ' ×' + r.shoal.left);
    if (r.fisherUntil > t) add('user', 'Старый рыбак ' + mmss(r.fisherUntil - t), () => openSheet('sack'), 'hot');
    if (sim.lanternOn(st, t, c)) add('moon', 'Фонарь');
    const tour = sim.tourneyToday(st, c, t);
    if (tour) add('trophy', 'Турнир: ' + sim.nameOf(st, tour.sp).toLowerCase() + (tour.won ? ' — выигран' : ' от ' + kg(tour.target)));
    view.chips.replaceChildren(...list);
  }

  function renderCard(st) {
    const p = st.run.pending;
    const key = p ? JSON.stringify(p) : null;
    if (key === seen.pending) return;
    seen.pending = key;
    if (!p) {
      view.card.hidden = true;
      view.card.replaceChildren();
      return;
    }
    const c = g.config;
    view.card.hidden = false;
    if (p.snag) {
      view.card.replaceChildren(
        h('div', { class: 'f-card-head' }, h('span', { class: 'f-card-icon' }, icon('box')), h('div', {},
          h('div', { class: 'f-card-name' }, 'Зацеп: ' + p.name),
          h('div', { class: 'g-note' }, p.isNew ? 'Новый трофей — на стену в журнале' : 'Такой уже есть — продан за ' + g.fmt(p.coins)))),
        h('div', { class: 'g-btns' }, h('button', { class: 'g-btn primary', id: 'card-next', onclick: () => decide('sack') }, 'Дальше')));
      return;
    }
    const sp = sim.spOf(st, p.sp);
    const marks = [];
    if (p.first) marks.push(h('span', { class: 'g-mark' }, 'Новый вид'));
    if (p.record && !p.first) marks.push(h('span', { class: 'g-mark' }, 'Рекорд'));
    if (p.r === 'r') marks.push(h('span', { class: 'g-mark' }, 'Редкая'));
    if (p.r === 'l') marks.push(h('span', { class: 'g-mark' }, 'Легенда'));
    const litres = Math.ceil(sim.fishLitres(p.w, c));
    const fits = sim.fits(st, c, p.w);
    const perMin = p.p * c['aquarium.rate'] * (1 + c['filter.per'] * sim.lvl(st, 'filter')) * (p.r === 'c' ? 1 : 1 + c['light.per'] * sim.lvl(st, 'light'));
    view.card.replaceChildren(
      h('div', { class: 'f-card-head' }, fishSvg(sp, true, 'big'), h('div', {},
        h('div', { class: 'f-card-name' }, sp ? sp.name : p.sp),
        h('div', { class: 'f-card-line' }, kg(p.w), stars(p.s), h('span', { class: 'g-num' }, g.fmt(p.p) + ' мон.')),
        marks.length ? h('div', { class: 'f-marks' }, marks) : null)),
      h('div', { class: 'f-card-btns' },
        h('button', { class: 'g-btn small', id: 'card-free', onclick: () => decide('free') }, 'Отпустить', h('span', { class: 'g-sub' }, 'в мастерство')),
        h('button', { class: 'g-btn small' + (fits ? '' : ' f-off'), id: 'card-aq', onclick: () => decide('aq') }, 'В аквариум', h('span', { class: 'g-sub' }, fits ? litres + ' л, +' + g.fmt(perMin) + '/мин' : 'нет места')),
        h('button', { class: 'g-btn small primary', id: 'card-sack', onclick: () => decide('sack') }, 'В садок', h('span', { class: 'g-sub' }, 'на продажу'))));
  }

  function renderSide(st) {
    const r = st.run;
    const c = g.config;
    const n = sim.sackCount(st);
    view.sackSub.textContent = n ? n + ' · ' + g.fmt(sim.sackValue(st)) : sim.owned(st, 'keepnet') ? 'автопродажа' : 'пусто';
    view.aqSub.textContent = Math.round(sim.usedLitres(st, c)) + ' из ' + sim.litres(st, c) + ' л';
    view.waterChip.label.textContent = sim.waterTitle(r.water);
    if (seen.water !== r.water) {
      seen.water = r.water;
      view.waterChip.pic.innerHTML = FishArt.water(r.water, (K.water[r.water] || {}).tint);
    }
    if (seen.bait !== r.use) {
      seen.bait = r.use;
      view.baitChip.pic.innerHTML = FishArt.bait(r.use);
    }
    const count = r.use === 'worm' || r.use === 'spoon' || r.use === 'jig' ? '' : ' ×' + (r.bait[r.use] || 0);
    view.baitChip.label.textContent = title(WORLD.baits, r.use) + count;
    view.journalSub.textContent = sim.journalCount(st) + ' из ' + K.kinds.length;
    view.lanternChip.hidden = sim.seasonOf(st) < c['season.lantern'];
    view.lanternChip.classList.toggle('on', !!r.lantern);
    const steps = g.links.status().steps;
    view.dawnChip.hidden = !(steps && steps.on);
    view.prestige.hidden = !sim.firstSix(st);
  }

  function renderAside(st) {
    if (g.layout !== 'wide') return;
    const c = g.config;
    view.asideHead.textContent = 'Аквариум ' + Math.round(sim.usedLitres(st, c)) + '/' + sim.litres(st, c) + ' л · +' + g.fmt(sim.aqRate(st, c)) + '/мин';
    const lines = [h('div', { class: 'f-aside-title' }, 'Журнал: ' + sim.journalCount(st) + ' из ' + K.kinds.length + ' видов, трофеев ' + Object.keys(st.meta.trophies).length + ' из ' + K.trophies.length)];
    recent.slice(0, 4).forEach((f) => {
      const sp = sim.spOf(st, f.sp);
      lines.push(h('div', { class: 'f-recent' }, fishSvg(sp, true, 'tiny'), h('span', {}, (sp ? sp.name : f.sp) + ' · ' + kg(f.w))));
    });
    if (!recent.length) lines.push(h('div', { class: 'g-note' }, 'Последние уловы появятся здесь'));
    view.asideJournal.replaceChildren(...lines);
  }

  // ---- animate (the canvas, the ring, transitions) ---------------------------------------------

  function animate(st, game, dt) {
    tAnim += dt;
    const c = st.run.cast;
    if (c.phase !== seen.phase) {
      if (c.phase === 'bite') {
        g.buzz(BUZZ_BITE);
        g.sfx('bite');
      } else if (c.phase === 'wait' && seen.phase === 'aim') {
        g.sfx('splash');
      } else if (c.phase === 'idle' && c.msg === 'snap') {
        g.buzz('deny');
        g.sfx('snap');
      } else if (c.phase === 'idle' && c.msg && c.msg !== 'sold' && seen.phase === 'fight') {
        g.sfx('deny');
      }
      if (c.phase === 'caught' || (c.phase === 'idle' && c.msg === 'sold' && seen.phase === 'fight')) {
        g.sfx('catch');
        g.buzz('buy');
        seen.caughtAt = now();
        onCatch(st);
      }
      seen.phase = c.phase;
    }
    if (c.phase === 'fight') {
      if (c.jerks > seen.jerks) {
        g.buzz(BUZZ_JERK);
        g.sfx('jerk');
      }
      seen.jerks = c.jerks;
    } else {
      seen.jerks = 0;
    }
    button(st);
    status(st);
    drawScene(st);
    if (g.layout === 'wide') drawAquarium(st, dt);
  }

  function button(st) {
    const c = st.run.cast;
    const cfgv = g.config;
    let label = 'Заброс';
    let sub = 'держать';
    let frac = 0;
    let cls = '';
    if (c.phase === 'aim') {
      label = 'Отпустить';
      sub = Math.round(c.fill * sim.maxRange(st, cfgv)) + ' м';
      frac = c.fill;
      cls = 'aim';
    } else if (c.phase === 'wait') {
      label = 'Ждём';
      sub = 'рано не жать';
    } else if (c.phase === 'bite' || c.phase === 'late') {
      label = 'Подсечь';
      sub = 'сейчас';
      frac = 1;
      cls = 'bite';
    } else if (c.phase === 'fight') {
      label = c.hold ? 'Мотаю' : 'Мотать';
      sub = Math.max(0, Math.round(c.d)) + ' м';
      frac = Math.min(1, c.T / 100);
      cls = c.T >= 100 ? 'bad' : c.T >= 80 ? 'warn' : 'ok';
    } else if (c.phase === 'caught') {
      label = st.run.pending && st.run.pending.snag ? 'Дальше' : 'В садок';
      sub = '';
    }
    if (view.bigLabel.textContent !== label) view.bigLabel.textContent = label;
    if (view.bigSub.textContent !== sub) view.bigSub.textContent = sub;
    view.arc.setAttribute('stroke-dasharray', (frac * 100).toFixed(1) + ' 100');
    view.arc.style.opacity = frac > 0.005 ? '1' : '0';
    const wrapCls = 'f-big-wrap ' + cls;
    if (view.bigWrap.className !== wrapCls) view.bigWrap.className = wrapCls;
  }

  function status(st) {
    const c = st.run.cast;
    const cfgv = g.config;
    let text = '';
    if (c.phase === 'idle') {
      if (c.msg && c.msgT > 0) text = c.msg === 'sold' ? 'Продано: ' + sim.nameOf(st, c.sp).toLowerCase() + ' ' + kg(c.w) + ' — ' + g.fmt(c.p) + ' мон.' : MSG[c.msg] || '';
      else text = 'Держите кнопку — дальность, отпустите — заброс';
    } else if (c.phase === 'aim') {
      const d = c.fill * sim.maxRange(st, cfgv);
      text = 'Дальность ' + Math.round(d) + ' м — ' + title(WORLD.zones, sim.ZONES[sim.zoneIndex(d, cfgv)]);
    } else if (c.phase === 'wait') {
      text = falseNow(c, cfgv) ? 'Поплавок дрогнул — не спешите' : 'Ждём поклёвку';
    } else if (c.phase === 'bite') {
      text = 'Клюёт! Подсекайте';
    } else if (c.phase === 'late') {
      text = 'Поздно — ещё можно успеть';
    } else if (c.phase === 'fight') {
      text = 'Натяжение ' + Math.round(c.T) + ' · ' + Math.max(0, Math.round(c.d)) + ' м · держите до 80, отпускайте до 50';
    } else if (c.phase === 'caught') {
      text = '';
    }
    if (view.status.textContent !== text) view.status.textContent = text;
  }

  function falseNow(c, cfgv) {
    return (c.fl || []).some((t) => c.el >= t && c.el < t + cfgv['bite.falseSec']);
  }

  // ---- the scene --------------------------------------------------------------------------------

  // The picture is ui/scene.js (FishScene): here only the model of the frame is gathered.
  const calm = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

  function drawScene(st) {
    const cv = view.canvas;
    const ctx = cv.getContext('2d');
    if (!ctx || !cv.width) return;
    const cfgv = g.config;
    const t = now();
    const r = st.run;
    const c = r.cast;
    const date = new Date(t);
    const hooked = c.phase === 'fight' && !c.snag ? sim.spOf(st, c.sp) : null;
    const zone = hooked ? sim.ZONES.indexOf(hooked.zone) : c.phase === 'fight' ? 2 : c.d != null ? sim.zoneIndex(c.d, cfgv) : 0;
    window.FishScene.draw(ctx, {
      W: cv.width,
      H: cv.height,
      dpr: Math.min(3, window.devicePixelRatio || 1),
      t: tAnim,
      still: !!(calm && calm.matches),
      water: Object.assign({ id: r.water }, K.water[r.water] || {}),
      period: sim.periodAt(st, t, cfgv),
      weather: sim.weatherAt(r.water, t, cfgv),
      hour: date.getHours() + date.getMinutes() / 60,
      z1: cfgv['zone.middle'],
      z2: cfgv['zone.deep'],
      maxView: Math.max(sim.maxRange(st, cfgv), cfgv['zone.deep'] + 12),
      range: sim.maxRange(st, cfgv),
      boat: sim.owned(st, 'boat'),
      lantern: sim.lanternOn(st, t, cfgv),
      sonar: sim.owned(st, 'sonar') ? sim.waterSpecies(st, r.water).filter((x) => x.rarity === 'rare').map((x, i) => ({ zone: sim.fishZone(x, t, cfgv), i })) : [],
      cast: { phase: c.phase, fill: c.fill || 0, d: c.d || 0, T: c.T || 0, hold: !!c.hold, jt: c.jt || 0, zone },
      falseBite: c.phase === 'wait' && falseNow(c, cfgv),
      fishLen: hooked ? 34 * Math.cbrt(c.w / hooked.avg) : 26,
      fish: (cx, x, y, len, tilt) => drawFish(cx, hooked, x, y, len, false, tilt)
    });
  }

  function drawFish(ctx, sp, x, y, len, flip, tilt) {
    const p = fishPaths(sp && sp.shape);
    const k = len / 100;
    ctx.save();
    ctx.translate(x, y);
    if (tilt) ctx.rotate(tilt);
    ctx.scale(flip ? -k : k, k);
    ctx.translate(-6, -25);
    ctx.fillStyle = sp ? (sp.shape && sp.shape.color) || '#8a8a8a' : '#6b6356';
    if (!sp) {
      // A snag: a lump of old wood, not a fish.
      ctx.fill(new Path2D('M8 30 C8 14 22 8 40 10 C58 6 76 14 74 30 C72 42 54 44 40 42 C24 44 8 42 8 30 Z'));
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 3;
      ctx.stroke(new Path2D('M24 12 L28 42 M52 10 L50 43'));
    } else {
      ctx.fill(new Path2D(p.tail));
      ctx.fill(new Path2D(p.fin));
      ctx.fill(new Path2D(p.body));
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 3;
      p.stripes.forEach((d) => ctx.stroke(new Path2D(d)));
      ctx.fillStyle = '#101010';
      ctx.beginPath();
      ctx.arc(p.eye[0], p.eye[1], p.eye[2], 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // ---- the live aquarium (wide screen) ----------------------------------------------------------

  const sprites = [];

  function drawAquarium(st, dt) {
    const cv = view.aqCanvas;
    if (!cv.width || cv.clientWidth < 10) {
      sizeCanvases();
      return;
    }
    const ctx = cv.getContext('2d');
    const W = cv.width;
    const H = cv.height;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const aq = st.run.aq;
    while (sprites.length < aq.length) sprites.push({ x: Math.random() * W, y: H * (0.2 + Math.random() * 0.6), v: (0.3 + Math.random() * 0.5) * (Math.random() < 0.5 ? -1 : 1), ph: Math.random() * 6 });
    sprites.length = aq.length;
    // The tank: lit water, a strip of surface, sand with pebbles, weed, bubbles from the filter.
    const ta = calm && calm.matches ? 0 : tAnim;
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#2a6f86');
    grad.addColorStop(0.6, '#174457');
    grad.addColorStop(1, '#0d2733');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(190,232,240,0.16)';
    ctx.fillRect(0, 0, W, 5 * dpr);
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    for (let i = 0; i < 3; i++) {
      const x = W * (0.18 + 0.3 * i) + Math.sin(ta * 0.5 + i) * 6 * dpr;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + 22 * dpr, 0);
      ctx.lineTo(x + 50 * dpr, H);
      ctx.lineTo(x + 6 * dpr, H);
      ctx.fill();
    }
    ctx.fillStyle = '#6a5a3c';
    ctx.beginPath();
    ctx.moveTo(0, H * 0.9);
    ctx.quadraticCurveTo(W * 0.3, H * 0.82, W * 0.55, H * 0.88);
    ctx.quadraticCurveTo(W * 0.8, H * 0.93, W, H * 0.86);
    ctx.lineTo(W, H);
    ctx.lineTo(0, H);
    ctx.fill();
    for (let i = 0; i < 7; i++) {
      ctx.fillStyle = i % 2 ? '#8a7a58' : '#4f4630';
      ctx.beginPath();
      ctx.ellipse(W * ((i * 0.147 + 0.06) % 1), H * (0.93 + 0.02 * (i % 3)), (4 + (i % 3) * 2) * dpr, (2 + (i % 2)) * dpr, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.lineCap = 'round';
    for (let i = 0; i < 5; i++) {
      const x = (W * (i + 0.5)) / 5;
      for (let k = 0; k < 2; k++) {
        ctx.strokeStyle = k ? '#3f8a58' : '#2f6a46';
        ctx.lineWidth = (3.5 - k) * dpr;
        ctx.beginPath();
        ctx.moveTo(x + k * 5 * dpr, H * 0.9);
        ctx.quadraticCurveTo(x + k * 5 * dpr + Math.sin(ta + i + k) * 8 * dpr, H * 0.72, x + k * 7 * dpr + Math.sin(ta * 1.3 + i) * 5 * dpr, H * (0.52 + 0.1 * k));
        ctx.stroke();
      }
    }
    ctx.strokeStyle = 'rgba(220,240,248,0.45)';
    ctx.lineWidth = 1 * dpr;
    for (let i = 0; i < 6; i++) {
      const k = ((ta * 0.25 + i / 6) % 1);
      ctx.beginPath();
      ctx.arc(W * 0.9 + Math.sin(ta * 2 + i) * 3 * dpr, H * (0.88 - 0.84 * k), (1.2 + (i % 3) * 0.7) * dpr, 0, Math.PI * 2);
      ctx.stroke();
    }
    aq.forEach((f, i) => {
      const s = sprites[i];
      const sp = sim.spOf(st, f.sp);
      const len = Math.max(16, Math.min(70, 26 * Math.cbrt(f.w / 0.3))) * dpr;
      s.x += s.v * 40 * dpr * dt;
      s.ph += dt * 2;
      if (s.x < len * 0.5) s.v = Math.abs(s.v);
      if (s.x > W - len * 0.5) s.v = -Math.abs(s.v);
      drawFish(ctx, sp, s.x, s.y + Math.sin(s.ph) * 3 * dpr, len, s.v > 0, 0);
    });
    if (!aq.length) {
      ctx.fillStyle = 'rgba(237,237,237,0.5)';
      ctx.font = 15 * dpr + 'px system-ui, sans-serif';
      ctx.textBaseline = 'middle';
      const text = 'Пока пусто';
      ctx.fillText(text, (W - ctx.measureText(text).width) / 2, H / 2);
    }
  }

  // ---- sheets -----------------------------------------------------------------------------------

  function openSheet(kind) {
    if (closeSheet) closeSheet();
    const body = h('div', { class: 'f-sheet' });
    const fill = () => body.replaceChildren(...(SHEETS[kind](g.state) || []));
    fill();
    refreshSheet = fill;
    closeSheet = g.sheet(body, () => {
      closeSheet = null;
      refreshSheet = null;
    });
    return body;
  }

  function again() {
    if (refreshSheet) refreshSheet();
    g.redraw();
  }

  /** A drawn picture in a tile; state: 'done' (a green tick), 'locked' (dimmed, dashed). */
  function pic(svg, state) {
    const tick = state === 'done' ? '<svg class="f-tick" viewBox="0 0 16 16"><circle cx="8" cy="8" r="8" fill="#5FD08A"/><path d="M4.5 8.2l2.4 2.4 4.6-5" fill="none" stroke="#101010" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>' : '';
    return h('span', { class: 'f-pic' + (state ? ' ' + state : ''), html: svg + tick });
  }

  function row(main, side, art, cls) { return h('div', { class: 'f-row' + (cls ? ' ' + cls : '') }, art || null, h('div', { class: 'f-row-main' }, main), side || null); }

  function priceButton(cost, onclick, id, label) {
    const ok = cost && Big.gte(g.state.run.coins, cost);
    return h('button', { class: 'g-btn small' + (ok ? ' primary' : ''), id, disabled: !cost || !ok, onclick }, label || (cost ? g.fmt.price(cost) : 'Есть'));
  }

  function buyItem(id) {
    if (!g.act((s) => sim.buy(s, g.config, id), { now: true, reason: 'action' })) {
      g.sfx('deny');
      g.buzz('deny');
      return;
    }
    g.sfx('buy');
    g.buzz('buy');
    again();
  }

  const SHEETS = {
    shop(st) {
      const c = g.config;
      const group = (titleText, ids) => [h('h3', {}, titleText)].concat(ids.map((id) => {
        const u = UPS[id] || { title: id, text: '' };
        const cost = sim.costOf(st, c, id);
        const level = sim.lvl(st, id);
        const tiered = sim.TIERED.indexOf(id) >= 0;
        const head = h('div', { class: 'f-row-title' }, u.title, tiered ? h('span', { class: 'f-level' }, 'ур. ' + level + (sim.upMax(c, id) === Infinity ? '' : ' из ' + sim.upMax(c, id))) : null);
        const done = !cost;
        return row([head, h('div', { class: 'g-note' }, u.text)], priceButton(cost, () => buyItem(id), 'buy-' + id, cost ? null : tiered ? 'Предел' : 'Есть'), pic(FishArt.up(id), done ? 'done' : ''), done ? 'done' : level || sim.owned(st, id) ? 'has' : '');
      }));
      const packs = [h('h3', {}, 'Наживка и прикормка')].concat([
        ['groundbait', 'Прикормка', 'Поклёвка на 10 % быстрее на ' + c['groundbait.minutes'] + ' мин; есть ' + st.run.ground],
        ['bloodworm', 'Мотыль, ' + c['shop.bloodworm.pack'] + ' шт.', 'Любимая наживка мирной рыбы; есть ' + st.run.bait.bloodworm],
        ['livebait', 'Живец, ' + c['shop.livebait.pack'] + ' шт.', 'Любимая наживка хищника; есть ' + st.run.bait.livebait]
      ].map((p) => row([h('div', { class: 'f-row-title' }, p[1]), h('div', { class: 'g-note' }, p[2])], priceButton(sim.costOf(st, c, p[0]), () => buyItem(p[0]), 'buy-' + p[0]), pic(FishArt.bait(p[0])))));
      return [h('h3', {}, 'Магазин — ' + coinsText(st.run.coins))]
        .concat(group('Снасти', ['rod', 'reel', 'line', 'hook', 'float']))
        .concat(group('Аквариум', ['aquarium', 'filter', 'light']))
        .concat(group('Помощники', ['keepnet', 'cat', 'rod2']))
        .concat(group('Снаряжение', ['landing', 'absorber', 'boat', 'spoon', 'jig', 'sonar', 'journal']))
        .concat(packs);
    },

    waters(st) {
      const c = g.config;
      const t = now();
      const out = [h('h3', {}, 'Водоёмы')];
      K.waters.forEach((w) => {
        const open = st.run.waters.indexOf(w.id) >= 0;
        const here = st.run.water === w.id;
        const weather = sim.weatherAt(w.id, t, c);
        const info = w.text + ' · ' + (weather === 'any' ? 'под землёй' : title(WORLD.weather, weather)) + ' · снасти от ' + w.gear + ' ур.';
        let side;
        if (here) side = h('span', { class: 'g-mark' }, 'Здесь');
        else if (open) {
          side = h('button', {
            class: 'g-btn small primary', id: 'go-' + w.id, disabled: st.run.cast.phase !== 'idle',
            onclick: () => {
              if (g.act((s) => sim.setWater(s, w.id))) {
                g.sfx('tap');
                closeSheet && closeSheet();
              }
            }
          }, 'Перейти');
        } else {
          const lock = sim.waterLock(st, c, w.id);
          const cost = sim.waterCost(c, w.id);
          side = lock ? h('span', { class: 'g-note f-lock' }, lock) : priceButton(cost, () => {
            if (g.act((s) => sim.openWater(s, g.config, w.id), { now: true, reason: 'action' })) {
              g.sfx('level');
              g.buzz('level');
              g.flash('map', 'Открыт водоём', w.title);
              again();
            }
          }, 'open-' + w.id, 'Открыть ' + g.fmt.price(cost));
        }
        out.push(row([h('div', { class: 'f-row-title' }, w.title), h('div', { class: 'g-note' }, info)], side, pic(FishArt.water(w.id, w.tint), open ? '' : 'locked'), here ? 'here' : open ? 'has' : 'locked'));
      });
      return out;
    },

    bait(st) {
      const c = g.config;
      const r = st.run;
      const out = [h('h3', {}, 'Наживка')];
      WORLD.baits.forEach((b) => {
        const have = b.free ? 'без конца' : b.up ? (sim.owned(st, b.up) ? 'есть' : 'нет — в магазине') : (r.bait[b.id] || 0) + ' шт.';
        const avail = sim.baitAvailable(st, b.id);
        const side = r.use === b.id ? h('span', { class: 'g-mark' }, 'На крючке') : h('button', {
          class: 'g-btn small', id: 'bait-' + b.id, disabled: !avail,
          onclick: () => {
            g.act((s) => sim.setBait(s, b.id));
            g.sfx('tap');
            again();
          }
        }, 'Взять');
        out.push(row([h('div', { class: 'f-row-title' }, b.title, h('span', { class: 'f-level' }, have)), h('div', { class: 'g-note' }, b.text)], side, pic(FishArt.bait(b.id), avail ? '' : 'locked'), r.use === b.id ? 'here' : ''));
      });
      const active = r.groundUntil > now();
      out.push(h('h3', {}, 'Прикормка'));
      out.push(row([h('div', { class: 'f-row-title' }, 'Прикормка', h('span', { class: 'f-level' }, r.ground + ' шт.')),
        h('div', { class: 'g-note' }, active ? 'Действует ещё ' + mmss(r.groundUntil - now()) : 'Поклёвка быстрее на ' + Math.round(c['groundbait.speed'] * 100) + ' % на ' + c['groundbait.minutes'] + ' мин')],
      h('button', {
        class: 'g-btn small primary', id: 'ground-use', disabled: !(r.ground > 0),
        onclick: () => {
          if (g.act((s) => sim.useGroundbait(s, g.config, now()))) g.sfx('splash');
          again();
        }
      }, 'Бросить'), pic(FishArt.bait('groundbait'))));
      return out;
    },

    aquarium(st) {
      const c = g.config;
      const r = st.run;
      const out = [h('h3', {}, 'Аквариум — ' + Math.round(sim.usedLitres(st, c)) + ' из ' + sim.litres(st, c) + ' л'),
        h('div', { class: 'g-note' }, 'Приносит +' + g.fmt(sim.aqRate(st, c)) + ' монет в минуту, и пока игра закрыта тоже. Рыба занимает ' + c['aquarium.perKg'] + ' л на килограмм.')];
      if (!r.aq.length) out.push(h('div', { class: 'g-note' }, 'Пусто: на карточке улова нажмите «В аквариум».'));
      const list = r.aq.map((f, i) => ({ f, i })).sort((a, b) => b.f.p - a.f.p);
      list.forEach(({ f, i }) => {
        const sp = sim.spOf(st, f.sp);
        const per = f.p * c['aquarium.rate'] * (1 + c['filter.per'] * sim.lvl(st, 'filter')) * (f.r === 'c' ? 1 : 1 + c['light.per'] * sim.lvl(st, 'light'));
        out.push(h('div', { class: 'f-row' },
          fishSvg(sp, true, 'small'),
          h('div', { class: 'f-row-main' }, h('div', { class: 'f-row-title' }, sim.nameOf(st, f.sp)), h('div', { class: 'g-note' }, kg(f.w) + ' · ' + Math.ceil(sim.fishLitres(f.w, c)) + ' л · +' + g.fmt(per) + '/мин'), stars(f.s)),
          h('div', { class: 'f-row-btns' },
            h('button', { class: 'g-btn small', onclick: () => { g.act((s) => sim.sellAq(s, g.config, i), { now: true }); g.sfx('buy'); again(); } }, 'Продать ' + g.fmt(f.p)),
            h('button', { class: 'g-btn small', onclick: () => { g.act((s) => sim.releaseAq(s, g.config, i), { now: true }); g.sfx('level'); again(); } }, 'Отпустить'))));
      });
      return out;
    },

    sack(st) {
      const c = g.config;
      const r = st.run;
      const t = now();
      const out = [h('h3', {}, 'Садок — ' + sim.sackCount(st) + ' рыб на ' + coinsText(sim.sackValue(st)))];
      if (sim.owned(st, 'keepnet')) out.push(h('div', { class: 'g-note' }, 'Обычная рыба продаётся сама, если не лучше той, что в аквариуме.'));
      const by = {};
      r.sack.forEach((f) => {
        by[f.sp] = by[f.sp] || { n: 0, p: 0 };
        by[f.sp].n += f.n || 1;
        by[f.sp].p += f.p * (f.n || 1);
      });
      Object.keys(by).forEach((id) => {
        const sp = sim.spOf(st, id);
        out.push(h('div', { class: 'f-row' }, fishSvg(sp, true, 'small'), h('div', { class: 'f-row-main' }, h('div', { class: 'f-row-title' }, sim.nameOf(st, id) + ' ×' + by[id].n), h('div', { class: 'g-note' }, g.fmt(by[id].p) + ' мон.'))));
      });
      if (r.fisherUntil > t) {
        out.push(h('h3', {}, 'Старый рыбак ждёт ещё ' + mmss(r.fisherUntil - t)));
        const list = sim.tradeable(st, c);
        if (!list.length) out.push(h('div', { class: 'g-note' }, 'Нужно ' + c['fisher.need'] + ' одинаковых рыб в садке.'));
        list.forEach((id) => out.push(h('button', {
          class: 'g-btn', id: 'trade-' + id,
          onclick: () => {
            if (g.act((s) => sim.trade(s, g.config, id, now()), { now: true })) {
              g.sfx('chest');
              again();
            }
          }
        }, 'Отдать ' + c['fisher.need'] + ' × ' + sim.nameOf(st, id).toLowerCase(), h('span', { class: 'g-sub' }, '→ ' + c['fisher.gold'] + ' золотой наживки'))));
      }
      out.push(h('button', {
        class: 'g-btn primary', id: 'sell-all', disabled: !r.sack.length,
        onclick: () => {
          const sum = g.act((s) => sim.sellSack(s, g.config), { now: true });
          if (sum > 0) {
            g.sfx('buy');
            g.buzz('buy');
          }
          again();
        }
      }, 'Продать всё'));
      return out;
    },

    journal(st) {
      const c = g.config;
      const m = st.meta;
      const t = now();
      const detail = sim.owned(st, 'journal');
      const out = [h('h3', {}, 'Журнал — ' + sim.journalCount(st) + ' из ' + K.kinds.length + ' видов')];
      if (!detail) out.push(h('div', { class: 'g-note' }, 'Часы и погоду пойманных видов покажет «Журнал рыболова» из магазина.'));
      const shown = {};
      K.waters.forEach((w) => {
        out.push(h('div', { class: 'f-sub' }, w.title));
        sim.waterSpecies(st, w.id).forEach((sp) => {
          const kind = sim.kindOf(sp);
          if (shown[kind + ':' + w.id]) return;
          shown[kind + ':' + w.id] = true;
          const j = m.journal[kind];
          const lines = [];
          if (j) {
            lines.push(h('div', { class: 'g-note' }, 'поймано ' + j.n + ', рекорд ' + kg(j.best) + (sp.rarity === 'legend' ? ' · легенда' : sp.rarity === 'rare' ? ' · редкая' : '')));
            if (detail) {
              const hours = sp.hours.map((x) => title(WORLD.periods, x)).join(', ');
              const weather = sp.weather.indexOf('any') >= 0 ? 'любая погода' : sp.weather.map((x) => title(WORLD.weather, x)).join(', ');
              lines.push(h('div', { class: 'g-note' }, hours + ' · ' + weather + ' · ' + title(WORLD.zones, sp.zone) + ' · ' + title(WORLD.baits, sp.bait).toLowerCase()));
            }
            const note = m.notes[kind] || C.notes[kind] || sp.text;
            if (note) lines.push(h('div', { class: 'f-note' }, note));
          } else {
            lines.push(h('div', { class: 'g-note' }, sp.rarity === 'legend' ? 'легенда — ещё не поймана' : 'ещё не пойман'));
          }
          out.push(h('div', { class: 'f-row' }, fishSvg(sp, !!j, 'small'), h('div', { class: 'f-row-main' }, h('div', { class: 'f-row-title' }, j ? sp.name : '?'), lines)));
        });
      });
      if (m.hints.length) {
        out.push(h('h3', {}, 'Записки в бутылках'));
        m.hints.slice().reverse().forEach((hint) => {
          out.push(h('div', { class: 'f-row' }, pic(FishArt.note()), h('div', { class: 'f-row-main' },
            hint.text ? h('div', { class: 'f-note' }, (hint.title ? hint.title + ': ' : '') + hint.text) : null,
            h('div', { class: 'g-note' }, sim.hintText(st, c, hint.sp)))));
        });
      }
      const tour = sim.tourneyToday(st, c, t);
      if (tour) {
        out.push(h('h3', {}, 'Турнир дня'));
        out.push(h('div', { class: 'g-note' }, sim.nameOf(st, tour.sp) + ' от ' + kg(tour.target) + (tour.best ? ', лучший сегодня ' + kg(tour.best) : '') + (tour.won ? ' — выигран' : ', приз ' + c['tourney.prize'] + ' золотой наживки')));
      }
      const found = Object.keys(m.trophies).length;
      out.push(h('h3', {}, 'Трофейная стена — ' + found + ' из ' + K.trophies.length));
      const wall = h('div', { class: 'f-wall' });
      K.trophies.forEach((tr) => {
        const has = !!m.trophies[tr.id];
        const note = has ? m.notes['t:' + tr.id] || C.notes['t:' + tr.id] || '' : '';
        wall.append(h('div', { class: 'f-trophy' + (has ? ' has' : '') + (has && tr.rare ? ' rare' : '') }, pic(has ? FishArt.trophy(tr.id) : FishArt.unknown(), has ? '' : 'locked'), h('div', { class: 'f-row-title' }, has ? tr.name : 'Не найден'), has && tr.rare ? h('div', { class: 'f-level' }, 'редкая находка') : null, note ? h('div', { class: 'g-note' }, note) : null));
      });
      out.push(wall);
      out.push(h('div', { class: 'g-note' }, 'Поймано всего ' + (m.caughtAll || 0) + ', легенд ' + (m.legends || 0) + ', обрывов ' + (m.snaps || 0) + ', лучшая серия без обрыва ' + (m.bestStreak || 0)));
      return out;
    }
  };

  await Game.start({ sim, render, animate, init: build });
})();
