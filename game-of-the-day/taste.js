// The owner's taste from his ratings of the games of the day: for every tag (genre, controls,
// session, visual, difficulty, theme) the mean rating with decay (a rating weighs decay^days ago)
// and the count; which way today goes (explore / exploit); what not to repeat. Pure logic.
var days = require('./days.js');

var TAGS = ['genre', 'controls', 'session', 'visual', 'difficulty', 'theme'];
var GENRES = ['puzzle', 'physics', 'arcade', 'reaction', 'rhythm', 'strategy', 'idle', 'word', 'memory', 'logic',
  'builder', 'sort', 'runner', 'cards', 'drawing', 'tower', 'merge', 'stealth'];
var TITLES = {
  genre: 'жанр', controls: 'управление', session: 'длина', visual: 'вид', difficulty: 'сложность', theme: 'тема'
};
var REASONS = ['залип', 'красиво', 'понятно сразу', 'скучно', 'сложно', 'непонятно', 'тормозит', 'неудобное управление', 'неточность ритма', 'однообразно', 'неудобно одной рукой'];
var GENRE_SCORES = { like: 5, neutral: 3, dislike: 1 };
var GENRE_WORDS = { like: 'нравится', neutral: 'нейтрально', dislike: 'не нравится', unknown: 'не оценён' };

function norm(value) {
  return String(value === undefined || value === null ? '' : value).toLowerCase().replace(/\s+/g, ' ').trim();
}

function made(log) {
  return (log || []).filter(function (entry) { return entry && entry.made; });
}

function isRating(value) {
  return typeof value === 'number' && value >= 1 && value <= 5;
}

function rated(log) {
  return made(log).filter(function (entry) { return isRating(entry.rating); });
}

function newestFirst(a, b) {
  return a.date < b.date ? 1 : a.date > b.date ? -1 : 0;
}

/** {tag: {value: {score, n}}}: the mean rating of each tag value, each weighted decay^(days since). */
function compute(log, time, decay) {
  var sums = {};
  rated(log).forEach(function (entry) {
    var w = Math.pow(decay, Math.max(0, days.daysSince(entry.date, time)));
    TAGS.forEach(function (tag) {
      var value = norm(entry.tags && entry.tags[tag]);
      if (!value) return;
      // A poor game is not evidence against its genre. Old ratings remain game ratings only.
      var score = tag === 'genre' ? GENRE_SCORES[entry.genrePreference] : entry.rating;
      if (!isRating(score)) return;
      var byTag = sums[tag] || (sums[tag] = {});
      var c = byTag[value] || (byTag[value] = { w: 0, wr: 0, n: 0 });
      c.w += w;
      c.wr += w * score;
      c.n++;
    });
  });
  var out = {};
  Object.keys(sums).forEach(function (tag) {
    out[tag] = {};
    Object.keys(sums[tag]).forEach(function (value) {
      var c = sums[tag][value];
      out[tag][value] = { score: c.w > 0 ? Math.round(c.wr / c.w * 10) / 10 : 0, n: c.n };
    });
  });
  return out;
}

/** The table as rows [{tag, value, score, n}], best first. */
function rows(taste) {
  var out = [];
  Object.keys(taste || {}).forEach(function (tag) {
    Object.keys(taste[tag]).forEach(function (value) {
      out.push({ tag: tag, value: value, score: taste[tag][value].score, n: taste[tag][value].n });
    });
  });
  return out.sort(function (a, b) { return b.score - a.score || b.n - a.n || (a.tag + a.value < b.tag + b.value ? -1 : 1); });
}

function liked(taste, from) {
  return rows(taste).filter(function (row) { return row.score >= from; });
}

function disliked(taste, to) {
  return rows(taste).filter(function (row) { return row.score <= to; }).reverse();
}

/** «жанр puzzle 4,3 (7)». */
function rowText(row) {
  return (TITLES[row.tag] || row.tag) + ' ' + row.value + ' ' + String(row.score).replace('.', ',') + ' (' + row.n + ')';
}

