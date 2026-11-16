// A chapter of the quest is checked in the engine before it joins the stock: every room can be
// reached, the key of every lock can be had before the lock, the goal can be reached, every
// puzzle has three hints, texts are short enough to listen to. A chapter that fails goes back to
// the model with the list of errors. Pure logic (engine and node).
var quest = require('./quest.js');

var EMOJI = /[☀-➿]|[\uD83C-\uD83E][\uDC00-\uDFFF]/;
var LIST = /(^|\n)\s*([-*•]|\d+[.)])\s+/;

function asArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

/** Light repairs of what a model writes: ids as strings, missing lists as empty ones. */
function tidy(raw) {
  var chapter = JSON.parse(JSON.stringify(raw || {}));
  chapter.rooms = chapter.rooms || {};
  chapter.items = chapter.items || {};
  chapter.puzzles = asArray(chapter.puzzles);
  Object.keys(chapter.rooms).forEach(function (id) {
    var room = chapter.rooms[id] || {};
    room.items = asArray(room.items).map(String);
    room.exits = room.exits || {};
    chapter.rooms[id] = room;
  });
  Object.keys(chapter.items).forEach(function (id) {
    var found = chapter.items[id] || {};
    found.forms = asArray(found.forms).map(function (form) { return String(form).toLowerCase(); });
    if (found.take === undefined) found.take = true;
    chapter.items[id] = found;
  });
  chapter.puzzles.forEach(function (puzzle) {
    puzzle.need = asArray(puzzle.need).map(String);
    puzzle.hints = asArray(puzzle.hints);
  });
  return chapter;
}

/** Everything that can be reached and had from the start: {rooms, items, flags} (a fixed point). */
function reach(chapter) {
  var rooms = {};
  var items = {};
  var flags = {};
  rooms[chapter.start] = true;
  var light = function () {
    return Object.keys(items).some(function (id) { return chapter.items[id] && chapter.items[id].light; });
  };
  var changed = true;
  var rounds = 0;
  while (changed && rounds < 200) {
    changed = false;
    rounds++;
    Object.keys(rooms).forEach(function (roomId) {
      var room = chapter.rooms[roomId];
      if (!room) return;
      (room.items || []).forEach(function (id) {
        if (chapter.items[id] && chapter.items[id].take && !items[id]) { items[id] = true; changed = true; }
      });
    });
    (chapter.puzzles || []).forEach(function (puzzle) {
      if (!rooms[puzzle.room] || (puzzle.sets && flags[puzzle.sets] && (!puzzle.gives || items[puzzle.gives]))) return;
      var placedHere = (chapter.rooms[puzzle.room] || {}).items || [];
      var ready = (puzzle.need || []).every(function (id) { return items[id] || placedHere.indexOf(id) >= 0; });
      if (!ready) return;
      if (puzzle.sets && !flags[puzzle.sets]) { flags[puzzle.sets] = true; changed = true; }
      if (puzzle.gives && !items[puzzle.gives]) { items[puzzle.gives] = true; changed = true; }
    });
    Object.keys(rooms).forEach(function (roomId) {
      quest.exitsOf(chapter, roomId).forEach(function (exit) {
        if (rooms[exit.to] || !chapter.rooms[exit.to]) return;
        if (exit.lock && !items[exit.lock]) return;
        if (exit.flag && !flags[exit.flag]) return;
        if (chapter.rooms[exit.to].dark && !light()) return;
        rooms[exit.to] = true;
        changed = true;
      });
    });
  }
  return { rooms: rooms, items: items, flags: flags };
}

function textProblems(where, text, max) {
  var out = [];
  if (typeof text !== 'string' || !text.trim()) {
    out.push(where + ': нет текста');
    return out;
  }
  if (text.length > max) out.push(where + ': текст длиннее ' + max + ' знаков (' + text.length + ')');
  if (EMOJI.test(text)) out.push(where + ': эмодзи в тексте для слуха');
  if (LIST.test(text)) out.push(where + ': список в тексте для слуха');
  return out;
}

/**
 * Errors of the chapter as short Russian lines (an empty list — the chapter is fine).
 * options: {maxTextChars, roomsMin, roomsMax, itemsMin, itemsMax, puzzlesMin, puzzlesMax, hints}
 */
