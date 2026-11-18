// Шляпа — экран: подготовка, свои слова, ход (во весь экран), между ходами, итоги.
// Правила — ../rules.js, сравнение слов — ../match.js, настройки — ../config.js, колода — ../deck.js;
// всё, что хранится и ходит в модель, — в ../main.js (движок).
(function () {
  const MAIN = 'modules/hat/main.js';
  const M = window.ruMatch;
  const R = window.hatRules;
  const C = window.hatConfig;
  const D = window.hatDeck;
  const h = ui.h;
  const raw = ui.raw;
  const app = document.getElementById('app');

  const S = {
    settings: C.defaults(),
    features: [],
    decks: [],
    offline: null,
    view: 'setup',
    setup: loadSetup(),
    deck: null,
    building: false,
    buildNote: '',
    listeningNames: false,
    game: null,
    saved: null,
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
    return Promise.resolve(promise).catch((error) => console.warn(error));
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function loadSetup() {
    let saved = null;
    try {
      saved = JSON.parse(localStorage.getItem('hat.setup') || 'null');
    } catch (error) {
      saved = null;
    }
    return Object.assign({ players: [], teams: [], deckId: null }, saved || {});
  }

  function saveSetup() {
    try {
      localStorage.setItem('hat.setup', JSON.stringify({
        players: S.setup.players, teams: S.setup.teams, deckId: S.deck ? S.deck.id : null
      }));
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

  function words(n) {
    return n + ' ' + plural(n, 'слово', 'слова', 'слов');
  }

  function seconds(ms) {
    return (Math.round(ms / 100) / 10).toFixed(1).replace('.', ',') + ' с';
  }

  function decimal(x) {
    return String(Math.round(x * 10) / 10).replace('.', ',');
  }

  /** «Передайте телефон Маше»: дательный падеж имени по окончанию (что не знаем — как есть). */
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

  /** «Ход Маши»: родительный падеж имени по окончанию (что не знаем — как есть). */
  function genitive(name) {
    const parts = String(name).split(' ');
    const w = parts[0];
    if (w.length < 2 || /[^А-Яа-яЁё]/.test(w)) return name;
    let g = w;
    if (/ия$/i.test(w)) g = w.slice(0, -1) + 'и';
    else if (/[гкхжшщч]а$/i.test(w)) g = w.slice(0, -1) + 'и';
    else if (/а$/i.test(w)) g = w.slice(0, -1) + 'ы';
    else if (/я$/i.test(w)) g = w.slice(0, -1) + 'и';
    else if (/[йь]$/i.test(w)) g = w.slice(0, -1) + 'я';
    else if (/[бвгджзклмнпрстфхцчшщ]$/i.test(w)) g = w + 'а';
    parts[0] = g;
    return parts.join(' ');
  }

  function cleanName(text) {
    const t = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 24);
    return t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
  }

  function themeValue() {
    const s = S.settings;
    return s.theme === '*' ? (s.customTheme || 'общее') : s.theme;
  }

  function roundsHint(n) {
    return ['', 'только словами', 'словами, жестами', 'словами, жестами, одним словом'][n] || '';
  }

  // ---- настройки --------------------------------------------------------------------------------

  function setSetting(patch) {
    S.settings = C.normalize(Object.assign({}, S.settings, patch));
    render();
    return call('saveSettings', patch).then((next) => {
      S.settings = next;
    }).catch((error) => ui.toast(error.message));
  }

  function chip(label, on, onclick) {
    return h('button', { class: 'chip' + (on ? ' on' : ''), onclick }, label);
  }

  function stepper(key, step) {
    const item = C.SCHEMA.find((entry) => entry.key === key);
    const by = step || item.step;
    const value = h('span', { class: 'value' }, String(S.settings[key]));
    const change = (delta) => {
      const next = Math.min(item.max, Math.max(item.min, S.settings[key] + delta));
      value.textContent = String(next);
      setSetting({ [key]: next });
    };
    return h('div', { class: 'stepper' },
      h('button', { class: 'btn small', 'aria-label': 'Меньше', onclick: () => change(-by) }, '−'),
      value,
      h('button', { class: 'btn small', 'aria-label': 'Больше', onclick: () => change(by) }, '+'));
  }

  function stepperRow(title, key, hint, step) {
    const item = C.SCHEMA.find((entry) => entry.key === key);
    return h('div', { class: 'option' },
      h('div', { class: 'grow' }, item.unit ? title + ', ' + item.unit : title,
        hint ? h('span', { class: 'small muted' }, hint) : null),
      stepper(key, step));
  }

  function switchRow(title, key, hint) {
    return h('label', { class: 'option' },
      h('div', { class: 'grow' }, title, hint ? h('span', { class: 'small muted' }, hint) : null),
      h('input', { type: 'checkbox', class: 'switch', checked: !!S.settings[key], onchange: (e) => setSetting({ [key]: e.target.checked }) }));
  }

  // ---- команды на подготовке ---------------------------------------------------------------------

  function ensureTeams() {
    const count = S.settings.teamCount;
    const players = S.setup.players;
    let teams = (S.setup.teams || []).map((team) => team.filter((name) => players.includes(name)));
    while (teams.length > count) {
      const extra = teams.pop();
      extra.forEach((name) => teams[teams.length - 1].push(name));
    }
    while (teams.length < count) teams.push([]);
    const placed = new Set(teams.flat());
    players.forEach((name) => {
      if (placed.has(name)) return;
      const smallest = teams.reduce((best, team, i) => (team.length < teams[best].length ? i : best), 0);
      teams[smallest].push(name);
    });
    S.setup.teams = teams;
  }

  function teamsForRules() {
    ensureTeams();
    return S.setup.teams.map((members, i) => ({
      name: 'Команда ' + (i + 1),
      members: members.map((name) => S.setup.players.indexOf(name)).filter((index) => index >= 0)
    }));
  }

  function teamOf(name) {
    return S.setup.teams.findIndex((team) => team.includes(name));
  }

  function moveToTeam(name, target) {
    const from = teamOf(name);
    if (from === target || target < 0) return;
    if (from >= 0) S.setup.teams[from] = S.setup.teams[from].filter((item) => item !== name);
    S.setup.teams[target].push(name);
    saveSetup();
    render();
  }

  function removePlayer(name) {
    S.setup.players = S.setup.players.filter((item) => item !== name);
    ensureTeams();
    saveSetup();
    render();
  }

  function addNames(list) {
    let added = 0;
    list.map(cleanName).filter(Boolean).forEach((name) => {
      let unique = name;
      let k = 2;
      while (S.setup.players.includes(unique)) unique = name + ' ' + k++;
      S.setup.players.push(unique);
      added += 1;
    });
    if (added) {
      ensureTeams();
      saveSetup();
    }
    render();
    const field = document.getElementById('name');
    if (field && added) field.focus();
  }

  function splitNames(text) {
    return String(text || '').split(/[\s,.;:!?]+/).map((part) => part.trim())
      .filter((part) => part && !/^(и|да|ещё|еще|а|это|нас|зовут)$/i.test(part));
  }

  async function voiceNames() {
    if (S.listeningNames) {
      await quiet(axiko.native('speech.stopListening'));
      return;
    }
    S.listeningNames = true;
    render();
    try {
      await quiet(call('wakeOff'));
      const text = await axiko.native('speech.listen', 10);
      const names = splitNames(text);
      if (!names.length) ui.toast('Не расслышал имён — попробуйте ещё раз');
      addNames(names);
    } finally {
      S.listeningNames = false;
      await quiet(call('wakeRestore'));
      render();
    }
  }

  /** Перетаскивание игрока между командами; касание без движения — в следующую команду. */
  function draggable(node, name) {
    let start = null;
    let ghost = null;
    let over = null;
    const reset = () => {
      if (ghost) ghost.remove();
      if (over) over.classList.remove('over');
      start = null;
      ghost = null;
      over = null;
    };
    node.addEventListener('pointerdown', (event) => {
      if (event.target.closest('.rm')) return;
      start = { x: event.clientX, y: event.clientY };
      node.setPointerCapture(event.pointerId);
    });
    node.addEventListener('pointermove', (event) => {
      if (!start) return;
      if (!ghost && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 8) {
        ghost = node.cloneNode(true);
        ghost.classList.add('ghost');
        document.body.appendChild(ghost);
      }
      if (!ghost) return;
      ghost.style.left = (event.clientX - ghost.offsetWidth / 2) + 'px';
      ghost.style.top = (event.clientY - 22) + 'px';
      const under = document.elementFromPoint(event.clientX, event.clientY);
      const team = under ? under.closest('.team') : null;
      if (over && over !== team) over.classList.remove('over');
      over = team;
      if (over) over.classList.add('over');
    });
    node.addEventListener('pointerup', () => {
      if (!start) return;
      const dragged = !!ghost;
      const target = over ? Number(over.dataset.team) : -1;
      reset();
      if (dragged) moveToTeam(name, target);
      else moveToTeam(name, (teamOf(name) + 1) % S.settings.teamCount);
    });
    node.addEventListener('pointercancel', reset);
    return node;
  }

  // ---- подготовка --------------------------------------------------------------------------------

  function deckNeed() {
    const s = S.settings;
    const n = S.setup.players.length || 6;
    const total = n * s.wordsPerPlayer;
    const own = s.ownWords ? n * Math.min(s.ownWordsPerPlayer, s.wordsPerPlayer) : 0;
    return { players: n, total, own, model: Math.max(0, total - own) };
  }

  function seatsBlock() {
    const players = S.setup.players;
    if (!players.length) return h('div', { class: 'empty' }, 'Добавьте игроков: по имени или голосом');
    return h('div', { class: 'section' },
      h('div', { class: 'list' }, players.map((name, i) => h('div', {},
        h('span', { class: 'seat' }, String(i + 1)),
        h('span', { class: 'grow' }, raw(name)),
        h('button', { class: 'icon-btn', 'aria-label': 'Убрать', onclick: () => removePlayer(name) }, ui.icon('close'))))),
      h('div', { class: 'row' },
        h('span', { class: 'small muted grow' }, 'Порядок — как сидите по кругу: в первом круге объясняют сидящему напротив'),
        players.length > 2 ? h('button', { class: 'btn small', onclick: () => {
          S.setup.players = R.shuffle(players);
          saveSetup();
          render();
        } }, ui.icon('refresh'), 'Перемешать') : null));
  }

  function teamsBlock() {
    ensureTeams();
    return h('div', { class: 'section' },
      h('div', { class: 'teams' }, S.setup.teams.map((members, t) => h('div', { class: 'team', 'data-team': String(t) },
        h('h3', {}, 'Команда ' + (t + 1)),
        members.map((name) => draggable(h('div', { class: 'pchip' },
          h('span', { class: 'grow' }, raw(name)),
          h('button', { class: 'icon-btn rm', 'aria-label': 'Убрать', onclick: () => removePlayer(name) }, ui.icon('close'))), name))))),
      h('div', { class: 'row' },
        h('span', { class: 'small muted grow' }, 'Перетащите игрока в другую команду или коснитесь — перейдёт в следующую'),
        h('button', { class: 'btn small', onclick: () => {
          const teams = R.splitTeams(S.settings.teamCount, S.setup.players);
          S.setup.teams = teams.map((team) => team.members.map((index) => S.setup.players[index]));
          saveSetup();
          render();
        } }, ui.icon('refresh'), 'Случайно')));
  }

  function playersSection() {
    const s = S.settings;
    const input = h('input', {
      class: 'input', id: 'name', placeholder: 'Имя игрока', maxlength: 24, enterkeyhint: 'done', autocomplete: 'off',
      onkeydown: (event) => {
        if (event.key === 'Enter') addNames([input.value]);
      }
    });
    const check = R.validate(s.mode, S.setup.players, s.mode === 'teams' ? teamsForRules() : []);
    return h('section', { class: 'section', id: 'players' },
      h('h2', {}, 'Игроки'),
      h('div', { class: 'field-row' }, input,
        h('button', { class: 'btn', id: 'add', onclick: () => addNames([input.value]) }, 'Добавить'),
        h('button', { class: 'icon-btn' + (S.listeningNames ? ' mic-on' : ''), id: 'voice-names', 'aria-label': 'Назвать голосом', onclick: act(voiceNames) },
          S.listeningNames ? h('span', { class: 'spinner' }) : ui.icon('mic'))),
      h('div', { class: 'chips' },
        chip('Пары', s.mode === 'pairs', () => setSetting({ mode: 'pairs' })),
        chip('Команды', s.mode === 'teams', () => {
          setSetting({ mode: 'teams' });
          ensureTeams();
        })),
      s.mode === 'teams' ? h('div', { class: 'chips' }, [2, 3, 4].map((n) => chip(n + ' команды', s.teamCount === n, () => {
        S.settings.teamCount = n;
        ensureTeams();
        setSetting({ teamCount: n });
      }))) : null,
      s.mode === 'teams' ? teamsBlock() : seatsBlock(),
      S.setup.players.length && !check.ok ? h('p', { class: 'warn', id: 'players-warn' }, check.why) : null);
  }

  function deckLine(need) {
    if (!need.own) return 'В колоде будет ' + words(need.total) + ' (' + need.players + ' × ' + S.settings.wordsPerPlayer + ')';
    return 'В колоде ' + words(need.total) + ': ' + need.model + ' подберёт модель, по ' +
      Math.min(S.settings.ownWordsPerPlayer, S.settings.wordsPerPlayer) + ' впишет каждый';
  }

  function sourceText(source) {
    return { model: 'от модели', offline: 'запасной словарь', mixed: 'модель и запасной словарь' }[source] || '';
  }

  function deckStatus(need) {
    if (S.building) {
      return h('div', { class: 'status', id: 'deck-status' }, h('span', { class: 'spinner' }),
        'Модель подбирает ' + words(need.model) + ', обычно 15–30 секунд');
    }
    const parts = [];
    if (S.deck) {
      const count = S.deck.cards ? S.deck.cards.length : S.deck.count;
      parts.push(h('div', { class: 'card accent', id: 'deck-ready' },
        h('b', {}, 'Колода готова: ' + words(count)),
        h('div', { class: 'small muted' }, raw([S.deck.theme || 'общее', 'сложность ' + S.deck.difficulty, sourceText(S.deck.source)].join(' · '))),
        count < need.model ? h('div', { class: 'small warn' }, 'Нужно ' + need.model + ' — недостающие возьмём из запасного словаря') : null));
    }
    if (S.buildNote) parts.push(h('p', { class: 'warn' }, S.buildNote));
    return parts.length ? h('div', { class: 'section' }, parts) : null;
  }

  async function chooseDeck(id) {
    S.deck = await call('deck', id);
    S.buildNote = '';
    saveSetup();
    render();
  }

  function savedDecks() {
    const list = S.decks.filter((item) => !item.played && (!S.deck || item.id !== S.deck.id));
    if (!list.length) return null;
    return h('div', { class: 'section' },
      h('h2', {}, 'Собранные заранее'),
      h('div', { class: 'list' }, list.slice(0, 8).map((item) => h('div', {},
        h('button', { class: 'grow', style: 'background:none;border:0;text-align:left;padding:0;min-height:44px', onclick: act(() => chooseDeck(item.id)) },
          raw((item.theme || 'общее') + ' · ' + item.difficulty + ' · ' + words(item.count)),
          h('span', { class: 'small muted', style: 'display:block' }, ui.ago(item.created))),
        h('button', { class: 'icon-btn' + (item.keep ? ' mic-on' : ''), 'aria-label': 'Хранить', onclick: act(async () => {
          await call('keepDeck', item.id, !item.keep);
          S.decks = await call('decks');
          render();
        }) }, ui.icon('star')),
        h('button', { class: 'icon-btn', 'aria-label': 'Удалить', onclick: act(async () => {
          await call('removeDeck', item.id);
          S.decks = await call('decks');
          render();
        }) }, ui.icon('trash'))))));
  }

  function deckSection() {
    const s = S.settings;
    const need = deckNeed();
    return h('section', { class: 'section', id: 'deck' },
      h('h2', {}, 'Колода'),
      h('div', { class: 'chips' },
        C.THEMES.map((theme) => chip(theme, s.theme === theme, () => setSetting({ theme }))),
        chip('своя тема', s.theme === '*', () => setSetting({ theme: '*' }))),
      s.theme === '*' ? h('input', {
        class: 'input', id: 'custom-theme', placeholder: 'Например: космос, офис, детство', value: s.customTheme,
        onchange: (event) => setSetting({ customTheme: event.target.value })
      }) : null,
      h('div', { class: 'option' },
        h('div', { class: 'grow' }, 'Сложность', h('span', { class: 'examples', style: 'display:block' }, D.LEVELS[s.difficulty])),
        h('div', { class: 'chips' }, [1, 2, 3, 4, 5].map((n) => chip(String(n), s.difficulty === n, () => setSetting({ difficulty: n }))))),
      stepperRow('Слов на игрока', 'wordsPerPlayer'),
      switchRow('Свои слова игроков', 'ownWords', 'каждый втайне вписывает свои, передавая телефон по кругу'),
      s.ownWords ? stepperRow('Своих слов на игрока', 'ownWordsPerPlayer') : null,
      h('p', { class: 'muted small' }, deckLine(need)),
      deckStatus(need),
      need.model > 0 ? h('div', { class: 'row' },
        h('button', { class: 'btn soft grow', id: 'build', disabled: S.building, onclick: act(() => build(false)) }, ui.icon('spark'), 'Собрать колоду'),
        h('button', { class: 'btn', id: 'build-offline', disabled: S.building, onclick: act(() => build(true)) }, 'Без сети')) : null,
      savedDecks());
  }

  function gameSection() {
    const s = S.settings;
    return h('section', { class: 'section' },
      h('h2', {}, 'Ход'),
      h('div', { class: 'card flat' },
        stepperRow('Время хода', 'turnSeconds', '', 10),
        h('div', { class: 'option' },
          h('div', { class: 'grow' }, 'Раунды', h('span', { class: 'small muted' }, roundsHint(s.rounds))),
          h('div', { class: 'chips' }, [1, 2, 3].map((n) => chip(String(n), s.rounds === n, () => setSetting({ rounds: n }))))),
        switchRow('Автозачёт голосом', 'autoVoice', 'телефон сам слышит угаданное слово'),
        switchRow('Горячее слово', 'hotWord', 'раз в раунд одно слово стоит ' + s.hotPoints + ' очка; отметку видит только объясняющий')),
      h('button', { class: 'btn primary wide big-btn', id: 'start', disabled: S.building, onclick: act(startGame) }, ui.icon('play'), 'Начать'),
      h('p', { class: 'muted small' },
        'Советы: приглушите музыку и держите телефон микрофоном к угадывающим. Телефон не отличает, кто говорит: если объясняющий назвал слово — жмите «Отмена».'));
  }

  function resumeCard() {
    const g = S.saved;
    return h('div', { class: 'card accent', id: 'resume' },
      h('b', {}, 'Незаконченная игра'),
      h('p', { class: 'small muted' }, raw(g.players.length + ' игроков · раунд ' + g.round + ' из ' + g.rounds + ' · ходов: ' + g.turns.length)),
      h('div', { class: 'row', style: 'margin-top:10px' },
        h('button', { class: 'btn primary', id: 'resume-go', onclick: act(resumeGame) }, ui.icon('play'), 'Продолжить'),
        h('button', { class: 'btn', onclick: act(async () => {
          if (!(await ui.confirm('Завершить ту игру и посмотреть итоги?', 'Завершить'))) return;
          S.game = S.saved;
          S.saved = null;
          S.game.live = null;
          enterStage();
          await finishGame();
        }) }, 'Завершить')));
  }

  function renderSetup() {
    const page = h('main', { class: 'page setup' },
      h('header', { class: 'topbar' },
        h('button', { class: 'icon-btn', 'aria-label': 'Назад', onclick: () => axiko.back() }, ui.icon('back')),
        h('h1', {}, 'Шляпа'),
        h('button', { class: 'icon-btn', 'aria-label': 'Правила', onclick: showRules }, ui.icon('info')),
        h('button', { class: 'icon-btn', 'aria-label': 'Статистика', onclick: act(showStats) }, ui.icon('chart')),
        h('button', { class: 'icon-btn', 'aria-label': 'Настройки', id: 'open-settings', onclick: showSettings }, ui.icon('settings'))),
      S.saved ? resumeCard() : null,
      h('div', { class: 'cols' }, playersSection(), deckSection()),
      gameSection());
    app.replaceChildren(page);
  }

  async function build(offline) {
    const need = deckNeed();
    S.building = true;
    S.buildNote = '';
    render();
    try {
      const options = { theme: themeValue(), difficulty: S.settings.difficulty, count: Math.max(1, need.model) };
      const made = await call(offline ? 'offlineDeck' : 'buildDeck', options);
      S.deck = made;
      if (made.error) S.buildNote = 'Модель недоступна (' + made.error.slice(0, 120) + ') — слова из запасного словаря';
      else if (made.source === 'mixed') S.buildNote = 'Модель дала не все слова — остальные из запасного словаря';
      saveSetup();
      S.decks = await call('decks');
    } finally {
      S.building = false;
      render();
    }
  }

  // ---- начало игры ----------------------------------------------------------------------------

  async function startGame() {
    const s = S.settings;
    const players = S.setup.players.slice();
    const teams = s.mode === 'teams' ? teamsForRules() : [];
    const check = R.validate(s.mode, players, teams);
    if (!check.ok) {
      ui.toast(check.why);
      return;
    }
    ensureAudio();
    const need = deckNeed();
    let cards = [];
    if (need.model > 0) {
      if (!S.deck || !S.deck.cards || !S.deck.cards.length) await build(false);
      if (!S.deck) return;
      cards = S.deck.cards.slice(0, need.model);
      if (cards.length < need.model) {
        const more = await call('offlineDeck', { difficulty: s.difficulty, count: need.model - cards.length });
        cards = cards.concat(more.cards);
      }
    }
    const settings = Object.assign({}, s);
    const game = R.create({ mode: s.mode, players, teams, cards, settings, deckId: S.deck ? S.deck.id : null, now: Date.now() });
    game.phase = s.ownWords ? 'own' : 'between';
    game.own = s.ownWords ? { player: 0, shown: false } : null;
    game.lastTurn = null;
    game.roundEnded = false;
    game.id = await call('gameStart', { mode: game.mode, players, teams, settings, deckId: game.deckId });
    S.game = game;
    S.deck = null;
    S.saved = null;
    saveSetup();
    enterStage();
    S.view = game.phase;
    persist(true);
    render();
  }

  async function resumeGame() {
    const g = S.saved;
    S.saved = null;
    S.game = g;
    if (g.live) {
      if (g.live.phase === 'count') {
        g.live = null;
        g.phase = 'between';
      } else {
        if (g.live.card === null || g.live.card === undefined) g.live.card = R.draw(g);
        if (g.live.phase !== 'paused') g.live.pausedFrom = g.live.phase;
        g.live.phase = 'paused';
        g.live.ending = false;
        g.live.busy = false;
      }
    }
    if (g.phase === 'turn' && !g.live) g.phase = 'between';
    await call('wakeOff');
    enterStage();
    S.view = g.phase === 'turn' ? 'turn' : g.phase;
    persist(true);
    render();
  }

  // ---- весь экран, пульс, сохранение -----------------------------------------------------------

  let heartbeat = null;

  function enterStage() {
    quiet(axiko.stage(true));
    clearInterval(heartbeat);
    heartbeat = setInterval(() => quiet(call('beat')), S.settings.heartbeatSeconds * 1000);
    quiet(call('beat'));
  }

  function leaveStage() {
    clearInterval(heartbeat);
    heartbeat = null;
    quiet(axiko.stage(false));
  }

  let persistTimer = null;

  function persist(now) {
    clearTimeout(persistTimer);
    const run = () => {
      if (S.game && !S.game.test) quiet(call('saveState', { game: S.game }));
    };
    if (now) run();
    else persistTimer = setTimeout(run, 400);
  }

  function stageView(...children) {
    app.replaceChildren(h('div', { class: 'stage' }, children));
  }

  function scrollStage(...children) {
    app.replaceChildren(h('div', { class: 'stage scroll' }, h('div', { class: 'stage-inner' }, children)));
  }

  function exitButton(onclick) {
    return h('button', { class: 'exit', id: 'exit', onclick: act(onclick) }, ui.icon('close'), 'Выход');
  }

  function roundTitle(g) {
    return 'Раунд ' + g.round + ' из ' + g.rounds + ' · ' + R.roundName(g.round);
  }

  async function exitGame() {
    const g = S.game;
    if (!g) return;
    pauseTurn();
    if (!(await ui.confirm('Выйти из игры? Её можно будет продолжить с этого места.', 'Выйти'))) return;
    await Mic.stop();
    stopClock();
    persist(true);
    await quiet(call('wakeRestore'));
    leaveStage();
    S.saved = g;
    S.game = null;
    S.view = 'setup';
    render();
  }

  async function confirmFinish() {
    if (!(await ui.confirm('Завершить игру сейчас и посмотреть итоги?', 'Завершить'))) return;
    await finishGame();
  }

  // ---- свои слова игроков ----------------------------------------------------------------------

  function renderOwn() {
    const g = S.game;
    const s = g.settings;
    const name = g.players[g.own.player];
    const count = Math.min(s.ownWordsPerPlayer, s.wordsPerPlayer);
    if (!g.own.shown) {
      scrollStage(
        h('div', { class: 'stage-top' }, exitButton(exitGame), h('span', { class: 'round-label' }, 'Свои слова · ' + (g.own.player + 1) + ' из ' + g.players.length)),
        g.own.player > 0 ? h('p', { class: 'pass' }, 'Передайте телефон ', raw(dative(name))) : null,
        h('p', { class: 'hero' }, 'Ход ', h('span', { class: 'accent' }, raw(genitive(name))), ': впишите ' + words(count)),
        h('p', { class: 'rule-line' }, 'Остальные не смотрят. Слова увидят только объясняющие во время игры.'),
        h('button', { class: 'btn primary wide go', id: 'own-show', onclick: () => {
          g.own.shown = true;
          render();
        } }, 'Я ', raw(name), ' — вписать'));
      return;
    }
    const fields = [];
    const notes = [];
    const done = h('button', { class: 'btn primary wide go', id: 'own-done', disabled: true }, ui.icon('check'), 'Готово');
    const validate = () => {
      let ok = true;
      fields.forEach((field, i) => {
        const word = field.value.trim();
        const others = fields.filter((other, k) => k !== i).map((other) => other.value.trim()).filter(Boolean);
        const taken = g.cards.map((card) => card.word).concat(others);
        const problem = word ? D.ownWordProblem(word, taken, s.maxWordLetters) : '';
        notes[i].textContent = problem;
        if (!word || problem) ok = false;
      });
      done.disabled = !ok;
    };
    for (let i = 0; i < count; i++) {
      const field = h('input', {
        class: 'input', 'data-own': String(i), placeholder: 'Слово ' + (i + 1), autocomplete: 'off', autocapitalize: 'off',
        maxlength: 40, oninput: validate
      });
      field.spellcheck = false;
      fields.push(field);
      notes.push(h('span', { class: 'warn' }));
      fields[i].addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && fields[i + 1]) fields[i + 1].focus();
      });
    }
    done.addEventListener('click', act(() => {
      const cards = fields.map((field) => ({ word: field.value.trim().toLowerCase().replace(/\s+/g, ' '), forms: [], roots: [], difficulty: 3, owner: name }));
      cards.forEach((card) => g.cards.push(card));
      quiet(call('formsFor', cards).then((answer) => applyForms(answer.cards)));
      g.own.player += 1;
      g.own.shown = false;
      if (g.own.player >= g.players.length) {
        R.startRound(g);
        g.own = null;
        g.phase = 'between';
        S.view = 'between';
      }
      persist(true);
      render();
    }));
    scrollStage(
      h('div', { class: 'stage-top' }, exitButton(exitGame), h('span', { class: 'round-label' }, raw(name))),
      h('p', { class: 'hero' }, 'Ваши ' + words(count)),
      fields.map((field, i) => h('div', { class: 'own-field' }, field, notes[i])),
      done);
    fields[0].focus();
  }

  function applyForms(list) {
    const g = S.game;
    if (!g || !list) return;
    list.forEach((made) => {
      const card = g.cards.find((item) => item.owner === made.owner && M.normalize(item.word) === M.normalize(made.word));
      if (card && made.forms && made.forms.length) {
        card.forms = made.forms;
        card.roots = made.roots || [];
      }
    });
    persist();
  }

  // ---- между ходами ------------------------------------------------------------------------------

  const MARKS = {
    guessed: ['Угадано', 'check'],
    last: ['Последнее', 'check'],
    skipped: ['Пропуск', 'right'],
    undone: ['Отменено', 'close']
  };

  function scoreBlock(g) {
    const table = R.scores(g);
    const rows = g.mode === 'teams'
      ? g.teams.map((team, i) => ({ name: team.name, sub: team.members.map((p) => g.players[p]).join(', '), points: table.teams[i] }))
      : g.players.map((name, i) => ({ name, sub: '', points: table.players[i] }));
    const top = Math.max.apply(null, rows.map((row) => row.points));
    return h('div', { class: 'score-table', id: 'scores' }, rows.map((row) => h('div', { class: 'score' + (row.points === top && top > 0 ? ' lead' : '') },
      h('div', { class: 'who' }, h('b', {}, raw(row.name)), row.sub ? h('span', { class: 'small', style: 'display:block' }, raw(row.sub)) : null),
      h('span', { class: 'points' }, String(row.points)))));
  }

  function turnRecord(g, turn) {
    return {
      round: turn.round,
      started: turn.started,
      explainerName: g.players[turn.explainer],
      guesserName: g.mode === 'teams' ? g.teams[turn.team].name : g.players[turn.guesser],
      results: turn.results.map((entry) => ({
        word: g.cards[entry.card].word, result: entry.result, ms: entry.ms, heard: entry.heard || '', how: entry.how || '', latency: entry.latency || 0
      }))
    };
  }

  function lastTurnBlock(g) {
    if (g.lastTurn === null || g.lastTurn === undefined || !g.turns[g.lastTurn]) return null;
    const index = g.lastTurn;
    const turn = g.turns[index];
    const guessed = turn.results.filter((entry) => R.counts(entry.result)).length;
    const guesser = g.mode === 'teams' ? g.teams[turn.team].name : g.players[turn.guesser];
    return h('section', { class: 'section', id: 'review' },
      h('h2', {}, 'Прошлый ход'),
      h('p', { class: 'muted' }, raw(g.players[turn.explainer] + ' → ' + guesser), ' · угадано ' + guessed),
      turn.results.length ? h('div', { class: 'review' }, turn.results.map((entry, k) => {
        const mark = MARKS[entry.result] || MARKS.skipped;
        const info = [];
        if (entry.heard) info.push('услышано: «' + entry.heard + '»');
        if (R.counts(entry.result) && g.mode === 'pairs') info.push('угадано · ' + guesser);
        return h('button', { class: 'review-row', onclick: act(() => changeResult(index, k)) },
          h('div', { class: 'grow' }, h('b', {}, raw(g.cards[entry.card].word)), entry.hot ? h('span', { class: 'hot' }, ui.icon('star')) : null,
            info.length ? h('span', { class: 'small' }, raw(info.join(' · '))) : null),
          h('span', { class: 'mark ' + (entry.result === 'last' ? 'guessed' : entry.result) }, ui.icon(mark[1]), mark[0]));
      })) : h('p', { class: 'muted' }, 'Ни одного слова'),
      turn.results.length ? h('p', { class: 'small muted' }, 'Спорное — коснитесь, чтобы исправить') : null);
  }

  async function changeResult(turnIndex, entryIndex) {
    const g = S.game;
    const turn = g.turns[turnIndex];
    const entry = turn.results[entryIndex];
    R.setResult(g, turnIndex, entryIndex, R.nextResult(entry.result));
    persist(true);
    render();
    if (turn.dbId) await call('turnUpdate', g.id, turn.dbId, turnRecord(g, turn).results);
  }

  function renderBetween() {
    const g = S.game;
    const w = R.who(g, g.turns.length);
    const explainer = g.players[w.explainer];
    const target = g.mode === 'teams' ? g.teams[w.team].name + ' (вся команда)' : g.players[w.guesser];
    scrollStage(
      h('div', { class: 'stage-top' }, exitButton(exitGame), h('span', { class: 'round-label' }, roundTitle(g)),
        h('button', { class: 'btn small', id: 'finish', onclick: act(confirmFinish) }, 'Завершить')),
      g.roundEnded ? h('div', { class: 'card accent' }, 'Раунд ' + (g.round - 1) + ' окончен. Теперь — ' + R.roundName(g.round) + '.') : null,
      h('p', { class: 'hero', id: 'next-pair' }, h('span', { class: 'accent' }, raw(explainer)), ' → ', raw(target)),
      h('p', { class: 'pass' }, 'Передайте телефон ', raw(dative(explainer))),
      h('p', { class: 'rule-line' }, R.roundRule(g.round)),
      h('p', { class: 'muted' }, 'В шляпе ' + g.hat.length + ' из ' + g.cards.length),
      h('button', { class: 'btn primary wide go', id: 'go', onclick: act(beginTurn) }, ui.icon('play'), 'Начать ход'),
      scoreBlock(g),
      lastTurnBlock(g));
  }

  // ---- звук ------------------------------------------------------------------------------------

  let audio = null;

  function ensureAudio() {
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
    } catch (error) {
      audio = null;
    }
  }

  function tone(freq, ms, volume, type) {
    if (!audio || !(volume > 0)) return;
    const t = audio.currentTime;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(Math.min(1, volume), t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
    osc.connect(gain).connect(audio.destination);
    osc.start(t);
    osc.stop(t + ms / 1000 + 0.02);
  }

  function volume(listening) {
    const s = S.game ? S.game.settings : S.settings;
    return (listening && s.quietWhileListening ? s.tickQuietVolume : s.tickVolume) / 100;
  }

  function tickSound() {
    tone(1300, 35, volume(Mic.active) * 0.6, 'square');
  }

  function beep(high) {
    tone(high ? 990 : 660, 130, volume(false) * 0.7);
  }

  function ding() {
    if (Mic.active && volume(true) < volume(false)) return;
    tone(880, 110, volume(false) * 0.5);
  }

  function endSound() {
    tone(660, 180, volume(false) * 0.7);
    setTimeout(() => tone(440, 320, volume(false) * 0.7), 190);
  }

  function vibrate(ms) {
    if (ms > 0) quiet(call('vibrate', ms));
  }

  // ---- микрофон --------------------------------------------------------------------------------

  const stats = { chunks: 0, recognizeMs: 0 };

  const Mic = {
    active: false,
    gen: 0,
    stream: false,
    handler: null,
    startedAt: 0,
    processingAt: 0,
    async start(handler) {
      if (this.active) return;
      this.active = true;
      this.handler = handler;
      this.settings = (S.game || S).settings;
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
          stats.chunks += 1;
          const recognize = this.processingAt >= begun ? done - this.processingAt : 0;
          stats.recognizeMs += recognize;
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
            ui.toast('Микрофон: ' + error.message + ' — засчитывайте кнопкой');
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
    if (!node) return;
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

  // Поток кончился сам (предел минут, ошибка распознавания) посреди хода — дальше кусками.
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

  function micIndicator() {
    const s = S.game.settings;
    if (!s.autoVoice) return h('span', { class: 'mic', id: 'mic', title: 'Автозачёт выключен' }, ui.icon('mute'));
    return h('span', { class: 'mic' + (Mic.active ? ' on' : ''), id: 'mic', title: 'Микрофон' }, ui.icon('mic'), h('span', { class: 'level' }, h('i')));
  }

  // ---- ход -----------------------------------------------------------------------------------

  let clock = null;
  let clockPrev = 0;
  let sinceSave = 0;

  function startClock() {
    stopClock();
    clockPrev = performance.now();
    clock = setInterval(tick, 100);
  }

  function stopClock() {
    clearInterval(clock);
    clock = null;
  }

  function tick() {
    const g = S.game;
    const live = g && g.live;
    if (!live) return;
    const s = g.settings;
    const now = performance.now();
    const dt = Math.min(1000, now - clockPrev);
    clockPrev = now;
    if (live.phase === 'run') {
      live.remaining -= dt;
      const sec = Math.ceil(live.remaining / 1000);
      if (sec !== live.lastTick && sec > 0 && sec <= s.tickSeconds) {
        live.lastTick = sec;
        tickSound();
        vibrate(s.tickVibrateMs);
      }
      if (live.remaining <= 0) {
        live.remaining = 0;
        if (live.card !== null && s.lastWordSeconds > 0) {
          live.phase = 'last';
          live.lastLeft = s.lastWordSeconds * 1000;
          renderTurn();
        } else {
          endTurn();
          return;
        }
      }
    } else if (live.phase === 'last') {
      live.lastLeft -= dt;
      if (live.lastLeft <= 0) {
        endTurn();
        return;
      }
    }
    sinceSave += dt;
    if (sinceSave > 5000) {
      sinceSave = 0;
      persist();
    }
    updateClock();
  }

  function updateClock() {
    const g = S.game;
    const live = g && g.live;
    if (!live) return;
    const s = g.settings;
    const total = s.turnSeconds * 1000;
    const late = live.phase === 'last' || live.remaining <= s.tickSeconds * 1000;
    const clockNode = document.getElementById('clock');
    if (clockNode) {
      clockNode.textContent = String(Math.max(0, Math.ceil((live.phase === 'last' ? live.lastLeft : live.remaining) / 1000)));
      clockNode.className = 'clock' + (late ? ' late' : '');
    }
    const bar = document.getElementById('bar');
    if (bar) {
      bar.className = 'timebar' + (late ? ' late' : '');
      bar.firstChild.style.transform = 'scaleX(' + Math.max(0, live.remaining / total) + ')';
    }
    const slot = document.getElementById('undo-slot');
    const left = live.undoUntil - Date.now();
    if (slot) {
      const button = slot.querySelector('.undo');
      if (left <= 0 && button) slot.replaceChildren();
      else if (button) button.querySelector('.left').style.width = Math.max(0, left / (s.undoSeconds * 1000) * 100) + '%';
    }
  }

  function countdown(n, live) {
    return new Promise((resolve) => {
      if (!n) {
        resolve(true);
        return;
      }
      let left = n;
      const number = h('div', { class: 'count', id: 'count' }, String(left));
      const overlay = h('div', { class: 'overlay' }, number, h('p', { class: 'rule-line' }, 'Объясняющий смотрит на экран, остальные — нет'));
      app.appendChild(overlay);
      beep(false);
      const timer = setInterval(() => {
        if (!S.game || S.game.live !== live) {
          clearInterval(timer);
          overlay.remove();
          resolve(false);
          return;
        }
        left -= 1;
        if (left <= 0) {
          clearInterval(timer);
          beep(true);
          overlay.remove();
          resolve(true);
          return;
        }
        number.textContent = String(left);
        beep(false);
      }, 1000);
    });
  }

  async function beginTurn() {
    const g = S.game;
    const s = g.settings;
    ensureAudio();
    const w = R.who(g, g.turns.length);
    const live = {
      turn: { round: g.round, explainer: w.explainer, guesser: w.guesser, team: w.team, started: Date.now(), ms: 0, results: [] },
      card: null, shownAt: 0, remaining: s.turnSeconds * 1000, lastLeft: 0, phase: 'count', undoUntil: 0, undoWord: '',
      undoHeard: '', heard: '', lastTick: null, ending: false
    };
    g.live = live;
    g.phase = 'turn';
    g.roundEnded = false;
    S.view = 'turn';
    render();
    const go = await countdown(s.countdownSeconds, live);
    if (!go || !S.game || S.game.live !== live) return;
    live.card = R.draw(g);
    live.shownAt = Date.now();
    live.phase = 'run';
    renderTurn();
    startClock();
    if (s.autoVoice) Mic.start(onHeard);
    persist(true);
  }

  function onHeard(text, meta) {
    const g = S.game;
    const live = g && g.live;
    if (!live || live.card === null || (live.phase !== 'run' && live.phase !== 'last')) return;
    live.heard = text.length > 70 ? '…' + text.slice(-70) : text;
    const heardNode = document.getElementById('heard');
    if (heardNode) heardNode.textContent = live.heard;
    const found = M.matches(text, g.cards[live.card], C.matchOptions(g.settings));
    if (found.ok) guessed({ auto: true, heard: found.token, how: found.how, latency: meta && meta.latency });
  }

  function guessed(info) {
    const g = S.game;
    const live = g && g.live;
    if (!live || live.busy || live.card === null || (live.phase !== 'run' && live.phase !== 'last')) return;
    const s = g.settings;
    const now = Date.now();
    const wasLast = live.phase === 'last';
    const entry = R.settle(g, live.turn, {
      card: live.card, result: wasLast ? 'last' : 'guessed', ms: now - live.shownAt,
      heard: info.heard || '', how: info.how || 'manual', latency: info.latency || 0
    });
    vibrate(s.vibrateMs);
    ding();
    live.undoUntil = now + s.undoSeconds * 1000;
    live.undoWord = g.cards[entry.card].word;
    live.undoHeard = entry.heard;
    nextCard(wasLast);
  }

  function skip() {
    const g = S.game;
    const live = g && g.live;
    if (!live || live.busy || live.card === null) return;
    if (live.phase === 'last') {
      endTurn();
      return;
    }
    if (live.phase !== 'run') return;
    R.settle(g, live.turn, { card: live.card, result: 'skipped', ms: Date.now() - live.shownAt, heard: '', how: '' });
    nextCard(false);
  }

  function undo() {
    const g = S.game;
    const live = g && g.live;
    if (!live || Date.now() > live.undoUntil) return;
    const entry = R.undoLast(g, live.turn);
    live.undoUntil = 0;
    if (entry) {
      vibrate(g.settings.vibrateMs);
      ui.toast('Отменено: ' + g.cards[entry.card].word);
    }
    if (live.card === null && g.hat.length) {
      live.card = R.draw(g);
      live.shownAt = Date.now();
    }
    renderTurn();
    persist();
  }

  /** Слово уходит вверх, следующее появляется (или ход кончается: шляпа пуста, последнее слово). */
  function nextCard(endNow) {
    const g = S.game;
    const live = g.live;
    live.busy = true;
    // Пока слово улетает, карты «в руке» нет: конец хода в эти доли секунды не вернёт угаданное в шляпу.
    live.card = null;
    const word = document.getElementById('word');
    if (word) {
      word.classList.remove('enter');
      word.classList.add('fly');
    }
    setTimeout(() => {
      live.busy = false;
      if (S.game !== g || g.live !== live) return;
      live.card = endNow ? null : R.draw(g);
      if (live.card === null) {
        endTurn();
        return;
      }
      live.shownAt = Date.now();
      renderTurn();
      persist();
    }, 170);
  }

  function pauseTurn() {
    const live = S.game && S.game.live;
    if (!live || (live.phase !== 'run' && live.phase !== 'last')) return;
    live.pausedFrom = live.phase;
    live.phase = 'paused';
    stopClock();
    quiet(Mic.stop());
    persist(true);
    renderTurn();
  }

  function resumeTurn() {
    const g = S.game;
    const live = g && g.live;
    if (!live || live.phase !== 'paused') return;
    ensureAudio();
    if (live.card === null) {
      endTurn();
      return;
    }
    live.phase = live.pausedFrom || 'run';
    live.shownAt = Date.now();
    renderTurn();
    startClock();
    if (g.settings.autoVoice) Mic.start(onHeard);
  }

  async function endTurn() {
    const g = S.game;
    const live = g && g.live;
    if (!live || live.ending) return;
    live.ending = true;
    stopClock();
    await Mic.stop();
    if (live.card !== null && live.card !== undefined) R.returnToHat(g, live.card);
    const turn = live.turn;
    turn.ms = Math.round(g.settings.turnSeconds * 1000 - Math.max(0, live.remaining));
    g.turns.push(turn);
    const index = g.turns.length - 1;
    endSound();
    const after = R.afterTurn(g);
    g.live = null;
    g.lastTurn = index;
    g.roundEnded = after.roundEnded && !after.finished;
    g.phase = after.finished ? 'results' : 'between';
    S.view = after.finished ? 'turn-end' : 'between';
    persist(true);
    render();
    if (g.test) return;
    try {
      turn.dbId = await call('turnSave', g.id, turnRecord(g, turn));
      persist();
    } catch (error) {
      ui.toast('Ход не записался: ' + error.message);
    }
    if (after.finished) await finishGame();
  }

  function fitWord(node, s) {
    if (!node.isConnected) return;
    let size = s.wordMaxPx;
    node.style.fontSize = size + 'px';
    while (size > s.wordMinPx && (node.scrollWidth > node.clientWidth + 1 || node.scrollHeight > node.parentNode.clientHeight * 0.7)) {
      size -= 2;
      node.style.fontSize = size + 'px';
    }
  }

  function renderTurn() {
    const g = S.game;
    const live = g && g.live;
    if (!live) return;
    const s = g.settings;
    const card = live.card !== null && live.card !== undefined ? g.cards[live.card] : null;
    const hot = card && live.card === g.hot;
    const undoLeft = live.undoUntil - Date.now();
    const word = h('div', { class: 'word enter', id: 'word' }, card ? raw(card.word) : '');
    stageView(
      h('div', { class: 'stage-top' }, exitButton(exitGame), h('span', { class: 'round-label' }, 'Раунд ' + g.round + ' · ' + R.roundName(g.round)),
        micIndicator(), h('span', { class: 'clock', id: 'clock' }, '')),
      h('div', { class: 'timebar', id: 'bar' }, h('i')),
      h('div', { class: 'word-box' },
        hot ? h('span', { class: 'hot', id: 'hot' }, ui.icon('star'), 'Горячее слово: ' + s.hotPoints + ' очка') : null,
        word,
        card && card.roots && card.roots.length ? h('div', { class: 'ban' }, 'нельзя: ', raw(card.roots.map((root) => root + '…').join(', '))) : null,
        live.phase === 'last' ? h('div', { class: 'warn' }, 'Время вышло — последнее слово!') : null,
        h('div', { class: 'heard', id: 'heard' }, live.heard ? raw(live.heard) : '')),
      h('div', { class: 'undo-slot', id: 'undo-slot' }, undoLeft > 0 ? h('button', { class: 'undo', id: 'undo', onclick: act(undo) },
        ui.icon('undo'), h('span', { class: 'undo-text' }, 'Отмена: ', raw(live.undoWord)),
        live.undoHeard && M.normalize(live.undoHeard) !== M.normalize(live.undoWord) ? h('span', { class: 'undo-heard' }, raw('«' + live.undoHeard + '»')) : null,
        h('span', { class: 'left' })) : null),
      h('div', { class: 'turn-buttons' },
        h('button', { class: 'btn', id: 'skip', onclick: act(skip) }, live.phase === 'last' ? 'Не успели' : 'Пропуск'),
        h('button', { class: 'btn primary', id: 'guessed', onclick: act(() => guessed({})) }, ui.icon('check'), 'Угадали')));
    if (live.phase === 'paused') {
      app.appendChild(h('div', { class: 'overlay', id: 'paused' },
        h('p', { class: 'hero' }, 'Пауза'),
        h('p', { class: 'rule-line' }, 'Осталось ' + Math.ceil(live.remaining / 1000) + ' с'),
        h('button', { class: 'btn primary wide go', id: 'resume-turn', onclick: act(resumeTurn) }, ui.icon('play'), 'Продолжить ход'),
        h('button', { class: 'btn wide go', onclick: act(endTurn) }, 'Закончить ход'),
        h('button', { class: 'btn wide', onclick: act(exitGame) }, 'Выйти из игры')));
    }
    if (Mic.active) micState('on');
    updateClock();
    requestAnimationFrame(() => fitWord(word, s));
  }

  // ---- итоги -----------------------------------------------------------------------------------

  async function finishGame() {
    const g = S.game;
    if (!g) return;
    if (g.live) {
      stopClock();
      await Mic.stop();
      if (g.live.card !== null && g.live.card !== undefined) R.returnToHat(g, g.live.card);
      g.live = null;
    }
    const summary = R.summary(g);
    const unguessed = g.cards.filter((card) => summary.neverGuessed.includes(card.word));
    S.results = { game: g, summary, chunks: stats.chunks, recognizeMs: stats.recognizeMs };
    S.game = null;
    S.view = 'results';
    render();
    try {
      await call('gameEnd', g.id, { scores: R.scores(g), summary, players: g.players, unguessed });
    } finally {
      clearInterval(heartbeat);
      heartbeat = null;
    }
  }

  function fact(label, value, sub) {
    return h('div', { class: 'fact' }, h('span', { class: 'label' }, label), h('span', { class: 'value' }, value), sub ? h('span', { class: 'small muted' }, sub) : null);
  }

  function renderResults() {
    const { game: g, summary } = S.results;
    const facts = [];
    if (summary.bestExplainer) facts.push(fact('Лучший объясняющий', raw(summary.bestExplainer.name), decimal(summary.bestExplainer.perMinute) + ' слова в минуту'));
    if (summary.fastest) facts.push(fact('Самое быстрое слово', raw(summary.fastest.word), seconds(summary.fastest.ms) + ' · объяснял(а) ' + summary.fastest.by));
    if (summary.hardest && (summary.hardest.skips > 0 || summary.hardest.ms >= 20000)) facts.push(fact('Самое трудное слово', raw(summary.hardest.word), 'пропусков: ' + summary.hardest.skips + ' · ' + seconds(summary.hardest.ms)));
    facts.push(fact('Угадано слов', String(summary.words)));
    if (summary.autoCount) {
      const recognize = S.results.chunks ? ' · распознавание куска ' + seconds(S.results.recognizeMs / S.results.chunks) : '';
      facts.push(fact('Автозачёт голосом', summary.autoCount + ' ' + plural(summary.autoCount, 'раз', 'раза', 'раз'), 'от конца фразы до зачёта в среднем ' + seconds(summary.latency) + recognize));
    }
    scrollStage(
      h('div', { class: 'stage-top' }, h('span', { class: 'round-label' }, 'Итоги'),
        h('button', { class: 'exit', id: 'exit', onclick: act(toSetup) }, ui.icon('close'), 'Выход')),
      h('p', { class: 'hero' }, 'Победа: ', h('span', { class: 'accent' }, raw(summary.winner || '—'))),
      h('div', { class: 'places', id: 'places' }, summary.places.map((row) => h('div', { class: 'place' + (row.place === 1 ? ' first' : '') },
        h('span', { class: 'n' }, String(row.place)),
        h('div', { class: 'grow' }, h('b', {}, raw(row.name)), row.members ? h('span', { class: 'small muted', style: 'display:block' }, raw(row.members.join(', '))) : null),
        h('span', { class: 'points' }, String(row.score))))),
      h('div', { class: 'facts' }, facts),
      summary.neverGuessed.length ? h('div', { class: 'card flat' },
        h('b', {}, 'Не угадали ни разу'),
        h('p', {}, raw(summary.neverGuessed.join(', '))),
        g.settings.carryUnguessed ? h('p', { class: 'small muted' }, 'Эти слова попадут в следующую колоду') : null) : null,
      h('div', { class: 'end-buttons' },
        h('button', { class: 'btn primary go', id: 'again', onclick: act(toSetup) }, ui.icon('refresh'), 'Ещё партия'),
        h('button', { class: 'btn go', onclick: act(showStats) }, ui.icon('chart'), 'Статистика игроков'),
        h('button', { class: 'btn go', onclick: () => {
          leaveStage();
          axiko.back();
        } }, 'Выйти')));
  }

  async function toSetup() {
    leaveStage();
    S.results = null;
    S.view = 'setup';
    S.decks = await call('decks');
    render();
  }

  // ---- окна: правила, статистика, настройки ------------------------------------------------------

  function showRules() {
    const s = S.settings;
    const close = ui.sheet([
      h('h3', {}, 'Правила'),
      h('div', { class: 'md' },
        h('p', {}, 'Объясняющий видит слово и объясняет его, не называя само слово и однокоренные, без переводов и букв. Угадали — следующее слово. Пропуск возвращает слово в шляпу' +
          (s.skipPenalty ? ' и стоит ' + s.skipPenalty + ' очко.' : '.')),
        h('p', {}, 'Пары: игроки сидят по кругу, в первом круге объясняют сидящему напротив, дальше пары сдвигаются — все объясняют всем. Очко получают оба. Команды: объясняющий внутри команды меняется, угадывает вся команда.'),
        h('p', {}, 'Раунды идут с одной колодой: словами, жестами, одним словом. Раунд кончается, когда шляпа пуста.'),
        h('p', {}, 'Последнее слово: когда время вышло, на него есть ещё ' + s.lastWordSeconds + ' с.'),
        h('p', {}, 'Горячее слово: раз в раунд одно слово стоит ' + s.hotPoints + ' очка. Звёздочку видит только объясняющий.'),
        h('p', {}, h('b', {}, 'Честно о микрофоне. '), 'Телефон слышит всех и не отличает, кто говорит. Если объясняющий нарушил правило и назвал слово — телефон засчитает. Для этого есть «Отмена»: она крупная и ' + s.undoSeconds + ' с висит прямо над кнопками. Шумно, музыка — засчитывайте кнопкой «Угадали».')),
      h('button', { class: 'btn wide', onclick: () => close() }, 'Понятно')
    ]);
  }

  async function showStats() {
    const list = await call('stats');
    const close = ui.sheet([
      h('h3', {}, 'Статистика игроков'),
      list.length ? h('div', {},
        h('div', { class: 'stats-row small muted' }, h('span', {}, 'Игрок'), h('span', {}, 'игр'), h('span', {}, 'побед'), h('span', {}, 'слов/мин')),
        list.map((person) => h('div', { class: 'stats-row' }, h('b', {}, raw(person.name)), h('span', {}, String(person.games)),
          h('span', {}, String(person.wins)), h('span', {}, decimal(person.perMinute))))) : h('p', { class: 'empty' }, 'Сыгранных игр пока нет'),
      h('button', { class: 'btn wide', onclick: () => close() }, 'Закрыть')
    ]);
  }

  function settingRow(item) {
    if (typeof item.def === 'boolean') {
      return h('label', { class: 'setting-row' },
        h('div', { class: 'grow' }, item.title, item.hint ? h('span', { class: 'small' }, item.hint) : null),
        h('input', { type: 'checkbox', class: 'switch', checked: !!S.settings[item.key], onchange: (event) => setSetting({ [item.key]: event.target.checked }) }));
    }
    return h('div', { class: 'setting-row' },
      h('div', { class: 'grow' }, item.title, item.hint || item.unit ? h('span', { class: 'small' }, [item.unit, item.hint].filter(Boolean).join(' · ')) : null),
      stepper(item.key));
  }

  function offlineBlock() {
    const info = S.offline || { builtin: 0, accepted: 0, pending: {} };
    let level = 3;
    const box = h('div', { class: 'section' });
    const draw = () => {
      const pendingLevels = Object.keys(info.pending || {}).filter((key) => (info.pending[key] || []).length);
      const review = pendingLevels.map((key) => {
        const off = new Set();
        const list = info.pending[key];
        return h('div', { class: 'card flat' },
          h('b', {}, 'Уровень ' + key + ': проверьте слова'),
          h('p', { class: 'small muted' }, 'Коснитесь лишних — они не попадут в словарь'),
          h('div', { class: 'word-chips' }, list.map((word) => {
            const node = h('button', { class: 'chip' }, raw(word));
            node.addEventListener('click', () => {
              if (off.has(word)) off.delete(word);
              else off.add(word);
              node.classList.toggle('off', off.has(word));
            });
            return node;
          })),
          h('button', { class: 'btn primary', style: 'margin-top:10px', onclick: act(async () => {
            S.offline = await call('reviewOffline', Number(key), list.filter((word) => !off.has(word)));
            Object.assign(info, S.offline);
            draw();
          }) }, 'Оставить отмеченные'));
      });
      box.replaceChildren(
        h('h2', {}, 'Запасной словарь'),
        h('p', { class: 'small muted' }, 'Встроено ' + words(info.builtin) + ', добавлено ' + words(info.accepted || 0) + '. Колода из него собирается без сети.'),
        h('div', { class: 'chips' }, [1, 2, 3, 4, 5].map((n) => {
          const node = chip('Уровень ' + n, n === level, () => {
            level = n;
            draw();
          });
          return node;
        })),
        growButton(),
        ...review);
    };
    const growButton = () => {
      const button = h('button', { class: 'btn soft', id: 'grow-offline' }, ui.icon('spark'), 'Пополнить моделью: 100 слов уровня ' + level);
      button.addEventListener('click', act(async () => {
        button.disabled = true;
        button.replaceChildren(h('span', { class: 'spinner' }), 'Модель пишет слова…');
        try {
          await call('growOffline', level, 100);
          S.offline = await call('offlineInfo');
          Object.assign(info, S.offline);
        } finally {
          draw();
        }
      }));
      return button;
    };
    draw();
    return box;
  }

  function showSettings() {
    const groups = {};
    C.SCHEMA.forEach((item) => {
      (groups[item.group] = groups[item.group] || []).push(item);
    });
    const close = ui.sheet([
      h('h3', {}, 'Настройки'),
      Object.keys(groups).map((name) => h('div', { class: 'section' }, h('h2', {}, name), h('div', {}, groups[name].map(settingRow)))),
      offlineBlock(),
      h('button', { class: 'btn wide', onclick: () => close() }, 'Готово')
    ], () => render());
  }

  // ---- отрисовка --------------------------------------------------------------------------------

  function render() {
    if (S.view === 'setup') renderSetup();
    else if (S.view === 'own' && S.game) renderOwn();
    else if (S.view === 'between' && S.game) renderBetween();
    else if (S.view === 'turn' && S.game && S.game.live) renderTurn();
    else if (S.view === 'results' && S.results) renderResults();
    else if (S.view === 'turn-end') scrollStage(h('div', { class: 'empty' }, h('span', { class: 'spinner' }), ' Считаем итоги…'));
    else renderSetup();
  }

  function applyPrefill(prefill) {
    const patch = {};
    if (Array.isArray(prefill.players)) {
      S.setup.players = [];
      addNames(prefill.players.map(String));
    } else if (Number(prefill.players) > 0 && !S.setup.players.length) {
      const n = Math.min(12, Math.round(Number(prefill.players)));
      S.setup.players = Array.from({ length: n }, (x, i) => 'Игрок ' + (i + 1));
    }
    if (prefill.theme) {
      const theme = String(prefill.theme).trim().toLowerCase();
      const known = C.THEMES.find((item) => item.toLowerCase() === theme);
      if (known) patch.theme = known;
      else {
        patch.theme = '*';
        patch.customTheme = String(prefill.theme).trim();
      }
    }
    ['difficulty', 'teamCount', 'turnSeconds', 'rounds'].forEach((key) => {
      if (prefill[key]) patch[key] = Number(prefill[key]);
    });
    if (prefill.mode === 'pairs' || prefill.mode === 'teams') patch.mode = prefill.mode;
    else if (S.setup.players.length % 2) patch.mode = 'teams';
    ensureTeams();
    saveSetup();
    if (Object.keys(patch).length) quiet(setSetting(patch));
  }

  // Экран уходит с глаз (свернули, погас, сложили) — ход на паузу, микрофон отпускается.
  function hidden() {
    const live = S.game && S.game.live;
    if (live && (live.phase === 'run' || live.phase === 'last')) pauseTurn();
  }

  axiko.on('app.visible', (event) => {
    if (event && event.on === false) hidden();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') hidden();
  });
  window.addEventListener('pagehide', () => {
    if (Mic.active) {
      if (Mic.stream) quiet(axiko.native('speech.stream.stop'));
      else quiet(axiko.native('speech.stopListening'));
    }
    if (S.game && !S.game.test) quiet(call('saveState', { game: S.game }));
  });

  async function init() {
    render();
    const data = await call('init');
    S.settings = data.settings;
    S.features = data.features || [];
    S.decks = data.decks || [];
    S.offline = data.offline;
    if (data.current && data.current.game && !data.current.game.finished) S.saved = data.current.game;
    if (data.prefill) applyPrefill(data.prefill);
    if (S.setup.deckId) {
      const found = S.decks.find((item) => item.id === S.setup.deckId && !item.played);
      if (found) S.deck = await call('deck', found.id);
    }
    ensureTeams();
    S.ready = true;
    document.body.dataset.ready = '1';
    render();
  }

  // Для проверок (checks.js): ход без записи в базу и без микрофона, «услышать» фразу, убрать за собой.
  window.hatScreen = {
    state: S,
    render,
    removePlayer,
    async testTurn(words, players) {
      const settings = Object.assign({}, S.settings, { autoVoice: false, countdownSeconds: 0, hotWord: false, rounds: 1, tickSeconds: 0, vibrateMs: 0 });
      const cards = words.map((word) => ({ word, forms: [], roots: [], difficulty: 1 }));
      const game = R.create({ mode: 'pairs', players, teams: [], cards, settings, now: Date.now() });
      game.test = true;
      game.id = null;
      game.phase = 'between';
      game.lastTurn = null;
      S.game = game;
      S.view = 'between';
      enterStage();
      await beginTurn();
      return game.cards[game.live.card].word;
    },
    hear(text) {
      onHeard(text, { latency: 0 });
      const live = S.game && S.game.live;
      return live ? live.turn.results.map((entry) => ({ word: S.game.cards[entry.card].word, result: entry.result, how: entry.how, heard: entry.heard })) : null;
    },
    results() {
      const live = S.game && S.game.live;
      return live ? live.turn.results.map((entry) => ({ word: S.game.cards[entry.card].word, result: entry.result, how: entry.how })) : null;
    },
    async endTest() {
      stopClock();
      await Mic.stop();
      S.game = null;
      S.view = 'setup';
      leaveStage();
      render();
      return true;
    }
  };
  init().catch((error) => {
    console.error(error);
    ui.toast('Не удалось загрузить: ' + error.message);
  });
})();
