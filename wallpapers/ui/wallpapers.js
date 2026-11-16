// The «Обои дня» screen. Everything it shows comes from modules/wallpapers/main.js.
const MAIN = 'modules/wallpapers/main.js';
const h = ui.h;
const call = (fn, ...args) => assi.call(MAIN, fn, ...args);
const DAYS = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
const PAGE = 60;
const MINUS = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/></svg>';

let busy = false;
let today = null;
let historyOffset = 0;
let shown = 'today';

function icon(name) {
  if (name === 'minus') return h('span', { html: MINUS }).firstChild;
  return ui.icon(name);
}

function said(value) {
  return h('span', { 'data-raw': '' }, value === null || value === undefined ? '' : String(value));
}

function link(label, url) {
  if (!url) return said(label);
  return h('a', { href: url, 'data-raw': '' }, label);
}

function dayText(day) {
  const date = new Date(day + 'T12:00:00');
  return isNaN(date) ? day : date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
}

function modeText(row) {
  const names = { single: 'один кадр на оба экрана', crops: 'кадрирования под каждый экран', flag: 'внешний экран отдельно', 'вручную': 'не поставлено, только подобрано', 'внешний': 'внешний экран', 'проба': 'проба' };
  return names[row.mode] || row.mode || '';
}

function setBusy(on) {
  busy = on;
  document.querySelectorAll('[data-busy]').forEach(button => { button.disabled = on || button.dataset.off === '1'; });
  document.getElementById('now').disabled = on;
}

/** Runs a function of main.js; a long one shows its steps in the progress line. */
async function act(fn, args, done) {
  if (busy) return null;
  setBusy(true);
  try {
    const result = await call(fn, ...(args || []));
    if (result && result.ok === false && result.error) ui.toast(result.error);
    else if (done) ui.toast(done);
    return result;
  } catch (error) {
    ui.toast(error.message || String(error));
    return null;
  } finally {
    setBusy(false);
    progress(null);
    await refresh();
  }
}

function progress(data) {
  const line = document.getElementById('progress');
  if (!data || data.step === 'done' || !data.text) {
    line.hidden = true;
    line.replaceChildren();
    return;
  }
  line.hidden = false;
  line.replaceChildren(h('span', { class: 'spinner' }), said(data.text));
}

// ---- Сегодня ------------------------------------------------------------------------------------

function credit(row) {
  return h('div', { class: 'credit small' }, 'Фото: ', link(row.author || 'автор не указан', row.author_url), ', ', link(row.sourceName, row.page_url));
}

function license(row) {
  return h('div', { class: 'license small muted' }, 'Лицензия: ', link(row.license || 'не указана', row.license_url));
}

function reason(row) {
  if (!row.reason) return null;
  const parts = row.reason.split(' · ');
  return h('div', { class: 'section' },
    h('div', { class: 'reason' }, parts[0].split(', ').filter(Boolean).map(word => h('span', { class: 'chip', 'data-raw': '' }, word))),
    parts.length > 1 && h('div', { class: 'small muted', 'data-raw': '' }, parts.slice(1).join(' · ')));
}

function shots(row, sizes) {
  const cover = row.coverUrl || row.thumbUrl;
  const inner = row.innerUrl || row.thumbUrl;
  return h('div', { class: 'shots' },
    h('div', { class: 'shot cover' },
      h('img', { src: cover, alt: 'Внешний экран', style: 'aspect-ratio: ' + sizes.coverWidth + ' / ' + sizes.coverHeight }),
      h('span', {}, 'внешний')),
    h('div', { class: 'shot inner' },
      h('img', { src: inner, alt: 'Внутренний экран', style: 'aspect-ratio: ' + sizes.innerWidth + ' / ' + sizes.innerHeight }),
      h('span', {}, 'внутренний')));
}

function action(name, title, about, onclick, options) {
  options = options || {};
  return h('button', { onclick, 'data-busy': '', 'data-off': options.off ? '1' : '0', disabled: busy || options.off, class: options.on ? 'on' : null },
    icon(name),
    h('div', { class: 'grow' }, h('div', {}, title), about && h('div', { class: 'about' }, about)));
}

