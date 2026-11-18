// Рисуй — угадаю — экран: выбор режима, «Я рисую» (холст, догадки модели по ходу), «Axiko рисует»
// (штрихи появляются со скоростью руки, угадывание голосом), итоги, настройки, сравнение моделей.
// Правила отправки, разбор путей, расписание анимации — ../canvas.js; промпт и судья — ../guess.js;
// сравнение слов — ../match.js (общий со Шляпой); всё, что хранится и ходит в модель, — ../main.js.
(function () {
  const MAIN = 'modules/draw-guess/main.js';
  const M = window.ruMatch;
  const C = window.dgConfig;
  const K = window.dgCanvas;
  const G = window.dgGuess;
  const SAMPLES = window.dgSamples;
  const h = ui.h;
  const raw = ui.raw;
  const app = document.getElementById('app');
  const TEST = /[?&]test=1(&|$)/.test(location.search);
  // ?daily=1 — «рисунок дня», заказанный «Игрой дня»: один раунд «Axiko рисует» с отложенным рисунком.
  const DAILY = /[?&]daily=1(&|$)/.test(location.search);
  const MODELS_LINK = 'ui/settings/index.html?tab=models';
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const SOLO = 'Вы';

  const S = {
    settings: C.defaults(),
    features: [],
    roles: null,
    stock: null,
    hat: false,
    themes: C.THEMES,
    mode: loadMode(),
    customOpen: false,
    view: 'home',
    game: null,
    round: null,
    results: null,
    ready: false
  };

  // ---- связь с движком ------------------------------------------------------------------------

  function call(fn, ...args) {
    return axiko.call(MAIN, fn, ...args);
  }

  /** Обработчик, чья ошибка становится понятной подсказкой, а не красной кнопкой «починить». */
  function act(fn) {
    return function (...args) {
      return Promise.resolve().then(() => fn.apply(this, args)).catch((error) => {
        console.error(error);
        ui.toast(error && error.message ? error.message : String(error));
      });
    };
  }

  function quiet(promise) {
    return Promise.resolve(promise).catch((error) => {
      console.warn(error);
      return undefined;
    });
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function loadMode() {
    try {
      return localStorage.getItem('draw-guess.mode') === 'model' ? 'model' : 'human';
    } catch (error) {
      return 'human';
    }
  }

  function saveMode() {
    try {
      localStorage.setItem('draw-guess.mode', S.mode);
    } catch (error) {
      /* приватный режим */
    }
  }

  // ---- мелочи текста ----------------------------------------------------------------------------

  function plural(n, one, few, many) {
    const tens = n % 100;
    const unit = n % 10;
    if (tens >= 11 && tens <= 14) return many;
    if (unit === 1) return one;
    if (unit >= 2 && unit <= 4) return few;
    return many;
  }

  function pointsText(n) {
    return n + ' ' + plural(n, 'очко', 'очка', 'очков');
  }

  function secondsText(ms) {
    const s = ms / 1000;
    return (s < 10 ? String(Math.round(s * 10) / 10).replace('.', ',') : String(Math.round(s))) + ' с';
  }

  function numberText(value) {
    return String(value).replace('.', ',');
  }

  function confText(value) {
    return String(Math.round((value || 0) * 10) / 10).replace('.', ',');
  }

  function money(value) {
    return '$' + value.toFixed(value < 1 ? 3 : 2);
  }

  /** «+7 очков Маше»: дательный падеж имени по окончанию (что не знаем — как есть). */
  function dative(name) {
    const parts = String(name).split(' ');
    const w = parts[0];
    if (w.length < 2 || /[^А-Яа-яЁё]/.test(w)) return name;
    let d = w;
    if (/ия$/i.test(w)) d = w.slice(0, -1) + 'и';
    else if (/[ая]$/i.test(w)) d = w.slice(0, -1) + 'е';
    else if (/[йь]$/i.test(w)) d = w.slice(0, -1) + 'ю';
    else if (/[бвгджзклмнпрстфхцчшщ]$/i.test(w)) d = w + 'у';
    parts[0] = d;
    return parts.join(' ');
  }

  function cleanName(text) {
    const t = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 24);
    return t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
  }

  function themeOf(s) {
    return s.theme || 'общее';
  }

  function levelHint(n) {
    return ['', 'совсем просто: кот, дом, солнце', 'просто', 'посложнее', 'трудно', 'очень трудно'][n] || '';
  }

  // ---- настройки --------------------------------------------------------------------------------

  /** again === false — не перерисовывать главную (стрелки степпера сами меняют число). */
  function setSetting(patch, again) {
    S.settings = C.normalize(Object.assign({}, S.settings, patch));
    if (again !== false && S.view === 'home') renderHome();
    return call('saveSettings', patch).then((next) => {
      S.settings = next;
    }).catch((error) => ui.toast(error.message));
  }

  function schemaItem(key) {
    return C.SCHEMA.find((entry) => entry.key === key);
  }

  function chip(label, on, onclick, id) {
    return h('button', { class: 'chip' + (on ? ' on' : ''), id: id || null, onclick }, label);
  }

  function stepper(key) {
    const item = schemaItem(key);
    const value = h('span', { class: 'value' }, numberText(S.settings[key]));
    const change = (delta) => {
      const next = Math.round(Math.min(item.max, Math.max(item.min, S.settings[key] + delta)) * 1000) / 1000;
      value.textContent = numberText(next);
      setSetting({ [key]: next }, false);
    };
    return h('div', { class: 'stepper' },
      h('button', { class: 'btn small', 'aria-label': 'Меньше', onclick: () => change(-item.step) }, '−'),
      value,
      h('button', { class: 'btn small', 'aria-label': 'Больше', onclick: () => change(item.step) }, '+'));
  }

  function stepperRow(key) {
    const item = schemaItem(key);
    return h('div', { class: 'option' },
      h('div', { class: 'grow' }, item.unit ? item.title + ', ' + item.unit : item.title,
        item.hint ? h('span', { class: 'small muted' }, item.hint) : null),
      stepper(key));
  }

  function settingRow(item) {
    if (typeof item.def === 'boolean') {
      return h('label', { class: 'setting-row' },
        h('div', { class: 'grow' }, item.title, item.hint ? h('span', { class: 'small' }, item.hint) : null),
        h('input', { type: 'checkbox', class: 'switch', checked: !!S.settings[item.key], onchange: (event) => setSetting({ [item.key]: event.target.checked }, false) }));
    }
    return h('div', { class: 'setting-row' },
      h('div', { class: 'grow' }, item.title, item.hint || item.unit ? h('span', { class: 'small' }, [item.unit, item.hint].filter(Boolean).join(' · ')) : null),
      stepper(item.key));
  }

  function sendInterval(s) {
    return S.roles && S.roles.guess && S.roles.guess.local ? s.localInterval : s.minInterval;
  }

  // ---- главная: выбор режима -------------------------------------------------------------------

  function visionReady() {
    return !!(S.roles && S.roles.guess && S.roles.guess.ready && S.roles.guess.vision);
  }

  function roleNotes() {
    const roles = S.roles;
    if (!roles) return null;
    const lines = [];
    const guess = roles.guess;
    if (S.mode === 'human') {
      if (!visionReady()) {
        return h('div', { class: 'card', id: 'vision-warning' },
          h('p', { class: 'warn' }, 'Назначьте роли «Угадывание рисунка» модель, которая понимает картинки'),
          guess.model ? h('p', { class: 'small muted' }, 'Сейчас: ', raw(guess.model), guess.assigned ? '' : ' (основная модель)', ' — без зрения') : null,
          h('button', { class: 'btn', id: 'open-models', onclick: () => axiko.open(MODELS_LINK) }, ui.icon('settings'), 'Модели'));
      }
      if (guess.local) lines.push('Модель на телефоне: рисунок уходит ей не чаще раза в ' + S.settings.localInterval + ' с');
      if (guess.slow) lines.push('Медленно: в среднем ' + secondsText(guess.avgMs) + ' на догадку');
      if (window.innerWidth < 600) lines.push('На внешнем экране тесно — разверните телефон, холст станет больше');
    } else {
      if (!roles.paint.ready) lines.push('Нет модели для рисунков — играть можно только из запаса');
      if (!S.features.includes('speech.stream')) lines.push('Телефон слышит догадки кусками по ' + S.settings.chunkSeconds + ' с — зачёт с задержкой');
    }
    if (!S.hat && (S.mode === 'model' || S.settings.secret === 'card')) lines.push('Шляпа не установлена — слова только из встроенного запаса');
    if (!lines.length) return null;
    return h('div', { class: 'section notes' }, lines.map((line) => h('p', { class: 'small muted' }, line)));
  }

  function modeCard(mode, icon, title, text) {
    return h('button', {
      class: 'mode' + (S.mode === mode ? ' on' : ''),
      id: 'mode-' + mode,
      'aria-pressed': S.mode === mode ? 'true' : 'false',
      onclick: () => {
        S.mode = mode;
        saveMode();
        renderHome();
      }
    }, ui.icon(icon), h('b', {}, title), h('span', {}, text));
  }

  function removePlayer(name) {
    return setSetting({ players: S.settings.players.filter((item) => item !== name) });
  }

  function playersSection() {
    const s = S.settings;
    const input = h('input', { class: 'input', id: 'name', placeholder: 'Имя игрока или команды', maxLength: 24, enterkeyhint: 'done', autocomplete: 'off' });
    input.spellcheck = false;
    const add = () => {
      const name = cleanName(input.value);
      if (!name) return;
      if (s.players.includes(name)) {
        ui.toast('Такое имя уже есть');
        return;
      }
      if (s.players.length >= 12) {
        ui.toast('Не больше 12');
        return;
      }
      setSetting({ players: s.players.concat([name]) });
      const again = document.getElementById('name');
      if (again) again.focus();
    };
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') add();
    });
    return h('section', { class: 'section', id: 'players' },
      h('h2', {}, 'Игроки'),
      h('div', { class: 'chips' },
        chip('Один', !s.teams, () => setSetting({ teams: false }), 'solo'),
        chip('Команды', s.teams, () => setSetting({ teams: true }), 'teams')),
      s.teams ? [
        h('p', { class: 'small muted' }, S.mode === 'human'
          ? 'Рисуют по очереди; очки — тому, чей рисунок модель узнала, и тем больше, чем быстрее'
          : 'Кто угадал — отмечаете касанием, очки ему; чем быстрее, тем больше'),
        h('div', { class: 'names' }, s.players.map((name) => h('span', { class: 'name-chip' }, raw(name),
          h('button', { class: 'icon-btn', 'aria-label': 'Убрать', onclick: () => removePlayer(name) }, ui.icon('close'))))),
        h('div', { class: 'field-row' }, input, h('button', { class: 'btn', id: 'add', onclick: add }, ui.icon('plus'), 'Добавить'))
      ] : null);
  }

  function secretSection() {
    const s = S.settings;
    return h('section', { class: 'section', id: 'secret' },
      h('h2', {}, 'Что рисовать'),
      h('div', { class: 'chips' },
        chip('По карточке', s.secret === 'card', () => setSetting({ secret: 'card' }), 'secret-card'),
        chip('Загадал сам', s.secret === 'self', () => setSetting({ secret: 'self' }), 'secret-self')),
      h('p', { class: 'small muted' }, s.secret === 'card'
        ? 'Телефон показывает слово и сам судит догадки. Модель слова не видит'
        : 'Задумайте что угодно; когда модель угадает — «Да!»'));
  }

  function wordsSection() {
    const s = S.settings;
    const known = S.themes.includes(s.theme);
    const open = !known || S.customOpen;
    const custom = h('input', { class: 'input', id: 'custom-theme', placeholder: 'Своя тема: космос, сказки, кухня…', maxLength: 60, value: known ? '' : s.theme, autocomplete: 'off' });
    custom.addEventListener('change', () => {
      const value = custom.value.trim();
      S.customOpen = !!value;
      setSetting({ theme: value || 'общее' });
    });
    return h('section', { class: 'section', id: 'words' },
      h('h2', {}, 'Тема слов'),
      h('div', { class: 'chips' },
        S.themes.map((name) => chip(name, s.theme === name && !S.customOpen, () => {
          S.customOpen = false;
          setSetting({ theme: name });
        })),
        chip('Своя', open, () => {
          S.customOpen = true;
          renderHome();
          const node = document.getElementById('custom-theme');
          if (node) node.focus();
        }, 'theme-custom')),
      open ? custom : null,
      open && !S.hat ? h('p', { class: 'small muted' }, 'Своя тема работает со Шляпой (она пишет слова); без неё — слова из запаса') : null,
      h('h2', {}, 'Сложность'),
      h('div', { class: 'chips' }, [1, 2, 3, 4, 5].map((n) => chip(String(n), s.difficulty === n, () => setSetting({ difficulty: n })))),
      h('p', { class: 'small muted' }, levelHint(s.difficulty)));
  }

  function timeSection() {
    return h('section', { class: 'section', id: 'time' },
      h('h2', {}, 'Время'),
      stepperRow('drawSeconds'),
      stepperRow('roundsPerGame'),
      S.mode === 'model' ? stepperRow('paintSeconds') : null);
  }

  function stockSection() {
    const st = S.stock || { ready: 0, size: 0, filling: false };
    return h('section', { class: 'section', id: 'stock' },
      h('h2', {}, 'Запас рисунков'),
      h('p', {}, 'Готово ' + st.ready + ' из ' + st.size, st.filling ? h('span', { class: 'muted' }, ' — Axiko рисует ещё ', h('span', { class: 'spinner' })) : null),
      h('p', { class: 'small muted' }, 'Рисунки готовятся заранее, пока есть сеть; из запаса можно играть без сети'),
      st.size > 0 && st.ready < st.size && !st.filling ? h('button', { class: 'btn', id: 'fill', onclick: act(async () => {
        S.stock = await call('fillStock');
        updateStock();
        pollStock();
      }) }, ui.icon('spark'), 'Подготовить') : null);
  }

  function updateStock() {
    const node = document.getElementById('stock');
    if (node && S.view === 'home') node.replaceWith(stockSection());
  }

  let stockTimer = null;

  function pollStock() {
    clearTimeout(stockTimer);
    if (!S.stock || !S.stock.filling) return;
    stockTimer = setTimeout(async () => {
      const next = await quiet(call('stockInfo'));
      if (next) S.stock = next;
      updateStock();
      pollStock();
    }, 5000);
  }

  function renderHome() {
    const s = S.settings;
    const page = h('main', { class: 'page home' },
      h('header', { class: 'topbar' },
        h('button', { class: 'icon-btn', 'aria-label': 'Назад', onclick: () => axiko.back() }, ui.icon('back')),
        h('h1', {}, 'Рисуй — угадаю'),
        h('button', { class: 'icon-btn', 'aria-label': 'Как играть', onclick: showRules }, ui.icon('info')),
        h('button', { class: 'icon-btn', 'aria-label': 'Настройки', id: 'open-settings', onclick: showSettings }, ui.icon('settings'))),
      h('div', { class: 'modes' },
        modeCard('human', 'edit', 'Я рисую — Axiko угадывает', 'Рисуйте пальцем или пером, модель угадывает вслух по ходу'),
        modeCard('model', 'spark', 'Axiko рисует — мы угадываем', 'Модель рисует штрих за штрихом, кричите догадки — телефон услышит')),
      roleNotes(),
      playersSection(),
      S.mode === 'human' ? secretSection() : null,
      S.mode === 'model' || s.secret === 'card' ? wordsSection() : null,
      timeSection(),
      S.mode === 'model' ? stockSection() : null,
      h('button', { class: 'btn primary wide go', id: 'start', onclick: act(() => startGame(S.mode)) }, ui.icon('play'), 'Начать'));
    app.replaceChildren(page);
  }

  function showRules() {
    const close = ui.sheet([
      h('h3', {}, 'Как играть'),
      h('div', { class: 'md' },
        h('p', {}, h('b', {}, 'Я рисую. '), 'Рисуйте пальцем или пером. Модель смотрит на рисунок по ходу и говорит, что видит. «Нет» — эта догадка неверна, «Тепло» — близко, «Да!» — угадала. По карточке телефон сам знает слово и сам засчитывает; модель слова не видит никогда.'),
        h('p', {}, h('b', {}, 'Axiko рисует. '), 'Модель рисует штрих за штрихом, а вы кричите догадки. Телефон слышит верное слово и останавливает рисунок; кто угадал — отметьте касанием. Без микрофона — вводите догадку в поле.'),
        h('p', {}, h('b', {}, 'Очки. '), 'Угадано быстро — до 10 очков, к концу времени — 1.'),
        h('p', {}, h('b', {}, 'Честно о микрофоне. '), 'Телефон слышит всех. Засчитал по ошибке — «Ошибка — рисуем дальше».')),
      h('button', { class: 'btn wide', onclick: () => close() }, 'Понятно')
    ]);
  }

  // ---- весь экран, пульс --------------------------------------------------------------------------

  let heartbeat = null;

  function enterStage() {
    quiet(axiko.stage(true));
    clearInterval(heartbeat);
    heartbeat = null;
    if (S.game && !S.game.test) {
      heartbeat = setInterval(() => quiet(call('beat')), S.game.settings.heartbeatSeconds * 1000);
      quiet(call('beat'));
    }
  }

  function leaveStage() {
    clearInterval(heartbeat);
    heartbeat = null;
    quiet(axiko.stage(false));
  }

  function stageView(node, scroll) {
    hidePause();
    app.replaceChildren(h('div', { class: 'stage' + (scroll ? ' scroll' : ''), id: 'stage' }, node));
  }

  function busy(text) {
    stageView(h('div', { class: 'overlay' },
      h('span', { class: 'spinner' }),
      h('p', {}, text),
      h('button', { class: 'btn', onclick: act(exitGame) }, 'Выйти')));
  }

  function roundLabel() {
    const g = S.game;
    if (g.daily) return 'Рисунок дня';
    return 'Рисунок ' + (g.index + 1) + ' из ' + g.total;
  }

  function topRow() {
    const r = S.round;
    return h('div', { class: 'panel-top' },
      h('button', { class: 'exit', id: 'exit', onclick: act(async () => {
        pauseRound();
        await exitGame();
      }) }, ui.icon('close'), 'Выйти'),
      h('div', { class: 'round-label' }, roundLabel(), r && r.kind === 'human' && !S.game.solo ? [' · ', raw(r.drawer)] : null),
      h('div', { class: 'clock', id: 'clock' }, ''));
  }

  function timebar() {
    return h('div', { class: 'timebar', id: 'timebar' }, h('i'));
  }

  // ---- партия --------------------------------------------------------------------------------

  function newGame(kind, settings, test) {
    const players = settings.teams && settings.players.length >= 2 ? settings.players.slice() : [SOLO];
    const game = {
      id: null,
      test: !!test,
      mode: kind === 'human' ? 'human_draws' : 'model_draws',
      players,
      solo: players.length === 1,
      settings,
      total: settings.roundsPerGame,
      index: 0,
      rounds: [],
      scores: {},
      modelHits: 0,
      humanHits: 0,
      requests: 0,
      costBefore: 0,
      best: null,
      last: null,
      listen: false
    };
    players.forEach((name) => {
      game.scores[name] = 0;
    });
    return game;
  }

  async function startGame(kind, options) {
    if (!S.ready) return;
    const s = Object.assign({}, S.settings);
    if (kind === 'human' && !visionReady()) {
      ui.toast('Нужна модель со зрением для роли «Угадывание рисунка»');
      return;
    }
    if (s.teams && s.players.length < 2) {
      ui.toast('Добавьте хотя бы двух игроков или две команды — или выберите «Один»');
      return;
    }
    if (kind === 'model' && !(options && options.daily) && S.stock && !S.stock.ready && S.roles && !S.roles.paint.ready) {
      ui.toast('Нет ни модели для рисунков, ни рисунков в запасе');
      return;
    }
    const game = newGame(kind, s, false);
    if (options && options.daily && kind === 'model') {
      game.daily = true;
      game.total = 1;
    }
    game.listen = kind === 'model' && s.autoVoice;
    game.costBefore = (await quiet(call('usageNow'))) || 0;
    game.id = await call('gameStart', { mode: game.mode, players: game.solo ? [] : game.players, listen: game.listen });
    S.game = game;
    S.results = null;
    enterStage();
    await beginRound();
  }

  async function beginRound() {
    const g = S.game;
    if (!g) return;
    stopTimers();
    S.round = null;
    if (g.mode === 'human_draws') {
      const drawer = g.players[g.index % g.players.length];
      let card = null;
      if (g.settings.secret === 'card') {
        busy('Выбираем слово…');
        card = g.test ? g.testCard : await call('card', { theme: themeOf(g.settings), difficulty: g.settings.difficulty, synonyms: g.settings.synonyms });
      }
      if (S.game !== g) return;
      S.round = humanRound(drawer, card);
    } else {
      busy('Axiko готовит рисунок…');
      const drawing = await prepareDrawing(g);
      if (S.game !== g) return;
      if (drawing.error) {
        renderPaintError(drawing.error);
        return;
      }
      S.round = modelRound(drawing);
    }
    S.view = 'intro';
    if (g.test) {
      go();
      return;
    }
    render();
  }

  function renderIntro() {
    const r = S.round;
    const g = S.game;
    const human = r.kind === 'human';
    let hero;
    if (!human) hero = 'Рисунок готов';
    else if (g.solo) hero = 'Ваш рисунок';
    else hero = ['Рисует ', h('span', { class: 'accent' }, raw(r.drawer))];
    stageView(h('div', { class: 'overlay', id: 'intro' },
      h('div', { class: 'muted' }, roundLabel()),
      h('div', { class: 'hero' }, hero),
      human
        ? (r.card ? h('div', { class: 'secret', id: 'secret-word' }, 'Нарисуйте: ', h('b', {}, raw(r.card.word))) : h('div', { class: 'secret' }, 'Задумайте, что нарисуете, и рисуйте'))
        : h('p', {}, g.listen ? 'Кричите догадки — телефон слушает' : 'Вводите догадки в поле'),
      human && window.innerWidth < 600 ? h('p', { class: 'small muted' }, 'На внешнем экране тесно — разверните телефон, холст станет больше') : null,
      h('button', { class: 'btn primary go', id: 'go', onclick: go }, ui.icon('play'), 'Начать'),
      h('button', { class: 'btn', onclick: act(exitGame) }, 'Выйти')));
  }

  function go() {
    const r = S.round;
    if (!r || r.phase !== 'ready') return;
    r.phase = 'run';
    r.startedAt = Date.now();
    S.view = r.kind === 'human' ? 'draw' : 'paint';
    render();
    startTimers();
    if (r.kind === 'model') {
      startAnimation(r);
      if (S.game.listen) Mic.start(onHeard);
    }
  }

  // ---- время раунда -------------------------------------------------------------------------------

  function elapsed(r) {
    if (!r || !r.startedAt) return 0;
    return (r.pausedAt || Date.now()) - r.startedAt - r.pausedMs;
  }

  function holdClock(r) {
    if (!r.pausedAt) r.pausedAt = Date.now();
  }

  function releaseClock(r) {
    if (r.pausedAt) {
      r.pausedMs += Date.now() - r.pausedAt;
      r.pausedAt = 0;
    }
  }

  let ticker = null;

  function startTimers() {
    stopTimers();
    ticker = setInterval(tick, 200);
  }

  function stopTimers() {
    clearInterval(ticker);
    ticker = null;
  }

  function tick() {
    const r = S.round;
    if (!r || r.paused || r.phase === 'ready') return;
    updateClock();
    if (r.phase !== 'run') return;
    const total = S.game.settings.drawSeconds * 1000;
    if (r.kind === 'human') {
      if (elapsed(r) >= total) finalAttempt(r);
      else maybeSend('tick');
    } else if (elapsed(r) >= total) {
      finishModel(r, 'missed', { how: 'time' });
    } else {
      // Кадры рисует requestAnimationFrame; таймер — подстраховка, если кадров нет (экран не на виду).
      paintFrame(r);
    }
  }

  function updateClock() {
    const r = S.round;
    if (!r || !S.game) return;
    const total = S.game.settings.drawSeconds * 1000;
    const left = Math.max(0, total - elapsed(r));
    const late = left <= 10000;
    const clock = document.getElementById('clock');
    if (clock) {
      clock.textContent = String(Math.ceil(left / 1000));
      clock.classList.toggle('late', late);
    }
    const bar = document.getElementById('timebar');
    if (bar && bar.firstChild) {
      bar.firstChild.style.transform = 'scaleX(' + (left / total).toFixed(4) + ')';
      bar.classList.toggle('late', late);
    }
    const points = document.getElementById('points-now');
    if (points && r.kind === 'model') {
      points.textContent = S.game.settings.speedPoints && r.phase === 'run' ? 'Сейчас: ' + pointsText(K.speedScore(elapsed(r), total)) : '';
    }
  }

  // ---- холст «Я рисую» ---------------------------------------------------------------------------

  const Ink = { canvas: null, ctx: null, color: '#EDEDED' };

  function inkColor() {
    return getComputedStyle(document.documentElement).getPropertyValue('--ink').trim() || '#EDEDED';
  }

  /** Холст — квадрат: сбоку панель, если ей хватает места (раскрытый Fold), иначе снизу. */
  function fitBoard() {
    const play = document.getElementById('play');
    const board = document.getElementById('board');
    if (!play || !board) return;
    const style = getComputedStyle(play);
    const w = play.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const hgt = play.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    const panel = 300;
    const gap = 12;
    const wide = w - panel - gap >= hgt * 0.7;
    let side = wide ? Math.min(hgt, w - panel - gap) : Math.min(w, hgt * 0.56);
    side = Math.max(160, Math.floor(side));
    play.classList.toggle('wide', wide);
    board.style.width = side + 'px';
    board.style.height = side + 'px';
    if (Ink.canvas && board.contains(Ink.canvas)) resizeInk();
  }

  function resizeInk() {
    const canvas = Ink.canvas;
    if (!canvas || !canvas.isConnected) return;
    const dpr = window.devicePixelRatio || 1;
    const size = Math.max(1, Math.round(canvas.clientWidth * dpr));
    if (canvas.width !== size) {
      canvas.width = size;
      canvas.height = size;
    }
    const ctx = canvas.getContext('2d');
    const k = canvas.width / K.FIELD;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    Ink.ctx = ctx;
    Ink.color = inkColor();
    redraw();
  }

  function drawStroke(ctx, stroke) {
    const points = stroke.points;
    if (!ctx || !points.length) return;
    ctx.strokeStyle = Ink.color;
    ctx.fillStyle = Ink.color;
    ctx.lineWidth = stroke.width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (points.length === 1) {
      ctx.beginPath();
      ctx.arc(points[0][0], points[0][1], stroke.width / 2, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
    ctx.stroke();
  }

  function drawSegment(stroke) {
    const ctx = Ink.ctx;
    const points = stroke.points;
    const n = points.length;
    if (!ctx || n < 2) return;
    ctx.strokeStyle = Ink.color;
    ctx.lineWidth = stroke.width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(points[n - 2][0], points[n - 2][1]);
    ctx.lineTo(points[n - 1][0], points[n - 1][1]);
    ctx.stroke();
  }

  function redraw() {
    const ctx = Ink.ctx;
    const r = S.round;
    if (!ctx) return;
    ctx.clearRect(0, 0, K.FIELD, K.FIELD);
    if (r && r.kind === 'human') r.strokes.forEach((stroke) => drawStroke(ctx, stroke));
  }

  /** Pointer Events: палец и S Pen одинаково, один активный указатель, ладонь рядом с пером не рисует. */
  function bindInk(canvas) {
    Ink.canvas = canvas;
    let active = null;
    const point = (event) => {
      const p = K.toField(event.clientX, event.clientY, canvas.getBoundingClientRect());
      return [p[0], p[1], Math.round(elapsed(S.round))];
    };
    canvas.addEventListener('pointerdown', (event) => {
      const r = S.round;
      if (!r || r.kind !== 'human' || r.phase !== 'run' || r.paused || active !== null) return;
      if (event.pointerType === 'pen') r.penAt = Date.now();
      else if (event.pointerType === 'touch' && Date.now() - r.penAt < S.game.settings.palmMs) return;
      event.preventDefault();
      active = event.pointerId;
      try {
        canvas.setPointerCapture(event.pointerId);
      } catch (error) {
        /* указатель уже отпущен */
      }
      r.cleared = null;
      r.current = { points: [point(event)], width: r.width };
      r.strokes.push(r.current);
      r.sender.drawing = true;
      drawStroke(Ink.ctx, r.current);
    });
    canvas.addEventListener('pointermove', (event) => {
      const r = S.round;
      if (event.pointerId !== active || !r || !r.current) return;
      if (event.pointerType === 'pen') r.penAt = Date.now();
      const list = typeof event.getCoalescedEvents === 'function' ? event.getCoalescedEvents() : [];
      (list.length ? list : [event]).forEach((one) => {
        const p = point(one);
        const last = r.current.points[r.current.points.length - 1];
        if (Math.abs(p[0] - last[0]) + Math.abs(p[1] - last[1]) < 2) return;
        r.current.points.push(p);
        drawSegment(r.current);
      });
    });
    const end = (event) => {
      if (event.pointerId !== active) return;
      active = null;
      endStroke();
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('lostpointercapture', end);
  }

  function endStroke(silent) {
    const r = S.round;
    if (!r || !r.current) return;
    r.current = null;
    r.sender.drawing = false;
    K.changed(r.sender, r.strokes.length, Date.now());
    updateTools();
    if (!silent) maybeSend('stroke');
  }

  function undoStroke() {
    const r = S.round;
    if (!r || r.kind !== 'human' || r.phase !== 'run' || r.current) return;
    if (r.strokes.length) r.strokes.pop();
    else if (r.cleared) {
      r.strokes = r.cleared;
      r.cleared = null;
    } else return;
    redraw();
    K.changed(r.sender, r.strokes.length, Date.now());
    updateTools();
  }

  function clearInk() {
    const r = S.round;
    if (!r || r.kind !== 'human' || r.phase !== 'run' || r.current || !r.strokes.length) return;
    r.cleared = r.strokes;
    r.strokes = [];
    redraw();
    K.changed(r.sender, 0, Date.now());
    updateTools();
    ui.toast('Очищено — «Отменить штрих» вернёт рисунок');
  }

  /**
   * Рисунок на белом, чёрной линией, вписан с полями (снимок для модели, картинка в итоги).
   * kind 'human' — штрихи { points, width }; 'model' — пути { d } модели в поле 0..1000.
   */
  function artCanvas(kind, strokes, size, s) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const x = canvas.getContext('2d');
    x.fillStyle = '#FFFFFF';
    x.fillRect(0, 0, size, size);
    x.strokeStyle = '#000000';
    x.fillStyle = '#000000';
    x.lineCap = 'round';
    x.lineJoin = 'round';
    if (kind === 'model') {
      const k = size / K.FIELD;
      x.setTransform(k, 0, 0, k, 0, 0);
      x.lineWidth = Math.max(s.paintLine, K.FIELD / 160);
      strokes.forEach((stroke) => {
        try {
          x.stroke(new Path2D(stroke.d));
        } catch (error) {
          /* разобранный путь сюда не попадает */
        }
      });
      return canvas;
    }
    const f = K.fit(strokes, size, s.margin / 100, 4);
    strokes.forEach((stroke) => {
      const points = stroke.points || [];
      if (!points.length) return;
      const width = K.snapshotWidth(stroke.width, size, f.scale);
      if (points.length === 1) {
        x.beginPath();
        x.arc(points[0][0] * f.scale + f.dx, points[0][1] * f.scale + f.dy, width / 2, 0, Math.PI * 2);
        x.fill();
        return;
      }
      x.lineWidth = width;
      x.beginPath();
      points.forEach((p, i) => {
        const px = p[0] * f.scale + f.dx;
        const py = p[1] * f.scale + f.dy;
        if (i) x.lineTo(px, py);
        else x.moveTo(px, py);
      });
      x.stroke();
    });
    return canvas;
  }

  function snapshot(strokes, s) {
    return artCanvas('human', strokes, s.imageSize, s).toDataURL('image/jpeg', s.jpegQuality);
  }

  function artImage(kind, strokes, size, s) {
    return artCanvas(kind, strokes, size, s).toDataURL('image/png');
  }

  // ---- «Я рисую»: раунд --------------------------------------------------------------------------

  function humanRound(drawer, card) {
    const s = S.game.settings;
    return {
      kind: 'human',
      drawer,
      card,
      phase: 'ready',
      strokes: [],
      current: null,
      cleared: null,
      width: s.lineThin,
      penAt: 0,
      startedAt: 0,
      pausedMs: 0,
      pausedAt: 0,
      paused: false,
      sender: K.sender({ minInterval: sendInterval(s), pause: s.pauseSend, minNew: s.minNewStrokes, maxRequests: s.maxRequests }),
      guesses: [],
      rejected: [],
      warm: '',
      lastSaid: '',
      voiceOn: s.voice,
      thinking: false,
      note: '',
      result: null,
      word: '',
      hitGuess: '',
      points: 0,
      timeMs: 0,
      finalDone: false,
      model: S.roles ? S.roles.guess.model : '',
      noModel: S.game.test
    };
  }

  function dotIcon(radius) {
    const holder = document.createElement('span');
    holder.innerHTML = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="' + radius + '" fill="currentColor"/></svg>';
    return holder.firstChild;
  }

  function renderDraw() {
    const r = S.round;
    const g = S.game;
    const ink = h('canvas', { class: 'ink', id: 'ink', 'aria-label': 'Холст' });
    const panel = h('div', { class: 'panel' },
      topRow(),
      timebar(),
      r.card
        ? h('div', { class: 'secret', id: 'secret-word' }, 'Нарисуйте: ', h('b', {}, raw(r.card.word)))
        : h('div', { class: 'secret' }, 'Рисуйте что угодно — «Да!», когда модель угадает'),
      h('div', { class: 'status', id: 'status' }),
      h('div', { class: 'feed', id: 'feed' }),
      h('div', { class: 'verdict' },
        h('button', { class: 'btn', id: 'yes', onclick: () => verdict('yes') }, ui.icon('check'), 'Да!'),
        h('button', { class: 'btn', id: 'no', onclick: () => verdict('no') }, ui.icon('close'), 'Нет'),
        h('button', { class: 'btn', id: 'warm', onclick: () => verdict('warm') }, 'Тепло')),
      h('div', { class: 'tools' },
        h('button', { class: 'icon-btn', id: 'undo', 'aria-label': 'Отменить штрих', title: 'Отменить штрих', onclick: undoStroke }, ui.icon('back')),
        h('button', { class: 'icon-btn', id: 'clear', 'aria-label': 'Очистить', title: 'Очистить', onclick: clearInk }, ui.icon('trash')),
        h('button', { class: 'icon-btn', id: 'width', 'aria-label': 'Толщина линии', title: 'Толщина линии', onclick: toggleWidth }, dotIcon(r.width === g.settings.lineThin ? 2.5 : 5)),
        h('button', { class: 'icon-btn', id: 'voice', 'aria-label': 'Голос модели', title: 'Голос модели', onclick: toggleVoice }, ui.icon(r.voiceOn ? 'speaker' : 'mute'))),
      g.settings.showSnapshot ? h('img', { class: 'snapshot', id: 'snap', alt: 'Снимок для модели' }) : null,
      h('button', { class: 'btn primary wide done-btn', id: 'done', onclick: () => doneDrawing() }, ui.icon('check'), 'Готово'));
    stageView(h('div', { class: 'play', id: 'play' }, h('div', { class: 'board', id: 'board' }, ink), panel));
    bindInk(ink);
    fitBoard();
    updateFeed();
    updateStatus();
    updateTools();
    updateClock();
  }

  function toggleWidth() {
    const r = S.round;
    if (!r || r.kind !== 'human') return;
    const s = S.game.settings;
    r.width = r.width === s.lineThin ? s.lineThick : s.lineThin;
    const node = document.getElementById('width');
    if (node) {
      node.replaceChildren(dotIcon(r.width === s.lineThin ? 2.5 : 5));
      node.classList.toggle('on', r.width !== s.lineThin);
    }
  }

  function toggleVoice() {
    const r = S.round;
    if (!r || r.kind !== 'human') return;
    r.voiceOn = !r.voiceOn;
    if (!r.voiceOn) quiet(axiko.native('speech.stop'));
    const node = document.getElementById('voice');
    if (node) node.replaceChildren(ui.icon(r.voiceOn ? 'speaker' : 'mute'));
  }

  function lastGuess(r) {
    return r.guesses.length ? r.guesses[r.guesses.length - 1] : null;
  }

  function updateTools() {
    const r = S.round;
    if (!r || r.kind !== 'human') return;
    const running = r.phase === 'run' && !r.paused;
    const last = lastGuess(r);
    const set = (id, on) => {
      const node = document.getElementById(id);
      if (node) node.disabled = !on;
    };
    set('undo', running && (r.strokes.length > 0 || !!r.cleared));
    set('clear', running && r.strokes.length > 0);
    set('yes', !!last && (r.phase === 'run' || r.phase === 'finalWait' || r.phase === 'final'));
    set('no', !!last && running && !last.rejected);
    set('warm', !!last && running && !last.rejected && r.warm !== last.guess);
    set('done', running);
  }

  function updateFeed() {
    const node = document.getElementById('feed');
    const r = S.round;
    if (!node || !r || r.kind !== 'human') return;
    const list = r.guesses.slice(-6);
    if (!list.length) {
      node.replaceChildren(h('div', { class: 'small muted' }, r.strokes.length
        ? 'Модель скоро скажет, что видит'
        : 'Начните рисовать — модель будет угадывать по ходу'));
      return;
    }
    node.replaceChildren(...list.map((entry, i) => h('div', {
      class: 'guess-row' + (i === list.length - 1 ? ' last' : '') + (entry.rejected ? ' no' : '') + (entry.hit ? ' hit' : '')
    },
    h('span', { class: 'word' }, raw(entry.guess)),
    entry.warm ? h('span', { class: 'small' }, 'тепло') : null,
    entry.said ? ui.icon('speaker') : null,
    h('span', { class: 'conf' }, confText(entry.confidence)))));
  }

  function updateStatus() {
    const node = document.getElementById('status');
    const r = S.round;
    if (!node || !r || r.kind !== 'human') return;
    const parts = [];
    if (r.phase === 'finalWait' || r.phase === 'final') parts.push(h('span', { class: 'spinner' }), 'Последняя попытка модели…');
    else if (r.thinking) parts.push(h('span', { class: 'spinner' }), 'Модель смотрит…');
    else if (r.note) parts.push(h('span', { class: 'warn' }, raw(r.note)));
    else if (r.sender.requests >= r.sender.opts.maxRequests) parts.push('Предел запросов — дальше по «Готово»');
    else if (r.sender.requests) parts.push('Запросов к модели: ' + r.sender.requests);
    else if (S.roles && S.roles.guess.local) parts.push('Модель на телефоне: рисунок уходит ей раз в ' + r.sender.opts.minInterval + ' с');
    node.replaceChildren(...parts);
  }

  // ---- отправка снимков и ответы модели ----------------------------------------------------------

  function maybeSend(event) {
    const r = S.round;
    if (!r || r.kind !== 'human' || r.phase !== 'run' || r.paused || r.noModel) return;
    if (!K.decide(r.sender, Date.now(), event)) return;
    sendGuess(r, false);
  }

  async function sendGuess(r, final) {
    const s = S.game.settings;
    const image = snapshot(r.strokes, s);
    const at = Date.now();
    const atMs = Math.round(elapsed(r));
    K.sent(r.sender, at);
    r.thinking = true;
    if (s.showSnapshot) {
      const node = document.getElementById('snap');
      if (node) node.src = image;
    }
    updateStatus();
    let answer;
    try {
      answer = await call('guess', {
        image,
        rejected: r.rejected,
        warm: r.warm,
        theme: r.card ? themeOf(s) : '',
        final
      });
    } catch (error) {
      answer = { error: error && error.message ? error.message : String(error) };
    }
    if (S.round !== r) return;
    K.answered(r.sender);
    r.thinking = false;
    onAnswer(r, answer || { error: 'пустой ответ' }, { at, atMs, final });
  }

  function isRejected(r, word) {
    return r.rejected.some((item) => M.normalize(item) === M.normalize(word));
  }

  function addRejected(r, word) {
    if (word && !isRejected(r, word)) r.rejected.push(word);
  }

  function say(r, text) {
    if (!r.voiceOn || !text) return;
    if (S.game.settings.localVoice) quiet(axiko.native('speech.say', text, 'local'));
    else quiet(axiko.native('speech.say', text));
  }

  function onAnswer(r, answer, context) {
    if (!r || r.kind !== 'human' || r.phase === 'done' || r.phase === 'ask' || r.phase === 'abandoned') return;
    const s = S.game.settings;
    // Последняя попытка, пришедшая после «Не засчитывать» (раунд снова идёт), — обычная догадка.
    const final = !!context.final && (r.phase === 'final' || r.phase === 'finalWait');
    if (final) r.finalDone = true;
    if (answer.error) {
      r.note = 'Модель: ' + String(answer.error).slice(0, 140);
      if (final) {
        finishHuman(r, r.card ? 'missed' : 'ask');
        return;
      }
      updateStatus();
      if (r.phase === 'finalWait') sendFinal(r);
      return;
    }
    r.note = '';
    if (answer.model) r.model = answer.model;
    const entry = {
      at_ms: context.atMs,
      guess: answer.guess,
      confidence: answer.confidence,
      alternatives: answer.alternatives || [],
      said: false,
      ms: answer.ms || 0,
      final
    };
    r.guesses.push(entry);
    if (r.card) {
      const found = G.judge(answer, r.card, { synonyms: s.synonyms });
      // Владелец уже сказал «Не засчитывать» этому слову — повтор модели тоже не зачёт.
      if (found.ok && !isRejected(r, found.word)) {
        entry.hit = found.word;
        r.hitGuess = found.word;
        say(r, found.first ? answer.say : 'Это ' + found.word + '?');
        entry.said = r.voiceOn;
        finishHuman(r, 'guessed', found.word);
        return;
      }
    }
    if (G.shouldSay(answer, {
      lastSaid: r.lastSaid,
      rejected: r.rejected,
      snapshotAt: context.at,
      now: Date.now(),
      threshold: s.sayThreshold,
      staleMs: s.staleSeconds * 1000,
      noRepeat: s.noRepeatSay,
      voice: r.voiceOn
    })) {
      say(r, answer.say);
      entry.said = true;
      r.lastSaid = answer.guess;
    }
    if (final) {
      r.finalEntry = entry;
      finishHuman(r, r.card ? 'missed' : 'ask');
      return;
    }
    updateFeed();
    updateStatus();
    updateTools();
    if (r.phase === 'run') maybeSend('answer');
    else if (r.phase === 'finalWait') {
      if (r.noModel) finishHuman(r, r.card ? 'missed' : 'ask');
      else sendFinal(r);
    }
  }

  function verdict(kind) {
    const r = S.round;
    if (!r || r.kind !== 'human') return;
    const last = lastGuess(r);
    if (!last) return;
    if (kind === 'yes') {
      if (r.phase !== 'run' && r.phase !== 'finalWait' && r.phase !== 'final') return;
      r.hitGuess = last.guess;
      last.hit = last.guess;
      finishHuman(r, 'guessed', last.guess);
      return;
    }
    if (r.phase !== 'run' || r.paused || last.rejected) return;
    if (kind === 'no') {
      addRejected(r, last.guess);
      last.rejected = true;
      if (r.warm === last.guess) r.warm = '';
    } else if (kind === 'warm') {
      r.warm = last.guess;
      last.warm = true;
    }
    // Подсказка — тоже новое для модели: можно отправить снова, не дожидаясь штриха.
    K.changed(r.sender, r.strokes.length, Date.now());
    updateFeed();
    updateTools();
    maybeSend('stroke');
  }

  function doneDrawing() {
    const r = S.round;
    if (!r || r.kind !== 'human' || r.phase !== 'run') return;
    if (!r.strokes.length) {
      ui.toast('Сначала нарисуйте что-нибудь');
      return;
    }
    finalAttempt(r);
  }

  /** Время вышло или «Готово»: дождаться ответа в полёте, затем последняя попытка с вариантами. */
  function finalAttempt(r) {
    if (r.phase !== 'run') return;
    if (r.current) endStroke(true);
    r.phase = 'finalWait';
    holdClock(r);
    if (!r.strokes.length) {
      finishHuman(r, 'missed');
      return;
    }
    updateStatus();
    updateTools();
    if (r.noModel) return;
    if (!r.sender.inFlight) sendFinal(r);
  }

  function sendFinal(r) {
    r.phase = 'final';
    updateStatus();
    sendGuess(r, true);
  }

  function finishHuman(r, result, word) {
    if (r.phase === 'done' || r.phase === 'abandoned') return;
    const g = S.game;
    const s = g.settings;
    holdClock(r);
    stopTimers();
    if (r.current) endStroke(true);
    r.timeMs = Math.round(Math.min(elapsed(r), s.drawSeconds * 1000));
    if (result === 'ask') {
      r.phase = 'ask';
      S.view = 'round';
      render();
      return;
    }
    r.phase = 'done';
    r.result = result;
    r.word = r.card ? r.card.word : (word || '');
    r.points = result === 'guessed' ? (s.speedPoints ? K.speedScore(r.timeMs, s.drawSeconds * 1000) : 1) : 0;
    if (r.points) g.scores[r.drawer] = (g.scores[r.drawer] || 0) + r.points;
    S.view = 'round';
    render();
  }

  // ---- «Axiko рисует»: рисунок модели --------------------------------------------------------------

  /** Пути, которые экран сможет нарисовать: разбор canvas.js и Path2D (бросил — штрих выброшен). */
  function usable(list) {
    return (list || []).filter((stroke) => {
      if (!stroke || typeof stroke.d !== 'string' || !K.parsePath(stroke.d).ok) return false;
      try {
        new Path2D(stroke.d);
        return true;
      } catch (error) {
        return false;
      }
    });
  }

  function testDrawing() {
    const answer = SAMPLES.painting();
    const checked = K.validatePainting(answer, { minStrokes: 3, maxStrokes: 120, maxPoints: 100 });
    return { id: 0, word: answer.word, strokes: checked.strokes, checked: true };
  }

  async function prepareDrawing(g) {
    const s = g.settings;
    let made = g.test ? testDrawing() : await call('takeDrawing', { theme: themeOf(s), difficulty: s.difficulty, daily: !!g.daily });
    if (!made || made.error) return { error: made && made.error ? made.error : 'нет рисунка' };
    let strokes = usable(made.strokes);
    if (s.checkPaint && !g.test && !made.checked && made.id) {
      busy('Axiko проверяет свой рисунок…');
      const image = artCanvas('model', strokes, s.imageSize, s).toDataURL('image/jpeg', s.jpegQuality);
      const checked = await call('verifyDrawing', made.id, image);
      if (checked && checked.drawing) {
        made = checked.drawing;
        strokes = usable(made.strokes);
      } else if (checked && !checked.ok) {
        return { error: 'рисунок не узнаётся, а нового нет' };
      }
    }
    if (strokes.length < 3) return { error: 'в рисунке почти ничего не разобралось' };
    return { id: made.id, word: made.word, strokes };
  }

  function renderPaintError(why) {
    stageView(h('div', { class: 'overlay' },
      h('div', { class: 'hero' }, 'Axiko не смог нарисовать'),
      h('p', { class: 'muted' }, raw(String(why).slice(0, 200))),
      h('button', { class: 'btn primary go', id: 'retry', onclick: act(beginRound) }, ui.icon('refresh'), 'Ещё раз'),
      h('button', { class: 'btn', onclick: act(exitGame) }, 'Выйти')));
  }

  function modelRound(drawing) {
    return {
      kind: 'model',
      id: drawing.id,
      word: drawing.word,
      card: { word: drawing.word, forms: [], roots: [] },
      strokes: drawing.strokes,
      phase: 'ready',
      startedAt: 0,
      pausedMs: 0,
      pausedAt: 0,
      paused: false,
      paths: [],
      lengths: [],
      plan: [],
      progress: [],
      revealed: false,
      frame: 0,
      heard: [],
      result: null,
      points: 0,
      who: '',
      timeMs: 0,
      how: '',
      heardText: '',
      latency: 0
    };
  }

  function paintSvg(r) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 1000 1000');
    svg.setAttribute('id', 'painting');
    svg.setAttribute('aria-label', 'Рисунок Axiko');
    r.paths = r.strokes.map((stroke) => {
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', stroke.d);
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', 'currentColor');
      path.setAttribute('stroke-width', String(S.game.settings.paintLine));
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('stroke-linejoin', 'round');
      path.style.visibility = 'hidden';
      svg.appendChild(path);
      return path;
    });
    return svg;
  }

  /** Длина каждого штриха (getTotalLength) и расписание: всё рисование — за paintSeconds. */
  function measure(r) {
    const s = S.game.settings;
    r.lengths = r.paths.map((path, i) => {
      let length = 0;
      try {
        length = path.getTotalLength();
      } catch (error) {
        length = 0;
      }
      if (!(length > 0)) length = r.strokes[i].length || K.pathLength(r.strokes[i].d) || 1;
      path.style.strokeDasharray = length + ' ' + length;
      path.style.strokeDashoffset = String(length);
      return length;
    });
    if (!r.plan.length) r.plan = K.schedule(r.lengths, s.paintSeconds * 1000, { pauseMin: s.pauseMinMs, pauseMax: s.pauseMaxMs });
    paintFrame(r);
  }

  function paintFrame(r) {
    const t = r.revealed ? Infinity : elapsed(r);
    r.progress = K.progressAt(r.plan, t);
    r.paths.forEach((path, i) => {
      const p = r.progress[i];
      const offset = r.lengths[i] * (1 - p);
      if (path.__offset === offset) return;
      path.__offset = offset;
      path.style.visibility = p > 0 ? 'visible' : 'hidden';
      path.style.strokeDashoffset = String(offset);
    });
  }

  function drawnShare(r) {
    const total = r.lengths.reduce((sum, len) => sum + len, 0);
    if (!total) return 0;
    return r.lengths.reduce((sum, len, i) => sum + len * (r.progress[i] || 0), 0) / total;
  }

  function startAnimation(r) {
    cancelAnimationFrame(r.frame);
    const paintMs = S.game.settings.paintSeconds * 1000;
    const step = () => {
      if (S.round !== r || r.paused || r.phase !== 'run') return;
      paintFrame(r);
      if (elapsed(r) <= paintMs + 100) r.frame = requestAnimationFrame(step);
    };
    r.frame = requestAnimationFrame(step);
  }

  function renderPaint() {
    const r = S.round;
    const g = S.game;
    const input = h('input', { class: 'input', id: 'guess-text', placeholder: 'Ваша догадка', maxLength: 40, enterkeyhint: 'send', autocomplete: 'off' });
    input.spellcheck = false;
    const send = () => {
      const text = input.value.trim();
      if (!text) return;
      input.value = '';
      if (!onHeard(text, { typed: true, latency: 0 })) ui.toast('Нет, не это');
    };
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') send();
    });
    const panel = h('div', { class: 'panel' },
      topRow(),
      timebar(),
      h('div', { class: 'status' }, micIndicator(), h('span', { class: 'points-now', id: 'points-now' })),
      h('div', { class: 'heard-list', id: 'heard' }),
      h('div', { class: 'field-row' }, input, h('button', { class: 'btn', id: 'guess-send', 'aria-label': 'Проверить', onclick: send }, ui.icon('send'))),
      h('button', { class: 'btn primary wide done-btn', id: 'guessed', onclick: () => finishModel(S.round, 'guessed', { how: 'button' }) }, ui.icon('check'), 'Угадали'),
      h('button', { class: 'btn wide', id: 'give-up', onclick: () => finishModel(S.round, 'missed', { how: 'gave-up' }) }, 'Сдаёмся — показать'));
    const board = h('div', { class: 'board', id: 'board' }, paintSvg(r));
    stageView(h('div', { class: 'play', id: 'play' }, board, panel));
    Ink.canvas = null;
    fitBoard();
    measure(r);
    updateHeard();
    updateClock();
    if (!g.listen) setTimeout(() => input.focus(), 0);
  }

  function micIndicator() {
    if (!S.game.listen) return h('span', { class: 'mic', id: 'mic' }, ui.icon('mute'), h('span', { class: 'small' }, 'без микрофона'));
    return h('span', { class: 'mic' + (Mic.active ? ' on' : ''), id: 'mic', title: 'Микрофон' }, ui.icon('mic'), h('span', { class: 'level' }, h('i')));
  }

  function updateHeard() {
    const node = document.getElementById('heard');
    const r = S.round;
    if (!node || !r || r.kind !== 'model') return;
    const list = r.heard.slice(-12);
    if (!list.length) {
      node.replaceChildren(h('span', { class: 'small muted' }, S.game.listen ? 'Говорите догадки вслух — здесь появится услышанное' : 'Вводите догадки в поле ниже'));
      return;
    }
    node.replaceChildren(...list.map((item) => h('span', { class: 'heard-item' + (item.hit ? ' hit' : '') }, raw(item.text))));
  }

  /** Услышанное (или введённое) сравнивается с загаданным через match.js — как в Шляпе. */
  function onHeard(text, info) {
    const r = S.round;
    if (!r || r.kind !== 'model' || r.phase !== 'run' || r.paused) return false;
    const clean = String(text || '').replace(/\s+/g, ' ').trim();
    if (!clean) return false;
    const found = M.matches(clean, r.card, { synonyms: false });
    r.heard.push({ text: clean.slice(0, 80), hit: found.ok, at_ms: Math.round(elapsed(r)), typed: !!(info && info.typed), latency: info && info.latency ? info.latency : 0 });
    updateHeard();
    if (found.ok) {
      r.latency = info && info.latency ? info.latency : 0;
      finishModel(r, 'guessed', { how: info && info.typed ? 'typed' : 'voice', heard: clean });
    }
    return found.ok;
  }

  function finishModel(r, result, info) {
    if (!r || r.kind !== 'model' || r.phase !== 'run') return;
    const g = S.game;
    const s = g.settings;
    holdClock(r);
    stopTimers();
    cancelAnimationFrame(r.frame);
    quiet(Mic.stop());
    r.phase = 'done';
    r.result = result;
    r.timeMs = Math.round(Math.min(elapsed(r), s.drawSeconds * 1000));
    r.how = info.how || '';
    r.heardText = info.heard || '';
    if (result !== 'guessed') {
      r.revealed = true;
      paintFrame(r);
    }
    r.points = result === 'guessed' ? (s.speedPoints ? K.speedScore(r.timeMs, s.drawSeconds * 1000) : 1) : 0;
    if (r.points && g.solo) giveTo(r, SOLO);
    S.view = 'round';
    render();
  }

  function giveTo(r, name) {
    const g = S.game;
    if (r.who) g.scores[r.who] -= r.points;
    r.who = name;
    g.scores[name] = (g.scores[name] || 0) + r.points;
  }

  // ---- конец раунда ---------------------------------------------------------------------------------

  /** Засчитано по ошибке (телефон услышал не то, модель «угадала» не то) — раунд продолжается. */
  function notCounted() {
    const r = S.round;
    const g = S.game;
    if (!r || r.phase !== 'done' || r.result !== 'guessed') return;
    if (r.kind === 'human') {
      g.scores[r.drawer] -= r.points;
      if (r.hitGuess) {
        addRejected(r, r.hitGuess);
        const last = lastGuess(r);
        if (last && last.hit) {
          last.hit = '';
          last.rejected = true;
        }
      }
    } else {
      if (r.who) g.scores[r.who] -= r.points;
      r.heard.forEach((item) => {
        item.hit = false;
      });
    }
    r.points = 0;
    r.who = '';
    r.hitGuess = '';
    const total = g.settings.drawSeconds * 1000;
    if (r.timeMs >= total - 1000 || (r.kind === 'human' && r.finalDone)) {
      r.result = 'missed';
      r.revealed = true;
      render();
      return;
    }
    r.result = null;
    r.phase = 'run';
    releaseClock(r);
    if (r.kind === 'human') {
      S.view = 'draw';
      render();
    } else {
      S.view = 'paint';
      render();
      startAnimation(r);
      if (g.listen) Mic.start(onHeard);
    }
    startTimers();
  }

  function renderRound() {
    const r = S.round;
    const g = S.game;
    const last = g.index + 1 >= g.total;
    const parts = [];
    if (r.kind === 'human' && r.phase === 'ask') {
      const entry = r.finalEntry;
      const options = [];
      (entry ? [entry.guess].concat(entry.alternatives || []) : []).forEach((word) => {
        if (word && !options.some((item) => M.normalize(item) === M.normalize(word))) options.push(word);
      });
      parts.push(h('div', { class: 'result', id: 'ask' },
        h('div', { class: 'big' }, 'Последняя попытка'),
        options.length ? h('p', {}, 'Модель думает, что это одно из этого. Что из этого верно?') : h('p', {}, 'Модель не ответила. Угадала она раньше?'),
        h('div', { class: 'who-buttons' }, options.map((word) => h('button', { class: 'btn', onclick: () => {
          r.hitGuess = word;
          r.phase = 'final';
          finishHuman(r, 'guessed', word);
        } }, raw(word)))),
        h('button', { class: 'btn wide', id: 'nothing', onclick: () => {
          r.phase = 'final';
          finishHuman(r, 'missed');
        } }, 'Ничего из этого')));
    } else if (r.kind === 'human') {
      const guessed = r.result === 'guessed';
      parts.push(h('div', { class: 'result', id: 'result' },
        h('div', { class: 'big' + (guessed ? ' ok' : '') }, guessed ? 'Угадала за ' + secondsText(r.timeMs) + '!' : 'Не угадала'),
        r.word ? h('p', {}, guessed ? '' : 'Загадано: ', h('b', {}, raw('«' + r.word + '»')),
          r.points ? ' — ' + pointsText(r.points) + (g.solo ? '' : ' ' + dative(r.drawer)) : '') : null,
        !guessed && r.guesses.length ? h('p', { class: 'small muted' }, 'Догадки: ', raw(r.guesses.slice(-5).map((entry) => entry.guess).join(', '))) : null,
        r.note ? h('p', { class: 'small warn' }, raw(r.note)) : null,
        h('p', { class: 'small muted' }, 'Запросов к модели: ' + r.sender.requests),
        guessed ? h('button', { class: 'btn', id: 'not-counted', onclick: notCounted }, ui.icon('undo'), 'Не засчитывать') : null,
        // Модель не узнала, а люди рядом узнали — для ачивки «Нераспознанный гений».
        !guessed && r.phase === 'done' && !g.test ? h('button', {
          class: 'btn' + (r.peopleKnew ? ' primary' : ''),
          id: 'people-knew',
          'aria-pressed': r.peopleKnew ? 'true' : 'false',
          onclick: () => {
            r.peopleKnew = !r.peopleKnew;
            renderRound();
          }
        }, ui.icon('check'), r.peopleKnew ? 'Люди узнали — отмечено' : 'А люди узнали') : null));
    } else {
      const guessed = r.result === 'guessed';
      parts.push(h('div', { class: 'result', id: 'result' },
        h('div', { class: 'big' + (guessed ? ' ok' : '') }, guessed ? 'Угадано за ' + secondsText(r.timeMs) : 'Не угадали'),
        h('p', {}, guessed ? '' : 'Загадано: ', h('b', {}, raw('«' + r.word + '»')), r.points ? ' — ' + pointsText(r.points) + (r.who && !g.solo ? ' ' + dative(r.who) : '') : ''),
        guessed && r.heardText ? h('p', { class: 'small muted' }, r.how === 'typed' ? 'Введено: ' : 'Услышано: ', raw('«' + r.heardText + '»'),
          r.latency ? ' — задержка зачёта ' + secondsText(r.latency) : '') : null,
        guessed && !g.solo ? h('div', {}, h('h2', {}, 'Кто угадал?'),
          h('div', { class: 'who-buttons', id: 'who' }, g.players.map((name) => h('button', {
            class: 'btn' + (r.who === name ? ' primary' : ''),
            onclick: () => {
              giveTo(r, name);
              renderRound();
            }
          }, raw(name))))) : null,
        guessed ? h('button', { class: 'btn', id: 'not-counted', onclick: notCounted }, ui.icon('undo'), 'Ошибка — рисуем дальше') : null));
    }
    if (r.phase === 'done') {
      parts.push(h('img', {
        class: 'art',
        id: 'round-art',
        alt: 'Рисунок',
        src: artImage(r.kind, r.strokes, 480, g.settings)
      }));
      parts.push(h('div', { class: 'end-buttons' },
        h('button', { class: 'btn primary go', id: 'next', onclick: act(nextRound) }, ui.icon(last ? 'chart' : 'right'), last ? 'Итоги' : 'Дальше'),
        g.test ? null : h('button', { class: 'btn go', id: 'save-art', onclick: act(saveRoundArt) }, ui.icon('download'), 'Сохранить'),
        r.kind === 'human' && r.word && !g.test ? h('button', { class: 'btn go', id: 'bench-add', onclick: act(addToBench) }, ui.icon('plus'), 'В набор для сравнения') : null));
    }
    stageView(h('div', { class: 'stage-inner' },
      h('div', { class: 'panel-top' },
        h('button', { class: 'exit', id: 'exit', onclick: act(exitGame) }, ui.icon('close'), 'Выйти'),
        h('div', { class: 'round-label' }, roundLabel())),
      parts), true);
  }

  async function saveRoundArt() {
    const r = S.round;
    const path = await call('saveArt', 'round-' + Date.now(), artImage(r.kind, r.strokes, 1024, S.game.settings));
    ui.toast('Сохранено: ' + path);
  }

  async function addToBench() {
    const r = S.round;
    await call('benchAdd', r.word, r.strokes);
    const node = document.getElementById('bench-add');
    if (node) node.disabled = true;
    ui.toast('Рисунок в наборе для сравнения моделей');
  }

  /** Раунд записан: в партию, в базу (кроме проверки), лучший рисунок — самый быстро угаданный. */
  function commitRound(r) {
    const g = S.game;
    if (!g || !r || r.committed || r.phase !== 'done') return;
    r.committed = true;
    const guessed = r.result === 'guessed';
    if (r.kind === 'human') {
      if (guessed) g.modelHits += 1;
      g.requests += r.sender.requests;
    } else if (guessed) {
      g.humanHits += 1;
    }
    const summary = {
      kind: r.kind,
      word: r.word,
      result: r.result,
      timeMs: r.timeMs,
      points: r.points,
      who: r.kind === 'human' ? r.drawer : r.who,
      strokes: r.strokes
    };
    g.rounds.push(summary);
    g.last = summary;
    if (guessed && (!g.best || r.timeMs < g.best.timeMs)) g.best = summary;
    if (g.test) return;
    quiet(call('saveRound', {
      mode: g.mode,
      word: r.word,
      secretKnown: r.kind === 'model' || !!r.card,
      strokes: r.strokes,
      guesses: r.kind === 'human'
        ? r.guesses.map((entry) => ({ at_ms: entry.at_ms, guess: entry.guess, confidence: entry.confidence, alternatives: entry.alternatives, said: entry.said, ms: entry.ms }))
        : r.heard.map((item) => ({ at_ms: item.at_ms, guess: item.text, hit: item.hit, typed: item.typed, latency: item.latency })),
      result: r.result,
      timeMs: r.timeMs,
      requests: r.kind === 'human' ? r.sender.requests : 0,
      roleModel: r.kind === 'human' ? r.model : (S.roles ? S.roles.paint.model : ''),
      player: g.solo ? '' : (r.kind === 'human' ? r.drawer : r.who),
      gameId: g.id,
      peopleKnew: r.kind === 'human' && !guessed && !!r.peopleKnew,
      daily: !!g.daily
    }));
  }

  async function nextRound() {
    const r = S.round;
    const g = S.game;
    if (!g || !r || r.phase !== 'done') return;
    commitRound(r);
    g.index += 1;
    if (g.index >= g.total) await finishGame();
    else await beginRound();
  }

  // ---- итоги -----------------------------------------------------------------------------------

  async function finishGame() {
    const g = S.game;
    if (!g) return;
    stopTimers();
    await Mic.stop();
    busy('Считаем итоги…');
    let cost = 0;
    if (!g.test) {
      const after = await quiet(call('usageNow'));
      if (typeof after === 'number') cost = Math.max(0, after - g.costBefore);
    }
    const best = g.best || g.last;
    let art = '';
    let artPath = '';
    if (best) {
      art = artImage(best.kind, best.strokes, 720, g.settings);
      if (g.settings.saveBest && !g.test) artPath = (await quiet(call('saveArt', 'best-' + (g.id || Date.now()), art))) || '';
    }
    if (!g.test) {
      await quiet(call('gameEnd', g.id, {
        rounds: g.rounds.length,
        modelHits: g.modelHits,
        humanHits: g.humanHits,
        cost,
        scores: g.scores,
        toBase: true
      }));
    }
    S.results = { game: g, cost, art, artPath, best, guessedBest: !!g.best };
    S.round = null;
    S.view = 'results';
    render();
  }

  function fact(label, value) {
    return h('div', { class: 'fact' }, h('span', { class: 'label' }, label), h('span', { class: 'value' }, value));
  }

  function renderResults() {
    const res = S.results;
    const g = res.game;
    const humanMode = g.mode === 'human_draws';
    const n = g.rounds.length;
    const hits = humanMode ? g.modelHits : g.humanHits;
    const guessed = g.rounds.filter((item) => item.result === 'guessed');
    const avg = guessed.length ? guessed.reduce((sum, item) => sum + item.timeMs, 0) / guessed.length : 0;
    const order = Object.keys(g.scores).sort((a, b) => g.scores[b] - g.scores[a]);
    const top = order.length ? g.scores[order[0]] : 0;
    stageView(h('div', { class: 'stage-inner', id: 'results' },
      h('div', { class: 'panel-top' },
        h('button', { class: 'exit', id: 'exit', onclick: () => toHome() }, ui.icon('close'), 'Выйти')),
      h('div', { class: 'hero' }, 'Итоги'),
      h('div', { class: 'facts' },
        fact(humanMode ? 'Модель угадала' : 'Угадали', hits + ' из ' + n),
        guessed.length ? fact('В среднем за', secondsText(avg)) : null,
        humanMode ? fact('Запросов к модели', String(g.requests)) : null,
        g.test ? null : fact('Стоимость партии', res.cost > 0 ? money(res.cost) : '$0 — бесплатно или провайдер не сообщает цену')),
      h('div', { class: 'scores', id: 'scores' }, order.map((name) => h('div', { class: 'score' + (top > 0 && g.scores[name] === top ? ' first' : '') },
        h('div', { class: 'grow' }, raw(name)),
        h('div', { class: 'points' }, String(g.scores[name]))))),
      res.art ? h('section', { class: 'section' },
        h('h2', {}, res.guessedBest ? 'Лучший рисунок партии' : 'Последний рисунок'),
        h('img', { class: 'art', id: 'best-art', src: res.art, alt: 'Лучший рисунок' }),
        h('p', { class: 'small muted' }, raw('«' + res.best.word + '»'),
          res.guessedBest ? ' — угадан за ' + secondsText(res.best.timeMs) : '',
          res.artPath ? h('span', {}, ' · сохранён: ', raw(res.artPath)) : null)) : null,
      h('div', { class: 'end-buttons' },
        h('button', { class: 'btn primary go', id: 'again', onclick: act(() => {
          const kind = humanMode ? 'human' : 'model';
          S.game = null;
          return startGame(kind);
        }) }, ui.icon('refresh'), 'Ещё партия'),
        h('button', { class: 'btn go', id: 'leave', onclick: () => toHome() }, 'Выйти'))), true);
  }

  async function toHome() {
    stopTimers();
    hidePause();
    await Mic.stop();
    const r = S.round;
    if (r) cancelAnimationFrame(r.frame);
    S.game = null;
    S.round = null;
    S.results = null;
    S.view = 'home';
    leaveStage();
    renderHome();
    const [stock, roles] = await Promise.all([quiet(call('stockInfo')), quiet(call('roleInfo'))]);
    if (stock) S.stock = stock;
    if (roles) S.roles = roles;
    if (S.view === 'home') {
      renderHome();
      pollStock();
    }
  }

  async function exitGame() {
    const g = S.game;
    if (!g) return toHome();
    const r = S.round;
    const midRound = r && r.phase !== 'done' && r.phase !== 'ready';
    if (!g.test && (midRound || g.rounds.length || (r && r.phase === 'done'))) {
      const finished = g.rounds.length || (r && r.phase === 'done');
      const ok = await ui.confirm(finished ? 'Закончить партию и посмотреть итоги?' : 'Выйти из игры? Этот рисунок не запишется.', 'Закончить');
      if (!ok) return;
    }
    hidePause();
    if (r && r.phase === 'done') commitRound(r);
    if (r) {
      if (r.phase !== 'done') r.phase = 'abandoned';
      cancelAnimationFrame(r.frame);
    }
    stopTimers();
    await Mic.stop();
    quiet(axiko.native('speech.stop'));
    if (g.test) return toHome();
    if (g.rounds.length) return finishGame();
    await quiet(call('gameEnd', g.id, { rounds: 0, toBase: false }));
    await quiet(call('removeGame', g.id));
    return toHome();
  }

  // ---- пауза: экран ушёл с глаз -------------------------------------------------------------------

  function pauseRound() {
    const r = S.round;
    if (!r || r.phase !== 'run' || r.paused) return;
    if (r.kind === 'human' && r.current) endStroke(true);
    r.paused = true;
    holdClock(r);
    cancelAnimationFrame(r.frame);
    if (r.kind === 'model') quiet(Mic.stop());
    updateTools();
    showPause();
  }

  function resumeRound() {
    const r = S.round;
    if (!r || !r.paused) return;
    r.paused = false;
    releaseClock(r);
    hidePause();
    if (r.kind === 'model') {
      startAnimation(r);
      if (S.game.listen) Mic.start(onHeard);
    }
    updateTools();
    updateClock();
  }

  function showPause() {
    hidePause();
    document.body.appendChild(h('div', { class: 'overlay', id: 'pause' },
      h('div', { class: 'hero' }, 'Пауза'),
      h('p', { class: 'muted' }, 'Время стоит'),
      h('button', { class: 'btn primary go', id: 'resume', onclick: resumeRound }, ui.icon('play'), 'Продолжить'),
      h('button', { class: 'btn', onclick: act(exitGame) }, 'Закончить партию')));
  }

  function hidePause() {
    const node = document.getElementById('pause');
    if (node) node.remove();
  }

  // ---- микрофон (как в Шляпе: speech.stream, если есть, иначе куски speech.listen) ----------------

  const Mic = {
    active: false,
    gen: 0,
    stream: false,
    handler: null,
    startedAt: 0,
    processingAt: 0,
    settings: null,
    async start(handler) {
      if (this.active || !S.game) return;
      this.active = true;
      this.handler = handler;
      this.settings = S.game.settings;
      const gen = ++this.gen;
      micState('on');
      if (S.features.includes('speech.stream')) {
        try {
          await axiko.native('speech.stream.start', { maxMinutes: this.settings.streamMaxMinutes });
          if (gen !== this.gen) {
            quiet(axiko.native('speech.stream.stop'));
            return;
          }
          this.stream = true;
          this.startedAt = Date.now();
          quiet(call('streamMark', true));
          return;
        } catch (error) {
          console.warn('speech.stream: ' + error.message);
        }
      }
      this.loop(gen);
    },
    async loop(gen) {
      let failures = 0;
      while (this.active && gen === this.gen) {
        const begun = Date.now();
        try {
          const text = await axiko.native('speech.listen', this.settings.chunkSeconds);
          if (gen !== this.gen) break;
          failures = 0;
          const done = Date.now();
          const recognize = this.processingAt >= begun ? done - this.processingAt : 0;
          if (text) this.handler(text, { latency: recognize || done - begun });
        } catch (error) {
          if (gen !== this.gen) break;
          failures += 1;
          if (/Уже слушаю/.test(error.message)) {
            await wait(300);
            continue;
          }
          if (failures >= 3) {
            micState('error');
            ui.toast('Микрофон: ' + error.message + ' — вводите догадки в поле');
            break;
          }
          await wait(600);
        }
      }
    },
    async stop() {
      if (!this.active) return;
      this.active = false;
      this.gen += 1;
      micState('off');
      if (this.stream) {
        this.stream = false;
        await quiet(axiko.native('speech.stream.stop'));
        quiet(call('streamMark', false));
      } else {
        await quiet(axiko.native('speech.stopListening'));
      }
    }
  };

  function micState(state) {
    const node = document.getElementById('mic');
    if (!node || !S.game || !S.game.listen) return;
    node.className = 'mic' + (state === 'on' ? ' on' : state === 'busy' ? ' busy' : '');
    if (state === 'error' || state === 'off') {
      const bar = node.querySelector('.level > i');
      if (bar) bar.style.width = '0';
    }
  }

  axiko.on('speech', (event) => {
    if (!event) return;
    if (event.state === 'processing') Mic.processingAt = Date.now();
    if (!Mic.active) return;
    const node = document.getElementById('mic');
    if (!node) return;
    node.className = 'mic ' + (event.state === 'processing' ? 'busy' : 'on');
    const bar = node.querySelector('.level > i');
    if (bar && typeof event.level === 'number') bar.style.width = Math.min(100, Math.round(event.level * 600)) + '%';
  });

  /** Когда фраза кончилась (мс эпохи): time — начало фразы, startMs/endMs — от начала распознавания. */
  function phraseEnd(event) {
    const start = event.startMs !== undefined ? event.startMs : event.from;
    const end = event.endMs !== undefined ? event.endMs : event.to;
    if (event.time > 1e12 && end >= 0 && start >= 0) return event.time + (end - start);
    if (end > 1e12) return end;
    if (end > 0) return Mic.startedAt + end;
    return 0;
  }

  axiko.on('speech.stream', (event) => {
    if (!event || event.active !== false || !Mic.active || !Mic.stream) return;
    Mic.stream = false;
    quiet(call('streamMark', false));
    if (event.error) console.warn('speech.stream: ' + event.error);
    Mic.loop(Mic.gen);
  });

  axiko.on('speech.phrase', (event) => {
    if (!Mic.active || !Mic.stream || !Mic.handler || !event || !event.text) return;
    const endAt = phraseEnd(event);
    Mic.handler(event.text, { latency: endAt ? Math.max(0, Date.now() - endAt) : 0 });
  });

  // ---- настройки и сравнение моделей -------------------------------------------------------------

  function rolesBox() {
    const roles = S.roles;
    if (!roles) return null;
    const line = (title, role, extra) => h('div', { class: 'setting-row' },
      h('div', { class: 'grow' }, title,
        h('span', { class: 'small' }, role.model ? raw(role.model + (role.assigned ? '' : ' (основная модель)')) : 'не назначена',
          extra || '')));
    const guess = roles.guess;
    return h('div', { class: 'section' },
      h('h2', {}, 'Модели'),
      line('Угадывание рисунка', guess, (guess.vision ? ' · видит картинки' : ' · без зрения') + (guess.local ? ' · на телефоне' : '') +
        (guess.avgMs ? ' · в среднем ' + secondsText(guess.avgMs) + (guess.slow ? ' — медленно' : '') : '')),
      line('Рисунок для угадывания', roles.paint, ''),
      h('button', { class: 'btn', onclick: () => axiko.open(MODELS_LINK) }, ui.icon('settings'), 'Назначить модели'));
  }

  function showSettings() {
    const groups = {};
    C.SCHEMA.forEach((item) => {
      (groups[item.group] = groups[item.group] || []).push(item);
    });
    const compare = h('div', { class: 'section', id: 'compare' });
    const close = ui.sheet([
      h('h3', {}, 'Настройки'),
      rolesBox(),
      Object.keys(groups).map((name) => h('div', { class: 'section' }, h('h2', {}, name), h('div', {}, groups[name].map(settingRow)))),
      compare,
      h('button', { class: 'btn wide', onclick: () => close() }, 'Готово')
    ], () => {
      if (S.view === 'home') renderHome();
    });
    quiet(fillCompare(compare));
  }

  async function fillCompare(box) {
    box.replaceChildren(h('h2', {}, 'Сравнение моделей'), h('span', { class: 'spinner' }));
    const [data, bench] = await Promise.all([call('compare'), call('bench')]);
    const own = bench.filter((item) => item.own);
    const row = (model, a, b) => h('div', { class: 'compare-row' }, h('span', { class: 'model' }, raw(model || '—')), h('span', {}, a), h('span', { class: 'muted' }, b));
    box.replaceChildren(...[
      h('h2', {}, 'Сравнение моделей'),
      h('p', { class: 'small muted' }, 'Набор: ' + own.length + ' ваших рисунков и ' + (bench.length - own.length) +
        ' образца. Свой рисунок попадает в набор кнопкой «В набор для сравнения» после раунда «Я рисую».'),
      data.runs.length
        ? h('div', {}, h('p', { class: 'small' }, 'Прогоны набора — верно среди догадки и вариантов, время ответа'),
          data.runs.map((run) => row(run.model, run.hits + ' из ' + run.total, run.avgMs ? secondsText(run.avgMs) : '—')))
        : h('p', { class: 'small muted' }, 'Прогонов набора ещё не было'),
      data.live.length
        ? h('div', {}, h('p', { class: 'small' }, 'В игре «Я рисую» — угаданных рисунков, время ответа'),
          data.live.map((item) => row(item.model, item.hits + ' из ' + item.rounds, item.avgMs ? secondsText(item.avgMs) : '—')))
        : null,
      h('button', { class: 'btn', id: 'bench-run', onclick: act(() => runBench(box, bench)) }, ui.icon('play'), 'Прогнать набор'),
      own.length ? h('button', { class: 'btn', id: 'bench-clear', onclick: act(async () => {
        if (!(await ui.confirm('Убрать ваши рисунки из набора (' + own.length + ')?', 'Убрать', true))) return;
        for (const item of own) await call('benchRemove', item.id);
        await fillCompare(box);
      }) }, ui.icon('trash'), 'Убрать мои рисунки') : null
    ].filter(Boolean));
  }

  async function runBench(box, list) {
    if (!visionReady()) {
      ui.toast('Нужна модель со зрением для роли «Угадывание рисунка»');
      return;
    }
    const model = S.roles.guess.model;
    if (!(await ui.confirm('Прогнать ' + list.length + ' рисунков через «' + model + '»? Это ' + list.length + ' запросов к модели.', 'Прогнать'))) return;
    const s = S.settings;
    const note = h('p', { class: 'small', id: 'bench-progress' }, '');
    box.appendChild(note);
    let hits = 0;
    let ms = 0;
    let answered = 0;
    for (let i = 0; i < list.length; i++) {
      note.textContent = 'Рисунок ' + (i + 1) + ' из ' + list.length + '…';
      const answer = await call('guess', { image: snapshot(list[i].strokes, s), final: true });
      if (answer && !answer.error) {
        answered += 1;
        ms += answer.ms || 0;
        if (G.judge(answer, { word: list[i].word, forms: [] }).ok) hits += 1;
      }
    }
    await call('benchRecord', { model, total: list.length, hits, avgMs: answered ? ms / answered : 0 });
    ui.toast('Верно ' + hits + ' из ' + list.length);
    await fillCompare(box);
  }

  // ---- отрисовка --------------------------------------------------------------------------------

  function render() {
    if (S.view === 'results' && S.results) return renderResults();
    if (!S.game || !S.round || S.view === 'home') return renderHome();
    if (S.view === 'intro') return renderIntro();
    if (S.view === 'draw') return renderDraw();
    if (S.view === 'paint') return renderPaint();
    if (S.view === 'round') return renderRound();
    return renderHome();
  }

  let resizeFrame = 0;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(fitBoard);
  });

  // Экран уходит с глаз (свернули, погас, сложили) — раунд на паузу, микрофон отпускается.
  axiko.on('app.visible', (event) => {
    if (event && event.on === false) pauseRound();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') pauseRound();
  });
  window.addEventListener('pagehide', () => {
    if (Mic.active) {
      if (Mic.stream) quiet(axiko.native('speech.stream.stop'));
      else quiet(axiko.native('speech.stopListening'));
    }
    if (S.game && !S.game.test && S.game.listen) quiet(call('wakeRestore'));
  });

  /** Поля подготовки, что передал агент через open(): тема, сложность, игроки, время, рисунков. */
  function prefillSettings(prefill) {
    if (!prefill) return null;
    const patch = {};
    if (typeof prefill.theme === 'string' && prefill.theme.trim()) {
      const theme = prefill.theme.trim();
      patch.theme = S.themes.includes(theme.toLowerCase()) ? theme.toLowerCase() : theme;
    }
    if (prefill.difficulty !== undefined) patch.difficulty = prefill.difficulty;
    if (Array.isArray(prefill.players)) {
      patch.players = prefill.players;
      patch.teams = prefill.players.length >= 2;
    }
    if (prefill.teams === true || prefill.teams === false) patch.teams = prefill.teams;
    if (prefill.drawSeconds !== undefined) patch.drawSeconds = prefill.drawSeconds;
    if (prefill.rounds !== undefined) patch.roundsPerGame = prefill.rounds;
    return Object.keys(patch).length ? patch : null;
  }

  async function init() {
    renderHome();
    const data = await call('init', { test: TEST });
    S.settings = data.settings;
    S.features = data.features || [];
    S.roles = data.roles;
    S.stock = data.stock;
    S.hat = !!data.hat;
    S.themes = data.themes || C.THEMES;
    const prefill = data.prefill;
    if (prefill && (prefill.mode === 'human' || prefill.mode === 'model')) {
      S.mode = prefill.mode;
      saveMode();
    }
    const picked = prefillSettings(prefill);
    if (picked) await setSetting(picked, false);
    if (data.restored) ui.toast('Отклик на имя возвращён после прошлой игры');
    S.ready = true;
    document.body.dataset.ready = '1';
    renderHome();
    pollStock();
    if (DAILY && !TEST) {
      S.mode = 'model';
      saveMode();
      await startGame('model', { daily: true });
      return;
    }
    if (prefill && prefill.start) await startGame(S.mode);
  }

  // ---- для проверок (checks.js): игра без записи в базу, без модели и без микрофона ------------

  async function startTest(kind, word, paintSeconds) {
    if (S.game) await window.dgScreen.endTest();
    const s = Object.assign({}, S.settings, { voice: false, autoVoice: false, roundsPerGame: 1, teams: false, secret: word === null ? 'self' : 'card' });
    if (paintSeconds) s.paintSeconds = paintSeconds;
    const g = newGame(kind, s, true);
    g.testCard = word ? { word, forms: [], roots: [] } : null;
    S.game = g;
    S.results = null;
    enterStage();
    await beginRound();
  }

  window.dgScreen = {
    state: S,
    /** «Я рисую» по карточке word (null — «загадал сам»); модель не зовётся. */
    async testDraw(word) {
      await startTest('human', word === undefined ? 'дом' : word);
      const r = S.round;
      return { word: r.card ? r.card.word : '', view: S.view, phase: r.phase };
    },
    /** Штрих настоящими событиями указателя по точкам поля 0..1000. */
    drawLine(points, type) {
      const canvas = document.getElementById('ink');
      if (!canvas || !points || !points.length) return -1;
      const rect = canvas.getBoundingClientRect();
      const side = Math.min(rect.width, rect.height);
      const fire = (name, p) => canvas.dispatchEvent(new PointerEvent(name, {
        pointerId: 7,
        pointerType: type || 'touch',
        isPrimary: true,
        bubbles: true,
        cancelable: true,
        buttons: name === 'pointerup' ? 0 : 1,
        clientX: rect.left + p[0] / 1000 * side,
        clientY: rect.top + p[1] / 1000 * side
      }));
      fire('pointerdown', points[0]);
      points.slice(1).forEach((p) => fire('pointermove', p));
      fire('pointerup', points[points.length - 1]);
      return S.round.strokes.length;
    },
    strokes() {
      return S.round && S.round.kind === 'human' ? S.round.strokes.length : 0;
    },
    /** Снимок для модели: тип, размер в байтах, доля тёмных точек. */
    snapshot() {
      const s = S.game ? S.game.settings : S.settings;
      const canvas = artCanvas('human', S.round.strokes, s.imageSize, s);
      const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      let dark = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i] < 100) dark += 1;
      }
      const image = canvas.toDataURL('image/jpeg', s.jpegQuality);
      return {
        type: image.slice(5, image.indexOf(';')),
        bytes: Math.round((image.length - image.indexOf(',') - 1) * 3 / 4),
        size: canvas.width,
        dark: Math.round(dark / (pixels.length / 4) * 1000) / 1000
      };
    },
    /** Ответ модели, как пришёл бы из движка (без запроса): судья, лента, голос. */
    answer(fake, final) {
      const r = S.round;
      const parsed = G.parseGuess(fake, { sayMaxWords: S.game.settings.sayMaxWords });
      onAnswer(r, parsed || { error: 'нет догадки' }, { at: Date.now(), atMs: Math.round(elapsed(r)), final: !!final });
      return this.round();
    },
    /** «Axiko рисует» на образце «маяк» (samples.js); seconds — время рисования. */
    async testPaint(seconds) {
      await startTest('model', null, seconds);
      const r = S.round;
      const end = r.plan.length ? r.plan[r.plan.length - 1].start + r.plan[r.plan.length - 1].duration : 0;
      return { word: r.word, strokes: r.strokes.length, paintMs: Math.round(end), view: S.view };
    },
    painted() {
      const r = S.round;
      return r && r.kind === 'model' ? Math.round(drawnShare(r) * 1000) / 1000 : 0;
    },
    hear(text) {
      return onHeard(text, { latency: 0 });
    },
    round() {
      const r = S.round;
      if (!r) return null;
      return {
        kind: r.kind,
        phase: r.phase,
        result: r.result,
        points: r.points,
        word: r.word,
        guesses: (r.guesses || []).map((entry) => entry.guess),
        rejected: (r.rejected || []).slice(),
        heard: (r.heard || []).map((item) => ({ text: item.text, hit: item.hit }))
      };
    },
    async endTest() {
      const g = S.game;
      if (!g || !g.test) return false;
      const r = S.round;
      if (r) {
        r.phase = r.phase === 'done' ? 'done' : 'abandoned';
        cancelAnimationFrame(r.frame);
      }
      await toHome();
      return true;
    }
  };

  init().catch((error) => {
    console.error(error);
    ui.toast(error && error.message ? error.message : String(error));
  });
})();
