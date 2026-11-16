// node tests/engine.test.js — main.js on its whole way, in a stand-in engine (tests/sim.js) with a
// fake microphone: a recording in parts (the next file and stop-and-start), pause and a phone call,
// the wake word off and back, the queue of transcription (on the charger, without the speech
// model), a summary by rules and by a model (in one request and by steps), a thought that becomes
// a draft, an expense or a reminder, the archive and search by words and by meaning, the long
// memory and the shared base, import of a long file, recovery after a crash, removal of old sound.
var assert = require('assert');
var fs = require('fs');
var path = require('path');
var sim = require('./sim.js');

if (!sim.realBase()) {
  console.log('engine: пропущено — нужен репозиторий Assi рядом (lib/base.js)');
  process.exit(0);
}

var ROOT = path.resolve(__dirname, '..');
var failed = 0;
var passed = 0;
var T0 = new Date(2026, 10, 14, 14, 5).getTime();
var MIN = 60000;
var DAY = 864e5;

/** The fake phone: a microphone that writes a few bytes, a cutter, a calendar, a player. */
function fakePhone() {
  var phone = {
    recorders: [], nextFiles: [], events: [], notices: [], durations: {}, cutResult: undefined, chargingNow: false,
    record: function (o) {
      fs.mkdirSync(path.dirname(o.path), { recursive: true });
      fs.writeFileSync(o.path, 'm4a');
      var r = { o: o, paused: false, stopped: false };
      phone.recorders.push(r);
      return r;
    },
    nextFile: function (r, p) { fs.writeFileSync(p, 'm4a'); phone.nextFiles.push(p); },
    finish: function (r) { r.stopped = true; return true; },
    pause: function (r) { r.paused = true; },
    resume: function (r) { r.paused = false; },
    amplitude: function () { return 3000; },
    freeMb: function () { return 1e6; },
    size: function (p) { return fs.existsSync(p) ? fs.statSync(p).size : 0; },
    duration: function (p) { return phone.durations[path.basename(p)] === undefined ? null : phone.durations[path.basename(p)]; },
    cut: function (src, partMs, name) {
      if (phone.cutResult === null) return null;
      var total = phone.durations[path.basename(src)];
      var out = [];
      for (var at = 0, n = 1; at < total; at += partMs, n++) {
        var p = name(n, 'm4a');
        fs.writeFileSync(p, 'part');
        out.push({ n: n, path: p, offsetMs: at, durationMs: Math.min(partMs, total - at) });
      }
      return out;
    },
    ffmpeg: function () { return null; },
    copy: function (a, b) { fs.copyFileSync(a, b); },
    append: function (p, b64) { var buf = Buffer.from(b64, 'base64'); fs.appendFileSync(p, buf); return buf.length; },
    play: function () { return true; }, playerPause: function () {}, playerStop: function () {}, playerState: function () { return { playing: false }; },
    charging: function () { return phone.chargingNow; },
    addEvent: function (o) { phone.events.push(o); return 900 + phone.events.length; },
    removeEvent: function () { return true; },
    ongoing: function (o) { phone.notices.push(o); },
    cancelOngoing: function () { phone.notices.push('cancel'); }
  };
  return phone;
}

var lastEngine = null;

function check(name, fn) {
  var phone = fakePhone();
  // android.js of the module is put aside by the fake phone (the override goes by the module's folder).
  var engine = sim.create({ recorder: ROOT }, { 'android.js': phone });
  var env = engine.env;
  env.now = T0;
  env.features = ['notify.actions', 'transcribe.segments', 'job.once'];
  lastEngine = engine;
  try {
    var recorder = engine.require('modules/recorder/main.js');
    fn(recorder, env, phone, engine);
    if (env.errors.length) throw env.errors[0];
    passed++;
  } catch (error) {
    failed++;
    console.log('FAIL ' + name + ': ' + (error && error.stack || error));
  } finally {
    engine.close();
  }
}

/** The shared base of this engine (the real lib/base.js). */
function engine0() {
  return lastEngine.require('lib/base');
}

/** What the speech model «hears» in each part file. */
function hearing(env, byFile) {
  env.transcribe = function (file, options) {
    var key = path.basename(file);
    var said = byFile[key] || byFile['*'] || [];
    if (typeof said === 'function') return said(file, options);
    if (options && options.segments) return said;
    return said.map(function (p) { return p.text; }).join(' ');
  };
}

var MEETING_1 = [
  { startMs: 0, endMs: 4000, text: 'добрый день начнем с ремонта кухни' },
  { startMs: 9000, endMs: 15000, text: 'решили перенести сроки ремонта на декабрь' }
];
var MEETING_2 = [
  { startMs: 1000, endMs: 6000, text: 'олег подготовит смету до пятницы' },
  { startMs: 12000, endMs: 18000, text: 'я пришлю договор завтра' },
  { startMs: 25000, endMs: 30000, text: 'непонятно кто платит за материалы' }
];

/** A recording of 4 minutes in two parts with a pause and a bookmark. */
function recordMeeting(recorder, env, phone) {
  recorder.startRecording({ mode: 'auto' });
  env.now += 2 * MIN;
  recorder.mark('смета');
  var r = phone.recorders[0];
  r.o.onInfo('approaching');
  r.o.onInfo('next');
  env.drain();
  recorder.pauseRecording('owner');
  env.now += 10 * MIN;
  recorder.resumeRecording();
  env.now += 2 * MIN;
  return recorder.stopRecording();
}

