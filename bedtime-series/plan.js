// What the night series does when: whether to write the next episode now, which episode to play
// and from where, what the evening reminder says. Pure logic (engine and node).
//
//   season = {id, written, listened, episodes, preparedOn, finishedAt}
//   state  = {season, episode, node, choices, defaults, asleepAt, asleepTime, done, savedAt}
var settingsLib = require('modules/voice-adventure/story-engine/settings.js');
var graph = require('./graph.js');

var DAY = 86400000;

function pad(n) {
  return (n < 10 ? '0' : '') + n;
}

function dayOf(time) {
  var d = new Date(time);
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

function minutesNow(time) {
  var d = new Date(time);
  return d.getHours() * 60 + d.getMinutes();
}

function midnight(time) {
  var d = new Date(time);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Is the moment inside [from, to) of its day (times «ЧЧ:ММ»; a window across midnight works too)? */
function inWindow(time, from, to) {
  var a = settingsLib.minutesOf(from);
  var b = settingsLib.minutesOf(to);
  if (a === null || b === null || a === b) return false;
  var now = minutesNow(time);
  return a < b ? now >= a && now < b : now >= a || now < b;
}

/** The moment of «ЧЧ:ММ» on the day of time (ms). */
function atToday(time, hhmm) {
  var m = settingsLib.minutesOf(hhmm);
  if (m === null) return null;
  var d = new Date(time);
  d.setHours(Math.floor(m / 60), m % 60, 0, 0);
  return d.getTime();
}

/** The next try after a failure: now + everyMin, if that is still before remindAt; otherwise null. */
function retryAt(time, everyMin, prepareAt, remindAt) {
  if (!inWindow(time, prepareAt, remindAt)) return null;
  var at = time + everyMin * 60000;
  return inWindow(at, prepareAt, remindAt) && at - time < DAY ? at : null;
}

/** «s20261114-2005»: a season's folder. */
function seasonId(time) {
  var d = new Date(time);
  return 's' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' + pad(d.getHours()) + pad(d.getMinutes());
}

function validId(id) {
  return /^[a-z0-9][a-z0-9-]{0,40}$/i.test(String(id || ''));
}

function ofSeason(state, season) {
  return !!state && !!season && state.season === season.id && Number(state.episode) > 0;
}

/**
 * Should the next episode be written now? One a day (force — the button «Написать сейчас» skips
 * that), and only when the last written one is already started: a new one is written with the
 * day's details, not ahead. Returns {need, number, why}.
 */
function writeNeed(season, state, today, force) {
  if (!season) return { need: false, why: 'нет сезона' };
  var written = Number(season.written) || 0;
  var total = Number(season.episodes) || 12;
  if (season.finishedAt) return { need: false, why: 'сезон досмотрен' };
  if (written >= total) return { need: false, why: 'сезон дописан' };
  if (!force && season.preparedOn === today) return { need: false, why: 'серия на сегодня уже написана' };
  var started = ofSeason(state, season) && Number(state.episode) >= written;
  if (written > 0 && !started && (Number(season.listened) || 0) < written) {
    return { need: false, why: 'серия ' + written + ' ещё не начата' };
  }
  return { need: true, number: written + 1 };
}

/**
 * What to play: {mode, episode, node, why}. mode: 'new' (from the start), 'resume' (from the scene
 * where it stopped), 'continue' (from the scene before the fork where he fell asleep), 'ask'
 * («продолжим или новую?»). wanted: 'continue' | 'new' | undefined. No mode — nothing to play (why).
 */
function toPlay(season, state, time, continueDays, wanted) {
  if (!season) return { why: 'Сначала начните сезон' };
  var written = Number(season.written) || 0;
  var listened = Number(season.listened) || 0;
  if (ofSeason(state, season) && !state.done && Number(state.episode) <= written) {
    var ep = Number(state.episode);
    var hasNext = written > ep;
    if (state.asleepAt) {
      var fresh = time - (Number(state.asleepTime || state.savedAt) || 0) <= continueDays * DAY;
      var from = graph.FORKS[state.asleepAt] ? graph.FORKS[state.asleepAt].after : 's1';
      if (wanted === 'continue') return { mode: 'continue', episode: ep, node: from };
      if (wanted === 'new' || !fresh) {
        if (hasNext) return { mode: 'new', episode: ep + 1, node: 's1', skipped: ep };
        if (wanted === 'new') return { mode: 'continue', episode: ep, node: from, note: 'Новой серии пока нет.' };
      }
      return hasNext ? { mode: 'ask', episode: ep, node: from } : { mode: 'continue', episode: ep, node: from };
    }
    return { mode: 'resume', episode: ep, node: state.node || 's1' };
  }
  var next = listened + 1;
  if (ofSeason(state, season) && state.done) next = Math.max(next, Number(state.episode) + 1);
  if (next > (Number(season.episodes) || 12)) return { why: 'Сезон досмотрен — начните новый', finished: true };
  if (next <= written) return { mode: 'new', episode: next, node: 's1' };
  return { why: 'Серия ' + next + ' ещё не готова', waiting: next };
}

/**
 * The evening reminder: {send, title, text}. info: {play (toPlay), title (of that episode),
 * moment («когда …» where he fell asleep), error (why today's episode was not written)}.
 */
function reminder(info) {
  var play = info.play || {};
  if (play.finished) return { send: false, why: 'сезон досмотрен' };
  if (play.mode === 'new') {
    return { send: true, ready: true, title: 'Сериал на ночь', text: 'Серия ' + play.episode + ' готова' + (info.title ? ': «' + info.title + '»' : '') };
  }
  if (play.mode === 'ask' || play.mode === 'continue') {
    return { send: true, ready: true, title: 'Сериал на ночь', text: 'Серия ' + play.episode + ' ждёт: вчера вы уснули' + (info.moment ? ', ' + info.moment : '') };
  }
  if (play.mode === 'resume') {
    return { send: true, ready: true, title: 'Сериал на ночь', text: 'Серия ' + play.episode + ' ждёт продолжения' };
  }
  return { send: true, ready: false, title: 'Сериал на ночь', text: 'Сегодня без новой серии' + (info.error ? ': ' + info.error : '') };
}

/** Minutes between two moments, at least 0. */
function minutesBetween(from, to) {
  return Math.max(0, Math.round((to - from) / 60000));
}

/** «Вчера» / «Сегодня» / «В прошлый раз» — for «… вы уснули, когда …». */
function dayWord(then, now) {
  var days = Math.round((midnight(now) - midnight(then)) / DAY);
  if (days <= 0) return 'Сегодня';
  if (days === 1) return 'Вчера';
  return 'В прошлый раз';
}

/**
 * The state of an episode wound back to the scene before the fork where he fell asleep: the
 * choices from that fork on are forgotten, the counters start again. Returns a new state.
 */
function rewind(state, fork) {
  var out = JSON.parse(JSON.stringify(state || {}));
  var forks = Object.keys(graph.FORKS);
  var from = forks.indexOf(fork);
  if (from < 0) from = 0;
  ['choices', 'defaults', 'asked', 'unclear'].forEach(function (key) {
    out[key] = out[key] && typeof out[key] === 'object' ? out[key] : {};
    forks.slice(from).forEach(function (f) { delete out[key][f]; });
  });
  out.node = graph.FORKS[forks[from]].after;
  out.asleepAt = null;
  out.asleepTime = null;
  out.firstMissed = null;
  out.firstMissedAt = null;
  out.missed = 0;
  out.slow = false;
  out.done = false;
  return out;
}

exports.DAY = DAY;
exports.dayOf = dayOf;
exports.midnight = midnight;
exports.inWindow = inWindow;
exports.atToday = atToday;
exports.retryAt = retryAt;
exports.seasonId = seasonId;
exports.validId = validId;
exports.writeNeed = writeNeed;
exports.toPlay = toPlay;
exports.reminder = reminder;
exports.minutesBetween = minutesBetween;
exports.dayWord = dayWord;
exports.rewind = rewind;
