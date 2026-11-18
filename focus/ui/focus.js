// The Focus screen. Logic lives in the engine (modules/focus/main.js); this page shows the start,
// the countdown ring, the summary after a session, the history and the settings. Texts written by
// other people (messages, chat names) and by the owner (tasks) go in through ui.raw.
(function () {
  const MAIN = 'modules/focus/main.js';
  const INBOX_SCREEN = 'modules/inbox/ui/index.html';
  const RECORDER_ITEM = 'modules/recorder/ui/item.html';
  const h = ui.h;
  const call = (fn, ...args) => axiko.call(MAIN, fn, ...args);
  const $ = (id) => document.getElementById(id);
  const TABS = [['now', 'Фокус'], ['history', 'История'], ['settings', 'Настройки']];
  const wide = window.matchMedia('(min-width: 600px)');
  const segments = window.matchMedia('(vertical-viewport-segments: 2)');
  const RING = 2 * Math.PI * 46;

  const view = {
    tab: 'now',
    status: null,
    minutes: null,
    custom: false,
    task: '',
    dnd: null,
    block: null,
    cycles: null,
    summaryId: null,
    deadline: 0,
    tick: null,
    countTimer: null,
    starting: false
  };

  // ---- small helpers ----------------------------------------------------------------------------

  function pad(n) {
    return (n < 10 ? '0' : '') + n;
  }

  function clockOf(time) {
    const date = new Date(time);
    return pad(date.getHours()) + ':' + pad(date.getMinutes());
  }

  function countdown(ms) {
    const seconds = Math.max(0, Math.ceil(ms / 1000));
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const rest = seconds % 60;
    return (hours ? hours + ':' + pad(minutes) : String(minutes)) + ':' + pad(rest);
  }

  function plural(n, one, few, many) {
    const a = Math.abs(n) % 100;
    const b = a % 10;
    if (a > 10 && a < 20) return many;
    if (b === 1) return one;
    if (b >= 2 && b <= 4) return few;
    return many;
  }

  function duration(minutes) {
    const m = Math.max(0, Math.round(minutes || 0));
    if (m < 60) return ui.t('{} мин', m);
    const rest = m % 60;
    return rest ? ui.t('{} ч {} мин', Math.floor(m / 60), rest) : ui.t('{} ч', Math.floor(m / 60));
  }

  function errorText(error) {
    return String(error && error.message ? error.message : error).replace(/^Error:\s*/, '');
  }

  function dayLabel(time) {
    const date = new Date(time);
    const now = new Date();
    if (date.toDateString() === now.toDateString()) return ui.t('сегодня, {}', clockOf(time));
    if (date.toDateString() === new Date(Date.now() - 864e5).toDateString()) return ui.t('вчера, {}', clockOf(time));
    return pad(date.getDate()) + '.' + pad(date.getMonth() + 1) + ', ' + clockOf(time);
  }

  function switchLine(title, hint, checked, onChange, disabled) {
    const input = h('input', { type: 'checkbox', class: 'switch', checked: checked, disabled: Boolean(disabled) });
    input.onchange = () => onChange(input.checked);
    return h('label', { class: 'line' + (disabled ? ' off' : '') },
      h('span', { class: 'text' }, h('div', {}, title), hint ? h('div', { class: 'hint' }, hint) : null), input);
  }

  // ---- layout: folded, unfolded, half-open on the table -------------------------------------------

  function layout() {
    const page = $('page');
    let tabletop = segments.matches;
    try {
      // Device Posture API: "folded" — half-open (Flex mode on a Fold).
      if (navigator.devicePosture && navigator.devicePosture.type === 'folded' && window.innerWidth > window.innerHeight) tabletop = true;
    } catch (error) { /* no posture API */ }
    page.classList.toggle('wide', wide.matches);
    page.classList.toggle('narrow', !wide.matches);
    page.classList.toggle('tabletop', tabletop);
  }

  wide.addEventListener('change', layout);
  segments.addEventListener('change', layout);
  window.addEventListener('resize', layout);
  try {
    if (navigator.devicePosture) navigator.devicePosture.addEventListener('change', layout);
  } catch (error) { /* no posture API */ }

  // ---- the "now" tab ----------------------------------------------------------------------------

  async function loadNow() {
    let status;
    try {
      status = await call('status');
    } catch (error) {
      $('nowView').replaceChildren(h('div', { class: 'empty' }, errorText(error)));
      return;
    }
    view.status = status;
    $('page').classList.toggle('running', Boolean(status.running));
    if (status.running) {
      view.summaryId = null;
      renderRunning(status);
    } else if (view.summaryId) {
      renderSummary(view.summaryId);
    } else {
      renderSetup(status);
    }
  }

  function stopTimers() {
    clearInterval(view.tick);
    clearInterval(view.countTimer);
    view.tick = null;
    view.countTimer = null;
  }

  // Before the start --------------------------------------------------------------------------------

  function renderSetup(status) {
    stopTimers();
    const s = status.settings;
    if (view.minutes === null) view.minutes = s.cycles ? s.workMin : s.durations[0];
    if (view.dnd === null) view.dnd = s.dnd;
    if (view.block === null) view.block = s.block && s.distractApps > 0;
    if (view.cycles === null) view.cycles = s.cycles;
    const parts = [];

    if (status.next) {
      const next = status.next;
      parts.push(h('div', { class: 'card accent section' },
        h('div', { class: 'row' }, ui.icon('clock'), h('div', { class: 'grow' },
          h('div', { class: 'strong' }, ui.t('Перерыв окончен — цикл {} из {}', next.cycle, next.cycles)),
          next.task ? h('div', { class: 'hint', 'data-raw': '' }, next.task) : null)),
        h('div', { class: 'actions' },
          h('button', { class: 'btn primary', onclick: () => act('next') }, ui.icon('play'), 'Начать работу'),
          h('button', { class: 'btn', onclick: () => act('stopCycles') }, 'Закончить циклы'))));
    }

    // Duration
    const chips = s.durations.map((minutes) => h('button', {
      class: 'chip big' + (!view.custom && view.minutes === minutes ? ' on' : ''),
      onclick: () => { view.custom = false; view.minutes = minutes; renderSetup(status); }
    }, ui.t('{} мин', minutes)));
    chips.push(h('button', { class: 'chip big' + (view.custom ? ' on' : ''), onclick: () => { view.custom = true; renderSetup(status); } }, 'Своё'));
    const custom = view.custom ? h('input', {
      class: 'input', type: 'number', inputMode: 'numeric', min: s.minMinutes, max: s.maxMinutes,
      value: view.minutes || '', placeholder: 'Минут', 'aria-label': 'Своя длительность, минут'
    }) : null;
    if (custom) custom.oninput = () => { view.minutes = Number(custom.value) || null; };
    parts.push(h('section', { class: 'section' }, h('h2', {}, view.cycles ? 'Работа в цикле' : 'Сколько'),
      h('div', { class: 'chips' }, chips), custom));

    // Task
    const task = h('input', { class: 'input', value: view.task, placeholder: 'Над чем работаю (необязательно)', maxLength: 120, 'aria-label': 'Над чем работаю' });
    task.oninput = () => { view.task = task.value; };
    const tips = (status.tasks || []).map((item) => {
      const chip = h('button', { class: 'chip', onclick: () => { view.task = item; task.value = item; } });
      chip.appendChild(ui.raw(item));
      return chip;
    });
    parts.push(h('section', { class: 'section' }, task, tips.length ? h('div', { class: 'chips', 'data-raw': '' }, tips) : null));

    // Switches
    const dndHint = !status.canSilence
      ? 'Нет доступа: включите чтение уведомлений или доступ к «не беспокоить» в настройках'
      : status.filter !== 'all' ? '«Не беспокоить» уже включено — Фокус его не тронет' : ui.t('Режим: {}', DND_TITLES[s.dndMode]);
    const blockHint = !s.distractApps
      ? 'Список пуст — добавьте приложения в настройках'
      : !status.screen ? 'Служба специальных возможностей выключена: остановить нельзя, Фокус только посчитает открытия' : ui.t('Приложений в списке: {}', s.distractApps);
    const lines = h('div', { class: 'card flat lines' },
      switchLine('Не беспокоить', dndHint, view.dnd, (on) => { view.dnd = on; }),
      switchLine('Не пускать в отвлекающие приложения', blockHint, view.block, (on) => { view.block = on; }, !s.distractApps),
      switchLine('Циклы', ui.t('{} мин работы, {} отдыха, циклов: {}', s.workMin, s.breakMin, s.cyclesCount), view.cycles, (on) => {
        view.cycles = on;
        if (!view.custom) view.minutes = on ? s.workMin : s.durations[0];
        renderSetup(status);
      }));
    parts.push(lines);
    if (!status.canSilence) {
      parts.push(h('div', { class: 'actions' },
        h('button', { class: 'btn small', onclick: () => call('openAccess', 'notices') }, 'Чтение уведомлений'),
        h('button', { class: 'btn small', onclick: () => call('openAccess', 'policy') }, 'Доступ к «не беспокоить»')));
    }

    parts.push(h('button', { class: 'btn primary wide start', id: 'start', onclick: start, disabled: view.starting }, ui.icon('play'), view.starting ? 'Включаю…' : 'Начать'));

    // Today and the last summary
    const foot = [h('div', { class: 'hint' }, status.todayText)];
    if (status.last) foot.push(h('button', { class: 'btn small', onclick: () => openSummary(status.last) }, ui.icon('history'), 'Сводка последней сессии'));
    if (!status.inbox) foot.push(h('div', { class: 'hint' }, 'Без модуля «Входящие» сводка беднее: только уведомления, пришедшие с запуска приложения.'));
    parts.push(h('div', { class: 'section foot' }, foot));

    $('nowView').replaceChildren(h('div', { class: 'setup' }, parts));
  }

  const DND_TITLES = { priority: 'только важные (исключения телефона)', alarms: 'только будильники', none: 'полная тишина' };

  async function start() {
    const s = view.status.settings;
    const minutes = Number(view.minutes);
    if (!minutes || minutes < s.minMinutes || minutes > s.maxMinutes) {
      ui.toast(ui.t('Длительность — от {} до {} минут', s.minMinutes, s.maxMinutes));
      return;
    }
    view.starting = true;
    renderSetup(view.status);
    try {
      const result = await call('startFocus', { minutes: minutes, task: view.task, dnd: view.dnd, block: view.block, cycles: view.cycles });
      if (!result.ok) ui.toast(result.why);
      else if (result.session.dndError) ui.toast(result.session.dndError);
    } catch (error) {
      ui.toast(errorText(error));
    }
    view.starting = false;
    loadNow();
  }

  async function act(fn, ...args) {
    try {
      const result = await call(fn, ...args);
      if (result && result.ok === false && result.why) ui.toast(result.why);
      return result;
    } catch (error) {
      ui.toast(errorText(error));
      return null;
    } finally {
      loadNow();
    }
  }

  // During a session ------------------------------------------------------------------------------

  function ringSvg() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('class', 'ring-svg');
    svg.setAttribute('aria-hidden', 'true');
    const track = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    track.setAttribute('cx', '50');
    track.setAttribute('cy', '50');
    track.setAttribute('r', '46');
    track.setAttribute('class', 'track');
    const bar = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    bar.setAttribute('cx', '50');
    bar.setAttribute('cy', '50');
    bar.setAttribute('r', '46');
    bar.setAttribute('class', 'bar');
    bar.setAttribute('stroke-dasharray', String(RING));
    svg.appendChild(track);
    svg.appendChild(bar);
    return { svg, bar };
  }

  function renderRunning(status) {
    stopTimers();
    const session = status.session;
    const s = status.settings;
    const isBreak = session.kind === 'break';
    view.deadline = Date.now() + session.left;
    const ring = ringSvg();
    const time = h('div', { class: 'time', id: 'time' }, countdown(session.left));
    const label = h('div', { class: 'ring-label' },
      h('div', { class: 'kind' }, session.paused ? ui.t('Пауза: {}', session.pausedBy === 'call' ? ui.t('звонок') : ui.t('остановлено'))
        : isBreak ? (session.long ? 'Длинный перерыв' : 'Перерыв') : 'Фокус'),
      time,
      h('div', { class: 'until' }, session.paused ? '' : ui.t('до {}', clockOf(session.endAt))));
    const count = h('div', { class: 'count', id: 'count' });
    const ringBox = h('div', { class: 'ring' + (session.paused ? ' paused' : '') + (isBreak ? ' rest' : '') }, ring.svg, label);
    const taskLine = session.task ? h('div', { class: 'task', 'data-raw': '' }, session.task) : null;

    const endBtn = h('button', { class: 'btn wide end', onclick: () => endNow(session, s) }, ui.icon('stop'), isBreak ? 'Закончить перерыв' : 'Закончить');
    const buttons = [];
    if (isBreak) {
      if (session.cycle && !session.long && session.cycle < session.cycles) {
        buttons.push(h('button', { class: 'btn primary', onclick: () => act('next') }, ui.icon('play'), 'Начать работу'));
      }
    } else {
      buttons.push(h('button', { class: 'btn extra', onclick: () => act('extend', s.extendMin) }, ui.icon('plus'), ui.t('{} минут', s.extendMin)));
    }

    const side = [];
    if (session.cycle) side.push(h('div', { class: 'stat' }, h('span', { class: 'hint' }, 'Цикл'), h('b', {}, ui.t('{} из {}', session.cycle, session.cycles))));
    side.push(h('div', { class: 'stat' }, h('span', { class: 'hint' }, 'Сегодня в фокусе'), h('b', {}, duration(status.today.minutes))));
    side.push(h('div', { class: 'stat' }, h('span', { class: 'hint' }, 'Сессий сегодня'), h('b', {}, String(status.today.sessions))));
    if (!isBreak && session.block) side.push(h('div', { class: 'stat' }, h('span', { class: 'hint' }, 'Попыток отвлечься'), h('b', {}, String(session.attempts))));
    if (!isBreak && session.extendedMin) side.push(h('div', { class: 'stat' }, h('span', { class: 'hint' }, 'Продлено'), h('b', {}, ui.t('{} мин', session.extendedMin))));

    const notes = [];
    if (!isBreak && session.dndWanted && !session.dndOk) {
      notes.push(h('div', { class: 'card danger note' }, session.dndError || 'Не удалось включить «не беспокоить» — сообщения будут приходить'));
    } else if (!isBreak && session.dndNote) {
      notes.push(h('div', { class: 'hint' }, session.dndNote));
    } else if (!isBreak && session.dndOk) {
      notes.push(h('div', { class: 'hint' }, ui.icon('moon'), ' «Не беспокоить» включено'));
    }
    if (!isBreak && session.block && session.watch !== 'screen') {
      notes.push(h('div', { class: 'hint' }, 'Служба специальных возможностей выключена: отвлекающие приложения откроются, Фокус их только посчитает.'));
    }

    $('nowView').replaceChildren(h('div', { class: 'run' },
      h('div', { class: 'ring-pane' }, ringBox, taskLine, count),
      h('div', { class: 'controls' }, h('div', { class: 'actions' }, buttons, endBtn)),
      h('div', { class: 'side' }, h('div', { class: 'card flat stats' }, side), notes)));

    const paint = () => {
      const left = session.paused ? session.left : Math.max(0, view.deadline - Date.now());
      time.textContent = countdown(left);
      const share = session.total > 0 ? Math.min(1, left / (session.total * 60000)) : 0;
      ring.bar.setAttribute('stroke-dashoffset', String(RING * (1 - share)));
      if (!session.paused && left <= 0) {
        stopTimers();
        setTimeout(loadNow, 1500);
      }
    };
    paint();
    if (!session.paused) view.tick = setInterval(paint, 1000);

    if (!isBreak && s.showCount) {
      const showCount = (n, source) => {
        count.textContent = n ? ui.t('Пришло {}', n + ' ' + (source === 'notices' ? plural(n, ui.t('уведомление'), ui.t('уведомления'), ui.t('уведомлений'))
          : plural(n, ui.t('сообщение'), ui.t('сообщения'), ui.t('сообщений')))) : ui.t('Пока тихо');
      };
      showCount(session.messages || 0, session.source);
      view.countTimer = setInterval(async () => {
        try {
          const fresh = await call('status');
          if (fresh.session && fresh.session.id === session.id) showCount(fresh.session.messages || 0, fresh.session.source);
        } catch (error) { /* next time */ }
      }, Math.max(5, s.countEverySec) * 1000);
    }
  }

  async function endNow(session, s) {
    if (session.kind === 'work') {
      const now = await call('status').catch(() => null);
      const early = now && now.session ? now.session.early : session.early;
      if (early) {
        const share = Math.round(s.earlyThreshold * 100);
        const text = share === 50 ? ui.t('Прошло меньше половины. Закончить фокус?') : ui.t('Прошло меньше {}% сессии. Закончить фокус?', share);
        if (!(await ui.confirm(text, ui.t('Закончить'), true))) return;
      }
      const result = await act('end', 'owner');
      if (result && result.ok && result.sessionId) openSummary(result.sessionId);
      return;
    }
    act('stopCycles');
  }

  // The summary --------------------------------------------------------------------------------------

  function openSummary(id) {
    view.summaryId = id;
    if (view.tab !== 'now') showTab('now');
    else renderSummary(id);
  }

  async function renderSummary(id) {
    stopTimers();
    let data;
    try {
      data = await call('summary', id);
    } catch (error) {
      data = null;
    }
    if (view.summaryId !== id) return;
    if (!data) {
      view.summaryId = null;
      loadNow();
      return;
    }
    const s = view.status ? view.status.settings : { breakMin: 5 };
    const sum = data.summary;
    const left = [];
    const right = [];

    const head = h('div', { class: 'summary-head' },
      h('div', { class: 'hint' }, dayLabel(data.session.startAt) + (data.session.endedText ? ' · ' + ui.t(data.session.endedText) : '')),
      h('div', { class: 'headline', 'data-raw': '' }, data.headline || ''));
    left.push(head);
    if (data.session.apps && data.session.apps.length) {
      left.push(h('div', { class: 'hint', 'data-raw': '' }, data.session.apps.map((app) => app.app + ' — ' + app.count).join(', ')));
    }
    if (data.watch === 'usage' && data.session.attempts) left.push(h('div', { class: 'hint' }, 'Открытия посчитаны по истории использования: остановить их было нечем.'));

    if (!data.kept) {
      left.push(h('div', { class: 'empty' }, 'Текст этой сводки уже удалён: сводки хранятся ограниченное время.'));
    } else if (!sum || !sum.total) {
      left.push(h('div', { class: 'card flat' }, 'За сессию ничего не пришло.'));
    } else {
      const total = sum.total + ' ' + (sum.source === 'notices' ? plural(sum.total, ui.t('уведомление'), ui.t('уведомления'), ui.t('уведомлений'))
        : plural(sum.total, ui.t('сообщение'), ui.t('сообщения'), ui.t('сообщений')));
      left.push(h('div', { class: 'hint' }, ui.t('Пришло {} в {}', total, sum.chats + ' ' + plural(sum.chats, ui.t('чате'), ui.t('чатах'), ui.t('чатах')))));

      // The rest: the model's lines, or one line per chat
      const rest = [];
      if (data.digest && data.digest.length) {
        rest.push(h('div', { class: 'card flat digest' }, h('div', { class: 'hint' }, ui.icon('spark'), ' Сводка моделью'),
          data.digest.map((line) => h('p', { 'data-raw': '' }, line))));
      }
      if (sum.others.length) {
        rest.push(h('div', { class: 'list' }, sum.others.map((item) => {
          const row = h(item.chatId && data.inbox && sum.source === 'inbox' ? 'button' : 'div', { class: 'other' });
          row.appendChild(h('span', { class: 'grow', 'data-raw': '' }, item.line));
          if (row.tagName === 'BUTTON') {
            row.onclick = () => axiko.open(INBOX_SCREEN + '?chat=' + encodeURIComponent(item.chatId));
            row.appendChild(ui.icon('right'));
          }
          return row;
        })));
      }
      if (sum.more) rest.push(h('div', { class: 'hint' }, ui.t('И ещё бесед: {}', sum.more)));
      if (rest.length) left.push(h('section', { class: 'section' }, h('h3', {}, 'Остальное'), rest));

      if (sum.important.length) {
        right.push(h('section', { class: 'section' }, h('h3', {}, 'Важно'), sum.important.map((item) => importantCard(item, sum.source))));
      }
    }

    if (data.missed && data.missed.length) {
      left.push(h('section', { class: 'section' }, h('h3', {}, 'Пропущенные звонки'),
        h('div', { class: 'list' }, data.missed.map((callItem) => h('div', {},
          ui.icon('phone'), h('span', { class: 'grow', 'data-raw': '' }, callItem.name || callItem.number || ui.t('Номер скрыт')),
          h('span', { class: 'hint' }, clockOf(callItem.time)))))));
    }

    // With the recorder (Диктофон) installed: one button to say how the work went, as a voice note
    // tied to this session; once said, the button opens that note.
    let dictateButton = null;
    if (data.recorder && data.session.recordingId) {
      dictateButton = h('button', { class: 'btn', onclick: () => axiko.open(RECORDER_ITEM + '?id=' + data.session.recordingId) }, ui.icon('mic'), 'Итог голосом');
    } else if (data.recorder) {
      dictateButton = h('button', { class: 'btn', onclick: dictate }, ui.icon('mic'), 'Надиктовать итог');
    }

    const buttons = h('div', { class: 'actions' },
      h('button', { class: 'btn primary', onclick: again }, ui.icon('play'), 'Ещё сессия'),
      dictateButton,
      h('button', { class: 'btn', onclick: () => { view.summaryId = null; act('startBreak', s.breakMin); } }, ui.icon('clock'), ui.t('Перерыв {} минут', s.breakMin)),
      h('button', { class: 'btn', onclick: () => { view.summaryId = null; loadNow(); } }, 'Готово'));

    $('page').classList.remove('running');
    $('nowView').replaceChildren(h('div', { class: 'summary' + (right.length ? ' has-important' : '') },
      h('div', { class: 'summary-main' }, left, buttons),
      right.length ? h('div', { class: 'summary-important' }, right) : null));
    window.scrollTo(0, 0);

    async function dictate() {
      const result = await call('dictate', id).catch((error) => ({ ok: false, why: errorText(error) }));
      if (!result.ok) ui.toast(result.why);
      if (result.screen) axiko.open(result.screen);
    }

    async function again() {
      view.summaryId = null;
      const result = await call('startFocus', { minutes: data.session.plannedMin, task: data.session.task }).catch((error) => ({ ok: false, why: errorText(error) }));
      if (!result.ok) ui.toast(result.why);
      loadNow();
    }
  }

  function importantCard(item, source) {
    const box = h('div', { class: 'card flat important' });
    const who = item.isGroup ? (item.sender ? item.sender + ' · ' + item.chat : item.chat) : (item.chat || item.sender);
    box.appendChild(h('div', { class: 'row' },
      h('span', { class: 'grow strong', 'data-raw': '' }, who),
      h('span', { class: 'hint' }, item.time ? clockOf(item.time) : '')));
    box.appendChild(item.hidden || !item.text ? h('div', { class: 'hint' }, 'Текст скрыт приложением') : h('div', { class: 'msg-text', 'data-raw': '' }, item.text));
    const inboxItem = source === 'inbox';
    const canReply = item.canReply && (inboxItem || item.key);
    const actions = h('div', { class: 'actions' });
    if (canReply) actions.appendChild(h('button', { class: 'btn small soft', onclick: () => { actions.remove(); box.appendChild(compose(item, inboxItem)); } }, ui.icon('send'), 'Ответить'));
    if (inboxItem && view.status && view.status.inbox) {
      actions.appendChild(h('button', { class: 'btn small', onclick: () => axiko.open(INBOX_SCREEN + '?chat=' + encodeURIComponent(item.chatId)) }, ui.icon('message'), 'Открыть беседу'));
    }
    if (!canReply) actions.appendChild(h('div', { class: 'hint' }, 'Ответить отсюда нельзя: уведомление уже убрано'));
    box.appendChild(actions);
    return box;
  }

  function compose(item, inboxItem) {
    const state = { draftId: null };
    const area = h('textarea', { class: 'input', rows: 2, placeholder: 'Ответ', 'aria-label': 'Ответ' });
    const drafts = h('div', { class: 'chips', 'data-raw': '' });
    const fill = (text, draftId) => {
      area.value = text;
      state.draftId = draftId || null;
      area.focus();
    };
    const suggest = h('button', { class: 'btn small', onclick: async () => {
      suggest.disabled = true;
      try {
        const result = await call('suggestReply', item.chatId);
        const list = (result.drafts || []).map((draft) => {
          const chip = h('button', { class: 'chip', onclick: () => fill(draft.text, draft.id) });
          chip.appendChild(ui.raw(draft.text));
          return chip;
        });
        const quick = (result.quick || []).map((text) => {
          const chip = h('button', { class: 'chip', onclick: () => fill(text, null) });
          chip.appendChild(ui.raw(text));
          return chip;
        });
        drafts.replaceChildren(...list, ...quick);
        if (!list.length && result.why) ui.toast(result.why);
      } catch (error) {
        ui.toast(errorText(error));
      }
      suggest.disabled = false;
    } }, ui.icon('spark'), 'Предложить ответ');
    const send = h('button', { class: 'btn small primary', onclick: async () => {
      send.disabled = true;
      const result = await call('reply', { chatId: item.chatId, key: item.key || null, draftId: state.draftId, inbox: inboxItem }, area.value)
        .catch((error) => ({ ok: false, why: errorText(error) }));
      send.disabled = false;
      if (result.ok) {
        ui.toast(ui.t('Отправлено'));
        box.replaceChildren(h('div', { class: 'hint' }, ui.icon('check'), ' Отправлено'));
      } else {
        ui.toast(result.why || ui.t('Не отправилось'));
      }
    } }, ui.icon('send'), 'Отправить');
    const box = h('div', { class: 'compose' }, area, drafts, h('div', { class: 'actions' }, inboxItem ? suggest : null, send));
    return box;
  }

  // ---- the history tab --------------------------------------------------------------------------

  async function renderHistory() {
    const box = $('historyView');
    box.replaceChildren(h('div', { class: 'empty' }, h('span', { class: 'spinner' })));
    let data;
    try {
      data = await call('history');
    } catch (error) {
      box.replaceChildren(h('div', { class: 'empty' }, errorText(error)));
      return;
    }
    const top = Math.max(30, ...data.days.map((day) => day.minutes));
    const bars = h('div', { class: 'bars', role: 'img', 'aria-label': ui.t('Минуты фокуса по дням') }, data.days.map((day) => {
      const height = Math.round((day.minutes / top) * 100);
      return h('div', { class: 'bar-col' + (day.attempts ? ' tempted' : '') },
        h('div', { class: 'bar-value' }, day.minutes ? String(day.minutes) : ''),
        h('div', { class: 'bar-track' }, h('div', { class: 'bar-fill', style: 'height:' + height + '%' })),
        h('div', { class: 'bar-day' }, day.label),
        h('div', { class: 'bar-week' }, ui.t(day.weekday)));
    }));
    const week = data.week;
    const summary = h('div', { class: 'card flat stats' },
      h('div', { class: 'stat' }, h('span', { class: 'hint' }, 'За неделю'), h('b', {}, duration(week.minutes))),
      h('div', { class: 'stat' }, h('span', { class: 'hint' }, 'Сессий'), h('b', {}, String(week.sessions))),
      h('div', { class: 'stat' }, h('span', { class: 'hint' }, 'Тянуло отвлечься'), h('b', {}, String(week.attempts))),
      h('div', { class: 'stat' }, h('span', { class: 'hint' }, 'Дней без попыток'), h('b', {}, String(week.calmDays))));
    const list = data.sessions.length ? h('div', { class: 'list' }, data.sessions.map((row) => {
      const item = h('button', { class: 'session-row', onclick: () => openSummary(row.id) },
        h('span', { class: 'grow' },
          h('div', { 'data-raw': '' }, row.task || ui.t('Без названия')),
          h('div', { class: 'hint' }, dayLabel(row.startAt) + ' · ' + duration(row.actualMin) +
            (row.attempts ? ' · ' + ui.t('попыток: {}', row.attempts) : '') + (row.messages ? ' · ' + ui.t('сообщений: {}', row.messages) : ''))),
        ui.icon('right'));
      return item;
    })) : h('div', { class: 'empty' }, 'Сессий пока не было.');
    box.replaceChildren(h('div', { class: 'history' },
      h('section', { class: 'section' }, h('h2', {}, ui.t('Минуты по дням')), bars, summary),
      h('section', { class: 'section' }, h('h2', {}, 'Сессии'), list)));
  }

  // ---- the settings tab ---------------------------------------------------------------------------

  const LABELS = {
    allowSecondSec: 'Пускать при второй попытке за, секунд',
    breakthroughEveryMin: 'Пробивать от одного человека не чаще, минут',
    workMin: 'Работа, минут',
    breakMin: 'Отдых, минут',
    longBreakMin: 'Длинный отдых, минут',
    cyclesCount: 'Циклов подряд',
    earlyThreshold: 'Спрашивать, если закончить раньше этой доли (0–1)',
    minRecordMin: 'Не записывать в общую базу сессии короче, минут',
    digestMinChats: 'Сводка моделью, если бесед больше',
    digestLines: 'Строк в сводке моделью',
    summaryKeepDays: 'Хранить тексты сводок, дней',
    extendMin: 'Продлевать на, минут',
    minMinutes: 'Самая короткая сессия, минут',
    maxMinutes: 'Самая длинная сессия, минут',
    noticesLimit: 'Без Входящих: смотреть последних уведомлений',
    restoreGraceSec: 'Конец по таймеру, если приложение проснулось в течение, секунд',
    dndWaitMs: 'Ждать переключения «не беспокоить», мс',
    countEverySec: 'Обновлять число пришедших раз в, секунд',
    widgetEveryMin: 'Обновлять виджет во время сессии раз в, минут',
    historyDays: 'Дней в столбиках истории',
    historyList: 'Сессий в списке истории',
    taskSuggestions: 'Подсказок прошлых задач',
    summaryLines: 'Бесед в «Остальном»',
    lineChars: 'Символов о беседе для модели',
    quietDays: 'Ачивка «Неделя без попыток отвлечься»: дней без единой попытки',
    quietMinDays: '…и дней с сессией под замком за это время хотя бы'
  };
  const MAIN_NUMBERS = ['allowSecondSec', 'extendMin', 'earlyThreshold', 'minRecordMin'];
  const CYCLE_NUMBERS = ['workMin', 'breakMin', 'longBreakMin', 'cyclesCount'];
  const CHOICE_TITLES = {
    dndMode: { priority: 'Приоритетные (исключения телефона)', alarms: 'Только будильники', none: 'Полная тишина' },
    strictness: { soft: 'Мягко: только напомнить', home: 'Строго: вернуть на рабочий стол' },
    callAction: { nothing: 'Ничего', pause: 'Поставить на паузу', end: 'Закончить сессию' }
  };

  async function save(patch, again) {
    try {
      await call('saveSettings', patch);
      ui.toast(ui.t('Сохранено'));
    } catch (error) {
      ui.toast(errorText(error));
    }
    if (again) renderSettings();
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

  function choiceField(key, title, values, choices) {
    const select = h('select', { class: 'input' }, choices[key].list.map((id) => h('option', { value: id, selected: values[key] === id }, CHOICE_TITLES[key][id])));
    select.onchange = () => save({ [key]: select.value });
    return h('label', { class: 'field' }, h('span', {}, title), select);
  }

  function textField(key, title, hint, value, rows) {
    const area = h('textarea', { class: 'input', rows: rows || 2 });
    area.value = value;
    area.onchange = () => save({ [key]: area.value });
    return h('label', { class: 'field' }, h('span', {}, title), area, hint ? h('span', { class: 'hint' }, hint) : null);
  }

  async function pickApps(picked) {
    let apps;
    try {
      apps = await call('apps');
    } catch (error) {
      ui.toast(errorText(error));
      return;
    }
    const chosen = new Set(picked);
    const search = h('input', { class: 'input', placeholder: 'Найти приложение', 'aria-label': 'Найти приложение' });
    const list = h('div', { class: 'list picker-list' });
    const draw = () => {
      const q = search.value.trim().toLowerCase();
      list.replaceChildren(...apps.filter((app) => !q || app.app.toLowerCase().includes(q) || app.package.includes(q)).slice(0, 200).map((app) => {
        const input = h('input', { type: 'checkbox', class: 'switch', checked: chosen.has(app.package) });
        input.onchange = () => { if (input.checked) chosen.add(app.package); else chosen.delete(app.package); };
        return h('label', { class: 'app-row' }, h('span', { class: 'grow' }, h('div', { 'data-raw': '' }, app.app), h('div', { class: 'hint mono' }, app.package)), input);
      }));
    };
    search.oninput = draw;
    draw();
    const close = ui.sheet([
      h('h3', {}, 'Отвлекающие приложения'), search, list,
      h('div', { class: 'actions' },
        h('button', { class: 'btn', onclick: () => close() }, 'Отмена'),
        h('button', { class: 'btn primary', onclick: async () => {
          close();
          await save({ distractApps: Array.from(chosen) }, true);
        } }, 'Готово'))
    ]);
  }

  async function renderSettings() {
    const box = $('settingsView');
    box.replaceChildren(h('div', { class: 'empty' }, h('span', { class: 'spinner' })));
    let data;
    try {
      data = await call('settings');
    } catch (error) {
      box.replaceChildren(h('div', { class: 'empty' }, errorText(error)));
      return;
    }
    const v = data.values;
    const sections = [];

    // Durations and silence
    const durations = h('input', { class: 'input', value: v.durations.join(', '), placeholder: '25, 50, 90', inputMode: 'numeric' });
    durations.onchange = () => save({ durations: durations.value });
    const ways = data.ways;
    const wayLines = [
      ['shell', 'Оболочка Axiko (операция «не беспокоить»)'],
      ['listener', 'Служба уведомлений Axiko'],
      ['manager', 'Доступ к режиму «Не беспокоить»'],
      ['shizuku', 'Shizuku']
    ].map(([id, title]) => h('div', { class: 'way' + (ways[id] ? ' yes' : '') }, ui.icon(ways[id] ? 'check' : 'close'), ' ', title));
    sections.push(h('section', { class: 'section' }, h('h2', {}, 'Сессия'),
      h('label', { class: 'field' }, h('span', {}, 'Длительности на фишках, минут'), durations),
      choiceField('dndMode', 'Режим тишины', v, data.choices),
      switchLine('Включать «не беспокоить»', 'Можно выключить и на экране перед стартом', v.dnd, (on) => save({ dnd: on })),
      h('div', { class: 'card flat section' }, h('div', { class: 'hint' }, 'Чем включается «не беспокоить» — по порядку, пока не сработает:'), wayLines,
        h('div', { class: 'actions' },
          !data.notices ? h('button', { class: 'btn small', onclick: () => call('openAccess', 'notices') }, 'Чтение уведомлений') : null,
          !ways.manager ? h('button', { class: 'btn small', onclick: () => call('openAccess', 'policy') }, 'Доступ к «не беспокоить»') : null)),
      switchLine('Пробовать через Shizuku', 'Если остальные способы не сработали', v.shizuku, (on) => save({ shizuku: on }))));

    // Distracting apps
    const picked = h('div', { class: 'list' }, data.picked.length ? data.picked.map((app) => h('div', { class: 'app-row' },
      h('span', { class: 'grow' }, h('div', { 'data-raw': '' }, app.app), h('div', { class: 'hint mono' }, app.package)),
      h('button', { class: 'icon-btn', 'aria-label': 'Убрать', onclick: () => save({ distractApps: v.distractApps.filter((pkg) => pkg !== app.package) }, true) }, ui.icon('close'))))
      : h('div', { class: 'hint' }, 'Список пуст'));
    sections.push(h('section', { class: 'section' }, h('h2', {}, 'Отвлекающие приложения'),
      !data.screen ? h('div', { class: 'card danger' }, h('p', {}, 'Служба специальных возможностей Axiko выключена: без неё приложения не остановить, Фокус только посчитает открытия по истории использования.'),
        h('button', { class: 'btn small', onclick: () => call('openAccess', 'screen') }, 'Включить службу')) : null,
      picked,
      h('div', { class: 'actions' }, h('button', { class: 'btn small', onclick: () => pickApps(v.distractApps) }, ui.icon('plus'), 'Выбрать приложения')),
      choiceField('strictness', 'Строгость', v, data.choices),
      switchLine('Включать блокировку по умолчанию', '', v.block, (on) => save({ block: on })),
      numberField('allowSecondSec', v, data.numbers)));

    // Breaking through, calls
    sections.push(h('section', { class: 'section' }, h('h2', {}, 'Сквозь фокус'),
      switchLine('Пробивать важное', data.inbox ? 'Важное по разбору Входящих от людей из списка — своим уведомлением сквозь тишину' : 'Без Входящих — любое уведомление от людей из списка', v.breakthrough, (on) => save({ breakthrough: on })),
      textField('people', 'Кто может пробиться — по одному в строке', 'Пусто — все важные (со Входящими).', v.people.join('\n'), 3),
      numberField('breakthroughEveryMin', v, data.numbers),
      choiceField('callAction', 'Звонок во время фокуса', v, data.choices)));

    // Cycles
    sections.push(h('section', { class: 'section' }, h('h2', {}, 'Циклы'),
      switchLine('Циклы по умолчанию', 'Работа — отдых — работа…, после последней — длинный отдых', v.cycles, (on) => save({ cycles: on })),
      h('div', { class: 'grid' }, CYCLE_NUMBERS.map((key) => numberField(key, v, data.numbers))),
      switchLine('Следующая работа начинается сама', 'Иначе — по нажатию на уведомление «Перерыв окончен»', v.autoNext, (on) => save({ autoNext: on }))));

    // Summary
    const role = data.role.error ? data.role.error : (data.role.model || '—') + (data.role.local ? ui.t(' (на телефоне)') : ui.t(' (облако)'));
    sections.push(h('section', { class: 'section' }, h('h2', {}, 'Сводка'),
      switchLine('Показывать число пришедших во время сессии', 'Только число, без текстов', v.showCount, (on) => save({ showCount: on })),
      switchLine('Выжимку бесед делает модель', data.inbox ? 'Одна просьба за сессию, когда бесед много' : 'Только со Входящими', v.modelDigest, (on) => save({ modelDigest: on }), !data.inbox),
      h('div', { class: 'hint' }, ui.t('Роль «Фокус: сводка»: '), ui.raw(role)),
      h('div', { class: 'grid' }, ['digestMinChats', 'digestLines'].map((key) => numberField(key, v, data.numbers)))));

    // Numbers
    sections.push(h('section', { class: 'section' }, h('h2', {}, 'Числа'),
      h('div', { class: 'grid' }, MAIN_NUMBERS.filter((key) => key !== 'allowSecondSec').map((key) => numberField(key, v, data.numbers)))));
    const shown = MAIN_NUMBERS.concat(CYCLE_NUMBERS, ['digestMinChats', 'digestLines', 'breakthroughEveryMin']);
    const rest = Object.keys(data.numbers).filter((key) => shown.indexOf(key) < 0);
    const vibrate = h('input', { class: 'input', value: v.vibrate.join(', '), inputMode: 'numeric' });
    vibrate.onchange = () => save({ vibrate: vibrate.value });
    const cleanAt = h('input', { class: 'input', type: 'time', value: v.cleanAt });
    cleanAt.onchange = () => save({ cleanAt: cleanAt.value });
    sections.push(h('details', { class: 'more section' }, h('summary', {}, 'Остальные настройки'),
      h('div', { class: 'grid' }, rest.map((key) => numberField(key, v, data.numbers)),
        h('label', { class: 'field' }, h('span', {}, 'Вибрация в конце: пауза, вибрация, пауза… мс'), vibrate),
        h('label', { class: 'field' }, h('span', {}, 'Уборка старых сводок в'), cleanAt)),
      textField('passing', 'Окна поверх приложений, которые не считаются уходом из него', 'Клавиатура, шторка — по пакету в строке.', v.passing.join('\n'), 3)));

    // State
    const features = data.features && data.features.length ? data.features.join(', ') : ui.t('нет');
    sections.push(h('section', { class: 'section' }, h('h2', {}, 'Состояние'),
      h('div', { class: 'card flat section' },
        h('div', { class: 'hint' }, ui.t('Модуль «Входящие»: {}', data.inbox ? ui.t('стоит') : ui.t('не стоит'))),
        h('div', { class: 'hint' }, ui.t('Правки оболочки: '), ui.raw(features)))));

    box.replaceChildren(h('div', { class: 'settings' }, sections));
  }

  // ---- tabs, events, start --------------------------------------------------------------------------

  let showTab = null;

  function onTab(id) {
    view.tab = id;
    if (id !== 'now') {
      stopTimers();
      $('page').classList.remove('running');
    }
    if (id === 'now') loadNow();
    else if (id === 'history') renderHistory();
    else if (id === 'settings') renderSettings();
  }

  $('back').onclick = () => {
    if (view.tab === 'now' && view.summaryId) {
      view.summaryId = null;
      loadNow();
      return;
    }
    axiko.back();
  };

  let reloadTimer = null;
  function reloadSoon() {
    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(() => { if (view.tab === 'now') loadNow(); }, 250);
  }

  axiko.on('focus.changed', (event) => {
    if (event && event.type === 'settings') return;
    reloadSoon();
  });
  axiko.on('focus.ended', (event) => {
    if (view.tab !== 'now' || !event || !event.sessionId) return;
    view.summaryId = event.sessionId;
    reloadSoon();
  });
  axiko.on('focus.summary', (event) => {
    if (view.tab === 'now' && event && view.summaryId === event.sessionId) renderSummary(event.sessionId);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && view.tab === 'now') loadNow();
  });

  function boot() {
    layout();
    const params = new URLSearchParams(location.search);
    const session = params.get('session');
    if (session) view.summaryId = session;
    showTab = ui.tabs($('tabs'), TABS, onTab);
    if (session && view.tab !== 'now') showTab('now');
  }

  boot();
})();
