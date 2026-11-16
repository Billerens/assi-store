// The text of a recording: time marks «12:30», the cheap cleanup by code (when no model cleans:
// phrases get a capital letter and a full stop, long pauses start paragraphs), paragraphs with
// their time, pieces for search and for the model, words for the full-text search. Pure.

/** «12:30», «1:02:30» for a time from the start of a recording. */
function clock(ms) {
  var s = Math.max(0, Math.floor(Number(ms || 0) / 1000));
  var h = Math.floor(s / 3600);
  var m = Math.floor((s % 3600) / 60);
  var sec = s % 60;
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  return h ? h + ':' + pad(m) + ':' + pad(sec) : m + ':' + pad(sec);
}

/** «12:30» or «1:02:30» → ms; null when it is not a time. */
function parseClock(text) {
  var m = /^\s*(?:(\d{1,2}):)?(\d{1,3}):([0-5]\d)\s*$/.exec(String(text || ''));
  if (!m) return null;
  return ((Number(m[1] || 0) * 60 + Number(m[2])) * 60 + Number(m[3])) * 1000;
}

/** «42 мин», «1 ч 05 мин», «35 с». */
function length(ms) {
  var s = Math.round(Number(ms || 0) / 1000);
  if (s < 60) return s + ' с';
  var m = Math.round(s / 60);
  if (m < 60) return m + ' мин';
  var h = Math.floor(m / 60);
  var rest = m % 60;
  return h + ' ч' + (rest ? ' ' + (rest < 10 ? '0' : '') + rest + ' мин' : '');
}

/** For comparing and searching: lower case, ё as е. */
function plain(text) {
  return String(text || '').toLowerCase().replace(/ё/g, 'е');
}

function words(text) {
  return plain(text).split(/[^a-zа-я0-9]+/).filter(function (w) { return w.length > 0; });
}

function wordCount(text) {
  var m = String(text || '').match(/[A-Za-zА-Яа-яЁё0-9]+/g);
  return m ? m.length : 0;
}

function capital(text) {
  return text.replace(/^(\s*)([a-zа-яё])/, function (all, space, ch) { return space + ch.toUpperCase(); });
}

/** A phrase as a sentence: a capital letter and a full stop when it has none. */
function sentence(text) {
  var t = String(text || '').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  t = capital(t);
  return /[.!?…]$/.test(t) ? t : t + '.';
}

/**
 * The cheap cleanup of one part without a model. phrases: [{startMs, endMs, text}] from the shell
 * (time from the start of the part) or null. → { text, paragraphs: [{ atMs, text }] } with time
 * from the start of the part; a pause of gapMs or longer starts a new paragraph.
 */
function codeClean(raw, phrases, gapMs) {
  gapMs = gapMs || 2000;
  var paragraphs = [];
  if (phrases && phrases.length) {
    var current = null;
    var lastEnd = null;
    phrases.forEach(function (p) {
      var s = sentence(p.text);
      if (!s) return;
      if (!current || (lastEnd !== null && p.startMs - lastEnd >= gapMs) || wordCount(current.text) > 120) {
        current = { atMs: p.startMs, text: s };
        paragraphs.push(current);
      } else {
        current.text += ' ' + s;
      }
      lastEnd = p.endMs;
    });
  } else if (String(raw || '').trim()) {
    paragraphs.push({ atMs: 0, text: sentence(raw) });
  }
  return { text: paragraphs.map(function (p) { return p.text; }).join('\n\n'), paragraphs: paragraphs };
}

/**
 * Paragraphs of a part with their time from the start of the recording. A part cleaned by the
 * model has lost the time of its phrases: a paragraph gets the time by its place in the words.
 * seg: { offsetMs, durationMs, text, cleanedBy ('model' | 'code'), raw, phrases }.
 */
function paragraphsOf(seg, gapMs) {
  var offset = Number(seg.offsetMs || 0);
  var phrases = seg.phrases && typeof seg.phrases === 'string' ? JSON.parse(seg.phrases) : seg.phrases;
  var cleaned = seg.cleanedBy === 'model' && seg.text && String(seg.text).trim();
  if (!cleaned) {
    return codeClean(seg.raw, phrases, gapMs).paragraphs.map(function (p) { return { atMs: offset + p.atMs, text: p.text, exact: Boolean(phrases && phrases.length) }; });
  }
  var parts = cleaned.split(/\n\s*\n|\n/).map(function (p) { return p.trim(); }).filter(Boolean);
  var total = parts.reduce(function (sum, p) { return sum + wordCount(p); }, 0) || 1;
  var duration = Number(seg.durationMs || 0);
  var before = 0;
  return parts.map(function (p) {
    var at = offset + Math.round(duration * before / total);
    before += wordCount(p);
    return { atMs: at, text: p, exact: false };
  });
}

