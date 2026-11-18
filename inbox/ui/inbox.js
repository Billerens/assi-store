// The inbox screen. Logic lives in the engine (modules/inbox/main.js); this page shows the feed,
// one conversation, drafts and the settings. Texts written by other people go in through ui.raw.
(function () {
  const MAIN = 'modules/inbox/main.js';
  const h = ui.h;
  const call = (fn, ...args) => axiko.call(MAIN, fn, ...args);
  const $ = (id) => document.getElementById(id);
  const TABS = [['important', 'Важно'], ['later', 'Подождёт'], ['noise', 'Шум'], ['all', 'Все'], ['settings', 'Настройки']];
  const BUCKET = { important: 'важно', later: 'подождёт', noise: 'шум' };
  const wide = window.matchMedia('(min-width: 600px)');

  const view = {
    tab: null,
    chatId: null,
    chat: null,
    draftId: null,
    counts: { important: 0, later: 0, noise: 0, all: 0 },
    booting: true,
    pushed: false
  };

  // ---- small helpers ----------------------------------------------------------------------------

  function pad(n) {
    return (n < 10 ? '0' : '') + n;
  }

  function shortTime(time) {
    if (!time) return '';
    const date = new Date(time);
    const now = new Date();
    if (date.toDateString() === now.toDateString()) return pad(date.getHours()) + ':' + pad(date.getMinutes());
    const yesterday = new Date(Date.now() - 864e5);
    if (date.toDateString() === yesterday.toDateString()) return ui.t('вчера');
    return pad(date.getDate()) + '.' + pad(date.getMonth() + 1);
  }

  function dayTitle(time) {
    const date = new Date(time);
    const now = new Date();
    if (date.toDateString() === now.toDateString()) return ui.t('Сегодня');
    if (date.toDateString() === new Date(Date.now() - 864e5).toDateString()) return ui.t('Вчера');
    return pad(date.getDate()) + '.' + pad(date.getMonth() + 1) + '.' + date.getFullYear();
  }

  function appIcon(src, size) {
    const box = h('span', { class: 'app-ic' });
    if (src) {
      const img = h('img', { src: src + '?v=1', alt: '', width: size || 36, height: size || 36 });
      img.onerror = () => box.replaceChildren(ui.icon('message'));
      box.appendChild(img);
    } else {
      box.appendChild(ui.icon('message'));
    }
    return box;
  }

  function errorText(error) {
    return String(error && error.message ? error.message : error).replace(/^Error:\s*/, '');
  }

  // ---- layout: one column or two panes -------------------------------------------------------------

  function layout() {
    const split = $('feedView');
    split.classList.toggle('two', wide.matches);
    split.classList.toggle('one', !wide.matches);
    split.classList.toggle('reading', Boolean(view.chatId));
    $('back').setAttribute('aria-label', !wide.matches && view.chatId ? ui.t('К списку') : ui.t('Назад'));
  }

  wide.addEventListener('change', () => {
    layout();
    if (wide.matches && !view.chatId) renderPlaceholder();
  });

  // ---- banner: access, model ---------------------------------------------------------------------

  function renderBanner(status) {
    const box = $('banner');
    const parts = [];
    if (status && !status.notices) {
      parts.push(h('div', { class: 'card danger section' },
        h('p', {}, 'Входящие не видят уведомлений: доступ к ним выключен.'),
        h('div', { class: 'row' },
          h('button', { class: 'btn', onclick: () => axiko.native('sense.open', 'notices') }, 'Включить доступ'))));
    }
    if (status && status.pending > 0 && status.why) {
      parts.push(h('div', { class: 'card flat section' },
        h('p', { class: 'small' }, ui.t('Ждут разбора: {}. ', status.pending), ui.raw(status.why)),
        h('p', { class: 'small muted' }, 'Пока они разложены простыми правилами и помечены «не разобрано».')));
    }
    box.replaceChildren(...parts);
    box.hidden = !parts.length;
  }

  // ---- tabs ------------------------------------------------------------------------------------------

  let showTab = null;

  function paintCounts() {
    document.querySelectorAll('#tabs .chip').forEach((chip) => {
      const id = chip.dataset.id;
      const old = chip.querySelector('.badge');
      if (old) old.remove();
      const n = id === 'important' ? view.counts.important : 0;
      if (n > 0) chip.appendChild(h('span', { class: 'badge' }, String(n)));
    });
  }

  function onTab(id) {
    if (view.booting) return;
    view.tab = id;
    const settings = id === 'settings';
    $('feedView').hidden = settings;
    $('sortNow').hidden = settings;
    if (settings) {
      renderSettings();
      return;
    }
    loadFeed();
  }

  // ---- the list --------------------------------------------------------------------------------------

  let feedTimer = null;

  function scheduleFeed() {
    clearTimeout(feedTimer);
    feedTimer = setTimeout(loadFeed, 400);
  }

  async function loadFeed(opened) {
    if (view.tab === 'settings') return;
    let result;
    try {
      result = await call('feed', view.tab, Boolean(opened));
    } catch (error) {
      $('list').replaceChildren(h('div', { class: 'empty' }, ui.t('Не удалось загрузить ленту: {}', errorText(error))));
      return;
    }
    view.counts = result.counts;
    paintCounts();
    renderBanner(result.status);
    renderList(result.cards, result.status);
  }

  function emptyText(status) {
    if (status && !status.notices) return 'Здесь появятся сообщения, когда Входящие получат доступ к уведомлениям.';
    if (view.tab === 'important') return 'Важного нет. Остальное — во вкладках «Подождёт» и «Шум».';
    if (view.tab === 'later') return 'Здесь пусто: всё прочитано.';
    if (view.tab === 'noise') return 'Шума нет.';
    return 'Сообщений пока нет. Они появятся, когда мессенджеры пришлют уведомления.';
  }

  function preview(card) {
    const p = card.preview;
    const box = h('span', { class: 'preview' });
    if (card.digest && card.unread > 1) {
      box.appendChild(ui.raw(card.digest));
      return box;
    }
    if (!p) return box;
    if (card.isGroup && p.sender) box.appendChild(h('span', { class: 'who' }, ui.raw(p.sender + ': ')));
    if (p.hidden) box.appendChild(h('span', { class: 'hidden-text' }, 'Текст скрыт приложением'));
    else if (p.otp) box.appendChild(h('span', { class: 'hidden-text' }, 'Код подтверждения'));
    else box.appendChild(ui.raw(p.text));
    return box;
  }

  function renderList(cards, status) {
    const list = $('list');
    $('readAll').hidden = !cards.some((card) => card.fresh) || view.tab === 'all';
    if (!cards.length) {
      list.replaceChildren(h('div', { class: 'empty' }, emptyText(status)));
      return;
    }
    list.replaceChildren(...cards.map((card) => {
      const node = h('button', {
        class: 'conv b-' + card.bucket + (card.fresh ? '' : ' read') + (card.id === view.chatId ? ' on' : ''),
        'data-id': card.id
      },
      appIcon(card.icon),
      h('span', { class: 'body grow' },
        h('span', { class: 'top' },
          h('span', { class: 'name', 'data-raw': '' }, card.title),
          h('span', { class: 'time' }, shortTime(card.time))),
        preview(card)),
      h('span', { class: 'side' },
        card.unread ? h('span', { class: 'count' }, String(card.unread)) : null,
        card.fresh ? h('span', { class: 'bmark' }, BUCKET[card.bucket] || '') : null,
        card.override === 'important' ? h('span', { class: 'bmark' }, 'всегда') : null));
      pressable(node, () => openChat(card.id), () => cardMenu(card));
      return node;
    }));
  }

  /** A tap opens, a long press (or the context menu) shows the menu. */
  function pressable(node, tap, hold) {
    let timer = null;
    let held = false;
    node.addEventListener('pointerdown', () => {
      held = false;
      clearTimeout(timer);
      timer = setTimeout(() => {
        held = true;
        if (navigator.vibrate) navigator.vibrate(20);
        hold();
      }, 520);
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach((name) => node.addEventListener(name, () => clearTimeout(timer)));
    node.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      if (!held) {
        held = true;
        hold();
      }
    });
    node.addEventListener('click', (event) => {
      if (held) {
        event.preventDefault();
        held = false;
        return;
      }
      tap();
    });
  }

  function cardMenu(card) {
    let close = null;
    const act = (fn) => async () => {
      close();
      try {
        await fn();
      } catch (error) {
        ui.toast(errorText(error));
      }
      loadFeed();
      if (view.chatId === card.id) loadChat(card.id, false);
    };
    const items = [
      card.override !== 'important' && h('button', { class: 'btn', onclick: act(() => call('setOverride', card.id, 'important')) }, ui.icon('star'), 'Всегда важно'),
      card.override !== 'noise' && h('button', { class: 'btn', onclick: act(() => call('setOverride', card.id, 'noise')) }, ui.icon('mute'), 'Всегда шум'),
      h('button', { class: 'btn', onclick: act(async () => {
        if (!(await ui.confirm(ui.t('Больше не собирать «{}»? Его сообщения пропадут из ленты.', card.title), 'Не собирать', true))) return;
        await call('setOverride', card.id, 'off');
        if (view.chatId === card.id) closeChat();
      }) }, ui.icon('close'), 'Не собирать этот чат'),
      card.fresh && h('button', { class: 'btn', onclick: act(() => call('markRead', card.id)) }, ui.icon('check'), 'Прочитано'),
      card.override && h('button', { class: 'btn', onclick: act(() => call('setOverride', card.id, '')) }, ui.icon('undo'), 'Как обычно'),
      h('button', { class: 'btn', onclick: act(() => call('openApp', card.id)) }, ui.icon('link'), ui.t('Открыть в {}', card.app || 'мессенджере'))
    ];
    close = ui.sheet([h('h3', { 'data-raw': '' }, card.title), h('div', { class: 'menu' }, items)]);
  }

  // ---- one conversation --------------------------------------------------------------------------

  function renderPlaceholder() {
    if (view.chatId || !wide.matches) return;
    $('chatPane').replaceChildren(h('div', { class: 'placeholder' }, 'Выберите беседу слева — здесь будут сообщения и ответ.'));
  }

  async function openChat(id) {
    const first = view.chatId !== id;
    view.chatId = id;
    view.draftId = null;
    if (!wide.matches && !view.pushed) {
      history.pushState({ chat: id }, '');
      view.pushed = true;
    }
    layout();
    document.querySelectorAll('.conv').forEach((node) => node.classList.toggle('on', node.dataset.id === id));
    try {
      sessionStorage.setItem('inbox.chat', id);
    } catch (error) { /* private mode */ }
    await loadChat(id, true, first);
    loadFeed();
  }

  function closeChat() {
    view.chatId = null;
    view.chat = null;
    try {
      sessionStorage.removeItem('inbox.chat');
    } catch (error) { /* private mode */ }
    layout();
    $('chatPane').replaceChildren();
    renderPlaceholder();
    loadFeed();
  }

  window.addEventListener('popstate', () => {
    view.pushed = false;
    if (view.chatId && !wide.matches) closeChat();
  });

  $('back').onclick = () => {
    if (view.chatId && !wide.matches) {
      if (view.pushed) history.back();
      else closeChat();
      return;
    }
    axiko.back();
  };

  async function loadChat(id, markRead, scrollDown) {
    let data;
    try {
      data = await call(markRead ? 'open' : 'chat', id);
    } catch (error) {
      $('chatPane').replaceChildren(h('div', { class: 'empty' }, errorText(error)));
      return;
    }
    if (view.chatId !== id) return;
    const keep = $('reply') ? $('reply').value : '';
    view.chat = data;
    renderChat(data, keep);
    if (scrollDown !== false) scrollToEnd();
  }

  function scrollToEnd() {
    const box = document.querySelector('.msgs');
    if (!box) return;
    if (wide.matches) box.scrollTop = box.scrollHeight;
    else {
      const compose = document.querySelector('.compose') || box.lastElementChild;
      if (compose) compose.scrollIntoView({ block: 'end' });
    }
  }

  function message(m) {
    const node = h('div', { class: 'msg ' + (m.own ? 'own' : 'b-' + m.bucket) });
    const showName = m.own || (view.chat && view.chat.chat.isGroup);
    node.appendChild(h('div', { class: 'msg-head' },
      showName ? h('span', { class: 'who', 'data-raw': m.own ? null : '' }, m.own ? 'Вы' : m.sender || '') : null,
      h('span', {}, shortTime(m.time)),
      m.edited ? h('span', {}, 'изменено') : null));
    if (!m.own && (m.hidden || m.bucket === 'hidden')) node.appendChild(h('div', { class: 'msg-text hidden-text' }, 'Текст скрыт приложением'));
    else node.appendChild(h('div', { class: 'msg-text', 'data-raw': '' }, m.text));
    if (!m.own && (m.reason || m.triagedBy === 'none')) {
      const note = m.triagedBy === 'none' ? 'не разобрано' : m.reason;
      node.appendChild(h('div', { class: 'msg-note' }, m.bucket === 'otp' ? 'код подтверждения, сотрётся сам' : ui.raw((BUCKET[m.bucket] ? ui.t(BUCKET[m.bucket]) + ' · ' : '') + note)));
    }
    return node;
  }

  function renderChat(data, keepText) {
    const chat = data.chat;
    const pane = $('chatPane');
    const head = h('div', { class: 'chat-head' },
      appIcon(chat.icon, 32),
      h('div', { class: 'titles' },
        h('h2', { 'data-raw': '' }, chat.title),
        h('div', { class: 'sub' }, ui.raw(chat.app + (chat.isGroup ? ' · ' + ui.t('группа') : '')))),
      h('button', { class: 'icon-btn', 'aria-label': 'Ещё', onclick: () => cardMenu({ id: chat.id, title: chat.title, app: chat.app, override: chat.override, fresh: false }) }, ui.icon('more')));

    const parts = [head];
    if (chat.isGroup) {
      const digestBox = h('div', { class: 'digest' },
        h('span', { class: 'label' }, 'Выжимка'),
        chat.digest ? h('div', { 'data-raw': '' }, chat.digest) : h('div', { class: 'muted' }, 'Пока нет: она появится, когда сообщений станет много или вы откроете ленту.'));
      if (data.model) {
        digestBox.appendChild(h('div', {}, h('button', { class: 'btn small soft', onclick: async (event) => {
          event.target.disabled = true;
          try {
            const result = await call('digestNow', chat.id);
            if (!result || !result.ok) ui.toast(result && result.why ? result.why : ui.t('Не получилось'));
          } catch (error) {
            ui.toast(errorText(error));
          }
          loadChat(chat.id, false, false);
        } }, ui.icon('spark'), 'Пересказать')));
      }
      parts.push(digestBox);
    }

    const msgs = h('div', { class: 'msgs' });
    let lastDay = '';
    data.messages.forEach((m) => {
      const day = new Date(m.time).toDateString();
      if (day !== lastDay) {
        msgs.appendChild(h('div', { class: 'day-sep' }, dayTitle(m.time)));
        lastDay = day;
      }
      msgs.appendChild(message(m));
    });
    if (!data.messages.length) msgs.appendChild(h('div', { class: 'empty' }, 'Сообщений нет.'));
    parts.push(msgs);
    parts.push(data.canReply ? compose(data, keepText) : gone(data));
    pane.replaceChildren(h('div', { class: 'chat' }, parts));
  }

  function gone(data) {
    const box = h('div', { class: 'gone card flat' },
      h('p', { class: 'small' }, 'Ответить отсюда нельзя: уведомление уже убрано.'),
      h('button', { class: 'btn soft wide', onclick: () => openInApp(data.chat) }, ui.icon('link'), ui.t('Открыть в {}', data.chat.app)));
    if (data.drafts.length) {
      box.appendChild(h('p', { class: 'small muted' }, 'Черновики можно скопировать и вставить в мессенджере:'));
      box.appendChild(h('div', { class: 'chips' }, data.drafts.map((draft) => h('button', { class: 'chip', onclick: async () => {
        try {
          await call('copy', draft.text);
          ui.toast(ui.t('Скопировано'));
        } catch (error) {
          ui.toast(errorText(error));
        }
      } }, ui.icon('copy'), ui.raw(draft.text)))));
    }
    return box;
  }

  async function openInApp(chat) {
    try {
      const how = await call('openApp', chat.id);
      if (!how) ui.toast(ui.t('Не удалось открыть {}', chat.app));
    } catch (error) {
      ui.toast(errorText(error));
    }
  }

  function compose(data, keepText) {
    const area = h('textarea', { class: 'input', id: 'reply', rows: 3, placeholder: 'Ответ' });
    area.value = keepText || '';
    const drafts = h('div', { class: 'chips', id: 'drafts' });
    const why = h('div', { class: 'why', hidden: true });

    function chips(list, quick) {
      const items = list.map((draft) => {
        const chip = h('button', { class: 'chip draft', onclick: () => {
          area.value = draft.text;
          view.draftId = draft.id;
          drafts.querySelectorAll('.chip').forEach((node) => node.classList.toggle('on', node === chip));
          area.focus();
        } }, ui.raw(draft.text));
        return chip;
      });
      const asking = h('button', { class: 'chip', onclick: suggest }, ui.icon('spark'), data.drafts.length || list.length ? 'Ещё варианты' : 'Предложить ответ');
      if (!data.model) asking.hidden = true;
      const quicks = (quick || []).map((text) => h('button', { class: 'chip', onclick: () => {
        area.value = text;
        view.draftId = null;
        area.focus();
      } }, ui.raw(text)));
      drafts.replaceChildren(...items, asking, ...quicks);
    }

    async function suggest() {
      drafts.replaceChildren(h('span', { class: 'chip' }, h('span', { class: 'spinner' }), 'Думаю…'));
      why.hidden = true;
      let result;
      try {
        result = await call('suggest', data.chat.id);
      } catch (error) {
        result = { drafts: [], quick: data.quick, why: errorText(error) };
      }
      data.drafts = result.drafts || [];
      chips(data.drafts, result.quick || data.quick);
      if (result.why) {
        why.replaceChildren(ui.raw(result.why));
        why.hidden = false;
      }
    }

    chips(data.drafts, data.quick);
    if (!data.model && data.modelWhy) {
      why.replaceChildren(ui.raw(data.modelWhy));
      why.hidden = false;
    }

    const mic = h('button', { class: 'icon-btn', 'aria-label': 'Надиктовать', onclick: async () => {
      if (mic.classList.contains('listening')) {
        axiko.native('speech.stopListening').catch(() => null);
        return;
      }
      mic.classList.add('listening');
      try {
        const said = await axiko.native('speech.listen', 30);
        if (said) {
          area.value = (area.value ? area.value.trim() + ' ' : '') + said;
          view.draftId = view.draftId || null;
        }
      } catch (error) {
        ui.toast(errorText(error));
      }
      mic.classList.remove('listening');
    } }, ui.icon('mic'));

    const send = h('button', { class: 'btn primary', id: 'send', onclick: async () => {
      const text = area.value.trim();
      if (!text) {
        area.focus();
        return;
      }
      send.disabled = true;
      let result;
      try {
        result = await call('send', data.chat.id, text, view.draftId);
      } catch (error) {
        result = { ok: false, why: errorText(error) };
      }
      send.disabled = false;
      if (result.ok) {
        area.value = '';
        view.draftId = null;
        ui.toast(ui.t('Отправлено'));
        loadChat(data.chat.id, false);
        loadFeed();
        return;
      }
      ui.toast(result.why || ui.t('Не отправлено'));
      if (result.gone) loadChat(data.chat.id, false, false);
    } }, ui.icon('send'), 'Отправить');

    return h('div', { class: 'compose' }, drafts, why, area, h('div', { class: 'bar' }, mic, h('span', { class: 'grow' }), send));
  }

  // ---- settings ----------------------------------------------------------------------------------

  const LABELS = {
    digestThreshold: 'Выжимка группы после стольких новых',
    digestHours: '…или через столько часов без открытия',
    digestRecount: 'Пересказывать заново после стольких новых',
    digestMessages: 'Сообщений в просьбе о выжимке',
    keepDays: 'Держать сообщения, дней',
    otpKeepMin: 'Держать коды подтверждения, минут',
    draftKeepDays: 'Держать черновики, дней',
    draftCount: 'Вариантов черновика',
    draftContext: 'Сообщений беседы для черновика',
    memoryHits: 'Фактов из памяти для черновика',
    repeatEveryMin: 'Повторять о беседе не чаще, минут',
    batchDelaySec: 'Задержка разбора, секунд',
    batchSize: 'Сообщений в одной просьбе о разборе',
    lineChars: 'Длина сообщения для модели, знаков',
    localBatchSize: 'То же для модели на телефоне: сообщений',
    localLineChars: 'То же для модели на телефоне: знаков',
    retryMin: 'После отказа модели повторить через, минут',
    maxTries: 'Сколько раз переспрашивать модель',
    editWindowSec: 'Правка — если текст сменился за, секунд',
    editSimilarity: 'Похожесть текста для правки, от 0 до 1',
    repeatWindowHours: 'Тот же текст — повтор в пределах, часов',
    groupPrefixes: 'Разных «Имя:» в начале, чтобы считать чат группой',
    widgetLines: 'Бесед в виджете',
    pageSize: 'Сообщений в беседе на экране',
    counterEveryMin: 'Обновлять счётчик дня в общей базе раз в, минут',
    zeroMinMessages: 'Ачивка «Ноль входящих»: пусто в день, когда пришло хотя бы столько сообщений',
    answerMinChats: 'Ачивка «Ответил всем важным»: хотя бы столько бесед с важным'
  };
  const MAIN_NUMBERS = ['digestThreshold', 'digestHours', 'digestRecount', 'keepDays', 'otpKeepMin', 'draftKeepDays', 'draftCount', 'repeatEveryMin', 'batchDelaySec'];
  const MODES = [['auto', 'Авто: на телефоне, если там есть модель, иначе облако'], ['cloud', 'Облачная модель'], ['local', 'Только модель на телефоне'], ['off', 'Не разбирать']];

  async function save(patch) {
    try {
      await call('saveSettings', patch);
      ui.toast(ui.t('Сохранено'));
    } catch (error) {
      ui.toast(errorText(error));
    }
  }

  function switchLine(title, hint, checked, onChange) {
    const input = h('input', { type: 'checkbox', class: 'switch', checked: checked });
    input.onchange = () => onChange(input.checked);
    return h('label', { class: 'line' }, h('span', { class: 'text' }, h('div', {}, title), hint ? h('div', { class: 'hint' }, hint) : null), input);
  }

  function numberField(key, values, numbers) {
    const spec = numbers[key];
    const input = h('input', { class: 'input', type: 'number', inputMode: 'decimal', min: spec.min, max: spec.max, step: spec.max <= 1 ? 0.05 : 'any', value: values[key] });
    input.onchange = () => {
      const value = Number(input.value);
      if (!Number.isFinite(value)) return;
      save({ [key]: value });
    };
    return h('label', { class: 'field' }, h('span', {}, LABELS[key] || key), input);
  }

  function listField(key, title, hint, values, rows) {
    const area = h('textarea', { class: 'input', rows: rows || 3 });
    area.value = (values[key] || []).join('\n');
    area.onchange = () => save({ [key]: area.value.split('\n') });
    return h('label', { class: 'field' }, h('span', {}, title), area, hint ? h('span', { class: 'hint' }, hint) : null);
  }

  async function renderSettings() {
    const box = $('settingsView');
    box.replaceChildren(h('div', { class: 'empty' }, h('span', { class: 'spinner' })));
    let data;
    let status;
    try {
      [data, status] = await Promise.all([call('settings'), call('status')]);
    } catch (error) {
      box.replaceChildren(h('div', { class: 'empty' }, errorText(error)));
      return;
    }
    const v = data.values;
    const sections = [];

    if (!status.notices) {
      sections.push(h('div', { class: 'card danger section' },
        h('p', {}, 'Доступ к уведомлениям выключен — Входящим нечего собирать.'),
        h('div', {}, h('button', { class: 'btn', onclick: () => axiko.native('sense.open', 'notices') }, 'Включить доступ'))));
    }

    // Apps
    const apps = h('div', { class: 'list' }, data.apps.length ? data.apps.map((app) => {
      const input = h('input', { type: 'checkbox', class: 'switch', checked: app.on });
      input.onchange = () => {
        const chosen = data.apps.filter((item) => (item === app ? input.checked : item.on)).map((item) => item.package);
        app.on = input.checked;
        save({ apps: chosen });
      };
      return h('label', { class: 'app-row' }, app.icon ? h('img', { src: app.icon, alt: '' }) : h('span', { class: 'app-ic' }, ui.icon('message')),
        h('span', { class: 'grow' }, h('div', { 'data-raw': '' }, app.app), h('div', { class: 'hint mono' }, app.package)), input);
    }) : h('div', { class: 'empty' }, 'Мессенджеров пока не видно: они появятся здесь, когда пришлют уведомление.'));
    sections.push(h('section', { class: 'section' }, h('h2', {}, 'Какие приложения собирать'), apps,
      v.apps ? h('div', {}, h('button', { class: 'btn small', onclick: async () => {
        await save({ apps: null });
        renderSettings();
      } }, 'Как по умолчанию: найденные мессенджеры')) : null));

    // Where to sort
    const mode = h('select', { class: 'input' }, MODES.map(([id, title]) => h('option', { value: id, selected: v.triageMode === id }, title)));
    mode.onchange = async () => {
      await save({ triageMode: mode.value });
      renderSettings();
    };
    const roleLines = [['triage', 'Разбор'], ['digest', 'Выжимки'], ['draft', 'Черновики']].map(([id, title]) => {
      const role = data.roles[id] || {};
      const what = role.error ? role.error : (role.model || '—') + (role.local ? ui.t(' (на телефоне)') : ui.t(' (облако)'));
      return h('div', { class: 'hint' }, ui.t(title), ': ', ui.raw(what));
    });
    sections.push(h('section', { class: 'section' }, h('h2', {}, 'Где разбирать'),
      h('label', { class: 'field' }, h('span', {}, 'Кому отдавать тексты сообщений'), mode),
      h('div', { class: 'card flat section' }, roleLines,
        h('div', { class: 'hint' }, 'Модель для каждой роли выбирается в настройках Axiko, раздел моделей.'),
        status.why ? h('div', { class: 'hint' }, ui.raw(status.why)) : null),
      switchLine('Без модели раскладывать простыми правилами', 'Иначе всё новое ждёт в «Подождёт» с пометкой «не разобрано»', v.heuristics, (on) => save({ heuristics: on }))));

    // About the owner and rules
    const names = h('input', { class: 'input', value: v.names.join(', '), placeholder: 'Илья, Илюха, @ilya' });
    names.onchange = () => save({ names: names.value.split(',') });
    sections.push(h('section', { class: 'section' }, h('h2', {}, 'Правила'),
      h('label', { class: 'field' }, h('span', {}, 'Как вас зовут в чатах (через запятую)'), names,
        h('span', { class: 'hint' }, 'Сообщение, где вас упомянули, — всегда «Важно».')),
      listField('alwaysImportant', 'Люди «всегда важно» — по одному в строке', '', v),
      listField('alwaysNoise', 'Чаты «всегда шум» — по одному в строке', 'Правило для одной беседы проще поставить долгим нажатием на неё в ленте.', v)));

    // Drafts
    const tone = h('textarea', { class: 'input', rows: 2, placeholder: 'на ты, коротко, без смайликов' });
    tone.value = v.tone;
    tone.onchange = () => save({ tone: tone.value });
    sections.push(h('section', { class: 'section' }, h('h2', {}, 'Ответы'),
      h('label', { class: 'field' }, h('span', {}, 'Тон ответов'), tone),
      switchLine('Готовить черновики сами для «Важно»', 'Иначе — только по кнопке «Предложить ответ»', v.autoDrafts, (on) => save({ autoDrafts: on })),
      listField('quickReplies', 'Быстрые ответы — по одному в строке', 'Они есть всегда, даже без модели.', v, 4),
      switchLine('Повторять важное своим уведомлением в «не беспокоить»', 'Чтобы срочное не потерялось, пока телефон молчит', v.repeatImportant, (on) => save({ repeatImportant: on }))));

    // Numbers
    sections.push(h('section', { class: 'section' }, h('h2', {}, 'Числа'),
      h('div', { class: 'grid' }, MAIN_NUMBERS.map((key) => numberField(key, v, data.numbers)))));
    const rest = Object.keys(data.numbers).filter((key) => MAIN_NUMBERS.indexOf(key) < 0);
    const cleanAt = h('input', { class: 'input', type: 'time', value: v.cleanAt });
    cleanAt.onchange = () => save({ cleanAt: cleanAt.value });
    const answerBy = h('input', { class: 'input', type: 'time', value: v.answerBy });
    answerBy.onchange = () => save({ answerBy: answerBy.value });
    sections.push(h('details', { class: 'more section' }, h('summary', {}, 'Остальные настройки'),
      h('div', { class: 'grid' }, rest.map((key) => numberField(key, v, data.numbers)),
        h('label', { class: 'field' }, h('span', {}, 'Ночная уборка в'), cleanAt),
        h('label', { class: 'field' }, h('span', {}, 'Ачивка «Ответил всем важным»: ответить до'), answerBy))));

    // Diagnostics
    const features = status.features && status.features.length ? status.features.join(', ') : ui.t('нет');
    sections.push(h('section', { class: 'section' }, h('h2', {}, 'Состояние'),
      h('div', { class: 'card flat section' },
        h('div', { class: 'hint' }, ui.t('Ждут разбора моделью: {}', status.pending)),
        h('div', { class: 'hint' }, ui.t('Правки оболочки: '), ui.raw(features)),
        h('div', { class: 'hint' }, status.full ? 'Уведомления читаются полностью (каждое сообщение беседы).' : 'Оболочка пока передаёт только заголовок и текст: промежуточные сообщения читаются из самой службы уведомлений, где получится.'),
        h('div', {}, h('button', { class: 'btn small', onclick: sortNow }, ui.icon('refresh'), 'Разобрать сейчас')))));

    box.replaceChildren(h('div', { class: 'settings' }, sections));
  }

  // ---- buttons and events --------------------------------------------------------------------------

  async function sortNow() {
    ui.toast(ui.t('Разбираю…'));
    try {
      const result = await call('triageNow');
      if (result.busy) ui.toast(ui.t('Разбор уже идёт'));
      else if (result.why) ui.toast(result.why);
      else ui.toast(result.left ? ui.t('Разобрано: {}, осталось: {}', result.sorted, result.left) : ui.t('Всё разобрано'));
    } catch (error) {
      ui.toast(errorText(error));
    }
    loadFeed();
  }

  $('sortNow').onclick = sortNow;
  $('readAll').onclick = async () => {
    const tab = view.tab || 'later';
    const n = await call('markAllRead', tab).catch(() => 0);
    ui.toast(ui.t('Прочитано бесед: {}', n));
    loadFeed();
  };

  let chatTimer = null;
  axiko.on('inbox.feed', (event) => {
    if (view.tab === 'settings') return;
    scheduleFeed();
    if (view.chatId && event && (event.chatId === view.chatId || !event.chatId)) {
      clearTimeout(chatTimer);
      chatTimer = setTimeout(() => {
        const near = (() => {
          const box = document.querySelector('.msgs');
          if (!box || !wide.matches) return true;
          return box.scrollHeight - box.scrollTop - box.clientHeight < 80;
        })();
        loadChat(view.chatId, event && event.type === 'message', near);
      }, 300);
    }
  });

  // ---- start ------------------------------------------------------------------------------------------

  async function boot() {
    layout();
    showTab = ui.tabs($('tabs'), TABS, onTab);
    const params = new URLSearchParams(location.search);
    let first = null;
    try {
      first = await call('feed', null, true);
    } catch (error) {
      first = null;
    }
    view.booting = false;
    let tab = params.get('tab');
    if (!tab || !TABS.some((item) => item[0] === tab)) tab = first ? first.tab : 'later';
    showTab(tab);
    let chat = params.get('chat');
    if (!chat) {
      try {
        chat = wide.matches ? sessionStorage.getItem('inbox.chat') : null;
      } catch (error) {
        chat = null;
      }
    }
    if (chat && tab !== 'settings') openChat(chat);
    else renderPlaceholder();
  }

  boot();
})();
