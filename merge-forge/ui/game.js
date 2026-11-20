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
    sheet: null, sheetKind: '', blades: null, monsters: null, events: null, worldIndex: -1, modSerial: -1, modKill: '',
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

  /**
   * What is told about a blade of level n: {title, theme, text, lore}. The artist's words when it drew
   * the blade and wrote them, else those of content/blades.json (the 40 named levels), else none.
   */
  function bladeStory(n) {
    const drawn = view.artOn && view.art[n] ? view.art[n] : null;
    const b = view.blades && n >= 1 && n <= view.blades.list.length ? view.blades.list[n - 1] : null;
    const pick = (f) => String((drawn && drawn[f]) || (b && b[f]) || '');
    return { title: bladeInfo(n).title, theme: pick('theme'), text: pick('text'), lore: pick('lore') };
  }

  function shift(hex, k) {
    const n = parseInt(String(hex).slice(1), 16);
    const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    const out = [c[2], c[0], c[1]].map((x, i) => Math.max(30, Math.min(220, Math.round(x * 0.7 + c[i] * 0.3 + k * 0.2))));
    return '#' + out.map((x) => ('0' + x.toString(16)).slice(-2)).join('');
  }

  /**
   * The world of wave w: {world, round, index, per} — content/monsters.json, twenty waves a world, one
   * after another; after the last the first comes again, its monsters older (round 1, 2, …).
   */
  function worldOf(w) {
    const M = view.monsters;
    if (!M || !M.worlds || !M.worlds.length) return null;
    const per = M.perWorld || 20;
    const index = Math.floor((Math.max(1, w) - 1) / per);
    return { world: M.worlds[index % M.worlds.length], round: Math.floor(index / M.worlds.length), index, per };
  }

  // The pictures for the forms of the monsters named by the stock (prompts/monsters.md).
  const SHAPE_ART = { rat: 'rat', blob: 'slime', bones: 'mummy', golem: 'lavagolem', wolf: 'ashwolf', rider: 'jackal', serpent: 'lollisnake', ghost: 'ghostneon', dragon: 'drake', beast: 'troll' };
  const lowerFirst = (s) => s.charAt(0).toLocaleLowerCase() + s.slice(1);

  /** A monster's name with its age and its modifier: «Золотая серая крыса», «Древний крысиный король». */
  function nameOf(title, gender, mod, round) {
    const M = view.monsters;
    const form = (M.forms || {})[gender] || 0;
    let name = tx(title);
    const old = round > 0 && M.old ? M.old[Math.min(round, M.old.length) - 1] : null;
    if (old) name = tx(old[form]) + ' ' + lowerFirst(name);
    const d = mod && M.mods ? M.mods[mod] : null;
    if (d && d.adj) name = tx(d.adj[form]) + ' ' + lowerFirst(name);
    else if (d && d.pattern) name = tx(d.pattern, name);
    return name;
  }

  /** The monster of wave w: {title, text, art, shape, color, boss, mod, size, hue, world}. */
  function monsterOf(state, w) {
    const c = cfg();
    const boss = sim.isBoss(c, w) && !state.run.farm;
    const current = w === state.run.wave && view.encounter ? view.encounter : null;
    const mod = current ? current.mod || '' : '';
    const size = current && current.size > 0 ? current.size : 1;
    const here = worldOf(w);
    if (!here) return { title: boss ? 'Босс' : 'Чудище', text: '', shape: 'blob', color: '#7a7f86', boss, mod, size };
    const world = here.world;
    const within = (w - 1) % here.per;
    let kind;
    if (boss) {
      const order = world.bosses && world.bosses.length ? world.bosses : [0];
      const k = Math.floor(within / c['boss.every']);
      kind = world.kinds[(order[k % order.length] + here.round) % world.kinds.length];
    } else kind = world.kinds[(w * 3) % world.kinds.length];
    const look = { art: kind.art, color: kind.color, boss, mod, size, hue: here.round ? (here.round * (view.monsters.oldShift || 40)) % 360 : 0, world: world.bg || world.id };
    const block = Math.floor((w - 1) / 10);
    const named = state.meta.names && state.meta.names[(boss ? 'b' : 'm') + block];
    if (named) {
      // Past the worlds' first round the stock names them: its name, the picture of its form.
      const art = MFArt.has('monster', named.shape) ? named.shape : SHAPE_ART[MFMonsters.shapeOf(named.shape, named.title)] || kind.art;
      return Object.assign(look, { title: nameOf(named.title, 'm', '', 0), text: named.text, art, shape: MFMonsters.shapeOf(named.shape, named.title), color: named.color || kind.color, hue: 0 });
    }
    const title = boss ? kind.boss : kind.title;
    return Object.assign(look, { title: nameOf(title, boss ? kind.bg : kind.g, mod, here.round), text: kind.text, shape: MFMonsters.shapeOf('', title) });
  }

  /** What a modifier changes, in a few words: «золото ×5 · здоровье ×3». */
  function modEffect(state, m) {
    if (!m.mod) return '';
    const v = sim.modOf(cfg(), m.mod, m.boss);
    const x = (n) => g.fmt(n, { digits: 2 });
    const parts = [];
    if (v.gold !== 1) parts.push(tx('золото ×{}', x(v.gold)));
    if (v.hp !== 1) parts.push(tx('здоровье ×{}', x(v.hp)));
    if (v.timer !== 1) parts.push(tx('время ×{}', x(v.timer)));
    if (v.walk !== 1 && !m.boss) parts.push(tx(v.walk < 1 ? 'быстрее' : 'медленнее'));
    if (m.mod === 'treasure') parts.push(tx('+{} клинка', v.blades || 0));
    if (m.mod === 'burning') parts.push(tx('разжигает горн'));
    if (m.mod === 'frosty') parts.push(tx('остужает горн'));
    return parts.join(' · ');
  }

  /** Waves past the named bands take their names from the stock (the model), once per ten. */
  function askNames(state) {
    const w = state.run.wave;
    const M = view.monsters;
    const last = M && M.worlds ? M.worlds.length * (M.perWorld || 20) : 200;
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
    // Damage a second as it is now, with the heat of the forge and the timed bonuses.
    view.dps = h('span', { class: 'g-rate mf-dps', id: 'dps' });
    view.coalsText = h('span', { class: 'g-num' });
    view.coals = h('span', { class: 'mf-chip', id: 'coals', hidden: true }, MFArt.el('ui', 'coal', 'mf-chip-ic'), view.coalsText);
    g.el.top.append(view.gold, h('div', { class: 'mf-toprow' }, view.rate, view.dps, view.coals));

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
    // The story of the chosen blade: the album of metals opens on it.
    view.loreBlade = h('button', { class: 'g-btn small mf-lore-btn', id: 'blade-lore', 'aria-label': tx('История клинка'), title: tx('История клинка'), html: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5z"/><path d="M5 19.5A1.5 1.5 0 0 0 6.5 21H19v-3"/><path d="M9 7.5h6M9 11h4"/></svg>',
      onclick: () => { if (!selectionValid()) return; const n = view.selected.level; clearSelection(); openLore(n); } });
    view.bladeActions = h('div', { class: 'mf-blade-actions', hidden: true, role: 'group', 'aria-label': tx('Действия с клинком') }, view.selectionBadge, view.equipBlade, view.feedBlade, view.sellBlade, view.loreBlade);
    view.anvilTools = h('div', { class: 'mf-anvil-tools' }, view.info, view.bladeActions);
    view.anvil = h('div', { class: 'mf-anvil', id: 'anvil' });
    view.anvilWrap = h('div', { class: 'mf-anvil-wrap' }, view.anvilTools, view.anvil);
    g.el.field.append(view.gate, view.anvilWrap);

    view.event = h('div', { class: 'mf-event', id: 'event', hidden: true });
    view.retry = h('button', { class: 'g-btn primary mf-gate-pill mf-retry', id: 'retry', hidden: true, onclick: retry });
    view.cryTime = h('span', { class: 'mf-ab-t g-num' });
    view.cry = h('button', { class: 'mf-ab', id: 'cry', hidden: true, onclick: cry, 'aria-label': tx('Боевой клич'), title: tx('Боевой клич') }, MFArt.el('up', 'cry', 'mf-ab-ic'), view.cryTime);
    view.sort = h('button', { class: 'g-btn small mf-sort', id: 'sort', 'aria-label': tx('Сортировать'), title: tx('По уровню: сильные первыми. Клинки на рунах остаются на месте.'), onclick: sortAnvil }, 'Порядок');
    view.meet = h('button', { class: 'g-btn small', id: 'meet', onclick: () => prepareFight('meet') }, 'Встретить');
    view.autoMeet = h('button', { class: 'g-btn small mf-auto-meet', id: 'meet-auto', 'aria-pressed': 'false', title: tx('Кузня сама встречает каждого врага, когда «Встретить» готово'),
      onclick: () => { g.act((s) => sim.setAutoMeet(s, !s.meta.autoMeet)); g.sfx('tap'); } }, tx('Авто'));
    view.aim = h('button', { class: 'g-btn small', id: 'aim', onclick: () => prepareFight('aim') }, 'Прицелиться');
    view.preparation = h('div', { class: 'mf-preparation', hidden: true }, view.meet, view.autoMeet, view.aim);
    view.outpost = MFOutpostUI.create({ g, sim, onLayout: size, putBlade });
    view.artifacts = window.MFArtifactsUI ? MFArtifactsUI.create({ g, sim, onOpen: () => openMaster('artifacts') }) : null;
    view.anvilTools.append(view.sort);
    // On the scene: the event as a banner, the abilities as round buttons, the heroes open the outpost.
    view.abilities = h('div', { class: 'mf-abilities', role: 'group', 'aria-label': tx('Приёмы') }, view.cry, view.outpost.skillbar);
    if (view.artifacts) {
      view.artifacts.quickElement.classList.add('mf-ab', 'mf-ab-relic');
      view.abilities.append(view.artifacts.quickElement);
    }
    view.outpostBadge = h('span', { class: 'mf-outpost-badge', hidden: true }, '!');
    view.outpostChip = h('span', { class: 'mf-outpost-chip' });
    view.outpostHit = h('button', { class: 'mf-outpost-hit', id: 'outpost', 'aria-label': tx('Форпост'), title: tx('Форпост'), onclick: () => view.outpost.open() }, view.outpostChip, view.outpostBadge);
    view.gateUi = h('div', { class: 'mf-gate-ui' }, view.outpostHit, view.event, view.retry, view.preparation, view.abilities);
    view.gate.append(view.gateUi);

    view.forgeFill = h('i', { class: 'mf-forge-fill' });
    view.heatFill = h('i', { class: 'mf-heat-fill' });
    view.forgeSub = h('span', { class: 'g-sub g-num' });
    view.forge = h('button', { class: 'g-btn primary mf-forge', id: 'forge', onclick: tapForge }, view.heatFill, view.forgeFill, head('forge', 'Горн'), view.forgeSub);
    view.chestSub = h('span', { class: 'g-sub', role: 'status', 'aria-live': 'polite' }, 'продать');
    view.chest = h('button', { class: 'g-btn mf-chest', id: 'chest', onclick: () => g.flash('chest', 'Сундук продажи', 'Перетащите сюда клинок, чтобы продать его за золото') }, head('chest', 'Сундук'), view.chestSub);
    view.upBadge = h('span', { class: 'mf-badge g-num', hidden: true });
    view.upSub = h('span', { class: 'g-sub' }, tx('кузня'));
    view.upBtn = h('button', { class: 'g-btn mf-up-btn', id: 'upgrades', onclick: openUpgrades }, head('upgrades', 'Улучшения'), view.upSub, view.upBadge);
    view.masterSub = h('span', { class: 'g-sub g-num' });
    view.masterBtn = h('button', { class: 'g-btn mf-master-btn', id: 'master', onclick: openMaster, 'aria-label': tx('Горн мастера') }, head('master', 'Мастер'), view.masterSub);
    view.panel = h('div', { class: 'mf-panel', id: 'panel' });
    // One row along the bottom: the chest, the forge in the middle, the upgrades, the master.
    view.bottom = h('div', { class: 'mf-bottom' }, view.chest, view.forge, view.upBtn, view.masterBtn);
    g.el.actions.append(view.panel, view.bottom);

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
    // The row over the anvil (38) and its gap from the cells (15, the plate's 7 inside it).
    const INFO = 53;
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
    // The scene takes more of the screen now that the bottom is one row: the worlds are to be seen.
    const prefer = Math.min(wide ? 320 : 280, Math.round(field.clientHeight * (shape.rows > 5 ? 0.3 : 0.4)));
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
    const resonance = sim.resonance(state, cfg());
    for (const k in view.cells) {
      const i = Number(k);
      const n = grid[i];
      const s = sockets[i];
      const crit = (view.critUntil[i] || 0) > t;
      const lifted = view.drag && view.drag.from === i && view.drag.moving;
      const target = view.drag && view.drag.target === i;
      const foxHint = hint.indexOf(i) >= 0;
      const selected = !!view.selected && view.selected.cell === i && view.selected.level === n;
      const runeTarget = !!view.runeDrag && view.runeDrag.moving && view.runeDrag.target === i;
      const res = n && resonance > 0 && sim.resonates(state, cfg(), i);
      const key = n + '|' + (s ? s.rune + s.index : '') + '|' + crit + '|' + lifted + '|' + target + '|' + foxHint + '|' + selected + '|' + runeTarget + '|' + res;
      if (view.cellKey[i] === key) continue;
      view.cellKey[i] = key;
      const el = view.cells[i];
      el.className = 'mf-cell' + (n ? ' full tier-' + tier(n) : '') + (s ? ' rune rune-' + s.rune : '') + (crit ? ' crit' : '') + (lifted ? ' lifted' : '') + (target ? ' target' : '') + (foxHint ? ' fox-hint' : '') + (selected ? ' selected' : '') + (runeTarget ? ' rune-target' : '') + (res ? ' res' : '');
      el.setAttribute('aria-pressed', String(selected));
      el.setAttribute('aria-label', n ? tx('Клинок ур. {} · выбрать действия', n) : tx('Пустая клетка'));
      el.title = foxHint ? tx('Лиса заметила пару для слияния') : '';
      el.textContent = '';
      if (n) {
        const art = h('span', { class: 'mf-art' });
        putBlade(art, n);
        el.append(art, h('span', { class: 'mf-lvl g-num' }, String(n)));
      }
      if (s) el.append(h('span', { class: 'mf-rune-mark', role: 'button', tabindex: 0, 'data-socket': String(s.index), 'aria-label': tx(RUNE_LABEL[s.rune]) + ' · ' + tx('сменить или перенести'), title: tx('Тап — сменить руну, перетащить — перенести гнездо'), html: MFArt.html('rune', s.rune) }));
    }
  }

  // ---- the runes on the anvil: a tap on a stone picks its rune, a drag moves its socket ----

  function closeRunePicker() {
    if (view.runePicker) view.runePicker.remove();
    view.runePicker = null;
  }

  /** The small picker by the stone of socket `index`: its rune, the same in every socket, «Авто». */
  function openRunePicker(index, anchor) {
    closeRunePicker();
    const state = g.state;
    const c = cfg();
    const socket = sim.sockets(state, c).find((s) => s.index === index);
    if (!socket) return;
    const auto = !!state.run.runeAuto;
    const set = (fn) => { g.act(fn); view.cellKey = {}; g.sfx('tap'); closeRunePicker(); };
    const one = sim.RUNES.map((rune) => h('button', { class: 'mf-rp-btn' + (!auto && socket.rune === rune ? ' on' : ''), 'data-rune': rune, onclick: () => set((s) => sim.setRune(s, cfg(), index, rune)) },
      MFArt.el('rune', rune, 'mf-rp-ic'), h('span', {}, tx(RUNE_TITLE[rune]))));
    const all = sim.RUNES.map((rune) => h('button', { class: 'mf-rp-all', 'data-rune-all': rune, 'aria-label': tx('Во все гнёзда: {}', tx(RUNE_TITLE[rune])), title: tx('Во все гнёзда: {}', tx(RUNE_TITLE[rune])), onclick: () => set((s) => sim.setRuneAll(s, cfg(), rune)) },
      MFArt.el('rune', rune, 'mf-rp-ic')));
    const autoBtn = h('button', { class: 'mf-rp-auto' + (auto ? ' on' : ''), 'data-rune-auto': '', 'aria-pressed': String(auto), onclick: () => set((s) => sim.setRuneAuto(s, cfg(), !auto)) },
      tx('Авто: на боссе лёд, иначе жадность'));
    const box = h('div', { class: 'mf-rune-picker', role: 'dialog', 'aria-label': tx('Гнездо {}', index + 1) },
      h('div', { class: 'mf-rp-head' }, h('strong', {}, tx('Гнездо {}', index + 1)), h('span', { class: 'mf-rp-hint' }, tx('перетащите камень, чтобы перенести'))),
      h('div', { class: 'mf-rp-row' }, ...one),
      h('div', { class: 'mf-rp-row mf-rp-allrow' }, h('span', {}, tx('Во все гнёзда')), ...all),
      autoBtn);
    view.anvilWrap.append(box);
    view.runePicker = box;
    // By the stone, inside the frame of the anvil.
    const wrap = view.anvilWrap.getBoundingClientRect();
    const a = anchor.getBoundingClientRect();
    const w = Math.min(300, wrap.width - 8);
    box.style.width = w + 'px';
    box.style.left = Math.round(Math.max(4, Math.min(wrap.width - w - 4, a.left - wrap.left - w / 2 + a.width / 2))) + 'px';
    const below = a.bottom - wrap.top + 6;
    const height = box.offsetHeight || 170;
    box.style.top = Math.round(below + height > wrap.height ? Math.max(4, a.top - wrap.top - height - 6) : below) + 'px';
    const first = box.querySelector('.mf-rp-btn.on') || box.querySelector('button');
    if (first) first.focus({ preventScroll: true });
  }

  function startRuneDrag(e, mark) {
    e.preventDefault();
    e.stopPropagation();
    const cell = Number(mark.closest('.mf-cell').dataset.cell);
    try { view.anvil.setPointerCapture(e.pointerId); } catch (ignored) { /* the pointer is gone */ }
    view.runeDrag = { index: Number(mark.dataset.socket), from: cell, mark, x: e.clientX, y: e.clientY, id: e.pointerId, moving: false, target: -1, ghost: null };
  }

  function moveRuneDrag(e) {
    const d = view.runeDrag;
    if (!d || d.id !== e.pointerId) return false;
    if (!d.moving && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 8) {
      d.moving = true;
      closeRunePicker();
      d.ghost = h('div', { class: 'mf-ghost mf-rune-ghost', html: d.mark.innerHTML });
      document.body.append(d.ghost);
    }
    if (!d.moving) return true;
    const side = Math.max(28, (view.cell || 64) * 0.5);
    d.ghost.style.width = side + 'px';
    d.ghost.style.height = side + 'px';
    d.ghost.style.left = (e.clientX - side / 2) + 'px';
    d.ghost.style.top = (e.clientY - side / 2) + 'px';
    const to = cellAt(e.clientX, e.clientY);
    d.target = to >= 0 && sim.isOpen(g.state, cfg(), to) ? to : -1;
    renderAnvil(g.state);
    return true;
  }

  function endRuneDrag(e, cancel) {
    const d = view.runeDrag;
    if (!d || d.id !== e.pointerId) return false;
    view.runeDrag = null;
    if (d.ghost) d.ghost.remove();
    view.cellKey = {};
    if (cancel) { g.redraw(); return true; }
    if (!d.moving) { openRunePicker(d.index, d.mark); return true; }
    if (d.target >= 0 && d.target !== d.from && g.act((s) => sim.moveSocket(s, cfg(), d.index, d.target))) {
      g.sfx('merge');
      view.info.textContent = tx('Гнездо перенесено');
      view.infoUntil = now() + 1600;
    }
    g.redraw();
    return true;
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
      if (e.key === 'Escape') { closeRunePicker(); clearSelection(); return; }
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const mark = e.target.closest && e.target.closest('.mf-rune-mark');
      if (mark) { e.preventDefault(); openRunePicker(Number(mark.dataset.socket), mark); return; }
      const cell = e.target.closest('[data-cell]');
      if (!cell || cell.classList.contains('shut')) return;
      e.preventDefault(); tapCell(Number(cell.dataset.cell));
    });
    view.anvil.addEventListener('pointerdown', (e) => {
      const mark = e.target.closest('.mf-rune-mark');
      if (mark) { startRuneDrag(e, mark); return; }
      const el = e.target.closest('.mf-cell');
      if (!el || el.classList.contains('shut')) return;
      const cell = Number(el.dataset.cell);
      if (!g.state.run.grid[cell]) return;
      e.preventDefault();
      try { view.anvil.setPointerCapture(e.pointerId); } catch (ignored) { /* the pointer is gone */ }
      view.drag = { from: cell, x: e.clientX, y: e.clientY, id: e.pointerId, moving: false, target: -1, ghost: null };
    });
    view.anvil.addEventListener('pointermove', (e) => {
      if (moveRuneDrag(e)) return;
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
      if (endRuneDrag(e, cancel)) return;
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
    // A tap anywhere else closes the picker of the runes.
    document.addEventListener('pointerdown', (e) => { if (view.runePicker && !view.runePicker.contains(e.target) && !e.target.closest('.mf-rune-mark')) closeRunePicker(); }, true);
    view.anvilWrap.addEventListener('keydown', (e) => { if (e.key === 'Escape' && view.runePicker) { closeRunePicker(); } });
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

  /** What a perk of the 50th or 100th level gives, in a few words. */
  function perkText(p) {
    const x = (v) => g.fmt(v, { digits: 2 });
    switch (p.kind) {
      case 'critChance': return tx('шанс крита +{} п.п.', x(p.value * 100));
      case 'bossDmg': return tx('урон по боссам ×{}', x(p.value));
      case 'gold': return tx('золото за врагов ×{}', x(p.value));
      case 'bossGold': return tx('золото с боссов ×{}', x(p.value));
      case 'critMult': return tx('сила критов ×{}', x(p.value));
      case 'bossTime': return tx('время босса +{} с', x(p.value));
      case 'forgeSpeed': return tx('горн быстрее ×{}', x(p.value));
      case 'sale': return tx('выручка продаж ×{}', x(p.value));
      case 'offline': return tx('офлайн-доход ×{}', x(p.value));
      case 'events': return tx('события чаще ×{}', x(p.value));
      case 'tap': return tx('ручной удар ×{}', x(p.value));
      case 'dmg': return tx('весь урон ×{}', x(p.value));
      case 'twin': return tx('лишний клинок из горна +{}', pct(p.value));
      default: return '';
    }
  }

  /** Buys `times` levels of an upgrade (Infinity — as many as the gold pays for); a milestone passed is shown. */
  function buyUp(id, times) {
    const from = lvl(g.state, id);
    let bought = 0;
    const want = times || 1;
    g.act((s) => { while (bought < want && sim.buyUp(s, cfg(), id)) bought++; return bought > 0; });
    const ok = bought > 0;
    g.sfx(ok ? 'buy' : 'deny');
    if (ok) g.buzz('buy');
    const passed = ok ? MFUpgradeProgress.crossed(id, from, lvl(g.state, id), cfg()) : [];
    if (passed.length) {
      const last = passed[passed.length - 1];
      const title = (sim.UP.find((u) => u.id === id) || {}).title || '';
      const mult = passed.reduce((m, p) => m * p.mult, 1);
      const perks = passed.filter((p) => p.perk).map((p) => perkText(p.perk));
      g.flash('sparkle', tx('{}: рубеж {}', tx(title), last.at),
        tx('Эффект ×{}', g.fmt(mult, { digits: 2 })) + (perks.length ? ' · ' + tx('особое свойство: {}', perks.join(', ')) : ''));
      g.sfx('clang');
      view.milestoneAt = { id, at: now() };
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

  /** The button of a purchase: the price and, under it, the level it buys (or the levels: «ур. 51–60»). */
  function buyButton(can, price, level, onclick, last) {
    return h('button', { class: 'g-btn small mf-buy' + (can ? ' primary' : ''), disabled: !can, onclick },
      h('span', { class: 'g-num' }, price), h('span', { class: 'g-sub g-num' }, last > level ? tx('ур. {}–{}', level, last) : tx('ур. {}', level)));
  }

  /** How many levels of upgrade id the chosen amount buys now (×1, ×10, as many as the gold pays for) and their price. */
  function bulk(state, c, id) {
    const n = lvl(state, id);
    const room = Math.max(1, sim.upMax(state, c, id) - n);
    const base = c['up.' + id + '.base'];
    const growth = c['up.' + id + '.growth'];
    const amount = view.buyAmount || 1;
    let count = amount === 'max' ? Big.maxBuy(state.run.gold, base, growth, n) : amount;
    count = Math.max(1, Math.min(room, Math.floor(Number(count) || 1), 10000));
    return { count, price: Big.costGeom(base, growth, n, count) };
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
    eye: (c, s) => s && sim.room(c['crit.chance'], c['crit.maxChance'], c['up.eye.step']) <= lvl(s, 'eye')
      ? tx('Сокрушительный удар: шанс, что крит ударит ещё раз, +{}', pct(c['up.eye.over']))
      : tx('Шанс крита +{}', pct(c['up.eye.step'])),
    hand: (c) => tx('Множитель крита +{}', g.fmt(c['up.hand.step'])),
    wide: (c, s) => s && sim.room(sim.startCells(s, c), sim.CELLS, c['up.wide.step']) <= lvl(s, 'wide')
      ? tx('Резонанс: клинок, рядом с которым такой же, бьёт сильнее ещё на {}', pct(c['up.wide.res']))
      : tx('Ещё одна клетка наковальни'),
    twin: (c) => tx('Клинков из горна больше на {}', pct(c['up.twin.step'])),
    melt: (c) => tx('Шанс клинка на уровень выше +{}', pct(c['up.melt.step'])),
    apprentice: () => tx('Сам сливает пары, чаще с каждым уровнем'),
    hourglass: (c) => tx('Таймер босса +{} с', g.fmt(c['up.hourglass.step'], { digits: 2 })),
    hunter: (c) => tx('Золото с босса +{}', pct(c['up.hunter.step'])),
    temper: (c) => tx('Урон клинков от {}-го уровня +{}', c['temper.fromLevel'], pct(c['up.temper.step'])),
    runeMason: () => tx('Ещё одно гнездо руны'),
    runePower: (c) => tx('Руны сильнее на {}', pct(c['up.runePower.step'])),
    caravan: (c) => tx('События чаще на {}', pct(c['up.caravan.step'])),
    night: (c) => tx('Офлайн-доход +{}', pct(c['up.night.step'])),
    cry: (c) => tx('Кнопка: урон +{} на {} с', pct(c['up.cry.step']), c['cry.sec']),
    banner: (c) => tx('Урон +{} за каждую десятку волн', pct(c['up.banner.step'])),
    hammer: () => tx('Ручной удар сильнее; прирост постепенно уменьшается'),
    ember: (c) => tx('При полном жаре залпы чаще ещё на {}', pct(c['up.ember.step'])),
    pilot: (c, s) => s && sim.room(0, c['heat.maxFloor'], c['up.pilot.step']) <= lvl(s, 'pilot')
      ? tx('Перегрев: жар тапов сверх полного копит вспышку — залп сильнее ещё на ×{}', g.fmt(c['up.pilot.burst'], { digits: 2 }))
      : tx('Жар горна не опускается ниже ещё на {}', pct(c['up.pilot.step'])),
    stall: (c) => tx('Продажа: доля цены +{} до полной, и клинки и излишки ковки дороже', pct(c['up.stall.share']))
  };

  /** What the upgrade gives now, in a few words ('' before the first level where there is nothing to say). */
  function nowText(state, id) {
    const c = cfg();
    const n = sim.upgradeEffective(state, c, id);
    if (id === 'bellows') return tx('{} с на клинок', g.fmt(sim.forgeInterval(state, c, 0), { digits: 2 }));
    if (id === 'steel') return tx('горн {}-го уровня', sim.forgeLevel(state, c));
    if (id === 'eye') return sim.overcrit(state, c) > 0 ? tx('крит {} · сокрушительный {}', pct(sim.critChance(state, c)), pct(sim.overcrit(state, c))) : tx('крит {}', pct(sim.critChance(state, c)));
    if (id === 'hand') return tx('крит ×{}', g.fmt(sim.critMult(state, c), { digits: 2 }));
    if (id === 'apprentice') return sim.apprenticeInterval(state, c) ? tx('раз в {} с', g.fmt(sim.apprenticeInterval(state, c) / sim.apprenticeSpeed(state, c), { digits: 1 })) : tx('нет');
    if (id === 'hourglass') return tx('таймер {} с', g.fmt(sim.bossTimer(state, c), { digits: 1 }));
    if (id === 'ember') return tx('полный жар: залп раз в {} с', g.fmt(c['combat.hitSec'] / (1 + sim.heatPower(state, c)), { digits: 2 }));
    if (id === 'pilot') return sim.overheatLevels(state, c) > 0 ? tx('жар не ниже {} · вспышка ×{}', pct(sim.heatFloor(state, c)), g.fmt(sim.burstMult(state, c), { digits: 2 })) : tx('жар не ниже {}', pct(sim.heatFloor(state, c)));
    if (id === 'wide') return sim.resonance(state, c) > 0 ? tx('{} клеток · резонанс +{}', sim.openCells(state, c).length, pct(sim.resonance(state, c))) : tx('{} клеток', sim.openCells(state, c).length);
    if (id === 'night') return tx('офлайн {}', pct(sim.offlineShare(state, c)));
    if (id === 'hammer') return tx('один тап: −{} с', g.fmt(sim.tapSeconds(state, c, now()), { digits: 2 }));
    if (id === 'stall') return tx('продажа {} · ×{}', pct(sim.sellShare(state, c)), g.fmt(sim.saleMult(state, c), { digits: 2 }));
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
      { id: 'battle', title: 'Бой', items: ['sharp', 'eye', 'hand', 'hourglass', 'temper', 'ember', 'pilot', 'runeMason', 'runePower', 'cry', 'banner'] },
      { id: 'income', title: 'Доход', items: ['purse', 'hunter', 'caravan', 'night', 'stall'] }
    ];
    view.upTab = view.upTab || 'forge';
    const group = groups.find(item => item.id === view.upTab) || groups[0];
    const rows = sim.UP.filter((u) => group.items.includes(u.id) && (!u.rune || sim.runesOpen(state, c)));
    const artifacts = state.meta.artifacts && state.meta.artifacts.items || {};
    const effects = state.run.artifacts && state.run.artifacts.effects || {};
    const artifactKey = JSON.stringify([Object.keys(artifacts).map(id => [id, artifacts[id].level, artifacts[id].enabled]), Object.keys(effects).filter(id => effects[id].left > 0).map(id => [id, effects[id].power])]);
    const key = view.upTab + ':' + (view.buyAmount || 1) + ':' + rows.map((u) => {
      const b = sim.upOpen(state, c, u.id) ? bulk(state, c, u.id) : null;
      return lvl(state, u.id) + (sim.upUnlocked(state, c, u.id) ? 'o' : 'l') + (b && Big.gte(state.run.gold, b.price) ? 'y' : 'n') + (b && view.buyAmount === 'max' ? '#' + b.count : '');
    }).join(',') +
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
    // How many levels one press buys.
    const amounts = h('div', { class: 'mf-seg mf-amount', role: 'group', 'aria-label': tx('Сколько покупать') },
      [[1, '×1'], [10, '×10'], ['max', tx('Макс')]].map(([v, label]) => h('button', { class: (view.buyAmount || 1) === v ? 'on' : '', 'data-amount': String(v), 'aria-pressed': String((view.buyAmount || 1) === v),
        onclick: () => { view.buyAmount = v; fillUpgrades(box, true); } }, label)));
    tabs.append(amounts);
    box.append(tabs);
    const blowing = state.run.bellowsUntil > now();
    if (group.id === 'forge') box.append(row({ set: 'ui', id: 'blow', cls: 'mf-blow', title: 'Раздуть горн',
      text: blowing ? tx('Горн раздут ещё {}', g.fmt.time(Math.ceil((state.run.bellowsUntil - now()) / 1000))) : tx('{} мин горн вдвое быстрее, за 1 энергию шагов', cfg()['bellows.minutes']),
      side: h('button', { class: 'g-btn small', id: 'blow', onclick: blow }, GameIcons.el('energy'), 'Раздуть') }));
    // The runes are chosen on the anvil, by a tap on their stones.
    if (group.id === 'battle' && sim.sockets(state, c).length) box.append(h('p', { class: 'g-note mf-rune-note' }, tx('Руны меняются на наковальне: тап по камню руны в клетке.')));
    // An upgrade at its last level is mastered: it leaves the list for the line «Освоено» under it.
    const mastered = rows.filter((u) => sim.upUnlocked(state, c, u.id) && lvl(state, u.id) >= sim.upMax(state, c, u.id));
    rows.filter((u) => mastered.indexOf(u) < 0).forEach((u) => {
      const open = sim.upOpen(state, c, u.id);
      const price = sim.upCost(state, c, u.id);
      const can = open && Big.gte(state.run.gold, price);
      const n = lvl(state, u.id);
      const unlocked = sim.upUnlocked(state, c, u.id);
      const requirement = c['up.' + u.id + '.fromWave'] ? tx('Откроется с волны {}', c['up.' + u.id + '.fromWave']) : '';
      let side;
      if (open) {
        const b = bulk(state, c, u.id);
        side = buyButton(Big.gte(state.run.gold, b.price), g.fmt.price(b.price), n + 1, () => buyUp(u.id, bulk(g.state, cfg(), u.id).count), n + b.count);
        side.dataset.buy = u.id;
      } else side = mark(tx(unlocked ? 'предел' : 'закрыто'), false);
      const progression = sim.upgradeProgress(state, c, u.id);
      let description = DESC[u.id] ? DESC[u.id](c, state) : '';
      if (progression.supported && !['caravan', 'hammer', 'stall'].includes(u.id)) {
        const nextConfig = Object.assign({}, c);
        nextConfig['up.' + u.id + '.step'] *= progression.nextEffective - progression.effective;
        description = tx('Следующий уровень: {}', DESC[u.id](nextConfig));
      }
      let progress;
      if (unlocked && progression.supported && progression.nextAt) {
        const every = progression.every;
        const done = n % every;
        const perkNow = progression.nextPerk && progression.nextPerk.at === progression.nextAt ? progression.nextPerk : null;
        const fresh = view.milestoneAt && view.milestoneAt.id === u.id && now() - view.milestoneAt.at < 2500;
        progress = h('div', { class: 'mf-milestone' + (every - done <= 3 ? ' near' : '') + (progression.nextBig ? ' big' : '') + (fresh ? ' fresh' : ''), 'data-milestone': u.id, 'data-next-level': progression.nextAt },
          h('div', { class: 'mf-milestone-copy' }, h('strong', {}, tx('Рубеж {}', progression.nextAt)),
            h('span', {}, tx('эффект ×{}', g.fmt(progression.nextMult, { digits: 2 })) + (perkNow ? ' + ' + perkText(perkNow) : '')),
            progression.milestone > 1 ? h('span', { class: 'mf-milestone-now' }, tx('сейчас ×{}', g.fmt(progression.milestone, { digits: 2 }))) : null),
          h('div', { class: 'mf-milestone-track', role: 'progressbar', 'aria-label': tx('До рубежа {}', progression.nextAt), 'aria-valuemin': 0, 'aria-valuemax': every, 'aria-valuenow': done }, h('i', { style: 'width:' + (done / every * 100) + '%' })),
          h('div', { class: 'mf-perks' }, progression.perks.map((p) => h('span', { class: 'mf-perk' + (p.on ? ' on' : ''), title: tx('Особое свойство {}-го уровня', p.at) },
            h('b', { class: 'g-num' }, String(p.at)), perkText(p)))));
        progress.title = tx('Каждые {} уровней эффект улучшения умножается, на сотых — сильнее. На 50-м и 100-м уровнях открываются особые свойства.', every);
      }
      box.append(row({ set: 'up', id: u.id, attr: 'data-up', level: n, title: u.title, locked: !unlocked, cls: unlocked ? '' : 'locked', text: unlocked ? description : requirement, now: unlocked ? nowText(state, u.id) : '', progress, side }));
    });
    if (mastered.length) {
      box.append(h('div', { class: 'mf-mastered', id: 'mastered' }, h('div', { class: 'mf-sec' }, tx('Освоено')),
        h('div', { class: 'mf-mastered-list' }, mastered.map((u) => h('span', { class: 'mf-mastered-item', 'data-up': u.id, title: nowText(state, u.id) },
          MFArt.el('up', u.id, 'mf-mastered-ic'), h('span', {}, tx(u.title)), h('b', { class: 'g-num' }, String(lvl(state, u.id))))))));
    }
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

  /** The card of a forged metal: its picture, name, theme, phrase and story. */
  function bladeCard(n) {
    const s = bladeStory(n);
    const art = h('span', { class: 'mf-art' });
    putBlade(art, n);
    return h('article', { class: 'mf-blade-card', id: 'blade-card', 'data-level': n },
      h('div', { class: 'mf-bc-pic' }, art),
      h('div', { class: 'mf-bc-body' },
        h('div', { class: 'mf-bc-head' }, h('h3', {}, s.title), h('span', { class: 'mf-bc-lvl g-num' }, tx('ур. {}', n))),
        s.theme ? h('span', { class: 'mf-bc-theme' }, s.theme) : null,
        s.text ? h('p', { class: 'mf-bc-text' }, s.text) : null,
        s.lore ? h('p', { class: 'mf-bc-lore' }, s.lore)
          : h('p', { class: 'g-note' }, tx('Истории пока нет: её расскажет модель-художник, когда нарисует этот клинок.'))));
  }

  /**
   * The story of the metal of level n in a window over the screen; the arrows, the keys ← → and a swipe
   * go through every metal of the album in order.
   */
  function openLore(n) {
    closeLore();
    const levels = Object.keys(g.state.meta.album || {}).map(Number).filter((x) => x > 0);
    if (levels.indexOf(n) < 0) levels.push(n);
    levels.sort((a, b) => a - b);
    let at = levels.indexOf(n);
    const back = h('div', { class: 'mf-lore-back', id: 'lore', role: 'dialog', 'aria-modal': 'true', 'aria-label': tx('История клинка') });
    const body = h('div', { class: 'mf-lore-body' });
    const count = h('span', { class: 'mf-lore-count g-num' });
    const prev = h('button', { class: 'g-btn mf-lore-nav', id: 'lore-prev', 'aria-label': tx('Предыдущий металл'), html: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>', onclick: () => go(-1) });
    const next = h('button', { class: 'g-btn mf-lore-nav', id: 'lore-next', 'aria-label': tx('Следующий металл'), html: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>', onclick: () => go(1) });
    const close = h('button', { class: 'icon-btn mf-lore-x', id: 'lore-close', 'aria-label': tx('Закрыть историю'), onclick: () => closeLore() }, GameIcons.el('close'));
    const panel = h('div', { class: 'mf-lore' }, close, body, h('div', { class: 'mf-lore-bar' }, prev, count, next));
    back.append(panel);
    function paint() {
      body.textContent = '';
      body.append(bladeCard(levels[at]));
      count.textContent = tx('{} из {}', at + 1, levels.length);
      prev.disabled = at <= 0;
      next.disabled = at >= levels.length - 1;
    }
    function go(d) {
      const to = Math.max(0, Math.min(levels.length - 1, at + d));
      if (to === at) return;
      at = to;
      paint();
      g.sfx('tap');
    }
    const key = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); closeLore(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
    };
    // A swipe across the card: to the left — the next metal, to the right — the one before.
    let swipe = null;
    panel.addEventListener('pointerdown', (e) => { swipe = { x: e.clientX, y: e.clientY }; });
    panel.addEventListener('pointerup', (e) => {
      if (!swipe) return;
      const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
      swipe = null;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1);
    });
    back.addEventListener('click', (e) => { if (e.target === back) closeLore(); });
    document.addEventListener('keydown', key, true);
    view.lore = { back, key, focus: document.activeElement };
    document.body.append(back);
    paint();
    (next.disabled ? close : next).focus({ preventScroll: true });
  }

  function closeLore() {
    const l = view.lore;
    if (!l) return;
    view.lore = null;
    document.removeEventListener('keydown', l.key, true);
    l.back.remove();
    if (l.focus && l.focus.isConnected && l.focus.focus) l.focus.focus({ preventScroll: true });
  }

  function fillAlbum(box, state) {
    const album = state.meta.album || {};
    const top = Math.max(40, state.meta.bestLevel || 1);
    const grid = h('div', { class: 'mf-album', id: 'album' });
    for (let n = 1; n <= top; n++) {
      const seen = !!album[n];
      // A forged metal is a button: its story opens over the album.
      const cell = h(seen ? 'button' : 'div', { class: 'mf-alb' + (seen ? '' : ' unseen'), 'data-level': n,
        'aria-label': seen ? tx('{} · история', bladeInfo(n).title) : null, onclick: seen ? () => openLore(n) : null });
      const art = h('span', { class: 'mf-art' });
      // A level not forged yet shows as the dark outline of its base, never the artist's picture.
      if (seen) putBlade(art, n);
      else art.innerHTML = bladeSvg(n);
      cell.append(art, h('span', { class: 'mf-alb-t' }, seen ? bladeInfo(n).title : '?'), h('span', { class: 'mf-lvl g-num' }, String(n)));
      grid.append(cell);
    }
    box.append(h('p', { class: 'g-note' }, tx('Открыто металлов: {}', Object.keys(album).length) + ' · ' + tx('нажмите на металл, чтобы прочитать его историю')));
    box.append(grid);
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
      view.eventChip = h('span', { class: 'mf-ev-chip g-num' });
      const fold = h('button', { class: 'mf-ev-fold', 'aria-label': tx('Развернуть событие'), onclick: () => { view.eventOpenAt = now(); view.event.classList.remove('folded'); } }, view.eventChip);
      view.event.append(fold, pic, body, ...btns);
      view.event.classList.remove('folded');
      view.event.style.setProperty('--mf-ev-pic', MFArt.has('ev', id) ? 'url(' + MFArt.url('ev', id) + ')' : 'none');
      view.eventOpenAt = t;
    }
    // Left open for a few seconds, it folds to its picture and the time left; a tap opens it again.
    if (key && !view.event.classList.contains('folded') && t - (view.eventOpenAt || t) > 6000) view.event.classList.add('folded');
    if (view.eventLeft) {
      if (key === 'starfall-left' || (e && e.id === 'starfall')) view.eventLeft.textContent = tx('{} с', Math.max(0, Math.ceil((state.run.starfallUntil - t) / 1000)));
      else if (key === 'storm-left' || (e && e.id === 'storm')) view.eventLeft.textContent = tx('ещё {}', state.run.stormLeft);
      else if (e && e.id === 'order') view.eventLeft.textContent = tx('осталось {} · награда {}', g.fmt.time(left), g.fmt(e.reward));
      else view.eventLeft.textContent = tx('{} с', left);
      if (view.eventChip) view.eventChip.textContent = view.eventLeft.textContent.replace(/ · .*$/, '');
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
    view.dps.textContent = tx('{} урон', g.fmt.rate(sim.dps(state, c, t)));
    const coals = sim.coalsAll(state);
    view.coals.hidden = !coals && !sim.ingots(state);
    view.coalsText.textContent = sim.ingots(state) ? tx('угли {} · слитки {}', g.fmt(coals), sim.ingots(state)) : tx('угли {}', g.fmt(coals));

    // the gate
    const boss = sim.isBoss(c, r.wave) && !r.farm;
    const m = monsterOf(state, r.wave);
    view.monster = m;
    view.waveLabel.textContent = tx(r.farm ? 'Фарм · волна {}' : boss ? 'Волна {} · босс' : 'Волна {}', r.wave) + (!boss && r.runup > 0 ? ' · ' + tx('разбег ×{}', r.runup) : '');
    const behavior = { armored: 'Панцирный', regenerator: 'Восстанавливается', channeler: 'Заклинатель' }[encounter.kind];
    view.monsterName.textContent = tx(m.title) + (behavior ? ' · ' + tx(behavior) : '');
    const effect = modEffect(state, m);
    view.monsterName.classList.toggle('rare', !!m.mod && m.mod !== 'regal');
    view.monsterName.title = m.mod && view.monsters && view.monsters.mods[m.mod] ? tx(view.monsters.mods[m.mod].text || '') + (effect ? ' (' + effect + ')' : '') : tx(m.text || '');
    // A new world: its name once, as the road leads there.
    const here = worldOf(r.wave);
    if (here && !r.farm) {
      if (view.worldIndex >= 0 && here.index > view.worldIndex) g.flash('sparkle', tx('Новые земли'), tx(here.world.title));
      view.worldIndex = here.index;
    }
    // A rare monster at the gate, and what one left when beaten.
    const serial = state.run.encounter ? state.run.encounter.serial : 0;
    if (serial !== view.modSerial) {
      if (view.modSerial >= 0 && m.mod && m.mod !== 'regal') {
        view.info.textContent = tx('Редкий враг: {}', m.title) + (effect ? ' — ' + effect : '');
        view.infoUntil = t + 3200;
        g.sfx('clang');
      }
      view.modSerial = serial;
    }
    const lastMod = r.lastMod;
    const modKey = lastMod ? lastMod.serial + ':' + lastMod.id : '';
    if (modKey && modKey !== view.modKill) {
      if (view.modKill && t - (lastMod.at || 0) < 4000) {
        view.floats.push({ x: view.w * 0.62, y: (view.floatTop || 40) + 30, text: '+' + g.fmt(Big.of(lastMod.gold)) + (lastMod.blades ? ' · ' + tx('+{} клинка', lastMod.blades) : ''), crit: true, at: t });
        g.sfx('coin');
      }
      view.modKill = modKey;
    }
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
    // While the foe walks: «Встретить», «Авто», «Прицел»; in the fight «Авто» stays alone, small.
    const prepOpen = r.maxWave >= c['encounter.prepare.fromWave'];
    const preparationShown = prepOpen && (encounter.walking || !!g.state.meta.autoMeet);
    const changedPreparation = view.preparation.hidden === preparationShown;
    view.preparation.hidden = !preparationShown;
    view.preparation.classList.toggle('fighting', !encounter.walking);
    view.autoMeet.setAttribute('aria-pressed', String(!!g.state.meta.autoMeet));
    view.autoMeet.classList.toggle('on', !!g.state.meta.autoMeet);
    view.meet.disabled = !encounter.canPrepare || encounter.meetCooldown > 0 || encounter.remaining <= c['encounter.meet.minSec'];
    view.meet.textContent = encounter.prepared === 'meet' ? tx('Выходим навстречу') : encounter.meetCooldown > 0 ? tx('Встретить · {} с', Math.ceil(encounter.meetCooldown)) : tx('Встретить');
    view.aim.disabled = !encounter.canPrepare;
    view.aim.textContent = encounter.prepared === 'aim' ? tx('Первый залп усилен') : tx('Прицел · +{}', pct(c['encounter.aim.bonus']));
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
      const full = Math.max(1, c['cry.cooldownSec']);
      view.cry.style.setProperty('--p', on ? 1 : wait > 0 ? String(Math.max(0, Math.min(1, 1 - wait / full))) : 1);
      view.cry.classList.toggle('ready', !on && wait <= 0);
      view.cry.classList.toggle('on', on);
      view.cryTime.textContent = on ? tx('{} с', Math.max(0, Math.ceil((r.cryUntil - t) / 1000))) : wait > 0 ? g.fmt.time(wait) : '';
      view.cry.setAttribute('aria-label', on ? tx('Клич звучит') : wait > 0 ? tx('Боевой клич · {}', g.fmt.time(wait)) : tx('Боевой клич'));
    }
    view.abilities.hidden = view.cry.hidden && view.outpost.skillbar.hidden && !(view.artifacts && !view.artifacts.quickElement.hidden);
    renderEvent(state);
    renderOutpostHit();

    // the forge
    const full = !sim.freeCells(state, c).length;
    const remaining = Math.max(0, r.forgeT) / sim.forgeSpeed(state, c);
    const share = Math.max(0, Math.min(1, 1 - Math.max(0, r.forgeT) / sim.forgeInterval(state, c, t)));
    view.forgeFill.style.width = (share * 100) + '%';
    view.forgeSub.textContent = full ? tx('продажа · {} с', g.fmt(remaining, { digits: 1 })) : tx('ур. {} · {} с', sim.forgeLevel(state, c), g.fmt(remaining, { digits: 1 }));
    view.forge.title = tx('Горн куёт сам. Нажатия ускоряют тот же цикл и раздувают жар: пока горн горяч, клинки бьют чаще. Если места нет, новый клинок продаётся.');
    const hot = sim.heat(state, c);
    view.heatFill.style.width = (hot * 100) + '%';
    const over = sim.overheatLevels(state, c) > 0;
    view.forge.classList.toggle('overheat', over && (r.overheat > 0 || r.bursts > 0));
    view.forge.style.setProperty('--mf-over', String(Math.max(0, Math.min(1, r.overheat || 0))));
    view.forge.classList.toggle('burst', r.bursts > 0);
    view.forge.setAttribute('aria-label', hot > 0.005 ? tx('Горн, жар {}, залп раз в {} с', pct(hot), g.fmt(sim.volleySec(state, c, false), { digits: 2 })) : tx('Горн'));
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
    const affordable = sim.UP.filter((u) => (!u.rune || sim.runesOpen(state, c)) && sim.upOpen(state, c, u.id) && Big.gte(r.gold, sim.upCost(state, c, u.id))).length;
    view.upBadge.hidden = !affordable;
    if (affordable) view.upBadge.textContent = affordable > 9 ? '9+' : String(affordable);
    view.upBtn.setAttribute('aria-label', affordable ? tx('Улучшения, доступно {}', affordable) : tx('Улучшения'));

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

  /** The button over the heroes at the gate: a «!» when a hero waits for recruiting or a blade, a chip before the first one. */
  function renderOutpostHit() {
    const model = view.outpost.inspect().model;
    if (!model) return;
    const someone = model.heroes.some((x) => x.active) || model.pets.some((x) => x.selected) || model.dragon.unlocked;
    const waiting = model.heroes.some((x) => (x.available && !x.unlocked) || (x.active && !x.equipment)) || (model.unlocks.pets && !model.pets.some((x) => x.selected) && model.pets.some((x) => x.available));
    view.outpostHit.classList.toggle('empty', !someone);
    view.outpostBadge.hidden = !waiting;
    const chip = someone ? '' : model.nextUnlock ? tx('Форпост · волна {}', model.nextUnlock.wave) : tx('Форпост');
    if (view.outpostChip.textContent !== chip) view.outpostChip.textContent = chip;
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
    const floor = MFArt.gate(ctx, W, H, gx, top, t, view.monster && view.monster.world);
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
    // On the road of the backdrop, never lower than the old line at the bottom.
    const ground = Math.max(top + 24, Math.min(H - 8, floor || H - 8));
    const room = ground - top - 2;
    // In a low gate it stands in its column on the right and grows as it comes nearer.
    const full = view.tight ? view.monSize : Math.max(18, Math.min(room, W * 0.3, 190));
    const size = full * (m.boss ? 1 : 0.86) * (view.tight ? 1 - 0.3 * walk : 1);
    // It stops in the middle of the road: the gate and the squad keep the left of the scene.
    const stand = view.tight ? W - 8 - view.monSize * 0.5 : Math.min(Math.max(gx + 38 + size * 0.56, W * 0.58), W - size * 0.56);
    const far = Math.max(stand, W - size * 0.56);
    const mx = view.tight ? stand : stand + walk * (far - stand);
    const my = ground - size * 0.5;
    view.floatTop = top + 14;
    const hit = view.hitAt ? Math.max(0, 1 - (t - view.hitAt) / 160) : 0;
    MFMonsters.draw(ctx, m, mx, ground + 2, size, view.still ? 0 : t, { walk: walk > 0 && !view.still, hit: walk > 0 ? 0 : hit, alpha: walk > 0 ? Math.min(1, (1 - walk) / 0.12) : 1, accent, room: Math.max(18, room) });
    if (top !== view.headTop) { view.headTop = top; view.gate.style.setProperty('--mf-under-head', Math.round(top) + 'px'); }
    const outpostBox = { x: 4, y: top, width: Math.max(70, Math.min(W * 0.42, mx - size * 0.5 - 8)), height: Math.max(0, ground - top) };
    if (!view.tight) view.outpost.draw(ctx, outpostBox, t / 1000, view.still);
    const boxKey = view.tight ? 'tight' : [outpostBox.x, outpostBox.y, outpostBox.width, outpostBox.height].map(Math.round).join(',');
    if (boxKey !== view.outpostBoxKey) {
      view.outpostBoxKey = boxKey;
      const st = view.outpostHit.style;
      if (view.tight) { st.left = '4px'; st.top = ''; st.bottom = '4px'; st.width = '72px'; st.height = '40px'; }
      else { st.left = Math.round(outpostBox.x) + 'px'; st.top = Math.round(outpostBox.y) + 'px'; st.bottom = ''; st.width = Math.round(outpostBox.width) + 'px'; st.height = Math.round(outpostBox.height) + 'px'; }
    }
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
      const smashed = (r.smashes || []).length > 0;
      const burst = r.lastBurst && r.lastBurst.serial !== view.burstSerial ? r.lastBurst : null;
      if (burst) view.burstSerial = burst.serial;
      if ((smashed || burst) && walk === 0) view.floats.push({ x: Math.max(60, mx - size * 0.2), y: Math.max(view.floatTop + 4, my - size * 0.35), text: burst ? tx('Вспышка ×{}', g.fmt(burst.mult, { digits: 2 })) : tx('Сокрушительный!'), crit: true, at: t });
      if (burst) g.sfx('clang');
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
    config: () => cfg(),
    act: (fn) => g.act(fn),
    cellOf: (i) => view.cells[i] || null
  };

  await Game.start({ sim, render, animate, init: build });
})();
