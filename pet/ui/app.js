// The pet's room: «Сейчас», «Вещи», «Настройки», «Отладка». Everything comes from
// modules/pet/main.js (view) and every change goes back through it. The creature is SVG text the
// engine draws from look.js — the same shapes the widget's picture is drawn from.
const h = ui.h;
const MAIN = 'modules/pet/main.js';
const HEALTH = 'modules/health/main.js';
const call = (fn, ...args) => axiko.call(MAIN, fn, ...args);
const NB = ' ';
const LONG_MS = 520;
const REACTION_TITLES = { water: 'Глоток воды', habit: 'Отметка привычки', med: 'Лекарство', level: 'Новый уровень', achievement: 'Ачивка', welcome: 'Возвращение', tap: 'Касание' };
const STAGES = ['Росток', 'Два листа', 'Четыре листа', 'Бутон', 'Цветок'];

let V = null;
let schema = null;
let played = 0;          // the last reaction (its `at`) that was shown
let reactionTimer = null;
let peekTimer = null;
let seenTimer = null;
let debug = { state: 'calm', reaction: '', room: true };

// Own line icons (the kit has no hat, scarf or leaf): 24×24, currentColor, no fill.
const OWN = {
  leaf: '<path d="M5 19c0-8 5-13 14-14 0 9-5 14-14 14zM5 19l7-7"/>',
  head: '<path d="M4 16h16M7 16c0-4 2-8 5-8s5 4 5 8"/>',
  neck: '<path d="M5 9c4 2 10 2 14 0M7 10l-1 9h4l1-8M13 11l1 8h4l-1-9"/>',
  hand: '<path d="M9 4h6v3H9zM8 7h8l1 10a3 3 0 0 1-3 3h-4a3 3 0 0 1-3-3z"/>',
  shelf: '<path d="M3 15h18M6 15v3M18 15v3M9 15V9h6v6"/>',
  drop: '<path d="M12 3c3.5 4.2 6 7.6 6 10.5a6 6 0 0 1-12 0C6 10.6 8.5 7.2 12 3z"/>',
  badge: '<circle cx="12" cy="9" r="5"/><path d="M9 13.5L7.5 21l4.5-2.5 4.5 2.5-1.5-7.5"/>'
};

function own(name) {
  const holder = document.createElement('span');
  holder.innerHTML = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true">' + (OWN[name] || '') + '</svg>';
  return holder.firstChild;
}

function glyph(name) {
  if (name === 'drop' && ui.iconNames.indexOf('drop') >= 0) return ui.icon('drop');
  return OWN[name] ? own(name) : ui.icon(name);
}

function num(n) {
  return String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, NB);
}

function fail(error) {
  ui.toast(String((error && error.message) || error || 'Не получилось'));
}

function card(icon, title, extra, ...body) {
  return h('section', { class: 'card pc' },
    h('div', { class: 'pc-head' },
      icon && h('span', { class: 'mark' }, glyph(icon)),
      h('h3', {}, title),
      extra || null),
    ...body);
}

function hint(text) {
  return h('p', { class: 'hint' }, text);
}

// ---- the creature ----------------------------------------------------------------------------------

/** Puts SVG text into a holder and gives its blink a new pause each time: 3–7 s. */
function place(holder, svgText) {
  holder.innerHTML = svgText;
  const svg = holder.querySelector('svg');
  if (!svg) return null;
  const lids = svg.querySelectorAll('.pt-blink');
  const again = () => {
    const seconds = (3 + Math.random() * 4).toFixed(1) + 's';
    lids.forEach(lid => { lid.style.animationDuration = seconds; });
  };
  again();
  if (lids[0]) lids[0].addEventListener('animationiteration', again);
  return svg;
}

function roomSvg() {
  return document.querySelector('#room svg');
}

function showPhrase(text) {
  const node = document.getElementById('phrase');
  node.textContent = text || '';
  node.classList.remove('fresh');
  void node.offsetWidth;
  node.classList.add('fresh');
}

function drawCreature() {
  clearTimeout(reactionTimer);
  const holder = document.getElementById('room');
  const r = V.reaction;
  if (r && V.svgReaction && r.at > played && r.until > Date.now()) {
    played = r.at;
    place(holder, V.svgReaction);
    showPhrase(r.phrase || V.phrase);
    reactionTimer = setTimeout(() => {
      place(holder, V.svg);
      showPhrase(V.phrase);
    }, Math.max(1200, r.until - Date.now()));
    return;
  }
  place(holder, V.svg);
  showPhrase(V.phrase);
}