check('start: the tool stub, the night job, events', function (recorder, env) {
  recorder.start();
  assert.ok(/Инструмент модуля «Диктофон»/.test(fs.readFileSync(path.join(env.dir, 'tools/recorder.js'), 'utf8')));
  assert.deepStrictEqual(env.jobs['recorder:clean'].spec, { at: '04:30' });
  assert.ok(env.handlers.power && env.handlers.call);
  env.drain();
});

check('a recording in parts: the wake word off and back, the ongoing notification, time without the pause', function (recorder, env, phone) {
  env.wake.on = true;
  hearing(env, { 'part-001.m4a': MEETING_1, 'part-002.m4a': MEETING_2 });
  recorder.startRecording({ mode: 'auto' });
  assert.deepStrictEqual(env.wakeSets, [false]);
  var st = recorder.status();
  assert.strictEqual(st.recording.part, 1);
  assert.ok(fs.existsSync(path.join(env.dir, 'data/recorder/state.json')));
  var n = env.notifications[env.notifications.length - 1];
  assert.strictEqual(n.id, 'recorder.rec');
  assert.strictEqual(n.ongoing, true);
  assert.strictEqual(n.chronometer, true);
  assert.deepStrictEqual(n.actions.map(function (a) { return a.title; }), ['Пауза', 'Отметка', 'Стоп']);
  assert.strictEqual(phone.recorders[0].o.maxBytes, 1236000);
  assert.strictEqual(phone.recorders[0].o.source, 1);
  env.now += 2 * MIN;
  var m = recorder.mark('смета');
  assert.strictEqual(m.atMs, 2 * MIN);
  phone.recorders[0].o.onInfo('approaching');
  assert.ok(/part-002\.m4a$/.test(phone.nextFiles[0]));
  phone.recorders[0].o.onInfo('next');
  env.drain();
  assert.strictEqual(recorder.status().recording.part, 2);
  recorder.pauseRecording('owner');
  assert.strictEqual(env.notifications[env.notifications.length - 1].actions[0].title, 'Продолжить');
  env.now += 10 * MIN;
  recorder.resumeRecording();
  env.now += 2 * MIN;
  var done = recorder.stopRecording();
  assert.strictEqual(done.durationMs, 4 * MIN, 'the pause does not count');
  assert.deepStrictEqual(env.wakeSets, [false, true]);
  assert.ok(env.cancelled.indexOf('recorder.rec') >= 0);
  assert.ok(!fs.existsSync(path.join(env.dir, 'data/recorder/state.json')));
  var it = recorder.item(done.id);
  assert.deepStrictEqual(it.segments.map(function (g) { return [g.n, g.offsetMs, g.durationMs]; }), [[1, 0, 2 * MIN], [2, 2 * MIN, 2 * MIN]]);
  assert.strictEqual(it.state, 'transcribing');
  env.drain();
  it = recorder.item(done.id);
  assert.strictEqual(it.state, 'ready', it.error);
  assert.strictEqual(it.kind, 'meeting');
  assert.strictEqual(it.mode, 'meeting');
  assert.strictEqual(it.segments[0].transcribeMs >= 0, true);
  assert.strictEqual(it.paragraphs[0].text, 'Добрый день начнем с ремонта кухни.');
  assert.strictEqual(it.paragraphs[1].atMs, 9000);
  assert.strictEqual(it.paragraphs[2].atMs, 2 * MIN + 1000, 'the time of a phrase is from the start of the recording');
  assert.strictEqual(it.summary.by, 'rules');
  assert.strictEqual(it.summary.decisions.length, 1);
  assert.strictEqual(it.summary.decisions[0].atMs, 9000);
  assert.strictEqual(it.tasks.length, 2);
  assert.strictEqual(it.tasks[0].who, 'Олег');
  assert.strictEqual(it.tasks[0].due, '2026-11-20');
  assert.strictEqual(it.marks[0].label, 'смета');
  assert.strictEqual(it.summary.questions.length, 1);
  var ready = env.notifications.filter(function (x) { return /^Конспект готов/.test(x.title); })[0];
  assert.ok(ready, JSON.stringify(env.notifications.map(function (x) { return x.title; })));
  assert.ok(/1 решение, 2 задачи$/.test(ready.title), ready.title);
  var base = engine0(env).find({ kind: 'event', source: 'recorder' });
  assert.strictEqual(base.length, 1);
  assert.strictEqual(base[0].amount, 4);
  assert.strictEqual(base[0].unit, 'min');
  assert.strictEqual(base[0].data.recordingId, done.id);
  assert.strictEqual(env.memory.items.length, 1);
  assert.ok(/^Встреча «/.test(env.memory.items[0].text) && /Решили: /.test(env.memory.items[0].text), env.memory.items[0].text);
  assert.ok(/диктофон, встреча/.test(env.memory.items[0].tags));
});

