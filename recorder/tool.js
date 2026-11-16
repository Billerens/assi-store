// The agents' tool "recorder": start a recording by voice («запиши встречу», «запиши мысль»), find
// in the archive («что мы решили с Олегом?», «найди запись про отпуск»), the open tasks, a shared
// audio file into the archive. The module puts a stub tools/recorder.js into the workspace that
// points here (see installTool in main.js).
var text = require('./logic/text.js');

exports.name = 'recorder';
exports.description = 'Диктофон владельца: записи встреч, лекций и мыслей вслух, расшифрованные на телефоне, с конспектами, решениями и задачами. ' +
  'start — начать запись (mode: meeting — встреча, note — мысль, lecture — лекция, auto — по длине); во время записи микрофон занят, ' +
  'поэтому голосом её не остановить — владелец нажимает «Стоп» на экране или в уведомлении (из текстового чата можно stop). ' +
  'search — найти в архиве по словам и по смыслу («что решили с Олегом про сроки ремонта») — отвечайте по найденному куску со ссылкой на время в записи; ' +
  'item — конспект записи целиком (id из search или last); last — последние записи; tasks — открытые задачи из записей; done — отметить задачу сделанной; ' +
  'import — расшифровать аудиофайл, который владелец прислал («Поделиться» кладёт его в data/uploads/…); status — что идёт сейчас.';
exports.parameters = {
  type: 'object',
  properties: {
    action: { type: 'string', enum: ['start', 'stop', 'pause', 'resume', 'mark', 'status', 'search', 'item', 'last', 'tasks', 'done', 'import'] },
    mode: { type: 'string', enum: ['auto', 'meeting', 'note', 'lecture'], description: 'start, import — вид записи' },
    title: { type: 'string', description: 'start, import — заголовок, если владелец назвал' },
    query: { type: 'string', description: 'search — что искать' },
    id: { type: 'number', description: 'item — номер записи; done — номер задачи' },
    count: { type: 'number', description: 'last — сколько записей (по умолчанию 5)' },
    label: { type: 'string', description: 'mark — подпись отметки' },
    path: { type: 'string', description: 'import — путь файла в рабочей папке: data/uploads/…' }
  },
  required: ['action']
};

function when(time) {
  var d = new Date(time);
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  return pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.' + d.getFullYear() + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}

var STATES = { recording: 'идёт запись', importing: 'принимаю файл', transcribing: 'расшифровывается', summarizing: 'собирается конспект', ready: 'готово', failed: 'ошибка' };

function line(c) {
  return '#' + c.id + ' ' + when(c.startedAt) + ' «' + c.title + '», ' + text.length(c.durationMs) + (c.state !== 'ready' ? ' (' + (STATES[c.state] || c.state) + ')' : '') +
    (c.openTasks ? ', открытых задач: ' + c.openTasks : '') + (c.firstLine ? ' — ' + c.firstLine : '');
}

exports.run = function (args) {
  var recorder = require('modules/recorder/main.js');
  args = args || {};
  var a = args.action;
  if (a === 'start') {
    var st = recorder.startRecording({ mode: args.mode, title: args.title });
    return 'Запись идёт (№' + st.recording.id + '). Голосом её не остановить: «Стоп» — на экране Диктофона или в уведомлении.';
  }
  if (a === 'stop') {
    var done = recorder.stopRecording();
    return done ? 'Запись №' + done.id + ' остановлена (' + text.length(done.durationMs) + '): расшифровка и конспект — по готовности придёт уведомление.' : 'Сейчас ничего не записывается.';
  }
  if (a === 'pause') { recorder.pauseRecording('owner'); return 'Пауза.'; }
  if (a === 'resume') { recorder.resumeRecording(); return 'Запись продолжается.'; }
  if (a === 'mark') { var m = recorder.mark(args.label); return 'Отметка на ' + text.clock(m.atMs) + '.'; }
  if (a === 'status') {
    var s = recorder.status();
    var out = [];
    out.push(s.recording ? 'Идёт запись №' + s.recording.id + ': ' + text.length(s.recording.activeMs) + (s.recording.paused ? ', на паузе' : '') : 'Сейчас не записывается.');
    if (s.queue.waiting) out.push('В очереди на расшифровку отрезков: ' + s.queue.waiting + (s.transcribeWhen === 'charging' && !s.charging ? ' (ждут зарядки)' : '') + '.');
    if (!s.speech.ready) out.push('Модель распознавания речи не скачана — её скачивают в настройках Assi.');
    return out.join(' ');
  }
  if (a === 'search') {
    if (!args.query) return 'Нужно, что искать (query).';
    var found = recorder.search(args.query, { limit: 8 });
    if (!found.length) return 'В архиве Диктофона ничего не нашлось по «' + args.query + '».';
    return found.map(function (c) {
      return line(c) + (c.hit && c.hit.offsetMs !== null ? '\n   на ' + text.clock(c.hit.offsetMs) + ': «' + c.hit.snippet + '»' : '');
    }).join('\n') + '\nКонспект целиком — action item с id.';
  }
  if (a === 'item') {
    if (!args.id) return 'Нужен id записи.';
    return recorder.summaryText(args.id);
  }
  if (a === 'last') {
    var list = recorder.recent(args.count || 5);
    return list.length ? list.map(line).join('\n') : 'Записей пока нет.';
  }
  if (a === 'tasks') {
    var tasks = recorder.openTasks();
    if (!tasks.length) return 'Открытых задач из записей нет.';
    return tasks.map(function (t) {
      return 'задача #' + t.id + ': ' + t.text + (t.who ? ' — ' + t.who : '') + (t.due ? ', до ' + t.due : '') + ' (из «' + t.recordingTitle + '», ' + when(t.startedAt) + ')';
    }).join('\n');
  }
  if (a === 'done') {
    if (!args.id) return 'Нужен id задачи.';
    recorder.setTask(args.id, { done: true });
    return 'Задача #' + args.id + ' отмечена сделанной.';
  }
  if (a === 'import') {
    if (!args.path) return 'Нужен путь файла (path).';
    var id = recorder.importFile(args.path, { mode: args.mode, title: args.title });
    return 'Файл принят как запись №' + id + ': расшифровка идёт в фоне, по готовности конспекта придёт уведомление.';
  }
  return 'Неизвестное действие: ' + a;
};
