// Входящие: one feed of the messages from every messenger, gathered from their notifications —
// sorted into "important / later / noise", chatty groups folded into a digest, drafts of
// answers, a reply straight from the feed. The description: docs/modules/inbox.md in Axiko.
//
// The pipeline of a notification: filter (apps, ongoing, empty) -> parse into messages
// (logic/parse.js with parsers.json) -> repeats and edits (logic/dedup.js) -> the owner's rules
// (logic/triage.js) -> a batch to the model inbox.triage -> digests of groups (inbox.digest) ->
// drafts on request (inbox.draft). Everything works without a model: rules first.
//
// Events to the screens: emit('inbox.feed', { type, chatId }). Not "inbox.*": the shell already
// has inbox.peek/add/drop (attachments of the chat), which have nothing to do with this module.
var axiko = require('lib/axiko');
var ai = require('lib/ai');
var parse = require('./logic/parse.js');
var dedup = require('./logic/dedup.js');
var triage = require('./logic/triage.js');
var digestLib = require('./logic/digest.js');
var feed = require('./logic/feed.js');
var settingsLib = require('./logic/settings.js');
var phone = require('./android.js');
var awardsLib = require('./logic/awards.js');
var achieve = require('./achieve.js');
var FACTORY_PARSERS = require('./parsers.json');

var SCREEN = 'modules/inbox/ui/index.html';
var SETTINGS_PATH = 'data/inbox/settings.json';
var PARSERS_PATH = 'data/inbox/parsers.json';
var STATE_PATH = 'data/inbox/state.json';
var ACHIEVED_PATH = 'data/inbox/achievements.json';
var TOOL_PATH = 'tools/inbox.js';
var TOOL_MARK = '// Инструмент модуля «Входящие»';
var MINUTE = 60000;
var HOUR = 3600000;
var DAY = 86400000;
var ROLES = { triage: 'inbox.triage', digest: 'inbox.digest', draft: 'inbox.draft' };

// The app's own notifications: the install id is read from the app (app.axiko, its clean preview),
// and app.axiko still counts for builds made before the rename.
function ownPackage(pkg) {
  var own = typeof context !== 'undefined' && context ? String(context.getPackageName()) : 'app.axiko';
  return pkg.indexOf(own) === 0 || pkg.indexOf('app.axiko') === 0;
}

// What lives as long as the process, kept on the engine's global object: a reload of this file
// (after an edit) must not start a second batch timer or lose the lock.
var G = typeof global !== 'undefined' ? global : {};
var LIVE = G.__inboxLive || (G.__inboxLive = {
  lock: new java.util.concurrent.locks.ReentrantLock(),
  batchArmed: false,
  batchRunning: false,
  digesting: {},
  widgetAt: 0,
  widgetArmed: false,
  counterAt: 0,
  otpArmed: false,
  apps: null,
  appsAt: 0,
  seenApps: null,
  localAt: 0,
  localHas: false,
  why: ''
});

function locked(fn) {
  LIVE.lock.lock();
  try {
    return fn();
  } finally {
    LIVE.lock.unlock();
  }
}

// ---- storage ---------------------------------------------------------------------------------

var db = axiko.db('inbox');

function columns(table) {
  return db.query('pragma table_info(' + table + ')').map(function (row) { return row.name; });
}

function addColumns(table, wanted) {
  var have = columns(table);
  Object.keys(wanted).forEach(function (name) {
    if (have.indexOf(name) < 0) db.exec('alter table ' + table + ' add column ' + name + ' ' + wanted[name]);
  });
}

db.exec('create table if not exists messages (id integer primary key autoincrement, hash text, package text, app text, chatId text, ' +
  'sender text, text text, time integer, noticeKey text, bucket text, reason text, asks integer default 0, edited integer default 0, ' +
  'seen integer default 0, triagedBy text, created integer)');
addColumns('messages', { msgTime: 'integer', tries: 'integer default 0' });
db.exec('create index if not exists messages_chat on messages (chatId, time)');
db.exec('create index if not exists messages_triage on messages (triagedBy)');
db.exec('create index if not exists messages_created on messages (created)');
db.exec('create table if not exists chats (id text primary key, package text, title text, isGroup integer default 0, lastTime integer, ' +
  'unread integer default 0, lastKey text, canReply integer default 0, override text, digest text, digestAt integer default 0, digestCount integer default 0)');
addColumns('chats', { app: 'text', openedAt: 'integer default 0', prefixes: 'text' });
db.exec('create table if not exists drafts (id integer primary key autoincrement, chatId text, text text, source text, created integer, ' +
  'status text, sentAt integer, error text)');
db.exec('create index if not exists drafts_chat on drafts (chatId, status)');

function settings() {
  return settingsLib.normalize(axiko.files.readJson(SETTINGS_PATH, {}));
}

function readState() {
  try {
    return axiko.files.readJson(STATE_PATH, {}) || {};
  } catch (error) {
    return {};
  }
}

function changeState(fn) {
  return locked(function () {
    var state = readState();
    fn(state);
    axiko.files.writeJson(STATE_PATH, state);
    return state;
  });
}

function parsers() {
  var own = null;
  try {
    own = axiko.files.readJson(PARSERS_PATH, null);
  } catch (error) {
    console.error('inbox: ' + PARSERS_PATH + ': ' + error);
  }
  return parse.merge(FACTORY_PARSERS, own);
}

function chatRow(id) {
  var rows = db.query('select * from chats where id = ?', [id]);
  return rows.length ? rows[0] : null;
}

function emitFeed(type, chatId) {
  try {
    emit('inbox.feed', { type: type, chatId: chatId || null });
  } catch (error) { /* no screens */ }
}

/** Redraws the widget at most every few seconds: a burst of messages makes one redraw. */
function refreshWidget() {
  var wait = 5000 - (Date.now() - LIVE.widgetAt);
  if (wait <= 0) {
    LIVE.widgetAt = Date.now();
    try { axiko.widget.refresh('inbox'); } catch (error) { /* no widget */ }
    return;
  }
  if (LIVE.widgetArmed) return;
  LIVE.widgetArmed = true;
  spawn(function () {
    sleep(wait + 50);
    LIVE.widgetArmed = false;
    LIVE.widgetAt = Date.now();
    try { axiko.widget.refresh('inbox'); } catch (error) { /* no widget */ }
  });
}

// ---- which apps ------------------------------------------------------------------------------

function collected(s) {
  if (s.apps) return s.apps;
  if (!LIVE.apps || Date.now() - LIVE.appsAt > HOUR) {
    LIVE.apps = parse.KNOWN.filter(phone.installed);
    LIVE.appsAt = Date.now();
  }
  return LIVE.apps;
}

/** Remembers which apps sent notifications: the settings offer them to choose from. */
function rememberApp(pkg, app) {
  if (!LIVE.seenApps) LIVE.seenApps = readState().seenApps || {};
  if (LIVE.seenApps[pkg]) return;
  LIVE.seenApps[pkg] = { app: String(app || ''), first: Date.now() };
  changeState(function (state) {
    state.seenApps = state.seenApps || {};
    state.seenApps[pkg] = LIVE.seenApps[pkg];
  });
}

// ---- the model: where texts may go -----------------------------------------------------------

function localModelThere() {
  if (Date.now() - LIVE.localAt < 10 * MINUTE) return LIVE.localHas;
  var has = false;
  try {
    (native('local.status') || []).forEach(function (model) {
      if (model.installed && !model.embedding) has = true;
    });
  } catch (error) { /* no models on the phone */ }
  LIVE.localHas = has;
  LIVE.localAt = Date.now();
  return has;
}

/**
 * May the texts go to the model of this role now? { ok, local, why }.
 *   'off'   — triage and digests are off; drafts only when the owner asks.
 *   'local' — only a model on the phone, for everything.
 *   'cloud' — whatever model the role has.
 *   'auto'  — on the phone when a model is downloaded there, otherwise the cloud.
 * `asked`: the owner pressed "Предложить ответ" — in 'auto' and 'off' the draft model is used as assigned.
 */