check('archive: search by words with the place in the recording, the list and its chips', function (recorder, env, phone) {
  hearing(env, { 'part-001.m4a': MEETING_1, 'part-002.m4a': MEETING_2 });
  var done = recordMeeting(recorder, env, phone);
  env.drain();
  var found = recorder.search('смета');
  assert.strictEqual(found.length, 1);
  assert.strictEqual(found[0].id, done.id);
  assert.ok(/смет/.test(found[0].hit.snippet), found[0].hit.snippet);
  assert.strictEqual(found[0].hit.by, 'words');
  assert.strictEqual(recorder.search('ёлка').length, 0);
  assert.strictEqual(recorder.search('ремонт кухни').length, 1);
  assert.strictEqual(recorder.list({ kind: 'meeting' }).length, 1);
  assert.strictEqual(recorder.list({ kind: 'note' }).length, 0);
  var withTasks = recorder.list({ kind: 'tasks' });
  assert.strictEqual(withTasks[0].open.length, 2);
  assert.strictEqual(recorder.list({ query: 'договор' })[0].id, done.id);
  var tool = lastEngine.require('modules/recorder/tool.js');
  assert.ok(/#1 .*«/.test(tool.run({ action: 'search', query: 'смету' })));
  assert.ok(/Задачи:/.test(tool.run({ action: 'item', id: done.id })));
  assert.ok(/задача #\d+: Олег подготовит/.test(tool.run({ action: 'tasks' })));
  var w = recorder.widget();
  assert.ok(/^Последняя: Встреча/.test(w.title), w.title);
  assert.strictEqual(w.text, 'Задач открыто: 2');
  assert.strictEqual(w.open, 'modules/recorder/ui/item.html?id=' + done.id);
});

check('search by meaning when the role embed has a model', function (recorder, env, phone) {
  // A toy model of meaning: «ремонт» and «стройка» are one thing.
  env.embed = function (t) {
    var s = String(t).toLowerCase();
    return [/ремонт|стройк/.test(s) ? 1 : 0, /смет|деньг/.test(s) ? 1 : 0, 0.1];
  };
  hearing(env, { 'part-001.m4a': MEETING_1, 'part-002.m4a': MEETING_2 });
  var done = recordMeeting(recorder, env, phone);
  env.drain();
  var found = recorder.search('стройка');
  assert.strictEqual(found.length, 1);
  assert.strictEqual(found[0].id, done.id);
  assert.strictEqual(found[0].hit.by, 'meaning');
});

check('a meeting with a model: cleanup, a summary in one request', function (recorder, env, phone) {
  hearing(env, { 'part-001.m4a': MEETING_1, 'part-002.m4a': MEETING_2 });
  env.models['recorder.clean'] = { provider: 'cheap', baseUrl: 'https://x' };
  env.models['recorder.summary'] = { provider: 'strong', baseUrl: 'https://y' };
  env.answer = function (role, options) {
    if (role === 'recorder.clean') {
      if (/смету/.test(options.prompt)) return 'Олег подготовит смету до пятницы.\n\nЯ пришлю договор завтра. Непонятно, кто платит за материалы.';
      return 'Короче.';   // cut too much: not taken
    }
    if (role === 'recorder.summary') {
      assert.ok(/Отметки владельца: 2:00 — смета/.test(options.system), options.system);
      assert.ok(/\[2:00\] Олег подготовит смету/.test(options.prompt), options.prompt);
      return { title: 'Ремонт кухни с Олегом', summary: ['Сроки ремонта сдвигаются на декабрь'], decisions: [{ text: 'Перенести ремонт на декабрь', at: '0:09' }],
        tasks: [{ text: 'Подготовить смету', who: 'Олег', due: '2026-11-20', at: '2:01' }], questions: ['Кто платит за материалы?'], people: ['Олег'], topics: ['ремонт'] };
    }
    throw new Error('не та роль ' + role);
  };
  var done = recordMeeting(recorder, env, phone);
  env.drain();
  var it = recorder.item(done.id);
  assert.strictEqual(it.state, 'ready', it.error);
  assert.strictEqual(it.title, 'Ремонт кухни с Олегом');
  assert.strictEqual(it.summary.by, 'model');
  assert.strictEqual(it.summary.decisions[0].atMs, 9000);
  assert.deepStrictEqual(it.tasks.map(function (t) { return [t.text, t.who, t.atMs]; }), [['Подготовить смету', 'Олег', 2 * MIN + 1000]]);
  assert.deepStrictEqual(it.segments.map(function (g) { return g.cleanedBy; }), ['code', 'model']);
  assert.deepStrictEqual(it.people, ['Олег']);
  // The owner's title and done task stay through a rebuild.
  recorder.setTitle(done.id, 'Кухня');
  recorder.setTask(it.tasks[0].id, { done: true });
  env.answer = function (role) {
    if (role === 'recorder.summary') return { title: 'Другое', summary: ['x'], tasks: [{ text: 'Подготовить смету' }, { text: 'Купить плитку' }] };
    return 'Короче.';
  };
  recorder.rebuild(done.id);
  env.drain();
  it = recorder.item(done.id);
  assert.strictEqual(it.title, 'Кухня');
  assert.deepStrictEqual(it.tasks.map(function (t) { return [t.text, t.done]; }), [['Подготовить смету', true], ['Купить плитку', false]]);
  assert.strictEqual(engine0(env).find({ kind: 'event', source: 'recorder' }).length, 1, 'the base record is updated, not doubled');
  assert.strictEqual(env.memory.items.length, 1, 'the memory note is replaced');
});

check('a summary by steps for a model on the phone; a broken answer falls back to rules', function (recorder, env, phone) {
  var long = [];
  for (var i = 0; i < 40; i++) long.push({ startMs: i * 7000, endMs: i * 7000 + 5000, text: 'обсуждаем этап номер ' + i + ' и его сроки' });
  hearing(env, { 'part-001.m4a': long, 'part-002.m4a': MEETING_2 });
  recorder.saveSettings({ summaryModel: 'local', cleanModel: 'off', stepWords: 100 });
  env.models['recorder.summary'] = { provider: 'local', baseUrl: 'local:gemma' };
  env.models['recorder.clean'] = { provider: 'local', baseUrl: 'local:gemma' };
  var steps = 0;
  env.answer = function (role, options) {
    if (role === 'recorder.clean') { steps++; return '- [0:09] решили перенести ремонт'; }
    if (role === 'recorder.summary') {
      assert.ok(/выжимки/.test(options.system));
      return { title: 'По шагам', summary: ['Итог'], decisions: [], tasks: [] };
    }
    throw new Error(role);
  };
  var done = recordMeeting(recorder, env, phone);
  env.drain();
  var it = recorder.item(done.id);
  assert.ok(steps >= 2, 'steps: ' + steps);
  assert.strictEqual(it.title, 'По шагам');
  // A cloud model is not used when the setting says «only on the phone».
  env.models['recorder.summary'] = { provider: 'cloud', baseUrl: 'https://z' };
  env.answer = function () { throw new Error('не должно спрашивать облако'); };
  recorder.rebuild(done.id);
  env.drain();
  it = recorder.item(done.id);
  assert.strictEqual(it.summary.by, 'rules');
  assert.ok(/модель на телефоне/.test(it.error), it.error);
  // A model that answers nonsense: the rules' summary, with a note.
  recorder.saveSettings({ summaryModel: 'cloud' });
  env.answer = function () { return [1, 2]; };
  recorder.rebuild(done.id);
  env.drain();
  it = recorder.item(done.id);
  assert.strictEqual(it.state, 'ready');
  assert.strictEqual(it.summary.by, 'rules');
  assert.ok(/без модели/.test(it.summary.note), it.summary.note);
});

check('a thought «напиши Пете…» becomes a draft in Входящие, nothing is sent', function (recorder, env, phone, engine) {
  var inboxDir = path.join(env.dir, 'modules/inbox');
  fs.mkdirSync(inboxDir, { recursive: true });
  fs.writeFileSync(path.join(inboxDir, 'main.js'),
    'exports.calls = [];\nexports.draftFor = function (name, text, source, options) { exports.calls.push([name, text, source, options]); ' +
    'return name === "Петя" ? { ok: true, found: true, title: "Петя" } : { ok: false, found: false }; };\n');
  hearing(env, { '*': [{ startMs: 0, endMs: 3000, text: 'напиши пете что опоздаю минут на десять' }] });
  recorder.startRecording({ mode: 'auto' });
  env.now += 20000;
  var done = recorder.stopRecording();
  env.drain();
  var inbox = engine.require('modules/inbox/main.js');
  assert.deepStrictEqual(inbox.calls.map(function (c) { return c[0]; }), ['Пете', 'Петя']);
  assert.strictEqual(inbox.calls[1][1], 'Опоздаю минут на десять');
  assert.strictEqual(inbox.calls[1][2], 'voice');
  assert.strictEqual(inbox.calls[1][3].open, false);
  var it = recorder.item(done.id);
  assert.strictEqual(it.kind, 'note');
  assert.strictEqual(it.command.kind, 'message');
  assert.strictEqual(it.commandState, 'draft');
  assert.strictEqual(engine0(env).find({ kind: 'note', source: 'recorder' }).length, 1);
  assert.ok(!env.notifications.some(function (n) { return /^Мысль записана/.test(n.title || ''); }), 'the inbox tells about the draft itself');
  // A rebuild does not send a second draft.
  recorder.rebuild(done.id);
  env.drain();
  assert.strictEqual(inbox.calls.length, 2);
});

check('a thought «потратил пятьсот на такси» becomes an expense in Траты marked «голосом»', function (recorder, env, phone, engine) {
  var dir = path.join(env.dir, 'modules/spending');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'main.js'), 'exports.added = [];\nexports.addManual = function (f) { exports.added.push(f); return { id: 77 }; };\n');
  hearing(env, { '*': [{ startMs: 0, endMs: 3000, text: 'потратил пятьсот на такси' }] });
  recorder.startRecording({ mode: 'note' });
  env.now += 15000;
  var done = recorder.stopRecording();
  env.drain();
  var spending = engine.require('modules/spending/main.js');
  assert.strictEqual(spending.added.length, 1);
  assert.strictEqual(spending.added[0].amount, 500);
  assert.strictEqual(spending.added[0].title, 'Такси');
  assert.strictEqual(spending.added[0].note, 'голосом, проверить');
  assert.strictEqual(recorder.item(done.id).commandState, 'expense');
  assert.ok(env.notifications.some(function (n) { return /^Трата записана: Такси, 500/.test(n.title || ''); }));
});

