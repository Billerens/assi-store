// node tests/logic.test.js — the pure logic: time marks, the cleanup by code, paragraphs and pieces
// for search, numbers and dates said in words, commands of a short thought, a summary by rules,
// the checks of the models' answers, the bookkeeping of parts and the settings.
var assert = require('assert');
var text = require('../logic/text.js');
var extract = require('../logic/extract.js');
var prompts = require('../logic/prompts.js');
var parts = require('../logic/parts.js');
var settings = require('../logic/settings.js');
var awards = require('../logic/awards.js');

var failed = 0;
var passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
  } catch (error) {
    failed++;
    console.log('FAIL ' + name + ': ' + (error && error.stack || error));
  }
}

var NOW = new Date(2026, 10, 14, 15, 0).getTime();   // Saturday, 14 November 2026

test('time marks there and back', function () {
  assert.strictEqual(text.clock(0), '0:00');
  assert.strictEqual(text.clock(750000), '12:30');
  assert.strictEqual(text.clock(3750000), '1:02:30');
  assert.strictEqual(text.parseClock('12:30'), 750000);
  assert.strictEqual(text.parseClock('1:02:30'), 3750000);
  assert.strictEqual(text.parseClock('завтра'), null);
  assert.strictEqual(text.length(42 * 60000), '42 мин');
  assert.strictEqual(text.length(65 * 60000), '1 ч 05 мин');
  assert.strictEqual(text.length(35000), '35 с');
});

test('cleanup by code: phrases become sentences, a long pause a paragraph', function () {
  var c = text.codeClean('', [
    { startMs: 0, endMs: 1500, text: 'привет всем' },
    { startMs: 1800, endMs: 4000, text: 'начнем с ремонта' },
    { startMs: 9000, endMs: 12000, text: 'теперь про сроки?' }
  ], 2000);
  assert.strictEqual(c.paragraphs.length, 2);
  assert.strictEqual(c.paragraphs[0].text, 'Привет всем. Начнем с ремонта.');
  assert.strictEqual(c.paragraphs[1].atMs, 9000);
  assert.strictEqual(c.paragraphs[1].text, 'Теперь про сроки?');
  assert.strictEqual(text.codeClean('просто текст без пауз', null).text, 'Просто текст без пауз.');
  assert.strictEqual(text.codeClean('', null).text, '');
});

test('paragraphs of a part: exact time from phrases, by words after the model', function () {
  var seg = { offsetMs: 300000, durationMs: 300000, raw: 'а б', phrases: JSON.stringify([{ startMs: 1000, endMs: 2000, text: 'один два три' }]), cleanedBy: 'code', text: 'x' };
  var p = text.paragraphsOf(seg, 2000);
  assert.strictEqual(p[0].atMs, 301000);
  assert.strictEqual(p[0].exact, true);
  var cleaned = text.paragraphsOf({ offsetMs: 0, durationMs: 100000, cleanedBy: 'model', text: 'Раз два три четыре.\n\nПять шесть семь восемь.' });
  assert.strictEqual(cleaned.length, 2);
  assert.strictEqual(cleaned[1].atMs, 50000);
  assert.strictEqual(cleaned[1].exact, false);
});

test('pieces for search keep the time of their start', function () {
  var words = [];
  for (var i = 0; i < 25; i++) words.push('слово' + i);
  var list = text.chunks([{ atMs: 0, text: words.slice(0, 15).join(' ') }, { atMs: 60000, text: words.slice(15).join(' ') }], 10);
  assert.strictEqual(list.length, 3);
  assert.strictEqual(list[1].offsetMs, 0);
  assert.strictEqual(list[2].offsetMs, 60000);
  assert.strictEqual(list[2].text.split(' ').length, 5);
  var g = text.groups([{ atMs: 0, text: 'а б в' }, { atMs: 1, text: 'г д е' }, { atMs: 2, text: 'ж' }], 4);
  assert.strictEqual(g.length, 2);
});

