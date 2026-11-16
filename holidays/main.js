// Праздничные пасхалки: the engine side.
//
// Once a day (and at launch) the module looks at the calendar of occasions (occasions.json, the
// owner's own in data/holidays/own.json, birthdays from contacts), picks the occasion of the day
// and puts its look on: the shell's decoration layer when there is one (theme.decor), otherwise a
// theme of its own, "holiday", made from the owner's theme — taken off again when the occasion is
// over. It reminds of close people's birthdays and drafts greetings (the owner sends them), notices
// the first snow, greets the owner on their birthday and sums up a year of Assi on its anniversary.
//
// The agent reaches it through tools/holidays.js, written on start (see "the agent's tool").
//
// Pure rules are in calendar.js, birthdays.js, decor.js, settings.js (tested in node).
var assi = require('lib/assi');
var calendar = require('./calendar');
var birthdays = require('./birthdays');
var decor = require('./decor');
var config = require('./settings');
var awards = require('./awards');
var achieve = require('./achieve');

var DIR = 'modules/holidays';
var MAIN = DIR + '/main.js';
var SCREEN = DIR + '/ui/index.html';
var DATA = 'data/holidays';
var THEME = 'holiday';
var DECOR_FILE = 'themes/_decor.css';
var MEMORY = 'agent/memory.md';
var MEMORY_MARK = '<!-- holidays -->';
var DAY_MS = 86400000;
var GREETED = DATA + '/greeted.json';
var ACHIEVED = DATA + '/achievements.json';
var AWARD_KEY = 'holidays/not-forgotten';

// Screens, jobs and phone events call in from several threads: state changes go one at a time.
var lock = new java.util.concurrent.locks.ReentrantLock();

function locked(fn) {
  lock.lock();
  try {
    return fn();
  } finally {
    lock.unlock();
  }
}

// ---- small things ---------------------------------------------------------------------------

/** Shell features (docs/shell-changes.md in Assi); none when the shell does not know the question. */
function features() {
  try {
    var list = native('shell.features');
    return Array.isArray(list) ? list : [];
  } catch (error) {
    return [];
  }
}

function shellHas(name) {
  return features().indexOf(name) >= 0;
}

function readJson(path, fallback) {
  try {
    var value = assi.files.readJson(path, fallback);
    return value === undefined || value === null ? fallback : value;
  } catch (error) {
    console.warn('holidays: не читается ' + path + ': ' + error);
    return fallback;
  }
}

function writeJson(path, value) {
  assi.files.writeJson(path, value);
}

function copy(value) {
  return JSON.parse(JSON.stringify(value));
}

function today() {
  return calendar.today(new Date());
}

function nowMinutes() {
  var date = new Date();
  return date.getHours() * 60 + date.getMinutes();
}

function pad(number) {
  return (number < 10 ? '0' : '') + number;
}

function granted(name) {
  try {
    return context.checkSelfPermission('android.permission.' + name) === 0;
  } catch (error) {
    return false;
  }
}

function powerSave() {
  try {
    return Boolean(context.getSystemService('power').isPowerSaveMode());
  } catch (error) {
    return false;
  }
}

function safely(what, fn) {
  try {
    return fn();
  } catch (error) {
    console.error('holidays: ' + what + ': ' + (error && error.message ? error.message : error));
    return null;
  }
}

function notify(options) {
  var payload = { title: options.title, text: options.text, open: options.open || SCREEN };
  if (options.silent) payload.silent = true;
  // Buttons in the shade only when the shell can run them; otherwise a tap opens the screen.
  if (options.actions && shellHas('notify.actions')) payload.actions = options.actions;
  return safely('уведомление', function () { return assi.notify(payload); });
}

function changed() {
  safely('событие', function () { emit('holidays.changed', { at: Date.now() }); });
  safely('виджет', function () { assi.widget.refresh('holidays'); });
}

/** Runs fn at a moment: an exact one-off job when the shell has it, else a waiting thread. */
function later(key, at, fn) {
  if (shellHas('job.once')) {
    try {
      job(key, { once: at }, fn);
      return 'job';
    } catch (error) {
      console.warn('holidays: job.once: ' + error);
    }
  }
  spawn(function () {
    var wait = at - Date.now();
    if (wait > 0) sleep(wait);
    safely(key, fn);
  });
  return 'thread';
}

// ---- settings, state, occasions -------------------------------------------------------------

function loadSettings() {
  return config.normalize(readJson(DATA + '/settings.json', {}));
}

function loadState() {
  var state = readJson(DATA + '/state.json', {});
  if (!state || typeof state !== 'object') state = {};
  state.sent = state.sent || {};
  return state;
}

function saveState(state) {
  // What was sent is remembered for a year and a bit: enough to never repeat, small forever.
  var horizon = calendar.addDays(today(), -400);
  Object.keys(state.sent).forEach(function (key) {
    if (String(state.sent[key]) < horizon) delete state.sent[key];
  });
  writeJson(DATA + '/state.json', state);
}

function builtins() {
  var list = readJson(DIR + '/occasions.json', []);
  return Array.isArray(list) ? list : [];
}

function ownList() {
  var list = readJson(DATA + '/own.json', []);
  return Array.isArray(list) ? list : [];
}

/** Every occasion (built-in, then the owner's own); without `all` only those switched on. */
function occasions(settings, all) {
  var list = builtins().concat(ownList().map(function (occasion) {
    var own = copy(occasion);
    own.own = true;
    return own;
  }));
  if (all) return list;
  return list.filter(function (occasion) { return settings.off.indexOf(occasion.id) < 0; });
}

function decorFiles() {
  var files = {};
  safely('украшения', function () {
    assi.files.list(DIR + '/decor').forEach(function (name) {
      name = String(name);
      if (/\.css$/.test(name)) files[name.replace(/\.css$/, '')] = assi.files.read(DIR + '/decor/' + name);
    });
  });
  return files;
}

function known(files) {
  return Object.keys(files).concat(['confetti']);
}

// ---- what the phone knows: birthdays, install day, calendar ----------------------------------

function readContacts() {
  if (!granted('READ_CONTACTS')) return null;
  return safely('контакты', function () {
    var rows = assi.rows('content://com.android.contacts/data', ['contact_id', 'display_name', 'data1', 'data2', 'starred'],
      "mimetype = 'vnd.android.cursor.item/contact_event' and data2 = 3", null, null, 5000);
    return birthdays.fromRows(rows);
  });
}

function calendarEvents(fromMs, toMs) {
  if (!granted('READ_CALENDAR')) return [];
  return safely('календарь', function () {
    var rows = assi.rows('content://com.android.calendar/instances/when/' + Math.round(fromMs) + '/' + Math.round(toMs),
      ['title', 'begin', 'allDay', 'calendar_displayName'], null, null, 'begin asc', 5000);
    return rows.map(function (row) {
      // An all-day event starts at midnight UTC; a timed one is read in the phone's time zone.
      var day = Number(row.allDay) === 1 ? calendar.fromNumber(Math.floor(Number(row.begin) / DAY_MS)) : calendar.today(Number(row.begin));
      return { title: String(row.title || ''), day: day, calendar: String(row.calendar_displayName || '') };
    });
  }) || [];
}

/** { list: people with birthdays marked close or not, source, unreadable }. */
function allPeople(settings, options) {
  options = options || {};
  var list = options.cached ? null : readContacts();
  var source = 'contacts';
  var unreadable = [];
  if (list) {
    unreadable = list.unreadable || [];
    var plain = list.map(function (person) { return person; });
    var cached = readJson(DATA + '/contacts.json', null);
    if (!cached || JSON.stringify(cached.list) !== JSON.stringify(plain)) {
      safely('кэш контактов', function () { writeJson(DATA + '/contacts.json', { at: Date.now(), list: plain }); });
    }
    list = plain;
  } else {
    var saved = readJson(DATA + '/contacts.json', null);
    list = saved && Array.isArray(saved.list) ? saved.list : [];
    source = saved ? 'cache' : 'none';
  }
  if (!list.length && !options.cached && granted('READ_CALENDAR')) {
    // No birthdays in contacts: the "Birthdays" calendar (Google keeps one) as a fallback.
    var found = birthdays.fromCalendar(calendarEvents(Date.now() - DAY_MS, Date.now() + 370 * DAY_MS));
    if (found.length) {
      list = found;
      source = 'calendar';
    }
  }
  return { list: birthdays.markClose(list, settings), source: source, unreadable: unreadable };
}

