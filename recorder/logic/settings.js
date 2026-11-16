// The module's settings: what is there by default, and the owner's file brought to a safe shape
// (numbers in their bounds, choices among their values, the dictionary as a list). Every tunable
// number of the module lives here. Pure.

var SOURCES = { MIC: 1, VOICE_RECOGNITION: 6, UNPROCESSED: 9, CAMCORDER: 5, VOICE_COMMUNICATION: 7 };

var DEFAULTS = {
  partMinutes: 5,               // one part of a recording for transcription, minutes
  noteMaxMinutes: 3,            // «Авто»: up to this long — a thought, longer — a meeting
  defaultMode: 'auto',          // 'auto' | 'meeting' | 'note' | 'lecture'
  source: 'MIC',                // MIC | VOICE_RECOGNITION | UNPROCESSED | CAMCORDER | VOICE_COMMUNICATION
  sampleRate: 16000,            // Hz; AAC in m4a, mono
  channels: 1,
  bitrate: 32000,               // bit/s: about 14 MB an hour
  splitMode: 'next',            // 'next' — the next file without a gap (setNextOutputFile); 'restart' — stop and start (a gap of ~0.2 s)
  partOverheadPct: 3,           // the size limit of a part: bitrate × length plus this much for the container
  partLateFactor: 2,            // no next file after this many part lengths: the recording goes on by stop and start
  maxHours: 6,                  // a recording stops by itself after this long
  minFreeMb: 200,               // … or when the phone has less free space
  pauseOnCall: true,            // a phone call takes the microphone: pause and go on after it
  levelEveryMs: 200,            // how often the screen gets the sound level
  stateEveryS: 10,              // how often the recording's state is written down (for a crash)
  transcribeWhen: 'now',        // 'now' | 'charging'
  transcribeTries: 2,           // a part that fails this many times is left with an error
  cleanModel: 'any',            // punctuation by the model recorder.clean: 'any' | 'local' (only a model on the phone) | 'off'
  cleanMinRatio: 0.6,           // a cleaned text shorter than this share of the raw one is not taken (the model cut it)
  cleanMaxRatio: 1.5,           // … or longer than this share (the model added)
  paragraphGapMs: 2000,         // without a model: a pause this long between phrases starts a paragraph
  noteModel: 'cloud',           // the title, tags and command of a thought by recorder.note: 'cloud' | 'local' | 'off'
  summaryModel: 'cloud',        // the summary of a meeting by recorder.summary: 'cloud' | 'local' | 'off'
  oneAskWords: 15000,           // a transcript up to this many words goes to a cloud model in one request
  stepWords: 1200,              // … a longer one (or any one for a model on the phone) goes by pieces of this many words
  summaryLines: 6,              // at most this many lines in «Кратко»
  maxTasks: 20,
  commands: true,               // short thoughts that are commands («напиши Пете…») become drafts, expenses, reminders
  words: [],                    // names and terms the model has to write correctly
  chunkWords: 300,              // pieces of the transcript for search (and for vectors)
  embed: true,                  // vectors of meaning when the role embed has a model
  embedBatch: 16,
  meaningMin: 0.3,              // the least likeness for a search result by meaning
  searchLimit: 20,
  memory: true,                 // the summary goes to the long memory (lib/memory)
  base: true,                   // a record in the shared base (lib/base)
  notifyReady: true,            // «Конспект готов: …»
  keepAudioDays: 30,            // the sound is removed after this many days (0 — kept always), the text stays
  cleanAt: '04:30',
  importWholeMaxMin: 10,        // a file up to this long is transcribed whole, a longer one is cut into parts first
  uploadsDays: 14,              // audio in data/uploads/ newer than this is offered for import
  reminderAt: '09:00',          // «Напомнить» a task with a date: on that day at this time
  reminderLaterMin: 60,         // … without a date or with a past one: in this many minutes
  eventAt: '10:00',             // «В календарь»: an event on the task's day at this time
  eventMinutes: 30,
  markListenSec: 20,            // a caption of a mark said by voice: listen at most this long
  announce: false,              // say aloud at the start that the conversation is recorded
  announceText: 'Включаю запись разговора',
  player: 'auto',               // 'auto' — in the screen, the phone's player if the screen cannot; 'phone'
  keptTasksDays: 30,            // «Ни одной задачи не потерял»: tasks whose date fell in this many last days…
  keptTasksMin: 10              // … at least this many of them, every one done
};