test('full-text query and snippet by beginnings of words', function () {
  assert.strictEqual(text.ftsQuery('Ремонта ёлки'), 'ремон* OR елки*');
  assert.strictEqual(text.ftsQuery('и в'), '');
  assert.ok(text.score('Решили перенести сроки ремонта', 'сроки ремонт') === 1);
  assert.ok(text.score('ничего общего', 'ремонт') === 0);
  var sn = text.snippet('Сначала долго говорили о погоде и о том, как прошли выходные, а потом решили перенести сроки ремонта на декабрь, потому что подрядчик занят', 'ремонт', 30);
  assert.ok(/ремонта/.test(sn), sn);
  assert.ok(/^… /.test(sn), sn);
});

test('numbers said in words', function () {
  assert.strictEqual(extract.digits('две тысячи пятьсот рублей'), '2500 рублей');
  assert.strictEqual(extract.digits('полторы тысячи'), '1500');
  assert.strictEqual(extract.digits('сто пятьдесят на такси'), '150 на такси');
  assert.strictEqual(extract.digits('один два три'), '1 2 3');
  assert.strictEqual(extract.digits('двадцать пятого ноября', true), '25-го ноября');
  assert.strictEqual(extract.digits('второй хлеб'), 'второй хлеб');
});

test('dates and times in a phrase', function () {
  var w = function (s) { var r = extract.when(s, NOW); return r ? [r.date, r.time] : null; };
  assert.deepStrictEqual(w('до пятницы'), ['2026-11-20', null]);
  assert.deepStrictEqual(w('завтра в девять'), ['2026-11-15', '09:00']);
  assert.deepStrictEqual(w('двадцатого ноября'), ['2026-11-20', null]);
  assert.deepStrictEqual(w('к 20.11'), ['2026-11-20', null]);
  assert.deepStrictEqual(w('в понедельник вечером'), ['2026-11-16', '19:00']);
  assert.deepStrictEqual(w('до конца месяца'), ['2026-11-30', null]);
  assert.deepStrictEqual(w('через две недели'), ['2026-11-28', null]);
  assert.deepStrictEqual(w('первого декабря в десять утра'), ['2026-12-01', '10:00']);
  assert.deepStrictEqual(w('в 18:30'), ['2026-11-14', '18:30']);
  assert.deepStrictEqual(w('в 9 утра'), ['2026-11-15', '09:00'], 'past time today goes to tomorrow');
  assert.strictEqual(extract.when('через час', NOW).at, NOW + 3600000);
  assert.strictEqual(extract.when('просто разговор', NOW), null);
  assert.deepStrictEqual(w('пятого января'), ['2027-01-05', null], 'a past date is next year');
});

test('commands of a short thought', function () {
  var m = extract.command('Напиши Пете, что опоздаю минут на десять.', NOW);
  assert.strictEqual(m.kind, 'message');
  assert.strictEqual(m.to, 'Пете');
  assert.strictEqual(m.text, 'Опоздаю минут на десять');
  assert.ok(m.names.indexOf('Петя') > 0);
  var m2 = extract.command('отправь Олегу Петрову: встреча переносится на пятницу', NOW);
  assert.strictEqual(m2.to, 'Олегу Петрову');
  assert.strictEqual(m2.text, 'Встреча переносится на пятницу');
  var e = extract.command('потратил пятьсот на такси', NOW);
  assert.deepStrictEqual([e.kind, e.amount, e.what], ['expense', 500, 'Такси']);
  var e2 = extract.command('Купил хлеб за сто двадцать рублей.', NOW);
  assert.deepStrictEqual([e2.amount, e2.what], [120, 'Хлеб']);
  var e3 = extract.command('заплатил две тысячи за ремонт', NOW);
  assert.deepStrictEqual([e3.amount, e3.what], [2000, 'Ремонт']);
  var r = extract.command('Напомни завтра в девять позвонить в банк.', NOW);
  assert.deepStrictEqual([r.kind, r.text, r.date, r.time], ['reminder', 'Позвонить в банк', '2026-11-15', '09:00']);
  var r2 = extract.command('напомни мне через час выключить духовку', NOW);
  assert.strictEqual(r2.at, NOW + 3600000);
  assert.strictEqual(r2.text, 'Выключить духовку');
  assert.strictEqual(extract.command('Сегодня хорошая погода, надо гулять.', NOW), null);
  assert.strictEqual(extract.command('Напиши мне потом', NOW), null);
});