/** The owner's birthday: { birthday, source: 'settings' | 'profile' | null }. */
function ownerBirthday(settings) {
  if (settings.ownerBirthday) {
    var typed = birthdays.parse(settings.ownerBirthday);
    if (typed) return { birthday: typed, source: 'settings' };
  }
  if (granted('READ_CONTACTS')) {
    var found = safely('профиль', function () {
      var rows = assi.rows('content://com.android.contacts/profile/data', ['data1', 'data2'],
        "mimetype = 'vnd.android.cursor.item/contact_event' and data2 = 3", null, null, 5);
      for (var i = 0; i < rows.length; i++) {
        var parsed = birthdays.parse(rows[i].data1);
        if (parsed) return parsed;
      }
      return null;
    });
    if (found) return { birthday: found, source: 'profile' };
  }
  return { birthday: null, source: null };
}

function installDay() {
  return safely('дата установки', function () {
    var info = context.getPackageManager().getPackageInfo(context.getPackageName(), 0);
    return calendar.today(Number(info.firstInstallTime));
  });
}

/** What the calendar rules need to know about this phone. */
function buildCtx(settings, state, options) {
  options = options || {};
  var ctx = {
    owner: ownerBirthday(settings).birthday,
    installDay: installDay(),
    weather: {},
    weatherDays: settings.firstSnowDays,
    people: [],
    calendar: []
  };
  if (state.firstSnow && state.firstSnow.day) {
    ctx.weather.snow = { day: state.firstSnow.day, accepted: state.firstSnow.accepted === true };
  }
  if (options.people !== false) ctx.people = allPeople(settings, { cached: options.cached }).list;
  var wantsCalendar = occasions(settings).some(function (occasion) { return occasion.rule && occasion.rule.calendar !== undefined; });
  if (wantsCalendar && !options.cached) ctx.calendar = calendarEvents(Date.now() - 400 * DAY_MS, Date.now() + 400 * DAY_MS);
  return ctx;
}

// ---- the look of the day --------------------------------------------------------------------

function confettiAllowed(settings, state, day) {
  return Boolean(state.firstOpen && state.firstOpen.day === day && Date.now() < state.firstOpen.at + settings.confettiWindowMinutes * 60000);
}

function computePlan(settings, state, day, ctx, files) {
  var active = calendar.activeOn(occasions(settings), day, ctx);
  var plan = decor.plan(active, {
    strength: settings.strength,
    powerSaveMode: powerSave(),
    powerSave: settings.powerSave,
    confetti: confettiAllowed(settings, state, day),
    known: known(files)
  });
  return { active: active, plan: plan };
}

function cssOptions(settings, files, tokens, withAccent, day) {
  return {
    files: files,
    tokens: tokens || {},
    motionSeconds: settings.motionSeconds,
    particleCount: settings.particleCount,
    confettiSeconds: settings.confettiSeconds,
    confettiPieces: settings.confettiPieces,
    seed: calendar.dayNumber(day),
    withAccent: withAccent
  };
}

function themeList() {
  return safely('темы', function () { return native('theme.list') || []; }) || [];
}

function activeTheme(themes) {
  var active = themes.filter(function (theme) { return theme.active; })[0];
  return active ? String(active.id) : '';
}

function themeExists(themes, id) {
  return themes.some(function (theme) { return theme.id === id; });
}

/** The owner's theme to put back, as written into the holiday theme itself (when the state is lost). */
function holidayFilePrevious() {
  var theme = readJson('themes/' + THEME + '.json', null);
  return theme && theme.previous ? String(theme.previous) : '';
}

/** The owner's own theme (not the holiday one): { id, tokens, css }. */
function ownerTheme(themes, state) {
  var active = activeTheme(themes);
  var id = active === THEME ? (state.previous || holidayFilePrevious()) : active;
  return themes.filter(function (theme) { return theme.id === id; })[0] || { id: '', tokens: {}, css: '' };
}

/** Takes the holiday theme off: the owner's theme back, the file removed. */
function undoTheme(state, themes) {
  themes = themes || themeList();
  if (activeTheme(themes) === THEME) {
    var previous = state.previous || holidayFilePrevious();
    if (previous && !themeExists(themes, previous)) previous = '';
    native('theme.set', previous);
  }
  if (themeExists(themes, THEME)) native('theme.remove', THEME);
  if (state.mode === 'theme') state.mode = null;
  state.applied = null;
  state.key = null;
  state.css = '';
  state.themeSig = null;
}

/** The decoration layer as it is now: '' when there is none, null when it cannot be read. */
function readDecorLayer() {
  return safely('слой украшений', function () { return assi.files.exists(DECOR_FILE) ? assi.files.read(DECOR_FILE) : ''; });
}

/**
 * Puts the plan on (null takes everything off). options.force: a preview the owner asked for —
 * it does not care whether the owner switched the occasion off.
 */
function apply(plan, state, settings, day, options) {
  options = options || {};
  var files = decorFiles();
  var themes = themeList();
  var off = plan && !options.force && state.offKey === plan.key;

  if (shellHas('theme.decor')) {
    // The decoration layer: the owner's theme is never touched.
    if (state.mode === 'theme') undoTheme(state, themes);
    var css = plan && !off ? decor.css(plan, cssOptions(settings, files, ownerTheme(themes, state).tokens, true, day)) : '';
    var current = readDecorLayer();
    if (current === null) {
      if ((state.css || '') !== css) native('theme.decor', css);
    } else if (css) {
      if (current !== css) native('theme.decor', css);
    } else if (current && current.indexOf('/* holidays') === 0) {
      native('theme.decor', '');
    }
    state.mode = css ? 'decor' : null;
    state.css = css;
    state.applied = css ? plan.id : null;
    state.key = css ? plan.key : null;
    state.at = Date.now();
    return;
  }

  // Without the layer: a theme of our own made from the owner's.
  if (!plan || off) {
    undoTheme(state, themes);
    return;
  }
  var active = activeTheme(themes);
  if (!options.force) {
    if (state.mode === 'theme' && state.key === plan.key && active !== THEME) {
      // The owner put on another theme while the holiday was on: until it is over, that is theirs.
      state.ownerChose = true;
      state.ownerChoseKey = plan.key;
      state.previous = active;
      if (themeExists(themes, THEME)) native('theme.remove', THEME);
      state.mode = null;
      state.applied = null;
      state.css = '';
      state.themeSig = null;
      return;
    }
    if (state.ownerChoseKey === plan.key) {
      undoTheme(state, themes);
      return;
    }
  }
  var previous = active === THEME ? (state.previous || holidayFilePrevious()) : active;
  if (previous && !themeExists(themes, previous)) previous = '';
  var base = themes.filter(function (theme) { return theme.id === previous; })[0] || { tokens: {}, css: '' };
  var css2 = decor.css(plan, cssOptions(settings, files, base.tokens || {}, false, day));
  var theme = decor.theme(base, plan, css2, previous);
  var signature = JSON.stringify(theme);
  // Taken anew from the owner's file every time: their edits to it while the holiday is on count.
  if (state.themeSig !== signature || active !== THEME || !themeExists(themes, THEME)) native('theme.save', THEME, theme);
  if (active !== THEME) native('theme.set', THEME);
  state.mode = 'theme';
  state.previous = previous;
  state.applied = plan.id;
  state.key = plan.key;
  state.css = css2;
  state.themeSig = signature;
  state.ownerChose = false;
  state.at = Date.now();
}

