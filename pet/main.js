// The pet: a small drawn creature whose mood comes from the owner's day (the health module's
// today()), whose growth comes from life-rpg and whose things come from achievements. One
// creature for all three. Engine side (Rhino); the arithmetic and the drawing live in pure files
// (mood.js, look.js, shapes.js, svg.js, draw.js, phrases.js, history.js, settings.js), tested in
// node. The API other modules call is listed in pet/README.md.
var axiko = require('lib/axiko');
var Settings = require('./settings.js');
var Mood = require('./mood.js');
var Look = require('./look.js');
var Shapes = require('./shapes.js');
var Svg = require('./svg.js');
var Draw = require('./draw.js');
var Phrases = require('./phrases.js');
var History = require('./history.js');
var Links = require('./links.js');

var ID = 'pet';
var DIR = 'data/pet/';
var MAIN = 'modules/pet/main.js';
var SCREEN = 'modules/pet/ui/index.html';
var HEALTH = 'modules/health/main.js';
var RPG = 'modules/rpg/main.js';
var HOLIDAYS = 'modules/holidays/main.js';
var ACHIEVEMENTS = 'modules/achievements/main.js';
var PHONE_NIGHT = 'modules/phone-night/main.js';
var FOCUS = 'modules/focus/main.js';
var FOCUS_STATE = 'data/focus/state.json';
var GAMES = 'modules/games/main.js';
var WIDGET_PNG = DIR + 'widget.png';
var SLOTS = ['head', 'neck', 'hand', 'shelf'];
var REACTIONS = ['water', 'habit', 'med', 'level', 'achievement', 'welcome', 'tap'];
var PAUSE_WORDS = { sick: 'болею', vacation: 'отпуск', rest: 'перерыв' };
var WEEKDAYS = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];

var GLOBAL = (function () { return this; })();
var LOCK = GLOBAL.__petLock || (GLOBAL.__petLock = new java.util.concurrent.locks.ReentrantLock());

function locked(fn) {
  LOCK.lock();
  try {
    return fn();
  } finally {
    LOCK.unlock();
  }
}

function copy(target) {
  for (var i = 1; i < arguments.length; i++) {
    var source = arguments[i] || {};
    Object.keys(source).forEach(function (key) { target[key] = source[key]; });
  }
  return target;
}

function message(error) {
  return String(error && error.message ? error.message : error);
}

function pad(n) {
  return (n < 10 ? '0' : '') + n;
}

