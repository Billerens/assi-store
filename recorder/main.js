// Диктофон с конспектом: a recording of a meeting, a lecture or a thought aloud — in parts through
// MediaRecorder in the engine, transcribed on the phone (speech.transcribe, GigaAM) part by part
// while the recording goes on, cleaned, turned into a summary with decisions and tasks (or, for a
// short thought, into a title, tags and maybe a command: a draft in Входящие, an expense in Траты,
// a reminder), kept in an archive with search by words and by meaning, in the long memory and the
// shared base. Every step works without a model: the code cleans and extracts what it can, a model
// does it better. The description: docs/modules/recorder.md in Axiko.
var axiko = require('lib/axiko');
var settingsLib = require('./logic/settings.js');
var text = require('./logic/text.js');
var extract = require('./logic/extract.js');
var prompts = require('./logic/prompts.js');
var parts = require('./logic/parts.js');
var awards = require('./logic/awards.js');
var achieve = require('./achieve.js');

var SELF = 'modules/recorder/main.js';
var SCREEN = 'modules/recorder/ui/index.html';
var ITEM = 'modules/recorder/ui/item.html';
var DIR = 'data/recorder';
var SETTINGS = DIR + '/settings.json';
var STATE = DIR + '/state.json';
var IMPORTED = DIR + '/imported.json';
var ACHIEVED = DIR + '/achievements.json';
var TOOL_PATH = 'tools/recorder.js';
var TOOL_MARK = '// Инструмент модуля «Диктофон»';
var NOTICE_ID = 'recorder.rec';
var OWN_NOTICE = 7300;
var MODES = ['auto', 'meeting', 'note', 'lecture'];
var KIND_TITLE = { meeting: 'Встреча', note: 'Мысль', lecture: 'Лекция' };

var G = typeof global !== 'undefined' ? global : (function () { return this; })();
var LIVE = G.__recorderLive || (G.__recorderLive = {
  lock: new java.util.concurrent.locks.ReentrantLock(),
  rec: null, queueBusy: false, queueAgain: false, processing: {}, force: {}, charging: null,
  features: null, featuresAt: 0, uploads: {}, widgetAt: 0
});

function locked(fn) {
  LIVE.lock.lock();
  try {
    return fn();
  } finally {
    LIVE.lock.unlock();
  }
}

function message(error) {
  if (!error) return 'ошибка';
  if (error.javaException && error.javaException.getMessage) return String(error.javaException.getMessage());
  return error.message ? String(error.message) : String(error);
}

function phone() {
  return require('./android.js');
}

function optional(path) {
  try {
    return axiko.files.exists(path) ? require(path) : null;
  } catch (error) {
    console.warn('recorder: ' + path + ': ' + message(error));
    return null;
  }
}

// ---- the database ------------------------------------------------------------------------------

var db = axiko.db('recorder');

function columns(table) {
  return db.query('pragma table_info(' + table + ')').map(function (c) { return c.name; });
}

function addColumns(table, wanted) {
  var have = columns(table);
  Object.keys(wanted).forEach(function (name) {
    if (have.indexOf(name) < 0) db.exec('alter table ' + table + ' add column ' + name + ' ' + wanted[name]);
  });
}

db.exec('create table if not exists recordings (id integer primary key autoincrement, title text, mode text, startedAt integer, ' +
  'durationMs integer, parts integer, state text, error text, summary text, command text, tags text, people text, ' +
  'audioKept integer default 0, memoryId integer, baseId integer, created integer, edited integer)');
addColumns('recordings', { kind: 'text', origin: 'text', sourceName: 'text', audioRemoved: 'integer', progress: 'text', commandState: 'text',
  link: 'text', linkTags: 'text' });
db.exec('create table if not exists segments (id integer primary key autoincrement, recordingId integer, n integer, offsetMs integer, ' +
  'durationMs integer, file text, raw text, text text, transcribeMs integer)');
addColumns('segments', { phrases: 'text', state: 'text', error: 'text', tries: 'integer default 0', cleanedBy: 'text' });
db.exec('create index if not exists segments_recording on segments (recordingId, n)');
db.exec('create virtual table if not exists chunks using fts4(recordingId, offsetMs, text, tokenize=unicode61)');
db.exec('create table if not exists vectors (chunkId integer primary key, vector text)');
db.exec('create table if not exists marks (id integer primary key autoincrement, recordingId integer, atMs integer, label text)');
db.exec('create table if not exists tasks (id integer primary key autoincrement, recordingId integer, text text, who text, due text, ' +
  'done integer default 0, calendarEventId integer)');
addColumns('tasks', { atMs: 'integer', remindAt: 'integer', proposed: 'integer default 0', created: 'integer' });

function row(id) {
  return db.query('select * from recordings where id = ?', [id])[0] || null;
}

function json(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  try { return JSON.parse(value); } catch (error) { return fallback; }
}

function segmentsOf(id) {
  return db.query('select * from segments where recordingId = ? order by n', [id]);
}

function tasksOf(id) {
  return db.query('select * from tasks where recordingId = ? order by id', [id]).map(function (t) {
    return { id: t.id, recordingId: t.recordingId, text: t.text, who: t.who, due: t.due, done: Boolean(t.done), atMs: t.atMs,
      calendarEventId: t.calendarEventId, remindAt: t.remindAt, proposed: Boolean(t.proposed) };
  });
}

function marksOf(id) {
  return db.query('select * from marks where recordingId = ? order by atMs', [id]);
}

// ---- settings and what the shell can -------------------------------------------------------------

function settings() {
  return settingsLib.normalize(axiko.files.readJson(SETTINGS, {}));
}

function features() {
  if (LIVE.features && Date.now() - LIVE.featuresAt < 60000) return LIVE.features;
  try {
    LIVE.features = js(native('shell.features')) || [];
  } catch (error) {
    LIVE.features = [];
  }
  LIVE.featuresAt = Date.now();
  return LIVE.features;
}

function has(name) {
  return features().indexOf(name) >= 0;
}

function granted(permission) {
  try {
    return Number(context.checkSelfPermission('android.permission.' + permission)) === 0;
  } catch (error) {
    return false;
  }
}

function ask(permissions) {
  if (permissions.every(granted)) return true;
  if (!host.activity) return false;
  return Boolean(axiko.permission(permissions));
}

/** The model of a role, when the setting lets it work: { provider, local } or null. */
function modelFor(role, policy) {
  if (policy === 'off') return null;
  var m;
  try {
    m = native('models.resolve', role);
  } catch (error) {
    return null;
  }
  if (!m || !m.provider) return null;
  var local = String(m.provider) === 'local' || /^local:/.test(String(m.baseUrl || ''));
  if (policy === 'local' && !local) return null;
  return { provider: String(m.provider), model: m.model ? String(m.model) : null, local: local };
}

function askModel(role, system, prompt, asJson) {
  return require('lib/ai').ask({ role: role, system: system, prompt: prompt, json: Boolean(asJson) });
}

function speech() {
  try {
    return native('speech.status') || {};
  } catch (error) {
    return {};
  }
}

function charging() {
  if (LIVE.charging === null) {
    try { LIVE.charging = phone().charging(); } catch (error) { LIVE.charging = false; }
  }
  return LIVE.charging;
}

// ---- small helpers ---------------------------------------------------------------------------------

function changed(type, id) {
  emit('recorder.changed', { type: type, id: id || null });
  refreshWidget();
}

function refreshWidget() {
  if (Date.now() - LIVE.widgetAt < 3000) return;
  LIVE.widgetAt = Date.now();
  try { axiko.widget.refresh('recorder'); } catch (error) { /* no widget */ }
}

function setState(id, state, extra) {
  var fields = extra || {};
  var sets = ['state = ?'];
  var args = [state];
  Object.keys(fields).forEach(function (k) {
    sets.push(k + ' = ?');
    args.push(fields[k]);
  });
  args.push(id);
  db.exec('update recordings set ' + sets.join(', ') + ' where id = ?', args);
  changed('state', id);
}

function progress(id, words) {
  db.exec('update recordings set progress = ? where id = ?', [words, id]);
  emit('recorder.changed', { type: 'progress', id: id, progress: words });
}

function tell(title, body, open, quiet) {
  try {
    return axiko.notify({ title: title, text: body, open: open || SCREEN, channel: quiet ? 'quiet' : undefined });
  } catch (error) {
    console.warn('recorder: notify: ' + message(error));
    return null;
  }
}

function dirOf(id) {
  return DIR + '/' + id;
}

function mkdirs(rel) {
  new java.io.File(String(axiko.files.path(rel))).mkdirs();
}

function dateText(time) {
  var d = new Date(time);
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  return pad(d.getDate()) + '.' + pad(d.getMonth() + 1);
}

function audioUrl(file) {
  return file ? '/' + String(file).replace(/^\/+/, '') : null;
}

// ---- the recording -----------------------------------------------------------------------------------

function activeNow(rec) {
  return parts.activeMs(rec, Date.now());
}

function saveState(rec) {
  axiko.files.writeJson(STATE, {
    id: rec.id, startedAt: rec.startedAt, pausedMs: rec.pausedMs, pausedAt: rec.pausedAt, paused: rec.paused, n: rec.n,
    partStartActive: rec.partStartActive, wakeWas: rec.wakeWas, mode: rec.mode, splitMode: rec.splitMode,
    lastActive: activeNow(rec), savedAt: Date.now()
  });
}

function clearState() {
  axiko.files.remove(STATE);
}

function wakeOff() {
  try {
    var st = native('wake.status');
    if (st && st.on) {
      native('wake.set', false);
      return true;
    }
  } catch (error) {
    console.warn('recorder: wake: ' + message(error));
  }
  return false;
}

function wakeBack(was) {
  if (!was) return;
  try { native('wake.set', true); } catch (error) { console.warn('recorder: wake back: ' + message(error)); }
}