// ---- history, memory, base ------------------------------------------------------------------

function noteHistory(day, patch, settings) {
  locked(function () {
    settings = settings || loadSettings();
    var list = readJson(DATA + '/history.json', []);
    if (!Array.isArray(list)) list = [];
    var before = JSON.stringify(list);
    var entry = list.filter(function (item) { return item.day === day; })[0];
    if (!entry) {
      entry = { day: day, occasion: null, decor: [], greeted: false, drafts: [] };
      list.push(entry);
    }
    if (patch.occasion !== undefined) entry.occasion = patch.occasion;
    if (patch.decor) entry.decor = patch.decor;
    if (patch.greeted) entry.greeted = true;
    if (patch.draft) entry.drafts.push(patch.draft);
    // Entries stay for ever (they are small); the drafts' texts only as long as the setting says.
    var horizon = Date.now() - settings.draftKeepDays * DAY_MS;
    list.forEach(function (item) {
      item.drafts = (item.drafts || []).filter(function (draft) { return draft.at >= horizon; });
    });
    list.sort(function (a, b) { return a.day < b.day ? -1 : a.day > b.day ? 1 : 0; });
    if (JSON.stringify(list) !== before) writeJson(DATA + '/history.json', list);
  });
}

function recentDrafts(limit) {
  var out = [];
  readJson(DATA + '/history.json', []).forEach(function (entry) {
    (entry.drafts || []).forEach(function (draft) { out.push(draft); });
  });
  return out.sort(function (a, b) { return b.at - a.at; }).slice(0, limit || 20);
}

/** The module's one line in the assistant's memory (agent/memory.md); null removes it. */
function setMemoryLine(text) {
  var body = assi.files.exists(MEMORY) ? assi.files.read(MEMORY) : '';
  var had = body.indexOf(MEMORY_MARK) >= 0;
  if (!text && !had) return;
  var lines = body.split('\n').filter(function (line) { return line.indexOf(MEMORY_MARK) < 0; });
  while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
  if (text) lines.push('- ' + text + ' ' + MEMORY_MARK);
  var next = lines.join('\n') + '\n';
  if (next !== body) assi.files.write(MEMORY, next);
}

function memoryLine(settings, active) {
  var text = null;
  if (settings.memoryLine) {
    var ownerDay = active.some(function (item) { return item.occasion.rule && item.occasion.rule.owner; });
    var aprilFirst = active.some(function (item) { return item.id === 'april-fools'; });
    if (ownerDay) {
      text = 'Сегодня у владельца день рождения: поздравьте его в первом разговоре дня, один раз.';
    } else if (aprilFirst && settings.aprilJoke) {
      text = 'Сегодня 1 апреля: в первом ответе дня можно одну безобидную шутку — только в чате, без действий в других приложениях и без сообщений другим людям.';
    }
  }
  setMemoryLine(text);
}

function baseRecords(day, state, ctx) {
  var base = null;
  (ctx.people || []).forEach(function (person) {
    if (!person.close || !person.birthday) return;
    var next = birthdays.next(person.birthday, day);
    if (next !== day) return;
    var key = 'base:' + person.id + ':' + day.slice(0, 4);
    if (state.sent[key]) return;
    base = base || require('lib/base');
    var age = birthdays.age(person.birthday, day);
    base.add({
      kind: 'event',
      title: 'День рождения: ' + person.name,
      at: new Date(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)), 12, 0).getTime(),
      tags: ['праздник', 'день рождения'],
      data: { contact_id: person.id, age: age },
      source: 'holidays'
    });
    state.sent[key] = day;
  });
}

// ---- reminders, the anniversary, greetings --------------------------------------------------

function reminders(day, settings, state, ctx) {
  if (nowMinutes() < config.minutes(settings.remindTime)) return;
  birthdays.due(ctx.people, day).forEach(function (person) {
    var key = 'remind:' + person.id + ':' + person.next;
    if (state.sent[key]) return;
    state.sent[key] = day;
    var words = birthdays.reminder(person);
    notify({
      title: words.title,
      text: words.text,
      open: SCREEN + '?tab=people',
      actions: [{ title: 'Подготовить поздравление', call: MAIN, fn: 'draftFromNotice', args: { contact: person.id } }]
    });
  });
  // The owner's own occasions with a reminder.
  occasions(settings).forEach(function (occasion) {
    if (!occasion.own || !(occasion.remind > 0)) return;
    calendar.upcoming([occasion], day, occasion.remind, ctx).forEach(function (item) {
      if (item.inDays !== occasion.remind) return;
      var key = 'own:' + occasion.id + ':' + item.anchor;
      if (state.sent[key]) return;
      state.sent[key] = day;
      notify({ title: birthdays.when(item.inDays) + ': ' + occasion.title, text: 'Вы просили напомнить заранее.', open: SCREEN });
    });
  });
}

// ---- «Не забыл» for «Ачивки за жизнь» (without them — the shared box) ----------------------------

/** A draft for a person: the greeting counts for its birthday when it is made in time (awards.js). */
function rememberGreeting(person, day, next, settings) {
  var record = awards.normalize(readJson(GREETED, null), day);
  if (awards.remember(record, person.id, day, next, settings.awardEarlyDays)) writeJson(GREETED, record);
}

/** The daily check: every close person's birthday of the last year had a greeting in time. Once. */
function forgotAward(day, settings, ctx) {
  if (achieve.given(assi.files, ACHIEVED, AWARD_KEY)) return null;
  var record = awards.normalize(readJson(GREETED, null), day);
  if (!assi.files.exists(GREETED)) writeJson(GREETED, record);   // the counting begins today
  var got = awards.check(ctx.people, record, day, settings.awardYearDays, settings.awardMinPeople);
  if (!got.ok) return null;
  return achieve.give(assi.files, require, {
    key: AWARD_KEY, source: 'holidays', category: 'Жизнь', title: 'Не забыл', icon: 'calendar', rarity: 'epic',
    text: 'Поздравления всем близким за ' + settings.awardYearDays + ' дн. подготовлены вовремя — ' + got.due + ' из ' + got.due,
    at: Date.now()
  }, ACHIEVED);
}

function anniversary(day, state, ctx, active) {
  if (!active.some(function (item) { return item.occasion.rule && item.occasion.rule.install !== undefined; })) return;
  var key = 'anniversary:' + day.slice(0, 4);
  if (state.sent[key]) return;
  state.sent[key] = day;
  var facts = yearFacts(ctx, day);
  notify({ title: facts.years === 1 ? 'Год вместе' : birthdays.years(facts.years) + ' вместе', text: facts.text, open: SCREEN });
}

/** Honest numbers for the anniversary: only what the phone really keeps. */
function yearFacts(ctx, day) {
  var years = calendar.parse(day).year - calendar.parse(ctx.installDay || day).year;
  var modules = safely('модули', function () { return (native('modules.list') || []).length; }) || 0;
  var snapshots = safely('снимки', function () { return native('snap.list') || []; }) || [];
  var since = Date.now() - 365 * DAY_MS;
  var lastYear = snapshots.filter(function (snap) { return Number(snap.time) >= since; });
  var rollbacks = lastYear.filter(function (snap) { return /^Перед откатом/.test(String(snap.label || '')); }).length;
  var text = 'Сейчас у вас ' + modules + ' ' + birthdays.plural(modules, 'модуль', 'модуля', 'модулей') + '.';
  if (lastYear.length) {
    text += ' В сохранённой истории за год — ' + lastYear.length + ' ' + birthdays.plural(lastYear.length, 'снимок', 'снимка', 'снимков') +
      ' изменений, откатов среди них: ' + rollbacks + '.';
  }
  return { years: Math.max(1, years), modules: modules, snapshots: lastYear.length, rollbacks: rollbacks, text: text };
}

function cleanText(text) {
  var value = String(text || '').trim().replace(/^["«„“]+|["»“”]+$/g, '').trim();
  return value.length > 800 ? value.slice(0, 800) : value;
}

