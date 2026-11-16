// Speech recorded in advance. The cloud voice is better than the phone's, but there is no network
// in the metro: while there is Wi-Fi and the phone charges, the texts of what comes next are
// turned into files and later played with android.media.MediaPlayer, right here in the engine.
//
// With the shell operation `speech.render` (docs/shell-changes.md) the shell writes the file and
// counts the cost; without it — or when a manner of speaking (style) of our own is wanted — the
// request goes straight from here: POST {baseUrl}/audio/speech of the role "tts", raw PCM gets a
// WAV header. Such calls pass by the shell's spending log, so they are written to our own journal.
// Engine only (Rhino).
var assi = require('lib/assi');
var wav = require('./wav.js');
var lines = require('./lines.js');
var phone = require('./phone.js');
var store = require('./store.js');

var GEMINI_STYLE = 'provider.options.google-ai-studio.speech_metadata.style';
var LOG = 'data/stories/audio-log.json';
var client = null;

function http() {
  if (!client) {
    var seconds = java.util.concurrent.TimeUnit.SECONDS;
    client = new okhttp3.OkHttpClient.Builder().connectTimeout(30, seconds).readTimeout(180, seconds).writeTimeout(60, seconds).build();
  }
  return client;
}

function safe(node) {
  return String(node).replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 80);
}

/** The recording of a node, if there is one: 'data/…/audio/<node>.wav' or null. */
function find(dir, node) {
  var folder = store.file(dir + '/audio');
  if (!folder.isDirectory()) return null;
  var prefix = safe(node) + '.';
  var inner = folder.listFiles() || [];
  for (var i = 0; i < inner.length; i++) {
    var name = String(inner[i].getName());
    if (name.indexOf(prefix) === 0 && name.slice(-4) !== '.tmp' && inner[i].length() > 44) return dir + '/audio/' + name;
  }
  return null;
}

/** [{text, audio}] of the nodes that are recorded — for lines.segments(). */
function known(dir, items) {
  return (items || []).map(function (item) {
    var path = find(dir, item.node);
    return path ? { text: item.text, audio: path } : null;
  }).filter(function (entry) { return entry; });
}

function journal(entry) {
  try {
    var list = store.readJson(LOG, []) || [];
    list.push(entry);
    store.writeJson(LOG, list.slice(-500));
  } catch (error) {
    console.warn('story-engine: журнал записи: ' + error);
  }
}

function javaBytes(numbers) {
  var out = java.lang.reflect.Array.newInstance(java.lang.Byte.TYPE, numbers.length);
  for (var i = 0; i < numbers.length; i++) out[i] = numbers[i] > 127 ? numbers[i] - 256 : numbers[i];
  return out;
}

function setPath(body, path, value) {
  var keys = String(path).split('.');
  var node = body;
  for (var i = 0; i < keys.length - 1; i++) {
    if (!node[keys[i]] || typeof node[keys[i]] !== 'object') node[keys[i]] = {};
    node = node[keys[i]];
  }
  node[keys[keys.length - 1]] = value;
}

/** The request straight to the provider of the role "tts"; returns the path written. */
function renderDirect(text, base, options) {
  var target = native('models.resolve', 'tts', false);
  if (!target || !target.model) throw new Error('Для голоса (роль tts) не выбрана модель');
  var settings = target.options || {};
  var gemini = /gemini/i.test(String(target.model));
  var body = {
    model: target.model,
    input: String(text),
    voice: settings.voice || (gemini ? 'Zephyr' : 'alloy'),
    response_format: settings.format || 'pcm'
  };
  var style = options.style !== undefined && options.style !== null && options.style !== '' ? options.style : settings.style;
  if (style) setPath(body, settings.styleParam || (gemini ? GEMINI_STYLE : 'instructions'), String(style));
  var builder = new okhttp3.Request.Builder().url(String(target.baseUrl) + '/audio/speech')
    .header('X-Title', 'Assi')
    .post(okhttp3.RequestBody.create(okhttp3.MediaType.parse('application/json; charset=utf-8'), JSON.stringify(body)));
  if (target.key) builder.header('Authorization', 'Bearer ' + target.key);
  var started = Date.now();
  var response = http().newCall(builder.build()).execute();
  try {
    if (!response.isSuccessful()) {
      var detail = '';
      try { detail = String(response.body().string()).slice(0, 200); } catch (ignored) { detail = ''; }
      throw new Error('Синтез речи не удался (' + response.code() + ') ' + detail);
    }
    var type = String(response.header('Content-Type') || '');
    var bytes = response.body().bytes();
    var ext = wav.extension(type);
    var out = store.file(base + '.' + ext);
    var temp = new java.io.File(out.getPath() + '.tmp');
    temp.getParentFile().mkdirs();
    var stream = new java.io.FileOutputStream(temp);
    try {
      if (wav.isRaw(type)) stream.write(javaBytes(wav.header(bytes.length, wav.rateOf(type, options.rate || 24000), 1, 16)));
      stream.write(bytes);
      stream.getFD().sync();
    } finally {
      stream.close();
    }
    if (!temp.renameTo(out)) throw new Error('Не удалось записать ' + out.getName());
    journal({
      at: Date.now(), chars: String(text).length, bytes: Number(out.length()), ms: Date.now() - started,
      model: String(target.model), via: 'direct', seconds: wav.isRaw(type) ? wav.seconds(bytes.length, wav.rateOf(type, 24000)) : null
    });
    return base + '.' + ext;
  } finally {
    response.close();
  }
}