function micBusy() {
  var st = speech();
  if (st.live && st.live.active) return 'Идёт живой разговор — сначала закончите его';
  if (st.stream) return 'Микрофон занят непрерывным распознаванием';
  if (st.listening) return 'Ассистент сейчас слушает — попробуйте через пару секунд';
  return null;
}

function partPath(rec, n) {
  return dirOf(rec.id) + '/' + parts.partName(n, 'm4a');
}

function openPart(rec, n) {
  var s = rec.s;
  return phone().record({
    path: axiko.files.path(partPath(rec, n)),
    source: settingsLib.SOURCES[s.source] || 1,
    rate: s.sampleRate,
    channels: s.channels,
    bitrate: s.bitrate,
    maxBytes: rec.splitMode === 'next' ? parts.partBytes(s.bitrate, s.partMinutes, s.partOverheadPct) : 0,
    onInfo: function (kind) { onInfo(rec, kind); },
    onError: function (what, extra) { spawn(function () { require(SELF).stopRecording('Запись остановлена: ошибка микрофона (' + what + ', ' + extra + ')'); }); }
  });
}

/** A part is closed: it goes into the queue with its place in the recording. */
function closePart(rec, n, endActive) {
  var file = partPath(rec, n);
  var size = 0;
  try { size = phone().size(axiko.files.path(file)); } catch (error) { size = 1; }
  if (size > 0 && endActive > rec.partStartActive) {
    db.exec("insert into segments (recordingId, n, offsetMs, durationMs, file, state, tries) values (?, ?, ?, ?, ?, 'wait', 0)",
      [rec.id, n, rec.partStartActive, endActive - rec.partStartActive, file]);
  } else {
    axiko.files.remove(file);
  }
  rec.partStartActive = endActive;
  db.exec('update recordings set parts = (select count(*) from segments where recordingId = ?), durationMs = ? where id = ?', [rec.id, endActive, rec.id]);
  saveState(rec);
  changed('part', rec.id);
  kickQueue();
}

/** MediaRecorder's news (on the main thread): the next file is wanted, it has started, the size is reached. */
function onInfo(rec, kind) {
  if (kind === 'approaching') {
    if (rec.splitMode !== 'next' || rec.nextSet) return;
    try {
      phone().nextFile(rec.recorder, axiko.files.path(partPath(rec, rec.n + 1)));
      rec.nextSet = true;
    } catch (error) {
      console.warn('recorder: setNextOutputFile: ' + message(error) + ' — stop and start from now on');
      rec.splitMode = 'restart';
    }
  } else if (kind === 'next') {
    var at = activeNow(rec);
    spawn(function () {
      locked(function () {
        if (LIVE.rec !== rec) return;
        var closed = rec.n;
        rec.n = closed + 1;
        rec.nextSet = false;
        closePart(rec, closed, at);
      });
    });
  } else if (kind === 'reached') {
    spawn(function () { restartPart(rec, true); });
  }
}

/** Stop and start: the way without setNextOutputFile (a gap of about 0.2 s between parts). */
function restartPart(rec, alreadyStopped) {
  locked(function () {
    if (LIVE.rec !== rec || rec.paused) return;
    var at = activeNow(rec);
    phone().finish(rec.recorder);
    var closed = rec.n;
    rec.n = closed + 1;
    rec.nextSet = false;
    closePart(rec, closed, at);
    try {
      rec.recorder = openPart(rec, rec.n);
    } catch (error) {
      rec.recorder = null;
      spawn(function () { require(SELF).stopRecording('Запись остановлена: ' + message(error)); });
    }
  });
}

function ongoing(rec) {
  var active = activeNow(rec);
  var title = rec.paused ? 'Запись на паузе · ' + text.clock(active) : 'Идёт запись';
  var body = (rec.mode === 'auto' ? 'Диктофон' : KIND_TITLE[rec.mode]) + (rec.paused ? '' : ' · отрезок ' + rec.n);
  var buttons = [
    { title: rec.paused ? 'Продолжить' : 'Пауза', act: rec.paused ? 'resume' : 'pause' },
    { title: 'Отметка', act: 'mark' },
    { title: 'Стоп', act: 'stop' }
  ];
  try {
    if (has('notify.actions')) {
      axiko.notify({
        id: NOTICE_ID, title: title, text: body, open: SCREEN, ongoing: true, silent: true, channel: 'quiet',
        when: rec.paused ? undefined : Date.now() - active, chronometer: !rec.paused,
        actions: buttons.map(function (b) { return { title: b.title, call: SELF, fn: 'fromNotice', args: { act: b.act } }; })
      });
    } else {
      phone().ongoing({ id: OWN_NOTICE, title: title, text: body, when: rec.paused ? null : Date.now() - active, chronometer: !rec.paused, actions: buttons });
    }
  } catch (error) {
    console.warn('recorder: ongoing notification: ' + message(error));
  }
}

function ongoingOff() {
  try { if (has('notify.actions')) axiko.notify.cancel(NOTICE_ID); } catch (error) { /* gone */ }
  try { phone().cancelOngoing(OWN_NOTICE); } catch (error) { /* gone */ }
}

function liveOf(rec) {
  if (!rec) return null;
  return {
    id: rec.id, startedAt: rec.startedAt, activeMs: activeNow(rec), paused: rec.paused, pausedBy: rec.pausedBy || null,
    part: rec.n, mode: rec.mode, partMinutes: rec.s.partMinutes, splitMode: rec.splitMode
  };
}

function emitState() {
  emit('recorder.state', liveOf(LIVE.rec));
}

function ticker(rec) {
  var lastSave = 0;
  var lastFree = 0;
  var dir = axiko.files.path(dirOf(rec.id));
  while (LIVE.rec === rec) {
    var s = rec.s;
    var now = Date.now();
    if (!rec.paused && rec.recorder) {
      var active = activeNow(rec);
      emit('recorder.level', { id: rec.id, level: parts.level(phone().amplitude(rec.recorder)), ms: active });
      var partMs = active - rec.partStartActive;
      var want = s.partMinutes * 60000;
      if (rec.splitMode === 'next' && partMs >= want * s.partLateFactor) {
        console.warn('recorder: no next file after ' + Math.round(partMs / 1000) + ' s — stop and start from now on');
        rec.splitMode = 'restart';
      }
      if (rec.splitMode === 'restart' && partMs >= want) restartPart(rec);
      if (active >= s.maxHours * 3600000) {
        spawn(function () { require(SELF).stopRecording('Запись остановлена сама: прошло ' + s.maxHours + ' ч'); });
        return;
      }
      if (now - lastFree > 30000) {
        lastFree = now;
        if (phone().freeMb(dir) < s.minFreeMb) {
          spawn(function () { require(SELF).stopRecording('Запись остановлена: в телефоне мало места'); });
          return;
        }
      }
    }
    if (now - lastSave >= s.stateEveryS * 1000) {
      lastSave = now;
      try { saveState(rec); } catch (error) { /* next time */ }
    }
    sleep(s.levelEveryMs);
  }
}

/**
 * Starts a recording: { mode: 'auto' | 'meeting' | 'note' | 'lecture', title, tags, link }. The
 * wake-word listener is paused for the time of it (one microphone). `tags` stay with the recording
 * whatever the summary finds; `link` — what it belongs to, e.g. { module: 'focus', id: <session> }
 * (Фокус: «Надиктовать итог»). → status().
 */
exports.startRecording = function (options) {
  options = options || {};
  var started = locked(function () {
    if (LIVE.rec) return false;
    var s = settings();
    var busy = micBusy();
    if (busy) throw new Error(busy);
    if (!ask(['RECORD_AUDIO'])) throw new Error('Нет доступа к микрофону: разрешите его Axiko');
    var mode = MODES.indexOf(options.mode) >= 0 ? options.mode : s.defaultMode;
    var now = Date.now();
    db.exec("insert into recordings (title, mode, kind, startedAt, durationMs, parts, state, origin, created, edited) values (?, ?, ?, ?, 0, 0, 'recording', 'mic', ?, ?)",
      [options.title || null, mode, mode === 'auto' ? null : mode, now, now, options.title ? now : null]);
    var id = db.lastId();
    var linkTags = (Array.isArray(options.tags) ? options.tags : []).map(function (t) { return String(t || '').trim().slice(0, 60); })
      .filter(function (t, i, all) { return t && all.indexOf(t) === i; }).slice(0, 5);
    if (linkTags.length || options.link) {
      db.exec('update recordings set linkTags = ?, link = ? where id = ?', [linkTags.length ? JSON.stringify(linkTags) : null,
        options.link ? JSON.stringify(options.link) : null, id]);
    }
    mkdirs(dirOf(id));
    var wakeWas = wakeOff();
    if (s.announce && s.announceText) {
      try { native('speech.say', s.announceText, 'local'); } catch (error) { /* silent start */ }
    }
    var rec = { id: id, startedAt: Date.now(), pausedMs: 0, pausedAt: null, paused: false, n: 1, partStartActive: 0, wakeWas: wakeWas,
      mode: mode, splitMode: s.splitMode, s: s, nextSet: false, recorder: null };
    try {
      rec.recorder = openPart(rec, 1);
    } catch (error) {
      db.exec("update recordings set state = 'failed', error = ? where id = ?", [message(error), id]);
      wakeBack(wakeWas);
      throw error;
    }
    db.exec('update recordings set startedAt = ? where id = ?', [rec.startedAt, id]);
    LIVE.rec = rec;
    saveState(rec);
    return rec;
  });
  if (started) {
    ongoing(started);
    spawn(function () { ticker(started); });
    emitState();
    changed('start', started.id);
  }
  return exports.status();
};