function ownerFacts() {
  var facts = { modules: 0, records: 0, kinds: [], achievements: [] };
  facts.modules = safely('модули', function () { return (native('modules.list') || []).length; }) || 0;
  safely('база', function () {
    var base = require('lib/base');
    facts.kinds = base.kinds().slice(0, 6).map(function (kind) { return { kind: kind.kind, count: kind.count }; });
    facts.records = facts.kinds.length ? (base.sql('select count(*) as n from records')[0] || {}).n || 0 : 0;
  });
  safely('память', function () {
    facts.achievements = require('lib/memory').search('достижение', 6).filter(function (note) {
      return String(note.tags || '').toLowerCase().indexOf('достижение') >= 0;
    }).slice(0, 3).map(function (note) { return String(note.text).slice(0, 200); });
  });
  return facts;
}

function ownerTemplate(facts) {
  var text = 'С днём рождения! Пусть этот год будет добрым, а задуманное — сбывается.';
  if (facts.modules) {
    text += ' В Assi у вас уже ' + facts.modules + ' ' + birthdays.plural(facts.modules, 'модуль', 'модуля', 'модулей');
    if (facts.records) text += ', а в общей базе — ' + facts.records + ' ' + birthdays.plural(facts.records, 'запись', 'записи', 'записей') + ' о вашей жизни';
    text += '.';
  }
  return text;
}

var OWNER_SYSTEM = 'Ты — ассистент Assi. Сегодня день рождения твоего владельца. Поздравь его в 2–3 предложениях, ' +
  'по-русски, тепло и без пафоса. Можно упомянуть что-то из фактов о его годе, но только то, что в них есть: ' +
  'ничего не выдумывай и не додумывай причин. Ответь только текстом поздравления.';

var CONTACT_SYSTEM = 'Ты помогаешь владельцу поздравить близкого человека с днём рождения. Напиши черновик сообщения ' +
  'от лица владельца: по-русски, 2–4 предложения, тепло и просто. Опирайся только на факты; не выдумывай общих ' +
  'воспоминаний, событий и подробностей о человеке. Если в заметках сказано, как владелец обращается к этому ' +
  'человеку, — обращайся так же. Ответь только текстом сообщения, без кавычек и пояснений.';

function findPerson(settings, who) {
  var list = allPeople(settings).list;
  var wanted = String(who || '').trim();
  var lower = wanted.toLowerCase();
  return list.filter(function (person) { return person.id === wanted; })[0] ||
    list.filter(function (person) { return person.name.toLowerCase() === lower; })[0] ||
    list.filter(function (person) { return person.name.toLowerCase().indexOf(lower) === 0; })[0] || null;
}

function greetOwnerIfBirthday(voice) {
  var settings = loadSettings();
  var day = today();
  var go = locked(function () {
    var state = loadState();
    var owner = ownerBirthday(settings).birthday;
    var list = occasions(settings).filter(function (occasion) { return occasion.rule && occasion.rule.owner; });
    if (!owner || !calendar.activeOn(list, day, { owner: owner }).length) return false;
    var key = 'greet:' + day.slice(0, 4);
    if (state.sent[key]) return false;
    state.sent[key] = day;
    saveState(state);
    return true;
  });
  if (!go) return false;
  var text = exports.greeting('owner');
  notify({ title: 'С днём рождения!', text: text, open: SCREEN });
  if (voice && settings.greetVoice) safely('голос', function () { native('speech.say', text, 'local'); });
  noteHistory(day, { greeted: true }, settings);
  return true;
}

// ---- weather: the first snow ----------------------------------------------------------------

function inSnowWindow(settings, day) {
  var monthDay = calendar.monthDay(day);
  var from = settings.firstSnowAfter;
  var to = settings.firstSnowUntil;
  return from <= to ? monthDay >= from && monthDay <= to : monthDay >= from || monthDay <= to;
}

/** Where to ask the weather for: the owner's city, else the last known coarse location. */
function placeFor(settings) {
  if (settings.weatherCity) {
    var state = loadState();
    if (state.geo && state.geo.city === settings.weatherCity) return state.geo;
    var response = assi.http.get('https://geocoding-api.open-meteo.com/v1/search?name=' + encodeURIComponent(settings.weatherCity) + '&count=1&language=ru&format=json');
    var hit = response.ok ? (response.json().results || [])[0] : null;
    if (!hit) return null;
    var geo = { city: settings.weatherCity, name: String(hit.name), latitude: Number(hit.latitude), longitude: Number(hit.longitude) };
    locked(function () {
      var fresh = loadState();
      fresh.geo = geo;
      saveState(fresh);
    });
    return geo;
  }
  if (!granted('ACCESS_COARSE_LOCATION') && !granted('ACCESS_FINE_LOCATION')) return null;
  return safely('местоположение', function () {
    var manager = context.getSystemService('location');
    var best = null;
    ['network', 'passive', 'fused', 'gps'].forEach(function (provider) {
      try {
        var seen = manager.getLastKnownLocation(provider);
        if (seen && (!best || seen.getTime() > best.getTime())) best = seen;
      } catch (ignored) {
        // that provider is not there or not allowed
      }
    });
    return best ? { name: 'местоположение', latitude: Number(best.getLatitude()), longitude: Number(best.getLongitude()) } : null;
  });
}

/** The weather now: from «Обои дня» when it is installed and fresh, else Open-Meteo. */
function weatherNow(settings) {
  var fromWallpapers = null;
  try {
    var wallpapers = require('modules/wallpapers/main.js');
    if (wallpapers && typeof wallpapers.weatherNow === 'function') fromWallpapers = wallpapers.weatherNow(settings.weatherMaxAgeMinutes);
  } catch (absent) {
    fromWallpapers = null;
  }
  if (fromWallpapers && fromWallpapers.code !== undefined && fromWallpapers.code !== null) {
    return {
      at: fromWallpapers.at || Date.now(),
      code: Number(fromWallpapers.code),
      snow: fromWallpapers.snow === undefined ? calendar.isSnowCode(fromWallpapers.code) : Boolean(fromWallpapers.snow),
      source: 'Обои дня'
    };
  }
  var place = placeFor(settings);
  if (!place) return null;
  var response = assi.http.get('https://api.open-meteo.com/v1/forecast?latitude=' + place.latitude.toFixed(3) +
    '&longitude=' + place.longitude.toFixed(3) + '&current=weather_code,temperature_2m,is_day');
  if (!response.ok) return null;
  var current = response.json().current || {};
  return {
    at: Date.now(),
    code: Number(current.weather_code),
    snow: calendar.isSnowCode(current.weather_code),
    temperature: current.temperature_2m,
    source: 'Open-Meteo',
    place: place.name
  };
}

function askSnow(settings) {
  notify({
    title: 'Первый снег',
    text: 'Погода показывает первый снег в этом сезоне. Включить зимнее оформление на ' + settings.firstSnowDays + ' ' +
      birthdays.plural(settings.firstSnowDays, 'день', 'дня', 'дней') + '?',
    open: SCREEN,
    actions: [
      { title: 'Включить зимнее', call: MAIN, fn: 'answerSnow', args: { yes: true } },
      { title: 'Не надо', call: MAIN, fn: 'answerSnow', args: { yes: false } }
    ]
  });
}

/** Looks at the weather (not more often than the setting allows) and asks about the first snow once a season. */
function weatherCheck(force) {
  var settings = loadSettings();
  if (!settings.firstSnow || settings.off.indexOf('first-snow') >= 0) return null;
  var day = today();
  if (!inSnowWindow(settings, day)) return null;
  var season = calendar.season(day);
  var state = loadState();
  if (state.firstSnow && state.firstSnow.season === season) return null;
  if (!force && state.weatherAt && Date.now() - state.weatherAt < settings.weatherEveryHours * 3600000) return null;
  var weather = safely('погода', function () { return weatherNow(settings); });
  var asked = locked(function () {
    var fresh = loadState();
    fresh.weatherAt = Date.now();
    if (weather) fresh.weather = weather;
    var ask = Boolean(weather && weather.snow && !(fresh.firstSnow && fresh.firstSnow.season === season));
    if (ask) fresh.firstSnow = { season: season, day: day, at: Date.now(), accepted: null, source: weather.source };
    saveState(fresh);
    return ask;
  });
  if (asked) {
    askSnow(settings);
    changed();
  }
  return weather;
}

