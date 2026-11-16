// Local job board: it shares the game's render loop and owns no timers.
(function () {
  'use strict';
  const tr = (text, ...values) => ui.t(text, ...values);
  const BLADE = '<svg viewBox="0 0 24 36" aria-hidden="true"><path d="M12 2l4 6-2 17h-4L8 8z" fill="#aebed3" stroke="#d7e0eb"/><path d="M6 26h12M12 27v6" stroke="#d2b16b" stroke-width="3" stroke-linecap="round"/></svg>';
  function create(options) {
    const g = options.g, sim = options.sim, A = sim.adventures || window.MFAdventures, h = ui.h;
    const element = h('div', { class: 'mfa', id: 'adventures' });
    const tabs = h('div', { class: 'mfa-tabs', role: 'tablist', 'aria-label': tr('Поручения кузни') });
    const notice = h('div', { class: 'mfa-notice', role: 'status', hidden: true });
    const bank = h('div', { class: 'mfa-training' });
    const body = h('div', { class: 'mfa-body' });
    element.append(tabs, notice, bank, body);
    let tab = 'contracts', key = '', selected = {}, trialSelected = null, confirmCancel = '', disposed = false, data = null;
    const cfg = () => g.config;
    const n = value => g.fmt(value);
    const setting = name => cfg()[name] === undefined ? A.defaults[name] : cfg()[name];
    const benefits = state => sim.outpost && sim.outpost.benefits ? sim.outpost.benefits(state, cfg()) : {};
    const button = (text, click, disabled, attrs) => h('button', Object.assign({ class: 'g-btn small', disabled: !!disabled, onclick: click }, attrs || {}), text);
    const note = text => h('p', { class: 'g-note mfa-note' }, text);
    function message(text) { notice.hidden = !text; notice.textContent = text ? tr(text) : ''; }
    function act(fn, text) {
      let result;
      try { result = g.act(fn, { now: true, reason: 'adventure' }); }
      catch (error) { message(error.message || String(error)); return; }
      if (!result || result.ok === false) { g.sfx('deny'); message(result && result.reason || 'Действие сейчас недоступно'); }
      else { selected = {}; trialSelected = null; confirmCancel = ''; g.sfx('tap'); g.buzz('tap'); message(text || 'Готово'); }
      key = ''; render(g.state);
    }
    function chooseTab(id) { tab = id; key = ''; selected = {}; trialSelected = null; confirmCancel = ''; message(''); render(g.state); }
    ['contracts', 'expeditions', 'trials'].forEach((id, i) => tabs.append(button(tr(['Заказы', 'Походы', 'Испытание'][i]), () => chooseTab(id), false, { role: 'tab', 'data-adventure-tab': id })));
    function card(title, text) { return h('section', { class: 'mfa-card' }, h('h4', {}, tr(title)), text ? note(tr(text)) : null); }
    function locked(wave) { return card('Следующая цель', tr('Откроется с рекордом волны {}', wave)); }
    function preview(state, cells) {
      return sim.previewContractDelivery ? sim.previewContractDelivery(state, cfg(), cells) : A.previewDelivery(state, cfg(), cells, sim.openCells(state, cfg()), level => sim.sellPrice(state, cfg(), level));
    }
    function clearChangedSelection(state) {
      let changed = false;
      Object.keys(selected).forEach(cell => { if (state.run.grid[Number(cell)] !== selected[cell]) { delete selected[cell]; changed = true; } });
      if (changed) message('Клинок изменился. Выберите его снова.');
    }
    function selectionGrid(state, contract) {
      const grid = h('div', { class: 'mfa-delivery-grid', role: 'group', 'aria-label': tr('Клинки для заказа') });
      sim.openCells(state, cfg()).forEach(cell => {
        const level = state.run.grid[cell]; if (!level) return;
        const on = selected[cell] !== undefined, allowed = level >= contract.level;
        const el = button('', () => {
          if (selected[cell] !== undefined) delete selected[cell];
          else if (Object.keys(selected).length < contract.count - contract.delivered) selected[cell] = level;
          else message('Выбрано достаточно клинков для этого заказа');
          key = ''; render(g.state);
        }, !allowed, { class: 'g-btn mfa-blade' + (on ? ' selected' : ''), 'data-deliver-cell': cell, 'aria-pressed': String(on), 'aria-label': tr('Клетка {}: клинок уровня {}', cell + 1, level) });
        el.append(h('span', { class: 'mfa-blade-art', html: BLADE }), h('span', { class: 'g-num' }, tr('ур. {}', level)));
        grid.append(el);
      });
      return grid;
    }
    function cancellation(kind, target, callback) {
      if (confirmCancel !== kind) return button(tr('Отменить'), () => { confirmCancel = kind; key = ''; render(g.state); }, false, { 'data-adventure-cancel': kind });
      return h('div', { class: 'mfa-cancel' }, note(tr(kind === 'contract' ? 'Переданные клинки останутся у покупателя. Новые заказы появятся после ожидания.' : 'Бонус за незавершённый маршрут будет потерян. Обычные награды за бои сохраняются.')),
        button(tr('Подтвердить отмену'), () => act(callback, 'Поручение отменено'), false, { 'data-adventure-cancel-confirm': kind }),
        button(tr('Продолжить'), () => { confirmCancel = ''; key = ''; render(g.state); }));
    }
    function contracts(state) {
      const m = data.contract;
      if (!m.unlocked) return body.append(locked(m.wave));
      if (!m.current) {
        if (m.cooldown > 0) return body.append(card('Покупатель в пути', tr('Новые заказы через {} с', Math.ceil(m.cooldown))));
        const extra = Math.max(0, Math.min(setting('adventures.contract.bonusCap'), benefits(state).contractBonus || 0));
        body.append(note(tr('Выберите заказ и награду. Передаются только выбранные клинки с наковальни.')));
        m.offers.forEach(offer => {
          const el = card(offer.title, offer.text);
          el.append(h('div', { class: 'mfa-order-requirement' }, tr('{} клинка уровня {} или выше', offer.count, offer.level)),
            note(tr('Оплата: стоимость переданных клинков ×{}', n(setting('adventures.contract.gold') + extra))),
            h('div', { class: 'mfa-actions' },
              button(tr('За золото'), () => act(s => sim.acceptContract ? sim.acceptContract(s, cfg(), offer.id, 'gold') : A.acceptContract(s, cfg(), offer.id, 'gold', benefits(s)), 'Заказ принят'), false, { 'data-accept-contract': offer.id, 'data-reward': 'gold' }),
              button(tr('Золото и обучение'), () => act(s => sim.acceptContract ? sim.acceptContract(s, cfg(), offer.id, 'training') : A.acceptContract(s, cfg(), offer.id, 'training', benefits(s)), 'Заказ принят'), false, { 'data-accept-contract': offer.id, 'data-reward': 'training' })),
            note(tr('Обучение: стоимость ×{} и {} опыта наставника', n(setting('adventures.contract.trainingGold') + extra), setting('adventures.contract.xp'))));
          body.append(el);
        });
        return;
      }
      const c = m.current, el = card(c.title);
      el.append(h('div', { class: 'mfa-order-requirement' }, tr('Передано {} / {} · от уровня {}', c.delivered, c.count, c.level)),
        note(tr(c.mode === 'gold' ? 'Выбрана награда золотом' : 'Выбраны золото и опыт наставника')),
        h('div', { class: 'mfa-progress', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': c.count, 'aria-valuenow': c.delivered }, h('i', { style: 'width:' + c.delivered / c.count * 100 + '%' })),
        note(tr('По уже переданным клинкам: {} золота и {} опыта', n(m.reward.gold), m.reward.xp)));
      if (c.delivered < c.count) {
        clearChangedSelection(state);el.append(selectionGrid(state, c));
        const chosen = Object.keys(selected).map(Number), p = chosen.length ? preview(state, chosen) : null;
        if (p && p.ok) el.append(h('div', { class: 'mfa-quote' }, tr('Передать {} клинка · обычная продажа принесла бы {}', chosen.length, n(p.value))));
        el.append(button(tr('Передать выбранные клинки'), () => act(s => {
          for (const cell of chosen) if (s.run.grid[cell] !== selected[cell]) return { ok: false, reason: 'Клинок изменился. Выберите его снова.' };
          return sim.deliverContract ? sim.deliverContract(s, cfg(), chosen) : A.deliver(s, cfg(), chosen, sim.openCells(s, cfg()), level => sim.sellPrice(s, cfg(), level));
        }, 'Клинки переданы покупателю'), !p || !p.ok, { id: 'contract-deliver', class: 'g-btn primary' }));
      } else el.append(button(tr('Забрать {} золота и {} опыта', n(m.reward.gold), m.reward.xp), () => act(s => sim.claimContract ? sim.claimContract(s, cfg()) : A.claimContract(s, cfg(), benefits(s)), 'Заказ выполнен'), false, { id: 'contract-claim', class: 'g-btn primary' }));
      el.append(cancellation('contract', c, s => A.cancelContract(s, cfg())));body.append(el);
    }
    function expeditionMap(current) {
      const line = h('div', { class: 'mfa-route-map', 'aria-label': tr('Прогресс маршрута') });
      const total = current.branch ? current.target : current.target + 3;
      for (let i = 0; i < total; i++) line.append(h('span', { class: 'mfa-route-stop' + (i < current.progress ? ' passed' : '') + (i === current.progress ? ' current' : '') }, String(i + 1)));
      return line;
    }
    function expeditions(state) {
      const m = data.expedition;
      if (!m.unlocked) return body.append(locked(m.wave));
      if (!m.current) {
        if (m.cooldown > 0) return body.append(card('Отряд готовится к дороге', tr('Следующий поход через {} с', Math.ceil(m.cooldown))));
        body.append(note(tr('Поход меняет следующие встречи у ворот. После двух побед выберите продолжение маршрута.')));
        m.routes.forEach(route => {
          const el = card(route.title, route.text);
          el.append(h('div', { class: 'mfa-route-map mini', 'aria-hidden': 'true' }, h('span', { class: 'mfa-route-stop passed' }, '1'), h('span', { class: 'mfa-route-stop' }, '2'), h('span', { class: 'mfa-route-stop fork' }, '?')),
            note(tr('Чудища крепче на {}%. До пяти подходящих побед.', Math.round((setting('adventures.expedition.hp') - 1) * 100))),
            button(tr('Отправиться'), () => act(s => A.startExpedition(s, cfg(), route.id), 'Маршрут начнётся со следующего врага'), false, { 'data-start-expedition': route.id }));
          body.append(el);
        });return;
      }
      const e = m.current, el = card(e.title);
      el.append(expeditionMap(e), note(tr('Подходящих побед: {} / {}', e.progress, e.target)));
      if (e.awaitingChoice) el.append(h('div', { class: 'mfa-fork' }, h('h4', {}, tr('Развилка')),
        note(tr('Пока вы выбираете, обычные бои продолжаются без усиления маршрута.')),
        button(tr('Короткая дорога · ещё {} победа', setting('adventures.expedition.short')), () => act(s => A.chooseRoute(s, cfg(), 'short'), 'Выбран короткий путь'), false, { 'data-route-choice': 'short' }),
        note(tr('Бонус: {}% золота встреч и {} опыта', Math.round(setting('adventures.expedition.shortGold') * 100), setting('adventures.expedition.shortXp'))),
        button(tr('Зайти в руины · ещё {} победы', setting('adventures.expedition.ruins')), () => act(s => A.chooseRoute(s, cfg(), 'ruins'), 'Выбран путь через руины'), false, { 'data-route-choice': 'ruins' }),
        note(tr('В руинах здоровье +{}%, бонус {}% и {} опыта', Math.round((setting('adventures.expedition.ruinsHp') - 1) * 100), Math.round(setting('adventures.expedition.ruinsGold') * 100), setting('adventures.expedition.ruinsXp')))));
      else if (e.complete) el.append(button(tr('Забрать {} золота и {} опыта', n(m.reward.gold), m.reward.xp), () => act(s => sim.claimExpedition ? sim.claimExpedition(s, cfg()) : A.claimExpedition(s, cfg()), 'Поход завершён'), false, { id: 'expedition-claim', class: 'g-btn primary' }));
      else el.append(note(tr('Побеждайте следующих врагов. Повторы старой фарм-волны не считаются.')));
      el.append(cancellation('expedition', e, s => A.cancelExpedition(s, cfg())));body.append(el);
    }
    function trials(state) {
      const m = data.trial;
      if (!m.unlocked) return body.append(locked(m.wave));
      if (!m.current) {
        const el = card('Испытание кузнеца', 'Отдельное учебное поле: сливайте соседние клинки и двигайте их в пустые клетки.');
        el.append(note(tr('Награда: {} опыта наставника за новый этап', m.rewardXp)),
          m.canStart ? button(tr('Начать испытание'), () => act(s => A.startTrial(s, cfg()), 'Учебное поле готово'), false, { id: 'trial-start', class: 'g-btn primary' }) : note(tr('Следующее испытание — с рекорда волны {}', m.nextWave)));
        return body.append(el);
      }
      const t = m.current, el = card(t.title);
      el.append(h('div', { class: 'mfa-order-requirement' }, tr('Цель: уровень {} · ходов {} / {}', t.target, t.moves, t.budget)), note(tr('Выберите клинок, затем соседнюю клетку.')));
      const grid = h('div', { class: 'mfa-trial-grid', role: 'group', 'aria-label': tr('Учебная наковальня') });
      t.grid.forEach((level, cell) => {
        const b = button('', () => {
          if (trialSelected === cell) trialSelected = null;
          else if (trialSelected === null) { if (level) trialSelected = cell; }
          else { const from = trialSelected; act(s => A.moveTrial(s, cfg(), from, cell), 'Ход выполнен'); return; }
          key = '';render(g.state);
        }, t.complete || t.moves >= t.budget, { class: 'g-btn mfa-trial-cell' + (trialSelected === cell ? ' selected' : ''), 'data-trial-cell': cell, 'aria-label': tr('Клетка {}: уровень {}', cell + 1, level) });
        if (level) b.append(h('span', { class: 'mfa-blade-art', html: BLADE }), h('strong', { class: 'g-num' }, String(level)));
        grid.append(b);
      });
      el.append(grid);
      if (t.complete) el.append(button(tr('Получить {} опыта наставника', m.rewardXp), () => act(s => sim.claimTrial ? sim.claimTrial(s, cfg()) : A.claimTrial(s, cfg()), 'Испытание пройдено'), false, { id: 'trial-claim', class: 'g-btn primary' }));
      else if (t.moves >= t.budget) el.append(note(tr('Ходы закончились. Попробуйте другой порядок слияний.')));
      el.append(h('div', { class: 'mfa-actions' }, button(tr('Начать заново'), () => act(s => A.resetTrial(s, cfg()), 'Учебное поле восстановлено'), false, { id: 'trial-reset' }),
        button(tr('Закончить попытку'), () => act(s => A.cancelTrial(s, cfg()), 'Попытка завершена'), false, { id: 'trial-cancel' })),
        note(tr('Можно закрыть панель и продолжить испытание позже.')));
      body.append(el);
    }
    function render(state) {
      if (disposed) return;
      data = A.model(state, cfg(), benefits(state));
      clearChangedSelection(state);
      const heroes = sim.outpost ? sim.outpost.model(state, cfg()).heroes.filter(hero => hero.unlocked) : [];
      const signature = JSON.stringify({ tab, selected, trialSelected, confirmCancel,
        contract: data.contract, expedition: data.expedition, trial: data.trial,
        trainingXp: data.trainingXp, heroes: heroes.map(item => [item.id, item.title]),
        grid: tab === 'contracts' && data.contract.current ? state.run.grid : null });
      // Cooldown labels only change once per second, not on every animation frame.
      const normalized = signature.replace(/("cooldown":)(\d+(?:\.\d+)?)/g, (match, before, value) => before + Math.ceil(Number(value)));
      if (normalized === key) return;
      key = normalized;
      tabs.querySelectorAll('[data-adventure-tab]').forEach(b => { const active = b.dataset.adventureTab === tab;b.classList.toggle('selected', active);b.setAttribute('aria-selected', String(active)); });
      bank.textContent = '';
      bank.append(h('strong', {}, tr('Опыт наставника: {}', data.trainingXp)));
      if (data.trainingXp > 0) {
        const choices = h('div', { class: 'mfa-actions' });
        heroes.forEach(hero => choices.append(button(tr('{} · +{} опыта', tr(hero.title), Math.min(setting('adventures.training.chunk'), data.trainingXp)), () => act(s => A.trainHero(s, cfg(), hero.id), 'Герой получил опыт'), false, { 'data-train-hero': hero.id })));
        bank.append(choices);
        if (!heroes.length) bank.append(note(tr('Пригласите героя, чтобы передать ему опыт.')));
      }
      body.textContent = '';
      if (tab === 'contracts') contracts(state);else if (tab === 'expeditions') expeditions(state);else trials(state);
    }
    function dispose() { disposed = true; element.remove(); }
    render(g.state);
    return { element, render, dispose, inspect: () => ({ tab, model: data, selected: Object.assign({}, selected), trialSelected }) };
  }
  window.MFAdventuresUI = { create };
})();
