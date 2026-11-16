// What the phone says about its night, read from dumpsys and the usage journal.
// Pure: no Android, no native — tested under node (tests/parse.test.js) on samples in samples/.
// The formats are not documented and change between Android versions and Samsung firmware, so
// every parser is tolerant: what it does not understand gives { ok: false, note }, never an error.

// ---- small pieces ---------------------------------------------------------------------------

/** '+1h02m03s123ms', '-12m3s', '0', '+1d2h' -> milliseconds (signed); null when it is not a duration. */
function duration(text) {
  var value = String(text || '').trim();
  if (value === '0') return 0;
  var match = /^([+-])?(?:(\d+)d)?(?:(\d+)h)?(?:(\d+)m(?!s))?(?:(\d+)s)?(?:(\d+)ms)?$/.exec(value);
  if (!match || !(match[2] || match[3] || match[4] || match[5] || match[6])) return null;
  var ms = Number(match[2] || 0) * 864e5 + Number(match[3] || 0) * 36e5 + Number(match[4] || 0) * 6e4 +
    Number(match[5] || 0) * 1e3 + Number(match[6] || 0);
  return match[1] === '-' ? -ms : ms;
}

exports.duration = duration;

/** A uid as dumpsys prints it: 'u0a123' -> 10123, 'u10a5' -> 1010005, 'u0i7' -> 99007, '1000' -> 1000. */
function uidOf(token) {
  var text = String(token || '').trim();
  if (/^\d+$/.test(text)) return Number(text);
  var match = /^u(\d+)([asi])(\d+)$/.exec(text);
  if (!match) return null;
  var user = Number(match[1]) * 100000;
  var id = Number(match[3]);
  if (match[2] === 'a') return user + 10000 + id;
  if (match[2] === 'i') return user + 99000 + id;
  return user + id;
}

exports.uidOf = uidOf;

/** What a uid is: an app, the system, tethering or removed apps. */
exports.uidGroup = function (uid) {
  if (uid === -5) return 'tethering';
  if (uid === -4) return 'removed';
  if (uid === null || uid === undefined || uid < 0) return 'unknown';
  var app = uid % 100000;
  if (app >= 99000) return 'isolated';
  if (app < 10000) return 'system';
  return 'app';
};

/** The command did not run as wanted: no DUMP permission, SELinux, no such service, nothing printed. */
exports.denied = function (text) {
  var value = String(text || '');
  if (value.replace(/\s+/g, '').length < 20) return true;
  return /Permission Denial|missing android\.permission\.DUMP|requires android\.permission\.DUMP|not allowed to dump|Can't find service|SecurityException|inaccessible or not found|Permission denied/i.test(value.slice(0, 600));
};

function lines(text) {
  return String(text || '').split(/\r?\n/);
}

// ---- UsageStatsManager event types -----------------------------------------------------------

var USAGE = {
  1: 'resumed', 2: 'paused', 12: 'notification', 15: 'screen_on', 16: 'screen_off', 17: 'keyguard_shown',
  18: 'unlock', 19: 'fg_start', 20: 'fg_stop', 23: 'stopped', 26: 'shutdown', 27: 'startup'
};

/** UsageEvents.Event type -> the kind the module uses; null for types it does not use. */
exports.usageKind = function (type) {
  return USAGE[Number(type)] || null;
};

// ---- dumpsys alarm ----------------------------------------------------------------------------

/**
 * Per-package statistics since boot: «u0a160:com.google.android.gms +2m3s running, 1234 wakeups:»
 * with sub-lines «+1m2s 345 wakes 456 alarms, last -12m:». Falls back to «Top Alarms» when the
 * per-package section is missing. -> { ok, note, elapsed, rtc, packages: { pkg: { uid, wakeups, alarms } } }
 */