function route(role, s, asked) {
  var mode = s.triageMode;
  if (mode === 'off' && !(role === ROLES.draft && asked)) return { ok: false, why: 'Разбор моделью выключен в настройках' };
  var blocked = Number(readState().modelBlockedUntil || 0);
  if (!asked && blocked > Date.now()) {
    return { ok: false, why: 'Модель отказала (' + (readState().modelError || 'ошибка') + '). Повторю около ' + clock(blocked) };
  }
  var target;
  try {
    target = native('models.resolve', role);
  } catch (error) {
    return { ok: false, why: 'Модель не настроена: ' + message(error) };
  }
  var local = String((target && target.baseUrl) || '').indexOf('local:') === 0;
  var title = { 'inbox.triage': 'Входящие: разбор', 'inbox.digest': 'Входящие: выжимка групп', 'inbox.draft': 'Входящие: черновики ответов' }[role] || role;
  if (mode === 'local' && !local) {
    return { ok: false, why: 'Тексты можно отдавать только модели на телефоне, а роли «' + title + '» назначена облачная' };
  }
  // 'auto': sorting and digests go to the phone's model when one is downloaded. A role the owner
  // left unassigned is given that model; a cloud model the owner chose for the role stays the owner's choice.
  // Drafts want a strong model and go wherever their role points.
  if (mode === 'auto' && !local && role !== ROLES.draft && localModelThere() && adoptLocal(role)) {
    try {
      target = native('models.resolve', role);
      local = String((target && target.baseUrl) || '').indexOf('local:') === 0;
    } catch (error) {
      return { ok: false, why: 'Модель не настроена: ' + message(error) };
    }
  }
  return { ok: true, local: local, model: target ? String(target.model || '') : '' };
}

/**
 * 'auto' and a model downloaded on the phone: a role with no model of its own is given the
 * phone's model (the line "Кто на какой модели" in the settings shows it). True when it was.
 */
function adoptLocal(role) {
  try {
    var provider = null;
    (native('models.providers') || []).forEach(function (item) {
      if (!provider && String(item.baseUrl || '').indexOf('local:') === 0) provider = item;
    });
    if (!provider) return false;
    var model = null;
    (native('local.status') || []).forEach(function (item) {
      if (!model && item.installed && !item.embedding) model = item.id;
    });
    if (!model) return false;
    var roles = native('models.roles') || {};
    if (roles[role] && roles[role].model) return false;
    roles[role] = { provider: String(provider.id), model: String(model) };
    native('models.setRoles', roles);
    console.log('inbox: the role ' + role + ' is given the model on the phone: ' + model);
    return true;
  } catch (error) {
    console.warn('inbox: the model on the phone: ' + message(error));
    return false;
  }
}

function message(error) {
  var text = String(error && error.message ? error.message : error);
  return text.replace(/^[\w.$]+(Exception|Error):\s*/, '').slice(0, 300);
}

function clock(time) {
  var date = new Date(time);
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  return pad(date.getHours()) + ':' + pad(date.getMinutes());
}

/** A refusal of the model (the daily limit, the network): no more requests for a while, then again. */
function block(error) {
  var s = settings();
  var until = Date.now() + s.retryMin * MINUTE;
  changeState(function (state) {
    state.modelBlockedUntil = until;
    state.modelError = message(error).slice(0, 160);
  });
  console.warn('inbox: the model refused, again after ' + clock(until) + ': ' + message(error));
  try {
    job('inbox:retry', { every: s.retryMin }, function () { require('modules/inbox/main.js').retry(); });
  } catch (jobError) { /* the next message will try */ }
}

function unblock() {
  var state = readState();
  if (!state.modelBlockedUntil) return;
  changeState(function (next) {
    delete next.modelBlockedUntil;
    delete next.modelError;
  });
  try { unjob('inbox:retry'); } catch (error) { /* none */ }
}

function readJson(text) {
  var value = String(text || '').replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
  var start = value.indexOf('{');
  var end = value.lastIndexOf('}');
  if (start >= 0 && end > start) value = value.slice(start, end + 1);
  return JSON.parse(value);
}

/** One request to a role; the answer's text. Throws what the shell throws (limit, network). */
function ask(role, request, json, local, temperature) {
  var options = { role: role, system: request.system, prompt: request.prompt, temperature: temperature };
  if (json && !local) options.response_format = { type: 'json_object' };
  return ai.ask(options);
}

// ---- reading a notification ------------------------------------------------------------------

/** The notification with what the shell does not pass yet, read from the live notification. */
function enrich(notice) {
  if (phone.has('notice.full') || !notice.key) return notice;
  var more = null;
  try {
    more = phone.describe(notice.key);
  } catch (error) {
    more = null;
  }
  if (!more) return notice;
  var out = {};
  Object.keys(notice).forEach(function (key) { out[key] = notice[key]; });
  Object.keys(more).forEach(function (key) {
    if (more[key] !== undefined && more[key] !== null && more[key] !== '' && (out[key] === undefined || out[key] === null || out[key] === '')) out[key] = more[key];
  });
  if (more.messages && more.messages.length && !(notice.messages && notice.messages.length)) out.messages = more.messages;
  return out;
}

/**
 * A notification of any app: the module's handler of on('notification'). Returns what happened
 * ({ chatId, added, edited } or { skipped }). options.test: take it whatever the app (checks),
 * options.noModel: do not call the model afterwards.
 */
exports.handle = function (notice, options) {
  options = options || {};
  if (!notice || !notice.package) return { skipped: 'empty' };
  var pkg = String(notice.package);
  if (ownPackage(pkg)) return { skipped: 'own' };
  var s = settings();
  if (!options.test) rememberApp(pkg, notice.app);
  if (!options.test && collected(s).indexOf(pkg) < 0) return { skipped: 'app' };
  if (notice.ongoing) return { skipped: 'ongoing' };
  var full = options.test ? notice : enrich(notice);
  var all = parsers();
  var parser = parse.parserFor(pkg, all);
  var parsed = parse.parseNotice(full, parser, function (title) {
    var chat = chatRow(parse.chatId(pkg, title, full.user));
    return Boolean(chat && chat.isGroup);
  });
  if (parsed.skip) return { skipped: parsed.skip };
  var outcome = ingest(pkg, full, parsed, parser, all, s);
  if (!outcome.skipped) after(outcome, s, options);
  return outcome;
};

