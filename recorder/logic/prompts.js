// What the models are asked (roles recorder.clean, recorder.note, recorder.summary) and how their
// answers are checked before they are taken: a cleaned text that lost or gained too much is
// dropped, a summary is brought to its shape (times «12:30» → ms in the recording, dates
// YYYY-MM-DD, at most so many lines and tasks). Pure.
var text = require('./text.js');
var extract = require('./extract.js');

function cleanSystem(words) {
  return 'Расставь знаки препинания и абзацы, исправь явные ошибки распознавания' +
    (words && words.length ? ', слова из словаря пиши так: ' + words.join(', ') : '') +
    '. Ничего не добавляй и не сокращай. Верни только текст.';
}

/** The cleaned text, or null when the model cut or added too much (then the code's cleanup stays). */
function acceptClean(raw, cleaned, minRatio, maxRatio) {
  if (typeof cleaned !== 'string') return null;
  var out = cleaned.replace(/^\s*```[a-z]*\s*/i, '').replace(/\s*```\s*$/, '').trim();
  var a = text.wordCount(raw);
  var b = text.wordCount(out);
  if (!b) return null;
  if (a && (b < a * (minRatio || 0.6) || b > a * (maxRatio || 1.5))) return null;
  return out;
}

function noteSystem(words) {
  return 'Это короткая голосовая заметка владельца. Дай ей заголовок до 6 слов и 1–5 тегов (строчными буквами). ' +
    'Если это поручение, верни его, иначе null.\n' +
    'Виды: message (написать кому-то: to, text), expense (трата: amount — число, what), reminder (when — дата и время ' +
    'словами или YYYY-MM-DDTHH:MM, text).\n' +
    (words && words.length ? 'Имена и термины пиши так: ' + words.join(', ') + '.\n' : '') +
    'Ответ — только JSON: {"title":"…","tags":["…"],"command":{"kind":"message","to":"Петя","text":"Опоздаю минут на десять"}|null}';
}

function str(v, max) {
  if (v === null || v === undefined) return null;
  var s = String(v).replace(/\s+/g, ' ').trim();
  if (!s || /^(null|none|нет|-)$/i.test(s)) return null;
  return max && s.length > max ? s.slice(0, max).replace(/\s+\S*$/, '') : s;
}

function list(v, max, each) {
  if (!Array.isArray(v)) return [];
  var out = [];
  v.forEach(function (item) {
    var x = each ? each(item) : str(item, 300);
    if (x && out.length < max) out.push(x);
  });
  return out;
}

/** A command from the model's answer in the module's shape, or null. now — when it was said. */
function checkCommand(c, now) {
  if (!c || typeof c !== 'object') return null;
  if (c.kind === 'message') {
    var to = str(c.to, 60);
    var body = str(c.text, 1000);
    if (!to || !body) return null;
    return { kind: 'message', to: to, names: extract.nameForms(to.split(' ')[0]).map(function (f) { return to.indexOf(' ') > 0 ? f + to.slice(to.indexOf(' ')) : f; }), text: body };
  }
  if (c.kind === 'expense') {
    var amount = typeof c.amount === 'number' ? c.amount : Number(String(c.amount || '').replace(/[^\d.,]/g, '').replace(',', '.'));
    if (!isFinite(amount) || amount <= 0) return null;
    return { kind: 'expense', amount: Math.round(amount * 100) / 100, what: str(c.what, 120) };
  }
  if (c.kind === 'reminder') {
    var what = str(c.text, 300);
    if (!what) return null;
    var w = null;
    var raw = str(c.when, 80);
    var m = raw && /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(raw);
    if (m) {
      var d = new Date(Number(m[1].slice(0, 4)), Number(m[1].slice(5, 7)) - 1, Number(m[1].slice(8, 10)), m[2] ? Number(m[2]) : 0, m[3] ? Number(m[3]) : 0);
      if (isFinite(d.getTime())) w = { date: m[1], time: m[2] ? m[2] + ':' + m[3] : null, at: m[2] ? d.getTime() : null };
    } else if (raw) {
      w = extract.when(raw, now);
    }
    return { kind: 'reminder', text: what, date: w ? w.date : null, time: w ? w.time : null, at: w ? w.at : null };
  }
  return null;
}

/** The model's answer about a thought → { title, tags, command } or null when it is not usable. */
function checkNote(answer, now) {
  if (!answer || typeof answer !== 'object') return null;
  var title = str(answer.title, 80);
  if (!title) return null;
  return {
    title: title.replace(/[.!]+$/, ''),
    tags: list(answer.tags, 6, function (t) { var s = str(t, 40); return s ? s.toLowerCase() : null; }),
    command: checkCommand(answer.command, now)
  };
}

function marksText(marks) {
  if (!marks || !marks.length) return 'нет';
  return marks.map(function (m) { return text.clock(m.atMs) + (m.label ? ' — ' + m.label : ''); }).join('; ');
}