/** Pieces of about `size` words with the time of their first paragraph: [{ offsetMs, text }]. */
function chunks(paragraphs, size) {
  size = size || 300;
  var out = [];
  var cur = null;
  paragraphs.forEach(function (p) {
    var ws = String(p.text).split(/\s+/).filter(Boolean);
    var i = 0;
    while (i < ws.length) {
      if (!cur) { cur = { offsetMs: p.atMs, words: [] }; out.push(cur); }
      var room = size - cur.words.length;
      cur.words = cur.words.concat(ws.slice(i, i + room));
      i += room;
      if (cur.words.length >= size) cur = null;
    }
  });
  return out.map(function (c) { return { offsetMs: c.offsetMs, text: c.words.join(' ') }; });
}

/** The transcript for a model: «[12:30] текст» by paragraphs. */
function forModel(paragraphs) {
  return paragraphs.map(function (p) { return '[' + clock(p.atMs) + '] ' + p.text; }).join('\n');
}

/** Paragraphs in groups of at most `size` words (a group has at least one paragraph). */
function groups(paragraphs, size) {
  var out = [];
  var cur = null;
  paragraphs.forEach(function (p) {
    var n = wordCount(p.text);
    if (!cur || (cur.words + n > size && cur.items.length)) { cur = { words: 0, items: [] }; out.push(cur); }
    cur.items.push(p);
    cur.words += n;
  });
  return out.map(function (g) { return g.items; });
}

/** The beginning of a word without its ending: «смета» → «смет», «ремонта» → «ремон». */
function stem(word) {
  if (word.length >= 7) return word.slice(0, word.length - 2);
  if (word.length >= 5) return word.slice(0, word.length - 1);
  return word;
}

/** A full-text query for fts4: each word by its beginning (Russian endings vary), any of them. */
function ftsQuery(query) {
  var list = words(query).filter(function (w) { return w.length > 1; }).map(function (w) { return stem(w) + '*'; });
  return list.join(' OR ');
}

/** How well a text matches the words of a query: the share of the words found (by beginning). */
function score(text, query) {
  var qs = words(query).filter(function (w) { return w.length > 1; });
  if (!qs.length) return 0;
  var ts = words(text);
  var found = qs.filter(function (q) {
    var st = stem(q);
    return ts.some(function (t) { return t.indexOf(st) === 0; });
  });
  return found.length / qs.length;
}

/** A piece of the text around the first word of the query: «… решили перенести сроки …». */
function snippet(text, query, radius) {
  radius = radius || 80;
  var t = String(text || '').replace(/\s+/g, ' ').trim();
  var p = plain(t);
  var at = -1;
  words(query).filter(function (w) { return w.length > 1; }).some(function (w) {
    var re = new RegExp('(^|[^a-zа-я0-9])' + stem(w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    var m = re.exec(p);
    if (m) { at = m.index + m[1].length; return true; }
    return false;
  });
  if (at < 0) return t.length > radius * 2 ? t.slice(0, radius * 2).replace(/\s+\S*$/, '') + ' …' : t;
  var from = Math.max(0, at - radius);
  var to = Math.min(t.length, at + radius);
  var out = t.slice(from, to);
  if (from > 0) out = '… ' + out.replace(/^\S*\s+/, '');
  if (to < t.length) out = out.replace(/\s+\S*$/, '') + ' …';
  return out;
}

exports.clock = clock;
exports.parseClock = parseClock;
exports.length = length;
exports.plain = plain;
exports.words = words;
exports.wordCount = wordCount;
exports.sentence = sentence;
exports.codeClean = codeClean;
exports.paragraphsOf = paragraphsOf;
exports.chunks = chunks;
exports.forModel = forModel;
exports.groups = groups;
exports.ftsQuery = ftsQuery;
exports.score = score;
exports.snippet = snippet;