function ingest(pkg, notice, parsed, parser, all, s) {
  var now = Date.now();
  var chatId = parse.chatId(pkg, parsed.chat, notice.user);
  // SMS apps show a number: the contact's name reads better (the id stays by the number).
  var display = parsed.chat;
  if (/^[+\d][\d\s()-]{4,}$/.test(display)) display = phone.contactName(display) || display;
  var appName = String(notice.app || '') || parse.appName(pkg, all) || pkg;
  return locked(function () {
    var chat = chatRow(chatId);
    if (chat && chat.override === 'off') return { skipped: 'off', chatId: chatId };
    if (!chat) {
      db.exec('insert into chats (id, package, app, title, isGroup, lastTime, unread, lastKey, canReply, override, digest, digestAt, digestCount, openedAt, prefixes) ' +
        'values (?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?, 0, 0, 0, ?)', [chatId, pkg, appName, display, parsed.isGroup ? 1 : 0, notice.key || '', notice.canReply ? 1 : 0, '', '', '[]']);
      chat = chatRow(chatId);
    }
    var list = parsed.messages;
    var becameGroup = false;
    if (!chat.isGroup && parsed.isGroup) {
      becameGroup = true;
    } else if (!chat.isGroup && !parsed.groupSure && list.length === 1 && !list[0].hidden) {
      var prefixes = [];
      try { prefixes = JSON.parse(chat.prefixes || '[]'); } catch (error) { prefixes = []; }
      prefixes.push(parsed.prefix || '');
      prefixes = prefixes.slice(-10);
      if (parse.looksGroup(prefixes, s.groupPrefixes)) becameGroup = true;
      db.exec('update chats set prefixes = ? where id = ?', [JSON.stringify(prefixes), chatId]);
    }
    if (becameGroup) {
      db.exec('update chats set isGroup = 1 where id = ?', [chatId]);
      chat.isGroup = 1;
      // Its earlier messages were stored as "Петя: текст" from the chat itself: split them now.
      var earlier = db.query('select id, sender, text from messages where chatId = ?', [chatId]);
      parse.reparse(earlier, chat.title, parser).forEach(function (update) {
        db.exec('update messages set sender = ?, text = ?, hash = ? where id = ?', [update.sender, update.text, dedup.hash(pkg, chatId, update.sender, update.text), update.id]);
      });
      if (!parsed.isGroup) {
        var split = parse.splitText(list[0].text, parser, true);
        if (split) list = [{ sender: split.sender, text: split.text, time: list[0].time, msgTime: list[0].msgTime, hidden: false, otp: parse.isOtp(split.text) }];
      }
    }
    var recent = db.query('select id, hash, sender, text, time, msgTime, bucket from messages where chatId = ? order by time desc limit 80', [chatId]);
    recent.forEach(function (row) { row.hidden = feed.isHidden(row); });
    var added = [];
    var edited = [];
    var newest = chat.lastTime || 0;
    list.forEach(function (item) {
      var sender = item.sender || '';
      if (sender && /^[+\d][\d\s()-]{4,}$/.test(sender)) sender = phone.contactName(sender) || sender;
      var time = item.time || now;
      var hashText = item.hidden ? 'hidden:' + (item.msgTime || time) : item.text;
      var candidate = { hash: dedup.hash(pkg, chatId, sender, hashText), sender: sender, text: item.text, time: time, msgTime: item.msgTime || null, hidden: item.hidden };
      var verdict = dedup.classify(candidate, recent, s);
      if (verdict.kind === 'repeat') return;
      if (verdict.kind === 'edit') {
        var sort = triage.initial({ sender: sender, text: item.text, otp: parse.isOtp(item.text) }, chat, s);
        db.exec('update messages set text = ?, hash = ?, edited = 1, bucket = ?, reason = ?, asks = ?, triagedBy = ?, tries = 0, seen = 0, noticeKey = ? where id = ?',
          [item.text, candidate.hash, sort.bucket, sort.reason, sort.asks ? 1 : 0, sort.by, notice.key || '', verdict.of]);
        recent.forEach(function (row) {
          if (row.id === verdict.of) {
            row.text = item.text;
            row.hash = candidate.hash;
          }
        });
        edited.push({ id: verdict.of, bucket: sort.bucket, by: sort.by });
        return;
      }
      var text = verdict.text;
      var otp = !item.hidden && parse.isOtp(text);
      var sorted = triage.initial({ sender: sender, text: text, otp: otp, hidden: item.hidden }, chat, s);
      var hash = text === item.text ? candidate.hash : dedup.hash(pkg, chatId, sender, text);
      db.exec('insert into messages (hash, package, app, chatId, sender, text, time, msgTime, noticeKey, bucket, reason, asks, edited, seen, triagedBy, tries, created) ' +
        'values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, 0, ?)',
        [hash, pkg, appName, chatId, sender, text, time, item.msgTime || null, notice.key || '', sorted.bucket, sorted.reason, sorted.asks ? 1 : 0, sorted.by, now]);
      var id = db.lastId();
      recent.unshift({ id: id, hash: hash, sender: sender, text: text, time: time, msgTime: item.msgTime || null, bucket: sorted.bucket, hidden: item.hidden });
      added.push({ id: id, bucket: sorted.bucket, by: sorted.by, otp: otp });
      if (time > newest) newest = time;
    });
    db.exec('update chats set lastTime = ?, unread = unread + ?, lastKey = ?, canReply = ?, app = ?, title = ? where id = ?',
      [Math.max(newest, chat.lastTime || 0) || now, added.length, notice.key || chat.lastKey || '', notice.canReply ? 1 : 0, appName, display, chatId]);
    return { chatId: chatId, isGroup: Boolean(chat.isGroup), added: added, edited: edited };
  });
}

function after(outcome, s, options) {
  var fresh = outcome.added.concat(outcome.edited);
  if (!fresh.length) return;
  emitFeed('message', outcome.chatId);
  refreshWidget();
  if (options.test) return;   // the checks: no notifications, no model, no counters
  var otps = outcome.added.filter(function (item) { return item.otp; });
  if (otps.length) {
    var day = feed.day(Date.now()).key;
    changeState(function (state) {
      state.otpCount = state.otpCount || {};
      state.otpCount[day] = (state.otpCount[day] || 0) + otps.length;
    });
    armOtpClean(s);
  }
  // A guess without the model (by: 'none') repeats and drafts only when the owner chose guessing.
  var important = fresh.filter(function (item) {
    return item.bucket === 'important' && (item.by !== 'none' || s.heuristics === true);
  }).map(function (item) { return item.id; });
  if (important.length) importantArrived(important, s, false);
  if (!options.noModel && fresh.some(function (item) { return item.by === 'none'; })) scheduleBatch(s.batchDelaySec * 1000);
  if (!options.noModel && outcome.isGroup) dueDigests([outcome.chatId], false);
  try { syncCounter(false); } catch (error) { console.warn('inbox: counter: ' + error); }
}

// ---- codes: kept for minutes only --------------------------------------------------------------

function cleanOtp(s) {
  db.exec("delete from messages where bucket = 'otp' and created < ?", [Date.now() - (s || settings()).otpKeepMin * MINUTE]);
}

function armOtpClean(s) {
  if (LIVE.otpArmed) return;
  LIVE.otpArmed = true;
  spawn(function () {
    sleep(s.otpKeepMin * MINUTE + 1000);
    LIVE.otpArmed = false;
    try {
      cleanOtp(null);
      emitFeed('clean', null);
      if (db.query("select count(*) as n from messages where bucket = 'otp'")[0].n > 0) armOtpClean(settings());
    } catch (error) {
      console.warn('inbox: codes: ' + error);
    }
  });
}

// ---- sorting by the model, in batches ----------------------------------------------------------

function scheduleBatch(delayMs) {
  if (LIVE.batchArmed) return;
  LIVE.batchArmed = true;
  spawn(function () {
    try { sleep(Math.max(0, delayMs)); } catch (error) { /* woken */ }
    LIVE.batchArmed = false;
    try {
      runBatches();
    } catch (error) {
      console.error('inbox: triage: ' + error);
    }
  });
}

function pendingCount() {
  return db.query("select count(*) as n from messages where triagedBy = 'none' and bucket not in ('otp', 'hidden')")[0].n;
}

/** One request for up to batchSize messages not sorted yet. Returns how many were taken, -1 when the model may not be asked. */
function triageOnce(s) {
  var r = route(ROLES.triage, s, false);
  if (!r.ok) {
    LIVE.why = r.why;
    return -1;
  }
  var size = r.local ? Math.min(s.batchSize, s.localBatchSize) : s.batchSize;
  var pending = db.query("select m.id, m.sender, m.text, m.app, m.chatId, m.tries, c.title, c.isGroup from messages m left join chats c on c.id = m.chatId " +
    "where m.triagedBy = 'none' and m.bucket not in ('otp', 'hidden') order by m.time limit " + Number(size));
  if (!pending.length) return 0;
  var tuned = {};
  Object.keys(s).forEach(function (key) { tuned[key] = s[key]; });
  if (r.local) tuned.lineChars = Math.min(s.lineChars, s.localLineChars);
  var request = triage.prompt(pending.map(function (row) {
    return { id: row.id, app: row.app, chat: row.title || '', isGroup: row.isGroup, sender: row.sender, text: row.text };
  }), tuned);
  var answer;
  try {
    answer = ask(ROLES.triage, request, true, r.local, 0);
  } catch (error) {
    LIVE.why = message(error);
    block(error);
    return -1;
  }
  unblock();
  LIVE.why = '';
  var read = {};
  try {
    read = triage.read(readJson(answer), request.ids);
  } catch (error) {
    console.warn('inbox: the triage answer is not JSON: ' + String(answer).slice(0, 200));
  }
  var important = [];
  var chats = {};
  locked(function () {
    pending.forEach(function (row) {
      var got = read[row.id];
      chats[row.chatId] = true;
      if (got) {
        db.exec("update messages set bucket = ?, reason = ?, asks = ?, triagedBy = 'model', tries = tries + 1 where id = ? and triagedBy = 'none'",
          [got.bucket, got.reason, got.asks ? 1 : 0, row.id]);
        if (got.bucket === 'important') important.push(row.id);
      } else if ((row.tries || 0) + 1 >= s.maxTries) {
        db.exec("update messages set triagedBy = 'model', reason = 'модель не ответила', tries = tries + 1 where id = ? and triagedBy = 'none'", [row.id]);
      } else {
        db.exec('update messages set tries = tries + 1 where id = ?', [row.id]);
      }
    });
  });
  if (important.length) importantArrived(important, s, true);
  emitFeed('triaged', null);
  refreshWidget();
  dueDigests(Object.keys(chats), false);
  return pending.length;
}

