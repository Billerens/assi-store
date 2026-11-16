// The hooks convention of the life modules (data/health/hooks.json). Pure part: the list itself.
//
// An entry: { event, path, fn, order? }. Events: 'life.mark' (water, habit, medicine, mood…),
// 'life.place' (a new place), 'life.day' (a day closed; the argument is its date). Entries are
// called in order: achievements, then rpg, then pet, then everyone else (an explicit `order`
// number puts an entry where it says).
var EVENTS = ['life.mark', 'life.place', 'life.day'];
exports.EVENTS = EVENTS;

var RANK = { achievements: 10, rpg: 20, pet: 30 };

function rankOf(entry) {
  if (typeof entry.order === 'number') return entry.order;
  var m = /^modules\/([^/]+)\//.exec(String(entry.path || ''));
  return m && RANK[m[1]] !== undefined ? RANK[m[1]] : 50;
}
exports.rankOf = rankOf;

function same(a, b) {
  return a.event === b.event && a.path === b.path && a.fn === b.fn;
}

/** The list with the entry in it (once). */
exports.add = function (list, entry) {
  if (!entry || !entry.event || !entry.path || !entry.fn) throw new Error('Крючок: нужны event, path и fn');
  var clean = { event: String(entry.event), path: String(entry.path).replace(/^\/+/, ''), fn: String(entry.fn) };
  if (typeof entry.order === 'number') clean.order = entry.order;
  var out = (list || []).filter(function (item) { return !same(item, clean); });
  out.push(clean);
  return out;
};

/** The list without the entries of that path (only of that event and function, when given). */
exports.remove = function (list, path, event, fn) {
  return (list || []).filter(function (item) {
    if (item.path !== path) return true;
    if (event && item.event !== event) return true;
    if (fn && item.fn !== fn) return true;
    return false;
  });
};

/** The entries of an event in the order they are called. */
exports.ordered = function (list, event) {
  return (list || []).map(function (item, i) { return { item: item, i: i }; })
    .filter(function (x) { return x.item.event === event; })
    .sort(function (a, b) { return rankOf(a.item) - rankOf(b.item) || a.i - b.i; })
    .map(function (x) { return x.item; });
};
