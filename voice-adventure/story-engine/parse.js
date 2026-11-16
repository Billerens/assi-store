// What the owner said, understood without the network: service words, a verb with its synonyms,
// a direction, the items of the current chapter by their forms (and by recognizer typos).
// Pure logic, shared by the engine (Rhino) and the tests (node).
//
//   parse.parse('возьми ламбу', world) -> {verb: 'take', object: 'lamp', ...}
//   world = {items: [{id, forms}], exits: [{dir, forms}], puzzles: [{id, verb, forms}]}
var words = require('./words.js');

var VERBS = {
  go: ['иди', 'идти', 'пойди', 'пойти', 'пойдем', 'пошли', 'шагни', 'шагай', 'ступай', 'двигайся', 'отправляйся',
    'перейди', 'зайди', 'войди', 'заходи', 'входи', 'выйди', 'выходи', 'поднимись', 'подняться', 'поднимайся',
    'спустись', 'спуститься', 'спускайся', 'беги', 'вернись', 'вернуться', 'иду', 'пойду', 'направляйся', 'лезь',
    'полезай', 'залезь', 'проберись', 'пройди', 'проходи', 'плыви', 'переплыви'],
  look: ['осмотри', 'осмотреть', 'осмотрись', 'оглядись', 'посмотри', 'смотри', 'посмотреть', 'глянь', 'взгляни',
    'изучи', 'исследуй', 'прочитай', 'прочти', 'читай', 'опиши', 'рассмотри', 'обыщи', 'загляни', 'проверь'],
  take: ['возьми', 'взять', 'бери', 'подбери', 'подобрать', 'подними', 'поднять', 'забери', 'забрать', 'хватай',
    'достань', 'прихвати', 'беру', 'возьму', 'подберу', 'заберу'],
  drop: ['положи', 'положить', 'брось', 'бросить', 'выброси', 'оставь', 'выкинь', 'поставь', 'кладу', 'положу'],
  open: ['открой', 'открыть', 'отопри', 'отпереть', 'отомкни', 'распахни', 'открываю', 'открою', 'отпираю'],
  close: ['закрой', 'закрыть', 'запри', 'запереть', 'захлопни'],
  use: ['используй', 'использовать', 'примени', 'применить', 'вставь', 'нажми', 'потяни', 'толкни', 'включи',
    'зажги', 'поверни', 'крути', 'покрути', 'дерни', 'подвинь', 'сдвинь', 'почини', 'сломай', 'разбей', 'надень',
    'налей', 'полей', 'вылей', 'ударь', 'постучи', 'разрежь', 'привяжи', 'вставляю', 'использую', 'применяю'],
  talk: ['говори', 'поговори', 'скажи', 'спроси', 'позови', 'крикни', 'ответь', 'поздоровайся', 'попроси']
};

// Whole phrases that steer the game rather than act in it.
var SERVICE = {
  repeat: ['повтори', 'повторить', 'повтори еще раз', 'еще раз', 'что что', 'не расслышал', 'не расслышала',
    'скажи еще раз', 'что ты сказал', 'не понял повтори'],
  where: ['где я', 'где мы', 'где я сейчас', 'куда я попал', 'что вокруг', 'где нахожусь'],
  inventory: ['что у меня', 'что у меня есть', 'инвентарь', 'мои вещи', 'что в руках', 'что со мной', 'что в сумке',
    'что в карманах', 'что я несу'],
  hint: ['подсказка', 'подскажи', 'подсказку', 'помоги', 'помогите', 'дай подсказку', 'нужна подсказка',
    'что делать', 'что мне делать', 'не знаю что делать'],
  save: ['сохрани', 'сохранить', 'сохранись', 'сохраняй', 'сохрани игру'],
  pause: ['пауза', 'подожди', 'погоди', 'постой', 'стоп', 'замри', 'поставь на паузу'],
  stop: ['хватит', 'закончим', 'заканчиваем', 'выйти из игры', 'конец игры', 'все хватит', 'на сегодня хватит',
    'выключи', 'закончи'],
  help: ['помощь', 'что можно', 'команды', 'что я могу', 'что я могу сделать', 'справка'],
  resume: ['продолжи', 'продолжай', 'продолжим', 'дальше', 'поехали', 'играем']
};

