// Bookkeeping of a recording without Android: the size limit of a part, names of part files, the
// time that really went (without pauses), the sound level for the screen, which recording is a
// thought and which a meeting, whose sound is old enough to remove, what an imported file can be
// cut into, and the words of notifications and the widget. Pure.
var text = require('./text.js');

/** The size limit of a part file: bitrate × length plus the container's share. */
function partBytes(bitrate, minutes, overheadPct) {
  return Math.round(bitrate / 8 * minutes * 60 * (1 + (overheadPct || 0) / 100));
}

function partName(n, ext) {
  var s = String(n);
  while (s.length < 3) s = '0' + s;
  return 'part-' + s + '.' + (ext || 'm4a');
}

/** Time recorded so far, without pauses. st: { startedAt, pausedMs, pausedAt }. */
function activeMs(st, now) {
  if (!st || !st.startedAt) return 0;
  var paused = Number(st.pausedMs || 0) + (st.pausedAt ? now - st.pausedAt : 0);
  return Math.max(0, now - st.startedAt - paused);
}

/** MediaRecorder's amplitude (0…32767) as 0…1 on a scale of 60 dB. */
function level(amplitude) {
  var a = Number(amplitude || 0);
  if (a <= 0) return 0;
  var db = 20 * Math.log(a / 32767) / Math.LN10;
  return Math.max(0, Math.min(1, (db + 60) / 60));
}

/** «Авто» becomes a thought or a meeting by the length; another mode stays. */
function finalMode(mode, durationMs, noteMaxMinutes) {
  if (mode === 'meeting' || mode === 'note' || mode === 'lecture') return mode;
  return durationMs <= noteMaxMinutes * 60000 ? 'note' : 'meeting';
}

/** Recordings whose sound goes now: not kept by the owner, older than `days` (0 — never). */
function toStrip(recordings, now, days) {
  if (!days) return [];
  return (recordings || []).filter(function (r) {
    return !r.audioKept && !r.audioRemoved && r.state !== 'recording' && r.startedAt < now - days * 864e5;
  }).map(function (r) { return r.id; });
}

/** Cut points of a long file: [{ n, startMs, endMs }]. */
function plan(durationMs, partMs) {
  var out = [];
  var n = 1;
  for (var at = 0; at < durationMs; at += partMs) {
    out.push({ n: n++, startMs: at, endMs: Math.min(durationMs, at + partMs) });
  }
  if (out.length > 1 && out[out.length - 1].endMs - out[out.length - 1].startMs < partMs / 5) {
    var last = out.pop();
    out[out.length - 1].endMs = last.endMs;
  }
  return out;
}

var AUDIO = ['m4a', 'mp4', 'aac', '3gp', 'amr', 'ogg', 'oga', 'opus', 'webm', 'mp3', 'wav', 'flac', 'mka', 'weba'];

function isAudio(name) {
  var ext = String(name || '').toLowerCase().split('.').pop();
  return AUDIO.indexOf(ext) >= 0;
}

/**
 * How a track of this kind is cut without re-encoding: { container, ext } — container is the
 * MediaMuxer format ('mpeg4' | 'ogg' | 'webm' | '3gpp'), or 'frames' (mp3: frames one after another),
 * or 'wav' (raw samples under a new header); null — only ffmpeg can.
 */
function cutKind(mime, sdk) {
  var m = String(mime || '').toLowerCase();
  if (m === 'audio/mp4a-latm' || m === 'audio/aac') return { container: 'mpeg4', ext: 'm4a' };
  if (m === 'audio/opus') return sdk >= 29 ? { container: 'ogg', ext: 'ogg' } : { container: 'webm', ext: 'webm' };
  if (m === 'audio/vorbis') return { container: 'webm', ext: 'webm' };
  if (m === 'audio/3gpp' || m === 'audio/amr-wb') return { container: '3gpp', ext: '3gp' };
  if (m === 'audio/mpeg') return { container: 'frames', ext: 'mp3' };
  if (m === 'audio/raw') return { container: 'wav', ext: 'wav' };
  return null;
}

/** A 44-byte WAV header for 16-bit PCM: an array of numbers 0…255. */
function wavHeader(rate, channels, dataBytes) {
  var h = [];
  var str = function (s) { for (var i = 0; i < s.length; i++) h.push(s.charCodeAt(i)); };
  var u32 = function (v) { h.push(v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255); };
  var u16 = function (v) { h.push(v & 255, (v >>> 8) & 255); };
  str('RIFF'); u32(36 + dataBytes); str('WAVE');
  str('fmt '); u32(16); u16(1); u16(channels); u32(rate); u32(rate * channels * 2); u16(channels * 2); u16(16);
  str('data'); u32(dataBytes);
  return h;
}

function plural(n, one, few, many) {
  var a = Math.abs(n) % 100;
  var b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}

function count(n, one, few, many) {
  return n + ' ' + plural(n, one, few, many);
}

/** «Конспект готов: Встреча с Олегом о ремонте — 3 решения, 4 задачи». */
function readyText(title, summary) {
  var bits = [];
  if (summary && summary.decisions && summary.decisions.length) bits.push(count(summary.decisions.length, 'решение', 'решения', 'решений'));
  if (summary && summary.tasks && summary.tasks.length) bits.push(count(summary.tasks.length, 'задача', 'задачи', 'задач'));
  return 'Конспект готов: ' + (title || 'запись') + (bits.length ? ' — ' + bits.join(', ') : '');
}

/** The widget: «Последняя: Встреча с Олегом, 42 мин» / «Задач открыто: 4». */
function widget(last, openTasks, recording, now) {
  if (recording) {
    return { title: 'Идёт запись · ' + text.length(activeMs(recording, now)), text: recording.paused ? 'На паузе' : 'Нажмите, чтобы открыть' };
  }
  if (!last) return { title: 'Диктофон', text: 'Записей пока нет' };
  return {
    title: 'Последняя: ' + (last.title || 'запись') + ', ' + text.length(last.durationMs),
    text: openTasks ? 'Задач открыто: ' + openTasks : 'Открытых задач нет'
  };
}

exports.partBytes = partBytes;
exports.partName = partName;
exports.activeMs = activeMs;
exports.level = level;
exports.finalMode = finalMode;
exports.toStrip = toStrip;
exports.plan = plan;
exports.isAudio = isAudio;
exports.cutKind = cutKind;
exports.wavHeader = wavHeader;
exports.plural = plural;
exports.count = count;
exports.readyText = readyText;
exports.widget = widget;
