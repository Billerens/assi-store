/* Screen-only code. Rules live in sim.js; the worker prepares deterministic boards. */
(async function () {
  'use strict';
  const h = ui.h;
  const sim = window.GameSim;
  const Art = window.MineArt;
  const view = { selectedTool: '', boardKey: '', boardNodes: [], drag: null, sheet: null, panel: 'run', panelKey: '', sideKey: '', worker: null, workerPlan: '', workerQueue: [], workerFlush: null, queueTimer: null, selectedMode: 'rogue', selectedSapper: 'sapper', selectedDepth: 0, busy: false };
  let g = null;
  let content = {};
  const MODES = [
    { id: 'rogue', title: 'Забег', text: 'Три слоя и хозяин. Находки, лавка и новые сочетания.' },
    { id: 'pure', title: 'Чистый сапёр', text: 'Растущие поля, обычные мины и только логика.' },
    { id: 'deep', title: 'Глубже', text: 'Бесконечные поля. Плотность мин растёт после каждого.' },
    { id: 'daily', title: 'Поле дня', text: 'Одно зерно и общее правило на сегодня.' }
  ];
  const TABS = [['run', 'Забег'], ['bag', 'Снаряжение'], ['workshop', 'Мастерская'], ['album', 'Альбом'], ['stats', 'Статистика']];
  const RARITY = { common: 'Обычная', rare: 'Редкая', legend: 'Легендарная' };
  const SHORT_TOOL = { flare: 'Ракета', seismo: 'Сейсмо', lantern: 'Фонарь', brake: 'Стоп' };
  const INSTANT_TOOLS = ['patch', 'sand', 'brake', 'seismo'];

  GameIcons.add('mr-flag', '<path d="M7 21V3M7 4h11l-3 4 3 4H7M4 21h7"/>');
  GameIcons.add('mr-mine', '<circle cx="12" cy="12" r="5"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4M5 5l3 3M16 16l3 3M5 19l3-3M16 8l3-3"/>');
  GameIcons.add('mr-heart', '<path d="M12 20 4.6 12.8C.8 8.7 6.5 2.5 12 7c5.5-4.5 11.2 1.7 7.4 5.8z"/>');
  GameIcons.add('mr-probe', '<path d="M6 21 17 5M15 3l5 4M8 15l3 2"/>');
  GameIcons.add('mr-eye', '<path d="M2 12c5-8 15-8 20 0-5 8-15 8-20 0z"/><circle cx="12" cy="12" r="3"/>');
  GameIcons.add('mr-lantern', '<path d="M8 8V6a4 4 0 0 1 8 0v2M7 8h10l2 12H5zM12 11v6M9 14h6"/>');
  GameIcons.add('mr-compass', '<circle cx="12" cy="12" r="9"/><path d="m16 7-2 7-6 3 2-7z"/>');
  GameIcons.add('mr-sand', '<path d="M6 3h12M6 21h12M7 3c0 5 1 6 5 9-4 3-5 4-5 9M17 3c0 5-1 6-5 9 4 3 5 4 5 9M9 18h6"/>');
  GameIcons.add('mr-stop', '<path d="M7 3h10l4 4v10l-4 4H7l-4-4V7zM9 8v8M15 8v8"/>');
  GameIcons.add('mr-wave', '<path d="M2 12h4l2-7 4 14 3-10 2 3h5"/>');
  GameIcons.add('mr-earth', '<path d="M4 17h16M6 12h12M9 7h6M12 3v1"/>');
  GameIcons.add('mr-arrow', '<path d="M12 20V4M6 10l6-6 6 6"/>');
  GameIcons.add('mr-more', '<path d="M5 7h14M5 12h14M5 17h14"/>');
  if (window.Sfx) {
    Sfx.add('open', [{ type: 'triangle', f: [240, 400], d: .06, v: .12 }]);
    Sfx.add('flag', [{ type: 'square', f: [360, 490], d: .055, v: .07 }]);
    Sfx.add('mine', [{ type: 'noise', f: [1, 1], d: .22, v: .2 }, { type: 'sine', f: [90, 40], d: .26, v: .2 }]);
    Sfx.add('find', [{ type: 'triangle', f: [520, 780], d: .16, v: .2 }]);
    Sfx.add('clear', [{ type: 'sine', f: [330, 440], d: .13, v: .2 }, { at: .1, type: 'sine', f: [440, 660], d: .2, v: .2 }]);
  }
  function item(id) {
    return (content.finds || []).find(function (x) { return x.id === id; }) ||
      (g && g.state.meta.customFinds || []).find(function (x) { return x.id === id; }) || { id: id, title: id, text: '', kind: 'tool', rarity: 'common' };
  }
  /** A picture (markup of ui/art.js) as a node; the picture of a find by what it is. */
  function pic(markup, cls) { return h('span', { class: 'mr-art' + (cls ? ' ' + cls : ''), innerHTML: markup }); }
  function findArt(f) { return Art.find(f.id, f.kind, f.rarity); }
  function num(n) { return g.fmt(n === undefined ? 0 : n); }
  function active() { return ['ready', 'playing', 'choice', 'shop'].indexOf(g.state.run.status) >= 0; }
  function passengerMult() { const p = g.links.status().passenger; return p && p.on && p.state === 'trip' ? (g.config['passenger.mult'] || 2) : 1; }
  function context() { return { now: Date.now(), config: g.config, rng: g.rng, mult: passengerMult(), links: g.links.status(), offline: false }; }
  function perform(fn, reason, sound) {
    const before = g.state.run.hearts;
    const oldStatus = g.state.run.status;
    const result = g.act(function (s) { return fn(s); }, { now: true, reason: reason || 'ход' });
    if (!result) { g.sfx('deny'); return false; }
    if (g.state.run.hearts < before) { g.sfx('mine'); g.buzz([60, 40, 90]); }
    else if (oldStatus === 'playing' && ['choice', 'shop', 'won'].includes(g.state.run.status)) { g.sfx('clear'); g.buzz([20, 40, 30]); }
    else { g.sfx(sound || 'open'); g.buzz('tap'); }
    checkAchievements();
    schedulePregen();
    return true;
  }
  function checkAchievements() {
    if (typeof sim.achievements === 'function') { sim.achievements(g.state, g.config).forEach(function (id) { g.achieve(id); }); return; }
    const r = g.state.run;
    if ((g.state.meta.stats.cells || 0) >= (g.config['achievement.cells'] || 10000)) g.achieve('cells-10000');
    if (r.depth >= (g.config.maxDepth || 12)) g.achieve('depth-12');
    if (r.status === 'won' && r.damage === 0) g.achieve('flawless');
    if (r.status === 'won' && r.toolsUsed === 0) g.achieve('no-tools');
  }
  function build(game) {
    g = game;
    g.el.app.classList.add('mr-game');
    view.title = h('h1', { class: 'mr-title', id: 'field-title' });
    view.depth = h('span', { class: 'mr-depth' });
    view.healthText = h('span', {});
    view.goldText = h('span', {});
    view.oreText = h('span', {});
    view.caption = h('div', { class: 'mr-caption', id: 'field-counts' });
    g.el.top.append(h('div', { class: 'mr-heading' }, view.title, view.depth),
      h('div', { class: 'mr-counters' }, h('span', { class: 'mr-health', title: 'Сердца' }, GameIcons.el('mr-heart'), view.healthText),
        h('span', { class: 'mr-gold', title: 'Золото' }, GameIcons.el('coin'), view.goldText),
        h('span', { class: 'mr-ore', title: 'Руда' }, GameIcons.el('gem'), view.oreText)), view.caption);
    view.board = h('div', { class: 'mr-board', id: 'board', role: 'grid', 'aria-label': 'Минное поле' });
    view.rowCounts = h('div', { class: 'mr-row-counts', hidden: true, 'aria-label': 'Мины по строкам' });
    view.boardWrap = h('div', { class: 'mr-board-wrap' }, view.rowCounts, view.board);
    view.boardNote = h('p', { class: 'mr-board-note', id: 'board-note' });
    view.boardColumn = h('div', { class: 'mr-board-column' }, view.boardWrap, view.boardNote);
    view.side = h('aside', { class: 'mr-side', 'aria-label': 'Талисманы', id: 'talismans' });
    view.layout = h('div', { class: 'mr-layout' }, view.boardColumn, view.side);
    g.el.field.append(view.layout);
    view.toolLabel = h('span', {}, 'Инструменты');
    view.toolPage = h('button', { class: 'mr-tool-page', id: 'tool-page', hidden: true, onclick: nextToolPage, 'aria-label': 'Следующие инструменты' });
    view.tools = h('div', { class: 'mr-tools', id: 'tools' });
    view.toolbox = h('div', { class: 'mr-toolbox' }, h('div', { class: 'mr-tool-head' }, view.toolLabel, view.toolPage), view.tools);
    view.open = h('button', { class: 'g-btn small', id: 'mode-open', onclick: function () { setInputMode('open'); } }, GameIcons.el('mr-probe'), 'Открыть');
    view.flag = h('button', { class: 'g-btn small', id: 'mode-flag', onclick: function () { setInputMode('flag'); } }, GameIcons.el('mr-flag'), 'Флаг');
    view.menu = h('button', { class: 'g-btn small', id: 'expedition-menu', 'aria-label': 'Забег и мастерская', onclick: function () { openPanel('run'); } }, GameIcons.el('mr-more'));
    view.controls = h('div', { class: 'mr-controls' }, h('div', { class: 'mr-control-row' }, view.open, view.flag, view.menu));
    view.notice = h('div', { class: 'mr-notice', id: 'game-message', role: 'status', 'aria-live': 'polite' });
    view.event = h('div', { class: 'mr-event', hidden: true, id: 'run-event' });
    g.el.actions.append(view.event, view.toolbox, view.controls, view.notice);
    bindBoard(); startWorker();
    if (window.ResizeObserver) new ResizeObserver(sizeBoard).observe(g.el.field);
    window.addEventListener('resize', sizeBoard);
    window.addEventListener('blur', cancelPointer);
    g.on('resize', sizeBoard);
    g.on('hidden', flushPrepared);
    g.on('visible', schedulePregen);
    g.on('prestige', function () { view.boardKey = ''; view.workerPlan = ''; schedulePregen(); });
    g.on('chest', function () { g.sfx('find'); });
    schedulePregen();
  }
  function setInputMode(mode) { view.selectedTool = ''; perform(function (s) { s.run.inputMode = mode; return true; }, 'управление', 'flag'); }
  /* Tap to flag and hold to open is the talisman «Лёгкая рука»; without it a tap opens and a hold flags. */
  function swapped(r) { return r.inputMode === 'flag' && (r.talismans || []).includes('light-hand'); }
  /* Pointer release owns touch actions. Vertical scrolling remains native. */
  function bindBoard() {
    view.board.addEventListener('pointerdown', function (e) {
      if (e.button !== 0 || view.busy || view.drag) return;
      const target = e.target.closest('.mr-cell');
      if (!target || target.dataset.hole === '1' || !['ready', 'playing'].includes(g.state.run.status)) return;
      const i = Number(target.dataset.index);
      view.drag = { id: e.pointerId, x: e.clientX, y: e.clientY, i: i, moved: false, held: false };
      view.drag.timer = setTimeout(function () {
        const d = view.drag;
        if (!d || d.moved || d.i !== i) return;
        d.held = true;
        activateCell(i, true);
      }, Number(g.config.flagHoldMs) || 300);
    });
    window.addEventListener('pointermove', function (e) {
      const d = view.drag;
      if (!d || d.id !== e.pointerId) return;
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > (Number(g.config.scrollCancelPx) || 8)) { d.moved = true; clearTimeout(d.timer); }
    });
    window.addEventListener('pointerup', function (e) {
      const d = view.drag;
      if (!d || d.id !== e.pointerId) return;
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > (Number(g.config.scrollCancelPx) || 8)) d.moved = true;
      clearTimeout(d.timer); view.drag = null;
      if (!d.moved && !d.held) activateCell(d.i, false);
    });
    view.board.addEventListener('pointercancel', cancelPointer);
    view.board.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    view.board.addEventListener('click', function (e) {
      if (e.detail !== 0) { e.preventDefault(); return; }
      const target = e.target.closest('.mr-cell');
      if (target) activateCell(Number(target.dataset.index), false);
    });
    view.board.addEventListener('keydown', function (e) {
      const target = e.target.closest('.mr-cell');
      if (!target) return;
      const i = Number(target.dataset.index);
      const f = g.state.run.field;
      const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -f.w, ArrowDown: f.w }[e.key];
      if (step) { e.preventDefault(); const next = view.boardNodes[Math.max(0, Math.min(view.boardNodes.length - 1, i + step))]; if (next) next.focus(); }
      if (['f', 'F', 'а', 'А'].includes(e.key)) { e.preventDefault(); activateCell(i, true, true); }
    });
  }
  function cancelPointer() { if (view.drag) clearTimeout(view.drag.timer); view.drag = null; }
  function activateCell(i, held, forceFlag) {
    if (view.busy || !['ready', 'playing'].includes(g.state.run.status)) return;
    if (view.selectedTool && !held && !forceFlag) {
      const selected = view.selectedTool;
      const ok = perform(function (s) { return sim.useTool(s, selected, i, g.config, passengerMult()); }, 'инструмент', 'find');
      if (ok && !g.state.run.tools[selected]) view.selectedTool = '';
      g.redraw(); return;
    }
    const shown = g.state.run.field && g.state.run.field.vis.charAt(i);
    const isFlag = shown !== 'o' && (forceFlag || (swapped(g.state.run) ? !held : held));
    perform(function (s) { return isFlag ? sim.flag(s, i, g.config) : sim.tap(s, i, g.config, passengerMult()); }, isFlag ? 'флаг' : 'открытие', isFlag ? 'flag' : 'open');
  }
  function nextToolPage() { view.toolPageNumber = (view.toolPageNumber || 0) + 1; view.toolsKey = ''; g.redraw(); }
  function selectTool(id) {
    if (INSTANT_TOOLS.includes(id)) { perform(function (s) { return sim.useTool(s, id, -1, g.config, passengerMult()); }, 'инструмент', 'find'); return; }
    view.selectedTool = view.selectedTool === id ? '' : id;
    view.toolsKey = ''; g.redraw();
  }
  function drawTools(s) {
    const list = (content.finds || []).filter(function (x) { return x.kind === 'tool' && s.run.tools[x.id] > 0; });
    const perPage = Math.max(1, Math.min(5, Number(g.config['ui.maxTools']) || 5));
    const pages = Math.max(1, Math.ceil(list.length / perPage));
    const page = (view.toolPageNumber || 0) % pages;
    if (view.selectedTool && !s.run.tools[view.selectedTool]) view.selectedTool = '';
    const key = JSON.stringify(s.run.tools) + '|' + view.selectedTool + '|' + page + '|' + perPage + '|' + s.run.status;
    if (view.toolsKey === key) return;
    view.toolsKey = key;
    view.toolPage.hidden = pages <= 1;
    view.toolPage.textContent = (page + 1) + '/' + pages;
    view.toolbox.hidden = !list.length || !['ready', 'playing'].includes(s.run.status);
    view.toolLabel.textContent = view.selectedTool ? item(view.selectedTool).title + ': выберите клетку' : 'Инструменты';
    view.tools.replaceChildren();
    list.slice(page * perPage, page * perPage + perPage).forEach(function (tool) {
      const b = h('button', { class: 'mr-tool' + (view.selectedTool === tool.id ? ' on' : ''), id: 'tool-' + tool.id,
        title: tool.title + ' — ' + tool.text, 'aria-label': tool.title + ', зарядов: ' + s.run.tools[tool.id],
        'aria-pressed': String(view.selectedTool === tool.id), onclick: function () { selectTool(tool.id); }
      }, pic(findArt(tool), 'mr-tool-art'), h('span', {}, SHORT_TOOL[tool.id] || tool.title), h('b', { class: 'mr-charge' }, String(s.run.tools[tool.id])));
      view.tools.append(b);
    });
  }
  function drawBoard(s, info) {
    const f = s.run.field;
    if (!f) return;
    const key = s.run.seed + ':' + s.run.fieldIndex + ':' + f.w + ':' + f.h;
    if (view.boardKey !== key) {
      cancelPointer(); view.boardKey = key; view.boardNodes = []; view.board.replaceChildren();
      view.board.setAttribute('aria-colcount', f.w);
      view.board.setAttribute('aria-rowcount', f.h);
      for (var i = 0; i < f.w * f.h; i++) {
        const b = h('button', { class: 'mr-cell', type: 'button', role: 'gridcell', 'data-index': i, 'aria-label': 'Закрытая клетка' });
        view.boardNodes.push(b); view.board.append(b);
      }
      g.el.field.scrollTop = 0;
    }
    const lastReading = f.readings && f.readings[f.readings.length - 1];
    (info.cells || []).forEach(function (c, i) {
      const b = view.boardNodes[i];
      if (!b) return;
      const open = c.shown === true || c.shown === 'o' || c.shown === 'x';
      const mine = !!c.mine;
      const fflag = !!c.flag;
      const number = c.number === null || c.number === undefined ? '' : c.number;
      const classes = ['mr-cell'];
      if (open) classes.push('open');
      if (c.hole) classes.push('hole');
      if (fflag) classes.push('flag');
      if (mine && open) classes.push('mine');
      if (c.deaf || c.fogged) classes.push('deaf');
      if (c.earth && !open) classes.push('earth');
      if (c.cache && !open) classes.push('cache');
      if (open && typeof number === 'number') classes.push('n' + Math.min(8, number));
      if (c.probe === 'safe' || c.probe === 0) classes.push('probe-safe');
      if (c.probe === 'mine' || c.probe > 0) classes.push('probe-mine');
      if (c.flash) classes.push('flash');
      if (lastReading && lastReading.tool === 'lantern' && lastReading.cells.includes(i)) classes.push('lit');
      let markup = '';
      let label = 'Закрытая клетка';
      if (c.hole) label = 'Провал';
      else if (fflag) {
        markup = Art.flag(c.flagWeight === 2); label = 'Флаг';
        if (c.flagWeight === 2) { markup += '<span class="mr-mini">2</span>'; label = 'Двойная мина: флаг'; }
      } else if (mine && open) { markup = Art.mine(); label = 'Обезвреженная мина'; }
      else if (open) {
        if (c.deaf || c.fogged || number === '?') { markup = '·'; label = c.fogged ? 'Туман: нажмите, чтобы вспомнить число' : 'Число скрыто'; }
        else { markup = number > 0 ? String(number) : ''; label = number > 0 ? 'Число ' + number : 'Пустая клетка'; }
      } else if (c.earth) { markup = GameIcons.svg('mr-earth'); label = 'Подсказка земли: безопасная клетка'; }
      else if (c.probe === 'safe' || c.probe === 0) { markup = '○'; label = 'Щуп: безопасно'; }
      else if (c.probe === 'mine' || c.probe > 0) { markup = Art.mine(); label = 'Щуп: мина'; }
      if (c.clock !== null && c.clock !== undefined && c.clock >= 0 && !fflag) {
        markup += '<span class="mr-mini">' + Number(c.clock) + '</span>';
        label += ', до взрыва открытий: ' + c.clock;
      }
      if (lastReading && lastReading.tool === 'compass' && lastReading.i === i && lastReading.target >= 0) {
        const dx = lastReading.target % f.w - i % f.w;
        const dy = Math.floor(lastReading.target / f.w) - Math.floor(i / f.w);
        const angle = Math.atan2(dx, -dy) * 180 / Math.PI;
        markup = '<span class="mr-compass-arrow" style="transform:rotate(' + angle + 'deg)">' + GameIcons.svg('mr-arrow') + '</span>';
        label += ', направление компаса';
      }
      if (c.cache && !open) label += ', узор тайника';
      const renderKey = classes.join(' ') + markup + label;
      if (b._renderKey !== renderKey) {
        b._renderKey = renderKey; b.className = classes.join(' '); b.innerHTML = markup;
        b.dataset.hole = c.hole ? '1' : '0';
        b.setAttribute('aria-label', (Math.floor(i / f.w) + 1) + ', ' + (i % f.w + 1) + ': ' + label);
      }
    });
    const rows = f.rowCounts || [];
    view.rowCounts.hidden = !rows.length;
    if (view.rowsKey !== rows.join(',')) {
      view.rowsKey = rows.join(',');
      view.rowCounts.replaceChildren.apply(view.rowCounts, rows.map(function (n) { return h('span', {}, String(n)); }));
    }
    const controls = swapped(s.run) ?'Касание — флаг. Удержание — открыть. Число открывает соседей, когда флагов достаточно.' : 'Удержание — флаг. Нажмите число, чтобы открыть соседей, когда флагов достаточно.';
    view.boardNote.textContent = !f.generated ? 'Первое касание безопасно. Удержание — флаг; ведите вверх, чтобы прокрутить.' :
      (info.bossText ? info.bossText + ' ' : '') + controls + (f.doubles ? ' Повторный флаг: 1 → 2 → снять.' : '');
    sizeBoard();
  }
  function sizeBoard() {
    if (!g || !view.boardColumn) return;
    const f = g.state.run.field;
    if (!f) return;
    const w = Math.max(1, f.w);
    const hgt = Math.max(1, f.h);
    const available = view.boardColumn.clientWidth - (view.rowCounts.hidden ? 0 : 26) - 2;
    let size = (available - w + 1) / w;
    if (window.innerWidth >= 690) size = Math.min(size, (g.el.field.clientHeight - view.boardNote.offsetHeight - 24 - hgt + 1) / hgt);
    size = Math.max(20, Math.floor(size * 10) / 10);
    view.layout.style.setProperty('--cols', w);
    view.layout.style.setProperty('--rows', hgt);
    view.layout.style.setProperty('--cell', size + 'px');
  }
  function drawSide(s) {
    const key = s.run.talismans.join(',') + '|' + s.run.bosses.join(',') + '|' + s.run.fieldIndex + '|' + JSON.stringify(s.run.extraFinds || []);
    if (view.sideKey === key) return;
    view.sideKey = key; view.side.replaceChildren(h('h3', {}, 'Талисманы'));
    if (!s.run.talismans.length) view.side.append(h('p', { class: 'mr-empty' }, 'После поля выберите находку. Талисманы останутся до конца забега.'));
    s.run.talismans.forEach(function (id) { const f = item(id); view.side.append(card(f.title, f.text, null, null, findArt(f))); });
    (s.run.extraFinds || []).forEach(function (f) { view.side.append(card(f.title, f.text, null, null, Art.find(f.id, f.kind || 'talisman', f.rarity))); });
    const info = sim.view(s, g.config);
    if (info.bossText) view.side.append(h('div', { class: 'mr-rule' }, info.bossText));
  }
  function drawEvent(s) {
    const r = s.run;
    const key = r.status + '|' + r.reward + '|' + r.completed + '|' + r.gold;
    if (view.eventKey === key) return;
    view.eventKey = key; view.event.replaceChildren();
    view.event.hidden = !['ready', 'choice', 'shop', 'won', 'lost'].includes(r.status);
    if (view.event.hidden) return;
    let title = ''; let text = ''; let buttonText = ''; let fn = function () {};
    if (r.status === 'ready') { title = 'Ваша первая экспедиция'; text = 'Семь полей. Угадывать не нужно.'; buttonText = 'Начать'; fn = startNewRun; }
    else if (r.status === 'choice') { title = 'Поле разгадано'; text = 'Выберите одну находку'; buttonText = 'Находки'; fn = function () { openPanel('choice'); }; }
    else if (r.status === 'shop') { title = 'Лавка между слоями'; text = 'Золото: ' + num(r.gold); buttonText = 'В лавку'; fn = function () { openPanel('shop'); }; }
    else { title = r.status === 'won' ? 'Хозяин пройден' : 'Забег окончен'; text = 'Полей: ' + r.completed + ' · руда +' + num(r.reward || 0); buttonText = 'Дальше'; fn = function () { openPanel('run'); }; }
    view.event.append(h('div', { class: 'mr-event-text' }, h('div', { class: 'mr-event-title' }, title), h('div', { class: 'g-note' }, text)),
      h('button', { class: 'g-btn primary small', id: 'event-action', onclick: fn }, buttonText));
  }
  function card(title, text, right, attrs, art) {
    const main = h('div', { class: 'mr-card-main' }, h('span', { class: 'mr-card-title' }, title), text ? h('span', { class: 'mr-card-text' }, text) : null);
    return h(attrs && attrs.onclick ? 'button' : 'div', Object.assign({ class: 'mr-card' }, attrs || {}), art ? pic(art) : null, main, right || null);
  }
  function closePanel() { if (view.sheet) view.sheet(); view.sheet = null; view.panelBody = null; view.panelKey = ''; }
  function openPanel(tab) {
    closePanel(); view.panel = tab || 'run';
    view.selectedMode = g.state.run.mode || 'rogue'; view.selectedSapper = g.state.run.sapper || 'sapper'; view.selectedDepth = g.state.run.depth || 0;
    view.panelTitle = h('h3', {}); view.tabs = h('div', { class: 'mr-tabs', role: 'tablist' }); view.panelBody = h('div', { class: 'mr-panel-body' });
    TABS.forEach(function (t) { view.tabs.append(h('button', { class: 'mr-tab', role: 'tab', 'data-tab': t[0], onclick: function () { view.panel = t[0]; view.panelKey = ''; drawPanel(g.state); } }, t[1])); });
    const body = h('div', { class: 'mr-panel' }, view.panelTitle, view.tabs, view.panelBody, h('button', { class: 'g-btn small', onclick: closePanel }, 'К полю'));
    view.sheet = g.sheet(body, function () { view.sheet = null; view.panelBody = null; view.panelKey = ''; });
    drawPanel(g.state);
  }
  function drawPanel(s) {
    if (!view.panelBody) return;
    const key = view.panel + '|' + JSON.stringify([s.run.status, s.run.gold, s.run.tools, s.run.talismans, s.run.extraFinds, s.run.choices, s.run.shop, s.meta.workshop, s.meta.ore, s.meta.album, s.meta.stats, s.meta.unlocked, s.meta.nextProbe, s.layers.depth]);
    if (view.panelKey === key) return;
    view.panelKey = key; view.tabs.hidden = ['choice', 'shop'].includes(view.panel);
    view.tabs.querySelectorAll('button').forEach(function (b) { b.classList.toggle('on', b.dataset.tab === view.panel); b.setAttribute('aria-selected', String(b.dataset.tab === view.panel)); });
    view.panelBody.replaceChildren();
    if (view.panel === 'choice') drawChoice(s);
    else if (view.panel === 'shop') drawShop(s);
    else if (view.panel === 'workshop') drawWorkshop(s);
    else if (view.panel === 'album') drawAlbum(s);
    else if (view.panel === 'stats') drawStats(s);
    else if (view.panel === 'bag') drawBag(s);
    else drawRun(s);
  }
  function drawChoice(s) {
    view.panelTitle.textContent = 'Выберите находку';
    if (s.run.status !== 'choice') { view.panel = s.run.status === 'shop' ? 'shop' : 'bag'; view.panelKey = ''; drawPanel(s); return; }
    s.run.choices.forEach(function (id) {
      const f = item(id);
      const charge = f.kind === 'tool' ? ' · зарядов: ' + ((g.config['tool.' + id + '.charges'] || 1) + (s.run.talismans.includes('belt') ? g.config['talisman.belt.charges'] : 0)) : '';
      view.panelBody.append(card(f.title, RARITY[f.rarity] + charge + '. ' + f.text, null, { id: 'choose-' + id, onclick: function () {
        if (perform(function (state) { return sim.choose(state, id, g.config); }, 'находка', 'find')) {
          if (g.state.run.status === 'shop') { view.panel = 'shop'; view.panelKey = ''; drawPanel(g.state); } else closePanel();
        }
      } }, findArt(f)));
    });
  }
  function drawShop(s) {
    view.panelTitle.textContent = 'Лавка · ' + num(s.run.gold) + ' золота';
    if (s.run.status !== 'shop') { view.panel = 'bag'; view.panelKey = ''; drawPanel(s); return; }
    (s.run.shop || []).forEach(function (offer) {
      const f = item(offer.id);
      const buy = h('button', { class: 'mr-buy', id: 'shop-' + offer.id, disabled: offer.bought || Big.lt(s.run.gold, offer.price),
        onclick: function () { perform(function (state) { return sim.shopBuy(state, offer.id, g.config); }, 'лавка', 'buy'); }
      }, offer.bought ? 'Куплено' : num(offer.price));
      view.panelBody.append(card(f.title, f.text, buy, offer.bought ? { class: 'mr-card off' } : null, findArt(f)));
    });
    view.panelBody.append(h('button', { class: 'g-btn primary', id: 'next-field', onclick: function () {
      if (perform(function (state) { return sim.advance(state, g.config); }, 'следующее поле', 'open')) closePanel();
    } }, s.run.mode === 'rogue' && s.run.completed === g.config['run.fields'] - 1 ? 'К хозяину' : 'Следующее поле'));
    if (s.run.mode === 'rogue' && s.run.completed === g.config['run.fields'] - 1) {
      view.panelBody.append(h('button', { class: 'g-btn small', id: 'continue-deep', onclick: function () {
        if (perform(function (state) { return sim.continueDeeper(state, g.config); }, 'глубже', 'open')) closePanel();
      } }, 'Продолжить «Глубже»'));
      view.panelBody.append(h('p', { class: 'g-note' }, 'Сохраните снаряжение и уйдите в бесконечные поля. Руду можно забрать в меню забега.'));
    }
  }
  function drawWorkshop(s) {
    view.panelTitle.textContent = 'Мастерская · ' + num(s.meta.ore) + ' руды';
    (content.workshop || []).forEach(function (w) {
      const level = s.meta.workshop[w.id] || 0;
      const max = sim.workshopMax(w.id, g.config);
      const cost = sim.workshopCost(s, w.id, g.config);
      const b = h('button', { class: 'mr-buy', id: 'upgrade-' + w.id, disabled: level >= max || Big.lt(s.meta.ore, cost), onclick: function () {
        perform(function (state) { return sim.buyWorkshop(state, w.id, g.config); }, 'мастерская', 'buy');
      } }, level >= max ? 'Макс.' : num(cost));
      // an improvement with no ceiling shows its level alone
      view.panelBody.append(card(w.title + ' · ' + (isFinite(max) ? level + '/' + max : 'уровень ' + level), w.text, b, level >= max ? { class: 'mr-card full' } : null, Art.workshop(w.id)));
    });
    view.panelBody.append(h('p', { class: 'g-note' }, 'Улучшения работают со следующего забега. Руда остаётся после поражения.'));
  }
  function drawBag(s) {
    view.panelTitle.textContent = 'Снаряжение';
    const tools = Object.keys(s.run.tools).filter(function (id) { return s.run.tools[id] > 0; });
    tools.forEach(function (id) {
      const f = item(id);
      const b = h('button', { class: 'mr-buy', disabled: !['ready', 'playing'].includes(s.run.status), onclick: function () { closePanel(); selectTool(id); } }, 'Выбрать');
      view.panelBody.append(card(f.title + ' ×' + s.run.tools[id], f.text, b, null, findArt(f)));
    });
    if (!tools.length) view.panelBody.append(h('p', { class: 'mr-empty' }, 'Инструментов пока нет. Они встречаются в тайниках, находках и лавке.'));
    view.panelBody.append(h('h3', {}, 'Талисманы'));
    s.run.talismans.forEach(function (id) { const f = item(id); view.panelBody.append(card(f.title, f.text, null, null, findArt(f))); });
    (s.run.extraFinds || []).forEach(function (f) { view.panelBody.append(card(f.title, f.text, null, null, Art.find(f.id, f.kind || 'talisman', f.rarity))); });
    if (!s.run.talismans.length) view.panelBody.append(h('p', { class: 'mr-empty' }, 'Талисманы действуют до конца забега.'));
  }
  function drawAlbum(s) {
    const list = content.finds || [];
    const found = list.filter(function (x) { return s.meta.album[x.id]; }).length;
    view.panelTitle.textContent = 'Альбом · ' + found + '/' + list.length;
    list.forEach(function (f) {
      const known = !!s.meta.album[f.id];
      view.panelBody.append(card(f.title, f.text, h('span', { class: 'mr-card-tag' }, known ? 'Найдено' : 'Не найдено'), { class: 'mr-card' + (known ? '' : ' off') }, known ? findArt(f) : Art.unknown()));
    });
  }
  function drawStats(s) {
    view.panelTitle.textContent = 'Статистика';
    const st = s.meta.stats;
    const fields = st.generated || st.fields || 0;
    [['Забеги', st.runs], ['Победы', st.wins], ['Пройденные поля', st.fields], ['Разгаданные клетки', st.cells], ['Взорванные мины', st.mines],
      ['Подсказки земли', st.hints], ['Рекорд «Глубже»', st.bestDeep], ['Глубина открыта', s.meta.depthUnlocked || 0]].forEach(function (row) {
      view.panelBody.append(g.ui.line(row[0], num(row[1] || 0)));
    });
    if (fields) view.panelBody.append(g.ui.line('Поля с подсказкой земли', g.fmt.pct((st.hints || 0) / fields)));
    view.panelBody.append(h('button', { class: 'g-btn small', onclick: function () { closePanel(); g.ui.achievements(); } }, 'Ачивки'));
    view.panelBody.append(h('p', { class: 'g-note' }, 'Пока игра закрыта, поле и отсчёты стоят. Каждый ход сохраняется.'));
  }
  function drawRun(s) {
    view.panelTitle.textContent = 'Следующий забег';
    if (['choice', 'shop'].includes(s.run.status)) view.panelBody.append(h('button', { class: 'g-btn primary', onclick: function () {
      view.panel = s.run.status; view.panelKey = ''; drawPanel(g.state);
    } }, s.run.status === 'choice' ? 'Выбрать находку' : 'Вернуться в лавку'));
    view.panelBody.append(h('p', { class: 'g-note' }, 'Режим'));
    const modeSelect = h('select', { class: 'mr-select', id: 'run-mode', 'aria-label': 'Режим' });
    MODES.forEach(function (m) { modeSelect.append(h('option', { value: m.id, selected: m.id === view.selectedMode }, m.title)); });
    const modeText = h('p', { class: 'g-note' }, (MODES.find(function (m) { return m.id === view.selectedMode; }) || MODES[0]).text);
    modeSelect.addEventListener('change', function () { view.selectedMode = modeSelect.value; modeText.textContent = MODES.find(function (m) { return m.id === view.selectedMode; }).text; updateStartText(); });
    view.panelBody.append(modeSelect, modeText, h('p', { class: 'g-note' }, 'Сапёр'));
    // the sappers as cards with portraits: a closed one says what opens it
    const sapperList = h('div', { class: 'mr-sappers', id: 'run-sapper', role: 'radiogroup', 'aria-label': 'Сапёр' });
    (content.sappers || []).forEach(function (p) {
      const open = !!s.meta.unlocked[p.id];
      const on = p.id === view.selectedSapper;
      sapperList.append(card(p.title, open ? p.text : 'Откроется: ' + p.unlock, null, {
        class: 'mr-card' + (on ? ' on' : '') + (open ? '' : ' off'), id: 'sapper-' + p.id, disabled: !open, role: 'radio', 'aria-checked': String(on),
        onclick: function () { view.selectedSapper = p.id; view.panelKey = ''; drawPanel(g.state); }
      }, Art.sapper(p.id)));
    });
    view.panelBody.append(sapperList);
    const depth = h('select', { class: 'mr-select', id: 'run-depth', 'aria-label': 'Глубина' });
    for (var n = 0; n <= (s.meta.depthUnlocked || 0); n++) depth.append(h('option', { value: n, selected: n === view.selectedDepth }, 'Глубина ' + n + (n ? ' · руда +' + Math.round(n * g.config['depth.oreBonus'] * 100) + ' %' : ' · начало')));
    const depthText = h('p', { class: 'g-note' });
    function describeDepth() {
      view.selectedDepth = Number(depth.value);
      depthText.textContent = (content.depths || []).filter(function (d) { return d.n <= view.selectedDepth; }).map(function (d) { return d.text; }).join(' · ') || 'Обычные условия. Победа открывает следующий спуск.';
    }
    depth.addEventListener('change', describeDepth);
    view.panelBody.append(h('p', { class: 'g-note' }, 'Глубина'), depth, depthText);
    describeDepth();
    const start = h('button', { class: 'g-btn primary', id: 'start-run' });
    function updateStartText() { start.textContent = active() && s.run.field && s.run.field.generated ? 'Удерживайте: новый забег' : view.selectedMode === 'daily' ? 'Играть поле дня' : 'Начать забег'; }
    updateStartText();
    if (active() && s.run.field && s.run.field.generated) g.ui.hold(start, g.config['prestige.holdMs'], startNewRun);
    else start.addEventListener('click', startNewRun);
    view.panelBody.append(start);
    if (g.game.prestige && g.game.prestige.length) view.panelBody.append(g.ui.prestigeButton('depth', { label: 'Открыть следующую глубину' }));
    view.panelBody.append(h('button', { class: 'g-btn small', id: 'steps-probe', disabled: !!s.meta.nextProbe, onclick: buyStepProbe }, s.meta.nextProbe ? 'Щуп от шагов готов' : 'Щуп от шагов · ' + (g.config['steps.cost.probe-start'] || 1) + ' энергия'));
    view.panelBody.append(h('button', { class: 'g-btn small', id: 'stock-rule', onclick: function () { takeStock('rules'); } }, 'Новое правило из запаса'));
    view.panelBody.append(h('button', { class: 'g-btn small', id: 'stock-find', disabled: s.run.mode === 'pure' || !['playing', 'choice', 'shop'].includes(s.run.status), onclick: function () { takeStock('finds'); } }, 'Новая находка из запаса'));
    if (s.run.mode === 'deep' && ['playing', 'ready'].includes(s.run.status)) {
      const collect = h('button', { class: 'g-btn small', id: 'collect-deep' }, 'Удерживайте: завершить и забрать руду');
      g.ui.hold(collect, g.config['prestige.holdMs'], function () {
        if (perform(function (state) { return sim.endRun(state, g.config, passengerMult()); }, 'завершение забега', 'clear')) closePanel();
      });
      view.panelBody.append(collect);
    }
  }
  async function buyStepProbe() {
    if (view.busy || g.state.meta.nextProbe) return;
    view.busy = true;
    try {
      const r = await g.links.spend('probe-start');
      if (!r.ok) { ui.toast(r.off ? 'Связка «Шаги» выключена' : 'Недостаточно энергии шагов'); return; }
      perform(function (s) { return sim.applyStepProbe(s, g.config); }, 'заряд шагов', 'find');
      ui.toast('Щуп с двумя зарядами готов к следующему забегу');
    } catch (error) { ui.toast('Не удалось получить заряд шагов'); }
    finally { view.busy = false; }
  }
  async function takeStock(kind) {
    if (view.busy) return;
    view.busy = true;
    try {
      const stock = await g.stock.take(kind);
      if (!stock) { ui.toast('Запас пуст. Встроенный набор всегда доступен.'); return; }
      if (perform(function (s) { return sim.installStock(s, kind, stock, g.config, Date.now()); }, 'новый контент', 'find')) ui.toast(kind === 'finds' ? 'Находка действует в этом забеге' : 'Добавлено к следующим забегам');
      else ui.toast('Правило не прошло проверку');
    } catch (error) { ui.toast('Не удалось получить запас'); }
    finally { view.busy = false; }
  }
  async function startNewRun() {
    if (view.busy) return;
    view.busy = true;
    let daily = null;
    try {
      if (view.selectedMode === 'daily') daily = await g.stock.take('daily');
      if (daily && sim.validateStock('daily', daily)) { ui.toast('Правило не прошло проверку'); return; }
      const opts = { mode: view.selectedMode, sapper: view.selectedSapper, depth: view.selectedDepth, daily: daily };
      if (perform(function (s) { if (['playing', 'choice', 'shop'].includes(s.run.status)) sim.endRun(s, g.config, passengerMult()); return sim.startRun(s, g.config, opts, context()); }, 'новый забег', 'open')) {
        view.selectedTool = ''; view.toolPageNumber = 0; view.workerPlan = ''; closePanel();
      }
    } catch (error) { ui.toast('Не удалось начать забег'); }
    finally { view.busy = false; schedulePregen(); }
  }
  function startWorker() {
    if (!window.Worker) return;
    try {
      view.worker = new Worker('../logic/worker.js');
      view.worker.onmessage = function (e) {
        const data = e.data || {};
        if (data.type === 'field') {
          view.workerQueue.push({ key: data.key, start: data.start, field: data.field });
          if (!view.workerFlush) view.workerFlush = setTimeout(flushPrepared, 250);
        } else if (data.type === 'done') flushPrepared();
        else if (data.type === 'error' && g) g.log('Запас поля: ' + String(data.message || 'ошибка генерации'));
      };
      view.worker.onerror = function () { view.worker.terminate(); view.worker = null; };
    } catch (error) { view.worker = null; }
  }
  function flushPrepared() {
    if (view.workerFlush) clearTimeout(view.workerFlush);
    view.workerFlush = null;
    if (!g || !view.workerQueue.length) return;
    const list = view.workerQueue.splice(0);
    g.act(function (s) { return sim.acceptPrepared(s, list, g.config); }, { now: true, reason: 'запас полей' });
  }
  function schedulePregen() {
    if (!g || !view.worker || view.queueTimer) return;
    view.queueTimer = setTimeout(function () {
      view.queueTimer = null;
      const jobs = sim.prepareRequests(g.state, g.config);
      const key = jobs.map(function (job) { return job.key; }).join('|');
      if (key === view.workerPlan) return;
      view.workerPlan = key;
      jobs.forEach(function (job) {
        const saved = g.state.run.pregen.filter(function (p) { return p.key === job.key; }).map(function (p) { return p.start; });
        job.starts = window.MineBoard.startOrder(job.spec.w, job.spec.h).filter(function (i) { return !saved.includes(i); });
      });
      view.worker.postMessage({ type: 'prepare', jobs: jobs });
    }, 0);
  }
  function render(s) {
    const info = sim.view(s, g.config);
    const r = s.run;
    view.title.textContent = info.title || info.layer || 'Дёрн';
    view.depth.textContent = 'Глубина ' + (r.depth || 0);
    view.healthText.textContent = r.status === 'ready' ? String(g.config['start.hearts']) : r.hearts + '/' + r.maxHearts;
    view.goldText.textContent = num(r.gold);
    view.oreText.textContent = num(s.meta.ore);
    const fields = r.mode === 'rogue' || r.mode === 'daily' ? (r.fieldIndex + 1) + '/' + g.config['run.fields'] : String(r.fieldIndex + 1);
    view.caption.textContent = 'Поле ' + fields + ' · мин: ' + (info.totalMines === undefined ? (r.field ? r.field.mines : 0) : info.totalMines) +
      ' · двойных: ' + (info.doubles || (r.field ? r.field.doubles : 0)) + (r.talismans.includes('counter') ? ' · осталось: ' + info.remaining : '');
    const light = (r.talismans || []).includes('light-hand');
    view.open.classList.toggle('on', !swapped(r)); view.flag.classList.toggle('on', swapped(r));
    view.open.setAttribute('aria-pressed', String(!swapped(r))); view.flag.setAttribute('aria-pressed', String(swapped(r)));
    view.open.hidden = !light; view.flag.hidden = !light;
    view.open.disabled = r.status !== 'playing'; view.flag.disabled = view.open.disabled;
    view.notice.textContent = r.message || (view.selectedTool ? item(view.selectedTool).text : '');
    if (!r.field) view.boardNote.textContent = 'Открывайте безопасные клетки. Число показывает мины рядом. Удержание ставит флаг. Сердца дают право на ошибку, а находки помогают идти глубже.';
    view.boardWrap.hidden = !r.field;
    drawBoard(s, info); drawTools(s); drawSide(s); drawEvent(s); drawPanel(s); schedulePregen();
  }
  try {
    const names = ['finds', 'layers', 'bosses', 'sappers', 'workshop', 'depths'];
    await Promise.all(names.map(async function (name) {
      const response = await fetch('../content/' + name + '.json');
      if (!response.ok) throw new Error('Не удалось прочитать ' + name);
      content[name] = await response.json();
    }));
    sim.configure(content);
    await Game.start({ sim: sim, render: render, init: build });
    sim.configure(content, g.config);
  } catch (error) { document.body.append(h('p', { class: 'g-error' }, 'Не удалось открыть игру: ' + error.message)); }
})();

