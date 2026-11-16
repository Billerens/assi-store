// The pet's phrases: templates by state, a stable pick, the word filter. Pure.
// Every phrase — a template or one from the model — passes clean() before it is shown.

/** True when the text has none of the banned words and turns of phrase. */
exports.clean = function (text, banned) {
  var low = ' ' + String(text || '').toLowerCase().replace(/ё/g, 'е') + ' ';
  if (!String(text || '').trim()) return false;
  return !(banned || []).some(function (word) {
    var w = String(word || '').toLowerCase().replace(/ё/g, 'е');
    return w && low.indexOf(w) >= 0;
  });
};

/** A number from a string, the same every time. */
exports.hash = function (text) {
  var h = 2166136261;
  var s = String(text);
  for (var i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return h;
};

/** {name} and {title} into the text. */
exports.fill = function (text, vars) {
  return String(text).replace(/\{(\w+)\}/g, function (all, key) {
    return vars && vars[key] !== undefined && vars[key] !== null ? String(vars[key]) : '';
  });
};

/**
 * A phrase of a kind (a state, 'welcome', 'water', …): the same one for the same seed, only
 * clean ones, null when none is left.
 */
exports.pick = function (book, kind, seed, banned, vars) {
  var list = ((book && book[kind]) || []).map(function (t) { return exports.fill(t, vars); })
    .filter(function (t) { return exports.clean(t, banned); });
  if (!list.length) return null;
  return list[exports.hash(kind + '|' + seed) % list.length];
};

/** Lines a model wrote: trimmed, numbering and quotes taken off, only clean ones, at most `max`. */
exports.fromModel = function (text, banned, max) {
  return String(text || '').split(/\n+/).map(function (line) {
    return line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').replace(/^["«»“”]+|["«»“”]+$/g, '').trim();
  }).filter(function (line) {
    return line.length >= 3 && line.length <= 120 && exports.clean(line, banned);
  }).slice(0, max || 3);
};

exports.SYSTEM = 'Ты — маленькое нарисованное существо со стебельком на макушке, питомец владельца телефона. ' +
  'Напиши ровно три короткие фразы на весь сегодняшний день, каждую с новой строки, без нумерации и кавычек, по-русски, до 80 знаков. ' +
  'Настроение фраз бери из фактов сводки дня, но сами факты не пересказывай. ' +
  'Говори от первого лица о себе — как ты себя чувствуешь, что видишь, — а не о владельце. Тепло и чуть смешно. ' +
  'Никаких упрёков, советов о здоровье, сне, шагах или телефоне, никаких «надо», «должен», «опять», «снова не». ' +
  'Не упоминай цифры. Если владелец на паузе (болеет или отдыхает) — фразы уютные.';

/**
 * What the model gets: the state, the growth and the facts of the day's summary (info.facts — the
 * lines of «Почему так»: sleep, the night screen, steps, marks, new places) to take the mood from.
 */
exports.prompt = function (info) {
  var lines = ['Имя: ' + info.name + '.', 'Состояние сейчас: ' + info.title + '.'];
  if (info.paused) lines.push('Пауза: ' + info.paused + '.');
  if (info.stage) lines.push('Стадия роста: ' + info.stage + '.');
  if (info.items && info.items.length) lines.push('На мне: ' + info.items.join(', ') + '.');
  if (info.season) lines.push('Сегодня: ' + info.season + '.');
  if (info.weekday) lines.push('День недели: ' + info.weekday + '.');
  if (info.facts && info.facts.length) {
    lines.push('Факты сводки дня (для настроения, не пересказывать):');
    info.facts.forEach(function (fact) { lines.push('- ' + fact); });
  }
  return lines.join('\n');
};