function ymd(ms) {
  var d = new Date(ms);
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

function minuteOf(ms) {
  var d = new Date(ms);
  return d.getHours() * 60 + d.getMinutes();
}

function minutes(hm) {
  var m = /^(\d{1,2}):(\d{2})$/.exec(String(hm || ''));
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
}

// ---- storage ---------------------------------------------------------------------------------

function load(name, fallback) {
  try {
    return axiko.files.readJson(DIR + name, fallback);
  } catch (error) {
    console.warn('pet: не читается ' + name + ': ' + message(error));
    return fallback;
  }
}

function save(name, value, compact) {
  if (compact) axiko.files.write(DIR + name, JSON.stringify(value));
  else axiko.files.writeJson(DIR + name, value);
}

function settings() {
  return Settings.merge(load('settings.json', {}));
}

function loadState() {
  return load('state.json', {});
}

function setState(patch) {
  return locked(function () {
    var now = copy(loadState(), patch);
    save('state.json', now);
    return now;
  });
}

/** Shell changes that are there (docs/shell-changes.md). */
function features() {
  try {
    var list = native('shell.features');
    return Array.isArray(list) ? list : [];
  } catch (error) {
    return [];
  }
}

function has(feature) {
  return features().indexOf(feature) >= 0;
}

function optional(path) {
  if (!axiko.files.exists(path)) return null;
  try {
    return require(path);
  } catch (error) {
    console.warn('pet: ' + path + ': ' + message(error));
    return null;
  }
}

function health() {
  return optional(HEALTH);
}

// ---- the owner's day ---------------------------------------------------------------------------

/** health.today(), or an empty day when the module is not there: then he is just calm. */
function today() {
  var h = health();
  if (h && typeof h.today === 'function') {
    try {
      return h.today();
    } catch (error) {
      console.error('pet: health.today: ' + message(error));
    }
  }
  var now = Date.now();
  return { date: ymd(now), now: now, hour: new Date(now).getHours(), minute: minuteOf(now), known: {}, night: false, screenOn: null, left: [], goals: {} };
}

// ---- the neighbours besides «Здоровье» (links.js): each is optional --------------------------------

/**
 * The owner's minutes in the phone the night before `date`, from «Тайная жизнь телефона»: its
 * ownerNight(night), for an older version its nights(), else its phone_night records in the
 * common base. null when the module is not there or the night is not counted yet.
 */
function phoneNightMinutes(date) {
  var night = Links.nightBefore(date);
  if (!night || !axiko.files.exists(PHONE_NIGHT)) return null;
  var pn = optional(PHONE_NIGHT);
  var minutes = null;
  if (pn) {
    try {
      if (typeof pn.ownerNight === 'function') minutes = Links.minutesOf(pn.ownerNight(night), night);
      if (minutes === null && typeof pn.nights === 'function') minutes = Links.minutesFromRows(pn.nights(3), night);
    } catch (error) {
      console.warn('pet: phone-night: ' + message(error));
    }
  }
  if (minutes !== null) return minutes;
  try {
    var rows = require('lib/base').find({ kind: 'phone_night', source: 'phone-night', since: Date.now() - 3 * 86400000, limit: 10 });
    return Links.minutesFromRows(rows.map(function (row) { return row.data || {}; }), night);
  } catch (error) {
    return null;
  }
}

/** A Focus work session going on now ({ left, paused }), or null; without «Фокус» — null. */
function focusNow() {
  if (!axiko.files.exists(FOCUS)) return null;
  var focus = optional(FOCUS);
  var left = null;
  if (focus && typeof focus.left === 'function') {
    try {
      left = focus.left();
    } catch (error) {
      console.warn('pet: focus.left: ' + message(error));
    }
  }
  var state = null;
  if (!left) {
    try {
      state = axiko.files.readJson(FOCUS_STATE, null);
    } catch (error) {
      state = null;
    }
  }
  return Links.focusOf(left, state, Date.now());
}

/** Minutes of play today: the hub's `play` records in the common base; without the hub — 0. */
function playToday(t) {
  if (!axiko.files.exists(GAMES)) return 0;
  var since = Links.dayStart(t.date || ymd(Date.now()), (t.goals || {}).dayEnd);
  if (since === null) return 0;
  try {
    return Links.playMinutes(require('lib/base').find({ kind: 'play', since: since, limit: 500 }), since);
  } catch (error) {
    console.warn('pet: игры: ' + message(error));
    return 0;
  }
}

/** today() with what the neighbours add: the night screen, a Focus session, today's games. */
function dayWithLinks(s) {
  var t = today();
  var date = t.date || ymd(Date.now());
  t = Links.withLate(t, s, s.phoneNightOn ? phoneNightMinutes(date) : null);
  var focus = s.focusOn ? focusNow() : null;
  if (focus) t.focus = focus;
  if (s.playOn) t.playMin = playToday(t);
  return t;
}

// ---- growth, things, season ----------------------------------------------------------------------

/** { stage 0–4, level, traits, rpg }: from life-rpg; without it — the sprout. */
function growth(s) {
  var out = { stage: 0, level: null, traits: [], rpg: false };
  var rpg = optional(RPG);
  if (!rpg || typeof rpg.look !== 'function') return out;
  try {
    var g = rpg.look() || {};
    out.rpg = true;
    out.level = typeof g.level === 'number' ? g.level : null;
    out.stage = typeof g.stageIndex === 'number' ? Math.max(0, Math.min(4, g.stageIndex)) : Look.stageFor(g.level || 1, s.stages);
    out.traits = Array.isArray(g.traits) ? g.traits.filter(function (x) { return typeof x === 'string'; }) : [];
  } catch (error) {
    console.warn('pet: rpg.look: ' + message(error));
  }
  return out;
}

/** The things: data/pet/items.json, a list (a { items: [...] } file is read the same way). */
function loadItems() {
  var value = load('items.json', []);
  if (!Array.isArray(value)) value = value && Array.isArray(value.items) ? value.items : [];
  return value.filter(function (item) { return item && item.id; });
}

function saveItems(items) {
  save('items.json', items);
}

var occasionCache = { date: null, id: null, present: false };
/** The holidays module's occasion of the day (one call a day, again when the module comes or goes). */
function occasionId(date) {
  var present = axiko.files.exists(HOLIDAYS);
  if (occasionCache.date === date && occasionCache.present === present) return occasionCache.id;
  var id = null;
  var holidays = present ? optional(HOLIDAYS) : null;
  if (holidays && typeof holidays.occasionToday === 'function') {
    try {
      var occ = holidays.occasionToday(date);
      id = occ && occ.id ? String(occ.id) : null;
    } catch (error) {
      console.warn('pet: holidays.occasionToday: ' + message(error));
    }
  }
  occasionCache = { date: date, id: id, present: present };
  return id;
}

/** Everything the look depends on besides the state. */
function scene(s, st) {
  var now = Date.now();
  var date = st.date || ymd(now);
  var g = growth(s);
  return {
    stage: g.stage, level: g.level, traits: g.traits, rpg: g.rpg,
    items: loadItems(),
    palette: s.palette,
    season: s.seasonOn ? Look.season(occasionId(date), new Date(now).getMonth() + 1, s.winterMonths) : [],
    holding: st.holding && st.holding.until > now ? st.holding : null,
    party: Boolean(st.party && st.party.until > now)
  };
}

function lookOf(stateId, sc, reaction) {
  return Look.look(stateId, {
    stage: sc.stage, traits: sc.traits, items: sc.items, palette: sc.palette, season: sc.season,
    holding: sc.holding ? { rarity: sc.holding.rarity || 'common' } : null,
    party: sc.party, reaction: reaction || null
  });
}

function darkRoom(stateId, s) {
  return stateId === 'asleep' || stateId === 'woken' || Mood.inWindow(minuteOf(Date.now()), s.darkFrom, s.darkTo);
}

/** The shelf: the rarest things first, then the newest (the room has room for four). */
function shelfOf(items) {
  return Links.shelf(items);
}

// ---- phrases -------------------------------------------------------------------------------------

/** The templates: data/pet/phrases.json (the owner may edit it) over the module's own. */
function book() {
  var own = {};
  try {
    own = axiko.files.readJson('modules/pet/phrases.json', {});
  } catch (error) {
    console.error('pet: phrases.json модуля: ' + message(error));
  }
  var mine = load('phrases.json', null);
  if (!mine || typeof mine !== 'object') return own;
  var out = copy({}, own);
  Object.keys(mine).forEach(function (kind) {
    if (Array.isArray(mine[kind]) && mine[kind].length) out[kind] = mine[kind];
  });
  return out;
}

// The model writes its phrases for the whole day, in the morning; at night (asleep, woken) the
// templates speak — a morning line does not fit a creature curled up at 01:30. Nor does it fit a
// Focus session (the phrase kind 'focus'): he sits quietly then.
var NIGHT_STATES = ['asleep', 'woken', 'focus'];

/** The kind of phrase for a state: 'focus' while a Focus session is on. */
function phraseKind(stateId, focus) {
  return focus ? 'focus' : stateId;
}

/**
 * The phrase of a state today: one of the model's lines of the day (written for today, the same
 * pause, not at night), else a template.
 */
function statePhrase(stateId, date, st, s) {
  var turn = Number(st.phraseTurn) || 0;
  var model = st.model;
  if (s.modelOn && model && model.date === date && NIGHT_STATES.indexOf(stateId) < 0 &&
    (model.paused || null) === (st.paused || null) && model.lines && model.lines.length) {
    var line = model.lines[turn % model.lines.length];
    if (Phrases.clean(line, s.banned)) return line;
  }
  return Phrases.pick(book(), stateId, date + '|' + turn, s.banned, { name: s.name }) ||
    Phrases.pick(book(), 'calm', date, s.banned, { name: s.name }) || '';
}

function reactionPhrase(kind, info, s) {
  var seed = ymd(Date.now()) + '|' + Date.now();
  return Phrases.pick(book(), kind, seed, s.banned, copy({ name: s.name }, info || {})) || '';
}

/**
 * Says a text with the phone's own (local) voice, as the description sets; quietly nothing when
 * there is no local voice — the creature does not switch to the cloud voice.
 */
function say(text) {
  if (!text) return false;
  try {
    native('speech.say', String(text), 'local');
    return true;
  } catch (error) {
    console.warn('pet: местного голоса нет: ' + message(error));
    return false;
  }
}

// ---- the picture for the widget: the same shapes through android.graphics.Canvas -----------------

function rgb(hex) {
  var m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex || ''));
  if (!m) return null;
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}

