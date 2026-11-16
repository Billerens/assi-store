// Texts of «Игра дня»: the agent's task, its answer, the steering words, the weekly summary, the
// notifications. Pure logic (engine and node); the templates are prompts/*.md, read by main.js.
var taste = require('./taste.js');

var ORDINALS = ['первая', 'вторая', 'третья', 'четвёртая', 'пятая', 'шестая', 'седьмая'];

/** {{name}} → values[name]. */
function fill(template, values) {
  return String(template).replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, function (all, name) {
    var value = values[name];
    if (value === undefined || value === null) return '';
    return typeof value === 'object' ? JSON.stringify(value) : String(value);
  });
}

/** The JSON object of an answer: in a ```json block or the last {...} that parses. Throws when there is none. */
function parseJson(text) {
  var s = String(text || '');
  var fence = /```(?:json)?\s*([\s\S]*?)```/gi;
  var m;
  var blocks = [];
  while ((m = fence.exec(s)) !== null) blocks.push(m[1]);
  for (var b = blocks.length - 1; b >= 0; b--) {
    try {
      var inBlock = JSON.parse(blocks[b].trim());
      if (inBlock && typeof inBlock === 'object') return inBlock;
    } catch (ignored) { /* the next candidate */ }
  }
  var end = s.lastIndexOf('}');
  var tries = 0;
  while (end >= 0 && tries < 40) {
    var start = s.lastIndexOf('{', end);
    while (start >= 0 && tries < 400) {
      tries++;
      try {
        var value = JSON.parse(s.slice(start, end + 1));
        if (value && typeof value === 'object') return value;
      } catch (ignored2) { /* a wider start */ }
      start = s.lastIndexOf('{', start - 1);
    }
    end = s.lastIndexOf('}', end - 1);
  }
  throw new Error('в ответе нет JSON');
}

function clean(value, max) {
  return String(value === undefined || value === null ? '' : value).replace(/\s+/g, ' ').trim().slice(0, max || 200);
}

function tagValue(value) {
  return clean(value, 40).toLowerCase();
}

/**
 * The agent's answer: {ok: true, title, pitch, tags: {genre, controls, session, visual, difficulty, theme}};
 * {ok: false, said: true, error} when the agent itself says it failed; {ok: false, error} when there is no answer.
 */
function parseResult(text) {
  var answer;
  try {
    answer = parseJson(text);
  } catch (error) {
    return { ok: false, error: 'агент не дал ответа JSON' };
  }
  if (answer.error) return { ok: false, said: true, error: clean(answer.error, 300) };
  var title = clean(answer.title, 60);
  if (!title) return { ok: false, error: 'в ответе агента нет названия' };
  var inner = answer.tags && typeof answer.tags === 'object' ? answer.tags : {};
  var tags = {};
  taste.TAGS.forEach(function (tag) {
    var value = answer[tag] !== undefined ? answer[tag] : inner[tag];
    if (value !== undefined && value !== null && String(value).trim()) tags[tag] = tagValue(value);
  });
  return { ok: true, title: title, pitch: clean(answer.pitch, 200), tags: tags };
}

/** «2 минуты» from «2m», «30 секунд» from «30s». */
function sessionWords(session) {
  var m = /^(\d+)\s*(s|m|с|м|min|sec)?/i.exec(String(session || '').trim());
  if (!m) return '';
  var n = Number(m[1]);
  var seconds = /^(s|с|sec)$/i.test(m[2] || '');
  var forms = seconds ? ['секунда', 'секунды', 'секунд'] : ['минута', 'минуты', 'минут'];
  var mod10 = n % 10;
  var mod100 = n % 100;
  var form = mod10 === 1 && mod100 !== 11 ? forms[0] : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? forms[1] : forms[2];
  return n + ' ' + form;
}

/** «любит: жанр puzzle 4,3 (7); … Не любит: …» or that there are no ratings yet. */
function tasteText(table, options) {
  var good = taste.liked(table, options.likedFrom).slice(0, 8).map(taste.rowText);
  var bad = taste.disliked(table, options.dislikedTo).slice(0, 6).map(taste.rowText);
  if (!good.length && !bad.length) return 'оценок пока мало — делай на свой вкус, коротко и понятно с первого касания.';
  var out = [];
  if (good.length) out.push('любит ' + good.join('; ') + '.');
  if (bad.length) out.push('Не любит ' + bad.join('; ') + '.');
  return out.join(' ');
}

/** «отражатель лучей (puzzle, drag), сортировка шаров (sort, tap)» — the games of the last days. */
function recentText(list) {
  if (!list || !list.length) return 'ничего (это первые игры)';
  return list.map(function (entry) {
    var tags = entry.tags || {};
    var bits = [tags.genre, tags.controls].filter(Boolean).join(', ');
    return '«' + entry.title + '»' + (entry.pitch ? ' — ' + entry.pitch : '') + (bits ? ' (' + bits + ')' : '');
  }).join('; ');
}

/** The line «Сегодня: …» from taste.direction(). */
function modeText(way, newDays) {
  var out = '';
  if (!way || way.mode === 'free') out = 'свободный выбор: оценок ещё нет, сделай то, что сам считаешь удачным для двух минут в дороге.';
  else if (way.mode === 'explore') out = 'исследование (новое направление: жанр «' + way.genre + '», которого не было за ' + newDays + ' дней).';
  else {
    var base = way.base;
    out = 'вариация на «' + base.title + '»' + (base.pitch ? ' (' + base.pitch + ')' : '') + ', оценка ' + base.rating +
      ': возьми то, что в ней понравилось, но механика должна быть новой.';
  }
  if (way && way.mode !== 'explore' && way.avoid && way.avoid.length) out += ' Не делай жанры: ' + way.avoid.join(', ') + ' — их оценки низкие.';
  return out;
}