// ---- the daily check ------------------------------------------------------------------------

/**
 * Looks at the day and puts its look on or off; on the real today also reminds, greets, sums up
 * and records. dateIso — another day (for checks); options.silent — no notifications and records.
 */
exports.check = function (dateIso, options) {
  options = options || {};
  var result = locked(function () {
    var settings = loadSettings();
    var state = loadState();
    var now = today();
    var day = dateIso ? String(dateIso).slice(0, 10) : now;
    if (!calendar.parse(day)) throw new Error('Не дата: ' + dateIso);
    var live = day === now && !options.silent;
    var ctx = buildCtx(settings, state);
    var files = decorFiles();
    var computed = computePlan(settings, state, day, ctx, files);
    var plan = computed.plan;
    var previewing = Boolean(state.preview && state.preview.until > Date.now());
    if (state.preview && !previewing) state.preview = null;
    if (!previewing) {
      // A switch-off or the owner's own theme lasts until the occasion is over.
      if (state.offKey && (!plan || plan.key !== state.offKey)) state.offKey = null;
      if (state.ownerChoseKey && (!plan || plan.key !== state.ownerChoseKey)) {
        state.ownerChoseKey = null;
        state.ownerChose = false;
      }
      safely('оформление', function () { apply(plan, state, settings, day, {}); });
      state.confettiOn = Boolean(plan && plan.layers.indexOf('confetti') >= 0 && state.mode);
    }
    if (live) {
      safely('напоминания', function () { reminders(day, settings, state, ctx); });
      safely('общая база', function () { baseRecords(day, state, ctx); });
      safely('годовщина', function () { anniversary(day, state, ctx, computed.active); });
      safely('память ассистента', function () { memoryLine(settings, computed.active); });
      safely('ачивки', function () { forgotAward(day, settings, ctx); });
      if (plan) noteHistory(day, { occasion: plan.id, decor: plan.layers.concat(plan.eggs) }, settings);
    }
    saveState(state);
    return {
      day: day,
      active: computed.active.map(function (item) { return { id: item.id, title: item.title, consent: item.consent }; }),
      plan: plan ? { key: plan.key, id: plan.id, title: plan.title, accent: plan.accent, layers: plan.layers, eggs: plan.eggs, strength: plan.strength } : null,
      mode: state.mode || null,
      applied: state.applied || null,
      ownerChose: Boolean(state.ownerChose),
      off: Boolean(state.offKey),
      preview: previewing
    };
  });
  changed();
  return result;
};

function daily() {
  exports.check();
  weatherCheck(false);
}

function evening() {
  exports.check();
  greetOwnerIfBirthday(false);
  weatherCheck(false);
}

function registerJobs(settings) {
  job('holidays.daily', { at: settings.dailyTime }, function () { safely('ежедневная проверка', daily); });
  job('holidays.evening', { at: settings.remindTime }, function () { safely('вечерняя проверка', evening); });
}

/** After a restart: the moments that were waited for are waited for again. */
function rearm() {
  var state = loadState();
  if (state.confettiOn && state.firstOpen) {
    var until = state.firstOpen.at + loadSettings().confettiWindowMinutes * 60000;
    if (until > Date.now()) later('holidays.confetti', until + 1000, function () { exports.check(); });
  }
  if (state.preview && state.preview.until > Date.now()) later('holidays.preview', state.preview.until + 500, function () { exports.endPreview(false); });
}

/**
 * The first time Assi is opened in a day: confetti on a birthday (for the set minutes) and the
 * greeting. voice — the greeting may be said aloud (the first unlock, when the setting allows).
 */
exports.opened = function (voice) {
  var settings = loadSettings();
  var day = today();
  var first = locked(function () {
    var state = loadState();
    if (state.firstOpen && state.firstOpen.day === day) return false;
    state.firstOpen = { day: day, at: Date.now() };
    saveState(state);
    return true;
  });
  if (!first) return { first: false };
  var result = exports.check();
  if (result.plan && result.plan.layers.indexOf('confetti') >= 0) {
    later('holidays.confetti', Date.now() + settings.confettiWindowMinutes * 60000 + 1000, function () { exports.check(); });
  }
  spawn(function () { safely('поздравление', function () { greetOwnerIfBirthday(voice === true); }); });
  return { first: true };
};

function unlocked() {
  var day = today();
  var info = locked(function () {
    var state = loadState();
    var first = state.unlockDay !== day;
    if (first) {
      state.unlockDay = day;
      saveState(state);
    }
    var settings = loadSettings();
    var stale = (state.confettiOn && !confettiAllowed(settings, state, day)) || Boolean(state.preview && state.preview.until < Date.now());
    return { first: first, stale: stale };
  });
  // Without the shell telling when Assi itself is opened, the first unlock of the day stands in for it.
  var openedNow = !shellHas('app.visible') && exports.opened(true).first;
  if (info.first) {
    if (!openedNow) exports.check();
    greetOwnerIfBirthday(true);
    weatherCheck(false);
  } else if (info.stale) {
    exports.check();
  }
}

exports.start = function () {
  var settings = loadSettings();
  registerJobs(settings);
  on('screen', function (event) {
    if (event && event.state === 'unlocked') spawn(function () { safely('разблокировка', unlocked); });
  }, 'holidays.screen');
  if (shellHas('app.visible')) {
    on('app.visible', function (event) {
      if (event && event.on) spawn(function () { safely('открытие', exports.opened); });
    }, 'holidays.visible');
  }
  safely('инструмент агента', writeTool);
  // Also mends what a crash could leave: a holiday theme after its occasion, a preview never ended.
  spawn(function () {
    safely('запуск', function () { exports.check(); });
    safely('ожидания', rearm);
  });
  return true;
};

/** Takes everything off and stops the jobs (before removing the module). */
exports.stop = function () {
  safely('задачи', function () {
    unjob('holidays.daily');
    unjob('holidays.evening');
  });
  locked(function () {
    var state = loadState();
    apply(null, state, loadSettings(), today(), { force: true });
    state.preview = null;
    saveState(state);
  });
  safely('память ассистента', function () { setMemoryLine(null); });
  safely('инструмент агента', function () { if (assi.files.exists(TOOL_FILE)) assi.files.remove(TOOL_FILE); });
  changed();
  return true;
};

// ---- the agent's tool ------------------------------------------------------------------------
// The agent on the phone never sees this module's README: what it can ask for by voice («выключи
// снег», «какие праздники на этой неделе», «напомни про день рождения Пети за три дня») it learns
// from tools/holidays.js, written on every start when missing or different.

var TOOL_FILE = 'tools/holidays.js';

