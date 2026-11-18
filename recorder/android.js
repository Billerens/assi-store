// What the Диктофон does with the phone itself: the microphone through MediaRecorder (parts one
// after another), the length of an audio file, cutting a long file into parts without re-encoding
// (MediaExtractor + MediaMuxer; mp3 by frames, wav by samples), ffmpeg in the Linux environment as
// the last way, the phone's player, the calendar, battery and free space, and its own ongoing
// notification with buttons for a shell without notify.actions. Only main.js calls this; under
// node the tests put a fake in its place.
var parts = require('./logic/parts.js');

var G = typeof global !== 'undefined' ? global : (function () { return this; })();
var LIVE = G.__recorderAndroid || (G.__recorderAndroid = { receiver: null, player: null, playerPath: null });
var ACTION = 'app.axiko.recorder.ACTION';
var CHANNEL = 'axiko-recorder';
var INFO_APPROACHING = 802;
var INFO_NEXT_STARTED = 803;
var INFO_REACHED = 801;

function sdk() {
  return Number(android.os.Build.VERSION.SDK_INT);
}

// ---- the microphone ---------------------------------------------------------------------------

/**
 * Starts MediaRecorder: AAC in m4a. o: { path, source (number), rate, channels, bitrate, maxBytes,
 * onInfo(kind) — 'approaching' | 'next' | 'reached', onError(what, extra) }. → the recorder.
 */
function record(o) {
  var R = android.media.MediaRecorder;
  var r;
  try {
    r = new R(context);
  } catch (error) {
    r = new R();
  }
  try {
    r.setAudioSource(o.source);
    r.setOutputFormat(R.OutputFormat.MPEG_4);
    r.setAudioEncoder(R.AudioEncoder.AAC);
    r.setAudioSamplingRate(o.rate);
    r.setAudioChannels(o.channels);
    r.setAudioEncodingBitRate(o.bitrate);
    r.setOutputFile(String(o.path));
    if (o.maxBytes) r.setMaxFileSize(o.maxBytes);
    r.setOnInfoListener(new R.OnInfoListener({
      onInfo: function (mr, what, extra) {
        var kind = what === INFO_APPROACHING ? 'approaching' : what === INFO_NEXT_STARTED ? 'next' : what === INFO_REACHED ? 'reached' : null;
        if (!kind) return;
        try { o.onInfo(kind); } catch (error) { console.error('recorder: info ' + what + ': ' + error); }
      }
    }));
    r.setOnErrorListener(new R.OnErrorListener({
      onError: function (mr, what, extra) {
        try { o.onError(what, extra); } catch (error) { console.error('recorder: error ' + what + ': ' + error); }
      }
    }));
    r.prepare();
    r.start();
  } catch (error) {
    try { r.release(); } catch (ignored) { /* nothing to free */ }
    throw new Error('Микрофон не включился: ' + (error.javaException ? error.javaException.getMessage() : error.message || error));
  }
  return r;
}

/** The next file of a recording, written on from the moment the current one is full. */
function nextFile(r, path) {
  r.setNextOutputFile(new java.io.File(String(path)));
}

/** Stops and frees a recorder; false when the file has no sound (stopped right after the start). */
function finish(r) {
  var ok = true;
  try {
    r.stop();
  } catch (error) {
    ok = false;
  }
  try { r.release(); } catch (error) { /* already free */ }
  return ok;
}

function pause(r) { r.pause(); }
function resume(r) { r.resume(); }

function amplitude(r) {
  try {
    return Number(r.getMaxAmplitude());
  } catch (error) {
    return 0;
  }
}

// ---- files ------------------------------------------------------------------------------------

function freeMb(path) {
  try {
    return Number(new java.io.File(String(path)).getUsableSpace()) / 1048576;
  } catch (error) {
    return Infinity;
  }
}

function size(path) {
  var f = new java.io.File(String(path));
  return f.exists() ? Number(f.length()) : 0;
}

/** The length of an audio file, ms; null when the phone cannot read it. */
function duration(path) {
  var m = new android.media.MediaMetadataRetriever();
  try {
    m.setDataSource(String(path));
    var d = m.extractMetadata(android.media.MediaMetadataRetriever.METADATA_KEY_DURATION);
    return d === null ? null : Number(d);
  } catch (error) {
    return null;
  } finally {
    try { m.release(); } catch (error) { /* freed */ }
  }
}

function bytes(n) {
  return java.lang.reflect.Array.newInstance(java.lang.Byte.TYPE, n);
}

function copy(from, to) {
  var input = new java.io.FileInputStream(String(from));
  var output = new java.io.FileOutputStream(String(to));
  try {
    var buf = bytes(65536);
    var n;
    while ((n = input.read(buf)) > 0) output.write(buf, 0, n);
  } finally {
    input.close();
    output.close();
  }
}

