// Settings of the inbox: what they are, their defaults and limits. Pure: no Android here.
// The saved file (data/inbox/settings.json) may lack keys or hold odd values — normalize()
// always gives a complete, sane set.

var NUMBERS = {
  digestThreshold: { value: 15, min: 2, max: 500 },      // new messages in a group before a digest
  digestHours: { value: 2, min: 0.25, max: 72 },         // or this long unopened
  digestRecount: { value: 5, min: 1, max: 200 },         // a digest is redone only after this many more
  digestMessages: { value: 40, min: 5, max: 120 },       // how many messages go into a digest request
  keepDays: { value: 30, min: 1, max: 365 },             // messages are kept this long
  otpKeepMin: { value: 15, min: 1, max: 1440 },          // confirmation codes are kept this long
  draftKeepDays: { value: 7, min: 1, max: 90 },          // drafts are kept this long
  draftCount: { value: 3, min: 1, max: 5 },              // variants of a draft
  draftContext: { value: 20, min: 3, max: 60 },         // messages of the chat given to the draft model
  memoryHits: { value: 3, min: 0, max: 10 },            // facts from long memory given to the draft model
  repeatEveryMin: { value: 10, min: 1, max: 720 },       // own notification about one chat at most this often
  batchDelaySec: { value: 20, min: 2, max: 3600 },       // wait to gather a batch for the model
  batchSize: { value: 20, min: 1, max: 60 },             // messages in one triage request
  lineChars: { value: 300, min: 40, max: 2000 },         // one message is cut to this many characters for the model
  localBatchSize: { value: 10, min: 1, max: 60 },        // the same for a model on the phone: its window is small
  localLineChars: { value: 200, min: 40, max: 2000 },
  retryMin: { value: 30, min: 5, max: 1440 },            // after a refusal (spending limit) try the model again in
  maxTries: { value: 2, min: 1, max: 10 },               // a message the model skipped is asked again this many times
  editWindowSec: { value: 120, min: 0, max: 3600 },      // a changed text this soon after the first one is an edit
  editSimilarity: { value: 0.5, min: 0, max: 1 },        // and it must be at least this similar to the first one
  repeatWindowHours: { value: 6, min: 0.1, max: 72 },    // the same text within this time is a repeat, not a message
  groupPrefixes: { value: 2, min: 2, max: 10 },          // distinct "Name: " prefixes that show a chat is a group
  widgetLines: { value: 2, min: 0, max: 6 },             // conversations listed in the widget
  pageSize: { value: 120, min: 20, max: 1000 },          // messages shown in one conversation
  counterEveryMin: { value: 15, min: 1, max: 1440 },     // how often today's counter in the shared base is updated
  zeroMinMessages: { value: 20, min: 1, max: 1000 },     // «Ноль входящих»: at least this many messages in «Важно» and «Подождёт» that day
  answerMinChats: { value: 3, min: 1, max: 50 }          // «Ответил всем важным»: at least this many conversations with important messages
};

var SWITCHES = {
  autoDrafts: false,        // prepare drafts for "important" by itself
  repeatImportant: false,   // repeat an important message with an own notification while "do not disturb" is on
  heuristics: false         // without the model, guess by simple rules (off: everything new waits in "later", not sorted)
};

var MODES = ['auto', 'cloud', 'local', 'off'];

var LISTS = {
  apps: null,                // packages to collect; null — the known messengers installed on the phone
  names: [],                 // how the owner is called in chats: names, nicknames
  alwaysImportant: [],       // people whose messages are always important
  alwaysNoise: [],           // chats that are always noise
  quickReplies: ['Хорошо', 'Перезвоню позже', 'Да', 'Нет', 'Спасибо!']
};

exports.NUMBERS = NUMBERS;
exports.SWITCHES = SWITCHES;
exports.MODES = MODES;

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
  Object.keys(SWITCHES).forEach(function (key) {
    out[key] = saved[key] === undefined || saved[key] === null ? SWITCHES[key] : Boolean(saved[key]);
  });
  out.triageMode = MODES.indexOf(saved.triageMode) >= 0 ? saved.triageMode : 'auto';
  out.tone = typeof saved.tone === 'string' ? saved.tone.trim().slice(0, 300) : '';
  out.cleanAt = /^\d{1,2}:\d{2}$/.test(String(saved.cleanAt || '')) ? String(saved.cleanAt) : '04:00';
  // «Ответил всем важным до 10:00»: answers count until this time.
  out.answerBy = /^([01]?\d|2[0-3]):[0-5]\d$/.test(String(saved.answerBy || '')) ? String(saved.answerBy) : '10:00';
  out.apps = saved.apps === null || saved.apps === undefined ? null : list(saved.apps);
  out.names = list(saved.names);
  out.alwaysImportant = list(saved.alwaysImportant);
  out.alwaysNoise = list(saved.alwaysNoise);
  out.quickReplies = saved.quickReplies === undefined || saved.quickReplies === null ? LISTS.quickReplies.slice() : list(saved.quickReplies);
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
