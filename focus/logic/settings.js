// Settings of Focus: what they are, their defaults and limits. Pure: no Android here.
// The saved file (data/focus/settings.json) may lack keys or hold odd values — normalize()
// always gives a complete, sane set.

var NUMBERS = {
  allowSecondSec: { value: 10, min: 0, max: 600 },        // a second attempt to open a distracting app this soon is let through
  breakthroughEveryMin: { value: 15, min: 1, max: 240 },  // an important message from one person is repeated at most this often
  workMin: { value: 25, min: 1, max: 480 },               // cycles: work
  breakMin: { value: 5, min: 1, max: 120 },               // cycles: a short break
  longBreakMin: { value: 15, min: 1, max: 240 },          // cycles: the long break after the last work
  cyclesCount: { value: 4, min: 1, max: 12 },             // cycles: works in a series
  earlyThreshold: { value: 0.5, min: 0, max: 1 },         // ending before this share of the session asks first
  minRecordMin: { value: 5, min: 0, max: 120 },           // shorter sessions are not written to the shared base
  digestMinChats: { value: 5, min: 0, max: 100 },         // more chats than this in "the rest" — one request to focus.digest
  digestLines: { value: 3, min: 1, max: 10 },             // lines of the model's digest
  summaryKeepDays: { value: 30, min: 1, max: 3650 },      // texts of summaries are kept this long
  extendMin: { value: 10, min: 1, max: 120 },             // "+10 минут"
  minMinutes: { value: 1, min: 1, max: 60 },              // the shortest session
  maxMinutes: { value: 480, min: 5, max: 1440 },          // the longest session
  noticesLimit: { value: 300, min: 20, max: 1000 },       // without the inbox: how many recent notifications are looked through
  restoreGraceSec: { value: 120, min: 0, max: 3600 },     // woken this soon after the end — it was the timer, not a restore
  dndWaitMs: { value: 2000, min: 200, max: 10000 },       // how long to wait for "do not disturb" to switch
  countEverySec: { value: 20, min: 5, max: 600 },         // the screen asks how many messages came this often
  widgetEveryMin: { value: 1, min: 1, max: 30 },          // the widget is redrawn this often during a session
  historyDays: { value: 14, min: 7, max: 90 },            // days of bars in "История"
  historyList: { value: 30, min: 5, max: 200 },           // sessions listed in "История"
  taskSuggestions: { value: 6, min: 0, max: 20 },         // past tasks offered under the field
  summaryLines: { value: 12, min: 3, max: 50 },           // chats listed in "the rest"
  lineChars: { value: 160, min: 40, max: 600 },           // a line about a chat is cut to this for the model
  quietDays: { value: 7, min: 3, max: 60 },               // «Неделя без единой попытки отвлечься»: this many days…
  quietMinDays: { value: 5, min: 1, max: 60 }             // … with sessions under the lock on at least this many of them
};

var SWITCHES = {
  dnd: true,               // "Не беспокоить" for the session
  block: false,            // do not let into the distracting apps
  breakthrough: false,     // repeat an important message from the listed people through the silence
  cycles: false,           // work / break cycles
  autoNext: false,         // the next work of a cycle starts by itself after a break
  modelDigest: true,       // the digest of "the rest" by the model (only with the inbox)
  showCount: true,         // show how many messages came during the session
  shizuku: true            // try Shizuku when the other ways to switch "do not disturb" failed
};

var CHOICES = {
  dndMode: { value: 'priority', list: ['priority', 'alarms', 'none'] },   // what lets through the silence
  strictness: { value: 'soft', list: ['soft', 'home'] },                   // remind only, or back to the home screen
  callAction: { value: 'nothing', list: ['nothing', 'pause', 'end'] }      // a call during a session
};

var LISTS = {
  durations: [25, 50, 90],       // the chips on the screen, minutes
  distractApps: [],              // packages
  people: [],                    // who may break through
  // Windows that come and go over an app (the keyboard, the shade): they do not end a permission.
  passing: ['com.android.systemui', 'com.samsung.android.honeyboard', 'com.google.android.inputmethod.latin',
    'com.samsung.android.app.cocktailbarservice', 'android'],
  vibrate: [0, 350, 200, 350]    // the pattern at the end: pause, buzz, pause, buzz… ms
};

exports.NUMBERS = NUMBERS;
exports.SWITCHES = SWITCHES;
exports.CHOICES = CHOICES;
exports.LISTS = LISTS;

function list(value) {
  if (value === null || value === undefined) return [];
  var items = Array.isArray(value) ? value : String(value).split(/[,\n]/);
  var out = [];
  var seen = {};
  for (var i = 0; i < items.length; i++) {
    var item = String(items[i] === null || items[i] === undefined ? '' : items[i]).trim();
    if (!item || seen[item.toLowerCase()]) continue;
    seen[item.toLowerCase()] = true;
    out.push(item);
  }
  return out;
}

exports.list = list;

/** Numbers from a list or a text "25, 50, 90"; `unique` drops repeats (a vibration pattern keeps them). */
function numbers(value, fallback, min, max, unique) {
  if (value === null || value === undefined) return fallback.slice();
  var items = Array.isArray(value) ? value : String(value).split(/[;,\s]+/);
  var out = [];
  for (var i = 0; i < items.length; i++) {
    if (items[i] === null || items[i] === undefined || String(items[i]).trim() === '') continue;
    var n = Number(String(items[i]).trim());
    if (isNaN(n) || n < min || n > max) continue;
    n = Math.round(n);
    if (unique && out.indexOf(n) >= 0) continue;
    out.push(n);
  }
  return out.length ? out : fallback.slice();
}

exports.numbers = numbers;

/** Every setting there is, with defaults; the saved values kept where they make sense. */
exports.normalize = function (saved) {
  saved = saved || {};
  var out = {};
  Object.keys(NUMBERS).forEach(function (key) {
    var spec = NUMBERS[key];
    var value = Number(saved[key]);
    if (saved[key] === undefined || saved[key] === null || saved[key] === '' || isNaN(value)) value = spec.value;
    out[key] = Math.min(spec.max, Math.max(spec.min, value));
  });
  if (out.maxMinutes < out.minMinutes) out.maxMinutes = out.minMinutes;
  Object.keys(SWITCHES).forEach(function (key) {
    out[key] = saved[key] === undefined || saved[key] === null ? SWITCHES[key] : Boolean(saved[key]);
  });
  Object.keys(CHOICES).forEach(function (key) {
    out[key] = CHOICES[key].list.indexOf(saved[key]) >= 0 ? saved[key] : CHOICES[key].value;
  });
  out.durations = numbers(saved.durations, LISTS.durations, out.minMinutes, out.maxMinutes, true).slice(0, 8);
  out.distractApps = list(saved.distractApps);
  out.people = list(saved.people);
  out.passing = saved.passing === undefined || saved.passing === null ? LISTS.passing.slice() : list(saved.passing);
  out.vibrate = numbers(saved.vibrate, LISTS.vibrate, 0, 5000, false).slice(0, 20);
  // When the texts of old summaries are cleared, daily.
  out.cleanAt = /^([01]?\d|2[0-3]):[0-5]\d$/.test(String(saved.cleanAt || '')) ? String(saved.cleanAt) : '04:30';
  return out;
};

/** The saved settings with a change applied; unknown keys are dropped. */
exports.apply = function (saved, patch) {
  var next = exports.normalize(saved);
  Object.keys(patch || {}).forEach(function (key) {
    if (key in next) next[key] = patch[key];
  });
  return exports.normalize(next);
};