var DIRECTIONS = {
  'север': ['север', 'севера', 'северу', 'северная', 'северную', 'северный', 'северное'],
  'юг': ['юг', 'юга', 'югу', 'южная', 'южную', 'южный', 'южное'],
  'запад': ['запад', 'запада', 'западу', 'западная', 'западную', 'западный', 'западное'],
  'восток': ['восток', 'востока', 'востоку', 'восточная', 'восточную', 'восточный', 'восточное'],
  'вверх': ['вверх', 'наверх', 'наверху', 'выше', 'подняться', 'поднимись', 'поднимайся', 'подъем'],
  'вниз': ['вниз', 'спустись', 'спуститься', 'спускайся', 'ниже', 'спуск'],
  'назад': ['назад', 'обратно', 'вернись', 'вернуться'],
  'внутрь': ['внутрь', 'войди', 'зайди', 'входи', 'заходи', 'вход'],
  'наружу': ['наружу', 'выйди', 'выходи', 'выход']
};

var DOORS = ['дверь', 'двери', 'дверью', 'дверца', 'дверцу', 'люк', 'люка', 'люком', 'ворота', 'калитка', 'калитку',
  'решетка', 'решетку', 'замок', 'замка', 'створка', 'створку', 'засов', 'проход', 'крышка', 'крышку', 'сундук'];

var FILLERS = ['в', 'во', 'на', 'к', 'ко', 'с', 'со', 'по', 'за', 'под', 'над', 'из', 'от', 'до', 'у', 'о', 'об',
  'про', 'через', 'и', 'а', 'же', 'ну', 'пожалуйста', 'давай', 'давайте', 'мне', 'меня', 'это', 'эту', 'этот',
  'эти', 'тот', 'ту', 'туда', 'сюда', 'там', 'тут', 'здесь', 'ладно', 'так', 'ок', 'окей', 'эй', 'слушай',
  'теперь', 'потом', 'сейчас', 'быстро', 'снова', 'опять', 'помощью', 'при', 'вокруг', 'внимательно', 'еще'];

var LOOK_PHRASES = ['что тут', 'что здесь', 'что тут есть', 'что здесь есть', 'оглядеться', 'осмотреться',
  'осмотреть комнату', 'осмотри комнату', 'опиши комнату'];

var LEADING = ['ну', 'так', 'давай', 'давайте', 'ладно', 'ок', 'окей', 'эй', 'слушай', 'а', 'и'];
var TRAILING = ['пожалуйста', 'же', 'ладно', 'давай', 'ок'];

function trimFillers(norm) {
  var list = norm ? norm.split(' ') : [];
  while (list.length > 1 && LEADING.indexOf(list[0]) >= 0) list.shift();
  while (list.length > 1 && TRAILING.indexOf(list[list.length - 1]) >= 0) list.pop();
  return list.join(' ');
}

/** The service word of a short phrase ('repeat', 'where', 'hint'…) or null. */
function service(text) {
  var norm = trimFillers(words.normalize(text));
  if (!norm) return null;
  var count = norm.split(' ').length;
  var keys = Object.keys(SERVICE);
  for (let key of keys) {
    if (SERVICE[key].indexOf(norm) >= 0) return key;
  }
  for (let key of keys) {
    for (let phrase of SERVICE[key]) {
      if (norm.indexOf(phrase + ' ') === 0 && count <= phrase.split(' ').length + 1) return key;
    }
  }
  return null;
}