check('without Траты the expense goes to the shared base; without Входящие the message stays in the record', function (recorder, env) {
  hearing(env, { '*': [{ startMs: 0, endMs: 3000, text: 'заплатил две тысячи за ремонт' }] });
  recorder.startRecording({ mode: 'note' });
  env.now += 15000;
  recorder.stopRecording();
  env.drain();
  var e = engine0(env).find({ kind: 'expense', source: 'recorder' });
  assert.strictEqual(e.length, 1);
  assert.strictEqual(e[0].amount, 2000);
  hearing(env, { '*': [{ startMs: 0, endMs: 3000, text: 'напиши маме что я купил хлеб' }] });
  recorder.startRecording({ mode: 'note' });
  env.now += 15000;
  var done = recorder.stopRecording();
  env.drain();
  assert.strictEqual(recorder.item(done.id).commandState, 'no-inbox');
});

check('«Надиктовать итог» from Фокус: the title, the tags and the link stay with the recording', function (recorder, env) {
  hearing(env, { '*': [{ startMs: 0, endMs: 3000, text: 'закончил черновик отчёта осталось проверить таблицы' }] });
  recorder.startRecording({ title: 'Итог фокуса: Отчёт', tags: ['фокус', 'Отчёт', 'фокус', ''], link: { module: 'focus', id: 's1' } });
  env.now += 15000;
  var done = recorder.stopRecording();
  env.drain();
  var it = recorder.item(done.id);
  assert.strictEqual(it.title, 'Итог фокуса: Отчёт');
  assert.deepStrictEqual(it.tags.slice(0, 2), ['фокус', 'Отчёт']);
  assert.strictEqual(it.tags.filter(function (t) { return t === 'фокус'; }).length, 1);
  assert.deepStrictEqual(it.link, { module: 'focus', id: 's1' });
});

