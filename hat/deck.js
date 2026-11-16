// Колода Шляпы: запрос к модели, проверка ответа, запасной словарь, формы своих слов.
// Чистая логика (без сети и Android): движок зовёт модель сам и отдаёт ответ сюда.
// Движок: require('./deck'); node: тесты; экран: window.hatDeck (если понадобится).
(function (exports) {
  var match = typeof require === 'function' ? require('./match') : window.ruMatch;

  var LEVELS = {
    1: 'кошка, стол, мяч',
    2: 'зонтик, сугроб, повар',
    3: 'бухгалтер, водопад, сквозняк',
    4: 'ностальгия, монополия, акведук',
    5: 'прецедент, апатия, энтропия'
  };

  /** Тема для промпта: «общее» — без темы. */
  function themeText(theme) {
    var t = String(theme || '').trim();
    return !t || t === 'общее' ? '' : t;
  }

  /**
   * Промпт колоды: { system, prompt }.
   * options: theme, difficulty, count, adult, recent (слова «не повторяй»), drawable, synonyms.
   */
  function prompt(options) {
    var theme = themeText(options.theme);
    var level = Math.max(1, Math.min(5, Number(options.difficulty) || 3));
    var levels = Object.keys(LEVELS).map(function (key) { return key + ' — ' + LEVELS[key]; }).join('; ');
    var rules = [
      'Только нарицательные существительные или устойчивые словосочетания до двух слов' +
        (theme === 'кино' ? '; имена собственные можно — тема «кино».' : ', без имён собственных.'),
      options.adult ? 'Взрослые слова допустимы, но без мата.' : 'Без грубых и взрослых слов.',
      'Только русские буквы: без латиницы и цифр. Слово — в начальной форме.',
      'Слова не должны повторяться и быть однокоренными друг с другом.'
    ];
    if (options.drawable) rules.push('Каждое слово можно узнаваемо нарисовать маркером за минуту: предметы, животные, места, действия с предметами.');
    var format = '{ "words": [ { "word": "холодильник", "forms": ["холодильника", "холодильнику", "холодильником", ' +
      '"холодильнике", "холодильники", "холодильников", "холодильникам", "холодильниками", "холодильниках"], ' +
      '"roots": ["холод"], "difficulty": 2' + (options.synonyms ? ', "synonyms": ["рефрижератор"]' : '') + ' } ] }';
    var system = 'Ты составляешь карточки для игры в «Шляпу» по-русски. Отвечай только JSON.';
    var lines = [
      'Придумай ' + options.count + ' слов для игры' + (theme ? ' на тему «' + theme + '»' : '') + '.',
      'Сложность ' + level + ' из 5. Уровни: ' + levels + '.',
      rules.join(' '),
      'Для каждого слова дай все падежные формы единственного и множественного числа (forms), корни, которые нельзя называть (roots), и его сложность (difficulty)' +
        (options.synonyms ? ', и близкие по смыслу слова, которые тоже можно засчитать (synonyms)' : '') + '.',
      'Формат: ' + format
    ];
    if (options.recent && options.recent.length) lines.push('Не повторяй эти слова: ' + options.recent.join(', ') + '.');
    if (options.already && options.already.length) lines.push('Уже есть в колоде, их тоже не повторяй: ' + options.already.join(', ') + '.');
    return { system: system, prompt: lines.join('\n') };
  }

  function lettersOf(word) {
    return match.normalize(word).replace(/ /g, '').length;
  }

  function strings(list) {
    return (Array.isArray(list) ? list : []).filter(function (item) { return typeof item === 'string' && item.trim(); })
      .map(function (item) { return item.trim().toLowerCase(); });
  }

  /**
   * Проверка ответа модели: убрать дубли (после нормализации), слова из истории, длиннее
   * maxLetters букв, с латиницей и цифрами, больше двух слов.
   * options: exclude (нормализованные слова → true), have (карты, что уже в колоде), maxLetters, count.
   * Возвращает { cards, dropped: [{ word, why }] }.
   */
  function clean(response, options) {
    options = options || {};
    var list = response && Array.isArray(response.words) ? response.words : Array.isArray(response) ? response : [];
    var exclude = options.exclude || {};
    var maxLetters = options.maxLetters || 24;
    var kept = (options.have || []).slice();
    var cards = [];
    var dropped = [];
    for (var i = 0; i < list.length; i++) {
      var item = typeof list[i] === 'string' ? { word: list[i] } : list[i] || {};
      var word = typeof item.word === 'string' ? item.word.trim().toLowerCase().replace(/\s+/g, ' ') : '';
      var plain = match.normalize(word);
      var why = '';
      if (!plain) why = 'пусто';
      else if (match.foreign(word)) why = 'латиница или цифры';
      else if (lettersOf(word) > maxLetters) why = 'длинное';
      else if (plain.split(' ').length > 2) why = 'больше двух слов';
      else if (exclude[plain]) why = 'уже было';
      else {
        for (var k = 0; k < kept.length; k++) {
          if (match.sameWord(kept[k].word, word)) {
            why = 'повтор';
            break;
          }
        }
      }
      if (why) {
        dropped.push({ word: word, why: why });
        continue;
      }
      var card = {
        word: word,
        forms: strings(item.forms).filter(function (form) { return !match.foreign(form); }),
        roots: strings(item.roots).filter(function (root) { return !match.foreign(root); }),
        difficulty: Math.max(1, Math.min(5, Math.round(Number(item.difficulty) || options.difficulty || 3)))
      };
      if (item.synonyms) card.synonyms = strings(item.synonyms).filter(function (s) { return !match.foreign(s); });
      kept.push(card);
      cards.push(card);
      if (options.count && cards.length >= options.count) break;
    }
    return { cards: cards, dropped: dropped };
  }

  function random(rnd) {
    return typeof rnd === 'function' ? rnd() : Math.random();
  }

  /**
   * Колода из запасного словаря: слова нужного уровня, при нехватке — соседних.
   * dictionary: { "1": [...], …, "5": [...] }; options: difficulty, count, exclude, extra (свои добавки).
   */
  function offline(dictionary, options, rnd) {
    var level = Math.max(1, Math.min(5, Number(options.difficulty) || 3));
    var exclude = options.exclude || {};
    var order = [level];
    for (var step = 1; step < 5; step++) {
      if (level - step >= 1) order.push(level - step);
      if (level + step <= 5) order.push(level + step);
    }
    var cards = [];
    var taken = {};
    var fill = function (allowPlayed) {
      for (var o = 0; o < order.length && cards.length < options.count; o++) {
        var words = (dictionary[order[o]] || []).concat((options.extra && options.extra[order[o]]) || []);
        var pool = words.filter(function (word) {
          var plain = match.normalize(word);
          return plain && !taken[plain] && (allowPlayed || !exclude[plain]);
        });
        for (var i = pool.length - 1; i > 0; i--) {
          var j = Math.floor(random(rnd) * (i + 1));
          var keep = pool[i];
          pool[i] = pool[j];
          pool[j] = keep;
        }
        for (var p = 0; p < pool.length && cards.length < options.count; p++) {
          taken[match.normalize(pool[p])] = true;
          cards.push({ word: pool[p], forms: [], roots: [], difficulty: order[o] });
        }
      }
    };
    fill(false);
    // Всё сыграно — лучше повтор, чем пустая колода.
    if (cards.length < options.count) fill(true);
    return cards;
  }

  /** Промпт форм для своих слов игроков (одним запросом на всех). */
  function formsPrompt(words) {
    return {
      system: 'Ты знаток русской грамматики. Отвечай только JSON.',
      prompt: 'Для каждого слова или словосочетания дай все падежные формы единственного и множественного числа и корни, ' +
        'которые нельзя называть, объясняя его. Формат: { "words": [ { "word": "кошка", "forms": ["кошки", "кошке", "кошку", ' +
        '"кошкой", "кошек", "кошкам", "кошками", "кошках"], "roots": ["кош"] } ] }\nСлова: ' + words.join(', ')
    };
  }

  /** Формы из ответа модели — к своим словам; чего нет в ответе, остаётся без форм (их даст правило). */
  function applyForms(cards, response) {
    var list = response && Array.isArray(response.words) ? response.words : [];
    return cards.map(function (card) {
      var plain = match.normalize(card.word);
      for (var i = 0; i < list.length; i++) {
        if (list[i] && match.normalize(list[i].word) === plain) {
          return {
            word: card.word,
            forms: strings(list[i].forms).filter(function (form) { return !match.foreign(form); }),
            roots: strings(list[i].roots).filter(function (root) { return !match.foreign(root); }),
            difficulty: card.difficulty || 3,
            owner: card.owner
          };
        }
      }
      return card;
    });
  }

  /**
   * Своё слово игрока: '' — можно, иначе — почему нельзя.
   * taken — слова колоды и других игроков (строки).
   */
  function ownWordProblem(word, taken, maxLetters) {
    var plain = match.normalize(word);
    if (!plain) return 'пусто';
    if (match.foreign(word)) return 'только русские буквы, без цифр';
    if (lettersOf(word) > (maxLetters || 24)) return 'слишком длинное';
    if (plain.split(' ').length > 3) return 'не больше трёх слов';
    for (var i = 0; i < taken.length; i++) {
      if (match.sameWord(taken[i], word)) return 'это слово уже есть, выберите другое';
    }
    return '';
  }

  exports.LEVELS = LEVELS;
  exports.prompt = prompt;
  exports.clean = clean;
  exports.offline = offline;
  exports.formsPrompt = formsPrompt;
  exports.applyForms = applyForms;
  exports.ownWordProblem = ownWordProblem;
})(typeof exports !== 'undefined' ? exports : (window.hatDeck = {}));