function permissionCard(data) {
  const can = data.canSet;
  const why = !can.declared ? 'В этой сборке Assi нет разрешения SET_WALLPAPER.' : !can.allowed ? 'Установка обоев на этом телефоне запрещена.' : 'Система не даёт ставить обои.';
  return h('section', { class: 'card today' },
    h('p', {}, why, ' ', 'Картинки подбираются и кадрируются, а поставить их можно вручную: откроется системный экран «Установить как обои».'),
    data.current && h('div', { class: 'actions' },
      h('button', { class: 'btn primary', 'data-busy': '', onclick: () => act('applyManually', [data.current.id]) }, icon('image'), 'Поставить вручную')));
}

function emptyCard() {
  return h('section', { class: 'card today' },
    h('div', { class: 'empty' }, 'Обои ещё не выбирались. Нажмите «Подобрать сейчас» — займёт около минуты.'),
    h('div', { class: 'actions' },
      h('button', { class: 'btn primary', 'data-busy': '', onclick: () => act('run', [{ manual: true }]) }, icon('refresh'), 'Подобрать сейчас'),
      h('button', { class: 'btn', 'data-busy': '', onclick: tryOnly }, 'Проба без установки')));
}

function currentCard(data) {
  const row = data.current;
  return h('section', { class: 'card today' },
    shots(row, data.settings),
    h('div', { class: 'title', 'data-raw': '' }, row.title),
    credit(row),
    license(row),
    reason(row),
    h('p', { class: 'small muted' }, ui.raw(ui.ago(row.set_at) + (row.mode ? ' · ' + modeText(row) : ''))));
}

function sideColumn(data) {
  const row = data.current;
  const left = data.otherLeft;
  return h('div', { class: 'side' },
    h('div', { class: 'list' },
      action('undo', 'Вернуть вчерашние', null, () => act('revert', [], 'Вернула прошлые обои'), { off: !data.canRevert }),
      action('refresh', 'Другие сейчас', ui.t('Осталось {} в этот час', left), () => act('other'), { off: left <= 0 }),
      action('star', row.favorite ? 'В избранном' : 'В избранное', null, () => act('favorite', [row.id, !row.favorite]), { on: row.favorite }),
      action('plus', 'Больше такого', 'Тема, автор, источник и слова запроса — чаще', () => act('vote', [row.id, row.vote > 0 ? 0 : 1]), { on: row.vote > 0 }),
      action('minus', 'Меньше такого', null, () => act('vote', [row.id, row.vote < 0 ? 0 : -1]), { on: row.vote < 0 }),
      action('link', 'Открыть оригинал', said(row.sourceName), () => call('openOriginal', row.id))),
    h('div', { class: 'list' },
      action('grid', 'Тема на сейчас', 'Подобрать по одной из тем или своими словами', topicSheet),
      action('image', 'Поставить по ссылке', 'Любая картинка из сети, по середине', urlSheet),
      action('search', 'Проба без установки', 'Подобрать и показать, не меняя обоев', tryOnly),
      (data.manualNeeded || !data.canSet.ok) && action('download', 'Поставить вручную', 'Системный экран «Установить как обои»', () => act('applyManually', [row.id]))));
}

function lastRun(run) {
  if (!run) return null;
  const lines = (run.status || []).map(line => h('div', { class: line.ok ? '' : 'bad', 'data-raw': '' },
    line.name + ' — «' + line.query + '»: ' + (line.ok ? 'найдено ' + line.found + ', годных ' + line.kept : 'не ответил') + (line.note ? ' (' + line.note + ')' : '')));
  const dropped = Object.keys(run.dropped || {}).map(key => key + ' — ' + run.dropped[key]).join(', ');
  const head = ui.t('Последний подбор') + ': ' + ui.ago(run.at) + (run.dry ? ' · ' + ui.t('проба') : '') + (run.ok ? '' : ' — ' + (run.error || ui.t('не вышло')));
  return h('details', { class: 'card run' },
    h('summary', {}, ui.raw(head)),
    h('div', { class: 'status' },
      lines,
      dropped && h('div', { class: 'muted', 'data-raw': '' }, 'Отсеяно: ' + dropped),
      (run.notes || []).map(note => h('div', { class: 'muted', 'data-raw': '' }, note))));
}

