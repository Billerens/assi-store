// The screen of «Подземелье в одну клетку»: the start camp (hero, depth, hand of gifts, the treasury),
// the 3×3 grid under the thumb with the hand of gifts above it, the choices between floors, the
// workshop and the album. The logic is ../sim.js; every number comes from g.config. The engine
// (Game.start) keeps the state, saves (each move at once), the links, the prestige of depths, sounds.
(async function () {
  const h = ui.h;
  const sim = window.GameSim;
  const NAMES = ['enemies', 'seals', 'gifts', 'heroes', 'kind', 'floors', 'depths', 'bricks'];
  const content = {};
  await Promise.all(NAMES.map((n) => fetch('../content/' + n + '.json').then((r) => r.json()).then((x) => { content[n] = x; })));
  sim.setContent(content);
  try {
    sim.setDefaults(await (await fetch('../config.json')).json());
  } catch (error) { /* the stock check then has no defaults; the screen never needs them */ }

  const NB = sim.NB;
  const GOOD = { potion: 1, weapon: 1, shield: 1, gold: 1, key: 1, whet: 1, chest: 1 };
  const RARITY = { c: 'обычная', r: 'редкая', l: 'легендарная' };

  const view = {};
  const pad = { aim: -1, first: -1, press: null, shown: '', last: {} };
  let g = null;

  // ---- icons and sounds of the game's own ----------------------------------------------------------

  GameIcons.add('fang', '<path d="M4 5h16l-2 6-2-3-2 7-2-7-2 7-2-7-2 3z"/><path d="M6 19h12"/>');
  GameIcons.add('spikes', '<path d="M3 19h18M5 19l2-9 2 9M10 19l2-12 2 12M15 19l2-9 2 9"/>');
  GameIcons.add('key', '<circle cx="8" cy="12" r="4"/><path d="M12 12h9M18 12v3M21 12v2"/>');
  GameIcons.add('altar', '<path d="M4 20h16M6 20v-6h12v6M8 14v-3h8v3"/><path d="M12 4c1.5 1.5 1.5 3 0 4.5-1.5-1.5-1.5-3 0-4.5z"/>');
  GameIcons.add('stairs', '<path d="M4 20h4v-4h4v-4h4V8h4"/><path d="M4 20V8"/>');
  GameIcons.add('whet', '<path d="M4 15l9-9 5 5-9 9H4z"/><path d="M14 4l6 6"/>');
  GameIcons.add('fog', '<path d="M9 9a3 3 0 1 1 4.5 2.6c-1 .6-1.5 1.2-1.5 2.4M12 18h.01"/>');
  GameIcons.add('hero', '<circle cx="12" cy="6" r="3"/><path d="M7 21v-6l-2-1 2-5h10l2 5-2 1v6M10 21v-5h4v5"/>');
  GameIcons.add('heart', '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>');
  GameIcons.add('deck', '<rect x="5" y="4" width="11" height="15" rx="2"/><path d="M9 20h8a2 2 0 0 0 2-2V7"/>');
  GameIcons.add('seal', '<circle cx="12" cy="10" r="6"/><path d="M9 15l-2 6 5-2 5 2-2-6M12 7v6M9 10h6"/>');
  GameIcons.add('lock', '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>');

  Sfx.add('hit', [{ type: 'noise', f: [1, 1], d: 0.08, v: 0.3 }, { type: 'square', f: [160, 90], d: 0.1, v: 0.18 }]);
  Sfx.add('bite', [{ type: 'sawtooth', f: [500, 260], d: 0.07, v: 0.2 }, { at: 0.07, type: 'sawtooth', f: [480, 240], d: 0.07, v: 0.18 }]);
  Sfx.add('heal', [{ type: 'sine', f: [520, 780], d: 0.18, v: 0.35 }]);
  Sfx.add('coin', [{ type: 'triangle', f: [1320, 1320], d: 0.05, v: 0.35 }, { at: 0.05, type: 'triangle', f: [1760, 1760], d: 0.08, v: 0.3 }]);
  Sfx.add('blade', [{ type: 'noise', f: [1, 1], d: 0.12, v: 0.15 }, { type: 'triangle', f: [1800, 2400], d: 0.12, v: 0.2 }]);
  Sfx.add('break', [{ type: 'square', f: [300, 80], d: 0.22, v: 0.22 }, { type: 'noise', f: [1, 1], d: 0.15, v: 0.2 }]);
  Sfx.add('stairs', [{ type: 'triangle', f: [660, 330], d: 0.12, v: 0.3 }, { at: 0.1, type: 'triangle', f: [500, 250], d: 0.12, v: 0.3 }, { at: 0.2, type: 'triangle', f: [400, 200], d: 0.16, v: 0.3 }]);
  Sfx.add('boss', [{ type: 'sawtooth', f: [90, 60], d: 0.35, v: 0.3 }, { type: 'noise', f: [1, 1], d: 0.2, v: 0.25 }]);
  Sfx.add('death', [{ type: 'sawtooth', f: [330, 55], d: 0.8, v: 0.25, a: 0.02 }]);

  const BUZZ = { hit: [25], bite: [10, 30, 10], heal: [8], broke: [40, 30, 20], death: [80, 60, 160], stairs: [15, 40, 15] };

  // ---- small helpers ---------------------------------------------------------------------------------

  const cfg = () => g.config;
  const icon = (name) => GameIcons.el(name);
  const Art = window.DungeonArt;
  const pic = (markup, size, cls) => Art.el(markup, size, cls);
  /** The picture of a card of the field: an enemy by its kind, the master, a thing. */
  const cardArt = (x) => (x.k === 'foe' ? Art.foe(x.e) : x.k === 'boss' ? Art.foe('boss') : Art.card(x.k));
  const sealArt = (id) => {
    const s = sim.item('seals', id);
    return Art.seal(id, s ? s.rarity : '');
  };
  const plural = (n, a, b, c) => sim.plural(n, a, b, c);
  const embersNow = (s) => sim.embers(s);
  const stepsOn = () => {
    const st = g.links.status();
    return !!(st && st.steps && st.steps.on);
  };

  function chip(text, o) {
    o = o || {};
    return h('button', { class: 'd-chip' + (o.on ? ' on' : '') + (o.off ? ' locked' : ''), onclick: o.onclick, title: o.title || null }, o.art ? pic(o.art, 32) : o.icon ? icon(o.icon) : null, h('span', {}, text), o.suffix ? h('span', { class: 'g-num' }, o.suffix) : null);
  }

  function section(title, body, note) {
    return h('section', { class: 'd-sec' }, h('h3', {}, title), note ? h('p', { class: 'g-note' }, note) : null, body);
  }

  /** A text of several sentences, each in its own node (so the dictionary knows each one apart). */
  function sentences(text) {
    const parts = String(text || '').replace(/\.\s*$/, '').split(/\.\s+/);
    const out = [];
    parts.forEach((p, i) => {
      out.push(h('span', {}, p));
      out.push(i < parts.length - 1 ? '. ' : '.');
    });
    return out;
  }

  /** A list joined with commas, each item in its own node. */
  function commas(text) {
    const out = [];
    String(text || '').split(', ').forEach((p, i) => {
      if (i) out.push(', ');
      out.push(h('span', {}, p));
    });
    return out;
  }

  function describeSheet(title, text, extra) {
    g.sheet([h('h3', {}, title), h('p', { class: 'd-desc' }, sentences(text)), extra || null]);
  }

  function sealText(run, id) {
    if (id === 'rule' && run && run.rule) return run.rule.text;
    const s = sim.item('seals', id);
    return s ? sim.fill(s.text, cfg()) : '';
  }

  function giftLine(gid, lvl) {
    const d = sim.item('gifts', gid);
    const p = sim.giftPower(cfg(), { id: gid, lvl: lvl || 0 });
    return d ? d.power.replace('{}', String(Math.round(p * 100) / 100).replace('.', ',')) : '';
  }

  // ---- the frame -----------------------------------------------------------------------------------------

  function build(game) {
    g = game;
    view.hud = h('div', { class: 'd-hud' });
    g.el.top.append(view.hud);

    view.camp = h('div', { class: 'd-camp' });
    view.hand = h('div', { class: 'd-hand' });
    view.preview = h('div', { class: 'd-preview', 'aria-live': 'polite' });
    view.board = h('div', { class: 'd-board' });
    if (Game.scene && window.DungeonScene) {
      view.campWorld = Game.scene({ parent: g.el.field, label: 'Лагерь у входа в подземелье', width: 1000, height: 620, game: g, className: 'd-camp-world', draw: window.DungeonScene.draw });
      view.world = Game.scene({ parent: view.board, label: 'Текущее поле подземелья: девять клеток', width: 1000, height: 1000, game: g, className: 'd-world', draw: window.DungeonScene.draw });
      window.DungeonScene.onAssetsReady(() => { if (view.worldModel) { view.world.update(view.worldModel); view.campWorld.update(view.worldModel); } });
      view.board.classList.add('d-has-world');
    }
    view.cells = [];
    for (let i = 0; i < 9; i++) {
      const cell = h('button', { class: 'd-card', 'data-cell': String(i) });
      cell.addEventListener('pointerdown', (e) => down(e, i));
      cell.addEventListener('pointermove', move);
      cell.addEventListener('pointerup', up);
      cell.addEventListener('pointercancel', cancel);
      cell.addEventListener('contextmenu', (e) => e.preventDefault());
      view.cells.push(cell);
      view.board.append(cell);
    }
    view.hero = h('div', { class: 'd-hero' }, icon('hero'));
    view.board.append(view.hero);
    view.seals = h('div', { class: 'd-seals' });
    view.play = h('div', { class: 'd-play' }, view.hand, view.preview, h('div', { class: 'd-mid' }, view.seals, view.board));
    if (view.world) view.play.classList.add('d-with-world');
    view.result = h('div', { class: 'd-result' });
    g.el.field.append(view.camp, view.play, view.result);

    view.side = h('div', { class: 'd-side' });
    view.panel = h('div', { class: 'd-panel' });
    view.prestige = g.ui.prestigeButton(sim.LAYER, { label: 'Глубже' });
    view.prestige.classList.add('small');
    g.el.actions.append(view.side, view.panel);

    g.on('prestige', () => {
      g.sfx('prestige');
      g.flash('up', 'Открыта глубина ' + sim.unlockedDepth(g.state), 'Правило посложнее и +' + Math.round(cfg()['depth.bonus'] * 100) + ' % углей');
    });
    window.addEventListener('pointerup', () => { if (pad.press) cancel(); });
  }

  // ---- the start camp ---------------------------------------------------------------------------------

  function campView(state) {
    const c = cfg();
    const m = state.meta;
    const heroes = h('div', { class: 'd-chips' }, sim.list('heroes').map((x) => chip(x.title, {
      on: m.pref.hero === x.id, off: !m.unlocked[x.id], art: Art.hero(x.id),
      onclick: () => {
        if (!m.unlocked[x.id]) {
          describeSheet(x.title, sim.fill(x.text, c) + '. Откроется: ' + sim.fill(x.unlock, c) + '.');
          return;
        }
        g.act((s) => sim.setPref(s, c, 'hero', x.id), { now: true, reason: 'pref' });
        g.sfx('tap');
      }
    })));
    const hero = sim.item('heroes', m.pref.hero) || sim.list('heroes')[0];
    const top = sim.unlockedDepth(state);
    const d = Math.min(m.pref.depth || 0, top);
    const rules = sim.list('depths').slice(0, d).map((x) => h('li', {}, sim.fill(x.title, c)));
    const depth = h('div', { class: 'd-depth' },
      h('button', { class: 'd-step', disabled: d <= 0, onclick: () => g.act((s) => sim.setPref(s, c, 'depth', d - 1), { now: true, reason: 'pref' }) }, '−'),
      h('div', { class: 'd-depth-n' }, h('b', { class: 'g-num' }, String(d)), h('span', { class: 'g-note' }, d ? 'углей ×' + String(Math.round((1 + d * c['depth.bonus']) * 100) / 100).replace('.', ',') : 'без правил')),
      h('button', { class: 'd-step', disabled: d >= top, onclick: () => g.act((s) => sim.setPref(s, c, 'depth', d + 1), { now: true, reason: 'pref' }) }, '+'));
    const open = m.shop.gifts;
    const inHand = m.pref.hand.filter((id) => open.indexOf(id) >= 0);
    const hand = open.length ? h('div', { class: 'd-chips' }, open.map((id) => chip(sim.item('gifts', id).title, {
      suffix: m.shop.lv[id] ? 'ур. ' + m.shop.lv[id] : '',
      art: Art.gift(id),
      on: inHand.indexOf(id) >= 0,
      onclick: () => {
        const now = inHand.indexOf(id) >= 0 ? inHand.filter((x) => x !== id) : inHand.concat([id]).slice(-sim.handSize(c));
        g.act((s) => sim.setPref(s, c, 'hand', now), { now: true, reason: 'pref' });
        g.sfx('tap');
      }
    }))) : h('p', { class: 'g-note' }, 'Даров пока нет — их открывают в мастерской за угли.');
    const slots = sim.slots(state, c);
    const kinds = h('div', { class: 'd-chips' }, sim.list('kind').map((k) => chip(k.title, {
      art: Art.kind(k.id),
      on: m.pref.kinds.indexOf(k.id) >= 0,
      onclick: () => {
        const has = m.pref.kinds.indexOf(k.id) >= 0;
        const now = has ? m.pref.kinds.filter((x) => x !== k.id) : m.pref.kinds.concat([k.id]).slice(-slots);
        g.act((s) => sim.setPref(s, c, 'kinds', now), { now: true, reason: 'pref' });
        g.sfx('tap');
      }
    })));
    const toggles = h('div', { class: 'd-chips' },
      stepsOn() ? chip('Заряд от шагов: зелье ' + c['charge.potion'] + ' первой картой', { on: m.pref.charge, icon: 'steps', onclick: () => g.act((s) => sim.setPref(s, c, 'charge', !m.pref.charge), { now: true, reason: 'pref' }) }) : null,
      chip('Новинка из запаса', { on: m.pref.rules, icon: 'sparkle', onclick: () => g.act((s) => sim.setPref(s, c, 'rules', !m.pref.rules), { now: true, reason: 'pref' }) }));
    const rec = m.rec;
    return [
      h('div', { class: 'd-title' }, h('div', { class: 'g-big' }, h('span', { class: 'g-num' }, String(embersNow(state))), ' ', h('span', { class: 'd-unit' }, 'углей')),
        h('div', { class: 'g-note' }, rec.runs ? 'Спусков ' + rec.runs + ', побед ' + rec.wins + ', лучший этаж ' + rec.bestFloor : 'Первый спуск: пять этажей, на пятом — хозяин глубины.')),
      section('Герой', heroes, sim.fill(hero.text, c)),
      top ? section('Глубина', depth, rules.length ? null : 'Глубже — правила строже и углей больше.') : null,
      rules.length ? h('ul', { class: 'd-rules' }, rules) : null,
      section('Рука даров · ' + inHand.length + ' из ' + sim.handSize(c), hand),
      section('Сокровищница · ' + m.pref.kinds.length + ' из ' + slots, kinds, 'Добрые карты, которые замешиваются в колоду каждого этажа.'),
      toggles
    ];
  }

  function campActions(state) {
    const day = Core.dayKey(Date.now());
    const daily = state.meta.daily.day === day ? state.meta.daily : { best: 0, tries: 0 };
    view.prestige.hidden = !g.prestigeInfo(sim.LAYER).can;
    return [
      h('button', { class: 'g-btn primary', id: 'start', onclick: () => start(false) }, icon('stairs'), 'Начать спуск'),
      h('button', { class: 'g-btn small', id: 'daily', onclick: () => start(true) }, h('span', {}, 'Спуск дня', h('span', { class: 'g-sub' }, daily.tries ? 'рекорд ' + daily.best + ' ' + plural(daily.best, 'этаж', 'этажа', 'этажей') : 'одна колода на весь день'))),
      h('div', { class: 'g-btns' },
        h('button', { class: 'g-btn small', id: 'workshop', onclick: workshop }, 'Мастерская'),
        h('button', { class: 'g-btn small', id: 'album', onclick: album }, 'Альбом')),
      view.prestige
    ];
  }

  async function start(daily) {
    const c = cfg();
    const st = g.state;
    let charge = false;
    if (!daily && st.meta.pref.charge && stepsOn()) {
      const r = await g.links.spend('charge');
      charge = !!r.ok;
      if (!r.ok) ui.toast(r.off ? 'Связка «Шаги» выключена' : 'Не хватает энергии — спуск без заряда');
    }
    let rule = null;
    if (st.meta.pref.rules && !daily) {
      try {
        rule = await g.stock.take('rules');
      } catch (error) {
        rule = null;
      }
    }
    const seed = g.rng.int(1, 2147483646);
    const res = g.act((s) => {
      sim.toHub(s);
      return sim.startRun(s, c, { seed, day: daily ? Core.dayKey(Date.now()) : '', charge, rule });
    }, { now: true, reason: 'start' });
    if (!res.ok) {
      ui.toast(res.why || 'Спуск не начался');
      return;
    }
    pad.aim = -1;
    pad.first = -1;
    g.sfx('stairs');
    if (g.state.run.rule) g.flash('sparkle', g.state.run.rule.type === 'enemy' ? 'Новый враг: ' + g.state.run.rule.title : 'Новая печать: ' + g.state.run.rule.title, g.state.run.rule.text);
  }

  // ---- the workshop and the album ---------------------------------------------------------------------

  function workshop() {
    const box = h('div', { class: 'g-sheet' });
    const close = window.ui.sheet(box);
    const draw = () => {
      const s = g.state;
      const c = cfg();
      const k = sim.costs(s, c);
      const have = embersNow(s);
      const can = s.run.phase === 'hub' || s.run.phase === 'over';
      const buy = (what, id) => {
        const r = g.act((st) => sim.buy(st, c, what, id), { now: true, reason: 'buy' });
        if (r.ok) {
          g.sfx('buy');
          g.buzz('buy');
        } else {
          g.sfx('deny');
          ui.toast(r.why || 'Нельзя');
        }
        draw();
      };
      const row = (art, title, sub, cost, fn) => h('button', { class: 'd-buy' + (cost === null ? ' full' : ''), disabled: !can || cost === null || have < cost, onclick: fn },
        pic(art),
        h('span', { class: 'grow' }, h('b', {}, title), sub ? h('span', { class: 'g-note' }, sub) : null),
        h('span', { class: 'g-num d-cost' }, cost === null ? 'всё' : String(cost)));
      const closed = sim.list('gifts').filter((x) => s.meta.shop.gifts.indexOf(x.id) < 0);
      const opened = s.meta.shop.gifts;
      put(box, [
        h('h3', {}, 'Мастерская'),
        h('div', { class: 'g-line' }, h('span', { class: 'k' }, 'Углей'), h('span', { class: 'v' }, String(have))),
        can ? null : h('p', { class: 'g-note' }, 'Во время спуска мастерская закрыта.'),
        closed.length ? h('h4', {}, 'Новый дар · ' + k.gift) : null,
        closed.map((x) => row(Art.gift(x.id), x.title, [h('span', {}, x.text), ' (', h('span', {}, giftLine(x.id, 0)), ')'], k.gift, () => buy('gift', x.id))),
        opened.length ? h('h4', {}, 'Уровень дара') : null,
        opened.map((id) => {
          const lv = s.meta.shop.lv[id] || 0;
          const top = sim.giftMaxLevel(c);
          const next = Math.min(lv + 1, top);
          return row(Art.gift(id), sim.item('gifts', id).title + ' · уровень ' + lv + (isFinite(top) ? ' из ' + top : ''), [h('span', {}, giftLine(id, lv)), lv < top ? [' → ', h('span', {}, giftLine(id, next))] : null], sim.levelCost(s, c, id), () => buy('level', id));
        }),
        h('h4', {}, 'Остальное'),
        row(Art.shop('slot'), 'Слот сокровищницы', 'слотов ' + sim.slots(s, c) + ' из ' + (c['slots.base'] + c['shop.slot.max']), k.slot, () => buy('slot')),
        row(Art.shop('fort'), 'Крепость', '+' + c['shop.fort.hp'] + ' здоровье на старте за уровень · уровень ' + s.meta.shop.fort + (isFinite(sim.fortMax(c)) ? ' из ' + sim.fortMax(c) : ''), k.fort, () => buy('fort')),
        row(Art.shop('blade'), 'Стартовый клинок', 'оружие ' + c['shop.blade.s'] + '×' + c['shop.blade.c'] + ' на старте', k.blade, () => buy('blade')),
        h('button', { class: 'g-btn small', onclick: () => close() }, 'Закрыть')]);
    };
    draw();
  }

  function album() {
    const s = g.state;
    const c = cfg();
    const m = s.meta;
    const al = (art, seen, title, note) => h('div', { class: 'd-al' + (seen ? '' : ' unseen') }, pic(art), h('div', { class: 'd-al-b' }, h('b', {}, title), h('span', { class: 'g-note' }, note)));
    const seals = sim.list('seals').map((x) => al(m.album.seals[x.id] ? Art.seal(x.id, x.rarity) : Art.unknown(), m.album.seals[x.id], m.album.seals[x.id] ? x.title : 'Неизвестная печать',
      m.album.seals[x.id] ? RARITY[x.rarity] + ' · ' + sim.fill(x.text, c) + ' · взято ' + m.album.seals[x.id] : RARITY[x.rarity]));
    const foes = sim.list('enemies').map((x) => al(m.album.foes[x.id] ? Art.tile('#d0605a', Art.foe(x.id).replace(/^<svg[^>]*>|<\/svg>$/g, '')) : Art.unknown(), m.album.foes[x.id], m.album.foes[x.id] ? x.title : 'Неизвестный враг',
      m.album.foes[x.id] ? sim.fill(x.text, c) : 'этажи ' + x.floors[0] + '–' + x.floors[1]));
    const heroes = sim.list('heroes').map((x) => al(Art.hero(x.id), m.unlocked[x.id], x.title, m.unlocked[x.id] ? sim.fill(x.text, c) : 'откроется: ' + sim.fill(x.unlock, c)));
    const r = m.rec;
    g.sheet([
      h('h3', {}, 'Альбом'),
      h('div', { class: 'g-lines' },
        g.ui.line('Спусков', r.runs), g.ui.line('Побед', r.wins), g.ui.line('Этажей всего', r.floors), g.ui.line('Лучший этаж', r.bestFloor),
        g.ui.line('Глубже всех после победы', r.deepest ? 'этаж ' + r.deepest : '—'), g.ui.line('Хозяев повержено', r.bosses),
        g.ui.line('Сломано оружия', r.broke), g.ui.line('Углей заработано', r.embers)),
      h('h4', {}, 'Герои'), heroes,
      h('h4', {}, 'Печати · ' + Object.keys(m.album.seals).filter((k) => k !== 'rule').length + ' из ' + sim.list('seals').length), seals,
      h('h4', {}, 'Враги · ' + Object.keys(m.album.foes).filter((k) => k !== 'rule').length + ' из ' + sim.list('enemies').length), foes
    ]);
  }

  // ---- the HUD ------------------------------------------------------------------------------------------

  function hudView(state) {
    const run = state.run;
    const c = cfg();
    if (!run.grid) {
      return [h('div', { class: 'd-hud-row' }, h('span', { class: 'd-stat' }, icon('sparkle'), h('b', { class: 'g-num' }, String(embersNow(state))), ' углей'),
        sim.unlockedDepth(state) ? h('span', { class: 'd-stat' }, icon('up'), 'глубина ' + sim.unlockedDepth(state)) : null)];
    }
    const dots = [];
    if (run.wpn) for (let i = 0; i < Math.min(run.wpn.c, 8); i++) dots.push(h('i', {}));
    const pct = Math.max(0, Math.min(100, run.hp / run.maxHp * 100));
    return [
      h('div', { class: 'd-hud-row d-floor' },
        h('b', {}, 'Этаж ' + run.floor + ' · ' + sim.floorTitle(c, run.floor)),
        h('span', { class: 'd-stat' }, icon('deck'), h('span', { class: 'g-num' }, String(run.deck.length))),
        run.depth ? h('span', { class: 'd-stat' }, icon('up'), String(run.depth)) : null,
        run.day ? h('span', { class: 'g-mark' }, 'спуск дня') : null),
      h('div', { class: 'd-hud-row' },
        h('span', { class: 'd-stat d-hp' + (run.hp <= 3 ? ' low' : '') }, icon('heart'), h('b', { class: 'g-num' }, Math.max(0, run.hp) + '/' + run.maxHp), h('span', { class: 'd-bar' }, h('i', { style: 'width:' + pct + '%' }))),
        run.hero === 'madman' ? null : h('span', { class: 'd-stat' }, icon('shield'), h('b', { class: 'g-num' }, String(run.shield))),
        h('span', { class: 'd-stat' }, icon('sword'), run.wpn ? h('b', { class: 'g-num' }, String(sim.strength(run, c))) : h('span', { class: 'g-note' }, 'нет'),
          run.wpn ? h('span', { class: 'd-dots' }, dots, run.wpn.c > 8 ? '+' + (run.wpn.c - 8) : null) : null),
        h('span', { class: 'd-stat' }, icon('coin'), h('b', { class: 'g-num' }, String(run.gold))),
        run.keys ? h('span', { class: 'd-stat' }, icon('key'), h('b', { class: 'g-num' }, String(run.keys))) : null)
    ];
  }

  // ---- the grid ------------------------------------------------------------------------------------------

  function cardView(cell, i, run) {
    const c = cfg();
    const x = run.grid[i];
    const hero = i === run.pos;
    const near = NB[run.pos].indexOf(i) >= 0;
    const tg = pad.aim >= 0 ? sim.targets(run, c, pad.aim, pad.first) : null;
    const cls = ['d-card'];
    if (hero) cls.push('is-hero');
    if (!x && !hero) cls.push('empty');
    if (x) cls.push('k-' + x.k);
    if (x && (x.k === 'foe' || x.k === 'boss' || x.k === 'trap')) cls.push('bad');
    if (x && GOOD[x.k]) cls.push('good');
    if (x && sim.isPredator(run, x)) cls.push('pred');
    if (tg) {
      if (tg.indexOf(i) >= 0) cls.push('target');
      else if (!hero) cls.push('far');
    } else if (!hero && !near) cls.push('far');
    if (pad.first === i) cls.push('picked');
    const key = x ? x.u : 'e' + i;
    if (pad.last[i] !== undefined && pad.last[i] !== key && x) cls.push('enter');
    pad.last[i] = key;
    cell.className = cls.join(' ');
    if (hero) {
      cell.replaceChildren();
      cell.setAttribute('aria-label', 'Герой');
      return;
    }
    if (!x) {
      cell.replaceChildren();
      cell.setAttribute('aria-label', 'Пусто');
      return;
    }
    const val = sim.shown(run, c, i);
    const sub = x.k === 'weapon' ? '×' + x.c : x.k === 'boss' ? '/' + x.hp0 : '';
    const title = sim.cardTitle(run, x);
    cell.removeAttribute('aria-label');
    put(cell, [
      h('span', { class: 'd-stripe' }),
      h('span', { class: 'd-ico', html: cardArt(x) }),
      val !== null ? h('span', { class: 'd-val g-num' }, String(val), sub ? h('small', {}, sub) : null) : null,
      h('span', { class: 'd-name' }, title)]);
  }

  function heroPlace(run) {
    const col = run.pos % 3;
    const row = Math.floor(run.pos / 3);
    view.hero.style.setProperty('--col', String(col));
    view.hero.style.setProperty('--row', String(row));
    view.hero.style.transitionDuration = cfg()['ui.moveMs'] + 'ms';
    view.hero.className = 'd-hero' + (run.hero === 'madman' ? ' mad' : '');
    if (view.heroId !== run.hero) {
      view.heroId = run.hero;
      view.hero.innerHTML = Art.hero(run.hero);
    }
  }

  function handView(run) {
    const c = cfg();
    if (!run.hand.length) return [h('div', { class: 'g-note d-nohand' }, 'Рука пуста — дары открываются в мастерской')];
    return run.hand.map((x, i) => {
      const d = sim.item('gifts', x.id);
      const uses = sim.giftUses(run, c, x);
      const left = uses - x.used;
      const btn = h('button', { class: 'd-gift' + (pad.aim === i ? ' on' : '') + (left <= 0 ? ' spent' : ''), disabled: run.phase !== 'play' || left <= 0 },
        pic(Art.gift(x.id), 36), h('span', { class: 'd-gift-b' }, h('b', {}, d.title), h('span', { class: 'g-note' }, left > 1 ? giftLine(x.id, x.lvl) + ' · ещё ' + left : giftLine(x.id, x.lvl))));
      pressable(btn, () => tapGift(i), () => describeSheet(d.title, d.text + '. ' + giftLine(x.id, x.lvl) + '. Раз за этаж' + (uses > 1 ? ' (сейчас ' + uses + ')' : '') + '.'));
      return btn;
    });
  }

  /** A button with a tap and a long press of its own. */
  function pressable(btn, tap, long) {
    let timer = 0;
    let fired = false;
    btn.addEventListener('pointerdown', () => {
      fired = false;
      timer = setTimeout(() => {
        fired = true;
        long();
      }, cfg()['ui.describeMs']);
    });
    const stop = () => clearTimeout(timer);
    btn.addEventListener('pointerup', stop);
    btn.addEventListener('pointerleave', stop);
    btn.addEventListener('pointercancel', stop);
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
    btn.addEventListener('click', () => {
      if (!fired) tap();
    });
  }

  function sealsView(run) {
    if (!run.seals.length) return [h('div', { class: 'g-note d-noseal' }, 'Печатей нет')];
    return run.seals.map((id) => {
      const b = h('button', { class: 'd-seal' }, pic(sealArt(id), 30), h('span', {}, sim.sealTitle(run, id)));
      b.onclick = () => describeSheet(sim.sealTitle(run, id), sealText(run, id));
      return b;
    });
  }

  // ---- touch: preview on a short touch, the move on release, the description on a long one ---------------

  function clearPress() {
    if (!pad.press) return;
    clearTimeout(pad.press.pt);
    clearTimeout(pad.press.lt);
  }

  function down(e, i) {
    if (e.button > 0) return;
    const run = g.state.run;
    if (!run.grid || g.readonly) return;
    clearPress();
    const p = { cell: i, x: e.clientX, y: e.clientY, long: false, off: false };
    pad.press = p;
    p.lt = setTimeout(() => {
      p.long = true;
      showPreview('');
      describeCell(i);
    }, cfg()['ui.describeMs']);
    if (pad.aim < 0 && run.phase === 'play' && NB[run.pos].indexOf(i) >= 0 && cfg()['ui.preview']) {
      p.pt = setTimeout(() => {
        if (pad.press === p && !p.off) showPreview(i);
      }, cfg()['ui.previewMs']);
    }
  }

  function move(e) {
    const p = pad.press;
    if (!p || p.off) return;
    const under = document.elementFromPoint(e.clientX, e.clientY);
    const cell = under && under.closest ? under.closest('.d-card') : null;
    if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > 24 && cell !== view.cells[p.cell]) {
      p.off = true;
      clearPress();
      showPreview('');
    }
  }

  function up(e) {
    const p = pad.press;
    if (!p) return;
    clearPress();
    pad.press = null;
    const under = document.elementFromPoint(e.clientX, e.clientY);
    const cell = under && under.closest ? under.closest('.d-card') : null;
    showPreview('');
    if (p.long || p.off || (cell && cell !== view.cells[p.cell])) return;
    tapCell(p.cell);
  }

  function cancel() {
    clearPress();
    pad.press = null;
    showPreview('');
  }

  function showPreview(i) {
    const run = g.state.run;
    if (i === '' || !run.grid) {
      view.preview.classList.remove('on', 'dead');
      return;
    }
    const p = sim.preview(run, cfg(), i);
    if (!p) return;
    put(view.preview, commas(p.text));
    view.preview.classList.add('on');
    view.preview.classList.toggle('dead', !!p.dead);
  }

  function describeCell(i) {
    const run = g.state.run;
    if (i === run.pos) {
      const hero = sim.item('heroes', run.hero);
      describeSheet(hero ? hero.title : 'Герой', 'Здоровье ' + run.hp + ' из ' + run.maxHp + ', щит ' + run.shield + ', оружие ' + (run.wpn ? sim.strength(run, cfg()) + '×' + run.wpn.c : 'нет') +
        ', золото ' + run.gold + ', ключей ' + run.keys + '.' + (hero ? ' ' + sim.fill(hero.text, cfg()) + '.' : ''));
      return;
    }
    const d = sim.describe(run, cfg(), run.grid[i], i);
    const name = run.grid[i] ? sim.cardTitle(run, run.grid[i]) : d.title;
    describeSheet(d.title.indexOf(name) === 0 ? [h('span', {}, name), d.title.slice(name.length)] : d.title, d.text);
    g.buzz('tap');
  }

  function tapCell(i) {
    const run = g.state.run;
    const c = cfg();
    if (run.phase !== 'play') return;
    view.actionFrom = run.pos;
    if (pad.aim >= 0) {
      const gi = pad.aim;
      const tg = sim.targets(run, c, gi, pad.first);
      if (tg.indexOf(i) < 0) {
        deny();
        return;
      }
      if (run.hand[gi].id === 'swap' && pad.first < 0) {
        pad.first = i;
        g.sfx('tap');
        g.redraw();
        return;
      }
      const cells = run.hand[gi].id === 'swap' ? [pad.first, i] : [i];
      pad.aim = -1;
      pad.first = -1;
      const res = g.act((s) => sim.useGift(s, c, gi, cells, g.links.mult()), { now: true, reason: 'action' });
      feedback(res);
      return;
    }
    if (NB[run.pos].indexOf(i) < 0) {
      deny();
      return;
    }
    const res = g.act((s) => sim.move(s, c, i, g.links.mult()), { now: true, reason: 'action' });
    feedback(res);
  }

  function tapGift(i) {
    const run = g.state.run;
    const c = cfg();
    if (run.phase !== 'play') return;
    if (pad.aim === i) {
      pad.aim = -1;
      pad.first = -1;
      g.redraw();
      return;
    }
    const d = sim.item('gifts', run.hand[i].id);
    if (d.target === 'self') {
      const res = g.act((s) => sim.useGift(s, c, i, [], g.links.mult()), { now: true, reason: 'action' });
      if (!res.ok) deny();
      else feedback(res);
      return;
    }
    if (!sim.targets(run, c, i).length) {
      deny();
      ui.toast('Не на что использовать');
      return;
    }
    pad.aim = i;
    pad.first = -1;
    g.sfx('tap');
    g.redraw();
  }

  function deny() {
    g.sfx('deny');
    g.buzz('deny');
  }

  /** Sounds and vibration of what a move did (res.ev from the sim). */
  function feedback(res) {
    if (!res || !res.ok) {
      deny();
      return;
    }
    const ev = {};
    (res.ev || []).forEach((e) => { ev[e[0]] = (ev[e[0]] || 0) + e[1]; });
    if (view.world) view.world.pulse('step', { from: view.actionFrom, ev: ev }, 1.5);
    view.actionFrom = undefined;
    let sound = 'tap';
    if (ev.gold || ev.chest) sound = 'coin';
    if (ev.heal || ev.max) sound = 'heal';
    if (ev.weapon || ev.charge) sound = 'blade';
    if (ev.shield) sound = 'buy';
    if (ev.fight || ev.trap) sound = 'hit';
    if (ev.bite) sound = 'bite';
    if (ev.broke) sound = 'break';
    if (ev.boss !== undefined) sound = 'boss';
    if (ev.last) sound = 'achievement';
    if (res.done) sound = res.done === 'boss' ? 'level' : 'stairs';
    if (res.dead) sound = 'death';
    g.sfx(sound);
    const pattern = res.dead ? BUZZ.death : ev.broke ? BUZZ.broke : (ev.fight || ev.trap) ? BUZZ.hit : ev.bite ? BUZZ.bite : res.done ? BUZZ.stairs : null;
    if (pattern) g.buzz(pattern);
    else g.buzz('tap');
    const run = g.state.run;
    if (res.dead) g.flash('skull', 'Герой погиб', 'Этаж ' + run.floor + ' · угли +' + (run.result ? run.result.embers.total : 0));
    else if (res.done === 'stairs') g.flash('stairs', 'Этаж ' + (run.floor) + ' пройден');
  }

  // ---- the choices between and inside floors ---------------------------------------------------------------

  function pickButton(title, sub, fn, o) {
    o = o || {};
    return h('button', { class: (o.on ? 'on' : '') + (o.cls ? ' ' + o.cls : ''), disabled: !!o.disabled, onclick: fn },
      o.art ? pic(o.art, 40) : o.icon ? icon(o.icon) : null, h('span', { class: 'grow' }, h('b', {}, title), sub ? h('span', { class: 'g-note d-sub' }, sub) : null), o.right ? h('span', { class: 'g-num d-cost' }, o.right) : null);
  }

  function act(fn, reason) {
    const r = g.act(fn, { now: true, reason: reason || 'choice' });
    g.sfx(r && r.ok === false ? 'deny' : 'tap');
    return r;
  }

  function panelView(state) {
    const run = state.run;
    const c = cfg();
    const mult = g.links.mult();
    const p = run.pending;
    if (run.phase === 'choice' && p && p.type === 'chest') {
      return [h('div', { class: 'd-ask' }, icon('chest'), 'Сундук открыт: печать или золото'),
        h('div', { class: 'g-pick' }, p.seals.map((id, i) => pickButton(sim.sealTitle(run, id), sealText(run, id), () => act((s) => sim.choose(s, c, i)), { art: sealArt(id) })),
          pickButton(p.gold + ' золота', null, () => act((s) => sim.choose(s, c, p.seals.length)), { art: Art.card('gold') }))];
    }
    if (run.phase === 'choice' && p && p.type === 'altar') {
      return [h('div', { class: 'd-ask' }, icon('altar'), 'Алтарь: отдать ' + p.cost + ' здоровья — оружию +' + c['altar.strength'] + ' к силе и +' + c['altar.charges'] + ' заряд'),
        h('div', { class: 'g-btns' }, h('button', { class: 'g-btn primary', onclick: () => act((s) => sim.choose(s, c, 0)) }, 'Отдать'), h('button', { class: 'g-btn', onclick: () => act((s) => sim.choose(s, c, 1)) }, 'Мимо'))];
    }
    if (run.phase === 'seal') {
      return [h('div', { class: 'd-ask' }, icon('seal'), 'Этаж ' + run.floor + ' пройден. Печать на выбор'),
        h('div', { class: 'g-pick' }, (p ? p.seals : []).map((id, i) => {
          const s = sim.item('seals', id);
          return pickButton(sim.sealTitle(run, id), [s ? h('span', {}, RARITY[s.rarity]) : null, s ? ' · ' : null, h('span', {}, sealText(run, id))], () => act((st) => sim.pickSeal(st, c, i)), { art: sealArt(id), cls: s ? 'r-' + s.rarity : '' });
        }))];
    }
    if (run.phase === 'gift' && p) {
      return [h('div', { class: 'd-ask' }, icon('hand'), 'Вторая рука: ещё один дар'),
        h('div', { class: 'g-pick' }, p.options.map((id, i) => pickButton(sim.item('gifts', id).title, giftLine(id, state.meta.shop.lv[id] || 0), () => act((s) => sim.pickGift(s, c, i)), { art: Art.gift(id) })))];
    }
    if (run.phase === 'rest') {
      return [h('div', { class: 'd-ask' }, icon('heart'), 'Привал перед этажом ' + (run.floor + 1)),
        h('div', { class: 'g-btns' },
          h('button', { class: 'g-btn primary', id: 'rest', onclick: () => act((s) => sim.rest(s, c, 'heal'), 'rest') }, h('span', {}, '+' + c['rest.heal'] + ' здоровья', h('span', { class: 'g-sub' }, 'и вниз'))),
          h('button', { class: 'g-btn', id: 'shop', onclick: () => act((s) => sim.rest(s, c, 'shop'), 'rest') }, h('span', {}, 'Лавка', h('span', { class: 'g-sub' }, run.gold + ' золота'))))];
    }
    if (run.phase === 'shop' && run.shop) {
      const items = run.shop.items.map((it, i) => {
        const title = it.t === 'potion' ? 'Зелье ' + it.v : it.t === 'weapon' ? 'Оружие ' + it.v + '×' + it.c : it.t === 'whet' ? 'Точильный камень +' + it.v : 'Обмен дара';
        const art = it.t === 'potion' ? Art.card('potion') : it.t === 'weapon' ? Art.card('weapon') : it.t === 'whet' ? Art.card('whet') : Art.gift('swap');
        const can = !it.sold && run.gold >= it.price && !(it.t === 'whet' && !run.wpn);
        return pickButton(title, it.sold ? 'куплено' : it.t === 'swap' ? 'дар руки на другой открытый' : null, () => {
          if (it.t === 'swap') {
            swapSheet(i);
            return;
          }
          const r = act((s) => sim.shopBuy(s, c, i), 'buy');
          if (r.ok) g.sfx('buy');
        }, { art: art, right: String(it.price), disabled: !can });
      });
      return [h('div', { class: 'd-ask' }, icon('coin'), 'Лавка · ' + run.gold + ' золота'),
        h('button', { class: 'g-btn primary', id: 'leave', onclick: () => act((s) => sim.shopLeave(s, c), 'rest') }, 'Дальше вниз'),
        h('div', { class: 'g-pick' }, items)];
    }
    if (run.phase === 'won') {
      const e = sim.embersOf(run, c, mult);
      return [h('div', { class: 'd-ask big' }, icon('crown'), 'Хозяин глубины повержен!'),
        h('button', { class: 'g-btn primary', id: 'finish', onclick: () => finish() }, h('span', {}, 'Забрать угли', h('span', { class: 'g-sub' }, '+' + e.total + (mult > 1 ? ' · в поездке ×' + mult : '')))),
        h('button', { class: 'g-btn', id: 'deeper', onclick: () => act((s) => sim.wonChoice(s, c, 'deeper', mult), 'deeper') }, h('span', {}, 'Ниже дна', h('span', { class: 'g-sub' }, 'этажи без конца, счёт — этажи')))];
    }
    if (run.phase === 'play') {
      const giveUp = h('button', { class: 'g-btn small d-giveup' }, 'Сдаться — держать');
      g.ui.hold(giveUp, 900, () => {
        g.act((s) => sim.abandon(s, c, g.links.mult()), { now: true, reason: 'end' });
        g.sfx('death');
      });
      return [h('div', { class: 'g-btns d-tools' },
        h('button', { class: 'g-btn small d-narrow-only', onclick: () => sealsSheet() }, 'Печати · ' + run.seals.length),
        h('button', { class: 'g-btn small d-narrow-only', onclick: () => logSheet() }, 'Журнал'),
        giveUp)];
    }
    return [];
  }

  function finish() {
    const r = g.act((s) => sim.wonChoice(s, cfg(), 'finish', g.links.mult()), { now: true, reason: 'end' });
    if (r.ok) g.sfx('achievement');
  }

  function swapSheet(itemIndex) {
    const s = g.state;
    const run = s.run;
    const c = cfg();
    const open = s.meta.shop.gifts.filter((id) => !run.hand.some((x) => x.id === id));
    if (!open.length) {
      ui.toast('Все открытые дары уже в руке');
      return;
    }
    let from = 0;
    const box = h('div', { class: 'g-sheet' });
    const close = window.ui.sheet(box);
    const draw = () => box.replaceChildren(h('h3', {}, 'Обмен дара'), h('p', { class: 'g-note' }, 'Какой дар отдать:'),
      h('div', { class: 'g-pick' }, run.hand.map((x, i) => pickButton(sim.item('gifts', x.id).title, giftLine(x.id, x.lvl), () => { from = i; draw(); }, { on: from === i, art: Art.gift(x.id) }))),
      h('p', { class: 'g-note' }, 'На какой:'),
      h('div', { class: 'g-pick' }, open.map((id) => pickButton(sim.item('gifts', id).title, giftLine(id, s.meta.shop.lv[id] || 0), () => {
        const r = act((st) => sim.shopBuy(st, c, itemIndex, { hand: from, gift: id }), 'buy');
        if (r.ok) {
          g.sfx('buy');
          close();
        } else ui.toast(r.why || 'Нельзя');
      }, { art: Art.gift(id) }))));
    draw();
  }

  function sealsSheet() {
    const run = g.state.run;
    g.sheet([h('h3', {}, 'Печати'), run.seals.length ? run.seals.map((id) => h('div', { class: 'd-al' }, pic(sealArt(id)), h('div', { class: 'd-al-b' }, h('b', {}, sim.sealTitle(run, id)), h('span', { class: 'g-note' }, sealText(run, id))))) : h('p', { class: 'g-note' }, 'Печатей пока нет: их выбирают после каждого этажа.')]);
  }

  function logSheet() {
    const run = g.state.run;
    g.sheet([h('h3', {}, 'Журнал ходов'), h('div', { class: 'd-log' }, (run.log || []).slice().reverse().map((t) => h('div', {}, t))), deckTop(run)]);
  }

  function deckTop(run) {
    const top = sim.seen(run);
    if (!top.length) return null;
    return h('div', { class: 'd-top' }, h('h4', {}, 'Верх колоды'), h('div', { class: 'd-top-row' }, top.map((x) => h('span', { class: 'd-mini' + (x.k === 'foe' ? ' bad' : GOOD[x.k] ? ' good' : '') },
      pic(cardArt(x), 24), h('span', {}, sim.cardTitle(run, x)), x.v !== undefined ? h('b', { class: 'g-num' }, String(x.k === 'foe' ? sim.foeValue(run, cfg(), x, -1) : x.v)) : null))));
  }

  function sideView(run) {
    if (!run.grid) return [];
    return [h('h4', {}, 'Журнал'), h('div', { class: 'd-log' }, (run.log || []).slice(-8).reverse().map((t) => h('div', {}, t))), deckTop(run)];
  }

  // ---- the result --------------------------------------------------------------------------------------------

  function resultView(state) {
    const run = state.run;
    const r = run.result;
    if (!r) return [];
    const c = cfg();
    const e = r.embers;
    const why = r.won ? (r.floor > c['floors.count'] ? 'Победа и спуск ниже дна до этажа ' + r.floor : 'Победа: хозяин глубины повержен') : r.why === 'gave' ? 'Спуск окончен на этаже ' + r.floor : 'Герой погиб на этаже ' + r.floor;
    const news = r.news.map((id) => h('div', { class: 'd-news' }, pic(Art.hero(id), 40), 'Открыт герой: ' + (sim.item('heroes', id) ? sim.item('heroes', id).title : id)));
    return [h('div', { class: 'd-res' },
      h('div', { class: 'd-res-title' }, icon(r.won ? 'crown' : 'skull'), h('b', {}, why)),
      h('div', { class: 'g-big' }, '+' + e.total + ' ', h('span', { class: 'd-unit' }, plural(e.total, 'уголь', 'угля', 'углей'))),
      h('div', { class: 'g-lines' },
        g.ui.line('Золото ' + r.gold + ' / ' + c['embers.goldPer'], e.gold),
        g.ui.line('Этажей ' + r.floors + ' × ' + c['embers.floor'], e.floors),
        e.boss ? g.ui.line('Хозяин глубины', e.boss) : null,
        e.depth > 1 ? g.ui.line('Глубина ' + run.depth, '×' + String(Math.round(e.depth * 100) / 100).replace('.', ',')) : null,
        e.mult > 1 ? g.ui.line('В поездке', '×' + String(e.mult).replace('.', ',')) : null,
        g.ui.line('Ходов', r.moves), g.ui.line('Врагов повержено', r.kills)),
      r.day ? h('p', { class: 'g-note' }, 'Спуск дня: ' + r.floors + ' ' + plural(r.floors, 'этаж', 'этажа', 'этажей') + (r.floors > r.dayBest ? ' — новый рекорд дня' : ', рекорд ' + Math.max(r.dayBest, r.floors))) : null,
      news)];
  }

  function resultActions() {
    return [h('button', { class: 'g-btn primary', id: 'again', onclick: () => start(false) }, 'Ещё спуск'),
      h('div', { class: 'g-btns' }, h('button', { class: 'g-btn small', id: 'camp', onclick: () => g.act((s) => sim.toHub(s), { now: true, reason: 'end' }) }, 'В лагерь'),
        h('button', { class: 'g-btn small', onclick: workshop }, 'Мастерская')), view.prestige];
  }

  // ---- drawing -------------------------------------------------------------------------------------------------

  /** Puts the list (nested arrays, nulls skipped) into the element in place of what was there. */
  function put(el, list) {
    const nodes = [];
    const add = (x) => {
      if (x === null || x === undefined || x === false) return;
      if (Array.isArray(x)) x.forEach(add);
      else nodes.push(x instanceof Node ? x : ui.t(String(x)));
    };
    add(list);
    el.replaceChildren(...nodes);
  }

  function render(state) {
    sim.ensure(state);
    // The engine draws on every tick; the screen is rebuilt only when what it shows has changed,
    // so a finger on a button never loses it between the press and the release.
    const sig = JSON.stringify([state.run, state.meta.pref, state.meta.shop, state.meta.rec, state.meta.embers, state.layers, state.meta.daily,
      pad.aim, pad.first, stepsOn(), g.links.mult(), g.prestigeInfo(sim.LAYER).can]);
    if (sig === pad.sig) return;
    pad.sig = sig;
    const run = state.run;
    const phase = run.phase;
    const hub = phase === 'hub';
    const over = phase === 'over';
    if (view.world) {
      const targets = pad.aim >= 0 ? sim.targets(run, cfg(), pad.aim, pad.first) : null;
      const model = window.DungeonScene.model(state, targets, view.board.clientWidth);
      view.worldModel = model;
      view.world.update(model);
      view.campWorld.update(model);
      view.campWorld.node.hidden = !model.camp;
    }
    put(view.hud, hudView(state));
    view.camp.hidden = !hub;
    view.play.hidden = hub || over;
    view.result.hidden = !over;
    if (hub) {
      put(view.camp, campView(state));
      put(view.panel, campActions(state));
      view.side.replaceChildren();
    } else if (over) {
      put(view.result, resultView(state));
      view.prestige.hidden = !g.prestigeInfo(sim.LAYER).can;
      put(view.panel, resultActions());
      view.side.replaceChildren();
    } else {
      if (phase !== 'play') {
        pad.aim = -1;
        pad.first = -1;
      }
      view.play.classList.toggle('waiting', phase !== 'play');
      view.play.classList.toggle('aiming', pad.aim >= 0);
      put(view.hand, handView(run));
      put(view.seals, sealsView(run));
      view.cells.forEach((cell, i) => cardView(cell, i, run));
      heroPlace(run);
      put(view.panel, panelView(state));
      put(view.side, sideView(run));
    }
    sim.achievements(state, cfg()).forEach((id) => g.achieve(id));
  }

  await Game.start({ sim, render, init: build });
})();