check('a thought «напомни…» is a proposed reminder; «Напомнить» arms a once job, it fires', function (recorder, env) {
  hearing(env, { '*': [{ startMs: 0, endMs: 3000, text: 'напомни завтра в девять позвонить в банк' }] });
  recorder.startRecording({ mode: 'auto' });
  env.now += 10000;
  var done = recorder.stopRecording();
  env.drain();
  var it = recorder.item(done.id);
  assert.strictEqual(it.commandState, 'proposed');
  var task = it.tasks[0];
  assert.strictEqual(task.text, 'Позвонить в банк');
  assert.strictEqual(task.proposed, true);
  assert.strictEqual(new Date(task.remindAt).getHours(), 9);
  var offer = env.notifications.filter(function (n) { return /^Напомнить: /.test(n.title || ''); })[0];
  assert.strictEqual(offer.actions[0].fn, 'remindTask');
  var r = recorder.remindTask(offer.actions[0].args);
  assert.strictEqual(r.at, task.remindAt);
  var j = env.jobs['recorder:remind:' + task.id];
  assert.deepStrictEqual(j.spec, { once: task.remindAt });
  env.now = task.remindAt;
  j.fn();
  assert.ok(env.notifications.some(function (n) { return n.title === 'Напоминание: Позвонить в банк'; }));
  assert.strictEqual(recorder.item(done.id).tasks[0].remindAt, null);
});

check('a reminder without job.once: a daily job that fires on its day and goes', function (recorder, env, phone) {
  env.features = ['notify.actions', 'transcribe.segments'];
  hearing(env, { '*': MEETING_2 });
  var done = recordMeeting(recorder, env, phone);
  env.drain();
  var task = recorder.item(done.id).tasks[0];
  var r = recorder.remindTask(task.id);
  var j = env.jobs['recorder:remind:' + task.id];
  assert.ok(/^\d\d:\d\d$/.test(j.spec.at));
  env.now = r.at - 3 * DAY;
  j.fn();
  assert.ok(env.jobs['recorder:remind:' + task.id], 'not its day yet');
  env.now = r.at;
  j.fn();
  assert.ok(!env.jobs['recorder:remind:' + task.id]);
  assert.ok(env.notifications.some(function (n) { return /^Напоминание: /.test(n.title || ''); }));
});

check('a task to the calendar: on its day at the hour of the setting', function (recorder, env, phone) {
  hearing(env, { 'part-001.m4a': MEETING_1, 'part-002.m4a': MEETING_2 });
  var done = recordMeeting(recorder, env, phone);
  env.drain();
  var task = recorder.item(done.id).tasks[0];
  var out = recorder.taskToCalendar(task.id);
  assert.strictEqual(out.eventId, 901);
  var e = phone.events[0];
  assert.strictEqual(e.title, 'Олег подготовит смету до пятницы.');
  assert.strictEqual(new Date(e.start).getDate(), 20);
  assert.strictEqual(new Date(e.start).getHours(), 10);
  assert.strictEqual(e.minutes, 30);
  assert.ok(/Из записи «/.test(e.description));
  assert.strictEqual(recorder.taskToCalendar(task.id).already, true);
  recorder.removeFromCalendar(task.id);
  assert.strictEqual(recorder.item(done.id).tasks[0].calendarEventId, null);
});

