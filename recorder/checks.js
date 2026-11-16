// Checks of the Диктофон on the phone (module_check recorder). They make their own recordings —
// a file the phone's voice speaks (speech.render), a few seconds from the microphone — run them
// through the module's own way (parts, the queue, speech.transcribe, the archive, search) with
// models, notifications, commands, memory and vectors switched off for their time, and remove
// all of it afterwards: the recordings with their files, chunks and the shared base records, the
// check's settings (the owner's own come back as they were).
var SCREEN = 'modules/recorder/ui/index.html';
var ITEM = 'modules/recorder/ui/item.html';
var SETTINGS = 'data/recorder/settings.json';

var assi = require('lib/assi');
var files = assi.files;

function recorder() {
  return require('modules/recorder/main.js');
}

var stamp = String(Date.now()).slice(-6);

function has(feature) {
  try {
    var list = native('shell.features');
    for (var i = 0; i < list.length; i++) if (String(list[i]) === feature) return true;
  } catch (error) { /* an old shell */ }
  return false;
}

function granted(permission) {
  try {
    return Number(context.checkSelfPermission('android.permission.' + permission)) === 0;
  } catch (error) {
    return false;
  }
}

/** Runs fn with the check's settings; the owner's file comes back exactly as it was. */
function quietly(fn, extra) {
  var had = files.exists(SETTINGS);
  var before = had ? files.read(SETTINGS) : null;
  var patch = { notifyReady: false, commands: false, memory: false, embed: false, cleanModel: 'off', noteModel: 'off', summaryModel: 'off', transcribeWhen: 'now', announce: false };
  Object.keys(extra || {}).forEach(function (k) { patch[k] = extra[k]; });
  recorder().saveSettings(patch);
  try {
    return fn();
  } finally {
    // The patch leaves cleanAt alone, so the night job stays as it was: only the file comes back.
    if (had) files.write(SETTINGS, before);
    else files.remove(SETTINGS);
  }
}

/** Waits until the recording is ready or failed (the queue works in the background). */
function settle(t, id, maxMs) {
  var until = Date.now() + maxMs;
  var it = recorder().item(id);
  while (Date.now() < until && ['ready', 'failed'].indexOf(String(it.state)) < 0) {
    t.wait(500);
    it = recorder().item(id);
  }
  return it;
}

function baseRecords(id) {
  return require('lib/base').find({ source: 'recorder', limit: 200 }).filter(function (r) { return r.data && Number(r.data.recordingId) === Number(id); });
}

function drop(id) {
  if (!id) return;
  try { recorder().remove(id); } catch (error) { /* gone */ }
  try { baseRecords(id).forEach(function (r) { require('lib/base').remove(r.id); }); } catch (error) { /* none */ }
}

exports['настройки: числа в границах, словарь списком'] = function (t) {
  var s = require('modules/recorder/logic/settings.js');
  var n = s.normalize({ partMinutes: 999, noteMaxMinutes: -1, source: 'NOPE', words: 'Олег, Битрикс24; олег', cleanAt: '7:05' });
  t.equal(n.partMinutes, 30, 'отрезок не длиннее 30 мин');
  t.equal(n.noteMaxMinutes, 0.5, 'порог не меньше 0,5');
  t.equal(n.source, 'MIC', 'неизвестный источник — по умолчанию');
  t.equal(n.words, ['Олег', 'Битрикс24'], 'словарь');
  t.equal(n.cleanAt, '07:05', 'время');
  t.equal(s.diff(s.normalize({})), {}, 'по умолчанию в файле пусто');
};

exports['разбор речи в движке: числа, даты, поручения'] = function (t) {
  var extract = require('modules/recorder/logic/extract.js');
  t.equal(extract.digits('две тысячи пятьсот'), '2500', 'числа словами');
  var now = new Date(2026, 10, 14, 10, 0).getTime();
  var cmd = extract.command('напиши пете что опоздаю минут на десять', now);
  t.equal(cmd && cmd.kind, 'message', 'поручение написать');
  t.ok(cmd.names.indexOf('Петя') >= 0, 'имя в начальной форме: ' + cmd.names.join(', '));
  var spend = extract.command('потратил пятьсот на такси', now);
  t.equal(spend && spend.amount, 500, 'трата');
  var w = extract.when('завтра в 9', now);
  t.equal(w && w.date, '2026-11-15', 'завтра');
  t.equal(w && w.time, '09:00', 'в 9');
  var sum = extract.summarize([{ atMs: 0, text: 'Решили перенести сдачу на пятницу.' }, { atMs: 60000, text: 'Олег до среды пришлёт смету.' }], { now: now });
  t.equal(sum.decisions.length, 1, 'решение');
  t.equal(sum.tasks.length, 1, 'задача');
  t.equal(sum.tasks[0].who, 'Олег', 'кто');
};