test('name forms for the list of chats', function () {
  assert.deepStrictEqual(extract.nameForms('Олегу').slice(0, 2), ['Олегу', 'Олег']);
  assert.ok(extract.nameForms('Сергею').indexOf('Сергей') > 0);
  assert.ok(extract.nameForms('маме').indexOf('мама') > 0);
});

test('a title and topics without a model', function () {
  assert.strictEqual(extract.title('Ну так, значит, надо купить новый чайник для офиса и ещё кое-что. Потом.'), 'Надо купить новый чайник для офиса');
  var t = extract.topics('Ремонт кухни. Ремонта не будет без сметы. Смета готова? Смету пришлю. Кухня большая.', 3);
  assert.ok(t.indexOf('ремонт') >= 0, t);
  assert.ok(t.some(function (x) { return /^смет/.test(x); }), t);
  assert.deepStrictEqual(extract.dictionaryIn('Говорили с Олегом про Битрикс', ['Олег', 'Битрикс24', 'Битрикс', 'Маша']), ['Олег', 'Битрикс']);
});

test('a meeting by rules: decisions, tasks with who and when, questions', function () {
  var paragraphs = [
    { atMs: 0, text: 'Добрый день. Начнём с ремонта кухни, там всё затянулось.' },
    { atMs: 300000, text: 'Решили перенести сроки ремонта на декабрь. Олег подготовит смету до пятницы.' },
    { atMs: 600000, text: 'Я пришлю договор завтра. Непонятно, кто платит за материалы.' },
    { atMs: 900000, text: 'Ремонт кухни обсудили, смета нужна всем.' }
  ];
  var s = extract.summarize(paragraphs, { now: NOW, mode: 'meeting', dictionary: ['Олег'], lines: 4, date: '14.11' });
  assert.strictEqual(s.decisions.length, 1);
  assert.strictEqual(s.decisions[0].atMs, 300000);
  assert.strictEqual(s.tasks.length, 2, JSON.stringify(s.tasks));
  var oleg = s.tasks.filter(function (t) { return t.who === 'Олег'; })[0];
  assert.ok(oleg, JSON.stringify(s.tasks));
  assert.strictEqual(oleg.due, '2026-11-20');
  var mine = s.tasks.filter(function (t) { return t.who === 'владелец'; })[0];
  assert.strictEqual(mine.due, '2026-11-15');
  assert.strictEqual(s.questions.length, 1);
  assert.deepStrictEqual(s.people, ['Олег']);
  assert.ok(/^Встреча: /.test(s.title), s.title);
  assert.ok(s.summary.length >= 3);
});

test('who a task is on: a name before the verb, a few words between, not a word that starts a sentence', function () {
  assert.strictEqual(extract.ownerOf('Олег до среды пришлёт смету.'), 'Олег');
  assert.strictEqual(extract.ownerOf('Олег подготовит смету до пятницы.'), 'Олег');
  assert.strictEqual(extract.ownerOf('Тогда Маша сама позвонит в банк.'), 'Маша');
  assert.strictEqual(extract.ownerOf('Потом до среды пришлёт смету.'), null);
  assert.strictEqual(extract.ownerOf('Он завтра всё проверит.'), null);
  assert.strictEqual(extract.ownerOf('Смету подготовит Олег.'), 'Олег');
  assert.strictEqual(extract.ownerOf('Смету подготовит к пятнице.'), null, 'an object first (…у, …ю) is not a person');
  assert.strictEqual(extract.ownerOf('Олегу позвонит бухгалтер.'), null, 'to whom is not who');
  var s = extract.summarize([{ atMs: 0, text: 'Олег до среды пришлёт смету.' }], { now: NOW });
  assert.strictEqual(s.tasks[0].who, 'Олег');
});

