// Правила Шляпы: кто кому объясняет, шляпа слов, раунды, очки, итоги.
// Чистая логика над объектом игры — без экрана, Android и времени «сейчас» (время передаётся).
// Движок: require('./rules'); node: тесты; экран: window.hatRules.
//
// Игра:
//   { mode: 'pairs'|'teams', players: ['Маша', …], teams: [{ name, members: [индексы игроков] }],
//     cards: [{ word, forms, roots, difficulty, owner }], rounds, round, hat: [индексы карт],
//     hot: индекс горячего слова раунда | null, turns: [ход], finished, settings: {…} }
// Ход:
//   { round, explainer, guesser (пары) | team (команды), started, ms,
//     results: [{ card, round, result: 'guessed'|'skipped'|'undone'|'last', ms, heard, how, hot, latency }] }
(function (exports) {
  var ROUND_NAMES = ['', 'словами', 'жестами', 'одним словом'];
  var ROUND_RULES = [
    '',
    'Объясняйте словами, не называя само слово и однокоренные, без переводов и букв.',
    'Только жесты — ни звука. Микрофон слушает угадывающих.',
    'Одно слово объяснения — и всё.'
  ];

  function roundName(round) {
    return ROUND_NAMES[round] || '';
  }

  function roundRule(round) {
    return ROUND_RULES[round] || '';
  }

  /** Случайное число 0..1: своё (для тестов) или Math.random. */
  function random(rnd) {
    return typeof rnd === 'function' ? rnd() : Math.random();
  }

  function shuffle(list, rnd) {
    var out = list.slice();
    for (var i = out.length - 1; i > 0; i--) {
      var j = Math.floor(random(rnd) * (i + 1));
      var keep = out[i];
      out[i] = out[j];
      out[j] = keep;
    }
    return out;
  }

  /** Сдвиги пар по кругам: сначала напротив (N/2), затем по порядку — все объясняют всем. */
  function pairOffsets(n) {
    var half = Math.floor(n / 2);
    var out = [];
    for (var d = half; d < n; d++) out.push(d);
    for (var e = 1; e < half; e++) out.push(e);
    return out;
  }

  /** Подходит ли состав для режима: { ok, why }. */
  function validate(mode, players, teams) {
    var n = players.length;
    if (mode === 'pairs') {
      if (n < 4) return { ok: false, why: 'Для пар нужно хотя бы 4 игрока' };
      if (n > 12) return { ok: false, why: 'В парах — не больше 12 игроков' };
      if (n % 2) return { ok: false, why: 'Для пар нужно чётное число игроков — включите «Команды»' };
      return { ok: true, why: '' };
    }
    if (!teams || teams.length < 2) return { ok: false, why: 'Нужно хотя бы 2 команды' };
    if (teams.length > 4) return { ok: false, why: 'Команд — не больше 4' };
    for (var i = 0; i < teams.length; i++) {
      if (!teams[i].members || teams[i].members.length < 2) return { ok: false, why: 'В каждой команде — хотя бы 2 человека' };
    }
    return { ok: true, why: '' };
  }

  /** Раскладка игроков по командам по кругу (после перемешивания). */
  function splitTeams(count, players, rnd) {
    var order = shuffle(players.map(function (name, index) { return index; }), rnd);
    var teams = [];
    for (var t = 0; t < count; t++) teams.push({ name: 'Команда ' + (t + 1), members: [] });
    order.forEach(function (player, i) { teams[i % count].members.push(player); });
    teams.forEach(function (team) { team.members.sort(function (a, b) { return a - b; }); });
    return teams;
  }

  /** Кто объясняет в ходе номер index и кому: { explainer, guesser, team }. */
  function who(game, index) {
    if (game.mode === 'teams') {
      var count = game.teams.length;
      var team = index % count;
      var members = game.teams[team].members;
      return { explainer: members[Math.floor(index / count) % members.length], guesser: null, team: team };
    }
    var n = game.players.length;
    var offsets = pairOffsets(n);
    var circle = Math.floor(index / n);
    var explainer = index % n;
    return { explainer: explainer, guesser: (explainer + offsets[circle % offsets.length]) % n, team: null };
  }

  function startRound(game, rnd) {
    game.hat = shuffle(game.cards.map(function (card, index) { return index; }), rnd);
    game.hot = game.settings.hotWord && game.hat.length ? game.hat[Math.floor(random(rnd) * game.hat.length)] : null;
    return game;
  }

  /** Новая игра: первый раунд уже начат. */
  function create(options, rnd) {
    var settings = options.settings || {};
    var game = {
      v: 1,
      mode: options.mode === 'teams' ? 'teams' : 'pairs',
      players: options.players.slice(),
      teams: options.mode === 'teams' ? JSON.parse(JSON.stringify(options.teams)) : [],
      cards: options.cards.slice(),
      deckId: options.deckId || null,
      rounds: Math.max(1, Math.min(3, settings.rounds || 3)),
      round: 1,
      hat: [],
      hot: null,
      turns: [],
      finished: false,
      started: options.now || 0,
      settings: settings
    };
    return startRound(game, rnd);
  }

  /** Следующая карта из шляпы (индекс) или null, если шляпа пуста. */
  function draw(game) {
    return game.hat.length ? game.hat[0] : null;
  }

  function removeFromHat(game, card) {
    var at = game.hat.indexOf(card);
    if (at >= 0) game.hat.splice(at, 1);
  }

  /** Вернуть карту в шляпу — в случайное место, но не первой, если в шляпе есть другие. */
  function returnToHat(game, card, rnd) {
    removeFromHat(game, card);
    var at = game.hat.length ? 1 + Math.floor(random(rnd) * game.hat.length) : 0;
    game.hat.splice(at, 0, card);
  }

  function counts(result) {
    return result === 'guessed' || result === 'last';
  }

  /** Очки за одну запись хода. */
  function points(entry, settings) {
    if (counts(entry.result)) return entry.hot ? (settings.hotPoints || 3) : 1;
    if (entry.result === 'skipped') return -(settings.skipPenalty || 0);
    return 0;
  }

  /** Записать исход текущей карты в ход и поправить шляпу. */
  function settle(game, turn, entry, rnd) {
    entry.round = game.round;
    entry.hot = entry.card === game.hot;
    turn.results.push(entry);
    if (counts(entry.result)) removeFromHat(game, entry.card);
    else returnToHat(game, entry.card, rnd);
    return entry;
  }

  /** «Отмена» последнего зачёта: очко снимается, слово возвращается в шляпу. */
  function undoLast(game, turn, rnd) {
    for (var i = turn.results.length - 1; i >= 0; i--) {
      var entry = turn.results[i];
      if (counts(entry.result)) {
        entry.result = 'undone';
        if (entry.round === game.round) returnToHat(game, entry.card, rnd);
        return entry;
      }
    }
    return null;
  }

  /** Исправить исход записи между ходами («спорные можно исправить касанием»). */
  function setResult(game, turnIndex, entryIndex, result, rnd) {
    var entry = game.turns[turnIndex].results[entryIndex];
    var was = counts(entry.result);
    var now = counts(result);
    entry.result = result;
    if (entry.round === game.round && was !== now) {
      if (now) removeFromHat(game, entry.card);
      else returnToHat(game, entry.card, rnd);
    }
    return entry;
  }

  /** Следующий исход по касанию: угадано → пропущено → отменено → угадано. */
  function nextResult(result) {
    if (result === 'guessed' || result === 'last') return 'skipped';
    if (result === 'skipped') return 'undone';
    return 'guessed';
  }

  /** После хода: если шляпа пуста — следующий раунд или конец игры. */
  function afterTurn(game, rnd) {
    if (game.hat.length) return { roundEnded: false, finished: false };
    if (game.round < game.rounds) {
      game.round += 1;
      startRound(game, rnd);
      return { roundEnded: true, finished: false };
    }
    game.finished = true;
    return { roundEnded: true, finished: true };
  }

  /** Очки: { players: [..], teams: [..] } — считаются заново по всем ходам. */
  function scores(game) {
    var players = game.players.map(function () { return 0; });
    var teams = (game.teams || []).map(function () { return 0; });
    game.turns.forEach(function (turn) {
      turn.results.forEach(function (entry) {
        var value = points(entry, game.settings);
        if (game.mode === 'teams') {
          if (turn.team !== null && turn.team !== undefined) teams[turn.team] += value;
        } else {
          players[turn.explainer] += value;
          if (turn.guesser !== null && turn.guesser !== undefined) players[turn.guesser] += value;
        }
      });
    });
    return { players: players, teams: teams };
  }

  /** Места: [{ place, name, score }] по убыванию очков; равные делят место. */
  function standings(game) {
    var table = scores(game);
    var rows = game.mode === 'teams'
      ? game.teams.map(function (team, index) {
        return { name: team.name, score: table.teams[index], members: team.members.map(function (p) { return game.players[p]; }) };
      })
      : game.players.map(function (name, index) { return { name: name, score: table.players[index] }; });
    rows.sort(function (a, b) { return b.score - a.score; });
    var place = 0;
    var last = null;
    rows.forEach(function (row, index) {
      if (row.score !== last) place = index + 1;
      row.place = place;
      last = row.score;
    });
    return rows;
  }

  function cardWord(game, index) {
    var card = game.cards[index];
    return card ? card.word : '';
  }

  /** Итоги игры: места, лучший объясняющий, самое быстрое и самое трудное слово. */
  function summary(game) {
    var rows = standings(game);
    var explain = {};
    var fastest = null;
    var skips = {};
    var spent = {};
    var guessedEver = {};
    var latencies = [];
    var guessedTotal = 0;
    game.turns.forEach(function (turn) {
      var person = turn.explainer;
      explain[person] = explain[person] || { words: 0, ms: 0 };
      explain[person].ms += turn.ms || 0;
      turn.results.forEach(function (entry) {
        spent[entry.card] = (spent[entry.card] || 0) + (entry.ms || 0);
        if (counts(entry.result)) {
          explain[person].words += 1;
          guessedEver[entry.card] = true;
          guessedTotal += 1;
          if (entry.ms > 0 && (!fastest || entry.ms < fastest.ms)) {
            fastest = { word: cardWord(game, entry.card), ms: entry.ms, by: game.players[person] };
          }
          if (entry.latency > 0) latencies.push(entry.latency);
        } else if (entry.result === 'skipped') {
          skips[entry.card] = (skips[entry.card] || 0) + 1;
        }
      });
    });
    var best = null;
    Object.keys(explain).forEach(function (person) {
      var item = explain[person];
      if (item.ms < 10000) return;
      var perMinute = item.words / (item.ms / 60000);
      if (!best || perMinute > best.perMinute) {
        best = { name: game.players[person], perMinute: Math.round(perMinute * 10) / 10, words: item.words };
      }
    });
    var hardest = null;
    game.cards.forEach(function (card, index) {
      var weight = (skips[index] || 0) * 30000 + (spent[index] || 0);
      if (!weight) return;
      if (!hardest || weight > hardest.weight) hardest = { word: card.word, skips: skips[index] || 0, ms: spent[index] || 0, weight: weight };
    });
    if (hardest) delete hardest.weight;
    var played = {};
    game.turns.forEach(function (turn) { turn.results.forEach(function (entry) { played[entry.card] = true; }); });
    var never = game.cards.filter(function (card, index) { return played[index] && !guessedEver[index]; })
      .map(function (card) { return card.word; });
    var top = rows.filter(function (row) { return row.place === 1; });
    var winner = top.map(function (row) { return row.name; }).join(' и ');
    if (game.mode === 'pairs' && top.length === 1) winner = top[0].name;
    var latency = latencies.length
      ? Math.round(latencies.reduce(function (sum, value) { return sum + value; }, 0) / latencies.length)
      : 0;
    var explainers = Object.keys(explain).map(function (person) {
      return { name: game.players[person], words: explain[person].words, ms: explain[person].ms };
    });
    return {
      explainers: explainers,
      places: rows,
      winner: winner,
      bestExplainer: best,
      fastest: fastest,
      hardest: hardest,
      neverGuessed: never,
      words: guessedTotal,
      latency: latency,
      autoCount: latencies.length
    };
  }

  /**
   * «Телепат» (ачивка): первое слово хода, угаданное за seconds секунд или быстрее, или null.
   * Считается только обычный зачёт («guessed»): «последнее слово» после конца хода — нет.
   */
  function telepath(results, seconds) {
    var limit = Number(seconds) * 1000;
    if (!(limit > 0)) return null;
    for (var i = 0; i < (results || []).length; i++) {
      var entry = results[i];
      if (entry && entry.result === 'guessed' && entry.ms > 0 && entry.ms <= limit) return entry;
    }
    return null;
  }

  /** Сколько слов осталось угадать в раунде и всего карт. */
  function progress(game) {
    return { left: game.hat.length, total: game.cards.length, round: game.round, rounds: game.rounds };
  }

  exports.ROUND_NAMES = ROUND_NAMES;
  exports.roundName = roundName;
  exports.roundRule = roundRule;
  exports.shuffle = shuffle;
  exports.pairOffsets = pairOffsets;
  exports.validate = validate;
  exports.splitTeams = splitTeams;
  exports.who = who;
  exports.create = create;
  exports.startRound = startRound;
  exports.draw = draw;
  exports.returnToHat = returnToHat;
  exports.counts = counts;
  exports.points = points;
  exports.settle = settle;
  exports.undoLast = undoLast;
  exports.setResult = setResult;
  exports.nextResult = nextResult;
  exports.afterTurn = afterTurn;
  exports.scores = scores;
  exports.standings = standings;
  exports.summary = summary;
  exports.progress = progress;
  exports.telepath = telepath;
})(typeof exports !== 'undefined' ? exports : (window.hatRules = {}));
