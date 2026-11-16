// Сравнение услышанного с загаданным словом — для игр со словами (Шляпа, Рисуй — угадаю).
//
//   matches(heard, card, options) → { ok, token, how }
//     heard   — распознанный текст («это холодильником же!»)
//     card    — слово или карточка { word, forms?, roots?, synonyms? }
//     how     — 'exact'   слово или его форма из карточки,
//               'stem'    форма по правилам склонения или по правилу окончаний,
//               'fuzzy'   ошибка распознавания (расстояние Левенштейна),
//               'synonym' близкое по смыслу из карточки (только если разрешено).
//
// Порядок проверки — как в описании модуля: нормализация; совпадение со словом или формами;
// правило окончаний; похожесть; словосочетания — все части рядом (в пределах окна слов);
// короткие слова — только отдельным словом, не частью другого («кит» в «китайский» — нет).
//
// Чистая логика без Android: работает в движке (require('./match')), под node (тесты) и на
// экране (<script src="../match.js"> — тогда это window.ruMatch).
(function (exports) {
  var DEFAULTS = {
    forms: true,       // допускать формы слова (падежи, число)
    typos: true,       // допускать ошибки распознавания
    fuzzy1: 6,         // с этой длины — одна ошибка
    fuzzy2: 10,        // с этой длины — две ошибки
    sameFirst: true,   // при ошибке первая буква должна совпасть
    sound: true,       // ошибка — только между созвучными буквами, длина разнится не больше чем на 1
    window: 4,         // части словосочетания — в пределах стольких слов подряд
    minStem: 4,        // основа по правилу окончаний — не короче
    stemSlack: 3,      // и не короче длины слова минус столько
    synonyms: false    // засчитывать synonyms из карточки
  };

  function options(given) {
    var out = {};
    for (var key in DEFAULTS) {
      out[key] = given && given[key] !== undefined && given[key] !== null ? given[key] : DEFAULTS[key];
    }
    return out;
  }

  // ---- нормализация -----------------------------------------------------------------------

  var ONES = ['ноль', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'];
  var TEENS = ['десять', 'одиннадцать', 'двенадцать', 'тринадцать', 'четырнадцать', 'пятнадцать',
    'шестнадцать', 'семнадцать', 'восемнадцать', 'девятнадцать'];
  var TENS = ['', '', 'двадцать', 'тридцать', 'сорок', 'пятьдесят', 'шестьдесят', 'семьдесят', 'восемьдесят', 'девяносто'];
  var HUNDREDS = ['', 'сто', 'двести', 'триста', 'четыреста', 'пятьсот', 'шестьсот', 'семьсот', 'восемьсот', 'девятьсот'];

  function plural(n, one, few, many) {
    var tens = n % 100;
    var unit = n % 10;
    if (tens >= 11 && tens <= 14) return many;
    if (unit === 1) return one;
    if (unit >= 2 && unit <= 4) return few;
    return many;
  }

  function triple(n, feminine) {
    var out = [];
    var hundreds = Math.floor(n / 100);
    var rest = n % 100;
    if (hundreds) out.push(HUNDREDS[hundreds]);
    if (rest >= 10 && rest < 20) {
      out.push(TEENS[rest - 10]);
    } else {
      var tens = Math.floor(rest / 10);
      var unit = rest % 10;
      if (tens) out.push(TENS[tens]);
      if (unit) out.push(feminine && unit === 1 ? 'одна' : feminine && unit === 2 ? 'две' : ONES[unit]);
    }
    return out;
  }

  /** Число цифрами → словами: '7' → 'семь', '2024' → 'две тысячи двадцать четыре'. */
  function numberWords(digits) {
    if (digits.length > 9) return digits;
    var n = parseInt(digits, 10);
    if (n === 0) return 'ноль';
    var out = [];
    var millions = Math.floor(n / 1000000);
    var thousands = Math.floor(n / 1000) % 1000;
    var rest = n % 1000;
    if (millions) out = out.concat(triple(millions, false), [plural(millions, 'миллион', 'миллиона', 'миллионов')]);
    if (thousands) out = out.concat(triple(thousands, true), [plural(thousands, 'тысяча', 'тысячи', 'тысяч')]);
    if (rest) out = out.concat(triple(rest, false));
    return out.join(' ');
  }

  /** Нижний регистр, ё → е, без знаков препинания, дефисы → пробел, числа → словами. */
  function normalize(text) {
    var s = String(text === null || text === undefined ? '' : text).toLowerCase();
    s = s.replace(/й/g, 'й').replace(/ё/g, 'е').replace(/ё/g, 'е');
    s = s.replace(/[̀-ͯ]/g, '');
    s = s.replace(/[-‐-―]/g, ' ');
    s = s.replace(/\d+/g, function (digits) { return ' ' + numberWords(digits) + ' '; });
    s = s.replace(/[^a-zа-я0-9\s]/g, ' ');
    return s.replace(/\s+/g, ' ').replace(/^ | $/g, '');
  }

  function tokens(text) {
    var s = normalize(text);
    return s ? s.split(' ') : [];
  }

  /** В слове есть латиница или цифры (такие слова в колоду не берём). */
  function foreign(word) {
    return /[a-z0-9]/i.test(String(word));
  }

  // ---- правило окончаний -------------------------------------------------------------------

  var ENDINGS = ['ами', 'ями', 'ого', 'его', 'ому', 'ему', 'ой', 'ей', 'ом', 'ем', 'ам', 'ям', 'ах', 'ях',
    'ов', 'ев', 'ью', 'а', 'я', 'ы', 'и', 'у', 'ю', 'е', 'о'];

  /** Основа услышанного слова: без окончания из списка (основа остаётся не короче двух букв). */
  function stem(word) {
    for (var i = 0; i < ENDINGS.length; i++) {
      var ending = ENDINGS[i];
      if (word.length - ending.length >= 2 && word.slice(-ending.length) === ending) return word.slice(0, -ending.length);
    }
    if (word.length > 2 && /[ьй]$/.test(word)) return word.slice(0, -1);
    return word;
  }

  /** Основа загаданного слова (оно в начальной форме: «музей» → «музе», «конь» → «кон»). */
  function baseStem(word) {
    if (word.length > 2 && /[ьй]$/.test(word)) return word.slice(0, -1);
    return stem(word);
  }

  var VOWELS = 'аеиоуыэюя';

  function vowel(c) {
    return VOWELS.indexOf(c) >= 0;
  }

  function consonant(c) {
    return !!c && !vowel(c) && c !== 'ь' && c !== 'ъ' && c !== 'й';
  }

  /** Беглая гласная: «кошек» — «кошк», «потолок» — «потолк», «отец» — «отц». */
  function fleeting(longer, shorter) {
    var n = longer.length;
    if (n !== shorter.length + 1 || n < 3) return false;
    if ('ое'.indexOf(longer.charAt(n - 2)) < 0) return false;
    if (!consonant(longer.charAt(n - 1)) || !consonant(longer.charAt(n - 3))) return false;
    return longer.slice(0, n - 2) + longer.charAt(n - 1) === shorter;
  }

  function sameStem(a, b) {
    return a === b || fleeting(a, b) || fleeting(b, a);
  }

  // ---- формы по правилам склонения ----------------------------------------------------------

  // Слова, чьи формы правилами не вывести (ё уже заменена на е).
  var IRREGULAR = {
    'человек': 'человека человеку человеком человеке люди людей людям людьми людях',
    'ребенок': 'ребенка ребенку ребенком ребенке дети детей детям детьми детях',
    'день': 'дня дню днем дне дни дней дням днями днях',
    'сон': 'сна сну сном сне сны снов снам снами снах',
    'лев': 'льва льву львом льве львы львов львам львами львах',
    'лед': 'льда льду льдом льде льды льдов',
    'рот': 'рта рту ртом рте рты ртов',
    'лоб': 'лба лбу лбом лбе лбы лбов',
    'пес': 'пса псу псом псе псы псов псам псами псах',
    'мох': 'мха мху мхом мхе',
    'угол': 'угла углу углом угле углы углов углам углами углах',
    'орел': 'орла орлу орлом орле орлы орлов орлам орлами орлах',
    'козел': 'козла козлу козлом козле козлы козлов',
    'осел': 'осла ослу ослом осле ослы ослов',
    'узел': 'узла узлу узлом узле узлы узлов',
    'ветер': 'ветра ветру ветром ветре ветры ветров',
    'мать': 'матери матерью матерей матерям матерями матерях',
    'дочь': 'дочери дочерью дочерей дочерям дочерьми дочерях',
    'путь': 'пути путем путей путям путями путях',
    'дерево': 'деревья деревьев деревьям деревьями деревьях',
    'брат': 'братья братьев братьям братьями братьях',
    'стул': 'стулья стульев стульям стульями стульях',
    'лист': 'листья листьев листьям листьями листьях',
    'друг': 'друзья друзей друзьям друзьями друзьях',
    'сын': 'сыновья сыновей сыновьям сыновьями сыновьях',
    'муж': 'мужья мужей мужьям мужьями мужьях',
    'крыло': 'крылья крыльев крыльям крыльями крыльях',
    'перо': 'перья перьев перьям перьями перьях',
    'ухо': 'уши ушей ушам ушами ушах',
    'глаз': 'глаз',
    'небо': 'небеса небес небесам небесами небесах',
    'чудо': 'чудеса чудес чудесам чудесами чудесах',
    'цветок': 'цветы цветов цветам цветами цветах',
    'хозяин': 'хозяева хозяев хозяевам хозяевами хозяевах',
    'курица': 'куры кур курам курами курах',
    'деньги': 'денег деньгам деньгами деньгах',
    'церковь': 'церкви церковью церквей церквям церквями церквях',
    'любовь': 'любви любовью',
    'кофе': 'кофе',
    'метро': 'метро',
    'кино': 'кино',
    'пальто': 'пальто',
    'радио': 'радио',
    'такси': 'такси',
    'шоссе': 'шоссе'
  };

  function hushed(stemText) {
    return /[жшщч]$/.test(stemText);
  }

  /** Окончание множественного числа после основы: «столы», но «мячи», «книги». */
  function yi(stemText) {
    return /[гкхжшщч]$/.test(stemText) ? 'и' : 'ы';
  }

  /** Беглая гласная в родительном множественного: «кошк» → «кошек», «окн» → «окон», «письм» → «писем». */
  function fleetIn(stemText) {
    var out = [];
    var n = stemText.length;
    if (n < 3 || !consonant(stemText.charAt(n - 1))) return out;
    var before = stemText.charAt(n - 2);
    var head = stemText.slice(0, n - 2);
    if (before === 'ь' || before === 'й') {
      out.push(head + 'е' + stemText.charAt(n - 1));
    } else if (consonant(before)) {
      out.push(stemText.slice(0, n - 1) + 'о' + stemText.charAt(n - 1));
      out.push(stemText.slice(0, n - 1) + 'е' + stemText.charAt(n - 1));
    }
    return out;
  }

  /** Основа без беглой гласной: «потолок» → «потолк», «отец» → «отц», «ремен(ь)» → «ремн». */
  function fleetOut(stemText) {
    var n = stemText.length;
    if (n < 4) return null;
    if (!consonant(stemText.charAt(n - 1)) || 'ое'.indexOf(stemText.charAt(n - 2)) < 0 || !consonant(stemText.charAt(n - 3))) return null;
    return stemText.slice(0, n - 2) + stemText.charAt(n - 1);
  }

  function addAll(out, stemText, endings) {
    for (var i = 0; i < endings.length; i++) out.push(stemText + endings[i]);
  }

  /** Формы существительного по его окончанию (с запасом: лишняя «форма» ничего не портит). */
  function nounForms(w) {
    var out = [];
    var n = w.length;
    if (n < 2) return out;
    var last = w.charAt(n - 1);
    var s;
    if (n >= 3 && /мя$/.test(w)) {
      addAll(out, w.slice(0, -2), ['мени', 'менем', 'мена', 'мен', 'менам', 'менами', 'менах']);
      return out;
    }
    if (/(енок|онок)$/.test(w) && n >= 6) {
      s = w.slice(0, -4);
      addAll(out, s, ['ята', 'ят', 'ятам', 'ятами', 'ятах', 'ата', 'ат', 'атам', 'атами', 'атах']);
    }
    if (/(анин|янин)$/.test(w) && n >= 6) {
      s = w.slice(0, -2);
      addAll(out, s, ['е', '', 'ам', 'ами', 'ах']);
    }
    if (last === 'а') {
      s = w.slice(0, -1);
      addAll(out, s, [yi(s), 'е', 'у', 'ой', 'ою', 'ам', 'ами', 'ах']);
      // Родительный множественного без окончания: «рыб», «карт»; у «-ка» после согласной —
      // только с беглой гласной («кошек», не «кошк»).
      if (!/[бвгджзклмнпрстфхцчшщ]к$/.test(s)) out.push(s);
      if (/[жшщчц]$/.test(s)) addAll(out, s, ['ей', 'ею']);
      out = out.concat(fleetIn(s));
    } else if (last === 'я' && w.charAt(n - 2) === 'и') {
      s = w.slice(0, -1);
      addAll(out, s, ['и', 'ю', 'ей', 'ею', 'й', 'е', 'ям', 'ями', 'ях']);
    } else if (last === 'я') {
      s = w.slice(0, -1);
      addAll(out, s, ['и', 'е', 'ю', 'ей', 'ею', 'ям', 'ями', 'ях']);
      if (/ь$/.test(s)) {
        out.push(s.slice(0, -1) + 'ей');
      } else {
        out.push(s + 'ь');
        var fled = fleetIn(s);
        for (var i = 0; i < fled.length; i++) out.push(fled[i], fled[i] + 'ь');
      }
    } else if (last === 'о') {
      s = w.slice(0, -1);
      addAll(out, s, ['а', 'у', 'ом', 'е', '', 'ам', 'ами', 'ах', 'ов']);
      if (/[гкхжшщч]$/.test(s)) out.push(s + 'и');
      out = out.concat(fleetIn(s));
    } else if (last === 'е' && w.charAt(n - 2) === 'и') {
      s = w.slice(0, -1);
      addAll(out, s, ['я', 'ю', 'ем', 'и', 'й', 'ям', 'ями', 'ях']);
    } else if (last === 'е' && w.charAt(n - 2) === 'ь') {
      s = w.slice(0, -1);
      addAll(out, s, ['я', 'ю', 'ем', 'е', 'ев', 'ям', 'ями', 'ях']);
      out.push(s.slice(0, -1) + 'ий');
    } else if (last === 'е') {
      s = w.slice(0, -1);
      addAll(out, s, ['я', 'ю', 'ем', 'е', 'а', 'у', 'ом', 'ей', '', 'ям', 'ями', 'ях', 'ам', 'ами', 'ах']);
      out = out.concat(fleetIn(s));
    } else if (last === 'ь') {
      s = w.slice(0, -1);
      addAll(out, s, ['я', 'ю', 'ем', 'е', 'и', 'ей', 'ью', 'ям', 'ями', 'ях']);
      if (hushed(s)) addAll(out, s, ['ам', 'ами', 'ах']);
      var cut = fleetOut(s);
      if (cut) addAll(out, cut, ['я', 'ю', 'ем', 'е', 'и', 'ей', 'ям', 'ями', 'ях']);
    } else if (last === 'й') {
      s = w.slice(0, -1);
      addAll(out, s, ['я', 'ю', 'ем', 'е', 'и', 'ев', 'ям', 'ями', 'ях']);
    } else if (last === 'ы' || last === 'и') {
      s = w.slice(0, -1);
      addAll(out, s, ['', 'ам', 'ами', 'ах', 'ям', 'ями', 'ях', 'ов', 'ей']);
      out = out.concat(fleetIn(s));
    } else if (consonant(last)) {
      addAll(out, w, ['а', 'у', 'ом', 'е', yi(w), 'ов', 'ам', 'ами', 'ах']);
      if (/[жшщчц]$/.test(w)) addAll(out, w, ['ей', 'ем', 'ев']);
      var short = fleetOut(w);
      if (short) {
        addAll(out, short, ['а', 'у', 'ом', 'ем', 'е', yi(short), 'ов', 'ев', 'ам', 'ами', 'ах']);
        if (/[жшщч]$/.test(short)) out.push(short + 'ей');
      }
    }
    return out;
  }

  /** Формы прилагательного (для частей словосочетаний: «железная» → «железной», «железную»…). */
  function adjectiveForms(w) {
    var found = /^(.+?)(ый|ий|ой|ая|яя|ое|ее|ые|ие)$/.exec(w);
    if (!found || found[1].length < 2) return [];
    var s = found[1];
    var hard = /[гкхжшщчц]$/.test(s);
    var soft = !hard && (found[2] === 'ий' || found[2] === 'яя' || found[2] === 'ее' || found[2] === 'ие');
    var i = soft || /[гкхжшщч]$/.test(s) ? 'и' : 'ы';
    var a = soft ? 'я' : 'а';
    var u = soft ? 'ю' : 'у';
    var os = soft ? ['е'] : /[жшщчц]$/.test(s) ? ['о', 'е'] : ['о'];
    var out = [];
    for (var k = 0; k < os.length; k++) {
      var o = os[k];
      addAll(out, s, [o + 'го', o + 'му', o + 'м', o + 'й', o + 'ю', o + 'е']);
    }
    addAll(out, s, [i + 'й', i + 'м', i + 'е', i + 'х', i + 'ми', a + 'я', u + 'ю']);
    return out;
  }

  function unique(list) {
    var seen = {};
    var out = [];
    for (var i = 0; i < list.length; i++) {
      if (list[i] && !seen[list[i]]) {
        seen[list[i]] = true;
        out.push(list[i]);
      }
    }
    return out;
  }

  /** Формы одного слова по правилам (без модели): само слово, падежи, число. */
  function inflect(word) {
    var w = normalize(word);
    if (!w || w.indexOf(' ') >= 0) return w ? [w] : [];
    var out = [w].concat(nounForms(w));
    if (/(ый|ий|ой|ая|яя|ое|ее|ые|ие)$/.test(w)) out = out.concat(adjectiveForms(w));
    if (IRREGULAR[w]) out = out.concat(IRREGULAR[w].split(' '));
    return unique(out);
  }

  // ---- похожесть -----------------------------------------------------------------------------

  // Звуки, которые распознавание путает между собой: гласные, звонкие и глухие пары, шипящие.
  var SOUNDS = ['аоуыэяеюий', 'бп', 'вф', 'гкх', 'дт', 'жшщч', 'зсц'];
  var SOUND_OF = {};
  for (var g = 0; g < SOUNDS.length; g++) {
    for (var c = 0; c < SOUNDS[g].length; c++) SOUND_OF[SOUNDS[g].charAt(c)] = g + 1;
  }

  function similar(x, y) {
    return !!SOUND_OF[x] && SOUND_OF[x] === SOUND_OF[y];
  }

  /** Цена лишней или потерянной буквы: гласная, ь, й, удвоенная — 1, другая согласная — 2. */
  function gapCost(s, k, sound) {
    if (!sound) return 1;
    var x = s.charAt(k);
    if (vowel(x) || x === 'ь' || x === 'ъ' || x === 'й') return 1;
    if (s.charAt(k - 1) === x || s.charAt(k + 1) === x) return 1;
    return 2;
  }

  /**
   * Расстояние Левенштейна; при limit — раньше выходит, когда оно заведомо больше limit.
   * С sound: замена созвучных букв («о» — «а», «д» — «т») стоит 1, несозвучных — 2, лишняя
   * согласная — 2: так «халадильник» близко к «холодильнику», а «малина» далеко от «машины».
   */
  function levenshtein(a, b, limit, sound) {
    if (a === b) return 0;
    var max = limit === undefined ? Infinity : limit;
    if (Math.abs(a.length - b.length) > max) return max + 1;
    var previous = [0];
    var current = [];
    var i;
    var j;
    for (j = 1; j <= b.length; j++) previous[j] = previous[j - 1] + gapCost(b, j - 1, sound);
    for (i = 1; i <= a.length; i++) {
      var drop = gapCost(a, i - 1, sound);
      current = [previous[0] + drop];
      var best = current[0];
      for (j = 1; j <= b.length; j++) {
        var x = a.charAt(i - 1);
        var y = b.charAt(j - 1);
        var cost = x === y ? 0 : !sound || similar(x, y) ? 1 : 2;
        current[j] = Math.min(previous[j] + drop, current[j - 1] + gapCost(b, j - 1, sound), previous[j - 1] + cost);
        if (current[j] < best) best = current[j];
      }
      if (best > max) return max + 1;
      previous = current;
    }
    return previous[b.length];
  }

  // ---- одно слово ---------------------------------------------------------------------------

  var RANK = { exact: 0, stem: 1, fuzzy: 2, synonym: 3 };

  function entryFor(word, cardForms, generated) {
    var formSet = {};
    var genSet = {};
    var i;
    for (i = 0; i < cardForms.length; i++) formSet[cardForms[i]] = true;
    for (i = 0; i < generated.length; i++) genSet[generated[i]] = true;
    return { word: word, forms: formSet, formList: cardForms, gen: genSet, genList: generated, stem: baseStem(word) };
  }

  function matchToken(t, entry, o) {
    if (t === entry.word) return 'exact';
    if (o.forms && entry.forms[t]) return 'exact';
    if (o.forms) {
      if (entry.gen[t]) return 'stem';
      var need = Math.max(o.minStem, entry.word.length - o.stemSlack);
      var candidates = [stem(t), t];
      for (var i = 0; i < candidates.length; i++) {
        var s = candidates[i];
        if (Math.min(s.length, entry.stem.length) >= need && sameStem(s, entry.stem)) return 'stem';
      }
    }
    // Длина, по которой решается, сколько ошибок простить, — у самого слова, а не у формы:
    // «стулом» не должно стать похожим на «столом» только потому, что форма длиннее.
    if (o.typos && entry.word.length >= o.fuzzy1 && t.length >= o.fuzzy1 - 1) {
      var allowed = entry.word.length >= o.fuzzy2 ? 2 : 1;
      var targets = [entry.word].concat(o.forms ? entry.formList.concat(entry.genList) : []);
      for (var k = 0; k < targets.length; k++) {
        var target = targets[k];
        if (o.sameFirst && t.charAt(0) !== target.charAt(0)) continue;
        if (o.sound && Math.abs(t.length - target.length) > 1) continue;
        if (levenshtein(t, target, allowed, o.sound) <= allowed) return 'fuzzy';
      }
    }
    return null;
  }

  // ---- карточка -----------------------------------------------------------------------------

  // Служебные слова внутри словосочетаний («кот в сапогах»): распознавание их часто теряет.
  var STOP = { 'в': 1, 'во': 1, 'на': 1, 'с': 1, 'со': 1, 'к': 1, 'ко': 1, 'и': 1, 'о': 1, 'об': 1, 'у': 1,
    'по': 1, 'за': 1, 'из': 1, 'от': 1, 'до': 1, 'без': 1, 'для': 1, 'под': 1, 'над': 1, 'при': 1, 'а': 1 };

  function cardOf(card) {
    if (typeof card === 'string') card = { word: card };
    var word = normalize(card.word);
    var forms = [];
    var list = card.forms || [];
    for (var i = 0; i < list.length; i++) {
      var form = normalize(list[i]);
      if (form && form !== word) forms.push(form);
    }
    return { word: word, forms: unique(forms), synonyms: card.synonyms || [] };
  }

  function contiguous(heard, phrase) {
    var size = phrase.length;
    for (var i = 0; i + size <= heard.length; i++) {
      var all = true;
      for (var j = 0; j < size; j++) {
        if (heard[i + j] !== phrase[j]) {
          all = false;
          break;
        }
      }
      if (all) return i;
    }
    return -1;
  }

  function matchSingle(heard, card, o) {
    var entry = entryFor(card.word, card.forms, o.forms ? inflect(card.word) : []);
    var best = null;
    var i;
    for (i = 0; i < heard.length; i++) {
      var how = matchToken(heard[i], entry, o);
      if (how && (!best || RANK[how] < RANK[best.how])) best = { ok: true, token: heard[i], how: how };
      if (best && best.how === 'exact') return best;
    }
    // Распознавание иногда режет длинное слово надвое: «холо дильник».
    if (!best && card.word.length >= o.fuzzy1) {
      for (i = 0; i + 1 < heard.length; i++) {
        var joined = heard[i] + heard[i + 1];
        var glued = matchToken(joined, entry, o);
        if (glued) return { ok: true, token: heard[i] + ' ' + heard[i + 1], how: glued };
      }
    }
    return best;
  }

  function matchPhrase(heard, card, o) {
    var parts = card.word.split(' ');
    var whole = [card.word].concat(o.forms ? card.forms : []);
    var i;
    for (i = 0; i < whole.length; i++) {
      var words = whole[i].split(' ');
      var at = contiguous(heard, words);
      if (at >= 0) return { ok: true, token: words.join(' '), how: 'exact' };
    }
    var slots = [];
    for (var p = 0; p < parts.length; p++) {
      var part = parts[p];
      if (part.length <= 3 && STOP[part]) continue;
      var own = [];
      if (o.forms) {
        for (i = 0; i < card.forms.length; i++) {
          var split = card.forms[i].split(' ');
          if (split.length === parts.length && split[p] !== part) own.push(split[p]);
        }
      }
      var generated = o.forms ? unique(inflect(part).concat(adjectiveForms(part))) : [];
      var entry = entryFor(part, unique(own), generated);
      var hits = [];
      for (i = 0; i < heard.length; i++) {
        var how = matchToken(heard[i], entry, o);
        if (how) hits.push({ at: i, how: how });
      }
      if (!hits.length) return null;
      slots.push(hits);
    }
    if (!slots.length) return null;
    var best = null;
    var used = {};
    function walk(index, low, high, worst) {
      if (index === slots.length) {
        var span = high - low;
        if (span >= o.window) return;
        if (!best || RANK[worst] < RANK[best.worst] || (worst === best.worst && span < best.high - best.low)) {
          best = { low: low, high: high, worst: worst };
        }
        return;
      }
      var hits = slots[index];
      for (var k = 0; k < hits.length; k++) {
        var hit = hits[k];
        if (used[hit.at]) continue;
        var nextLow = Math.min(low, hit.at);
        var nextHigh = Math.max(high, hit.at);
        if (nextHigh - nextLow >= o.window) continue;
        used[hit.at] = true;
        walk(index + 1, nextLow, nextHigh, RANK[hit.how] > RANK[worst] ? hit.how : worst);
        used[hit.at] = false;
      }
    }
    walk(0, Infinity, -Infinity, 'exact');
    if (!best) return null;
    return { ok: true, token: heard.slice(best.low, best.high + 1).join(' '), how: best.worst };
  }

  function matchCard(heard, card, o) {
    if (!card.word) return null;
    return card.word.indexOf(' ') >= 0 ? matchPhrase(heard, card, o) : matchSingle(heard, card, o);
  }

  /** Угадано ли загаданное в услышанном: { ok, token, how }. */
  function matches(heardText, card, given) {
    var o = options(given);
    var heard = tokens(heardText);
    var plain = cardOf(card || '');
    if (!heard.length || !plain.word) return { ok: false, token: '', how: '' };
    var found = matchCard(heard, plain, o);
    if (found) return found;
    if (o.synonyms) {
      for (var i = 0; i < plain.synonyms.length; i++) {
        var synonym = cardOf({ word: plain.synonyms[i] });
        var hit = synonym.word ? matchCard(heard, synonym, o) : null;
        if (hit) return { ok: true, token: hit.token, how: 'synonym' };
      }
    }
    return { ok: false, token: '', how: '' };
  }

  /** Одно ли это слово (с точностью до формы): для дублей в колоде и своих слов игроков. */
  function sameWord(a, b, given) {
    var x = normalize(a);
    var y = normalize(b);
    if (!x || !y) return false;
    if (x === y) return true;
    var o = options(given);
    o.typos = false;
    var xs = x.split(' ');
    var ys = y.split(' ');
    if (xs.length !== ys.length) return false;
    if (xs.length > 1) {
      for (var i = 0; i < xs.length; i++) {
        if (!sameWord(xs[i], ys[i], o)) return false;
      }
      return true;
    }
    return !!matchToken(x, entryFor(y, [], inflect(y)), o) || !!matchToken(y, entryFor(x, [], inflect(x)), o);
  }

  exports.DEFAULTS = DEFAULTS;
  exports.options = options;
  exports.normalize = normalize;
  exports.tokens = tokens;
  exports.numberWords = numberWords;
  exports.foreign = foreign;
  exports.stem = stem;
  exports.baseStem = baseStem;
  exports.inflect = inflect;
  exports.adjectiveForms = adjectiveForms;
  exports.levenshtein = levenshtein;
  exports.matches = matches;
  exports.sameWord = sameWord;
})(typeof exports !== 'undefined' ? exports : (window.ruMatch = {}));
