// «Последний рубеж» — the screen: the hub between runs (DOM in the engine's frame) and the run
// itself on one canvas over the whole screen (draw.js). The run is world.js stepped here at a
// fixed 60 Hz inside the engine's animation frame; it is saved as a snapshot into state.meta.live
// every few seconds, on every card picked and when the app goes to the background.
(async function () {
  'use strict';
  const sim = window.GameSim;
  const W = window.WaveWorld;
  const h = ui.h;
  const T = function () { return ui.t.apply(null, arguments); };
  const Art = window.WaveArt;

  window.GameIcons.add('crosshair', '<circle cx="12" cy="12" r="7"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/>');
  window.GameIcons.add('orb', '<circle cx="12" cy="12" r="5"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4"/>');
  window.GameIcons.add('blades', '<circle cx="12" cy="12" r="2.5"/><path d="M12 3a9 9 0 0 1 8 5M21 12a9 9 0 0 1-5 8M12 21a9 9 0 0 1-8-5M3 12a9 9 0 0 1 5-8"/>');
  window.GameIcons.add('waves', '<path d="M3 9c2-2 4-2 6 0s4 2 6 0 4-2 6 0M3 15c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/>');

  // Sounds of the game (Web Audio, no files): names ws-*.
  if (window.Sfx) {
    Sfx.add('ws-hurt', [{ type: 'square', f: [190, 90], d: 0.12, v: 0.22 }]);
    Sfx.add('ws-pick', [{ type: 'triangle', f: [700, 1050], d: 0.08, v: 0.35 }]);
    Sfx.add('ws-elite', [{ type: 'sawtooth', f: [140, 70], d: 0.35, v: 0.18 }, { at: 0.1, type: 'triangle', f: [420, 300], d: 0.2, v: 0.25 }]);
    Sfx.add('ws-boss', [{ type: 'sawtooth', f: [80, 60], d: 0.8, v: 0.22, a: 0.1 }, { at: 0.3, type: 'square', f: [120, 90], d: 0.5, v: 0.12 }]);
    Sfx.add('ws-fusion', [{ type: 'sine', f: [440, 880], d: 0.3, v: 0.35 }, { at: 0.2, type: 'sine', f: [660, 1320], d: 0.4, v: 0.3 }]);
    Sfx.add('ws-win', [{ type: 'triangle', f: [523, 523], d: 0.15 }, { at: 0.15, type: 'triangle', f: [659, 659], d: 0.15 }, { at: 0.3, type: 'triangle', f: [784, 784], d: 0.15 }, { at: 0.45, type: 'triangle', f: [1047, 1047], d: 0.4 }]);
    Sfx.add('ws-lose', [{ type: 'triangle', f: [392, 330], d: 0.25, v: 0.35 }, { at: 0.22, type: 'triangle', f: [330, 262], d: 0.45, v: 0.3 }]);
    Sfx.add('ws-boom', [{ type: 'noise', f: [1, 1], d: 0.18, v: 0.18 }]);
  }

  async function json(name) {
    try {
      const r = await fetch('../content/' + name);
      return r.ok ? await r.json() : {};
    } catch (error) {
      return {};
    }
  }
  const items = await json('items.json');
  const lore = await json('world.json');

  function nameOf(kind, id, card) {
    if (kind === 'w') return (items.weapons && items.weapons[id] && items.weapons[id].title) || id;
    if (kind === 'p') return (items.passives && items.passives[id] && items.passives[id].title) || id;
    if (kind === 'x') return card ? card.title : id;
    if (kind === 'f') return (items.fusions && items.fusions[id] && items.fusions[id].title) || id;
    if (kind === 'gold') return 'Золото';
    if (kind === 'heal') return 'Аптечка';
    return id;
  }
  const RARITY = ['обычная', 'редкая', 'эпическая', 'легендарная'];
  const HERO = (id) => (lore.heroes && lore.heroes[id]) || { title: id, weapon: '', trait: '', unlock: '' };

  let g = null;
  const view = { tab: 'run', sig: '' };
  const run = {
    world: null, cfg: null, info: null, active: false, paused: false, why: '', countdown: 0, acc: 0, lastSnap: 0,
    choiceOpen: false, banishing: false, ended: false, renderer: null, sizeKey: '', quality: 0, slowFor: 0, fastFor: 0,
    frameAvg: 16, fps: 0, fpsAcc: 0, fpsN: 0, hudAt: 0, bossShown: '', lastHurtBuzz: 0, lastHitSfx: 0
  };
  const joy = { id: null, ox: 0, oy: 0, mx: 0, my: 0, radius: 56 };
  const keys = new Set();
  const moveKeys = { KeyW: [0, -1], ArrowUp: [0, -1], KeyS: [0, 1], ArrowDown: [0, 1],
    KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0] };
  const el = {};
  // For the checks in a browser (tests/browser.test.js), as the engine has window.__game.
  window.__waves = { run: run, joy: joy };

  // ---- snapshots of the run --------------------------------------------------------------------------

  function snapNow() {
    if (!g || !run.world || run.world.s.over || g.readonly) return;
    const data = W.save(run.world);
    g.act(function (s) { s.meta.live = data; });
    run.lastSnap = performance.now();
  }

  function pauseRun(why) {
    keys.clear();
    if (!run.active || run.ended) return;
    if (!run.paused) {
      run.paused = true;
      run.why = why || 'pause';
      joy.id = null;
      joy.mx = 0;
      joy.my = 0;
      run.countdown = 0;
      // The cards (if open) give way to the pause; they come back after it.
      run.choiceOpen = false;
      run.banishing = false;
      showPause();
    }
  }

  // Registered before Game.start: these run before the engine's own hide(), which saves at once.
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') {
      pauseRun('hidden');
      snapNow();
    }
  });
  window.addEventListener('pagehide', function () {
    pauseRun('hidden');
    snapNow();
  });
  document.addEventListener('click', function (event) {
    if (event.target && event.target.closest && event.target.closest('#g-exit')) {
      pauseRun('hidden');
      snapNow();
    }
  }, true);

  // ---- the hub ----------------------------------------------------------------------------------------

  function shardsNum(state) { return Math.floor(window.Big.toNumber(window.Big.of(state.meta.shards, 0))); }

  function build(game) {
    g = game;
    el.top = h('div', { class: 'ws-top' });
    g.el.top.append(el.top);
    el.tabs = h('div', { class: 'ws-tabs', role: 'tablist' });
    el.body = h('div', { class: 'ws-body' });
    g.el.field.append(el.tabs, el.body);
    el.actions = h('div', { class: 'ws-actions' });
    g.el.actions.append(el.actions);
    el.smelt = g.ui.prestigeButton('smelt', { label: 'Переплавить мастерскую' });
    buildStage();
    g.on('resize', function () {
      view.sig = '';
      if (run.active) resizeStage(true);
    });
    g.on('hidden', function () {
      pauseRun('hidden');
      snapNow();
      g.saveNow('hide');
    });
    g.on('prestige', function () {
      g.achieve('smelt');
      view.sig = '';
    });
    g.on('chest', function () {
      g.flash('chest', 'Сундук попутчика', 'Осколки и бесплатное сращение на следующий забег');
      view.sig = '';
    });
    g.on('links', function () { view.sig = ''; });
    g.on('offline', function () { view.sig = ''; });
    sim.fill(g.state);
    // A run that was going when the app was killed comes back paused, from the same second.
    if (g.state.meta.live && !g.readonly) resumeLive();
    prepareStock();
  }

  async function prepareStock() {
    if (g.readonly) return;
    const day = sim.dayKey(Date.now());
    const m = g.state.meta;
    // One new data card a day from the stock (only what the model prepared; none made up here).
    if (m.cardsDay !== day && g.stock.count('cards') > 0) {
      const card = await g.stock.take('cards');
      g.act(function (s) {
        if (card) sim.addCard(s, card, g.config, day);
        s.meta.cardsDay = day;
      });
    }
  }

  /** What changes the faces of the foes: the day (art.faces 'daily') or nothing. */
  function faceSalt() { return g.config['art.faces'] === 'fixed' ? '' : sim.dayKey(Date.now()); }

  /**
   * The looks of the foes by kind (as WaveWorld.ENEMIES): from world.json; in the run of the day
   * the masses (crawlers and runners) take the look of the day's horde the model chose.
   */
  function enemyLooks(daily) {
    const list = window.WaveWorld.ENEMIES.map(function (id) { return (lore.enemies && lore.enemies[id] && lore.enemies[id].look) || null; });
    const horde = daily && g.config['art.horde'] && g.state.meta.daily ? g.state.meta.daily.horde : null;
    if (horde && window.GameArt && !window.GameArt.lookCheck(horde)) {
      list[0] = horde;
      list[1] = { mask: horde.mask, hue: (horde.hue + 25) % 360, accent: horde.accent, light: horde.light };
    }
    return list;
  }

  async function ensureDaily() {
    const day = sim.dayKey(Date.now());
    if (g.state.meta.daily && g.state.meta.daily.day === day) return;
    const item = g.stock.count('daily') > 0 ? await g.stock.take('daily') : null;
    const waves = g.stock.count('waves') > 0 ? await g.stock.take('waves') : null;
    g.act(function (s) {
      sim.daily(s, day, item);
      if (waves) sim.dailyWaves(s, waves);
    });
  }

  function tab(id, label) {
    return h('button', {
      class: 'ws-tab' + (view.tab === id ? ' on' : ''), role: 'tab', 'aria-selected': view.tab === id ? 'true' : 'false',
      onclick: function () {
        view.tab = id;
        view.sig = '';
        g.redraw();
      }
    }, label);
  }

  function signature(state) {
    const m = state.meta;
    return [view.tab, g.layout, JSON.stringify(state.run.ws), m.shards, m.hero, m.mode, m.storm, m.stormMax, JSON.stringify(m.heroes), m.endless,
      m.bonus, m.freeFusions, m.cards.length, m.live ? 1 : 0, m.last ? m.last.at : 0, JSON.stringify(m.best), m.daily ? m.daily.day + m.daily.runs : '',
      g.links.energy(), JSON.stringify(state.layers.smelt || {}), m.totals.runs].join('|');
  }

  function render(state) {
    if (run.active) return;
    const sig = signature(state);
    if (sig === view.sig) return;
    view.sig = sig;
    const m = state.meta;
    const smelts = sim.smeltCount(state);
    el.top.replaceChildren(
      h('div', { class: 'ws-shards' }, window.GameIcons.el('gem'), h('span', { class: 'g-big g-num' }, String(shardsNum(state))), h('span', { class: 'ws-unit' }, 'осколков')),
      h('div', { class: 'ws-sub' }, T('Ступень шторма {} из {}', m.stormMax, g.config['storm.max']) +
        (smelts ? ' · ' + T('переплавок {}, осколки ×{}', smelts, (1 + smelts * g.config['smelt.bonus']).toFixed(2).replace(/\.?0+$/, '')) : ''))
    );
    el.tabs.replaceChildren(tab('run', 'Забег'), tab('shop', 'Мастерская'), tab('records', 'Рекорды'));
    // An empty section is null in the list; replaceChildren would print it as the word «null».
    const parts = view.tab === 'run' ? runTab(state) : view.tab === 'shop' ? shopTab(state) : recordsTab(state);
    el.body.replaceChildren.apply(el.body, parts.filter(function (p) { return p !== null && p !== undefined; }));
    actions(state);
  }

  function actions(state) {
    const m = state.meta;
    const list = [];
    if (m.live) {
      const s = m.live.s || {};
      list.push(h('button', { class: 'g-btn primary', onclick: resumeLive }, window.GameIcons.el('play'),
        h('span', {}, 'Продолжить забег', h('span', { class: 'g-sub' }, sim.clock(s.T || 0) + ' · ' + T('ур. {}', s.level || 1)))));
      list.push(h('button', { class: 'g-btn small', onclick: newRunOverLive }, 'Новый забег'));
    } else {
      const mode = (lore.modes && lore.modes[m.mode]) || { title: m.mode };
      list.push(h('button', { class: 'g-btn primary', onclick: function () { startRun(); } }, window.GameIcons.el('play'),
        h('span', {}, 'В забег', h('span', { class: 'g-sub' }, mode.title + ' · ' + HERO(m.hero).title + (m.mode !== 'daily' && m.storm ? ' · ' + T('шторм {}', m.storm) : '')))));
    }
    if (sim.allMaxed(state, g.config) && !m.live) list.push(el.smelt);
    list.push(h('div', { class: 'ws-controls g-note' }, 'WASD / стрелки — движение · P / Esc — пауза. На телефоне — джойстик пальцем.'));
    el.actions.replaceChildren.apply(el.actions, list);
  }

  function section(title, children) {
    return h('section', { class: 'ws-sec' }, h('h3', { class: 'ws-h' }, title), children);
  }

  function runTab(state) {
    const m = state.meta;
    const out = [];
    if (m.last && !m.live) out.push(lastCard(m.last));
    // Heroes.
    const progress = {};
    sim.unlockProgress(state, g.config).forEach(function (p) { progress[p.id] = p; });
    out.push(section('Герой', h('div', { class: 'g-pick ws-heroes' }, sim.HEROES.map(function (id) {
      const hero = HERO(id);
      const open = !!m.heroes[id];
      const p = progress[id];
      const weapon = nameOf('w', hero.weapon);
      return h('button', {
        class: (m.hero === id ? 'on' : '') + (open ? '' : ' ws-locked'), disabled: !open,
        onclick: function () { g.act(function (s) { sim.choose(s, 'hero', id); }); }
      }, Art.el(Art.hero(id), 48),
      h('div', { class: 'grow' },
        h('div', { class: 'ws-t' }, hero.title),
        h('div', { class: 'ws-s' }, open ? weapon + ' · ' + hero.trait : hero.unlock + (p && p.need > 1 ? ' · ' + Math.min(p.have, p.need) + ' / ' + p.need : ''))));
    }))));
    // Modes.
    out.push(section('Режим', h('div', { class: 'g-pick' }, sim.MODES.map(function (id) {
      const mode = (lore.modes && lore.modes[id]) || { title: id, text: '' };
      const can = sim.canMode(state, id);
      return h('button', {
        class: (m.mode === id ? 'on' : '') + (can ? '' : ' ws-locked'), disabled: !can,
        onclick: function () {
          g.act(function (s) { sim.choose(s, 'mode', id); });
          if (id === 'daily') ensureDaily().then(function () { view.sig = ''; g.redraw(); });
        }
      }, Art.el(Art.mode(id), 48),
      h('div', { class: 'grow' }, h('div', { class: 'ws-t' }, mode.title), h('div', { class: 'ws-s' }, can ? mode.text : mode.locked || '')));
    }))));
    if (m.mode === 'daily') out.push(dailyCard(state));
    else out.push(stormCard(state));
    out.push(bonusCard(state));
    return out;
  }

  function lastCard(last) {
    const hero = HERO(last.hero);
    const lines = [
      g.ui.line('Время', sim.clock(last.T) + (last.record ? ' · ' + T('рекорд') : '')),
      g.ui.line('Убито', String(last.kills)),
      g.ui.line('Уровень', String(last.level)),
      g.ui.line('Осколков', '+' + last.shards)
    ];
    const notes = [];
    if (last.stormUp) notes.push(T('Открыта ступень шторма {}', g.state.meta.stormMax));
    last.unlocked.forEach(function (id) { notes.push(T('Открыт герой: {}', HERO(id).title)); });
    if (last.endless) notes.push(T('Открыт режим «Без конца»'));
    return h('section', { class: 'ws-last ' + (last.won ? 'won' : 'lost') },
      h('div', { class: 'ws-last-h' }, Art.el(Art.hero(last.hero), 40), h('div', { class: 'ws-t' }, last.won ? 'Победа' : 'Поражение', h('span', { class: 'ws-s' }, ' · ' + hero.title))),
      h('div', { class: 'g-lines' }, lines),
      notes.map(function (n) { return h('div', { class: 'g-note ws-good' }, n); }),
      nextUnlock());
  }

  function nextUnlock() {
    const list = sim.unlockProgress(g.state, g.config).filter(function (p) { return p.need > 1; });
    if (!list.length) return null;
    const p = list[0];
    const frac = Math.max(0, Math.min(1, p.have / p.need));
    return h('div', { class: 'ws-unlock' }, h('div', { class: 'ws-s' }, T('До героя «{}»: {}', HERO(p.id).title, p.text) + ' · ' + Math.min(p.have, p.need) + ' / ' + p.need),
      h('div', { class: 'g-progress' }, h('i', { style: 'width:' + Math.round(frac * 100) + '%' })));
  }

  function stormCard(state) {
    const m = state.meta;
    const rules = (lore.storms || []).filter(function (r) { return r.n <= m.storm; });
    const bonus = Math.round(m.storm * g.config['storm.bonus'] * 100);
    const row = h('div', { class: 'ws-storm' },
      h('button', { class: 'g-btn small ws-step', 'aria-label': 'Ступень ниже', disabled: m.storm <= 0, onclick: function () { g.act(function (s) { sim.choose(s, 'storm', s.meta.storm - 1); }); } }, '−'),
      h('div', { class: 'ws-storm-n' }, Art.el(Art.storm(m.storm), 56), h('div', { class: 'ws-storm-t' }, h('div', { class: 'g-big g-num' }, String(m.storm)), h('div', { class: 'ws-s' }, m.storm ? T('+{} % осколков', bonus) : 'без шторма'))),
      h('button', { class: 'g-btn small ws-step', 'aria-label': 'Ступень выше', disabled: m.storm >= m.stormMax, onclick: function () { g.act(function (s) { sim.choose(s, 'storm', s.meta.storm + 1); }); } }, '+'));
    const list = rules.length ? h('ol', { class: 'ws-rules' }, rules.map(function (r) { return h('li', { class: r.n === m.storm ? 'new' : '' }, r.text); })) :
      h('div', { class: 'g-note' }, m.stormMax ? 'Выберите ступень: каждая добавляет правило и даёт больше осколков.' : 'Победа откроет первую ступень шторма.');
    return section('Шторм', [row, list]);
  }

  function dailyCard(state) {
    const d = state.meta.daily;
    if (!d || d.day !== sim.dayKey(Date.now())) {
      ensureDaily().then(function () { view.sig = ''; g.redraw(); });
      return section('Забег дня', h('div', { class: 'g-note' }, 'Забег дня готовится'));
    }
    const texts = d.rules.map(function (r) { return h('li', {}, ((lore.daily && lore.daily[r] && lore.daily[r].title) || r) + ' — ' + ((lore.daily && lore.daily[r] && lore.daily[r].text) || '')); });
    return section('Забег дня', [h('div', { class: 'ws-t' }, ui.raw(d.title)), h('ul', { class: 'ws-rules' }, texts),
      d.wavesTitle ? h('div', { class: 'ws-s' }, T('Волны: {}', d.wavesTitle)) : null,
      h('div', { class: 'g-lines' }, g.ui.line('Лучшее сегодня', d.best ? sim.clock(d.best.T) + ' · ' + d.best.kills : '—'), g.ui.line('Забегов сегодня', String(d.runs)))]);
  }

  function bonusCard(state) {
    const m = state.meta;
    const out = [];
    if (m.freeFusions > 0) out.push(h('div', { class: 'g-note' }, T('Бесплатных сращений на следующий забег: {}', m.freeFusions)));
    if (m.cards.length) out.push(h('div', { class: 'g-note' }, T('Карточек модели в пуле: {}', m.cards.length) + ' — ', ui.raw(m.cards.map(function (c) { return c.title; }).join(', '))));
    const links = g.links.status();
    if (links && links.steps && links.steps.on) {
      if (m.bonus) out.push(h('div', { class: 'g-note ws-good' }, m.bonus === 'reroll' ? 'Следующий забег: +1 переброс' : 'Следующий забег: +1 воскрешение'));
      else {
        out.push(h('div', { class: 'g-btns' },
          h('button', { class: 'g-btn small', onclick: function () { spend('bonus-reroll', 'reroll'); } }, window.GameIcons.el('energy'), h('span', {}, '+1 переброс', h('span', { class: 'g-sub' }, T('{} энерг.', g.config['steps.cost.bonus-reroll'])))),
          h('button', { class: 'g-btn small', onclick: function () { spend('bonus-revive', 'revive'); } }, window.GameIcons.el('energy'), h('span', {}, '+1 воскрешение', h('span', { class: 'g-sub' }, T('{} энерг.', g.config['steps.cost.bonus-revive']))))));
      }
    }
    if (!out.length) return null;
    return section('К следующему забегу', out);
  }

  async function spend(id, bonus) {
    if (g.state.meta.bonus) return;
    const r = await g.links.spend(id);
    if (r && r.ok) {
      g.act(function (s) { s.meta.bonus = bonus; }, { now: true, reason: 'spend' });
      g.sfx('buy');
    } else {
      g.sfx('deny');
      ui.toast(r && r.off ? 'Связка «Шаги — топливо» выключена' : T('Не хватает энергии: нужно {}', (r && r.need) || 1));
    }
  }

  function shopTab(state) {
    const ws = state.run.ws;
    const have = shardsNum(state);
    const rows = sim.WORKSHOP.map(function (id) {
      const item = (lore.workshop && lore.workshop[id]) || { title: id, text: '', icon: 'star' };
      const lvl = ws[id] || 0;
      const max = sim.maxOf(id, g.config, state);
      const full = lvl >= max;
      const price = sim.cost(state, id, g.config);
      return h('div', { class: 'ws-shop' + (full ? ' full' : '') },
        Art.el(Art.workshop(id), 48),
        h('div', { class: 'grow' }, h('div', { class: 'ws-t' }, item.title, h('span', { class: 'ws-lvl g-num' }, ' ' + lvl + '/' + max)), h('div', { class: 'ws-s' }, item.text),
          h('div', { class: 'ws-pips' }, h('i', { style: 'width:' + Math.round(lvl / max * 100) + '%' }))),
        h('button', {
          class: 'g-btn small ws-buy', disabled: full || have < price,
          onclick: function () {
            const ok = g.act(function (s) { return sim.buyUpgrade(s, id, g.config); }, { now: true, reason: 'action' });
            g.sfx(ok ? 'buy' : 'deny');
          }
        }, full ? 'макс.' : h('span', { class: 'g-num' }, String(price))));
    });
    const smelts = sim.smeltCount(state);
    const note = h('div', { class: 'g-note' }, sim.allMaxed(state, g.config) ? 'Всё на максимуме: можно переплавить мастерскую за постоянные +10 % осколков.' :
      T('Переплавка откроется, когда все улучшения будут на максимуме. Переплавок: {}.', smelts));
    const grow = g.config['smelt.levels'] > 0 ? h('div', { class: 'g-note' }, T('Каждая переплавка поднимает потолок на {}: {}.', g.config['smelt.levels'],
      sim.GROWING.map(function (id) { return ui.t((lore.workshop && lore.workshop[id] && lore.workshop[id].title) || id); }).join(', '))) : null;
    return [section('Мастерская', [h('div', { class: 'ws-shops' }, rows), note, grow])];
  }

  function recordsTab(state) {
    const m = state.meta;
    const t = m.totals;
    const modes = sim.MODES.map(function (id) {
      const b = m.best[id];
      const title = (lore.modes && lore.modes[id] && lore.modes[id].title) || id;
      return g.ui.line(title, b ? (id === 'endless' ? sim.clock(b.time) : sim.clock(b.T)) + ' · ' + T('{} убито', b.kills) + ' · ' + T('ур. {}', b.level) : '—');
    });
    const minutes = m.minutes.map(function (mk, i) { return g.ui.line(T('{}-я минута', i + 1), T('{} убито, ур. {}', mk[0], mk[1])); });
    const totals = [
      g.ui.line('Забегов', String(t.runs)), g.ui.line('Побед', String(t.wins)), g.ui.line('Убито всего', String(t.kills)),
      g.ui.line('Элит', String(t.elites)), g.ui.line('Жнецов', String(t.bosses)), g.ui.line('Ульев', String(t.hives)),
      g.ui.line('Сращений', String(t.fusions)), g.ui.line('Лучший уровень', String(t.bestLevel)), g.ui.line('В забегах', sim.clock(t.seconds))
    ];
    const daily = m.daily && m.daily.history && m.daily.history.length ? section('Забеги дня', h('div', { class: 'g-lines' },
      m.daily.history.slice().reverse().map(function (d) { return g.ui.line(d.day, sim.clock(d.best.T) + ' · ' + d.best.kills); }))) : null;
    const fusions = section('Сращения', h('div', { class: 'g-lines' }, Object.keys(items.fusions || {}).map(function (id) {
      const f = items.fusions[id];
      return g.ui.line(f.title, nameOf('w', f.from[0]) + ' + ' + nameOf('p', f.from[1]));
    })));
    const looks = enemyLooks(false);
    const bestiary = section('Враги', h('div', { class: 'ws-list' }, Object.keys((lore.enemies) || {}).map(function (id) {
      const e = lore.enemies[id];
      const look = looks[window.WaveWorld.ENEMIES.indexOf(id)];
      const face = look && g.config['art.style'] !== 'shapes' && window.GameArt
        ? window.GameArt.el(window.GameArt.fromLook(look, id + ':' + faceSalt()), { cls: 'ws-face', animate: true, alt: '' })
        : h('span', { class: 'ws-dot', style: 'background:' + e.color });
      return h('div', { class: 'ws-li' }, face, h('div', { class: 'grow' }, h('div', { class: 'ws-t' }, e.title), h('div', { class: 'ws-s' }, e.text)));
    })));
    return [section('Лучшее', h('div', { class: 'g-lines' }, modes)), minutes.length ? section('Лучшее по минутам', h('div', { class: 'g-lines' }, minutes)) : null,
      section('Всего', h('div', { class: 'g-lines' }, totals)), daily, fusions, bestiary,
      h('button', { class: 'g-btn small', onclick: function () { g.ui.achievements(); } }, window.GameIcons.el('trophy'), 'Ачивки')];
  }

  // ---- starting, resuming and ending a run ----------------------------------------------------------

  async function newRunOverLive() {
    const ok = await ui.confirm('Начать новый забег? Забег на паузе пропадёт без осколков.', 'Начать', true);
    if (!ok) return;
    g.act(function (s) { sim.abandon(s); }, { now: true, reason: 'action' });
    startRun();
  }

  async function startRun() {
    if (g.state.meta.live) return resumeLive();
    if (g.state.meta.mode === 'daily') await ensureDaily();
    const size = stageSize();
    let prep = null;
    g.act(function (s) {
      prep = sim.startRun(s, g.config, { mode: s.meta.mode, seed: Math.floor(g.rng.next() * 4294967294) + 1, now: Date.now(), viewW: size.w, viewH: size.h });
    });
    run.world = W.create(prep.cfg, prep.opts);
    run.cfg = prep.cfg;
    run.info = prep.info;
    g.act(function (s) { s.meta.live = W.save(run.world); }, { now: true, reason: 'action' });
    enterStage();
    run.paused = false;
    run.countdown = 0;
    g.sfx('tap');
  }

  function resumeLive() {
    const m = g.state.meta;
    if (!m.live) return;
    const cfg = sim.runConfig(g.config, m.liveInfo);
    const w = W.load(cfg, m.live);
    if (!w) {
      g.act(function (s) { sim.abandon(s); }, { now: true, reason: 'action' });
      g.flash('info', 'Забег не продолжить', 'Снимок от другой версии игры — начните новый');
      return;
    }
    run.world = w;
    run.cfg = cfg;
    run.info = m.liveInfo;
    enterStage();
    run.paused = true;
    run.why = 'resume';
    showPause();
  }

  function endRun() {
    if (run.ended) return;
    run.ended = true;
    const r = W.result(run.world);
    let out = null;
    g.act(function (s) { out = sim.finish(s, r, g.config, { now: Date.now(), mult: g.links.mult() }); }, { now: true, reason: 'action' });
    out.achievements.forEach(function (id) { g.achieve(id); });
    g.sfx(r.won ? 'ws-win' : 'ws-lose');
    g.buzz(r.won ? 'achievement' : 'deny');
    showResult(r, out);
  }

  // ---- the stage of a run -------------------------------------------------------------------------

  function buildStage() {
    el.stage = h('div', { class: 'ws-stage', hidden: true });
    el.canvas = h('canvas', { class: 'ws-canvas' });
    el.hud = h('div', { class: 'ws-hud' });
    el.xp = h('i');
    el.xpBar = h('div', { class: 'ws-xp' }, el.xp);
    el.level = h('div', { class: 'ws-level g-num' });
    el.clock = h('div', { class: 'ws-clock g-num' });
    el.kills = h('div', { class: 'ws-kills g-num' });
    el.bossFill = h('i');
    el.boss = h('div', { class: 'ws-boss', hidden: true }, h('div', { class: 'ws-boss-name' }), h('div', { class: 'ws-boss-bar' }, el.bossFill));
    el.fps = h('div', { class: 'ws-fps g-num', hidden: true });
    el.hud.append(el.xpBar, h('div', { class: 'ws-hud-row' }, el.level, el.clock, el.kills), el.boss, el.fps);
    el.pause = h('button', { class: 'ws-pause icon-btn', 'aria-label': 'Пауза', onclick: function () { pauseRun('pause'); } }, window.GameIcons.el('pause'));
    el.over = h('div', { class: 'ws-over', hidden: true });
    el.stage.append(el.canvas, el.hud, el.pause, el.over);
    document.body.appendChild(el.stage);
    el.canvas.addEventListener('pointerdown', onDown);
    el.canvas.addEventListener('pointermove', onMove);
    el.canvas.addEventListener('pointerup', onUp);
    el.canvas.addEventListener('pointercancel', onUp);
    el.canvas.addEventListener('lostpointercapture', onUp);
    el.canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    window.addEventListener('resize', function () { if (run.active) resizeStage(true); });
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', function (event) { keys.delete(event.code); });
    window.addEventListener('blur', function () { pauseRun('hidden'); snapNow(); });
  }

  function stageSize() {
    return { w: window.innerWidth || 344, h: window.innerHeight || 640 };
  }

  function enterStage() {
    run.active = true;
    run.ended = false;
    run.acc = 0;
    run.choiceOpen = false;
    run.banishing = false;
    run.bossShown = '';
    run.notesSeen = run.world.s.noteN || 0;
    run.lastSnap = performance.now();
    el.stage.hidden = false;
    document.body.classList.add('ws-running');
    run.renderer = window.WaveDraw.make(el.canvas, { particles: g.config['caps.particles'], numbers: g.config['caps.numbers'],
      style: g.config['art.style'], looks: enemyLooks(g.state.meta.mode === 'daily'), salt: faceSalt() });
    run.quality = 0;
    resizeStage(true);
    run.renderer.skipFx(run.world);
    el.fps.hidden = !g.config['debug.fps'];
    joy.radius = g.config['joystick.radius'];
    hideOver();
  }

  function leaveStage() {
    keys.clear();
    run.active = false;
    run.world = null;
    run.renderer = null;
    el.stage.hidden = true;
    document.body.classList.remove('ws-running');
    hideOver();
    view.sig = '';
    g.redraw();
  }

  function resizeStage(force) {
    if (!run.renderer || !run.world) return;
    const size = stageSize();
    const levels = [1, 1, 0.75, 0.5];
    const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, g.config['maxDpr']) * levels[run.quality]);
    const key = size.w + 'x' + size.h + '@' + dpr;
    if (!force && key === run.sizeKey) return;
    run.sizeKey = key;
    run.renderer.resize(run.world, size.w, size.h, dpr);
    run.renderer.particles = run.quality === 0 && g.config['caps.particles'] > 0;
    run.renderer.numbers = run.quality === 0 && g.config['fx.numbers'];
  }

  /** Auto quality: frames longer than autoq.frameMs for autoq.sec in a row — particles and numbers off, then fewer pixels. */
  function quality(dtMs) {
    run.frameAvg = run.frameAvg * 0.9 + dtMs * 0.1;
    const slow = run.frameAvg > g.config['autoq.frameMs'];
    if (slow) {
      run.slowFor += dtMs / 1000;
      run.fastFor = 0;
    } else {
      run.fastFor += dtMs / 1000;
      run.slowFor = 0;
    }
    if (run.slowFor >= g.config['autoq.sec'] && run.quality < 3) {
      run.quality++;
      run.slowFor = 0;
      resizeStage(true);
    } else if (run.fastFor >= g.config['autoq.backSec'] && run.quality > 0) {
      run.quality--;
      run.fastFor = 0;
      resizeStage(true);
    }
  }

  // ---- the stick ----

  function onKeyDown(event) {
    if (!run.active || run.ended || event.ctrlKey || event.altKey || event.metaKey) return;
    if (event.target && event.target.closest && event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
    if (event.code === 'Escape' || event.code === 'KeyP') {
      event.preventDefault();
      if (!event.repeat) {
        if (run.paused && run.why === 'pause') startCountdown();
        else pauseRun('pause');
      }
      return;
    }
    if (!moveKeys[event.code]) return;
    event.preventDefault();
    if (!run.paused && !run.choiceOpen && run.countdown <= 0) keys.add(event.code);
  }

  function movement() {
    if (!keys.size) return [joy.mx, joy.my];
    let x = 0, y = 0;
    keys.forEach(function (code) { x += moveKeys[code][0]; y += moveKeys[code][1]; });
    const length = Math.max(1, Math.hypot(x, y));
    return [x / length, y / length];
  }

  function onDown(e) {
    if (!run.active || run.paused || run.countdown > 0 || run.choiceOpen || run.ended) return;
    if (joy.id !== null) return;
    const zone = g.config['joystick.zone'];
    const edge = g.config['joystick.edge'];
    const hgt = window.innerHeight;
    const wid = window.innerWidth;
    if (e.clientY < hgt * (1 - zone)) return;
    if (e.clientX < edge || e.clientX > wid - edge) return;
    joy.id = e.pointerId;
    joy.ox = e.clientX;
    joy.oy = e.clientY;
    joy.mx = 0;
    joy.my = 0;
    try {
      el.canvas.setPointerCapture(e.pointerId);
    } catch (ignored) { /* the pointer is gone */ }
    e.preventDefault();
  }

  function onMove(e) {
    if (e.pointerId !== joy.id) return;
    const dx = e.clientX - joy.ox;
    const dy = e.clientY - joy.oy;
    const d = Math.sqrt(dx * dx + dy * dy);
    const R = joy.radius;
    if (d > R) {
      // The stick follows a thumb that went past its edge.
      joy.ox = e.clientX - dx / d * R;
      joy.oy = e.clientY - dy / d * R;
    }
    const m = Math.min(1, d / R);
    if (m < g.config['joystick.dead']) {
      joy.mx = 0;
      joy.my = 0;
    } else {
      joy.mx = dx / (d || 1) * m;
      joy.my = dy / (d || 1) * m;
    }
  }

  function onUp(e) {
    if (e.pointerId !== joy.id) return;
    joy.id = null;
    joy.mx = 0;
    joy.my = 0;
  }

  // ---- the loop of a run ----

  function animate(state, game, dt) {
    if (!run.active || !run.world) return;
    const w = run.world;
    const now = performance.now();
    if (dt > 1 && !run.paused && !run.ended) pauseRun('hidden');
    quality(Math.min(200, dt * 1000));
    if (run.countdown > 0) {
      run.countdown -= dt;
      showCountdown();
      if (run.countdown <= 0) {
        run.countdown = 0;
        hideOver();
      }
    }
    if (!run.paused && run.countdown <= 0 && !w.s.choice && !w.s.over) {
      run.acc += Math.min(dt, 0.25);
      const step = w.c.dt;
      const move = movement();
      let n = 0;
      while (run.acc >= step && n < 20) {
        W.step(w, move[0], move[1]);
        run.acc -= step;
        n++;
        if (w.s.choice || w.s.over) {
          run.acc = 0;
          break;
        }
      }
    }
    const happened = run.renderer.consume(w);
    feedback(happened, w);
    if (w.s.choice && !run.choiceOpen && !run.paused && run.countdown <= 0 && !w.s.over) showChoice();
    if (w.s.over && !run.ended) endRun();
    if (!run.ended && !run.paused && now - run.lastSnap > g.config['snap.everySec'] * 1000) snapNow();
    run.renderer.frame(w, { dt: run.paused || run.choiceOpen ? 0 : dt, joy: joy });
    if (now - run.hudAt > 100) {
      run.hudAt = now;
      hud(w, dt);
    }
    if (g.config['debug.fps']) {
      run.fpsAcc += dt;
      run.fpsN++;
      if (run.fpsAcc >= 0.5) {
        el.fps.textContent = Math.round(run.fpsN / run.fpsAcc) + ' fps · ' + w.s.ecount + '/' + w.s.pcount + '/' + w.s.gcount + ' · q' + run.quality;
        run.fpsAcc = 0;
        run.fpsN = 0;
      }
    }
  }

  function feedback(f, w) {
    const now = performance.now();
    if (f.hurt) {
      if (now - run.lastHurtBuzz > 300) {
        run.lastHurtBuzz = now;
        g.sfx('ws-hurt');
        if (g.config['buzz.hurt']) g.buzz([25]);
      }
    }
    if (f.level && g.config['buzz.level']) g.buzz('level');
    if (f.elite) g.sfx('ws-elite');
    if (f.boom && now - run.lastHitSfx > 120) {
      run.lastHitSfx = now;
      g.sfx('ws-boom');
    }
    if (f.pick) g.sfx('ws-pick');
    w.s.notes.forEach(function (n) {
      if (n.n > run.notesSeen) {
        run.notesSeen = n.n;
        announce(n);
      }
    });
  }

  function announce(n) {
    if (n.k === 'boss') {
      g.sfx('ws-boss');
      g.buzz('alarm');
      g.flash('skull', n.v === 'reaper' ? 'Жнец волн' : 'Улей', n.v === 'reaper' ? 'Босс. До конца забега — минута' : 'Пока жив, поток вдвое гуще', 2500);
    } else if (n.k === 'fusion') {
      g.sfx('ws-fusion');
      g.flash('sparkle', T('Сращение: {}', nameOf('f', n.v)), (items.fusions && items.fusions[n.v] && items.fusions[n.v].text) || '', 3000);
    } else if (n.k === 'ring') {
      g.flash('reset', 'Кольцо', 'Пробейте выход', 2000);
    } else if (n.k === 'wall') {
      g.flash('waves', 'Стена', 'Волна идёт через арену', 2000);
    } else if (n.k === 'chest') {
      g.sfx('chest');
    } else if (n.k === 'revive') {
      g.sfx('level');
      g.flash('heart', 'Второе дыхание', 'Воскрешение с половиной здоровья', 2000);
    } else if (n.k === 'boss-left') {
      g.flash('skull', 'Жнец ушёл', 'Победа без награды за босса', 2500);
    }
  }

  function hud(w, dt) {
    const s = w.s;
    el.xp.style.width = Math.round(Math.min(1, s.xp / s.need) * 1000) / 10 + '%';
    const lvl = T('ур. {}', s.level);
    if (el.level.textContent !== lvl) el.level.textContent = lvl;
    const left = s.mode === 'endless' ? s.t : Math.max(0, (s.mode === 'sprint' ? w.c.sprintSeconds : w.c.runSeconds) - s.t);
    const clock = sim.clock(left);
    if (el.clock.textContent !== clock) el.clock.textContent = clock;
    const kills = String(s.kills);
    if (el.kills.textContent !== kills) el.kills.textContent = kills;
    // The bar of a boss alive.
    let boss = -1;
    let bossKind = -1;
    let i = 0;
    while (i < w.c.capE) {
      if ((w.E.flag[i] & W.F.ALIVE) && (w.E.flag[i] & W.F.BOSS)) {
        if (boss < 0 || w.E.kind[i] === 10) {
          boss = i;
          bossKind = w.E.kind[i];
        }
      }
      i++;
    }
    if (boss >= 0) {
      el.boss.hidden = false;
      const name = bossKind === 10 ? 'Жнец волн' : 'Улей';
      if (run.bossShown !== name) {
        run.bossShown = name;
        el.boss.firstChild.textContent = name;
      }
      el.bossFill.style.width = Math.round(w.E.hp[boss] / w.E.max[boss] * 1000) / 10 + '%';
    } else if (!el.boss.hidden) {
      el.boss.hidden = true;
      run.bossShown = '';
    }
  }

  // ---- overlays: cards, pause, countdown, result ----

  function hideOver() {
    el.over.hidden = true;
    el.over.replaceChildren();
    el.over.className = 'ws-over';
  }

  function showOver(kind, children) {
    el.over.className = 'ws-over ' + kind;
    el.over.replaceChildren.apply(el.over, children);
    el.over.hidden = false;
  }

  function cardNode(w, card, i, openedAt) {
    const kind = card.k;
    const x = kind === 'x' ? xcard(w, card.id) : null;
    const name = nameOf(kind, card.id, x);
    const lvl = card.k === 'w' || card.k === 'p' || card.k === 'x' ? (card.to > 1 ? (card.to - 1) + ' → ' + card.to : 'новое') : '';
    const fx = sim.effectLine(kind, card.id, card.to - 1, card.to, run.cfg, x);
    const node = h('button', { class: 'ws-card r' + card.r + (card.up ? ' up' : '') },
      h('span', { class: 'ws-rbar' }),
      Art.el(Art.card(kind, card.id, card.r), 48),
      h('div', { class: 'grow' },
        h('div', { class: 'ws-card-top' }, h('span', { class: 'ws-card-name' }, kind === 'x' ? ui.raw(name) : name), h('span', { class: 'ws-card-r' }, RARITY[card.r] || '')),
        h('div', { class: 'ws-card-lvl g-num' }, lvl ? (card.k === 'w' ? T('оружие') : card.k === 'x' ? T('карточка') : T('пассив')) + ' · ' + lvl : ''),
        h('div', { class: 'ws-card-fx' }, fx)));
    // A pick is its own touch: down and up on the same card, after the lock; a touch that began
    // before the cards came (the thumb steering the hero) never counts.
    let down = null;
    node.addEventListener('pointerdown', function (e) {
      if (performance.now() - openedAt < g.config['pickLockMs']) return;
      down = e.pointerId;
    });
    node.addEventListener('pointerup', function (e) {
      if (down === null || e.pointerId !== down) return;
      down = null;
      if (performance.now() - openedAt < g.config['pickLockMs']) return;
      choose(i);
    });
    node.addEventListener('pointerleave', function () { down = null; });
    node.addEventListener('pointercancel', function () { down = null; });
    node.addEventListener('click', function (e) { e.preventDefault(); });
    return node;
  }

  function xcard(w, id) {
    return w.s.xcards.filter(function (x) { return x.id === id; })[0] || null;
  }

  function showChoice() {
    keys.clear();
    const w = run.world;
    const ch = w.s.choice;
    if (!ch) return;
    run.choiceOpen = true;
    // The steering thumb lets go of the hero: it is not a pick.
    joy.id = null;
    joy.mx = 0;
    joy.my = 0;
    const openedAt = performance.now();
    g.sfx('level');
    const cards = ch.cards.map(function (card, i) { return cardNode(w, card, i, openedAt); });
    const reroll = h('button', { class: 'g-btn small', disabled: w.s.rerolls <= 0, onclick: function () { if (W.reroll(w)) { g.sfx('tap'); refreshChoice(); } } },
      window.GameIcons.el('refresh'), h('span', {}, 'Перебросить', h('span', { class: 'g-sub' }, String(w.s.rerolls))));
    const banish = h('button', {
      class: 'g-btn small' + (run.banishing ? ' on' : ''), disabled: w.s.banishes <= 0,
      onclick: function () {
        run.banishing = !run.banishing;
        refreshChoice();
      }
    }, window.GameIcons.el('close'), h('span', {}, run.banishing ? 'Какую убрать?' : 'Убрать', h('span', { class: 'g-sub' }, String(w.s.banishes))));
    const skip = h('button', { class: 'g-btn small', onclick: function () { if (W.skip(w)) afterPick(); } },
      window.GameIcons.el('coin'), h('span', {}, 'Пропустить', h('span', { class: 'g-sub' }, '+' + w.c.skipGold)));
    showOver('choice', [h('div', { class: 'ws-choice' },
      h('div', { class: 'ws-choice-head' }, h('span', { class: 'ws-t' }, T('Уровень {}', w.s.level)), h('span', { class: 'ws-s' }, run.banishing ? 'Нажмите карточку, которую убрать до конца забега' : 'Выберите одно')),
      h('div', { class: 'ws-cards' }, cards),
      h('div', { class: 'g-btns ws-choice-btns' }, reroll, banish, skip))]);
  }

  function refreshChoice() {
    run.choiceOpen = false;
    showChoice();
  }

  function choose(i) {
    const w = run.world;
    if (!w || !w.s.choice) return;
    if (run.banishing) {
      run.banishing = false;
      if (W.banish(w, i)) g.sfx('tap');
      refreshChoice();
      return;
    }
    if (W.pick(w, i)) afterPick();
  }

  function afterPick() {
    const w = run.world;
    g.sfx('ws-pick');
    run.choiceOpen = false;
    run.banishing = false;
    hideOver();
    snapNow();
    if (w.s.choice) showChoice();
  }

  function buildList(w) {
    const s = w.s;
    const list = s.wp.map(function (wp) {
      return h('div', { class: 'ws-li' }, Art.el(Art.card(wp.fu ? 'f' : 'w', wp.id, wp.fu ? 3 : 1), 36),
        h('div', { class: 'grow' }, h('div', { class: 'ws-t' }, nameOf('w', wp.id) + (wp.fu ? ' · ' + nameOf('f', wp.fu) : '')), h('div', { class: 'ws-s' }, T('ур. {} из {}', wp.lvl, w.c.wMax))));
    });
    Object.keys(s.ps).forEach(function (id) {
      if (!s.ps[id]) return;
      const x = id.charAt(0) === 'x' ? xcard(w, id) : null;
      list.push(h('div', { class: 'ws-li' }, Art.el(Art.card(x ? 'x' : 'p', id, x ? 2 : 0), 36),
        h('div', { class: 'grow' }, h('div', { class: 'ws-t' }, x ? ui.raw(x.title) : nameOf('p', id)), h('div', { class: 'ws-s' }, T('ур. {}', s.ps[id])))));
    });
    return h('div', { class: 'ws-list ws-build' }, list);
  }

  function showPause() {
    const w = run.world;
    if (!w) return;
    const s = w.s;
    const resume = h('button', { class: 'g-btn primary', onclick: function () { startCountdown(); } }, window.GameIcons.el('play'), 'Продолжить');
    const later = h('button', { class: 'g-btn small', onclick: function () { snapNow(); g.saveNow('action'); leaveStage(); } }, 'Отложить забег');
    const giveUp = h('button', { class: 'g-btn small ws-danger' }, 'Сдаться (удерживать)');
    g.ui.hold(giveUp, null, function () {
      s.over = true;
      s.won = false;
      s.ended = 'gave-up';
      s.choice = null;
      run.paused = false;
      hideOver();
      endRun();
    });
    const menu = h('button', { class: 'g-btn small', onclick: function () { g.ui.menu(); } }, window.GameIcons.el('more'), 'Меню игры');
    const left = s.mode === 'endless' ? s.t : Math.max(0, (s.mode === 'sprint' ? w.c.sprintSeconds : w.c.runSeconds) - s.t);
    showOver('pause', [h('div', { class: 'ws-panel' },
      h('div', { class: 'ws-choice-head' }, h('span', { class: 'ws-t' }, run.why === 'resume' ? 'Забег на паузе' : 'Пауза'),
        h('span', { class: 'ws-s g-num' }, (s.mode === 'endless' ? sim.clock(left) : T('осталось {}', sim.clock(left))) + ' · ' + T('ур. {}', s.level) + ' · ' + T('{} убито', s.kills))),
      h('div', { class: 'ws-hp' }, h('div', { class: 'ws-s' }, T('Здоровье {} из {}', Math.ceil(s.hp), Math.round(s.hmax))),
        h('div', { class: 'g-progress' }, h('i', { style: 'width:' + Math.round(s.hp / s.hmax * 100) + '%' }))),
      buildList(w),
      h('div', { class: 'g-btns' }, menu, later), giveUp, resume)]);
  }

  function startCountdown() {
    run.paused = false;
    // With the cards waiting, there is nothing to count: the cards come at once.
    run.countdown = run.world && run.world.s.choice ? 0 : g.config['resume.countdown'];
    run.acc = 0;
    if (run.countdown > 0) showCountdown();
    else hideOver();
  }

  function showCountdown() {
    const n = String(Math.max(1, Math.ceil(run.countdown)));
    if (el.over.classList.contains('count') && el.over.textContent === n) return;
    showOver('count', [h('div', { class: 'ws-count g-num' }, n)]);
  }

  function showResult(r, out) {
    const w = run.world;
    const best = g.state.meta.best[(run.info && run.info.mode) || r.mode];
    const lines = [
      g.ui.line('Время', sim.clock(r.mode === 'endless' ? r.time : r.T) + (out.record ? ' · ' + T('новый рекорд') : best ? ' · ' + T('рекорд {}', sim.clock(r.mode === 'endless' ? best.time : best.T)) : '')),
      g.ui.line('Убито', String(r.kills)),
      g.ui.line('Уровень', String(r.level)),
      g.ui.line('Элит и боссов', String(r.elites + r.bosses + r.hives)),
      g.ui.line('Осколков', '+' + out.shards + (g.links.mult() > 1 ? ' (' + g.fmt.mult(g.links.mult()) + ')' : ''))
    ];
    const notes = [];
    if (out.stormUp) notes.push(T('Открыта ступень шторма {}', g.state.meta.stormMax));
    out.unlocked.forEach(function (id) { notes.push(T('Открыт герой: {}', HERO(id).title)); });
    if (out.endless) notes.push(T('Открыт режим «Без конца»'));
    if (r.fusions.length) notes.push(T('Сращения: {}', r.fusions.map(function (f) { return nameOf('f', f); }).join(', ')));
    const again = h('button', { class: 'g-btn primary', onclick: function () { leaveStage(); startRun(); } }, window.GameIcons.el('refresh'), 'Ещё забег');
    const hub = h('button', { class: 'g-btn small', onclick: function () { leaveStage(); } }, 'В мастерскую');
    showOver('result', [h('div', { class: 'ws-panel' },
      h('div', { class: 'ws-result ' + (r.won ? 'won' : 'lost') }, r.won ? 'Победа' : r.ended === 'gave-up' ? 'Сдались' : 'Поражение'),
      h('div', { class: 'g-lines' }, lines),
      notes.map(function (n) { return h('div', { class: 'g-note ws-good' }, n); }),
      nextUnlock(), w ? buildList(w) : null,
      h('div', { class: 'ws-col' }, again, hub))]);
  }

  await Game.start({ sim: sim, render: render, animate: animate, init: build });
})();