/** Draws a look into a PNG (size × size); returns the bytes as a Java byte[]. */
function pngBytes(look, size) {
  var G = android.graphics;
  var px = Number(size) || 320;
  var bmp = G.Bitmap.createBitmap(px, px, G.Bitmap.Config.ARGB_8888);
  var canvas = new G.Canvas(bmp);
  var k = px / 320;
  if (k !== 1) canvas.scale(k, k);
  var paint = new G.Paint(G.Paint.ANTI_ALIAS_FLAG);
  function paintWith(color, opacity) {
    var c = rgb(color);
    if (!c) return false;
    paint.setARGB(Math.round(255 * (opacity === undefined ? 1 : opacity)), c[0], c[1], c[2]);
    return true;
  }
  function draw(shape, p) {
    if (p.fill && paintWith(p.fill, p.opacity)) {
      paint.setStyle(G.Paint.Style.FILL);
      shape();
    }
    if (p.stroke && paintWith(p.stroke, p.opacity)) {
      paint.setStyle(G.Paint.Style.STROKE);
      paint.setStrokeWidth(p.width || 1);
      paint.setStrokeCap(p.round ? G.Paint.Cap.ROUND : G.Paint.Cap.BUTT);
      paint.setStrokeJoin(G.Paint.Join.ROUND);
      shape();
    }
  }
  var adapter = {
    save: function () { canvas.save(); },
    restore: function () { canvas.restore(); },
    translate: function (x, y) { canvas.translate(x, y); },
    rotate: function (deg, ox, oy) { canvas.rotate(deg, ox, oy); },
    scale: function (s, ox, oy) { canvas.scale(s, s, ox, oy); },
    clip: function (cx, cy, rx, ry) {
      var oval = new G.Path();
      oval.addOval(new G.RectF(cx - rx, cy - ry, cx + rx, cy + ry), G.Path.Direction.CW);
      canvas.clipPath(oval);
    },
    path: function (commands, p) {
      var path = new G.Path();
      commands.forEach(function (c) {
        if (c[0] === 'M') path.moveTo(c[1], c[2]);
        else if (c[0] === 'L') path.lineTo(c[1], c[2]);
        else if (c[0] === 'C') path.cubicTo(c[1], c[2], c[3], c[4], c[5], c[6]);
        else if (c[0] === 'Q') path.quadTo(c[1], c[2], c[3], c[4]);
        else path.close();
      });
      draw(function () { canvas.drawPath(path, paint); }, p);
    },
    ellipse: function (cx, cy, rx, ry, p) {
      var r = new G.RectF(cx - rx, cy - ry, cx + rx, cy + ry);
      draw(function () { canvas.drawOval(r, paint); }, p);
    }
  };
  Draw.walk(Shapes.creature(look), adapter, look.colors);
  var out = new java.io.ByteArrayOutputStream();
  bmp.compress(G.Bitmap.CompressFormat.PNG, 100, out);
  bmp.recycle();
  return out.toByteArray();
}

function writePng(look, path) {
  var bytes = pngBytes(look, 320);
  var file = new java.io.File(axiko.files.path(path));
  file.getParentFile().mkdirs();
  var tmp = new java.io.File(file.getPath() + '.tmp');
  var stream = new java.io.FileOutputStream(tmp);
  try {
    stream.write(bytes);
  } finally {
    stream.close();
  }
  if (!tmp.renameTo(file)) {
    file['delete']();
    tmp.renameTo(file);
  }
  return path;
}

// ---- the mood -------------------------------------------------------------------------------------

var lastDay = null; // the last health.today(), for «Почему так» right after a recount

function factorsOnly(f) {
  return { sleepScore: f.sleepScore, lateScore: f.lateScore, activityScore: f.activityScore, careScore: f.careScore, dayShare: f.dayShare, playBonus: f.playBonus || 0 };
}

/**
 * While a Focus session runs, one recount right after its end (focusRecheck minutes later), so
 * he does not stay «quiet» for up to a whole tick. Needs job.once; without it the tick does it.
 */
function afterFocus(focus, s) {
  if (!focus || focus.paused || !(focus.left > 0) || !has('job.once')) return;
  var at = Date.now() + focus.left + s.focusRecheck * 60000;
  // A minute's precision: the same end registered again is the same moment.
  at = Math.ceil(at / 60000) * 60000;
  try {
    job('pet:focus', { once: at }, safely('focus', function () { exports.recompute(); }));
  } catch (error) {
    console.warn('pet: пересчёт после Фокуса: ' + message(error));
  }
}

function lookKey(stateId, sc) {
  var look = lookOf(stateId, sc, null);
  delete look.motion;
  return JSON.stringify(look);
}

/** After a recount: the picture, the widget and open screens learn about a change. */
function afterChange(st, changedState, s) {
  var sc = scene(s, st);
  var key = lookKey(st.state, sc);
  var widgetKey = st.state + '|' + st.line + '|' + st.phrase + '|' + s.name;
  var redraw = key !== st.lookKey;
  var refresh = redraw || widgetKey !== st.widgetKey;
  if (redraw && has('widget.image')) {
    try {
      writePng(lookOf(st.state, sc, null), WIDGET_PNG);
    } catch (error) {
      console.error('pet: картинка виджета: ' + message(error));
    }
  }
  if (redraw || refresh) setState({ lookKey: key, widgetKey: widgetKey });
  if (refresh) {
    try { axiko.widget.refresh(ID); } catch (error) { /* no widget */ }
  }
  if (changedState || redraw) {
    try { emit('pet.changed', { state: st.state, energy: st.energy }); } catch (error) { /* no screens */ }
  }
}

