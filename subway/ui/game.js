// The screen of «Подземка» (docs/games/subway.md, «Экран и управление»). The engine (Game.start)
// gives the frame: g.el.top (money, income), g.el.field (the scheme), g.el.actions (under the
// thumb). The logic is ../sim.js; every number comes from g.config. Narrow (the cover screen):
// a vertical strip of the current line, swipe left/right changes the line, the tabs open as a
// sheet. Wide (unfolded): the whole city map on the left, the line card, the buttons and the tab
// panel on the right. The selected line and the tab survive folding (no reload).
(async function () {
  const h = ui.h;
  const sim = window.GameSim;
  const view = { sel: 1, qty: 1, tab: 'lines', sheet: null, sheetTab: 'lines', anim: true, warp: false, phase: 0, lastAch: 0, eventKey: '' };
  let g = null;
  let C = { lines: { lines: [], paths: {} }, stations: [], city: { cities: [], unlocks: {}, tasks: {}, tariffs: [], retro: [], notes: [], districts: [] }, events: { questions: {}, buttons: {} }, bureau: { bureau: {}, patents: {} } };
  const stockEvents = {};
  let note = null;

  // ---- content (texts and lists are data: content/*.json) -------------------------------------------
  async function json(name) {
    try {
      const r = await fetch('../content/' + name + '.json');
      return r.ok ? await r.json() : null;
    } catch (error) {
      return null;
    }
  }
  const loaded = await Promise.all(['lines', 'stations', 'city', 'events', 'bureau'].map(json));
  ['lines', 'stations', 'city', 'events', 'bureau'].forEach((k, i) => { if (loaded[i]) C[k] = loaded[i]; });
  try {
    view.sel = Number(sessionStorage.getItem('subway:sel')) || 1;
  } catch (ignored) { /* private */ }

  function lineInfo(tier) { return C.lines.lines.find((l) => l.tier === tier) || { tier: tier, title: 'Линия ' + tier, color: '#888888' }; }
  function lineName(tier) { return lineInfo(tier).title; }
  function lineColor(tier) { return lineInfo(tier).color; }
  function cityInfo(n) {
    const base = ((n - 1) % 10) + 1;
    const c = C.city.cities.find((x) => x.n === base) || { title: 'Город ' + n, rule: '', opens: '' };
    const round = Math.floor((n - 1) / 10) + 1;
    return { n: n, title: c.title + (round > 1 ? ' — круг ' + round : ''), rule: c.rule, opens: n <= 10 ? c.opens : '' };
  }
  function stationName(state, tier, j) {
    const pool = C.stations.concat(state.run.names || []);
    if (!pool.length) return 'Станция ' + (j + 1);
    const len = pool.length;
    const k = (j * 7 + tier * 13) % len;
    const lap = Math.floor(j / len);
    // The built-in names in the interface's language (the map is data-raw: the page does not
    // translate it by itself); the model's names from the stock are kept as written.
    const name = k < C.stations.length ? ui.t(pool[k]) : pool[k];
    return name + (lap ? '-' + (lap + 1) : '');
  }
  function tariffName(state, k) {
    if (k < C.city.tariffs.length) return C.city.tariffs[k];
    const own = state.run.tariffNames && state.run.tariffNames[k];
    return own || 'Тариф №' + (k + 1);
  }
  function retroName(i) { return C.city.retro[i] || 'Ретро-состав ' + (i + 1); }

  // ---- small helpers ----------------------------------------------------------------------------------
  const now = () => Date.now();
  function cfg() { return g.config; }
  function fmtPrice(x) { return g.fmt.price(x) + ' ₽'; }
  /** A picture of a row (ui/art.js): {name, state: '' | 'done' | 'locked', color, color2, on}. */
  function pic(name, state, extra) { return Object.assign({ name: name, state: state || '' }, extra || {}); }
  function linePic(tier, state) { return pic('line:' + tier, state, { color: lineColor(tier) }); }
  function lineArt(tier, cls) { return SubwayArt.el('line:' + tier, { color: lineColor(tier), cls: cls || '' }); }
  function deny() {
    g.sfx('deny');
    g.buzz('deny');
  }
  function ok(sound) {
    g.sfx(sound || 'buy');
    g.buzz(sound === 'level' ? 'level' : 'buy');
  }
  function selLine(state) {
    const s = state || g.state;
    if (!sim.lineOf(s, view.sel)) view.sel = s.run.lines[s.run.lines.length - 1].tier;
    return sim.lineOf(s, view.sel);
  }
  function select(tier) {
    if (!sim.lineOf(g.state, tier)) return;
    view.sel = tier;
    try {
      sessionStorage.setItem('subway:sel', String(tier));
    } catch (ignored) { /* private */ }
    g.redraw();
  }
  function shiftLine(dir) {
    const tiers = g.state.run.lines.map((l) => l.tier);
    const i = tiers.indexOf(view.sel);
    const next = tiers[(i + dir + tiers.length) % tiers.length];
    if (next !== view.sel) {
      select(next);
      g.sfx('tap');
    }
  }
  function ctxNow() {
    return { now: now(), config: g.config, rng: g.rng, mult: g.links.mult(), links: g.links.status(), stock: {}, offline: false };
  }

  /** A button that repeats while held: 4 a second at first, faster to ui.holdMaxRate. fn() → bought? */
  function repeat(button, fn) {
    let timer = 0;
    let started = 0;
    let fired = false;
    function stop() {
      clearTimeout(timer);
      timer = 0;
    }
    function loop() {
      if (!fn()) {
        stop();
        return;
      }
      const c = cfg();
      const p = Math.min(1, (now() - started) / 1000 / c['ui.holdAccelSec']);
      const rate = c['ui.holdRate'] + (c['ui.holdMaxRate'] - c['ui.holdRate']) * p;
      timer = setTimeout(loop, 1000 / rate);
    }
    button.addEventListener('pointerdown', (event) => {
      if (button.disabled) return;
      event.preventDefault();
      fired = true;
      started = now();
      if (fn()) timer = setTimeout(loop, cfg()['ui.holdStartMs']);
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach((name) => button.addEventListener(name, stop));
    button.addEventListener('contextmenu', (event) => event.preventDefault());
    button.addEventListener('click', (event) => {
      // A keyboard press or an automated click (event.detail 0) buys once; the pointer did it already.
      if (fired && event.detail !== 0) {
        fired = false;
        return;
      }
      fired = false;
      fn();
    });
    return button;
  }

  // ---- keyed rows of the panels (built once, updated in place) ----------------------------------------
  function rows(container) {
    const nodes = new Map();
    function make(sp) {
      const n = { sp: sp };
      if (sp.type === 'head') {
        n.el = h('div', { class: 'sw-head' });
      } else if (sp.type === 'note') {
        n.el = h('p', { class: 'g-note sw-pnote' });
      } else if (sp.type === 'progress') {
        n.bar = h('i', {});
        n.t = h('div', { class: 'sw-ptitle' });
        n.s = h('div', { class: 'sw-psub g-num' });
        n.icon = h('span', { class: 'sw-picon' });
        n.el = h('div', { class: 'sw-prow' }, n.icon, h('div', { class: 'grow' }, n.t, n.s, h('div', { class: 'g-progress sw-bar' }, n.bar)));
      } else {
        n.icon = h('span', { class: 'sw-picon' });
        n.t = h('div', { class: 'sw-ptitle' });
        n.s = h('div', { class: 'sw-psub g-num' });
        n.bl = h('span', {});
        n.bs = h('span', { class: 'g-sub g-num' });
        n.btn = h('button', { class: 'g-btn small sw-pbtn' }, h('span', {}, n.bl, n.bs));
        if (sp.hold) g.ui.hold(n.btn, cfg()['prestige.holdMs'], () => n.sp.fn && n.sp.fn());
        else n.btn.addEventListener('click', () => n.sp.fn && n.sp.fn());
        n.el = h('div', { class: 'sw-prow' + (sp.tap ? ' tap' : '') }, n.icon, h('div', { class: 'grow' }, n.t, n.s), n.btn);
        if (sp.tap) n.el.addEventListener('click', (event) => { if (event.target.closest('button') !== n.btn && n.sp.tap) n.sp.tap(); });
      }
      return n;
    }
    function update(n, sp) {
      n.sp = sp;
      if (sp.type === 'head' || sp.type === 'note') {
        if (n.el.textContent !== sp.title) n.el.textContent = sp.title;
        return;
      }
      if (n.t.textContent !== sp.title) n.t.textContent = sp.title;
      const sub = sp.sub || '';
      if (n.s.textContent !== sub) n.s.textContent = sub;
      n.s.hidden = !sub;
      const a = sp.art || null;
      const k = a ? [a.name, a.color || '', a.color2 || '', a.state || '', a.on === false ? 0 : 1].join('|') : '';
      if (n.icon.dataset.k !== k) {
        n.icon.dataset.k = k;
        n.icon.replaceChildren.apply(n.icon, a ? [SubwayArt.el(a.name, a)] : []);
      }
      n.icon.hidden = !a;
      n.el.classList.toggle('done', !!sp.done);
      n.el.classList.toggle('locked', !!(a && a.state === 'locked'));
      if (sp.type === 'progress') {
        n.bar.style.width = Math.round(Math.max(0, Math.min(1, sp.value || 0)) * 100) + '%';
        return;
      }
      n.btn.hidden = !sp.label;
      if (sp.label) {
        if (n.bl.textContent !== sp.label) n.bl.textContent = sp.label;
        const bs = sp.price || '';
        if (n.bs.textContent !== bs) n.bs.textContent = bs;
        n.bs.hidden = !bs;
        n.btn.disabled = !sp.can;
        n.btn.classList.toggle('primary', !!sp.primary);
        n.btn.classList.toggle('on', !!sp.on);
      }
      n.el.classList.toggle('sel', !!sp.selected);
    }
    return function (specs) {
      const seen = new Set();
      let prev = null;
      specs.forEach((sp) => {
        let n = nodes.get(sp.key);
        if (!n || n.sp.type !== sp.type || !!n.sp.hold !== !!sp.hold) {
          if (n) n.el.remove();
          n = make(sp);
          nodes.set(sp.key, n);
        }
        update(n, sp);
        seen.add(sp.key);
        const want = prev ? prev.el.nextSibling : container.firstChild;
        if (want !== n.el) container.insertBefore(n.el, want);
        prev = n;
      });
      nodes.forEach((n, k) => {
        if (!seen.has(k)) {
          n.el.remove();
          nodes.delete(k);
        }
      });
    };
  }

  // ---- actions --------------------------------------------------------------------------------------
  function buy(kind) {
    const c = cfg();
    const tier = view.sel;
    const before = sim.lineOf(g.state, tier);
    const milesBefore = before ? sim.miles(before.stations, c) : 0;
    const cityMiles = g.state.run.cityMiles;
    const bought = g.act((s) => sim.buyPlan(s, c, tier, kind, view.qty));
    if (!bought) {
      deny();
      return false;
    }
    const line = sim.lineOf(g.state, tier);
    if (kind === 'station') g.achieve('first-station');
    if (line && sim.miles(line.stations, c) > milesBefore) {
      ok('level');
      g.flash('up', 'Веха ' + line.stations + ' станций', lineName(tier) + ': спрос ×' + c['milestone.mult']);
    } else ok('buy');
    if (g.state.run.cityMiles > cityMiles) g.flash('crown', 'Веха города', 'Весь доход ' + g.fmt.mult(sim.cityMileMult(g.state, c)));
    // A name for the new stations from the stock prepared by the model while there was network.
    if (kind === 'station' && line && line.stations % 10 === 0) takeName();
    return true;
  }

  async function takeName() {
    const item = await g.stock.take('stations');
    if (!item || !item.title || item.procedural) return;
    g.act((s) => {
      s.run.names = (s.run.names || []).concat([String(item.title)]).slice(-200);
    });
  }

  function tapTurnstile() {
    const amount = g.act((s) => sim.tap(s, cfg(), g.links.mult(), now()));
    if (!amount || Big.isZero(amount)) return;
    g.sfx('tap');
    g.buzz('tap');
    view.tapFlash = { text: '+' + g.fmt(amount), at: now() };
  }

  function tapValue(state) {
    const c = cfg();
    const x = sim.envOf(state, c, now(), true);
    const loud = sim.bureauLevel(state, 'loud') ? c['bureau.loudMult'] : 1;
    return Big.mul(Big.add(c['turnstile.base'], Big.mul(sim.income(state, c, now(), true), c['turnstile.share'])), x.tap * loud * g.links.mult());
  }

  async function rushBoost() {
    const r = await g.links.spend('boost');
    if (!r.ok) {
      ui.toast(r.off ? 'Связка «Шаги» выключена' : 'Нужна ' + r.need + ' энергия — это ~' + g.fmt(r.need * cfg()['steps.perSteps']) + ' шагов');
      deny();
      return;
    }
    g.act((s) => { s.run.boostUntil = Math.max(now(), s.run.boostUntil || 0) + cfg()['boost.minutes'] * 60000; }, { now: true, reason: 'spend' });
    ok('level');
    g.flash('energy', 'Час пик', 'Доход ×' + cfg()['boost.mult'] + ' на ' + cfg()['boost.minutes'] + ' минут');
  }

  function act(fn, sound) {
    const r = g.act(fn);
    if (r) ok(sound);
    else deny();
    return r;
  }

  // ---- the move (prestige layer 1) ------------------------------------------------------------------
  function moveSheet() {
    const c = cfg();
    const info = g.prestigeInfo(sim.LAYER);
    if (!info.can) {
      deny();
      ui.toast('Переезд — от ' + g.fmt(info.minGain) + ' новых ОИ');
      return;
    }
    const next = cityInfo(sim.cityOf(g.state) + 1);
    const hint = sim.moveHint(g.state, c);
    let close = null;
    const go = h('button', { class: 'g-btn primary', id: 'sw-move-hold' }, 'Удерживайте, чтобы переехать');
    g.ui.hold(go, c['prestige.holdMs'], async () => {
      close();
      const r = await g.prestige(sim.LAYER, { confirm: false });
      if (r && r.ok) afterMove();
    });
    close = g.sheet([
      h('h3', {}, 'Новый город: ' + next.title),
      next.rule ? g.ui.line('Правило города', next.rule) : null,
      next.opens ? g.ui.line('Откроется навсегда', next.opens) : null,
      h('div', { class: 'g-lines' },
        g.ui.line('Получите', '+' + g.fmt(info.gain) + ' ОИ'),
        g.ui.line('Было → станет', g.fmt(info.have) + ' → ' + g.fmt(info.after)),
        g.ui.line('Доход', g.fmt.mult(info.bonusBefore) + ' → ' + g.fmt.mult(info.bonusAfter)),
        g.ui.line('Сбросится', info.layer.lose),
        g.ui.line('Останется', info.layer.keep)),
      hint ? h('span', { class: 'g-mark' }, 'выгодно') : h('p', { class: 'g-note' }, 'Выгодно станет с ' + g.fmt(Big.max(Big.mul(info.have, c['prestige.hintRatio']), c['oi.hintMin'])) + ' новых ОИ'),
      go,
      h('button', { class: 'g-btn small', onclick: () => close() }, 'Отмена')
    ]);
  }

  function afterMove() {
    const s = g.state;
    const city = cityInfo(sim.cityOf(s));
    g.achieve('moved');
    view.sel = 1;
    const opened = (s.run.unlocked || []).map((k) => C.city.unlocks[k] || 'новая механика');
    g.flash('map', 'Город ' + city.n + ': ' + city.title, (city.rule || '') + (opened.length ? ' · Открыто: ' + opened.join(', ') : ''), 6000);
    closeSheet();
    buildMap(true);
  }

  async function generalMove() {
    const r = await g.prestige(sim.GENERAL);
    if (r && r.ok) {
      g.achieve('general');
      view.sel = 1;
      g.flash('crown', 'Генеральный конструктор', '+' + g.fmt(r.gain) + ' ' + g.fmt.plural(Big.toNumber(r.gain), 'патент', 'патента', 'патентов'), 6000);
      closeSheet();
      buildMap(true);
    }
  }

  // ---- the panels (tabs) ------------------------------------------------------------------------------
  function linesSpecs(s) {
    const c = cfg();
    const stats = sim.lineStats(s, c, now());
    const out = [{ key: 'h-lines', type: 'head', title: 'Линии города — ' + stats.length }];
    stats.forEach((st) => {
      const dc = sim.dispatcherCost(s, c, st.line);
      out.push({
        key: 'l' + st.tier, type: 'item', art: linePic(st.tier), title: lineName(st.tier) + (st.ground ? ' · наземная' : ''),
        sub: st.stations + ' ст. · ' + st.trains + ' поезд. · ' + g.fmt.rate(Big.mul(st.income, g.links.mult())) + (st.crowd ? ' · толпа' : ''),
        selected: st.tier === view.sel, tap: () => {
          select(st.tier);
          if (view.sheet && g.layout !== 'wide') closeSheet();
        },
        label: st.dispatcher ? 'Диспетчер есть' : 'Диспетчер', price: st.dispatcher ? 'возит офлайн' : fmtPrice(dc),
        can: !st.dispatcher && Big.gte(s.run.money, dc), on: st.dispatcher,
        fn: () => {
          if (act((x) => sim.hireDispatcher(x, c, st.tier))) {
            const n = g.state.run.lines.filter((l) => l.dispatcher).length;
            if (n >= c['ach.dispatchers']) g.achieve('dispatch-room');
          }
        }
      });
    });
    const t = sim.nextTier(s);
    if (t) {
      const cost = sim.openCost(s, c, t);
      out.push({
        key: 'open', type: 'item', art: linePic(t, 'locked'), title: 'Открыть ' + lineName(t), sub: 'Придёт с ' + c['line.startStations'] + ' станциями и ' + c['line.startTrains'] + ' поездом',
        label: 'Открыть', price: fmtPrice(cost), can: Big.gte(s.run.money, cost), primary: true,
        fn: () => {
          if (act((x) => sim.openLine(x, c), 'level')) {
            select(t);
            takeName();
            if (g.state.run.lines.length >= c['ach.lines']) g.achieve('city-built');
            buildMap(true);
          }
        }
      });
    } else {
      out.push({ key: 'all-open', type: 'note', title: 'Все линии города открыты' + (sim.unlocked(s, 'ground') ? '' : '. Наземные линии откроются в шестом городе') });
    }
    return out;
  }

  function upgradesSpecs(s) {
    const c = cfg();
    const R = sim.rules(s, c);
    const line = selLine(s);
    const out = [];
    const links = g.links.status();
    if (links && links.steps && links.steps.on) {
      const left = Math.max(0, Math.ceil(((s.run.boostUntil || 0) - now()) / 60000));
      out.push({ key: 'boost', type: 'item', art: pic('up:boost'), title: 'Час пик за энергию', sub: left ? 'Идёт: ещё ' + left + ' мин' : 'Доход ×' + c['boost.mult'] + ' на ' + c['boost.minutes'] + ' минут',
        label: 'Час пик', price: '1 энергия', can: g.links.energy() >= 1, fn: rushBoost });
    }
    out.push({ key: 'h-line', type: 'head', title: 'Линия ' + line.tier + ' · ' + lineName(line.tier) });
    if (sim.unlocked(s, 'districts')) {
      const rush = rushNow(s);
      const counts = [1, 2, 3, 4].map((d) => districtName(d) + ' ' + sim.districtCount(line.stations, line.tier, d)).join(', ');
      out.push({ key: 'districts', type: 'item', art: pic('up:districts'), title: ui.t('Районы станций: {}', counts),
        sub: rush > 0 ? ui.t('Сейчас час пик: {} ×{}', districtName(rush), c['rush.mult']) : ui.t('Час пик: {} — спальные ×{}, {} — деловые ×{}', c['rush.morning'], c['rush.mult'], c['rush.evening'], c['rush.mult']) });
    }
    const cc = sim.carsCost(s, c, line);
    out.push({ key: 'cars', type: 'item', art: pic('up:cars'), title: 'Длиннее составы: поезд на ' + sim.cars(s, line, c) + ' ст.', sub: cc ? 'Поезд обслужит на станцию больше' : 'Составы самые длинные',
      label: cc ? 'Вагон' : 'Готово', price: cc ? fmtPrice(cc) : '', can: !!cc && Big.gte(s.run.money, cc), fn: () => act((x) => sim.buyCars(x, c, line.tier)) });
    if (sim.unlocked(s, 'express')) {
      out.push({ key: 'express', type: 'item', art: pic('up:express'), title: 'Экспресс', sub: 'Поезд берёт на ' + c['express.cars'] + ' ст. меньше, спрос ×' + c['express.demand'] + ': выгодно, когда поездов с запасом',
        label: line.express ? 'Выключить' : 'Включить', can: true, on: line.express, fn: () => act((x) => sim.toggleExpress(x, c, line.tier), 'tap') });
    }
    if (sim.unlocked(s, 'night')) {
      const dc = sim.dutyCost(s, c, line);
      out.push({ key: 'duty', type: 'item', art: pic('up:duty', line.duty ? 'done' : ''), title: 'Ночное дежурство', sub: 'С ' + c['night.hours'] + ' линия без дежурства стоит, с ним — ×' + c['night.dutyMult'],
        label: line.duty ? 'Есть' : 'Нанять', price: line.duty ? '' : fmtPrice(dc), can: !line.duty && Big.gte(s.run.money, dc), on: line.duty, fn: () => act((x) => sim.buyDuty(x, c, line.tier)) });
    }
    if (sim.unlocked(s, 'recon')) {
      const used = s.run.lines.some((l) => l.recon);
      out.push({ key: 'recon', type: 'item', art: pic('up:recon', line.recon ? 'done' : used ? 'locked' : ''), hold: true, title: 'Реконструкция', sub: line.recon ? 'Линия уже перестроена: ×' + c['recon.mult'] : used ? 'В этом городе уже была' : 'Линия обратно к ' + c['recon.stations'] + ' станциям ради ×' + c['recon.mult'] + ' до конца города',
        label: line.recon ? 'Готово' : 'Удерживать', can: !line.recon && !used && line.stations > c['recon.stations'], fn: () => {
          if (act((x) => sim.reconstruct(x, c, line.tier), 'level')) buildMap(true);
        } });
    }
    out.push({ key: 'h-city', type: 'head', title: 'Весь город' });
    const tc = sim.tariffCost(s, c, R);
    out.push({ key: 'tariff', type: 'item', art: pic('up:tariff'), title: 'Тариф: ' + tariffName(s, s.run.tariffs || 0), sub: 'Весь доход ×' + c['tariff.mult'] + (s.run.tariffs ? ' · куплено ' + s.run.tariffs : ''),
      label: 'Купить', price: fmtPrice(tc), can: Big.gte(s.run.money, tc), fn: () => {
        if (act((x) => sim.buyTariff(x, c))) maybeTariffName();
      } });
    const limit = sim.transferLimit(s, c, R);
    out.push({ key: 'h-tr', type: 'head', title: 'Пересадки — ' + s.run.transfers.length + ' из ' + limit + ' (×' + sim.transferMult(s, c) + ' обеим линиям)' });
    if (s.run.lines.length < 2) out.push({ key: 'tr-none', type: 'note', title: 'Пересадка связывает две линии — откройте вторую' });
    else if (s.run.transfers.length >= limit) out.push({ key: 'tr-full', type: 'note', title: 'Предел пересадок города' + (sim.bureauLevel(s, 'transfers') ? '' : ' — Бюро поднимает его на ' + c['bureau.transfersPlus']) });
    else {
      sim.transferPairs(s, c, now()).slice(0, 6).forEach((p) => {
        out.push({ key: 'tr' + p.a + '-' + p.b, type: 'item', art: pic('up:transfer', '', { color: lineColor(p.a), color2: lineColor(p.b) }), title: lineName(p.a) + ' — ' + lineName(p.b), sub: '+' + g.fmt.rate(p.gain),
          label: 'Проложить', price: fmtPrice(p.cost), can: Big.gte(s.run.money, p.cost), fn: () => {
            if (act((x) => sim.buyTransfer(x, c, p.a, p.b))) {
              const busy = g.state.run.lines.some((l) => sim.lineStats(g.state, c, now()).find((st) => st.tier === l.tier).transfers >= c['ach.hubTransfers']);
              if (busy) g.achieve('transfer-hub');
              buildMap(true);
            }
          } });
      });
    }
    s.run.transfers.forEach((p) => out.push({ key: 'trd' + p[0] + '-' + p[1], type: 'item', art: pic('up:transfer', 'done', { color: lineColor(p[0]), color2: lineColor(p[1]) }), title: lineName(p[0]) + ' — ' + lineName(p[1]), sub: 'Пересадка есть', done: true }));
    if (sim.unlocked(s, 'ring')) {
      const rc = sim.ringCost(s, c, R);
      out.push({ key: 'ring', type: 'item', art: pic('up:ring', s.run.ring ? 'done' : ''), title: 'Кольцевая линия', sub: s.run.ring ? 'Пересадка с каждой линией: ×' + c['ring.mult'] : 'Пересекает все линии: каждой ×' + c['ring.mult'],
        label: s.run.ring ? 'Есть' : 'Построить', price: s.run.ring ? '' : fmtPrice(rc), can: !s.run.ring && s.run.lines.length >= 2 && Big.gte(s.run.money, rc), on: s.run.ring,
        fn: () => { if (act((x) => sim.buyRing(x, c), 'level')) buildMap(true); } });
    }
    if (sim.unlocked(s, 'airport')) {
      const ac = sim.airportCost(s, c, R);
      const has10 = !!sim.lineOf(s, 10);
      out.push({ key: 'airport', type: 'item', art: pic('up:airport', s.run.airport ? 'done' : has10 ? '' : 'locked'), title: 'Экспресс в аэропорт', sub: s.run.airport ? 'Аэропортовая ×' + c['airport.mult'] + ', Центральная с пересадкой' : has10 ? 'Аэропортовая ×' + c['airport.mult'] + ' и пересадка для Центральной' : 'Нужна Аэропортовая линия',
        label: s.run.airport ? 'Есть' : 'Построить', price: s.run.airport ? '' : fmtPrice(ac), can: !s.run.airport && has10 && Big.gte(s.run.money, ac), on: s.run.airport,
        fn: () => { if (act((x) => sim.buyAirport(x, c), 'level')) buildMap(true); } });
    }
    return out;
  }

  async function maybeTariffName() {
    const k = (g.state.run.tariffs || 0);
    if (k < C.city.tariffs.length) return;
    if (g.state.run.tariffNames && g.state.run.tariffNames[k]) return;
    const item = await g.stock.take('tariffs');
    if (!item || !item.title) return;
    g.act((s) => {
      s.run.tariffNames = s.run.tariffNames || {};
      s.run.tariffNames[k] = String(item.title);
    });
  }

  function citySpecs(s) {
    const c = cfg();
    const n = sim.cityOf(s);
    const city = cityInfo(n);
    const out = [{ key: 'h-city', type: 'head', title: 'Город ' + n + ' · ' + city.title }];
    if (city.rule) out.push({ key: 'rule', type: 'note', title: 'Правило: ' + city.rule });
    const info = g.prestigeInfo(sim.LAYER);
    const hint = sim.moveHint(s, c);
    const next = cityInfo(n + 1);
    out.push({ key: 'move', type: 'item', art: pic('city:move', info.can ? '' : 'locked'), title: 'Переезд: ' + next.title, sub: info.can ? '+' + g.fmt(info.gain) + ' ОИ, доход ' + g.fmt.mult(info.bonusBefore) + ' → ' + g.fmt.mult(info.bonusAfter) + (hint ? ' · выгодно' : '') : 'Нужно ' + g.fmt(info.minGain) + ' новых ОИ, сейчас ' + g.fmt(info.gain),
      label: 'Переехать', price: info.can ? '+' + g.fmt(info.gain) + ' ОИ' : '', can: info.can, primary: hint, fn: moveSheet });
    if (sim.unlocked(s, 'general')) {
      const gi = g.prestigeInfo(sim.GENERAL);
      out.push({ key: 'general', type: 'item', art: pic('city:general', gi.can ? '' : 'locked'), title: 'Генеральный конструктор', sub: gi.can ? '+' + g.fmt(gi.gain) + ' патентов; города, ОИ и Чертежи сбросятся' : 'Патенты = корень из ОИ за всё время / ' + g.fmt(c['patent.div']),
        label: 'Стать', price: gi.can ? '+' + g.fmt(gi.gain) : '', can: gi.can, fn: generalMove });
    }
    out.push({ key: 'h-tasks', type: 'head', title: 'Задания города — Чертёж и ретро-состав за каждое' });
    sim.TASKS.forEach((kind) => {
      const p = sim.taskProgress(s, c, kind, now());
      const need = kind === 'income' ? g.fmt(p.need) : kind === 'calm' ? g.fmt.time(p.need) : String(p.need);
      const have = kind === 'income' ? g.fmt(p.have) : kind === 'calm' ? g.fmt.time(p.have) : String(p.have);
      const title = (C.city.tasks[kind] || 'Задание города').replace('{need}', need);
      const frac = kind === 'income' ? (Big.isZero(p.need) ? 1 : Math.min(1, Math.max(0, Big.log10(Big.max(p.have, 1)) / Math.max(1, Big.log10(p.need))))) : Math.min(1, Big.toNumber(p.have) / Math.max(1, Big.toNumber(p.need)));
      out.push({ key: 't-' + kind, type: 'progress', art: pic('task:' + kind, p.done ? 'done' : ''), done: p.done, title: (p.done ? 'Сделано: ' : '') + title, sub: p.done ? 'Чертёж и ретро-состав получены' : have + ' из ' + need, value: p.done ? 1 : frac });
    });
    // The listed milestones and one more after the last reached: past the list they go on without an end.
    const listed = String(c['cityMile.list']).split(',').length;
    const ml = [];
    for (let i = 0; i < Math.max(listed, s.run.cityMiles + 1) && isFinite(sim.cityMileNeed(c, i)); i++) ml.push(sim.cityMileNeed(c, i));
    const minSt = s.run.lines.reduce((m, l) => Math.min(m, l.stations), Infinity);
    out.push({ key: 'h-mile', type: 'head', title: 'Вехи города — весь доход' });
    ml.forEach((need, i) => {
      const done = s.run.cityMiles > i;
      const lines = s.run.lines.length;
      out.push({ key: 'cm' + i, type: 'progress', art: pic('mile:' + i, done ? 'done' : ''), done: done, title: (done ? 'Есть: ' : '') + 'на всех линиях от ' + need + ' станций — ×' + sim.cityMileStep(c, i),
        sub: done ? 'Множитель получен' : lines < c['cityMile.minLines'] ? 'Нужно ' + c['cityMile.minLines'] + ' открытых линий, сейчас ' + lines : 'Меньше всего станций: ' + minSt, value: done ? 1 : Math.min(1, minSt / need) * Math.min(1, lines / c['cityMile.minLines']) });
    });
    out.push({ key: 'h-retro', type: 'head', title: 'Ретро-составы — +' + Math.round(c['retro.bonus'] * 100) + ' % своей линии за каждый' });
    s.meta.retro.forEach((count, i) => {
      out.push({ key: 'r' + i, type: 'item', art: pic('retro:' + i, count ? '' : 'locked', { color: lineColor(i + 1) }), title: retroName(i), sub: count ? 'В коллекции: ' + count + ' — ' + lineName(i + 1) + ' +' + Math.round(count * c['retro.bonus'] * 100) + ' %' : 'Ещё не найден', done: count > 0 });
    });
    out.push({ key: 'h-stat', type: 'head', title: 'Статистика' });
    out.push({ key: 'st-carried', type: 'note', title: 'Перевезено пассажиров: ' + g.fmt(s.meta.carried) + ' (в этом городе ' + g.fmt(s.run.carried) + ')' });
    out.push({ key: 'st-cities', type: 'note', title: 'Переездов: ' + (s.layers.city.count || 0) + ', лучший город: ' + (s.meta.maxCity || 1) + ', событий собрано: ' + (s.meta.collected || 0) });
    return out;
  }

  function bureauSpecs(s) {
    const c = cfg();
    const out = [];
    if (!sim.unlocked(s, 'bureau')) {
      out.push({ key: 'h-b', type: 'head', title: 'Бюро инженера' });
      out.push({ key: 'locked', type: 'note', title: 'Откроется во втором городе. Чертежи за задания копятся уже сейчас: ' + sim.blueprints(s) });
    } else {
      out.push({ key: 'h-b', type: 'head', title: 'Бюро инженера — Чертежей ' + sim.blueprints(s) });
      sim.BUREAU.forEach((node) => {
        const t = C.bureau.bureau[node.id] || { title: 'Отдел бюро', text: '' };
        const lv = sim.bureauLevel(s, node.id);
        const cost = sim.bureauCost(s, c, node.id);
        const needs = node.needs && !sim.bureauLevel(s, node.needs);
        out.push({ key: 'b-' + node.id, type: 'item', art: pic('bureau:' + node.id, cost === null ? 'done' : needs ? 'locked' : ''), title: t.title + (node.levels ? ' · уровень ' + lv : ''),
          sub: needs ? 'Сначала: ' + (C.bureau.bureau[node.needs] || {}).title : t.text, done: cost === null,
          label: cost === null ? 'Есть' : 'Взять', price: cost === null ? '' : cost + ' ' + g.fmt.plural(cost, 'чертёж', 'чертежа', 'чертежей'),
          can: cost !== null && !needs && sim.blueprints(s) >= cost, fn: () => act((x) => sim.bureauBuy(x, c, node.id), 'level') });
        if (t.auto && lv) autoRow(out, s, node.id, t.title);
      });
    }
    const pts = Big.toNumber(Big.of(s.layers.general.currency, 0));
    if (sim.unlocked(s, 'general') || pts > 0) {
      out.push({ key: 'h-p', type: 'head', title: 'Патентное бюро — очков ' + sim.patentLeft(s, c) + ' из ' + pts });
      sim.PATENTS.forEach((node) => {
        const t = C.bureau.patents[node.id] || { title: 'Патент', text: '' };
        const lv = sim.patentLevel(s, node.id);
        const cost = sim.patentCost(s, c, node.id);
        out.push({ key: 'p-' + node.id, type: 'item', art: pic('patent:' + node.id, cost === null ? 'done' : ''), title: t.title + (node.levels ? ' · уровень ' + lv : ''), sub: t.text, done: cost === null,
          label: cost === null ? 'Есть' : 'Взять', price: cost === null ? '' : cost + ' очк.', can: cost !== null && sim.patentLeft(s, c) >= cost,
          fn: () => { if (act((x) => sim.patentBuy(x, c, node.id), 'level')) buildMap(true); } });
        if (t.auto && lv) autoRow(out, s, node.id, t.title);
      });
    }
    return out;
  }

  function autoRow(out, s, id, title) {
    const on = sim.autoOn(s, id);
    out.push({ key: 'a-' + id, type: 'item', art: pic('up:auto', '', { on: on }), title: title + ': ' + (on ? 'работает' : 'выключен'), sub: 'Автоматику можно остановить, если хотите строить сами',
      label: on ? 'Выключить' : 'Включить', can: true, on: on, fn: () => act((x) => sim.setAuto(x, id, !on), 'tap') });
  }

  const PANELS = { lines: linesSpecs, upgrades: upgradesSpecs, city: citySpecs, bureau: bureauSpecs };
  const TABS = [['lines', 'Линии', 'train'], ['upgrades', 'Улучшения', 'up'], ['city', 'Город', 'map'], ['bureau', 'Бюро', 'gear']];

  function tabStrip(onPick, current) {
    const buttons = TABS.map(([id, title, icon]) => h('button', { class: 'sw-tab', 'data-tab': id, onclick: () => onPick(id) }, GameIcons.el(icon), h('span', {}, title)));
    const el = h('div', { class: 'sw-tabs', role: 'tablist' }, buttons);
    el.mark = (id) => buttons.forEach((b) => b.classList.toggle('on', b.dataset.tab === id));
    el.mark(current);
    return el;
  }

  function openSheet(tab) {
    if (g.layout === 'wide') {
      view.tab = tab;
      view.inlineStrip.mark(tab);
      g.redraw();
      return;
    }
    closeSheet();
    view.sheetTab = tab;
    const box = h('div', { class: 'sw-panel', 'data-panel': tab });
    const strip = tabStrip((id) => {
      view.sheetTab = id;
      strip.mark(id);
      box.dataset.panel = id;
      box.replaceChildren();
      view.sheet.update = rows(box);
      view.sheet.update(PANELS[id](g.state));
    }, tab);
    const close = g.sheet([strip, box, h('button', { class: 'g-btn small', onclick: () => closeSheet() }, 'Закрыть')], () => { view.sheet = null; });
    view.sheet = { close: close, update: rows(box) };
    view.sheet.update(PANELS[tab](g.state));
  }

  function closeSheet() {
    if (!view.sheet) return;
    const s = view.sheet;
    view.sheet = null;
    try {
      s.close();
    } catch (ignored) { /* closed */ }
  }

  // ---- the scheme: geometry of the paths ----------------------------------------------------------------
  const GEO = {};
  function geo(tier) {
    if (GEO[tier]) return GEO[tier];
    const pts = (C.lines.paths && C.lines.paths[String(tier)]) || [[100, 100 + tier * 60], [900, 100 + tier * 60]];
    const segs = [];
    let total = 0;
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      segs.push({ a: a, b: b, len: len, from: total });
      total += len;
    }
    GEO[tier] = { pts: pts, segs: segs, total: total };
    return GEO[tier];
  }
  function at(tier, f) {
    const G = geo(tier);
    const d = Math.max(0, Math.min(1, f)) * G.total;
    let seg = G.segs[G.segs.length - 1];
    for (let i = 0; i < G.segs.length; i++) {
      if (d <= G.segs[i].from + G.segs[i].len) {
        seg = G.segs[i];
        break;
      }
    }
    const t = seg.len ? (d - seg.from) / seg.len : 0;
    return { x: seg.a[0] + (seg.b[0] - seg.a[0]) * t, y: seg.a[1] + (seg.b[1] - seg.a[1]) * t, angle: Math.atan2(seg.b[1] - seg.a[1], seg.b[0] - seg.a[0]) * 180 / Math.PI };
  }
  const MEET = {};
  function meet(a, b) {
    const key = a + '-' + b;
    if (MEET[key]) return MEET[key];
    let top = null;
    for (let i = 0; i <= 60; i++) {
      const p = at(a, i / 60);
      for (let j = 0; j <= 60; j++) {
        const q = at(b, j / 60);
        const d = Math.hypot(p.x - q.x, p.y - q.y);
        if (!top || d < top.d) top = { d: d, p: p, q: q };
      }
    }
    MEET[key] = top;
    return top;
  }
  function sample(n, k) {
    // k station indices spread along a line of n stations (the first and the last always).
    if (n <= k) return Array.from({ length: n }, (_, i) => i);
    const out = [];
    for (let i = 0; i < k; i++) out.push(Math.round(i * (n - 1) / (k - 1)));
    return out;
  }
  /** A name in one line when it fits max characters, otherwise in two (cut at a space when there is one). */
  function wrapName(text, max) {
    const t = String(text);
    if (t.length <= max) return [t];
    let cut = t.lastIndexOf(' ', max);
    if (cut < max * 0.4) cut = max;
    return [t.slice(0, cut).trim(), t.slice(cut).trim()];
  }
  function esc(t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  /** The whole city (wide). Rebuilt when its shape changes; the trains move in animate(). */
  function cityMarkup(s, stats) {
    const c = cfg();
    const rush = rushNow(s);
    let svg = '<svg class="sw-city" viewBox="0 0 1000 1000" preserveAspectRatio="xMidYMid meet" role="img" aria-label="' + esc(ui.t('Схема метро')) + '">';
    // The ground of the city: the quarters, the river, the centre.
    svg += '<g class="sw-ground"><circle cx="500" cy="500" r="455" class="sw-zone"/><circle cx="500" cy="500" r="150" class="sw-zone"/>';
    svg += '<path d="M-20 215C150 180 240 330 400 320S640 170 790 215s170 80 250 60" class="sw-river"/></g>';
    if (s.run.ring) {
      const rc = C.lines.ringCircle || [500, 500, 265];
      svg += '<circle cx="' + rc[0] + '" cy="' + rc[1] + '" r="' + rc[2] + '" class="sw-ring"/>';
    }
    stats.forEach((st) => {
      const G = geo(st.tier);
      const d = 'M' + G.pts.map((p) => p[0] + ' ' + p[1]).join(' L');
      const color = lineColor(st.tier);
      const sel = st.tier === view.sel;
      svg += '<g class="sw-mline' + (sel ? ' sel' : '') + (st.ground ? ' ground' : '') + '" data-tier="' + st.tier + '">';
      svg += '<path d="' + d + '" class="sw-hit"/>';
      svg += '<path d="' + d + '" class="sw-track" stroke="' + color + '"/>';
      const idx = sample(st.stations, c['ui.mapStations']);
      idx.forEach((j, i) => {
        const p = at(st.tier, idx.length > 1 ? i / (idx.length - 1) : 0);
        const crowd = j >= st.served;
        const boosted = rush > 0 && sim.district(j, st.tier) === rush;
        svg += '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="' + (sel ? 9 : 7) + '" class="sw-st' + (crowd ? ' crowd' : '') + (boosted ? ' rush' : '') + '" stroke="' + color + '"/>';
        if (crowd) {
          const dots = Math.min(3, 1 + Math.floor(st.crowd / Math.max(1, st.stations) * 6));
          for (let k = 0; k < dots; k++) svg += '<circle cx="' + (p.x + 14 + k * 9).toFixed(1) + '" cy="' + (p.y - 12).toFixed(1) + '" r="3.2" class="sw-crowd"/>';
        }
      });
      const trains = Math.min(st.trains, 3);
      for (let k = 0; k < trains; k++) {
        svg += '<g class="sw-train" data-tier="' + st.tier + '" data-k="' + k + '"><rect x="-17" y="-9" width="34" height="18" rx="6" fill="' + color + '" class="sw-tbody"/>';
        svg += '<rect x="-12" y="-5" width="7" height="10" rx="2" class="sw-twin"/><rect x="5" y="-5" width="7" height="10" rx="2" class="sw-twin"/></g>';
      }
      const p0 = at(st.tier, 0);
      svg += '<circle cx="' + p0.x + '" cy="' + p0.y + '" r="24" fill="' + color + '" class="sw-num"/><text x="' + p0.x + '" y="' + (p0.y + 8) + '" class="sw-numt">' + st.tier + '</text>';
      svg += '</g>';
    });
    s.run.transfers.forEach((tr) => {
      const m = meet(tr[0], tr[1]);
      if (!m) return;
      const dx = m.q.x - m.p.x;
      const dy = m.q.y - m.p.y;
      const len = Math.hypot(dx, dy);
      const ox = len > 18 ? 0 : 9;
      const ax = m.p.x - ox;
      const bx = len > 18 ? m.q.x : m.p.x + ox;
      const by = len > 18 ? m.q.y : m.p.y;
      svg += '<line x1="' + ax.toFixed(1) + '" y1="' + m.p.y.toFixed(1) + '" x2="' + bx.toFixed(1) + '" y2="' + by.toFixed(1) + '" class="sw-bridge"/>';
      svg += '<circle cx="' + ax.toFixed(1) + '" cy="' + m.p.y.toFixed(1) + '" r="11" class="sw-tr" stroke="' + lineColor(tr[0]) + '"/>';
      svg += '<circle cx="' + bx.toFixed(1) + '" cy="' + by.toFixed(1) + '" r="11" class="sw-tr" stroke="' + lineColor(tr[1]) + '"/>';
    });
    if (s.run.airport) {
      const p = at(10, 1);
      svg += '<g transform="translate(' + (p.x - 25) + ' ' + (p.y - 25) + ') scale(1.25)">' + SubwayArt.svg('up:airport', { size: 40 }) + '</g>';
    }
    return svg + '</svg>';
  }

  /** The district of a station by name (content/city.json), in the interface's language. */
  function districtName(d) { return ui.t(C.city.districts[d - 1] || String(d)); }
  /** -1 — no districts yet; 0 — districts, no rush hour now; 1/2 — the boosted district now. */
  function rushNow(s) { return sim.unlocked(s, 'districts') ? sim.envOf(s, cfg(), now(), true).rush : -1; }

  /** The cover screen: a vertical strip of the current line with station names (and districts). */
  function stripMarkup(s, st, width) {
    const c = cfg();
    const rush = rushNow(s);
    const idx = sample(st.stations, c['ui.stripStations']);
    // With districts a station takes two lines (the name, the district under it): nothing runs off 380 px.
    const row = rush >= 0 ? 42 : 34;
    const top = 20;
    const H = top * 2 + row * Math.max(1, idx.length - 1);
    const color = lineColor(st.tier);
    const x = 26;
    let svg = '<svg class="sw-strip" viewBox="0 0 ' + width + ' ' + H + '" width="' + width + '" height="' + H + '" role="img" aria-label="' + esc(ui.t('Линия {}', st.tier)) + '">';
    svg += '<rect x="' + (x - 6) + '" y="' + top + '" width="12" height="' + (H - top * 2) + '" rx="6" fill="' + color + '"' + (st.ground ? ' class="ground"' : '') + '/>';
    svg += '<line x1="' + x + '" y1="' + top + '" x2="' + x + '" y2="' + (H - top) + '" class="sw-sleepers"/>';
    idx.forEach((j, i) => {
      const y = top + i * row;
      const crowd = j >= st.served;
      const end = i === 0 || i === idx.length - 1;
      svg += '<circle cx="' + x + '" cy="' + y + '" r="' + (end ? 11 : 9) + '" class="sw-st' + (crowd ? ' crowd' : '') + '" stroke="' + color + '"/>';
      if (!crowd) svg += '<circle cx="' + x + '" cy="' + y + '" r="' + (end ? 4 : 3) + '" class="sw-stdot"/>';
      if (i > 0 && idx[i] - idx[i - 1] > 1) svg += '<text x="' + (width - 8) + '" y="' + (y - row / 2 + 5) + '" class="sw-gap">' + esc(ui.t('ещё {} ст.', idx[i] - idx[i - 1] - 1)) + '</text>';
      // SVG text does not wrap by itself: a long name (the model's own) goes on two lines, never off the edge.
      const room = width - x - 22 - (crowd ? 44 : 8);
      const nm = wrapName(stationName(s, st.tier, j), Math.max(8, Math.floor(room / 8.6)));
      const two = nm.length > 1;
      const ny = rush >= 0 ? (two ? y - 9 : y - 2) : (two ? y - 3 : y + 5);
      svg += '<text x="' + (x + 22) + '" y="' + ny + '" class="sw-name' + (crowd ? ' crowd' : '') + (two ? ' two' : '') + '">' + esc(nm[0]);
      if (two) svg += '<tspan x="' + (x + 22) + '" dy="14"' + (nm[1].length * 7.4 > room ? ' textLength="' + room + '" lengthAdjust="spacingAndGlyphs"' : '') + '>' + esc(nm[1]) + '</tspan>';
      svg += '</text>';
      if (rush >= 0) {
        const d = sim.district(j, st.tier);
        svg += '<text x="' + (x + 22) + '" y="' + (two ? y + 18 : y + 14) + '" class="sw-dist' + (d === rush ? ' rush' : '') + '">' + esc(districtName(d)) + (d === rush ? ' ×' + c['rush.mult'] : '') + '</text>';
      }
      if (crowd) {
        const dots = Math.min(c['ui.crowdDots'], 1 + Math.floor(st.crowd / Math.max(1, st.stations) * c['ui.crowdDots'] * 2));
        for (let k = 0; k < dots; k++) svg += '<circle cx="' + (width - 10 - k * 10) + '" cy="' + y + '" r="3.5" class="sw-crowd"/>';
      }
    });
    const trains = Math.min(st.trains, 4);
    for (let k = 0; k < trains; k++) {
      svg += '<g class="sw-train" data-k="' + k + '"><rect x="' + (x - 8) + '" y="-13" width="16" height="26" rx="5" fill="' + color + '" class="sw-tbody"/>';
      svg += '<rect x="' + (x - 4.5) + '" y="-9" width="9" height="5" rx="1.5" class="sw-twin"/><rect x="' + (x - 4.5) + '" y="4" width="9" height="5" rx="1.5" class="sw-twin"/></g>';
    }
    svg += '</svg>';
    view.stripTop = top;
    view.stripLen = H - top * 2;
    return svg;
  }

  function buildMap(force) {
    if (!g) return;
    if (view.world) return;
    const s = g.state;
    const c = cfg();
    const stats = sim.lineStats(s, c, now());
    if (g.layout === 'wide') {
      const sig = 'w|' + view.sel + '|' + rushNow(s) + '|' + s.run.ring + '|' + s.run.airport + '|' + s.run.transfers.length + '|' + stats.map((st) => st.tier + ':' + Math.min(st.stations, c['ui.mapStations']) + ':' + Math.min(st.served, c['ui.mapStations']) + ':' + Math.min(3, st.trains) + ':' + Math.min(3, Math.floor(st.crowd / Math.max(1, st.stations) * 6))).join(',');
      if (!force && sig === view.mapSig) return;
      view.mapSig = sig;
      view.map.innerHTML = cityMarkup(s, stats);
    } else {
      const st = stats.find((x) => x.tier === view.sel) || stats[0];
      const width = Math.max(200, Math.round(view.map.clientWidth || 300));
      const sig = 'n|' + st.tier + '|' + st.stations + '|' + st.served + '|' + Math.min(4, st.trains) + '|' + width + '|' + (s.run.names || []).length + '|' + rushNow(s);
      if (!force && sig === view.mapSig) return;
      view.mapSig = sig;
      view.map.innerHTML = stripMarkup(s, st, width);
    }
    view.trains = Array.from(view.map.querySelectorAll('.sw-train'));
  }

  function moveTrains(dt) {
    if (!view.trains || !view.trains.length) return;
    const c = cfg();
    view.phase = (view.phase + dt / c['ui.trainSec']) % 2;
    const wide = g.layout === 'wide';
    view.trains.forEach((el) => {
      const k = Number(el.dataset.k);
      // Back and forth along the line, the trains spread over it.
      let f = (view.phase + k * 0.55) % 2;
      if (f > 1) f = 2 - f;
      if (wide) {
        const p = at(Number(el.dataset.tier), f);
        el.setAttribute('transform', 'translate(' + p.x.toFixed(1) + ' ' + p.y.toFixed(1) + ') rotate(' + p.angle.toFixed(0) + ')');
      } else {
        el.setAttribute('transform', 'translate(0 ' + (view.stripTop + f * view.stripLen).toFixed(1) + ')');
      }
    });
  }

  // ---- the event card -------------------------------------------------------------------------------------
  function eventText(ev, s) {
    const t = C.events[ev.kind] || { title: 'Событие', text: '' };
    const own = stockEvents[ev.kind] && stockEvents[ev.kind][0];
    let text = (own && own.text) || t.text || '';
    let title = (own && own.title) || t.title || 'Событие';
    const q = ev.q ? (own && own.question) || C.events.questions[ev.q] || '' : '';
    text = text.replace('{line}', ev.tier ? lineName(ev.tier) : '').replace('{question}', q).replace('{retro}', ev.retro !== undefined ? retroName(ev.retro) : '');
    return { title: title, text: text, icon: t.icon || 'sparkle' };
  }

  function buildEvent(s) {
    const ev = s.run.event;
    const key = ev && ev.until > now() ? ev.kind + ':' + ev.at : '';
    if (key === view.eventKey) return;
    view.eventKey = key;
    if (!key) {
      view.event.replaceChildren();
      view.event.hidden = true;
      return;
    }
    const c = cfg();
    const t = eventText(ev, s);
    const buttons = [];
    function take(choice) {
      const r = g.act((x) => {
        const got = sim.collect(x, c, choice, now(), g.links.mult());
        // The card shows the retro train itself; the flash of showRetro() is for the tasks.
        if (got && got.kind === 'retro') delete x.run.lastRetro;
        return got;
      }, { now: true, reason: 'event' });
      if (!r) return;
      if (!r.ok) {
        deny();
        if (r.need === 'money') ui.toast('Не хватает: ' + fmtPrice(r.amount));
        return;
      }
      if (stockEvents[ev.kind] && stockEvents[ev.kind].length) stockEvents[ev.kind].shift();
      let text = '';
      if (r.kind === 'inspector') text = r.right ? 'Верно: +' + g.fmt(r.amount) + ' ₽' : 'Неверно: это ' + lineName(r.answer);
      else if (r.amount && Big.sign(r.amount) > 0) text = '+' + g.fmt(r.amount) + ' ₽';
      else if (r.kind === 'retro') text = retroName(r.retro);
      else if (r.kind === 'mall') text = ui.t('{}: спрос станции +{} % навсегда', stationName(g.state, r.tier, r.station), Math.round(c['mall.bonus'] * 100));
      else if (r.kind === 'escalator') text = r.paid ? lineName(ev.tier) + ' +10 % навсегда' : 'Пропущено';
      else if (r.kind === 'glove') text = '+1 Чертёж';
      g.sfx(r.amount || r.kind === 'retro' || r.kind === 'glove' ? 'chest' : 'level');
      g.buzz('chest');
      g.flash(t.icon, t.title, text, 2500);
      view.eventKey = '';
      fetchEventText();
    }
    if (ev.kind === 'mall') {
      (ev.choices || []).forEach((p, i) => buttons.push(h('button', { class: 'g-btn small sw-choice', onclick: () => take(i) }, lineArt(p.t, 'small'), h('span', {}, stationName(s, p.t, p.j)))));
    } else if (ev.kind === 'inspector') {
      (ev.choices || []).forEach((tier) => buttons.push(h('button', { class: 'g-btn small sw-choice', onclick: () => take(tier) }, lineArt(tier, 'small'), h('span', {}, lineName(tier)))));
    } else if (ev.kind === 'escalator') {
      const price = Big.mul(Big.mul(sim.income(s, c, now(), true), g.links.mult()), c['escalator.costMin'] * 60);
      buttons.push(h('button', { class: 'g-btn small primary', onclick: () => take('pay') }, h('span', {}, 'Починить', h('span', { class: 'g-sub g-num' }, fmtPrice(price)))));
      buttons.push(h('button', { class: 'g-btn small', onclick: () => take('skip') }, 'Пропустить'));
    } else {
      buttons.push(h('button', { class: 'g-btn primary', onclick: () => take() }, C.events.buttons.take || 'Забрать'));
    }
    view.eventBar = h('i', {});
    view.event.replaceChildren(
      h('div', { class: 'sw-ev-head' }, SubwayArt.el('event:' + ev.kind), h('div', { class: 'grow' }, h('div', { class: 'sw-ev-title' }, t.title), h('div', { class: 'sw-ev-text' }, t.text))),
      h('div', { class: 'g-progress sw-ev-bar' }, view.eventBar),
      h('div', { class: 'sw-ev-btns' + (buttons.length > 2 ? ' three' : '') }, buttons));
    view.event.hidden = false;
    g.sfx('tap');
    g.buzz('tap');
  }

  async function fetchEventText() {
    if (!g.stock.count('events')) return;
    const item = await g.stock.take('events');
    if (!item || !item.kind) return;
    (stockEvents[item.kind] = stockEvents[item.kind] || []).push(item);
  }

  async function fetchNote() {
    const item = await g.stock.take('notes');
    if (item && item.title) note = item;
    else if (C.city.notes.length) note = C.city.notes[Math.floor(Math.random() * C.city.notes.length)];
  }

  // ---- the summary «Пока вас не было» ------------------------------------------------------------------------
  function onOffline(report) {
    const s = g.state;
    const a = s.run.away;
    const c = cfg();
    if (a) {
      if (Big.gt(a.carried || 0, 0)) report.events.push('Перевезено пассажиров: ' + g.fmt(a.carried));
      const bought = [];
      // Each part through ui.t: the joined line is matched by the dictionary only as a whole.
      if (a.stations) bought.push(ui.t('станции — {}', a.stations));
      if (a.trains) bought.push(ui.t('поезда — {}', a.trains));
      if (a.tariffs) bought.push(ui.t('тарифы — {}', a.tariffs));
      if (a.transfers) bought.push(ui.t('пересадки — {}', a.transfers));
      if (a.built) bought.push(ui.t('автостроитель — {}', a.built));
      if (bought.length) report.events.push('Автоматы купили: ' + bought.join(', '));
    }
    const stats = sim.lineStats(s, c, now()).filter((st) => st.dispatcher);
    if (!stats.length) report.events.push('Без диспетчеров линии офлайн не возят — наймите их во вкладке «Линии»');
    else {
      const top = stats.reduce((m, st) => (Big.gt(st.income, m.income) ? st : m), stats[0]);
      report.events.push('Самая доходная линия: ' + lineName(top.tier) + ' — ' + g.fmt.rate(top.income));
      const plan = sim.stationPlan(s, c, top.tier, 'mile');
      if (plan && Big.gte(s.run.money, plan.cost)) report.events.push('Хватает на ' + plan.stations + ' ст. до вехи ' + plan.target + ' на линии «' + lineName(top.tier) + '»');
      else if (plan) report.events.push('До вехи ' + plan.target + ' на линии «' + lineName(top.tier) + '» не хватает ' + fmtPrice(Big.sub(plan.cost, s.run.money)));
    }
    if (note) {
      report.events.push(note.title + ': ' + note.text);
      note = null;
      fetchNote();
    }
    g.act((x) => { x.run.away = null; });
  }

  // ---- the debug panel (debug.panel on; long press on the money) -------------------------------------------------
  function debugSheet() {
    const c = cfg();
    const s = g.state;
    const line = selLine(s);
    const R = sim.rules(s, c);
    const B = sim.baseCost(line.tier, R, c);
    const P = sim.demand(line.tier, R, c);
    const out = h('pre', { class: 'sw-pre', 'data-raw': '' });
    const box = h('textarea', { class: 'sw-text', rows: 4, 'data-raw': '' });
    const formulas = [
      'Линия ' + line.tier + ': B = ' + g.fmt(B) + ', P = ' + g.fmt(P) + ', рост ' + R.growth,
      'Станция: B·g^n = ' + g.fmt(B) + '·' + R.growth + '^' + line.stations + ' = ' + g.fmt(sim.stationsCost(line, 1, R, c)),
      'Поезд: ' + c['train.costMult'] + '·B·' + c['train.growth'] + '^' + line.trains + ' = ' + g.fmt(sim.trainsCost(line, 1, R, c)),
      'Обслужено: min(' + line.stations + ', ' + sim.cars(s, line, c) + '·' + line.trains + ') = ' + sim.served(s, line, c),
      'Множитель линии: ' + g.fmt.mult(sim.lineMult(s, line, c, sim.envOf(s, c, now(), true))) + ', общий: ' + g.fmt.mult(sim.globalMult(s, c, sim.envOf(s, c, now(), true))),
      'Доход: ' + g.fmt.rate(sim.income(s, c, now(), true)) + ', офлайн: ' + g.fmt.rate(sim.offlineRate(s, c, now()))
    ];
    out.textContent = formulas.join('\n');
    let close = null;
    close = g.sheet([
      h('h3', {}, 'Отладка'),
      h('div', { class: 'g-btns' },
        h('button', { class: 'g-btn small' + (view.warp ? ' primary' : ''), onclick: () => { view.warp = !view.warp; close(); } }, view.warp ? 'Перемотка ×' + c['debug.warp'] + ': выкл.' : 'Перемотка ×' + c['debug.warp'])),
      h('div', { class: 'g-btns' }, [1, 8, 12, 720].map((hrs) => h('button', { class: 'g-btn small', onclick: () => { close(); g.debug.offline(hrs); } }, hrs < 720 ? ui.t('Офлайн {} ч', hrs) : 'Офлайн 30 сут'))),
      out,
      h('div', { class: 'g-btns' },
        h('button', { class: 'g-btn small', onclick: () => { box.value = JSON.stringify(g.state); box.select(); } }, 'Выгрузить'),
        h('button', { class: 'g-btn small', onclick: () => importSave(box.value, close) }, 'Загрузить')),
      box,
      h('button', { class: 'g-btn small', onclick: () => runBot(out) }, 'Прогон бота: 240 минут'),
      h('button', { class: 'g-btn small', onclick: () => close() }, 'Закрыть')
    ]);
  }

  function importSave(text, close) {
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      ui.toast('Не JSON: ' + error.message);
      return;
    }
    const bad = sim.validate(parsed);
    if (bad) {
      ui.toast('Не подходит: ' + bad);
      return;
    }
    g.act((s) => {
      ['run', 'layers', 'meta'].forEach((k) => { if (parsed[k]) s[k] = parsed[k]; });
      sim.ensure(s);
    }, { now: true, reason: 'action' });
    close();
    buildMap(true);
    ui.toast('Сохранение загружено');
  }

  function runBot(out) {
    const c = Object.assign({}, cfg());
    const rng = Rng.make(7);
    const state = sim.ensure(sim.init({ config: c, rng: rng, now: now() }));
    let t = now();
    let sec = 0;
    const marks = [5, 15, 30, 60, 120, 240];
    const lines = ['Бот (жадный, активная игра):'];
    let hint = null;
    function chunk() {
      const end = Math.min(sec + 600, 240 * 60);
      for (; sec < end; sec++) {
        sim.botStep(state, c, t, sec < c['bot.tapSec'] ? c['bot.taps'] : 0, 1);
        t += 1000;
        sim.tick(state, 1, { now: t, config: c, rng: rng, mult: 1, links: {}, stock: {}, offline: false });
        if (hint === null && sim.moveHint(state, c)) hint = sec / 60;
        if (marks.indexOf((sec + 1) / 60) >= 0) lines.push(((sec + 1) / 60) + ' мин: линий ' + state.run.lines.length + ', ' + Fmt.rate(sim.income(state, c, t, true)));
      }
      out.textContent = lines.concat([sec < 240 * 60 ? '… ' + Math.round(sec / 60) + ' мин' : 'метка «выгодно» на ' + (hint === null ? '—' : hint.toFixed(0) + ' мин')]).join('\n');
      if (sec < 240 * 60) setTimeout(chunk, 0);
    }
    chunk();
  }

  // ---- building the screen ------------------------------------------------------------------------------------
  function build(game) {
    g = game;
    document.body.classList.add('sw');
    view.money = h('div', { class: 'g-big sw-money', id: 'money' });
    view.rate = h('button', { class: 'sw-rate g-rate', id: 'rate', onclick: rateSheet });
    view.oiText = h('span', {});
    view.bpText = h('span', {});
    view.ptText = h('span', {});
    view.oi = h('span', { class: 'sw-chip', id: 'oi' }, SubwayArt.el('res:oi'), view.oiText);
    view.bp = h('span', { class: 'sw-chip', id: 'bp' }, SubwayArt.el('res:blueprints'), view.bpText);
    view.pt = h('span', { class: 'sw-chip', id: 'pt', hidden: true }, SubwayArt.el('res:patents'), view.ptText);
    const top = h('div', { class: 'sw-top' }, h('div', { class: 'sw-top-main' }, h('span', { class: 'sw-moneyrow' }, SubwayArt.el('res:money'), view.money), view.rate), h('div', { class: 'sw-chips' }, view.oi, view.bp, view.pt));
    g.el.top.append(top);
    if (g.config['debug.panel']) g.ui.hold(view.money, 700, debugSheet);

    view.head = h('div', { class: 'sw-linehead' },
      h('button', { class: 'icon-btn sw-arrow', 'aria-label': 'Предыдущая линия', onclick: () => shiftLine(-1) }, ui.icon('back')),
      view.headBadge = h('span', {}),
      view.headTitle = h('div', { class: 'grow sw-lt' }),
      h('button', { class: 'icon-btn sw-arrow', 'aria-label': 'Следующая линия', onclick: () => shiftLine(1) }, ui.icon('right')));
    view.map = h('div', { class: 'sw-map', 'data-raw': '' });
    view.world = window.SubwayScene && SubwayScene.mount(g, view.map);
    if (view.world) {
      view.map.classList.add('sw-world-map');
      view.world.canvas.addEventListener('click', event => {
        if (!view.worldModel || view.world.getView() !== 0) return;
        const bounds = view.world.canvas.getBoundingClientRect();
        const tier = SubwayScene.hit(view.worldModel, (event.clientX - bounds.left) / bounds.width * 1000, (event.clientY - bounds.top) / bounds.height * 620);
        if (tier) select(tier);
      });
    }
    view.map.addEventListener('click', (event) => {
      const gEl = event.target.closest('[data-tier]');
      if (gEl && g.layout === 'wide') select(Number(gEl.dataset.tier));
    });
    view.cardBox = h('div', { class: 'sw-card', id: 'card' });
    view.cardTitle = h('div', { class: 'sw-ct' });
    view.cardStats = h('div', { class: 'sw-cs g-num' });
    view.cardIncome = h('div', { class: 'sw-ci g-num' });
    view.mileBar = h('i', {});
    view.mileText = h('div', { class: 'sw-cm g-num' });
    view.hint = h('div', { class: 'sw-hint' });
    view.cardBox.append(view.cardTitle, view.cardStats, view.cardIncome, view.mileText, h('div', { class: 'g-progress sw-bar' }, view.mileBar), view.hint);
    view.field = h('div', { class: 'sw-field' }, view.head, view.map);
    g.el.field.append(view.field);

    view.event = h('div', { class: 'sw-event', id: 'event', hidden: true });
    view.stLabel = h('span', {});
    view.stPrice = h('span', { class: 'g-sub g-num' });
    view.trLabel = h('span', {});
    view.trPrice = h('span', { class: 'g-sub g-num' });
    view.buyStation = repeat(h('button', { class: 'g-btn primary sw-buy', id: 'buy-station' }, SubwayArt.el('ui:station'), h('span', {}, view.stLabel, view.stPrice)), () => buy('station'));
    view.buyTrain = repeat(h('button', { class: 'g-btn sw-buy', id: 'buy-train' }, SubwayArt.el('ui:train'), h('span', {}, view.trLabel, view.trPrice)), () => buy('train'));
    view.qtyButtons = [[1, '1'], [10, '10'], ['mile', 'до вехи'], ['max', 'макс']].map(([v, t]) => h('button', { class: 'sw-q', 'data-q': String(v), onclick: () => { view.qty = v; g.sfx('tap'); g.redraw(); } }, t));
    view.qtyRow = h('div', { class: 'sw-qty', role: 'radiogroup', 'aria-label': 'Сколько покупать' }, view.qtyButtons);
    view.turnText = h('span', { class: 'g-num' });
    view.turnstile = h('button', { class: 'sw-turnstile', id: 'turnstile' }, SubwayArt.el('ui:turnstile'), h('span', {}, 'Турникет'), view.turnText);
    view.turnstile.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      tapTurnstile();
    });
    view.turnstile.addEventListener('click', (event) => { if (event.detail === 0) tapTurnstile(); });
    view.tabs = tabStrip(openSheet, '');
    view.inlineStrip = tabStrip((id) => openSheet(id), view.tab);
    view.inlineBox = h('div', { class: 'sw-panel' });
    view.inline = h('div', { class: 'sw-inline' }, view.inlineStrip, view.inlineBox);
    view.inlineUpdate = rows(view.inlineBox);
    view.buyRow = h('div', { class: 'g-btns sw-buyrow' }, view.buyStation, view.buyTrain);
    g.el.actions.append(view.event, view.buyRow, view.qtyRow, view.turnstile, view.tabs);

    // Swipe left/right on the strip changes the line (not within 24 px of the edges: the system's back gesture).
    let sx = null;
    let sy = 0;
    g.el.field.addEventListener('pointerdown', (event) => {
      const w = window.innerWidth;
      sx = event.clientX < 24 || event.clientX > w - 24 ? null : event.clientX;
      sy = event.clientY;
    });
    g.el.field.addEventListener('pointerup', (event) => {
      if (sx === null || g.layout === 'wide') return;
      const dx = event.clientX - sx;
      const dy = event.clientY - sy;
      sx = null;
      if (Math.abs(dx) >= cfg()['ui.swipePx'] && Math.abs(dx) > Math.abs(dy) * 1.5) shiftLine(dx < 0 ? 1 : -1);
    });

    g.on('resize', () => place());
    g.on('offline', onOffline);
    g.on('prestige', () => {
      view.headTier = 0;
      view.cardKey = '';
      view.mapSig = '';
      view.eventKey = '';
    });
    // A retro train from the chest or from a city task (the tick checks the tasks).
    function showRetro() {
      const r = g.state.run.lastRetro;
      if (r !== undefined && r !== null) {
        g.flash('train', 'Ретро-состав', retroName(r), 4000);
        g.act((s) => { delete s.run.lastRetro; });
      }
    }
    g.on('chest', showRetro);
    g.on('hidden', () => g.act((s) => sim.endSession(s)));
    g.on('visible', () => g.act((s) => sim.endSession(s)));
    g.on('tick', (dt) => {
      showRetro();
      if (!view.warp) return;
      const ctx = ctxNow();
      g.act((s) => sim.tick(s, dt * (cfg()['debug.warp'] - 1), ctx));
    });
    setupAnimation();
    place();
    fetchNote();
    fetchEventText();
  }

  /** Narrow: the card under the strip, the tabs as a sheet. Wide: the card and the panel go right. */
  function place() {
    const wide = g.layout === 'wide';
    if (wide) {
      closeSheet();
      g.el.actions.prepend(view.inline, view.cardBox);
      view.tabs.hidden = true;
      view.head.hidden = !view.world;
      view.inlineStrip.mark(view.tab);
    } else {
      view.field.append(view.cardBox);
      if (view.inline.parentNode) view.inline.remove();
      view.tabs.hidden = false;
      view.head.hidden = false;
    }
    view.mapSig = '';
    buildMap(true);
  }

  function setupAnimation() {
    const c = g.config;
    view.anim = !!c['ui.animTrains'];
    try {
      if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) view.anim = false;
    } catch (ignored) { /* old */ }
    if (navigator.getBattery) {
      navigator.getBattery().then((b) => {
        const check = () => { view.lowBattery = !b.charging && b.level < g.config['ui.lowBattery']; };
        check();
        b.addEventListener('levelchange', check);
        b.addEventListener('chargingchange', check);
      }).catch(() => {});
    }
  }

  function rateSheet() {
    const s = g.state;
    const c = cfg();
    const stats = sim.lineStats(s, c, now());
    const x = sim.envOf(s, c, now(), true);
    const lines = stats.map((st) => g.ui.line(st.tier + ' · ' + lineName(st.tier), g.fmt.rate(Big.mul(st.income, g.links.mult())) + (st.crowd ? ' · толпа ' + st.crowd : '')));
    const notes = [];
    if (g.links.mult() > 1) notes.push('Связки: доход ' + g.fmt.mult(g.links.mult()));
    if (x.night) notes.push('Ночной режим: линии без дежурства стоят');
    if (x.rush) notes.push('Час пик: ' + (x.rush === 1 ? 'спальные' : 'деловые') + ' районы ×' + c['rush.mult']);
    if ((s.run.boostUntil || 0) > now()) notes.push('Час пик за энергию: ×' + c['boost.mult']);
    s.run.boosts.filter((b) => b.until > now()).forEach((b) => notes.push('Событие: ×' + b.m + (b.t ? ' ' + lineName(b.t) : '') + ' ещё ' + g.fmt.time((b.until - now()) / 1000)));
    let close = null;
    close = g.sheet([h('h3', {}, 'Доход по линиям'), h('div', { class: 'g-lines' }, lines),
      g.ui.line('Общий множитель', g.fmt.mult(sim.globalMult(s, c, x))),
      g.ui.line('Офлайн (диспетчеры)', g.fmt.rate(sim.offlineRate(s, c, now()))),
      notes.length ? h('div', { class: 'g-lines' }, notes.map((n) => h('div', { class: 'g-line' }, h('span', {}, n)))) : null,
      h('button', { class: 'g-btn small', onclick: () => close() }, 'Закрыть')]);
  }

  // ---- drawing ------------------------------------------------------------------------------------------------
  function render(state) {
    const c = cfg();
    const t = now();
    const line = selLine(state);
    const stats = sim.lineStats(state, c, t);
    if (view.world) {
      const env = sim.envOf(state, c, t, true);
      view.worldModel = SubwayScene.model(state, c, C, { stats, selected: view.sel, night: env.night, museums: env.museums, animate: view.anim && !view.lowBattery, cityTitle: cityInfo(sim.cityOf(state)).title });
      view.world.update(view.worldModel);
    }
    const st = stats.find((x) => x.tier === line.tier);
    const mult = g.links.mult();
    const inc = Big.mul(sim.income(state, c, t, true), mult);
    view.money.textContent = g.fmt.live(state.run.money) + ' ₽';
    let rate = g.fmt.rate(inc);
    if (mult > 1) rate += ' · ×' + g.fmt(mult) + ' в поездке';
    if ((state.run.boostUntil || 0) > t) rate += ' · час пик';
    view.rate.textContent = rate;
    const oi = Big.of(state.layers.city.currency, 0);
    view.oiText.textContent = 'ОИ ' + g.fmt(oi) + (Big.isZero(oi) ? '' : ' · ' + g.fmt.mult(sim.bonus(state, sim.LAYER, oi, c)));
    const bp = sim.blueprints(state);
    view.bpText.textContent = 'Чертежи ' + bp;
    view.bp.hidden = !bp && !sim.unlocked(state, 'bureau');
    const pt = Big.of(state.layers.general.currency, 0);
    view.ptText.textContent = 'Патенты ' + g.fmt(pt);
    view.pt.hidden = Big.isZero(pt);

    if (view.headTier !== line.tier) {
      view.headTier = line.tier;
      view.headBadge.replaceChildren(lineArt(line.tier, 'mid'));
      view.cardArt = lineArt(line.tier, 'small');
      view.cardBox.style.setProperty('--lc', lineColor(line.tier));
    }
    view.headTitle.textContent = lineName(line.tier) + ' · ' + (sim.lineOf(state, line.tier) ? state.run.lines.indexOf(line) + 1 : 1) + ' из ' + state.run.lines.length;
    const cardKey = line.tier + '|' + (st.dispatcher ? 1 : 0);
    if (view.cardKey !== cardKey) {
      view.cardKey = cardKey;
      view.cardTitle.replaceChildren(view.cardArt, h('span', {}, lineName(line.tier) + (st.dispatcher ? '' : ' · без диспетчера')));
    }
    view.cardStats.textContent = 'Станций ' + st.stations + ' · поездов ' + st.trains + ' · поезд на ' + st.S + ' ст. · обслужено ' + st.served;
    view.cardIncome.textContent = 'Доход линии ' + g.fmt.rate(Big.mul(st.income, mult)) + ' · ' + g.fmt.mult(st.mult);
    const prev = st.miles > 0 ? (function () {
      const l = String(c['milestone.list']).split(',').map(Number);
      return st.miles <= l.length ? l[st.miles - 1] : l[l.length - 1] + (st.miles - l.length) * c['milestone.every'];
    })() : 0;
    view.mileText.textContent = 'До вехи ' + st.next + ': ' + (st.next - st.stations) + ' ст. (спрос ×' + c['milestone.mult'] + ')';
    view.mileBar.style.width = Math.round(Math.max(0, Math.min(1, (st.stations - prev) / Math.max(1, st.next - prev))) * 100) + '%';
    let hint = '';
    if (st.crowd > 0) {
      hint = 'Узкое место: поезда — на платформах толпа (' + st.crowd + ' ст.)';
      g.achieve('bottleneck');
    } else if (st.served === st.stations && st.S * st.trains - st.stations >= st.S) hint = 'Поездов с запасом: деньги — в станции';
    view.hint.textContent = hint;
    view.hint.classList.toggle('warn', st.crowd > 0);

    // The buy buttons by the chosen quantity.
    const sp = sim.stationPlan(state, c, line.tier, view.qty);
    const tp = sim.trainPlan(state, c, line.tier, view.qty);
    view.stLabel.textContent = view.qty === 'mile' ? 'До вехи ' + sp.target : 'Станция' + (sp.stations > 1 ? ' ×' + sp.stations : '');
    view.stPrice.textContent = fmtPrice(sp.cost) + (sp.trains ? ' · +' + sp.trains + ' поезд.' : '');
    view.buyStation.disabled = Big.lt(state.run.money, sp.cost);
    view.trLabel.textContent = 'Поезд' + (tp.trains > 1 ? ' ×' + tp.trains : '');
    view.trPrice.textContent = fmtPrice(tp.cost);
    view.buyTrain.disabled = Big.lt(state.run.money, tp.cost);
    view.buyTrain.classList.toggle('primary', st.crowd > 0);
    view.buyStation.classList.toggle('primary', st.crowd === 0);
    view.qtyButtons.forEach((b) => {
      const on = b.dataset.q === String(view.qty);
      b.classList.toggle('on', on);
      b.setAttribute('aria-checked', on ? 'true' : 'false');
    });
    let turn = '+' + g.fmt(tapValue(state));
    if (view.tapFlash && t - view.tapFlash.at < 600) turn = view.tapFlash.text;
    view.turnText.textContent = turn;

    // The event card and its timer.
    buildEvent(state);
    const ev = state.run.event;
    if (ev && view.eventBar) view.eventBar.style.width = Math.round(Math.max(0, (ev.until - t) / Math.max(1, ev.until - ev.at)) * 100) + '%';

    buildMap(false);
    if (view.sheet && view.sheet.update) view.sheet.update(PANELS[view.sheetTab](state));
    if (g.layout === 'wide') view.inlineUpdate(PANELS[view.tab](state));

    if (t - view.lastAch > 1000) {
      view.lastAch = t;
      checkAchievements(state);
    }
  }

  function checkAchievements(s) {
    const c = cfg();
    if (s.layers.city.count > 0) g.achieve('moved');
    if (sim.cityOf(s) >= c['ach.cities'] || (s.meta.maxCity || 1) >= c['ach.cities']) g.achieve('ten-cities');
    if (s.layers.general.count > 0) g.achieve('general');
    if (s.run.lines.length >= c['ach.lines']) g.achieve('city-built');
    if (s.run.lines.filter((l) => l.dispatcher).length >= c['ach.dispatchers']) g.achieve('dispatch-room');
    if (Big.gte(s.meta.carried || 0, c['ach.passengers'])) g.achieve('billion-passengers');
    if ((s.meta.tripSec || 0) >= c['ach.tripMin'] * 60) g.achieve('metro-in-metro');
    if (sim.unlocked(s, 'night') && new Date().getHours() === c['ach.nightHour'] && sim.envOf(s, c, now(), true).night) g.achieve('night-driver');
    s.run.lines.forEach((l) => {
      let n = 0;
      s.run.transfers.forEach((tr) => { if (tr[0] === l.tier || tr[1] === l.tier) n++; });
      if (n >= c['ach.hubTransfers']) g.achieve('transfer-hub');
    });
  }

  function animate(state, game, dt) {
    if (view.world) return;
    if (!view.anim || view.lowBattery || !dt) return;
    moveTrains(Math.min(dt, 0.25));
  }

  await Game.start({ sim, render, animate, init: build });
})();
