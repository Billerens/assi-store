/* Eight small worlds; the engine owns time, saves, links and prestige. */
(async function () {
  'use strict';
  const h = ui.h;
  const sim = window.GameSim;
  const Art = window.EvoArt;
  const Scenes = window.EvoScenes;
  const view = {};
  const palette = ['#b9ad91', '#99b9ac', '#a8b798', '#91b6bd', '#b4bc91', '#c3a68e', '#a6afc2', '#b7acd0'];
  let g;
  let content;
  let builtStage = 0;
  let selectedHex = 0;
  let choiceKey = '';
  let sceneKey = '';
  let sceneInfoKey = '';
  let sheetUpdate = null;
  let chronicle = '';
  let stockBusy = false;

  function textNode(tag, className, text) {
    return h(tag, { class: className }, text || '');
  }
  function find(list, id) {
    return (list || []).find(item => item.id === id);
  }
  function title(item, fallback) {
    return item ? item.title || item.name || fallback : fallback;
  }
  function context() {
    return { now: Date.now(), config: g.config, rng: g.rng, mult: g.links.mult(), offline: false };
  }
  function invoke(fn, sound) {
    const result = g.act(fn, { now: true, reason: 'action' });
    g.sfx(result === false ? 'deny' : sound || 'buy');
    g.buzz(result === false ? 'deny' : sound || 'buy');
    return result;
  }
  function button(label, callback, className) {
    return h('button', { type: 'button', class: 'g-btn ' + (className || ''), onclick: callback }, label);
  }
  function note(text) {
    return textNode('p', 'g-note ev-note', text);
  }
  function money() {
    return g.state.layers.universe.currency;
  }
  function mutations() {
    return sim.availableMutations ? sim.availableMutations(g.state) : content.mutations;
  }
  function constants() {
    return sim.availableConstants ? sim.availableConstants(g.state) : content.constants;
  }
  function detail(item) {
    if (!item) return '';
    const saved = g.state.meta.descriptions || {};
    const override = saved[item.id];
    return typeof override === 'string' ? override : override && override.text || item.text || item.description || '';
  }
  function mutationEffect(item) {
    if (!item) return '';
    if (item.effect === 'double-generation') return 'Два выбора за поколение';
    if (item.effect === 'shell') return 'Лишние особи живут в резерве и не увеличивают разнообразие';
    const factor = g.config['mutation.' + item.id + '.mult'] || g.config[item.rarity === 'rare' ? 'mutation.rareMult' : 'mutation.commonMult'];
    if (item.effect === 'producer') {
      const producer = content.world.stages[2].producers[item.producer];
      return title(producer, 'Производитель') + ' ' + g.fmt.mult(factor);
    }
    return 'Многоклеточные и Океан ' + g.fmt.mult(factor);
  }
  function ownedCount(run) {
    return (run.hexes || []).filter(hex => hex.owned).length;
  }
  function openSheet(nodes, update) {
    const close = g.sheet(nodes, () => { sheetUpdate = null; });
    sheetUpdate = update || null;
    return close;
  }
  function row(label, callback, picture) {
    const pic = Art.el(picture || 'mutation', 36);
    const name = textNode('span', 'ev-row-title', label);
    const sub = textNode('span', 'ev-row-sub', '');
    const amount = textNode('span', 'ev-row-count g-num', '');
    const price = textNode('span', 'ev-row-price g-num', '');
    const node = button([pic, h('span', { class: 'ev-row-copy' }, name, sub), h('span', { class: 'ev-row-end' }, amount, price)], callback, 'ev-buy');
    return { node, name, sub, amount, price, pic };
  }

  function build(game) {
    g = game;
    g.el.app.classList.add('ev-app');
    view.stage = textNode('div', 'ev-stage', '');
    view.constant = textNode('div', 'ev-constant', '');
    view.track = h('div', { class: 'ev-track', 'aria-label': 'Восемь этапов эволюции' });
    content.world.stages.forEach((stage, index) => {
      const step = h('i', { title: stage.title });
      step.append(Art.el('stage' + (index + 1), 28));
      view.track.append(step);
    });
    view.resource = textNode('div', 'g-big ev-resource', '');
    view.unit = textNode('span', 'ev-unit', '');
    view.rate = textNode('div', 'g-rate', '');
    view.goal = textNode('span', 'ev-goal', '');
    view.percent = textNode('span', 'g-num', '');
    view.bar = h('i', {});
    view.progress = h('div', { class: 'g-progress', role: 'progressbar', 'aria-label': 'Цель этапа', 'aria-valuemin': 0, 'aria-valuemax': 100 }, view.bar);
    g.el.top.append(
      h('div', { class: 'ev-heading' }, view.stage, view.constant),
      view.track,
      h('div', { class: 'ev-resource-line' }, view.resource, view.unit),
      view.rate,
      h('div', { class: 'ev-goal-line' }, view.goal, view.percent),
      view.progress
    );

    view.scene = h('div', { class: 'ev-scene', 'aria-label': 'Сцена этапа' });
    view.sceneCaption = textNode('div', 'ev-scene-caption', '');
    view.stats = h('div', { class: 'ev-stats' });
    view.description = note('');
    view.event = button('', openEvent, 'ev-event');
    view.chronicle = textNode('p', 'ev-chronicle', '');
    g.el.field.append(view.scene, view.sceneCaption, view.stats, view.description, view.event, view.chronicle);

    view.choices = h('div', { class: 'ev-choices', 'aria-live': 'polite' });
    view.mechanics = h('div', { class: 'ev-mechanics' });
    view.advance = button('Следующий этап', advance, 'primary');
    view.leap = button('Скачок', leap, 'small');
    view.universe = button('Вселенная', openUniverse, 'small');
    view.prestige = g.ui.prestigeButton('universe');
    view.prestige.id = 'ev-prestige';
    g.el.actions.append(view.choices, view.mechanics, view.advance,
      h('div', { class: 'g-btns ev-tools' }, view.leap, view.universe));
    g.on('prestige', () => { choiceKey = ''; sceneKey = ''; builtStage = 0; chronicle = ''; });
    g.on('offline', () => { takeChronicle(); });
    g.on('chest', () => { g.sfx('chest'); takeChronicle(); });
    takeChronicle();
    takeStock();
  }

  async function takeChronicle() {
    let item;
    try { item = await g.stock.take('chronicle'); } catch (_) {}
    // A model entry for another stage is kept for that stage's offline summary.
    if (item && sim.registerStock) g.act(state => sim.registerStock(state, 'chronicle', item));
    const shown = sim.chronicleFor ? sim.chronicleFor(g.state, g.state.run.stage)
      : (content.chronicle || []).find(entry => entry.stage === g.state.run.stage);
    if (shown && shown.text) {
      chronicle = shown.text;
      g.redraw();
    }
  }
  async function takeStock() {
    if (stockBusy) return;
    stockBusy = true;
    for (var kind of ['mutations', 'constants', 'descriptions']) {
      try {
        if (g.stock.count(kind) > 0) {
          const item = await g.stock.take(kind);
          if (item && sim.registerStock) g.act(state => sim.registerStock(state, kind, item));
        }
      } catch (_) {}
    }
    stockBusy = false;
  }
  function advance() {
    if (invoke(state => sim.advance(state, context()), 'level') !== false) {
      builtStage = 0;
      sceneKey = '';
      takeChronicle();
      g.redraw();
    }
  }
  async function leap() {
    const result = await g.links.spend('leap');
    if (!result.ok) {
      ui.toast(result.off ? 'Связка «Шаги» выключена' : 'Нужно энергии: ' + result.need);
      g.buzz('deny');
      return;
    }
    invoke(state => sim.leap(state, context()), 'level');
  }
  function buildMechanics(stage) {
    builtStage = stage;
    view.mechanics.replaceChildren();
    view.rows = [];
    view.roleInputs = [];
    const data = content.world.stages[stage - 1];
    if ([1, 2, 3, 4, 7].includes(stage)) {
      (data.producers || []).forEach((producer, index) => {
        const item = row(producer.title, () => invoke(state => sim.buy(state, g.config, index)), producer.id);
        item.sub.textContent = producer.text || '';
        item.node.dataset.producer = index;
        view.rows.push(item);
        view.mechanics.append(item.node);
      });
    }
    if (stage === 5) {
      view.hexTitle = textNode('div', 'ev-panel-title', '');
      view.hexInfo = note('');
      view.colonize = button('Заселить', () => invoke(state => sim.colonize(state, g.config, selectedHex)), 'primary');
      view.hexPic = h('span', { class: 'ev-hex-pic' });
      view.mechanics.append(h('div', { class: 'ev-hex-key' }, view.hexPic, h('div', {}, view.hexTitle, view.hexInfo)), view.colonize);
    }
    if (stage === 6) {
      view.mechanics.append(textNode('div', 'ev-panel-title', 'Роли племени'));
      content.world.roles.forEach((role, index) => {
        const value = textNode('span', 'g-num', '');
        const input = h('input', { type: 'range', min: 0, max: 100, step: 1, 'aria-label': role.title });
        input.addEventListener('input', () => { value.textContent = input.value + ' %'; });
        input.addEventListener('change', () => {
          const weights = g.state.run.roles.map(weight => weight * 100);
          weights[index] = Number(input.value);
          invoke(state => sim.setRoles(state, g.config, weights), 'tap');
        });
        view.roleInputs.push({ input, value });
        view.mechanics.append(h('label', { class: 'ev-role' },
          h('span', { class: 'ev-role-heading' }, Art.el(role.id, 28), h('span', { class: 'ev-role-name' }, role.title), value), input, textNode('span', 'ev-role-help', role.text)));
      });
    }
    if (stage === 7) {
      view.epoch = textNode('div', 'ev-panel-title', '');
      view.discoveries = h('div', { class: 'ev-discoveries' });
      view.discoveryRows = [];
      [0, 1, 2, 3].forEach(index => {
        const item = row('', () => invoke(state => sim.discover(state, g.config, index), 'level'), 'epoch-bronze');
        view.discoveryRows.push(item);
        view.discoveries.append(item.node);
      });
      view.mechanics.append(view.epoch, view.discoveries);
    }
    if (stage === 8) {
      view.planetRows = [];
      content.world.planets.forEach((planet, index) => {
        const item = row(planet.title, () => invoke(state => sim.launch(state, context(), index)), 'planet-' + planet.id);
        item.sub.textContent = planet.text || '';
        view.planetRows.push(item);
        view.mechanics.append(item.node);
      });
    }
  }

  function renderMechanics(state) {
    const run = state.run;
    const stage = run.stage;
    const cfg = g.config;
    if (builtStage !== stage) buildMechanics(stage);
    view.rows.forEach((item, index) => {
      const cost = sim.cost(state, cfg, index);
      const count = stage === 2 ? (index === 0 ? run.levels.mitosis : run.levels.capacity) : run.producers[index] || 0;
      item.amount.textContent = stage === 2 ? 'Ур. ' + count : '×' + g.fmt(count);
      item.price.textContent = g.fmt.price(cost);
      item.node.disabled = Big.lt(run.resource, cost);
      if ([1, 3, 7].includes(stage)) {
        const prefix = stage === 1 ? 'broth.' : stage === 3 ? 'multi.' : 'civ.';
        item.sub.textContent = 'Базовый доход: ' + g.fmt.rate(cfg[prefix + 'output' + index]);
      }
      if (stage === 2) item.sub.textContent = index === 0 ? 'Скорость ' + g.fmt.mult(cfg['cell.rateGrowth']) : 'Ёмкость ' + g.fmt.mult(cfg['cell.capacityGrowth']);
      if (stage === 4 && run.ocean) {
        const population = run.ocean[index] || 0;
        const limit = index ? sim.oceanLimit(state, cfg, index) : null;
        const full = index > 0 && Big.gte(population, limit);
        item.node.classList.toggle('ev-risk', full);
        item.sub.textContent = 'Живых: ' + g.fmt(population) + (index ? ' · предел ' + g.fmt(limit) : '');
        item.name.textContent = content.world.stages[3].producers[index].title + (full ? ' · избыток без пищи' : '');
      }
    });
    if (stage === 5) {
      if (!run.hexes[selectedHex]) selectedHex = 0;
      const hex = run.hexes[selectedHex];
      const biome = find(content.world.biomes, hex.biome);
      const price = sim.colonizeCost(state, cfg, selectedHex);
      view.hexTitle.textContent = 'Клетка ' + (selectedHex + 1) + ' · ' + (hex.water ? 'Вода' : title(biome, hex.biome));
      const picKey = selectedHex + ':' + hex.biome + ':' + hex.owned + ':' + hex.water;
      if (view.hexPic.dataset.key !== picKey) {
        view.hexPic.dataset.key = picKey;
        view.hexPic.innerHTML = Scenes.hex(hex.biome, { n: 'k', water: hex.water, owned: hex.owned, open: true });
      }
      view.hexInfo.textContent = hex.owned ? 'Заселена. Соседские пары усиливают доход.' : (biome && biome.text || 'Выберите клетку рядом с заселённой.');
      view.colonize.textContent = hex.owned ? 'Уже заселена' : 'Заселить · ' + g.fmt.price(price);
      view.colonize.disabled = hex.owned || !sim.canColonize(state, cfg, selectedHex) || Big.lt(run.resource, price);
    }
    if (stage === 6) {
      view.roleInputs.forEach((role, index) => {
        if (document.activeElement !== role.input) {
          role.input.value = Math.round(run.roles[index] * 100);
          role.value.textContent = Math.round(run.roles[index] * 100) + ' %';
        }
      });
    }
    if (stage === 7) {
      const epochs = content.world.epochs;
      const epoch = epochs[Math.min(run.epoch, epochs.length - 1)];
      const allEpochs = run.epoch >= Big.toNumber(sim.goal(state, cfg));
      view.epoch.textContent = allEpochs ? 'Все эпохи открыты' : 'Эпоха: ' + epoch.title;
      view.discoveries.hidden = allEpochs;
      view.discoveryRows.forEach((item, index) => {
        const discovery = epoch.discoveries[index];
        const price = Big.mul(sim.discoveryCost(state, cfg, index), run.discount ? cfg['event.wandererDiscount'] : 1);
        item.name.textContent = discovery.title;
        if (item.pic.dataset.discovery !== discovery.id) {
          item.pic.dataset.discovery = discovery.id;
          item.pic.innerHTML = Art.svg('disc-' + discovery.id, 36, Art.has('epoch-' + epoch.id) ? 'epoch-' + epoch.id : 'epoch-far-horizon');
        }
        item.sub.textContent = discovery.text;
        item.amount.textContent = run.discoveries[index] ? 'Открыто' : '';
        item.price.textContent = run.discoveries[index] ? '' : g.fmt.price(price);
        item.node.disabled = run.discoveries[index] || run.epoch >= Big.toNumber(sim.goal(state, cfg)) || Big.lt(run.resource, price);
      });
    }
    if (stage === 8) {
      view.planetRows.forEach((item, index) => {
        const planet = content.world.planets[index];
        const active = run.colonies.filter(entry => !entry.done);
        const colony = active.find(entry => entry.id === planet.id);
        const completed = run.colonies.filter(entry => entry.id === planet.id && entry.done).length;
        const cost = sim.launchCost(state, cfg, index);
        let duration = Math.min(cfg['space.maxTimerSec'], cfg['space.timer' + index] * Math.pow(cfg['space.timeGrowth'], run.worlds));
        const chosen = find(constants(), run.constant);
        const physics = chosen ? chosen.template || chosen.id : 'balanced';
        if (physics === 'light') duration *= cfg['constant.lightTime'];
        if (physics === 'slow') duration /= cfg['constant.slowAll'];
        item.price.textContent = g.fmt.price(cost);
        item.amount.textContent = completed ? 'Освоено: ' + completed : 'Старт';
        item.sub.textContent = colony ? 'В пути: ' + g.fmt.time(Math.max(0, (colony.endsAt - Date.now()) / 1000)) + ' · новый полёт ' + g.fmt.time(duration) : 'Перелёт: ' + g.fmt.time(duration);
        item.node.disabled = run.finished || active.length >= cfg['space.slots'] || Big.lt(run.resource, cost);
      });
    }
    const ready = sim.canAdvance(state, cfg);
    view.advance.hidden = !ready;
    view.advance.textContent = stage === 8 ? 'Завершить вселенную' : 'Перейти: ' + content.world.stages[stage].title;
    if (run.finished) {
      view.advance.hidden = true;
      view.sceneCaption.textContent = 'Вселенная завершена. Начало следующей — в ваших руках.';
    }
  }

  function renderChoices(state) {
    const run = state.run;
    const universe = run.universeChoices || [];
    const pending = run.pendingMutations || [];
    const ids = universe.length ? universe : pending.length ? pending[0] : [];
    const key = (universe.length ? 'u:' : 'm:') + ids.join('|') + ':' + pending.length;
    if (key === choiceKey) return;
    choiceKey = key;
    view.choices.replaceChildren();
    view.choices.hidden = !ids.length;
    view.mechanics.hidden = !!universe.length;
    if (!ids.length) return;
    view.choices.append(textNode('div', 'ev-panel-title', universe.length ? 'Законы новой вселенной' : 'Выберите мутацию · ждёт ' + pending.length));
    ids.forEach(id => {
      const item = find(universe.length ? constants() : mutations(), id);
      if (!item) return;
      const name = textNode('span', 'ev-card-title', item.title);
      const text = textNode('span', 'ev-card-text', universe.length ? item.plus + ' · ' + item.minus : mutationEffect(item) + '. ' + detail(item));
      const mark = textNode('span', 'ev-card-tag', universe.length ? 'Физическая постоянная' : item.rarity === 'rare' ? 'Редкая' : item.rarity === 'special' ? 'Особая' : 'Обычная');
      const picture = universe.length ? Art.el(Art.has(item.id) ? item.id : item.template || 'constant', 44, 'constant') : Art.el(item.id, 44, 'mutation');
      const choose = button([picture, h('span', { class: 'ev-choice-copy' }, mark, name, text)], () => {
        const ok = invoke(s => universe.length ? sim.chooseUniverse(s, context(), id) : sim.chooseMutation(s, context(), id), 'level');
        if (ok !== false) { choiceKey = ''; sceneKey = ''; g.redraw(); }
      }, 'ev-choice');
      choose.dataset.choice = id;
      view.choices.append(choose);
    });
  }

  function render(state) {
    const run = state.run;
    const stage = content.world.stages[run.stage - 1];
    const fraction = Math.max(0, Math.min(1, sim.progress(state, g.config)));
    const constant = find(constants(), run.constant);
    g.el.app.style.setProperty('--accent', palette[run.stage - 1]);
    g.el.app.style.setProperty('--accent-ink', '#151816');
    g.el.app.dataset.stage = run.stage;
    view.stage.textContent = run.stage + ' / 8  ·  ' + stage.title;
    view.constant.textContent = constant ? constant.title : 'Первая вселенная';
    view.resource.textContent = g.fmt.live(run.resource);
    view.unit.textContent = stage.resource;
    const currentIncome = sim.incomeAt ? sim.incomeAt(state, g.config, Date.now()) : sim.income(state, g.config);
    view.rate.textContent = g.fmt.rate(Big.mul(currentIncome, g.links.mult()));
    view.goal.textContent = (run.stage === 4 ? 'Разнообразие: ' : run.stage === 5 ? 'Клеток: ' : run.stage === 7 ? 'Эпох: ' : run.stage === 8 ? 'Миров: ' : 'Цель: ') + g.fmt(sim.goal(state, g.config));
    view.percent.textContent = Math.floor(fraction * 100) + ' %';
    view.bar.style.width = fraction * 100 + '%';
    view.progress.setAttribute('aria-valuenow', Math.floor(fraction * 100));
    Array.from(view.track.children).forEach((segment, index) => {
      segment.className = index < run.stage - 1 ? 'done' : index === run.stage - 1 ? 'current' : '';
    });
    view.description.textContent = stage.description;
    view.chronicle.textContent = chronicle;
    const event = run.event && find(content.events, run.event.id);
    view.event.hidden = !run.event;
    const eventKey = run.event ? run.event.id + ':' + title(event, '') : '';
    if (view.event.dataset.key !== eventKey) {
      view.event.dataset.key = eventKey;
      view.event.replaceChildren(...(run.event ? [Art.el('event-' + run.event.id, 36, 'event'), textNode('span', 'ev-event-title', 'Событие: ' + title(event, 'Новая возможность'))] : []));
    }
    view.leap.hidden = !(g.links.status().steps && g.links.status().steps.on);
    view.leap.disabled = !!run.universeChoices.length || run.finished;
    view.leap.textContent = 'Скачок · 1 энергия';
    view.universe.textContent = 'Вселенная · ' + g.fmt(money()) + ' искр';
    renderMechanics(state);
    renderChoices(state);
    renderScene(state);
    renderStats(state);
    if (sim.achievementIds) sim.achievementIds(state, g.config).forEach(id => g.achieve(id));
    if (sheetUpdate) sheetUpdate();
  }

  function renderStats(state) {
    const run = state.run;
    let pairs;
    if (run.stage === 2) pairs = [['Ёмкость', g.fmt(sim.capacity(state, g.config))], ['Заполнено', g.fmt.pct(Big.toNumber(Big.div(run.resource, sim.capacity(state, g.config))))]];
    else if (run.stage === 3) pairs = [['Поколение', run.generation], ['До мутации', g.fmt.time(Math.max(0, (run.nextGeneration - Date.now()) / 1000))]];
    else if (run.stage === 4) pairs = [['Разнообразие', g.fmt(sim.diversity(state, g.config))], ['Мутаций', Object.values(run.mutations || {}).reduce((a, b) => a + b, 0)]];
    else if (run.stage === 5) pairs = [['Заселено', ownedCount(run) + ' / ' + run.hexes.length], ['Наследие', g.fmt.mult(run.legacy)]];
    else if (run.stage === 6) pairs = [['Людей', g.fmt(run.people)], ['Еда', g.fmt(run.food)], ['Орудия', g.fmt(run.tools)], ['Наследие', g.fmt.mult(run.legacy)]];
    else if (run.stage === 7) pairs = [['Открытий', run.discoveries.filter(Boolean).length + ' / 4'], ['Эпоха', Math.min(run.epoch + 1, Big.toNumber(sim.goal(state, g.config)))]];
    else if (run.stage === 8) pairs = [['Миров', run.worlds], ['Экспедиций', run.colonies.filter(c => !c.done).length]];
    else pairs = [['Наследие', g.fmt.mult(run.legacy)], ['Сложность', g.fmt(sim.complexity(state))]];
    view.stats.replaceChildren(...pairs.map(pair => h('div', { class: 'ev-stat' }, textNode('span', '', pair[0]), textNode('strong', 'g-num', String(pair[1])))));
  }

  // What the scene shows of the stage: level 0..10 (how far the stage has grown) and named flags
  // (which producers, epochs, worlds and flights exist). ui/scenes.js fades the matching parts in.
  function sceneInfo(state) {
    const run = state.run;
    const cfg = g.config;
    const flags = {};
    const fraction = Math.max(0, Math.min(1, sim.progress(state, cfg)));
    // A goal a million times the start is reached mostly in the last minutes: count orders of magnitude.
    const have = Math.log10(1 + Math.min(1e300, Math.max(0, Big.toNumber(run.resource) || 0)));
    const need = Math.log10(1 + Math.min(1e300, Math.max(1, Big.toNumber(sim.goal(state, cfg)) || 1)));
    let grown = fraction;
    if (run.stage <= 3 || run.stage === 6) grown = Math.max(fraction, Math.min(1, have / need));
    if ([1, 3, 7].includes(run.stage)) (run.producers || []).forEach((count, index) => { flags['p' + index] = count > 0; });
    if (run.stage === 4) (run.ocean || []).forEach((count, index) => { flags['p' + index] = Big.gt(count, 0); });
    if (run.stage === 7) {
      for (var epoch = 1; epoch <= run.epoch; epoch += 1) flags['e' + epoch] = true;
      const total = (run.producers || []).reduce((sum, count) => sum + count, 0);
      grown = Math.max(grown, Math.min(1, Math.sqrt(total) / 12));
    }
    if (run.stage === 8) {
      content.world.planets.forEach((planet, index) => {
        const spot = Scenes.worlds.indexOf(planet.id);
        const key = spot < 0 ? index : spot;
        const flying = run.colonies.some(entry => entry.id === planet.id && !entry.done);
        const settled = run.colonies.some(entry => entry.id === planet.id && entry.done);
        flags['f' + key] = flying;
        flags['w' + key] = settled;
        flags['r' + key] = flying || settled;
      });
    }
    return { level: run.finished ? 10 : Math.round(grown * 10), flags };
  }

  function renderScene(state) {
    const run = state.run;
    const mapKey = run.stage === 5 ? selectedHex + ':' + run.hexes.map(hex => hex.owned ? '1' : '0').join('') : '';
    const key = run.stage + ':' + mapKey;
    if (key !== sceneKey) {
      sceneKey = key;
      sceneInfoKey = '';
      view.scene.classList.toggle('ev-land-scene', run.stage === 5);
      view.sceneCaption.textContent = ['Химия ищет форму', 'Среда определяет предел роста', 'Каждое поколение оставляет след', 'Устойчивость начинается с основания', 'Соседние биомы помогают друг другу', 'Знания живут в людях', 'Открытия меняют силуэт мира', 'Далёкие миры ближе с каждым возвращением'][run.stage - 1];
      if (run.stage === 5) {
        const map = h('div', { class: 'ev-map', role: 'group', 'aria-label': 'Карта биомов' });
        const place = hex => [133 + 41.57 * (hex.q + hex.r / 2), 118 + 36 * hex.r];
        const ground = h('div', { class: 'ev-ground' });
        ground.innerHTML = Scenes.island(run.hexes.map(hex => [place(hex)[0] + 22, place(hex)[1] + 25]));
        map.append(ground);
        run.hexes.forEach((hex, index) => {
          const biome = find(content.world.biomes, hex.biome);
          const cell = button('', () => { selectedHex = index; sceneKey = ''; g.sfx('tap'); g.redraw(); }, 'ev-hex' + (hex.owned ? ' owned' : '') + (selectedHex === index ? ' selected' : '') + (hex.water ? ' water' : ''));
          cell.innerHTML = Scenes.hex(hex.biome, { n: index, water: hex.water, owned: hex.owned, open: !hex.owned && sim.canColonize(state, g.config, index), selected: selectedHex === index });
          cell.style.left = place(hex)[0] + 'px';
          cell.style.top = place(hex)[1] + 'px';
          cell.setAttribute('aria-label', 'Клетка ' + (index + 1) + ', ' + (hex.water ? 'вода' : title(biome, hex.biome)) + (hex.owned ? ', заселена' : ', свободна'));
          cell.setAttribute('aria-pressed', String(index === selectedHex));
          map.append(cell);
        });
        // The sea and the island stay while the cells are redrawn, so their motion does not restart.
        const back = view.scene.querySelector('.ev-scene-art');
        if (back && view.scene.dataset.stage === '5') view.scene.replaceChildren(back, map);
        else {
          view.scene.innerHTML = Scenes.build(5);
          view.scene.append(map);
        }
      } else if (view.scene.dataset.stage !== String(run.stage) || !view.scene.querySelector('.ev-scene-art')) {
        view.scene.innerHTML = Scenes.build(run.stage);
      }
      view.scene.dataset.stage = run.stage;
      view.scene.setAttribute('aria-label', 'Сцена этапа: ' + content.world.stages[run.stage - 1].title);
    }
    const info = sceneInfo(state);
    const infoKey = info.level + ':' + Object.keys(info.flags).filter(name => info.flags[name]).join(',');
    if (infoKey === sceneInfoKey) return;
    sceneInfoKey = infoKey;
    Scenes.update(view.scene.querySelector('.ev-scene-art'), info);
  }

  function openUniverse() {
    const state = g.state;
    const constant = find(constants(), state.run.constant);
    const metrics = h('div', { class: 'g-lines' },
      g.ui.line('Искры творения', g.fmt(money())),
      g.ui.line('Сложность', g.fmt(sim.complexity(state))),
      g.ui.line('Наследие этапа', g.fmt.mult(state.run.legacy)));
    const buttons = h('div', { class: 'ev-sheet-actions' });
    const close = openSheet([
      textNode('h3', '', 'Вселенная'),
      note(constant ? constant.title + '. ' + constant.plus + '. ' + constant.minus : 'Каждая вселенная начинается с новой физики.'),
      metrics,
      buttons,
      note('Новая вселенная доступна с Океана. Искры, Законы природы, атлас и коллекция генов сохраняются.'),
      view.prestige
    ]);
    buttons.append(
      button('Законы природы', () => { close(); openLaws(); }),
      button('Коллекция генов', () => { close(); openGenes(); }),
      button('Атлас и летопись', () => { close(); openAtlas(); })
    );
  }
  function openLaws() {
    const balance = textNode('p', 'g-note', '');
    const rows = [];
    const root = h('div', { class: 'ev-law-list' });
    content.laws.forEach(law => {
      const item = row(law.title, () => {
        if (invoke(state => sim.buyLaw(state, g.config, law.id), 'level') !== false) update();
      }, Art.has('law-' + law.id) ? 'law-' + law.id : 'law');
      item.sub.textContent = law.text;
      item.id = law.id;
      item.repeatable = law.repeatable;
      rows.push(item);
      root.append(item.node);
    });
    function update() {
      balance.textContent = 'Искры творения: ' + g.fmt(money());
      rows.forEach(item => {
        const level = g.state.meta.laws[item.id] || 0;
        const price = sim.lawCost(g.state, g.config, item.id);
        const done = level && (!item.repeatable || item.id === 'offline' && level >= g.config['law.maxOffline']);
        item.amount.textContent = done ? 'Открыт' : level ? 'Ур. ' + level : '';
        item.price.textContent = done ? '' : g.fmt.price(price) + ' искр';
        item.node.disabled = done || Big.lt(money(), price);
      });
    }
    openSheet([textNode('h3', '', 'Законы природы'), balance, root], update);
    update();
  }
  function openGenes() {
    const root = h('div', { class: 'ev-gene-list' });
    const laws = g.state.meta.laws || {};
    function populate() {
      root.replaceChildren();
      const priority = g.state.meta.priority || [];
      const list = mutations().slice().sort((a, b) => {
        const ai = priority.indexOf(a.id);
        const bi = priority.indexOf(b.id);
        return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi);
      });
      list.forEach(item => {
        const count = g.state.meta.collection[item.id] || 0;
        const rank = priority.indexOf(item.id);
        const selected = g.state.meta.memory === item.id;
        const memory = button(selected ? 'В памяти' : 'В память', () => {
          invoke(state => sim.setMemory(state, item.id), 'tap');
          populate();
        }, 'small');
        memory.disabled = !laws.memory || !count;
        const prefer = button(rank < 0 ? 'В приоритет' : 'Приоритет ' + (rank + 1) + ' · поднять', () => {
          const ids = (g.state.meta.priority || []).filter(id => id !== item.id);
          ids.unshift(item.id);
          invoke(state => sim.setPriority(state, ids), 'tap');
          populate();
        }, 'small');
        root.append(h('article', { class: 'ev-gene' + (count ? '' : ' ev-unknown') },
          h('div', { class: 'ev-gene-head' }, Art.el(item.id, 36, 'mutation'), textNode('strong', '', item.title + (count ? ' · ' + count : ''))),
          note(mutationEffect(item) + '. ' + detail(item)),
          h('div', { class: 'g-btns' }, prefer, memory)));
      });
    }
    openSheet([
      textNode('h3', '', 'Коллекция генов'),
      note('Поднимайте желанные мутации в начало списка. Закон «Направленный отбор» использует этот порядок. «Память генов» переносит один открытый ген в следующую вселенную.'),
      root
    ]);
    populate();
  }
  function openAtlas() {
    const entries = g.state.meta.atlas || [];
    const root = h('div', { class: 'ev-atlas' });
    entries.slice().reverse().forEach((entry, index) => {
      const constant = find(constants(), entry.constant);
      root.append(h('article', { class: 'ev-gene' },
        textNode('strong', '', entry.title || (entry.kind === 'fossil' ? 'Окаменелость' : entry.kind === 'finale' ? 'Финал вселенной' : 'Вселенная ' + (entries.length - index))),
        note(entry.text || title(constant, 'След эволюции')),
        note((entry.stage ? 'Этап: ' + entry.stage + '. ' : '') + (entry.complexity !== undefined ? 'Сложность: ' + g.fmt(entry.complexity) + '. ' : '') + (entry.sparks !== undefined ? 'Искры: ' + g.fmt(entry.sparks) : ''))));
    });
    if (!entries.length) root.append(note('Первую запись оставит новая вселенная или редкая окаменелость.'));
    (g.state.meta.chronicles || []).slice(-12).reverse().forEach(entry => {
      root.append(h('article', { class: 'ev-gene' }, textNode('strong', '', content.world.stages[entry.stage - 1].title), note(entry.text)));
    });
    openSheet([textNode('h3', '', 'Атлас вселенных'), note(chronicle), root]);
  }
  function openEvent() {
    const pending = g.state.run.event;
    if (!pending) return;
    const event = find(content.events, pending.id) || pending;
    const choices = event.choices && event.choices.length ? event.choices : [{ id: 'accept', title: 'Принять' }];
    const list = h('div', { class: 'ev-sheet-actions' });
    const close = openSheet([h('div', { class: 'ev-gene-head' }, Art.el('event-' + pending.id, 44, 'event'), textNode('h3', '', event.title || 'Событие')), note(detail(event)), list]);
    choices.forEach(choice => {
      list.append(button([textNode('span', 'ev-card-title', choice.title), textNode('span', 'ev-card-text', choice.text || '')], () => {
        if (invoke(state => sim.resolveEvent(state, context(), choice.id), 'level') !== false) close();
      }, 'ev-choice'));
    });
  }

  try {
    const names = ['world', 'mutations', 'constants', 'events', 'laws', 'chronicle'];
    const loaded = await Promise.all(names.map(name => fetch('../content/' + name + '.json').then(response => {
      if (!response.ok) throw new Error('Не удалось загрузить ' + name);
      return response.json();
    })));
    content = {};
    names.forEach((name, index) => { content[name] = loaded[index]; });
    sim.use(content);
    await Game.start({ id: 'evolution', sim, render, init: build });
  } catch (error) {
    document.body.replaceChildren(h('div', { class: 'g-error' }, 'Не удалось открыть «Эволюцию». ' + error.message));
    console.error(error);
  }
})();





