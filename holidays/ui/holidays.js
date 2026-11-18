// The holidays screen. Logic lives in the engine (modules/holidays/main.js); this page shows the
// occasions ahead with a preview of their look, the people with birthdays, the owner's own
// occasions and the settings. Names and texts written by the owner or a model go in through ui.raw.
(function () {
  const MAIN = 'modules/holidays/main.js';
  const TABS = [['upcoming', 'Ближайшие'], ['people', 'Близкие'], ['own', 'Свои поводы'], ['settings', 'Настройки']];
  const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  const PALETTE = ['#7FB8FF', '#A9D4FF', '#9AA7FF', '#F28DB2', '#E8C468', '#F2C14E', '#FFB86B', '#FF8A3D', '#E8833A', '#7FA77F'];
  const REMIND_DAYS = [0, 1, 2, 3, 5, 7, 14, 30];
  const h = ui.h;
  const $ = (id) => document.getElementById(id);
  const call = (fn, ...args) => axiko.call(MAIN, fn, ...args);
  const wide = window.matchMedia('(min-width: 600px)');

  const view = {
    tab: null,
    status: null,
    upcoming: [],
    chosen: null,
    settings: null,
    people: null,
    kit: null,
    closeSheet: null,
    paneKey: null
  };

  // ---- small helpers ----------------------------------------------------------------------------

  function errorText(error) {
    return String(error && error.message ? error.message : error).replace(/^Error:\s*/, '');
  }

  /** Calls the engine; a failure is told in a toast and gives null. */
  async function run(fn, ...args) {
    try {
      return await call(fn, ...args);
    } catch (error) {
      ui.toast(errorText(error));
      return null;
    }
  }

  function plural(n, one, few, many) {
    const tens = Math.abs(n) % 100;
    const units = tens % 10;
    if (tens > 10 && tens < 20) return many;
    if (units === 1) return one;
    if (units >= 2 && units <= 4) return few;
    return many;
  }

  function years(n) {
    return n + ' ' + plural(n, 'год', 'года', 'лет');
  }

  function capital(text) {
    text = String(text || '');
    return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
  }

  function parts(iso) {
    const found = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
    return found ? { year: Number(found[1]), month: Number(found[2]), day: Number(found[3]) } : null;
  }

  /** '2026-12-31' → '31 декабря' (with the year when it is not this one). */
  function dayText(iso, withYear) {
    const date = parts(iso);
    if (!date) return '';
    const thisYear = parts(view.status && view.status.day) || { year: new Date().getFullYear() };
    const text = date.day + ' ' + MONTHS[date.month - 1];
    return withYear || date.year !== thisYear.year ? text + ' ' + date.year : text;
  }

  function spanText(item) {
    if (!item.start || !item.end || item.start === item.end) return dayText(item.anchor);
    return dayText(item.start) + ' – ' + dayText(item.end);
  }

  function clock(ms) {
    const date = new Date(ms);
    const pad = (n) => (n < 10 ? '0' : '') + n;
    return pad(date.getHours()) + ':' + pad(date.getMinutes()) + ':' + pad(date.getSeconds());
  }

  /** Titles the owner wrote (own occasions, names of people) are shown as they are. */
  function titleNode(item) {
    return item.own || item.kind === 'birthday' ? ui.raw(item.title) : item.title;
  }

  function aboutNode(item) {
    if (!item.about) return null;
    return h('p', { class: 'muted' }, item.own ? ui.raw(item.about) : item.about);
  }

  /** A labelled control; tag 'div' for a group of buttons (a label would pass its taps to the first one). */
  function field(label, control, hint, tag) {
    return h(tag || 'label', { class: 'field' }, h('span', {}, label), control, hint ? h('span', { class: 'mock-note' }, hint) : null);
  }

  function debounce(fn, ms) {
    let timer = null;
    return function () {
      clearTimeout(timer);
      timer = setTimeout(fn, ms);
    };
  }

  // ---- the day: what is on now --------------------------------------------------------------------

  async function loadStatus() {
    const status = await run('status');
    if (!status) return;
    view.status = status;
    renderToday();
  }

  function renderToday() {
    const s = view.status;
    const box = $('today');
    const blocks = [];

    if (s.preview) {
      blocks.push(h('div', { class: 'head' },
        h('span', { class: 'occ-ic on' }, ui.icon('eye')),
        h('div', { class: 'grow' },
          h('div', { class: 'title' }, 'Предпросмотр: ', s.preview.title),
          h('div', { class: 'muted small' }, ui.t('Вернётся как было в {}', clock(s.preview.until))))));
      blocks.push(h('div', { class: 'actions' },
        h('button', { class: 'btn', onclick: async () => { await run('endPreview', true); refresh(); } }, 'Закончить сейчас')));
    }

    if (s.plan && !s.preview) {
      blocks.push(h('div', { class: 'head' },
        h('span', { class: 'dot', style: s.plan.accent ? 'background: ' + s.plan.accent : null }),
        h('div', { class: 'grow' },
          h('div', { class: 'title' }, 'Сейчас: ', s.plan.title),
          h('div', { class: 'muted small' }, capital(s.plan.look || 'праздничный цвет')))));
      let note = null;
      let action = null;
      if (s.off) {
        note = 'Оформление выключено до конца повода.';
        action = h('button', { class: 'btn', onclick: () => act('decorOn', 'Оформление включено') }, 'Включить снова');
      } else if (s.ownerChose) {
        note = 'Вы выбрали другую тему — до конца повода Axiko её не трогает.';
        action = h('button', { class: 'btn', onclick: () => act('decorOn', 'Праздник вернулся') }, 'Вернуть праздник');
      } else {
        if (s.mode === 'decor') note = 'Украшения лежат поверх вашей темы.';
        else if (s.mode === 'theme') note = 'Надета праздничная тема на основе вашей; после повода вернётся прежняя.';
        action = h('button', { class: 'btn', onclick: () => act('decorOff', 'Выключено до конца повода') }, 'Выключить до конца повода');
      }
      if (s.powerSave) note = (note ? note + ' ' : '') + ui.t('Включено энергосбережение: украшения без движения или только цвет — как в настройках.');
      if (note) blocks.push(h('p', { class: 'muted small' }, note));
      blocks.push(h('div', { class: 'actions' }, action));
    } else if (!s.preview) {
      const titles = (s.active || []).map((item) => item.title);
      blocks.push(h('div', { class: 'head' },
        h('span', { class: 'occ-ic' }, ui.icon('calendar')),
        h('div', { class: 'grow' },
          titles.length
            ? h('div', {}, 'Сегодня: ', ui.raw(titles.join(', ')), h('div', { class: 'muted small' }, 'Без украшений.'))
            : h('div', { class: 'muted' }, 'Сегодня без праздничного оформления.'))));
    }

    const snowAsked = s.firstSnow && s.firstSnow.accepted === null &&
      (s.active || []).some((item) => item.id === 'first-snow' && item.consent === false);
    if (snowAsked) {
      blocks.push(h('div', { class: 'head' },
        h('span', { class: 'occ-ic on' }, ui.icon('moon')),
        h('div', { class: 'grow' }, 'Погода показывает первый снег. Включить зимнее оформление?')));
      blocks.push(h('div', { class: 'actions' },
        h('button', { class: 'btn primary', onclick: () => act('answerSnow', 'Зимнее оформление включено', { yes: true }) }, 'Включить зимнее'),
        h('button', { class: 'btn', onclick: () => act('answerSnow', 'Хорошо, без снега', { yes: false }) }, 'Не надо')));
    }
    box.replaceChildren(...blocks);
  }

  async function act(fn, done, ...args) {
    const result = await run(fn, ...args);
    if (result !== null) ui.toast(done);
    refresh();
  }

  // ---- «Ближайшие»: the list and the preview ----------------------------------------------------

  async function loadUpcoming() {
    const list = await run('upcoming');
    if (!list) return;
    view.upcoming = list;
    renderUpcoming();
    const same = list.filter((item) => item.id === view.chosen)[0];
    if (wide.matches && (same || list.length)) choose(same || list[0], true);
    document.body.dataset.ready = '1';
  }

  function renderUpcoming() {
    const box = $('occList');
    const days = view.settings ? view.settings.values.upcomingDays : null;
    if (!view.upcoming.length) {
      box.replaceChildren(h('div', { class: 'empty' }, days ? ui.t('В ближайшие {} дней поводов нет', days) : 'Поводов впереди нет'));
    } else {
      box.replaceChildren(...view.upcoming.map((item) => h('button', {
        class: 'occ' + (item.id === view.chosen ? ' chosen' : ''),
        'data-id': item.id,
        onclick: () => choose(item)
      },
      h('span', { class: 'occ-ic' + (item.active ? ' on' : '') }, ui.icon(item.icon)),
      h('span', { class: 'text' },
        h('span', { class: 'title' }, titleNode(item)),
        h('span', { class: 'sub' }, item.when, ' · ', spanText(item))),
      item.accent ? h('span', { class: 'dot', style: 'background: ' + item.accent }) : null)));
    }
    $('occFoot').textContent = ui.t('Выключенные поводы не показываются — включить их можно в «Настройках».');
  }

  function choose(item, quiet) {
    view.chosen = item.id;
    document.querySelectorAll('#occList .occ').forEach((row) => row.classList.toggle('chosen', row.dataset.id === item.id));
    if (wide.matches) {
      // The same occasion with the same data is not drawn again: the mock-up's motion is not restarted.
      const key = JSON.stringify(item);
      if (view.paneKey !== key) {
        view.paneKey = key;
        renderPreview(item, $('previewPane'));
      }
      return;
    }
    if (quiet) return;
    const holder = h('div', {});
    if (view.closeSheet) view.closeSheet();
    view.closeSheet = ui.sheet([
      h('div', { class: 'row' }, h('div', { class: 'grow' }), h('button', { class: 'icon-btn', 'aria-label': 'Закрыть', onclick: () => view.closeSheet && view.closeSheet() }, ui.icon('close'))),
      holder
    ], () => { view.closeSheet = null; });
    renderPreview(item, holder);
  }

  function ageLine(item) {
    if (!item.age) return null;
    if (item.kind === 'install') return ui.t('Axiko с вами {}', years(item.age));
    if (item.kind === 'birthday' || item.kind === 'owner') return ui.t('Исполнится {}', years(item.age));
    return ui.t('{} со дня первого раза', years(item.age));
  }

  function renderPreview(item, container) {
    // allow-same-origin without allow-scripts: the mock-up is drawn, nothing in it can run.
    const frame = h('iframe', { class: 'mock', title: 'Как это выглядит', sandbox: 'allow-same-origin' });
    const actions = [];
    if (item.hasLook) {
      actions.push(h('button', {
        class: 'btn primary',
        onclick: async () => {
          const started = await run('preview', item.id);
          if (started) ui.toast(ui.t('Оформление включено на {} с', started.seconds));
          refresh();
        }
      }, ui.icon('eye'), 'Включить сейчас для просмотра'));
      actions.push(h('button', { class: 'btn', onclick: () => fillMock(frame, item.id) }, ui.icon('refresh'), 'Повторить движение'));
    }
    if (item.kind === 'birthday' && item.contact) {
      actions.push(h('button', { class: 'btn', onclick: () => openDraft(item.contact, item.title) }, ui.icon('message'), 'Черновик поздравления'));
    }
    const age = ageLine(item);
    container.replaceChildren(h('div', { class: 'preview-body' },
      h('div', { class: 'row' },
        h('span', { class: 'occ-ic on' }, ui.icon(item.icon)),
        h('div', { class: 'grow' },
          h('h3', {}, titleNode(item)),
          h('div', { class: 'muted small' }, spanText(item), ' · ', item.when))),
      aboutNode(item),
      age ? h('p', {}, age) : null,
      item.hasLook ? frame : h('div', { class: 'empty' }, 'У этого повода нет украшений — он отмечается напоминанием или словом ассистента.'),
      item.hasLook ? h('p', { class: 'mock-note' }, ui.t('На экранах: {}. Нажмите кнопку или карточку в макете — так отвечают украшения.', item.look)) : null,
      item.ask ? h('p', { class: 'mock-note' }, 'Оформление первого снега включается только после вашего «да» в уведомлении.') : null,
      item.solemn ? h('p', { class: 'mock-note' }, 'Торжественный день: только цвет, без игривых украшений.') : null,
      actions.length ? h('div', { class: 'actions' }, actions) : null));
    if (item.hasLook) fillMock(frame, item.id);
  }

  /** The kit's stylesheet without the owner's theme and the decor layer appended to it. */
  async function kitBase() {
    if (view.kit !== null) return view.kit;
    const text = await fetch('/ui/kit/kit.css', { cache: 'no-store' }).then((response) => response.text());
    const cuts = ['\n/* theme: ', '\n/* decor */'].map((marker) => text.indexOf(marker)).filter((at) => at >= 0);
    view.kit = cuts.length ? text.slice(0, Math.min(...cuts)) : text;
    return view.kit;
  }

  const MOCK_CSS = [
    'html, body { overflow: hidden; }',
    '.page { padding: 16px 14px 96px; gap: 14px; }',
    '.hello { display: flex; flex-direction: column; gap: 4px; }',
    '.hello h1 { font-size: 24px; }',
    '.mock-fab { position: fixed; right: 16px; bottom: 16px; width: 56px; height: 56px; border-radius: 50%; background: var(--accent); }'
  ].join('\n');

  function mockHtml() {
    const t = (text) => ui.esc(ui.t(text));
    return '<main class="page">' +
      '<header class="topbar"><h1 class="grow">Axiko</h1></header>' +
      '<div class="hello"><h1>' + t('Добрый вечер') + '</h1><p class="muted">' + t('Так выглядит главный экран') + '</p></div>' +
      '<div class="card"><b>' + t('Карточка') + '</b><p class="muted small">' + t('Нажмите на неё') + '</p></div>' +
      '<div class="row"><button class="btn primary">' + t('Кнопка') + '</button><button class="btn">' + t('Ещё') + '</button></div>' +
      '<div class="list"><div class="empty">' + t('Здесь пока пусто') + '</div></div>' +
      '</main><div class="mock-fab"></div>';
  }

  async function fillMock(frame, id) {
    try {
      const [kit, look] = await Promise.all([kitBase(), call('previewCss', id)]);
      const tokens = Object.keys(look.base || {}).filter((key) => /^[a-zA-Z0-9-]+$/.test(key))
        .map((key) => '  --' + key + ': ' + String(look.base[key]).replace(/[;{}<>]/g, '') + ';').join('\n');
      frame.srcdoc = '<!doctype html><html><head><meta charset="utf-8"><style>' + kit + '\n:root {\n' + tokens + '\n}\n' +
        MOCK_CSS + '\n' + String(look.css || '').replace(/<\//g, '<\\/') + '</style></head><body>' + mockHtml() + '</body></html>';
    } catch (error) {
      frame.replaceWith(h('div', { class: 'empty' }, ui.t('Макет не построился: {}', errorText(error))));
    }
  }

  // ---- «Близкие» -----------------------------------------------------------------------------------

  async function loadPeople() {
    const data = await run('people');
    if (!data) return;
    view.people = data;
    renderPeople();
  }

  function daysLabel(days) {
    return days === 0 ? ui.t('в день') : ui.t('за {} дн.', days);
  }

  function personRow(person) {
    const options = REMIND_DAYS.indexOf(person.days) >= 0 ? REMIND_DAYS : REMIND_DAYS.concat([person.days]).sort((a, b) => a - b);
    const select = h('select', {
      class: 'input',
      'aria-label': 'За сколько дней напомнить',
      hidden: !person.close,
      onchange: async (event) => {
        if (await run('setPerson', person.id, { days: Number(event.target.value) })) ui.toast('Сохранено');
      }
    }, options.map((days) => h('option', { value: String(days), selected: days === person.days }, daysLabel(days))));
    const toggle = h('input', {
      type: 'checkbox',
      class: 'switch',
      checked: person.close,
      'aria-label': 'Напоминать',
      onchange: async (event) => {
        const on = event.target.checked;
        const saved = await run('setPerson', person.id, { remind: on });
        if (!saved) {
          event.target.checked = !on;
          return;
        }
        select.hidden = !saved.close;
        ui.toast(saved.close ? ui.t('Напомню {}', daysLabel(saved.days)) : 'Без напоминаний');
      }
    });
    const sub = [person.when, dayText(person.next)];
    if (person.age) sub.push(ui.t('исполнится {}', years(person.age)));
    return h('div', { class: 'person' },
      h('span', { class: 'occ-ic' + (person.inDays <= 7 ? ' on' : '') }, ui.icon(person.starred ? 'star' : 'user')),
      h('span', { class: 'text' },
        h('span', { class: 'title' }, ui.raw(person.name)),
        h('span', { class: 'sub' }, sub.join(' · '))),
      h('span', { class: 'person-controls' },
        select,
        toggle,
        h('button', { class: 'icon-btn', 'aria-label': 'Черновик поздравления', onclick: () => openDraft(person.id, person.name) }, ui.icon('message'))));
  }

  function renderPeople() {
    const data = view.people;
    const main = [];
    const side = [];
    if (!data.permission.contacts) {
      main.push(h('div', { class: 'card section' },
        h('div', { class: 'title' }, 'Доступ к контактам'),
        h('p', { class: 'muted' }, 'Чтобы знать дни рождения близких, Axiko читает даты из контактов (а календарь «Дни рождения» — как запасной источник). Никому ничего не отправляется.'),
        h('div', { class: 'actions' }, h('button', {
          class: 'btn primary',
          onclick: async () => {
            await run('requestAccess', ['contacts', 'calendar']);
            loadPeople();
          }
        }, 'Разрешить доступ'))));
    }
    if (data.source === 'calendar') main.push(h('p', { class: 'muted small' }, 'Контакты недоступны — дни рождения взяты из календаря.'));
    if (!data.people.length) {
      main.push(h('div', { class: 'card empty' }, 'Дней рождения не найдено. Добавьте дату рождения в карточку контакта — Axiko увидит её сам.'));
    } else {
      main.push(h('p', { class: 'muted small' }, ui.t('Переключатель — напоминать ли о дне рождения; рядом — за сколько дней. Напоминания приходят в {}.', data.remindTime)));
      main.push(h('div', { class: 'list' }, data.people.map(personRow)));
    }

    const owner = data.owner || {};
    side.push(h('div', { class: 'card section' },
      h('div', { class: 'row' }, h('span', { class: 'occ-ic on' }, ui.icon('star')), h('div', { class: 'title grow' }, 'Ваш день рождения')),
      owner.birthday
        ? h('p', {}, owner.inDays === 0 ? 'Сегодня! С днём рождения.' : ui.t('{} — {}', dayText(owner.next), owner.inDays === 1 ? ui.t('завтра') : ui.t('через {} дн.', owner.inDays)),
          owner.age ? ui.t(', исполнится {}', years(owner.age)) : '')
        : h('p', { class: 'muted' }, 'Не указан. Укажите дату в «Настройках» или заполните свою карточку в контактах.'),
      owner.birthday ? h('p', { class: 'mock-note' }, owner.source === 'settings' ? 'Из настроек.' : 'Из вашей карточки в контактах.') : null,
      h('div', { class: 'actions' }, h('button', { class: 'btn', onclick: () => view.showTab('settings') }, owner.birthday ? 'Изменить' : 'Указать'))));

    if (data.unreadable && data.unreadable.length) {
      side.push(h('div', { class: 'card section' },
        h('div', { class: 'title' }, 'Не удалось прочитать дату'),
        h('p', { class: 'muted small' }, 'Исправьте её в карточке контакта, например 15.11.1990.'),
        data.unreadable.map((item) => h('div', { class: 'row' }, h('span', { class: 'grow' }, ui.raw(item.name)), h('span', { class: 'muted small mono' }, ui.raw(item.raw || ''))))));
    }

    const drafts = data.drafts || [];
    side.push(h('div', { class: 'section' },
      h('div', { class: 'title' }, 'Черновики поздравлений'),
      drafts.length
        ? drafts.map((draft) => h('div', { class: 'card draft' },
          h('div', { class: 'row' },
            h('div', { class: 'grow' }, h('div', { class: 'title' }, ui.raw(draft.name)), h('div', { class: 'sub' }, ui.ago(draft.at))),
            h('button', { class: 'icon-btn', 'aria-label': 'Скопировать', onclick: () => copyText(draft.text) }, ui.icon('copy'))),
          h('div', { class: 'draft-text' }, ui.raw(draft.text))))
        : h('p', { class: 'muted small' }, 'Здесь появятся черновики. Отправляете вы сами — Axiko никому не пишет.')));

    $('peopleMain').replaceChildren(...main);
    $('peopleSide').replaceChildren(...side);
  }

  async function copyText(text) {
    if (await run('copy', text)) ui.toast('Скопировано');
  }

  function openDraft(contact, name) {
    const body = h('div', { class: 'section' }, h('div', { class: 'spinner' }), h('p', { class: 'muted' }, 'Пишу черновик…'));
    if (view.closeSheet) view.closeSheet();
    view.closeSheet = ui.sheet([h('h3', {}, 'Поздравление: ', ui.raw(name || '')), body], () => { view.closeSheet = null; });
    const write = async () => {
      body.replaceChildren(h('div', { class: 'spinner' }), h('p', { class: 'muted' }, 'Пишу черновик…'));
      const draft = await run('draft', contact);
      if (!draft) {
        body.replaceChildren(h('p', { class: 'muted' }, 'Не получилось.'));
        return;
      }
      body.replaceChildren(
        h('div', { class: 'draft-text' }, ui.raw(draft.text)),
        h('p', { class: 'mock-note' }, draft.by === 'model' ? 'Написала модель — поправьте, если нужно.' : 'Простой шаблон: модель выключена или недоступна.'),
        draft.inbox ? h('p', { class: 'mock-note' }, 'Черновик лежит и во «Входящих», в беседе ', ui.raw('«' + draft.inbox + '»'), '.') : null,
        h('div', { class: 'sheet-actions' },
          h('button', { class: 'btn primary', onclick: () => copyText(draft.text) }, ui.icon('copy'), 'Скопировать'),
          /^\d+$/.test(String(contact)) ? h('button', { class: 'btn', onclick: () => run('openContact', contact) }, ui.icon('user'), 'Открыть контакт') : null,
          h('button', { class: 'btn', onclick: write }, ui.icon('refresh'), 'Другой вариант')),
        h('p', { class: 'mock-note' }, 'Отправляете вы сами: скопируйте текст и вставьте в нужный чат.'));
      if (view.tab === 'people') loadPeople();
    };
    write();
  }

  // ---- «Свои поводы» -------------------------------------------------------------------------------

  async function loadOwn() {
    if (!view.settings) view.settings = await run('settings');
    renderOwnForm();
    const list = await run('ownOccasions');
    if (list) renderOwnList(list);
  }

  function renderOwnForm() {
    const title = h('input', { class: 'input', id: 'ownTitle', placeholder: 'Годовщина свадьбы', maxlength: 80 });
    const date = h('input', { class: 'input', id: 'ownDate', placeholder: '14.06 или 14.06.2027', inputmode: 'numeric' });
    const yearly = h('input', { type: 'checkbox', class: 'switch', id: 'ownYearly', checked: true });
    const remind = h('select', { class: 'input', id: 'ownRemind' },
      [[0, 'Не напоминать заранее'], [1, 'За день'], [2, 'За 2 дня'], [3, 'За 3 дня'], [7, 'За неделю'], [14, 'За две недели']]
        .map((pair) => h('option', { value: String(pair[0]) }, pair[1])));
    let accent = '';
    const palette = h('div', { class: 'palette' });
    const drawPalette = () => {
      palette.replaceChildren(...[''].concat(PALETTE).map((color) => h('button', {
        type: 'button',
        class: color === accent ? 'on' : '',
        'aria-label': color ? ui.t('Цвет {}', color) : 'Без своего цвета',
        onclick: () => {
          accent = color;
          drawPalette();
        }
      }, color ? h('span', { class: 'swatch', style: 'background: ' + color }) : ui.icon('close'))));
    };
    drawPalette();
    const decors = (view.settings && view.settings.decors) || [];
    const decorSelect = h('select', { class: 'input', id: 'ownDecor' },
      h('option', { value: '' }, 'Без украшений'),
      decors.map((item) => h('option', { value: item.id }, capital(item.title))));
    const add = h('button', {
      class: 'btn primary',
      id: 'ownAdd',
      onclick: async () => {
        const made = await run('addOccasion', {
          title: title.value,
          date: date.value,
          yearly: yearly.checked,
          remind: Number(remind.value),
          accent: accent || undefined,
          decor: decorSelect.value || undefined
        });
        if (!made) return;
        ui.toast(ui.t('Добавлено: {}', made.title));
        title.value = '';
        date.value = '';
        loadOwn();
      }
    }, ui.icon('plus'), 'Добавить повод');
    $('ownForm').replaceChildren(
      h('div', { class: 'title' }, 'Новый повод'),
      field('Название', title),
      field('Дата', date, 'Каждый год — достаточно дня и месяца. С годом Axiko посчитает, какая это годовщина.'),
      h('label', { class: 'inline' }, h('span', { class: 'grow' }, 'Каждый год'), yearly),
      field('Напомнить', remind),
      field('Свой цвет на этот день', palette, null, 'div'),
      field('Украшение', decorSelect),
      h('div', { class: 'actions' }, add),
      h('p', { class: 'mock-note' }, 'Можно и словами в чате: «добавь годовщину свадьбы 14 июня, напомни за три дня».'));
  }

  function ruleText(occasion) {
    const rule = occasion.rule || {};
    if (rule.fixed) {
      const [month, day] = rule.fixed.split('-').map(Number);
      return day + ' ' + MONTHS[month - 1] + ', ' + ui.t('каждый год') + (occasion.since ? ui.t(', с {}', occasion.since) : '');
    }
    if (rule.date) return dayText(rule.date, true);
    return ui.t('по правилу');
  }

  function renderOwnList(list) {
    const box = $('ownList');
    if (!list.length) {
      box.replaceChildren(h('div', { class: 'card empty' }, 'Своих поводов пока нет: годовщины, дни памяти семьи, «день, когда завели кота».'));
      return;
    }
    box.replaceChildren(h('div', { class: 'list' }, list.map((occasion) => h('div', { class: 'own-row' },
      h('span', { class: 'occ-ic on' }, occasion.accent ? h('span', { class: 'dot', style: 'background: ' + occasion.accent }) : ui.icon(occasion.icon || 'heart')),
      h('span', { class: 'text grow' },
        h('span', { class: 'title' }, ui.raw(occasion.title)),
        h('span', { class: 'sub muted small' }, ruleText(occasion), occasion.remind ? ui.t(' · напомнить за {} дн.', occasion.remind) : '')),
      h('button', {
        class: 'icon-btn',
        'aria-label': 'Удалить',
        onclick: async () => {
          if (!(await ui.confirm(ui.t('Удалить повод «{}»?', occasion.title), 'Удалить', true))) return;
          if (await run('removeOccasion', occasion.id)) {
            ui.toast('Удалено');
                loadOwn();
          }
        }
      }, ui.icon('trash'))))));
  }

  // ---- «Настройки» ---------------------------------------------------------------------------------

  async function loadSettings() {
    const data = await run('settings');
    if (!data) return;
    view.settings = data;
    if (!view.status) await loadStatus();
    renderSettings();
  }

  async function save(key, value, control) {
    const merged = await run('saveSettings', { [key]: value });
    if (!merged) return;
    view.settings.values = merged;
    if (control && control.type !== 'checkbox' && merged[key] !== undefined && String(control.value) !== String(merged[key])) control.value = merged[key];
    ui.toast('Сохранено');
  }

  function settingControl(item, values) {
    const value = values[item.key];
    if (item.type === 'bool') {
      return h('input', { type: 'checkbox', class: 'switch', checked: Boolean(value), 'aria-label': item.label, onchange: (event) => save(item.key, event.target.checked) });
    }
    if (item.type === 'select') {
      return h('select', { class: 'input', 'aria-label': item.label, onchange: (event) => save(item.key, event.target.value) },
        item.options.map((option) => h('option', { value: option[0], selected: option[0] === value }, option[1])));
    }
    if (item.type === 'number') {
      const input = h('input', {
        type: 'number', class: 'input', inputmode: 'numeric', min: item.min, max: item.max, step: item.step, value: String(value), 'aria-label': item.label,
        onchange: (event) => save(item.key, Number(event.target.value), event.target)
      });
      return item.unit ? h('span', { class: 'row' }, input, h('span', { class: 'unit' }, item.unit)) : input;
    }
    if (item.type === 'time') {
      return h('input', { type: 'time', class: 'input', value: value, 'aria-label': item.label, onchange: (event) => save(item.key, event.target.value, event.target) });
    }
    return h('input', {
      type: 'text', class: 'input', value: value || '', 'aria-label': item.label, maxlength: 200,
      onchange: (event) => save(item.key, event.target.value, event.target)
    });
  }

  function occasionSwitches(item, data) {
    return h('div', { class: 'section' },
      h('p', { class: 'mock-note' }, item.hint || ''),
      data.occasions.map((occasion) => h('label', { class: 'setting' },
        h('span', { class: 'text' }, h('span', {}, occasion.own ? ui.raw(occasion.title) : occasion.title),
          occasion.about ? h('span', { class: 'hint' }, occasion.own ? ui.raw(occasion.about) : occasion.about) : null),
        h('input', {
          type: 'checkbox', class: 'switch', checked: occasion.on, 'aria-label': occasion.title,
          onchange: async (event) => {
            if (await run('setOccasion', occasion.id, event.target.checked)) {
              occasion.on = event.target.checked;
                    ui.toast(event.target.checked ? 'Повод включён' : 'Повод выключен');
            }
          }
        }))));
  }

  function featureRow(on, title, yes, no) {
    return h('div', { class: 'feature' },
      h('span', { class: on ? 'ok' : 'no' }, ui.icon(on ? 'check' : 'info')),
      h('span', { class: 'text grow' }, h('span', {}, title), h('span', { class: 'hint' }, on ? yes : no)));
  }

  function renderSettings() {
    const data = view.settings;
    const groups = [];
    const byGroup = {};
    data.schema.forEach((item) => {
      if (!byGroup[item.group]) {
        byGroup[item.group] = [];
        groups.push(item.group);
      }
      byGroup[item.group].push(item);
    });
    const cards = groups.map((group) => h('section', { class: 'card group' },
      h('h2', {}, group),
      byGroup[group].map((item) => {
        if (item.type === 'list') return occasionSwitches(item, data);
        const control = settingControl(item, data.values);
        const stack = item.type === 'text' || item.type === 'select';
        return h('label', { class: 'setting' + (stack ? ' stack' : '') },
          h('span', { class: 'text' }, h('span', {}, item.label), item.hint ? h('span', { class: 'hint' }, item.hint) : null),
          control);
      })));

    const s = view.status || { features: {}, permissions: {} };
    const f = s.features || {};
    const p = s.permissions || {};
    cards.push(h('section', { class: 'card group' },
      h('h2', {}, 'Возможности телефона'),
      featureRow(f.decor, 'Слой украшений поверх темы', 'Ваша тема не меняется.', 'Праздник надевается отдельной темой «Праздник», после повода возвращается ваша.'),
      featureRow(f.actions, 'Кнопки в уведомлениях', 'Ответить можно прямо из шторки.', 'Нажатие на уведомление открывает этот экран.'),
      featureRow(f.once, 'Задачи на точное время', 'Конфетти и предпросмотр снимаются вовремя.', 'Конфетти и предпросмотр снимает ожидающий поток.'),
      featureRow(f.visible, 'Знает, когда открыт Axiko', 'Конфетти — при первом открытии за день.', 'Конфетти и поздравление — при первой разблокировке за день.'),
      featureRow(p.contacts, 'Контакты', 'Дни рождения видны.', 'Нет доступа — дни рождения не видны.'),
      featureRow(p.calendar, 'Календарь', 'Запасной источник дней рождения.', 'Нет доступа.'),
      featureRow(p.location, 'Местоположение', 'Погода для первого снега — по месту.', 'Без него погода — по городу из настроек.'),
      h('div', { class: 'wrap-row' },
        !p.contacts || !p.calendar ? h('button', { class: 'btn', onclick: () => grant(['contacts', 'calendar']) }, 'Разрешить контакты и календарь') : null,
        !p.location ? h('button', { class: 'btn', onclick: () => grant(['location']) }, 'Разрешить местоположение') : null,
        h('button', { class: 'btn', onclick: lookWeather }, 'Посмотреть погоду сейчас'))));

    $('settingsView').replaceChildren(...cards);
  }

  async function grant(what) {
    await run('requestAccess', what);
    await loadStatus();
    renderSettings();
  }

  async function lookWeather() {
    const weather = await run('checkWeather');
    if (weather === null) {
      const status = await run('status');
      if (status && status.firstSnow) ui.toast('Первый снег в этом сезоне уже был');
      else ui.toast('Погоду не узнать: укажите город или разрешите местоположение (или сейчас не сезон первого снега)');
      return;
    }
    const where = weather.place ? ui.t(', {}', weather.place) : '';
    ui.toast((weather.snow ? ui.t('Идёт снег') : ui.t('Снега нет')) + (weather.temperature !== undefined ? ', ' + weather.temperature + '°' : '') + where + ' (' + weather.source + ')');
    refresh();
  }

  // ---- tabs, events, start -------------------------------------------------------------------------

  function loadTab(id) {
    view.tab = id;
    if (id === 'upcoming') loadUpcoming();
    else if (id === 'people') loadPeople();
    else if (id === 'own') loadOwn();
    else if (id === 'settings') loadSettings();
  }

  async function refresh() {
    await loadStatus();
    if (view.tab) loadTab(view.tab);
  }

  wide.addEventListener('change', () => {
    if (wide.matches) {
      if (view.closeSheet) view.closeSheet();
      view.paneKey = null;
      const item = view.upcoming.filter((entry) => entry.id === view.chosen)[0] || view.upcoming[0];
      if (item) choose(item, true);
    }
  });

  $('back').addEventListener('click', () => {
    if (view.closeSheet) {
      view.closeSheet();
      return;
    }
    if (window.axiko && axiko.back) axiko.back();
    else history.back();
  });

  $('recheck').addEventListener('click', async () => {
    if (await run('check')) ui.toast('Проверено');
    refresh();
  });

  axiko.on('holidays.changed', debounce(() => {
    loadStatus();
    if (view.tab === 'upcoming') loadUpcoming();
  }, 400));

  (async function start() {
    view.settings = await run('settings');
    await loadStatus();
    view.showTab = ui.tabs($('tabs'), TABS, loadTab);
  })();
})();