check('stop and start every part when the next file is not there', function (recorder, env, phone) {
  recorder.saveSettings({ splitMode: 'restart', partMinutes: 1 });
  hearing(env, { '*': [{ startMs: 0, endMs: 1000, text: 'проверка' }] });
  recorder.startRecording({ mode: 'meeting' });
  assert.strictEqual(phone.recorders[0].o.maxBytes, 0);
  env.sleepBudget = 150 * 1000;   // the ticker runs for two and a half minutes of the fake clock
  env.drain(1);
  assert.ok(phone.recorders.length >= 3, 'recorders: ' + phone.recorders.length);
  assert.ok(phone.recorders[0].stopped);
  assert.ok(env.emitted.some(function (e) { return e.name === 'recorder.level' && e.data.level > 0; }));
  var done = recorder.stopRecording();
  env.sleepBudget = 0;
  env.drain();
  var it = recorder.item(done.id);
  assert.ok(it.segments.length >= 3);
  assert.strictEqual(it.segments[1].offsetMs, it.segments[0].durationMs);
});

check('the next file never comes: the recording goes on by stop and start', function (recorder, env, phone) {
  recorder.saveSettings({ partMinutes: 1, partLateFactor: 2 });
  recorder.startRecording({ mode: 'meeting' });
  env.sleepBudget = 130 * 1000;
  env.drain(1);
  assert.strictEqual(recorder.status().recording.splitMode, 'restart');
  assert.ok(phone.recorders.length >= 2);
  recorder.stopRecording();
  env.sleepBudget = 0;
  env.drain();
});

check('a phone call pauses the recording and the end of it resumes', function (recorder, env) {
  recorder.startRecording({ mode: 'meeting' });
  env.handlers = {};
  recorder.start();
  env.handlers.call({ state: 'ringing' });
  assert.strictEqual(recorder.status().recording.paused, false);
  env.handlers.call({ state: 'offhook' });
  assert.strictEqual(recorder.status().recording.pausedBy, 'call');
  env.now += 5 * MIN;
  env.handlers.call({ state: 'idle' });
  assert.strictEqual(recorder.status().recording.paused, false);
  env.now += MIN;
  assert.strictEqual(recorder.stopRecording().durationMs, MIN);
  env.spawned = [];
});

check('the own ongoing notification when the shell has no notify.actions', function (recorder, env, phone) {
  env.features = [];
  recorder.startRecording({ mode: 'meeting' });
  var o = phone.notices[0];
  assert.strictEqual(o.title, 'Идёт запись');
  assert.deepStrictEqual(o.actions.map(function (a) { return a.act; }), ['pause', 'mark', 'stop']);
  recorder.fromNotice({ act: 'pause' });
  assert.ok(/^Запись на паузе/.test(phone.notices[1].title));
  recorder.fromNotice({ act: 'resume' });
  recorder.fromNotice({ act: 'stop' });
  assert.ok(phone.notices.indexOf('cancel') >= 0);
  assert.strictEqual(recorder.status().recording, null);
  env.spawned = [];
});

check('the microphone is busy with a live conversation: no recording', function (recorder, env) {
  env.liveActive = true;
  assert.throws(function () { recorder.startRecording({}); }, /живой разговор/);
  env.liveActive = false;
  env.permission = false;
  assert.throws(function () { recorder.startRecording({}); }, /микрофону/);
});

check('transcription waits for the charger when the setting says so', function (recorder, env, phone) {
  recorder.saveSettings({ transcribeWhen: 'charging' });
  hearing(env, { '*': MEETING_2 });
  var done = recordMeeting(recorder, env, phone);
  env.drain();
  assert.strictEqual(recorder.item(done.id).state, 'transcribing');
  assert.strictEqual(recorder.status().queue.waiting, 2);
  recorder.onPower({ charging: true });
  env.drain();
  assert.strictEqual(recorder.item(done.id).state, 'ready');
});

check('without the speech model the parts wait and the screen is told why', function (recorder, env, phone) {
  env.speechReady = false;
  hearing(env, { '*': MEETING_2 });
  var done = recordMeeting(recorder, env, phone);
  env.drain();
  var it = recorder.item(done.id);
  assert.strictEqual(it.state, 'transcribing');
  assert.ok(/модель распознавания/.test(it.progress), it.progress);
  env.speechReady = true;
  recorder.retry(done.id);
  env.drain();
  assert.strictEqual(recorder.item(done.id).state, 'ready');
});

check('a part that fails twice is left with its error; the rest makes the summary', function (recorder, env, phone) {
  hearing(env, { 'part-001.m4a': function () { throw new Error('битый файл'); }, 'part-002.m4a': MEETING_2 });
  var done = recordMeeting(recorder, env, phone);
  env.drain();
  var it = recorder.item(done.id);
  assert.strictEqual(it.state, 'ready');
  assert.strictEqual(it.segments[0].state, 'failed');
  assert.strictEqual(it.segments[0].error, 'битый файл');
  assert.strictEqual(it.summary.gaps, 1);
  hearing(env, { '*': function () { throw new Error('нет звука'); } });
  var two = recordMeeting(recorder, env, phone);
  env.drain();
  assert.strictEqual(recorder.item(two.id).state, 'failed');
  assert.ok(/нет звука/.test(recorder.item(two.id).error));
});