var TOOL = [
  '// Written by modules/holidays on start: the agents\' way to the holidays module.',
  "exports.name = 'holidays';",
  "exports.description = 'Праздники и дни рождения близких. «Выключи снег» и любое праздничное оформление — decor_off (до конца повода), вернуть — decor_on. «Какие праздники на этой неделе» — upcoming с days 7 (без days — на срок из настроек). «Напомни про день рождения Пети за три дня» — remind с who и days; «не напоминай про Петю» — remind с who и off true. Свой повод («годовщина свадьбы 14.06, напомни за три дня») — add с title, date и remind. Модуль никому не пишет: поздравления отправляет владелец.';",
  "exports.parameters = { type: 'object', properties: {",
  "  action: { type: 'string', enum: ['decor_off', 'decor_on', 'upcoming', 'remind', 'add'] },",
  "  days: { type: 'integer', description: 'upcoming: на сколько дней вперёд; remind: за сколько дней напомнить' },",
  "  who: { type: 'string', description: 'remind: имя человека из контактов' },",
  "  remind: { type: 'integer', description: 'add: за сколько дней напомнить о своём поводе' },",
  "  off: { type: 'boolean', description: 'remind: true — не напоминать об этом человеке' },",
  "  title: { type: 'string', description: 'add: название повода' },",
  "  date: { type: 'string', description: 'add: дата 14.06 (каждый год) или 14.06.2027' },",
  "  yearly: { type: 'boolean', description: 'add: false — разовый повод (нужен год)' }",
  "}, required: ['action'] };",
  'exports.run = function (args) {',
  "  if (!require('lib/assi').files.exists('modules/holidays/main.js')) return 'Модуль «Праздники» не установлен';",
  "  return require('modules/holidays/main.js').tool(args || {});",
  '};',
  ''
].join('\n');

function writeTool() {
  if (!assi.files.exists(TOOL_FILE) || assi.files.read(TOOL_FILE) !== TOOL) assi.files.write(TOOL_FILE, TOOL);
}

/** What the tool says about an occasion: short, without the look's details. */
function brief(item) {
  var out = { title: item.title, when: item.when, date: item.anchor, inDays: item.inDays, kind: item.kind };
  if (item.active) out.active = true;
  if (item.age) out.age = item.age;
  if (item.about) out.about = item.about;
  return out;
}

/** tools/holidays.js: { action: 'decor_off' | 'decor_on' | 'upcoming' | 'remind' | 'add', … }. */
exports.tool = function (args) {
  args = args || {};
  var days = args.days === undefined || args.days === null || args.days === '' || isNaN(Number(args.days)) ? null : Math.max(0, Math.round(Number(args.days)));
  switch (args.action) {
    case 'decor_off':
      return exports.decorOff();
    case 'decor_on':
      var result = exports.decorOn();
      return { on: true, title: result.plan ? result.plan.title : null };
    case 'upcoming':
      return exports.upcoming(days || null).map(brief);
    case 'remind':
      if (!args.who) return 'Нужно имя: who';
      if (args.off === true) return exports.setPerson(args.who, { remind: false });
      return exports.setPerson(args.who, days === null ? { remind: true } : { days: days });
    case 'add':
      return exports.addOccasion({ title: args.title, date: args.date, yearly: args.yearly, remind: args.remind });
  }
  return 'Неизвестное действие: ' + args.action;
};

// ---- what the screen and the agent call ----------------------------------------------------

function describe(item, ctx, files) {
  var occasion = item.occasion;
  var rule = occasion.rule || {};
  var kind = occasion.own ? 'own' : rule.contact !== undefined ? 'birthday' : rule.owner !== undefined ? 'owner'
    : rule.install !== undefined ? 'install' : rule.weather !== undefined ? 'weather' : 'holiday';
  var year = calendar.parse(item.anchor).year;
  var age = null;
  if (occasion.person && occasion.person.year) age = year - occasion.person.year;
  if (rule.owner !== undefined && ctx.owner && ctx.owner.year) age = year - ctx.owner.year;
  if (occasion.since) age = year - occasion.since;
  if (rule.install !== undefined && ctx.installDay) age = year - calendar.parse(ctx.installDay).year;
  var look = decor.plan([{ id: item.id, title: item.title, occasion: occasion, anchor: item.anchor, egg: true, consent: true, priority: 1 }],
    { strength: 'full', confetti: true, known: known(files) });
  return {
    id: item.id,
    title: item.title,
    anchor: item.anchor,
    start: item.start,
    end: item.end,
    inDays: item.inDays,
    active: Boolean(item.active),
    when: item.active && item.inDays !== 0 ? 'Идёт сейчас' : birthdays.when(item.inDays),
    icon: occasion.icon || (kind === 'birthday' ? 'heart' : 'calendar'),
    kind: kind,
    about: occasion.about || '',
    accent: decor.isHex(occasion.accent) ? occasion.accent : null,
    look: look ? decor.describe(look) : '',
    hasLook: Boolean(look),
    ask: Boolean(occasion.ask),
    consent: item.consent !== false,
    solemn: Boolean(occasion.solemn),
    contact: occasion.person ? occasion.person.id : null,
    age: age && age > 0 ? age : null,
    own: Boolean(occasion.own)
  };
}

/** Occasions from today for that many days (the setting when not given), with what is on now. */
exports.upcoming = function (days) {
  var settings = loadSettings();
  var state = loadState();
  var day = today();
  var ctx = buildCtx(settings, state);
  var files = decorFiles();
  return calendar.upcoming(occasions(settings), day, days || settings.upcomingDays, ctx).map(function (item) {
    return describe(item, ctx, files);
  });
};

/**
 * The occasion of a day for other modules (Обои дня: the theme of the wallpaper):
 * null | { id, title, decor, wallpaper } — only switched-on occasions that have a wallpaper phrase.
 */
exports.occasionToday = function (dateIso) {
  var settings = loadSettings();
  var state = loadState();
  var day = dateIso ? String(dateIso).slice(0, 10) : today();
  var ctx = buildCtx(settings, state, { people: false });
  var active = calendar.activeOn(occasions(settings), day, ctx).filter(function (item) { return item.occasion.wallpaper; });
  if (!active.length) return null;
  var main = active[0];
  return { id: main.id, title: main.title, decor: [].concat(main.occasion.decor || [])[0] || null, wallpaper: String(main.occasion.wallpaper) };
};

/** The state of things for the screen. */
exports.status = function () {
  var settings = loadSettings();
  var state = loadState();
  var day = today();
  var ctx = buildCtx(settings, state, { cached: true });
  var files = decorFiles();
  var computed = computePlan(settings, state, day, ctx, files);
  var plan = computed.plan;
  var shell = features();
  return {
    day: day,
    plan: plan ? { key: plan.key, id: plan.id, title: plan.title, accent: plan.accent, layers: plan.layers, eggs: plan.eggs, strength: plan.strength, look: decor.describe(plan) } : null,
    active: computed.active.map(function (item) { return { id: item.id, title: item.title, consent: item.consent }; }),
    mode: state.mode || null,
    applied: state.applied || null,
    off: Boolean(plan && state.offKey === plan.key),
    ownerChose: Boolean(plan && state.ownerChoseKey === plan.key),
    preview: state.preview && state.preview.until > Date.now() ? state.preview : null,
    firstSnow: state.firstSnow || null,
    weather: state.weather || null,
    features: {
      decor: shell.indexOf('theme.decor') >= 0,
      actions: shell.indexOf('notify.actions') >= 0,
      once: shell.indexOf('job.once') >= 0,
      visible: shell.indexOf('app.visible') >= 0
    },
    powerSave: powerSave(),
    activeTheme: activeTheme(themeList()),
    permissions: { contacts: granted('READ_CONTACTS'), calendar: granted('READ_CALENDAR'), location: granted('ACCESS_COARSE_LOCATION') }
  };
};

/** People with birthdays (from contacts, or the Birthdays calendar), the owner, recent drafts. */
exports.people = function () {
  var settings = loadSettings();
  var day = today();
  var found = allPeople(settings);
  var list = birthdays.schedule(found.list, day).map(function (person) {
    return {
      id: person.id,
      name: person.name,
      birthday: person.birthday,
      next: person.next,
      inDays: person.inDays,
      when: birthdays.when(person.inDays),
      age: person.age,
      starred: Boolean(person.starred),
      close: Boolean(person.close),
      marked: Boolean(person.marked),
      days: person.days,
      source: person.source || found.source
    };
  });
  var owner = ownerBirthday(settings);
  var ownerInfo = { birthday: owner.birthday, source: owner.source };
  if (owner.birthday) {
    ownerInfo.next = birthdays.next(owner.birthday, day);
    ownerInfo.inDays = calendar.diff(day, ownerInfo.next);
    ownerInfo.age = birthdays.age(owner.birthday, ownerInfo.next);
  }
  return {
    permission: { contacts: granted('READ_CONTACTS'), calendar: granted('READ_CALENDAR') },
    source: found.source,
    people: list,
    unreadable: found.unreadable,
    owner: ownerInfo,
    drafts: recentDrafts(20),
    remindDays: settings.remindDays,
    remindTime: settings.remindTime
  };
};

