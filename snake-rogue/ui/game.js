// The screen of «Змейка-рогалик»: the start screen (snakes, molts, the glade of the day, the
// workshop, the album), the glade on a canvas, the pick of an ability, the burrow, the result.
// The logic is in ../sim.js; the engine (Game.start) keeps the state, the clock (tick.hz), saves,
// prestige (the molts), sound and the links. Numbers come from g.config.
(function () {
  const h = ui.h;
  const sim = window.GameSim;
  const Art = window.SnakeArt;
  const content = {};
  Promise.all(sim.CONTENT_FILES.map((k) => fetch('../content/' + k + '.json').then((r) => r.json()).then((v) => { content[k] = v; })))
    .then(() => {
      sim.setContent(content);
      main();
    });

  function main() {
    const view = { ver: 0, key: '', fxSeen: -1, cell: 20, dpr: 1, lastSave: 0, pickAt: 0, colors: null, autoPaused: false };
    const sel = { snake: null, molt: null, charge: false };
    const touch = { id: null, x: 0, y: 0, moved: false, hold: 0, curling: false, lastTap: 0 };
    let g = null;
    let busy = false;

    // ---- sounds, vibration, icons ----

    Sfx.add('eat', [{ type: 'sine', f: [620, 900], d: 0.06, v: 0.28 }]);
    Sfx.add('curio', [{ type: 'triangle', f: [660, 660], d: 0.07 }, { at: 0.07, type: 'triangle', f: [880, 880], d: 0.07 }, { at: 0.14, type: 'triangle', f: [1320, 1320], d: 0.14 }]);
    Sfx.add('bite', [{ type: 'square', f: [240, 110], d: 0.14, v: 0.16 }]);
    Sfx.add('hit', [{ type: 'noise', f: [1, 1], d: 0.1, v: 0.22 }, { type: 'sine', f: [160, 70], d: 0.18, v: 0.3 }]);
    Sfx.add('open', [{ type: 'sine', f: [520, 520], d: 0.08, v: 0.25 }, { at: 0.08, type: 'sine', f: [780, 780], d: 0.12, v: 0.25 }]);
    Sfx.add('glade', [{ type: 'triangle', f: [440, 660], d: 0.16, v: 0.3 }]);
    Sfx.add('boss', [{ type: 'sawtooth', f: [180, 180], d: 0.12, v: 0.12 }, { at: 0.12, type: 'sawtooth', f: [140, 140], d: 0.24, v: 0.12 }]);
    Sfx.add('hawk', [{ type: 'sine', f: [1400, 1100], d: 0.12, v: 0.16 }, { at: 0.14, type: 'sine', f: [1400, 1100], d: 0.12, v: 0.16 }]);
    Sfx.add('rock', [{ type: 'noise', f: [1, 1], d: 0.16, v: 0.2 }]);
    Sfx.add('win', [{ type: 'triangle', f: [523, 523], d: 0.1 }, { at: 0.1, type: 'triangle', f: [659, 659], d: 0.1 },
      { at: 0.2, type: 'triangle', f: [784, 784], d: 0.1 }, { at: 0.3, type: 'triangle', f: [1047, 1047], d: 0.3 }]);
    Sfx.add('over', [{ type: 'sawtooth', f: [300, 80], d: 0.7, v: 0.14, a: 0.02 }]);
    Sfx.add('count', [{ type: 'sine', f: [880, 880], d: 0.05, v: 0.14 }]);
    const BUZZ = { hit: [40], bite: [25, 40, 25], over: [80, 60, 120], boss: [30, 50, 30, 50, 60] };

    GameIcons.add('snake', '<path d="M4 18c3 0 4-2 4-4s1-4 4-4 4 2 4 4 1 4 4 4"/><circle cx="19" cy="7" r="2"/><path d="M17 7c-3 0-5 1-5 3"/>');
    GameIcons.add('pause', '<path d="M8 5v14M16 5v14"/>');
    GameIcons.add('playi', '<path d="M7 5l12 7-12 7z"/>');
    GameIcons.add('bolt', '<path d="M13 3L5 14h6l-1 7 8-11h-6z"/>');
    GameIcons.add('ring', '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="3"/>');

    // ---- texts ----

    const RARITY = { common: 'обычная', rare: 'редкая', legend: 'легендарная' };
    // A picture beside a title and a text: the row of every list (the burrow, the workshop, the album).
    function pic(markup, size) { return Art.el(markup, size); }
    function itemRow(picture, headNodes, text) {
      return h('div', { class: 's-item-row' }, picture, h('div', { class: 's-item-b' }, h('div', { class: 's-item-h' }, headNodes), text ? h('div', { class: 'g-note' }, text) : null));
    }

    const REASON = { short: 'Змея стала короче трёх звеньев', hit: 'Удар — классическая гибель', bite: 'Укус себя — классическая гибель', quit: 'Забег оставлен', win: 'Каменная гряда пройдена' };
    function snakeOf(id) { return content.snakes.find((x) => x.id === id) || { id, title: id, text: '' }; }
    function landOf(id) { return content.lands.find((x) => x.id === id) || { id, title: id }; }
    function abilityTitle(run, id) { const a = sim.ability(run, id); return a ? a.title : id; }
    function abilityText(run, id) { const a = sim.ability(run, id); return a ? a.text : ''; }
    function today() { return Core.dayKey(Date.now()); }
    function cfg() { return g.config; }

    // ---- the frame ----

    function top(nodes) { g.el.top.replaceChildren.apply(g.el.top, flat(nodes)); }
    function field(nodes) { g.el.field.replaceChildren.apply(g.el.field, flat(nodes)); }
    function actions(nodes) { g.el.actions.replaceChildren.apply(g.el.actions, flat(nodes)); }
    function flat(nodes) {
      const out = [];
      (function walk(list) { list.forEach((x) => { if (Array.isArray(x)) walk(x); else if (x) out.push(x); }); })(nodes);
      return out;
    }
    function act(fn, o) { return g.act(fn, o); }
    function alive(run) { return run && (run.phase === 'play' || run.phase === 'pick'); }

    // ---- the start screen ----

    function startRun(daily) {
      if (busy || g.readonly) return;
      busy = true;
      const st = g.links.status();
      const wantCharge = !daily && sel.charge && st.steps && st.steps.on;
      let charge = false;
      const day = today();
      Promise.resolve(wantCharge ? g.links.spend('charge') : null)
        .then((r) => {
          if (r && r.ok) charge = true;
          else if (r) ui.toast(r.off ? 'Связка «Шаги» выключена' : 'Нужна ' + r.need + ' энергия');
          if (daily) {
            const d = g.state.meta.daily;
            if (d && d.day === day && d.layout) return [d.layout, null];
            return Promise.all([g.stock.take('glades'), null]);
          }
          return Promise.all([g.stock.count('glades') > 0 ? g.stock.take('glades') : null, g.stock.count('abilities') > 0 ? g.stock.take('abilities') : null]);
        })
        .then(([layout, extra]) => {
          const o = { seed: g.rng.int(0, 2147483646), snake: sel.snake, molt: sel.molt, charge, layouts: [], extra: [] };
          if (layout && !sim.validateStock('glades', layout)) o.layouts.push(daily ? Object.assign({}, layout, { land: 'meadow' }) : layout);
          if (extra && !sim.validateStock('abilities', extra)) o.extra.push(extra);
          if (daily) {
            o.daily = true;
            o.day = day;
            o.seed = Rng.hash('snake-rogue:' + day);
          }
          act((s) => {
            if (daily) {
              const m = sim.meta(s);
              if (m.daily.day !== day) m.daily = { day, best: 0, tries: 0 };
              if (layout) m.daily.layout = layout;
            }
            s.meta.choice.charge = sel.charge;
            return sim.newRun(s, g.config, o);
          }, { now: true, reason: 'run' });
          view.fxSeen = g.state.run.fxN;
          if (charge) g.flash('steps', 'Заряд от шагов', '+' + cfg()['charge.length'] + ' звена на старте');
          g.sfx('glade');
        })
        .then(() => { busy = false; }, (error) => {
          busy = false;
          throw error;
        });
    }

    function moltRules(n) { return content.molts.filter((x) => x.n <= n); }

    function renderHub(state) {
      const meta = sim.meta(state);
      const topMolt = sim.moltTop(state);
      if (sel.snake === null || !meta.unlocked[sel.snake]) sel.snake = meta.unlocked[meta.choice.snake] ? meta.choice.snake : 'poloz';
      if (sel.molt === null || sel.molt > topMolt) sel.molt = Math.min(topMolt, meta.choice.molt || 0);
      const rec = meta.rec;
      top([h('div', { class: 's-hud' },
        h('div', { class: 's-cur' }, GameIcons.el('leaf'), h('span', { class: 'g-big' }, g.fmt(sim.scales(state))), h('span', { class: 's-unit' }, 'чешуек')),
        h('div', { class: 's-side' }, 'Линек открыто: ' + topMolt, h('br'), 'Побед: ' + rec.wins + ' · рекорд длины ' + rec.bestLen))]);

      const snakes = h('div', { class: 's-snakes' }, content.snakes.map((x) => {
        const open = !!meta.unlocked[x.id];
        return h('button', {
          class: 's-choice' + (sel.snake === x.id ? ' on' : '') + (open ? '' : ' locked'), disabled: !open, type: 'button',
          onclick: () => { sel.snake = x.id; g.redraw(); }
        }, pic(Art.snake(x.id), 52), h('span', { class: 's-choice-b' }, h('span', { class: 's-choice-t' }, x.title), h('span', { class: 's-choice-s' }, open ? x.text : 'Откроется: ' + x.unlock)));
      }));
      const molts = h('div', { class: 's-molts' });
      Array.from({ length: topMolt + 1 }, (x, n) => n).forEach((n) => {
        molts.append(h('button', { class: 's-molt' + (sel.molt === n ? ' on' : ''), type: 'button', onclick: () => { sel.molt = n; g.redraw(); } }, String(n)));
      });
      const rules = moltRules(sel.molt);
      const moltNote = sel.molt ? h('div', { class: 'g-note' }, h('div', {}, 'Линька ' + sel.molt + ': чешуек ' + g.fmt.mult(1 + sel.molt * cfg()['molt.bonus'])),
        h('ul', { class: 's-rules' }, rules.map((x) => h('li', {}, x.text)))) :
        h('div', { class: 'g-note' }, topMolt ? 'Без правил линек.' : 'Победа открывает линьку 1: труднее, но чешуек больше.');
      const st = g.links.status();
      const chargeOn = !!(st.steps && st.steps.on);
      if (!chargeOn) sel.charge = false;
      const charge = chargeOn ? h('button', { class: 's-switch' + (sel.charge ? ' on' : ''), type: 'button', onclick: () => { sel.charge = !sel.charge; g.redraw(); } },
        GameIcons.el('steps'), h('span', { class: 'grow' }, 'Заряд от шагов: +' + cfg()['charge.length'] + ' звена на старте — 1 энергия'),
        h('span', { class: 's-switch-v' }, sel.charge ? 'да' : 'нет')) : null;
      const d = meta.daily && meta.daily.day === today() ? meta.daily : null;
      const daily = h('div', { class: 's-daily' }, h('div', { class: 's-daily-t' }, GameIcons.el('timer'), 'Поляна дня'),
        h('div', { class: 'g-note' }, d && d.layout ? 'Сегодня: «' + d.layout.title + '». Одно зерно на день, Полоз, без линек.' : 'Одно зерно на день и своя раскладка первой поляны. Полоз, без линек.'),
        d ? h('div', { class: 'g-note' }, 'Попыток: ' + d.tries + ', лучшее — полян ' + d.best) : null);
      const mult = g.links.mult();
      field([h('h3', { class: 's-h' }, 'Змея'), snakes, h('h3', { class: 's-h' }, 'Линька'), molts, moltNote, charge, daily,
        mult > 1 ? h('div', { class: 'g-note s-trip' }, GameIcons.el('train'), 'В поездке чешуйки ' + g.fmt.mult(mult)) : null]);

      const gain = sim.prestigeGain(state, sim.LAYER, g.config);
      actions([
        h('button', { class: 'g-btn primary', id: 'start', type: 'button', onclick: () => startRun(false) }, GameIcons.el('snake'), 'Начать забег'),
        h('div', { class: 'g-btns' },
          h('button', { class: 'g-btn small', id: 'workshop', type: 'button', onclick: workshopSheet }, GameIcons.el('gear'), 'Мастерская'),
          h('button', { class: 'g-btn small', id: 'album', type: 'button', onclick: albumSheet }, GameIcons.el('map'), 'Альбом')),
        h('div', { class: 'g-btns' },
          h('button', { class: 'g-btn small', id: 'daily', type: 'button', onclick: () => startRun(true) }, GameIcons.el('timer'), 'Поляна дня'),
          Big.gt(gain, 0) ? view.prestige : null)
      ]);
    }

    // ---- the glade ----

    function buildStage() {
      view.canvas = h('canvas', { class: 's-canvas', id: 'board' });
      view.ctx = view.canvas.getContext('2d');
      view.count = h('div', { class: 's-count', hidden: true });
      view.hint = h('div', { class: 's-hint', hidden: true });
      view.overlay = h('div', { class: 's-overlay', hidden: true });
      view.box = h('div', { class: 's-box' }, view.canvas, view.count, view.hint, view.overlay);
      view.abs = h('div', { class: 's-abs' });
      view.mapBox = h('div', { class: 's-map' });
      view.stage = h('div', { class: 's-stage' }, view.box);
      view.hudLand = h('div', { class: 's-land' });
      view.hudGoal = h('span', { class: 'g-num' });
      view.hudLen = h('span', { class: 'g-num' });
      view.hudSpeed = h('span', { class: 'g-num' });
      view.hudSeeds = h('span', { class: 'g-num' });
      view.hudGoalLabel = h('span', { class: 's-k' });
      view.hud = h('div', { class: 's-play-hud' }, view.hudLand,
        h('div', { class: 's-chips' },
          h('span', { class: 's-chip' }, view.hudGoalLabel, view.hudGoal),
          h('span', { class: 's-chip' }, h('span', { class: 's-k' }, 'Длина'), view.hudLen),
          h('span', { class: 's-chip' }, h('span', { class: 's-k' }, 'Скорость'), view.hudSpeed),
          h('span', { class: 's-chip' }, h('span', { class: 's-k' }, 'Зёрна'), view.hudSeeds)));
    }

    function renderPlay(state) {
      const run = state.run;
      top([view.hud]);
      const wide = g.layout === 'wide';
      // narrow: the abilities along the lower edge of the field; wide: beside it with the map of the land
      if (wide) view.stage.replaceChildren(view.box); else view.stage.replaceChildren(view.box, view.abs);
      field([view.stage]);
      view.abs.replaceChildren.apply(view.abs, abilityChips(run));
      renderMap(run);
      const pauseBtn = h('button', { class: 'g-btn small', id: 'pause', type: 'button', onclick: togglePause }, GameIcons.el(run.paused ? 'playi' : 'pause'), run.paused ? 'Продолжить' : 'Пауза');
      const dashBtn = run.ab.dash ? h('button', { class: 'g-btn small', id: 'dash', type: 'button', onclick: doDash }, GameIcons.el('bolt'), 'Рывок') : null;
      const absBtn = h('button', { class: 'g-btn small', id: 'abilities', type: 'button', onclick: abilitiesSheet }, 'Способности');
      actions([wide ? h('div', { class: 's-panel' }, view.mapBox, h('div', { class: 's-map-t' }, 'Способности'), view.abs) : null,
        h('div', { class: 'g-btns s-btns' }, pauseBtn, dashBtn, absBtn)]);
      renderOverlay(state);
      sizeStage();
    }

    function abilityChips(run) {
      const ids = Object.keys(run.ab);
      if (!ids.length) return [h('div', { class: 's-abs-none' }, 'Способностей пока нет — ешьте диковины')];
      return ids.map((id) => {
        const a = sim.ability(run, id);
        const lvl = run.ab[id];
        return h('button', { class: 's-ab', type: 'button', onclick: abilitiesSheet }, pic(Art.ability(id, a.rarity), 28), h('span', { class: 's-ab-t' }, g.layout === 'wide' ? a.title : a.short), lvl > 1 ? h('span', { class: 's-ab-l' }, String(lvl)) : null);
      });
    }

    function renderMap(run) {
      const g0 = run.g;
      const land = Math.floor(g0.n / 3);
      const cells = [];
      for (var i = 0; i < 3; i++) {
        const n = land * 3 + i;
        cells.push(h('div', { class: 's-map-c' + (n < g0.n ? ' done' : '') + (n === g0.n ? ' now' : '') + (i === 2 ? ' boss' : '') },
          i === 2 ? GameIcons.el('crown') : h('span', {}, String(i + 1))));
      }
      const parts = [h('div', { class: 's-map-t s-map-land' }, pic(Art.land(g0.land), 32), landOf(g0.land).title), h('div', { class: 's-map-row' }, cells)];
      if (g0.boss) {
        const l = landOf(g0.land);
        parts.push(h('div', { class: 'g-note' }, h('b', {}, l.bossTitle), h('div', {}, l.bossText)));
      } else if (g0.layout) {
        parts.push(h('div', { class: 'g-note' }, '«' + g0.layout + '»'));
      }
      if (run.next) {
        view.nextCanvas = h('canvas', { class: 's-next' });
        parts.push(h('div', { class: 's-map-t' }, 'Зоркость: следующая поляна'), view.nextCanvas);
      } else {
        view.nextCanvas = null;
      }
      view.mapBox.replaceChildren.apply(view.mapBox, parts);
      if (view.nextCanvas) drawNext(run.next);
    }

    function renderOverlay(state) {
      const run = state.run;
      if (run.phase === 'pick' && run.pick) {
        // the guard counts from the moment the cards appear, even if the curio event was not seen yet
        if (view.overlay.hidden || view.overlay.className !== 's-overlay pick') view.pickAt = performance.now();
        view.overlay.hidden = false;
        view.overlay.className = 's-overlay pick';
        view.overlay.replaceChildren.apply(view.overlay, flat([
          h('div', { class: 's-pick-t' }, GameIcons.el('ring'), run.pick.luck ? 'Удача: четыре на выбор' : 'Диковина: возьмите одну'),
          h('div', { class: 's-cards' }, run.pick.opts.map((id, i) => {
            const a = sim.ability(run, id) || { title: id, text: '', rarity: 'rare' };
            const lvl = run.ab[id] || 0;
            const card = h('button', { class: 's-card ' + (a.rarity || 'rare'), type: 'button' },
              pic(Art.ability(id, a.rarity), 44),
              h('span', { class: 's-card-b' },
                h('span', { class: 's-card-h' }, h('span', { class: 's-card-t' }, a.title), h('span', { class: 's-tag ' + a.rarity }, RARITY[a.rarity] || 'от модели')),
                h('span', { class: 's-card-x' }, a.text),
                lvl ? h('span', { class: 's-card-l' }, 'Уровень ' + (lvl + 1)) : null));
            guardTap(card, () => pickCard(i));
            return card;
          })),
          run.rerolls > 0 ? h('button', { class: 'g-btn small', type: 'button', onclick: doReroll }, GameIcons.el('reset'), 'Перебросить · осталось ' + run.rerolls) : null]));
        return;
      }
      if (run.paused) {
        view.overlay.hidden = false;
        view.overlay.className = 's-overlay paused';
        view.overlay.replaceChildren(h('div', { class: 's-pause-t' }, 'Пауза'),
          h('button', { class: 'g-btn primary', type: 'button', onclick: togglePause }, GameIcons.el('playi'), 'Продолжить'),
          h('div', { class: 'g-note' }, 'После паузы — отсчёт ' + cfg()['countdown.resumeSec'] + ' с.'));
        return;
      }
      view.overlay.hidden = true;
      view.overlay.replaceChildren();
    }

    // A card takes only a touch that began after the guard: a swipe that ate the curio does not pick.
    function guardTap(node, fn) {
      let downAt = 0;
      node.addEventListener('pointerdown', () => { downAt = performance.now(); });
      node.addEventListener('click', () => {
        const at = downAt || performance.now();
        if (at - view.pickAt < cfg()['control.pickGuardMs']) return;
        fn();
      });
    }

    function pickCard(i) {
      const run = g.state.run;
      if (run.phase !== 'pick') return;
      const res = act((s) => sim.choose(s, g.config, i), { now: true, reason: 'pick' });
      if (res && res.ok) {
        g.sfx('level');
        g.buzz('tap');
      }
    }

    function doReroll() {
      const res = act((s) => sim.reroll(s, g.config), { now: true, reason: 'pick' });
      if (res && res.ok) {
        view.pickAt = performance.now();
        g.sfx('tap');
      } else {
        g.sfx('deny');
      }
    }

    function togglePause() {
      const run = g.state.run;
      if (!alive(run)) return;
      view.autoPaused = false;
      if (run.paused) act((s) => sim.resume(s, g.config));
      else act((s) => sim.pause(s), { now: true, reason: 'pause' });
      g.sfx('tap');
    }

    function doDash() {
      const res = act((s) => sim.dash(s, g.config));
      if (!res || !res.ok) g.buzz('deny');
    }

    function turnTo(d) {
      const run = g.state.run;
      if (!run || run.phase !== 'play' || run.paused) return;
      act((s) => sim.turn(s, g.config, d));
    }

    function playing() {
      const run = g && g.state.run;
      return !!run && run.phase === 'play' && !run.paused && !g.readonly;
    }

    // ---- input: swipes anywhere, halves, double tap, hold, keys ----

    function onDown(e) {
      if (!playing() || touch.id !== null) return;
      if (e.target.closest && e.target.closest('button, a, input, .g-sheet, .g-bar')) return;
      const edge = cfg()['control.edgePx'];
      if (e.clientX < edge || e.clientX > window.innerWidth - edge) return;
      touch.id = e.pointerId;
      touch.x = e.clientX;
      touch.y = e.clientY;
      touch.moved = false;
      touch.curling = false;
      clearTimeout(touch.hold);
      touch.hold = setTimeout(() => {
        if (touch.id === null || touch.moved) return;
        const run = g.state.run;
        if (!run.ab.curl) return;
        const ok = act((s) => sim.curl(s, g.config, true));
        if (ok) touch.curling = true;
      }, cfg()['control.holdMs']);
    }

    function onMove(e) {
      if (e.pointerId !== touch.id) return;
      const dx = e.clientX - touch.x;
      const dy = e.clientY - touch.y;
      const dead = cfg()['control.deadPx'];
      if (Math.max(Math.abs(dx), Math.abs(dy)) < dead) return;
      const d = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0);
      touch.x = e.clientX;
      touch.y = e.clientY;
      touch.moved = true;
      clearTimeout(touch.hold);
      if (touch.curling) {
        touch.curling = false;
        act((s) => sim.curl(s, g.config, false));
      }
      turnTo(d);
    }

    function onUp(e) {
      if (e.pointerId !== touch.id) return;
      touch.id = null;
      clearTimeout(touch.hold);
      if (touch.curling) {
        touch.curling = false;
        act((s) => sim.curl(s, g.config, false));
        return;
      }
      if (touch.moved || !playing() || e.type === 'pointercancel') return;
      if (cfg()['control.mode'] === 'halves') {
        act((s) => sim.turnRel(s, g.config, e.clientX < window.innerWidth / 2 ? -1 : 1));
        return;
      }
      const now = performance.now();
      if (now - touch.lastTap < cfg()['control.doubleTapMs']) {
        touch.lastTap = 0;
        if (g.state.run.ab.dash) doDash();
      } else {
        touch.lastTap = now;
      }
    }

    const KEYS = { ArrowUp: 0, KeyW: 0, ArrowRight: 1, KeyD: 1, ArrowDown: 2, KeyS: 2, ArrowLeft: 3, KeyA: 3 };

    function onKey(e) {
      if (!g || e.repeat) return;
      if (document.querySelector('.g-sheet')) return;
      const run = g.state.run;
      if (!run) return;
      if (run.phase === 'pick' && /^Digit[1-4]$/.test(e.code)) {
        if (performance.now() - view.pickAt >= cfg()['control.pickGuardMs']) pickCard(Number(e.code.slice(5)) - 1);
        e.preventDefault();
        return;
      }
      if (run.phase === 'pick' && e.code === 'KeyR') { doReroll(); return; }
      if (!alive(run)) return;
      if (e.code === 'Space' || e.code === 'KeyP' || e.code === 'Escape') {
        togglePause();
        e.preventDefault();
        return;
      }
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'KeyE') {
        doDash();
        return;
      }
      if (KEYS[e.code] !== undefined) {
        turnTo(KEYS[e.code]);
        e.preventDefault();
      }
    }

    // ---- the canvas ----

    function readColors() {
      const css = getComputedStyle(document.documentElement);
      const v = (name, fallback) => (css.getPropertyValue(name) || '').trim() || fallback;
      view.colors = {
        ground: v('--surface', '#1d1f22'), grid: v('--line', '#2c2f33'), ink: v('--ink', '#e8e8e8'), ink2: v('--ink-2', '#a0a0a0'),
        accent: v('--accent', '#7bbf6a'), bg: v('--bg', '#121315')
      };
    }

    const SNAKE_COLORS = Art.SNAKES;
    const SNAKE_MARKS = { poloz: '#d6f0c4', copper: '#7a4420', boa: '#5d5b2a', twohead: '#e3d9ff', glass: '#f2fbff' };
    const LAND_TINT = { meadow: '#7cbf6b', bog: '#5fa39a', ridge: '#9aa0a8' };

    function sizeStage() {
      if (!view.box || !view.box.isConnected) return;
      const run = g.state.run;
      const W = (run.g && run.g.w) || cfg()['grid.w'];
      const H = (run.g && run.g.h) || cfg()['grid.h'];
      const f = g.el.field;
      const wide = g.layout === 'wide';
      const absH = wide ? 0 : (view.abs.offsetHeight || 0) + 8;
      const availW = Math.max(120, f.clientWidth - 32);
      const availH = Math.max(160, f.clientHeight - 8 - absH);
      const cell = Math.max(8, Math.floor(Math.min(availW / W, availH / H)));
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      if (cell === view.cell && dpr === view.dpr && view.canvas.width === W * cell * dpr) return;
      view.cell = cell;
      view.dpr = dpr;
      view.canvas.width = W * cell * dpr;
      view.canvas.height = H * cell * dpr;
      view.canvas.style.width = W * cell + 'px';
      view.canvas.style.height = H * cell + 'px';
      view.box.style.width = W * cell + 'px';
      view.box.style.height = H * cell + 'px';
    }

    function centerOf(g0, c) { return [(c % g0.w + 0.5) * view.cell, (Math.floor(c / g0.w) + 0.5) * view.cell]; }
    function near(g0, a, b) { return Math.abs(a % g0.w - b % g0.w) + Math.abs(Math.floor(a / g0.w) - Math.floor(b / g0.w)) === 1; }
    function jitter(c, k) { const x = Math.sin(c * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); }

    function draw(state) {
      const run = state.run;
      if (!view.ctx || !run.g || !view.canvas.isConnected) return;
      const c = view.ctx;
      const g0 = run.g;
      const S = view.cell;
      const col = view.colors;
      const W = g0.w;
      const H = g0.h;
      c.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
      c.fillStyle = col.ground;
      c.fillRect(0, 0, W * S, H * S);
      // a quiet chequer in the colour of the land, a tuft of grass here and there
      const tint = LAND_TINT[g0.land] || col.grid;
      c.fillStyle = tint;
      c.globalAlpha = 0.07;
      for (var q = 0; q < W * H; q++) if ((q % W + Math.floor(q / W)) % 2) c.fillRect((q % W) * S, Math.floor(q / W) * S, S, S);
      c.globalAlpha = 0.28;
      c.strokeStyle = tint;
      c.lineWidth = Math.max(1, S / 16);
      c.beginPath();
      for (var q2 = 0; q2 < W * H; q2++) {
        if (jitter(q2, 3) > 0.14 || g0.grid.charAt(q2) !== '.') continue;
        const tx = (q2 % W + 0.3 + 0.4 * jitter(q2, 4)) * S;
        const ty = (Math.floor(q2 / W) + 0.7) * S;
        c.moveTo(tx, ty); c.lineTo(tx - S * 0.1, ty - S * 0.24);
        c.moveTo(tx, ty); c.lineTo(tx + S * 0.03, ty - S * 0.3);
        c.moveTo(tx, ty); c.lineTo(tx + S * 0.14, ty - S * 0.2);
      }
      c.stroke();
      c.globalAlpha = 1;
      const t = performance.now() / 1000;
      // the ground: bog, stones, hedgehogs, vines
      for (var i = 0; i < g0.grid.length; i++) {
        const ch = g0.grid.charAt(i);
        if (ch === '.') continue;
        const x = (i % W) * S;
        const y = Math.floor(i / W) * S;
        if (ch === '~') {
          c.fillStyle = '#25433f';
          c.fillRect(x, y, S, S);
        } else if (ch === '#') {
          c.fillStyle = '#6c7078';
          c.beginPath();
          for (var k = 0; k < 6; k++) {
            const a = k / 6 * Math.PI * 2 + jitter(i, 9);
            const r = S * (0.36 + 0.12 * jitter(i, k));
            const px = x + S / 2 + Math.cos(a) * r;
            const py = y + S / 2 + Math.sin(a) * r;
            if (k) c.lineTo(px, py); else c.moveTo(px, py);
          }
          c.closePath();
          c.fill();
          // the lit facet
          c.fillStyle = '#8b9098';
          c.beginPath();
          c.moveTo(x + S * 0.3, y + S * 0.36);
          c.lineTo(x + S * 0.52, y + S * 0.2);
          c.lineTo(x + S * 0.7, y + S * 0.38);
          c.lineTo(x + S * 0.48, y + S * 0.48);
          c.closePath();
          c.fill();
        } else if (ch === 'h') {
          c.strokeStyle = '#9a8062';
          c.lineWidth = Math.max(1, S / 12);
          c.beginPath();
          for (var k = 0; k < 10; k++) {
            const a = k / 10 * Math.PI * 2;
            c.moveTo(x + S / 2 + Math.cos(a) * S * 0.2, y + S / 2 + Math.sin(a) * S * 0.2);
            c.lineTo(x + S / 2 + Math.cos(a) * S * 0.46, y + S / 2 + Math.sin(a) * S * 0.46);
          }
          c.stroke();
          c.fillStyle = '#7b654c';
          c.beginPath();
          c.arc(x + S / 2, y + S / 2, S * 0.26, 0, Math.PI * 2);
          c.fill();
          c.fillStyle = '#c9b08a';
          c.beginPath();
          c.arc(x + S * 0.42, y + S * 0.56, S * 0.1, 0, Math.PI * 2);
          c.fill();
        } else if (ch === 'v') {
          c.fillStyle = '#3f7d48';
          c.beginPath();
          c.ellipse(x + S / 2, y + S / 2, S * 0.42, S * 0.3, jitter(i, 1) * Math.PI, 0, Math.PI * 2);
          c.fill();
          c.fillStyle = '#5fa868';
          c.beginPath();
          c.ellipse(x + S * 0.42, y + S * 0.42, S * 0.2, S * 0.12, jitter(i, 2) * Math.PI, 0, Math.PI * 2);
          c.fill();
        } else if (ch === 'm') {
          c.fillStyle = '#56704a';
          c.fillRect(x + 1, y + 1, S - 2, S - 2);
        }
      }
      // the stone master: the next ring blinks before it closes
      if (g0.boss === 'stone' && g0.b && g0.b.warn && !g0.exitOpen) {
        c.strokeStyle = '#c0703a';
        c.globalAlpha = 0.5 + 0.5 * Math.sin(t * 12);
        c.lineWidth = 2;
        const k = g0.b.ring;
        c.strokeRect(k * S + 1, k * S + 1, (W - 2 * k) * S - 2, (H - 2 * k) * S - 2);
        c.globalAlpha = 1;
      }
      if (g0.boss === 'mother' && g0.b) {
        const [mx, my] = centerOf(g0, g0.b.c);
        c.fillStyle = '#6f8f5c';
        c.beginPath();
        c.arc(mx, my, S * 1.35, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = '#2b3a26';
        c.beginPath();
        c.arc(mx - S * 0.4, my - S * 0.2, S * 0.16, 0, Math.PI * 2);
        c.arc(mx + S * 0.4, my - S * 0.2, S * 0.16, 0, Math.PI * 2);
        c.fill();
      }
      // the exit on the edge
      {
        const ex = (g0.exit % W) * S;
        const ey = Math.floor(g0.exit / W) * S;
        c.fillStyle = g0.exitOpen ? col.accent : col.grid;
        c.globalAlpha = g0.exitOpen ? 0.55 + 0.45 * Math.sin(t * 6) : 1;
        c.fillRect(ex + 2, ey + 2, S - 4, S - 4);
        c.globalAlpha = 1;
        // a doorway: the dark arch inside the frame
        c.fillStyle = col.bg;
        c.beginPath();
        c.moveTo(ex + S * 0.3, ey + S * 0.82);
        c.lineTo(ex + S * 0.3, ey + S * 0.48);
        c.arc(ex + S * 0.5, ey + S * 0.48, S * 0.2, Math.PI, 0);
        c.lineTo(ex + S * 0.7, ey + S * 0.82);
        c.closePath();
        c.fill();
      }
      // holes
      g0.holes.forEach((q, k) => {
        const [hx, hy] = centerOf(g0, q);
        c.fillStyle = '#0b0c0d';
        c.beginPath();
        c.arc(hx, hy, S * 0.38, 0, Math.PI * 2);
        c.fill();
        c.strokeStyle = k % 2 ? '#8a7a5a' : '#5a6a8a';
        c.lineWidth = 2;
        c.stroke();
      });
      // food: fruits, curios (a ring), grains of the twin and the molt
      g0.food.forEach((f) => {
        const [fx0, fy0] = centerOf(g0, f.c);
        if (f.k === 'c') {
          c.strokeStyle = '#e9c95b';
          c.lineWidth = Math.max(2, S / 7);
          c.beginPath();
          c.arc(fx0, fy0, S * (0.3 + 0.04 * Math.sin(t * 5)), 0, Math.PI * 2);
          c.stroke();
        } else {
          c.fillStyle = f.k === 'b' ? '#e3a25a' : '#e0675a';
          c.beginPath();
          const fr = S * (f.k === 'b' ? 0.24 : 0.32);
          c.arc(fx0, fy0 + S * 0.03, fr, 0, Math.PI * 2);
          c.fill();
          // a light spot, a stalk and a leaf
          c.fillStyle = f.k === 'b' ? '#f2c894' : '#f2a096';
          c.beginPath();
          c.arc(fx0 - fr * 0.38, fy0 - fr * 0.25, fr * 0.26, 0, Math.PI * 2);
          c.fill();
          c.strokeStyle = '#6e5230';
          c.lineWidth = Math.max(1, S / 14);
          c.beginPath();
          c.moveTo(fx0, fy0 - fr * 0.8);
          c.lineTo(fx0 + fr * 0.2, fy0 - fr * 1.35);
          c.stroke();
          c.fillStyle = '#7cbf6b';
          c.beginPath();
          c.ellipse(fx0 + fr * 0.62, fy0 - fr * 1.1, fr * 0.42, fr * 0.2, -0.5, 0, Math.PI * 2);
          c.fill();
        }
      });
      // rockfall marks
      g0.rocks.forEach((m) => {
        const x = (m.c % W) * S;
        const y = Math.floor(m.c / W) * S;
        const left = Math.max(0, Math.min(1, m.t / cfg()['rock.delay']));
        c.strokeStyle = '#c0703a';
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(x + S * 0.2, y + S * 0.2);
        c.lineTo(x + S * 0.8, y + S * 0.8);
        c.moveTo(x + S * 0.8, y + S * 0.2);
        c.lineTo(x + S * 0.2, y + S * 0.8);
        c.stroke();
        c.globalAlpha = 0.35;
        c.fillStyle = '#c0703a';
        c.fillRect(x, y + S * left, S, S * (1 - left));
        c.globalAlpha = 1;
      });
      // creatures
      g0.beetles.forEach((b) => {
        const [bx, by] = centerOf(g0, b.c);
        c.fillStyle = '#2a2c2f';
        c.strokeStyle = '#8c8f94';
        c.lineWidth = 1.5;
        c.beginPath();
        // six legs, then the shell with its seam
        c.beginPath();
        for (var leg = -1; leg <= 1; leg++) {
          c.moveTo(bx - S * 0.2, by + leg * S * 0.14);
          c.lineTo(bx - S * 0.42, by + leg * S * 0.24);
          c.moveTo(bx + S * 0.2, by + leg * S * 0.14);
          c.lineTo(bx + S * 0.42, by + leg * S * 0.24);
        }
        c.stroke();
        c.beginPath();
        c.ellipse(bx, by, S * 0.26, S * 0.32, 0, 0, Math.PI * 2);
        c.fill();
        c.stroke();
        c.beginPath();
        c.moveTo(bx, by - S * 0.14);
        c.lineTo(bx, by + S * 0.32);
        c.moveTo(bx - S * 0.24, by - S * 0.12);
        c.lineTo(bx + S * 0.24, by - S * 0.12);
        c.stroke();
      });
      g0.mice.forEach((m) => {
        const [mx, my] = centerOf(g0, m.c);
        c.fillStyle = '#b3ada3';
        c.beginPath();
        c.ellipse(mx, my, S * 0.34, S * 0.22, 0, 0, Math.PI * 2);
        c.fill();
        c.beginPath();
        c.arc(mx - S * 0.22, my - S * 0.18, S * 0.1, 0, Math.PI * 2);
        c.arc(mx + S * 0.22, my - S * 0.18, S * 0.1, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = '#141516';
        c.beginPath();
        c.arc(mx - S * 0.1, my - S * 0.02, S * 0.045, 0, Math.PI * 2);
        c.arc(mx + S * 0.1, my - S * 0.02, S * 0.045, 0, Math.PI * 2);
        c.fill();
        c.strokeStyle = '#d9a9a0';
        c.lineWidth = Math.max(1, S / 16);
        c.beginPath();
        c.moveTo(mx, my + S * 0.2);
        c.quadraticCurveTo(mx + S * 0.3, my + S * 0.42, mx + S * 0.42, my + S * 0.22);
        c.stroke();
      });
      if (g0.rival && !g0.rival.dead) ribbon(g0, g0.rival.body, '#cf6a6a', 0.62, null);
      if (g0.boss === 'poloz' && g0.b && !g0.b.dead) ribbon(g0, g0.b.body, g0.b.stun > 0 ? '#8d8260' : '#c9b45a', 0.8, null);
      // the shadow of Второй хвост
      if (run.ab.shadow && run.hist.length > cfg()['ab.shadow.lag']) {
        const [sx, sy] = centerOf(g0, run.hist[cfg()['ab.shadow.lag']]);
        c.globalAlpha = 0.4;
        c.fillStyle = SNAKE_COLORS[run.snake] || col.accent;
        c.beginPath();
        c.arc(sx, sy, S * 0.36, 0, Math.PI * 2);
        c.fill();
        c.globalAlpha = 1;
      }
      drawSnake(run, g0);
      // the hawk's shadow over its square
      if (g0.hawk) {
        const x = (g0.hawk.c % W - 1) * S;
        const y = (Math.floor(g0.hawk.c / W) - 1) * S;
        c.fillStyle = '#000000';
        c.globalAlpha = 0.28 + 0.12 * Math.sin(t * 10);
        c.fillRect(x, y, 3 * S, 3 * S);
        c.globalAlpha = 1;
        c.strokeStyle = '#d0d0d0';
        c.lineWidth = 1.5;
        c.strokeRect(x + 1, y + 1, 3 * S - 2, 3 * S - 2);
      }
    }

    // A rounded ribbon through the centres of the cells; a break where it jumps (walls, holes).
    function ribbon(g0, cells, color, width, ends) {
      const c = view.ctx;
      const S = view.cell;
      c.strokeStyle = color;
      c.lineWidth = S * width;
      c.lineCap = 'round';
      c.lineJoin = 'round';
      const pts = cells.map((q) => centerOf(g0, q));
      if (ends) {
        if (ends.head) pts[0] = ends.head;
        if (ends.tail) pts[pts.length - 1] = ends.tail;
      }
      c.beginPath();
      for (var i = 0; i < pts.length; i++) {
        const jump = i > 0 && !near(g0, cells[i - 1], cells[i]);
        if (i === 0 || jump) c.moveTo(pts[i][0], pts[i][1]); else c.lineTo(pts[i][0], pts[i][1]);
      }
      if (pts.length === 1) c.lineTo(pts[0][0] + 0.01, pts[0][1]);
      c.stroke();
    }

    function lerp(a, b, f) { return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]; }

    function drawSnake(run, g0) {
      const body = run.body;
      if (!body.length) return;
      const c = view.ctx;
      const S = view.cell;
      const moving = run.phase === 'play' && !run.paused && !run.wait && run.stun <= 0 && run.count <= 0 && run.curl <= 0;
      const f = moving ? Math.max(0, Math.min(1, run.acc / sim.period(run, g.config))) : 1;
      // the drawn snake is a step behind: the head slides from the neck to its cell
      const ends = {};
      if (body.length > 1 && near(g0, body[1], body[0])) ends.head = lerp(centerOf(g0, body[1]), centerOf(g0, body[0]), f);
      let cells = body;
      if (run.lastTail >= 0 && body.length > 1 && near(g0, run.lastTail, body[body.length - 1])) {
        // the tail end slides too: from the cell it left to its own
        cells = body.concat([run.lastTail]);
        ends.tail = lerp(centerOf(g0, run.lastTail), centerOf(g0, body[body.length - 1]), f);
      }
      const color = SNAKE_COLORS[run.snake] || view.colors.accent;
      // a stunned or waiting snake pulses, but never fades out of sight
      const blink = run.stun > 0 || run.wait ? 0.7 + 0.3 * Math.sin(performance.now() / 90) : 1;
      c.globalAlpha = (run.snake === 'glass' ? 0.75 : 1) * blink;
      ribbon(g0, cells, color, 0.66, ends);
      // the pattern of the skin: a row of marks along the back
      c.setLineDash([S * 0.02, S * 0.48]);
      ribbon(g0, cells, SNAKE_MARKS[run.snake] || '#ffffff', 0.2, ends);
      c.setLineDash([]);
      const head = ends.head || centerOf(g0, body[0]);
      c.fillStyle = color;
      c.beginPath();
      c.arc(head[0], head[1], S * 0.4, 0, Math.PI * 2);
      c.fill();
      // eyes look where it goes
      const d = run.dir;
      const ex = [0, 1, 0, -1][d];
      const ey = [-1, 0, 1, 0][d];
      c.fillStyle = '#141516';
      c.beginPath();
      c.arc(head[0] + ex * S * 0.15 - ey * S * 0.16, head[1] + ey * S * 0.15 + ex * S * 0.16, S * 0.07, 0, Math.PI * 2);
      c.arc(head[0] + ex * S * 0.15 + ey * S * 0.16, head[1] + ey * S * 0.15 - ex * S * 0.16, S * 0.07, 0, Math.PI * 2);
      c.fill();
      if (run.snake === 'twohead' && body.length > 1) {
        const tail = centerOf(g0, body[body.length - 1]);
        c.fillStyle = color;
        c.beginPath();
        c.arc(tail[0], tail[1], S * 0.36, 0, Math.PI * 2);
        c.fill();
      }
      c.globalAlpha = 1;
    }

    function drawNext(next) {
      const cv = view.nextCanvas;
      if (!cv || !next) return;
      const S = 6;
      const W = cfg()['grid.w'];
      const H = Math.round(next.grid.length / W);
      cv.width = W * S;
      cv.height = H * S;
      const c = cv.getContext('2d');
      c.fillStyle = view.colors.ground;
      c.fillRect(0, 0, W * S, H * S);
      for (var i = 0; i < next.grid.length; i++) {
        const ch = next.grid.charAt(i);
        if (ch === '.') continue;
        c.fillStyle = ch === '#' ? '#6c7078' : ch === 'h' ? '#9a8062' : ch === '~' ? '#25433f' : ch === 'v' ? '#3f7d48' : '#56704a';
        c.fillRect((i % W) * S, Math.floor(i / W) * S, S, S);
      }
      c.fillStyle = view.colors.accent;
      c.fillRect((next.exit % W) * S, Math.floor(next.exit / W) * S, S, S);
    }

    function updateHud(state) {
      const run = state.run;
      if (!run.g || !view.hud) return;
      const x = sim.hud(run, g.config);
      const land = landOf(x.land).title;
      view.hudLand.textContent = run.endless ? 'Тропа без конца · поляна ' + (x.n + 1) : x.boss ? land + ' · логово хозяина' : land + ' · поляна ' + (x.inLand + 1);
      view.hudGoalLabel.textContent = x.boss === 'poloz' ? 'Удары' : 'Плоды';
      view.hudGoal.textContent = x.open ? 'выход!' : x.eaten + ' / ' + x.goal;
      view.hudLen.textContent = String(x.len);
      view.hudSpeed.textContent = (Math.round(x.speed * 10) / 10).toLocaleString('ru-RU');
      view.hudSeeds.textContent = String(x.seeds);
      const count = run.phase === 'play' && run.count > 0 ? Math.ceil(run.count) : 0;
      view.count.hidden = !count || run.paused;
      if (count && view.count.textContent !== String(count)) {
        view.count.textContent = String(count);
        g.sfx('count');
      }
      const hint = run.phase === 'play' && run.wait && run.stun <= 0 && !run.paused ? 'Смахните — куда дальше?' : run.curl > 0 ? 'Свернулась' : '';
      view.hint.hidden = !hint;
      view.hint.textContent = hint;
    }

    // ---- events of the logic: sounds, vibration, snapshots ----

    const SAVE_ON = { eat: 1, pick: 1, glade: 1, curio: 1, open: 1, exit: 1, boss: 1, shop: 1 };

    function events(state) {
      const run = state.run;
      if (!run || !run.fx) return;
      if (view.fxSeen < 0 || view.fxSeen > run.fxN) view.fxSeen = run.fxN;
      if (run.fxN === view.fxSeen) return;
      let save = false;
      run.fx.forEach(([n, k]) => {
        if (n <= view.fxSeen) return;
        if (SAVE_ON[k]) save = true;
        if (k === 'eat' || k === 'beetle' || k === 'mouse') g.sfx('eat');
        else if (k === 'curio') { g.sfx('curio'); view.pickAt = performance.now(); }
        else if (k === 'bite' || k === 'cut') { g.sfx('bite'); g.buzz(BUZZ.bite); }
        else if (k === 'hit' || k === 'hurt' || k === 'prick' || k === 'strike' || k === 'stoneFail' || k === 'mother') { g.sfx('hit'); g.buzz(BUZZ.hit); }
        else if (k === 'open') g.sfx('open');
        else if (k === 'exit' || k === 'glade') g.sfx('glade');
        else if (k === 'boss') { g.sfx('win'); g.buzz(BUZZ.boss); }
        else if (k === 'bossHit' || k === 'ring' || k === 'kill' || k === 'whip' || k === 'rival' || k === 'venom') g.sfx('level');
        else if (k === 'hawk' || k === 'warn') g.sfx('hawk');
        else if (k === 'rock' || k === 'ring-close') g.sfx('rock');
        else if (k === 'win') g.sfx('win');
        else if (k === 'over') { g.sfx('over'); g.buzz(BUZZ.over); }
        else if (k === 'ram' || k === 'brow' || k === 'ghost' || k === 'dash' || k === 'hole') g.sfx('tap');
        else if (k.indexOf('unlock:') === 0) {
          const s = snakeOf(k.slice(7));
          g.flash('snake', 'Открыта змея «' + s.title + '»', s.text, 4000);
        }
      });
      view.fxSeen = run.fxN;
      if (save) snapshot();
    }

    function snapshot() {
      view.lastSave = performance.now();
      g.saveNow('snapshot');
    }

    // ---- the burrow ----

    function renderShop(state) {
      const run = state.run;
      const items = run.shop.items;
      top([h('div', { class: 's-hud' }, h('div', { class: 's-cur' }, GameIcons.el('leaf'), h('span', { class: 'g-big' }, String(run.seeds)), h('span', { class: 's-unit' }, 'зёрен')),
        h('div', { class: 's-side' }, run.endless ? 'Тропа без конца' : 'Нора между угодьями', h('br'), 'Длина ' + sim.length(run)))]);
      const list = items.map((it, i) => {
        let title = '';
        let text = '';
        let tag = null;
        let art = Art.item(it.kind);
        if (it.kind === 'ab') {
          const a = sim.ability(run, it.id);
          art = Art.ability(it.id, a.rarity);
          title = a.title;
          text = a.text;
          tag = h('span', { class: 's-tag ' + a.rarity }, RARITY[a.rarity] || 'от модели');
        } else if (it.kind === 'snack') {
          title = 'Перекус';
          text = '+' + cfg()['burrow.snackLength'] + ' звена сразу';
        } else {
          title = 'Ещё выбор';
          text = 'Переброс способностей у диковины +1';
        }
        return h('div', { class: 's-item' + (it.sold ? ' sold' : '') }, itemRow(pic(art), [h('span', { class: 's-item-t' }, title), tag], text),
          h('button', { class: 'g-btn small', type: 'button', disabled: it.sold || run.seeds < it.price, onclick: () => buyItem(i) }, it.sold ? 'Куплено' : 'Купить · ' + it.price + ' зёрен'));
      });
      const roll = shopRollPrice(run);
      field([h('h3', { class: 's-h' }, 'Нора'), h('div', { class: 'g-note' }, 'Зёрна роняют мыши, жуки и диковины. Что не потрачено — останется на следующую нору.'),
        h('div', { class: 's-list' }, list),
        h('button', { class: 'g-btn small', type: 'button', disabled: run.seeds < roll, onclick: rollShop }, GameIcons.el('reset'), 'Другие способности · ' + roll + ' зёрен')]);
      actions([h('button', { class: 'g-btn primary', id: 'leave', type: 'button', onclick: leaveShop }, GameIcons.el('exit'), 'Дальше — ' + nextLandTitle(run))]);
    }

    function shopRollPrice(run) { return sim.shopRollCost(run, g.config); }
    function nextLandTitle(run) { return landOf(sim.LANDS[Math.floor((run.g.n + 1) / 3) % 3]).title; }

    function buyItem(i) {
      const res = act((s) => sim.shopBuy(s, g.config, i), { now: true, reason: 'buy' });
      if (res && res.ok) { g.sfx('buy'); g.buzz('buy'); } else { g.sfx('deny'); g.buzz('deny'); }
    }

    function rollShop() {
      const res = act((s) => sim.shopRoll(s, g.config), { now: true, reason: 'buy' });
      g.sfx(res && res.ok ? 'tap' : 'deny');
    }

    function leaveShop() {
      act((s) => sim.shopLeave(s, g.config), { now: true, reason: 'run' });
    }

    // ---- the result ----

    function renderOver(state) {
      const run = state.run;
      const r = run.result || {};
      const meta = sim.meta(state);
      const lines = [
        g.ui.line('Полян пройдено', r.glades || 0),
        g.ui.line('Плодов съедено', r.fruits || 0),
        g.ui.line('Наибольшая длина', r.len || 0),
        g.ui.line('Время', g.fmt.time(r.sec || 0))
      ];
      if (run.molt) lines.push(g.ui.line('Линька ' + run.molt, g.fmt.mult(1 + run.molt * cfg()['molt.bonus'])));
      if (run.snake === 'copper') lines.push(g.ui.line('Медянка: счёт', g.fmt.mult(cfg()['snake.copper.score'])));
      if ((r.mult || 1) > 1) lines.push(g.ui.line('в поездке', g.fmt.mult(r.mult)));
      lines.push(h('div', { class: 'g-line s-total' }, h('span', { class: 'k' }, 'Чешуйки'), h('span', { class: 'v' }, '+' + (r.add || 0))));
      const extra = [];
      extra.push(h('div', { class: 'g-note' }, REASON[r.reason] || ''));
      if (run.daily) extra.push(h('div', { class: 'g-note' }, 'Поляна дня: лучшее сегодня — полян ' + ((meta.daily && meta.daily.best) || 0) + '.'));
      (r.snakes || []).forEach((id) => extra.push(h('div', { class: 's-unlock' }, pic(Art.snake(id), 40), 'Открыта змея «' + snakeOf(id).title + '»')));
      const gain = sim.prestigeGain(state, sim.LAYER, g.config);
      if (Big.gt(gain, 0)) extra.push(h('div', { class: 's-unlock' }, GameIcons.el('crown'), 'Можно открыть линьку ' + (sim.moltTop(state) + 1)));
      top([h('div', { class: 's-hud' }, h('div', { class: 's-cur' }, GameIcons.el('leaf'), h('span', { class: 'g-big' }, g.fmt(sim.scales(state))), h('span', { class: 's-unit' }, 'чешуек')))]);
      const title = r.endless ? 'Тропа без конца: полян ' + (r.glades || 0) : r.won ? 'Победа' : 'Забег окончен';
      field([h('div', { class: 's-result' }, GameIcons.el(r.won ? 'trophy' : 'snake'), h('h3', {}, title)), h('div', { class: 'g-lines' }, lines), extra]);
      const endless = r.won && r.reason === 'win' && cfg()['rules.endless'] && !r.endless ?
        h('button', { class: 'g-btn', id: 'endless', type: 'button', onclick: () => { act((s) => sim.continueEndless(s, g.config), { now: true, reason: 'run' }); } }, GameIcons.el('up'), 'Тропа без конца') : null;
      actions([Big.gt(gain, 0) ? view.prestige : null, endless,
        h('button', { class: 'g-btn' + (Big.gt(gain, 0) ? '' : ' primary'), id: 'hub', type: 'button', onclick: () => { act((s) => sim.toHub(s), { now: true, reason: 'run' }); } }, 'К началу')]);
    }

    // ---- sheets ----

    function abilitiesSheet() {
      const run = g.state.run;
      let close = null;
      const ids = Object.keys(run.ab || {});
      const quit = alive(run) ? h('button', { class: 'g-btn small s-two', type: 'button' }, 'Сдаться', h('span', { class: 'g-sub' }, 'держите — забег кончится, чешуйки за сделанное останутся')) : null;
      if (quit) g.ui.hold(quit, 1200, () => { act((s) => sim.quit(s, g.config), { now: true, reason: 'run' }); if (close) close(); });
      const wasPaused = run.paused;
      if (alive(run) && !run.paused) act((s) => sim.pause(s));
      close = g.sheet(flat([g.layout === 'wide' ? null : view.mapBox, h('h3', {}, 'Способности забега'),
        ids.length ? h('div', { class: 's-list' }, ids.map((id) => {
          const a = sim.ability(run, id);
          return h('div', { class: 's-item' }, itemRow(pic(Art.ability(id, a.rarity)), [h('span', { class: 's-item-t' }, a.title + (run.ab[id] > 1 ? ' · ' + run.ab[id] : '')), h('span', { class: 's-tag ' + a.rarity }, RARITY[a.rarity] || 'от модели')], a.text));
        })) : h('div', { class: 'g-note' }, 'Способностей пока нет: съешьте диковину — кольцо на поляне.'),
        h('div', { class: 'g-note' }, 'Перебросов: ' + (run.rerolls || 0) + ' · зёрен: ' + (run.seeds || 0)),
        quit]), () => {
        if (!wasPaused && g.state.run.paused) act((s) => sim.resume(s, g.config));
      });
    }

    function workshopSheet() {
      let close = null;
      function body() {
        const state = g.state;
        const m = sim.meta(state);
        return [h('h3', {}, 'Мастерская'), h('div', { class: 'g-note' }, 'Чешуек: ' + sim.scales(state) + '. Улучшения — навсегда, для всех забегов.'),
          h('div', { class: 's-list' }, content.upgrades.map((u) => {
            const lvl = m.shop[u.id] || 0;
            const max = sim.upgradeMax(g.config, u.id);
            const cost = lvl >= max ? null : sim.upgradeCost(g.config, u.id, lvl);
            // an improvement with no real ceiling shows its level alone
            const level = isFinite(max) ? lvl + ' из ' + max : 'уровень ' + lvl;
            return h('div', { class: 's-item' + (cost === null ? ' full' : '') }, itemRow(pic(Art.upgrade(u.id)), [h('span', { class: 's-item-t' }, u.title), h('span', { class: 's-tag' }, level)], u.text),
              h('button', { class: 'g-btn small', type: 'button', disabled: cost === null || sim.scales(state) < cost, onclick: () => {
                const res = act((s) => sim.buyUpgrade(s, g.config, u.id), { now: true, reason: 'buy' });
                if (res.ok) {
                  g.sfx('buy');
                  close();
                  workshopSheet();
                } else {
                  g.sfx('deny');
                }
              } }, cost === null ? 'Наибольший уровень' : 'Купить · ' + cost + ' чешуек'));
          }))];
      }
      close = g.sheet(body());
    }

    function albumSheet() {
      const meta = sim.meta(g.state);
      const seen = meta.album.abilities;
      const met = meta.album.enemies;
      const rec = meta.rec;
      const abilities = content.abilities.map((a) => {
        const n = seen[a.id] || 0;
        return h('div', { class: 's-item' + (n ? '' : ' unseen') }, itemRow(pic(n ? Art.ability(a.id, a.rarity) : Art.unknown()), [h('span', { class: 's-item-t' }, n ? a.title : 'Неизвестная'), h('span', { class: 's-tag ' + a.rarity }, RARITY[a.rarity])],
          n ? a.text + ' · взята ' + n + ' раз' : 'Ещё не попадалась.'));
      });
      const enemies = content.enemies.map((x) => {
        const n = met[x.id] || 0;
        return h('div', { class: 's-item' + (n ? '' : ' unseen') }, itemRow(pic(n ? Art.enemy(x.id) : Art.unknown()), [h('span', { class: 's-item-t' }, n ? x.title : 'Неизвестный')], n ? x.text : 'Ещё не встречался.'));
      });
      const lines = [
        g.ui.line('Забегов', rec.runs), g.ui.line('Побед', rec.wins), g.ui.line('Рекорд длины', rec.bestLen),
        g.ui.line('Больше всего полян', rec.bestGlades), g.ui.line('Тропа без конца: полян', rec.endless),
        g.ui.line('Самое большое кольцо', rec.ring), g.ui.line('Время в забегах', g.fmt.time(rec.sec || 0))
      ];
      g.sheet([h('h3', {}, 'Альбом'), h('div', { class: 'g-lines' }, lines),
        h('h3', {}, 'Способности: ' + Object.keys(seen).filter((id) => content.abilities.some((a) => a.id === id)).length + ' из ' + content.abilities.length), h('div', { class: 's-list' }, abilities),
        h('h3', {}, 'Звери и напасти'), h('div', { class: 's-list' }, enemies)]);
    }

    function achievements(state) {
      const meta = sim.meta(state);
      const rec = meta.rec;
      if (rec.wins) g.achieve('first-win');
      if (rec.bestLen >= cfg()['ach.length']) g.achieve('length-100');
      if (rec.cleanWin) g.achieve('no-bites');
      if (rec.ring >= cfg()['ach.ring']) g.achieve('ring-20');
      if (sim.moltTop(state) >= 10) g.achieve('molt-10');
      if (rec.meadow) g.achieve('meadow');
      if (rec.endless >= cfg()['ach.endless']) g.achieve('endless-10');
      if (sim.SNAKES.every((id) => meta.unlocked[id])) g.achieve('all-snakes');
    }

    // ---- the engine's hooks ----

    function render(state) {
      const run = state.run;
      const shop = run.shop ? run.shop.items.map((it) => (it.sold ? 1 : 0) + it.id).join('') + run.shop.rolls : '';
      const key = [view.ver, g.layout, run.phase, run.paused, sel.snake, sel.molt, sel.charge, g.links.mult(), sim.scales(state), sim.moltTop(state),
        run.g ? run.g.n : '', run.ab ? Object.keys(run.ab).map((id) => id + run.ab[id]).join(',') : '', run.pick ? run.pick.opts.join(',') : '', run.rerolls,
        run.phase === 'shop' ? run.seeds : '', shop, run.next ? run.next.n : '', run.result ? run.result.add + '/' + run.result.endless : ''].join('|');
      document.documentElement.setAttribute('data-phase', run.phase);
      if (key !== view.key) {
        view.key = key;
        if ((run.phase === 'play' || run.phase === 'pick') && run.g) renderPlay(state);
        else if (run.phase === 'shop' && run.shop) renderShop(state);
        else if (run.phase === 'over') renderOver(state);
        else renderHub(state);
        achievements(state);
      }
      if (alive(run) && run.g) updateHud(state);
    }

    function animate(state) {
      events(state);
      const run = state.run;
      if (!alive(run) || !run.g) return;
      if (run.phase === 'play' && !run.paused && performance.now() - view.lastSave > 1000) snapshot();
      draw(state);
    }

    function build(game) {
      g = game;
      readColors();
      buildStage();
      // for checks: draw a frame now (a hidden page gets no animation frames)
      window.__snakeDraw = () => { sizeStage(); draw(g.state); };
      view.prestige = g.ui.prestigeButton(sim.LAYER, { label: 'Новая линька', primary: true });
      view.prestige.id = 'prestige';
      view.fxSeen = g.state.run.fxN || 0;
      g.el.app.addEventListener('pointerdown', onDown);
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
      window.addEventListener('keydown', onKey);
      if (window.ResizeObserver) new ResizeObserver(() => sizeStage()).observe(g.el.field);
      g.on('resize', () => { view.ver++; g.redraw(); });
      g.on('chest', () => { view.ver++; g.sfx('chest'); });
      ['inbox', 'offline', 'links'].forEach((name) => g.on(name, () => { view.ver++; }));
      g.on('prestige', () => {
        view.ver++;
        sel.molt = sim.moltTop(g.state);
        const rule = content.molts.find((x) => x.n === sel.molt);
        g.flash('crown', 'Открыта линька ' + sel.molt, rule ? rule.text : '');
      });
      // away from the screen: an instant pause and a snapshot; back — the countdown
      g.on('hidden', () => {
        const run = g.state.run;
        if (alive(run) && !run.paused) {
          view.autoPaused = true;
          act((s) => sim.pause(s), { now: true, reason: 'pause' });
        }
        g.saveNow('hidden');
      });
      g.on('visible', () => {
        view.ver++;
        const run = g.state.run;
        if (alive(run) && run.paused && view.autoPaused) {
          view.autoPaused = false;
          act((s) => sim.resume(s, g.config));
        }
      });
      // a run left open when the app was closed starts again with the countdown
      const run = g.state.run;
      if (alive(run) && !g.readonly) act((s) => { sim.pause(s); sim.resume(s, g.config); });
    }

    Game.start({ sim, render, animate, init: build });
  }
})();