/**
 * The task for the agent. input: {date, key (the game: «2026-11-14-2» is the second of that day; the
 * date when left out), slot, guide: true when modules/games/AGENT.md is there, minutes,
 * table: taste.compute(), summary: [lines of the weekly taste], notes: [..], recent: [entries],
 * noRepeatDays, newDays, way: taste.direction(), occasion, hook, likedFrom, dislikedTo, preview}.
 */
function taskPrompt(template, input) {
  var how = input.guide ? 'по modules/games/AGENT.md' :
    'на движке Игротеки (modules/games/AGENT.md пока нет: скопируй modules/games/engine/template/ в папку игры и следуй комментариям в нём и в modules/games/engine/checks-kit.js)';
  var text = fill(template, {
    date: input.date,
    key: input.key || input.date,
    which: input.slot > 0 ? ' (это ' + ORDINALS[Math.min(input.slot, ORDINALS.length - 1)] + ' игра за день: механика не та, что у прежней)' : '',
    how: how,
    folder: 'modules/games/daily/' + (input.key || input.date) + '/',
    minutes: input.minutes,
    taste: tasteText(input.table, input),
    summary: input.summary && input.summary.length ? 'Сводка вкуса за прошлые недели: ' + input.summary.join(' ') : '',
    notes: input.notes && input.notes.length ? input.notes.join('; ') : 'пока нет',
    noRepeatDays: input.noRepeatDays,
    recent: recentText(input.recent),
    mode: modeText(input.way, input.newDays),
    occasion: input.occasion ? 'Сегодня повод: ' + input.occasion + ' — пусть игра будет на эту тему.' : '',
    hook: input.hook,
    preview: input.preview || 'modules/games/engine/preview.html',
    genres: taste.GENRES.slice(0, 8).join(' | ') + ' | …'
  });
  return text.replace(/\n{2,}/g, '\n').trim();
}

/** What the module says into the agent's thread when time or money runs out. */
function steerText(kind, graceMinutes) {
  var why = kind === 'cost' ? 'Расход на эту игру дошёл до предела.' : 'Срок работы вышел.';
  return why + ' Больше ничего не добавляй: доведи до рабочего состояния то, что есть, прогони проверки и за ' +
    graceMinutes + ' мин дай ответ JSON (или {"error": "…"}, если игра не работает).';
}

/** The weekly summary task: input {week: taste.week(), table, notes, reasons, previous: [lines], tomorrow: direction()}. */
function tastePrompt(template, input) {
  var w = input.week;
  return fill(template, {
    week: 'игр ' + w.made + ', не собралось ' + w.failed + ', оценено ' + w.rated + (w.average !== null ? ', в среднем ' + w.average : '') +
      (w.liked.length ? '; понравились: ' + w.liked.join(', ') : '') + (w.disliked.length ? '; не зашли: ' + w.disliked.join(', ') : ''),
    table: taste.rows(input.table).slice(0, 24).map(taste.rowText).join('; ') || 'пусто',
    notes: input.notes && input.notes.length ? input.notes.join('; ') : 'нет',
    reasons: (input.reasons || []).map(function (pair) { return pair[0] + ' ×' + pair[1]; }).join(', ') || 'нет',
    previous: input.previous && input.previous.length ? input.previous.join(' ') : 'нет',
    tomorrow: modeText(input.tomorrow, input.newDays || 30)
  }).trim();
}

/** {owner, taste: [5–8 lines]} from the model; throws when it does not fit. */
function parseTaste(text) {
  var value = parseJson(text);
  var lines = (Array.isArray(value.taste) ? value.taste : []).map(function (line) { return clean(line, 200); }).filter(Boolean).slice(0, 8);
  if (!lines.length) throw new Error('в сводке нет строк вкуса');
  return { owner: clean(value.owner, 400) || lines.slice(0, 2).join(' '), taste: lines };
}

/** «Игра дня: «Отражатель» — ловите лучи зеркалом, 2 минуты». */
function readyText(entry) {
  var words = sessionWords(entry.tags && entry.tags.session);
  return 'Игра дня: «' + entry.title + '»' + (entry.pitch ? ' — ' + entry.pitch.replace(/[.\s]+$/, '') : '') + (words ? ', ' + words : '');
}

/**
 * «Сегодня игра не собралась: …. Завтра попробую снова»; with when («сегодня в 19:00», from the
 * schedule) — «…. Следующая — сегодня в 19:00»; when === '' (the schedule is off) — no tail.
 */
function failText(reason, when) {
  var head = 'Сегодня игра не собралась: ' + clean(reason, 200).replace(/[.\s]+$/, '');
  if (when === undefined || when === null) return head + '. Завтра попробую снова';
  return when ? head + '. Следующая — ' + when : head;
}

/** What the agent offers in the chat when a kept game took root. */
function promoteText(title) {
  return '«' + title + '» прижился. Добавить престиж и связки с поездкой?';
}

exports.fill = fill;
exports.parseJson = parseJson;
exports.parseResult = parseResult;
exports.sessionWords = sessionWords;
exports.tasteText = tasteText;
exports.recentText = recentText;
exports.modeText = modeText;
exports.taskPrompt = taskPrompt;
exports.steerText = steerText;
exports.tastePrompt = tastePrompt;
exports.parseTaste = parseTaste;
exports.readyText = readyText;
exports.failText = failText;
exports.promoteText = promoteText;