/** Asks for access (from the screen only — the system dialog needs it): 'contacts', 'calendar', 'location'. */
exports.requestAccess = function (what) {
  var names = { contacts: 'READ_CONTACTS', calendar: 'READ_CALENDAR', location: 'ACCESS_COARSE_LOCATION' };
  var wanted = what ? [].concat(what) : ['contacts', 'calendar'];
  var out = {};
  wanted.forEach(function (kind) {
    if (!names[kind]) return;
    out[kind] = Boolean(safely('разрешение', function () { return assi.permission([names[kind]]); }));
  });
  spawn(function () { safely('проверка', function () { exports.check(); }); });
  return out;
};

/**
 * Who to remind and how early: setPerson('Петя', { days: 3 }) or setPerson(id, { remind: false }).
 * Days without `remind` means "remind".
 */
exports.setPerson = function (who, options) {
  options = options || {};
  var settings = loadSettings();
  var person = findPerson(settings, who);
  if (!person) throw new Error('Не нашёл человека с днём рождения: ' + who);
  locked(function () {
    var raw = readJson(DATA + '/settings.json', {});
    raw.people = raw.people || {};
    var mark = raw.people[person.id] || {};
    if (typeof options.remind === 'boolean') mark.remind = options.remind;
    if (options.days !== undefined && options.days !== null && options.days !== '') {
      mark.days = Number(options.days);
      if (typeof options.remind !== 'boolean') mark.remind = true;
    }
    mark.name = person.name;
    raw.people[person.id] = mark;
    writeJson(DATA + '/settings.json', config.normalize(raw));
  });
  changed();
  var marked = birthdays.markClose([person], loadSettings())[0];
  return { id: marked.id, name: marked.name, close: marked.close, days: marked.days };
};

/** A greeting: kind 'owner' (for the owner's birthday) or 'contact' with a person (its draft text). */
exports.greeting = function (kind, who) {
  if (kind === 'contact' || who) return exports.draft(who).text;
  var settings = loadSettings();
  var facts = ownerFacts();
  var text = null;
  if (settings.greetModel) {
    text = safely('модель', function () {
      return cleanText(require('lib/ai').ask({ role: 'holidays.greeting', system: OWNER_SYSTEM, prompt: 'Факты: ' + JSON.stringify(facts) }));
    });
  }
  return text || ownerTemplate(facts);
};

/** A draft greeting for a person: { contact, name, text, by: 'model' | 'template', at }. Never sent by the module. */
exports.draft = function (who) {
  var settings = loadSettings();
  var person = findPerson(settings, who);
  if (!person) throw new Error('Не нашёл человека с днём рождения: ' + who);
  var day = today();
  var next = birthdays.next(person.birthday, day);
  var age = birthdays.age(person.birthday, next);
  var text = null;
  var by = 'template';
  if (settings.greetModel) {
    text = safely('модель', function () {
      var first = person.name.split(/\s+/)[0];
      var notes = [];
      safely('память', function () {
        notes = require('lib/memory').search(first, 5).map(function (note) { return String(note.text); })
          .filter(function (note) { return note.toLowerCase().indexOf(first.toLowerCase()) >= 0; }).slice(0, 3);
      });
      var facts = { name: person.name, turns: age, birthday: next, notes: notes };
      return cleanText(require('lib/ai').ask({ role: 'holidays.greeting', system: CONTACT_SYSTEM, prompt: 'Факты: ' + JSON.stringify(facts) }));
    });
    if (text) by = 'model';
  }
  if (!text) text = birthdays.template(person.name, age);
  var entry = { contact: person.id, name: person.name, text: text, by: by, at: Date.now() };
  noteHistory(day, { draft: entry }, settings);
  safely('ачивки', function () { rememberGreeting(person, day, next, settings); });
  // «Входящие», when installed, keep it in the person's chat too (nothing is sent, nothing opens).
  var inbox = null;
  try {
    inbox = require('modules/inbox/main.js');
  } catch (absent) {
    inbox = null;
  }
  if (inbox && typeof inbox.draftFor === 'function') {
    var put = safely('входящие', function () {
      return inbox.draftFor(person.name, text, by === 'model' ? 'model' : 'owner', { notify: false, open: false, copy: false });
    });
    if (put && put.ok) entry.inbox = String(put.title || person.name);
  }
  changed();
  return entry;
};

/** The button of a birthday reminder: makes the draft, copies it, shows it in a notification. */
exports.draftFromNotice = function (args) {
  var entry = exports.draft(args && args.contact);
  safely('буфер обмена', function () { assi.clipboard.set(entry.text); });
  var where = entry.inbox ? ' Черновик лежит и во «Входящих», в беседе «' + entry.inbox + '».' : '';
  notify({ title: 'Черновик: ' + entry.name, text: entry.text + '\n\nТекст скопирован — вставьте его в чат сами.' + where, open: SCREEN + '?tab=people' });
  return entry;
};

exports.copy = function (text) {
  assi.clipboard.set(String(text || ''));
  return true;
};

/** Opens the person's card in Contacts: from there the owner picks the chat and sends it. */
exports.openContact = function (id) {
  id = String(id || '');
  if (!/^\d+$/.test(id)) return false;
  assi.openUrl('content://com.android.contacts/contacts/' + id);
  return true;
};

/** The answer to «Первый снег. Включить зимнее оформление?»: { yes: true|false } or a boolean. */
exports.answerSnow = function (args) {
  var yes = args && typeof args === 'object' ? Boolean(args.yes) : Boolean(args);
  locked(function () {
    var state = loadState();
    if (!state.firstSnow) throw new Error('Первого снега в этом сезоне ещё не было');
    state.firstSnow.accepted = yes;
    state.firstSnow.answered = Date.now();
    saveState(state);
  });
  return exports.check();
};

/** Looks at the weather now, whatever the setting's pause says (for the screen and the agent). */
exports.checkWeather = function () {
  return weatherCheck(true);
};

/** Switches the look off until the current occasion is over ("выключи снег"). */
exports.decorOff = function () {
  var result = locked(function () {
    var settings = loadSettings();
    var state = loadState();
    var day = today();
    var computed = computePlan(settings, state, day, buildCtx(settings, state, { cached: true }), decorFiles());
    state.offKey = computed.plan ? computed.plan.key : null;
    state.preview = null;
    apply(null, state, settings, day, { force: true });
    saveState(state);
    return { off: true, title: computed.plan ? computed.plan.title : null };
  });
  changed();
  return result;
};

/** Puts the look back on (after decorOff, or after the owner chose another theme). */
exports.decorOn = function () {
  locked(function () {
    var state = loadState();
    state.offKey = null;
    state.ownerChoseKey = null;
    state.ownerChose = false;
    saveState(state);
  });
  return exports.check();
};

function previewPlan(occasion, day, files) {
  var plan = decor.plan([{ id: occasion.id, title: occasion.title, occasion: occasion, anchor: day, start: day, end: day, egg: true, consent: true, priority: 100 }],
    { strength: 'full', confetti: true, known: known(files) });
  if (plan) plan.key = 'preview:' + occasion.id;
  return plan;
}

function occasionById(settings, id) {
  id = String(id || '');
  var all = occasions(settings, true);
  var found = all.filter(function (occasion) { return occasion.id === id; })[0];
  if (!found && id.indexOf('birthday:') === 0) found = all.filter(function (occasion) { return occasion.rule && occasion.rule.contact === '*'; })[0];
  return found || null;
}

