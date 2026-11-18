// The model's work for «Словоплёт», on the engine side (Rhino): definitions for the album and the
// check of the words the owner asked about («Нет в словаре?»). The screen calls it while it is
// open and there is network:
//   axiko.call('modules/games/word-weaver/model.js', 'defs', ['кошка', …], {batch, maxLen})
//   axiko.call('modules/games/word-weaver/model.js', 'check', [{k, w}], {maxLen})
// Everything is written under data/games/word-weaver/: defs.json ({key: definition}, "" when the
// model did not know the word) and extra.txt (the personal dictionary, a word a line).
// Without network or a model the calls answer {error} and change nothing: the game works on.
var DIR = 'data/games/word-weaver';
var DEFS = DIR + '/defs.json';
var EXTRA = DIR + '/extra.txt';
var HERE = 'modules/games/word-weaver';

function files() { return require('lib/axiko').files; }

function key(word) {
  var k = String(word || '').toLowerCase().replace(/ё/g, 'е');
  return /^[а-я]+$/.test(k) ? k : null;
}

function online() {
  try {
    return require('modules/games/links/sensors.js').online();
  } catch (error) {
    return null;
  }
}

function promptText(name, vars) {
  var text = files().read(HERE + '/prompts/' + name + '.md');
  return text.replace(/\{(\w+)\}/g, function (all, k) { return vars[k] !== undefined ? String(vars[k]) : all; });
}

/** A definition as the album shows it: one line, no emoji, no quotes around it, at most maxLen. */
function clean(text, maxLen) {
  // Rhino has no /u: the pictographs by their surrogate pairs.
  var t = String(text || '').replace(/[\uD83C-\uD83E][\uDC00-\uDFFF]|[\u2600-\u27BF]|\uFE0F/g, '').replace(/\s+/g, ' ').trim();
  t = t.replace(/^[«"']+|[»"']+$/g, '').replace(/\.$/, '');
  if (/:\/\//.test(t)) return '';
  if (t.length > maxLen) t = t.slice(0, maxLen - 1).replace(/\s+\S*$/, '') + '…';
  return t;
}

function errorText(error) { return String(error && error.message ? error.message : error); }

/** All definitions written so far: {key: text}. */
exports.read = function () { return files().readJson(DEFS, {}); };

/** The personal dictionary as the file keeps it: [word]. */
exports.extra = function () {
  var f = files();
  if (!f.exists(EXTRA)) return [];
  return f.read(EXTRA).split('\n').map(function (line) { return line.split('\t')[0].trim(); }).filter(function (w) { return !!key(w); });
};

/**
 * Definitions for the words that have none yet (at most o.batch, one request). Returns {added,
 * asked, defs: {key: text}} or {error}.
 */
exports.defs = function (words, o) {
  o = o || {};
  var maxLen = Number(o.maxLen) || 120;
  var batch = Number(o.batch) || 30;
  var f = files();
  var all = f.readJson(DEFS, {});
  var want = [];
  var seen = {};
  (words || []).forEach(function (w) {
    var k = key(w);
    if (!k || seen[k] || all[k] !== undefined || want.length >= batch) return;
    seen[k] = true;
    want.push(String(w).toLowerCase());
  });
  if (!want.length) return { added: 0, asked: 0, defs: {} };
  if (online() === false) return { error: 'нет сети' };
  var answer;
  try {
    answer = require('lib/ai').ask({
      role: 'games.stock',
      system: 'Ты составляешь короткие толкования русских слов для словесной игры. Отвечай только JSON.',
      prompt: promptText('defs', { maxLen: maxLen, words: want.join('\n') }),
      json: true
    });
  } catch (error) {
    return { error: errorText(error) };
  }
  var got = (answer && answer.defs) || answer || {};
  var byKey = {};
  Object.keys(got).forEach(function (w) { if (key(w)) byKey[key(w)] = got[w]; });
  all = f.readJson(DEFS, {});
  var out = {};
  var added = 0;
  want.forEach(function (w) {
    var k = key(w);
    var t = clean(byKey[k], maxLen);
    all[k] = t;
    out[k] = t;
    if (t) added++;
  });
  f.writeJson(DEFS, all);
  return { added: added, asked: want.length, defs: out };
};

/**
 * The model's verdict on the asked words: [{k, w}] → {answers: [{k, ok, text}]} or {error}. A word
 * said yes goes to extra.txt and its definition to defs.json; the screen counts it (sim.approve).
 */
exports.check = function (items, o) {
  o = o || {};
  var maxLen = Number(o.maxLen) || 120;
  var list = (items || []).filter(function (x) { return x && key(x.k || x.w); }).slice(0, Number(o.batch) || 20);
  if (!list.length) return { answers: [] };
  if (online() === false) return { error: 'нет сети' };
  var answer;
  try {
    answer = require('lib/ai').ask({
      role: 'games.stock',
      system: 'Ты строгий редактор толкового словаря русского языка. Отвечай только JSON.',
      prompt: promptText('check', { maxLen: maxLen, words: list.map(function (x) { return x.w || x.k; }).join('\n') }),
      json: true
    });
  } catch (error) {
    return { error: errorText(error) };
  }
  var verdict = {};
  ((answer && answer.words) || []).forEach(function (v) {
    var k = key(v && v.word);
    if (k) verdict[k] = v;
  });
  var f = files();
  var all = f.readJson(DEFS, {});
  var extra = f.exists(EXTRA) ? f.read(EXTRA) : '';
  var answers = [];
  list.forEach(function (x) {
    var k = key(x.k || x.w);
    var v = verdict[k];
    if (!v) return; // not answered: stays in the queue
    var ok = v.ok === true;
    var text = clean(v.text, maxLen);
    answers.push({ k: k, ok: ok, text: text });
    if (ok) {
      if (text) all[k] = text;
      if (('\n' + extra).indexOf('\n' + k + '\t') < 0 && ('\n' + extra + '\n').indexOf('\n' + k + '\n') < 0) extra += k + (text ? '\t' + text : '') + '\n';
    }
  });
  f.writeJson(DEFS, all);
  if (extra) f.write(EXTRA, extra);
  return { answers: answers };
};
