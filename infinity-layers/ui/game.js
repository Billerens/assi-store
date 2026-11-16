/* The engine owns saves, time and prestige confirmation. This file only presents sim decisions. */
(async function () {
  const h = ui.h;
  const sim = window.GameSim;
  const N = window.InfinityNumbers;
  const Art = window.ILArt;
  const v = { rows: [], tab: 'layers', panelKey: '', close: null, frames: [], reduced: window.matchMedia('(prefers-reduced-motion: reduce)').matches };
  let g = null;
  const files = ['tiers', 'events', 'challenges', 'rules', 'upgrades', 'aphorisms'];
  const loaded = await Promise.all(files.map(name => fetch('../content/' + name + '.json').then(r => {
    if (!r.ok) throw new Error('Не удалось прочитать ' + name);
    return r.json();
  })));
  const content = {};
  files.forEach((name, i) => { content[name] = loaded[i]; });
  const layers = [
    { id: 'compression', title: 'Сжатие', currency: 'Плотность', color: '#a7b6c9', unlock: 'Открывает следующую ступень', threshold: 'compression.threshold' },
    { id: 'fold', title: 'Свёртка', currency: 'Складки', color: '#b2bba3', unlock: 'Дерево, автоматизация и Ритм', threshold: 'fold.threshold' },
    { id: 'collapse', title: 'Коллапс', currency: 'Сингулярности', color: '#c5aaa0', unlock: 'Испытания и дерево Коллапса', threshold: 'collapse.threshold' }
  ];
  const tabs = [ ['layers', 'Слои'], ['tree', 'Дерево'], ['auto', 'Авто'], ['challenges', 'Испытания'], ['rhythm', 'Ритм'] ];

  Sfx.add('il-fold', [{type:'sine',f:[170,350],d:.3,v:.25},{type:'triangle',f:[350,700],at:.15,d:.3,v:.2}]);
  Sfx.add('il-fluctuation', [{type:'sine',f:[550,820],d:.15,v:.18}]);
  Sfx.add('il-beat', [{type:'sine',f:[320,320],d:.06,v:.25}]);

  function fmt(value) { return N.fmt(value); }
  function multiplierText(value) { const number = N.toNumber(value); return number > 0 && number < 1000 ? Number(number.toFixed(2)).toString().replace('.', ',') : fmt(value); }
  function cfg(key, fallback) { return g.config[key] === undefined ? fallback : g.config[key]; }
  function ctx() { return { config: g.config, now: Date.now(), rng: g.rng, mult: g.links.mult(), offline: false }; }
  function amount(id) { return g.state.layers[id] ? sim.currency(g.state, id) : N.ZERO; }
  function hasFold() { return !!g.state.meta.foldUnlocked; }
  function hasCollapse() { return !!g.state.meta.collapseUnlocked; }
  function tone(index) { return layers[index] ? layers[index].color : 'hsl(' + ((index * 47 + 176) % 360) + ' 20% 70%)'; }
  function notify(ok, sound) {
    g.sfx(ok ? sound || 'buy' : 'deny');
    g.buzz(ok ? 'buy' : 'deny');
    v.panelKey = '';
    g.redraw();
    return ok;
  }
  function act(fn, sound) { return notify(g.act(fn), sound); }
  function note(text) { return h('p', { class: 'il-caption' }, text); }
  function pic(body, cls) { return Art.el(body, cls); }
  // A picture, a title and a line of state: the head of every card in the sheet.
  function head(body, title, side, tint) {
    const icon = pic(body, 'il-ic-card');
    if (tint) icon.style.setProperty('--il-tint', tint);
    return h('div', { class: 'il-head' }, icon, h('div', { class: 'il-head-text' }, h('strong', {}, title), side ? h('span', { class: 'il-state' }, side) : null));
  }
  function decimal(value) { return Number(Number(value).toFixed(2)).toString().replace('.', ','); }
  function button(text, fn, options) { return h('button', Object.assign({ class: 'g-btn small', onclick: fn }, options || {}), text); }

  function build(game) {
    g = game;
    g.el.app.classList.add('il-app');
    v.points = h('div', { class: 'il-points', id: 'points', 'aria-label': 'Очки' });
    v.rate = h('div', { class: 'il-rate', id: 'production' });
    v.layerMark = h('div', { class: 'il-layer-mark', title: 'Глубина слоёв' });
    g.el.top.append(h('div', { class: 'il-header' }, h('div', {}, h('div', { class: 'il-eyebrow' }, 'СЛОИ БЕСКОНЕЧНОСТИ'), v.points, v.rate), v.layerMark));
    v.tiers = h('div', { class: 'il-tiers', 'aria-label': 'Ступени' });
    content.tiers.forEach((tier, index) => {
      const count = h('span', {});
      const multiplier = h('span', {});
      const buyText = h('span', {});
      const price = h('span', {});
      const progress = h('i', {});
      const buy = h('button', { class: 'il-buy-tier', 'data-tier': index, onclick: () => act(s => sim.buy(s, index, 'ten', g.config)) }, buyText, price, h('div', { class: 'il-decade', 'aria-hidden': 'true' }, progress));
      const el = h('div', { class: 'il-tier', 'data-row': index }, h('span', { class: 'il-tile' }, pic(Art.tier(index)), h('span', { class: 'il-index' }, String(tier.id)), pic(Art.misc('lock'), 'il-lock')), h('div', {}, h('div', { class: 'il-tier-name' }, tier.title), h('div', { class: 'il-tier-detail' }, count, multiplier)), buy);
      v.tiers.append(el);
      v.rows.push({ el, count, multiplier, buy, buyText, price, progress, tier });
    });
    g.el.field.append(v.tiers);
    v.world = window.InfinityScene && InfinityScene.mount(g, g.el.field);
    if (v.world) g.el.field.prepend(v.world.node);
    v.universe = h('div', { class: 'il-universe', 'aria-hidden': 'true' });
    v.framesBox = h('div', { class: 'il-frames' });
    v.frameLabel = h('div', { class: 'il-universe-label' });
    v.universe.append(v.framesBox, v.frameLabel);
    v.universe.hidden = !!v.world;
    v.prestige = h('div', { class: 'il-wide-prestige' });
    v.prestigeButtons = layers.map(layer => {
      const b = button(layer.title, () => doPrestige(layer.id));
      b.style.setProperty('--frame-color', layer.color);
      v.prestige.append(b);
      return b;
    });
    v.event = h('button', { class: 'il-event', id: 'fluctuation', hidden: true, onclick: claimEvent, 'aria-live': 'polite' });
    v.eventTitle = h('strong', {});
    v.eventText = h('span', {});
    v.event.append(pic(Art.misc('fluctuation'), 'il-ic-card'), h('div', {}, v.eventTitle, v.eventText));
    v.resonanceText = h('span', {});
    v.resonancePrice = h('span', { class: 'g-sub' });
    v.resonance = button('', () => act(s => sim.buyResonance(s, g.config)));
    v.resonance.id = 'resonance';
    v.resonance.append(pic(Art.misc('resonance'), 'il-ic-btn'), h('span', {}, v.resonanceText, v.resonancePrice));
    v.layers = button('Слои и правила', () => openPanel('layers'));
    v.layers.id = 'layers';
    v.buyAll = button('Купить всё', () => act(s => sim.buyAll(s, g.config)), { class: 'g-btn primary il-buy-all', id: 'buy-all' });
    g.el.actions.append(v.universe, v.prestige, v.event, h('div', { class: 'il-controls' }, v.resonance, v.layers), v.buyAll);
    v.panel = h('div', { class: 'il-panel' });
    v.panelTitle = h('h3', {}, 'Слои и правила');
    v.panelTabs = h('div', { class: 'il-tabs', role: 'tablist' });
    v.tabs = tabs.map(([id, title]) => {
      const b = h('button', { class: 'il-tab', role: 'tab', onclick: () => setTab(id), 'data-tab': id }, title);
      v.panelTabs.append(b);
      return b;
    });
    v.panelBody = h('div', { class: 'il-panel-body', role: 'tabpanel' });
    v.panel.append(v.panelTitle, v.panelTabs, v.panelBody, button('Закрыть', closePanel));
    g.on('prestige', () => {
      v.panelKey = '';
      g.el.app.classList.add('il-compress');
      window.setTimeout(() => g.el.app.classList.remove('il-compress'), 700);
      g.sfx('il-fold');
    });
    v.aphorism = content.aphorisms[0];
    g.stock.take('aphorisms').then(item => { if (item) v.aphorism = item; }).catch(() => {});
    g.on('offline', report => {
      if (!report.formula && report.events) report.events.push.apply(report.events,sim.offlineEvents(g.state));
      if (v.aphorism && report.events) report.events.push(v.aphorism.text);
    });
    g.on('chest', () => { g.sfx('chest'); g.buzz('chest'); });
    g.on('resize', () => { v.panelKey = ''; });
    window.infinityLayersUI = { state: () => g.state, game: () => g, open: openPanel, close: closePanel };
  }

  async function doPrestige(id) {
    closePanel();
    await g.prestige(id);
  }
  function closePanel() {
    if (v.close) {
      const close = v.close;
      v.close = null;
      close();
    }
    v.panelKey = '';
  }
  function openPanel(tab) {
    v.tab = tab || v.tab;
    v.panelKey = '';
    if (!v.close) v.close = g.sheet(v.panel, () => { v.close = null; v.panelKey = ''; });
    g.redraw();
  }
  function setTab(tab) {
    v.tab = tab;
    v.panelKey = '';
    g.sfx('tap');
    g.redraw();
  }

  function layerCards() {
    const body = [];
    layers.forEach((layer, index) => {
      const gain = sim.rawGain(g.state, layer.id, g.config);
      const can = g.prestigeInfo(layer.id).can;
      const card = h('section', { class: 'il-card il-layer' + (can ? ' ready' : '') }, h('div', { class: 'il-card-top' }, head(Art.layer(layer.id), layer.title, layer.currency, layer.color), h('span', { class: 'il-currency' }, fmt(amount(layer.id)))), note(layer.unlock), note('Порог: ' + fmt(cfg(layer.threshold)) + ' Очков'), button(can ? layer.title + ': +' + fmt(gain) : 'Порог ещё не достигнут', () => doPrestige(layer.id), { disabled: !can }));
      card.style.setProperty('--il-tint', layer.color);
      if (index > 0 && !hasFold() && index === 2) card.append(note('Откроется после Свёртки.'));
      body.push(card);
    });
    const highest = g.state.meta.highestLayer || 0;
    const next = Math.max(4, highest + 1);
    if (hasCollapse() || g.state.meta.completed[8]) {
      for (let layer = 4; layer <= next; layer++) {
        const id = 'layer' + layer;
        const lower = layer === 4 ? 'collapse' : 'layer' + (layer - 1);
        const gain = sim.rawGain(g.state, id, g.config);
        const ready = !!g.state.meta.completed[8] && N.gte(gain, 1);
        const rule = content.rules[(layer - 4) % content.rules.length];
        const card = h('section', { class: 'il-card il-layer' + (ready ? ' ready' : '') }, h('div', { class: 'il-card-top' }, head(Art.layer('transition'), 'Переход ' + layer, 'Слой ' + layer, tone(layer - 1)), h('span', { class: 'il-currency' }, fmt(amount(id)))), note('Нужно ' + fmt(cfg('transition.threshold', 1000)) + ' валюты предыдущего слоя. Сейчас: ' + fmt(amount(lower))), h('div', { class: 'il-rule' }, pic(Art.rule(rule.id), 'il-ic-row'), note('Новое правило: ' + rule.title + '. ' + rule.text)), button(ready ? 'Переход ' + layer + ': +' + fmt(gain) : g.state.meta.completed[8] ? 'Недостаточно валюты' : 'Пройдите испытание 8', () => confirmTransition(layer), {disabled: !ready}));
        card.style.setProperty('--il-tint', tone(layer - 1));
        body.push(card);
      }
    }
    if (highest >= 4) {
      const rules = h('section', {class:'il-card'}, h('h4',{},'Правила ваших слоёв'));
      for (let i = 4; i <= highest; i++) {
        const rule = content.rules[(i - 4) % content.rules.length];
        rules.append(h('div', { class: 'il-rule' }, pic(Art.rule(rule.id), 'il-ic-row'), note('Слой ' + i + ' · ' + rule.title + '. ' + rule.text)));
      }
      body.push(rules);
    }
    body.push(note('Каждая единица старшего слоя удваивает прирост предыдущего. Коллапс сохраняет деревья; Переход сбрасывает оба дерева и автоматизацию, награды испытаний остаются.'));
    const stepLink = g.links.status().steps;
    if (stepLink && stepLink.on) body.push(button('Всплеск ×' + cfg('boost.mult',3) + ' на ' + cfg('boost.minutes',10) + ' минут · 1 энергия', spendBoost));
    return body;
  }

  function confirmTransition(layer) {
    closePanel();
    const gain = sim.rawGain(g.state, 'layer' + layer, g.config);
    const confirm = button('Удерживайте: перейти', null, { class: 'g-btn primary' });
    let close = null;
    g.ui.hold(confirm, cfg('prestige.holdMs', 900), async () => {
      await g.saveNow('before-prestige', true);
      const ok = g.act(s => sim.transition(s, layer, ctx()), {now:true,reason:'prestige',keep:true});
      if (close) close();
      notify(ok, 'prestige');
    });
    close = g.sheet([h('h3', {}, 'Переход ' + layer), note('Получите: +' + fmt(gain) + ' валюты слоя ' + layer), note('Сбросится: Очки, ступени, Резонанс, валюта всех нижних слоёв, оба дерева и автоматизация.'), note('Останется: награды испытаний, открытые правила и достижения.'), confirm, button('Отмена', () => close())]);
  }

  // What a levelled node gives right now, in the words of its own description.
  function effect(id, level) {
    if (id === 'echo') return 'десяток даёт ×' + decimal(cfg('tier.mult', 2) + (cfg('tier.echoMult', 2.2) - cfg('tier.mult', 2)) * level);
    if (id === 'night') return 'офлайн-производство ×' + decimal(1 + (cfg('night.efficiency', 1.25) - 1) * level);
    if (id === 'extraFold') return '+' + level + ' к Складкам за Свёртку';
    if (id === 'singularPower') return 'производство ×' + fmt(N.pow(cfg('collapse.powerMult', 2), level));
    if (id === 'foldMemory') return 'остаётся Складок: ' + cfg('collapse.foldStart', 1) * level;
    return 'уровень ' + level;
  }
  function treeTitle(layerId, text, tint) {
    const title = h('h4', { class: 'il-section' }, pic(Art.layer(layerId), 'il-ic-row'), h('span', {}, text));
    title.style.setProperty('--il-tint', tint);
    return title;
  }
  function upgradeCards() {
    const result = [];
    if (!hasFold()) return [note('Дерево откроется после первой Свёртки. Достигните ' + fmt(cfg('fold.threshold')) + ' Очков.')];
    result.push(treeTitle('fold', 'Дерево Свёртки · ' + fmt(amount('fold')) + ' Складок', layers[1].color));
    content.upgrades.forEach(upgrade => {
      if (upgrade.tree === 'collapse' && !hasCollapse()) return;
      if (upgrade.id === 'auto9' && (g.state.meta.highestLayer || 0) < 4) return;
      if (upgrade.id === 'singularPower') result.push(treeTitle('collapse', 'Дерево Коллапса · ' + fmt(amount('collapse')) + ' Сингулярностей', layers[2].color));
      const level = sim.upgradeLevel(g.state, upgrade.id, upgrade.tree);
      const again = sim.repeatable(upgrade.id, g.config, upgrade.tree);
      const owned = level > 0;
      const cost = sim.upgradeCost(g.state, upgrade.id, g.config, upgrade.tree);
      const can = N.gte(amount(upgrade.tree), cost);
      const unit = upgrade.tree === 'fold' ? ' Складок' : ' Сингулярностей';
      const price = fmt(cost) + unit;
      const text = again ? (owned ? 'Уровень ' + (level + 1) + ' · ' : 'Купить · ') + price : 'Купить · ' + price;
      const card = h('section', { class: 'il-card il-node' + (owned ? ' owned' : '') + (again ? ' endless' : '') + (!can && (again || !owned) ? ' poor' : '') }, head(Art.upgrade(upgrade.id), upgrade.title, again ? (owned ? 'Уровень ' + level : 'Без предела уровней') : owned ? 'Куплено' : 'Разовый узел'), note(upgrade.text));
      card.style.setProperty('--il-tint', upgrade.tree === 'fold' ? layers[1].color : layers[2].color);
      if (again && owned) card.append(note('Сейчас: ' + effect(upgrade.id, level)));
      if (owned && !again) card.append(pic(Art.misc('check'), 'il-done'));
      else card.append(button(text, () => act(s => sim.buyUpgrade(s, upgrade.id, g.config, upgrade.tree)), {disabled: !can}));
      result.push(card);
    });
    return result;
  }

  function toggle(title, id, enabled, value, body) {
    const input = h('input', {type:'checkbox', checked:!!value, disabled:!enabled, 'aria-label':title, onchange: () => act(s => (sim.setAuto(s, id, input.checked, g.config), true), 'tap')});
    return h('label', {class:'il-automation-row' + (enabled ? '' : ' closed')}, pic(body || Art.misc('auto'), 'il-ic-row'), h('span',{class:'il-row-text'},title + (enabled ? '' : ' · закрыто')), input);
  }
  function ratio(title, id, value) {
    const input = h('input', {type:'number', min:'1', max:'1000000', step:'.5', value:String(value || 2), 'aria-label':title, onchange: () => {
      const value = Math.max(1, Math.min(1000000, Number(input.value) || 2));
      act(s => (sim.setAuto(s, id, value, g.config), true), 'tap');
    }});
    return h('label', {class:'il-automation-row'}, h('span',{class:'il-row-text il-row-indent'},title), input);
  }
  function automationCards() {
    if (!hasFold()) return [note('Автоматизация откроется в дереве Свёртки.')];
    const tree = g.state.meta.foldTree;
    const auto = g.state.meta.auto;
    const row = h('section', {class:'il-card'}, h('h4',{},'Автопокупка'));
    content.tiers.forEach((tier,index) => {
      if (index === 8 && (g.state.meta.highestLayer || 0) < 4) return;
      row.append(toggle(tier.title, 'tier' + (index + 1), !!tree['auto' + (index + 1)], auto.tiers[index], Art.tier(index)));
    });
    row.append(toggle('Резонанс', 'resonance', !!tree.autoResonance, auto.resonance, Art.misc('resonance')));
    const resets = h('section', {class:'il-card'}, h('h4',{},'Автоматические сбросы'), toggle('Авто-Сжатие', 'compression', !!tree.autoCompression, auto.compression, Art.layer('compression')), ratio('Прирост Плотности ×', 'compressionRatio', auto.compressionRatio), note('Сжатие сработает, когда награда достигнет заданной доли текущей Плотности.'), toggle('Авто-Свёртка', 'fold', (g.state.meta.highestLayer || 0) >= 9, auto.fold, Art.layer('fold')), ratio('Прирост Складок ×', 'foldRatio', auto.foldRatio));
    return [row,resets,note('Автоматизация работает и вне игры. Изменение порога сохраняется сразу.')];
  }

  function challengeCards() {
    if (!hasCollapse()) return [note('Испытания откроются после первого Коллапса.')];
    const active = g.state.meta.challenge || 0;
    const result = [note('Каждое испытание начинает новый забег со сбросом Свёртки. Достигните ' + fmt(cfg('fold.threshold')) + ' Очков: испытание завершится и Свёртка произойдёт автоматически.')];
    if (active) result.push(button('Выйти из испытания ' + active, () => confirmChallenge(0)));
    content.challenges.forEach(challenge => {
      const done = !!g.state.meta.completed[challenge.id];
      const card = h('section', {class:'il-card il-node' + (done ? ' owned' : '') + (active === challenge.id ? ' active' : '')}, head(Art.challenge(challenge.id), challenge.id + '. ' + challenge.title, done ? 'пройдено' : active === challenge.id ? 'идёт' : 'не пройдено'), note(challenge.rule), note('Награда: ' + challenge.reward), button(active === challenge.id ? 'Испытание идёт' : done ? 'Пройти снова' : 'Начать испытание', () => confirmChallenge(challenge.id), {disabled:active === challenge.id}));
      card.style.setProperty('--il-tint', layers[2].color);
      result.push(card);
    });
    return result;
  }
  function confirmChallenge(id) {
    closePanel();
    let close;
    const b = button('Удерживайте для сброса', null, {class:'g-btn primary'});
    g.ui.hold(b,cfg('prestige.holdMs',900),async () => {
      await g.saveNow('before-prestige',true);
      const ok = g.act(s => id ? sim.startChallenge(s,id,ctx()) : sim.exitChallenge(s,ctx()), {now:true,reason:'challenge',keep:true});
      close();
      notify(ok,'prestige');
      openPanel('challenges');
    });
    close = g.sheet([h('h3',{},id ? content.challenges[id - 1].title : 'Выйти из испытания'),note('Начнётся новый забег: Очки, ступени, Резонанс, Плотность и Складки сбросятся. Деревья и постоянные награды останутся.'),b,button('Отмена',()=>close())]);
  }

  function rhythmCards() {
    if (!g.state.meta.foldTree.rhythm) return [note('Купите узел «Ритм» в дереве Свёртки. Он открывает кольцо и усиление за попадания в такт.'),button('К дереву',()=>setTab('tree'))];
    v.combo = h('span',{},'0');
    v.rhythmMessage = h('span',{class:'il-caption'},'Коснитесь, когда кольца совпадут');
    v.rhythm = h('button',{class:'il-rhythm','aria-label':'Попасть в ритм',onclick:() => {
      const ok = g.act(s => sim.rhythmTap(s,Date.now(),g.config));
      g.sfx(ok ? 'il-beat' : 'deny');
      g.buzz(ok ? 'tap' : 'deny');
      v.rhythm.classList.toggle('hit',!!ok);
      window.setTimeout(()=>{if(v.rhythm)v.rhythm.classList.remove('hit');},150);
    }},h('span',{class:'il-rhythm-count'},v.combo,h('small',{},'серия')));
    v.rhythmStatus = note('');
    return [note('Касайтесь в такт: светлое кольцо должно совпасть с неподвижным. Промах обнуляет серию.'),v.rhythm,v.rhythmMessage,v.rhythmStatus,note('Серия ' + cfg('rhythm.target',50) + ' даёт +' + cfg('rhythm.foldBonus',1) + ' Складку за следующую Свёртку, один раз за слой.')];
  }

  function renderPanel() {
    if (!v.close) return;
    v.tabs.forEach((b,i)=>b.setAttribute('aria-selected',String(tabs[i][0] === v.tab)));
    const state = g.state;
    const key = [v.tab,fmt(amount('compression')),fmt(amount('fold')),fmt(amount('collapse')),state.meta.highestLayer,state.meta.challenge,JSON.stringify(state.meta.foldTree),JSON.stringify(state.meta.collapseTree),JSON.stringify(state.meta.completed),state.run.rhythm.bonus,layers.map(l=>g.prestigeInfo(l.id).can + (v.tab === 'layers' ? fmt(sim.rawGain(state,l.id,g.config)) : '')).join(',')].join('|');
    if (key !== v.panelKey) {
      v.panelKey = key;
      const views = {layers:layerCards,tree:upgradeCards,auto:automationCards,challenges:challengeCards,rhythm:rhythmCards};
      v.panelBody.replaceChildren(...views[v.tab]());
    }
    if (v.tab === 'rhythm' && v.rhythmStatus && state.meta.foldTree.rhythm) {
      v.combo.textContent = String(state.run.rhythm.combo || 0);
      const left = Math.max(0, Math.ceil((state.run.rhythm.until - Date.now()) / 1000));
      v.rhythmStatus.textContent = (left ? 'Производство ×' + cfg('rhythm.mult',2) + ' · ещё ' + left + ' с' : 'Кольцо ждёт первого попадания') + (state.run.rhythm.bonus ? ' · дополнительная Складка заработана' : '');
    }
  }

  async function spendBoost() {
    const r = await g.links.spend('boost');
    if (!r.ok) { ui.toast(r.off ? 'Связка «Шаги» выключена' : 'Нужна энергия шагов'); g.buzz('deny'); return; }
    g.act(s => sim.boost(s,Date.now(),g.config),{now:true,reason:'spend'});
    g.sfx('level');
  }
  function claimEvent() {
    const event = g.state.run.event;
    if (!event || Date.now() >= event.expires) return;
    if (event.id === 6) {
      let close;
      const choose = choice => { const ok = g.act(s => sim.tapEvent(s,choice,ctx())); close(); notify(ok,'il-fluctuation'); };
      close = g.sheet([h('h3',{},'Разлом'),note(content.events[5].text),button('Десять минут производства',()=>choose('time')),button('Плотность ×1,1 до конца слоя',()=>choose('density')),button('Закрыть',()=>close())]);
    } else act(s=>sim.tapEvent(s,null,ctx()),'il-fluctuation');
  }

  function renderFrames(state) {
    if (v.world) {
      const world = InfinityScene.model(state, g.config, content, { now: Date.now(), income: v.currentIncome });
      v.world.update(world);
      v.layerMark.textContent = String(world.depth);
      g.el.app.style.setProperty('--il-layer-color', tone(world.depth - 1));
      return;
    }
    const highest = state.meta.highestLayer >= 4 ? state.meta.highestLayer : hasCollapse() ? 3 : hasFold() ? 2 : state.layers.compression.count > 0 ? 1 : 0;
    // Every layer gets its own frame, without an end: the insets shrink to fit, the colour of a
    // frame past the named three comes from tone() (a hue step per layer).
    const count = highest + 1;
    const step = Math.min(8,46 / Math.max(1,count - 1));
    if (v.frames.length !== count) {
      v.framesBox.replaceChildren();
      v.frames = [];
      for (let i = 0; i < count; i++) {
        const frame = h('div',{class:'il-frame'});
        frame.style.inset = (i * step).toFixed(2) + '%';
        frame.style.setProperty('--frame-color',tone(i));
        v.framesBox.append(frame);
        v.frames.push(frame);
      }
    }
    v.frames.forEach((frame,i)=> {
      const id = i < 3 ? layers[i].id : 'layer' + (i + 1);
      const value = N.log10(N.max(1,amount(id)));
      const log = typeof value === 'number' ? value : N.toNumber(value);
      frame.style.setProperty('--frame-width',Math.min(5,1 + Math.max(0,Math.log10(1 + log))) + 'px');
    });
    v.frameLabel.textContent = highest === 0 ? 'Начало' : highest < 4 ? layers[Math.min(2,highest - 1)].title : 'Слой ' + highest;
    v.layerMark.textContent = String(highest);
    g.el.app.style.setProperty('--il-layer-color',tone(highest - 1));
  }

  function achievements(state) {
    if ((state.layers.compression.count || 0) > 0 || hasFold()) g.achieve('first-compression');
    if (sim.unlocked(state,g.config) >= 8) g.achieve('eight-tiers');
    if (N.gte(state.run.points,cfg('achievement.googol','1e100'))) g.achieve('googol');
    if (N.gte(state.run.points,cfg('achievement.edge','1e308'))) g.achieve('beyond');
    if (hasFold()) g.achieve('first-fold');
    if (hasCollapse()) g.achieve('collapse');
    if (content.challenges.every(c=>!!state.meta.completed[c.id])) g.achieve('all-challenges');
    if (N.gte(state.run.points,cfg('achievement.order','1e1000'))) g.achieve('order-order');
    if ((state.meta.highestLayer || 0) >= 5) g.achieve('layer-five');
  }

  function render(state) {
    v.points.textContent = fmt(state.run.points);
    v.points.title = N.str(state.run.points);
    v.currentIncome = sim.income(state,g.config,Date.now(),g.links.mult());
    v.rate.textContent = '+' + fmt(v.currentIncome) + ' / с' + (state.meta.challenge ? ' · Испытание ' + state.meta.challenge : '');
    const unlocked = sim.unlocked(state,g.config);
    v.rows.forEach((row,index)=> {
      const tier = state.run.tiers[index];
      const locked = index >= unlocked;
      row.el.hidden = index === 8 && !sim.rule(state,0);
      row.el.classList.toggle('locked',locked);
      row.count.textContent = locked ? row.tier.unlock : fmt(tier.amount);
      row.count.title = locked ? row.tier.unlock : 'Всего: ' + N.str(tier.amount) + ' · куплено: ' + tier.bought;
      row.multiplier.textContent = locked ? '' : '×' + multiplierText(sim.multiplier(state,index,g.config));
      const batch = cfg('tier.batch',10);
      const left = batch - (tier.bought % batch);
      const cost = sim.cost(state,index,g.config);
      const every = cfg('challenge.freeEvery',100);
      const freeNow = !!state.meta.completed[7] && (state.run.totalBought + 1) % every === 0;
      const freeCount = state.meta.completed[7] ? Math.floor((state.run.totalBought + left) / every) - Math.floor(state.run.totalBought / every) : 0;
      row.buyText.textContent = locked ? 'Закрыто' : '+' + left;
      const start = state.meta.foldTree.denseStart ? cfg('denseStart.tiers',5) : cfg('start.tiers',4);
      row.price.textContent = locked ? 'Сжатие ' + Math.max(1,index + 1 - start) : fmt(N.mul(cost,Math.max(0,left - freeCount)));
      row.buy.setAttribute('aria-label',locked ? row.tier.title + ': ' + row.tier.unlock : 'Купить ' + row.tier.title + ', до десятка ' + left + ', цена ' + row.price.textContent);
      row.buy.disabled = locked || (!freeNow && N.lt(state.run.points,cost)) || (state.meta.challenge === 7 && state.run.tiers.reduce((sum,t)=>sum+t.bought,0) >= cfg('challenge.buyLimit',100));
      row.progress.style.width = (tier.bought % batch) / batch * 100 + '%';
    });
    const resonanceCost = sim.resonanceCost ? sim.resonanceCost(state,g.config) : N.mul(cfg('resonance.cost'),N.pow(cfg('resonance.growth'),state.run.resonance));
    v.resonanceText.textContent = 'Резонанс ' + state.run.resonance;
    v.resonancePrice.textContent = fmt(resonanceCost);
    v.resonance.disabled = N.lt(state.run.points,resonanceCost) || state.meta.challenge === 1 || state.meta.challenge === 8;
    v.buyAll.disabled = !v.rows.some(r=>!r.buy.disabled) && v.resonance.disabled;
    layers.forEach((layer,index)=> {
      const can = g.prestigeInfo(layer.id).can;
      v.prestigeButtons[index].disabled = !can;
      v.prestigeButtons[index].textContent = layer.title + (can ? '  +' + fmt(sim.rawGain(state,layer.id,g.config)) : ' · ' + fmt(cfg(layer.threshold)));
    });
    const next = layers.find(l=>g.prestigeInfo(l.id).can);
    v.layers.textContent = next ? next.title + ' доступно' : 'Слои и правила';
    const event = state.run.event;
    v.event.hidden = !event || Date.now() >= event.expires;
    if (!v.event.hidden) {
      v.eventTitle.textContent = content.events[event.id - 1].title + ' · ' + Math.max(0,Math.ceil((event.expires - Date.now()) / 1000)) + ' с';
      v.eventText.textContent = content.events[event.id - 1].text;
    }
    renderFrames(state);
    renderPanel();
    achievements(state);
  }

  function animate(state) {
    if (!v.close || v.tab !== 'rhythm' || !v.rhythm || !state.meta.foldTree.rhythm) return;
    const period = cfg('rhythm.periodMs',1000);
    const anchor = state.run.rhythm.anchor || 0;
    const phase = ((Date.now() - anchor) % period + period) % period / period;
    const distance = Math.min(phase,1-phase);
    const inWindow = distance * period <= cfg('rhythm.windowMs',140);
    v.rhythm.style.setProperty('--pulse-scale',v.reduced ? '1' : String(1 - .35 * Math.sin(Math.PI * phase)));
    v.rhythm.style.setProperty('--pulse-opacity',inWindow ? '1' : '.35');
    v.rhythmMessage.textContent = inWindow ? 'Сейчас' : 'Кольца сближаются';
  }

  const screenSim = Object.assign({},sim);
  delete screenSim.offline;
  await Game.start({sim:screenSim,init:build,render,animate});
})();