/** A piece of a file sent by the screen in base64, added to its end. */
function append(path, base64) {
  var data = android.util.Base64.decode(String(base64), 0);
  var output = new java.io.FileOutputStream(String(path), true);
  try {
    output.write(data);
  } finally {
    output.close();
  }
  return Number(data.length);
}

function writeHeader(file, rate, channels, dataBytes) {
  var h = parts.wavHeader(rate, channels, dataBytes);
  var b = bytes(h.length);
  for (var i = 0; i < h.length; i++) b[i] = h[i] > 127 ? h[i] - 256 : h[i];
  var raf = new java.io.RandomAccessFile(String(file), 'rw');
  try {
    raf.seek(0);
    raf.write(b);
  } finally {
    raf.close();
  }
}

/**
 * Cuts a long audio file into parts of partMs without re-encoding. → [{ n, path, offsetMs,
 * durationMs }], or null when this kind of sound can only be cut by ffmpeg.
 * name(n, ext) gives the absolute path of part n.
 */
function cut(src, partMs, name) {
  var ex = new android.media.MediaExtractor();
  ex.setDataSource(String(src));
  var track = -1;
  var format = null;
  var mime = '';
  for (var i = 0; i < ex.getTrackCount(); i++) {
    var f = ex.getTrackFormat(i);
    var m = String(f.getString(android.media.MediaFormat.KEY_MIME) || '');
    if (m.indexOf('audio/') === 0) { track = i; format = f; mime = m; break; }
  }
  if (track < 0) { ex.release(); throw new Error('В файле нет звука'); }
  var kind = parts.cutKind(mime, sdk());
  var rate = format.containsKey('sample-rate') ? Number(format.getInteger('sample-rate')) : 16000;
  var channels = format.containsKey('channel-count') ? Number(format.getInteger('channel-count')) : 1;
  if (kind && kind.container === 'wav' && format.containsKey('pcm-encoding') && Number(format.getInteger('pcm-encoding')) !== 2) kind = null;
  if (!kind) { ex.release(); return null; }
  var total = format.containsKey('durationUs') ? Number(format.getLong('durationUs')) : null;
  ex.selectTrack(track);
  var maxSize = format.containsKey('max-input-size') ? Number(format.getInteger('max-input-size')) : 0;
  var buf = java.nio.ByteBuffer.allocate(Math.max(maxSize, 262144));
  var info = new android.media.MediaCodec.BufferInfo();
  var M = android.media.MediaMuxer.OutputFormat;
  var muxFormat = { mpeg4: M.MUXER_OUTPUT_MPEG_4, webm: M.MUXER_OUTPUT_WEBM, '3gpp': M.MUXER_OUTPUT_3GPP, ogg: 4 }[kind.container];
  var out = [];
  var cur = null;
  var open = function (startUs) {
    var n = out.length + 1;
    var path = String(name(n, kind.ext));
    var part = { n: n, path: path, startUs: startUs, written: 0 };
    if (kind.container === 'frames' || kind.container === 'wav') {
      part.stream = new java.io.FileOutputStream(path);
      if (kind.container === 'wav') part.stream.write(bytes(44));
    } else {
      part.mux = new android.media.MediaMuxer(path, muxFormat);
      part.track = part.mux.addTrack(format);
      part.mux.start();
    }
    out.push(part);
    return part;
  };
  var close = function (part, endUs) {
    if (!part) return;
    if (part.mux) {
      try { part.mux.stop(); } catch (error) { /* an empty part */ }
      part.mux.release();
    } else {
      part.stream.close();
      if (kind.container === 'wav') writeHeader(part.path, rate, channels, part.written);
    }
    part.offsetMs = Math.round(part.startUs / 1000);
    part.durationMs = Math.max(0, Math.round((endUs - part.startUs) / 1000));
  };
  var last = 0;
  try {
    while (true) {
      var got = ex.readSampleData(buf, 0);
      if (got < 0) break;
      var t = Number(ex.getSampleTime());
      if (!cur || t - cur.startUs >= partMs * 1000) {
        close(cur, t);
        cur = open(t);
      }
      if (cur.mux) {
        info.set(0, got, t - cur.startUs, ex.getSampleFlags() & 1);   // SAMPLE_FLAG_SYNC is BUFFER_FLAG_KEY_FRAME
        cur.mux.writeSampleData(cur.track, buf, info);
      } else {
        var chunk = bytes(got);
        buf.position(0);
        buf.get(chunk, 0, got);
        cur.stream.write(chunk, 0, got);
      }
      cur.written += got;
      last = t;
      ex.advance();
    }
    close(cur, total !== null && total > last ? total : last);
  } finally {
    ex.release();
  }
  return out.map(function (p) { return { n: p.n, path: p.path, offsetMs: p.offsetMs, durationMs: p.durationMs }; });
}