function runBatches() {
  if (LIVE.batchRunning) return;
  LIVE.batchRunning = true;
  try {
    var s = settings();
    for (var round = 0; round < 50; round++) {
      var taken = triageOnce(s);
      if (taken <= 0) break;
      if (pendingCount() === 0) break;
      sleep(s.batchDelaySec * 1000);   // the model is asked at most once per this delay
      s = settings();
    }
    try { syncCounter(false); } catch (error) { /* next time */ }
  } finally {
    LIVE.batchRunning = false;
  }
}

/** The retry job after a refusal of the model: sort what waits. */
exports.retry = function () {
  changeState(function (state) { delete state.modelBlockedUntil; });
  if (pendingCount() > 0) {
    scheduleBatch(0);
  } else {
    try { unjob('inbox:retry'); } catch (error) { /* none */ }
  }
};

/**
 * Sorts one batch of the waiting messages now (the screen's button); the rest follow in the
 * background. Returns { sorted, left, why, busy }.
 */
exports.triageNow = function () {
  if (LIVE.batchRunning) return { sorted: 0, left: pendingCount(), why: '', busy: true };
  var s = settings();
  var before = pendingCount();
  changeState(function (state) { delete state.modelBlockedUntil; });
  LIVE.batchRunning = true;
  var taken;
  try {
    taken = triageOnce(s);
  } finally {
    LIVE.batchRunning = false;
  }
  var left = pendingCount();
  if (taken > 0 && left > 0) scheduleBatch(s.batchDelaySec * 1000);
  return { sorted: before - left, left: left, why: taken < 0 ? LIVE.why : '' };
};

// ---- what follows an important message ----------------------------------------------------------

function importantArrived(ids, s, byModel) {
  if (!ids.length) return;
  var rows = db.query('select m.id, m.chatId, m.sender, m.text, m.bucket, c.title, c.isGroup, c.canReply from messages m join chats c on c.id = m.chatId where m.id in (' +
    ids.map(function (id) { return Number(id); }).join(',') + ')');
  try {
    repeat(rows, s);
  } catch (error) {
    console.warn('inbox: repeat: ' + error);
  }
  if (s.autoDrafts) {
    var chats = {};
    rows.forEach(function (row) { if (row.canReply) chats[row.chatId] = true; });
    Object.keys(chats).forEach(function (chatId) {
      spawn(function () {
        try {
          exports.suggest(chatId, { auto: true });
        } catch (error) {
          console.warn('inbox: drafts: ' + error);
        }
      });
    });
  }
}

/**
 * "Повторять важное": while "do not disturb" is on (the owner's setting), or while Focus asked
 * for it (repeatImportant), an important message is repeated with Axiko's own notification — at
 * most once per repeatEveryMin for one chat.
 */
function repeat(rows, s) {
  var state = readState();
  var now = Date.now();
  var during = state.repeat && Number(state.repeat.until) > now ? state.repeat : null;
  var mine = s.repeatImportant && phone.dndOn();
  if (!mine && !during) return;
  var last = state.lastRepeat || {};
  var changed = false;
  rows.forEach(function (row) {
    if (row.bucket !== 'important') return;
    var name = row.isGroup ? row.sender : row.title;
    if (!mine) {
      var people = during.people || [];
      var wanted = !people.length || people.some(function (person) {
        return triage.sameName(person, row.sender) || (!row.isGroup && triage.sameName(person, row.title));
      });
      if (!wanted) return;
    }
    var every = (mine ? s.repeatEveryMin : Number(during.everyMin) || s.repeatEveryMin) * MINUTE;
    if (now - (last[row.chatId] || 0) < every) return;
    last[row.chatId] = now;
    changed = true;
    var whose = parse.genitive(name);
    var title = (whose ? 'Важное от ' + whose : 'Важное · ' + name) + (row.isGroup ? ' · ' + row.title : '');
    phone.notifyImportant({ chatId: row.chatId, title: title, text: row.text || 'Текст скрыт приложением', canReply: Boolean(row.canReply) });
  });
  if (changed) {
    changeState(function (next) {
      next.lastRepeat = next.lastRepeat || {};
      Object.keys(last).forEach(function (chatId) {
        if (now - last[chatId] < DAY) next.lastRepeat[chatId] = last[chatId];
      });
    });
  }
}

/**
 * Focus asks to repeat important messages for the time of a session:
 *   repeatImportant({ until, people: ['Петя'], everyMin: 15, from: 'focus' }); repeatImportant(null) — stop.
 */
exports.repeatImportant = function (options) {
  changeState(function (state) {
    state.repeat = options ? {
      until: Number(options.until) || 0,
      people: settingsLib.list(options.people),
      everyMin: Number(options.everyMin) || 15,
      from: String(options.from || '')
    } : null;
  });
  return true;
};

// ---- digests of groups ---------------------------------------------------------------------------

function groupStats(chat) {
  var stats = db.query("select count(*) as unread, min(time) as oldest from messages where chatId = ? and seen = 0 and bucket != 'otp'", [chat.id])[0];
  var since = db.query("select count(*) as n from messages where chatId = ? and created > ? and bucket != 'otp'", [chat.id, chat.digestAt || 0])[0];
  return { unread: stats.unread || 0, oldestUnread: stats.oldest || Date.now(), sinceDigest: since.n || 0 };
}

/** Makes the digests that are due, in the background (one chat at a time). */
function dueDigests(chatIds, opened) {
  var s = settings();
  if (!route(ROLES.digest, s, false).ok) return;
  var now = Date.now();
  var due = [];
  chatIds.forEach(function (id) {
    var chat = chatRow(id);
    if (!chat || !chat.isGroup || LIVE.digesting[id]) return;
    if (digestLib.due(chat, groupStats(chat), now, s, opened)) due.push(id);
  });
  if (!due.length) return;
  spawn(function () {
    due.forEach(function (id) {
      try {
        makeDigest(id, false);
      } catch (error) {
        console.warn('inbox: digest: ' + error);
      }
    });
  });
}

function makeDigest(chatId, asked) {
  if (LIVE.digesting[chatId]) return null;
  var s = settings();
  var r = route(ROLES.digest, s, asked);
  if (!r.ok) return { ok: false, why: r.why };
  var chat = chatRow(chatId);
  if (!chat) return { ok: false, why: 'Нет такой беседы' };
  LIVE.digesting[chatId] = true;
  try {
    var unread = db.query("select sender, text, bucket from messages where chatId = ? and seen = 0 and bucket != 'otp' order by time desc limit " + Number(s.digestMessages), [chatId]);
    var rows = unread.length >= 3 ? unread : db.query("select sender, text, bucket from messages where chatId = ? and bucket != 'otp' order by time desc limit " + Number(s.digestMessages), [chatId]);
    rows.reverse();
    rows.forEach(function (row) { row.hidden = feed.isHidden(row); });
    if (!rows.length) return { ok: false, why: 'Пересказывать нечего' };
    var tuned = s;
    if (r.local) {
      tuned = {};
      Object.keys(s).forEach(function (key) { tuned[key] = s[key]; });
      tuned.lineChars = Math.min(s.lineChars, s.localLineChars);
    }
    var text;
    try {
      text = digestLib.tidy(ask(ROLES.digest, digestLib.prompt(chat.title, rows, tuned), false, r.local, 0.2));
    } catch (error) {
      if (!asked) block(error);
      return { ok: false, why: message(error) };
    }
    if (!text) return { ok: false, why: 'Модель ничего не ответила' };
    var count = db.query("select count(*) as n from messages where chatId = ? and bucket != 'otp'", [chatId])[0].n;
    db.exec('update chats set digest = ?, digestAt = ?, digestCount = ? where id = ?', [text, Date.now(), count, chatId]);
    emitFeed('digest', chatId);
    refreshWidget();
    return { ok: true, digest: text };
  } finally {
    delete LIVE.digesting[chatId];
  }
}