/**
 * Recounts the mood now: state.json, a line in history.json, the widget. opts: { tick } — the
 * regular recount (it counts towards the day's averages). Returns the state record.
 */
exports.recompute = function (opts) {
  opts = opts || {};
  var s = settings();
  var t = dayWithLinks(s);
  lastDay = t;
  var m = Mood.compute(t, s);
  var now = Date.now();
  var kind = phraseKind(m.state, m.focus);
  var out = locked(function () {
    var st = loadState();
    var prev = st.state;
    var date = t.date || ymd(now);
    var next = copy({}, st, {
      state: m.state, reason: m.reason, energy: m.energy, known: m.known, factors: factorsOnly(m.factors),
      date: date, updated: now, paused: t.paused || null,
      night: t.goals && t.goals.nightStart ? { start: t.goals.nightStart, end: t.goals.nightEnd } : null,
      line: Mood.widgetLine(t, m.energy), health: Boolean(health()),
      focus: m.focus ? t.focus : null, lateSource: t.lateSource || null, playMin: t.playMin || 0
    });
    if (prev !== m.state || !st.since) next.since = now;
    if (next.party && !(next.party.until > now)) delete next.party;
    var expired = null;
    if (next.holding && !(next.holding.until > now)) {
      expired = next.holding;
      delete next.holding;
    }
    if (next.reaction && !(next.reaction.until > now)) delete next.reaction;
    if (prev !== m.state || (st.phraseKind || st.state) !== kind || next.phraseDate !== date || !next.phrase) {
      if (next.phraseDate !== date) next.phraseTurn = 0;
      next.phrase = statePhrase(kind, date, next, s);
      next.phraseDate = date;
      next.phraseKind = kind;
    }
    save('state.json', next);
    var history = History.add(load('history.json', []), { date: date, minute: typeof t.minute === 'number' ? t.minute : minuteOf(now), state: m.state, energy: m.energy, tick: Boolean(opts.tick) },
      { morningUntil: s.morningUntil, eveningFrom: s.eveningFrom, dayEnd: (t.goals || {}).dayEnd, keepDays: s.historyDays });
    save('history.json', history, true);
    return { st: next, changed: prev !== m.state, expired: expired };
  });
  // A badge held past holdDays is put down by itself: onto the shelf, as when the owner saw it.
  if (out.expired) shelve(out.expired);
  afterChange(out.st, out.changed, s);
  afterFocus(m.focus ? t.focus : null, s);
  return out.st;
};

/** The state record: { state, title, reason, energy, known, factors, since, phrase, line, … }. */
exports.state = function () {
  var st = loadState();
  var s = settings();
  if (!st.state || !(Date.now() - (st.updated || 0) < s.tickEvery * 60000)) st = exports.recompute();
  return copy({}, st, { title: Mood.title(st.state), name: s.name });
};

/** The phrase in force (for the horoscope, the bedtime series, the agent). */
exports.phrase = function () {
  return exports.state().phrase || '';
};

/** The mood for a made-up day (checks, eval): today()-like object in, nothing saved. */
exports.preview = function (t) {
  var s = settings();
  var m = Mood.compute(t, s);
  var date = t.date || ymd(Date.now());
  return {
    state: m.state, title: Mood.title(m.state), reason: m.reason, energy: m.energy, known: m.known, factors: m.factors, focus: m.focus,
    why: Mood.why(t, m.factors, s), phrase: statePhrase(phraseKind(m.state, m.focus), date, {}, s)
  };
};

/** The look parameters (look.js) of a state, with the growth, things and season of now. */
exports.look = function (stateId, reaction) {
  var s = settings();
  var st = loadState();
  return lookOf(stateId || st.state || 'calm', scene(s, st), reaction);
};

/**
 * The creature as SVG text. opts: { state, reaction, room (bool), still (bool), size }.
 * Without a state — the one in force.
 */
exports.svg = function (opts) {
  opts = opts || {};
  var s = settings();
  var st = loadState();
  var id = opts.state || st.state || 'calm';
  var look = lookOf(id, scene(s, st), opts.reaction);
  return Svg.render(look, {
    room: Boolean(opts.room), night: darkRoom(id, s), shelf: shelfOf(loadItems()), size: opts.size || null,
    still: Boolean(opts.still), blinkSeconds: 3 + Math.round(Math.random() * 40) / 10, label: s.name + ': ' + Mood.title(id).toLowerCase()
  });
};

/** The same picture as the widget's, as a data: URL (to compare with the SVG on the debug tab). */
exports.png = function (opts) {
  opts = opts || {};
  var s = settings();
  var st = loadState();
  var look = lookOf(opts.state || st.state || 'calm', scene(s, st), opts.reaction);
  var bytes = pngBytes(look, Number(opts.size) || 320);
  return 'data:image/png;base64,' + String(android.util.Base64.encodeToString(bytes, android.util.Base64.NO_WRAP));
};

/** Draws the widget picture now (also without the shell change, for checks). Returns its path. */
exports.drawWidget = function () {
  var s = settings();
  var st = loadState();
  return writePng(lookOf(st.state || 'calm', scene(s, st), null), WIDGET_PNG);
};

// ---- reactions ------------------------------------------------------------------------------------

/** A short reaction: { kind, phrase, at, until }. The same kind within its seconds is not repeated. */
function startReaction(kind, info) {
  var s = settings();
  var now = Date.now();
  return locked(function () {
    var st = loadState();
    if (st.reaction && st.reaction.kind === kind && st.reaction.until > now) return st.reaction;
    var reaction = { kind: kind, at: now, until: now + s.reactSeconds * 1000, phrase: reactionPhrase(kind, info, s) };
    st.reaction = reaction;
    save('state.json', st);
    return reaction;
  });
}

