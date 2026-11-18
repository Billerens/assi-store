// The pet's links to the neighbours besides «Здоровье»: «Тайная жизнь телефона» (the owner's
// minutes in the phone last night), «Фокус» (a session is on), «Игротека» (today's play sessions)
// and «Ачивки» (badges on the shelf, the rarity of a thing). Pure: main.js finds the neighbours and
// hands in what they answered; every link is optional — nothing found, nothing changes.

var RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
exports.RARITIES = RARITIES;
exports.RARITY_TITLES = { common: 'обычная', uncommon: 'необычная', rare: 'редкая', epic: 'эпическая', legendary: 'легендарная' };

function pad(n) {
  return (n < 10 ? '0' : '') + n;
}

function parseDay(date) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date || ''));
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0) : null;
}

function copy(target, source) {
  Object.keys(source || {}).forEach(function (key) { target[key] = source[key]; });
  return target;
}

// ---- «Тайная жизнь телефона»: the owner's minutes last night ------------------------------------------

/**
 * The night before a day, the way phone-night keys it (by its evening): '2026-11-14' → '2026-11-13'.
 * null for a date it cannot read.
 */
exports.nightBefore = function (date) {
  var d = parseDay(date);
  if (!d) return null;
  d.setDate(d.getDate() - 1);
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
};

/**
 * What phone-night says about one night, in any of its shapes: a number, { ownerMinutes },
 * { minutes }, or a row of nights() / a phone_night record's data { night, ownerMinutes }.
 * Returns the minutes (a number) or null.
 */
exports.minutesOf = function (answer, night) {
  if (typeof answer === 'number') return isNaN(answer) ? null : Math.max(0, answer);
  if (!answer || typeof answer !== 'object') return null;
  if (night && answer.night && String(answer.night) !== night) return null;
  var value = typeof answer.ownerMinutes === 'number' ? answer.ownerMinutes : answer.minutes;
  return typeof value === 'number' && !isNaN(value) ? Math.max(0, value) : null;
};

/** The minutes of a night from a list (nights() rows, or the data of phone_night records). */
exports.minutesFromRows = function (rows, night) {
  var list = Array.isArray(rows) ? rows : [];
  for (var i = 0; i < list.length; i++) {
    var row = list[i];
    if (!row || String(row.night) !== night) continue;
    var minutes = exports.minutesOf(row, night);
    if (minutes !== null) return minutes;
  }
  return null;
};

/**
 * The day with the night screen taken from phone-night: prevLateMin = its ownerMinutes and
 * lateSource = 'phone-night'. Without phone-night's minutes (s.phoneNightOn off, the module is not
 * there, the night is not counted yet) the day stays as «Здоровье» gave it. Returns a new object.
 */
exports.withLate = function (t, s, minutes) {
  var out = copy({}, t);
  if (s.phoneNightOn && typeof minutes === 'number' && !isNaN(minutes)) {
    out.prevLateMin = Math.round(minutes);
    out.prevKnownScreen = true;
    out.lateSource = 'phone-night';
  } else if (typeof out.prevLateMin === 'number') {
    out.lateSource = 'health';
  }
  return out;
};

// ---- «Фокус»: a session is on ---------------------------------------------------------------------

/**
 * A work session of Focus going on, or null. left — focus.left() ({ running, kind, left (ms) });
 * state — data/focus/state.json ({ id, kind, endAt, pausedAt }) when there is no left(). A break
 * between sessions is not a session; a session past its end (the app was unloaded) is over.
 * Returns { left: ms or null, paused: bool }.
 */
exports.focusOf = function (left, state, now) {
  if (left && typeof left === 'object') {
    if (!left.running || left.kind === 'break') return null;
    var ms = typeof left.left === 'number' ? left.left : null;
    if (ms !== null && ms <= 0) return null;
    return { left: ms, paused: false };
  }
  if (!state || typeof state !== 'object' || !state.id || state.kind === 'break') return null;
  if (state.pausedAt) return { left: typeof state.endAt === 'number' ? Math.max(0, state.endAt - state.pausedAt) : null, paused: true };
  if (typeof state.endAt !== 'number') return { left: null, paused: false };
  if (state.endAt <= now) return null;
  return { left: state.endAt - now, paused: false };
};