exports.pauseRecording = function (by) {
  var rec = locked(function () {
    var r = LIVE.rec;
    if (!r || r.paused || !r.recorder) return null;
    phone().pause(r.recorder);
    r.paused = true;
    r.pausedAt = Date.now();
    r.pausedBy = by || 'owner';
    saveState(r);
    return r;
  });
  if (rec) { ongoing(rec); emitState(); }
  return exports.status();
};

exports.resumeRecording = function () {
  var rec = locked(function () {
    var r = LIVE.rec;
    if (!r || !r.paused || !r.recorder) return null;
    phone().resume(r.recorder);
    r.pausedMs += Date.now() - r.pausedAt;
    r.pausedAt = null;
    r.paused = false;
    r.pausedBy = null;
    saveState(r);
    return r;
  });
  if (rec) { ongoing(rec); emitState(); }
  return exports.status();
};

/** Stops the recording; its last part goes into the queue, the wake word comes back. → { id, durationMs } or null. */
exports.stopRecording = function (reason) {
  var done = locked(function () {
    var rec = LIVE.rec;
    if (!rec) return null;
    LIVE.rec = null;
    if (rec.paused && rec.pausedAt) {
      rec.pausedMs += Date.now() - rec.pausedAt;
      rec.pausedAt = null;
    }
    var active = activeNow(rec);
    var ok = rec.recorder ? phone().finish(rec.recorder) : false;
    if (ok) closePart(rec, rec.n, active);
    else axiko.files.remove(partPath(rec, rec.n));
    var count = db.query('select count(*) as n from segments where recordingId = ?', [rec.id])[0].n;
    db.exec('update recordings set durationMs = ?, parts = ?, state = ?, error = ? where id = ?',
      [active, count, count ? 'transcribing' : 'failed', count ? (reason || null) : (reason || 'В записи нет звука'), rec.id]);
    clearState();
    wakeBack(rec.wakeWas);
    return { id: rec.id, durationMs: active };
  });
  if (done) {
    ongoingOff();
    emitState();
    changed('stop', done.id);
    kickQueue();
  }
  return done;
};

/** A bookmark at the current second of the recording; label may come later. → { id, atMs }. */
exports.mark = function (label) {
  var rec = LIVE.rec;
  if (!rec) throw new Error('Сейчас ничего не записывается');
  var at = activeNow(rec);
  db.exec('insert into marks (recordingId, atMs, label) values (?, ?, ?)', [rec.id, at, label ? String(label).slice(0, 200) : null]);
  var id = db.lastId();
  changed('mark', rec.id);
  return { id: id, atMs: at };
};

exports.addMark = function (recordingId, atMs, label) {
  db.exec('insert into marks (recordingId, atMs, label) values (?, ?, ?)', [recordingId, Math.max(0, Math.round(atMs || 0)), label ? String(label).slice(0, 200) : null]);
  changed('mark', recordingId);
  return db.lastId();
};

exports.setMark = function (id, label) {
  db.exec('update marks set label = ? where id = ?', [label ? String(label).slice(0, 200) : null, id]);
  var m = db.query('select recordingId from marks where id = ?', [id])[0];
  if (m) changed('mark', m.recordingId);
  return true;
};

exports.removeMark = function (id) {
  var m = db.query('select recordingId from marks where id = ?', [id])[0];
  db.exec('delete from marks where id = ?', [id]);
  if (m) changed('mark', m.recordingId);
  return true;
};

/** The buttons of the ongoing notification: { act: 'pause' | 'resume' | 'stop' | 'mark' }. */
exports.fromNotice = function (args) {
  var act = args && args.act;
  if (act === 'pause') return exports.pauseRecording('owner');
  if (act === 'resume') return exports.resumeRecording();
  if (act === 'stop') return exports.stopRecording();
  if (act === 'mark') {
    var m = exports.mark(null);
    try { axiko.toast('Отметка ' + text.clock(m.atMs)); } catch (error) { /* no toast */ }
    if (LIVE.rec) ongoing(LIVE.rec);
    return m;
  }
  return null;
};

/** A phone call takes the microphone: the recording waits and goes on after it. */
exports.onCall = function (event) {
  var rec = LIVE.rec;
  if (!rec || !rec.s.pauseOnCall || !event) return null;
  if (event.state === 'offhook' && !rec.paused) return exports.pauseRecording('call');
  if (event.state === 'idle' && rec.paused && rec.pausedBy === 'call') return exports.resumeRecording();
  return null;
};

exports.onPower = function (event) {
  LIVE.charging = Boolean(event && event.charging);
  if (LIVE.charging) kickQueue();
  return LIVE.charging;
};

/** After the process went down during a recording: what was written stays, the wake word comes back. */
function recover() {
  var st = axiko.files.readJson(STATE, null);
  if (!st || !st.id) return null;
  if (LIVE.rec && LIVE.rec.id === st.id) return null;
  var rec = row(st.id);
  clearState();
  wakeBack(st.wakeWas);
  ongoingOff();
  if (!rec || rec.state !== 'recording') return null;
  var end = Math.max(Number(st.lastActive || 0), Number(st.partStartActive || 0));
  var file = dirOf(rec.id) + '/' + parts.partName(st.n, 'm4a');
  if (axiko.files.exists(file) && end > st.partStartActive) {
    db.exec("insert into segments (recordingId, n, offsetMs, durationMs, file, state, tries) values (?, ?, ?, ?, ?, 'wait', 0)",
      [rec.id, st.n, st.partStartActive, end - st.partStartActive, file]);
  }
  var count = db.query('select count(*) as n from segments where recordingId = ?', [rec.id])[0].n;
  db.exec('update recordings set durationMs = ?, parts = ?, state = ?, error = ? where id = ?', [end, count, count ? 'transcribing' : 'failed',
    'Запись прервалась: приложение было закрыто. Сохранено около ' + text.clock(end) + (count ? '; последний отрезок мог оборваться' : ''), rec.id]);
  return rec.id;
}

// ---- the queue of transcription ------------------------------------------------------------------------

function kickQueue() {
  spawn(function () { require(SELF).runQueue(); });
}

function transcribeOne(seg, s) {
  db.exec("update segments set state = 'busy' where id = ?", [seg.id]);
  var started = Date.now();
  try {
    var raw;
    var phrases = null;
    if (has('transcribe.segments')) {
      phrases = js(axiko.speech.transcribe(seg.file, { segments: true })) || [];
      raw = phrases.map(function (p) { return String(p.text || ''); }).join(' ').trim();
    } else {
      raw = String(axiko.speech.transcribe(seg.file) || '').trim();
    }
    var clean = text.codeClean(raw, phrases, s.paragraphGapMs);
    db.exec("update segments set raw = ?, phrases = ?, text = ?, cleanedBy = 'code', transcribeMs = ?, state = 'done', error = null where id = ?",
      [raw, phrases ? JSON.stringify(phrases) : null, clean.text, Date.now() - started, seg.id]);
    // A file whose length the phone could not read: at least as long as its last phrase.
    var heardMs = (phrases || []).reduce(function (m, p) { return Math.max(m, Number(p.endMs) || 0); }, 0);
    if (!Number(seg.durationMs) && heardMs) {
      db.exec('update segments set durationMs = ? where id = ?', [heardMs, seg.id]);
      db.exec('update recordings set durationMs = max(coalesce(durationMs, 0), ?) where id = ?', [Number(seg.offsetMs || 0) + heardMs, seg.recordingId]);
    }
  } catch (error) {
    var why = message(error);
    if (/не скачана/i.test(why)) {
      db.exec("update segments set state = 'wait' where id = ?", [seg.id]);
      throw error;
    }
    var tries = Number(seg.tries || 0) + 1;
    db.exec('update segments set state = ?, tries = ?, error = ? where id = ?', [tries >= s.transcribeTries ? 'failed' : 'wait', tries, why, seg.id]);
  }
  emit('recorder.changed', { type: 'segment', id: seg.recordingId, n: seg.n });
}

/** One background worker: parts into text one by one, then the finished recordings into summaries. */
exports.runQueue = function () {
  if (LIVE.queueBusy) {
    LIVE.queueAgain = true;
    return { busy: true };
  }
  LIVE.queueBusy = true;
  var count = 0;
  var stopped = null;
  try {
    while (true) {
      LIVE.queueAgain = false;
      var s = settings();
      var seg = db.query("select * from segments where state = 'wait' order by recordingId, n limit 1")[0];
      if (seg) {
        if (s.transcribeWhen === 'charging' && !charging() && !LIVE.force[seg.recordingId]) { stopped = 'charging'; break; }
        if (speech().ready === false) {
          stopped = 'model';
          progress(seg.recordingId, 'Ждёт модель распознавания речи: скачайте её в настройках Axiko');
          break;
        }
        try {
          transcribeOne(seg, s);
        } catch (error) {
          stopped = 'model';
          progress(seg.recordingId, 'Ждёт модель распознавания речи: ' + message(error));
          break;
        }
        count++;
        var left = db.query("select count(*) as n from segments where recordingId = ? and state in ('wait', 'busy')", [seg.recordingId])[0].n;
        var r = row(seg.recordingId);
        if (r && r.state !== 'recording') progress(seg.recordingId, left ? 'Расшифровка: осталось отрезков ' + left : 'Расшифровано');
        continue;
      }
      var ready = db.query("select id from recordings r where state = 'transcribing' and not exists " +
        "(select 1 from segments g where g.recordingId = r.id and g.state in ('wait', 'busy'))");
      if (!ready.length) {
        if (LIVE.queueAgain) continue;
        break;
      }
      ready.forEach(function (r2) { processRecording(r2.id); });
    }
  } finally {
    LIVE.queueBusy = false;
  }
  if (LIVE.queueAgain) kickQueue();
  return { done: count, stopped: stopped };
};

// ---- the text: cleanup, a thought, a summary --------------------------------------------------------------