function kindOfMark(payload) {
  var type = payload && payload.type;
  if (type === 'water') return 'water';
  if (type === 'habit' || type === 'workout') return 'habit';
  if (type === 'med' && payload.status !== 'skipped' && payload.status !== 'missed') return 'med';
  return null;
}

/** Hook life.mark (data/health/hooks.json): the owner marked something — react and recount. */
exports.onMark = function (payload) {
  var kind = kindOfMark(payload);
  var reaction = kind ? startReaction(kind, { title: payload && payload.title }) : null;
  var st = exports.recompute();
  if (reaction) {
    try { emit('pet.react', { kind: kind, at: reaction.at, phrase: reaction.phrase, state: st.state }); } catch (error) { /* no screens */ }
  }
  return kind;
};

/** Hook life.place: a new place makes him curious at once. */
exports.onPlace = function () {
  exports.recompute();
};

/** Hook life.day: a closed day; the new one starts from a clean sheet. */
exports.onDay = function (date) {
  exports.recompute();
  return date;
};

/** The screen asks for a reaction itself (its own buttons, or no hooks): returns the view. */
exports.react = function (kind, info) {
  if (REACTIONS.indexOf(kind) < 0) throw new Error('Нет такой реакции: ' + kind);
  startReaction(kind, info);
  return exports.view({ quiet: true });
};

/**
 * Called by life-rpg and achievements: celebrate('level', { level }) — a party for partyHours;
 * celebrate('achievement', { id, title, rarity }) — he holds the badge until the owner looks
 * (seen()), at most holdDays.
 */
exports.celebrate = function (kind, info) {
  info = info || {};
  var s = settings();
  var now = Date.now();
  if (kind === 'level') {
    setState({ party: { level: Number(info.level) || null, at: now, until: now + s.partyHours * 3600000 } });
  } else if (kind === 'achievement') {
    // A badge he still holds is not lost under the new one: it goes onto the shelf first.
    var before = loadState().holding;
    if (before) shelve(before);
    var rarity = Links.rarity(info.rarity) || achievementRarity(info.id) || 'common';
    setState({ holding: { id: String(info.id || ''), title: String(info.title || ''), rarity: rarity, at: now, until: now + s.holdDays * 86400000 } });
  } else {
    throw new Error('Праздник бывает level или achievement');
  }
  var reaction = startReaction(kind, { title: info.title || '' });
  var st = exports.recompute();
  try { emit('pet.react', { kind: kind, at: reaction.at, phrase: reaction.phrase, state: st.state, info: info }); } catch (error) { /* no screens */ }
  return true;
};

/**
 * The owner saw the badge he holds: he puts it down — on the shelf of his room when it is rare
 * enough (shelfFrom). Returns the badge ({ id, title, rarity, shelf: the thing's id or null }).
 */
exports.seen = function () {
  var st = loadState();
  if (!st.holding) return null;
  var held = st.holding;
  setState({ holding: null, lastBadge: held });
  var placed = shelve(held);
  exports.recompute();
  return copy({}, held, { shelf: placed ? placed.id : null });
};

/** The rarity of an achievement from its definition (achievements.list()); null without the module. */
function achievementRarity(from) {
  if (!from) return null;
  var achievements = optional(ACHIEVEMENTS);
  if (!achievements || typeof achievements.list !== 'function') return null;
  try {
    return Links.rarityOfItem(achievements.list(), from);
  } catch (error) {
    console.warn('pet: achievements.list: ' + message(error));
    return null;
  }
}

/** A badge he held goes onto the shelf (rare and above by default); returns the thing or null. */
function shelve(held) {
  var item = Links.badgeItem(held, settings(), loadItems());
  if (!item) return null;
  try {
    return exports.give(item).item;
  } catch (error) {
    console.warn('pet: значок на полку: ' + message(error));
    return null;
  }
}

/** Things on the shelf from before rarities came with them: looked up once in the achievements. */
function fillRarities() {
  var items = loadItems();
  var missing = items.filter(function (item) { return item.slot === 'shelf' && item.from && !Links.rarity(item.rarity); });
  if (!missing.length || !axiko.files.exists(ACHIEVEMENTS)) return 0;
  var found = {};
  missing.forEach(function (item) { found[item.id] = achievementRarity(item.from); });
  return locked(function () {
    var list = loadItems();
    var count = 0;
    list.forEach(function (item) {
      if (found[item.id] && !Links.rarity(item.rarity)) {
        item.rarity = found[item.id];
        count++;
      }
    });
    if (count) saveItems(list);
    return count;
  });
}

/** After a break of welcomeDays and more, he is glad the owner is back. */
function noticeLook(s) {
  var date = ymd(Date.now());
  var st = loadState();
  if (st.lastSeen === date) return false;
  var gap = History.gap(st.lastSeen, date);
  setState({ lastSeen: date });
  if (st.lastSeen && gap >= s.welcomeDays) {
    startReaction('welcome', { days: gap });
    return true;
  }
  return false;
}

// ---- things ----------------------------------------------------------------------------------------

/** All things: [{ id, from, slot, worn, title, got }]. */
exports.items = function () {
  return loadItems().map(function (item) { return copy({}, item, { title: Look.itemTitle(item) }); });
};

/**
 * A new thing (achievements): { id, from, slot, worn: false, rarity?, title? }. Without a rarity
 * (an older achievements module) it is looked up in the achievement's definition; not found —
 * common. A thing he has stays as it is.
 */
exports.give = function (item) {
  if (!item || !item.id) throw new Error('У вещи нужен id');
  var slot = SLOTS.indexOf(item.slot) >= 0 ? item.slot : 'shelf';
  var rarity = Links.rarity(item.rarity) || (item.from ? achievementRarity(String(item.from)) : null);
  var result = locked(function () {
    var items = loadItems();
    var found = items.filter(function (one) { return one.id === String(item.id); })[0];
    if (found) return { already: true, item: found };
    var thing = { id: String(item.id), from: item.from ? String(item.from) : null, slot: slot, worn: Boolean(item.worn), got: Date.now() };
    if (item.title) thing.title = String(item.title);
    if (rarity) thing.rarity = rarity;
    if (item.badge) thing.badge = true;
    items.push(thing);
    saveItems(items);
    return { already: false, item: thing };
  });
  if (!result.already) {
    try { emit('pet.changed', { item: result.item.id }); } catch (error) { /* no screens */ }
  }
  return result;
};
exports.addItem = exports.give;