/**
 * Turns a text into a file at dir/audio/<node>.<ext>; returns the workspace path.
 * options: {style, rate} — a manner of speaking of our own goes past speech.render.
 */
function render(dir, node, text, options) {
  options = options || {};
  var base = dir + '/audio/' + safe(node);
  if (phone.has('speech.render') && !options.style) {
    var got = native('speech.render', String(text), base + '.wav', 'cloud');
    journal({ at: Date.now(), chars: String(text).length, via: 'speech.render', node: String(node) });
    return got ? String(got).replace(String(assi.files.path('')) + '/', '') : base + '.wav';
  }
  return renderDirect(text, base, options);
}

function filesUnder(node, out) {
  if (!node.exists()) return out;
  if (node.isDirectory()) {
    var inner = node.listFiles() || [];
    for (var i = 0; i < inner.length; i++) filesUnder(inner[i], out);
  } else if (String(node.getParentFile().getName()) === 'audio') {
    out.push(node);
  }
  return out;
}

/** Megabytes of recordings under the roots. */
function usage(roots) {
  var total = 0;
  (roots || ['data/stories']).forEach(function (root) {
    filesUnder(store.file(root), []).forEach(function (f) { total += Number(f.length()); });
  });
  return Math.round(total / 1048576 * 10) / 10;
}

/** Keeps the recordings under maxMb: the oldest go first. Returns how many files were removed. */
function trim(roots, maxMb) {
  var list = [];
  (roots || ['data/stories']).forEach(function (root) { filesUnder(store.file(root), list); });
  list.sort(function (a, b) { return Number(a.lastModified()) - Number(b.lastModified()); });
  var total = 0;
  list.forEach(function (f) { total += Number(f.length()); });
  var limit = maxMb * 1048576;
  var removed = 0;
  for (var i = 0; i < list.length && total > limit; i++) {
    total -= Number(list[i].length());
    list[i]['delete']();
    removed++;
  }
  return removed;
}

/**
 * Records what is not recorded yet: items [{node, text}]. Stops when Wi-Fi or charging is gone
 * (unless options.anyNetwork / options.anyPower), or when options.stop() says so.
 * Returns {done, skipped, failed, error}.
 */
function prerender(dir, items, options) {
  options = options || {};
  var outcome = { done: 0, skipped: 0, failed: 0, error: null };
  for (var i = 0; i < (items || []).length; i++) {
    var item = items[i];
    if (!item || !item.text) continue;
    if (find(dir, item.node)) { outcome.skipped++; continue; }
    if (options.stop && options.stop()) break;
    if (!options.anyNetwork && !phone.unmetered()) { outcome.error = 'нет Wi-Fi'; break; }
    if (!options.anyPower && !phone.charging()) { outcome.error = 'телефон не на зарядке'; break; }
    try {
      render(dir, item.node, item.text, options);
      outcome.done++;
    } catch (error) {
      outcome.failed++;
      outcome.error = String(error && error.message ? error.message : error);
      if (outcome.failed >= 3) break;
    }
  }
  if (options.maxMb) trim(options.roots || ['data/stories'], options.maxMb);
  return outcome;
}

/**
 * Plays a recording and waits for its end. control: {pollMs, fade: {from, to}, interrupted: fn}.
 * Returns 'done', 'stopped' or 'error'.
 */
function play(path, control) {
  control = control || {};
  var target = store.file(path);
  if (!target.isFile()) return 'error';
  var player = new android.media.MediaPlayer();
  var result = 'done';
  try {
    player.setAudioAttributes(new android.media.AudioAttributes.Builder()
      .setUsage(android.media.AudioAttributes.USAGE_MEDIA)
      .setContentType(android.media.AudioAttributes.CONTENT_TYPE_SPEECH).build());
    player.setDataSource(target.getPath());
    player.prepare();
    var duration = Number(player.getDuration());
    var start = control.fade ? control.fade.from : (control.volume === undefined ? 1 : control.volume);
    player.setVolume(start, start);
    player.start();
    var poll = control.pollMs || 200;
    sleep(Math.min(poll, 100));
    while (true) {
      if (control.interrupted && control.interrupted()) {
        result = 'stopped';
        break;
      }
      var playing = false;
      try { playing = player.isPlaying(); } catch (ignored) { playing = false; }
      if (!playing) break;
      if (control.fade) {
        var level = lines.volumeAt(control.fade, Number(player.getCurrentPosition()), duration);
        player.setVolume(level, level);
      }
      sleep(poll);
    }
  } catch (error) {
    console.warn('story-engine: не удалось проиграть ' + path + ': ' + error);
    result = 'error';
  } finally {
    try { player.stop(); } catch (ignored) { /* already stopped */ }
    player.release();
  }
  return result;
}

exports.find = find;
exports.known = known;
exports.render = render;
exports.prerender = prerender;
exports.trim = trim;
exports.usage = usage;
exports.play = play;
exports.safe = safe;
