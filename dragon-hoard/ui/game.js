// The screen of «Сокровищница дракона». The engine (Game.start) gives the frame — g.el.top (the
// pile and the income), g.el.field, g.el.actions (under the thumb) — and keeps the state, saves,
// offline, prestige, sound. The logic is in ../sim.js; every number comes from g.config.
//
// Narrow (the cover screen): the lair, the bar «сила vs рыцарь», the panel of the tab; the strip
// of the tabs and the two big buttons «В набег» / «Свернуться на куче» at the bottom. Wide (the
// inner screen): the lair with the road to it on the left (the knight walks it), the tabs on the
// right. What a model wrote (ballads, worlds, knights, tales) goes in as ui.raw / data-raw.
(async function () {
  const h = ui.h;
  // Texts put together from pieces: each piece through the dictionary (i18n-en.json), so the whole
  // line is in one language; a plain text in ui.h or set() is translated by the kit by itself.
  const T = ui.t;
  const sim = window.GameSim;
  const SVG = 'http://www.w3.org/2000/svg';
  const view = {};
  let g = null;
  let tab = 'servants';
  let panelKey = '';
  let updaters = [];
  let buyMode = 1;
  const seen = { news: 0, log: 0, offered: '' };
  let rainTimer = 0;

  const TABS = [
    ['servants', 'Слуги'],
    ['dragon', 'Дракон'],
    ['raids', 'Набеги'],
    ['lair', 'Логово'],
    ['chronicle', 'Хроника']
  ];

  // ---- small helpers -------------------------------------------------------------------------

  function set(node, text) {
    const v = text === undefined || text === null ? '' : String(text);
    if (node.__v !== v) {
      node.__v = v;
      node.textContent = v;
    }
  }

  function svg(name, attrs) {
    const el = document.createElementNS(SVG, name);
    for (const k in attrs || {}) el.setAttribute(k, attrs[k]);
    return el;
  }

  function cfg() { return g.config; }

  function age(state) { return sim.ageIndex(state, cfg()); }

  function time(ms) { return g.fmt.time(Math.max(0, Math.ceil(ms / 1000))); }

  function pct(p) { return Math.round(p * 100) + ' %'; }

  function row(o) {
    const t = h('div', { class: 't' }, o.title || '');
    const s = h('div', { class: 's' });
    const r = h('div', { class: 'r' + (o.warm ? ' warm' : '') });
    const art = o.art ? DhArt.el(o.art) : null;
    const el = h('button', { class: 'dh-row', onclick: o.onclick }, art, h('div', { class: 'grow' }, t, s), r);
    if (o.raw) t.setAttribute('data-raw', '');
    return { el, t, s, r, art };
  }

  /** The state of a picture: '' | 'locked' (dimmed, a lock in the corner) | 'got' (a gold frame). */
  function mark(art, cls) {
    if (!art || art.__c === cls) return;
    art.__c = cls;
    art.classList.toggle('locked', cls === 'locked');
    art.classList.toggle('got', cls === 'got');
    const lock = art.querySelector('i');
    if (cls === 'locked' && !lock) art.insertAdjacentHTML('beforeend', '<i>' + DhArt.svg('lock') + '</i>');
    if (cls !== 'locked' && lock) lock.remove();
  }

  /** A line of the panel with its picture: what a number means, what opens next. */
  function info(art, text, cls) {
    const body = typeof text === 'string' ? h('div', { class: 'x' }, text) : text;
    return h('div', { class: 'dh-info' + (cls === 'locked' ? ' locked' : '') }, DhArt.el(art, 'sm' + (cls ? ' ' + cls : '')), body);
  }

  function toggle(title, text, get, flip, art) {
    const box = h('input', { type: 'checkbox', class: 'switch', 'aria-label': title });
    box.addEventListener('change', () => {
      g.act(s => flip(s));
      g.sfx('tap');
    });
    const el = h('label', { class: 'dh-toggle' }, art ? DhArt.el(art) : null, h('div', { class: 'grow' }, h('div', { class: 't' }, title), h('div', { class: 'dh-note' }, text)), box);
    updaters.push(state => { box.checked = !!get(state); });
    return el;
  }

  function heading(text) { return h('div', { class: 'dh-h' }, text); }

  function note(text) { return h('div', { class: 'dh-note' }, text); }

  function deny() {
    g.sfx('deny');
    g.buzz('deny');
  }

  function done(ok, sound) {
    if (!ok) return deny();
    g.sfx(sound || 'buy');
    g.buzz('buy');
  }

  function knightTitle(state, id) { return sim.knightDef(state, id).title; }

  /** The world of the age under a heading: a built-in one translated, a model's one kept as written. */
  function worldNote(state) {
    const w = sim.worldOf(state);
    // The defense of the targets changes with every world; the number comes from the settings or the stock.
    const d = sim.worldMod(state, cfg(), 'defense');
    const defense = d !== 1 ? h('div', { class: 'dh-note' }, T('защита целей набегов {}', g.fmt.mult(d))) : null;
    if (w.id === 'custom') return h('div', {}, h('div', { class: 'dh-note', 'data-raw': '' }, ui.raw(w.title + (w.text ? ': ' + w.text : ''))), defense);
    return h('div', {}, h('div', { class: 'dh-note' }, T(w.title) + (w.text ? ': ' + T(w.text) : '')), defense);
  }

  // ---- the frame --------------------------------------------------------------------------------

  function build(game) {
    g = game;
    view.pile = h('div', { class: 'g-big', id: 'dh-pile' });
    view.rate = h('div', { class: 'g-rate', id: 'dh-rate' });
    view.meta = h('div', { class: 'g-rate dh-meta', id: 'dh-meta' });
    g.el.top.append(view.pile, view.rate, view.meta);

    view.scene = h('div', { class: 'dh-scene', id: 'dh-scene' });
    view.svg = svg('svg', { 'aria-hidden': 'true', preserveAspectRatio: 'xMidYMax meet' });
    view.over = h('div', { class: 'dh-over' });
    view.scene.append(view.svg, view.over);
    if (Game.scene && window.DragonScene) {
      view.world = Game.scene({ parent: view.scene, label: 'Живое логово дракона', width: 1000, height: 620, game: g, draw: DragonScene.draw });
      view.scene.classList.add('dh-world');
      view.svg.hidden = true;
      g.on('offline', () => { view.worldPrevious = null; });
    }

    view.duelTop = h('div', { class: 'dh-duel-row' });
    view.duelText = h('span', {});
    view.duelP = h('span', { class: 'p' });
    view.duelTop.append(view.duelText, view.duelP);
    view.barFill = h('i', {});
    view.bar = h('div', { class: 'dh-bar', role: 'img' }, view.barFill, h('b', {}));
    view.who = h('div', { class: 'dh-who' });
    view.whoArt = h('span', { class: 'dh-who-art' });
    view.duel = h('div', { class: 'dh-duel', id: 'dh-duel' }, view.duelTop, view.bar, h('div', { class: 'dh-who-row' }, view.whoArt, view.who));

    view.eventTitle = h('div', { class: 't' });
    view.eventText = h('div', { class: 'x' });
    view.eventButtons = h('div', { class: 'g-btns' });
    view.eventLeft = h('div', { class: 'dh-note' });
    view.eventArt = h('span', { class: 'dh-event-art' });
    view.event = h('div', { class: 'dh-event', id: 'dh-event', hidden: true }, h('div', { class: 'dh-event-head' }, view.eventArt, h('div', { class: 'grow' }, view.eventTitle, view.eventText)), view.eventButtons, view.eventLeft);

    view.panel = h('div', { class: 'dh-panel', id: 'dh-panel' });
    view.main = h('div', { class: 'dh-main' }, view.scene, view.duel, view.event);
    g.el.field.append(view.main);

    view.tabs = h('div', { class: 'dh-tabs', role: 'tablist' });
    view.tabButtons = {};
    TABS.forEach(([id, title]) => {
      const b = h('button', { role: 'tab', 'data-tab': id, onclick: () => openTab(id) }, title);
      view.tabButtons[id] = b;
      view.tabs.append(b);
    });
    view.side = h('div', { class: 'dh-side' }, view.tabs);

    view.raidLabel = h('span', {});
    view.raidSub = h('span', { class: 'g-sub' });
    view.raidBtn = h('button', { class: 'g-btn primary', id: 'dh-raid', onclick: raidSheet }, h('span', {}, view.raidLabel, view.raidSub));
    view.curlLabel = h('span', {});
    view.curlSub = h('span', { class: 'g-sub' });
    view.curlBtn = h('button', { class: 'g-btn', id: 'dh-curl', onclick: curl }, h('span', {}, view.curlLabel, view.curlSub));
    view.go = h('div', { class: 'g-btns dh-go' }, view.raidBtn, view.curlBtn);
    g.el.actions.append(view.side, view.go);

    view.sleepBtn = g.ui.prestigeButton('sleep', { label: 'Уснуть на век', primary: true });
    view.sleepBtn.id = 'dh-sleep';
    view.clutchBtn = g.ui.prestigeButton('clutch', { label: 'Оставить яйцо: новая кладка' });
    view.clutchBtn.id = 'dh-clutch';

    place();
    openTab(tab);
    remember(g.state);

    g.on('resize', () => {
      place();
      draw(g.state, true);
    });
    g.on('offline', report => {
      // The summary of the absence: knights, trophies, raids and the advice.
      const lines = sim.awaySummary(g.state, cfg(), Date.now());
      lines.forEach(l => report.events.push(l));
      remember(g.state);
    });
    g.on('chest', () => {
      g.sfx('chest');
      remember(g.state);
    });
    g.on('prestige', e => woke(e.layer));
    g.on('links', status => offerTrip(status));
    offerTrip(g.links.status());
  }

  /** Narrow and mid: the panel under the lair; wide: in the right column under the tabs. */
  function place() {
    if (g.layout === 'wide') {
      if (view.panel.parentNode !== view.side) view.side.append(view.panel);
    } else if (view.panel.parentNode !== view.main) {
      view.main.append(view.panel);
    }
    view.svg.setAttribute('viewBox', g.layout === 'wide' ? '0 0 600 300' : '0 0 360 150');
    view.scene.__at = 0;
  }

  function openTab(id) {
    tab = id;
    panelKey = '';
    for (const k in view.tabButtons) {
      view.tabButtons[k].classList.toggle('on', k === id);
      view.tabButtons[k].setAttribute('aria-selected', k === id ? 'true' : 'false');
    }
    view.panel.scrollTop = 0;
    if (g.state) drawPanel(g.state);
  }

  /** What was already told: the log, the news (offline and the chests do not flash again). */
  function remember(state) {
    const log = state.run.log || [];
    seen.log = log.length ? log[log.length - 1].at : 0;
    seen.news = state.run.news ? state.run.news.at : 0;
  }

  // ---- the two big buttons ----------------------------------------------------------------------

  function curl() {
    const s = g.state;
    if (s.run.raid) {
      ui.toast('Дракон в набеге — свернуться можно, когда вернётся');
      return deny();
    }
    g.act(st => sim.setCurl(st, !st.run.curled));
    g.sfx('tap');
    g.buzz('tap');
  }

  function raidLine(state, n, now) {
    const c = cfg();
    const t = sim.raidOf(n);
    const allowed = sim.raidAllowed(state, c, n, now);
    const ms = sim.raidDuration(state, c, n);
    let sub = time(ms) + ' · ' + T('успех {}', pct(sim.raidChance(state, c, n))) + ' · ≈ ' + g.fmt(sim.raidLoot(state, c, n, now));
    if (t.gems) sub += ' + ' + T('самоцветы');
    const k = state.run.knight;
    if (allowed.ok && k && k.at < now + ms && sim.hall(state, 'grotto') < 1) sub += ' · ' + T('рыцарь придёт раньше: куча без охраны');
    return { title: n + '. ' + T(t.title), sub, ok: allowed.ok, why: allowed.why && T(allowed.why) };
  }

  function raidSheet() {
    const state = g.state;
    const now = Date.now();
    const rows = [];
    if (state.run.raid) {
      const r = state.run.raid;
      rows.push(h('h3', {}, 'В набеге: «' + sim.raidOf(r.n).title + '»'));
      rows.push(g.ui.line('Вернётся через', time(r.end - now)));
      rows.push(g.ui.line('Добыча при успехе', g.fmt(r.loot)));
      const st = g.links.status().steps;
      if (st && st.on) {
        const cost = cfg()['steps.cost.long-flight'];
        rows.push(h('button', { class: 'g-btn primary', onclick: () => { close(); longFlight(); } }, 'Долгий полёт: вдвое короче — ' + cost + ' энергии'));
      }
      rows.push(h('button', { class: 'g-btn small', onclick: () => close() }, 'Закрыть'));
      const close = g.sheet(rows);
      return;
    }
    rows.push(h('h3', {}, 'В набег'));
    rows.push(note(sim.hall(state, 'grotto') >= 1 ? 'Пока дракон в набеге, кучу сторожит грот.' : T('Пока дракон в набеге, куча без охраны: рыцарь бьётся с ним как с силой {}.', g.fmt.mult(cfg()['knight.unguarded']))));
    const list = h('div', { class: 'g-pick' });
    const top = sim.RAIDS_BY_AGE[age(state)];
    for (let n = 1; n <= sim.RAIDS.length; n++) {
      const x = raidLine(state, n, now);
      if (n > top + 1) break;
      const b = h('button', { disabled: !x.ok, onclick: () => { close(); startRaid(n); } }, DhArt.el(DhArt.raid(n), x.ok ? '' : 'locked'),
        h('div', { class: 'grow' }, h('div', {}, x.title), h('div', { class: 'g-note' }, x.ok ? x.sub : x.why)));
      list.append(b);
    }
    rows.push(list);
    rows.push(h('button', { class: 'g-btn small', onclick: () => close() }, 'Отмена'));
    const close = g.sheet(rows);
  }

  function startRaid(n) {
    const ok = g.act(s => sim.startRaid(s, cfg(), n, Date.now()), { now: true, reason: 'raid' });
    done(ok, 'level');
  }

  async function longFlight() {
    if (!g.state.run.raid) return deny();
    const r = await g.links.spend('long-flight');
    if (!r.ok) {
      ui.toast(r.off ? 'Связка «Шаги» выключена' : 'Нужна ' + r.need + ' энергия — это ~' + g.fmt(r.need * cfg()['steps.perSteps']) + ' шагов');
      return deny();
    }
    g.act(s => sim.longFlight(s, Date.now()), { now: true, reason: 'spend' });
    g.sfx('level');
    g.flash('energy', 'Долгий полёт', 'Набег вдвое короче');
  }

  /** Before the metro: a long raid or curled on the pile. */
  function offerTrip(status) {
    const p = status && status.passenger;
    if (!p || !p.on || p.state !== 'maybe' || g.readonly) return;
    const key = String(p.since || 'maybe');
    if (seen.offered === key) return;
    seen.offered = key;
    const state = g.state;
    const now = Date.now();
    if (state.run.raid) return;
    let best = 0;
    for (let n = 1; n <= sim.RAIDS.length; n++) {
      if (sim.raidAllowed(state, cfg(), n, now).ok && sim.raidChance(state, cfg(), n) >= 0.6) best = n;
    }
    const rows = [h('h3', {}, 'Скоро поездка?'), note('Пока вы в пути, дракону лучше не скучать: длинный набег или свернуться на куче и сторожить.')];
    if (best) {
      const x = raidLine(state, best, now);
      rows.push(h('button', { class: 'g-btn primary', onclick: () => { close(); startRaid(best); } }, h('span', {}, 'Длинный набег: «' + sim.raidOf(best).title + '»', h('span', { class: 'g-sub' }, x.sub))));
    }
    rows.push(h('button', { class: 'g-btn', onclick: () => { close(); if (!g.state.run.curled) curl(); } }, 'Свернуться на куче'));
    rows.push(h('button', { class: 'g-btn small', onclick: () => close() }, 'Не сейчас'));
    const close = g.sheet(rows);
  }

  // ---- after a sleep and a clutch ------------------------------------------------------------------

  async function woke(layer) {
    const state = g.state;
    const c = cfg();
    const chron = state.meta.chronicle || [];
    const entry = chron[chron.length - 1];
    if (layer === 'sleep') {
      g.achieve('first-sleep');
      if (entry && entry.losses === 0 && entry.wins >= c['ach.flawlessMin']) g.achieve('flawless');
      // The world of the new age and maybe a new knight — from the model's stock or made up.
      if (g.rng.next() < c['world.stockShare']) {
        const w = await g.stock.take('worlds');
        if (w) g.act(s => sim.setWorld(s, w));
      }
      if (g.rng.next() < c['knight.stockShare']) {
        const k = await g.stock.take('knights');
        if (k) g.act(s => sim.addKnight(s, c, k));
      }
    } else {
      g.achieve('clutch');
    }
    // A ballad of the age that ended, sung by the taverns (the model's or made of fragments).
    const item = layer === 'sleep' && entry ? await g.stock.take('ballads') : null;
    const ballad = item ? sim.ballad(item, entry) : null;
    if (ballad) g.act(s => { const e = s.meta.chronicle[s.meta.chronicle.length - 1]; if (e) e.ballad = { title: ballad.title, text: ballad.text }; }, { now: true, reason: 'ballad' });
    const s2 = g.state;
    const rows = [h('h3', {}, layer === 'sleep' ? 'Дракон проснулся: ' + sim.AGES[age(s2)].title : 'Из яйца вылупился ' + sim.SPECIES.find(x => x.id === sim.species(s2)).title.toLowerCase() + ' дракон')];
    rows.push(g.ui.line('Мир века', ''));
    rows.push(worldNote(s2));
    rows.push(g.ui.line(layer === 'sleep' ? 'Древность' : 'Кровь предков', g.fmt(layer === 'sleep' ? sim.antiquity(s2) : sim.blood(s2))));
    if (ballad) rows.push(h('div', { class: 'dh-entry' }, h('div', { class: 't', 'data-raw': '' }, ui.raw(ballad.title)), h('div', { class: 'dh-ballad', 'data-raw': '' }, ui.raw(ballad.text))));
    rows.push(h('button', { class: 'g-btn primary', onclick: () => close() }, 'К куче'));
    const close = g.sheet(rows);
    remember(g.state);
  }

  // ---- the lair ------------------------------------------------------------------------------------

  const DRAGON = {
    up: {
      body: 'M-52 0 C-44 -30 18 -36 42 -16 C54 -6 48 0 34 0 Z',
      head: 'M30 -14 C38 -36 52 -46 66 -42 L80 -36 L66 -30 C58 -28 50 -18 44 -8 Z',
      wing: 'M-14 -24 L-4 -64 L8 -42 L20 -58 L26 -24 Z',
      tail: 'M-50 -2 C-74 0 -84 -16 -70 -26 C-74 -12 -64 -8 -48 -8 Z',
      eye: [66, -38]
    },
    curled: {
      body: 'M-56 0 C-50 -26 30 -30 50 -10 C56 -2 50 0 40 0 Z',
      head: 'M38 -6 C44 -20 58 -24 70 -18 L78 -12 L66 -8 C58 -6 50 -2 46 0 Z',
      wing: 'M-20 -20 C-8 -34 14 -34 24 -20 Z',
      tail: 'M-54 -2 C-70 8 -40 14 -10 8 C-30 8 -48 6 -54 -2 Z',
      eye: [68, -15]
    }
  };

  function dragonNode(pose, x, y, s, curled) {
    const p = DRAGON[pose];
    const grp = svg('g', { transform: 'translate(' + x + ' ' + y + ') scale(' + s + ')', class: 'dh-dragon sp-' + sim.species(g.state) + (curled ? ' curled' : '') });
    ['tail', 'body', 'wing', 'head'].forEach(k => grp.append(svg('path', { d: p[k], class: 'dh-' + k })));
    // The horns and the back spikes: the same on both poses, set by the head.
    const hx = p.eye[0] - 14;
    const hy = p.eye[1] - 3;
    grp.append(svg('path', { class: 'dh-horn', d: 'M' + hx + ' ' + hy + ' L' + (hx - 12) + ' ' + (hy - 12) + ' L' + (hx + 6) + ' ' + (hy - 3) + ' Z' }));
    grp.append(svg('path', { class: 'dh-wing', d: 'M-30 ' + (curled ? -22 : -27) + ' l5 -7 l4 6 l5 -7 l4 7 Z' }));
    grp.append(svg('circle', { cx: p.eye[0], cy: p.eye[1], r: 2.4, class: 'dh-eye' }));
    return grp;
  }

  /** The scene: the cave, the pile in steps by lg H (at most 14 layers and 10 sparks), the dragon, the road. */
  function drawScene(state, now) {
    const wide = g.layout === 'wide';
    const W = wide ? 600 : 360;
    // Wide: the lair takes the whole height of the left column, the drawing follows its shape.
    const shape = view.scene.clientWidth > 0 ? view.scene.clientHeight / view.scene.clientWidth : 0.5;
    const Hh = wide ? Math.round(Math.max(300, Math.min(900, W * shape))) : 150;
    const base = wide ? Hh - 28 : 140;
    const cx = wide ? 190 : 180;
    const lh = wide ? Math.round(10 + (Hh - 300) / 60) : 6;
    const box = '0 0 ' + W + ' ' + Hh;
    if (view.svg.getAttribute('viewBox') !== box) view.svg.setAttribute('viewBox', box);
    const gold = Big.of(state.run.gold);
    const lg = Math.max(0, Big.log10(Big.add(gold, 1)));
    const L = Math.max(1, Math.min(14, Math.round(lg)));
    const width = (wide ? 120 : 70) + (wide ? 16 : 10) * L;
    const nodes = [];
    const top = wide ? Math.round(Hh * 0.08) : 4;
    nodes.push(svg('path', { class: 'dh-cave', d: wide ? 'M0 ' + Hh + ' L0 ' + (top + 70) + ' Q40 ' + top + ' 150 ' + top + ' L250 ' + top + ' Q340 ' + (top + 4) + ' 380 ' + (top + 80) + ' L390 ' + Hh + ' Z' : 'M0 150 L0 46 Q40 6 120 4 L240 4 Q320 6 360 46 L360 150 Z' }));
    // The back wall: strata, the stalactites of the ceiling, the glow of the gold on the stone.
    const cw = wide ? 390 : 360;
    const roof = x => {
      const t = Math.abs(x / cw * 2 - 1);
      return top + (t > 0.45 ? Math.pow((t - 0.45) / 0.55, 2) * (wide ? 80 : 42) : 0);
    };
    for (let i = 1; i <= 3; i++) {
      const y = top + (base - top) * i / 4;
      nodes.push(svg('path', { class: 'dh-strata', d: 'M' + (i * 14) + ' ' + y + ' Q' + (cw * 0.3) + ' ' + (y - 7) + ' ' + (cw * 0.5) + ' ' + (y + 2) + ' T' + (cw - i * 14) + ' ' + (y - 2) }));
    }
    [0.14, 0.24, 0.37, 0.52, 0.63, 0.78, 0.88].forEach((f, i) => {
      const x = cw * f;
      const y = roof(x) - 1;
      const len = (wide ? 22 : 11) + (i * 5 % 4) * (wide ? 7 : 3);
      const half = (wide ? 9 : 5) + i % 2 * 2;
      nodes.push(svg('path', { class: 'dh-rock', d: 'M' + (x - half) + ' ' + y + ' L' + (x + half) + ' ' + y + ' L' + (x + 1) + ' ' + (y + len) + ' Z' }));
    });
    nodes.push(svg('rect', { class: 'dh-ground', x: 0, y: base, width: W, height: Hh - base }));
    // Stones and stray coins on the floor.
    [[0.07, 1], [0.2, 0], [0.31, 1], [0.7, 1], [0.82, 0], [0.93, 1]].forEach(([f, stone], i) => {
      const r = (wide ? 7 : 4) + i % 3;
      if (stone) nodes.push(svg('path', { class: 'dh-rock', d: 'M' + (cw * f - r * 1.6) + ' ' + base + ' L' + (cw * f - r * 0.6) + ' ' + (base - r) + ' L' + (cw * f + r * 0.8) + ' ' + (base - r * 0.8) + ' L' + (cw * f + r * 1.6) + ' ' + base + ' Z' }));
      else nodes.push(svg('ellipse', { class: 'dh-c1', cx: cw * f, cy: base - 1, rx: r * 0.8, ry: r * 0.3 }));
    });
    if (wide) nodes.push(svg('path', { class: 'dh-road', d: 'M598 ' + (base - 36) + ' Q450 ' + (base + 28) + ' 330 ' + (base - 6) }));
    for (let i = 0; i < L; i++) {
      const hb = width / 2 * (1 - i / (L + 1));
      const ht = width / 2 * (1 - (i + 1) / (L + 1));
      const yb = base - i * lh;
      const yt = yb - lh;
      nodes.push(svg('path', { class: 'dh-c' + (1 + i % 3), d: 'M' + (cx - hb) + ' ' + yb + ' L' + (cx + hb) + ' ' + yb + ' L' + (cx + ht) + ' ' + yt + ' L' + (cx - ht) + ' ' + yt + ' Z' }));
      // The rims of the coins on the slope of every layer.
      const n = Math.max(2, Math.round(hb / (wide ? 16 : 11)));
      for (let j = 0; j < n; j++) {
        const x = cx - hb + (j + 0.5 + (i % 2) * 0.3) * (2 * hb / (n + 0.3));
        nodes.push(svg('ellipse', { class: 'dh-rim', cx: x, cy: yb - lh * 0.45, rx: lh * 0.62, ry: lh * 0.3 }));
      }
    }
    // What lies in the pile: gems when the dragon has them, a cup on a tall pile.
    const jewels = Math.min(5, Math.floor(Big.log10(Big.add(sim.gems(state), 1)) * 2 + (Big.gt(sim.gems(state), 0) ? 1 : 0)));
    for (let j = 0; j < jewels; j++) {
      const layer = Math.min(L - 1, j * 2 % Math.max(1, L));
      const half = width / 2 * (1 - (layer + 0.5) / (L + 1));
      const x = cx + Math.cos(j * 1.9 + 0.6) * half * 0.75;
      const y = base - (layer + 0.5) * lh;
      const r = wide ? 5 : 3;
      nodes.push(svg('path', { class: 'dh-jewel', d: 'M' + (x - r) + ' ' + (y - r * 0.3) + ' L' + (x - r * 0.5) + ' ' + (y - r) + ' L' + (x + r * 0.5) + ' ' + (y - r) + ' L' + (x + r) + ' ' + (y - r * 0.3) + ' L' + x + ' ' + (y + r) + ' Z' }));
    }
    if (L >= 5) {
      const u = wide ? 2 : 1.1;
      const x = cx - width * 0.36;
      const y = base - lh;
      nodes.push(svg('path', { class: 'dh-c1', d: 'M' + (x - 5 * u) + ' ' + (y - 12 * u) + ' L' + (x + 5 * u) + ' ' + (y - 12 * u) + ' Q' + (x + 4 * u) + ' ' + (y - 5 * u) + ' ' + (x + u) + ' ' + (y - 5 * u) + ' L' + (x + u) + ' ' + (y - u) + ' L' + (x + 4 * u) + ' ' + y + ' L' + (x - 4 * u) + ' ' + y + ' L' + (x - u) + ' ' + (y - u) + ' L' + (x - u) + ' ' + (y - 5 * u) + ' Q' + (x - 4 * u) + ' ' + (y - 5 * u) + ' ' + (x - 5 * u) + ' ' + (y - 12 * u) + ' Z' }));
    }
    const glitter = sim.glitter(state, cfg());
    const sparks = Math.max(0, Math.min(10, Math.round((glitter - 1) * 5)));
    for (let j = 0; j < sparks; j++) {
      const layer = Math.floor((j * 7 % 10) / 10 * L);
      const half = width / 2 * (1 - (layer + 0.5) / (L + 1));
      const x = cx + Math.sin(j * 2.4) * half * 0.8;
      const y = base - (layer + 0.5) * lh;
      const r = wide ? 4 : 3;
      nodes.push(svg('path', { class: 'dh-spark', d: 'M' + x + ' ' + (y - r) + ' L' + (x + r / 3) + ' ' + y + ' L' + x + ' ' + (y + r) + ' L' + (x - r / 3) + ' ' + y + ' Z' }));
    }
    const s = (wide ? 1.5 : 0.8) * (1 + 0.08 * age(state));
    if (state.run.raid) {
      nodes.push(dragonNode('up', wide ? 520 : 312, wide ? top + 60 : 34, s * 0.35, false));
    } else {
      nodes.push(dragonNode(state.run.curled ? 'curled' : 'up', cx, base - L * lh + 1, s, state.run.curled));
    }
    const k = state.run.knight;
    if (wide && k) {
      const left = (k.at - now) / sim.knightInterval(state, cfg());
      const t = Math.max(0, Math.min(1, 1 - left));
      const x = (1 - t) * (1 - t) * 590 + 2 * (1 - t) * t * 450 + t * t * 334;
      const y = (1 - t) * (1 - t) * (base - 36) + 2 * (1 - t) * t * (base + 28) + t * t * (base - 6);
      const v = sim.knightView(state, cfg(), now);
      const grp = svg('g', { class: 'dh-knight' + (v && v.p < 0.5 ? ' danger' : ''), transform: 'translate(' + x + ' ' + y + ') scale(1.6)' });
      // A knight on the road: the helm with a plume, the cuirass, the shield, the spear.
      grp.append(
        svg('path', { class: 'k-spear', d: 'M9 0 L9 -38' }),
        svg('path', { class: 'k-tip', d: 'M9 -44 L11.5 -37 L6.5 -37 Z' }),
        svg('path', { class: 'k-leg', d: 'M-5 -12 L-6 0 L-2 0 L0 -9 L2 0 L6 0 L5 -12 Z' }),
        svg('path', { class: 'k-body', d: 'M-6 -25 L6 -25 L7 -11 L-7 -11 Z' }),
        svg('path', { class: 'k-helm', d: 'M-5 -30 C-5 -37 5 -37 5 -30 L5 -25 L-5 -25 Z' }),
        svg('path', { class: 'k-plume', d: 'M0 -35.5 C2 -40 7 -40 8 -36 C5 -37.5 3 -36.5 1.5 -34.5 Z' }),
        svg('path', { class: 'k-visor', d: 'M-5 -30.5 L1 -30.5 L1 -28.6 L-5 -28.6 Z' }),
        svg('path', { class: 'k-shield', d: 'M-12 -23 L-3 -23 L-3 -15 C-3 -11.5 -5.5 -9.5 -7.5 -8.5 C-9.5 -9.5 -12 -11.5 -12 -15 Z' }));
      nodes.push(grp);
    }
    view.svg.replaceChildren(...nodes);
  }

  function drawTags(state, now) {
    const tags = [];
    const r = state.run;
    if (r.raid) tags.push(['warm', 'В набеге: ' + time(r.raid.end - now)]);
    else if (r.curled) tags.push(['warm', 'Свернулся на куче']);
    if (num(r.woundedUntil) > now) tags.push(['bad', 'Ранен: ' + time(r.woundedUntil - now)]);
    if (sim.on(state, 'echo', now)) tags.push(['warm', 'Эхо: слуги ×' + cfg()['event.echoMult']]);
    if (sim.on(state, 'tribute', now)) tags.push(['warm', 'Дань короля: ' + time(r.fx.tribute - now)]);
    if (sim.on(state, 'eclipse', now)) tags.push(['warm', 'Затмение: ' + time(r.fx.eclipse - now)]);
    if (sim.on(state, 'molt', now)) tags.push(['bad', 'Линька: ' + time(r.fx.molt - now)]);
    if (sim.on(state, 'quiet', now)) tags.push(['', 'Тихая ночь']);
    const key = tags.map(t => t.join(':')).join('|');
    if (view.over.__v === key) return;
    view.over.__v = key;
    view.over.replaceChildren(...tags.map(t => h('span', { class: 'dh-tag ' + t[0] }, t[1])));
  }

  function num(v) { return Number(v) || 0; }

  function drawDuel(state, now) {
    const c = cfg();
    const v = sim.knightView(state, c, now);
    if (!v) {
      set(view.duelText, 'Сила дракона ' + g.fmt(sim.power(state, c)));
      set(view.duelP, '');
      view.barFill.style.width = '100%';
      set(view.who, 'Рыцари придут, когда куча дойдёт до ' + g.fmt(sim.threshold(state, c)));
      whoArt('pile');
      return;
    }
    const f = 1 / (1 + Math.pow(10, Math.max(-20, Math.min(20, Big.log10(v.K) - Big.log10(v.D)))));
    view.barFill.style.width = (f * 100).toFixed(1) + '%';
    set(view.duelText, 'Сила ' + g.fmt(v.D) + ' vs рыцарь ' + g.fmt(v.K) + (v.members > 1 ? ' ×' + v.members : ''));
    set(view.duelP, pct(v.p));
    view.duelP.className = 'p ' + (v.p < 0.5 ? 'bad' : v.p >= 0.8 ? 'good' : '');
    const left = time(v.at - now);
    // A knight the model made up keeps its own words; the rest of the line is translated piece by piece.
    const extra = v.seen && sim.knightDef(state, v.type).extra;
    const own = text => extra ? text : T(text);
    let who;
    if (v.seen) who = T('{} — через {}', own(v.title), left) + (v.text ? ' (' + own(v.text) + ')' : '');
    else who = T('Рыцарь в пути — через {}, тип виден за минуту', left);
    if (v.gong) who += ' · ' + T('гонг свернёт дракона');
    if (v.purse > 1) who += ' · ' + T('кошелёк {}', g.fmt.mult(v.purse));
    set(view.who, who);
    whoArt(v.seen ? DhArt.knight(v.type) : 'knight');
    if (extra) view.who.setAttribute('data-raw', '');
    else view.who.removeAttribute('data-raw');
  }

  function whoArt(name) {
    if (view.whoArt.__v === name) return;
    view.whoArt.__v = name;
    view.whoArt.replaceChildren(DhArt.el(name, 'sm'));
  }

  function drawEvent(state, now) {
    const e = state.run.event;
    view.event.hidden = !e;
    if (!e) return;
    const ev = sim.EVENTS.find(x => x.id === e.id);
    set(view.eventTitle, ev.title);
    set(view.eventText, ev.text);
    if (view.eventButtons.__v !== e.id + e.at) {
      view.eventButtons.__v = e.id + e.at;
      view.eventArt.replaceChildren(DhArt.el(DhArt.event(e.id)));
      view.eventButtons.replaceChildren(...ev.choices.map(([id, label], i) => h('button', { class: 'g-btn small' + (i === 0 ? ' primary' : ''), onclick: () => answer(id) }, label)));
    }
    set(view.eventLeft, T('Без ответа через {} — «{}»', time(e.until - now), T(ev.choices[ev.choices.length - 1][1].split(':')[0])));
  }

  function answer(id) {
    g.act(s => sim.answer(s, cfg(), id, Date.now(), g.rng), { now: true, reason: 'event' });
    g.sfx('tap');
  }

  // ---- the golden rain -------------------------------------------------------------------------------

  function rain(state, now) {
    const on = sim.on(state, 'rain', now);
    if (on && !rainTimer) {
      rainTimer = setInterval(() => {
        if (!sim.on(g.state, 'rain', Date.now())) {
          clearInterval(rainTimer);
          rainTimer = 0;
          return;
        }
        const width = view.scene.clientWidth - 48;
        const coin = h('button', { class: 'dh-coin', 'aria-label': 'Монета', style: 'left: ' + Math.round(Math.random() * Math.max(0, width)) + 'px' }, GameIcons.el('coin'));
        coin.addEventListener('pointerdown', () => {
          const a = g.act(s => sim.rainCoin(s, cfg(), Date.now()));
          coin.remove();
          if (Big.gt(a, 0)) {
            g.sfx('tap');
            g.buzz('tap');
          }
        });
        coin.addEventListener('animationend', () => coin.remove());
        view.scene.append(coin);
      }, 380);
    }
  }

  // ---- what happened online: fights, raids, trophies, news ---------------------------------------------

  function tell(state) {
    const log = state.run.log || [];
    const fresh = log.filter(e => e.at > seen.log);
    if (fresh.length) seen.log = fresh[fresh.length - 1].at;
    fresh.forEach(e => {
      if (e.k === 'f') {
        const t = knightTitle(state, e.id);
        if (e.w) {
          g.flash('shield', 'Победа: ' + t, '+' + g.fmt(e.a) + ' · шанс был ' + e.p + ' %');
          g.sfx('level');
        } else {
          g.flash('sword', 'Поражение: ' + t, 'Унёс ' + g.fmt(e.a) + ' · дракон ранен');
          g.sfx('deny');
          g.buzz('deny');
        }
      } else if (e.k === 'r') {
        g.flash('map', 'Набег: «' + sim.raidOf(e.n).title + '» — ' + (e.w ? 'удачно' : 'неудачно'), '+' + g.fmt(e.a) + (e.g ? ' и ' + e.g + ' самоцв.' : ''));
        g.sfx(e.w ? 'chest' : 'deny');
      } else if (e.k === 't') {
        g.flash('trophy', 'Трофей: ' + sim.TROPHIES.find(x => x.id === e.id).title, 'Бонус навсегда');
        g.sfx('achievement');
      } else if (e.k === 'x') {
        g.flash('skull', 'Ужас', knightTitle(state, e.id) + ' бежал без боя');
      }
    });
    const n = state.run.news;
    if (n && n.at > seen.news) {
      seen.news = n.at;
      const ev = sim.EVENTS.find(x => x.id === n.id);
      if (ev && !ev.choices) {
        tale(ev).then(text => g.flash('sparkle', ev.title, T(text) + (n.text ? ' ' + T(n.text) : ''), 5000));
      } else if (ev && n.text) {
        g.flash('sparkle', ev.title, n.text, 4000);
      }
    }
  }

  /** A text of the event: one the model wrote (kept a few for each event), else the built-in one. */
  async function tale(ev) {
    const cache = g.state.meta.tales || {};
    const list = cache[ev.id] || [];
    if (!list.length && (g.state.meta.talesAsk || 0) < Date.now()) {
      g.act(s => { s.meta.talesAsk = Date.now() + 60000; });
      const item = await g.stock.take('tales');
      if (item && item.event && item.text) {
        g.act(s => {
          const m = s.meta.tales = s.meta.tales || {};
          m[item.event] = (m[item.event] || []).concat([String(item.text).slice(0, 140)]).slice(-3);
        });
      }
    }
    const now = (g.state.meta.tales || {})[ev.id] || [];
    if (!now.length) return ev.text;
    const text = now[0];
    g.act(s => { s.meta.tales[ev.id] = now.slice(1); });
    return text;
  }

  // ---- the panel of the tabs ------------------------------------------------------------------------

  function structure(state) {
    const r = state.run;
    const parts = [tab, age(state), sim.servantsOpen(state), r.raid ? 1 : 0, r.breath || '', r.terror ? 1 : 0, sim.species(state), buyMode];
    if (tab === 'lair') parts.push(JSON.stringify(state.layers.sleep.state.halls), r.trophies.length, JSON.stringify(state.meta.trophies));
    if (tab === 'chronicle') parts.push((state.meta.chronicle || []).length, JSON.stringify(r.world), (r.log || []).length ? r.log[r.log.length - 1].at : 0, state.layers.clutch.state.next);
    if (tab === 'raids') parts.push(r.q.wings, num(r.woundedUntil) > Date.now() ? 1 : 0);
    if (tab === 'dragon') parts.push(r.knight ? 1 : 0);
    return parts.join('|');
  }

  function drawPanel(state) {
    const key = structure(state);
    if (key !== panelKey) {
      panelKey = key;
      updaters = [];
      const keep = view.panel.scrollTop;
      const build = { servants: buildServants, dragon: buildDragon, raids: buildRaids, lair: buildLair, chronicle: buildChronicle }[tab];
      view.panel.replaceChildren(...build(state).filter(Boolean));
      view.panel.scrollTop = keep;
    }
    updaters.forEach(fn => fn(state));
  }

  function buildServants(state) {
    const c = cfg();
    const out = [];
    const glitterNote = h('div', { class: 'x' });
    updaters.push(s => set(glitterNote, T('Блеск кучи {}: чем выше куча, тем больше несут слуги', g.fmt.mult(sim.glitter(s, c)))));
    out.push(info('pile', glitterNote));
    const seg = h('div', { class: 'dh-seg' }, ...[[1, '×1'], [10, '×10'], [0, 'Макс']].map(([m, label]) => h('button', { class: buyMode === m ? 'on' : '', onclick: () => { buyMode = m; panelKey = ''; drawPanel(g.state); } }, label)));
    out.push(seg);
    const open = sim.servantsOpen(state);
    for (let k = 0; k < open; k++) {
      const x = row({ title: sim.SERVANTS[k].title, art: sim.SERVANTS[k].id, onclick: () => buyServant(k) });
      updaters.push(s => {
        const n = s.run.servants[k];
        const count = buyMode === 0 ? Math.max(1, sim.servantsAffordable(s, c, k)) : buyMode;
        const price = sim.servantCost(s, c, k, count);
        const next = sim.nextMilestone(n, c);
        set(x.t, T(sim.SERVANTS[k].title) + (n ? ' · ' + n : ''));
        set(x.s, T('{} каждый', g.fmt.rate(sim.servantRate(s, c, k))) + (next ? ' · ' + T('до вехи {}: ещё {}, {}', next, next - n, g.fmt.mult(c['servant.milestoneMult'])) : ''));
        set(x.r, (count > 1 ? '×' + count + ' — ' : '') + g.fmt.price(price));
        x.el.disabled = Big.lt(s.run.gold, price);
        mark(x.art, n ? 'got' : '');
      });
      out.push(x.el);
    }
    if (open < sim.SERVANTS.length) out.push(info(sim.SERVANTS[open].id, 'Следующий слуга — ' + sim.SERVANTS[open].title + ': откроется после первого «' + sim.SERVANTS[open - 1].title + '»', 'locked'));
    if (age(state) >= 1) {
      out.push(toggle('Старший кобольд', 'Сам нанимает слуг, пока слуга стоит не больше ' + Math.round(c['auto.buyShare'] * 100) + ' % кучи', s => sim.auto(s).buy, s => { sim.auto(s).buy = !sim.auto(s).buy; }, 'elder'));
    } else {
      out.push(info('elder', 'Старший кобольд (автонайм) придёт с возрастом «Взрослый» — после первого сна.', 'locked'));
    }
    return out;
  }

  function buyServant(k) {
    const count = buyMode === 0 ? sim.servantsAffordable(g.state, cfg(), k) : buyMode;
    const n = count > 0 ? g.act(s => sim.buyServant(s, cfg(), k, count)) : 0;
    done(n > 0);
  }

  function buildDragon(state) {
    const c = cfg();
    const out = [];
    const power = h('div', { class: 'x' });
    updaters.push(s => set(power, T('Сила дракона {} · уровней {}', g.fmt(sim.power(s, c)), sim.levels(s, c)) + (sim.antiquity(s) ? ' · ' + T('Древность {}', g.fmt.mult(1 + c['antiquity.power'] * sim.antiquity(s))) : '')));
    out.push(info('power', power));
    sim.QUALITIES.forEach(q => {
      const x = row({ title: q.title, art: q.id, onclick: () => done(g.act(s => sim.buyQuality(s, c, q.id)), 'level') });
      updaters.push(s => {
        const price = sim.qualityCost(s, c, q.id);
        set(x.t, T('{} · ур. {}', T(q.title), s.run.q[q.id]));
        set(x.s, q.text);
        set(x.r, g.fmt.price(price));
        x.el.disabled = Big.lt(s.run.gold, price);
        mark(x.art, s.run.q[q.id] ? 'got' : '');
      });
      out.push(x.el);
    });
    const a = age(state);
    if (a >= 2) {
      out.push(heading('Дыхание века'));
      if (state.run.breath) {
        const b = sim.BREATHS.find(x => x.id === state.run.breath);
        out.push(info(b.id, T(b.title) + ': ' + T(b.text) + '. ' + T('Новое — в следующем веке.'), 'got'));
      } else {
        sim.BREATHS.forEach(b => {
          const x = row({ title: b.title, art: b.id, onclick: () => done(g.act(s => sim.breathe(s, c, b.id)), 'level') });
          set(x.s, b.text);
          updaters.push(s => {
            set(x.r, T('{} самоцв.', c['breath.cost']));
            x.el.disabled = Big.lt(sim.gems(s), c['breath.cost']);
          });
          out.push(x.el);
        });
      }
      out.push(toggle('Сторожевой гонг', 'Сам сворачивает дракона на куче, когда идёт рыцарь сильнее', s => sim.auto(s).gong, s => { sim.auto(s).gong = !sim.auto(s).gong; }, 'gong'));
    }
    if (a >= 3) {
      const x = row({ title: 'Ужас', art: 'terror', onclick: () => done(g.act(s => sim.terror(s, c, Date.now())), 'level') });
      updaters.push(s => {
        set(x.s, s.run.terror ? 'уже было в этом веке' : 'раз в век: рыцарь у порога бежит без боя');
        x.el.disabled = !!s.run.terror || !s.run.knight;
      });
      out.push(x.el);
    }
    out.push(heading('Возраст и сон'));
    const ageLine = h('div', { class: 'x' });
    const ageBox = info(DhArt.age(a), ageLine);
    updaters.push(s => {
      const i = age(s);
      const next = sim.AGES[i + 1];
      set(ageLine, T('Возраст: {}, снов {}', T(sim.AGES[i].title), sim.sleeps(s)) + (next ? '. ' + T('{} — со сна №{}: {}', T(next.title), c[next.key], T(next.opens)) : ''));
    });
    out.push(ageBox);
    const hm = h('div', { class: 'x' });
    updaters.push(s => set(hm, T('Наибольшая куча века {}. Сон — с кучи 1e{}: Древность = (lg кучи − 6)² / 4, каждая — +{} % золота и +{} % силы', g.fmt(s.run.hmax), c['antiquity.from'], Math.round(c['antiquity.gold'] * 100), Math.round(c['antiquity.power'] * 100))));
    out.push(info('antiquity', hm));
    out.push(view.sleepBtn);
    return out;
  }

  function buildRaids(state) {
    const c = cfg();
    const out = [];
    const r = state.run;
    if (r.raid) {
      const line = note('');
      const fill = h('i', {});
      updaters.push(s => {
        const rd = s.run.raid;
        if (!rd) return;
        set(line, T('В набеге: «{}» — вернётся через {}, добыча {}', T(sim.raidOf(rd.n).title), time(rd.end - Date.now()), g.fmt(rd.loot)));
        fill.style.width = Math.min(100, (Date.now() - rd.start) / Math.max(1, rd.end - rd.start) * 100).toFixed(1) + '%';
      });
      out.push(line, h('div', { class: 'g-progress' }, fill));
      const st = g.links.status().steps;
      if (st && st.on) out.push(h('button', { class: 'g-btn small', id: 'dh-long', onclick: longFlight }, 'Долгий полёт: вдвое короче — ' + c['steps.cost.long-flight'] + ' энергии'));
    }
    const fear = h('div', { class: 'x' });
    updaters.push(s => set(fear, 'Страх ' + Math.round(s.run.fear) + ' из ' + c['fear.max'] + ': набеги богаче (до +' + Math.round(c['fear.lootBonus'] * 100) + ' %), рыцари приходят чаще'));
    out.push(info('fear', fear));
    if (age(state) >= 1) out.push(toggle('Летописец набегов', 'Повторяет последний набег, когда дракон вернулся', s => sim.auto(s).raid, s => { sim.auto(s).raid = !sim.auto(s).raid; }, 'scribe'));
    const top = sim.RAIDS_BY_AGE[age(state)];
    for (let n = 1; n <= sim.RAIDS.length; n++) {
      if (n > top + 1) break;
      const x = row({ title: n + '. ' + T(sim.raidOf(n).title), art: DhArt.raid(n), onclick: () => startRaid(n) });
      updaters.push(s => {
        const l = raidLine(s, n, Date.now());
        set(x.s, l.ok ? l.sub : l.why + (n > top ? '' : ' · ' + time(sim.raidDuration(s, c, n))));
        set(x.r, l.ok ? pct(sim.raidChance(s, c, n)) : '');
        x.el.disabled = !l.ok;
        mark(x.art, n > top ? 'locked' : s.run.raid && s.run.raid.n === n ? 'got' : '');
      });
      out.push(x.el);
    }
    if (top < sim.RAIDS.length) out.push(info('wings', 'Дальние цели открываются с возрастом; после третьей нужны Крылья: по ' + c['raid.wingsPer'] + ' уровня на каждую.', 'locked'));
    return out;
  }

  function buildLair(state) {
    const c = cfg();
    const out = [];
    const gemsLine = h('div', { class: 'x' });
    updaters.push(s => set(gemsLine, 'Самоцветы: ' + g.fmt(sim.gems(s)) + ' — с монастыря, порта, столицы и за трофеи'));
    out.push(info('gem', gemsLine));
    if (age(state) < 1) out.push(info('lock', 'Залы логова открываются с возраста «Взрослый» — после первого сна.'));
    sim.HALLS.forEach(hl => {
      const x = row({ title: hl.title, art: hl.id, onclick: () => done(g.act(s => sim.buyHall(s, c, hl.id)), 'level') });
      updaters.push(s => {
        const lv = sim.hall(s, hl.id);
        const max = sim.hallMax(c, hl.id);
        const full = sim.hallFull(s, c, hl.id);
        // A hall without a top level shows the level alone: it grows as long as the gems last.
        set(x.t, T(hl.title) + ' · ' + (max ? lv + '/' + max : T('ур. {}', lv)));
        set(x.s, hl.text);
        set(x.r, full ? 'всё' : T('{} самоцв.', g.fmt(sim.hallCost(s, c, hl.id))));
        x.el.disabled = age(s) < 1 || full || Big.lt(sim.gems(s), sim.hallCost(s, c, hl.id));
        x.el.classList.toggle('done', full);
        mark(x.art, age(s) < 1 ? 'locked' : lv ? 'got' : '');
      });
      out.push(x.el);
    });
    out.push(note('Сон на век оставляет залам половину уровней. У грота и Тайника есть последний уровень, остальные залы растут без предела: каждый уровень дороже.'));
    out.push(heading('Трофеи — по одному за век на тип'));
    const have = state.meta.trophies || {};
    const grid = h('div', { class: 'dh-trophies' });
    sim.TROPHIES.forEach(t => {
      const n = have[t.id] || 0;
      const kind = t.kind === 'gold' ? 'золото' : t.kind === 'power' ? 'сила' : 'набеги';
      const age2 = state.run.trophies.indexOf(t.id) >= 0;
      grid.append(h('div', { class: 'dh-trophy ' + (n ? 'got' : 'miss') }, DhArt.el(t.id, n ? 'got' : 'locked'), h('div', { class: 'grow' }, h('div', {}, T(t.title) + (n > 1 ? ' ×' + n : '')),
        h('div', { class: 's' }, T(kind) + ' +' + Math.round(c['trophy.' + t.id] * 100 * Math.max(1, n)) + ' %' + (age2 ? ' · ' + T('взят в этом веке') : '')))));
    });
    out.push(grid);
    return out;
  }

  function entryText(e) {
    if (e.kind === 'clutch') return T('Кладка №{}: {} дракон, Кровь +{}', e.n, T(String(e.species || '').toLowerCase()), g.fmt(e.gain));
    const tr = (e.trophies || []).length;
    return T('Наибольшая куча {} · рыцари {} (побед {}) · набегов {}', g.fmt(e.hmax), e.wins + e.losses, e.wins, e.raids) + (tr ? ' · ' + T('трофеев {}', tr) : '') + ' · ' + T('Древность +{}', g.fmt(e.gain));
  }

  function logText(state, e) {
    const who = () => T(knightTitle(state, e.id));
    if (e.k === 'f') return [e.w ? 'good' : 'bad', T(e.w ? 'Победа: {}' : 'Поражение: {}', who()) + ' (' + e.p + ' %), ' + (e.w ? '+' : '−') + g.fmt(e.a)];
    if (e.k === 'r') return [e.w ? 'good' : 'bad', T('Набег «{}»: {}', T(sim.raidOf(e.n).title), T(e.w ? 'удачно' : 'неудачно')) + ', +' + g.fmt(e.a)];
    if (e.k === 't') return ['good', T('Трофей: {}', T(sim.TROPHIES.find(x => x.id === e.id).title))];
    if (e.k === 'x') return ['', T('Ужас: {} бежал', who())];
    if (e.k === 'c') return ['good', T('Дань с дороги: +{}', g.fmt(e.a))];
    const ev = sim.EVENTS.find(x => x.id === e.id);
    return ['', (ev ? T(ev.title) : e.id) + (e.t ? ': ' + T(e.t) : '')];
  }

  function buildChronicle(state) {
    const c = cfg();
    const out = [];
    out.push(heading('Мир века'));
    out.push(info('world', worldNote(state)));
    out.push(heading('Возрасты'));
    const a = age(state);
    sim.AGES.forEach((x, i) => {
      out.push(h('div', { class: 'dh-entry row' + (i === a ? ' on' : '') }, DhArt.el(DhArt.age(i), i === a ? 'got' : i > a ? 'locked' : ''),
        h('div', { class: 'grow' }, h('div', { class: 't' }, T(x.title) + (i === a ? ' — ' + T('сейчас') : '') + ' · ' + T('снов {}', x.key ? c[x.key] : 0)), h('div', {}, x.opens))));
    });
    if (a >= 5 || sim.blood(state) > 0) {
      out.push(heading('Новая кладка'));
      out.push(info('blood', T('Кровь предков: {} — золото {} за каждую. Кладка сбрасывает Древность, возраст и залы; трофеи остаются.', g.fmt(sim.blood(state)), g.fmt.mult(c['blood.mult']))));
      const open = sim.speciesOpen(state, c);
      const next = state.layers.clutch.state.next || 'cave';
      sim.SPECIES.forEach(sp => {
        const ok = open.indexOf(sp.id) >= 0;
        const x = row({ title: T(sp.title) + (sp.id === sim.species(state) ? ' — ' + T('сейчас') : ''), art: DhArt.species(sp.id), onclick: () => done(g.act(s => sim.chooseSpecies(s, c, sp.id)), 'tap') });
        set(x.s, ok ? sp.text : T(sp.text) + ' · ' + T('с Крови {}', c['species.' + sp.id + 'Blood']));
        set(x.r, next === sp.id ? 'следующий' : '');
        x.el.disabled = !ok;
        mark(x.art, !ok ? 'locked' : sp.id === sim.species(state) ? 'got' : '');
        if (next === sp.id) x.el.classList.add('on');
        out.push(x.el);
      });
      out.push(view.clutchBtn);
    }
    const chron = (state.meta.chronicle || []).slice().reverse();
    out.push(heading('Хроника веков'));
    if (!chron.length) out.push(note('Здесь будут века дракона: что он собрал, кто приходил и что о нём поют.'));
    chron.slice(0, 20).forEach(e => {
      const kids = [h('div', { class: 't' }, (e.kind === 'clutch' ? T('Кладка') : T('Век {}', e.n)) + (e.age ? ' · ' + T(e.age) : '')), h('div', {}, entryText(e))];
      // The world of that age: a built-in one in the interface's language, a model's one as written.
      const own = e.world && sim.WORLDS.some(w => w.title === e.world);
      if (e.world) kids.push(own ? h('div', { class: 'dh-note' }, e.world) : h('div', { class: 'dh-note', 'data-raw': '' }, ui.raw(e.world)));
      if (e.ballad) kids.push(h('div', { class: 'dh-ballad', 'data-raw': '' }, ui.raw(e.ballad.title + '. ' + e.ballad.text)));
      out.push(h('div', { class: 'dh-entry row' }, DhArt.el(e.kind === 'clutch' ? 'egg' : 'scroll'), h('div', { class: 'grow' }, kids)));
    });
    out.push(heading('Что было'));
    const log = (state.run.log || []).slice(-14).reverse();
    if (!log.length) out.push(note('Пока тихо.'));
    else out.push(h('div', { class: 'dh-log' }, ...log.map(e => { const [cls, text] = logText(state, e); return h('div', { class: cls }, text); })));
    return out;
  }

  // ---- render ---------------------------------------------------------------------------------------

  function draw(state, force) {
    const c = cfg();
    const now = Date.now();
    const r = state.run;
    if (view.world) {
      const world = DragonScene.model(state, c, { now, mode: tab === 'chronicle' ? 'chronicle' : 'cave' });
      DragonScene.changes(view.worldPrevious, world).forEach(kind => view.world.pulse(kind, null, 2.2));
      view.worldPrevious = world;
      view.world.update(world);
      view.world.node.setAttribute('aria-label', world.label);
    }
    set(view.pile, g.fmt.live(r.gold));
    const inc = Big.mul(sim.income(state, c, now), g.links.mult());
    set(view.rate, g.fmt.rate(inc) + ' · ' + T('блеск {}', g.fmt.mult(sim.glitter(state, c))));
    const gems = sim.gems(state);
    // The age, the gems and the Antiquity: each with its picture, rebuilt only when a value changed.
    const chips = [[DhArt.age(age(state)), T(sim.AGES[age(state)].title)]];
    if (Big.gt(gems, 0)) chips.push(['gem', T('самоцветы {}', g.fmt(gems))]);
    if (sim.antiquity(state)) chips.push(['antiquity', T('Древность {}', g.fmt(sim.antiquity(state)))]);
    const metaKey = chips.map(x => x.join(':')).join('|');
    if (view.meta.__v !== metaKey) {
      view.meta.__v = metaKey;
      view.meta.replaceChildren(...chips.map(([art, text]) => h('span', { class: 'dh-chip' }, h('span', { class: 'dh-chip-art', html: DhArt.svg(art) }), h('span', {}, text))));
    }
    if (force || !view.scene.__at || now - view.scene.__at > 400) {
      view.scene.__at = now;
      if (!view.world) drawScene(state, now);
    }
    drawTags(state, now);
    drawDuel(state, now);
    drawEvent(state, now);
    drawPanel(state);

    if (r.raid) {
      set(view.raidLabel, 'В набеге · ' + time(r.raid.end - now));
      set(view.raidSub, '«' + sim.raidOf(r.raid.n).title + '»');
    } else {
      set(view.raidLabel, 'В набег');
      const best = sim.bestRaid(state, c, now, 1e9, 0.5);
      set(view.raidSub, num(r.woundedUntil) > now ? 'дракон ранен' : best ? '«' + sim.raidOf(best).title + '»' : 'выбрать цель');
    }
    set(view.curlLabel, r.curled ? 'Встать с кучи' : 'Свернуться на куче');
    set(view.curlSub, r.raid ? 'дракон в набеге' : T(r.curled ? 'рыцари бьются с {}' : 'сила в бою {}', g.fmt.mult(c['knight.curl'])));
    view.curlBtn.classList.toggle('curled', !!r.curled);
    view.curlBtn.disabled = !!r.raid;
    view.tabButtons.dragon.classList.toggle('mark', g.prestigeInfo('sleep').hint);

    if (!g.readonly) {
      tell(state);
      rain(state, now);
    }
    achievements(state);
  }

  function achievements(state) {
    const c = cfg();
    const m = state.meta;
    if (num(m.knightsWon) >= 1) g.achieve('first-knight');
    if (num(m.knightsWon) >= c['ach.knights']) g.achieve('hundred-knights');
    if (Big.gte(state.run.hmax, c['ach.hoard'])) g.achieve('trillion');
    if (age(state) >= 3) g.achieve('ancient');
    if (num(m.capital) >= 1) g.achieve('capital');
    const have = m.trophies || {};
    if (sim.TROPHIES.every(t => have[t.id] > 0)) g.achieve('collection');
  }

  function render(state) { draw(state, false); }

  await Game.start({ sim, render, init: build });
})();
