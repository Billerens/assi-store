// What «Тайная жизнь телефона» asks of Android itself: the battery, the usage journal, traffic by
// uid, app names, Shizuku and the dumpsys outputs, the system screens of access. Engine only
// (Rhino). Every call is wrapped: a source that does not answer says why, it never throws.
var axiko = require('lib/axiko');
var parse = require('./parse');

var G = typeof global !== 'undefined' ? global : {};
var LIVE = G.__phoneNightAndroid || (G.__phoneNightAndroid = {
  features: null,
  featuresAt: 0,
  labels: {},
  selfDump: null,
  selfDumpAt: 0
});

var CUT = '----- phone-night: середина вывода пропущена -----';
exports.CUT = CUT;

function message(error) {
  if (!error) return 'ошибка';
  if (error.javaException) return String(error.javaException.getMessage ? error.javaException.getMessage() : error.javaException);
  return String(error.message || error);
}

exports.message = message;

// ---- what the shell can do -------------------------------------------------------------------

/** The shell's additions (docs/shell-changes.md in Axiko) that are there; none when it cannot say. */
exports.features = function () {
  if (LIVE.features && Date.now() - LIVE.featuresAt < 60000) return LIVE.features;
  var list = [];
  try {
    var got = native('shell.features');
    if (Array.isArray(got)) list = got.map(String);
  } catch (error) {
    list = [];
  }
  LIVE.features = list;
  LIVE.featuresAt = Date.now();
  return list;
};

exports.has = function (name) {
  return exports.features().indexOf(name) >= 0;
};

// ---- battery and uptime -----------------------------------------------------------------------

/** The battery now, from the sticky ACTION_BATTERY_CHANGED: { ok, note, level, charging, plugged, temp }. */
exports.battery = function () {
  try {
    var intent = context.registerReceiver(null, new android.content.IntentFilter(android.content.Intent.ACTION_BATTERY_CHANGED));
    if (!intent) throw new Error('система не отдала состояние батареи');
    var level = Number(intent.getIntExtra('level', -1));
    var scale = Number(intent.getIntExtra('scale', 100)) || 100;
    var plugged = Number(intent.getIntExtra('plugged', 0));
    var status = Number(intent.getIntExtra('status', 1));
    var temp = Number(intent.getIntExtra('temperature', -10000));
    if (level < 0) throw new Error('уровень батареи неизвестен');
    return {
      ok: true, note: '', level: Math.round(level * 100 / scale), plugged: plugged,
      charging: plugged !== 0 || status === android.os.BatteryManager.BATTERY_STATUS_CHARGING,
      temp: temp > -10000 ? temp / 10 : null
    };
  } catch (error) {
    try {
      var manager = context.getSystemService('batterymanager');
      var capacity = Number(manager.getIntProperty(android.os.BatteryManager.BATTERY_PROPERTY_CAPACITY));
      if (capacity >= 0 && capacity <= 100) {
        return { ok: true, note: 'без температуры: ' + message(error), level: capacity, plugged: 0, charging: Boolean(manager.isCharging()), temp: null };
      }
    } catch (inner) { /* the note below */ }
    return { ok: false, note: 'батарея не ответила: ' + message(error), level: null, charging: null, plugged: null, temp: null };
  }
};

/** Milliseconds since the phone booted, deep sleep included. */
exports.uptime = function () {
  return Number(android.os.SystemClock.elapsedRealtime());
};

// ---- the usage journal (UsageStatsManager) ----------------------------------------------------------

/** Is «Доступ к истории использования» (PACKAGE_USAGE_STATS) given? */
exports.usageAccess = function () {
  try {
    var ops = context.getSystemService('appops');
    var mode = ops.unsafeCheckOpNoThrow('android:get_usage_stats', android.os.Process.myUid(), String(context.getPackageName()));
    return Number(mode) === Number(android.app.AppOpsManager.MODE_ALLOWED);
  } catch (error) {
    return false;
  }
};

var SCREENISH = { screen_on: 1, screen_off: 1, unlock: 1, shutdown: 1, startup: 1 };

