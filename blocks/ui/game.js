/* The screen owns gestures and presentation. Every saved change goes through g.act. */
(async function () {
  'use strict';
  const h = ui.h;
  const B = window.BlocksBoard;
  const L = window.BlocksLevels;
  const sim = window.GameSim;
  const view = {};
  const data = {};
  const toolIcons = { rotate: 'b-rotate', bomb: 'b-bomb', reroll: 'dice', undo: 'b-undo', eraser: 'b-eraser', hammer: 'b-row', ruler: 'b-column', cutter: 'b-cut' };
  const modes = { classic: 'Обычная партия', big: 'Большое поле', twin: 'Два поля', daily: 'Задача дня', challenge: 'Испытания' };
  let g;
  let selected = -1;
  let activeTool = '';
  let preview = null;
  let drag = null;
  let burn = null;
  let lastTray = '';
  let lastGame = null;
  let sheetClose = null;
  let sheetUpdate = null;
  let hintTimer = 0;
  let liveTimer = 0;
  let result = null;
  let freshPending = false;
  const namesPending = {};

  function num(key, fallback) { return g && Number.isFinite(Number(g.config[key])) ? Number(g.config[key]) : fallback; }
  function current() { return g && g.state.run.game; }
  function fmt(value) { return g.fmt(value); }
  function icon(name) { return GameIcons.el(name); }
  function button(text, fn, cls, symbol) {
    return h('button', { type: 'button', class: 'g-btn ' + (cls || ''), onclick: fn }, symbol ? icon(symbol) : null, text);
  }
  function announce(text) {
    view.live.textContent = '';
    clearTimeout(liveTimer);
    liveTimer = setTimeout(function () { view.live.textContent = text; }, 20);
  }
  function feedback(ok, sound) {
    g.sfx(ok ? (sound || 'tap') : 'deny');
    g.buzz(ok ? (sound === 'level' ? 'level' : 'tap') : 'deny');
  }
  function notify(text) { announce(text); ui.toast(text); }
  function achieve(list) { (list || []).forEach(function (id) { g.achieve(id); }); }
  function dateKey() {
    const now = new Date();
    return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
  }
  function closeSheet() {
    if (sheetClose) sheetClose();
    sheetClose = null;
    sheetUpdate = null;
  }
  function sheet(title, content, update) {
    closeSheet();
    const root = h('section', { class: 'g-sheet b-sheet' }, h('div', { class: 'b-sheet-heading' }, h('h3', {}, title), button('Закрыть', closeSheet, 'b-close')));
    root.append(content);
    sheetClose = g.sheet(root, function () { sheetClose = null; sheetUpdate = null; });
    sheetUpdate = update || null;
  }
  function held(text, fn) {
    const el = button(text, null, 'primary');
    g.ui.hold(el, g.config['prestige.holdMs'], fn);
    return el;
  }
  function finishCurrent() {
    if (!current()) return null;
    const out = g.act(function (state) { return sim.endGame(state, g.config, g.links.mult()); }, { now: true, reason: 'game-end' });
    if (out) achieve(out.ach);
    return out;
  }
  function launch(mode, options) {
    closeSheet();
    if (current()) finishCurrent();
    selected = -1;
    activeTool = '';
    preview = null;
    result = null;
    const opts = Object.assign({ rng: g.rng }, options || {});
    if (mode === 'daily') opts.day = dateKey();
    g.act(function (state) { sim.newGame(state, g.config, mode, opts); }, { now: true, reason: 'game-start' });
    if (mode === 'challenge') loadChallengeName(opts.index);
    feedback(true);
    announce('Партия началась. Выберите фигуру в лотке.');
  }
  function requestLaunch(mode, options) {
    if (!current()) return launch(mode, options);
    const note = current().mode === 'challenge' ? 'Текущий ход испытания будет сброшен.' : 'Текущая партия закончится, заработанные монеты сохранятся.';
    sheet('Новая партия', h('div', { class: 'b-stack' }, h('p', { class: 'g-note' }, note), held('Удержать: начать заново', function () { launch(mode, options); })));
  }

  function installIcons() {
    const paths = {
      'b-rotate': '<path d="M6 7a7 7 0 1 1-1 9M6 3v5H1"/>',
      'b-bomb': '<circle cx="11" cy="14" r="7"/><path d="m15 8 3-3m-1-3 1 3 3 1"/>',
      'b-undo': '<path d="M8 5 3 10l5 5M3 10h11a6 6 0 0 1 0 12"/>',
      'b-eraser': '<path d="m4 13 9-9 7 7-9 9H7l-3-3zM10 7l7 7M11 20h10"/>',
      'b-row': '<path d="M3 4h18v16H3zM3 9h18M3 15h18M9 4v16M15 4v16"/><path d="M4 12h16" stroke-width="3"/>',
      'b-column': '<path d="M3 4h18v16H3zM3 9h18M3 15h18M9 4v16M15 4v16"/><path d="M12 5v14" stroke-width="3"/>',
      'b-cut': '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="m8 8 13 13M8 16 21 3"/>',
      'b-grid': '<path d="M3 3h18v18H3zM3 9h18M3 15h18M9 3v18M15 3v18"/>',
      'b-hint': '<path d="M8 16c-6-5-2-13 4-13s10 8 4 13l-1 2H9zM9 21h6"/>',
      'b-reserve': '<path d="M3 8h18v13H3zM7 8V3h10v5M9 14h6"/>'
    };
    Object.keys(paths).forEach(function (name) { GameIcons.add(name, paths[name]); });
  }

  function build(game) {
    g = game;
    installIcons();
    g.el.app.classList.add('blocks-app');
    view.score = h('strong', { class: 'b-score', id: 'score' }, '0');
    view.scoreLabel = h('span', { class: 'b-eyebrow' }, 'Счёт');
    view.streak = h('span', { class: 'b-streak', id: 'streak' });
    view.coins = h('span', { class: 'b-coins', id: 'coins' });
    view.rank = h('span', { class: 'b-rank' });
    view.next = h('div', { class: 'b-next' });
    view.record = h('span', { class: 'b-record' });
    g.el.top.append(h('div', { class: 'b-score-group' }, view.scoreLabel, view.score), h('div', { class: 'b-totals' }, view.streak, h('span', { class: 'b-money' }, icon('coin'), view.coins), view.rank, view.record), view.next);

    view.mode = h('span', { class: 'b-mode' });
    view.deal = h('span', { class: 'g-note b-deal' });
    view.status = h('div', { class: 'b-status', id: 'status' });
    view.boards = h('div', { class: 'b-boards', id: 'boards' });
    view.guide = h('p', { class: 'b-guide g-note', id: 'board-help' });
    view.quick = h('div', { class: 'b-quick' });
    view.lobby = h('div', { class: 'b-lobby' });
    view.nextCompact = h('div', { class: 'b-next-compact' });
    view.gameArea = h('div', { class: 'b-game-area' }, h('div', { class: 'b-board-heading' }, view.mode, view.deal), view.boards, view.status, view.guide, view.quick, view.nextCompact);
    g.el.field.append(view.lobby, view.gameArea);

    view.tray = h('div', { class: 'b-tray', id: 'tray', role: 'group', 'aria-label': 'Фигуры в лотке' });
    view.trayCaption = h('div', { class: 'b-tray-caption' });
    view.reserve = button('Запас', reserve, 'b-reserve', 'b-reserve');
    view.hint = button('Подсказка', hint, 'b-hint', 'b-hint');
    view.trayWrap = h('div', { class: 'b-tray-wrap' }, h('div', { class: 'b-tray-header' }, view.trayCaption, view.reserve, view.hint), view.tray);
    view.tools = h('div', { class: 'b-toolrow', id: 'tools', role: 'toolbar', 'aria-label': 'Инструменты' });
    view.toolButtons = {};
    sim.TOOLS.forEach(function (tool) {
      const title = sim.TOOL_TITLES[tool];
      const count = h('span', { class: 'b-tool-count' });
      const el = h('button', { type: 'button', class: 'b-tool', title: title, onclick: function () { toolClick(tool); } }, icon(toolIcons[tool]), count, h('span', { class: 'b-tool-name' }, title));
      view.toolButtons[tool] = { el: el, count: count };
      view.tools.append(el);
    });
    view.play = button('Начать партию', function () { requestLaunch('classic'); }, 'primary b-play', 'b-grid');
    view.nav = h('nav', { class: 'b-nav', 'aria-label': 'Разделы игры' }, button('Режимы', modeSheet, '', 'b-grid'), button('Улучшения', shopSheet, '', 'factory'), button('Мастер', masterSheet, '', 'crown'));
    g.el.actions.append(view.play, view.trayWrap, view.tools, view.nav);
    view.live = h('div', { class: 'b-sr', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' });
    view.drag = h('canvas', { class: 'b-drag', 'aria-hidden': 'true' });
    document.body.append(view.live, view.drag);
    window.addEventListener('pointermove', dragMove, { passive: false });
    window.addEventListener('pointerup', dragEnd);
    window.addEventListener('pointercancel', cancelDrag);
    window.addEventListener('blur', cancelDrag);
    document.addEventListener('keydown', keyDown);
    g.on('resize', function () { cancelDrag(); requestAnimationFrame(drawBoards); });
    g.on('hidden', cancelDrag);
    g.on('prestige', function () { result = null; selected = -1; closeSheet(); });
    g.on('chest', function () { g.sfx('chest'); });
    new ResizeObserver(function () { drawBoards(); }).observe(view.boards);
  }

  function theme() {
    const id = sim.mine(g.state).theme;
    return (data.themes || []).find(function (item) { return item.id === id && item.rank <= sim.rank(g.state); }) || data.themes[0];
  }
  function cellPaint(ctx, x, y, size, value, opacity) {
    const pal = theme();
    const gap = Math.max(1, size * 0.055);
    const side = size - gap * 2;
    const kind = B.kindOf(value);
    ctx.globalAlpha = opacity === undefined ? 1 : opacity;
    ctx.fillStyle = value ? (pal.colors[(B.colorOf(value) || 15) - 1] || pal.colors[0]) : pal.empty;
    if (B.isLock(value)) ctx.fillStyle = '#41454a';
    ctx.fillRect(x + gap, y + gap, side, side);
    ctx.strokeStyle = value ? 'rgba(255,255,255,.34)' : pal.frame;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + gap + 0.5, y + gap + 0.5, side - 1, side - 1);
    ctx.strokeStyle = '#f4f4f0';
    ctx.lineWidth = Math.max(1.5, size * 0.045);
    if (value && kind === B.GOLD) {
      ctx.beginPath();
      ctx.moveTo(x + size * .5, y + size * .27);
      ctx.lineTo(x + size * .7, y + size * .5);
      ctx.lineTo(x + size * .5, y + size * .73);
      ctx.lineTo(x + size * .3, y + size * .5);
      ctx.closePath();
      ctx.stroke();
    } else if (value && kind === B.CRACKED) {
      ctx.beginPath();
      ctx.moveTo(x + size * .6, y + size * .15);
      ctx.lineTo(x + size * .4, y + size * .46);
      ctx.lineTo(x + size * .64, y + size * .55);
      ctx.lineTo(x + size * .38, y + size * .85);
      ctx.stroke();
    } else if (B.isLock(value)) {
      ctx.strokeRect(x + size * .3, y + size * .46, size * .4, size * .29);
      ctx.beginPath();
      ctx.arc(x + size * .5, y + size * .43, size * .14, Math.PI, 0);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  function canvasSize(canvas, width, height) {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    return ctx;
  }
  function pieceCanvas(piece, cell, extraClass) {
    const bounds = B.bounds(piece.c);
    const canvas = h('canvas', { class: 'b-piece ' + (extraClass || ''), 'aria-hidden': 'true' });
    canvas.style.width = bounds.w * cell + 'px';
    canvas.style.height = bounds.h * cell + 'px';
    const ctx = canvasSize(canvas, bounds.w * cell, bounds.h * cell);
    piece.c.forEach(function (q, i) { cellPaint(ctx, q[1] * cell, q[0] * cell, cell, B.make(piece.k, piece.s ? piece.s[i] : 0)); });
    return canvas;
  }
  function ensureBoards(game) {
    const sig = game.n + ':' + game.b.length;
    if (view.boards.dataset.signature === sig) return;
    view.boards.dataset.signature = sig;
    view.boards.classList.toggle('b-twin', game.b.length > 1);
    view.boards.replaceChildren();
    view.canvases = game.b.map(function (_, f) {
      const canvas = h('canvas', { class: 'b-board', tabIndex: 0, role: 'grid', 'aria-label': 'Поле ' + (f + 1) + ', ' + game.n + ' на ' + game.n, 'aria-describedby': 'board-help', 'aria-rowcount': game.n, 'aria-colcount': game.n });
      canvas.dataset.field = String(f);
      canvas.addEventListener('pointermove', function (event) {
        if (drag || event.pointerType === 'touch') return;
        preview = coordinate(event.clientX, event.clientY, false, f);
        drawBoards();
      });
      canvas.addEventListener('pointerleave', function () { if (!drag) { preview = null; drawBoards(); } });
      canvas.addEventListener('click', function (event) {
        if (Date.now() < (view.ignoreClickUntil || 0)) return;
        const at = coordinate(event.clientX, event.clientY, false, f);
        if (at) boardAction(at);
      });
      canvas.addEventListener('focus', function () {
        if (!preview) preview = { f: f, r: 0, c: 0 };
        drawBoards();
      });
      const wrap = h('div', { class: 'b-board-wrap' }, game.b.length > 1 ? h('span', { class: 'b-board-label' }, 'Поле ' + (f + 1)) : null, canvas);
      view.boards.append(wrap);
      return canvas;
    });
  }
  function drawBoards() {
    const game = current();
    if (!game || !view.canvases) return;
    const p = game.tray[selected];
    view.canvases.forEach(function (canvas, f) {
      const width = canvas.getBoundingClientRect().width;
      if (!width) return;
      const cell = width / game.n;
      const ctx = canvasSize(canvas, width, width);
      const cells = game.b[f];
      cells.forEach(function (v, i) { cellPaint(ctx, (i % game.n) * cell, Math.floor(i / game.n) * cell, cell, v); });
      if (preview && preview.f === f && !game.done) {
        const at = preview;
        if (activeTool) {
          ctx.fillStyle = 'rgba(255,189,137,.3)';
          for (let r = 0; r < game.n; r++) for (let c = 0; c < game.n; c++) {
            const hit = activeTool === 'bomb' ? Math.abs(r - at.r) <= 1 && Math.abs(c - at.c) <= 1 : activeTool === 'hammer' ? r === at.r : activeTool === 'ruler' ? c === at.c : r === at.r && c === at.c;
            if (hit) ctx.fillRect(c * cell + 1, r * cell + 1, cell - 2, cell - 2);
          }
        } else if (p) {
          const valid = B.fits(cells, p, at.r, at.c);
          if (valid) {
            const lines = B.wouldBurn(cells, p, at.r, at.c);
            ctx.fillStyle = 'rgba(255,255,255,.2)';
            lines.rows.forEach(function (r) { ctx.fillRect(0, r * cell, width, cell); });
            lines.cols.forEach(function (c) { ctx.fillRect(c * cell, 0, cell, width); });
          }
          p.c.forEach(function (q, i) {
            const r = at.r + q[0];
            const c = at.c + q[1];
            if (r < 0 || c < 0 || r >= game.n || c >= game.n) return;
            cellPaint(ctx, c * cell, r * cell, cell, B.make(p.k, p.s ? p.s[i] : 0), valid ? .72 : .32);
            ctx.strokeStyle = valid ? '#ffffff' : '#ff8d82';
            ctx.lineWidth = 2;
            ctx.strokeRect(c * cell + 3, r * cell + 3, cell - 6, cell - 6);
          });
        }
        ctx.strokeStyle = '#f5f4ed';
        ctx.lineWidth = 2;
        ctx.strokeRect(at.c * cell + 1, at.r * cell + 1, cell - 2, cell - 2);
      }
      if (burn && burn.f === f) {
        const alpha = Math.max(0, 1 - (performance.now() - burn.at) / num('ui.clearMs', 260));
        ctx.fillStyle = 'rgba(255,255,255,' + alpha + ')';
        burn.cells.forEach(function (i) { ctx.fillRect((i % game.n) * cell + 1, Math.floor(i / game.n) * cell + 1, cell - 2, cell - 2); });
      }
    });
    if (burn) {
      if (performance.now() - burn.at < num('ui.clearMs', 260)) requestAnimationFrame(drawBoards);
      else burn = null;
    }
  }

  function drawTray(game) {
    const signature = JSON.stringify([game.tray, game.hold, selected, sim.mine(g.state).theme]);
    if (signature === lastTray) return;
    lastTray = signature;
    const frag = document.createDocumentFragment();
    game.tray.forEach(function (p, i) {
      const title = p ? 'Фигура ' + (i + 1) + ', клеток: ' + p.c.length : 'Пустой слот';
      const el = h('button', { type: 'button', class: 'b-tray-piece' + (selected === i ? ' selected' : ''), disabled: !p || game.done, 'aria-label': title, 'aria-pressed': selected === i ? 'true' : 'false', 'data-piece': i });
      if (p) {
        const b = B.bounds(p.c);
        el.append(pieceCanvas(p, Math.min(18, 78 / b.w, 84 / b.h)));
        el.addEventListener('pointerdown', function (event) { dragStart(event, i); });
        el.addEventListener('click', function () { if (Date.now() >= (view.ignoreClickUntil || 0)) select(i); });
      } else el.append(h('span', { class: 'b-empty-slot', 'aria-hidden': 'true' }, '—'));
      frag.append(el);
    });
    view.tray.replaceChildren(frag);
    view.reserve.replaceChildren(icon('b-reserve'), game.hold ? pieceCanvas(game.hold, 9) : h('span', {}, 'Запас'));
  }
  function select(index) {
    const game = current();
    if (!game || !game.tray[index] || game.done) return;
    selected = index;
    activeTool = '';
    preview = null;
    render(g.state);
    announce('Фигура ' + (index + 1) + '. Коснитесь клетки или используйте стрелки и Enter.');
  }
  function coordinate(x, y, lifted, onlyField) {
    const game = current();
    if (!game) return null;
    const p = game.tray[selected];
    for (let f = 0; f < view.canvases.length; f++) {
      if (onlyField !== undefined && onlyField !== f) continue;
      const rect = view.canvases[f].getBoundingClientRect();
      const cell = rect.width / game.n;
      const bounds = p ? B.bounds(p.c) : { w: 1, h: 1 };
      const px = lifted ? x - bounds.w * cell / 2 : x;
      const py = lifted ? y - num('ui.dragLift', 64) - bounds.h * cell : y;
      const r = lifted ? Math.round((py - rect.top) / cell) : Math.floor((py - rect.top) / cell);
      const c = lifted ? Math.round((px - rect.left) / cell) : Math.floor((px - rect.left) / cell);
      if (r >= 0 && c >= 0 && r < game.n && c < game.n && (lifted || (x <= rect.right && y <= rect.bottom))) return { f: f, r: r, c: c };
    }
    return null;
  }
  function dragStart(event, index) {
    if (event.button !== 0 || !current() || current().done) return;
    select(index);
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
    // Capture on the stable tray parent: selecting a piece can rebuild its button.
    try { view.tray.setPointerCapture(event.pointerId); } catch (ignored) { /* Pointer may already have ended. */ }
    event.preventDefault();
  }
  function dragMove(event) {
    if (!drag || event.pointerId !== drag.id) return;
    event.preventDefault();
    if (!drag.moved && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < num('ui.dragThreshold', 6)) return;
    drag.moved = true;
    const game = current();
    const p = game && game.tray[selected];
    if (!p) return cancelDrag();
    preview = coordinate(event.clientX, event.clientY, true);
    const rect = view.canvases[preview ? preview.f : 0].getBoundingClientRect();
    const cell = rect.width / game.n;
    const b = B.bounds(p.c);
    view.drag.style.display = 'block';
    view.drag.style.width = b.w * cell + 'px';
    view.drag.style.height = b.h * cell + 'px';
    view.drag.style.left = event.clientX - b.w * cell / 2 + 'px';
    view.drag.style.top = event.clientY - num('ui.dragLift', 64) - b.h * cell + 'px';
    const ctx = canvasSize(view.drag, b.w * cell, b.h * cell);
    p.c.forEach(function (q, i) { cellPaint(ctx, q[1] * cell, q[0] * cell, cell, B.make(p.k, p.s ? p.s[i] : 0), .9); });
    drawBoards();
  }
  function dragEnd(event) {
    if (!drag || event.pointerId !== drag.id) return;
    const moved = drag.moved;
    const at = moved ? coordinate(event.clientX, event.clientY, true) : null;
    view.ignoreClickUntil = Date.now() + 350;
    cancelDrag();
    if (moved && at) boardAction(at);
    else if (moved) announce('Фигура вернулась в лоток.');
  }
  function cancelDrag() {
    drag = null;
    if (view.drag) view.drag.style.display = 'none';
    preview = null;
    if (g) drawBoards();
  }
  function boardAction(at) {
    const game = current();
    if (!game || game.done) return;
    if (activeTool) return executeTool(activeTool, at);
    if (selected < 0) return notify('Сначала выберите фигуру в лотке.');
    const out = g.act(function (state) {
      const placed = sim.place(state, g.config, selected, at.f, at.r, at.c);
      if (placed.won) placed.reward = sim.winChallenge(state, g.config, game.idx);
      return placed;
    });
    if (!out || !out.ok) { feedback(false); announce('Фигура здесь не помещается.'); return; }
    selected = -1;
    preview = null;
    if (out.lines && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) burn = { f: at.f, cells: out.burnt, at: performance.now() };
    feedback(true, out.lines ? 'level' : 'tap');
    achieve(out.ach);
    if (sim.challengesDone(g.state) >= data.challenges.levels.length) g.achieve('all-challenges');
    announce(out.won ? 'Испытание пройдено. Награда: ' + fmt(out.reward) + ' монет.' : out.lines ? 'Линий очищено: ' + out.lines + '. Очков: ' + out.points : 'Фигура поставлена. Очков: ' + out.points);
    if (out.second) notify('Второй шанс: центр поля очищен.');
    if (out.previewChanged) notify('Предпросмотр заменён: ни одна фигура не помещалась.');
    render(g.state);
  }
  function toolClick(tool) {
    const game = current();
    if (!game || game.done || game.mode === 'challenge') return;
    if (sim.toolLeft(g.state, tool) <= 0) return shopSheet(tool);
    if (tool === 'rotate' || tool === 'cutter') {
      if (selected < 0 || !game.tray[selected]) return notify('Сначала выберите фигуру в лотке.');
      return executeTool(tool, { ti: selected });
    }
    if (tool === 'reroll' || tool === 'undo') return executeTool(tool, {});
    activeTool = activeTool === tool ? '' : tool;
    preview = null;
    render(g.state);
    if (activeTool) announce(sim.TOOL_TITLES[tool] + ': коснитесь клетки на поле.');
  }
  function executeTool(tool, at) {
    const out = g.act(function (state) { return sim.useTool(state, g.config, tool, at); });
    if (!out || !out.ok) { feedback(false); notify(out && out.why ? out.why : 'Инструмент недоступен.'); return; }
    activeTool = '';
    preview = null;
    if (tool === 'reroll' || tool === 'undo') selected = -1;
    feedback(true, 'buy');
    announce(sim.TOOL_TITLES[tool] + ': готово.');
    render(g.state);
  }
  function reserve() {
    const game = current();
    if (!game || game.done) return;
    let slot = selected;
    if (slot < 0 && game.hold) slot = game.tray.findIndex(function (p) { return !p; });
    if (slot < 0) return notify('Выберите фигуру для обмена с запасом.');
    const ok = g.act(function (state) { return sim.hold(state, g.config, slot); });
    selected = game.tray[slot] ? slot : -1;
    if (sim.mine(g.state).stats.maxStreak >= g.config['ach.streak']) g.achieve('streak-10');
    feedback(ok);
    render(g.state);
  }
  function hint() {
    const game = current();
    if (!game || game.done) return;
    if (!sim.has(g.state, 'hint')) return shopSheet('hint');
    let best = null;
    game.tray.forEach(function (p, ti) {
      if (!p || (selected >= 0 && ti !== selected)) return;
      game.b.forEach(function (cells, f) {
        B.places(cells, p).forEach(function (pos) {
          const lines = B.wouldBurn(cells, p, pos[0], pos[1]);
          const count = lines.rows.length + lines.cols.length;
          if (!best || count > best.lines) best = { f: f, r: pos[0], c: pos[1], ti: ti, lines: count };
        });
      });
    });
    if (!best) return notify('Подходящего места нет. Используйте инструмент.');
    selected = best.ti;
    activeTool = '';
    preview = best;
    render(g.state);
    announce('Подсказка: фигура ' + (best.ti + 1) + ', поле ' + (best.f + 1) + ', строка ' + (best.r + 1) + ', столбец ' + (best.c + 1) + '. Линий: ' + best.lines);
    clearTimeout(hintTimer);
    hintTimer = setTimeout(function () { if (!drag) { preview = null; drawBoards(); } }, num('ui.hintMs', 3000));
  }
  function keyDown(event) {
    const game = current();
    if (!game || sheetClose || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) return;
    if (event.key === 'Escape') { activeTool = ''; selected = -1; cancelDrag(); render(g.state); return; }
    if (/^[1-9]$/.test(event.key)) { select(Number(event.key) - 1); return; }
    if (event.key.toLowerCase() === 'r') { toolClick('rotate'); return; }
    const canvasFocused = event.target.classList.contains('b-board');
    if (!canvasFocused) return;
    const arrows = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    if (arrows[event.key]) {
      event.preventDefault();
      if (!preview) preview = { f: Number(event.target.dataset.field), r: 0, c: 0 };
      const delta = arrows[event.key];
      preview.r = Math.max(0, Math.min(game.n - 1, preview.r + delta[0]));
      preview.c = Math.max(0, Math.min(game.n - 1, preview.c + delta[1]));
      drawBoards();
      announce('Строка ' + (preview.r + 1) + ', столбец ' + (preview.c + 1));
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (preview) boardAction(preview);
    }
  }

  function render(state) {
    const game = state.run.game;
    const meta = sim.mine(state);
    view.coins.textContent = fmt(state.run.coins);
    view.rank.textContent = sim.rankName(sim.rank(state));
    view.record.textContent = 'Рекорд ' + fmt(meta.records[game && game.mode] || meta.records.classic);
    view.score.textContent = fmt(game ? game.score : (state.run.last ? state.run.last.score : 0));
    view.scoreLabel.textContent = game ? 'Счёт' : 'Последний счёт';
    view.streak.textContent = game ? 'Серия ' + game.streak + ' · ' + g.fmt.mult(sim.streakMult(state, g.config, game.streak)) : 'Блоки';
    view.lobby.hidden = !!game;
    view.gameArea.hidden = !game;
    view.play.hidden = !!game;
    view.trayWrap.hidden = !game;
    view.tools.hidden = !game || game.mode === 'challenge';
    g.el.app.classList.toggle('b-playing', !!game);
    if (!game) { renderLobby(state); view.next.replaceChildren(); view.next.dataset.signature = ''; }
    else {
      if (game !== lastGame) { lastGame = game; selected = -1; preview = null; lastTray = ''; }
      if (selected >= 0 && !game.tray[selected]) selected = -1;
      ensureBoards(game);
      view.mode.textContent = game.mode === 'challenge' ? 'Испытание ' + game.idx : modes[game.mode];
      view.deal.textContent = game.mode === 'challenge' ? 'Ход ' + Math.min(game.qi + 1, game.queue.length) + ' / ' + game.queue.length : 'Раздача ' + game.deal + (game.mode === 'daily' ? ' / ' + game.deals : '');
      view.reserve.hidden = game.mode === 'challenge' || !sim.has(state, 'slot');
      view.reserve.disabled = game.done;
      view.hint.hidden = game.mode === 'challenge' || !sim.has(state, 'hint');
      view.hint.disabled = game.done;
      view.trayCaption.textContent = activeTool ? sim.TOOL_TITLES[activeTool] + ': выберите клетку' : selected >= 0 ? 'Фигура ' + (selected + 1) + ' выбрана' : 'Выберите фигуру';
      view.guide.textContent = activeTool ? 'Коснитесь клетки. Ещё раз нажмите инструмент, чтобы отменить.' : 'Перетащите фигуру или выберите её и коснитесь клетки. Стрелки + Enter — с клавиатуры.';
      drawTray(game);
      sim.TOOLS.forEach(function (tool) {
        const node = view.toolButtons[tool];
        const left = sim.toolLeft(state, tool);
        node.count.textContent = String(left);
        node.el.classList.toggle('active', activeTool === tool);
        node.el.classList.toggle('empty', !left);
        node.el.disabled = game.done;
        node.el.setAttribute('aria-label', sim.TOOL_TITLES[tool] + ', зарядов: ' + left + (!left ? '. Открыть улучшения' : ''));
        node.el.setAttribute('aria-pressed', activeTool === tool ? 'true' : 'false');
      });
      renderStatus(game);
      renderNext(game);
      drawBoards();
    }
    if (sheetUpdate) sheetUpdate();
  }
  function renderNext(game) {
    const pieces = game.mode === 'challenge' ? game.queue.slice(game.qi + 1) : sim.has(g.state, 'preview') ? game.next : null;
    const sig = JSON.stringify([pieces, sim.mine(g.state).theme]);
    if (view.next.dataset.signature === sig) return;
    view.next.dataset.signature = sig;
    view.next.replaceChildren(h('span', { class: 'b-eyebrow' }, game.mode === 'challenge' ? 'Очередь' : 'Следующая раздача'));
    view.nextCompact.replaceChildren();
    if (!pieces) view.next.append(h('p', { class: 'g-note' }, 'Пока скрыто'), button('Открыть', function () { shopSheet('preview'); }, 'small'));
    else {
      view.nextCompact.append(h('span', { class: 'b-eyebrow' }, game.mode === 'challenge' ? 'Очередь' : 'Далее'));
      pieces.forEach(function (p) {
        view.next.append(pieceCanvas(p, 13));
        view.nextCompact.append(pieceCanvas(p, 10));
      });
      if (game.mode !== 'challenge') view.next.append(h('p', { class: 'g-note' }, 'Если ни одна фигура не встанет, раздача изменится.'));
    }
  }
  function renderStatus(game) {
    const savedName = sim.mine(g.state).names[game.idx];
    const signature = JSON.stringify([game.mode, game.stuck, game.done, game.ev, game.score, game.qi, game.hist && game.hist.length, game.idx, activeTool, savedName]);
    if (view.status.dataset.signature === signature) return;
    view.status.dataset.signature = signature;
    view.status.replaceChildren();
    view.quick.replaceChildren();
    if (game.mode === 'daily') view.status.append(h('div', { class: 'b-daily-target' }, h('span', {}, 'Цель ' + fmt(game.target)), h('span', {}, game.score >= game.target ? 'Цель достигнута' : 'Осталось ' + fmt(game.target - game.score))));
    if (game.ev) {
      const event = data.events.find(function (item) { return item.id === game.ev; });
      if (event) view.status.append(h('div', { class: 'b-event' }, h('strong', {}, event.title), h('span', {}, event.text)));
    }
    if (game.mode === 'challenge') {
      const entry = data.challenges.levels[game.idx - 1];
      if (entry) view.status.append(h('p', { class: 'g-note' }, (savedName ? savedName.title : entry.title) + ' · ' + (savedName ? savedName.text : entry.description)));
      if (game.done && B.filled(game.b[0]) === 0) {
        view.status.append(h('strong', { class: 'b-success' }, 'Поле очищено. Испытание пройдено.'));
        if (game.idx < data.challenges.levels.length) view.quick.append(button('Следующее испытание', function () { startChallenge(game.idx + 1); }, 'primary'));
      } else if (game.stuck || game.done) view.status.append(h('strong', {}, 'Попробуйте другой порядок. Можно вернуть ход.'));
      const back = button('Вернуть ход', function () {
        const ok = g.act(function (state) { return sim.back(state); });
        selected = -1;
        preview = null;
        feedback(ok);
        render(g.state);
      }, '', 'b-undo');
      back.disabled = !game.hist.length;
      view.quick.append(back, button('Заново', function () { requestChallenge(game.idx); }, '', 'reset'));
    } else if (game.stuck || game.done) {
      view.status.append(h('strong', {}, game.done ? 'Все раздачи сыграны' : 'Фигуры больше не помещаются'), h('p', { class: 'g-note' }, game.done ? 'Заберите монеты за партию.' : 'Используйте инструмент или завершите партию.'));
      view.quick.append(button('Забрать ' + fmt(Math.floor(sim.coinsFor(g.state, g.config, game) * g.links.mult())) + ' монет', endAndShow, 'primary'));
    }
  }
  function renderLobby(state) {
    const sig = JSON.stringify([state.run.last, state.run.coins, sim.rank(state), result]);
    if (view.lobby.dataset.signature === sig) return;
    view.lobby.dataset.signature = sig;
    const last = result || state.run.last;
    view.lobby.replaceChildren(h('div', { class: 'b-lobby-mark', 'aria-hidden': 'true' }, BlocksArt.hero()), h('p', { class: 'b-eyebrow' }, 'Блоки'), h('h1', {}, last ? (last.record ? 'Новый рекорд' : 'Ещё одна линия?') : 'Линия за линией'), h('p', { class: 'b-intro' }, 'Заполняйте строки и столбцы. Берегите место для следующей фигуры.'));
    if (last) view.lobby.append(h('div', { class: 'b-last' }, h('strong', {}, fmt(last.score) + ' очков'), h('span', {}, '+' + fmt(last.coins) + ' монет'), h('span', {}, 'Линий: ' + last.lines)));
    if (result && result.daily) view.lobby.append(h('p', { class: 'b-success' }, result.daily.done ? 'Задача дня выполнена' : 'Задача дня: попробуйте ещё раз'));
    view.lobby.append(h('p', { class: 'g-note' }, 'Без таймера. Партия сохраняется после каждого хода.'), button('Задача дня', function () { requestLaunch('daily'); }, '', 'timer'), button('Испытания · ' + sim.challengesDone(state) + ' / ' + data.challenges.levels.length, challengeSheet, '', 'map'));
  }
  function endAndShow() {
    result = finishCurrent();
    selected = -1;
    preview = null;
    feedback(true, 'buy');
    render(g.state);
  }

  function modeSheet() {
    const body = h('div', { class: 'b-stack' });
    if (current()) {
      body.append(button('Продолжить партию', closeSheet, 'primary'));
      body.append(held('Удержать: завершить партию', function () { closeSheet(); endAndShow(); }));
    }
    ['classic', 'daily', 'big', 'twin'].forEach(function (mode) {
      const open = sim.modeOpen(g.state, g.config, mode);
      const required = mode === 'big' ? num('rank.big', 4) : num('rank.twin', 5);
      const detail = mode === 'classic' ? 'Поле 8 × 8 · без таймера' : mode === 'daily' ? dateKey() + ' · ' + num('daily.deals', 20) + ' раздач' : mode === 'big' ? 'Поле 9 × 9' : 'Два поля 6 × 6';
      const btn = button(h('span', {}, modes[mode], h('span', { class: 'b-sub' }, open ? detail : 'Откроется: ' + sim.rankName(required))), function () { requestLaunch(mode); }, '', 'b-grid');
      btn.disabled = !open;
      body.append(btn);
    });
    body.append(button('Испытания · ' + sim.challengesDone(g.state) + ' / ' + data.challenges.levels.length, challengeSheet, '', 'map'));
    const fresh = button(h('span', {}, 'Чистый лист', h('span', { class: 'b-sub' }, 'Все инструменты · ' + num('steps.cost.fresh', 2) + ' энергии')), freshGame, '', 'steps');
    body.append(fresh);
    sheet('Режимы игры', body);
  }
  async function freshGame() {
    if (current()) {
      sheet('Чистый лист', h('div', { class: 'b-stack' }, h('p', { class: 'g-note' }, 'Текущая партия закончится. Энергия спишется перед новой партией.'), held('Удержать: начать «Чистый лист»', spendFresh)));
    } else await spendFresh();
  }
  async function spendFresh() {
    if (freshPending) return;
    freshPending = true;
    try {
      const spent = await g.links.spend('fresh');
      if (!spent.ok) { notify(spent.off ? 'Связка «Шаги» выключена' : 'Нужна энергия: ' + spent.need); return; }
      launch('classic', { fresh: true });
    } finally { freshPending = false; }
  }
  function shopSheet(focusId) {
    const body = h('div', { class: 'b-shop' });
    const summary = h('div', { class: 'b-shop-summary' });
    const list = h('div', { class: 'b-upgrades' });
    body.append(summary, list);
    const entries = {};
    const supplyEntries = {};
    data.upgrades.forEach(function (up, index) {
      const detail = h('span', { class: 'g-note' });
      const buy = button('', function () {
        const ok = g.act(function (state) { return sim.buyUpgrade(state, g.config, up.id); }, { now: true, reason: 'buy' });
        feedback(ok, 'buy');
        if (ok) announce(up.title + ': улучшение куплено.');
      }, 'b-buy');
      const row = h('article', { class: 'b-upgrade', id: 'upgrade-' + up.id }, BlocksArt.el(up.id, 36), h('div', { class: 'b-upgrade-copy' }, h('strong', {}, up.title), h('p', { class: 'g-note' }, up.text), detail), buy);
      entries[up.id] = { detail: detail, buy: buy, row: row };
      list.append(row);
    });
    body.append(h('h3', {}, 'Разовые инструменты'), h('p', { class: 'g-note' }, 'Один инструмент на одно применение. Сначала расходуются заряды партии, затем запас.'));
    const supplies = h('div', { class: 'b-supplies' });
    sim.TOOLS.forEach(function (tool) {
      const count = h('span', { class: 'g-note' });
      const buy = button('', function () {
        const ok = g.act(function (state) { return sim.buySupply(state, g.config, tool); }, { now: true, reason: 'buy-supply' });
        feedback(ok, 'buy');
        if (ok) announce(sim.TOOL_TITLES[tool] + ': запас куплен.');
      }, 'b-buy');
      supplyEntries[tool] = { count: count, buy: buy };
      supplies.append(h('article', { class: 'b-supply' }, BlocksArt.el(tool, 28), h('div', { class: 'b-stack' }, h('strong', {}, sim.TOOL_TITLES[tool]), count), buy));
    });
    body.append(supplies);
    function update() {
      summary.textContent = 'Монеты: ' + fmt(g.state.run.coins) + ' · Множитель: ' + g.fmt.mult(sim.coinMult(g.state, g.config));
      data.upgrades.forEach(function (up) {
        const entry = entries[up.id];
        const price = sim.price(g.state, g.config, up.id);
        const lv = sim.level(g.state, up.id);
        entry.detail.textContent = 'Уровень ' + lv + (sim.TOOLS.indexOf(up.id) >= 0 ? ' · Запас: ' + (sim.mine(g.state).supply[up.id] || 0) : '');
        entry.buy.textContent = price === null ? 'Куплено' : fmt(price) + ' монет';
        entry.buy.disabled = price === null || !sim.canBuy(g.state, g.config, up.id);
        entry.row.classList.toggle('has', lv > 0);
      });
      sim.TOOLS.forEach(function (tool) {
        const entry = supplyEntries[tool];
        const price = g.config['supply.' + tool + '.cost'];
        entry.count.textContent = 'В запасе: ' + (sim.mine(g.state).supply[tool] || 0);
        entry.buy.textContent = fmt(price) + ' монет';
        entry.buy.disabled = Big.lt(g.state.run.coins, price);
      });
    }
    sheet('Улучшения · 20', body, update);
    update();
    if (focusId) requestAnimationFrame(function () { const el = document.getElementById('upgrade-' + focusId); if (el) el.scrollIntoView({ block: 'center' }); });
  }
  function masterSheet() {
    const state = g.state;
    const meta = sim.mine(state);
    const rank = sim.rank(state);
    const body = h('div', { class: 'b-stack' }, h('div', { class: 'b-master-title' }, icon('crown'), h('strong', {}, sim.rankName(rank))), g.ui.line('Мастерство', fmt(sim.mastery(state))), g.ui.line('Монеты навсегда', g.fmt.mult(1 + sim.mastery(state) * num('rank.bonus', .05))), g.ui.line('Рекорд цикла', fmt(state.run.best)), h('p', { class: 'g-note' }, 'Новый ранг сбрасывает монеты и улучшения. Рекорды, испытания, темы и разовые инструменты остаются.'), g.ui.prestigeButton(sim.LAYER));
    const nextRank = data.ranks.find(function (entry) { return entry.rank === rank + 1; });
    if (nextRank) body.append(h('p', { class: 'g-note' }, 'Следующий ранг: ' + nextRank.title + '. ' + nextRank.text));
    const free = Math.max(0, sim.picksFree(state, g.config));
    body.append(h('h3', {}, 'Стартовые заряды'), h('p', { class: 'g-note' }, 'За каждые ' + num('rank.pickEvery', 5) + ' мастерства — заряд на каждую партию. Доступно: ' + free));
    const picks = h('div', { class: 'b-pick-grid' });
    sim.TOOLS.forEach(function (tool) {
      const btn = button(sim.TOOL_TITLES[tool] + ' · ' + (meta.picks[tool] || 0), function () {
        const ok = g.act(function (s) { return sim.pick(s, g.config, tool); }, { now: true, reason: 'mastery-pick' });
        feedback(ok, 'buy');
        masterSheet();
      }, '', toolIcons[tool]);
      btn.disabled = !free;
      picks.append(btn);
    });
    body.append(picks, h('h3', {}, 'Темы поля'));
    data.themes.forEach(function (entry) {
      const swatches = h('span', { class: 'b-swatches', 'aria-hidden': 'true' });
      entry.colors.slice(0, 5).forEach(function (color) { swatches.append(h('i', { style: 'background:' + color })); });
      const btn = button(h('span', {}, entry.title, h('span', { class: 'b-sub' }, rank >= entry.rank ? entry.text : 'Откроется: ' + sim.rankName(entry.rank))), function () {
        g.act(function (s) { sim.mine(s).theme = entry.id; });
        lastTray = '';
        render(g.state);
        masterSheet();
      }, entry.id === meta.theme ? 'b-selected-theme' : '');
      btn.prepend(swatches);
      btn.disabled = rank < entry.rank;
      body.append(btn);
    });
    body.append(h('h3', {}, 'Мастерская'));
    const interval = sim.workshopInterval(state, g.config);
    body.append(h('p', { class: 'g-note' }, interval ? 'Запас: ' + sim.supplyCount(state) + ' / ' + num('up.workshop.cap', 5) + '. Следующий инструмент через ' + g.fmt.time(Math.max(0, interval - state.run.ws)) : 'Купите Мастерскую — она делает инструменты даже с закрытой игрой.'));
    body.append(button('Достижения', function () { closeSheet(); g.ui.achievements(); }, '', 'trophy'));
    sheet('Мастерская и ранг', body);
  }
  function challengeSheet() {
    const body = h('div', { class: 'b-stack' }, h('p', { class: 'g-note' }, 'Очистите поле заданной очередью. Возврат хода бесплатный, инструменты отключены.'));
    const grid = h('div', { class: 'b-challenges' });
    const open = sim.challengeOpen(g.state, data.challenges.levels.length);
    const done = sim.mine(g.state).chal.done;
    data.challenges.levels.forEach(function (entry, index) {
      const number = index + 1;
      const btn = button(h('span', {}, String(number).padStart(2, '0'), h('span', { class: 'b-sub' }, done[number] ? 'Пройдено' : number <= open ? entry.title : 'Закрыто')), function () { requestChallenge(number); }, done[number] ? 'b-completed' : '');
      btn.disabled = number > open;
      btn.setAttribute('aria-label', 'Испытание ' + number + '. ' + entry.title + (done[number] ? '. Пройдено' : ''));
      grid.append(btn);
    });
    body.append(grid);
    sheet('Испытания · ' + sim.challengesDone(g.state) + ' / ' + data.challenges.levels.length, body);
  }
  function challengeOptions(index) {
    const entry = data.challenges.levels[index - 1];
    if (!entry) return null;
    const level = L.generate(entry.seed, entry);
    if (!level || !L.check(level, level.moves)) { notify('Не удалось подготовить испытание.'); return null; }
    const verified = L.solve(level, { limit: 1, budget: num('challenge.searchBudget', 30000) });
    if (verified.aborted || !verified.solutions) { notify('Не удалось подготовить испытание.'); return null; }
    return { index: index, level: level };
  }
  async function loadChallengeName(index) {
    if (sim.mine(g.state).names[index] || namesPending[index]) return;
    namesPending[index] = true;
    try {
      const name = await g.stock.take('names');
      if (name && !name.procedural && typeof name.title === 'string' && typeof name.text === 'string' && !sim.validateStock('names', name)) {
        g.act(function (state) { sim.mine(state).names[index] = { title: name.title, text: name.text }; });
      }
    } catch (ignored) { /* The verified catalogue supplies an offline name and description. */ }
    delete namesPending[index];
  }
  function startChallenge(index) {
    const opts = challengeOptions(index);
    if (opts) launch('challenge', opts);
  }
  function requestChallenge(index) {
    const opts = challengeOptions(index);
    if (!opts) return;
    if (current() && current().done) launch('challenge', opts);
    else requestLaunch('challenge', opts);
  }

  try {
    const names = ['upgrades', 'themes', 'events', 'ranks', 'challenges'];
    await Promise.all(names.map(async function (name) {
      const response = await fetch('../content/' + name + '.json');
      if (!response.ok) throw new Error('Не удалось загрузить: ' + name);
      data[name] = await response.json();
    }));
    await Game.start({ sim: sim, render: render, init: build });
  } catch (error) {
    document.body.append(h('div', { class: 'g-error', role: 'alert' }, 'Не удалось открыть «Блоки»: ' + error.message, button('Повторить', function () { location.reload(); })));
  }
})();