/** The owner asked for a digest of a group now. */
exports.digestNow = function (chatId) {
  return makeDigest(chatId, true);
};

// ---- the feed --------------------------------------------------------------------------------------

function cards(s) {
  var chats = db.query("select * from chats where override is null or override != 'off' order by lastTime desc limit 400");
  if (!chats.length) return [];
  var unread = db.query('select id, chatId, sender, text, time, bucket, reason, asks, triagedBy, edited from messages where seen = 0 order by time');
  var byChat = {};
  unread.forEach(function (row) { (byChat[row.chatId] = byChat[row.chatId] || []).push(row); });
  var lasts = db.query('select m.* from messages m join (select chatId, max(id) as top from messages group by chatId) x on x.top = m.id');
  var lastBy = {};
  lasts.forEach(function (row) { lastBy[row.chatId] = row; });
  return chats.map(function (chat) {
    var mine = byChat[chat.id] || [];
    var card = feed.card(chat, lastBy[chat.id] || null, mine);
    // A model's digest is shown while it is about what is new; otherwise a plain one.
    if (chat.isGroup && !(chat.digest && (chat.digestAt || 0) > (chat.openedAt || 0))) {
      card.digest = mine.length >= 2 ? digestLib.plain(mine.map(function (row) {
        return { sender: row.sender, text: row.text, hidden: feed.isHidden(row), asks: row.asks };
      }), s.names) : '';
      card.digestBy = card.digest ? 'rule' : '';
    } else if (chat.isGroup) {
      card.digestBy = 'model';
    }
    return card;
  });
}

/** Every conversation as a card, for the widget and the screen. */
exports.cards = function () {
  return cards(settings());
};

/**
 * The feed for the screen: { counts, tab, cards, status }. opened: the owner is looking now —
 * digests of the groups that are due get made.
 */
exports.feed = function (tab, opened) {
  var s = settings();
  cleanOtp(s);
  var all = cards(s);
  var counts = feed.counts(all);
  var which = ['important', 'later', 'noise', 'all'].indexOf(tab) >= 0 ? tab : feed.firstTab(counts);
  var shown = feed.tab(all, which);
  shown.forEach(function (card) { card.icon = phone.icon(card.package); });
  if (opened) {
    dueDigests(all.filter(function (card) { return card.isGroup && card.fresh; }).map(function (card) { return card.id; }), true);
    if (pendingCount() > 0 && !LIVE.batchRunning) scheduleBatch(0);
  }
  return { counts: counts, tab: which, cards: shown, status: exports.status() };
};

/** What the screen says about the module's health: notification access, the model, the shell. */
exports.status = function () {
  var s = settings();
  var notices = false;
  try { notices = Boolean(native('sense.status').notices); } catch (error) { notices = false; }
  var r = route(ROLES.triage, s, false);
  var state = readState();
  return {
    notices: notices,
    apps: collected(s),
    mode: s.triageMode,
    model: r.ok,
    why: r.ok ? '' : r.why,
    pending: pendingCount(),
    blockedUntil: state.modelBlockedUntil || 0,
    features: phone.features(),
    full: phone.has('notice.full'),
    removed: phone.has('notice.removed')
  };
};

/** The key of a live notification of the chat with a reply action, or null. */
function liveKey(chat) {
  var active;
  try {
    active = axiko.notifications.active() || [];
  } catch (error) {
    return null;
  }
  var i;
  for (i = 0; i < active.length; i++) {
    if (active[i].key === chat.lastKey && active[i].canReply) return active[i].key;
  }
  // The messenger may have posted the conversation again under another key.
  var all = parsers();
  for (i = 0; i < active.length; i++) {
    var item = active[i];
    if (item.package !== chat.package || !item.canReply) continue;
    var parsed = parse.parseNotice(item, parse.parserFor(item.package, all), function () { return Boolean(chat.isGroup); });
    if (!parsed.skip && parse.chatId(item.package, parsed.chat, item.user) === chat.id) return item.key;
  }
  return null;
}

function ownSent(chatId, limit) {
  return db.query("select id, text, sentAt as time from drafts where chatId = ? and status = 'sent' order by sentAt desc limit " + Number(limit), [chatId])
    .map(function (row) { return { id: 'sent' + row.id, own: true, sender: 'Вы', text: row.text, time: row.time, bucket: '' }; });
}

/** One conversation: { chat, messages (oldest first), drafts, canReply, quick, model }. */
exports.chat = function (chatId) {
  var s = settings();
  var chat = chatRow(chatId);
  if (!chat) throw new Error('Такой беседы нет: возможно, она уже удалена');
  var rows = db.query('select id, sender, text, time, bucket, reason, asks, edited, seen, triagedBy from messages where chatId = ? order by time desc limit ' + Number(s.pageSize), [chatId]);
  rows.forEach(function (row) { row.hidden = feed.isHidden(row); });
  var list = rows.concat(ownSent(chatId, s.pageSize)).sort(function (a, b) { return a.time - b.time; });
  var drafts = db.query("select id, text, source, created from drafts where chatId = ? and status = 'new' order by created desc limit 6", [chatId]);
  var key = liveKey(chat);
  if (Boolean(key) !== Boolean(chat.canReply)) db.exec('update chats set canReply = ? where id = ?', [key ? 1 : 0, chatId]);
  var draftRoute = route(ROLES.draft, s, true);
  return {
    chat: {
      id: chat.id, title: chat.title, app: chat.app || chat.package, package: chat.package, isGroup: Boolean(chat.isGroup),
      override: chat.override || '', digest: chat.isGroup ? chat.digest || '' : '', digestAt: chat.digestAt || 0,
      icon: phone.icon(chat.package)
    },
    messages: list,
    drafts: drafts,
    canReply: Boolean(key),
    quick: s.quickReplies,
    model: draftRoute.ok,
    modelWhy: draftRoute.ok ? '' : draftRoute.why
  };
};

/** The owner opened the conversation: it is read. Returns chat(). */
exports.open = function (chatId) {
  exports.markRead(chatId);
  return exports.chat(chatId);
};

exports.markRead = function (chatId) {
  locked(function () {
    db.exec('update messages set seen = 1 where chatId = ? and seen = 0', [chatId]);
    db.exec('update chats set unread = 0, openedAt = ? where id = ?', [Date.now(), chatId]);
  });
  try { phone.cancelImportant(chatId); } catch (error) { /* none */ }
  emitFeed('read', chatId);
  refreshWidget();
  awards(false);
  return true;
};

/** Marks read every conversation of a tab ('important' | 'later' | 'noise' | 'all'). */
exports.markAllRead = function (tab) {
  var s = settings();
  var ids = feed.tab(cards(s), tab || 'all').map(function (card) { return card.id; });
  locked(function () {
    ids.forEach(function (id) {
      db.exec('update messages set seen = 1 where chatId = ? and seen = 0', [id]);
      db.exec('update chats set unread = 0, openedAt = ? where id = ?', [Date.now(), id]);
    });
  });
  emitFeed('read', null);
  refreshWidget();
  awards(false);
  return ids.length;
};

/**
 * The owner's rule for a chat: 'important' | 'noise' (always), 'off' (do not collect), '' (as usual).
 * The new messages of the chat are moved at once.
 */
