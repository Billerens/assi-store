// The screen of «Сад»: the beds, the bank of seeds, orders, the album, upgrades, the move. The
// engine (Game.start) gives the frame — g.el.top, g.el.field, g.el.actions (under the thumb) —
// and keeps the state, saves, offline, prestige, sound. The rules are in ../sim.js.
(async function () {
  const h = ui.h;
  const sim = window.GameSim;
  const NS = 'http://www.w3.org/2000/svg';
  const view = { beds: [], sig: [], pollen: -1, newsSeen: 0, albumTab: 'moon' };
  let g = null;
  let upgradesInfo = {};
  let names = { adj: [], place: [], climates: {}, events: {} };

  const COLORS = {
    red: '#E5484D', yellow: '#F5D90A', blue: '#3E7BFA', orange: '#F76B15', purple: '#9B5DE5', green: '#46A758',
    white: '#EDEDED', glow: '#D4FF4F', black: '#2A2A2A', clear: 'none'
  };
  const LEAF = '#3F7D3A';
  const STEM = '#4E8A46';
  const COLOR_TITLES = { red: 'Красный', yellow: 'Жёлтый', blue: 'Синий', orange: 'Оранжевый', purple: 'Фиолетовый', green: 'Зелёный', white: 'Белый', glow: 'Светящийся', black: 'Чёрный', clear: 'Прозрачный' };
  const FAMILY_TITLES = { moon: 'Луноцвет', sun: 'Солнечник', fan: 'Веерник', special: 'Химеры и Ночные' };

  // ---- drawing --------------------------------------------------------------------------------

  function s(tag, attrs, kids) {
    const node = document.createElementNS(NS, tag);
    for (const k in attrs || {}) node.setAttribute(k, attrs[k]);
    (kids || []).forEach((c) => { if (c) node.appendChild(c); });
    return node;
  }

  function svgRoot(size) {
    return s('svg', { viewBox: '0 0 100 100', width: size, height: size, class: 'gd-svg', 'aria-hidden': 'true' });
  }

  function petalShape(shape) {
    if (shape === 'star') return 'M0 0 L-7 -12 L0 -28 L7 -12 Z';
    if (shape === 'crystal') return 'M0 0 L-8 -11 L0 -27 L8 -11 Z';
    return 'M0 0 C-9 -6 -9 -22 0 -26 C9 -22 9 -6 0 0 Z';
  }

  function marks(pattern, stroke) {
    if (pattern === 'stripes') return s('path', { d: 'M-2.5 -6 L-2.5 -20 M2.5 -6 L2.5 -20', stroke, 'stroke-width': 1.6, fill: 'none' });
    if (pattern === 'dots') return s('g', { fill: stroke }, [s('circle', { cx: 0, cy: -9, r: 1.8 }), s('circle', { cx: -2.5, cy: -16, r: 1.6 }), s('circle', { cx: 2.5, cy: -18, r: 1.6 })]);
    if (pattern === 'net') return s('path', { d: 'M-5 -7 L4 -20 M5 -7 L-4 -20 M-6 -13 L6 -13', stroke, 'stroke-width': 1.2, fill: 'none' });
    return null;
  }

  function contrast(color) { return color === 'white' || color === 'yellow' || color === 'glow' ? '#3A3A3A' : '#F2F2F2'; }

  /** A flower of Луноцвет from its look: petals by the shape, fill by the colour, the pattern over it. */
  function flower(ph) {
    const grp = s('g', {});
    const color = ph.color;
    const fill = COLORS[color];
    const edge = ph.pattern === 'gold' ? '#D4A72C' : color === 'black' ? '#8A8A8A' : color === 'clear' ? '#9CC9D9' : 'rgba(0,0,0,0.25)';
    const edgeW = ph.pattern === 'gold' ? 2.6 : 1;
    if (ph.shape === 'bell') {
      const bell = s('path', { d: 'M-17 4 C-19 -10 -14 -27 0 -27 C14 -27 19 -10 17 4 Q8 0 0 5 Q-8 0 -17 4 Z', fill: fill === 'none' ? 'rgba(156,201,217,0.15)' : fill, stroke: edge, 'stroke-width': edgeW });
      grp.appendChild(bell);
      if (ph.color2) grp.appendChild(s('path', { d: 'M0 -27 C14 -27 19 -10 17 4 Q8 0 0 5 Z', fill: COLORS[ph.color2] === 'none' ? 'rgba(156,201,217,0.15)' : COLORS[ph.color2] }));
      const m = marks(ph.pattern, contrast(color));
      if (m) {
        [-8, 0, 8].forEach((x) => {
          const mm = m.cloneNode(true);
          mm.setAttribute('transform', 'translate(' + x + ' 2) scale(0.8)');
          grp.appendChild(mm);
        });
      }
      grp.appendChild(s('circle', { cx: 0, cy: 6, r: 3, fill: '#E8C547' }));
      return grp;
    }
    const count = ph.shape === 'star' ? 5 : ph.shape === 'crystal' ? 6 : 8;
    for (let i = 0; i < count; i++) {
      const c = ph.color2 && i >= count / 2 ? ph.color2 : color;
      const f = COLORS[c] === 'none' ? 'rgba(156,201,217,0.15)' : COLORS[c];
      const petal = s('g', { transform: 'rotate(' + (360 / count) * i + ')' }, [
        s('path', { d: petalShape(ph.shape), fill: f, stroke: edge, 'stroke-width': edgeW }),
        ph.shape === 'crystal' ? s('path', { d: 'M0 -2 L0 -25', stroke: 'rgba(255,255,255,0.5)', 'stroke-width': 1 }) : null,
        marks(ph.pattern, contrast(c))
      ]);
      grp.appendChild(petal);
    }
    grp.appendChild(s('circle', { cx: 0, cy: 0, r: ph.shape === 'round' ? 6 : 5, fill: color === 'glow' ? '#FFFFFF' : '#E8C547' }));
    return grp;
  }

  function berry(ph, x, y) {
    const fill = COLORS[ph.color] === 'none' ? 'rgba(156,201,217,0.25)' : COLORS[ph.color];
    const stroke = ph.color === 'clear' ? '#9CC9D9' : 'rgba(0,0,0,0.3)';
    if (ph.berry === 'long') return s('ellipse', { cx: x, cy: y, rx: 3.2, ry: 6, fill, stroke });
    if (ph.berry === 'star') return s('path', { d: 'M' + x + ' ' + (y - 6) + ' L' + (x + 2) + ' ' + (y - 1.5) + ' L' + (x + 6) + ' ' + (y - 1) + ' L' + (x + 2.5) + ' ' + (y + 2) + ' L' + (x + 4) + ' ' + (y + 6) + ' L' + x + ' ' + (y + 3.5) + ' L' + (x - 4) + ' ' + (y + 6) + ' L' + (x - 2.5) + ' ' + (y + 2) + ' L' + (x - 6) + ' ' + (y - 1) + ' L' + (x - 2) + ' ' + (y - 1.5) + ' Z', fill, stroke });
    return s('circle', { cx: x, cy: y, r: 4.6, fill, stroke });
  }

  function bush(ph, ripe) {
    const g2 = s('g', {});
    g2.appendChild(s('path', { d: 'M50 88 L50 62', stroke: STEM, 'stroke-width': 3 }));
    [[36, 60, 15], [64, 60, 15], [50, 46, 17]].forEach((c) => g2.appendChild(s('circle', { cx: c[0], cy: c[1], r: c[2], fill: LEAF })));
    if (ph.thorns === 'thorny') {
      g2.appendChild(s('path', { d: 'M22 58 L17 56 M24 68 L19 71 M78 58 L83 56 M76 68 L81 71 M44 31 L42 26 M58 31 L60 26', stroke: '#B9C2A8', 'stroke-width': 1.6 }));
    }
    if (ripe) [[38, 52], [56, 40], [62, 60], [44, 66], [50, 54]].forEach((p) => g2.appendChild(berry(ph, p[0], p[1])));
    return g2;
  }

  function leaf(ph) {
    const fill = LEAF;
    const paths = {
      a: 'M50 80 L22 44 Q50 18 78 44 Z',
      b: 'M50 82 C24 62 22 36 38 30 C46 28 50 36 50 40 C50 36 54 28 62 30 C78 36 76 62 50 82 Z',
      c: 'M50 84 C36 64 38 36 50 18 C62 36 64 64 50 84 Z',
      d: 'M50 84 C38 76 24 70 28 58 C20 54 22 42 32 42 C30 30 42 26 48 32 C50 24 56 24 58 32 C66 26 74 34 70 42 C80 44 80 56 72 58 C76 70 62 76 50 84 Z',
      e: 'M50 84 L50 22 M50 70 L32 62 M50 70 L68 62 M50 56 L30 46 M50 56 L70 46 M50 42 L34 32 M50 42 L66 32'
    };
    const grp = s('g', {});
    if (ph.leaf === 'e') {
      grp.appendChild(s('path', { d: paths.e, stroke: fill, 'stroke-width': 7, 'stroke-linecap': 'round', fill: 'none' }));
    } else {
      grp.appendChild(s('path', { d: paths[ph.leaf], fill, stroke: ph.varieg === 'rim' ? '#CFE8A8' : 'none', 'stroke-width': 3 }));
      if (ph.varieg === 'varieg') [[40, 50, 5], [58, 44, 4], [52, 62, 4.5]].forEach((c) => grp.appendChild(s('circle', { cx: c[0], cy: c[1], r: c[2], fill: '#CFE8A8' })));
    }
    const vein = ph.veins === 'red' ? '#D2473F' : '#245A22';
    grp.appendChild(s('path', { d: 'M50 82 L50 34 M50 64 L40 54 M50 64 L60 54 M50 50 L42 42 M50 50 L58 42', stroke: vein, 'stroke-width': 1.6, fill: 'none' }));
    return grp;
  }

  /** The picture of a plant at its stage (0 seed … 3 in bloom, 4 wilted). */
  function plantSvg(p, size) {
    const root = svgRoot(size);
    const ph = sim.phenotype(p.f, p.g, p.m, p.ch);
    const stage = p.dead ? 4 : sim.stageOf(p, g.config);
    root.appendChild(s('path', { d: 'M14 90 Q50 84 86 90', stroke: '#5A4A3A', 'stroke-width': 3, fill: 'none' }));
    if (stage === 0) {
      root.appendChild(s('ellipse', { cx: 50, cy: 86, rx: 5, ry: 3.5, fill: '#8A6E4B' }));
      return root;
    }
    if (stage === 4) {
      root.appendChild(s('path', { d: 'M50 88 Q52 66 66 60', stroke: '#6F6A5F', 'stroke-width': 3, fill: 'none' }));
      root.appendChild(s('path', { d: 'M66 60 L62 74 L70 72 Z M66 60 L74 70 L76 62 Z', fill: '#6F6A5F' }));
      return root;
    }
    if (p.f === 'sun') {
      if (stage === 1) {
        root.appendChild(s('path', { d: 'M50 88 L50 74', stroke: STEM, 'stroke-width': 3 }));
        root.appendChild(s('circle', { cx: 50, cy: 70, r: 7, fill: LEAF }));
      } else root.appendChild(bush(ph, stage === 3));
      return root;
    }
    if (p.f === 'fan') {
      if (stage === 1) {
        root.appendChild(s('path', { d: 'M50 88 L50 72', stroke: STEM, 'stroke-width': 3 }));
        root.appendChild(s('path', { d: 'M50 72 Q40 64 42 58 Q50 62 50 72 Z', fill: LEAF }));
      } else {
        const l = leaf(ph);
        if (stage === 2) l.setAttribute('transform', 'translate(25 30) scale(0.5)');
        root.appendChild(l);
        if (stage === 3 && p.pod) root.appendChild(s('circle', { cx: 70, cy: 30, r: 5, fill: '#B48A4E' }));
      }
      return root;
    }
    const top = stage === 1 ? 72 : 46;
    root.appendChild(s('path', { d: 'M50 88 L50 ' + top, stroke: STEM, 'stroke-width': 3 }));
    root.appendChild(s('path', { d: 'M50 80 Q36 74 34 66 Q46 68 50 80 Z M50 76 Q64 70 66 62 Q54 64 50 76 Z', fill: LEAF }));
    if (stage === 2) {
      root.appendChild(s('ellipse', { cx: 50, cy: 40, rx: 7, ry: 11, fill: LEAF }));
      root.appendChild(s('path', { d: 'M46 32 Q50 24 54 32 Z', fill: COLORS[ph.color] === 'none' ? '#9CC9D9' : COLORS[ph.color] }));
    }
    if (stage === 3) {
      const scale = 0.7 + 0.06 * Math.min(7, ph.size);
      const fl = flower(ph);
      fl.setAttribute('transform', 'translate(50 40) scale(' + scale.toFixed(2) + ')');
      root.appendChild(fl);
    }
    return root;
  }

  /** A small picture of an album key (the album, orders). */
  function keySvg(key, size) {
    const p = key.split('/');
    const root = svgRoot(size);
    if (p[0] === 'moon' || p[0] === 'chimera' || (p[0] === 'night' && p[1] === 'moon')) {
      const ph = p[0] === 'moon' ? { color: p[1], shape: p[2], pattern: p[3] } : p[0] === 'chimera' ? { color: p[1].split('+')[0], color2: p[1].split('+')[1], shape: 'star', pattern: 'solid' } : { color: p[2], shape: 'round', pattern: 'solid' };
      const fl = flower(ph);
      fl.setAttribute('transform', 'translate(50 52) scale(1.5)');
      if (p[0] === 'night') root.appendChild(s('circle', { cx: 50, cy: 52, r: 46, fill: '#1B1F3A' }));
      root.appendChild(fl);
      return root;
    }
    if (p[0] === 'sun' || p[0] === 'night') {
      const ph = p[0] === 'sun' ? { color: p[1], thorns: p[2], berry: p[3] } : { color: p[2], thorns: 'thorny', berry: 'round' };
      if (p[0] === 'night') root.appendChild(s('circle', { cx: 50, cy: 55, r: 46, fill: '#1B1F3A' }));
      root.appendChild(bush(ph, true));
      return root;
    }
    root.appendChild(leaf({ leaf: p[1], varieg: p[2], veins: p[3] }));
    return root;
  }

  // ---- helpers ----------------------------------------------------------------------------------

  function cfg() { return g.config; }
  function now() { return Date.now(); }
  function coins(x) { return g.fmt(x); }

  function toastNo(text) {
    ui.toast(text);
    g.sfx('deny');
    g.buzz('deny');
  }

  function timeText(sec) {
    if (sec < 60) return 'меньше минуты';
    return g.fmt.time(sec);
  }

  function seedTitle(state, seed) {
    if (seed.known || sim.lensLevel(state, cfg()) >= 3) return sim.look(sim.phenotype(seed.f, seed.g, seed.m, seed.ch));
    const parts = [];
    const pk = sim.partialKey(state, seed, cfg()).split('/');
    if (pk[1] !== '*' && seed.f === 'moon') parts.push(COLOR_TITLES[pk[1]].toLowerCase());
    if (pk[2] !== '*' && seed.f === 'moon') parts.push(sim.WORDS.shape[pk[2]][0]);
    return FAMILY_TITLES[seed.f] + (parts.length ? ': ' + parts.join(', ') : ', облик скрыт');
  }

  /** «Цвет R/W · Форма s/r · …» with each gene in its own span, so each one is translated by itself. */
  function genoNode(text) {
    const out = h('span', {});
    String(text).split(' · ').forEach((part, i) => {
      if (i) out.appendChild(document.createTextNode(' · '));
      out.appendChild(h('span', {}, part));
    });
    return out;
  }

  function parentsText(par) {
    if (!par || par === 'start') return 'стартовый набор';
    if (par === 'chest') return 'из сундука';
    if (par === 'wander') return 'от странницы';
    const two = String(par).split('|');
    if (two[0] === two[1]) return 'самоопыление: ' + sim.lookOfKey(two[0]);
    return sim.lookOfKey(two[0]) + ' × ' + sim.lookOfKey(two[1]);
  }

  function varietyName(state, key) {
    const own = state.meta.names && state.meta.names[key];
    if (own && own.name) return own.name;
    return sim.varietyName(key, names);
  }

  // ---- the field ---------------------------------------------------------------------------------

  function build(game) {
    g = game;
    view.coins = h('div', { class: 'g-big', id: 'coins' });
    view.sub = h('div', { class: 'g-note gd-sub', id: 'album-line' });
    g.el.top.append(view.coins, view.sub);

    view.banner = h('div', { class: 'gd-banner', id: 'banner' });
    view.orders = h('button', { class: 'gd-orders', id: 'orders-card', onclick: ordersSheet });
    view.grid = h('div', { class: 'gd-beds', id: 'beds' });
    if (Game.scene && window.GardenScene) {
      view.worldRoot = h('div', { class: 'gd-world' });
      view.world = Game.scene({ parent: view.worldRoot, label: 'Живой сад', width: 1000, height: 620, game: g, draw: GardenScene.draw });
      view.worldNote = h('div', { class: 'gd-world-note' });
      view.worldRoot.append(view.worldNote);
      g.el.field.append(view.worldRoot);
      g.on('offline', () => { view.worldPrevious = null; });
    }
    g.el.field.append(view.banner, view.orders, view.grid);

    view.panel = h('div', { class: 'gd-panel', id: 'panel' });
    view.quick = h('div', { class: 'g-btns gd-quick' });
    view.water = h('button', { class: 'g-btn', id: 'water-all', onclick: waterAll }, GameIcons.el('timer'), h('span', {}, 'Полить все'));
    view.cart = h('button', { class: 'g-btn', id: 'cut-all', onclick: cutAll }, GameIcons.el('hand'), h('span', {}, 'Срезать всё'));
    view.quick.append(view.water, view.cart);
    view.moveSub = h('span', { class: 'g-sub' });
    view.move = h('button', { class: 'g-btn', id: 'move', onclick: moveSheet }, GameIcons.el('map'), h('span', {}, h('span', {}, 'Переезд на новый участок'), view.moveSub));
    view.nav = h('div', { class: 'gd-nav' },
      navButton('bank', 'leaf', 'Банк семян', () => bankSheet(-1)),
      navButton('orders', 'list', 'Заказы', ordersSheet),
      navButton('album', 'book', 'Альбом', albumSheet),
      navButton('upgrades', 'up', 'Улучшения', upgradesSheet));
    g.el.actions.append(view.panel, view.quick, view.move, view.nav);

    g.on('prestige', () => {
      view.pollen = -1;
      view.sig = [];
      g.achieve('first-move');
    });
    g.on('resize', () => { view.sig = []; });
    g.on('offline', () => { view.newsSeen = g.state.run.newsSeq || 0; });
    view.newsSeen = g.state.run.newsSeq || 0;

    fetch('../content/upgrades.json').then((r) => r.json()).then((x) => { upgradesInfo = x; }).catch(() => {});
    fetch('../content/names.json').then((r) => r.json()).then((x) => { names = x; }).catch(() => {});
    fillNames();
  }

  function evPic(id) { return h('span', { class: 'gd-evpic', html: GardenArt.event(id) }); }

  function navButton(id, icon, text, fn) {
    return h('button', { class: 'g-btn gd-navbtn', id: 'nav-' + id, onclick: fn }, GameIcons.el(icon), h('span', {}, text));
  }

  /** Names of varieties prepared by the model while there was network (one a visit). */
  async function fillNames() {
    if (!g.stock.count('names')) return;
    const item = await g.stock.take('names');
    if (item && item.key && item.name) g.act((st) => { st.meta.names[item.key] = { name: String(item.name), text: String(item.text || '') }; });
  }

  function bedNode(i) {
    const node = h('button', { class: 'gd-bed', 'data-bed': i, 'aria-label': 'Грядка ' + (i + 1) });
    node.art = h('div', { class: 'gd-art' });
    node.ring = s('circle', { cx: 50, cy: 50, r: 46, class: 'gd-ring', 'stroke-dasharray': '289', 'stroke-dashoffset': '289', transform: 'rotate(-90 50 50)' });
    const ringSvg = s('svg', { viewBox: '0 0 100 100', class: 'gd-ringsvg', 'aria-hidden': 'true' }, [s('circle', { cx: 50, cy: 50, r: 46, class: 'gd-ringbg' }), node.ring]);
    node.label = h('div', { class: 'gd-label' });
    node.marks = h('div', { class: 'gd-marks' });
    node.append(ringSvg, node.art, node.marks, node.label);
    bindPress(node, i);
    return node;
  }

  /** A tap does the plant's action; a long press takes pollen (or opens the plant's card). */
  function bindPress(node, i) {
    let timer = 0;
    let long = false;
    let x0 = 0;
    let y0 = 0;
    node.addEventListener('pointerdown', (e) => {
      long = false;
      x0 = e.clientX;
      y0 = e.clientY;
      clearTimeout(timer);
      timer = setTimeout(() => {
        long = true;
        longPress(i);
      }, cfg()['pollen.holdMs']);
    });
    const cancel = () => clearTimeout(timer);
    node.addEventListener('pointerup', cancel);
    node.addEventListener('pointercancel', cancel);
    node.addEventListener('pointerleave', cancel);
    node.addEventListener('pointermove', (e) => { if (Math.abs(e.clientX - x0) + Math.abs(e.clientY - y0) > 12) clearTimeout(timer); });
    node.addEventListener('contextmenu', (e) => e.preventDefault());
    node.addEventListener('click', (e) => {
      clearTimeout(timer);
      if (long) {
        long = false;
        e.preventDefault();
        return;
      }
      tapBed(i);
    });
  }

  function tapBed(i) {
    const st = g.state;
    const bed = st.run.beds[i];
    if (!bed) return;
    const p = bed.p;
    const t = now();
    if (bed.slug) {
      const freed = g.act((x) => sim.slugTap(x, i));
      g.sfx('tap');
      g.buzz('tap');
      if (freed) g.flash('leaf', 'Слизни убраны', 'Растение снова растёт');
      return;
    }
    if (view.pollen >= 0) {
      if (!p || p.dead) return cancelPollen();
      const r = g.act((x) => sim.pollinate(x, view.pollen, i, cfg(), t));
      if (!r.ok) return toastNo('Пыльца не перенесена: ' + r.why);
      g.sfx('buy');
      g.buzz('tap');
      g.flash('sparkle', view.pollen === i ? 'Самоопыление' : 'Пыльца перенесена', 'Коробочка даст семена при срезке');
      view.pollen = -1;
      g.redraw();
      return;
    }
    if (!p) return bankSheet(i);
    if (p.dead) {
      g.act((x) => sim.clear(x, i));
      g.sfx('tap');
      return;
    }
    const stage = sim.stageOf(p, cfg());
    if (stage < 3) {
      const ok = g.act((x) => sim.water(x, i, cfg(), t));
      if (ok) {
        g.sfx('tap');
        g.buzz('tap');
      } else plantSheet(i);
      return;
    }
    if (p.f === 'fan') return plantSheet(i);
    if (!sim.canCut(st, p, cfg(), t)) return toastNo('Ночной цветок: срезать можно с ' + cfg()['night.from'] + ':00 до ' + cfg()['night.to'] + ':00');
    cutOne(i);
  }

  function cutOne(i) {
    const p = g.state.run.beds[i].p;
    const night = p.m.indexOf('N') >= 0;
    const r = g.act((x) => sim.cut(x, i, g.rng, cfg(), now()), { now: true, reason: 'cut' });
    if (!r || !r.ok) return;
    g.sfx(r.order ? 'level' : 'buy');
    g.buzz('buy');
    const text = '+' + coins(r.coins) + (r.order ? ' за заказ' : '') + (r.seeds ? ', семян ' + r.seeds : '') + (r.lost ? ', не влезло ' + r.lost : '');
    g.flash(r.order ? 'trophy' : 'coin', r.look, text);
    if (r.seeds) g.achieve('first-cross');
    if (night && new Date().getHours() === 3) g.achieve('midnight');
  }

  function longPress(i) {
    const p = g.state.run.beds[i] && g.state.run.beds[i].p;
    if (p && !p.dead && sim.stageOf(p, cfg()) === 3 && !g.state.run.beds[i].slug) {
      view.pollen = i;
      g.buzz('tap');
      g.sfx('tap');
      g.redraw();
      return;
    }
    if (p) plantSheet(i);
  }

  function cancelPollen() {
    view.pollen = -1;
    g.redraw();
  }

  function waterAll() {
    const n = g.act((x) => sim.waterAll(x, cfg(), now()));
    if (!n) return toastNo('Всё уже полито');
    g.sfx('tap');
    g.flash('timer', 'Полито грядок: ' + n, 'Полив держится ' + sim.waterHours(g.state, cfg()) + ' ч');
  }

  function cutAll() {
    const r = g.act((x) => sim.cutAll(x, g.rng, cfg(), now()), { now: true, reason: 'cut' });
    if (!r.n) return toastNo('Цветущего нет');
    g.sfx('buy');
    g.buzz('buy');
    g.flash('coin', 'Срезано: ' + r.n, '+' + coins(r.coins) + (r.orders ? ', заказов ' + r.orders : '') + (r.seeds ? ', семян ' + r.seeds : ''));
    if (r.seeds) g.achieve('first-cross');
  }

  // ---- sheets --------------------------------------------------------------------------------------

  function plantSheet(i) {
    const st = g.state;
    const bed = st.run.beds[i];
    const p = bed && bed.p;
    if (!p) return;
    const c = cfg();
    const ph = sim.phenotype(p.f, p.g, p.m, p.ch);
    const stage = p.dead ? 4 : sim.stageOf(p, c);
    const lens = sim.lensLevel(st, c);
    const stages = ['семя', 'росток', 'бутон', p.f === 'fan' ? 'лист' : 'цветёт', 'увял'];
    const rows = [h('h3', {}, stage >= 3 || p.known || lens >= 3 ? sim.look(ph) : FAMILY_TITLES[p.f])];
    const art = h('div', { class: 'gd-sheetart' }, plantSvg(p, 120));
    rows.push(art);
    const lines = [g.ui.line('Стадия', stages[stage])];
    if (stage < 3) lines.push(g.ui.line('До следующей стадии', bed.slug ? 'стоит — слизни' : timeText(sim.secondsToNext(st, bed, p, c, now()))));
    if (stage === 3 && p.f !== 'fan') lines.push(g.ui.line('Окно цветения', p.seen === false ? 'ждёт вас' : 'ещё ' + timeText(Math.max(0, p.bl))));
    if (bed.w > now()) lines.push(g.ui.line('Полито', 'ещё ' + timeText((bed.w - now()) / 1000)));
    if (p.f !== 'fan') lines.push(g.ui.line('Цена', coins(sim.priceOf(st, p, c))));
    else lines.push(g.ui.line('Даёт в час', coins(sim.priceOf(st, p, c) * c['fan.incomeShare'])));
    if (stage >= 3 && p.m) lines.push(g.ui.line('Мутация', [p.m.indexOf('G') >= 0 ? 'Гигант' : '', p.m.indexOf('C') >= 0 ? 'Химера' : '', p.m.indexOf('N') >= 0 ? 'Ночной' : ''].filter(Boolean).join(', ')));
    if (p.pod) lines.push(g.ui.line('Коробочка', 'завязалась: ' + sim.podSeeds(st, p, c) + ' семян'));
    lines.push(g.ui.line('Родители', parentsText(p.par)));
    if (lens) lines.push(g.ui.line('Генотип', genoNode(sim.genotypeText(p.f, p.g, lens))));
    else lines.push(g.ui.line('Генотип', 'скрыт — его открывает Лупа генетика'));
    rows.push(h('div', { class: 'g-lines' }, lines));
    const btns = [];
    let close = null;
    if (stage < 3) btns.push(h('button', { class: 'g-btn', onclick: () => { g.act((x) => sim.water(x, i, c, now())); close(); } }, 'Полить'));
    if (stage === 3 && !p.dead) btns.push(h('button', { class: 'g-btn primary', onclick: () => { close(); view.pollen = i; g.redraw(); } }, 'Взять пыльцу'));
    if (sim.lv(st, 'lamp') && st.run.lamp !== i) btns.push(h('button', { class: 'g-btn', onclick: () => { g.act((x) => { x.run.lamp = i; }); close(); } }, 'Лампу сюда'));
    btns.push(h('button', { class: 'g-btn small', onclick: () => { g.act((x) => sim.clear(x, i)); close(); } }, p.f === 'fan' ? 'Убрать Веерник' : 'Выкопать'));
    rows.push(h('div', { class: 'g-btns', style: 'flex-wrap: wrap' }, btns));
    close = g.sheet(rows);
  }

  function bankSheet(target) {
    const st = g.state;
    const c = cfg();
    const t = now();
    let close = null;
    const cap = sim.bankCap(st, c);
    const rows = [h('h3', {}, target >= 0 ? 'Что посадить на грядку ' + (target + 1) : 'Банк семян')];
    rows.push(h('p', { class: 'g-note' }, 'Семян ' + st.run.bank.length + ' из ' + cap + '. ' + (sim.lv(st, 'fridge') ? 'Холодильник: всхожесть не падает.' : 'Всхожесть падает на 5 % в сутки, не ниже 50 %.')));
    const list = st.run.bank.slice().reverse();
    if (!list.length) rows.push(h('p', { class: 'g-note' }, 'Семян нет. Опылите цветущее — коробочка даст семена при срезке; или купите стартовые ниже.'));
    const pick = h('div', { class: 'g-pick', id: 'bank-list' });
    list.slice(0, 120).forEach((seed) => {
      const locked = !sim.unlocked(st, seed.f, c);
      const v = Math.round(sim.viability(st, seed, c, t) * 100);
      pick.appendChild(h('button', {
        class: 'gd-seed', 'data-seed': seed.id, disabled: locked,
        onclick: () => {
          if (target >= 0) {
            plantInto(target, seed.id);
            close();
            return;
          }
          seedSheet(seed);
        }
      }, seedIcon(st, seed), h('span', { class: 'grow' }, h('div', {}, seedTitle(st, seed)), h('div', { class: 'g-note' }, h('span', {}, 'от'), ': ', h('span', {}, parentsText(seed.par)), ' · ', h('span', {}, 'всхожесть ' + v + ' %')))));
    });
    rows.push(pick);
    rows.push(h('h3', {}, 'Лавка'));
    rows.push(h('p', { class: 'g-note' }, 'Семена стартового набора — вернуть в сад цвет или узор, который потерялся. ' + coins(c['shop.price']) + ' монет за семя.'));
    const shop = h('div', { class: 'g-pick', id: 'shop' });
    sim.FAMILY_IDS.forEach((fam) => {
      if (!sim.unlocked(st, fam, c)) return;
      sim.startSeeds(c, fam).forEach((gt, idx) => {
        const fake = { f: fam, g: gt, m: '', ch: '', known: true };
        shop.appendChild(h('button', {
          class: 'gd-seed', onclick: () => {
            const r = g.act((x) => sim.buySeed(x, fam, idx, g.rng, c, now()));
            if (!r.ok) return toastNo(r.why);
            g.sfx('buy');
            close();
            if (target >= 0) plantInto(target, r.seed.id);
            else bankSheet(-1);
          }
        }, seedIcon(st, fake), h('span', { class: 'grow' }, h('div', {}, sim.look(sim.phenotype(fam, gt))), h('div', { class: 'g-note' }, FAMILY_TITLES[fam] + ' · ' + coins(c['shop.price']) + ' монет'))));
      });
    });
    rows.push(shop);
    close = g.sheet(rows);
  }

  function seedIcon(st, seed) {
    const known = seed.known || sim.lensLevel(st, cfg()) >= 3;
    if (known) return h('span', { class: 'gd-seedart' }, keySvg(sim.phenotype(seed.f, seed.g, seed.m, seed.ch).key, 44));
    const root = svgRoot(44);
    root.appendChild(s('ellipse', { cx: 50, cy: 55, rx: 16, ry: 11, fill: seed.f === 'moon' ? '#8A6E4B' : seed.f === 'sun' ? '#A3793A' : '#5F7A3E' }));
    return h('span', { class: 'gd-seedart' }, root);
  }

  function seedSheet(seed) {
    const st = g.state;
    let close = null;
    const free = st.run.beds.findIndex((b) => !b.p);
    const rows = [h('h3', {}, seedTitle(st, seed)), h('div', { class: 'g-lines' },
      g.ui.line('Родители', parentsText(seed.par)),
      g.ui.line('Всхожесть', Math.round(sim.viability(st, seed, cfg(), now()) * 100) + ' %'),
      g.ui.line('Генотип', sim.lensLevel(st, cfg()) ? genoNode(sim.genotypeText(seed.f, seed.g, sim.lensLevel(st, cfg()))) : 'скрыт'))];
    rows.push(h('div', { class: 'g-btns' },
      h('button', { class: 'g-btn primary', disabled: free < 0, onclick: () => { plantInto(free, seed.id); close(); } }, free < 0 ? 'Нет свободной грядки' : 'Посадить'),
      h('button', { class: 'g-btn small', onclick: () => { g.act((x) => sim.discard(x, seed.id)); close(); } }, 'Выбросить')));
    close = g.sheet(rows);
  }

  function plantInto(i, seedId) {
    const r = g.act((x) => sim.plant(x, i, seedId, g.rng, cfg(), now()));
    if (!r.ok) return toastNo(r.why);
    if (r.dud) {
      ui.toast('Семя не взошло — всхожесть была низкой');
      return;
    }
    g.sfx('tap');
    g.buzz('tap');
  }

  /** The picture of what an order asks for: the flower or the bush with the asked colour, shape and pattern. */
  function orderArt(o, size) {
    const root = svgRoot(size);
    if (o.f === 'sun') {
      root.appendChild(bush({ color: o.c || 'white', thorns: o.s || 'smooth', berry: o.p || 'round' }, true));
      return root;
    }
    const fl = flower({ color: o.c || 'white', shape: o.s || 'round', pattern: o.p || 'solid' });
    fl.setAttribute('transform', 'translate(50 52) scale(1.5)');
    root.appendChild(fl);
    return root;
  }

  function ordersSheet() {
    const st = g.state;
    const t = now();
    let close = null;
    const rows = [h('h3', {}, 'Заказы'), h('p', { class: 'g-note' }, 'Срезанный цветок, подходящий под заказ, идёт в него сам: награда — цена × ' + cfg()['orders.mult'] + '.')];
    const list = h('div', { class: 'gd-orderlist' });
    st.run.orders.forEach((slot) => {
      if (slot.o) list.appendChild(h('div', { class: 'gd-orderrow' }, h('span', { class: 'gd-pic' }, orderArt(slot.o, 40)), h('span', { class: 'grow' }, h('div', {}, sim.orderText(slot.o)), h('div', { class: 'g-note' }, slot.o.x || (slot.o.f === 'sun' ? 'Солнечник' : 'Луноцвет')))));
      else list.appendChild(h('div', { class: 'gd-orderrow wait' }, h('span', { class: 'gd-pic', html: GardenArt.up('board') }), h('span', { class: 'grow' }, h('div', {}, 'Новый заказ'), h('div', { class: 'g-note' }, slot.at > t ? 'через ' + timeText((slot.at - t) / 1000) : 'сейчас'))));
    });
    rows.push(list);
    if (g.stock.count('seasonal')) {
      rows.push(h('button', {
        class: 'g-btn', onclick: async () => {
          const item = await g.stock.take('seasonal');
          if (!item) return toastNo('Сезонных заказов пока нет');
          const ok = g.act((x) => sim.seasonalOrder(x, item, now()));
          close();
          if (!ok) return toastNo('Доска заказов занята — выполните один');
          g.flash('calendar', 'Сезонный заказ', item.title || '');
        }
      }, 'Взять сезонный заказ'));
    }
    close = g.sheet(rows);
  }

  function albumSheet() {
    const st = g.state;
    const c = cfg();
    const tabs = ['moon', 'sun', 'fan'];
    if (sim.moves(st) >= c['move.chimeraPage']) tabs.push('special');
    const body = h('div', { class: 'gd-album', id: 'album' });
    const pickRow = h('div', { class: 'gd-tabs' });
    function show(tab) {
      view.albumTab = tab;
      pickRow.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
      body.replaceChildren(albumPage(st, tab));
    }
    tabs.forEach((tab) => pickRow.appendChild(h('button', { class: 'gd-tab', 'data-tab': tab, onclick: () => show(tab) }, FAMILY_TITLES[tab])));
    const total = sim.albumKeys('moon').length + sim.albumKeys('sun').length + sim.albumKeys('fan').length;
    g.sheet([h('h3', {}, 'Альбом: ' + sim.albumCount(st) + ' из ' + total), pickRow, body]);
    show(tabs.indexOf(view.albumTab) >= 0 ? view.albumTab : 'moon');
  }

  function albumPage(st, tab) {
    const out = h('div', {});
    const album = st.meta.album;
    if (tab === 'special') {
      const keys = sim.specialKeys();
      out.appendChild(h('p', { class: 'g-note' }, 'Записано ' + keys.filter((k) => album[k]).length + ' из ' + keys.length + '. Химера — 0,05 % на семя, Ночной — 0,2 %.'));
      out.appendChild(cells(st, keys));
      return out;
    }
    const keys = sim.albumKeys(tab);
    if (!sim.unlocked(st, tab, cfg())) out.appendChild(h('p', { class: 'g-note' }, FAMILY_TITLES[tab] + ' откроется с ' + cfg()[tab === 'sun' ? 'unlock.sun' : 'unlock.fan'] + ' записей альбома (или улучшением «' + (tab === 'sun' ? 'Межа' : 'Оранжерея') + '»).'));
    out.appendChild(h('p', { class: 'g-note' }, 'Записано ' + keys.filter((k) => album[k]).length + ' из ' + keys.length + '.'));
    const groups = {};
    keys.forEach((k) => {
      const head = k.split('/')[1];
      (groups[head] = groups[head] || []).push(k);
    });
    for (const head in groups) {
      const title = tab === 'fan' ? sim.WORDS.leaf[head] + ' лист' : COLOR_TITLES[head];
      out.appendChild(h('div', { class: 'gd-group' }, title + ': ' + groups[head].filter((k) => album[k]).length + ' из ' + groups[head].length));
      out.appendChild(cells(st, groups[head]));
    }
    return out;
  }

  function cells(st, keys) {
    const grid = h('div', { class: 'gd-cells' });
    keys.forEach((k) => {
      const has = !!st.meta.album[k];
      grid.appendChild(h('button', {
        class: 'gd-cell' + (has ? ' on' : ''), 'data-key': k, 'aria-label': has ? sim.lookOfKey(k) : 'Пусто',
        onclick: () => entrySheet(k)
      }, has ? keySvg(k, 40) : h('span', { class: 'gd-q' }, '?')));
    });
    return grid;
  }

  function entrySheet(key) {
    const st = g.state;
    const c = cfg();
    const has = st.meta.album[key];
    const own = st.meta.names && st.meta.names[key];
    const rows = [h('h3', {}, has ? varietyName(st, key) : 'Пустая клетка'), h('div', { class: 'gd-sheetart' }, has ? keySvg(key, 96) : h('span', { class: 'gd-q big' }, '?'))];
    const lines = [g.ui.line('Облик', sim.lookOfKey(key)), g.ui.line('Редкость', String(sim.rarityOfKey(key, c))), g.ui.line('За первую запись', coins(sim.albumReward(key, c)))];
    if (has) lines.push(g.ui.line('Записан', new Date(has).toLocaleDateString()));
    const p = key.split('/');
    if (p[0] === 'moon' && st.meta.records['moon/' + p[1] + '/' + p[2]] !== undefined) lines.push(g.ui.line('Рекорд размера (' + sim.lookOfKey(key).split(' ').slice(0, 2).join(' ').toLowerCase() + ')', sim.WORDS.size[st.meta.records['moon/' + p[1] + '/' + p[2]]]));
    rows.push(h('div', { class: 'g-lines' }, lines));
    if (own && own.text) rows.push(h('p', { class: 'g-note', 'data-raw': '' }, own.text));
    g.sheet(rows);
  }

  const TICK = '<svg class="gd-tick" viewBox="0 0 16 16"><circle cx="8" cy="8" r="8" fill="#46A758"/><path d="M4.5 8.2l2.4 2.4 4.6-5" fill="none" stroke="#101010" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function upgradesSheet() {
    const st = g.state;
    const c = cfg();
    let close = null;
    const rows = [h('h3', {}, 'Улучшения')];
    const pick = h('div', { class: 'g-pick', id: 'upgrades' });
    sim.UPGRADES.forEach((id) => {
      const info = sim.upInfo(st, id, c);
      const meta = upgradesInfo[id] || { title: id, text: '', icon: 'up' };
      const endless = info.max === Infinity;
      const level = endless ? (info.level ? ' · ур. ' + info.level : '') : info.max > 1 ? ' · ур. ' + info.level + ' из ' + info.max : info.level ? ' · есть' : '';
      const done = !endless && info.level >= info.max;
      const b = h('button', {
        class: 'gd-up' + (done ? ' done' : info.level ? ' has' : ''), 'data-up': id, disabled: !info.ok && !info.short,
        onclick: () => {
          const r = g.act((x) => sim.upgrade(x, id, c, now()), { now: true, reason: 'buy' });
          if (!r.ok) return toastNo(r.why);
          g.sfx('buy');
          g.buzz('buy');
          close();
          upgradesSheet();
        }
      }, h('span', { class: 'gd-pic' + (done ? ' done' : ''), html: GardenArt.up(id) + (done ? TICK : '') }), h('span', { class: 'grow' }, h('div', {}, meta.title + level), h('div', { class: 'g-note' }, meta.text)),
      h('span', { class: 'g-num gd-cost' }, info.ok || info.short ? coins(info.cost) : info.why));
      pick.appendChild(b);
    });
    rows.push(pick);
    if (sim.lv(st, 'hive')) {
      rows.push(h('button', { class: 'g-btn', id: 'hive-toggle', onclick: () => { g.act((x) => { x.run.hive = !x.run.hive; }); close(); upgradesSheet(); } }, st.run.hive ? 'Улей работает — выключить' : 'Улей выключен — включить'));
    }
    const steps = g.links.status().steps;
    if (steps && steps.on) {
      rows.push(h('h3', {}, 'Шаги — топливо'));
      rows.push(h('div', { class: 'g-btns', style: 'flex-wrap: wrap' },
        h('button', { class: 'g-btn', id: 'spend-rain', onclick: () => { close(); spend('rain'); } }, 'Дождь: полить всё'),
        h('button', { class: 'g-btn', id: 'spend-bloom', onclick: () => { close(); spend('bloom'); } }, 'Цветение +' + c['spend.bloomHours'] + ' ч')));
    }
    close = g.sheet(rows);
  }

  async function spend(id) {
    const r = await g.links.spend(id);
    if (!r.ok) return toastNo(r.off ? 'Связка «Шаги» выключена' : 'Нужно энергии: ' + r.need + ' — это ~' + g.fmt(r.need * cfg()['steps.perSteps']) + ' шагов');
    if (id === 'rain') {
      g.act((x) => { x.run.beds.forEach((b) => { b.w = Math.max(b.w, now() + sim.waterHours(x, cfg()) * 3600000); }); }, { now: true, reason: 'spend' });
      g.flash('drop', 'Дождь', 'Все грядки политы');
    } else {
      const n = g.act((x) => sim.extendBloom(x, cfg()), { now: true, reason: 'spend' });
      g.flash('timer', 'Цветение продлено', 'Цветущих: ' + n);
    }
    g.sfx('level');
  }

  function moveSheet() {
    const st = g.state;
    const c = cfg();
    const info = g.prestigeInfo(sim.LAYER);
    if (!info.can) {
      const need = c['move.minAlbum'] - sim.albumCount(st);
      return toastNo(need > 0 ? 'Переезд — с ' + c['move.minAlbum'] + ' записей альбома, ещё ' + need : 'Перегной даёт заработок от ' + coins(c['move.divisor']) + ' монет за участок');
    }
    let climate = sim.CLIMATES[0];
    const chosen = new Set(sim.defaultKeep(st, c));
    let close = null;
    const climates = h('div', { class: 'g-pick', id: 'climates' });
    function drawClimates() {
      climates.replaceChildren(...sim.CLIMATES.map((id) => h('button', { class: id === climate ? 'on' : '', 'data-climate': id, onclick: () => { climate = id; drawClimates(); } },
        h('span', { class: 'gd-pic', html: GardenArt.climate(id) }), h('span', { class: 'grow' }, h('div', {}, sim.CLIMATE_TITLES[id]), h('div', { class: 'g-note' }, (names.climates[id] || {}).text || '')))));
    }
    drawClimates();
    const seeds = h('div', { class: 'g-pick', id: 'keep' });
    const counter = h('p', { class: 'g-note' });
    function drawSeeds() {
      counter.textContent = 'С собой ' + chosen.size + ' из ' + c['move.keepSeeds'] + ' семян';
      seeds.replaceChildren(...st.run.bank.slice().reverse().map((seed) => h('button', {
        class: chosen.has(seed.id) ? 'on' : '', onclick: () => {
          if (chosen.has(seed.id)) chosen.delete(seed.id);
          else if (chosen.size < c['move.keepSeeds']) chosen.add(seed.id);
          drawSeeds();
        }
      }, seedIcon(st, seed), h('span', { class: 'grow' }, seedTitle(st, seed)))));
    }
    drawSeeds();
    const go = h('button', {
      class: 'g-btn primary', id: 'move-go', onclick: async () => {
        g.act((x) => { x.meta.movePlan = { climate, seeds: Array.from(chosen) }; });
        close();
        const r = await g.prestige(sim.LAYER);
        if (!r || !r.ok) g.act((x) => { delete x.meta.movePlan; });
      }
    }, 'Дальше');
    close = g.sheet([h('h3', {}, 'Переезд на новый участок'),
      h('p', { class: 'g-note' }, 'Останутся альбом, рекорды, перегной и семена, что возьмёте. Каждый перегной — +' + Math.round(c['humus.growth'] * 100) + ' % к росту и +' + Math.round(c['humus.price'] * 100) + ' % к цене навсегда.'),
      h('h3', {}, 'Климат'), climates, h('h3', {}, 'Семена с собой'), counter, seeds, go]);
  }

  function pollenHelp() {
    let close = null;
    close = g.sheet([h('h3', {}, 'Зацвело: как скрещивать'),
      h('p', {}, 'Держите палец на цветущем цветке — он отдаёт пыльцу. Затем коснитесь второго цветка того же семейства: он завяжет коробочку. Коснуться того же цветка — самоопыление.'),
      h('p', {}, 'При срезке коробочка даёт семена: каждый ген берёт один аллель от каждого родителя. Простое касание цветущего — срезка за монеты.'),
      h('button', { class: 'g-btn primary', id: 'pollen-ok', onclick: () => close() }, 'Понятно')]);
  }

  // ---- the tetrad (the notebook) -------------------------------------------------------------------------

  function tetrad(st, a) {
    const c = cfg();
    const A = st.run.beds[a] && st.run.beds[a].p;
    if (!A || !sim.lv(st, 'notebook') || !sim.lensLevel(st, c)) return null;
    const out = h('div', { class: 'gd-tetrad', id: 'tetrad' }, h('div', { class: 'gd-group' }, 'Тетрадь: пыльца с «' + sim.look(sim.phenotype(A.f, A.g, A.m)) + '»'));
    const rows = [];
    st.run.beds.forEach((b, i) => {
      const B = b.p;
      if (!B || B.f !== A.f || B.pod || B.dead || sim.stageOf(B, c) !== 3) return;
      const off = sim.offspring(A.f, B.g, A.g);
      let fresh = 0;
      off.keys.forEach((k) => { if (!st.meta.album[k.key]) fresh += k.p; });
      const top = off.keys.slice(0, 3).map((k) => sim.lookOfKey(k.key) + ' — ' + Math.round(k.p * 100) + ' %').join('; ');
      rows.push({ i, fresh, node: h('div', { class: 'gd-trow' }, h('div', { class: 'gd-tt' }, 'Грядка ' + (i + 1) + (i === a ? ' (сама)' : '') + ': новых обликов ' + Math.round(fresh * 100) + ' %'), h('div', { class: 'g-note' }, top)) });
    });
    rows.sort((x, y) => y.fresh - x.fresh);
    if (!rows.length) out.appendChild(h('p', { class: 'g-note' }, 'Нет второго цветущего цветка этого семейства.'));
    out.appendChild(h('div', { class: 'gd-trows' }, rows.map((r) => r.node)));
    return out;
  }

  // ---- render ----------------------------------------------------------------------------------------

  function bedSig(st, bed, i) {
    const p = bed.p;
    const t = now();
    if (!p) return 'e';
    const stage = p.dead ? 4 : sim.stageOf(p, cfg());
    return [p.id, stage, p.pod ? 1 : 0, bed.slug, view.pollen === i ? 1 : 0].join(':');
  }

  function drawBed(st, i) {
    const bed = st.run.beds[i];
    const node = view.beds[i];
    const c = cfg();
    const t = now();
    const p = bed.p;
    const sig = bedSig(st, bed, i);
    if (view.sig[i] !== sig) {
      view.sig[i] = sig;
      node.art.replaceChildren(p ? plantSvg(p, 76) : h('span', { class: 'gd-empty' }, GameIcons.el('leaf')));
      node.classList.toggle('pollen', view.pollen === i);
    }
    const stage = p ? (p.dead ? 4 : sim.stageOf(p, c)) : -1;
    const prog = p ? Math.max(0, Math.min(1, sim.stageProgress(p, c))) : 0;
    node.ring.setAttribute('stroke-dashoffset', String(Math.round(289 * (1 - prog))));
    node.ring.classList.toggle('bloom', stage === 3);
    const marks = [];
    if (bed.w > t && p && !p.dead && stage < 3) marks.push('полито');
    if (p && p.pod) marks.push('коробочка');
    if (bed.slug) marks.push('слизни ×' + bed.slug);
    if (sim.lv(st, 'lamp') && st.run.lamp === i) marks.push('лампа');
    if (p && p.m.indexOf('N') >= 0 && stage >= 3) marks.push('ночной');
    const mtext = marks.join(' · ');
    if (node.mtext !== mtext) { node.mtext = mtext; node.marks.textContent = mtext; }
    let label = 'посадить';
    if (p) {
      if (stage === 4) label = 'увял';
      else if (bed.slug) label = 'слизни';
      else if (stage < 3) label = (p.m.indexOf('N') >= 0 && !sim.nightOpen(st, t, c)) ? 'ждёт ночи' : g.fmt.time(Math.max(1, sim.secondsToNext(st, bed, p, c, t)));
      else if (p.f === 'fan') label = 'лист';
      else if (p.seen === false) label = 'цветёт';
      else label = 'цветёт · ' + g.fmt.time(Math.max(0, p.bl));
    }
    if (node.ltext !== label) { node.ltext = label; node.label.textContent = label; }
    node.classList.toggle('dry', !!(p && stage < 3 && bed.w <= t));
    node.classList.toggle('ready', stage === 3);
  }

  function render(st) {
    if (view.world) {
      const world = GardenScene.model(st, cfg(), { now: now(), sim, pollen: view.pollen });
      GardenScene.changes(view.worldPrevious, world).forEach(kind => view.world.pulse(kind, null, 2.2));
      view.worldPrevious = world;
      view.world.update(world);
      view.worldNote.textContent = world.label;
    }
    const c = cfg();
    const t = now();
    const r = st.run;
    const ctext = coins(r.coins) + ' монет';
    if (view.ctext !== ctext) { view.ctext = ctext; view.coins.textContent = ctext; }
    const total = 258;
    const humus = Big.of(st.layers[sim.LAYER].currency, 0);
    const stext = 'Альбом ' + sim.albumCount(st) + ' из ' + total + (Big.isZero(humus) ? '' : ' · перегной ' + g.fmt(humus) + ' (' + sim.bonus(st, sim.LAYER, humus, c) + ')') + (r.climate ? ' · ' + sim.climateTitle(r.climate) : '');
    if (view.stext !== stext) { view.stext = stext; view.sub.textContent = stext; }

    // Beds.
    while (view.beds.length < r.beds.length) {
      const node = bedNode(view.beds.length);
      view.beds.push(node);
      view.grid.appendChild(node);
    }
    while (view.beds.length > r.beds.length) view.beds.pop().remove();
    const width = view.grid.clientWidth || 320;
    const cols = Math.max(3, Math.min(6, Math.floor((width + 8) / 104)));
    if (view.cols !== cols) {
      view.cols = cols;
      view.grid.style.gridTemplateColumns = 'repeat(' + cols + ', minmax(0, 1fr))';
    }
    for (let i = 0; i < r.beds.length; i++) drawBed(st, i);

    // Orders card.
    const open = r.orders.filter((o) => o.o);
    // Each order is its own text node, so another language translates each one by itself.
    const shown = open.slice(0, g.layout === 'narrow' ? 2 : 3).map((o) => sim.orderText(o.o));
    const okey = shown.join('|') + '+' + open.length;
    if (view.ordersKey !== okey) {
      view.ordersKey = okey;
      view.orders.textContent = '';
      if (!shown.length) view.orders.appendChild(ui.h('span', { class: 'gd-orders-h' }, 'Заказов пока нет'));
      else {
        view.orders.appendChild(ui.h('span', { class: 'gd-orders-h' }, 'Заказы'));
        const list = ui.h('span', { class: 'gd-orders-list' });
        shown.forEach((t, i) => {
          list.appendChild(ui.h('span', { class: 'gd-order-chip' }, orderArt(open[i].o, 30), ui.h('span', null, t)));
        });
        if (open.length > shown.length) list.appendChild(ui.h('span', { class: 'gd-order-more' }, 'и ещё ' + (open.length - shown.length)));
        view.orders.appendChild(list);
      }
    }

    // The banner: pollen, events.
    const banner = [];
    if (view.pollen >= 0) {
      const A = r.beds[view.pollen] && r.beds[view.pollen].p;
      if (!A || A.dead || sim.stageOf(A, c) !== 3) view.pollen = -1;
      else banner.push(h('div', { class: 'gd-ban pollen' }, h('span', { class: 'grow' }, 'Пыльца с грядки ' + (view.pollen + 1) + '. Коснитесь цветка, который её примет'), h('button', { class: 'g-btn small', onclick: cancelPollen }, 'Отмена')));
    }
    if (r.ev.storm > t) banner.push(h('div', { class: 'gd-ban' }, evPic('storm'), 'Гроза: мутации ×' + c['event.storm.mu'] + ' ещё ' + g.fmt.time((r.ev.storm - t) / 1000)));
    if (r.ev.warm > t) banner.push(h('div', { class: 'gd-ban' }, evPic('warm'), 'Тёплая ночь: ночные цветы растут и днём, ещё ' + g.fmt.time((r.ev.warm - t) / 1000)));
    if (r.ev.swarm > t) banner.push(h('div', { class: 'gd-ban' }, evPic('swarm'), h('span', { class: 'grow' }, 'Пчелиный рой опыляет как попало'), h('button', { class: 'g-btn small', id: 'chase', onclick: () => { g.act((x) => sim.chase(x, now())); g.sfx('tap'); } }, 'Прогнать')));
    if (r.ev.wander && r.ev.wander.until > t) banner.push(h('div', { class: 'gd-ban' }, evPic('wander'), h('span', { class: 'grow' }, 'Странница: семя с редким геном'), h('button', { class: 'g-btn small', id: 'wander', onclick: buyWander }, 'Купить · ' + coins(r.ev.wander.price))));
    if (sim.lv(st, 'meteo') && r.ev.next && r.ev.next.type && r.ev.next.at > t) banner.push(h('div', { class: 'gd-ban muted' }, 'Метеостанция: ' + sim.EVENT_TITLES[r.ev.next.type] + ' через ' + g.fmt.time((r.ev.next.at - t) / 1000)));
    const sigB = banner.map((b) => b.textContent).join('|');
    if (view.bannerSig !== sigB) {
      view.bannerSig = sigB;
      view.banner.replaceChildren(...banner);
    }

    // Quick buttons.
    const growing = r.beds.some((b) => b.p && !b.p.dead && sim.stageOf(b.p, c) < 3 && b.w <= t);
    view.water.hidden = !growing;
    view.quick.hidden = !growing && !sim.lv(st, 'cart');
    view.cart.hidden = !sim.lv(st, 'cart');
    view.move.hidden = sim.albumCount(st) < c['move.minAlbum'] && !sim.moves(st);
    if (!view.move.hidden && t - (view.moveAt || 0) > 1000) {
      view.moveAt = t;
      const info = g.prestigeInfo(sim.LAYER);
      view.move.disabled = !info.can;
      view.moveSub.textContent = info.can ? '+' + g.fmt(info.gain) + ' перегноя' : 'нужно заработать ' + coins(c['move.divisor']) + ' монет за участок';
    }

    // The wide panel: the notebook in pollen mode, otherwise the album by family.
    if (g.layout === 'wide') {
      const tet = view.pollen >= 0 ? tetrad(st, view.pollen) : null;
      const sigP = tet ? 't' + view.pollen + ':' + tet.textContent : 'a' + sim.albumCount(st);
      if (view.panelSig !== sigP) {
        view.panelSig = sigP;
        view.panel.replaceChildren(tet || albumPanel(st));
      }
    } else if (view.panelSig) {
      view.panelSig = '';
      view.panel.replaceChildren();
    }
    if (g.layout !== 'wide' && view.pollen >= 0 && sim.lv(st, 'notebook') && !view.tetradShown) {
      view.tetradShown = true;
      const tet = tetrad(st, view.pollen);
      if (tet) view.banner.appendChild(h('button', { class: 'g-btn small', id: 'tetrad-open', onclick: () => g.sheet([tetrad(g.state, view.pollen) || h('p', {}, 'Пыльца сброшена')]) }, 'Тетрадь'));
    }
    if (view.pollen < 0) view.tetradShown = false;

    news(st);
    achievements(st);
  }

  function albumPanel(st) {
    const out = h('div', { class: 'gd-side' }, h('div', { class: 'gd-group' }, 'Альбом'));
    ['moon', 'sun', 'fan'].forEach((fam) => {
      const keys = sim.albumKeys(fam);
      const n = keys.filter((k) => st.meta.album[k]).length;
      out.appendChild(h('div', { class: 'gd-famline' }, h('span', { class: 'grow' }, FAMILY_TITLES[fam]), h('span', { class: 'g-num' }, n + ' из ' + keys.length)));
      out.appendChild(h('div', { class: 'g-progress' }, h('i', { style: 'width: ' + Math.round((n / keys.length) * 100) + '%' })));
    });
    const recent = Object.keys(st.meta.album).sort((a, b) => st.meta.album[b] - st.meta.album[a]).slice(0, 6);
    if (recent.length) {
      out.appendChild(h('div', { class: 'gd-group' }, 'Последние записи'));
      out.appendChild(cells(st, recent));
    }
    return out;
  }

  function buyWander() {
    const r = g.act((x) => sim.buyWander(x, now()), { now: true, reason: 'buy' });
    if (!r.ok) return toastNo(r.why);
    g.sfx('buy');
    g.flash('leaf', 'Семя странницы в банке', 'Какой ген редкий — покажет только цветение');
  }

  function news(st) {
    const list = st.run.news || [];
    const fresh = list.filter((n) => n.n > view.newsSeen);
    if (!fresh.length) return;
    view.newsSeen = st.run.newsSeq || 0;
    const last = fresh[fresh.length - 1];
    if (/^Новая запись/.test(last.text)) {
      g.sfx('achievement');
      fillNames();
    }
    g.flash(/^Новая запись/.test(last.text) ? 'book' : 'leaf', last.text, fresh.length > 1 ? 'и ещё ' + (fresh.length - 1) : null);
    if (!st.meta.tipPollen && st.run.beds.some((b) => b.p && !b.p.dead && sim.stageOf(b.p, cfg()) === 3)) {
      g.act((x) => { x.meta.tipPollen = 1; });
      pollenHelp();
    }
  }

  function achievements(st) {
    const album = st.meta.album;
    const n = sim.albumCount(st);
    if (n >= 1) g.achieve('first-bloom');
    if (n >= 100) g.achieve('hundred');
    if (sim.LOOKS.moon.color.every((c) => Object.keys(album).some((k) => k.indexOf('moon/' + c + '/') === 0))) g.achieve('nine-colors');
    if (Object.keys(album).some((k) => k.indexOf('chimera/') === 0)) g.achieve('first-chimera');
    if (Object.keys(album).some((k) => /^(moon|sun)\/(glow|black|clear)\/|\/crystal\/|\/gold$|^sun\/.*\/star$/.test(k))) g.achieve('rare-allele');
    if (st.meta.streak && st.meta.streak.best >= 10) g.achieve('clean-line');
    if (sim.moves(st) >= 1) g.achieve('first-move');
  }

  await Game.start({ sim, render, init: build });
})();