exports['файл: голос телефона → отрезок → текст → архив и поиск → удаление'] = function (t) {
  if (!has('speech.render')) t.skip('в оболочке нет speech.render — нечем сделать проверочный файл');
  var sp = native('speech.status') || {};
  if (sp.ready === false) t.skip('модель распознавания речи не скачана');
  var rel = 'data/recorder/check-' + stamp + '.wav';
  var made = String(assi.speech.render('Проверка диктофона. Завтра купить хлеб и молоко, а потом позвонить Олегу.', files.path(rel), 'local'));
  var root = String(files.path('')).replace(/\/+$/, '');
  var path = made.indexOf(root) === 0 ? made.slice(root.length).replace(/^\/+/, '') : rel;
  var id = null;
  var word = null;
  try {
    t.ok(files.exists(path), 'файл озвучен: ' + path);
    quietly(function () {
      id = recorder().importFile(path, { mode: 'note', wait: true, name: 'проверка.wav' });
      var it = settle(t, id, 45000);
      t.equal(it.state, 'ready', 'запись готова' + (it.error ? ' (' + it.error + ')' : ''));
      t.ok(it.segments.length >= 1, 'отрезки');
      var all = it.paragraphs.map(function (p) { return p.text; }).join(' ');
      t.ok(/провер|хлеб|молок|олег/i.test(all), 'расшифровка похожа на сказанное: ' + all);
      t.equal(it.kind, 'note', 'вид — мысль');
      word = (all.toLowerCase().match(/[а-яё]{5,}/g) || [])[0];
      t.ok(word, 'есть слово для поиска');
      var found = recorder().search(word, {});
      t.ok(found.some(function (c) { return c.id === id; }), 'поиск находит «' + word + '»');
      var page = t.screen(ITEM + '?id=' + id);
      t.wait(500);
      t.ok(String(page.text('#title')).length > 0, 'заголовок на экране записи');
      t.ok(page.count('#transcript .para') >= 1, 'расшифровка на экране');
      t.ok(page.count('#player:not([hidden])') === 1, 'плеер на экране');
    }, { base: true });
    t.equal(baseRecords(id).length, 1, 'запись в общей базе');
  } finally {
    drop(id);
    files.remove(path);
    if (path !== rel) files.remove(rel);
  }
  t.equal(baseRecords(id).length, 0, 'запись в базе удалена');
  t.ok(!files.exists('data/recorder/' + id), 'папка записи удалена');
  t.ok(recorder().search(word, {}).every(function (c) { return c.id !== id; }), 'поиск её больше не находит');
};

exports['микрофон: 3 секунды записи, имя на это время не слушается'] = function (t) {
  if (!granted('RECORD_AUDIO')) t.skip('нет доступа к микрофону — Assi спросит его при первой записи');
  var st = recorder().status();
  if (st.recording) t.skip('идёт запись владельца');
  if (st.speech.live) t.skip('идёт живой разговор — микрофон занят');
  var wakeBefore = st.wake ? st.wake.on : null;
  var id = null;
  try {
    quietly(function () {
      var started = recorder().startRecording({ mode: 'note', title: 'Проверка ' + stamp });
      id = started.recording.id;
      t.ok(started.recording && !started.recording.paused, 'запись идёт');
      if (wakeBefore) t.equal(Boolean(native('wake.status').on), false, 'имя не слушается во время записи');
      t.wait(1500);
      var mark = recorder().mark('проверка');
      t.ok(mark.atMs >= 500, 'отметка на секунде записи');
      t.wait(1500);
      var done = recorder().stopRecording();
      t.ok(done && done.durationMs >= 2500, 'длина записи ' + (done && done.durationMs));
      t.equal(recorder().status().recording, null, 'запись остановлена');
      if (wakeBefore !== null) t.equal(Boolean(native('wake.status').on), Boolean(wakeBefore), 'слушание имени вернулось как было');
      var it = recorder().item(id);
      t.ok(it.segments.length === 1, 'один отрезок');
      t.ok(it.segments[0].durationMs > 0, 'длина отрезка по файлу');
      t.equal(it.marks.length, 1, 'отметка сохранена');
      t.ok(files.exists(it.segments[0].file), 'файл отрезка на месте');
      if ((native('speech.status') || {}).ready === false) {
        // Without the speech model the part waits for it, and the recording says so.
        t.wait(1500);
        it = recorder().item(id);
        t.equal(String(it.state), 'transcribing', 'без модели запись ждёт расшифровки');
        t.ok(/модел/i.test(String(it.progress || '')), 'и говорит, что ждёт модель: ' + it.progress);
      } else {
        it = settle(t, id, 30000);
        t.ok(['ready', 'failed'].indexOf(String(it.state)) >= 0, 'очередь прошла: ' + it.state + (it.error ? ' (' + it.error + ')' : ''));
      }
    }, { base: false });
  } finally {
    if (recorder().status().recording) recorder().stopRecording();
    drop(id);
  }
  t.ok(!files.exists('data/recorder/' + id), 'запись удалена');
};

exports['экран: вкладки, кнопка записи, архив и настройки'] = function (t) {
  var page = t.screen(SCREEN + '?tab=record');
  t.equal(page.count('.tabs .chip'), 3, 'вкладок');
  t.wait(500);
  t.ok(page.count('#controls .round') >= 1, 'кнопка записи');
  t.equal(page.count('#modes .chip'), 4, 'режимы');
  page.click('.tabs .chip[data-id="archive"]');
  t.wait(600);
  t.ok(page.count('#archive .list, #archive .empty') === 1, 'архив нарисован');
  page.click('.tabs .chip[data-id="settings"]');
  t.wait(800);
  t.ok(page.count('#settings .set-group') >= 6, 'настройки нарисованы');
  page.click('.tabs .chip[data-id="record"]');
};

exports['инструмент голоса на месте'] = function (t) {
  t.ok(files.exists('tools/recorder.js'), 'заглушка tools/recorder.js');
  var tool = require('tools/recorder.js');
  t.equal(tool.name, 'recorder', 'имя инструмента');
  t.ok(/записыва/.test(tool.run({ action: 'status' })), 'состояние голосом');
  t.ok(typeof tool.run({ action: 'search', query: 'проверка' + stamp }) === 'string', 'поиск голосом');
};

exports['виджет считается'] = function (t) {
  var w = recorder().widget();
  t.ok(w && w.title, 'заголовок виджета');
  t.ok(String(w.open).indexOf('modules/recorder/ui/') === 0, 'нажатие открывает экран');
};