check('an old shell without segments: the text of a part as one string', function (recorder, env, phone) {
  env.features = ['notify.actions'];
  hearing(env, { '*': MEETING_2 });
  var done = recordMeeting(recorder, env, phone);
  env.drain();
  var it = recorder.item(done.id);
  assert.strictEqual(it.paragraphs.length, 2);
  assert.strictEqual(it.paragraphs[1].atMs, 2 * MIN);
  assert.strictEqual(it.state, 'ready');
});

check('a long shared file is cut into parts and transcribed; it is offered once', function (recorder, env, phone) {
  fs.mkdirSync(path.join(env.dir, 'data/uploads'), { recursive: true });
  fs.writeFileSync(path.join(env.dir, 'data/uploads/lecture.m4a'), 'lecture');
  fs.writeFileSync(path.join(env.dir, 'data/uploads/photo.jpg'), 'x');
  phone.durations['lecture.m4a'] = 22 * MIN;
  hearing(env, { '*': [{ startMs: 0, endMs: 5000, text: 'сегодня поговорим о квантовой механике' }] });
  assert.deepStrictEqual(recorder.uploads().map(function (u) { return u.name; }), ['lecture.m4a']);
  var id = recorder.importFile('data/uploads/lecture.m4a', { mode: 'lecture' });
  env.drain();
  var it = recorder.item(id);
  assert.strictEqual(it.state, 'ready', it.error);
  assert.strictEqual(it.kind, 'lecture');
  assert.strictEqual(it.mode, 'import');
  assert.deepStrictEqual(it.segments.map(function (g) { return g.offsetMs / MIN; }), [0, 5, 10, 15, 20]);
  assert.strictEqual(it.durationMs, 22 * MIN);
  assert.strictEqual(recorder.uploads()[0].recordingId, id);
  assert.strictEqual(recorder.status().uploads, 0);
  assert.strictEqual(engine0(env).find({ kind: 'event', source: 'recorder' })[0].tags[0], 'лекция');
});

check('a long file that only ffmpeg could cut: an honest error', function (recorder, env, phone) {
  fs.mkdirSync(path.join(env.dir, 'data/uploads'), { recursive: true });
  fs.writeFileSync(path.join(env.dir, 'data/uploads/talk.flac'), 'flac');
  phone.durations['talk.flac'] = 90 * MIN;
  phone.cutResult = null;
  var id = recorder.importFile('data/uploads/talk.flac');
  env.drain();
  var it = recorder.item(id);
  assert.strictEqual(it.state, 'failed');
  assert.ok(/ffmpeg/.test(it.error), it.error);
});

check('a short file picked on the screen comes in pieces and is transcribed whole', function (recorder, env, phone) {
  hearing(env, { '*': [{ startMs: 0, endMs: 3000, text: 'голосовое сообщение про отпуск' }] });
  var token = recorder.importBegin('voice.ogg');
  recorder.importChunk(token, Buffer.from('Ogg').toString('base64'));
  recorder.importChunk(token, Buffer.from('Sabc').toString('base64'));
  phone.durations = new Proxy({}, { get: function () { return 40000; } });
  var id = recorder.importEnd(token, { mode: 'auto' });
  env.drain();
  var it = recorder.item(id);
  assert.strictEqual(it.state, 'ready', it.error);
  assert.strictEqual(it.kind, 'note');
  assert.strictEqual(it.sourceName, 'voice.ogg');
  assert.strictEqual(fs.readFileSync(path.join(env.dir, it.segments[0].file), 'utf8'), 'OggSabc');
  assert.strictEqual(fs.readdirSync(path.join(env.dir, 'data/recorder/incoming')).length, 0, 'the incoming copy is removed');
  assert.throws(function () { recorder.importBegin('photo.jpg'); }, /аудиофайл/);
});

check('a file whose length the phone cannot read: the length comes from the last phrase', function (recorder, env, phone) {
  hearing(env, { '*': [{ startMs: 0, endMs: 3000, text: 'первая фраза' }, { startMs: 5000, endMs: 12500, text: 'и вторая подлиннее' }] });
  fs.mkdirSync(path.join(env.dir, 'data/uploads'), { recursive: true });
  fs.writeFileSync(path.join(env.dir, 'data/uploads/odd.amr'), 'amr');
  var id = recorder.importFile('data/uploads/odd.amr', { mode: 'auto' });
  env.drain();
  var it = recorder.item(id);
  assert.strictEqual(it.state, 'ready', it.error);
  assert.strictEqual(it.durationMs, 12500);
  assert.strictEqual(it.segments[0].durationMs, 12500);
  assert.strictEqual(it.kind, 'note');
});

check('after a crash: what was written goes to the queue, the wake word comes back', function (recorder, env, phone) {
  env.wake.on = true;
  hearing(env, { '*': MEETING_2 });
  recorder.startRecording({ mode: 'meeting' });
  env.now += 3 * MIN;
  env.sleepBudget = 15000;
  env.drain(1);   // the ticker writes the state down
  var st = JSON.parse(fs.readFileSync(path.join(env.dir, 'data/recorder/state.json'), 'utf8'));
  assert.ok(st.lastActive >= 3 * MIN);
  // The process went down: the live state is gone, the files stay.
  global.__recorderLive.rec = null;
  env.spawned = [];
  env.sleepBudget = 0;
  recorder.start();
  env.drain();
  assert.deepStrictEqual(env.wakeSets, [false, true]);
  var it = recorder.list({})[0];
  assert.strictEqual(it.state, 'ready', it.error);
  assert.ok(/прервалась/.test(it.error), it.error);
  assert.ok(!fs.existsSync(path.join(env.dir, 'data/recorder/state.json')));
});