exports.setOverride = function (chatId, value) {
  var rule = ['important', 'noise', 'off', ''].indexOf(value) >= 0 ? value : '';
  locked(function () {
    db.exec('update chats set override = ? where id = ?', [rule, chatId]);
    if (rule === 'important' || rule === 'noise') {
      db.exec("update messages set bucket = ?, reason = ?, triagedBy = 'rule' where chatId = ? and seen = 0 and bucket not in ('otp', 'hidden')",
        [rule, rule === 'important' ? 'всегда важно' : 'всегда шум', chatId]);
    }
  });
  emitFeed('rule', chatId);
  refreshWidget();
  return rule;
};

/** Opens the conversation in its messenger. Returns how: 'notice' | 'intent' | 'app' | null. */
exports.openApp = function (chatId) {
  var chat = chatRow(chatId);
  if (!chat) return null;
  return phone.open(chat.lastKey, chat.package);
};

// ---- drafts and answers ---------------------------------------------------------------------

/**
 * Drafts of an answer from inbox.draft: { drafts: [{ id, text }], quick, why }. Without a model —
 * no drafts, the quick replies of the settings and the reason.
 */
exports.suggest = function (chatId, options) {
  options = options || {};
  var s = settings();
  var chat = chatRow(chatId);
  if (!chat) throw new Error('Такой беседы нет');
  var r = route(ROLES.draft, s, !options.auto);
  if (!r.ok) return { drafts: [], quick: s.quickReplies, why: r.why };
  if (options.auto) {
    var fresh = db.query("select count(*) as n from drafts where chatId = ? and status = 'new' and created > ?", [chatId, Date.now() - HOUR])[0].n;
    if (fresh > 0) return { drafts: [], quick: s.quickReplies, why: '' };
  }
  var rows = db.query("select sender, text, time, bucket from messages where chatId = ? and bucket != 'otp' order by time desc limit " + Number(s.draftContext), [chatId]);
  var list = rows.map(function (row) { return { sender: row.sender, text: row.text, time: row.time, hidden: feed.isHidden(row) }; })
    .concat(ownSent(chatId, s.draftContext)).sort(function (a, b) { return a.time - b.time; }).slice(-s.draftContext);
  var person = chat.title;
  if (chat.isGroup) {
    var incoming = list.filter(function (row) { return !row.own && row.sender; });
    person = incoming.length ? incoming[incoming.length - 1].sender : chat.title;
  }
  var memory = [];
  if (s.memoryHits > 0) {
    try {
      memory = require('lib/memory').search(person, s.memoryHits).map(function (row) { return row.text; });
    } catch (error) { memory = []; }
  }
  var answer;
  try {
    answer = digestLib.readDrafts(readJson(ask(ROLES.draft, digestLib.draftPrompt(chat, list, memory, s), true, r.local, 0.7)), s.draftCount);
  } catch (error) {
    return { drafts: [], quick: s.quickReplies, why: 'Модель не помогла: ' + message(error) };
  }
  var saved = locked(function () {
    db.exec("update drafts set status = 'dropped' where chatId = ? and status = 'new' and source = 'model'", [chatId]);
    return answer.map(function (text) {
      db.exec("insert into drafts (chatId, text, source, created, status) values (?, ?, 'model', ?, 'new')", [chatId, text, Date.now()]);
      return { id: db.lastId(), text: text, source: 'model' };
    });
  });
  emitFeed('draft', chatId);
  return { drafts: saved, quick: s.quickReplies, why: saved.length ? '' : 'Модель не предложила ни одного варианта' };
};

/** A draft by its id with its chat's title: { id, chatId, title, app, text, status, source } or null. */
exports.getDraft = function (draftId) {
  var rows = db.query('select d.id, d.chatId, d.text, d.status, d.source, c.title, c.app from drafts d left join chats c on c.id = d.chatId where d.id = ?', [draftId]);
  return rows.length ? rows[0] : null;
};

exports.dropDraft = function (draftId) {
  db.exec("update drafts set status = 'dropped' where id = ? and status = 'new'", [draftId]);
  return true;
};

/**
 * Sends an answer through the messenger's own "Reply" of its notification. Only on the owner's
 * press or voice "yes": a draft of a model is a proposal. Returns { ok } or { ok: false, gone, why }.
 */
exports.send = function (chatId, text, draftId) {
  var body = String(text === null || text === undefined ? '' : text).trim();
  if (!body) throw new Error('Пустой ответ');
  var chat = chatRow(chatId);
  if (!chat) throw new Error('Такой беседы нет');
  var key = liveKey(chat);
  if (!key) {
    db.exec('update chats set canReply = 0 where id = ?', [chatId]);
    return { ok: false, gone: true, app: chat.app || chat.package, why: 'Ответить отсюда нельзя: уведомление уже убрано' };
  }
  try {
    axiko.notifications.reply(key, body);
  } catch (error) {
    if (draftId) db.exec("update drafts set error = ? where id = ?", [message(error), draftId]);
    return { ok: false, gone: /нет в шторке|уже нет/i.test(message(error)), app: chat.app || chat.package, why: message(error) };
  }
  locked(function () {
    var updated = false;
    if (draftId) {
      var found = db.query("select id from drafts where id = ? and chatId = ?", [draftId, chatId]);
      if (found.length) {
        db.exec("update drafts set status = 'sent', sentAt = ?, text = ?, error = null where id = ?", [Date.now(), body, draftId]);
        updated = true;
      }
    }
    if (!updated) db.exec("insert into drafts (chatId, text, source, created, status, sentAt) values (?, ?, 'owner', ?, 'sent', ?)", [chatId, body, Date.now(), Date.now()]);
    db.exec("update drafts set status = 'dropped' where chatId = ? and status = 'new' and source = 'model'", [chatId]);
    db.exec('update messages set seen = 1 where chatId = ? and seen = 0', [chatId]);
    db.exec('update chats set unread = 0, openedAt = ? where id = ?', [Date.now(), chatId]);
  });
  try {
    require('lib/base').add({ kind: 'message_sent', title: chat.title, source: 'inbox', data: { app: chat.app || chat.package } });
  } catch (error) {
    console.warn('inbox: base: ' + error);
  }
  try { phone.cancelImportant(chatId); } catch (error) { /* none */ }
  emitFeed('sent', chatId);
  refreshWidget();
  awards(true);
  return { ok: true };
};

// ---- achievements («Ачивки за жизнь», when installed; otherwise the shared box) -------------------

var AWARDS = {
  zero: { key: 'inbox/zero', source: 'inbox', category: 'Жизнь', title: 'Ноль входящих', icon: 'mail', rarity: 'common' },
  morning: { key: 'inbox/answered-by-ten', source: 'inbox', category: 'Жизнь', title: 'Ответил всем важным до 10:00', icon: 'message', rarity: 'uncommon' }
};

function award(which, text) {
  var item = JSON.parse(JSON.stringify(AWARDS[which]));
  item.text = text;
  item.at = Date.now();
  return achieve.give(axiko.files, require, item, ACHIEVED_PATH);
}

/**
 * After the owner read or answered: «Ноль входящих» (the feed is empty on a busy day) and, after an
 * answer, «Ответил всем важным до 10:00». Each is handed in once; the numbers are settings.
 */