var SHAPE = 'JSON: {"title":"…","summary":["3–6 строк"],"decisions":[{"text":"…","at":"12:30"}],\n' +
  '       "tasks":[{"text":"…","who":"Олег|владелец|null","due":"2026-11-20|null","at":"…"}],\n' +
  '       "questions":["…"],"people":["…"],"topics":["…"]}';

function summarySystem(opts) {
  opts = opts || {};
  var day = opts.date ? 'Запись сделана ' + opts.date + ' — сроки «до пятницы», «завтра» считай от этого дня. ' : '';
  return 'Перед тобой расшифровка ' + (opts.mode === 'lecture' ? 'лекции' : 'разговора') +
    ' (распознавание речи, возможны ошибки; кто говорит — не размечено).\n' +
    'Отметки владельца: ' + marksText(opts.marks) + '. Не выдумывай того, чего в тексте нет; имена — как в тексте.\n' +
    (opts.words && opts.words.length ? 'Имена и термины пишутся так: ' + opts.words.join(', ') + '.\n' : '') +
    (opts.mode === 'lecture' ? 'Это лекция: в «summary» — главные мысли, решения и задачи — только если они явно прозвучали.\n' : '') +
    day + '«at» — время абзаца из расшифровки, откуда это взято. Ответ — только\n' + SHAPE;
}

function stepSystem(words) {
  return 'Перед тобой кусок расшифровки разговора (распознавание речи, возможны ошибки). Сократи его до главного: о чём ' +
    'говорили, что решили, кто что сделает и к какому сроку, что осталось открытым. У каждого пункта оставь время ' +
    'абзаца в квадратных скобках, например [12:30]. Не выдумывай. Только пункты, без вступления' +
    (words && words.length ? '. Имена и термины пишутся так: ' + words.join(', ') : '') + '.';
}

function finalSystem(opts) {
  return summarySystem(opts).replace('Перед тобой расшифровка ', 'Перед тобой выжимки по частям расшифровки ');
}

function atOf(v, durationMs) {
  var ms = typeof v === 'number' ? v * 1000 : text.parseClock(String(v || '').replace(/^\[|\]$/g, ''));
  if (ms === null || !isFinite(ms) || ms < 0) return null;
  if (durationMs && ms > durationMs + 60000) return null;
  return ms;
}

function due(v) {
  var s = str(v, 20);
  if (!s) return null;
  var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return null;
  var d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (d.getMonth() !== Number(m[2]) - 1) return null;
  return m[1] + '-' + m[2] + '-' + m[3];
}

/**
 * The model's summary → { title, summary, decisions: [{ text, atMs }], tasks: [{ text, who, due, atMs }],
 * questions, people, topics }; throws when there is nothing usable in it.
 * opts: { durationMs, lines, maxTasks }.
 */
function checkSummary(answer, opts) {
  opts = opts || {};
  if (!answer || typeof answer !== 'object' || Array.isArray(answer)) throw new Error('Ответ модели не похож на конспект');
  var out = {
    title: str(answer.title, 100),
    summary: list(answer.summary, opts.lines || 6),
    decisions: list(answer.decisions, 30, function (d) {
      if (typeof d === 'string') return str(d, 400) ? { text: str(d, 400), atMs: null } : null;
      var t = d && str(d.text, 400);
      return t ? { text: t, atMs: atOf(d.at, opts.durationMs) } : null;
    }),
    tasks: list(answer.tasks, opts.maxTasks || 20, function (d) {
      if (typeof d === 'string') return str(d, 400) ? { text: str(d, 400), who: null, due: null, atMs: null } : null;
      var t = d && str(d.text, 400);
      return t ? { text: t, who: str(d.who, 60), due: due(d.due), atMs: atOf(d.at, opts.durationMs) } : null;
    }),
    questions: list(answer.questions, 15),
    people: list(answer.people, 20, function (p) { return str(p, 60); }),
    topics: list(answer.topics, 10, function (p) { return str(p, 60); })
  };
  if (typeof answer.summary === 'string' && !out.summary.length) {
    out.summary = answer.summary.split(/\n+/).map(function (s) { return str(s.replace(/^[-•*]\s*/, ''), 300); }).filter(Boolean).slice(0, opts.lines || 6);
  }
  if (!out.title && !out.summary.length && !out.decisions.length && !out.tasks.length) throw new Error('В ответе модели пустой конспект');
  return out;
}

exports.cleanSystem = cleanSystem;
exports.acceptClean = acceptClean;
exports.noteSystem = noteSystem;
exports.checkNote = checkNote;
exports.checkCommand = checkCommand;
exports.summarySystem = summarySystem;
exports.stepSystem = stepSystem;
exports.finalSystem = finalSystem;
exports.checkSummary = checkSummary;
exports.marksText = marksText;
