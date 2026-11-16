// The screen of «Ветки поездов»: the menu of chapters, the puzzle (the scheme on a canvas, the
// ribbon of the schedule, «Пуск», «Шаг», «Сброс»), the level of the day and the challenge of the
// week, the endless run and the workshop of upgrades. The engine (Game.start) gives the frame:
// g.el.top (tokens), g.el.field (the scheme), g.el.actions (buttons under the thumb; on the
// unfolded screen — the right panel with the schedule and the list of levels). The rails and the
// generator are in ../rails.js, the endless run in ../endless.js, tokens and upgrades in ../sim.js.
// The canvas (tracks, depots, stations, switches, trains) is drawn by draw.js (TSDraw), the pictures
// of the lists (chapters, modes, upgrades, awards) come from art.js (TSArt).
(async function () {
  const h = ui.h;
  const sim = window.GameSim;
  const Rails = window.Rails;
  const Endless = window.Endless;

  const Draw = window.TSDraw;
  const Art = window.TSArt;
  const COLORS = Draw.COLORS;
  const COLOR_NAMES = ['красная', 'синяя', 'зелёная', 'оранжевая', 'фиолетовая', 'розовая'];
  const mark = Draw.mark;
  const drawNet = Draw.net;
  const drawTrain = Draw.train;
  const drawWaiting = Draw.waiting;
  const KIND_NAMES = { m: 'ручная', f: 'перекидная', c: 'цветная', n: 'счётная' };
  const REASON = {
    crash: 'Столкновение', wrong: 'Поезд приехал на чужую станцию', stuck: 'Поезд упёрся в тупик',
    loop: 'Поезд кружит без конца', timeout: 'Не все поезда доехали'
  };
  const LETTERS = 'АБВГДЕЖИКЛ';

  async function json(path, fallback) {
    try {
      const r = await fetch(path);
      if (!r.ok) return fallback;
      return await r.json();
    } catch (error) {
      return fallback;
    }
  }

  const D = { chapters: { chapters: [], daily: [], weekly: [] }, names: null, intros: [], tutorials: {}, levels: {}, daily: null, weekly: null };
  [D.chapters, D.names, D.intros, D.tutorials] = await Promise.all([
    json('../content/chapters.json', D.chapters), json('../content/names.json', null),
    json('../content/intros.json', []), json('../content/tutorials.json', {})
  ]);

  let g = null;
  const V = {};
  let screen = 'home';
  let chapterN = 1;
  let P = null;
  let B = null;
  let seenEv = 0;
  let seenResult = 0;
  let depot2 = true;
  const bursts = [];

  // ---- small helpers -------------------------------------------------------------------------------

  function cfg(key, dflt) {
    const v = g.config[key];
    return typeof v === 'number' ? v : dflt;
  }


  function icon(name) { return GameIcons.el(name); }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function today() { return window.Core.dayKey(Date.now()); }

  function stars(n, total) {
    const row = h('span', { class: 'ts-stars' });
    for (let i = 0; i < (total || 3); i++) {
      const s = icon('star');
      s.classList.add(i < n ? 'on' : 'off');
      row.append(s);
    }
    return row;
  }


  function depotLetters(nodes) {
    const out = {};
    let k = 0;
    nodes.forEach((d, i) => { if (d.t === 'D') out[i] = LETTERS[k++] || '?'; });
    return out;
  }

  function clear() {
    g.el.field.replaceChildren();
    g.el.actions.replaceChildren();
    V.top.replaceChildren();
    B = null;
  }

  function topLine(title, sub) {
    V.title = h('div', { class: 'ts-title' }, title);
    V.tokens = h('span', { class: 'ts-tokens g-num' });
    V.sub = h('div', { class: 'ts-sub' }, sub || '');
    V.top.append(h('div', { class: 'ts-topline' }, V.title, h('span', { class: 'ts-token-chip' }, icon('coin'), V.tokens)), V.sub);
  }

  function btn(label, onclick, o) {
    o = o || {};
    return h('button', { class: 'g-btn' + (o.primary ? ' primary' : '') + (o.small ? ' small' : ''), id: o.id, onclick }, o.icon ? icon(o.icon) : null, label);
  }

  // ---- the board: a scheme on a canvas -------------------------------------------------------------

  function makeBoard(onTap) {
    const canvas = h('canvas', { class: 'ts-canvas' });
    const b = { canvas, ctx: canvas.getContext('2d'), cell: 40, w: 5, h: 8, down: null };
    canvas.addEventListener('pointerdown', (e) => {
      b.down = { x: e.clientX, y: e.clientY, t: performance.now() };
    });
    canvas.addEventListener('pointerup', (e) => {
      if (!b.down) return;
      const dur = performance.now() - b.down.t;
      const r = canvas.getBoundingClientRect();
      b.down = null;
      onTap(e.clientX - r.left, e.clientY - r.top, dur);
    });
    canvas.addEventListener('pointercancel', () => { b.down = null; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    return b;
  }

  /** The cell from the room the field has left (the ribbon and the legend take theirs). */
  function fitBoard(b, net) {
    // The board shows the cells the network takes (the grid around it is empty anyway).
    let x0 = 99;
    let y0 = 99;
    let x1 = 0;
    let y1 = 0;
    net.nodes.forEach((d) => {
      x0 = Math.min(x0, d.x);
      y0 = Math.min(y0, d.y);
      x1 = Math.max(x1, d.x);
      y1 = Math.max(y1, d.y);
    });
    const w = x1 - x0 + 1;
    const hh = y1 - y0 + 1;
    b.x0 = x0;
    b.y0 = y0;
    b.cols = w;
    b.rows = hh;
    const field = g.el.field;
    const used = Array.from(field.children).filter((el) => el !== b.wrap).reduce((s, el) => s + el.offsetHeight + 8, 0);
    const maxW = Math.max(160, field.clientWidth - 32);
    const maxH = Math.max(200, field.clientHeight - used - 12);
    const cell = Math.max(30, Math.floor(Math.min(maxW / w, maxH / hh, 96)));
    const dpr = window.devicePixelRatio || 1;
    b.w = w;
    b.h = hh;
    b.cell = cell;
    b.canvas.width = Math.round(cell * w * dpr);
    b.canvas.height = Math.round(cell * hh * dpr);
    b.canvas.style.width = cell * w + 'px';
    b.canvas.style.height = cell * hh + 'px';
    b.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  const cxy = Draw.cxy;

  /** replaceChildren without the empty ones. */
  function put(el, ...kids) {
    el.replaceChildren(...kids.flat().filter((k) => k !== null && k !== undefined && k !== false));
  }

  /** The nearest node of `kinds` to a tap: the zone of a switch is at least ui.hitPx, ×1,3 wide. */
  function hit(b, nodes, x, y, test) {
    const wide = g.state.run.up.wide ? cfg('ui.wideScale', 1.3) : 1;
    const r = Math.max(cfg('ui.hitPx', 48) / 2, b.cell * 0.55) * wide;
    let best = -1;
    let bd = 1e9;
    nodes.forEach((d, i) => {
      if (!test(d, i)) return;
      const c = cxy(b, d);
      const dist = Math.hypot(c[0] - x, c[1] - y);
      if (dist <= r && dist < bd) {
        bd = dist;
        best = i;
      }
    });
    return best;
  }


  function lerp(a, z, f) { return [a[0] + (z[0] - a[0]) * f, a[1] + (z[1] - a[1]) * f]; }

  // ---- home ----------------------------------------------------------------------------------------

  function showHome() {
    stopPuzzle();
    screen = 'home';
    clear();
    topLine('Ветки поездов', 'Звёзд ' + sim.totalStars(g.state) + ' из ' + sim.LEVELS * sim.CHAPTERS * 3);
    const r = g.state.run;
    const list = h('div', { class: 'ts-list' });
    // The chapters.
    D.chapters.chapters.forEach((ch) => {
      const open = sim.chapterOpen(g.state, g.config, ch.n);
      const solved = sim.solvedIn(g.state, ch.n);
      const got = sim.starsIn(g.state, ch.n);
      const done = solved >= sim.LEVELS;
      const state = !open ? 'locked' : done ? 'done' : '';
      const need = cfg('chapter.unlock', 10);
      list.append(h('button', { class: 'ts-card' + (state ? ' ' + state : ''), id: 'chapter-' + ch.n, onclick: () => (open ? showChapter(ch.n) : lockedChapter(ch.n)) },
        Art.pic('ch' + ch.n, 44, state),
        h('span', { class: 'ts-card-body' },
          h('span', { class: 'ts-card-title' }, ch.n + '. ' + ch.title),
          h('span', { class: 'ts-card-sub' }, open ? (done ? 'Пройдена' : 'Решено ' + solved + ' из ' + sim.LEVELS) + ' · звёзд ' + got + ' из ' + sim.LEVELS * 3 :
            'Закрыта: решите ' + need + ' ' + g.fmt.plural(need, 'уровень', 'уровня', 'уровней') + ' главы ' + (ch.n - 1)),
          open ? h('span', { class: 'ts-bar' }, h('span', { class: 'ts-bar-fill' + (got >= sim.LEVELS * 3 ? ' gold' : ''), style: 'width: ' + Math.round(solved / sim.LEVELS * 100) + '%' })) :
            h('span', { class: 'ts-card-sub ts-card-new' }, ch.new))));
    });
    const day = today();
    const daily = r.daily.day === day ? r.daily.stars : 0;
    const week = Rails.weekKey(day);
    const weekly = r.weekly.week === week ? r.weekly.stars : 0;
    const extra = h('div', { class: 'ts-list' },
      h('button', { class: 'ts-card', id: 'daily', onclick: () => openSeeded('daily') },
        Art.pic('daily', 44, daily ? 'done' : ''),
        h('span', { class: 'ts-card-body' }, h('span', { class: 'ts-card-title' }, 'Уровень дня'),
          h('span', { class: 'ts-card-sub' }, (daily ? 'Решён сегодня' : 'Новый каждый день, без сети') + (r.daily.streak ? ' · подряд ' + r.daily.streak : ''))),
        daily ? stars(daily) : null),
      h('button', { class: 'ts-card', id: 'weekly', onclick: () => openSeeded('weekly') },
        Art.pic('weekly', 44, weekly ? 'done' : ''),
        h('span', { class: 'ts-card-body' }, h('span', { class: 'ts-card-title' }, 'Вызов недели'),
          h('span', { class: 'ts-card-sub' }, 'Неделя ' + week.slice(6) + ' · звезда — ' + cfg('tokens.perStar', 10) * cfg('weekly.mult', 2) + ' жетонов')),
        weekly ? stars(weekly) : null),
      h('button', { class: 'ts-card', id: 'endless', onclick: showEndless },
        Art.pic('endless', 44),
        h('span', { class: 'ts-card-body' }, h('span', { class: 'ts-card-title' }, 'Бесконечный режим'),
          h('span', { class: 'ts-card-sub' }, r.live ? 'Заход на паузе — продолжить' : 'Рекорд ' + r.endless.best + (r.endless.runs ? ' · заходов ' + r.endless.runs : '')))),
      h('button', { class: 'ts-card', id: 'shop', onclick: showShop },
        Art.pic('shop', 44),
        h('span', { class: 'ts-card-body' }, h('span', { class: 'ts-card-title' }, 'Мастерская'),
          h('span', { class: 'ts-card-sub' }, 'Улучшения за жетоны'))),
      h('button', { class: 'ts-card', id: 'awards', onclick: showAwards },
        Art.pic('awards', 44),
        h('span', { class: 'ts-card-body' }, h('span', { class: 'ts-card-title' }, 'Награды'),
          h('span', { class: 'ts-card-sub' }, 'Получено ' + awardsGot() + ' из ' + (g.game.achievements || []).length))));
    g.el.field.append(h('div', { class: 'ts-home' }, h('div', { class: 'ts-section' }, 'Главы'), list, h('div', { class: 'ts-section' }, 'Ещё'), extra));
    const nextLv = nextLevel();
    const resume = r.puzzle && !r.puzzle.won && /^\d+-\d+$/.test(r.puzzle.id) ? r.puzzle.id : null;
    const goId = resume || nextLv;
    g.el.actions.append(
      btn(goId ? (resume ? 'Продолжить ' : 'Играть ') + goId.replace('-', '.') : 'Все уровни решены', () => goId && openLevelId(goId), { primary: true, id: 'play', icon: 'play' }),
      h('div', { class: 'g-btns' }, btn('Бесконечный', showEndless, { small: true, id: 'go-endless' }), btn('Мастерская', showShop, { small: true, id: 'go-shop' })));
    g.redraw();
  }

  function awardsGot() {
    const got = g.state.meta.achievements || {};
    return (g.game.achievements || []).filter((a) => got[a.id]).length;
  }

  /** The achievements with their pictures: got, still ahead, hidden. */
  function showAwards() {
    const got = g.state.meta.achievements || {};
    const rows = (g.game.achievements || []).map((a) => {
      const at = got[a.id];
      const secret = a.hidden && !at;
      return h('div', { class: 'ts-shop-row' + (at ? ' have' : '') },
        Art.pic(secret ? 'secret' : 'ach-' + a.id, 44, at ? 'done' : secret ? '' : 'ahead'),
        h('div', { class: 'ts-shop-body' },
          h('div', { class: 'ts-shop-title' }, secret ? 'Скрытая награда' : a.title),
          h('div', { class: 'ts-shop-text' }, secret ? 'Откроется сама' : a.text || ''),
          at ? h('div', { class: 'ts-shop-have' }, 'Получена ' + new Date(at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })) : null));
    });
    let close = null;
    close = g.sheet([
      h('h3', {}, 'Награды — ' + awardsGot() + ' из ' + rows.length),
      h('div', { class: 'ts-shop' }, rows),
      btn('Закрыть', () => close(), { small: true, id: 'awards-close' })
    ]);
  }

  function lockedChapter(n) {
    ui.toast('Глава ' + n + ' откроется после ' + cfg('chapter.unlock', 10) + ' решённых уровней главы ' + (n - 1));
    g.sfx('deny');
  }

  /** The first open level not solved yet. */
  function nextLevel() {
    for (let ch = 1; ch <= sim.CHAPTERS; ch++) {
      for (let i = 1; i <= sim.LEVELS; i++) {
        if (!sim.levelOpen(g.state, g.config, ch, i)) continue;
        if (!(g.state.run.stars[ch + '-' + i] > 0)) return ch + '-' + i;
      }
    }
    return null;
  }

  async function levelsOf(ch) {
    if (!D.levels[ch]) D.levels[ch] = await json('../content/levels-' + pad2(ch) + '.json', []);
    return D.levels[ch];
  }

  async function openLevelId(id) {
    const ch = sim.chapterOf(id);
    const list = await levelsOf(ch);
    const lv = list.find((x) => x.id === id);
    if (lv) openLevel(lv, 'chapter');
  }

  // ---- a chapter -----------------------------------------------------------------------------------

  async function showChapter(n) {
    stopPuzzle();
    screen = 'chapter';
    chapterN = n;
    const ch = D.chapters.chapters.find((x) => x.n === n);
    const list = await levelsOf(n);
    await takeIntro();
    clear();
    topLine('Глава ' + n + '. ' + ch.title, ch.new);
    const own = (g.state.meta.intros || {})[n];
    const builtIn = (D.intros.find((x) => x.chapter === n) || {}).text;
    g.el.field.append(h('div', { class: 'ts-intro' }, h('div', { class: 'ts-intro-who' }, 'Старый диспетчер'), h('div', {}, own || builtIn || '')));
    g.el.field.append(levelGrid(n, list));
    g.el.actions.append(
      btn('Дальше по главе', () => {
        const id = firstUnsolved(n);
        if (id) openLevelId(id);
      }, { primary: true, id: 'chapter-next', icon: 'play' }),
      btn('К главам', showHome, { small: true, id: 'back' }));
    g.redraw();
  }

  function firstUnsolved(n) {
    for (let i = 1; i <= sim.LEVELS; i++) if (sim.levelOpen(g.state, g.config, n, i) && !(g.state.run.stars[n + '-' + i] > 0)) return n + '-' + i;
    for (let i = 1; i <= sim.LEVELS; i++) if (sim.levelOpen(g.state, g.config, n, i) && g.state.run.stars[n + '-' + i] < 3) return n + '-' + i;
    return n + '-1';
  }

  function levelGrid(n, list, current) {
    const grid = h('div', { class: 'ts-levels' });
    list.forEach((lv) => {
      const open = sim.levelOpen(g.state, g.config, n, lv.i);
      const s = g.state.run.stars[lv.id] || 0;
      grid.append(h('button', {
        class: 'ts-lvl' + (open ? '' : ' locked') + (s ? ' done' : '') + (s >= 3 ? ' full' : '') + (current === lv.id ? ' current' : ''), id: 'lvl-' + lv.id,
        onclick: () => (open ? openLevel(lv, 'chapter') : (ui.toast(g.state.run.up.map ? 'Глава закрыта' : 'Сначала решите уровень ' + n + '.' + (lv.i - 1) + ' — или купите «Карту линий»'), g.sfx('deny')))
      }, h('span', { class: 'ts-lvl-num g-num' }, String(lv.i)), open ? stars(s) : h('span', { class: 'ts-lvl-lock' }, Art.pic('lock', 22))));
    });
    return grid;
  }

  /** A fresh intro of the old dispatcher from the stock (kept for its chapter). */
  async function takeIntro() {
    try {
      if (!(g.stock.count('intros') > 0)) return;
      const item = await g.stock.take('intros');
      if (item && item.text && item.chapter && !item.procedural) {
        g.act((s) => {
          s.meta.intros = s.meta.intros || {};
          s.meta.intros[item.chapter] = item.text;
        });
      }
    } catch (error) { /* without the stock — the built-in intros */ }
  }

  // ---- the level of the day and the challenge of the week ------------------------------------------

  function openSeeded(kind) {
    stopPuzzle();
    const day = today();
    const key = kind === 'daily' ? day : Rails.weekKey(day);
    const cache = D[kind];
    if (cache && cache.key === key) {
      openLevel(cache.lv, kind);
      return;
    }
    clear();
    topLine(kind === 'daily' ? 'Уровень дня' : 'Вызов недели', 'Генератор собирает уровень…');
    g.el.field.append(h('div', { class: 'g-note ts-wait' }, 'Перебираю варианты стрелок — пара секунд.'));
    setTimeout(() => {
      const t0 = performance.now();
      const lv = Rails.seeded(kind + ':' + key, D.chapters[kind], D.names, cfg('daily.tries', 120));
      g.log && g.log((kind === 'daily' ? 'Уровень дня ' : 'Вызов недели ') + key + ': ' + Math.round(performance.now() - t0) + ' мс');
      if (!lv) {
        ui.toast('Не вышло собрать уровень — попробуйте ещё раз');
        showHome();
        return;
      }
      lv.name = kind === 'daily' ? 'Уровень дня ' + day.slice(8) + '.' + day.slice(5, 7) : 'Вызов недели ' + key.slice(6);
      D[kind] = { key, lv };
      openLevel(lv, kind);
    }, 30);
  }

  // ---- the puzzle ----------------------------------------------------------------------------------

  function openLevel(lv, kind) {
    stopPuzzle();
    screen = 'level';
    const vars = Rails.varNodes(lv);
    const saved = g.state.run.puzzle && g.state.run.puzzle.id === lv.id ? g.state.run.puzzle : null;
    P = {
      lv, kind, vars,
      sw: saved && saved.sw.length === vars.length ? saved.sw.slice() : vars.map((v) => (lv.nodes[v].p ? 1 : 0)),
      dl: saved && saved.dl.length === lv.trains.length ? saved.dl.slice() : lv.trains.map(() => 0),
      hint: saved ? saved.hint.slice() : [],
      res: null, ghosts: null, tick: -1, frac: 0, playing: false, stepping: false, ended: false, fail: null, letters: depotLetters(lv.nodes),
      showGhosts: !!g.state.run.up.ghosts
    };
    clear();
    P.prefix = kind === 'chapter' ? lv.ch + '.' + lv.i : kind === 'daily' ? 'День' : 'Неделя';
    topLine(lv.name, '');
    if (lv.delay) V.sub.classList.add('two');
    V.banner = h('div', { class: 'ts-banner', hidden: true });
    V.ribbon = h('div', { class: 'ts-ribbon', id: 'ribbon' });
    V.legend = h('div', { class: 'ts-legend' });
    B = makeBoard(tapPuzzle);
    B.wrap = h('div', { class: 'ts-board' }, B.canvas);
    const tip = lv.tutorial && D.tutorials[lv.id] ? h('div', { class: 'ts-tip' }, D.tutorials[lv.id]) : null;
    const wide = g.layout === 'wide';
    g.el.field.append(...[tip, wide ? null : V.ribbon, B.wrap, V.legend, V.banner].filter(Boolean));
    buildLegend();
    V.play = btn('Пуск', playPause, { primary: true, id: 'run', icon: 'play' });
    V.step = btn('Шаг', stepOnce, { id: 'step', icon: 'right' });
    V.reset = btn('Сброс', resetPuzzle, { id: 'reset', icon: 'refresh' });
    [V.play, V.step, V.reset].forEach((b) => b.classList.add('ts-main'));
    V.back = g.state.run.up.back ? btn('Назад', stepBack, { small: true, id: 'step-back', icon: 'undo' }) : null;
    V.hintBtn = btn('Подсказка', useHint, { small: true, id: 'hint', icon: 'info' });
    V.ghostBtn = g.state.run.up.ghosts ? btn('Призраки', toggleGhosts, { small: true, id: 'ghosts', icon: 'eye' }) : null;
    V.menuBtn = btn(kind === 'chapter' ? 'Уровни' : 'Меню', () => (kind === 'chapter' ? showChapter(lv.ch) : showHome()), { small: true, id: 'back' });
    if (wide) {
      g.el.actions.append(h('div', { class: 'ts-section' }, 'Расписание'), V.ribbon);
      if (kind === 'chapter') {
        levelsOf(lv.ch).then((list) => {
          if (P && P.lv === lv) V.panelLevels.replaceChildren(levelGrid(lv.ch, list, lv.id));
        });
        V.panelLevels = h('div', { class: 'ts-panel-levels' });
        g.el.actions.append(h('div', { class: 'ts-section' }, 'Уровни главы'), V.panelLevels);
      }
      g.el.actions.append(h('div', { class: 'ts-spacer' }));
    }
    g.el.actions.append(h('div', { class: 'g-btns ts-row3' }, V.play, V.step, V.reset),
      h('div', { class: 'g-btns ts-row-small' }, V.back, V.hintBtn, V.ghostBtn, V.menuBtn));
    buildRibbon();
    P.ready = true;
    if (!saved) savePuzzle();
    fitBoard(B, lv);
    g.redraw();
  }

  function savePuzzle() {
    const lv = P.lv;
    g.act((s) => {
      sim.setPuzzle(s, lv.id, P.sw, P.dl);
      s.run.puzzle.hint = P.hint.slice();
    });
  }

  function stopPuzzle() {
    if (P) P.playing = false;
    P = null;
  }

  function setup() { return { sw: P.sw, dl: P.dl }; }

  function changes() {
    let k = 0;
    P.vars.forEach((v, i) => { if ((P.sw[i] ? 1 : 0) !== (P.lv.nodes[v].p ? 1 : 0)) k++; });
    return k;
  }

  function delayUsed() { return P.dl.reduce((a, b) => a + b, 0); }

  function invalidate() {
    P.res = null;
    P.ghosts = null;
    P.tick = -1;
    P.frac = 0;
    P.playing = false;
    P.stepping = false;
    P.ended = false;
    P.fail = null;
    V.banner.hidden = true;
  }

  function result() {
    if (!P.res) P.res = Rails.simulate(P.lv, setup());
    return P.res;
  }

  function ghostPaths() {
    if (!P.ghosts) {
      const r = Rails.simulate(P.lv, setup(), { noCrash: true, trace: false });
      P.ghosts = r.paths.map((path, j) => ({ path, c: P.lv.trains[j].c }));
    }
    return P.ghosts;
  }

  function tapPuzzle(x, y) {
    if (!P || !B) return;
    const lv = P.lv;
    const n = hit(B, lv.nodes, x, y, (d) => d.t === 'W');
    if (n < 0) return;
    const k = P.vars.indexOf(n);
    const d = lv.nodes[n];
    if (k < 0) {
      ui.toast(d.k === 'c' ? 'Цветная стрелка: ' + COLOR_NAMES[d.c] + ' — налево, остальные — направо' : 'Эта стрелка закреплена: ' + KIND_NAMES[d.k] + ', стоит как есть');
      g.sfx('deny');
      return;
    }
    if (P.tick >= 0) invalidate();
    P.sw[k] = P.sw[k] ? 0 : 1;
    P.res = null;
    P.ghosts = null;
    savePuzzle();
    g.sfx('switch');
    g.buzz('tap');
    g.redraw();
  }

  function tapTrain(j) {
    const lv = P.lv;
    const budget = lv.delay || 0;
    if (!budget) {
      ui.toast('В этом уровне задержек нет');
      return;
    }
    if (P.tick >= 0) invalidate();
    if (delayUsed() < budget) P.dl[j]++;
    else if (P.dl[j] > 0) P.dl[j] = 0;
    else {
      ui.toast('Бюджет задержки исчерпан: ' + budget + ' ' + g.fmt.plural(budget, 'такт', 'такта', 'тактов'));
      g.sfx('deny');
      return;
    }
    P.res = null;
    P.ghosts = null;
    savePuzzle();
    buildRibbon();
    g.sfx('tap');
    g.redraw();
  }

  function buildRibbon() {
    const lv = P.lv;
    const order = lv.trains.map((t, j) => j).sort((a, b) => (lv.trains[a].t + P.dl[a]) - (lv.trains[b].t + P.dl[b]) || a - b);
    const out = P.res && P.tick >= 0 ? outAt(P.tick) : null;
    V.ribbon.replaceChildren(...order.map((j) => {
      const t = lv.trains[j];
      const dl = P.dl[j];
      const state = out ? out[j] : 0;
      return h('button', { class: 'ts-chip' + (dl ? ' delayed' : '') + (state === 1 ? ' out' : state === 2 ? ' done' : ''), id: 'train-' + j, onclick: () => tapTrain(j) },
        mark(t.c, 20),
        t.l > 1 ? mark(t.c, 14) : null,
        h('span', { class: 'ts-chip-text g-num' }, (P.letters[t.d] || '') + ' ' + (t.t + dl)),
        dl ? h('span', { class: 'ts-chip-delay' }, '+' + dl) : null);
    }));
  }

  /** Which trains are out (1) or arrived (2) at a tick of the run. */
  function outAt(tick) {
    const res = P.res;
    const lv = P.lv;
    return lv.trains.map((t, j) => {
      const spawn = t.t + P.dl[j];
      if (spawn > tick) return 0;
      const path = res.paths[j] || [];
      const arrivedAt = res.arrived[j] >= 0 ? spawn + path.length - 1 : 1e9;
      return tick >= arrivedAt ? 2 : 1;
    });
  }

  function buildLegend() {
    const lv = P.lv;
    V.legend.replaceChildren(...lv.nodes.filter((d) => d.t === 'S').map((d) => h('span', { class: 'ts-legend-item' }, mark(d.c, 18), d.nm || COLOR_NAMES[d.c])));
  }

  function playPause() {
    if (!P) return;
    if (P.playing && !P.stepping) {
      P.playing = false;
      g.redraw();
      return;
    }
    if (P.ended) invalidate();
    result();
    if (P.tick < 0) {
      P.tick = 0;
      P.frac = 0;
    }
    P.playing = true;
    P.stepping = false;
    g.sfx('tap');
    g.redraw();
  }

  function stepOnce() {
    if (!P) return;
    if (P.ended) return;
    result();
    if (P.tick < 0) {
      P.tick = 0;
      P.frac = 0;
    } else if (P.frac >= 1) {
      P.tick++;
      P.frac = 0;
    }
    P.playing = true;
    P.stepping = true;
    g.redraw();
  }

  function stepBack() {
    if (!P || P.tick < 0) return;
    P.playing = false;
    P.ended = false;
    P.fail = null;
    V.banner.hidden = true;
    if (P.tick === 0) {
      P.tick = -1;
      P.frac = 0;
    } else {
      P.tick--;
      P.frac = 1;
    }
    buildRibbon();
    g.redraw();
  }

  function resetPuzzle() {
    if (!P) return;
    if (P.tick >= 0 || P.ended) {
      invalidate();
      buildRibbon();
      g.redraw();
      return;
    }
    P.sw = P.vars.map((v) => (P.lv.nodes[v].p ? 1 : 0));
    P.dl = P.lv.trains.map(() => 0);
    P.res = null;
    P.ghosts = null;
    savePuzzle();
    buildRibbon();
    g.flash('reset', 'Стрелки на исходных', null, 1500);
    g.redraw();
  }

  function useHint() {
    if (!P) return;
    if (!(g.state.run.up.hint > 0)) {
      ui.toast('Зарядов подсказки нет — в мастерской ' + cfg('price.hint', 20) + ' жетонов за заряд');
      g.sfx('deny');
      return;
    }
    if (!P.lv.sol) return;
    if (P.tick >= 0) invalidate();
    let k = -1;
    g.act((s) => {
      sim.setPuzzle(s, P.lv.id, P.sw, P.dl);
      s.run.puzzle.hint = P.hint.slice();
      k = sim.useHint(s, P.lv);
      if (k >= 0) {
        P.sw = s.run.puzzle.sw.slice();
        P.hint = s.run.puzzle.hint.slice();
      }
    }, { now: true, reason: 'hint' });
    if (k < 0) {
      ui.toast('Все стрелки уже подсказаны');
      return;
    }
    P.res = null;
    P.ghosts = null;
    g.sfx('level');
    g.redraw();
  }

  function toggleGhosts() {
    P.showGhosts = !P.showGhosts;
    g.redraw();
  }

  /** The positions of the switches at a tick of the run: flips and counters move with the trains. */
  function sidesAt(tick) {
    const lv = P.lv;
    const start = {};
    lv.nodes.forEach((d, i) => { if (d.t === 'W') start[i] = d.p ? 1 : 0; });
    P.vars.forEach((v, k) => { start[v] = P.sw[k] ? 1 : 0; });
    const passes = {};
    if (tick >= 0 && P.res) {
      lv.trains.forEach((t, j) => {
        const spawn = t.t + P.dl[j];
        const path = P.res.paths[j] || [];
        for (let k = 0; k + 1 < path.length; k++) {
          if (lv.nodes[path[k]].t === 'W' && spawn + k + 1 <= tick) passes[path[k]] = (passes[path[k]] || 0) + 1;
        }
      });
    }
    const side = {};
    const left = {};
    lv.nodes.forEach((d, i) => {
      if (d.t !== 'W') return;
      const c = passes[i] || 0;
      if (d.k === 'f') side[i] = start[i] ^ (c % 2);
      else if (d.k === 'n') {
        side[i] = c < (d.n || 1) ? start[i] : 1 - start[i];
        left[i] = Math.max(0, (d.n || 1) - c);
      } else if (d.k === 'c') side[i] = -1;
      else side[i] = start[i];
    });
    return { side, left };
  }

  function animatePuzzle(dt) {
    if (!P || !B || !P.ready) return;
    const res = P.res;
    if (P.playing && res) {
      P.frac += (dt * 1000) / cfg('puzzle.tickMs', 420);
      while (P.frac >= 1 && P.playing) {
        const last = res.trace.length - 1;
        if (P.tick >= last) {
          P.frac = 1;
          P.playing = false;
          finishRun();
          break;
        }
        if (P.stepping) {
          P.frac = 1;
          P.playing = false;
          buildRibbon();
          g.redraw();
          break;
        }
        P.tick++;
        P.frac -= 1;
        buildRibbon();
        g.redraw();
      }
      if (P.playing && P.tick >= res.trace.length - 1 && P.frac >= 1) {
        P.playing = false;
        finishRun();
      }
    }
    drawPuzzle();
  }

  function drawPuzzle() {
    const lv = P.lv;
    const shown = P.tick >= 0 && P.res ? sidesAt(P.tick - (P.frac < 0.5 ? 1 : 0)) : sidesAt(-1);
    const editing = P.tick < 0;
    drawNet(B, lv, {
      side: (i) => shown.side[i],
      left: (i) => shown.left[i],
      fixed: (i) => P.vars.indexOf(i) < 0 && lv.nodes[i].k !== 'c',
      hint: (i) => P.hint.indexOf(P.vars.indexOf(i)) >= 0 && P.vars.indexOf(i) >= 0,
      letters: P.letters,
      ghosts: editing && P.showGhosts ? ghostPaths() : null,
      fail: P.fail
    });
    if (editing) {
      // The first train of every depot waits there, outlined.
      const firstAt = {};
      lv.trains.forEach((t, j) => {
        const s = t.t + P.dl[j];
        if (firstAt[t.d] === undefined || s < lv.trains[firstAt[t.d]].t + P.dl[firstAt[t.d]]) firstAt[t.d] = j;
      });
      Object.keys(firstAt).forEach((d) => {
        const j = firstAt[d];
        const p = cxy(B, lv.nodes[d]);
        drawWaiting(B, p, lv.trains[j].c);
      });
      return;
    }
    const res = P.res;
    const snap = res.trace[Math.min(P.tick, res.trace.length - 1)] || [];
    const f = Math.max(0, Math.min(1, P.frac));
    snap.forEach((e) => {
      const j = e[0];
      const head = lv.nodes[e[1]];
      const prev = e[2] >= 0 ? lv.nodes[e[2]] : null;
      const a = prev ? cxy(B, prev) : cxy(B, head);
      const z = cxy(B, head);
      const pos = prev ? lerp(a, z, easeInOut(f)) : z;
      let ang = Math.atan2(z[1] - a[1], z[0] - a[0]);
      if (!prev) {
        const nx = lv.nodes[head.o[0]];
        if (nx) {
          const q = cxy(B, nx);
          ang = Math.atan2(q[1] - z[1], q[0] - z[0]);
        }
      }
      drawTrain(B, pos[0], pos[1], ang, lv.trains[j].c, lv.trains[j].l, prev ? 1 : f);
    });
  }

  function easeInOut(f) { return f < 0.5 ? 2 * f * f : 1 - Math.pow(-2 * f + 2, 2) / 2; }

  function finishRun() {
    if (!P) return;
    P.ended = true;
    const res = P.res;
    const lv = P.lv;
    if (res.win) {
      const st = Rails.stars(lv, setup());
      const info = { id: lv.id, kinds: lv.kinds, mode: P.kind, day: today(), week: Rails.weekKey(today()) };
      const r = g.act((s) => sim.award(s, g.config, info, st), { now: true, reason: 'level' });
      g.sfx('level');
      g.buzz('buy');
      checkPuzzleAchievements(lv);
      winSheet(lv, st, r);
    } else {
      P.fail = { node: res.node, reason: res.reason };
      V.banner.hidden = false;
      V.banner.textContent = (REASON[res.reason] || 'Не вышло') + (res.reason === 'timeout' ? '' : ' на такте ' + res.tick) + '. Поправьте стрелки и попробуйте ещё.';
      g.sfx(res.reason === 'crash' ? 'crash' : 'deny');
      g.buzz('deny');
    }
    buildRibbon();
    g.redraw();
  }

  function checkPuzzleAchievements(lv) {
    const r = g.state.run;
    if (r.solved >= 1) g.achieve('first-level');
    for (let ch = 1; ch <= sim.CHAPTERS; ch++) if (sim.threeStarChapter(g.state, ch)) g.achieve('chapter-stars');
    if (Rails.KINDS.every((k) => r.kinds[k])) g.achieve('all-kinds');
    if (r.daily.streak >= cfg('ach.daily', 30)) g.achieve('daily-30');
  }

  function winSheet(lv, st, r) {
    const lines = [
      g.ui.line('Изменений стрелок', changes() + (lv.par >= 0 ? ' (для двух звёзд — не больше ' + lv.par + ')' : '')),
      lv.delay ? g.ui.line('Задержка', delayUsed() + ' ' + g.fmt.plural(delayUsed(), 'такт', 'такта', 'тактов') + ' (для трёх звёзд — не больше ' + (lv.dpar || 0) + ')') : null,
      g.ui.line('Жетоны', r && r.tokens ? '+' + r.tokens : 'звёзды уже были')
    ];
    let close = null;
    const next = () => {
      close();
      if (P && P.kind === 'chapter') {
        const id = lv.ch + '-' + (lv.i + 1);
        if (lv.i < sim.LEVELS && sim.levelOpen(g.state, g.config, lv.ch, lv.i + 1)) openLevelId(id);
        else showChapter(lv.ch);
      } else showHome();
    };
    close = g.sheet([
      h('h3', {}, 'Все поезда доехали'),
      h('div', { class: 'ts-sheet-stars' }, stars(st)),
      h('div', { class: 'g-lines' }, lines),
      h('div', { class: 'g-btns' }, btn('Дальше', next, { primary: true, id: 'win-next' }), btn('Ещё раз', () => {
        close();
        if (P) {
          invalidate();
          buildRibbon();
        }
      }, { id: 'win-again' }))
    ]);
  }

  function renderPuzzle() {
    if (!P || !P.ready) return;
    const lv = P.lv;
    const k = changes();
    const parts = [P.prefix, 'изменений ' + k + (lv.par >= 0 ? ' из ' + lv.par : '')];
    if (lv.delay) parts.push('задержка ' + delayUsed() + ' из ' + lv.delay);
    if (P.tick >= 0) parts.push('такт ' + Math.max(0, P.tick));
    V.sub.textContent = parts.join(' · ');
    const playing = P.playing && !P.stepping;
    V.play.replaceChildren(icon(playing ? 'pause' : 'play'), playing ? 'Пауза' : P.ended ? 'Заново' : 'Пуск');
    V.step.disabled = P.ended;
    if (V.back) V.back.disabled = P.tick < 0;
    V.hintBtn.replaceChildren(icon('info'), 'Подсказка ' + (g.state.run.up.hint || 0));
    if (V.ghostBtn) V.ghostBtn.classList.toggle('on', P.showGhosts);
  }

  // ---- the endless run -----------------------------------------------------------------------------

  function live() { return g.state.run.live; }

  function showEndless() {
    stopPuzzle();
    screen = 'endless';
    clear();
    const L = live();
    seenResult = g.state.run.result ? g.state.run.result.n : 0;
    if (!L) {
      V.stats = null;
      endlessStart();
      return;
    }
    seenEv = L.evn;
    topLine('Бесконечный режим', '');
    V.stats = h('div', { class: 'ts-stats' });
    V.top.append(V.stats);
    V.desk = h('div', { class: 'ts-ribbon ts-desk', id: 'desk' });
    B = makeBoard(tapEndless);
    B.wrap = h('div', { class: 'ts-board' }, B.canvas);
    V.legend = h('div', { class: 'ts-legend' });
    const wide = g.layout === 'wide';
    g.el.field.append(...[wide || !g.state.run.up.desk ? null : V.desk, B.wrap, V.legend].filter(Boolean));
    V.brake = btn('Тормоз', () => {
      if (g.act((s) => Endless.brake(s.run.live, g.config))) g.sfx('tap');
      else ui.toast(g.state.run.up.brake ? 'Тормоза на этот заход кончились' : 'Тормоз — в мастерской');
    }, { small: true, id: 'brake', icon: 'timer' });
    V.signal = btn('Светофор', () => {
      const L2 = live();
      if (!L2 || !(L2.signals > 0)) {
        ui.toast(g.state.run.up.signal ? 'Светофоры на этот заход кончились' : 'Светофор — в мастерской');
        return;
      }
      V.armed = !V.armed;
      if (V.armed) ui.toast('Тапните по поезду — он подождёт');
      g.redraw();
    }, { small: true, id: 'signal', icon: 'stop' });
    V.pause = btn('Пауза', () => {
      g.act((s) => {
        if (s.run.live) s.run.live.paused = s.run.live.paused ? 0 : 1;
      });
    }, { primary: true, id: 'pause' });
    V.quit = btn('Закончить', null, { small: true, id: 'quit', icon: 'exit' });
    g.ui.hold(V.quit, 600, () => {
      g.act((s) => sim.finishEndless(s, g.config), { now: true, reason: 'endless' });
    });
    if (wide && g.state.run.up.desk) g.el.actions.append(h('div', { class: 'ts-section' }, 'Диспетчерская'), V.desk, h('div', { class: 'ts-spacer' }));
    g.el.actions.append(V.pause, h('div', { class: 'g-btns' }, V.brake, V.signal), h('div', { class: 'g-btns' }, V.quit, btn('Меню', () => {
      g.act((s) => { if (s.run.live) s.run.live.paused = 1; });
      showHome();
    }, { small: true, id: 'back' })));
    buildEndlessLegend();
    fitBoard(B, live());
    g.redraw();
  }

  function endlessStart() {
    const r = g.state.run;
    topLine('Бесконечный режим', 'Рекорд ' + r.endless.best);
    const steps = g.links.status().steps;
    const rows = [
      g.ui.line('Жизней', String(cfg('endless.lives', 3) + (r.up.life ? 1 : 0) + (r.bonusLife ? 1 : 0))),
      g.ui.line('Тормозов и светофоров', (r.up.brake || 0) + ' и ' + (r.up.signal || 0)),
      g.ui.line('Заходов', String(r.endless.runs)),
      g.ui.line('Лучшая серия без столкновений', String(r.endless.clean))
    ];
    g.el.field.append(h('div', { class: 'ts-intro' },
      h('div', { class: 'ts-intro-who' }, 'Как играть'),
      h('div', {}, 'Поезда идут без остановки — переводите стрелки на ходу, тапом. Столкновение — минус жизнь, чужая станция — минус очки. Каждые ' + cfg('endless.growEvery', 10) + ' поездов сеть растёт и ускоряется.')),
    h('div', { class: 'g-lines' }, rows));
    const startBtn = btn('Начать заход', startRun, { primary: true, id: 'start', icon: 'play' });
    g.el.actions.append(startBtn);
    if (r.up.depot2) {
      const t = btn(depot2 ? 'Второй депо-старт: да' : 'Второй депо-старт: нет', () => {
        depot2 = !depot2;
        t.replaceChildren(depot2 ? 'Второй депо-старт: да' : 'Второй депо-старт: нет');
      }, { small: true, id: 'depot2' });
      g.el.actions.append(t);
    }
    if (steps && steps.on && !r.bonusLife) {
      g.el.actions.append(btn('Лишняя жизнь за ' + cfg('steps.cost.run-bonus', 1) + ' энергии', async () => {
        const res = await g.links.spend('run-bonus');
        if (!res.ok) {
          ui.toast(res.off ? 'Связка «Шаги» выключена' : 'Нужна ' + res.need + ' энергия — это ~' + g.fmt(res.need * (g.config['steps.perSteps'] || 1000)) + ' шагов');
          g.buzz('deny');
          return;
        }
        g.act((s) => { s.run.bonusLife = 1; }, { now: true, reason: 'spend' });
        g.sfx('level');
        showEndless();
      }, { small: true, id: 'bonus-life', icon: 'energy' }));
    }
    g.el.actions.append(btn('Меню', showHome, { small: true, id: 'back' }));
    g.redraw();
  }

  async function startRun() {
    const names = [];
    try {
      for (let i = 0; i < 3 && g.stock.count('stations') > 0; i++) {
        const item = await g.stock.take('stations');
        if (item && item.name && !item.procedural) names.push(item.name);
      }
    } catch (error) { /* the tables then */ }
    const L = g.act((s) => sim.startEndless(s, g.config, g.rng, { names, tables: D.names, depot2 }), { now: true, reason: 'endless' });
    if (!L) {
      ui.toast('Сеть не собралась — попробуйте ещё раз');
      return;
    }
    g.sfx('level');
    showEndless();
  }

  function tapEndless(x, y, dur) {
    const L = live();
    if (!L || !B || L.over) return;
    if (V.armed) {
      V.armed = false;
      let best = null;
      let bd = B.cell * 0.8;
      L.trains.forEach((tr) => {
        const p = trainXY(L, tr, endlessFrac(L));
        const dist = Math.hypot(p.x - x, p.y - y);
        if (dist < bd) {
          bd = dist;
          best = tr;
        }
      });
      if (!best) {
        ui.toast('Поезда там нет');
        g.redraw();
        return;
      }
      const ok = g.act((s) => Endless.hold(s.run.live, g.config, best.id));
      if (ok) g.sfx('tap');
      else ui.toast('Здесь светофор не поможет — встанут другие поезда');
      g.redraw();
      return;
    }
    const vis = Endless.visible(L);
    const n = hit(B, L.nodes, x, y, (d, i) => d.t === 'W' && vis[i] && Endless.revealed(L, i));
    if (n < 0) return;
    if (dur >= 450 && n === L.side) {
      g.act((s) => Endless.siding(s.run.live, n));
      g.sfx('tap');
      g.buzz('tap');
      return;
    }
    g.act((s) => Endless.tap(s.run.live, n));
    g.sfx('switch');
    g.buzz('tap');
  }

  function endlessFrac(L) {
    const sec = Endless.tickSec(L, g.config);
    if (L.paused || L.over) return Math.min(1, L.acc / sec);
    if (V.seenTick !== L.tick) {
      V.seenTick = L.tick;
      V.tickAt = performance.now() - (L.acc / (L.slow > 0 ? L.slowK || 0.5 : 1)) * 1000;
    }
    const k = L.slow > 0 ? L.slowK || 0.5 : 1;
    return Math.max(0, Math.min(1, ((performance.now() - V.tickAt) / 1000) * k / sec));
  }

  function trainXY(L, tr, f) {
    const head = L.nodes[tr.at];
    const z = cxy(B, head);
    const prev = tr.pr >= 0 && tr.pr !== tr.at ? L.nodes[tr.pr] : null;
    let ang = 0;
    let p = z;
    if (prev) {
      const a = cxy(B, prev);
      p = lerp(a, z, f);
      ang = Math.atan2(z[1] - a[1], z[0] - a[0]);
    } else {
      const nx = L.nodes[(head.o || [])[0]];
      if (nx) {
        const q = cxy(B, nx);
        ang = Math.atan2(q[1] - z[1], q[0] - z[0]);
      }
    }
    return { x: p[0], y: p[1], ang, fresh: tr.pr < 0 };
  }

  function animateEndless() {
    const L = live();
    if (!L || !B) return;
    const vis = Endless.visible(L);
    const next = g.state.run.up.warn ? Endless.nextPasses(L) : null;
    const warnTicks = cfg('endless.warnTicks', 5);
    drawNet(B, L, {
      vis,
      open: (i) => Endless.revealed(L, i),
      side: (i) => (!Endless.revealed(L, i) ? -1 : L.pos[i] === Endless.SIDING ? -2 : L.pos[i]),
      letters: depotLetters(L.nodes),
      blink: next ? (i) => next[i] && Endless.revealed(L, i) && L.pos[i] !== next[i].side && next[i].tick - L.tick <= warnTicks : null,
      siding: L.side
    });
    const f = endlessFrac(L);
    const waiting = Endless.waiting(L);
    Object.keys(waiting).forEach((d) => {
      if (!vis[d]) return;
      const q = waiting[d];
      const p = cxy(B, L.nodes[d]);
      drawWaiting(B, p, q.c);
    });
    L.trains.forEach((tr) => {
      const p = trainXY(L, tr, easeInOut(f));
      drawTrain(B, p.x, p.y, p.ang, tr.c, 1, p.fresh ? f : 1);
      // Held by «Светофор»: it stood through the last tick.
      if (!tr.off && tr.pr >= 0 && tr.pr === tr.at) Draw.signal(B, p.x, p.y);
    });
    // Bursts of crashes and arrivals.
    const now = performance.now();
    for (let i = bursts.length - 1; i >= 0; i--) {
      const e = bursts[i];
      const age = (now - e.at) / 600;
      if (age > 1) {
        bursts.splice(i, 1);
        continue;
      }
      const d = L.nodes[e.node];
      if (!d) continue;
      const p = cxy(B, d);
      const ctx = B.ctx;
      ctx.strokeStyle = e.color;
      ctx.globalAlpha = 1 - age;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(p[0], p[1], B.cell * (0.3 + age * 0.5), 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (V.armed) {
      const ctx = B.ctx;
      ctx.strokeStyle = '#8B7CFF';
      ctx.lineWidth = 3;
      ctx.strokeRect(1.5, 1.5, B.cell * B.cols - 3, B.cell * B.rows - 3);
    }
  }

  /** The events of the run since the last look: sounds, flashes, achievements. */
  function endlessEvents() {
    const L = live();
    if (L) {
      L.ev.forEach((e) => {
        if (e.n <= seenEv) return;
        seenEv = e.n;
        if (e.t === 'deliver') {
          g.sfx('arrive');
          bursts.push({ node: e.node, at: performance.now(), color: COLORS[e.c] || '#fff' });
        } else if (e.t === 'wrong') {
          g.sfx('deny');
          g.buzz('deny');
          bursts.push({ node: e.node, at: performance.now(), color: '#FF7B72' });
          g.flash('info', 'Чужая станция', 'минус ' + Math.abs(e.pts) + ' очков, серия с нуля', 1500);
        } else if (e.t === 'crash') {
          g.sfx('crash');
          g.buzz([60, 40, 120]);
          bursts.push({ node: e.node, at: performance.now(), color: '#FF7B72' });
        } else if (e.t === 'grow') {
          g.sfx('level');
          g.flash('map', 'Сеть выросла', 'скорость ' + g.fmt.mult(L.speed), 1800);
          buildEndlessLegend();
        } else if (e.t === 'siding') {
          g.sfx('tap');
        }
      });
      if (L.bestClean >= cfg('ach.noCrash', 100)) g.achieve('no-crash-100');
      if (L.score >= cfg('ach.record', 1000)) g.achieve('record-1000');
    }
    const res = g.state.run.result;
    if (res && res.n > seenResult) {
      seenResult = res.n;
      if (res.clean >= cfg('ach.noCrash', 100)) g.achieve('no-crash-100');
      if (res.score >= cfg('ach.record', 1000)) g.achieve('record-1000');
      resultSheet(res);
    }
  }

  function resultSheet(res) {
    g.sfx(res.record ? 'achievement' : 'level');
    let close = null;
    close = g.sheet([
      h('h3', {}, res.record ? 'Новый рекорд' : 'Заход окончен'),
      h('div', { class: 'g-lines' },
        g.ui.line('Очки', String(res.score)),
        g.ui.line('Рекорд', String(res.best)),
        g.ui.line('Поездов доставлено', String(res.delivered)),
        g.ui.line('Столкновений', String(res.crashes)),
        g.ui.line('Чужих станций', String(res.wrong)),
        g.ui.line('Жетоны', '+' + res.tokens)),
      h('div', { class: 'g-btns' }, btn('Ещё заход', () => {
        close();
        showEndless();
      }, { primary: true, id: 'again' }), btn('Меню', () => {
        close();
        showHome();
      }, { id: 'result-menu' }))
    ]);
    if (screen === 'endless') showEndless();
  }

  function buildEndlessLegend() {
    const L = live();
    if (!L || !V.legend) return;
    const vis = Endless.visible(L);
    V.legend.replaceChildren(...L.nodes.filter((d, i) => d.t === 'S' && vis[i]).map((d) => h('span', { class: 'ts-legend-item' }, mark(d.c, 18), d.nm || COLOR_NAMES[d.c])));
  }

  function renderEndless() {
    const L = live();
    if (!L) {
      if (V.stats) V.stats = null;
      return;
    }
    if (!V.stats) return;
    const hearts = [];
    for (let i = 0; i < L.maxLives; i++) {
      const s = icon('heart');
      s.classList.add(i < L.lives ? 'on' : 'off');
      hearts.push(s);
    }
    put(V.stats, 
      h('span', { class: 'ts-score g-num' }, String(L.score)),
      h('span', { class: 'ts-stat' }, g.fmt.mult(L.mult)),
      h('span', { class: 'ts-lives' }, hearts),
      h('span', { class: 'ts-stat' }, 'скорость ' + g.fmt.mult(L.speed)),
      sim.onTrip({ links: g.links.status() }) ? h('span', { class: 'ts-stat on' }, 'в пути ×' + cfg('endless.tripMult', 1.5)) : null);
    V.sub.textContent = 'Доставлено ' + L.delivered + ' · ступень ' + (L.stage + 1) + (L.paused ? ' · пауза' : '') + (L.slow > 0 ? ' · замедление' : '');
    V.pause.replaceChildren(icon(L.paused ? 'play' : 'pause'), L.paused ? 'Дальше' : 'Пауза');
    V.brake.replaceChildren(icon('timer'), 'Тормоз ' + L.brakes);
    V.brake.disabled = !(L.brakes > 0);
    V.signal.replaceChildren(icon('stop'), 'Светофор ' + L.signals);
    V.signal.disabled = !(L.signals > 0);
    V.signal.classList.toggle('on', !!V.armed);
    if (g.state.run.up.desk && V.desk) {
      const q = L.queue.slice().sort((a, b) => a.s - b.s).slice(0, 5);
      const letters = depotLetters(L.nodes);
      V.desk.replaceChildren(...q.map((t) => h('span', { class: 'ts-chip' }, mark(t.c, 20), h('span', { class: 'ts-chip-text g-num' }, (letters[t.d] || '') + ' через ' + Math.max(0, t.s - L.tick)))));
    }
  }

  // ---- the workshop --------------------------------------------------------------------------------

  function showShop() {
    stopPuzzle();
    screen = 'shop';
    clear();
    topLine('Мастерская', 'Жетоны за звёзды и очки — на улучшения, навсегда');
    V.shop = h('div', { class: 'ts-shop' });
    g.el.field.append(V.shop);
    g.el.actions.append(btn('Меню', showHome, { primary: true, id: 'back' }));
    buildShop();
    g.redraw();
  }

  function buildShop() {
    const r = g.state.run;
    const have = sim.tokens(g.state);
    const rows = sim.UPGRADES.filter((u) => u.kind !== 'skin').map((u) => {
      const p = sim.price(g.state, g.config, u.id);
      const lvl = r.up[u.id] || 0;
      const status = u.kind === 'charge' ? 'зарядов ' + lvl : u.kind === 'level' ? 'уровень ' + lvl : lvl ? 'есть' : '';
      return h('div', { class: 'ts-shop-row' + (p < 0 ? ' have' : '') },
        Art.pic('up-' + u.id, 44, p < 0 ? 'done' : ''),
        h('div', { class: 'ts-shop-body' }, h('div', { class: 'ts-shop-title' }, u.title, status ? h('span', { class: 'ts-shop-have' }, status) : null), h('div', { class: 'ts-shop-text' }, u.text)),
        p < 0 ? null :
          h('button', { class: 'g-btn small ts-price', id: 'buy-' + u.id, disabled: have < p, onclick: () => buy(u.id) }, icon('coin'), h('span', { class: 'g-num' }, String(p))));
    });
    const skins = h('div', { class: 'ts-skins' }, sim.SKINS.map((s) => {
      const owned = !!r.skins[s.id];
      const chosen = r.skin === s.id;
      const price = cfg('price.skin', 50);
      const c = h('canvas', { class: 'ts-skin-canvas' });
      Draw.skinPreview(c, s.id, 84, 36);
      return h('button', {
        class: 'ts-skin' + (chosen ? ' on' : ''), id: 'skin-' + s.id, disabled: !owned && have < price,
        onclick: () => {
          if (owned) g.act((st) => { st.run.skin = s.id; });
          else buy('skin', s.id);
          buildShop();
        }
      }, c, h('span', {}, s.title), h('span', { class: 'ts-skin-sub g-num' }, owned ? (chosen ? 'выбрана' : 'выбрать') : price + ' ' + g.fmt.plural(price, 'жетон', 'жетона', 'жетонов')));
    }));
    const themeRow = r.up.night ? h('div', { class: 'g-btns' },
      btn('Обычная схема', () => { g.act((s) => { s.run.theme = 'day'; }); buildShop(); }, { small: true, id: 'theme-day' }),
      btn('Ночная схема', () => { g.act((s) => { s.run.theme = 'night'; }); buildShop(); }, { small: true, id: 'theme-night' })) : null;
    put(V.shop, h('div', { class: 'ts-section' }, 'Улучшения'), ...rows, h('div', { class: 'ts-section' }, 'Окраски составов'), skins,
      themeRow ? h('div', { class: 'ts-section' }, 'Тема схемы') : null, themeRow);
  }

  function buy(id, skin) {
    const ok = g.act((s) => sim.buyUpgrade(s, g.config, id, skin), { now: true, reason: 'buy' });
    if (ok) {
      g.sfx('buy');
      g.buzz('buy');
    } else {
      g.sfx('deny');
      g.buzz('deny');
      ui.toast('Не хватает жетонов');
    }
    buildShop();
    g.redraw();
  }

  // ---- the engine ----------------------------------------------------------------------------------

  function build(game) {
    g = game;
    V.top = h('div', { class: 'ts-top' });
    g.el.top.append(V.top);
    Sfx.add('switch', [{ type: 'square', f: [1500, 900], d: 0.025, v: 0.22 }, { at: 0.03, type: 'triangle', f: [520, 420], d: 0.04, v: 0.25 }]);
    Sfx.add('arrive', [{ type: 'sine', f: [880, 880], d: 0.07, v: 0.3 }, { at: 0.07, type: 'sine', f: [1320, 1320], d: 0.11, v: 0.26 }]);
    Sfx.add('crash', [{ type: 'noise', f: [1, 1], d: 0.32, v: 0.45 }, { type: 'sawtooth', f: [170, 40], d: 0.38, v: 0.25 }]);
    // No passive income: the sheet «Пока вас не было» has nothing to say.
    g.on('offline', (report) => { report.plan.silent = true; });
    g.on('hidden', () => {
      if (live() && !live().paused) g.act((s) => { s.run.live.paused = 1; });
    });
    g.on('chest', () => g.sfx('chest'));
    g.on('resize', () => {
      if (screen === 'level' && P) openLevel(P.lv, P.kind);
      else if (screen === 'endless') showEndless();
      else if (screen === 'home') showHome();
      else if (screen === 'chapter') showChapter(chapterN);
      else if (screen === 'shop') showShop();
    });
    document.documentElement.dataset.scheme = g.state.run.theme || 'day';
    syncLook(g.state);
    showHome();
  }

  function syncLook(state) {
    Draw.env.theme = state.run.theme || 'day';
    Draw.env.skin = state.run.skin || 'plain';
  }

  function render(state) {
    document.documentElement.dataset.scheme = state.run.theme || 'day';
    syncLook(state);
    if (V.tokens) V.tokens.textContent = String(sim.tokens(state));
    if (screen === 'level') renderPuzzle();
    if (screen === 'endless') {
      if (!state.run.live && V.stats) {
        endlessEvents();
        return;
      }
      renderEndless();
    }
  }

  function animate(state, game, dt) {
    if (screen === 'level') animatePuzzle(dt);
    else if (screen === 'endless') {
      endlessEvents();
      animateEndless();
    }
  }

  await Game.start({ sim, render, animate, init: build });
})();