function awards(replied) {
  try {
    var s = settings();
    var now = Date.now();
    var midnight = new Date(now);
    midnight.setHours(0, 0, 0, 0);
    var from = midnight.getTime();
    if (!achieve.given(axiko.files, ACHIEVED_PATH, AWARDS.zero.key)) {
      var came = Number(db.query("select count(*) as n from messages where time >= ? and bucket in ('important', 'later')", [from])[0].n) || 0;
      if (came >= s.zeroMinMessages && awardsLib.zero(feed.counts(cards(s)), came, s.zeroMinMessages)) {
        award('zero', 'Во «Важно» и «Подождёт» пусто в день, когда пришло ' + came + ' сообщений');
      }
    }
    if (replied && !achieve.given(axiko.files, ACHIEVED_PATH, AWARDS.morning.key)) {
      var at = new Date(now);
      var important = db.query("select chatId, max(time) as time from messages where bucket = 'important' and time >= ? group by chatId", [from]);
      var sent = db.query("select chatId, max(sentAt) as sentAt from drafts where status = 'sent' and sentAt >= ? group by chatId", [from]);
      if (awardsLib.answered(important, sent, s.answerMinChats, at.getHours() * 60 + at.getMinutes(), awardsLib.minutes(s.answerBy))) {
        award('morning', 'Ответил из ленты во все беседы с важным (' + important.length + ') до ' + s.answerBy);
      }
    }
  } catch (error) {
    console.warn('inbox: ачивки: ' + message(error));
  }
}

/** Puts a text into the clipboard (a draft to paste in the messenger). */
exports.copy = function (text) {
  axiko.clipboard.set(String(text || ''));
  return true;
};

/** The "Ответить" button of our own notification: (args from the notification, the typed text). */
exports.replyFromNotice = function (args, text) {
  var chatId = args && args.chatId;
  if (!chatId || !String(text || '').trim()) return { ok: false };
  var result = exports.send(chatId, text, null);
  if (!result.ok) axiko.notify({ title: 'Ответ не ушёл', text: result.why, open: SCREEN + '?chat=' + encodeURIComponent(chatId) });
  return result;
};

/** The "Прочитано" button of our own notification. */
exports.readFromNotice = function (args) {
  if (args && args.chatId) exports.markRead(args.chatId);
  return true;
};

function defaultPackage() {
  var rows = db.query('select package from chats order by lastTime desc limit 1');
  if (rows.length) return rows[0].package;
  var apps = collected(settings());
  return apps.length ? apps[0] : null;
}

/**
 * A draft into the chat of a person, by a name as said aloud ("Пете", "маме"): from the
 * Recorder, Holidays, the voice tool. Nothing is sent. When the chat is not found or cannot be
 * answered from here, the text goes to the clipboard and the messenger opens.
 *   options: { notify: true } — a notification "Черновик готов" that opens the chat;
 *            { open: false } — do not open the messenger; { copy: false } — leave the clipboard alone
 * Returns { ok, chatId, draftId, title, canReply, copied, why }.
 */
exports.draftFor = function (name, text, source, options) {
  options = options || {};
  var body = String(text || '').trim();
  if (!body) throw new Error('Пустой черновик');
  var chats = db.query("select id, title, isGroup, lastTime, package, app, lastKey, canReply from chats where override is null or override != 'off'");
  var chat = feed.findChat(chats, name);
  if (!chat) {
    if (options.copy !== false) axiko.clipboard.set(body);
    var opened = options.open === false ? null : phone.open(null, defaultPackage());
    return { ok: false, found: false, copied: options.copy !== false, why: 'Беседа «' + name + '» не найдена во Входящих' +
      (options.copy !== false ? ': текст скопирован' : '') + (opened ? ', открыт мессенджер' : '') };
  }
  var kind = ['voice', 'model', 'owner'].indexOf(source) >= 0 ? source : 'voice';
  var draftId = locked(function () {
    db.exec("insert into drafts (chatId, text, source, created, status) values (?, ?, ?, ?, 'new')", [chat.id, body, kind, Date.now()]);
    return db.lastId();
  });
  emitFeed('draft', chat.id);
  var key = liveKey(chat);
  var result = { ok: true, found: true, chatId: chat.id, draftId: draftId, title: chat.title, app: chat.app || chat.package, canReply: Boolean(key), copied: false, why: '' };
  if (!key) {
    if (options.copy !== false) axiko.clipboard.set(body);
    result.copied = options.copy !== false;
    result.why = 'Ответить из ленты нельзя: уведомление уже убрано' + (result.copied ? '. Текст скопирован' : '');
    if (options.open !== false && phone.open(chat.lastKey, chat.package)) result.why += ', открыт ' + (chat.app || 'мессенджер');
    return result;
  }
  if (options.notify !== false) {
    axiko.notify({ title: 'Черновик готов · ' + chat.title, text: body, open: SCREEN + '?chat=' + encodeURIComponent(chat.id) });
  }
  return result;
};

// ---- for Focus, the voice and other modules ---------------------------------------------------

/**
 * What came between two moments (by arrival): { from, to, total, chats, important: [...],
 * others: [{ chatId, title, count, about, line }], byBucket }. Codes are left out.
 */
exports.since = function (from, to) {
  var start = Number(from) || 0;
  var end = Number(to) || Date.now();
  var rows = db.query("select id, chatId, sender, text, time, bucket, reason, asks from messages where created >= ? and created <= ? and bucket != 'otp' order by created", [start, end]);
  var chats = {};
  rows.forEach(function (row) {
    if (!chats[row.chatId]) chats[row.chatId] = chatRow(row.chatId) || { id: row.chatId, title: row.chatId, isGroup: 0 };
  });
  return feed.since(rows, chats, start, end, settings().names);
};

/**
 * Messages found by person, chat, words and time — for "что мне писала мама на этой неделе?".
 *   query: { person, chat, text, since (ms or days back), until, bucket, limit }
 * Returns [{ time, chat, app, sender, text, bucket }], newest first.
 */
exports.find = function (query) {
  query = query || {};
  var since = Number(query.since) || 7;
  if (since < 10000) since = Date.now() - since * DAY;
  var until = Number(query.until) || Date.now() + MINUTE;
  var where = ["m.bucket != 'otp'", 'm.time >= ?', 'm.time <= ?'];
  var args = [since, until];
  if (query.text) {
    where.push('m.text like ?');
    args.push('%' + String(query.text) + '%');
  }
  if (query.bucket && ['important', 'later', 'noise'].indexOf(query.bucket) >= 0) {
    where.push('m.bucket = ?');
    args.push(query.bucket);
  }
  if (query.chat) {
    var chat = feed.findChat(db.query('select id, title, isGroup, lastTime from chats'), query.chat);
    if (!chat) return [];
    where.push('m.chatId = ?');
    args.push(chat.id);
  }
  var rows = db.query('select m.time, m.sender, m.text, m.bucket, c.title, c.app, c.isGroup from messages m left join chats c on c.id = m.chatId where ' +
    where.join(' and ') + ' order by m.time desc limit 500', args);
  if (query.person) {
    rows = rows.filter(function (row) {
      return triage.sameName(query.person, row.sender) || (!row.isGroup && triage.sameName(query.person, row.title));
    });
  }
  return rows.slice(0, Math.min(Number(query.limit) || 50, 200)).map(function (row) {
    return { time: row.time, chat: row.title, app: row.app, sender: row.sender, text: feed.isHidden(row) ? '[текст скрыт приложением]' : row.text, bucket: feed.shown(row.bucket) };
  });
};

/** The widget on the home screen: { title, text, open }. */
exports.widget = function () {
  var s = settings();
  return feed.widget(cards(s), s.widgetLines);
};

// ---- settings for the screen -------------------------------------------------------------------

exports.settings = function () {
  var s = settings();
  var roles = {};
  Object.keys(ROLES).forEach(function (name) {
    try {
      var target = native('models.resolve', ROLES[name]);
      roles[name] = { model: String(target.model || ''), local: String(target.baseUrl || '').indexOf('local:') === 0 };
    } catch (error) {
      roles[name] = { model: '', local: false, error: message(error) };
    }
  });
  return { values: s, numbers: settingsLib.NUMBERS, roles: roles, localModel: localModelThere(), apps: exports.apps() };
};

exports.saveSettings = function (patch) {
  var next = locked(function () {
    var saved = settingsLib.apply(axiko.files.readJson(SETTINGS_PATH, {}), patch || {});
    axiko.files.writeJson(SETTINGS_PATH, saved);
    return saved;
  });
  LIVE.apps = null;
  if (patch && patch.cleanAt) {
    job('inbox:clean', { at: next.cleanAt }, function () { require('modules/inbox/main.js').clean(); });
  }
  emitFeed('settings', null);
  refreshWidget();
  return next;
};