/**
 * The last way to cut: ffmpeg in the Linux environment (data/ is /axiko there), into 16 kHz mono WAV.
 * → [{ n, path, offsetMs, durationMs }] or null when there is no Linux or no ffmpeg.
 */
function ffmpeg(axiko, src, dir, partSec, timeoutSec) {
  var dataRoot = String(axiko.files.path('data')).replace(/\/+$/, '');
  var inside = function (p) {
    var s = String(p);
    return s.indexOf(dataRoot) === 0 ? '/axiko' + s.slice(dataRoot.length) : null;
  };
  var a = inside(src);
  var b = inside(dir);
  if (!a || !b) return null;
  var have;
  try {
    have = axiko.linux('command -v ffmpeg', { timeout: 20 });
  } catch (error) {
    return null;
  }
  if (!have || have.code !== 0) return null;
  var q = function (s) { return "'" + String(s).replace(/'/g, "'\\''") + "'"; };
  var r = axiko.linux('ffmpeg -nostdin -loglevel error -y -i ' + q(a) + ' -f segment -segment_time ' + partSec +
    ' -ac 1 -ar 16000 ' + q(b + '/cut-%03d.wav'), { timeout: timeoutSec || 1800 });
  if (r.code !== 0) throw new Error('ffmpeg не разрезал файл: ' + String(r.out || '').slice(-300));
  var names = js(new java.io.File(String(dir)).list()).map(String).filter(function (n) { return /^cut-\d{3}\.wav$/.test(n); }).sort();
  var offset = 0;
  return names.map(function (n, i) {
    var from = new java.io.File(String(dir), n);
    var to = new java.io.File(String(dir), parts.partName(i + 1, 'wav'));
    from.renameTo(to);
    var d = duration(to.getPath()) || partSec * 1000;
    var item = { n: i + 1, path: String(to.getPath()), offsetMs: offset, durationMs: d };
    offset += d;
    return item;
  });
}

// ---- the phone's player (when the screen cannot play or seek) -------------------------------------

function playerStop() {
  if (!LIVE.player) return;
  try { LIVE.player.stop(); } catch (error) { /* not started */ }
  try { LIVE.player.release(); } catch (error) { /* freed */ }
  LIVE.player = null;
  LIVE.playerPath = null;
}

function play(path, ms, onEnd) {
  if (LIVE.player && LIVE.playerPath === String(path)) {
    LIVE.player.seekTo(Math.round(ms || 0));
    LIVE.player.start();
    return true;
  }
  playerStop();
  var p = new android.media.MediaPlayer();
  p.setDataSource(String(path));
  p.prepare();
  p.setOnCompletionListener(new android.media.MediaPlayer.OnCompletionListener({
    onCompletion: function () { try { onEnd(String(path)); } catch (error) { /* the screen is gone */ } }
  }));
  if (ms) p.seekTo(Math.round(ms));
  p.start();
  LIVE.player = p;
  LIVE.playerPath = String(path);
  return true;
}

function playerPause() {
  if (LIVE.player) try { LIVE.player.pause(); } catch (error) { /* stopped */ }
}

function playerState() {
  if (!LIVE.player) return { playing: false, path: null, ms: 0 };
  try {
    return { playing: Boolean(LIVE.player.isPlaying()), path: LIVE.playerPath, ms: Number(LIVE.player.getCurrentPosition()), durationMs: Number(LIVE.player.getDuration()) };
  } catch (error) {
    return { playing: false, path: LIVE.playerPath, ms: 0 };
  }
}

// ---- battery, calendar ----------------------------------------------------------------------------

function charging() {
  try {
    return Boolean(context.getSystemService('batterymanager').isCharging());
  } catch (error) {
    return false;
  }
}

function calendarId() {
  var C = android.provider.CalendarContract.Calendars;
  var cols = java.lang.reflect.Array.newInstance(java.lang.String, 3);
  cols[0] = '_id'; cols[1] = 'isPrimary'; cols[2] = 'calendar_access_level';
  var cursor = context.getContentResolver().query(C.CONTENT_URI, cols, 'visible = 1 AND calendar_access_level >= 500', null, null);
  if (!cursor) return null;
  var best = null;
  try {
    while (cursor.moveToNext()) {
      var id = Number(cursor.getLong(0));
      var primary = cursor.isNull(1) ? 0 : Number(cursor.getInt(1));
      if (best === null || (primary && !best.primary)) best = { id: id, primary: primary };
    }
  } finally {
    cursor.close();
  }
  return best ? best.id : null;
}

/** An event in the phone's calendar with a reminder before it: → its id. o: { title, description, start, minutes, remindMin }. */
function addEvent(o) {
  var cal = calendarId();
  if (cal === null) throw new Error('В телефоне нет календаря, куда можно писать');
  var v = new android.content.ContentValues();
  v.put('calendar_id', java.lang.Long.valueOf(cal));
  v.put('title', String(o.title));
  v.put('description', String(o.description || ''));
  v.put('dtstart', java.lang.Long.valueOf(Math.round(o.start)));
  v.put('dtend', java.lang.Long.valueOf(Math.round(o.start + o.minutes * 60000)));
  v.put('eventTimezone', String(java.util.TimeZone.getDefault().getID()));
  v.put('hasAlarm', java.lang.Integer.valueOf(1));
  var resolver = context.getContentResolver();
  var uri = resolver.insert(android.provider.CalendarContract.Events.CONTENT_URI, v);
  if (!uri) throw new Error('Календарь не принял событие');
  var id = Number(uri.getLastPathSegment());
  var r = new android.content.ContentValues();
  r.put('event_id', java.lang.Long.valueOf(id));
  r.put('minutes', java.lang.Integer.valueOf(o.remindMin === undefined ? 15 : o.remindMin));
  r.put('method', java.lang.Integer.valueOf(1));
  try { resolver.insert(android.provider.CalendarContract.Reminders.CONTENT_URI, r); } catch (error) { /* the event stays */ }
  return id;
}

function removeEvent(id) {
  var uri = android.content.ContentUris.withAppendedId(android.provider.CalendarContract.Events.CONTENT_URI, id);
  return Number(context.getContentResolver().delete(uri, null, null)) > 0;
}

// ---- the own ongoing notification (a shell without notify.actions) ------------------------------

function manager() {
  return context.getSystemService('notification');
}

function receiver() {
  if (LIVE.receiver) return;
  var handler = extend(android.content.BroadcastReceiver, {
    onReceive: function (ctx, intent) {
      var act = String(intent.getStringExtra('act') || '');
      spawn(function () {
        try {
          require('modules/recorder/main.js').fromNotice({ act: act });
        } catch (error) {
          console.error('recorder: notification button: ' + error);
        }
      });
    }
  });
  var filter = new android.content.IntentFilter();
  filter.addAction(ACTION);
  context.registerReceiver(handler, filter, sdk() >= 33 ? 4 : 0);   // RECEIVER_NOT_EXPORTED
  LIVE.receiver = handler;
}

/** o: { id (number), title, text, when, chronometer, actions: [{ title, act }] }. */
function ongoing(o) {
  receiver();
  var PI = android.app.PendingIntent;
  var flags = PI.FLAG_IMMUTABLE | PI.FLAG_UPDATE_CURRENT;
  manager().createNotificationChannel(new android.app.NotificationChannel(CHANNEL, 'Диктофон: идёт запись', android.app.NotificationManager.IMPORTANCE_LOW));
  var icon = context.getResources().getIdentifier('ic_spark', 'drawable', context.getPackageName()) || android.R.drawable.ic_btn_speak_now;
  var b = new android.app.Notification.Builder(context, CHANNEL)
    .setSmallIcon(icon)
    .setContentTitle(String(o.title))
    .setContentText(String(o.text || ''))
    .setOngoing(true)
    .setOnlyAlertOnce(true)
    .setCategory(android.app.Notification.CATEGORY_PROGRESS);
  if (o.when) b.setWhen(Math.round(o.when)).setShowWhen(true).setUsesChronometer(Boolean(o.chronometer));
  var launch = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
  if (launch) {
    launch.putExtra('open', 'modules/recorder/ui/index.html');
    b.setContentIntent(PI.getActivity(context, 7300, launch, flags));
  }
  (o.actions || []).forEach(function (a, i) {
    var intent = new android.content.Intent(ACTION).setPackage(context.getPackageName()).putExtra('act', String(a.act));
    var pi = PI.getBroadcast(context, 7301 + i, intent, flags);
    var ic = android.graphics.drawable.Icon.createWithResource(context, icon);
    b.addAction(new android.app.Notification.Action.Builder(ic, String(a.title), pi).build());
  });
  manager().notify(o.id, b.build());
}

function cancelOngoing(id) {
  try { manager().cancel(id); } catch (error) { /* gone */ }
}

exports.sdk = sdk;
exports.record = record;
exports.nextFile = nextFile;
exports.finish = finish;
exports.pause = pause;
exports.resume = resume;
exports.amplitude = amplitude;
exports.freeMb = freeMb;
exports.size = size;
exports.duration = duration;
exports.copy = copy;
exports.append = append;
exports.cut = cut;
exports.ffmpeg = ffmpeg;
exports.play = play;
exports.playerPause = playerPause;
exports.playerStop = playerStop;
exports.playerState = playerState;
exports.charging = charging;
exports.addEvent = addEvent;
exports.removeEvent = removeEvent;
exports.ongoing = ongoing;
exports.cancelOngoing = cancelOngoing;