test('a thought by rules', function () {
  var n = extract.note('Напиши Пете, что опоздаю.', { now: NOW, dictionary: ['Петя'] });
  assert.strictEqual(n.command.kind, 'message');
  assert.strictEqual(n.title, 'Написать Пете: опоздаю', 'a command names the thought');
  var off = extract.note('Напиши Пете, что опоздаю.', { now: NOW, commands: false });
  assert.strictEqual(off.command, null);
  assert.strictEqual(off.title, 'Напиши Пете, что опоздаю', 'without commands — the first words');
  assert.strictEqual(extract.note('Потратил пятьсот на такси', { now: NOW }).title, 'Трата: Такси, 500 ₽');
});

test('topics: nouns by their look, in the order they came up, verbs and adjectives left out', function () {
  var t = 'Начнём с ремонта кухни. Плитку привезут в декабре. Решили перенести ремонт на декабрь. ' +
    'Олег подготовит смету. Плитка придёт поздно. Договорились посмотреть смету вместе.';
  assert.deepStrictEqual(extract.topics(t, 4), ['ремонт', 'плитка', 'декабрь', 'смету']);
  assert.deepStrictEqual(extract.topics('Память человека. Кратковременная память держит семь элементов. Память работает.', 3), ['память']);
});

test('the cleanup of the model is taken only when it kept the words', function () {
  var raw = 'раз два три четыре пять шесть семь восемь девять десять';
  assert.strictEqual(prompts.acceptClean(raw, 'Раз, два, три, четыре, пять, шесть, семь, восемь, девять, десять.', 0.6, 1.5), 'Раз, два, три, четыре, пять, шесть, семь, восемь, девять, десять.');
  assert.strictEqual(prompts.acceptClean(raw, 'Счёт до десяти.', 0.6, 1.5), null);
  assert.strictEqual(prompts.acceptClean(raw, null), null);
  assert.ok(/Олег, Битрикс/.test(prompts.cleanSystem(['Олег', 'Битрикс'])));
});

test('the model answer about a thought', function () {
  var n = prompts.checkNote({ title: 'Опоздание.', tags: ['Встреча', ''], command: { kind: 'message', to: 'Петя', text: 'Опоздаю минут на десять' } }, NOW);
  assert.strictEqual(n.title, 'Опоздание');
  assert.deepStrictEqual(n.tags, ['встреча']);
  assert.strictEqual(n.command.to, 'Петя');
  assert.strictEqual(prompts.checkNote({ title: 'Покупка', command: { kind: 'expense', amount: '500 ₽', what: 'такси' } }, NOW).command.amount, 500);
  var r = prompts.checkNote({ title: 'Банк', command: { kind: 'reminder', when: '2026-11-15T09:00', text: 'Позвонить в банк' } }, NOW).command;
  assert.deepStrictEqual([r.date, r.time], ['2026-11-15', '09:00']);
  var r2 = prompts.checkNote({ title: 'Банк', command: { kind: 'reminder', when: 'завтра в десять', text: 'Позвонить' } }, NOW).command;
  assert.deepStrictEqual([r2.date, r2.time], ['2026-11-15', '10:00']);
  assert.strictEqual(prompts.checkNote({ title: 'x', command: { kind: 'expense', amount: 0 } }, NOW).command, null);
  assert.strictEqual(prompts.checkNote('не JSON', NOW), null);
});