/** A tap: a jump, a wink or a turn; asleep, he opens one eye for a moment. */
function tap() {
  const holder = document.getElementById('room');
  if (V.state === 'asleep' && V.svgPeek) {
    clearTimeout(peekTimer);
    place(holder, V.svgPeek);
    peekTimer = setTimeout(() => place(holder, V.svg), 2600);
    return;
  }
  const svg = roomSvg();
  if (!svg) return;
  const moves = V.state === 'cheerful' ? ['jump', 'jump', 'wink', 'turn'] : ['jump', 'wink', 'turn'];
  const move = moves[Math.floor(Math.random() * moves.length)];
  svg.classList.remove('jump', 'wink', 'turn');
  void svg.getBoundingClientRect();
  svg.classList.add(move);
  setTimeout(() => svg.classList.remove(move), 800);
}

/** A long press: his next phrase about how he feels (aloud, when the voice is on). */
async function talk() {
  try {
    const out = await call('talk');
    V.phrase = out.phrase;
    showPhrase(out.phrase);
  } catch (error) {
    fail(error);
  }
}

function bindRoom() {
  const room = document.getElementById('room');
  let timer = null;
  let long = false;
  room.addEventListener('pointerdown', () => {
    long = false;
    clearTimeout(timer);
    timer = setTimeout(() => { long = true; talk(); }, LONG_MS);
  });
  const cancel = () => clearTimeout(timer);
  room.addEventListener('pointerleave', cancel);
  room.addEventListener('pointercancel', cancel);
  room.addEventListener('pointerup', () => {
    clearTimeout(timer);
    if (!long) tap();
  });
  room.addEventListener('contextmenu', event => event.preventDefault());
  room.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      tap();
    }
  });
  document.getElementById('talk').onclick = talk;
}

// ---- «Сейчас» ----------------------------------------------------------------------------------------

function drawState() {
  document.getElementById('name').textContent = V.name;
  document.title = V.name;
  document.getElementById('state').textContent = V.title;
  const energy = document.getElementById('energy');
  energy.textContent = typeof V.energy === 'number' ? 'энергия ' + V.energy : '';
  energy.hidden = typeof V.energy !== 'number';
  drawCreature();
  drawHolding();
  drawQuick();
}

function drawHolding() {
  const box = document.getElementById('holding');
  clearTimeout(seenTimer);
  if (!V.holding) {
    box.replaceChildren();
    return;
  }
  box.replaceChildren(h('div', { class: 'holding' },
    h('span', { class: 'mark' }, glyph('badge')),
    h('div', { class: 'grow' }, h('div', {}, 'Держит значок'), h('div', { class: 'small', 'data-raw': '' }, '«' + V.holding.title + '»')),
    h('button', { class: 'btn small soft', onclick: seen }, 'Видел')));
  // The owner has looked at it: after a while he puts it down by himself.
  seenTimer = setTimeout(() => call('seen').catch(() => {}), Math.max(4, V.settings.reactSeconds * 2) * 1000);
}

async function seen() {
  clearTimeout(seenTimer);
  try {
    await call('seen');
    await load(true);
  } catch (error) {
    fail(error);
  }
}

async function mark(kind, fn) {
  try {
    await fn();
    V = await call('react', kind);
    drawState();
  } catch (error) {
    fail(error);
  }
}

function drawQuick() {
  const box = document.getElementById('quick');
  const q = V.quick;
  if (!q) {
    box.replaceChildren(hint('Отметки воды и привычек появятся здесь с модулем «Здоровье».'));
    return;
  }
  const buttons = [];
  if (q.water) {
    buttons.push(h('button', { class: 'btn soft quick-btn', onclick: () => mark('water', () => axiko.call(HEALTH, 'addWater')) },
      glyph('drop'), 'Стакан воды'));
  }
  q.habits.forEach(habit => {
    buttons.push(h('button', { class: 'btn soft quick-btn', onclick: () => mark('habit', () => axiko.call(HEALTH, 'markHabit', habit.id)) },
      ui.icon('check'), h('span', { 'data-raw': '' }, habit.title)));
  });
  box.replaceChildren(...buttons);
}

function scoreBar(score) {
  if (score === null || score === undefined) return h('div', { class: 'score none', role: 'img', 'aria-label': 'нет данных' });
  const share = Math.max(0, Math.min(1, score));
  return h('div', { class: 'score', role: 'img', 'aria-label': Math.round(share * 100) + '%' }, h('i', { style: 'width: ' + Math.round(share * 100) + '%' }));
}