// ---- «Игротека»: today's play sessions ---------------------------------------------------------------

/** When the owner's day began: the date at dayEnd ('05:00'), in ms. */
exports.dayStart = function (date, dayEnd) {
  var d = parseDay(date);
  if (!d) return null;
  var m = /^(\d{1,2}):(\d{2})$/.exec(String(dayEnd || '05:00'));
  d.setHours(m ? Number(m[1]) : 5, m ? Number(m[2]) : 0, 0, 0);
  return d.getTime();
};

/** Minutes of play in the base records of kind 'play' (amount in minutes), from `since` on. */
exports.playMinutes = function (records, since) {
  var sum = 0;
  (Array.isArray(records) ? records : []).forEach(function (row) {
    if (!row || (row.kind && row.kind !== 'play')) return;
    if (typeof since === 'number' && typeof row.at === 'number' && row.at < since) return;
    if (row.unit && row.unit !== 'min') return;
    var n = Number(row.amount);
    if (!isNaN(n) && n > 0) sum += n;
  });
  return Math.round(sum);
};

// ---- «Ачивки»: rarities and the shelf -----------------------------------------------------------------

/** A known rarity, or null. */
exports.rarity = function (value) {
  var r = String(value || '').toLowerCase();
  return RARITIES.indexOf(r) >= 0 ? r : null;
};

/** The rarity of an achievement's definition at a tier ('rarity' is a word or a list by tiers). */
exports.rarityOfDef = function (def, tier) {
  if (!def) return null;
  var r = def.rarity;
  if (Array.isArray(r)) r = r.length ? r[Math.max(0, Math.min(Number(tier) || 0, r.length - 1))] : null;
  return exports.rarity(r);
};

/**
 * The rarity of a thing an achievement gave, looked up in the achievements' definitions
 * (achievements.list()): the tier its item comes at. null when it cannot be found.
 */
exports.rarityOfItem = function (list, from) {
  if (!from || !Array.isArray(list)) return null;
  var def = list.filter(function (one) { return one && String(one.id) === String(from); })[0];
  if (!def) return null;
  return exports.rarityOfDef(def, def.item && def.item.tier ? def.item.tier : 0);
};

/** Does a rarity reach the shelf? from — the setting shelfFrom: a rarity or 'off'. */
exports.reachesShelf = function (rarity, from) {
  var r = RARITIES.indexOf(exports.rarity(rarity) || 'common');
  var f = RARITIES.indexOf(String(from || ''));
  return f >= 0 && r >= f;
};

/**
 * The thing for the shelf from a badge he held (celebrate('achievement')), or null: below the
 * setting, without an id, or the achievement has already put its own thing there (the cup of «Год
 * с Axiko») or a badge of the same rarity. items — the things he has.
 */
exports.badgeItem = function (held, s, items) {
  if (!held || !held.id) return null;
  var rarity = exports.rarity(held.rarity) || 'common';
  if (!exports.reachesShelf(rarity, s.shelfFrom)) return null;
  var from = String(held.id);
  var there = (items || []).some(function (item) {
    return item && item.slot === 'shelf' && item.from === from && (!item.badge || item.rarity === rarity);
  });
  if (there) return null;
  var out = { id: 'badge-' + from + '-' + rarity, from: from, slot: 'shelf', rarity: rarity, badge: true };
  if (held.title) out.title = String(held.title);
  return out;
};

/**
 * What stands on the shelf, at most `max`: the rarest first, then the newest. A thing without a
 * rarity counts as common.
 */
exports.shelf = function (items, max) {
  var list = (items || []).filter(function (item) { return item && item.slot === 'shelf'; });
  list.sort(function (a, b) {
    var ra = RARITIES.indexOf(exports.rarity(a.rarity) || 'common');
    var rb = RARITIES.indexOf(exports.rarity(b.rarity) || 'common');
    if (ra !== rb) return rb - ra;
    return (Number(b.got) || 0) - (Number(a.got) || 0);
  });
  return typeof max === 'number' ? list.slice(0, max) : list;
};