/** Puts a thing on (on: true) or takes it off; one thing a slot. Things on the shelf just stand there. */
exports.wear = function (id, on) {
  var items = locked(function () {
    var list = loadItems();
    var thing = list.filter(function (one) { return one.id === id; })[0];
    if (!thing) throw new Error('Нет такой вещи: ' + id);
    var want = on === undefined ? !thing.worn : Boolean(on);
    list.forEach(function (one) {
      if (one.id === id) one.worn = want;
      else if (want && thing.slot !== 'shelf' && one.slot === thing.slot) one.worn = false;
    });
    saveItems(list);
    return list;
  });
  exports.recompute();
  return items;
};

/** For checks only: takes a thing away (the owner's things are never lost otherwise). */
exports._drop = function (id) {
  locked(function () {
    saveItems(loadItems().filter(function (one) { return one.id !== id; }));
  });
};

// ---- the day's notification and the model's phrases ------------------------------------------------

function notifyMinute(s, date) {
  var from = minutes(s.notifyFrom);
  var to = minutes(s.notifyTo);
  var span = to > from ? to - from : 1;
  return from + Phrases.hash('notify|' + date) % span;
}

function maybeNotify(s, st) {
  if (!s.notifyOn) return false;
  var now = Date.now();
  var date = ymd(now);
  var minute = minuteOf(now);
  if (st.notified === date || minute < notifyMinute(s, date) || minute >= minutes(s.notifyTo)) return false;
  if (st.state === 'asleep' || st.state === 'woken' || !st.phrase) return false;
  // A Focus session is not interrupted: the day's notification waits for a later tick.
  if (st.focus) return false;
  var options = { title: s.name + ' · ' + Mood.title(st.state).toLowerCase(), text: st.phrase, open: SCREEN };
  if (has('notify.actions')) {
    options.id = 'pet-day';
    options.silent = true;
  }
  try {
    axiko.notify(options);
    setState({ notified: date });
    return true;
  } catch (error) {
    console.warn('pet: уведомление: ' + message(error));
    return false;
  }
}

/** The model of the role pet.voice writes three phrases for today (modelOn). Returns them. */
exports.modelPhrases = function () {
  var s = settings();
  if (!s.modelOn) return null;
  var st = exports.recompute();
  var sc = scene(s, st);
  var worn = lookOf(st.state, sc, null).items.map(function (item) { return Look.itemTitle(item).toLowerCase(); });
  var now = new Date();
  var info = {
    name: s.name, title: Mood.title(st.state).toLowerCase(), paused: st.paused ? PAUSE_WORDS[st.paused] : null,
    stage: Look.STAGE_TITLES[sc.stage].toLowerCase(), items: worn,
    season: sc.season.length ? sc.season.map(function (x) { return Look.itemTitle(x).toLowerCase(); }).join(', ') : null,
    weekday: WEEKDAYS[now.getDay()],
    facts: Mood.why(lastDay || today(), st.factors || {}, s).map(function (line) { return line.text; })
  };
  var answer = require('lib/ai').ask({ role: 'pet.voice', system: Phrases.SYSTEM, prompt: Phrases.prompt(info) });
  var lines = Phrases.fromModel(typeof answer === 'string' ? answer : String(answer && answer.text || ''), s.banned, 3);
  if (!lines.length) return [];
  setState({ model: { date: st.date, state: st.state, paused: st.paused || null, lines: lines, at: Date.now() }, phraseDate: null });
  exports.recompute();
  return lines;
};

// ---- the regular work -----------------------------------------------------------------------------

/** job pet:tick: the recount; the day's notification when it is on. */
exports.tick = function () {
  var st = exports.recompute({ tick: true });
  maybeNotify(settings(), st);
  return st.state;
};

function onScreen(event) {
  var what = String(event && event.state);
  // Only the unlock wakes him (a notification that lights the screen does not), and only at night.
  if (what !== 'unlocked' && what !== 'off') return;
  var st = loadState();
  var night = st.night || { start: '00:30', end: '05:00' };
  var inNight = Mood.inWindow(minuteOf(Date.now()), night.start, night.end);
  if (!inNight && st.state !== 'asleep' && st.state !== 'woken') return;
  spawn(function () {
    try {
      exports.recompute();
    } catch (error) {
      console.error('pet: экран ночью: ' + message(error));
    }
  });
}

function safely(name, fn) {
  return function () {
    try {
      return fn();
    } catch (error) {
      console.error('pet: ' + name + ': ' + message(error));
      return null;
    }
  };
}

function arm() {
  var s = settings();
  job('pet:tick', { every: s.tickEvery }, safely('tick', exports.tick));
  if (s.modelOn) job('pet:voice', { at: s.modelAt }, safely('voice', exports.modelPhrases));
  else unjob('pet:voice');
}

/** The hooks of the life modules: through health.hook(), or straight into the file in the agreed order. */
function registerHooks() {
  var wanted = [['life.mark', 'onMark'], ['life.place', 'onPlace'], ['life.day', 'onDay']];
  var h = health();
  if (h && typeof h.hook === 'function') {
    wanted.forEach(function (w) {
      try { h.hook(w[0], MAIN, w[1]); } catch (error) { console.warn('pet: крючок ' + w[0] + ': ' + message(error)); }
    });
    return true;
  }
  if (!h) return false;
  var path = 'data/health/hooks.json';
  var current = axiko.files.readJson(path, []);
  var wrapped = !Array.isArray(current);
  var list = wrapped ? (current && Array.isArray(current.hooks) ? current.hooks : []) : current;
  var changed = false;
  wanted.forEach(function (w) {
    if (list.some(function (x) { return x.event === w[0] && x.path === MAIN && x.fn === w[1]; })) return;
    list.push({ event: w[0], path: MAIN, fn: w[1] });
    changed = true;
  });
  if (changed) axiko.files.writeJson(path, wrapped ? copy({}, current, { hooks: list }) : list);
  return true;
}