/** Events from..to: { ok, note, events: [{ at, kind, package, src: 'usage' }] }. */
exports.usageEvents = function (from, to) {
  if (!exports.usageAccess()) return { ok: false, note: 'нет доступа к статистике использования', events: [] };
  try {
    var manager = context.getSystemService('usagestats');
    var list = manager.queryEvents(Math.round(from), Math.round(to));
    var event = new android.app.usage.UsageEvents.Event();
    var out = [];
    while (list.hasNextEvent()) {
      list.getNextEvent(event);
      var kind = parse.usageKind(Number(event.getEventType()));
      if (!kind || kind === 'keyguard_shown' || kind === 'stopped') continue;
      out.push({
        at: Number(event.getTimeStamp()), kind: kind,
        package: SCREENISH[kind] ? null : String(event.getPackageName()), src: 'usage'
      });
    }
    return { ok: true, note: out.length ? '' : 'статистика Android за ночь пуста', events: out };
  } catch (error) {
    return { ok: false, note: 'статистика Android не ответила: ' + message(error), events: [] };
  }
};

// ---- traffic (NetworkStatsManager) --------------------------------------------------------------------

/** Bytes by uid from..to: { ok, note, rows: { uid: { wifi, mobile } } }. */
exports.traffic = function (from, to) {
  if (!exports.usageAccess()) return { ok: false, note: 'нет доступа к статистике использования — трафик не виден', rows: {} };
  var rows = {};
  var notes = [];
  var any = false;
  function read(type, field) {
    var buckets = null;
    try {
      var manager = context.getSystemService('netstats');
      buckets = manager.querySummary(type, null, Math.round(from), Math.round(to));
      var bucket = new android.app.usage.NetworkStats.Bucket();
      while (buckets.hasNextBucket()) {
        buckets.getNextBucket(bucket);
        var uid = Number(bucket.getUid());
        var bytes = Number(bucket.getRxBytes()) + Number(bucket.getTxBytes());
        var row = rows[uid] = rows[uid] || { wifi: 0, mobile: 0 };
        row[field] += bytes;
      }
      any = true;
    } catch (error) {
      notes.push((field === 'wifi' ? 'Wi-Fi' : 'мобильная сеть') + ': ' + message(error));
    } finally {
      try { if (buckets) buckets.close(); } catch (error) { /* closed */ }
    }
  }
  read(android.net.ConnectivityManager.TYPE_WIFI, 'wifi');
  read(android.net.ConnectivityManager.TYPE_MOBILE, 'mobile');
  if (!any) return { ok: false, note: 'трафик не прочитан: ' + notes.join('; '), rows: {} };
  return { ok: true, note: 'примерно: сеть считается корзинами по ~2 ч' + (notes.length ? '; ' + notes.join('; ') : ''), rows: rows };
};

// ---- app names ------------------------------------------------------------------------------------------

/** The name of an app as the launcher shows it; the package itself when it is unknown. */
exports.label = function (pkg) {
  if (!pkg) return null;
  if (LIVE.labels[pkg]) return LIVE.labels[pkg];
  var name = String(pkg);
  try {
    var pm = context.getPackageManager();
    var info = pm.getApplicationInfo(String(pkg), 0);
    var label = pm.getApplicationLabel(info);
    if (label) name = String(label);
  } catch (error) { /* not installed or hidden from Axiko */ }
  LIVE.labels[pkg] = name;
  return name;
};

exports.packagesOfUid = function (uid) {
  try {
    var found = context.getPackageManager().getPackagesForUid(java.lang.Integer.valueOf(uid));
    if (!found) return [];
    var out = [];
    for (var i = 0; i < found.length; i++) out.push(String(found[i]));
    return out.sort();
  } catch (error) {
    return [];
  }
};

/** Names for the packages and uids of a night: { byPkg: { pkg: name }, byUid: { uid: { pkg, app } } }. */
exports.apps = function (pkgs, uids, names) {
  var out = { byPkg: {}, byUid: {} };
  (pkgs || []).forEach(function (pkg) {
    if (pkg && !out.byPkg[pkg]) out.byPkg[pkg] = exports.label(pkg);
  });
  (uids || []).forEach(function (uid) {
    uid = Number(uid);
    if (!(uid % 100000 >= 10000 && uid % 100000 < 99000) || out.byUid[uid]) return;
    var list = exports.packagesOfUid(uid);
    var pkg = list.length ? list[0] : names && names[uid] ? String(names[uid]) : null;
    if (!pkg) return;
    out.byUid[uid] = { pkg: pkg, app: exports.label(pkg) };
    if (!out.byPkg[pkg]) out.byPkg[pkg] = out.byUid[uid].app;
  });
  return out;
};

// ---- Shizuku and dumpsys ----------------------------------------------------------------------------------

