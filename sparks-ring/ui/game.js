// Экран «Искр в кольце»: кольцо на canvas, тап по нему отражает встречную искру.
// Движок (Game.start) даёт рамку: g.el.top (счёт, жизни, время), g.el.field (кольцо),
// g.el.actions (кнопка под большим пальцем) — и держит сохранение, звук и ачивки.
(async function () {
  const h = ui.h;
  const sim = window.GameSim;
  const view = {};
  let g = null;
  let board = null;
  let cv = null;
  let ctx = null;
  let dirtyBox = true;
  let lastOver = false;
  let cleanRings = 0;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let lastStatic = '';

  function build(game) {
    g = game;

    view.score = h('div', { class: 'i-score', id: 'score' }, '0');
    view.combo = h('div', { class: 'i-combo', id: 'combo' }, '');
    view.lives = h('div', { class: 'i-lives', id: 'lives' });
    view.clock = h('div', { class: 'i-clock', id: 'clock' }, '0:00');
    g.el.top.append(h('div', { class: 'i-head' }, view.score, view.combo, view.lives, view.clock));

    cv = h('canvas', { id: 'board', role: 'img', 'aria-label': 'Реактор: отражайте яркие встречные искры в подсвеченной полосе' });
    ctx = cv.getContext('2d');
    view.over = h('div', { class: 'i-over', id: 'over', hidden: true });
    board = h('div', { class: 'i-board', id: 'field', tabindex: 0, role: 'group', 'aria-label': 'Игровое поле. Пробел или Enter — отразить искру' }, cv, view.over);
    view.hint = h('div', { class: 'i-hint', id: 'hint' });
    view.legend = h('div', { class: 'i-legend', id: 'legend' },
      h('span', {}, h('i', { class: 'i-dot in' }), 'встречная — тап'),
      h('span', {}, h('i', { class: 'i-dot' }), 'улетающая — не трогать'));
    g.el.field.append(h('div', { class: 'i-wrap' }, board, view.hint, view.legend));

    view.play = h('button', { class: 'g-btn primary', id: 'play', onclick: play }, GameIcons.el('sparkle'), 'Начать');
    g.el.actions.append(view.play);
    board.addEventListener('pointerdown', onTap);
    board.addEventListener('keydown', (e) => {
      if (e.target !== board || e.repeat || (e.code !== 'Space' && e.code !== 'Enter')) return;
      onTap(e);
    });
    board.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('resize', () => { dirtyBox = true; });
    if (window.ResizeObserver) new ResizeObserver(() => { dirtyBox = true; }).observe(board);

    g.on('resize', () => { dirtyBox = true; });
    g.on('visible', () => { dirtyBox = true; });
  }

  function play() {
    g.act((state) => sim.begin(state, g.config, Date.now()), { now: true, reason: 'start' });
    g.sfx('level');
    g.buzz('tap');
    dirtyBox = true;
  }

  function onTap(e) {
    if (e.target && e.target.closest && e.target.closest('button')) return;
    e.preventDefault();
    const state = g.state;
    if (!state.run.live) {
      play();
      return;
    }
    const r = g.act((s) => sim.tap(s, g.config, Date.now()));
    if (!r) return;
    if (r.result === 'perfect') {
      g.sfx('buy');
      g.buzz([12, 20, 18]);
    } else if (r.result === 'ok') {
      g.sfx('tap');
      g.buzz('tap');
    } else if (r.result === 'trap') {
      g.sfx('deny');
      g.buzz('deny');
    } else if (r.result === 'empty') {
      g.sfx('deny');
      g.buzz([8, 30, 8]);
    }
  }

  function conf(key, dflt) {
    const v = g.config[key];
    return typeof v === 'number' && isFinite(v) ? v : dflt;
  }

  // ---- рисование -------------------------------------------------------------------------------

  function fit() {
    const box = board.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(1400000 / Math.max(1, box.width * box.height)));
    const w = Math.max(80, Math.round(box.width));
    const hh = Math.max(80, Math.round(box.height));
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(hh * dpr)) {
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(hh * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    dirtyBox = false;
    return { w: w, h: hh };
  }

  function colors() {
    const cs = getComputedStyle(document.body);
    const pick = (name, fallback) => (cs.getPropertyValue(name) || '').trim() || fallback;
    return {
      accent: pick('--accent', '#7aa2ff'),
      ink: pick('--ink', '#eaeaea'),
      ink3: pick('--ink-3', '#8a8a8a'),
      line: pick('--line', '#333'),
      surface: pick('--surface', '#141414'),
      danger: pick('--danger', '#ff6b6b')
    };
  }

  function draw(state, dt) {
    if (!ctx) return;
    const resized = dirtyBox;
    const box = dirtyBox ? fit() : { w: cv.clientWidth || 320, h: cv.clientHeight || 320 };
    const picture = window.SparksReactor.model(state, g.config, reducedMotion.matches);
    const signature = picture.live ? '' : JSON.stringify(picture);
    if (!picture.live && !resized && signature === lastStatic) return;
    lastStatic = signature;
    window.SparksReactor.draw(ctx, picture, box.w, box.h);
  }
  // ---- состояние экрана ------------------------------------------------------------------------

  function render(state, game) {
    if (game) g = game;
    const run = state.run;    view.score.textContent = String(run.score || 0);
    const combo = run.combo || 0;
    view.combo.textContent = combo > 1 ? 'подряд ' + combo : '';
    const lives = conf('lives.start', 3);
    if (view.lives.childElementCount !== lives) {
      view.lives.replaceChildren(...Array.from({ length: lives }, () => h('i', { class: 'i-life' })));
    }
    Array.from(view.lives.children).forEach((el, i) => el.classList.toggle('on', i < run.lives));
    view.clock.textContent = fmtClock(run.elapsedMs || 0);
    view.hint.replaceChildren(...hintLine(run));
    view.play.replaceChildren(GameIcons.el(run.live ? 'reset' : run.over ? 'reset' : 'sparkle'),
      run.live ? 'Заново' : run.over ? 'Ещё раз' : 'Начать');

    if (run.over !== lastOver || (run.over && view.over.hidden)) {
      lastOver = run.over;
      paintOver(run);
    }
    if (!run.over && !view.over.hidden) view.over.hidden = true;

    if (run.reflected >= 1) g.achieve('first');
    if ((run.comboBest || 0) >= 15) g.achieve('combo-15');
    if ((run.score || 0) >= 50) g.achieve('score-50');
    draw(state, 0);
  }

  function paintOver(run) {
    if (!run.over) {
      view.over.hidden = true;
      return;
    }
    const best = run.best || 0;
    view.over.replaceChildren(
      h('div', { class: 't' }, 'Заход окончен'),
      h('div', { class: 's' }, 'Очки: ' + run.score + ' · рекорд: ' + Math.max(best, run.score)),
      h('div', { class: 's' }, 'Отражено ' + run.reflected + ', точных ' + run.perfects +
        (run.missed ? ', пропущено ' + run.missed : '')),
      h('button', { class: 'g-btn primary', id: 'again', onclick: play }, GameIcons.el('reset'), 'Ещё раз'));
    view.over.hidden = false;
  }

  function hintLine(run) {
    if (run.over) return [h('span', {}, 'Тапните по кольцу или жмите «Ещё раз»')];
    if (!run.live) {
      // one sentence in one box: three boxes in the row of the hint would stand as three columns
      return [h('span', {}, 'Искры летят к ядру: ', h('b', {}, 'тапните встречную'), ' в полосе. Улетающие не трогайте.')];
    }
    return [h('span', {}, 'Уровень ' + (run.level || 1) + ' · точных ' + (run.perfects || 0))];
  }

  function fmtClock(ms) {
    const total = Math.floor(ms / 1000);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return m + ':' + (s < 10 ? '0' + s : s);
  }

  function animate(state, game, dt) {
    if (game) g = game;
    const run = state.run;
    if (run.over !== lastOver) {
      lastOver = run.over;
      paintOver(run);
    }
    const rings = run.rings ? run.rings.length : 0;
    if (rings !== cleanRings) cleanRings = rings;
    draw(state, dt);
  }

  await Game.start({ sim: sim, render: render, animate: animate, init: build });
})();