check('old sound goes at night, the kept one stays; removal takes everything', function (recorder, env, phone) {
  hearing(env, { '*': MEETING_2 });
  var a = recordMeeting(recorder, env, phone);
  var b = recordMeeting(recorder, env, phone);
  env.drain();
  recorder.keepAudio(b.id, true);
  env.now += 31 * DAY;
  assert.deepStrictEqual(recorder.clean(), { audioRemoved: 1 });
  var ia = recorder.item(a.id);
  assert.ok(ia.audioRemoved);
  assert.strictEqual(ia.segments[0].url, null);
  assert.ok(!fs.existsSync(path.join(env.dir, 'data/recorder/' + a.id + '/part-001.m4a')));
  assert.ok(fs.existsSync(path.join(env.dir, 'data/recorder/' + b.id + '/part-001.m4a')));
  assert.ok(ia.paragraphs.length > 0, 'the text stays');
  recorder.remove(b.id);
  assert.ok(!fs.existsSync(path.join(env.dir, 'data/recorder/' + b.id)));
  assert.strictEqual(engine0(env).find({ kind: 'event', source: 'recorder' }).length, 1);
  assert.strictEqual(env.memory.items.length, 1);
  assert.strictEqual(recorder.search('смету').length, 1);
  assert.throws(function () { recorder.item(b.id); });
});

check('marks, tasks and the summary text for sharing', function (recorder, env, phone) {
  hearing(env, { 'part-001.m4a': MEETING_1, 'part-002.m4a': MEETING_2 });
  var done = recordMeeting(recorder, env, phone);
  env.drain();
  var m = recorder.addMark(done.id, 90000, 'вопрос');
  recorder.setMark(m, 'главный вопрос');
  assert.strictEqual(recorder.item(done.id).marks.filter(function (x) { return x.id === m; })[0].label, 'главный вопрос');
  recorder.removeMark(m);
  var t = recorder.addTask(done.id, { text: 'Позвонить прорабу', due: '2026-11-18' });
  recorder.setTask(t, { who: 'владелец' });
  assert.ok(/\[ \] Позвонить прорабу — владелец, до 2026-11-18/.test(recorder.summaryText(done.id)));
  recorder.share(done.id);
  assert.ok(/^Встреча/.test(env.shared[0]));
  recorder.removeTask(t);
  assert.strictEqual(recorder.openTasks().length, 2);
});

check('settings are kept as the difference and checked', function (recorder) {
  var s = recorder.saveSettings({ partMinutes: 0, words: 'Олег, Битрикс', cleanAt: '03:15' });
  assert.strictEqual(s.partMinutes, 1);
  assert.deepStrictEqual(recorder.settings().values.words, ['Олег', 'Битрикс']);
  var st = recorder.status();
  assert.strictEqual(st.features.actions, true);
  assert.strictEqual(st.models.summary, null);
});

check('«Ни одной задачи не потерял»: without Ачивки the item waits in the shared box, once', function (recorder, env, phone, engine) {
  recorder.saveSettings({ keptTasksMin: 2, keptTasksDays: 30 });
  var a = recorder.addTask(1, { text: 'Отправить смету', due: '2026-11-10' });
  var b = recorder.addTask(1, { text: 'Позвонить Олегу', due: '2026-11-12' });
  recorder.addTask(1, { text: 'Без срока' });
  recorder.addTask(1, { text: 'Срок впереди', due: '2026-11-20' });
  var files = engine.require('lib/assi').files;
  recorder.setTask(a, { done: true });
  assert.strictEqual(files.exists('data/games/achievements-outbox.json'), false, 'one task is still open');
  recorder.setTask(b, { done: true });
  var box = files.readJson('data/games/achievements-outbox.json', []);
  assert.deepStrictEqual(box.map(function (i) { return i.key; }), ['recorder/no-task-lost']);
  assert.strictEqual(box[0].category, 'Жизнь');
  recorder.setTask(b, { done: false });
  recorder.setTask(b, { done: true });
  recorder.clean();
  assert.strictEqual(files.readJson('data/games/achievements-outbox.json', []).length, 1, 'handed in once');
});

check('«Ни одной задачи не потерял»: with Ачивки it goes to their grant()', function (recorder, env, phone, engine) {
  var dir = path.join(env.dir, 'modules/achievements');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'main.js'), 'exports.got = [];\nexports.grant = function (item) { exports.got.push(item); return { ok: true }; };\n');
  recorder.saveSettings({ keptTasksMin: 1 });
  var a = recorder.addTask(1, { text: 'Отправить смету', due: '2026-11-13' });
  recorder.setTask(a, { done: true });
  var achievements = engine.require('modules/achievements/main.js');
  assert.strictEqual(achievements.got.length, 1);
  assert.strictEqual(achievements.got[0].key, 'recorder/no-task-lost');
  assert.strictEqual(engine.require('lib/assi').files.exists('data/games/achievements-outbox.json'), false);
});

console.log('engine: ' + passed + ' passed, ' + failed + ' failed');
if (failed) process.exitCode = 1;