function hooked() {
  var h = health();
  var list = [];
  try {
    list = h && typeof h.hooks === 'function' ? h.hooks() : axiko.files.readJson('data/health/hooks.json', []);
  } catch (error) {
    list = [];
  }
  if (!Array.isArray(list)) list = list && Array.isArray(list.hooks) ? list.hooks : [];
  return list.some(function (x) { return x.path === MAIN && x.event === 'life.mark'; });
}

/** Writes the full settings once, so life-rpg reads the name, the palette and the stages. */
function ensureSettings() {
  var saved = load('settings.json', null);
  var full = Settings.merge(saved || {});
  var missing = !saved || Object.keys(full).some(function (key) { return !(key in saved); });
  if (missing) save('settings.json', copy({}, full, saved ? Settings.clean(saved) : {}));
  if (!axiko.files.exists(DIR + 'phrases.json')) {
    try {
      axiko.files.write(DIR + 'phrases.json', axiko.files.read('modules/pet/phrases.json'));
    } catch (error) {
      console.warn('pet: копия фраз: ' + message(error));
    }
  }
}

function installTool() {
  try {
    var text = axiko.files.read('modules/pet/tools/pet_state.js');
    if (!axiko.files.exists('tools/pet_state.js') || axiko.files.read('tools/pet_state.js') !== text) axiko.files.write('tools/pet_state.js', text);
  } catch (error) {
    console.error('pet: инструмент pet_state: ' + message(error));
  }
}

// ---- settings ----------------------------------------------------------------------------------------

exports.settings = function () {
  return settings();
};

exports.settingsSchema = function () {
  return Settings.SCHEMA;
};

/** Saves a part of the settings; the jobs, the picture and the widget follow. */
exports.setSettings = function (patch) {
  var next = locked(function () {
    var merged = copy({}, Settings.merge(load('settings.json', {})), Settings.clean(patch || {}));
    save('settings.json', merged);
    return merged;
  });
  arm();
  setState({ phraseDate: null, lookKey: null });
  exports.recompute();
  return next;
};

// ---- the widget, the home card, the screen, the agent ---------------------------------------------------

/** The widget: «Листик · бодрый», «Энергия 82 · сон 7:40 · 6 100 шагов», the phrase; the picture with widget.image. */
exports.widget = function () {
  var s = settings();
  var st = exports.state();
  var out = {
    title: s.name + ' · ' + Mood.title(st.state).toLowerCase(),
    text: (st.line || 'Энергия —') + (st.phrase ? '\n' + st.phrase : ''),
    open: SCREEN
  };
  if (has('widget.image')) {
    if (!axiko.files.exists(WIDGET_PNG)) {
      try { exports.drawWidget(); } catch (error) { console.error('pet: картинка виджета: ' + message(error)); }
    }
    if (axiko.files.exists(WIDGET_PNG)) out.image = WIDGET_PNG;
  }
  return out;
};

function activeReaction(st) {
  return st.reaction && st.reaction.until > Date.now() ? st.reaction : null;
}

/** The home card: a small creature, the state and the phrase. */
exports.card = function () {
  var s = settings();
  noticeLook(s);
  var st = exports.state();
  var reaction = activeReaction(st);
  var sc = scene(s, st);
  return {
    name: s.name, state: st.state, title: Mood.title(st.state), energy: st.energy,
    phrase: reaction && reaction.phrase ? reaction.phrase : st.phrase,
    svg: Svg.render(lookOf(st.state, sc, reaction ? reaction.kind : null), { blinkSeconds: 4 + Math.round(Math.random() * 30) / 10, label: s.name + ': ' + Mood.title(st.state).toLowerCase() })
  };
};

function strip(s) {
  var rows = load('history.json', []);
  var byDate = {};
  rows.forEach(function (row) { byDate[row.date] = row; });
  var out = [];
  var day = new Date();
  day.setHours(12, 0, 0, 0);
  for (var i = s.stripDays - 1; i >= 0; i--) {
    var d = new Date(day.getTime() - i * 86400000);
    var date = ymd(d.getTime());
    var main = History.main(byDate[date]);
    out.push({ date: date, state: main, title: main ? Mood.title(main) : 'нет данных', energy: byDate[date] ? byDate[date].energyAvg : null });
  }
  return out;
}

/** Quick marks under the room: water and the habits still due today (from the health module). */
function quick(t) {
  var h = health();
  if (!h) return null;
  var out = { water: typeof h.addWater === 'function', glassMl: (t.goals && t.goals.glassMl) || null, habits: [] };
  try {
    var left = Array.isArray(t.left) ? t.left : [];
    out.habits = (h.habits() || []).filter(function (x) { return !x.archived && left.indexOf(x.title) >= 0; })
      .map(function (x) { return { id: x.id, title: x.title, icon: x.icon || null }; });
  } catch (error) {
    console.warn('pet: привычки: ' + message(error));
  }
  return out;
}

/**
 * Everything the screen draws, in one call (the mood is recounted first). opts: { quiet } — a
 * reload after an event, not the owner opening the room (no «welcome back»).
 */
