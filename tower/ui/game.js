/* Presentation only. Every game mutation goes through the engine's immediate save. */
(async function () {
  'use strict';
  const h = ui.h;
  const sim = window.GameSim;
  const data = await Promise.all(['catalog', 'events'].map(name => fetch('../content/' + name + '.json').then(response => {
    if (!response.ok) throw new Error('Не удалось прочитать данные башни');
    return response.json();
  })));
  const catalog = data[0];
  sim.setContent(catalog, data[1]);
  let g;
  let selectedClass = 'guardian';
  let selectedHeight = 1;
  let busy = false;
  let lastKey = '';
  const el = {};
  const A = window.TowerArt;
  const rarity = { common: 'Обычная', rare: 'Редкая', legendary: 'Легендарная' };
  const modifiers = { thorns: 'Шипы', heal: 'Лечение', double: 'Двойной ход' };
  let brickId = 0;

  function lookup(kind, id) { return (catalog[kind] || []).find(item => item.id === id) || {}; }
  function text(value) { return value === undefined || value === null ? '' : String(value); }
  function number(value) { return g.fmt(value || 0); }
  function pic(kind, id, o) { return A.el(kind, id, o); }
  function relicPic(id, o) { return pic('relics', id, Object.assign({ tone: lookup('relics', id).rarity }, o || {})); }
  function offerPic(offer) {
    if (offer.type === 'relic') return relicPic(offer.id);
    if (offer.type === 'move') return pic('moves', offer.id);
    return pic('res', offer.type === 'heal' ? 'heal' : 'coins');
  }
  // What a choice of a meeting shows before it is made: its price, or, when the outcome is
  // revealed, what it gives. A hidden outcome gets a signpost, so the picture never spoils it.
  function choicePic(choice) {
    if (choice.cost) return pic('res', choice.cost.type === 'gold' ? 'coins' : 'hp');
    const first = choice.outcome && (choice.effects || [])[0];
    const byEffect = { gold: ['res', 'coins'], damage: ['res', 'hp'], heal: ['res', 'heal'], relic: ['doors', 'chest'], upgrade: ['events', 'forge'], swap: ['classes', 'scholar'], skip: ['events', 'stairs'], ally: ['classes', 'guardian'], strength: ['workshop', 'strength'], defense: ['workshop', 'defense'], agility: ['workshop', 'agility'], will: ['workshop', 'will'], curse: ['heights', 'curse'], removeRelic: ['events', 'cairn'] };
    if (first && byEffect[first.type]) return pic(byEffect[first.type][0], byEffect[first.type][1]);
    return pic('res', choice.outcome && !(choice.effects || []).length ? 'leave' : 'sign');
  }
  function towerArt(reached, here) {
    const node = h('div', { class: 'tw-art', 'aria-hidden': 'true' });
    node.innerHTML = A.tower(reached, here);
    return node;
  }
  function backdrop() {
    const node = h('div', { class: 'tw-backdrop', 'aria-hidden': 'true' });
    const id = 'tw-bricks-' + (++brickId);
    node.innerHTML = '<svg width="100%" height="100%"><defs><pattern id="' + id + '" width="64" height="36" patternUnits="userSpaceOnUse"><path d="M0 .5h64M0 18.5h64M16 0v18M48 18v18" fill="none" stroke="currentColor"/></pattern></defs><rect width="100%" height="100%" fill="url(#' + id + ')"/></svg>';
    return node;
  }
  function price(value, kind) { return h('span', { class: 'tw-price' }, A.icon(kind), number(value)); }
  function ctx() { return { now: Date.now(), config: g.config, rng: g.rng, mult: g.links.mult(), links: g.links.status(), offline: false }; }
  function current() { return sim.view(g.state, g.config); }
  function showDescription(title, detail) { g.sheet(h('div', { class: 'tw-sheet' }, h('h2', {}, title), h('p', {}, detail))); }
  // A row of a list: a picture, a title, a line or two under it and, on the right, a price.
  // Without fn it is a plain row (an album entry), with it a button.
  function card(title, subtitle, picture, fn, disabled, side) {
    const lines = (Array.isArray(subtitle) ? subtitle : [subtitle]).filter(Boolean).map(line => typeof line === 'string' ? h('small', {}, line) : line);
    const body = [picture, h('span', { class: 'tw-card-text' }, h('strong', {}, title), lines), side || null];
    if (!fn) return h('div', { class: 'tw-card tw-static' + (disabled ? ' tw-off' : '') }, body);
    return h('button', { class: 'tw-card', type: 'button', disabled: !!disabled, onclick: fn }, body);
  }
  function button(title, fn, primary, disabled) {
    return h('button', { type: 'button', class: 'g-btn' + (primary ? ' primary' : ''), disabled: !!disabled, onclick: fn }, title);
  }
  function holdDescription(node, title, detail) {
    let timer = null;
    let held = false;
    node.title = detail;
    node.addEventListener('pointerdown', event => {
      if (event.button && event.button !== 0) return;
      held = false;
      timer = setTimeout(() => { held = true; showDescription(title, detail); }, g.config['ui.descriptionHoldMs'] || 480);
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(name => node.addEventListener(name, () => clearTimeout(timer)));
    node.addEventListener('click', event => { if (held) { event.preventDefault(); event.stopImmediatePropagation(); held = false; } }, true);
    node.addEventListener('contextmenu', event => { event.preventDefault(); clearTimeout(timer); held = true; showDescription(title, detail); });
    return node;
  }
  function act(action) {
    if (busy || g.readonly) return { ok: false };
    const before = el.worldModel;
    const result = g.act(state => sim.act(state, action, ctx()), { now: true, reason: action.type === 'buy' || action.type === 'workshop' ? 'spend' : 'action' });
    if (!result || !result.ok) {
      g.sfx('deny');
      g.buzz('deny');
      if (result && result.message) ui.toast(result.message);
      return result || { ok: false };
    }
    const sounds = { select: 'tower-door', win: 'level', lose: 'alarm', reward: 'chest' };
    const blockSound = action.type === 'play' && ['block', 'reflect'].includes(action.id) && result.sound !== 'win' && result.sound !== 'lose';
    g.sfx(blockSound ? 'tower-block' : sounds[result.sound] || result.sound || (action.type === 'play' ? 'tower-hit' : 'tap'));
    if (action.type === 'event' && g.state.run.lastOutcome) g.flash('sparkle', 'Исход встречи', g.state.run.lastOutcome);
    g.buzz(action.type === 'play' ? [12] : 'tap');
    if (el.world) {
      const after = current();
      el.world.pulse('action', {
        type: action.type, id: action.id,
        foeDamage: before && before.enemy ? Math.max(0, before.enemy.hp - (after.enemy ? after.enemy.hp : 0)) : 0,
        heroDamage: before && before.hero && after.hero ? Math.max(0, before.hero.hp - after.hero.hp) : 0
      }, 1.6);
    }
    (result.achievements || []).forEach(id => g.achieve(id));
    lastKey = '';
    g.redraw();
    return result;
  }

  function build(game) {
    g = game;
    g.el.field.classList.add('tw-field');
    g.el.actions.classList.add('tw-actions');
    el.title = h('div', { class: 'tw-floor' });
    el.money = h('div', { class: 'tw-currency' });
    el.progress = h('div', { class: 'tw-progress' });
    el.vitals = h('div', { class: 'tw-vitals' });
    g.el.top.append(h('div', { class: 'tw-heading' }, el.title, el.money), el.progress, el.vitals);
    el.scene = h('section', { class: 'tw-scene', 'aria-label': 'Сцена башни' });
    el.preview = h('div', { class: 'tw-preview' });
    if (Game.scene && window.TowerScene) {
      el.world = Game.scene({ parent: g.el.field, label: 'Текущая комната башни', width: 1000, height: 620, game: g, className: 'tw-world', draw: window.TowerScene.draw });
      window.TowerScene.onAssetsReady(() => { if (el.worldModel) el.world.update(el.worldModel); });
      g.el.app.classList.add('tw-has-world');
    }
    g.el.field.append(el.scene, el.preview);
    el.side = h('aside', { class: 'tw-side', 'aria-label': 'Реликвии и журнал' });
    g.el.app.append(el.side);
    Sfx.add('tower-hit', [{ type: 'triangle', f: [180, 65], d: .11, v: .18 }]);
    Sfx.add('tower-door', [{ type: 'sine', f: [150, 105], d: .2, v: .12 }]);
    Sfx.add('tower-block', [{ type: 'triangle', f: [400, 220], d: .12, v: .15 }]);
    g.on('resize', () => { lastKey = ''; });
    g.on('links', () => { lastKey = ''; g.redraw(); });
    g.on('prestige', () => { selectedHeight = Math.max(1, current().heights || 1); lastKey = ''; Object.keys(g.state.meta.tower.achievements).forEach(id => g.achieve(id)); });
    g.on('chest', () => { g.sfx('chest'); g.buzz('chest'); lastKey = ''; });
  }

  function track(share, cls) {
    const fill = h('div', { class: 'tw-fill' + (cls ? ' ' + cls : '') });
    fill.style.width = Math.max(0, Math.min(100, share * 100)) + '%';
    return h('div', { class: 'tw-track' }, fill);
  }
  function hpBar(hp, max, label) {
    return h('div', { class: 'tw-hp' }, h('span', { class: 'tw-hp-line' }, A.icon('hp'), label + ' ' + number(Math.ceil(hp)) + ' / ' + number(Math.ceil(max))), track(hp / Math.max(1, max), hp / max < .35 ? 'low' : ''));
  }
  function stat(kind, label, value) { return h('span', { class: 'tw-stat' }, A.icon(kind), label + ' ' + value); }
  // The strip under the floor number. In a climb: the ten floors of the flight, the passed ones
  // filled, the current one lit, with what is known to wait ahead (shop and rest, rest, the boss).
  // At the foot of the tower: how far the best climb got through each of the three flights.
  function drawProgress(v, active) {
    const size = g.config['floor.flightSize'] || 10;
    if (!active) {
      const best = v.bestFloor || 0;
      const flights = h('div', { class: 'tw-flights' });
      [1, 2, 3].forEach(index => {
        const done = Math.max(0, Math.min(size, best - (index - 1) * size));
        flights.append(h('div', { class: 'tw-flight' + (done >= size ? ' cleared' : done > 0 ? ' begun' : '') },
          h('span', { class: 'tw-flight-name' }, lookup('flights', index).title || ''),
          track(done / size),
          h('span', { class: 'tw-flight-num' }, done >= size ? 'Пройден' : done + ' из ' + size)));
      });
      el.progress.setAttribute('aria-label', 'Рекорд по пролётам');
      el.progress.replaceChildren(flights, h('div', { class: 'tw-caption' },
        h('span', {}, A.icon('record'), best ? 'Рекорд: этаж ' + best : 'Башня ещё не пройдена'),
        h('span', {}, A.icon('up'), 'Открыта высота ' + (v.heights || 1))));
      return;
    }
    const marks = {};
    marks[g.config['doors.serviceFloor']] = ['shop', 'Лавка и отдых'];
    marks[g.config['doors.restFloor']] = ['rest', 'Отдых'];
    marks[size] = ['boss', 'Босс'];
    const steps = h('div', { class: 'tw-steps' });
    steps.style.setProperty('--steps', size);
    for (let i = 1; i <= size; i++) {
      const state = i < v.flightFloor ? ' passed' : i === v.flightFloor ? ' current' : '';
      const mark = marks[i] ? h('span', { class: 'tw-mark', title: marks[i][1] }) : null;
      if (mark) mark.innerHTML = A.svg('doors', marks[i][0]);
      steps.append(h('div', { class: 'tw-step' + state + (marks[i] ? ' tw-step-' + marks[i][0] : '') }, mark, h('i', {})));
    }
    const left = size - v.flightFloor;
    el.progress.setAttribute('aria-label', 'Этажи пролёта');
    el.progress.replaceChildren(steps, h('div', { class: 'tw-caption' },
      h('span', {}, 'Этаж ' + v.flightFloor + ' из ' + size + ' в пролёте'),
      h('span', {}, left > 0 ? 'До босса: ' + left : 'Босс пролёта')));
  }
  function intention(item) {
    if (!item) return 'Намерение скрыто';
    const names = { attack: 'Удар', defend: 'Защита', charge: 'Зарядка', curse: 'Заклятие', heal: 'Лечение', flame: 'Пламя', flee: 'Побег', skip: 'Пропуск', hidden: 'Намерение скрыто' };
    return (item.title || names[item.type] || 'Удар') + (item.amount ? ' ' + number(item.amount) + (item.hits > 1 ? ' × ' + item.hits : '') : '');
  }
  function scene(title, detail, picture, extra) {
    el.scene.replaceChildren(backdrop(), picture, h('h1', {}, title), detail ? h('p', {}, detail) : h('span', {}));
    if (extra) el.scene.append(extra);
  }
  function drawCombat(v) {
    const foe = v.enemy || {};
    const intent = v.intent || {};
    const kind = foe.boss ? 'Босс пролёта' : foe.elite ? 'Элита' : '';
    el.scene.replaceChildren(
      backdrop(),
      h('div', { class: 'tw-turn' }, (kind ? kind + ' · ' : '') + 'Ход ' + (foe.turn || v.turn || 1)),
      h('div', { class: 'tw-intent', 'aria-label': 'Намерение врага' }, pic('intents', A.has('intents', intent.type) ? intent.type : 'hidden', { cls: 'tw-small' }), intention(intent)),
      pic('enemies', foe.template || foe.id, { cls: 'tw-big', tone: foe.boss ? 'boss' : foe.elite ? 'elite' : '' }),
      h('h1', {}, foe.title || 'Страж башни'),
      h('div', { class: 'tw-enemy-hp' }, hpBar(foe.hp, foe.maxHp, 'Здоровье'))
    );
    const statuses = [];
    if (foe.plates) statuses.push('Пластины щита: ' + foe.plates);
    if (foe.shield) statuses.push('Щит: ' + number(foe.shield));
    if (foe.burn) statuses.push('Пламя: ' + number(foe.burn) + ' за ход');
    if (foe.phaseTwo) statuses.push('Вторая фаза');
    if (foe.modifier && modifiers[foe.modifier]) statuses.push(modifiers[foe.modifier]);
    if (statuses.length) el.scene.append(h('div', { class: 'tw-chips' }, statuses.map(line => h('span', { class: 'tw-chip' }, line))));
    if (foe.text) el.scene.append(h('p', {}, foe.text));
    if ((v.previewIntents || []).length) el.scene.append(h('p', {}, 'Далее: ' + v.previewIntents.map(intention).join(' → ')));
  }
  function drawSide(v, target) {
    target.replaceChildren(h('h2', {}, 'Реликвии · ' + (v.relics || []).length));
    const list = h('div', { class: 'tw-relic-list' });
    (v.relics || []).forEach(item => {
      const relic = typeof item === 'string' ? lookup('relics', item) : item;
      list.append(h('button', { class: 'tw-relic', type: 'button', onclick: () => showDescription(relic.title, (rarity[relic.rarity] || '') + '. ' + relic.text) }, relicPic(relic.id, { cls: 'tw-small' }), h('span', {}, relic.title)));
    });
    target.append(list);
    if (!(v.relics || []).length) target.append(h('p', { class: 'tw-muted' }, 'Реликвии из сундуков меняют правила боя.'));
    target.append(h('h2', {}, 'Журнал боя'));
    target.append(h('ol', { class: 'tw-log', 'aria-live': 'polite' }, (v.log || []).slice(-9).reverse().map(line => h('li', {}, typeof line === 'string' ? line : line.text))));
  }
  function drawActions(v) {
    const actions = g.el.actions;
    actions.replaceChildren();
    const choices = h('div', { class: 'tw-choices' });
    if (v.phase === 'home' || v.phase === 'ended') {
      const selected = lookup('classes', selectedClass);
      actions.append(h('div', { class: 'tw-selects' },
        h('button', { class: 'tw-selection', type: 'button', onclick: chooseClass }, pic('classes', selectedClass, { cls: 'tw-small' }), h('span', {}, h('span', { class: 'tw-subtitle' }, 'Класс'), selected.title)),
        h('button', { class: 'tw-selection', type: 'button', onclick: chooseHeight }, pic('heights', lookup('heights', selectedHeight).modifier, { cls: 'tw-small' }), h('span', {}, h('span', { class: 'tw-subtitle' }, 'Сложность'), 'Высота ' + selectedHeight))));
      choices.append(button(v.phase === 'ended' ? 'Снова в башню' : 'Войти в башню', () => startRun(false), true));
      choices.append(button('Башня дня', startDaily, false));
      const info = g.prestigeInfo('height');
      if (info && info.can) choices.append(g.ui.prestigeButton('height', { label: 'Открыть следующую высоту' }));
    } else if (v.phase === 'doors') {
      choices.classList.add('tw-doors');
      choices.style.setProperty('--door-count', Math.min(3, Math.max(1, v.doors.length)));
      (v.doors || []).forEach((door, index) => choices.append(card(door.title || lookup('doors', door.type).title, door.text, pic('doors', door.type, { tone: door.type === 'boss' ? 'boss' : door.type === 'elite' ? 'elite' : '' }), () => act({ type: 'door', index }))));
    } else if (v.phase === 'combat') {
      actions.append(h('p', { class: 'tw-action-title' }, 'Выберите приём · удерживайте для описания'));
      choices.classList.add('tw-hand');
      (v.hand || []).forEach(move => {
        const detail = move.text || lookup('moves', move.id).text;
        const sub = move.locked ? 'Заперт' : (move.cost ? 'Воля: ' + move.cost : 'Без затрат воли');
        const node = card(move.title + (move.level ? ' +' + move.level : ''), sub, pic('moves', move.id, { cls: 'tw-small', state: move.locked ? 'locked' : '' }), () => act({ type: 'play', id: move.id }), move.disabled || move.locked);
        node.dataset.move = move.id;
        choices.append(holdDescription(node, move.title, detail));
      });
    } else if (v.phase === 'reward') {
      actions.append(h('p', { class: 'tw-action-title' }, 'Выберите один дар'));
      (v.rewards || v.offers || []).forEach((offer, index) => choices.append(card(offer.title, offer.text, offerPic(offer), () => act({ type: 'reward', index }))));
    } else if (v.phase === 'event') {
      const event = v.event || {};
      (event.choices || []).forEach((choice, index) => choices.append(card(choice.title, choice.outcome || choice.text, choicePic(choice), () => act({ type: 'event', index }), choice.disabled)));
    } else if (v.phase === 'shop') {
      (v.offers || []).forEach((offer, index) => {
        if (offer.sold) return;
        const item = card(offer.title, offer.text, offerPic(offer), () => act({ type: 'buy', index, payment: 'gold' }), Big.lt(v.gold, offer.price), price(offer.price, 'gold'));
        if (Big.lt(v.gold, offer.price)) item.classList.add('tw-wait');
        choices.append(item);
        if ((v.relics || []).some(item => (item.id || item) === 'bloodCoin')) {
          const cost = Math.ceil(Number(offer.price) / (g.config['relic.bloodCoin.rate'] || 3));
          const buyHealth = button('За здоровье: ' + cost, null, false, v.hero.hp <= cost && !(!g.state.run.heartUsed && (v.relics || []).some(item => (item.id || item) === 'heart')));
          g.ui.hold(buyHealth, undefined, () => act({ type: 'buy', index, payment: 'health' }));
          choices.append(buyHealth);
        }
      });
      choices.append(button('Покинуть лавку', () => act({ type: 'next' }), false));
    } else if (v.phase === 'rest') {
      choices.append(button('Продолжить подъём', () => act({ type: 'next' }), true));
    } else if (v.phase === 'fork') {
      choices.append(button('Подняться дальше', () => act({ type: 'continue' }), true));
      const down = button('Спуститься · удерживайте', null, false);
      g.ui.hold(down, undefined, () => act({ type: 'descend' }));
      choices.append(down);
      const info = g.prestigeInfo('height');
      if (info && info.can) choices.append(g.ui.prestigeButton('height', { label: 'Новая высота' }));
    }
    actions.append(choices);
    actions.append(h('nav', { class: 'tw-nav', 'aria-label': 'Разделы башни' },
      h('button', { onclick: () => v.phase === 'home' || v.phase === 'ended' ? workshop() : journey() }, v.phase === 'home' || v.phase === 'ended' ? 'Мастерская' : 'Рюкзак'),
      h('button', { onclick: album }, 'Альбом'),
      h('button', { onclick: () => g.ui.menu() }, 'Меню')));
  }
  function render(state) {
    const v = sim.view(state, g.config);
    if (el.world) {
      el.worldModel = window.TowerScene.model(v, selectedClass);
      el.world.update(el.worldModel);
    }
    const key = JSON.stringify(v) + selectedClass + selectedHeight + g.layout + busy;
    if (key === lastKey) return;
    lastKey = key;
    const active = v.phase !== 'home' && v.phase !== 'ended';
    const flight = lookup('flights', typeof v.flight === 'number' ? Math.min(4, v.flight) : 1);
    g.el.app.dataset.flight = text(Math.min(4, v.flight || 1));
    el.title.replaceChildren(h('strong', {}, active ? text(v.floor) : 'Башня'), h('span', { class: 'tw-eyebrow' }, active ? (flight.title || 'Над облаками') : 'У подножия'));
    el.money.replaceChildren(h('span', { title: 'Осколки' }, A.icon('shard'), number(v.shards)));
    if (active) el.money.append(h('span', { title: 'Золото' }, A.icon('gold'), number(v.gold)));
    drawProgress(v, active);
    el.vitals.replaceChildren();
    if (v.hero && active) el.vitals.append(hpBar(v.hero.hp, v.hero.maxHp, 'Здоровье'), h('div', { class: 'tw-stats' }, stat('strength', 'Сила', number(v.hero.strength)), stat('defense', 'Блок', number(v.hero.defense)), stat('will', 'Воля', number(v.hero.will))));
    const size = g.config['floor.flightSize'] || 10;
    const seen = Math.min(4, Math.ceil((v.bestFloor || 0) / size));
    const here = Math.min(4, v.flight || 1);
    if (v.phase === 'home') scene('Выше, чем вчера', 'Одна дверь. Один приём. Каждый подъём оставляет осколки для следующего.', towerArt(seen, 0));
    else if (v.phase === 'ended') scene('Башня запомнит', 'Осколки: ' + number(v.payout || 0) + '. Улучшите мастерскую и выберите новый путь.', towerArt(seen, 0));
    else if (v.phase === 'combat') drawCombat(v);
    else if (v.phase === 'doors') scene('За какой дверью?', 'Тип комнаты виден заранее. Выбирайте путь по силам.', towerArt(here, here));
    else if (v.phase === 'reward') scene(v.rewardTitle || 'Дар башни', 'Выбранная реликвия или приём останется с вами до конца забега.', pic('doors', 'chest', { cls: 'tw-big' }));
    else if (v.phase === 'event') scene(v.event && v.event.title, v.event && v.event.text, pic('events', v.event && v.event.id, { cls: 'tw-big' }));
    else if (v.phase === 'shop') scene('Лавка между этажами', 'Золото действует только в этом забеге. Удерживайте покупку за здоровье.', pic('doors', 'shop', { cls: 'tw-big' }));
    else if (v.phase === 'rest') scene('Тихая площадка', 'Здоровье восстановлено. Следующий этаж подождёт столько, сколько нужно.', pic('doors', 'rest', { cls: 'tw-big' }));
    else if (v.phase === 'fork') scene('Пролёт пройден', 'Спуск сохраняет все осколки. При гибели после подъёма останется лишь часть.', towerArt(Math.min(4, here + 1), 0), h('p', {}, 'При спуске: ' + number(Big.mul(v.payout || 0, g.links.status().passenger && g.links.status().passenger.on !== false && g.links.status().passenger.state === 'trip' ? g.config['shards.passengerMult'] : 1)) + ' осколков'));
    el.preview.replaceChildren();
    if (state.run.daily) {
      const rule = lookup('dailyRules', state.run.daily.rule);
      el.preview.append(h('div', {}, h('strong', {}, state.run.daily.title || 'Башня дня'), ' · ', rule.title || '', h('div', { class: 'tw-muted' }, rule.text || '')));
    }
    if (v.doorPreview && v.doorPreview.length) v.doorPreview.forEach(row => el.preview.append(h('div', {}, 'Этаж ' + row.floor + ': ' + (row.doors || []).map(door => door.title || lookup('doors', door.type || door).title).join(', '))));
    drawSide(v, el.side);
    drawActions(v);
  }

  function chooseClass() {
    const body = h('div', { class: 'tw-sheet' }, h('h2', {}, 'Кто поднимется?'));
    let close;
    (current().classes || []).forEach(item => {
      const meta = lookup('classes', item.id);
      const node = card(item.title, item.unlocked ? [item.text, 'Рекорд: этаж ' + (item.bestFloor || 0)] : 'Чтобы открыть: ' + meta.unlockText, pic('classes', item.id, { state: item.unlocked ? '' : 'locked' }), () => {
        if (!item.unlocked) return;
        selectedClass = item.id;
        close();
        g.redraw();
      }, !item.unlocked);
      if (item.id === selectedClass) node.classList.add('tw-picked');
      body.append(node);
    });
    close = g.sheet(body);
  }
  function chooseHeight() {
    const v = current();
    const body = h('div', { class: 'tw-sheet' }, h('h2', {}, 'Высоты башни'), h('p', {}, 'Следующая высота открывается после прохождения Шпиля.'));
    let close;
    (catalog.heights || []).forEach(item => {
      const open = item.id <= (v.heights || 1);
      const node = card('Высота ' + item.id + ' · ' + item.title, item.text, pic('heights', item.modifier, { state: open ? '' : 'locked' }), () => {
        selectedHeight = item.id;
        close();
        g.redraw();
      }, !open);
      if (item.id === selectedHeight) node.classList.add('tw-picked');
      body.append(node);
    });
    close = g.sheet(body);
  }
  function workshop() {
    const body = h('div', { class: 'tw-sheet' });
    function redraw() {
      const v = current();
      body.replaceChildren(h('h2', {}, 'Лестничная мастерская'),
        h('p', {}, 'Улучшения сохраняются между забегами. Закалка, Хватка, Стойка и Кошелёк растут без предела: после порога мастерства каждый уровень заметно дороже.'),
        h('div', { class: 'tw-wallet' }, A.icon('shard'), 'Осколки: ' + number(v.shards)));
      const list = h('div', { class: 'tw-list' });
      (v.workshop || []).forEach(item => {
        const full = !item.endless && item.level >= item.max;
        let level;
        if (item.endless) level = h('small', { class: 'tw-level' }, 'Уровень ' + item.level + (item.level >= item.mastery ? ' · мастерство' : ' · без предела'));
        else {
          const pips = h('span', { class: 'tw-pips' });
          for (let i = 1; i <= item.max; i++) pips.append(h('i', { class: i <= item.level ? 'on' : '' }));
          level = h('small', { class: 'tw-level' }, pips, 'Уровень ' + item.level + ' из ' + item.max);
        }
        const node = card(item.title, [level, item.text], pic('workshop', item.id, { state: full ? 'done' : '' }), () => {
          act({ type: 'workshop', id: item.id });
          redraw();
        }, full || !item.affordable, full ? h('span', { class: 'tw-price tw-full' }, 'Всё куплено') : price(item.price, 'shard'));
        node.classList.add(full ? 'tw-done' : item.affordable ? 'tw-ready' : 'tw-wait');
        list.append(node);
      });
      body.append(list);
    }
    redraw();
    g.sheet(body);
  }
  function journey() {
    const v = current();
    const body = h('div', { class: 'tw-sheet' });
    drawSide(v, body);
    const hero = lookup('classes', v.classId);
    body.append(h('h2', {}, 'Герой'), card(hero.title || 'Герой', 'Высота ' + v.height + ' · ' + (lookup('heights', v.height).title || ''), pic('classes', v.classId)), g.ui.line('Ловкость', g.fmt.pct(v.hero.agility)), g.ui.line('Воля', v.hero.will + ' / ' + v.hero.maxWill), g.ui.line('Уровень', v.level), g.ui.line('Опыт', v.xp + ' / ' + v.xpNext));
    body.append(h('h2', {}, 'Приёмы'));
    Object.keys(g.state.run.moves).forEach(id => { const move = lookup('moves', id); body.append(card(move.title + (g.state.run.moves[id] ? ' +' + g.state.run.moves[id] : ''), move.text, pic('moves', id))); });
    body.append(h('h2', {}, 'Свежие ноги'), h('p', {}, 'Энергия шагов: первый отдых пролёта восстановит всё здоровье.'));
    const fresh = button('Зарядить · ' + g.config['steps.cost.fresh-legs'] + ' энергия', freshLegs, false, !sim.canFreshLegs(g.state, g.config));
    body.append(fresh);
    if (v.canReroll || (v.relics || []).some(item => (item.id || item) === 'vane')) {
      body.append(h('h2', {}, 'Флюгер'));
      (v.doors || []).forEach((door, index) => body.append(button('Изменить дверь: ' + door.title, () => { act({ type: 'reroll', index }); close(); }, false, !v.canReroll)));
    }
    const close = g.sheet(body);
  }
  async function freshLegs() {
    if (busy || !sim.canFreshLegs(g.state, g.config)) return;
    busy = true;
    try {
      const result = await g.links.spend('fresh-legs');
      busy = false;
      if (!result.ok) { ui.toast(result.off ? 'Связка «Шаги» выключена' : 'Не хватает энергии шагов'); return; }
      act({ type: 'freshLegs' });
      ui.toast('Первый отдых пролёта восстановит всё здоровье');
    } finally { busy = false; g.redraw(); }
  }
  function album() {
    const meta = g.state.meta.tower;
    const v = current();
    const known = meta.album || {};
    const seen = (collection, id) => Array.isArray(collection) ? collection.indexOf(id) >= 0 : !!(collection && collection[id]);
    const count = (list, collection, key) => list.filter(item => seen(collection, item[key || 'id'])).length + ' из ' + list.length;
    const body = h('div', { class: 'tw-sheet' }, h('h2', {}, 'Альбом башни'), h('p', {}, 'Находки, встречи и враги остаются в альбоме после любого забега.'));

    body.append(h('h2', {}, 'Рекорды'));
    const records = h('div', { class: 'tw-list' });
    records.append(card('Лучший подъём', (meta.bestFloor ? 'Этаж ' + meta.bestFloor : 'Пока нет') + ' · открыта высота ' + (meta.heights || 1), pic('res', 'record')));
    (v.classes || []).forEach(item => records.append(card(item.title, item.unlocked ? (item.bestFloor ? 'Рекорд: этаж ' + item.bestFloor : 'Ещё не поднимался') : 'Чтобы открыть: ' + lookup('classes', item.id).unlockText, pic('classes', item.id, { state: item.unlocked ? '' : 'locked' }), null, !item.unlocked)));
    body.append(records);

    body.append(h('h2', {}, 'Реликвии · ' + count(catalog.relics, known.relics)));
    const relics = h('div', { class: 'tw-list' });
    catalog.relics.forEach(item => {
      const have = seen(known.relics, item.id);
      relics.append(card(have ? item.title : 'Неизвестная реликвия', have ? [rarity[item.rarity], item.text] : rarity[item.rarity], relicPic(item.id, { state: have ? '' : 'locked' }), null, !have));
    });
    body.append(relics);

    const foes = (catalog.enemies || []).concat(catalog.bosses || []);
    body.append(h('h2', {}, 'Враги · ' + count(foes, known.enemies, 'template')));
    const bestiary = h('div', { class: 'tw-list' });
    foes.forEach(item => {
      const have = seen(known.enemies, item.template);
      const boss = (catalog.bosses || []).indexOf(item) >= 0;
      const where = (boss ? 'Босс · ' : '') + (lookup('flights', item.flight).title || '');
      bestiary.append(card(have ? item.title : boss ? 'Неизвестный босс' : 'Неизвестный враг', have ? [where, item.text] : where, pic('enemies', item.template, { tone: boss ? 'boss' : '', state: have ? '' : 'locked' }), null, !have));
    });
    body.append(bestiary);

    const builtIn = Array.isArray(data[1]) ? data[1] : data[1].events || [];
    const eventData = known.eventData || {};
    const events = builtIn.concat((meta.stock && meta.stock.events) || [], Object.keys(eventData).map(id => eventData[id])).filter((item, index, all) => all.findIndex(other => other.id === item.id) === index);
    body.append(h('h2', {}, 'Встречи · ' + count(events, known.events)));
    const meetings = h('div', { class: 'tw-list' });
    events.forEach(item => {
      const have = seen(known.events, item.id);
      meetings.append(card(have ? item.title : 'Неизвестная встреча', have ? item.text : 'Откроется, когда встретится в башне.', pic('events', item.id, { state: have ? '' : 'locked' }), null, !have));
    });
    body.append(meetings);
    g.sheet(body);
  }
  async function startRun(daily) {
    if (busy) return;
    busy = true;
    try {
      const kinds = ['events', 'enemies'];
      for (var i = 0; i < kinds.length; i++) {
        const kind = kinds[i];
        if (g.stock.count(kind) <= 0) continue;
        const item = await g.stock.take(kind);
        if (item && !sim.validateStock(kind, item)) {
          g.act(state => sim.act(state, { type: 'stock', kind, item }, ctx()), { now: true, reason: 'stock' });
        }
      }
      if (daily && g.stock.count('daily') > 0) {
        const item = await g.stock.take('daily');
        if (item && !item.procedural && !sim.validateStock('daily', item)) {
          g.act(state => sim.act(state, { type: 'stock', kind: 'daily', item }, ctx()), { now: true, reason: 'stock' });
        }
      }
      busy = false;
      act({ type: 'start', classId: selectedClass, height: selectedHeight, daily: !!daily });
    } catch (error) { ui.toast('Не удалось начать подъём: ' + error.message); }
    finally { busy = false; g.redraw(); }
  }
  function startDaily() { return startRun(true); }
  await Game.start({ id: 'tower', sim, init: build, render });
})().catch(error => {
  console.error(error);
  document.body.appendChild(ui.h('div', { class: 'g-error', role: 'alert' }, 'Не удалось открыть башню: ' + error.message));
});