/** Games made from `count` days before the day of time up to it, newest first. */
function recent(log, time, count) {
  return made(log).filter(function (entry) {
    var ago = days.daysSince(entry.date, time);
    return ago >= 0 && ago <= count;
  }).sort(newestFirst);
}

/** Genres not seen in the last `count` days. */
function freshGenres(log, time, count) {
  var seen = {};
  recent(log, time, count).forEach(function (entry) { seen[norm(entry.tags && entry.tags.genre)] = true; });
  return GENRES.filter(function (genre) { return !seen[genre]; });
}

/**
 * Today's way: {mode: 'free'} with no ratings yet; with the chance `explore` (or when nothing is
 * rated 4–5) {mode: 'explore', genre} — a genre not seen for `newDays` days; otherwise
 * {mode: 'exploit', base} — a variation on a game rated 4–5. Disliked genres go to `avoid`. The
 * day's seed makes the choice the same for the whole day.
 * options: {explore, decay, dislikedTo, newDays}.
 */
function direction(log, key, options) {
  var time = days.dayStart(key);
  if (time === null) time = Date.now();
  var r = days.rng(days.seedOf(key));
  var all = rated(log);
  if (!all.length) return { mode: 'free', avoid: [] };
  var taste = compute(log, time, options.decay);
  var bad = disliked(taste, options.dislikedTo).filter(function (row) { return row.tag === 'genre'; })
    .map(function (row) { return row.value; });
  var roll = r();
  var good = all.filter(function (entry) { return entry.rating >= 4 && bad.indexOf(norm(entry.tags && entry.tags.genre)) < 0; });
  if (roll < options.explore || !good.length) {
    var fresh = freshGenres(log, time, options.newDays);
    var pool = fresh.filter(function (genre) { return bad.indexOf(genre) < 0; });
    if (!pool.length) pool = fresh.length ? fresh : GENRES.slice();
    return { mode: 'explore', genre: pool[Math.floor(r() * pool.length) % pool.length], avoid: bad };
  }
  good.sort(function (a, b) { return b.rating - a.rating || newestFirst(a, b); });
  var top = good.slice(0, 5);
  var base = top[Math.floor(r() * top.length) % top.length];
  return {
    mode: 'exploit', avoid: bad,
    base: { date: base.date, title: base.title, pitch: base.pitch || '', tags: base.tags || {}, rating: base.rating }
  };
}

/** What the owner said, newest first: «„Отражатель“ (4): залип, сложно; голосом: «слишком быстро»». */
function notes(log, limit) {
  return rated(log).filter(function (entry) { return (entry.reasons && entry.reasons.length) || entry.voice || entry.comment || GENRE_SCORES[entry.genrePreference]; })
    .sort(newestFirst).slice(0, limit === undefined ? 10 : limit).map(function (entry) {
      var bits = [];
      if (entry.reasons && entry.reasons.length) bits.push(entry.reasons.join(', '));
      if (entry.voice) bits.push('голосом: «' + String(entry.voice).replace(/\s+/g, ' ').trim() + '»');
      if (entry.comment) bits.push('отзыв об игре: «' + String(entry.comment).replace(/\s+/g, ' ').trim() + '»');
      if (GENRE_SCORES[entry.genrePreference]) bits.push('жанр ' + norm(entry.tags && entry.tags.genre) + ': ' + GENRE_WORDS[entry.genrePreference]);
      return '«' + entry.title + '» (' + entry.rating + '): ' + bits.join('; ');
    });
}

/** How often each reason chip was given: [[reason, count]], most first. */
function reasonCounts(log) {
  var counts = {};
  rated(log).forEach(function (entry) {
    (entry.reasons || []).forEach(function (reason) { counts[reason] = (counts[reason] || 0) + 1; });
  });
  return Object.keys(counts).map(function (reason) { return [reason, counts[reason]]; })
    .sort(function (a, b) { return b[1] - a[1]; });
}