/** { installed, running, granted, ready, note } — ready: privileged commands can run. */
exports.shizuku = function () {
  var out = { installed: false, running: false, granted: false, ready: false, note: '' };
  try {
    var status = native('shizuku.status');
    out.installed = Boolean(status && status.installed);
    out.running = Boolean(status && status.running);
    out.granted = Boolean(status && status.granted);
  } catch (error) {
    out.note = 'Shizuku: ' + message(error);
    return out;
  }
  out.ready = out.running && out.granted;
  if (!out.installed) out.note = 'Shizuku не установлен';
  else if (!out.running) out.note = 'Shizuku не был запущен';
  else if (!out.granted) out.note = 'Shizuku не дал Axiko доступ';
  return out;
};

function quoted(path) {
  return "'" + String(path).replace(/'/g, "'\\''") + "'";
}

/** The first characters of a file, to see whether the command was refused. */
function headOf(abs, chars) {
  var reader = null;
  try {
    reader = new java.io.InputStreamReader(new java.io.FileInputStream(abs), 'UTF-8');
    var buffer = java.lang.reflect.Array.newInstance(java.lang.Character.TYPE, chars || 800);
    var read = reader.read(buffer, 0, buffer.length);
    return read > 0 ? String(new java.lang.String(buffer, 0, read)) : '';
  } catch (error) {
    return '';
  } finally {
    try { if (reader) reader.close(); } catch (error) { /* closed */ }
  }
}

function firstLine(text) {
  return String(text || '').split('\n').filter(function (line) { return line.trim(); })[0] || 'пустой вывод';
}

function externalDir() {
  try {
    var dir = context.getExternalFilesDir(null);
    return dir ? String(dir.getAbsolutePath()) : null;
  } catch (error) {
    return null;
  }
}

/**
 * Runs a dumpsys command and keeps its whole output in rawPath (data/phone-night/raw/…):
 * first as Axiko itself (if empower gave it DUMP), then through Shizuku into the app's external
 * files folder, then through Shizuku with the output captured — the beginning and the end only
 * when it is longer than the shell lets through (marked with CUT).
 * -> { ok, note, via, path, truncated }
 */
exports.dump = function (command, rawPath, s) {
  var abs = axiko.files.path(rawPath);
  new java.io.File(abs).getParentFile().mkdirs();
  var tried = [];
  var day = 864e5;
  if (LIVE.selfDump !== false || Date.now() - LIVE.selfDumpAt > day) {
    try {
      axiko.shell(command + ' > ' + quoted(abs) + ' 2>&1', { timeout: s.commandSeconds });
      var head = headOf(abs, 800);
      if (!parse.denied(head)) {
        LIVE.selfDump = true;
        return { ok: true, note: '', via: 'Axiko (DUMP)', path: rawPath, truncated: false };
      }
      LIVE.selfDump = false;
      LIVE.selfDumpAt = Date.now();
      tried.push('без Shizuku: ' + firstLine(head).slice(0, 120));
    } catch (error) {
      tried.push('без Shizuku: ' + message(error));
    }
  }
  var shizuku = exports.shizuku();
  if (!shizuku.ready) {
    try { axiko.files.remove(rawPath); } catch (error) { /* nothing there */ }
    return { ok: false, note: shizuku.note || 'нет прав ADB', via: '', path: null, truncated: false, tried: tried };
  }
  var name = String(rawPath).split('/').pop();
  var ext = externalDir();
  if (ext) {
    var tmp = ext + '/phone-night-' + name;
    try {
      axiko.shell(command + ' > ' + quoted(tmp) + ' 2>&1', { privileged: true, timeout: s.commandSeconds });
      var file = new java.io.File(tmp);
      if (file.exists() && file.canRead() && file.length() > 0) {
        java.nio.file.Files.copy(file.toPath(), new java.io.File(abs).toPath(), java.nio.file.StandardCopyOption.REPLACE_EXISTING);
        try { file['delete'](); } catch (error) { /* left behind */ }
        var copied = headOf(abs, 800);
        if (!parse.denied(copied)) return { ok: true, note: '', via: 'Shizuku', path: rawPath, truncated: false };
        tried.push('Shizuku: ' + firstLine(copied).slice(0, 120));
      } else {
        tried.push('Shizuku: файл в Android/data не читается');
      }
    } catch (error) {
      tried.push('Shizuku в файл: ' + message(error));
    }
  }
  try {
    var limit = s.historyHeadBytes + s.historyTailBytes;
    var spare = '/data/local/tmp/axiko-phone-night-' + name;
    var script = command + ' > ' + spare + ' 2>&1; n=$(wc -c < ' + spare + '); if [ "$n" -le ' + limit + ' ]; then cat ' + spare +
      '; else head -c ' + s.historyHeadBytes + ' ' + spare + '; echo; echo "' + CUT + '"; tail -c ' + s.historyTailBytes + ' ' + spare + '; fi; rm -f ' + spare;
    var result = axiko.shell(script, { privileged: true, timeout: s.commandSeconds });
    var out = String(result && result.out !== undefined ? result.out : '');
    if (parse.denied(out)) {
      tried.push('Shizuku: ' + firstLine(out).slice(0, 120));
      return { ok: false, note: 'dumpsys не ответил: ' + tried.join('; '), via: '', path: null, truncated: false };
    }
    axiko.files.write(rawPath, out);
    return { ok: true, note: out.indexOf(CUT) >= 0 ? 'вывод длинный — взяты начало и конец' : '', via: 'Shizuku', path: rawPath, truncated: out.indexOf(CUT) >= 0 };
  } catch (error) {
    tried.push('Shizuku: ' + message(error));
    return { ok: false, note: 'dumpsys не ответил: ' + tried.join('; '), via: '', path: null, truncated: false };
  }
};

/** Feeds a (possibly huge) file to fn line by line. -> number of lines, or -1 when it cannot be read. */
exports.eachLine = function (path, fn) {
  var reader = null;
  var count = 0;
  try {
    reader = new java.io.BufferedReader(new java.io.InputStreamReader(new java.io.FileInputStream(axiko.files.path(path)), 'UTF-8'), 65536);
    var line;
    while ((line = reader.readLine()) !== null) {
      fn(String(line));
      count++;
    }
    return count;
  } catch (error) {
    return -1;
  } finally {
    try { if (reader) reader.close(); } catch (error) { /* closed */ }
  }
};

/** Does dumpsys answer to Axiko itself (DUMP given by empower)? null — not tried yet. */
exports.selfDump = function () {
  return LIVE.selfDump;
};

/** A short command with its output (getprop, settings): { ok, out, note }. Privileged only when asked and possible. */
exports.run = function (command, privileged, s) {
  try {
    if (privileged && !exports.shizuku().ready) return { ok: false, out: '', note: exports.shizuku().note };
    var result = axiko.shell(command, { privileged: Boolean(privileged), timeout: Math.min(30, s.commandSeconds) });
    return { ok: Number(result.code) === 0, out: String(result.out || ''), note: '' };
  } catch (error) {
    return { ok: false, out: '', note: message(error) };
  }
};

// ---- access: what is switched on, the system screens --------------------------------------------------------

/** Is notification access on (the live journal sees notifications)? null when the shell cannot say. */
exports.noticesOn = function () {
  try {
    var status = native('sense.status');
    return Boolean(status && status.notices);
  } catch (error) {
    return null;
  }
};

/** Is Axiko exempt from battery optimisation (Doze)? */
exports.dozeExempt = function () {
  try {
    var power = context.getSystemService('power');
    return Boolean(power.isIgnoringBatteryOptimizations(String(context.getPackageName())));
  } catch (error) {
    return null;
  }
};

function startScreen(intent) {
  intent.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK);
  var from = host.activity || context;
  from.startActivity(intent);
  return true;
}

exports.openAppSettings = function (pkg) {
  return startScreen(new android.content.Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
    android.net.Uri.parse('package:' + String(pkg))));
};

exports.openUsageAccess = function () {
  return startScreen(new android.content.Intent(android.provider.Settings.ACTION_USAGE_ACCESS_SETTINGS));
};

exports.openBatterySettings = function () {
  return startScreen(new android.content.Intent(android.provider.Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS));
};

exports.openNotices = function () {
  try {
    native('sense.open', 'notices');
    return true;
  } catch (error) {
    return startScreen(new android.content.Intent(android.provider.Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS));
  }
};

/** Puts Axiko on the Doze white list through Shizuku, as the owner asked by the button. */
exports.allowDoze = function (s) {
  var pkg = String(context.getPackageName());
  var result = exports.run('cmd deviceidle whitelist +' + pkg, true, s);
  return { ok: result.ok, note: result.ok ? '' : result.note || firstLine(result.out) };
};