test('the model summary brought to its shape', function () {
  var s = prompts.checkSummary({
    title: 'Ремонт с Олегом', summary: ['Сроки сдвигаются', 'Смета нужна'],
    decisions: [{ text: 'Перенести на декабрь', at: '5:00' }, 'Платит заказчик', { text: '', at: '1:00' }],
    tasks: [{ text: 'Смета', who: 'Олег', due: '2026-11-20', at: '[5:10]' }, { text: 'Договор', who: 'null', due: 'потом', at: '99:00' }],
    questions: ['Кто платит?'], people: ['Олег'], topics: ['ремонт']
  }, { durationMs: 20 * 60000, lines: 6, maxTasks: 20 });
  assert.strictEqual(s.decisions.length, 2);
  assert.strictEqual(s.decisions[0].atMs, 300000);
  assert.strictEqual(s.tasks[0].atMs, 310000);
  assert.strictEqual(s.tasks[1].who, null);
  assert.strictEqual(s.tasks[1].due, null);
  assert.strictEqual(s.tasks[1].atMs, null, 'a time past the end');
  assert.throws(function () { prompts.checkSummary({ title: '', summary: [] }); });
  assert.throws(function () { prompts.checkSummary([1, 2]); });
  assert.deepStrictEqual(prompts.checkSummary({ summary: '- раз\n- два' }).summary, ['раз', 'два']);
  assert.ok(/12:30 — важно/.test(prompts.summarySystem({ marks: [{ atMs: 750000, label: 'важно' }] })));
  assert.ok(/лекции/.test(prompts.summarySystem({ mode: 'lecture' })));
  assert.ok(/выжимки/.test(prompts.finalSystem({})));
});

test('parts: sizes, names, time without pauses, level', function () {
  assert.strictEqual(parts.partBytes(32000, 5, 0), 1200000);
  assert.strictEqual(parts.partBytes(32000, 5, 3), 1236000);
  assert.strictEqual(parts.partName(7), 'part-007.m4a');
  assert.strictEqual(parts.partName(12, 'wav'), 'part-012.wav');
  assert.strictEqual(parts.activeMs({ startedAt: 1000, pausedMs: 2000 }, 11000), 8000);
  assert.strictEqual(parts.activeMs({ startedAt: 1000, pausedMs: 0, pausedAt: 6000 }, 11000), 5000);
  assert.strictEqual(parts.level(0), 0);
  assert.strictEqual(parts.level(32767), 1);
  assert.ok(parts.level(330) > 0.3 && parts.level(330) < 0.4);
});

test('parts: mode, old sound, cut plan, kinds of files', function () {
  assert.strictEqual(parts.finalMode('auto', 2 * 60000, 3), 'note');
  assert.strictEqual(parts.finalMode('auto', 4 * 60000, 3), 'meeting');
  assert.strictEqual(parts.finalMode('lecture', 60000, 3), 'lecture');
  var old = Date.now() - 40 * 864e5;
  var list = [{ id: 1, startedAt: old }, { id: 2, startedAt: old, audioKept: 1 }, { id: 3, startedAt: Date.now() }, { id: 4, startedAt: old, audioRemoved: 5 }];
  assert.deepStrictEqual(parts.toStrip(list, Date.now(), 30), [1]);
  assert.deepStrictEqual(parts.toStrip(list, Date.now(), 0), []);
  assert.deepStrictEqual(parts.plan(12 * 60000, 5 * 60000).map(function (p) { return p.endMs; }), [300000, 600000, 720000]);
  assert.deepStrictEqual(parts.plan(10.5 * 60000, 5 * 60000).map(function (p) { return p.endMs; }), [300000, 630000], 'a short tail joins the last part');
  assert.ok(parts.isAudio('Голосовое.OGG') && !parts.isAudio('photo.jpg'));
  assert.strictEqual(parts.cutKind('audio/mp4a-latm', 34).container, 'mpeg4');
  assert.strictEqual(parts.cutKind('audio/opus', 34).container, 'ogg');
  assert.strictEqual(parts.cutKind('audio/opus', 28).container, 'webm');
  assert.strictEqual(parts.cutKind('audio/mpeg', 34).container, 'frames');
  assert.strictEqual(parts.cutKind('audio/flac', 34), null);
  var h = parts.wavHeader(16000, 1, 1000);
  assert.strictEqual(h.length, 44);
  assert.strictEqual(String.fromCharCode(h[0], h[1], h[2], h[3]), 'RIFF');
  assert.strictEqual(h[40] + h[41] * 256, 1000);
});