/** For the achievements: ratings given, games kept, games made. */
function counts(log) {
  return {
    ratings: rated(log).length,
    kept: made(log).filter(function (entry) { return entry.kept; }).length,
    made: made(log).length
  };
}

/** The 7 days up to the day of time: what was made, liked and not, the cost. */
function week(log, time) {
  var list = (log || []).filter(function (entry) {
    var ago = days.daysSince(entry.date, time);
    return ago >= 0 && ago < 7;
  }).sort(newestFirst);
  var scored = list.filter(function (entry) { return isRating(entry.rating); });
  var sum = 0;
  scored.forEach(function (entry) { sum += entry.rating; });
  var cost = 0;
  var minutes = 0;
  list.forEach(function (entry) {
    cost += Number(entry.costUsd) || 0;
    minutes += Number(entry.minutes) || 0;
  });
  return {
    days: list.length,
    made: list.filter(function (entry) { return entry.made; }).length,
    failed: list.filter(function (entry) { return !entry.made; }).length,
    rated: scored.length,
    average: scored.length ? Math.round(sum / scored.length * 10) / 10 : null,
    liked: scored.filter(function (entry) { return entry.rating >= 4; }).map(function (entry) { return entry.title; }),
    disliked: scored.filter(function (entry) { return entry.rating <= 2; }).map(function (entry) { return entry.title; }),
    cost: Math.round(cost * 100) / 100,
    minutes: minutes,
    entries: list
  };
}

/**
 * The weekly summary without a model: «На этой неделе понравились: …. Не зашли: …. Завтра попробую …».
 * week — week(); taste — compute(); next — direction() for tomorrow.
 */
function plainSummary(w, taste, next, options) {
  var good = liked(taste, options.likedFrom).slice(0, 3).map(rowText);
  var bad = disliked(taste, options.dislikedTo).slice(0, 3).map(rowText);
  var parts = [];
  parts.push('За неделю игр: ' + w.made + (w.failed ? ', не собралось: ' + w.failed : '') +
    (w.rated ? ', оценено ' + w.rated + ', в среднем ' + String(w.average).replace('.', ',') : ', оценок нет') + '.');
  if (w.liked.length) parts.push('Понравились: ' + w.liked.join(', ') + '.');
  if (w.disliked.length) parts.push('Не зашли: ' + w.disliked.join(', ') + '.');
  if (good.length) parts.push('Вкус: ' + good.join('; ') + '.');
  if (bad.length) parts.push('Не люблю: ' + bad.join('; ') + '.');
  if (next && next.mode === 'explore') parts.push('Дальше попробую новое: ' + next.genre + '.');
  else if (next && next.mode === 'exploit') parts.push('Дальше — вариация на «' + next.base.title + '».');
  return parts.join(' ');
}

/** The lines of taste without a model (5–8 when there is enough): «Любит: жанр puzzle 4,3 (7)». */
function plainLines(table, options) {
  var good = liked(table, options.likedFrom).slice(0, 5).map(function (row) { return 'Любит: ' + rowText(row); });
  var bad = disliked(table, options.dislikedTo).slice(0, 3).map(function (row) { return 'Не любит: ' + rowText(row); });
  var lines = good.concat(bad);
  return lines.length ? lines : ['Оценок пока мало — вкус ещё не ясен.'];
}

exports.TAGS = TAGS;
exports.plainLines = plainLines;
exports.GENRES = GENRES;
exports.TITLES = TITLES;
exports.REASONS = REASONS;
exports.GENRE_WORDS = GENRE_WORDS;
exports.compute = compute;
exports.rows = rows;
exports.liked = liked;
exports.disliked = disliked;
exports.rowText = rowText;
exports.recent = recent;
exports.freshGenres = freshGenres;
exports.direction = direction;
exports.notes = notes;
exports.reasonCounts = reasonCounts;
exports.counts = counts;
exports.week = week;
exports.rated = rated;
exports.plainSummary = plainSummary;
