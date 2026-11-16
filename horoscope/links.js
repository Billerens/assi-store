// What «Гороскоп по данным» reads from its neighbours: the holiday of Праздники, the creature of
// Питомец, today's wallpaper of Обои дня. Each function gets the neighbour's main.js (null when it is
// not installed) and never throws: without the neighbour the forecast is the same as before.
// Engine code (Rhino), but pure: the modules come in as arguments.
var dates = require('./dates.js');

function warn(what, error) {
  try { console.warn('horoscope: ' + what + ': ' + error); } catch (ignored) { /* no console */ }
}

function dayOf(value) {
  var text = String(value || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

/**
 * The holiday for the forecast of `date`: { today: { id, title } | null, soon: { id, title, inDays } | null }
 * or null. Solemn days and weather occasions are left out; birthdays of contacts only when allowed.
 *   options: { on, days (look ahead), people (birthdays of contacts) }
 */
exports.holiday = function (module, date, options) {
  options = options || {};
  if (!options.on || !module) return null;
  var ahead = Math.max(0, Math.round(Number(options.days) || 0));
  var list = [];
  if (typeof module.upcoming === 'function') {
    try { list = module.upcoming(Math.max(1, ahead)) || []; } catch (error) { warn('holidays.upcoming', error); list = []; }
  }
  var solemn = {};
  list.forEach(function (item) { if (item && item.solemn) solemn[item.id] = true; });
  var fit = function (item) {
    return Boolean(item && item.title && !item.solemn && item.kind !== 'weather' && (options.people || item.kind !== 'birthday'));
  };
  var inDaysOf = function (item) {
    var anchor = dayOf(item.anchor);
    return anchor ? dates.diff(anchor, date) : Number(item.inDays);
  };
  var today = null;
  if (typeof module.occasionToday === 'function') {
    try {
      var occasion = module.occasionToday(date);
      if (occasion && occasion.title && !solemn[occasion.id]) today = { id: String(occasion.id), title: String(occasion.title) };
    } catch (error) {
      warn('holidays.occasionToday', error);
    }
  }
  if (!today) {
    var on = list.filter(function (item) { return fit(item) && inDaysOf(item) === 0; })[0];
    if (on) today = { id: String(on.id), title: String(on.title) };
  }
  var soon = list.filter(function (item) { var n = inDaysOf(item); return fit(item) && n >= 1 && n <= ahead; })
    .sort(function (a, b) { return inDaysOf(a) - inDaysOf(b); })[0];
  if (!today && !soon) return null;
  return { today: today, soon: soon ? { id: String(soon.id), title: String(soon.title), inDays: inDaysOf(soon) } : null };
};

/**
 * Who reads the forecast: the creature of Питомец by name and mood, with its phrase when it is short
 * and clean. { name, mood, phrase, line } or null.
 *   options: { on, phraseMax, clean (text → bool) }
 */
exports.pet = function (module, options) {
  options = options || {};
  if (!options.on || !module || typeof module.state !== 'function') return null;
  var st;
  try { st = module.state() || {}; } catch (error) { warn('pet.state', error); return null; }
  var name = String(st.name || '').trim();
  if (!name) return null;
  var mood = String(st.title || '').trim().toLowerCase();
  var phrase = String(st.phrase || '').trim();
  if (phrase && (phrase.length > (Number(options.phraseMax) || 0) || (options.clean && !options.clean(phrase)))) phrase = '';
  var who = 'Прогноз читает ' + name + (mood ? ' (сейчас — ' + mood + ')' : '');
  var line = phrase ? who + ' и добавляет от себя: «' + phrase.replace(/[.!?…]+$/, '') + '».' : who + '.';
  return { name: name, mood: mood, phrase: phrase, line: line };
};

/** Today's wallpaper of Обои дня for a link on the screen: { title, thumbUrl, credit, open } or null. */
exports.wallpaper = function (module, options) {
  options = options || {};
  if (!options.on || !module || typeof module.today !== 'function') return null;
  try {
    var current = (module.today() || {}).current;
    if (!current || !current.thumbUrl) return null;
    return { title: String(current.title || 'Обои дня'), thumbUrl: current.thumbUrl, credit: current.credit || '', open: 'modules/wallpapers/ui/index.html' };
  } catch (error) {
    warn('wallpapers.today', error);
    return null;
  }
};