/** Apps to choose from: the known messengers on the phone and every app that sent a notification. */
exports.apps = function () {
  var s = settings();
  var chosen = collected(s);
  var seen = readState().seenApps || {};
  var list = {};
  parse.KNOWN.forEach(function (pkg) {
    if (phone.installed(pkg)) list[pkg] = { package: pkg, app: phone.label(pkg) || pkg, known: true };
  });
  Object.keys(seen).forEach(function (pkg) {
    if (!list[pkg]) list[pkg] = { package: pkg, app: seen[pkg].app || phone.label(pkg) || pkg, known: parse.KNOWN.indexOf(pkg) >= 0 };
  });
  (s.apps || []).forEach(function (pkg) {
    if (!list[pkg]) list[pkg] = { package: pkg, app: phone.label(pkg) || pkg, known: false };
  });
  return Object.keys(list).map(function (pkg) {
    var item = list[pkg];
    item.on = chosen.indexOf(pkg) >= 0;
    item.icon = phone.icon(pkg);
    return item;
  }).sort(function (a, b) {
    if (a.on !== b.on) return a.on ? -1 : 1;
    if (a.known !== b.known) return a.known ? -1 : 1;
    return a.app.localeCompare(b.app);
  });
};

// ---- the shell's newer events ---------------------------------------------------------------------

/**
 * notification.removed (the shell's notice.removed): the notification is gone. Opened from the
 * shade or taken away by the messenger itself (read elsewhere) — the conversation is read.
 */
exports.removed = function (event) {
  if (!event || !event.key) return;
  var rows = db.query('select id from chats where lastKey = ?', [event.key]);
  rows.forEach(function (row) {
    db.exec('update chats set canReply = 0 where id = ?', [row.id]);
    if (event.reason === 'click' || event.reason === 'app') exports.markRead(row.id);
  });
  if (rows.length) emitFeed('removed', rows[0].id);
};

// ---- the daily counter in the shared base ----------------------------------------------------------

function syncCounter(force) {
  var s = settings();
  var now = Date.now();
  if (!force && now - LIVE.counterAt < s.counterEveryMin * MINUTE) return;
  LIVE.counterAt = now;
  var base = require('lib/base');
  var state = readState();
  var ids = state.counters || {};
  var otp = state.otpCount || {};
  [feed.day(now - DAY), feed.day(now)].forEach(function (day) {
    var rows = db.query('select bucket, count(*) as n from messages where created >= ? and created < ? group by bucket', [day.start, day.start + DAY]);
    var data = { important: 0, later: 0, noise: 0 };
    rows.forEach(function (row) {
      var bucket = feed.shown(row.bucket);
      if (row.bucket !== 'otp') data[bucket] = (data[bucket] || 0) + row.n;
    });
    data.noise += otp[day.key] || 0;
    var total = data.important + data.later + data.noise;
    if (!total && !ids[day.key]) return;
    if (ids[day.key]) {
      try {
        base.update(ids[day.key], { amount: total, data: data });
        return;
      } catch (error) { /* the record was removed: add it anew */ }
    }
    ids[day.key] = base.add({ kind: 'messages', at: day.start, title: 'Входящие за день', amount: total, unit: 'msg', data: data, source: 'inbox' });
  });
  changeState(function (next) {
    var keep = {};
    var keys = Object.keys(ids).sort().slice(-4);
    keys.forEach(function (key) { keep[key] = ids[key]; });
    next.counters = keep;
    var codes = {};
    Object.keys(next.otpCount || {}).sort().slice(-4).forEach(function (key) { codes[key] = next.otpCount[key]; });
    next.otpCount = codes;
  });
}

// ---- cleaning ------------------------------------------------------------------------------------

/** The nightly cleaning (job inbox:clean): old messages, codes, drafts; the day's counter. */
exports.clean = function () {
  var s = settings();
  var now = Date.now();
  try { syncCounter(true); } catch (error) { console.warn('inbox: counter: ' + error); }
  locked(function () {
    db.exec('delete from messages where time < ? and created < ?', [now - s.keepDays * DAY, now - s.keepDays * DAY]);
    db.exec("delete from messages where bucket = 'otp' and created < ?", [now - s.otpKeepMin * MINUTE]);
    db.exec('delete from drafts where created < ?', [now - s.draftKeepDays * DAY]);
    db.exec("delete from chats where (override is null or override = '') and lastTime < ? and id not in (select distinct chatId from messages) " +
      'and id not in (select distinct chatId from drafts)', [now - s.keepDays * DAY]);
    db.exec("update chats set digest = '', digestAt = 0 where digestAt < ?", [now - s.keepDays * DAY]);
    db.exec('update chats set unread = (select count(*) from messages m where m.chatId = chats.id and m.seen = 0)');
  });
  emitFeed('clean', null);
  refreshWidget();
  return true;
};

/** Removes a chat with its messages and drafts (the checks clean up with it). */
exports.forget = function (chatId) {
  locked(function () {
    db.exec('delete from messages where chatId = ?', [chatId]);
    db.exec('delete from drafts where chatId = ?', [chatId]);
    db.exec('delete from chats where id = ?', [chatId]);
  });
  emitFeed('forget', chatId);
  return true;
};

/** A message of a chat by its id, for the checks. */
exports.messages = function (chatId) {
  return db.query('select * from messages where chatId = ? order by time', [chatId]);
};

exports.chatRow = chatRow;

// ---- start ---------------------------------------------------------------------------------------

/** The voice tool lives in tools/ (that is where agents look): a stub that points here. */
function installTool() {
  var stub = TOOL_MARK + ' (modules/inbox/tools/inbox.js). Файл ставит сам модуль при запуске;\n' +
    '// удалите модуль — заглушка молча выключится.\n' +
    'try {\n  module.exports = require(\'modules/inbox/tools/inbox.js\');\n} catch (error) {\n  exports.name = null;\n}\n';
  var there = axiko.files.exists(TOOL_PATH) ? axiko.files.read(TOOL_PATH) : null;
  if (there === stub) return;
  if (there !== null && there.indexOf(TOOL_MARK) !== 0) return;   // the owner's own tool: not ours to replace
  axiko.files.write(TOOL_PATH, stub);
}

function firstRun() {
  if (!axiko.files.exists(PARSERS_PATH)) {
    axiko.files.writeJson(PARSERS_PATH, {
      about: 'Свои разборщики уведомлений. Заводские — в modules/inbox/parsers.json (там же описан вид записи); запись здесь с тем же id заменяет заводскую, с новым id — добавляет мессенджер.',
      parsers: []
    });
  }
  if (!axiko.files.exists(SETTINGS_PATH)) {
    var name = phone.ownerName();
    axiko.files.writeJson(SETTINGS_PATH, settingsLib.normalize({ names: name ? [name.split(/\s+/)[0]] : [] }));
  }
}

/** Runs at every start of the app (module.json "autostart"): subscriptions, the nightly job, catching up. */
exports.start = function () {
  try { firstRun(); } catch (error) { console.warn('inbox: first run: ' + error); }
  var s = settings();
  on('notification', function (notice) {
    try {
      require('modules/inbox/main.js').handle(notice);
    } catch (error) {
      console.error('inbox: ' + message(error));
    }
  }, 'inbox');
  if (phone.has('notice.removed')) {
    on('notification.removed', function (event) {
      try {
        require('modules/inbox/main.js').removed(event);
      } catch (error) {
        console.error('inbox: removed: ' + message(error));
      }
    }, 'inbox');
  }
  job('inbox:clean', { at: s.cleanAt }, function () { require('modules/inbox/main.js').clean(); });
  try { installTool(); } catch (error) { console.warn('inbox: tool: ' + error); }
  cleanOtp(s);
  var state = readState();
  if (state.modelBlockedUntil) {
    job('inbox:retry', { every: s.retryMin }, function () { require('modules/inbox/main.js').retry(); });
  } else if (pendingCount() > 0) {
    scheduleBatch(5000);
  }
  return 'Входящие слушают уведомления';
};