/** The direction a word names ('север', 'вверх'…) or null; chapters may name exits in any of the forms. */
function canonicalDir(word) {
  var norm = words.normalize(word);
  for (let key of Object.keys(DIRECTIONS)) {
    if (key === norm || DIRECTIONS[key].indexOf(norm) >= 0) return key;
  }
  var stripped = norm.replace(/^(на|в|во|к)\s+/, '');
  if (stripped !== norm) return canonicalDir(stripped);
  return null;
}

/** Every form a direction or exit can be called by. */
function dirForms(key, extra) {
  var canonical = canonicalDir(key);
  var list = [words.normalize(key)];
  if (canonical) list = list.concat([canonical], DIRECTIONS[canonical]);
  (extra || []).forEach(function (form) { list.push(words.normalize(form)); });
  return list.filter(function (form, i) { return form && list.indexOf(form) === i; });
}

function isInstrumental(form) {
  return /(ом|ем|ой|ей|ью|ами|ями)$/.test(words.normalize(form));
}

function verbStem(verb) {
  var norm = words.normalize(verb);
  return norm.replace(/(ться|тись|ть|ти|чь)$/, '');
}

function matchesVerb(token, verb, forms) {
  var list = [verb].concat(forms || []).map(words.normalize);
  if (list.indexOf(token) >= 0) return true;
  var base = verbStem(verb);
  var shared = words.commonPrefix(token, base);
  return base.length >= 5 && shared >= Math.min(base.length - 1, 6) && shared >= 5;
}

function findVerb(toks, puzzles) {
  var i;
  for (i = 0; i < toks.length; i++) {
    for (let puzzle of puzzles || []) {
      if (puzzle.verb && matchesVerb(toks[i], puzzle.verb, puzzle.forms)) return { verb: 'use', at: i, puzzle: puzzle.id };
    }
    for (let key of Object.keys(VERBS)) {
      if (VERBS[key].indexOf(toks[i]) >= 0) return { verb: key, at: i };
    }
  }
  // A typo of the recognizer in the verb: one letter off in a word of five letters or more.
  for (i = 0; i < toks.length; i++) {
    if (toks[i].length < 5) continue;
    for (let key of Object.keys(VERBS)) {
      for (let form of VERBS[key]) {
        if (form.length >= 5 && words.levenshtein(toks[i], form, 1) <= 1) return { verb: key, at: i };
      }
    }
  }
  return null;
}

function phraseAt(toks, phrase) {
  var parts = phrase.split(' ');
  for (var i = 0; i + parts.length <= toks.length; i++) {
    var hit = true;
    for (var j = 0; j < parts.length; j++) {
      if (toks[i + j] !== parts[j]) { hit = false; break; }
    }
    if (hit) return i;
  }
  return -1;
}

/**
 * Understands a phrase against what is around: {verb, object, objects, with, dir, puzzle, topic,
 * service, unknown, empty, raw}. verb: go | look | take | drop | open | close | use | talk.
 * object 'door' — a door, a hatch, a lock without an item named.
 */
