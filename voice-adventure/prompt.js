// Prompts of the adventure, assembled from templates in prompts/*.md. Pure logic (engine and node).
var words = require('./story-engine/words.js');

/** The JSON object of a model's answer: fences and talk around it are dropped. Throws when there is none. */
function parseJson(text) {
  var cleaned = String(text || '').replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
  var start = cleaned.indexOf('{');
  var end = cleaned.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('в ответе нет JSON');
  return JSON.parse(cleaned.slice(start, end + 1));
}

/**
 * A free answer of the phone's model made fit for the ear: no markup, list signs, emoji or quotes
 * of the prompt, at most maxChars, cut at a sentence.
 */
function cleanFree(text, maxChars) {
  var out = String(text || '')
    .replace(/<\/?[a-z][^>]*>/gi, ' ')
    .replace(/[☀-➿]|[\uD83C-\uDBFF][\uDC00-\uDFFF]|️/g, '')
    .replace(/[*_#`>|~]+/g, ' ')
    .replace(/^\s*(?:[-•]|\d+[.)])\s+/gm, '')
    .replace(/^\s*(рассказчик|ответ)\s*:\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!out) return '';
  return words.clip(out, maxChars || 280);
}

/** Puts values into {{name}} places; unknown places stay empty. */
function fill(template, values) {
  return String(template).replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, function (all, name) {
    var value = values[name];
    if (value === undefined || value === null) return '';
    return typeof value === 'object' ? JSON.stringify(value) : String(value);
  });
}

/** The bible as lines for the prompt. */
function bibleText(bible) {
  if (!bible || !Object.keys(bible).length) return '(пока пусто: придумай мир сам)';
  var out = [];
  if (bible.world) out.push('Мир: ' + bible.world);
  if (bible.tone) out.push('Тон: ' + bible.tone);
  if (bible.heroes && bible.heroes.length) out.push('Герои: ' + bible.heroes.join('; '));
  if (bible.places && bible.places.length) out.push('Места: ' + bible.places.join('; '));
  if (bible.threads && bible.threads.length) out.push('Открытые нити: ' + bible.threads.join('; '));
  return out.join('\n');
}

/** The last `count` recaps as lines «Глава 2: …». */
function recapsText(summaries, count) {
  var list = (summaries || []).slice(-count);
  if (!list.length) return '(это первая глава)';
  return list.map(function (entry) { return 'Глава ' + entry.chapter + ': ' + entry.summary; }).join('\n');
}

/**
 * The listener's own life as material, from «Жизнь-RPG»: life = { level, places: [names] }.
 * '' when there is nothing (no RPG, the setting is off) — the template line stays empty then.
 */
function lifeText(life) {
  if (!life) return '';
  var out = [];
  if (life.level > 1) out.push('Уровень героя слушателя в его «Жизни-RPG»: ' + life.level + '. Можно намекнуть на опыт героя, но правила главы те же.');
  var places = (life.places || []).filter(Boolean);
  if (places.length) out.push('Места, которые слушатель открыл в жизни (их игровые имена): ' + places.join('; ') + '. Можешь превратить одно-два в места этого мира — без реальных адресов.');
  return out.length ? 'Материал из жизни слушателя (по желанию):\n' + out.join('\n') : '';
}

/** The prompt of a chapter; values: plotTitle, genre, bible, summaries, number, life + settings. */
function chapterPrompt(template, input, settings) {
  return fill(template, {
    plotTitle: input.plotTitle || 'новый сюжет',
    genre: input.genre || 'своё',
    bible: bibleText(input.bible),
    recaps: recapsText(input.summaries, settings.recapChapters || 3),
    life: lifeText(input.life),
    number: input.number,
    roomsMin: settings['rooms.min'], roomsMax: settings['rooms.max'],
    itemsMin: settings['items.min'], itemsMax: settings['items.max'],
    puzzlesMin: settings['puzzles.min'], puzzlesMax: settings['puzzles.max'],
    maxTextChars: settings.maxTextChars
  });
}

/** The request to fix a chapter after the engine's check. */
function fixPrompt(errors) {
  return 'Глава не прошла проверку движка. Исправь ошибки и пришли весь JSON заново, в том же виде:\n- ' +
    errors.slice(0, 30).join('\n- ');
}

/** A short prompt for the model on the phone: what the owner's phrase means in the game. */
function understandPrompt(text, world, verbs) {
  var items = (world.items || []).map(function (item) { return item.id + ' (' + (item.forms || [])[0] + ')'; }).join(', ') || 'нет';
  var exits = (world.exits || []).map(function (exit) { return exit.dir; }).join(', ') || 'нет';
  var puzzles = (world.puzzles || []).map(function (puzzle) { return puzzle.id + ' (' + puzzle.verb + ')'; }).join(', ') || 'нет';
  return 'Фраза игрока в текстовой игре: «' + text + '».\n' +
    'Действия: ' + verbs.join(', ') + '.\nПредметы: ' + items + '.\nВыходы: ' + exits + '.\nЗагадки: ' + puzzles + '.\n' +
    'Ответь только JSON: {"verb": действие или null, "object": id предмета или null, "with": id предмета или null, ' +
    '"dir": выход или null, "puzzle": id загадки или null}. Если фраза не про игру — {"verb": null}.';
}

/** A short prompt for a free answer about something the chapter does not describe. */
function freePrompt(text, roomText, itemNames) {
  return 'Ты рассказчик голосового квеста. Сцена: ' + roomText + '\nВещи рядом: ' + (itemNames.join(', ') || 'нет') + '.\n' +
    'Игрок говорит: «' + text + '».\nОтветь одной-двумя короткими фразами, для слуха, без списков. Ничего не добавляй к миру: ' +
    'никаких новых предметов, выходов и подсказок к загадкам. Если ответить нечего — скажи, что ничего необычного нет.';
}

/** The verdict of the phone's model brought to a command, or null when it does not fit the world. */
function fromModel(answer, world, verbs) {
  if (!answer || !answer.verb || verbs.indexOf(answer.verb) < 0) return null;
  var ids = (world.items || []).map(function (item) { return item.id; });
  var dirs = (world.exits || []).map(function (exit) { return exit.dir; });
  var puzzles = (world.puzzles || []).map(function (puzzle) { return puzzle.id; });
  var cmd = { verb: answer.verb, object: null, with: null, dir: null, objects: [] };
  if (answer.object === 'door' || ids.indexOf(answer.object) >= 0) cmd.object = answer.object;
  if (ids.indexOf(answer.with) >= 0) cmd.with = answer.with;
  if (dirs.indexOf(answer.dir) >= 0) cmd.dir = answer.dir;
  if (puzzles.indexOf(answer.puzzle) >= 0) cmd.puzzle = answer.puzzle;
  if (cmd.object) cmd.objects = [cmd.object];
  if (cmd.verb === 'go' && !cmd.dir) return null;
  return cmd;
}

exports.parseJson = parseJson;
exports.cleanFree = cleanFree;
exports.fill = fill;
exports.bibleText = bibleText;
exports.recapsText = recapsText;
exports.lifeText = lifeText;
exports.chapterPrompt = chapterPrompt;
exports.fixPrompt = fixPrompt;
exports.understandPrompt = understandPrompt;
exports.freePrompt = freePrompt;
exports.fromModel = fromModel;