function drawWhy() {
  const head = h('p', { class: 'why-head' }, 'Сейчас «' + V.title + '»' + (V.reason ? ': ' + V.reason : '') + '.');
  const lines = V.why.map(line => h('div', { class: 'why-line' },
    h('div', { class: 'grow' }, line.text),
    scoreBar(line.score)));
  const foot = [];
  if (!V.health) foot.push(hint('Без модуля «Здоровье» данных о дне нет, и он просто спокоен. Неизвестное не считается плохим.'));
  else if (typeof V.known === 'number' && V.known < 1) foot.push(hint('Чего не знает, то не в минус: его вес делится между остальными.'));
  document.getElementById('why').replaceChildren(card('info', 'Почему так', null, head, ...lines, ...foot));
}

function drawStrip() {
  const cells = V.strip.map(day => {
    const d = new Date(day.date + 'T12:00:00');
    return h('div', { class: 'day', title: day.date + ': ' + day.title },
      h('i', { class: 'cell st-' + (day.state || 'none') }),
      h('span', { class: 'dnum' }, String(d.getDate())));
  });
  const seen = [];
  V.strip.forEach(day => { if (day.state && seen.indexOf(day.state) < 0) seen.push(day.state); });
  const legend = seen.map(id => h('span', { class: 'legend-item' }, h('i', { class: 'cell st-' + id }),
    (V.states.filter(s => s.id === id)[0] || { title: id }).title));
  document.getElementById('strip').replaceChildren(card('calendar', 'Настроение за ' + V.strip.length + ' дн.', null,
    h('div', { class: 'strip' }, ...cells),
    legend.length ? h('div', { class: 'legend' }, ...legend) : hint('Полоса заполнится, когда он проживёт с вами несколько дней.')));
}

// A small picture of each growth stage: the creature's round body with the stem it has grown.
const STAGE_SVG = [
  '<path d="M24 34 C24 28 24 24 24 20" stroke="#4F8049" stroke-width="2.4" fill="none" stroke-linecap="round"/><path d="M24 22 C30 16 36 18 36 18 C34 24 28 25 24 22Z" fill="#79B072"/>',
  '<path d="M24 34 C24 28 24 22 24 18" stroke="#4F8049" stroke-width="2.4" fill="none" stroke-linecap="round"/><path d="M24 22 C17 17 11 19 11 19 C13 26 20 26 24 22Z" fill="#79B072"/><path d="M24 20 C31 14 37 16 37 16 C35 23 28 24 24 20Z" fill="#79B072"/>',
  '<path d="M24 34 C24 26 24 18 24 12" stroke="#4F8049" stroke-width="2.4" fill="none" stroke-linecap="round"/><path d="M24 26 C17 22 10 24 10 24 C12 31 20 31 24 26Z" fill="#79B072"/><path d="M24 26 C31 22 38 24 38 24 C36 31 28 31 24 26Z" fill="#79B072"/><path d="M24 17 C18 12 13 13 13 13 C15 19 21 20 24 17Z" fill="#4F8049"/><path d="M24 17 C30 12 35 13 35 13 C33 19 27 20 24 17Z" fill="#4F8049"/>',
  '<path d="M24 36 C24 28 24 22 24 17" stroke="#4F8049" stroke-width="2.4" fill="none" stroke-linecap="round"/><path d="M24 30 C18 27 12 29 12 29 C14 35 21 35 24 30Z" fill="#79B072"/><path d="M24 30 C30 27 36 29 36 29 C34 35 27 35 24 30Z" fill="#79B072"/><path d="M24 6 C30 10 31 16 24 20 C17 16 18 10 24 6Z" fill="#C98FB5"/>',
  '<path d="M24 38 C24 32 24 28 24 24" stroke="#4F8049" stroke-width="2.4" fill="none" stroke-linecap="round"/><path d="M24 33 C19 31 14 33 14 33 C16 38 22 38 24 33Z" fill="#79B072"/><path d="M24 33 C29 31 34 33 34 33 C32 38 26 38 24 33Z" fill="#79B072"/><g fill="#E7A8CB"><ellipse cx="24" cy="12" rx="4.5" ry="6.5"/><ellipse cx="24" cy="12" rx="4.5" ry="6.5" transform="rotate(72 24 18)"/><ellipse cx="24" cy="12" rx="4.5" ry="6.5" transform="rotate(144 24 18)"/><ellipse cx="24" cy="12" rx="4.5" ry="6.5" transform="rotate(216 24 18)"/><ellipse cx="24" cy="12" rx="4.5" ry="6.5" transform="rotate(288 24 18)"/></g><circle cx="24" cy="18" r="3.6" fill="#E6C46C"/>'
];

