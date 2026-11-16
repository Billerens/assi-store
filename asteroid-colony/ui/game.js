/* UI state stays here; every colony mutation goes through the engine's g.act. */
(async function () {
  'use strict';
  const sim = window.GameSim;
  const h = ui.h;
  const view = { updates: [], resources: {}, rocks: [], tab: 'drones', mode: 'one', second: false };
  let g;
  let stockBusy = false;
  let lastAchievementCheck = 0;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const byId = (list, id) => list.find(x => x.id === id);
  const canPay = (state, currency, price) => Big.gte(state.run[currency] || 0, price);
  const now = () => Date.now();
  const label = id => (byId(sim.RESOURCES, id) || {}).title || id;
  const number = value => g.fmt(value || 0);
  const note = text => h('p', { class: 'ac-note' }, text);

  function act(fn, sound) {
    const result = g.act(fn, { reason: 'action' });
    g.sfx(result ? sound || 'buy' : 'deny');
    g.buzz(result ? sound || 'buy' : 'deny');
    return result;
  }

  function update(fn) {
    view.updates.push(fn);
  }

  const art = (name, cls) => window.AcArt.el(name, cls);

  function title(text, pic) {
    view.panel.append(h('h3', { class: 'ac-group' }, pic ? art(pic, 'ac-pic-small') : '', h('span', {}, text), h('i', {})));
  }

  /** A row of the panel: picture, name, a line under it, controls. state: '', 'locked', 'off', 'done'. */
  function row(name, text, parent, pic) {
    const heading = h('div', { class: 'ac-row-title' }, name);
    const info = h('div', { class: 'ac-row-info' }, text || '');
    const body = h('div', { class: 'ac-row-body' }, heading, info);
    const controls = h('div', { class: 'ac-row-controls' });
    const el = h('div', { class: 'ac-row' }, art(pic || 'rock'), body, controls);
    (parent || view.panel).append(el);
    return { el, heading, info, controls, body, state: value => { el.dataset.state = value || ''; } };
  }

  /** A line of a sheet: picture, name, text. */
  function sheetRow(parent, pic, name, text, state) {
    const el = h('div', { class: 'ac-row ac-row-plain' }, art(pic), h('div', { class: 'ac-row-body' }, h('div', { class: 'ac-row-title' }, name), h('div', { class: 'ac-row-info' }, text)));
    el.dataset.state = state || '';
    parent.append(el);
    return el;
  }

  function buyButton(parent, action, describe, available) {
    const top = h('b', {});
    const price = h('span', {});
    const button = h('button', { class: 'ac-buy', onclick: () => act(action) }, top, price);
    parent.append(button);
    update(state => {
      const text = describe(state);
      top.textContent = text[0];
      price.textContent = text[1] || '';
      button.disabled = g.readonly || !available(state);
      button.setAttribute('aria-label', text.join(', '));
    });
    return button;
  }

  function toggle(parent, text, getter, setter, enabled) {
    const button = h('button', { class: 'ac-toggle', onclick: () => act(state => { setter(state, !getter(state)); return true; }, 'tap') });
    parent.append(button);
    update(state => {
      const on = getter(state);
      button.textContent = text + ': ' + (on ? 'вкл.' : 'выкл.');
      button.setAttribute('aria-pressed', String(on));
      button.disabled = g.readonly || (enabled && !enabled(state));
    });
    return button;
  }

  function tool(parent, text, fn) {
    const button = h('button', { class: 'ac-tool', onclick: fn }, text);
    parent.append(button);
    return button;
  }

  function build(game) {
    g = game;
    view.ore = h('strong', { class: 'g-big', id: 'ac-ore' });
    view.rate = h('span', { class: 'g-rate' });
    const money = h('div', { class: 'ac-money' }, art('res-ore', 'ac-pic-bare'), h('span', { class: 'ac-resource-label' }, 'Руда'), view.ore);
    view.resourceStrip = h('div', { class: 'ac-resource-strip', 'aria-label': 'Ресурсы колонии' });
    sim.RESOURCES.filter(x => x.id !== 'ore').forEach(resource => {
      const count = h('b', {});
      const el = h('div', { class: 'ac-resource', 'data-resource': resource.id, title: resource.title }, art('res-' + resource.id, 'ac-pic-bare'), h('span', { class: 'ac-resource-name' }, resource.title + ' '), count);
      view.resources[resource.id] = { el, count };
      view.resourceStrip.append(el);
    });
    view.colonistsText = h('b', {});
    view.colonists = h('div', { class: 'ac-resource', title: 'Колонисты' }, art('res-colonists', 'ac-pic-bare'), h('span', { class: 'ac-resource-name' }, 'Колонисты '), view.colonistsText);
    view.resourceStrip.append(view.colonists);
    view.energyText = h('span', {});
    view.energyShare = h('span', {});
    view.energyFill = h('i', {});
    view.energy = h('div', { id: 'ac-energy', role: 'status', 'aria-label': 'Энергия' },
      h('div', { class: 'ac-energy-text' }, h('span', { class: 'ac-energy-name' }, art('res-energy', 'ac-pic-bare'), view.energyText), view.energyShare),
      h('div', { class: 'ac-energy-track' }, view.energyFill));
    g.el.top.append(h('div', { class: 'ac-main-resource' }, money, view.rate), view.resourceStrip, view.energy);

    view.starTitle = h('strong', {});
    view.starCount = h('span', {});
    view.rule = h('p', { class: 'ac-rule' });
    view.asteroids = h('div', { class: 'ac-asteroids' });
    view.rocks = [makeAsteroid('А'), makeAsteroid('Б')];
    view.rocks.forEach(rock => view.asteroids.append(rock.el));
    view.sun = h('div', { class: 'ac-sun' });
    const scene = h('div', { class: 'ac-scene' }, makeSky(), view.sun, view.asteroids);
    g.el.field.append(h('div', { class: 'ac-star-heading' }, view.starTitle, view.starCount), scene, view.rule, makeFlow());
    view.world = window.ColonyScene && ColonyScene.mount(g, g.el.field);
    if (view.world) {
      g.el.app.classList.add('ac-world-enabled');
      g.el.field.insertBefore(view.world.node, scene);
      scene.hidden = true;
    }

    view.panel = h('section', { class: 'ac-panel', role: 'tabpanel', id: 'ac-panel', tabindex: '0' });
    view.event = h('div', { class: 'ac-event', hidden: true, 'aria-live': 'polite' });
    view.tabs = h('nav', { class: 'ac-tabs', role: 'tablist', 'aria-label': 'Управление колонией' });
    view.tabButtons = {};
    [
      ['drones', 'Дроны', 'pick'], ['buildings', 'Здания', 'factory'], ['science', 'Наука', 'flask'],
      ['expeditions', 'Рейсы', 'rocket', 'Экспедиции'], ['jump', 'Прыжок', 'map']
    ].forEach(tab => {
      const button = h('button', {
        class: 'ac-tab', role: 'tab', id: 'ac-tab-' + tab[0], 'aria-controls': 'ac-panel',
        'aria-label': tab[3] || tab[1], title: tab[3] || tab[1], onclick: () => selectTab(tab[0])
      }, GameIcons.el(tab[2]), h('span', {}, tab[1]));
      view.tabButtons[tab[0]] = button;
      view.tabs.append(button);
    });
    view.tabs.addEventListener('keydown', event => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      const ids = Object.keys(view.tabButtons);
      const i = ids.indexOf(view.tab);
      const id = ids[(i + (event.key === 'ArrowRight' ? 1 : ids.length - 1)) % ids.length];
      selectTab(id);
      view.tabButtons[id].focus();
      event.preventDefault();
    });
    g.el.actions.append(view.panel, view.event, view.tabs);
    selectTab('drones');
    g.on('chest', () => g.sfx('chest'));
    g.on('prestige', () => {
      view.second = false;
      view.binary = null;
      stock('stars', 'Новая звезда');
    });
    g.on('offline', report => {
      view.offline = report;
      const away = g.state.run.away;
      if (away) {
        view.awayLines = ['ore', 'ice', 'alloy', 'data'].map(id => label(id) + ': ' + number(away[id]) + ' → ' + number(g.state.run[id]));
        if (away.exps && away.exps.length) view.awayLines.push('Вернулись: ' + away.exps.join('; '));
        if (away.research && away.research.length) view.awayLines.push('Изучено автоматически: ' + away.research.join(', '));
        view.awayLines.push(away.deficit > 0 ? 'Дефицит энергии: ' + g.fmt.time(away.deficit) + '. Потеря пропускной способности равна ' + g.fmt.time(away.deficitLoss) + ' полной работы зданий.' : 'Энергии хватало всем зданиям.');
        view.awayLines.push('Автоматика: +' + number(away.drones) + ' дронов, +' + number(away.levels) + ' уровней зданий.');
        report.events.push.apply(report.events, view.awayLines);
      }
      if (!g.readonly) {
        g.act(state => {
          view.log = view.nextLog || sim.procedural('log', g.rng);
          view.nextLog = null;
          delete state.run.away;
        }, { reason: 'offline' });
        if (view.log) report.events.push((view.log.who ? view.log.who + ': ' : '') + view.log.text);
      }
      if (!g.readonly) g.stock.take('log').then(item => {
        if (item) {
          view.log = item;
          view.nextLog = item;
          g.log((item.who ? item.who + ': ' : '') + item.text);
        }
      }).catch(() => {});
    });
  }

  function selectTab(id) {
    view.tab = id;
    view.updates = [];
    view.panel.replaceChildren();
    view.panel.scrollTop = 0;
    view.panel.setAttribute('aria-labelledby', 'ac-tab-' + id);
    Object.keys(view.tabButtons).forEach(key => {
      const active = key === id;
      view.tabButtons[key].setAttribute('aria-selected', String(active));
      view.tabButtons[key].tabIndex = active ? 0 : -1;
    });
    ({ drones: dronesPanel, buildings: buildingsPanel, science: sciencePanel, expeditions: expeditionsPanel, jump: jumpPanel })[id]();
    if (g.state) render(g.state);
  }

  function dronesPanel() {
    view.panel.append(h('h2', {}, 'Добыча'));
    const colonies = h('div', { class: 'ac-colonies', 'aria-label': 'Колония' });
    ['Колония А', 'Колония Б'].forEach((text, index) => {
      const button = h('button', { class: 'ac-toggle', onclick: () => { view.second = !!index; selectTab('drones'); } }, text);
      button.setAttribute('aria-pressed', String(view.second === !!index));
      colonies.append(button);
    });
    view.panel.append(colonies);
    update(state => { colonies.hidden = !sim.isStar(state, 'binary'); });
    const modes = h('div', { class: 'ac-mode', 'aria-label': 'Количество покупки' });
    [['one', '×1'], ['ten', '×10'], ['mile', 'До вехи'], ['max', 'Макс']].forEach(mode => {
      const button = h('button', { class: 'ac-toggle', onclick: () => { view.mode = mode[0]; selectTab('drones'); } }, mode[1]);
      button.setAttribute('aria-pressed', String(view.mode === mode[0]));
      modes.append(button);
    });
    view.panel.append(modes);
    sim.DRONES.forEach((drone, i) => {
      const item = row(drone.title, '', null, 'drone' + i);
      const count = state => sim.droneCount(state, i, g.config, view.mode, view.second);
      buyButton(item.controls, state => sim.buyDrone(state, i, g.config, count(state), view.second),
        state => ['+' + count(state), g.fmt.price(sim.droneCost(state, i, g.config, count(state), view.second)) + ' руды'],
        state => sim.droneOpen(state, i) && canPay(state, 'ore', sim.droneCost(state, i, g.config, count(state), view.second)));
      update(state => {
        const n = (view.second ? state.run.drones2 : state.run.drones)[i];
        const open = sim.droneOpen(state, i);
        const next = sim.nextMilestone(n, g.config);
        item.heading.textContent = drone.title + ' · ' + number(n);
        item.state(open ? '' : 'locked');
        item.info.textContent = open ? g.fmt.rate(sim.tierRate(state, i, n, g.config, now()) * n * sim.oreMult(state, g.config, now()) * g.links.mult()) + (next ? ' · веха ' + next : ' · все вехи') : 'Нужно: ' + (drone.need ? byId(sim.RESEARCH, drone.need).title : 'предыдущий тир');
      });
    });
    title('Ледоколы', 'res-ice');
    sim.BREAKERS.forEach((breaker, i) => {
      const item = row(breaker.title, '', null, 'breaker' + i);
      const count = state => {
        if (view.mode === 'ten') return 10;
        if (view.mode === 'mile') return Math.max(1, (sim.nextMilestone(state.run.breakers[i], g.config) || state.run.breakers[i] + 1) - state.run.breakers[i]);
        if (view.mode === 'max') return Math.max(1, Big.maxBuy(state.run.ore, Big.mul(g.config['breaker.cost'], Big.pow(g.config['breaker.costGrowth'], i)), g.config['breaker.growth'], state.run.breakers[i]));
        return 1;
      };
      buyButton(item.controls, state => sim.buyBreaker(state, i, g.config, count(state)),
        state => ['+' + count(state), g.fmt.price(sim.breakerCost(state, i, g.config, count(state))) + ' руды'],
        state => sim.breakerOpen(state, i) && canPay(state, 'ore', sim.breakerCost(state, i, g.config, count(state))));
      update(state => {
        item.heading.textContent = breaker.title + ' · ' + number(state.run.breakers[i]);
        item.state(sim.breakerOpen(state, i) ? '' : 'locked');
        item.info.textContent = sim.breakerOpen(state, i) ? 'Добыча льда без расхода энергии' : 'Нужно: ' + (i ? 'предыдущий ледокол' : 'исследование «Лёд»');
      });
    });
    title('Улучшения колонии', 'power');
    const upgrade = row('Мощность добычи', 'Вся добыча руды ×2 за уровень', null, 'power');
    update(state => { upgrade.heading.textContent = 'Мощность добычи · ур. ' + state.run.up; });
    buyButton(upgrade.controls, state => sim.buyUpgrade(state, g.config), state => ['Ур. ' + (state.run.up + 1), g.fmt.price(sim.upgradeCost(state, g.config)) + ' руды'], state => canPay(state, 'ore', sim.upgradeCost(state, g.config)));
    title('Корпуса дронов', 'hull');
    sim.DRONES.forEach((drone, i) => {
      const item = row(drone.title, 'Добыча этого тира ×2 за уровень', null, 'drone' + i);
      item.el.classList.add('ac-row-hull');
      buyButton(item.controls, state => sim.buyHull(state, i, g.config), state => ['Ур. ' + (state.run.hulls[i] + 1), g.fmt.price(sim.hullCost(state, i, g.config)) + ' сплавов'], state => sim.has(state, 'smelt') && canPay(state, 'alloy', sim.hullCost(state, i, g.config)));
      update(state => {
        const smelt = sim.has(state, 'smelt');
        item.el.hidden = state.run.drones[i] + state.run.drones2[i] === 0;
        item.heading.textContent = 'Корпус: ' + drone.title + ' · ур. ' + state.run.hulls[i];
        item.state(smelt ? '' : 'locked');
        item.info.textContent = smelt ? 'Добыча этого тира ×2 за уровень' : 'Нужно: Плавка';
      });
    });
    title('Автоматика', 'dispatch');
    const auto = row('Диспетчер', 'Покупает дронов автоматически', null, 'dispatch');
    update(state => {
      const open = sim.has(state, 'dispatch');
      auto.state(open ? (state.run.auto.dispatch ? 'done' : '') : 'locked');
      auto.info.textContent = open ? 'Покупает дронов автоматически' : 'Нужно: Диспетчер дронов';
    });
    toggle(auto.controls, 'Авто', state => state.run.auto.dispatch, (state, value) => { state.run.auto.dispatch = value; }, state => sim.has(state, 'dispatch'));
    const wear = row('Ремонт дронов', '', null, 'repair');
    buyButton(wear.controls, state => sim.repair(state, g.config), state => ['Ремонт', g.fmt.price(sim.repairCost(state, g.config)) + ' сплавов'], state => state.run.wear > 0 && canPay(state, 'alloy', sim.repairCost(state, g.config)));
    update(state => {
      wear.el.hidden = !sim.isStar(state, 'neutron');
      wear.info.textContent = 'Износ ' + g.fmt.pct(state.run.wear);
    });
  }

  function buildingsPanel() {
    view.panel.append(h('h2', {}, 'Энергия и цепочки'));
    const panel = row('Солнечные панели', '', null, 'panels');
    buyButton(panel.controls, state => sim.buyPanel(state, g.config), state => ['Ур. ' + (state.run.panels + 1), g.fmt.price(sim.panelCost(state, g.config)) + ' руды'], state => canPay(state, 'ore', sim.panelCost(state, g.config)));
    update(state => { panel.info.textContent = 'Уровень ' + state.run.panels + ' · множитель звезды ' + g.fmt.mult(sim.starMult(state, g.config, 'panels')); });
    const reactor = row('Реактор', 'Энергия независимо от звезды', null, 'reactor');
    update(state => {
      const open = sim.has(state, 'reactor');
      reactor.heading.textContent = 'Реактор · ' + state.run.reactor;
      reactor.state(open ? '' : 'locked');
      reactor.info.textContent = open ? 'Энергия независимо от звезды' : 'Откройте в науке';
    });
    buyButton(reactor.controls, state => sim.buyReactor(state, g.config), state => ['Ур. ' + (state.run.reactor + 1), g.fmt.price(sim.reactorCost(state, g.config)) + ' руды'], state => sim.has(state, 'reactor') && canPay(state, 'ore', sim.reactorCost(state, g.config)));
    const peak = row('Импульс пульсара', '', null, 'peak');
    buyButton(peak.controls, state => sim.tapPeak(state, g.config, now()), () => ['Поймать пик', '×2 энергии'], state => sim.pulse(state, g.config, now(), false) >= g.config['star.pulsar.peak']);
    update(state => {
      peak.el.hidden = !sim.isStar(state, 'pulsar');
      peak.info.textContent = 'Текущая волна ' + g.fmt.mult(sim.pulse(state, g.config, now(), false));
    });
    title('Цепочки', 'factory');
    sim.BUILDINGS.forEach(building => {
      const item = row(building.title, '', null, 'b-' + building.id);
      buyButton(item.controls, state => sim.buyBuilding(state, building.id, g.config), state => ['Ур. ' + (state.run.b[building.id] + 1), g.fmt.price(sim.buildingCost(state, building.id, g.config)) + ' руды'], state => sim.buildingOpen(state, building.id) && canPay(state, 'ore', sim.buildingCost(state, building.id, g.config)));
      toggle(item.controls, 'Работа', state => !state.run.off[building.id], (state, value) => { state.run.off[building.id] = !value; }, state => state.run.b[building.id] > 0);
      update(state => {
        const level = state.run.b[building.id];
        const open = sim.buildingOpen(state, building.id);
        item.heading.textContent = building.title + ' · ' + level;
        item.state(open ? (state.run.off[building.id] && level > 0 ? 'off' : '') : 'locked');
        item.info.textContent = building.text + '. ' + (open ? 'Выход ' + number(state.run.flow[building.to]) + '/с · ' + number(sim.consumption(building.id, level, g.config)) + ' энергии' : 'Откройте в науке');
      });
    });
    title('Колония', 'dome');
    const dome = row('Купол', '', null, 'dome');
    update(state => {
      dome.heading.textContent = 'Купол · ' + state.run.dome;
      dome.state(sim.has(state, 'dome') ? '' : 'locked');
    });
    buyButton(dome.controls, state => sim.buyDome(state, g.config), state => ['Ур. ' + (state.run.dome + 1), g.fmt.price(sim.domeCost(state, g.config)) + ' сплавов'], state => sim.has(state, 'dome') && canPay(state, 'alloy', sim.domeCost(state, g.config)));
    update(state => { dome.info.textContent = !sim.has(state, 'dome') ? 'Откройте в науке' : number(state.run.colonists) + ' / ' + number(sim.domeCap(state, g.config)) + ' колонистов · доход ' + g.fmt.mult(sim.colonistMult(state, g.config)) + (state.run.flow.fed < 1 ? ' · не хватает воды' : ''); });
    const hangar = row('Ангар экспедиций', '', null, 'hangar');
    update(state => { hangar.state(sim.has(state, 'electro') ? '' : 'locked'); });
    buyButton(hangar.controls, state => sim.buyHangar(state, g.config), state => ['Ур. ' + (state.run.hangar + 1), g.fmt.price(sim.hangarCost(state, g.config)) + ' руды'], state => sim.has(state, 'electro') && canPay(state, 'ore', sim.hangarCost(state, g.config)));
    update(state => { hangar.info.textContent = sim.has(state, 'electro') ? 'Катеров одновременно: ' + state.run.hangar : 'Нужно: Электролиз'; });
    const auto = row('Автоплавка', 'Улучшает здания при избытке энергии', null, 'autosmelt');
    update(state => { auto.state(sim.has(state, 'autosmelt') ? (state.run.auto.smelt ? 'done' : '') : 'locked'); });
    toggle(auto.controls, 'Авто', state => state.run.auto.smelt, (state, value) => { state.run.auto.smelt = value; }, state => sim.has(state, 'autosmelt'));
    view.panel.append(note('Выключите ненужное здание, чтобы направить энергию в другую цепочку. Дроны энергии не расходуют.'));
  }

  function sciencePanel() {
    view.panel.append(h('h2', {}, 'Исследования'), note('Плавка + Лёд открывают фабрику и лабораторию. Данные запускают следующие ветки. Очередь работает и в отсутствие.'));
    const queue = h('span', {});
    view.panel.append(h('div', { class: 'ac-note ac-queue' }, art('queue', 'ac-pic-small'), queue));
    update(state => { queue.textContent = state.run.queue.length ? 'Очередь: ' + state.run.queue.map(id => byId(sim.RESEARCH, id).title).join(' → ') : 'Очередь пуста'; });
    sim.RESEARCH.forEach(research => {
      const item = row(research.title, research.text, null, 'r-' + research.id);
      buyButton(item.controls, state => sim.research(state, research.id, g.config), state => [sim.has(state, research.id) ? 'Изучено' : 'Изучить', sim.has(state, research.id) ? '' : g.fmt.price(sim.researchCost(state, research.id, g.config)) + (research.cur === 'ore' ? ' руды' : ' данных')], state => sim.researchOpen(state, research.id) && canPay(state, research.cur, sim.researchCost(state, research.id, g.config)));
      const enqueue = h('button', { class: 'ac-toggle', onclick: () => act(state => {
        const index = state.run.queue.indexOf(research.id);
        if (index >= 0) { state.run.queue.splice(index, 1); return true; }
        return sim.enqueue(state, research.id);
      }, 'tap') });
      item.controls.append(enqueue);
      update(state => {
        const done = sim.has(state, research.id);
        const queued = state.run.queue.indexOf(research.id);
        enqueue.hidden = done;
        enqueue.disabled = g.readonly;
        enqueue.textContent = queued >= 0 ? 'Убрать №' + (queued + 1) : 'В очередь';
        enqueue.setAttribute('aria-pressed', String(queued >= 0));
        item.heading.classList.toggle('ac-ready', done);
        item.state(done ? 'done' : sim.researchOpen(state, research.id) ? '' : 'locked');
        const parents = research.after.filter(id => !sim.has(state, id)).map(id => byId(sim.RESEARCH, id).title);
        item.info.textContent = research.text + (parents.length ? '. Нужно: ' + parents.join(', ') : '');
      });
    });
  }

  function expeditionsPanel() {
    view.panel.append(h('h2', {}, 'Экспедиции'));
    const status = h('div', { class: 'ac-note' });
    const arrivals = h('div', {});
    const flights = h('div', {});
    view.panel.append(status, arrivals, flights);
    let containerKey = '';
    let flightKey = '';
    let flightViews = [];
    update(state => {
      status.textContent = 'Катера: ' + state.run.exps.length + ' / ' + state.run.hangar + ' · контейнеров: ' + state.run.containers.length;
      const key = state.run.containers.map(c => c.at + ':' + c.k + ':' + c.ore).join('|');
      if (containerKey !== key) {
        containerKey = key;
        arrivals.replaceChildren();
        state.run.containers.forEach((container, index) => {
          const sample = container.sample ? byId(sim.SAMPLES, container.sample) : null;
          const item = row(container.title, '+' + number(container.ore) + ' руды' + (container.ice ? ', +' + number(container.ice) + ' льда' : '') + (sample ? ', ' + sample.title : '') + (container.dm ? ', +ТМ' : ''), arrivals, 'container');
          item.state('done');
          item.controls.append(h('button', { class: 'ac-buy', disabled: g.readonly, onclick: () => {
            const loot = act(s => sim.takeContainer(s, index), 'chest');
            if (loot) g.flash('chest', 'Контейнер получен', sample ? sample.title : '+' + number(loot.ore) + ' руды');
          } }, 'Забрать'));
        });
      }
      const fk = state.run.exps.map(e => e.from + ':' + e.until).join('|');
      if (flightKey !== fk) {
        flightKey = fk;
        flights.replaceChildren();
        flightViews = state.run.exps.map(expedition => {
          const item = row(sim.EXPEDITIONS[expedition.k].title, '', flights, 'flight');
          const fill = h('i', {});
          item.body.append(h('div', { class: 'ac-progress' }, fill));
          return { item, fill, expedition };
        });
      }
      flightViews.forEach(entry => {
        entry.item.info.textContent = 'Возвращение через ' + g.fmt.time(Math.max(0, entry.expedition.until - now()) / 1000);
        entry.fill.style.width = Math.min(100, Math.max(0, (now() - entry.expedition.from) / (entry.expedition.until - entry.expedition.from) * 100)) + '%';
      });
    });
    sim.EXPEDITIONS.forEach((expedition, index) => {
      const item = row(expedition.title, '', null, 'exp' + index);
      buyButton(item.controls, state => sim.expedition(state, index, g.config, now()), state => ['Отправить', g.fmt.price(sim.expFuel(state, index, g.config)) + ' топлива'], state => sim.expOpen(state, index) && state.run.exps.length < state.run.hangar && canPay(state, 'fuel', sim.expFuel(state, index, g.config)));
      update(state => { item.state(sim.expOpen(state, index) ? '' : 'locked'); item.info.textContent = g.fmt.time(sim.expMinutes(state, index, g.config) * 60) + ' · ' + (sim.expOpen(state, index) ? 'руда, образцы, шанс ТМ' : 'Нужно: ' + (expedition.far ? 'Дальняя связь' : 'Электролиз')); });
    });
    const tools = h('div', { class: 'ac-tools' });
    view.panel.append(tools);
    const fuel = tool(tools, 'Шаги → топливо', spendFuel);
    update(() => { fuel.textContent = 'Шаги → топливо · ' + number(g.links.energy()) + ' эн.'; fuel.disabled = g.readonly || stockBusy; });
    tool(tools, 'Образцы', samplesSheet);
    tool(tools, 'Журнал колонии', () => stock('log', 'Журнал колонии'));
    const away = tool(tools, 'Отчёт отсутствия', awaySheet);
    update(() => { away.hidden = !view.awayLines; });
    view.panel.append(note('Катера летят по реальному времени. Вернувшиеся контейнеры ждут, пока вы их заберёте.'));
  }

  function jumpPanel() {
    view.panel.append(h('h2', {}, 'К новой звезде'));
    const star = row('', '', null, 'star-yellow');
    const dmRow = row('Тёмная материя', 'Даёт прыжок к новой звезде. Тратится на мета-улучшения', null, 'res-dm');
    const beaconRow = row('Маяки', 'Даёт «Карта скопления». Тратятся на станции', null, 'res-beacon');
    let starPic = '';
    update(state => {
      const current = sim.star(state);
      if (starPic !== current.id) {
        starPic = current.id;
        star.el.replaceChild(art('star-' + current.id), star.el.firstChild);
      }
      star.heading.textContent = 'Звезда ' + current.n + ': ' + current.title;
      star.info.textContent = current.text + ' · офлайн ' + g.fmt.pct(sim.offlineRate(state, g.config));
      dmRow.heading.textContent = 'Тёмная материя · ' + number(sim.dm(state));
      beaconRow.heading.textContent = 'Маяки · ' + number(sim.beacons(state));
    });
    const engine = row('Прыжковый двигатель', '', null, 'engine');
    update(state => { engine.state(state.run.engine ? 'done' : sim.has(state, 'jump') ? '' : 'locked'); });
    buyButton(engine.controls, state => sim.buildEngine(state, g.config), state => [state.run.engine ? 'Готов' : 'Построить', ''], state => !state.run.engine && sim.engineReady(state, g.config));
    update(state => { engine.info.textContent = state.run.engine ? 'Колония готова к прыжку' : (sim.has(state, 'jump') ? 'Теория изучена' : 'Нужна Прыжковая теория') + ' · ' + number(state.run.fuel) + ' / ' + number(g.config['engine.fuel']) + ' топлива · ' + number(state.run.alloy) + ' / ' + number(g.config['engine.alloy']) + ' сплавов'; });
    const jumpInfo = h('p', { class: 'ac-note' });
    view.panel.append(jumpInfo, g.ui.prestigeButton(sim.JUMP, { label: 'Прыжок к новой звезде', primary: true }));
    update(state => { jumpInfo.textContent = 'Добыто за колонию: ' + number(state.run.mined) + ' руды. Работают цепочки: ' + sim.chains(state) + ' / ' + sim.BUILDINGS.length + '. ТМ за прыжок: ' + number(sim.prestigeGain(state, sim.JUMP, g.config)); });
    title('Мета-улучшения за ТМ', 'res-dm');
    sim.META.forEach(meta => {
      const item = row(meta.title, meta.text, null, 'meta-' + meta.id);
      update(state => {
        const level = sim.lvl(state, meta.id);
        const max = sim.metaMax(meta.id, g.config);
        item.heading.textContent = meta.title + ' · ур. ' + level + (isFinite(max) ? ' из ' + max : '');
        item.state(level >= max ? 'done' : '');
      });
      buyButton(item.controls, state => sim.buyMeta(state, meta.id, g.config), state => [sim.lvl(state, meta.id) >= sim.metaMax(meta.id, g.config) ? 'Максимум' : 'Ур. ' + (sim.lvl(state, meta.id) + 1), sim.lvl(state, meta.id) >= sim.metaMax(meta.id, g.config) ? '' : number(sim.metaCost(state, meta.id, g.config)) + ' ТМ'], state => sim.lvl(state, meta.id) < sim.metaMax(meta.id, g.config) && Big.gte(sim.dm(state), sim.metaCost(state, meta.id, g.config)));
    });
    title('Карта скопления', 'cluster');
    view.panel.append(note('После 10-й звезды можно обменять пройденный путь на маяки. Сбросятся колония, ТМ и мета. Станции и образцы останутся.'), g.ui.prestigeButton(sim.CLUSTER, { label: 'Карта скопления' }));
    sim.STATIONS.forEach(station => {
      const item = row(station.title, station.text, null, 'st-' + station.id);
      update(state => { item.heading.textContent = station.title + ' · ур. ' + sim.station(state, station.id); });
      buyButton(item.controls, state => sim.buyStation(state, station.id, g.config), state => ['Ур. ' + (sim.station(state, station.id) + 1), number(sim.stationCost(state, station.id, g.config)) + ' маяков'], state => Big.gte(sim.beacons(state), sim.stationCost(state, station.id, g.config)));
    });
    const tools = h('div', { class: 'ac-tools' });
    view.panel.append(tools);
    tool(tools, 'Атлас звёзд', atlasSheet);
    tool(tools, 'Образцы', samplesSheet);
    tool(tools, 'Ачивки', () => g.ui.achievements());
    tool(tools, 'Журнал', () => stock('log', 'Журнал колонии'));
    const away = tool(tools, 'Отчёт отсутствия', awaySheet);
    update(() => { away.hidden = !view.awayLines; });
    tool(tools, 'Ставка на день', () => Game.ui.betSheet(g.id));
  }

  async function spendFuel() {
    if (stockBusy || g.readonly) return;
    stockBusy = true;
    try {
      const result = await g.links.spend('fuel');
      if (result.ok) {
        g.act(state => sim.stepFuel(state, g.config), { now: true, reason: 'spend' });
        g.sfx('chest');
        g.buzz('chest');
        g.flash('energy', 'Топливо получено', 'Хватит на одну 20-минутную экспедицию');
      } else g.flash('steps', result.off ? 'Связка «Шаги» выключена' : 'Недостаточно энергии шагов', result.error || '');
    } finally { stockBusy = false; g.redraw(); }
  }

  function samplesSheet() {
    const content = h('div', { class: 'ac-sheet' }, h('h2', {}, 'Образцы'), note('Бонус каждого найденного образца действует навсегда. Повторы остаются в коллекции.'));
    sim.SAMPLES.forEach(sample => {
      const count = g.state.meta.samples[sample.id] || 0;
      const details = view.catalog && byId(view.catalog.SAMPLES || [], sample.id);
      const pct = g.config['sample.' + sample.id + '.pct'] === undefined ? sample.pct : g.config['sample.' + sample.id + '.pct'];
      sheetRow(content, 's-' + sample.id, sample.title + (count ? ' · ' + count : ' · не найден'), '+' + pct + '% ' + sim.KIND[sample.kind] + (details && details.description ? '. ' + details.description : ''), count ? 'done' : 'locked');
    });
    tool(content, 'История образца', () => stock('samples', 'Находка геолога'));
    g.sheet(content);
  }

  function awaySheet() {
    if (!view.awayLines) return;
    const content = h('div', { class: 'ac-sheet' }, h('h2', { class: 'ac-sheet-head' }, art('away', 'ac-pic-small'), 'Пока вас не было'));
    view.awayLines.forEach(text => content.append(h('p', {}, text)));
    if (view.log) content.append(h('p', {}, (view.log.who ? view.log.who + ': ' : '') + view.log.text));
    g.sheet(content);
  }

  function atlasSheet() {
    const content = h('div', { class: 'ac-sheet' }, h('h2', {}, 'Атлас звёзд'));
    sim.STARS.forEach((star, index) => {
      const visited = Object.keys(g.state.meta.atlas || {}).some(key => g.state.meta.atlas[key] === star.id);
      sheetRow(content, 'star-' + star.id, (index + 1) + '. ' + star.title + (visited ? ' · посещена' : ''), star.text, visited ? 'done' : 'locked');
    });
    Object.keys(g.state.meta.atlas || {}).filter(key => Number(key) > sim.STARS.length).sort((a, b) => Number(a) - Number(b)).forEach(key => {
      const star = byId(sim.STARS, g.state.meta.atlas[key]);
      if (star) sheetRow(content, 'star-' + star.id, key + '. ' + star.title, 'Посещена · удвоенное правило: ' + star.text, 'done');
    });
    content.append(note('Начиная с десятой звезды встречаются знакомые правила, усиленные вдвое.'));
    tool(content, 'Запись астронома', () => stock('stars', 'Запись астронома'));
    g.sheet(content);
  }

  async function stock(kind, heading) {
    if (g.readonly) return;
    try {
      const item = await g.stock.take(kind);
      if (!item) return;
      const content = h('div', { class: 'ac-sheet' }, h('h2', { class: 'ac-sheet-head' }, art(kind === 'stars' ? 'cluster' : kind === 'samples' ? 's-chondrite' : 'log', 'ac-pic-small'), item.title || heading), h('p', {}, (item.who ? item.who + ': ' : '') + item.text));
      content.append(note('Запас записей: ' + g.stock.count(kind) + (g.stock.preparing(kind) ? ' · пополняется при связи' : '')));
      g.sheet(content);
    } catch (error) { g.flash('map', heading, 'Запись пока недоступна'); }
  }

  function renderEvent(state) {
    const event = state.run.event;
    view.event.hidden = !event || event.until <= now();
    if (view.event.hidden) { view.eventId = null; return; }
    const definition = byId(sim.EVENTS, event.id);
    if (!definition) { view.event.hidden = true; return; }
    const key = event.id + ':' + event.until;
    if (view.eventId !== key) {
      view.eventId = key;
      view.event.replaceChildren();
      view.eventCountdown = h('span', {});
      const buttons = h('div', { class: 'ac-event-actions' });
      const choose = choice => {
        const result = act(s => sim.eventTake(s, g.config, choice, now(), g.rng), 'tap');
        if (result) g.flash('sparkle', definition.title, result);
      };
      const main = h('button', { class: 'ac-toggle', onclick: () => choose(0), disabled: g.readonly }, definition.take);
      view.eventMain = main;
      buttons.append(main);
      if (definition.skip) buttons.append(h('button', { class: 'ac-toggle', onclick: () => choose(1), disabled: g.readonly }, definition.skip));
      view.event.append(h('div', { class: 'ac-event-top' }, art('ev-' + event.id), h('div', { class: 'ac-row-body' }, h('div', { class: 'ac-event-head' }, h('strong', {}, definition.title), view.eventCountdown), h('p', { class: 'ac-event-text' }, definition.text))), buttons);
      const flavor = h('p', { class: 'ac-event-flavor', hidden: true });
      view.event.append(flavor);
      view.eventFlavors = view.eventFlavors || {};
      const showFlavor = () => {
        const item = view.eventFlavors[event.id];
        if (view.eventId !== key || !item) return;
        flavor.textContent = item.text;
        flavor.hidden = false;
      };
      showFlavor();
      if (!g.readonly) g.stock.take('events').then(item => {
        if (item && item.id) view.eventFlavors[item.id] = item;
        showFlavor();
      }).catch(() => {});
      if (!g.readonly) g.sfx('alarm');
    }
    view.eventCountdown.textContent = Math.ceil(Math.max(0, event.until - now()) / 1000) + ' с';
    if (event.id === 'fault') {
      const tier = sim.topTier(state);
      const price = Math.max(g.config['event.fault.min'], sim.hullCost(state, Math.max(0, tier), g.config) * g.config['event.fault.share']);
      view.eventMain.textContent = 'Ремонт · ' + number(price) + ' сплавов';
      view.eventMain.disabled = g.readonly || tier < 0 || !canPay(state, 'alloy', price);
    }
  }

  function render(state) {
    if (!g || !view.energy) return;
    const time = now();
    const star = sim.star(state);
    const r = state.run;
    const binary = sim.isStar(state, 'binary');
    if (!binary) view.second = false;
    view.ore.textContent = g.fmt.live(r.ore);
    view.rate.textContent = g.fmt.rate(sim.oreRate(state, g.config, time) * g.links.mult());
    const unlocked = { ice: sim.has(state, 'ice'), alloy: sim.has(state, 'smelt'), water: sim.has(state, 'purify'), fuel: sim.has(state, 'electro'), chip: sim.has(state, 'ice') && sim.has(state, 'smelt'), data: sim.has(state, 'ice') && sim.has(state, 'smelt') };
    Object.keys(view.resources).forEach(id => {
      view.resources[id].el.hidden = !unlocked[id] && !Big.gt(r[id] || 0, 0);
      view.resources[id].count.textContent = number(r[id]);
    });
    view.colonists.hidden = !r.dome;
    view.colonistsText.textContent = number(r.colonists) + ' / ' + number(sim.domeCap(state, g.config));
    const production = sim.energyProd(state, g.config, time, false);
    const demand = sim.energyUse(state, g.config);
    const share = sim.energyShare(state, g.config, time, false);
    if (view.world) view.world.update(ColonyScene.model(state, g.config, view.catalog, {
      star, share, power: production, demand, oreRate: sim.oreRate(state, g.config, time),
      flare: sim.flareFree(state, g.config, time - 1, time) > 0
    }));
    view.energy.classList.toggle('ac-deficit', share < 1);
    view.energyText.textContent = 'Энергия ' + number(production) + ' / ' + number(demand);
    view.energyShare.textContent = demand ? g.fmt.pct(share) + ' работы' : 'нет расхода';
    view.energyFill.style.width = Math.max(0, Math.min(100, share * 100)) + '%';
    view.starTitle.textContent = star.title;
    view.starCount.textContent = 'Звезда ' + star.n;
    view.rule.textContent = star.text;
    view.rocks[1].el.style.display = binary ? '' : 'none';
    if (view.sunId !== star.id) {
      view.sunId = star.id;
      view.sun.replaceChildren(art('star-' + star.id, 'ac-pic-bare'));
    }
    view.rocks.forEach((rock, index) => {
      const drones = index ? r.drones2 : r.drones;
      const count = drones.reduce((a, b) => a + b, 0);
      rock.caption.textContent = binary ? (index ? 'Б' : 'А') + ' · ' + number(count) + ' дронов' : '';
      rock.dots.forEach((dot, i) => { dot.style.display = i < Math.min(16, count) ? '' : 'none'; });
      rock.blocks.forEach((block, i) => { block.style.opacity = r.b[sim.BUILDINGS[i].id] > 0 ? '1' : '.16'; });
    });
    renderFlow(state);
    renderEvent(state);
    if (view.world) g.el.app.classList.toggle('ac-world-event', !view.event.hidden);
    view.updates.forEach(fn => fn(state));
    if (time - lastAchievementCheck > 1000 && !g.readonly) {
      lastAchievementCheck = time;
      if (sim.achievements) sim.achievements(state, g.config).forEach(id => g.achieve(id));
      else {
        const earned = [[r.b.smelter > 0, sim.ACH.smelter], [sim.chains(state) === 5, sim.ACH.chain], [r.colonists >= 100, sim.ACH.hundred], [r.calmSec >= 3600, sim.ACH.calm], [state.meta.jumps > 0, sim.ACH.jump], [state.meta.bestStar >= 5, sim.ACH.five], [state.meta.bestStar >= 6, sim.ACH.binary], [sim.SAMPLES.every(x => state.meta.samples[x.id]), sim.ACH.collector]];
        earned.forEach(pair => { if (pair[0]) g.achieve(pair[1]); });
      }
    }
  }

  function svgElement(name, attributes, text) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', name);
    Object.keys(attributes || {}).forEach(key => el.setAttribute(key, attributes[key]));
    if (text) el.textContent = text;
    return el;
  }

  function makeAsteroid(name) {
    const svg = svgElement('svg', { viewBox: '0 0 320 160', class: 'ac-rock', role: 'img', 'aria-label': 'Астероид колонии ' + name });
    svg.append(svgElement('ellipse', { cx: 160, cy: 80, rx: 141, ry: 46, class: 'ac-orbit' }));
    svg.append(svgElement('path', { d: 'M63 75 84 54 118 48 135 53 172 41 206 53 239 60 259 83 243 108 216 120 181 127 149 118 115 124 82 108 64 91Z', class: 'ac-rock-body' }));
    svg.append(svgElement('path', { d: 'M84 54 118 48 135 53 172 41 206 53 181 85 147 69 106 81Z', class: 'ac-rock-light' }));
    svg.append(svgElement('path', { d: 'M82 108 106 81 115 124ZM181 127 181 85 216 120ZM243 108 214 93 259 83Z', class: 'ac-rock-dark' }));
    svg.append(svgElement('path', { d: 'm84 54 22 27 41-12 34 16 25-32m-100 28 9 43m32-55 2 49m32-33 35 35m-35-35 58-25M82 108l24-27m75 46 0-42m62 23-29-15 25-33', class: 'ac-rock-detail' }));
    [[128, 97, 9, 4], [200, 101, 7, 3], [163, 107, 5, 2.2], [229, 78, 6, 2.6], [96, 92, 4, 1.8]].forEach(c => svg.append(svgElement('ellipse', { cx: c[0], cy: c[1], rx: c[2], ry: c[3], class: 'ac-crater' })));
    const blocks = [];
    for (var i = 0; i < 5; i++) {
      const x = 100 + i * 26;
      const y = 40 - (i % 2) * 5;
      const block = svgElement('path', { d: 'M' + x + ' ' + (y + 11) + 'v-16h16v16m-12-11h8m-8 5h8', class: 'ac-building-block' });
      svg.append(block);
      blocks.push(block);
    }
    svg.append(svgElement('path', { d: 'M139 44v-13a15 15 0 0 1 30 0v10M139 31h30m-15-15v28', class: 'ac-building-block' }));
    const swarm = svgElement('g', {});
    const dots = [];
    for (var i = 0; i < 16; i++) {
      const angle = i / 16 * Math.PI * 2;
      const dot = svgElement('circle', { cx: 160 + Math.cos(angle) * (122 + i % 3 * 6), cy: 80 + Math.sin(angle) * (41 + i % 2 * 6), r: i % 3 === 0 ? 2.6 : 1.7, class: 'ac-drone-dot' });
      swarm.append(dot);
      dots.push(dot);
    }
    svg.append(swarm);
    const caption = h('div', { class: 'ac-colony-label' });
    const el = h('div', { class: 'ac-colony' }, svg, caption);
    return { el, svg, dots, blocks, caption };
  }

  /** The sky behind the asteroids: the same scatter of stars every time. */
  function makeSky() {
    const svg = svgElement('svg', { viewBox: '0 0 360 130', class: 'ac-sky', preserveAspectRatio: 'xMidYMid slice', 'aria-hidden': 'true' });
    let seed = 7;
    const next = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 28; i++) svg.append(svgElement('circle', { cx: (next() * 360).toFixed(1), cy: (next() * 130).toFixed(1), r: (0.4 + next() * 0.9).toFixed(2), class: i % 7 === 0 ? 'ac-sky-warm' : i % 5 === 0 ? 'ac-sky-cold' : 'ac-sky-dot' }));
    return svg;
  }

  function makeFlow() {
    const root = h('div', { class: 'ac-flow' }, h('div', { class: 'ac-flow-title' }, 'Потоки производства'));
    const svg = svgElement('svg', { viewBox: '0 0 330 262', class: 'ac-chain-svg', role: 'img', 'aria-label': 'Схема производственных цепочек' });
    const defs = svgElement('defs', {});
    [['ac-arrow', '#a4c5ae'], ['ac-arrow-deficit', '#e6a39b']].forEach(arrow => {
      const marker = svgElement('marker', { id: arrow[0], viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 5, markerHeight: 5, orient: 'auto-start-reverse', markerUnits: 'userSpaceOnUse' });
      marker.append(svgElement('path', { d: 'M0 0 10 5 0 10Z', fill: arrow[1] }));
      defs.append(marker);
    });
    svg.append(defs);
const nodes = { ore: [0, 8], alloy: [123, 8], chip: [123, 107], data: [246, 107], ice: [0, 206], water: [123, 206], fuel: [246, 206] };
    view.flows = {};
    [['smelter', 'M84 33H123', 103, 76, 'alloy'], ['factory', 'M165 58V107', 205, 88, 'chip'], ['lab', 'M207 132H246', 227, 176, 'data'], ['purifier', 'M84 231H123', 103, 199, 'water'], ['electro', 'M207 231H246', 227, 199, 'fuel'], ['ice-factory', 'M42 206V132H123', 48, 172, 'chip']].forEach(edge => {
      const path = svgElement('path', { d: edge[1], class: 'ac-chain-path', 'stroke-width': 1, 'marker-end': 'url(#ac-arrow)' });
      const text = svgElement('text', { x: edge[2], y: edge[3], class: 'ac-chain-rate' });
      svg.append(path, text);
      view.flows[edge[0]] = { path, text, resource: edge[4] };
    });
    Object.keys(nodes).forEach(key => {
      const node = nodes[key];
      const picture = new DOMParser().parseFromString(window.AcArt.svg('res-' + key), 'image/svg+xml').documentElement;
      [['x', node[0] + 31], ['y', node[1] + 5], ['width', 22], ['height', 22]].forEach(pair => picture.setAttribute(pair[0], pair[1]));
      svg.append(svgElement('rect', { x: node[0], y: node[1], width: 84, height: 50, rx: 8 }), picture, svgElement('text', { x: node[0] + 42, y: node[1] + 43, 'text-anchor': 'middle', class: 'ac-chain-name' }, label(key)));
    });
    root.append(svg, note('Толщина линии — текущий поток. Красный пунктир — нехватка сырья или энергии.'));
    return root;
  }

  function renderFlow(state) {
    if (!view.flows) return;
    Object.keys(view.flows).forEach(id => {
      const edge = view.flows[id];
      const building = id === 'ice-factory' ? 'factory' : id;
      const rate = state.run.flow[edge.resource] || 0;
      const active = state.run.b[building] > 0 && !state.run.off[building];
      let expected = sim.throughput(building, state.run.b[building], g.config) * sim.timeMult(state, g.config) * sim.colonistMult(state, g.config);
      if (building === 'lab') expected *= g.config['b.lab.ratio'] * sim.starMult(state, g.config, 'data') * sim.sampleBonus(state, 'data', g.config) * Math.pow(g.config['station.lab.mult'], sim.station(state, 'lab'));
      else expected /= g.config['b.' + building + '.ratio'];
      if (building === 'smelter') expected *= sim.sampleBonus(state, 'alloy', g.config);
      if (building === 'factory' && sim.has(state, 'chips')) expected *= g.config['chips.mult'];
      if ((state.run.buffs.dust || 0) > now()) expected *= g.config['event.dust.buildings'];
      const deficit = active && (!state.run.work[building] || state.run.flow.share < .999 || Big.lt(rate, expected * .995));
      edge.path.setAttribute('stroke-width', String(active && Big.gt(rate, 0) ? Math.min(7, 1.5 + Math.max(0, Big.log10(Big.add(rate, 1)))) : 1));
      edge.path.classList.toggle('deficit', !!deficit);
      edge.path.setAttribute('marker-end', deficit ? 'url(#ac-arrow-deficit)' : 'url(#ac-arrow)');
      edge.path.style.opacity = active ? '1' : '.25';
      edge.text.textContent = id === 'ice-factory' ? '' : number(rate) + '/с';
    });
  }

  function animate(state, game, dt) {
    if (view.world) return;
    if (reducedMotion || !view.rocks.length) return;
    view.phase = (view.phase || 0) + dt * .14;
    view.rocks.forEach((rock, colony) => rock.dots.forEach((dot, i) => {
      const angle = i / 16 * Math.PI * 2 + view.phase * (colony ? -.8 : 1);
      dot.setAttribute('cx', String(160 + Math.cos(angle) * (122 + i % 3 * 6)));
      dot.setAttribute('cy', String(80 + Math.sin(angle) * (41 + i % 2 * 6)));
    }));
  }

  // The shared sim has embedded fallbacks. Enrich the same array objects before boot so
  // browser procedural stock and the background JSON-backed sim use identical records.
  try {
    const response = await fetch('../content/catalog.json');
    if (response.ok) {
      const catalog = await response.json();
      view.catalog = catalog;
      window.ColonyContent = catalog;
      Object.keys(catalog).forEach(key => {
        if (!Array.isArray(catalog[key]) || !Array.isArray(sim[key])) return;
        sim[key].forEach((item, index) => {
          const canonical = item.id ? byId(catalog[key], item.id) : catalog[key][index];
          if (canonical) Object.assign(item, canonical);
        });
      });
    }
  } catch (error) {
    // Embedded gameplay data remains available if a local catalog cannot be read.
  }
  await Game.start({ sim, init: build, render, animate });
})();
