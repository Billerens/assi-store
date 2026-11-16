// The quest played from a chapter written in advance: rooms, items, exits, puzzles, a goal.
// Deterministic and offline; the state is a plain object saved after every line.
// Pure logic, shared by the engine (Rhino) and the tests (node).
//
//   var s = quest.create(chapter, {plot: 'observatory'});
//   var out = quest.act(chapter, s, parse.parse('возьми лампу', quest.world(chapter, s)));
//   out.text, out.state, out.events  ('move', 'take', 'drop', 'unlock', 'solve', 'free', 'chapter-done')
var words = require('./words.js');
var parse = require('./parse.js');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function has(list, value) {
  return (list || []).indexOf(value) >= 0;
}

/** A new playthrough of the chapter. */
function create(chapter, base) {
  base = base || {};
  var placed = {};
  Object.keys(chapter.rooms || {}).forEach(function (id) { placed[id] = (chapter.rooms[id].items || []).slice(); });
  return {
    story: 'quest', plot: base.plot || null, chapter: chapter.chapter || 1, room: chapter.start, prev: null,
    inventory: [], flags: {}, hintsUsed: {}, visited: [chapter.start], unlocked: {}, solved: {}, placed: placed,
    history: [], turn: 0, done: false, hints: 0, lastLine: '', startedAt: base.now || 0
  };
}

function item(chapter, id) {
  return (chapter.items || {})[id] || null;
}

/** The item's name: 0 — as it is called, 1 — «взять что» (the second form the model gave). */
function nameOf(chapter, id, form) {
  var found = item(chapter, id);
  if (!found) return id;
  var forms = found.forms || [];
  if (form === 1 && forms[1]) return forms[1];
  return found.name || forms[0] || id;
}

/** The exits of a room as a list: [{dir, to, lock, locked, flag, blocked, forms}]. */
function exitsOf(chapter, roomId) {
  var room = (chapter.rooms || {})[roomId];
  if (!room) return [];
  return Object.keys(room.exits || {}).map(function (dir) {
    var exit = room.exits[dir];
    if (typeof exit === 'string') return { dir: dir, to: exit };
    var out = { dir: dir, to: exit.to };
    ['lock', 'locked', 'opened', 'flag', 'blocked', 'forms', 'name'].forEach(function (key) {
      if (exit[key] !== undefined) out[key] = exit[key];
    });
    return out;
  });
}

function hasLight(chapter, inventory) {
  return (inventory || []).some(function (id) { return item(chapter, id) && item(chapter, id).light; });
}

function visibleItems(chapter, state) {
  return (state.placed[state.room] || []).filter(function (id) { return !has(state.inventory, id); });
}

/** What the parser may refer to here: items of the room and in hand, exits, unsolved puzzles of the room. */
function world(chapter, state) {
  var ids = visibleItems(chapter, state).concat(state.inventory);
  return {
    items: ids.map(function (id) {
      var found = item(chapter, id) || {};
      return { id: id, forms: (found.forms || []).concat(found.name ? [found.name] : []) };
    }),
    exits: exitsOf(chapter, state.room).map(function (exit) {
      return { dir: exit.dir, forms: (exit.forms || []).concat(exit.name ? [exit.name] : []) };
    }),
    puzzles: (chapter.puzzles || []).filter(function (puzzle) {
      return puzzle.room === state.room && !state.solved[puzzle.id];
    }).map(function (puzzle) { return { id: puzzle.id, verb: puzzle.verb, forms: puzzle.forms || puzzle.verbs || [] }; })
  };
}

function dirPhrase(dir) {
  var canonical = parse.canonicalDir(dir);
  var map = { 'вверх': 'наверх', 'вниз': 'вниз', 'назад': 'назад', 'внутрь': 'внутрь', 'наружу': 'наружу' };
  if (canonical && map[canonical]) return map[canonical];
  if (canonical) return 'на ' + canonical;
  return dir;
}

function exitsLine(chapter, state) {
  var list = exitsOf(chapter, state.room).map(function (exit) { return dirPhrase(exit.dir); });
  if (!list.length) return 'Отсюда выхода нет.';
  return 'Отсюда можно пойти ' + words.joinAnd(list) + '.';
}

/** Where the movable things of the room lie; fixed ones are part of the room's own text. */
function itemsLine(chapter, state) {
  return visibleItems(chapter, state).filter(function (id) { return (item(chapter, id) || {}).take; }).map(function (id) {
    var found = item(chapter, id) || {};
    return found.here || ('Здесь есть ' + nameOf(chapter, id, 0) + '.');
  }).join(' ');
}