function stagePic(i) {
  const box = document.createElement('div');
  box.className = 'stage-pic';
  box.innerHTML = '<svg viewBox="0 0 48 44" aria-hidden="true"><ellipse cx="24" cy="39" rx="13" ry="3.4" fill="var(--accent-soft)"/>' + STAGE_SVG[i] + '</svg>';
  return box;
}

function drawGrowth() {
  const g = V.growth;
  const steps = STAGES.map((title, i) => h('div', { class: 'stage-step' + (i === g.stage ? ' on' : '') + (i < g.stage ? ' past' : '') },
    stagePic(i), h('i', {}), h('span', {}, title)));
  const facts = [];
  facts.push(h('div', { class: 'fact' }, h('div', { class: 'small' }, 'Стадия'), h('div', { class: 'fact-v' }, g.stageTitle)));
  facts.push(h('div', { class: 'fact' }, h('div', { class: 'small' }, 'Уровень'), h('div', { class: 'fact-v' }, g.level ? String(g.level) : '—')));
  const chips = [];
  g.traits.forEach(t => chips.push(h('span', { class: 'chip' }, t.title)));
  g.worn.forEach(w => chips.push(h('span', { class: 'chip on' }, glyph(w.slot), w.title)));
  const body = [h('div', { class: 'stages' }, ...steps), h('div', { class: 'facts' }, ...facts)];
  if (chips.length) body.push(h('div', { class: 'chips' }, ...chips));
  if (!g.rpg) body.push(hint('Рост идёт от уровня в Жизни-RPG. Пока её нет, он росток — и это нормально.'));
  document.getElementById('growth').replaceChildren(card('leaf', 'Рост', null, ...body));
}

// ---- «Вещи» ------------------------------------------------------------------------------------------

async function wear(id, on) {
  try {
    await call('wear', id, on);
    await load(true);
  } catch (error) {
    fail(error);
  }
}

function drawItems() {
  const rows = V.items.map(item => {
    const right = item.slot === 'shelf' ? h('span', { class: 'small' }, 'Стоит на полке') : (() => {
      const input = h('input', { type: 'checkbox', class: 'switch', checked: Boolean(item.worn), 'aria-label': 'Надеть: ' + item.title });
      input.onchange = () => wear(item.id, input.checked);
      return input;
    })();
    return h('label', { class: 'item-row' },
      h('span', { class: 'mark' }, glyph(item.slot)),
      h('div', { class: 'grow' }, h('div', { 'data-raw': '' }, item.title), h('div', { class: 'small' }, item.slotTitle + (item.from ? ' · за ачивку' : '') + (item.rarityTitle ? ' · ' + item.rarityTitle : ''))),
      right);
  });
  const body = rows.length ? rows : [hint(V.achievements ?
    'Вещей пока нет. Их дают Ачивки: шарф, фонарик, походную шляпу, кубок на полку.' :
    'Вещи дают Ачивки за жизнь. Поставьте этот модуль — и у него появятся шарф, фонарик, шляпа и полка с кубками.')];
  document.getElementById('items').replaceChildren(card('box', 'Вещи', null, h('div', {}, ...body)));
  const side = [];
  if (V.growth.season.length) {
    side.push(card('calendar', 'По сезону', null,
      h('div', { class: 'chips' }, ...V.growth.season.map(x => h('span', { class: 'chip' }, x.title))),
      hint('Сезонные вещи он надевает сам, если на этом месте нет вашей.')));
  }
  side.push(card('info', 'Как это устроено', null,
    hint('Одна вещь на голову, одна на шею и одна в руку. В отпуске он носит панаму, во сне — ночной колпак, под пледом — только шапку. Вещи не теряются никогда.')));
  document.getElementById('items-side').replaceChildren(...side);
}

// ---- «Настройки» -------------------------------------------------------------------------------------

function accessRow(title, ok, text, button) {
  return h('div', { class: 'setting' },
    h('span', { class: 'dot' + (ok ? ' ok' : '') }),
    h('div', { class: 'grow' }, h('div', {}, title), h('div', { class: 'small' }, text)),
    button || null);
}