function validate(raw, options) {
  options = options || {};
  var max = options.maxTextChars || 400;
  var hintsWanted = options.hints || 3;
  var errors = [];
  var chapter = tidy(raw);
  var roomIds = Object.keys(chapter.rooms);
  var itemIds = Object.keys(chapter.items);

  if (!chapter.title) errors.push('у главы нет названия (title)');
  if (!roomIds.length) {
    errors.push('в главе нет комнат (rooms)');
    return errors;
  }
  if (!chapter.rooms[chapter.start]) errors.push('начальная комната start «' + chapter.start + '» не описана в rooms');
  if (options.roomsMin && roomIds.length < options.roomsMin) errors.push('комнат ' + roomIds.length + ', нужно не меньше ' + options.roomsMin);
  if (options.roomsMax && roomIds.length > options.roomsMax) errors.push('комнат ' + roomIds.length + ', нужно не больше ' + options.roomsMax);
  if (options.itemsMin && itemIds.length < options.itemsMin) errors.push('предметов ' + itemIds.length + ', нужно не меньше ' + options.itemsMin);
  if (options.itemsMax && itemIds.length > options.itemsMax) errors.push('предметов ' + itemIds.length + ', нужно не больше ' + options.itemsMax);
  if (options.puzzlesMin && chapter.puzzles.length < options.puzzlesMin) errors.push('загадок ' + chapter.puzzles.length + ', нужно не меньше ' + options.puzzlesMin);
  if (options.puzzlesMax && chapter.puzzles.length > options.puzzlesMax) errors.push('загадок ' + chapter.puzzles.length + ', нужно не больше ' + options.puzzlesMax);
  if (chapter.recap) errors = errors.concat(textProblems('пересказ recap', chapter.recap, max));

  var placedIn = {};
  roomIds.forEach(function (id) {
    var room = chapter.rooms[id];
    if (!room.name) errors.push('у комнаты «' + id + '» нет name');
    errors = errors.concat(textProblems('комната «' + id + '»', room.text, max));
    (room.changes || []).forEach(function (change, k) {
      if (!change || !change.flag) errors.push('у изменения ' + (k + 1) + ' комнаты «' + id + '» нет flag');
      else errors = errors.concat(textProblems('комната «' + id + '» после «' + change.flag + '»', change.text, max));
    });
    quest.exitsOf(chapter, id).forEach(function (exit) {
      if (!chapter.rooms[exit.to]) errors.push('выход «' + exit.dir + '» из «' + id + '» ведёт в несуществующую комнату «' + exit.to + '»');
      if (exit.lock && !chapter.items[exit.lock]) errors.push('замок на выходе «' + exit.dir + '» из «' + id + '» требует предмет «' + exit.lock + '», которого нет в items');
      if (exit.lock && !exit.locked) errors.push('у запертого выхода «' + exit.dir + '» из «' + id + '» нет текста locked');
      if (exit.locked) errors = errors.concat(textProblems('замок в «' + id + '»', exit.locked, max));
    });
    room.items.forEach(function (itemId) {
      if (!chapter.items[itemId]) errors.push('в комнате «' + id + '» лежит неизвестный предмет «' + itemId + '»');
      if (placedIn[itemId]) errors.push('предмет «' + itemId + '» лежит сразу в двух комнатах');
      placedIn[itemId] = id;
    });
  });

  itemIds.forEach(function (id) {
    var found = chapter.items[id];
    if (!found.name) errors.push('у предмета «' + id + '» нет name');
    if (found.forms.length < 2) errors.push('у предмета «' + id + '» меньше двух форм слова (forms): нужны падежи');
    errors = errors.concat(textProblems('предмет «' + id + '»', found.text, max));
    var given = chapter.puzzles.some(function (puzzle) { return puzzle.gives === id; });
    if (!placedIn[id] && !given) errors.push('предмет «' + id + '» не лежит ни в одной комнате и не выдаётся загадкой');
  });

  var puzzleIds = {};
  chapter.puzzles.forEach(function (puzzle, i) {
    var name = 'загадка «' + (puzzle.id || i + 1) + '»';
    if (!puzzle.id) errors.push('у загадки ' + (i + 1) + ' нет id');
    if (puzzleIds[puzzle.id]) errors.push(name + ': повтор id');
    puzzleIds[puzzle.id] = true;
    if (!chapter.rooms[puzzle.room]) errors.push(name + ': комната «' + puzzle.room + '» не описана');
    if (!puzzle.verb) errors.push(name + ': нет глагола verb');
    puzzle.need.forEach(function (id) {
      if (!chapter.items[id]) errors.push(name + ': нужен неизвестный предмет «' + id + '»');
    });
    if (puzzle.gives && !chapter.items[puzzle.gives]) errors.push(name + ': выдаёт неизвестный предмет «' + puzzle.gives + '»');
    var hints = puzzle.hints.filter(function (text) { return typeof text === 'string' && text.trim(); });
    if (hints.length !== hintsWanted) errors.push(name + ': подсказок ' + hints.length + ', нужно ровно ' + hintsWanted);
    hints.forEach(function (text, k) { errors = errors.concat(textProblems(name + ', подсказка ' + (k + 1), text, max)); });
    errors = errors.concat(textProblems(name + ', текст done', puzzle.done, max));
  });

  var goal = chapter.goal || {};
  if (!goal.room) errors.push('у цели главы нет комнаты (goal.room)');
  else if (!chapter.rooms[goal.room]) errors.push('цель главы в несуществующей комнате «' + goal.room + '»');
  if (goal.flag && !chapter.puzzles.some(function (puzzle) { return puzzle.sets === goal.flag; })) {
    errors.push('флаг цели «' + goal.flag + '» не ставит ни одна загадка');
  }
  if (goal.text !== undefined || goal.room) errors = errors.concat(textProblems('цель главы', goal.text, max));
  if (goal.next) errors = errors.concat(textProblems('крючок на следующую главу', goal.next, max));

  var darkRooms = roomIds.filter(function (id) { return chapter.rooms[id].dark; });
  if (darkRooms.length && !itemIds.some(function (id) { return chapter.items[id].light; })) {
    errors.push('есть тёмные комнаты, но ни один предмет не светит (light: true)');
  }
  if (chapter.rooms[chapter.start] && chapter.rooms[chapter.start].dark) errors.push('начальная комната не может быть тёмной');

  if (errors.length) return errors;

  // Can it be played through? Rooms, keys, puzzles and the goal by the fixed point.
  var got = reach(chapter);
  roomIds.forEach(function (id) {
    if (!got.rooms[id]) errors.push('комната «' + id + '» недостижима из начала');
  });
  roomIds.forEach(function (id) {
    quest.exitsOf(chapter, id).forEach(function (exit) {
      if (exit.lock && got.rooms[id] && !got.items[exit.lock]) {
        errors.push('ключ «' + exit.lock + '» от замка в «' + id + '» нельзя получить, не пройдя этот замок');
      }
    });
  });
  chapter.puzzles.forEach(function (puzzle) {
    if (puzzle.sets && !got.flags[puzzle.sets]) errors.push('загадку «' + puzzle.id + '» нельзя решить: комната недостижима или нужных предметов не достать');
  });
  if (goal.room && !got.rooms[goal.room]) errors.push('до цели главы не добраться');
  if (goal.flag && !got.flags[goal.flag]) errors.push('условие цели «' + goal.flag + '» недостижимо');
  return errors;
}

/** The texts to be heard: [{node, text}] — for recording them in advance. */
function texts(raw) {
  var chapter = tidy(raw);
  var out = [];
  Object.keys(chapter.rooms).forEach(function (id) { out.push({ node: 'room-' + id, text: chapter.rooms[id].text }); });
  Object.keys(chapter.items).forEach(function (id) {
    if (chapter.items[id].text) out.push({ node: 'item-' + id, text: chapter.items[id].text });
  });
  chapter.puzzles.forEach(function (puzzle) {
    if (puzzle.done) out.push({ node: 'done-' + puzzle.id, text: puzzle.done });
  });
  if (chapter.goal && chapter.goal.text) out.push({ node: 'goal', text: chapter.goal.text });
  if (chapter.recap) out.push({ node: 'recap', text: chapter.recap });
  return out.filter(function (entry) { return entry.text; });
}

exports.tidy = tidy;
exports.reach = reach;
exports.validate = validate;
exports.texts = texts;
