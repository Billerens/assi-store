// The screen of «Словоплёт». The engine (Game.start) gives the frame — g.el.top (bricks), g.el.field
// (the city, the events, the grid of empty places), g.el.actions (the wheel under the thumb) — and
// keeps the state, saves, offline, prestige, sound. The logic is ../sim.js over the dictionary of
// ../lexicon.js; the city is ui/city.js, the wheel ui/wheel.js; numbers come from g.config.
(async function () {
  const h = ui.h;
  const sim = window.GameSim;
  const Lex = window.WWLex;
  const MODEL = 'modules/games/word-weaver/model.js';
  const DATA = '/data/games/word-weaver/';
  const MIN = 60000;
  const DAY = 86400000;
  const view = {};
  const keys = {};
  let g = null;
  let lex = Lex.parse('');
  let lexError = null;
  let defs = {};
  let about = null;
  let open = null; // the open sheet of the game: {kind, refresh, close}
  let note = null; // the line over the wheel: {text, kind, ask, until}
  let typed = '';
  let lastWord = '';
  let lastModelAt = 0;
  let modelBusy = false;

  GameIcons.add('ww-shuffle', '<path d="M3 7h3.5c4.5 0 6.5 10 11 10H21"/><path d="M3 17h3.5c1.8 0 3-1.6 4.1-3.6M13.4 9.6C14.5 7.6 15.7 7 17.5 7H21"/><path d="M18 4l3 3-3 3M18 14l3 3-3 3"/>');
  GameIcons.add('ww-lamp', '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.3 1.1 2.2h5c0-.9.4-1.6 1.1-2.2A6 6 0 0 0 12 3z"/>');
  GameIcons.add('ww-horn', '<path d="M3 10v4h3l8 5V5L6 10z"/><path d="M17 9a4 4 0 0 1 0 6M19.5 6.5a8 8 0 0 1 0 11"/>');
  GameIcons.add('ww-house', '<path d="M4 11l8-6 8 6M6 10v9h12v-9"/><path d="M10 19v-5h4v5"/>');
  GameIcons.add('ww-sets', '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><path d="M16.5 13.5v6M13.5 16.5h6"/>');
  GameIcons.add('ww-ask', '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17h.01"/>');

  // ---- the dictionary: on the phone, without network --------------------------------------------
  try {
    lex = Lex.parse(await WWDictionary.load(window.fetch.bind(window)));
    if (!lex.size) throw new Error('пустой файл');
  } catch (error) {
    lexError = String(error && error.message ? error.message : error);
  }
  try {
    const r = await fetch(DATA + 'defs.json');
    if (r.ok) defs = await r.json();
  } catch (ignored) { /* no definitions yet */ }

  const cfg = () => g.config;
  const now = () => Date.now();
  const mult = () => g.links.mult();
  const shown = (k) => Lex.shown(lex, k);
  // An ordinary space before the word (fmt puts a no-break one): the English dictionary matches «{} жителей».
  const plural = (n, a, b, c) => g.fmt.count(n, a, b, c).replace(/\u00a0(?=\D)/g, ' ');
  // A word of the game shown as it is: kit's h() would translate a word that is also a text of the
  // interface («форма», «зерно»).
  const rawWord = (k) => ui.raw(shown(k));

  // ---- the frame ----------------------------------------------------------------------------------
  function build(game) {
    g = game;
    document.documentElement.classList.add('ww');
    g.el.actions.classList.add('ww-actions');
    g.el.field.classList.add('ww-field');

    view.bricks = h('div', { class: 'g-big', id: 'bricks' });
    view.rate = h('div', { class: 'g-rate', id: 'rate' });
    g.el.top.append(view.bricks, view.rate);

    view.city = h('div', { class: 'ww-city', id: 'city', onclick: () => buildSheet() });
    view.chips = h('div', { class: 'ww-chips', id: 'chips' });
    view.prestige = g.ui.prestigeButton(sim.LAYER, { label: 'Новый город' });
    view.prestige.id = 'prestige';
    view.prestigeBox = h('div', { class: 'ww-prestige' }, view.prestige);
    view.grid = h('div', { class: 'ww-grid', id: 'grid', 'data-raw': '' });
    view.album = h('div', { class: 'ww-album-peek', id: 'album-peek', 'data-raw': '' });
    view.error = h('div', { class: 'g-error ww-dict-error', hidden: true });
    view.definition = h('section', { class: 'ww-last-word', hidden: true, 'aria-live': 'polite', 'aria-atomic': 'true' });
    g.el.field.append(view.error, view.definition, view.city, view.chips, view.prestigeBox, view.grid, view.album);

    view.word = h('div', { class: 'ww-word', id: 'word' });
    view.wheel = WWWheel.make({
      capture: g.config['wheel.capture'],
      letter: g.config['wheel.letter'],
      onSubmit: submitWord,
      onChange: (w) => { typed = w; drawWord(); },
      onLetter: () => g.buzz([8])
    });
    view.wheel.el.id = 'wheel';
    view.shuffle = view.wheel.corner('tr', iconButton('ww-shuffle', 'Перемешать', () => {
      g.act((s) => sim.shuffle(s, g.rng));
      view.wheel.reset();
      g.sfx('tap');
    }));
    view.lamp = view.wheel.corner('br', iconButton('ww-lamp', 'Фонарщик: первая буква слова', () => takeHint('lamp')));
    view.herald = view.wheel.corner('bl', iconButton('ww-horn', 'Глашатай: слово целиком', () => takeHint('herald')));
    view.sets = view.wheel.corner('tl', iconButton('ww-sets', 'Наборы', () => moreSheet()));
    view.lampN = h('span', { class: 'ww-count' });
    view.heraldN = h('span', { class: 'ww-count' });
    view.lamp.append(view.lampN);
    view.herald.append(view.heraldN);
    view.centreText = h('span', { class: 'ww-centre-text' });
    view.wheel.centre.append(view.centreText);
    view.wheelBox = h('div', { class: 'ww-wheel-box' }, view.wheel.el);

    view.buildBtn = h('button', { class: 'g-btn small', id: 'build', onclick: () => buildSheet() }, GameIcons.el('ww-house'), 'Стройка');
    view.albumBtn = h('button', { class: 'g-btn small', id: 'album', onclick: () => albumSheet() }, GameIcons.el('book'), 'Альбом');
    view.moreBtn = h('button', { class: 'g-btn small', id: 'more', onclick: () => moreSheet() }, GameIcons.el('more'), 'Ещё');
    view.row = h('div', { class: 'g-btns ww-row' }, view.buildBtn, view.albumBtn, view.moreBtn);
    g.el.actions.append(view.word, view.wheelBox, view.row);

    g.on('resize', layout);
    g.on('prestige', () => {
      ensureSet();
      setTimeout(citySheet, 400);
    });
    g.on('chest', () => g.sfx('chest'));
    g.on('visible', () => { setTimeout(runModel, 2000); });
    window.addEventListener('online', () => { setTimeout(runModel, 1000); });
    window.addEventListener('resize', layout);
  }

  function iconButton(icon, label, fn) {
    return h('button', { class: 'icon-btn ww-icon', type: 'button', 'aria-label': label, title: label, onclick: fn }, GameIcons.el(icon));
  }

  function layout() {
    if (!g) return;
    const wide = g.layout === 'wide';
    const c = cfg();
    const width = (wide ? g.el.actions.clientWidth : g.el.app.clientWidth) - 32;
    const height = window.innerHeight || 700;
    const size = Math.max(200, Math.min(c['wheel.size'], width, Math.floor(height * (wide ? 0.5 : 0.4))));
    view.wheel.resize(size);
    if (wide && view.grid.parentNode !== g.el.actions) g.el.actions.prepend(view.grid);
    if (!wide && view.grid.parentNode !== g.el.field) g.el.field.insertBefore(view.grid, view.album);
    keys.city = keys.grid = keys.album = '';
    g.redraw();
  }

  // ---- sets ---------------------------------------------------------------------------------------
  function ensureSet() {
    if (!lex.size) return;
    if (sim.current(g.state)) return;
    const s0 = g.state;
    // A closed set left the list: the next unclosed one, else a new one.
    if (s0.run.sets.length) {
      g.act((s) => sim.choose(s, s.run.sets[s.run.sets.length - 1].id));
      return;
    }
    openNext();
  }

  async function openNext() {
    if (keys.openingNext) return;
    keys.openingNext = 1;
    try {
      await openNextNow();
    } finally {
      keys.openingNext = 0;
    }
  }

  async function openNextNow() {
    const c = cfg();
    const every = c['sets.themeEvery'];
    const n = g.state.meta.sets || 0;
    if (every > 0 && n > 0 && n % every === 0 && !g.state.run.queue.some((q) => q.theme)) {
      let theme = null;
      try {
        theme = await g.stock.take('themes');
      } catch (ignored) { /* the stock is not reachable */ }
      if (!theme) theme = sim.procedural('themes', g.rng);
      if (theme) g.act((s) => sim.prepare(s, c, lex, g.rng, [theme]));
    }
    const set = g.act((s) => sim.openNext(s, c, lex, g.rng, now()));
    view.wheel.reset();
    if (set && set.theme) g.flash('book', 'Тема: ' + set.theme, 'Набор на тему');
  }

  function submitWord(word, how) {
    if (!lex.size) return;
    const c = cfg();
    const out = g.act((s) => sim.submit(s, c, lex, word, now(), mult()));
    if (!out) return;
    if (!out.ok) {
      const k = out.k || Lex.key(word) || word;
      if (out.why === 'again') say(ui.t('«{}» уже есть', shown(k)), 'again');
      else if (out.why === 'short') say(ui.t('Слово — от трёх букв'), 'bad');
      else if (out.why === 'unknown') say(ui.t('«{}» — нет в словаре', k), 'bad', k);
      else if (out.why === 'noset') ensureSet();
      else say(ui.t('Таких букв нет'), 'bad');
      view.wheel.mark('bad');
      g.sfx('deny');
      g.buzz('deny');
      return;
    }
    view.wheel.mark('ok');
    lastWord = out.k || Lex.key(out.word || word);
    drawDefinition();
    g.el.field.scrollTop = 0;
    setTimeout(runModel, 500);
    const extra = out.parts && out.parts.length ? ' · ' + out.parts.map((p) => ui.t(p)).join(', ') : '';
    say(out.word + ' +' + g.fmt(out.amount) + extra, out.rare ? 'rare' : 'ok');
    g.sfx(out.rare || out.seed ? 'level' : 'tap');
    g.buzz('tap');
    if (out.nine) g.achieve('nine');
    if (out.first) albumAchievements();
    (out.opened || []).forEach((id) => {
      const q = sim.QUARTERS.find((x) => x.id === id);
      g.flash('ww-house', 'Новый квартал: ' + q.title, 'Особое здание — ' + q.special + '. Шесть новых участков');
      g.sfx('level');
      g.buzz('level');
    });
    if (out.order && out.order.done) g.flash('chest', 'Заказ ратуши выполнен', '+' + g.fmt(out.order.reward) + ' кирпичей');
    if (out.closed) setTimeout(closeSet, 350);
  }

  function closeSet() {
    const c = cfg();
    const res = g.act((s) => sim.closeSet(s, c, lex, g.rng, now(), mult()), { now: true, reason: 'set' });
    if (!res) return;
    g.sfx('chest');
    g.buzz('chest');
    if (res.nohint) g.achieve('nohint');
    const events = res.events.map((e) => e.title + (e.amount ? ' +' + g.fmt(e.amount) : ''));
    g.flash('check', 'Набор собран: ' + res.set.seed.toUpperCase(), events.length ? events.join(' · ') : 'Следующее колесо готово');
    openNext();
    setTimeout(runModel, 1500);
  }

  function takeHint(kind) {
    const c = cfg();
    const k = g.act((s) => sim.hint(s, c, lex, kind, now()));
    if (!k) {
      const level = sim.lvl(g.state, kind);
      ui.toast(g.state.run.hints[kind] > 0 ? 'Подсказывать нечего' : level ? 'Заряд ещё копится' : (kind === 'lamp' ? 'Нужен Фонарщик' : 'Нужен Глашатай') + ' — его ставят в «Стройке»');
      g.sfx('deny');
      return;
    }
    const w = shown(k);
    say(ui.t('Подсказка: {}', kind === 'lamp' ? w.charAt(0).toUpperCase() + ' ' + '·'.repeat(w.length - 1) + ' (' + w.length + ')' : w), 'hint');
    g.sfx('tap');
  }

  function say(text, kind, ask) {
    note = { text, kind, ask: ask || null, until: now() + (ask ? 6000 : 2600) };
    drawWord();
  }

  function drawWord() {
    if (!view.word) return;
    view.word.className = 'ww-word';
    if (typed) {
      view.word.replaceChildren(h('span', { class: 'ww-typed', 'data-raw': '' }, ui.raw(typed.toUpperCase())));
      view.word.classList.add('typing');
      return;
    }
    if (note && note.until > now()) {
      const parts = [h('span', { class: 'ww-note-text', 'data-raw': '' }, ui.raw(note.text))];
      if (note.ask) parts.push(h('button', { class: 'chip ww-chip on', onclick: () => askWord(note.ask) }, 'Нет в словаре?'));
      view.word.replaceChildren(...parts);
      view.word.classList.add(note.kind || 'ok');
      return;
    }
    const set = sim.current(g.state);
    view.word.replaceChildren(h('span', { class: 'g-note' }, lexError ? 'Словарь не загрузился' : set && set.theme ? 'Тема: ' + set.theme : 'Ведите по буквам или нажимайте их и центр'));
  }

  function askWord(k) {
    const ok = g.act((s) => sim.ask(s, k, now()), { now: true, reason: 'ask' });
    note = null;
    drawWord();
    ui.toast(ok ? 'Слово «' + k + '» проверит модель, когда будет сеть' : 'Это слово уже ждёт проверки');
    setTimeout(runModel, 500);
  }

  // ---- the model (online, while the screen is open) -----------------------------------------------
  async function runModel(force) {
    if (modelBusy || !lex.size || g.readonly) return;
    const c = cfg();
    if (!force && now() - lastModelAt < c['defs.everyMin'] * MIN) return;
    if (navigator.onLine === false) return;
    modelBusy = true;
    lastModelAt = now();
    try {
      const pending = g.state.meta.pending.slice(0, c['check.batch']);
      if (pending.length) {
        const r = await window.axiko.call(MODEL, 'check', pending, { maxLen: c['defs.maxLen'], batch: c['check.batch'] });
        if (r && r.answers && r.answers.length) {
          r.answers.forEach((a) => { if (a.ok && a.text) defs[a.k] = a.text; });
          const res = g.act((s) => sim.approve(s, c, lex, r.answers, now(), mult()), { now: true, reason: 'extra' });
          const no = r.answers.filter((a) => !a.ok).length;
          if (res.added.length) g.flash('book', 'В личный словарь: ' + res.added.join(', '), '+' + g.fmt(res.amount) + ' кирпичей');
          else if (no) ui.toast('Модель не взяла: ' + r.answers.filter((a) => !a.ok).map((a) => a.k).join(', '));
        }
      }
      const want = wantDefs(c);
      if (want.length) {
        const r = await window.axiko.call(MODEL, 'defs', want, { batch: c['defs.batch'], maxLen: c['defs.maxLen'] });
        if (r && r.defs) Object.assign(defs, r.defs);
        keys.album = '';
        drawDefinition();
        if (open && open.kind === 'album') open.refresh();
      }
    } catch (ignored) {
      /* no network, no model: the queue waits */
    } finally {
      modelBusy = false;
    }
  }

  /** Words that need a definition: the album first (newest), then the sets ahead. */
  function wantDefs(c) {
    const out = [];
    const seen = {};
    const add = (k) => {
      if (seen[k] || defs[k] !== undefined) return;
      seen[k] = true;
      out.push(shown(k));
    };
    const album = g.state.meta.album;
    Object.keys(album).sort((a, b) => album[b][0] - album[a][0]).slice(0, 400).forEach(add);
    const sets = g.state.run.sets.concat(g.state.run.queue.slice(0, c['defs.ahead']));
    sets.forEach((s) => Lex.subwords(lex, s.letters, c['dict.commonTop']).common.forEach(add));
    return out.slice(0, c['defs.batch'] * 2);
  }

  function albumAchievements() {
    const c = cfg();
    const m = g.state.meta;
    if ((m.albumCount || 0) >= c['ach.words']) g.achieve('thousand');
    if ((m.rare || 0) >= c['ach.rare']) g.achieve('rare100');
    if (sim.alphabetDone(g.state)) g.achieve('alphabet');
  }

  // ---- drawing --------------------------------------------------------------------------------------
  function render(state) {
    const c = cfg();
    const r = state.run;
    const t = now();
    if (!lexError && !sim.current(state) && lex.size && !keys.opening) {
      keys.opening = 1;
      setTimeout(() => { keys.opening = 0; ensureSet(); }, 0);
    }
    view.error.hidden = !lexError;
    view.error.textContent = lexError ? 'Словарь не найден (data/games/word-weaver/assets/dict.txt): ' + lexError + '. Переустановите игру из магазина.' : '';

    view.bricks.textContent = g.fmt.live(r.bricks) + ' кирп.';
    const tax = sim.taxPerSec(state, c) * 60 * mult();
    const people = sim.residents(state, c);
    const fame = sim.fame(state);
    view.rate.textContent = '+' + g.fmt(tax) + ' в минуту · ' + plural(people, 'житель', 'жителя', 'жителей') + (fame ? ' · слава ' + fame : '');

    drawCity(state);
    drawChips(state, t);
    drawGrid(state);
    drawWheel(state);
    if (g.layout === 'wide' || sim.lvl(state, 'typography') > 0) drawAlbumPeek(state);
    else if (view.album.childNodes.length) { view.album.replaceChildren(); keys.album = ''; }
    if (note && note.until <= t && !typed) {
      note = null;
      drawWord();
    } else if (!note && !typed && keys.word !== (r.cur + ':' + (lexError ? 1 : 0))) {
      keys.word = r.cur + ':' + (lexError ? 1 : 0);
      drawWord();
    }
    const info = g.prestigeInfo(sim.LAYER);
    view.prestigeBox.hidden = !info.can;
    if (sim.houses(state) > 0) g.achieve('first-house');
    if (open && open.update && t - (keys.sheetAt || 0) > 400) {
      keys.sheetAt = t;
      open.update();
    }
  }

  function cityModel(state) {
    const c = cfg();
    const per = c['quarter.plots'];
    const houses = [];
    ['tenement', 'stone', 'izba'].forEach((k) => { for (let i = 0; i < sim.lvl(state, k); i++) houses.push(k); });
    const order = state.run.quarters.slice();
    const next = sim.QUARTERS.find((q) => order.indexOf(q.id) < 0);
    const list = order.map((id) => sim.QUARTERS.find((q) => q.id === id));
    if (next) list.push(next);
    let at = 0;
    return {
      quarters: list.map((q) => {
        const isOpen = order.indexOf(q.id) >= 0;
        const hs = [];
        for (let i = 0; i < per; i++) hs.push(isOpen && at < houses.length ? houses[at++] : null);
        return { id: q.id, title: q.title, special: q.special, open: isOpen, houses: hs };
      })
    };
  }

  function drawCity(state) {
    const wide = g.layout === 'wide';
    const key = [wide, state.run.quarters.join(','), sim.lvl(state, 'izba'), sim.lvl(state, 'stone'), sim.lvl(state, 'tenement'), g.el.field.clientWidth].join('|');
    if (keys.city === key) return;
    keys.city = key;
    const model = cityModel(state);
    const width = Math.max(240, g.el.field.clientWidth - 32);
    const a = wide ? Math.max(14, Math.min(26, width / 2 / 6.5)) : 13;
    const cols = wide ? Math.max(1, Math.floor(width / (6.5 * a))) : model.quarters.length;
    view.city.replaceChildren(WWCity.svg(model, { a, cols, labels: wide }));
    view.city.classList.toggle('big', wide);
  }

  function chip(text, o) {
    o = o || {};
    return h(o.onclick ? 'button' : 'span', { class: 'chip ww-chip' + (o.on ? ' on' : ''), onclick: o.onclick || null }, text);
  }

  function drawChips(state, t) {
    const c = cfg();
    const r = state.run;
    const left = (until) => Math.max(1, Math.ceil((until - t) / MIN));
    const letter = sim.letterOfDay(t);
    const parts = ['Буква дня «' + letter.toUpperCase() + '» ×' + c['letterDay.mult']];
    if (r.fairUntil > t) parts.push('Ярмарка ×' + c['fair.mult'] + ' · ' + left(r.fairUntil) + ' мин');
    if (r.museUntil > t) parts.push('Вдохновение ×' + c['muse.mult'] + ' · ' + left(r.museUntil) + ' мин');
    if (r.order) parts.push('Заказ: ' + r.order.need + ' на «' + r.order.letter + '» из ' + r.order.len + '+ · ' + r.order.got.length + '/' + r.order.need);
    if (sim.lvl(state, 'inn') > 0 && r.streak > 1) parts.push('Серия ' + r.streak + ' · +' + Math.round(Math.min(c['b.inn.cap'], r.streak * c['b.inn.step']) * 100) + ' %');
    if (state.meta.pending.length) parts.push('На проверке: ' + state.meta.pending.length);
    const key = parts.join('|') + '|' + r.towerReady + '|' + (r.cityPicked ? 1 : 0);
    if (keys.chips === key) return;
    keys.chips = key;
    const nodes = parts.map((p, i) => chip(p, { on: i > 0 && /Ярмарка|Вдохновение/.test(p) }));
    if (r.towerReady) nodes.unshift(chip('Каланча: забрать налог', { on: true, onclick: collectTower }));
    if (!r.cityPicked) nodes.unshift(chip('Выбрать вид города', { on: true, onclick: citySheet }));
    view.chips.replaceChildren(...nodes);
  }

  function collectTower() {
    const amount = g.act((s) => sim.collectTower(s, cfg(), now(), mult()), { now: true, reason: 'tower' });
    if (amount) {
      g.flash('chest', 'Каланча', '+' + g.fmt(amount) + ' кирпичей налога');
      g.sfx('chest');
    }
  }

  /** The words of the set by length: {lengths: [{len, words: [{k, found, hint}]}], rare: [k], forms: [k], left}. */
  function setView(state, set) {
    const c = cfg();
    const w = sim.setWords(state, c, lex, set);
    const found = {};
    set.found.forEach((k) => { found[k] = true; });
    const by = {};
    w.common.forEach((k) => {
      (by[k.length] = by[k.length] || []).push({ k, found: !!found[k], hint: set.hints[k] || 0 });
    });
    const p = sim.progress(state, c, lex, set);
    return {
      lengths: Object.keys(by).map(Number).sort((a, b) => a - b).map((len) => ({ len, words: by[len] })),
      rare: w.rare.filter((k) => found[k]),
      forms: w.plurals.filter((k) => found[k]),
      left: Math.max(0, p.all4 - p.found4) + Math.max(0, p.need3 - p.found3),
      progress: p
    };
  }

  function cell(word) {
    if (word.found) return h('span', { class: 'ww-cell found' }, ui.raw(shown(word.k)));
    if (word.hint === 2) return h('span', { class: 'ww-cell hinted' }, ui.raw(shown(word.k)));
    const text = (word.hint === 1 ? shown(word.k).charAt(0) : '') + '·'.repeat(word.k.length - (word.hint === 1 ? 1 : 0));
    return h('span', { class: 'ww-cell blank' }, ui.raw(text.toUpperCase()));
  }

  function gridNodes(v, full) {
    const rows = v.lengths.map((row) => h('div', { class: 'ww-len' },
      h('span', { class: 'ww-len-n' }, String(row.len)),
      h('div', { class: 'ww-cells' }, ...row.words.map(cell))));
    if (v.rare.length) rows.push(h('div', { class: 'ww-len' }, h('span', { class: 'ww-len-n small' }, 'редкие'), h('div', { class: 'ww-cells' }, ...v.rare.map((k) => h('span', { class: 'ww-cell rare' }, rawWord(k))))));
    if (v.forms.length) rows.push(h('div', { class: 'ww-len' }, h('span', { class: 'ww-len-n small' }, 'мн. число'), h('div', { class: 'ww-cells' }, ...v.forms.map((k) => h('span', { class: 'ww-cell form' }, ui.raw(k))))));
    if (full) rows.unshift(h('p', { class: 'g-note' }, 'Редкие слова в сетке не показаны: они не нужны, чтобы закрыть набор, и платят вдвое.'));
    return rows;
  }

  function drawGrid(state) {
    const set = sim.current(state);
    const narrow = g.layout === 'narrow';
    const key = set ? [set.id, set.found.length, JSON.stringify(set.hints), g.layout].join('|') : 'none';
    if (keys.grid === key) return;
    keys.grid = key;
    if (!set) {
      view.grid.replaceChildren();
      return;
    }
    const v = setView(state, set);
    keys.left = v.left;
    if (narrow) {
      // The cover screen: counters by length; the whole grid in a sheet.
      const counters = v.lengths.map((row) => {
        const got = row.words.filter((w) => w.found).length;
        return h('button', { class: 'ww-counter' + (got >= row.words.length ? ' done' : ''), 'aria-label': 'Слова из ' + row.len + ' букв: найдено ' + got + ' из ' + row.words.length, onclick: () => gridSheet() },
          WWArt.tiles(row.len), h('span', {}, got + ' из ' + row.words.length));
      });
      if (v.rare.length) counters.push(h('button', { class: 'ww-counter rare', onclick: () => gridSheet() }, h('b', {}, 'Редкие'), h('span', {}, String(v.rare.length))));
      view.grid.replaceChildren(h('p', { class: 'g-note ww-counters-t' }, 'Найдено слов по числу букв'), h('div', { class: 'ww-counters' }, ...counters));
    } else view.grid.replaceChildren(...gridNodes(v, false));
  }

  function drawWheel(state) {
    const set = sim.current(state);
    view.wheel.setLetters(set ? set.letters : '');
    const r = state.run;
    const key = [r.hints.lamp, r.hints.herald, sim.lvl(state, 'lamp'), sim.lvl(state, 'herald'), keys.left, set ? set.id : 0].join('|');
    if (keys.wheel === key) return;
    keys.wheel = key;
    view.lampN.textContent = r.hints.lamp > 0 ? String(r.hints.lamp) : '';
    view.heraldN.textContent = r.hints.herald > 0 ? String(r.hints.herald) : '';
    view.lamp.classList.toggle('off', !(r.hints.lamp > 0));
    view.herald.classList.toggle('off', !(r.hints.herald > 0));
    // The wheel is data-raw (its letters are not words of the interface), so this one is translated here.
    view.centreText.textContent = set ? (keys.left > 0 ? ui.t('ещё {}', keys.left) : ui.t('готово')) : '';
  }

  function dateOf(day) {
    const d = new Date(day * DAY);
    return ('0' + d.getDate()).slice(-2) + '.' + ('0' + (d.getMonth() + 1)).slice(-2) + '.' + d.getFullYear();
  }

  function defOf(k) { return defs[k] || ''; }

  function drawDefinition() {
    if (!lastWord || !view.definition) return;
    const text = defOf(lastWord);
    view.definition.hidden = false;
    view.definition.replaceChildren(h('div', { class: 'ww-section' }, 'Последнее слово'),
      h('strong', { class: 'ww-last-title', 'data-raw': '' }, rawWord(lastWord)),
      h('div', { class: 'ww-def', 'data-raw': '' }, ui.raw(text ||
        ui.t(navigator.onLine === false ? 'Толкование появится, когда вернётся сеть.' : 'Толкование ещё готовится. Оно появится здесь автоматически.'))));
  }

  function albumItem(k, reveal) {
    const m = g.state.meta;
    const at = m.album[k];
    const seed = at && m.seeds[at[1]] ? m.seeds[at[1]] : '';
    const d = defOf(k);
    const defNode = h('div', { class: 'ww-def' });
    if (d) defNode.replaceChildren(ui.raw(d));
    else defNode.textContent = navigator.onLine === false ? 'толкование придёт, когда будет сеть' : 'толкования пока нет';
    const rare = !Lex.common(lex, k, cfg()['dict.commonTop']);
    return h('div', { class: 'ww-entry' },
      h('div', { class: 'ww-entry-top' }, h('b', { 'data-raw': '' }, rawWord(k)), rare ? h('span', { class: 'badge' }, m.extra[k] ? 'личное' : 'редкое') : null,
        h('span', { class: 'ww-entry-meta', 'data-raw': '' }, ui.raw((at ? dateOf(at[0]) : '') + (seed ? ' · ' + seed : '')))),
      defNode);
  }

  function drawAlbumPeek(state) {
    const m = state.meta;
    const key = (m.albumCount || 0) + '|' + Object.keys(defs).length;
    if (keys.album === key) return;
    keys.album = key;
    const list = Object.keys(m.album).sort((a, b) => m.album[b][0] - m.album[a][0] || (a < b ? -1 : 1)).slice(0, 8);
    view.album.replaceChildren(h('h3', {}, 'Альбом · ' + plural(m.albumCount || 0, 'слово', 'слова', 'слов')),
      ...(list.length ? list.map((k) => albumItem(k, false)) : [h('p', { class: 'g-note' }, 'Найденные слова собираются здесь — с толкованием, датой и набором.')]),
      h('button', { class: 'g-btn small', onclick: () => albumSheet() }, 'Весь альбом'));
  }

  // ---- sheets ---------------------------------------------------------------------------------------
  /** A sheet of the game; make() builds its content, o.update (when the sheet sets it) runs as the state changes. */
  function showSheet(kind, make) {
    if (open) open.close();
    const box = h('div', { class: 'ww-sheet' });
    const me = { kind, box, update: null };
    me.refresh = () => {
      me.update = null;
      box.replaceChildren(...[].concat(make(me)).filter(Boolean));
    };
    me.refresh();
    me.close = g.sheet(box, () => { if (open === me) open = null; });
    open = me;
    return me;
  }

  function gridSheet() {
    showSheet('grid', () => {
      const set = sim.current(g.state);
      if (!set) return [h('p', {}, 'Набора нет')];
      const v = setView(g.state, set);
      return [h('h3', {}, 'Набор: ' + set.letters.length + ' букв' + (set.theme ? ' · ' + set.theme : '')),
        h('div', { class: 'ww-grid full', 'data-raw': '' }, ...gridNodes(v, true)),
        h('p', { class: 'g-note' }, v.left ? 'До закрытия: ещё ' + plural(v.left, 'слово', 'слова', 'слов') : 'Набор закрыт')];
    });
  }

  /** A row of the building sheet; its button follows the bricks (update) without being rebuilt under the finger. */
  function buildRow(b, updaters) {
    const c = cfg();
    const label = h('span', {});
    const tag = h('span', { class: 'badge' });
    const btn = h('button', { class: 'g-btn small', 'data-build': b.id, onclick: () => buyIt(b.id) }, label);
    const row = h('div', { class: 'ww-build' }, WWArt.el(b.id, 40),
      h('div', { class: 'grow' }, h('div', { class: 'ww-build-title' }, b.title, tag), h('div', { class: 'g-note' }, sim.fill(b.text, c))),
      h('div', { class: 'ww-build-btn' }, btn));
    const update = () => {
      const s = g.state;
      const level = sim.lvl(s, b.id);
      const why = sim.blocked(s, cfg(), b.id);
      const price = sim.cost(s, cfg(), b.id);
      const can = !why && Big.gte(s.run.bricks, price);
      const max = cfg()['b.' + b.id + '.max'];
      btn.disabled = !can;
      btn.classList.toggle('primary', can);
      label.textContent = why || g.fmt.price(price) + ' кирп.';
      const text = b.kind === 'house' ? (level ? '×' + level : '') : max >= 999 ? 'ур. ' + level : max > 1 ? 'ур. ' + level + ' из ' + max : level ? 'есть' : '';
      tag.textContent = text;
      tag.hidden = !text;
      row.classList.toggle('has', level > 0);
    };
    update();
    updaters.push(update);
    return row;
  }

  function buyIt(id) {
    const ok = g.act((s) => sim.buy(s, cfg(), id), { now: true, reason: 'buy' });
    if (ok) {
      g.sfx('buy');
      g.buzz('buy');
    } else {
      g.sfx('deny');
      g.buzz('deny');
    }
    if (open && open.update) open.update();
  }

  function buildSheet() {
    showSheet('build', (me) => {
      const c = cfg();
      const s = g.state;
      const updaters = [];
      const people = h('span', {});
      const plots = h('span', {});
      const taxLine = h('span', {});
      updaters.push(() => {
        people.textContent = String(sim.residents(g.state, cfg()));
        plots.textContent = sim.houses(g.state) + ' / ' + sim.plots(g.state, cfg());
        taxLine.textContent = g.fmt(sim.taxPerSec(g.state, cfg()) * 60) + ' в минуту, без игры ' + Math.round(sim.offlineShare(g.state, cfg()) * 100) + ' %';
      });
      updaters[0]();
      me.update = () => updaters.forEach((f) => f());
      const houses = sim.BUILDINGS.filter((b) => b.kind === 'house');
      const ups = sim.BUILDINGS.filter((b) => b.kind !== 'house');
      const city = sim.CITIES.find((x) => x.id === s.run.city);
      return [
        h('h3', {}, 'Стройка'),
        h('div', { class: 'g-lines' },
          g.ui.line('Жителей', people),
          g.ui.line('Участков занято', plots),
          g.ui.line('Налог', taxLine),
          g.ui.line('Город', city.title + (sim.fame(s) ? ' · слава ' + sim.fame(s) + ', +' + Math.round(sim.fame(s) * c['fame.bonus'] * 100) + ' %' : ''))),
        h('div', { class: 'ww-section' }, 'Дома'),
        h('p', { class: 'g-note' }, 'Когда участки заняты, дом получше встаёт на место избы или каменного.'),
        ...houses.map((b) => buildRow(b, updaters)),
        h('div', { class: 'ww-section' }, 'Улучшения'),
        ...ups.map((b) => buildRow(b, updaters)),
        h('div', { class: 'ww-section' }, 'Кварталы'),
        ...sim.QUARTERS.map((q) => h('div', { class: 'ww-quarter' + (sim.quarterOpen(s, q.id) ? ' open' : '') }, WWArt.el(q.id, 40), h('div', { class: 'grow' },
          h('div', { class: 'ww-build-title' }, q.title, h('span', { class: 'badge' }, sim.quarterOpen(s, q.id) ? 'открыт' : 'закрыт')),
          h('div', { class: 'g-note' }, (sim.quarterOpen(s, q.id) ? 'Особое здание — ' + q.special : 'Откроется: ' + sim.fill(q.need, c)))))),
        h('div', { class: 'ww-section' }, 'Новый город'),
        h('p', { class: 'g-note' }, 'Со Старым городом (или с ' + g.fmt(c['city.minResidents']) + ' жителями) можно начать новый город. Слава — корень из наибольшего числа жителей / ' + c['fame.div'] + '; каждая навсегда +' + Math.round(c['fame.bonus'] * 100) + ' % к кирпичам и налогу. Альбом и личный словарь остаются.')
      ];
    });
  }

  function citySheet() {
    if (g.state.run.cityPicked) return;
    const c = cfg();
    showSheet('city', () => [
      h('h3', {}, 'Какой город строим'),
      h('p', { class: 'g-note' }, 'Вид города меняет, какие слова дороже. Выбирается один раз на город.'),
      h('div', { class: 'g-pick' }, ...sim.CITIES.map((x) => h('button', { onclick: () => {
        g.act((s) => sim.pickCity(s, x.id), { now: true, reason: 'city' });
        if (open) open.close();
        g.sfx('level');
      } }, WWArt.el(x.id, 40), h('div', { class: 'grow' }, h('div', { class: 'ww-build-title' }, x.title), h('div', { class: 'g-note' }, sim.fill(x.text, c))))))
    ]);
  }

  function albumSheet(tab) {
    let shownN = 60;
    let mode = tab || 'words';
    let query = '';
    const s = g.state;
    const m = s.meta;
    const input = h('input', { class: 'input', placeholder: 'Найти в альбоме', oninput: (e) => { query = Lex.key(e.target.value) || ''; shownN = 60; o.refresh(); input.focus(); } });
    const o = showSheet('album', () => {
      const archive = sim.lvl(s, 'archive') > 0;
      const tabs = h('div', { class: 'chips' },
        h('button', { class: 'chip ww-chip' + (mode === 'words' ? ' on' : ''), onclick: () => { mode = 'words'; o.refresh(); } }, 'Слова'),
        h('button', { class: 'chip ww-chip' + (mode === 'seeds' ? ' on' : ''), onclick: () => { mode = 'seeds'; o.refresh(); } }, 'Наборы'),
        h('button', { class: 'chip ww-chip' + (mode === 'abc' ? ' on' : ''), onclick: () => { mode = 'abc'; o.refresh(); } }, 'Алфавит'));
      const head = [h('h3', {}, 'Альбом · ' + plural(m.albumCount || 0, 'слово', 'слова', 'слов')), tabs];
      if (mode === 'abc') {
        const miss = sim.alphabetMissing(s);
        return head.concat([h('p', { class: 'g-note' }, miss.length ? 'Ещё нет слов на буквы: ' + miss.map((x) => x.toUpperCase()).join(' ') : 'Есть слова на все буквы — ачивка ваша'),
          h('p', { class: 'g-note' }, 'Редких: ' + (m.rare || 0) + ' · форм множественного числа: ' + (m.forms || 0) + ' · личный словарь: ' + Object.keys(m.extra).length)]);
      }
      if (mode === 'seeds') {
        const top = cfg()['dict.commonTop'];
        const list = m.seeds.slice().reverse().slice(0, shownN);
        const rows = list.map((seed) => {
          let tail = '';
          if (archive && seed) {
            const w = Lex.subwords(lex, seed, top);
            const left = w.common.filter((k) => !m.album[k]).length;
            tail = left ? 'не найдено ' + left + ' из ' + w.common.length : 'найдено всё';
          }
          return h('div', { class: 'ww-entry' }, h('div', { class: 'ww-entry-top' }, seed ? h('b', { 'data-raw': '' }, ui.raw(seed)) : h('b', {}, 'личный словарь'), h('span', { class: 'ww-entry-meta' }, tail)));
        });
        return head.concat([archive ? null : h('p', { class: 'g-note' }, 'С Архивом здесь видно, сколько слов каждого набора ещё не найдено.')].filter(Boolean), rows,
          m.seeds.length > shownN ? [h('button', { class: 'g-btn small', onclick: () => { shownN += 60; o.refresh(); } }, 'Ещё')] : []);
      }
      let words = Object.keys(m.album).sort((a, b) => m.album[b][0] - m.album[a][0] || (a < b ? -1 : 1));
      if (query) words = words.filter((k) => k.indexOf(query) >= 0);
      return head.concat([input,
        h('div', { 'data-raw': '' }, ...words.slice(0, shownN).map((k) => albumItem(k, false)))].filter(Boolean),
        words.length > shownN ? [h('button', { class: 'g-btn small', onclick: () => { shownN += 60; o.refresh(); } }, 'Ещё')] : [],
        words.length ? [] : [h('p', { class: 'g-note' }, query ? 'Таких слов в альбоме нет' : 'Альбом пуст: найдите первое слово')]);
    });
  }

  function moreSheet() {
    const o = showSheet('more', () => {
      const c = cfg();
      const s = g.state;
      const r = s.run;
      const set = sim.current(s);
      const status = g.links.status();
      const steps = status && status.steps && status.steps.on;
      const sets = r.sets.map((x) => {
        const p = sim.progress(s, c, lex, x);
        const left = Math.max(0, p.all4 - p.found4) + Math.max(0, p.need3 - p.found3);
        return h('button', { class: x.id === r.cur ? 'on' : '', onclick: () => {
          g.act((st) => sim.choose(st, x.id));
          view.wheel.reset();
          o.close();
        } }, h('div', { class: 'grow' }, h('div', { class: 'ww-build-title', 'data-raw': '' }, ui.raw(x.letters.toUpperCase().split('').join(' '))),
          h('div', { class: 'g-note' }, (x.theme ? x.theme + ' · ' : '') + 'найдено ' + x.found.length + ', до закрытия ' + left)));
      });
      const pending = s.meta.pending;
      return [
        h('h3', {}, 'Наборы'),
        h('div', { class: 'g-pick' }, ...sets),
        h('button', { class: 'g-btn small', id: 'next-set', onclick: () => { openNext(); o.close(); } }, 'Отложить и взять новый набор'),
        h('p', { class: 'g-note' }, 'Отложенные наборы ждут в этом списке (до ' + c['sets.keepOpen'] + '); самые старые уходят.'),
        set ? h('button', { class: 'g-btn small', onclick: () => gridSheet() }, 'Сетка этого набора') : null,
        h('div', { class: 'ww-section' }, 'Нет в словаре?'),
        h('p', { class: 'g-note' }, pending.length ? 'Ждут проверки моделью: ' + pending.map((x) => x.w).join(', ') : 'Если слово не засчиталось, а оно есть, нажмите «Нет в словаре?» под ним. Модель проверит, когда будет сеть.'),
        h('p', { class: 'g-note' }, 'Личный словарь: ' + plural(Object.keys(s.meta.extra).length, 'слово', 'слова', 'слов') + ((s.meta.rejected || []).length ? ' · не взято: ' + s.meta.rejected.length : '')),
        pending.length ? h('button', { class: 'g-btn small', onclick: () => { runModel(true); ui.toast('Спрашиваю модель'); } }, 'Проверить сейчас') : null,
        steps ? h('div', { class: 'ww-section' }, 'Шаги — топливо') : null,
        steps ? h('button', { class: 'g-btn small', onclick: spendMuse }, 'Вдохновение: слова ×' + c['muse.mult'] + ' на ' + c['muse.minutes'] + ' мин') : null,
        !r.cityPicked ? h('button', { class: 'g-btn small primary', onclick: citySheet }, 'Выбрать вид города') : null,
        h('div', { class: 'ww-section' }, 'Словарь'),
        h('button', { class: 'g-btn small', id: 'about-dict', onclick: aboutSheet }, 'О словаре: источники и лицензии')
      ].filter(Boolean);
    });
  }

  async function spendMuse() {
    const r = await g.links.spend('muse');
    if (!r.ok) {
      ui.toast(r.off ? 'Связка «Шаги» выключена' : 'Нужна энергия: ' + r.need);
      g.buzz('deny');
      return;
    }
    g.act((s) => sim.muse(s, cfg(), now()), { now: true, reason: 'spend' });
    g.sfx('level');
    if (open) open.close();
  }

  async function aboutSheet() {
    if (!about) {
      try {
        about = await (await fetch('../content/about.json')).json();
      } catch (ignored) {
        about = { title: 'О словаре', intro: '', sources: [] };
      }
    }
    let license = '';
    try {
      const r = await fetch(DATA + 'assets/LICENSE.txt');
      if (r.ok) license = await r.text();
    } catch (ignored) { /* shown without the full text */ }
    const c = cfg();
    const common = Math.min(c['dict.commonTop'], lex.size);
    showSheet('about', () => [
      h('h3', {}, about.title),
      h('p', {}, about.intro),
      h('div', { class: 'g-lines' },
        g.ui.line('Слов в словаре', g.fmt(lex.size)),
        g.ui.line('Обычных', g.fmt(common)),
        g.ui.line('Редких', g.fmt(Math.max(0, lex.size - common))),
        g.ui.line('Личный словарь', String(Object.keys(g.state.meta.extra).length))),
      ...about.sources.map((x) => h('div', { class: 'ww-entry' }, h('div', { class: 'ww-entry-top' }, h('b', {}, x.title), h('span', { class: 'badge' }, x.license)),
        h('div', { class: 'g-note' }, x.who), h('div', { class: 'g-note' }, x.what))),
      h('p', { class: 'g-note' }, about.derived),
      h('p', { class: 'g-note' }, about.extra),
      license ? h('pre', { class: 'ww-license', 'data-raw': '' }, license) : h('p', { class: 'g-note' }, 'Полный текст лицензий: data/games/word-weaver/assets/LICENSE.txt')
    ]);
  }

  const game = await Game.start({ sim, render, init: build });
  if (!g || (game && game.newer)) return;
  // The personal dictionary is part of the save: its words count as rare.
  const extra = g.state.meta.extra || {};
  if (Object.keys(extra).length) Lex.addExtra(lex, Object.keys(extra).map((k) => extra[k]));
  layout();
  ensureSet();
  if (!g.state.run.cityPicked) setTimeout(citySheet, 600);
  setTimeout(runModel, 4000);
  setInterval(() => { if (note || keys.chips) g.redraw(); }, 15000);
  window.__ww = { lex: () => lex, wheel: view.wheel, submit: submitWord, defs: () => defs };
})();