function cleanParts(id, s) {
  var policy = s.cleanModel === 'off' ? 'off' : s.cleanModel === 'local' ? 'local' : 'cloud';
  var model = modelFor('recorder.clean', policy);
  if (!model) return 'code';
  var segs = segmentsOf(id).filter(function (g) { return g.state === 'done' && g.raw && g.cleanedBy !== 'model'; });
  var system = prompts.cleanSystem(s.words);
  var used = 'code';
  for (var i = 0; i < segs.length; i++) {
    progress(id, 'Чистка текста: ' + (i + 1) + ' из ' + segs.length);
    var g = segs[i];
    var source = text.codeClean(g.raw, json(g.phrases, null), s.paragraphGapMs).text;
    try {
      var answer = prompts.acceptClean(g.raw, askModel('recorder.clean', system, source, false), s.cleanMinRatio, s.cleanMaxRatio);
      if (answer) {
        db.exec("update segments set text = ?, cleanedBy = 'model' where id = ?", [answer, g.id]);
        used = 'model';
      }
    } catch (error) {
      console.warn('recorder: clean: ' + message(error));
      if (/лимит|limit|guard|Не выбрана/i.test(message(error))) break;
    }
  }
  return used;
}

function paragraphsOfRecording(id, s) {
  var out = [];
  segmentsOf(id).forEach(function (g) {
    if (g.state !== 'done') return;
    text.paragraphsOf(g, s.paragraphGapMs).forEach(function (p) {
      out.push({ atMs: p.atMs, text: p.text, exact: p.exact, n: g.n });
    });
  });
  return out;
}

function thought(rec, paragraphs, s) {
  var body = paragraphs.map(function (p) { return p.text; }).join('\n\n');
  var rules = extract.note(body, { dictionary: s.words, commands: s.commands, now: rec.startedAt });
  var result = { title: rules.title, tags: rules.tags, command: rules.command, by: 'rules' };
  var model = modelFor('recorder.note', s.noteModel);
  if (model) {
    try {
      progress(rec.id, 'Заголовок и теги');
      var answer = prompts.checkNote(askModel('recorder.note', prompts.noteSystem(s.words), body, true), rec.startedAt);
      if (answer) result = { title: answer.title, tags: answer.tags.length ? answer.tags : rules.tags, command: answer.command, by: 'model' };
    } catch (error) {
      result.note = 'Без модели: ' + message(error);
    }
  }
  if (!s.commands) result.command = null;
  return { title: result.title, summary: { kind: 'note', text: body, by: result.by, note: result.note || null }, tags: result.tags, people: extract.dictionaryIn(body, s.words), command: result.command };
}

function modelSummary(rec, paragraphs, s, model, mode) {
  var marks = marksOf(rec.id);
  var opts = { marks: marks, mode: mode, words: s.words, date: extract.iso(new Date(rec.startedAt)) };
  var check = { durationMs: rec.durationMs, lines: s.summaryLines, maxTasks: s.maxTasks };
  var words = paragraphs.reduce(function (n, p) { return n + text.wordCount(p.text); }, 0);
  if (!model.local && words <= s.oneAskWords) {
    progress(rec.id, 'Конспект');
    return prompts.checkSummary(askModel('recorder.summary', prompts.summarySystem(opts), text.forModel(paragraphs), true), check);
  }
  // By steps: a short digest of every piece, then the summary of the digests.
  var stepRole = modelFor('recorder.clean', s.summaryModel === 'local' ? 'local' : 'cloud') ? 'recorder.clean' : 'recorder.summary';
  var groups = text.groups(paragraphs, s.stepWords);
  var digests = [];
  for (var i = 0; i < groups.length; i++) {
    progress(rec.id, 'Конспект: часть ' + (i + 1) + ' из ' + groups.length);
    digests.push(String(askModel(stepRole, prompts.stepSystem(s.words), text.forModel(groups[i]), false) || '').trim());
  }
  progress(rec.id, 'Конспект: итог');
  return prompts.checkSummary(askModel('recorder.summary', prompts.finalSystem(opts), digests.join('\n\n'), true), check);
}

function meeting(rec, paragraphs, s, mode) {
  var rules = extract.summarize(paragraphs, { now: rec.startedAt, mode: mode, dictionary: s.words, lines: s.summaryLines, maxTasks: s.maxTasks, date: dateText(rec.startedAt) });
  var result = rules;
  var by = 'rules';
  var note = null;
  var model = modelFor('recorder.summary', s.summaryModel);
  if (model) {
    try {
      result = modelSummary(rec, paragraphs, s, model, mode);
      by = 'model';
      if (!result.title) result.title = rules.title;
    } catch (error) {
      note = 'Конспект собран без модели: ' + message(error);
    }
  } else if (s.summaryModel === 'local') {
    note = 'Конспект собран без модели: роли «recorder.summary» не назначена модель на телефоне';
  }
  return {
    title: result.title,
    summary: { kind: mode, summary: result.summary, decisions: result.decisions, questions: result.questions, topics: result.topics, by: by, note: note },
    tags: result.topics,
    people: result.people,
    tasks: result.tasks
  };
}

/** The tasks of a fresh summary; the owner's own marks (done, calendar, reminder) stay with theirs. */
function saveTasks(id, list) {
  var kept = tasksOf(id).filter(function (t) { return t.done || t.calendarEventId || t.remindAt || t.proposed; });
  db.exec('delete from tasks where recordingId = ? and done = 0 and calendarEventId is null and remindAt is null and proposed = 0', [id]);
  (list || []).forEach(function (t) {
    if (kept.some(function (k) { return text.plain(k.text) === text.plain(t.text); })) return;
    db.exec('insert into tasks (recordingId, text, who, due, done, atMs, proposed, created) values (?, ?, ?, ?, 0, ?, 0, ?)',
      [id, t.text, t.who || null, t.due || null, t.atMs === undefined ? null : t.atMs, Date.now()]);
  });
}

// ---- commands of a short thought -----------------------------------------------------------------------------

function remindTime(due, s, now) {
  if (due) {
    var at = new Date(Number(due.slice(0, 4)), Number(due.slice(5, 7)) - 1, Number(due.slice(8, 10)),
      Number(s.reminderAt.slice(0, 2)), Number(s.reminderAt.slice(3, 5))).getTime();
    if (isFinite(at) && at > now + 60000) return at;
  }
  return now + s.reminderLaterMin * 60000;
}

