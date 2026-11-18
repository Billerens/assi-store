// The neighbours' part of tonight's details: what the installed modules tell about the owner's day,
// asked only for the sources he allowed. Every neighbour is optional: not installed, an old version
// without the function, or an error — and its part is simply empty. Engine side (Rhino); the words
// of the details are made by details.js.
//
//   links.gather({sources, since, day, now}) -> {events: [base records of kind 'event'], links: {holiday,
//     sign, pet, inbox, drawn}, notes: ['что не прочиталось']}
//   links.paint(subject) -> {word, strokes: ['M 0 0 L …']} | {error}   (the picture of an episode)
var axiko = require('lib/axiko');
var files = axiko.files;

// Who wrote base records of kind 'event' that the series takes (details.EVENTS).
var EVENT_SOURCES = ['hat', 'rpg', 'meetings', 'draw'];

function msg(error) {
  return String(error && error.message ? error.message : error);
}

function installed(id) {
  try {
    return files.exists('modules/' + id + '/main.js');
  } catch (error) {
    return false;
  }
}

/** The neighbour's main.js, or null when it is not installed or does not load. */
function neighbour(id) {
  if (!installed(id)) return null;
  try {
    return require('modules/' + id + '/main.js');
  } catch (error) {
    return null;
  }
}

function on(sources, id) {
  return (sources || []).indexOf(id) >= 0;
}

/** Праздники: the occasion of the day — {id, title} | null. */
function holiday(day) {
  var holidays = neighbour('holidays');
  if (!holidays || typeof holidays.occasionToday !== 'function') return null;
  var occ = holidays.occasionToday(day);
  return occ && (occ.title || occ.id) ? { id: occ.id ? String(occ.id) : '', title: occ.title ? String(occ.title) : '' } : null;
}

/** Гороскоп: the sign of this week — {title} | null. */
function sign() {
  var horoscope = neighbour('horoscope');
  if (!horoscope || typeof horoscope.sign !== 'function') return null;
  var got = horoscope.sign();
  return got && got.title ? { title: String(got.title) } : null;
}

/** Питомец: its name, its stage of growth and the things it wears (titles from its look.js). Never its mood. */
function pet() {
  var main = neighbour('pet');
  if (!main) return null;
  var settings = null;
  try { settings = typeof main.settings === 'function' ? main.settings() : null; } catch (error) { settings = null; }
  if (!settings || !settings.name) settings = files.readJson('data/pet/settings.json', {}) || {};
  if (!settings.name) return null;
  var out = { name: String(settings.name), stage: '', items: [] };
  try {
    var look = typeof main.look === 'function' ? main.look() : null;
    var titles = files.exists('modules/pet/look.js') ? require('modules/pet/look.js') : null;
    if (look && titles) {
      var stage = Number(look.stage);
      if (titles.STAGE_TITLES && titles.STAGE_TITLES[stage]) out.stage = String(titles.STAGE_TITLES[stage]);
      (look.items || []).forEach(function (item) {
        if (!item || item.slot === 'shelf') return;
        var title = typeof titles.itemTitle === 'function' ? titles.itemTitle(item) : (titles.ITEM_TITLES || {})[item.id];
        // An id is not a word for the story: only things with a Russian title.
        if (title && /[А-ЯЁа-яё]/.test(title) && out.items.indexOf(String(title)) < 0) out.items.push(String(title));
      });
    }
  } catch (error) {
    // The name is enough.
  }
  return out;
}

/** Входящие: who wrote since `since` — names only (chat titles of private chats, senders in groups), never texts. */
function inbox(since, now) {
  var main = neighbour('inbox');
  if (!main || typeof main.since !== 'function') return [];
  var got = main.since(since, now) || {};
  var names = [];
  (got.important || []).forEach(function (item) {
    var name = item.isGroup ? item.sender : item.chat;
    if (name) names.push(String(name));
  });
  (got.others || []).forEach(function (item) {
    if (!item.isGroup && item.title) names.push(String(item.title));
  });
  return names;
}

/** Рисуй — угадаю: the words of today's rounds (its data/draw-guess.db, read only; not opened when absent). */
function drawn(since) {
  if (!installed('draw-guess') || !files.exists('data/draw-guess.db')) return [];
  var rows = axiko.db('draw-guess').query('select word from rounds where at >= ? order by at limit 20', [since]) || [];
  return rows.map(function (row) { return row && row.word ? String(row.word) : ''; }).filter(Boolean);
}

/**
 * What the neighbours tell about the day, for the allowed sources only: {sources, since (midnight),
 * day ('YYYY-MM-DD'), now}. Returns {events, links, notes}.
 */
function gather(options) {
  options = options || {};
  var sources = options.sources || [];
  var since = Number(options.since) || 0;
  var now = Number(options.now) || Date.now();
  var notes = [];
  var links = {};
  var events = [];
  function attempt(name, fn) {
    try {
      return fn();
    } catch (error) {
      notes.push(name + ': ' + msg(error));
      return null;
    }
  }
  if (EVENT_SOURCES.some(function (id) { return on(sources, id); })) {
    events = attempt('общая база', function () { return require('lib/base').find({ kind: 'event', since: since, limit: 100 }); }) || [];
  }
  if (on(sources, 'holidays')) links.holiday = attempt('Праздники', function () { return holiday(options.day); });
  if (on(sources, 'horoscope')) links.sign = attempt('Гороскоп', sign);
  if (on(sources, 'pet')) links.pet = attempt('Питомец', pet);
  if (on(sources, 'inbox')) links.inbox = attempt('Входящие', function () { return inbox(since, now); }) || [];
  if (on(sources, 'draw')) links.drawn = attempt('Рисуй — угадаю', function () { return drawn(since); }) || [];
  return { events: events, links: links, notes: notes };
}

/** The picture of an episode by «Рисуй — угадаю» (its role draw.paint): {word, strokes: [path d]} | {error}. */
function paint(subject) {
  var main = neighbour('draw-guess');
  if (!main || typeof main.paint !== 'function') return { error: 'нет модуля «Рисуй — угадаю»' };
  var got = main.paint(String(subject || '').trim());
  if (!got || !got.ok || !Array.isArray(got.strokes) || !got.strokes.length) return { error: got && got.why ? String(got.why) : 'рисунок не получился' };
  var strokes = got.strokes.map(function (stroke) { return stroke && stroke.d ? String(stroke.d) : ''; })
    .filter(function (d) { return /^[MLQCZmlqcz0-9.,\s-]+$/.test(d); });
  return strokes.length ? { word: String(got.word || subject), strokes: strokes } : { error: 'в рисунке нет штрихов' };
}

exports.gather = gather;
exports.paint = paint;
exports.installed = installed;
exports.EVENT_SOURCES = EVENT_SOURCES;