async function pin() {
  try {
    await call('pin');
    ui.toast('Ярлык отправлен на рабочий стол');
  } catch (error) {
    fail(error);
  }
}

async function redraw() {
  try {
    await call('drawWidget');
    ui.toast('Картинка виджета перерисована');
  } catch (error) {
    fail(error);
  }
}

function drawAccess() {
  const f = V.features || [];
  const rows = [
    accessRow('Здоровье и привычки', V.health, V.health ? 'Настроение считается из сна, шагов, экрана ночью и отметок.' : 'Не установлено: он всегда спокоен.'),
    accessRow('Реакции на отметки', V.hooked, V.hooked ? 'Крючок life.mark подключён.' : 'Крючок не подключён — подключится при следующем запуске модуля.'),
    accessRow('Жизнь-RPG', V.growth.rpg, V.growth.rpg ? 'Стадия роста и черты — от уровня.' : 'Не установлена: стадия «росток».'),
    accessRow('Ачивки за жизнь', V.achievements, V.achievements ? 'Вещи и значки.' : 'Не установлены: вещей нет.'),
    accessRow('Праздничные пасхалки', V.holidays, V.holidays ? 'Колпак в день рождения, тыква в Хэллоуин.' : 'Не установлены: остаётся только зимний шарф.'),
    accessRow('Картинка в виджете', f.indexOf('widget.image') >= 0, f.indexOf('widget.image') >= 0 ? 'Виджет показывает его самого.' : 'Оболочка пока умеет только текстовый виджет.',
      f.indexOf('widget.image') >= 0 ? h('button', { class: 'btn small soft', onclick: redraw }, 'Перерисовать') : null),
    accessRow('Карточка на главном', f.indexOf('home.cards') >= 0, f.indexOf('home.cards') >= 0 ? 'Над плитками модулей.' : 'Нужна новая сборка Axiko.'),
    accessRow('Ярлык комнаты', true, 'Значок на рабочем столе телефона.', h('button', { class: 'btn small soft', onclick: pin }, 'Добавить'))
  ];
  document.getElementById('access').replaceChildren(card('settings', 'Что подключено', null, h('div', {}, ...rows)));
}

function settingField(item, value) {
  const save = async next => {
    try {
      const patch = {};
      patch[item.key] = next;
      V.settings = await call('setSettings', patch);
      ui.toast('Сохранено');
      await load(true);
    } catch (error) {
      fail(error);
    }
  };
  if (item.type === 'bool') {
    const input = h('input', { type: 'checkbox', class: 'switch', checked: Boolean(value), 'aria-label': item.label });
    input.onchange = () => save(input.checked);
    return h('label', { class: 'setting' }, h('div', { class: 'grow' }, h('div', {}, item.label), item.hint ? h('div', { class: 'small' }, item.hint) : null), input);
  }
  let input;
  if (item.type === 'select') {
    input = h('select', { class: 'input', 'aria-label': item.label }, item.options.map(o => h('option', { value: o[0], selected: String(value) === o[0] }, o[1])));
  } else if (item.type === 'time') {
    input = h('input', { class: 'input', type: 'time', value, 'aria-label': item.label });
  } else if (item.type === 'int' || item.type === 'num') {
    input = h('input', { class: 'input', type: 'number', inputMode: item.type === 'int' ? 'numeric' : 'decimal', min: item.min, max: item.max, step: item.step, value, 'aria-label': item.label });
  } else {
    input = h('input', { class: 'input long', value: Array.isArray(value) ? value.join(', ') : value || '', 'aria-label': item.label });
    if (item.key === 'name') input.setAttribute('data-raw', '');
  }
  input.onchange = () => save(input.value);
  const long = item.type === 'list' || item.type === 'text' || item.type === 'ints';
  return h('div', { class: 'setting' + (long ? ' column' : '') },
    h('div', { class: 'grow' }, h('div', {}, item.label), item.hint ? h('div', { class: 'small' }, item.hint) : null),
    long ? input : h('div', { class: 'row' }, input, item.unit ? h('span', { class: 'unit' }, item.unit) : null));
}

function drawPrefs() {
  if (!schema) return;
  const sections = [];
  schema.forEach(item => {
    let section = sections.filter(s => s.title === item.section)[0];
    if (!section) sections.push(section = { title: item.section, items: [] });
    section.items.push(item);
  });
  document.getElementById('prefs').replaceChildren(...sections.map(s =>
    card(null, s.title, null, h('div', {}, s.items.map(item => settingField(item, V.settings[item.key]))))));
}