exports.parseAlarm = function (text) {
  var out = { ok: false, note: '', elapsed: null, rtc: null, packages: {}, from: '' };
  if (exports.denied(text)) {
    out.note = 'dumpsys alarm не ответил';
    return out;
  }
  var all = lines(text);
  var section = '';
  var current = null;
  var top = {};
  for (var i = 0; i < all.length; i++) {
    var line = all[i];
    if (out.elapsed === null) {
      var elapsed = /nowELAPSED=(\d+)/.exec(line);
      if (elapsed) out.elapsed = Number(elapsed[1]);
    }
    if (out.rtc === null) {
      var rtc = /nowRTC=(\d+)/.exec(line);
      if (rtc) out.rtc = Number(rtc[1]);
    }
    var trimmed = line.trim();
    if (/^Alarm Stats:?$/i.test(trimmed)) { section = 'stats'; current = null; continue; }
    if (/^Top Alarms:?$/i.test(trimmed)) { section = 'top'; current = null; continue; }
    if (section && /^\S/.test(line) && trimmed) { section = ''; current = null; }
    if (section === 'stats') {
      var head = /^\s*(?:([u\d][\w]*):)?([A-Za-z][\w.]*)\s+\+\S+\s+running,\s+(\d+)\s+wakeups?(?:,\s+(\d+)\s+alarms?)?:?\s*$/.exec(line);
      if (head) {
        var pkg = head[2];
        current = out.packages[pkg] = out.packages[pkg] || { uid: head[1] ? uidOf(head[1]) : null, wakeups: 0, alarms: 0, ownAlarms: false };
        current.wakeups += Number(head[3]);
        if (head[4] !== undefined) { current.alarms += Number(head[4]); current.ownAlarms = true; }
        continue;
      }
      var sub = /^\s*\+\S+\s+(\d+)\s+wakes?\s+(\d+)\s+alarms?/.exec(line);
      if (sub && current && !current.ownAlarms) current.alarms += Number(sub[2]);
    } else if (section === 'top') {
      var entry = /^\s*\+\S+\s+running,\s+(\d+)\s+wakeups?,\s+(\d+)\s+alarms?:\s+(?:([u\d][\w]*):)?([A-Za-z][\w.]*)/.exec(line);
      if (entry) {
        var name = entry[4];
        top[name] = top[name] || { uid: entry[3] ? uidOf(entry[3]) : null, wakeups: 0, alarms: 0 };
        top[name].wakeups += Number(entry[1]);
        top[name].alarms += Number(entry[2]);
      }
    }
  }
  Object.keys(out.packages).forEach(function (pkg) { delete out.packages[pkg].ownAlarms; });
  if (Object.keys(out.packages).length) {
    out.ok = true;
    out.from = 'Alarm Stats';
  } else if (Object.keys(top).length) {
    out.ok = true;
    out.packages = top;
    out.from = 'Top Alarms';
    out.note = 'только «Top Alarms»: счёт по самым частым будильникам, не по всем';
  } else {
    out.note = 'в выводе dumpsys alarm нет статистики по приложениям';
  }
  return out;
};

/**
 * Wake-ups between two snapshots. A reboot in between (the uptime fell) makes the difference
 * meaningless: then ok is false and rebooted true.
 * -> { ok, note, rebooted, total, packages: [{ pkg, uid, wakeups, alarms }] } (most wake-ups first)
 */
exports.alarmDiff = function (evening, morning) {
  var out = { ok: false, note: '', rebooted: false, total: 0, resets: 0, packages: [] };
  if (!evening || !evening.ok) { out.note = 'нет вечернего снимка будильников'; return out; }
  if (!morning || !morning.ok) { out.note = 'нет утреннего снимка будильников'; return out; }
  if (evening.elapsed !== null && morning.elapsed !== null && morning.elapsed < evening.elapsed) {
    out.rebooted = true;
    out.note = 'телефон перезагружался между снимками — разница будильников недействительна';
    return out;
  }
  Object.keys(morning.packages).forEach(function (pkg) {
    var now = morning.packages[pkg];
    var was = evening.packages[pkg] || { wakeups: 0, alarms: 0 };
    var wakeups = now.wakeups - was.wakeups;
    var alarms = now.alarms - was.alarms;
    if (wakeups < 0 || alarms < 0) { out.resets++; return; }
    if (wakeups === 0 && alarms === 0) return;
    out.packages.push({ pkg: pkg, uid: now.uid !== null && now.uid !== undefined ? now.uid : was.uid, wakeups: wakeups, alarms: alarms });
    out.total += wakeups;
  });
  out.packages.sort(function (a, b) { return b.wakeups - a.wakeups || b.alarms - a.alarms; });
  out.ok = true;
  if (out.resets) out.note = 'у ' + out.resets + ' приложений счётчик сбросился — они не учтены';
  return out;
};

// ---- dumpsys batterystats --history -------------------------------------------------------------

