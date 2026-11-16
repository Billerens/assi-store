// The collection owns no clock. State, costs and all effects come from the shared artifact rules.
(function () {
  'use strict';
  const GROUPS = [['all', 'Все'], ['click', 'Ручная ковка'], ['passive', 'Пассивные'], ['active', 'Приёмы']];
  const PICTURES = ['hammer', 'bellows', 'hand', 'twin', 'melt', 'sharp', 'eye', 'steel', 'runePower', 'remelt', 'apprentice', 'banner'];
  function tr(text, ...args) { return window.ui.t(text, ...args); }
  function create(options) {
    const g = options.g, sim = options.sim, h = window.ui.h;
    const core = sim.artifacts || window.MFArtifacts;
    let filter = 'all', ownedOnly = false, limit = 6, expanded = '', key = '', model = null, disposed = false, modelKey = ''; 
    const controls = new Map(), quickControls = new Map();
    const balance = h('strong', { class: 'g-num', 'data-artifact-balance': '' });
    const counts = h('span', { class: 'mfa-counts' });
    const notice = h('p', { class: 'mfa-notice', role: 'status', 'aria-live': 'polite', hidden: true });
    const list = h('div', { class: 'mfa-list' });
    const footer = h('div', { class: 'mfa-footer' });
    const tabs = h('div', { class: 'mfa-filters', role: 'group', 'aria-label': tr('Тип артефактов') });
    const tabButtons = new Map();
    const quickCount = h('span', { class: 'mfa-quick-count', 'data-artifact-ready-count': '' });
    const quickElement = h('button', { class: 'g-btn mfa-quick', id: 'artifact-quick-launch', hidden: true, onclick: () => openCategory('active') },
      window.MFArt.el('ui', 'master'), h('span', { class: 'mfa-quick-copy' }, h('span', {}, tr('Приёмы артефактов')), quickCount));
    const element = h('section', { class: 'mfa-collection', id: 'artifact-collection' },
      h('div', { class: 'mfa-heading' }, h('div', {}, h('h4', {}, tr('Коллекция артефактов')), counts),
        h('div', { class: 'mfa-wallet' }, window.MFArt.el('ui', 'coal'), balance)),
      h('p', { class: 'g-note mfa-intro' }, tr('Все купленные артефакты работают вместе. Улучшайте каждый за угли; ненужный эффект можно временно выключить.')),
      h('p', { class: 'g-note mfa-intro' }, tr('Эффекты одного свойства складываются с убывающей отдачей; каждый артефакт усиливает общий бонус.')),
      tabs, notice, list, footer);
    const ownedButton = h('button', { class: 'g-btn small mfa-owned-filter', 'aria-pressed': 'false', 'data-artifact-owned': '', onclick: () => {
      ownedOnly = !ownedOnly; status(''); ownedButton.setAttribute('aria-pressed', String(ownedOnly)); limit = 6; key = ''; paint();
    } }, tr('Только купленные'));
    GROUPS.forEach(([id, title]) => {
      const button = h('button', { class: 'g-btn small' + (id === filter ? ' selected' : ''), 'aria-pressed': String(id === filter), 'data-artifact-filter': id, onclick: () => {
        filter = id; limit = 6; key = ''; status(''); tabButtons.forEach((node, value) => { node.classList.toggle('selected', value === id); node.setAttribute('aria-pressed', String(value === id)); }); paint();
      } }, tr(title));
      tabButtons.set(id, button); tabs.append(button);
    });
    tabs.append(ownedButton);
    function note(text) { return h('p', { class: 'g-note mfa-note' }, text); }
    function picture(item) {
      const set = item.iconSet || 'up';
      const known = window.MFArt.sets[set] && window.MFArt.sets[set][item.icon];
      const art = window.MFArt.el(known ? set : 'up', known ? item.icon : PICTURES[item.index % PICTURES.length] || PICTURES[0], 'mfa-icon');
      art.setAttribute('aria-hidden', 'true'); return art;
    }
    function status(text) { notice.textContent = text; notice.hidden = !text; }
    function act(fn, text) {
      let result;
      try { result = g.act(fn, { now: true, reason: 'artifact' }); }
      catch (error) { status(error.message || String(error)); g.sfx('deny'); return; }
      if (!result || result.ok === false) { status(tr(result && result.reason || 'Действие сейчас недоступно')); g.sfx('deny'); }
      else { status(tr(text)); g.sfx('tap'); g.buzz('tap'); key = ''; render(g.state); }
    }
    function effectText(item, next) {
      const effect = next ? item.next : item.current;
      if (effect && effect.template) {
        const args = effect.args || [];
        return tr(effect.template, ...args.map((value, index) => typeof value === 'number'
          ? /откат \{\} с/.test(effect.template) && index === args.length - 1 ? Math.ceil(value) : g.fmt(value, { digits: 2 })
          : value));
      }
      const template = next ? item.nextText : item.currentText;
      if (Array.isArray(template)) return tr(template[0], ...template.slice(1));
      return template ? tr(template) : tr(item.description || '');
    }
    function use(item) { act(s => sim.activateArtifact(s, g.config, item.id, Date.now()), 'Приём выполнен'); }
    function buy(item) {
      act(s => {
        const current = core.model(s, g.config).items.find(entry => entry.id === item.id);
        if (!current || current.level !== item.level || !Big.eq(current.cost, item.cost)) return { ok: false, reason: 'Цена изменилась. Проверьте улучшение ещё раз.' };
        return core.buy(s, g.config, item.id);
      }, item.level ? 'Артефакт улучшен' : 'Артефакт куплен');
    }
    function activeButton(item, quick) {
      const label = h('span', { class: quick ? 'mfa-quick-title' : '' }, quick ? tr(item.title) : tr('Применить'));
      const time = h('span', { class: 'mfa-cooldown' });
      const button = h('button', { class: 'g-btn mfa-use' + (quick ? ' mfa-quick-use' : ''), id: 'artifact-use-' + (quick ? 'quick-' : '') + item.id, 'data-artifact-use': item.id,
        'data-artifact-surface': quick ? 'quick' : 'collection', onclick: () => use(item) }, label, time);
      (quick ? quickControls : controls).set(item.id, { button, time });
      return button;
    }
    function card(item) {
      const isOpen = expanded === item.id;
      const row = h('article', { class: 'mfa-card' + (isOpen ? ' expanded' : '') + (item.level && !item.enabled ? ' disabled' : ''), 'data-artifact': item.id });
      const heading = h('button', { class: 'mfa-card-toggle', id: 'artifact-card-' + item.id, 'aria-expanded': String(isOpen),
        'aria-controls': 'artifact-detail-' + item.id, 'data-artifact-expand': item.id, onclick: () => { expanded = isOpen ? '' : item.id; key = ''; status(''); paint(); } },
        picture(item), h('span', { class: 'mfa-card-title' }, h('strong', {}, tr(item.title)),
          h('span', { class: 'mfa-meta' }, item.level ? tr('Уровень {}', item.level) + ' · ' + tr(item.enabled ? 'Включён' : 'Выключен') : tr('Доступен для покупки'))),
        h('span', { class: 'mfa-chevron', 'aria-hidden': 'true' }, isOpen ? '−' : '+'));
      row.append(heading);
      if (item.kind === 'passive') row.append(note(item.level ? tr('Общий бонус свойства') : tr('Общий бонус после покупки')));
      row.append(h('p', { class: 'mfa-effect' }, effectText(item, !item.level)));
      if (item.kind === 'active' && item.level) row.append(activeButton(item, false));
      if (isOpen) {
        const detail = h('div', { class: 'mfa-detail', id: 'artifact-detail-' + item.id });
        detail.append(note(tr(item.description)));
        if (item.level) detail.append(h('button', { class: 'g-btn small mfa-toggle', id: 'artifact-toggle-' + item.id, role: 'switch', 'aria-checked': String(!!item.enabled),
          'data-artifact-toggle': item.id, onclick: () => act(s => core.setEnabled(s, item.id, !item.enabled), item.enabled ? 'Эффект выключен' : 'Эффект включён') },
          tr(item.enabled ? 'Выключить эффект' : 'Включить эффект')));
        if (!item.maxLevel || item.level < item.maxLevel) {
          detail.append(h('div', { class: 'mfa-next' }, h('small', {}, item.kind === 'passive' ? (item.level ? tr('Общий бонус после улучшения') : tr('Общий бонус после покупки')) : (item.level ? tr('Следующее улучшение') : tr('После покупки'))), h('strong', {}, effectText(item, true))));
          if (item.level && !item.enabled) detail.append(note(tr('Эффект выключен. Улучшение начнёт действовать после включения.')));
          detail.append(h('button', { class: 'g-btn primary mfa-buy', id: 'artifact-buy-' + item.id, disabled: !item.canBuy, 'data-artifact-buy': item.id,
            onclick: () => buy(item) },
            h('span', {}, item.level ? tr('Улучшить до уровня {}', item.level + 1) : tr('Купить артефакт')),
            h('strong', { class: 'g-num' }, tr('{} углей', g.fmt(item.cost)))));
          if (!item.canBuy) detail.append(note(tr('Не хватает углей. Их даёт перековка.')));
        } else detail.append(note(tr('Достигнут предел улучшений')));
        row.append(detail);
      }
      return row;
    }
    function paint() {
      if (!model || disposed) return;
      const focused = document.activeElement;
      const focusedId = focused && focused.id;
      const scroll = element.closest('.sheet');
      const oldScroll = scroll ? scroll.scrollTop : 0;
      controls.clear(); list.replaceChildren(); footer.replaceChildren();
      const visible = model.items.filter(item => (item.level || item.available) && (filter === 'all' || item.kind === filter) && (!ownedOnly || item.level));
      const sorted = visible.slice().sort((a, b) => Number(!!b.level) - Number(!!a.level) || a.index - b.index);
      sorted.slice(0, limit).forEach(item => list.append(card(item)));
      if (!sorted.length) list.append(note(ownedOnly ? tr('Здесь пока нет купленных артефактов.') : tr('Новые артефакты откроются по мере развития кузни.')));
      if (sorted.length > limit) footer.append(h('button', { class: 'g-btn', id: 'artifact-more', 'data-artifact-more': '', onclick: () => { limit += 6; key = ''; paint(); } },
        tr('Показать ещё {}', Math.min(6, sorted.length - limit))));
      if (!ownedOnly) {
        const next = model.items.filter(item => !item.level && !item.available && (filter === 'all' || item.kind === filter));
        const seen = new Set();
        next.forEach(item => {
          if (seen.has(item.kind)) return;
          seen.add(item.kind);
          footer.append(h('div', { class: 'mfa-upcoming', 'data-artifact-next': item.id }, picture(item),
            h('div', {}, h('strong', {}, tr(item.title)), note(item.unlock && item.unlock.template ? tr(item.unlock.template, ...(item.unlock.args || [])) : tr(item.unlockText || 'Откроется позже')))));
        });
      }
      if (scroll) scroll.scrollTop = oldScroll;
      if (focusedId) { const target = element.querySelector('#' + CSS.escape(focusedId)); if (target) target.focus({ preventScroll: true }); }
      updateControls();
    }
    function updateControls() {
      if (!model) return;
      const byId = new Map(model.items.map(item => [item.id, item]));
      [controls, quickControls].forEach(map => map.forEach((nodes, id) => {
        const item = byId.get(id); if (!item) return;
        const disabled = !item.enabled || !item.ready;
        if (nodes.button.disabled !== disabled) nodes.button.disabled = disabled;
        nodes.button.classList.toggle('ready', !!item.ready && !!item.enabled);
        const text = !item.enabled ? tr('Выключен') : item.remaining > 0 ? tr('Эффект {} с · откат {} с', Math.ceil(item.remaining), Math.ceil(item.cooldown))
          : item.cooldown > 0 ? tr('{} с', Math.ceil(item.cooldown)) : item.ready ? tr('Готово') : tr('Сейчас недоступно');
        if (nodes.time.textContent !== text) nodes.time.textContent = text;
      }));
    }
    // Cooldown ticks do not change prices or permanent effects. Rebuild the catalog only when
    // its inputs change; read the tiny live clock fields separately from the cached view model.
    function catalogKey(state) {
      const f = state.layers && state.layers.forge || {}, star = state.layers && state.layers.star || {};
      const m = state.meta || {}, run = state.run || {}, owned = m.artifacts && m.artifacts.items || {}, effects = run.artifacts && run.artifacts.effects || {};
      return JSON.stringify([f.currency, f.count, star.count, f.state && f.state.record, run.maxWave, m.bestWave, m.outpost && m.outpost.seenWave,
        g.config['artifacts.cost.rankGrowth'], g.config['artifacts.cost.collectionGrowth'],
        Object.keys(owned).sort().map(id => [id, owned[id].level, owned[id].enabled]),
        Object.keys(effects).sort().filter(id => effects[id].left > 0).map(id => [id, effects[id].power])]);
    }
    function render(state) {
      if (disposed || !core) return;
      const nextModelKey = catalogKey(state);
      if (!model || modelKey !== nextModelKey) {
        model = core.model(state, g.config); modelKey = catalogKey(state);
        model.items.forEach((item, index) => { item.index = index; });
      }
      const inventory = state.meta.artifacts.items, effects = state.run.artifacts.effects;
      model.items.forEach(item => {
        const own = inventory[item.id];
        item.cooldown = own ? own.cooldown : 0;
        item.remaining = effects[item.id] ? effects[item.id].left : 0;
        item.ready = !!own && own.enabled && item.kind === 'active' && item.cooldown <= 1e-9;
      });
      const balanceText = tr('{} углей', g.fmt(model.coals));
      if (balance.textContent !== balanceText) balance.textContent = balanceText;
      const owned = model.items.filter(item => item.level), enabled = owned.filter(item => item.enabled);
      const countText = tr('Куплено: {} / {} · включено: {}', owned.length, model.items.length, enabled.length);
      if (counts.textContent !== countText) counts.textContent = countText;
      const nextKey = JSON.stringify([filter, ownedOnly, limit, expanded, model.items.map(item => [item.id, item.available, item.level, item.enabled, item.cost, item.canBuy, item.current, item.next, item.currentText, item.nextText])]);
      if (nextKey !== key) { key = nextKey; paint(); }
      const actives = owned.filter(item => item.kind === 'active' && item.enabled);
      quickElement.hidden = !actives.length;
      const quickText = tr('Готово: {} / {}', actives.filter(item => item.ready).length, actives.length);
      if (quickCount.textContent !== quickText) quickCount.textContent = quickText;
      updateControls();
    }
    function dispose() { disposed = true; element.remove(); quickElement.remove(); controls.clear(); quickControls.clear(); }
    render(g.state);
    function openCategory(kind) {
      filter = GROUPS.some(group => group[0] === kind) ? kind : 'all';
      ownedOnly = filter === 'active'; limit = 6; expanded = ''; key = ''; status('');
      tabButtons.forEach((node, value) => { node.classList.toggle('selected', value === filter); node.setAttribute('aria-pressed', String(value === filter)); });
      ownedButton.setAttribute('aria-pressed', String(ownedOnly)); paint();
      if (options.onOpen) options.onOpen(filter);
    }
    function open(id) {
      if (id && model && model.items.some(item => item.id === id && (item.level || item.available))) {
        filter = 'all'; ownedOnly = false; expanded = id;
        const visible = model.items.filter(item => item.level || item.available).sort((a, b) => Number(!!b.level) - Number(!!a.level) || a.index - b.index);
        limit = Math.max(6, Math.ceil((visible.findIndex(item => item.id === id) + 1) / 6) * 6);
        tabButtons.forEach((node, value) => { node.classList.toggle('selected', value === filter); node.setAttribute('aria-pressed', String(value === filter)); });
        ownedButton.setAttribute('aria-pressed', 'false'); key = ''; paint();
      }
      if (options.onOpen) options.onOpen();
    }
    return { element, quickElement, render, open, openCategory, dispose };
  }
  window.MFArtifactsUI = { create };
})();