async function renderToday() {
  today = await call('today');
  const parts = [];
  if (!today.canSet.ok) parts.push(permissionCard(today));
  if (today.pending) parts.push(h('section', { class: 'card today' }, 'Нет Wi-Fi: подбор ждёт сети и повторяет попытки до срока из настроек, потом ставит картинку из избранного.'));
  if (!today.settings.enabled) parts.push(h('p', { class: 'small muted' }, 'Ежедневная смена выключена в настройках.'));
  if (!today.current) parts.push(emptyCard());
  else parts.push(h('div', { class: 'split' }, currentCard(today), sideColumn(today)));
  parts.push(lastRun(today.lastRun));
  parts.push(h('p', { class: 'small muted', 'data-raw': '' }, today.foldLine));
  document.getElementById('today').replaceChildren(...parts.filter(Boolean));
  setBusy(busy || today.running);
}

async function tryOnly() {
  const result = await act('run', [{ dryRun: true }]);
  if (!result || !result.ok) return;
  const row = await call('get', result.id);
  let close = null;
  close = ui.sheet([
    h('h3', {}, 'Проба: вот что было бы сегодня'),
    h('img', { class: 'preview', src: row.innerUrl || row.thumbUrl, alt: '' }),
    h('div', { class: 'meta' }, h('div', { 'data-raw': '' }, row.title), credit(row), license(row), reason(row),
      (result.notes || []).map(note => h('div', { class: 'small muted', 'data-raw': '' }, note))),
    h('div', { class: 'actions' },
      h('button', { class: 'btn', onclick: async () => { await call('clearDry'); close(); refresh(); } }, 'Убрать пробу'),
      h('button', { class: 'btn primary', onclick: async () => { close(); await act('setAgain', [row.id, 'проба понравилась'], 'Поставлено'); } }, 'Поставить эту'))
  ]);
}

function topicSheet() {
  const values = settingsCache ? settingsCache.values : null;
  const words = h('input', { class: 'input', placeholder: 'misty lake dawn', autocapitalize: 'off' });
  let close = null;
  const pick = async value => {
    close();
    await act('pickTopic', [value]);
  };
  close = ui.sheet([
    h('h3', {}, 'Тема на сейчас'),
    h('div', { class: 'chips' }, (values ? values.topics : []).map(topic => h('button', { class: 'chip', 'data-raw': '', onclick: () => pick(topic.name) }, topic.name))),
    h('label', { class: 'field' }, h('span', {}, 'Или своими словами по-английски'), words),
    h('div', { class: 'actions' },
      h('button', { class: 'btn', onclick: () => close() }, 'Отмена'),
      h('button', { class: 'btn primary', onclick: () => { if (words.value.trim()) pick(words.value.trim()); else words.focus(); } }, 'Подобрать'))
  ]);
}

