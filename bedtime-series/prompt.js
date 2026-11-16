// Prompts of the night series and what is done with the answers. Pure logic (engine and node).

/** Puts values into {{name}} places; unknown places stay empty. */
function fill(template, values) {
  return String(template).replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, function (all, name) {
    var value = values[name];
    if (value === undefined || value === null) return '';
    return typeof value === 'object' ? JSON.stringify(value) : String(value);
  });
}

/** The JSON object of a model's answer: fences and talk around it are dropped. Throws when there is none. */
function parseJson(text) {
  var cleaned = String(text || '').replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
  var start = cleaned.indexOf('{');
  var end = cleaned.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('в ответе нет JSON');
  return JSON.parse(cleaned.slice(start, end + 1));
}

function listLine(title, list) {
  return list && list.length ? title + ': ' + list.join('; ') : '';
}

/** The season's bible as lines for the prompt. */
function bibleText(bible) {
  bible = bible || {};
  var out = [];
  if (bible.world) out.push('Мир: ' + bible.world);
  out.push(listLine('Герои', bible.characters));
  out.push(listLine('Открытые нити', bible.threads));
  out.push(listLine('Мотивы', bible.motifs));
  var people = Object.keys(bible.realPeople || {}).map(function (name) { return name + ' — ' + bible.realPeople[name]; });
  out.push(listLine('Реальные люди в сюжете', people));
  out = out.filter(Boolean);
  return out.length ? out.join('\n') : '(сезон только начинается: придумай мир, героев и нити сам и запиши их в bibleUpdates)';
}

function recapsText(summaries, count) {
  var list = (summaries || []).slice(-count);
  if (!list.length) return '(это первая серия сезона)';
  return list.map(function (entry) { return 'Серия ' + entry.episode + ': ' + String(entry.summary || '').replace(/\s*\n\s*/g, ' '); }).join('\n');
}

function endingsText(summaries, count) {
  var list = (summaries || []).filter(function (entry) { return entry.ending; }).slice(-count);
  if (!list.length) return '(пока нет)';
  return list.map(function (entry) { return '- ' + entry.ending; }).join('\n');
}

/** What the listener chose last time (and where he fell asleep) — for the next episode. */
function choicesText(episode, state) {
  if (!episode || !state || !state.choices) return '';
  var picked = [];
  Object.keys(state.choices).forEach(function (fork) {
    var c = episode.choices && episode.choices[fork];
    var i = state.choices[fork];
    if (!c || !c.options || !c.options[i]) return;
    picked.push('«' + c.options[i].label + '»' + (state.defaults && state.defaults[fork] ? ' (выбрал рассказчик — слушатель промолчал)' : ''));
  });
  var out = picked.length ? 'В прошлой серии слушатель выбрал: ' + picked.join(', ') + '. Пусть эти выборы отзовутся в сюжете.' : '';
  if (state.asleepAt) out += (out ? ' ' : '') + 'Он уснул посреди прошлой серии — начни мягко, коротко напомни, где остановились.';
  return out;
}

/**
 * The prompt of an episode. input: {season: {title, genre, tone, length}, bible, summaries, details
 * (prompt lines), lastChoices, number, total}; limits: {sceneMin, sceneMax, branchMin, branchMax,
 * asleepMax, recapEpisodes}.
 */
function episodePrompt(template, input, limits) {
  var season = input.season || {};
  return fill(template, {
    seasonTitle: season.title || 'новый сезон',
    seasonNote: input.number === 1 ? 'Это первая серия: придумай название сезона, мир, героев и запиши их в bibleUpdates.' : '',
    genre: season.genre || 'на выбор автора',
    tone: season.tone || 'тёплый',
    length: season.length || 12,
    number: input.number,
    total: input.total,
    bible: bibleText(input.bible),
    recaps: recapsText(input.summaries, limits.recapEpisodes || 3),
    endings: endingsText(input.summaries, 3),
    lastChoices: input.lastChoices || '',
    details: input.details || '',
    occasion: input.occasion || '',
    sceneMin: limits.sceneMin, sceneMax: limits.sceneMax,
    branchMin: limits.branchMin, branchMax: limits.branchMax,
    asleepMax: limits.asleepMax
  }).replace(/\n{3,}/g, '\n\n');
}

function fixPrompt(errors) {
  return 'Серия не прошла проверку. Исправь и пришли весь JSON заново, в том же виде:\n- ' + errors.slice(0, 30).join('\n- ');
}

function unique(list) {
  return list.filter(function (item, i) { return item && list.indexOf(item) === i; });
}

/** The bible after the episode's updates: lists grow (without repeats), texts are replaced. */
function mergeBible(bible, updates) {
  var out = JSON.parse(JSON.stringify(bible || {}));
  if (!updates || typeof updates !== 'object') return out;
  ['title', 'world', 'tone'].forEach(function (key) {
    if (updates[key] && typeof updates[key] === 'string' && (key !== 'title' || !out.title)) out[key] = updates[key].trim();
  });
  ['characters', 'threads', 'motifs'].forEach(function (key) {
    if (Array.isArray(updates[key])) out[key] = unique((out[key] || []).concat(updates[key].map(String))).slice(-30);
  });
  if (updates.realPeople && typeof updates.realPeople === 'object') {
    out.realPeople = out.realPeople || {};
    Object.keys(updates.realPeople).forEach(function (name) {
      if (!out.realPeople[name]) out.realPeople[name] = String(updates.realPeople[name]);
    });
  }
  return out;
}

/**
 * What the storyteller agent gets for the live mode (written into its memory.md): the episode to
 * lead, scene by scene, with the forks.
 */
function liveBrief(season, bible, episode) {
  var out = [
    '# Серия на сегодня',
    '',
    'Сезон «' + (season.title || '') + '», серия ' + episode.number + ': «' + episode.title + '». Тон: ' + (season.tone || 'тёплый') + '.',
    '',
    bibleText(bible),
    '',
    'Сцены по порядку (читай их своими словами близко к тексту, по одной; после s1 и s3 задай вопрос развилки и жди ответа):'
  ];
  ['s1', 'A', 's2a', 's2b', 's3', 'B', 's4a', 's4b', 'final'].forEach(function (id) {
    if (episode.choices && episode.choices[id]) {
      var c = episode.choices[id];
      out.push('', 'Развилка ' + id + ': ' + c.question + ' Варианты: ' + c.options.map(function (o, i) {
        return '«' + o.label + '» → ' + (id === 'A' ? ['s2a', 's2b'][i] : ['s4a', 's4b'][i]);
      }).join(', ') + '. Если слушатель молчит — тише повтори вопрос, потом выбери «' + c.options[c.calm].label + '».');
    } else if (episode.scenes && episode.scenes[id]) {
      out.push('', id + ': ' + episode.scenes[id]);
    }
  });
  out.push('', 'Если слушатель уснул: ' + (episode.asleep || 'тихо попрощайся и замолчи.'));
  return out.join('\n');
}

/** «Серия 12 готова: „Ключ под мостом“». */
function readyLine(number, title) {
  return 'Серия ' + number + ' готова' + (title ? ': «' + title + '»' : '');
}

exports.fill = fill;
exports.parseJson = parseJson;
exports.bibleText = bibleText;
exports.recapsText = recapsText;
exports.endingsText = endingsText;
exports.choicesText = choicesText;
exports.episodePrompt = episodePrompt;
exports.fixPrompt = fixPrompt;
exports.mergeBible = mergeBible;
exports.liveBrief = liveBrief;
exports.readyLine = readyLine;