/** The look of an occasion on the phone for a while (the setting when seconds are not given). */
exports.preview = function (id, seconds) {
  var settings = loadSettings();
  var occasion = occasionById(settings, id);
  if (!occasion) throw new Error('Нет повода ' + id);
  var files = decorFiles();
  var day = today();
  var plan = previewPlan(occasion, day, files);
  if (!plan) throw new Error('У повода «' + occasion.title + '» нет оформления — показывать нечего');
  var span = Math.max(5, Math.min(600, Number(seconds) || settings.previewSeconds));
  var until = Date.now() + span * 1000;
  locked(function () {
    var state = loadState();
    apply(plan, state, settings, day, { force: true });
    state.preview = { id: occasion.id, title: occasion.title, until: until };
    saveState(state);
  });
  changed();
  later('holidays.preview', until + 500, function () { exports.endPreview(false); });
  return { id: occasion.id, title: occasion.title, until: until, seconds: span };
};

/** Ends the preview; a timer of an older preview (force false) leaves a newer one alone. */
exports.endPreview = function (force) {
  var ended = locked(function () {
    var state = loadState();
    if (!state.preview) return true;
    if (force !== true && state.preview.until > Date.now() + 1000) return false;
    state.preview = null;
    saveState(state);
    return true;
  });
  return ended ? exports.check() : { preview: true };
};

/** For the mock-up on the screen: the CSS of an occasion's look and the owner's colours under it. */
exports.previewCss = function (id) {
  var settings = loadSettings();
  var occasion = occasionById(settings, id);
  if (!occasion) throw new Error('Нет повода ' + id);
  var files = decorFiles();
  var day = today();
  var plan = previewPlan(occasion, day, files);
  var themes = themeList();
  var state = loadState();
  var owner = ownerTheme(themes, state);
  var base = {};
  Object.keys(decor.KIT).forEach(function (key) { base[key] = decor.KIT[key]; });
  Object.keys(owner.tokens || {}).forEach(function (key) { base[key] = owner.tokens[key]; });
  return {
    id: occasion.id,
    title: occasion.title,
    about: occasion.about || '',
    look: plan ? decor.describe(plan) : '',
    css: plan ? decor.css(plan, cssOptions(settings, files, base, true, day)) : '',
    base: base,
    seconds: settings.previewSeconds
  };
};

/**
 * The owner's own occasion: { title, date: '14.06' | '14.06.2027' | '2027-06-14', yearly (true),
 * remind (days ahead), accent ('#RRGGBB'), decor ('snow' …), wallpaper (English words) } — or
 * { title, rule } with any rule of calendar.js. Kept in data/holidays/own.json.
 */
exports.addOccasion = function (input) {
  input = input || {};
  var title = String(input.title || '').trim();
  if (!title) throw new Error('Нужно название повода');
  var rule = input.rule;
  var since = null;
  if (!rule) {
    var date = calendar.parseUserDate(input.date);
    if (!date) throw new Error('Не понимаю дату «' + (input.date || '') + '». Пример: 14.06 или 14.06.2027');
    var yearly = input.yearly !== false;
    if (!yearly && !date.year) throw new Error('Для разового повода нужен год: 14.06.2027');
    rule = yearly ? { fixed: pad(date.month) + '-' + pad(date.day) } : { date: calendar.iso(date.year, date.month, date.day) };
    if (yearly && date.year) since = date.year;
  }
  if (!calendar.validRule(rule) || rule.contact === '*') throw new Error('Непонятное правило повода');
  var files = decorFiles();
  var occasion = {
    id: 'own-' + Date.now().toString(36),
    title: title.slice(0, 80),
    rule: rule,
    priority: Number(input.priority) || 60,
    icon: input.icon && /^[a-z]+$/.test(input.icon) ? input.icon : 'heart',
    remind: Math.max(0, Math.min(60, Math.round(Number(input.remind) || 0))),
    about: String(input.about || '').slice(0, 300)
  };
  if (decor.isHex(input.accent)) occasion.accent = String(input.accent).toUpperCase();
  var decorNames = [].concat(input.decor || []).filter(function (name) { return known(files).indexOf(name) >= 0; });
  if (decorNames.length) occasion.decor = decorNames.length === 1 ? decorNames[0] : decorNames;
  if (input.wallpaper) occasion.wallpaper = String(input.wallpaper).replace(/[^a-zA-Z ]/g, '').trim().slice(0, 60);
  if (since) occasion.since = since;
  locked(function () {
    var list = ownList();
    list.push(occasion);
    writeJson(DATA + '/own.json', list);
  });
  spawn(function () { safely('проверка', function () { exports.check(); }); });
  return occasion;
};

/** Removes the owner's own occasion; a built-in one is switched off instead. */
exports.removeOccasion = function (id) {
  var outcome = locked(function () {
    var list = ownList();
    var left = list.filter(function (occasion) { return occasion.id !== id; });
    if (left.length !== list.length) {
      writeJson(DATA + '/own.json', left);
      return { removed: true };
    }
    if (builtins().some(function (occasion) { return occasion.id === id; })) {
      var raw = readJson(DATA + '/settings.json', {});
      var values = config.normalize(raw);
      if (values.off.indexOf(id) < 0) values.off.push(id);
      raw.off = values.off;
      writeJson(DATA + '/settings.json', config.normalize(raw));
      return { disabled: true };
    }
    return null;
  });
  if (!outcome) throw new Error('Нет повода ' + id);
  spawn(function () { safely('проверка', function () { exports.check(); }); });
  return outcome;
};

/** Switches an occasion (built-in or own) on or off. */
exports.setOccasion = function (id, on) {
  locked(function () {
    var raw = readJson(DATA + '/settings.json', {});
    var values = config.normalize(raw);
    var off = values.off.filter(function (other) { return other !== id; });
    if (!on) off.push(id);
    raw.off = off;
    writeJson(DATA + '/settings.json', config.normalize(raw));
  });
  spawn(function () { safely('проверка', function () { exports.check(); }); });
  return { id: id, on: Boolean(on) };
};

exports.ownOccasions = function () {
  return ownList();
};

/** { values, schema, occasions, decors } for the «Настройки» and «Свои поводы» tabs. */
exports.settings = function () {
  var values = loadSettings();
  return {
    values: values,
    schema: config.SCHEMA,
    occasions: occasions(values, true).map(function (occasion) {
      return { id: occasion.id, title: occasion.title, own: Boolean(occasion.own), on: values.off.indexOf(occasion.id) < 0, about: occasion.about || '' };
    }),
    decors: known(decorFiles()).map(function (name) {
      return { id: name, title: decor.DECORS[name] ? decor.DECORS[name].title : name };
    })
  };
};

/** Saves the settings (people marks stay unless given), re-arms the jobs, checks the day anew. */
exports.saveSettings = function (values) {
  var merged = locked(function () {
    var raw = readJson(DATA + '/settings.json', {});
    var next = {};
    Object.keys(raw).forEach(function (key) { next[key] = raw[key]; });
    Object.keys(values || {}).forEach(function (key) {
      if (key === 'people' && (!values.people || typeof values.people !== 'object')) return;
      next[key] = values[key];
    });
    var clean = config.normalize(next);
    writeJson(DATA + '/settings.json', clean);
    return clean;
  });
  registerJobs(merged);
  spawn(function () { safely('проверка', function () { exports.check(); }); });
  return merged;
};

/** The home-screen widget: what is on now and what is coming. */
exports.widget = function () {
  var settings = loadSettings();
  var state = loadState();
  var day = today();
  var ctx = buildCtx(settings, state, { cached: true });
  var list = calendar.upcoming(occasions(settings), day, Math.min(settings.upcomingDays, 31), ctx).slice(0, 4);
  var lines = list.map(function (item) {
    return (item.active && item.inDays !== 0 ? 'Сейчас' : birthdays.when(item.inDays)) + ': ' + item.title;
  });
  return { title: 'Праздники', text: lines.length ? lines.join('\n') : 'В ближайший месяц поводов нет', open: SCREEN };
};
