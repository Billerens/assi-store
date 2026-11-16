// Разговор с моделями: промпт угадывания и разбор ответа, когда говорить догадку вслух,
// засчитано ли (через match.js), промпт рисунка для «Assi рисует».
// Чистая логика: движок (require('./guess')), node (тесты), экран (window.dgGuess).
(function (exports) {
  var match = typeof require === 'function' ? require('./match') : window.ruMatch;

  var GUESS_SYSTEM = 'Это рисунок пальцем в игре в угадайку, рисунок может быть не закончен. ' +
    'Отвечай одним существительным по-русски. Не повторяй отвергнутые догадки. Отвечай только JSON.';

  /**
   * Промпт угадывания: { system, prompt }. Загаданное слово сюда не попадает никогда.
   * options: rejected (догадки, на которые сказали «нет»), warm (догадка, на которую сказали «тепло»),
   * theme (только общая тема, если владелец разрешил подсказку), final (время вышло), alternatives (сколько).
   */
  function guessPrompt(options) {
    var o = options || {};
    var lines = [o.final
      ? 'Время вышло, рисунок закончен. Последняя попытка: самая вероятная догадка и ещё ' + (o.alternatives || 3) + ' варианта.'
      : 'Что нарисовано? Если рисунок ещё не закончен — лучшая догадка сейчас.'];
    if (o.theme) lines.push('Тема: ' + o.theme + '.');
    var rejected = (o.rejected || []).filter(Boolean);
    if (rejected.length) lines.push('Это точно не: ' + rejected.join(', ') + '.');
    if (o.warm) lines.push('Тепло: «' + o.warm + '» — близко, но не то. Подумай о близком по смыслу.');
    lines.push('Формат: { "guess": "маяк", "confidence": 0.8, "alternatives": ["башня", "свеча"], "say": "Это маяк?" }. ' +
      'confidence — от 0 до 1; say — короткая фраза вслух, не больше 6 слов.');
    return { system: GUESS_SYSTEM, prompt: lines.join('\n') };
  }

  function cleanWord(text) {
    return String(text || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9\- ]+/gi, ' ').replace(/\s+/g, ' ').trim()
      .split(' ').slice(0, 3).join(' ');
  }

  function wordCount(text) {
    return String(text || '').trim().split(/\s+/).filter(Boolean).length;
  }

  /** Ответ модели → { guess, confidence, alternatives, say } или null, если догадки нет. */
  function parseGuess(answer, options) {
    var o = options || {};
    var maxWords = o.sayMaxWords || 6;
    var data = answer;
    if (typeof data === 'string') {
      var found = data.match(/\{[\s\S]*\}/);
      try {
        data = found ? JSON.parse(found[0]) : { guess: data };
      } catch (error) {
        data = { guess: data };
      }
    }
    if (!data || typeof data !== 'object') return null;
    var guess = cleanWord(data.guess || data.answer || data.word);
    if (!guess) return null;
    var confidence = Number(data.confidence);
    if (!isFinite(confidence)) confidence = 0.5;
    if (confidence > 1 && confidence <= 100) confidence = confidence / 100;
    confidence = Math.max(0, Math.min(1, confidence));
    var seen = {};
    seen[guess] = true;
    var alternatives = (Array.isArray(data.alternatives) ? data.alternatives : []).map(cleanWord).filter(function (word) {
      if (!word || seen[word]) return false;
      seen[word] = true;
      return true;
    }).slice(0, 5);
    var say = typeof data.say === 'string' ? data.say.trim() : '';
    if (!say || wordCount(say) > maxWords) say = 'Это ' + guess + '?';
    return { guess: guess, confidence: Math.round(confidence * 100) / 100, alternatives: alternatives, say: say };
  }

  /**
   * Сказать ли догадку вслух: уверенность не ниже порога, не та же, что прошлая сказанная,
   * не отвергнутая и не устаревшая (ответ пришёл позже staleMs после снимка).
   * context: { lastSaid, rejected, snapshotAt, now, threshold, staleMs, noRepeat, voice }.
   */
  function shouldSay(guess, context) {
    var c = context || {};
    if (!guess || c.voice === false) return false;
    if (guess.confidence < (c.threshold || 0)) return false;
    if (c.staleMs && c.now - c.snapshotAt > c.staleMs) return false;
    if (c.noRepeat !== false && c.lastSaid && match.normalize(c.lastSaid) === match.normalize(guess.guess)) return false;
    if ((c.rejected || []).some(function (word) { return match.normalize(word) === match.normalize(guess.guess); })) return false;
    return true;
  }

  /**
   * Засчитана ли догадка: она или одна из альтернатив совпала с карточкой (формы слова — как в Шляпе;
   * синонимы — только если включены). → { ok, word, how }.
   */
  function judge(guess, card, options) {
    if (!guess || !card) return { ok: false, word: '', how: '' };
    var list = [guess.guess].concat(guess.alternatives || []);
    for (let i = 0; i < list.length; i++) {
      var hit = match.matches(list[i], card, options);
      if (hit.ok) return { ok: true, word: list[i], how: hit.how, first: i === 0 };
    }
    return { ok: false, word: '', how: '' };
  }

  var PAINT_SYSTEM = 'Ты рисуешь для игры в угадайку векторными штрихами. Отвечай только JSON.';

  /** Промпт рисунка: { system, prompt }. options: strokesMin, strokesMax, maxPoints. */
  function paintPrompt(word, options) {
    var o = options || {};
    var min = o.strokesMin || 15;
    var max = o.strokesMax || 40;
    var lines = [
      'Нарисуй «' + word + '» как человек, рисующий маркером на доске, в поле 1000×1000 (x вправо, y вниз, от 0 до 1000).',
      'Сначала общий контур, потом детали — так, чтобы по первым штрихам было трудно угадать, а по последним легко.',
      min + '–' + max + ' штрихов, каждый — ломаная до ' + (o.maxPoints || 30) + ' точек или путь SVG только из команд M, L, Q, C (и Z).',
      'Без текста, букв и цифр. Все координаты — внутри поля.',
      'Формат: { "word": "маяк", "strokes": [ { "d": "M 420 900 L 460 300 L 540 300 L 580 900 Z" }, { "points": [[440, 300], [500, 220], [560, 300]] } ] }'
    ];
    if (o.retry) lines.push('Прошлый рисунок не подошёл: ' + o.retry + '. Исправь это.');
    return { system: PAINT_SYSTEM, prompt: lines.join('\n') };
  }

  exports.GUESS_SYSTEM = GUESS_SYSTEM;
  exports.guessPrompt = guessPrompt;
  exports.parseGuess = parseGuess;
  exports.shouldSay = shouldSay;
  exports.judge = judge;
  exports.paintPrompt = paintPrompt;
})(typeof exports !== 'undefined' ? exports : (window.dgGuess = {}));