function urlSheet() {
  const url = h('input', { class: 'input', type: 'url', placeholder: 'https://…', autocapitalize: 'off' });
  let close = null;
  close = ui.sheet([
    h('h3', {}, 'Поставить по ссылке'),
    h('p', { class: 'small muted' }, 'Картинка кадрируется по середине. Права на неё — на вашей совести: лицензию источника модуль не знает.'),
    h('label', { class: 'field' }, h('span', {}, 'Ссылка на картинку'), url),
    h('div', { class: 'actions' },
      h('button', { class: 'btn', onclick: () => close() }, 'Отмена'),
      h('button', { class: 'btn primary', onclick: async () => {
        if (!/^https?:\/\//.test(url.value.trim())) { url.focus(); return; }
        close();
        await act('setFromUrl', [url.value.trim()], 'Поставлено');
      } }, 'Поставить'))
  ]);
}

// ---- История и избранное -------------------------------------------------------------------------

function picture(row) {
  return h('button', { class: 'pic', onclick: () => details(row) },
    h('img', { src: row.thumbUrl, alt: '', loading: 'lazy' }),
    h('div', { class: 'day' }, ui.raw(dayText(row.day) + (row.screens === 'cover' ? ' · ' + ui.t('внешний') : ''))),
    h('div', { class: 'name', 'data-raw': '' }, row.title),
    (row.favorite || row.vote) ? h('div', { class: 'marks' }, row.favorite ? icon('star') : null, row.vote > 0 ? icon('plus') : null, row.vote < 0 ? icon('minus') : null) : null);
}

function details(row) {
  let close = null;
  const done = () => { close(); refresh(); };
  close = ui.sheet([
    h('img', { class: 'preview', src: row.innerUrl || row.thumbUrl, alt: '' }),
    h('h3', { 'data-raw': '' }, row.title),
    h('div', { class: 'meta' }, credit(row), license(row), reason(row),
      h('div', { class: 'small muted' }, ui.raw(dayText(row.day) + (row.mode ? ' · ' + modeText(row) : '') + (row.width ? ' · ' + row.width + '×' + row.height : '')))),
    h('div', { class: 'actions' },
      h('button', { class: 'btn', onclick: async () => { await call('favorite', row.id, !row.favorite); done(); } }, icon('star'), row.favorite ? 'Убрать из избранного' : 'В избранное'),
      h('button', { class: 'btn', onclick: () => call('openOriginal', row.id) }, icon('link'), 'Оригинал'),
      h('button', { class: 'btn primary', onclick: async () => { close(); await act('setAgain', [row.id], 'Поставлено снова'); } }, 'Поставить снова'))
  ]);
}

async function renderHistory(reset) {
  const grid = document.getElementById('historyGrid');
  const more = document.getElementById('historyMore');
  if (reset) historyOffset = 0;
  const list = await call('history', { limit: PAGE, offset: historyOffset });
  if (reset) grid.replaceChildren();
  historyOffset += list.length;
  if (!historyOffset) grid.replaceChildren(h('div', { class: 'empty' }, 'История пуста: здесь будут все обои, что стояли, с авторами и лицензиями.'));
  else grid.append(...list.map(picture));
  more.replaceChildren(list.length === PAGE ? h('button', { class: 'btn', onclick: () => renderHistory(false) }, 'Показать ещё') : '');
}

async function renderFavorites() {
  const list = await call('history', { favorites: true, limit: 500 });
  const grid = document.getElementById('favoritesGrid');
  if (!list.length) grid.replaceChildren(h('div', { class: 'empty' }, 'Пока пусто. Звёздочка на «Сегодня» или в истории добавляет сюда.'));
  else grid.replaceChildren(...list.map(picture));
}

// ---- Настройки ---------------------------------------------------------------------------------

let settingsCache = null;

async function saveOne(key, value) {
  const patch = {};
  patch[key] = value;
  try {
    settingsCache = await call('saveSettings', patch);
    renderSettings(settingsCache);
  } catch (error) {
    ui.toast(error.message || String(error));
  }
}

function labelOf(item) {
  return h('div', { class: 'label' }, h('div', {}, item.label), item.hint && h('div', { class: 'hint' }, item.hint));
}

function control(item, values) {
  const value = values[item.key];
  if (item.type === 'bool') {
    const box = h('input', { type: 'checkbox', class: 'switch', checked: Boolean(value), 'aria-label': item.label });
    box.onchange = () => saveOne(item.key, box.checked);
    return h('label', { class: 'setting' }, labelOf(item), box);
  }
  if (item.type === 'number' || item.type === 'time') {
    const input = h('input', { class: 'input', value: String(value), type: item.type === 'time' ? 'time' : 'text', inputMode: 'decimal', 'aria-label': item.label });
    input.onchange = () => saveOne(item.key, input.value);
    return h('label', { class: 'setting' }, labelOf(item), input, item.unit && h('span', { class: 'unit' }, item.unit));
  }
  if (item.type === 'select') {
    const select = h('select', { class: 'input', 'aria-label': item.label },
      item.options.map(option => h('option', { value: option[0], selected: option[0] === value }, option[1])));
    select.onchange = () => saveOne(item.key, select.value);
    return h('label', { class: 'setting' }, labelOf(item), select);
  }
  if (item.type === 'text') {
    const input = h('input', { class: 'input', value: value || '', maxLength: item.max || 200, 'aria-label': item.label });
    input.onchange = () => saveOne(item.key, input.value);
    return h('label', { class: 'setting column' }, labelOf(item), input);
  }
  if (item.type === 'days') {
    const chosen = new Set(value);
    return h('div', { class: 'setting column' }, labelOf(item),
      h('div', { class: 'days' }, DAYS.map((name, i) => h('button', {
        class: 'chip' + (chosen.has(i + 1) ? ' on' : ''),
        'aria-pressed': chosen.has(i + 1) ? 'true' : 'false',
        onclick: () => {
          if (chosen.has(i + 1)) chosen.delete(i + 1);
          else chosen.add(i + 1);
          saveOne(item.key, Array.from(chosen));
        }
      }, name))));
  }
  return null;
}

function sourcesBlock(item, data) {
  const values = data.values.sources;
  return h('div', { class: 'section' }, Object.keys(values).map(id => {
    const box = h('input', { type: 'checkbox', class: 'switch', id: 'source-' + id, checked: values[id], 'aria-label': data.sourceNames[id] });
    box.onchange = () => {
      const next = Object.assign({}, values);
      next[id] = box.checked;
      saveOne('sources', next);
    };
    const key = data.keyInfo[id];
    const notes = [];
    if (data.spaceOnly[id]) notes.push(ui.t('только для космических тем'));
    if (key) notes.push(data.keys[id] ? ui.t('ключ есть') : key.required ? ui.t('нужен бесплатный ключ') : ui.t('без ключа — общий DEMO_KEY'));
    if (id === 'aic') notes.push(ui.t('картины до 4,8 Мпикс'));
    // The name toggles the switch; the key button stays outside the label.
    return h('div', { class: 'source' },
      h('label', { class: 'label', htmlFor: 'source-' + id }, h('div', { 'data-raw': '' }, data.sourceNames[id]), notes.length > 0 && h('div', { class: 'hint' }, ui.raw(notes.join(' · ')))),
      key && h('button', { class: 'btn', onclick: async () => {
        try {
          if (data.keys[id] && await ui.confirm('Убрать ключ ' + data.sourceNames[id] + '?', 'Убрать', true)) await call('removeKey', id);
          else if (!data.keys[id]) await call('askKey', id);
          refreshSettings();
        } catch (error) {
          ui.toast(error.message || String(error));
        }
      } }, data.keys[id] ? 'Убрать ключ' : 'Ключ'),
      box);
  }));
}

function topicsBlock(item, data) {
  const topics = data.values.topics.map(topic => Object.assign({}, topic));
  const save = () => saveOne('topics', topics);
  const rows = topics.map((topic, i) => {
    const name = h('input', { class: 'input', value: topic.name, 'aria-label': 'Название темы', maxLength: 40 });
    const query = h('input', { class: 'input', value: topic.query, 'aria-label': 'Слова для поиска по-английски', autocapitalize: 'off', maxLength: 60 });
    const weight = h('input', { class: 'input', value: String(topic.weight), inputMode: 'decimal', 'aria-label': 'Вес' });
    name.onchange = () => { topic.name = name.value; save(); };
    query.onchange = () => { topic.query = query.value; save(); };
    weight.onchange = () => { topic.weight = weight.value; save(); };
    const flag = (key, title) => {
      const box = h('input', { type: 'checkbox', class: 'switch', checked: topic[key] });
      box.onchange = () => { topic[key] = box.checked; save(); };
      return h('label', {}, box, title);
    };
    return h('div', { class: 'topic' }, name, query, weight,
      h('button', { class: 'icon-btn', 'aria-label': 'Убрать тему', onclick: () => { topics.splice(i, 1); save(); } }, icon('trash')),
      h('div', { class: 'flags' }, flag('bright', 'можно светлые'), flag('space', 'космос: NASA и APOD')));
  });
  const add = h('button', { class: 'btn', onclick: () => {
    topics.push({ name: 'новая тема', query: 'forest', weight: 1, bright: false, space: false });
    save();
  } }, icon('plus'), 'Тема');
  return h('div', { class: 'section' },
    h('p', { class: 'small muted' }, 'Название — для вас, слова — для поиска (по-английски), вес — как часто. Подряд одна тема не больше, чем указано в «Отборе».'),
    rows, h('div', {}, add));
}

function foldBlock(data) {
  const box = h('div', { class: 'section' });
  const summary = data.fold && data.fold.summary;
  box.append(h('p', { class: 'small', 'data-raw': '' }, data.foldLine));
  if (summary) {
    const lines = ['SDK ' + summary.sdk + ' · ' + summary.device]
      .concat(summary.crops ? ['setBitmapWithCrops(' + summary.crops.params.map(p => p.split('.').pop()).join(', ') + ')'] : [])
      .concat(summary.fields.slice(0, 40), summary.methods.slice(0, 40), summary.errors || []);
    box.append(h('div', { class: 'probe', 'data-raw': '' }, lines.join('\n')));
    (summary.flags || []).forEach(flag => {
      box.append(h('button', { class: 'btn', onclick: () => testFlag(flag.name) }, ui.raw(ui.t('Проверить') + ' ' + flag.name)));
    });
    if (data.fold.confirmed) box.append(h('p', { class: 'small', 'data-raw': '' }, 'Подтверждено: ' + data.fold.confirmed.name));
    if (data.fold.rejected && data.fold.rejected.length) box.append(h('p', { class: 'small muted', 'data-raw': '' }, 'Не сработали: ' + data.fold.rejected.join(', ')));
  }
  box.append(h('div', { class: 'chips' },
    h('button', { class: 'btn', onclick: async () => {
      try {
        const result = await call('probeFold');
        ui.toast(result.line);
        refreshSettings();
      } catch (error) {
        ui.toast(error.message || String(error));
      }
    } }, icon('search'), 'Разведать экраны'),
    h('button', { class: 'btn', onclick: screenSize }, 'Размер этого экрана'),
    summary && h('button', { class: 'btn', onclick: async () => { await call('forgetFold'); refreshSettings(); } }, 'Забыть разведку')));
  return box;
}

async function testFlag(name) {
  if (!(await ui.confirm('Внешний кадр текущих обоев будет поставлен с флагом ' + name + '. Потом сложите телефон и посмотрите.', 'Проверить'))) return;
  try {
    const result = await call('testFlag', name, true);
    if (!result.ok) {
      ui.toast(result.error);
      await call('confirmFlag', false);
      refreshSettings();
      return;
    }
    const works = await ui.confirm(result.ask, 'Да, работает');
    await call('confirmFlag', works);
    ui.toast(works ? 'Флаг запомнен: внешний экран будет получать свой кадр' : 'Записано: этот флаг не работает');
    refreshSettings();
  } catch (error) {
    ui.toast(error.message || String(error));
  }
}

async function screenSize() {
  const size = await call('screenNow');
  let close = null;
  const put = async which => {
    close();
    const patch = {};
    patch[which + 'Width'] = size.width;
    patch[which + 'Height'] = size.height;
    settingsCache = await call('saveSettings', patch);
    renderSettings(settingsCache);
  };
  close = ui.sheet([
    h('h3', {}, ui.raw(ui.t('Этот экран') + ': ' + size.width + '×' + size.height)),
    h('p', { class: 'small muted' }, 'Откройте экран на нужной половине телефона и запишите его размер в настройки.'),
    h('div', { class: 'actions' },
      h('button', { class: 'btn', onclick: () => put('cover') }, 'Это внешний'),
      h('button', { class: 'btn primary', onclick: () => put('inner') }, 'Это внутренний'))
  ]);
}

function placeBlock(data) {
  const place = data.place;
  const line = place ? (place.name || place.city || (place.latitude.toFixed(2) + ', ' + place.longitude.toFixed(2))) + ' · ' + place.from : ui.t('место неизвестно');
  return h('div', { class: 'section' },
    h('p', { class: 'small' }, ui.raw(ui.t('Сейчас') + ': ' + line)),
    !data.location && !data.values.city && h('button', { class: 'btn', onclick: async () => {
      const result = await call('askLocation');
      ui.toast(result.granted ? (result.place ? 'Место найдено' : result.note || 'Телефон ещё не знает, где он') : 'Без разрешения — укажите город');
      refreshSettings();
    } }, icon('pin'), 'Разрешить грубую геолокацию'));
}

function aboutBlock(data) {
  const can = data.canSet;
  const roles = data.models;
  return h('div', { class: 'section small' },
    h('p', {}, ui.raw(ui.t('Ставить обои') + ': ' + (can.ok ? ui.t('можно') : ui.t('нельзя') + (can.declared ? '' : ' — ' + ui.t('нет разрешения SET_WALLPAPER в сборке'))))),
    h('p', {}, ui.raw(ui.t('Модель запроса') + ': ' + (roles.query.ready ? roles.query.model : ui.t('нет — по шаблону')))),
    h('p', {}, ui.raw(ui.t('Модель-судья') + ': ' + (roles.judge.ready ? roles.judge.model + (roles.judge.vision ? '' : ' — ' + ui.t('без зрения, не используется')) : ui.t('нет — простая оценка')))),
    h('p', { class: 'muted' }, 'Material You берёт цвета системы из обоев: тёмный спокойный кадр даёт спокойную палитру. Если у Samsung включён «Динамический экран блокировки», он перебивает обои блокировки.'),
    h('div', { class: 'chips' },
      h('button', { class: 'btn', onclick: async () => { const r = await call('clearDry'); ui.toast(ui.t('Убрано проб') + ': ' + r.removed); } }, 'Убрать пробы'),
      h('button', { class: 'btn', onclick: async () => { const r = await call('clean'); ui.toast(ui.t('Освобождено дней') + ': ' + r.cleaned); } }, 'Убрать старые файлы')));
}

function renderSettings(data) {
  const groups = [];
  const byName = {};
  data.schema.forEach(item => {
    if (!byName[item.group]) {
      byName[item.group] = [];
      groups.push(item.group);
    }
    byName[item.group].push(item);
  });
  const extra = { 'Погода и место': placeBlock(data), 'Экраны': foldBlock(data) };
  const view = document.getElementById('settingsView');
  view.replaceChildren(...groups.map(group => h('section', { class: 'card group' },
    h('h2', {}, group),
    byName[group].map(item => {
      if (item.type === 'sources') return sourcesBlock(item, data);
      if (item.type === 'topics') return topicsBlock(item, data);
      return control(item, data.values);
    }),
    extra[group] || null)),
  h('section', { class: 'card group' }, h('h2', {}, 'Состояние'), aboutBlock(data)));
}

async function refreshSettings() {
  settingsCache = await call('settings');
  renderSettings(settingsCache);
}

// ---- the screen ----------------------------------------------------------------------------------

async function refresh() {
  await renderToday();
  if (shown === 'history') await renderHistory(true);
  if (shown === 'favorites') await renderFavorites();
}

document.getElementById('back').onclick = () => assi.back();
document.getElementById('now').onclick = () => (today && today.current ? act('other') : act('run', [{ manual: true }]));

ui.tabs(document.getElementById('tabs'), [['today', 'Сегодня'], ['history', 'История'], ['favorites', 'Избранное'], ['settings', 'Настройки']], id => {
  shown = id;
  if (id === 'history') renderHistory(true);
  if (id === 'favorites') renderFavorites();
  if (id === 'settings') refreshSettings();
});

assi.on('wallpapers.progress', progress);
assi.on('wallpapers.changed', () => { if (!busy) refresh(); });

renderToday().catch(error => ui.toast(error.message || String(error)));
refreshSettings().catch(() => {});