// ---- «Отладка»: every state by hand, the screen's SVG next to the widget's Canvas ----------------------

async function drawPreview() {
  const box = document.getElementById('debug-preview');
  try {
    const [svgText, png] = await Promise.all([
      call('svg', { state: debug.state, reaction: debug.reaction || null, room: debug.room }),
      call('png', { state: debug.state, reaction: debug.reaction || null })
    ]);
    const svgBox = h('div', { class: 'preview' });
    place(svgBox, svgText);
    box.replaceChildren(card('eye', 'Как выглядит', null,
      h('div', { class: 'compare' },
        h('figure', {}, svgBox, h('figcaption', {}, 'SVG — экран')),
        h('figure', {}, h('div', { class: 'preview png' }, h('img', { src: png, alt: 'Картинка виджета' })), h('figcaption', {}, 'Canvas — виджет')))));
  } catch (error) {
    box.replaceChildren(card('eye', 'Как выглядит', null, hint(String(error && error.message || error))));
  }
}

function drawDebug() {
  const states = V.states.map(s => h('button', { class: 'chip' + (debug.state === s.id ? ' on' : ''), 'data-state': s.id, onclick: () => { debug.state = s.id; drawDebug(); } }, s.title));
  const reactions = [['', 'Без реакции']].concat(V.reactions.map(k => [k, REACTION_TITLES[k] || k]))
    .map(r => h('button', { class: 'chip' + (debug.reaction === r[0] ? ' on' : ''), onclick: () => { debug.reaction = r[0]; drawDebug(); } }, r[1]));
  const room = h('input', { type: 'checkbox', class: 'switch', checked: debug.room, 'aria-label': 'Комната' });
  room.onchange = () => { debug.room = room.checked; drawPreview(); };
  document.getElementById('debug').replaceChildren(
    card('grid', 'Состояние вручную', null, h('div', { class: 'chips' }, ...states),
      hint('Только для просмотра: настоящее состояние и данные не меняются.')),
    card('bolt', 'Реакция', null, h('div', { class: 'chips' }, ...reactions),
      h('label', { class: 'setting' }, h('div', { class: 'grow' }, 'Комната вокруг'), room),
      h('div', { class: 'row' }, h('button', { class: 'btn soft', onclick: drawAll }, 'Все состояния сеткой'))));
  drawPreview();
}

async function drawAll() {
  const box = document.getElementById('debug-all');
  try {
    const list = await Promise.all(V.states.map(s => call('svg', { state: s.id, room: false })));
    box.replaceChildren(card('grid', 'Все двенадцать', null, h('div', { class: 'all' }, ...V.states.map((s, i) => {
      const holder = h('div', { class: 'preview small' });
      place(holder, list[i]);
      return h('figure', {}, holder, h('figcaption', {}, s.title));
    }))));
  } catch (error) {
    fail(error);
  }
}

// ---- loading -----------------------------------------------------------------------------------------

async function load(quiet) {
  V = await call('view', { quiet: Boolean(quiet) });
  drawState();
  drawWhy();
  drawStrip();
  drawGrowth();
  drawItems();
  drawAccess();
  drawPrefs();
  if (!document.querySelector('[data-tab="debug"]').hidden) drawDebug();
}

let pending = null;
function later() {
  clearTimeout(pending);
  pending = setTimeout(() => load(true).catch(fail), 300);
}

async function onMark(payload) {
  // With the hook the engine reacts by itself (pet.changed follows); without it the screen asks.
  if (!V || V.hooked) return;
  const kind = payload && payload.type === 'water' ? 'water' : payload && (payload.type === 'habit' || payload.type === 'workout') ? 'habit' :
    payload && payload.type === 'med' && payload.status !== 'skipped' ? 'med' : null;
  if (!kind) return later();
  try {
    V = await call('react', kind);
    drawState();
  } catch (error) {
    fail(error);
  }
}

async function main() {
  ui.tabs(document.getElementById('tabs'), [['now', 'Сейчас'], ['items', 'Вещи'], ['settings', 'Настройки'], ['debug', 'Отладка']], id => {
    if (id === 'debug' && V) drawDebug();
  });
  bindRoom();
  try {
    schema = await call('settingsSchema');
    await load(false);
  } catch (error) {
    fail(error);
  }
  axiko.on('pet.changed', later);
  axiko.on('pet.react', later);
  axiko.on('life.mark', onMark);
  axiko.on('app.visible', state => { if (state && state.on) later(); });
}

main().catch(fail);