function parse(text, world, options) {
  world = world || {};
  options = options || {};
  var maxTypos = options.maxTypos === undefined ? 2 : options.maxTypos;
  var raw = String(text === undefined || text === null ? '' : text);
  var norm = trimFillers(words.normalize(raw));
  if (!norm) return { empty: true, raw: raw };
  var said = service(norm);
  if (said) return { service: said, raw: raw };
  if (LOOK_PHRASES.indexOf(norm) >= 0) {
    return { verb: 'look', object: null, objects: [], with: null, dir: null, topic: null, raw: raw, unknown: false };
  }

  var toks = norm.split(' ');
  var used = {};
  var found = findVerb(toks, world.puzzles);
  var verb = found ? found.verb : null;
  if (found) used[found.at] = true;

  // Direction: the exits of this room first, then any compass word.
  var dir = null;
  var exits = world.exits || [];
  for (let exit of exits) {
    var forms = dirForms(exit.dir, exit.forms);
    for (let form of forms) {
      var at = form.indexOf(' ') >= 0 ? phraseAt(toks, form) : toks.indexOf(form);
      if (at >= 0) { dir = exit.dir; break; }
    }
    if (dir) break;
  }
  if (!dir) {
    for (let i = 0; i < toks.length && !dir; i++) dir = canonicalDir(toks[i]);
  }

  // Items by their forms: phrases, exact words, then typos.
  var items = [];
  var seen = {};
  function add(id, at, form) {
    if (seen[id]) return;
    seen[id] = true;
    items.push({ id: id, at: at, form: form });
  }
  (world.items || []).forEach(function (item) {
    (item.forms || []).map(words.normalize).forEach(function (form) {
      if (!form || form.indexOf(' ') < 0) return;
      var at = phraseAt(toks, form);
      if (at >= 0) {
        add(item.id, at, form);
        form.split(' ').forEach(function (part, k) { used[at + k] = true; });
      }
    });
  });
  toks.forEach(function (tok, i) {
    if (used[i]) return;
    (world.items || []).forEach(function (item) {
      if ((item.forms || []).map(words.normalize).indexOf(tok) >= 0) { add(item.id, i, tok); used[i] = true; }
    });
  });
  toks.forEach(function (tok, i) {
    if (used[i] || tok.length < 4 || FILLERS.indexOf(tok) >= 0) return;
    (world.items || []).forEach(function (item) {
      if (seen[item.id]) return;
      var hit = (item.forms || []).some(function (form) { return words.similar(tok, form, maxTypos); });
      if (hit) { add(item.id, i, tok); used[i] = true; }
    });
  });
  items.sort(function (a, b) { return a.at - b.at; });

  var door = toks.some(function (tok, i) { return DOORS.indexOf(tok) >= 0 && !used[i]; });
  var object = items.length ? items[0].id : null;
  var withItem = items.length > 1 ? items[1].id : null;
  if (items.length > 1 && isInstrumental(items[0].form) && !isInstrumental(items[1].form)) {
    object = items[1].id;
    withItem = items[0].id;
  }
  if (door && (verb === 'open' || verb === 'close' || verb === 'use' || !verb) && items.length <= 1) {
    withItem = items.length ? items[0].id : null;
    object = 'door';
    if (!verb) verb = withItem ? 'open' : 'look';
  }

  // What else was named: for a free answer about something that is not an item.
  var topic = toks.filter(function (tok, i) {
    return !used[i] && FILLERS.indexOf(tok) < 0 && !canonicalDir(tok);
  }).join(' ');

  if (!verb && dir) verb = 'go';
  if (!verb && object) verb = 'look';
  if (verb === 'look' && !object && dir && !found) verb = 'go';
  var result = {
    verb: verb, object: object, with: withItem, dir: dir, raw: raw,
    objects: items.map(function (item) { return item.id; }),
    topic: topic || null,
    unknown: !verb
  };
  if (found && found.puzzle) result.puzzle = found.puzzle;
  return result;
}

/** What can be said, as a short spoken list for «не понял». */
function helpLine(world) {
  var dirs = (world && world.exits || []).map(function (exit) {
    var canonical = canonicalDir(exit.dir);
    if (canonical === 'вверх') return 'подняться наверх';
    if (canonical === 'вниз') return 'спуститься вниз';
    if (canonical === 'назад') return 'вернуться';
    if (canonical === 'внутрь') return 'войти';
    if (canonical === 'наружу') return 'выйти';
    return canonical ? 'идти на ' + canonical : 'идти: ' + exit.dir;
  });
  var list = ['осмотреться', 'взять предмет'].concat(dirs.slice(0, 2));
  return 'Можно: ' + words.joinAnd(list) + '. Ещё: «подсказка», «что у меня», «повтори».';
}

exports.VERBS = VERBS;
exports.SERVICE = SERVICE;
exports.DIRECTIONS = DIRECTIONS;
exports.DOORS = DOORS;
exports.service = service;
exports.canonicalDir = canonicalDir;
exports.dirForms = dirForms;
exports.isInstrumental = isInstrumental;
exports.parse = parse;
exports.helpLine = helpLine;
