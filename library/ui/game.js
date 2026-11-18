// The screen of «Библиотека». The engine (Game.start) gives the frame — g.el.top (numbers),
// g.el.field, g.el.actions — and keeps the state, saves, offline, prestige, sound. The logic is in
// ../sim.js; numbers come from g.config. Narrow (the cover screen): coins on top, «Столы», the tabs
// Полки / Ветви / Залы / Хранилище, the buy modes at the bottom. Wide: the plan of the library on
// the left, the desks and the tabs on the right. Model texts (annotations) go in with ui.raw.
// Every thing in a list has its picture (art.js): kinds, branches, halls, tomes, seats, events.
(async function () {
  const h = ui.h;
  const sim = window.GameSim;
  const art = window.LibArt;
  const K = sim.K;
  const B = sim.B;
  const view = {};
  const TABS = [['shelves', 'Полки'], ['branches', 'Ветви'], ['halls', 'Залы'], ['vault', 'Хранилище']];
  const MODES = [['1', '×1'], ['10', '×10'], ['milestone', 'до вехи'], ['max', 'макс']];
  const content = { events: {}, tomes: {}, reviews: [] };
  let g = null;
  let tab = pref('tab', 'shelves');
  let mode = pref('mode', '1');
  let sigs = {};
  let updaters = [];
  let deskUpd = [];
  let slowAt = 0;
  let busy = {};
  let seen = { last: 0, tomes: 0, returned: '' };
  let puzzle = null;
  let pick = [-1, -1];
  // The usual length of a trip, from the last trips of «Пассажир» (null: not known yet, road.tripMin).
  const trips = { usual: null, at: 0, busy: false };
  const MAIN = 'modules/games/main.js';

  function pref(k, d) {
    try {
      return localStorage.getItem('library:' + k) || d;
    } catch (e) {
      return d;
    }
  }

  function setPref(k, v) {
    try {
      localStorage.setItem('library:' + k, v);
    } catch (e) { /* private mode */ }
  }

  // ---- small helpers ----

  /** «2 ч 16 мин» (no seconds past an hour), «12 мин 5 с», «40 с». */
  function dur(sec) {
    const s = Math.max(0, Math.ceil(sec));
    if (s >= 3600) {
      const hh = Math.floor(s / 3600);
      const mm = Math.floor((s % 3600) / 60);
      return mm ? ui.t('{} ч {} мин', hh, mm) : ui.t('{} ч', hh);
    }
    if (s >= 60) {
      const mm = Math.floor(s / 60);
      const ss = s % 60;
      return ss ? ui.t('{} мин {} с', mm, ss) : ui.t('{} мин', mm);
    }
    return ui.t('{} с', s);
  }

  /** Parts of a line joined by « · », each in the interface's language (the dictionary has the patterns). */
  function tl(parts) { return parts.filter(Boolean).map((p) => ui.t(String(p))).join(' · '); }

  function cfg() { return g.config; }
  function now() { return Date.now(); }
  function links() { return g.links.status() || {}; }
  function liveCtx() { return { links: links(), config: cfg(), offline: false }; }
  function inTrip() { const p = links().passenger; return !!(p && p.state === 'trip'); }
  function speedNow(state) { return sim.speed(state, cfg(), now(), liveCtx()); }
  function line(k, v) { return g.ui.line(k, v); }

  /** Reads the last trips from the sheet of «Пассажир» (the engine keeps ten) at most every 10 minutes. */
  async function refreshTrips() {
    if (trips.busy || (trips.at && now() - trips.at < 600000)) return;
    trips.busy = true;
    try {
      const info = await window.axiko.call(MAIN, 'linkSheet', 'passenger', null);
      trips.usual = sim.usualTripMin(cfg(), info && info.trips);
    } catch (e) {
      trips.usual = null;
    } finally {
      trips.at = now();
      trips.busy = false;
      sigs.offer = null;
      if (g) g.redraw();
    }
  }
  function usualTrip() { return trips.usual || cfg()['road.tripMin']; }
  function note(text) { return h('p', { class: 'g-note' }, text); }
  /** The picture of a thing on its plate: ic('branch2', 'b2'), ic('lamp'), ic('secret', 'paper', { off: true }). */
  function ic(name, tone, o) { return art.icon(name, Object.assign({ tone: tone || 'grey' }, o || {})); }
  /** A book of a kind in the colour of its branch (no branch: paper). */
  function spine(b, k, extra) { return ic('kind' + k, b === null ? 'paper' : 'b' + b, extra ? { size: extra } : null); }
  /** The head of a card: picture, serif name, something on the right. */
  function head(pic, title, right) { return h('div', { class: 'l-row' }, pic, h('div', { class: 'grow l-name' }, title), right || null); }
  function hallPic(hd, off) { return ic(/^lab/.test(hd.id) ? 'lab' : hd.id, hd.branches ? 'b' + hd.branches[0] : 'paper', off ? { off: true } : null); }
  function tomePic(t, o) { return ic(t.id, t.b !== undefined ? 'b' + t.b : 'gold', Object.assign({ cls: 'tome' }, o || {})); }
  function buildingPic(n, o) { return ic('building' + Math.min(sim.BUILDINGS.length - 1, Math.max(0, n)), 'paper', o); }
  function raw(text, cls) { return h('span', { class: cls || '', 'data-raw': '' }, ui.raw(text || '')); }
  function price(x) { return g.fmt.price(x); }
  function deny() {
    g.sfx('deny');
    g.buzz('deny');
  }
  function ok(sound) {
    g.sfx(sound || 'buy');
    g.buzz(sound === 'level' ? 'level' : 'buy');
  }
  function building(state) { return sim.building(state); }
  function exlibris(state) { return Big.of(state.layers[sim.LAYER] ? state.layers[sim.LAYER].currency : 0, 0); }

  function remaining(state, d) {
    const x = state.run.desks[d];
    if (!x) return 0;
    return Math.max(0, (x.w - x.p) / (speedNow(state) * sim.bookFactor(state, cfg(), x.k)));
  }

  function bookTime(state, k) {
    return sim.work(cfg(), k) / (speedNow(state) * sim.bookFactor(state, cfg(), k));
  }

  function maxKind(state) {
    let m = -1;
    for (let k = 0; k < K; k++) if (sim.ownKind(state, k) > 0) m = k;
    return m;
  }

  function fxText(state, id) {
    const t = sim.tomeDef(id);
    const c = cfg();
    let v = Number(c['tome.' + id]) || 0;
    if (sim.hallOpen(state, 'secret')) v *= c['hall.secret.mult'];
    return String(sim.TOME_FX[t.fx] || '').replace('{b}', t.b !== undefined ? sim.BRANCH_NAMES[t.b] : '')
      .replace('{m}', g.fmt.mult(1 + v).replace('×', '')).replace('{p}', g.fmt.pct(v));
  }

  function branchEffect(b) {
    const c = cfg();
    const v = [c['branch.nature.mult'], c['branch.history.speed'], c['branch.letters.annot'], c['branch.art.halls'], c['branch.crafts.discount'], c['branch.secret.unique']][b];
    return String(sim.BRANCH_EFFECTS[b]).replace('{v}', g.fmt.mult(v).replace('×', '')).replace('{p}', g.fmt.pct(v));
  }

  function specials(b) {
    const c = cfg();
    return [
      [[c['branch.nature.herbarium'], 'зал «Гербарий»']],
      [[c['branch.history.pair'], 'две короткие книги на столе за одну']],
      [[c['branch.letters.favorite'], '«Любимая книга»: один вид ×' + c['branch.letters.favoriteMult']]],
      [[c['branch.art.gallery'], 'зал «Галерея гравюр»']],
      [[c['branch.crafts.bindery'], 'переплётная: запасники ' + g.fmt.mult(c['storage.bindery'])], [c['branch.crafts.quartermaster'], 'Завхоз покупает поставки сам']],
      [[c['branch.secret.hall'], '«Тайный зал»']]
    ][b];
  }

  function hallEffect(hd) {
    const m = g.fmt.mult(hd.mult);
    if (hd.id === 'reading') return 'обычный зал';
    if (hd.librarian) return hd.text;
    if (hd.tomes) return 'эффекты уникальных томов ' + m;
    return hd.text + ' ' + m;
  }

  function councilText(c) {
    const x = cfg();
    if (c.id === 'read') return c.text.replace('{m}', g.fmt.mult(x['council.read.mult']).replace('×', ''));
    if (c.id === 'unique') return c.text.replace('{m}', g.fmt.mult(x['council.unique.mult']).replace('×', ''));
    if (c.id === 'offline') return c.text.replace('{p}', g.fmt.pct(x['council.offline.step']));
    if (c.id === 'memory') return c.text.replace('{p}', g.fmt.pct(x['council.memory.share']));
    if (c.id === 'coins') return 'в начале здания ' + g.fmt(Big.mul(x['council.coins.base'], Big.pow(x['council.coins.step'], sim.council(g.state, 'coins')))) + ' монет';
    return c.text;
  }

  function eventEffect(e) {
    const c = cfg();
    const M = (v) => g.fmt.mult(v);
    switch (e.id) {
      case 'excursion': return 'Монеты ' + M(c['event.excursion.coins']) + ', чтение ' + M(c['event.excursion.read']) + ' на ' + dur(c['event.excursion.sec']);
      case 'professor': return '+' + c['event.professor.books'] + ' книг: ' + sim.KIND_SHORT[c['event.professor.kind'] - 1];
      case 'tea': return 'Реставрация: +' + c['event.tea.knowledge'] + ' знание ветви «' + sim.BRANCH_NAMES[e.b] + '»';
      case 'returned': return '+' + c['event.returned.min'] + ' минут монет';
      case 'quiet': return 'Чтение ' + M(c['event.quiet.mult']) + ' на ' + dur(c['event.quiet.sec']);
      case 'bookseller': return 'До ' + c['event.bookseller.books'] + ' книг одного вида за ' + g.fmt.pct(c['event.bookseller.price']) + ' цены';
      case 'bookmark': return 'Следующая книга прочтётся сразу';
      case 'note': return 'Шанс уникального тома ' + M(c['event.note.mult']) + ' на следующую книгу';
      case 'contest': return 'Словесность ' + M(c['event.contest.mult']) + ' до конца здания';
      case 'roof': return 'Починка — ' + c['event.roof.fixMin'] + ' мин монет; или книги в запасники на ' + dur(c['event.roof.min'] * 60) + ' (запасники ' + M(c['event.roof.storage']) + ')';
      case 'opendoors': return 'Залы ' + M(c['event.opendoors.mult']) + ' на ' + dur(c['event.opendoors.sec']);
      case 'students': return sim.KIND_SHORT[c['event.students.kind'] - 1] + ' ' + M(c['event.students.mult']) + ' на ' + dur(c['event.students.sec']);
      case 'cat': return 'Встреч: ' + (Number(g.state.meta.cats) || 0) + '; каждые ' + c['event.cat.every'] + ' — ячейка Хранилища';
      case 'catalog': return 'Найдите три книги ветви «' + sim.BRANCH_NAMES[e.b] + '»: +' + c['event.catalog.knowledge'] * building(g.state) + ' знаний';
      case 'writer': return 'Книги Словесности ' + M(c['event.writer.mult']) + ' на ' + dur(c['event.writer.sec']);
      default: return '';
    }
  }

  // ---- building the screen ----

  function build(game) {
    g = game;
    window.GameIcons.add('book', '<path d="M4 19V5a2 2 0 0 1 2-2h14v14H6a2 2 0 0 0-2 2 2 2 0 0 0 2 2h14"/><path d="M9 7h7"/>');
    view.coins = h('div', { class: 'g-big', id: 'coins' });
    view.rate = h('div', { class: 'g-rate', id: 'rate' });
    view.sub = h('div', { class: 'l-sub', id: 'sub' });
    g.el.top.append(view.coins, view.rate, view.sub);

    view.event = h('div', { id: 'event' });
    view.offer = h('div', { id: 'offer' });
    view.onGo = h('button', { class: 'g-btn small', id: 'on-the-go', onclick: onTheGo });
    view.speed = h('span', { class: 'l-small', id: 'speed' });
    view.desks = h('div', { class: 'l-desks', id: 'desks' });
    view.tabs = h('div', { class: 'l-tabs', id: 'tabs' }, TABS.map(([id, title]) => h('button', {
      class: 'chip', 'data-tab': id, onclick: () => {
        tab = id;
        setPref('tab', id);
        sigs.tab = null;
        g.redraw();
      }
    }, title)));
    view.body = h('div', { class: 'l-body', id: 'tab-body' });
    view.panel = h('div', { class: 'l-panel' }, view.event, view.offer,
      h('div', { class: 'l-head' }, h('h2', { class: 'l-h' }, 'Столы'), view.speed, view.onGo), view.desks, view.tabs, view.body);
    view.modes = h('div', { class: 'l-modes', id: 'modes' }, MODES.map(([id, title]) => h('button', {
      class: 'chip', 'data-mode': id, onclick: () => {
        mode = id;
        setPref('mode', id);
        g.redraw();
      }
    }, title)));
    view.plan = h('div', { class: 'l-plan', id: 'plan' });
    if (Game.scene && window.LibraryScene) {
      view.worldRoot = h('div', { class: 'l-world' });
      view.world = Game.scene({ parent: view.worldRoot, label: 'Живая библиотека', width: 1000, height: 620, game: g, draw: LibraryScene.draw });
      view.worldNote = h('div', { class: 'l-world-note' });
      view.worldRoot.append(view.worldNote);
      g.on('offline', () => { view.worldPrevious = null; });
    }
    placePanel();

    g.on('resize', () => {
      placePanel();
      g.redraw();
    });
    g.on('offline', onOffline);
    g.on('chest', () => {
      sigs.desks = null;
      annotateSoon();
    });
    g.on('prestige', () => {
      sigs = {};
      remember(g.state);
      g.achieve('new-building');
    });
    g.on('links', () => { sigs.offer = null; });
    remember(g.state);
    ['events', 'tomes', 'reviews'].forEach((name) => {
      fetch('../content/' + name + '.json').then((r) => r.json()).then((v) => {
        content[name] = v;
        sigs = {};
        g.redraw();
      }).catch(() => {});
    });
  }

  function placePanel() {
    const wide = g.layout === 'wide';
    if (view.wide === wide) return;
    view.wide = wide;
    if (wide) {
      g.el.field.replaceChildren(...[view.worldRoot, view.plan].filter(Boolean));
      g.el.actions.replaceChildren(view.panel, view.modes);
    } else {
      g.el.field.replaceChildren(...[view.worldRoot, view.panel].filter(Boolean));
      g.el.actions.replaceChildren(view.modes);
    }
    sigs.plan = null;
  }

  // ---- the desks ----

  function deskSig(state) {
    return state.run.desks.map((d) => (d ? d.id + (d.tpl ? 't' : '') + (d.train ? 'p' : '') : '-')).join(',') + '|' + sim.librarian(state) +
      '|' + (state.run.desks.length < cfg()['desk.max']) + '|' + (state.run.desks.some((d) => !d) ? hasUnread(state) : '');
  }

  function hasUnread(state) {
    for (let k = 0; k < K; k++) if (sim.unreadKind(state, k) > 0) return true;
    return false;
  }

  function drawDesks(state) {
    const sig = deskSig(state);
    if (sig !== sigs.desks) {
      sigs.desks = sig;
      deskUpd = [];
      const cards = state.run.desks.map((d, i) => (d ? bookCard(state, i) : freeCard(state, i)));
      if (state.run.desks.length < cfg()['desk.max']) cards.push(buyDeskCard());
      view.desks.replaceChildren(...cards);
    }
    deskUpd.forEach((fn) => fn(state));
  }

  function bookCard(state, i) {
    const d = state.run.desks[i];
    const title = raw(d.t, 'l-desk-title');
    const sub = h('span', { class: 'l-desk-sub' });
    const bar = h('i', {});
    const time = h('span', { class: 'l-desk-time' });
    const card = h('button', { class: 'l-desk', 'data-desk': i, onclick: () => bookSheet(i) },
      spine(d.b, d.k), h('span', { class: 'l-desk-main' }, title, sub, h('span', { class: 'l-bar' }, bar)), time);
    const kn = sim.knowledgeOf(state, cfg(), d.k, d.b) * d.n;
    sub.textContent = tl([sim.KIND_SHORT[d.k], sim.BRANCH_NAMES[d.b], '+' + kn + ' зн.', d.n > 1 && 'две книги', d.train && 'из поезда']);
    deskUpd.push((s) => {
      const x = s.run.desks[i];
      if (!x) return;
      bar.style.width = Math.min(100, (x.p / x.w) * 100).toFixed(1) + '%';
      time.textContent = dur(remaining(s, i));
    });
    return card;
  }

  function freeCard(state, i) {
    const lib = sim.librarian(state);
    const any = hasUnread(state);
    const text = !any ? 'Нет непрочитанных книг — купите поставку' : lib ? 'Библиотекарь поставит книгу' : 'Поставить книгу';
    return h('button', { class: 'l-desk free', 'data-desk': i, onclick: () => placeSheet(i) },
      ic('desks', 'grey', { off: true }),
      h('span', { class: 'l-desk-main' }, h('span', { class: 'l-desk-title' }, 'Свободный стол'), h('span', { class: 'l-desk-sub' }, text)));
  }

  function buyDeskCard() {
    const label = h('span', { class: 'l-desk-sub' });
    const card = h('button', { class: 'l-desk buy', id: 'buy-desk', onclick: buyDesk }, ic('plus', 'grey', { off: true }),
      h('span', { class: 'l-desk-main' }, h('span', { class: 'l-desk-title' }, 'Ещё один стол'), label));
    deskUpd.push((s) => {
      const p = sim.deskCost(s, cfg());
      label.textContent = 'Стол №' + (s.run.desks.length + 1) + ' — ' + price(p) + ' монет';
      card.disabled = Big.lt(s.run.coins, p);
    });
    return card;
  }

  function buyDesk() {
    if (!g.act((s) => sim.buyDesk(s, cfg()))) return deny();
    ok();
    annotateSoon();
  }

  function bookSheet(i) {
    const s = g.state;
    const d = s.run.desks[i];
    if (!d) return;
    g.act((st) => {
      const x = st.run.desks[i];
      if (x && !x.s) x.s = 1;
    });
    const kn = sim.knowledgeOf(s, cfg(), d.k, d.b) * d.n;
    const close = g.sheet([
      h('div', { class: 'l-book-head' }, spine(d.b, d.k, 'big'),
        h('div', { class: 'grow' }, h('h3', { 'data-raw': '' }, ui.raw(d.t)), raw(d.a, 'g-note'))),
      h('div', { class: 'l-annot', 'data-raw': '' }, ui.raw(d.x)),
      d.tpl ? note('Это описание из шаблона: модель напишет аннотацию, когда будет сеть, и она появится здесь.') : null,
      h('div', { class: 'g-lines' },
        line('Вид', sim.KIND_NAMES[d.k]), line('Ветвь', sim.BRANCH_NAMES[d.b]),
        line('Осталось читать', dur(remaining(s, i))), line('Знаний', '+' + kn),
        sim.level(s, 2) > 0 ? line('Прочитанная аннотация', '+' + g.fmt.pct(cfg()['branch.letters.annot'] * sim.level(s, 2)) + ' виду') : null),
      h('div', { class: 'g-btns' },
        h('button', {
          class: 'g-btn small', onclick: () => {
            close();
            g.act((st) => sim.unplace(st, i));
          }
        }, 'Снять со стола'),
        h('button', { class: 'g-btn small primary', onclick: () => close() }, 'Читать дальше'))
    ]);
  }

  function placeSheet(i) {
    const s = g.state;
    const rows = [];
    for (let k = 0; k < K; k++) {
      const n = sim.unreadKind(s, k);
      if (n <= 0) continue;
      const kn = sim.knowledgeOf(s, cfg(), k, 0);
      rows.push(h('button', {
        'data-kind': k, onclick: () => {
          close();
          if (!g.act((st) => sim.placeKind(st, cfg(), i, k))) return deny();
          ok('tap');
          annotateSoon();
        }
      }, spine(null, k), h('div', { class: 'grow' }, h('div', { class: 'l-name' }, sim.KIND_NAMES[k]),
        h('div', { class: 'l-small' }, tl([dur(bookTime(s, k)), '+' + kn + ' знаний', 'не прочитано ' + n])))));
    }
    const tripMin = Math.round(usualTrip());
    const road = sim.roadKind(s, cfg(), tripMin, now());
    const close = g.sheet([h('h3', {}, 'Какую книгу поставить'),
      rows.length ? note('Короткие — пока вы в игре, длинные — на ночь и в дорогу: чтение офлайн идёт по честным часам.' +
        (road >= 0 ? ' На ' + (trips.usual ? 'вашу обычную поездку' : 'поездку') + ' в ' + tripMin + ' мин подойдут: ' + sim.KIND_SHORT[road] + '.' : '')) : note('Непрочитанных книг нет — купите поставку на вкладке «Полки».'),
      h('div', { class: 'g-pick' }, rows),
      h('button', { class: 'g-btn small', onclick: () => close() }, 'Закрыть')]);
  }

  async function onTheGo() {
    const r = await g.links.spend('read-on-the-go');
    if (!r.ok) {
      ui.toast(r.off ? 'Связка «Шаги» выключена' : 'Нужна ' + r.need + ' энергия — это ~' + g.fmt(r.need * (cfg()['steps.perSteps'] || 1000)) + ' шагов');
      return deny();
    }
    const before = Number(g.state.run.readTotal) || 0;
    g.act((s) => sim.readAhead(s, cfg(), cfg()['onthego.minutes'], now()), { now: true, reason: 'spend' });
    const read = (Number(g.state.run.readTotal) || 0) - before;
    g.flash('steps', 'Читаете на ходу', '−' + cfg()['onthego.minutes'] + ' мин у всех столов' + (read ? ', дочитано книг: ' + read : ''));
    ok('level');
  }

  // ---- the event card and the road offer ----

  function eventText(e) {
    const own = g.state.meta.evText && g.state.meta.evText[e.id];
    const def = content.events[e.id] || { title: '', text: '' };
    return own ? { title: own.title, text: own.text, model: true, yes: def.yes, no: def.no } : def;
  }

  function drawEvent(state) {
    const e = state.run.event;
    const sig = e ? e.id + e.at + (puzzle ? puzzle.found.join('') + puzzle.miss.join('') : '') + (content.events[e.id] ? 1 : 0) : '';
    if (sig === sigs.event) {
      if (view.evLeft && e) view.evLeft.textContent = 'ещё ' + dur((e.until - now()) / 1000);
      return;
    }
    sigs.event = sig;
    if (!e) {
      puzzle = null;
      view.event.replaceChildren();
      return;
    }
    if (puzzle && puzzle.at !== e.at) puzzle = null;
    takeEventText(e.id);
    const t = eventText(e);
    view.evLeft = h('span', { class: 'l-small' });
    const buttons = [];
    if (e.id === 'bookseller') {
      for (let k = 0; k <= Math.max(0, maxKind(state)); k++) {
        const n = Math.min(cfg()['event.bookseller.books'], sim.supplyMax(state, cfg(), k, Big.div(state.run.coins, cfg()['event.bookseller.price'])));
        buttons.push(h('button', { class: 'g-btn small', disabled: n <= 0, onclick: () => answer('yes', k) }, sim.KIND_SHORT[k] + (n > 0 ? ' +' + n : '')));
      }
      buttons.push(h('button', { class: 'g-btn small', onclick: () => answer('no') }, t.no || 'Не сейчас'));
    } else if (e.id === 'catalog' && puzzle) {
      buttons.push(h('button', { class: 'g-btn small', onclick: () => answer('no') }, t.no || 'Пропустить'));
    } else if (e.id === 'catalog') {
      buttons.push(h('button', { class: 'g-btn small primary', onclick: () => { puzzle = { at: e.at, found: [], miss: [] }; sigs.event = null; g.redraw(); } }, t.yes || 'Разобрать'));
      buttons.push(h('button', { class: 'g-btn small', onclick: () => answer('no') }, t.no || 'Пропустить'));
    } else {
      buttons.push(h('button', { class: 'g-btn small primary', onclick: () => answer('yes') }, t.yes || 'Хорошо'));
      if (t.no) buttons.push(h('button', { class: 'g-btn small', onclick: () => answer('no') }, t.no));
    }
    const parts = [h('div', { class: 'l-row' }, ic(e.id, 'gold'), h('div', { class: 'grow l-event-title' }, t.model ? ui.raw(t.title) : t.title), view.evLeft),
      t.model ? raw(t.text, 'g-note') : note(t.text), h('div', { class: 'l-event-fx' }, eventEffect(e))];
    if (puzzle) parts.push(puzzleGrid(e));
    parts.push(h('div', { class: 'g-btns', style: 'flex-wrap: wrap' }, buttons));
    view.event.replaceChildren(h('div', { class: 'l-event', id: 'event-card', 'data-event': e.id }, parts));
    view.evLeft.textContent = 'ещё ' + dur((e.until - now()) / 1000);
  }

  function puzzleGrid(e) {
    return h('div', { class: 'l-puzzle', id: 'puzzle' }, e.cells.map((b, i) => h('button', {
      class: 'b' + b + (puzzle.found.indexOf(i) >= 0 ? ' found' : '') + (puzzle.miss.indexOf(i) >= 0 ? ' miss' : ''),
      'aria-label': sim.BRANCH_NAMES[b], 'data-cell': i,
      onclick: () => {
        if (puzzle.found.indexOf(i) >= 0 || puzzle.miss.indexOf(i) >= 0) return;
        if (b === e.b) {
          puzzle.found.push(i);
          g.sfx('tap');
          if (puzzle.found.length >= 3) return answer('solved');
        } else {
          puzzle.miss.push(i);
          deny();
        }
        sigs.event = null;
        g.redraw();
      }
    })));
  }

  function answer(choice, arg) {
    const r = g.act((s) => sim.answer(s, cfg(), choice, now(), arg), { now: true, reason: 'action' });
    puzzle = null;
    sigs.event = null;
    if (!r || !r.ok) {
      ui.toast(r && r.text ? r.text : 'Не получилось');
      return deny();
    }
    if (r.text) ui.toast(r.text);
    ok(choice === 'no' ? 'tap' : 'level');
    annotateSoon();
  }

  function drawOffer(state) {
    const p = links().passenger;
    const going = p && p.on !== false && (p.state === 'trip' || p.state === 'maybe');
    const since = p ? Number(p.since) || 0 : 0;
    const free = state.run.desks.indexOf(null);
    if (going) refreshTrips();
    // The book is matched to the trip still ahead: the usual length less the minutes already on the way.
    const left = sim.roadMinutes(cfg(), usualTrip(), since ? (now() - since) / 60000 : 0);
    const k = going && free >= 0 && state.run.roadFor !== since ? sim.roadKind(state, cfg(), left, now()) : -1;
    const sig = k + ':' + free + ':' + since;
    if (sig === sigs.offer) return;
    sigs.offer = sig;
    if (k < 0) {
      view.offer.replaceChildren();
      return;
    }
    const t = sim.work(cfg(), k) / (sim.speed(state, cfg(), now(), { links: { passenger: { state: 'trip' } }, config: cfg() }) * sim.bookFactor(state, cfg(), k));
    view.offer.replaceChildren(h('div', { class: 'l-card', id: 'road-offer' },
      h('div', { class: 'l-row' }, ic('road', 'gold'), h('div', { class: 'grow' }, h('div', { class: 'l-name' }, 'Книга на дорогу'),
        h('div', { class: 'l-small' }, sim.KIND_NAMES[k] + ': в поездке дочитается за ' + dur(t)))),
      h('div', { class: 'g-btns' },
        h('button', {
          class: 'g-btn small primary', onclick: () => {
            g.act((s) => {
              s.run.roadFor = since;
              sim.placeKind(s, cfg(), free, k);
            });
            ok('tap');
            annotateSoon();
          }
        }, 'Поставить'),
        h('button', { class: 'g-btn small', onclick: () => g.act((s) => { s.run.roadFor = since; }) }, 'Не надо'))));
  }

  // ---- the tabs ----

  function drawTabs(state) {
    view.tabs.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c.dataset.tab === tab));
    const sig = tab + '|' + tabSig(state);
    if (sig !== sigs.tab) {
      sigs.tab = sig;
      updaters = [];
      const parts = tab === 'branches' ? branchesTab(state) : tab === 'halls' ? hallsTab(state) : tab === 'vault' ? vaultTab(state) : shelvesTab(state);
      view.body.replaceChildren(...parts.filter(Boolean));
    }
    updaters.forEach((fn) => fn(state));
    const shelves = tab === 'shelves';
    view.modes.hidden = !shelves;
    view.modes.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c.dataset.mode === mode));
    g.el.actions.classList.toggle('l-none', !view.wide && !shelves);
  }

  function tabSig(state) {
    const r = state.run;
    const b = building(state);
    if (tab === 'shelves') {
      return [b, maxKind(state), mode, sim.level(state, 4) >= cfg()['branch.crafts.quartermaster'], r.autoBuy, (r.loans || []).length, (r.returned || []).length, r.fav].join(',');
    }
    if (tab === 'branches') {
      return [b, r.levels.join('.'), (state.meta.treatises || []).length, r.fav, Object.keys(r.upgrades).join('.'), maxKind(state), pick.join('.')].join(',');
    }
    if (tab === 'halls') {
      return [b, r.halls.join('.'), r.lab, r.rule, r.theme ? r.theme.title : '', r.exhibits, sim.council(state, 'catalog'), sim.librarian(state), r.roofUntil > now()].join(',');
    }
    return [b, r.tomes.join('.'), (state.meta.vault || []).join('.'), JSON.stringify(state.meta.council || {}), (state.meta.collection || []).length,
      r.damaged, r.restoreUntil ? 1 : 0, sim.vaultSlots(state, cfg()), (state.meta.catalog || []).length > 0].join(',');
  }

  // Полки: the shelves of the 8 kinds, buying by the mode at the bottom.
  function shelvesTab(state) {
    const parts = [];
    const r = state.run;
    const c = cfg();
    if (sim.level(state, 4) >= c['branch.crafts.quartermaster']) {
      parts.push(h('div', { class: 'l-card' }, h('div', { class: 'l-row' }, ic('crate', 'b4'),
        h('div', { class: 'grow' }, h('div', { class: 'l-name' }, 'Завхоз'), h('div', { class: 'l-small' }, 'сам покупает поставку, которая окупится быстрее')),
        h('button', { class: 'chip' + (r.autoBuy !== 0 ? ' on' : ''), id: 'auto-buy', onclick: () => g.act((s) => { s.run.autoBuy = s.run.autoBuy === 0 ? 1 : 0; }) }, r.autoBuy !== 0 ? 'включён' : 'выключен'))));
    }
    if (building(state) >= c['lend.building']) parts.push(loansCard(state));
    const top = Math.min(K - 1, maxKind(state) + 1);
    for (let k = 0; k <= top; k++) parts.push(kindCard(state, k));
    if (top < K - 1) parts.push(note('Дальше: ' + sim.KIND_NAMES.slice(top + 1).join(', ') + '.'));
    return parts;
  }

  function kindCard(state, k) {
    const c = cfg();
    const shelf = h('div', { class: 'l-shelf' });
    const info = h('div', { class: 'l-small' });
    const label = h('span', {});
    const sub = h('span', { class: 'g-sub' });
    const buy = h('button', { class: 'g-btn small primary', 'data-buy': k, onclick: () => buySupply(k) }, h('span', {}, label, sub));
    const count = h('span', { class: 'l-small' });
    const lendBtn = building(state) >= c['lend.building'] ? h('button', { class: 'g-btn small', onclick: () => lendSheet(k) }, 'Выдать') : null;
    let shelfSig = '';
    updaters.push((s) => {
      const own = sim.ownKind(s, k);
      const read = Math.min(sim.readKind(s, k), own);
      const ss = own + ':' + read;
      if (ss !== shelfSig) {
        shelfSig = ss;
        drawShelf(shelf, s, k);
      }
      const next = sim.nextMilestone(c, own);
      count.textContent = own ? own + ' шт.' : 'нет';
      const det = view.detail;
      const per = det ? det.byKind[k] : 0;
      info.textContent = tl([own ? '+' + g.fmt(per * g.links.mult()) + '/с' : 'за книгу ' + g.fmt(c['supply.income'] * Math.pow(c['supply.incomeStep'], k)) + '/с',
        next ? 'веха ' + next + ' через ' + (next - own) : 'все вехи', g.fmt.mult(sim.milestoneMult(c, own)),
        read && 'прочитано ' + read + ', советуют ' + g.fmt.mult(1 + (c['advice.per'] + sim.tomeValue(s, c, 'letters')) * read),
        s.run.fav === k && sim.level(s, 2) >= c['branch.letters.favorite'] && 'любимая']);
      const n = sim.amountFor(s, c, k, mode === 'milestone' || mode === 'max' ? mode : Number(mode));
      const p = sim.supplyCost(s, c, k, n);
      label.textContent = '+' + n;
      sub.textContent = price(p);
      buy.disabled = Big.lt(s.run.coins, p);
    });
    return h('div', { class: 'l-card', 'data-kind': k },
      head(spine(null, k), sim.KIND_NAMES[k], count),
      shelf, info, h('div', { class: 'g-btns' }, buy, lendBtn));
  }

  /** The shelf of a kind: up to 48 spines in the shares of the branches; the read ones a shade paler. */
  function drawShelf(el, state, k) {
    const own = sim.ownKind(state, k);
    const show = Math.min(48, own);
    const out = [];
    if (!show) {
      el.classList.add('empty');
      el.replaceChildren();
      return;
    }
    el.classList.remove('empty');
    for (let b = 0; b < B; b++) {
      const gi = sim.group(k, b);
      const n = Math.round(state.run.own[gi] * show / own);
      const rd = Math.round(state.run.rd[gi] * show / own);
      for (let i = 0; i < n; i++) out.push(h('i', { class: 'b' + b + ' v' + ((i * 7 + b * 3 + k) % 4) + (i < rd ? ' rd' : '') + (k >= 5 && i % 3 === 0 ? ' tall' : '') }));
    }
    el.replaceChildren(...out.slice(0, 48));
  }

  function buySupply(k) {
    const n = sim.amountFor(g.state, cfg(), k, mode === 'milestone' || mode === 'max' ? mode : Number(mode));
    if (!g.act((s) => sim.buySupply(s, cfg(), k, n))) return deny();
    ok();
  }

  function loansCard(state) {
    const c = cfg();
    const list = h('div', { class: 'g-lines' });
    const r = state.run;
    const last = (r.returned || [])[(r.returned || []).length - 1];
    updaters.push((s) => {
      const loans = s.run.loans || [];
      list.replaceChildren(...(loans.length ? loans.map((l) => line(sim.KIND_SHORT[l.k] + ', ' + l.n + ' кн.', 'вернутся через ' + dur((l.until - now()) / 1000) + ' · +' + g.fmt(Big.of(l.coins)))) : [note('Выдайте часть полки на 1–' + c['lend.maxHours'] + ' ч: книги вернутся с монетами и отзывами.')]));
    });
    const review = last && content.reviews.length ? content.reviews[last.review % content.reviews.length] : '';
    return h('div', { class: 'l-card', id: 'loans' }, head(ic('lending', 'paper'), 'Абонемент',
      h('span', { class: 'l-small' }, 'выдач ' + (r.loans || []).length + ' из ' + c['lend.slots'])), list,
    last ? h('div', { class: 'l-small' }, 'Вернули ' + sim.KIND_SHORT[last.k].toLowerCase() + ': +' + g.fmt(Big.of(last.coins)) + (review ? ' · «' + review + '»' : '')) : null);
  }

  function lendSheet(k) {
    const c = cfg();
    let hours = 4;
    const lines = h('div', { class: 'g-lines' });
    const chips = h('div', { class: 'l-chips' });
    function draw() {
      chips.replaceChildren(...[1, 2, 4, 6, 8].filter((x) => x <= c['lend.maxHours']).map((x) => h('button', {
        class: 'chip' + (x === hours ? ' on' : ''), onclick: () => {
          hours = x;
          draw();
        }
      }, x + ' ч')));
      const m = sim.mults(g.state, c, now(), null);
      let shelf = 0;
      for (let b = 0; b < B; b++) shelf += sim.unread(g.state, k, b) + Math.min(g.state.run.rd[sim.group(k, b)], g.state.run.own[sim.group(k, b)]);
      const n = Math.floor(shelf * c['lend.share']);
      const coins = Big.mul(n * m.kind[k] * m.global * hours * 3600 * c['lend.mult'] * (1 + sim.tomeValue(g.state, c, 'streets')), m.scale);
      lines.replaceChildren(line('Книг уйдёт', n), line('Вернутся через', dur(hours * 3600)), line('Принесут', '+' + g.fmt(coins)));
    }
    draw();
    const close = g.sheet([h('h3', {}, 'Выдать: ' + sim.KIND_NAMES[k]), note('Четверть полки уходит к читателям; пока книги на руках, они не приносят дохода на полках.'), chips, lines,
      h('div', { class: 'g-btns' },
        h('button', { class: 'g-btn small', onclick: () => close() }, 'Отмена'),
        h('button', {
          class: 'g-btn small primary', onclick: () => {
            const l = g.act((s) => sim.lend(s, c, k, hours, now()));
            close();
            if (!l) {
              ui.toast((g.state.run.loans || []).length >= c['lend.slots'] ? 'Все выдачи заняты' : 'Мало книг на полке');
              return deny();
            }
            ok();
          }
        }, 'Выдать'))]);
  }

  // Ветви: reading speed, the 6 branches and their levels, the favourite book, treatises.
  function branchesTab(state) {
    const c = cfg();
    const parts = [];
    const speedLine = h('div', { class: 'l-small' });
    // Лампа, Очки, Тишина: levels without a ceiling, each next one upgrade.growth times dearer.
    const ups = sim.UPGRADES.map((u) => {
      const sub = h('span', { class: 'g-sub' });
      const name = h('div', { class: 'l-name' });
      const b = h('button', { class: 'g-btn small', 'data-upgrade': u.id, onclick: () => buyUpgrade(u.id) }, h('span', {}, 'Улучшить', sub));
      updaters.push((s) => {
        const lv = sim.upgradeLevel(s, u.id);
        const p = sim.upgradeCost(s, c, u.id);
        name.textContent = ui.t(u.title) + (lv ? ' · ' + ui.t('ур. {}', lv) : '');
        sub.textContent = price(p);
        b.disabled = Big.lt(s.run.coins, p);
      });
      return h('div', { class: 'l-row', 'data-upgrade-row': u.id }, ic(u.id, 'gold'),
        h('div', { class: 'grow' }, name, h('div', { class: 'l-small' }, ui.t('чтение {} за уровень', g.fmt.mult(c['upgrade.mult'])))), b);
    });
    updaters.push((s) => {
      speedLine.textContent = tl(['Скорость чтения ' + g.fmt.mult(speedNow(s)), inTrip() && 'в поездке ' + g.fmt.mult(c['trip.read']),
        'книга вида 8 — ' + dur(bookTime(s, 7))]);
    });
    parts.push(h('div', { class: 'l-card', id: 'reading' }, head(ic('clock', 'paper'), 'Чтение'), speedLine, ups));
    for (let b = 0; b < B; b++) parts.push(branchCard(state, b));
    if (sim.level(state, 2) >= c['branch.letters.favorite']) parts.push(favoriteCard(state));
    if (building(state) >= c['treatise.building']) parts.push(treatiseCard(state));
    return parts;
  }

  function branchCard(state, b) {
    const c = cfg();
    const lv = sim.level(state, b);
    const have = h('span', { class: 'l-small' });
    const sub = h('span', { class: 'g-sub' });
    const btn = h('button', { class: 'g-btn small primary', 'data-branch': b, onclick: () => openLevel(b) }, h('span', {}, 'Уровень ' + (lv + 1), sub));
    updaters.push((s) => {
      const cost = sim.levelCost(s, c, b);
      have.textContent = 'знаний ' + g.fmt(Math.floor(s.run.kn[b])) + ' из ' + g.fmt(cost);
      sub.textContent = g.fmt(cost) + ' знаний';
      btn.disabled = s.run.kn[b] < cost;
    });
    const sp = specials(b).map(([n, text]) => h('div', { class: 'l-small', style: lv >= n ? 'color: var(--ink)' : '' }, (lv >= n ? 'есть: ' : n + '-й уровень: ') + text));
    return h('div', { class: 'l-card', 'data-branch-card': b },
      h('div', { class: 'l-row' }, ic('branch' + b, 'b' + b), h('div', { class: 'grow' }, h('div', { class: 'l-name' }, ui.t(sim.BRANCH_NAMES[b]) + ' · ' + ui.t('ур. {}', lv)), have, h('div', { class: 'l-small' }, branchEffect(b))), btn),
      sp);
  }

  function favoriteCard(state) {
    const fav = state.run.fav;
    return h('div', { class: 'l-card' }, head(ic('heart', 'b2'), 'Любимая книга'),
      h('div', { class: 'l-small' }, 'один вид приносит как ещё ' + (cfg()['branch.letters.favoriteMult'] - 1) + ' его книг'),
      h('div', { class: 'l-chips' }, sim.KIND_SHORT.slice(0, Math.max(1, maxKind(state) + 1)).map((name, k) => h('button', {
        class: 'chip' + (fav === k ? ' on' : ''), onclick: () => g.act((s) => sim.setFavorite(s, cfg(), k))
      }, name))));
  }

  function treatiseCard(state) {
    const c = cfg();
    const cost = sim.treatiseCost(state, c);
    const list = (state.meta.treatises || []).map((t) => h('div', { class: 'l-small' }, '«' + sim.BRANCH_NAMES[t[0]] + ' и ' + sim.BRANCH_NAMES[t[1]] + '»: книги обеих ' + g.fmt.mult(c['treatise.mult'])));
    const chips = (slot) => h('div', { class: 'l-chips' }, sim.BRANCH_NAMES.map((name, b) => h('button', {
      class: 'chip' + (pick[slot] === b ? ' on' : ''), onclick: () => {
        pick[slot] = b;
        g.redraw();
      }
    }, name)));
    const btn = h('button', {
      class: 'g-btn small primary', onclick: () => {
        if (!g.act((s) => sim.writeTreatise(s, c, pick[0], pick[1]))) {
          ui.toast(pick[0] === pick[1] ? 'Нужны две разные ветви' : 'Не хватает знаний или такой трактат уже есть');
          return deny();
        }
        pick = [-1, -1];
        ok('level');
      }
    }, 'Написать трактат — по ' + g.fmt(cost) + ' знаний');
    return h('div', { class: 'l-card', id: 'treatise' }, head(ic('treatise', 'paper'), 'Трактаты'),
      h('div', { class: 'l-small' }, 'знания двух ветвей → книги обеих ' + g.fmt.mult(c['treatise.mult']) + ' навсегда'), list, chips(0), chips(1), btn);
  }

  function buyUpgrade(id) {
    if (!g.act((s) => sim.buyUpgrade(s, cfg(), id))) return deny();
    ok('level');
  }

  function openLevel(b) {
    if (!g.act((s) => sim.openLevel(s, cfg(), b))) return deny();
    ok('level');
    if (b === 4 && sim.level(g.state, 4) === cfg()['branch.crafts.bindery']) g.flash('star', 'Переплётная', 'Запасники ' + g.fmt.mult(cfg()['storage.bindery']));
  }

  // Залы: capacity, the halls (and the labyrinth's), the Библиотекарь's rule, exhibitions.
  function hallsTab(state) {
    const c = cfg();
    const parts = [];
    const cap = h('div', { class: 'l-small' });
    updaters.push((s) => {
      const det = view.detail;
      if (!det) return;
      let used = 0;
      let all = 0;
      det.alloc.halls.forEach((x) => {
        used += x.used;
        all += x.h.cap;
      });
      cap.textContent = tl(['В залах ' + used + ' из ' + all + ' книг', 'в запасниках ' + det.alloc.stored + ' (' + g.fmt.mult(det.m.storage) + ')',
        s.run.roofUntil > now() && 'крыша течёт ещё ' + dur((s.run.roofUntil - now()) / 1000)]);
    });
    const arrange = sim.council(state, 'catalog') > 0 ? h('div', { class: 'l-small' }, 'Каталогизатор расставляет книги сам') : h('button', {
      class: 'g-btn small', id: 'arrange', onclick: () => {
        g.act((s) => sim.arrange(s, cfg(), now()));
        ok('tap');
        ui.toast('Книги расставлены по лучшим залам');
      }
    }, 'Расставить книги');
    parts.push(h('div', { class: 'l-card' }, h('div', { class: 'l-row' }, ic('kind7', 'paper'), h('div', { class: 'grow' }, h('div', { class: 'l-name' }, 'Вместимость'), cap)), arrange));
    if (sim.librarian(state)) {
      const rules = [['short', 'самая короткая'], ['know', 'самая знающая'], ['branch', 'непрочитанная ветвь']];
      parts.push(h('div', { class: 'l-card' }, head(ic('librarian', 'paper'), 'Библиотекарь'), h('div', { class: 'l-small' }, 'ставит на освободившийся стол книгу по правилу — и офлайн тоже'),
        h('div', { class: 'l-chips' }, rules.map(([id, title]) => h('button', { class: 'chip' + ((state.run.rule || 'short') === id ? ' on' : ''), 'data-rule': id, onclick: () => g.act((s) => { s.run.rule = id; }) }, title)))));
    }
    sim.hallList(state, c).forEach((hd) => parts.push(hallCard(state, hd)));
    if (building(state) >= c['exhibit.building']) parts.push(exhibitCard(state));
    return parts;
  }

  function hallCard(state, hd) {
    const c = cfg();
    if (sim.hallOpen(state, hd.id)) {
      const used = h('span', { class: 'l-small' });
      const bar = h('i', {});
      updaters.push(() => {
        const det = view.detail;
        const x = det ? det.alloc.halls.find((y) => y.h.id === hd.id) : null;
        used.textContent = x ? x.used + ' / ' + x.h.cap : '';
        bar.style.width = (x && x.h.cap ? Math.min(100, x.used / x.h.cap * 100) : 0).toFixed(0) + '%';
      });
      return h('div', { class: 'l-card', 'data-hall': hd.id }, h('div', { class: 'l-row' }, hallPic(hd), h('div', { class: 'grow' }, h('div', { class: 'l-name' }, hd.title), h('div', { class: 'l-small' }, hallEffect(hd))), used),
        h('span', { class: 'l-bar' }, bar));
    }
    const need = sim.hallNeed(state, c, hd.id);
    const sub = h('span', { class: 'g-sub' });
    const btn = need ? null : h('button', { class: 'g-btn small primary', 'data-open-hall': hd.id, onclick: () => openHall(hd.id) }, h('span', {}, 'Открыть', sub));
    if (btn) {
      updaters.push((s) => {
        const p = sim.hallCost(s, c, hd.id);
        sub.textContent = price(p);
        btn.disabled = Big.lt(s.run.coins, p);
      });
    }
    return h('div', { class: 'l-card off', 'data-hall': hd.id }, h('div', { class: 'l-row' }, hallPic(hd, true),
      h('div', { class: 'grow' }, h('div', { class: 'l-name' }, hd.title), h('div', { class: 'l-small' }, hallEffect(hd) + ' · ' + hd.cap + ' мест'),
        need ? h('div', { class: 'l-small' }, 'Условие: ' + need) : null), btn));
  }

  function openHall(id) {
    if (!g.act((s) => {
      const done = sim.openHall(s, cfg(), id);
      if (done) sim.arrange(s, cfg(), now());
      return done;
    })) return deny();
    ok('level');
  }

  function exhibitCard(state) {
    const c = cfg();
    const t = state.run.theme;
    if (!t) {
      takeTheme();
      return h('div', { class: 'l-card' }, head(ic('exhibit', 'b3'), 'Выставка'), note('Тема выставки готовится'));
    }
    const have = h('span', { class: 'l-small' });
    const btn = h('button', {
      class: 'g-btn small primary', id: 'exhibit', onclick: () => {
        if (!g.act((s) => sim.exhibit(s, cfg()))) return deny();
        ok('level');
        ui.toast('Выставка открыта: все монеты +' + g.fmt.pct(c['exhibit.bonus']));
      }
    }, 'Открыть выставку');
    updaters.push((s) => {
      const n = sim.themeBooks(s, c);
      have.textContent = 'подходящих книг ' + Math.min(n, c['exhibit.size']) + ' из ' + c['exhibit.size'];
      btn.disabled = n < c['exhibit.size'];
    });
    return h('div', { class: 'l-card', id: 'exhibition' }, head(ic('exhibit', 'b3'), 'Выставка'),
      h('div', { class: 'l-row' }, spine(t.b, t.k), h('div', { class: 'grow' }, h('div', { class: 'l-name', 'data-raw': '' }, ui.raw(t.title)),
        h('div', { class: 'l-small', 'data-raw': '' }, ui.raw(t.text)),
        h('div', { class: 'l-small' }, sim.BRANCH_NAMES[t.b] + ', ' + sim.KIND_SHORT[t.k].toLowerCase() + ' и старше'), have)),
      h('div', { class: 'l-small' }, 'Книги уходят с полок на витрину, здание получает +' + g.fmt.pct(c['exhibit.bonus']) + ' ко всем монетам. Выставок: ' + (state.run.exhibits || 0)), btn);
  }

  // Хранилище: tomes of this building, the vault, the collection, restoration, the council, the move.
  function vaultTab(state) {
    const c = cfg();
    const parts = [];
    const vault = state.meta.vault || [];
    const slots = sim.vaultSlots(state, c);
    const tomes = state.run.tomes.map((id) => {
      const t = sim.tomeDef(id);
      const inVault = vault.indexOf(id) >= 0;
      return h('div', { class: 'l-row', 'data-tome': id }, tomePic(t),
        h('div', { class: 'grow l-tome-main' }, h('button', { class: 'l-plain', onclick: () => tomeSheet(id) }, h('div', { class: 'l-tome l-name' }, t.title), h('div', { class: 'l-small' }, fxText(state, id))),
        h('button', { class: 'chip' + (inVault ? ' on' : ''), disabled: !inVault && vault.length >= slots, onclick: () => g.act((s) => sim.toggleVault(s, cfg(), id)) }, inVault ? 'в Хранилище' : 'в Хранилище?')));
    });
    parts.push(h('div', { class: 'l-card', id: 'vault' }, head(ic('vault', 'gold'), 'Уникальные тома здания', h('span', { class: 'l-small' }, 'ячеек ' + vault.length + ' из ' + slots)),
      tomes.length ? tomes : note('Пока ни одного. Уникальный том находится при чтении книг вида 4 и старше и в поставках вида 6+.'),
      h('div', { class: 'l-small' }, 'Тома в Хранилище переезжают в новое здание, остальные остаются городу.')));
    const coll = state.meta.collection || [];
    parts.push(h('div', { class: 'l-card', id: 'collection' }, head(ic('unique', 'gold'), 'Коллекция', h('span', { class: 'l-small' }, coll.length + ' из ' + sim.TOMES.length)),
      h('div', { class: 'l-coll' }, sim.TOMES.filter((t) => coll.indexOf(t.id) >= 0).map((t) => h('button', { class: 'l-coll-item', 'data-coll': t.id, onclick: () => tomeSheet(t.id) }, tomePic(t), h('span', { class: 'l-tome' }, t.title)))),
      coll.length < sim.TOMES.length ? h('div', { class: 'l-small' }, ui.t('не найдено: {}', sim.TOMES.length - coll.length)) : null,
      h('div', { class: 'l-chips' }, sim.TOMES.filter((t) => coll.indexOf(t.id) < 0).map(() => ic('unknown', 'grey', { cls: 'tome', off: true })))));
    if (building(state) >= c['restore.building']) parts.push(restoreCard(state));
    parts.push(councilCard(state));
    parts.push(moveCard(state));
    if ((state.meta.catalog || []).length) parts.push(h('button', { class: 'g-btn small', id: 'catalog', onclick: catalogSheet }, 'Каталог прочитанного'));
    return parts;
  }

  function tomeSheet(id) {
    const t = sim.tomeDef(id);
    const own = g.state.meta.tomeText && g.state.meta.tomeText[id];
    const text = own || content.tomes[id] || 'Единственный экземпляр. Подробная аннотация появится, когда будет сеть.';
    const close = g.sheet([h('div', { class: 'l-book-head' }, tomePic(t, { size: 'big' }), h('h3', { class: 'grow' }, t.title)), h('div', { class: 'l-annot', 'data-raw': own ? '' : null }, own ? ui.raw(text) : text),
      h('div', { class: 'g-lines' }, line('Эффект', fxText(g.state, id)), t.key ? line('Ключ', 'открывает зал «' + sim.hallDef(g.state, cfg(), t.key).title + '»') : null),
      h('button', { class: 'g-btn small', onclick: () => close() }, 'Закрыть')]);
  }

  function restoreCard(state) {
    const c = cfg();
    const r = state.run;
    const status = h('div', { class: 'l-small' });
    const btn = h('button', {
      class: 'g-btn small primary', id: 'restore', onclick: () => {
        if (!g.act((s) => sim.startRestore(s, cfg(), now()))) return deny();
        ok();
      }
    }, 'Начать реставрацию — ' + dur(c['restore.minutes'] * 60));
    updaters.push((s) => {
      status.textContent = tl(['повреждённых томов ' + (s.run.damaged || 0), s.run.restoreUntil && 'в работе ещё ' + dur((s.run.restoreUntil - now()) / 1000)]);
      btn.disabled = !(s.run.damaged > 0) || !!s.run.restoreUntil;
    });
    return h('div', { class: 'l-card', id: 'restoration' }, head(ic('restore', 'b4'), 'Реставрация'),
      h('div', { class: 'l-small' }, 'длинные книги иногда приходят повреждёнными; после реставрации том становится уникальным'), status, r ? btn : null);
  }

  function councilCard(state) {
    const c = cfg();
    const have = h('span', { class: 'l-small' });
    updaters.push((s) => { have.textContent = 'Экслибрисов ' + g.fmt(exlibris(s)); });
    const rows = sim.COUNCIL.map((x) => {
      const lv = sim.council(state, x.id);
      const max = sim.councilMax(c, x.id);
      const endless = sim.councilEndless(c, x.id);
      const done = !endless && lv >= max;
      const sub = h('span', { class: 'g-sub' });
      const btn = h('button', { class: 'g-btn small', 'data-council': x.id, onclick: () => buyCouncil(x.id) }, h('span', {}, done ? 'взято' : 'Взять', sub));
      updaters.push((s) => {
        const cost = sim.councilCost(s, c, x.id);
        sub.textContent = done ? '' : ui.t('{} экслибр.', g.fmt(cost));
        btn.disabled = done || Big.lt(exlibris(s), cost);
      });
      const have2 = endless ? (lv ? ui.t('ур. {}', lv) : '') : max > 1 ? ui.t('{} из {}', lv, max) : lv ? ui.t('есть') : '';
      return h('div', { class: 'l-row' + (done ? ' got' : ''), 'data-council-row': x.id }, ic(x.id, lv ? 'gold' : 'grey', lv ? null : { off: true }),
        h('div', { class: 'grow' }, h('div', { class: 'l-name' }, ui.t(x.title) + (have2 ? ' · ' + have2 : '')), h('div', { class: 'l-small' }, councilText(x))), btn);
    });
    return h('div', { class: 'l-card', id: 'council' }, head(ic('exlibris', 'gold'), 'Попечительский совет', have), rows);
  }

  function buyCouncil(id) {
    if (!g.act((s) => sim.buyCouncil(s, cfg(), id), { now: true, reason: 'action' })) return deny();
    ok('level');
  }

  function moveCard(state) {
    const b = building(state);
    const next = sim.BUILDINGS[Math.min(sim.BUILDINGS.length - 1, b)] + (b >= sim.BUILDINGS.length ? ', круг ' + (b - sim.BUILDINGS.length + 2) : '');
    const btn = g.ui.prestigeButton(sim.LAYER, { primary: true });
    btn.id = 'prestige';
    const info = h('div', { class: 'l-small' });
    updaters.push((s) => {
      info.textContent = tl(['Знаний за здание ' + g.fmt(Math.floor(s.run.knEarned)) + ' → Экслибрисов ' + g.fmt(sim.prestigeGain(s, sim.LAYER, cfg())),
        'Репутация ' + (s.meta.reputation || 0) + ' (монеты ' + g.fmt.mult(1 + cfg()['reputation.bonus'] * (s.meta.reputation || 0)) + ')']);
    });
    return h('div', { class: 'l-card', id: 'move' }, head(buildingPic(b), 'Новое здание'),
      h('div', { class: 'l-small' }, 'Фонд передаётся городу, библиотека переезжает: «' + next + '». Экслибрисы — по знаниям этого здания, не по монетам.'), info, btn);
  }

  function catalogSheet() {
    const list = g.state.meta.catalog || [];
    const rows = list.slice(0, 60).map((e) => h('details', {}, h('summary', {}, raw(e.t, 'l-tome'), h('span', { class: 'l-small' }, ' · ' + sim.KIND_SHORT[e.k] + ', ' + sim.BRANCH_NAMES[e.b])),
      raw(e.a, 'l-small'), h('div', { class: 'l-annot', style: 'font-size: 17px', 'data-raw': '' }, ui.raw(e.x))));
    const close = g.sheet([h('h3', {}, 'Каталог прочитанного — ' + list.length), h('div', { class: 'g-lines' }, rows), h('button', { class: 'g-btn small', onclick: () => close() }, 'Закрыть')]);
  }

  // ---- the plan of the library (wide) ----

  function drawPlan(state) {
    if (!view.wide || !view.detail) return;
    const c = cfg();
    const halls = sim.hallList(state, c);
    const det = view.detail;
    const rooms = halls.map((hd) => {
      const open = sim.hallOpen(state, hd.id);
      const a = open ? det.alloc.halls.find((z) => z.h.id === hd.id) : null;
      return { hd: hd, open: open, used: a ? a.used : 0, cap: a ? a.h.cap : hd.cap };
    });
    const onDesks = state.run.desks.map((d) => (d ? d.b + '.' + d.k : '-'));
    const sig = building(state) + '|' + rooms.map((r) => r.hd.id + (r.open ? r.used + '/' + r.cap : 'x')).join(',') + '|' + onDesks.join(',');
    if (sig === sigs.plan) return;
    sigs.plan = sig;
    const n = building(state) - 1;
    view.plan.replaceChildren(
      h('div', { class: 'l-plan-head' }, buildingPic(n, { size: 'big' }), h('h2', { class: 'l-h' }, sim.BUILDINGS[Math.min(sim.BUILDINGS.length - 1, n)])),
      h('div', { class: 'l-plan-grid', role: 'group', 'aria-label': 'План библиотеки' }, rooms.map((r) => h('div', { class: 'l-room' + (r.open ? '' : ' closed'), 'data-room': r.hd.id },
        h('div', { class: 'l-row' }, hallPic(r.hd, !r.open), h('div', { class: 'grow l-room-name' }, r.hd.title)),
        r.open ? h('span', { class: 'l-bar' }, h('i', { style: 'width: ' + (r.cap ? Math.min(100, r.used / r.cap * 100) : 0).toFixed(0) + '%' })) : null,
        h('div', { class: 'l-small' }, r.open ? r.used + ' / ' + r.cap : 'закрыт')))),
      h('div', { class: 'l-plan-desks' }, state.run.desks.map((d) => (d ? spine(d.b, d.k, 'small') : ic('desks', 'grey', { size: 'small', off: true }))),
        h('span', { class: 'l-small' }, ui.t('столы: {} из {}', state.run.desks.filter(Boolean).length, state.run.desks.length))));
  }

  // ---- the stock of model texts ----

  let annotTimer = 0;
  function annotateSoon() {
    clearTimeout(annotTimer);
    annotTimer = setTimeout(fillAnnotations, 300);
  }

  /** Model annotations for the books that have the template one: the pool first, then the stock. */
  async function fillAnnotations() {
    if (busy.annot || g.readonly) return;
    const s = g.state;
    const wait = sim.waiting(s);
    if (!wait.some((n) => n > 0)) return;
    const pool = s.meta.pool || [];
    for (let i = 0; i < pool.length; i++) {
      const b = sim.BRANCH_NAMES.indexOf(pool[i].branch);
      if (b >= 0 && wait[b] > 0) {
        g.act((st) => sim.annotate(st, st.meta.pool.splice(i, 1)[0]));
        sigs.desks = null;
        return;
      }
    }
    if (g.stock.count('annotations') <= 0) return;
    busy.annot = true;
    try {
      const item = await g.stock.take('annotations');
      if (item && !item.procedural) {
        g.act((st) => {
          if (!sim.annotate(st, item)) st.meta.pool = (st.meta.pool || []).concat([item]).slice(-40);
        });
        sigs.desks = null;
      }
    } finally {
      busy.annot = false;
    }
  }

  async function takeTomeText() {
    if (busy.tome || g.readonly || g.stock.count('tomes') <= 0) return;
    const s = g.state;
    const texts = s.meta.tomeText || {};
    if (!(s.meta.collection || []).some((id) => !texts[id])) return;
    busy.tome = true;
    try {
      const item = await g.stock.take('tomes');
      const t = item && !item.procedural ? sim.TOMES.find((x) => x.title === item.title) : null;
      if (t) g.act((st) => { st.meta.tomeText = Object.assign({}, st.meta.tomeText || {}, { [t.id]: String(item.text) }); });
    } finally {
      busy.tome = false;
    }
  }

  async function takeTheme() {
    if (busy.theme || g.readonly) return;
    busy.theme = true;
    try {
      const item = await g.stock.take('themes');
      const b = item ? sim.BRANCH_NAMES.indexOf(item.branch) : -1;
      if (b >= 0) g.act((st) => sim.setTheme(st, { title: item.title, b: b, k: Math.max(0, (Number(item.minKind) || 1) - 1), text: item.text || '' }));
      sigs.tab = null;
    } finally {
      busy.theme = false;
    }
  }

  async function takeEventText(id) {
    if (busy.ev || g.readonly || g.stock.count('events') <= 0) return;
    busy.ev = true;
    try {
      const item = await g.stock.take('events');
      if (item && !item.procedural && item.event && item.text) {
        g.act((st) => { st.meta.evText = Object.assign({}, st.meta.evText || {}, { [item.event]: { title: String(item.title || ''), text: String(item.text) } }); });
        if (item.event === id) sigs.event = null;
      }
    } finally {
      busy.ev = false;
    }
  }

  // ---- what happened while away ----

  function onOffline(report) {
    const p = report.plan;
    const c = cfg();
    // Reading has no cap: the time past the offline cap is read too (coins are not).
    const extra = Math.max(0, (p.away - p.creditedMs) / 1000);
    g.act((st) => {
      if (extra > 1) sim.readStep(st, c, extra, now(), { offline: true, config: c }, sim.speed(st, c, now(), null));
      const a = st.run.away;
      st.run.away = null;
      if (!a) return;
      if (a.books) {
        report.events.push(ui.t('Прочитано книг: {}', a.books) + (a.titles.length ? ' — ' + a.titles.map((t) => '«' + t + '»').join(', ') + (a.books > a.titles.length ? ' ' + ui.t('и другие') : '') : ''));
        const kn = [];
        a.kn.forEach((v, b) => { if (v > 0) kn.push(sim.BRANCH_NAMES[b] + ' +' + g.fmt(v)); });
        if (kn.length) report.events.push(ui.t('Знания: {}', kn.join(', ')));
      }
      a.tomes.forEach((t) => report.events.push(ui.t('Найден уникальный том «{}»', t)));
      if (a.loans) report.events.push(ui.t('Абонемент: книги вернулись {} раз, +{} монет', a.loans, g.fmt(Big.of(a.coins))));
      if (a.restored) report.events.push(ui.t('Реставрация закончена: {}', a.restored));
    });
    const s = g.state;
    if (s.run.desks.some((d) => !d) && hasUnread(s)) report.events.push(ui.t('Столы свободны — поставьте книги'));
    sigs = {};
  }

  function tomeFound(t) {
    if (!t) return;
    g.flash('sparkle', 'Уникальный том', '«' + t.title + '»', 5000);
    g.sfx('chest');
    g.buzz('chest');
    setTimeout(takeTomeText, 0);
  }

  // ---- drawing ----

  function render(state) {
    const c = cfg();
    const t = now();
    if (view.world) {
      const world = LibraryScene.model(state, c, { now: t, halls: sim.HALLS, mode: tab === 'vault' ? 'observatory' : 'house' });
      LibraryScene.changes(view.worldPrevious, world).forEach(kind => view.world.pulse(kind, null, 2.2));
      view.worldPrevious = world;
      view.world.update(world);
      view.worldNote.textContent = world.label;
    }
    placePanel();
    view.detail = sim.incomeNumber(state, c, t, liveCtx(), true);
    const rate = Big.mul(Big.mul(view.detail.total, view.detail.m.scale), g.links.mult());
    view.coins.textContent = g.fmt.live(state.run.coins);
    view.rate.textContent = g.fmt.rate(rate);
    const ex = exlibris(state);
    view.sub.textContent = tl([sim.BUILDINGS[Math.min(sim.BUILDINGS.length - 1, building(state) - 1)],
      building(state) > sim.BUILDINGS.length && 'круг ' + (building(state) - sim.BUILDINGS.length + 1),
      !Big.isZero(ex) && 'Экслибрисов ' + g.fmt(ex), state.meta.reputation && 'Репутация ' + g.fmt.mult(1 + c['reputation.bonus'] * state.meta.reputation),
      'знаний ' + g.fmt(Math.floor(state.run.knEarned))]);
    view.speed.textContent = 'чтение ' + g.fmt.mult(speedNow(state));
    const steps = links().steps;
    view.onGo.hidden = !(steps && steps.on) || !state.run.desks.some(Boolean);
    view.onGo.textContent = '−' + c['onthego.minutes'] + ' мин на ходу';
    drawEvent(state);
    drawOffer(state);
    drawDesks(state);
    drawTabs(state);
    notices(state);
    if (t - slowAt > 1000) {
      slowAt = t;
      drawPlan(state);
      // Changes of the state go after this drawing (g.act draws again).
      setTimeout(() => {
        achievements(g.state);
        fillAnnotations();
        if ((g.state.meta.collection || []).length) takeTomeText();
      }, 0);
    }
  }

  function lastReturned(r) {
    const l = (r.returned || [])[(r.returned || []).length - 1];
    return l ? l.k + ':' + l.n + ':' + l.coins + ':' + l.review : '';
  }

  /** What is already shown: the last book read, the tomes of the building, the last loan back. */
  function remember(state) {
    seen.last = state.run.last ? state.run.last.at : 0;
    seen.tomes = state.run.tomes.length;
    seen.returned = lastReturned(state.run);
  }

  function notices(state) {
    const r = state.run;
    if (r.last && r.last.at !== seen.last) {
      seen.last = r.last.at;
      if (now() - r.last.at < 5000) {
        g.flash('book', 'Дочитана «' + r.last.t + '»', tl(['+' + r.last.kn + ' знаний', sim.BRANCH_NAMES[r.last.b]]), 3000);
        g.sfx('level');
      }
      annotateSoon();
    }
    if (r.tomes.length !== seen.tomes) {
      if (r.tomes.length > seen.tomes) tomeFound(sim.tomeDef(r.tomes[r.tomes.length - 1]));
      seen.tomes = r.tomes.length;
    }
    const back = lastReturned(r);
    if (back !== seen.returned) {
      seen.returned = back;
      const l = r.returned[r.returned.length - 1];
      if (l) g.flash('coin', 'Абонемент: книги вернулись', '+' + g.fmt(Big.of(l.coins)), 4000);
    }
  }

  function achievements(state) {
    const f = state.meta.flags || {};
    const c = cfg();
    const read = Number(state.meta.totalRead) || 0;
    if (f.read) g.achieve('first-read');
    if (read >= c['ach.read100']) g.achieve('read-100');
    if (read >= c['ach.read1000']) g.achieve('read-1000');
    if (f.branches) g.achieve('branches-5');
    if (f.tome) g.achieve('first-tome');
    if ((state.meta.collection || []).length >= c['ach.tomes']) g.achieve('tomes-20');
    if (f.allHalls) g.achieve('all-halls');
    if (f.night) g.achieve('night-reader');
    if (f.building) g.achieve('new-building');
  }

  await Game.start({ sim, render, init: build });
})();