var NUMBERS = {
  partMinutes: [1, 30], noteMaxMinutes: [0.5, 30], sampleRate: [8000, 48000], channels: [1, 2], bitrate: [12000, 192000],
  partOverheadPct: [0, 50], partLateFactor: [1.2, 10], maxHours: [0.5, 24], minFreeMb: [20, 10000], levelEveryMs: [50, 2000], stateEveryS: [2, 120],
  transcribeTries: [1, 10], cleanMinRatio: [0.1, 1], cleanMaxRatio: [1, 5], paragraphGapMs: [300, 30000], oneAskWords: [500, 200000], stepWords: [100, 20000],
  summaryLines: [3, 12], maxTasks: [1, 100], chunkWords: [50, 2000], embedBatch: [1, 128], meaningMin: [0, 1], searchLimit: [1, 200],
  keepAudioDays: [0, 3650], importWholeMaxMin: [1, 120], uploadsDays: [1, 365], reminderLaterMin: [5, 1440], eventMinutes: [5, 600],
  markListenSec: [5, 120], keptTasksDays: [7, 365], keptTasksMin: [1, 500]
};

var CHOICES = {
  defaultMode: ['auto', 'meeting', 'note', 'lecture'],
  source: Object.keys(SOURCES),
  splitMode: ['next', 'restart'],
  transcribeWhen: ['now', 'charging'],
  cleanModel: ['any', 'local', 'off'],
  noteModel: ['cloud', 'local', 'off'],
  summaryModel: ['cloud', 'local', 'off'],
  player: ['auto', 'phone']
};

var TIMES = ['cleanAt', 'reminderAt', 'eventAt'];
var FLAGS = ['pauseOnCall', 'commands', 'embed', 'memory', 'base', 'notifyReady', 'announce'];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

/** The words of the dictionary: a list or a text with commas, semicolons or new lines. */
function wordList(value) {
  var list = Array.isArray(value) ? value : String(value || '').split(/[,;\n]+/);
  var seen = {};
  return list.map(function (w) { return String(w).trim(); }).filter(function (w) {
    var k = w.toLowerCase();
    if (!w || w.length > 60 || seen[k]) return false;
    seen[k] = true;
    return true;
  }).slice(0, 300);
}

/** The owner's saved settings over the defaults, every value in its bounds. */
function normalize(saved) {
  var s = clone(DEFAULTS);
  saved = saved && typeof saved === 'object' ? saved : {};
  Object.keys(saved).forEach(function (k) {
    if (!(k in DEFAULTS)) return;
    var v = saved[k];
    if (NUMBERS[k]) {
      var n = Number(v);
      if (v === null || v === '' || !isFinite(n)) return;
      s[k] = Math.min(NUMBERS[k][1], Math.max(NUMBERS[k][0], n));
      if (k === 'channels' || k === 'sampleRate' || k === 'bitrate') s[k] = Math.round(s[k]);
    } else if (CHOICES[k]) {
      if (CHOICES[k].indexOf(v) >= 0) s[k] = v;
    } else if (TIMES.indexOf(k) >= 0) {
      if (/^([01]?\d|2[0-3]):[0-5]\d$/.test(String(v))) s[k] = String(v).length === 4 ? '0' + v : String(v);
    } else if (FLAGS.indexOf(k) >= 0) {
      s[k] = Boolean(v);
    } else if (k === 'words') {
      s.words = wordList(v);
    } else if (typeof v === typeof DEFAULTS[k]) {
      s[k] = String(v).slice(0, 300);
    }
  });
  return s;
}

/** Only what differs from the defaults: what the settings file keeps. */
function diff(s) {
  var out = {};
  Object.keys(DEFAULTS).forEach(function (k) {
    if (JSON.stringify(s[k]) !== JSON.stringify(DEFAULTS[k])) out[k] = s[k];
  });
  return out;
}

exports.DEFAULTS = DEFAULTS;
exports.NUMBERS = NUMBERS;
exports.CHOICES = CHOICES;
exports.SOURCES = SOURCES;
exports.normalize = normalize;
exports.diff = diff;
exports.wordList = wordList;