function resetTime(text) {
  var match = /(\d{4})-(\d{2})-(\d{2})-(\d{2})-(\d{2})-(\d{2})/.exec(text);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]), Number(match[6])).getTime();
}

var TOKEN = /([+-]?[A-Za-z_][\w.]*)(?:=((?:[^\s"]|"[^"]*")+))?/g;

function uidValue(value) {
  var match = /^([^:"]+):"([\s\S]*)"$/.exec(value || '');
  if (!match) return null;
  return { uid: uidOf(match[1]), tag: match[2] };
}

/**
 * A reader of the battery history fed line by line (the output may be megabytes).
 * opts: { from, to } — keep events in this range (ms); { year } for the absolute-time format.
 * result() -> { ok, note, based, points, plugged, screen, doze, wakeReasons, wakeups,
 *              alarms, jobs, wakelocks, boots, levelAt(from/to) }
 */
exports.historyReader = function (opts) {
  opts = opts || {};
  var from = opts.from || 0;
  var to = opts.to || 8.64e15;
  var state = {
    seen: 0, items: 0, base: null, baseOffset: 0, now: null, level: null, plugged: null, screen: null, doze: 'off',
    dozeSince: null, plugSince: null
  };
  var out = {
    ok: false, note: '', based: false, points: [], plugged: [], screen: [], doze: [], wakeReasons: {}, wakeups: 0,
    alarms: [], jobs: {}, wakelocks: {}, boots: [], levelAtFrom: null, levelAtTo: null, first: null, last: null
  };
  function inside(at) { return at !== null && at >= from && at <= to; }
  function clip(a, b) { return { from: Math.max(a, from), to: Math.min(b, to) }; }
  function closeDoze(at) {
    if (state.doze !== 'off' && state.dozeSince !== null && at > from && state.dozeSince < to) {
      var part = clip(state.dozeSince, at);
      if (part.to > part.from) out.doze.push({ from: part.from, to: part.to, mode: state.doze });
    }
  }
  function closePlug(at) {
    if (state.plugged && state.plugSince !== null && at > from && state.plugSince < to) {
      var part = clip(state.plugSince, at);
      if (part.to > part.from) out.plugged.push(part);
    }
  }
  function setLevel(at, level) {
    if (state.level === level) return;
    if (at !== null && at <= from) out.levelAtFrom = level;
    if (inside(at)) {
      if (out.levelAtFrom === null) out.levelAtFrom = state.level !== null ? state.level : level;
      out.points.push({ at: at, level: level });
      out.levelAtTo = level;
    }
    state.level = level;
  }
  function setPlug(at, on) {
    if (state.plugged === on) return;
    if (on) state.plugSince = at;
    else closePlug(at);
    state.plugged = on;
  }
  function setDoze(at, mode) {
    if (state.doze === mode) return;
    closeDoze(at);
    state.doze = mode;
    state.dozeSince = at;
  }
  function item(at, rest) {
    state.items++;
    if (at !== null) {
      if (out.first === null) out.first = at;
      out.last = at;
      state.now = at;
    }
    var words = rest.trim();
    var level = /^(\d{3})\b/.exec(words);
    if (level) {
      setLevel(at, Number(level[1]));
      words = words.slice(3);
    }
    if (/^\s*START\b/.test(words) || /^\s*SHUTDOWN\b/.test(words)) {
      if (inside(at)) out.boots.push({ at: at, kind: /SHUTDOWN/.test(words) ? 'shutdown' : 'start' });
      return;
    }
    TOKEN.lastIndex = 0;
    var match;
    while ((match = TOKEN.exec(words)) !== null) {
      var key = match[1];
      var value = match[2] === undefined ? null : match[2];
      var sign = key.charAt(0) === '+' || key.charAt(0) === '-' ? key.charAt(0) : '';
      var name = sign ? key.slice(1) : key;
      if (name === 'screen' && sign) {
        var on = sign === '+';
        if (state.screen !== on && inside(at)) out.screen.push({ at: at, on: on });
        state.screen = on;
      } else if (name === 'plugged' && sign) {
        setPlug(at, sign === '+');
      } else if (name === 'plug' && value !== null) {
        setPlug(at, value !== 'none');
      } else if (name === 'status' && value !== null && state.plugged === null) {
        setPlug(at, value === 'charging' || value === 'full');
      } else if (name === 'device_idle') {
        if (value !== null) setDoze(at, value === 'full' || value === 'light' ? value : 'off');
        else if (sign) setDoze(at, sign === '+' ? 'full' : 'off');
      } else if ((name === 'device_light_idle' || name === 'light_idle') && sign) {
        if (sign === '+' && state.doze === 'off') setDoze(at, 'light');
        if (sign === '-' && state.doze === 'light') setDoze(at, 'off');
      } else if (name === 'wake_reason' && value !== null) {
        if (inside(at)) {
          var reason = /"([\s\S]*)"/.exec(value);
          var label = (reason ? reason[1] : value).replace(/^\d+:/, '').trim() || '?';
          out.wakeReasons[label] = (out.wakeReasons[label] || 0) + 1;
          out.wakeups++;
        }
      } else if ((name === 'alarm' || name === 'wakeupap') && value !== null && sign !== '-') {
        var alarm = uidValue(value);
        if (alarm && inside(at)) out.alarms.push({ at: at, uid: alarm.uid, tag: alarm.tag });
      } else if (name === 'job' && value !== null && sign === '+') {
        var job = uidValue(value);
        if (job && inside(at)) out.jobs[job.uid] = (out.jobs[job.uid] || 0) + 1;
      } else if ((name === 'wake_lock' || name === 'longwake') && value !== null && sign === '+') {
        var lock = uidValue(value);
        if (lock && inside(at)) out.wakelocks[lock.uid] = (out.wakelocks[lock.uid] || 0) + 1;
      }
    }
  }
  return {
    line: function (text) {
      state.seen++;
      var raw = String(text);
      // Absolute format: «11-14 01:12:02.345 (2) 087 …»
      var absolute = /^\s*(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})\.(\d{3})\s+\((\d+)\)\s?(.*)$/.exec(raw);
      if (absolute) {
        var year = opts.year || new Date(to < 8e15 ? to : Date.now()).getFullYear();
        var at = new Date(year, Number(absolute[1]) - 1, Number(absolute[2]), Number(absolute[3]), Number(absolute[4]),
          Number(absolute[5]), Number(absolute[6])).getTime();
        if (to < 8e15 && at > to + 864e5) at = new Date(year - 1, Number(absolute[1]) - 1, Number(absolute[2]), Number(absolute[3]),
          Number(absolute[4]), Number(absolute[5]), Number(absolute[6])).getTime();
        state.based = true;
        out.based = true;
        item(at, absolute[8]);
        return;
      }
      var relative = /^\s*(0|[+-][0-9dhms]+)\s+\((\d+)\)\s?(.*)$/.exec(raw);
      if (!relative) return;
      var offset = duration(relative[1]);
      if (offset === null) return;
      var rest = relative[3];
      var reset = /(?:RESET:)?TIME:\s*(\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2})/.exec(rest);
      if (reset) {
        state.base = resetTime(reset[1]);
        state.baseOffset = offset;
        out.based = true;
        return;
      }
      var when = state.base === null ? null : state.base + (offset - state.baseOffset);
      item(when, rest);
    },
    result: function () {
      var end = Math.min(to, state.now === null ? to : Math.max(state.now, from));
      closeDoze(end);
      closePlug(end);
      if (out.levelAtTo === null) out.levelAtTo = state.level !== null && state.now !== null && state.now >= from ? state.level : out.levelAtFrom;
      if (!state.items) out.note = 'в выводе нет ленты батареи';
      else if (!out.based) out.note = 'в ленте нет отметки времени (RESET:TIME) — время событий неизвестно';
      else if (out.last !== null && out.last < from) out.note = 'лента батареи кончается до начала ночи';
      else out.ok = true;
      return out;
    }
  };
};

/** The same reader over a whole text. */
exports.parseHistory = function (text, opts) {
  if (exports.denied(text)) return { ok: false, note: 'dumpsys batterystats не ответил' };
  var reader = exports.historyReader(opts);
  lines(text).forEach(reader.line);
  return reader.result();
};

// ---- dumpsys batterystats --checkin -------------------------------------------------------------

/**
 * The checkin CSV: «9,<uid>,l,<type>,…», counters since the last full charge.
 * -> { ok, note, batteryRealtime, names: { uid: pkg }, uids: { uid: { wlMs, wua, cpuMs, mah } }, other: { label: mah } }
 */
exports.parseCheckin = function (text) {
  var out = { ok: false, note: '', batteryRealtime: null, names: {}, uids: {}, other: {} };
  if (exports.denied(text)) { out.note = 'dumpsys batterystats --checkin не ответил'; return out; }
  var count = 0;
  function uid(id) {
    out.uids[id] = out.uids[id] || { wlMs: 0, wua: 0, cpuMs: 0, mah: 0 };
    return out.uids[id];
  }
  lines(text).forEach(function (line) {
    var f = line.trim().split(',');
    if (f.length < 5 || !/^\d+$/.test(f[0])) return;
    var id = Number(f[1]);
    var category = f[2];
    var type = f[3];
    if (category === 'i' && type === 'uid' && f.length >= 6) {
      out.names[Number(f[4])] = f[5];
      return;
    }
    if (category !== 'l') return;
    count++;
    if (type === 'bt') {
      var realtime = Number(f[5]);
      if (isFinite(realtime)) out.batteryRealtime = realtime;
    } else if (type === 'wl') {
      var p = f.indexOf('p', 5);
      var partial = p > 0 ? Number(f[p - 1]) : NaN;
      if (isFinite(partial)) uid(id).wlMs += partial;
    } else if (type === 'wua') {
      var last = Number(f[f.length - 1]);
      if (isFinite(last)) uid(id).wua += last;
    } else if (type === 'cpu') {
      var user = Number(f[4]);
      var system = Number(f[5]);
      if (isFinite(user) && isFinite(system)) uid(id).cpuMs += user + system;
    } else if (type === 'pwi') {
      var mah = Number(f[5]);
      if (!isFinite(mah)) return;
      if (f[4] === 'uid') uid(id).mah += mah;
      else out.other[f[4]] = (out.other[f[4]] || 0) + mah;
    }
  });
  if (!count) out.note = 'в выводе нет строк checkin';
  else out.ok = true;
  return out;
};

/**
 * Evening–morning difference. Counters reset when the phone comes off the charger full: then
 * morning values are smaller and the difference is not used (reset: true).
 * -> { ok, note, reset, uids: [{ uid, wlMs, wua, cpuMs, mah }] }
 */
exports.checkinDiff = function (evening, morning) {
  var out = { ok: false, note: '', reset: false, uids: [] };
  if (!evening || !evening.ok) { out.note = 'нет вечернего снимка batterystats'; return out; }
  if (!morning || !morning.ok) { out.note = 'нет утреннего снимка batterystats'; return out; }
  if (evening.batteryRealtime !== null && morning.batteryRealtime !== null && morning.batteryRealtime < evening.batteryRealtime) {
    out.reset = true;
  }
  var fields = ['wlMs', 'wua', 'cpuMs', 'mah'];
  Object.keys(morning.uids).forEach(function (id) {
    var now = morning.uids[id];
    var was = evening.uids[id] || { wlMs: 0, wua: 0, cpuMs: 0, mah: 0 };
    var row = { uid: Number(id) };
    var any = false;
    fields.forEach(function (field) {
      var delta = now[field] - was[field];
      if (delta < -0.0001) out.reset = true;
      row[field] = Math.max(0, Math.round(delta * 100) / 100);
      if (row[field] > 0) any = true;
    });
    if (any) out.uids.push(row);
  });
  if (out.reset) {
    out.uids = [];
    out.note = 'счётчики batterystats обнулились за ночь (отключение от зарядки полным) — разница не используется';
    return out;
  }
  out.ok = true;
  return out;
};

// ---- dumpsys deviceidle -------------------------------------------------------------------------

/** -> { ok, note, state, lightState, user: [pkg], system: [pkg] } */
exports.parseDeviceIdle = function (text) {
  var out = { ok: false, note: '', state: null, lightState: null, user: [], system: [] };
  if (exports.denied(text)) { out.note = 'dumpsys deviceidle не ответил'; return out; }
  var section = null;
  lines(text).forEach(function (line) {
    var trimmed = line.trim();
    var state = /\bmState=(\w+)/.exec(line);
    if (state) out.state = state[1];
    var light = /\bmLightState=(\w+)/.exec(line);
    if (light) out.lightState = light[1];
    // «(except idle)» lists are spared app standby only, not Doze: they are not «exempt from sleep».
    if (/^(?:Whitelist|Allowlist) user apps:?$/i.test(trimmed)) { section = 'user'; return; }
    if (/^(?:Whitelist|Allowlist) system apps:?$/i.test(trimmed)) { section = 'system'; return; }
    if (/:\s*$/.test(trimmed) || !trimmed) { section = null; return; }
    if (section && /^[A-Za-z][\w.]*$/.test(trimmed) && /^\s{3,}/.test(line)) {
      var list = out[section];
      if (list.indexOf(trimmed) < 0) list.push(trimmed);
    } else if (section && !/^\s{3,}/.test(line)) {
      section = null;
    }
  });
  out.ok = out.state !== null || out.user.length > 0 || out.system.length > 0;
  if (!out.ok) out.note = 'в выводе dumpsys deviceidle нет состояния и списков';
  return out;
};

// ---- dumpsys jobscheduler -----------------------------------------------------------------------

/**
 * Background jobs that ran, from «Recently completed jobs:» (offset line, then «#u0a160/12 pkg/.Svc»)
 * or the older «Job history:» («-1h2m START: #u0a107/1 pkg/…»). Offsets are from `now`.
 * -> { ok, note, jobs: [{ at, uid, pkg, name }] }
 */
exports.parseJobs = function (text, now) {
  var out = { ok: false, note: '', jobs: [] };
  if (exports.denied(text)) { out.note = 'dumpsys jobscheduler не ответил'; return out; }
  var section = null;
  var indent = 0;
  var offset = null;
  var found = false;
  lines(text).forEach(function (line) {
    var trimmed = line.trim();
    var depth = line.length - line.replace(/^\s+/, '').length;
    if (/^Recently completed jobs:?$/i.test(trimmed)) { section = 'recent'; indent = depth; found = true; offset = null; return; }
    if (/^Job history:?$/i.test(trimmed)) { section = 'history'; indent = depth; found = true; offset = null; return; }
    if (!section) return;
    // The next section starts at the header's own depth.
    if (trimmed && depth <= indent) { section = null; return; }
    var lead = /^\s*([+-][0-9dhms]+)\s*:?(?:\s|$)/.exec(line);
    if (lead) {
      var value = duration(lead[1]);
      if (value !== null) offset = value;
    }
    var job = /#(u\d+[asi]\d+|\d+)\/-?\d+\s+(\S+)/.exec(line);
    if (!job || offset === null) return;
    if (section === 'history' && !/START/.test(line)) return;
    var name = job[2];
    var pkg = /^([A-Za-z][\w.]*)\//.exec(name);
    out.jobs.push({ at: now + offset, uid: uidOf(job[1]), pkg: pkg ? pkg[1] : null, name: name });
    if (section === 'recent') offset = null;
  });
  if (!found) out.note = 'в выводе dumpsys jobscheduler нет списка выполненных заданий';
  else out.ok = true;
  return out;
};

// ---- the reason of the last boot and Samsung's automatic restart -------------------------------

/** getprop lines -> the reason of the last boot or null. */
exports.bootReason = function (text) {
  var found = null;
  lines(text).forEach(function (line) {
    var value = line.trim().replace(/^\[|\]$/g, '');
    if (!found && value && !/^\s*$/.test(value) && !/not found|denied/i.test(value)) found = value.split(/\s+/)[0];
  });
  return found;
};

/** What kind of boot a reason string means: 'failure', 'update', 'manual', 'planned', 'clean' or 'unknown'. */
exports.classifyBoot = function (reason, cleanShutdown, autoRestartOn) {
  var value = String(reason || '').toLowerCase();
  if (/panic|watchdog|wdog|crash|hw_reset|hard|abnormal|oom|thermal|undervoltage|brownout|fault/.test(value)) return 'failure';
  if (/ota|update/.test(value)) return 'update';
  if (/userrequested|shell|adb|recovery|user/.test(value)) return 'manual';
  if (autoRestartOn && (cleanShutdown || /reboot|restart/.test(value))) return 'planned';
  if (cleanShutdown) return 'clean';
  return 'unknown';
};

/** «settings list …» lines filtered for restarts -> { found, on, keys: ['auto_restart=1'] }. */
exports.autoRestart = function (text) {
  var out = { found: false, on: false, keys: [] };
  lines(text).forEach(function (line) {
    var match = /^\s*([\w.]*(?:auto_?restart|auto_?reboot|autoreboot|autorestart)[\w.]*)=(.*)$/i.exec(line);
    if (!match) return;
    out.found = true;
    out.keys.push(match[1] + '=' + match[2].trim());
    if (/^(1|true|on)$/i.test(match[2].trim())) out.on = true;
  });
  return out;
};