/** The room's text as things stand: a puzzle solved may have changed it (room.changes). */
function roomText(room, state) {
  var text = room.text;
  (room.changes || []).forEach(function (change) {
    if (change && change.flag && state.flags[change.flag] && change.text) text = change.text;
  });
  return text;
}

/** The room as it is now: the full text on the first visit, its name and what is in it later. */
function describe(chapter, state, full) {
  var room = chapter.rooms[state.room];
  var parts = [];
  if (full) {
    parts.push(roomText(room, state));
  } else {
    parts.push(room.short || (words.capital(room.name) + '.'));
  }
  var lying = itemsLine(chapter, state);
  if (lying) parts.push(lying);
  if (!full) parts.push(exitsLine(chapter, state));
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

function inventoryText(chapter, state) {
  if (!state.inventory.length) return 'Руки пусты.';
  return 'У вас ' + words.joinAnd(state.inventory.map(function (id) { return nameOf(chapter, id, 0); })) + '.';
}

function whereText(chapter, state) {
  var room = chapter.rooms[state.room];
  return 'Вы здесь: ' + room.name + '. ' + exitsLine(chapter, state);
}

function remember(state, entry) {
  state.history.push(entry);
  if (state.history.length > 12) state.history.shift();
}

function goalCheck(chapter, state, out) {
  var goal = chapter.goal || {};
  if (state.done || !goal.room) return;
  if (goal.flag && !state.flags[goal.flag]) return;
  if (state.room !== goal.room) return;
  state.done = true;
  out.text = (out.text ? out.text + ' ' : '') + (goal.text || 'Глава пройдена.');
  out.events.push('chapter-done');
}

function findExit(chapter, state, dir) {
  var wanted = parse.canonicalDir(dir) || words.normalize(dir);
  var list = exitsOf(chapter, state.room);
  for (let exit of list) {
    if (exit.dir === dir || (parse.canonicalDir(exit.dir) || words.normalize(exit.dir)) === wanted) return exit;
  }
  if (wanted === 'назад' && state.prev) return { dir: 'назад', to: state.prev, back: true };
  return null;
}

function go(chapter, state, cmd, out) {
  if (!cmd.dir) {
    out.text = 'Куда идти? ' + exitsLine(chapter, state);
    return;
  }
  var exit = findExit(chapter, state, cmd.dir);
  if (!exit) {
    out.text = 'Туда не пройти. ' + exitsLine(chapter, state);
    return;
  }
  if (exit.lock && !state.unlocked[exit.lock]) {
    out.text = exit.locked || 'Заперто.';
    return;
  }
  if (exit.flag && !state.flags[exit.flag]) {
    out.text = exit.blocked || 'Пока туда не пройти.';
    return;
  }
  var target = chapter.rooms[exit.to];
  if (!target) {
    out.text = 'Туда не пройти.';
    return;
  }
  if (target.dark && !hasLight(chapter, state.inventory)) {
    out.text = 'Там кромешная тьма. Без света туда лучше не соваться.';
    return;
  }
  state.prev = state.room;
  state.room = exit.to;
  var first = !has(state.visited, exit.to);
  if (first) state.visited.push(exit.to);
  remember(state, { t: 'go', room: exit.to });
  out.text = describe(chapter, state, first);
  out.events.push('move');
}

function look(chapter, state, cmd, out) {
  if (cmd.object === 'door') {
    var locked = exitsOf(chapter, state.room).filter(function (exit) { return exit.lock && !state.unlocked[exit.lock]; });
    out.text = locked.length ? (locked[0].locked || 'Заперто.') : 'Ничего примечательного: путь свободен.';
    return;
  }
  if (cmd.object) {
    var visible = visibleItems(chapter, state).concat(state.inventory);
    if (!has(visible, cmd.object)) {
      out.text = 'Здесь такого нет.';
      return;
    }
    out.text = (item(chapter, cmd.object) || {}).text || 'Ничего особенного.';
    return;
  }
  if (cmd.topic) {
    // Something the chapter does not describe: the phone's model may answer in its own words.
    out.text = 'Ничего необычного.';
    out.events.push('free');
    return;
  }
  out.text = describe(chapter, state, true);
}

function take(chapter, state, cmd, out) {
  var ids = cmd.objects && cmd.objects.length ? cmd.objects : (cmd.object ? [cmd.object] : []);
  if (!ids.length || cmd.object === 'door') {
    var lying = visibleItems(chapter, state);
    out.text = lying.length ? 'Что взять? ' + itemsLine(chapter, state) : 'Здесь нечего взять.';
    return;
  }
  var taken = [];
  var notes = [];
  ids.forEach(function (id) {
    var found = item(chapter, id);
    if (has(state.inventory, id)) {
      notes.push('Это уже у вас.');
    } else if (!has(state.placed[state.room], id) || !found) {
      notes.push('Здесь такого нет.');
    } else if (!found.take) {
      notes.push(found.fixed || 'Это не унести.');
    } else {
      state.placed[state.room] = state.placed[state.room].filter(function (other) { return other !== id; });
      state.inventory.push(id);
      taken.push(id);
      remember(state, { t: 'take', item: id });
    }
  });
  var parts = [];
  if (taken.length) {
    parts.push('Вы взяли ' + words.joinAnd(taken.map(function (id) { return nameOf(chapter, id, 1); })) + '.');
    if (taken.length === 1 && item(chapter, taken[0]).text) parts.push(item(chapter, taken[0]).text);
    out.events.push('take');
  }
  notes.forEach(function (note) { if (parts.indexOf(note) < 0) parts.push(note); });
  out.text = parts.join(' ');
}

function drop(chapter, state, cmd, out) {
  var ids = cmd.objects && cmd.objects.length ? cmd.objects : (cmd.object ? [cmd.object] : []);
  var dropped = ids.filter(function (id) { return has(state.inventory, id); });
  if (!dropped.length) {
    out.text = ids.length ? 'Этого у вас нет.' : 'Что положить? ' + inventoryText(chapter, state);
    return;
  }
  dropped.forEach(function (id) {
    state.inventory = state.inventory.filter(function (other) { return other !== id; });
    state.placed[state.room] = (state.placed[state.room] || []).concat([id]);
    remember(state, { t: 'drop', item: id });
  });
  out.text = 'Вы положили ' + words.joinAnd(dropped.map(function (id) { return nameOf(chapter, id, 1); })) + '.';
  out.events.push('drop');
}

function unlock(chapter, state, cmd, out) {
  var locked = exitsOf(chapter, state.room).filter(function (exit) { return exit.lock && !state.unlocked[exit.lock]; });
  if (!locked.length) return false;
  var key = cmd.with || (cmd.object && cmd.object !== 'door' ? cmd.object : null);
  var exit = null;
  if (key) {
    exit = locked.filter(function (candidate) { return candidate.lock === key; })[0] || null;
    if (!exit) {
      if (!has(state.inventory, key)) {
        out.text = 'У вас этого нет.';
        return true;
      }
      out.text = 'Не подходит. ' + (locked[0].locked || 'Заперто.');
      return true;
    }
  } else {
    exit = locked.filter(function (candidate) { return has(state.inventory, candidate.lock); })[0] || null;
    if (!exit) {
      out.text = locked[0].locked || 'Заперто, и открыть нечем.';
      return true;
    }
  }
  if (!has(state.inventory, exit.lock)) {
    out.text = 'У вас этого нет.';
    return true;
  }
  state.unlocked[exit.lock] = true;
  remember(state, { t: 'unlock', dir: exit.dir });
  out.text = (exit.opened || 'Замок поддаётся.') + ' Путь ' + dirPhrase(exit.dir) + ' свободен.';
  out.events.push('unlock');
  return true;
}

function solve(chapter, state, puzzle, out) {
  var missing = (puzzle.need || []).filter(function (id) {
    return !has(state.inventory, id) && !has(state.placed[state.room], id);
  });
  if (missing.length) {
    out.text = 'Чего-то не хватает. Голыми руками тут не справиться.';
    return;
  }
  state.solved[puzzle.id] = true;
  if (puzzle.sets) state.flags[puzzle.sets] = true;
  if (puzzle.consumes) {
    state.inventory = state.inventory.filter(function (id) { return !has(puzzle.need, id); });
  }
  if (puzzle.gives && !has(state.inventory, puzzle.gives)) state.inventory.push(puzzle.gives);
  remember(state, { t: 'solve', puzzle: puzzle.id });
  out.text = puzzle.done || 'Получилось.';
  out.events.push('solve');
}

function use(chapter, state, cmd, out) {
  var here = (chapter.puzzles || []).filter(function (puzzle) { return puzzle.room === state.room && !state.solved[puzzle.id]; });
  var puzzle = null;
  if (cmd.puzzle) puzzle = here.filter(function (candidate) { return candidate.id === cmd.puzzle; })[0] || null;
  if (!puzzle) {
    var named = [cmd.object, cmd.with].filter(function (id) { return id && id !== 'door'; });
    puzzle = here.filter(function (candidate) {
      return named.some(function (id) { return has(candidate.need, id); });
    })[0] || null;
  }
  if (!puzzle && cmd.verb === 'use' && here.length === 1 && !cmd.object) puzzle = here[0];
  if (puzzle) {
    solve(chapter, state, puzzle, out);
    return;
  }
  if (cmd.object === 'door' || cmd.verb === 'open' || (cmd.object && (item(chapter, cmd.object) || {}).take)) {
    if (unlock(chapter, state, cmd, out)) return;
  }
  if (cmd.verb === 'open') {
    out.text = 'Здесь нечего открывать.';
    return;
  }
  out.text = 'Ничего не происходит.';
}

/** The next hint for the puzzle at hand (each puzzle has three, from vague to plain). */
function hint(chapter, state) {
  var open = (chapter.puzzles || []).filter(function (puzzle) { return !state.solved[puzzle.id]; });
  var seen = open.filter(function (puzzle) { return has(state.visited, puzzle.room); });
  var puzzle = seen[0] || open[0];
  if (!puzzle) {
    var goal = chapter.goal || {};
    var room = goal.room && chapter.rooms[goal.room];
    return {
      text: room ? 'Все загадки решены. Осталось добраться сюда: ' + room.name + '.' : 'Здесь больше нечего искать.',
      state: state
    };
  }
  var next = clone(state);
  var used = next.hintsUsed[puzzle.id] || 0;
  var hints = puzzle.hints || [];
  var text = hints[Math.min(used, hints.length - 1)] || 'Осмотритесь внимательнее.';
  next.hintsUsed[puzzle.id] = Math.min(used + 1, hints.length);
  next.hints = (next.hints || 0) + 1;
  return { text: text, state: next };
}

/**
 * One move of the owner: the parsed command against the chapter. Returns {text, state, events}.
 * The state given is not changed.
 */
function act(chapter, state, cmd) {
  var next = clone(state);
  var out = { text: '', events: [] };
  next.turn = (next.turn || 0) + 1;
  if (next.done) {
    out.text = 'Эта глава пройдена.';
    return { text: out.text, state: next, events: out.events };
  }
  switch (cmd && cmd.verb) {
    case 'go': go(chapter, next, cmd, out); break;
    case 'look': look(chapter, next, cmd, out); break;
    case 'take': take(chapter, next, cmd, out); break;
    case 'drop': drop(chapter, next, cmd, out); break;
    case 'open': use(chapter, next, cmd, out); break;
    case 'use': use(chapter, next, cmd, out); break;
    case 'close': out.text = 'Незачем, пусть остаётся как есть.'; break;
    case 'talk':
      out.text = 'Вам никто не отвечает.';
      out.events.push('free');
      break;
    default: out.text = 'Не понял.';
  }
  goalCheck(chapter, next, out);
  return { text: out.text, state: next, events: out.events };
}

/** «В прошлый раз…» — what the owner did last, for a return after a break. */
function recap(chapter, state) {
  var room = chapter.rooms[state.room];
  var parts = ['В прошлый раз мы остановились здесь: ' + room.name + '.'];
  var last = state.history[state.history.length - 1];
  if (last && last.t === 'take') parts.push('Последнее, что вы сделали, — взяли ' + nameOf(chapter, last.item, 1) + '.');
  if (last && last.t === 'solve') {
    var solved = (chapter.puzzles || []).filter(function (puzzle) { return puzzle.id === last.puzzle; })[0];
    if (solved && solved.done) parts.push('Последнее, что случилось: ' + words.clip(solved.done, 160));
  }
  if (last && last.t === 'unlock') parts.push('Вы только что открыли путь ' + dirPhrase(last.dir) + '.');
  if (state.inventory.length) parts.push(inventoryText(chapter, state));
  return parts.join(' ');
}

/** How far the owner is in the chapter: 0..1 by solved puzzles and visited rooms. */
function progress(chapter, state) {
  var rooms = Object.keys(chapter.rooms || {}).length || 1;
  var puzzles = (chapter.puzzles || []).length || 1;
  var solved = Object.keys(state.solved || {}).length;
  if (state.done) return 1;
  return Math.min(0.99, 0.5 * (state.visited.length / rooms) + 0.5 * (solved / puzzles));
}

exports.create = create;
exports.world = world;
exports.act = act;
exports.describe = describe;
exports.hint = hint;
exports.recap = recap;
exports.inventoryText = inventoryText;
exports.whereText = whereText;
exports.exitsLine = exitsLine;
exports.exitsOf = exitsOf;
exports.nameOf = nameOf;
exports.hasLight = hasLight;
exports.progress = progress;
exports.dirPhrase = dirPhrase;