test('words of notifications and the widget', function () {
  assert.strictEqual(parts.readyText('Встреча с Олегом', { decisions: [1, 2, 3], tasks: [1, 2, 3, 4] }), 'Конспект готов: Встреча с Олегом — 3 решения, 4 задачи');
  assert.strictEqual(parts.readyText('Лекция', { decisions: [1], tasks: [] }), 'Конспект готов: Лекция — 1 решение');
  assert.strictEqual(parts.count(5, 'задача', 'задачи', 'задач'), '5 задач');
  assert.strictEqual(parts.count(21, 'задача', 'задачи', 'задач'), '21 задача');
  var w = parts.widget({ title: 'Встреча с Олегом', durationMs: 42 * 60000 }, 4, null, 0);
  assert.deepStrictEqual(w, { title: 'Последняя: Встреча с Олегом, 42 мин', text: 'Задач открыто: 4' });
  assert.strictEqual(parts.widget(null, 0, null, 0).text, 'Записей пока нет');
  assert.ok(/^Идёт запись · 5 мин/.test(parts.widget(null, 0, { startedAt: 1, pausedMs: 0 }, 300001).title));
});

test('settings in their bounds', function () {
  var s = settings.normalize({ partMinutes: 100, noteMaxMinutes: '2', source: 'NOPE', summaryModel: 'local', cleanAt: '4:30', words: 'Олег, Битрикс;\nОлег', pauseOnCall: 0, unknown: 1 });
  assert.strictEqual(s.partMinutes, 30);
  assert.strictEqual(s.noteMaxMinutes, 2);
  assert.strictEqual(s.source, 'MIC');
  assert.strictEqual(s.summaryModel, 'local');
  assert.strictEqual(s.cleanAt, '04:30');
  assert.deepStrictEqual(s.words, ['Олег', 'Битрикс']);
  assert.strictEqual(s.pauseOnCall, false);
  assert.ok(!('unknown' in s));
  assert.deepStrictEqual(settings.diff(settings.normalize({})), {});
  assert.deepStrictEqual(settings.diff(s).partMinutes, 30);
  Object.keys(settings.NUMBERS).forEach(function (k) {
    var v = settings.DEFAULTS[k];
    assert.ok(v >= settings.NUMBERS[k][0] && v <= settings.NUMBERS[k][1], k);
  });
  Object.keys(settings.CHOICES).forEach(function (k) { assert.ok(settings.CHOICES[k].indexOf(settings.DEFAULTS[k]) >= 0, k); });
});

test('«Ни одной задачи не потерял»: tasks with a past date in the window, all done, enough of them', function () {
  var tasks = [
    { due: '2026-11-01', done: 1, proposed: 0 },
    { due: '2026-11-13', done: 1, proposed: 0 },
    { due: '2026-11-14', done: 0, proposed: 0 },   // today: there is still time
    { due: '2026-10-01', done: 0, proposed: 0 },   // before the window
    { due: null, done: 0, proposed: 0 },           // no date: cannot be late
    { due: '2026-11-05', done: 0, proposed: 1 }    // a proposed reminder, not taken
  ];
  assert.deepStrictEqual(awards.keptAll(tasks, '2026-11-14', 30, 2), { ok: true, due: 2, done: 2 });
  assert.strictEqual(awards.keptAll(tasks, '2026-11-14', 30, 3).ok, false, 'too few');
  tasks.push({ due: '2026-11-10', done: 0, proposed: 0 });
  assert.strictEqual(awards.keptAll(tasks, '2026-11-14', 30, 2).ok, false, 'one lost');
  assert.strictEqual(awards.shift('2026-03-01', -1), '2026-02-28');
  var s = settings.normalize({ keptTasksDays: 1, keptTasksMin: 0 });
  assert.strictEqual(s.keptTasksDays, 7);
  assert.strictEqual(s.keptTasksMin, 1);
  assert.strictEqual(settings.normalize({}).keptTasksMin, 10);
});

console.log('logic: ' + passed + ' passed, ' + failed + ' failed');
if (failed) process.exitCode = 1;