function whenText(time) {
  var d = new Date(time);
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  return pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + ' в ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}

function runCommand(rec, cmd, s) {
  if (!cmd) return null;
  var open = ITEM + '?id=' + rec.id;
  if (cmd.kind === 'message') {
    var inbox = optional('modules/inbox/main.js');
    if (!inbox || !inbox.draftFor) {
      tell('Поручение: написать ' + cmd.to, '«' + cmd.text + '» — Входящих нет, текст в записи', open);
      return 'no-inbox';
    }
    var result = null;
    var names = cmd.names && cmd.names.length ? cmd.names : [cmd.to];
    for (var i = 0; i < names.length; i++) {
      result = inbox.draftFor(names[i], cmd.text, 'voice', { open: false, copy: false, notify: true });
      if (result && result.found) break;
    }
    if (result && result.found) {
      if (result.canReply !== false) return 'draft';
      // The chat is known, but its notification is gone: the draft waits in Входящие, the owner sends it by hand.
      tell('Черновик для ' + (result.title || cmd.to) + ' во Входящих', 'Ответить из ленты нельзя — отправьте вручную: «' + cmd.text + '»', open);
      return 'draft-no-reply';
    }
    tell('Беседа «' + cmd.to + '» не найдена во Входящих', 'Черновик «' + cmd.text + '» — в записи', open);
    return 'not-found';
  }
  if (cmd.kind === 'expense') {
    var spending = optional('modules/spending/main.js');
    if (spending && spending.addManual) {
      var tx = spending.addManual({ amount: cmd.amount, title: cmd.what || 'Трата голосом', note: 'голосом, проверить', at: rec.startedAt });
      tell('Трата записана: ' + (cmd.what || 'без названия') + ', ' + cmd.amount + ' ₽', 'Голосом — проверьте в «Тратах»', 'modules/spending/ui/index.html?tx=' + tx.id, true);
      return 'expense';
    }
    require('lib/base').add({ kind: 'expense', title: cmd.what || 'Трата голосом', at: rec.startedAt, amount: cmd.amount, unit: 'RUB', tags: ['голосом'],
      data: { recordingId: rec.id, check: true }, source: 'recorder' });
    tell('Трата записана в общую базу: ' + cmd.amount + ' ₽', (cmd.what || '') + ' — голосом, проверьте', open, true);
    return 'expense-base';
  }
  if (cmd.kind === 'reminder') {
    var at = cmd.at && cmd.at > Date.now() + 60000 ? cmd.at : remindTime(cmd.date, s, Date.now());
    db.exec('insert into tasks (recordingId, text, who, due, done, atMs, remindAt, proposed, created) values (?, ?, ?, ?, 0, 0, ?, 1, ?)',
      [rec.id, cmd.text, 'владелец', cmd.date || null, at, Date.now()]);
    var taskId = db.lastId();
    var options = { title: 'Напомнить: ' + cmd.text, text: whenText(at) + ' — нажмите «Напомнить», чтобы поставить', open: open };
    if (has('notify.actions')) options.actions = [{ title: 'Напомнить', call: SELF, fn: 'remindTask', args: { id: taskId } }];
    try { axiko.notify(options); } catch (error) { /* the task is in the recording */ }
    return 'proposed';
  }
  return null;
}

// ---- archive: search pieces, vectors, memory, the shared base ---------------------------------------------

function cosine(a, b) {
  var dot = 0;
  var na = 0;
  var nb = 0;
  for (var i = 0; i < a.length && i < b.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

function embed(texts) {
  try {
    var v = js(native('models.embed', texts));
    return v && v.length === texts.length ? v : null;
  } catch (error) {
    return null;
  }
}

function dropChunks(id) {
  db.exec('delete from vectors where chunkId in (select rowid from chunks where recordingId = ?)', [String(id)]);
  db.exec('delete from chunks where recordingId = ?', [String(id)]);
}

function index(id, paragraphs, s) {
  dropChunks(id);
  var list = text.chunks(paragraphs, s.chunkWords);
  var ids = [];
  list.forEach(function (c) {
    db.exec('insert into chunks (recordingId, offsetMs, text) values (?, ?, ?)', [String(id), String(c.offsetMs), c.text.replace(/ё/g, 'е').replace(/Ё/g, 'Е')]);
    ids.push(db.lastId());
  });
  if (!s.embed || !list.length) return ids.length;
  for (var i = 0; i < list.length; i += s.embedBatch) {
    var batch = list.slice(i, i + s.embedBatch).map(function (c) { return c.text; });
    var vectors = embed(batch);
    if (!vectors) break;
    vectors.forEach(function (v, k) {
      if (v) db.exec('insert or replace into vectors (chunkId, vector) values (?, ?)', [ids[i + k], JSON.stringify(js(v))]);
    });
  }
  return ids.length;
}

function memoryText(rec, kind, title, summary, tasks) {
  var when = dateText(rec.startedAt);
  if (kind === 'note') return 'Мысль ' + when + ' «' + title + '»: ' + String(summary.text || '').replace(/\s+/g, ' ').slice(0, 800);
  var bits = [(KIND_TITLE[kind] || 'Запись') + ' «' + title + '» ' + when + ' (' + text.length(rec.durationMs) + ')'];
  if (summary.summary && summary.summary.length) bits.push(summary.summary.join(' '));
  if (summary.decisions && summary.decisions.length) bits.push('Решили: ' + summary.decisions.map(function (d) { return d.text; }).join('; '));
  if (tasks && tasks.length) bits.push('Задачи: ' + tasks.map(function (t) { return t.text + (t.who ? ' (' + t.who + (t.due ? ', до ' + t.due : '') + ')' : t.due ? ' (до ' + t.due + ')' : ''); }).join('; '));
  return bits.join('. ').slice(0, 2000);
}

function remember(rec, kind, title, summary, tags, people, s) {
  var fields = {};
  if (s.memory) {
    var memory = require('lib/memory');
    if (rec.memoryId) { try { memory.remove(rec.memoryId); } catch (error) { /* gone */ } }
    var words = ['диктофон', kind === 'note' ? 'мысль' : kind === 'lecture' ? 'лекция' : 'встреча'].concat(tags || [], (people || []).map(function (p) { return String(p).toLowerCase(); }));
    fields.memoryId = memory.save(memoryText(rec, kind, title, summary, tasksOf(rec.id)), words.join(', '));
  }
  if (s.base) {
    var base = require('lib/base');
    var record = {
      kind: kind === 'note' ? 'note' : 'event', title: title, at: rec.startedAt, amount: Math.max(1, Math.round(rec.durationMs / 60000)), unit: 'min',
      tags: [kind === 'note' ? 'мысль' : kind === 'lecture' ? 'лекция' : 'встреча'].concat((tags || []).slice(0, 5)),
      data: { recordingId: rec.id, people: people || [] }, source: 'recorder'
    };
    var existing = rec.baseId ? base.get(rec.baseId) : null;
    if (existing) base.update(rec.baseId, record);
    else fields.baseId = base.add(record);
  }
  return fields;
}

/** All parts are text: cleanup, a thought or a summary, the archive, memory, the shared base, a notification. */
function processRecording(id, options) {
  options = options || {};
  if (LIVE.processing[id]) return false;
  LIVE.processing[id] = true;
  try {
    var s = settings();
    var rec = row(id);
    if (!rec) return false;
    var segs = segmentsOf(id);
    var heard = segs.filter(function (g) { return g.state === 'done' && g.raw && String(g.raw).trim(); });
    if (!heard.length) {
      var failed = segs.filter(function (g) { return g.state === 'failed'; });
      setState(id, 'failed', { error: failed.length ? 'Расшифровка не удалась: ' + (failed[0].error || 'ошибка') : 'В записи не распознано ни слова', progress: null });
      return false;
    }
    setState(id, 'summarizing', { progress: 'Чистка текста' });
    cleanParts(id, s);
    var kind = parts.finalMode(rec.mode === 'import' ? (rec.kind || 'auto') : rec.mode, rec.durationMs, s.noteMaxMinutes);
    var paragraphs = paragraphsOfRecording(id, s);
    var made = kind === 'note' ? thought(rec, paragraphs, s) : meeting(rec, paragraphs, s, kind);
    var title = rec.edited && rec.title ? rec.title : (made.title || (KIND_TITLE[kind] + ' ' + dateText(rec.startedAt)));
    var partsFailed = segs.filter(function (g) { return g.state === 'failed'; }).length;
    if (partsFailed) made.summary.gaps = partsFailed;
    // Tags given at the start (Фокус: «фокус» and the session's goal) come first and stay.
    var linked = json(rec.linkTags, []);
    if (linked.length) made.tags = linked.concat((made.tags || []).filter(function (t) { return linked.indexOf(t) < 0; }));
    db.exec('update recordings set title = ?, kind = ?, mode = ?, summary = ?, tags = ?, people = ? where id = ?', [title, kind,
      rec.mode === 'auto' ? kind : rec.mode, JSON.stringify(made.summary), JSON.stringify(made.tags || []), JSON.stringify(made.people || []), id]);
    if (made.tasks) saveTasks(id, made.tasks);
    var commandState = rec.commandState;
    if (kind === 'note') {
      var before = json(rec.command, null);
      db.exec('update recordings set command = ? where id = ?', [made.command ? JSON.stringify(made.command) : null, id]);
      // A command runs once: a rebuilt summary does not send a second draft.
      if (made.command && !commandState && !options.noCommand && JSON.stringify(before) !== JSON.stringify(made.command)) {
        try {
          commandState = runCommand(row(id), made.command, s);
        } catch (error) {
          commandState = 'error: ' + message(error);
        }
      }
    }
    progress(id, 'В архив');
    index(id, paragraphs, s);
    var fields = {};
    try {
      fields = remember(row(id), kind, title, made.summary, made.tags, made.people, s);
    } catch (error) {
      console.warn('recorder: memory or base: ' + message(error));
    }
    var extra = { progress: null, commandState: commandState || null };
    if (fields.memoryId) extra.memoryId = fields.memoryId;
    if (fields.baseId) extra.baseId = fields.baseId;
    var keepError = rec.error && /прервалась|остановлена/.test(rec.error) ? rec.error : null;
    extra.error = keepError || made.summary.note || null;
    setState(id, 'ready', extra);
    if (s.notifyReady && !options.quiet && !(kind === 'note' && made.command)) {
      if (kind === 'note') tell('Мысль записана: ' + title, (made.tags || []).join(', ') || 'Откройте, чтобы посмотреть текст', ITEM + '?id=' + id, true);
      else tell(parts.readyText(title, { decisions: made.summary.decisions, tasks: made.tasks }), (made.summary.summary || [])[0] || '', ITEM + '?id=' + id);
    }
    return true;
  } catch (error) {
    console.error('recorder: processing ' + id + ': ' + message(error));
    setState(id, 'failed', { error: 'Обработка не удалась: ' + message(error), progress: null });
    return false;
  } finally {
    delete LIVE.processing[id];
  }
}

// ---- the archive for the screens and the tool -------------------------------------------------------------

function openTaskCounts() {
  var out = {};
  db.query('select recordingId, sum(case when done = 0 then 1 else 0 end) as open, count(*) as total from tasks group by recordingId').forEach(function (r) {
    out[r.recordingId] = { open: Number(r.open || 0), total: Number(r.total || 0) };
  });
  return out;
}

function card(r, counts) {
  var summary = json(r.summary, null);
  var first = null;
  if (summary && summary.summary && summary.summary.length) first = summary.summary[0];
  else if (summary && summary.text) first = String(summary.text).split(/\n/)[0];
  var c = counts[r.id] || { open: 0, total: 0 };
  return {
    id: r.id, title: r.title || (KIND_TITLE[r.kind] || 'Запись') + ' ' + dateText(r.startedAt), kind: r.kind || null, mode: r.mode, origin: r.origin,
    startedAt: r.startedAt, durationMs: r.durationMs, state: r.state, error: r.error, progress: r.progress,
    firstLine: first ? (first.length > 160 ? first.slice(0, 160).replace(/\s+\S*$/, '') + ' …' : first) : null,
    tasks: c.total, openTasks: c.open, tags: json(r.tags, []), audio: !r.audioRemoved
  };
}

/** The archive: { kind: 'meeting' | 'note' | 'lecture' | 'tasks' | null, query, limit } → cards. */
exports.list = function (filter) {
  filter = filter || {};
  if (filter.query && String(filter.query).trim()) return exports.search(filter.query, filter);
  var limit = Math.min(500, Math.max(1, Number(filter.limit) || 100));
  var counts = openTaskCounts();
  var where = '';
  var args = [];
  if (['meeting', 'note', 'lecture'].indexOf(filter.kind) >= 0) { where = 'where kind = ?'; args.push(filter.kind); }
  var rows = db.query('select * from recordings ' + where + ' order by startedAt desc limit ' + limit, args);
  var cards = rows.map(function (r) { return card(r, counts); });
  if (filter.kind === 'tasks') {
    cards = cards.filter(function (c) { return c.openTasks > 0; }).map(function (c) {
      c.open = tasksOf(c.id).filter(function (t) { return !t.done; });
      return c;
    });
  }
  return cards;
};

/** Search by words (full text, beginnings of words) and by meaning (vectors, when the role embed has a model). */
exports.search = function (query, options) {
  options = options || {};
  var s = settings();
  var q = String(query || '').trim();
  if (!q) return [];
  var limit = Number(options.limit) || s.searchLimit;
  var best = {};
  var put = function (id, hit) {
    if (!best[id] || hit.score > best[id].score) best[id] = hit;
  };
  var match = text.ftsQuery(q);
  if (match) {
    db.query('select rowid as chunk, recordingId, offsetMs, text from chunks where chunks match ? limit 300', [match]).forEach(function (h) {
      var sc = text.score(h.text, q);
      if (sc > 0) put(Number(h.recordingId), { score: sc, offsetMs: Number(h.offsetMs), snippet: text.snippet(h.text, q), by: 'words' });
    });
  }
  db.query('select id, title, summary, tags from recordings').forEach(function (r) {
    var sc = text.score([r.title, r.tags, r.summary].join(' '), q);
    if (sc > 0) put(r.id, { score: sc * 0.9, offsetMs: null, snippet: r.title, by: 'title' });
  });
  var stored = db.query('select chunkId, vector from vectors');
  if (stored.length) {
    var qv = embed([q]);
    if (qv && qv[0]) {
      var v0 = js(qv[0]);
      var scored = stored.map(function (r) { return { chunk: r.chunkId, score: cosine(v0, JSON.parse(r.vector)) }; })
        .filter(function (x) { return x.score >= s.meaningMin; }).sort(function (a, b) { return b.score - a.score; }).slice(0, limit * 3);
      scored.forEach(function (x) {
        var c = db.query('select recordingId, offsetMs, text from chunks where rowid = ?', [x.chunk])[0];
        if (c) put(Number(c.recordingId), { score: x.score, offsetMs: Number(c.offsetMs), snippet: text.snippet(c.text, q), by: 'meaning' });
      });
    }
  }
  var counts = openTaskCounts();
  var kind = ['meeting', 'note', 'lecture'].indexOf(options.kind) >= 0 ? options.kind : null;
  return Object.keys(best).map(function (id) {
    var r = row(Number(id));
    if (!r || (kind && r.kind !== kind)) return null;
    var c = card(r, counts);
    if (options.kind === 'tasks' && !c.openTasks) return null;
    c.hit = best[id];
    return c;
  }).filter(Boolean).sort(function (a, b) { return b.hit.score - a.hit.score || b.startedAt - a.startedAt; }).slice(0, limit);
};

/** One recording for its screen. */
exports.item = function (id) {
  var r = row(id);
  if (!r) throw new Error('Нет записи ' + id);
  var s = settings();
  var segs = segmentsOf(id);
  return {
    id: r.id, title: r.title || (KIND_TITLE[r.kind] || 'Запись') + ' ' + dateText(r.startedAt), titleEdited: Boolean(r.edited), mode: r.mode, kind: r.kind,
    origin: r.origin, sourceName: r.sourceName, startedAt: r.startedAt, durationMs: r.durationMs, state: r.state, error: r.error, progress: r.progress,
    audioKept: Boolean(r.audioKept), audioRemoved: r.audioRemoved, summary: json(r.summary, null), command: json(r.command, null),
    commandState: r.commandState, tags: json(r.tags, []), people: json(r.people, []), link: json(r.link, null), tasks: tasksOf(id), marks: marksOf(id),
    segments: segs.map(function (g) {
      return { n: g.n, offsetMs: g.offsetMs, durationMs: g.durationMs, state: g.state, error: g.error, url: r.audioRemoved ? null : audioUrl(g.file),
        file: g.file, transcribeMs: g.transcribeMs, cleanedBy: g.cleanedBy, raw: g.raw };
    }),
    paragraphs: paragraphsOfRecording(id, s),
    recording: LIVE.rec && LIVE.rec.id === r.id ? liveOf(LIVE.rec) : null
  };
};

/** What is transcribed so far of the recording going on (or of any): paragraphs and the queue. */
exports.live = function (id) {
  var rid = id || (LIVE.rec && LIVE.rec.id);
  if (!rid) return null;
  var s = settings();
  var segs = segmentsOf(rid);
  return {
    id: rid, paragraphs: paragraphsOfRecording(rid, s),
    waiting: segs.filter(function (g) { return g.state === 'wait' || g.state === 'busy'; }).length,
    recording: LIVE.rec && LIVE.rec.id === rid ? liveOf(LIVE.rec) : null
  };
};

exports.recent = function (count) {
  var counts = openTaskCounts();
  return db.query('select * from recordings order by startedAt desc limit ' + Math.max(1, Math.min(50, Number(count) || 5))).map(function (r) { return card(r, counts); });
};

exports.openTasks = function () {
  return db.query('select t.*, r.title as recordingTitle, r.startedAt as startedAt from tasks t join recordings r on r.id = t.recordingId where t.done = 0 order by (t.due is null), t.due, t.id')
    .map(function (t) {
      return { id: t.id, recordingId: t.recordingId, recordingTitle: t.recordingTitle, startedAt: t.startedAt, text: t.text, who: t.who, due: t.due, atMs: t.atMs,
        calendarEventId: t.calendarEventId, remindAt: t.remindAt, proposed: Boolean(t.proposed) };
    });
};

// ---- edits -----------------------------------------------------------------------------------------------

exports.setTitle = function (id, title) {
  var t = String(title || '').replace(/\s+/g, ' ').trim().slice(0, 120);
  if (!t) throw new Error('Пустой заголовок');
  db.exec('update recordings set title = ?, edited = ? where id = ?', [t, Date.now(), id]);
  var r = row(id);
  if (r && r.baseId) {
    try { require('lib/base').update(r.baseId, { title: t }); } catch (error) { /* the base record is gone */ }
  }
  changed('title', id);
  return true;
};

exports.setTask = function (id, fields) {
  var t = db.query('select * from tasks where id = ?', [id])[0];
  if (!t) throw new Error('Нет задачи ' + id);
  fields = fields || {};
  var next = {
    text: fields.text !== undefined ? String(fields.text).trim().slice(0, 400) || t.text : t.text,
    who: fields.who !== undefined ? (fields.who ? String(fields.who).slice(0, 60) : null) : t.who,
    due: fields.due !== undefined ? (/^\d{4}-\d{2}-\d{2}$/.test(String(fields.due || '')) ? fields.due : null) : t.due,
    done: fields.done !== undefined ? (fields.done ? 1 : 0) : t.done
  };
  db.exec('update tasks set text = ?, who = ?, due = ?, done = ?, proposed = ? where id = ?', [next.text, next.who, next.due, next.done, next.done ? 0 : t.proposed, id]);
  if (next.done && t.remindAt) exports.cancelReminder(id);
  changed('task', t.recordingId);
  if (next.done && !t.done) keptAward();
  return true;
};

/**
 * «Ни одной задачи не потерял» for «Ачивки за жизнь» (without them — the shared box): every task with
 * a date in the last keptTasksDays days is done, at least keptTasksMin of them. Once; after a task is
 * ticked off and at the nightly cleaning. «Сто мыслей» the achievements count themselves from the base.
 */
function keptAward() {
  try {
    if (achieve.given(axiko.files, ACHIEVED, 'recorder/no-task-lost')) return null;
    var s = settings();
    var now = new Date(Date.now());
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    var today = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
    var from = awards.shift(today, -s.keptTasksDays);
    var got = awards.keptAll(db.query('select due, done, proposed from tasks where due >= ? and due < ?', [from, today]), today, s.keptTasksDays, s.keptTasksMin);
    if (!got.ok) return null;
    return achieve.give(axiko.files, require, {
      key: 'recorder/no-task-lost', source: 'recorder', category: 'Жизнь', title: 'Ни одной задачи не потерял', icon: 'check', rarity: 'rare',
      text: 'Выполнены все задачи из записей со сроком за ' + s.keptTasksDays + ' дн. — ' + got.due + ' из ' + got.due, at: Date.now()
    }, ACHIEVED);
  } catch (error) {
    console.warn('recorder: ачивка: ' + message(error));
    return null;
  }
}

exports.addTask = function (recordingId, fields) {
  fields = fields || {};
  var t = String(fields.text || '').trim().slice(0, 400);
  if (!t) throw new Error('Пустая задача');
  db.exec('insert into tasks (recordingId, text, who, due, done, atMs, proposed, created) values (?, ?, ?, ?, 0, ?, 0, ?)',
    [recordingId, t, fields.who || null, /^\d{4}-\d{2}-\d{2}$/.test(String(fields.due || '')) ? fields.due : null, fields.atMs === undefined ? null : fields.atMs, Date.now()]);
  changed('task', recordingId);
  return db.lastId();
};

exports.removeTask = function (id) {
  var t = db.query('select * from tasks where id = ?', [id])[0];
  if (!t) return false;
  if (t.remindAt) exports.cancelReminder(id);
  db.exec('delete from tasks where id = ?', [id]);
  changed('task', t.recordingId);
  return true;
};

/** «В календарь»: an event on the task's day (tomorrow without a date) at the time of the setting. */
exports.taskToCalendar = function (id) {
  var t = db.query('select * from tasks where id = ?', [id])[0];
  if (!t) throw new Error('Нет задачи ' + id);
  if (t.calendarEventId) return { eventId: t.calendarEventId, already: true };
  if (!ask(['READ_CALENDAR', 'WRITE_CALENDAR'])) throw new Error('Нет доступа к календарю');
  var s = settings();
  var day = t.due ? new Date(Number(t.due.slice(0, 4)), Number(t.due.slice(5, 7)) - 1, Number(t.due.slice(8, 10))) : null;
  if (!day) {
    var now = new Date();
    day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  }
  var start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), Number(s.eventAt.slice(0, 2)), Number(s.eventAt.slice(3, 5))).getTime();
  var r = row(t.recordingId);
  var eventId = phone().addEvent({ title: t.text, description: 'Из записи «' + (r && r.title || 'Диктофон') + '»' + (t.atMs !== null && t.atMs !== undefined ? ', ' + text.clock(t.atMs) : '') + (t.who ? '. Кто: ' + t.who : ''), start: start, minutes: s.eventMinutes });
  db.exec('update tasks set calendarEventId = ? where id = ?', [eventId, id]);
  changed('task', t.recordingId);
  return { eventId: eventId, start: start };
};

exports.removeFromCalendar = function (id) {
  var t = db.query('select * from tasks where id = ?', [id])[0];
  if (!t || !t.calendarEventId) return false;
  try { phone().removeEvent(t.calendarEventId); } catch (error) { /* removed in the calendar already */ }
  db.exec('update tasks set calendarEventId = null where id = ?', [id]);
  changed('task', t.recordingId);
  return true;
};

function reminderKey(id) {
  return 'recorder:remind:' + id;
}

function armReminder(id, at) {
  var key = reminderKey(id);
  if (has('job.once')) {
    job(key, { once: at }, function () { require(SELF).fireReminder(id); });
  } else {
    var d = new Date(at);
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    job(key, { at: pad(d.getHours()) + ':' + pad(d.getMinutes()) }, function () {
      var t = db.query('select remindAt from tasks where id = ?', [id])[0];
      if (!t || !t.remindAt) { try { unjob(key); } catch (error) { /* none */ } return; }
      if (Date.now() >= t.remindAt - 120000) require(SELF).fireReminder(id);
    });
  }
}

/** «Напомнить» (also the button of a proposed reminder): args — an id or { id }. → { at }. */
exports.remindTask = function (args) {
  var id = args && typeof args === 'object' ? args.id : args;
  var t = db.query('select * from tasks where id = ?', [id])[0];
  if (!t) throw new Error('Нет задачи ' + id);
  var s = settings();
  var now = Date.now();
  var at = t.remindAt && t.remindAt > now + 60000 ? t.remindAt : remindTime(t.due, s, now);
  db.exec('update tasks set remindAt = ?, proposed = 0 where id = ?', [at, id]);
  armReminder(id, at);
  changed('task', t.recordingId);
  return { at: at, text: whenText(at) };
};

exports.cancelReminder = function (id) {
  try { unjob(reminderKey(id)); } catch (error) { /* none */ }
  var t = db.query('select recordingId from tasks where id = ?', [id])[0];
  db.exec('update tasks set remindAt = null, proposed = 0 where id = ?', [id]);
  if (t) changed('task', t.recordingId);
  return true;
};

exports.fireReminder = function (id) {
  var t = db.query('select * from tasks where id = ?', [id])[0];
  try { unjob(reminderKey(id)); } catch (error) { /* a once job is gone by itself */ }
  if (!t || !t.remindAt || t.done) return false;
  db.exec('update tasks set remindAt = null where id = ?', [id]);
  tell('Напоминание: ' + t.text, (t.who && t.who !== 'владелец' ? 'Кто: ' + t.who + '. ' : '') + 'Из Диктофона', ITEM + '?id=' + t.recordingId);
  changed('task', t.recordingId);
  return true;
};

function armReminders() {
  db.query('select id, remindAt from tasks where remindAt is not null and done = 0 and proposed = 0').forEach(function (t) {
    if (t.remindAt <= Date.now()) {
      if (!has('job.once')) exports.fireReminder(t.id);
      else armReminder(t.id, t.remindAt);
    } else {
      armReminder(t.id, t.remindAt);
    }
  });
}

exports.keepAudio = function (id, on) {
  db.exec('update recordings set audioKept = ? where id = ?', [on ? 1 : 0, id]);
  changed('audio', id);
  return true;
};

/** «Удалить звук, оставить текст». */
exports.dropAudio = function (id) {
  var r = row(id);
  if (!r) return false;
  if (LIVE.rec && LIVE.rec.id === r.id) throw new Error('Запись ещё идёт');
  segmentsOf(id).forEach(function (g) { if (g.file) axiko.files.remove(g.file); });
  db.exec('update recordings set audioRemoved = ?, audioKept = 0 where id = ?', [Date.now(), id]);
  changed('audio', id);
  return true;
};

exports.remove = function (id) {
  var r = row(id);
  if (!r) return false;
  if (LIVE.rec && LIVE.rec.id === r.id) exports.stopRecording();
  tasksOf(id).forEach(function (t) { if (t.remindAt) { try { unjob(reminderKey(t.id)); } catch (error) { /* none */ } } });
  axiko.files.remove(dirOf(id));
  dropChunks(id);
  db.exec('delete from segments where recordingId = ?', [id]);
  db.exec('delete from marks where recordingId = ?', [id]);
  db.exec('delete from tasks where recordingId = ?', [id]);
  db.exec('delete from recordings where id = ?', [id]);
  if (r.memoryId) { try { require('lib/memory').remove(r.memoryId); } catch (error) { /* gone */ } }
  if (r.baseId) { try { require('lib/base').remove(r.baseId); } catch (error) { /* gone */ } }
  var imported = axiko.files.readJson(IMPORTED, {});
  Object.keys(imported).forEach(function (k) { if (imported[k] === r.id) delete imported[k]; });
  axiko.files.writeJson(IMPORTED, imported);
  changed('remove', id);
  return true;
};

/** «Пересобрать конспект»: the summary anew (options.clean — clean the text by the model again too). */
exports.rebuild = function (id, options) {
  options = options || {};
  var r = row(id);
  if (!r) throw new Error('Нет записи ' + id);
  if (r.state === 'recording') throw new Error('Запись ещё идёт');
  if (options.clean) db.exec("update segments set cleanedBy = 'code' where recordingId = ?", [id]);
  if (options.kind && ['meeting', 'note', 'lecture'].indexOf(options.kind) >= 0) db.exec('update recordings set kind = ?, mode = ? where id = ?', [options.kind, r.mode === 'import' ? 'import' : options.kind, id]);
  setState(id, 'transcribing', { progress: 'Пересборка' });
  if (options.wait) {
    processRecording(id, { noCommand: true, quiet: options.quiet });
    return exports.item(id);
  }
  spawn(function () { processRecording(id, { noCommand: true }); });
  return true;
};

/** Failed parts once more (and a recording waiting for the charger — now). */
exports.retry = function (id) {
  db.exec("update segments set state = 'wait', tries = 0, error = null where recordingId = ? and state = 'failed'", [id]);
  var r = row(id);
  if (r && (r.state === 'failed' || r.state === 'ready')) setState(id, 'transcribing', { error: null });
  LIVE.force[id] = true;
  kickQueue();
  return true;
};

/** The summary as text: for «Поделиться» and for the agent. */
exports.summaryText = function (id) {
  var it = exports.item(id);
  var s = it.summary || {};
  var lines = [it.title + ' — ' + dateText(it.startedAt) + '.' + new Date(it.startedAt).getFullYear() + ', ' + text.length(it.durationMs)];
  if (s.kind === 'note') {
    lines.push('', s.text || '');
    if (it.tags.length) lines.push('', 'Теги: ' + it.tags.join(', '));
    return lines.join('\n');
  }
  if (s.summary && s.summary.length) lines.push('', 'Кратко:', s.summary.map(function (x) { return '— ' + x; }).join('\n'));
  if (s.decisions && s.decisions.length) lines.push('', 'Решения:', s.decisions.map(function (d) { return '— ' + d.text; }).join('\n'));
  if (it.tasks.length) lines.push('', 'Задачи:', it.tasks.map(function (t) { return (t.done ? '[x] ' : '[ ] ') + t.text + (t.who ? ' — ' + t.who : '') + (t.due ? ', до ' + t.due : ''); }).join('\n'));
  if (s.questions && s.questions.length) lines.push('', 'Открытые вопросы:', s.questions.map(function (q) { return '— ' + q; }).join('\n'));
  return lines.join('\n');
};

exports.share = function (id) {
  axiko.share(exports.summaryText(id));
  return true;
};

/** A text to the clipboard: the summary of a recording (a number) or any text (a string). */
exports.copy = function (what) {
  var value = typeof what === 'number' || /^\d+$/.test(String(what)) ? exports.summaryText(Number(what)) : String(what || '');
  axiko.clipboard.set(value);
  return true;
};

// ---- import of files ------------------------------------------------------------------------------------

/** Audio files in data/uploads/ (from «Поделиться») that are not imported yet. */
exports.uploads = function () {
  var s = settings();
  var imported = axiko.files.readJson(IMPORTED, {});
  var names = [];
  try { names = axiko.files.list('data/uploads'); } catch (error) { return []; }
  var since = Date.now() - s.uploadsDays * 864e5;
  return names.map(String).filter(parts.isAudio).map(function (name) {
    var f = new java.io.File(String(axiko.files.path('data/uploads/' + name)));
    return { name: name, path: 'data/uploads/' + name, size: Number(f.length()), time: Number(f.lastModified()), recordingId: imported[name] || null };
  }).filter(function (u) { return u.time >= since; }).sort(function (a, b) { return b.time - a.time; });
};

function prepareImport(id, path, own) {
  var s = settings();
  var abs = String(axiko.files.path(path));
  var dir = dirOf(id);
  mkdirs(dir);
  var length = phone().duration(abs);
  var list = null;
  var ext = (String(path).split('.').pop() || 'm4a').toLowerCase();
  progress(id, 'Разрезаю файл на отрезки');
  if (length === null || length > s.importWholeMaxMin * 60000) {
    try {
      list = phone().cut(abs, s.partMinutes * 60000, function (n, e) { return axiko.files.path(dir + '/' + parts.partName(n, e)); });
    } catch (error) {
      console.warn('recorder: cut: ' + message(error));
      list = null;
    }
    if (list && !list.length) list = null;
    if (!list) {
      progress(id, 'Разрезаю файл через ffmpeg');
      list = phone().ffmpeg(axiko, abs, axiko.files.path(dir), s.partMinutes * 60, 3600);
      if (list && !list.length) list = null;
    }
    if (!list && length !== null) {
      throw new Error('Файл на ' + text.length(length) + ' не разрезать без ffmpeg: поставьте его в Linux Axiko (apt-get install -y ffmpeg) или пришлите файл в m4a, ogg, mp3 или wav');
    }
  }
  if (!list) {
    var target = dir + '/' + parts.partName(1, ext);
    phone().copy(abs, axiko.files.path(target));
    list = [{ n: 1, path: axiko.files.path(target), offsetMs: 0, durationMs: length || 0 }];
  }
  var root = String(axiko.files.path('')).replace(/\/+$/, '');
  var total = 0;
  list.forEach(function (p) {
    var rel = String(p.path).indexOf(root) === 0 ? String(p.path).slice(root.length).replace(/^\/+/, '') : dir + '/' + String(p.path).split('/').pop();
    db.exec("insert into segments (recordingId, n, offsetMs, durationMs, file, state, tries) values (?, ?, ?, ?, ?, 'wait', 0)", [id, p.n, p.offsetMs, p.durationMs, rel]);
    total = Math.max(total, p.offsetMs + p.durationMs);
  });
  db.exec("update recordings set durationMs = ?, parts = ?, state = 'transcribing', progress = ? where id = ?", [total || length || 0, list.length, 'В очереди на расшифровку', id]);
  if (own) axiko.files.remove(path);
  changed('import', id);
  kickQueue();
}

/** A file of the workspace (data/uploads/…) into the archive: { mode: 'auto' | 'meeting' | 'note' | 'lecture', title, own }. → id. */
exports.importFile = function (path, options) {
  options = options || {};
  var p = String(path || '').replace(/^\/+/, '');
  if (!p || !axiko.files.exists(p)) throw new Error('Нет файла ' + p);
  var name = p.split('/').pop();
  var now = Date.now();
  var f = new java.io.File(String(axiko.files.path(p)));
  var startedAt = Number(f.lastModified()) || now;
  db.exec("insert into recordings (title, mode, kind, startedAt, durationMs, parts, state, origin, sourceName, created, edited, progress) values (?, 'import', ?, ?, 0, 0, 'importing', 'file', ?, ?, ?, ?)",
    [options.title || null, MODES.indexOf(options.mode) > 0 ? options.mode : null, startedAt, options.name || name, now, options.title ? now : null, 'Файл принят']);
  var id = db.lastId();
  if (/^data\/uploads\//.test(p)) {
    var imported = axiko.files.readJson(IMPORTED, {});
    imported[name] = id;
    axiko.files.writeJson(IMPORTED, imported);
  }
  changed('import', id);
  var run = function () {
    try {
      prepareImport(id, p, Boolean(options.own));
    } catch (error) {
      setState(id, 'failed', { error: message(error), progress: null });
    }
  };
  if (options.wait) run(); else spawn(run);
  return id;
};

/** A file picked on the screen comes in pieces of base64: begin → chunk… → end. */
exports.importBegin = function (name) {
  var safe = String(name || 'file').replace(/[\\/:*?"<>|]/g, '_').slice(-80);
  if (!parts.isAudio(safe)) throw new Error('Это не похоже на аудиофайл: ' + safe);
  var token = String(Date.now()) + '-' + Math.floor(Math.random() * 1e6);
  mkdirs(DIR + '/incoming');
  var path = DIR + '/incoming/' + token + '-' + safe;
  axiko.files.write(path, '');
  LIVE.uploads[token] = { path: path, name: safe, bytes: 0 };
  return token;
};

exports.importChunk = function (token, base64) {
  var u = LIVE.uploads[token];
  if (!u) throw new Error('Загрузка прервалась: выберите файл снова');
  u.bytes += phone().append(axiko.files.path(u.path), base64);
  return u.bytes;
};

exports.importEnd = function (token, options) {
  var u = LIVE.uploads[token];
  if (!u) throw new Error('Загрузка прервалась: выберите файл снова');
  delete LIVE.uploads[token];
  options = options || {};
  options.own = true;
  options.name = u.name;
  return exports.importFile(u.path, options);
};

// ---- playing on the phone (when the screen cannot) ---------------------------------------------------------

exports.play = function (file, ms) {
  phone().play(axiko.files.path(String(file).replace(/^\/+/, '')), ms || 0, function (path) { emit('recorder.player', { ended: true, file: file }); });
  return phone().playerState();
};

exports.playerPause = function () {
  phone().playerPause();
  return phone().playerState();
};

exports.playerStop = function () {
  phone().playerStop();
  return true;
};

exports.playerState = function () {
  return phone().playerState();
};

// ---- settings, status, widget, jobs ---------------------------------------------------------------------

exports.settings = function () {
  return { values: settings(), defaults: settingsLib.DEFAULTS, numbers: settingsLib.NUMBERS, choices: settingsLib.CHOICES };
};

exports.saveSettings = function (patch) {
  var next = settingsLib.normalize(Object.assign({}, settings(), patch || {}));
  axiko.files.writeJson(SETTINGS, settingsLib.diff(next));
  job('recorder:clean', { at: next.cleanAt }, function () { require(SELF).clean(); });
  if (patch && patch.transcribeWhen) kickQueue();
  changed('settings', null);
  return next;
};

function roleText(role, inherit) {
  try {
    var m = inherit === false ? native('models.resolve', role, false) : native('models.resolve', role);
    if (!m || !m.provider) return null;
    var local = String(m.provider) === 'local' || /^local:/.test(String(m.baseUrl || ''));
    return { model: m.model ? String(m.model) : String(m.provider), local: local };
  } catch (error) {
    return null;
  }
}

exports.status = function () {
  var waiting = db.query("select count(*) as n from segments where state in ('wait', 'busy')")[0].n;
  var failed = db.query("select count(*) as n from segments where state = 'failed'")[0].n;
  var sp = speech();
  var wake = null;
  try { wake = native('wake.status'); } catch (error) { wake = null; }
  var s = settings();
  return {
    recording: liveOf(LIVE.rec),
    queue: { waiting: Number(waiting), failed: Number(failed), busy: LIVE.queueBusy, processing: Object.keys(LIVE.processing).map(Number) },
    speech: { ready: sp.ready !== false, engine: sp.engine || null, live: Boolean(sp.live && sp.live.active) },
    charging: charging(),
    transcribeWhen: s.transcribeWhen,
    permission: granted('RECORD_AUDIO'),
    calendar: granted('WRITE_CALENDAR'),
    wake: wake ? { on: Boolean(wake.on), name: wake.name || null } : null,
    features: { actions: has('notify.actions'), segments: has('transcribe.segments'), once: has('job.once') },
    models: { clean: roleText('recorder.clean'), note: roleText('recorder.note'), summary: roleText('recorder.summary'), embed: roleText('embed', false) },
    uploads: exports.uploads().filter(function (u) { return !u.recordingId; }).length
  };
};

exports.widget = function () {
  var last = db.query("select * from recordings where state = 'ready' order by startedAt desc limit 1")[0] || null;
  var open = db.query('select count(*) as n from tasks where done = 0')[0].n;
  var w = parts.widget(last ? { title: last.title, durationMs: last.durationMs } : null, Number(open), LIVE.rec, Date.now());
  w.open = LIVE.rec ? SCREEN : last ? ITEM + '?id=' + last.id : SCREEN;
  return w;
};

/** The job at night: the sound of old recordings goes (the text stays), stale uploads of the screen go. */
exports.clean = function () {
  var s = settings();
  var ids = parts.toStrip(db.query('select id, startedAt, state, audioKept, audioRemoved from recordings'), Date.now(), s.keepAudioDays);
  ids.forEach(function (id) { try { exports.dropAudio(id); } catch (error) { /* recording */ } });
  try {
    axiko.files.list(DIR + '/incoming').forEach(function (name) {
      var token = String(name).split('-').slice(0, 2).join('-');
      if (!LIVE.uploads[token] && Number(String(name).split('-')[0]) < Date.now() - 864e5) axiko.files.remove(DIR + '/incoming/' + name);
    });
  } catch (error) { /* no folder */ }
  keptAward();
  return { audioRemoved: ids.length };
};

function installTool() {
  var stub = TOOL_MARK + ' (modules/recorder/tool.js). Файл ставит сам модуль при запуске;\n' +
    '// удалите модуль — заглушка молча выключится.\n' +
    'try {\n  module.exports = require(\'modules/recorder/tool.js\');\n} catch (error) {\n  exports.name = null;\n}\n';
  var there = axiko.files.exists(TOOL_PATH) ? axiko.files.read(TOOL_PATH) : null;
  if (there === stub) return;
  if (there !== null && there.indexOf(TOOL_MARK) !== 0) return;   // the owner's own tool: not ours to replace
  axiko.files.write(TOOL_PATH, stub);
}

/** Runs at every start of the app (module.json "autostart"): events, jobs, the tool, what a crash left. */
exports.start = function () {
  mkdirs(DIR);
  var s = settings();
  installTool();
  on('power', function (event) { return require(SELF).onPower(event); }, 'recorder');
  on('call', function (event) { return require(SELF).onCall(event); }, 'recorder');
  job('recorder:clean', { at: s.cleanAt }, function () { require(SELF).clean(); });
  if (!LIVE.rec) recover();
  if (!LIVE.queueBusy) {
    db.exec("update segments set state = 'wait' where state = 'busy'");
    db.exec("update recordings set state = 'transcribing' where state = 'summarizing'");
    db.exec("update recordings set state = 'failed', error = 'Файл не дошёл до очереди: приложение было закрыто' where state = 'importing'");
  }
  armReminders();
  kickQueue();
  return true;
};

exports.process = processRecording;
exports.paragraphs = function (id) { return paragraphsOfRecording(id, settings()); };