exports.view = function (opts) {
  opts = opts || {};
  var s = settings();
  if (!opts.quiet) noticeLook(s);
  var st = exports.recompute();
  var t = lastDay || today();
  var sc = scene(s, st);
  var reaction = activeReaction(st);
  var title = Mood.title(st.state);
  var render = function (id, kind) {
    return Svg.render(lookOf(id, sc, kind), {
      room: true, night: darkRoom(id, s), shelf: shelfOf(sc.items), blinkSeconds: 3 + Math.round(Math.random() * 40) / 10,
      label: s.name + ': ' + Mood.title(id).toLowerCase()
    });
  };
  var look = lookOf(st.state, sc, null);
  var items = sc.items.map(function (item) {
    var rarity = Links.rarity(item.rarity);
    return copy({}, item, {
      title: Look.itemTitle(item), slotTitle: Look.SLOT_TITLES[item.slot] || item.slot,
      rarityTitle: rarity && item.slot === 'shelf' ? Links.RARITY_TITLES[rarity] : null
    });
  });
  return {
    now: Date.now(), name: s.name, state: st.state, title: title, reason: st.reason, energy: st.energy, known: st.known,
    since: st.since, phrase: st.phrase, line: st.line, paused: st.paused || null,
    svg: render(st.state, null),
    svgReaction: reaction ? render(st.state, reaction.kind) : null,
    svgPeek: st.state === 'asleep' ? render('woken', null) : null,
    reaction: reaction,
    why: Mood.why(t, st.factors || Mood.factors(t, s), s),
    strip: strip(s),
    growth: {
      stage: sc.stage, stageTitle: Look.STAGE_TITLES[sc.stage], level: sc.level, rpg: sc.rpg,
      traits: sc.traits.map(function (id) { return { id: id, title: Look.TRAIT_TITLES[id] || id }; }),
      worn: look.items.map(function (item) { return { id: item.id, slot: item.slot, title: Look.itemTitle(item) }; }),
      season: sc.season.map(function (item) { return { id: item.id, title: Look.itemTitle(item) }; })
    },
    items: items,
    holding: sc.holding, party: sc.party ? st.party : null,
    quick: quick(t),
    focus: st.focus || null, lateSource: st.lateSource || null, playMin: st.playMin || 0,
    health: Boolean(health()), achievements: axiko.files.exists(ACHIEVEMENTS), holidays: axiko.files.exists(HOLIDAYS),
    hooked: hooked(), features: features(),
    settings: s, states: Mood.STATES, reactions: REACTIONS
  };
};

/** Long press: the next phrase about how he feels (and his voice, when it is on). */
exports.talk = function () {
  var s = settings();
  var st = locked(function () {
    var now = loadState();
    now.phraseTurn = (Number(now.phraseTurn) || 0) + 1;
    now.phrase = statePhrase(phraseKind(now.state || 'calm', now.focus), now.date || ymd(Date.now()), now, s);
    save('state.json', now);
    return now;
  });
  // During a Focus session he answers only in words on the screen, not aloud.
  var spoken = s.voiceOn && !st.focus ? say(st.phrase) : false;
  return { phrase: st.phrase, spoken: spoken };
};

/** Says a phrase aloud with the phone's voice (the screen's button; the agent uses its own voice). */
exports.say = function (text) {
  return say(text || exports.phrase());
};

/** A shortcut of the room on the phone's home screen. */
exports.pin = function () {
  return native('shortcut.pin', settings().name, SCREEN);
};

/** The tool pet_state: the state in words for the agent («как там Листик?»). */
exports.tool = function () {
  var s = settings();
  var st = exports.state();
  var sc = scene(s, st);
  var look = lookOf(st.state, sc, null);
  var lines = [];
  lines.push(s.name + ' сейчас: ' + Mood.title(st.state).toLowerCase() + (st.reason ? ' (' + st.reason + ')' : '') + '.');
  lines.push('Энергия: ' + (typeof st.energy === 'number' ? st.energy + ' из 100' : 'не известна') + '.');
  if (st.phrase) lines.push('Его фраза: «' + st.phrase + '»');
  lines.push('Стадия роста: ' + Look.STAGE_TITLES[sc.stage].toLowerCase() + (sc.level ? ', уровень ' + sc.level : '') + '.');
  if (look.items.length) lines.push('На нём: ' + look.items.map(function (x) { return Look.itemTitle(x).toLowerCase(); }).join(', ') + '.');
  if (sc.holding) lines.push('Держит значок «' + sc.holding.title + '».');
  if (st.focus) lines.push('Сейчас идёт сессия Фокуса: он сидит тихо и не мешает.');
  if (!health()) lines.push('Модуля «Здоровье» нет — настроение всегда спокойное.');
  lines.push('Говорить о нём от его лица, тепло, без упрёков владельцу.');
  return lines.join('\n');
};

/** What is installed and switched on: for the settings tab and for honest empty states. */
exports.status = function () {
  var st = loadState();
  var known = {};
  try { known = native('job.list') || {}; } catch (error) { known = {}; }
  return {
    features: features(), health: Boolean(health()), rpg: axiko.files.exists(RPG), achievements: axiko.files.exists(ACHIEVEMENTS),
    holidays: axiko.files.exists(HOLIDAYS), phoneNight: axiko.files.exists(PHONE_NIGHT), focus: axiko.files.exists(FOCUS), games: axiko.files.exists(GAMES),
    focusNow: st.focus || null, lateSource: st.lateSource || null,
    hooked: hooked(), widgetImage: has('widget.image'), homeCards: has('home.cards'),
    picture: axiko.files.exists(WIDGET_PNG), updated: st.updated || null, jobs: Object.keys(known).filter(function (k) { return k.indexOf('pet:') === 0; }),
    tool: axiko.files.exists('tools/pet_state.js'), model: st.model || null
  };
};

// ---- start --------------------------------------------------------------------------------------------

/** Runs at the app's start (module.json "autostart"). */
exports.start = function () {
  ensureSettings();
  on('screen', onScreen, 'pet');
  arm();
  installTool();
  spawn(function () {
    try {
      registerHooks();
      try { fillRarities(); } catch (error) { console.warn('pet: редкость вещей: ' + message(error)); }
      exports.recompute();
    } catch (error) {
      console.error('pet: старт: ' + message(error));
    }
  });
  return true;
};

/** Stops the module's background work (before removing it). */
exports.stop = function () {
  unjob('pet:tick');
  unjob('pet:voice');
  unjob('pet:focus');
  try {
    if (has('off')) off('screen', 'pet');
    else on('screen', function () {}, 'pet');
  } catch (error) { /* nothing */ }
  var h = health();
  try { if (h && typeof h.unhook === 'function') h.unhook(MAIN); } catch (error) { /* nothing */ }
  return true;
};
